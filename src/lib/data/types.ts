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

/** Éléments partageables : ownerId = auteur, groupId = groupe avec lequel c'est partagé (sinon privé). */
type Shareable = { ownerId: string; groupId: string | null };

export type Deadline = Shareable & {
  id: string;
  title: string;
  dueAt: string;
  courseName: string | null;
  courseKey: string | null;
  priority: Priority;
  details: string | null;
  /** Quand MOI je l'ai terminée (chaque membre coche pour lui-même). */
  doneAt: string | null;
  /** Qui l'a terminée (utile pour une deadline partagée). */
  doneBy: string[];
};

export type TodoScope = "global" | "course" | "session";

export type TodoItem = {
  id: string;
  listId: string;
  authorId: string;
  title: string;
  dueAt: string | null;
  position: number;
  /** Faite par MOI. */
  done: boolean;
  doneBy: string[];
};

export type TodoList = Shareable & {
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

export type Reminder = Shareable & {
  id: string;
  /** Rappel partagé que j'ai coupé pour moi. */
  muted: boolean;
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

export type GroupRole = "admin" | "member";

export type GroupMember = { userId: string; displayName: string; role: GroupRole; joinedAt: string };

export type Group = {
  id: string;
  name: string;
  inviteCode: string;
  myRole: GroupRole;
  members: GroupMember[];
};

/** Un cours connu (déduit des séances), pour les menus déroulants. */
export type Course = { key: string; name: string };

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "Haute", 2: "Normale", 3: "Basse" };
