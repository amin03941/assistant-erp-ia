"use client";

/**
 * Facture PDF → image PNG, dans le navigateur.
 *
 * Le modèle de vision lit des images. Plutôt que d'installer côté serveur un
 * moteur de rendu PDF natif, le PDF est rendu ici par pdf.js (Mozilla), puis
 * envoyé comme une image ordinaire : la route d'import, ses contrôles et le
 * stockage restent inchangés. Les pages sont empilées verticalement, trois au
 * plus — au-delà, ce n'est vraisemblablement pas une facture.
 */

const VERSION = "6.4.299";
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build`;
const PAGES_MAX = 3;
/** Largeur cible d'une page, en pixels : celle d'un A4 numérisé à 150 ppp. */
const LARGEUR = 1240;

type PdfJs = {
    GlobalWorkerOptions: { workerSrc: string; workerPort: Worker | null };
    getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<any>; destroy: () => Promise<void> };
};

let pdfjs: Promise<PdfJs> | null = null;

function charger(): Promise<PdfJs> {
    pdfjs ??= (async () => {
        const bibliotheque: PdfJs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}/pdf.min.mjs`);
        bibliotheque.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
        // Un Worker ne se crée pas depuis une autre origine : une amorce locale importe le script du CDN.
        const amorce = URL.createObjectURL(
            new Blob([`import "${BASE}/pdf.worker.min.mjs";`], { type: "text/javascript" }),
        );
        bibliotheque.GlobalWorkerOptions.workerPort = new Worker(amorce, { type: "module" });
        return bibliotheque;
    })();
    return pdfjs;
}

export async function pdfEnImage(fichier: File): Promise<File> {
    const { getDocument } = await charger();
    // C'est la tâche de chargement qui libère le document et son worker (API pdf.js 6).
    const chargement = getDocument({ data: await fichier.arrayBuffer() });
    try {
        return await rendre(await chargement.promise, fichier.name);
    } finally {
        await chargement.destroy();
    }
}

async function rendre(doc: any, nom: string): Promise<File> {
    if (doc.numPages > PAGES_MAX) {
        throw new Error(`Ce PDF compte ${doc.numPages} pages : une facture en a ${PAGES_MAX} au plus.`);
    }

    const pages: HTMLCanvasElement[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: LARGEUR / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        // Fond blanc : un PDF sans fond donnerait une image transparente, mal lue.
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Rendu « impression » : le rendu « écran » de pdf.js est cadencé par
        // requestAnimationFrame, que le navigateur suspend dans un onglet masqué —
        // changer d'onglet pendant l'import le bloquerait indéfiniment.
        await page.render({ canvas, viewport, intent: "print" }).promise;
        pages.push(canvas);
    }

    const final = document.createElement("canvas");
    final.width = Math.max(...pages.map((p) => p.width));
    final.height = pages.reduce((h, p) => h + p.height, 0);
    const ctx = final.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, final.width, final.height);
    let y = 0;
    for (const p of pages) {
        ctx.drawImage(p, 0, y);
        y += p.height;
    }

    const blob = await new Promise<Blob | null>((ok) => final.toBlob(ok, "image/png"));
    if (!blob) throw new Error("La conversion du PDF en image a échoué.");
    return new File([blob], nom.replace(/\.pdf$/i, "") + ".png", { type: "image/png" });
}
