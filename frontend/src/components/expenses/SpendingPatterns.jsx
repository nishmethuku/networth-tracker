import { useMemo } from "react";
import Card from "../Card";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { noSpendStats, topNotes, weekdayPattern } from "../../utils/spendingPatterns";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Habits at a glance: where the month went by note, which weekday costs the most, and no-spend days. */
export default function SpendingPatterns({ currency, householdId, month }) {
  const { data } = useRecentEntries(householdId);
  const today = todayISO();
  const isThisMonth = month === today.slice(0, 7);
  const notes = useMemo(() => topNotes(data, month, currency), [data, month, currency]);
  const week = useMemo(() => weekdayPattern(data, today, currency), [data, today, currency]);
  const quiet = useMemo(() => (isThisMonth ? noSpendStats(data, today, currency) : null), [data, today, currency, isThisMonth]);
  const max = Math.max(...week.map((w) => w.average), 0);
  if (notes.length === 0 && max === 0) return null;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  const priciest = max > 0 ? week.find((w) => w.average === max) : null;

  return (
    <Card
      title="Your habits"
      subtitle={priciest ? `${NAMES[priciest.day]} is your priciest day (about ${money(priciest.average)} on average)` : undefined}
    >
      {max > 0 && (
        <div
          role="img"
          aria-label="Average spending by weekday"
          style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "5rem", marginTop: "0.75rem" }}
        >
          {week.map((w) => (
            <div
              key={w.day}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
              }}
            >
              <div
                title={`${NAMES[w.day]}: ${money(w.average)}`}
                style={{
                  width: "100%",
                  height: `${Math.max(4, (w.average / max) * 100)}%`,
                  borderRadius: "4px 4px 0 0",
                  background: w.average === max ? "var(--primary)" : "color-mix(in srgb, var(--primary) 35%, transparent)",
                }}
              />
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>{NAMES[w.day][0]}</span>
            </div>
          ))}
        </div>
      )}
      {quiet && quiet.elapsed > 0 && (
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "var(--text)" }}>
          {quiet.days} no-spend {quiet.days === 1 ? "day" : "days"} so far this month
          {quiet.streak > 1 ? `, and a ${quiet.streak}-day streak going` : ""}.
        </p>
      )}
      {notes.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }} aria-label="Top notes this month">
          {notes.map((n) => (
            <li
              key={n.label.toLowerCase()}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.3rem 0",
                borderTop: "1px solid var(--border-light)",
                fontSize: "0.875rem",
                color: "var(--text)",
              }}
            >
              <span>
                {n.label} <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>· {n.count}×</span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{money(n.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
