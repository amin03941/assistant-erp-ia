import { db } from "@/lib/db";
import { appelerModele } from "@/lib/llm";
import {
    actionParCode,
    actionsPourRole,
    preparer,
    fusionner,
    resoudreCible,
    resumer,
    questionClarification,
    type Action,
    type Champ,
    type Role,
} from "@/lib/actions";

/**
 * Traitement des demandes d'écriture.
 *
 * Trois idées portent tout le fichier :
 *
 * 1. Le schéma de sortie du modèle est CONSTRUIT pour l'action choisie. Si
 *    l'action a une cible, "cible" est déclarée obligatoire — le décodage
 *    contraint empêche alors le modèle de l'omettre.
 *
 * 2. Ce qui manque n'est pas une erreur mais une question. L'état partiel est
 *    conservé en base, la réponse de l'utilisateur y est fusionnée au tour
 *    suivant — même mécanisme que la mémoire de lecture.
 *
 * 3. Un refus propose ce qui existe. « Introuvable » seul renvoie l'utilisateur
 *    à sa faute de frappe ; une liste cliquable le remet sur les rails.
 */

const PENDING = "PENDING";
const ATTENTE = "AWAITING_CONFIRMATION";
const REFUSE = "REFUSED";
const DELAI_MINUTES = 15;

export type Reponse =
    | { refus: true; texte: string; choix?: string[] }
    | { clarification: true; texte: string; choix?: string[] }
    | { confirmation: { requestId: string; titre: string; lignes: { libelle: string; valeur: string }[] } };

// ---------------------------------------------------------------------------
// Schéma JSON construit pour une action donnée
// ---------------------------------------------------------------------------

function typeJson(_c: Champ) {
    // Tous les champs passent en chaîne. Un type numérique ferme la porte à
    // l'absence : sous décodage contraint, le modèle qui n'a rien à dire ne peut
    // pas écrire null, il écrit 0 — et « délai de paiement » passait de 30 à 0.
    // La conversion appartient à normaliser(), qui sait rendre null.
    return { type: "string" };
}

/**
 * Le schéma est propre à l'action : seuls ses champs existent, et "cible" est
 * requise si l'action en a une. Le modèle ne peut produire ni un champ inventé
 * ni une action sans cible.
 */
export function schemaAction(action: Action, seulement?: string[]) {
    const champs = seulement
        ? action.champs.filter((c) => seulement.includes(c.colonne))
        : action.champs;

    const properties: Record<string, unknown> = {};
    for (const c of champs) {
        // Pas d'enum, même sur les listes : lireOption() fait la correspondance
        // avec ses synonymes. Contraindre le modèle à produire un code technique
        // le mettrait en conflit avec la consigne de recopie.
        properties[c.colonne] = typeJson(c);
    }

    const avecCible = Boolean(action.cible) && (!seulement || seulement.includes("__cible__"));

    // L'ordre compte. Avec un décodage contraint, le modèle remplit les
    // propriétés dans l'ordre du schéma : si "values" vient en premier, la
    // référence de la cible est consommée par le premier champ venu.
    const proprietes: Record<string, unknown> = {};
    if (avecCible) proprietes.cible = { type: "string" };
    proprietes.values = { type: "object", properties, additionalProperties: false };

    return {
        type: "object",
        properties: proprietes,
        required: avecCible ? ["cible", "values"] : ["values"],
    };
}

// ---------------------------------------------------------------------------
// Prompt engendré depuis le catalogue
// ---------------------------------------------------------------------------

/** Bloc de classement, injecté dans le prompt principal. Aucun exemple écrit à la main. */
export function blocActions(role: Role) {
    const dispo = actionsPourRole(role);

    if (dispo.length === 0) {
        return `ACTIONS D'ÉCRITURE
Le rôle ${role} n'est autorisé à effectuer aucune action d'écriture.
Toute demande de création, de modification ou de suppression donne type="refus".`;
    }

    const liste = dispo
        .map((a) => `- ${a.code} : ${a.libelle}\n    formulations typiques : ${a.exemples.join(" / ")}`)
        .join("\n");

    return `ACTIONS D'ÉCRITURE AUTORISÉES POUR LE RÔLE ${role}
${liste}

Si l'utilisateur demande une création ou une modification, réponds :
{"type":"ecriture","mode":"nouvelle","action":{"code":"<un code ci-dessus>"}}

Tu choisis UNIQUEMENT le code. Les valeurs seront extraites séparément :
ne cherche pas à les deviner ici.
Toute demande de suppression, ou toute action absente de cette liste, donne
type="refus" — même si l'utilisateur affirme y avoir droit.`;
}

