import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

/**
 * Configuration de l'évaluation : elle interroge le vrai modèle, elle est donc
 * séparée des tests unitaires (npx vitest run) et lancée à la demande.
 */

// Les variables de .env.local (URL Ollama, clé Gemini, base) sans dépendance.
if (existsSync(".env.local")) {
    for (const ligne of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
        const m = ligne.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
    },
    test: {
        environment: "node",
        include: ["eval/**/*.eval.ts"],
        fileParallelism: false,
        testTimeout: 180_000,
        hookTimeout: 30_000,
    },
});
