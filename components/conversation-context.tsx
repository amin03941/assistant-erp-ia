"use client";

import { createContext, useContext, useState } from "react";
import type { Confirmation } from "@/components/carte-action";
import type { Brouillon } from "@/components/carte-import";
import type { Comprehension } from "@/lib/synthese";
import type { Graphique } from "@/lib/graphique";
import { pdfEnImage } from "@/components/pdf-en-image";

type Message = {
    role: "user" | "assistant";
    content: string;
    lignes?: any[];
    libelles?: Record<string, string>;
    choix?: string[];
    refus?: boolean;
    confirmation?: Confirmation;
    brouillon?: Brouillon;
    /** « Comment j'ai compris » : la lecture en clair, et la requête exécutée. */
    comprehension?: Comprehension | null;
    sql?: string;
    params?: unknown[];
    graphique?: Graphique | null;
    heure: string;
};

/** Étape en cours du traitement d'une question, envoyée par le serveur. */
export type Etape = "comprehension" | "verification" | "execution" | "redaction" | "preparation";

type ConversationState = {
    conversationId: string | null;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    input: string;
    enCours: boolean;
    etape: Etape | null;
    rafraichir: number;
    setInput: (v: string) => void;
    envoyer: (texte?: string) => Promise<void>;
    importer: (fichier: File) => Promise<void>;
    nouvelleConversation: () => void;
    ouvrirConversation: (id: string) => Promise<void>;
};

const ConversationContext = createContext<ConversationState | null>(null);

/**
 * Lit la réponse de /api/chat : un flux NDJSON (une ligne par étape, puis le
 * résultat), ou du JSON simple pour une erreur survenue avant le traitement.
 */
async function lireReponse(res: Response, surEtape: (e: Etape) => void): Promise<any> {
    if (!(res.headers.get("content-type") ?? "").includes("ndjson") || !res.body) return res.json();

    const lecteur = res.body.getReader();
    const decodeur = new TextDecoder();
    let tampon = "";
    for (; ;) {
        const { value, done } = await lecteur.read();
        tampon += decodeur.decode(value, { stream: !done });
        let fin: number;
        while ((fin = tampon.indexOf("\n")) >= 0) {
            const ligne = tampon.slice(0, fin).trim();
            tampon = tampon.slice(fin + 1);
            if (!ligne) continue;
            const evenement = JSON.parse(ligne);
            if (evenement.etape) surEtape(evenement.etape);
            if (evenement.fin) return evenement.fin;
        }
        if (done) break;
    }
    throw new Error("réponse interrompue");
}

const maintenant = (date?: string) =>
    new Date(date ?? Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function ConversationProvider({ children }: { children: React.ReactNode }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [enCours, setEnCours] = useState(false);
    const [etape, setEtape] = useState<Etape | null>(null);
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
                headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
                body: JSON.stringify({ question, conversationId }),
            });
            const data = await lireReponse(res, setEtape);
            if (data.conversationId) setConversationId(data.conversationId);

            if (data.confirmation) {
                setMessages((m) => [...m, {
                    role: "assistant",
                    content: "",
                    confirmation: data.confirmation,
                    heure: maintenant(),
                }]);
            } else {
                setMessages((m) => [...m, {
                    role: "assistant",
                    content: data.texte ?? data.erreur ?? "Réponse vide.",
                    lignes: data.lignes,
                    libelles: data.libelles,
                    choix: data.choix,
                    refus: data.refus === true || res.status >= 400 || Boolean(data.erreur),
                    comprehension: data.comprehension,
                    sql: data.sql,
                    params: data.params,
                    graphique: data.graphique,
                    heure: maintenant(),
                }]);
            }
        } catch (e) {
            setMessages((m) => [...m, {
                role: "assistant",
                content: `Connexion au serveur impossible : ${e instanceof Error ? e.message : String(e)}`,
                refus: true,
                heure: maintenant(),
            }]);
        } finally {
            setEnCours(false);
            setEtape(null);
            setRafraichir((n) => n + 1);
        }
    }

    /** L'import ne passe pas par /api/chat : c'est un fichier, pas une question.
     *  Le brouillon revient dans le fil comme une carte, au même titre qu'une
     *  confirmation d'action. */
    async function importer(fichier: File) {
        if (enCours) return;
        setEnCours(true);
        setMessages((m) => [
            ...m,
            { role: "user", content: `Import de « ${fichier.name} »`, heure: maintenant() },
        ]);

        const refuser = (texte: string) => setMessages((m) => [
            ...m,
            { role: "assistant", content: texte, refus: true, heure: maintenant() },
        ]);

        // Un PDF est rendu en image ici : le serveur et le modèle de vision reçoivent une image.
        let piece = fichier;
        if (fichier.type === "application/pdf" || /\.pdf$/i.test(fichier.name)) {
            try {
                piece = await pdfEnImage(fichier);
            } catch (e) {
                refuser(`Le PDF n'a pas pu être lu : ${e instanceof Error ? e.message : String(e)}`);
                setEnCours(false);
                return;
            }
        }

        try {
            const form = new FormData();
            form.append("fichier", piece);
            const res = await fetch("/api/import", { method: "POST", body: form });
            const data = await res.json();

            if (res.ok && data.importId) {
                setMessages((m) => [
                    ...m,
                    { role: "assistant", content: "", brouillon: data as Brouillon, heure: maintenant() },
                ]);
            } else {
                setMessages((m) => [
                    ...m,
                    {
                        role: "assistant",
                        content: data.erreur ?? "L'import a échoué.",
                        refus: true,
                        heure: maintenant(),
                    },
                ]);
            }
        } catch (e) {
            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content: `Connexion au serveur impossible : ${e instanceof Error ? e.message : String(e)}`,
                    refus: true,
                    heure: maintenant(),
                },
            ]);
        } finally {
            setEnCours(false);
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
                    comprehension: m.structured_data?.comprehension,
                    sql: m.structured_data?.sql,
                    params: m.structured_data?.params,
                    graphique: m.structured_data?.graphique,
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
                conversationId, messages, setMessages, input, enCours, etape, rafraichir,
                setInput, envoyer, importer, nouvelleConversation, ouvrirConversation,
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
