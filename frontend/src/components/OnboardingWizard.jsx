import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { COUNTRIES, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";

const STORAGE_PREFIX = "onboarding_dismissed_";

export function isOnboardingDismissed(userId) {
  return localStorage.getItem(STORAGE_PREFIX + userId) === "true";
}

function dismiss(userId) {
  localStorage.setItem(STORAGE_PREFIX + userId, "true");
}

const stepVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export default function OnboardingWizard({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("United States");
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency());

  function finish(navigateTo) {
    dismiss(user.id);
    localStorage.setItem("default_display_currency", currency);
    onClose();
    if (navigateTo) navigate(navigateTo);
  }

  const buttonPrimary = {
    padding: "0.75rem 1.5rem",
    borderRadius: "var(--radius)",
    border: "none",
    background: "var(--primary)",
    color: "var(--text-inverse)",
    fontWeight: 600,
    fontSize: "0.9375rem",
    cursor: "pointer",
  };
  const buttonSecondary = {
    padding: "0.75rem 1.5rem",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontWeight: 500,
    fontSize: "0.9375rem",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15,23,42,0.5)",
        padding: "1rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          width: "min(440px, 100%)",
          padding: "2rem",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.5rem" }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--primary)" : "var(--border)" }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Welcome 👋</h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
                Let's set a couple of defaults before you get started.
              </p>
              <label
                htmlFor="onboarding-country"
                style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}
              >
                Primary country
              </label>
              <select
                id="onboarding-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  marginBottom: "1rem",
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label
                htmlFor="onboarding-currency"
                style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}
              >
                Default display currency
              </label>
              <select
                id="onboarding-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  marginBottom: "1.5rem",
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button onClick={() => finish(null)} style={buttonSecondary}>
                  Skip
                </button>
                <button onClick={() => setStep(1)} style={buttonPrimary}>
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
                Add your first holding
              </h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 }}>How do you want to get started?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <button onClick={() => finish("/add-holding")} style={{ ...buttonSecondary, textAlign: "left", padding: "1rem" }}>
                  ✍️ <strong>Add manually</strong> — enter a holding yourself
                </button>
                <button onClick={() => finish("/import")} style={{ ...buttonSecondary, textAlign: "left", padding: "1rem" }}>
                  📥 <strong>Import from a broker</strong> — Zerodha, Groww, Fidelity, or Robinhood
                </button>
                <button onClick={() => finish(null)} style={{ ...buttonSecondary, textAlign: "left", padding: "1rem" }}>
                  👀 <strong>Just exploring</strong> — I'll add things later
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button onClick={() => setStep(0)} style={buttonSecondary}>
                  Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
