import { describe, it, expect } from "vitest";
import { GLOSSARY } from "../glossary";

describe("glossary", () => {
  it("has a name and a plain explanation for every term", () => {
    for (const [key, t] of Object.entries(GLOSSARY)) {
      expect(t.name, key).toBeTruthy();
      expect(t.text.length, key).toBeGreaterThan(30);
    }
  });
  it("avoids em dashes in its wording", () => {
    for (const t of Object.values(GLOSSARY)) expect(t.text).not.toContain("—");
  });
});
