/**
 * Centralized API client with error handling, timeout, and base URL configuration
 */
import { supabase } from "../lib/supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const DEFAULT_TIMEOUT = 15000; // 15 seconds — comfortable for a warm backend
// Render's free tier spins the backend down after 15 min idle; the first
// request after that can take up to ~100s to wake it (observed directly —
// the "~90s" Render advertises is optimistic). Rather than make every
// request wait that long by default, GET requests get one retry at this
// longer timeout if the first attempt times out or fails at the network
// level (see request() below) — writes are never auto-retried. This is the
// only retry attempted: queryClient.js deliberately doesn't layer a second,
// shorter-timeout retry on top for this same failure, since that would
// restart the wait from a 15s attempt that's very unlikely to land during
// an ongoing cold start.
const COLD_START_TIMEOUT = 100000;
// Gemini calls routinely take 20-40s on the free tier even on a fully warm
// backend — that's not a cold-start case, so it needs its own generous
// timeout rather than sharing the 15s default meant for ordinary DB-backed
// requests (which was previously causing AI features to fail outright).
export const AI_TIMEOUT = 60000;

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Ensure GET requests never send a body
    const method = (options.method || "GET").toUpperCase();
    const sanitizedOptions: RequestInit = { ...options, method };
    if (method === "GET") {
      delete sanitizedOptions.body;
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    const response = await fetch(url, {
      ...sanitizedOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...sanitizedOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      if (response.status === 429 && typeof window !== "undefined") {
        const retryAfter = Number(response.headers.get("Retry-After")) || null;
        window.dispatchEvent(new CustomEvent("api:rate-limited", { detail: { retryAfter } }));
      }

      throw new ApiError(errorData.error || errorData.message || `HTTP ${response.status}`, response.status, errorData);
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new ApiError("Request timed out.", 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || "Network error. Please check your connection.", 0);
  }
}

async function parseResponse(response: Response): Promise<any> {
  // Handle empty responses (like 204 No Content)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  return null;
}

async function request(endpoint: string, options: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = (options.method || "GET").toUpperCase();

  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    return await parseResponse(response);
  } catch (error) {
    const looksLikeColdStart = error instanceof ApiError && (error.status === 408 || error.status === 0);
    if (method === "GET" && looksLikeColdStart) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("api:cold-start-retry"));
      }
      try {
        const response = await fetchWithTimeout(url, options, COLD_START_TIMEOUT);
        return await parseResponse(response);
      } catch (retryError) {
        console.error(`API Error [${endpoint}]:`, retryError);
        throw retryError;
      }
    }
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

async function fetchUpload(url: string, formData: FormData, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    // No Content-Type header here on purpose — the browser sets its own
    // multipart boundary for FormData, which fetchWithTimeout's forced
    // application/json header would break (this is why these calls can't
    // just go through request()/fetchWithTimeout above).
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    clearTimeout(timeoutId);

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new ApiError(payload.error || payload.message || `HTTP ${response.status}`, response.status, payload);
    }
    return payload;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new ApiError("Request timed out.", 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || "Network error. Please check your connection.", 0);
  }
}

/**
 * File-upload counterpart to request()'s cold-start retry — same
 * one-retry-at-a-longer-timeout behavior, but for multipart/form-data
 * (AI spreadsheet/bank-statement import) instead of JSON. Uploads are
 * exactly the kind of request likely to be a user's first action of a
 * session, so they're just as likely to land on a cold backend as any
 * GET — but previously had no timeout or retry at all.
 */
export async function uploadWithColdStartRetry(endpoint: string, formData: FormData): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    return await fetchUpload(url, formData, DEFAULT_TIMEOUT);
  } catch (error) {
    const looksLikeColdStart = error instanceof ApiError && (error.status === 408 || error.status === 0);
    if (!looksLikeColdStart) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("api:cold-start-retry"));
    }
    try {
      return await fetchUpload(url, formData, COLD_START_TIMEOUT);
    } catch (retryError) {
      console.error(`API Error [${endpoint}]:`, retryError);
      throw retryError;
    }
  }
}

// HTTP method helpers
export const api = {
  get: (endpoint: string) => request(endpoint, { method: "GET" }),
  post: (endpoint: string, data: unknown, timeoutMs?: number) =>
    request(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      timeoutMs,
    ),
  put: (endpoint: string, data: unknown) =>
    request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (endpoint: string, data?: unknown) =>
    request(endpoint, {
      method: "DELETE",
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    }),
};

export { ApiError };
export default api;
