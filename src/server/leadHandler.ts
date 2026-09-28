/**
 * The /v1/lead handler, built from its configuration so the tests can run it with a
 * partner and a stubbed delivery while the shipped route has neither – see
 * `app/v1/lead+api.ts`, which is this with the deployment's values, and
 * src/domain/lead.ts for what a lead may hold.
 */

import { clientKey, SlidingWindow } from '../vision/rateLimit';
import { LEAD_PER_CLIENT, LEAD_PER_INSTANCE, leadLogLine, parseLead, type LeadPartner } from '../domain/lead';

export interface LeadHandlerConfig {
  /** Null when the build does not offer leads; every request is then a 404. */
  partner: LeadPartner | null;
  webhookUrl: string | undefined;
  webhookToken: string | undefined;
  deliver?: typeof fetch;
}

const DELIVERY_TIMEOUT_MS = 10_000;

export function createLeadHandler(config: LeadHandlerConfig): (request: Request) => Promise<Response> {
  const perClient = new SlidingWindow(LEAD_PER_CLIENT);
  const perInstance = new SlidingWindow(LEAD_PER_INSTANCE);
  const deliver = config.deliver ?? fetch;

  return async (request) => {
    const { partner, webhookUrl, webhookToken } = config;
    if (partner === null) return new Response(null, { status: 404 });
    if (!webhookUrl) return Response.json({ error: 'Lead delivery is not configured' }, { status: 503 });

    const now = Date.now();
    const verdict = [perClient.take(clientKey(request.headers), now), perInstance.take('*', now)].find(
      (result) => !result.ok,
    );
    if (verdict && !verdict.ok) {
      // Unlike the vehicle count this is told to the person: they asked to be contacted,
      // and pretending it was sent would leave them waiting for a call that never comes.
      return Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(verdict.retryAfterMs / 1000)) } },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'Malformed request body' }, { status: 400 });
    }

    const lead = parseLead(payload, partner);
    if (lead === null) return Response.json({ error: 'Invalid lead' }, { status: 400 });

    let delivered = false;
    try {
      const response = await deliver(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
        },
        body: JSON.stringify({ source: 'loadsy', ...lead }),
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      delivered = response.ok;
    } catch {
      delivered = false;
    }

    console.log(leadLogLine(lead, delivered));
    return delivered
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'The mover could not be reached' }, { status: 502 });
  };
}
