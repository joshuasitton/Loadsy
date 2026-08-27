/**
 * Street addresses for the two ends of a move.
 *
 * ## Why the ZIP is the only required part
 *
 * Everything Loadsy computes from a location is ZIP-level: rental rates,
 * availability and depot coverage are all published by ZIP, and the distance
 * estimate reads ZIPs too. The street, city and state are for the user — their
 * own record of the move, and the thing that makes a routing service usable the
 * day one is wired in.
 *
 * So a partial address is a first-class value, not an error state. Someone who
 * knows they are moving to 78745 but has not signed a lease yet can still get a
 * truck size and a price comparison, which is the whole point of the app. Making
 * the street line mandatory would block that for no computational gain.
 *
 * ## Privacy
 *
 * This is the most personal thing Loadsy holds: where somebody lives, and where
 * they are about to live. It never leaves the device. Nothing here is sent to a
 * vendor, a model or an analytics service — the quote request carries the ZIP
 * and the mileage and nothing else. APP_STORE.md's "Data Not Collected" answer
 * depends on that staying true, so if a geocoding service is ever added, the
 * address crossing the network is the moment the privacy label has to change.
 *
 * Pure TypeScript, no React and no I/O.
 */

export interface Address {
  /** Street line. May be blank — see the note above. */
  line1: string;
  /** Apartment, unit, floor. May be blank. */
  line2: string;
  city: string;
  /** Two-letter state code, upper-cased on the way in. May be blank. */
  state: string;
  /** Five digits. The one part everything downstream depends on. */
  postalCode: string;
}

export const EMPTY_ADDRESS: Address = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
};

const ZIP = /^\d{5}$/;

/** Trimmed, upper-cased state, five-digit ZIP. Never throws. */
export function normaliseAddress(input: Partial<Address> | null | undefined): Address {
  if (!input) return EMPTY_ADDRESS;
  return {
    line1: clean(input.line1),
    line2: clean(input.line2),
    city: clean(input.city),
    // Upper-cased so "tx" and "TX" are the same address, and so the two ends of
    // a move never look different for a reason the user cannot see.
    state: clean(input.state).toUpperCase().slice(0, 2),
    // ZIP+4 arrives from the OS geocoder as "94110-1234"; only the five count.
    postalCode: clean(input.postalCode).split('-')[0]?.replace(/\D/g, '').slice(0, 5) ?? '',
  };
}

/** True when this address can be used: it has a ZIP. Everything else is optional. */
export function isUsableAddress(address: Address | null | undefined): boolean {
  return address !== null && address !== undefined && ZIP.test(address.postalCode);
}

/** True when nothing has been entered at all. */
export function isEmptyAddress(address: Address | null | undefined): boolean {
  if (!address) return true;
  return (
    address.line1 === '' &&
    address.line2 === '' &&
    address.city === '' &&
    address.state === '' &&
    address.postalCode === ''
  );
}

/**
 * True when the address is complete enough for a routing service to place it.
 *
 * Not required for anything today — the distance estimate uses ZIPs — but it is
 * what the trip screen uses to tell the user whether entering the street will
 * buy them a better number later.
 */
export function isPreciseAddress(address: Address | null | undefined): boolean {
  return (
    isUsableAddress(address) &&
    address!.line1 !== '' &&
    address!.city !== '' &&
    address!.state !== ''
  );
}

/** One line, for a summary row. Falls back through what is actually filled in. */
export function formatAddressLine(address: Address | null | undefined): string {
  if (!address || isEmptyAddress(address)) return '';
  const cityState = [address.city, address.state].filter(Boolean).join(', ');
  const tail = [cityState, address.postalCode].filter(Boolean).join(' ');
  return [address.line1, tail].filter(Boolean).join(', ');
}

/** Short form for tight rows: city and state if known, otherwise the ZIP. */
export function formatAddressShort(address: Address | null | undefined): string {
  if (!address) return '';
  const cityState = [address.city, address.state].filter(Boolean).join(', ');
  return cityState || address.postalCode;
}

/**
 * Validated read-back from storage.
 *
 * A partial address survives. It is not an error state but a person part-way
 * through typing — street first, ZIP last is how most people write one — and the
 * move is saved on every keystroke, so dropping partials would mean an app
 * reopened mid-entry lost what was already typed.
 *
 * Nothing downstream is endangered by that, because the ZIP is derived
 * separately and stays empty until the address actually has one. Null here means
 * only "there is nothing here at all".
 */
export function parseAddress(value: unknown): Address | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const address = normaliseAddress({
    line1: str(v.line1),
    line2: str(v.line2),
    city: str(v.city),
    state: str(v.state),
    postalCode: str(v.postalCode),
  });
  return isEmptyAddress(address) ? null : address;
}

/** The ZIP a quote may be built from, or '' while the address has none. */
export function zipFor(address: Address | null | undefined): string {
  return isUsableAddress(address) ? address!.postalCode : '';
}

/**
 * The address to show for one end of a move, given whatever the move actually has.
 *
 * A move saved before addresses existed — or filled in by the old ZIP-only form —
 * has a ZIP and no address. Seeding the form from the address alone left those
 * users staring at an empty field with the Next button refusing to move, while
 * the app quietly held their ZIP the whole time. Recovering it is the difference
 * between a new field and a lost one.
 */
export function addressForMove(
  address: Address | null | undefined,
  zip: string | null | undefined,
): Address {
  if (address) return address;
  const recovered = normaliseAddress({ postalCode: zip ?? '' });
  return isUsableAddress(recovered) ? recovered : EMPTY_ADDRESS;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clean(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
