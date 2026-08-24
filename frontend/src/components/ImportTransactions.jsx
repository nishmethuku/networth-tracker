import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { importParse, importConfirm, ApiError } from "../api";
import Card from "./Card";
import { useToast } from "../contexts/ToastContext";

const BROKERS = [
  { value: "zerodha", label: "Zerodha (India)" },
  { value: "groww", label: "Groww (India)" },
  { value: "fidelity", label: "Fidelity (US)" },
  { value: "robinhood", label: "Robinhood (US)" },
];

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

export default function ImportTransactions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [broker, setBroker] = useState("zerodha");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);
  const [included, setIncluded] = useState({});
  const toast = useToast();

  const parseMutation = useMutation({
    mutationFn: () => importParse(broker, csvText),
    onSuccess: (result) => {
      setPreview(result);
      const defaults = {};
      result.rows.forEach((r) => {
        if (!r.skipped) defaults[r.row] = true;
      });
      setIncluded(defaults);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to parse file");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const rows = preview.rows.filter((r) => !r.skipped && included[r.row]);
      return importConfirm(rows, null);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Imported! ${result.holdings_created} holdings, ${result.transactions_created} transactions.`);
      setTimeout(() => navigate("/portfolio"), 1500);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    },
  });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  }

  const includedCount = Object.values(included).filter(Boolean).length;
  const skippedRows = preview?.rows.filter((r) => r.skipped) || [];
  const validRows = preview?.rows.filter((r) => !r.skipped) || [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
        Import from a Broker Export
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        For a raw transaction file downloaded directly from one of the brokers below. Nothing is saved
        until you review and confirm.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          padding: "0.875rem 1.25rem",
          marginBottom: "2rem",
          background: "var(--primary-light)",
          border: "1px solid var(--primary)",
          borderRadius: "var(--radius)",
        }}
      >
        <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>
          Not from one of these brokers — just your own spreadsheet of stocks, accounts, whatever you track?
        </span>
        <Link
          to="/import-spreadsheet"
          style={{ fontWeight: 600, fontSize: "0.875rem", whiteSpace: "nowrap", color: "var(--primary)" }}
        >
          Use AI import instead →
        </Link>
      </div>

      <Card>
        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div>
            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>Broker</label>
            <select value={broker} onChange={(e) => { setBroker(e.target.value); setPreview(null); }} style={{ ...inputStyle, width: "100%" }}>
              {BROKERS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>CSV File</label>
            <input type="file" accept=".csv" onChange={handleFileChange} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>
        <button
          onClick={() => parseMutation.mutate()}
          disabled={!csvText || parseMutation.isPending}
          style={{ marginTop: "1.25rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}
        >
          {parseMutation.isPending ? "Parsing..." : fileName ? `Preview: ${fileName}` : "Choose a file first"}
        </button>
      </Card>

      {preview && (
        <div style={{ marginTop: "1.5rem" }}>
          {preview.errors.length > 0 && (
            <div style={{ padding: "1rem 1.25rem", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: "var(--radius)", color: "var(--danger)", marginBottom: "1.5rem" }}>
              {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {validRows.length > 0 && (
            <Card title={`Ready to import (${includedCount} of ${validRows.length} selected)`}>
              <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.5rem" }}></th>
                      <th style={{ padding: "0.5rem" }}>Symbol</th>
                      <th style={{ padding: "0.5rem" }}>Type</th>
                      <th style={{ padding: "0.5rem" }}>Date</th>
                      <th style={{ padding: "0.5rem" }}>Quantity</th>
                      <th style={{ padding: "0.5rem" }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((r) => (
                      <tr key={r.row} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            type="checkbox"
                            checked={!!included[r.row]}
                            onChange={(e) => setIncluded({ ...included, [r.row]: e.target.checked })}
                          />
                        </td>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>{r.symbol}</td>
                        <td style={{ padding: "0.5rem", textTransform: "capitalize", color: r.transaction_type === "buy" ? "var(--success)" : "var(--danger)" }}>
                          {r.transaction_type}
                        </td>
                        <td style={{ padding: "0.5rem" }}>{r.transaction_date}</td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>{r.quantity}</td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>{r.price_per_unit} {r.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={includedCount === 0 || confirmMutation.isPending}
                style={{ marginTop: "1.25rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}
              >
                {confirmMutation.isPending ? "Importing..." : `Import ${includedCount} Transaction${includedCount === 1 ? "" : "s"}`}
              </button>
            </Card>
          )}

          {skippedRows.length > 0 && (
            <Card title={`Skipped (${skippedRows.length})`}>
              <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {skippedRows.map((r) => (
                  <div key={r.row} style={{ padding: "0.35rem 0" }}>Row {r.row}: {r.reason}</div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
