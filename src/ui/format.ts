/**
 * Date formatting for the few places Loadsy shows one.
 *
 * Every function takes an ISO string and is total: a null, a blank, or a string
 * that is not a date returns a dash rather than "Invalid Date". These strings sit
 * next to volumes and prices the user is being asked to trust, and a visible
 * "Invalid Date" undermines the numbers beside it more than the missing date costs.
 */

const DASH = '—';

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
