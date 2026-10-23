import { useMemo } from "react";
import { Link } from "react-router-dom";
import Card from "../Card";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { spendSummary } from "../../utils/spendSummary";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay, formatDateISO, todayISO } from "../../utils/formatters";

function Stat({ label, value, note }) {
  return (
    <div style={{ minWidth: "6rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.125rem", color: "var(--text)" }}>{value}</div>
      {note && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{note}</div>}
    </div>
  );
}

/** Today, this week and this month of spending at a glance, with a one-tap way to add more. Hidden until there is spending. */
export default function SpendingCard({ currency, householdId }) {
  const { data } = useRecentEntries(householdId);
  const s = useMemo(() => spendSummary(data, todayISO(), currency), [data, currency]);
  if (!s.hasAny) return null;

  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  let weekNote = null;
  if (s.lastWeek > 0) {
    const diff = s.week - s.lastWeek;
    weekNote = diff === 0 ? "Same as last week" : `${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than last week`;
  }

  return (
    <Card title="Spending" subtitle="Card payments are left out so nothing is counted twice">
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
        <Stat label="Today" value={money(s.today)} />
        <Stat label="This week" value={money(s.week)} note={weekNote} />
        <Stat label="This month" value={money(s.month)} />
      </div>
      {s.topCategories.length > 0 && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          Biggest this month: {s.topCategories.map((c) => `${getBudgetCategoryLabel(c.category)} ${money(c.amount)}`).join(" · ")}
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Latest expenses">
        {s.recent.map((e) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              padding: "0.35rem 0",
              borderTop: "1px solid var(--border-light)",
              fontSize: "0.875rem",
              color: "var(--text)",
            }}
          >
            <span style={{ minWidth: 0 }}>
              {e.description || getBudgetCategoryLabel(e.category)}{" "}
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>· {formatDateISO(e.entryDate)}</span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{money(e.amount)}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("nw:quick-add"))}
          style={{
            padding: "0.5rem 0.9rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Add expense
        </button>
        <Link to="/expenses" style={{ color: "var(--primary)", fontSize: "0.875rem" }}>
          See all expenses →
        </Link>
      </div>
    </Card>
  );
}
