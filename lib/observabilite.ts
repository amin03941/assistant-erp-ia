import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE } from "./catalogue";
import { ACTIONS } from "./actions";
import { traduireNomsInternes } from "./visibilite";

/**
 * Tableau de bord : comment l'assistant est utilisé, et comment il se comporte.
 *
 * Tout vient de données déjà enregistrées : assistant_requests (une ligne par
 * question, avec ce que le modèle a compris, le statut et la durée),
 * audit_logs (chaque écriture), invoice_imports (chaque import OCR) et les
 * rapports d'évaluation (eval/resultats). Lecture seule.
 *
 * Les requêtes SQL sont ici, la mise en forme dans des fonctions pures :
 * c'est elle qu'on teste.
 */

type Interrogeable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const FUSEAU = process.env.APP_TZ ?? "Africa/Tunis";

// ---------------------------------------------------------------------------
// Mise en forme (fonctions pures)
// ---------------------------------------------------------------------------

export type LigneStatut = { request_type: string; status: string; n: number };

export type Questions = {
    total: number;
    repondues: number;
    refusees: number;
    echecs: number;
    interrompues: number;
    tauxReponse: number | null;
    tauxRefus: number | null;
};

export type Actions = { executees: number; enAttente: number; annulees: number; echecs: number };

const pourcent = (n: number, total: number) => (total ? Math.round((1000 * n) / total) / 10 : null);

/** Une question de l'utilisateur = une ligne QUERY ; les écritures confirmées sont des lignes ACTION. */
export function syntheseStatuts(lignes: LigneStatut[]): { questions: Questions; actions: Actions } {
    const n = (type: string, ...statuts: string[]) =>
        lignes.filter((l) => l.request_type === type && statuts.includes(l.status)).reduce((a, l) => a + Number(l.n), 0);

    const repondues = n("QUERY", "EXECUTED");
    const refusees = n("QUERY", "REFUSED");
    const echecs = n("QUERY", "FAILED");
    const interrompues = n("QUERY", "PENDING");
    const total = repondues + refusees + echecs + interrompues;

    return {
        questions: {
            total, repondues, refusees, echecs, interrompues,
            tauxReponse: pourcent(repondues, total),
            tauxRefus: pourcent(refusees, total),
        },
        actions: {
            executees: n("ACTION", "EXECUTED"),
            enAttente: n("ACTION", "AWAITING_CONFIRMATION", "PENDING"),
            annulees: n("ACTION", "CANCELLED", "EXPIRED"),
            echecs: n("ACTION", "FAILED", "REFUSED"),
        },
    };
}

/**
 * Nature d'une question, déduite de ce que le modèle a compris (intent).
 * Sans intention enregistrée, la demande est restée sans suite : refusée,
 * en échec ou interrompue — on ne prétend pas savoir laquelle.
 */
export function natureDemande(intent: string | null): "consultation" | "ecriture" | "conversation" | "sansSuite" {
    if (!intent) return "sansSuite";
    if (intent === "CONVERSATION") return "conversation";
    if (intent in CATALOGUE) return "consultation";
    return "ecriture";
}

/** Libellé lisible d'une intention : « factures de vente », « Enregistrer un paiement client ». */
export function libelleIntention(intent: string): string {
    return CATALOGUE[intent]?.intitule ?? CATALOGUE[intent]?.entite.pluriel
        ?? ACTIONS.find((a) => a.code === intent)?.libelle
        ?? intent;
}

// Les premiers refus, antérieurs à la règle qui l'interdit au modèle, citaient
// des noms internes : le tableau de bord les montre traduits, sans les cacher.
export { traduireNomsInternes };

const EVENEMENTS: Record<string, string> = { CREATE: "Création", UPDATE: "Modification", LOGIN: "Connexion" };
const ENTITES: Record<string, string> = {
    customer: "client", customer_payment: "paiement client", sales_invoice: "facture de vente",
    purchase_invoice: "facture d'achat", sales_order: "commande client",
};

export function libelleEvenement(evenement: string, entite: string | null): string {
    const e = EVENEMENTS[evenement] ?? evenement;
    return entite ? `${e} — ${ENTITES[entite] ?? entite}` : e;
}

// ---------------------------------------------------------------------------
// Rapports d'évaluation
// ---------------------------------------------------------------------------

export type RapportEvaluation = {
    fichier: string;
    modele: string;
    /** « reference » (mise au point), « independant » ou « validation2 » (mesures). */
    jeu: string;
    date: string;
    reussis: number;
    total: number;
    taux: number | null;
    complet: boolean;
    depart: boolean;
};

