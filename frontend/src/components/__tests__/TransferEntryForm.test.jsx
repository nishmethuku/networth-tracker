import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const accounts = { current: [] };
const createTransfer = vi.fn(() => Promise.resolve({}));

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../api", () => ({
  fetchHoldings: vi.fn(() => Promise.resolve(accounts.current)),
  createTransfer: (p) => createTransfer(p),
  ApiError: class ApiError extends Error {},
}));

import TransferEntryForm from "../budget/TransferEntryForm";

const style = {};

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TransferEntryForm inputStyle={style} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("transfer between accounts", () => {
  it("asks for two accounts when there are fewer", async () => {
    accounts.current = [{ id: 1, name: "Checking", account: "Chase" }];
    renderForm();
    expect(await screen.findByText(/at least two cash or bank accounts/i)).toBeInTheDocument();
  });

  it("moves money from one account to another", async () => {
    accounts.current = [
      { id: 1, name: "Checking", account: "Chase" },
      { id: 2, name: "Savings", account: "Ally" },
    ];
    renderForm();
    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.click(screen.getByText("Move money"));
    await waitFor(() => expect(createTransfer).toHaveBeenCalled());
    expect(createTransfer.mock.calls[0][0]).toMatchObject({ from_holding_id: "1", to_holding_id: "2", amount: 250 });
  });

  it("refuses the same account on both sides", async () => {
    accounts.current = [
      { id: 1, name: "Checking", account: "Chase" },
      { id: 2, name: "Savings", account: "Ally" },
    ];
    renderForm();
    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Move money"));
    expect(await screen.findByText("Pick two different accounts")).toBeInTheDocument();
    expect(createTransfer).not.toHaveBeenCalled();
  });
});
