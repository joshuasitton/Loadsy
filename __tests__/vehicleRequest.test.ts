import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseVehicleRequest,
  VEHICLE_MAKES,
  VEHICLE_REQUEST_PER_CLIENT,
  vehicleRequestLogLine,
} from '../src/domain/vehicleRequest';

/*
 * "Mine isn't listed" is the one thing Loadsy's server keeps, so what it keeps is pinned
 * here: two picks from fixed lists, and nothing a person could type. The route and the
 * client are both exercised with the network and the log stubbed.
 */

const ROUTE = new URL('../app/v1/vehicle-request+api.ts', import.meta.url).href;
const CLIENT = new URL('../src/api/vehicleRequest.ts', import.meta.url).href;

test('only a known body type and a known make are accepted', () => {
  assert.deepEqual(parseVehicleRequest({ body: 'suv', make: 'Honda' }), { body: 'suv', make: 'Honda' });
  assert.equal(parseVehicleRequest({ body: 'spaceship', make: 'Honda' }), null);
  assert.equal(parseVehicleRequest({ body: 'suv', make: 'honda' }), null, 'case matters – the list is the list');
  assert.equal(parseVehicleRequest({ body: 'suv' }), null);
  assert.equal(parseVehicleRequest(null), null);
  assert.equal(parseVehicleRequest([]), null);
  assert.equal(parseVehicleRequest('suv Honda'), null);
});

test('an extra field is refused, not trimmed – nothing more can be sent without this changing', () => {
  assert.equal(parseVehicleRequest({ body: 'suv', make: 'Honda', model: 'CR-V' }), null);
  assert.equal(parseVehicleRequest({ body: 'suv', make: 'Honda', email: 'a@b.c' }), null);
});

test('the log line is the event and the two picks, and nothing else', () => {
  assert.equal(
    vehicleRequestLogLine({ body: 'minivan', make: 'Toyota' }),
    '{"event":"vehicle_not_listed","body":"minivan","make":"Toyota"}',
  );
  assert.equal(VEHICLE_MAKES.at(-1), 'Other', 'every make has somewhere to go');
});

async function withCapturedLog<T = Response>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original;
  }
}

function post(body: unknown, address = '203.0.113.7'): Request {
  return new Request('https://loadsy.test/v1/vehicle-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('the route logs one line for a valid pick, and never the address it came from', async () => {
  const { POST } = await import(`${ROUTE}?case=valid`);
  const { result, lines } = await withCapturedLog<Response>(() => POST(post({ body: 'pickup', make: 'Ford' })));
  assert.equal(result.status, 204);
  assert.deepEqual(lines, ['{"event":"vehicle_not_listed","body":"pickup","make":"Ford"}']);
  assert.ok(!lines.join('').includes('203.0.113.7'));
});

test('the route refuses anything else and logs nothing', async () => {
  const { POST } = await import(`${ROUTE}?case=invalid`);
  for (const bad of [{ body: 'suv', make: 'Honda', model: 'Jazz' }, { body: 'suv' }, 'not json']) {
    const { result, lines } = await withCapturedLog<Response>(() => POST(post(bad, '198.51.100.1')));
    assert.equal(result.status, 400);
    assert.deepEqual(lines, []);
  }
});

test('one address is counted a few times an hour, then quietly not at all', async () => {
  const { POST } = await import(`${ROUTE}?case=limit`);
  const { lines } = await withCapturedLog(async () => {
    for (let i = 0; i < VEHICLE_REQUEST_PER_CLIENT.limit + 2; i++) {
      const response = await POST(post({ body: 'car', make: 'Mazda' }, '192.0.2.44'));
      // The same answer either way: there is nothing for the person to retry.
      assert.equal(response.status, 204);
    }
  });
  assert.equal(lines.length, VEHICLE_REQUEST_PER_CLIENT.limit);
});

test('a mock build sends nothing, and a live one sends exactly the two picks', async () => {
  const original = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    (globalThis as Record<string, unknown>).__DEV__ = false;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';

    process.env.EXPO_PUBLIC_USE_MOCKS = 'true';
    const mock = await import(`${CLIENT}?case=mock`);
    await mock.sendVehicleRequest({ body: 'suv', make: 'Kia' });
    assert.deepEqual(bodies, []);

    process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
    const live = await import(`${CLIENT}?case=live`);
    await live.sendVehicleRequest({ body: 'suv', make: 'Kia' });
    assert.deepEqual(bodies, ['{"body":"suv","make":"Kia"}']);
  } finally {
    globalThis.fetch = original;
    delete process.env.EXPO_PUBLIC_USE_MOCKS;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  }
});

test('a failed count never reaches the person', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof fetch;
  try {
    (globalThis as Record<string, unknown>).__DEV__ = false;
    process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    const client = await import(`${CLIENT}?case=offline`);
    await assert.doesNotReject(client.sendVehicleRequest({ body: 'car', make: 'Other' }));
  } finally {
    globalThis.fetch = original;
    delete process.env.EXPO_PUBLIC_USE_MOCKS;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  }
});
