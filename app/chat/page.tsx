"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  function envoyer() {
    if (!input.trim()) return;
    setMessages([
      ...messages,
      { role: "user", content: input },
      { role: "assistant", content: "Réponse à venir — Gemini n'est pas encore branché." },
    ]);
    setInput("");
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
            className={`p-3 rounded-lg max-w-[80%] ${
              m.role === "user"
                ? "bg-blue-600 text-white ml-auto"
                : "bg-gray-800 text-gray-100"
            }`}
          >
            {m.content}
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