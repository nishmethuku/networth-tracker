import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTransaction, ApiError } from "../api";
import { useToast } from "../contexts/ToastContext";
import useIsMobile from "../hooks/useIsMobile";
import { TRANSACTION_TYPES, isIncomeTransactionType } from "../constants/enums";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
  width: "100%",
};

const labelStyle = { fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" };

/**
 * Edits an existing transaction in place -- same PUT /transactions/<id>
 * the backend already supported with no frontend caller anywhere (the
 * only edit path in the app was deleting and re-adding). A modal rather
 * than an inline row expansion so the same component works whether it's
 * opened from the global Transactions table, a mobile TransactionCard, or
 * VirtualTransactionList's fixed-height virtualized rows.
 */
export default function EditTransactionModal({ transaction, onClose }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    transaction_type: transaction.transactionType,
    transaction_date: transaction.transactionDate,
    quantity: String(transaction.quantity ?? ""),
    price_per_unit: String(transaction.pricePerUnit ?? ""),
    fees: String(transaction.fees ?? 0),
    notes: transaction.notes || "",
  });

  const mutation = useMutation({
    mutationFn: (payload) => updateTransaction(transaction.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", String(transaction.holdingId)] });
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", String(transaction.holdingId)] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction updated");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update that transaction"),
  });

  const isIncome = isIncomeTransactionType(form.transaction_type);

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      transaction_type: form.transaction_type,
      transaction_date: form.transaction_date,
      quantity: isIncome ? 1 : parseFloat(form.quantity),
      price_per_unit: parseFloat(form.price_per_unit),
      fees: parseFloat(form.fees || 0),
      notes: form.notes || null,
    });
  }

  const Content = (
    <>
      <h3 style={{ marginBottom: "1rem", fontSize: "1.125rem", fontWeight: 700, color: "var(--text)" }}>
        Edit {transaction.holdingSymbol || transaction.holdingName}
      </h3>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.875rem" }}>
        <div>
          <label htmlFor="edit-tx-type" style={labelStyle}>
            Type
          </label>
          <select
            id="edit-tx-type"
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
          <label htmlFor="edit-tx-date" style={labelStyle}>
            Date
          </label>
          <input
            id="edit-tx-date"
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
            <label htmlFor="edit-tx-quantity" style={labelStyle}>
              Quantity
            </label>
            <input
              id="edit-tx-quantity"
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
          <label htmlFor="edit-tx-price" style={labelStyle}>
            {isIncome ? "Amount" : "Price / unit"}
          </label>
          <input
            id="edit-tx-price"
            type="number"
            step="any"
            min="0"
            value={form.price_per_unit}
            onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })}
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label htmlFor="edit-tx-fees" style={labelStyle}>
            Fees
          </label>
          <input
            id="edit-tx-fees"
            type="number"
            step="any"
            min="0"
            value={form.fees}
            onChange={(e) => setForm({ ...form, fees: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
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
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, backdropFilter: "blur(4px)" }}
      />
      {isMobile ? (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
            background: "var(--card)",
            borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
            padding: "0.75rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px))",
            boxShadow: "var(--shadow-lg)",
            maxHeight: "85vh",
            overflowY: "auto",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-dark)", margin: "0 auto 1rem" }} />
          {Content}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              padding: "2rem",
              borderRadius: "var(--radius-md)",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "var(--shadow-lg)",
              border: "1px solid var(--border)",
            }}
          >
            {Content}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
