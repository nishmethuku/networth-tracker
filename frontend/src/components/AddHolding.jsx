import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createHolding, createTransaction, createValuation, searchSymbols, searchCrypto, fetchHoldings, ApiError } from "../api";
import { useToast } from "../contexts/ToastContext";
import { ASSET_TYPE_OPTIONS, COUNTRIES, CURRENCIES, isQuantityBased } from "../constants/enums";
import { currencyForCountry } from "../utils/formatters";
import { holdingSchema } from "../utils/holdingSchema";
import NumericInput from "./NumericInput";

const inputStyle = {
  width: "100%",
  padding: "0.875rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};

const inputErrorStyle = { ...inputStyle, borderColor: "var(--danger)" };
const inputValidStyle = { ...inputStyle, borderColor: "var(--success)" };

const labelStyle = {
  display: "block",
  marginBottom: "0.625rem",
  fontWeight: 500,
  fontSize: "0.875rem",
  color: "var(--text)",
};

const errorTextStyle = {
  color: "var(--danger)",
  fontSize: "0.8125rem",
  marginTop: "0.4rem",
};

const validTextStyle = {
  color: "var(--success)",
  fontSize: "0.8125rem",
  marginTop: "0.4rem",
};

const sectionStyle = {
  marginBottom: "2.5rem",
  paddingBottom: "2.5rem",
  borderBottom: "1px solid var(--border)",
};

const METALS = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "platinum", label: "Platinum" },
];

const QUANTITY_BASED_SET = new Set(["stock", "mutual_fund", "crypto", "commodity"]);
const NAME_BASED_SET = new Set(["real_estate", "fixed_deposit", "ppf", "epf", "retirals", "cash", "loan", "credit"]);
// "Account" (a specific brokerage/exchange/bank account) doesn't map to
// anything real for these — Name + Institution already identify them.
const ACCOUNT_LESS_TYPES = new Set(["real_estate", "fixed_deposit", "ppf", "epf"]);
// Loans accrue interest and have a payoff date, same shape as FD/PPF/EPF's
// interest-rate + maturity-date fields, just labeled for a payoff instead.
// Credit (money owed to you — the mirror of a loan) gets the same fields.
const INTEREST_BEARING_TYPES = new Set(["fixed_deposit", "ppf", "epf", "loan", "credit"]);

const ACCOUNT_PLACEHOLDERS = {
  stock: "e.g., Fidelity, Zerodha",
  mutual_fund: "e.g., Zerodha Coin, Groww",
  crypto: "e.g., Coinbase, Ledger wallet",
  commodity: "e.g., Bank locker, Digital gold account",
  cash: "e.g., Checking, Savings",
  loan: "e.g., Loan account number",
  retirals: "e.g., 401k, IRA, NPS",
  credit: "e.g., who you lent it to",
};

const INSTITUTION_PLACEHOLDERS = {
  fixed_deposit: "e.g., HDFC Bank, Chase",
  ppf: "e.g., SBI, Post Office",
  epf: "e.g., EPFO, employer name",
  cash: "e.g., Chase, HDFC Bank",
  loan: "e.g., Wells Fargo, SBI",
  retirals: "e.g., Fidelity, Vanguard",
};

// Shows a red warning + message once a field has been touched and is
// invalid, or a green checkmark once it's been touched and passes --
// react-hook-form's touchedFields, not raw errors, since flagging a field
// red before the user has even reached it (or blurred past it) reads as
// the form scolding them for nothing.
function FieldStatus({ message, touched }) {
  if (message) return <p style={errorTextStyle}>{message}</p>;
  if (touched) return <p style={validTextStyle}>✓ Looks good</p>;
  return null;
}

function fieldStyle(touched, hasError) {
  if (hasError) return inputErrorStyle;
  if (touched) return inputValidStyle;
  return inputStyle;
}

