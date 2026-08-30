import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Stockage des pièces importées.
 *
 * Hors de public/ : une facture fournisseur ne doit pas être servie par URL
 * directe. L'empreinte SHA-256 sert à reconnaître un fichier déjà importé, avant
 * même de le donner au modèle.
 */

const RACINE = join(process.cwd(), "uploads");

/** Le CHECK documents_mime_check accepte aussi application/pdf, mais le modèle
 *  ne lit que des images : la conversion PDF viendra plus tard. */
export const TYPES_ACCEPTES = ["image/png", "image/jpeg"] as const;

/** Doit rester aligné sur le CHECK documents_size_check de schema.sql. */
export const TAILLE_MAX = 10 * 1024 * 1024;

export type PieceStockee = {
    nomFichier: string;
    cheminRelatif: string;
    mimeType: string;
    tailleOctets: number;
    empreinte: string;
    base64: string;
};

export function verifierPiece(type: string, taille: number): string | null {
    if (!(TYPES_ACCEPTES as readonly string[]).includes(type)) {
        return "Seules les images PNG et JPEG sont acceptées.";
    }
    if (taille === 0) return "Le fichier est vide.";
    if (taille > TAILLE_MAX) return `Le fichier dépasse ${TAILLE_MAX / 1024 / 1024} Mo.`;
    return null;
}

/** Le nom du fichier vient de l'utilisateur : il ne doit jamais servir de chemin. */
function nomSur(nom: string) {
    return nom.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120) || "piece";
}

export async function stocker(fichier: File): Promise<PieceStockee> {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const empreinte = createHash("sha256").update(octets).digest("hex");

    // Un sous-dossier par jour : un répertoire unique deviendrait vite illisible.
    const jour = new Date().toISOString().slice(0, 10);
    const dossier = join(RACINE, jour);
    await mkdir(dossier, { recursive: true });

    const nom = `${empreinte.slice(0, 16)}_${nomSur(fichier.name)}`;
    await writeFile(join(dossier, nom), octets);

    return {
        nomFichier: fichier.name,
        cheminRelatif: `${jour}/${nom}`,
        mimeType: fichier.type,
        tailleOctets: octets.length,
        empreinte,
        base64: octets.toString("base64"),
    };
}
