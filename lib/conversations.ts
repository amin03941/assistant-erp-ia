import { db } from "./db";

export async function creerConversation(userId: string, titre: string) {
    const r = await db.query(
        "INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id",
        [userId, titre.slice(0, 200)]
    );
    return r.rows[0].id as string;
}

export async function verifierProprietaire(conversationId: string, userId: string) {
    const r = await db.query(
        "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'",
        [conversationId, userId]
    );
    return r.rowCount === 1;
}

export async function ajouterMessage(
    conversationId: string,
    sender: "USER" | "ASSISTANT",
    content: string,
    structured: any = null
) {
    const r = await db.query(
        `INSERT INTO messages (conversation_id, sender, content, structured_data)
     VALUES ($1, $2, $3, $4) RETURNING id`,
        [conversationId, sender, content, structured ? JSON.stringify(structured) : null]
    );
    await db.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);
    return r.rows[0].id as string;
}

export async function ouvrirRequete(p: {
    conversationId: string; userMessageId: string; userId: string; role: string;
}) {
    const r = await db.query(
        `INSERT INTO assistant_requests
       (conversation_id, user_message_id, user_id, role_at_request, request_type, status)
     VALUES ($1, $2, $3, $4, 'QUERY', 'PENDING') RETURNING id`,
        [p.conversationId, p.userMessageId, p.userId, p.role]
    );
    return r.rows[0].id as string;
}

export async function cloturerRequete(id: string, champs: Record<string, any>) {
    const cles = Object.keys(champs);
    const set = cles.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await db.query(
        `UPDATE assistant_requests SET ${set} WHERE id = $1`,
        [id, ...cles.map((c) => {
            const v = champs[c];
            return v && typeof v === "object" ? JSON.stringify(v) : v;
        })]
    );
}

/** Fusion déterministe : le backend conserve les filtres, pas le modèle. */
export function fusionner(precedente: any, nouvelle: any) {
    if (nouvelle.mode !== "affinement" || !precedente?.ok) return nouvelle;
    if (nouvelle.view && nouvelle.view !== precedente.view) return nouvelle;

    const filtres = [...(precedente.filters ?? [])];
    for (const f of nouvelle.filters ?? []) {
        const i = filtres.findIndex((x) => x.field === f.field);
        if (i >= 0) filtres[i] = f;
        else filtres.push(f);
    }

    return {
        ...precedente,
        ...nouvelle,
        view: precedente.view,
        filters: filtres,
        select: nouvelle.select?.length ? nouvelle.select : precedente.select,
    };
}

/** Les 3 derniers échanges réussis : question + spécification produite + volume. */
export async function historique(conversationId: string) {
    const r = await db.query(
        `SELECT m.content AS question, ar.query_spec, ar.row_count
     FROM assistant_requests ar
     JOIN messages m ON m.id = ar.user_message_id
     WHERE ar.conversation_id = $1 AND ar.status = 'EXECUTED'
     ORDER BY ar.created_at DESC
     LIMIT 3`,
        [conversationId]
    );
    return r.rows.reverse();
}

/** Identifiants affichés au dernier tour, pour traiter « la première », « celle-ci ». */
export async function dernieresReferences(conversationId: string) {
    const r = await db.query(
        `SELECT structured_data FROM messages
     WHERE conversation_id = $1 AND sender = 'ASSISTANT' AND structured_data IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
        [conversationId]
    );
    const lignes = r.rows[0]?.structured_data?.lignes;
    if (!Array.isArray(lignes) || lignes.length === 0) return null;
    const cle = Object.keys(lignes[0])[0];
    return { colonne: cle, valeurs: lignes.slice(0, 10).map((l: any) => l[cle]) };
}
