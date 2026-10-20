import { useEffect, useState } from "react";

interface LoadingStateProps {
  message?: string;
}

// Render's free tier spins the backend down after 15 min idle, and
// waking it back up can take the better part of a minute -- a bare
// spinner with no explanation for that long reads as "broken," not
// "working." client.ts already retries a timed-out GET with a longer
// budget and fires a toast the moment that retry starts, but the toast
// is easy to miss (it's transient, and this loading state is what's
// actually on screen the whole time) -- this adds a second line once
// the wait has gone on long enough that a cold start is the likely
// explanation, so the page itself says so rather than relying on the
// toast alone.
const COLD_START_HINT_DELAY_MS = 8000;

/**
 * Loading state component - reusable spinner
 */
export default function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  const [showColdStartHint, setShowColdStartHint] = useState(false);

  useEffect(() => {
    setShowColdStartHint(false);
    const timer = setTimeout(() => setShowColdStartHint(true), COLD_START_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        color: "var(--text-secondary)",
        minHeight: "400px",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          border: "4px solid var(--border)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "1.5rem",
        }}
      />
      <p style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-secondary)" }}>{message}</p>
      {showColdStartHint && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.5rem", maxWidth: 320, textAlign: "center" }}>
          Taking longer than usual — the backend may be waking up from idle. This can take up to a minute.
        </p>
      )}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
