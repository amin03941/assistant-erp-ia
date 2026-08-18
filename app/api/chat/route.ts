import { NextRequest, NextResponse } from "next/server";
import { analyserQuestion, redigerReponse } from "@/lib/llm";
import { construireRequete, ErreurValidation } from "@/lib/validateur";
import { dbReadOnly } from "@/lib/db";
import { getSession } from "@/lib/session";
import * as conv from "@/lib/conversations";

export async function POST(req: NextRequest) {
    const debut = Date.now();
    const { question, conversationId } = await req.json();

    if (typeof question !== "string" || question.trim().length === 0) {
        return NextResponse.json({ erreur: "Question vide." }, { status: 400 });
    }
    if (question.length > 1000) {
        return NextResponse.json({ erreur: "Question trop longue." }, { status: 400 });
    }

    const session = await getSession();

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

        await conv.cloturerRequete(reqId, { query_spec: spec, intent: spec.view ?? null });

        if (!spec.ok) return await refuser(spec.raison ?? "Demande hors périmètre.");

        let sql: string, params: any[];
        try {
            ({ sql, params } = construireRequete(spec, session.role));
        } catch (e) {
            if (e instanceof ErreurValidation) return await refuser(e.message);
            throw e;
        }

        const res = await dbReadOnly.query(sql, params);
        const texte = await redigerReponse(question, res.rows);

        const msgAssist = await conv.ajouterMessage(convId, "ASSISTANT", texte, {
            lignes: res.rows, sql,
        });
        await conv.cloturerRequete(reqId, {
            status: "EXECUTED", generated_sql: sql, response_message_id: msgAssist,
            row_count: res.rowCount, duration_ms: Date.now() - debut, executed_at: new Date(),
        });

        return NextResponse.json({ conversationId: convId, texte, lignes: res.rows, sql });

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
