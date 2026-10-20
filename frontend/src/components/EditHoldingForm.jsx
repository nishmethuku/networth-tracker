import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../contexts/ToastContext";
import { updateHolding, ApiError } from "../api";
import { COUNTRIES, CURRENCIES } from "../constants/enums";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
  width: "100%",
};

const labelStyle = { fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" };

/**
 * Edits a holding's own identifying fields (name, symbol, account,
 * institution, country, currency, notes, tags) -- not its transactions/
 * valuations, which already have their own edit paths. asset_type isn't
 * editable here: changing a holding's fundamental type after it has
 * transactions/valuations tied to its current type-specific shape is a
 * bigger, riskier operation than a field-level fix belongs doing.
 */
export default function EditHoldingForm({ holding, onDone }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: holding.name || "",
    symbol: holding.symbol || "",
    account: holding.account || "",
    institution: holding.institution || "",
    country: holding.country || "",
    currency: holding.currency || "USD",
    notes: holding.notes || "",
    tags: (holding.tags || []).join(", "),
  });

  const mutation = useMutation({
    mutationFn: (payload) => updateHolding(holding.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", String(holding.id)] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Holding updated");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update that holding"),
  });

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      name: form.name.trim() || form.symbol.trim(),
      symbol: form.symbol.trim() || null,
      account: form.account.trim(),
      institution: form.institution.trim() || null,
      country: form.country,
      currency: form.currency,
      notes: form.notes.trim() || null,
      tags: form.tags.trim() || null,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", alignItems: "end" }}
    >
      <div>
        <label htmlFor="edit-name" style={labelStyle}>
          Name
        </label>
        <input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label htmlFor="edit-symbol" style={labelStyle}>
          Symbol
        </label>
        <input id="edit-symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label htmlFor="edit-account" style={labelStyle}>
          Account
        </label>
        <input id="edit-account" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label htmlFor="edit-institution" style={labelStyle}>
          Institution
        </label>
        <input
          id="edit-institution"
          value={form.institution}
          onChange={(e) => setForm({ ...form, institution: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="edit-country" style={labelStyle}>
          Country
        </label>
        <select id="edit-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={inputStyle}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="edit-currency" style={labelStyle}>
          Currency
        </label>
        <select
          id="edit-currency"
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          style={inputStyle}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="edit-notes" style={labelStyle}>
          Notes
        </label>
        <textarea
          id="edit-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
      <div>
        <label htmlFor="edit-tags" style={labelStyle}>
          Tags
        </label>
        <input
          id="edit-tags"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="retirement, long-term"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          disabled={mutation.isPending}
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
          {mutation.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
