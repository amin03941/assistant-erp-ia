import { describe, it, expect } from "vitest";
import { detailsPourRole, traduireNomsInternes, voitDetailsTechniques } from "@/lib/visibilite";

const details = {
    lignes: [{ invoice_number: "FAC-2026-0014" }],
    libelles: { invoice_number: "numéro de facture" },
    sql: "SELECT invoice_number FROM v_sales_invoices WHERE is_unpaid = $1 LIMIT 50",
    params: [true],
    comprehension: { donnees: "factures de vente", conditions: ["ayant un reste à payer"] },
    graphique: null,
};

describe("détails techniques selon le rôle", () => {
    it("retire la requête et ses paramètres pour un commercial et un comptable", () => {
        for (const role of ["SALES", "ACCOUNTANT"]) {
            const vu = detailsPourRole(details, role);
            expect(vu).not.toHaveProperty("sql");
            expect(vu).not.toHaveProperty("params");
            expect(JSON.stringify(vu)).not.toContain("v_sales_invoices");
        }
    });

    it("garde ce que l'utilisateur doit voir : lignes, libellés, compréhension en français", () => {
        const vu = detailsPourRole(details, "SALES");
        expect(vu.lignes).toEqual(details.lignes);
        expect(vu.libelles).toEqual(details.libelles);
        expect(vu.comprehension).toEqual(details.comprehension);
    });

    it("transmet la requête au responsable et à l'administrateur", () => {
        for (const role of ["MANAGER", "ADMIN"]) {
            expect(voitDetailsTechniques(role)).toBe(true);
            expect(detailsPourRole(details, role)).toEqual(details);
        }
    });

    it("refuse par défaut un rôle inconnu", () => {
        expect(voitDetailsTechniques("INCONNU")).toBe(false);
        expect(detailsPourRole(details, "INCONNU")).not.toHaveProperty("sql");
    });
});

describe("noms internes dans un refus", () => {
    it("traduit les codes de rôle", () => {
        expect(traduireNomsInternes("Les factures de vente ne sont pas disponibles pour le rôle SALES."))
            .toBe("Les factures de vente ne sont pas disponibles pour le rôle commercial.");
    });

    it("traduit vues et colonnes, laisse le reste intact", () => {
        expect(traduireNomsInternes("non couvert par v_products (seul sale_price est listé)"))
            .toBe("non couvert par produits (seul prix de vente est listé)");
        expect(traduireNomsInternes("Aucun client ne correspond à « Zzzqqq ».")).toBe("Aucun client ne correspond à « Zzzqqq ».");
    });
});
