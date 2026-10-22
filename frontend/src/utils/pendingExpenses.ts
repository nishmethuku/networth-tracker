export const PENDING_KEY = "nw_pending_expenses";
const MAX_PENDING = 200;

export interface PendingExpense {
  /** Made on the device, only used to remove this one after it syncs. */
  id: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export function loadPending(): PendingExpense[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.id === "string" && p.payload && typeof p.payload === "object");
  } catch {
    return [];
  }
}

function save(list: PendingExpense[]): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

let counter = 0;

/** Keeps an expense on this device until the connection is back. Returns false when it could not be stored. */
export function enqueuePending(payload: Record<string, unknown>, now: Date = new Date()): boolean {
  const list = loadPending();
  if (list.length >= MAX_PENDING) return false;
  counter += 1;
  list.push({ id: `${now.getTime()}-${counter}`, payload, queuedAt: now.toISOString() });
  return save(list);
}

export function removePending(id: string): void {
  save(loadPending().filter((p) => p.id !== id));
}

/**
 * Whether a failed save should be kept for later. Only a request that never
 * reached the server (status 0) qualifies: a timeout or a server error may
 * have saved the entry already, and retrying would log it twice.
 */
export function shouldQueue(error: { status?: number } | null | undefined): boolean {
  return !!error && error.status === 0;
}
