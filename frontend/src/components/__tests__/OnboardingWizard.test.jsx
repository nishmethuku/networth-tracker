import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const status = { current: { enabled: false } };
const navigate = vi.fn();

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../../api", () => ({ fetchSyncStatus: () => Promise.resolve(status.current) }));
vi.mock("../../lib/demoMode", () => ({ isDemoMode: () => false }));

import OnboardingWizard, { isOnboardingDismissed } from "../OnboardingWizard";

function renderWizard(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OnboardingWizard onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  status.current = { enabled: false };
});

afterEach(() => {
  cleanup();
});

describe("OnboardingWizard", () => {
  it("is an accessible dialog that starts on step 1 of 2", () => {
    renderWizard();
    expect(screen.getByRole("dialog", { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("suggests the matching currency when the country changes, until the person picks one", () => {
    renderWizard();
    const country = screen.getByLabelText("Primary country");
    const currency = screen.getByLabelText("Default display currency");

    fireEvent.change(country, { target: { value: "India" } });
    expect(currency).toHaveValue("INR");

    fireEvent.change(currency, { target: { value: "AUD" } });
    fireEvent.change(country, { target: { value: "United States" } });
    expect(currency).toHaveValue("AUD");
  });

  it("saves the currency, remembers the dismissal and goes to the chosen page", async () => {
    const onClose = renderWizard();
    fireEvent.change(screen.getByLabelText("Default display currency"), { target: { value: "AUD" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: /track spending/i }));

    expect(localStorage.getItem("default_display_currency")).toBe("AUD");
    expect(isOnboardingDismissed("u1")).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/expenses");
  });

  it("hides the bank option until bank syncing is switched on", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: /track spending/i });
    expect(screen.queryByRole("button", { name: /connect a bank/i })).not.toBeInTheDocument();
  });

  it("offers Connect a bank when syncing is on", async () => {
    status.current = { enabled: true };
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const bank = await screen.findByRole("button", { name: /connect a bank/i });
    fireEvent.click(bank);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings"));
  });

  it("closes on Escape without navigating and can be skipped from step 1", () => {
    const onClose = renderWizard();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(isOnboardingDismissed("u1")).toBe(true);
  });

  it("lets the person go back from step 2", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });
});
