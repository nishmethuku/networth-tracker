import { yesterdayOf } from "./quickAdd";

export interface ParsedQuickEntry {
  amount?: number;
  /** YYYY-MM-DD when a day word was found, otherwise left for the form to decide. */
  date?: string;
  description: string;
  /** A category name matched from the words typed or from your frequent expenses. */
  category?: string;
}

export interface ParserContext {
  today: string;
  /** Stored category names, for matching words to a category. */
  categories: string[];
  labelFor?: (name: string) => string;
  /** Your frequent expenses, so "coffee" can fill the category you usually use. */
  frequent?: { category: string; description: string }[];
}

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The most recent past date (not today) that falls on the given weekday index (0 = Sunday). */
function lastWeekday(today: string, target: number): string {
  const current = new Date(`${today}T00:00:00Z`).getUTCDay();
  const back = (current - target + 7) % 7 || 7;
  return addDays(today, -back);
}

/**
 * Reads a short typed line like "coffee 4.50 yesterday" or "$12 lunch mon".
 * Understands one amount (with an optional $, ₹ or trailing currency sign), one
 * day word (today, yesterday, a weekday name, or "N days ago"), and treats the
 * rest as the note. Nothing is guessed: parts it cannot find are left out.
 */
export function parseQuickEntry(input: string, ctx: ParserContext): ParsedQuickEntry {
  const words = input.trim().split(/\s+/).filter(Boolean);
  let amount: number | undefined;
  let date: string | undefined;
  const rest: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lower = w.toLowerCase().replace(/[.,]+$/, "");

    // "3 days ago" / "1 day ago"
    if (/^\d{1,3}$/.test(lower) && /^days?$/.test((words[i + 1] ?? "").toLowerCase()) && (words[i + 2] ?? "").toLowerCase() === "ago") {
      date = addDays(ctx.today, -Number(lower));
      i += 2;
      continue;
    }
    if (lower === "today") {
      date = ctx.today;
      continue;
    }
    if (lower === "yesterday") {
      date = yesterdayOf(ctx.today);
      continue;
    }
    const wd = WEEKDAY_WORDS[lower];
    if (wd !== undefined) {
      date = lastWeekday(ctx.today, wd);
      continue;
    }

    const money = lower.match(/^[$₹€£]?(\d+(?:[.,]\d{1,2})?)[$₹€£]?$/);
    if (money && amount === undefined) {
      const value = Number(money[1].replace(",", "."));
      if (value > 0) {
        amount = value;
        continue;
      }
    }
    rest.push(w);
  }

  const description = rest.join(" ").trim();
  const text = description.toLowerCase();
  let category: string | undefined;
  if (text) {
    const label = ctx.labelFor ?? ((n: string) => n);
    category =
      ctx.categories.find((c) => c.toLowerCase() === text || label(c).toLowerCase() === text) ??
      ctx.frequent?.find((f) => f.description.toLowerCase() === text)?.category ??
      ctx.categories.find((c) => text.split(/\s+/).some((w) => w.length > 2 && (c.toLowerCase() === w || label(c).toLowerCase() === w)));
  }
  return { amount, date, description: description ? description[0].toUpperCase() + description.slice(1) : "", category };
}
