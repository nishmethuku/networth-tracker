import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import AddEntryForm from "./budget/AddEntryForm";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchBudgetCategories, fetchBudgetEntries, deleteBudgetEntry, createBudgetEntry, ApiError } from "../api";
import EditEntryModal from "./budget/EditEntryModal";
import { filterEntries } from "../utils/filterEntries";
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
        ...(currentHouseholdId ? { household_id: currentHouseholdId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success("Entry restored");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not restore the entry"),
  });

  const deleteMutation = useMutation({
    mutationFn: (e) => deleteBudgetEntry(e.id),
    onSuccess: (_data, e) => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success("Entry deleted", 6000, { label: "Undo", onClick: () => restoreMutation.mutate(e) });
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

  const visible = useMemo(() => filterEntries(entries, search, categoryFilter, getBudgetCategoryLabel), [entries, search, categoryFilter]);
  const days = useMemo(() => groupByDay(visible, month, currency), [visible, month, currency]);
  const categoryChoices = useMemo(() => [...new Set((entries || []).map((e) => e.category))].sort(), [entries]);
  const totals = useMemo(() => monthTotals(entries, month, currency), [entries, month, currency]);
  const money = (v, cur = currency) => formatCurrencyForDisplay(v, cur, { alwaysCents: true });

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
            aria-label="Search expenses"
            placeholder="Search notes or categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...selectStyle, flex: "1 1 12rem" }}
          />
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
        </div>
      )}

      {isLoading ? (
        <LoadingState message="Loading your expenses..." />
      ) : isError ? (
        <ErrorState error={error instanceof ApiError ? error.message : "Failed to load expenses"} onRetry={refetch} />
      ) : days.length === 0 ? (
        <EmptyState message={search || categoryFilter ? "No entries match that search." : `Nothing logged in ${monthLabel(month)} yet.`} />
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
              {d.entries.map((e) => (
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
                  <div style={{ fontWeight: 500, color: "var(--text)", fontSize: "0.9375rem", minWidth: 0 }}>
                    {getBudgetCategoryLabel(e.category)}
                    {e.description ? <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}> — {e.description}</span> : null}
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
              ))}
            </Card>
          ))}
        </div>
      )}
      {editing && <EditEntryModal entry={editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}
