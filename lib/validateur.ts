import { CATALOGUE, colonnesDe } from "./catalogue";

const OPERATEURS: Record<string, string> = {
    eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "ILIKE", in: "IN",
};
const FONCTIONS = ["sum", "count", "avg", "min", "max"];
const LIMITE_MAX = 200;

export class ErreurValidation extends Error { }

export function construireRequete(spec: any, role: string) {
    // 1. La vue existe-t-elle, et ce rôle y a-t-il droit ?
    const vue = CATALOGUE[spec.view];
    if (!vue) throw new ErreurValidation(`Vue inconnue : ${spec.view}`);
    if (!vue.roles.includes(role)) throw new ErreurValidation(`Vue non autorisée pour le rôle ${role}`);

    const colonneValide = (c: string) => {
        if (!(c in vue.colonnes)) throw new ErreurValidation(`Colonne inconnue : ${c}`);
        return c;
    };

    const valeurValide = (v: any) => {
        const ok = (x: any) => ["string", "number", "boolean"].includes(typeof x);
        if (Array.isArray(v) ? v.every(ok) : ok(v)) return v;
        throw new ErreurValidation(`Valeur de filtre invalide : ${JSON.stringify(v)}`);
    };

    const params: any[] = [];
    let sql: string;

    // 2. Projection : agrégat ou sélection simple
    if (spec.aggregate) {
        const fn = String(spec.aggregate.fn).toLowerCase();
        if (!FONCTIONS.includes(fn)) throw new ErreurValidation(`Fonction interdite : ${fn}`);
        const champ = fn === "count" ? "*" : colonneValide(spec.aggregate.field);
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
    for (const f of spec.filters ?? []) {
        const col = colonneValide(f.field);
        const op = OPERATEURS[f.op];
        if (!op) throw new ErreurValidation(`Opérateur interdit : ${f.op}`);
        const valeur = valeurValide(f.value);

        sql += params.length === 0 ? " WHERE " : " AND ";
        if (op === "IN") {
            const valeurs = (Array.isArray(valeur) ? valeur : [valeur])
                .map((v: any) => { params.push(v); return `$${params.length}`; });
            sql += `${col} IN (${valeurs.join(", ")})`;
        } else {
            params.push(op === "ILIKE" ? `%${valeur}%` : valeur);
            sql += `${col} ${op} $${params.length}`;
        }
    }

    if (spec._groupes?.length) sql += ` GROUP BY ${spec._groupes.join(", ")}`;

    // 4. Tri
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