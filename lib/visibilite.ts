import { CATALOGUE } from "./catalogue";

/**
 * Ce que chaque rôle voit du fonctionnement interne.
 *
 * Un utilisateur métier voit ce que l'assistant a compris, en français :
 * données consultées, conditions, calcul. C'est ce qui lui permet de repérer
 * une mauvaise compréhension avant de se fier au résultat.
 *
 * La requête SQL et ses paramètres exposent le schéma interne (noms de vues
 * et de colonnes) sans rien apporter à un commercial ou un comptable. Ils
 * sont réservés aux rôles qui supervisent l'assistant, et retirés CÔTÉ
 * SERVEUR pour les autres : masqués dans l'interface seulement, ils
 * resteraient lisibles dans les outils du navigateur.
 *
 * La requête reste enregistrée en base avec le message (journal) : seule sa
 * diffusion dépend du rôle, celui de la session courante.
 */

/** Rôles qui supervisent l'assistant : tableau de bord et détails techniques. */
export const ROLES_SUPERVISION: readonly string[] = ["MANAGER", "ADMIN"];

export function voitDetailsTechniques(role: string): boolean {
    return ROLES_SUPERVISION.includes(role);
}

/** Détails d'une réponse tels que ce rôle peut les recevoir. */
export function detailsPourRole<T extends Record<string, unknown>>(details: T, role: string): T {
    if (voitDetailsTechniques(role)) return details;
    const { sql: _sql, params: _params, ...reste } = details;
    return reste as T;
}

const ROLES: Record<string, string> = {
    SALES: "commercial", ACCOUNTANT: "comptable", MANAGER: "responsable", ADMIN: "administrateur",
};

/**
 * Traduit les noms internes d'un texte dans les mots de l'utilisateur :
 * « v_customers » → « clients », « customer_reference » → « référence client »,
 * « SALES » → « commercial ». Un refus rédigé par le modèle peut en citer
 * malgré la consigne qui l'interdit ; aucun ne doit atteindre l'utilisateur.
 */
export function traduireNomsInternes(texte: string): string {
    const noms = new Map<string, string>();
    for (const [vue, v] of Object.entries(CATALOGUE)) {
        noms.set(vue, v.intitule ?? v.entite.pluriel);
        for (const [col, c] of Object.entries(v.colonnes)) if (col.includes("_") && !noms.has(col)) noms.set(col, c.libelle);
    }
    return texte
        .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => noms.get(m) ?? m)
        .replace(/\b(SALES|ACCOUNTANT|MANAGER|ADMIN)\b/g, (m) => ROLES[m]);
}
