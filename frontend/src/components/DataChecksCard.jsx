import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "./Card";
import { fetchHoldings } from "../api";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { dataChecks } from "../utils/dataChecks";
import { readLastBackup } from "../utils/backupReminder";
import { formatDateISO } from "../utils/formatters";

/** Settings: a quick health check of the holdings list. */
export default function DataChecksCard() {
  const currency = getDefaultDisplayCurrency();
  const { data: holdings, isLoading } = useQuery({
    queryKey: ["holdings", "summary", currency, null],
    queryFn: () => fetchHoldings({ currency, summary: true }),
  });

  const issues = useMemo(
    () =>
      dataChecks(
        (holdings || []).map((h) => ({
          id: h.id,
          label: h.symbol || h.name || "A holding",
          assetType: h.assetType,
          account: h.account || "",
          value: h.displayValue || 0,
          country: h.country || "",
        })),
      ),
    [holdings],
  );

  const lastBackup = readLastBackup();

  if (isLoading) return null;

  return (
    <Card title="Data checks" subtitle="A quick look for things that may be off in your holdings">
      {issues.length === 0 ? (
        <p style={{ margin: "0.75rem 0 0", color: "var(--text-secondary)" }}>Everything looks fine. ✅</p>
      ) : (
        <ul
          style={{
            margin: "0.75rem 0 0",
            paddingLeft: "1.25rem",
            color: "var(--text)",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {issues.map((i) => (
            <li key={i.id}>
              {i.message}{" "}
              <Link to="/portfolio" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: "0.75rem 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
        Last backup from this browser: {lastBackup ? formatDateISO(lastBackup) : "none yet"}.
      </p>
    </Card>
  );
}
