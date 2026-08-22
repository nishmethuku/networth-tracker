import { useMemo, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { formatCurrencyForDisplay, formatPercent } from "../../utils/formatters";
import { getAssetTypeLabel, isQuantityBased } from "../../constants/enums";
import { computeGroupedReturn, computeReturnsByType, holdingGrowthPct } from "../../utils/holdingReturns";
import EmptyState from "../EmptyState";

// A holding's own annualized return where one actually exists (XIRR,
// quantity-based types only); everything else falls back to plain
// growth % — the two are never presented as the same number, since
// calling a non-annualized figure "XIRR" would be misleading.
function holdingReturn(h) {
  if (isQuantityBased(h.assetType) && h.xirr != null) {
    return { pct: h.xirr * 100, isXirr: true };
  }
  const pct = holdingGrowthPct(h);
  return { pct, isXirr: false };
}

function buildCategoryRows(holdings) {
  const byType = {};
  for (const h of holdings) {
    if (!byType[h.assetType]) byType[h.assetType] = { value: 0 };
    byType[h.assetType].value += h.displayValue || 0;
  }
  const returnsByType = Object.fromEntries(computeReturnsByType(holdings).map((r) => [r.assetType, r]));
  return Object.entries(byType)
    .map(([assetType, b]) => ({
      assetType,
      label: getAssetTypeLabel(assetType),
      value: b.value,
      returnPct: returnsByType[assetType]?.returnPct ?? null,
      isXirr: returnsByType[assetType]?.isXirr ?? false,
    }))
    .sort((a, b) => b.value - a.value);
}

function buildAccountRows(holdings, assetType) {
  const byAccount = {};
  for (const h of holdings) {
    if (h.assetType !== assetType) continue;
    const key = h.account || "Unspecified";
    (byAccount[key] = byAccount[key] || []).push(h);
  }
  return Object.entries(byAccount)
    .map(([account, hs]) => ({
      account,
      value: hs.reduce((sum, h) => sum + (h.displayValue || 0), 0),
      count: hs.length,
      ...computeGroupedReturn(hs),
    }))
    .sort((a, b) => b.value - a.value);
}

function ReturnCell({ pct, isXirr }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span style={{ color: pct >= 0 ? "var(--success)" : "var(--danger)" }}>
      {pct >= 0 ? "+" : ""}{formatPercent(pct)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{isXirr ? "XIRR" : "return"}</span>
    </span>
  );
}

// Small trend line of a category's value over time, built from the net
// worth history's per-date by-asset-type breakdown — the only granularity
// the backend tracks (per account isn't recorded historically).
function TrajectorySparkline({ history, assetType }) {
  const data = useMemo(() => {
    if (!history?.length) return [];
    return history.map((h) => ({ date: h.date, value: h.byAssetType?.[assetType] ?? 0 }));
  }, [history, assetType]);

  if (data.length < 2) return <div style={{ width: 64, height: 24 }} />;
  const trendingUp = data[data.length - 1].value >= data[0].value;

  return (
    <div style={{ width: 64, height: 24 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={trendingUp ? "var(--success)" : "var(--danger)"}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const ROW_STYLE = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", fontSize: "0.875rem" };
const RIGHT_GROUP_STYLE = { display: "flex", gap: "1.5rem", alignItems: "center" };
const VALUE_STYLE = { fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: 90, textAlign: "right" };
const RETURN_STYLE = { minWidth: 110, textAlign: "right", fontFamily: "var(--font-mono)" };

function Breadcrumb({ items, onNavigate }) {
  return (
    <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
      <button onClick={() => onNavigate(-1)} style={breadcrumbBtnStyle}>All</button>
      {items.map((item, i) => (
        <span key={i}>
          {" › "}
          {i === items.length - 1 ? (
            <span style={{ color: "var(--text)" }}>{item.label}</span>
          ) : (
            <button onClick={() => onNavigate(i)} style={breadcrumbBtnStyle}>{item.label}</button>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Net worth broken down by category, drilling into the accounts within a
 * category (since one asset type is often spread across several real-world
 * accounts) and then into the individual holdings within an account. A
 * category with only one account skips straight to its holdings, since the
 * account level would otherwise be a redundant extra click.
 */
export default function NetWorthBreakdown({ holdings, currency, history }) {
  const [drill, setDrill] = useState(null); // { category: assetType } | { category: assetType, account: string } | null
  const list = holdings || [];
  const categoryRows = useMemo(() => buildCategoryRows(list), [list]);

  const accountRows = useMemo(() => {
    if (!drill) return [];
    return buildAccountRows(list, drill.category);
  }, [list, drill]);

  function openCategory(assetType) {
    const accounts = buildAccountRows(list, assetType);
    if (accounts.length <= 1) {
      setDrill({ category: assetType, account: accounts[0]?.account ?? null });
    } else {
      setDrill({ category: assetType });
    }
  }

  function navigateBreadcrumb(index) {
    if (index === -1) setDrill(null);
    else if (index === 0) setDrill({ category: drill.category });
  }

  if (list.length === 0) return <EmptyState message="No holdings yet." />;

  // ---- Level 3: holdings within one account ----
  if (drill?.account !== undefined && drill.account !== null) {
    const holdingsInAccount = list
      .filter((h) => h.assetType === drill.category && (h.account || "Unspecified") === drill.account)
      .sort((a, b) => b.displayValue - a.displayValue);
    const breadcrumbItems = [
      { label: getAssetTypeLabel(drill.category) },
      ...(accountRows.length > 1 ? [{ label: drill.account }] : []),
    ];
    return (
      <div>
        <Breadcrumb items={breadcrumbItems} onNavigate={navigateBreadcrumb} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {holdingsInAccount.map((h, i) => {
            const { pct, isXirr } = holdingReturn(h);
            return (
              <div key={h.id} style={{ ...ROW_STYLE, borderBottom: i < holdingsInAccount.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                <span style={{ color: "var(--text)" }}>{h.displayName}</span>
                <span style={RIGHT_GROUP_STYLE}>
                  <span style={VALUE_STYLE}>{formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}</span>
                  <span style={RETURN_STYLE}><ReturnCell pct={pct} isXirr={isXirr} /></span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Level 2: accounts within one category ----
  if (drill?.category) {
    return (
      <div>
        <Breadcrumb items={[{ label: getAssetTypeLabel(drill.category) }]} onNavigate={navigateBreadcrumb} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {accountRows.map((r, i) => (
            <div
              key={r.account}
              onClick={() => setDrill({ category: drill.category, account: r.account })}
              style={{ ...ROW_STYLE, cursor: "pointer", borderBottom: i < accountRows.length - 1 ? "1px solid var(--border-light)" : "none" }}
            >
              <span style={{ color: "var(--text)" }}>
                {r.account} <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>({r.count})</span>
              </span>
              <span style={RIGHT_GROUP_STYLE}>
                <span style={VALUE_STYLE}>{formatCurrencyForDisplay(r.value, currency, { includeCode: false })}</span>
                <span style={RETURN_STYLE}><ReturnCell pct={r.returnPct} isXirr={r.isXirr} /></span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Level 1: categories ----
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
        <span>Category</span>
        <span style={{ display: "flex", gap: "1.5rem" }}><span style={{ minWidth: 64 }}>Trend</span><span style={{ minWidth: 90, textAlign: "right" }}>Value</span><span style={{ minWidth: 110, textAlign: "right" }}>Return</span></span>
      </div>
      {categoryRows.map((r, i) => (
        <div
          key={r.assetType}
          onClick={() => openCategory(r.assetType)}
          style={{ ...ROW_STYLE, cursor: "pointer", borderBottom: i < categoryRows.length - 1 ? "1px solid var(--border-light)" : "none" }}
        >
          <span style={{ color: "var(--text)" }}>{r.label}</span>
          <span style={RIGHT_GROUP_STYLE}>
            <TrajectorySparkline history={history} assetType={r.assetType} />
            <span style={VALUE_STYLE}>{formatCurrencyForDisplay(r.value, currency, { includeCode: false })}</span>
            <span style={RETURN_STYLE}><ReturnCell pct={r.returnPct} isXirr={r.isXirr} /></span>
          </span>
        </div>
      ))}
    </div>
  );
}

const breadcrumbBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--primary)",
  fontSize: "0.8125rem",
  cursor: "pointer",
  padding: 0,
  fontWeight: 500,
};
