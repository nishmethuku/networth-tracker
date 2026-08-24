import { useMemo, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { formatCurrencyForDisplay, formatPercent } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";
import { computeGroupedReturn, computeReturnsByType, holdingReturn, groupBuyValueAndGain } from "../../utils/holdingReturns";
import EmptyState from "../EmptyState";
import useIsMobile from "../../hooks/useIsMobile";

const CATEGORY_ICONS = {
  stock: "📈",
  mutual_fund: "📊",
  crypto: "₿",
  commodity: "🪙",
  real_estate: "🏠",
  fixed_deposit: "🏦",
  ppf: "🏦",
  epf: "🏦",
  retirals: "🏦",
  cash: "💰",
  loan: "💳",
  credit: "🤝",
};

function buildCategoryRows(holdings) {
  const byType = {};
  for (const h of holdings) {
    if (!byType[h.assetType]) byType[h.assetType] = [];
    byType[h.assetType].push(h);
  }
  const returnsByType = Object.fromEntries(computeReturnsByType(holdings).map((r) => [r.assetType, r]));
  return Object.entries(byType)
    .map(([assetType, hs]) => ({
      assetType,
      label: getAssetTypeLabel(assetType),
      value: hs.reduce((sum, h) => sum + (h.displayValue || 0), 0),
      returnPct: returnsByType[assetType]?.returnPct ?? null,
      isXirr: returnsByType[assetType]?.isXirr ?? false,
      ...groupBuyValueAndGain(hs),
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
      ...groupBuyValueAndGain(hs),
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
// The right-hand group (trend sparkline + value + return) needs ~310px at
// full size (three items with 1.5rem gaps) — comfortably too wide for any
// phone screen. useIsMobile() drives a tighter layout below, so this stays
// a function of that flag rather than a fixed constant.
const rightGroupStyle = (isMobile) => ({ display: "flex", gap: isMobile ? "0.625rem" : "1.5rem", alignItems: "center" });
const valueStyle = (isMobile) => ({ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: isMobile ? 68 : 90, textAlign: "right" });
const returnStyle = (isMobile) => ({ minWidth: isMobile ? 84 : 110, textAlign: "right", fontFamily: "var(--font-mono)" });

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
  const isMobile = useIsMobile();
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
                <span style={rightGroupStyle(isMobile)}>
                  <span style={valueStyle(isMobile)}>{formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}</span>
                  <span style={returnStyle(isMobile)}><ReturnCell pct={pct} isXirr={isXirr} /></span>
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
              style={{ display: "flex", flexDirection: "column", cursor: "pointer", padding: "0.625rem 0", borderBottom: i < accountRows.length - 1 ? "1px solid var(--border-light)" : "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text)" }}>
                  {r.account} <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>({r.count})</span>
                </span>
                <span style={rightGroupStyle(isMobile)}>
                  <span style={valueStyle(isMobile)}>{formatCurrencyForDisplay(r.value, currency, { includeCode: false })}</span>
                  <span style={returnStyle(isMobile)}><ReturnCell pct={r.returnPct} isXirr={r.isXirr} /></span>
                </span>
              </div>
              {r.buyValue != null && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                  Buy value {formatCurrencyForDisplay(r.buyValue, currency, { includeCode: false })}
                  {" · "}
                  <span style={{ color: r.gainAmount >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {r.gainAmount >= 0 ? "+" : ""}{formatCurrencyForDisplay(r.gainAmount, currency, { includeCode: false })}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Level 1: categories, as clickable cards ----
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
      {categoryRows.map((r) => (
        <div
          key={r.assetType}
          onClick={() => openCategory(r.assetType)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            padding: "1rem 1.125rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ fontSize: "1.125rem" }}>{CATEGORY_ICONS[r.assetType] || "📦"}</span>
              {r.label}
            </span>
            {!isMobile && <TrajectorySparkline history={history} assetType={r.assetType} />}
          </div>
          <div style={{ fontSize: "1.375rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
            {formatCurrencyForDisplay(r.value, currency, { includeCode: false })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem" }}><ReturnCell pct={r.returnPct} isXirr={r.isXirr} /></span>
            {r.gainAmount != null && (
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: r.gainAmount >= 0 ? "var(--success)" : "var(--danger)" }}>
                {r.gainAmount >= 0 ? "+" : ""}{formatCurrencyForDisplay(r.gainAmount, currency, { includeCode: false })}
              </span>
            )}
          </div>
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
