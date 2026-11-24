import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../contexts/ToastContext";
import { fetchHoldings, createTransfer, ApiError } from "../../api";
import { todayISO } from "../../utils/formatters";
import { refreshMoneyViews } from "../../utils/refreshMoneyViews";
import { sortAz } from "../../utils/sortAz";

const labelStyle = { fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" };

/** Move money from one of your cash or bank accounts to another. It is not counted as spending or income. */
export default function TransferEntryForm({ inputStyle }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
  });

  const create = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      refreshMoneyViews(queryClient);
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      toast.success("Transfer recorded. Both balances are updated");
      setAmount("");
      setNote("");
      setError("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not record the transfer"),
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

  if (isLoading) {
    return (
      <p role="status" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
        Loading your accounts, the first load can take a few seconds...
      </p>
    );
  }
  if ((accounts || []).length < 2) {
    return (
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
        Add at least two cash or bank accounts to move money between them.
      </p>
    );
  }

  const options = sortAz(accounts, (c) => c.name).map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
      {c.account ? ` (${c.account})` : ""}
    </option>
  ));

  return (
    <form onSubmit={submit} noValidate>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
        <div>
          <label htmlFor="transfer-from" style={labelStyle}>
            From
          </label>
          <select id="transfer-from" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle}>
            <option value="">Choose account</option>
            {options}
          </select>
        </div>
        <div>
          <label htmlFor="transfer-to" style={labelStyle}>
            To
          </label>
          <select id="transfer-to" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle}>
            <option value="">Choose account</option>
            {options}
          </select>
        </div>
        <div>
          <label htmlFor="transfer-amount" style={labelStyle}>
            Amount
          </label>
          <input
            id="transfer-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="transfer-date" style={labelStyle}>
            Date
          </label>
          <input
            id="transfer-date"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <label htmlFor="transfer-note" style={labelStyle}>
          Note (optional)
        </label>
        <input id="transfer-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </div>
      {error && (
        <p role="alert" style={{ margin: "0.75rem 0 0", color: "var(--danger)", fontSize: "0.8125rem" }}>
          {error}
        </p>
      )}
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
        Lowers one account and raises the other. It is not counted as spending or income.
      </p>
      <button
        type="submit"
        disabled={create.isPending}
        style={{
          marginTop: "0.75rem",
          padding: "0.625rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          fontWeight: 600,
          cursor: "pointer",
          opacity: create.isPending ? 0.6 : 1,
        }}
      >
        {create.isPending ? "Moving..." : "Move money"}
      </button>
    </form>
  );
}
