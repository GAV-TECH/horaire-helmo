"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectMessage, TodoList } from "@/lib/data/types";
import { projectProgress } from "@/lib/projects";
import { ProjectChat } from "./ProjectChat";
import { flattenTasks, groupTasksByDay, sortTasks, splitOverdue } from "@/lib/tasks";
import { dayKey } from "@/lib/time";
import { SharedBadge } from "@/components/groups/share";
import { useGroups } from "@/components/groups/GroupsContext";
import { ListMenu } from "@/components/tasks/ListHeader";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useTaskMutations } from "@/components/tasks/useTaskMutations";

/** Page d'un projet : ses tâches (avec échéances et rappels), leur avancement, et le détail de la tâche ouverte. */
export function ProjectView({ project: serverProject, messages, now }: { project: TodoList; messages: ProjectMessage[] | null; now: number }) {
  const router = useRouter();
  const today = dayKey(now);
  const { groups } = useGroups();
  const { lists, error, toggleDone, toggleImportant, toggleMyDay, setDue, rename, remove, add } = useTaskMutations([serverProject], today);
  const project = lists[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState("");

  const entries = flattenTasks(lists);
  const open = sortTasks(entries.filter((e) => !e.item.done));
  const { overdue, rest } = splitOverdue(open, today); // en retard = échéance avant aujourd'hui
  const done = entries.filter((e) => e.item.done);
  const selected = entries.find((e) => e.item.id === selectedId) ?? null;
  const { done: doneCount, total, percent } = projectProgress(project);
  const group = groups.find((g) => g.id === project.groupId);

  const row = (e: (typeof entries)[number]) => (
    <TaskRow
      key={e.item.id}
      entry={e}
      now={now}
      today={today}
      selected={e.item.id === selectedId}
      showList={false}
      showMyDay
      onOpen={() => setSelectedId(e.item.id)}
      onToggleDone={() => toggleDone(e)}
      onToggleImportant={() => toggleImportant(e)}
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      <div className={`min-w-0 flex-1 ${selected ? "hidden md:block" : ""}`}>
        <Link href="/projets" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ‹ Projets
        </Link>
        <header className="mb-4 mt-2 flex items-start gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
              {project.courseName && <span>{project.courseName}</span>}
              <SharedBadge groupId={project.groupId} ownerId={project.ownerId} />
              {group && <span>· {group.members.length} membres</span>}
            </p>
          </div>
          <ListMenu list={project} onDeleted={() => router.push("/projets")} />
        </header>

        <div className="mb-5">
          <div className="mb-1 flex justify-between text-sm text-zinc-500">
            <span>
              {doneCount}/{total} tâche{total > 1 ? "s" : ""} faite{doneCount > 1 ? "s" : ""}
            </span>
            <span className="tabular-nums">{percent} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du projet">
            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            const title = draft.trim();
            if (!title) return;
            setDraft("");
            add(title, "liste", project.id);
          }}
          className="mb-3 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 focus-within:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span aria-hidden className="text-xl leading-none text-blue-600 dark:text-blue-400">
            ＋
          </span>
          <input
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            maxLength={300}
            placeholder="Ajouter une tâche au projet (puis ouvre-la pour lui donner une échéance)"
            aria-label="Ajouter une tâche au projet"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] focus:outline-none"
          />
        </form>
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {open.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{total === 0 ? "Aucune tâche : ajoute la première ci-dessus." : "Tout est fait ✓"}</p>}
        {overdue.length > 0 && (
          <>
            <h2 className="pb-1.5 pt-1 text-sm font-semibold text-red-600 dark:text-red-400">En retard · {overdue.length}</h2>
            <ul className="mb-3 flex flex-col gap-1.5">{overdue.map(row)}</ul>
          </>
        )}
        {groupTasksByDay(rest, today).map((s) => (
          <div key={s.key} className="mb-3">
            <h2 className="pb-1.5 text-sm font-semibold text-zinc-500">
              {s.label} · {s.items.length}
            </h2>
            <ul className="flex flex-col gap-1.5">{s.items.map(row)}</ul>
          </div>
        ))}

        {done.length > 0 && (
          <div className="pt-3">
            <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="pb-1.5 text-sm font-semibold text-zinc-500">
              {showDone ? "▾" : "▸"} Terminées · {done.length}
            </button>
            {showDone && <ul className="flex flex-col gap-1.5">{done.map(row)}</ul>}
          </div>
        )}

        {/* null = table absente (migration 0008 pas encore exécutée) : pas de discussion. */}
        {messages && <ProjectChat projectId={project.id} messages={messages} />}
      </div>

      {selected && (
        <div className="w-full shrink-0 overflow-hidden rounded-xl border border-zinc-200 md:sticky md:top-16 md:h-[calc(100dvh-6rem)] md:w-[22rem] dark:border-zinc-800">
          <TaskDetail
            entry={selected}
            today={today}
            error={error}
            onClose={() => setSelectedId(null)}
            onToggleDone={() => toggleDone(selected)}
            onToggleImportant={() => toggleImportant(selected)}
            onToggleMyDay={() => toggleMyDay(selected)}
            onSetDue={(date) => setDue(selected, date)}
            onRename={(t) => rename(selected, t)}
            onDelete={() => {
              setSelectedId(null);
              remove(selected);
            }}
          />
        </div>
      )}
    </div>
  );
}
