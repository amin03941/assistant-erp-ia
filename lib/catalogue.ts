export type Colonne = {
    libelle: string;
    type: "texte" | "montant" | "nombre" | "date" | "booleen" | "duree";
    sens?: string;
    resume?: boolean;
    /**
     * false pour un montant qui ne s'additionne pas : un prix unitaire. La
     * somme de deux prix unitaires n'est le prix de rien. Ni la synthèse ni
     * une agrégation "sum" ne l'additionnent ; moyenne, minimum et maximum
     * restent permis.
     */
    additif?: boolean;
};

export type Vue = {
    entite: { singulier: string; pluriel: string; genre: "m" | "f" };
    colonnes: Record<string, Colonne>;
    description: string;
    roles: string[];
    /**
     * Colonne de temps d'une vue dont chaque ligne est une période (un mois…).
     * Ses lignes forment une série : l'interface les affiche aussi en graphique.
     */
    serie?: string;
    /** Intitulé des données quand le nom de l'entité ne suffit pas (« mois » → « chiffre d'affaires mensuel »). */
    intitule?: string;
};

export const CATALOGUE: Record<string, Vue> = {
    v_sales_invoices: {
        entite: { singulier: "facture de vente", pluriel: "factures de vente", genre: "f" },
        description: "Factures de vente. is_unpaid = reste à payer. is_overdue = impayée et échéance dépassée.",
        roles: ["ACCOUNTANT", "MANAGER"],
        colonnes: {
            invoice_number: { libelle: "numéro de facture", type: "texte" },
            customer_reference: { libelle: "référence client", type: "texte" },
            customer_name: { libelle: "client", type: "texte" },
            order_reference: { libelle: "commande liée", type: "texte" },
            invoice_date: { libelle: "date de facture", type: "date" },
            due_date: { libelle: "échéance", type: "date" },
            status: { libelle: "statut", type: "texte" },
            subtotal_amount: { libelle: "montant hors taxe", type: "montant" },
            tax_amount: { libelle: "montant de taxe", type: "montant" },
            total_amount: { libelle: "montant TTC", type: "montant" },
            paid_amount: { libelle: "montant payé", type: "montant" },
            remaining_amount: { libelle: "reste à payer", type: "montant", resume: true },
            is_unpaid: { libelle: "avec reste à payer", type: "booleen", sens: "ayant un reste à payer" },
            is_overdue: { libelle: "en retard", type: "booleen", sens: "en retard de paiement" },
            days_overdue: { libelle: "jours de retard", type: "duree" },
        },
    },

    v_customers: {
        entite: { singulier: "client", pluriel: "clients", genre: "m" },
        description: "Clients de l'entreprise.",
        roles: ["SALES", "ACCOUNTANT", "MANAGER"],
        colonnes: {
            reference: { libelle: "référence", type: "texte" },
            name: { libelle: "nom", type: "texte" },
            email: { libelle: "email", type: "texte" },
            phone: { libelle: "téléphone", type: "texte" },
            payment_terms_days: { libelle: "délai de paiement (jours)", type: "nombre" },
            status: { libelle: "statut", type: "texte" },
        },
    },

    v_products: {
        entite: { singulier: "produit", pluriel: "produits", genre: "m" },
        description: "Produits et services. Sans prix d'achat.",
        roles: ["SALES", "ACCOUNTANT", "MANAGER"],
        colonnes: {
            reference: { libelle: "référence", type: "texte" },
            name: { libelle: "nom", type: "texte" },
            category: { libelle: "catégorie", type: "texte" },
            product_type: { libelle: "type de produit", type: "texte" },
            unit: { libelle: "unité", type: "texte" },
            sale_price: { libelle: "prix de vente", type: "montant", additif: false },
            tax_rate: { libelle: "taux de taxe", type: "nombre" },
            stock_quantity: { libelle: "quantité en stock", type: "nombre" },
            status: { libelle: "statut", type: "texte" },
        },
    },

    v_sales_orders: {
        entite: { singulier: "commande client", pluriel: "commandes clients", genre: "f" },
        description: "Commandes clients. is_late = commande confirmée dont la livraison prévue est dépassée.",
        roles: ["SALES", "MANAGER"],
        colonnes: {
            reference: { libelle: "référence", type: "texte" },
            customer_reference: { libelle: "référence client", type: "texte" },
            customer_name: { libelle: "client", type: "texte" },
            order_date: { libelle: "date de commande", type: "date" },
            expected_delivery_date: { libelle: "date de livraison prévue", type: "date" },
            status: { libelle: "statut", type: "texte" },
            total_amount: { libelle: "montant total", type: "montant" },
            is_late: { libelle: "en retard de livraison", type: "booleen", sens: "en retard de livraison" },
            days_late: { libelle: "jours de retard", type: "duree" },
        },
    },

    v_sales_order_items: {
        entite: { singulier: "ligne de commande", pluriel: "lignes de commande", genre: "f" },
        description: "Lignes de commande client : les produits, articles ou contenu d'une commande. order_reference = référence de la commande (CMD-…).",
        roles: ["SALES", "MANAGER"],
        colonnes: {
            order_reference: { libelle: "référence de commande", type: "texte" },
            customer_name: { libelle: "client", type: "texte" },
            product_reference: { libelle: "référence produit", type: "texte" },
            product_name: { libelle: "produit", type: "texte" },
            description: { libelle: "description", type: "texte" },
            quantity: { libelle: "quantité", type: "nombre" },
            unit_price: { libelle: "prix unitaire", type: "montant", additif: false },
            line_total: { libelle: "total de ligne", type: "montant" },
        },
    },

    v_sales_invoice_items: {
        entite: { singulier: "ligne de facture", pluriel: "lignes de facture", genre: "f" },
        description: "Lignes de facture de vente : ce qui a été facturé. Sert au chiffre d'affaires par produit. Pour le contenu d'une commande, voir v_sales_order_items.",
        roles: ["ACCOUNTANT", "MANAGER"],
        colonnes: {
            invoice_number: { libelle: "numéro de facture", type: "texte" },
            customer_name: { libelle: "client", type: "texte" },
            product_reference: { libelle: "référence produit", type: "texte" },
            product_name: { libelle: "produit", type: "texte" },
            description: { libelle: "description", type: "texte" },
            quantity: { libelle: "quantité", type: "nombre" },
            unit_price: { libelle: "prix unitaire", type: "montant", additif: false },
            line_total: { libelle: "total de ligne", type: "montant" },
            invoice_date: { libelle: "date de facture", type: "date" },
            invoice_status: { libelle: "statut de la facture", type: "texte" },
        },
    },

    v_customer_payments: {
        entite: { singulier: "paiement client", pluriel: "paiements clients", genre: "m" },
        description: "Paiements clients. Seuls ceux au statut CONFIRMED comptent.",
        roles: ["ACCOUNTANT", "MANAGER"],
        colonnes: {
            reference: { libelle: "référence", type: "texte" },
            customer_name: { libelle: "client", type: "texte" },
            invoice_number: { libelle: "numéro de facture", type: "texte" },
            payment_date: { libelle: "date de paiement", type: "date" },
            amount: { libelle: "montant", type: "montant" },
            payment_method: { libelle: "méthode de paiement", type: "texte" },
            status: { libelle: "statut", type: "texte" },
        },
    },

    v_monthly_revenue: {
        entite: { singulier: "mois", pluriel: "mois", genre: "m" },
        description: "Chiffre d'affaires par mois, factures annulées exclues. Une ligne par mois : évolution du chiffre d'affaires, ventes mensuelles, encaissements.",
        roles: ["ACCOUNTANT", "MANAGER"],
        serie: "month",
        intitule: "chiffre d'affaires mensuel",
        colonnes: {
            month: { libelle: "mois", type: "date" },
            invoice_count: { libelle: "nombre de factures", type: "nombre" },
            revenue_excl_tax: { libelle: "chiffre d'affaires HT", type: "montant", resume: true },
            revenue_incl_tax: { libelle: "chiffre d'affaires TTC", type: "montant" },
            collected_amount: { libelle: "montant encaissé", type: "montant" },
        },
    },

    v_suppliers: {
        entite: { singulier: "fournisseur", pluriel: "fournisseurs", genre: "m" },
        description: "Fournisseurs de l'entreprise.",
        roles: ["ACCOUNTANT", "MANAGER"],
        colonnes: {
            reference: { libelle: "référence", type: "texte" },
            name: { libelle: "nom", type: "texte" },
            tax_identifier: { libelle: "matricule fiscal", type: "texte" },
            email: { libelle: "email", type: "texte" },
            phone: { libelle: "téléphone", type: "texte" },
            payment_terms_days: { libelle: "délai de paiement (jours)", type: "nombre" },
            status: { libelle: "statut", type: "texte" },
        },
    },

    v_purchase_invoices: {
        entite: { singulier: "facture d'achat", pluriel: "factures d'achat", genre: "f" },
        description: "Factures fournisseurs (achats), y compris celles importées par OCR (source = IMPORT). is_unpaid = reste à payer au fournisseur.",
        roles: ["ACCOUNTANT", "MANAGER"],
        colonnes: {
            invoice_number: { libelle: "numéro de facture", type: "texte" },
            supplier_reference: { libelle: "référence fournisseur", type: "texte" },
            supplier_name: { libelle: "fournisseur", type: "texte" },
            invoice_date: { libelle: "date de facture", type: "date" },
            due_date: { libelle: "échéance", type: "date" },
            status: { libelle: "statut", type: "texte" },
            subtotal_amount: { libelle: "montant hors taxe", type: "montant" },
            tax_amount: { libelle: "montant de taxe", type: "montant" },
            total_amount: { libelle: "montant TTC", type: "montant" },
            paid_amount: { libelle: "montant payé", type: "montant" },
            remaining_amount: { libelle: "reste à payer", type: "montant", resume: true },
            is_unpaid: { libelle: "avec reste à payer", type: "booleen", sens: "ayant un reste à payer" },
            is_overdue: { libelle: "en retard", type: "booleen", sens: "en retard de paiement" },
            source: { libelle: "origine", type: "texte" },
        },
    },
};

