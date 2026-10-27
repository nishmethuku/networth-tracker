import { useEffect, useState } from "react";
import { isNativeApp } from "../utils/native";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires this once, early. Keep it at module level so a page that
// mounts later (Settings) can still use it.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Lets the app offer its own "Install" button where the browser supports it. */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return {
    installed: isStandalone(),
    canInstall: deferred !== null,
    iosHint: isIosSafari() && !isStandalone(),
    async install(): Promise<boolean> {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      listeners.forEach((fn) => fn());
      return choice.outcome === "accepted";
    },
  };
}
