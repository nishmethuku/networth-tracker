import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import { bankStatementParse, bankStatementConfirm, fetchBudgetCategories, ApiError } from "../api";
import { getBudgetCategoryLabel, CURRENCIES } from "../constants/enums";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  width: "100%",
};

export default function ImportBankStatement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [currency, setCurrency] = useState("USD");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [included, setIncluded] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [notConfigured, setNotConfigured] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["budget-categories"], queryFn: fetchBudgetCategories, staleTime: Infinity });

  const parseMutation = useMutation({
    mutationFn: (file) => bankStatementParse(file, null),
    onSuccess: (result) => {
      if (!result.configured) {
        setNotConfigured(true);
        return;
      }
      setRows(result.rows.map((r, i) => ({ ...r, _key: i })));
      setWarnings(result.warnings || []);
      const defaults = {};
      result.rows.forEach((_, i) => {
        defaults[i] = true;
      });
      setIncluded(defaults);
      if (result.rows.length === 0) {
        toast.info("Didn't find any transactions in that file — try a different one or add entries manually.");
      }
    },
    onError: (err) => toast.error(err.message || "Failed to parse statement"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const selected = rows.filter((r) => included[r._key]).map(({ _key, ...r }) => r);
      return bankStatementConfirm(selected, null, currency);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-subscriptions"] });
      const errorCount = result.errors?.length || 0;
      toast.success(
        `Imported ${result.entries_created} entr${result.entries_created === 1 ? "y" : "ies"}${errorCount ? ` (${errorCount} row${errorCount === 1 ? "" : "s"} skipped)` : ""}`,
      );
      setTimeout(() => navigate("/budget"), 1200);
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
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Import Bank Statement</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Upload a bank or credit card statement (Excel, CSV, or PDF) — AI reads it and categorizes each transaction into your budget; nothing
        is saved until you review and confirm below.
      </p>

      <Card>
        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <label
              htmlFor="statement-file"
              style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}
            >
              Statement (.xlsx, .csv, or .pdf)
            </label>
            <input id="statement-file" type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={handleFileChange} style={inputStyle} />
          </div>
          <div>
            <label
              htmlFor="statement-currency"
              style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}
            >
              Currency
            </label>
            <select id="statement-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {fileName && (
          <p style={{ marginTop: "1rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {parseMutation.isPending ? `✨ Reading ${fileName}…` : `Last read: ${fileName}`}
          </p>
        )}
      </Card>

      {notConfigured && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            background: "var(--warning-light)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontSize: "0.875rem",
          }}
        >
          Statement import isn't set up yet — it needs a Gemini API key configured on the backend. Use <a href="/budget">the Budget page</a>{" "}
          to add entries manually in the meantime.
        </div>
      )}

      {warnings.length > 0 && (
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
          <strong style={{ color: "var(--text)" }}>Notes from the read:</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
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
                    <th style={{ padding: "0.5rem" }}>Date</th>
                    <th style={{ padding: "0.5rem" }}>Description</th>
                    <th style={{ padding: "0.5rem" }}>Type</th>
                    <th style={{ padding: "0.5rem" }}>Category</th>
                    <th style={{ padding: "0.5rem" }}>Amount</th>
                    <th style={{ padding: "0.5rem" }}>Recurring</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const entryType = r.direction === "credit" ? "income" : "expense";
                    const categoryOptions = entryType === "income" ? categories?.income || [] : categories?.expense || [];
                    return (
                      <tr key={r._key} style={{ borderBottom: "1px solid var(--border-light)", opacity: included[r._key] ? 1 : 0.5 }}>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            type="checkbox"
                            checked={!!included[r._key]}
                            onChange={(e) => setIncluded({ ...included, [r._key]: e.target.checked })}
                          />
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
                          <input
                            value={r.description || ""}
                            onChange={(e) => updateRow(r._key, "description", e.target.value)}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <select
                            value={r.direction}
                            onChange={(e) => {
                              const direction = e.target.value;
                              const nextType = direction === "credit" ? "income" : "expense";
                              const nextOptions = nextType === "income" ? categories?.income || [] : categories?.expense || [];
                              updateRow(r._key, "direction", direction);
                              updateRow(r._key, "category", nextOptions[0] || "");
                            }}
                            style={inputStyle}
                          >
                            <option value="debit">Expense</option>
                            <option value="credit">Income</option>
                          </select>
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <select value={r.category} onChange={(e) => updateRow(r._key, "category", e.target.value)} style={inputStyle}>
                            {categoryOptions.map((c) => (
                              <option key={c} value={c}>
                                {getBudgetCategoryLabel(c)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            type="number"
                            step="any"
                            value={r.amount ?? ""}
                            onChange={(e) => updateRow(r._key, "amount", e.target.value)}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!r.is_recurring_guess}
                            onChange={(e) => updateRow(r._key, "is_recurring_guess", e.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
              {confirmMutation.isPending ? "Importing..." : `Import ${includedCount} Entr${includedCount === 1 ? "y" : "ies"}`}
            </button>
          </Card>
        </div>
      )}

      {rows && rows.length === 0 && !notConfigured && (
        <div style={{ marginTop: "1.5rem" }}>
          <EmptyState message="Couldn't find any transactions in that file." />
        </div>
      )}
    </div>
  );
}
