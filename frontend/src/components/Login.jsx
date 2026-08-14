import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Once authenticated (password sign-in success, or landing back here after
  // a Google OAuth redirect), leave the login page. Nothing else does this —
  // /login isn't wrapped in ProtectedRoute, so the router has no other way
  // to know a session just appeared.
  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

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
        background:
          "radial-gradient(ellipse 900px 600px at 50% -10%, var(--primary-light) 0%, transparent 60%), var(--bg)",
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
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.9375rem" }}>
          {mode === "signup" ? "Start tracking your family's net worth" : "Sign in to your account"}
        </p>

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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
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
            {loading ? "Please wait..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
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
        </p>
      </div>
    </div>
  );
}
