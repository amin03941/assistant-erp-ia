import { NextRequest, NextResponse } from "next/server";
import { analyserQuestion } from "@/lib/llm";
import { synthetiser } from "@/lib/synthese";
import { construireRequete, ErreurValidation } from "@/lib/validateur";
import { dbReadOnly } from "@/lib/db";
import { getSession } from "@/lib/session";
import * as conv from "@/lib/conversations";
import { CATALOGUE } from "@/lib/catalogue";
import { clarificationEnAttente, traiterEcriture } from "@/lib/ecriture";
import { resoudreFiltres, reporterSujet, sujetsPrecedents } from "@/lib/entites";

export async function POST(req: NextRequest) {
    const debut = Date.now();
    const { question, conversationId } = await req.json();

    if (typeof question !== "string" || question.trim().length === 0) {
        return NextResponse.json({ erreur: "Question vide." }, { status: 400 });
    }
    if (question.length > 1000) {
        return NextResponse.json({ erreur: "Question trop longue." }, { status: 400 });
    }

    let session;
    try {
        session = await getSession();
    } catch {
        return NextResponse.json({ erreur: "Session expirée. Reconnectez-vous." }, { status: 401 });
    }

    // Conversation : création, ou vérification que celle fournie appartient bien à l'utilisateur.
    let convId: string = conversationId;
    if (!convId) {
        convId = await conv.creerConversation(session.userId, question);
    } else if (!(await conv.verifierProprietaire(convId, session.userId))) {
        return NextResponse.json({ erreur: "Conversation introuvable." }, { status: 403 });
    }

    const msgUser = await conv.ajouterMessage(convId, "USER", question);
    const reqId = await conv.ouvrirRequete({
        conversationId: convId, userMessageId: msgUser, userId: session.userId, role: session.role,
    });

    const enAttente = await clarificationEnAttente(convId, session.userId);
    if (enAttente) {
        const r = await traiterEcriture({
            question,
            role: session.role,
            userId: session.userId,
            conversationId: convId,
            userMessageId: msgUser,
            reprise: enAttente,
        });
        await conv.cloturerRequete(reqId, { status: "EXECUTED", duration_ms: Date.now() - debut });
        return NextResponse.json({ conversationId: convId, ...r });
    }

    const refuser = async (raison: string) => {
        const m = await conv.ajouterMessage(convId, "ASSISTANT", raison);
        await conv.cloturerRequete(reqId, {
            status: "REFUSED", refusal_reason: raison, response_message_id: m,
            duration_ms: Date.now() - debut,
        });
        return NextResponse.json({ conversationId: convId, texte: raison, refus: true });
    };

    try {
        const tours = await conv.historique(convId);
        const refs = await conv.dernieresReferences(convId);

        const brute = await analyserQuestion(question, session.role, tours, refs);
        const dernier = tours[tours.length - 1];
        const spec = conv.fusionner(dernier?.query_spec, brute);

        // Résolution des entités et report du sujet, avant toute exécution.
        let noteSujet: string | null = null;
        if (spec.type !== "refus" && spec.type !== "ecriture" && spec.ok && spec.view) {
            const report = reporterSujet(question, spec.view, spec.filters ?? [], sujetsPrecedents(tours));
            noteSujet = report.applique;

            const r = await resoudreFiltres(dbReadOnly, spec.view, report.filtres, session.role);
            if (r.etat !== "ok") {
                const m = await conv.ajouterMessage(convId, "ASSISTANT", r.message);
                await conv.cloturerRequete(reqId, {
                    status: "REFUSED", refusal_reason: r.message,
                    response_message_id: m, duration_ms: Date.now() - debut,
                });
                return NextResponse.json({
                    conversationId: convId, texte: r.message, refus: true, choix: r.choix,
                });
            }

            spec.filters = r.filtres;
            spec.sujets = { ...report.sujets, ...r.sujets };
        }

        await conv.cloturerRequete(reqId, { query_spec: spec, intent: spec.view ?? spec.action?.code ?? null });

        if (spec.type === "refus") {
            return await refuser(spec.raison ?? spec.refusal_reason ?? "Demande hors périmètre.");
        }

        if (spec.type === "ecriture") {
            const r = await traiterEcriture({
                question,
                role: session.role,
                userId: session.userId,
                conversationId: convId,
                userMessageId: msgUser,
                code: spec.action?.code,
            });
            await conv.cloturerRequete(reqId, { status: "EXECUTED", duration_ms: Date.now() - debut });
            return NextResponse.json({ conversationId: convId, ...r });
        }

        if (!spec.ok) return await refuser(spec.raison ?? "Demande hors périmètre.");

        let sql: string, params: any[];
        try {
            ({ sql, params } = construireRequete(spec, session.role));
        } catch (e) {
            if (e instanceof ErreurValidation) return await refuser(e.message);
            throw e;
        }

        const res = await dbReadOnly.query(sql, params);
        const brut = synthetiser(spec, res.rows);
        const texte = noteSujet ? `${brut}\n\n(pour ${noteSujet})` : brut;

        const vue = CATALOGUE[spec.view];
        const libelles = Object.fromEntries(
            Object.entries(vue?.colonnes ?? {}).map(([k, c]) => [k, c.libelle])
        );

        const msgAssist = await conv.ajouterMessage(convId, "ASSISTANT", texte, {
            lignes: res.rows, libelles, sql,
        });
        await conv.cloturerRequete(reqId, {
            status: "EXECUTED", generated_sql: sql, response_message_id: msgAssist,
            row_count: res.rowCount, duration_ms: Date.now() - debut, executed_at: new Date(),
        });

        return NextResponse.json({ conversationId: convId, texte, lignes: res.rows, libelles, sql });

    } catch (e) {
        console.error(e);
        await conv.cloturerRequete(reqId, {
            status: "FAILED", error_message: String(e).slice(0, 500),
            duration_ms: Date.now() - debut,
        });
        return NextResponse.json(
            { conversationId: convId, erreur: "Traitement impossible." },
            { status: 500 }
        );
    }
}
