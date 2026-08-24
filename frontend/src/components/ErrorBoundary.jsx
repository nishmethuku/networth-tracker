import React from "react";
import ErrorState from "./ErrorState";

/**
 * mode="page" (default): full-page ErrorState, retry reloads the whole app
 * — used once at the route level, where a broken provider/context might not
 * recover from a local re-render.
 *
 * mode="section": a compact, contained card in place of just this section
 * (a chart, a donut, a movers list) so one broken widget doesn't take the
 * whole page down. Retry just re-renders the boundary's children.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  handleRetry() {
    if (this.props.mode === "section") {
      this.setState({ hasError: false, error: null });
    } else {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || this.state.error || "An unexpected error occurred";

      if (this.props.mode === "section") {
        return (
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--danger)",
              background: "var(--danger-light)",
              textAlign: "center",
            }}
          >
            <p style={{ color: "var(--text)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {this.props.fallbackMessage || "This section couldn't load."}
            </p>
            <button
              onClick={this.handleRetry}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: "0.8125rem",
              }}
            >
              Retry
            </button>
          </div>
        );
      }

      return <ErrorState error={message} onRetry={this.handleRetry} message="The page crashed. Please reload." />;
    }

    return this.props.children;
  }
}
