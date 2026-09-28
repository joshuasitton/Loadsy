import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  LEAD_CONSENT_VERSION,
  LEAD_PARTNER,
  LEAD_PER_CLIENT,
  leadConsentSentence,
  leadLogLine,
  leadMove,
  leadsOffered,
  parseContact,
  parseLead,
  parseMoveDate,
  validateLeadForm,
  type Lead,
  type LeadForm,
  type LeadPartner,
} from '../src/domain/lead';
import { buildRecommendation } from '../src/domain/truck';
import { createLeadHandler } from '../src/server/leadHandler';
import { makeItem, makeMove, makeRoom } from './helpers';

/*
 * Mover quotes pass a person's contact details to a third party, so every rule that makes
 * that consensual is pinned here: nothing without a named partner, nothing without the
 * box ticked, nothing but the fixed fields, and nothing kept by the server.
 */

const NOW = new Date('2026-09-28T15:00:00Z');
const PARTNER: LeadPartner = { name: 'Test Movers', privacyUrl: 'https://movers.test/privacy' };
const MOVE = { truckSize: '15ft' as const, cuFt: 610, itemCount: 42, roomCount: 4 };
const FORM: LeadForm = {
  contact: '(703) 555-0100',
  moveDate: '10/14/2026',
  fromZip: '20147',
  toZip: '22101',
  agreed: true,
};

function validLead(): Lead {
  const result = validateLeadForm(FORM, MOVE, PARTNER, NOW);
  assert.ok(result.lead);
  return result.lead;
}

test('SAFETY: no build offers leads until a partner is named', () => {
  // The shipped state. Setting LEAD_PARTNER is a Chairman decision that changes the
  // privacy label – this test is meant to fail the day it changes, so the label does too.
  assert.equal(LEAD_PARTNER, null);
  assert.equal(leadsOffered('true', null), false, 'the flag alone offers nothing');
  assert.equal(leadsOffered(undefined, PARTNER), false, 'off by default, as Premium is');
  for (const almost of ['TRUE', 'True', '1', 'yes', '']) {
    assert.equal(leadsOffered(almost, PARTNER), false, `"${almost}" turned leads on`);
  }
  assert.equal(leadsOffered('true', PARTNER), true);
});

test('a phone number or an email, and nothing else', () => {
  for (const phone of ['(703) 555-0100', '703.555.0100', '+1 703 555 0100', '7035550100']) {
    assert.deepEqual(parseContact(phone), { kind: 'phone', value: '7035550100' }, phone);
  }
  assert.deepEqual(parseContact(' You@Example.com '), { kind: 'email', value: 'you@example.com' });
  for (const bad of ['555-0100', '(103) 555-0100', 'call me', 'you@', 'me at home', '703 555 0100 ext 4']) {
    assert.equal(parseContact(bad), null, bad);
  }
});

test('a move date is a real day in the next year', () => {
  assert.equal(parseMoveDate('10/14/2026', NOW), '2026-10-14');
  assert.equal(parseMoveDate('10/14/26', NOW), '2026-10-14');
  assert.equal(parseMoveDate('2026-09-28', NOW), '2026-09-28', 'today counts');
  assert.equal(parseMoveDate('09/27/2026', NOW), null, 'yesterday does not');
  assert.equal(parseMoveDate('02/30/2027', NOW), null, 'not a day');
  assert.equal(parseMoveDate('12/01/2027', NOW), null, 'more than a year out');
  assert.equal(parseMoveDate('next week', NOW), null);
});

test('the form sends nothing until the box naming the partner is ticked', () => {
  const unticked = validateLeadForm({ ...FORM, agreed: false }, MOVE, PARTNER, NOW);
  assert.equal(unticked.lead, null);
  assert.match(unticked.errors?.agreed ?? '', /Test Movers/);

  const empty = validateLeadForm({ contact: '', moveDate: '', fromZip: '', toZip: '', agreed: true }, MOVE, PARTNER, NOW);
  assert.deepEqual(Object.keys(empty.errors ?? {}).sort(), ['contact', 'fromZip', 'moveDate', 'toZip']);

  const lead = validLead();
  assert.deepEqual(lead.consent, { partner: 'Test Movers', version: LEAD_CONSENT_VERSION });
  assert.match(leadConsentSentence(PARTNER), /Test Movers/);
});

test('what a lead carries about the move is a size, never the inventory', () => {
  const move = makeMove([makeRoom([makeItem({ name: 'Grandma’s Piano' }), makeItem()]), makeRoom([makeItem()])]);
  const summary = leadMove(move, buildRecommendation(move));
  assert.deepEqual(Object.keys(summary).sort(), ['cuFt', 'itemCount', 'roomCount', 'truckSize']);
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.roomCount, 2);
  assert.ok(!JSON.stringify(summary).includes('Piano'));
});

