// Reconnaissance vocale locale : Whisper exécuté dans le navigateur.
//
// L'audio ne quitte jamais le poste, comme les questions qui partent vers le
// modèle local (Ollama). Le modèle est téléchargé une fois depuis Hugging
// Face, puis servi par le cache du navigateur : les utilisations suivantes
// fonctionnent hors ligne.
//
// Ce fichier est un module servi tel quel depuis public/ : il tourne dans un
// Web Worker pour que l'inférence ne fige pas l'interface.

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

env.allowLocalModels = false;

// Plusieurs threads WASM quand la page est isolée (voir next.config.ts) ;
// sinon ONNX Runtime reste sur un seul thread.
if (self.crossOriginIsolated && env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(1, (self.navigator?.hardwareConcurrency ?? 2) >> 1));
}

let transcripteur = null;
let enCours = null;

async function accelerateur(webgpu) {
    if (!webgpu) return "wasm";
    try {
        if (self.navigator?.gpu && (await self.navigator.gpu.requestAdapter())) return "webgpu";
    } catch {
        /* WebGPU absent ou refusé : repli sur WASM */
    }
    return "wasm";
}

async function charger(modele, webgpu) {
    if (transcripteur) return transcripteur;
    if (enCours) return enCours;

    enCours = (async () => {
        const device = await accelerateur(webgpu);
        // WASM (processeur, par défaut) : tout en 8 bits, ~77 Mo pour whisper-base,
        // disponible partout. WebGPU (sur option) : la combinaison recommandée
        // pour Whisper, encodeur en précision pleine et décodeur en 4 bits —
        // plus rapide sur un gros modèle, mais plus lourde à télécharger.
        const dtype = device === "webgpu"
            ? { encoder_model: "fp32", decoder_model_merged: "q4" }
            : "q8";

        transcripteur = await pipeline("automatic-speech-recognition", modele, {
            device,
            dtype,
            progress_callback: (p) => {
                if (p.status === "progress" && p.total) {
                    self.postMessage({ type: "progression", fichier: p.file, charge: p.loaded, total: p.total });
                }
            },
        });
        self.postMessage({ type: "pret", device });
        return transcripteur;
    })();

    try {
        return await enCours;
    } finally {
        enCours = null;
    }
}

self.onmessage = async ({ data }) => {
    try {
        if (data.type === "charger") {
            await charger(data.modele, data.webgpu);
            return;
        }
        if (data.type === "transcrire") {
            const asr = await charger(data.modele, data.webgpu);
            const debut = performance.now();
            const sortie = await asr(data.audio, { language: "french", task: "transcribe" });
            self.postMessage({
                type: "texte",
                texte: (sortie.text ?? "").trim(),
                ms: Math.round(performance.now() - debut),
            });
        }
    } catch (e) {
        self.postMessage({ type: "erreur", message: e instanceof Error ? e.message : String(e) });
    }
};
