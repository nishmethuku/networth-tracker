import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBudgetSummary, fetchSubscriptions } from "../../api";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { safeToSpend, typicalIncome } from "../../utils/safeToSpend";
import { spendSummary } from "../../utils/spendSummary";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";

/** One line: what you can spend per day for the rest of this month after bills. Hidden without income to base it on. */
export default function SafeToSpend({ currency, householdId }) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const { data: entries } = useRecentEntries(householdId);
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });
  const { data: subs } = useQuery({
    queryKey: ["budget-subscriptions", currency, householdId],
    queryFn: () => fetchSubscriptions({ currency, householdId }),
  });

  const result = useMemo(() => {
    if (!summary?.months) return null;
    const incomeThisMonth = summary.months.find((m) => m.month === month)?.income ?? 0;
    const due = (subs?.items || [])
      .filter((i) => i.next_due && i.next_due.slice(0, 7) === month && i.next_due.slice(0, 10) >= today)
      .reduce((s, i) => s + i.amount, 0);
    return {
      due,
      value: safeToSpend({
        incomeThisMonth,
        typicalIncome: typicalIncome(summary.months, month),
        spent: spendSummary(entries, today, currency).month,
        dueThisMonth: due,
        today,
      }),
    };
  }, [summary, subs, entries, month, today, currency]);

  if (!result?.value) return null;
  const { value, due } = result;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  const over = value.perDay < 0;

  return (
    <p
      style={{
        margin: "0 0 1rem",
        padding: "0.75rem 1rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--card)",
        color: "var(--text)",
        fontSize: "0.9375rem",
      }}
    >
      {over ? (
        <>
          You are <strong style={{ color: "var(--danger)" }}>{money(Math.abs(value.available))}</strong> past this month&apos;s income after
          bills.
        </>
      ) : (
        <>
          Safe to spend: <strong style={{ fontFamily: "var(--font-mono)" }}>{money(value.perDay)}</strong> a day for the next{" "}
          {value.daysLeft} day
          {value.daysLeft === 1 ? "" : "s"}.
        </>
      )}{" "}
      <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
        Based on {value.basis === "this month" ? "income so far this month" : "your typical monthly income"}
        {due > 0 ? `, with ${money(due)} of bills still due` : ""}.
      </span>
    </p>
  );
}
