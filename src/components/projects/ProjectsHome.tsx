"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTodoList } from "@/lib/actions/todos";
import type { Course, TodoList } from "@/lib/data/types";
import { nextDueTask, projectProgress, sortProjects } from "@/lib/projects";
import { SharePicker, SharedBadge } from "@/components/groups/share";
import { Countdown } from "@/components/deadlines/Countdown";
import { ActionMessage, PageTitle, useFormAction } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/styles";

/** Onglet Projets : un projet = une liste de tâches (avec échéances), éventuellement partagée avec un groupe. */
/** unread : messages non lus de la discussion, par id de projet. */
export function ProjectsHome(props: { projects: TodoList[]; courses: Course[]; unread: Record<string, number>; now: number }) {
  const { projects, courses, unread, now } = props;
  const router = useRouter();
  const [creating, setCreating] = useState(projects.length === 0);
  const create = useFormAction(async (prev, data) => {
    const r = await createTodoList(prev, data);
    if (r.ok && r.id) router.push(`/projets/${r.id}`); // on ouvre directement le projet créé
    return r;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle
        aside={
          <button type="button" onClick={() => setCreating(!creating)} className={buttonClass.primary}>
            {creating ? "Fermer" : "＋ Nouveau projet"}
          </button>
        }
      >
        Projets
      </PageTitle>

      {creating && (
        <form onSubmit={create.onSubmit} className="mb-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-zinc-900">
          <input type="hidden" name="scope" value="project" />
          <input name="title" required maxLength={200} autoFocus placeholder="Nom du projet (ex. Projet béton, TFE…)" aria-label="Nom du projet" className={`${inputClass} text-base`} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Cours (facultatif)
              <input name="courseName" list="project-courses" maxLength={300} placeholder="Aucun" className={inputClass} />
              <datalist id="project-courses">
                {courses.map((c) => (
                  <option key={c.key} value={c.name} />
                ))}
              </datalist>
            </label>
            <SharePicker />
          </div>
          <ActionMessage result={create.result} showSuccess={false} />
          <button type="submit" disabled={create.pending} className={`${buttonClass.primary} self-start`}>
            Créer le projet
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Aucun projet pour l&apos;instant. Crée-en un pour y regrouper ses tâches et leurs échéances, seul ou avec ton groupe.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortProjects(projects).map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} unread={unread[p.id] ?? 0} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ project, unread, now }: { project: TodoList; unread: number; now: number }) {
  const { done, total, percent } = projectProgress(project);
  const next = nextDueTask(project);
  return (
    <Link
      href={`/projets/${project.id}`}
      className="flex h-full flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
    >
      <div>
        <div className="flex items-start gap-2">
          <p className="mr-auto font-semibold leading-snug">{project.title}</p>
          {unread > 0 && (
            <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white" aria-label={`${unread} message(s) non lu(s)`}>
              💬 {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          {project.courseName && <span>{project.courseName}</span>}
          <SharedBadge groupId={project.groupId} ownerId={project.ownerId} />
        </p>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>
            {done}/{total} tâche{total > 1 ? "s" : ""}
          </span>
          <span className="tabular-nums">{percent} %</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 text-xs text-zinc-500">
        {next ? (
          <>
            <span className="mr-auto truncate">Prochaine : {next.title}</span>
            <Countdown dueAt={next.dueAt!} now={now} />
          </>
        ) : (
          <span>{total > 0 && done === total ? "Tout est fait ✓" : "Aucune échéance"}</span>
        )}
      </div>
    </Link>
  );
}
