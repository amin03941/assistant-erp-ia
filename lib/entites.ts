import { CATALOGUE } from "./catalogue";

/**
 * Résolution des entités dans les filtres de lecture.
 *
 * Deux défauts sont corrigés ici, et ils ont la même cause : le modèle propose
 * une valeur libre, et rien ne vérifie qu'elle a la forme attendue par la
 * colonne visée.
 *
 * 1. « les commandes d'Epsilon Services » produit
 *    {field:"customer_reference", value:"Epsilon Services"}, alors que cette
 *    colonne contient CLI-005. Zéro ligne, et un message affirmant qu'il n'y a
 *    aucune commande — alors qu'elles existent.
 *
 * 2. « ses factures » ne porte aucun nom. Le sujet du tour précédent doit
 *    traverser le changement de vue, ce que le mode nouvelle/affinement ne
 *    sait pas faire puisqu'il gouverne les filtres d'une même vue.
 *
 * Le principe est celui de l'écriture : le modèle dit « le client s'appelle
 * Epsilon Services », le CODE cherche en base — par référence puis par nom —
 * et réécrit le filtre avec la valeur canonique.
 */

// ---------------------------------------------------------------------------
// Déclaration des entités
// ---------------------------------------------------------------------------

type Entite = {
    libelle: string;
    genre: "m" | "f";
    /** Vue interrogée pour résoudre. Une vue, donc les droits s'appliquent. */
    vue: string;
    /** Colonne identifiante dans cette vue. */
    cle: string;
    /** Colonne parlante dans cette vue. Identique à la clé si l'entité n'en a pas. */
    nom: string;
};

export const ENTITES: Record<string, Entite> = {
    client: { libelle: "client", genre: "m", vue: "v_customers", cle: "reference", nom: "name" },
    produit: { libelle: "produit", genre: "m", vue: "v_products", cle: "reference", nom: "name" },
    facture: { libelle: "facture", genre: "f", vue: "v_sales_invoices", cle: "invoice_number", nom: "invoice_number" },
    commande: { libelle: "commande", genre: "f", vue: "v_sales_orders", cle: "reference", nom: "reference" },
    fournisseur: { libelle: "fournisseur", genre: "m", vue: "v_suppliers", cle: "reference", nom: "name" },
};

type Marque = { entite: string; role: "cle" | "nom" };

/**
 * Quelles colonnes de quelles vues désignent quelle entité. C'est la seule
 * table à compléter quand une vue s'ajoute au catalogue.
 */
