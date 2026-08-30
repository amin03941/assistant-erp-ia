import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, NonAuthentifie } from "@/lib/session";
import { creerFactureAchat, STATUT_CONFIRME, STATUT_REJETE } from "@/lib/imports";

const ROLES_IMPORT = ["ACCOUNTANT", "MANAGER"];
const A_VERIFIER = "NEEDS_REVIEW";
const DOUBLON = "DUPLICATE";

/** Valeur imposée par audit_logs_source_check : CHAT, UI ou SYSTEM.
 *  Un import déclenché depuis l'interface relève de 'UI'. */
const SOURCE_AUDIT = "UI";

export async function POST(req: Request) {
    let session;
    try {
        session = await getSession();
    } catch (e) {
        if (e instanceof NonAuthentifie) {
            return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
        }
        throw e;
    }

    if (!ROLES_IMPORT.includes(session.role)) {
        return NextResponse.json({ erreur: "Votre rôle ne permet pas cette action." }, { status: 403 });
    }

    const { importId, decision } = (await req.json()) as {
        importId?: string;
        decision?: "confirmer" | "rejeter";
    };
    if (!importId || !/^[0-9a-f-]{36}$/i.test(importId)) {
        return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
    }

    const cx = await db.connect();
    try {
        await cx.query("BEGIN");

        // FOR UPDATE : deux clics simultanés ne peuvent pas créer deux factures.
        const { rows } = await cx.query(
            `SELECT id, status, extracted_data, matched_supplier_id, created_purchase_invoice_id
               FROM invoice_imports WHERE id = $1 FOR UPDATE`,
            [importId],
        );
        if (rows.length === 0) {
            await cx.query("ROLLBACK");
            return NextResponse.json({ erreur: "Import introuvable." }, { status: 404 });
        }

        const imp = rows[0];
        if (imp.created_purchase_invoice_id || ![A_VERIFIER, DOUBLON].includes(imp.status)) {
            await cx.query("ROLLBACK");
            return NextResponse.json(
                { refus: true, texte: "Cet import n'est plus en attente de vérification." },
                { status: 409 },
            );
        }

        if (decision === "rejeter") {
            await cx.query(
                `UPDATE invoice_imports
                    SET status = $2, needs_review = false, reviewed_by = $3
                  WHERE id = $1`,
                [importId, STATUT_REJETE, session.userId],
            );
            await cx.query("COMMIT");
            return NextResponse.json({ rejete: true, texte: "Import rejeté. Aucune facture créée." });
        }

        if (imp.status === DOUBLON) {
            await cx.query("ROLLBACK");
            return NextResponse.json(
                { refus: true, texte: "Cette facture existe déjà. Rejette l'import." },
                { status: 409 },
            );
        }
        if (!imp.matched_supplier_id) {
            await cx.query("ROLLBACK");
            return NextResponse.json(
                { refus: true, texte: "Le fournisseur n'a pas été identifié." },
                { status: 422 },
            );
        }

        let resultat;
        try {
            resultat = await creerFactureAchat(cx, imp.extracted_data, imp.matched_supplier_id);
        } catch (e: any) {
            await cx.query("ROLLBACK");
            const motif =
                e?.code === "23505"
                    ? "Cette facture existe déjà pour ce fournisseur."
                    : e instanceof Error
                      ? e.message
                      : "Erreur inconnue";
            // Transaction annulée : la trace part dans une requête séparée.
            await db.query(
                `UPDATE invoice_imports SET status = 'FAILED', error_message = $2 WHERE id = $1`,
                [importId, motif.slice(0, 500)],
            );
            return NextResponse.json({ refus: true, texte: motif }, { status: 422 });
        }

        await cx.query(
            `UPDATE invoice_imports
                SET status = $2, needs_review = false, reviewed_by = $3,
                    created_purchase_invoice_id = $4
              WHERE id = $1`,
            [importId, STATUT_CONFIRME, session.userId, resultat.factureId],
        );

        await cx.query(
            `INSERT INTO audit_logs
               (user_id, event_type, entity_type, entity_id, new_values, source, details)
             VALUES ($1, 'CREATE', 'purchase_invoice', $2, $3, $4, $5)`,
            [
                session.userId,
                resultat.factureId,
                JSON.stringify(resultat),
                SOURCE_AUDIT,
                JSON.stringify({ importId, role: session.role }),
            ],
        );

        await cx.query("COMMIT");
        return NextResponse.json({
            execute: true,
            texte:
                `Facture ${resultat.numero} enregistrée pour ${resultat.fournisseur} — ` +
                `${resultat.lignes} ligne(s), ${resultat.total} TND.`,
        });
    } catch (e) {
        await cx.query("ROLLBACK").catch(() => {});
        console.error("[import/confirm]", e);
        return NextResponse.json({ erreur: "Erreur lors de l'enregistrement." }, { status: 500 });
    } finally {
        cx.release();
    }
}
