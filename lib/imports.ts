import type { PoolClient } from "pg";
import type { PieceStockee } from "@/lib/stockage";

/**
 * Persistance d'un import de facture.
 *
 * Le document et le brouillon sont écrits ensemble, dans une transaction : une
 * ligne invoice_imports sans son document n'aurait pas de sens, et le CHECK de
 * clé étrangère l'interdirait de toute façon.
 *
 * Rien n'est créé dans purchase_invoices à ce stade : le brouillon attend une
 * vérification humaine, comme la carte de confirmation du chemin d'écriture.
 */

/** Une facture fournisseur est une pièce comptable : mêmes rôles que la
 *  facturation et les paiements. Le commercial n'y a pas accès. */
export const ROLES_IMPORT: readonly string[] = ["ACCOUNTANT", "MANAGER"];

export const STATUT_A_VERIFIER = "NEEDS_REVIEW";
export const STATUT_DOUBLON = "DUPLICATE";

export async function enregistrerBrouillon(
    cx: PoolClient,
    o: {
        piece: PieceStockee;
        userId: string;
        conversationId?: string | null;
        donnees: unknown;
        fournisseurId: string | null;
        statut: string;
    },
): Promise<{ documentId: string; importId: string }> {
    await cx.query("BEGIN");
    try {
        const { rows: doc } = await cx.query<{ id: string }>(
            `INSERT INTO documents
               (conversation_id, uploaded_by, file_name, storage_path,
                mime_type, size_bytes, file_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                o.conversationId ?? null,
                o.userId,
                o.piece.nomFichier,
                o.piece.cheminRelatif,
                o.piece.mimeType,
                o.piece.tailleOctets,
                o.piece.empreinte,
            ],
        );

        const { rows: imp } = await cx.query<{ id: string }>(
            `INSERT INTO invoice_imports
               (document_id, invoice_type, extracted_data,
                matched_supplier_id, needs_review, status)
             VALUES ($1, 'PURCHASE', $2, $3, true, $4)
             RETURNING id`,
            [doc[0].id, JSON.stringify(o.donnees), o.fournisseurId, o.statut],
        );

        await cx.query("COMMIT");
        return { documentId: doc[0].id, importId: imp[0].id };
    } catch (e) {
        await cx.query("ROLLBACK");
        throw e;
    }
}

/** Le même fichier a-t-il déjà été importé ? L'empreinte répond avant même
 *  d'appeler le modèle : inutile de relire une image qu'on connaît. */
export async function pieceDejaImportee(
    cx: PoolClient,
    empreinte: string,
): Promise<{ importId: string; statut: string; nom: string } | null> {
    const { rows } = await cx.query<{ import_id: string; status: string; file_name: string }>(
        `SELECT i.id AS import_id, i.status, d.file_name
           FROM documents d
           JOIN invoice_imports i ON i.document_id = d.id
          WHERE d.file_hash = $1
          ORDER BY d.created_at DESC
          LIMIT 1`,
        [empreinte],
    );
    if (rows.length === 0) return null;
    return { importId: rows[0].import_id, statut: rows[0].status, nom: rows[0].file_name };
}

/** Valeurs imposées par les CHECK de schema.sql. */
const STATUT_FACTURE = "ISSUED";
const SOURCE_FACTURE = "IMPORT";
const TVA_DEFAUT = 19;
const DELAI_PAIEMENT_DEFAUT = 30;

export const STATUT_CONFIRME = "CONFIRMED";
export const STATUT_REJETE = "REJECTED";

function ajouterJours(iso: string, jours: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
}

export type ResultatImport = {
    factureId: string;
    numero: string;
    fournisseur: string;
    lignes: number;
    total: string;
};

/**
 * Crée la facture d'achat depuis un brouillon vérifié.
 *
 * Les valeurs sont relues depuis extracted_data, jamais reçues du navigateur —
 * même principe que la confirmation d'action. Tout se fait dans la transaction
 * ouverte par l'appelant, qui garde la maîtrise du COMMIT.
 */
export async function creerFactureAchat(
    cx: PoolClient,
    donnees: any,
    fournisseurId: string,
): Promise<ResultatImport> {
    const f = donnees.facture;

    if (!f?.numero) throw new Error("Le numéro de facture est illisible.");
    if (!f.date_facture) throw new Error("La date de facture est illisible.");

    const { rows: frs } = await cx.query<{ name: string; payment_terms_days: number | null }>(
        `SELECT name, payment_terms_days FROM suppliers WHERE id = $1`,
        [fournisseurId],
    );
    if (frs.length === 0) throw new Error("Le fournisseur est introuvable.");

    const echeance =
        f.date_echeance ??
        ajouterJours(f.date_facture, frs[0].payment_terms_days ?? DELAI_PAIEMENT_DEFAUT);
    if (echeance < f.date_facture) {
        throw new Error(`L'échéance (${echeance}) ne peut pas précéder la date de la facture.`);
    }

    // Une facture sans ligne exploitable ne s'enregistre pas : mieux vaut un rejet
    // qu'une facture amputée d'une ligne que l'OCR a mal lue.
    const lignes = (donnees.lignes ?? []) as any[];
    if (lignes.length === 0) throw new Error("Aucune ligne à enregistrer.");
    for (const [i, l] of lignes.entries()) {
        if (!l.ligne?.designation) throw new Error(`Ligne ${i + 1} : désignation absente.`);
        if (!(l.ligne.quantite > 0)) throw new Error(`Ligne ${i + 1} : quantité invalide.`);
        if (!(l.ligne.prix_unitaire >= 0)) throw new Error(`Ligne ${i + 1} : prix unitaire invalide.`);
    }

    const ht = f.total_ht ?? 0;
    const tva = f.total_tva ?? 0;
    // Brouillons antérieurs au timbre : le champ manque, il vaut zéro.
    const timbre = f.timbre_fiscal ?? 0;
    const ttc = f.total_ttc ?? ht + tva + timbre;

    // Le timbre n'a pas de colonne dédiée : il est compris dans le TTC et noté
    // sur la facture, ce qui garde l'écart TTC − (HT + TVA) explicable.
    const notes = timbre > 0
        ? `Timbre fiscal : ${timbre.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`
        : null;

    const { rows: fac } = await cx.query<{ id: string }>(
        `INSERT INTO purchase_invoices
           (invoice_number, supplier_id, invoice_date, due_date, status,
            subtotal_amount, tax_amount, total_amount, paid_amount, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
         RETURNING id`,
        [f.numero, fournisseurId, f.date_facture, echeance, STATUT_FACTURE, ht, tva, ttc, SOURCE_FACTURE, notes],
    );

    for (const l of lignes) {
        await cx.query(
            // line_total est GENERATED ALWAYS : il ne s'insère pas.
            `INSERT INTO purchase_invoice_items
               (purchase_invoice_id, product_id, description, quantity, unit_price, tax_rate)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                fac[0].id,
                l.produit?.id ?? null,
                l.ligne.designation,
                l.ligne.quantite,
                l.ligne.prix_unitaire,
                l.ligne.taux_tva ?? TVA_DEFAUT,
            ],
        );
    }

    return {
        factureId: fac[0].id,
        numero: f.numero,
        fournisseur: frs[0].name,
        lignes: lignes.length,
        total: Number(ttc).toFixed(3),
    };
}
