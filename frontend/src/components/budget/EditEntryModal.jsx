import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateBudgetEntry, fetchHoldings, fetchLiabilities, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { getAssetTypeLabel, CURRENCIES } from "../../constants/enums";
import { todayISO } from "../../utils/formatters";
import CategoryPicker from "./CategoryPicker";
import { refreshMoneyViews } from "../../utils/refreshMoneyViews";

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
const twoUp = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "0.75rem" };

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function startingPaidFrom(entry) {
  if (entry.fundingHoldingId) return String(entry.fundingHoldingId);
  if (entry.chargedLiabilityId) return `card:${entry.chargedLiabilityId}`;
  return "";
}

/** Change anything about an entry you already logged: type, amount, currency, category, date, note, accounts, repeat. */
export default function EditEntryModal({ entry, categories, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const amountRef = useRef(null);
  const [entryType, setEntryType] = useState(entry.entryType);
  const [amount, setAmount] = useState(String(entry.amount));
  const [currency, setCurrency] = useState(entry.currency);
  const [category, setCategory] = useState(entry.category);
  const [description, setDescription] = useState(entry.description || "");
  const [date, setDate] = useState(entry.entryDate);
  const [isPrivate, setIsPrivate] = useState(Boolean(entry.isPrivate));
  const [isRecurring, setIsRecurring] = useState(Boolean(entry.isRecurring));
  const [frequency, setFrequency] = useState(entry.recurringFrequency || "monthly");
  const [paidFrom, setPaidFrom] = useState(startingPaidFrom(entry));
  const [paysDown, setPaysDown] = useState(entry.linkedLiabilityId ? String(entry.linkedLiabilityId) : "");
  const [depositInto, setDepositInto] = useState(entry.depositTargetHoldingId ? String(entry.depositTargetHoldingId) : "");
  const [error, setError] = useState(null);

  const names = useMemo(() => {
    const list = (entryType === "income" ? categories?.income : categories?.expense) || [];
    // A category that has since been deleted still has to show for an entry that uses it.
    return entryType === entry.entryType && !list.includes(entry.category) ? [...list, entry.category] : list;
  }, [categories, entryType, entry]);
  const parents = categories?.parents?.[entryType];

  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: entryType === "expense",
  });
  const { data: allHoldings } = useQuery({
    queryKey: ["holdings", "all"],
    queryFn: () => fetchHoldings({ summary: true }),
    enabled: entryType === "income",
  });
  const { data: liabilities } = useQuery({
    queryKey: ["liabilities", currency],
    queryFn: () => fetchLiabilities({ currency }),
    enabled: entryType === "expense",
  });
  const cards = (liabilities || []).filter((l) => l.liabilityType === "credit_card" || l.liabilityType === "line_of_credit");
  const payable = (liabilities || []).filter((l) => l.liabilityType !== "credit_card" && l.liabilityType !== "line_of_credit");

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
      refreshMoneyViews(queryClient);
      toast.success("Entry updated");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the entry"),
  });

  function switchType(next) {
    if (next === entryType) return;
    setEntryType(next);
    const list = (next === "income" ? categories?.income : categories?.expense) || [];
    setCategory(next === entry.entryType && list.includes(entry.category) ? entry.category : list[0] || "");
    setPaidFrom("");
    setPaysDown("");
    setDepositInto("");
  }

  function submit(e) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return setError("Enter an amount above zero.");
    if (!date) return setError("Pick a date.");
    if (date > todayISO()) return setError("The date cannot be in the future.");
    if (!category) return setError("Pick a category.");
    setError(null);
    const isExpense = entryType === "expense";
    const fromCard = paidFrom.startsWith("card:");
    mutation.mutate({
      entry_type: entryType,
      amount: value,
      currency,
      category,
      description: description.trim() || null,
      entry_date: date,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? frequency : null,
      ...(entry.householdId ? { is_private: isPrivate } : {}),
      funding_source_holding_id: isExpense && paidFrom && !fromCard ? Number(paidFrom) : null,
      charge_liability_id: isExpense && fromCard ? Number(paidFrom.slice(5)) : null,
      linked_liability_id: isExpense && paysDown ? Number(paysDown) : null,
      deposit_target_holding_id: !isExpense && depositInto ? Number(depositInto) : null,
    });
  }

  const typeButton = (type, text, colors) => (
    <button
      type="button"
      onClick={() => switchType(type)}
      aria-pressed={entryType === type}
      style={{
        ...field,
        cursor: "pointer",
        fontWeight: 600,
        background: entryType === type ? colors.bg : "var(--bg)",
        color: entryType === type ? colors.fg : "var(--text)",
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="quick-add-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit entry"
        className="quick-add-sheet"
        style={{ maxHeight: "calc(100vh - 2rem)", overflowY: "auto" }}
      >
        <form onSubmit={submit}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>Edit entry</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {typeButton("income", "+ Income", { bg: "var(--success-light)", fg: "var(--success)" })}
              {typeButton("expense", "− Expense", { bg: "var(--danger-light)", fg: "var(--danger)" })}
            </div>
            <div style={twoUp}>
              <div>
                <label htmlFor="ee-amount" style={label}>
                  Amount
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
                <label htmlFor="ee-currency" style={label}>
                  Currency
                </label>
                <select id="ee-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={field}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={twoUp}>
              <CategoryPicker
                idPrefix="ee"
                names={names}
                parents={parents}
                value={category}
                onChange={setCategory}
                fieldStyle={field}
                labelStyle={label}
              />
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

            {entryType === "expense" && (cashHoldings?.length > 0 || cards.length > 0 || paidFrom) && (
              <div>
                <label htmlFor="ee-paid-from" style={label}>
                  Paid from
                </label>
                <select id="ee-paid-from" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} style={field}>
                  <option value="">— none —</option>
                  {(cashHoldings || []).map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.account ? ` (${c.account})` : ""}
                    </option>
                  ))}
                  {cards.map((l) => (
                    <option key={`card-${l.id}`} value={`card:${l.id}`}>
                      {l.name} (credit card)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {entryType === "expense" && (payable.length > 0 || paysDown) && (
              <div>
                <label htmlFor="ee-pays-down" style={label}>
                  Pays down
                </label>
                <select id="ee-pays-down" value={paysDown} onChange={(e) => setPaysDown(e.target.value)} style={field}>
                  <option value="">— none —</option>
                  {payable.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {entryType === "income" && (allHoldings?.length > 0 || depositInto) && (
              <div>
                <label htmlFor="ee-deposit" style={label}>
                  Deposit into
                </label>
                <select id="ee-deposit" value={depositInto} onChange={(e) => setDepositInto(e.target.value)} style={field}>
                  <option value="">— none —</option>
                  {(allHoldings || []).map((h) => (
                    <option key={h.id} value={String(h.id)}>
                      {h.symbol || h.name}
                      {h.account ? ` (${h.account})` : ""}
                      {h.assetType !== "cash" ? ` · ${getAssetTypeLabel(h.assetType)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--text)" }}>
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                Recurring (subscription, rent, bill, etc.)
              </label>
              {isRecurring && (
                <select
                  aria-label="Repeat frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  style={{ ...field, width: "auto" }}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {entry.householdId && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--text)" }}>
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                Private (hidden from the rest of the household)
              </label>
            )}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.75rem 0 0" }}>
            If this entry moved money in an account or card, changing the amount, the account or the type puts the old amount back and
            applies the new one.
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
    </div>
  );
}
