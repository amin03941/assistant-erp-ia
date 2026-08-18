export type Vue = {
    colonnes: string[];
    description: string;
    roles: string[];
};

export const CATALOGUE: Record<string, Vue> = {
    v_customers: {
        colonnes: ["reference", "name", "email", "phone", "payment_terms_days", "status"],
        description: "Clients de l'entreprise.",
        roles: ["SALES", "ACCOUNTANT", "MANAGER"],
    },
    v_products: {
        colonnes: ["reference", "name", "category", "product_type", "unit", "sale_price", "tax_rate", "stock_quantity", "status"],
        description: "Produits et services. Sans prix d'achat.",
        roles: ["SALES", "ACCOUNTANT", "MANAGER"],
    },
    v_sales_orders: {
        colonnes: ["reference", "customer_reference", "customer_name", "order_date", "expected_delivery_date", "status", "total_amount", "is_late", "days_late"],
        description: "Commandes clients. is_late = commande confirmée dont la livraison prévue est dépassée.",
        roles: ["SALES", "MANAGER"],
    },
    v_sales_invoices: {
        colonnes: ["invoice_number", "customer_reference", "customer_name", "order_reference", "invoice_date", "due_date", "status", "subtotal_amount", "tax_amount", "total_amount", "paid_amount", "remaining_amount", "is_unpaid", "is_overdue", "days_overdue"],
        description: "Factures de vente. is_unpaid = reste à payer. is_overdue = impayée et échéance dépassée.",
        roles: ["ACCOUNTANT", "MANAGER"],
    },
    v_sales_invoice_items: {
        colonnes: ["invoice_number", "customer_name", "product_reference", "product_name", "description", "quantity", "unit_price", "line_total", "invoice_date", "invoice_status"],
        description: "Lignes de facture de vente. Sert au chiffre d'affaires par produit.",
        roles: ["ACCOUNTANT", "MANAGER"],
    },
    v_customer_payments: {
        colonnes: ["reference", "customer_name", "invoice_number", "payment_date", "amount", "payment_method", "status"],
        description: "Paiements clients. Seuls ceux au statut CONFIRMED comptent.",
        roles: ["ACCOUNTANT", "MANAGER"],
    },
};

export function cataloguePourRole(role: string) {
    return Object.entries(CATALOGUE)
        .filter(([, v]) => v.roles.includes(role))
        .map(([nom, v]) => `${nom} — ${v.description}\n  colonnes : ${v.colonnes.join(", ")}`)
        .join("\n\n");
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