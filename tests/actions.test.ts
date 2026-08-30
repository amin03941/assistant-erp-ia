import { describe, it, expect } from "vitest";
import {
    actionParCode,
    preparer,
    fusionner,
    resoudreCible,
    resumer,
    normaliser,
    chercherNombre,
    type Role,
    type Champ,
} from "@/lib/actions";

/**
 * Tests des actions d'écriture, sans base ni modèle.
 *
 * Tout ce qui est vérifié ici est déterministe : la normalisation des valeurs
 * libres, les règles de champ obligatoire, la construction du résumé et la
 * logique de résolution des cibles. La base est remplacée par une connexion
 * factice qui renvoie des lignes choisies, ce qui permet de tester la levée
 * d'ambiguïté et les qualificatifs de rang sans PostgreSQL.
 */

const PAIEMENT = actionParCode("CREATE_CUSTOMER_PAYMENT")!;
const CLIENT = actionParCode("CREATE_CUSTOMER")!;
const MAJ_CLIENT = actionParCode("UPDATE_CUSTOMER")!;
const FACTURATION = actionParCode("CREATE_SALES_INVOICE")!;

const MANAGER: Role = "MANAGER";
const AUJOURD_HUI = new Date().toISOString().slice(0, 10);

/** Prépare un paiement complet, en ne faisant varier qu'un champ. */
function paiement(extra: Record<string, unknown> = {}) {
    return preparer(
        PAIEMENT,
        MANAGER,
        { amount: 1000, payment_method: "virement", ...extra },
        "FAC-2026-0001",
    );
}

function valeurs(p: ReturnType<typeof preparer>) {
    if (p.etat === "refus") throw new Error(`refus inattendu : ${p.motif}`);
    return p.valeurs;
}

// ---------------------------------------------------------------------------

describe("montants", () => {
    const cas: [unknown, number][] = [
        [5000, 5000],
        ["5000", 5000],
        ["5 000", 5000],
        ["5000 dinars", 5000],
        ["5000 TND", 5000],
        ["1 200,50", 1200.5],
        ["1200.50", 1200.5],
        ["1200,500", 1200.5],
        ["5.000", 5000], // séparateur de milliers
        ["1.234.567", 1234567],
        ["5.5", 5.5], // décimale
        ["2.500 dinars", 2500],
        ["1,234.56", 1234.56], // convention anglaise
    ];

    it.each(cas)("« %s » vaut %s", (brut, attendu) => {
        expect(valeurs(paiement({ amount: brut })).amount).toBe(attendu);
    });

    it("refuse un montant nul ou négatif", () => {
        expect(paiement({ amount: 0 }).etat).toBe("refus");
        expect(paiement({ amount: -50 }).etat).toBe("refus");
    });

    it("réclame le montant quand il est incompréhensible", () => {
        const p = paiement({ amount: "beaucoup" });
        expect(p.etat).toBe("incomplet");
        if (p.etat === "incomplet") {
            const m = p.manquants.find((x) => x.colonne === "amount");
            expect(m?.invite).toContain("beaucoup");
        }
    });
});

describe("dates", () => {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);

    const cas: [string, string][] = [
        ["2026-08-15", "2026-08-15"],
        ["15/08/2026", "2026-08-15"],
        ["15-08-2026", "2026-08-15"],
        ["15.08.2026", "2026-08-15"],
        ["15/08/26", "2026-08-15"],
        ["15 aout 2026", "2026-08-15"],
        ["15 août 2026", "2026-08-15"],
        ["1er septembre 2026", "2026-09-01"],
        ["aujourd'hui", AUJOURD_HUI],
        ["hier", hier.toISOString().slice(0, 10)],
        ["demain", demain.toISOString().slice(0, 10)],
    ];

    it.each(cas)("« %s » vaut %s", (brut, attendu) => {
        expect(valeurs(paiement({ payment_date: brut })).payment_date).toBe(attendu);
    });

    it("ne remplace pas une date impossible par la date du jour", () => {
        const p = paiement({ payment_date: "32/13/2026" });
        expect(p.etat).toBe("incomplet");
        if (p.etat === "incomplet") {
            expect(p.manquants.map((m) => m.colonne)).toContain("payment_date");
        }
    });

    it("applique la date du jour quand rien n'est dit", () => {
        expect(valeurs(paiement()).payment_date).toBe(AUJOURD_HUI);
    });
});

