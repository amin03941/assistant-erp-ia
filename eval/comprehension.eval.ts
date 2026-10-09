import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as llm from "@/lib/llm";
import { fusionner } from "@/lib/conversations";
import * as entites from "@/lib/entites";
import { JEU, verifier, type Cas } from "./jeu";
import { JEU_INDEPENDANT } from "./jeu-independant";

/**
 * Évaluation de la compréhension contre le vrai modèle.
 *
 *   npx vitest run --config vitest.eval.config.ts
 *   LLM_FORCE=gemini npx vitest run --config vitest.eval.config.ts
 *   LLM_FORCE=gemini GEMINI_MODEL=gemini-3.5-flash npx vitest run --config vitest.eval.config.ts
 *
 * Jeu évalué : EVAL_JEU=independant pour le jeu indépendant (jeu-independant.ts),
 * figé avant toute exécution et jamais utilisé pour mettre au point le prompt ;
 * le jeu de référence (jeu.ts) sinon.
 *
 * Le lanceur s'exécute aussi sur une version antérieure du projet : il suit la
 * chaîne de traitement de la version évaluée (périodes et reprise grammaticale
 * seulement si elle les possède).
 *
 * Reprise d'une exécution incomplète (quota quotidien atteint, par exemple) :
 * seuls les cas absents du rapport sont joués, et le rapport est complété.
 *   EVAL_REPRISE=eval/resultats/<rapport>.json LLM_FORCE=gemini GEMINI_MODEL=… npx vitest run --config vitest.eval.config.ts
 *
 * Chaque cas rejoue la chaîne de la route jusqu'à la base, exclue : analyse
 * par le modèle, fusion d'un affinement, report du sujet. Le rapport est écrit
 * dans eval/resultats/ après CHAQUE cas — une exécution interrompue garde ce
 * qu'elle a mesuré : score global, score par famille, latence, et pour chaque
 * échec ce qui a été compris à la place.
 *
 * Avec Gemini, les appels sont espacés (EVAL_PAUSE_MS, 13 s par défaut : l'offre
 * gratuite admet 5 requêtes par minute). Une limite par minute ou une
 * surcharge est réessayée après le délai indiqué par l'API ; un quota
 * QUOTIDIEN épuisé arrête l'exécution, puisqu'attendre ne servirait à rien.
 * Une erreur d'API n'est jamais comptée comme une mauvaise compréhension :
 * le cas est noté à part et exclu du score.
 */

type Resultat = { cas: Cas; ok: boolean; ecarts: string[]; ms: number; spec: any };
const resultats: Resultat[] = [];
const erreursApi: { id: string; message: string }[] = [];
let quotaJourEpuise = false;

const NOM_JEU = process.env.EVAL_JEU === "independant" ? "independant" : "reference";
const CAS: Cas[] = NOM_JEU === "independant" ? JEU_INDEPENDANT : JEU;

const distant = process.env.LLM_FORCE === "gemini";
const modele = distant
    ? String((llm as Record<string, unknown>).MODELE_GEMINI ?? "gemini")
    : (process.env.OLLAMA_MODEL ?? "qwen3.5:9b");
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? (distant ? 13_000 : 0));

const reprise = process.env.EVAL_REPRISE ? JSON.parse(readFileSync(process.env.EVAL_REPRISE, "utf8")) : null;
if (reprise && (reprise.modele !== modele || (reprise.jeu ?? "reference") !== NOM_JEU)) {
    throw new Error(`Reprise d'un rapport ${reprise.modele}/${reprise.jeu ?? "reference"} avec ${modele}/${NOM_JEU} : les scores ne seraient pas comparables.`);
}

const debutExecution: string = reprise?.date ?? new Date().toISOString();
const fichier: string = process.env.EVAL_REPRISE
    ?? `eval/resultats/${debutExecution.slice(0, 16).replace(/[:T]/g, "-")}-${modele.replace(/[^\w.-]/g, "_")}${NOM_JEU === "independant" ? "-independant" : ""}.json`;
const sessions: string[] = [...(reprise?.sessions ?? [debutExecution]), ...(reprise ? [new Date().toISOString()] : [])];

// Cas déjà mesurés lors d'une exécution précédente : repris tels quels.
const dejaMesures = new Set<string>();
for (const c of reprise?.cas ?? []) {
    const cas = CAS.find((x) => x.id === c.id);
    if (!cas) continue;
    const echec = (reprise.echecs ?? []).find((e: any) => e.id === c.id);
    resultats.push({ cas, ok: c.ok, ecarts: echec?.ecarts ?? [], ms: c.ms, spec: echec?.compris ?? null });
    dejaMesures.add(c.id);
}

let commit = "inconnu";
try { commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* hors dépôt */ }

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const message = (e: unknown) => String(e instanceof Error ? e.message : e);

/**
 * Délai avant réessai d'une erreur transitoire (limite par minute, surcharge),
 * ou null si l'erreur n'est pas transitoire. Un quota quotidien ne l'est pas.
 */
function delaiReessai(e: unknown): number | null {
    const m = message(e);
    if (/PerDay/i.test(m)) { quotaJourEpuise = true; return null; }
    if (!/\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(m)) return null;
    const s = m.match(/retry in ([\d.]+)s/i);
    return s ? Math.ceil(Number(s[1]) * 1000) + 1000 : 30_000;
}

