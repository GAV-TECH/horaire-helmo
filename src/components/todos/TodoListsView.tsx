"use client";

import { useState, useTransition } from "react";
import { addTodoItem, createTodoList, deleteTodoList, setListGroup } from "@/lib/actions/todos";
import { courseColor } from "@/lib/courses";
import type { Course, TodoList } from "@/lib/data/types";
import { canEdit } from "@/lib/groups";
import { useGroups } from "@/components/groups/GroupsContext";
import { SharePicker, SharedBadge } from "@/components/groups/share";
import { TodoItemRow } from "@/components/items/TodoItemRow";
import { formatSessionDate } from "@/components/items/format";
import { ActionMessage, ErrorText, Field, PageTitle, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

/** Sections de la page : d'abord ce qui est partagé, puis les listes privées par type. */
const SECTIONS: { title: string; filter: (l: TodoList) => boolean }[] = [
  { title: "Partagées avec un groupe", filter: (l) => l.groupId !== null },
  { title: "Listes générales", filter: (l) => l.groupId === null && l.scope === "global" },
  { title: "Par cours", filter: (l) => l.groupId === null && l.scope === "course" },
  { title: "Liées à une séance", filter: (l) => l.scope === "session" },
];

export function TodoListsView({ lists, courses, now }: { lists: TodoList[]; courses: Course[]; now: number }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle>Tâches</PageTitle>
      <NewListForm courses={courses} />
      {lists.length === 0 && (
        <p className="text-sm text-zinc-500">
          Aucune liste pour l&apos;instant. Crée-en une ci-dessus, ou ajoute une tâche depuis une séance de l&apos;horaire.
        </p>
      )}
      {SECTIONS.map(({ title, filter }) => {
        const section = lists.filter(filter);
        if (section.length === 0) return null;
        return (
          <section key={title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-500">{title}</h2>
            {section.map((list) => (
              <ListCard key={list.id} list={list} now={now} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function NewListForm({ courses }: { courses: Course[] }) {
  const [scope, setScope] = useState<"global" | "course">("global");
  const { onSubmit, pending, result } = useFormAction(createTodoList, { reset: true });
  return (
    <form onSubmit={onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <h2 className="font-semibold">Nouvelle liste</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre">
          <input name="title" required maxLength={200} placeholder="Révisions, projet de groupe…" className={inputClass} />
        </Field>
        <Field label="Type">
          <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as "global" | "course")} className={inputClass}>
            <option value="global">Générale</option>
            <option value="course">Pour un cours</option>
          </select>
        </Field>
      </div>
      {scope === "course" && (
        <Field label="Cours">
          <input name="courseName" list="todo-courses" required maxLength={300} className={inputClass} />
          <datalist id="todo-courses">
            {courses.map((c) => (
              <option key={c.key} value={c.name} />
            ))}
          </datalist>
        </Field>
      )}
      <SharePicker />
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={`${buttonClass.primary} self-start`}>
        Créer la liste
      </button>
    </form>
  );
}

function ListCard({ list, now }: { list: TodoList; now: number }) {
  const { me, groups } = useGroups();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const add = useFormAction(addTodoItem, { reset: true });
  const remaining = list.items.filter((i) => !i.done).length;
  const editable = canEdit(list, me, groups); // auteur ou admin du groupe
  const isOwner = list.ownerId === me;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Erreur."));
    });

  return (
    <article className={`${cardClass} border-l-4`} style={{ borderLeftColor: list.courseKey ? courseColor(list.courseKey) : undefined }}>
      <header className="mb-2 flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h3 className="font-semibold">
            {list.title}
            <SharedBadge groupId={list.groupId} ownerId={list.ownerId} />
          </h3>
          <p className="text-xs text-zinc-500">
            {list.scope === "course" && list.courseName}
            {list.scope === "session" && list.sessionStart && `Séance du ${formatSessionDate(list.sessionStart)}`}
            {list.items.length > 0 && `${list.scope !== "global" ? " · " : ""}${remaining} à faire (pour moi) sur ${list.items.length}`}
          </p>
        </div>
        {/* Seul le propriétaire change le partage ; une liste de séance reste privée. */}
        {isOwner && list.scope !== "session" && groups.length > 0 && (
          <select
            value={list.groupId ?? ""}
            disabled={pending}
            onChange={(e) => run(() => setListGroup(list.id, e.target.value))}
            className={`${inputClass} w-auto py-1 text-xs`}
            aria-label="Partager la liste avec"
          >
            <option value="">Privée</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                👥 {g.name}
              </option>
            ))}
          </select>
        )}
        {editable &&
          (confirmDelete ? (
            <span className="flex gap-1">
              <button type="button" onClick={() => run(() => deleteTodoList(list.id))} disabled={pending} className={`${buttonClass.ghost} text-red-600`}>
                Supprimer la liste
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
                Annuler
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass.ghost} aria-label={`Supprimer la liste ${list.title}`}>
              ✕
            </button>
          ))}
      </header>
      <ErrorText>{error}</ErrorText>

      {list.items.length > 0 && (
        <ul className="mb-2">
          {list.items.map((item) => (
            <TodoItemRow key={item.id} item={item} now={now} groupId={list.groupId} canDelete={editable || item.authorId === me} />
          ))}
        </ul>
      )}

      <form onSubmit={add.onSubmit} className="flex flex-wrap gap-2">
        <input type="hidden" name="listId" value={list.id} />
        <input name="title" required maxLength={300} placeholder="Nouvelle tâche…" className={`${inputClass} min-w-40 flex-1`} aria-label="Nouvelle tâche" />
        <input name="dueDate" type="date" className={`${inputClass} w-auto`} aria-label="Échéance (facultatif)" title="Échéance (facultatif)" />
        <input name="dueTime" type="time" className={`${inputClass} w-auto`} aria-label="Heure d'échéance" />
        <button type="submit" disabled={add.pending} className={buttonClass.primary}>
          Ajouter
        </button>
      </form>
      <ActionMessage result={add.result} />
    </article>
  );
}
