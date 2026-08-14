import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import { smartImportParse, smartImportConfirm, fetchHouseholds, ApiError } from "../api";
import { ASSET_TYPE_OPTIONS, COUNTRIES, CURRENCIES, isQuantityBased } from "../constants/enums";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  width: "100%",
};

export default function ImportSpreadsheet() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [householdId, setHouseholdId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [included, setIncluded] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [notConfigured, setNotConfigured] = useState(false);

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds, staleTime: 1000 * 60 * 5 });

  const parseMutation = useMutation({
    mutationFn: (file) => smartImportParse(file, householdId || null),
    onSuccess: (result) => {
      if (!result.configured) {
        setNotConfigured(true);
        return;
      }
      setRows(result.rows.map((r, i) => ({ ...r, _key: i })));
      setWarnings(result.warnings || []);
      const defaults = {};
      result.rows.forEach((_, i) => { defaults[i] = true; });
      setIncluded(defaults);
      if (result.rows.length === 0) {
        toast.info("Didn't find any holdings in that file — try a different one or add manually.");
      }
    },
    onError: (err) => toast.error(err.message || "Failed to parse file"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const selected = rows.filter((r) => included[r._key]).map(({ _key, source_note, ...r }) => r);
      return smartImportConfirm(selected, householdId || null);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const errorCount = result.errors?.length || 0;
      toast.success(`Imported ${result.holdings_created} holding${result.holdings_created === 1 ? "" : "s"}${errorCount ? ` (${errorCount} row${errorCount === 1 ? "" : "s"} skipped)` : ""}`);
      setTimeout(() => navigate("/portfolio"), 1200);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed"),
  });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows(null);
    setWarnings([]);
    setNotConfigured(false);
    parseMutation.mutate(file);
  }

  function updateRow(key, field, value) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
  }

  const includedCount = Object.values(included).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
        Import from Spreadsheet
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Upload your own Excel or CSV file — whatever layout you already use. AI reads it and maps each row to a
        holding; nothing is saved until you review and confirm below.
      </p>

      <Card>
        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>File (.xlsx or .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={inputStyle} />
          </div>
          {households && households.length > 0 && (
            <div>
              <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>Share with household</label>
              <select value={householdId} onChange={(e) => setHouseholdId(e.target.value)} style={inputStyle}>
                <option value="">Keep private</option>
                {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {fileName && (
          <p style={{ marginTop: "1rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {parseMutation.isPending ? `✨ Reading ${fileName}…` : `Last read: ${fileName}`}
          </p>
        )}
      </Card>

      {notConfigured && (
        <div style={{ marginTop: "1.5rem", padding: "1rem 1.25rem", background: "var(--warning-light)", border: "1px solid var(--warning)", borderRadius: "var(--radius)", color: "var(--text)", fontSize: "0.875rem" }}>
          Spreadsheet import isn't set up yet — it needs an Anthropic API key configured on the backend. Use{" "}
          <a href="/add-holding">Add Holding</a> to enter things manually in the meantime.
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: "1.5rem", padding: "1rem 1.25rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text)" }}>Notes from the read:</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <Card title={`Review before importing (${includedCount} of ${rows.length} selected)`}>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 900 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.5rem" }}></th>
                    <th style={{ padding: "0.5rem" }}>Type</th>
                    <th style={{ padding: "0.5rem" }}>Name</th>
                    <th style={{ padding: "0.5rem" }}>Symbol</th>
                    <th style={{ padding: "0.5rem" }}>Value</th>
                    <th style={{ padding: "0.5rem" }}>Currency</th>
                    <th style={{ padding: "0.5rem" }}>Country</th>
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
                          {ASSET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input value={r.name || ""} onChange={(e) => updateRow(r._key, "name", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {isQuantityBased(r.asset_type) ? (
                          <input value={r.symbol || ""} onChange={(e) => updateRow(r._key, "symbol", e.target.value)} style={inputStyle} placeholder="e.g., AAPL" />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <input type="number" step="any" value={r.value ?? ""} onChange={(e) => updateRow(r._key, "value", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select value={r.currency || "USD"} onChange={(e) => updateRow(r._key, "currency", e.target.value)} style={inputStyle}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <select value={r.country || "United States"} onChange={(e) => updateRow(r._key, "country", e.target.value)} style={inputStyle}>
                          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Each row becomes a holding with its current value — you can add proper buy/sell history for
              stocks and funds afterward from the holding's page if you want exact cost basis and returns.
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
              {confirmMutation.isPending ? "Importing..." : `Import ${includedCount} Holding${includedCount === 1 ? "" : "s"}`}
            </button>
          </Card>
        </div>
      )}

      {rows && rows.length === 0 && !notConfigured && (
        <div style={{ marginTop: "1.5rem" }}>
          <EmptyState message="Couldn't find any holdings in that file." />
        </div>
      )}
    </div>
  );
}
