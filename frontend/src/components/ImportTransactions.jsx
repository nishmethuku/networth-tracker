import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { importParse, importConfirm, fetchHouseholds, ApiError } from "../api";
import { useQuery } from "@tanstack/react-query";
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
  const [householdId, setHouseholdId] = useState("");
  const toast = useToast();

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds, staleTime: 1000 * 60 * 5 });

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
      return importConfirm(rows, householdId || null);
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
        Import Transactions
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Upload a transaction export from your broker. Nothing is saved until you review and confirm below.
      </p>

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
          {households && households.length > 0 && (
            <div>
              <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>Share with household</label>
              <select value={householdId} onChange={(e) => setHouseholdId(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                <option value="">Keep private</option>
                {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}
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
                        <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{r.quantity}</td>
                        <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{r.price_per_unit} {r.currency}</td>
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
