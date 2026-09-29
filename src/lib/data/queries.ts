import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionChanges, StoredSession } from "@/lib/ics/types";
import type { Course, Deadline, Group, Note, Priority, Reminder, TodoItem, TodoList } from "./types";

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

/*
 * Phase 4 : les requêtes ci-dessous ne filtrent PAS sur user_id. Le RLS renvoie à la fois
 * les lignes de l'utilisateur et celles partagées avec ses groupes. `userId` sert seulement
 * à savoir si c'est "moi" qui ai coché.
 */

export async function loadDeadlines(supabase: SupabaseClient, userId: string): Promise<Deadline[]> {
  const { data, error } = await supabase.from("deadlines").select("*, deadline_completions(user_id, done_at)").order("due_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const completions = (r.deadline_completions ?? []) as { user_id: string; done_at: string }[];
    const mine = completions.find((c) => c.user_id === userId);
    return {
      id: r.id,
      ownerId: r.user_id,
      groupId: r.group_id,
      title: r.title,
      dueAt: iso(r.due_at),
      courseName: r.course_name,
      courseKey: r.course_key,
      priority: r.priority as Priority,
      details: r.details,
      doneAt: mine ? iso(mine.done_at) : null,
      doneBy: completions.map((c) => c.user_id),
    };
  });
}

export async function loadTodoLists(supabase: SupabaseClient, userId: string): Promise<TodoList[]> {
  // Une seule requête grâce aux relations : listes → tâches → coches.
  const { data, error } = await supabase
    .from("todo_lists")
    // todo_item_flags : le RLS ne renvoie que MES marqueurs (étoile, Ma journée).
    .select("*, todo_items(*, todo_completions(user_id), todo_item_flags(user_id, important, my_day))")
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((l) => ({
    id: l.id,
    ownerId: l.user_id,
    groupId: l.group_id,
    title: l.title,
    scope: l.scope,
    courseName: l.course_name,
    courseKey: l.course_key,
    sessionKey: l.session_key,
    sessionStart: isoOrNull(l.session_start),
    items: ((l.todo_items ?? []) as ItemRow[])
      .map((i): TodoItem => {
        const flags = (i.todo_item_flags ?? []).find((f) => f.user_id === userId);
        return {
          id: i.id,
          listId: i.list_id,
          authorId: i.user_id,
          title: i.title,
          dueAt: isoOrNull(i.due_at),
          position: i.position,
          done: i.todo_completions.some((c) => c.user_id === userId),
          doneBy: i.todo_completions.map((c) => c.user_id),
          important: flags?.important ?? false,
          myDay: flags?.my_day ?? null,
        };
      })
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
  }));
}

type ItemRow = {
  id: string;
  list_id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  position: number;
  todo_completions: { user_id: string }[];
  todo_item_flags: { user_id: string; important: boolean; my_day: string | null }[] | null;
};

export async function loadReminders(supabase: SupabaseClient): Promise<Reminder[]> {
  const { data, error } = await supabase.from("reminder_schedule").select("*").order("fire_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    ownerId: r.user_id,
    groupId: r.group_id,
    muted: Boolean(r.muted),
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

/** Mes groupes, avec leurs membres et leurs noms affichés (une seule requête). */
export async function loadGroups(supabase: SupabaseClient, userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, invite_code, created_at, group_members(user_id, role, joined_at, profiles(display_name))")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((g) => {
    const members = ((g.group_members ?? []) as unknown as MemberRow[])
      .map((m) => ({
        userId: m.user_id,
        displayName: m.profiles?.display_name ?? "?",
        role: m.role,
        joinedAt: iso(m.joined_at),
      }))
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    return {
      id: g.id,
      name: g.name,
      inviteCode: g.invite_code,
      myRole: members.find((m) => m.userId === userId)?.role ?? "member",
      members,
    };
  });
}

type MemberRow = { user_id: string; role: "admin" | "member"; joined_at: string; profiles: { display_name: string } | null };

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
