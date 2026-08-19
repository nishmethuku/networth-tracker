import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Landed on directly from the password-reset email link. Supabase's client
// auto-detects the recovery token in the URL fragment on load and turns it
// into a session, so by the time this renders, updateUser({ password }) is
// already valid to call — no token handling needed here.
export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "0.875rem 1rem",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: "0.9375rem",
    lineHeight: "1.5",
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setError(err.message || "That reset link may have expired — request a new one from the sign-in page.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse 900px 600px at 50% -10%, var(--primary-light) 0%, transparent 60%), var(--bg)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          padding: "2.5rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "4px",
            background: "linear-gradient(90deg, var(--primary), var(--accent))",
          }}
        />
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>
          Set a new password
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.9375rem" }}>
          Choose a new password for your account.
        </p>

        {done ? (
          <div style={{ padding: "0.75rem 1rem", background: "var(--success-light)", border: "1px solid var(--success)", borderRadius: "var(--radius)", color: "var(--success)", fontSize: "0.875rem" }}>
            Password updated — taking you to your dashboard...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label htmlFor="new-password" style={{ display: "block", marginBottom: "0.625rem", fontWeight: 500, fontSize: "0.875rem", color: "var(--text)" }}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="confirm-password" style={{ display: "block", marginBottom: "0.625rem", fontWeight: 500, fontSize: "0.875rem", color: "var(--text)" }}>
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ padding: "0.75rem 1rem", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: "var(--radius)", color: "var(--danger)", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "0.875rem 1rem", borderRadius: "var(--radius)", border: "none",
                background: "var(--primary)", color: "var(--text-inverse)",
                cursor: loading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.9375rem",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
