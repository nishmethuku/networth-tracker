import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * navigator.onLine banner. Scope note: this surfaces connectivity state and
 * lets pages check useOnlineStatus() to disable write actions while
 * offline — it does not queue/replay mutations made while offline. For a
 * finance app, silently queuing writes risks duplicate or lost
 * transactions if done without care; better to block writes with a clear
 * message than to half-build a sync layer.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

export default function OfflineIndicator() {
  const online = useOnlineStatus();

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 300,
            background: "var(--warning)",
            color: "#1c1917",
            textAlign: "center",
            padding: "0.5rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
          }}
        >
          You're offline — changes can't be saved until you reconnect.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
