import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchAllTransactions = vi.fn(() => Promise.resolve({ items: [], total: 0, page: 1, perPage: 50, totalPages: 0 }));

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock("../../contexts/HouseholdContext", () => ({ useHousehold: () => ({ currentHouseholdId: null }) }));
vi.mock("../../api", () => ({
  fetchAllTransactions: (f) => fetchAllTransactions(f),
  fetchAccounts: () =>
    Promise.resolve([
      { id: 1, name: "Zerodha" },
      { id: 2, name: "Chase" },
    ]),
  fetchHoldings: () => Promise.resolve([]),
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
  it("lists accounts A to Z and filters by the one picked", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Transactions />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const select = await screen.findByLabelText("Filter by account");
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(3));
    expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["All Accounts", "Chase", "Zerodha"]);
    fireEvent.change(select, { target: { value: "Chase" } });
    await waitFor(() => expect(fetchAllTransactions.mock.calls.some((c) => c[0].account === "Chase")).toBe(true));
  });
});
