import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampZoom,
  zoomAtPoint,
  normalizeMermaid,
  summarizeElements,
  needsCanvasContext,
  mindmapAsFlowchart,
  buildMindmapBranchAssignments,
  resolveDiagramNodeColors,
  sanitizeSoftHexColor,
  SOFT_MINDMAP_PALETTE,
  computeFitViewport,
  interpolateViewport,
  truncatePolyline,
  buildRevealSteps,
} from '../src/services/sceneMath.ts';

test('mindmaps retain their hierarchy as editable flowchart nodes with escaped labels', () => {
  assert.equal(mindmapAsFlowchart({ descr: '计划', children: [{ descr: 'A "test"', children: [] }] }), 'flowchart LR\nM1["计划"]\nM2["A &quot;test&quot;"]\nM1 --- M2');
});

test('mindmap and flowchart node coloring uses at most two soft muted colors and rejects garish hex values', () => {
  assert.equal(sanitizeSoftHexColor('#ff0000', SOFT_MINDMAP_PALETTE[0]!.backgroundColor, 'fill'), SOFT_MINDMAP_PALETTE[0]!.backgroundColor);
  assert.equal(sanitizeSoftHexColor('#00ff00', SOFT_MINDMAP_PALETTE[0]!.strokeColor, 'stroke'), SOFT_MINDMAP_PALETTE[0]!.strokeColor);
  assert.equal(sanitizeSoftHexColor('#eef5ff', '#ffffff', 'fill'), '#eef5ff');

  const { branchByOrder } = buildMindmapBranchAssignments({
    descr: '核心',
    children: [
      { descr: '分支A', children: [{ descr: '子项A1', children: [] }] },
      { descr: '分支B', children: [] },
      { descr: '分支C', children: [] },
    ],
  });
  assert.deepEqual(branchByOrder, [0, 0, 0, 1, 0]);

  const colors = resolveDiagramNodeColors(
    [
      { id: 'n1', type: 'rectangle' },
      { id: 'n2', type: 'rectangle' },
      { id: 'n3', type: 'rectangle' },
      { id: 'n4', type: 'rectangle' },
      { id: 'n5', type: 'rectangle' },
    ],
    { isMindmap: true, source: 'mindmap\n%% colors: #ff00ff/#00ff00, #fdf5eb/#b07b42', branchByOrder },
  );
  const distinctPairs = new Set([...colors.values()].map(c => `${c.backgroundColor}|${c.strokeColor}`));
  assert.equal(distinctPairs.size, 2);
  assert.equal(colors.get('n1')?.backgroundColor, SOFT_MINDMAP_PALETTE[0]!.backgroundColor);
  assert.equal(colors.get('n4')?.backgroundColor, '#fdf5eb');
});

test('new diagram prompts stay independent while edits and references use canvas context', () => {
  for (const prompt of ['登录流程', '系统架构', '思维导图', '画一张系统架构图']) assert.equal(needsCanvasContext(prompt), false);
  for (const prompt of ['在现有图右侧追加节点', '把选中文字改为完成', '参考 Apple 风格', '分析当前画作']) assert.equal(needsCanvasContext(prompt), true);
});

test('pinch keeps the scene point under the cursor fixed', () => {
  const next = zoomAtPoint({ zoom: 1, scrollX: 20, scrollY: -30 }, 2, { x: 300, y: 200 });
  assert.equal(300 / next.zoom - next.scrollX, 280);
  assert.equal(200 / next.zoom - next.scrollY, 230);
});

test('pinch clamps zoom without NaN or scrolling drift', () => {
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(100), 30);
  assert.equal(clampZoom(.001), .1);
  assert.equal(zoomAtPoint({ zoom: 1, scrollX: 0, scrollY: 0 }, 100, { x: 0, y: 0 }).zoom, 30);
  assert.equal(zoomAtPoint({ zoom: 1, scrollX: 0, scrollY: 0 }, .001, { x: 0, y: 0 }).zoom, .1);
});

