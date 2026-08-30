import { describe, it, expect } from "vitest";
import { normaliserFacture, controler, type FactureBrute } from "@/lib/ocr";

/**
 * Tests de normaliserFacture et controler, sans modèle et sans base : ce sont
 * des fonctions pures, comme normaliser() et preparer() dans lib/actions.ts.
 */

/** Facture cohérente : 3 × 1 850,000 + 1 925,000 = 7 475,000 HT, TVA 19 %. */
function factureValide(extra: Partial<FactureBrute> = {}): FactureBrute {
    return {
        numero: "FAC-F-2026-0042",
        date_facture: "28/08/2026",
        date_echeance: "27/09/2026",
        fournisseur_nom: "TechnoImport SA",
        fournisseur_matricule: "1111111/A/M/000",
        destinataire_nom: "Notre société",
        total_ht: "7 475,000",
        total_tva: "1 420,250",
        total_ttc: "8 895,250",
        lignes: [
            {
                reference: "P-001",
                designation: "Produit un",
                quantite: "3 unite",
                prix_unitaire: "1 850,000",
                taux_tva: "19 %",
                total_ligne: "5 550,000",
            },
            {
                reference: "P-002",
                designation: "Produit deux",
                quantite: "1 unite",
                prix_unitaire: "1 925,000",
                taux_tva: "19 %",
                total_ligne: "1 925,000",
            },
        ],
        ...extra,
    };
}

describe("normaliserFacture", () => {
    it("isole le nombre de sa quantité avec unité", () => {
        const n = normaliserFacture(factureValide());
        expect(n.lignes[0].quantite).toBe(3);
    });

    it("isole le nombre d'un taux de TVA suivi de %", () => {
        const n = normaliserFacture(factureValide());
        expect(n.lignes[0].taux_tva).toBe(19);
    });

    it("convertit un montant avec séparateur de milliers et devise", () => {
        const n = normaliserFacture(factureValide());
        expect(n.total_ht).toBe(7475);
    });

    it("convertit les dates au format ISO", () => {
        const n = normaliserFacture(factureValide());
        expect(n.date_facture).toBe("2026-08-28");
        expect(n.date_echeance).toBe("2026-09-27");
    });

    it("découpe le numéro et les désignations", () => {
        const n = normaliserFacture(factureValide({ numero: "  FAC-F-2026-0042  " }));
        expect(n.numero).toBe("FAC-F-2026-0042");
        expect(n.lignes[0].designation).toBe("Produit un");
    });

    it("un champ vide ou illisible devient null, jamais une erreur", () => {
        const n = normaliserFacture(factureValide({ total_tva: "", date_echeance: "illisible" }));
        expect(n.total_tva).toBeNull();
        expect(n.date_echeance).toBeNull();
    });

    it("une facture sans lignes donne un tableau vide", () => {
        const n = normaliserFacture(factureValide({ lignes: [] }));
        expect(n.lignes).toEqual([]);
    });
});

describe("controler", () => {
    it("ne remonte aucune anomalie sur une facture cohérente", () => {
        expect(controler(normaliserFacture(factureValide()))).toEqual([]);
    });

    it("signale un numéro illisible", () => {
        const a = controler(normaliserFacture(factureValide({ numero: "" })));
        expect(a.some((x) => x.champ === "numero")).toBe(true);
    });

    it("signale une date de facture illisible", () => {
        const a = controler(normaliserFacture(factureValide({ date_facture: "" })));
        expect(a.some((x) => x.champ === "date_facture")).toBe(true);
    });

    it("signale un total TTC illisible", () => {
        const a = controler(normaliserFacture(factureValide({ total_ttc: "" })));
        expect(a.some((x) => x.champ === "total_ttc")).toBe(true);
    });

    it("signale HT + TVA différent du TTC lu", () => {
        const a = controler(normaliserFacture(factureValide({ total_ttc: "9 999,000" })));
        const anomalie = a.find((x) => x.champ === "total_ttc" && x.message.includes("HT + TVA"));
        expect(anomalie?.message).toContain("9999.000");
    });

    it("signale une somme des lignes différente du total HT", () => {
        const a = controler(normaliserFacture(factureValide({ total_ht: "9 999,000" })));
        expect(a.some((x) => x.champ === "lignes" && x.message.includes("somme des lignes"))).toBe(true);
    });

    it("signale l'absence de lignes", () => {
        const a = controler(normaliserFacture(factureValide({ lignes: [] })));
        expect(a.some((x) => x.champ === "lignes" && x.message.includes("Aucune ligne"))).toBe(true);
    });

    it("signale une ligne dont la quantité ou le prix est illisible", () => {
        const f = factureValide();
        f.lignes![0].quantite = "";
        const a = controler(normaliserFacture(f));
        expect(a.some((x) => x.champ === "lignes[0]" && x.message.includes("illisible"))).toBe(true);
    });

    it("signale une ligne dont quantité × prix ne fait pas le total lu", () => {
        const f = factureValide();
        f.lignes![0].quantite = "30 unite";
        const a = controler(normaliserFacture(f));
        expect(a.some((x) => x.champ === "lignes[0]" && x.message.includes("30 × 1850 ne fait pas 5550"))).toBe(true);
    });

    // Ce test fige un comportement volontaire, découvert en sabotant le script :
    // une quantité fausse ne déclenche QU'UNE anomalie, pas deux. Le contrôle
    // « somme des lignes = HT » additionne total_ligne (lu indépendamment par
    // l'OCR), pas quantité × prix — il ne bouge donc pas quand seule la quantité
    // est fausse. Les deux contrôles couvrent deux erreurs différentes : un total
    // de ligne mal lu, ou une composante (quantité/prix) mal lue.
    it("une quantité isolée faussée ne déclenche qu'une anomalie, pas deux", () => {
        const f = factureValide();
        f.lignes![0].quantite = "30 unite";
        const a = controler(normaliserFacture(f));
        expect(a).toHaveLength(1);
        expect(a[0].champ).toBe("lignes[0]");
    });
});
