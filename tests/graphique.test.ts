import { describe, it, expect } from "vitest";
import { compacte, donneesGraphique, graduations } from "@/lib/graphique";

describe("choix du graphique", () => {
    it("trace la série temporelle d'une vue déclarée comme telle, dans l'ordre du temps", () => {
        const g = donneesGraphique({ view: "v_monthly_revenue" }, [
            { month: "2026-07-01", invoice_count: 19, revenue_excl_tax: "250181.300", revenue_incl_tax: "1" },
            { month: "2026-06-01", invoice_count: 3, revenue_excl_tax: "73537.000", revenue_incl_tax: "1" },
        ]);
        expect(g).toEqual({
            titre: "Chiffre d'affaires HT par mois",
            etiquettes: ["juin 2026", "juil. 2026"],
            valeurs: [73537, 250181.3],
            format: "montant",
            temporel: true,
        });
    });

    it("trace un agrégat regroupé", () => {
        const g = donneesGraphique(
            { view: "v_sales_invoices", aggregate: { fn: "sum", field: "remaining_amount" }, group_by: ["customer_name"] },
            [{ customer_name: "Alpha", resultat: "100" }, { customer_name: "Gamma", resultat: "250.5" }],
        );
        expect(g?.titre).toBe("Total — reste à payer par client");
        expect(g?.valeurs).toEqual([100, 250.5]);
        expect(g?.format).toBe("montant");
        expect(g?.temporel).toBe(false);
    });

    it("compte par groupe", () => {
        const g = donneesGraphique(
            { view: "v_sales_orders", aggregate: { fn: "count" }, group_by: ["status"] },
            [{ status: "CONFIRMED", resultat: 4 }, { status: "DELIVERED", resultat: 9 }],
        );
        expect(g?.titre).toBe("Nombre de commandes clients par statut");
        expect(g?.format).toBe("nombre");
    });

    it("ne trace rien pour une liste ordinaire, un seul point ou trop de points", () => {
        const factures = [{ invoice_number: "F1", total_amount: 1 }, { invoice_number: "F2", total_amount: 2 }];
        expect(donneesGraphique({ view: "v_sales_invoices" }, factures)).toBeNull();
        expect(donneesGraphique({ view: "v_monthly_revenue" }, [{ month: "2026-06-01", revenue_excl_tax: 1 }])).toBeNull();
        const trop = Array.from({ length: 30 }, (_, i) => ({ status: `S${i}`, resultat: i }));
        expect(donneesGraphique({ view: "v_sales_orders", aggregate: { fn: "count" }, group_by: ["status"] }, trop)).toBeNull();
    });

    it("ne trace rien si la colonne de temps n'a pas été sélectionnée", () => {
        expect(donneesGraphique({ view: "v_monthly_revenue" }, [{ revenue_excl_tax: 1 }, { revenue_excl_tax: 2 }])).toBeNull();
    });
});

describe("graduations de l'axe", () => {
    it("arrondit à des pas lisibles, au-delà du maximum", () => {
        expect(graduations(250181.3)).toEqual([0, 100000, 200000, 300000]);
        expect(graduations(19)).toEqual([0, 5, 10, 15, 20]);
        expect(graduations(73537)).toEqual([0, 20000, 40000, 60000, 80000]);
    });

    it("supporte un maximum nul", () => {
        expect(graduations(0)).toEqual([0, 1]);
    });

    it("compacte les grandes valeurs", () => {
        expect(compacte(250000)).toBe("250 k");
        expect(compacte(1200000)).toBe("1,2 M");
        expect(compacte(15)).toBe("15");
    });
});

describe("ordre d'une série", () => {
    it("trie une série par le temps quand aucun tri n'est demandé", async () => {
        const { construireRequete } = await import("@/lib/validateur");
        expect(construireRequete({ view: "v_monthly_revenue" }, "MANAGER").sql).toContain("ORDER BY month ASC");
        expect(construireRequete({ view: "v_monthly_revenue", order_by: { field: "revenue_excl_tax", dir: "desc" } }, "MANAGER").sql)
            .toContain("ORDER BY revenue_excl_tax DESC");
        expect(construireRequete({ view: "v_sales_invoices" }, "MANAGER").sql).not.toContain("ORDER BY");
    });
});

describe("graduations d'un comptage", () => {
    it("restent entières", () => {
        expect(graduations(1, 4, true)).toEqual([0, 1]);
        expect(graduations(3, 4, true)).toEqual([0, 1, 2, 3]);
        expect(graduations(19, 4, true)).toEqual([0, 5, 10, 15, 20]);
    });
});
