import { describe, it, expect } from "vitest";
import { normaliserCodes, repriseExplicite, reporterSujet, resoudreFiltres, type Sujets } from "@/lib/entites";
import { synthetiser } from "@/lib/synthese";

/**
 * Résolution des entités et report du sujet, contre une base factice.
 *
 * La connexion factice interprète les deux formes de requête émises par
 * entites.ts : la recherche large (clé OU nom, motif %…%) et la
 * reconnaissance exacte d'un identifiant (clé seule, sans joker).
 */

const BASE: Record<string, Record<string, string>[]> = {
    v_customers: [
        { reference: "CLI-007", name: "Horizon Distribution" },
        { reference: "CLI-005", name: "Epsilon Services" },
    ],
    v_products: [{ reference: "PRD-001", name: "Tissu coton" }],
    v_sales_orders: [{ reference: "CMD-2026-0031" }],
    v_sales_invoices: [{ invoice_number: "FAC-2026-0042" }, { invoice_number: "FAC-2026-0001" }],
    v_suppliers: [{ reference: "FRS-001", name: "Atlas Fournitures" }],
};

const ilike = (motif: string, v: string) =>
    new RegExp(`^${motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i").test(v);

const cx = {
    async query(sql: string, params: unknown[] = []) {
        const m = sql.match(/SELECT (\w+) AS cle, (\w+) AS nom\s+FROM (\w+)/);
        if (!m) throw new Error(`requête inattendue : ${sql}`);
        const [, cle, nom, vue] = m;
        let rows = (BASE[vue] ?? []).map((r) => ({ cle: r[cle], nom: r[nom] }));
        if (params.length) {
            const p = String(params[0]);
            rows = rows.filter((r) => ilike(p, r.cle) || (/ OR /.test(sql) && ilike(p, r.nom)));
        }
        return { rows };
    },
};

const COMMANDE: Sujets = {
    client: { cle: "CLI-007", nom: "Horizon Distribution" },
    commande: { cle: "CMD-2026-0031", nom: "CMD-2026-0031" },
};

describe("report du sujet entre deux vues (défaut 6.1)", () => {
    it("porte la commande sur les lignes de commande", () => {
        const r = reporterSujet(true, "v_sales_order_items", [], COMMANDE);
        expect(r.filtres).toContainEqual({ field: "order_reference", op: "eq", value: "CMD-2026-0031" });
    });

    it("ne reporte rien quand le modèle ne signale pas de reprise", () => {
        // « les factures de cette année » : « de cette » n'est pas une reprise.
        const r = reporterSujet(false, "v_sales_invoices", [], COMMANDE);
        expect(r.filtres).toEqual([]);
        expect(r.applique).toBeNull();
    });

    it("refuse en l'expliquant une référence de commande rangée dans une colonne facture", async () => {
        const r = await resoudreFiltres(
            cx, "v_sales_invoice_items",
            [{ field: "invoice_number", op: "eq", value: "CMD-2026-0031" }], "MANAGER",
        );
        expect(r.etat).toBe("introuvable");
        if (r.etat === "ok") return;
        expect(r.message).toContain("est une commande");
        expect(r.message).toContain("lignes de facture");
        // Plus de factures sans rapport proposées en choix.
        expect(r.choix).toEqual([]);
    });

    it("déplace le filtre quand la vue possède une colonne pour l'entité reconnue", async () => {
        const r = await resoudreFiltres(
            cx, "v_sales_invoices",
            [{ field: "invoice_number", op: "eq", value: "cmd-2026-0031" }], "MANAGER",
        );
        expect(r.etat).toBe("ok");
        if (r.etat !== "ok") return;
        expect(r.filtres).toEqual([{ field: "order_reference", op: "eq", value: "CMD-2026-0031" }]);
        expect(r.sujets.commande?.cle).toBe("CMD-2026-0031");
    });

    it("ne reconnaît pas une entité que le rôle ne peut pas lire", async () => {
        // SALES ne lit pas les factures : la référence n'est pas cherchée ailleurs
        // dans une vue qui lui est fermée.
        const r = await resoudreFiltres(
            cx, "v_sales_orders",
            [{ field: "reference", op: "eq", value: "FAC-2026-0042" }], "SALES",
        );
        expect(r.etat).toBe("introuvable");
        if (r.etat === "ok") return;
        expect(r.message).not.toContain("est une facture");
    });
});

describe("accord en genre des messages", () => {
    it("accorde au féminin une facture introuvable", async () => {
        const r = await resoudreFiltres(
            cx, "v_sales_invoices", [{ field: "invoice_number", op: "eq", value: "FAC-9999" }], "MANAGER",
        );
        expect(r.etat === "introuvable" && r.message).toMatch(/^Aucune facture ne correspond/);
    });

    it("accorde au masculin un client introuvable", async () => {
        const r = await resoudreFiltres(
            cx, "v_customers", [{ field: "name", op: "eq", value: "Zeta" }], "MANAGER",
        );
        expect(r.etat === "introuvable" && r.message).toMatch(/^Aucun client ne correspond/);
    });

    it("accorde la liste vide au masculin", () => {
        expect(synthetiser({ view: "v_customers" }, [])).toBe("Aucun client n'a été trouvé.");
    });
});

describe("reprises reconnaissables par la grammaire", () => {
    it.each([
        "c'est quoi le contenu de cette commande",
        "et ses factures ?",
        "montre ses commandes",
        "les produits de CETTE commande",
        "ce client a-t-il des impayés",
        "quelle est sa date de livraison",
    ])("reconnaît « %s »", (q) => expect(repriseExplicite(q)).toBe(true));

    it.each([
        "les factures de cette année",
        "les commandes de ce mois",
        "salut, ça va ?",
        "quelles sont les factures impayées ?",
        "liste des produits de la catégorie Réseau",
    ])("ignore « %s »", (q) => expect(repriseExplicite(q)).toBe(false));
});

describe("valeurs codées écrites en français", () => {
    it.each([
        ["v_sales_orders", "status", "livrée", "DELIVERED"],
        ["v_sales_orders", "status", "Livrées", "DELIVERED"],
        ["v_sales_orders", "status", "annulée", "CANCELLED"],
        ["v_sales_orders", "status", "en_cours", "CONFIRMED"],
        ["v_customers", "status", "archivé", "ARCHIVED"],
        ["v_customers", "status", "inactif", "ARCHIVED"],
        ["v_customer_payments", "payment_method", "chèque", "CHECK"],
        ["v_customer_payments", "payment_method", "virement", "BANK_TRANSFER"],
        ["v_customer_payments", "status", "en attente", "PENDING"],
        ["v_sales_invoices", "status", "partiellement payée", "PARTIALLY_PAID"],
        ["v_sales_invoices", "status", "PAID", "PAID"],
        ["v_sales_invoices", "status", "paid", "PAID"],
    ])("%s.%s : « %s » → %s", (vue, colonne, valeur, code) => {
        expect(normaliserCodes(vue, [{ field: colonne, op: "eq", value: valeur }])[0].value).toBe(code);
    });

    it("traduit chaque élément d'une liste, ne touche ni aux colonnes sans valeurs ni à l'inconnu", () => {
        const r = normaliserCodes("v_sales_orders", [
            { field: "status", op: "in", value: ["livrée", "annulée"] },
            { field: "customer_name", op: "eq", value: "livrée" },
            { field: "status", op: "eq", value: "introuvable" },
        ]);
        expect(r.map((f) => f.value)).toEqual([["DELIVERED", "CANCELLED"], "livrée", "introuvable"]);
    });
});
