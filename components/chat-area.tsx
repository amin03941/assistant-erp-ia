"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { Bell, Search, Sparkles, Plus, Send, FileUp } from "lucide-react";
import CarteAction, { type Confirmation } from "@/components/carte-action";
import CarteImport, { type Brouillon } from "@/components/carte-import";
import { useConversation } from "@/components/conversation-context";

const ROLES: Record<string, string> = {
    MANAGER: "Responsable", ACCOUNTANT: "Comptable",
    SALES: "Commercial", ADMIN: "Administrateur",
};

const SUGGESTIONS = [
    "Quelles sont les factures impayées ?",
    "Quelles commandes sont en retard ?",
    "Quel est le montant total restant à payer ?",
    "Combien de clients avons-nous ?",
];

export default function ChatArea({ nom, role }: { nom: string; role: string }) {
    const { messages, setMessages, input, enCours, setInput, envoyer, importer, nouvelleConversation } = useConversation();
    const basRef = useRef<HTMLDivElement>(null);
    const fichierRef = useRef<HTMLInputElement>(null);
    const [attenteImport, setAttenteImport] = useState(false);

    useEffect(() => {
        basRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, enCours]);

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-[#E8EAF2] bg-white px-6 py-3.5">
                <div>
                    <p className="font-semibold">Bonjour, {nom.split(" ")[0]} 👋</p>
                    <p className="text-xs text-[#6B7089]">{ROLES[role] ?? role}</p>
                </div>
                <div className="flex items-center gap-4 text-[#6B7089]">
                    <Search size={18} />
                    <Bell size={18} />
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#5B5BD6] text-sm font-semibold text-white">
                        {nom.charAt(0)}
                    </div>
                </div>
            </header>

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
                        ) : m.brouillon ? (
                            <div key={i} className="flex gap-3">
                                <Image src="/logo.png" alt="" width={32} height={32} className="mt-1 h-8 w-8 shrink-0 rounded-lg" />
                                <CarteImport
                                    brouillon={m.brouillon as Brouillon}
                                    onTermine={(texte, statut) => {
                                        setMessages((prev) => [
                                            ...prev,
                                            {
                                                role: "assistant",
                                                content: texte,
                                                refus: statut === "refus",
                                                heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                                            },
                                        ]);
                                    }}
                                />
                            </div>
                        ) : m.confirmation ? (
                            <div key={i} className="flex gap-3">
                                <Image src="/logo.png" alt="" width={32} height={32} className="mt-1 h-8 w-8 shrink-0 rounded-lg" />
                                <CarteAction
                                    confirmation={m.confirmation as Confirmation}
                                    onTermine={(texte, statut) => {
                                        setMessages((prev) => [
                                            ...prev,
                                            {
                                                role: "assistant",
                                                content: texte,
                                                refus: statut === "refus",
                                                heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                                            },
                                        ]);
                                    }}
                                />
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

                                    {m.choix && m.choix.length > 0 && (
                                        <div className="mt-3 flex flex-col gap-2">
                                            {m.choix.map((c: string) => (
                                                <button
                                                    key={c}
                                                    onClick={() => envoyer(c)}
                                                    className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50 transition"
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {m.lignes && m.lignes.length > 0 && (
                                        <div className="mt-3 overflow-x-auto">
                                            <table className="w-full border-collapse text-xs">
                                                <thead>
                                                    <tr className="border-b border-[#E8EAF2] text-[#6B7089]">
                                                        {Object.keys(m.lignes[0]).map((c) => (
                                                            <th key={c} className="whitespace-nowrap py-2 pr-5 text-left font-medium">
                                                                {m.libelles?.[c] ?? c}
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
                                <span className="text-sm text-[#6B7089]">
                                    {attenteImport ? "Lecture de la facture…" : "Analyse en cours…"}
                                </span>
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
                        <input
                            ref={fichierRef}
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";   // permet de réimporter le même fichier
                                if (!f) return;
                                setAttenteImport(true);
                                try {
                                    await importer(f);
                                } finally {
                                    setAttenteImport(false);
                                }
                            }}
                        />
                        <button
                            onClick={() => fichierRef.current?.click()}
                            disabled={enCours}
                            className="flex items-center gap-2 rounded-lg border border-[#E8EAF2] bg-white px-3 py-2
                                       text-xs text-[#4A4F6B] transition hover:border-[#5B5BD6] hover:text-[#5B5BD6]
                                       disabled:opacity-50"
                        >
                            <FileUp size={14} />
                            Importer facture (OCR)
                        </button>
                    </div>

                    <p className="mt-3 text-center text-[11px] text-[#9AA0B8]">
                        L'IA peut commettre des erreurs. Vérifiez toujours les informations importantes.
                    </p>
                </div>
            </main>
        </div>
    );
}