/** Rapports présents dans eval/resultats, du plus récent au plus ancien. */
export function rapportsEvaluation(dossier = join(process.cwd(), "eval", "resultats")): RapportEvaluation[] {
    let fichiers: string[];
    try {
        fichiers = readdirSync(dossier).filter((f) => f.endsWith(".json"));
    } catch {
        return [];
    }
    const rapports: RapportEvaluation[] = [];
    for (const f of fichiers) {
        try {
            const r = JSON.parse(readFileSync(join(dossier, f), "utf8"));
            rapports.push({
                fichier: f,
                modele: String(r.modele ?? "?"),
                jeu: String(r.jeu ?? "reference"),
                date: String(r.date ?? ""),
                reussis: Number(r.score?.reussis ?? 0),
                total: Number(r.score?.total ?? 0),
                taux: r.score?.taux ?? null,
                complet: r.complet !== false,
                depart: f.includes("depart"),
            });
        } catch {
            /* rapport illisible : ignoré */
        }
    }
    return rapports.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export type TableauDeBord = Awaited<ReturnType<typeof lireTableauDeBord>>;

export async function lireTableauDeBord(cx: Interrogeable) {
    const [statuts, latence, jours, intentions, refus, audit, imports] = await Promise.all([
        cx.query(`SELECT request_type, status, count(*)::int AS n FROM assistant_requests GROUP BY 1, 2`),

        cx.query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS mediane,
                         percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90
                    FROM assistant_requests
                   WHERE request_type = 'QUERY' AND status = 'EXECUTED' AND duration_ms IS NOT NULL`),

        // Les 14 derniers jours, jours sans question compris, dans le fuseau de l'entreprise.
        cx.query(`SELECT to_char(j, 'YYYY-MM-DD') AS jour, coalesce(c.n, 0)::int AS n
                    FROM generate_series((now() AT TIME ZONE $1)::date - 13, (now() AT TIME ZONE $1)::date, interval '1 day') AS j
                    LEFT JOIN (SELECT (created_at AT TIME ZONE $1)::date AS d, count(*) AS n
                                 FROM assistant_requests WHERE request_type = 'QUERY' GROUP BY 1) c
                      ON c.d = j::date
                   ORDER BY j`, [FUSEAU]),

        cx.query(`SELECT intent, count(*)::int AS n FROM assistant_requests
                   WHERE request_type = 'QUERY' GROUP BY 1`),

        cx.query(`SELECT refusal_reason AS motif, count(*)::int AS n FROM assistant_requests
                   WHERE request_type = 'QUERY' AND status = 'REFUSED' AND refusal_reason IS NOT NULL
                   GROUP BY 1 ORDER BY 2 DESC, max(created_at) DESC LIMIT 5`),

        cx.query(`SELECT a.created_at, u.full_name AS utilisateur, a.event_type, a.entity_type, a.source
                    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
                   ORDER BY a.created_at DESC LIMIT 8`),

        cx.query(`SELECT status, count(*)::int AS n FROM invoice_imports GROUP BY 1`),
    ]);

    const { questions, actions } = syntheseStatuts(statuts.rows);

    const natures = { consultation: 0, ecriture: 0, conversation: 0, sansSuite: 0 };
    const consultations: { libelle: string; n: number }[] = [];
    for (const { intent, n } of intentions.rows) {
        natures[natureDemande(intent)] += n;
        if (natureDemande(intent) === "consultation") consultations.push({ libelle: libelleIntention(intent), n });
    }
    consultations.sort((a, b) => b.n - a.n);

    return {
        questions,
        actions,
        latence: {
            mediane: latence.rows[0]?.mediane == null ? null : Math.round(Number(latence.rows[0].mediane)),
            p90: latence.rows[0]?.p90 == null ? null : Math.round(Number(latence.rows[0].p90)),
        },
        parJour: jours.rows as { jour: string; n: number }[],
        natures,
        consultations: consultations.slice(0, 6),
        refus: (refus.rows as { motif: string; n: number }[]).map((r) => ({ ...r, motif: traduireNomsInternes(r.motif) })),
        audit: (audit.rows as any[]).map((a) => ({
            date: new Date(a.created_at).toISOString(),
            utilisateur: a.utilisateur ?? "système",
            evenement: libelleEvenement(a.event_type, a.entity_type),
            source: a.source as string,
        })),
        imports: {
            confirmes: imports.rows.filter((r: any) => r.status === "CONFIRMED").reduce((a: number, r: any) => a + r.n, 0),
            total: imports.rows.reduce((a: number, r: any) => a + r.n, 0),
        },
        evaluations: rapportsEvaluation(),
    };
}
