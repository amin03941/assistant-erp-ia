import { GLOSSAIRE, ETIQUETTES } from "./catalogue";

/** Faits calculés par le backend. Le modèle ne reçoit que ça. */
export function calculerFaits(lignes: any[]) {
    const cols = Object.keys(lignes[0]);
    const faits: string[] = [`${lignes.length} ligne(s) au total`];
    const valeurs: number[] = [lignes.length];

    // Montants : on additionne, uniquement les vraies colonnes de montant.
    for (const c of cols) {
        if (!c.endsWith("_amount") && c !== "amount" && c !== "line_total") continue;
        if (lignes.some((l) => l[c] !== null && isNaN(Number(l[c])))) continue;
        const somme = lignes.reduce((a, l) => a + Number(l[c] ?? 0), 0);
        if (somme <= 0) continue;
        const arrondi = Math.round(somme * 1000) / 1000;
        faits.push(`${ETIQUETTES[c] ?? c} cumulé : ${arrondi.toFixed(3)} TND`);
        valeurs.push(arrondi);
    }

    // Booléens : on compte, avec la définition métier. Jamais d'addition.
    for (const c of cols) {
        if (typeof lignes[0][c] !== "boolean") continue;
        const n = lignes.filter((l) => l[c] === true).length;
        if (n === 0) continue;
        faits.push(`${n} sur ${lignes.length} ${GLOSSAIRE[c] ?? c}`);
        valeurs.push(n);
    }

    // Les durées ne sont ni sommées ni comptées : on ne retient que le maximum.
    for (const c of cols) {
        if (!c.startsWith("days_")) continue;
        const max = Math.max(...lignes.map((l) => Number(l[c] ?? 0)));
        if (max > 0) {
            faits.push(`retard maximum : ${max} jours`);
            valeurs.push(max);
        }
    }

    return { faits, valeurs };
}

/** Extrait tous les nombres d'une phrase française (espaces, virgule décimale). */
function nombresDe(texte: string): number[] {
    const t = texte.replace(/[\u00A0\u202F]/g, " ");
    return (t.match(/\d[\d ]*(?:[.,]\d+)?/g) ?? [])
        .map((x) => Number(x.replace(/ /g, "").replace(",", ".")))
        .filter((n) => !isNaN(n));
}

/** Vrai si tout nombre cité par le modèle provient des faits vérifiés. */
export function verifier(texte: string, valeurs: number[]) {
    const proche = (a: number, b: number) => Math.abs(a - b) <= 0.011;
    return nombresDe(texte).every((n) =>
        valeurs.some((v) => proche(n, v) || proche(n, Math.round(v * 100) / 100))
    );
}

/** Phrase de repli, entièrement construite par le code. */
export function phraseDeterministe(faits: string[]) {
    const [premier, ...reste] = faits;
    return reste.length ? `${premier} — ${reste.join(", ")}.` : `${premier}.`;
}