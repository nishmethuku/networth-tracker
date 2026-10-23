import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../Card";
import { createBudgetLimit, fetchBudgetLimits, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { suggestLimits } from "../../utils/spendingPatterns";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";

/** Limits worth setting, based on your last three months. One tap sets each. Hidden when there is nothing to suggest. */
export default function SuggestedLimits({ currency, householdId }) {
  const { data: entries } = useRecentEntries(householdId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: limits } = useQuery({
    queryKey: ["budget-limits", householdId],
    queryFn: () => fetchBudgetLimits({ householdId }),
  });
  const rows = useMemo(
    () =>
      limits
        ? suggestLimits(
            entries,
            todayISO(),
            currency,
            limits.map((l) => l.category),
          )
        : [],
    [entries, limits, currency],
  );

  const set = useMutation({
    mutationFn: (s) => createBudgetLimit({ category: s.category, monthly_limit: s.suggested, currency }),
    onSuccess: (limit) => {
      queryClient.invalidateQueries({ queryKey: ["budget-limits"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      toast.success(`Limit set for ${getBudgetCategoryLabel(limit.category)}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not set that limit"),
  });

  if (rows.length === 0) return null;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  return (
    <Card title="Suggested limits" subtitle="Based on your average over the last three months">
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
        {rows.map((s) => (
          <li
            key={s.category}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.4rem 0",
              color: "var(--text)",
            }}
          >
            <span style={{ fontSize: "0.9375rem" }}>
              {getBudgetCategoryLabel(s.category)}{" "}
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>· you average {money(s.average)}</span>
            </span>
            <button
              type="button"
              disabled={set.isPending}
              onClick={() => set.mutate(s)}
              aria-label={`Set a ${money(s.suggested)} limit for ${getBudgetCategoryLabel(s.category)}`}
              style={{
                fontSize: "0.8125rem",
                padding: "0.35rem 0.7rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              Limit {money(s.suggested)}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
