"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Sparkles, Plus, Send, FileUp, UserPlus, ClipboardPlus, Banknote } from "lucide-react";

type Message = {
    role: "user" | "assistant";
    content: string;
    lignes?: any[];
    refus?: boolean;
    heure: string;
};

const SUGGESTIONS = [
    "Quelles sont les factures impayées ?",
    "Quelles commandes sont en retard ?",
    "Quel est le montant total restant à payer ?",
    "Combien de clients avons-nous ?",
];

const ACTIONS = [
    { icone: FileUp, libelle: "Importer facture (OCR)" },
    { icone: UserPlus, libelle: "Ajouter un client" },
    { icone: ClipboardPlus, libelle: "Nouvelle commande" },
    { icone: Banknote, libelle: "Enregistrer un paiement" },
];

const maintenant = () =>
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [enCours, setEnCours] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const basRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        basRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, enCours]);

    async function envoyer(texte?: string) {
        const question = (texte ?? input).trim();
        if (!question || enCours) return;

        setInput("");
        setEnCours(true);
        setMessages((m) => [...m, { role: "user", content: question, heure: maintenant() }]);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question, conversationId }),
            });
            const data = await res.json();
            if (data.conversationId) setConversationId(data.conversationId);

            setMessages((m) => [...m, {
                role: "assistant",
                content: data.texte ?? data.erreur ?? "Réponse vide.",
                lignes: data.lignes,
                refus: data.refus === true,
                heure: maintenant(),
            }]);
        } catch (e) {
            setMessages((m) => [...m, {
                role: "assistant",
                content: `Connexion au serveur impossible : ${e instanceof Error ? e.message : String(e)}`,
                refus: true,
                heure: maintenant(),
            }]);
        } finally {
            setEnCours(false);
        }
    }

    function nouvelleConversation() {
        setMessages([]);
        setConversationId(null);
        setInput("");
    }

    return (
        <main className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <div className="mb-4 flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                    <Sparkles size={22} className="mt-0.5 text-[#5B5BD6]" />
                    <div>
                        <h1 className="text-xl font-bold">Assistant IA</h1>
                        <p className="text-sm text-[#6B7089]">
                            Posez vos questions en langage naturel sur vos données ERP
                        </p>
                    </div>
                </div>
                <button
                    onClick={nouvelleConversation}
                    className="flex items-center gap-1.5 rounded-lg border border-[#5B5BD6] px-3.5 py-2 text-sm font-medium text-[#5B5BD6] transition hover:bg-[#5B5BD6]/5"
                >
                    <Plus size={15} />
                    Nouvelle conversation
                </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                    <button
                        key={s}
                        onClick={() => envoyer(s)}
                        disabled={enCours}
                        className="rounded-lg border border-[#E8EAF2] bg-white px-3 py-2 text-xs text-[#4A4F6B] transition hover:border-[#5B5BD6] hover:text-[#5B5BD6] disabled:opacity-50"
                    >
                        {s}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {messages.length === 0 && (
                    <p className="pt-10 text-center text-sm text-[#9AA0B8]">
                        Choisissez une suggestion ou écrivez votre question.
                    </p>
                )}

                {messages.map((m, i) =>
                    m.role === "user" ? (
                        <div key={i} className="flex justify-end">
                            <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-[#E4E7F8] px-4 py-2.5">
                                <p className="text-sm">{m.content}</p>
                                <p className="mt-1 text-right text-[10px] text-[#6B7089]">{m.heure}</p>
                            </div>
                        </div>
                    ) : (
                        <div key={i} className="flex gap-3">
                            <Image src="/logo.png" alt="" width={32} height={32} className="mt-1 h-8 w-8 shrink-0 rounded-lg" />
                            <div
                                className={`min-w-0 max-w-full rounded-2xl rounded-tl-sm border px-4 py-3 ${m.refus
                                    ? "border-amber-300 bg-amber-50"
                                    : "border-[#E8EAF2] bg-white"
                                    }`}
                            >
                                <p className={`whitespace-pre-wrap text-sm ${m.refus ? "text-amber-900" : ""}`}>
                                    {m.content}
                                </p>

                                {m.lignes && m.lignes.length > 0 && (
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="w-full border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b border-[#E8EAF2] text-[#6B7089]">
                                                    {Object.keys(m.lignes[0]).map((c) => (
                                                        <th key={c} className="whitespace-nowrap py-2 pr-5 text-left font-medium">
                                                            {c}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {m.lignes.map((l, k) => (
                                                    <tr key={k} className="border-b border-[#F0F1F7] last:border-0">
                                                        {Object.values(l).map((v, j) => (
                                                            <td key={j} className="whitespace-nowrap py-2 pr-5">
                                                                {String(v ?? "")}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <p className="mt-2 text-[10px] text-[#9AA0B8]">{m.heure}</p>
                            </div>
                        </div>
                    )
                )}

                {enCours && (
                    <div className="flex gap-3">
                        <Image src="/logo.png" alt="" width={32} height={32} className="mt-1 h-8 w-8 shrink-0 rounded-lg" />
                        <div className="rounded-2xl rounded-tl-sm border border-[#E8EAF2] bg-white px-4 py-3">
                            <span className="text-sm text-[#6B7089]">Analyse en cours…</span>
                        </div>
                    </div>
                )}

                <div ref={basRef} />
            </div>

            <div className="mt-4">
                <div className="flex items-end gap-2 rounded-2xl border border-[#E8EAF2] bg-white p-3">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                envoyer();
                            }
                        }}
                        rows={1}
                        placeholder="Posez votre question…"
                        className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[#9AA0B8]"
                    />
                    <button
                        onClick={() => envoyer()}
                        disabled={enCours || !input.trim()}
                        aria-label="Envoyer la question"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B5BD6] text-white transition hover:bg-[#4F4FC4] disabled:opacity-40"
                    >
                        <Send size={16} />
                    </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    {ACTIONS.map(({ icone: Icone, libelle }) => (
                        <button
                            key={libelle}
                            disabled
                            title="Fonctionnalité à venir"
                            className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-[#E8EAF2] bg-white px-3 py-2 text-xs text-[#9AA0B8]"
                        >
                            <Icone size={14} />
                            {libelle}
                            <span className="rounded-full bg-[#F0F1F7] px-1.5 py-0.5 text-[9px]">à venir</span>
                        </button>
                    ))}
                </div>

                <p className="mt-3 text-center text-[11px] text-[#9AA0B8]">
                    L'IA peut commettre des erreurs. Vérifiez toujours les informations importantes.
                </p>
            </div>
        </main>
    );
}