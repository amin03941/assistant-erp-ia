import { auth } from "@/auth";

export type Session = { userId: string; role: string; nom: string };

export class NonAuthentifie extends Error { }

export async function getSession(): Promise<Session> {
    const s = await auth();
    const u = s?.user as any;
    if (!u?.id || !u?.role) throw new NonAuthentifie("Session absente ou expirée.");
    return { userId: u.id, role: u.role, nom: u.name ?? "Utilisateur" };
}