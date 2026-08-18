import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
    session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
    pages: { signIn: "/login" },

    providers: [
        Credentials({
            credentials: { email: {}, password: {} },

            async authorize(donnees) {
                const email = String(donnees?.email ?? "").trim().toLowerCase();
                const motDePasse = String(donnees?.password ?? "");
                if (!email || !motDePasse) return null;

                const r = await db.query(
                    `SELECT id, email, full_name, role, password_hash
           FROM users WHERE lower(email) = $1 AND status = 'ACTIVE'`,
                    [email]
                );
                if (r.rowCount === 0) return null;

                const u = r.rows[0];
                if (!(await bcrypt.compare(motDePasse, u.password_hash))) return null;

                await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [u.id]);
                return { id: u.id, email: u.email, name: u.full_name, role: u.role };
            },
        }),
    ],

    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
            }
            return token;
        },
        session({ session, token }) {
            (session.user as any).id = token.id;
            (session.user as any).role = token.role;
            return session;
        },
    },
});