import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const data = { current: { items: [], summary: [] } };
const createRemittance = vi.fn(() => Promise.resolve({}));
const deleteRemittance = vi.fn(() => Promise.resolve());

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../api", () => ({
  fetchRemittances: () => Promise.resolve(data.current),
  createRemittance: (...a) => createRemittance(...a),
  updateRemittance: vi.fn(),
  deleteRemittance: (...a) => deleteRemittance(...a),
  ApiError: class ApiError extends Error {},
}));

import Remittances from "../Remittances";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Remittances />
    </QueryClientProvider>,
  );
}

const item = {
  id: 7,
  sent_date: "2026-03-10",
  recipient: "Mom",
  provider: "Wise",
  amount_sent: 500,
  currency_sent: "USD",
  amount_received: 41000,
  currency_received: "INR",
  fee: 3,
  effective_rate: 82,
  note: null,
};
const summary = {
  currency_sent: "USD",
  currency_received: "INR",
  count: 1,
  total_sent: 500,
  total_received: 41000,
  total_fees: 3,
  fee_percent: 0.6,
  average_rate: 82,
  best_rate: 82,
  worst_rate: 82,
  latest_rate: 82,
  year: 2026,
  year_sent: 500,
  year_received: 41000,
  recipients: [{ recipient: "Mom", sent: 500 }],
  months: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, sent: i === 11 ? 500 : 0 })),
};

beforeEach(() => {
  createRemittance.mockClear();
  deleteRemittance.mockClear();
  data.current = { items: [], summary: [] };
});
afterEach(cleanup);

describe("Remittances", () => {
  it("explains the empty state", async () => {
    renderPage();
    expect(await screen.findByText(/No transfers logged yet/)).toBeInTheDocument();
  });

  it("previews the rate while typing and sends numbers to the API", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Sent to"), { target: { value: "Mom" } });
    fireEvent.change(screen.getByLabelText("You paid (fee included)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("They received"), { target: { value: "41000" } });
    expect(screen.getByText(/1 USD = 82\.00 INR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add transfer" }));
    await waitFor(() => expect(createRemittance).toHaveBeenCalled());
    const body = createRemittance.mock.calls[0][0];
    expect(body).toMatchObject({
      recipient: "Mom",
      amount_sent: 500,
      amount_received: 41000,
      fee: 0,
      currency_sent: "USD",
      currency_received: "INR",
    });
  });

  it("shows the summary and history and deletes a row", async () => {
    data.current = { items: [item], summary: [summary] };
    renderPage();
    expect(await screen.findByText("USD to INR")).toBeInTheDocument();
    expect(screen.getByText("Average rate you got")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete transfer to Mom on 2026-03-10/ }));
    await waitFor(() => expect(deleteRemittance).toHaveBeenCalled());
    expect(deleteRemittance.mock.calls[0][0]).toBe(7);
  });
});
