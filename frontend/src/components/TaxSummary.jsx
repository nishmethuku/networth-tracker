import { useQuery } from "@tanstack/react-query";
import { fetchTaxSummary, fetchHouseholds, ApiError } from "../api";
import { useState } from "react";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { formatCurrencyForDisplay, currencyForCountry, safeNumber } from "../utils/formatters";

export default function TaxSummary() {
  const [householdId, setHouseholdId] = useState("");
  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds });

  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tax-summary", householdId],
    queryFn: () => fetchTaxSummary(householdId || null),
  });

  if (isLoading) return <LoadingState message="Computing realized gains..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load tax summary"} onRetry={refetch} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Tax Summary</h1>
        {households && households.length > 0 && (
          <select
            value={householdId}
            onChange={(e) => setHouseholdId(e.target.value)}
            style={{ padding: "0.5rem 0.875rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "0.875rem" }}
          >
            <option value="">Just me</option>
            {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Realized gains from sales, grouped by financial year — India runs Apr–Mar, everywhere else runs Jan–Dec.
      </p>

      {!summary || summary.length === 0 ? (
        <EmptyState message="No sales recorded yet — realized gains show up here once you sell something." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {summary.map((row) => {
            const currency = currencyForCountry(row.country);
            const positive = row.realizedGain >= 0;
            return (
              <Card key={`${row.financialYear}-${row.country}`} title={`${row.financialYear} — ${row.country}`}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: positive ? "var(--success)" : "var(--danger)", marginTop: "0.5rem", marginBottom: "1rem" }}>
                  {positive ? "+" : ""}{formatCurrencyForDisplay(row.realizedGain, currency)}
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
      )}
    </div>
  );
}
