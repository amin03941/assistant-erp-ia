import { describe, it, expect } from "vitest";
import { synthetiser } from "./synthese";

const f = (o: any) => ({
    invoice_number: "FAC-001", customer_name: "Alpha", remaining_amount: 100,
    is_unpaid: true, is_overdue: false, days_overdue: 0, ...o,
});

describe("synthetiser", () => {
    it("compte au singulier", () => {
        const spec = { view: "v_customers", aggregate: { fn: "count" } };
        expect(synthetiser(spec, [{ resultat: 1 }])).toBe("1 client.");
    });

    it("compte au pluriel", () => {
        const spec = { view: "v_customers", aggregate: { fn: "count" } };
        expect(synthetiser(spec, [{ resultat: 10 }])).toBe("10 clients.");
    });

    it("formate une somme de montants", () => {
        const spec = {
            view: "v_sales_invoices",
            aggregate: { fn: "sum", field: "remaining_amount" },
            filters: [{ field: "is_unpaid", op: "eq", value: true }],
        };
        const t = synthetiser(spec, [{ resultat: 293565.075 }]);
        expect(t).toContain("293 565,075 TND");
        expect(t).toContain("reste à payer");
        expect(t).not.toContain("ayant un reste à payer");
    });

    it("ne recompte pas un booléen déjà filtré", () => {
        const spec = {
            view: "v_sales_invoices",
            filters: [{ field: "is_unpaid", op: "eq", value: true }],
        };
        const t = synthetiser(spec, [f({}), f({ is_overdue: true })]);
        expect(t).not.toContain("dont 2 ayant un reste à payer");
        expect(t).toContain("dont 1 en retard");
    });

    it("annonce l'absence de résultat sans inventer de condition", () => {
        const spec = { view: "v_sales_invoices", filters: [] };
        expect(synthetiser(spec, [])).toBe("Aucune facture de vente n'a été trouvée.");
    });

    it("reprend le filtre textuel dans la phrase", () => {
        const spec = {
            view: "v_sales_invoices",
            filters: [{ field: "customer_name", op: "eq", value: "Zeta Trading" }],
        };
        expect(synthetiser(spec, [f({})])).toContain("client Zeta Trading");
    });

    it("signale une liste tronquée", () => {
        const spec = { view: "v_sales_invoices", limit: 2 };
        expect(synthetiser(spec, [f({}), f({})])).toContain("affichage limité");
    });
});
