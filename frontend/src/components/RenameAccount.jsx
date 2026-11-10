import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { renameAccount, ApiError } from "../api";
import { useToast } from "../contexts/ToastContext";

const buttonStyle = {
  padding: "0.4rem 0.75rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  cursor: "pointer",
};

/** Renames an account (the label holdings are filed under), for every holding in it. */
export default function RenameAccount({ accountName, householdId, onRenamed }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(accountName);

  const mutation = useMutation({
    mutationFn: (newName) => renameAccount(accountName, newName, householdId).then((r) => ({ ...r, newName })),
    onSuccess: (result) => {
      onRenamed?.(result.newName);
      toast.success(result?.message || "Renamed");
      setEditing(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not rename the account"),
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(accountName);
          setEditing(true);
        }}
        style={buttonStyle}
      >
        Rename account
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed && trimmed !== accountName) mutation.mutate(trimmed);
        else setEditing(false);
      }}
      style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
    >
      <input
        autoFocus
        aria-label="New account name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...buttonStyle, cursor: "text", minWidth: "10rem" }}
      />
      <button type="submit" disabled={mutation.isPending} style={buttonStyle}>
        {mutation.isPending ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} style={buttonStyle}>
        Cancel
      </button>
    </form>
  );
}
