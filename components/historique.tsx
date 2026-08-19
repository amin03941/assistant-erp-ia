"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { useConversation } from "@/components/conversation-context";

type Conv = { id: string; title: string; updated_at: string };

export default function Historique() {
    const { conversationId, ouvrirConversation, nouvelleConversation, rafraichir } = useConversation();
    const [convs, setConvs] = useState<Conv[]>([]);

    useEffect(() => {
        fetch("/api/conversations")
            .then((r) => r.json())
            .then((d) => setConvs(d.conversations ?? []))
            .catch(() => setConvs([]));
    }, [rafraichir]);

    return (
        <div className="flex min-h-0 flex-1 flex-col px-3">
            <button
                onClick={nouvelleConversation}
                className="mb-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15"
            >
                <Plus size={15} />
                Nouvelle conversation
            </button>

            <p className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-white/30">
                Conversations
            </p>

            <div className="defilement-sombre min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {convs.length === 0 && (
                    <p className="px-1 py-2 text-xs text-white/30">Aucune conversation.</p>
                )}
                {convs.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => ouvrirConversation(c.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${c.id === conversationId
                                ? "bg-white/15 text-white"
                                : "text-white/50 hover:bg-white/5 hover:text-white/80"
                            }`}
                    >
                        <MessageSquare size={13} className="shrink-0" />
                        <span className="truncate">{c.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
