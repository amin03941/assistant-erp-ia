import { CATALOGUE, type Vue } from "./catalogue";

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
        if (!col) continue;

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
        return `Aucune ${vue.entite.singulier}${suffixe} n'a été trouvée.`;
    }

    // 3. Liste : effectif, puis les totaux et comptages réellement pertinents.
    const complements: string[] = [];
    const colsPresentes = Object.keys(lignes[0]);

    const montantResume =
        colsPresentes.find((n) => vue.colonnes[n]?.resume) ??
        colsPresentes.find((n) => vue.colonnes[n]?.type === "montant");

    for (const nom of colsPresentes) {
        const col = vue.colonnes[nom];
        if (!col) continue;

        if (col.type === "montant") {
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