import { CATALOGUE, additive, type Vue } from "./catalogue";
import { bornesAppliquees, colonnesDate, libellePeriode } from "./periodes";

const DEVISE = "TND";

const nombre = (v: number, decimales = 0) =>
    v
        .toLocaleString("fr-FR", {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales,
        })
        .replace(/\u202F|\u00A0/g, " ");


const montant = (v: number) => `${nombre(v, 3)} ${DEVISE}`;

/** "1 facture" / "17 factures", en accordant l'article si demandé. */
function accord(n: number, vue: Vue) {
    const e = vue.entite;
    return `${nombre(n)} ${n > 1 ? e.pluriel : e.singulier}`;
}

/** Libellés des filtres appliqués, pour rappeler ce qui a été demandé. */
function conditions(spec: any, vue: Vue): string[] {
    const sortie: string[] = [];
    for (const f of spec.filters ?? []) {
        const col = vue.colonnes[f.field];
        if (!col || f.origine === "periode") continue;

        if (col.type === "booleen") {
            if (f.value === true) sortie.push(col.sens ?? col.libelle);
            else sortie.push(`sans ${col.libelle}`);
        } else if (f.op === "eq" || f.op === "like") {
            sortie.push(`${col.libelle} ${f.value}`);
        } else if (f.op === "in") {
            sortie.push(`${col.libelle} parmi ${(f.value as any[]).join(", ")}`);
        } else {
            const mots: Record<string, string> = {
                gt: "supérieur à", gte: "au moins", lt: "inférieur à", lte: "au plus", neq: "différent de",
            };
            sortie.push(`${col.libelle} ${mots[f.op] ?? f.op} ${f.value}`);
        }
    }
    // La période se dit en mots, avec ses dates réelles, et non comme deux filtres.
    const p = spec.periode;
    const b = bornesAppliquees(spec.filters);
    if (p && (b.debut || b.fin)) {
        const libelle = libellePeriode(p, b);
        // La date principale de la vue va sans dire ; une autre est nommée (« échéance … »).
        const principale = colonnesDate(spec.view)[0] === p.colonne;
        sortie.push(principale ? libelle : `${vue.colonnes[p.colonne]?.libelle ?? p.colonne} ${libelle}`);
    }
    return sortie;
}

