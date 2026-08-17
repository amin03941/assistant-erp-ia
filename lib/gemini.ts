import { GoogleGenAI } from "@google/genai";
import { cataloguePourRole } from "./catalogue";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELE = "gemini-3.6-flash";

export async function analyserQuestion(question: string, role: string) {
  const prompt = `Tu traduis une question métier en spécification JSON pour un ERP.

VUES AUTORISÉES pour le rôle ${role} :
${cataloguePourRole(role)}

Réponds UNIQUEMENT avec un objet JSON, sans texte ni balises markdown.

Si la question est traitable :
{"ok":true,"view":"nom_de_vue","select":["col1","col2"],"filters":[{"field":"col","op":"eq","value":x}],"order_by":{"field":"col","dir":"desc"},"limit":20}

Opérateurs autorisés : eq, neq, gt, gte, lt, lte, like, in
Champs optionnels : filters, order_by, limit, aggregate, group_by
Pour un total : "aggregate":{"fn":"sum","field":"col"}  (fn : sum, count, avg, min, max)

Si la donnée demandée n'existe dans aucune vue autorisée :
{"ok":false,"raison":"explication courte en français"}

QUESTION : ${question}`;

  const res = await ai.models.generateContent({
    model: MODELE,
    contents: prompt,
  });

  const texte = (res.text ?? "").replace(/```json|```/g, "").trim();
  return JSON.parse(texte);
}