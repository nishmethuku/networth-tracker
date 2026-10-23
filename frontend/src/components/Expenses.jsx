import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import AddEntryForm from "./budget/AddEntryForm";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchBudgetCategories, fetchBudgetEntries, deleteBudgetEntry, createBudgetEntry, updateBudgetEntry, ApiError } from "../api";
import { orderCategoryOptions } from "../utils/categoryTree";
import EditEntryModal from "./budget/EditEntryModal";
import ExpenseInsights from "./budget/ExpenseInsights";
import SpendCalendar from "./expenses/SpendCalendar";
import CategoryChanges from "./expenses/CategoryChanges";
import SafeToSpend from "./expenses/SafeToSpend";
import RecurringSuggestions from "./expenses/RecurringSuggestions";
import SuggestedLimits from "./expenses/SuggestedLimits";
import SpendingPatterns from "./expenses/SpendingPatterns";
import MonthReview from "./expenses/MonthReview";
import { useRecentEntries } from "../hooks/useRecentEntries";
import { isNonSpendingCategory } from "../utils/nonSpending";
import { biggestFirst, filterByAmount, filterEntries } from "../utils/filterEntries";
import { entriesToCsv } from "../utils/entriesCsv";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatDateISO, todayISO } from "../utils/formatters";
import { groupByDay, monthOf, monthTotals, shiftMonth } from "../utils/entryGroups";

function lastDayOf(month) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const selectStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

const smallBtn = {
  fontSize: "0.75rem",
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  padding: "0.25rem 0.5rem",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const navBtn = {
  padding: "0.4rem 0.8rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: "0.875rem",
};

function monthLabel(month) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
}

