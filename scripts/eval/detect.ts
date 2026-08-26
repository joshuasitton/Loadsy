/**
 * Measures whether vision-based detection sizes the truck correctly.
 *
 * Runs entirely outside the app: no deploy, no device, no App Store build. Point it
 * at a folder of room photos with tape-measured ground truth and it reports the
 * three numbers that decide whether this product works.
 *
 * `--mock` runs the whole pipeline against the deterministic mock detector, which
 * costs nothing and proves the harness itself is sound before a single paid call.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { cubicFeetFor } from '../../src/domain/volume';
import { recommendTruckSize, TRUCK_CAPACITY } from '../../src/domain/truck';
import { mockDetect } from '../../src/api/mocks/detect';
import type { TruckSize } from '../../src/domain/types';

interface TruthItem {
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}
interface TruthRoom {
  roomName: string;
  items: TruthItem[];
}
interface Predicted {
  name: string;
  cubicFeet: number;
}

const args = process.argv.slice(2);
const useMock = args.includes('--mock');
const dirArg = args.indexOf('--dir');
const photoDir = dirArg >= 0 ? args[dirArg + 1]! : './eval-photos';

function volumeOf(items: { lengthIn: number; widthIn: number; heightIn: number }[]): number {
  return items.reduce(
    (sum, i) => sum + cubicFeetFor({ ...i, isEstimated: true }),
    0,
  );
}

/** The truck a load of this size actually needs, through the app's own logic. */
function truckFor(rawCuFt: number): TruckSize {
  return recommendTruckSize(rawCuFt * 1.2);
}

async function predict(photoPath: string, room: TruthRoom): Promise<Predicted[]> {
  if (useMock) {
    return mockDetect('r1', room.roomName, 'p1').map((i) => ({
      name: i.name,
      cubicFeet: i.cubicFeet,
    }));
  }

  const key = process.env.VISION_API_KEY;
  if (!key) {
    console.error('VISION_API_KEY is not set. Run with --mock to test the harness first.');
    process.exit(1);
  }

  const base64 = readFileSync(photoPath).toString('base64');
  const media = extname(photoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.VISION_MODEL ?? 'claude-opus-5',
      max_tokens: 4000,
      system: readFileSync(new URL('./prompt.txt', import.meta.url), 'utf8'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: base64 } },
            {
              type: 'text',
              text: `Room label given by the user: "${room.roomName}"\n\nList every object in this room that will be loaded onto the moving truck. Return only JSON of the form {"items":[...]}.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`  upstream ${response.status} for ${photoPath}`);
    return [];
  }
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = payload.content?.find((b) => b.type === 'text')?.text ?? '';
  try {
    const parsed = JSON.parse(text) as { items?: { name?: string; dimensions?: TruthItem }[] };
    return (parsed.items ?? []).flatMap((i) =>
      i.dimensions && typeof i.name === 'string'
        ? [{ name: i.name, cubicFeet: cubicFeetFor({ ...i.dimensions, isEstimated: true }) }]
        : [],
    );
  } catch {
    console.error(`  unparseable response for ${photoPath}`);
    return [];
  }
}

async function main() {
  let truth: Record<string, TruthRoom>;
  try {
    truth = JSON.parse(readFileSync(join(photoDir, 'truth.json'), 'utf8')) as Record<string, TruthRoom>;
  } catch {
    console.error(`No truth.json in ${photoDir}. See scripts/eval/README.md.`);
    process.exit(1);
  }

  const photos = readdirSync(photoDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (photos.length === 0) {
    console.error(`No photos in ${photoDir}.`);
    process.exit(1);
  }

  const errors: number[] = [];
  let truckExact = 0;
  let truckUnder = 0;
  let totalTrue = 0;
  let totalPredicted = 0;

  console.log(`\n${useMock ? 'MOCK' : 'LIVE'} · ${photos.length} photo(s)\n`);
  console.log('room'.padEnd(20), 'measured'.padStart(10), 'predicted'.padStart(10), 'error'.padStart(8), '  truck');

  for (const photo of photos) {
    const room = truth[photo];
    if (!room) {
      console.log(`${photo.padEnd(20)} ${'no ground truth'.padStart(10)}`);
      continue;
    }
    const measured = volumeOf(room.items);
    const predicted = (await predict(join(photoDir, photo), room)).reduce(
      (sum, i) => sum + i.cubicFeet,
      0,
    );
    totalTrue += measured;
    totalPredicted += predicted;

    const error = measured === 0 ? 0 : (predicted - measured) / measured;
    errors.push(Math.abs(error));

    const truckTrue = truckFor(measured);
    const truckPred = truckFor(predicted);
    if (truckTrue === truckPred) truckExact += 1;
    // Under-sizing is the failure that strands belongings, so it is counted apart.
    const under = TRUCK_CAPACITY[truckPred].max < TRUCK_CAPACITY[truckTrue].max;
    if (under) truckUnder += 1;

    console.log(
      room.roomName.slice(0, 19).padEnd(20),
      `${measured.toFixed(1)} ft³`.padStart(10),
      `${predicted.toFixed(1)} ft³`.padStart(10),
      `${(error * 100).toFixed(0)}%`.padStart(8),
      ` ${truckTrue} → ${truckPred}${under ? '  UNDER-SIZED' : ''}`,
    );
  }

  const sorted = [...errors].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
  const wholeMoveError = totalTrue === 0 ? 0 : (totalPredicted - totalTrue) / totalTrue;

  console.log('\n— results —');
  console.log(`median absolute room error   ${(median * 100).toFixed(1)}%   (pass ≤ 15%)`);
  console.log(`whole-move volume bias       ${(wholeMoveError * 100).toFixed(1)}%   (bias hurts ~5x more than spread)`);
  console.log(`truck size exact             ${((truckExact / errors.length) * 100).toFixed(0)}%   (pass ≥ 85%)`);
  console.log(`truck UNDER-sized            ${((truckUnder / errors.length) * 100).toFixed(0)}%   (pass ≤ 5% — the binding one)`);
  console.log(`whole move                   ${totalTrue.toFixed(1)} ft³ measured → ${truckFor(totalTrue)}`);
  console.log(`                             ${totalPredicted.toFixed(1)} ft³ predicted → ${truckFor(totalPredicted)}\n`);
}

void main();
