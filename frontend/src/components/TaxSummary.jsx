import { useQuery } from "@tanstack/react-query";
import { fetchTaxSummary, ApiError } from "../api";
import { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { formatCurrencyForDisplay, formatPercent, currencyForCountry, safeNumber } from "../utils/formatters";

function TaxByYearChart({ rows }) {
  const data = [...rows]
    .sort((a, b) => a.financialYear.localeCompare(b.financialYear))
    .map((r) => ({
      label: `${r.financialYear} (${r.country})`,
      shortTermGain: r.shortTermGain,
      longTermGain: r.longTermGain,
      totalGain: r.realizedGain,
      currency: currencyForCountry(r.country),
    }));

  return (
    <div style={{ width: "100%", height: 260, marginBottom: "1.5rem" }}>
      <ResponsiveContainer>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
          <Tooltip
            formatter={(v, name, props) => [
              formatCurrencyForDisplay(v, props.payload.currency),
              name === "shortTermGain" ? "Short-term" : name === "longTermGain" ? "Long-term" : "Total (YoY trend)",
            ]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Legend formatter={(v) => (v === "shortTermGain" ? "Short-term" : v === "longTermGain" ? "Long-term" : "Total trend")} wrapperStyle={{ fontSize: "0.75rem" }} />
          <Bar dataKey="shortTermGain" stackId="gain" fill="var(--accent)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="longTermGain" stackId="gain" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="totalGain" stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Year-over-year % change per country, comparing each row to the previous
 * (chronologically earlier) row for that same country — not necessarily the
 * immediately preceding calendar year, if a year had no sales. */
export function computeYoyChanges(rows) {
  const byCountry = {};
  for (const r of rows) {
    (byCountry[r.country] = byCountry[r.country] || []).push(r);
  }
  const changes = {};
  for (const countryRows of Object.values(byCountry)) {
    const sorted = [...countryRows].sort((a, b) => a.financialYear.localeCompare(b.financialYear));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const key = `${curr.financialYear}-${curr.country}`;
      if (prev.realizedGain !== 0) {
        changes[key] = { pct: ((curr.realizedGain - prev.realizedGain) / Math.abs(prev.realizedGain)) * 100, vsLabel: prev.financialYear };
      }
    }
  }
  return changes;
}

export default function TaxSummary() {
  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tax-summary"],
    queryFn: () => fetchTaxSummary(null),
  });

  const yoyChanges = useMemo(() => (summary ? computeYoyChanges(summary.rows) : {}), [summary]);

  if (isLoading) return <LoadingState message="Computing realized gains..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load tax summary"} onRetry={refetch} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Tax Summary</h1>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Realized gains from sales, grouped by financial year — India runs Apr–Mar, everywhere else runs Jan–Dec.
      </p>

      {!summary || summary.rows.length === 0 ? (
        <EmptyState message="No sales recorded yet — realized gains show up here once you sell something." />
      ) : (
        <>
          {summary.rows.length > 1 && (
            <Card title="Short-term vs Long-term by Year">
              <TaxByYearChart rows={summary.rows} />
            </Card>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: summary.rows.length > 1 ? "1.5rem" : 0 }}>
            {summary.rows.map((row) => {
              const currency = currencyForCountry(row.country);
              const positive = row.realizedGain >= 0;
              const yoy = yoyChanges[`${row.financialYear}-${row.country}`];
              return (
                <Card
                  key={`${row.financialYear}-${row.country}`}
                  title={
                    <span style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      {`${row.financialYear} — ${row.country}`}
                      {yoy && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.1rem 0.5rem",
                            borderRadius: "999px",
                            color: yoy.pct >= 0 ? "var(--success)" : "var(--danger)",
                            background: yoy.pct >= 0 ? "var(--success-light)" : "var(--danger-light)",
                          }}
                          title={`vs ${yoy.vsLabel}`}
                        >
                          {yoy.pct >= 0 ? "+" : ""}{formatPercent(yoy.pct)} YoY
                        </span>
                      )}
                    </span>
                  }
                >
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: positive ? "var(--success)" : "var(--danger)", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
                    {positive ? "+" : ""}{formatCurrencyForDisplay(row.realizedGain, currency)}
                  </div>

                  <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Short-term</div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: row.shortTermGain >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {row.shortTermGain >= 0 ? "+" : ""}{formatCurrencyForDisplay(row.shortTermGain, currency)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Long-term</div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: row.longTermGain >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {row.longTermGain >= 0 ? "+" : ""}{formatCurrencyForDisplay(row.longTermGain, currency)}
                      </div>
                    </div>
                    {row.taxEstimate && (
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Est. tax liability</div>
                        <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>
                          {formatCurrencyForDisplay(row.taxEstimate.totalTax, currency)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {row.byHolding.map((h) => (
                      <div key={h.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        <span>{h.name}</span>
                        <span style={{ color: safeNumber(h.realizedGain) >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {safeNumber(h.realizedGain) >= 0 ? "+" : ""}{formatCurrencyForDisplay(h.realizedGain, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
          {summary.disclaimer && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1.5rem" }}>{summary.disclaimer}</p>
          )}
        </>
      )}
    </div>
  );
}
