import { describe, it, expect } from "vitest";
import { textePourVoix } from "@/lib/voix";
import { synthetiser } from "@/lib/synthese";

describe("texte destiné à la synthèse vocale", () => {
    it("dit les montants en dinars et millimes", () => {
        expect(textePourVoix("Total — reste à payer : 14 778,015 TND.")).toBe("Total, reste à payer : 14778 dinars et 15 millimes.");
    });

    it("omet les millimes nuls et accorde le singulier", () => {
        expect(textePourVoix("500,000 TND")).toBe("500 dinars");
        expect(textePourVoix("1,250 TND")).toBe("1 dinar et 250 millimes");
    });

    it("retire les tirets des références", () => {
        expect(textePourVoix("commande CMD-2026-0031")).toBe("commande CMD 2026 0031");
    });

    it("lit la note de reprise comme une phrase", () => {
        expect(textePourVoix("2 lignes de commande.\n\n(pour commande CMD-2026-0031)"))
            .toBe("2 lignes de commande. pour commande CMD 2026 0031");
    });

    it("rend prononçable une phrase réelle de la synthèse", () => {
        const phrase = synthetiser(
            { view: "v_sales_invoices", aggregate: { fn: "sum", field: "remaining_amount" }, filters: [{ field: "is_unpaid", op: "eq", value: true }] },
            [{ resultat: 293565.075 }],
        );
        const lue = textePourVoix(phrase);
        expect(lue).toContain("293565 dinars et 75 millimes");
        expect(lue).not.toMatch(/TND|—/);
    });
});
