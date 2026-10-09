import { CATALOGUE, additive } from "./catalogue";

/**
 * Quand une réponse se lit mieux en graphique, et lequel.
 *
 * Deux cas, tous deux déduits de la spécification et du catalogue — aucun
 * nom de vue écrit ici :
 *  1. un agrégat regroupé (« le reste à payer par client ») : une barre par groupe ;
 *  2. une vue déclarée comme série (`serie` dans le catalogue, une ligne par
 *     mois) : une colonne par période, dans l'ordre du temps.
 * Une seule série, donc une seule mesure : jamais deux échelles sur un même axe.
 * Le tableau reste affiché sous le graphique : aucune valeur n'est réservée au survol.
 */

export type Graphique = {
    titre: string;
    etiquettes: string[];
    valeurs: number[];
    format: "montant" | "nombre" | "duree";
    /** Série temporelle : l'axe horizontal suit le temps. */
    temporel: boolean;
};

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MAX_POINTS = 24;

/** « 2026-06-01 » → « juin 2026 » ; une date en milieu de mois garde son jour. */
function etiquette(v: unknown, type: string | undefined): string {
    const s = String(v ?? "");
    if (type === "date" && /^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [a, m, j] = s.slice(0, 10).split("-").map(Number);
        return j === 1 ? `${MOIS_COURTS[m - 1]} ${a}` : `${j} ${MOIS_COURTS[m - 1]} ${a}`;
    }
    return s;
}

const FONCTIONS: Record<string, string> = { sum: "Total", avg: "Moyenne", min: "Minimum", max: "Maximum", count: "Nombre" };

export function donneesGraphique(spec: any, lignes: Record<string, unknown>[]): Graphique | null {
    const vue = CATALOGUE[spec?.view];
    if (!vue || !Array.isArray(lignes) || lignes.length < 2 || lignes.length > MAX_POINTS) return null;

    // 1. Agrégat regroupé sur une seule dimension.
    if (spec.aggregate && spec.group_by?.length === 1) {
        const groupe = spec.group_by[0];
        const fn = String(spec.aggregate.fn).toLowerCase();
        const mesure = fn === "count" ? null : vue.colonnes[spec.aggregate.field];
        if (fn !== "count" && !mesure) return null;
        const temporel = vue.colonnes[groupe]?.type === "date";
        const points = lignes.map((l) => ({ x: l[groupe], y: Number(l.resultat) }));
        if (temporel) points.sort((a, b) => String(a.x).localeCompare(String(b.x)));
        if (points.some((p) => !Number.isFinite(p.y))) return null;
        return {
            titre: fn === "count"
                ? `Nombre de ${vue.entite.pluriel} par ${vue.colonnes[groupe]?.libelle ?? groupe}`
                : `${FONCTIONS[fn] ?? fn} — ${mesure!.libelle} par ${vue.colonnes[groupe]?.libelle ?? groupe}`,
            etiquettes: points.map((p) => etiquette(p.x, vue.colonnes[groupe]?.type)),
            valeurs: points.map((p) => p.y),
            format: fn === "count" ? "nombre" : mesure!.type === "duree" ? "duree" : mesure!.type === "montant" ? "montant" : "nombre",
            temporel,
        };
    }

    // 2. Série temporelle déclarée au catalogue.
    if (!spec.aggregate && vue.serie) {
        const temps = vue.serie;
        const colonnes = Object.keys(lignes[0]);
        if (!colonnes.includes(temps)) return null;
        const mesure = colonnes.find((c) => vue.colonnes[c]?.resume)
            ?? colonnes.find((c) => additive(vue.colonnes[c]));
        if (!mesure) return null;
        const points = lignes
            .map((l) => ({ x: String(l[temps] ?? ""), y: Number(l[mesure]) }))
            .sort((a, b) => a.x.localeCompare(b.x));
        if (points.some((p) => !Number.isFinite(p.y))) return null;
        return {
            titre: `${vue.colonnes[mesure].libelle.replace(/^./, (c) => c.toUpperCase())} par ${vue.colonnes[temps].libelle}`,
            etiquettes: points.map((p) => etiquette(p.x, "date")),
            valeurs: points.map((p) => p.y),
            format: "montant",
            temporel: true,
        };
    }

    return null;
}

/**
 * Graduations « rondes » de l'axe vertical, de 0 au-delà du maximum :
 * 0 / 50 000 / 100 000… plutôt que 0 / 37 512 / 75 024.
 */
export function graduations(max: number, cible = 4, entiers = false): number[] {
    if (!(max > 0)) return [0, 1];
    const brut = max / cible;
    const puissance = 10 ** Math.floor(Math.log10(brut));
    const candidat = [1, 2, 2.5, 5, 10].map((k) => k * puissance).find((p) => p >= brut) ?? 10 * puissance;
    // Un comptage ne se gradue pas en quarts : pas entier, au moins 1.
    const pas = entiers ? Math.max(1, Math.ceil(candidat)) : candidat;
    const n = Math.ceil(max / pas);
    return Array.from({ length: n + 1 }, (_, i) => Math.round(i * pas * 1000) / 1000);
}

/** Valeur courte pour un axe : 250 000 → « 250 k », 1 200 000 → « 1,2 M ». */
export function compacte(v: number): string {
    const abs = Math.abs(v);
    const f = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 }).replace(/ | /g, " ");
    if (abs >= 1_000_000) return `${f(v / 1_000_000)} M`;
    if (abs >= 1_000) return `${f(v / 1_000)} k`;
    return f(v);
}
