import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import { fetchSubscriptions } from "../../api";
import { upcomingBills } from "../../utils/upcomingBills";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";

function when(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** Recurring bills and subscriptions due in the next two weeks. Hidden when there are none. */
export default function ComingUpCard({ currency, householdId }) {
  const { data } = useQuery({
    queryKey: ["budget-subscriptions", currency, householdId],
    queryFn: () => fetchSubscriptions({ currency, householdId }),
  });
  const bills = useMemo(() => upcomingBills(data?.items, todayISO(), 14), [data]);
  if (bills.length === 0) return null;

  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <Card title="Coming up" subtitle={`${bills.length} recurring ${bills.length === 1 ? "payment" : "payments"} in the next 2 weeks`}>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
        {bills.slice(0, 6).map((b, i) => (
          <li
            key={`${b.category}-${b.description}-${i}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.4rem 0",
              borderBottom: "1px solid var(--border-light)",
              color: "var(--text)",
              fontSize: "0.9375rem",
            }}
          >
            <span>
              {b.description || b.category}{" "}
              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>· {when(b.daysAway)}</span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {formatCurrencyForDisplay(b.amount, currency, { alwaysCents: true })}
            </span>
          </li>
        ))}
      </ul>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
        About {formatCurrencyForDisplay(total, currency, { includeCode: false })} in total.{" "}
        <Link to="/budget" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
          Open budget
        </Link>
      </p>
    </Card>
  );
}
