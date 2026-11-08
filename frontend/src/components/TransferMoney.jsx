import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import { useToast } from "../contexts/ToastContext";
import { fetchHoldings, fetchTransfers, createTransfer, deleteTransfer, ApiError } from "../api";
import { formatCurrencyForDisplay } from "../utils/formatters";
import { refreshMoneyViews } from "../utils/refreshMoneyViews";

const fieldStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle = { display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem", color: "var(--text-secondary)" };

const today = () => new Date().toISOString().slice(0, 10);

/** Move money between two of your own cash accounts. Changes both balances; never counts as spending or income. */
export default function TransferMoney() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const { data: cash } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
  });
  const { data: transfers } = useQuery({ queryKey: ["transfers"], queryFn: fetchTransfers });

  const create = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      refreshMoneyViews(queryClient);
      toast.success("Transfer recorded. Both balances are updated");
      setAmount("");
      setNote("");
      setError("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not record the transfer"),
  });

  const undo = useMutation({
    mutationFn: deleteTransfer,
    onSuccess: () => {
      refreshMoneyViews(queryClient);
      toast.success("Transfer undone. The money is back");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not undo the transfer"),
  });

  function submit(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!from || !to) return setError("Pick the account the money leaves and the account it goes into");
    if (from === to) return setError("Pick two different accounts");
    if (!(value > 0)) return setError("Enter an amount greater than 0");
    setError("");
    create.mutate({ from_holding_id: from, to_holding_id: to, amount: value, transfer_date: date, note: note.trim() || undefined });
  }

  const options = (cash || []).map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
      {c.account ? ` (${c.account})` : ""}
    </option>
  ));

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <Card>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text)", margin: "0 0 0.25rem" }}>Move money between accounts</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 1rem" }}>
          Lowers one cash account and raises another. It is not counted as spending or income.
        </p>
        {(cash || []).length < 2 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
            Add at least two cash accounts to move money between them.
          </p>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <label style={labelStyle}>
              From
              <select aria-label="From account" value={from} onChange={(e) => setFrom(e.target.value)} style={fieldStyle}>
                <option value="">Choose account</option>
                {options}
              </select>
            </label>
            <label style={labelStyle}>
              To
              <select aria-label="To account" value={to} onChange={(e) => setTo(e.target.value)} style={fieldStyle}>
                <option value="">Choose account</option>
                {options}
              </select>
            </label>
            <label style={labelStyle}>
              Amount
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={labelStyle}>
              Date
              <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              Note (optional)
              <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} style={fieldStyle} />
            </label>
            {error && (
              <p role="alert" style={{ gridColumn: "1 / -1", color: "var(--danger)", fontSize: "0.8125rem", margin: 0 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={create.isPending}
              style={{
                gridColumn: "1 / -1",
                justifySelf: "start",
                padding: "0.625rem 1.25rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Record transfer
            </button>
          </form>
        )}

        {(transfers || []).length > 0 && (
          <div style={{ marginTop: "1.25rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", margin: "0 0 0.5rem" }}>Recent transfers</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {transfers.slice(0, 8).map((t) => (
                <li
                  key={t.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", fontSize: "0.875rem" }}
                >
                  <span style={{ color: "var(--text)" }}>
                    {t.from_name} to {t.to_name}
                    <span style={{ color: "var(--text-secondary)", marginLeft: "0.5rem" }}>{t.transfer_date}</span>
                    {t.note ? <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>{t.note}</span> : null}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>
                      {formatCurrencyForDisplay(t.amount, t.currency)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Undo transfer from ${t.from_name} to ${t.to_name}`}
                      disabled={undo.isPending}
                      onClick={() => {
                        if (window.confirm("Undo this transfer? The money goes back to the first account.")) undo.mutate(t.id);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--danger)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.25rem 0.6rem",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Undo
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
