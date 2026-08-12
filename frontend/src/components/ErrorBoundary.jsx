import React from "react";
import ErrorState from "./ErrorState";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep this in console for debugging crashes that blank the page
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          error={this.state.error?.message || this.state.error || "An unexpected error occurred"}
          onRetry={() => window.location.reload()}
          message="The page crashed. Please reload."
        />
      );
    }

    return this.props.children;
  }
}

