import { useQuery } from "@tanstack/react-query";
import Card from "../Card";
import EmptyState from "../EmptyState";
import { fetchMilestones } from "../../api";
import { formatCurrencyCompact } from "../../utils/formatters";

function formatAchievedDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function MilestonesCard() {
  const { data: milestones, isLoading } = useQuery({ queryKey: ["milestones"], queryFn: () => fetchMilestones() });

  if (isLoading) return null;

  const sorted = [...(milestones || [])].sort((a, b) => a.threshold - b.threshold);

  return (
    <Card title="Milestones" subtitle="Net worth thresholds you've crossed, auto-detected from your daily history">
      {sorted.length === 0 ? (
        <EmptyState message="No milestones yet — the first one shows up once your net worth crosses $10,000." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", marginTop: "0.5rem" }}>
          {sorted.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.6rem 0",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--border-light)" : "none",
              }}
            >
              <span style={{ fontSize: "1.25rem" }}>🏆</span>
              <span style={{ fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.9375rem" }}>
                {formatCurrencyCompact(m.threshold, m.currency)}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginLeft: "auto" }}>
                {formatAchievedDate(m.achievedDate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
