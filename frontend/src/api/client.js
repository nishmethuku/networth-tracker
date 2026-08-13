/**
 * Centralized API client with error handling, timeout, and base URL configuration
 */
import { supabase } from "../lib/supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const DEFAULT_TIMEOUT = 15000; // 15 seconds — comfortable for a warm backend
// Render's free tier spins the backend down after 15 min idle; the first
// request after that can take up to ~90s to wake it. Rather than make every
// request wait that long by default, GET requests get one retry at this
// longer timeout if the first attempt times out or fails at the network
// level (see request() below) — writes are never auto-retried.
const COLD_START_TIMEOUT = 60000;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Ensure GET requests never send a body
    const method = (options.method || "GET").toUpperCase();
    const sanitizedOptions = { ...options, method };
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
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      if (response.status === 429 && typeof window !== "undefined") {
        const retryAfter = Number(response.headers.get("Retry-After")) || null;
        window.dispatchEvent(new CustomEvent("api:rate-limited", { detail: { retryAfter } }));
      }

      throw new ApiError(
        errorData.error || errorData.message || `HTTP ${response.status}`,
        response.status,
        errorData
      );
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new ApiError("Request timed out.", 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error.message || "Network error. Please check your connection.",
      0
    );
  }
}

async function parseResponse(response) {
  // Handle empty responses (like 204 No Content)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  return null;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = (options.method || "GET").toUpperCase();

  try {
    const response = await fetchWithTimeout(url, options, DEFAULT_TIMEOUT);
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

// HTTP method helpers
export const api = {
  get: (endpoint) => request(endpoint, { method: "GET" }),
  post: (endpoint, data) =>
    request(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  put: (endpoint, data) =>
    request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (endpoint, data) =>
    request(endpoint, {
      method: "DELETE",
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    }),
};

export { ApiError };
export default api;
