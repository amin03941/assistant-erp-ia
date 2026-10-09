import type { NextConfig } from "next";

/**
 * Isolation cross-origin de la page de chat et du worker vocal.
 *
 * Sans elle, SharedArrayBuffer est indisponible et ONNX Runtime exécute
 * Whisper sur un seul thread. COEP « credentialless » n'exige rien des
 * ressources externes (CDN, modèles Hugging Face) : elles sont chargées en
 * CORS, sans cookies.
 */
const ISOLATION = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

const nextConfig: NextConfig = {
  headers() {
    return [
      { source: "/chat/:path*", headers: ISOLATION },
      { source: "/chat", headers: ISOLATION },
      { source: "/voix/:path*", headers: ISOLATION },
    ];
  },
};

export default nextConfig;
