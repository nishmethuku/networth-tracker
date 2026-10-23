import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "../Card";
import { fetchSubscriptions } from "../../api";
import { AUTO_LOG_KEY } from "../../hooks/useAutoLogRecurring";

function readFlag() {
  try {
    return localStorage.getItem(AUTO_LOG_KEY) === "1";
  } catch {
    return false;
  }
}

/** A switch for logging recurring bills on their own. Only shown once you have recurring bills. */
export default function AutoLogSetting({ currency, householdId }) {
  const [on, setOn] = useState(readFlag);
  const { data } = useQuery({
    queryKey: ["budget-subscriptions", currency, householdId],
    queryFn: () => fetchSubscriptions({ currency, householdId }),
  });
  if (!data?.items?.length) return null;

  return (
    <Card title="Recurring bills">
      <label
        style={{
          display: "flex",
          gap: "0.6rem",
          alignItems: "flex-start",
          marginTop: "0.5rem",
          color: "var(--text)",
          fontSize: "0.9375rem",
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            try {
              localStorage.setItem(AUTO_LOG_KEY, e.target.checked ? "1" : "0");
              localStorage.removeItem("nw_auto_log_last");
            } catch {
              /* ignore */
            }
          }}
        />
        <span>
          Log my recurring bills automatically when they come due
          <span style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
            Happens when you open the app, on this device. Only expenses and income you marked as recurring, never a card or account
            balance.
          </span>
        </span>
      </label>
    </Card>
  );
}
