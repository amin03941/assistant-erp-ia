import { readFileSync } from "node:fs";
import { extraireFacture, rapprocherFournisseur, rapprocherLignes, chercherDoublon, normaliserFacture, controler } from "../lib/ocr";
import { db } from "../lib/db";

async function main() {
    const chemin = process.argv[2];
    if (!chemin) {
        console.error("Usage : npx tsx scripts/test-ocr.ts <image.png>");
        process.exit(1);
    }

    const image = readFileSync(chemin).toString("base64");
    const t0 = Date.now();
    const r = await extraireFacture(image);
    console.log(`\n--- ${((Date.now() - t0) / 1000).toFixed(1)} s ---\n`);
    console.log(JSON.stringify(r, null, 2));

    if (r) {
        const n = normaliserFacture(r);
        console.log("\n--- normalisé ---");
        console.log(JSON.stringify(n, null, 2));
        console.log("\n--- contrôles ---");
        console.log(controler(n));

        const cx = await db.connect();
        try {
            console.log("\n--- rapprochement ---");
            const fournisseur = await rapprocherFournisseur(cx, r);
            console.log(fournisseur);

            console.log("\n--- doublon ---");
            if (fournisseur.etat === "ok") {
                console.log(await chercherDoublon(cx, fournisseur.reference, n.numero));
            } else {
                console.log("(fournisseur non résolu, contrôle de doublon ignoré)");
            }

            console.log("\n--- lignes ---");
            for (const l of await rapprocherLignes(cx, n)) {
                console.log(
                    l.ligne.designation,
                    "→",
                    l.produit ? `${l.produit.reference} (${l.sur})` : "aucun produit",
                );
            }
        } finally {
            cx.release();
        }
    }
    process.exit(0);
}

main();