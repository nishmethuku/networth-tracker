import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Help, { HELP_ITEMS } from "../Help";

describe("Help", () => {
  it("answers the common questions", () => {
    render(<Help />);
    for (const [question] of HELP_ITEMS) {
      expect(screen.getByText(question)).toBeTruthy();
    }
    expect(HELP_ITEMS.length).toBeGreaterThanOrEqual(6);
  });

  it("does not show a contact link when no support address is configured", () => {
    render(<Help />);
    expect(screen.queryByText(/send a message/i)).toBeNull();
  });
});
