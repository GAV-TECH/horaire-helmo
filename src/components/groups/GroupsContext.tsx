"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Group, TaskOffer, TaskShare } from "@/lib/data/types";

type GroupsValue = { me: string; groups: Group[]; shares: TaskShare[]; offers: TaskOffer[] };

/** Mes groupes, mes partages, les copies de tâches qu'on me propose et mon identifiant : chargés une fois par le layout, disponibles partout. */
const GroupsContext = createContext<GroupsValue>({ me: "", groups: [], shares: [], offers: [] });

export function GroupsProvider({ children, ...value }: GroupsValue & { children: ReactNode }) {
  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  return useContext(GroupsContext);
}

/** Nom affiché d'un membre de l'un de mes groupes. */
export function useMemberName() {
  const { groups } = useGroups();
  return (userId: string) => groups.flatMap((g) => g.members).find((m) => m.userId === userId)?.displayName ?? "un ancien membre";
}
