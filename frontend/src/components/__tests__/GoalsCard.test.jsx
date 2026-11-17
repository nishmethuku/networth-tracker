import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const goals = { current: [] };

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../api", () => ({
  fetchGoals: () => Promise.resolve(goals.current),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import GoalsCard from "../dashboard/GoalsCard";

function renderCard(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GoalsCard currentNetWorth={50000} displayCurrency="USD" history={[]} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("GoalsCard savings goals", () => {
  it("measures a savings goal against what was saved, not net worth", async () => {
    goals.current = [{ id: 1, name: "India trip", targetAmount: 2000, currency: "USD", targetDate: null, savedAmount: 500 }];
    renderCard();
    expect(await screen.findByText(/25% there/)).toBeInTheDocument();
    expect(screen.getByText(/to go/)).toBeInTheDocument();
  });

  it("shows savings progress even when the display currency differs", async () => {
    goals.current = [{ id: 1, name: "Flat deposit", targetAmount: 100000, currency: "INR", targetDate: null, savedAmount: 25000 }];
    renderCard({ displayCurrency: "USD" });
    expect(await screen.findByText(/25% there/)).toBeInTheDocument();
    expect(screen.queryByText(/switch your display currency/i)).toBeNull();
  });

  it("still measures a goal without a saved amount against net worth", async () => {
    goals.current = [{ id: 2, name: "Retirement", targetAmount: 100000, currency: "USD", targetDate: null, savedAmount: null }];
    renderCard();
    expect(await screen.findByText(/50% there/)).toBeInTheDocument();
  });

  it("suggests a monthly amount for a savings goal with a date", async () => {
    const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    goals.current = [{ id: 3, name: "Trip", targetAmount: 1200, currency: "USD", targetDate: inAYear, savedAmount: 0 }];
    renderCard();
    expect(await screen.findByText(/save about/i)).toBeInTheDocument();
    expect(screen.queryByText(/5% growth/)).toBeNull();
  });
});
