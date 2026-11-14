import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { buildRevealSteps, buildStepSchedule, resolveScheduledStep } from '../src/services/sceneMath.ts';

function rect(id: string, x: number, y: number): ExcalidrawElement {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: 120,
    height: 60,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a0' as ExcalidrawElement['index'],
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

test('buildStepSchedule adds non-uniform step durations and thinking pauses', () => {
  const steps = buildRevealSteps([
    rect('a', 0, 0),
    rect('b', 40, 20),
    rect('c', 420, 260),
  ]);
  const schedule = buildStepSchedule(steps);
  assert.equal(schedule.items.length, 3);
  assert.ok(schedule.totalMs >= 1500 && schedule.totalMs <= 5800);

  const durations = schedule.items.map(item => item.endMs - item.startMs);
  assert.ok(new Set(durations.map(d => Math.round(d))).size > 1, 'step durations should vary naturally');
  assert.ok(schedule.items[1]!.thinkFraction > 0 && schedule.items[2]!.thinkFraction > 0);

  const midThink = resolveScheduledStep(schedule.items, schedule.items[2]!.startMs + 5);
  assert.equal(midThink.stepIndex, 2);
  assert.ok(midThink.stepProgress < midThink.thinkFraction);
});
