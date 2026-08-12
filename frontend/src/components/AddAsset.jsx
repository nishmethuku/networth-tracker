import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createAsset, ApiError, searchSymbols } from "../api";
import Toast from "./Toast";
import { safeNumber } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, COUNTRIES, ACCOUNT_TYPES } from "../constants/enums";

export default function AddAsset() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [assetType, setAssetType] = useState("cash"); // Default to first option in the list
  const [form, setForm] = useState({
    symbol: "",
    units: "",
    buy_price: "",
    name: "",
    buy_value: "",
    current_value: "",
    institution: "",
    value: "",
    country: "",
    account: "",
    purchase_date: new Date().toISOString().split("T")[0], // Default to today
    notes: "",
    tags: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });
  
  // Autocomplete state for symbol search
  const [symbolSuggestions, setSymbolSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingSymbols, setSearchingSymbols] = useState(false);
  const symbolInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const createMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      
      setToast({
        visible: true,
        message: "Asset added successfully! ✔",
        type: "success",
      });
      
      // Reset form
      setForm({
        symbol: "",
        units: "",
        buy_price: "",
        name: "",
        buy_value: "",
        current_value: "",
        institution: "",
        value: "",
        country: "",
        account: "",
        purchase_date: new Date().toISOString().split("T")[0],
        notes: "",
        tags: "",
      });
      
      // Optionally navigate to assets page
      setTimeout(() => {
        navigate("/assets");
      }, 1500);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to add asset");
      setToast({
        visible: true,
        message: err instanceof ApiError ? err.message : "Failed to add asset",
        type: "error",
      });
    },
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    
    // Trigger symbol search for symbol field
    if (name === "symbol" && (assetType === "stock" || assetType === "mutual_fund")) {
      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      // Debounce search - wait 300ms after user stops typing
      searchTimeoutRef.current = setTimeout(() => {
        if (value.trim().length >= 1) {
          handleSymbolSearch(value.trim());
        } else {
          setSymbolSuggestions([]);
          setShowSuggestions(false);
        }
      }, 300);
    }
    
    // If country changes and we have a symbol, re-search
    if (name === "country" && form.symbol && form.symbol.trim().length >= 1 && (assetType === "stock" || assetType === "mutual_fund")) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        handleSymbolSearch(form.symbol.trim());
      }, 300);
    }
  }
  
  async function handleSymbolSearch(query) {
    if (!query || query.length < 1) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setSearchingSymbols(true);
    try {
      // Pass asset_type to filter results (mutual_fund vs stock)
      const results = await searchSymbols(query, form.country, assetType);
      setSymbolSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (err) {
      console.error("Symbol search failed:", err);
      setSymbolSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSearchingSymbols(false);
    }
  }
  
  function handleSymbolSelect(suggestion) {
    let selectedSymbol = suggestion.symbol;
    
    // Handle different exchange types
    if (suggestion.exchange === "AMFI") {
      // For AMFI mutual funds, use the scheme code as-is (no suffix)
      selectedSymbol = suggestion.symbol; // Already the scheme code
    } else if (suggestion.exchange === "NSE" && selectedSymbol.endsWith(".NS")) {
      // For NSE stocks, keep .NS suffix
      selectedSymbol = selectedSymbol;
    } else {
      // For US stocks, use displaySymbol or clean symbol
      selectedSymbol = suggestion.displaySymbol || suggestion.symbol.replace(/\.NS$/, "");
    }
    
    setForm((prev) => ({ ...prev, symbol: selectedSymbol }));
    setShowSuggestions(false);
    setSymbolSuggestions([]);
    
    // Focus back on input
    if (symbolInputRef.current) {
      symbolInputRef.current.focus();
    }
  }
  
  // Close suggestions when clicking outside
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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  function validateForm() {
    // Common required fields
    if (!form.country.trim()) {
      setError("Country is required");
      return false;
    }
    if (!form.purchase_date) {
      const dateLabel = (assetType === "cash" || assetType === "deposit" || assetType === "loan") ? "Update date" : "Purchase date";
      setError(`${dateLabel} is required`);
      return false;
    }

    // Validate date (not in future)
    const purchaseDate = new Date(form.purchase_date);
    const today = new Date();
    if (purchaseDate > today) {
      const dateLabel = (assetType === "cash" || assetType === "deposit" || assetType === "loan") ? "Update date" : "Purchase date";
      setError(`${dateLabel} cannot be in the future`);
      return false;
    }

    // Asset-type-specific validation
    if (assetType === "stock" || assetType === "mutual_fund") {
      if (!form.symbol.trim()) {
        setError("Symbol is required for stocks/mutual funds");
        return false;
      }
      const units = parseFloat(form.units);
      const buyPrice = parseFloat(form.buy_price);
      
      if (isNaN(units) || units <= 0) {
        setError("Units must be a positive number");
        return false;
      }
      if (isNaN(buyPrice) || buyPrice <= 0) {
        setError("Buy price must be a positive number");
        return false;
      }
    }

    if (assetType === "real_estate" || assetType === "metal") {
      if (!form.name.trim()) {
        setError("Name is required");
        return false;
      }
      const buyValue = parseFloat(form.buy_value);
      
      if (isNaN(buyValue) || buyValue <= 0) {
        setError("Buy value must be a positive number");
        return false;
      }
      
      // Only validate current_value for metal, not real_estate
      if (assetType === "metal") {
        const currentValue = parseFloat(form.current_value);
        if (isNaN(currentValue) || currentValue <= 0) {
          setError("Per unit price must be a positive number");
          return false;
        }
      }
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      // Institution is required only for deposits and loans, not plain cash
      if (assetType !== "cash" && !form.institution.trim()) {
        setError("Institution is required");
        return false;
      }
      const value = parseFloat(form.value);
      
      if (isNaN(value) || value <= 0) {
        setError("Value must be a positive number");
        return false;
      }
      
      // Loans can have any value, but validate it's a number
      if (assetType === "loan" && isNaN(value)) {
        setError("Value must be a number");
        return false;
      }
    }

    return true;
  }

  function isFormValid() {
    // Check common required fields
    if (!form.country.trim() || !form.purchase_date) {
      return false;
    }

    // Check asset-type-specific required fields
    if (assetType === "stock" || assetType === "mutual_fund") {
      if (!form.symbol.trim() || !form.units || !form.buy_price) return false;
      const units = parseFloat(form.units);
      const buyPrice = parseFloat(form.buy_price);
      if (isNaN(units) || units <= 0 || isNaN(buyPrice) || buyPrice <= 0) return false;
    }

    if (assetType === "real_estate" || assetType === "metal") {
      if (!form.name.trim() || !form.buy_value) return false;
      const buyValue = parseFloat(form.buy_value);
      if (isNaN(buyValue) || buyValue <= 0) return false;
      
      // Only validate current_value for metal, not real_estate
      if (assetType === "metal") {
        if (!form.current_value) return false;
        const currentValue = parseFloat(form.current_value);
        if (isNaN(currentValue) || currentValue <= 0) return false;
      }
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      if (!form.value) return false;
      if (assetType !== "cash" && !form.institution.trim()) return false;
      const value = parseFloat(form.value);
      if (isNaN(value) || (assetType !== "loan" && value <= 0)) return false;
    }

    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    const payload = {
      asset_type: assetType,
      country: form.country.trim(),
      // Use provided account or default to "Account 1"
      account: form.account.trim() || "Account 1",
      purchase_date: form.purchase_date,
    };

    // Asset-type-specific fields
    if (assetType === "stock" || assetType === "mutual_fund") {
      payload.symbol = form.symbol.trim().toUpperCase();
      payload.units = safeNumber(form.units);
      payload.buy_price = safeNumber(form.buy_price);
    }

    if (assetType === "real_estate" || assetType === "metal") {
      payload.name = form.name.trim();
      payload.buy_value = safeNumber(form.buy_value);
      // Only include current_value for metal, not real_estate
      if (assetType === "metal") {
        payload.current_value = safeNumber(form.current_value);
      }
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      if (assetType !== "cash" && form.institution.trim()) {
        payload.institution = form.institution.trim();
      }
      payload.value = safeNumber(form.value);
    }

    // Add notes and tags
    if (form.notes) {
      payload.notes = form.notes.trim();
    }
    if (form.tags) {
      payload.tags = form.tags.trim(); // Comma-separated tags
    }

    createMutation.mutate(payload);
  }

  // Shared input/select styles
  const inputStyle = {
    width: "100%",
    padding: "0.875rem 1rem",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: "0.9375rem",
    lineHeight: "1.5",
    transition: "all 0.2s ease",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "0.625rem",
    fontWeight: 500,
    fontSize: "0.875rem",
    color: "var(--text)",
    letterSpacing: "0.01em",
  };

  const sectionStyle = {
    marginBottom: "2.5rem",
    paddingBottom: "2.5rem",
    borderBottom: "1px solid var(--border)",
  };

  // Focus handlers for inputs
  const handleInputFocus = (e) => {
    e.target.style.borderColor = "var(--primary)";
    e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
  };

  const handleInputBlur = (e) => {
    e.target.style.borderColor = "var(--border)";
    e.target.style.boxShadow = "none";
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ marginBottom: "2.5rem", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Add Asset</h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      <form onSubmit={handleSubmit}>
        {/* Top Section: Asset Type, Country, Account */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
            Basic Information
          </h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
            {/* Asset Type */}
            <div>
              <label htmlFor="asset-type" style={labelStyle}>
                Asset Type *
              </label>
              <select
                id="asset-type"
                value={assetType}
                onChange={(e) => {
                  setAssetType(e.target.value);
                  setError(null);
                }}
                required
                style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                <option value="">Select asset type...</option>
                {ASSET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Country */}
            <div>
              <label htmlFor="country" style={labelStyle}>
                Country *
              </label>
              <select
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
                required
                style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                <option value="">Select country...</option>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div>
              <label htmlFor="account" style={labelStyle}>
                Account
              </label>
              <input
                id="account"
                name="account"
                value={form.account}
                onChange={handleChange}
                placeholder="e.g., ICICI Account 1, Chase Bank"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: 0, lineHeight: "1.5" }}>
                Optional - defaults to "Account 1" if not provided
              </p>
            </div>
          </div>
        </div>

        {/* Middle Section: Purchase Date & Asset-Specific Fields */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
            Asset Details
          </h3>
          
          {/* Purchase Date / Update - Common for all */}
          <div style={{ marginBottom: "2rem" }}>
            <label htmlFor="purchase-date" style={labelStyle}>
              {assetType === "cash" || assetType === "deposit" || assetType === "loan" ? "Update *" : "Purchase Date *"}
            </label>
            <input
              id="purchase-date"
              type="date"
              name="purchase_date"
              value={form.purchase_date}
              onChange={handleChange}
              max={new Date().toISOString().split("T")[0]}
              required
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          </div>

          {/* Stocks / Mutual Funds */}
          {(assetType === "stock" || assetType === "mutual_fund") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
              <div style={{ position: "relative" }}>
                <label htmlFor="symbol" style={labelStyle}>
                  Symbol *
                </label>
                <input
                  ref={symbolInputRef}
                  id="symbol"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleChange}
                  onFocus={(e) => {
                    handleInputFocus(e);
                    if (symbolSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={handleInputBlur}
                  required
                  placeholder="e.g., AAPL"
                  style={inputStyle}
                  autoComplete="off"
                />
                {searchingSymbols && (
                  <div style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "2.5rem",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}>
                    Searching...
                  </div>
                )}
                {showSuggestions && symbolSuggestions.length > 0 && (
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
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {symbolSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        onClick={() => handleSymbolSelect(suggestion)}
                        style={{
                          padding: "0.75rem 1rem",
                          cursor: "pointer",
                          borderBottom: index < symbolSuggestions.length - 1 ? "1px solid var(--border)" : "none",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "var(--bg-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "var(--card)";
                        }}
                      >
                        <div style={{
                          fontWeight: 600,
                          color: "var(--text)",
                          fontSize: "0.9375rem",
                          marginBottom: "0.25rem",
                        }}>
                          {suggestion.displaySymbol || suggestion.symbol}
                        </div>
                        {suggestion.description && (
                          <div style={{
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary)",
                          }}>
                            {suggestion.description}
                          </div>
                        )}
                        <div style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginTop: "0.25rem",
                        }}>
                          {suggestion.exchange} • {suggestion.country}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="units" style={labelStyle}>
                  Units *
                </label>
                <input
                  id="units"
                  name="units"
                  type="number"
                  step="any"
                  min="0.0001"
                  value={form.units}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 10"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label htmlFor="buy-price" style={labelStyle}>
                  Buy Price *
                </label>
                <input
                  id="buy-price"
                  name="buy_price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.buy_price}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 150.50"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}

          {/* Real Estate / Metal */}
          {(assetType === "real_estate" || assetType === "metal") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
              <div>
                <label htmlFor="name" style={labelStyle}>
                  Name *
                </label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., My House, Gold Bar"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label htmlFor="buy-value" style={labelStyle}>
                  Buy Value *
                </label>
                <input
                  id="buy-value"
                  name="buy_value"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.buy_value}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 200000"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {assetType === "metal" && (
                <div>
                  <label htmlFor="current-value" style={labelStyle}>
                    Per Unit Price *
                  </label>
                  <input
                    id="current-value"
                    name="current_value"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.current_value}
                    onChange={handleChange}
                    required
                    placeholder="e.g., 2500"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cash / Deposits / Loans */}
          {(assetType === "cash" ||
            assetType === "deposit" ||
            assetType === "loan") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
              {/* Institution only for deposits and loans */}
              {assetType !== "cash" && (
                <div>
                  <label htmlFor="institution" style={labelStyle}>
                    Institution *
                  </label>
                  <input
                    id="institution"
                    name="institution"
                    value={form.institution}
                    onChange={handleChange}
                    required={assetType !== "cash"}
                    placeholder="e.g., Chase Bank, Vanguard"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}

              <div>
                <label htmlFor="value" style={labelStyle}>
                  Value *{" "}
                  {assetType === "loan" && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      (liability)
                    </span>
                  )}
                </label>
                <input
                  id="value"
                  name="value"
                  type="number"
                  step="0.01"
                  min={assetType === "loan" ? undefined : "0.01"}
                  value={form.value}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 10000"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section: Notes, Tags, Submit */}
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.75rem", color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
            Additional Information (Optional)
          </h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem", marginBottom: "2.5rem" }}>
            <div>
              <label htmlFor="notes" style={labelStyle}>
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={5}
                placeholder="Add any notes about this asset (e.g., investment strategy, goals, etc.)"
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "inherit",
                  minHeight: "120px",
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            <div>
              <label htmlFor="tags" style={labelStyle}>
                Tags
              </label>
              <input
                id="tags"
                name="tags"
                value={form.tags}
                onChange={handleChange}
                placeholder="e.g., retirement, long-term, dividend"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.625rem", marginBottom: 0, lineHeight: "1.5" }}>
                Separate multiple tags with commas
              </p>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "var(--danger-light)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius)",
                color: "var(--danger)",
                marginBottom: "2rem",
                fontSize: "0.875rem",
                lineHeight: "1.5",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={createMutation.isPending || !isFormValid()}
            style={{
              width: "100%",
              padding: "1.125rem 1.5rem",
              borderRadius: "var(--radius)",
              background:
                createMutation.isPending || !isFormValid()
                  ? "var(--bg-secondary)"
                  : "var(--primary)",
              color: createMutation.isPending || !isFormValid() ? "var(--text-muted)" : "var(--text-inverse)",
              border: "none",
              cursor:
                createMutation.isPending || !isFormValid()
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 600,
              fontSize: "1rem",
              letterSpacing: "0.01em",
              transition: "all 0.2s ease",
              opacity: createMutation.isPending || !isFormValid() ? 0.6 : 1,
              boxShadow: createMutation.isPending || !isFormValid() ? "none" : "var(--shadow)",
            }}
            onMouseEnter={(e) => {
              if (!createMutation.isPending && isFormValid()) {
                e.target.style.background = "var(--primary-hover)";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "var(--shadow-md)";
              }
            }}
            onMouseLeave={(e) => {
              if (!createMutation.isPending && isFormValid()) {
                e.target.style.background = "var(--primary)";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "var(--shadow)";
              }
            }}
          >
            {createMutation.isPending ? "Adding Asset..." : "Add Asset"}
          </button>
        </div>
      </form>
    </div>
  );
}
