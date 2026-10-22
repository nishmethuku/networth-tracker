export function cell(value: string | number): string {
  const s = String(value);
  // Quote anything with a comma, quote or newline. Also defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Turns net worth snapshots into CSV text (date, net worth, currency), oldest first. */
export function historyToCsv(history: { date: string; netWorth: number }[] | null | undefined, currency: string): string {
  const rows = [...(history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const lines = [
    "date,net_worth,currency",
    ...rows.map((p) => [cell(p.date), cell(Math.round(p.netWorth * 100) / 100), cell(currency)].join(",")),
  ];
  return lines.join("\n") + "\n";
}
