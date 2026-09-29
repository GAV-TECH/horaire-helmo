import { describe, expect, it } from "vitest";
import type { Group } from "./data/types";
import { canEdit, doneSummary, formatInviteCode, inviteUrl } from "./groups";

const members = [
  { userId: "a", displayName: "Alice", role: "admin" as const, joinedAt: "2025-01-01T00:00:00.000Z" },
  { userId: "b", displayName: "Bob", role: "member" as const, joinedAt: "2025-01-02T00:00:00.000Z" },
];
const group = (myRole: "admin" | "member"): Group => ({ id: "g", name: "Bloc 2", inviteCode: "X", myRole, members });

describe("groupes", () => {
  it("met en forme le code d'invitation", () => {
    expect(formatInviteCode("A3F9C27E1B00")).toBe("A3F9-C27E-1B00");
    expect(inviteUrl("https://app.test", "A3F9C27E1B00")).toBe("https://app.test/groupes/rejoindre?code=A3F9C27E1B00");
  });

  it("applique les mêmes droits que le RLS", () => {
    expect(canEdit({ ownerId: "me", groupId: null }, "me", [])).toBe(true);
    expect(canEdit({ ownerId: "other", groupId: null }, "me", [])).toBe(false);
    expect(canEdit({ ownerId: "other", groupId: "g" }, "me", [group("member")])).toBe(false);
    expect(canEdit({ ownerId: "other", groupId: "g" }, "me", [group("admin")])).toBe(true);
    expect(canEdit({ ownerId: "other", groupId: "inconnu" }, "me", [group("admin")])).toBe(false);
  });

  it("résume qui a fait un élément partagé, sans compter les anciens membres", () => {
    expect(doneSummary(["b", "ancien"], members)).toEqual({ done: 1, total: 2, names: ["Bob"] });
  });
});
