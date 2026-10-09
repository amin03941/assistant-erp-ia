import { CATALOGUE } from "./catalogue";

/**
 * Dates et périodes : « ce mois-ci », « le mois dernier », « en septembre »,
 * « depuis le 1er août ».
 *
 * Le modèle ne connaît pas la date du jour. Laissé libre d'écrire des dates,
 * il les invente : « les factures de ce mois » devenait octobre 2024, « le
 * mois dernier » octobre 2023 — et la réponse affirmait qu'il n'y avait rien.
 *
 * Le partage est donc le même que pour les montants : le modèle dit QUELLE
 * période — un code pris dans une liste fermée, avec au besoin le mois,
 * l'année ou la date tels qu'ils sont écrits dans la phrase — et le code
 * calcule les bornes à partir de la date du jour. Les colonnes de date ne
 * figurent d'ailleurs pas parmi les filtres que le modèle peut écrire : toute
 * date passe par ici. Les bornes deviennent des filtres ordinaires, début
 * inclus et fin exclue.
 */

export const CODES_PERIODE = [
    "aujourd_hui", "hier",
    "cette_semaine", "semaine_derniere",
    "ce_mois", "mois_dernier",
    "ce_trimestre", "trimestre_dernier",
    "cette_annee", "annee_derniere",
    "7_derniers_jours", "30_derniers_jours",
    "mois_nomme", "annee_nommee",
    // Dates écrites dans la question, recopiées dans "du" / "au".
    "le_jour", "depuis", "jusqu_a", "entre",
] as const;
export type CodePeriode = (typeof CODES_PERIODE)[number];

export const MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

export type Periode = {
    colonne: string;
    code: string;
    mois?: string;
    annee?: string;
    /** Date de début telle qu'écrite dans la question : « 1er août », « 15/08/2026 ». */
    du?: string;
    /** Date de fin telle qu'écrite dans la question, incluse. */
    au?: string;
};

/** Fuseau de l'entreprise : la date du jour est celle de Tunis, pas celle du serveur. */
const FUSEAU = process.env.APP_TZ ?? "Africa/Tunis";

/** Date du jour au format AAAA-MM-JJ, dans le fuseau de l'entreprise. */
export function aujourdhui(maintenant = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(maintenant);
}

// Les calculs se font en UTC sur des dates sans heure : aucun décalage possible.
const lire = (iso: string) => {
    const [a, m, j] = iso.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, j));
};
const ecrire = (d: Date) => d.toISOString().slice(0, 10);
const jour = (a: number, m: number, j: number) => new Date(Date.UTC(a, m, j));
const plusJours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

// ---------------------------------------------------------------------------
// Lecture d'une date écrite en français
// ---------------------------------------------------------------------------

