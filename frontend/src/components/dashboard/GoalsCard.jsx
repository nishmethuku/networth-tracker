import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "../Card";
import EmptyState from "../EmptyState";
import { useToast } from "../../contexts/ToastContext";
import { fetchGoals, createGoal, deleteGoal, ApiError } from "../../api";
import { formatCurrencyForDisplay } from "../../utils/formatters";
import { CURRENCIES } from "../../constants/enums";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
};

function daysRemaining(targetDate) {
  if (!targetDate) return null;
  const ms = new Date(targetDate) - new Date();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function GoalRow({ goal, currentNetWorth, displayCurrency, onDelete }) {
  const sameCurrency = goal.currency === displayCurrency;
  const pct = sameCurrency && goal.targetAmount > 0 ? Math.min(100, (currentNetWorth / goal.targetAmount) * 100) : null;
  const remaining = sameCurrency ? Math.max(0, goal.targetAmount - currentNetWorth) : null;
  const days = daysRemaining(goal.targetDate);

  return (
    <div style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>{goal.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            {formatCurrencyForDisplay(goal.targetAmount, goal.currency, { includeCode: false })}
          </span>
          <button
            onClick={() => onDelete(goal.id)}
            style={{ fontSize: "0.7rem", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "0.1rem 0.4rem", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      </div>
      {sameCurrency ? (
        <>
          <div style={{ height: 8, borderRadius: 4, background: "var(--bg-secondary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "var(--success)" : "var(--primary)", borderRadius: 4, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>{pct.toFixed(0)}% there{remaining > 0 ? ` — ${formatCurrencyForDisplay(remaining, goal.currency, { includeCode: false })} to go` : " 🎉"}</span>
            {days != null && <span>{days > 0 ? `${days} days left` : "Target date passed"}</span>}
          </div>
        </>
      ) : (
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Set in {goal.currency} — switch your display currency to {goal.currency} to see progress.
        </p>
      )}
    </div>
  );
}

function AddGoalForm({ onDone, defaultCurrency }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", target_amount: "", currency: defaultCurrency, target_date: "" });

  const mutation = useMutation({
    mutationFn: () =>
      createGoal({
        name: form.name,
        target_amount: parseFloat(form.target_amount),
        currency: form.currency,
        target_date: form.target_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal added");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add goal"),
  });

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem", alignItems: "end", marginTop: "0.75rem" }}>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.2rem" }}>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Retirement" style={inputStyle} required />
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.2rem" }}>Target</label>
        <input type="number" step="any" min="0.01" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} style={inputStyle} required />
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.2rem" }}>Currency</label>
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.2rem" }}>By (optional)</label>
        <input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} style={inputStyle} />
      </div>
      <button type="submit" disabled={mutation.isPending} style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600, fontSize: "0.8125rem" }}>
        {mutation.isPending ? "Adding…" : "Add goal"}
      </button>
    </form>
  );
}

export default function GoalsCard({ currentNetWorth, displayCurrency }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: goals, isLoading } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });

  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal removed");
    },
  });

  if (isLoading) return null;

  return (
    <Card title="Goals">
      {!goals || goals.length === 0 ? (
        <EmptyState message="No goals yet — set a net worth target to track progress toward it." />
      ) : (
        <div>
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} currentNetWorth={currentNetWorth} displayCurrency={displayCurrency} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
      {showForm ? (
        <AddGoalForm defaultCurrency={displayCurrency} onDone={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}
        >
          + Add a goal
        </button>
      )}
    </Card>
  );
}
