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
  "task_shares",
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
    let cancelled = false;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel("horaire-changes");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }

    // Le RLS du temps réel a besoin de savoir QUI écoute : on transmet explicitement le jeton
    // de session (sinon la connexion est anonyme et le RLS ne laisse passer aucun changement).
    // Le jeton expire (≈ 1 h) : on le retransmet à chaque renouvellement.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void supabase.realtime.setAuth(session?.access_token ?? null);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
