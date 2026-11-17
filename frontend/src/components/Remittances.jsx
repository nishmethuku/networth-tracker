import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { useToast } from "../contexts/ToastContext";
import { fetchRemittances, createRemittance, updateRemittance, deleteRemittance, ApiError } from "../api";
import { formatCurrencyForDisplay, todayISO } from "../utils/formatters";
import { CURRENCIES } from "../constants/enums";
import { sortAz } from "../utils/sortAz";

const inputStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.8125rem",
  width: "100%",
};
const labelStyle = { fontSize: "0.7rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.2rem" };

const PROVIDERS = ["Bank wire", "Remitly", "Western Union", "Wise", "Xoom"];

function rateText(rate, from, to) {
  if (!rate) return "—";
  return `1 ${from} = ${rate.toFixed(rate >= 10 ? 2 : 4)} ${to}`;
}

function emptyForm() {
  return {
    sent_date: todayISO(),
    recipient: "",
    provider: "",
    amount_sent: "",
    currency_sent: "USD",
    amount_received: "",
    currency_received: "INR",
    fee: "",
    note: "",
  };
}

function SummaryCard({ s }) {
  const max = Math.max(1, ...s.months.map((m) => m.sent));
  return (
    <Card title={`${s.currency_sent} to ${s.currency_received}`}>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginTop: "0.5rem" }}>
        <Stat label={`Sent in ${s.year}`} value={formatCurrencyForDisplay(s.year_sent, s.currency_sent, { includeCode: false })} />
        <Stat
          label={`Received in ${s.year}`}
          value={formatCurrencyForDisplay(s.year_received, s.currency_received, { includeCode: false })}
        />
        <Stat label="Average rate you got" value={rateText(s.average_rate, s.currency_sent, s.currency_received)} />
        <Stat
          label="Fees paid"
          value={`${formatCurrencyForDisplay(s.total_fees, s.currency_sent, { includeCode: false })} (${s.fee_percent}%)`}
        />
        <Stat label="Best rate" value={rateText(s.best_rate, s.currency_sent, s.currency_received)} />
        <Stat label="Worst rate" value={rateText(s.worst_rate, s.currency_sent, s.currency_received)} />
      </div>
      <p style={{ margin: "1rem 0 0.4rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>Sent each month, last 12 months</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }} role="img" aria-label="Amount sent each month">
        {s.months.map((m) => (
          <div
            key={m.month}
            title={`${m.month}: ${formatCurrencyForDisplay(m.sent, s.currency_sent, { includeCode: false })}`}
            style={{
              flex: 1,
              height: `${Math.max(m.sent > 0 ? 6 : 2, (m.sent / max) * 100)}%`,
              background: m.sent > 0 ? "var(--primary)" : "var(--border)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
        <span>{s.months[0].month}</span>
        <span>{s.months[s.months.length - 1].month}</span>
      </div>
      {s.recipients.length > 1 && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          By person:{" "}
          {s.recipients
            .map((r) => `${r.recipient} ${formatCurrencyForDisplay(r.sent, s.currency_sent, { includeCode: false })}`)
            .join(" · ")}
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

export default function Remittances() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ["remittances"], queryFn: fetchRemittances });
  const items = data?.items || [];
  const summary = data?.summary || [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        amount_sent: parseFloat(form.amount_sent),
        amount_received: parseFloat(form.amount_received),
        fee: form.fee === "" ? 0 : parseFloat(form.fee),
      };
      return editingId ? updateRemittance(editingId, payload) : createRemittance(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remittances"] });
      toast.success(editingId ? "Remittance updated" : "Remittance added");
      // Keep the currencies and person so the next one is quick to enter.
      setForm({
        ...emptyForm(),
        currency_sent: form.currency_sent,
        currency_received: form.currency_received,
        recipient: form.recipient,
        provider: form.provider,
      });
      setEditingId(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRemittance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remittances"] });
      toast.success("Removed");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove"),
  });

  const sent = parseFloat(form.amount_sent);
  const received = parseFloat(form.amount_received);
  const liveRate = sent > 0 && received > 0 ? received / sent : null;

  function startEdit(r) {
    setEditingId(r.id);
    setForm({
      sent_date: r.sent_date,
      recipient: r.recipient,
      provider: r.provider || "",
      amount_sent: String(r.amount_sent),
      currency_sent: r.currency_sent,
      amount_received: String(r.amount_received),
      currency_received: r.currency_received,
      fee: r.fee ? String(r.fee) : "",
      note: r.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Money sent home</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Log each transfer to family abroad to see the rate you really got, the fees you paid and how much you sent this year. This is a log
        only. It does not change any of your balances.
      </p>

      <Card title={editingId ? "Edit transfer" : "Log a transfer"}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            alignItems: "end",
            marginTop: "0.5rem",
          }}
        >
          <div>
            <label htmlFor="rem-date" style={labelStyle}>
              Date
            </label>
            <input
              id="rem-date"
              type="date"
              value={form.sent_date}
              max={todayISO()}
              onChange={set("sent_date")}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label htmlFor="rem-to" style={labelStyle}>
              Sent to
            </label>
            <input id="rem-to" value={form.recipient} onChange={set("recipient")} placeholder="e.g. Mom" style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="rem-provider" style={labelStyle}>
              Provider (optional)
            </label>
            <input
              id="rem-provider"
              list="rem-providers"
              value={form.provider}
              onChange={set("provider")}
              placeholder="e.g. Wise"
              style={inputStyle}
            />
            <datalist id="rem-providers">
              {PROVIDERS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="rem-sent" style={labelStyle}>
              You paid (fee included)
            </label>
            <input
              id="rem-sent"
              type="number"
              step="any"
              min="0.01"
              value={form.amount_sent}
              onChange={set("amount_sent")}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label htmlFor="rem-sent-cur" style={labelStyle}>
              Currency paid
            </label>
            <select id="rem-sent-cur" value={form.currency_sent} onChange={set("currency_sent")} style={inputStyle}>
              {sortAz(CURRENCIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-received" style={labelStyle}>
              They received
            </label>
            <input
              id="rem-received"
              type="number"
              step="any"
              min="0.01"
              value={form.amount_received}
              onChange={set("amount_received")}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label htmlFor="rem-received-cur" style={labelStyle}>
              Currency received
            </label>
            <select id="rem-received-cur" value={form.currency_received} onChange={set("currency_received")} style={inputStyle}>
              {sortAz(CURRENCIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-fee" style={labelStyle}>
              Fee included (optional)
            </label>
            <input id="rem-fee" type="number" step="any" min="0" value={form.fee} onChange={set("fee")} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="rem-note" style={labelStyle}>
              Note (optional)
            </label>
            <input id="rem-note" value={form.note} onChange={set("note")} maxLength={200} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              {saveMutation.isPending ? "Saving…" : editingId ? "Save changes" : "Add transfer"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        {liveRate && (
          <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Rate you got: {rateText(liveRate, form.currency_sent, form.currency_received)}
          </p>
        )}
      </Card>

      {isLoading ? null : items.length === 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <EmptyState message="No transfers logged yet. Add the last one you sent to see your real rate and fees." />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "1.25rem", marginTop: "1.5rem" }}>
            {summary.map((s) => (
              <SummaryCard key={`${s.currency_sent}-${s.currency_received}`} s={s} />
            ))}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <Card title="History">
              <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.5rem" }}>Date</th>
                      <th style={{ padding: "0.5rem" }}>To</th>
                      <th style={{ padding: "0.5rem" }}>Paid</th>
                      <th style={{ padding: "0.5rem" }}>Received</th>
                      <th style={{ padding: "0.5rem" }}>Rate</th>
                      <th style={{ padding: "0.5rem" }}>Fee</th>
                      <th style={{ padding: "0.5rem" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "0.5rem" }}>{r.sent_date}</td>
                        <td style={{ padding: "0.5rem" }}>
                          {r.recipient}
                          {r.provider ? <span style={{ color: "var(--text-muted)" }}> · {r.provider}</span> : null}
                        </td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>
                          {formatCurrencyForDisplay(r.amount_sent, r.currency_sent, { includeCode: false, alwaysCents: true })}
                        </td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>
                          {formatCurrencyForDisplay(r.amount_received, r.currency_received, { includeCode: false })}
                        </td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>{r.effective_rate ?? "—"}</td>
                        <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>
                          {r.fee ? formatCurrencyForDisplay(r.fee, r.currency_sent, { includeCode: false, alwaysCents: true }) : "—"}
                        </td>
                        <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            aria-label={`Edit transfer to ${r.recipient} on ${r.sent_date}`}
                            onClick={() => startEdit(r)}
                            style={{
                              fontSize: "0.7rem",
                              background: "transparent",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                              marginRight: 4,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete transfer to ${r.recipient} on ${r.sent_date}`}
                            onClick={() => deleteMutation.mutate(r.id)}
                            style={{
                              fontSize: "0.7rem",
                              background: "transparent",
                              border: "1px solid var(--border)",
                              color: "var(--danger)",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
