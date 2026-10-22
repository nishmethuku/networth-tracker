import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBudgetEntry, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { todayISO } from "../../utils/formatters";
import { orderCategoryOptions } from "../../utils/categoryTree";

const field = {
  width: "100%",
  padding: "0.7rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "1rem",
};
const label = { fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" };

/** Fix the amount, category, note or date of an entry you already logged. */
export default function EditEntryModal({ entry, categories, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const amountRef = useRef(null);
  const [amount, setAmount] = useState(String(entry.amount));
  const [category, setCategory] = useState(entry.category);
  const [description, setDescription] = useState(entry.description || "");
  const [date, setDate] = useState(entry.entryDate);
  const [error, setError] = useState(null);

  const names = entry.entryType === "income" ? categories?.income : categories?.expense;
  const options = useMemo(() => {
    const list = names || [];
    const withCurrent = list.includes(entry.category) ? list : [...list, entry.category];
    return orderCategoryOptions(withCurrent, categories?.parents?.[entry.entryType], getBudgetCategoryLabel);
  }, [names, categories, entry]);

  useEffect(() => {
    amountRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: (payload) => updateBudgetEntry(entry.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-subscriptions"] });
      toast.success("Entry updated");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the entry"),
  });

  function submit(e) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return setError("Enter an amount above zero.");
    if (!date) return setError("Pick a date.");
    if (date > todayISO()) return setError("The date cannot be in the future.");
    setError(null);
    mutation.mutate({ amount: value, category, description: description.trim() || null, entry_date: date });
  }

  return (
    <div className="quick-add-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="Edit entry" className="quick-add-sheet" onSubmit={submit}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>Edit {entry.entryType === "income" ? "income" : "expense"}</h2>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div>
            <label htmlFor="ee-amount" style={label}>
              Amount ({entry.currency})
            </label>
            <input
              id="ee-amount"
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={field}
            />
          </div>
          <div>
            <label htmlFor="ee-category" style={label}>
              Category
            </label>
            <select id="ee-category" value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ee-note" style={label}>
              Note
            </label>
            <input id="ee-note" value={description} onChange={(e) => setDescription(e.target.value)} style={field} />
          </div>
          <div>
            <label htmlFor="ee-date" style={label}>
              Date
            </label>
            <input id="ee-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={field} />
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.75rem 0 0" }}>
          Changing the amount does not change the balance of the account or card it was paid from. Edit that balance separately if needed.
        </p>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.875rem", margin: "0.75rem 0 0" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              flex: 1,
              padding: "0.8rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              fontWeight: 600,
              cursor: "pointer",
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "0.8rem 0.75rem", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
