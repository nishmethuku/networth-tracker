import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "../Card";
import { updateBudgetEntry, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { useRecentEntries } from "../../hooks/useRecentEntries";
import { detectRecurring } from "../../utils/detectRecurring";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay } from "../../utils/formatters";

/** Spotted repeats you have not marked as recurring yet. One tap tracks them as a bill. */
export default function RecurringSuggestions({ currency, householdId }) {
  const { data } = useRecentEntries(householdId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const found = useMemo(() => detectRecurring(data, currency), [data, currency]);

  const track = useMutation({
    mutationFn: (s) => updateBudgetEntry(s.latestEntryId, { is_recurring: true, recurring_frequency: s.frequency }),
    onSuccess: () => {
      for (const key of ["budget-entries", "budget-subscriptions", "budget-summary"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Now tracked as a recurring bill");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not track that bill"),
  });

  if (found.length === 0) return null;
  return (
    <Card title="Looks recurring" subtitle="These keep showing up. Track them so they appear in Coming up.">
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
        {found.map((s) => (
          <li
            key={`${s.category}-${s.description}`}
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
              {s.description || getBudgetCategoryLabel(s.category)}{" "}
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                · about {formatCurrencyForDisplay(s.amount, currency, { includeCode: false })} {s.frequency}
              </span>
            </span>
            <button
              type="button"
              disabled={track.isPending}
              onClick={() => track.mutate(s)}
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
              Track as {s.frequency}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
