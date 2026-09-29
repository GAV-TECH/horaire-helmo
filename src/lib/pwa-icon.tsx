import { ImageResponse } from "next/og";

/**
 * Icône de l'app dessinée en JSX et convertie en PNG par Next (next/og).
 * Pas de fichier image à maintenir : couleur ou lettre se changent ici.
 * Le contenu reste dans les 80 % centraux pour les icônes "maskable" (découpées en rond sur Android).
 */
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          color: "white",
          fontSize: size * 0.5,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        H
      </div>
    ),
    { width: size, height: size },
  );
}
