import type { PoolClient } from "pg";
import { appelerModeleVision } from "@/lib/llm";
import { lireMontant, lireDate } from "@/lib/actions";

/**
 * Extraction d'une facture depuis une image.
 *
 * Même principe que l'écriture en langage naturel : le modèle repère et recopie,
 * le code convertit. Tous les champs sont déclarés en chaîne — « 7 475,000 »
 * doit arriver intact jusqu'à lireMontant(), qui sait lever l'ambiguïté de la
 * virgule française. Déclaré en nombre, le modèle rend 7475000.
 */

const LIGNE = {
    type: "object",
    properties: {
        reference: { type: "string" },
        designation: { type: "string" },
        quantite: { type: "string" },
        prix_unitaire: { type: "string" },
        taux_tva: { type: "string" },
        total_ligne: { type: "string" },
    },
    required: ["reference", "designation", "quantite", "prix_unitaire", "taux_tva", "total_ligne"],
} as const;

export const SCHEMA_FACTURE = {
    type: "object",
    properties: {
        numero: { type: "string" },
        date_facture: { type: "string" },
        date_echeance: { type: "string" },
        fournisseur_nom: { type: "string" },
        fournisseur_matricule: { type: "string" },
        destinataire_nom: { type: "string" },
        total_ht: { type: "string" },
        total_tva: { type: "string" },
        total_ttc: { type: "string" },
        timbre_fiscal: { type: "string" },
        lignes: { type: "array", items: LIGNE },
    },
    required: [
        "numero", "date_facture", "date_echeance",
        "fournisseur_nom", "fournisseur_matricule", "destinataire_nom",
        "total_ht", "total_tva", "total_ttc", "timbre_fiscal", "lignes",
    ],
} as const;

export type FactureBrute = {
    numero?: string;
    date_facture?: string;
    date_echeance?: string;
    fournisseur_nom?: string;
    fournisseur_matricule?: string;
    destinataire_nom?: string;
    total_ht?: string;
    total_tva?: string;
    total_ttc?: string;
    timbre_fiscal?: string;
    lignes?: {
        reference?: string;
        designation?: string;
        quantite?: string;
        prix_unitaire?: string;
        taux_tva?: string;
        total_ligne?: string;
    }[];
};

const PROMPT = `Tu lis une facture reçue d'un fournisseur et tu recopies ce qui y est écrit.

DISTINCTION IMPORTANTE
Une facture porte deux entreprises : celle qui l'émet (le fournisseur, en haut)
et celle qui la reçoit (le destinataire, souvent après « Facturé à » ou « Client »).
- fournisseur_nom et fournisseur_matricule décrivent l'ÉMETTEUR.
- destinataire_nom décrit celui qui reçoit. Ne les confonds pas.

RÈGLES
- Recopie chaque valeur EXACTEMENT comme elle est écrite, y compris les espaces
  et les virgules : « 7 475,000 » se recopie « 7 475,000 », jamais 7475000.
  Les montants et les dates sont convertis par le backend.
- Un champ absent de la facture vaut "". N'invente aucune valeur et ne calcule rien.
- timbre_fiscal : le montant du droit de timbre s'il figure sur la facture
  (« Timbre fiscal : 1,000 »), "" sinon.
- Reprends toutes les lignes du tableau, dans l'ordre, sans en omettre.`;

export async function extraireFacture(imageBase64: string): Promise<FactureBrute | null> {
    const texte = await appelerModeleVision(PROMPT, SCHEMA_FACTURE, [imageBase64]);
    try {
        return JSON.parse(texte) as FactureBrute;
    } catch {
        console.error("[ocr] sortie non JSON :", texte.slice(0, 300));
        return null;
    }
}

export type FactureNormalisee = {
    numero: string;
    date_facture: string | null;
    date_echeance: string | null;
    total_ht: number | null;
    total_tva: number | null;
    total_ttc: number | null;
    /** Droit de timbre, fréquent sur les factures tunisiennes : TTC = HT + TVA + timbre. */
    timbre_fiscal: number | null;
    lignes: {
        reference: string;
        designation: string;
        quantite: number | null;
        prix_unitaire: number | null;
        taux_tva: number | null;
        total_ligne: number | null;
    }[];
};

/** L'OCR recopie l'unité avec la valeur — « 3 unite », « 19 % », « 7 475,000 TND ».
 *  On isole le nombre avant de le confier à lireMontant, qui sait lire la virgule
 *  française. lireMontant reste intacte : elle sert au chemin d'écriture. */
function nombreSeul(brut: string): number | null {
    const m = brut.match(/\d[\d\s.,]*/);
    return m ? lireMontant(m[0]) : null;
}

/** Conversion de ce que l'OCR a recopié. Le modèle rend « 7 475,000 TND »,
 *  lireMontant sait déjà en tirer 7475. Aucun calcul ici : on convertit. */
