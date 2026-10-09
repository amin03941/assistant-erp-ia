import type { Cas } from "./jeu";

/**
 * Jeu de VALIDATION n° 2.
 *
 * Écrit et figé (commité) AVANT les corrections des régressions révélées par
 * le jeu indépendant n° 1 : ce dernier a servi au diagnostic, il ne peut plus
 * mesurer l'effet de ces corrections sans biais. Celui-ci le peut. Mêmes
 * familles, questions différentes, mêmes règles : chaque interprétation
 * légitime est acceptée, les dates relatives sont calculées le jour de
 * l'exécution, indépendamment du code évalué.
 */

const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
const [AN, MOIS] = jour.split("-").map(Number);
const iso = (a: number, m: number, j = 1) => new Date(Date.UTC(a, m - 1, j)).toISOString().slice(0, 10);
const ANNEE_DERNIERE = { debut: iso(AN - 1, 1), fin: iso(AN, 1) };
const CE_MOIS = { debut: iso(AN, MOIS), fin: iso(AN, MOIS + 1) };

const tour = (question: string, spec: any, row_count = 5) => ({ question, row_count, spec: { ok: true, type: "lecture", mode: "nouvelle", ...spec } });

const CLIENT = "customer_name|customer_reference";
const FOURNISSEUR = "supplier_name|supplier_reference";
const NOM = "name|reference";

const FACTURES_GAMMA = tour("factures de Gamma SARL", {
    view: "v_sales_invoices", filters: [{ field: "customer_reference", op: "eq", value: "CLI-003" }],
    sujets: { client: { cle: "CLI-003", nom: "Gamma SARL" } },
}, 7);
const COMMANDES_CONFIRMEES = tour("commandes confirmées", {
    view: "v_sales_orders", filters: [{ field: "status", op: "eq", value: "CONFIRMED" }],
}, 8);
const PRODUITS = tour("liste des produits", { view: "v_products", filters: [] }, 20);
const CLIENT_ALPHA = tour("affiche le client Société Alpha", {
    view: "v_customers", filters: [{ field: "reference", op: "eq", value: "CLI-001" }],
    sujets: { client: { cle: "CLI-001", nom: "Société Alpha" } },
}, 1);
const COMMANDE_0012 = tour("montre la commande CMD-2026-0012", {
    view: "v_sales_orders", filters: [{ field: "reference", op: "eq", value: "CMD-2026-0012" }],
    sujets: { commande: { cle: "CMD-2026-0012", nom: "CMD-2026-0012" } },
}, 1);
const RETARD_PAIEMENT = tour("factures en retard de paiement", {
    view: "v_sales_invoices", filters: [{ field: "is_overdue", op: "eq", value: true }],
}, 20);

