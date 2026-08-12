import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { fetchAsset, updateAsset, ApiError } from "../api";
import Toast from "./Toast";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import { safeNumber } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, COUNTRIES, ACCOUNT_TYPES } from "../constants/enums";

export default function EditAsset() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [assetType, setAssetType] = useState("cash");
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
    purchase_date: "",
    notes: "",
    tags: "",
  });
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });
  const [initialized, setInitialized] = useState(false);

  const {
    data: asset,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => fetchAsset(id),
  });

  useEffect(() => {
    if (asset && !initialized) {
      setAssetType(asset.assetType || "cash");
      setForm({
        symbol: asset.symbol || "",
        units: asset.units != null ? String(asset.units) : "",
        buy_price: asset.buyPrice != null ? String(asset.buyPrice) : "",
        name: asset.name || "",
        buy_value: asset.rawBuyValue != null ? String(asset.rawBuyValue) : "",
        current_value: asset.rawCurrentValue != null ? String(asset.rawCurrentValue) : "",
        institution: asset.institution || "",
        value: asset.value != null ? String(asset.value) : "",
        country: asset.country || "",
        account: asset.account || "",
        purchase_date: asset.purchaseDate || new Date().toISOString().split("T")[0],
        notes: asset.notes || "",
        tags: (asset.tags || []).join(", "),
      });
      setInitialized(true);
    }
  }, [asset, initialized]);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAsset(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      setToast({
        visible: true,
        message: "Asset updated successfully! ✔",
        type: "success",
      });
      setTimeout(() => {
        navigate("/assets");
      }, 1200);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to update asset");
      setToast({
        visible: true,
        message: err instanceof ApiError ? err.message : "Failed to update asset",
        type: "error",
      });
    },
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  }

  function validateForm() {
    if (!form.country.trim()) {
      setError("Country is required");
      return false;
    }
    if (!form.purchase_date) {
      setError("Purchase date is required");
      return false;
    }

    const purchaseDate = eDate(form.purchase_date);
    const today = new Date();
    if (purchaseDate > today) {
      setError("Purchase date cannot be in the future");
      return false;
    }

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
      const currentValue = parseFloat(form.current_value);
      if (isNaN(buyValue) || buyValue <= 0) {
        setError("Buy value must be a positive number");
        return false;
      }
      if (assetType === "metal") {
        if (isNaN(currentValue) || currentValue <= 0) {
          setError("Per unit price must be a positive number");
          return false;
        }
      } else if (assetType === "real_estate") {
        if (isNaN(currentValue) || currentValue <= 0) {
          setError("Current value must be a positive number");
          return false;
        }
      }
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      const value = parseFloat(form.value);
      if (isNaN(value) || value <= 0) {
        setError("Value must be a positive number");
        return false;
      }
      if (assetType !== "loan" && value <= 0) {
        setError("Value must be a positive number");
        return false;
      }
    }

    return true;
  }

  function isFormValid() {
    if (!form.country.trim() || !form.purchase_date) {
      return false;
    }

    if (assetType === "stock" || assetType === "mutual_fund") {
      if (!form.symbol.trim() || !form.units || !form.buy_price) return false;
      const units = parseFloat(form.units);
      const buyPrice = parseFloat(form.buy_price);
      if (isNaN(units) || units <= 0 || isNaN(buyPrice) || buyPrice <= 0) return false;
    }

    if (assetType === "real_estate" || assetType === "metal") {
      if (!form.name.trim() || !form.buy_value || !form.current_value) return false;
      const buyValue = parseFloat(form.buy_value);
      const currentValue = parseFloat(form.current_value);
      if (isNaN(buyValue) || buyValue <= 0 || isNaN(currentValue) || currentValue <= 0)
        return false;
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      if (!form.value) return false;
      const value = parseFloat(form.value);
      if (isNaN(value) || (assetType !== "loan" && value <= 0)) return false;
    }

    return true;
  }

  function eDate(d) {
    return new Date(d);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    const payload = {
      asset_type: assetType,
      country: form.country.trim(),
      account: form.account?.trim() || asset?.account || "",
      purchase_date: form.purchase_date,
    };

    if (assetType === "stock" || assetType === "mutual_fund") {
      payload.symbol = form.symbol.trim().toUpperCase();
      payload.units = safeNumber(form.units);
      payload.buy_price = safeNumber(form.buy_price);
    }

    if (assetType === "real_estate" || assetType === "metal") {
      payload.name = form.name.trim();
      payload.buy_value = safeNumber(form.buy_value);
      payload.current_value = safeNumber(form.current_value);
    }

    if (assetType === "cash" || assetType === "deposit" || assetType === "loan") {
      if (form.institution) {
        payload.institution = form.institution.trim();
      }
      payload.value = safeNumber(form.value);
    }

    if (form.notes) {
      payload.notes = form.notes.trim();
    }
    if (form.tags) {
      payload.tags = form.tags.trim();
    }

    updateMutation.mutate({ id, payload });
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

  const handleInputFocus = (e) => {
    e.target.style.borderColor = "var(--primary)";
    e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
  };

  const handleInputBlur = (e) => {
    e.target.style.borderColor = "var(--border)";
    e.target.style.boxShadow = "none";
  };

  if (isLoading || !initialized) {
    return <LoadingState message="Loading asset..." />;
  }

  if (isError || !asset) {
    return (
      <ErrorState
        error={fetchError instanceof ApiError ? fetchError.message : "Failed to load asset"}
        onRetry={refetch}
        message="Could not load asset for editing."
      />
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2
        style={{
          marginBottom: "2.5rem",
          fontSize: "1.75rem",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
        }}
      >
        Edit Asset
      </h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      <form onSubmit={handleSubmit}>
        {/* Top Section: Asset Type (read-only), Country */}
        <div style={sectionStyle}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "1.75rem",
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Basic Information
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
            <div>
              <label htmlFor="asset-type" style={labelStyle}>
                Asset Type
              </label>
              <input
                id="asset-type"
                value={
                  ASSET_TYPE_OPTIONS.find((o) => o.value === assetType)?.label || assetType
                }
                readOnly
                style={{ ...inputStyle, background: "var(--bg-secondary)", cursor: "not-allowed" }}
              />
            </div>

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
          </div>
        </div>

        {/* Rest of the form is structurally identical to AddAsset but uses current state */}
        <div style={sectionStyle}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "1.75rem",
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Asset Details
          </h3>

          <div style={{ marginBottom: "2rem" }}>
            <label htmlFor="purchase-date" style={labelStyle}>
              Purchase Date *
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

          {(assetType === "stock" || assetType === "mutual_fund") && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.5rem",
              }}
            >
              <div>
                <label htmlFor="symbol" style={labelStyle}>
                  Symbol *
                </label>
                <input
                  id="symbol"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label htmlFor="units" style={labelStyle}>
                  Units *
                </label>
                <input
                  id="units"
                  name="units"
                  type="number"
                  step="0.01"
                  value={form.units}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label htmlFor="buy_price" style={labelStyle}>
                  Buy Price *
                </label>
                <input
                  id="buy_price"
                  name="buy_price"
                  type="number"
                  step="0.01"
                  value={form.buy_price}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}

          {(assetType === "real_estate" || assetType === "metal") && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.5rem",
              }}
            >
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
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label htmlFor="buy_value" style={labelStyle}>
                  Buy Value *
                </label>
                <input
                  id="buy_value"
                  name="buy_value"
                  type="number"
                  step="0.01"
                  value={form.buy_value}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {assetType === "real_estate" && (
                <div>
                  <label htmlFor="current_value" style={labelStyle}>
                    Current Value *
                  </label>
                  <input
                    id="current_value"
                    name="current_value"
                    type="number"
                    step="0.01"
                    value={form.current_value}
                    onChange={handleChange}
                    required
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}

              {assetType === "metal" && (
                <div>
                  <label htmlFor="current_value" style={labelStyle}>
                    Per Unit Price *
                  </label>
                  <input
                    id="current_value"
                    name="current_value"
                    type="number"
                    step="0.01"
                    value={form.current_value}
                    onChange={handleChange}
                    required
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}
            </div>
          )}

          {(assetType === "cash" || assetType === "deposit" || assetType === "loan") && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.5rem",
              }}
            >
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
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      (liability)
                    </span>
                  )}
                </label>
                <input
                  id="value"
                  name="value"
                  type="number"
                  step="0.01"
                  value={form.value}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "1.75rem",
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Notes & Tags
          </h3>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="notes" style={labelStyle}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "vertical",
              }}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="tags" style={labelStyle}>
              Tags
            </label>
            <input
              id="tags"
              name="tags"
              value={form.tags}
              onChange={handleChange}
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          </div>

          {error && (
            <div
              style={{
                color: "var(--danger)",
                fontSize: "0.9rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={updateMutation.isLoading || !isFormValid()}
          style={{
            padding: "0.9rem 1.4rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: updateMutation.isLoading ? "var(--border)" : "var(--primary)",
            color: "var(--text-inverse)",
            fontWeight: 600,
            cursor: updateMutation.isLoading ? "not-allowed" : "pointer",
          }}
        >
          {updateMutation.isLoading ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

