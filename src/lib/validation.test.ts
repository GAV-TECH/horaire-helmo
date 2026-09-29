import { describe, expect, it } from "vitest";
import { brusselsToIso, isoToBrusselsInputs } from "./time";
import { deadlineSchema, isAllowedIcsUrl, todoItemSchema, todoListSchema } from "./validation";

describe("heures saisies à Bruxelles", () => {
  it("convertit en UTC selon l'heure d'été ou d'hiver", () => {
    expect(brusselsToIso("2025-10-06", "08:30")).toBe("2025-10-06T06:30:00.000Z");
    expect(brusselsToIso("2025-12-01", "08:30")).toBe("2025-12-01T07:30:00.000Z");
  });

  it("fait l'aller-retour pour pré-remplir un formulaire", () => {
    expect(isoToBrusselsInputs("2025-10-06T06:30:00.000Z")).toEqual({ date: "2025-10-06", time: "08:30" });
  });
});

describe("isAllowedIcsUrl", () => {
  const hosts = ["mon-espace.helmo.be"];
  it("accepte le domaine de l'école en https", () => {
    expect(isAllowedIcsUrl("https://mon-espace.helmo.be/MonHoraire/Fichier?token=x", hosts)).toBe(true);
  });
  it("refuse http, les autres domaines et les adresses internes", () => {
    expect(isAllowedIcsUrl("http://mon-espace.helmo.be/x", hosts)).toBe(false);
    expect(isAllowedIcsUrl("https://mon-espace.helmo.be.pirate.test/x", hosts)).toBe(false);
    expect(isAllowedIcsUrl("https://169.254.169.254/latest", hosts)).toBe(false);
    expect(isAllowedIcsUrl("pas une url", hosts)).toBe(false);
  });
});

describe("deadlineSchema", () => {
  it("met 23:59 par défaut et calcule la clé du cours", () => {
    const result = deadlineSchema.parse({ title: " Rapport ", date: "2025-10-10", time: "", courseName: "Réseaux", priority: "1" });
    expect(result).toMatchObject({
      title: "Rapport",
      due_at: "2025-10-10T21:59:00.000Z",
      course_key: "reseaux",
      priority: 1,
      details: null,
    });
  });

  it("refuse un titre vide ou une priorité hors limites", () => {
    expect(deadlineSchema.safeParse({ title: "  ", date: "2025-10-10" }).success).toBe(false);
    expect(deadlineSchema.safeParse({ title: "x", date: "2025-10-10", priority: "7" }).success).toBe(false);
  });
});

describe("todoListSchema", () => {
  it("exige un cours pour une liste de cours", () => {
    expect(todoListSchema.safeParse({ scope: "course", title: "À faire" }).success).toBe(false);
    expect(todoListSchema.parse({ scope: "course", title: "À faire", courseName: "Anglais" })).toMatchObject({
      course_key: "anglais",
      session_key: null,
    });
  });

  it("ignore un cours envoyé pour une liste globale", () => {
    expect(todoListSchema.parse({ scope: "global", title: "Perso", courseName: "Anglais" }).course_key).toBeNull();
  });
});

describe("todoItemSchema", () => {
  it("rend l'échéance facultative", () => {
    const listId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    expect(todoItemSchema.parse({ listId, title: "Lire", dueDate: "" }).due_at).toBeNull();
    expect(todoItemSchema.parse({ listId, title: "Lire", dueDate: "2025-10-10", dueTime: "12:00" }).due_at).toBe(
      "2025-10-10T10:00:00.000Z",
    );
  });
});

describe("partage avec un groupe", () => {
  const g = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  it("vide = privé, sinon l'identifiant du groupe", () => {
    expect(deadlineSchema.parse({ title: "x", date: "2025-10-10", groupId: "" }).group_id).toBeNull();
    expect(deadlineSchema.parse({ title: "x", date: "2025-10-10", groupId: g }).group_id).toBe(g);
    expect(deadlineSchema.safeParse({ title: "x", date: "2025-10-10", groupId: "pas-un-id" }).success).toBe(false);
  });

  it("un projet : cours facultatif, partage possible", () => {
    expect(todoListSchema.parse({ scope: "project", title: "TFE", courseName: "", groupId: g })).toMatchObject({
      scope: "project",
      course_name: null,
      course_key: null,
      group_id: g,
    });
    expect(todoListSchema.parse({ scope: "project", title: "Projet béton", courseName: "Béton" }).course_key).toBe("beton");
    expect(todoListSchema.safeParse({ scope: "project", title: " " }).success).toBe(false);
  });

  it("une liste liée à une séance reste toujours privée", () => {
    const list = todoListSchema.parse({
      scope: "session", title: "x", courseName: "Réseaux", sessionKey: "k", sessionStart: "2025-10-06T06:30:00.000Z", groupId: g,
    });
    expect(list.group_id).toBeNull();
    expect(todoListSchema.parse({ scope: "global", title: "x", groupId: g }).group_id).toBe(g);
  });
});
