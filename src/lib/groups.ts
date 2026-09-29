import type { Group, GroupMember } from "@/lib/data/types";

/** "A3F9C27E1B00" → "A3F9-C27E-1B00" : plus facile à lire et à dicter. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin}/groupes/rejoindre?code=${encodeURIComponent(code)}`;
}

/** Même règle que le RLS : l'auteur, ou un admin du groupe si l'élément est partagé. */
export function canEdit(item: { ownerId: string; groupId: string | null }, me: string, groups: Group[]): boolean {
  if (item.ownerId === me) return true;
  if (!item.groupId) return false;
  return groups.find((g) => g.id === item.groupId)?.myRole === "admin";
}

/**
 * Résumé "fait par" pour un élément partagé : combien de membres ACTUELS l'ont fait, et qui.
 * (Les coches d'un ancien membre ne comptent plus.)
 */
export function doneSummary(doneBy: string[], members: GroupMember[]): { done: number; total: number; names: string[] } {
  const done = members.filter((m) => doneBy.includes(m.userId));
  return { done: done.length, total: members.length, names: done.map((m) => m.displayName) };
}
