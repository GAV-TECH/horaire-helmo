import { describe, expect, it } from "vitest";
import type { TodoItem, TodoList } from "./data/types";
import { flattenTasks, isOverdue, jourSection, plannedGroup, quickDueDates, sortTasks, splitOverdue, tasksForView } from "./tasks";

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
  it("Ma journée : ajoutées aujourd'hui (pas hier) + échéance aujourd'hui ou demain, automatiquement", () => {
    expect(ids("jour")).toEqual(["a", "d"]); // d : échéance le 7 = demain
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

  it("range chaque tâche : en retard, aujourd'hui, demain, ou absente", () => {
    expect(jourSection(e({ dueAt: "2025-10-04T10:00:00.000Z" }), today)).toBe("retard");
    expect(jourSection(e({ dueAt: "2025-10-06T06:00:00.000Z" }), today)).toBe("aujourdhui"); // ce matin : pas "en retard"
    expect(jourSection(e({ myDay: today }), today)).toBe("aujourdhui");
    expect(jourSection(e({ dueAt: "2025-10-07T10:00:00.000Z" }), today)).toBe("demain");
    expect(jourSection(e({ dueAt: "2025-10-09T10:00:00.000Z" }), today)).toBeNull();
    expect(jourSection(e({ myDay: "2025-10-05" }), today)).toBeNull(); // ajoutée hier : retirée automatiquement
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

describe("Planifié", () => {
  const now = Date.parse("2025-10-06T10:00:00Z"); // lundi 6 octobre, 12:00 à Bruxelles
  it("classe les échéances selon les jours de Bruxelles", () => {
    expect(plannedGroup("2025-10-05T08:00:00Z", now)).toBe("retard"); // hier
    expect(plannedGroup("2025-10-06T08:00:00Z", now)).toBe("aujourdhui"); // ce matin : pas encore "en retard"
    expect(plannedGroup("2025-10-06T21:59:00Z", now)).toBe("aujourdhui");
    expect(plannedGroup("2025-10-06T22:30:00Z", now)).toBe("demain"); // 00:30 le 7 à Bruxelles
    expect(plannedGroup("2025-10-12T10:00:00Z", now)).toBe("semaine");
    expect(plannedGroup("2025-10-20T10:00:00Z", now)).toBe("plus-tard");
  });
});

describe("dates rapides", () => {
  it("propose aujourd'hui, demain et le lundi suivant (jamais le jour même)", () => {
    expect(quickDueDates("2025-10-08").map((d) => d.date)).toEqual(["2025-10-08", "2025-10-09", "2025-10-13"]);
    expect(quickDueDates("2025-10-06")[2].date).toBe("2025-10-13"); // un lundi → le lundi d'après
    expect(quickDueDates("2025-10-12")[2].date).toBe("2025-10-13"); // un dimanche → le lendemain
  });
});
