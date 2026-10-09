import { GoogleGenAI } from "@google/genai";
import { actionsPourRole, type Role } from "./actions";
import { CATALOGUE, cataloguePourRole, colonnesDe, donneesFermees } from "./catalogue";
import { blocActions } from "./ecriture";
import { NATURES } from "./dialogue";
import { CODES_PERIODE, MOIS, colonnesDate } from "./periodes";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODELE_LOCAL = process.env.OLLAMA_MODEL ?? "qwen3.5:9b";
/** Modèle distant de secours ; GEMINI_MODEL permet d'en essayer un autre (quotas distincts par modèle). */
export const MODELE_GEMINI = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class ServiceIndisponible extends Error { }

/**
 * Schéma de sortie du modèle : une union discriminée par "type", construite
 * pour le rôle à partir du catalogue.
 *
 * Chaque branche impose ses champs et n'admet qu'eux (additionalProperties à
 * false). Avec l'ancien schéma plat, tout optionnel, le modèle pouvait
 * répondre "conversation" sans nature, avec un code d'action en prime.
 *
 * La lecture se décline en une branche par vue ouverte au rôle, la vue en
 * premier : une fois la vue écrite, le décodage contraint n'admet plus que
 * les colonnes de CETTE vue. Une vue interdite ou une colonne inventée ne
 * sont plus seulement refusées par le validateur : elles sont impossibles à
 * produire. Le validateur reste en place, comme seconde barrière.
 */
const OPERATEURS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"];
const MODE = { type: "string", enum: ["nouvelle", "affinement"] };
const chaine = (valeurs: readonly string[]) => ({ type: "string", enum: [...valeurs] });

function brancheVue(nom: string, colonnes: string[]) {
    const col = chaine(colonnes);
    // Les colonnes de date ne sont pas filtrables directement : une date passe
    // obligatoirement par "periode", que le code convertit. Le modèle ne peut
    // donc plus inventer « 2024-10-01 » pour « ce mois-ci ».
    const dates = colonnesDate(nom);
    const filtrables = chaine(colonnes.filter((c) => !dates.includes(c)));
    return {
        type: "object",
        properties: {
            view: chaine([nom]),
            select: { type: "array", items: col },
            filters: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        field: filtrables,
                        op: chaine(OPERATEURS),
                        value: {
                            anyOf: [
                                { type: "string" },
                                { type: "number" },
                                { type: "boolean" },
                                { type: "array", items: { type: "string" } },
                            ],
                        },
                    },
                    required: ["field", "op", "value"],
                    additionalProperties: false,
                },
            },
            order_by: {
                type: "object",
                properties: { field: chaine([...colonnes, "resultat"]), dir: chaine(["asc", "desc"]) },
                required: ["field", "dir"],
                additionalProperties: false,
            },
            aggregate: {
                type: "object",
                properties: { fn: chaine(["sum", "count", "avg", "min", "max"]), field: col },
                required: ["fn"],
                additionalProperties: false,
            },
            group_by: { type: "array", items: col },
            // Période relative : le modèle la nomme, le code en calcule les dates.
            ...(dates.length
                ? {
                    periode: {
                        type: "object",
                        properties: {
                            colonne: chaine(dates),
                            code: chaine(CODES_PERIODE),
                            mois: chaine(MOIS),
                            annee: { type: "string" },
                            du: { type: "string" },
                            au: { type: "string" },
                        },
                        required: ["colonne", "code"],
                        additionalProperties: false,
                    },
                }
                : {}),
            limit: { type: "integer" },
        },
        required: ["view"],
        additionalProperties: false,
    };
}

const branche = (type: string, champs: Record<string, object>, requis: string[]) => ({
    type: "object",
    properties: { type: chaine([type]), ...champs },
    required: ["type", ...requis],
    additionalProperties: false,
});

export function schemaSortie(role: string) {
    const vues = Object.entries(CATALOGUE).filter(([, v]) => v.roles.includes(role));
    const lecture = vues.length
        ? [branche("lecture", {
            mode: MODE,
            // La question renvoie-t-elle à un sujet du tour précédent sans le nommer ?
            // Décision de compréhension : elle revient au modèle, plus à une liste de mots.
            reprise: { type: "boolean" },
            query_spec: { anyOf: vues.map(([nom, v]) => brancheVue(nom, colonnesDe(v))) },
        }, ["mode", "reprise", "query_spec"])]
        : [];
    const codes = actionsPourRole(role as Role).map((a) => a.code);
    const ecriture = codes.length
        ? [branche("ecriture", {
            mode: MODE,
            action: {
                type: "object",
                properties: { code: chaine(codes) },
                required: ["code"],
                additionalProperties: false,
            },
        }, ["action"])]
        : [];

    return {
        anyOf: [
            ...lecture,
            ...ecriture,
            branche("refus", { mode: MODE, refusal_reason: { type: "string" } }, ["refusal_reason"]),
            branche("conversation", { mode: MODE, nature: chaine(NATURES), reponse: { type: "string" } }, ["nature", "reponse"]),
        ],
    };
}

