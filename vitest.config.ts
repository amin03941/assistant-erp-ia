import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        // Next.js résout « @/ » via tsconfig ; Vitest a besoin qu'on le lui dise.
        alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
    },
    test: { environment: "node" },
});