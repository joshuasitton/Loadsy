/**
 * Turns scored runs into the lines the eval prints. Pure: every function returns
 * lines and prints nothing, so `detect.ts` owns the terminal and this owns the wording.
 */

import { formatCeiling, ceilingForDetection } from '../../src/domain/ceiling';
import { DEFAULT_PACKING_BUFFER_PCT } from '../../src/domain/volume';
import {
  groupSeen,
  headline,
  readAnswer,
  median,
  missCounts,
  moveScenarios,
  simulateRoom,
  spread,
  truckFor,
  type MoveScenario,
  type Simulation,
  type AttemptScore,
  type Headline,
  type RoomResult,
  type RoomScore,
  type SavedRun,
} from './score';

/** Claude Opus 5 list prices per million tokens – for the cost line only. */
export const OPUS_5_PRICE = { input: 5, output: 25 };

/** Below this many rooms the pass bars are not a verdict, and the report says so. */
export const ROOMS_FOR_A_VERDICT = 4;

const signed = (fraction: number, digits = 0) => `${fraction >= 0 ? '+' : '-'}${Math.abs(fraction * 100).toFixed(digits)}%`;
const plain = (fraction: number | null, digits = 0) => (fraction === null ? '–' : `${(fraction * 100).toFixed(digits)}%`);
const cuft = (value: number) => `${value.toFixed(1)} ft³`;
const signedCuft = (value: number) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}`;
const dims = (d: { lengthIn: number; widthIn: number; heightIn: number }) =>
  `${round(d.lengthIn)}×${round(d.widthIn)}×${round(d.heightIn)} in`;
const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const fit = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width));

function attemptLine(index: number, attempt: AttemptScore, deadlineMs: number): string {
  const label = `  answer ${index + 1}`.padEnd(12);
  // Nothing to say about timing or tokens for an answer no request produced – the mock's.
  const usage =
    attempt.ms === 0 && attempt.outputTokens === 0
      ? ''
      : `   ${seconds(attempt.ms)}${attempt.ms > deadlineMs ? ' LATE' : ''} · ${attempt.outputTokens.toLocaleString()} out${attempt.stopReason ? ` · ${attempt.stopReason}` : ''}`;
  if (!attempt.ok) return `${label}FAILED – ${attempt.reason}${usage}`;
  const { score } = attempt;
  const why = `sizing ${signedCuft(score.explained.sizing)} · missed ${signedCuft(score.explained.missed)} · extras ${signedCuft(score.explained.extras)}`;
  return `${label}${cuft(score.seenCuFt).padStart(10)}  ${signed(score.error).padStart(5)}   ${why}${usage}`;
}

function pairingLines(score: RoomScore): string[] {
  const lines: string[] = [];
  if (score.pairs.length > 0) {
    lines.push(`    ${'measured'.padEnd(26)}${'seen as'.padEnd(26)}${'measured'.padEnd(18)}${'seen'.padEnd(18)}  long short height volume`);
    for (const pair of [...score.pairs].sort((a, b) => b.measured.cubicFeet - a.measured.cubicFeet)) {
      const e = pair.error;
      lines.push(
        `    ${fit(pair.measured.name, 25)} ${fit(`"${pair.seen.name}"`, 25)} ${dims(pair.measured).padEnd(18)}${dims(pair.seen).padEnd(18)}` +
          `  ${signed(e.long).padStart(4)} ${signed(e.short).padStart(5)} ${signed(e.height).padStart(6)} ${signed(e.volume).padStart(6)}` +
          (pair.seen.confidence === 'low' ? '  (flagged low)' : ''),
      );
    }
  }
  if (score.missed.length > 0) {
    lines.push('  missed – on the truck, not in the answer');
    for (const item of [...score.missed].sort((a, b) => b.cubicFeet - a.cubicFeet)) {
      lines.push(`    ${fit(item.name, 51)} ${dims(item).padEnd(18)}${cuft(item.cubicFeet).padStart(10)}`);
    }
  }
  if (score.extras.length > 0) {
    lines.push('  extras – in the answer, not measured');
    for (const extra of [...score.extras].sort((a, b) => b.seen.cubicFeet - a.seen.cubicFeet)) {
      const note = extra.duplicateOf ? `  likely a second count of ${extra.duplicateOf}` : '';
      lines.push(`    ${fit(`"${extra.seen.name}"`, 51)} ${dims(extra.seen).padEnd(18)}${cuft(extra.seen.cubicFeet).padStart(10)}${note}`);
    }
  }
  return lines;
}

/**
 * One room: every answer on a line, how much the answers disagree, which items were
 * missed how often, and one answer item by item – the first by default, since the
 * rest repeat it with small differences.
 */
export function roomLines(room: RoomResult, deadlineMs: number, everyAnswer: boolean): string[] {
  const measuredCount = room.attempts.find((a) => a.ok)?.score;
  const lines = [
    `${room.roomName}${room.photoCount > 0 ? ` · ${room.photoCount} photo${room.photoCount === 1 ? '' : 's'}` : ''} · measured ${cuft(room.measuredCuFt)}` +
      (measuredCount ? ` (${measuredCount.pairs.length + measuredCount.missed.length} items)` : ''),
    ...room.attempts.map((attempt, i) => attemptLine(i, attempt, deadlineMs)),
  ];

  const s = spread(room);
  if (s && s.volumes.length > 1) {
    lines.push(`  spread    ${cuft(s.min)} to ${cuft(s.max)} across ${s.volumes.length} answers (±${(s.cv * 100).toFixed(0)}% of the mean)`);
  }
  const often = missCounts(room).filter((m) => m.of > 1);
  if (often.length > 0) {
    lines.push(`  missed in how many answers: ${often.map((m) => `${m.name} ${m.missed}/${m.of}`).join(' · ')}`);
  }

  room.attempts.forEach((attempt, i) => {
    if (!attempt.ok) return;
    if (!everyAnswer && i !== room.attempts.findIndex((a) => a.ok)) return;
    lines.push('', `  answer ${i + 1}, item by item${everyAnswer ? '' : '   (--every-answer shows the rest)'}`, ...pairingLines(attempt.score));
  });
  return [...lines, ''];
}

function headlineLines(h: Headline): string[] {
  return [
    `answers scored               ${h.scored} of ${h.scored + h.failed}${h.failed ? `   (${h.failed} failed)` : ''}`,
    `median absolute room error   ${plain(h.medianAbsRoomError, 1)}   (pass ≤ 15%)`,
    `volume bias                  ${h.bias === null ? '–' : signed(h.bias, 1)}   (bias hurts far more than spread)`,
    `truck exact / within one     ${plain(h.truckExact)} / ${plain(h.truckWithinOne)}   (pass ≥ 85% / ≥ 98%)`,
    `truck UNDER-sized            ${plain(h.truckUnder)}   (pass ≤ 5% – the binding one)`,
  ];
}

function itemLines(h: Headline): string[] {
  if (h.scored === 0) return [];
  return [
    `measured volume found        ${plain(h.volumeRecall)}   (the rest was missed outright)`,
    h.sides
      ? `median side error            long ${signed(h.sides.long)} · short ${signed(h.sides.short)} · height ${signed(h.sides.height)}   (signed: minus is too small)`
      : 'median side error            – (nothing paired)',
    `median item volume error     ${plain(h.medianAbsItemVolumeError)}   (absolute, over paired items)`,
    `why the totals are off       sizing ${signedCuft(h.explained.sizing)} · missed ${signedCuft(h.explained.missed)} · extras ${signedCuft(h.explained.extras)} ft³   (all answers added)`,
    `missed / extras              ${h.missedItems} missed · ${h.extras} extra${h.extras === 1 ? '' : 's'}, ${h.likelyDuplicates} of them likely double counts`,
  ];
}

function usageStats(run: SavedRun, keys: readonly string[]) {
  const attempts = keys.flatMap((key) => run.rooms[key]?.attempts ?? []);
  return {
    cutOff: attempts.filter((a) => a.stopReason === 'max_tokens').length,
    p50: median(attempts.filter((a) => a.ms > 0).map((a) => a.ms)),
    medianOut: median(attempts.filter((a) => a.outputTokens > 0).map((a) => a.outputTokens)),
  };
}

/** Latency, token use and cost, from what the API reported. */
function usageLines(run: SavedRun, rooms: readonly RoomResult[]): string[] {
  const attempts = Object.entries(run.rooms)
    .filter(([key]) => rooms.some((room) => room.key === key))
    .flatMap(([, room]) => room.attempts);
  const answered = attempts.filter((a) => a.ms > 0);
  if (answered.length === 0) return [];

  const ms = answered.map((a) => a.ms).sort((a, b) => a - b);
  const p95 = ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))]!;
  const late = ms.filter((m) => m > run.deadlineMs).length;
  const input = attempts.reduce((n, a) => n + a.inputTokens, 0);
  const output = attempts.reduce((n, a) => n + a.outputTokens, 0);
  const maxOut = Math.max(...attempts.map((a) => a.outputTokens));
  const cutOff = attempts.filter((a) => a.stopReason === 'max_tokens').length;
  const cost = (input * OPUS_5_PRICE.input + output * OPUS_5_PRICE.output) / 1e6;

  return [
    `latency p50 / p95            ${seconds(median(ms)!)} / ${seconds(p95)}   (route gives up at ${seconds(run.deadlineMs)}; ${late} of ${ms.length} later than that)`,
    `output tokens, largest       ${maxOut.toLocaleString()} of the ${run.maxTokens.toLocaleString()} budget   (${cutOff} answer${cutOff === 1 ? '' : 's'} cut off at max_tokens)`,
    `tokens in / out              ${input.toLocaleString()} / ${output.toLocaleString()}` +
      (run.model === 'claude-opus-5' ? `   ≈ $${cost.toFixed(2)} at Opus 5 list prices` : `   (${run.model})`),
  ];
}

export function summaryLines(
  run: SavedRun,
  rooms: readonly RoomResult[],
  unscored: readonly string[],
  unmeasured: readonly string[] = [],
): string[] {
  const shipped = headline(rooms, true);
  const patient = headline(rooms, false);
  const lines: string[] = [];

  for (const key of unscored) lines.push(`  ! "${key}" was in this run but has no ground truth in truth.json – not scored`);
  for (const key of unmeasured) lines.push(`  · "${key}" is set up in truth.json but not measured yet – its answers are saved, and scored once it is`);
  const provisional = rooms.filter((room) => !room.complete).map((room) => room.key);
  if (provisional.length > 0) {
    lines.push(`  · provisional: ${provisional.join(', ')} not marked "complete" in truth.json – unmeasured items and boxes read as over-estimates`);
  }
  if (unscored.length + unmeasured.length + provisional.length > 0) lines.push('');

  lines.push('— as a user would get it (answers after the deadline count as failures) —', ...headlineLines(shipped));
  if (shipped.scored !== patient.scored) {
    lines.push('', '— what the model can do (deadline ignored) —', ...headlineLines(patient));
  }
  lines.push('', '— item by item (deadline ignored) —', ...itemLines(patient));

  if (rooms.length > 1) lines.push('', ...scenarioLines(moveScenarios(rooms)));

  const usage = usageLines(run, rooms);
  if (usage.length > 0) lines.push('', ...usage);

  if (rooms.length < ROOMS_FOR_A_VERDICT) {
    lines.push(
      '',
      `  ! ${rooms.length} room${rooms.length === 1 ? '' : 's'} is a smoke test, not a verdict. The pass bars need ${ROOMS_FOR_A_VERDICT}+ rooms before`,
      '    they mean anything: read the item-level lines for direction, and do not tune the prompt to these rooms.',
    );
  }
  return lines;
}

/**
 * This run beside an earlier one, over the rooms both contain.
 *
 * Refuses to call a comparison like-for-like when the photos differ, because then a
 * better number could be a better photo. A changed request is expected – that is
 * usually what is being tested – so it is stated, not warned about.
 */
export function compareLines(
  current: { run: SavedRun; rooms: RoomResult[] },
  baseline: { run: SavedRun; rooms: RoomResult[]; file: string },
): string[] {
  const shared = current.rooms.filter((room) => baseline.rooms.some((b) => b.key === room.key)).map((room) => room.key);
  const pick = (rooms: RoomResult[]) => rooms.filter((room) => shared.includes(room.key));
  const lines = [`— compared with ${baseline.file} ("${baseline.run.label}", ${baseline.run.startedAt.slice(0, 16).replace('T', ' ')}) —`];
  if (shared.length === 0) return [...lines, '  no rooms in common – nothing to compare', ''];

  for (const key of shared) {
    const a = current.run.rooms[key]!;
    const b = baseline.run.rooms[key]!;
    if (a.photoHashes.join() !== b.photoHashes.join()) {
      lines.push(`  ! ${key}: different photos in the two runs – not a like-for-like comparison`);
    } else if (a.requestHash !== b.requestHash) {
      lines.push(`  ${key}: same photos, different request (prompt, model, budget or ceiling)`);
    } else {
      lines.push(`  ${key}: same photos, same request – any difference is the model's own variation`);
    }
  }

  const then = headline(pick(baseline.rooms), true);
  const now = headline(pick(current.rooms), true);
  const thenPatient = headline(pick(baseline.rooms), false);
  const nowPatient = headline(pick(current.rooms), false);
  const row = (label: string, before: string, after: string) => `${label.padEnd(29)}${before.padStart(10)}  →  ${after}`;
  const bias = (h: Headline) => (h.bias === null ? '–' : signed(h.bias, 1));

  const usageThen = usageStats(baseline.run, shared);
  const usageNow = usageStats(current.run, shared);
  lines.push(
    row('answers failed', `${then.failed} of ${then.scored + then.failed}`, `${now.failed} of ${now.scored + now.failed}`),
    row('cut off at max_tokens', String(usageThen.cutOff), String(usageNow.cutOff)),
    row('latency p50', usageThen.p50 === null ? '–' : seconds(usageThen.p50), usageNow.p50 === null ? '–' : seconds(usageNow.p50)),
    row('median output tokens', usageThen.medianOut === null ? '–' : usageThen.medianOut.toLocaleString(), usageNow.medianOut === null ? '–' : usageNow.medianOut.toLocaleString()),
    row('median absolute room error', plain(then.medianAbsRoomError, 1), plain(now.medianAbsRoomError, 1)),
    row('volume bias', bias(then), bias(now)),
    row('truck UNDER-sized', plain(then.truckUnder), plain(now.truckUnder)),
    row('measured volume found', plain(thenPatient.volumeRecall), plain(nowPatient.volumeRecall)),
    row('median item volume error', plain(thenPatient.medianAbsItemVolumeError), plain(nowPatient.medianAbsItemVolumeError)),
    row('likely double counts', String(thenPatient.likelyDuplicates), String(nowPatient.likelyDuplicates)),
  );
  return [...lines, ''];
}

