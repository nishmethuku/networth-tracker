export type GlossaryTerm = "xirr" | "cagr" | "unrealized" | "realized" | "savingsRate" | "moneyHealth" | "emergencyFund" | "stressTest";

export const GLOSSARY: Record<GlossaryTerm, { name: string; text: string }> = {
  xirr: {
    name: "XIRR",
    text: "Your yearly return rate, taking into account when you put money in and took it out. It lets you compare investments bought at different times.",
  },
  cagr: {
    name: "CAGR",
    text: "The steady yearly growth rate that would turn the starting amount into the ending amount. Real years go up and down, so this is an average.",
  },
  unrealized: {
    name: "Unrealized gains",
    text: "Profit or loss on investments you still own. It only becomes real money when you sell.",
  },
  realized: {
    name: "Realized gains",
    text: "Profit or loss you locked in by selling. This is the number that usually matters for taxes.",
  },
  savingsRate: {
    name: "Savings rate",
    text: "The share of your income you keep instead of spending. Many people aim for 20 percent or more.",
  },
  moneyHealth: {
    name: "Money Health",
    text: "A quick score from four rules of thumb: an emergency cushion, not too much in one holding, a mix of asset types, and low debt. It is a nudge, not advice.",
  },
  emergencyFund: {
    name: "Emergency fund",
    text: "Cash you can reach quickly to cover living costs if income stops. Three to six months of spending is the common target.",
  },
  stressTest: {
    name: "Stress test",
    text: "Shows what a sharp drop in one area would do to your net worth. It is a what-if, not a forecast.",
  },
};
