import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const status = { current: { enabled: false, provider: null, connections: [] } };
const pullSyncConnection = vi.fn();
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock("../../api", () => ({
  ApiError: class ApiError extends Error {},
  fetchSyncStatus: () => Promise.resolve(status.current),
  createSyncLinkToken: vi.fn(),
  exchangeSyncToken: vi.fn(),
  pullSyncConnection: (...a) => pullSyncConnection(...a),
  disconnectSyncConnection: vi.fn(),
}));
vi.mock("react-plaid-link", () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../../lib/demoMode", () => ({ isDemoMode: () => false }));

import ConnectedBanks from "../ConnectedBanks";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConnectedBanks />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  pullSyncConnection.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe("ConnectedBanks", () => {
  it("stays hidden when syncing is not turned on", async () => {
    status.current = { enabled: false, provider: null, connections: [] };
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("lists a linked bank and syncs it on request", async () => {
    status.current = {
      enabled: true,
      provider: "plaid",
      connections: [{ id: 7, institution_name: "First Platypus Bank", status: "active", last_synced_at: null }],
    };
    pullSyncConnection.mockResolvedValue({ added: 3, skipped_duplicates: 0, skipped_pending: 0 });
    renderCard();
    expect(await screen.findByText("First Platypus Bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect a bank/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sync first platypus bank now/i }));
    await waitFor(() => expect(pullSyncConnection).toHaveBeenCalledWith(7));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added 3 transactions"));
  });

  it("shows what went wrong for a bank that needs attention", async () => {
    status.current = {
      enabled: true,
      provider: "plaid",
      connections: [
        { id: 1, institution_name: "Old Bank", status: "error", last_error: "The bank needs you to sign in again. Reconnect it." },
      ],
    };
    renderCard();
    expect(await screen.findByText(/sign in again/i)).toBeInTheDocument();
  });
});
