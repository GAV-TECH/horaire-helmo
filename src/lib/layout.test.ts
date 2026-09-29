import { describe, expect, it } from "vitest";
import { layoutOverlaps } from "./layout";

const s = (id: string, start: string, end: string) => ({ id, start: `2025-10-06T${start}:00Z`, end: `2025-10-06T${end}:00Z` });

describe("layoutOverlaps", () => {
  it("laisse une séance seule sur toute la largeur", () => {
    expect(layoutOverlaps([s("a", "08:00", "10:00")])).toEqual([{ item: expect.anything(), lane: 0, lanes: 1 }]);
  });

  it("place deux séances qui se chevauchent côte à côte", () => {
    const placed = layoutOverlaps([s("a", "08:00", "10:00"), s("b", "09:00", "11:00")]);
    expect(placed.map((p) => [p.item.id, p.lane, p.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("réutilise une colonne libérée et ne mélange pas des groupes indépendants", () => {
    const placed = layoutOverlaps([
      s("a", "08:00", "10:00"),
      s("b", "08:30", "09:00"),
      s("c", "09:00", "09:30"), // reprend la colonne de b
      s("d", "13:00", "14:00"), // groupe séparé
    ]);
    expect(placed.map((p) => [p.item.id, p.lane, p.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 1, 2],
      ["d", 0, 1],
    ]);
  });

  it("considère que deux séances qui se touchent ne se chevauchent pas", () => {
    const placed = layoutOverlaps([s("a", "08:00", "10:00"), s("b", "10:00", "12:00")]);
    expect(placed.every((p) => p.lanes === 1 && p.lane === 0)).toBe(true);
  });
});