export const COLONNES_ENTITE: Record<string, Record<string, Marque>> = {
    v_customers: {
        reference: { entite: "client", role: "cle" },
        name: { entite: "client", role: "nom" },
    },
    v_products: {
        reference: { entite: "produit", role: "cle" },
        name: { entite: "produit", role: "nom" },
    },
    v_sales_orders: {
        reference: { entite: "commande", role: "cle" },
        customer_reference: { entite: "client", role: "cle" },
        customer_name: { entite: "client", role: "nom" },
    },
    v_sales_order_items: {
        order_reference: { entite: "commande", role: "cle" },
        product_reference: { entite: "produit", role: "cle" },
        product_name: { entite: "produit", role: "nom" },
        customer_name: { entite: "client", role: "nom" },
    },
    v_sales_invoices: {
        invoice_number: { entite: "facture", role: "cle" },
        order_reference: { entite: "commande", role: "cle" },
        customer_reference: { entite: "client", role: "cle" },
        customer_name: { entite: "client", role: "nom" },
    },
    v_sales_invoice_items: {
        invoice_number: { entite: "facture", role: "cle" },
        product_reference: { entite: "produit", role: "cle" },
        product_name: { entite: "produit", role: "nom" },
        customer_name: { entite: "client", role: "nom" },
    },
    v_customer_payments: {
        invoice_number: { entite: "facture", role: "cle" },
        customer_name: { entite: "client", role: "nom" },
    },
    v_suppliers: {
        reference: { entite: "fournisseur", role: "cle" },
        name: { entite: "fournisseur", role: "nom" },
    },
    v_purchase_invoices: {
        supplier_reference: { entite: "fournisseur", role: "cle" },
        supplier_name: { entite: "fournisseur", role: "nom" },
    },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Filtre = { field: string; op: string; value: unknown };

/** Ce dont parle la conversation, reporté d'un tour à l'autre. */
export type Sujets = Record<string, { cle: string; nom: string }>;

export type ResolutionFiltres =
    | { etat: "ok"; filtres: Filtre[]; sujets: Sujets }
    | { etat: "introuvable"; message: string; choix: string[] }
    | { etat: "ambigu"; message: string; choix: string[] };

type Interrogeable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function aplatir(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** La vue de résolution est-elle ouverte à ce rôle ? Sinon, on ne résout pas. */
function lisible(vue: string, role: string): boolean {
    return CATALOGUE[vue]?.roles.includes(role) ?? false;
}

/**
 * Colonne de la vue courante capable de porter cette entité, la plus précise
 * d'abord. v_customer_payments n'expose que customer_name : le filtre portera
 * sur le nom, pas sur une référence absente.
 */
function colonnePour(vue: string, entite: string): Marque & { colonne: string } | null {
    const cols = COLONNES_ENTITE[vue];
    if (!cols) return null;

    for (const role of ["cle", "nom"] as const) {
        const trouve = Object.entries(cols).find(([, m]) => m.entite === entite && m.role === role);
        if (trouve) return { colonne: trouve[0], entite, role };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Résolution d'une valeur contre la base
// ---------------------------------------------------------------------------

type Trouvaille =
    | { etat: "ok"; cle: string; nom: string }
    | { etat: "ambigu"; choix: { cle: string; nom: string }[] }
    | { etat: "introuvable"; suggestions: { cle: string; nom: string }[] };

async function chercher(cx: Interrogeable, e: Entite, saisie: string): Promise<Trouvaille> {
    const motif = `%${saisie.trim()}%`;
    const { rows } = await cx.query(
        `SELECT ${e.cle} AS cle, ${e.nom} AS nom
       FROM ${e.vue}
      WHERE ${e.cle} ILIKE $1 OR ${e.nom} ILIKE $1
      ORDER BY ${e.nom}
      LIMIT 6`,
        [motif],
    );

    if (rows.length === 0) {
        const { rows: dispo } = await cx.query(
            `SELECT ${e.cle} AS cle, ${e.nom} AS nom FROM ${e.vue} ORDER BY ${e.nom} LIMIT 5`,
        );
        return { etat: "introuvable", suggestions: dispo };
    }

    if (rows.length === 1) return { etat: "ok", cle: rows[0].cle, nom: rows[0].nom };

    // Une correspondance exacte l'emporte sur les correspondances partielles.
    const vise = aplatir(saisie);
    const exacts = rows.filter((r) => aplatir(r.cle) === vise || aplatir(r.nom) === vise);
    if (exacts.length === 1) return { etat: "ok", cle: exacts[0].cle, nom: exacts[0].nom };

    return { etat: "ambigu", choix: rows };
}

/**
 * La valeur est-elle exactement l'identifiant d'une AUTRE entité ?
 *
 * « donner les produits de cette commande » : le modèle choisit les lignes de
 * facture et range CMD-2026-0031 dans invoice_number, faute de colonne
 * commande. Chercher une facture nommée CMD-… ne mène à rien ; reconnaître
 * une commande permet soit de déplacer le filtre, soit de dire pourquoi la vue
 * ne peut pas répondre — au lieu de proposer cinq factures sans rapport.
 */
async function reconnaitreAilleurs(
    cx: Interrogeable,
    exclue: string,
    saisie: string,
    role: string,
): Promise<{ entite: string; cle: string; nom: string } | null> {
    for (const [nom, e] of Object.entries(ENTITES)) {
        if (nom === exclue || !lisible(e.vue, role)) continue;
        const { rows } = await cx.query(
            `SELECT ${e.cle} AS cle, ${e.nom} AS nom FROM ${e.vue} WHERE ${e.cle} ILIKE $1 LIMIT 2`,
            [saisie.trim()],
        );
        if (rows.length === 1) return { entite: nom, cle: rows[0].cle, nom: rows[0].nom };
    }
    return null;
}

const aucun = (e: Entite) => (e.genre === "f" ? "Aucune" : "Aucun");
const lequel = (e: Entite) => (e.genre === "f" ? "Laquelle" : "Lequel");

// ---------------------------------------------------------------------------
// Résolution de tous les filtres d'une spécification
// ---------------------------------------------------------------------------

const OPS_RESOLUBLES = new Set(["eq", "like"]);

/**
 * Réécrit chaque filtre portant sur une entité avec la valeur canonique de la
 * colonne visée. Une valeur qui ne correspond à rien devient un refus explicite
 * et non une liste vide : « aucune commande » est un mensonge quand le filtre
 * était simplement mal formé.
 */
export async function resoudreFiltres(
    cx: Interrogeable,
    vue: string,
    filtres: Filtre[],
    role: string,
): Promise<ResolutionFiltres> {
    const sortie: Filtre[] = [];
    const sujets: Sujets = {};

    for (const f of filtres) {
        const marque = COLONNES_ENTITE[vue]?.[f.field];
        const valeurTexte = typeof f.value === "string" ? f.value.trim() : "";

        if (!marque || !OPS_RESOLUBLES.has(f.op) || valeurTexte === "") {
            sortie.push(f);
            continue;
        }

        const e = ENTITES[marque.entite];
        if (!e || !lisible(e.vue, role)) {
            sortie.push(f);
            continue;
        }

        const r = await chercher(cx, e, valeurTexte);

        if (r.etat === "introuvable") {
            const autre = await reconnaitreAilleurs(cx, marque.entite, valeurTexte, role);
            if (autre) {
                const cible = colonnePour(vue, autre.entite);
                const ea = ENTITES[autre.entite];
                if (!cible) {
                    const lignes = CATALOGUE[vue]?.entite.pluriel ?? "données";
                    return {
                        etat: "introuvable",
                        message: `« ${valeurTexte} » est ${ea.genre === "f" ? "une" : "un"} ${ea.libelle} : `
                            + `les ${lignes} ne peuvent pas être filtrées par ${ea.libelle}.`,
                        choix: [],
                    };
                }
                sujets[autre.entite] = { cle: autre.cle, nom: autre.nom };
                sortie.push({ field: cible.colonne, op: "eq", value: cible.role === "cle" ? autre.cle : autre.nom });
                continue;
            }
            return {
                etat: "introuvable",
                message: `${aucun(e)} ${e.libelle} ne correspond à « ${valeurTexte} ».`,
                choix: r.suggestions.map((s) => (s.cle === s.nom ? s.cle : `${s.cle} — ${s.nom}`)),
            };
        }

        if (r.etat === "ambigu") {
            return {
                etat: "ambigu",
                message: `Plusieurs ${e.libelle}s correspondent à « ${valeurTexte} ». ${lequel(e)} ?`,
                choix: r.choix.map((s) => (s.cle === s.nom ? s.cle : `${s.cle} — ${s.nom}`)),
            };
        }

        sujets[marque.entite] = { cle: r.cle, nom: r.nom };

        // La colonne effective peut différer de celle proposée par le modèle :
        // on prend la plus précise que la vue expose pour cette entité.
        const cible = colonnePour(vue, marque.entite) ?? { colonne: f.field, role: marque.role };
        sortie.push({
            field: cible.colonne,
            op: "eq",
            value: cible.role === "cle" ? r.cle : r.nom,
        });
    }

    return { etat: "ok", filtres: sortie, sujets };
}

// ---------------------------------------------------------------------------
// Report du sujet d'un tour à l'autre
// ---------------------------------------------------------------------------

/**
 * Reprises certaines, reconnaissables par la grammaire seule : un démonstratif
 * suivi d'un nom d'entité (« cette commande », « ces factures ») ou un
 * possessif (« ses », « sa », « leurs »). Le modèle signale les reprises plus
 * subtiles (« le même client », « pour lui ») ; ce filet couvre les cas où il
 * l'oublie. Les noms viennent des entités déclarées : « de cette année » n'est
 * pas une reprise, « année » n'étant pas une entité.
 */
export function repriseExplicite(question: string): boolean {
    const q = aplatir(question);
    const noms = Object.values(ENTITES).map((e) => aplatir(e.libelle)).join("|");
    return new RegExp(`\\b(ce|cet|cette|ces) (${noms})s?\\b`).test(q)
        || /\b(ses|sa|son|leur|leurs)\b/.test(q);
}

/** Le sujet retenu au dernier tour utile, s'il y en a un. */
export function sujetsPrecedents(tours: { query_spec?: any }[]): Sujets {
    for (let i = tours.length - 1; i >= 0; i--) {
        const s = tours[i]?.query_spec?.sujets;
        if (s && typeof s === "object" && Object.keys(s).length > 0) return s as Sujets;
    }
    return {};
}

/**
 * Ajoute au besoin le filtre correspondant au sujet en cours.
 *
 * Le partage des rôles : RECONNAÎTRE une reprise est une affaire de
 * compréhension, c'est le modèle qui la signale (`reprise`). Une liste de
 * mots s'y trompait — « de cette » faisait de « les factures de cette année »
 * une reprise du client précédent. APPLIQUER la reprise est une affaire
 * exacte : le code choisit la colonne et la valeur. Le filtre n'est ajouté
 * que si la vue ne porte encore aucun filtre sur cette entité.
 */
export function reporterSujet(
    reprise: boolean,
    vue: string,
    filtres: Filtre[],
    sujets: Sujets,
): { filtres: Filtre[]; sujets: Sujets; applique: string | null } {
    if (!reprise) return { filtres, sujets: {}, applique: null };

    const dejaFiltrees = new Set(
        filtres.map((f) => COLONNES_ENTITE[vue]?.[f.field]?.entite).filter(Boolean) as string[],
    );

    // Tous les sujets du tour précédent sont reportés, pas seulement le premier :
    // ils ont été appliqués ensemble, donc ils sont cohérents. Ne garder que le
    // client faisait perdre la commande dans « les produits de cette commande ».
    const ajoutes: Filtre[] = [];
    const reportes: Sujets = {};
    const libelles: string[] = [];

    for (const [entite, valeur] of Object.entries(sujets)) {
        if (dejaFiltrees.has(entite)) continue;

        const cible = colonnePour(vue, entite);
        if (!cible) continue;

        ajoutes.push({ field: cible.colonne, op: "eq", value: cible.role === "cle" ? valeur.cle : valeur.nom });
        reportes[entite] = valeur;
        libelles.push(`${ENTITES[entite]?.libelle ?? entite} ${valeur.nom}`);
    }

    if (ajoutes.length === 0) return { filtres, sujets: {}, applique: null };
    return { filtres: [...filtres, ...ajoutes], sujets: reportes, applique: libelles.join(", ") };
}