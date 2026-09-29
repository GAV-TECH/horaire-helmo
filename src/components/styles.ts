/**
 * Classes Tailwind partagées, dans un module NEUTRE (ni client ni serveur) :
 * les pages serveur peuvent les importer. (Une constante importée depuis un fichier
 * "use client" n'est pas utilisable telle quelle dans un composant serveur.)
 */
export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
export const buttonClass = {
  primary:
    "inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger:
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950",
  ghost: "rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
};
export const cardClass = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