/** Une colonne de montant s'additionne-t-elle ? Oui, sauf déclaration contraire. */
export function additive(col: Colonne | undefined): boolean {
    return col?.type === "montant" && col.additif !== false;
}

export function colonnesDe(vue: Vue) {
    return Object.keys(vue.colonnes);
}

export function cataloguePourRole(role: string) {
    return Object.entries(CATALOGUE)
        .filter(([, v]) => v.roles.includes(role))
        .map(([nom, v]) => `${nom} — ${v.description}\n  colonnes : ${colonnesDe(v).join(", ")}`)
        .join("\n\n");
}

/**
 * Données qui existent mais ne sont pas ouvertes au rôle, par leur nom métier.
 * Sans cette liste, le modèle cherche un substitut parmi les vues permises :
 * « les factures impayées » demandées par un commercial devenaient ses
 * commandes en retard. Aucun nom de vue ni de colonne n'est exposé.
 */
export function donneesFermees(role: string): string[] {
    return Object.values(CATALOGUE)
        .filter((v) => !v.roles.includes(role))
        .map((v) => v.entite.pluriel);
}

/** Définition métier des colonnes booléennes. Source unique de vérité. */
export const GLOSSAIRE: Record<string, string> = {
    is_unpaid: "ont un reste à payer",
    is_overdue: "sont en retard (échéance dépassée)",
    is_late: "sont en retard de livraison",
};

/** Libellés lisibles des colonnes de montant. */
export const ETIQUETTES: Record<string, string> = {
    subtotal_amount: "montant hors taxe",
    tax_amount: "montant de taxe",
    total_amount: "montant TTC",
    paid_amount: "montant déjà payé",
    remaining_amount: "reste à payer",
    amount: "montant",
    line_total: "total de ligne",
};