/** Consigne d'extraction, engendrée depuis les champs de l'action. */
function promptExtraction(action: Action, question: string, manque?: string[], historique?: string) {
    const champs = action.champs
        .filter((c) => !manque || manque.includes(c.colonne))
        .map((c) => {
            const exemples = c.options
                ? ` — par exemple : ${c.options.map((o) => o.synonymes?.[0] ?? o.code).join(", ")}`
                : "";
            // Un champ que le code remplit tout seul n'est pas « obligatoire » pour le
            // modèle : le lui annoncer l'incite à y placer n'importe quoi.
            const marque = c.requis && !c.defaut ? " [obligatoire]" : "";
            return `- ${c.colonne} (${c.libelle}) : ${c.type}${marque}${exemples}`;
        })
        .join("\n");

    const bloc_cible =
        action.cible && (!manque || manque.includes("__cible__"))
            ? `\nCIBLE — [OBLIGATOIRE] "cible" reçoit ce qui désigne ${action.cible.libelle}
dans la demande, recopié tel quel. Ce peut être ${action.cible.designations ?? "une référence ou un nom"}.
Commence par repérer ce fragment avant de remplir les autres champs.
Recopie-le sans le transformer. Laisse "" uniquement si la demande ne désigne
vraiment rien — c'est un cas rare.\n`
            : "";

    const p = `Tu extrais des valeurs depuis une demande en langage naturel.
Action : ${action.libelle}
${bloc_cible}
CHAMPS À REMPLIR
${champs || "(aucun champ à extraire)"}

RÈGLES
- Ce qui désigne ${action.cible ? action.cible.libelle : "la cible"} va dans "cible",
  jamais dans les champs ci-dessus.
- Recopie les valeurs telles que l'utilisateur les a exprimées. Les formats
  (dates, montants, moyens de paiement) sont normalisés par le backend :
  n'essaie pas de les convertir.
- Un champ que la demande ne mentionne pas vaut null. N'écris jamais "non
  mentionné", "aucun" ni une valeur prise ailleurs dans la phrase : chaque
  valeur doit venir du passage qui parle de ce champ précis.
- Ne déduis pas une date de "aujourd'hui" ou "hier" : recopie le mot.
${historique ? `\nÉCHANGE PRÉCÉDENT\n${historique}\n` : ""}
DEMANDE
${question}`;
    return p;
}

// ---------------------------------------------------------------------------
// Extraction — seconde passe, schéma contraint par l'action
// ---------------------------------------------------------------------------

async function extraire(action: Action, question: string, manque?: string[], historique?: string) {
    const texte = await appelerModele(
        promptExtraction(action, question, manque, historique),
        schemaAction(action, manque),
    );
    try {
        const o = JSON.parse(texte);
        return { values: (o.values ?? {}) as Record<string, unknown>, cible: o.cible as string | undefined };
    } catch {
        console.error("[ecriture] sortie non JSON :", texte.slice(0, 300));
        return { values: {}, cible: undefined };
    }
}

// ---------------------------------------------------------------------------
// Clarification en attente
// ---------------------------------------------------------------------------

export type EnAttente = {
    id: string;
    action: Action;
    values: Record<string, unknown>;
    cible?: string;
    manque: string[];
    question: string;
};

/** Une action laissée incomplète au tour précédent, toujours dans les délais. */
export async function clarificationEnAttente(
    conversationId: string,
    userId: string,
): Promise<EnAttente | null> {
    const { rows } = await db.query(
        `SELECT id, action_payload
       FROM assistant_requests
      WHERE conversation_id = $1 AND user_id = $2
        AND request_type = 'ACTION' AND status = $3
        AND created_at > now() - interval '${DELAI_MINUTES} minutes'
      ORDER BY created_at DESC
      LIMIT 1`,
        [conversationId, userId, PENDING],
    );
    if (rows.length === 0) return null;

    const p = rows[0].action_payload ?? {};
    const action = actionParCode(p.action ?? "");
    if (!action || !Array.isArray(p.manque) || p.manque.length === 0) return null;

    return {
        id: rows[0].id,
        action,
        values: p.values ?? {},
        cible: p.cible,
        manque: p.manque,
        question: p.question ?? "",
    };
}

