"use client";

import { ChevronRight } from "lucide-react";
import type { Comprehension } from "@/lib/synthese";

/**
 * « Comment j'ai compris » : ce que le système a retenu de la question, en
 * clair, puis la requête réellement exécutée. Fermé par défaut ; il rend le
 * principe visible — le modèle a compris, le code a décidé et exécuté — et
 * une mauvaise compréhension se voit avant qu'on se fie au résultat.
 */

const valeurSql = (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v));

export default function ComprehensionPanneau({
    comprehension, sql, params,
}: { comprehension?: Comprehension | null; sql?: string; params?: unknown[] }) {
    if (!comprehension && !sql) return null;
    const c = comprehension;

    const lignes: [string, string][] = c
        ? [
            ["Données consultées", c.donnees],
            ["Conditions", c.conditions.length ? c.conditions.join(" · ") : "aucune"],
            ...(c.calcul ? [["Calcul", c.calcul] as [string, string]] : []),
            ...(c.regroupement ? [["Regroupement", c.regroupement] as [string, string]] : []),
            ...(c.tri ? [["Tri", c.tri] as [string, string]] : []),
            ...(c.sujet ? [["Repris du message précédent", c.sujet] as [string, string]] : []),
        ]
        : [];

    return (
        <details className="group mt-3 border-t border-[#F0F1F7] pt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-[#6B7089] hover:text-[#5B5BD6] [&::-webkit-details-marker]:hidden">
                <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                Comment j&apos;ai compris
            </summary>

            <div className="mt-2 space-y-2 text-xs">
                {lignes.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        {lignes.map(([terme, valeur]) => (
                            <div key={terme} className="contents">
                                <dt className="text-[#9AA0B8]">{terme}</dt>
                                <dd className="text-[#1B1F32]">{valeur}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                {sql && (
                    <div>
                        <p className="mb-1 text-[#9AA0B8]">
                            Requête exécutée — construite par le code, compte en lecture seule, valeurs passées en paramètres
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[#F7F8FC] px-3 py-2 font-mono text-[11px] text-[#4A4F6B]">
                            {sql}
                            {params && params.length > 0 && (
                                `\n\n${params.map((p, i) => `$${i + 1} = ${valeurSql(p)}`).join("\n")}`
                            )}
                        </pre>
                    </div>
                )}
            </div>
        </details>
    );
}
