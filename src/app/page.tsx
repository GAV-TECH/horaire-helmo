import { connection } from "next/server";
import { ScheduleApp } from "@/components/schedule/ScheduleApp";
import { dayKey } from "@/lib/time";

/** Heure de la requête. Isolée dans une fonction : un composant React doit rester "pur" (même entrée → même rendu). */
function requestTime() {
  return Date.now();
}

export default async function Home() {
  // Sans ceci, Next.js pré-génèrerait la page au build et "aujourd'hui" serait la date du build.
  await connection();
  const now = requestTime();
  return <ScheduleApp initialDay={dayKey(now)} initialNow={now} />;
}
