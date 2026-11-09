import { SUPPORT_EMAIL } from "./LegalLayout";

// Plain answers to the questions people actually ask. Keep each answer short and concrete.
export const HELP_ITEMS = [
  [
    "How do I add gold or silver?",
    'Add a holding of type "Gold & Metals". Enter the units (grams or ounces) and the price per unit you want to use. It is not priced live, so edit the price when you want a new value.',
  ],
  [
    "How do I add a house or land?",
    'Add a holding of type "Real Estate" with a name and what it is worth today. No account is needed. To update the value later, open it and press "+ Add Update".',
  ],
  [
    "I bought the same stock several times. Why is there one row?",
    "Purchases of the same stock are combined into one row with the total. Click the arrow, or Show purchases, to see each one with its date, and to edit, sell or delete it.",
  ],
  [
    "What does XIRR mean?",
    "It is your yearly return that counts when each purchase was made. A stock bought long ago and one bought last month each count for the time you held them.",
  ],
  [
    "How do I add many holdings at once?",
    'Use Import CSV. The Holding Type column uses the same names as the Add Holding list, such as "Stocks", "Gold & Metals", "Real Estate" and "Cash & Bank Accounts".',
  ],
  [
    "How do I track a loan?",
    "Go to Liabilities and add it with the balance, interest rate and months left. Turn on automatic updates and the balance goes down each month using the EMI.",
  ],
  [
    "I deleted something by mistake.",
    'Holdings can be restored for 30 days. Open Portfolio, scroll to the bottom, and open "Recently deleted".',
  ],
  ["Why is the first page slow sometimes?", "The server may be waking up after a quiet period. Wait up to a minute and it loads normally."],
];

/** A short list of answers, with a contact link when the owner has set one up. */
export default function Help() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Help</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>Quick answers to common questions.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {HELP_ITEMS.map(([question, answer]) => (
          <details
            key={question}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text)" }}>{question}</summary>
            <p style={{ margin: "0.5rem 0 0", color: "var(--text-secondary)", lineHeight: 1.6 }}>{answer}</p>
          </details>
        ))}
      </div>
      {SUPPORT_EMAIL && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-secondary)" }}>
          Still stuck? <a href={`mailto:${SUPPORT_EMAIL}?subject=Net%20Worth%20Tracker%20help`}>Send a message</a>.
        </p>
      )}
    </div>
  );
}