test('Mermaid strips fences and rejects prose and oversized input', () => {
  assert.equal(normalizeMermaid('```mermaid\nflowchart TD\nA-->B\n```'), 'flowchart TD\nA-->B');
  assert.throws(() => normalizeMermaid('Here is your diagram'), /Mermaid/);
  assert.throws(() => normalizeMermaid('flowchart TD\n' + 'A'.repeat(50001)), /Mermaid/);
});

test('summary excludes deleted elements and retains zero opacity text', () => {
  const summary = summarizeElements([
    { id: 'a', type: 'text', x: 12, y: 20, width: 30, height: 40, text: '你好', isDeleted: false },
    { id: 'b', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, isDeleted: true },
  ]);
  assert.deepEqual(JSON.parse(summary), [{ id: 'a', type: 'text', x: 12, y: 20, width: 30, height: 40, text: '你好' }]);
});

test('computeFitViewport caps small diagrams at maxZoom and zooms out for large diagrams', () => {
  const small = computeFitViewport([0, 0, 200, 100], { width: 1280, height: 800 });
  assert.equal(small.zoom, 1.5);

  const large = computeFitViewport([0, 0, 4000, 2000], { width: 1280, height: 800 });
  assert.ok(large.zoom < 1 && large.zoom >= 0.1);
});

test('interpolateViewport matches endpoints and keeps scene center fixed when zooming', () => {
  const viewport = { width: 1280, height: 800 };
  const offsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const from = { zoom: 1, scrollX: 640, scrollY: 400 };
  const to = { zoom: 0.25, scrollX: 2560, scrollY: 1600 };

  assert.deepEqual(interpolateViewport(from, to, 0, viewport, offsets), from);
  assert.deepEqual(interpolateViewport(from, to, 1, viewport, offsets), to);

  const mid = interpolateViewport(from, to, 0.5, viewport, offsets);
  assert.ok(mid.zoom > 0.25 && mid.zoom < 1);
  assert.ok(Math.abs(640 / mid.zoom - mid.scrollX) < 1e-9);
  assert.ok(Math.abs(400 / mid.zoom - mid.scrollY) < 1e-9);
});

test('truncatePolyline extends smoothly along segments and restores full polyline at progress=1', () => {
  const points: [number, number][] = [[0, 0], [100, 0], [100, 100]];
  const half = truncatePolyline(points, 0.5);
  assert.deepEqual(half.tip, [100, 0]);
  assert.equal(half.width, 100);
  assert.equal(half.height, 0);

  const threeQuarter = truncatePolyline(points, 0.75);
  assert.deepEqual(threeQuarter.tip, [100, 50]);
  assert.equal(threeQuarter.width, 100);
  assert.equal(threeQuarter.height, 50);

  const full = truncatePolyline(points, 1);
  assert.deepEqual(full.points, points);
  assert.deepEqual(full.tip, [100, 100]);
});

test('buildRevealSteps groups bound text with container and orders nodes and arrows in flow order', () => {
  const steps = buildRevealSteps([
    { id: 'b', type: 'rectangle', x: 300, y: 0, width: 100, height: 50 },
    { id: 'b-text', type: 'text', x: 310, y: 10, width: 80, height: 20, containerId: 'b' },
    { id: 'edge-ab', type: 'arrow', x: 100, y: 25, width: 200, height: 0, points: [[0, 0], [200, 0]], startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } },
    { id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
    { id: 'a-text', type: 'text', x: 10, y: 10, width: 80, height: 20, containerId: 'a' },
  ]);
  assert.deepEqual(steps.map(step => step.primary.id), ['a', 'edge-ab', 'b']);
  assert.deepEqual(steps[0]?.boundTexts.map(text => text.id), ['a-text']);
  assert.deepEqual(steps[2]?.boundTexts.map(text => text.id), ['b-text']);
});
