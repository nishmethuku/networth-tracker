import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import { useToast } from "../contexts/ToastContext";
import { brokerImportParse, smartImportConfirm, ApiError } from "../api";
import { COUNTRIES, CURRENCIES } from "../constants/enums";
import { sortAz } from "../utils/sortAz";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  width: "100%",
};

const labelStyle = { fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" };

const BROKER_STEPS = [
  { name: "Zerodha Console", how: "Console, Portfolio, Holdings, Download (CSV or Excel)." },
  { name: "Zerodha Kite", how: "Kite, Holdings, Download icon." },
  { name: "Groww", how: "Profile, Reports, Stocks holdings statement." },
  { name: "Fidelity", how: "Positions, Download (the CSV)." },
  { name: "Interactive Brokers", how: "Performance and Reports, Statements, Activity statement as CSV, or Portfolio, Download." },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ImportBroker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [account, setAccount] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [currency, setCurrency] = useState("USD");
  const [country, setCountry] = useState("United States");
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState(null);
  const [included, setIncluded] = useState({});

  const parseMutation = useMutation({
    mutationFn: () => brokerImportParse(file, { account: account.trim(), asOf, currency, country }),
    onSuccess: (data) => {
      setResult(data);
      setRows(data.rows.map((r, i) => ({ ...r, _key: i })));
      const defaults = {};
      data.rows.forEach((r, i) => {
        defaults[i] = !r.already_in_account;
      });
      setIncluded(defaults);
      if (data.rows.length === 0) toast.info("Found the file but no holdings in it.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not read that file"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const selected = rows.filter((r) => included[r._key]).map(({ _key, already_in_account: _dup, ...r }) => r);
      return smartImportConfirm(selected, null);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const skipped = data.errors?.length || 0;
      toast.success(
        `Imported ${data.holdings_created} new holding${data.holdings_created === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}`,
      );
      (data.warnings || []).forEach((w) => toast.info(w, 8000));
      setTimeout(() => navigate("/portfolio"), 1200);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed"),
  });

  function updateRow(key, field, value) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
  }

  const includedCount = Object.values(included).filter(Boolean).length;
  const canRead = !!file && account.trim().length > 0 && !parseMutation.isPending;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Import from your broker</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Download your holdings from your broker and upload the file here. Every stock is filled in for you, so you never type them by hand.
        Nothing is saved until you review the list and confirm.
      </p>

      <Card title="Where to find the file">
        <ul
          style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}
        >
          {BROKER_STEPS.map((b) => (
            <li key={b.name}>
              <strong style={{ color: "var(--text)" }}>{b.name}:</strong> {b.how}
            </li>
          ))}
          <li>Another broker: any CSV or Excel with a symbol, a quantity and an average cost column also works.</li>
        </ul>
      </Card>

      <div style={{ marginTop: "1.25rem" }}>
        <Card>
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <div>
              <label htmlFor="broker-file" style={labelStyle}>
                Holdings file (.csv or .xlsx)
              </label>
              <input
                id="broker-file"
                type="file"
                accept=".csv,.xlsx"
                style={inputStyle}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                  setRows(null);
                }}
              />
            </div>
            <div>
              <label htmlFor="broker-account" style={labelStyle}>
                Account name
              </label>
              <input
                id="broker-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="e.g. Zerodha or Fidelity"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="broker-date" style={labelStyle}>
                Holdings as of
              </label>
              <input id="broker-date" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="broker-currency" style={labelStyle}>
                Currency (only if the file has none)
              </label>
              <select id="broker-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                {sortAz(CURRENCIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="broker-country" style={labelStyle}>
                Country (only if the file has none)
              </label>
              <select id="broker-country" value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => parseMutation.mutate()}
            disabled={!canRead}
            style={{
              marginTop: "1.25rem",
              padding: "0.65rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              fontWeight: 600,
              cursor: canRead ? "pointer" : "default",
              opacity: canRead ? 1 : 0.6,
            }}
          >
            {parseMutation.isPending ? "Reading…" : "Read file"}
          </button>
        </Card>
      </div>

      {result && result.warnings.length > 0 && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: "var(--text)" }}>Notes from the read ({result.broker_label}):</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <Card title={`Review before importing (${includedCount} of ${rows.length} selected)`}>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 820 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.5rem" }}></th>
                    <th style={{ padding: "0.5rem" }}>Symbol</th>
                    <th style={{ padding: "0.5rem" }}>Name</th>
                    <th style={{ padding: "0.5rem" }}>Quantity</th>
                    <th style={{ padding: "0.5rem" }}>Avg cost</th>
                    <th style={{ padding: "0.5rem" }}>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._key} style={{ borderBottom: "1px solid var(--border-light)", opacity: included[r._key] ? 1 : 0.5 }}>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          type="checkbox"
                          aria-label={`Include ${r.symbol || r.name}`}
                          checked={!!included[r._key]}
                          onChange={(e) => setIncluded({ ...included, [r._key]: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          value={r.symbol || ""}
                          onChange={(e) => updateRow(r._key, "symbol", e.target.value.toUpperCase())}
                          placeholder="Ticker"
                          style={inputStyle}
                        />
                        {r.already_in_account && (
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Already in this account</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input value={r.name || ""} onChange={(e) => updateRow(r._key, "name", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          type="number"
                          step="any"
                          value={r.quantity ?? ""}
                          onChange={(e) => updateRow(r._key, "quantity", e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          type="number"
                          step="any"
                          value={r.price_per_unit ?? ""}
                          onChange={(e) => updateRow(r._key, "price_per_unit", e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select value={r.currency} onChange={(e) => updateRow(r._key, "currency", e.target.value)} style={inputStyle}>
                          {sortAz(CURRENCIES).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Each stock is added as one purchase at your average cost, dated {asOf}. If you already track a stock in this account, leave it
              unticked so the quantity is not counted twice.
            </p>
            <button
              type="button"
              onClick={() => confirmMutation.mutate()}
              disabled={includedCount === 0 || confirmMutation.isPending}
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                fontWeight: 600,
                cursor: includedCount === 0 ? "default" : "pointer",
                opacity: includedCount === 0 || confirmMutation.isPending ? 0.6 : 1,
              }}
            >
              {confirmMutation.isPending ? "Importing…" : `Import ${includedCount} holding${includedCount === 1 ? "" : "s"}`}
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}
