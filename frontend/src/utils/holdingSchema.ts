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

    if (data.date && data.date > new Date().toISOString().split("T")[0]) {
      ctx.addIssue({ path: ["date"], code: z.ZodIssueCode.custom, message: "Date can't be in the future" });
    }
  });

/** The shape react-hook-form works with for the Add Holding form, derived
 * directly from the validation schema so the two can never drift apart. */
export type HoldingFormValues = z.infer<typeof holdingSchema>;
