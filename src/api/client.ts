/**
 * Thin fetch wrapper for the three agent-owned endpoints in spec §4.
 *
 * Every endpoint has a mock counterpart so the app runs end-to-end before the
 * Vision, Rental Data and Packing Logic services exist. `USE_MOCKS` is the single
 * switch; flip it with EXPO_PUBLIC_USE_MOCKS=false once a real base URL is live.
 */

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.loadsy.app';

export const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

export class ApiError extends Error {
  // Declared and assigned explicitly rather than as a constructor parameter
  // property. Node's --experimental-strip-types runs in strip-only mode, which
  // cannot transform parameter properties — so that one line made this module,
  // and therefore the whole api/ tree, impossible to import from the test suite.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * How long a request may hang before it is treated as failed.
 *
 * React Native's fetch has no default timeout, and the screens derive "loading"
 * from "no result yet" — so a captive-portal Wi-Fi that accepts the connection and
 * never answers left the prices screen spinning forever, with the Try again button
 * living inside an empty state that only renders once loading is false. No timeout
 * meant no error, which meant no way back.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      throw new ApiError(`${init?.method ?? 'GET'} ${path} failed`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    // An abort is a timeout here, not a user cancellation — nothing else aborts.
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(`${init?.method ?? 'GET'} ${path} timed out`, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Mocks resolve on a short delay so loading states are exercised in development. */
export function mockDelay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
