import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBudgetEntry, updateBudgetEntry, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { useHousehold } from "../../contexts/HouseholdContext";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { orderCategoryOptions } from "../../utils/categoryTree";
import { planSplit, remainder } from "../../utils/splitExpense";
import { formatCurrencyForDisplay } from "../../utils/formatters";

const field = {
  padding: "0.6rem 0.75rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};

/**
 * Splits one expense across categories (a grocery run that was half food, half household).
 * The first part changes the existing entry and each other part is added as a new entry on
 * the same day, paid the same way, so card and account balances end up where they were.
 */
export default function SplitEntryModal({ entry, categories, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();
  const options = useMemo(
    () => orderCategoryOptions(categories?.expense || [], categories?.parents?.expense, getBudgetCategoryLabel),
    [categories],
  );
  const [parts, setParts] = useState([
    { category: entry.category, amount: "" },
    { category: "", amount: "" },
  ]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const numeric = parts.map((p) => ({ category: p.category, amount: Number(p.amount) || 0 }));
  const left = remainder(entry.amount, numeric);
  const money = (v) => formatCurrencyForDisplay(v, entry.currency, { alwaysCents: true, includeCode: false });

  const mutation = useMutation({
    mutationFn: async (plan) => {
      // Add the new parts first so a failure never loses money from the books.
      for (const part of plan.add) {
        await createBudgetEntry({
          entry_type: "expense",
          entry_date: entry.entryDate,
          amount: part.amount,
          currency: entry.currency,
          category: part.category,
          description: entry.description || null,
          is_recurring: false,
          recurring_frequency: null,
          ...(entry.chargedLiabilityId ? { charge_liability_id: entry.chargedLiabilityId } : {}),
          ...(entry.fundingHoldingId ? { funding_source_holding_id: entry.fundingHoldingId } : {}),
          ...(entry.linkedLiabilityId ? { linked_liability_id: entry.linkedLiabilityId } : {}),
          ...(currentHouseholdId ? { household_id: currentHouseholdId } : {}),
        });
      }
      await updateBudgetEntry(entry.id, { amount: plan.keep.amount, category: plan.keep.category });
    },
    onSuccess: () => {
      for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Expense split");
      onClose();
    },
    onError: (err) => {
      for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"]) queryClient.invalidateQueries({ queryKey: [key] });
      setError(err instanceof ApiError ? err.message : "Could not split the expense. Check your list before trying again.");
    },
  });

  function submit(e) {
    e.preventDefault();
    const plan = planSplit(entry.amount, numeric);
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setError(null);
    mutation.mutate(plan);
  }

  const update = (i, patch) => setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="quick-add-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="Split expense" className="quick-add-sheet" onSubmit={submit}>
        <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem" }}>Split expense</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {entry.description ? `${entry.description}, ` : ""}
          {money(entry.amount)} in total. {left > 0 ? `${money(left)} left to assign.` : "Everything is assigned."}
        </p>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {parts.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem" }}>
              <select
                aria-label={`Part ${i + 1} category`}
                value={p.category}
                onChange={(e) => update(i, { category: e.target.value })}
                style={{ ...field, flex: 1, minWidth: 0 }}
              >
                <option value="">Category…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Part ${i + 1} amount`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={p.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                placeholder="0.00"
                style={{ ...field, width: "7rem" }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setParts((prev) => [...prev, { category: "", amount: left > 0 ? String(left) : "" }])}
          style={{
            marginTop: "0.6rem",
            background: "none",
            border: "none",
            color: "var(--primary)",
            cursor: "pointer",
            padding: 0,
            fontSize: "0.875rem",
          }}
        >
          + Add another part
        </button>
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
            }}
          >
            {mutation.isPending ? "Splitting…" : "Split"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
