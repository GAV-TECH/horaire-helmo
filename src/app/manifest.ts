import type { MetadataRoute } from "next";

/** Manifeste : ce qui rend l'app "installable" (nom, icônes, ouverture en plein écran sans barre d'adresse). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Horaire HELMO",
    short_name: "Horaire",
    description: "Mon horaire de cours enrichi : notes, deadlines, tâches et rappels.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
