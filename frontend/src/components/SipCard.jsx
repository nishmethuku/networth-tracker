import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import NumericInput from "./NumericInput";
import { useForm } from "react-hook-form";
import { useToast } from "../contexts/ToastContext";
import { fetchSipProjection, updateHolding, ApiError } from "../api";
import { formatCurrencyForDisplay } from "../utils/formatters";

const YEAR_OPTIONS = [5, 10, 15, 20, 25];

function SipSetupForm({ holding, onDone }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, control, handleSubmit } = useForm({
    defaultValues: {
      sip_amount: holding.sipAmount ?? "",
      sip_frequency: holding.sipFrequency ?? "monthly",
      sip_start_date: holding.sipStartDate ?? new Date().toISOString().split("T")[0],
    },
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      updateHolding(holding.id, {
        sip_amount: data.sip_amount ? parseFloat(data.sip_amount) : null,
        sip_frequency: data.sip_amount ? data.sip_frequency : null,
        sip_start_date: data.sip_amount ? data.sip_start_date : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holding", String(holding.id)] });
      toast.success("SIP settings saved");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to save SIP settings"),
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
      <div>
        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Amount</label>
        <NumericInput control={control} name="sip_amount" style={{ width: "100%", padding: "0.625rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
      </div>
      <div>
        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Frequency</label>
        <select {...register("sip_frequency")} style={{ width: "100%", padding: "0.625rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>
      <div>
        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Start date</label>
        <input type="date" {...register("sip_start_date")} style={{ width: "100%", padding: "0.625rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
      </div>
      <button type="submit" disabled={mutation.isPending} style={{ padding: "0.625rem 1.25rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}>
        {mutation.isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export default function SipCard({ holding }) {
  const [editing, setEditing] = useState(false);
  const [years, setYears] = useState(10);
  const isSip = !!(holding.sipAmount && holding.sipFrequency && holding.sipStartDate);

  const { data: projection, isLoading } = useQuery({
    queryKey: ["sip-projection", holding.id, years],
    queryFn: () => fetchSipProjection(holding.id, years),
    enabled: isSip,
  });

  if (!isSip && !editing) {
    return (
      <Card title="Recurring investment (SIP)">
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
          Track this as a recurring investment to see upcoming contribution dates and a projected future value.
        </p>
        <button onClick={() => setEditing(true)} style={{ padding: "0.5rem 1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", cursor: "pointer", fontSize: "0.875rem" }}>
          Set up SIP
        </button>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card title="Recurring investment (SIP)">
        <SipSetupForm holding={holding} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card title="Recurring investment (SIP)">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {formatCurrencyForDisplay(holding.sipAmount, holding.currency)} / {holding.sipFrequency}
        </div>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500 }}>
          Edit
        </button>
      </div>

      {projection?.upcoming_dates?.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Upcoming contributions</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {projection.upcoming_dates.map((d) => (
              <span key={d} style={{ padding: "0.25rem 0.625rem", borderRadius: "999px", background: "var(--bg-secondary)", fontSize: "0.75rem", color: "var(--text)" }}>
                {new Date(d).toLocaleDateString()}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Projected value in</span>
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "0.8125rem" }}>
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y} years</option>)}
        </select>
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Calculating...</p>
      ) : projection ? (
        <>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>
            {formatCurrencyForDisplay(projection.projected_value, holding.currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Assumes {(projection.assumed_annual_rate * 100).toFixed(1)}% annual return (this holding's current XIRR, or 8% if not yet available) and {formatCurrencyForDisplay(projection.total_contributions, holding.currency)} in future contributions. Not a guarantee.
          </div>
        </>
      ) : null}
    </Card>
  );
}