/** What a dry run expects a live run to cost, with the worst case beside the guess. */
export function costEstimate(inputTokens: number, requests: number, maxTokens: number): { likely: number; worst: number } {
  const input = (inputTokens * OPUS_5_PRICE.input) / 1e6;
  return {
    likely: input + (requests * 1500 * OPUS_5_PRICE.output) / 1e6,
    worst: input + (requests * maxTokens * OPUS_5_PRICE.output) / 1e6,
  };
}

/**
 * A blind run: what the app would have shown, with nothing to score it against.
 *
 * Room by room, the inventory from the first answer – identical objects counted
 * together, low-confidence items marked with the reason the app would give – then
 * the photographed rooms added up and sized as one truck through the app's own
 * buffer. Only those rooms: it is a truck for what was photographed, not the move.
 */
export function inventoryLines(run: SavedRun, everyAnswer: boolean): string[] {
  const lines: string[] = [];
  const perRun: (number | null)[] = [];

  for (const saved of Object.values(run.rooms)) {
    const ceiling = saved.ceilingIn === null ? '' : ` · ceiling ${formatCeiling(saved.ceilingIn)}${ceilingForDetection(saved.ceilingIn) === null ? ' (standard)' : ''}`;
    lines.push(`${saved.roomName} · ${saved.photoCount} photo${saved.photoCount === 1 ? '' : 's'}${ceiling}`);

    saved.attempts.forEach((attempt, i) => {
      const usage = `${seconds(attempt.ms)}${attempt.ms > run.deadlineMs ? ' LATE – the app would have given up' : ''} · ${attempt.outputTokens.toLocaleString()} tokens out${attempt.stopReason ? ` · ${attempt.stopReason}` : ''}`;
      const answer = attempt.text === null ? { ok: false as const, reason: attempt.error ?? 'no answer' } : readAnswer(attempt.text, attempt.stopReason, saved.roomName);
      if (!answer.ok) {
        lines.push(`  answer ${i + 1}  FAILED – ${answer.reason}   ${usage}`);
        perRun[i] = null;
        return;
      }
      const total = answer.items.reduce((n, item) => n + item.cubicFeet, 0);
      const low = answer.items.filter((item) => item.confidence === 'low').length;
      if (perRun[i] !== null) perRun[i] = (perRun[i] ?? 0) + total;
      lines.push(`  answer ${i + 1}  ${answer.items.length} items · ${cuft(total)}${low ? ` · ${low} the app would ask you to check` : ''}   ${usage}`);

      if (i > 0 && !everyAnswer) return;
      for (const { item, count, lowCount, lowReason } of groupSeen(answer.items)) {
        const name = count > 1 ? `${item.name} ×${count}` : item.name;
        const volume = count > 1 ? `${cuft(item.cubicFeet)} each = ${cuft(item.cubicFeet * count)}` : cuft(item.cubicFeet);
        const which = count > 1 ? ` ${lowCount} of ${count}` : '';
        const flag = lowCount > 0 ? `   check${which}: ${lowReason ?? 'low confidence'}` : '';
        lines.push(`    ${fit(name, 34)} ${dims(item).padEnd(18)}${volume.padStart(24)}${flag}`);
      }
    });
    lines.push('');
  }

  const rooms = Object.keys(run.rooms).length;
  perRun.forEach((raw, i) => {
    const label = perRun.length > 1 ? `run ${i + 1}: ` : '';
    if (raw === null || raw === undefined) {
      lines.push(`${label}a room failed, so there is no total – as in the app`);
      return;
    }
    const buffered = raw * (1 + DEFAULT_PACKING_BUFFER_PCT);
    lines.push(
      `${label}${rooms === 1 ? 'this room' : `these ${rooms} rooms`}: ${cuft(raw)} of furniture and items, ${cuft(buffered)} with the ${Math.round(DEFAULT_PACKING_BUFFER_PCT * 100)}% packing buffer → ${truckFor(raw)} truck`,
    );
  });
  lines.push(
    '',
    '  This is the model unchecked – no measurements, nothing scored. Measure with a tape anyway,',
    "  and don't copy these numbers into truth.json: that would score the model against itself.",
    '',
  );
  return lines;
}

