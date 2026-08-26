import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import AnimatedNumber from "../AnimatedNumber";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AnimatedNumber", () => {
  it("renders the initial value immediately on first mount", () => {
    render(<AnimatedNumber value={1500} format={(v) => `$${Math.round(v)}`} />);
    expect(screen.getByText("$1500")).toBeInTheDocument();
  });

  // Generous timeouts below (vitest's own 5000ms default would kill this
  // before waitFor's budget even matters): this drives real
  // requestAnimationFrame callbacks through jsdom rather than fake timers,
  // and CI runners are slower and less consistent than a local machine --
  // a tight budget risks an occasional false failure unrelated to the
  // component actually working.
  const ANIMATION_TEST_TIMEOUT = 10000;
  it(
    "eventually reaches the new target value after it changes (animated path)",
    async () => {
      const { rerender } = render(<AnimatedNumber value={0} format={(v) => Math.round(v).toString()} duration={0.05} />);
      expect(screen.getByText("0")).toBeInTheDocument();

      rerender(<AnimatedNumber value={200} format={(v) => Math.round(v).toString()} duration={0.05} />);

      await waitFor(() => expect(screen.getByText("200")).toBeInTheDocument(), { timeout: 8000 });
    },
    ANIMATION_TEST_TIMEOUT,
  );

  it("renders the raw value with no formatter when format is omitted", () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
