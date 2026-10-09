/**
 * Préparation d'une réponse pour la synthèse vocale.
 *
 * Seule la phrase construite par la synthèse déterministe est lue, jamais un
 * texte du modèle : la voix ne peut donc pas énoncer un chiffre faux. Il reste
 * à la rendre prononçable. Écrite pour l'œil, « 14 778,015 TND » serait lue
 * « quatorze, sept cent soixante-dix-huit virgule zéro quinze T N D ».
 */

/** Montant en dinars : « 14 778,015 TND » → « 14778 dinars et 15 millimes ». */
function montants(t: string): string {
    return t.replace(/(\d{1,3}(?:[  ]\d{3})*),(\d{3})\s*TND/g, (_, entier: string, mill: string) => {
        const dinars = entier.replace(/[  ]/g, "");
        const millimes = Number(mill);
        const unite = dinars === "1" || dinars === "0" ? "dinar" : "dinars";
        return millimes === 0 ? `${dinars} ${unite}` : `${dinars} ${unite} et ${millimes} millimes`;
    });
}

export function textePourVoix(texte: string): string {
    return montants(texte)
        .replace(/\bTND\b/g, "dinars")
        // Séparateur de milliers : « 1 865 » serait lu comme deux nombres.
        .replace(/(\d)[  ](?=\d{3}\b)/g, "$1")
        // Références : « CMD-2026-0031 » se lit mieux sans tirets.
        .replace(/([A-Za-z0-9])-(?=[A-Za-z0-9])/g, "$1 ")
        .replace(/\s*—\s*/g, ", ")
        .replace(/[()]/g, "")
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/\s*\n+\s*/g, ". ")
        .replace(/\s{2,}/g, " ")
        .replace(/\.\s*\./g, ".")
        .trim();
}
