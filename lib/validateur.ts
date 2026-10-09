import { CATALOGUE, colonnesDe } from "./catalogue";

const OPERATEURS: Record<string, string> = {
    eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "ILIKE", in: "IN",
};
const FONCTIONS = ["sum", "count", "avg", "min", "max"];
const LIMITE_MAX = 200;

export class ErreurValidation extends Error { }

/**
 * La valeur a-t-elle la forme qu'attend le type de la colonne, tel que le
 * catalogue le déclare ? Une valeur mal formée — « 1er du mois » pour une
 * date — devient un refus explicite au lieu d'une erreur de PostgreSQL.
 */
function conforme(type: string, x: unknown): boolean {
    switch (type) {
        case "date":
            return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
        case "montant":
        case "nombre":
        case "duree":
            return (typeof x === "number" && Number.isFinite(x))
                || (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x.trim()));
        case "booleen":
            return typeof x === "boolean" || x === "true" || x === "false";
        default:
            return typeof x === "string" || (typeof x === "number" && Number.isFinite(x));
    }
}

export function construireRequete(spec: any, role: string) {
    // 1. La vue existe-t-elle, et ce rôle y a-t-il droit ?
    const vue = CATALOGUE[spec.view];
    if (!vue) throw new ErreurValidation(`Vue inconnue : ${spec.view}`);
    if (!vue.roles.includes(role)) throw new ErreurValidation(`Vue non autorisée pour le rôle ${role}`);

    const colonneValide = (c: string) => {
        if (!(c in vue.colonnes)) throw new ErreurValidation(`Colonne inconnue : ${c}`);
        return c;
    };

    const valeurValide = (colonne: string, op: string, v: unknown) => {
        const c = vue.colonnes[colonne];
        if (op === "IN") {
            if (Array.isArray(v) && v.length === 0) throw new ErreurValidation(`Aucune valeur donnée pour « ${c.libelle} ».`);
        } else if (Array.isArray(v)) {
            throw new ErreurValidation(`Une seule valeur est attendue pour « ${c.libelle} ».`);
        }
        if (op === "ILIKE" && c.type !== "texte") {
            throw new ErreurValidation(`La recherche partielle ne s'applique qu'à du texte, pas à « ${c.libelle} ».`);
        }
        for (const x of Array.isArray(v) ? v : [v]) {
            if (!conforme(c.type, x)) throw new ErreurValidation(`Valeur invalide pour « ${c.libelle} » : « ${String(x)} ».`);
        }
        return v;
    };

    const params: any[] = [];
    let sql: string;

    // 2. Projection : agrégat ou sélection simple
    if (spec.aggregate) {
        const fn = String(spec.aggregate.fn).toLowerCase();
        if (!FONCTIONS.includes(fn)) throw new ErreurValidation(`Fonction interdite : ${fn}`);
        const champ = fn === "count" ? "*" : colonneValide(spec.aggregate.field);
        const col = vue.colonnes[spec.aggregate.field];
        if (fn === "sum" && col?.additif === false) {
            throw new ErreurValidation(
                `Additionner des « ${col.libelle} » n'a pas de sens. Demandez plutôt une moyenne, un minimum ou un maximum.`,
            );
        }
        const groupes = (spec.group_by ?? []).map(colonneValide);
        const projection = [...groupes, `${fn}(${champ}) AS resultat`].join(", ");
        sql = `SELECT ${projection} FROM ${spec.view}`;
        spec._groupes = groupes;
    } else {
        const fallback = colonnesDe(vue);
        const cols = (spec.select?.length ? spec.select : fallback).map(colonneValide);
        sql = `SELECT ${cols.join(", ")} FROM ${spec.view}`;
    }

    // 3. Filtres — les valeurs partent en paramètres, jamais dans le texte SQL
    const conditions: string[] = [];
    for (const f of spec.filters ?? []) {
        const col = colonneValide(f.field);
        const op = OPERATEURS[f.op];
        if (!op) throw new ErreurValidation(`Opérateur interdit : ${f.op}`);
        const valeur = valeurValide(col, op, f.value);

        if (op === "IN") {
            const valeurs = (Array.isArray(valeur) ? valeur : [valeur])
                .map((v: unknown) => { params.push(v); return `$${params.length}`; });
            conditions.push(`${col} IN (${valeurs.join(", ")})`);
        } else {
            params.push(op === "ILIKE" ? `%${valeur}%` : valeur);
            conditions.push(`${col} ${op} $${params.length}`);
        }
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;

    if (spec._groupes?.length) sql += ` GROUP BY ${spec._groupes.join(", ")}`;

    // 4. Tri — une série se lit dans l'ordre du temps quand rien d'autre n'est demandé.
    if (!spec.order_by && !spec.aggregate && vue.serie) {
        sql += ` ORDER BY ${vue.serie} ASC`;
    }
    if (spec.order_by) {
        const col = spec.aggregate && spec.order_by.field === "resultat"
            ? "resultat"
            : colonneValide(spec.order_by.field);
        const dir = String(spec.order_by.dir).toLowerCase() === "asc" ? "ASC" : "DESC";
        sql += ` ORDER BY ${col} ${dir}`;
    }

    // 5. Limite plafonnée
    const limite = Math.min(Number(spec.limit) || 50, LIMITE_MAX);
    sql += ` LIMIT ${limite}`;

    return { sql, params };
}