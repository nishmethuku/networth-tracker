import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import EmptyState from "./EmptyState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import { useToast } from "../contexts/ToastContext";
import { fetchLiabilities, createLiability, updateLiability, deleteLiability, ApiError } from "../api";
import { formatCurrencyForDisplay, formatCurrencyCompact, formatPercent } from "../utils/formatters";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { CURRENCIES, LIABILITY_TYPE_OPTIONS, getLiabilityTypeLabel } from "../constants/enums";
import { projectPayoff, monthsToPayoff } from "../utils/debtPayoff";

const inputStyle = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};
const labelStyle = { fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" };

const LIABILITY_ICONS = {
  mortgage: "🏠",
  credit_card: "💳",
  auto_loan: "🚗",
  student_loan: "🎓",
  personal_loan: "🤝",
  line_of_credit: "🏦",
  other: "📄",
};

const emptyForm = {
  name: "",
  liability_type: "mortgage",
  currency: getDefaultDisplayCurrency(),
  current_balance: "",
  original_amount: "",
  interest_rate: "",
  notes: "",
};

function LiabilityForm({ initial, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(initial ?? emptyForm);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      name: form.name,
      liability_type: form.liability_type,
      currency: form.currency,
      current_balance: parseFloat(form.current_balance) || 0,
      original_amount: form.original_amount === "" ? null : parseFloat(form.original_amount),
      interest_rate: form.interest_rate === "" ? null : parseFloat(form.interest_rate),
      notes: form.notes || null,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label style={labelStyle} htmlFor="liability-name">
            Name
          </label>
          <input
            id="liability-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Home mortgage"
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="liability-type">
            Type
          </label>
          <select
            id="liability-type"
            value={form.liability_type}
            onChange={(e) => setForm({ ...form, liability_type: e.target.value })}
            style={inputStyle}
          >
            {LIABILITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="liability-currency">
            Currency
          </label>
          <select
            id="liability-currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            style={inputStyle}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="liability-current-balance">
            Current balance
          </label>
          <input
            id="liability-current-balance"
            type="number"
            step="any"
            min="0"
            value={form.current_balance}
            onChange={(e) => setForm({ ...form, current_balance: e.target.value })}
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="liability-original-amount">
            Original amount (optional)
          </label>
          <input
            id="liability-original-amount"
            type="number"
            step="any"
            min="0"
            value={form.original_amount}
            onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="liability-interest-rate">
            Interest rate % (optional)
          </label>
          <input
            id="liability-interest-rate"
            type="number"
            step="any"
            min="0"
            value={form.interest_rate}
            onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle} htmlFor="liability-notes">
          Notes (optional)
        </label>
        <input id="liability-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PayoffCalculator({ liability }) {
  const [monthlyPayment, setMonthlyPayment] = useState(() => Math.max(1, Math.round(liability.currentBalance / 24)));

  const points = useMemo(
    () =>
      projectPayoff({
        balance: liability.currentBalance,
        annualRatePct: liability.interestRate || 0,
        monthlyPayment: Number(monthlyPayment) || 0,
      }),
    [liability.currentBalance, liability.interestRate, monthlyPayment],
  );
  const months = monthsToPayoff(points);
  const totalInterest = points[points.length - 1]?.interestPaid ?? 0;

  return (
    <div style={{ marginTop: "0.75rem", padding: "0.875rem", borderRadius: "var(--radius)", background: "var(--bg-secondary)" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
            Monthly payment
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={monthlyPayment}
            onChange={(e) => setMonthlyPayment(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
        </div>
        {liability.interestRate == null && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No interest rate set — assuming 0%.</div>
        )}
      </div>
      {months != null ? (
        <div style={{ fontSize: "0.875rem", color: "var(--text)" }}>
          Paid off in <strong>{months}</strong> month{months === 1 ? "" : "s"} ({(months / 12).toFixed(1)} yrs), paying{" "}
          <strong>{formatCurrencyForDisplay(totalInterest, liability.currency, { includeCode: false })}</strong> in total interest.
        </div>
      ) : (
        <div style={{ fontSize: "0.875rem", color: "var(--danger)" }}>
          At this payment, the balance never shrinks — increase it above the monthly interest to see a payoff date.
        </div>
      )}
      {points.length > 1 && (
        <div style={{ width: "100%", height: 160, marginTop: "0.75rem" }}>
          <ResponsiveContainer>
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(m) => `${m}mo`} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                tickFormatter={(v) => formatCurrencyCompact(v, liability.currency)}
                width={56}
              />
              <Tooltip
                formatter={(v) => formatCurrencyForDisplay(v, liability.currency)}
                labelFormatter={(m) => `Month ${m}`}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
              />
              <Line type="monotone" dataKey="balance" stroke="var(--danger)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function LiabilityRow({ liability, displayCurrency, onEdit, onDelete }) {
  const [showCalc, setShowCalc] = useState(false);
  const progressPct =
    liability.originalAmount && liability.originalAmount > 0
      ? Math.max(0, Math.min(100, 100 - (liability.currentBalance / liability.originalAmount) * 100))
      : null;

  return (
    <div style={{ padding: "1rem 0", borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.125rem" }}>{LIABILITY_ICONS[liability.liabilityType] || "📄"}</span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{liability.name}</span>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            {getLiabilityTypeLabel(liability.liabilityType)}
            {liability.interestRate != null && ` · ${formatPercent(liability.interestRate, 2)} APR`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--danger)", fontSize: "1.0625rem" }}>
            {formatCurrencyForDisplay(liability.currentBalance, liability.currency, { includeCode: false })}
          </div>
          {liability.currency !== displayCurrency && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              ≈ {formatCurrencyCompact(liability.displayBalance, displayCurrency)}
            </div>
          )}
        </div>
      </div>
      {progressPct != null && (
        <div style={{ marginTop: "0.6rem" }}>
          <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--success)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{progressPct.toFixed(0)}% paid off</div>
        </div>
      )}
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem" }}>
        <button
          onClick={() => setShowCalc((v) => !v)}
          style={{
            fontSize: "0.8125rem",
            color: "var(--primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontWeight: 500,
          }}
        >
          {showCalc ? "Hide payoff calculator" : "Payoff calculator"}
        </button>
        <button
          onClick={() => onEdit(liability)}
          style={{
            fontSize: "0.8125rem",
            color: "var(--primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontWeight: 500,
          }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(liability)}
          style={{
            fontSize: "0.8125rem",
            color: "var(--danger)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontWeight: 500,
          }}
        >
          Delete
        </button>
      </div>
      {showCalc && <PayoffCalculator liability={liability} />}
    </div>
  );
}

export default function Liabilities() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [currency] = useState(getDefaultDisplayCurrency);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const {
    data: liabilities,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["liabilities", currency],
    queryFn: () => fetchLiabilities({ currency }),
  });

  const createMutation = useMutation({
    mutationFn: createLiability,
    onSuccess: (liability) => {
      queryClient.invalidateQueries({ queryKey: ["liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${liability.name} added`);
      setShowForm(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add liability"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateLiability(id, payload),
    onSuccess: (liability) => {
      queryClient.invalidateQueries({ queryKey: ["liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${liability.name} updated`);
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to update liability"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLiability,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(deleting?.name ? `${deleting.name} deleted` : "Liability deleted");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to delete liability"),
  });

  if (isLoading) return <LoadingState message="Loading liabilities..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load liabilities"} onRetry={refetch} />;

  const total = (liabilities || []).reduce((sum, l) => sum + l.displayBalance, 0);

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
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Liabilities</h1>
        {!showForm && (
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            + Add Liability
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Mortgages, credit cards, and loans — subtracted from your assets to get your true net worth.
      </p>

      {(showForm || editing) && (
        <div style={{ marginBottom: "1.5rem" }}>
          <Card title={editing ? "Edit Liability" : "New Liability"}>
            <LiabilityForm
              initial={
                editing
                  ? {
                      name: editing.name,
                      liability_type: editing.liabilityType,
                      currency: editing.currency,
                      current_balance: String(editing.currentBalance),
                      original_amount: editing.originalAmount != null ? String(editing.originalAmount) : "",
                      interest_rate: editing.interestRate != null ? String(editing.interestRate) : "",
                      notes: editing.notes || "",
                    }
                  : null
              }
              submitting={createMutation.isPending || updateMutation.isPending}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
              onSubmit={(payload) => (editing ? updateMutation.mutate({ id: editing.id, payload }) : createMutation.mutate(payload))}
            />
          </Card>
        </div>
      )}

      {!liabilities || liabilities.length === 0 ? (
        <EmptyState message="No liabilities tracked yet. Add a mortgage, loan, or credit card balance to see your true net worth." />
      ) : (
        <Card title="Total liabilities" value={formatCurrencyCompact(total, currency)}>
          <div style={{ marginTop: "1rem" }}>
            {liabilities.map((l) => (
              <LiabilityRow
                key={l.id}
                liability={l}
                displayCurrency={currency}
                onEdit={(li) => {
                  setShowForm(false);
                  setEditing(li);
                }}
                onDelete={setDeleting}
              />
            ))}
          </div>
        </Card>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleting}
        assetName={deleting?.name}
        title="Delete Liability?"
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
