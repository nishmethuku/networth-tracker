import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import AnimatedNumber from "../AnimatedNumber";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnimatedNumber", () => {
  it("renders the initial value immediately on first mount", () => {
    render(<AnimatedNumber value={1500} format={(v) => `$${Math.round(v)}`} />);
    expect(screen.getByText("$1500")).toBeInTheDocument();
  });

  it("eventually reaches the new target value after it changes (animated path)", () => {
    // This used to drive real requestAnimationFrame callbacks through jsdom
    // and wait on real wall-clock time -- flaky under CI's slower/less
    // consistent runners in two different ways (seen in practice): the
    // component briefly rendering a wildly wrong negative number (fixed
    // separately in AnimatedNumber.jsx's own t-clamping), and, even after
    // that fix, the animation never advancing past 0 within the wait
    // budget at all. Both came from the same root cause -- jsdom's rAF
    // timestamps don't reliably advance in lockstep with performance.now()
    // under CI. Stubbing both from one fully controlled fake clock removes
    // that environment dependency instead of chasing further timing edge
    // cases.
    let now = 0;
    const pendingFrames = [];
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      pendingFrames.push(cb);
      return pendingFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    function advance(ms) {
      now += ms;
      const due = pendingFrames.splice(0, pendingFrames.length);
      due.forEach((cb) => cb(now));
    }

    const { rerender } = render(<AnimatedNumber value={0} format={(v) => Math.round(v).toString()} duration={0.05} />);
    expect(screen.getByText("0")).toBeInTheDocument();

    rerender(<AnimatedNumber value={200} format={(v) => Math.round(v).toString()} duration={0.05} />);

    act(() => {
      advance(60); // past the 50ms duration -- animation completes in this one frame
    });

    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("renders the raw value with no formatter when format is omitted", () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
