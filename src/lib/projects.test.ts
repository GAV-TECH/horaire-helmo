import { describe, expect, it } from "vitest";
import type { TodoItem, TodoList } from "./data/types";
import { nextDueTask, projectProgress, sortProjects } from "./projects";

const item = (id: string, over: Partial<TodoItem> = {}): TodoItem => ({
  id, listId: "p", authorId: "me", title: id, dueAt: null, position: 0, done: false, doneBy: [], important: false, myDay: null, ...over,
});
const project = (title: string, items: TodoItem[]): TodoList => ({
  id: title, ownerId: "me", groupId: null, title, scope: "project", courseName: null, courseKey: null, sessionKey: null, sessionStart: null, items,
});

describe("projets", () => {
  it("calcule l'avancement", () => {
    expect(projectProgress(project("A", [item("1", { done: true }), item("2"), item("3"), item("4", { done: true })]))).toEqual({ done: 2, total: 4, percent: 50 });
    expect(projectProgress(project("vide", []))).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("trouve la prochaine échéance non faite", () => {
    const p = project("A", [
      item("fait", { done: true, dueAt: "2025-10-01T10:00:00.000Z" }),
      item("plus-tard", { dueAt: "2025-10-20T10:00:00.000Z" }),
      item("bientot", { dueAt: "2025-10-09T10:00:00.000Z" }),
      item("sans-date"),
    ]);
    expect(nextDueTask(p)?.id).toBe("bientot");
    expect(nextDueTask(project("B", [item("x")]))).toBeNull();
  });

  it("met en premier les projets à l'échéance la plus proche", () => {
    const list = sortProjects([
      project("Zèbre", []),
      project("Loin", [item("a", { dueAt: "2025-11-01T10:00:00.000Z" })]),
      project("Proche", [item("b", { dueAt: "2025-10-09T10:00:00.000Z" })]),
      project("Alpha", []),
    ]);
    expect(list.map((p) => p.title)).toEqual(["Proche", "Loin", "Alpha", "Zèbre"]);
  });
});
