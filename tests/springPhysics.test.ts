import assert from 'node:assert/strict';
import test from 'node:test';
import { findNearestSnapIndex, RAIL_SPRING, stepSpring } from '../src/services/springPhysics.ts';

test('RAIL_SPRING uses slightly overdamped parameters k=180, c=28, m=1', () => {
  assert.deepEqual(RAIL_SPRING, { stiffness: 180, damping: 28, mass: 1 });
});

test('stepSpring preserves momentum on mid-flight target reversal and settles cleanly', () => {
  let state = { value: 0, velocity: 0 };
  for (let i = 0; i < 6; i++) {
    state = stepSpring(state, 200, 0.016);
  }
  assert.ok(state.value > 0 && state.velocity > 0, 'Pill should be moving forward');

  // Reverse target back to 0 while carrying positive forward velocity
  const reversed = stepSpring(state, 0, 0.016);
  assert.ok(reversed.value > state.value * 0.9, 'Mid-flight reversal should keep forward momentum briefly instead of snapping back');

  let current = { ...reversed, settled: false };
  for (let i = 0; i < 200 && !current.settled; i++) {
    current = stepSpring(current, 0, 0.016);
  }
  assert.equal(current.settled, true);
  assert.equal(current.value, 0);
  assert.equal(current.velocity, 0);
});

test('findNearestSnapIndex picks the closest pill center to viewport center', () => {
  const centers = [40, 120, 210, 300];
  assert.equal(findNearestSnapIndex(centers, 110), 1);
  assert.equal(findNearestSnapIndex(centers, 250), 2);
  assert.equal(findNearestSnapIndex(centers, 265), 3);
  assert.equal(findNearestSnapIndex([], 100), -1);
});
