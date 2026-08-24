import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { fetchMilestones, acknowledgeMilestone } from "../api";
import { formatCurrencyCompact } from "../utils/formatters";

/**
 * A one-time celebration for a newly-crossed net worth milestone (e.g.
 * "$100,000"), detected server-side by the daily snapshot job. Polls the
 * same query the Milestones history card uses, so acknowledging here also
 * updates that list without a second fetch.
 */
export default function MilestoneCelebration() {
  const queryClient = useQueryClient();
  const { data: milestones } = useQuery({ queryKey: ["milestones"], queryFn: () => fetchMilestones() });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeMilestone,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["milestones"] }),
  });

  const unacknowledged = (milestones || []).filter((m) => !m.acknowledged).sort((a, b) => b.threshold - a.threshold)[0];

  return (
    <AnimatePresence>
      {unacknowledged && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15,23,42,0.5)",
            padding: "1rem",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            style={{
              background: "var(--card)",
              borderRadius: "var(--radius-lg)",
              padding: "2.5rem 2rem",
              maxWidth: 420,
              width: "90%",
              textAlign: "center",
              boxShadow: "var(--shadow-lg)",
              border: "1px solid var(--border)",
            }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", damping: 12 }}
              style={{ fontSize: "3.5rem", marginBottom: "1rem" }}
            >
              🎉
            </motion.div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
              You crossed {formatCurrencyCompact(unacknowledged.threshold, unacknowledged.currency)}!
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.75rem", lineHeight: 1.5 }}>
              Your net worth passed this milestone — a new high for your journey so far.
            </p>
            <button
              onClick={() => acknowledgeMutation.mutate(unacknowledged.id)}
              disabled={acknowledgeMutation.isPending}
              style={{
                padding: "0.75rem 2rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                fontWeight: 600,
                fontSize: "0.9375rem",
                cursor: "pointer",
              }}
            >
              {acknowledgeMutation.isPending ? "..." : "Nice!"}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
