import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import * as conv from "@/lib/conversations";

export async function GET(req: NextRequest) {
    let session;
    try {
        session = await getSession();
    } catch {
        return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");

    // Sans identifiant : la liste. Avec : le contenu, après vérification du propriétaire.
    if (!id) {
        return NextResponse.json({ conversations: await conv.listerConversations(session.userId) });
    }

    if (!(await conv.verifierProprietaire(id, session.userId))) {
        return NextResponse.json({ erreur: "Conversation introuvable." }, { status: 403 });
    }

    return NextResponse.json({ messages: await conv.messagesDe(id) });
}
