import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveShowcase, showcaseMetadata } from '../src/services/showcaseCatalog.ts';

const frame = { id: 'frame', type: 'rectangle', x: 150, y: 80, width: 390, height: 844, customData: showcaseMetadata('travel', 'one', 'frame', 'frame') };
const part = { id: 'part', type: 'text', x: 174, y: 190, width: 80, height: 20, text: '旅行', customData: showcaseMetadata('travel', 'one', 'part', 'part') };

test('only a full marked example resolves; ordinary keywords and partial selections stay on the model path', () => {
  const ordinary = { ...frame, customData: undefined, text: '音乐 music 旅行 电商' };
  assert.equal(resolveShowcase([ordinary], [ordinary]), null);
  assert.equal(resolveShowcase([part], [frame, part]), null);
  assert.equal(resolveShowcase([{ ...frame, isDeleted: true }], [frame, part]), null);
});

test('resolves a moved instance and replaces only its own elements, preserving overlapping annotations and other copies', () => {
  const other = { ...frame, id: 'other', customData: showcaseMetadata('travel', 'two', 'frame', 'other') };
  const note = { id: 'note', type: 'text', x: 180, y: 220, text: '保留', width: 40, height: 20 };
  const result = resolveShowcase([frame], [frame, part, other, note]);
  assert.equal(result?.id, 'travel');
  assert.deepEqual(result?.bounds, { x: 150, y: 80, width: 390, height: 844 });
  assert.deepEqual([...result!.elementIds].sort(), ['frame', 'part']);
});

test('multiple example frames require selecting one instead of overwriting the combined scene', () => {
  const other = { ...frame, id: 'other', customData: showcaseMetadata('commerce', 'two', 'frame', 'other') };
  assert.throws(() => resolveShowcase([frame, other], [frame, part, other]), /选择一个/);
});

test('unknown metadata and completed results do not trigger fixed generation', () => {
  const unknown = { ...frame, customData: { showcase: { id: 'unknown', instance: 'one', role: 'frame' } } };
  assert.equal(resolveShowcase([unknown], [unknown]), null);
  const complete = { ...frame, customData: { showcase: { id: 'travel', instance: 'one', role: 'result' } } };
  assert.equal(resolveShowcase([complete], [complete]), null);
});

test('duplicating a tagged frame cannot delete the other copy during generation', () => {
  const copy = { ...frame, id: 'copy', x: 800 };
  assert.throws(() => resolveShowcase([frame], [frame, part, copy]), /重新插入/);
});

test('rotated sketches explain how to recover rather than silently producing an unrotated result', () => {
  const rotated = { ...frame, angle: Math.PI / 2 };
  assert.throws(() => resolveShowcase([rotated], [rotated, part]), /旋转回正/);
});

test('copied child components are preserved when generating their original example', () => {
  const copy = { ...part, id: 'copied-part', x: 900 };
  const result = resolveShowcase([frame], [frame, part, copy]);
  assert.deepEqual([...result!.elementIds].sort(), ['frame', 'part']);
});