/** Where you log and review spending. Budget keeps the totals, limits and subscriptions. */
export default function Expenses() {
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const thisMonth = monthOf(todayISO());
  const [month, setMonth] = useState(thisMonth);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [day, setDay] = useState(null);
  const [allMonths, setAllMonths] = useState(false);
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [sortBiggest, setSortBiggest] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const searchRef = useRef(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();

  const { data: categories } = useQuery({
    queryKey: ["budget-categories", currentHouseholdId],
    queryFn: () => fetchBudgetCategories({ householdId: currentHouseholdId }),
  });
  const {
    data: entries,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    // One month at a time, so older months are never cut off by the server's list limit.
    queryKey: ["budget-entries", currentHouseholdId, month],
    queryFn: () => fetchBudgetEntries({ householdId: currentHouseholdId, dateFrom: `${month}-01`, dateTo: lastDayOf(month) }),
  });

  // The last six months, for searching every month and comparing with last month.
  const { data: recent } = useRecentEntries(currentHouseholdId);

  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDay(null), [month]);

  const restoreMutation = useMutation({
    mutationFn: (e) =>
      createBudgetEntry({
        entry_type: e.entryType,
        entry_date: e.entryDate,
        amount: e.amount,
        currency: e.currency,
        category: e.category,
        description: e.description || null,
        is_recurring: !!e.isRecurring,
        recurring_frequency: e.recurringFrequency || null,
        // Paying the same way again, so the card or account is charged once more.
        ...(e.chargedLiabilityId ? { charge_liability_id: e.chargedLiabilityId } : {}),
        ...(e.fundingHoldingId ? { funding_source_holding_id: e.fundingHoldingId } : {}),
        ...(e.linkedLiabilityId ? { linked_liability_id: e.linkedLiabilityId } : {}),
        ...(currentHouseholdId ? { household_id: currentHouseholdId } : {}),
      }),
    onSuccess: () => {
      for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Entry restored");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not restore the entry"),
  });

  const deleteMutation = useMutation({
    // An expense that was paid from a card or account gives that money back when deleted.
    mutationFn: (e) => deleteBudgetEntry(e.id, { reverse: !!(e.chargedLiabilityId || e.fundingHoldingId || e.linkedLiabilityId) }),
    onSuccess: (_data, e) => {
      for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"]) queryClient.invalidateQueries({ queryKey: [key] });
      const back = e.chargedLiabilityId || e.fundingHoldingId || e.linkedLiabilityId;
      toast.success(back ? "Entry deleted and the money put back" : "Entry deleted", 6000, {
        label: "Undo",
        onClick: () => restoreMutation.mutate(e),
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete the entry"),
  });

  const repeatMutation = useMutation({
    mutationFn: (e) =>
      createBudgetEntry({
        entry_type: e.entryType,
        entry_date: todayISO(),
        amount: e.amount,
        currency: e.currency,
        category: e.category,
        description: e.description || null,
        is_recurring: false,
        recurring_frequency: null,
        ...(currentHouseholdId ? { household_id: currentHouseholdId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success("Logged again for today");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not repeat the entry"),
  });

  const source = allMonths && search ? recent : entries;
  const visible = useMemo(() => {
    const found = filterByAmount(filterEntries(source, search, categoryFilter, getBudgetCategoryLabel), minAmt, maxAmt);
    return day ? found.filter((e) => e.entryDate === day) : found;
  }, [source, search, categoryFilter, day, minAmt, maxAmt]);
  const days = useMemo(
    () => groupByDay(visible, allMonths && search ? null : month, currency),
    [visible, month, currency, allMonths, search],
  );
  const categoryChoices = useMemo(
    () => [...new Set([...(entries || []).map((e) => e.category), ...(categoryFilter ? [categoryFilter] : [])])].sort(),
    [entries, categoryFilter],
  );
  const flat = useMemo(() => (sortBiggest ? biggestFirst(days.flatMap((d) => d.entries)) : []), [sortBiggest, days]);
  const categoryOptions = useMemo(
    () => orderCategoryOptions(categories?.expense || [], categories?.parents?.expense, getBudgetCategoryLabel),
    [categories],
  );

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function leaveSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBulkCategory("");
  }
  const chosen = useMemo(() => visible.filter((e) => selected.has(e.id)), [visible, selected]);

  const bulkRecategorize = useMutation({
    mutationFn: (category) => Promise.all(chosen.map((e) => updateBudgetEntry(e.id, { category }))),
    onSuccess: (_d, category) => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success(`Moved ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"} to ${getBudgetCategoryLabel(category)}`);
      leaveSelectMode();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not change the category"),
  });
  const bulkDelete = useMutation({
    mutationFn: () =>
      Promise.all(
        chosen.map((e) => deleteBudgetEntry(e.id, { reverse: !!(e.chargedLiabilityId || e.fundingHoldingId || e.linkedLiabilityId) })),
      ),
    onSuccess: () => {
      for (const key of ["budget-entries", "budget-summary", "liabilities", "holdings"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(`Deleted ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"}`);
      leaveSelectMode();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete those entries"),
  });
  const totals = useMemo(() => monthTotals(entries, month, currency), [entries, month, currency]);
  const money = (v, cur = currency) => formatCurrencyForDisplay(v, cur, { alwaysCents: true });

  const renderRow = (e) => (
    <div
      key={e.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem 0",
        borderTop: "1px solid var(--border-light)",
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={selected.has(e.id)}
          onChange={() => toggleSelected(e.id)}
          aria-label={`Select ${getBudgetCategoryLabel(e.category)} entry ${e.description || ""}`.trim()}
        />
      )}
      <div style={{ fontWeight: 500, flex: 1, color: "var(--text)", fontSize: "0.9375rem", minWidth: 0 }}>
        {getBudgetCategoryLabel(e.category)}
        {e.description ? <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}> — {e.description}</span> : null}
        {e.entryType === "expense" && isNonSpendingCategory(e.category) && (
          <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 400 }}>
            Card payment, not counted as spending
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: e.entryType === "income" ? "var(--success)" : "var(--danger)",
          }}
        >
          {e.entryType === "income" ? "+" : "−"}
          {money(e.amount, e.currency)}
        </span>
        <button
          type="button"
          onClick={() => setEditing(e)}
          aria-label={`Edit ${getBudgetCategoryLabel(e.category)} entry`}
          style={smallBtn}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => repeatMutation.mutate(e)}
          disabled={repeatMutation.isPending}
          aria-label={`Repeat ${getBudgetCategoryLabel(e.category)} entry today`}
          style={smallBtn}
        >
          Repeat
        </button>
        <button
          type="button"
          onClick={() => deleteMutation.mutate(e)}
          aria-label={`Delete ${getBudgetCategoryLabel(e.category)} entry`}
          style={{
            fontSize: "0.75rem",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            padding: "0.25rem 0.5rem",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Expenses</h1>
        <select aria-label="Display currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Log what you spend and review it day by day. Totals, limits and subscriptions are on the{" "}
        <Link to="/budget" style={{ color: "var(--primary)" }}>
          Budget
        </Link>{" "}
        page.
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Add an entry">
          {/* key={currency}: the form reads its defaults once, so remount when the currency changes. */}
          <AddEntryForm key={currency} categories={categories} currency={currency} />
          <p style={{ marginTop: "1rem", fontSize: "0.8125rem" }}>
            <Link to="/import-bank-statement" style={{ color: "var(--primary)" }}>
              Import a bank or credit card statement instead →
            </Link>
          </p>
        </Card>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>{monthLabel(month)}</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" style={navBtn} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            ‹ Prev
          </button>
          <button type="button" style={navBtn} onClick={() => setMonth(thisMonth)} disabled={month === thisMonth}>
            This month
          </button>
          <button
            type="button"
            style={navBtn}
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth}
            aria-label="Next month"
          >
            Next ›
          </button>
        </div>
      </div>

      <p style={{ margin: "0 0 1rem", color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
        Spent <strong style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>{money(totals.expenses)}</strong>
        {totals.income > 0 && (
          <>
            {" "}
            · Income <strong style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}>{money(totals.income)}</strong>
          </>
        )}
      </p>

      {month === thisMonth && <SafeToSpend currency={currency} householdId={currentHouseholdId} />}

      <ExpenseInsights currency={currency} householdId={currentHouseholdId} month={month} spent={totals.expenses} />

      <div style={{ display: "grid", gap: "1rem", marginBottom: "1rem" }}>
        <SpendCalendar entries={entries} month={month} currency={currency} selected={day} onSelect={setDay} />
        <CategoryChanges entries={recent || entries} month={month} currency={currency} onPick={setCategoryFilter} />
        <MonthReview currency={currency} householdId={currentHouseholdId} month={month} />
        <SpendingPatterns currency={currency} householdId={currentHouseholdId} month={month} />
        <SuggestedLimits currency={currency} householdId={currentHouseholdId} />
        <RecurringSuggestions currency={currency} householdId={currentHouseholdId} />
      </div>

      {day && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          Showing {formatDateISO(day)} only.{" "}
          <button type="button" onClick={() => setDay(null)} style={{ ...smallBtn, marginLeft: "0.25rem" }}>
            Show the whole month
          </button>
        </p>
      )}

      {(entries || []).length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            type="button"
            style={navBtn}
            onClick={() => {
              const blob = new Blob([entriesToCsv(entries)], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `expenses-${month}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </button>
          <input
            type="search"
            ref={searchRef}
            aria-label="Search expenses"
            placeholder="Search notes or categories (press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...selectStyle, flex: "1 1 12rem" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
            Search all months
          </label>
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All categories</option>
            {categoryChoices.map((c) => (
              <option key={c} value={c}>
                {getBudgetCategoryLabel(c)}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            aria-label="Minimum amount"
            placeholder="Min"
            value={minAmt}
            onChange={(e) => setMinAmt(e.target.value)}
            style={{ ...selectStyle, width: "5.5rem" }}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            aria-label="Maximum amount"
            placeholder="Max"
            value={maxAmt}
            onChange={(e) => setMaxAmt(e.target.value)}
            style={{ ...selectStyle, width: "5.5rem" }}
          />
          <select
            aria-label="Sort entries"
            value={sortBiggest ? "biggest" : "newest"}
            onChange={(e) => setSortBiggest(e.target.value === "biggest")}
            style={selectStyle}
          >
            <option value="newest">Newest first</option>
            <option value="biggest">Biggest first</option>
          </select>
          <button type="button" style={navBtn} onClick={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}>
            {selectMode ? "Done selecting" : "Select"}
          </button>
        </div>
      )}

      {selectMode && (
        <div
          role="region"
          aria-label="Bulk actions"
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "1rem",
            padding: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--card)",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>{selected.size} selected</span>
          <button type="button" style={smallBtn} onClick={() => setSelected(new Set(visible.map((e) => e.id)))}>
            Select all shown
          </button>
          <select aria-label="Move to category" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} style={selectStyle}>
            <option value="">Move to category…</option>
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={navBtn}
            disabled={!bulkCategory || selected.size === 0 || bulkRecategorize.isPending}
            onClick={() => bulkRecategorize.mutate(bulkCategory)}
          >
            Move
          </button>
          <button
            type="button"
            style={{ ...navBtn, color: "var(--danger)" }}
            disabled={selected.size === 0 || bulkDelete.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${selected.size} ${selected.size === 1 ? "entry" : "entries"}? Card and account balances they moved are put back.`,
                )
              )
                bulkDelete.mutate();
            }}
          >
            Delete selected
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingState message="Loading your expenses..." />
      ) : isError ? (
        <ErrorState error={error instanceof ApiError ? error.message : "Failed to load expenses"} onRetry={refetch} />
      ) : days.length === 0 ? (
        <EmptyState message={search || categoryFilter ? "No entries match that search." : `Nothing logged in ${monthLabel(month)} yet.`} />
      ) : sortBiggest ? (
        <Card title="Biggest first">{flat.map(renderRow)}</Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {days.map((d) => (
            <Card key={d.date}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                <span>{formatDateISO(d.date)}</span>
                {d.expenseTotal > 0 && <span style={{ fontFamily: "var(--font-mono)" }}>{money(d.expenseTotal)}</span>}
              </div>
              {d.entries.map(renderRow)}
            </Card>
          ))}
        </div>
      )}
      {editing && <EditEntryModal entry={editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}
