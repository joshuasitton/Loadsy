/**
 * "Get quotes from local movers" – a person asks for a mover to contact them, and Loadsy
 * passes their move to one named partner. Decided 28 September: build it now, off, and
 * turn it on only once a partner is signed.
 *
 * Opt-in or nothing. It was first asked for as "mostly unseen", and the unseen part is
 * the part that cannot be built: a lead is a way to reach a person, and taking one they
 * did not knowingly hand over – or passing their move to a company they were not told
 * about – is what App Review rejects under 5.1.1 and 5.1.2, and what the privacy page
 * promises Loadsy does not do. What is kept of "unseen" is that it is quiet: one line
 * under the truck, and nothing at all until someone taps it.
 *
 * So the rules, each one pinned by `__tests__/lead.test.ts`:
 *   - Nothing is offered without a named partner – `LEAD_PARTNER` is null until a
 *     contract exists, and a null partner hides the feature whatever the flag says.
 *   - The person sees exactly what is sent before it is sent, and ticks a box that names
 *     who receives it. The server refuses a lead whose consent does not name the current
 *     partner and the current wording.
 *   - What is sent is fixed: one way to reach them, a date, two ZIP codes and a summary
 *     of the load computed here from the move – never the inventory, never a photo.
 *   - The server forwards it and keeps nothing – see `app/v1/lead+api.ts`.
 *
 * Pure, so `npm test` pins every rule with nothing installed.
 */

import { TRUCK_SIZES, type Move, type TruckSize } from './types';
import { allItems } from './volume';
import type { TruckRecommendation } from './truck';

export interface LeadPartner {
  /** As the person will know them – "Two Men and a Truck". Shown in the consent line. */
  name: string;
  /** Their privacy policy, linked beside the consent line. */
  privacyUrl: string;
}

/**
 * Who receives a lead. Null until a partner agreement is signed, and a null partner means
 * the feature is not offered in any build – a consent line cannot name "a partner".
 * Setting it is a Chairman decision, and changes the App Store privacy label (APP_STORE.md).
 */
export const LEAD_PARTNER: LeadPartner | null = null;

/**
 * Whether a build offers mover quotes: the exact flag and a named partner, both. The flag
 * defaults off in every environment, as `PREMIUM_FOR_SALE` does, because the honest screen
 * is the one without it until there is somewhere for a lead to go.
 */
export function leadsOffered(flag: string | undefined, partner: LeadPartner | null): partner is LeadPartner {
  return flag === 'true' && partner !== null;
}

/** The partner this build sends leads to, or null when it offers none – the one value screens and the route read. */
export const OFFERED_PARTNER: LeadPartner | null = leadsOffered(process.env.EXPO_PUBLIC_LEADS_ENABLED, LEAD_PARTNER)
  ? LEAD_PARTNER
  : null;

/**
 * Moves whenever the consent sentence's wording does. The server refuses any other
 * version, so a lead can always be traced to the exact words the person agreed to.
 */
export const LEAD_CONSENT_VERSION = '2026-09-28';

/** The sentence beside the checkbox. Owned here, so the form and the privacy page match. */
export function leadConsentSentence(partner: LeadPartner): string {
  return (
    `Send this move and my contact details to ${partner.name} so they can contact me with a quote. ` +
    `Loadsy doesn’t keep a copy.`
  );
}

/** How far ahead a move date may be. Past a year it is not a lead, it is a guess. */
export const LEAD_HORIZON_DAYS = 365;

export type LeadContact = { kind: 'phone'; value: string } | { kind: 'email'; value: string };

/** The load as a mover needs it to quote – a size, not a list of what someone owns. */
export interface LeadMove {
  truckSize: TruckSize;
  /** Buffered volume, whole cubic feet. */
  cuFt: number;
  itemCount: number;
  roomCount: number;
}

export interface Lead {
  contact: LeadContact;
  /** YYYY-MM-DD */
  moveDate: string;
  fromZip: string;
  toZip: string;
  move: LeadMove;
  consent: { partner: string; version: string };
}

/** The summary of the load that goes with a lead, from the same numbers the screen shows. */
export function leadMove(move: Move, recommendation: TruckRecommendation): LeadMove {
  return {
    truckSize: recommendation.size,
    cuFt: Math.round(recommendation.adjustedCuFt),
    itemCount: allItems(move).length,
    roomCount: move.rooms.length,
  };
}

/**
 * A US phone number or an email, told apart by the "@". A phone keeps its ten digits and
 * nothing else – "(703) 555-0100", "703.555.0100" and "+1 703 555 0100" are one number.
 */
