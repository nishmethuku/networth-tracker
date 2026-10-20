import { useEffect, useState } from "react";
import Card from "./Card";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

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

const primaryButtonStyle = {
  ...buttonStyle,
  background: "var(--primary)",
  color: "var(--text-inverse)",
  border: "none",
};

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "1rem",
  letterSpacing: "0.2em",
  textAlign: "center",
  width: "100%",
  maxWidth: 220,
};

/**
 * Enable/disable TOTP two-factor authentication (Supabase's built-in MFA).
 * Enrollment is a three-step dance per Supabase's API: enroll() creates an
 * (unverified) factor + QR code, challenge() requests a one-time code
 * check, verify() confirms it and flips the factor to "verified" -- only
 * a verified factor is actually enforced (see backend/auth.py's
 * require_auth, which 401s an aal1 token once a verified factor exists).
 */
export default function TwoFactorCard() {
  const { mfa } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState(null); // the verified TOTP factor, if any
  const [enrolling, setEnrolling] = useState(null); // {factorId, qrCode, secret} while setting up
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    const { data, error } = await mfa.listFactors();
    if (error) {
      toast.error(error.message || "Couldn't load two-factor status");
    } else {
      setFactor(data.totp.find((f) => f.status === "verified") || null);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Couldn't start setup");
      return;
    }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function cancelEnroll() {
    if (enrolling) {
      // Best-effort cleanup of the still-unverified factor so it doesn't
      // linger -- failing silently here is fine, an unverified factor
      // has no effect on login either way.
      mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {});
    }
    setEnrolling(null);
    setCode("");
  }

  async function verifyEnroll(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await mfa.challenge({ factorId: enrolling.factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await mfa.verify({ factorId: enrolling.factorId, challengeId: challenge.id, code: code.trim() });
      if (verifyError) throw verifyError;
      toast.success("Two-factor authentication is on");
      setEnrolling(null);
      setCode("");
      await refresh();
    } catch (err) {
      toast.error(err.message || "That code didn't work. Please try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("Turn off two-factor authentication? Your account will only need a password to sign in.")) return;
    setBusy(true);
    const { error } = await mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Couldn't disable two-factor authentication");
      return;
    }
    toast.success("Two-factor authentication is off");
    setFactor(null);
  }

  return (
    <Card title="Two-Factor Authentication">
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading…</p>
      ) : enrolling ? (
        <form onSubmit={verifyEnroll}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Scan this with an authenticator app (Google Authenticator, Authy, 1Password, …), or enter the code manually, then confirm with
            the 6-digit code it shows.
          </p>
          {enrolling.qrCode && (
            <div
              style={{
                background: "#fff",
                padding: "0.75rem",
                borderRadius: "var(--radius)",
                display: "inline-block",
                marginBottom: "0.75rem",
              }}
            >
              {/* qr_code is a full "data:image/svg+xml;utf-8,<svg>...</svg>"
                  URI, not raw markup -- an <img src> renders it as the
                  image it is; dangerouslySetInnerHTML would inject the
                  "data:image/svg+xml;utf-8," prefix as a literal visible
                  text node alongside the actual SVG. */}
              <img src={enrolling.qrCode} alt="Scan with your authenticator app" width={180} height={180} />
            </div>
          )}
          {enrolling.secret && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1rem", fontFamily: "var(--font-mono)" }}>
              Manual entry code: {enrolling.secret}
            </p>
          )}
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="totp-code" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text)" }}>
              6-digit code
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <button type="submit" disabled={busy || code.length !== 6} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Verifying…" : "Verify & Enable"}
            </button>
            <button type="button" onClick={cancelEnroll} disabled={busy} style={buttonStyle}>
              Cancel
            </button>
          </div>
        </form>
      ) : factor ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 500, fontSize: "0.9375rem" }}>✅ Enabled</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "0.2rem" }}>
              Your account requires a code from your authenticator app to sign in.
            </div>
          </div>
          <button onClick={disable} disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
            Disable
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Add an extra layer of security — once enabled, signing in needs your password plus a code from an authenticator app.
          </div>
          <button onClick={startEnroll} disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
            Enable
          </button>
        </div>
      )}
    </Card>
  );
}
