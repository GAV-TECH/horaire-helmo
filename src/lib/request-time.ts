import "server-only";
import { connection } from "next/server";

/**
 * Heure de la requête en cours. connection() indique à Next.js que la page dépend de la requête :
 * sans ça, elle pourrait être pré-générée au build et "aujourd'hui" serait la date du build.
 * (Fonction séparée : un composant React doit rester "pur", sans appel direct à Date.now().)
 */
export async function requestNow() {
  await connection();
  return Date.now();
}
