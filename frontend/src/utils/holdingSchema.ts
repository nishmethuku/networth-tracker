import { z } from "zod";
import { isQuantityBased } from "../constants/enums";

const SYMBOL_REQUIRED_TYPES = ["stock", "mutual_fund", "crypto", "commodity"];
const NAME_REQUIRED_TYPES = ["real_estate", "fixed_deposit", "ppf", "epf", "retirals", "cash", "loan", "credit"];

function isPositiveNumberString(value: string | undefined): boolean {
  const n = parseFloat(value as string);
  return value !== "" && value != null && !Number.isNaN(n) && n > 0;
}

function isNonNegativeNumberString(value: string | undefined): boolean {
  const n = parseFloat(value as string);
  return value !== "" && value != null && !Number.isNaN(n) && n >= 0;
}

/** Today's date as YYYY-MM-DD in the *local* timezone -- matching what an
 * <input type="date"> actually stores and what `data.date` here holds.
 * `new Date().toISOString()` gives the UTC date instead, which is a
 * different calendar day from local for part of every day in any
 * non-UTC-0 timezone: e.g. for a UTC+5:30 (India) user, local time is
 * already "tomorrow" once it's past 6:30pm UTC (midnight IST), so
 * comparing against the UTC date rejected today's own date as "in the
 * future" for roughly a third of the day. */
export function todayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const holdingSchema = z
  .object({
    assetType: z.string().min(1),
    country: z.string().min(1, "Country is required"),
    currency: z.string().optional(),
    account: z.string().optional(),
    is_private: z.boolean().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    symbol: z.string().optional(),
    name: z.string().optional(),
    institution: z.string().optional(),
    interest_rate: z.string().optional(),
    maturity_date: z.string().optional(),
    quantity: z.string().optional(),
    price_per_unit: z.string().optional(),
    value: z.string().optional(),
    funding_source_holding_id: z.string().optional(),
    sip_enabled: z.boolean().optional(),
    sip_amount: z.string().optional(),
    sip_frequency: z.string().optional(),
    sip_start_date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (SYMBOL_REQUIRED_TYPES.includes(data.assetType) && !data.symbol?.trim()) {
      ctx.addIssue({ path: ["symbol"], code: z.ZodIssueCode.custom, message: "Symbol is required" });
    }
    if (NAME_REQUIRED_TYPES.includes(data.assetType) && !data.name?.trim()) {
      ctx.addIssue({ path: ["name"], code: z.ZodIssueCode.custom, message: "Name is required" });
    }

    if (isQuantityBased(data.assetType)) {
      if (!isPositiveNumberString(data.quantity)) {
        ctx.addIssue({ path: ["quantity"], code: z.ZodIssueCode.custom, message: "Quantity must be greater than 0" });
      }
      if (!isNonNegativeNumberString(data.price_per_unit)) {
        ctx.addIssue({ path: ["price_per_unit"], code: z.ZodIssueCode.custom, message: "Price must be 0 or greater" });
      }
    } else if (!isNonNegativeNumberString(data.value)) {
      ctx.addIssue({ path: ["value"], code: z.ZodIssueCode.custom, message: "Value must be 0 or greater" });
    }

    if (data.date && data.date > todayLocalDateString()) {
      ctx.addIssue({ path: ["date"], code: z.ZodIssueCode.custom, message: "Date can't be in the future" });
    }
  });

/** The shape react-hook-form works with for the Add Holding form, derived
 * directly from the validation schema so the two can never drift apart. */
export type HoldingFormValues = z.infer<typeof holdingSchema>;
