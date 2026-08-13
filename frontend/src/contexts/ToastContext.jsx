import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext();

const DEFAULT_DURATION = 3500;
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  const lastRateLimitToastAt = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((message, type = "info", duration = DEFAULT_DURATION) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = {
    toasts,
    dismiss,
    success: (message, duration) => push(message, "success", duration),
    error: (message, duration) => push(message, "error", duration),
    info: (message, duration) => push(message, "info", duration),
  };

  useEffect(() => {
    function handleRateLimited(e) {
      const now = Date.now();
      if (now - lastRateLimitToastAt.current < 5000) return; // avoid a toast storm from several requests hitting 429 together
      lastRateLimitToastAt.current = now;
      const retryAfter = e.detail?.retryAfter;
      const message = retryAfter
        ? `Too many requests — try again in ${retryAfter}s`
        : "Too many requests — please slow down and try again shortly";
      push(message, "error", 5000);
    }
    window.addEventListener("api:rate-limited", handleRateLimited);
    return () => window.removeEventListener("api:rate-limited", handleRateLimited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
