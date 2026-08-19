"use client";

import { createContext, useContext, useState } from "react";

type Message = {
    role: "user" | "assistant";
    content: string;
    lignes?: any[];
    libelles?: Record<string, string>;
    refus?: boolean;
    heure: string;
};

type ConversationState = {
    conversationId: string | null;
    messages: Message[];
    input: string;
    enCours: boolean;
    rafraichir: number;
    setInput: (v: string) => void;
    envoyer: (texte?: string) => Promise<void>;
    nouvelleConversation: () => void;
    ouvrirConversation: (id: string) => Promise<void>;
};

const ConversationContext = createContext<ConversationState | null>(null);

const maintenant = (date?: string) =>
    new Date(date ?? Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function ConversationProvider({ children }: { children: React.ReactNode }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [enCours, setEnCours] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [rafraichir, setRafraichir] = useState(0);

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
                libelles: data.libelles,
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
            setRafraichir((n) => n + 1);
        }
    }

    function nouvelleConversation() {
        setMessages([]);
        setConversationId(null);
        setInput("");
    }

    async function ouvrirConversation(id: string) {
        if (id === conversationId || enCours) return;
        setConversationId(id);
        setInput("");

        try {
            const res = await fetch(`/api/conversations?id=${id}`);
            const data = await res.json();
            setMessages(
                (data.messages ?? []).map((m: any) => ({
                    role: m.sender === "USER" ? "user" : "assistant",
                    content: m.content,
                    lignes: m.structured_data?.lignes,
                    libelles: m.structured_data?.libelles,
                    heure: maintenant(m.created_at),
                }))
            );
        } catch {
            setMessages([]);
        }
    }

    return (
        <ConversationContext.Provider
            value={{
                conversationId, messages, input, enCours, rafraichir,
                setInput, envoyer, nouvelleConversation, ouvrirConversation,
            }}
        >
            {children}
        </ConversationContext.Provider>
    );
}

export function useConversation() {
    const ctx = useContext(ConversationContext);
    if (!ctx) throw new Error("useConversation doit être utilisé dans un ConversationProvider.");
    return ctx;
}
