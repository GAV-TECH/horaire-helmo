import { describe, expect, it } from "vitest";
import { indexSessions, matchSession } from "./match";

const sessions = [
  { key: "uid-a", courseKey: "reseaux", start: "2025-10-06T06:30:00.000Z" },
  { key: "uid-b", courseKey: "anglais", start: "2025-10-07T08:00:00.000Z" },
];
const index = indexSessions(sessions);

describe("matchSession", () => {
  it("retrouve la séance par UID", () => {
    expect(matchSession({ sessionKey: "uid-a", courseKey: "reseaux", sessionStart: sessions[0].start }, index)).toEqual({
      session: sessions[0],
      relinked: false,
    });
  });

  it("utilise cours + début quand l'UID a changé, et signale qu'il faut recoller", () => {
    const ref = { sessionKey: "ancien-uid", courseKey: "anglais", sessionStart: "2025-10-07T10:00:00+02:00" };
    expect(matchSession(ref, index)).toEqual({ session: sessions[1], relinked: true });
  });

  it("renvoie null quand aucune séance ne correspond (note orpheline)", () => {
    expect(matchSession({ sessionKey: "x", courseKey: "anglais", sessionStart: "2025-10-08T08:00:00.000Z" }, index)).toBeNull();
    expect(matchSession({ sessionKey: "x", courseKey: "maths", sessionStart: sessions[1].start }, index)).toBeNull();
  });
});
