import { auth } from "@/auth";
import type { Role } from "./actions";

export type Session = { userId: string; role: Role; nom: string };

export class NonAuthentifie extends Error { }

export async function getSession(): Promise<Session> {
    const s = await auth();
    const u = s?.user as any;
    if (!u?.id || !u?.role) throw new NonAuthentifie("Session absente ou expirée.");
    return { userId: u.id, role: u.role as Role, nom: u.name ?? "Utilisateur" };
}