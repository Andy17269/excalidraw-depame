import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSpatialCanvasContext,
  computeViewportWorldBounds,
  snapToGrid8,
} from '../src/services/canvasContext.ts';

test('computeViewportWorldBounds converts scroll and zoom into world coordinates', () => {
  const bounds = computeViewportWorldBounds({
    scrollX: -100,
    scrollY: -50,
    width: 1000,
    height: 800,
    zoom: { value: 2 },
  });
  assert.deepEqual(bounds, {
    x: 100,
    y: 50,
    width: 500,
    height: 400,
    zoom: 2,
  });
});

test('buildSpatialCanvasContext splits selected, viewport, and offscreen layers and strips noisy fields', () => {
  const elements = [
    {
      id: 'sel-1',
      type: 'rectangle',
      x: 120,
      y: 120,
      width: 200,
      height: 80,
      strokeColor: '#1e293b',
      backgroundColor: '#ffffff',
      text: 'Selected Card',
      seed: 99999,
      versionNonce: 88888,
      points: [[0, 0], [10, 10]],
    },
    {
      id: 'vis-1',
      type: 'text',
      x: 400,
      y: 220,
      width: 120,
      height: 24,
      strokeColor: '#0f172a',
      backgroundColor: 'transparent',
      text: 'Visible Header',
      seed: 123,
    },
    {
      id: 'off-1',
      type: 'rectangle',
      x: 2400,
      y: 1600,
      width: 300,
      height: 200,
      strokeColor: '#cbd5e1',
      backgroundColor: '#f8fafc',
      text: 'Far Offscreen',
    },
    {
      id: 'del-1',
      type: 'rectangle',
      x: 150,
      y: 150,
      width: 50,
      height: 50,
      strokeColor: '#000',
      backgroundColor: '#fff',
      isDeleted: true,
    },
  ];

  const { context, viewportSourceElements } = buildSpatialCanvasContext(elements, {
    scrollX: 0,
    scrollY: 0,
    width: 1280,
    height: 800,
    zoom: { value: 1 },
    selectedElementIds: { 'sel-1': true },
  });

  assert.equal(context.selectedElements.length, 1);
  assert.equal(context.selectedElements[0]?.id, 'sel-1');
  assert.equal('seed' in context.selectedElements[0]!, false);
  assert.equal('versionNonce' in context.selectedElements[0]!, false);
  assert.equal('points' in context.selectedElements[0]!, false);

  assert.equal(context.viewportElements.length, 1);
  assert.equal(context.viewportElements[0]?.id, 'vis-1');

  assert.equal(context.offscreenElements.length, 1);
  assert.deepEqual(context.offscreenElements[0], {
    id: 'off-1',
    type: 'rectangle',
    x: 2400,
    y: 1600,
    width: 300,
    height: 200,
    text: 'Far Offscreen',
  });

  assert.deepEqual(viewportSourceElements.map(el => el.id), ['sel-1', 'vis-1']);
});

test('snapToGrid8 aligns coordinates and sizes to 8px grid', () => {
  assert.equal(snapToGrid8(0), 0);
  assert.equal(snapToGrid8(13), 16);
  assert.equal(snapToGrid8(19), 16);
  assert.equal(snapToGrid8(20), 24);
  assert.equal(snapToGrid8(-13), -16);
});
