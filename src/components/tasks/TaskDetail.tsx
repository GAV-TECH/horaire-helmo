"use client";

import { useState } from "react";
import { courseColor, sameCourse } from "@/lib/courses";
import type { TaskEntry } from "@/lib/tasks";
import { quickDueDates } from "@/lib/tasks";
import { canEdit } from "@/lib/groups";
import { isoToBrusselsInputs } from "@/lib/time";
import { useGroups } from "@/components/groups/GroupsContext";
import { ReminderControl } from "@/components/reminders/ReminderControl";
import { formatDue, formatSessionDate } from "@/components/items/format";
import { buttonClass, inputClass } from "@/components/styles";
import { TaskPeople } from "./TaskPeople";

type Props = {
  entry: TaskEntry;
  today: string;
  error: string | null;
  onClose: () => void;
  onToggleDone: () => void;
  onToggleImportant: () => void;
  onToggleMyDay: () => void;
  onSetDue: (date: string) => void;
  onRename: (title: string) => void;
  /** Cours proposés (ceux de l'horaire) et changement de cours ; absents = pas de choix de cours. */
  courses?: { key: string; name: string }[];
  onSetCourse?: (courseName: string) => void;
  onDelete: () => void;
};

/** Panneau de détail d'une tâche : à droite sur grand écran, plein écran sur téléphone. */
export function TaskDetail(props: Props) {
  const { entry, today, error, onClose, onToggleDone, onToggleImportant, onToggleMyDay, onSetDue, onRename, onDelete, courses = [], onSetCourse } = props;
  const { item, list } = entry;
  const { me, groups } = useGroups();
  const group = groups.find((g) => g.id === list.groupId);
  const canDelete = canEdit(list, me, groups) || item.authorId === me;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);
  // Tâche qu'on m'a confiée sans sa liste : je la coche, mais seul son auteur la modifie (RLS).
  const readOnly = list.virtual === true;
  const inMyDay = item.myDay === today;
  const dueDate = item.dueAt ? isoToBrusselsInputs(item.dueAt).date : null;
  // Cours de la tâche : celui choisi ici, sinon celui de sa liste (liste de cours ou de séance).
  const course = item.courseName ?? list.courseName ?? "";
  const known = courses.find((c) => sameCourse(c.name, course));

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-900" aria-label="Détail de la tâche">
      <button type="button" onClick={onClose} className="px-4 pt-3 text-left text-sm text-blue-600 md:hidden">
        ‹ {list.title}
      </button>

      <div className="flex items-start gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={item.done ? "Marquer comme à faire" : "Marquer comme faite"}
          className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
            item.done ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-400 hover:border-blue-600"
          }`}
        >
          {item.done && <span className="text-[10px] leading-none">✓</span>}
        </button>
        {/* key : si on ouvre une autre tâche, le champ repart de son titre */}
        <textarea
          key={item.id}
          defaultValue={item.title}
          readOnly={readOnly}
          rows={2}
          maxLength={300}
          aria-label="Titre de la tâche"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.title && onRename(e.target.value.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          className={`min-w-0 flex-1 resize-none bg-transparent text-lg font-semibold focus:outline-none ${item.done ? "text-zinc-400 line-through" : ""}`}
        />
        <button
          type="button"
          onClick={onToggleImportant}
          aria-pressed={item.important}
          aria-label="Importante"
          className={`text-xl leading-none ${item.important ? "text-amber-500" : "text-zinc-300 hover:text-zinc-500"}`}
        >
          {item.important ? "★" : "☆"}
        </button>
        <button type="button" onClick={onClose} className="hidden text-zinc-400 hover:text-zinc-700 md:block" aria-label="Fermer">
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 no-scrollbar overflow-y-auto px-4 pb-4">
        <Section>
          <button type="button" onClick={onToggleMyDay} className={`w-full px-3 py-2.5 text-left text-sm ${inMyDay ? "text-blue-600 dark:text-blue-400" : ""}`}>
            ☀ {inMyDay ? "Dans Ma journée" : "Ajouter à Ma journée"}
          </button>
        </Section>

        <Section>
          <div className={`flex items-center px-3 pt-2.5 text-sm ${item.dueAt ? "text-blue-600 dark:text-blue-400" : ""}`}>
            ▦ Échéance
            <span className="ml-auto text-xs text-zinc-500">{item.dueAt ? formatDue(item.dueAt) : "aucune"}</span>
          </div>
          {!readOnly && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-2">
            {quickDueDates(today).map((q) => (
              <Chip key={q.label} pressed={dueDate === q.date} onClick={() => onSetDue(q.date)}>
                {q.label}
              </Chip>
            ))}
            <Chip pressed={picking} onClick={() => setPicking(!picking)}>
              Choisir…
            </Chip>
            {item.dueAt && <Chip onClick={() => onSetDue("")}>Retirer</Chip>}
          </div>
          )}
          {readOnly && <div className="pb-2.5" />}
          {picking && (
            <div className="px-3 pb-3">
              <input
                type="date"
                defaultValue={dueDate ?? today}
                aria-label="Date d'échéance"
                onChange={(e) => e.target.value && (onSetDue(e.target.value), setPicking(false))}
                className={inputClass}
              />
            </div>
          )}
        </Section>

        <TaskPeople key={item.id} entry={entry} />

        {onSetCourse && !readOnly && (
          <Section>
            <label className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course ? courseColor(course) : "#71717a" }} aria-hidden />
              Cours
              <select value={known?.name ?? course} onChange={(e) => onSetCourse(e.target.value)} className={`${inputClass} ml-auto w-auto max-w-[65%] py-1`}>
                <option value="">Aucun</option>
                {course && !known && <option value={course}>{course}</option>}
                {courses.map((c) => (
                  <option key={c.key} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </Section>
        )}

        <Section>
          <p className="px-3 pt-2.5 text-sm">🔔 Rappels</p>
          <div className="px-3 pb-3 pt-2">
            <ReminderControl targetType="todo" targetId={item.id} hasTime={item.dueAt !== null} groupId={list.groupId} />
          </div>
        </Section>

        {group && (
          <Section>
            <p className="px-3 pt-2.5 text-sm">👥 {group.name}</p>
            <ul className="flex flex-col gap-1 px-3 pb-3 pt-2 text-sm">
              {group.members.map((m) => {
                const done = item.doneBy.includes(m.userId);
                return (
                  <li key={m.userId} className="flex justify-between">
                    <span>
                      {m.displayName}
                      {m.userId === me && <span className="text-zinc-500"> (moi)</span>}
                    </span>
                    <span className={done ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}>{done ? "✓ fait" : "à faire"}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="mr-auto truncate">
          {readOnly ? `Partagée par ${item.authorName || "un étudiant"}` : `Dans « ${list.title} »`}
          {list.scope === "session" && list.sessionStart && ` · séance du ${formatSessionDate(list.sessionStart)}`}
        </span>
        {canDelete &&
          (confirmDelete ? (
            <>
              <button type="button" onClick={onDelete} className={`${buttonClass.danger} py-1`}>
                Supprimer
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
                Annuler
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonClass.danger} py-1`}>
              Supprimer la tâche
            </button>
          ))}
      </footer>
    </aside>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">{children}</section>;
}

function Chip({ pressed = false, onClick, children }: { pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`rounded-full border px-2.5 py-1 text-xs ${
        pressed
          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
