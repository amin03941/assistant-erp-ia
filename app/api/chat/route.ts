import { NextRequest, NextResponse } from "next/server";
import { analyserQuestion } from "@/lib/llm";
import { expliquer, synthetiser } from "@/lib/synthese";
import { construireRequete, ErreurValidation } from "@/lib/validateur";
import { dbReadOnly } from "@/lib/db";
import { getSession, type Session } from "@/lib/session";
import * as conv from "@/lib/conversations";
import { CATALOGUE } from "@/lib/catalogue";
import { clarificationEnAttente, traiterEcriture } from "@/lib/ecriture";
import { repriseExplicite, resoudreFiltres, reporterSujet, sujetsPrecedents } from "@/lib/entites";
import { repondreConversation } from "@/lib/dialogue";
import { appliquerPeriode } from "@/lib/periodes";
import { donneesGraphique } from "@/lib/graphique";

/**
 * Traitement d'une question, de bout en bout.
 *
 * Deux formes de réponse, même traitement :
 *  - JSON classique (par défaut) ;
 *  - flux NDJSON quand le client envoie « Accept: application/x-ndjson » :
 *    une ligne par étape franchie ({"etape":"comprehension"}…), puis le
 *    résultat ({"fin":{…},"status":200}). L'interface affiche ainsi où en est
 *    le traitement — compréhension par le modèle, vérification en base,
 *    exécution — au lieu d'une attente muette.
 */

export type Etape = "comprehension" | "verification" | "execution" | "redaction" | "preparation";

type Resultat = { corps: Record<string, unknown>; status?: number };

