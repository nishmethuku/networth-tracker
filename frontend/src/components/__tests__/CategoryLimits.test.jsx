import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const limits = { current: [] };
const createBudgetLimit = vi.fn(() => Promise.resolve({ category: "groceries", monthlyLimit: 300, currency: "USD" }));
const deleteBudgetLimit = vi.fn(() => Promise.resolve());

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../contexts/HouseholdContext", () => ({ useHousehold: () => ({ currentHouseholdId: null }) }));
vi.mock("../../api", () => ({
  fetchBudgetLimits: () => Promise.resolve(limits.current),
  createBudgetLimit: (p) => createBudgetLimit(p),
  deleteBudgetLimit: (id) => deleteBudgetLimit(id),
  createBudgetCategory: vi.fn(),
  updateBudgetCategory: vi.fn(),
  deleteBudgetCategory: vi.fn(),
  restoreDefaultCategories: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import CategoryManager from "../expenses/CategoryManager";

const categories = {
  expense: ["groceries", "dining"],
  income: ["salary"],
  parents: { expense: {}, income: {} },
  items: { expense: [], income: [] },
};

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CategoryManager categories={categories} currency="USD" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Manage categories"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("per-category monthly limits", () => {
  it("sets a limit for one category", async () => {
    limits.current = [];
    renderManager();
    fireEvent.click(await screen.findByLabelText(/Set the monthly limit for Groceries/i));
    fireEvent.change(screen.getByLabelText(/Monthly limit for Groceries/i), { target: { value: "300" } });
    fireEvent.click(screen.getByText("Save limit"));
    await waitFor(() => expect(createBudgetLimit).toHaveBeenCalled());
    expect(createBudgetLimit.mock.calls[0][0]).toMatchObject({ category: "groceries", monthly_limit: 300, currency: "USD" });
  });

  it("shows an existing limit and can clear it", async () => {
    limits.current = [{ id: 7, category: "dining", monthlyLimit: 150, currency: "USD" }];
    renderManager();
    expect(await screen.findByText(/Limit\s+\$150\.00 USD\s*\/mo/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Remove the monthly limit for dining/i));
    await waitFor(() => expect(deleteBudgetLimit).toHaveBeenCalled());
    expect(deleteBudgetLimit.mock.calls[0][0]).toBe(7);
  });
});
