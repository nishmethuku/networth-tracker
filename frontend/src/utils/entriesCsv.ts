import { cell } from "./historyCsv";
import type { FilterableEntry } from "./filterEntries";

/** Budget entries as CSV text (date, type, category, note, amount, currency), oldest first. */
export function entriesToCsv(entries: FilterableEntry[] | null | undefined): string {
  const rows = [...(entries ?? [])].sort((a, b) => a.entryDate.localeCompare(b.entryDate) || Number(a.id) - Number(b.id));
  const lines = [
    "date,type,category,note,amount,currency",
    ...rows.map((e) =>
      [
        cell(e.entryDate),
        cell(e.entryType),
        cell(e.category),
        cell(e.description ?? ""),
        cell(Math.round(e.amount * 100) / 100),
        cell(e.currency),
      ].join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}
