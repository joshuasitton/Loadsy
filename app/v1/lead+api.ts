/**
 * POST /v1/lead – passes one "Get quotes from local movers" request to the partner.
 *
 * A pass-through, as /v1/detect is: the lead is checked, forwarded to the partner's
 * endpoint and forgotten. Nothing is written but one log line with no way to reach anyone
 * in it (`leadLogLine`). Off unless the build offers leads – `OFFERED_PARTNER` needs both
 * the flag and a named partner – and answering 404 then, so an app that never showed the
 * form cannot be made to send one.
 *
 * `LEAD_WEBHOOK_URL` is where the partner receives leads, and `LEAD_WEBHOOK_TOKEN` the
 * bearer token they issue. Both are EAS project secrets, never `EXPO_PUBLIC_`: the URL
 * alone is enough to post fake leads to them in Loadsy's name.
 *
 * PRIVACY: turning this on changes the App Store label – contact info, linked to the
 * person, shared with a third party. See APP_STORE.md before setting the flag.
 */

import { OFFERED_PARTNER } from '../../src/domain/lead';
import { createLeadHandler } from '../../src/server/leadHandler';

export const POST = createLeadHandler({
  partner: OFFERED_PARTNER,
  webhookUrl: process.env.LEAD_WEBHOOK_URL,
  webhookToken: process.env.LEAD_WEBHOOK_TOKEN,
});
