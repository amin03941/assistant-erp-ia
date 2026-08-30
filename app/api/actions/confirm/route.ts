import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, NonAuthentifie } from "@/lib/session";
import { actionParCode, valider, executer, estRole, type Role } from "@/lib/actions";

/**
 * Confirmation d'une action d'écriture.
 *
 * Le navigateur n'envoie qu'un identifiant. L'action, les valeurs et la cible
 * sont relues depuis assistant_requests.action_payload. Une requête HTTP forgée
 * ne peut donc que confirmer une action que le backend a lui-même produite et
 * validée quelques instants plus tôt.
 */

// Valeurs imposées par assistant_requests_status_check
const ATTENTE = "AWAITING_CONFIRMATION";
const EXECUTE = "EXECUTED";
const ANNULE = "CANCELLED";
const REFUSE = "REFUSED";
const ECHEC = "FAILED";
const EXPIRE = "EXPIRED";

export async function POST(req: Request) {
    let session: Awaited<ReturnType<typeof getSession>>;
    try {
        session = await getSession();
    } catch (e) {
        if (e instanceof NonAuthentifie) {
            return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
        }
        throw e;
    }

    const utilisateurId = String(session.userId ?? "");
    if (!utilisateurId) {
        return NextResponse.json({ erreur: "Session invalide." }, { status: 401 });
    }
    if (!estRole(session.role)) {
        return NextResponse.json({ erreur: "Rôle inconnu." }, { status: 403 });
    }
    const role: Role = session.role;

    const { requestId, decision } = (await req.json()) as {
        requestId?: string;
        decision?: "confirmer" | "annuler";
    };

    if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) {
        return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
    }

    const cx = await db.connect();
    try {
        await cx.query("BEGIN");

        // FOR UPDATE verrouille la ligne : deux clics simultanés ne peuvent pas
        // exécuter l'action deux fois. L'expiration est évaluée par PostgreSQL,
        // pas par l'horloge du serveur applicatif.
        const { rows } = await cx.query(
            `SELECT id, conversation_id, user_id, status, action_payload,
              confirmation_required, confirmed_at,
              (expires_at IS NOT NULL AND expires_at < now()) AS perimee
         FROM assistant_requests
        WHERE id = $1
        FOR UPDATE`,
            [requestId],
        );

        if (rows.length === 0) {
            await cx.query("ROLLBACK");
            return NextResponse.json({ erreur: "Action introuvable." }, { status: 404 });
        }

        const demande = rows[0];

        // Volontairement 404 et non 403 : ne pas révéler l'existence de la ressource.
        if (demande.user_id !== utilisateurId) {
            await cx.query("ROLLBACK");
            return NextResponse.json({ erreur: "Action introuvable." }, { status: 404 });
        }

        if (!demande.confirmation_required || demande.status !== ATTENTE || demande.confirmed_at) {
            await cx.query("ROLLBACK");
            return NextResponse.json(
                { refus: true, texte: "Cette action n'est plus en attente de confirmation." },
                { status: 409 },
            );
        }

        if (demande.perimee) {
            await cx.query(
                `UPDATE assistant_requests
            SET status = $2, error_message = 'Délai de confirmation dépassé'
          WHERE id = $1`,
                [requestId, EXPIRE],
            );
            await cx.query("COMMIT");
            return NextResponse.json(
                { refus: true, texte: "Le délai de confirmation est dépassé. Reformule ta demande." },
                { status: 410 },
            );
        }

        if (decision === "annuler") {
            await cx.query(`UPDATE assistant_requests SET status = $2 WHERE id = $1`, [
                requestId,
                ANNULE,
            ]);
            await cx.query("COMMIT");
            return NextResponse.json({ annule: true, texte: "Action annulée." });
        }

        // Re-validation complète. Le rôle vient de la SESSION COURANTE, jamais de
        // role_at_request : si les droits ont changé depuis la proposition, c'est
        // la situation actuelle qui fait foi.
        const payload = demande.action_payload as {
            action: string;
            values: Record<string, unknown>;
            cible?: string;
        };

        const action = actionParCode(payload?.action ?? "");
        if (!action) {
            await cx.query(
                `UPDATE assistant_requests SET status = $2, refusal_reason = $3 WHERE id = $1`,
                [requestId, REFUSE, "Action absente du catalogue"],
            );
            await cx.query("COMMIT");
            return NextResponse.json({ refus: true, texte: "Action inconnue." }, { status: 400 });
        }

        const controle = valider(action, role, payload.values ?? {}, payload.cible);
        if (!controle.ok) {
            await cx.query(
                `UPDATE assistant_requests SET status = $2, refusal_reason = $3 WHERE id = $1`,
                [requestId, REFUSE, controle.motif],
            );
            await cx.query("COMMIT");
            return NextResponse.json({ refus: true, texte: controle.motif }, { status: 403 });
        }

        // --- exécution ---
        let resultat;
        try {
            resultat = await executer(cx, action, controle.valeurs, controle.cible);
        } catch (e) {
            await cx.query("ROLLBACK");
            const motif = e instanceof Error ? e.message : "Erreur inconnue";
            // Transaction annulée : la trace de l'échec part dans une requête séparée.
            await db.query(
                `UPDATE assistant_requests SET status = $2, error_message = $3 WHERE id = $1`,
                [requestId, ECHEC, motif],
            );
            return NextResponse.json({ refus: true, texte: motif }, { status: 422 });
        }

        // --- message de confirmation dans la conversation ---
        const { rows: msg } = await cx.query<{ id: string }>(
            `INSERT INTO messages (conversation_id, sender, content, structured_data)
       VALUES ($1, 'ASSISTANT', $2, $3)
       RETURNING id`,
            [
                demande.conversation_id,
                resultat.message,
                JSON.stringify({ type: "action_executee", entityId: resultat.entityId }),
            ],
        );

        await cx.query(
            `UPDATE assistant_requests
          SET status = $2, confirmed_at = now(), executed_at = now(),
              response_message_id = $3
        WHERE id = $1`,
            [requestId, EXECUTE, msg[0].id],
        );

        await cx.query(
            `INSERT INTO audit_logs
         (user_id, assistant_request_id, event_type, entity_type, entity_id,
          old_values, new_values, source, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CHAT', $8)`,
            [
                utilisateurId,
                requestId,
                action.operation === "creation" ? "CREATE" : "UPDATE",
                resultat.entityType,
                resultat.entityId,
                resultat.avant ? JSON.stringify(resultat.avant) : null,
                JSON.stringify(resultat.apres),
                JSON.stringify({ action: action.code, role }),
            ],
        );

        await cx.query("COMMIT");
        return NextResponse.json({ execute: true, texte: resultat.message });
    } catch (e) {
        await cx.query("ROLLBACK").catch(() => { });
        console.error("[actions/confirm]", e);
        return NextResponse.json({ erreur: "Erreur lors de l'exécution." }, { status: 500 });
    } finally {
        cx.release();
    }
}