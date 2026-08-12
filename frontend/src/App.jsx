import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import ThemeToggle from "./components/ThemeToggle";

import Stocks from "./components/Stocks";
import Assets from "./components/Assets";
import Analytics from "./components/Analytics";
import AddAsset from "./components/AddAsset";
import EditAsset from "./components/EditAsset";
import Portfolio from "./components/Portfolio";
import Households from "./components/Households";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

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

function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", transition: "background-color 0.2s ease" }}>
      {/* Top Navigation */}
      <nav
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
          <Link to="/" style={{ fontWeight: 600, color: "var(--text)", fontSize: "1.125rem" }}>
            Portfolio
          </Link>
          <NavLink to="/stocks">Stocks</NavLink>
          <NavLink to="/assets">Assets</NavLink>
          <NavLink to="/households">Household</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/add-asset" highlight>+ Add Asset</NavLink>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {user && (
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{user.email}</span>
          )}
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
            Sign Out
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <div style={{ padding: "0 2rem 2rem" }}>
        <ErrorBoundary>
          <Routes>
            <Route index element={<Portfolio />} />
            <Route path="stocks" element={<Stocks />} />
            <Route path="assets" element={<Assets />} />
            <Route path="add-asset" element={<AddAsset />} />
            <Route path="assets/:id/edit" element={<EditAsset />} />
            <Route path="households" element={<Households />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
