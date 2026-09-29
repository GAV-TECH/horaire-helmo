"use client";

import { doneSummary } from "@/lib/groups";
import { inputClass } from "@/components/ui";
import { useGroups, useMemberName } from "./GroupsContext";

/** Menu "Partager avec" pour les formulaires (champ groupId ; vide = privé). */
export function SharePicker({ defaultValue = "", name = "groupId" }: { defaultValue?: string; name?: string }) {
  const { groups } = useGroups();
  if (groups.length === 0) return null;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Partager avec</span>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        <option value="">Personne (privé)</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            👥 {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Petite étiquette "👥 Nom du groupe · par Alice" sur un élément partagé. */
export function SharedBadge({ groupId, ownerId }: { groupId: string | null; ownerId: string }) {
  const { groups, me } = useGroups();
  const memberName = useMemberName();
  if (!groupId) return null;
  const group = groups.find((g) => g.id === groupId);
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 text-[11px] font-normal text-violet-700 dark:bg-violet-950 dark:text-violet-300">
      👥 {group?.name ?? "groupe"}
      {ownerId !== me && <span className="opacity-75">· par {memberName(ownerId)}</span>}
    </span>
  );
}

/** "✓ 2/4 · Alice, Bob" : qui a fait un élément partagé (statut par membre). */
export function DoneBy({ groupId, doneBy }: { groupId: string | null; doneBy: string[] }) {
  const { groups } = useGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const { done, total, names } = doneSummary(doneBy, group.members);
  return (
    <span className="text-xs text-zinc-500" title={names.length ? `Fait par : ${names.join(", ")}` : "Personne ne l'a encore fait"}>
      ✓ {done}/{total}
      {names.length > 0 && ` · ${names.join(", ")}`}
    </span>
  );
}
