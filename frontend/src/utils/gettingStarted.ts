export interface Step {
  id: string;
  label: string;
  done: boolean;
  link: string;
}

/** The first things worth doing in the app, with what is already done. */
export function gettingStarted(args: { holdingCount: number; goalCount: number; budgetMonths: number; historyPoints: number }): {
  steps: Step[];
  allDone: boolean;
} {
  const steps: Step[] = [
    { id: "holding", label: "Add an account or holding", done: args.holdingCount > 0, link: "/add-holding" },
    { id: "goal", label: "Set a goal to aim for", done: args.goalCount > 0, link: "/" },
    { id: "budget", label: "Log some income or spending", done: args.budgetMonths > 0, link: "/budget" },
    { id: "history", label: "Come back tomorrow so your chart starts to fill in", done: args.historyPoints >= 3, link: "/" },
  ];
  return { steps, allDone: steps.every((s) => s.done) };
}
