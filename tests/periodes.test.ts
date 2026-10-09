import { describe, it, expect } from "vitest";
import { aujourdhui, appliquerPeriode, bornes, libellePeriode, CODES_PERIODE, type Periode } from "@/lib/periodes";

/**
 * Périodes relatives : le modèle nomme la période, le code calcule les dates.
 * Date de référence fixe pour que les tests ne dépendent pas du jour.
 */

const REF = "2026-10-09"; // un vendredi
const p = (code: string, o: Partial<Periode> = {}): Periode => ({ colonne: "invoice_date", code, ...o });
const b = (code: string, o: Partial<Periode> = {}, ref = REF) => bornes(p(code, o), ref);

describe("bornes des périodes", () => {
    it.each([
        ["aujourd_hui", "2026-10-09", "2026-10-10"],
        ["hier", "2026-10-08", "2026-10-09"],
        ["cette_semaine", "2026-10-05", "2026-10-12"],
        ["semaine_derniere", "2026-09-28", "2026-10-05"],
        ["ce_mois", "2026-10-01", "2026-11-01"],
        ["mois_dernier", "2026-09-01", "2026-10-01"],
        ["ce_trimestre", "2026-10-01", "2027-01-01"],
        ["trimestre_dernier", "2026-07-01", "2026-10-01"],
        ["cette_annee", "2026-01-01", "2027-01-01"],
        ["annee_derniere", "2025-01-01", "2026-01-01"],
        ["7_derniers_jours", "2026-10-03", "2026-10-10"],
        ["30_derniers_jours", "2026-09-10", "2026-10-10"],
    ])("%s", (code, debut, fin) => {
        expect(b(code)).toEqual({ debut, fin });
    });

    it("traverse le changement d'année", () => {
        expect(b("mois_dernier", {}, "2026-01-15")).toEqual({ debut: "2025-12-01", fin: "2026-01-01" });
        expect(b("trimestre_dernier", {}, "2026-02-10")).toEqual({ debut: "2025-10-01", fin: "2026-01-01" });
        expect(b("ce_mois", {}, "2026-12-31")).toEqual({ debut: "2026-12-01", fin: "2027-01-01" });
    });

    it("commence la semaine le lundi, y compris un dimanche", () => {
        expect(b("cette_semaine", {}, "2026-10-11")).toEqual({ debut: "2026-10-05", fin: "2026-10-12" });
    });

    it("prend la dernière occurrence passée d'un mois nommé sans année", () => {
        expect(b("mois_nomme", { mois: "septembre" })).toEqual({ debut: "2026-09-01", fin: "2026-10-01" });
        expect(b("mois_nomme", { mois: "octobre" })).toEqual({ debut: "2026-10-01", fin: "2026-11-01" });
        expect(b("mois_nomme", { mois: "novembre" })).toEqual({ debut: "2025-11-01", fin: "2025-12-01" });
    });

    it("respecte l'année lue dans la question", () => {
        expect(b("mois_nomme", { mois: "novembre", annee: "2026" })).toEqual({ debut: "2026-11-01", fin: "2026-12-01" });
        expect(b("annee_nommee", { annee: "2025" })).toEqual({ debut: "2025-01-01", fin: "2026-01-01" });
    });

    it("refuse une période incomplète au lieu de deviner", () => {
        expect(b("mois_nomme", {})).toHaveProperty("erreur");
        expect(b("annee_nommee", { annee: "l'an passé" })).toHaveProperty("erreur");
        expect(b("inventee")).toHaveProperty("erreur");
    });

    it("couvre tous les codes déclarés", () => {
        for (const code of CODES_PERIODE) {
            const r = b(code, { mois: "mars", annee: "2025", du: "01/03/2025", au: "31/03/2025" });
            expect(r, code).not.toHaveProperty("erreur");
        }
    });
});

describe("libellé d'une période", () => {
    const lib = (code: string, o: Partial<Periode> = {}) => {
        const r = b(code, o);
        if ("erreur" in r) throw new Error(r.erreur);
        return libellePeriode(p(code, o), r);
    };

    it("rappelle les dates réelles", () => {
        expect(lib("ce_mois")).toBe("ce mois-ci (octobre 2026)");
        expect(lib("hier")).toBe("hier (8 octobre 2026)");
        expect(lib("cette_semaine")).toBe("cette semaine (du 5 octobre 2026 au 11 octobre 2026)");
        expect(lib("annee_derniere")).toBe("l'année dernière (2025)");
        expect(lib("mois_nomme", { mois: "septembre" })).toBe("en septembre 2026");
        expect(lib("annee_nommee", { annee: "2025" })).toBe("en 2025");
        expect(lib("trimestre_dernier")).toBe("le trimestre dernier (du 1er juillet 2026 au 30 septembre 2026)");
    });
});

