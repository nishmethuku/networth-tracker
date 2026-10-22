import { describe, it, expect } from "vitest";
import { parseHiddenSections, toggleSection, serializeHiddenSections } from "../dashboardSections";

describe("dashboard sections", () => {
  it("parses saved ids and drops unknown or malformed ones", () => {
    expect([...parseHiddenSections('["chart","nope",5]')]).toEqual(["chart"]);
    expect(parseHiddenSections("not json").size).toBe(0);
    expect(parseHiddenSections('{"a":1}').size).toBe(0);
    expect(parseHiddenSections(null).size).toBe(0);
  });

  it("toggles without changing the original set", () => {
    const start = new Set(["chart"]);
    const added = toggleSection(start, "goals");
    expect(added.has("goals")).toBe(true);
    expect(start.has("goals")).toBe(false);
    expect(toggleSection(added, "chart").has("chart")).toBe(false);
  });

  it("serializes in a stable order", () => {
    expect(serializeHiddenSections(new Set(["goals", "chart"]))).toBe('["chart","goals"]');
  });
});
