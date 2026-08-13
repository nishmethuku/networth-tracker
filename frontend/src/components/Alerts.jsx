import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAlerts, createAlert, deleteAlert, fetchHoldings, ApiError } from "../api";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { isQuantityBased } from "../constants/enums";

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

export default function Alerts() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ kind: "price", holdingId: "", direction: "above", threshold: "", currency: "USD" });

  const { data: alerts, isLoading, isError, error, refetch } = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const { data: holdings } = useQuery({ queryKey: ["holdings", "USD", ""], queryFn: () => fetchHoldings({ currency: "USD" }) });

  const quantityHoldings = (holdings || []).filter((h) => isQuantityBased(h.assetType));

  const createMutation = useMutation({
    mutationFn: (payload) => createAlert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setForm({ kind: "price", holdingId: "", direction: "above", threshold: "", currency: "USD" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (form.kind === "price") {
      const holding = quantityHoldings.find((h) => String(h.id) === form.holdingId);
      if (!holding) return;
      createMutation.mutate({
        holding_id: holding.id,
        symbol: holding.symbol,
        asset_type: holding.assetType,
        alert_type: form.direction === "above" ? "price_above" : "price_below",
        threshold: parseFloat(form.threshold),
        currency: holding.currency,
      });
    } else {
      createMutation.mutate({
        alert_type: form.direction === "above" ? "net_worth_above" : "net_worth_below",
        threshold: parseFloat(form.threshold),
        currency: form.currency,
      });
    }
  }

  if (isLoading) return <LoadingState message="Loading alerts..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load alerts"} onRetry={refetch} />;

  const active = (alerts || []).filter((a) => a.status === "active");
  const triggered = (alerts || []).filter((a) => a.status === "triggered");

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Alerts</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Get notified by email when a holding hits a price, or your net worth crosses a threshold.
      </p>

      <Card>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={() => setForm({ ...form, kind: "price" })} style={{ ...inputStyle, flex: 1, cursor: "pointer", background: form.kind === "price" ? "var(--primary-light)" : "var(--bg)", color: form.kind === "price" ? "var(--primary)" : "var(--text)" }}>
              Holding Price
            </button>
            <button type="button" onClick={() => setForm({ ...form, kind: "networth" })} style={{ ...inputStyle, flex: 1, cursor: "pointer", background: form.kind === "networth" ? "var(--primary-light)" : "var(--bg)", color: form.kind === "networth" ? "var(--primary)" : "var(--text)" }}>
              Net Worth
            </button>
          </div>

          {form.kind === "price" ? (
            <select value={form.holdingId} onChange={(e) => setForm({ ...form, holdingId: e.target.value })} style={inputStyle} required>
              <option value="">Select a holding...</option>
              {quantityHoldings.map((h) => <option key={h.id} value={h.id}>{h.symbol || h.name}</option>)}
            </select>
          ) : (
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
              <option value="AUD">AUD</option>
            </select>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} style={inputStyle}>
              <option value="above">Notify when above</option>
              <option value="below">Notify when below</option>
            </select>
            <input type="number" step="any" min="0" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="Threshold" style={{ ...inputStyle, flex: 1 }} required />
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || (form.kind === "price" && !form.holdingId)}
            style={{ padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}
          >
            {createMutation.isPending ? "Creating..." : "Create Alert"}
          </button>
        </form>
      </Card>

      <div style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>Active</h2>
        {active.length === 0 ? (
          <EmptyState message="No active alerts." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {active.map((a) => (
              <Card key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    <strong>{a.symbol || "Net Worth"}</strong>{" "}
                    {a.alertType.replace("_", " ")} {a.threshold.toLocaleString()} {a.currency}
                  </span>
                  <button onClick={() => deleteMutation.mutate(a.id)} style={{ fontSize: "0.8125rem", background: "var(--danger)", color: "white", padding: "0.4rem 0.75rem" }}>
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {triggered.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>Triggered</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {triggered.map((a) => (
              <Card key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.7 }}>
                  <span>
                    <strong>{a.symbol || "Net Worth"}</strong>{" "}
                    {a.alertType.replace("_", " ")} {a.threshold.toLocaleString()} {a.currency}
                  </span>
                  <button onClick={() => deleteMutation.mutate(a.id)} style={{ fontSize: "0.8125rem", background: "var(--danger)", color: "white", padding: "0.4rem 0.75rem" }}>
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
