import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../Card";
import { createBudgetEntry, createBudgetLimit, fetchBudgetSummary, fetchSubscriptions, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";
import { monthPace } from "../../utils/monthPace";
import { dueRecurring } from "../../utils/dueRecurring";
import { shiftMonth } from "../../utils/entryGroups";

/** Under the month's total: how fast you are spending, limits, and bills that are due to log. */
export default function ExpenseInsights({ currency, householdId, month, spent }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayISO();
  const isThisMonth = month === today.slice(0, 7);
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });

  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });
  const { data: subs } = useQuery({
    queryKey: ["budget-subscriptions", currency, householdId],
    queryFn: () => fetchSubscriptions({ householdId, currency }),
    enabled: isThisMonth,
  });

  const rollover = useMutation({
    mutationFn: (l) => createBudgetLimit({ category: l.category, monthly_limit: l.base_limit ?? l.limit, currency, rollover: !l.rollover }),
    onSuccess: (_d, l) => {
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-limits"] });
      toast.success(l.rollover ? "Carry over turned off" : "Unspent budget will carry over to next month");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not change that limit"),
  });

  const lastTotal = useMemo(() => summary?.months?.find((m) => m.month === shiftMonth(month, -1))?.expenses ?? null, [summary, month]);
  const pace = useMemo(() => monthPace(spent, month, today, lastTotal), [spent, month, today, lastTotal]);
  const due = useMemo(() => (isThisMonth ? dueRecurring(subs?.items, today) : []), [subs, isThisMonth, today]);
  const limits = isThisMonth && summary?.latest_month === month ? (summary.limit_status || []).filter((l) => l.limit > 0) : [];

  const logMutation = useMutation({
    mutationFn: (item) =>
      createBudgetEntry({
        entry_type: "expense",
        entry_date: todayISO(),
        amount: item.amount,
        currency,
        category: item.category,
        description: item.description || null,
        is_recurring: true,
        recurring_frequency: item.frequency,
        ...(householdId ? { household_id: householdId } : {}),
      }),
    onSuccess: () => {
      for (const key of ["budget-entries", "budget-summary", "budget-subscriptions"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Logged for today");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not log it"),
  });

  if (!pace && due.length === 0 && limits.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: "1rem", marginBottom: "1.25rem" }}>
      {pace && (
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
          {isThisMonth ? (
            <>
              About <strong style={{ color: "var(--text)" }}>{money(pace.dailyAverage)}</strong> a day. On pace for{" "}
              <strong style={{ color: "var(--text)" }}>{money(pace.projected)}</strong> this month
            </>
          ) : (
            <>
              About <strong style={{ color: "var(--text)" }}>{money(pace.dailyAverage)}</strong> a day over the month
            </>
          )}
          {pace.vsLastMonthPct != null && Math.abs(pace.vsLastMonthPct) >= 1 && (
            <>
              {" "}
              ({pace.vsLastMonthPct > 0 ? "up" : "down"} {Math.abs(Math.round(pace.vsLastMonthPct))}% from last month)
            </>
          )}
          .
        </p>
      )}

      {due.length > 0 && (
        <Card title="Due to log" subtitle="Recurring expenses that have come around again">
          <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "grid", gap: "0.5rem" }}>
            {due.map((d) => (
              <li
                key={`${d.category}-${d.description}-${d.amount}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}
              >
                <span style={{ fontSize: "0.9375rem", color: "var(--text)", minWidth: 0 }}>
                  {d.description || getBudgetCategoryLabel(d.category)}
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                    {" "}
                    · {money(d.amount)} · {d.daysOverdue === 0 ? "due today" : `${d.daysOverdue} day${d.daysOverdue === 1 ? "" : "s"} ago`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={logMutation.isPending}
                  onClick={() => logMutation.mutate(d)}
                  aria-label={`Log ${d.description || getBudgetCategoryLabel(d.category)} now`}
                  style={{
                    padding: "0.35rem 0.8rem",
                    borderRadius: "var(--radius)",
                    border: "none",
                    background: "var(--primary)",
                    color: "var(--text-inverse)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    flexShrink: 0,
                  }}
                >
                  Log it
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {limits.length > 0 && (
        <Card title="Monthly limits">
          <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "grid", gap: "0.6rem" }}>
            {limits.map((l) => {
              const over = l.percent >= 100;
              const near = l.percent >= 80;
              return (
                <li key={l.category}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", gap: "0.5rem" }}>
                    <span>
                      {getBudgetCategoryLabel(l.category)}
                      <button
                        type="button"
                        disabled={rollover.isPending}
                        onClick={() => rollover.mutate(l)}
                        aria-pressed={!!l.rollover}
                        aria-label={`Carry over unspent ${getBudgetCategoryLabel(l.category)} budget: ${l.rollover ? "on" : "off"}`}
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.6875rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "999px",
                          border: "1px solid var(--border)",
                          background: l.rollover ? "var(--primary-light)" : "transparent",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {l.rollover ? "Carry over: on" : "Carry over"}
                      </button>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: over ? "var(--danger)" : "var(--text-secondary)" }}>
                      {money(l.spent)} of {money(l.limit)}
                    </span>
                  </div>
                  {l.carried_over > 0 && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Includes {money(l.carried_over)} left over from last month
                    </div>
                  )}
                  <div
                    role="progressbar"
                    aria-label={`${getBudgetCategoryLabel(l.category)} limit used`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(l.percent))}
                    style={{
                      height: "0.4rem",
                      background: "var(--border)",
                      borderRadius: "999px",
                      marginTop: "0.25rem",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, l.percent)}%`,
                        height: "100%",
                        background: over ? "var(--danger)" : near ? "var(--warning, var(--primary))" : "var(--success)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
