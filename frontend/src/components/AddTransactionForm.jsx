import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../contexts/ToastContext";
import TagSuggestionCard from "./ai/TagSuggestionCard";
import { fetchHoldings, createTransaction, priceLookup } from "../api";
import { formatCurrencyForDisplay, todayISO } from "../utils/formatters";
import { TRANSACTION_TYPES, isIncomeTransactionType } from "../constants/enums";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

/**
 * Record a Buy/Sell/Dividend/Interest transaction against an already-known
 * holding -- extracted from HoldingDetail.jsx (where it's used against
 * "this page's holding") so Transactions.jsx can also offer it with a
 * holding picked from a dropdown instead. Same component, same mutation,
 * same funding-source/price-fetch behavior either way.
 */
export default function AddTransactionForm({ holding, onDone }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    transaction_type: "buy",
    transaction_date: todayISO(),
    quantity: "",
    price_per_unit: "",
    fees: "0",
    funding_source_holding_id: "",
  });
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [createdTx, setCreatedTx] = useState(null);

  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: form.transaction_type === "buy",
  });

  const mutation = useMutation({
    mutationFn: (payload) => createTransaction(holding.id, payload),
    onSuccess: (tx) => {
      queryClient.invalidateQueries({ queryKey: ["holding", String(holding.id)] });
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", String(holding.id)] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (tx.fundingSource) {
        queryClient.invalidateQueries({ queryKey: ["holding", String(tx.fundingSource.holdingId)] });
        queryClient.invalidateQueries({ queryKey: ["holding-valuations", String(tx.fundingSource.holdingId)] });
      }
      setCreatedTx(tx);
    },
    onError: (err) => toast.error(err.message || "Couldn't add that transaction"),
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
          max={todayISO()}
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
