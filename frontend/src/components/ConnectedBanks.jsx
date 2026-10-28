import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import Card from "./Card";
import { ApiError, createSyncLinkToken, disconnectSyncConnection, exchangeSyncToken, fetchSyncStatus, pullSyncConnection } from "../api";
import { useToast } from "../contexts/ToastContext";
import { isDemoMode } from "../lib/demoMode";

const buttonStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.875rem",
};

/** Opens the bank's sign-in window as soon as it is ready. Rendered only while a link token exists. */
function LinkLauncher({ token, onSuccess, onClose }) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (publicToken, metadata) => onSuccess(publicToken, metadata?.institution?.name),
    onExit: onClose,
  });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}

function timeAgo(iso) {
  if (!iso) return "not synced yet";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Settings card: link a bank and pull its transactions into Expenses. Hidden until the backend has syncing switched on. */
export default function ConnectedBanks() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [linkToken, setLinkToken] = useState(null);
  const demo = isDemoMode();

  const { data } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    enabled: !demo,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    for (const key of ["budget-entries", "budget-summary"]) queryClient.invalidateQueries({ queryKey: [key] });
  };
  const fail = (fallback) => (err) => toast.error(err instanceof ApiError ? err.message : fallback);

  const pull = useMutation({
    mutationFn: (id) => pullSyncConnection(id),
    onSuccess: (r) => {
      toast.success(r.added === 0 ? "Already up to date" : `Added ${r.added} transaction${r.added === 1 ? "" : "s"}`);
      refresh();
    },
    onError: (err) => {
      fail("Could not sync that bank")(err);
      refresh();
    },
  });

  const start = useMutation({
    mutationFn: createSyncLinkToken,
    onSuccess: (r) => setLinkToken(r.link_token),
    onError: fail("Could not start the bank connection"),
  });

  const connect = useMutation({
    mutationFn: ({ publicToken, institutionName }) => exchangeSyncToken({ publicToken, institutionName }),
    onSuccess: (conn) => {
      toast.success(`${conn.institution_name || "Bank"} connected`);
      refresh();
      pull.mutate(conn.id);
    },
    onError: fail("Could not save that bank"),
  });

  const disconnect = useMutation({
    mutationFn: (id) => disconnectSyncConnection(id),
    onSuccess: () => {
      toast.success("Bank disconnected");
      refresh();
    },
    onError: fail("Could not disconnect that bank"),
  });

  if (demo || !data?.enabled) return null;
  const connections = data.connections || [];

  return (
    <Card
      title="Connected banks"
      subtitle="Pull purchases and deposits into Expenses automatically. Your bank password never reaches this app."
    >
      {linkToken && (
        <LinkLauncher
          token={linkToken}
          onSuccess={(publicToken, institutionName) => {
            setLinkToken(null);
            connect.mutate({ publicToken, institutionName });
          }}
          onClose={() => setLinkToken(null)}
        />
      )}

      {connections.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.75rem" }}>
          {connections.map((c) => (
            <li
              key={c.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}
            >
              <span style={{ minWidth: 0 }}>
                <strong>{c.institution_name || "Bank"}</strong>
                <span
                  style={{ display: "block", fontSize: "0.8125rem", color: c.status === "error" ? "var(--danger)" : "var(--text-muted)" }}
                >
                  {c.status === "error" ? c.last_error || "Needs attention" : `Synced ${timeAgo(c.last_synced_at)}`}
                </span>
              </span>
              <span style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={pull.isPending}
                  onClick={() => pull.mutate(c.id)}
                  aria-label={`Sync ${c.institution_name || "bank"} now`}
                >
                  {pull.isPending && pull.variables === c.id ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  style={{ ...buttonStyle, color: "var(--danger)" }}
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (window.confirm(`Disconnect ${c.institution_name || "this bank"}? Entries already added stay.`))
                      disconnect.mutate(c.id);
                  }}
                  aria-label={`Disconnect ${c.institution_name || "bank"}`}
                >
                  Disconnect
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => start.mutate()}
        disabled={start.isPending || connect.isPending || !!linkToken}
        style={{
          ...buttonStyle,
          marginTop: "0.9rem",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
        }}
      >
        {start.isPending ? "Opening…" : "Connect a bank"}
      </button>
    </Card>
  );
}
