import { useMemo, useState } from "react";
import Card from "../Card";
import InfoTip from "../InfoTip";
import EmptyState from "../EmptyState";
import { computeStress } from "../../utils/stressTest";
import { formatCurrencyCompact, formatPercent } from "../../utils/formatters";

const sliderRow = { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" };

function Scenario({ id, title, detail, dropPct, onChange, max, loss, lossPct, currency }) {
  return (
    <div style={{ padding: "0.9rem 0", borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <label htmlFor={id} style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
          {title}
        </label>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: loss > 0 ? "var(--danger)" : "var(--text-muted)" }}>
          {loss > 0 ? `-${formatCurrencyCompact(loss, currency)}` : formatCurrencyCompact(0, currency)}
          {loss > 0 && (
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>
              {" "}
              ({formatPercent(lossPct, 1)} of net worth)
            </span>
          )}
        </span>
      </div>
      <div style={{ ...sliderRow, marginTop: "0.4rem" }}>
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={5}
          value={dropPct}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: "1 1 160px", accentColor: "var(--primary)" }}
        />
        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", minWidth: "3.5rem" }}>−{dropPct}%</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{detail}</div>
    </div>
  );
}

/**
 * "What would a bad day cost me?" -- three one-factor shocks over the
 * holdings the dashboard already loaded. Informational, not a forecast.
 */
export default function StressTestCard({ holdings, totalNetWorth, currency }) {
  const [topDrop, setTopDrop] = useState(30);
  const [marketDrop, setMarketDrop] = useState(20);
  const [fxDrop, setFxDrop] = useState(10);

  const result = useMemo(
    () =>
      computeStress({
        holdings: holdings || [],
        displayCurrency: currency,
        totalNetWorth: Number(totalNetWorth) || 0,
        topHoldingDropPct: topDrop,
        marketDropPct: marketDrop,
        fxDropPct: fxDrop,
      }),
    [holdings, currency, totalNetWorth, topDrop, marketDrop, fxDrop],
  );

  if (!result.topHolding) {
    return (
      <Card title="Stress test">
        <EmptyState message="Add a holding to see how a bad market day would affect your net worth." />
      </Card>
    );
  }

  return (
    <Card
      title={
        <>
          Stress test
          <InfoTip term="stressTest" />
        </>
      }
      subtitle="Drag a slider to see what a sharp drop would cost you"
    >
      <Scenario
        id="stress-top"
        title={`${result.topHolding.label} drops`}
        detail={`Your largest holding, ${formatPercent(result.topHolding.sharePct, 0)} of your assets.`}
        dropPct={topDrop}
        onChange={setTopDrop}
        max={90}
        loss={result.topHoldingLoss}
        lossPct={result.topHoldingLossPct}
        currency={currency}
      />
      <Scenario
        id="stress-market"
        title="Stock market falls"
        detail={`Applies to ${formatCurrencyCompact(result.marketExposure, currency)} in stocks, funds and crypto.`}
        dropPct={marketDrop}
        onChange={setMarketDrop}
        max={70}
        loss={result.marketLoss}
        lossPct={result.marketLossPct}
        currency={currency}
      />
      <Scenario
        id="stress-fx"
        title={`Other currencies weaken against ${currency}`}
        detail={`Applies to ${formatCurrencyCompact(result.foreignExposure, currency)} held outside ${currency}.`}
        dropPct={fxDrop}
        onChange={setFxDrop}
        max={40}
        loss={result.foreignLoss}
        lossPct={result.foreignLossPct}
        currency={currency}
      />
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.9rem" }}>
        Each scenario is separate and simple (one factor at a time) — a way to see how exposed you are, not a prediction.
      </p>
    </Card>
  );
}
