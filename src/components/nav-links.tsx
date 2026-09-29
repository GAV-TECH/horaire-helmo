/** Liens de navigation, partagés par la barre (composant client) et la page Plus (composant serveur). */

/* Icônes SVG minimalistes (traits), pour ne pas dépendre d'une bibliothèque d'icônes. */
export const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/** mobile: false = accessible sur téléphone via la page "Plus" (la barre du bas n'a que 6 places). */
export const NAV_LINKS = [
  { href: "/", label: "Horaire", mobile: true, icon: icon("M4 5h16v15H4zM4 10h16M9 3v4M15 3v4") },
  { href: "/semaine", label: "Semaine", mobile: true, icon: icon("M4 6h16M4 12h16M4 18h10") },
  { href: "/taches", label: "Tâches", mobile: true, icon: icon("M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2") },
  { href: "/deadlines", label: "Échéances", mobile: true, icon: icon("M5 21V4h11l-2 4 2 4H5") },
  { href: "/groupes", label: "Groupes", mobile: true, icon: icon("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6") },
  { href: "/rappels", label: "Rappels", mobile: false, icon: icon("M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4") },
  { href: "/notes", label: "Notes", mobile: false, icon: icon("M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5") },
  { href: "/parametres", label: "Réglages", mobile: false, icon: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2.3L6 8.8 4 8.5 3 11.5l2 1v1l-2 1 1 3 2-.3 1.5 1.5L7 20l3 1 1-2h2l1 2 3-1-.5-2.2 1.5-1.5 2 .2 1-3-2-1z") },
];