function scenarioName(scenario: MoveScenario, total: number): string {
  return scenario.keys.length === total && total > 2 ? `all ${total} rooms` : scenario.keys.join(' + ');
}

/**
 * Every combination of measured rooms as one move, smallest first: the truck it needs,
 * how close that is to a truck line, and each answer's truck – with anything counted in
 * the wrong room of that move called out.
 */
export function scenarioLines(scenarios: readonly MoveScenario[]): string[] {
  if (scenarios.length === 0) return [];
  const total = Math.max(...scenarios.map((scenario) => scenario.keys.length));
  const lines = [
    '— moves: every combination of measured rooms, from the same saved answers (deadline ignored) —',
    `    ${'rooms'.padEnd(52)}${'measured → truck'.padEnd(22)}${'line'.padEnd(7)}answers`,
  ];
  const tally = { exact: 0, over: 0, UNDER: 0 };
  for (const scenario of scenarios) {
    const answers = scenario.answers.map((answer) => {
      if (answer === null) return 'failed';
      tally[answer.verdict] += 1;
      return `${answer.seen}${answer.verdict === 'exact' ? ' ✓' : answer.verdict === 'over' ? ' over' : ' UNDER'}`;
    });
    lines.push(
      `    ${fit(scenarioName(scenario, total), 51)} ${`${cuft(scenario.measuredCuFt)} → ${scenario.truth}`.padEnd(22)}${`±${(scenario.margin * 100).toFixed(0)}%`.padEnd(7)}${answers.join(' · ')}` +
        (scenario.complete ? '' : '  (provisional)'),
    );
    scenario.answers.forEach((answer, i) => {
      const twice = answer?.crossRoom.filter((item) => item.countedTwice) ?? [];
      const misplaced = answer?.crossRoom.filter((item) => !item.countedTwice) ?? [];
      if (twice.length > 0) {
        lines.push(`        answer ${i + 1} counted twice: ${twice.map((item) => `"${item.name}" (${item.belongsTo}, also in ${item.listedIn}) ${cuft(item.cubicFeet)}`).join(' · ')}`);
      }
      if (misplaced.length > 0) {
        lines.push(`        answer ${i + 1} in the wrong room: ${misplaced.map((item) => `"${item.name}" listed in ${item.listedIn}, belongs to ${item.belongsTo}`).join(' · ')}`);
      }
    });
  }
  const answered = tally.exact + tally.over + tally.UNDER;
  if (answered > 0) {
    const share = (n: number) => `${((n / answered) * 100).toFixed(0)}%`;
    lines.push(
      `    trucks across ${answered} move answers: exact ${share(tally.exact)} · over ${share(tally.over)} · UNDER ${share(tally.UNDER)}` +
        '   (moves share room answers – not independent trials)',
    );
  }
  return lines;
}

