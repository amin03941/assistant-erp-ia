import { describe, it, expect } from "vitest";
import { schemaSortie } from "@/lib/llm";
import { CATALOGUE, colonnesDe } from "@/lib/catalogue";
import { verifier, type Cas } from "@/eval/jeu";

/**
 * Le schéma de sortie est la grammaire imposée au modèle. Ce qu'il n'admet
 * pas, le modèle ne peut pas l'écrire : on vérifie donc ici qu'une vue fermée
 * au rôle, une colonne étrangère à la vue ou une action interdite en sont
 * absentes.
 */

type Branche = { properties: Record<string, any>; required: string[] };
const branches = (role: string) => schemaSortie(role).anyOf as Branche[];
const brancheDe = (role: string, type: string) => branches(role).find((b) => b.properties.type.enum[0] === type);
const vuesLecture = (role: string): Branche[] => brancheDe(role, "lecture")?.properties.query_spec.anyOf ?? [];

describe("schéma de sortie par rôle", () => {
    it("n'offre au commercial aucune vue de facturation", () => {
        const vues = vuesLecture("SALES").map((b) => b.properties.view.enum[0]);
        expect(vues).toContain("v_sales_orders");
        expect(vues).not.toContain("v_sales_invoices");
        expect(vues).not.toContain("v_purchase_invoices");
    });

    it("limite chaque vue à ses propres colonnes, dates exclues des filtres", () => {
        for (const b of vuesLecture("MANAGER")) {
            const vue = b.properties.view.enum[0];
            const colonnes = colonnesDe(CATALOGUE[vue]);
            const dates = colonnes.filter((c) => CATALOGUE[vue].colonnes[c].type === "date");
            expect(b.properties.select.items.enum, vue).toEqual(colonnes);
            expect(b.properties.filters.items.properties.field.enum, vue).toEqual(colonnes.filter((c) => !dates.includes(c)));
            // Une date ne peut s'exprimer que par la période, sur une vraie colonne de date.
            if (dates.length) expect(b.properties.periode.properties.colonne.enum, vue).toEqual(dates);
            else expect(b.properties.periode, vue).toBeUndefined();
        }
    });

    it("n'offre aucune action au rôle qui n'en a pas", () => {
        expect(brancheDe("ADMIN", "ecriture")).toBeUndefined();
        expect(brancheDe("SALES", "ecriture")?.properties.action.properties.code.enum).toContain("CREATE_CUSTOMER");
        expect(brancheDe("SALES", "ecriture")?.properties.action.properties.code.enum).not.toContain("CREATE_SALES_INVOICE");
    });

    it("interdit tout champ hors branche", () => {
        for (const b of branches("MANAGER")) expect((b as any).additionalProperties).toBe(false);
    });

    it("impose la nature d'une conversation", () => {
        expect(brancheDe("MANAGER", "conversation")?.required).toEqual(["type", "nature", "reponse"]);
    });
});

describe("notation de l'évaluation", () => {
    const cas: Cas = {
        id: "t", famille: "t", question: "t",
        attendu: { type: "lecture", vue: "v_sales_invoices", filtres: { "is_unpaid?": true }, agregat: "sum" },
    };
    const spec = (filters: any[]) => ({
        type: "lecture", ok: true, view: "v_sales_invoices", filters, aggregate: { fn: "sum", field: "remaining_amount" },
    });

    it("accepte un filtre facultatif absent", () => {
        expect(verifier(cas, spec([])).ok).toBe(true);
    });

    it("refuse un filtre en trop", () => {
        const v = verifier(cas, spec([
            { field: "is_unpaid", op: "eq", value: true },
            { field: "is_overdue", op: "eq", value: false },
        ]));
        expect(v.ok).toBe(false);
        expect(v.ecarts[0]).toContain("filtre en trop : is_overdue");
    });

    it("refuse un mauvais type de demande", () => {
        expect(verifier(cas, { type: "refus", ok: false }).ecarts).toEqual(["type refus au lieu de lecture"]);
    });
});
