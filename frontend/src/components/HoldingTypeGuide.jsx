import { Link } from "react-router-dom";
import { ASSET_TYPES, ASSET_TYPE_LABELS } from "../constants/enums";

// What to type for each kind of holding, in plain words. Shown to people who have nothing added yet.
export const HOLDING_TYPE_HELP = [
  [
    ASSET_TYPES.STOCK,
    "Enter the ticker (AAPL, or RELIANCE.NS for India), then each purchase: date, number of shares, price per share. The price updates by itself.",
  ],
  [
    ASSET_TYPES.MUTUAL_FUND,
    "Enter the fund name, then each purchase: date, units, price per unit (NAV). Indian funds update by themselves.",
  ],
  [
    ASSET_TYPES.CRYPTO,
    "Enter the coin name the way CoinGecko spells it, like bitcoin, then each purchase: date, amount, price paid per coin.",
  ],
  [
    ASSET_TYPES.COMMODITY,
    "For gold or silver, enter units (grams or ounces) and the price per unit you want to use. It is not priced live, so edit the price when you want a new value.",
  ],
  [ASSET_TYPES.REAL_ESTATE, "Enter a name and what it is worth today. No account needed. Add a new value whenever you want to update it."],
  [
    ASSET_TYPES.FIXED_DEPOSIT,
    "Enter the bank and the current value. No account needed. Add the interest rate and maturity date if you know them.",
  ],
  [ASSET_TYPES.PPF, "Enter the current balance. No account needed. Add a new balance each time you check your statement."],
  [ASSET_TYPES.EPF, "Enter the current balance. No account needed. Add a new balance each time you check your passbook."],
  [ASSET_TYPES.RETIRALS, "Enter the current balance of the retirement account, then update it from time to time."],
  [ASSET_TYPES.CASH, "Enter the bank account name and today's balance. Money moves and expenses can then come out of it."],
  [ASSET_TYPES.LOAN, "Money you owe is added on the Liabilities page, not here. This type is for loans you track as an asset."],
  [ASSET_TYPES.CREDIT, "Money other people owe you. Enter who and how much."],
];

/** A collapsed, plain-language "what do I type for this?" list. */
export default function HoldingTypeGuide() {
  return (
    <>
      <p style={{ textAlign: "center", margin: "0 auto 1rem" }}>
        <Link to="/start" style={{ fontWeight: 600 }}>
          Not sure where to start? Add your first holding step by step
        </Link>
      </p>
      <details style={{ maxWidth: "640px", margin: "0 auto 2rem", color: "var(--text-secondary)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text)" }}>
          Not sure what to enter? See an example for each type
        </summary>
        <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {HOLDING_TYPE_HELP.map(([type, text]) => (
            <li key={type} style={{ lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text)" }}>{ASSET_TYPE_LABELS[type]}:</strong> {text}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
