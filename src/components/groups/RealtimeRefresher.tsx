"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Tables dont un changement doit rafraîchir l'affichage des autres membres. */
const TABLES = [
  "groups",
  "group_members",
  "deadlines",
  "deadline_completions",
  "todo_lists",
  "todo_items",
  "todo_completions",
  "reminders",
];

/**
 * Temps réel : Supabase Realtime prévient le navigateur quand une ligne visible change
 * (le RLS s'applique : on ne reçoit que ce qu'on a le droit de voir). Plutôt que de
 * fusionner les changements à la main, on redemande simplement la page au serveur
 * (router.refresh) — regroupé sur 400 ms pour ne pas recharger 10 fois de suite.
 */
export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel("horaire-changes");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
