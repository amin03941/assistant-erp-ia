"use client";

import { useEffect, useRef, useState } from "react";
import { compacte, graduations, type Graphique } from "@/lib/graphique";

/**
 * Histogramme d'une seule série : le titre nomme la mesure, aucune légende.
 * Barres fines (24 px au plus), bout arrondi, base carrée ; grille discrète ;
 * une info-bulle par barre, au survol comme au clavier. Le tableau reste
 * affiché sous le graphique : aucune valeur n'est réservée au survol.
 */

const COULEUR = "#5B5BD6";
const COULEUR_ACTIVE = "#4646B8";
const HAUTEUR = 220;
const MARGE = { haut: 12, droite: 8, bas: 30, gauche: 52 };
const LARGEUR_MAX_BARRE = 24;
const ARRONDI = 4;

const valeurLongue = (v: number, format: Graphique["format"]) => {
    const f = (n: number, d: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })
        .replace(/ | /g, " ");
    if (format === "montant") return `${f(v, 3)} TND`;
    if (format === "duree") return `${f(v, 0)} jours`;
    return f(v, Number.isInteger(v) ? 0 : 2);
};

/** Barre au bout arrondi et à la base carrée, posée sur la ligne de base. */
function barre(x: number, y: number, l: number, h: number): string {
    if (h <= 0) return "";
    const r = Math.min(ARRONDI, l / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + h}Z`;
}

export default function GraphiqueBarres({ graphique }: { graphique: Graphique }) {
    const conteneur = useRef<HTMLDivElement>(null);
    const [largeur, setLargeur] = useState(560);
    const [actif, setActif] = useState<number | null>(null);

    useEffect(() => {
        const el = conteneur.current;
        if (!el) return;
        const observer = new ResizeObserver(([e]) => setLargeur(Math.max(260, Math.floor(e.contentRect.width))));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const { valeurs, etiquettes, titre, format } = graphique;
    const ticks = graduations(Math.max(...valeurs, 0), 4, format !== "montant");
    const haut = ticks[ticks.length - 1] || 1;

    const l = largeur - MARGE.gauche - MARGE.droite;
    const h = HAUTEUR - MARGE.haut - MARGE.bas;
    const bande = l / valeurs.length;
    const lb = Math.min(LARGEUR_MAX_BARRE, bande * 0.6);
    const y = (v: number) => MARGE.haut + h - (Math.max(0, v) / haut) * h;
    // Pas plus d'une étiquette tous les ~56 px : les autres restent dans l'info-bulle et le tableau.
    const pasEtiquette = Math.max(1, Math.ceil(56 / bande));

    return (
        <figure className="mt-3">
            <figcaption className="mb-1 text-xs font-medium text-[#4A4F6B]">{titre}</figcaption>
            <div ref={conteneur} className="relative w-full" onMouseLeave={() => setActif(null)}>
                <svg
                    width={largeur}
                    height={HAUTEUR}
                    role="img"
                    aria-label={`${titre} — ${valeurs.length} valeurs, détaillées dans le tableau ci-dessous.`}
                    className="block"
                >
                    {ticks.map((t) => (
                        <g key={t}>
                            <line
                                x1={MARGE.gauche} x2={largeur - MARGE.droite} y1={y(t)} y2={y(t)}
                                stroke={t === 0 ? "#C9CCDA" : "#EEF0F6"} strokeWidth={1}
                            />
                            <text x={MARGE.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#9AA0B8">
                                {compacte(t)}
                            </text>
                        </g>
                    ))}

                    {valeurs.map((v, i) => {
                        const cx = MARGE.gauche + bande * i + bande / 2;
                        return (
                            <g key={i}>
                                <path d={barre(cx - lb / 2, y(v), lb, MARGE.haut + h - y(v))} fill={actif === i ? COULEUR_ACTIVE : COULEUR} />
                                {i % pasEtiquette === 0 && (
                                    <text x={cx} y={HAUTEUR - MARGE.bas + 16} textAnchor="middle" fontSize={10} fill="#6B7089">
                                        {etiquettes[i]}
                                    </text>
                                )}
                                {/* Zone de survol : toute la bande, plus large que la barre. */}
                                <rect
                                    x={MARGE.gauche + bande * i} y={MARGE.haut} width={bande} height={h}
                                    fill="transparent"
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${etiquettes[i]} : ${valeurLongue(v, format)}`}
                                    onMouseEnter={() => setActif(i)}
                                    onFocus={() => setActif(i)}
                                    onBlur={() => setActif(null)}
                                    className="cursor-default outline-none"
                                />
                            </g>
                        );
                    })}
                </svg>

                {actif !== null && (
                    <div
                        role="tooltip"
                        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-[#E8EAF2] bg-white px-2.5 py-1.5 text-xs shadow-sm"
                        style={{
                            left: Math.min(Math.max(MARGE.gauche + bande * actif + bande / 2, 70), largeur - 70),
                            top: y(valeurs[actif]) - 6,
                        }}
                    >
                        <p className="font-semibold text-[#1B1F32]">{valeurLongue(valeurs[actif], format)}</p>
                        <p className="text-[#6B7089]">{etiquettes[actif]}</p>
                    </div>
                )}
            </div>
        </figure>
    );
}
