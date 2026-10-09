"use client";

import { useState } from "react";
import { AlertTriangle, Check, X, Loader2, FileWarning, Copy } from "lucide-react";
import type { FactureNormalisee, Anomalie, Rapprochement, LigneRapprochee } from "@/lib/ocr";

export type Brouillon = {
    importId: string;
    statut: string;
    facture: FactureNormalisee;
    anomalies: Anomalie[];
    fournisseur: Rapprochement;
    lignes: LigneRapprochee[];
    doublon: { invoice_number: string; invoice_date: string; total_amount: string } | null;
};

type Props = {
    brouillon: Brouillon;
    onTermine: (texte: string, statut: "execute" | "annule" | "refus") => void;
};

const montant = (v: number | null) =>
    v === null
        ? "—"
        : v
              .toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
              .replace(/\u202F|\u00A0/g, " ") + " TND";

const dateFr = (v: string | null) => (v ? v.split("-").reverse().join("/") : "—");

export default function CarteImport({ brouillon, onTermine }: Props) {
    const [enCours, setEnCours] = useState<"confirmer" | "rejeter" | null>(null);
    const [fige, setFige] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    const { facture, anomalies, fournisseur, lignes, doublon } = brouillon;

    // Une anomalie bloque aussi : l'utilisateur ne peut pas corriger le brouillon,
    // et confirmer des totaux qui ne tombent pas juste écrirait des chiffres faux.
    const bloque = fournisseur.etat !== "ok" || doublon !== null || anomalies.length > 0;

    async function decider(decision: "confirmer" | "rejeter") {
        if (fige) return;
        setEnCours(decision);
        setErreur(null);
        try {
            const r = await fetch("/api/import/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Comme pour les actions : seul l'identifiant part. Les valeurs
                // sont relues côté serveur depuis extracted_data.
                body: JSON.stringify({ importId: brouillon.importId, decision }),
            });
            const data = await r.json();

            if (data.execute) {
                setFige(true);
                onTermine(data.texte, "execute");
            } else if (data.rejete) {
                setFige(true);
                onTermine(data.texte, "annule");
            } else {
                setErreur(data.texte ?? data.erreur ?? "Erreur inattendue.");
                if (r.status === 409) setFige(true);
            }
        } catch {
            setErreur("Le serveur n'a pas répondu.");
        } finally {
            setEnCours(null);
        }
    }

    const infos: [string, string][] = [
        ["fournisseur", fournisseur.etat === "ok" ? `${fournisseur.reference} — ${fournisseur.nom}` : "non identifié"],
        ["numéro", facture.numero || "—"],
        ["date", dateFr(facture.date_facture)],
        ["échéance", dateFr(facture.date_echeance)],
        ["montant hors taxe", montant(facture.total_ht)],
        ["taxes", montant(facture.total_tva)],
        ...((facture.timbre_fiscal ?? 0) > 0 ? [["timbre fiscal", montant(facture.timbre_fiscal)] as [string, string]] : []),
        ["total TTC", montant(facture.total_ttc)],
    ];

    return (
        <div className="max-w-2xl rounded-xl border border-amber-300 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">Facture à vérifier</span>
            </div>

            {doublon && (
                <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <Copy className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Une facture {doublon.invoice_number} du {doublon.invoice_date} existe déjà pour
                        ce fournisseur. Rejette cet import s&apos;il s&apos;agit du même document.
                    </span>
                </p>
            )}

            {fournisseur.etat !== "ok" && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    Le fournisseur n&apos;a pas été identifié. Cette facture ne peut pas être enregistrée
                    automatiquement.
                </p>
            )}

            {anomalies.length > 0 && (
                <ul className="mb-3 space-y-1 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    {anomalies.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                            {a.message}
                        </li>
                    ))}
                </ul>
            )}

            <dl className="mb-3 divide-y divide-amber-200/70 rounded-lg bg-white">
                {infos.map(([libelle, valeur]) => (
                    <div key={libelle} className="flex justify-between gap-4 px-3 py-2 text-sm">
                        <dt className="text-slate-500">{libelle}</dt>
                        <dd className="text-right font-medium text-slate-800">{valeur}</dd>
                    </div>
                ))}
            </dl>

            <div className="mb-4 overflow-hidden rounded-lg bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium">produit</th>
                            <th className="px-3 py-2 text-right font-medium">qté</th>
                            <th className="px-3 py-2 text-right font-medium">P.U.</th>
                            <th className="px-3 py-2 text-right font-medium">total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {lignes.map((l, i) => (
                            <tr key={i}>
                                <td className="px-3 py-2">
                                    <span className="text-slate-800">{l.ligne.designation}</span>
                                    <span
                                        className={
                                            l.produit ? "ml-2 text-xs text-slate-400" : "ml-2 text-xs text-orange-600"
                                        }
                                    >
                                        {l.produit ? l.produit.reference : "hors catalogue"}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">{l.ligne.quantite ?? "—"}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{montant(l.ligne.prix_unitaire)}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">
                                    {montant(l.ligne.total_ligne)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {erreur && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

            {!fige && (
                <div className="flex gap-2">
                    <button
                        onClick={() => decider("confirmer")}
                        disabled={enCours !== null || bloque}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#5B5BD6] px-4 py-2
                                   text-sm font-medium text-white transition hover:bg-[#4A4AC4]
                                   disabled:opacity-50"
                    >
                        {enCours === "confirmer" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                        Enregistrer la facture
                    </button>
                    <button
                        onClick={() => decider("rejeter")}
                        disabled={enCours !== null}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300
                                   bg-white px-4 py-2 text-sm font-medium text-slate-700
                                   transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                        Rejeter
                    </button>
                </div>
            )}

            <p className="mt-3 text-xs text-slate-500">
                Aucune facture n&apos;est créée tant que tu n&apos;as pas validé.
            </p>
        </div>
    );
}
