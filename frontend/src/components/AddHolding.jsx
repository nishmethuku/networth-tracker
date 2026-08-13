import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createHolding, createTransaction, createValuation, searchSymbols, searchCrypto, fetchHouseholds, ApiError } from "../api";
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
const NAME_BASED_SET = new Set(["real_estate", "fixed_deposit", "ppf", "epf", "cash", "loan"]);

function FieldError({ message }) {
  if (!message) return null;
  return <p style={errorTextStyle}>{message}</p>;
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
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(holdingSchema),
    mode: "onBlur",
    defaultValues: {
      assetType: "stock",
      country: "",
      currency: "",
      account: "",
      household_id: "",
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

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds, staleTime: 1000 * 60 * 5 });

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
        symbol: form.assetType === "commodity" ? form.symbol : (form.symbol || null),
        name: form.name || form.symbol,
        country: form.country,
        account: form.account || "Account 1",
        institution: form.institution || null,
        currency: form.currency || "USD",
        household_id: form.household_id || null,
        is_private: form.is_private,
        notes: form.notes || null,
        tags: form.tags || null,
      };
      if (form.assetType === "fixed_deposit" || form.assetType === "ppf" || form.assetType === "epf") {
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
        await createTransaction(holding.id, {
          transaction_type: "buy",
          transaction_date: form.date,
          quantity: parseFloat(form.quantity),
          price_per_unit: parseFloat(form.price_per_unit),
          currency: form.currency || "USD",
        });
      } else {
        await createValuation(holding.id, {
          valuation_date: form.date,
          value: parseFloat(form.value),
          currency: form.currency || "USD",
        });
      }
      return holding;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Holding added! ✔");
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
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) && symbolInputRef.current && !symbolInputRef.current.contains(event.target)) {
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>What are you adding?</h3>
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select
                {...register("assetType")}
                onChange={(e) => {
                  setValue("assetType", e.target.value);
                  setValue("symbol", "");
                  setValue("name", "");
                }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {ASSET_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Country *</label>
              <select {...register("country")} style={{ ...(errors.country ? inputErrorStyle : inputStyle), cursor: "pointer" }}>
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <FieldError message={errors.country?.message} />
            </div>

            <div>
              <label style={labelStyle}>Currency</label>
              <select {...register("currency")} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Auto (from country)</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Account</label>
              <input {...register("account")} placeholder="e.g., Schwab Brokerage" style={inputStyle} />
            </div>

            {households && households.length > 0 && (
              <div>
                <label style={labelStyle}>Share with household</label>
                <select {...register("household_id")} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Keep private</option>
                  {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Details</h3>

          {QUANTITY_BASED_SET.has(assetType) && assetType !== "commodity" && (
            <div style={{ position: "relative", marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Symbol *</label>
              <input
                ref={symbolInputRef}
                value={symbol}
                onChange={handleSymbolChange}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={assetType === "crypto" ? "e.g., Bitcoin" : "e.g., AAPL"}
                style={errors.symbol ? inputErrorStyle : inputStyle}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div ref={suggestionsRef} style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "0.25rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", zIndex: 1000, maxHeight: 260, overflowY: "auto" }}>
                  {suggestions.map((s, i) => (
                    <div key={i} onClick={() => selectSuggestion(s)} style={{ padding: "0.75rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600 }}>{s.displaySymbol || s.symbol}</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{s.description}</div>
                    </div>
                  ))}
                </div>
              )}
              <FieldError message={errors.symbol?.message} />
            </div>
          )}

          {assetType === "commodity" && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Metal *</label>
              <select
                value={symbol}
                onChange={(e) => {
                  setValue("symbol", e.target.value, { shouldValidate: true });
                  setValue("name", METALS.find((m) => m.value === e.target.value)?.label || "");
                }}
                style={{ ...(errors.symbol ? inputErrorStyle : inputStyle), cursor: "pointer" }}
              >
                <option value="">Select metal...</option>
                {METALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <FieldError message={errors.symbol?.message} />
            </div>
          )}

          {NAME_BASED_SET.has(assetType) && (
            <div style={{ display: "grid", gap: "1.5rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input {...register("name")} placeholder={assetType === "real_estate" ? "e.g., My House" : "e.g., HDFC FD #1"} style={errors.name ? inputErrorStyle : inputStyle} />
                <FieldError message={errors.name?.message} />
              </div>
              {assetType !== "real_estate" && (
                <div>
                  <label style={labelStyle}>Institution</label>
                  <input {...register("institution")} placeholder="e.g., Chase Bank" style={inputStyle} />
                </div>
              )}
              {(assetType === "fixed_deposit" || assetType === "ppf" || assetType === "epf") && (
                <>
                  <div>
                    <label style={labelStyle}>Interest Rate (%)</label>
                    <NumericInput control={control} name="interest_rate" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Maturity Date</label>
                    <input type="date" {...register("maturity_date")} style={inputStyle} />
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
            <div>
              <label style={labelStyle}>{quantityBased ? "Purchase Date *" : "Date *"}</label>
              <input type="date" {...register("date")} max={new Date().toISOString().split("T")[0]} style={errors.date ? inputErrorStyle : inputStyle} />
              <FieldError message={errors.date?.message} />
            </div>
            {quantityBased ? (
              <>
                <div>
                  <label style={labelStyle}>Quantity *</label>
                  <NumericInput control={control} name="quantity" style={errors.quantity ? inputErrorStyle : inputStyle} />
                  <FieldError message={errors.quantity?.message} />
                </div>
                <div>
                  <label style={labelStyle}>Price / unit *</label>
                  <NumericInput control={control} name="price_per_unit" style={errors.price_per_unit ? inputErrorStyle : inputStyle} />
                  <FieldError message={errors.price_per_unit?.message} />
                </div>
              </>
            ) : (
              <div>
                <label style={labelStyle}>{assetType === "loan" ? "Amount Owed *" : "Value *"}</label>
                <NumericInput control={control} name="value" style={errors.value ? inputErrorStyle : inputStyle} />
                <FieldError message={errors.value?.message} />
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Optional</h3>
          <div style={{ display: "grid", gap: "1.5rem", marginBottom: "2rem" }}>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea {...register("notes")} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>Tags</label>
              <input {...register("tags")} placeholder="retirement, long-term" style={inputStyle} />
            </div>

            {quantityBased && (
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, color: "var(--text)" }}>
                  <input type="checkbox" {...register("sip_enabled")} />
                  This is a recurring investment (SIP)
                </label>
                {sipEnabled && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
                    <div>
                      <label style={labelStyle}>Amount per contribution</label>
                      <NumericInput control={control} name="sip_amount" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Frequency</label>
                      <select {...register("sip_frequency")} style={{ ...inputStyle, cursor: "pointer" }}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Start date</label>
                      <input type="date" {...register("sip_start_date")} style={inputStyle} />
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
              width: "100%", padding: "1.125rem", borderRadius: "var(--radius)", border: "none",
              background: submitting ? "var(--bg-secondary)" : "var(--primary)",
              color: submitting ? "var(--text-muted)" : "var(--text-inverse)",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "1rem",
            }}
          >
            {submitting ? "Adding..." : "Add Holding"}
          </button>
        </div>
      </form>
    </div>
  );
}
