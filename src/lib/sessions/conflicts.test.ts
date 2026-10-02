import { describe, expect, it } from "vitest";
import { findConflicts } from "./conflicts";

const s = (id: string, start: string, end: string, over: { allDay?: boolean; status?: "active" | "cancelled" } = {}) => ({
  id,
  start: `2025-10-06T${start}:00.000Z`,
  end: `2025-10-06T${end}:00.000Z`,
  allDay: false,
  status: "active" as const,
  ...over,
});
const NOW = "2025-10-06T05:00:00.000Z";
const ids = (list: ReturnType<typeof s>[], now = NOW) => findConflicts(list, now).map(([a, b]) => `${a.id}+${b.id}`);

describe("findConflicts", () => {
  it("repère les chevauchements, pas les séances qui se suivent", () => {
    expect(ids([s("b", "09:00", "11:00"), s("a", "08:00", "10:00"), s("c", "11:00", "12:00")])).toEqual(["a+b"]);
  });
  it("une longue séance peut être en conflit avec plusieurs", () => {
    expect(ids([s("long", "08:00", "12:00"), s("x", "09:00", "10:00"), s("y", "10:00", "11:00")])).toEqual(["long+x", "long+y"]);
  });
  it("ignore les séances annulées, terminées et « toute la journée »", () => {
    expect(ids([s("a", "08:00", "10:00"), s("annulee", "09:00", "11:00", { status: "cancelled" })])).toEqual([]);
    expect(ids([s("a", "08:00", "10:00"), s("jour", "00:00", "23:00", { allDay: true })])).toEqual([]);
    expect(ids([s("a", "08:00", "10:00"), s("b", "09:00", "11:00")], "2025-10-06T10:30:00.000Z")).toEqual([]); // a est finie
  });
});
