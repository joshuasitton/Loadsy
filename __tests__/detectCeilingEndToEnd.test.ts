import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * The ceiling answer, followed from the app to the model with the network stubbed:
 * the client must send it, the route must pass it into the prompt, and a standard
 * or unanswered ceiling must change nothing at either hop.
 *
 * Both modules read their configuration at import, so each is imported fresh
 * under a `?case=` URL after its environment is set – see __tests__/apiUrl.test.ts.
 * The key below is a placeholder string; no request leaves the process.
 */

const CLIENT_DETECT = new URL('../src/api/detect.ts', import.meta.url).href;
const ROUTE = new URL('../app/v1/detect+api.ts', import.meta.url).href;

type Captured = { url: string; body: string };

function stubFetch(respond: () => Response): { calls: Captured[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return respond();
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

/* ------------------------------------------------------------------ client */

test('the app sends a non-standard ceiling, and sends nothing extra for a standard one', async () => {
  (globalThis as Record<string, unknown>).__DEV__ = false;
  process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
  const { detectItems } = await import(`${CLIENT_DETECT}?case=ceiling-client`);

  const { calls, restore } = stubFetch(() => Response.json({ items: [] }));
  try {
    const base = { roomId: 'r1', roomName: 'Den', photos: [{ photoId: 'p1', imageData: 'AAA' }] };
    await detectItems({ ...base, ceilingHeightIn: 108 });
    await detectItems({ ...base, ceilingHeightIn: 96 });
    await detectItems({ ...base, ceilingHeightIn: null });
    await detectItems(base);

    assert.equal(calls.length, 4);
    assert.equal(JSON.parse(calls[0]!.body).ceilingHeightIn, 108);

    // Standard, unanswered and absent all send the body the app sent before the
    // question existed – byte for byte.
    const before = JSON.stringify(base);
    assert.equal(calls[1]!.body, before);
    assert.equal(calls[2]!.body, before);
    assert.equal(calls[3]!.body, before);
  } finally {
    restore();
  }
});

/* ------------------------------------------------------------------- route */

async function routeUpstreamBodies(requests: Record<string, unknown>[]): Promise<string[]> {
  process.env.VISION_API_KEY = 'placeholder-not-a-key';
  const { POST } = await import(`${ROUTE}?case=ceiling-route`);
  const { calls, restore } = stubFetch(() =>
    Response.json({ content: [{ type: 'text', text: '{"items":[]}' }], stop_reason: 'end_turn' }),
  );
  try {
    for (const body of requests) {
      const response: Response = await POST(
        new Request('https://loadsy.test/v1/detect', { method: 'POST', body: JSON.stringify(body) }),
      );
      assert.equal(response.status, 200);
    }
    return calls.map((call) => call.body);
  } finally {
    restore();
  }
}

function lastText(upstreamBody: string): string {
  const content = JSON.parse(upstreamBody).messages[0].content as { type: string; text?: string }[];
  return content[content.length - 1]!.text ?? '';
}

test('the route tells the model a non-standard ceiling, and changes nothing otherwise', async () => {
  const photo = { photoId: 'p1', imageData: 'AAA' };
  const request = { roomId: 'r1', roomName: 'Den', photos: [photo] };

  const [tall, standard, absent, typedAsText, implausible] = await routeUpstreamBodies([
    { ...request, ceilingHeightIn: 108 },
    { ...request, ceilingHeightIn: 96 },
    request,
    { ...request, ceilingHeightIn: '108' },
    { ...request, ceilingHeightIn: 5000 },
  ]);

  assert.match(lastText(tall!), /ceilings in this home are 108 in \(9 ft\) high/);
  assert.match(lastText(tall!), /not the typical 96 in/);

  // A standard ceiling, no answer, a wrongly typed value and an implausible one all
  // reach the model as the request that existed before the question did.
  assert.equal(standard, absent);
  assert.equal(typedAsText, absent);
  assert.equal(implausible, absent);
  assert.doesNotMatch(lastText(absent!), /ceiling/i);
});
