"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Reminder, ReminderTarget } from "@/lib/data/types";

/**
 * Les rappels sont chargés une fois (dans le layout) et partagés par contexte React :
 * n'importe quel composant (séance, deadline, tâche) retrouve les siens sans que chaque page
 * doive les transmettre de parent en enfant.
 */
const RemindersContext = createContext<{ all: Reminder[]; byTarget: Map<string, Reminder[]>; now: number } | null>(null);

export function RemindersProvider({ reminders, now, children }: { reminders: Reminder[]; now: number; children: ReactNode }) {
  const value = useMemo(() => {
    const byTarget = new Map<string, Reminder[]>();
    for (const r of reminders) {
      const key = `${r.targetType}:${r.targetId}`;
      byTarget.set(key, [...(byTarget.get(key) ?? []), r]);
    }
    return { all: reminders, byTarget, now };
  }, [reminders, now]);
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useAllReminders() {
  const ctx = useContext(RemindersContext);
  return { reminders: ctx?.all ?? [], now: ctx?.now ?? 0 };
}

export function useTargetReminders(targetType: ReminderTarget, targetId: string) {
  const ctx = useContext(RemindersContext);
  return { reminders: ctx?.byTarget.get(`${targetType}:${targetId}`) ?? [], now: ctx?.now ?? 0 };
}
