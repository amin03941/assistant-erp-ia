import { describe, it, expect } from "vitest";
import { synthetiser } from "@/lib/synthese";
import { construireRequete, ErreurValidation } from "@/lib/validateur";
import { CATALOGUE, additive } from "@/lib/catalogue";

/**
 * Défaut 6.4 : « 2 lignes de facture, prix unitaire cumulé 1 865,500 TND ».
 * Un prix unitaire est déclaré non additif dans le catalogue ; la synthèse et
 * le validateur en tirent la même conséquence, sans cas particulier.
 */

const ligne = (o: any) => ({
    invoice_number: "FAC-1", product_name: "Écran", quantity: 2, unit_price: 932.75, line_total: 1865.5, ...o,
});

describe("montants non additifs", () => {
    it("cumule le total de ligne, jamais le prix unitaire", () => {
        const spec = { view: "v_sales_invoice_items", select: ["invoice_number", "unit_price", "line_total"] };
        const t = synthetiser(spec, [ligne({}), ligne({ unit_price: 100, line_total: 300, quantity: 3 })]);
        expect(t).toContain("total de ligne cumulé 2 165,500 TND");
        expect(t).not.toContain("prix unitaire cumulé");
    });

    it("ne cumule rien quand seul un prix unitaire est affiché", () => {
        const spec = { view: "v_products", select: ["name", "sale_price"] };
        const t = synthetiser(spec, [{ name: "A", sale_price: 10 }, { name: "B", sale_price: 20 }]);
        expect(t).toBe("2 produits.");
    });

    it("refuse la somme d'un prix unitaire, accepte sa moyenne", () => {
        const somme = { view: "v_products", aggregate: { fn: "sum", field: "sale_price" } };
        expect(() => construireRequete(somme, "MANAGER")).toThrow(ErreurValidation);
        const moyenne = { view: "v_products", aggregate: { fn: "avg", field: "sale_price" } };
        expect(construireRequete(moyenne, "MANAGER").sql).toContain("avg(sale_price)");
    });

    it("déclare non additif tout prix unitaire du catalogue", () => {
        for (const [nom, vue] of Object.entries(CATALOGUE)) {
            for (const [col, c] of Object.entries(vue.colonnes)) {
                if (/unit_price|sale_price/.test(col)) expect(additive(c), `${nom}.${col}`).toBe(false);
            }
        }
    });
});

describe("valeurs de filtre conformes au type de la colonne", () => {
    const requete = (filters: any[]) => construireRequete({ view: "v_sales_invoices", filters }, "MANAGER");

    it("refuse un texte libre dans une colonne de date, sans atteindre la base", () => {
        expect(() => requete([{ field: "invoice_date", op: "gte", value: "1er du mois" }]))
            .toThrow("Valeur invalide pour « date de facture » : « 1er du mois ».");
    });

    it("accepte une date ISO, un montant, un booléen", () => {
        const { sql, params } = requete([
            { field: "invoice_date", op: "gte", value: "2026-10-01" },
            { field: "total_amount", op: "gt", value: "1000" },
            { field: "is_unpaid", op: "eq", value: true },
        ]);
        expect(sql).toContain("WHERE invoice_date >= $1 AND total_amount > $2 AND is_unpaid = $3");
        expect(params).toEqual(["2026-10-01", "1000", true]);
    });

    it("refuse un montant écrit en toutes lettres", () => {
        expect(() => requete([{ field: "total_amount", op: "gt", value: "mille" }])).toThrow(ErreurValidation);
    });

    it("refuse une liste vide au lieu de produire IN ()", () => {
        expect(() => requete([{ field: "status", op: "in", value: [] }])).toThrow(ErreurValidation);
    });

    it("n'écrit jamais deux WHERE", () => {
        const { sql } = requete([
            { field: "status", op: "in", value: ["ISSUED", "PAID"] },
            { field: "is_overdue", op: "eq", value: true },
        ]);
        expect(sql.match(/WHERE/g)).toHaveLength(1);
        expect(sql).toContain("status IN ($1, $2) AND is_overdue = $3");
    });

    it("réserve la recherche partielle au texte", () => {
        expect(() => requete([{ field: "total_amount", op: "like", value: "12" }])).toThrow(ErreurValidation);
        expect(requete([{ field: "customer_name", op: "like", value: "Medina" }]).params).toEqual(["%Medina%"]);
    });
});

describe("« Comment j'ai compris »", () => {
    it("explique une lecture avec ses conditions, son calcul et son tri", async () => {
        const { expliquer } = await import("@/lib/synthese");
        const c = expliquer({
            view: "v_sales_invoices",
            filters: [{ field: "customer_name", op: "eq", value: "Medina Textile" }, { field: "is_unpaid", op: "eq", value: true }],
            aggregate: { fn: "sum", field: "remaining_amount" },
            order_by: { field: "resultat", dir: "desc" },
        }, "client Medina Textile");
        expect(c).toEqual({
            donnees: "factures de vente",
            conditions: ["client Medina Textile", "ayant un reste à payer"],
            calcul: "total de « reste à payer »",
            tri: "total de « reste à payer », décroissant",
            sujet: "client Medina Textile",
        });
    });

    it("ne prétend rien expliquer pour une vue inconnue", async () => {
        const { expliquer } = await import("@/lib/synthese");
        expect(expliquer({ view: "v_inexistante" })).toBeNull();
    });
});
