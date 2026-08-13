import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createHolding, createTransaction, createValuation, searchSymbols, searchCrypto, fetchHouseholds, ApiError } from "../api";
import { useQuery } from "@tanstack/react-query";
import Toast from "./Toast";
import { ASSET_TYPE_OPTIONS, COUNTRIES, CURRENCIES, isQuantityBased } from "../constants/enums";
import { currencyForCountry } from "../utils/formatters";

const inputStyle = {
  width: "100%",
  padding: "0.875rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};

const labelStyle = {
  display: "block",
  marginBottom: "0.625rem",
  fontWeight: 500,
  fontSize: "0.875rem",
  color: "var(--text)",
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

export default function AddHolding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [assetType, setAssetType] = useState("stock");
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    country: "",
    account: "",
    institution: "",
    currency: "",
    interest_rate: "",
    maturity_date: "",
    household_id: "",
    is_private: false,
    notes: "",
    tags: "",
    // initial entry fields
    date: new Date().toISOString().split("T")[0],
    quantity: "",
    price_per_unit: "",
    value: "",
  });
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds });

  const quantityBased = isQuantityBased(assetType);

  useEffect(() => {
    if (form.country && !form.currency) {
      setForm((f) => ({ ...f, currency: currencyForCountry(form.country) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.country]);

  const createHoldingMutation = useMutation({
    mutationFn: async () => {
      const holdingPayload = {
        asset_type: assetType,
        symbol: assetType === "commodity" ? form.symbol : (form.symbol || null),
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
      if (assetType === "fixed_deposit" || assetType === "ppf" || assetType === "epf") {
        if (form.interest_rate) holdingPayload.interest_rate = parseFloat(form.interest_rate);
        if (form.maturity_date) holdingPayload.maturity_date = form.maturity_date;
      }

      const holding = await createHolding(holdingPayload);

      if (quantityBased) {
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
      setToast({ visible: true, message: "Holding added! ✔", type: "success" });
      setTimeout(() => navigate("/portfolio"), 1200);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to add holding";
      setError(message);
      setToast({ visible: true, message, type: "error" });
    },
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  }

  async function handleSymbolSearch(query) {
    if (!query || query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const results = assetType === "crypto" ? await searchCrypto(query) : await searchSymbols(query, form.country, assetType);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch {
      setSuggestions([]);
    }
  }

  function handleSymbolChange(e) {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, symbol: value }));
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSymbolSearch(value.trim()), 300);
  }

  function selectSuggestion(s) {
    setForm((prev) => ({ ...prev, symbol: s.symbol, name: s.description || s.displaySymbol || s.symbol }));
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

  function isFormValid() {
    if (!form.country || !form.date) return false;
    if (["stock", "mutual_fund", "crypto"].includes(assetType) && !form.symbol) return false;
    if (assetType === "commodity" && !form.symbol) return false;
    if (["real_estate", "fixed_deposit", "ppf", "epf", "cash", "loan"].includes(assetType) && !form.name && !form.institution) return false;
    if (quantityBased) {
      return form.quantity && form.price_per_unit && parseFloat(form.quantity) > 0 && parseFloat(form.price_per_unit) >= 0;
    }
    return form.value && parseFloat(form.value) >= 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!isFormValid()) {
      setError("Please fill in the required fields");
      return;
    }
    createHoldingMutation.mutate();
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ marginBottom: "2.5rem", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)" }}>Add Holding</h2>

      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={() => setToast({ ...toast, visible: false })} />

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>What are you adding?</h3>
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select
                value={assetType}
                onChange={(e) => {
                  setAssetType(e.target.value);
                  setForm((f) => ({ ...f, symbol: "", name: "" }));
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
              <select name="country" value={form.country} onChange={handleChange} required style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Currency</label>
              <select name="currency" value={form.currency} onChange={handleChange} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Auto (from country)</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Account</label>
              <input name="account" value={form.account} onChange={handleChange} placeholder="e.g., Schwab Brokerage" style={inputStyle} />
            </div>

            {households && households.length > 0 && (
              <div>
                <label style={labelStyle}>Share with household</label>
                <select name="household_id" value={form.household_id} onChange={handleChange} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Keep private</option>
                  {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Details</h3>

          {(assetType === "stock" || assetType === "mutual_fund" || assetType === "crypto") && (
            <div style={{ position: "relative", marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Symbol *</label>
              <input
                ref={symbolInputRef}
                name="symbol"
                value={form.symbol}
                onChange={handleSymbolChange}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={assetType === "crypto" ? "e.g., Bitcoin" : "e.g., AAPL"}
                style={inputStyle}
                autoComplete="off"
                required
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
            </div>
          )}

          {assetType === "commodity" && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Metal *</label>
              <select name="symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value, name: METALS.find((m) => m.value === e.target.value)?.label || "" })} style={{ ...inputStyle, cursor: "pointer" }} required>
                <option value="">Select metal...</option>
                {METALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}

          {["real_estate", "fixed_deposit", "ppf", "epf", "cash", "loan"].includes(assetType) && (
            <div style={{ display: "grid", gap: "1.5rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input name="name" value={form.name} onChange={handleChange} placeholder={assetType === "real_estate" ? "e.g., My House" : "e.g., HDFC FD #1"} style={inputStyle} />
              </div>
              {assetType !== "real_estate" && (
                <div>
                  <label style={labelStyle}>Institution</label>
                  <input name="institution" value={form.institution} onChange={handleChange} placeholder="e.g., Chase Bank" style={inputStyle} />
                </div>
              )}
              {(assetType === "fixed_deposit" || assetType === "ppf" || assetType === "epf") && (
                <>
                  <div>
                    <label style={labelStyle}>Interest Rate (%)</label>
                    <input type="number" step="0.01" name="interest_rate" value={form.interest_rate} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Maturity Date</label>
                    <input type="date" name="maturity_date" value={form.maturity_date} onChange={handleChange} style={inputStyle} />
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
            <div>
              <label style={labelStyle}>{quantityBased ? "Purchase Date *" : "Date *"}</label>
              <input type="date" name="date" value={form.date} max={new Date().toISOString().split("T")[0]} onChange={handleChange} style={inputStyle} required />
            </div>
            {quantityBased ? (
              <>
                <div>
                  <label style={labelStyle}>Quantity *</label>
                  <input type="number" step="any" min="0.0001" name="quantity" value={form.quantity} onChange={handleChange} style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Price / unit *</label>
                  <input type="number" step="any" min="0" name="price_per_unit" value={form.price_per_unit} onChange={handleChange} style={inputStyle} required />
                </div>
              </>
            ) : (
              <div>
                <label style={labelStyle}>{assetType === "loan" ? "Amount Owed *" : "Value *"}</label>
                <input type="number" step="any" min="0" name="value" value={form.value} onChange={handleChange} style={inputStyle} required />
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)" }}>Optional</h3>
          <div style={{ display: "grid", gap: "1.5rem", marginBottom: "2rem" }}>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>Tags</label>
              <input name="tags" value={form.tags} onChange={handleChange} placeholder="retirement, long-term" style={inputStyle} />
            </div>
          </div>

          {error && (
            <div style={{ padding: "1rem 1.25rem", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: "var(--radius)", color: "var(--danger)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={createHoldingMutation.isPending || !isFormValid()}
            style={{
              width: "100%", padding: "1.125rem", borderRadius: "var(--radius)", border: "none",
              background: createHoldingMutation.isPending || !isFormValid() ? "var(--bg-secondary)" : "var(--primary)",
              color: createHoldingMutation.isPending || !isFormValid() ? "var(--text-muted)" : "var(--text-inverse)",
              cursor: createHoldingMutation.isPending || !isFormValid() ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "1rem",
            }}
          >
            {createHoldingMutation.isPending ? "Adding..." : "Add Holding"}
          </button>
        </div>
      </form>
    </div>
  );
}
