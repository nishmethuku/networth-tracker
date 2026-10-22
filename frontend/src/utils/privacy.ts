import { useSyncExternalStore } from "react";

/**
 * Privacy mode: hides every amount the app formats as money, so the screen
 * can be shown to someone else. It is a convenience for shoulder-surfing,
 * not a security feature (the numbers are still in the page's data).
 * The choice is remembered on this device only.
 */
const STORAGE_KEY = "nw_privacy";
export const MASK = "••••";

let on = false;
try {
  on = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  on = false;
}

const listeners = new Set<() => void>();

export function isPrivacyOn(): boolean {
  return on;
}

export function setPrivacy(next: boolean): void {
  if (next === on) return;
  on = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage can be blocked (private windows); the choice then lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function togglePrivacy(): void {
  setPrivacy(!on);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while privacy mode is on; re-renders the caller when it changes. */
export function usePrivacy(): boolean {
  return useSyncExternalStore(subscribe, isPrivacyOn, () => false);
}
