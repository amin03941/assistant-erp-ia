import { db } from "./db";

export type Session = { userId: string; role: string; nom: string };

// PROVISOIRE : utilisateur simulé tant qu'Auth.js n'est pas branché.
// Seule cette fonction changera à l'étape d'authentification.
export async function getSession(): Promise<Session> {
    const r = await db.query(
        "SELECT id, role, full_name FROM users WHERE email = $1 AND status = 'ACTIVE'",
        ["responsable@integrasys.tn"]
    );
    if (r.rowCount === 0) throw new Error("Utilisateur de démonstration introuvable");
    return { userId: r.rows[0].id, role: r.rows[0].role, nom: r.rows[0].full_name };
}