import { enterDemoMode } from "../lib/demoMode";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset, signOut, user, mfa } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set once a password sign-in succeeds but the account has two-factor
  // enabled and this session hasn't completed that second step yet --
  // {factorId} while showing the code-entry form.
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);

  // Once authenticated AND (if the account has 2FA) stepped up to aal2,
  // leave the login page. Nothing else does this — /login isn't wrapped
  // in ProtectedRoute, so the router has no other way to know a session
  // just appeared. A password-only sign-in on a 2FA-enabled account
  // *does* produce a (aal1) session/user here — Supabase's own sign-in
  // call succeeds regardless of AAL — so this must check the assurance
  // level before redirecting, not just whether `user` is truthy, or the
  // code-entry step below would never get a chance to render.
  useEffect(() => {
    if (!user) {
      setMfaFactorId(null);
      return;
    }
    let cancelled = false;
    mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancelled) return;
      if (data && data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel) {
        mfa.listFactors().then(({ data: factorsData }) => {
          if (cancelled) return;
          const totp = factorsData?.totp?.[0];
          if (totp) setMfaFactorId(totp.id);
        });
      } else {
        navigate("/", { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, navigate, mfa]);

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError(null);
    setMfaVerifying(true);
    try {
      const { data: challenge, error: challengeError } = await mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim() });
      if (verifyError) throw verifyError;
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "That code didn't work. Please try again.");
      setMfaCode("");
    } finally {
      setMfaVerifying(false);
    }
  }

  async function handleMfaCancel() {
    setMfaFactorId(null);
    setMfaCode("");
    setError(null);
    await signOut();
  }

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

  const labelStyle = {
    display: "block",
    marginBottom: "0.625rem",
    fontWeight: 500,
    fontSize: "0.875rem",
    color: "var(--text)",
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
        setInfo("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      } else if (mode === "reset") {
        await sendPasswordReset(email);
        setInfo("If that email has an account, a password reset link is on its way.");
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Google sign-in failed");
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
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2rem" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            background: "var(--primary)",
            color: "var(--accent-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: "1.125rem",
            fontWeight: 600,
            boxShadow: "var(--shadow)",
          }}
        >
          N
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600, color: "var(--text)" }}>
          Net Worth Tracker
        </span>
      </div>

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
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, var(--primary), var(--accent))",
          }}
        />
        {mfaFactorId ? (
          <>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "0.4rem",
              }}
            >
              Enter your code
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.9375rem" }}>
              Open your authenticator app and enter the 6-digit code for this account.
            </p>
            <form onSubmit={handleMfaSubmit}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label htmlFor="mfa-code" style={labelStyle}>
                  Authentication code
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  maxLength={6}
                  style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center", fontSize: "1.25rem" }}
                />
              </div>

              {error && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--danger-light)",
                    border: "1px solid var(--danger)",
                    borderRadius: "var(--radius)",
                    color: "var(--danger)",
                    marginBottom: "1.25rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={mfaVerifying || mfaCode.length !== 6}
                style={{
                  width: "100%",
                  padding: "0.875rem 1rem",
                  borderRadius: "var(--radius)",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--text-inverse)",
                  cursor: mfaVerifying || mfaCode.length !== 6 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  opacity: mfaVerifying || mfaCode.length !== 6 ? 0.6 : 1,
                }}
              >
                {mfaVerifying ? "Verifying..." : "Verify"}
              </button>
            </form>
            <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem" }}>
              <button
                type="button"
                onClick={handleMfaCancel}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: 0,
                }}
              >
                ← Use a different account
              </button>
            </p>
          </>
        ) : (
          <>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "0.4rem",
              }}
            >
              {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.9375rem" }}>
              {mode === "signup"
                ? "Start tracking your family's net worth"
                : mode === "reset"
                  ? "Enter your email and we'll send you a reset link"
                  : "Sign in to your account"}
            </p>

            {mode !== "reset" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    enterDemoMode();
                    window.location.assign("/");
                  }}
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "1px dashed var(--primary)",
                    background: "transparent",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  Try the demo (sample data, no sign-up)
                </button>
                <button
                  type="button"
                  onClick={handleGoogle}
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "0.9375rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  Continue with Google
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>OR</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: mode === "reset" ? "1.5rem" : "1.25rem" }}>
                <label htmlFor="email" style={labelStyle}>
                  Email
                </label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
              </div>

              {mode !== "reset" && (
                <div style={{ marginBottom: "0.625rem" }}>
                  <label htmlFor="password" style={labelStyle}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    style={inputStyle}
                  />
                </div>
              )}

              {mode === "signin" && (
                <p style={{ textAlign: "right", marginBottom: "1.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setError(null);
                      setInfo(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </p>
              )}

              {error && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--danger-light)",
                    border: "1px solid var(--danger)",
                    borderRadius: "var(--radius)",
                    color: "var(--danger)",
                    marginBottom: "1.25rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </div>
              )}

              {info && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--success-light)",
                    border: "1px solid var(--success)",
                    borderRadius: "var(--radius)",
                    color: "var(--success)",
                    marginBottom: "1.25rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.875rem 1rem",
                  borderRadius: "var(--radius)",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--text-inverse)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Please wait..." : mode === "signup" ? "Sign Up" : mode === "reset" ? "Send Reset Link" : "Sign In"}
              </button>
            </form>

            <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {mode === "reset" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    padding: 0,
                  }}
                >
                  ← Back to sign in
                </button>
              ) : (
                <>
                  {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === "signup" ? "signin" : "signup");
                      setError(null);
                      setInfo(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      padding: 0,
                    }}
                  >
                    {mode === "signup" ? "Sign In" : "Sign Up"}
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
