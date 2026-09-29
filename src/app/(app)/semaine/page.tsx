import Link from "next/link";
import { DeadlineRow } from "@/components/items/DeadlineRow";
import { TodoItemRow } from "@/components/items/TodoItemRow";
import { changeBadge, timeRange } from "@/components/schedule/SessionBlock";
import { PageTitle, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fromDayKey, groupByDate, groupByDay, shiftDay, weekDays } from "@/lib/calendar";
import { courseColor } from "@/lib/courses";
import { loadDeadlines, loadSessions, loadTodoLists } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";
import { dayKey, formatFr } from "@/lib/time";

export const metadata = { title: "Cette semaine · Horaire HELMO" };

/** Vue "Cette semaine" : séances, deadlines et tâches à échéance, jour par jour. */
export default async function SemainePage({ searchParams }: PageProps<"/semaine">) {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const { d } = await searchParams;
  const anchor = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dayKey(now);
  const days = weekDays(anchor);
  const weekStart = fromDayKey(days[0]);
  weekStart.setHours(0, 0, 0, 0);

  const [sessions, deadlines, lists] = await Promise.all([
    loadSessions(supabase, user.id, weekStart.toISOString()),
    loadDeadlines(supabase, user.id),
    loadTodoLists(supabase, user.id),
  ]);

  // Toutes les tâches, avec le nom de leur liste pour savoir d'où elles viennent.
  const tasks = lists.flatMap((l) => l.items.map((item) => ({ item, listTitle: l.title })));
  const openDeadlines = deadlines.filter((dl) => !dl.doneAt);
  const inWeek = (iso: string) => days.includes(dayKey(iso));

  const sessionsByDay = groupByDay(sessions);
  const deadlinesByDay = groupByDate(deadlines.filter((dl) => inWeek(dl.dueAt)), (dl) => dl.dueAt);
  const tasksByDay = groupByDate(tasks.filter((t) => t.item.dueAt && inWeek(t.item.dueAt)), (t) => t.item.dueAt);
  // "En retard" : non fait, échéance dépassée, et avant cette semaine (ceux de la semaine sont déjà affichés).
  const lateDeadlines = openDeadlines.filter((dl) => Date.parse(dl.dueAt) < now && dayKey(dl.dueAt) < days[0]);
  const lateTasks = tasks.filter((t) => !t.item.done && t.item.dueAt && Date.parse(t.item.dueAt) < now && dayKey(t.item.dueAt) < days[0]);
  const undated = tasks.filter((t) => !t.item.done && !t.item.dueAt).length;
  const today = dayKey(now);
  const visibleDays = days.filter((day, i) => i < 5 || sessionsByDay.has(day) || deadlinesByDay.has(day) || tasksByDay.has(day));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle
        aside={
          <div className="flex items-center gap-1 text-sm">
            <Link href={`/semaine?d=${shiftDay(anchor, -7)}`} className="h-8 w-8 rounded-md text-center text-lg leading-8 hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Semaine précédente">
              ‹
            </Link>
            <Link href="/semaine" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900">
              Cette semaine
            </Link>
            <Link href={`/semaine?d=${shiftDay(anchor, 7)}`} className="h-8 w-8 rounded-md text-center text-lg leading-8 hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Semaine suivante">
              ›
            </Link>
          </div>
        }
      >
        Semaine du {formatFr(fromDayKey(days[0]), "d MMMM")}
      </PageTitle>

      {(lateDeadlines.length > 0 || lateTasks.length > 0) && (
        <section className="rounded-lg border border-red-300 p-3 dark:border-red-900">
          <h2 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">En retard</h2>
          <ul className="flex flex-col gap-1.5">
            {lateDeadlines.map((dl) => (
              <DeadlineRow key={dl.id} deadline={dl} now={now} compact />
            ))}
            {lateTasks.map(({ item, listTitle }) => (
              <TodoItemRow key={item.id} item={item} subtitle={listTitle} now={now} />
            ))}
          </ul>
        </section>
      )}

      {visibleDays.map((day) => {
        const daySessions = sessionsByDay.get(day) ?? [];
        const dayDeadlines = deadlinesByDay.get(day) ?? [];
        const dayTasks = tasksByDay.get(day) ?? [];
        const empty = daySessions.length + dayDeadlines.length + dayTasks.length === 0;
        return (
          <section key={day} aria-labelledby={`w-${day}`}>
            <h2 id={`w-${day}`} className={`mb-2 text-sm font-semibold capitalize ${day === today ? "text-blue-600 dark:text-blue-400" : ""}`}>
              {formatFr(fromDayKey(day), "EEEE d MMMM")}
              {day === today && <span className="ml-2 text-xs font-normal normal-case">aujourd&apos;hui</span>}
            </h2>
            {empty && <p className="text-sm text-zinc-400">Rien de prévu</p>}
            <ul className="flex flex-col gap-1">
              {daySessions.map((s) => {
                const badge = changeBadge(s);
                return (
                  <li
                    key={s.key}
                    className={`flex items-baseline gap-2 border-l-4 py-0.5 pl-2 text-sm ${s.status === "cancelled" ? "text-zinc-400 line-through" : ""}`}
                    style={{ borderLeftColor: courseColor(s.courseKey) }}
                  >
                    <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">{timeRange(s)}</span>
                    <span className="font-medium">{s.title}</span>
                    {s.location && <span className="text-xs text-zinc-500">{s.location}</span>}
                    {badge && <span className="rounded bg-amber-500 px-1 text-[10px] font-semibold uppercase text-white no-underline">{badge}</span>}
                  </li>
                );
              })}
            </ul>
            {(dayDeadlines.length > 0 || dayTasks.length > 0) && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {dayDeadlines.map((dl) => (
                  <DeadlineRow key={dl.id} deadline={dl} now={now} compact />
                ))}
                {dayTasks.map(({ item, listTitle }) => (
                  <TodoItemRow key={item.id} item={item} subtitle={listTitle} now={now} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {undated > 0 && (
        <p className="text-sm text-zinc-500">
          + {undated} tâche{undated > 1 ? "s" : ""} sans échéance.{" "}
          <Link href="/taches" className={`${buttonClass.ghost} underline`}>
            Voir les tâches
          </Link>
        </p>
      )}
    </div>
  );
}
