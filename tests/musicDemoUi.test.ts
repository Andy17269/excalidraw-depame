import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMusicReplacedIds, hasMusicKeyword, pickDistinctRandom } from '../src/services/musicMatch.ts';

test('hasMusicKeyword detects 音乐, Music, and music across selected items, bound labels, and enclosed text', () => {
  const frame = { id: 'frame-1', type: 'rectangle', x: 0, y: 0, width: 390, height: 844 };
  const boundChinese = { id: 'txt-1', type: 'text', x: 40, y: 120, width: 100, height: 24, text: '音乐播放器', containerId: 'card-1' };
  const card = { id: 'card-1', type: 'rectangle', x: 20, y: 100, width: 200, height: 120 };
  const enclosedEnglish = { id: 'txt-2', type: 'text', x: 40, y: 260, width: 120, height: 28, text: 'New Music' };
  const lowerCase = { id: 'txt-3', type: 'text', x: 40, y: 300, width: 120, height: 28, text: 'my music app' };
  const unrelated = { id: 'txt-4', type: 'text', x: 500, y: 200, width: 80, height: 24, text: 'music outside' };

  assert.equal(hasMusicKeyword([card], [card, boundChinese], [20, 100, 220, 220]), true);
  assert.equal(hasMusicKeyword([frame], [frame, enclosedEnglish], [0, 0, 390, 844]), true);
  assert.equal(hasMusicKeyword([lowerCase], [lowerCase], [40, 300, 160, 328]), true);
  assert.equal(hasMusicKeyword([frame], [frame, unrelated], [0, 0, 390, 844]), false);
  assert.equal(hasMusicKeyword([frame], [frame], [0, 0, 390, 844], '做一个音乐页面'), true);
});

test('collectMusicReplacedIds captures bound text and enclosed wireframe items while sparing outside elements', () => {
  const frame = { id: 'frame-1', type: 'rectangle', x: 0, y: 0, width: 390, height: 844 };
  const innerText = { id: 'txt-inner', type: 'text', x: 24, y: 46, width: 80, height: 28, text: 'Home' };
  const boundText = { id: 'txt-bound', type: 'text', x: 600, y: 100, width: 60, height: 20, text: 'Label', containerId: 'frame-1' };
  const outside = { id: 'rect-out', type: 'rectangle', x: 500, y: 50, width: 120, height: 100 };

  const replaced = collectMusicReplacedIds([frame], [frame, innerText, boundText, outside], [0, 0, 390, 844]);
  assert.deepEqual([...replaced].sort(), ['frame-1', 'txt-bound', 'txt-inner']);
});

test('pickDistinctRandom returns the requested number of distinct items without mutating input', () => {
  const pool = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
  const picked = pickDistinctRandom(pool, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  for (const item of picked) {
    assert.ok(pool.includes(item));
  }
  assert.deepEqual(pool, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']);
});
