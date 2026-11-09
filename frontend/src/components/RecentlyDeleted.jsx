import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDeletedHoldings, restoreHolding } from "../api";
import { useToast } from "../contexts/ToastContext";
import { getAssetTypeLabel } from "../constants/enums";
import { formatDateISO } from "../utils/formatters";

/** Holdings deleted in the last 30 days, each with a Restore button. Hidden when there are none. */
export default function RecentlyDeleted() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: rows } = useQuery({ queryKey: ["holdings", "deleted"], queryFn: fetchDeletedHoldings, staleTime: 1000 * 30 });

  const restore = useMutation({
    mutationFn: (id) => restoreHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Restored");
    },
    onError: (e) => toast.error(e?.message || "Could not restore this holding"),
  });

  if (!rows || rows.length === 0) return null;
  return (
    <details style={{ marginTop: "2rem", color: "var(--text-secondary)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text)" }}>Recently deleted ({rows.length})</summary>
      <p style={{ margin: "0.5rem 0" }}>Deleted by mistake? You can bring a holding back for 30 days, with its purchases.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {rows.map((r) => (
          <li key={r.id} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text)" }}>
              {r.symbol || r.name}{" "}
              <span style={{ color: "var(--text-muted)" }}>
                ({getAssetTypeLabel(r.assetType)}, deleted {formatDateISO(r.deletedAt)})
              </span>
            </span>
            <button
              onClick={() => restore.mutate(r.id)}
              disabled={restore.isPending}
              style={{
                fontSize: "0.8125rem",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "0.35rem 0.75rem",
              }}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
