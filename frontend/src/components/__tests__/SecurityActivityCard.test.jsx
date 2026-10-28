import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const signOutEverywhere = vi.fn();
const toastError = vi.fn();
const events = { current: [] };
const failing = { current: false };

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ signOutEverywhere }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: toastError, success: vi.fn() }) }));
vi.mock("../../api", () => ({
  fetchSecurityActivity: () => (failing.current ? Promise.reject(new Error("nope")) : Promise.resolve(events.current)),
}));

import SecurityActivityCard from "../SecurityActivityCard";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SecurityActivityCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  signOutEverywhere.mockReset();
  toastError.mockReset();
  events.current = [];
  failing.current = false;
});
afterEach(cleanup);

describe("SecurityActivityCard", () => {
  it("explains an empty log", async () => {
    renderCard();
    expect(await screen.findByText(/nothing yet/i)).toBeInTheDocument();
  });

  it("lists events with a readable device name", async () => {
    events.current = [
      {
        id: 2,
        event_type: "data.exported",
        label: "Downloaded a copy of your data",
        detail: "CSV zip",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        created_at: "2026-10-27T12:00:00Z",
      },
      {
        id: 1,
        event_type: "bank.connected",
        label: "Connected a bank",
        detail: null,
        user_agent: null,
        created_at: "2026-10-26T12:00:00Z",
      },
    ];
    renderCard();
    expect(await screen.findByText("Downloaded a copy of your data (CSV zip)")).toBeInTheDocument();
    expect(screen.getByText(/Safari on macOS/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown device/)).toBeInTheDocument();
  });

  it("says so when the log cannot load", async () => {
    failing.current = true;
    renderCard();
    expect(await screen.findByText(/could not load your security activity/i)).toBeInTheDocument();
  });

  it("signs out of every device", async () => {
    signOutEverywhere.mockResolvedValue();
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));
    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalled());
  });

  it("shows an error and re-enables the button if sign out fails", async () => {
    signOutEverywhere.mockRejectedValue(new Error("network"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Sign out of all devices" })).toBeEnabled();
  });
});
