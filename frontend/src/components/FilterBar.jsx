/**
 * Reusable filter bar component
 * Filters by asset type, country, and account
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAssets } from "../api";
import { ASSET_TYPE_OPTIONS, COUNTRIES } from "../constants/enums";

export default function FilterBar({ onFilterChange, showAssetType = true, showCountry = true, showAccount = true, showTagSearch = true }) {
  const [filters, setFilters] = useState({
    assetType: "",
    country: "",
    account: "",
    tag: "",
  });
  
  const [tagSearchInput, setTagSearchInput] = useState("");

  // Fetch assets to get unique values for filters
  const { data: allAssets } = useQuery({
    queryKey: ["assets"],
    queryFn: fetchAssets,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Use shared constants for dropdowns, but also get unique values from existing assets
  // This allows filtering by values in the database while providing consistent options
  const existingCountries = allAssets
    ? [...new Set(allAssets.map((a) => a.country).filter(Boolean))]
    : [];
  
  const existingAccounts = allAssets
    ? [...new Set(allAssets.map((a) => a.account).filter(Boolean))]
    : [];

  // Combine shared constants with existing values, prioritizing shared constants
  const countryOptions = [...new Set([...COUNTRIES, ...existingCountries])].sort();
  const accountOptions = existingAccounts.sort();

  // Extract all unique tags from assets
  const allTags = allAssets
    ? [...new Set(allAssets.flatMap((a) => a.tags || []).filter(Boolean))].sort()
    : [];

  function handleFilterChange(key, value) {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  }

  function handleTagSearch(value) {
    setTagSearchInput(value);
    handleFilterChange("tag", value);
  }

  function clearFilters() {
    const clearedFilters = { assetType: "", country: "", account: "", tag: "" };
    setFilters(clearedFilters);
    setTagSearchInput("");
    onFilterChange(clearedFilters);
  }

  const hasActiveFilters = filters.assetType || filters.country || filters.account || filters.tag;

  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "1.25rem 1.5rem",
        background: "var(--card)",
        borderRadius: "var(--radius-md)",
        marginBottom: "1.5rem",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        transition: "all 0.2s ease",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.875rem", letterSpacing: "0.02em" }}>Filters:</span>

      {showAssetType && (
        <select
          value={filters.assetType}
          onChange={(e) => handleFilterChange("assetType", e.target.value)}
          style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--primary)";
            e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
            e.target.style.background = "var(--card)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--border)";
            e.target.style.boxShadow = "none";
            e.target.style.background = "var(--bg)";
          }}
        >
          <option value="">All Asset Types</option>
          {ASSET_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {showCountry && (
        <select
          value={filters.country}
          onChange={(e) => handleFilterChange("country", e.target.value)}
          style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--primary)";
            e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
            e.target.style.background = "var(--card)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--border)";
            e.target.style.boxShadow = "none";
            e.target.style.background = "var(--bg)";
          }}
        >
          <option value="">All Countries</option>
          {countryOptions.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      )}

      {showAccount && (
        <select
          value={filters.account}
          onChange={(e) => handleFilterChange("account", e.target.value)}
          style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--primary)";
            e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
            e.target.style.background = "var(--card)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--border)";
            e.target.style.boxShadow = "none";
            e.target.style.background = "var(--bg)";
          }}
        >
          <option value="">All Accounts</option>
          {accountOptions.map((account) => (
            <option key={account} value={account}>
              {account}
            </option>
          ))}
        </select>
      )}

      {showTagSearch && (
        <div style={{ position: "relative", flex: "1", minWidth: "200px" }}>
          <input
            type="text"
            placeholder="Search by tag..."
            value={tagSearchInput}
            onChange={(e) => handleTagSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "0.625rem 0.875rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "0.875rem",
              transition: "all 0.2s ease",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--primary)";
              e.target.style.boxShadow = "0 0 0 3px var(--primary-light)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border)";
              e.target.style.boxShadow = "none";
            }}
          />
          {allTags.length > 0 && tagSearchInput && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                marginTop: "0.25rem",
                maxHeight: "200px",
                overflowY: "auto",
                zIndex: 100,
                boxShadow: "var(--shadow-md)",
              }}
            >
              {allTags
                .filter((tag) => tag.toLowerCase().includes(tagSearchInput.toLowerCase()))
                .slice(0, 5)
                .map((tag) => (
                  <div
                    key={tag}
                    onClick={() => handleTagSearch(tag)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-light)",
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.target.style.background = "var(--primary-light)")}
                    onMouseLeave={(e) => (e.target.style.background = "transparent")}
                  >
                    {tag}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          style={{
            padding: "0.625rem 1rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "var(--bg-secondary)";
            e.target.style.color = "var(--text)";
            e.target.style.borderColor = "var(--border-dark)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "transparent";
            e.target.style.color = "var(--text-secondary)";
            e.target.style.borderColor = "var(--border)";
          }}
        >
          Clear Filters
        </button>
      )}

      {hasActiveFilters && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto", fontWeight: 500 }}>
          {filters.assetType && (
            <span style={{ 
              padding: "0.25rem 0.5rem", 
              background: "var(--primary-light)", 
              color: "var(--primary)",
              borderRadius: "var(--radius-sm)",
              marginRight: "0.5rem",
              fontSize: "0.75rem",
            }}>
              Type: {ASSET_TYPE_OPTIONS.find(o => o.value === filters.assetType)?.label || filters.assetType}
            </span>
          )}
          {filters.country && (
            <span style={{ 
              padding: "0.25rem 0.5rem", 
              background: "var(--primary-light)", 
              color: "var(--primary)",
              borderRadius: "var(--radius-sm)",
              marginRight: "0.5rem",
              fontSize: "0.75rem",
            }}>
              Country: {filters.country}
            </span>
          )}
          {filters.account && (
            <span style={{ 
              padding: "0.25rem 0.5rem", 
              background: "var(--primary-light)", 
              color: "var(--primary)",
              borderRadius: "var(--radius-sm)",
              marginRight: "0.5rem",
              fontSize: "0.75rem",
            }}>
              Account: {filters.account}
            </span>
          )}
          {filters.tag && (
            <span style={{ 
              padding: "0.25rem 0.5rem", 
              background: "var(--primary-light)", 
              color: "var(--primary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
            }}>
              Tag: {filters.tag}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