export function normaliserFacture(b: FactureBrute): FactureNormalisee {
    return {
        numero: (b.numero ?? "").trim(),
        date_facture: lireDate(b.date_facture ?? ""),
        date_echeance: lireDate(b.date_echeance ?? ""),
        total_ht: nombreSeul(b.total_ht ?? ""),
        total_tva: nombreSeul(b.total_tva ?? ""),
        total_ttc: nombreSeul(b.total_ttc ?? ""),
        timbre_fiscal: nombreSeul(b.timbre_fiscal ?? ""),
        lignes: (b.lignes ?? []).map((l) => ({
            reference: (l.reference ?? "").trim(),
            designation: (l.designation ?? "").trim(),
            quantite: nombreSeul(l.quantite ?? ""),
            prix_unitaire: nombreSeul(l.prix_unitaire ?? ""),
            taux_tva: nombreSeul(l.taux_tva ?? ""),
            total_ligne: nombreSeul(l.total_ligne ?? ""),
        })),
    };
}

export type Anomalie = { champ: string; message: string };

/**
 * Une facture se vérifie par ses totaux. Si HT + TVA ne fait pas TTC, ou si les
 * lignes ne somment pas au HT, l'OCR a mal lu quelque chose — et il vaut mieux
 * le dire avant la validation humaine que de laisser passer une facture fausse.
 */
export function controler(f: FactureNormalisee): Anomalie[] {
    const a: Anomalie[] = [];
    const proche = (x: number, y: number) => Math.abs(x - y) < 0.01;

    if (!f.numero) a.push({ champ: "numero", message: "Numéro de facture illisible." });
    if (!f.date_facture) a.push({ champ: "date_facture", message: "Date de facture illisible." });
    if (f.total_ttc === null) a.push({ champ: "total_ttc", message: "Total TTC illisible." });

    // Le timbre fiscal s'ajoute au TTC : sans lui, une facture tunisienne
    // parfaitement juste était signalée comme incohérente.
    const timbre = f.timbre_fiscal ?? 0;
    if (f.total_ht !== null && f.total_tva !== null && f.total_ttc !== null) {
        if (!proche(f.total_ht + f.total_tva + timbre, f.total_ttc)) {
            const libelle = timbre ? "HT + TVA + timbre" : "HT + TVA";
            a.push({
                champ: "total_ttc",
                message: `${libelle} (${(f.total_ht + f.total_tva + timbre).toFixed(3)}) ne correspond pas au TTC lu (${f.total_ttc.toFixed(3)}).`,
            });
        }
    }

    const totaux = f.lignes.map((l) => l.total_ligne).filter((v): v is number => v !== null);
    if (f.total_ht !== null && totaux.length === f.lignes.length && f.lignes.length > 0) {
        const somme = totaux.reduce((s, v) => s + v, 0);
        if (!proche(somme, f.total_ht)) {
            a.push({
                champ: "lignes",
                message: `La somme des lignes (${somme.toFixed(3)}) ne correspond pas au total HT (${f.total_ht.toFixed(3)}).`,
            });
        }
    }

    if (f.lignes.length === 0) a.push({ champ: "lignes", message: "Aucune ligne détectée." });

    f.lignes.forEach((l, i) => {
        if (l.quantite === null || l.prix_unitaire === null) {
            a.push({ champ: `lignes[${i}]`, message: `Ligne ${i + 1} : quantité ou prix unitaire illisible.` });
            return;
        }
        if (l.total_ligne !== null && !proche(l.quantite * l.prix_unitaire, l.total_ligne)) {
            a.push({
                champ: `lignes[${i}]`,
                message: `Ligne ${i + 1} : ${l.quantite} × ${l.prix_unitaire} ne fait pas ${l.total_ligne}.`,
            });
        }
    });

    return a;
}

/** Le matricule fiscal est une clé exacte. On le compare sans ses séparateurs :
 *  l'OCR peut rendre « 1111111/A/M/000 » avec des espaces ou des tirets. */
function aplatirMatricule(s: string) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type Rapprochement =
    | { etat: "ok"; id: string; reference: string; nom: string; sur: "matricule" | "nom" }
    | { etat: "ambigu"; choix: { reference: string; nom: string }[] }
    | { etat: "introuvable"; suggestions: { reference: string; nom: string }[] };

/**
 * Retrouve le fournisseur en base à partir de ce que l'OCR a lu.
 *
 * Le matricule passe devant : c'est une clé exacte, et l'OCR le lit bien mieux
 * qu'un nom propre — « TechnoImport SA » est ressorti « TechnolImport SA ».
 * Le nom ne sert qu'en repli, avec le même score par mot que resoudreCible.
 */
