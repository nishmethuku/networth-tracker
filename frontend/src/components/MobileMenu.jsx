import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import ThemeToggle from "./ThemeToggle";

// Everything not already reachable from the 5-item bottom tab bar (Home,
// Portfolio, Add, Transactions, Budget) — including Settings and Sign Out,
// which previously only existed in the desktop nav that's fully hidden on
// mobile, so there was literally no way to reach them from a phone.
const MENU_LINKS = [
  { to: "/insights", labelKey: "nav.insights", icon: "📈" },
  { to: "/import", label: "Import CSV (Broker)", icon: "📥" },
  { to: "/import-spreadsheet", label: "Import Spreadsheet (AI)", icon: "✨" },
  { to: "/import-bank-statement", label: "Import Bank Statement (AI)", icon: "✨" },
  { to: "/alerts", labelKey: "nav.alerts", icon: "🔔" },
  { to: "/tax-summary", labelKey: "nav.taxSummary", icon: "🧾" },
  { to: "/allocation-advisor", labelKey: "nav.allocationAdvisor", icon: "⚖️" },
  { to: "/settings", labelKey: "nav.settings", icon: "⚙️" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="mobile-top-bar">
      <Link to="/" onClick={() => setOpen(false)} style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--primary)", fontSize: "1.125rem" }}>
        {t("nav.netWorth")}
      </Link>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{ background: "none", border: "none", color: "var(--text)", fontSize: "1.5rem", lineHeight: 1, padding: "0.25rem", cursor: "pointer" }}
      >
        ☰
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 199 }}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(320px, 85vw)",
                background: "var(--card)",
                borderLeft: "1px solid var(--border)",
                zIndex: 200,
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div style={{ padding: "1.25rem 1rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {user && <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{ background: "none", border: "none", fontSize: "1.25rem", color: "var(--text-muted)", cursor: "pointer", lineHeight: 1, flexShrink: 0, marginLeft: "0.5rem" }}
                >
                  ×
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0", display: "flex", flexDirection: "column" }}>
                {MENU_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.875rem 1.25rem",
                      color: "var(--text)",
                      fontSize: "0.9375rem",
                      minHeight: 48,
                    }}
                  >
                    <span style={{ fontSize: "1.125rem" }}>{link.icon}</span>
                    {link.labelKey ? t(link.labelKey) : link.label}
                  </Link>
                ))}
              </div>

              <div style={{ padding: "1rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <ThemeToggle />
                <button
                  onClick={() => { setOpen(false); signOut(); }}
                  style={{
                    padding: "0.625rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    minHeight: 48,
                  }}
                >
                  {t("nav.signOut")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
