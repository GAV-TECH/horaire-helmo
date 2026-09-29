/** Types des données utilisateur envoyées aux composants (camelCase, dates en ISO UTC). */

export type Note = {
  id: string;
  sessionKey: string;
  courseKey: string;
  courseTitle: string;
  sessionStart: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Priority = 1 | 2 | 3;

export type Deadline = {
  id: string;
  title: string;
  dueAt: string;
  courseName: string | null;
  courseKey: string | null;
  priority: Priority;
  details: string | null;
  doneAt: string | null;
};

export type TodoScope = "global" | "course" | "session";

export type TodoItem = {
  id: string;
  listId: string;
  title: string;
  dueAt: string | null;
  position: number;
  done: boolean;
};

export type TodoList = {
  id: string;
  title: string;
  scope: TodoScope;
  courseName: string | null;
  courseKey: string | null;
  sessionKey: string | null;
  sessionStart: string | null;
  items: TodoItem[];
};

export type ReminderTarget = "session" | "deadline" | "todo";

export type Reminder = {
  id: string;
  targetType: ReminderTarget;
  targetId: string;
  /** Décalage avant la cible (ex. 60 = 1 h avant), ou null si date précise. */
  offsetMinutes: number | null;
  remindAt: string | null;
  /** Heure effective de déclenchement (recalculée si la cible bouge). */
  fireAt: string | null;
  sentAt: string | null;
  targetTitle: string | null;
  targetDetail: string | null;
  targetAt: string | null;
  targetDone: boolean;
};

/** Un cours connu (déduit des séances), pour les menus déroulants. */
export type Course = { key: string; name: string };

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "Haute", 2: "Normale", 3: "Basse" };
