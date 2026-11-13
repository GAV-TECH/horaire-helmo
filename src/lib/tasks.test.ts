import { describe, expect, it } from "vitest";
import type { TodoItem, TodoList } from "./data/types";
import { dayLabel, flattenTasks, groupTasksByDay, isOverdue, jourSection, nextTaskDay, quickDueDates, sortTasks, splitOverdue, taskProgress, tasksForView } from "./tasks";

const item = (id: string, over: Partial<TodoItem> = {}): TodoItem => ({
  id, listId: "l", authorId: "me", title: id, dueAt: null, position: 0, done: false, doneBy: [], important: false, myDay: null, ...over,
});
const list = (id: string, items: TodoItem[], over: Partial<TodoList> = {}): TodoList => ({
  id, ownerId: "me", groupId: null, title: id, scope: "global", courseName: null, courseKey: null, sessionKey: null, sessionStart: null, items, ...over,
});

const lists = [
  list("perso", [
    item("a", { myDay: "2025-10-06", important: true }),
    item("b", { myDay: "2025-10-05" }),
    item("c", { dueAt: "2025-10-08T21:59:00.000Z", position: 2 }),
  ]),
  list("seance", [item("d", { dueAt: "2025-10-07T08:00:00.000Z" })], { scope: "session" }),
];
const entries = flattenTasks(lists);
const ids = (v: string) => tasksForView(entries, v, "2025-10-06").map((e) => e.item.id);

