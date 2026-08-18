"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [motDePasse, setMotDePasse] = useState("");
    const [visible, setVisible] = useState(false);
    const [erreur, setErreur] = useState("");
    const [enCours, setEnCours] = useState(false);

    async function connecter() {
        if (!email || !motDePasse) return;
        setErreur("");
        setEnCours(true);

        const res = await signIn("credentials", {
            email, password: motDePasse, redirect: false,
        });

        setEnCours(false);
        if (res?.error) setErreur("Adresse email ou mot de passe incorrect.");
        else router.push("/chat");
    }

    return (
        <main className="grid min-h-screen place-items-center bg-gradient-to-br from-[#EEF0FB] to-[#F7F8FC] p-6">
            <div className="w-full max-w-sm">
                <div className="mb-7 text-center">
                    <Image src="/logo.png" alt="" width={64} height={64} className="mx-auto rounded-2xl" priority />
                    <h1 className="mt-4 text-2xl font-bold text-[#1B1F32]">IntegraSys ERP</h1>
                    <p className="mt-1 text-sm text-[#6B7089]">
                        Votre gestion simplifiée, vos décisions éclairées.
                    </p>
                </div>

                <div className="rounded-2xl border border-[#E8EAF2] bg-white p-7 shadow-sm">
                    <h2 className="text-center text-lg font-bold text-[#1B1F32]">Bienvenue 👋</h2>
                    <p className="mb-6 text-center text-sm text-[#6B7089]">
                        Connectez-vous à votre espace de gestion
                    </p>

                    <label className="mb-1.5 block text-sm font-medium text-[#1B1F32]">Adresse email</label>
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#E8EAF2] px-3 py-2.5">
                        <Mail size={16} className="text-[#9AA0B8]" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="exemple@entreprise.com"
                            autoComplete="email"
                            className="w-full bg-transparent text-sm text-[#1B1F32] outline-none placeholder:text-[#9AA0B8]"
                        />
                    </div>

                    <label className="mb-1.5 block text-sm font-medium text-[#1B1F32]">Mot de passe</label>
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#E8EAF2] px-3 py-2.5">
                        <Lock size={16} className="text-[#9AA0B8]" />
                        <input
                            type={visible ? "text" : "password"}
                            value={motDePasse}
                            onChange={(e) => setMotDePasse(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && connecter()}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="w-full bg-transparent text-sm text-[#1B1F32] outline-none placeholder:text-[#9AA0B8]"
                        />
                        <button
                            type="button"
                            onClick={() => setVisible(!visible)}
                            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            className="text-[#9AA0B8]"
                        >
                            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {erreur && (
                        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            {erreur}
                        </p>
                    )}

                    <button
                        onClick={connecter}
                        disabled={enCours}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#5B5BD6] to-[#7C5BD6] py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                        {enCours ? "Connexion…" : <>Se connecter <ArrowRight size={15} /></>}
                    </button>
                </div>

                <p className="mt-6 text-center text-xs text-[#9AA0B8]">
                    © 2026 IntegraSys ERP. Tous droits réservés.
                </p>
            </div>
        </main>
    );
}