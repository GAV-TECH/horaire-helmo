"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { fromDayKey, groupByDay, shiftDay, weekDays } from "@/lib/calendar";
import { markChangesSeen } from "@/lib/actions/sessions";
import type { Deadline, Note, TodoList } from "@/lib/data/types";
import type { StoredSession } from "@/lib/ics/types";
import { attachToSessions } from "@/lib/sessions/attach";
import type { SyncResult } from "@/lib/sync-types";
import { dayKey, formatFr } from "@/lib/time";
import { buttonClass } from "@/components/ui";
import { DayList } from "./DayList";
import { SessionDetail } from "./SessionDetail";
import { changeBadge } from "./SessionBlock";
import { TimeGrid } from "./TimeGrid";

type View = "day" | "week" | "upcoming";

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "upcoming", label: "À venir" },
];
const UPCOMING_DAYS = 30;

type Props = {
  sessions: StoredSession[];
  notes: Note[];
  deadlines: Deadline[];
  lists: TodoList[];
  sync: SyncResult;
  /** Viennent du serveur (heure de la requête) pour que les rendus serveur et navigateur coïncident. */
  initialDay: string;
  initialNow: number;
};

/** Composant client principal de l'horaire : vues, navigation, panneau de détail. */
export function ScheduleApp({ sessions, notes, deadlines, lists, sync, initialDay, initialNow }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(initialDay);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [markingAll, startMarkAll] = useTransition();

  // Horloge : fait avancer la ligne "maintenant" chaque minute.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  /** Bouton "Actualiser" : la route API synchronise, puis router.refresh() relit les données du serveur. */
  const refresh = () =>
    startRefresh(async () => {
      const res = await fetch("/api/schedule/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Partial<SyncResult>;
      setRefreshError(res.ok ? null : (body.error ?? "La synchronisation a échoué."));
      router.refresh();
    });

  const closeDetail = useCallback(() => setSelectedKey(null), []);
  const openDay = useCallback((day: string) => {
    setAnchor(day);
    setView("day");
  }, []);

  // Rattache notes et tâches à leur séance (UID, sinon cours + heure de début).
  const notesBySession = useMemo(() => attachToSessions(notes, (n) => n, sessions).bySession, [notes, sessions]);
  const noteCounts = useMemo(() => new Map([...notesBySession].map(([k, v]) => [k, v.length])), [notesBySession]);
  const tasksBySession = useMemo(
    () =>
      attachToSessions(
        lists.filter((l) => l.scope === "session"),
        (l) => (l.sessionKey && l.courseKey && l.sessionStart ? { sessionKey: l.sessionKey, courseKey: l.courseKey, sessionStart: l.sessionStart } : null),
        sessions,
      ).bySession,
    [lists, sessions],
  );

  const openDeadlines = useMemo(() => deadlines.filter((d) => !d.doneAt), [deadlines]);
  const changed = sessions.filter((s) => changeBadge(s) !== null);
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
    const dls = openDeadlines.filter((d) => Date.parse(d.dueAt) > now && Date.parse(d.dueAt) < until);
    return { days, items, deadlines: dls };
  }, [sessions, openDeadlines, today, now]);

  const selected = selectedKey ? sessions.find((s) => s.key === selectedKey) : undefined;
  const step = view === "week" ? 7 : 1;
  const title =
    view === "week"
      ? `${formatFr(fromDayKey(week[0]), "d MMM")} – ${formatFr(fromDayKey(week[week.length - 1]), "d MMM yyyy")}`
      : view === "day"
        ? formatFr(fromDayKey(anchor), "EEEE d MMMM yyyy")
        : `Les ${UPCOMING_DAYS} prochains jours`;
  const common = { deadlines: openDeadlines, noteCounts, now, onSelect: (s: StoredSession) => setSelectedKey(s.key) };

  if (sync.status === "no-source") {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-bold">Bienvenue !</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Pour commencer, ajoute le lien de ton horaire HELMO.</p>
        <Link href="/parametres" className={`${buttonClass.primary} mt-4`}>
          Ajouter mon lien d&apos;horaire
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Mon horaire</h1>
        {sync.syncedAt && <span className="text-xs text-zinc-500">Synchronisé à {formatFr(sync.syncedAt, "HH:mm")}</span>}
        <button type="button" onClick={refresh} disabled={refreshing} className={buttonClass.secondary}>
          {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </header>

      {(refreshError ?? sync.error) && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {refreshError ?? sync.error}{" "}
          <Link href="/parametres" className="underline">
            Vérifier le lien
          </Link>
        </p>
      )}

      {changed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
          <span className="mr-auto">
            {changed.length === 1 ? "1 séance a changé" : `${changed.length} séances ont changé`} depuis ta dernière visite.
          </span>
          {changed.length <= 3 &&
            changed.map((s) => (
              <button key={s.key} type="button" onClick={() => setSelectedKey(s.key)} className="underline">
                {s.title} ({formatFr(s.start, "EEE d")})
              </button>
            ))}
          <button
            type="button"
            disabled={markingAll}
            onClick={() => startMarkAll(async () => void (await markChangesSeen()))}
            className={buttonClass.secondary}
          >
            Tout marquer comme vu
          </button>
        </div>
      )}

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
            <NavButton label={view === "week" ? "Semaine précédente" : "Jour précédent"} onClick={() => setAnchor(shiftDay(anchor, -step))}>
              ‹
            </NavButton>
            <button type="button" onClick={() => setAnchor(today)} className="rounded-md px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
              Aujourd&apos;hui
            </button>
            <NavButton label={view === "week" ? "Semaine suivante" : "Jour suivant"} onClick={() => setAnchor(shiftDay(anchor, step))}>
              ›
            </NavButton>
          </div>
        )}
        <p className="w-full text-sm font-medium capitalize text-zinc-600 dark:text-zinc-400 sm:ml-auto sm:w-auto">{title}</p>
      </nav>

      {view === "week" && (
        <>
          <div className="md:hidden">
            <DayList days={week} sessions={sessions} onSelectDay={openDay} showEmptyDays {...common} />
          </div>
          <div className="hidden md:block">
            <TimeGrid days={week} sessions={sessions} onSelectDay={openDay} {...common} />
          </div>
        </>
      )}
      {view === "day" && <TimeGrid days={[anchor]} sessions={sessions} {...common} />}
      {view === "upcoming" && (
        <DayList
          days={upcoming.days}
          sessions={upcoming.items}
          onSelectDay={openDay}
          emptyMessage="Rien de prévu dans les 30 prochains jours."
          {...common}
          deadlines={upcoming.deadlines}
        />
      )}

      {selected && (
        <SessionDetail
          session={selected}
          notes={notesBySession.get(selected.key) ?? []}
          tasks={(tasksBySession.get(selected.key) ?? []).flatMap((l) => l.items)}
          courseDeadlines={openDeadlines.filter((d) => d.courseKey === selected.courseKey && Date.parse(d.dueAt) > now)}
          now={now}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="h-8 w-8 rounded-md text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-900">
      {children}
    </button>
  );
}
