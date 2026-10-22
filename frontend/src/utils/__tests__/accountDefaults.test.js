import { describe, it, expect } from "vitest";
import { defaultAccountName, FALLBACK_ACCOUNT_NAME } from "../accountDefaults";

describe("defaultAccountName", () => {
  it("falls back to Main account when there are no accounts or none are in use", () => {
    expect(defaultAccountName([])).toBe(FALLBACK_ACCOUNT_NAME);
    expect(defaultAccountName(undefined)).toBe("Main account");
    expect(defaultAccountName([{ name: "Empty", holdingCount: 0 }])).toBe("Main account");
  });
  it("uses the account with the most holdings", () => {
    expect(
      defaultAccountName([
        { name: "Chase", holdingCount: 1 },
        { name: "Fidelity", holdingCount: 4 },
      ]),
    ).toBe("Fidelity");
  });
  it("breaks ties by name so the choice is stable", () => {
    expect(
      defaultAccountName([
        { name: "Zed", holdingCount: 2 },
        { name: "Alpha", holdingCount: 2 },
      ]),
    ).toBe("Alpha");
  });
});
