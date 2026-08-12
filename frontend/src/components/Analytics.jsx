import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  CartesianGrid,
} from "recharts";
import { fetchAnalytics, fetchAssets, ApiError } from "../api";
import { formatCurrency, formatPercent, safeNumber, formatCurrencyCompact, convertCountryValueToDisplay, formatCompactNumber, convertCurrency } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, getAssetTypeLabel } from "../constants/enums";

const COLORS = ["#2563eb", "#16a34a", "#f97316", "#e11d48", "#22c55e", "#a855f7"];

const TIME_RANGES = [
  { value: "all", label: "All Time" },
  { value: "1d", label: "1 Day" },
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "2y", label: "2 Years" },
  { value: "5y", label: "5 Years" },
];

export default function Analytics() {
  console.log("[Analytics] Component rendering...");
  
  const [timeRange, setTimeRange] = useState("all");
  const [timeSeriesFilter, setTimeSeriesFilter] = useState("all");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [allocationTimeRange, setAllocationTimeRange] = useState("all");
  const [cagrFilter, setCagrFilter] = useState("all");
  const [displayCurrency, setDisplayCurrency] = useState("INR"); // USD or INR (default: INR)

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["analytics"],
    queryFn: fetchAnalytics,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch all assets for time series calculation (needed for both "all" and filtered views)
  const { data: allAssets } = useQuery({
    queryKey: ["assets"],
    queryFn: () => fetchAssets({}),
    enabled: true, // Always fetch to calculate per-asset-type values
  });
  const hasAnalytics = !!analytics;

  // Filter analytics data based on asset type filters, time range, and currency
  const filteredAllocation = useMemo(() => {
    try {
      // If we need time-based allocation, calculate it from allAssets
      if (allocationTimeRange !== "all" || displayCurrency !== "USD") {
        if (!allAssets || !Array.isArray(allAssets) || allAssets.length === 0) {
          return [];
        }

        // Calculate cutoff date based on time range
        let cutoffDate = null;
        if (allocationTimeRange !== "all") {
          const now = new Date();
          cutoffDate = new Date();
          
          switch (allocationTimeRange) {
            case "1d": cutoffDate.setDate(now.getDate() - 1); break;
            case "1m": cutoffDate.setMonth(now.getMonth() - 1); break;
            case "3m": cutoffDate.setMonth(now.getMonth() - 3); break;
            case "6m": cutoffDate.setMonth(now.getMonth() - 6); break;
            case "1y": cutoffDate.setFullYear(now.getFullYear() - 1); break;
            case "2y": cutoffDate.setFullYear(now.getFullYear() - 2); break;
            case "5y": cutoffDate.setFullYear(now.getFullYear() - 5); break;
          }
        }

        // Calculate allocation from assets
        const allocationMap = {};
        
        for (const asset of allAssets) {
          // Filter by time range
          if (cutoffDate) {
            const purchaseDate = asset.purchaseDate ? new Date(asset.purchaseDate) : new Date();
            if (purchaseDate > cutoffDate) {
              continue; // Skip assets purchased after cutoff date
            }
          }

          // Filter by asset type if needed
          if (allocationFilter !== "all" && asset.assetType !== allocationFilter) {
            continue;
          }

          const assetType = asset.assetType || "unknown";
          const assetValue = safeNumber(asset.currentValue || 0);
          
          // Convert to display currency
          const country = asset.country || "United States";
          let convertedValue = assetValue;
          try {
            convertedValue = convertCountryValueToDisplay(assetValue, country, displayCurrency);
          } catch (e) {
            console.error("Error converting currency for allocation:", e);
          }

          if (!allocationMap[assetType]) {
            allocationMap[assetType] = 0;
          }
          allocationMap[assetType] += safeNumber(convertedValue);
        }

        // Convert to array format
        const allocation = Object.entries(allocationMap)
          .map(([label, value]) => ({ label, value: safeNumber(value) }))
          .filter(item => item.value > 0);

        return allocation;
      }

      // Fallback to backend allocation data (current snapshot, USD)
      if (!analytics?.allocation || !Array.isArray(analytics.allocation)) return [];
      
      let allocation = analytics.allocation;
      
      // Filter by asset type if needed
      if (allocationFilter !== "all") {
        allocation = allocation.filter((item) => item && item.label === allocationFilter);
      }

      // Convert to display currency
      if (displayCurrency !== "USD") {
        // For backend allocation, we need to convert from USD to display currency
        // Since we don't know the country breakdown, we'll convert assuming USD base
        allocation = allocation.map(item => {
          try {
            const convertedValue = convertCurrency(safeNumber(item.value), "USD", displayCurrency);
            return { ...item, value: safeNumber(convertedValue) };
          } catch (e) {
            console.error("Error converting allocation currency:", e);
            return item;
          }
        });
      }

      return allocation;
    } catch (e) {
      console.error("Error filtering allocation:", e);
      return [];
    }
  }, [analytics?.allocation, allocationFilter, allocationTimeRange, allAssets, displayCurrency]);

  const filteredCagrHistogram = useMemo(() => {
    try {
      if (!analytics?.cagrHistogram || !Array.isArray(analytics.cagrHistogram)) return [];
      if (cagrFilter === "all") return analytics.cagrHistogram;
      return analytics.cagrHistogram.filter((item) => item && item.assetType === cagrFilter);
    } catch (e) {
      console.error("Error filtering CAGR histogram:", e);
      return [];
    }
  }, [analytics?.cagrHistogram, cagrFilter]);

  // Calculate filtered time series with net worth and per-asset-type values
  const filteredTimeSeries = useMemo(() => {
    try {
      // If filtering by specific asset type, show only that type
      if (timeSeriesFilter !== "all") {
        // If allAssets is not loaded yet, return empty array
        if (!allAssets || !Array.isArray(allAssets)) {
          return [];
        }

        const filteredAssets = allAssets.filter(
          (asset) => asset && asset.assetType === timeSeriesFilter
        );

        if (filteredAssets.length === 0) return [];

        // Sort by purchase date
        const sortedAssets = [...filteredAssets].sort(
          (a, b) => {
            const dateA = a.purchaseDate ? new Date(a.purchaseDate) : new Date(0);
            const dateB = b.purchaseDate ? new Date(b.purchaseDate) : new Date(0);
            return dateA - dateB;
          }
        );

        // Get unique dates, filtering out invalid dates
        const uniqueDates = [...new Set(
          sortedAssets
            .map((a) => a.purchaseDate)
            .filter((date) => date && date !== "")
        )].sort();

        if (uniqueDates.length === 0) return [];

        // Calculate cumulative values for this asset type
        const timeSeries = [];
        for (const dateStr of uniqueDates) {
          if (!dateStr) continue;
          
          let value = 0;

        for (const asset of sortedAssets) {
          if (asset.purchaseDate && new Date(asset.purchaseDate) <= new Date(dateStr)) {
            try {
              const assetValue = safeNumber(asset.currentValue || 0);
              // Convert to display currency
              const country = asset.country || "United States";
              const convertedValue = convertCountryValueToDisplay(assetValue, country, displayCurrency);
              value += safeNumber(convertedValue);
            } catch (e) {
              console.error("Error converting currency for asset:", e, asset);
              // Fallback: use original value
              value += safeNumber(asset.currentValue || 0);
            }
          }
        }

          timeSeries.push({
            date: dateStr,
            [timeSeriesFilter]: value,
          });
        }

        // Apply time range filter
        if (timeRange !== "all" && timeSeries.length > 0) {
          const now = new Date();
          const cutoffDate = new Date();
          
          switch (timeRange) {
            case "1d": cutoffDate.setDate(now.getDate() - 1); break;
            case "1m": cutoffDate.setMonth(now.getMonth() - 1); break;
            case "3m": cutoffDate.setMonth(now.getMonth() - 3); break;
            case "6m": cutoffDate.setMonth(now.getMonth() - 6); break;
            case "1y": cutoffDate.setFullYear(now.getFullYear() - 1); break;
            case "2y": cutoffDate.setFullYear(now.getFullYear() - 2); break;
            case "5y": cutoffDate.setFullYear(now.getFullYear() - 5); break;
          }
          
          return timeSeries.filter(
            (point) => {
              const pointDate = new Date(point.date);
              return pointDate >= cutoffDate && pointDate <= now;
            }
          );
        }

        return timeSeries;
      }

      // For "all" - calculate net worth and each asset type over time
      if (!allAssets || !Array.isArray(allAssets) || allAssets.length === 0) {
        // Return empty array if assets aren't loaded yet
        return [];
      }

      // Get all unique dates from all assets
      const allDates = [...new Set(
        allAssets
          .map((a) => a.purchaseDate)
          .filter((date) => date && date !== "")
      )].sort();

      if (allDates.length === 0) return [];

      // Calculate values per date
      const timeSeries = [];
      for (const dateStr of allDates) {
        if (!dateStr) continue;

        const point = { date: dateStr };
        let netWorth = 0;

        // Group assets by type and calculate values
        const assetTypeValues = {};
        ASSET_TYPE_OPTIONS.forEach(({ value: assetType }) => {
          assetTypeValues[assetType] = 0;
        });

        for (const asset of allAssets) {
          if (asset.purchaseDate && new Date(asset.purchaseDate) <= new Date(dateStr)) {
            try {
              const assetValue = safeNumber(asset.currentValue || 0);
              // Convert to display currency
              const country = asset.country || "United States";
              const convertedValue = convertCountryValueToDisplay(assetValue, country, displayCurrency);
              const safeConvertedValue = safeNumber(convertedValue);
              netWorth += safeConvertedValue;
              
              if (asset.assetType && assetTypeValues.hasOwnProperty(asset.assetType)) {
                assetTypeValues[asset.assetType] += safeConvertedValue;
              }
            } catch (e) {
              console.error("Error converting currency for asset:", e, asset);
              // Fallback: use original value
              const fallbackValue = safeNumber(asset.currentValue || 0);
              netWorth += fallbackValue;
              if (asset.assetType && assetTypeValues.hasOwnProperty(asset.assetType)) {
                assetTypeValues[asset.assetType] += fallbackValue;
              }
            }
          }
        }

        // Only include asset types that have values
        point.netWorth = netWorth;
        Object.keys(assetTypeValues).forEach((assetType) => {
          if (assetTypeValues[assetType] > 0) {
            point[assetType] = assetTypeValues[assetType];
          }
        });

        timeSeries.push(point);
      }

      // Apply time range filter
      if (timeRange !== "all" && timeSeries.length > 0) {
    const now = new Date();
    const cutoffDate = new Date();
    
    switch (timeRange) {
          case "1d": cutoffDate.setDate(now.getDate() - 1); break;
          case "1m": cutoffDate.setMonth(now.getMonth() - 1); break;
          case "3m": cutoffDate.setMonth(now.getMonth() - 3); break;
          case "6m": cutoffDate.setMonth(now.getMonth() - 6); break;
          case "1y": cutoffDate.setFullYear(now.getFullYear() - 1); break;
          case "2y": cutoffDate.setFullYear(now.getFullYear() - 2); break;
          case "5y": cutoffDate.setFullYear(now.getFullYear() - 5); break;
        }
        
        return timeSeries.filter(
          (point) => {
            const pointDate = new Date(point.date);
            return pointDate >= cutoffDate && pointDate <= now;
          }
        );
      }

      return timeSeries;
    } catch (e) {
      console.error("Error calculating time series:", e);
      return [];
    }
  }, [analytics?.netWorthOverTime, timeRange, timeSeriesFilter, allAssets, displayCurrency]);

  console.log("[Analytics] State:", { isLoading, isError, hasAnalytics });

  if (isLoading) {
    console.log("[Analytics] Showing loading state");
    return <LoadingState message="Loading analytics..." />;
  }

  if (isError) {
    console.error("[Analytics] Error:", error);
    return (
      <ErrorState
        error={error instanceof ApiError ? error.message : "Failed to load analytics"}
        onRetry={refetch}
        message="Could not fetch analytics. Please try again."
      />
    );
  }

  if (!hasAnalytics) {
    console.log("[Analytics] No analytics data");
    return <EmptyState message="No analytics data available" />;
  }

  console.log("[Analytics] Analytics data received:", analytics);

  // Format Y-axis value with K/M/B notation (rounded to whole numbers, no decimals)
  const formatYAxisValue = (value) => {
    const num = Math.round(safeNumber(value)); // Round to whole number
    const absNum = Math.abs(num);
    let formatted;
    
    if (absNum >= 1e9) {
      // Billions - round to nearest whole number
      formatted = `${Math.round(absNum / 1e9)}B`;
    } else if (absNum >= 1e6) {
      // Millions - round to nearest whole number
      formatted = `${Math.round(absNum / 1e6)}M`;
    } else if (absNum >= 1e3) {
      // Thousands - round to nearest whole number
      formatted = `${Math.round(absNum / 1e3)}K`;
    } else {
      // Less than 1000 - show as whole number with commas
      formatted = absNum.toLocaleString('en-US');
    }
    
    return formatted;
  };

  // Format date for display based on selected time range
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
    const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; // Return original if invalid date
      
      // Format based on time range for better readability
      switch (timeRange) {
        case "1d":
          // For 1 day, show time
          return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        case "1m":
        case "3m":
          // For months, show day and month
          return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        case "6m":
        case "1y":
          // For 6 months to 1 year, show month and year
          return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        case "2y":
        case "5y":
        case "all":
          // For longer periods, show month and year
          return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        default:
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    } catch (e) {
      console.error("Date formatting error:", e);
      return dateStr;
    }
  };

  // Custom tooltip for line chart
  const CustomLineTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            padding: "0.75rem",
          }}
        >
          <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>
            {payload[0]?.payload?.date ? formatDate(payload[0].payload.date) : ""}
          </p>
          {payload.map((entry, index) => {
            // Get the display name for asset types
            const dataKey = entry.dataKey;
            let displayName = entry.name;
            if (dataKey && dataKey !== "netWorth") {
              const assetTypeOption = ASSET_TYPE_OPTIONS.find(opt => opt.value === dataKey);
              displayName = assetTypeOption ? assetTypeOption.label : dataKey;
            }
            const value = safeNumber(entry.value || 0);
            const currencySymbol = displayCurrency === "INR" ? "₹" : "$";
            return (
            <p key={index} style={{ color: entry.color, marginBottom: "0.25rem" }}>
                {displayName}: {currencySymbol}{formatYAxisValue(value)} {displayCurrency}
            </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for pie chart
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const total = filteredAllocation?.reduce((sum, item) => sum + safeNumber(item.value), 0) || 1;
      const percentage = ((safeNumber(data.value) / total) * 100).toFixed(1);
      const currencySymbol = displayCurrency === "INR" ? "₹" : "$";
      
      return (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            padding: "0.75rem",
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{data.name}</p>
          <p>Value: {currencySymbol}{formatYAxisValue(data.value)} {displayCurrency}</p>
          <p>Allocation: {percentage}%</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for bar chart
  const CustomBarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            padding: "0.75rem",
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{data.payload.label}</p>
          <p>CAGR: {formatPercent(data.value)}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Compound Annual Growth Rate
          </p>
        </div>
      );
    }
    return null;
  };

  // Safety check - ensure all filtered data is valid arrays
  if (!Array.isArray(filteredAllocation) || !Array.isArray(filteredCagrHistogram) || !Array.isArray(filteredTimeSeries)) {
    console.error("Analytics data structure invalid:", { 
      filteredAllocation, 
      filteredCagrHistogram, 
      filteredTimeSeries,
      analytics 
    });
    return (
      <ErrorState 
        message="Error processing analytics data. Please refresh the page." 
        onRetry={refetch} 
      />
    );
  }

  try {
  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Analytics</h1>
      </div>

      {/* Info Card about CAGR */}
      <div
        style={{
          background: "var(--card)",
          padding: "1rem 1.5rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0, lineHeight: "1.6" }}>
          <strong style={{ color: "var(--text)" }}>CAGR (Compound Annual Growth Rate)</strong>{" "}
          measures the mean annual growth rate of an investment over a specified time period longer than one year.
          It represents one of the most accurate ways to calculate and determine returns for anything that can rise
          or fall in value over time.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {/* Net Worth & Assets Over Time */}
        <Card title="Net Worth & Assets Over Time">
          <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Time Range:
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                {TIME_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Currency:
              </label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Filter by Asset Type:
              </label>
              <select
                value={timeSeriesFilter}
                onChange={(e) => setTimeSeriesFilter(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="all">Overall</option>
                {ASSET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredTimeSeries.length === 0 ? (
            <EmptyState message="No time series data available" />
          ) : (
            <div style={{ width: "100%", height: 350, marginTop: "1rem", marginBottom: "2rem" }}>
              <ResponsiveContainer>
                <LineChart data={filteredTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={formatDate}
                    style={{ fontSize: "0.75rem" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(value) => {
                      const currencySymbol = displayCurrency === "INR" ? "₹" : "$";
                      return `${currencySymbol}${formatYAxisValue(value)}`;
                    }}
                  />
                  <Tooltip content={<CustomLineTooltip />} />
                  <Legend />
                  {/* Net Worth line - always show first with thicker line */}
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#2563eb"
                    strokeWidth={3}
                    name="Net Worth"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  {/* Lines for each asset type */}
                  {ASSET_TYPE_OPTIONS.map((option, index) => {
                    // Check if this asset type has data in the time series
                    const hasData = filteredTimeSeries.some(point => 
                      point[option.value] !== undefined && point[option.value] > 0
                    );
                    
                    if (!hasData) return null;
                    
                    // Assign yellow color specifically to cash
                    const strokeColor = option.value === "cash" ? "#eab308" : COLORS[(index + 1) % COLORS.length];
                    
                    return (
                      <Line
                        key={option.value}
                        type="monotone"
                        dataKey={option.value}
                        stroke={strokeColor}
                        strokeWidth={2}
                        name={option.label}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Portfolio Allocation */}
        <Card title="Portfolio Allocation">
          <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Time Range:
              </label>
              <select
                value={allocationTimeRange}
                onChange={(e) => setAllocationTimeRange(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                {TIME_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Currency:
              </label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Filter by Asset Type:
              </label>
              <select
                value={allocationFilter}
                onChange={(e) => setAllocationFilter(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="all">Overall</option>
                {ASSET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!filteredAllocation || filteredAllocation.length === 0 ? (
            <EmptyState message="No allocation data available" />
          ) : (
            <div style={{ width: "100%", height: 350, marginTop: "1rem" }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={filteredAllocation}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    paddingAngle={4}
                    label={false}
                    labelLine={false}
                  >
                    {filteredAllocation.map((entry, index) => {
                      // Assign yellow color specifically to cash
                      const fillColor = entry.label === "cash" ? "#eab308" : COLORS[index % COLORS.length];
                      return <Cell key={`cell-${index}`} fill={fillColor} />;
                    })}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Legend below pie chart */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1rem",
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: "0.5rem",
                  paddingTop: "0.5rem",
                  fontSize: "0.875rem",
                  width: "100%",
                }}
              >
                {filteredAllocation.map((entry, index) => (
                  <div
                    key={entry.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.25rem 0.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "2px",
                        background: entry.label === "cash" ? "#eab308" : COLORS[index % COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ whiteSpace: "nowrap" }}>{entry.label}</span>
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      ({displayCurrency === "INR" ? "₹" : "$"}{formatYAxisValue(entry.value)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CAGR Histogram */}
      <div style={{ marginTop: "1.5rem" }}>
        <Card title="CAGR by Asset">
          <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              Filter by Asset Type:
            </label>
            <select
              value={cagrFilter}
              onChange={(e) => setCagrFilter(e.target.value)}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "0.875rem",
              }}
            >
              <option value="all">Overall</option>
              {ASSET_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {!filteredCagrHistogram || filteredCagrHistogram.length === 0 ? (
            <EmptyState message="No CAGR data available" />
          ) : (
            <div style={{ width: "100%", height: 400, marginTop: "1rem" }}>
              <ResponsiveContainer>
                <BarChart data={filteredCagrHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    label={{
                      value: "CAGR (%)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 12, fill: "var(--text)" },
                    }}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="cagrPercent" fill="#f97316" radius={[4, 4, 0, 0]}>
                    {filteredCagrHistogram.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          safeNumber(entry.cagrPercent) >= 0
                            ? "#22c55e"
                            : safeNumber(entry.cagrPercent) === 0
                            ? "#6b7280"
                            : "#ef4444"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
  } catch (e) {
    console.error("Analytics component error:", e);
    return (
      <ErrorState 
        message={`An error occurred: ${e.message || "Unknown error"}`}
        onRetry={refetch}
      />
    );
  }
}
