const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        model: "qwen3.5:9b",
        prompt: `Vues disponibles : v_sales_invoices, v_customers.
Question : quelles factures sont impayées ?
Produis la spécification.`,
        stream: false,
        think: false,
        options: { num_ctx: 8192, temperature: 0 },
        format: {
            type: "object",
            properties: {
                ok: { type: "boolean" },
                view: { type: "string" },
            },
            required: ["ok", "view"],
        },
    }),
});

const data = await r.json();
console.log("RÉPONSE :", data.response);
console.log("DURÉE   :", Math.round(data.total_duration / 1e6), "ms");