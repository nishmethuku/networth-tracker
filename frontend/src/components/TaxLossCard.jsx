import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchHoldings } from "../api";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { findLossCandidates } from "../utils/taxLossHarvest";
import { formatCurrencyForDisplay, formatPercent } from "../utils/formatters";

/**
 * Holdings currently sitting on an unrealized loss. Selling a loser realizes
 * the loss, which in many tax systems can offset realized gains -- but the
 * rules (holding periods, wash sales, set-off limits) differ by country, so
 * this only lists candidates and never says what to do.
 */
export default function TaxLossCard() {
  const currency = getDefaultDisplayCurrency();
  const { currentHouseholdId } = useHousehold();
  const { data: holdings } = useQuery({
    queryKey: ["holdings", "summary", currency, currentHouseholdId],
    queryFn: () => fetchHoldings({ currency, summary: true, householdId: currentHouseholdId }),
    staleTime: 1000 * 30,
  });

  const candidates = useMemo(() => findLossCandidates(holdings || []), [holdings]);
  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, c) => sum + c.unrealizedLoss, 0);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <Card
        title="Positions with unrealized losses"
        subtitle={`${formatCurrencyForDisplay(total, currency)} in losses you have not realized yet`}
      >
        <div style={{ marginTop: "0.5rem" }}>
          {candidates.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                padding: "0.6rem 0",
                borderBottom: "1px solid var(--border-light)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {c.name} <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8125rem" }}>· {c.country}</span>
              </span>
              <span style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
                -{formatCurrencyForDisplay(c.unrealizedLoss, currency)}
                {c.lossPct != null && <span style={{ color: "var(--text-muted)" }}> ({formatPercent(c.lossPct, 1)})</span>}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          Selling at a loss can sometimes offset taxable gains, but the rules differ by country (holding periods, wash-sale and set-off
          limits). This is information only, not tax advice — check with a tax professional before selling.
        </p>
      </Card>
    </div>
  );
}
