import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampImageRadius, collectTextColorIds, getImageRadius } from '../src/services/elementStyle.ts';

test('text color includes selected standalone and bound text but excludes containers and locked text', () => {
  const elements = [
    { id: 'card', type: 'rectangle', boundElements: [{ id: 'label', type: 'text' }] },
    { id: 'label', type: 'text', containerId: 'card' },
    { id: 'heading', type: 'text' },
    { id: 'locked', type: 'text', locked: true },
    { id: 'other', type: 'text' },
  ];
  assert.deepEqual([...collectTextColorIds(elements, { card: true, heading: true, locked: true })], ['label', 'heading']);
});

test('image radius accepts zero and matches Excalidraw adaptive and proportional radii', () => {
  assert.equal(clampImageRadius(0, 200, 120), 0);
  assert.equal(clampImageRadius(90, 200, 120), 30);
  assert.equal(clampImageRadius(-4, 200, 120), 0);
  assert.equal(clampImageRadius(Number.NaN, 200, 120), 0);
  assert.equal(getImageRadius({ width: 400, height: 240, roundness: { type: 3, value: 20 } }), 20);
  assert.equal(getImageRadius({ width: 400, height: 240, roundness: { type: 2 } }), 60);
});
