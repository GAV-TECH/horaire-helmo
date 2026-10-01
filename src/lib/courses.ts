/**
 * Normalise un libellé pour pouvoir comparer deux textes
 * ("Base de données  I" et "base de donnees i" donnent la même clé).
 * Sert d'identifiant de séance (secours si l'UID change) : ne pas en changer le comportement.
 */
export function courseKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents décomposés
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------------------------------
 * Intitulés HELMO. Format constaté dans le flux :
 *   "Construction en Béton : théorie / BULDGEN / 519 (CO)"
 *   "Construction des machines - projet / BECKERS - HENQUET / 419 (CO)"
 *   "Systèmes Automatisés de Production (SAP) - évaluation / BECKERS / D101 (CO)"
 * = cours, type de séance (après " : " ou " - "), enseignants, local — séparés par " / ".
 * ---------------------------------------------------------------------------------------- */

/** Types de séance reconnus en fin de nom de cours. */
const KIND_PATTERN =
  /^(.*?)\s*(?::|\s-\s)\s*(th[ée]orie|exercices?|laboratoire(?:\s+et\s+projet)?|labo|projet|[ée]valuation|examen|interrogation|tp|s[ée]minaire)\s*$/i;
// (?<!\p{L}) … (?!\p{L}) : "mot entier" compatible avec les accents (\b ne connaît pas le "é").
const EVALUATION_PATTERN = /(?<!\p{L})([ée]valuation|examen|interro(gation)?|partiel|test)(?!\p{L})/iu;

export type ParsedCourseTitle = {
  /** Nom du cours seul, ex. "Construction en Béton". */
  course: string;
  /** Type de séance en minuscules, ex. "théorie", "évaluation" ; null si non précisé. */
  kind: string | null;
  teachers: string[];
  room: string | null;
  isEvaluation: boolean;
};

export function parseCourseTitle(title: string): ParsedCourseTitle {
  const parts = title.split(/\s+\/\s+/).map((p) => p.trim());
  const head = parts[0] ?? title;
  const match = head.match(KIND_PATTERN);
  const course = (match ? match[1] : head).trim() || head.trim();
  const kind = match ? match[2].toLowerCase() : null;
  // Enseignants : 2e partie, en MAJUSCULES, séparés par " - ".
  const teachers = parts[1] && parts[1] === parts[1].toUpperCase() ? parts[1].split(/\s+-\s+/).filter(Boolean) : [];
  const room = parts.length > 2 ? parts.slice(2).join(" / ") : null;
  return { course, kind, teachers, room, isEvaluation: EVALUATION_PATTERN.test(kind ?? "") || EVALUATION_PATTERN.test(head) };
}

/** Petits mots ignorés pour reconnaître un même cours malgré les variantes d'écriture de HELMO. */
const STOPWORDS = new Set(["de", "des", "du", "d", "la", "le", "les", "l", "et", "en", "and", "of", "the", "a", "au", "aux"]);

/**
 * Clé d'un COURS (et non d'une séance) : "Construction de machines" et "Construction des machines",
 * ou "Modelling system analysis" et "Modelling and system analysis", donnent la même clé.
 * Accepte un intitulé HELMO complet, un nom de cours, ou une clé déjà normalisée.
 */
export function courseGroupKey(titleOrName: string): string {
  return courseKey(parseCourseTitle(titleOrName).course)
    .replace(/\([^)]*\)/g, " ") // "(SAP)"
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ");
}

/** Deux libellés désignent-ils le même cours ? */
export function sameCourse(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && courseGroupKey(a) === courseGroupKey(b);
}

/**
 * Liste des COURS (un par cours, pas un par séance ou par local), pour les menus déroulants.
 * Nom affiché : la variante d'écriture la plus fréquente dans l'horaire.
 */
export function coursesFrom(sessions: { title: string; key?: string }[]): { key: string; name: string }[] {
  const variants = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    if (s.key?.startsWith("perso:")) continue; // plage ajoutée à la main : pas un cours
    const key = courseGroupKey(s.title);
    if (!key) continue;
    const name = parseCourseTitle(s.title).course;
    const counts = variants.get(key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    variants.set(key, counts);
  }
  return [...variants]
    .map(([key, counts]) => ({ key, name: [...counts].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
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

/** Couleur d'un COURS : toutes ses séances (théorie, labo, évaluation, n'importe quel local) ont la même. */
export function courseColor(titleOrKey: string): string {
  return PALETTE[hash(courseGroupKey(titleOrKey)) % PALETTE.length];
}
