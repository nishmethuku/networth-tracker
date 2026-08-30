import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchAccounts, createAccount, deleteAccount, ApiError } from "../api";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};

export default function Accounts() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();
  const [name, setName] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", currentHouseholdId],
    queryFn: () => fetchAccounts({ householdId: currentHouseholdId }),
  });

  const createMutation = useMutation({
    mutationFn: () => createAccount({ name: name.trim(), household_id: currentHouseholdId }),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`"${account.name}" added`);
      setName("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add account"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to delete account"),
  });

  if (isLoading) return <LoadingState message="Loading accounts..." />;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Accounts</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        The account names your holdings are grouped under (a brokerage, a bank account, a person's name). Add one ahead of time — before
        importing or adding a holding to it — or remove one that's no longer used.
      </p>

      <Card>
        {!accounts || accounts.length === 0 ? (
          <EmptyState message="No accounts yet." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {accounts.map((a) => (
              <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9375rem" }}>
                <span style={{ color: "var(--text)" }}>{a.name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    {a.holdingCount} holding{a.holdingCount === 1 ? "" : "s"}
                  </span>
                  {a.id != null && a.holdingCount === 0 ? (
                    <button
                      onClick={() => deleteMutation.mutate(a.id)}
                      disabled={deleteMutation.isPending}
                      style={{
                        padding: "0.3rem 0.7rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--danger)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Delete
                    </button>
                  ) : (
                    <span
                      style={{ fontSize: "0.75rem", color: "var(--text-muted)", width: "3.5rem", textAlign: "right" }}
                      title={
                        a.id == null ? "Only accounts with no holdings and added here can be deleted" : "Move or delete its holdings first"
                      }
                    >
                      {a.id == null ? "" : "in use"}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMutation.mutate();
          }}
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.25rem" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Zerodha, Chase Checking"
            aria-label="New account name"
            style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
          />
          <button
            type="submit"
            disabled={!name.trim() || createMutation.isPending}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {createMutation.isPending ? "Adding..." : "Add Account"}
          </button>
        </form>
      </Card>
    </div>
  );
}
