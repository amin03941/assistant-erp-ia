"use client";

import { useState } from "react";

type Message = {
    role: "user" | "assistant";
    content: string;
    lignes?: any[];
    refus?: boolean;
};

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [conversationId, setConversationId] = useState<string | null>(null);

    async function envoyer() {
        const question = input.trim();
        if (!question) return;

        setInput("");
        setMessages((m) => [...m, { role: "user", content: question }]);

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
            }]);
        } catch (error) {
            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content: `Erreur réseau: ${error instanceof Error ? error.message : String(error)}`,
                },
            ]);
        }
    }

    return (
        <main className="flex flex-col h-screen max-w-3xl mx-auto p-6">
            <h1 className="text-xl font-bold mb-4">Assistant ERP</h1>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {messages.length === 0 && (
                    <p className="text-gray-500">Posez une question sur vos données ERP.</p>
                )}
                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`p-3 rounded-lg ${m.role === "user"
                            ? "bg-blue-600 text-white ml-auto max-w-[80%]"
                            : m.refus
                                ? "bg-amber-950 text-amber-200 border border-amber-800 max-w-full"
                                : "bg-gray-800 text-gray-100 max-w-full"
                            }`}
                    >
                        {m.content}
                        {m.lignes && m.lignes.length > 0 && (
                            <table className="mt-3 w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-600">
                                        {Object.keys(m.lignes[0]).map((c) => (
                                            <th key={c} className="text-left py-1 pr-4 font-medium">{c}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {m.lignes.map((l, i) => (
                                        <tr key={i} className="border-b border-gray-700/50">
                                            {Object.values(l).map((v, j) => (
                                                <td key={j} className="py-1 pr-4">{String(v ?? "")}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && envoyer()}
                    placeholder="Posez votre question..."
                    className="flex-1 border border-gray-600 bg-transparent rounded-lg px-4 py-2"
                />
                <button
                    onClick={envoyer}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg"
                >
                    Envoyer
                </button>
            </div>
        </main>
    );
}