"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { quickAddTask, renameTodoItem, setTodoDue, setTodoImportant, setTodoMyDay } from "@/lib/actions/tasks";
import { deleteTodoItem, setTodoDone } from "@/lib/actions/todos";
import { courseColor } from "@/lib/courses";
import type { Course, TodoList } from "@/lib/data/types";
import {
  PLANNED_LABELS,
  SMART_VIEWS,
  flattenTasks,
  isSmartView,
  plannedGroup,
  sortTasks,
  tasksForView,
  type PlannedGroup,
  type TaskEntry,
} from "@/lib/tasks";
import { brusselsToIso, dayKey } from "@/lib/time";
import { formatSessionDate } from "@/components/items/format";
import { useGroups } from "@/components/groups/GroupsContext";
import { ListMenu } from "./ListHeader";
import { NewListForm } from "./NewListForm";
import { TaskDetail } from "./TaskDetail";
import { TaskRow } from "./TaskRow";
import { applyTaskPatch, type TaskPatch } from "./optimistic";

type Props = { lists: TodoList[]; courses: Course[]; now: number };
/** Sur téléphone, un seul écran à la fois. */
type Screen = "lists" | "tasks" | "detail";

/**
 * Page Tâches façon Microsoft To Do : listes à gauche, tâches au centre, détail à droite.
 * Les clics (cocher, étoile, Ma journée, échéance) s'affichent immédiatement grâce à
 * useOptimistic, puis la server action enregistre et la page se recale sur le serveur.
 */
