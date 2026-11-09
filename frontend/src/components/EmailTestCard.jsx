import { useState } from "react";
import Card from "./Card";
import { useToast } from "../contexts/ToastContext";
import { sendTestEmail, ApiError } from "../api";

/** Sends one real email so the user can see alert emails reach their inbox. */
export default function EmailTestCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await sendTestEmail();
      toast.success(res?.message || "Test email sent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send the test email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>Email alerts</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Send yourself a test email to check that alerts will reach your inbox. Look in spam if it does not show up.
          </div>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={busy}
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
          {busy ? "Sending..." : "Send test email"}
        </button>
      </div>
    </Card>
  );
}