test('the server accepts exactly the fields the form sends, for this partner only', () => {
  const lead = validLead();
  // What the client sends is JSON – the round trip is the real input.
  const wire = JSON.parse(JSON.stringify(lead));
  assert.deepEqual(parseLead(wire, PARTNER, NOW), lead);

  assert.equal(parseLead({ ...wire, name: 'Josh' }, PARTNER, NOW), null, 'an extra field is refused, not dropped');
  assert.equal(parseLead({ ...wire, move: { ...wire.move, items: ['sofa'] } }, PARTNER, NOW), null);
  assert.equal(parseLead({ ...wire, consent: { ...wire.consent, partner: 'Someone Else' } }, PARTNER, NOW), null);
  assert.equal(parseLead({ ...wire, consent: { ...wire.consent, version: '2020-01-01' } }, PARTNER, NOW), null);
  assert.equal(parseLead({ ...wire, contact: { kind: 'email', value: '7035550100' } }, PARTNER, NOW), null);
  assert.equal(parseLead({ ...wire, fromZip: '2014' }, PARTNER, NOW), null);
  assert.equal(parseLead({ ...wire, move: { ...wire.move, cuFt: 0 } }, PARTNER, NOW), null);
  assert.equal(parseLead(null, PARTNER, NOW), null);
});

test('the log line can reach nobody', () => {
  const line = leadLogLine(validLead(), true);
  assert.deepEqual(JSON.parse(line), { event: 'lead', truckSize: '15ft', delivered: true });
  for (const secret of ['7035550100', '20147', '22101', '2026-10-14']) assert.ok(!line.includes(secret));
});

async function withCapturedLog<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original;
  }
}

function post(body: unknown, address = '203.0.113.9'): Request {
  return new Request('https://loadsy.test/v1/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A valid lead as JSON, dated from the real clock – the route checks against it. */
function wireLead() {
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  return { ...JSON.parse(JSON.stringify(validLead())), moveDate: inTwoWeeks };
}

function stubDelivery(status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const deliver = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status });
  }) as typeof fetch;
  return { sent, deliver };
}

test('SAFETY: the shipped route answers 404 to everything', async () => {
  const { POST } = await import(new URL('../app/v1/lead+api.ts', import.meta.url).href);
  const response = await POST(post(wireLead()));
  assert.equal(response.status, 404);
});

test('the route forwards a valid lead to the partner, and keeps nothing but the count', async () => {
  const { sent, deliver } = stubDelivery();
  const handle = createLeadHandler({ partner: PARTNER, webhookUrl: 'https://movers.test/leads', webhookToken: 'tok', deliver });
  const lead = wireLead();
  const { result, lines } = await withCapturedLog<Response>(() => handle(post(lead)));
  assert.equal(result.status, 204);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://movers.test/leads');
  assert.equal((sent[0]!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { source: 'loadsy', ...lead });
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]!.includes('7035550100'));
  assert.ok(!lines[0]!.includes('203.0.113.9'));
});

test('a lead that cannot be delivered is reported, not swallowed', async () => {
  const { deliver } = stubDelivery(500);
  const handle = createLeadHandler({ partner: PARTNER, webhookUrl: 'https://movers.test/leads', webhookToken: undefined, deliver });
  const lead = wireLead();
  const { result, lines } = await withCapturedLog<Response>(() => handle(post(lead)));
  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(lines[0]!), { event: 'lead', truckSize: '15ft', delivered: false });
});

test('the route refuses bad input, and no webhook means no delivery', async () => {
  const { sent, deliver } = stubDelivery();
  const handle = createLeadHandler({ partner: PARTNER, webhookUrl: 'https://movers.test/leads', webhookToken: undefined, deliver });
  for (const bad of ['not json', { contact: { kind: 'phone', value: '7035550100' } }]) {
    const { result, lines } = await withCapturedLog<Response>(() => handle(post(bad, '198.51.100.3')));
    assert.equal(result.status, 400);
    assert.deepEqual(lines, []);
  }
  assert.equal(sent.length, 0);

  const unconfigured = createLeadHandler({ partner: PARTNER, webhookUrl: undefined, webhookToken: undefined, deliver });
  assert.equal((await unconfigured(post({}))).status, 503);
});

test('one address sends a few leads a day, then is told to wait', async () => {
  const { deliver } = stubDelivery();
  const handle = createLeadHandler({ partner: PARTNER, webhookUrl: 'https://movers.test/leads', webhookToken: undefined, deliver });
  const lead = wireLead();
  const statuses: number[] = [];
  await withCapturedLog(async () => {
    for (let i = 0; i < LEAD_PER_CLIENT.limit + 1; i++) statuses.push((await handle(post(lead, '192.0.2.8'))).status);
  });
  assert.deepEqual(statuses, [...Array(LEAD_PER_CLIENT.limit).fill(204), 429]);
});

test('no secret for lead delivery is ever an EXPO_PUBLIC_ variable', () => {
  const files = ['app/v1/lead+api.ts', 'src/server/leadHandler.ts', 'src/api/lead.ts', 'src/ui/LeadCard.tsx'];
  for (const file of files) assert.ok(!/EXPO_PUBLIC_LEAD_WEBHOOK/.test(readFileSync(file, 'utf8')), file);
  // And the consent sentence is never typed out by hand under app/ or src/ui/.
  const screens = readdirSync('app', { recursive: true, encoding: 'utf8' }).map((f) => `app/${f}`);
  for (const file of [...screens, 'src/ui/LeadCard.tsx'].filter((f) => /\.tsx?$/.test(f))) {
    assert.ok(!readFileSync(file, 'utf8').includes('so they can contact me'), file);
  }
});
