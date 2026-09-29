"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fromDayKey, groupByDay, shiftDay, weekDays } from "@/lib/calendar";
import type { Session } from "@/lib/ics/types";
import { dayKey, formatFr } from "@/lib/time";
import { DayList } from "./DayList";
import { SessionDetail } from "./SessionDetail";
import { TimeGrid } from "./TimeGrid";

type View = "day" | "week" | "upcoming";
type ScheduleData = { sessions: Session[]; syncedAt: string };

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "upcoming", label: "À venir" },
];
const UPCOMING_DAYS = 30;

async function fetchSchedule(refresh: boolean): Promise<ScheduleData> {
  const res = await fetch(`/api/schedule${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Impossible de charger l'horaire.");
  return body as ScheduleData;
}

/**
 * Composant client principal. `initialDay` et `initialNow` viennent du serveur (heure de la requête)
 * pour que le rendu serveur et le premier rendu navigateur affichent la même semaine.
 */
export function ScheduleApp({ initialDay, initialNow }: { initialDay: string; initialNow: number }) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(initialDay);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Session | null>(null);
  const [now, setNow] = useState(initialNow);

  // Chargement initial (le serveur renvoie son cache s'il a moins de 5 minutes).
  useEffect(() => {
    let ignore = false; // évite de mettre à jour un composant démonté
    fetchSchedule(false)
      .then((d) => !ignore && setData(d))
      .catch((e: Error) => !ignore && setError(e.message));
    return () => {
      ignore = true;
    };
  }, []);

  // Horloge : fait avancer la ligne "maintenant" chaque minute.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await fetchSchedule(true));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const closeDetail = useCallback(() => setSelected(null), []);
  const openDay = useCallback((day: string) => {
    setAnchor(day);
    setView("day");
  }, []);

  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const today = dayKey(now);

  // Semaine : lundi → vendredi, plus le week-end seulement s'il contient des séances.
  const week = useMemo(() => {
    const byDay = groupByDay(sessions);
    return weekDays(anchor).filter((d, i) => i < 5 || byDay.has(d));
  }, [anchor, sessions]);

  const upcoming = useMemo(() => {
    const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => shiftDay(today, i));
    const until = fromDayKey(shiftDay(today, UPCOMING_DAYS)).getTime();
    const items = sessions.filter((s) => Date.parse(s.end) > now && Date.parse(s.start) < until);
    return { days, items };
  }, [sessions, today, now]);

  const step = view === "week" ? 7 : 1;
  const title =
    view === "week"
      ? `${formatFr(fromDayKey(week[0]), "d MMM")} – ${formatFr(fromDayKey(week[week.length - 1]), "d MMM yyyy")}`
      : view === "day"
        ? formatFr(fromDayKey(anchor), "EEEE d MMMM yyyy")
        : `Les ${UPCOMING_DAYS} prochains jours`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Mon horaire</h1>
        <SyncStatus syncedAt={data?.syncedAt} />
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || !data}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </header>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Navigation dans l'horaire">
        <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded px-3 py-1 text-sm ${view === v.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== "upcoming" && (
          <div className="flex items-center gap-1">
            <NavButton label={view === "week" ? "Semaine précédente" : "Jour précédent"} onClick={() => setAnchor(shiftDay(anchor, -step))}>‹</NavButton>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="rounded-md px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Aujourd&apos;hui
            </button>
            <NavButton label={view === "week" ? "Semaine suivante" : "Jour suivant"} onClick={() => setAnchor(shiftDay(anchor, step))}>›</NavButton>
          </div>
        )}
        <p className="w-full text-sm font-medium capitalize text-zinc-600 dark:text-zinc-400 sm:ml-auto sm:w-auto">{title}</p>
      </nav>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!data && !error && <p className="py-10 text-center text-zinc-500">Chargement de l&apos;horaire…</p>}

      {data && view === "week" && (
        <>
          <div className="md:hidden">
            <DayList days={week} sessions={sessions} now={now} onSelect={setSelected} onSelectDay={openDay} showEmptyDays />
          </div>
          <div className="hidden md:block">
            <TimeGrid days={week} sessions={sessions} now={now} onSelect={setSelected} onSelectDay={openDay} />
          </div>
        </>
      )}
      {data && view === "day" && <TimeGrid days={[anchor]} sessions={sessions} now={now} onSelect={setSelected} />}
      {data && view === "upcoming" && (
        <DayList
          days={upcoming.days}
          sessions={upcoming.items}
          now={now}
          onSelect={setSelected}
          onSelectDay={openDay}
          emptyMessage="Aucune séance dans les 30 prochains jours."
        />
      )}

      {selected && <SessionDetail session={selected} onClose={closeDetail} />}
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-8 w-8 rounded-md text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}

function SyncStatus({ syncedAt }: { syncedAt?: string }) {
  if (!syncedAt) return null;
  return <span className="text-xs text-zinc-500">Synchronisé à {formatFr(syncedAt, "HH:mm")}</span>;
}
