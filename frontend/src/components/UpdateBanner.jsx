import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Tells you when a newer version of the app has been installed in the
 * background, so you are never stuck on an old copy without knowing. The
 * service worker takes over by itself (see sw.js); this only offers the
 * reload, and never reloads on its own, so a half-filled form is not lost.
 */
export function useUpdateReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
    const sw = navigator.serviceWorker;
    // A first-ever install also fires controllerchange; only an upgrade of an
    // already-controlled page means "a new version is ready".
    const hadController = Boolean(sw.controller);
    const onChange = () => {
      if (hadController) setReady(true);
    };
    sw.addEventListener("controllerchange", onChange);

    // Look for a new version now and then, not only when the app is reopened.
    const timer = setInterval(() => {
      sw.getRegistration?.()
        .then((reg) => reg?.update())
        .catch(() => {});
    }, CHECK_EVERY_MS);

    return () => {
      sw.removeEventListener("controllerchange", onChange);
      clearInterval(timer);
    };
  }, []);

  return ready;
}

export default function UpdateBanner() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.625rem 0.875rem",
        background: "var(--card)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)",
        fontSize: "0.875rem",
      }}
    >
      <span>A new version is ready.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.375rem 0.75rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.8125rem",
        }}
      >
        Reload
      </button>
    </div>
  );
}
