import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  dismiss: (id: number) => void;
  success: (message: string, duration?: number) => number;
  error: (message: string, duration?: number) => number;
  info: (message: string, duration?: number) => number;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 3500;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastRateLimitToastAt = useRef(0);
  const lastColdStartToastAt = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    (message: string, type: ToastType = "info", duration: number = DEFAULT_DURATION) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    toasts,
    dismiss,
    success: (message, duration) => push(message, "success", duration),
    error: (message, duration) => push(message, "error", duration),
    info: (message, duration) => push(message, "info", duration),
  };

  useEffect(() => {
    function handleRateLimited(e: Event) {
      const now = Date.now();
      if (now - lastRateLimitToastAt.current < 5000) return; // avoid a toast storm from several requests hitting 429 together
      lastRateLimitToastAt.current = now;
      const retryAfter = (e as CustomEvent).detail?.retryAfter;
      const message = retryAfter
        ? `Too many requests — try again in ${retryAfter}s`
        : "Too many requests — please slow down and try again shortly";
      push(message, "error", 5000);
    }
    window.addEventListener("api:rate-limited", handleRateLimited);
    return () => window.removeEventListener("api:rate-limited", handleRateLimited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleColdStartRetry() {
      const now = Date.now();
      if (now - lastColdStartToastAt.current < 10000) return; // several parallel GETs can all hit this within the same cold start
      lastColdStartToastAt.current = now;
      push("Waking up the server — first load can take up to a minute or two on the free tier. Hang tight!", "info", 12000);
    }
    window.addEventListener("api:cold-start-retry", handleColdStartRetry);
    return () => window.removeEventListener("api:cold-start-retry", handleColdStartRetry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
