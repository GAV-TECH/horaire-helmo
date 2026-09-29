/**
 * Normalise un nom de cours pour pouvoir comparer deux libellés
 * ("Base de données  I" et "base de donnees i" donnent la même clé).
 */
export function courseKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents décomposés
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Palette lisible sur fond clair comme sombre ; un même cours tombe toujours sur la même couleur. */
const PALETTE = [
  "#2563eb", // bleu
  "#16a34a", // vert
  "#dc2626", // rouge
  "#9333ea", // violet
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // rose
  "#65a30d", // olive
  "#4f46e5", // indigo
  "#ca8a04", // moutarde
  "#0d9488", // sarcelle
  "#7c3aed", // mauve
];

/** Hachage FNV-1a : rapide, déterministe, suffisant pour répartir les cours sur la palette. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function courseColor(key: string): string {
  return PALETTE[hash(key) % PALETTE.length];
}