/** Analyse avec réessais ; le temps mesuré exclut les attentes. */
async function analyser(...args: Parameters<typeof llm.analyserQuestion>) {
    for (let essai = 1; ; essai++) {
        const debut = Date.now();
        try {
            const spec = await llm.analyserQuestion(...args);
            return { spec, ms: Date.now() - debut };
        } catch (e) {
            const delai = delaiReessai(e);
            if (delai === null || essai >= 4) throw e;
            await attendre(delai);
        }
    }
}

async function comprendre(cas: Cas) {
    const role = cas.role ?? "MANAGER";
    const tours = cas.precedent
        ? [{ question: cas.precedent.question, query_spec: cas.precedent.spec, row_count: cas.precedent.row_count ?? 1 }]
        : [];
    const { spec: brute, ms } = await analyser(cas.question, role, tours, null);
    const spec: any = fusionner(tours[0]?.query_spec, brute);
    if (spec.type !== "refus" && spec.type !== "ecriture" && spec.type !== "conversation" && spec.ok && spec.view) {
        // Chaîne de la version évaluée : les périodes n'existent que dans la nouvelle.
        const periodes = await import("@/lib/periodes").catch(() => null);
        if (periodes) {
            const p = periodes.appliquerPeriode(spec);
            if (!p.ok) return { spec: { type: "refus", ok: false, raison: p.message }, ms };
        }
        const e = entites as Record<string, any>;
        const sujets = e.sujetsPrecedents(tours);
        spec.filters = typeof e.repriseExplicite === "function"
            ? e.reporterSujet(spec.reprise === true || e.repriseExplicite(cas.question), spec.view, spec.filters ?? [], sujets).filtres
            : e.reporterSujet(cas.question, spec.view, spec.filters ?? [], sujets).filtres;
    }
    return { spec, ms };
}

function rapport() {
    const reussis = resultats.filter((r) => r.ok).length;

    const familles: Record<string, { reussis: number; total: number }> = {};
    for (const r of resultats) {
        const f = (familles[r.cas.famille] ??= { reussis: 0, total: 0 });
        f.total++;
        if (r.ok) f.reussis++;
    }

    const latences = resultats.map((r) => r.ms).sort((a, b) => a - b);
    const centile = (p: number) => latences[Math.min(latences.length - 1, Math.floor(p * latences.length))] ?? null;

    return {
        date: debutExecution,
        sessions,
        jeu: NOM_JEU,
        modele,
        commit,
        complet: resultats.length === CAS.length,
        score: {
            reussis,
            total: resultats.length,
            taux: resultats.length ? Math.round((1000 * reussis) / resultats.length) / 10 : null,
        },
        erreurs_api: erreursApi,
        latence_ms: { mediane: centile(0.5), p90: centile(0.9) },
        familles,
        echecs: resultats.filter((r) => !r.ok).map((r) => ({
            id: r.cas.id, question: r.cas.question, ecarts: r.ecarts, compris: r.spec,
        })),
        cas: [...resultats]
            .sort((a, b) => CAS.indexOf(a.cas) - CAS.indexOf(b.cas))
            .map((r) => ({ id: r.cas.id, ok: r.ok, ms: r.ms })),
    };
}

function ecrireRapport() {
    mkdirSync("eval/resultats", { recursive: true });
    writeFileSync(fichier, JSON.stringify(rapport(), null, 2));
}

describe(`compréhension — ${modele} — jeu ${NOM_JEU}`, () => {
    for (const cas of CAS) {
        it(`[${cas.famille}] ${cas.question}`, async () => {
            if (dejaMesures.has(cas.id)) return;
            if (quotaJourEpuise) {
                erreursApi.push({ id: cas.id, message: "non joué : quota quotidien épuisé" });
                ecrireRapport();
                throw new Error("Quota quotidien de l'API épuisé — cas non joué.");
            }
            if (PAUSE_MS && (resultats.length > dejaMesures.size || erreursApi.length)) await attendre(PAUSE_MS);

            let r;
            try {
                r = await comprendre(cas);
            } catch (e) {
                erreursApi.push({ id: cas.id, message: message(e).slice(0, 200) });
                ecrireRapport();
                throw e;
            }
            const v = verifier(cas, r.spec);
            resultats.push({ cas, ...v, ms: r.ms, spec: r.spec });
            ecrireRapport();
            expect(v.ecarts).toEqual([]);
        }, 300_000);
    }

    afterAll(() => {
        if (resultats.length === 0 && erreursApi.length === 0) return;
        const r = rapport();
        console.log(`\n=== ${modele} (jeu ${NOM_JEU}) : ${r.score.reussis}/${r.score.total} (${r.score.taux} %) — médiane ${r.latence_ms.mediane} ms, p90 ${r.latence_ms.p90} ms`
            + (erreursApi.length ? ` — ${erreursApi.length} cas non mesuré(s), erreur d'API` : ""));
        for (const [f, s] of Object.entries(r.familles)) {
            console.log(`  ${s.reussis === s.total ? "✓" : "✗"} ${f.padEnd(26)} ${s.reussis}/${s.total}`);
        }
        console.log(`Rapport : ${fichier}\n`);
    });
});
