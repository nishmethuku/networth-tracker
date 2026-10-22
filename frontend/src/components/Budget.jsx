import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useIsMobile from "../hooks/useIsMobile";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import { useHousehold } from "../contexts/HouseholdContext";
import {
  fetchBudgetCategories,
  fetchBudgetEntries,
  deleteBudgetEntry,
  fetchBudgetSummary,
  fetchSubscriptions,
  fetchBudgetLimits,
  createBudgetLimit,
  deleteBudgetLimit,
  fetchBudgetInsights,
  ApiError,
} from "../api";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatCurrencyCompact, formatDateISO } from "../utils/formatters";
import { groupBreakdown } from "../utils/categoryTree";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
  width: "100%",
};

function MonthlyTrendChart({ months, currency }) {
  const data = months.map((m) => ({ ...m, label: m.month }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
          <Tooltip
            formatter={(v, name) => [
              formatCurrencyForDisplay(v, currency, { alwaysCents: true }),
              name === "income" ? "Income" : name === "expenses" ? "Expenses" : "Net",
            ]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Legend
            formatter={(v) => (v === "income" ? "Income" : v === "expenses" ? "Expenses" : "Net")}
            wrapperStyle={{ fontSize: "0.75rem" }}
          />
          <Bar dataKey="income" fill="var(--success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--danger)" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="net" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownBar({ pct }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 3 }} />
    </div>
  );
}

function CategoryBreakdown({ breakdown, currency }) {
  const [open, setOpen] = useState(() => new Set());
  const groups = useMemo(() => groupBreakdown(breakdown), [breakdown]);
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return <EmptyState message="No expenses logged this month yet." />;
  const money = (v) => formatCurrencyForDisplay(v, currency, { alwaysCents: true });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {groups.map((g) => {
        const pct = (g.total / total) * 100;
        const hasKids = g.children.length > 0;
        const expanded = open.has(g.category);
        return (
          <div key={g.category}>
            <div
              style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.25rem", gap: "0.5rem" }}
            >
              {hasKids ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.category)) next.delete(g.category);
                      else next.add(g.category);
                      return next;
                    })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--text)",
                    cursor: "pointer",
                    font: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span aria-hidden="true">{expanded ? "▾" : "▸"} </span>
                  {getBudgetCategoryLabel(g.category)}
                </button>
              ) : (
                <span style={{ color: "var(--text)" }}>{getBudgetCategoryLabel(g.category)}</span>
              )}
              <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                {money(g.total)} <span style={{ color: "var(--text-muted)" }}>({Math.round(pct)}%)</span>
                {hasKids && g.own > 0 && (
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {money(g.own)} + {money(g.total - g.own)}
                  </span>
                )}
              </span>
            </div>
            <BreakdownBar pct={pct} />
            {hasKids && expanded && (
              <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: "0 0 0 1rem", display: "grid", gap: "0.35rem" }}>
                {g.own > 0 && (
                  <li style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <span>{getBudgetCategoryLabel(g.category)} (itself)</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{money(g.own)}</span>
                  </li>
                )}
                {g.children.map((c) => (
                  <li
                    key={c.category}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)" }}
                  >
                    <span>{getBudgetCategoryLabel(c.category)}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubscriptionsCard({ currency }) {
  const { currentHouseholdId } = useHousehold();
  const { data, isLoading } = useQuery({
    queryKey: ["budget-subscriptions", currency, currentHouseholdId],
    queryFn: () => fetchSubscriptions({ currency, householdId: currentHouseholdId }),
  });

  if (isLoading) return null;

  return (
    <Card
      title="Recurring & Subscriptions"
      subtitle={data && data.items.length > 0 ? `${formatCurrencyCompact(data.monthly_total, currency)}/mo total` : undefined}
    >
      {!data || data.items.length === 0 ? (
        <EmptyState message="Mark an entry as recurring (subscription, rent, a bill) to see it here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
          {data.items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, color: "var(--text)", fontSize: "0.875rem" }}>
                  {item.description || getBudgetCategoryLabel(item.category)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {item.frequency} · next due {item.next_due ? formatDateISO(item.next_due) : "—"}
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>
                {formatCurrencyForDisplay(item.amount, currency, { alwaysCents: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SpendingLimitsCard({ currency, limitStatus }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, reset } = useForm({ defaultValues: { category: "", monthly_limit: "" } });

  const { currentHouseholdId } = useHousehold();
  const { data: categories } = useQuery({
    queryKey: ["budget-categories", currentHouseholdId],
    queryFn: () => fetchBudgetCategories({ householdId: currentHouseholdId }),
  });
  const { data: limits, isLoading: limitsLoading } = useQuery({
    queryKey: ["budget-limits", currentHouseholdId],
    queryFn: () => fetchBudgetLimits({ householdId: currentHouseholdId }),
  });

  const statusByCategory = Object.fromEntries((limitStatus || []).map((s) => [s.category, s]));
  const limitByCategory = Object.fromEntries((limits || []).map((l) => [l.category, l]));
  const availableCategories = (categories?.expense || []).filter((c) => !limitByCategory[c]);

  const createMutation = useMutation({
    mutationFn: (data) =>
      createBudgetLimit({
        category: data.category,
        monthly_limit: parseFloat(data.monthly_limit),
        currency,
      }),
    onSuccess: (limit) => {
      queryClient.invalidateQueries({ queryKey: ["budget-limits"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success(`Limit set for ${getBudgetCategoryLabel(limit.category)}`);
      reset({ category: "", monthly_limit: "" });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to set limit"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBudgetLimit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-limits"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
    },
  });

  return (
    <Card title="Spending Limits">
      {limitsLoading ? null : !limits || limits.length === 0 ? (
        // Found live while QA-testing an unrelated fix: this card's own
        // budget-limits query can resolve slower than the page's summary
        // query, and while it's still in flight `limits` is undefined --
        // indistinguishable from "confirmed empty" before this check,
        // so real limits could flash an incorrect "No spending limits
        // set yet" for a moment before the data arrived.
        <EmptyState message="No spending limits set yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          {limits.map((limit) => {
            // The backend's limit_status skips any limit whose currency
            // doesn't match the page's selected currency (it can't compare
            // spend in one currency against a cap in another), so status
            // is undefined here for those -- previously that fell through
            // to a "0%, under budget" progress bar formatted in the wrong
            // currency (a $500 USD limit rendered as "₹0 / ₹500" after
            // switching the page to INR) instead of explaining why there's
            // nothing to show.
            const mismatched = limit.currency !== currency;
            const status = statusByCategory[limit.category];
            const percent = status?.percent ?? 0;
            const barColor = percent >= 100 ? "var(--danger)" : percent >= 80 ? "var(--warning)" : "var(--success)";
            return (
              <div key={limit.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--text)" }}>{getBudgetCategoryLabel(limit.category)}</span>
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {mismatched ? (
                      <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {formatCurrencyForDisplay(limit.monthlyLimit, limit.currency, { alwaysCents: true })} — switch to {limit.currency}{" "}
                        to see progress
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {formatCurrencyForDisplay(status?.spent ?? 0, currency, { alwaysCents: true })} /{" "}
                        {formatCurrencyForDisplay(limit.monthlyLimit, currency, { alwaysCents: true })}{" "}
                        <span style={{ color: barColor }}>({Math.round(percent)}%)</span>
                      </span>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(limit.id)}
                      style={{
                        fontSize: "0.7rem",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        padding: "0.15rem 0.4rem",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {!mismatched && (
                  <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(percent, 100)}%`, background: barColor, borderRadius: 3 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {availableCategories.length > 0 && (
        <form
          onSubmit={handleSubmit((data) => data.category && data.monthly_limit && createMutation.mutate(data))}
          style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}
        >
          <select
            aria-label="Category to add a spending limit for"
            {...register("category")}
            style={{ ...inputStyle, flex: 1, minWidth: "140px" }}
          >
            <option value="">Add a limit for...</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {getBudgetCategoryLabel(c)}
              </option>
            ))}
          </select>
          <input
            aria-label="Monthly limit amount"
            {...register("monthly_limit")}
            type="number"
            step="any"
            placeholder="Monthly limit"
            style={{ ...inputStyle, width: "140px" }}
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8125rem",
            }}
          >
            Set
          </button>
        </form>
      )}
    </Card>
  );
}

function AIInsightsCard({ currency }) {
  const [narrative, setNarrative] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => fetchBudgetInsights({ months: 6, currency }),
    onSuccess: (result) => {
      if (!result.configured) {
        setNotConfigured(true);
        return;
      }
      setNarrative(result.narrative || "Not enough data yet for insights — add a few more entries.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to get insights"),
  });

  return (
    <Card title="✨ AI Insights">
      {notConfigured ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          AI insights aren't configured yet — a Gemini API key needs to be added on the backend.
        </p>
      ) : narrative ? (
        <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
          {narrative}
        </p>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          Get a plain-language read on your spending trends and biggest categories.
        </p>
      )}
      {!narrative && !notConfigured && (
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          style={{
            marginTop: "0.75rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.8125rem",
            opacity: mutation.isPending ? 0.6 : 1,
          }}
        >
          {mutation.isPending ? "Thinking..." : "Get AI Insights"}
        </button>
      )}
    </Card>
  );
}

export default function Budget() {
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { currentHouseholdId } = useHousehold();
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["budget-summary", currency, currentHouseholdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId: currentHouseholdId }),
  });

  const { data: entries } = useQuery({
    queryKey: ["budget-entries", currentHouseholdId],
    queryFn: () => fetchBudgetEntries({ householdId: currentHouseholdId }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBudgetEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success("Entry deleted");
    },
  });

  if (isLoading) return <LoadingState message="Loading your budget..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load budget"} onRetry={refetch} />;

  // "latest" is the most recent month that actually has entries, which
  // isn't necessarily the real current month -- if nothing's been logged
  // yet this month, it's last month's data. Showing that under a "This
  // Month's ..." label read as current when it wasn't, so the top cards
  // fall back to 0 (an accurate "nothing logged yet") instead, and the
  // category/limit cards below relabel themselves with the actual month
  // whenever they're not showing the real current month.
  const latest = summary?.months?.[summary.months.length - 1];
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = latest?.month === currentMonthKey;
  const thisMonth = isCurrentMonth ? latest : null;
  const monthLabel = latest ? new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${latest.month}-01T00:00:00`)) : null;
  const categoryBreakdownTitle =
    isCurrentMonth || !monthLabel ? "This Month's Spending by Category" : `${monthLabel}'s Spending by Category`;

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
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Budget</h1>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Display currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ ...inputStyle, width: "auto" }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Track income and spending separately from your net worth — logging entries here never changes your holdings.
      </p>

      {summary.other_currency_entries > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          {summary.other_currency_entries} entr{summary.other_currency_entries === 1 ? "y" : "ies"} logged in a different currency aren't
          included above — switch currency to see them.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <Card title="This Month's Income" value={formatCurrencyForDisplay(thisMonth?.income || 0, currency, { alwaysCents: true })} />
        <Card title="This Month's Expenses" value={formatCurrencyForDisplay(thisMonth?.expenses || 0, currency, { alwaysCents: true })} />
        <Card
          title="Net"
          value={formatCurrencyForDisplay(thisMonth?.net || 0, currency, { alwaysCents: true })}
          subtitle={
            thisMonth && thisMonth.net >= 0 ? "You're ahead this month" : thisMonth ? "Spending more than you're earning" : undefined
          }
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card title="Income vs Expenses">
          {summary.months.length === 0 ? (
            <EmptyState message="No entries yet. Add your first income or expense on the Expenses page." />
          ) : (
            <MonthlyTrendChart months={summary.months} currency={currency} />
          )}
        </Card>
        <Card title={categoryBreakdownTitle}>
          <CategoryBreakdown breakdown={summary.category_breakdown} currency={currency} />
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <SubscriptionsCard currency={currency} />
        <SpendingLimitsCard currency={currency} limitStatus={summary.limit_status} />
        <AIInsightsCard currency={currency} />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Log an expense">
          <p style={{ margin: "0.25rem 0 0.75rem", color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
            Adding and reviewing entries now lives on its own page, so it is one tap away.
          </p>
          <Link to="/expenses" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Go to Expenses →
          </Link>
        </Card>
      </div>

      <div>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
          Recent entries{" "}
          <Link to="/expenses" style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--primary)" }}>
            See all
          </Link>
        </h2>
        {!entries || entries.length === 0 ? (
          <EmptyState message="No entries yet." />
        ) : (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {entries.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border-light)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--text)", fontSize: "0.875rem" }}>
                      {getBudgetCategoryLabel(e.category)}
                      {e.description ? ` — ${e.description}` : ""}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{formatDateISO(e.entryDate)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        color: e.entryType === "income" ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {e.entryType === "income" ? "+" : "−"}
                      {formatCurrencyForDisplay(e.amount, e.currency, { alwaysCents: true })}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(e.id)}
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
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
