import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import { simpleCsvParse, smartImportConfirm, ApiError } from "../api";
import { ASSET_TYPE_OPTIONS, CURRENCIES } from "../constants/enums";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  width: "100%",
};

export default function ImportCsv() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [included, setIncluded] = useState({});
  const [errors, setErrors] = useState([]);

  const parseMutation = useMutation({
    mutationFn: (file) => simpleCsvParse(file),
    onSuccess: (result) => {
      setRows(result.rows.map((r, i) => ({ ...r, _key: i })));
      setErrors(result.errors || []);
      const defaults = {};
      result.rows.forEach((_, i) => {
        defaults[i] = true;
      });
      setIncluded(defaults);
      if (result.rows.length === 0 && (!result.errors || result.errors.length === 0)) {
        toast.info("Didn't find any transactions in that file.");
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to parse file"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const selected = rows.filter((r) => included[r._key]).map(({ _key, ...r }) => r);
      return smartImportConfirm(selected, null);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const errorCount = result.errors?.length || 0;
      const txCount = result.transactions_added || 0;
      toast.success(
        `Imported ${txCount} transaction${txCount === 1 ? "" : "s"} into ${result.holdings_created} holding${result.holdings_created === 1 ? "" : "s"}${errorCount ? ` (${errorCount} row${errorCount === 1 ? "" : "s"} skipped)` : ""}`,
      );
      (result.warnings || []).forEach((w) => toast.info(w, 8000));
      setTimeout(() => navigate("/portfolio"), 1200);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed"),
  });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows(null);
    setErrors([]);
    parseMutation.mutate(file);
  }

  function updateRow(key, field, value) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
  }

  const includedCount = Object.values(included).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 1250, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Import from CSV</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        One transaction per row — no broker to pick, nothing saved until you review and confirm below.
      </p>

      <div
        style={{
          marginBottom: "2rem",
          padding: "1rem 1.25rem",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Expected columns</strong> (any order; a few common alternate names work too):
        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
            <thead>
              <tr>
                {[
                  "Holding Type",
                  "Holding Account",
                  "Source",
                  "Investment",
                  "Transaction",
                  "Transaction Date",
                  "Transaction Units",
                  "Transaction price",
                  "Currency",
                  "Country",
                ].map((h) => (
                  <th key={h} style={{ padding: "0.25rem 0.6rem", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["Stocks", "Amma", "Amma-Bank1", "AJANTPHARM", "Buy", "7/8/2020", "45", "948.89", "INR", "India"].map((v, i) => (
                  <td key={i} style={{ padding: "0.25rem 0.6rem" }}>
                    {v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Holding Type</strong> — Stocks, Mutual Fund, Precious Metals, Real Estate, Cash, Fixed
            Deposit, PPF, EPF, Retirals, Loan, Credit, or Crypto. Left blank, defaults to Stocks.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Source</strong> — the cash account tied to the transaction (a bank/cash account). For a
            Buy, the cost is deducted from it; for a Sell, the proceeds are deposited into it. Leave blank if you don't want to track that;
            if it's filled in and doesn't already exist as a cash holding, it's created automatically.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Holding Account</strong> — where the position lives (a brokerage, a person's name,
            whatever you use). Created automatically if it doesn't already exist.
          </li>
          <li>Dates are read day-first (7/8/2020 = 7 Aug 2020).</li>
        </ul>
      </div>

      <Card>
        <div>
          <label
            htmlFor="csv-file"
            style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}
          >
            CSV File
          </label>
          <input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} style={inputStyle} />
        </div>
        {fileName && (
          <p style={{ marginTop: "1rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {parseMutation.isPending ? `Reading ${fileName}…` : `Last read: ${fileName}`}
          </p>
        )}
      </Card>

      {errors.length > 0 && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            background: "var(--danger-light)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            color: "var(--danger)",
            fontSize: "0.8125rem",
          }}
        >
          <strong>Rows skipped:</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <Card title={`Review before importing (${includedCount} of ${rows.length} selected)`}>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 1150 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.5rem" }}></th>
                    <th style={{ padding: "0.5rem" }}>Type</th>
                    <th style={{ padding: "0.5rem" }}>Name</th>
                    <th style={{ padding: "0.5rem" }}>Symbol</th>
                    <th style={{ padding: "0.5rem" }}>Account</th>
                    <th style={{ padding: "0.5rem" }}>Date</th>
                    <th style={{ padding: "0.5rem" }}>Buy/Sell</th>
                    <th style={{ padding: "0.5rem" }}>Qty</th>
                    <th style={{ padding: "0.5rem" }}>Price</th>
                    <th style={{ padding: "0.5rem" }}>Cash account</th>
                    <th style={{ padding: "0.5rem" }}>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._key} style={{ borderBottom: "1px solid var(--border-light)", opacity: included[r._key] ? 1 : 0.5 }}>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={!!included[r._key]}
                          onChange={(e) => setIncluded({ ...included, [r._key]: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select value={r.asset_type} onChange={(e) => updateRow(r._key, "asset_type", e.target.value)} style={inputStyle}>
                          {ASSET_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input value={r.name || ""} onChange={(e) => updateRow(r._key, "name", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          value={r.symbol || ""}
                          onChange={(e) => updateRow(r._key, "symbol", e.target.value)}
                          style={inputStyle}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input value={r.account || ""} onChange={(e) => updateRow(r._key, "account", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input
                          type="date"
                          value={r.date || ""}
                          onChange={(e) => updateRow(r._key, "date", e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select
                          value={r.transaction_type}
                          onChange={(e) => updateRow(r._key, "transaction_type", e.target.value)}
                          style={inputStyle}
                        >
                          <option value="buy">Buy</option>
                          <option value="sell">Sell</option>
                        </select>
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
                        {r.transaction_type === "buy" || r.transaction_type === "sell" ? (
                          <input
                            value={r.source_account || ""}
                            onChange={(e) => updateRow(r._key, "source_account", e.target.value)}
                            placeholder="—"
                            style={inputStyle}
                            title={
                              r.transaction_type === "buy"
                                ? "The cost is deducted from this cash account. Matched by name against your existing cash holdings, or created automatically if it doesn't exist yet."
                                : "The proceeds are deposited into this cash account. Matched by name against your existing cash holdings, or created automatically if it doesn't exist yet."
                            }
                          />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select
                          value={r.currency || "USD"}
                          onChange={(e) => updateRow(r._key, "currency", e.target.value)}
                          style={inputStyle}
                        >
                          {CURRENCIES.map((c) => (
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
              Rows for the same symbol + account merge into one holding with a transaction per row. A blank "Cash account" just skips the
              money movement; a filled-in one that doesn't already exist as a cash holding gets created automatically. For a Buy, the cost
              is deducted from that account; for a Sell, the proceeds are deposited into it.
            </p>

            <button
              onClick={() => confirmMutation.mutate()}
              disabled={includedCount === 0 || confirmMutation.isPending}
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                cursor: includedCount === 0 ? "default" : "pointer",
                fontWeight: 600,
                opacity: includedCount === 0 || confirmMutation.isPending ? 0.6 : 1,
              }}
            >
              {confirmMutation.isPending ? "Importing..." : `Import ${includedCount} Transaction${includedCount === 1 ? "" : "s"}`}
            </button>
          </Card>
        </div>
      )}

      {rows && rows.length === 0 && errors.length === 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <EmptyState message="Couldn't find any transactions in that file." />
        </div>
      )}
    </div>
  );
}