export async function rapprocherFournisseur(
    cx: PoolClient,
    brut: FactureBrute,
): Promise<Rapprochement> {
    const mf = aplatirMatricule(brut.fournisseur_matricule ?? "");
    if (mf.length >= 6) {
        const { rows } = await cx.query<{ id: string; reference: string; name: string }>(
            `SELECT id, reference, name FROM suppliers
              WHERE upper(regexp_replace(tax_identifier, '[^A-Za-z0-9]', '', 'g')) = $1`,
            [mf],
        );
        if (rows.length === 1) {
            return { etat: "ok", id: rows[0].id, reference: rows[0].reference, nom: rows[0].name, sur: "matricule" };
        }
    }

    const mots = (brut.fournisseur_nom ?? "")
        .split(/\s+/)
        .map((m) => m.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((m) => m.length >= 3);

    if (mots.length > 0) {
        const score = mots
            .map((_, i) => `(CASE WHEN name ILIKE $${i + 1} THEN 1 ELSE 0 END)`)
            .join(" + ");
        const { rows } = await cx.query<{ id: string; reference: string; name: string; score: string }>(
            `SELECT id, reference, name, score FROM (
               SELECT id, reference, name, ${score} AS score FROM suppliers
             ) t WHERE score > 0 ORDER BY score DESC, name LIMIT 10`,
            mots.map((m) => `%${m}%`),
        );
        if (rows.length > 0) {
            const meilleur = Number(rows[0].score);
            const retenus = rows.filter((r) => Number(r.score) === meilleur);
            if (retenus.length === 1) {
                return { etat: "ok", id: retenus[0].id, reference: retenus[0].reference, nom: retenus[0].name, sur: "nom" };
            }
            return {
                etat: "ambigu",
                choix: retenus.slice(0, 6).map((r) => ({ reference: r.reference, nom: r.name })),
            };
        }
    }

    const { rows: dispo } = await cx.query<{ reference: string; name: string }>(
        `SELECT reference, name FROM suppliers ORDER BY name LIMIT 10`,
    );
    return {
        etat: "introuvable",
        suggestions: dispo.map((r) => ({ reference: r.reference, nom: r.name })),
    };
}

/** Une même facture fournisseur ne s'enregistre qu'une fois. Le couple
 *  (fournisseur, numéro) est la clé métier : c'est ainsi qu'un comptable
 *  identifie une pièce. */
export async function chercherDoublon(
    cx: PoolClient,
    fournisseurRef: string,
    numero: string,
): Promise<{ invoice_number: string; invoice_date: string; total_amount: string } | null> {
    const { rows } = await cx.query(
        `SELECT p.invoice_number, to_char(p.invoice_date, 'DD/MM/YYYY') AS invoice_date, p.total_amount
           FROM purchase_invoices p
           JOIN suppliers s ON s.id = p.supplier_id
          WHERE s.reference = $1 AND upper(trim(p.invoice_number)) = upper(trim($2))
          LIMIT 1`,
        [fournisseurRef, numero],
    );
    return rows[0] ?? null;
}

export type LigneRapprochee = {
    ligne: FactureNormalisee["lignes"][number];
    produit: { id: string; reference: string; name: string } | null;
    sur: "reference" | "designation" | null;
};

/**
 * Chaque ligne cherche son produit : d'abord par référence — une clé exacte —
 * puis par désignation, avec le score par mot. Une ligne sans correspondance
 * n'est pas une erreur : la facture peut porter un service ou un consommable
 * absent du catalogue. C'est à l'humain de trancher.
 */
export async function rapprocherLignes(
    cx: PoolClient,
    f: FactureNormalisee,
): Promise<LigneRapprochee[]> {
    const out: LigneRapprochee[] = [];

    for (const ligne of f.lignes) {
        let produit: LigneRapprochee["produit"] = null;
        let sur: LigneRapprochee["sur"] = null;

        if (ligne.reference) {
            const { rows } = await cx.query<{ id: string; reference: string; name: string }>(
                `SELECT id, reference, name FROM products WHERE upper(reference) = upper($1)`,
                [ligne.reference],
            );
            if (rows.length === 1) { produit = rows[0]; sur = "reference"; }
        }

        if (!produit && ligne.designation) {
            const mots = ligne.designation
                .split(/\s+/)
                .map((m) => m.replace(/[^\p{L}\p{N}]/gu, ""))
                .filter((m) => m.length >= 4);

            if (mots.length > 0) {
                const score = mots
                    .map((_, i) => `(CASE WHEN name ILIKE $${i + 1} THEN 1 ELSE 0 END)`)
                    .join(" + ");
                const { rows } = await cx.query<{ id: string; reference: string; name: string; score: string }>(
                    `SELECT id, reference, name, score FROM (
                       SELECT id, reference, name, ${score} AS score FROM products
                     ) t WHERE score > 0 ORDER BY score DESC, name LIMIT 5`,
                    mots.map((m) => `%${m}%`),
                );
                if (rows.length > 0) {
                    const meilleur = Number(rows[0].score);
                    const retenus = rows.filter((r) => Number(r.score) === meilleur);
                    if (retenus.length === 1) { produit = retenus[0]; sur = "designation"; }
                }
            }
        }

        out.push({ ligne, produit, sur });
    }

    return out;
}
