"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Icônes SVG minimalistes (traits), pour ne pas dépendre d'une bibliothèque d'icônes. */
const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const LINKS = [
  { href: "/", label: "Horaire", icon: icon("M4 5h16v15H4zM4 10h16M9 3v4M15 3v4") },
  { href: "/semaine", label: "Semaine", icon: icon("M4 6h16M4 12h16M4 18h10") },
  { href: "/taches", label: "Tâches", icon: icon("M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2") },
  { href: "/deadlines", label: "Deadlines", icon: icon("M5 21V4h11l-2 4 2 4H5") },
  { href: "/rappels", label: "Rappels", icon: icon("M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4") },
  { href: "/notes", label: "Notes", icon: icon("M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5") },
  { href: "/parametres", label: "Réglages", icon: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2.3L6 8.8 4 8.5 3 11.5l2 1v1l-2 1 1 3 2-.3 1.5 1.5L7 20l3 1 1-2h2l1 2 3-1-.5-2.2 1.5-1.5 2 .2 1-3-2-1z") },
];

/** Navigation : barre en bas de l'écran sur mobile (zone du pouce), barre en haut sur grand écran. */
export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:sticky md:top-0 md:bottom-auto md:border-b md:border-t-0 md:pb-0"
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-7 md:flex md:gap-1 md:px-6">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[9px] sm:text-[10px] md:flex-row md:gap-2 md:rounded-md md:px-3 md:text-sm ${
                isActive(link.href)
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
