import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionChanges, StoredSession } from "@/lib/ics/types";
import type { Course, Deadline, Note, Priority, Reminder, TodoItem, TodoList } from "./types";

/*
 * Lecture des données. Avec le client "utilisateur" (createClient), le RLS filtre déjà ;
 * le filtre user_id explicite reste obligatoire quand on passe le client admin.
 *
 * Postgres renvoie les dates sous la forme "2025-10-06 06:30:00+00" : iso() les normalise
 * en "2025-10-06T06:30:00.000Z" pour que les comparaisons de chaînes restent justes.
 */
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

export type SessionRow = {
  id: string;
  key: string;
  uid: string;
  recurrence_id: string | null;
  title: string;
  course_key: string;
  location: string | null;
  teacher: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  description: string | null;
  status: "active" | "cancelled";
  changes: SessionChanges;
  changes_seen: boolean;
};

export function rowToSession(r: SessionRow): StoredSession {
  return {
    id: r.id,
    key: r.key,
    uid: r.uid,
    recurrenceId: isoOrNull(r.recurrence_id),
    title: r.title,
    courseKey: r.course_key,
    location: r.location,
    teacher: r.teacher,
    start: iso(r.start_at),
    end: iso(r.end_at),
    allDay: r.all_day,
    description: r.description,
    status: r.status,
    changes: r.changes ?? {},
    changesSeen: r.changes_seen,
  };
}

/** Supabase renvoie au plus 1000 lignes par requête : on pagine. */
async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function loadSessions(supabase: SupabaseClient, userId: string, since?: string): Promise<StoredSession[]> {
  const rows = await selectAll<SessionRow>((from, to) => {
    let q = supabase.from("sessions").select("*").eq("user_id", userId);
    if (since) q = q.gte("end_at", since);
    return q.order("start_at").range(from, to);
  });
  return rows.map(rowToSession);
}

export async function loadNotes(supabase: SupabaseClient, userId: string): Promise<Note[]> {
  const { data, error } = await supabase.from("notes").select("*").eq("user_id", userId).order("session_start");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sessionKey: r.session_key,
    courseKey: r.course_key,
    courseTitle: r.course_title,
    sessionStart: iso(r.session_start),
    body: r.body,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }));
}

export async function loadDeadlines(supabase: SupabaseClient, userId: string): Promise<Deadline[]> {
  const { data, error } = await supabase.from("deadlines").select("*").eq("user_id", userId).order("due_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: iso(r.due_at),
    courseName: r.course_name,
    courseKey: r.course_key,
    priority: r.priority as Priority,
    details: r.details,
    doneAt: isoOrNull(r.done_at),
  }));
}

export async function loadTodoLists(supabase: SupabaseClient, userId: string): Promise<TodoList[]> {
  // Une seule requête grâce aux relations : listes → tâches → mes coches.
  const { data, error } = await supabase
    .from("todo_lists")
    .select("*, todo_items(*, todo_completions(user_id))")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    scope: l.scope,
    courseName: l.course_name,
    courseKey: l.course_key,
    sessionKey: l.session_key,
    sessionStart: isoOrNull(l.session_start),
    items: ((l.todo_items ?? []) as ItemRow[])
      .map(
        (i): TodoItem => ({
          id: i.id,
          listId: i.list_id,
          title: i.title,
          dueAt: isoOrNull(i.due_at),
          position: i.position,
          done: i.todo_completions.some((c) => c.user_id === userId),
        }),
      )
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
  }));
}

type ItemRow = {
  id: string;
  list_id: string;
  title: string;
  due_at: string | null;
  position: number;
  todo_completions: { user_id: string }[];
};

export async function loadReminders(supabase: SupabaseClient, userId: string): Promise<Reminder[]> {
  const { data, error } = await supabase.from("reminder_schedule").select("*").eq("user_id", userId).order("fire_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    offsetMinutes: r.offset_minutes,
    remindAt: isoOrNull(r.remind_at),
    fireAt: isoOrNull(r.fire_at),
    sentAt: isoOrNull(r.sent_at),
    targetTitle: r.target_title,
    targetDetail: r.target_detail,
    targetAt: isoOrNull(r.target_at),
    targetDone: Boolean(r.target_done),
  }));
}

export async function loadProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return { displayName: (data?.display_name as string | undefined) ?? "" };
}

/** Liste des cours (un par nom normalisé), pour les menus déroulants des formulaires. */
export function coursesFrom(sessions: { courseKey: string; title: string }[]): Course[] {
  const map = new Map<string, string>();
  for (const s of sessions) if (!map.has(s.courseKey)) map.set(s.courseKey, s.title);
  return [...map].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