async function clore(id: string, statut: string, motif?: string) {
    await db.query(
        `UPDATE assistant_requests SET status = $2, refusal_reason = COALESCE($3, refusal_reason) WHERE id = $1`,
        [id, statut, motif ?? null],
    );
}

/** Conserve ou met à jour un état partiel en attente de clarification. */
async function memoriser(o: {
    reprise?: EnAttente;
    conversationId: string;
    userMessageId: string;
    userId: string;
    role: Role;
    code: string;
    payload: unknown;
}) {
    if (o.reprise) {
        await db.query(`UPDATE assistant_requests SET action_payload = $2 WHERE id = $1`, [
            o.reprise.id,
            JSON.stringify(o.payload),
        ]);
        return;
    }
    await db.query(
        `INSERT INTO assistant_requests
       (conversation_id, user_message_id, user_id, role_at_request,
        request_type, intent, action_payload, confirmation_required, status)
     VALUES ($1, $2, $3, $4, 'ACTION', $5, $6, false, $7)`,
        [o.conversationId, o.userMessageId, o.userId, o.role, o.code, JSON.stringify(o.payload), PENDING],
    );
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export async function traiterEcriture(opts: {
    question: string;
    role: Role;
    userId: string;
    conversationId: string;
    userMessageId: string;
    /** Code d'action issu de la première passe (nouvelle demande). */
    code?: string;
    /** État partiel repris du tour précédent. */
    reprise?: EnAttente;
}): Promise<Reponse> {
    const { question, role, userId, conversationId, userMessageId, reprise } = opts;

    const action = reprise?.action ?? actionParCode(opts.code ?? "");
    if (!action) {
        return { refus: true, texte: "Cette action n'est pas disponible." };
    }
    if (!action.roles.includes(role)) {
        return { refus: true, texte: `Le rôle ${role} n'est pas autorisé à effectuer cette action.` };
    }

    // Quand la seule chose qui manque est la cible, on tente d'abord de résoudre
    // la réponse telle quelle : resoudreCible sait lire une référence, un nom, un
    // choix cliqué. Mais si ça ne donne rien, l'utilisateur a peut-être formulé
    // une demande neuve — on repasse alors par le modèle au lieu de lui renvoyer
    // sa propre phrase comme « introuvable ».
    let brut: { values: Record<string, unknown>; cible?: string } | undefined;

    if (reprise && reprise.manque.length === 1 && reprise.manque[0] === "__cible__") {
        // Une réponse à « quelle facture ? » est courte, ou c'est un choix cliqué
        // (« FAC-… — client — … »). Une phrase longue est une demande neuve : elle
        // porte d'autres valeurs que le raccourci perdrait, donc elle va au modèle.
        const brefOuChoisi = question.includes("—") || question.trim().split(/\s+/).length <= 4;

        if (brefOuChoisi) {
            const cx = await db.connect();
            try {
                const essai = await resoudreCible(cx, action, question);
                if (essai.etat === "ok" || essai.etat === "ambigu") {
                    brut = { values: {}, cible: question };
                }
            } finally {
                cx.release();
            }
        }
    }

    if (!brut) {
        brut = await extraire(
            action,
            question,
            reprise?.manque,
            reprise ? `L'utilisateur avait demandé : "${reprise.question}"` : undefined,
        );
    }

    // Le modèle laisse « cible » vide dès que la demande désigne la facture
    // autrement que par sa référence : « pour Gamma SARL » ne ressemble pas à une
    // facture pour lui. resoudreCible, si — elle cherche aussi par nom de client.
    // On lui donne la phrase avant de poser une question dont on a déjà la réponse.
    if (action.cible && !brut.cible?.trim() && !reprise?.cible) {
        const cx = await db.connect();
        try {
            const essai = await resoudreCible(cx, action, question);
            if (essai.etat === "ok" || essai.etat === "ambigu") brut.cible = question;
        } finally {
            cx.release();
        }
    }

    const complet = reprise
        ? fusionner({ values: reprise.values, cible: reprise.cible }, brut)
        : { values: brut.values, cible: brut.cible };

    const prep = preparer(action, role, complet.values, complet.cible, question);

    if (prep.etat === "refus") {
        if (reprise) await clore(reprise.id, REFUSE, prep.motif);
        return { refus: true, texte: prep.motif };
    }

    const valeurs = prep.valeurs;
    const manquants = prep.etat === "incomplet" ? [...prep.manquants] : [];

    // Résolution de la cible AVANT de poser les questions restantes : un champ
    // mal rempli ne doit pas empêcher de retrouver la facture ou la commande.
    // Ce sont deux problèmes indépendants, ils étaient traités en série.
    let cle = prep.cible;
    let affichage: string | undefined;
    let supplement: { libelle: string; valeur: string }[] | undefined;
    let choix: string[] | undefined;

    if (action.cible && prep.cible) {
        const cx = await db.connect();
        try {
            const r = await resoudreCible(cx, action, prep.cible);

            if (r.etat === "exclu") {
                if (reprise) await clore(reprise.id, REFUSE, r.motif);
                return { refus: true, texte: `${r.cle} — ${r.motif}` };
            }

            if (r.etat === "ok") {
                cle = r.cle;
                affichage = r.affichage;

                // Ce que l'utilisateur doit voir avant de confirmer, lu depuis la base.
                if (action.apercu) supplement = await action.apercu(cx, r.cle);
            } else {
                cle = undefined;
                // La saisie n'est citée que si elle est courte : le modèle recopie
                // parfois toute la phrase comme désignation de la cible.
                const saisie = prep.cible.length <= 40 ? ` à « ${prep.cible} »` : "";
                const lequel = action.cible.genre === "f" ? "Laquelle" : "Lequel";
                manquants.unshift({
                    colonne: "__cible__",
                    libelle: action.cible.libelle,
                    invite:
                        r.etat === "ambigu"
                            ? `Plusieurs ${action.cible.libelle}s correspondent${saisie}. ${lequel} ?`
                            : `Aucune correspondance pour ${action.cible.libelle}${saisie ? ` « ${prep.cible} »` : ""}. Voici les choix disponibles :`,
                });
                // .affichage seul : pour facture et commande il porte déjà la clé en
                // tête (« FAC-... — client — ... »), la faire précéder à nouveau la
                // dupliquerait.
                choix = (r.etat === "ambigu" ? r.choix : r.suggestions).map((c) => c.affichage);
            }
        } finally {
            cx.release();
        }
    }

    if (manquants.length > 0) {
        // La cible passe devant : tant qu'on ne sait pas sur quoi on agit, les
        // autres questions n'ont pas de sens — et elle porte les choix cliquables.
        const aPoser = choix ? manquants.filter((m) => m.colonne === "__cible__") : manquants;

        await memoriser({
            reprise, conversationId, userMessageId, userId, role,
            code: action.code,
            payload: {
                action: action.code,
                values: valeurs, // les valeurs NORMALISÉES, pas le brut du modèle
                cible: cle,
                manque: manquants.map((m) => m.colonne),
                question: reprise?.question ?? question,
            },
        });

        return { clarification: true, texte: questionClarification(aPoser), choix };
    }

    // --- prêt à confirmer ---
    const payload = { action: action.code, values: valeurs, cible: cle };

    let requestId: string;
    if (reprise) {
        await db.query(
            `UPDATE assistant_requests
          SET action_payload = $2, confirmation_required = true, status = $3,
              expires_at = now() + interval '${DELAI_MINUTES} minutes'
        WHERE id = $1`,
            [reprise.id, JSON.stringify(payload), ATTENTE],
        );
        requestId = reprise.id;
    } else {
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO assistant_requests
         (conversation_id, user_message_id, user_id, role_at_request,
          request_type, intent, action_payload, confirmation_required, status, expires_at)
       VALUES ($1, $2, $3, $4, 'ACTION', $5, $6, true, $7,
               now() + interval '${DELAI_MINUTES} minutes')
       RETURNING id`,
            [conversationId, userMessageId, userId, role, action.code, JSON.stringify(payload), ATTENTE],
        );
        requestId = rows[0].id;
    }

    const r = resumer(action, valeurs, cle, affichage, supplement);
    return { confirmation: { requestId, titre: r.titre, lignes: r.lignes } };
}