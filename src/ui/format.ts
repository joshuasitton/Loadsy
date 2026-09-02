/**
 * Date formatting for the few places Loadsy shows one.
 *
 * Every function takes an ISO string and is total: a null, a blank, or a string
 * that is not a date returns a dash rather than "Invalid Date". These strings sit
 * next to volumes and prices the user is being asked to trust, and a visible
 * "Invalid Date" undermines the numbers beside it more than the missing date costs.
 */

const DASH = '—';

/**
 * A volume, as a number somebody should act on.
 *
 * Whole cubic feet, always. Every volume in this app is the product of three
 * estimated dimensions — often estimated by a model from a photograph — and
 * printing "460.75 ft³" claims a precision of about a fifth of a shoebox that
 * nothing behind it can support. It also reads as a measurement rather than an
 * estimate, which is the opposite of what every other line on those screens is
 * carefully saying.
 *
 * Small items would round to nothing, so anything under 10 ft³ keeps one decimal
 * — the difference between a 3 ft³ box and a 3.4 ft³ box is real at that scale,
 * and a list of items that all say "3 ft³" is less useful, not more honest.
 */
export function formatCuFt(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  if (Math.abs(value) < 10) return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value)}`;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "27 Aug 2026" in the viewer's locale. */
export function formatDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return DASH;
  try {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    // Intl is present on every platform this ships to, but a formatter throwing
    // must not take a screen down over a caption.
    return date.toISOString().slice(0, 10);
  }
}

/** "27 Aug, 2:14 PM" — for "last saved", where the time is the useful half. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return DASH;
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}
