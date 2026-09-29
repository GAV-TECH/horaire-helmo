import { renderAppIcon } from "@/lib/pwa-icon";

/** Icône utilisée par iOS pour l'écran d'accueil (Next ajoute automatiquement la balise <link>). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