describe("absence de valeur", () => {
    // Le modèle exprime l'absence de plusieurs façons. Aucune ne doit être
    // traitée comme une erreur : le défaut du champ s'applique.
    const formes = ["null", "NULL", "aucun", "aucune", "non mentionné", "non renseigné", "", "  "];

    it.each(formes)("« %s » laisse le défaut s'appliquer", (forme) => {
        const p = paiement({ payment_date: forme });
        expect(p.etat).toBe("ok");
        expect(valeurs(p).payment_date).toBe(AUJOURD_HUI);
    });

    it("traite null et undefined comme une absence", () => {
        expect(valeurs(paiement({ payment_date: null })).payment_date).toBe(AUJOURD_HUI);
        expect(valeurs(paiement({ payment_date: undefined })).payment_date).toBe(AUJOURD_HUI);
    });
});

describe("moyens de paiement", () => {
    const cas: [string, string][] = [
        ["virement", "BANK_TRANSFER"],
        ["virement bancaire", "BANK_TRANSFER"],
        ["par virement", "BANK_TRANSFER"],
        ["BANK_TRANSFER", "BANK_TRANSFER"],
        ["chèque", "CHECK"],
        ["cheque", "CHECK"],
        ["par chèque", "CHECK"],
        ["espèces", "CASH"],
        ["especes", "CASH"],
        ["cash", "CASH"],
        ["liquide", "CASH"],
        ["carte bancaire", "CARD"],
        ["CB", "CARD"],
        ["traite", "OTHER"],
    ];

    it.each(cas)("« %s » vaut %s", (brut, attendu) => {
        expect(valeurs(paiement({ payment_method: brut })).payment_method).toBe(attendu);
    });

    it("réclame le moyen de paiement et liste les valeurs acceptées", () => {
        const p = paiement({ payment_method: "en bitcoin" });
        expect(p.etat).toBe("incomplet");
        if (p.etat === "incomplet") {
            const m = p.manquants.find((x) => x.colonne === "payment_method");
            expect(m?.invite).toContain("BANK_TRANSFER");
        }
    });
});

describe("entiers", () => {
    const CHAMP_ENTIER: Champ = { colonne: "n", libelle: "n", type: "entier", requis: false };

    const cas: [string, number][] = [
        ["45", 45],
        ["délai de paiement de 45 jours", 45],
        ["45 jours", 45],
    ];

    it.each(cas)("« %s » vaut %s", (brut, attendu) => {
        expect(normaliser(CHAMP_ENTIER, brut)).toBe(attendu);
    });

    it("sans nombre du tout, renvoie null", () => {
        expect(normaliser(CHAMP_ENTIER, "quarante-cinq")).toBeNull();
    });

    it("vide, renvoie null", () => {
        expect(normaliser(CHAMP_ENTIER, "")).toBeNull();
    });
});

describe("repli : nombre cherché dans la phrase", () => {
    const CHAMP_DELAI = MAJ_CLIENT.champs.find((c) => c.colonne === "payment_terms_days")!;

    it("trouve le nombre qui suit le libellé du champ", () => {
        const p = "Modifie le délai de paiement du client Epsilon Services en 60 jours";
        expect(chercherNombre(CHAMP_DELAI, p)).toBe("60");
    });

    it("ne trouve rien si le libellé du champ n'apparaît pas dans la phrase", () => {
        const p = "Modifie le téléphone du client X en 71 111 222";
        expect(chercherNombre(CHAMP_DELAI, p)).toBeNull();
    });

    it("preparer complète un champ vide depuis la phrase", () => {
        const p = preparer(
            MAJ_CLIENT,
            MANAGER,
            { payment_terms_days: "" },
            "Epsilon Services",
            "Modifie le délai de paiement du client Epsilon Services en 60 jours",
        );
        expect(p.etat).toBe("ok");
        expect(valeurs(p).payment_terms_days).toBe(60);
    });

    it("sans phrase, le champ vide reste vide (aucune modification déduite)", () => {
        const p = preparer(MAJ_CLIENT, MANAGER, { payment_terms_days: "" }, "Epsilon Services");
        expect(p.etat).toBe("refus");
    });
});

