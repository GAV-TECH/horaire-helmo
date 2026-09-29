import { describe, expect, it } from "vitest";
import { courseColor, courseGroupKey, courseKey, parseCourseTitle, sameCourse } from "./courses";

// Intitulés au format réel du flux HELMO (enseignants et locaux fictifs).
describe("parseCourseTitle", () => {
  it("sépare cours, type, enseignants et local", () => {
    expect(parseCourseTitle("Construction en Béton : théorie / DUPONT / 519 (CO)")).toEqual({
      course: "Construction en Béton",
      kind: "théorie",
      teachers: ["DUPONT"],
      room: "519 (CO)",
      isEvaluation: false,
    });
  });

  it("reconnaît le type après « - » et plusieurs enseignants", () => {
    const p = parseCourseTitle("Construction des machines - projet / MARTIN - LEROY - DUBOIS / 419 (CO)");
    expect(p.course).toBe("Construction des machines");
    expect(p.kind).toBe("projet");
    expect(p.teachers).toEqual(["MARTIN", "LEROY", "DUBOIS"]);
  });

  it("repère les évaluations, quel que soit le séparateur", () => {
    expect(parseCourseTitle("Microcontrôleurs : évaluation / DUPONT / B118 (CO)").isEvaluation).toBe(true);
    expect(parseCourseTitle("Systèmes Automatisés de Production (SAP) - évaluation / MARTIN / D101 (CO)")).toMatchObject({
      course: "Systèmes Automatisés de Production (SAP)",
      isEvaluation: true,
    });
    expect(parseCourseTitle("Thermodynamique : exercices / LEROY / 129 (CO)").isEvaluation).toBe(false);
  });

  it("garde tels quels les intitulés qui ne suivent pas le format", () => {
    expect(parseCourseTitle("Garden Party")).toMatchObject({ course: "Garden Party", kind: null, teachers: [], room: null });
    expect(parseCourseTitle("Modelling and system analysis : laboratoire et projet / LEROY / B-3 (88) (CO)").kind).toBe(
      "laboratoire et projet",
    );
  });
});

describe("un même cours malgré les variantes", () => {
  it("regroupe types, locaux et petites différences d'orthographe", () => {
    expect(sameCourse("Construction de machines / DUPONT / 519 (CO)", "Construction des machines - projet / MARTIN / 419 (CO)")).toBe(true);
    expect(sameCourse("Modelling system analysis : théorie / X / 629 (CO)", "Modelling and system analysis : évaluation / Y / 316 (CO)")).toBe(true);
    expect(sameCourse("Systèmes automatisés de production : théorie / X / D101 (CO)", "Systèmes Automatisés de Production (SAP) - évaluation / X / D101 (CO)")).toBe(true);
    expect(sameCourse("Thermodynamique", "Microcontrôleurs")).toBe(false);
  });

  it("accepte aussi une clé déjà normalisée (données existantes)", () => {
    const raw = "Construction en Béton : exercices / DUPONT / 501 (CO)";
    expect(courseGroupKey(courseKey(raw))).toBe(courseGroupKey("Construction en Béton"));
    expect(courseColor(courseKey(raw))).toBe(courseColor("Construction en Béton : théorie / MARTIN / 619 (CO)"));
  });
});
