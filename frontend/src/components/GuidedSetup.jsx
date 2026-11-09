import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createHolding, createTransaction, createValuation, ApiError } from "../api";
import { useToast } from "../contexts/ToastContext";
import { COUNTRIES } from "../constants/enums";
import { currencyForCountry, todayISO } from "../utils/formatters";

export const SETUP_KINDS = [
  { id: "shares", title: "A stock or share I bought", hint: "Like Apple, Reliance or a company on the stock market" },
  { id: "metal", title: "Gold or silver", hint: "Coins, bars, jewellery or a digital gold account" },
  { id: "cash", title: "Money in a bank account", hint: "Savings or checking balance" },
  { id: "savings", title: "Property, fixed deposit, PPF or EPF", hint: "Things you do not buy by the share" },
];

const SAVINGS_TYPES = [
  ["real_estate", "Property"],
  ["fixed_deposit", "Fixed deposit"],
  ["ppf", "PPF"],
  ["epf", "EPF"],
];

/** Turns the simple answers into the two calls the app needs: the holding, then its first purchase or value. */
export function buildGuidedPayloads(kind, v) {
  const currency = currencyForCountry(v.country);
  const base = { country: v.country, currency, is_private: false };
  if (kind === "shares") {
    const symbol = v.symbol.trim().toUpperCase();
    return {
      holding: { ...base, asset_type: "stock", symbol, name: symbol, account: "My account" },
      transaction: {
        transaction_type: "buy",
        transaction_date: v.date,
        quantity: parseFloat(v.quantity),
        price_per_unit: parseFloat(v.price),
        currency,
      },
    };
  }
  if (kind === "metal") {
    const symbol = v.metal;
    return {
      holding: { ...base, asset_type: "commodity", symbol, name: symbol === "gold" ? "Gold" : "Silver", account: "My account" },
      transaction: {
        transaction_type: "buy",
        transaction_date: v.date,
        quantity: parseFloat(v.quantity),
        price_per_unit: parseFloat(v.price),
        currency,
      },
    };
  }
  if (kind === "cash") {
    return {
      holding: { ...base, asset_type: "cash", name: v.name.trim(), account: v.name.trim() },
      valuation: { valuation_date: v.date, value: parseFloat(v.value), currency },
    };
  }
  return {
    holding: { ...base, asset_type: v.savingsType, name: v.name.trim(), account: "" },
    valuation: { valuation_date: v.date, value: parseFloat(v.value), currency },
  };
}

const inputStyle = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "1rem",
};
const labelStyle = { display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" };

function Field({ id, label, children, help }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {children}
      {help && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{help}</div>}
    </div>
  );
}

export default function GuidedSetup() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(null);
  const [v, setV] = useState({
    country: "India",
    date: todayISO(),
    symbol: "",
    metal: "gold",
    quantity: "",
    price: "",
    name: "",
    value: "",
    savingsType: "fixed_deposit",
  });
  const set = (key) => (e) => setV({ ...v, [key]: e.target.value });

  const mutation = useMutation({
    mutationFn: async () => {
      const p = buildGuidedPayloads(kind, v);
      const holding = await createHolding(p.holding);
      if (p.transaction) await createTransaction(holding.id, p.transaction);
      else await createValuation(holding.id, p.valuation);
      return holding;
    },
    onSuccess: (holding) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${holding.name} added`);
      navigate("/");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add that. Please check the numbers."),
  });

  function submit(e) {
    e.preventDefault();
    mutation.mutate();
  }

  const countryField = (
    <Field id="gs-country" label="Which country is it in?">
      <select id="gs-country" value={v.country} onChange={set("country")} style={inputStyle}>
        {COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );
  const dateField = (label) => (
    <Field id="gs-date" label={label}>
      <input id="gs-date" type="date" max={todayISO()} value={v.date} onChange={set("date")} style={inputStyle} required />
    </Field>
  );

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Add your first holding</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        {kind ? "Fill in these few boxes. You can add more later." : "What do you want to add first? Pick the closest one."}
      </p>

      {!kind && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {SETUP_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              style={{
                textAlign: "left",
                padding: "1rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{k.title}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{k.hint}</div>
            </button>
          ))}
        </div>
      )}

      {kind && (
        <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
          {kind === "shares" && (
            <>
              <Field id="gs-symbol" label="Ticker" help="Example: AAPL for Apple. For Indian shares add .NS, like RELIANCE.NS">
                <input id="gs-symbol" value={v.symbol} onChange={set("symbol")} style={inputStyle} required />
              </Field>
              {countryField}
              {dateField("When did you buy it?")}
              <Field id="gs-qty" label="How many shares?">
                <input
                  id="gs-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  value={v.quantity}
                  onChange={set("quantity")}
                  style={inputStyle}
                  required
                />
              </Field>
              <Field id="gs-price" label="Price you paid for each share" help="The price updates by itself after this.">
                <input id="gs-price" type="number" step="any" min="0" value={v.price} onChange={set("price")} style={inputStyle} required />
              </Field>
            </>
          )}
          {kind === "metal" && (
            <>
              <Field id="gs-metal" label="Which metal?">
                <select id="gs-metal" value={v.metal} onChange={set("metal")} style={inputStyle}>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                </select>
              </Field>
              {countryField}
              {dateField("When did you buy it?")}
              <Field id="gs-qty" label="How many units (grams or ounces)?">
                <input
                  id="gs-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  value={v.quantity}
                  onChange={set("quantity")}
                  style={inputStyle}
                  required
                />
              </Field>
              <Field
                id="gs-price"
                label="Price per unit"
                help="Gold is not priced live. Use today's price and change it whenever you like."
              >
                <input id="gs-price" type="number" step="any" min="0" value={v.price} onChange={set("price")} style={inputStyle} required />
              </Field>
            </>
          )}
          {kind === "cash" && (
            <>
              <Field id="gs-name" label="Name of the account" help="Example: HDFC Savings">
                <input id="gs-name" value={v.name} onChange={set("name")} style={inputStyle} required />
              </Field>
              {countryField}
              {dateField("Balance as of")}
              <Field id="gs-value" label="Balance">
                <input id="gs-value" type="number" step="any" min="0" value={v.value} onChange={set("value")} style={inputStyle} required />
              </Field>
            </>
          )}
          {kind === "savings" && (
            <>
              <Field id="gs-stype" label="What is it?">
                <select id="gs-stype" value={v.savingsType} onChange={set("savingsType")} style={inputStyle}>
                  {SAVINGS_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="gs-name" label="A name for it" help="Example: Flat in Pune, SBI FD">
                <input id="gs-name" value={v.name} onChange={set("name")} style={inputStyle} required />
              </Field>
              {countryField}
              {dateField("Value as of")}
              <Field id="gs-value" label="What it is worth today">
                <input id="gs-value" type="number" step="any" min="0" value={v.value} onChange={set("value")} style={inputStyle} required />
              </Field>
            </>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => setKind(null)}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {mutation.isPending ? "Adding..." : "Add it"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
