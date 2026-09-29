import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En-têtes de sécurité (recommandés par le guide PWA de Next.js).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" }, // le navigateur ne "devine" pas le type d'un fichier
          { key: "X-Frame-Options", value: "DENY" }, // interdit d'afficher l'app dans une iframe (clickjacking)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, // toujours la dernière version du service worker
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
