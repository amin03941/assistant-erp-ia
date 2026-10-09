import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { lireTableauDeBord, type TableauDeBord } from "@/lib/observabilite";
import Sidebar from "@/components/sidebar";
import GraphiqueBarres from "@/components/graphique";
import type { Graphique } from "@/lib/graphique";

/**
 * Tableau de bord : utilisation et comportement de l'assistant.
 * Réservé au responsable et à l'administrateur — c'est un suivi du système,
 * pas une vue métier. Données réelles, lues en lecture seule à chaque visite.
 */

export const dynamic = "force-dynamic";

const ROLES_TABLEAU = ["MANAGER", "ADMIN"];
const MODELE_LOCAL = process.env.OLLAMA_MODEL ?? "qwen3.5:9b";

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const entier = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const pourcent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("fr-FR")} %`);
const secondes = (ms: number | null) =>
    ms === null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const jourCourt = (iso: string) => {
    const [, m, j] = iso.split("-").map(Number);
    return `${j} ${MOIS_COURTS[m - 1]}`;
};
const horodatage = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", {
        timeZone: process.env.APP_TZ ?? "Africa/Tunis",
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string; detail: string }) {
    return (
        <div className="rounded-2xl border border-[#E8EAF2] bg-white p-4">
            <p className="text-xs text-[#6B7089]">{libelle}</p>
            <p className="mt-1 text-2xl font-semibold text-[#1B1F32]">{valeur}</p>
            <p className="mt-1 text-xs text-[#9AA0B8]">{detail}</p>
        </div>
    );
}

function Carte({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-[#E8EAF2] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#1B1F32]">{titre}</h2>
            {sousTitre && <p className="mt-0.5 text-xs text-[#9AA0B8]">{sousTitre}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
}

/** Classement : libellé, valeur, et une barre fine proportionnelle au plus grand. */
function Classement({ elements }: { elements: { libelle: string; n: number }[] }) {
    const max = Math.max(1, ...elements.map((e) => e.n));
    if (elements.length === 0) return <p className="text-xs text-[#9AA0B8]">Aucune donnée pour l&apos;instant.</p>;
    return (
        <ul className="space-y-3">
            {elements.map((e) => (
                <li key={e.libelle}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="text-[#4A4F6B]">{e.libelle}</span>
                        <span className="font-semibold tabular-nums text-[#1B1F32]">{entier(e.n)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#F0F1F7]">
                        <div className="h-1.5 rounded-full bg-[#5B5BD6]" style={{ width: `${(100 * e.n) / max}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

