import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPriceCacheStatus } from "../../api";
import { priceFreshness } from "../../utils/priceFreshness";
import { formatDateISO, todayISO } from "../../utils/formatters";

/** A small line saying how current market prices are. Quiet when fine, a warning when they look old. */
export default function PriceFreshnessNote() {
  const { data } = useQuery({ queryKey: ["price-cache-status"], queryFn: fetchPriceCacheStatus, staleTime: 1000 * 60 * 10 });
  const info = useMemo(() => priceFreshness(data?.newestPriceDate, todayISO()), [data]);
  if (!info) return null;

  return (
    <p style={{ fontSize: "0.8125rem", margin: "0 0 1rem", color: info.stale ? "var(--danger)" : "var(--text-secondary)" }}>
      {info.stale ? "Market prices may be out of date. Latest stored prices are from " : "Market prices as of "}
      {formatDateISO(info.asOf)}.
    </p>
  );
}
