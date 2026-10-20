import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchAccounts, createAccount, deleteAccount, deleteAccountAndHoldings, renameAccount, ApiError } from "../api";

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renamingAccount, setRenamingAccount] = useState(null); // the account object currently being renamed, or null
  const [renameValue, setRenameValue] = useState("");

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

  const renameMutation = useMutation({
    mutationFn: ({ oldName, newName }) => renameAccount(oldName, newName, currentHouseholdId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      toast.success(result?.message || "Renamed");
      setRenamingAccount(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to rename account"),
  });

  function startRename(account) {
    setRenamingAccount(account);
    setRenameValue(account.name);
  }

  function submitRename(e) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renamingAccount.name) {
      setRenamingAccount(null);
      return;
    }
    renameMutation.mutate({ oldName: renamingAccount.name, newName: trimmed });
  }

  const deleteWithHoldingsMutation = useMutation({
    mutationFn: (name) => deleteAccountAndHoldings(name, currentHouseholdId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(result?.message || "Account and its holdings deleted");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete account");
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingState message="Loading accounts..." />;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Accounts</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        The account names your holdings are grouped under (a brokerage, a bank account, a person's name). Add one ahead of time — before
        importing or adding a holding to it — remove an empty one that's no longer used, or delete an account and every holding in it at
        once.
      </p>

      <Card>
        {!accounts || accounts.length === 0 ? (
          <EmptyState message="No accounts yet." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {accounts.map((a) =>
              renamingAccount?.name === a.name ? (
                <form key={a.name} onSubmit={submitRename} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    style={{ ...inputStyle, flex: 1, padding: "0.4rem 0.7rem", fontSize: "0.875rem" }}
                  />
                  <button
                    type="submit"
                    disabled={renameMutation.isPending}
                    style={{
                      padding: "0.3rem 0.7rem",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--primary)",
                      color: "var(--text-inverse)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingAccount(null)}
                    style={{
                      padding: "0.3rem 0.7rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9375rem" }}>
                  <span style={{ color: "var(--text)" }}>{a.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                      {a.holdingCount} holding{a.holdingCount === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() => startRename(a)}
                      style={{
                        padding: "0.3rem 0.7rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Rename
                    </button>
                    {a.holdingCount === 0 ? (
                      a.id != null ? (
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
                          title="Only accounts added here can be deleted"
                        />
                      )
                    ) : (
                      <button
                        onClick={() => setDeleteTarget(a)}
                        disabled={deleteWithHoldingsMutation.isPending}
                        title="Deletes this account and every holding filed under it"
                        style={{
                          padding: "0.3rem 0.7rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--danger)",
                          background: "transparent",
                          color: "var(--danger)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Delete account &amp; holdings
                      </button>
                    )}
                  </span>
                </div>
              ),
            )}
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

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onConfirm={() => deleteWithHoldingsMutation.mutate(deleteTarget.name)}
        onCancel={() => setDeleteTarget(null)}
        assetName={deleteTarget?.name}
        title={
          deleteTarget
            ? `Delete this account and ${deleteTarget.holdingCount} holding${deleteTarget.holdingCount === 1 ? "" : "s"}?`
            : "Delete account?"
        }
      />
    </div>
  );
}