function Contenu({ t }: { t: TableauDeBord }) {
    const q = t.questions;
    const aujourdhui = t.parJour[t.parJour.length - 1]?.n ?? 0;
    const parJour: Graphique = {
        titre: "Questions posées par jour — 14 derniers jours",
        etiquettes: t.parJour.map((j) => jourCourt(j.jour)),
        valeurs: t.parJour.map((j) => j.n),
        format: "nombre",
        temporel: true,
    };

    // Une ligne par mesure : départ, puis la plus récente par (jeu, modèle).
    const lignesEvaluation = new Map<string, (typeof t.evaluations)[number]>();
    for (const e of t.evaluations) {
        const cle = `${e.depart ? "depart" : "actuel"}|${e.jeu}|${e.modele}`;
        if (!lignesEvaluation.has(cle)) lignesEvaluation.set(cle, e);
    }
    const ordre = (e: (typeof t.evaluations)[number]) =>
        (e.jeu === "validation2" ? 0 : e.jeu === "independant" ? 10 : 20) + (e.depart ? 0 : 1) + (e.modele === MODELE_LOCAL ? 0 : 5);
    const evaluations = [...lignesEvaluation.values()].sort((a, b) => ordre(a) - ordre(b));

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <Tuile libelle="Questions posées" valeur={entier(q.total)} detail={`dont ${entier(aujourdhui)} aujourd'hui`} />
                <Tuile
                    libelle="Taux de réponse"
                    valeur={pourcent(q.tauxReponse)}
                    detail={`${pourcent(q.tauxRefus)} refusées · ${entier(q.echecs)} échec${q.echecs > 1 ? "s" : ""}`}
                />
                <Tuile
                    libelle="Temps de réponse médian"
                    valeur={secondes(t.latence.mediane)}
                    detail={`90 % des réponses en moins de ${secondes(t.latence.p90)}`}
                />
                <Tuile
                    libelle="Écritures confirmées"
                    valeur={entier(t.actions.executees)}
                    detail={`${entier(t.imports.confirmes)} facture${t.imports.confirmes > 1 ? "s" : ""} importée${t.imports.confirmes > 1 ? "s" : ""} par OCR`}
                />
            </div>

            <Carte titre="Activité" sousTitre="Une barre par jour ; survolez une barre pour sa valeur.">
                <GraphiqueBarres graphique={parJour} />
            </Carte>

            <div className="grid gap-5 lg:grid-cols-2">
                <Carte titre="Nature des demandes" sousTitre="Selon ce que le modèle a compris de chaque question.">
                    <Classement elements={[
                        { libelle: "Consultations", n: t.natures.consultation },
                        { libelle: "Demandes d'écriture", n: t.natures.ecriture },
                        { libelle: "Conversation (bonjour, aide…)", n: t.natures.conversation },
                        { libelle: "Sans suite (refusées, en échec ou interrompues)", n: t.natures.sansSuite },
                    ]} />
                </Carte>
                <Carte titre="Données les plus consultées">
                    <Classement elements={t.consultations} />
                </Carte>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <Carte titre="Motifs de refus les plus fréquents" sousTitre="Un refus explicite vaut mieux qu'une réponse fausse.">
                    {t.refus.length === 0
                        ? <p className="text-xs text-[#9AA0B8]">Aucun refus.</p>
                        : (
                            <ul className="space-y-2 text-xs">
                                {t.refus.map((r) => (
                                    <li key={r.motif} className="flex justify-between gap-3">
                                        <span className="text-[#4A4F6B]">{r.motif}</span>
                                        <span className="shrink-0 font-semibold tabular-nums text-[#1B1F32]">{entier(r.n)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                </Carte>
                <Carte titre="Dernières opérations auditées" sousTitre="Chaque écriture est journalisée : qui, quoi, quand, depuis où.">
                    {t.audit.length === 0
                        ? <p className="text-xs text-[#9AA0B8]">Aucune opération.</p>
                        : (
                            <table className="w-full text-xs">
                                <tbody>
                                    {t.audit.map((a, i) => (
                                        <tr key={i} className="border-b border-[#F0F1F7] last:border-0">
                                            <td className="whitespace-nowrap py-1.5 pr-3 text-[#9AA0B8]">{horodatage(a.date)}</td>
                                            <td className="py-1.5 pr-3 text-[#1B1F32]">{a.evenement}</td>
                                            <td className="py-1.5 pr-3 text-[#4A4F6B]">{a.utilisateur}</td>
                                            <td className="py-1.5 text-right text-[#9AA0B8]">{a.source === "CHAT" ? "assistant" : "interface"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                </Carte>
            </div>

            <Carte
                titre="Évaluation de la compréhension"
                sousTitre="La validation n° 2, figée avant les dernières corrections, est la mesure honnête ; l'indépendant n° 1 a servi au diagnostic, la référence à la mise au point. Rapports dans eval/resultats."
            >
                {t.evaluations.length === 0
                    ? <p className="text-xs text-[#9AA0B8]">Aucun rapport d&apos;évaluation.</p>
                    : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-[#E8EAF2] text-left text-[#6B7089]">
                                    <th className="py-2 pr-3 font-medium">Jeu</th>
                                    <th className="py-2 pr-3 font-medium">Mesure</th>
                                    <th className="py-2 pr-3 font-medium">Modèle</th>
                                    <th className="py-2 pr-3 font-medium">Date</th>
                                    <th className="py-2 text-right font-medium">Bonnes réponses</th>
                                </tr>
                            </thead>
                            <tbody>
                                {evaluations.map((e) => (
                                    <tr key={e.fichier} className="border-b border-[#F0F1F7] last:border-0">
                                        <td className="py-2 pr-3 text-[#4A4F6B]">
                                            {e.jeu === "validation2" ? "Validation n° 2" : e.jeu === "independant" ? "Indépendant n° 1" : "Référence (mise au point)"}
                                        </td>
                                        <td className="py-2 pr-3 text-[#1B1F32]">
                                            {e.depart ? "Départ, avant les corrections"
                                                : e.modele === MODELE_LOCAL ? "Actuelle, modèle local" : "Comparaison, modèle distant"}
                                        </td>
                                        <td className="py-2 pr-3 font-mono text-[#4A4F6B]">{e.modele}</td>
                                        <td className="py-2 pr-3 text-[#9AA0B8]">{horodatage(e.date)}</td>
                                        <td className="py-2 text-right tabular-nums">
                                            <span className="font-semibold text-[#1B1F32]">{e.reussis}/{e.total}</span>
                                            <span className="text-[#6B7089]"> — {pourcent(e.taux)}</span>
                                            {!e.complet && <span className="text-[#9AA0B8]"> (partiel, quota)</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </Carte>
        </div>
    );
}

export default async function TableauDeBordPage() {
    const session = await getSession();
    const autorise = ROLES_TABLEAU.includes(session.role);
    const donnees = autorise ? await lireTableauDeBord(db) : null;

    return (
        <div className="flex h-screen bg-[#F7F8FC] text-[#1B1F32]">
            <Sidebar nom={session.nom} role={session.role} actif="tableau" />
            <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mx-auto max-w-6xl">
                    <h1 className="text-xl font-bold">Tableau de bord</h1>
                    <p className="mb-5 text-sm text-[#6B7089]">
                        Utilisation et comportement de l&apos;assistant — données réelles, lues en lecture seule.
                    </p>
                    {donnees
                        ? <Contenu t={donnees} />
                        : (
                            <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Le tableau de bord est réservé au responsable et à l&apos;administrateur.
                            </p>
                        )}
                </div>
            </main>
        </div>
    );
}
