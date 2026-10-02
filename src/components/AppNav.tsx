"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NAV_LINKS, icon } from "./nav-links";

const MORE = { href: "/plus", label: "Plus", icon: icon("M5 12h.01M12 12h.01M19 12h.01") };

/** Navigation : barre en bas de l'écran sur mobile (zone du pouce), barre en haut sur grand écran. */
export function AppNav() {
  const pathname = usePathname();

  // iPhone (app installée) : après la fermeture du clavier ou le retour depuis une autre app, iOS garde
  // parfois l'ancienne hauteur d'écran, et cette barre fixe reste au milieu. Un micro-défilement
  // l'oblige à recalculer la position des éléments fixes.
  useEffect(() => {
    const nudge = () =>
      setTimeout(() => {
        const y = window.scrollY; // on revient exactement au même endroit (pas de dérive en bas de page)
        window.scrollTo(window.scrollX, y + 1);
        window.scrollTo(window.scrollX, y);
      }, 100);
    const onVisible = () => document.visibilityState === "visible" && nudge();
    document.addEventListener("focusout", nudge);
    document.addEventListener("visibilitychange", onVisible);
    window.visualViewport?.addEventListener("resize", nudge);
    return () => {
      document.removeEventListener("focusout", nudge);
      document.removeEventListener("visibilitychange", onVisible);
      window.visualViewport?.removeEventListener("resize", nudge);
    };
  }, []);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const moreActive = pathname === "/plus" || NAV_LINKS.some((l) => !l.mobile && isActive(l.href));
  const itemClass = (active: boolean) =>
    `flex flex-col items-center gap-0.5 py-2 text-[10px] md:flex-row md:gap-2 md:rounded-md md:px-3 md:text-sm ${
      active ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    }`;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:sticky md:top-0 md:bottom-auto md:border-b md:border-t-0 md:pb-0"
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-6 md:flex md:gap-1 md:px-6">
        {NAV_LINKS.map((link) => (
          <li key={link.href} className={link.mobile ? "" : "hidden md:block"}>
            <Link href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={itemClass(isActive(link.href))}>
              {link.icon}
              {link.label}
            </Link>
          </li>
        ))}
        <li className="md:hidden">
          <Link href={MORE.href} aria-current={moreActive ? "page" : undefined} className={itemClass(moreActive)}>
            {MORE.icon}
            {MORE.label}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
