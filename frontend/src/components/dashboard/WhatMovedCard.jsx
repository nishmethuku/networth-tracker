import { useMemo } from "react";
import Card from "../Card";
import { driversOfChange } from "../../utils/driversOfChange";
import { getAssetTypeLabel } from "../../constants/enums";
import { formatCurrencyCompact, todayISO } from "../../utils/formatters";

/** What moved your net worth over the last 30 days, by asset type and debt. */
export default function WhatMovedCard({ history, currency }) {
  const result = useMemo(() => driversOfChange(history, 30, todayISO()), [history]);
  if (!result) return null;

  const max = Math.max(...result.drivers.map((d) => Math.abs(d.delta)));
  return (
    <Card title="What moved your net worth" subtitle="Change by category over the last 30 days">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
        {result.drivers.slice(0, 6).map((d) => {
          const up = d.delta >= 0;
          return (
            <div key={d.key}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--text)" }}>
                <span>{d.key === "liabilities" ? "Debt" : getAssetTypeLabel(d.key)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: up ? "var(--success)" : "var(--danger)" }}>
                  {up ? "+" : "−"}
                  {formatCurrencyCompact(Math.abs(d.delta), currency)}
                </span>
              </div>
              <div aria-hidden="true" style={{ height: 6, background: "var(--bg-secondary)", borderRadius: 3, marginTop: 4 }}>
                <div
                  style={{
                    width: `${(Math.abs(d.delta) / max) * 100}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: up ? "var(--success)" : "var(--danger)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
        Includes both market moves and money you added or took out.
      </p>
    </Card>
  );
}