describe("application à une spécification", () => {
    it("ajoute deux filtres, début inclus et fin exclue", () => {
        const spec = { view: "v_sales_invoices", filters: [{ field: "is_unpaid", op: "eq", value: true }], periode: p("ce_mois") };
        expect(appliquerPeriode(spec, REF)).toEqual({ ok: true });
        expect(spec.filters).toEqual([
            { field: "is_unpaid", op: "eq", value: true },
            { field: "invoice_date", op: "gte", value: "2026-10-01", origine: "periode" },
            { field: "invoice_date", op: "lt", value: "2026-11-01", origine: "periode" },
        ]);
    });

    it("est idempotente et remplace une période précédente", () => {
        const spec: any = { view: "v_sales_invoices", filters: [], periode: p("ce_mois") };
        appliquerPeriode(spec, REF);
        spec.periode = p("mois_dernier");
        appliquerPeriode(spec, REF);
        appliquerPeriode(spec, REF);
        expect(spec.filters.map((f: any) => f.value)).toEqual(["2026-09-01", "2026-10-01"]);
    });

    it("remplace une date inventée par le modèle sur la même colonne", () => {
        const spec = {
            view: "v_sales_invoices",
            filters: [{ field: "invoice_date", op: "gte", value: "2024-10-01" }],
            periode: p("ce_mois"),
        };
        appliquerPeriode(spec, REF);
        expect(spec.filters.every((f) => !String(f.value).startsWith("2024"))).toBe(true);
    });

    it("retire les filtres de période quand la période disparaît", () => {
        const spec: any = { view: "v_sales_invoices", filters: [], periode: p("ce_mois") };
        appliquerPeriode(spec, REF);
        spec.periode = null;
        appliquerPeriode(spec, REF);
        expect(spec.filters).toEqual([]);
    });

    it("refuse une période sur une colonne qui n'est pas une date de la vue", () => {
        const spec = { view: "v_customers", filters: [], periode: { colonne: "name", code: "ce_mois" } };
        expect(appliquerPeriode(spec, REF).ok).toBe(false);
    });
});

describe("date du jour", () => {
    it("suit le fuseau de Tunis, pas l'heure UTC du serveur", () => {
        // 23 h 30 UTC le 9 octobre : il est déjà 0 h 30 le 10 octobre à Tunis (UTC+1).
        expect(aujourdhui(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-10");
    });
});

describe("période dans la phrase de réponse", () => {
    it("dit la période en mots, sans les dates techniques", async () => {
        const { synthetiser } = await import("@/lib/synthese");
        const spec: any = { view: "v_sales_invoices", filters: [], periode: p("ce_mois") };
        appliquerPeriode(spec, REF);
        const t = synthetiser(spec, [{ invoice_number: "FAC-1", remaining_amount: 10 }]);
        expect(t).toContain("ce mois-ci (octobre 2026)");
        expect(t).not.toContain("2026-10-01");
    });

    it("nomme une colonne de date secondaire", async () => {
        const { synthetiser } = await import("@/lib/synthese");
        const spec: any = { view: "v_sales_invoices", filters: [], periode: { colonne: "due_date", code: "ce_mois" } };
        appliquerPeriode(spec, REF);
        expect(synthetiser(spec, [])).toBe("Aucune facture de vente échéance ce mois-ci (octobre 2026) n'a été trouvée.");
    });
});

describe("dates écrites dans la question", () => {
    it.each([
        ["le_jour", { du: "15/08/2026" }, { debut: "2026-08-15", fin: "2026-08-16" }],
        ["le_jour", { du: "le 1er septembre" }, { debut: "2026-09-01", fin: "2026-09-02" }],
        ["depuis", { du: "depuis le 1er août 2026" }, { debut: "2026-08-01" }],
        ["jusqu_a", { au: "30/09/2026" }, { fin: "2026-10-01" }],
        ["entre", { du: "1er juillet", au: "15 juillet 2026" }, { debut: "2026-07-01", fin: "2026-07-16" }],
    ])("%s %j", (code, o, attendu) => {
        expect(b(code, o as Partial<Periode>)).toEqual(attendu);
    });

    it("refuse une date illisible ou un intervalle à l'envers", () => {
        expect(b("depuis", { du: "le début du mois" })).toEqual({ erreur: "Je n'ai pas compris la date « le début du mois »." });
        expect(b("entre", { du: "10/09/2026", au: "01/09/2026" })).toHaveProperty("erreur");
        expect(b("depuis", {})).toHaveProperty("erreur");
    });

    it("libelle les bornes ouvertes", () => {
        const r1 = b("depuis", { du: "1er août 2026" });
        const r2 = b("jusqu_a", { au: "30/09/2026" });
        const r3 = b("le_jour", { du: "15/08/2026" });
        if ("erreur" in r1 || "erreur" in r2 || "erreur" in r3) throw new Error("bornes");
        expect(libellePeriode(p("depuis"), r1)).toBe("depuis le 1er août 2026");
        expect(libellePeriode(p("jusqu_a"), r2)).toBe("jusqu'au 30 septembre 2026");
        expect(libellePeriode(p("le_jour"), r3)).toBe("le 15 août 2026");
    });

    it("n'ajoute qu'une borne pour une période ouverte", () => {
        const spec: any = { view: "v_sales_invoices", filters: [], periode: p("depuis", { du: "1er août 2026" }) };
        appliquerPeriode(spec, REF);
        expect(spec.filters).toEqual([{ field: "invoice_date", op: "gte", value: "2026-08-01", origine: "periode" }]);
    });
});