export default function AddHolding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, touchedFields, isSubmitting },
  } = useForm({
    resolver: zodResolver(holdingSchema),
    mode: "onBlur",
    defaultValues: {
      assetType: "stock",
      country: "",
      currency: "",
      account: "",
      is_private: false,
      notes: "",
      tags: "",
      date: new Date().toISOString().split("T")[0],
      symbol: "",
      name: "",
      institution: "",
      interest_rate: "",
      maturity_date: "",
      quantity: "",
      price_per_unit: "",
      value: "",
      funding_source_holding_id: "",
      sip_enabled: false,
      sip_amount: "",
      sip_frequency: "monthly",
      sip_start_date: new Date().toISOString().split("T")[0],
    },
  });

  const assetType = watch("assetType");
  const country = watch("country");
  const currency = watch("currency");
  const symbol = watch("symbol");
  const sipEnabled = watch("sip_enabled");
  const quantityBased = isQuantityBased(assetType);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Existing account names, offered as autocomplete on the Account field so
  // "Chase" typed once and "chase" typed a second time don't silently
  // become two different accounts in the portfolio's account grouping.
  const { data: existingHoldings } = useQuery({
    queryKey: ["holdings", "summary", "USD"],
    queryFn: () => fetchHoldings({ currency: "USD", summary: true }),
    staleTime: 1000 * 60,
  });
  const accountSuggestions = [...new Set((existingHoldings || []).map((h) => h.account).filter(Boolean))].sort();

  // Cash holdings to offer as a funding source for the initial buy -- e.g.
  // buying a stock and paying for it out of a bank account, which should
  // reduce that account's recorded balance instead of the two staying
  // disconnected. Same pattern as HoldingDetail.jsx's AddTransactionForm.
  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: quantityBased,
  });

  useEffect(() => {
    if (country && !currency) {
      setValue("currency", currencyForCountry(country));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const createHoldingMutation = useMutation({
    mutationFn: async (form) => {
      const holdingPayload = {
        asset_type: form.assetType,
        symbol: form.assetType === "commodity" ? form.symbol : form.symbol || null,
        name: form.name || form.symbol,
        country: form.country,
        account: ACCOUNT_LESS_TYPES.has(form.assetType) ? "" : form.account || "Account 1",
        institution: form.institution || null,
        currency: form.currency || "USD",
        is_private: form.is_private,
        notes: form.notes || null,
        tags: form.tags || null,
      };
      if (INTEREST_BEARING_TYPES.has(form.assetType)) {
        if (form.interest_rate) holdingPayload.interest_rate = parseFloat(form.interest_rate);
        if (form.maturity_date) holdingPayload.maturity_date = form.maturity_date;
      }
      if (isQuantityBased(form.assetType) && form.sip_enabled && form.sip_amount) {
        holdingPayload.sip_amount = parseFloat(form.sip_amount);
        holdingPayload.sip_frequency = form.sip_frequency;
        holdingPayload.sip_start_date = form.sip_start_date;
      }

      const holding = await createHolding(holdingPayload);

      if (isQuantityBased(form.assetType)) {
        const tx = await createTransaction(holding.id, {
          transaction_type: "buy",
          transaction_date: form.date,
          quantity: parseFloat(form.quantity),
          price_per_unit: parseFloat(form.price_per_unit),
          currency: form.currency || "USD",
          ...(form.funding_source_holding_id ? { funding_source_holding_id: Number(form.funding_source_holding_id) } : {}),
        });
        if (tx.fundingSource) {
          queryClient.invalidateQueries({ queryKey: ["holding", tx.fundingSource.holdingId] });
          queryClient.invalidateQueries({ queryKey: ["holding-valuations", tx.fundingSource.holdingId] });
        }
      } else {
        await createValuation(holding.id, {
          valuation_date: form.date,
          value: parseFloat(form.value),
          currency: form.currency || "USD",
        });
      }
      return holding;
    },
    onSuccess: (holding) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${holding.symbol || holding.name} added to portfolio`);
      setTimeout(() => navigate("/portfolio"), 1200);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to add holding");
    },
  });

  async function handleSymbolSearch(query) {
    if (!query || query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const results = assetType === "crypto" ? await searchCrypto(query) : await searchSymbols(query, country, assetType);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch {
      setSuggestions([]);
    }
  }

  function handleSymbolChange(e) {
    const value = e.target.value;
    setValue("symbol", value, { shouldValidate: true });
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSymbolSearch(value.trim()), 300);
  }

  function selectSuggestion(s) {
    setValue("symbol", s.symbol, { shouldValidate: true });
    setValue("name", s.description || s.displaySymbol || s.symbol);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        symbolInputRef.current &&
        !symbolInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function onSubmit(data) {
    createHoldingMutation.mutate(data);
  }

  const submitting = isSubmitting || createHoldingMutation.isPending;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ marginBottom: "2.5rem", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)" }}>Add Holding</h2>

      <datalist id="account-suggestions">
        {accountSuggestions.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>
            What are you adding?
          </h3>
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <div>
              <label htmlFor="holding-asset-type" style={labelStyle}>
                Type *
              </label>
              <select
                id="holding-asset-type"
                {...register("assetType")}
                onChange={(e) => {
                  setValue("assetType", e.target.value);
                  setValue("symbol", "");
                  setValue("name", "");
                  setValue("account", "");
                }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {ASSET_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="holding-country" style={labelStyle}>
                Country *
              </label>
              <select
                id="holding-country"
                {...register("country")}
                style={{ ...fieldStyle(touchedFields.country, errors.country), cursor: "pointer" }}
              >
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <FieldStatus message={errors.country?.message} touched={touchedFields.country} />
            </div>

            <div>
              <label htmlFor="holding-currency" style={labelStyle}>
                Currency
              </label>
              <select id="holding-currency" {...register("currency")} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Auto (from country)</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Details</h3>

          {QUANTITY_BASED_SET.has(assetType) && assetType !== "commodity" && (
            <div style={{ position: "relative", marginBottom: "1.5rem" }}>
              <label htmlFor="holding-symbol" style={labelStyle}>
                Symbol *
              </label>
              <input
                id="holding-symbol"
                ref={symbolInputRef}
                value={symbol}
                onChange={handleSymbolChange}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={assetType === "crypto" ? "e.g., Bitcoin" : "e.g., AAPL"}
                style={fieldStyle(touchedFields.symbol, errors.symbol)}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "0.25rem",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    boxShadow: "var(--shadow-md)",
                    zIndex: 1000,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => selectSuggestion(s)}
                      style={{ padding: "0.75rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                    >
                      <div style={{ fontWeight: 600 }}>{s.displaySymbol || s.symbol}</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{s.description}</div>
                    </div>
                  ))}
                </div>
              )}
              <FieldStatus message={errors.symbol?.message} touched={touchedFields.symbol} />
            </div>
          )}

          {assetType === "commodity" && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="holding-metal" style={labelStyle}>
                Metal *
              </label>
              <select
                id="holding-metal"
                value={symbol}
                onChange={(e) => {
                  setValue("symbol", e.target.value, { shouldValidate: true });
                  setValue("name", METALS.find((m) => m.value === e.target.value)?.label || "");
                }}
                style={{ ...fieldStyle(touchedFields.symbol, errors.symbol), cursor: "pointer" }}
              >
                <option value="">Select metal...</option>
                {METALS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <FieldStatus message={errors.symbol?.message} touched={touchedFields.symbol} />
            </div>
          )}

          {QUANTITY_BASED_SET.has(assetType) && !ACCOUNT_LESS_TYPES.has(assetType) && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="holding-account" style={labelStyle}>
                Account
              </label>
              <input
                id="holding-account"
                {...register("account")}
                placeholder={ACCOUNT_PLACEHOLDERS[assetType] || "e.g., Brokerage name"}
                list="account-suggestions"
                style={inputStyle}
              />
            </div>
          )}

          {NAME_BASED_SET.has(assetType) && (
            <div style={{ display: "grid", gap: "1.5rem", marginBottom: "1.5rem" }}>
              <div>
                <label htmlFor="holding-name" style={labelStyle}>
                  Name *
                </label>
                <input
                  id="holding-name"
                  {...register("name")}
                  placeholder={assetType === "real_estate" ? "e.g., My House" : "e.g., HDFC FD #1"}
                  style={fieldStyle(touchedFields.name, errors.name)}
                />
                <FieldStatus message={errors.name?.message} touched={touchedFields.name} />
              </div>
              {assetType !== "real_estate" && (
                <div>
                  <label htmlFor="holding-institution" style={labelStyle}>
                    Institution
                  </label>
                  <input
                    id="holding-institution"
                    {...register("institution")}
                    placeholder={INSTITUTION_PLACEHOLDERS[assetType] || "e.g., Bank or provider name"}
                    style={inputStyle}
                  />
                </div>
              )}
              {!ACCOUNT_LESS_TYPES.has(assetType) && (
                <div>
                  <label htmlFor="holding-account" style={labelStyle}>
                    Account
                  </label>
                  <input
                    id="holding-account"
                    {...register("account")}
                    placeholder={ACCOUNT_PLACEHOLDERS[assetType] || "e.g., Account name"}
                    list="account-suggestions"
                    style={inputStyle}
                  />
                </div>
              )}
              {INTEREST_BEARING_TYPES.has(assetType) && (
                <>
                  <div>
                    <label htmlFor="holding-interest-rate" style={labelStyle}>
                      Interest Rate (%)
                    </label>
                    <NumericInput id="holding-interest-rate" control={control} name="interest_rate" style={inputStyle} />
                  </div>
                  <div>
                    <label htmlFor="holding-maturity-date" style={labelStyle}>
                      {assetType === "loan" ? "Payoff Date" : assetType === "credit" ? "Repayment Date" : "Maturity Date"}
                    </label>
                    <input id="holding-maturity-date" type="date" {...register("maturity_date")} style={inputStyle} />
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
            <div>
              <label htmlFor="holding-date" style={labelStyle}>
                {quantityBased ? "Purchase Date *" : "Date *"}
              </label>
              <input
                id="holding-date"
                type="date"
                {...register("date")}
                max={new Date().toISOString().split("T")[0]}
                style={fieldStyle(touchedFields.date, errors.date)}
              />
              <FieldStatus message={errors.date?.message} touched={touchedFields.date} />
            </div>
            {quantityBased ? (
              <>
                <div>
                  <label htmlFor="holding-quantity" style={labelStyle}>
                    Quantity *
                  </label>
                  <NumericInput
                    id="holding-quantity"
                    control={control}
                    name="quantity"
                    style={fieldStyle(touchedFields.quantity, errors.quantity)}
                  />
                  <FieldStatus message={errors.quantity?.message} touched={touchedFields.quantity} />
                </div>
                <div>
                  <label htmlFor="holding-price-per-unit" style={labelStyle}>
                    Price / unit *
                  </label>
                  <NumericInput
                    id="holding-price-per-unit"
                    control={control}
                    name="price_per_unit"
                    style={fieldStyle(touchedFields.price_per_unit, errors.price_per_unit)}
                  />
                  <FieldStatus message={errors.price_per_unit?.message} touched={touchedFields.price_per_unit} />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="holding-value" style={labelStyle}>
                  {assetType === "loan" ? "Amount Owed *" : assetType === "credit" ? "Amount Owed to You *" : "Value *"}
                </label>
                <NumericInput id="holding-value" control={control} name="value" style={fieldStyle(touchedFields.value, errors.value)} />
                <FieldStatus message={errors.value?.message} touched={touchedFields.value} />
              </div>
            )}
          </div>

          {quantityBased && cashHoldings?.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <label htmlFor="holding-funding-source" style={labelStyle}>
                Funded from
              </label>
              <select
                id="holding-funding-source"
                {...register("funding_source_holding_id")}
                style={{ ...inputStyle, cursor: "pointer" }}
                title="Deducts this purchase's cost from the selected account's balance"
              >
                <option value="">— none —</option>
                {cashHoldings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.account ? ` (${c.account})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Optional</h3>
          <div style={{ display: "grid", gap: "1.5rem", marginBottom: "2rem" }}>
            <div>
              <label htmlFor="holding-notes" style={labelStyle}>
                Notes
              </label>
              <textarea id="holding-notes" {...register("notes")} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label htmlFor="holding-tags" style={labelStyle}>
                Tags
              </label>
              <input id="holding-tags" {...register("tags")} placeholder="retirement, long-term" style={inputStyle} />
            </div>

            {quantityBased && (
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  <input type="checkbox" {...register("sip_enabled")} />
                  This is a recurring investment (SIP)
                </label>
                {sipEnabled && (
                  <div
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginTop: "1rem" }}
                  >
                    <div>
                      <label htmlFor="holding-sip-amount" style={labelStyle}>
                        Amount per contribution
                      </label>
                      <NumericInput id="holding-sip-amount" control={control} name="sip_amount" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="holding-sip-frequency" style={labelStyle}>
                        Frequency
                      </label>
                      <select id="holding-sip-frequency" {...register("sip_frequency")} style={{ ...inputStyle, cursor: "pointer" }}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="holding-sip-start-date" style={labelStyle}>
                        Start date
                      </label>
                      <input id="holding-sip-start-date" type="date" {...register("sip_start_date")} style={inputStyle} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "1.125rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: submitting ? "var(--bg-secondary)" : "var(--primary)",
              color: submitting ? "var(--text-muted)" : "var(--text-inverse)",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            {submitting ? "Adding..." : "Add Holding"}
          </button>
        </div>
      </form>
    </div>
  );
}
