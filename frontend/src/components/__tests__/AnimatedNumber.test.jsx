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

  it("eventually reaches the new target value after it changes (animated path)", async () => {
    render(<AnimatedNumber value={0} format={(v) => Math.round(v).toString()} duration={0.05} />);
    expect(screen.getByText("0")).toBeInTheDocument();

    const { rerender } = render(<AnimatedNumber value={0} format={(v) => Math.round(v).toString()} duration={0.05} />);
    rerender(<AnimatedNumber value={200} format={(v) => Math.round(v).toString()} duration={0.05} />);

    await waitFor(() => expect(screen.getByText("200")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("renders the raw value with no formatter when format is omitted", () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
