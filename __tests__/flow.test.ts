import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLOW,
  nextStep,
  previousStep,
  stepIndex,
  stepPosition,
  type FlowRoute,
} from '../src/domain/flow';
import { MOVE_STATUS_ORDER } from '../src/domain/types';

/**
 * Back and forward are both derived from FLOW, and the point of deriving them is
 * that they cannot disagree. These assert that they don't.
 */

test('forward and back are inverses of each other', () => {
  // The bug this rules out: a "Next" that leads somewhere whose own "Back" goes
  // elsewhere, leaving a loop the user cannot get out of by retracing.
  for (const step of FLOW) {
    const forward = nextStep(step.route);
    if (forward) assert.equal(previousStep(forward.route)?.route, step.route);

    const back = previousStep(step.route);
    if (back) assert.equal(nextStep(back.route)?.route, step.route);
  }
});

test('walking forward from the first step reaches every step exactly once', () => {
  const visited: FlowRoute[] = [FLOW[0]!.route];
  let current = nextStep(FLOW[0]!.route);
  while (current) {
    assert.ok(!visited.includes(current.route), `revisited ${current.route}`);
    visited.push(current.route);
    current = nextStep(current.route);
  }
  assert.deepEqual(visited, FLOW.map((s) => s.route));
});

test('the flow has ends, and they are where they should be', () => {
  assert.equal(previousStep(FLOW[0]!.route), null, 'the first step has nothing before it');
  assert.equal(nextStep(FLOW.at(-1)!.route), null, 'the last step has nothing after it');
});

test('positions are 1-based and count the whole flow', () => {
  assert.deepEqual(stepPosition('/inventory'), { position: 1, total: FLOW.length });
  assert.deepEqual(stepPosition('/packing'), { position: FLOW.length, total: FLOW.length });
});

test('a route outside the flow is reported as absent, not as step zero', () => {
  // The dashboard and the detail screens are not steps. Returning 0 here would
  // make them render as "Step 1 of 4" and give them a Back that skips a screen.
  const outside = '/layout-view' as FlowRoute;
  assert.equal(stepIndex(outside), -1);
  assert.equal(nextStep(outside), null);
  assert.equal(previousStep(outside), null);
  assert.equal(stepPosition(outside), null);
});

test('routes are unique', () => {
  const routes = FLOW.map((s) => s.route);
  assert.equal(new Set(routes).size, routes.length);
});

test('every step maps to a status the move model actually has', () => {
  // These drive the dashboard's progress tracker. A status not in the model
  // would render as an unreachable step there.
  for (const step of FLOW) {
    assert.ok(MOVE_STATUS_ORDER.includes(step.status), `${step.route} -> ${step.status}`);
  }
});

test('statuses never go backwards as the flow goes forwards', () => {
  // Prices deliberately shares a status with Truck Size — it is a detour off the
  // same stage rather than a stage of its own — so this is monotonic, not strict.
  const positions = FLOW.map((s) => MOVE_STATUS_ORDER.indexOf(s.status));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i]! >= positions[i - 1]!, `${FLOW[i]!.route} moves the status backwards`);
  }
});
