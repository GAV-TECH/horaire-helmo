"use client";

import { useState, useTransition } from "react";
import { addTodoItem, createTodoList, deleteTodoList } from "@/lib/actions/todos";
import { courseColor } from "@/lib/courses";
import type { Course, TodoList, TodoScope } from "@/lib/data/types";
import { TodoItemRow } from "@/components/items/TodoItemRow";
import { formatSessionDate } from "@/components/items/format";
import { ActionMessage, ErrorText, Field, PageTitle, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

const GROUPS: { scope: TodoScope; title: string }[] = [
  { scope: "global", title: "Listes générales" },
  { scope: "course", title: "Par cours" },
  { scope: "session", title: "Liées à une séance" },
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
      {GROUPS.map(({ scope, title }) => {
        const group = lists.filter((l) => l.scope === scope);
        if (group.length === 0) return null;
        return (
          <section key={scope} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-500">{title}</h2>
            {group.map((list) => (
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
          <input name="title" required maxLength={200} placeholder="Révisions, courses…" className={inputClass} />
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
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={`${buttonClass.primary} self-start`}>
        Créer la liste
      </button>
    </form>
  );
}

function ListCard({ list, now }: { list: TodoList; now: number }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const add = useFormAction(addTodoItem, { reset: true });
  const remaining = list.items.filter((i) => !i.done).length;

  const remove = () =>
    startTransition(async () => {
      const r = await deleteTodoList(list.id);
      setError(r.ok ? null : r.error);
    });

  return (
    <article
      className={`${cardClass} border-l-4`}
      style={{ borderLeftColor: list.courseKey ? courseColor(list.courseKey) : undefined }}
    >
      <header className="mb-2 flex items-start gap-2">
        <div className="mr-auto">
          <h3 className="font-semibold">{list.title}</h3>
          <p className="text-xs text-zinc-500">
            {list.scope === "course" && list.courseName}
            {list.scope === "session" && list.sessionStart && `Séance du ${formatSessionDate(list.sessionStart)}`}
            {list.items.length > 0 && `${list.scope !== "global" ? " · " : ""}${remaining} à faire sur ${list.items.length}`}
          </p>
        </div>
        {confirmDelete ? (
          <span className="flex gap-1">
            <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.ghost} text-red-600`}>
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
        )}
      </header>
      <ErrorText>{error}</ErrorText>

      {list.items.length > 0 && (
        <ul className="mb-2">
          {list.items.map((item) => (
            <TodoItemRow key={item.id} item={item} now={now} />
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
