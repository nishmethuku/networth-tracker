import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBudgetEntry,
  deleteBudgetEntry,
  fetchBudgetCategories,
  fetchBudgetEntries,
  fetchBudgetSummary,
  fetchHoldings,
  fetchLiabilities,
  ApiError,
} from "../api";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatDateISO, todayISO } from "../utils/formatters";
import { orderCategoryOptions } from "../utils/categoryTree";
import { frequentExpenses } from "../utils/frequentExpenses";
import { monthOf, monthTotals } from "../utils/entryGroups";
import { enqueuePending, loadPending, shouldQueue } from "../utils/pendingExpenses";
import { limitWarning } from "../utils/limitWarning";
import { parseQuickEntry } from "../utils/quickEntryParser";
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
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paidFrom, setPaidFrom] = useState("");
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState("");

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

  const parsed = useMemo(
    () =>
      typed.trim()
        ? parseQuickEntry(typed, {
            today: todayISO(),
            categories: options.map((o) => o.value),
            labelFor: getBudgetCategoryLabel,
            frequent,
          })
        : null,
    [typed, options, frequent],
  );

  function applyTyped() {
    if (!parsed) return false;
    if (parsed.amount !== undefined) setAmount(String(parsed.amount));
    if (parsed.date) setDate(parsed.date);
    if (parsed.description) setDescription(parsed.description);
    if (parsed.category && options.some((o) => o.value === parsed.category)) setCategory(parsed.category);
    setTyped("");
    return true;
  }

  // Each time it opens: fresh amount and date, remembering the last category and account.
  useEffect(() => {
    if (!open) return;
    const last = loadLast();
    setAmount("");
    setDescription("");
    setTyped("");
    setDate(todayISO());
    setError(null);
    setCurrency(getDefaultDisplayCurrency());
    setPendingCount(loadPending().length);
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
    const refresh = () => setPendingCount(loadPending().length);
    window.addEventListener("nw:pending-changed", refresh);
    return () => window.removeEventListener("nw:pending-changed", refresh);
  }, []);

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
      if (entry.entryDate?.slice(0, 7) === monthOf(todayISO())) {
        queryClient
          .fetchQuery({
            queryKey: ["budget-summary", currency, currentHouseholdId],
            queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId: currentHouseholdId }),
            staleTime: 0,
          })
          .then((summary) => {
            const msg = limitWarning(
              summary?.limit_status,
              entry.category,
              categories?.parents?.expense?.[entry.category],
              getBudgetCategoryLabel,
              (v) => formatCurrencyForDisplay(v, currency, { includeCode: false }),
            );
            if (msg) toast.info(msg, 6000);
          })
          .catch(() => {});
      }
      const where = entry.chargedLiability
        ? ` Card balance now ${formatCurrencyForDisplay(entry.chargedLiability.newBalance, entry.chargedLiability.currency, { includeCode: false })}.`
        : entry.fundingSource
          ? ` Account balance now ${formatCurrencyForDisplay(entry.fundingSource.newBalance, entry.fundingSource.currency, { includeCode: false })}.`
          : "";
      // Undo removes the entry and puts back any card or account balance it moved.
      const undo = {
        label: "Undo",
        onClick: () =>
          deleteBudgetEntry(entry.id, { reverse: true })
            .then(() => {
              for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"])
                queryClient.invalidateQueries({ queryKey: [key] });
              toast.success("Expense removed");
            })
            .catch(() => toast.error("Could not undo that expense")),
      };
      toast.success(`Expense added.${where}`, 6000, undo);
      if (addAnotherRef.current) {
        setAmount("");
        setDescription("");
        amountRef.current?.focus();
      } else {
        onClose();
      }
    },
    onError: (err, payload) => {
      if (shouldQueue(err) && enqueuePending(payload)) {
        setPendingCount(loadPending().length);
        toast.info("No connection. Saved on this device and it will sync when you are back online.", 5000);
        if (addAnotherRef.current) {
          setAmount("");
          setDescription("");
          amountRef.current?.focus();
        } else {
          onClose();
        }
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not save the expense. Try again.");
    },
  });

  function submit(another) {
    let input = { amount, category, description, date, currency, paidFrom };
    if (parsed && typed.trim()) {
      input = {
        ...input,
        amount: parsed.amount !== undefined ? String(parsed.amount) : amount,
        date: parsed.date || date,
        description: parsed.description || description,
        category: parsed.category && options.some((o) => o.value === parsed.category) ? parsed.category : category,
      };
    }
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
            {pendingCount > 0 && (
              <p role="status" style={{ margin: "-0.5rem 0 0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {pendingCount} expense{pendingCount === 1 ? "" : "s"} saved on this device, waiting to sync.
              </p>
            )}

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

            <label htmlFor="qa-typed" style={labelStyle}>
              Type it (optional)
            </label>
            <input
              id="qa-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyTyped();
                  amountRef.current?.focus();
                }
              }}
              placeholder="e.g. coffee 4.50 yesterday"
              autoComplete="off"
              style={{ ...fieldStyle, marginBottom: "0.35rem" }}
            />
            <p aria-live="polite" style={{ margin: "0 0 0.9rem", fontSize: "0.75rem", color: "var(--text-secondary)", minHeight: "1rem" }}>
              {parsed
                ? [
                    parsed.amount !== undefined
                      ? formatCurrencyForDisplay(parsed.amount, currency, { includeCode: false })
                      : "no amount yet",
                    parsed.description || null,
                    parsed.category ? getBudgetCategoryLabel(parsed.category) : null,
                    parsed.date ? formatDateISO(parsed.date) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") + "  (press Enter to fill the form)"
                : "Fill the fields below, or type a sentence and press Enter."}
            </p>

            <label htmlFor="qa-amount" style={labelStyle}>
              Amount
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
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
                style={{ ...fieldStyle, fontSize: "1.5rem", fontFamily: "var(--font-mono)", fontWeight: 600, flex: 1, minWidth: 0 }}
              />
              <select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ ...fieldStyle, width: "auto" }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

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
