import { useState } from "react";
import Card from "./Card";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
  width: "100%",
};

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

const primaryButtonStyle = { ...buttonStyle, background: "var(--primary)", color: "var(--text-inverse)", border: "none" };

/**
 * Lets an already-signed-in user change their password directly, without
 * going through the forgot-password email flow (ResetPassword.jsx) --
 * same updatePassword() call (Supabase's updateUser({password}), which
 * only needs a valid session, not re-entering the current password).
 */
export default function ChangePasswordCard() {
  const { updatePassword } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setOpen(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success("Password changed");
      reset();
    } catch (err) {
      toast.error(err.message || "Couldn't change your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password">
      {open ? (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}>
          <div>
            <label
              htmlFor="new-password"
              style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoFocus
              style={inputStyle}
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={reset} disabled={busy} style={buttonStyle}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Change your password at any time.</div>
          <button onClick={() => setOpen(true)} style={buttonStyle}>
            Change password
          </button>
        </div>
      )}
    </Card>
  );
}
