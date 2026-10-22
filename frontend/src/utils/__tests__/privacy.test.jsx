import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { isPrivacyOn, setPrivacy, togglePrivacy, MASK } from "../privacy";
import { formatCurrencyCompact, formatCurrencyForDisplay } from "../formatters";
import PrivacyToggle from "../../components/PrivacyToggle";

afterEach(() => {
  setPrivacy(false);
  localStorage.clear();
});

describe("privacy mode", () => {
  it("is off by default and formatters show real amounts", () => {
    expect(isPrivacyOn()).toBe(false);
    expect(formatCurrencyCompact(24000, "USD")).toBe("$24K USD");
    expect(formatCurrencyForDisplay(42.5, "USD", { includeCode: false, alwaysCents: true })).toBe("$42.50");
  });

  it("masks every currency formatter but keeps the currency symbol", () => {
    setPrivacy(true);
    expect(formatCurrencyCompact(24000, "USD")).toBe(`$${MASK}`);
    expect(formatCurrencyCompact(-5, "INR")).toBe(`₹${MASK}`);
    expect(formatCurrencyForDisplay(1234.5, "USD")).toBe(`$${MASK}`);
  });

  it("remembers the choice on this device", () => {
    setPrivacy(true);
    expect(localStorage.getItem("nw_privacy")).toBe("1");
    togglePrivacy();
    expect(isPrivacyOn()).toBe(false);
    expect(localStorage.getItem("nw_privacy")).toBe("0");
  });

  it("the toggle button flips the mode and updates its label", () => {
    render(<PrivacyToggle />);
    const btn = screen.getByRole("button", { name: "Hide amounts" });
    fireEvent.click(btn);
    expect(isPrivacyOn()).toBe(true);
    expect(screen.getByRole("button", { name: "Show amounts" }).getAttribute("aria-pressed")).toBe("true");
    act(() => togglePrivacy());
    expect(screen.getByRole("button", { name: "Hide amounts" })).toBeTruthy();
  });
});
