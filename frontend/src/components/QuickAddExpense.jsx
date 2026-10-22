import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBudgetEntry, fetchBudgetCategories, fetchBudgetEntries, fetchHoldings, fetchLiabilities, ApiError } from "../api";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { getBudgetCategoryLabel } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatDateISO, todayISO } from "../utils/formatters";
import { orderCategoryOptions } from "../utils/categoryTree";
import { frequentExpenses } from "../utils/frequentExpenses";
import { monthOf, monthTotals } from "../utils/entryGroups";
import { buildExpensePayload, loadLast, saveLast, validateQuickAdd, yesterdayOf } from "../utils/quickAdd";

const fieldStyle = {
  width: "100%",
  padding: "0.75rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "1rem",
};
const labelStyle = { fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" };

/**
 * The fastest way to log an expense from any page: a floating "+ Expense" button (or the E key)
 * opens a small form with the amount focused, today's date, and your last category and account.
 */
export default function QuickAddExpense({ open, onOpen, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();
  const amountRef = useRef(null);
  const addAnotherRef = useRef(false);
  const currency = useMemo(() => getDefaultDisplayCurrency(), []);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paidFrom, setPaidFrom] = useState("");
  const [error, setError] = useState(null);

  const { data: categories } = useQuery({
    queryKey: ["budget-categories", currentHouseholdId],
    queryFn: () => fetchBudgetCategories({ householdId: currentHouseholdId }),
    enabled: open,
  });
  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: open,
  });
  const { data: liabilities } = useQuery({
    queryKey: ["liabilities", currency],
    queryFn: () => fetchLiabilities({ currency }),
    enabled: open,
  });

  // Recent entries power the one-tap "frequent" buttons and the spent-so-far line.
  const sinceDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    return formatDateISO(d);
  }, []);
  const { data: recent } = useQuery({
    queryKey: ["budget-entries", currentHouseholdId, "recent-120"],
    queryFn: () => fetchBudgetEntries({ householdId: currentHouseholdId, dateFrom: sinceDate }),
    enabled: open,
    staleTime: 30_000,
  });
  const frequent = useMemo(() => frequentExpenses(recent, currency), [recent, currency]);
  const spent = useMemo(() => {
    const today = todayISO();
    const month = monthTotals(recent, monthOf(today), currency).expenses;
    const day = monthTotals(
      (recent || []).filter((e) => e.entryDate === today),
      monthOf(today),
      currency,
    ).expenses;
    return { day, month };
  }, [recent, currency]);

  const cards = useMemo(
    () => (liabilities || []).filter((l) => l.liabilityType === "credit_card" || l.liabilityType === "line_of_credit"),
    [liabilities],
  );
  const options = useMemo(
    () => orderCategoryOptions(categories?.expense || [], categories?.parents?.expense, getBudgetCategoryLabel),
    [categories],
  );

  // Each time it opens: fresh amount and date, remembering the last category and account.
  useEffect(() => {
    if (!open) return;
    const last = loadLast();
    setAmount("");
    setDescription("");
    setDate(todayISO());
    setError(null);
    setPaidFrom(last.paidFrom ?? "");
    setCategory(last.category ?? "");
    const id = window.setTimeout(() => amountRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  // Fall back to the first category when the remembered one is gone or not chosen yet.
  useEffect(() => {
    if (!open || options.length === 0) return;
    if (!options.some((o) => o.value === category)) setCategory(options[0].value);
  }, [open, options, category]);

  // Forget a remembered account that no longer exists.
  useEffect(() => {
    if (!open || !paidFrom || !cashHoldings || !liabilities) return;
    const ok = paidFrom.startsWith("card:")
      ? cards.some((c) => `card:${c.id}` === paidFrom)
      : cashHoldings.some((c) => String(c.id) === paidFrom);
    if (!ok) setPaidFrom("");
  }, [open, paidFrom, cashHoldings, liabilities, cards]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mutation = useMutation({
    mutationFn: (payload) => createBudgetEntry(payload),
    onSuccess: (entry) => {
      for (const key of ["budget-entries", "budget-summary", "budget-subscriptions", "liabilities", "holdings", "dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      saveLast({ category, paidFrom });
      const where = entry.chargedLiability
        ? ` Card balance now ${formatCurrencyForDisplay(entry.chargedLiability.newBalance, entry.chargedLiability.currency, { includeCode: false })}.`
        : entry.fundingSource
          ? ` Account balance now ${formatCurrencyForDisplay(entry.fundingSource.newBalance, entry.fundingSource.currency, { includeCode: false })}.`
          : "";
      toast.success(`Expense added.${where}`);
      if (addAnotherRef.current) {
        setAmount("");
        setDescription("");
        amountRef.current?.focus();
      } else {
        onClose();
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the expense. Try again."),
  });

  function submit(another) {
    const input = { amount, category, description, date, currency, paidFrom };
    const problem = validateQuickAdd(input, todayISO());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    addAnotherRef.current = another;
    mutation.mutate(buildExpensePayload(input));
  }

  const today = todayISO();
  const yesterday = yesterdayOf(today);
  const chip = (active) => ({
    padding: "0.4rem 0.8rem",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    background: active ? "var(--primary-light)" : "var(--card)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: "0.8125rem",
    fontWeight: 500,
  });

  return (
    <>
      <button type="button" className="quick-add-fab no-print" onClick={onOpen} aria-label="Add expense (E)" title="Add expense (E)">
        <span aria-hidden="true" style={{ fontSize: "1.25rem", lineHeight: 1 }}>
          +
        </span>
        <span>Expense</span>
      </button>
      {open && (
        <div className="quick-add-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Add expense"
            className="quick-add-sheet"
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>Add expense</h2>

            {recent && (
              <p style={{ margin: "-0.5rem 0 0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Spent today {formatCurrencyForDisplay(spent.day, currency, { includeCode: false })} · this month{" "}
                {formatCurrencyForDisplay(spent.month, currency, { includeCode: false })}
              </p>
            )}
            {frequent.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.9rem" }} aria-label="Frequent expenses">
                {frequent.map((f) => (
                  <button
                    key={`${f.category}-${f.description}`}
                    type="button"
                    onClick={() => {
                      setAmount(String(f.amount));
                      setCategory(f.category);
                      setDescription(f.description);
                      amountRef.current?.focus();
                    }}
                    style={{
                      padding: "0.35rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {f.description || getBudgetCategoryLabel(f.category)} ·{" "}
                    {formatCurrencyForDisplay(f.amount, currency, { includeCode: false })}
                  </button>
                ))}
              </div>
            )}

            <label htmlFor="qa-amount" style={labelStyle}>
              Amount ({currency})
            </label>
            <input
              id="qa-amount"
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ ...fieldStyle, fontSize: "1.5rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}
            />

            <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
              <div>
                <label htmlFor="qa-category" style={labelStyle}>
                  Category
                </label>
                <select id="qa-category" value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="qa-note" style={labelStyle}>
                  Note (optional)
                </label>
                <input
                  id="qa-note"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lunch"
                  style={fieldStyle}
                />
              </div>

              {(cashHoldings?.length > 0 || cards.length > 0) && (
                <div>
                  <label htmlFor="qa-paid" style={labelStyle}>
                    Paid from
                  </label>
                  <select id="qa-paid" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} style={fieldStyle}>
                    <option value="">None (just log it)</option>
                    {(cashHoldings || []).map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.account ? ` (${c.account})` : ""}
                      </option>
                    ))}
                    {cards.map((c) => (
                      <option key={`card-${c.id}`} value={`card:${c.id}`}>
                        {c.name} (credit card)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <span style={labelStyle}>Date</span>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" style={chip(date === today)} onClick={() => setDate(today)}>
                    Today
                  </button>
                  <button type="button" style={chip(date === yesterday)} onClick={() => setDate(yesterday)}>
                    Yesterday
                  </button>
                  <input
                    type="date"
                    aria-label="Pick a date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ ...fieldStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.875rem" }}
                  />
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.875rem", margin: "0.75rem 0 0" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={mutation.isPending}
                style={{
                  flex: 1,
                  minWidth: "8rem",
                  padding: "0.8rem 1.25rem",
                  borderRadius: "var(--radius)",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--text-inverse)",
                  fontWeight: 600,
                  fontSize: "1rem",
                  cursor: "pointer",
                  opacity: mutation.isPending ? 0.7 : 1,
                }}
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => submit(true)}
                style={{
                  padding: "0.8rem 1rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Save and add another
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: "0.8rem 0.5rem", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
