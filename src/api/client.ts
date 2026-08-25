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
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(`${init?.method ?? 'GET'} ${path} failed`, response.status);
  }
  return (await response.json()) as T;
}

/** Mocks resolve on a short delay so loading states are exercised in development. */
export function mockDelay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
