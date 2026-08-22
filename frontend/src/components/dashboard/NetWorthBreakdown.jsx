import { useMemo, useState } from "react";
import { formatCurrencyForDisplay, formatPercent } from "../../utils/formatters";
import { getAssetTypeLabel, isQuantityBased } from "../../constants/enums";
import { computeReturnsByType, holdingGrowthPct } from "../../utils/holdingReturns";
import EmptyState from "../EmptyState";

const VIEWS = [
  { key: "M1", description: "Summary by category" },
  { key: "M2", description: "Category → holdings" },
  { key: "M3", description: "All holdings, sortable" },
];

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
  const returnsByType = Object.fromEntries(computeReturnsByType(holdings).map((r) => [r.assetType, r.returnPct]));
  return Object.entries(byType)
    .map(([assetType, b]) => ({
      assetType,
      label: getAssetTypeLabel(assetType),
      value: b.value,
      returnPct: returnsByType[assetType] ?? null,
      isXirr: isQuantityBased(assetType),
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

function M1Summary({ rows, currency }) {
  if (rows.length === 0) return <EmptyState message="No holdings yet." />;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
        <span>Category</span>
        <span style={{ display: "flex", gap: "2.5rem" }}><span>Value</span><span>Return</span></span>
      </div>
      {rows.map((r, i) => (
        <div key={r.assetType} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border-light)" : "none", fontSize: "0.875rem" }}>
          <span style={{ color: "var(--text)" }}>{r.label}</span>
          <span style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: 90, textAlign: "right" }}>
              {formatCurrencyForDisplay(r.value, currency, { includeCode: false })}
            </span>
            <span style={{ minWidth: 110, textAlign: "right", fontFamily: "var(--font-mono)" }}>
              <ReturnCell pct={r.returnPct} isXirr={r.isXirr} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function M2Drilldown({ rows, holdings, currency }) {
  const [expanded, setExpanded] = useState(null);
  if (rows.length === 0) return <EmptyState message="No holdings yet." />;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r, i) => {
        const isOpen = expanded === r.assetType;
        const children = holdings.filter((h) => h.assetType === r.assetType).sort((a, b) => b.displayValue - a.displayValue);
        return (
          <div key={r.assetType} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border-light)" : "none" }}>
            <div
              onClick={() => setExpanded(isOpen ? null : r.assetType)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", cursor: "pointer", fontSize: "0.875rem" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
                {r.label}
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>({children.length})</span>
              </span>
              <span style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: 90, textAlign: "right" }}>
                  {formatCurrencyForDisplay(r.value, currency, { includeCode: false })}
                </span>
                <span style={{ minWidth: 110, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  <ReturnCell pct={r.returnPct} isXirr={r.isXirr} />
                </span>
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: "0 0 0.5rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {children.map((h) => {
                  const { pct, isXirr } = holdingReturn(h);
                  return (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.375rem 0", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {h.displayName}{h.account ? <span style={{ color: "var(--text-muted)" }}> · {h.account}</span> : null}
                      </span>
                      <span style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", minWidth: 90, textAlign: "right" }}>
                          {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
                        </span>
                        <span style={{ minWidth: 110, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          <ReturnCell pct={pct} isXirr={isXirr} />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SORT_OPTIONS = [
  { key: "value", label: "Value" },
  { key: "return", label: "XIRR / Return" },
  { key: "assetType", label: "Asset Class" },
];

function M3Flat({ holdings, currency }) {
  const [sortBy, setSortBy] = useState("value");

  const rows = useMemo(() => {
    const withReturn = holdings.map((h) => ({ holding: h, ...holdingReturn(h) }));
    const sorted = [...withReturn].sort((a, b) => {
      if (sortBy === "value") return b.holding.displayValue - a.holding.displayValue;
      if (sortBy === "return") return (b.pct ?? -Infinity) - (a.pct ?? -Infinity);
      return getAssetTypeLabel(a.holding.assetType).localeCompare(getAssetTypeLabel(b.holding.assetType));
    });
    return sorted;
  }, [holdings, sortBy]);

  if (rows.length === 0) return <EmptyState message="No holdings yet." />;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "center", marginRight: "0.25rem" }}>Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              border: "none",
              borderRadius: "999px",
              padding: "0.25rem 0.75rem",
              fontSize: "0.75rem",
              cursor: "pointer",
              background: sortBy === opt.key ? "var(--primary)" : "var(--bg-secondary)",
              color: sortBy === opt.key ? "var(--text-inverse)" : "var(--text-secondary)",
              fontWeight: sortBy === opt.key ? 600 : 500,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map(({ holding: h, pct, isXirr }, i) => (
          <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border-light)" : "none", fontSize: "0.875rem" }}>
            <span style={{ minWidth: 0 }}>
              <div style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.displayName}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {getAssetTypeLabel(h.assetType)}{h.account ? ` · ${h.account}` : ""}
              </div>
            </span>
            <span style={{ display: "flex", gap: "2.5rem", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: 90, textAlign: "right" }}>
                {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
              </span>
              <span style={{ minWidth: 110, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                <ReturnCell pct={pct} isXirr={isXirr} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Three switchable net worth views, all built from the same already-
 * fetched holdings list — no separate backend endpoint, since /holdings
 * already returns per-holding value, XIRR, and asset type.
 *
 * M1 — one row per asset category: total value + a value-weighted
 * average return (true XIRR where that's meaningful, plain growth %
 * otherwise — see holdingReturns.js).
 * M2 — same category rows, expandable to the individual holdings inside
 * each one, each with its own return.
 * M3 — every holding in one flat list, sortable by value, return, or
 * asset class — "account-level" in the sense that each holding here is
 * the smallest unit this app tracks (there's no separate account entity
 * beyond the account name already on each holding).
 */
export default function NetWorthBreakdown({ holdings, currency }) {
  const [view, setView] = useState("M1");
  const list = holdings || [];
  const categoryRows = useMemo(() => buildCategoryRows(list), [list]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{VIEWS.find((v) => v.key === view)?.description}</span>
        <div style={{ display: "inline-flex", gap: "0.2rem", background: "var(--bg-secondary)", borderRadius: "999px", padding: "0.2rem", border: "1px solid var(--border)" }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                cursor: "pointer",
                background: view === v.key ? "var(--primary)" : "transparent",
                color: view === v.key ? "var(--text-inverse)" : "var(--text-secondary)",
                fontWeight: view === v.key ? 600 : 500,
              }}
            >
              {v.key}
            </button>
          ))}
        </div>
      </div>

      {view === "M1" && <M1Summary rows={categoryRows} currency={currency} />}
      {view === "M2" && <M2Drilldown rows={categoryRows} holdings={list} currency={currency} />}
      {view === "M3" && <M3Flat holdings={list} currency={currency} />}
    </div>
  );
}
