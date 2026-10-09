"use client";

import { useState } from "react";
import { AlertTriangle, Check, X, Loader2 } from "lucide-react";

export type Confirmation = {
    requestId: string;
    titre: string;
    lignes: { libelle: string; valeur: string }[];
};

type Props = {
    confirmation: Confirmation;
    onTermine: (texte: string, statut: "execute" | "annule" | "refus") => void;
};

export default function CarteAction({ confirmation, onTermine }: Props) {
    const [enCours, setEnCours] = useState<"confirmer" | "annuler" | null>(null);
    const [fige, setFige] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    async function decider(decision: "confirmer" | "annuler") {
        if (fige) return;
        setEnCours(decision);
        setErreur(null);

        try {
            const r = await fetch("/api/actions/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Le navigateur n'envoie que l'identifiant : les valeurs sont relues
                // côté serveur depuis la base.
                body: JSON.stringify({ requestId: confirmation.requestId, decision }),
            });
            const data = await r.json();

            if (data.execute) {
                setFige(true);
                onTermine(data.texte, "execute");
            } else if (data.annule) {
                setFige(true);
                onTermine(data.texte, "annule");
            } else {
                const texte = data.texte ?? data.erreur ?? "Erreur inattendue.";
                setErreur(texte);
                if (r.status === 409 || r.status === 410) setFige(true);
            }
        } catch {
            setErreur("Le serveur n'a pas répondu.");
        } finally {
            setEnCours(null);
        }
    }

    return (
        <div className="max-w-xl rounded-xl border border-amber-300 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">Confirmation requise</span>
            </div>

            <p className="mb-3 text-sm font-medium text-slate-800">{confirmation.titre}</p>

            <dl className="mb-4 divide-y divide-amber-200/70 rounded-lg bg-white">
                {confirmation.lignes.map((l) => (
                    <div key={l.libelle} className="flex justify-between gap-4 px-3 py-2 text-sm">
                        <dt className="text-slate-500">{l.libelle}</dt>
                        <dd className="text-right font-medium text-slate-800">{l.valeur}</dd>
                    </div>
                ))}
            </dl>

            {erreur && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
            )}

            {!fige && (
                <div className="flex gap-2">
                    <button
                        onClick={() => decider("confirmer")}
                        disabled={enCours !== null}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#5B5BD6] px-4 py-2
                       text-sm font-medium text-white transition hover:bg-[#4A4AC4]
                       disabled:opacity-50"
                    >
                        {enCours === "confirmer" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                        Confirmer
                    </button>

                    <button
                        onClick={() => decider("annuler")}
                        disabled={enCours !== null}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300
                       bg-white px-4 py-2 text-sm font-medium text-slate-700
                       transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                        Annuler
                    </button>
                </div>
            )}

            <p className="mt-3 text-xs text-slate-500">
                Aucune donnée n&apos;est modifiée tant que tu n&apos;as pas confirmé.
            </p>
        </div>
    );
}