describe("vues de la page Tâches", () => {
  it("Ma journée : ajoutées aujourd'hui (pas hier) + échéance du prochain jour qui a des tâches", () => {
    expect(ids("jour")).toEqual(["a", "d"]); // d : échéance le 7 = demain ; c (le 8) attend son tour
  });
  it("une tâche de séance sans échéance compte pour le jour de sa séance", () => {
    const seance = flattenTasks([list("s", [item("lire")], { scope: "session", sessionStart: "2025-10-09T06:15:00.000Z" })]);
    expect(tasksForView(seance, "jour", "2025-10-06").map((e) => e.item.id)).toEqual(["lire"]); // jeudi = prochain jour chargé
    expect(tasksForView(seance, "planifie", "2025-10-06").map((e) => e.item.id)).toEqual(["lire"]);
    expect(groupTasksByDay(seance, "2025-10-06")[0].label).toBe("Jeudi 9 octobre");
  });
  it("Ma journée : rien demain → les tâches du jour d'après", () => {
    const sansDemain = flattenTasks([list("perso", [item("c", { dueAt: "2025-10-08T21:59:00.000Z" }), item("z", { dueAt: "2025-10-20T10:00:00.000Z" })])]);
    expect(tasksForView(sansDemain, "jour", "2025-10-06").map((e) => e.item.id)).toEqual(["c"]);
  });
  it("Important, Planifié, Toutes, Séances, et une liste précise", () => {
    expect(ids("important")).toEqual(["a"]);
    expect(ids("planifie")).toEqual(["c", "d"]);
    expect(ids("toutes")).toEqual(["a", "b", "c", "d"]);
    expect(ids("seances")).toEqual(["d"]);
    expect(ids("perso")).toEqual(["a", "b", "c"]);
  });
  it("trie par échéance, les tâches sans échéance à la fin", () => {
    expect(sortTasks(entries).map((e) => e.item.id)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("Ma journée et retard", () => {
  const today = "2025-10-06";
  const e = (over: Partial<TodoItem>) => ({ item: item("x", over), list: list("l", []) });

  it("range chaque tâche : en retard, aujourd'hui, prochain jour, ou absente", () => {
    const next = "2025-10-07";
    expect(jourSection(e({ dueAt: "2025-10-04T10:00:00.000Z" }), today, next)).toBe("retard");
    expect(jourSection(e({ dueAt: "2025-10-06T06:00:00.000Z" }), today, next)).toBe("aujourdhui"); // ce matin : pas "en retard"
    expect(jourSection(e({ myDay: today }), today, next)).toBe("aujourdhui");
    expect(jourSection(e({ dueAt: "2025-10-07T10:00:00.000Z" }), today, next)).toBe("prochain");
    expect(jourSection(e({ dueAt: "2025-10-09T10:00:00.000Z" }), today, next)).toBeNull();
    expect(jourSection(e({ myDay: "2025-10-05" }), today, next)).toBeNull(); // ajoutée hier : retirée automatiquement
  });

  it("prochain jour : le premier jour après aujourd'hui avec une tâche NON faite", () => {
    expect(nextTaskDay([e({ dueAt: "2025-10-09T10:00:00.000Z" }), e({ dueAt: "2025-10-12T10:00:00.000Z" })], today)).toBe("2025-10-09");
    expect(nextTaskDay([e({ dueAt: "2025-10-07T10:00:00.000Z", done: true }), e({ dueAt: "2025-10-12T10:00:00.000Z" })], today)).toBe("2025-10-12");
    expect(nextTaskDay([e({ dueAt: "2025-10-06T10:00:00.000Z" }), e({})], today)).toBeNull(); // aujourd'hui ou sans date : pas "prochain"
  });

  it("une tâche faite n'est jamais en retard", () => {
    expect(isOverdue(e({ dueAt: "2025-10-04T10:00:00.000Z", done: true }), today)).toBe(false);
  });

  it("sépare les tâches en retard des autres", () => {
    const { overdue, rest } = splitOverdue(
      [e({ id: "vieux", dueAt: "2025-10-01T10:00:00.000Z" }), e({ id: "ok", dueAt: "2025-10-08T10:00:00.000Z" }), e({ id: "sans" })],
      today,
    );
    expect(overdue.map((x) => x.item.id)).toEqual(["vieux"]);
    expect(rest.map((x) => x.item.id)).toEqual(["ok", "sans"]);
  });
});

describe("regroupement par jour", () => {
  const today = "2025-10-06"; // lundi
  const e = (id: string, dueAt: string | null) => ({ item: item(id, { dueAt }), list: list("l", []) });

  it("nomme les jours : aujourd'hui, demain, puis la date (année si différente)", () => {
    expect(dayLabel("2025-10-06", today)).toBe("Aujourd'hui");
    expect(dayLabel("2025-10-07", today)).toBe("Demain");
    expect(dayLabel("2025-10-09", today)).toBe("Jeudi 9 octobre");
    expect(dayLabel("2026-01-05", today)).toBe("Lundi 5 janvier 2026");
  });

  it("une section par jour (jours de Bruxelles, dans l'ordre), sans échéance à la fin", () => {
    const sections = groupTasksByDay(
      sortTasks([e("sans", null), e("jeudi", "2025-10-09T10:00:00Z"), e("nuit", "2025-10-06T22:30:00Z"), e("demain", "2025-10-07T08:00:00Z")]),
      today,
    );
    expect(sections.map((s) => [s.label, s.items.map((x) => x.item.id)])).toEqual([
      ["Demain", ["nuit", "demain"]], // 00:30 le 7 à Bruxelles
      ["Jeudi 9 octobre", ["jeudi"]],
      ["Sans échéance", ["sans"]],
    ]);
  });
});

describe("dates rapides", () => {
  it("propose aujourd'hui, demain et le lundi suivant (jamais le jour même)", () => {
    expect(quickDueDates("2025-10-08").map((d) => d.date)).toEqual(["2025-10-08", "2025-10-09", "2025-10-13"]);
    expect(quickDueDates("2025-10-06")[2].date).toBe("2025-10-13"); // un lundi → le lundi d'après
    expect(quickDueDates("2025-10-12")[2].date).toBe("2025-10-13"); // un dimanche → le lendemain
  });
});

describe("tâche partagée avec un étudiant", () => {
  it("n'affiche rien tant que la tâche n'est confiée à personne", () => {
    expect(taskProgress(item("a"))).toBeNull();
    expect(taskProgress(item("a", { assignees: [] }))).toBeNull();
  });

  it("compte l'auteur et l'étudiant : 1/2 quand l'un des deux l'a cochée", () => {
    const shared = item("a", { authorId: "moi", authorName: "Gilles", assignees: [{ userId: "lea", name: "Léa" }] });
    expect(taskProgress(shared)).toMatchObject({ done: 0, total: 2 });
    const p = taskProgress({ ...shared, doneBy: ["lea"] });
    expect(p).toMatchObject({ done: 1, total: 2 });
    expect(p?.participants).toEqual([
      { userId: "moi", name: "Gilles", done: false },
      { userId: "lea", name: "Léa", done: true },
    ]);
    expect(taskProgress({ ...shared, doneBy: ["lea", "moi"] })).toMatchObject({ done: 2, total: 2 });
  });

  it("ignore la coche d'un étudiant qui ne participe plus", () => {
    const shared = item("a", { authorId: "moi", assignees: [{ userId: "lea", name: "Léa" }], doneBy: ["ancien"] });
    expect(taskProgress(shared)).toMatchObject({ done: 0, total: 2 });
  });
});