describe("champs obligatoires", () => {
    it("réclame le montant et le moyen de paiement s'ils manquent", () => {
        const p = preparer(PAIEMENT, MANAGER, {}, "FAC-2026-0001");
        expect(p.etat).toBe("incomplet");
        if (p.etat === "incomplet") {
            expect(p.manquants.map((m) => m.colonne).sort()).toEqual(["amount", "payment_method"]);
        }
    });

    it("réclame la cible quand elle manque", () => {
        const p = preparer(PAIEMENT, MANAGER, { amount: 100, payment_method: "cash" });
        expect(p.etat).toBe("incomplet");
        if (p.etat === "incomplet") {
            expect(p.manquants.some((m) => m.colonne === "__cible__")).toBe(true);
        }
    });

    it("réclame le nom à la création d'un client", () => {
        const p = preparer(CLIENT, MANAGER, { email: "a@b.tn" });
        expect(p.etat).toBe("incomplet");
    });

    it("ne réclame pas le nom à la modification d'un client", () => {
        // Changer un e-mail n'exige pas de redonner le nom : « requis » vaut pour
        // une création, pas pour une modification.
        const p = preparer(MAJ_CLIENT, MANAGER, { email: "a@b.tn" }, "CLI-005");
        expect(p.etat).toBe("ok");
        expect(valeurs(p)).toEqual({ email: "a@b.tn" });
    });

    it("refuse une modification sans aucun changement", () => {
        const p = preparer(MAJ_CLIENT, MANAGER, {}, "CLI-005");
        expect(p.etat).toBe("refus");
    });

    it("ignore le nom du client en modification quand il ne fait que redire la cible", () => {
        // « modifie le téléphone du client Epsilon Services » ne demande pas de
        // renommer le client en « Epsilon Services ».
        const p = preparer(
            MAJ_CLIENT,
            MANAGER,
            { name: "Epsilon Services", phone: "71 111 222" },
            "Epsilon Services",
        );
        expect(p.etat).toBe("ok");
        expect(valeurs(p)).toEqual({ phone: "71 111 222" });
    });
});

describe("permissions", () => {
    it("interdit le paiement au rôle SALES", () => {
        expect(preparer(PAIEMENT, "SALES", { amount: 1 }, "FAC-1").etat).toBe("refus");
    });

    it("interdit la facturation au rôle SALES", () => {
        expect(preparer(FACTURATION, "SALES", {}, "CMD-1").etat).toBe("refus");
    });

    it("interdit toute action métier au rôle ADMIN", () => {
        expect(preparer(CLIENT, "ADMIN", { name: "X" }).etat).toBe("refus");
    });

    it("autorise la création de client au rôle SALES", () => {
        expect(preparer(CLIENT, "SALES", { name: "X" }).etat).toBe("ok");
    });
});

describe("validation des champs", () => {
    it("refuse un e-mail mal formé", () => {
        expect(preparer(CLIENT, MANAGER, { name: "X", email: "pas-un-email" }).etat).toBe("refus");
    });

    it("accepte un e-mail précédé de son libellé", () => {
        const p = preparer(CLIENT, MANAGER, { name: "X", email: "email: A@B.TN" });
        expect(valeurs(p).email).toBe("a@b.tn");
    });

    it("refuse un texte trop long", () => {
        expect(preparer(CLIENT, MANAGER, { name: "X".repeat(201) }).etat).toBe("refus");
    });

    it("refuse un délai de paiement hors bornes", () => {
        expect(preparer(CLIENT, MANAGER, { name: "X", payment_terms_days: 400 }).etat).toBe("refus");
    });

    it("normalise le statut en valeur de base", () => {
        const p = preparer(CLIENT, MANAGER, { name: "X", status: "actif" });
        expect(valeurs(p).status).toBe("ACTIVE");
    });
});

describe("fusion des tours de clarification", () => {
    it("complète l'état partiel sans écraser ce qui existe", () => {
        const f = fusionner(
            { values: { amount: 1200.5, payment_method: "CHECK" }, cible: undefined },
            { values: {}, cible: "FAC-2026-0036" },
        );
        expect(f).toEqual({
            values: { amount: 1200.5, payment_method: "CHECK" },
            cible: "FAC-2026-0036",
        });
    });

    it("la nouvelle contribution l'emporte", () => {
        const f = fusionner({ values: { amount: 100 } }, { values: { amount: 200 } });
        expect(f.values.amount).toBe(200);
    });
});

describe("résumé de confirmation", () => {
    it("affiche des libellés lisibles, pas des codes techniques", () => {
        const r = resumer(
            PAIEMENT,
            { amount: 5000, payment_date: "2026-08-28", payment_method: "BANK_TRANSFER" },
            "FAC-2026-0037",
            "FAC-2026-0037 — Epsilon Services",
        );
        const texte = r.lignes.map((l) => `${l.libelle}=${l.valeur}`).join("|");
        expect(texte).toContain("montant=5 000,000 TND");
        expect(texte).toContain("date du paiement=28/08/2026");
        expect(texte).toContain("moyen de paiement=virement");
        expect(texte).not.toContain("BANK_TRANSFER");
        expect(r.titre).toContain("Epsilon Services");
    });
});

// ---------------------------------------------------------------------------
// Résolution de cible — base factice
// ---------------------------------------------------------------------------

