import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Tells you when a newer version of the app has been installed in the
 * background, so you are never stuck on an old copy without knowing. Browsers
 * can leave the new version "waiting" instead of switching to it, so this
 * watches for a waiting worker as well as for the switch itself. It never
 * reloads on its own, so a half-filled form is not lost.
 */
export function useUpdateReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
    const sw = navigator.serviceWorker;
    // A first-ever install also fires controllerchange or "installed"; only an
    // upgrade of an already-controlled page means "a new version is ready".
    const hadController = Boolean(sw.controller);
    let cancelled = false;
    const cleanups = [];

    const markReady = () => {
      if (!cancelled && hadController) setReady(true);
    };

    const onControllerChange = () => markReady();
    sw.addEventListener("controllerchange", onControllerChange);
    cleanups.push(() => sw.removeEventListener("controllerchange", onControllerChange));

    const watch = (registration) => {
      if (!registration) return;
      if (registration.waiting) markReady();
      const onUpdateFound = () => {
        const worker = registration.installing;
        if (!worker) return;
        const onState = () => {
          if (worker.state === "installed") markReady();
        };
        worker.addEventListener("statechange", onState);
        cleanups.push(() => worker.removeEventListener("statechange", onState));
      };
      registration.addEventListener?.("updatefound", onUpdateFound);
      cleanups.push(() => registration.removeEventListener?.("updatefound", onUpdateFound));
    };

    sw.getRegistration?.()
      .then(watch)
      .catch(() => {});

    // Look for a new version now and then, not only when the app is reopened.
    const timer = setInterval(() => {
      sw.getRegistration?.()
        .then((reg) => reg?.update())
        .catch(() => {});
    }, CHECK_EVERY_MS);
    cleanups.push(() => clearInterval(timer));

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return ready;
}

/** Ask a waiting worker to take over, then reload once it has. Falls back to a plain reload. */
export async function applyUpdate() {
  const reload = () => window.location.reload();
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.waiting) {
      navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      // If the takeover never fires, do not leave the button looking dead.
      setTimeout(reload, 2500);
      return;
    }
  } catch {
    // fall through to a plain reload
  }
  reload();
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
        onClick={applyUpdate}
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
