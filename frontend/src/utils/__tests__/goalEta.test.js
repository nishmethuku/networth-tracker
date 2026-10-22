import { describe, it, expect } from "vitest";
import { goalEta } from "../goalEta";

const history = [
  { date: "2026-04-22", netWorth: 10000 },
  { date: "2026-10-22", netWorth: 16000 },
];

describe("goalEta", () => {
  it("projects at the recent monthly pace", () => {
    // about +997/month; 3500 to go
    const r = goalEta(history, 16000, 19500, "2026-10-22");
    expect(r.months).toBe(4);
    expect(r.reachedMonth).toBe("2027-02");
  });

  it("rolls over the year correctly", () => {
    const r = goalEta(history, 16000, 28500, "2026-10-22");
    expect(r.months).toBe(13);
    expect(r.reachedMonth).toBe("2027-11");
  });

  it("returns null when met, flat, falling or history is too short", () => {
    expect(goalEta(history, 16000, 15000, "2026-10-22")).toBeNull();
    expect(
      goalEta(
        [
          { date: "2026-04-22", netWorth: 16000 },
          { date: "2026-10-22", netWorth: 16000 },
        ],
        16000,
        20000,
        "2026-10-22",
      ),
    ).toBeNull();
    expect(
      goalEta(
        [
          { date: "2026-04-22", netWorth: 20000 },
          { date: "2026-10-22", netWorth: 16000 },
        ],
        16000,
        20000,
        "2026-10-22",
      ),
    ).toBeNull();
    expect(
      goalEta(
        [
          { date: "2026-10-01", netWorth: 1 },
          { date: "2026-10-22", netWorth: 100 },
        ],
        100,
        200,
        "2026-10-22",
      ),
    ).toBeNull();
    expect(goalEta(null, 1, 2, "2026-10-22")).toBeNull();
  });

  it("refuses absurdly far dates", () => {
    const slow = [
      { date: "2026-04-22", netWorth: 15999 },
      { date: "2026-10-22", netWorth: 16000 },
    ];
    expect(goalEta(slow, 16000, 1000000, "2026-10-22")).toBeNull();
  });
});
