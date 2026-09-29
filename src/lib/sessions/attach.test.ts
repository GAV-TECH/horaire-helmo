import { describe, expect, it } from "vitest";
import { attachToSessions } from "./attach";

const sessions = [{ key: "uid-a", courseKey: "reseaux", start: "2025-10-06T06:30:00.000Z" }];
const note = (id: string, sessionKey: string, courseKey: string, sessionStart: string) => ({ id, sessionKey, courseKey, sessionStart });

describe("attachToSessions", () => {
  it("range par séance, via l'UID ou la correspondance de secours, et isole les orphelines", () => {
    const notes = [
      note("1", "uid-a", "reseaux", sessions[0].start),
      note("2", "ancien-uid", "reseaux", sessions[0].start),
      note("3", "disparu", "maths", "2025-10-09T08:00:00.000Z"),
    ];
    const { bySession, orphans } = attachToSessions(notes, (n) => n, sessions);
    expect(bySession.get("uid-a")?.map((n) => n.id)).toEqual(["1", "2"]);
    expect(orphans.map((n) => n.id)).toEqual(["3"]);
  });

  it("ignore les éléments sans référence de séance (ex. listes globales)", () => {
    const { bySession, orphans } = attachToSessions([{ id: "x" }], () => null, sessions);
    expect(bySession.size).toBe(0);
    expect(orphans).toEqual([]);
  });
});