export function parseContact(text: string): LeadContact | null {
  const trimmed = text.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return null;
    return { kind: 'email', value: email };
  }
  if (!/^[\d\s().+-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  // NANP: area code and exchange never start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return { kind: 'phone', value: digits };
}

export function parseZip(text: string): string | null {
  const trimmed = text.trim();
  return /^\d{5}$/.test(trimmed) ? trimmed : null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A move date as typed – "10/14/2026", "10/14/26" or "2026-10-14" – as YYYY-MM-DD, or
 * null. It must be a real day, from today to `LEAD_HORIZON_DAYS` out.
 */
export function parseMoveDate(text: string, now: Date): string | null {
  const trimmed = text.trim();
  let y: number, m: number, d: number;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = Number(us[3]);
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const day = isoDay(date);
  const today = isoDay(now);
  const horizon = isoDay(new Date(now.getTime() + LEAD_HORIZON_DAYS * 86_400_000));
  return day >= today && day <= horizon ? day : null;
}

export interface LeadForm {
  contact: string;
  moveDate: string;
  fromZip: string;
  toZip: string;
  agreed: boolean;
}

export type LeadFormErrors = Partial<Record<keyof LeadForm, string>>;

/**
 * The form as the person filled it in, checked field by field. Either a lead ready to
 * send, or a sentence for each field that is wrong – never both, and never a lead
 * without the box ticked.
 */
export function validateLeadForm(
  form: LeadForm,
  move: LeadMove,
  partner: LeadPartner,
  now: Date,
): { lead: Lead; errors: null } | { lead: null; errors: LeadFormErrors } {
  const errors: LeadFormErrors = {};
  const contact = parseContact(form.contact);
  if (!contact) errors.contact = 'Enter a US phone number or an email address.';
  const moveDate = parseMoveDate(form.moveDate, now);
  if (!moveDate) errors.moveDate = 'Enter a date in the next year, like 10/14/2026.';
  const fromZip = parseZip(form.fromZip);
  if (!fromZip) errors.fromZip = 'Enter a 5-digit ZIP code.';
  const toZip = parseZip(form.toZip);
  if (!toZip) errors.toZip = 'Enter a 5-digit ZIP code.';
  if (!form.agreed) errors.agreed = `Tick the box to send this to ${partner.name}.`;
  if (!contact || !moveDate || !fromZip || !toZip || !form.agreed) return { lead: null, errors };
  return {
    lead: {
      contact,
      moveDate,
      fromZip,
      toZip,
      move,
      consent: { partner: partner.name, version: LEAD_CONSENT_VERSION },
    },
    errors: null,
  };
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

const isCount = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= max;

/**
 * A lead as the route may forward it, or null. The same strictness as the vehicle count:
 * exactly the known fields, nothing extra, every value re-checked on the server – and the
 * consent must name the partner this deployment sends to, in the current wording. A lead
 * the person agreed to send somewhere else is not this partner's to receive.
 */
export function parseLead(value: unknown, partner: LeadPartner, now: Date = new Date()): Lead | null {
  if (!exactKeys(value, ['contact', 'moveDate', 'fromZip', 'toZip', 'move', 'consent'])) return null;
  const { contact, moveDate, fromZip, toZip, move, consent } = value;

  if (!exactKeys(contact, ['kind', 'value'])) return null;
  if (typeof contact.value !== 'string') return null;
  const parsedContact = parseContact(contact.value);
  if (!parsedContact || parsedContact.kind !== contact.kind || parsedContact.value !== contact.value) return null;

  if (typeof moveDate !== 'string' || parseMoveDate(moveDate, now) !== moveDate) return null;
  if (typeof fromZip !== 'string' || parseZip(fromZip) !== fromZip) return null;
  if (typeof toZip !== 'string' || parseZip(toZip) !== toZip) return null;

  if (!exactKeys(move, ['truckSize', 'cuFt', 'itemCount', 'roomCount'])) return null;
  if (!(TRUCK_SIZES as readonly unknown[]).includes(move.truckSize)) return null;
  if (!isCount(move.cuFt, 5000) || !isCount(move.itemCount, 1000) || !isCount(move.roomCount, 50)) return null;

  if (!exactKeys(consent, ['partner', 'version'])) return null;
  if (consent.partner !== partner.name || consent.version !== LEAD_CONSENT_VERSION) return null;

  return {
    contact: parsedContact,
    moveDate,
    fromZip,
    toZip,
    move: {
      truckSize: move.truckSize as TruckSize,
      cuFt: move.cuFt,
      itemCount: move.itemCount,
      roomCount: move.roomCount,
    },
    consent: { partner: partner.name, version: LEAD_CONSENT_VERSION },
  };
}

/**
 * The line the route logs for each lead, so the count is known without a database – and
 * with no way to reach anyone in it. The contact, the ZIPs and the date stay out: a log
 * is kept, and the lead is only passed through.
 */
export function leadLogLine(lead: Lead, delivered: boolean): string {
  return JSON.stringify({ event: 'lead', truckSize: lead.move.truckSize, delivered });
}

/** One lead per person per day is a lead; more is someone testing the form, or worse. */
export const LEAD_PER_CLIENT = { limit: 3, windowMs: 24 * 60 * 60_000 };
export const LEAD_PER_INSTANCE = { limit: 100, windowMs: 15 * 60_000 };