/** Connexion factice : renvoie les lignes fournies et retient les paramètres. */
function fausseBase(reponses: ({ cle: string; affichage: string; score?: string })[][]) {
    const appels: unknown[][] = [];
    let i = 0;
    return {
        appels,
        cx: {
            query: async (_sql: string, params?: unknown[]) => {
                appels.push(params ?? []);
                return { rows: reponses[Math.min(i++, reponses.length - 1)] ?? [] };
            },
        } as any,
    };
}

describe("résolution de cible", () => {
    it("retient une correspondance unique", async () => {
        const { cx } = fausseBase([[{ cle: "CMD-2026-0029", affichage: "CMD-2026-0029 — Medina", score: "1" }]]);
        const r = await resoudreCible(cx, FACTURATION, "CMD-2026-0029");
        expect(r.etat).toBe("ok");
    });

    it("signale une ambiguïté quand rien ne départage", async () => {
        const { cx } = fausseBase([
            [
                { cle: "CMD-2026-0002", affichage: "CMD-2026-0002 — Alpha", score: "2" },
                { cle: "CMD-2026-0027", affichage: "CMD-2026-0027 — Alpha", score: "2" },
            ],
        ]);
        const r = await resoudreCible(cx, FACTURATION, "la commande de Société Alpha");
        expect(r.etat).toBe("ambigu");
        if (r.etat === "ambigu") expect(r.choix).toHaveLength(2);
    });

    it("un qualificatif de rang tranche l'ambiguïté", async () => {
        const { cx } = fausseBase([
            [
                { cle: "CMD-2026-0027", affichage: "CMD-2026-0027 — Alpha", score: "2" },
                { cle: "CMD-2026-0002", affichage: "CMD-2026-0002 — Alpha", score: "2" },
            ],
        ]);
        const r = await resoudreCible(cx, FACTURATION, "la dernière commande de Société Alpha");
        expect(r.etat).toBe("ok");
        if (r.etat === "ok") expect(r.cle).toBe("CMD-2026-0027");
    });

    it("ignore les mots grammaticaux et le nom de la cible", async () => {
        const { cx, appels } = fausseBase([[{ cle: "CMD-1", affichage: "CMD-1", score: "2" }]]);
        await resoudreCible(cx, FACTURATION, "la dernière commande du client Medina Textile");
        // Chaque mot devient son propre paramètre ILIKE : plus de phrase entière
        // qui échoue dès qu'un seul mot est de trop.
        expect(appels[0]).toEqual(["%Medina%", "%Textile%"]);
    });

    it("ne retient que la clé quand un choix affiché est renvoyé tel quel", async () => {
        // L'utilisateur clique sur « FAC-2026-0036 — Medina Textile — reste 7 187,600 TND ».
        const { cx, appels } = fausseBase([[{ cle: "FAC-2026-0036", affichage: "FAC-2026-0036 — Medina" }]]);
        await resoudreCible(cx, PAIEMENT, "FAC-2026-0036 — Medina Textile — reste 7 187,600 TND");
        expect(appels[0][0]).toBe("%FAC-2026-0036%");
    });

    it("distingue une ligne écartée par le filtre d'une ligne inexistante", async () => {
        // Rien dans les candidates, mais la commande existe hors filtre.
        const { cx } = fausseBase([[], [{ cle: "CMD-2026-0001", affichage: "" }]]);
        const r = await resoudreCible(cx, FACTURATION, "CMD-2026-0001");
        expect(r.etat).toBe("exclu");
        if (r.etat === "exclu") {
            expect(r.motif.normalize("NFC")).toContain("déjà été facturée".normalize("NFC"));
        }
    });

    it("propose des suggestions quand rien n'existe", async () => {
        const { cx } = fausseBase([[], [], [{ cle: "CMD-2026-0007", affichage: "CMD-2026-0007 — Epsilon" }]]);
        const r = await resoudreCible(cx, FACTURATION, "CMD-9999-9999");
        expect(r.etat).toBe("introuvable");
        if (r.etat === "introuvable") expect(r.suggestions.length).toBeGreaterThan(0);
    });

    it("privilégie la correspondance exacte sur la partielle", async () => {
        const { cx } = fausseBase([
            [
                { cle: "CLI-011", affichage: "Société Omega", score: "2" },
                { cle: "CLI-012", affichage: "Société Omega (test)", score: "2" },
            ],
        ]);
        const r = await resoudreCible(cx, MAJ_CLIENT, "Société Omega");
        expect(r.etat).toBe("ok");
        if (r.etat === "ok") expect(r.cle).toBe("CLI-011");
    });
});