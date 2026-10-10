"use client";

import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { TaskEntry } from "@/lib/tasks";
import { reminderStatus } from "@/lib/reminders";
import { useGroups } from "@/components/groups/GroupsContext";
import { useTargetReminders } from "@/components/reminders/RemindersContext";
import { formatDue } from "@/components/items/format";
import { doneSummary } from "@/lib/groups";

type Props = {
  entry: TaskEntry;
  now: number;
  today: string;
  selected: boolean;
  /** Dans une liste intelligente, on rappelle de quelle liste vient la tâche. */
  showList: boolean;
  showMyDay: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onToggleImportant: () => void;
};

/** Une tâche sur une ligne : case ronde, titre, petites infos, étoile. Tout le reste est dans le détail. */
export function TaskRow({ entry, now, today, selected, showList, showMyDay, onOpen, onToggleDone, onToggleImportant }: Props) {
  const { item, list } = entry;
  const { groups } = useGroups();
  const { reminders } = useTargetReminders("todo", item.id);
  const pendingReminders = reminders.filter((r) => reminderStatus(r, now) === "pending" && !r.muted).length;
  const overdue = !item.done && item.dueAt !== null && Date.parse(item.dueAt) < now;
  const group = groups.find((g) => g.id === list.groupId);
  const shared = group ? doneSummary(item.doneBy, group.members) : null;

  const meta: React.ReactNode[] = [];
  if (showList) {
    meta.push(
      <span key="list" className="inline-flex items-center gap-1">
        {list.courseKey && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: courseColor(list.courseKey) }} aria-hidden />}
        {list.title}
      </span>,
    );
  }
  if (item.courseName) {
    meta.push(
      <span key="course" className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: courseColor(item.courseName) }} aria-hidden />
        {parseCourseTitle(item.courseName).course}
      </span>,
    );
  }
  if (showMyDay && item.myDay === today) meta.push(<span key="day">☀ Ma journée</span>);
  if (item.dueAt) {
    meta.push(
      <span key="due" className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>
        ▦ {formatDue(item.dueAt)}
        {overdue && " · en retard"}
      </span>,
    );
  }
  if (pendingReminders > 0) meta.push(<span key="rem">🔔 {pendingReminders}</span>);
  if (shared) {
    meta.push(
      <span key="shared" className="text-violet-600 dark:text-violet-400" title={shared.names.length ? `Fait par : ${shared.names.join(", ")}` : undefined}>
        👥 ✓ {shared.done}/{shared.total}
      </span>,
    );
  }

  return (
    <li>
      {/* La ligne entière ouvre le détail ; la case et l'étoile ont leur propre action. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
        aria-current={selected ? "true" : undefined}
        className={`group flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-900 dark:hover:bg-zinc-800/70 ${
          selected ? "border-blue-500" : "border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), onToggleDone())}
          aria-label={item.done ? `Marquer « ${item.title} » comme à faire` : `Marquer « ${item.title} » comme faite`}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
            item.done ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-400 hover:border-blue-600 dark:border-zinc-500"
          }`}
        >
          {item.done && (
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`break-words text-[15px] ${item.done ? "text-zinc-400 line-through" : ""}`}>{item.title}</p>
          {meta.length > 0 && <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">{meta}</p>}
        </div>
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), onToggleImportant())}
          aria-pressed={item.important}
          aria-label={item.important ? "Retirer de Important" : "Marquer comme importante"}
          className={`shrink-0 px-1 text-lg leading-none ${item.important ? "text-amber-500" : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600"}`}
        >
          {item.important ? "★" : "☆"}
        </button>
      </div>
    </li>
  );
}
