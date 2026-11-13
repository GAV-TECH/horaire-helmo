import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionChanges, StoredSession } from "@/lib/ics/types";
import type { Deadline, Group, Priority, ProjectLink, ProjectMessage, Reminder, TaskOffer, TaskShare, TodoItem, TodoList } from "./types";

/*
 * Lecture des données. Avec le client "utilisateur" (createClient), le RLS filtre déjà ;
 * le filtre user_id explicite reste obligatoire quand on passe le client admin.
 *
 * Postgres renvoie les dates sous la forme "2025-10-06 06:30:00+00" : iso() les normalise
 * en "2025-10-06T06:30:00.000Z" pour que les comparaisons de chaînes restent justes.
 */
const iso = (value: string) => new Date(value).toISOString();

/**
 * Supabase renvoie ses erreurs sous forme d'objet ({ code, message, … }) et non d'Error :
 * lancé tel quel, Next.js affiche "{code: …, message: …}". On le convertit en vraie Error lisible.
 */
export function dbError(error: { message: string; code?: string }, context: string): Error {
  return new Error(`Base de données (${context}) : ${error.message}${error.code ? ` [${error.code}]` : ""}`);
}
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
    if (error) throw dbError(error as { message: string; code?: string }, "selectAll");
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

/*
 * Phase 4 : les requêtes ci-dessous ne filtrent PAS sur user_id. Le RLS renvoie à la fois
 * les lignes de l'utilisateur et celles partagées avec ses groupes. `userId` sert seulement
 * à savoir si c'est "moi" qui ai coché.
 */

export async function loadDeadlines(supabase: SupabaseClient, userId: string): Promise<Deadline[]> {
  const { data, error } = await supabase.from("deadlines").select("*, deadline_completions(user_id, done_at)").order("due_at");
  if (error) throw dbError(error as { message: string; code?: string }, "deadlines");
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
    .select(`*, todo_items(${ITEM_COLUMNS})`)
    .order("created_at");
  if (error) throw dbError(error as { message: string; code?: string }, "todo_lists");

  const lists: TodoList[] = (data ?? []).map((l) => ({
    id: l.id,
    ownerId: l.user_id,
    groupId: l.group_id,
    title: l.title,
    scope: l.scope,
    courseName: l.course_name,
    courseKey: l.course_key,
    sessionKey: l.session_key,
    sessionStart: isoOrNull(l.session_start),
    items: sortItems(((l.todo_items ?? []) as ItemRow[]).map((i) => toItem(i, userId))),
  }));
  return withAssignees(supabase, userId, lists);
}

const ITEM_COLUMNS = "*, todo_completions(user_id), todo_item_flags(user_id, important, my_day)";

const sortItems = (items: TodoItem[]) => items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

function toItem(i: ItemRow, userId: string): TodoItem {
  const flags = (i.todo_item_flags ?? []).find((f) => f.user_id === userId);
  return {
    id: i.id,
    listId: i.list_id,
    authorId: i.user_id,
    title: i.title,
    courseName: i.course_name ?? null, // colonne absente avant la migration 0019
    dueAt: isoOrNull(i.due_at),
    position: i.position,
    done: i.todo_completions.some((c) => c.user_id === userId),
    doneBy: i.todo_completions.map((c) => c.user_id),
    important: flags?.important ?? false,
    myDay: flags?.my_day ?? null,
  };
}

/** Identifiant de la liste « Tâches partagées avec moi » (fabriquée par l'app, pas en base). */
export const ASSIGNED_LIST_ID = "partagees";

/**
 * Tâches partagées une par une (migration 0020) : ajoute à chaque tâche ses étudiants, et
 * range dans une liste « Tâches partagées avec moi » celles qu'on m'a confiées sans que je
 * voie leur liste. Requête séparée : si la migration n'est pas encore exécutée, la page
 * continue de fonctionner (sans partage par tâche) au lieu de planter.
 */
