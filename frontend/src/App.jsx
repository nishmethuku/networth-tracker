import { Suspense, lazy, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import OfflineIndicator from "./components/OfflineIndicator";
import ToastContainer from "./components/ToastContainer";
import ShortcutsHelp from "./components/ShortcutsHelp";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
import { useAuth } from "./contexts/AuthContext";
import ThemeToggle from "./components/ThemeToggle";
import LoadingState from "./components/LoadingState";

// Dashboard loads eagerly (it's the landing page — no extra round trip on
// first paint). Everything else is route-split so the initial bundle only
// ships what's needed to render the first screen.
import Dashboard from "./components/Dashboard";
const Portfolio = lazy(() => import("./components/Portfolio"));
const HoldingDetail = lazy(() => import("./components/HoldingDetail"));
const AddHolding = lazy(() => import("./components/AddHolding"));
const Transactions = lazy(() => import("./components/Transactions"));
const ImportTransactions = lazy(() => import("./components/ImportTransactions"));
const Alerts = lazy(() => import("./components/Alerts"));
const TaxSummary = lazy(() => import("./components/TaxSummary"));
const Households = lazy(() => import("./components/Households"));
const AllocationAdvisor = lazy(() => import("./components/ai/AllocationAdvisor"));
const Settings = lazy(() => import("./components/Settings"));
const Budget = lazy(() => import("./components/Budget"));
const ImportSpreadsheet = lazy(() => import("./components/ImportSpreadsheet"));
const ImportBankStatement = lazy(() => import("./components/ImportBankStatement"));
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

const BOTTOM_TABS = [
  { to: "/", icon: "🏠", labelKey: "nav.home" },
  { to: "/portfolio", icon: "📊", labelKey: "nav.portfolio" },
  { to: "/add-holding", icon: "➕", labelKey: "nav.add", fab: true },
  { to: "/transactions", icon: "📋", labelKey: "nav.history" },
  { to: "/households", icon: "👪", labelKey: "nav.family" },
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
                  color: "var(--text-inverse)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.375rem",
                  boxShadow: "var(--shadow-md)",
                  marginTop: "-1.25rem",
                }}
              >
                {tab.icon}
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
          <NavLink to="/transactions">{t("nav.transactions")}</NavLink>
          <NavLink to="/budget">{t("nav.budget")}</NavLink>
          <NavLink to="/import">{t("nav.importCsv")}</NavLink>
          <NavLink to="/alerts">{t("nav.alerts")}</NavLink>
          <NavLink to="/tax-summary">{t("nav.taxSummary")}</NavLink>
          <NavLink to="/allocation-advisor">{t("nav.allocationAdvisor")}</NavLink>
          <NavLink to="/households">{t("nav.household")}</NavLink>
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
              <Route path="add-holding" element={<AddHolding />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="budget" element={<Budget />} />
              <Route path="import-spreadsheet" element={<ImportSpreadsheet />} />
              <Route path="import-bank-statement" element={<ImportBankStatement />} />
              <Route path="import" element={<ImportTransactions />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="tax-summary" element={<TaxSummary />} />
              <Route path="allocation-advisor" element={<AllocationAdvisor />} />
              <Route path="households" element={<Households />} />
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
