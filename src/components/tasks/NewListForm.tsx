"use client";

import { useState } from "react";
import { createTodoList } from "@/lib/actions/todos";
import type { Course } from "@/lib/data/types";
import { SharePicker } from "@/components/groups/share";
import { ActionMessage, useFormAction } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/styles";

/** Petit formulaire "Nouvelle liste" dans la barre latérale ; ouvre la liste créée. */
/** defaultGroupId : si toutes mes tâches sont partagées, la nouvelle liste l'est aussi par défaut. */
export function NewListForm(props: { courses: Course[]; defaultGroupId?: string | null; onCreated: (id: string) => void; onCancel: () => void }) {
  const { courses, defaultGroupId, onCreated, onCancel } = props;
  const [scope, setScope] = useState<"global" | "course">("global");
  const { onSubmit, pending, result } = useFormAction(async (prev, data) => {
    const r = await createTodoList(prev, data);
    if (r.ok && r.id) onCreated(r.id);
    return r;
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <input name="title" required maxLength={200} autoFocus placeholder="Nom de la liste" aria-label="Nom de la liste" className={inputClass} />
      <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as "global" | "course")} aria-label="Type de liste" className={inputClass}>
        <option value="global">Liste générale</option>
        <option value="course">Liée à un cours</option>
      </select>
      {scope === "course" && (
        <>
          <input name="courseName" list="new-list-courses" required maxLength={300} placeholder="Cours" aria-label="Cours" className={inputClass} />
          <datalist id="new-list-courses">
            {courses.map((c) => (
              <option key={c.key} value={c.name} />
            ))}
          </datalist>
        </>
      )}
      <SharePicker defaultValue={defaultGroupId ?? ""} />
      <ActionMessage result={result} showSuccess={false} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          Créer
        </button>
        <button type="button" onClick={onCancel} className={buttonClass.ghost}>
          Annuler
        </button>
      </div>
    </form>
  );
}