const MOIS_NUM: Record<string, number> = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function aplatir(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function composer(an: number, mois: number, j: number): string | null {
    if (mois < 1 || mois > 12 || j < 1 || j > 31) return null;
    const d = new Date(Date.UTC(an, mois - 1, j));
    if (d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== j) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * « 15/08/2026 », « 2026-08-15 », « 1er septembre 2026 », « aujourd'hui » → AAAA-MM-JJ.
 * « Aujourd'hui » est celui de l'entreprise (fuseau de Tunis), pas l'heure UTC
 * du serveur : un paiement saisi à 0 h 30 n'est plus daté de la veille.
 */
export function lireDate(brut: string, ref = aujourdhui()): string | null {
    // « le 15/08/2026 », « depuis le 1er août » : le mot d'introduction ne fait pas partie de la date.
    const net = brut.trim().replace(/^(?:depuis\s+le|depuis|à\s+partir\s+du|a\s+partir\s+du|jusqu[’']au|le|du|au)\s+/i, "");
    const s = aplatir(net);
    const r = lire(ref);

    if (/^(aujourd hui|ce jour|maintenant|today)$/.test(s)) return ref;
    if (/^(hier|la veille)$/.test(s)) return ecrire(plusJours(r, -1));
    if (/^(demain)$/.test(s)) return ecrire(plusJours(r, 1));

    // 2026-08-15
    let m = net.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return composer(+m[1], +m[2], +m[3]);

    // 15/08/2026, 15-08-26, 15.08.2026
    m = net.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
        const an = +m[3] < 100 ? 2000 + +m[3] : +m[3];
        return composer(an, +m[2], +m[1]);
    }

    // 15 aout 2026, 1er septembre 2026, 3 mars
    m = s.match(/^(\d{1,2})(?:\s*er)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if (m && MOIS_NUM[m[2]]) {
        return composer(m[3] ? +m[3] : r.getUTCFullYear(), MOIS_NUM[m[2]], +m[1]);
    }

    return null;
}

// ---------------------------------------------------------------------------
// Bornes d'une période
// ---------------------------------------------------------------------------

/** Colonnes de date d'une vue : les seules sur lesquelles une période a un sens. */
export function colonnesDate(vue: string): string[] {
    return Object.entries(CATALOGUE[vue]?.colonnes ?? {})
        .filter(([, c]) => c.type === "date")
        .map(([n]) => n);
}

/** [debut, fin[ — l'une des deux bornes peut manquer (« depuis le… », « jusqu'au… »). */
export type Bornes = { debut?: string; fin?: string };

/** Bornes d'une période, ou un message si elle est incomplète ou invalide. */
export function bornes(p: Periode, ref: string): Bornes | { erreur: string } {
    const r = lire(ref);
    const a = r.getUTCFullYear(), m = r.getUTCMonth();
    const anneeLue = p.annee && /^\d{4}$/.test(p.annee.trim()) ? Number(p.annee.trim()) : null;
    const debutSemaine = plusJours(r, -((r.getUTCDay() + 6) % 7)); // lundi
    const trimestre = Math.floor(m / 3) * 3;

    const b = (d: Date, f: Date): Bornes => ({ debut: ecrire(d), fin: ecrire(f) });
    const date = (texte: string | undefined) => (texte ? lireDate(texte, ref) : null);
    const illisible = (texte: string | undefined) => ({
        erreur: texte ? `Je n'ai pas compris la date « ${texte} ».` : "Il manque une date à la période demandée.",
    });

    switch (p.code) {
        case "aujourd_hui": return b(r, plusJours(r, 1));
        case "hier": return b(plusJours(r, -1), r);
        case "cette_semaine": return b(debutSemaine, plusJours(debutSemaine, 7));
        case "semaine_derniere": return b(plusJours(debutSemaine, -7), debutSemaine);
        case "ce_mois": return b(jour(a, m, 1), jour(a, m + 1, 1));
        case "mois_dernier": return b(jour(a, m - 1, 1), jour(a, m, 1));
        case "ce_trimestre": return b(jour(a, trimestre, 1), jour(a, trimestre + 3, 1));
        case "trimestre_dernier": return b(jour(a, trimestre - 3, 1), jour(a, trimestre, 1));
        case "cette_annee": return b(jour(a, 0, 1), jour(a + 1, 0, 1));
        case "annee_derniere": return b(jour(a - 1, 0, 1), jour(a, 0, 1));
        case "7_derniers_jours": return b(plusJours(r, -6), plusJours(r, 1));
        case "30_derniers_jours": return b(plusJours(r, -29), plusJours(r, 1));
        case "annee_nommee":
            if (anneeLue === null) return { erreur: "Je n'ai pas compris de quelle année il s'agit." };
            return b(jour(anneeLue, 0, 1), jour(anneeLue + 1, 0, 1));
        case "mois_nomme": {
            const n = MOIS.indexOf(p.mois as (typeof MOIS)[number]);
            if (n < 0) return { erreur: "Je n'ai pas compris de quel mois il s'agit." };
            // Sans année : la dernière occurrence de ce mois qui n'est pas dans le futur.
            const annee = anneeLue ?? (n <= m ? a : a - 1);
            return b(jour(annee, n, 1), jour(annee, n + 1, 1));
        }
        case "le_jour": {
            const d = date(p.du ?? p.au);
            if (!d) return illisible(p.du ?? p.au);
            return b(lire(d), plusJours(lire(d), 1));
        }
        case "depuis": {
            const d = date(p.du);
            if (!d) return illisible(p.du);
            return { debut: d };
        }
        case "jusqu_a": {
            const f = date(p.au);
            if (!f) return illisible(p.au);
            return { fin: ecrire(plusJours(lire(f), 1)) };
        }
        case "entre": {
            const d = date(p.du), f = date(p.au);
            if (!d) return illisible(p.du);
            if (!f) return illisible(p.au);
            if (f < d) return { erreur: "La date de fin précède la date de début." };
            return { debut: d, fin: ecrire(plusJours(lire(f), 1)) };
        }
        default:
            return { erreur: "Je n'ai pas compris la période demandée." };
    }
}

// ---------------------------------------------------------------------------
// Libellé lisible
// ---------------------------------------------------------------------------

const NOMS: Record<string, string> = {
    aujourd_hui: "aujourd'hui", hier: "hier",
    cette_semaine: "cette semaine", semaine_derniere: "la semaine dernière",
    ce_mois: "ce mois-ci", mois_dernier: "le mois dernier",
    ce_trimestre: "ce trimestre", trimestre_dernier: "le trimestre dernier",
    cette_annee: "cette année", annee_derniere: "l'année dernière",
    "7_derniers_jours": "les 7 derniers jours", "30_derniers_jours": "les 30 derniers jours",
};

const dateLongue = (iso: string) => {
    const d = lire(iso);
    const n = d.getUTCDate();
    return `${n === 1 ? "1er" : n} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Libellé lisible, avec les dates réelles : l'utilisateur voit ce que « ce mois-ci » a voulu dire. */
export function libellePeriode(p: Periode, b: Bornes): string {
    if (b.debut && !b.fin) return `depuis le ${dateLongue(b.debut)}`;
    if (!b.debut && b.fin) return `jusqu'au ${dateLongue(ecrire(plusJours(lire(b.fin), -1)))}`;
    if (!b.debut || !b.fin) return "";

    const d = lire(b.debut);
    const f = lire(b.fin);
    const dernier = plusJours(f, -1);
    const moisEntier = d.getUTCDate() === 1 && f.getUTCDate() === 1
        && (f.getUTCFullYear() * 12 + f.getUTCMonth()) - (d.getUTCFullYear() * 12 + d.getUTCMonth()) === 1;
    const anneeEntiere = b.debut.endsWith("-01-01") && b.fin.endsWith("-01-01")
        && f.getUTCFullYear() - d.getUTCFullYear() === 1;

    const precis = anneeEntiere ? `${d.getUTCFullYear()}`
        : moisEntier ? `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
            : b.debut === ecrire(dernier) ? dateLongue(b.debut)
                : `du ${dateLongue(b.debut)} au ${dateLongue(ecrire(dernier))}`;

    const nom = NOMS[p.code];
    if (nom) return `${nom} (${precis})`;
    if (anneeEntiere || moisEntier) return `en ${precis}`;
    return b.debut === ecrire(dernier) ? `le ${precis}` : precis;
}

// ---------------------------------------------------------------------------
// Application à une spécification
// ---------------------------------------------------------------------------

type FiltreSpec = { field: string; op: string; value: unknown; origine?: string };

export type SpecAvecPeriode = {
    view?: string;
    filters?: FiltreSpec[];
    periode?: Periode | null;
};

/** Bornes relues depuis les filtres d'une spécification déjà traitée. */
export function bornesAppliquees(filters: FiltreSpec[] = []): Bornes {
    const v = (op: string) => filters.find((f) => f.origine === "periode" && f.op === op)?.value;
    return { debut: v("gte") as string | undefined, fin: v("lt") as string | undefined };
}

/**
 * Remplace les filtres issus d'une période par ceux de la période courante.
 * Idempotente : un affinement qui hérite de la période la recalcule à
 * l'identique, une nouvelle période remplace l'ancienne.
 */
export function appliquerPeriode<T extends SpecAvecPeriode>(spec: T, ref = aujourdhui()): { ok: true } | { ok: false; message: string } {
    const autres = (spec.filters ?? []).filter((f) => f.origine !== "periode");
    const p = spec.periode;
    if (!p) {
        spec.filters = autres;
        return { ok: true };
    }
    if (!spec.view || !colonnesDate(spec.view).includes(p.colonne)) {
        return { ok: false, message: "Ces données ne peuvent pas être filtrées par période." };
    }
    const r = bornes(p, ref);
    if ("erreur" in r) return { ok: false, message: r.erreur };

    spec.filters = [
        ...autres.filter((f) => f.field !== p.colonne),
        ...(r.debut ? [{ field: p.colonne, op: "gte", value: r.debut, origine: "periode" }] : []),
        ...(r.fin ? [{ field: p.colonne, op: "lt", value: r.fin, origine: "periode" }] : []),
    ];
    return { ok: true };
}