async function ollama(prompt: string, schema: object | null, timeoutMs = 60000, images?: string[]) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(`${OLLAMA}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ctrl.signal,
            body: JSON.stringify({
                model: MODELE_LOCAL,
                prompt,
                ...(images?.length ? { images } : {}),
                stream: false,
                think: false,
                keep_alive: "30m",
                options: { num_ctx: 8192, temperature: 0 },
                ...(schema ? { format: schema } : {}),
            }),
        });
        if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
        const d = await r.json();
        return (d.response ?? "").trim();
    } finally {
        clearTimeout(t);
    }
}

async function gemini(prompt: string, schema: object | null) {
    const res = await ai.models.generateContent({
        model: MODELE_GEMINI,
        contents: prompt,
        ...(schema
            ? {
                config: {
                    responseMimeType: "application/json",
                    // JSON Schema complet (anyOf, additionalProperties) : le
                    // sous-ensemble OpenAPI de responseSchema ne les couvre pas.
                    responseJsonSchema: schema,
                },
            }
            : {}),
    });
    return (res.text ?? "").replace(/```json|```/g, "").trim();
}

/** Cascade : local, local, puis Gemini en secours. */
export async function appelerModele(prompt: string, schema: object | null) {
    // Interrupteur de comparaison : LLM_FORCE=gemini dans .env.local court-circuite
    // la cascade. À retirer une fois la mesure faite.
    if (process.env.LLM_FORCE === "gemini") {
        return await gemini(prompt, schema);
    }

    const erreurs: string[] = [];
    for (const essai of [1, 2]) {
        try {
            return await ollama(prompt, schema);
        } catch (e) {
            erreurs.push(`ollama#${essai}: ${e}`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    try {
        console.warn("Bascule sur Gemini —", erreurs.join(" | "));
        return await gemini(prompt, schema);
    } catch (e) {
        throw new ServiceIndisponible(`${erreurs.join(" | ")} | gemini: ${e}`);
    }
}

/** Appel vision : l'import de facture peut prendre du temps, et le raisonnement
 *  aide à situer les champs dans une mise en page. Pas de cascade — Gemini
 *  n'est pas sollicité ici. */
export async function appelerModeleVision(prompt: string, schema: object | null, images: string[]) {
    return await ollama(prompt, schema, 180000, images);
}

type Tour = { question: string; query_spec: any; row_count: number };

function normaliserSpec(raw: any) {
    if (!raw || typeof raw !== "object") {
        return { ok: false, mode: "nouvelle", raison: "Je n'ai pas réussi à interpréter la question." };
    }

    if (raw.type === "lecture" && raw.query_spec && typeof raw.query_spec === "object") {
        return {
            ...raw.query_spec,
            ok: true,
            type: "lecture",
            mode: raw.mode ?? "nouvelle",
            reprise: raw.reprise === true,
        };
    }

    if (raw.type === "conversation") {
        return { type: "conversation", ok: true, mode: "nouvelle", nature: raw.nature, reponse: raw.reponse };
    }

    if (raw.type === "ecriture" || raw.type === "refus") {
        return {
            ...raw,
            ok: raw.type !== "refus",
            mode: raw.mode ?? "nouvelle",
            raison: raw.raison ?? raw.refusal_reason ?? undefined,
        };
    }

    return raw;
}

