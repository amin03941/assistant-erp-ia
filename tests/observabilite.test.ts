import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    libelleEvenement, libelleIntention, natureDemande, rapportsEvaluation, syntheseStatuts,
} from "@/lib/observabilite";

describe("synthèse des statuts", () => {
    it("compte une question par ligne QUERY et sépare les écritures", () => {
        const { questions, actions } = syntheseStatuts([
            { request_type: "QUERY", status: "EXECUTED", n: 8 },
            { request_type: "QUERY", status: "REFUSED", n: 1 },
            { request_type: "QUERY", status: "PENDING", n: 1 },
            { request_type: "ACTION", status: "EXECUTED", n: 3 },
            { request_type: "ACTION", status: "AWAITING_CONFIRMATION", n: 2 },
            { request_type: "ACTION", status: "CANCELLED", n: 1 },
        ]);
        expect(questions).toEqual({
            total: 10, repondues: 8, refusees: 1, echecs: 0, interrompues: 1, tauxReponse: 80, tauxRefus: 10,
        });
        expect(actions).toEqual({ executees: 3, enAttente: 2, annulees: 1, echecs: 0 });
    });

    it("ne divise pas par zéro sans aucune question", () => {
        expect(syntheseStatuts([]).questions.tauxReponse).toBeNull();
    });
});

describe("nature et libellés", () => {
    it("classe une intention", () => {
        expect(natureDemande("v_sales_invoices")).toBe("consultation");
        expect(natureDemande("CREATE_CUSTOMER")).toBe("ecriture");
        expect(natureDemande("CONVERSATION")).toBe("conversation");
        expect(natureDemande(null)).toBe("sansSuite");
    });

    it("traduit les noms internes en mots", () => {
        expect(libelleIntention("v_sales_invoices")).toBe("factures de vente");
        expect(libelleIntention("v_monthly_revenue")).toBe("chiffre d'affaires mensuel");
        expect(libelleIntention("CREATE_CUSTOMER")).toBe("Créer un client");
        expect(libelleEvenement("CREATE", "customer_payment")).toBe("Création — paiement client");
        expect(libelleEvenement("LOGIN", null)).toBe("Connexion");
    });
});

describe("rapports d'évaluation", () => {
    it("lit les rapports, du plus récent au plus ancien, et repère celui de départ", () => {
        const dossier = mkdtempSync(join(tmpdir(), "eval-"));
        writeFileSync(join(dossier, "a-depart.json"), JSON.stringify({ modele: "m", date: "2026-10-01", score: { reussis: 37, total: 50, taux: 74 } }));
        writeFileSync(join(dossier, "b.json"), JSON.stringify({ modele: "m", date: "2026-10-09", score: { reussis: 57, total: 57, taux: 100 }, complet: true }));
        writeFileSync(join(dossier, "illisible.json"), "{");
        const r = rapportsEvaluation(dossier);
        expect(r.map((x) => [x.taux, x.depart])).toEqual([[100, false], [74, true]]);
    });

    it("renvoie une liste vide si le dossier n'existe pas", () => {
        expect(rapportsEvaluation(join(tmpdir(), "inexistant-" + Date.now()))).toEqual([]);
    });
});

describe("noms internes dans un texte", () => {
    it("les traduit dans les mots du catalogue", async () => {
        const { traduireNomsInternes } = await import("@/lib/observabilite");
        expect(traduireNomsInternes("Les vues disponibles sont v_customers et v_sales_orders, par 'customer_reference'."))
            .toBe("Les vues disponibles sont clients et commandes clients, par 'référence client'.");
        expect(traduireNomsInternes("Aucun client ne correspond à « Zzzqqq ».")).toBe("Aucun client ne correspond à « Zzzqqq ».");
    });
});
