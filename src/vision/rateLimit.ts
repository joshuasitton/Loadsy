/**
 * Per-client rate limiting for `/v1/detect`.
 *
 * The route's URL ships in every app bundle and, until App Attest lands in v1.1, nothing
 * proves a request came from Loadsy. Anyone who reads the bundle can spend Loadsy's money
 * on the vision model, and one four-photo request costs real cents. This bounds what one
 * client can spend before the spend limit on the API key – the hard cap – has to.
 *
 * A sliding window over a log of timestamps, not a fixed bucket: a bucket that resets on
 * the minute lets a client take the whole limit at 0:59 and again at 1:00. Two windows
 * apply, one per client and one for the whole instance, because a limit that is only
 * per-client is answered by using many addresses.
 *
 * Known weakness, recorded in the sprint plan rather than hidden here: the counters live in
 * process memory, and serverless hosting runs many short-lived processes. A client can get
 * a fresh allowance from each one. The limits are therefore set for a person, not tuned
 * against an attacker – an attacker meets the spend limit.
 *
 * Pure, so `npm test` pins it with nothing installed.
 */

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

/**
 * What one client may ask for in a quarter of an hour.
 *
 * A move is a handful of photo sets, each one request, plus a retry or two. Twenty is
 * more than any apartment needs and less than a script would want.
 */
export const PER_CLIENT: RateLimit = { limit: 20, windowMs: 15 * 60_000 };

/**
 * What one process will forward in total, whoever asks.
 *
 * The backstop for a flood from many addresses. Three hundred requests in fifteen
 * minutes is more than the app will see for a long time; when it is not, this is the
 * number to raise, not remove.
 */
export const PER_INSTANCE: RateLimit = { limit: 300, windowMs: 15 * 60_000 };

/** Every unidentified client shares this key. Refused together rather than trusted apart. */
export const UNKNOWN_CLIENT = 'unknown';

/**
 * The key one request is counted under.
 *
 * The forwarded address is what the hosting layer says the client is. The first entry in
 * `x-forwarded-for` is the client; later ones are proxies, appended on the way in. Where
 * no header names an address, every such request shares one bucket – a limit that
 * defaulted to "unlimited" for requests it could not identify would be no limit at all.
 */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  for (const name of ['cf-connecting-ip', 'x-real-ip']) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return UNKNOWN_CLIENT;
}

export type Verdict = { ok: true } | { ok: false; retryAfterMs: number };

/** Keys with no attempt inside the window are dropped once the map grows past this. */
const SWEEP_ABOVE = 1_000;

export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();
  // Declared and assigned by hand, not as a constructor parameter property: Node's
  // strip-only TypeScript cannot transform those, and one would make this module –
  // and the route's test – impossible to import under `npm test`.
  readonly rule: RateLimit;

  constructor(rule: RateLimit) {
    this.rule = rule;
  }

  /**
   * Counts this attempt and says whether it may proceed.
   *
   * Refused attempts are not recorded: a client already over the limit does not push
   * its own retry time further out by asking again, which would turn a burst of retries
   * into a lockout.
   */
  take(key: string, now: number): Verdict {
    const since = now - this.rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);

    if (recent.length >= this.rule.limit) {
      this.hits.set(key, recent);
      // `recent` is in arrival order, so the first entry is the one that expires next.
      return { ok: false, retryAfterMs: recent[0]! + this.rule.windowMs - now };
    }

    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > SWEEP_ABOVE) this.sweep(since);
    return { ok: true };
  }

  /** How many keys are being tracked. For tests, which pin that the sweep works. */
  get size(): number {
    return this.hits.size;
  }

  private sweep(since: number): void {
    for (const [key, times] of this.hits) {
      if (!times.some((at) => at > since)) this.hits.delete(key);
    }
  }
}
