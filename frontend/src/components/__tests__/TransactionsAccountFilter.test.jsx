import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchAllTransactions = vi.fn(() => Promise.resolve({ items: [], total: 0, page: 1, perPage: 50, totalPages: 0 }));

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock("../../contexts/HouseholdContext", () => ({ useHousehold: () => ({ currentHouseholdId: null }) }));
vi.mock("../../api", () => ({
  fetchAllTransactions: (f) => fetchAllTransactions(f),
  fetchHoldings: () =>
    Promise.resolve([
      { id: 1, assetType: "stock", account: "Zerodha" },
      { id: 2, assetType: "stock", account: "Fidelity" },
      { id: 3, assetType: "cash", account: "Chase" },
      { id: 4, assetType: "real_estate", account: "" },
    ]),
  deleteTransaction: vi.fn(),
  restoreTransaction: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import Transactions from "../Transactions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("transactions account filter", () => {
  it("lists the accounts under the chosen type, A to Z, and filters by the one picked", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Transactions />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const names = (select) => [...select.querySelectorAll("option")].map((o) => o.textContent);
    const account = () => screen.getByLabelText("Filter by account");
    await screen.findByLabelText("Filter by account");
    await waitFor(() => expect(account().querySelectorAll("option").length).toBe(4));
    expect(names(account())).toEqual(["All Accounts", "Chase", "Fidelity", "Zerodha"]);

    fireEvent.change(screen.getByLabelText("Filter by asset type"), { target: { value: "stock" } });
    await waitFor(() => expect(account().querySelectorAll("option").length).toBe(3));
    expect(names(account())).toEqual(["All accounts in this type", "Fidelity", "Zerodha"]);

    fireEvent.change(account(), { target: { value: "Fidelity" } });
    await waitFor(() => expect(fetchAllTransactions.mock.calls.some((c) => c[0].account === "Fidelity")).toBe(true));

    fireEvent.change(await screen.findByLabelText("Filter by asset type"), { target: { value: "cash" } });
    await waitFor(() => expect(fetchAllTransactions.mock.calls.some((c) => c[0].assetType === "cash" && c[0].account === "")).toBe(true));
  });
});
