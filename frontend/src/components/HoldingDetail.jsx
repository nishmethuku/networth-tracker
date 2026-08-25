import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import TagSuggestionCard from "./ai/TagSuggestionCard";
import SipCard from "./SipCard";
import {
  fetchHolding,
  fetchHoldingTransactions,
  fetchHoldingValuations,
  fetchHoldingPriceHistory,
  fetchHoldings,
  createTransaction,
  createValuation,
  deleteTransaction,
  deleteValuation,
  priceLookup,
  ApiError,
} from "../api";
import { formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import { getAssetTypeLabel, isQuantityBased, TRANSACTION_TYPES, isIncomeTransactionType } from "../constants/enums";
import { computeTransactionTimeline } from "../utils/transactionTimeline";
import { RETURN_RANGES, computePeriodReturn } from "../utils/periodReturn";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

function AddTransactionForm({ holding, onDone }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    transaction_type: "buy",
    transaction_date: new Date().toISOString().split("T")[0],
    quantity: "",
    price_per_unit: "",
    fees: "0",
    funding_source_holding_id: "",
  });
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [createdTx, setCreatedTx] = useState(null);

  // Cash holdings to offer as a funding source when this is a purchase —
  // e.g. buying gold and paying for it out of a bank account, which should
  // reduce that account's recorded balance instead of the two staying
  // disconnected.
  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: form.transaction_type === "buy",
  });

  const mutation = useMutation({
    mutationFn: (payload) => createTransaction(holding.id, payload),
    onSuccess: (tx) => {
      queryClient.invalidateQueries({ queryKey: ["holding", holding.id] });
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", holding.id] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      if (tx.fundingSource) {
        queryClient.invalidateQueries({ queryKey: ["holding", tx.fundingSource.holdingId] });
        queryClient.invalidateQueries({ queryKey: ["holding-valuations", tx.fundingSource.holdingId] });
      }
      setCreatedTx(tx);
    },
  });

  async function handleFetchPrice() {
    setFetchingPrice(true);
    try {
      const price = await priceLookup({
        assetType: holding.assetType,
        symbol: holding.symbol,
        date: form.transaction_date,
        currency: holding.currency,
      });
      if (price != null) {
        setForm((f) => ({ ...f, price_per_unit: String(price) }));
      }
    } finally {
      setFetchingPrice(false);
    }
  }

  const isIncome = isIncomeTransactionType(form.transaction_type);

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      transaction_type: form.transaction_type,
      transaction_date: form.transaction_date,
      // Dividend/interest are a lump sum, not shares — quantity is fixed
      // at 1 so "amount" (entered into price_per_unit) maps directly to
      // quantity * price_per_unit everywhere that formula is already used.
      quantity: isIncome ? 1 : parseFloat(form.quantity),
      price_per_unit: parseFloat(form.price_per_unit),
      fees: parseFloat(form.fees || 0),
      currency: holding.currency,
      ...(form.transaction_type === "buy" && form.funding_source_holding_id
        ? { funding_source_holding_id: Number(form.funding_source_holding_id) }
        : {}),
    });
  }

  if (createdTx) {
    return (
      <div>
        <p style={{ color: "var(--success)", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Transaction added ✓</p>
        {createdTx.fundingSource && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
            Also updated the funding account's balance to{" "}
            {formatCurrencyForDisplay(createdTx.fundingSource.newBalance, createdTx.fundingSource.currency, { includeCode: false })}.
          </p>
        )}
        <TagSuggestionCard transactionId={createdTx.id} holdingId={holding.id} onDismiss={onDone} />
        <button
          onClick={onDone}
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", alignItems: "end" }}
    >
      <div>
        <label htmlFor="tx-type" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
          Type
        </label>
        <select
          id="tx-type"
          value={form.transaction_type}
          onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
          style={inputStyle}
        >
          {TRANSACTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="tx-date" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
          Date
        </label>
        <input
          id="tx-date"
          type="date"
          value={form.transaction_date}
          max={new Date().toISOString().split("T")[0]}
          onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
          style={inputStyle}
          required
        />
      </div>
      {!isIncome && (
        <div>
          <label
            htmlFor="tx-quantity"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Quantity
          </label>
          <input
            id="tx-quantity"
            type="number"
            step="any"
            min="0.0001"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            style={inputStyle}
            required
          />
        </div>
      )}
      <div>
        <label
          htmlFor="tx-price"
          style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
        >
          {isIncome ? "Amount" : "Price / unit"}
        </label>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <input
            id="tx-price"
            type="number"
            step="any"
            min="0"
            value={form.price_per_unit}
            onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
            required
          />
          {!isIncome && holding.symbol && (
            <button
              type="button"
              onClick={handleFetchPrice}
              disabled={fetchingPrice}
              style={{ fontSize: "0.75rem", padding: "0 0.5rem" }}
              title="Fetch historical price for this date"
            >
              {fetchingPrice ? "..." : "Fetch"}
            </button>
          )}
        </div>
      </div>
      <div>
        <label htmlFor="tx-fees" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
          Fees
        </label>
        <input
          id="tx-fees"
          type="number"
          step="any"
          min="0"
          value={form.fees}
          onChange={(e) => setForm({ ...form, fees: e.target.value })}
          style={inputStyle}
        />
      </div>
      {form.transaction_type === "buy" && cashHoldings?.length > 0 && (
        <div>
          <label
            htmlFor="tx-funding-source"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Funded from
          </label>
          <select
            id="tx-funding-source"
            value={form.funding_source_holding_id}
            onChange={(e) => setForm({ ...form, funding_source_holding_id: e.target.value })}
            style={inputStyle}
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
      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {mutation.isPending ? "Saving..." : "Add"}
      </button>
    </form>
  );
}

function AddValuationForm({ holding, onDone }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ valuation_date: new Date().toISOString().split("T")[0], value: "" });

  const mutation = useMutation({
    mutationFn: (payload) => createValuation(holding.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", holding.id] });
      queryClient.invalidateQueries({ queryKey: ["holding-valuations", holding.id] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      onDone();
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({ valuation_date: form.valuation_date, value: parseFloat(form.value), currency: holding.currency });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", alignItems: "end" }}
    >
      <div>
        <label
          htmlFor="valuation-date"
          style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
        >
          Date
        </label>
        <input
          id="valuation-date"
          type="date"
          value={form.valuation_date}
          max={new Date().toISOString().split("T")[0]}
          onChange={(e) => setForm({ ...form, valuation_date: e.target.value })}
          style={inputStyle}
          required
        />
      </div>
      <div>
        <label
          htmlFor="valuation-value"
          style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
        >
          {holding.assetType === "loan" ? "Balance owed" : holding.assetType === "credit" ? "Owed to you" : "Value"}
        </label>
        <input
          id="valuation-value"
          type="number"
          step="any"
          min="0"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          style={inputStyle}
          required
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {mutation.isPending ? "Saving..." : "Add Update"}
      </button>
    </form>
  );
}

/**
 * % change over a selectable window (1W/1M/3M/6M/1Y/YTD/All), built from
 * whatever value series the holding already has — price history for
 * quantity-based holdings, valuation history for everything else. The
 * point is a like-for-like comparison ("stocks are up 8% this month, cash
 * is flat") so someone can decide where to move money, not a replacement
 * for XIRR (which stays annualized and transaction-aware).
 */
function PeriodReturn({ series, currency }) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 1M

  const result = useMemo(() => computePeriodReturn(series, rangeIdx), [series, rangeIdx]);

  if (!result) return null;

  const positive = result.pct != null && result.pct >= 0;

  return (
    <Card title="Performance">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.25rem", marginBottom: "0.75rem" }}>
        {RETURN_RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            style={{
              padding: "0.25rem 0.625rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: rangeIdx === i ? "var(--primary)" : "transparent",
              color: rangeIdx === i ? "var(--text-inverse)" : "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: rangeIdx === i ? 600 : 500,
              cursor: "pointer",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          color: result.pct != null ? (positive ? "var(--success)" : "var(--danger)") : "var(--text-muted)",
        }}
      >
        {result.pct != null ? `${positive ? "+" : ""}${formatPercent(result.pct)}` : "—"}
      </div>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        {formatCurrencyForDisplay(result.start, currency)} → {formatCurrencyForDisplay(result.end, currency)}
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={result.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v) => formatCurrencyForDisplay(v, currency)}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
            />
            <Line type="monotone" dataKey="value" stroke={positive ? "var(--success)" : "var(--danger)"} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function HoldingDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const toast = useToast();

  const {
    data: holding,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["holding", id],
    queryFn: () => fetchHolding(id),
  });

  const quantityBased = holding ? isQuantityBased(holding.assetType) : false;

  const { data: transactions } = useQuery({
    queryKey: ["holding-transactions", id],
    queryFn: () => fetchHoldingTransactions(id),
    enabled: quantityBased,
  });

  const timeline = useMemo(() => computeTransactionTimeline(transactions), [transactions]);

  const { data: valuations } = useQuery({
    queryKey: ["holding-valuations", id],
    queryFn: () => fetchHoldingValuations(id),
    enabled: !!holding && !quantityBased,
  });

  const { data: priceHistory } = useQuery({
    queryKey: ["holding-price-history", id],
    queryFn: () => fetchHoldingPriceHistory(id),
    enabled: quantityBased,
  });

  // Normalized {date, value} series for the Performance card — price
  // history for quantity-based holdings, valuation history for everything
  // else. Valuations come back newest-first, so reverse for a chart; loans
  // are stored as positive debt but sign-flipped here (matching
  // calculate_valuation_metrics) so a shrinking balance reads as a gain.
  const series = useMemo(() => {
    if (quantityBased) {
      return (priceHistory || []).map((p) => ({ date: p.date, value: p.price }));
    }
    const sign = holding?.assetType === "loan" ? -1 : 1;
    return [...(valuations || [])].reverse().map((v) => ({ date: v.valuationDate, value: v.value * sign }));
  }, [quantityBased, priceHistory, valuations, holding?.assetType]);

  const deleteTxMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", id] });
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", id] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      toast.success("Transaction deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to delete transaction"),
  });

  const deleteValMutation = useMutation({
    mutationFn: deleteValuation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", id] });
      queryClient.invalidateQueries({ queryKey: ["holding-valuations", id] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      toast.success("Entry deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to delete entry"),
  });

  if (isLoading) return <LoadingState message="Loading..." />;
  if (isError || !holding) {
    return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load holding"} onRetry={refetch} />;
  }

  const gain = quantityBased ? holding.totalGain : holding.gain;
  const positive = safeNumber(gain) >= 0;

  return (
    <div>
      <Link to="/portfolio" style={{ display: "inline-block", marginBottom: "1rem", color: "var(--text-secondary)" }}>
        ← Back to Portfolio
      </Link>

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)" }}>{holding.symbol || holding.name}</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          {getAssetTypeLabel(holding.assetType)} • {holding.country}
          {holding.account ? ` • ${holding.account}` : ""}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
        <Card title="Current Value" value={formatCurrencyForDisplay(holding.currentValue, holding.currency)} />
        {quantityBased ? (
          <>
            <Card title="Quantity" value={holding.quantity?.toFixed(4) ?? "—"} />
            <Card title="Avg Cost" value={holding.avgCost != null ? formatCurrencyForDisplay(holding.avgCost, holding.currency) : "—"} />
            <Card
              title="Current Price"
              value={holding.currentPrice != null ? formatCurrencyForDisplay(holding.currentPrice, holding.currency) : "—"}
            />
          </>
        ) : null}
        <Card
          title={quantityBased ? "Total Gain" : "Gain Since First Entry"}
          value={gain != null ? `${positive ? "+" : ""}${formatCurrencyForDisplay(gain, holding.currency)}` : "—"}
          subtitle={positive ? "Up" : "Down"}
        />
        {quantityBased && (
          <Card title="Return (XIRR)" value={holding.xirr != null ? formatPercent(holding.xirr * 100) : "—"} subtitle="Annualized" />
        )}
        {quantityBased && holding.costBasis ? (
          <Card
            title="Growth"
            value={formatPercent((holding.totalGain / holding.costBasis) * 100)}
            subtitle="Total return, not annualized"
          />
        ) : null}
      </div>

      {quantityBased && holding.realizedGain != null && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}
        >
          <Card title="Realized Gain" value={formatCurrencyForDisplay(holding.realizedGain, holding.currency)} subtitle="From sales" />
          <Card
            title="Unrealized Gain"
            value={formatCurrencyForDisplay(holding.unrealizedGain, holding.currency)}
            subtitle="On current holding"
          />
          {!!holding.incomeReceived && (
            <Card
              title="Dividends & Interest"
              value={formatCurrencyForDisplay(holding.incomeReceived, holding.currency)}
              subtitle="Income received"
            />
          )}
        </div>
      )}

      {series.length > 1 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <PeriodReturn series={series} currency={holding.currency} />
        </div>
      )}

      {quantityBased && (
        <div style={{ marginTop: "1.5rem" }}>
          <SipCard holding={holding} />
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
            {quantityBased ? "Transaction History" : "Value History"}
          </h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {showAddForm ? "Cancel" : quantityBased ? "+ Add Transaction" : "+ Add Update"}
          </button>
        </div>

        {showAddForm && (
          <Card>
            {quantityBased ? (
              <AddTransactionForm holding={holding} onDone={() => setShowAddForm(false)} />
            ) : (
              <AddValuationForm holding={holding} onDone={() => setShowAddForm(false)} />
            )}
          </Card>
        )}

        <div style={{ marginTop: "1rem" }}>
          {quantityBased ? (
            !transactions || transactions.length === 0 ? (
              <EmptyState message="No transactions yet." />
            ) : (
              <Card>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "0.6rem" }}>Date</th>
                        <th style={{ padding: "0.6rem" }}>Type</th>
                        <th style={{ padding: "0.6rem" }}>Quantity</th>
                        <th style={{ padding: "0.6rem" }}>Price</th>
                        <th style={{ padding: "0.6rem" }}>Fees</th>
                        <th style={{ padding: "0.6rem" }} title="Running position after this transaction">
                          Cost Basis After
                        </th>
                        <th style={{ padding: "0.6rem" }} title="Cumulative realized gain/loss after this transaction">
                          Realized P&L
                        </th>
                        <th style={{ padding: "0.6rem" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t) => {
                        const running = timeline[t.id];
                        return (
                          <tr key={t.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                            <td style={{ padding: "0.6rem" }}>{new Date(t.transactionDate).toLocaleDateString()}</td>
                            <td
                              style={{
                                padding: "0.6rem",
                                textTransform: "capitalize",
                                color: t.transactionType === "sell" ? "var(--danger)" : "var(--success)",
                                fontWeight: 600,
                              }}
                            >
                              {t.transactionType}
                            </td>
                            <td style={{ padding: "0.6rem", fontFamily: "var(--font-mono)" }}>{t.quantity.toFixed(4)}</td>
                            <td style={{ padding: "0.6rem", fontFamily: "var(--font-mono)" }}>
                              {formatCurrencyForDisplay(t.pricePerUnit, t.currency)}
                            </td>
                            <td style={{ padding: "0.6rem", fontFamily: "var(--font-mono)" }}>
                              {formatCurrencyForDisplay(t.fees, t.currency)}
                            </td>
                            <td style={{ padding: "0.6rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                              {running ? formatCurrencyForDisplay(running.costBasisAfter, t.currency) : "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.6rem",
                                fontFamily: "var(--font-mono)",
                                color: running && running.cumulativeRealizedGain >= 0 ? "var(--success)" : "var(--danger)",
                              }}
                            >
                              {running
                                ? `${running.cumulativeRealizedGain >= 0 ? "+" : ""}${formatCurrencyForDisplay(running.cumulativeRealizedGain, t.currency)}`
                                : "—"}
                            </td>
                            <td style={{ padding: "0.6rem" }}>
                              <button
                                onClick={() => deleteTxMutation.mutate(t.id)}
                                style={{ fontSize: "0.75rem", background: "var(--danger)", color: "white", padding: "0.3rem 0.6rem" }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          ) : !valuations || valuations.length === 0 ? (
            <EmptyState message="No history yet." />
          ) : (
            <Card>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.6rem" }}>Date</th>
                      <th style={{ padding: "0.6rem" }}>Value</th>
                      <th style={{ padding: "0.6rem" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuations.map((v) => (
                      <tr key={v.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "0.6rem" }}>{new Date(v.valuationDate).toLocaleDateString()}</td>
                        <td style={{ padding: "0.6rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                          {formatCurrencyForDisplay(v.value, v.currency)}
                        </td>
                        <td style={{ padding: "0.6rem" }}>
                          <button
                            onClick={() => deleteValMutation.mutate(v.id)}
                            style={{ fontSize: "0.75rem", background: "var(--danger)", color: "white", padding: "0.3rem 0.6rem" }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
