import { useState } from "react";
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
  fetchHouseholds,
  ApiError,
} from "../api";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatCurrencyCompact } from "../utils/formatters";

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
            formatter={(v, name) => [formatCurrencyForDisplay(v, currency), name === "income" ? "Income" : name === "expenses" ? "Expenses" : "Net"]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Legend formatter={(v) => (v === "income" ? "Income" : v === "expenses" ? "Expenses" : "Net")} wrapperStyle={{ fontSize: "0.75rem" }} />
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
              <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{formatCurrencyForDisplay(c.amount, currency)}</span>
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

function AddEntryForm({ categories, householdId, currency }) {
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
    },
  });
  const entryType = watch("entry_type");
  const categoryOptions = entryType === "income" ? categories?.income || [] : categories?.expense || [];

  const mutation = useMutation({
    mutationFn: (data) =>
      createBudgetEntry({
        entry_type: data.entry_type,
        entry_date: data.entry_date,
        amount: parseFloat(data.amount),
        currency: data.currency,
        category: data.category,
        description: data.description || null,
        household_id: householdId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success(entryType === "income" ? "Income added" : "Expense added");
      reset({
        entry_type: entryType,
        category: categoryOptions[0] || "",
        amount: "",
        entry_date: new Date().toISOString().split("T")[0],
        description: "",
        currency,
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add entry"),
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => { setValue("entry_type", "income"); setValue("category", categories?.income?.[0] || ""); }}
          style={{ ...inputStyle, cursor: "pointer", background: entryType === "income" ? "var(--success-light)" : "var(--bg)", color: entryType === "income" ? "var(--success)" : "var(--text)", fontWeight: 600 }}
        >
          + Income
        </button>
        <button
          type="button"
          onClick={() => { setValue("entry_type", "expense"); setValue("category", categories?.expense?.[0] || ""); }}
          style={{ ...inputStyle, cursor: "pointer", background: entryType === "expense" ? "var(--danger-light)" : "var(--bg)", color: entryType === "expense" ? "var(--danger)" : "var(--text)", fontWeight: 600 }}
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
            {categoryOptions.map((c) => <option key={c} value={c}>{getBudgetCategoryLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Date</label>
          <input type="date" {...register("entry_date")} max={new Date().toISOString().split("T")[0]} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Currency</label>
          <select {...register("currency")} style={inputStyle}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Description (optional)</label>
        <input {...register("description")} placeholder={entryType === "income" ? "e.g., August paycheck" : "e.g., Groceries"} style={inputStyle} />
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{ marginTop: "1rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}
      >
        {mutation.isPending ? "Adding..." : `Add ${entryType === "income" ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}

export default function Budget() {
  const [householdId, setHouseholdId] = useState("");
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds, staleTime: 1000 * 60 * 5 });
  const { data: categories } = useQuery({ queryKey: ["budget-categories"], queryFn: fetchBudgetCategories, staleTime: Infinity });

  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["budget-summary", householdId, currency],
    queryFn: () => fetchBudgetSummary({ householdId: householdId || undefined, months: 6, currency }),
  });

  const { data: entries } = useQuery({
    queryKey: ["budget-entries", householdId],
    queryFn: () => fetchBudgetEntries({ householdId: householdId || undefined }),
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Budget</h1>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {households && households.length > 0 && (
            <select value={householdId} onChange={(e) => setHouseholdId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="">Just me</option>
              {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Track income and spending separately from your net worth — logging entries here never changes your holdings.
      </p>

      {summary.other_currency_entries > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          {summary.other_currency_entries} entr{summary.other_currency_entries === 1 ? "y" : "ies"} logged in a different currency aren't included above — switch currency to see them.
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

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Add an entry">
          <AddEntryForm categories={categories} householdId={householdId} currency={currency} />
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
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--text)", fontSize: "0.875rem" }}>
                      {getBudgetCategoryLabel(e.category)}
                      {e.description ? ` — ${e.description}` : ""}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(e.entryDate).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: e.entryType === "income" ? "var(--success)" : "var(--danger)" }}>
                      {e.entryType === "income" ? "+" : "−"}{formatCurrencyForDisplay(e.amount, e.currency)}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(e.id)}
                      style={{ fontSize: "0.75rem", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
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
