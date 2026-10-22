import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rebuildNetWorthHistory, ApiError } from "../../api";
import { useToast } from "../../contexts/ToastContext";
import { isDemoMode } from "../../lib/demoMode";

const primaryBtn = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--primary)",
  color: "var(--text-inverse)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.8125rem",
};
const secondaryBtn = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "0.8125rem",
};

/** Plain-language summary of a rebuild result, used for the message under the button. */
export function describeRebuild(result) {
  switch (result?.status) {
    case "has_liabilities":
      return "This works only when you have no liabilities, because past debt balances are not recorded. Your chart will still grow every day.";
    case "nothing_recorded":
      return "Add a holding with a purchase date first, then past months can be rebuilt.";
    case "up_to_date":
      return "Every month since your first purchase already has a point on the chart.";
    case "preview": {
      const count = result.months?.length ?? 0;
      if (count === 0 && result.more_to_do) {
        return "Still collecting past prices, which can take a minute the first time. Press Rebuild history again to continue.";
      }
      if (count === 0) {
        return "No past month could be priced right now, so nothing was found to add.";
      }
      const skipped = result.skipped?.length ?? 0;
      return `Found ${count} past ${count === 1 ? "month" : "months"} starting ${result.months[0].date}${
        skipped > 0 ? ` (${skipped} skipped because a price was missing)` : ""
      }.`;
    }
    default:
      return "";
  }
}

/**
 * Shown under the net worth chart while it has very little history. Two steps
 * so nothing is saved by surprise: first a preview, then a confirm.
 */
export default function RebuildHistory({ pointCount }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (isDemoMode() || pointCount >= 3) return null;

  const run = async (apply) => {
    setBusy(true);
    try {
      const res = await rebuildNetWorthHistory(apply);
      if (apply && res.status === "saved") {
        const n = res.months?.length ?? 0;
        toast.success(
          `Added ${n} past ${n === 1 ? "month" : "months"} to your chart${res.more_to_do ? ". Run it again for older months." : ""}`,
        );
        setResult(null);
        await queryClient.invalidateQueries({ queryKey: ["net-worth-history"] });
      } else {
        setResult(res);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not rebuild history. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const canSave = result?.status === "preview" && (result.months?.length ?? 0) > 0;

  return (
    <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
      <div>Only a few days of history so far. You can fill in earlier months from your past purchases.</div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
        {!canSave && (
          <button style={secondaryBtn} onClick={() => run(false)} disabled={busy}>
            {busy ? "Checking…" : "Rebuild history"}
          </button>
        )}
        {canSave && (
          <>
            <button style={primaryBtn} onClick={() => run(true)} disabled={busy}>
              {busy ? "Saving…" : "Save these months"}
            </button>
            <button style={secondaryBtn} onClick={() => setResult(null)} disabled={busy}>
              Cancel
            </button>
          </>
        )}
      </div>
      {result && <div style={{ marginTop: "0.5rem" }}>{describeRebuild(result)}</div>}
    </div>
  );
}
