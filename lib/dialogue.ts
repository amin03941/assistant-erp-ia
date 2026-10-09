import { CATALOGUE } from "./catalogue";
import { actionsPourRole, type Role } from "./actions";
import { ROLES_IMPORT } from "./imports";

/**
 * Messages sans données : « bonjour », « merci », « que sais-tu faire ? ».
 *
 * Faute d'une branche pour eux, le modèle choisissait une lecture et
 * « bonjour » affichait la liste des clients. Le modèle classe désormais ces
 * messages en type "conversation" et en précise la nature.
 *
 * Le partage des rôles reste celui du reste de l'application :
 * - « que sais-tu faire ? » porte sur des faits (les vues et les actions
 *   ouvertes au rôle). La réponse est construite ici, depuis le catalogue,
 *   et le modèle ne peut pas promettre un droit qui n'existe pas.
 * - Une salutation ou un remerciement ne contient aucun fait. C'est le seul
 *   endroit où le texte du modèle est affiché, et il est contrôlé : aucun
 *   chiffre, aucun nom interne, une longueur bornée. Sinon, texte fixe.
 */

export const NATURES = ["salutation", "remerciement", "aide", "autre"] as const;
export type Nature = (typeof NATURES)[number];

const LONGUEUR_MAX = 300;

const REPLI: Record<Nature, string> = {
    salutation:
        "Bonjour ! Je suis l'assistant de votre ERP. Posez-moi une question sur vos données, "
        + "ou demandez-moi ce que je sais faire.",
    remerciement: "Avec plaisir ! N'hésitez pas si vous avez une autre question.",
    aide: "",
    autre:
        "Je réponds aux questions sur les données de l'ERP et j'effectue certaines opérations. "
        + "Demandez-moi ce que je sais faire pour en voir la liste.",
};

/** « a, b et c ». */
function enumerer(elements: string[]): string {
    if (elements.length <= 1) return elements.join("");
    return `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`;
}

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Ce que le rôle peut faire, déduit du catalogue et des actions. */
export function capacites(role: string): string {
    const vues = Object.values(CATALOGUE)
        .filter((v) => v.roles.includes(role))
        .map((v) => `les ${v.entite.pluriel}`);

    const actions = actionsPourRole(role as Role).map((a) => minuscule(a.libelle));
    if (ROLES_IMPORT.includes(role)) actions.push("importer une facture fournisseur à partir de sa photo");

    const phrases: string[] = [];
    phrases.push(vues.length
        ? `Avec votre profil, je peux consulter ${enumerer(vues)}.`
        : "Votre profil ne donne accès à aucune donnée.");
    if (actions.length) {
        phrases.push(`Je peux aussi ${enumerer(actions)}. Chaque modification vous est présentée pour confirmation avant d'être enregistrée.`);
    }
    phrases.push("Vous pouvez écrire votre question ou la dicter au micro.");
    return phrases.join(" ");
}

/** Le texte libre du modèle est-il affichable tel quel ? */
export function texteAcceptable(t: unknown): t is string {
    if (typeof t !== "string") return false;
    const s = t.trim();
    return s.length > 0
        && s.length <= LONGUEUR_MAX
        && !/\d/.test(s)                       // aucun chiffre : rien à rater
        && !/\b(v_|SELECT|FROM)\w*/i.test(s);  // aucun nom interne
}

export function repondreConversation(spec: { nature?: unknown; reponse?: unknown }, role: string): string {
    const nature: Nature = NATURES.includes(spec.nature as Nature) ? (spec.nature as Nature) : "autre";
    if (nature === "aide") return capacites(role);
    return texteAcceptable(spec.reponse) ? spec.reponse.trim() : REPLI[nature];
}
