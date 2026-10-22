import { useMemo } from "react";
import { Link } from "react-router-dom";
import Card from "../Card";
import { isQuantityBased } from "../../constants/enums";
import { needsAttention } from "../../utils/needsAttention";
import { backupDue } from "../../utils/freshness";
import { readLastBackup } from "../../utils/backupReminder";
import { todayISO } from "../../utils/formatters";

/** A short to-do list of values that may be out of date. Hidden when there is nothing to do. */
export default function NeedsAttentionCard({ holdings }) {
  const items = useMemo(() => {
    const list = needsAttention(
      (holdings || []).map((h) => ({
        id: h.id,
        label: h.symbol || h.name || "A holding",
        quantityBased: isQuantityBased(h.assetType),
        currentPrice: h.currentPrice ?? null,
        updatedAt: h.updatedAt || "",
      })),
    );
    if ((holdings || []).length > 0 && backupDue(readLastBackup(), todayISO())) {
      list.push({ id: "backup", message: "You have not downloaded a backup of your data in over 30 days.", link: "/settings" });
    }
    return list;
  }, [holdings]);
  if (items.length === 0) return null;

  return (
    <Card title="Needs your attention" subtitle="Small things that keep your numbers accurate">
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((i) => (
          <li key={i.id} style={{ color: "var(--text)", fontSize: "0.9375rem" }}>
            {i.message}{" "}
            <Link to={i.link} style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
              Review
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