async function withAssignees(supabase: SupabaseClient, userId: string, lists: TodoList[]): Promise<TodoList[]> {
  const { data, error } = await supabase.from("todo_item_assignees").select("item_id, user_id, user_name, author_name");
  if (error || !data?.length) return lists;
  const rows = data as AssigneeRow[];

  const byItem = new Map<string, AssigneeRow[]>();
  for (const r of rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  const decorate = (item: TodoItem): TodoItem => {
    const found = byItem.get(item.id);
    if (!found) return item;
    return { ...item, assignees: found.map((r) => ({ userId: r.user_id, name: r.user_name })), authorName: found[0].author_name };
  };
  const decorated = lists.map((l) => ({ ...l, items: l.items.map(decorate) }));

  // Tâches qu'on m'a confiées et que je n'ai pas encore (leur liste ne m'est pas partagée).
  const known = new Set(decorated.flatMap((l) => l.items.map((i) => i.id)));
  const missing = rows.filter((r) => r.user_id === userId && !known.has(r.item_id)).map((r) => r.item_id);
  if (missing.length === 0) return decorated;
  const { data: items, error: itemsError } = await supabase.from("todo_items").select(ITEM_COLUMNS).in("id", missing);
  if (itemsError) throw dbError(itemsError as { message: string; code?: string }, "todo_items partagées");
  if (!items?.length) return decorated;

  const assigned: TodoList = {
    id: ASSIGNED_LIST_ID,
    ownerId: "",
    groupId: null,
    title: "Tâches partagées avec moi",
    scope: "global",
    courseName: null,
    courseKey: null,
    sessionKey: null,
    sessionStart: null,
    virtual: true,
    items: sortItems((items as ItemRow[]).map((i) => decorate(toItem(i, userId)))),
  };
  return [...decorated, assigned];
}

type AssigneeRow = { item_id: string; user_id: string; user_name: string; author_name: string };

type ItemRow = {
  course_name?: string | null;
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
  if (error) throw dbError(error as { message: string; code?: string }, "reminder_schedule");
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
  if (error) throw dbError(error as { message: string; code?: string }, "groups");
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

/** Mes partages de tâches, envoyés et reçus, avec les noms des deux étudiants. */
export async function loadTaskShares(supabase: SupabaseClient): Promise<TaskShare[]> {
  const { data, error } = await supabase
    .from("task_shares")
    .select(
      "id, owner_id, recipient_id, list_id, label, status, created_at, owner:profiles!task_shares_owner_id_fkey(display_name), recipient:profiles!task_shares_recipient_id_fkey(display_name)",
    )
    .order("created_at");
  if (error) {
    // Avant la migration 0007, la table n'existe pas : l'app fonctionne sans partage.
    console.error("[task_shares]", error.message);
    return [];
  }
  return ((data ?? []) as unknown as ShareRow[]).map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner?.display_name ?? "?",
    recipientId: r.recipient_id,
    recipientName: r.recipient?.display_name ?? "?",
    listId: r.list_id,
    label: r.label,
    status: r.status,
    createdAt: iso(r.created_at),
  }));
}

type ShareRow = {
  id: string;
  owner_id: string;
  recipient_id: string;
  list_id: string | null;
  label: string;
  status: "pending" | "accepted";
  created_at: string;
  owner: { display_name: string } | null;
  recipient: { display_name: string } | null;
};

/**
 * Les 200 derniers messages d'un projet, du plus ancien au plus récent.
 * null = discussion indisponible (migration 0008 pas encore exécutée).
 */
export async function loadProjectMessages(supabase: SupabaseClient, listId: string): Promise<ProjectMessage[] | null> {
  const { data, error } = await supabase
    .from("project_messages")
    .select("id, user_id, author_name, body, created_at")
    .eq("list_id", listId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[project_messages]", error.message);
    return null;
  }
  return (data ?? [])
    .map((m) => ({ id: m.id, authorId: m.user_id, authorName: m.author_name, body: m.body, createdAt: iso(m.created_at) }))
    .reverse();
}

/** Documents (liens) d'un projet. null = indisponible (migration 0009 pas encore exécutée). */
export async function loadProjectLinks(supabase: SupabaseClient, listId: string): Promise<ProjectLink[] | null> {
  const { data, error } = await supabase.from("project_links").select("id, user_id, title, url").eq("list_id", listId).order("created_at");
  if (error) {
    console.error("[project_links]", error.message);
    return null;
  }
  return (data ?? []).map((l) => ({ id: l.id, authorId: l.user_id, title: l.title, url: l.url }));
}

/** Messages non lus par projet (id du projet → nombre). Vide si la migration 0014 n'est pas exécutée. */
export async function loadUnreadCounts(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("unread_message_counts");
  if (error) {
    console.error("[unread_message_counts]", error.message);
    return {};
  }
  return Object.fromEntries(((data ?? []) as { list_id: string; unread: number }[]).map((r) => [r.list_id, r.unread]));
}

/** Copies de tâches proposées (reçues et envoyées). Vide si la migration 0015 n'est pas exécutée. */
export async function loadTaskOffers(supabase: SupabaseClient): Promise<TaskOffer[]> {
  const { data, error } = await supabase.from("task_offers").select("id, sender_id, sender_name, recipient_id, title, due_at, context").order("created_at");
  if (error) {
    console.error("[task_offers]", error.message);
    return [];
  }
  return (data ?? []).map((o) => ({
    id: o.id,
    senderId: o.sender_id,
    senderName: o.sender_name,
    recipientId: o.recipient_id,
    title: o.title,
    dueAt: isoOrNull(o.due_at),
    context: o.context,
  }));
}

export async function loadProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return { displayName: (data?.display_name as string | undefined) ?? "" };
}

export { coursesFrom } from "@/lib/courses";
