import { describe, it, expect } from "vitest";
import { ordinalSuffix } from "../MonthlySnapshots";

describe("ordinalSuffix", () => {
  it("uses st/nd/rd for 1, 2, 3 and their tens (except 11-13)", () => {
    expect(ordinalSuffix(1)).toBe("st");
    expect(ordinalSuffix(2)).toBe("nd");
    expect(ordinalSuffix(3)).toBe("rd");
    expect(ordinalSuffix(21)).toBe("st");
    expect(ordinalSuffix(22)).toBe("nd");
    expect(ordinalSuffix(23)).toBe("rd");
    expect(ordinalSuffix(31)).toBe("st");
  });

  it("uses th for 11, 12, 13 despite ending in 1/2/3", () => {
    expect(ordinalSuffix(11)).toBe("th");
    expect(ordinalSuffix(12)).toBe("th");
    expect(ordinalSuffix(13)).toBe("th");
  });

  it("uses th for everything else", () => {
    expect(ordinalSuffix(4)).toBe("th");
    expect(ordinalSuffix(10)).toBe("th");
    expect(ordinalSuffix(20)).toBe("th");
    expect(ordinalSuffix(30)).toBe("th");
  });
});