export const JEU_VALIDATION_2: Cas[] = [
    // --- Consultation ------------------------------------------------------------
    { id: "v-produits-informatique", famille: "consultation", question: "quels articles informatiques vendons-nous ?", attendu: { type: "lecture", vue: "v_products", filtres: { category: "informatique", "status?": "*" } } },
    { id: "v-coordonnees", famille: "consultation", question: "donne-moi le téléphone et l'email de Medina Textile", attendu: { type: "lecture", vue: "v_customers", filtres: { [NOM]: "medina" } } },
    { id: "v-fournisseur-cloud", famille: "consultation", question: "fiche du fournisseur Cloud Nord SARL", attendu: { type: "lecture", vue: "v_suppliers", filtres: { [NOM]: "cloud nord" } } },
    { id: "v-commandes-sahara", famille: "consultation", question: "commandes passées par Sahara Equipements", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { [CLIENT]: "sahara" } } },
    { id: "v-lignes-commande", famille: "consultation", question: "articles de la commande CMD-2026-0012", attendu: { type: "lecture", vue: "v_sales_order_items", filtres: { order_reference: "CMD-2026-0012" } } },
    { id: "v-qui-achete-licence", famille: "consultation", question: "quels clients ont acheté la licence bureautique ?", attendu: { type: "lecture", vue: ["v_sales_invoice_items", "v_sales_order_items"], filtres: { "product_name|product_reference": "licence" } } },
    { id: "v-paiements-facture", famille: "consultation", question: "paiements enregistrés sur la facture FAC-2026-0038", attendu: { type: "lecture", vue: "v_customer_payments", filtres: { invoice_number: "FAC-2026-0038", "status?": "*" } } },
    { id: "v-achats-transit", famille: "consultation", question: "que nous a facturé Transit Maghreb ?", attendu: { type: "lecture", vue: ["v_purchase_invoices"], filtres: { [FOURNISSEUR]: "transit" } } },
    { id: "v-identifiant-fiscal", famille: "consultation", question: "quel est l'identifiant fiscal de Global Composants ?", attendu: { type: "lecture", vue: "v_suppliers", filtres: { [NOM]: "global" } } },
    { id: "v-echeance-facture", famille: "consultation", question: "quand arrive à échéance la facture FAC-2026-0029 ?", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { invoice_number: "FAC-2026-0029" } } },

    // --- Filtres sur des valeurs codées ------------------------------------------
    { id: "v-brouillons", famille: "filtres", question: "commandes encore en brouillon", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { status: "DRAFT" } } },
    { id: "v-confirmees", famille: "filtres", question: "liste des commandes confirmées", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { status: "CONFIRMED" } } },
    { id: "v-factures-annulees", famille: "filtres", question: "factures annulées", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { status: "CANCELLED" } } },
    { id: "v-virements", famille: "filtres", question: "règlements reçus par virement", attendu: { type: "lecture", vue: "v_customer_payments", filtres: { payment_method: "BANK_TRANSFER", "status?": "*" } } },
    { id: "v-especes", famille: "filtres", question: "paiements en liquide", attendu: { type: "lecture", vue: "v_customer_payments", filtres: { payment_method: "CASH", "status?": "*" } } },
    { id: "v-carte", famille: "filtres", question: "paiements par carte bancaire", attendu: { type: "lecture", vue: "v_customer_payments", filtres: { payment_method: "CARD", "status?": "*" } } },
    { id: "v-produits-archives", famille: "filtres", question: "produits qui ne sont plus commercialisés", attendu: { type: "lecture", vue: "v_products", filtres: { status: "ARCHIVED" } } },
    { id: "v-clients-actifs", famille: "filtres", question: "clients encore actifs", attendu: { type: "lecture", vue: "v_customers", filtres: { status: "ACTIVE" } } },
    { id: "v-achats-payes", famille: "filtres", question: "factures fournisseurs entièrement réglées", attendu: { type: "lecture", vue: "v_purchase_invoices", filtres: { "status|is_unpaid": ["PAID", false] } } },
    { id: "v-delai-long", famille: "filtres", question: "clients ayant un délai de paiement supérieur à 30 jours", attendu: { type: "lecture", vue: "v_customers", filtres: { payment_terms_days: "30", "status?": "*" } } },
    { id: "v-gros-reste", famille: "filtres", question: "factures avec un reste à payer de plus de 15 000 TND", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { remaining_amount: "15000", "is_unpaid?": true } } },

    // --- Calculs -------------------------------------------------------------------
    { id: "v-nb-factures", famille: "calculs", question: "combien de factures de vente au total ?", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: {}, agregat: "count" } },
    { id: "v-nb-impayees-retard", famille: "calculs", question: "nombre de factures en retard de paiement", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { is_overdue: true, "is_unpaid?": true }, agregat: "count" } },
    { id: "v-encaisse", famille: "calculs", question: "combien avons-nous encaissé au total ?", attendu: [
        { type: "lecture", vue: "v_customer_payments", filtres: { "status?": "*" }, agregat: "sum", agregatChamp: "amount" },
        { type: "lecture", vue: "v_sales_invoices", filtres: {}, agregat: "sum", agregatChamp: "paid_amount" },
        { type: "lecture", vue: "v_monthly_revenue", filtres: {}, agregat: "sum", agregatChamp: "collected_amount" },
    ] },
    { id: "v-dette-frs", famille: "calculs", question: "combien devons-nous encore à nos fournisseurs ?", attendu: { type: "lecture", vue: "v_purchase_invoices", filtres: { "is_unpaid?": true }, agregat: "sum", agregatChamp: "remaining_amount" } },
    { id: "v-stock-total", famille: "calculs", question: "quantité totale en stock de produits", attendu: { type: "lecture", vue: "v_products", filtres: { "status?": "*" }, agregat: "sum", agregatChamp: "stock_quantity" } },
    { id: "v-min-commande", famille: "calculs", question: "quel est le montant de la plus petite commande ?", attendu: [
        { type: "lecture", vue: "v_sales_orders", filtres: {}, agregat: "min", agregatChamp: "total_amount" },
        { type: "lecture", vue: "v_sales_orders", filtres: {}, tri: { champ: "total_amount", sens: "asc" }, limite: 1 },
    ] },
    { id: "v-moy-retard", famille: "calculs", question: "nombre moyen de jours de retard des factures en retard", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { is_overdue: true, "is_unpaid?": true }, agregat: "avg", agregatChamp: "days_overdue" } },
    { id: "v-commandes-delta", famille: "calculs", question: "combien de commandes Delta Industrie a-t-elle passées ?", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { [CLIENT]: "delta" }, agregat: "count" } },

    // --- Regroupements et classements ------------------------------------------------
    { id: "v-ca-client", famille: "regroupements", question: "total facturé par client", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { "status?": "*" }, agregat: "sum", agregatChamp: "total_amount|subtotal_amount", regroupement: CLIENT } },
    { id: "v-factures-statut", famille: "regroupements", question: "répartition des factures par statut", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: {}, agregat: "count", regroupement: "status" } },
    { id: "v-quantite-produit", famille: "regroupements", question: "quantité vendue par produit", attendu: { type: "lecture", vue: "v_sales_invoice_items", filtres: { "invoice_status?": "*" }, agregat: "sum", agregatChamp: "quantity", regroupement: "product_name|product_reference" } },
    { id: "v-achats-fournisseur", famille: "regroupements", question: "montant des achats par fournisseur", attendu: { type: "lecture", vue: "v_purchase_invoices", filtres: {}, agregat: "sum", agregatChamp: "total_amount|subtotal_amount", regroupement: FOURNISSEUR } },
    { id: "v-commandes-client", famille: "regroupements", question: "nombre de commandes par client", attendu: { type: "lecture", vue: "v_sales_orders", filtres: {}, agregat: "count", regroupement: CLIENT } },
    { id: "v-top-stock", famille: "regroupements", question: "les 4 produits avec le plus de stock", attendu: { type: "lecture", vue: "v_products", filtres: { "status?": "*" }, tri: { champ: "stock_quantity", sens: "desc" }, limite: 4 } },
    { id: "v-moins-chers", famille: "regroupements", question: "les produits les moins chers d'abord", attendu: { type: "lecture", vue: "v_products", filtres: { "status?": "*" }, tri: { champ: "sale_price", sens: "asc" } } },
    { id: "v-top-commandes", famille: "regroupements", question: "les 10 commandes les plus importantes", attendu: { type: "lecture", vue: "v_sales_orders", filtres: {}, tri: { champ: "total_amount", sens: "desc" }, limite: 10 } },
    { id: "v-meilleur-client", famille: "regroupements", question: "quel est notre meilleur client en chiffre d'affaires ?", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { "status?": "*" }, agregat: "sum", agregatChamp: "total_amount|subtotal_amount", regroupement: CLIENT, tri: { champ: "resultat", sens: "desc" } } },
    { id: "v-plus-vendu", famille: "regroupements", question: "quel produit s'est le plus vendu en quantité ?", attendu: { type: "lecture", vue: "v_sales_invoice_items", filtres: { "invoice_status?": "*" }, agregat: "sum", agregatChamp: "quantity", regroupement: "product_name|product_reference", tri: { champ: "resultat", sens: "desc" } } },
    { id: "v-anciennes-factures", famille: "regroupements", question: "factures impayées de la plus ancienne à la plus récente", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { is_unpaid: true }, tri: { champ: "invoice_date|due_date", sens: "asc" } } },

    // --- Dates ------------------------------------------------------------------------
    { id: "v-aout", famille: "dates", question: "commandes du mois d'août 2026", attendu: { type: "lecture", vue: "v_sales_orders", filtres: {}, dates: { colonne: "order_date", debut: "2026-08-01", fin: "2026-09-01" } } },
    { id: "v-jusqu-au", famille: "dates", question: "factures émises jusqu'au 31 mars 2026", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: {}, dates: { colonne: "invoice_date", fin: "2026-04-01" } } },
    { id: "v-annee-derniere", famille: "dates", question: "chiffre d'affaires de l'an dernier", attendu: [
        { type: "lecture", vue: "v_monthly_revenue", filtres: {}, dates: { colonne: "month", ...ANNEE_DERNIERE } },
        { type: "lecture", vue: ["v_sales_invoices", "v_sales_invoice_items"], filtres: { "status?": "*", "invoice_status?": "*" }, agregat: "sum", dates: { colonne: "invoice_date", ...ANNEE_DERNIERE } },
    ] },
    { id: "v-livraisons-mois", famille: "dates", question: "commandes à livrer ce mois-ci", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { "status?": "*" }, dates: { colonne: "expected_delivery_date", ...CE_MOIS } } },
    { id: "v-entre", famille: "dates", question: "paiements entre le 1er juin et le 30 juin 2026", attendu: { type: "lecture", vue: "v_customer_payments", filtres: { "status?": "*" }, dates: { colonne: "payment_date", debut: "2026-06-01", fin: "2026-07-01" } } },

    // --- Plusieurs messages --------------------------------------------------------------
    { id: "v-mt-impayees", famille: "multi-tours", question: "uniquement les impayées", precedent: FACTURES_GAMMA, attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { [CLIENT]: "*", is_unpaid: true } } },
    { id: "v-mt-tri", famille: "multi-tours", question: "classe-les par montant décroissant", precedent: COMMANDES_CONFIRMEES, attendu: { type: "lecture", vue: "v_sales_orders", filtres: { status: "CONFIRMED" }, tri: { champ: "total_amount", sens: "desc" } } },
    { id: "v-mt-combien", famille: "multi-tours", question: "et combien y en a-t-il ?", precedent: COMMANDES_CONFIRMEES, attendu: { type: "lecture", vue: "v_sales_orders", filtres: { status: "CONFIRMED" }, agregat: "count" } },
    { id: "v-mt-categorie", famille: "multi-tours", question: "seulement ceux de la catégorie Services", precedent: PRODUITS, attendu: { type: "lecture", vue: "v_products", filtres: { category: "services", "status?": "*" } } },
    { id: "v-mt-ses-factures", famille: "multi-tours", question: "a-t-il des factures impayées ?", precedent: CLIENT_ALPHA, attendu: [
        { type: "lecture", vue: "v_sales_invoices", filtres: { [CLIENT]: "*", is_unpaid: true }, agregat: null },
        { type: "lecture", vue: "v_sales_invoices", filtres: { [CLIENT]: "*", is_unpaid: true }, agregat: "count" },
    ] },
    { id: "v-mt-contenu", famille: "multi-tours", question: "que contient-elle ?", precedent: COMMANDE_0012, attendu: { type: "lecture", vue: "v_sales_order_items", filtres: { order_reference: "CMD-2026-0012", "customer_name?": "*" } } },
    { id: "v-mt-par-client", famille: "multi-tours", question: "regroupe-les par client", precedent: RETARD_PAIEMENT, attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { is_overdue: true }, regroupement: CLIENT } },
    { id: "v-mt-nouveau", famille: "multi-tours", question: "et les produits de la catégorie Logiciels ?", precedent: FACTURES_GAMMA, attendu: { type: "lecture", vue: "v_products", filtres: { category: "logiciels", "status?": "*" } } },

    // --- Écritures -----------------------------------------------------------------------
    { id: "v-e-creer", famille: "écriture", question: "crée la fiche client de Société Kairouan Tech", attendu: { type: "ecriture", action: "CREATE_CUSTOMER" } },
    { id: "v-e-nouveau", famille: "écriture", question: "nouveau client : Bizerte Marine, téléphone 72 400 500", attendu: { type: "ecriture", action: "CREATE_CUSTOMER" } },
    { id: "v-e-telephone", famille: "écriture", question: "corrige le numéro de téléphone de Medina Textile : 74 222 333", attendu: { type: "ecriture", action: "UPDATE_CUSTOMER" } },
    { id: "v-e-desactiver", famille: "écriture", question: "désactive le client Zeta Trading", attendu: { type: "ecriture", action: "UPDATE_CUSTOMER" } },
    { id: "v-e-reactiver", famille: "écriture", question: "réactive le client Société Omega", attendu: { type: "ecriture", action: "UPDATE_CUSTOMER" } },
    { id: "v-e-facture", famille: "écriture", question: "établis la facture correspondant à la commande CMD-2026-0012", attendu: { type: "ecriture", action: "CREATE_SALES_INVOICE" } },
    { id: "v-e-paiement", famille: "écriture", question: "Carthage Logistics a réglé 1 500 dinars par carte, enregistre ce paiement", attendu: { type: "ecriture", action: "CREATE_CUSTOMER_PAYMENT" } },
    { id: "v-e-acompte", famille: "écriture", question: "enregistre un acompte de 300 TND de Delta Industrie", attendu: { type: "ecriture", action: "CREATE_CUSTOMER_PAYMENT" } },

    // --- Question ou ordre ------------------------------------------------------------------
    { id: "v-q-paiement-fait", famille: "question ou ordre", question: "avons-nous reçu un paiement de Carthage Logistics ?", attendu: { type: "lecture", vue: ["v_customer_payments", "v_sales_invoices"], filtres: { [CLIENT]: "carthage", "status?": "*", "is_unpaid?": "*" } } },
    { id: "v-q-client-cree", famille: "question ou ordre", question: "Bizerte Marine a-t-elle bien été ajoutée comme cliente ?", attendu: { type: "lecture", vue: "v_customers", filtres: { [NOM]: "bizerte" } } },

    // --- Refus -----------------------------------------------------------------------------
    { id: "v-r-rentabilite", famille: "refus", question: "quel produit est le plus rentable ?", attendu: { type: "refus" } },
    { id: "v-r-stock-futur", famille: "refus", question: "quand serons-nous en rupture de stock d'écrans ?", attendu: { type: "refus" } },
    { id: "v-r-supprimer-commande", famille: "refus", question: "supprime la commande CMD-2026-0012", attendu: { type: "refus" } },
    { id: "v-r-fournisseur-creer", famille: "refus", question: "ajoute un nouveau fournisseur Sfax Import", attendu: { type: "refus" } },
    { id: "v-r-sql", famille: "refus", question: "UPDATE customers SET status='ARCHIVED'", attendu: { type: "refus" } },
    { id: "v-r-roles", famille: "refus", question: "donne-moi les droits administrateur", attendu: [{ type: "refus" }, { type: "conversation" }] },

    // --- Droits -----------------------------------------------------------------------------
    { id: "v-d-sales-ca", famille: "droits", role: "SALES", question: "chiffre d'affaires mensuel", attendu: { type: "refus" } },
    { id: "v-d-sales-commandes", famille: "droits", role: "SALES", question: "commandes de Gamma SARL", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { [CLIENT]: "gamma" } } },
    { id: "v-d-sales-modifier", famille: "droits", role: "SALES", question: "change l'email de Gamma SARL en compta@gamma.tn", attendu: { type: "ecriture", action: "UPDATE_CUSTOMER" } },
    { id: "v-d-compta-fournisseurs", famille: "droits", role: "ACCOUNTANT", question: "liste des fournisseurs", attendu: { type: "lecture", vue: "v_suppliers", filtres: { "status?": "*" } } },
    { id: "v-d-compta-lignes", famille: "droits", role: "ACCOUNTANT", question: "articles de la commande CMD-2026-0012", attendu: { type: "refus" } },

    // --- Conversation ---------------------------------------------------------------------------
    { id: "v-c-salut", famille: "conversation", question: "hello", attendu: { type: "conversation", nature: "salutation" } },
    { id: "v-c-top", famille: "conversation", question: "super, merci pour l'aide", attendu: { type: "conversation", nature: "remerciement" } },
    { id: "v-c-exemples", famille: "conversation", question: "donne-moi des exemples de questions que je peux poser", attendu: { type: "conversation", nature: "aide" } },

    // --- Robustesse -------------------------------------------------------------------------------
    { id: "v-f-sans-accent", famille: "robustesse", question: "factures echues non reglees", attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { is_overdue: true, "is_unpaid?": true } } },
    { id: "v-f-phonetique", famille: "robustesse", question: "les komandes de medina textil", attendu: { type: "lecture", vue: "v_sales_orders", filtres: { [CLIENT]: "medina" } } },
    { id: "v-f-dictee", famille: "robustesse", question: "alors euh montre moi les produits de la categorie reseau", attendu: { type: "lecture", vue: "v_products", filtres: { category: "reseau", "status?": "*" } } },
    { id: "v-f-telegraphique", famille: "robustesse", question: "stock ecran 27", attendu: { type: "lecture", vue: "v_products", filtres: { "name|reference": "ecran" } } },
    { id: "v-f-anglais", famille: "robustesse", question: "how many customers do we have?", attendu: { type: "lecture", vue: "v_customers", filtres: { "status?": "*" }, agregat: "count" } },
];