/**
 * A room's resampled moves: the truck from one answer, and from the median or largest of
 * several – with the warning that matters most printed first when there are few real answers.
 */
export function simulationLines(room: RoomResult, draws: number): string[] {
  const sim: Simulation | null = simulateRoom(room, draws);
  if (sim === null) return [`${room.roomName}: no usable answers to simulate from`];
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const lines = [
    `— simulation: ${room.roomName}, ${sim.draws.toLocaleString()} moves resampled from ${sim.answers} real answer${sim.answers === 1 ? '' : 's'} (no requests sent; deadline ignored) —`,
    `    measured ${cuft(room.measuredCuFt)} → ${sim.truth} truck${room.complete ? '' : '   (provisional: the room is not marked complete)'}`,
  ];
  if (sim.answers < 20) {
    lines.push(`    ! only ${sim.answers} real answers: every simulated move is built from those, so this shows little they did not. 30–50 is where it steadies.`);
  }
  lines.push(`    ${'asking'.padEnd(26)}${'truck exact'.padEnd(13)}${'over'.padEnd(7)}${'UNDER'.padEnd(8)}${'median error'.padEnd(14)}${'90th pct error'.padEnd(16)}middle 80% of totals`);
  for (const r of sim.results) {
    const label = r.k === 1 ? 'once' : `${r.k} times, ${r.combine}`;
    lines.push(
      `    ${label.padEnd(26)}${pct(r.exact).padEnd(13)}${pct(r.over).padEnd(7)}${pct(r.under).padEnd(8)}${pct(r.medianAbsError).padEnd(14)}${pct(r.p90AbsError).padEnd(16)}${cuft(r.p10CuFt)} – ${cuft(r.p90CuFt)}`,
    );
  }
  lines.push(
    `    one-answer exact rate from the real answers: ${pct(sim.convergence[sim.convergence.length - 1]!.exact)} ± ${pct(sim.exactInterval)}` +
      `   — as more real answers came in: ${sim.convergence.map((c) => `${c.n}: ${pct(c.exact)}`).join(' · ')}`,
    '    The model does not learn between requests: more runs sharpen this picture, they do not change the model.',
  );
  return lines;
}