export function TasksApp({ lists: serverLists, courses, now }: Props) {
  const { groups } = useGroups();
  const [lists, applyOptimistic] = useOptimistic(serverLists, applyTaskPatch);
  const [, startTransition] = useTransition();
  const [view, setView] = useState<string>("jour");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("tasks");
  const [showDone, setShowDone] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const today = dayKey(now);

  const entries = useMemo(() => flattenTasks(lists), [lists]);
  const visible = useMemo(() => tasksForView(entries, view, today), [entries, view, today]);
  const open = sortTasks(visible.filter((e) => !e.item.done));
  const done = visible.filter((e) => e.item.done);
  const selected = entries.find((e) => e.item.id === selectedId) ?? null;
  const currentList = isSmartView(view) ? null : lists.find((l) => l.id === view) ?? null;
  const smart = SMART_VIEWS.find((v) => v.id === view);
  const hasSessionLists = lists.some((l) => l.scope === "session");
  const openCount = (v: string) => tasksForView(entries, v, today).filter((e) => !e.item.done).length;

  /** Affiche le changement tout de suite, puis l'enregistre ; en cas d'échec, React annule l'affichage. */
  const mutate = (patch: TaskPatch | null, action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      if (patch) applyOptimistic(patch);
      const r = await action();
      setError(r.ok ? null : r.error);
    });

  const toggleDone = (e: TaskEntry) => mutate({ itemId: e.item.id, changes: { done: !e.item.done } }, () => setTodoDone(e.item.id, !e.item.done));
  const toggleImportant = (e: TaskEntry) =>
    mutate({ itemId: e.item.id, changes: { important: !e.item.important } }, () => setTodoImportant(e.item.id, !e.item.important));
  const toggleMyDay = (e: TaskEntry) => {
    const on = e.item.myDay !== today;
    mutate({ itemId: e.item.id, changes: { myDay: on ? today : null } }, () => setTodoMyDay(e.item.id, on));
  };
  const setDue = (e: TaskEntry, date: string) =>
    mutate({ itemId: e.item.id, changes: { dueAt: date ? brusselsToIso(date, "23:59") : null } }, () => setTodoDue(e.item.id, date));
  const rename = (e: TaskEntry, title: string) => mutate({ itemId: e.item.id, changes: { title } }, () => renameTodoItem(e.item.id, title));
  const remove = (e: TaskEntry) => {
    setSelectedId(null);
    setScreen("tasks");
    mutate(null, () => deleteTodoItem(e.item.id));
  };

  const openView = (id: string) => {
    setView(id);
    setSelectedId(null);
    setShowDone(false);
    setScreen("tasks");
  };
  const openTask = (id: string) => {
    setSelectedId(id);
    setScreen("detail");
  };

  const addTask = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    mutate(null, () => quickAddTask(title, currentList ? "liste" : view, currentList?.id));
  };

  const privateLists = lists.filter((l) => l.groupId === null && l.scope !== "session");
  const sharedLists = lists.filter((l) => l.groupId !== null);
  const title = currentList?.title ?? smart?.name ?? "Tâches";
  const group = currentList?.groupId ? groups.find((g) => g.id === currentList.groupId) : null;

  // Regroupements de la liste centrale : par échéance (Planifié), par séance (Séances), sinon un seul bloc.
  const sections: { key: string; label?: string; tone?: string; items: TaskEntry[] }[] = (() => {
    if (view === "planifie") {
      const order: PlannedGroup[] = ["retard", "aujourdhui", "demain", "semaine", "plus-tard"];
      return order
        .map((g) => ({ key: g, label: PLANNED_LABELS[g], tone: g === "retard" ? "late" : undefined, items: open.filter((e) => plannedGroup(e.item.dueAt!, now) === g) }))
        .filter((s) => s.items.length > 0);
    }
    if (view === "seances") {
      const byList = new Map<string, TaskEntry[]>();
      for (const e of open) byList.set(e.list.id, [...(byList.get(e.list.id) ?? []), e]);
      return [...byList.values()]
        .sort((a, b) => (a[0].list.sessionStart ?? "").localeCompare(b[0].list.sessionStart ?? ""))
        .map((items) => ({
          key: items[0].list.id,
          label: `${items[0].list.courseName ?? items[0].list.title}${items[0].list.sessionStart ? ` · ${formatSessionDate(items[0].list.sessionStart)}` : ""}`,
          items,
        }));
    }
    return [{ key: "all", items: open }];
  })();

  const emptyText =
    view === "jour"
      ? "Rien dans Ma journée. Ajoute une tâche ci-dessus, ou ouvre une tâche et choisis « Ajouter à Ma journée »."
      : view === "important"
        ? "Aucune tâche importante. Touche l'étoile d'une tâche pour la retrouver ici."
        : view === "planifie"
          ? "Aucune tâche avec une échéance."
          : view === "seances"
            ? "Aucune tâche liée à une séance. Ajoute-en depuis le détail d'une séance dans l'horaire."
            : "Aucune tâche à faire.";

  return (
    <div className="-mx-3 grid min-h-[calc(100dvh-8rem)] overflow-hidden border-zinc-200 bg-zinc-50 sm:-mx-6 md:mx-0 md:h-[calc(100dvh-7rem)] md:grid-cols-[15rem_minmax(0,1fr)_auto] md:rounded-xl md:border dark:border-zinc-800 dark:bg-zinc-950">
      {/* ---------- Listes ---------- */}
      <nav aria-label="Listes de tâches" className={`${screen === "lists" ? "flex" : "hidden"} flex-col gap-0.5 overflow-y-auto border-zinc-200 bg-zinc-100/70 p-2.5 md:flex md:border-r dark:border-zinc-800 dark:bg-zinc-900/40`}>
        {SMART_VIEWS.filter((v) => v.id !== "seances" || hasSessionLists).map((v) => (
          <NavItem key={v.id} active={view === v.id} onClick={() => openView(v.id)} icon={v.icon} label={v.name} count={openCount(v.id)} />
        ))}
        {privateLists.length > 0 && <NavTitle>Mes listes</NavTitle>}
        {privateLists.map((l) => (
          <NavItem key={l.id} active={view === l.id} onClick={() => openView(l.id)} icon={<ListDot list={l} />} label={l.title} count={openCount(l.id)} />
        ))}
        {sharedLists.length > 0 && <NavTitle>Partagées</NavTitle>}
        {sharedLists.map((l) => (
          <NavItem key={l.id} active={view === l.id} onClick={() => openView(l.id)} icon={<ListDot list={l} />} label={l.title} count={openCount(l.id)} badge="👥" />
        ))}
        <div className="mt-auto pt-3">
          {creatingList ? (
            <NewListForm
              courses={courses}
              onCreated={(id) => {
                setCreatingList(false);
                openView(id);
              }}
              onCancel={() => setCreatingList(false)}
            />
          ) : (
            <button type="button" onClick={() => setCreatingList(true)} className="w-full rounded-md px-2.5 py-2 text-left text-sm text-blue-600 hover:bg-zinc-200/60 dark:text-blue-400 dark:hover:bg-zinc-800">
              ＋ Nouvelle liste
            </button>
          )}
        </div>
      </nav>

      {/* ---------- Tâches ---------- */}
      <section className={`${screen === "tasks" ? "flex" : "hidden"} min-w-0 flex-col md:flex`}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-4 md:px-6 md:pt-5">
          <button type="button" onClick={() => setScreen("lists")} className="w-full text-left text-sm text-blue-600 md:hidden">
            ‹ Listes
          </button>
          <h1 className="mr-auto text-2xl font-bold tracking-tight">{title}</h1>
          {currentList && <ListMenu list={currentList} onDeleted={() => openView("jour")} />}
          <p className="w-full text-sm text-zinc-500">
            {view === "jour" && new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels" }).format(now)}
            {currentList?.courseName && currentList.scope === "course" && currentList.courseName}
            {group && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                👥 {group.name} · {group.members.length} membres
              </span>
            )}
          </p>
        </header>

        {view !== "seances" && (
          <form onSubmit={addTask} className="mx-4 mb-2 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 focus-within:border-blue-500 md:mx-6 dark:border-zinc-800 dark:bg-zinc-900">
            <span aria-hidden className="text-xl leading-none text-blue-600 dark:text-blue-400">
              ＋
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder={currentList || view === "toutes" ? "Ajouter une tâche" : `Ajouter une tâche à « ${title} »`}
              aria-label="Ajouter une tâche"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] focus:outline-none"
            />
          </form>
        )}
        {error && (
          <p role="alert" className="mx-4 mb-2 text-sm text-red-600 md:mx-6 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-6 md:px-6">
          {open.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">{emptyText}</p>}
          {sections.map((s) => (
            <div key={s.key}>
              {s.label && (
                <h2 className={`px-0.5 pb-1.5 pt-3 text-sm font-semibold ${s.tone === "late" ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                  {s.label} · {s.items.length}
                </h2>
              )}
              <ul className="flex flex-col gap-1.5">
                {s.items.map((e) => (
                  <TaskRow
                    key={e.item.id}
                    entry={e}
                    now={now}
                    today={today}
                    selected={e.item.id === selectedId}
                    showList={!currentList && view !== "seances"}
                    showMyDay={view !== "jour"}
                    onOpen={() => openTask(e.item.id)}
                    onToggleDone={() => toggleDone(e)}
                    onToggleImportant={() => toggleImportant(e)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {done.length > 0 && (
            <div className="pt-3">
              <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="px-0.5 pb-1.5 text-sm font-semibold text-zinc-500">
                {showDone ? "▾" : "▸"} Terminées · {done.length}
              </button>
              {showDone && (
                <ul className="flex flex-col gap-1.5">
                  {done.map((e) => (
                    <TaskRow
                      key={e.item.id}
                      entry={e}
                      now={now}
                      today={today}
                      selected={e.item.id === selectedId}
                      showList={!currentList}
                      showMyDay={false}
                      onOpen={() => openTask(e.item.id)}
                      onToggleDone={() => toggleDone(e)}
                      onToggleImportant={() => toggleImportant(e)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Détail ---------- */}
      {selected && (
        <div className={`${screen === "detail" ? "block" : "hidden"} min-h-0 border-zinc-200 md:block md:w-[22rem] md:border-l dark:border-zinc-800`}>
          <TaskDetail
            entry={selected}
            today={today}
            error={error}
            onClose={() => {
              setSelectedId(null);
              setScreen("tasks");
            }}
            onToggleDone={() => toggleDone(selected)}
            onToggleImportant={() => toggleImportant(selected)}
            onToggleMyDay={() => toggleMyDay(selected)}
            onSetDue={(date) => setDue(selected, date)}
            onRename={(t) => rename(selected, t)}
            onDelete={() => remove(selected)}
          />
        </div>
      )}
    </div>
  );
}

function NavTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>;
}

function NavItem(props: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; badge?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
        props.active ? "bg-white font-semibold shadow-sm dark:bg-zinc-800" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
      }`}
    >
      <span className="grid w-5 place-items-center text-zinc-500" aria-hidden>
        {props.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.badge && <span aria-label="partagée">{props.badge}</span>}
      {props.count > 0 && <span className="text-xs tabular-nums text-zinc-500">{props.count}</span>}
    </button>
  );
}

function ListDot({ list }: { list: TodoList }) {
  if (!list.courseKey) return <span>☰</span>;
  return <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: courseColor(list.courseKey) }} />;
}
