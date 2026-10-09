import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { stocker, verifierPiece } from "@/lib/stockage";
import {
    extraireFacture,
    normaliserFacture,
    controler,
    rapprocherFournisseur,
    rapprocherLignes,
    chercherDoublon,
} from "@/lib/ocr";
import { enregistrerBrouillon, pieceDejaImportee, ROLES_IMPORT, STATUT_A_VERIFIER, STATUT_DOUBLON } from "@/lib/imports";

export async function POST(req: Request) {
    let session;
    try {
        session = await getSession();
    } catch {
        return NextResponse.json({ erreur: "Session expirée. Reconnectez-vous." }, { status: 401 });
    }

    if (!ROLES_IMPORT.includes(session.role)) {
        return NextResponse.json(
            { erreur: "Votre rôle ne permet pas d'importer une facture." },
            { status: 403 },
        );
    }

    try {
        const form = await req.formData();
        const fichier = form.get("fichier");
        if (!(fichier instanceof File)) {
            return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
        }

        const motif = verifierPiece(fichier.type, fichier.size);
        if (motif) return NextResponse.json({ erreur: motif }, { status: 400 });

        const piece = await stocker(fichier);

        const cxVerif = await db.connect();
        try {
            const deja = await pieceDejaImportee(cxVerif, piece.empreinte);
            if (deja) {
                return NextResponse.json(
                    { erreur: `Ce fichier a déjà été importé (${deja.nom}, statut ${deja.statut}).` },
                    { status: 409 },
                );
            }
        } finally {
            cxVerif.release();
        }

        const brut = await extraireFacture(piece.base64);
        if (!brut) {
            return NextResponse.json(
                { erreur: "La facture n'a pas pu être lue. Essayez une image plus nette." },
                { status: 422 },
            );
        }

        const facture = normaliserFacture(brut);
        const anomalies = controler(facture);

        const cx = await db.connect();
        try {
            const fournisseur = await rapprocherFournisseur(cx, brut);
            const lignes = await rapprocherLignes(cx, facture);
            const doublon =
                fournisseur.etat === "ok"
                    ? await chercherDoublon(cx, fournisseur.reference, facture.numero)
                    : null;

            const statut = doublon ? STATUT_DOUBLON : STATUT_A_VERIFIER;
            const { importId } = await enregistrerBrouillon(cx, {
                piece,
                userId: session.userId,
                donnees: { brut, facture, anomalies, fournisseur, lignes },
                fournisseurId: fournisseur.etat === "ok" ? fournisseur.id : null,
                statut,
            });

            return NextResponse.json({
                importId,
                statut,
                facture,
                anomalies,
                fournisseur,
                lignes,
                doublon,
            });
        } finally {
            cx.release();
        }
    } catch (e) {
        console.error("[import]", e);
        return NextResponse.json({ erreur: "L'import a échoué." }, { status: 500 });
    }
}
