import { describe, it, expect } from "vitest";
import { synthetiser } from "./synthese";
import { CATALOGUE } from "./catalogue";

/** Tous les nombres d'une phrase, séparateurs français gérés. */
function nombresDe(texte: string): number[] {
    return (texte.match(/\d[\d ]*(?:,\d+)?/g) ?? [])
        .map((x) => Number(x.replace(/ /g, "").replace(",", ".")))
        .filter((n) => !isNaN(n));
}

/** Fabrique N lignes conformes aux colonnes d'une vue. */
function lignes(nomVue: string, n: number, base: any = {}) {
    const vue = CATALOGUE[nomVue];
    return Array.from({ length: n }, (_, i) => {
        const l: any = {};
        for (const [nom, col] of Object.entries(vue.colonnes)) {
            l[nom] =
                col.type === "montant" ? 100 + i
                    : col.type === "duree" ? i
                        : col.type === "booleen" ? false
                            : col.type === "date" ? "2026-01-01"
                                : `${nom}-${i}`;
        }
        return { ...l, ...base };
    });
}

describe("propriétés invariantes de la synthèse", () => {
    const vues = Object.keys(CATALOGUE);

    it("n'affiche aucun nombre absent des données", () => {
        for (const v of vues) {
            const donnees = lignes(v, 3);
            const phrase = synthetiser({ view: v }, donnees);

            const autorises = new Set<number>([donnees.length]);
            for (const [nom, col] of Object.entries(CATALOGUE[v].colonnes)) {
                if (col.type === "montant") {
                    autorises.add(donnees.reduce((a, l) => a + Number(l[nom] ?? 0), 0));
                }
                if (col.type === "booleen") {
                    autorises.add(donnees.filter((l) => l[nom] === true).length);
                }
            }

            for (const n of nombresDe(phrase)) {
                expect(autorises.has(n), `${v} → « ${phrase} » : ${n} inattendu`).toBe(true);
            }
        }
    });

    it("ne mentionne aucune condition absente de la spécification", () => {
        for (const v of vues) {
            const phrase = synthetiser({ view: v, filters: [] }, lignes(v, 2));
            for (const col of Object.values(CATALOGUE[v].colonnes)) {
                if (col.type !== "booleen" || !col.sens) continue;
                expect(phrase, `${v} → « ${phrase} »`).not.toContain(col.sens);
            }
        }
    });

    it("ne répète jamais deux fois le même libellé", () => {
        for (const v of vues) {
            for (const [nom, col] of Object.entries(CATALOGUE[v].colonnes)) {
                if (col.type !== "montant") continue;
                const spec = {
                    view: v,
                    filters: [{ field: nom, op: "gt", value: 0 }],
                    aggregate: { fn: "sum", field: nom },
                };
                const phrase = synthetiser(spec, [{ resultat: 500 }]);
                const occurrences = phrase.split(col.libelle).length - 1;
                expect(occurrences, `${v}.${nom} → « ${phrase} »`).toBeLessThanOrEqual(1);
            }
        }
    });

    it("accorde le singulier et le pluriel", () => {
        for (const v of vues) {
            const e = CATALOGUE[v].entite;
            expect(synthetiser({ view: v }, lignes(v, 1))).toContain(e.singulier);
            expect(synthetiser({ view: v }, lignes(v, 4))).toContain(e.pluriel);
        }
    });

    it("produit toujours une phrase non vide terminée par un point", () => {
        for (const v of vues) {
            for (const n of [0, 1, 5]) {
                const phrase = synthetiser({ view: v }, lignes(v, n));
                expect(phrase.length, v).toBeGreaterThan(5);
                expect(phrase.endsWith("."), `${v} → « ${phrase} »`).toBe(true);
            }
        }
    });
});