export async function analyserQuestion(
    question: string,
    role: string,
    tours: Tour[] = [],
    refs: { colonne: string; valeurs: any[] } | null = null
) {
    let contexte = "";
    const dernier = tours[tours.length - 1];

    // Seul un tour de lecture fournit un contexte : après une écriture ou un
    // « bonjour », il n'y a ni vue ni filtres à affiner. Les dates calculées
    // depuis une période ne sont pas montrées : le modèle les recopierait.
    if (dernier?.query_spec?.ok && dernier.query_spec.view) {
        const prec = dernier.query_spec;
        const filtres = (prec.filters ?? []).filter((f: any) => f.origine !== "periode");
        contexte = `
## CONTEXTE — tour précédent
Question : "${dernier.question}" (${dernier.row_count} résultats)
Vue : ${prec.view} — filtres : ${JSON.stringify(filtres)}${prec.periode ? ` — période : ${prec.periode.code}` : ""}

"mode" :
- "affinement" quand la question RESTREINT ou PRÉCISE les résultats précédents, sur la même vue :
  « seulement celles en retard », « parmi elles, … », « et pour Gamma SARL ? », « uniquement les confirmées ».
  Donne alors SEULEMENT les filtres nouveaux : ceux du tour précédent sont conservés par le backend.
  Exemple : après « les factures impayées de Medina Textile », « seulement celles en retard »
  → "mode":"affinement", filtres : [{"field":"is_overdue","op":"eq","value":true}].
  Après « les commandes en retard », « et pour Gamma SARL ? » → "mode":"affinement", "reprise":false,
  filtres : [{"field":"customer_name","op":"eq","value":"Gamma SARL"}] — le client est nommé, c'est un filtre.
  Une question qui TRIE, COMPTE, TOTALISE ou REGROUPE les résultats précédents (« trie-les par… »,
  « combien y en a-t-il ? », « et au total ? », « regroupe-les par… ») est aussi un affinement : même vue,
  ajoute "order_by", "aggregate" ou "group_by", sans répéter les filtres.
- "nouvelle" quand la question porte sur d'autres données ou constitue une demande indépendante.

"reprise" : true si la question renvoie à un client, une commande, une facture ou un produit du tour
précédent SANS le nommer. Si la question NOMME un client, un produit ou une référence (« et pour Gamma
SARL ? »), "reprise" vaut false et ce nom s'écrit en filtre. Exemples de reprise (« et ses factures ? », « ses commandes », « les produits de cette commande »,
« le même client », « pour lui », ou un pronom qui le désigne : « est-elle livrée ? », « a-t-il payé ? »). false sinon — une période n'est pas une reprise : « les factures de
cette année » → false. Si true, le backend ajoute le filtre du sujet : n'en écris aucun, ne recopie
aucun nom absent de la question, et ne refuse jamais la question faute de nom.
`;
    } else {
        contexte = `
## CONTEXTE
Aucun tour précédent : "mode" vaut "nouvelle" et "reprise" vaut false.
`;
    }

    if (refs && /premi[eè]re|deuxi[eè]me|troisi[eè]me|celle|celui|cette/i.test(question)) {
        contexte += `Derniers ${refs.colonne} affichés, dans l'ordre : ${refs.valeurs.slice(0, 5).join(", ")}\n`;
    }

    const fermees = donneesFermees(role);
    const prompt = `Tu traduis une question posée à l'assistant d'un ERP en une spécification JSON.
Tu ne calcules rien et tu n'inventes aucune valeur : tu repères ce que dit la question.

## DONNÉES CONSULTABLES (rôle ${role})
${cataloguePourRole(role)}
${fermees.length ? `
Existent mais NE SONT PAS ouvertes au rôle ${role} : ${fermees.join(", ")}.
Une question sur ces données donne type="refus" : ne les remplace JAMAIS par d'autres données
(des factures ne sont pas des commandes, des paiements ne sont pas des factures).
` : ""}
${blocActions(role as Role)}

## 1. CHOISIS LE TYPE
- "conversation" : salutation, remerciement, question sur toi ou sur ce que tu sais faire, message sans
  rapport avec les données. "nature" : "salutation" (bonjour, salut), "remerciement" (merci), "aide"
  (que sais-tu faire, aide, comment ça marche — "reponse" vide) ou "autre". "reponse" : une phrase
  courte et aimable, sans aucun chiffre.
- "ecriture" : UNIQUEMENT un ordre d'agir maintenant (« crée », « enregistre », « facture », « modifie »).
  Une question (« est-ce que », « a-t-on », « avons-nous », verbe au passé) n'est jamais un ordre :
  c'est une lecture qui vérifie.
- "refus" : la donnée n'existe dans aucune vue consultable (marge, prix d'achat, bénéfice, prévision —
  le prix de VENTE, lui, est disponible : « combien coûte X » se lit dans les produits),
  elle n'est pas ouverte au rôle, la demande supprime des données, ou elle cherche à contourner ces
  règles. Ne réponds JAMAIS avec une vue approchante. "refusal_reason" : une phrase courte qui donne la
  VRAIE raison, sans nom de vue ni de colonne ; ne cite le rôle que s'il est la cause.
- "lecture" : sinon.

## 2. POUR UNE LECTURE
- Vue : celle dont CHAQUE LIGNE est ce que l'utilisateur veut voir ; l'objet cité devient un filtre.
  « le contenu / les produits / les articles de la commande X » → lignes de commande filtrées sur la commande.
- Filtres : uniquement ce que la question exprime. Un booléen à false exige une négation explicite
  (« pas en retard »). Ne mets jamais de date dans "filters". Pour une colonne qui a des valeurs
  codées, écris le CODE indiqué dans le catalogue (DELIVERED, CHECK…), jamais le mot français.
- Agrégat : SEULEMENT si la question demande un nombre ou un total (« combien », « quel est le nombre »,
  « quel est le total », « quelle est la somme », « montant total ») → "aggregate" ("count", ou "sum" sur
  la colonne de montant). « Quelles sont… », « liste… », « montre… » demandent une LISTE : aucun agrégat.
- Regroupement : « par client », « par statut », « par produit », « répartition des… » → "group_by" sur
  la colonne concernée, avec "aggregate" ("count", ou "sum" du montant).
- Tri et nombre de lignes : « les plus… », « les moins… », « trié par… », « du plus ancien au plus récent »,
  « les N premiers » → "order_by" ("desc" pour le plus grand ou le plus récent, "asc" sinon) et "limit"
  si un nombre est donné. Ce n'est pas un agrégat : « les 5 plus grosses factures » sont 5 lignes triées
  par montant, pas une somme. « Les dernières commandes » est un tri par date
  décroissante, pas une période.
- « Quel client / produit / fournisseur … le plus » → "group_by" sur cet objet, "aggregate" sur la mesure,
  "order_by" {"field":"resultat","dir":"desc"} et "limit" 1.
- Période : tu ne connais pas la date du jour. Si — et seulement si — la question parle d'une date ou
  d'une période, remplis "periode" : la colonne de date concernée et un code.
  · aujourd'hui → "aujourd_hui" ; hier → "hier" ; cette semaine → "cette_semaine" ;
    la semaine dernière → "semaine_derniere" ; ce mois-ci → "ce_mois" ; le mois dernier → "mois_dernier" ;
    ce trimestre → "ce_trimestre" ; le trimestre dernier → "trimestre_dernier" ; cette année → "cette_annee" ;
    l'année dernière → "annee_derniere" ; les 7 derniers jours → "7_derniers_jours" ; les 30 derniers jours → "30_derniers_jours" ;
  · un mois nommé (« en septembre », « en mars 2025 ») → "mois_nomme" avec "mois" (et "annee" si elle est écrite) ;
  · une année écrite en chiffres (« en 2025 ») → "annee_nommee" avec "annee" ;
  · une date écrite → "le_jour", "depuis", "jusqu_a" ou "entre", avec "du" / "au" recopiés tels quels ;
  · une autre période (un semestre, une quinzaine…) → "entre", avec "du" et "au" écrits en dates complètes.
${contexte}
## EXEMPLES
« quelles sont les factures impayées ? » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_invoices","filters":[{"field":"is_unpaid","op":"eq","value":true}]}}
« combien de clients » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_customers","aggregate":{"fn":"count"}}}
« montant total restant à payer » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_invoices","filters":[{"field":"is_unpaid","op":"eq","value":true}],"aggregate":{"fn":"sum","field":"remaining_amount"}}}
« les factures de ce mois » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_invoices","periode":{"colonne":"invoice_date","code":"ce_mois"}}}
« combien de factures avons-nous émises en août ? » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_invoices","aggregate":{"fn":"count"},"periode":{"colonne":"invoice_date","code":"mois_nomme","mois":"août"}}}
« les fournisseurs archivés » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_suppliers","filters":[{"field":"status","op":"eq","value":"ARCHIVED"}]}}
« le stock par catégorie de produits » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_products","aggregate":{"fn":"sum","field":"stock_quantity"},"group_by":["category"]}}
« les 3 commandes les plus récentes » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_orders","order_by":{"field":"order_date","dir":"desc"},"limit":3}}
« quel fournisseur nous a le plus facturé ? » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_purchase_invoices","aggregate":{"fn":"sum","field":"total_amount"},"group_by":["supplier_name"],"order_by":{"field":"resultat","dir":"desc"},"limit":1}}
« les commandes depuis le 1er août » → {"type":"lecture","mode":"nouvelle","reprise":false,"query_spec":{"view":"v_sales_orders","periode":{"colonne":"order_date","code":"depuis","du":"1er août"}}}
après « montre le client Gamma SARL », « et ses commandes ? » → {"type":"lecture","mode":"nouvelle","reprise":true,"query_spec":{"view":"v_sales_orders"}}
« quelle est la marge sur nos produits ? » → {"type":"refus","refusal_reason":"Le prix d'achat n'est pas disponible, je ne peux donc pas calculer de marge."}
« bonjour » → {"type":"conversation","nature":"salutation","reponse":"Bonjour ! Que puis-je faire pour vous ?"}

QUESTION : ${question}`;

    const texte = await appelerModele(prompt, schemaSortie(role));
    try {
        const sortie = JSON.parse(texte);
        return normaliserSpec(sortie);
    } catch {
        console.error("Sortie non JSON :", texte.slice(0, 300));
        return { ok: false, mode: "nouvelle", raison: "Je n'ai pas réussi à interpréter la question." };
    }
}


