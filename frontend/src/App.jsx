import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import { useTheme } from "./contexts/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";

import Stocks from "./components/Stocks";
import Assets from "./components/Assets";
import Analytics from "./components/Analytics";
import AddAsset from "./components/AddAsset";
import EditAsset from "./components/EditAsset";
import Portfolio from "./components/Portfolio";
import ErrorBoundary from "./components/ErrorBoundary";
function AppRoutes() {

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
            }}
          >
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link 
                to="/" 
                style={{ 
                  fontWeight: 600, 
                  color: "var(--text)",
                  fontSize: "1.125rem",
                  transition: "color 0.2s ease",
                }}
              >
                Portfolio
              </Link>
              <Link 
                to="/stocks" 
                style={{ 
                  color: "var(--text-secondary)",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => (e.target.style.color = "var(--primary)")}
                onMouseLeave={(e) => (e.target.style.color = "var(--text-secondary)")}
              >
                Stocks
              </Link>
              <Link 
                to="/assets" 
                style={{ 
                  color: "var(--text-secondary)",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => (e.target.style.color = "var(--primary)")}
                onMouseLeave={(e) => (e.target.style.color = "var(--text-secondary)")}
              >
                Assets
              </Link>
              <Link 
                to="/analytics" 
                style={{ 
                  color: "var(--text-secondary)",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => (e.target.style.color = "var(--primary)")}
                onMouseLeave={(e) => (e.target.style.color = "var(--text-secondary)")}
              >
                Analytics
              </Link>
              <Link 
                to="/add-asset" 
                style={{ 
                  color: "var(--primary)",
                  fontWeight: 500,
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius)",
                  background: "var(--primary-light)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "var(--primary)";
                  e.target.style.color = "var(--text-inverse)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "var(--primary-light)";
                  e.target.style.color = "var(--primary)";
                }}
              >
                + Add Asset
              </Link>
            </div>
            <ThemeToggle />
          </nav>

        {/* Page Content */}
        <div style={{ padding: "0 2rem 2rem" }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Portfolio />} />

              {/* Stocks */}
              <Route path="/stocks" element={<Stocks />} />

              {/* Assets */}
              <Route path="/assets" element={<Assets />} />
              <Route path="/add-asset" element={<AddAsset />} />
              <Route path="/assets/:id/edit" element={<EditAsset />} />

              {/* Analytics */}
              <Route path="/analytics" element={<Analytics />} />
              
              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
