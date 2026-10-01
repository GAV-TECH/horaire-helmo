"use client";

import { useMemo, useState } from "react";
import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { Course, TodoList } from "@/lib/data/types";
import {
  SMART_VIEWS,
  dayLabel,
  flattenTasks,
  groupTasksByDay,
  isSmartView,
  jourSection,
  nextTaskDay,
  splitOverdue,
  sortTasks,
  tasksForView,
  type TaskEntry,
} from "@/lib/tasks";
import { dayKey } from "@/lib/time";
import { formatSessionDate } from "@/components/items/format";
import { useGroups, useMemberName } from "@/components/groups/GroupsContext";
import { ListMenu } from "./ListHeader";
import { NewListForm } from "./NewListForm";
import { ShareAll } from "./ShareAll";
import { TaskDetail } from "./TaskDetail";
import { TaskRow } from "./TaskRow";
import { useTaskMutations } from "./useTaskMutations";

type Props = { lists: TodoList[]; courses: Course[]; now: number };
/** Sur téléphone, un seul écran à la fois. */
type Screen = "lists" | "tasks" | "detail";

/**
 * Page Tâches façon Microsoft To Do : listes à gauche, tâches au centre, détail à droite.
 * Les clics (cocher, étoile, Ma journée, échéance) s'affichent immédiatement grâce à
 * useOptimistic, puis la server action enregistre et la page se recale sur le serveur.
 */
export function TasksApp({ lists: serverLists, courses, now }: Props) {
  const { groups, me, shares } = useGroups();
  const memberName = useMemberName();
  const today = dayKey(now);
  const { lists, error, toggleDone, toggleImportant, toggleMyDay, setDue, rename, remove: removeTask, add } = useTaskMutations(serverLists, today);
  const [view, setView] = useState<string>("jour");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("tasks");
  const [showDone, setShowDone] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [draft, setDraft] = useState("");

  const entries = useMemo(() => flattenTasks(lists), [lists]);
  const visible = useMemo(() => tasksForView(entries, view, today), [entries, view, today]);
  const open = sortTasks(visible.filter((e) => !e.item.done));
  const done = visible.filter((e) => e.item.done);
  const selected = entries.find((e) => e.item.id === selectedId) ?? null;
  const currentList = isSmartView(view) ? null : lists.find((l) => l.id === view) ?? null;
  const smart = SMART_VIEWS.find((v) => v.id === view);
  const hasSessionLists = lists.some((l) => l.scope === "session");
  const openCount = (v: string) => tasksForView(entries, v, today).filter((e) => !e.item.done).length;

  const remove = (e: TaskEntry) => {
    setSelectedId(null);
    setScreen("tasks");
    removeTask(e);
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
    add(title, view, currentList?.id);
  };

  // « Mes listes » = les miennes (👥 si partagées) ; « Partagées avec moi » = celles des autres.
  // Les listes de séance n'apparaissent que dans la vue Séances (il y en a une par séance).
  const isPlainList = (l: TodoList) => l.scope !== "session" && l.scope !== "project";
  const privateLists = lists.filter((l) => isPlainList(l) && l.ownerId === me);
  const sharedLists = lists.filter((l) => isPlainList(l) && l.ownerId !== me);
  // Une de mes listes est partagée : avec un groupe, ou avec un étudiant (elle seule, ou toutes mes tâches).
  const sharesAll = shares.some((s) => s.ownerId === me && s.listId === null);
  // Nom du propriétaire d'une liste partagée avec moi (deux listes « Tâches » restent distinguables).
  const ownerName = (userId: string) => shares.find((s) => s.ownerId === userId)?.ownerName ?? memberName(userId);
  const isShared = (l: TodoList) => l.groupId !== null || sharesAll || shares.some((s) => s.listId === l.id);
  const projects = lists.filter((l) => l.scope === "project");
  const title = currentList?.title ?? smart?.name ?? "Tâches";
  const group = currentList?.groupId ? groups.find((g) => g.id === currentList.groupId) : null;

  // Sections de la liste centrale. Dans TOUTES les vues, les tâches en retard (échéance avant
  // aujourd'hui) sont séparées en haut ; le reste est regroupé par jour d'échéance
  // (sauf Ma journée : aujourd'hui + prochain jour chargé, et Séances : par séance).
  const nextDay = nextTaskDay(entries, today);
  const sections: { key: string; label?: string; tone?: string; items: TaskEntry[] }[] = (() => {
    const { overdue, rest } = splitOverdue(open, today);
    const late = { key: "retard", label: "En retard", tone: "late", items: overdue };
    let others: { key: string; label?: string; items: TaskEntry[] }[];
    if (view === "jour") {
      others = [
        { key: "aujourdhui", label: "Aujourd'hui", items: rest.filter((e) => jourSection(e, today, nextDay) === "aujourdhui") },
        {
          key: "prochain",
          label: nextDay ? `Pour ${dayLabel(nextDay, today).toLowerCase()}` : undefined, // "Pour demain", "Pour jeudi 9 octobre"…
          items: rest.filter((e) => jourSection(e, today, nextDay) === "prochain"),
        },
      ];
    } else if (view === "seances") {
      const byList = new Map<string, TaskEntry[]>();
      for (const e of rest) byList.set(e.list.id, [...(byList.get(e.list.id) ?? []), e]);
      others = [...byList.values()]
        .sort((a, b) => (a[0].list.sessionStart ?? "").localeCompare(b[0].list.sessionStart ?? ""))
        .map((items) => ({
          key: items[0].list.id,
          label: `${items[0].list.courseName ? parseCourseTitle(items[0].list.courseName).course : items[0].list.title}${items[0].list.sessionStart ? ` · ${formatSessionDate(items[0].list.sessionStart)}` : ""}`,
          items,
        }));
    } else {
      others = groupTasksByDay(rest, today);
    }
    return [late, ...others].filter((s) => s.items.length > 0);
  })();

  const emptyText =
    view === "jour"
      ? "Rien de prévu. Les tâches d'aujourd'hui et celles du prochain jour qui en a (demain, sinon le jour d'après…) apparaissent ici toutes seules ; tu peux aussi en ajouter ci-dessus."
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
          <NavItem key={l.id} active={view === l.id} onClick={() => openView(l.id)} icon={<ListDot list={l} />} label={l.title} count={openCount(l.id)} badge={isShared(l) ? "👥" : undefined} />
        ))}
        {sharedLists.length > 0 && <NavTitle>Partagées avec moi</NavTitle>}
        {sharedLists.map((l) => (
          <NavItem key={l.id} active={view === l.id} onClick={() => openView(l.id)} icon={<ListDot list={l} />} label={`${l.title} · ${ownerName(l.ownerId)}`} count={openCount(l.id)} badge="👥" />
        ))}
        {projects.length > 0 && <NavTitle>Projets</NavTitle>}
        {projects.map((l) => (
          <NavItem key={l.id} active={view === l.id} onClick={() => openView(l.id)} icon="◆" label={l.title} count={openCount(l.id)} badge={l.groupId ? "👥" : undefined} />
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

        {view === "toutes" && <ShareAll />}
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
