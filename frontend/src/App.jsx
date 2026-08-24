import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import OfflineIndicator from "./components/OfflineIndicator";
import ToastContainer from "./components/ToastContainer";
import ShortcutsHelp from "./components/ShortcutsHelp";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
import { useAuth } from "./contexts/AuthContext";
import ThemeToggle from "./components/ThemeToggle";
import MobileMenu from "./components/MobileMenu";
import LoadingState from "./components/LoadingState";
import MilestoneCelebration from "./components/MilestoneCelebration";

// Dashboard loads eagerly (it's the landing page — no extra round trip on
// first paint). Everything else is route-split so the initial bundle only
// ships what's needed to render the first screen.
import Dashboard from "./components/Dashboard";
const Portfolio = lazy(() => import("./components/Portfolio"));
const HoldingDetail = lazy(() => import("./components/HoldingDetail"));
const AddHolding = lazy(() => import("./components/AddHolding"));
const Transactions = lazy(() => import("./components/Transactions"));
const Liabilities = lazy(() => import("./components/Liabilities"));
const ImportTransactions = lazy(() => import("./components/ImportTransactions"));
const Alerts = lazy(() => import("./components/Alerts"));
const TaxSummary = lazy(() => import("./components/TaxSummary"));
const AllocationAdvisor = lazy(() => import("./components/ai/AllocationAdvisor"));
const WhatIf = lazy(() => import("./components/WhatIf"));
const Settings = lazy(() => import("./components/Settings"));
const Budget = lazy(() => import("./components/Budget"));
const ImportSpreadsheet = lazy(() => import("./components/ImportSpreadsheet"));
const ImportBankStatement = lazy(() => import("./components/ImportBankStatement"));
const Insights = lazy(() => import("./components/Insights"));
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import CopilotChat from "./components/ai/CopilotChat";
import CommandSearch from "./components/ai/CommandSearch";

function NavLink({ to, children, highlight }) {
  return (
    <Link
      to={to}
      style={
        highlight
          ? {
              color: "var(--primary)",
              fontWeight: 500,
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius)",
              background: "var(--primary-light)",
              transition: "all 0.2s ease",
            }
          : { color: "var(--text-secondary)", transition: "color 0.2s ease" }
      }
      onMouseEnter={(e) => {
        if (!highlight) e.target.style.color = "var(--primary)";
      }}
      onMouseLeave={(e) => {
        if (!highlight) e.target.style.color = "var(--text-secondary)";
      }}
    >
      {children}
    </Link>
  );
}

// Everything less frequently reached from the top nav — tools and reports
// rather than the day-to-day pages (Portfolio, Liabilities, Transactions,
// Budget) that stay inline. Keeps the desktop nav from wrapping into a
// crowded multi-row block as more of these get added over time.
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const active = items.some((item) => item.to === location.pathname);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          background: "none",
          border: "none",
          color: active ? "var(--primary)" : "var(--text-secondary)",
          fontWeight: active ? 600 : 400,
          fontSize: "1rem",
          fontFamily: "inherit",
          cursor: "pointer",
          padding: 0,
        }}
      >
        More <span style={{ fontSize: "0.7em", marginTop: 2 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.75rem)",
            left: 0,
            minWidth: 190,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            padding: "0.4rem",
            display: "flex",
            flexDirection: "column",
            zIndex: 50,
          }}
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-sm)",
                color: location.pathname === item.to ? "var(--primary)" : "var(--text)",
                fontWeight: location.pathname === item.to ? 600 : 400,
                fontSize: "0.9375rem",
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const BOTTOM_TABS = [
  { to: "/", icon: "🏠", labelKey: "nav.home" },
  { to: "/portfolio", icon: "📊", labelKey: "nav.portfolio" },
  { to: "/add-holding", icon: "➕", labelKey: "nav.add", fab: true },
  { to: "/transactions", icon: "📋", labelKey: "nav.history" },
  { to: "/budget", icon: "💰", labelKey: "nav.budget" },
];

function MobileBottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  return (
    <nav className="mobile-bottom-nav">
      {BOTTOM_TABS.map((tab) => {
        const active = location.pathname === tab.to;
        if (tab.fab) {
          return (
            <Link
              key={tab.to}
              to={tab.to}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <motion.span
                whileTap={{ scale: 0.88 }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-md)",
                  marginTop: "-1.25rem",
                }}
              >
                {/* An emoji plus (➕) renders in its own fixed colors on most
                    platforms and ignores `color`, which can wash out against
                    the primary background — an SVG stroke via currentColor
                    keeps it a plain white plus regardless of theme. */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </motion.span>
            </Link>
          );
        }
        return (
          <Link
            key={tab.to}
            to={tab.to}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.15rem",
              position: "relative",
            }}
          >
            <motion.span
              whileTap={{ scale: 0.88 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.15rem",
                padding: "0.25rem 0.75rem",
                borderRadius: "999px",
                background: active ? "var(--primary-light)" : "transparent",
                color: active ? "var(--primary)" : "var(--text-secondary)",
              }}
            >
              <span style={{ fontSize: "1.25rem" }}>{tab.icon}</span>
              <span style={{ fontSize: "0.6875rem", fontWeight: active ? 600 : 500 }}>{t(tab.labelKey)}</span>
            </motion.span>
          </Link>
        );
      })}
    </nav>
  );
}

function AppShell() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  useKeyboardShortcuts({ onShowHelp: () => setHelpOpen(true) });

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", transition: "background-color 0.2s ease" }}>
      <OfflineIndicator />
      <ToastContainer />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <MobileMenu />
      <MilestoneCelebration />
      {/* Top Navigation (desktop) */}
      <nav
        className="desktop-top-nav"
        style={{
          background: "var(--card)",
          padding: "1rem 2rem",
          boxShadow: "var(--shadow)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
          marginBottom: "2rem",
          borderBottom: "1px solid var(--border)",
          transition: "all 0.2s ease",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/" style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--primary)", fontSize: "1.25rem", letterSpacing: "-0.01em" }}>
            {t("nav.netWorth")}
          </Link>
          <NavLink to="/portfolio">{t("nav.portfolio")}</NavLink>
          <NavLink to="/liabilities">{t("nav.liabilities")}</NavLink>
          <NavLink to="/transactions">{t("nav.transactions")}</NavLink>
          <NavLink to="/budget">{t("nav.budget")}</NavLink>
          <MoreMenu
            items={[
              { to: "/import", label: t("nav.importCsv") },
              { to: "/alerts", label: t("nav.alerts") },
              { to: "/tax-summary", label: t("nav.taxSummary") },
              { to: "/insights", label: t("nav.insights") },
              { to: "/allocation-advisor", label: t("nav.allocationAdvisor") },
              { to: "/what-if", label: t("nav.whatIf") },
            ]}
          />
          <NavLink to="/add-holding" highlight>{t("nav.addHolding")}</NavLink>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {user && (
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{user.email}</span>
          )}
          <Link to="/settings" aria-label="Settings" style={{ color: "var(--text-secondary)", fontSize: "1.125rem", lineHeight: 1 }}>⚙️</Link>
          <ThemeToggle />
          <button
            onClick={signOut}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {t("nav.signOut")}
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <div className="page-content" style={{ padding: "0 2rem 2rem" }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingState message="Loading..." />}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="portfolio/:id" element={<HoldingDetail />} />
              <Route path="liabilities" element={<Liabilities />} />
              <Route path="add-holding" element={<AddHolding />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="budget" element={<Budget />} />
              <Route path="import-spreadsheet" element={<ImportSpreadsheet />} />
              <Route path="import-bank-statement" element={<ImportBankStatement />} />
              <Route path="import" element={<ImportTransactions />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="tax-summary" element={<TaxSummary />} />
              <Route path="insights" element={<Insights />} />
              <Route path="allocation-advisor" element={<AllocationAdvisor />} />
              <Route path="what-if" element={<WhatIf />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

      <MobileBottomNav />
      <CopilotChat />
      <CommandSearch />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
