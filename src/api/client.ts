/**
 * Thin fetch wrapper for the three agent-owned endpoints in spec §4.
 *
 * Every endpoint has a mock counterpart so the app runs end-to-end before the
 * Vision, Rental Data and Packing Logic services exist. `USE_MOCKS` is the single
 * switch; flip it with EXPO_PUBLIC_USE_MOCKS=false once a real base URL is live.
 */

/**
 * Where the API routes live.
 *
 * Empty by default, and deliberately so: `/v1/detect` is an Expo Router API route
 * served by this very app, so on the web the correct base is the page's own
 * origin — which is what a relative path resolves to. The old default pointed at
 * `https://api.loadsy.app`, a host that has never existed; every live request
 * went there and failed, which is why nothing noticed the endpoint was already
 * deployed alongside the client.
 *
 * A native build has no origin to be relative to, so it must be told. Set
 * EXPO_PUBLIC_API_BASE_URL to the EAS Hosting deployment URL for those.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

/**
 * Whether to answer from the fixture catalogue instead of calling the model.
 *
 * Explicit either way wins. With nothing set the answer is "mocks in development,
 * live everywhere else" — the safe default in both directions. It used to be
 * "mocks unless someone remembered to say false", which meant a release build
 * that simply omitted the variable would ship the fixture furniture to real
 * users, showing them somebody else's sofa and sizing a truck around it.
 */
export const USE_MOCKS = (() => {
  const flag = process.env.EXPO_PUBLIC_USE_MOCKS;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Not destructured: react-native injects __DEV__ as a global, and it is absent
  // under the plain-node test runner.
  return typeof __DEV__ !== 'undefined' && __DEV__;
})();

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
    const response = await fetch(resolveUrl(path), {
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

/**
 * The absolute or same-origin URL for a path, or a stated error explaining why
 * there isn't one.
 *
 * Without this, a native build with no base URL configured calls fetch('/v1/detect'),
 * which fails as a bare "Network request failed" — indistinguishable from bad Wi-Fi,
 * and sends you looking at the wrong thing.
 */
export function resolveUrl(path: string): string {
  if (API_BASE_URL !== '') return `${API_BASE_URL}${path}`;
  const origin = typeof location !== 'undefined' ? location.origin : undefined;
  if (typeof origin === 'string' && origin !== '') return path;
  throw new ApiError(
    `${path} has no host: set EXPO_PUBLIC_API_BASE_URL for this build`,
    500,
  );
}

/** Mocks resolve on a short delay so loading states are exercised in development. */
export function mockDelay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
