import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import NumericInput from "./NumericInput";
import { useToast } from "../contexts/ToastContext";
import {
  fetchBudgetCategories,
  fetchBudgetEntries,
  createBudgetEntry,
  deleteBudgetEntry,
  fetchBudgetSummary,
  fetchSubscriptions,
  fetchBudgetLimits,
  createBudgetLimit,
  deleteBudgetLimit,
  fetchBudgetInsights,
  fetchHoldings,
  ApiError,
} from "../api";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatCurrencyCompact } from "../utils/formatters";

const RECURRING_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

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
              formatCurrencyForDisplay(v, currency),
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

function CategoryBreakdown({ breakdown, currency }) {
  const total = breakdown.reduce((sum, c) => sum + c.amount, 0);
  if (total === 0) return <EmptyState message="No expenses logged this month yet." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {breakdown.map((c) => {
        const pct = (c.amount / total) * 100;
        return (
          <div key={c.category}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
              <span style={{ color: "var(--text)" }}>{getBudgetCategoryLabel(c.category)}</span>
              <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                {formatCurrencyForDisplay(c.amount, currency)} <span style={{ color: "var(--text-muted)" }}>({Math.round(pct)}%)</span>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddEntryForm({ categories, currency }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, control, watch, setValue, handleSubmit, reset } = useForm({
    defaultValues: {
      entry_type: "expense",
      category: categories?.expense?.[0] || "",
      amount: "",
      entry_date: new Date().toISOString().split("T")[0],
      description: "",
      currency,
      is_recurring: false,
      recurring_frequency: "monthly",
      funding_source_holding_id: "",
    },
  });
  const entryType = watch("entry_type");
  const isRecurring = watch("is_recurring");
  const categoryOptions = entryType === "income" ? categories?.income || [] : categories?.expense || [];

  // Cash accounts to pay an expense out of — picking one deducts the
  // expense automatically instead of updating that account's balance by
  // hand later. Same mechanism as funding a holding purchase from cash.
  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: entryType === "expense",
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      createBudgetEntry({
        entry_type: data.entry_type,
        entry_date: data.entry_date,
        amount: parseFloat(data.amount),
        currency: data.currency,
        category: data.category,
        description: data.description || null,
        is_recurring: data.is_recurring,
        recurring_frequency: data.is_recurring ? data.recurring_frequency : null,
        ...(data.entry_type === "expense" && data.funding_source_holding_id
          ? { funding_source_holding_id: Number(data.funding_source_holding_id) }
          : {}),
      }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-subscriptions"] });
      if (entry.fundingSource) {
        queryClient.invalidateQueries({ queryKey: ["holding", entry.fundingSource.holdingId] });
        queryClient.invalidateQueries({ queryKey: ["holding-valuations", entry.fundingSource.holdingId] });
        queryClient.invalidateQueries({ queryKey: ["holdings"] });
        toast.success(
          `Expense added — account balance updated to ${formatCurrencyForDisplay(entry.fundingSource.newBalance, entry.fundingSource.currency, { includeCode: false })}`,
        );
      } else {
        toast.success(entryType === "income" ? "Income added" : "Expense added");
      }
      reset({
        entry_type: entryType,
        category: categoryOptions[0] || "",
        amount: "",
        entry_date: new Date().toISOString().split("T")[0],
        description: "",
        currency,
        is_recurring: false,
        recurring_frequency: "monthly",
        funding_source_holding_id: "",
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add entry"),
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => {
            setValue("entry_type", "income");
            setValue("category", categories?.income?.[0] || "");
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            background: entryType === "income" ? "var(--success-light)" : "var(--bg)",
            color: entryType === "income" ? "var(--success)" : "var(--text)",
            fontWeight: 600,
          }}
        >
          + Income
        </button>
        <button
          type="button"
          onClick={() => {
            setValue("entry_type", "expense");
            setValue("category", categories?.expense?.[0] || "");
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            background: entryType === "expense" ? "var(--danger-light)" : "var(--bg)",
            color: entryType === "expense" ? "var(--danger)" : "var(--text)",
            fontWeight: 600,
          }}
        >
          − Expense
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Amount</label>
          <NumericInput control={control} name="amount" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Category</label>
          <select {...register("category")} style={inputStyle}>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {getBudgetCategoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Date</label>
          <input type="date" {...register("entry_date")} max={new Date().toISOString().split("T")[0]} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Currency</label>
          <select {...register("currency")} style={inputStyle}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {entryType === "expense" && cashHoldings?.length > 0 && (
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
              Paid from
            </label>
            <select
              {...register("funding_source_holding_id")}
              style={inputStyle}
              title="Deducts this expense from the selected account's balance"
            >
              <option value="">— none —</option>
              {cashHoldings.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.account ? ` (${c.account})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
          Description (optional)
        </label>
        <input
          {...register("description")}
          placeholder={entryType === "income" ? "e.g., August paycheck" : "e.g., Groceries"}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: "0.875rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <label
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--text)", cursor: "pointer" }}
        >
          <input type="checkbox" {...register("is_recurring")} />
          Recurring (subscription, rent, bill, etc.)
        </label>
        {isRecurring && (
          <select {...register("recurring_frequency")} style={{ ...inputStyle, width: "auto" }}>
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          marginTop: "1rem",
          padding: "0.75rem 1.5rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {mutation.isPending ? "Adding..." : `Add ${entryType === "income" ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}

function SubscriptionsCard({ currency }) {
  const { data, isLoading } = useQuery({
    queryKey: ["budget-subscriptions", currency],
    queryFn: () => fetchSubscriptions({ currency }),
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
                  {item.frequency} · next due {item.next_due ? new Date(item.next_due).toLocaleDateString() : "—"}
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>
                {formatCurrencyForDisplay(item.amount, currency)}
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

  const { data: categories } = useQuery({ queryKey: ["budget-categories"], queryFn: fetchBudgetCategories, staleTime: Infinity });
  const { data: limits } = useQuery({
    queryKey: ["budget-limits"],
    queryFn: () => fetchBudgetLimits(),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-limits"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success("Limit set");
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
      {!limits || limits.length === 0 ? (
        <EmptyState message="No spending limits set yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          {limits.map((limit) => {
            const status = statusByCategory[limit.category];
            const percent = status?.percent ?? 0;
            const barColor = percent >= 100 ? "var(--danger)" : percent >= 80 ? "var(--warning)" : "var(--success)";
            return (
              <div key={limit.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--text)" }}>{getBudgetCategoryLabel(limit.category)}</span>
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {formatCurrencyForDisplay(status?.spent ?? 0, currency)} / {formatCurrencyForDisplay(limit.monthlyLimit, currency)}{" "}
                      <span style={{ color: barColor }}>({Math.round(percent)}%)</span>
                    </span>
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
                <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(percent, 100)}%`, background: barColor, borderRadius: 3 }} />
                </div>
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
          <select {...register("category")} style={{ ...inputStyle, flex: 1, minWidth: "140px" }}>
            <option value="">Add a limit for...</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {getBudgetCategoryLabel(c)}
              </option>
            ))}
          </select>
          <input
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
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: categories } = useQuery({ queryKey: ["budget-categories"], queryFn: fetchBudgetCategories, staleTime: Infinity });

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["budget-summary", currency],
    queryFn: () => fetchBudgetSummary({ months: 6, currency }),
  });

  const { data: entries } = useQuery({
    queryKey: ["budget-entries"],
    queryFn: () => fetchBudgetEntries(),
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

  const latest = summary?.months?.[summary.months.length - 1];

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
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
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
        <Card title="This Month's Income" value={formatCurrencyCompact(latest?.income || 0, currency)} />
        <Card title="This Month's Expenses" value={formatCurrencyCompact(latest?.expenses || 0, currency)} />
        <Card
          title="Net"
          value={formatCurrencyCompact(latest?.net || 0, currency)}
          subtitle={latest && latest.net >= 0 ? "You're ahead this month" : "Spending more than you're earning"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <Card title="Income vs Expenses">
          {summary.months.length === 0 ? (
            <EmptyState message="No entries yet — add your first income or expense below." />
          ) : (
            <MonthlyTrendChart months={summary.months} currency={currency} />
          )}
        </Card>
        <Card title="This Month's Spending by Category">
          <CategoryBreakdown breakdown={summary.category_breakdown} currency={currency} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <SubscriptionsCard currency={currency} />
        <SpendingLimitsCard currency={currency} limitStatus={summary.limit_status} />
        <AIInsightsCard currency={currency} />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Add an entry">
          <AddEntryForm categories={categories} currency={currency} />
          <p style={{ marginTop: "1rem", fontSize: "0.8125rem" }}>
            <Link to="/import-bank-statement" style={{ color: "var(--primary)" }}>
              Import a bank or credit card statement instead →
            </Link>
          </p>
        </Card>
      </div>

      <div>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>Recent entries</h2>
        {!entries || entries.length === 0 ? (
          <EmptyState message="No entries yet." />
        ) : (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {entries.slice(0, 30).map((e) => (
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
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(e.entryDate).toLocaleDateString()}</div>
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
                      {formatCurrencyForDisplay(e.amount, e.currency)}
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
