import { describe, it, expect } from "vitest";
import { capacites, repondreConversation, texteAcceptable } from "@/lib/dialogue";

/**
 * Messages sans données (défaut 6.3). Le modèle classe, le code répond : la
 * liste des capacités vient du catalogue, et le texte libre du modèle n'est
 * affiché que s'il ne contient aucun fait.
 */

describe("capacités annoncées selon le rôle", () => {
    it("n'annonce au commercial ni les factures ni l'import", () => {
        const t = capacites("SALES");
        expect(t).toContain("les clients");
        expect(t).toContain("les commandes clients");
        expect(t).toContain("créer un client");
        expect(t).not.toContain("factures de vente");
        expect(t).not.toContain("importer");
    });

    it("annonce l'import au comptable", () => {
        const t = capacites("ACCOUNTANT");
        expect(t).toContain("les factures de vente");
        expect(t).toContain("importer une facture fournisseur");
    });

    it("n'annonce aucune action au rôle qui n'en a pas", () => {
        expect(capacites("ADMIN")).not.toContain("Je peux aussi");
    });
});

describe("réponse à un message sans données", () => {
    it("répond à l'aide depuis le catalogue, en ignorant le texte du modèle", () => {
        const t = repondreConversation({ nature: "aide", reponse: "Je peux tout faire !" }, "SALES");
        expect(t).toBe(capacites("SALES"));
    });

    it("affiche une salutation sans fait", () => {
        expect(repondreConversation({ nature: "salutation", reponse: "Bonjour ! Comment puis-je aider ?" }, "MANAGER"))
            .toBe("Bonjour ! Comment puis-je aider ?");
    });

    it("remplace un texte qui contient un chiffre", () => {
        const t = repondreConversation({ nature: "salutation", reponse: "Bonjour, vous avez 17 factures impayées." }, "MANAGER");
        expect(t).not.toMatch(/\d/);
        expect(t).toContain("Bonjour");
    });

    it("remplace un texte qui cite un nom interne", () => {
        expect(texteAcceptable("Je lis la vue v_customers.")).toBe(false);
    });

    it("se rabat sur « autre » pour une nature inconnue", () => {
        const t = repondreConversation({ nature: "inventee", reponse: "" }, "MANAGER");
        expect(t).toContain("données de l'ERP");
    });
});
