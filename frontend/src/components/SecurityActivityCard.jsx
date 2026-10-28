import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { fetchSecurityActivity } from "../api";

const buttonStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 500,
};

function deviceName(userAgent) {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

function when(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * A plain list of the sensitive things that happened on this account (data
 * downloads, bank links, household changes, wipes) so a surprise is easy to
 * spot, plus a way to end every session at once.
 */
export default function SecurityActivityCard() {
  const { signOutEverywhere } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["security-activity"], queryFn: fetchSecurityActivity, retry: false });

  async function endAllSessions() {
    setBusy(true);
    try {
      await signOutEverywhere();
    } catch {
      toast.error("Could not sign out of every device. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card title="Security activity">
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
        Recent sensitive actions on your account. If you see something you did not do, sign out of every device and change your password.
      </p>

      {isLoading && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading…</p>}
      {isError && <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Could not load your security activity right now.</p>}
      {data && data.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Nothing yet. Downloads, bank links and similar actions will show up here.
        </p>
      )}
      {data && data.length > 0 && (
        <ul aria-label="Security activity" style={{ listStyle: "none", padding: 0, margin: "0 0 1rem 0" }}>
          {data.slice(0, 10).map((event) => (
            <li key={event.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text)", fontSize: "0.875rem", fontWeight: 500 }}>
                {event.label}
                {event.detail ? ` (${event.detail})` : ""}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                {when(event.created_at)} · {deviceName(event.user_agent)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button onClick={endAllSessions} disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Signing out…" : "Sign out of all devices"}
      </button>
    </Card>
  );
}
