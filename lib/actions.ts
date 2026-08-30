import type { PoolClient } from "pg";

/**
 * Catalogue des actions d'écriture.
 *
 * Tout ce qui varie d'une action à l'autre est déclaré ici. Le prompt du modèle,
 * le schéma JSON de sa sortie, la normalisation des valeurs, la résolution des
 * cibles et les questions de clarification en sont DÉDUITS. Ajouter une action
 * ne demande de toucher à aucun autre fichier.
 *
 * Le modèle ne produit jamais de SQL ni de nom de colonne : il choisit un code
 * dans une liste fermée et propose des valeurs brutes, que le code normalise.
 */

export const ROLES = ["ADMIN", "SALES", "ACCOUNTANT", "MANAGER"] as const;
export type Role = (typeof ROLES)[number];

export function estRole(v: unknown): v is Role {
    return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// À VÉRIFIER une fois contre les contraintes CHECK de la base — voir README
// ---------------------------------------------------------------------------

/**
 * Valeurs imposées par les contraintes CHECK de schema.sql. Toute divergence
 * est rejetée par PostgreSQL à l'exécution, pas à la compilation : elles sont
 * regroupées ici pour n'avoir qu'un endroit à corriger.
 *
 *   sales_invoices.status   IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')
 *   sales_invoices.source   IN ('MANUAL','IMPORT','SEED')
 *   customer_payments.status IN ('PENDING','CONFIRMED','FAILED')
 */
const STATUT_FACTURE_INITIAL = "ISSUED";
const SOURCE_FACTURE = "MANUAL";
const STATUT_PAIEMENT = "CONFIRMED";
/** Délai de paiement retenu si le client n'en déclare aucun. */
const DELAI_PAIEMENT_DEFAUT = 30;

// ---------------------------------------------------------------------------
// Types du catalogue
// ---------------------------------------------------------------------------

type TypeChamp = "texte" | "email" | "telephone" | "montant" | "entier" | "date" | "liste";

/** Valeur d'énumération et ses formulations courantes. */
type Option = {
    /** Valeur écrite en base — doit respecter la contrainte CHECK de la colonne. */
    code: string;
    /** Formulations acceptées en entrée. La première sert aussi à l'affichage. */
    synonymes?: readonly string[];
};

export type Champ = {
    colonne: string;
    libelle: string;
    type: TypeChamp;
    requis: boolean;
    /** Question posée à l'utilisateur si le champ manque. Déduite du libellé sinon. */
    invite?: string;
    max?: number;
    min?: number;
    options?: readonly Option[];
    defaut?: () => string | number;
};

/**
 * Comment retrouver la ligne visée par une action.
 *
 * `jointure`, `filtre` et `tri` sont des fragments SQL DÉCLARÉS ICI, jamais
 * produits par le modèle : ils font partie du catalogue au même titre qu'un nom
 * de colonne. C'est ce qui permet à une cible de porter sur autre chose qu'une
 * table isolée — une commande se désigne par son client, pas seulement par sa
 * référence.
 */
type Cible = {
    libelle: string;
    invite: string;
    /** Comment l'utilisateur désigne cette cible en pratique. Injecté dans le
     *  prompt : le modèle ne peut pas deviner que le nom d'un client suffit à
     *  désigner une facture, alors que `recherche` le dit déjà au code. */
    designations?: string;
    /** Table ou expression FROM complète (jointures comprises). */
    table: string;
    /** Colonne renvoyée et stockée dans le payload une fois la cible résolue. */
    cle: string;
    /** Colonnes interrogées pour retrouver la ligne à partir de ce que l'utilisateur a écrit. */
    recherche: readonly string[];
    /** Expression affichée quand il faut lever une ambiguïté. */
    affichage: string;
    /** Condition permanente : ce qui n'est pas éligible n'apparaît jamais. */
    filtre?: string;
    /** Message affiché quand la ligne existe mais que le filtre l'écarte. */
    motifExclu?: string;
    /** Expression de tri, sans direction. Le plus récent d'abord par défaut. */
    tri?: string;
    /** Mots à ignorer dans la saisie, propres à ce domaine. */
    bruit?: readonly string[];
};

/** Lignes supplémentaires affichées dans la carte de confirmation. */
type Apercu = (
    cx: PoolClient,
    cle: string,
) => Promise<{ libelle: string; valeur: string }[]>;

export type Action = {
    code: string;
    libelle: string;
    /** Formulations typiques, injectées dans le prompt pour aider le classement. */
    exemples: readonly string[];
    operation: "creation" | "modification";
    roles: readonly Role[];
    cible?: Cible;
    champs: readonly Champ[];
    /**
     * Ce que l'utilisateur doit voir avant de confirmer, en plus des champs qu'il
     * a saisis. Une facture n'a presque aucun champ propre : sans cet aperçu, la
     * carte de confirmation serait vide de sens.
     */
    apercu?: Apercu;
};

// ---------------------------------------------------------------------------
// Cibles
// ---------------------------------------------------------------------------

const CIBLE_CLIENT: Cible = {
    libelle: "client",
    invite: "De quel client s'agit-il ? Donne sa référence ou son nom.",
    designations: "sa référence (CLI-…), ou son nom",
    table: "customers",
    cle: "reference",
    recherche: ["reference", "name"],
    affichage: `reference || ' — ' || name`,
    tri: "name",
};

const CIBLE_FACTURE: Cible = {
    libelle: "facture",
    invite: "Sur quelle facture ce paiement doit-il être imputé ?",
    designations: "son numéro (FAC-…), ou le nom du client concerné",
    table: `sales_invoices f JOIN customers c ON c.id = f.customer_id`,
    cle: "f.invoice_number",
    recherche: ["f.invoice_number", "c.name"],
    affichage: `f.invoice_number || ' — ' || c.name || ' — reste ' ||
              to_char(f.total_amount - f.paid_amount, 'FM999G999G990D000') || ' TND'`,
    // Une facture soldée n'est pas une cible de paiement.
    filtre: "f.total_amount > f.paid_amount",
    motifExclu: "Cette facture est déjà soldée.",
    tri: "f.due_date",
    bruit: ["client", "societe", "numero"],
};

const CIBLE_COMMANDE: Cible = {
    libelle: "commande",
    invite: "Quelle commande faut-il facturer ? Donne sa référence ou le nom du client.",
    designations: "sa référence (CMD-…), ou le nom du client concerné",
    table: `sales_orders o JOIN customers c ON c.id = o.customer_id`,
    cle: "o.reference",
    recherche: ["o.reference", "c.name"],
    affichage: `o.reference || ' — ' || c.name || ' — ' ||
              to_char(o.order_date, 'DD/MM/YYYY') || ' — ' ||
              to_char(o.total_amount, 'FM999G999G990D000') || ' TND'`,
    // Une commande déjà facturée n'est plus facturable : la règle métier est
    // portée par la recherche, pas seulement par un contrôle tardif.
    filtre: `NOT EXISTS (SELECT 1 FROM sales_invoices i WHERE i.sales_order_id = o.id)`,
    motifExclu: "Cette commande a déjà été facturée.",
    tri: "o.order_date",
    bruit: ["client", "commande", "bon"],
};

// ---------------------------------------------------------------------------
// Aperçus
// ---------------------------------------------------------------------------

const APERCU_COMMANDE: Apercu = async (cx, reference) => {
    const { rows } = await cx.query<{
        client: string;
        order_date: string;
        lignes: string;
        subtotal_amount: string;
        tax_amount: string;
        total_amount: string;
        payment_terms_days: number | null;
    }>(
        `SELECT c.name AS client,
            to_char(o.order_date, 'DD/MM/YYYY') AS order_date,
            (SELECT count(*) FROM sales_order_items i WHERE i.sales_order_id = o.id) AS lignes,
            o.subtotal_amount, o.tax_amount, o.total_amount,
            c.payment_terms_days
       FROM sales_orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE o.reference = $1`,
        [reference],
    );
    if (rows.length === 0) return [];

    const r = rows[0];
    const delai = r.payment_terms_days ?? DELAI_PAIEMENT_DEFAUT;

    return [
        { libelle: "client", valeur: r.client },
        { libelle: "date de la commande", valeur: r.order_date },
        { libelle: "lignes reprises", valeur: `${r.lignes}` },
        { libelle: "montant hors taxe", valeur: montantFr(r.subtotal_amount) },
        { libelle: "taxes", valeur: montantFr(r.tax_amount) },
        { libelle: "total à facturer", valeur: montantFr(r.total_amount) },
        { libelle: "délai de paiement", valeur: `${delai} jours` },
    ];
};

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

const CHAMPS_CLIENT: readonly Champ[] = [
    { colonne: "name", libelle: "nom", type: "texte", requis: true, max: 200, invite: "Quel est le nom du client ?" },
    { colonne: "tax_identifier", libelle: "matricule fiscal", type: "texte", requis: false, max: 50 },
    { colonne: "email", libelle: "adresse e-mail", type: "email", requis: false, max: 150 },
    { colonne: "phone", libelle: "téléphone", type: "telephone", requis: false, max: 30 },
    { colonne: "address", libelle: "adresse", type: "texte", requis: false, max: 500 },
    { colonne: "payment_terms_days", libelle: "délai de paiement (jours)", type: "entier", requis: false, min: 0, max: 365 },
    {
        colonne: "status",
        libelle: "statut",
        type: "liste",
        requis: false,
        options: [
            { code: "ACTIVE", synonymes: ["actif", "active", "en activite"] },
            { code: "ARCHIVED", synonymes: ["archive", "archivee", "inactif", "inactive", "desactive"] },
        ],
    },
];

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const ACTIONS: readonly Action[] = [
    {
        code: "CREATE_CUSTOMER",
        libelle: "Créer un client",
        exemples: ["ajoute un client", "crée un nouveau client", "enregistre la société X comme client"],
        operation: "creation",
        roles: ["MANAGER", "SALES"],
        champs: CHAMPS_CLIENT,
    },
    {
        code: "UPDATE_CUSTOMER",
        libelle: "Modifier un client",
        exemples: [
            "modifie le téléphone du client X",
            "change l'email de la société Y",
            "mets à jour l'adresse de X",
        ],
        operation: "modification",
        roles: ["MANAGER", "SALES"],
        cible: CIBLE_CLIENT,
        champs: CHAMPS_CLIENT,
    },
    {
        code: "CREATE_SALES_INVOICE",
        libelle: "Facturer une commande",
        exemples: [
            "facture la commande CMD-2026-0158",
            "établis la facture de la dernière commande de la société X",
            "crée une facture pour cette commande",
            "génère la facture du client Y",
        ],
        operation: "creation",
        roles: ["MANAGER", "ACCOUNTANT"],
        cible: CIBLE_COMMANDE,
        apercu: APERCU_COMMANDE,
        champs: [
            {
                colonne: "invoice_date",
                libelle: "date de la facture",
                type: "date",
                requis: true,
                defaut: () => new Date().toISOString().slice(0, 10),
            },
            {
                colonne: "due_date",
                libelle: "date d'échéance",
                type: "date",
                requis: false,
                // Calculée depuis le délai de paiement du client si elle n'est pas dite.
            },
            { colonne: "notes", libelle: "note", type: "texte", requis: false, max: 500 },
        ],
    },
    {
        code: "CREATE_CUSTOMER_PAYMENT",
        libelle: "Enregistrer un paiement client",
        exemples: [
            "enregistre un paiement de 5000 sur la facture X",
            "le client a payé 1200 dinars",
            "encaisse un règlement par chèque",
        ],
        operation: "creation",
        roles: ["MANAGER", "ACCOUNTANT"],
        cible: CIBLE_FACTURE,
        champs: [
            {
                colonne: "amount",
                libelle: "montant",
                type: "montant",
                requis: true,
                min: 0.001,
                invite: "Quel est le montant du paiement ?",
            },
            {
                colonne: "payment_method",
                libelle: "moyen de paiement",
                type: "liste",
                requis: true,
                invite: "Par quel moyen le paiement a-t-il été effectué ?",
                options: [
                    { code: "BANK_TRANSFER", synonymes: ["virement", "virement bancaire", "transfert", "vir"] },
                    { code: "CHECK", synonymes: ["cheque", "chèque", "par cheque", "chq"] },
                    { code: "CASH", synonymes: ["especes", "espèces", "cash", "liquide", "comptant"] },
                    { code: "CARD", synonymes: ["carte", "carte bancaire", "cb", "tpe"] },
                    { code: "OTHER", synonymes: ["autre", "traite", "lettre de change", "effet"] },
                ],
            },
            {
                colonne: "payment_date",
                libelle: "date du paiement",
                type: "date",
                requis: true,
                defaut: () => new Date().toISOString().slice(0, 10),
            },
            { colonne: "external_reference", libelle: "référence externe", type: "texte", requis: false, max: 100 },
        ],
    },
] as const;

export function actionParCode(code: string): Action | undefined {
    return ACTIONS.find((a) => a.code === code);
}

export function actionsPourRole(role: Role): readonly Action[] {
    return ACTIONS.filter((a) => a.roles.includes(role));
}

// ---------------------------------------------------------------------------
// Normalisation — une fonction par type, valable pour tout champ de ce type
// ---------------------------------------------------------------------------

/** Minuscules, sans accents, sans ponctuation : base de toute comparaison. */
function aplatir(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

const MOIS: Record<string, number> = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function lireDate(brut: string): string | null {
    const s = aplatir(brut);
    const jour = new Date();

    if (/^(aujourd hui|ce jour|maintenant|today)$/.test(s)) {
        return jour.toISOString().slice(0, 10);
    }
    if (/^(hier|la veille)$/.test(s)) {
        jour.setDate(jour.getDate() - 1);
        return jour.toISOString().slice(0, 10);
    }
    if (/^(demain)$/.test(s)) {
        jour.setDate(jour.getDate() + 1);
        return jour.toISOString().slice(0, 10);
    }

    // 2026-08-15
    let m = brut.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return composer(+m[1], +m[2], +m[3]);

    // 15/08/2026, 15-08-26, 15.08.2026
    m = brut.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
        const an = +m[3] < 100 ? 2000 + +m[3] : +m[3];
        return composer(an, +m[2], +m[1]);
    }

    // 15 aout 2026, 1er septembre 2026, 3 mars
    m = s.match(/^(\d{1,2})(?:\s*er)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if (m && MOIS[m[2]]) {
        return composer(m[3] ? +m[3] : new Date().getFullYear(), MOIS[m[2]], +m[1]);
    }

    return null;
}

function composer(an: number, mois: number, j: number): string | null {
    if (mois < 1 || mois > 12 || j < 1 || j > 31) return null;
    const d = new Date(Date.UTC(an, mois - 1, j));
    if (d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== j) return null;
    return d.toISOString().slice(0, 10);
}

function lireMontant(brut: unknown): number | null {
    if (typeof brut === "number") return Number.isFinite(brut) ? arrondir(brut) : null;

    let s = String(brut).toLowerCase();
    s = s.replace(/tnd|dinars?|dt|millimes?|€|\$/g, "").replace(/\s/g, "").trim();
    if (!s) return null;

    const virgule = s.lastIndexOf(",");
    const point = s.lastIndexOf(".");

    if (virgule >= 0 && point >= 0) {
        s = virgule > point ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (virgule >= 0) {
        s = s.replace(",", ".");
    } else if (point >= 0) {
        // « 5.000 » et « 1.234.567 » sont des séparateurs de milliers ;
        // « 5.5 » et « 5000.500 » sont des décimales.
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    }

    const n = Number(s);
    return Number.isFinite(n) ? arrondir(n) : null;
}

/** Formulations qui signifient « pas de valeur », quel que soit le champ. */
const NON_VALEURS = new Set([
    "null", "none", "aucun", "aucune", "vide", "inconnu", "inconnue",
    "non mentionne", "non precise", "non renseigne", "non applicable", "n a", "na",
]);

/** Dinar tunisien : trois décimales. */
function arrondir(n: number) {
    return Math.round(n * 1000) / 1000;
}

function montantFr(v: string | number): string {
    return (
        Number(v)
            .toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
            .replace(/\u202F|\u00A0/g, " ") + " TND"
    );
}

function lireOption(champ: Champ, brut: string): string | null {
    const s = aplatir(brut);
    if (!s || !champ.options) return null;

    for (const o of champ.options) {
        const formes = [o.code, ...(o.synonymes ?? [])].map(aplatir);
        if (formes.some((f) => f === s)) return o.code;
        if (formes.some((f) => s.includes(f) || f.includes(s))) return o.code;
    }
    return null;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliser(champ: Champ, brut: unknown): string | number | null {
    if (brut === null || brut === undefined) return null;
    const texte = String(brut).trim();
    if (texte === "" || NON_VALEURS.has(aplatir(texte))) return null;

    switch (champ.type) {
        case "montant":
            return lireMontant(brut);

        case "entier": {
            // Le modèle recopie le passage entier — « délai de paiement de 45
            // jours » — parce que la consigne le lui demande. Extraire le nombre
            // est le pendant de lireMontant() : la lecture appartient au code.
            const m = String(brut).match(/-?\d+(?:[.,]\d+)?/);
            if (!m) return null;
            const n = Number(m[0].replace(",", "."));
            return Number.isFinite(n) ? Math.round(n) : null;
        }

        case "date":
            return lireDate(texte);

        case "liste":
            return lireOption(champ, texte);

        case "email": {
            const v = texte.toLowerCase().replace(/^(mail|email|e-mail)\s*:?\s*/i, "");
            return RE_EMAIL.test(v) ? v : null;
        }

        case "telephone": {
            const chiffres = texte.replace(/\D/g, "");
            return chiffres.length >= 6 && chiffres.length <= 15 ? texte : null;
        }

        default:
            return texte;
    }
}

/**
 * Le modèle laisse parfois un champ numérique vide quand la phrase sépare le
 * nom du champ de sa valeur — « modifie le délai de paiement du client X en 60
 * jours ». Le code va chercher lui-même : un nombre situé près des mots du
 * libellé. Appelé UNIQUEMENT quand le modèle n'a rien fourni.
 */
export function chercherNombre(champ: Champ, phrase: string): string | null {
    const mots = aplatir(champ.libelle)
        .split(" ")
        .filter((m) => m.length >= 4 && !/^\d+$/.test(m));
    if (mots.length === 0) return null;

    const texte = aplatir(phrase);
    // Position du premier mot du libellé présent dans la phrase — pas du
    // dernier : un libellé comme « délai de paiement (jours) » contient son
    // unité, qui reparaît naturellement APRÈS le nombre (« ... en 60 jours »).
    // Ancrer sur ce mot-là ferait chercher un nombre après un texte qui n'en
    // contient plus.
    let ancre = -1;
    for (const m of mots) {
        const i = texte.indexOf(m);
        if (i < 0) continue;
        const fin = i + m.length;
        if (ancre < 0 || fin < ancre) ancre = fin;
    }
    if (ancre < 0) return null;

    // Le premier nombre qui suit. « en 60 jours » vient après « délai de paiement ».
    const suite = texte.slice(ancre);
    const m = suite.match(/\d+(?:[.,]\d+)?/);
    return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// Préparation : valide ce qui est fourni, liste ce qui manque
// ---------------------------------------------------------------------------

export type Manquant = { colonne: string; libelle: string; invite: string };

export type Preparation =
    | { etat: "ok"; valeurs: Record<string, string | number>; cible?: string }
    | {
        etat: "incomplet";
        valeurs: Record<string, string | number>;
        cible?: string;
        manquants: Manquant[];
    }
    | { etat: "refus"; motif: string };

function invitePour(c: { libelle: string; invite?: string }): string {
    return c.invite ?? `Quelle valeur pour « ${c.libelle} » ?`;
}

/**
 * Ne rejette que ce qui est réellement invalide. Ce qui manque n'est pas une
 * erreur : c'est une question à poser. C'est la différence entre un assistant
 * et un formulaire.
 */
export function preparer(
    action: Action,
    role: Role,
    brut: Record<string, unknown>,
    cibleBrute?: unknown,
    phrase?: string,
): Preparation {
    if (!action.roles.includes(role)) {
        return { etat: "refus", motif: `Le rôle ${role} n'est pas autorisé à effectuer cette action.` };
    }

    const manquants: Manquant[] = [];

    let cible: string | undefined;
    if (action.cible) {
        const v = cibleBrute == null ? "" : String(cibleBrute).trim();
        if (v) cible = v;
        else
            manquants.push({
                colonne: "__cible__",
                libelle: action.cible.libelle,
                invite: action.cible.invite,
            });
    }

    const valeurs: Record<string, string | number> = {};

    for (const champ of action.champs) {
        // Repli : le champ est vide et la phrase contient peut-être la valeur.
        let source = brut[champ.colonne];
        if (phrase && (champ.type === "entier" || champ.type === "montant")) {
            const rien = source === undefined || source === null || String(source).trim() === "";
            if (rien) source = chercherNombre(champ, phrase) ?? source;
        }
        const fourni = source !== undefined && source !== null;

        // En modification, ce qui désigne la cible n'est pas une valeur à
        // écrire : « modifie le téléphone du client Epsilon Services » ne
        // demande pas de renommer le client en « Epsilon Services ». Le prompt
        // le dit déjà au modèle ; le code ne s'en remet pas à lui.
        if (action.operation === "modification" && cible && fourni) {
            const valeurBrute = aplatir(String(source));
            if (valeurBrute && valeurBrute === aplatir(cible)) continue;
        }

        let v = normaliser(champ, source);

        // Valeur fournie mais inexploitable : ni une erreur immédiate ni un
        // manque silencieux. Elle devient une question si le champ est
        // obligatoire, un refus explicite sinon — jamais un mur.
        // Une absence exprimée en toutes lettres — null, aucun, non mentionné —
        // reste une absence, quelle que soit la formulation du modèle.
        const texteBrut = fourni ? String(source).trim() : "";
        const vide = texteBrut === "" || NON_VALEURS.has(aplatir(texteBrut));
        const illisible = v === null && !vide;

        // Le défaut ne comble qu'une absence. Remplacer « 32/13/2026 » par la date
        // du jour reviendrait à inventer une donnée à la place de l'utilisateur.
        if (v === null && !illisible && champ.defaut) v = champ.defaut();

        if (v === null) {
            const attendu = champ.options
                ? ` Attendu : ${champ.options.map((o) => o.code).join(", ")}.`
                : "";

            // Un champ obligatoire l'est à la création. Une modification ne porte
            // que sur ce que l'utilisateur mentionne : le reste garde sa valeur.
            if (champ.requis && action.operation === "creation") {
                // Ce que le code ne sait pas lire devient une question, pas un mur.
                manquants.push({
                    colonne: champ.colonne,
                    libelle: champ.libelle,
                    invite: illisible
                        ? `Je n'ai pas compris « ${texteBrut} » pour « ${champ.libelle} ».${attendu} ${invitePour(champ)}`
                        : invitePour(champ),
                });
            } else if (illisible) {
                return {
                    etat: "refus",
                    motif: `Je n'ai pas compris « ${texteBrut} » pour le champ « ${champ.libelle} ».${attendu}`,
                };
            }
            continue;
        }

        if (typeof v === "string" && champ.max && v.length > champ.max) {
            return { etat: "refus", motif: `Le champ « ${champ.libelle} » dépasse ${champ.max} caractères.` };
        }
        if (typeof v === "number") {
            if (champ.min !== undefined && v < champ.min) {
                return { etat: "refus", motif: `« ${champ.libelle} » doit être supérieur ou égal à ${champ.min}.` };
            }
            if (champ.max !== undefined && v > champ.max) {
                return { etat: "refus", motif: `« ${champ.libelle} » doit être inférieur ou égal à ${champ.max}.` };
            }
        }

        valeurs[champ.colonne] = v;
    }

    if (manquants.length > 0) return { etat: "incomplet", valeurs, cible, manquants };

    if (action.operation === "modification" && Object.keys(valeurs).length === 0) {
        return { etat: "refus", motif: "Aucune modification n'a été précisée." };
    }

    return { etat: "ok", valeurs, cible };
}

/** Fusionne l'état partiel conservé en base avec la nouvelle contribution. */
export function fusionner(
    precedent: { values: Record<string, unknown>; cible?: string },
    nouveau: { values?: Record<string, unknown>; cible?: string },
) {
    return {
        values: { ...precedent.values, ...(nouveau.values ?? {}) },
        cible: nouveau.cible ?? precedent.cible,
    };
}

/** Question posée à l'utilisateur quand il manque des informations. */
export function questionClarification(manquants: Manquant[]): string {
    if (manquants.length === 1) return manquants[0].invite;
    return (
        "Il me manque quelques informations :\n" +
        manquants.map((m) => `— ${m.libelle}`).join("\n")
    );
}

// ---------------------------------------------------------------------------
// Résolution de la cible — référence, nom, ou qualificatif
// ---------------------------------------------------------------------------

export type Resolution =
    | { etat: "ok"; cle: string; affichage: string }
    | { etat: "ambigu"; choix: { cle: string; affichage: string }[] }
    | { etat: "exclu"; cle: string; motif: string }
    | { etat: "introuvable"; suggestions: { cle: string; affichage: string }[] };

/** Mots grammaticaux, sans valeur discriminante dans une recherche. */
const MOTS_VIDES = new Set([
    "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "au", "aux",
    "pour", "sur", "chez", "ce", "cet", "cette", "son", "sa", "ses", "plus", "numero", "no", "n",
]);

/** « la dernière commande de X » : le qualificatif désigne un rang, pas un nom. */
const QUALIF_RECENT = new Set(["dernier", "derniere", "dernieres", "derniers", "recente", "recent", "nouvelle", "nouveau"]);
const QUALIF_ANCIEN = new Set(["premier", "premiere", "ancienne", "ancien", "initiale", "plus ancienne"]);

/**
 * Sépare ce que l'utilisateur a écrit en un critère de recherche et un rang.
 * Les mots retirés sont soit grammaticaux, soit le nom même de la cible
 * (« commande »), soit déclarés dans le catalogue — jamais devinés au cas par cas.
 */
function nettoyer(saisie: string, c: Cible): { texte: string; rang: "recent" | "ancien" | null } {
    // Nos listes affichent « CLÉ — libellé ». Renvoyé tel quel par un clic,
    // seul le segment de tête est un critère de recherche.
    const utile = saisie.split("—")[0].trim() || saisie;

    const ignores = new Set<string>(MOTS_VIDES);
    for (const mot of aplatir(c.libelle).split(" ")) ignores.add(mot);
    for (const b of c.bruit ?? []) for (const mot of aplatir(b).split(" ")) ignores.add(mot);

    let rang: "recent" | "ancien" | null = null;
    const gardes: string[] = [];

    for (const mot of utile.split(/\s+/)) {
        // « FAC-2026-0029. » doit valoir « FAC-2026-0029 » : la ponctuation de fin
        // de phrase n'appartient pas à la référence.
        const propre = mot.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        const a = aplatir(propre);
        if (!a) continue;
        if (QUALIF_RECENT.has(a)) { rang = "recent"; continue; }
        if (QUALIF_ANCIEN.has(a)) { rang = "ancien"; continue; }
        // « factures » vaut « facture » : le pluriel n'est pas un critère.
        const singulier = a.endsWith("s") ? a.slice(0, -1) : a;
        if (ignores.has(a) || ignores.has(singulier)) continue;
        gardes.push(propre);
    }

    return { texte: gardes.join(" ").trim(), rang };
}

/**
 * Personne ne dit « CMD-2026-0158 » spontanément : on dit « la dernière commande
 * de la société Alpha ». Le modèle transmet la phrase telle quelle, le backend
 * la résout contre la base.
 */
export async function resoudreCible(
    cx: PoolClient,
    action: Action,
    saisie: string,
): Promise<Resolution> {
    const c = action.cible;
    if (!c) return { etat: "introuvable", suggestions: [] };

    const { texte, rang } = nettoyer(saisie, c);

    const direction = rang === "ancien" ? "ASC" : "DESC";
    const filtre = c.filtre ? `(${c.filtre})` : "TRUE";
    const ordre = c.tri ?? c.cle;

    const mots = texte.split(/\s+/).filter((m) => m.length >= 3);

    // Sans critère textuel — « facture la dernière commande » — seul un rang peut
    // trancher. S'il n'y en a pas, on demande : on ne devine jamais une cible.
    if (mots.length === 0) {
        const { rows } = await cx.query<{ cle: string; affichage: string }>(
            `SELECT ${c.cle} AS cle, ${c.affichage} AS affichage
         FROM ${c.table} WHERE ${filtre}
        ORDER BY ${ordre} ${direction} LIMIT 6`,
        );
        if (rows.length === 0) return { etat: "introuvable", suggestions: [] };
        if (rang) return { etat: "ok", cle: rows[0].cle, affichage: rows[0].affichage };
        return { etat: "ambigu", choix: rows };
    }

    // Chaque mot compte pour lui-même, et on garde les lignes qui en satisfont le
    // plus. Un ILIKE sur la phrase entière échouait dès qu'un seul mot était de
    // trop — c'est ce qui rendait « pour Gamma SARL » introuvable.
    const score = mots
        .map(
            (_, i) =>
                `(CASE WHEN ${c.recherche.map((col) => `${col} ILIKE $${i + 1}`).join(" OR ")} THEN 1 ELSE 0 END)`,
        )
        .join(" + ");

    const { rows } = await cx.query<{ cle: string; affichage: string; score: string }>(
        `SELECT cle, affichage, score FROM (
       SELECT ${c.cle} AS cle, ${c.affichage} AS affichage,
              ${score} AS score, ${ordre} AS ordre
         FROM ${c.table} WHERE ${filtre}
     ) t
      WHERE score > 0
      ORDER BY score DESC, ordre ${direction}
      LIMIT 20`,
        mots.map((m) => `%${m}%`),
    );

    if (rows.length === 0) {
        // La ligne existe-t-elle en dehors du filtre ? « déjà facturée » et
        // « n'existe pas » appellent deux réponses différentes.
        if (c.filtre) {
            const { rows: hors } = await cx.query<{ cle: string; score: string }>(
                `SELECT cle, score FROM (
           SELECT ${c.cle} AS cle, ${score} AS score
             FROM ${c.table}
         ) t
          WHERE score > 0
          ORDER BY score DESC
          LIMIT 1`,
                mots.map((m) => `%${m}%`),
            );
            if (hors.length > 0) {
                return {
                    etat: "exclu",
                    cle: hors[0].cle,
                    motif: c.motifExclu ?? `Cette ${c.libelle} n'est pas éligible à cette action.`,
                };
            }
        }

        const { rows: dispo } = await cx.query<{ cle: string; affichage: string }>(
            `SELECT ${c.cle} AS cle, ${c.affichage} AS affichage
         FROM ${c.table} WHERE ${filtre}
        ORDER BY ${ordre} ${direction} LIMIT 5`,
        );
        return { etat: "introuvable", suggestions: dispo };
    }

    const meilleur = Number(rows[0].score);
    const retenus = rows.filter((r) => Number(r.score) === meilleur).slice(0, 6);

    if (rang) return { etat: "ok", cle: retenus[0].cle, affichage: retenus[0].affichage };
    if (retenus.length === 1) return { etat: "ok", cle: retenus[0].cle, affichage: retenus[0].affichage };

    // Une correspondance exacte l'emporte sur les partielles.
    const vise = aplatir(texte);
    const exacts = retenus.filter((r) => aplatir(r.cle) === vise || aplatir(r.affichage) === vise);
    if (exacts.length === 1) return { etat: "ok", cle: exacts[0].cle, affichage: exacts[0].affichage };

    return { etat: "ambigu", choix: retenus.map((r) => ({ cle: r.cle, affichage: r.affichage })) };
}

// ---------------------------------------------------------------------------
// Résumé lisible — construit par le code, jamais rédigé par le modèle
// ---------------------------------------------------------------------------

function formater(champ: Champ, v: string | number): string {
    if (champ.type === "montant") return montantFr(v);
    if (champ.type === "date") {
        const [a, m, j] = String(v).split("-");
        return `${j}/${m}/${a}`;
    }
    if (champ.type === "liste" && champ.options) {
        // « BANK_TRANSFER » est une valeur de base, pas une réponse à un humain.
        const o = champ.options.find((x) => x.code === v);
        return o?.synonymes?.[0] ?? String(v);
    }
    return String(v);
}

export function resumer(
    action: Action,
    valeurs: Record<string, string | number>,
    cible?: string,
    cibleAffichage?: string,
    supplement?: { libelle: string; valeur: string }[],
) {
    const lignes = [
        ...(supplement ?? []),
        ...action.champs
            .filter((c) => valeurs[c.colonne] !== undefined)
            .map((c) => ({ libelle: c.libelle, valeur: formater(c, valeurs[c.colonne]) })),
    ];

    const titre = action.cible ? `${action.libelle} — ${cibleAffichage ?? cible}` : action.libelle;

    return { titre, lignes };
}

// ---------------------------------------------------------------------------
// Exécution — dans une transaction, toujours en requête paramétrée
// ---------------------------------------------------------------------------

export type Resultat = {
    entityId: string;
    entityType: string;
    avant: Record<string, unknown> | null;
    apres: Record<string, unknown>;
    message: string;
};

async function referenceSuivante(cx: PoolClient, table: string, prefixe: string) {
    const { rows } = await cx.query<{ n: string }>(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(reference, '\\D', '', 'g'), '')::int), 0) + 1 AS n
       FROM ${table}`,
    );
    return `${prefixe}-${String(rows[0].n).padStart(4, "0")}`;
}

/** FAC-2026-0046 : la numérotation repart à chaque exercice. */
async function numeroFactureSuivant(cx: PoolClient, dateFacture: string) {
    const annee = dateFacture.slice(0, 4);
    const { rows } = await cx.query<{ n: string }>(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^.*-', ''), '')::int), 0) + 1 AS n
       FROM sales_invoices
      WHERE invoice_number LIKE $1`,
        [`FAC-${annee}-%`],
    );
    return `FAC-${annee}-${String(rows[0].n).padStart(4, "0")}`;
}

function ajouterJours(iso: string, jours: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
}

export async function executer(
    cx: PoolClient,
    action: Action,
    valeurs: Record<string, string | number>,
    cible?: string,
): Promise<Resultat> {
    switch (action.code) {
        case "CREATE_CUSTOMER": {
            const reference = await referenceSuivante(cx, "customers", "CLI");
            const colonnes = ["reference", ...Object.keys(valeurs)];
            const params = [reference, ...Object.values(valeurs)];
            const jetons = colonnes.map((_, i) => `$${i + 1}`);

            const { rows } = await cx.query(
                `INSERT INTO customers (${colonnes.join(", ")})
         VALUES (${jetons.join(", ")}) RETURNING *`,
                params,
            );
            return {
                entityId: rows[0].id,
                entityType: "customer",
                avant: null,
                apres: rows[0],
                message: `Client ${reference} créé.`,
            };
        }

        case "UPDATE_CUSTOMER": {
            const { rows: avant } = await cx.query(
                `SELECT * FROM customers WHERE reference = $1 FOR UPDATE`,
                [cible],
            );
            if (avant.length === 0) throw new Error(`Aucun client ne porte la référence ${cible}.`);

            const cols = Object.keys(valeurs);
            const set = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
            const { rows: apres } = await cx.query(
                `UPDATE customers SET ${set}, updated_at = now() WHERE reference = $1 RETURNING *`,
                [cible, ...Object.values(valeurs)],
            );
            return {
                entityId: apres[0].id,
                entityType: "customer",
                avant: avant[0],
                apres: apres[0],
                message: `Client ${cible} mis à jour.`,
            };
        }

        case "CREATE_SALES_INVOICE": {
            // 1. La commande, verrouillée le temps de la transaction.
            const { rows: cmd } = await cx.query<{
                id: string;
                reference: string;
                customer_id: string;
                client: string;
                subtotal_amount: string;
                tax_amount: string;
                total_amount: string;
                payment_terms_days: number | null;
            }>(
                `SELECT o.id, o.reference, o.customer_id, c.name AS client,
                o.subtotal_amount, o.tax_amount, o.total_amount,
                c.payment_terms_days
           FROM sales_orders o
           JOIN customers c ON c.id = o.customer_id
          WHERE o.reference = $1
          FOR UPDATE OF o`,
                [cible],
            );
            if (cmd.length === 0) throw new Error(`La commande ${cible} est introuvable.`);
            const commande = cmd[0];

            // 2. Une commande ne se facture qu'une fois. Vérifié ici aussi, et pas
            //    seulement à la recherche : deux confirmations simultanées existent.
            const { rows: deja } = await cx.query<{ invoice_number: string }>(
                `SELECT invoice_number FROM sales_invoices WHERE sales_order_id = $1`,
                [commande.id],
            );
            if (deja.length > 0) {
                throw new Error(
                    `La commande ${commande.reference} est déjà facturée (${deja[0].invoice_number}).`,
                );
            }

            // 3. Les lignes viennent de la commande : rien n'est saisi ni inventé.
            const { rows: lignes } = await cx.query(
                `SELECT product_id, description, quantity, unit_price, tax_rate
           FROM sales_order_items
          WHERE sales_order_id = $1
          ORDER BY id`,
                [commande.id],
            );
            if (lignes.length === 0) {
                throw new Error(`La commande ${commande.reference} ne contient aucune ligne à facturer.`);
            }

            const dateFacture = String(valeurs.invoice_date);
            const echeance =
                (valeurs.due_date as string | undefined) ??
                ajouterJours(dateFacture, commande.payment_terms_days ?? DELAI_PAIEMENT_DEFAUT);
            if (echeance < dateFacture) {
                throw new Error(
                    `L'échéance (${echeance}) ne peut pas précéder la date de la facture (${dateFacture}).`,
                );
            }

            const numero = await numeroFactureSuivant(cx, dateFacture);

            const { rows: facture } = await cx.query(
                `INSERT INTO sales_invoices
           (invoice_number, customer_id, sales_order_id, invoice_date, due_date,
            status, subtotal_amount, tax_amount, total_amount, paid_amount, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
         RETURNING *`,
                [
                    numero,
                    commande.customer_id,
                    commande.id,
                    dateFacture,
                    echeance,
                    STATUT_FACTURE_INITIAL,
                    commande.subtotal_amount,
                    commande.tax_amount,
                    commande.total_amount,
                    SOURCE_FACTURE,
                    valeurs.notes ?? null,
                ],
            );

            for (const l of lignes) {
                await cx.query(
                    // line_total est GENERATED ALWAYS dans le schéma : il ne s'insère pas.
                    `INSERT INTO sales_invoice_items
             (sales_invoice_id, product_id, description, quantity, unit_price, tax_rate)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [facture[0].id, l.product_id, l.description, l.quantity, l.unit_price, l.tax_rate],
                );
            }

            return {
                entityId: facture[0].id,
                entityType: "sales_invoice",
                avant: null,
                apres: { ...facture[0], lignes: lignes.length },
                message:
                    `Facture ${numero} créée pour ${commande.client} à partir de la commande ` +
                    `${commande.reference} — ${lignes.length} ligne(s), ${montantFr(commande.total_amount)}, ` +
                    `échéance le ${echeance.split("-").reverse().join("/")}.`,
            };
        }

        case "CREATE_CUSTOMER_PAYMENT": {
            const { rows: facture } = await cx.query<{
                id: string; total_amount: string; paid_amount: string; invoice_number: string;
            }>(
                `SELECT id, total_amount, paid_amount, invoice_number
           FROM sales_invoices WHERE invoice_number = $1 FOR UPDATE`,
                [String(cible).trim()],
            );
            if (facture.length === 0) {
                throw new Error(`La facture ${cible} est introuvable.`);
            }

            const reste = Number(facture[0].total_amount) - Number(facture[0].paid_amount);
            const montant = Number(valeurs.amount);
            if (montant > reste + 1e-9) {
                throw new Error(
                    `Le montant dépasse le reste à payer de la facture ${facture[0].invoice_number} (${reste.toFixed(3)} TND).`,
                );
            }

            const reference = await referenceSuivante(cx, "customer_payments", "PAY");
            const { rows } = await cx.query(
                `INSERT INTO customer_payments
           (reference, customer_id, sales_invoice_id, payment_date, amount,
            payment_method, external_reference, status)
         SELECT $1, f.customer_id, f.id, $3, $4, $5, $6, $7
           FROM sales_invoices f WHERE f.id = $2
         RETURNING *`,
                [
                    reference,
                    facture[0].id,
                    valeurs.payment_date,
                    montant,
                    valeurs.payment_method,
                    valeurs.external_reference ?? null,
                    STATUT_PAIEMENT,
                ],
            );
            return {
                entityId: rows[0].id,
                entityType: "customer_payment",
                avant: null,
                apres: rows[0],
                message: `Paiement ${reference} enregistré sur la facture ${facture[0].invoice_number}.`,
            };
        }

        default:
            throw new Error(`Action inconnue : ${action.code}`);
    }
}

// ---------------------------------------------------------------------------
// Compatibilité : le point de contrôle utilisé par la route de confirmation
// ---------------------------------------------------------------------------

export type Valide =
    | { ok: true; valeurs: Record<string, string | number>; cible?: string }
    | { ok: false; motif: string };

export function valider(
    action: Action,
    role: Role,
    brut: Record<string, unknown>,
    cibleBrute?: unknown,
): Valide {
    const p = preparer(action, role, brut, cibleBrute);
    if (p.etat === "ok") return { ok: true, valeurs: p.valeurs, cible: p.cible };
    if (p.etat === "refus") return { ok: false, motif: p.motif };
    return { ok: false, motif: `Informations manquantes : ${p.manquants.map((m) => m.libelle).join(", ")}.` };
}