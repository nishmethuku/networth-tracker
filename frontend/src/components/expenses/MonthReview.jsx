import { useMemo } from "react";
import Card from "../Card";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { monthReview } from "../../utils/spendingPatterns";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay, formatDateISO, todayISO } from "../../utils/formatters";

/** A look back at a finished month. Only shows for months before the current one. */
export default function MonthReview({ currency, householdId, month }) {
  const { data } = useRecentEntries(householdId);
  const r = useMemo(() => (month < todayISO().slice(0, 7) ? monthReview(data, month, currency) : null), [data, month, currency]);
  if (!r) return null;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  const pct = r.vsUsualPct === null ? null : Math.round(Math.abs(r.vsUsualPct));
  return (
    <Card title="Month in review">
      <p style={{ margin: "0.5rem 0 0", color: "var(--text)", fontSize: "0.9375rem", lineHeight: 1.5 }}>
        You spent <strong>{money(r.total)}</strong> across {r.activeDays} {r.activeDays === 1 ? "day" : "days"}, about{" "}
        {money(r.perActiveDay)} on the days you spent.
        {pct !== null && pct >= 5
          ? ` That is ${pct}% ${r.vsUsualPct > 0 ? "more" : "less"} than your usual month.`
          : pct !== null
            ? " That is about your usual month."
            : ""}
        {r.biggest
          ? ` The biggest single purchase was ${money(r.biggest.amount)} (${r.biggest.description || getBudgetCategoryLabel(r.biggest.category)}, ${formatDateISO(r.biggest.entryDate)}).`
          : ""}
      </p>
    </Card>
  );
}
