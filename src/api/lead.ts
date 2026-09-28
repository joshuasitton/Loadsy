/**
 * Sends one mover-quote request to `/v1/lead` – see src/domain/lead.ts for what is in it
 * and why that is all.
 *
 * Unlike the vehicle count, a failure is reported: the person asked to be contacted, and
 * a silent failure leaves them waiting for a call that never comes. In a mock build it
 * sends nothing – a demo tap is not a real move, and a partner billed for it would be
 * billed for a tester.
 */

import type { Lead } from '../domain/lead';
import { mockDelay, resolveUrl, USE_MOCKS } from './client';

export type LeadResult = 'sent' | 'failed';

export async function sendLead(lead: Lead): Promise<LeadResult> {
  if (USE_MOCKS) {
    await mockDelay(undefined, 600);
    return 'sent';
  }
  try {
    const response = await fetch(resolveUrl('/v1/lead'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
