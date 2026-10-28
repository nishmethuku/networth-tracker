import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { COUNTRIES, CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { currencyForCountry } from "../utils/formatters";
import { fetchSyncStatus } from "../api";
import { isDemoMode } from "../lib/demoMode";

const STORAGE_PREFIX = "onboarding_dismissed_";
const TOTAL_STEPS = 2;

export function isOnboardingDismissed(userId) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) === "true";
  } catch {
    return false;
  }
}

function dismiss(userId) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, "true");
  } catch {
    // Storage can be blocked; the wizard simply shows again next visit.
  }
}

const stepVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

const headingStyle = { fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" };
const bodyStyle = { color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 };
const labelStyle = { display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" };
const selectStyle = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
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
const choiceStyle = { ...buttonSecondary, textAlign: "left", padding: "1rem" };

export default function OnboardingWizard({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("United States");
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency());
  // Once the person picks a currency themselves, changing the country no longer overrides it.
  const [currencyTouched, setCurrencyTouched] = useState(false);

  const demo = isDemoMode();
  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    enabled: !demo,
    retry: false,
  });
  const bankSyncAvailable = !demo && Boolean(syncStatus?.enabled);

  function finish(navigateTo) {
    dismiss(user.id);
    try {
      localStorage.setItem("default_display_currency", currency);
    } catch {
      // Not critical: the currency can be changed later from the dashboard.
    }
    onClose();
    if (navigateTo) navigate(navigateTo);
  }

  function onCountryChange(next) {
    setCountry(next);
    if (!currencyTouched) {
      const suggested = currencyForCountry(next);
      if (CURRENCIES.includes(suggested)) setCurrency(suggested);
    }
  }

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish(null);
    }
  }

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          width: "min(440px, 100%)",
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
          padding: "2rem",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.5rem" }} aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--primary)" : "var(--border)" }} />
          ))}
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          Step {step + 1} of {TOTAL_STEPS}
        </p>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 id="onboarding-title" style={headingStyle}>
                Welcome 👋
              </h2>
              <p style={bodyStyle}>Let's set a couple of defaults before you get started. You can change them any time.</p>
              <label htmlFor="onboarding-country" style={labelStyle}>
                Primary country
              </label>
              <select
                id="onboarding-country"
                value={country}
                onChange={(e) => onCountryChange(e.target.value)}
                style={{ ...selectStyle, marginBottom: "1rem" }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label htmlFor="onboarding-currency" style={labelStyle}>
                Default display currency
              </label>
              <select
                id="onboarding-currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setCurrencyTouched(true);
                }}
                style={{ ...selectStyle, marginBottom: "1.5rem" }}
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
              <h2 id="onboarding-title" style={headingStyle}>
                What would you like to do first?
              </h2>
              <p style={bodyStyle}>Pick one. Everything else is a click away in the menu.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <button onClick={() => finish("/add-holding")} style={choiceStyle}>
                  ✍️ <strong>Add an investment</strong> — enter a holding yourself
                </button>
                <button onClick={() => finish("/import")} style={choiceStyle}>
                  📥 <strong>Import from a broker</strong> — Zerodha, Groww, Fidelity, or Robinhood
                </button>
                {bankSyncAvailable && (
                  <button onClick={() => finish("/settings")} style={choiceStyle}>
                    🏦 <strong>Connect a bank</strong> — bring in spending automatically
                  </button>
                )}
                <button onClick={() => finish("/expenses")} style={choiceStyle}>
                  🧾 <strong>Track spending</strong> — log an expense or import a statement
                </button>
                <button onClick={() => finish(null)} style={choiceStyle}>
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