/** Phrase de synthèse, entièrement construite par le backend. */
export function synthetiser(spec: any, lignes: any[]): string {
    const vue = CATALOGUE[spec.view];
    if (!vue) return `${lignes.length} résultat(s).`;

    const filtres = conditions(spec, vue);
    const utiles = spec.aggregate
        ? filtres.filter((c) => {
            const cible = vue.colonnes[spec.aggregate.field]?.libelle ?? "";
            return !cible || (!c.includes(cible) && !cible.includes(c));
        })
        : filtres;
    const suffixe = utiles.length ? ` ${utiles.join(", ")}` : "";

    // 1. Agrégat : la valeur EST la réponse.
    if (spec.aggregate) {
        if (lignes.length === 0) return "Aucune donnée ne correspond à cette demande.";

        // Agrégat groupé : on annonce le nombre de groupes.
        if (spec.group_by?.length) {
            const cle = vue.colonnes[spec.group_by[0]];
            return `Répartition par ${cle?.libelle ?? spec.group_by[0]} : ${nombre(lignes.length)} valeur(s).`;
        }

        const brut = Number(lignes[0].resultat);
        const fn = String(spec.aggregate.fn).toLowerCase();

        if (fn === "count") return `${accord(brut, vue)}${suffixe}.`;

        const col = vue.colonnes[spec.aggregate.field];
        const valeur = col?.type === "montant" ? montant(brut)
            : col?.type === "duree" ? `${nombre(brut)} jours`
                : nombre(brut, 2);

        const verbes: Record<string, string> = {
            sum: "Total", avg: "Moyenne", min: "Minimum", max: "Maximum",
        };
        return `${verbes[fn] ?? fn} — ${col?.libelle ?? spec.aggregate.field}${suffixe} : ${valeur}.`;
    }

    // 2. Liste vide.
    if (lignes.length === 0) {
        const f = vue.entite.genre === "f";
        return `${f ? "Aucune" : "Aucun"} ${vue.entite.singulier}${suffixe} n'a été ${f ? "trouvée" : "trouvé"}.`;
    }

    // 3. Liste : effectif, puis les totaux et comptages réellement pertinents.
    const complements: string[] = [];
    const colsPresentes = Object.keys(lignes[0]);

    const montantResume =
        colsPresentes.find((n) => vue.colonnes[n]?.resume) ??
        colsPresentes.find((n) => additive(vue.colonnes[n]));

    for (const nom of colsPresentes) {
        const col = vue.colonnes[nom];
        if (!col) continue;

        if (additive(col)) {
            if (nom === montantResume) {
                const somme = lignes.reduce((a, l) => a + Number(l[nom] ?? 0), 0);
                if (somme > 0) complements.push(`${col.libelle} cumulé ${montant(somme)}`);
            }
        }

        if (col.type === "booleen") {
            // Inutile de compter un booléen déjà imposé par un filtre.
            const impose = (spec.filters ?? []).some((f: any) => f.field === nom);
            if (impose) continue;
            const n = lignes.filter((l) => l[nom] === true).length;
            if (n > 0) complements.push(`dont ${nombre(n)} ${col.sens ?? col.libelle}`);
        }
    }

    // Deux compléments au maximum : le premier montant, le premier comptage.
    const montants = complements.filter((c) => c.includes("cumulé")).slice(0, 1);
    const comptages = complements.filter((c) => c.startsWith("dont")).slice(0, 1);
    const queue = [...montants, ...comptages];

    const tronque = lignes.length >= (spec.limit ?? 50) ? " (affichage limité)" : "";
    return `${accord(lignes.length, vue)}${suffixe}${queue.length ? ", " + queue.join(", ") : ""}.${tronque}`;
}
// ---------------------------------------------------------------------------
// « Comment j'ai compris »
// ---------------------------------------------------------------------------

export type Comprehension = {
    /** Ce qui est consulté : « factures de vente ». */
    donnees: string;
    /** Les conditions appliquées, dans les mots de la phrase de réponse. */
    conditions: string[];
    calcul?: string;
    regroupement?: string;
    tri?: string;
    /** Sujet repris du message précédent, s'il y en a un. */
    sujet?: string;
};

const CALCULS: Record<string, string> = { sum: "total", avg: "moyenne", min: "minimum", max: "maximum" };

/**
 * Ce que le système a compris, en clair. Construit avec les mêmes fonctions
 * que la phrase de réponse : les deux ne peuvent pas se contredire. C'est
 * aussi ce qui rend une mauvaise compréhension visible avant qu'on se fie au
 * résultat.
 */
export function expliquer(spec: any, sujet?: string | null): Comprehension | null {
    const vue = CATALOGUE[spec?.view];
    if (!vue) return null;
    const libelle = (c: string) => vue.colonnes[c]?.libelle ?? c;

    const c: Comprehension = { donnees: vue.intitule ?? vue.entite.pluriel, conditions: conditions(spec, vue) };

    if (spec.aggregate) {
        const fn = String(spec.aggregate.fn).toLowerCase();
        c.calcul = fn === "count"
            ? `nombre de ${vue.entite.pluriel}`
            : `${CALCULS[fn] ?? fn} de « ${libelle(spec.aggregate.field)} »`;
    }
    if (spec.group_by?.length) c.regroupement = `par ${spec.group_by.map(libelle).join(", ")}`;
    if (spec.order_by?.field) {
        const champ = spec.order_by.field === "resultat" ? (c.calcul ?? "résultat") : libelle(spec.order_by.field);
        c.tri = `${champ}, ${String(spec.order_by.dir).toLowerCase() === "asc" ? "croissant" : "décroissant"}`;
    }
    if (sujet) c.sujet = sujet;
    return c;
}
