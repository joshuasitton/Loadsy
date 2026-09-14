/**
 * POST /v1/detect — the vision endpoint.
 *
 * This exists for exactly one reason: the model API key must never reach the
 * device. Everything else this app does is computed on the client, because it can
 * be. A key cannot be, so this is the whole backend.
 *
 * Deployed with the app itself (`eas deploy`), so there is no second repository,
 * no second deploy pipeline, and no way for the request contract here to drift
 * from the client that calls it — they are typed against the same source.
 *
 * PRIVACY: this is a strict pass-through. The image is forwarded, the result is
 * returned, and neither is written to disk or into a log. That is what keeps the
 * "Data Not Collected" answer in APP_STORE.md true; if that ever stops being the
 * case, the privacy label has to change with it.
 */

/**
 * Photos accepted per room.
 *
 * Defined once, in src/domain/capture.ts, and imported by app/capture.tsx too.
 * It used to be declared here and mirrored there by hand, with a comment in
 * place of a mechanism: had the two drifted, the screen would have offered a
 * fifth angle and this route would have answered 400 on a capture the user had
 * already spent four photographs building.
 */
import { MAX_PHOTOS } from '../../src/domain/capture';
/** The prompt and request shape, shared with the detection eval so the two cannot drift. */
import { buildDetectBody, DEFAULT_VISION_MODEL, UPSTREAM_TIMEOUT_MS } from '../../src/vision/detectRequest';

/** Set in EAS Hosting environment secrets. Never an EXPO_PUBLIC_ var — those ship. */
const API_KEY = process.env.VISION_API_KEY;
const MODEL = process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL;
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** Roughly a 1568x1176 JPEG at quality 0.8, plus base64 overhead and headroom. */
const MAX_IMAGE_BYTES = 3_000_000;

interface DetectBody {
  roomId?: unknown;
  roomName?: unknown;
  photos?: unknown;
  /** Inches. Optional; checked and range-limited by buildDetectBody, never trusted. */
  ceilingHeightIn?: unknown;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!API_KEY) {
    // A missing key is an operator error, not a user error. Say so plainly in the
    // logs and return a generic message — never echo configuration to a client.
    console.error('[detect] VISION_API_KEY is not configured');
    return json({ error: 'Detection is unavailable' }, 503);
  }

  let body: DetectBody;
  try {
    body = (await request.json()) as DetectBody;
  } catch {
    return json({ error: 'Malformed request body' }, 400);
  }

  const roomName = typeof body.roomName === 'string' ? body.roomName.slice(0, 64) : 'Room';

  const photos = Array.isArray(body.photos)
    ? body.photos.flatMap((photo) => {
        const data =
          typeof photo === 'object' && photo !== null && typeof (photo as { imageData?: unknown }).imageData === 'string'
            ? (photo as { imageData: string }).imageData
            : '';
        return data.length > 0 ? [data] : [];
      })
    : [];

  if (photos.length === 0) return json({ error: 'No image supplied' }, 400);
  if (photos.length > MAX_PHOTOS) {
    return json({ error: `At most ${MAX_PHOTOS} photos per room` }, 400);
  }
  // The client resizes before sending, so an oversized body means it did not.
  // Rejecting is cheaper than paying to tokenise a full-resolution frame.
  if (photos.some((data) => data.length > MAX_IMAGE_BYTES)) {
    return json({ error: 'Image too large — resize before sending' }, 413);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(
        buildDetectBody(MODEL, roomName, photos, {
          ceilingHeightIn: typeof body.ceilingHeightIn === 'number' ? body.ceilingHeightIn : null,
        }),
      ),
    });

    if (!upstream.ok) {
      console.error(`[detect] upstream returned ${upstream.status}`);
      return json({ error: 'Detection failed' }, 502);
    }

    const payload = (await upstream.json()) as { content?: { type: string; text?: string }[] };
    const text = payload.content?.find((block) => block.type === 'text')?.text ?? '';

    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(text) as { items?: unknown };
    } catch {
      console.error('[detect] model did not return parseable JSON');
      return json({ error: 'Detection failed' }, 502);
    }

    // Shape only. The client validates every field again in src/api/detect.ts, and
    // deliberately so — this is the last place that should be trusted to be right.
    if (!Array.isArray(parsed.items)) return json({ error: 'Detection failed' }, 502);

    return json({ items: parsed.items }, 200);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error(`[detect] ${aborted ? 'upstream timed out' : 'upstream error'}`);
    return json({ error: aborted ? 'Detection timed out' : 'Detection failed' }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}
