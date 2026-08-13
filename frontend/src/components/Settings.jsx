import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Card from "./Card";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import useDisplayCurrencyPreference from "../hooks/useDisplayCurrencyPreference";
import { fetchAccountExport, deleteAllAccountData, ApiError } from "../api";
import { CURRENCIES } from "../constants/enums";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n";

const sectionStyle = { marginBottom: "1.5rem" };
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid var(--border-light)" };
const buttonStyle = { padding: "0.5rem 1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500 };

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [currency, setCurrency] = useDisplayCurrencyPreference();
  const toast = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);

  const exportMutation = useMutation({
    mutationFn: fetchAccountExport,
    onSuccess: (data) => {
      downloadJson(data, `networth-tracker-export-${new Date().toISOString().split("T")[0]}.json`);
      toast.success("Export downloaded");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Export failed"),
    onSettled: () => setExporting(false),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAllAccountData,
    onSuccess: (result) => {
      toast.success(`Deleted ${result.holdings_deleted} holdings and related data`);
      setConfirmText("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "1.5rem" }}>{t("settings.title")}</h1>

      <div style={sectionStyle}>
        <Card title={t("settings.profile")}>
          <div style={rowStyle}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Email</span>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{user?.email}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Session</span>
            <button onClick={signOut} style={buttonStyle}>{t("nav.signOut")}</button>
          </div>
        </Card>
      </div>

      <div style={sectionStyle}>
        <Card title="Household">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
            Manage shared households, invites, and member roles.
          </p>
          <Link to="/households" style={buttonStyle}>Go to Household →</Link>
        </Card>
      </div>

      <div style={sectionStyle}>
        <Card title={t("settings.display")}>
          <div style={rowStyle}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("settings.theme")}</span>
            <button onClick={toggleTheme} style={buttonStyle}>{theme === "dark" ? "🌙 Dark" : "☀️ Light"}</button>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("settings.language")}</span>
            <select
              value={i18n.language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ padding: "0.4rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "0.875rem" }}
            >
              {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("settings.defaultCurrency")}</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ padding: "0.4rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "0.875rem" }}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Card>
      </div>

      <div style={sectionStyle}>
        <Card title="Notifications">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
            Price and net worth alerts are managed on the Alerts page. Weekly digest emails include an unsubscribe link at the bottom.
          </p>
          <Link to="/alerts" style={buttonStyle}>Go to Alerts →</Link>
        </Card>
      </div>

      <div style={sectionStyle}>
        <Card title="Data export">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
            Download everything you own — holdings, transactions, valuations, and alerts — as a JSON file.
          </p>
          <button
            onClick={() => { setExporting(true); exportMutation.mutate(); }}
            disabled={exporting}
            style={{ ...buttonStyle, opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? "Exporting…" : "Export my data"}
          </button>
        </Card>
      </div>

      <div style={sectionStyle}>
        <Card title="Danger zone">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
            Permanently delete all your holdings, transactions, valuations, and alerts. Your login stays active — this only
            removes your financial data. <strong>This cannot be undone.</strong>
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "0.875rem" }}
            />
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={confirmText !== "DELETE" || deleteMutation.isPending}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--danger)",
                color: "white",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: confirmText === "DELETE" ? "pointer" : "default",
                opacity: confirmText === "DELETE" ? 1 : 0.5,
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete all my data"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
