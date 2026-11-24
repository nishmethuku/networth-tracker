/**
 * Keeps the last successful answers on this device, so the app can paint real numbers the moment it
 * opens and refresh them quietly in the background, instead of staring at a spinner while a slow
 * server wakes up.
 *
 * The saved copy belongs to one signed-in user: it is only used for that same user, it is thrown
 * away on sign-out, and it expires after a day.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";

export const PERSIST_KEY = "nw-query-cache-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 2_000_000;
const WRITE_DELAY_MS = 1500;

// Never worth keeping: one-off AI answers and anything that is not plain page data.
const SKIP_PREFIXES = new Set(["ai", "ai-chat", "ai-filter", "smart-import"]);

function persistable(query) {
  if (query.state.status !== "success") return false;
  const first = Array.isArray(query.queryKey) ? query.queryKey[0] : null;
  return typeof first === "string" && !SKIP_PREFIXES.has(first);
}

export function clearPersistedQueryCache() {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* storage can be blocked */
  }
}

/** Load the saved answers for this user into the cache. Returns how many queries were restored. */
export function restoreQueryCache(queryClient, userId) {
  if (!userId) return 0;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw);
    if (saved.userId !== userId || Date.now() - saved.savedAt > MAX_AGE_MS) {
      clearPersistedQueryCache();
      return 0;
    }
    hydrate(queryClient, saved.state);
    return saved.state?.queries?.length || 0;
  } catch {
    clearPersistedQueryCache();
    return 0;
  }
}

/** Start saving the cache (a moment after it changes). Returns a function that stops it. */
export function startPersistingQueryCache(queryClient, userId) {
  if (!userId) return () => {};
  let timer = null;
  const write = () => {
    timer = null;
    try {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: persistable });
      const text = JSON.stringify({ userId, savedAt: Date.now(), state });
      if (text.length > MAX_BYTES) return;
      localStorage.setItem(PERSIST_KEY, text);
    } catch {
      /* storage full or blocked: the app just loads the normal way */
    }
  };
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer == null) timer = setTimeout(write, WRITE_DELAY_MS);
  });
  return () => {
    unsubscribe();
    if (timer != null) clearTimeout(timer);
  };
}