async function traiter(
    corps: { question?: unknown; conversationId?: unknown },
    etape: (e: Etape) => void,
): Promise<Resultat> {
    const debut = Date.now();
    const { question, conversationId } = corps;

    if (typeof question !== "string" || question.trim().length === 0) {
        return { corps: { erreur: "Question vide." }, status: 400 };
    }
    if (question.length > 1000) {
        return { corps: { erreur: "Question trop longue." }, status: 400 };
    }

    let session: Session;
    try {
        session = await getSession();
    } catch {
        return { corps: { erreur: "Session expirée. Reconnectez-vous." }, status: 401 };
    }

    // Conversation : création, ou vérification que celle fournie appartient bien à l'utilisateur.
    let convId = typeof conversationId === "string" ? conversationId : "";
    if (!convId) {
        convId = await conv.creerConversation(session.userId, question);
    } else if (!(await conv.verifierProprietaire(convId, session.userId))) {
        return { corps: { erreur: "Conversation introuvable." }, status: 403 };
    }

    const msgUser = await conv.ajouterMessage(convId, "USER", question);
    const reqId = await conv.ouvrirRequete({
        conversationId: convId, userMessageId: msgUser, userId: session.userId, role: session.role,
    });

    const refuser = async (raison: string, extra: Record<string, unknown> = {}, spec?: unknown) => {
        const m = await conv.ajouterMessage(convId, "ASSISTANT", raison);
        await conv.cloturerRequete(reqId, {
            status: "REFUSED", refusal_reason: raison, response_message_id: m,
            duration_ms: Date.now() - debut,
            // La spécification est conservée même refusée : elle dit ce que le modèle avait compris.
            ...(spec ? { query_spec: spec } : {}),
        });
        return { corps: { conversationId: convId, texte: raison, refus: true, ...extra } };
    };

    try {
        const enAttente = await clarificationEnAttente(convId, session.userId);
        if (enAttente) {
            etape("preparation");
            const r = await traiterEcriture({
                question,
                role: session.role,
                userId: session.userId,
                conversationId: convId,
                userMessageId: msgUser,
                reprise: enAttente,
            });
            await conv.cloturerRequete(reqId, { status: "EXECUTED", duration_ms: Date.now() - debut });
            return { corps: { conversationId: convId, ...r } };
        }

        const tours = await conv.historique(convId);
        const refs = await conv.dernieresReferences(convId);

        etape("comprehension");
        const brute = await analyserQuestion(question, session.role, tours, refs);
        const dernier = tours[tours.length - 1];
        const spec = conv.fusionner(dernier?.query_spec, brute);

        // Période, reprise du sujet, résolution des noms : avant toute exécution.
        let noteSujet: string | null = null;
        if (spec.type !== "refus" && spec.type !== "ecriture" && spec.ok && spec.view) {
            etape("verification");

            // Période relative : le modèle l'a nommée, le code en calcule les dates.
            const periode = appliquerPeriode(spec);
            if (!periode.ok) return await refuser(periode.message, {}, spec);

            const reprise = spec.reprise === true || repriseExplicite(question);
            const report = reporterSujet(reprise, spec.view, spec.filters ?? [], sujetsPrecedents(tours));
            noteSujet = report.applique;

            const r = await resoudreFiltres(dbReadOnly, spec.view, report.filtres, session.role);
            if (r.etat !== "ok") return await refuser(r.message, { choix: r.choix }, spec);

            spec.filters = r.filtres;
            spec.sujets = { ...report.sujets, ...r.sujets };
        }

        await conv.cloturerRequete(reqId, {
            query_spec: spec,
            intent: spec.view ?? spec.action?.code ?? (spec.type === "conversation" ? "CONVERSATION" : null),
        });

        if (spec.type === "conversation") {
            const texte = repondreConversation(spec, session.role);
            const m = await conv.ajouterMessage(convId, "ASSISTANT", texte);
            await conv.cloturerRequete(reqId, {
                status: "EXECUTED", response_message_id: m,
                duration_ms: Date.now() - debut, executed_at: new Date(),
            });
            return { corps: { conversationId: convId, texte } };
        }

        if (spec.type === "refus") {
            return await refuser(spec.raison ?? spec.refusal_reason ?? "Demande hors périmètre.");
        }

        if (spec.type === "ecriture") {
            etape("preparation");
            const r = await traiterEcriture({
                question,
                role: session.role,
                userId: session.userId,
                conversationId: convId,
                userMessageId: msgUser,
                code: spec.action?.code,
            });
            await conv.cloturerRequete(reqId, { status: "EXECUTED", duration_ms: Date.now() - debut });
            return { corps: { conversationId: convId, ...r } };
        }

        if (!spec.ok) return await refuser(spec.raison ?? "Demande hors périmètre.");

        let sql: string, params: unknown[];
        try {
            ({ sql, params } = construireRequete(spec, session.role));
        } catch (e) {
            if (e instanceof ErreurValidation) return await refuser(e.message, {}, spec);
            throw e;
        }

        etape("execution");
        const res = await dbReadOnly.query(sql, params);

        etape("redaction");
        const brut = synthetiser(spec, res.rows);
        const texte = noteSujet ? `${brut}\n\n(pour ${noteSujet})` : brut;

        const vue = CATALOGUE[spec.view];
        const libelles = Object.fromEntries(
            Object.entries(vue?.colonnes ?? {}).map(([k, c]) => [k, c.libelle])
        );
        // « Comment j'ai compris » et graphique : enregistrés avec le message,
        // pour être retrouvés quand on rouvre la conversation.
        const comprehension = expliquer(spec, noteSujet);
        const graphique = donneesGraphique(spec, res.rows);
        const details = { lignes: res.rows, libelles, sql, params, comprehension, graphique };

        const msgAssist = await conv.ajouterMessage(convId, "ASSISTANT", texte, details);
        await conv.cloturerRequete(reqId, {
            status: "EXECUTED", generated_sql: sql, response_message_id: msgAssist,
            row_count: res.rowCount, duration_ms: Date.now() - debut, executed_at: new Date(),
        });

        return { corps: { conversationId: convId, texte, ...details } };

    } catch (e) {
        console.error(e);
        await conv.cloturerRequete(reqId, {
            status: "FAILED", error_message: String(e).slice(0, 500),
            duration_ms: Date.now() - debut,
        });
        return { corps: { conversationId: convId, erreur: "Traitement impossible." }, status: 500 };
    }
}

export async function POST(req: NextRequest) {
    let corps: { question?: unknown; conversationId?: unknown };
    try {
        corps = await req.json();
    } catch {
        return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
    }

    if (!(req.headers.get("accept") ?? "").includes("application/x-ndjson")) {
        const r = await traiter(corps, () => { });
        return NextResponse.json(r.corps, { status: r.status ?? 200 });
    }

    const encodeur = new TextEncoder();
    const flux = new ReadableStream<Uint8Array>({
        async start(controleur) {
            const envoyer = (o: unknown) => controleur.enqueue(encodeur.encode(`${JSON.stringify(o)}\n`));
            try {
                const r = await traiter(corps, (etape) => envoyer({ etape }));
                envoyer({ fin: r.corps, status: r.status ?? 200 });
            } catch (e) {
                console.error(e);
                envoyer({ fin: { erreur: "Traitement impossible." }, status: 500 });
            } finally {
                controleur.close();
            }
        },
    });

    return new Response(flux, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
