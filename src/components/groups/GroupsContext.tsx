"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Group, TaskShare } from "@/lib/data/types";

/** Mes groupes, mes partages de tâches et mon identifiant, chargés une fois par le layout et disponibles partout. */
const GroupsContext = createContext<{ me: string; groups: Group[]; shares: TaskShare[] }>({ me: "", groups: [], shares: [] });

export function GroupsProvider({ me, groups, shares, children }: { me: string; groups: Group[]; shares: TaskShare[]; children: ReactNode }) {
  return <GroupsContext.Provider value={{ me, groups, shares }}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  return useContext(GroupsContext);
}

/** Nom affiché d'un membre de l'un de mes groupes. */
export function useMemberName() {
  const { groups } = useGroups();
  return (userId: string) => groups.flatMap((g) => g.members).find((m) => m.userId === userId)?.displayName ?? "un ancien membre";
}
