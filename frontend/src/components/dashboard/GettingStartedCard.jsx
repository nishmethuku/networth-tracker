import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import { fetchGoals, fetchBudgetSummary } from "../../api";
import { gettingStarted } from "../../utils/gettingStarted";

const KEY = "nw_started_dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** A short checklist for new people. Disappears once complete, or when dismissed. */
export default function GettingStartedCard({ holdingCount, historyPoints, currency, householdId }) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const { data: goals } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });

  const result = useMemo(
    () =>
      gettingStarted({
        holdingCount,
        goalCount: (goals || []).length,
        budgetMonths: (summary?.months || []).length,
        historyPoints,
      }),
    [holdingCount, goals, summary, historyPoints],
  );

  // Wait for both answers so the card never flashes in for someone who has already done everything.
  if (dismissed || goals === undefined || summary === undefined || result.allDone) return null;

  const doneCount = result.steps.filter((s) => s.done).length;
  return (
    <Card title="Getting started" subtitle={`${doneCount} of ${result.steps.length} done`}>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {result.steps.map((s) => (
          <li
            key={s.id}
            style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: s.done ? "var(--text-secondary)" : "var(--text)" }}
          >
            <span aria-hidden="true">{s.done ? "✅" : "⬜"}</span>
            {s.done ? (
              <span style={{ textDecoration: "line-through" }}>{s.label}</span>
            ) : (
              <Link to={s.link} style={{ color: "var(--text)", textDecoration: "underline" }}>
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        style={{
          marginTop: "0.75rem",
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          textDecoration: "underline",
          cursor: "pointer",
          padding: 0,
        }}
      >
        Hide this
      </button>
    </Card>
  );
}
