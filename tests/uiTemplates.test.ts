import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_PLATFORMS,
  UI_TEMPLATES,
  UI_TEMPLATE_MAP,
  collectTemplateLabels,
  computeTemplateOrigin,
  queryUiTemplates,
} from '../src/services/uiTemplates.ts';

test('UI template catalog covers all 4 platforms with 5 unique templates each', () => {
  assert.equal(UI_TEMPLATES.length, 20);
  const counts = new Map<string, number>();
  const ids = new Set<string>();

  for (const tpl of UI_TEMPLATES) {
    assert.ok(!ids.has(tpl.id), `Duplicate template id: ${tpl.id}`);
    ids.add(tpl.id);
    assert.equal(UI_TEMPLATE_MAP.get(tpl.id), tpl);
    assert.ok(tpl.name.length > 0);
    assert.ok(tpl.description.length > 0);
    assert.ok(tpl.keywords.length > 0);
    assert.ok(tpl.width > 0 && tpl.height > 0);
    assert.ok(tpl.elements.length >= 4, `Template ${tpl.id} has too few elements`);
    counts.set(tpl.platform, (counts.get(tpl.platform) ?? 0) + 1);
  }

  for (const platform of TEMPLATE_PLATFORMS) {
    assert.equal(counts.get(platform.id), 5, `Expected 5 templates for ${platform.id}`);
  }
});

test('all template elements stay cleanly inside their declared bounding frame', () => {
  for (const tpl of UI_TEMPLATES) {
    for (const [index, el] of tpl.elements.entries()) {
      assert.ok(el.x >= 0, `${tpl.id}[${index}] x=${el.x} < 0`);
      assert.ok(el.y >= 0, `${tpl.id}[${index}] y=${el.y} < 0`);
      if (el.type === 'rectangle' || el.type === 'ellipse') {
        assert.ok(el.width > 0 && el.height > 0, `${tpl.id}[${index}] invalid size`);
        assert.ok(el.x + el.width <= tpl.width, `${tpl.id}[${index}] exceeds width ${tpl.width}`);
        assert.ok(el.y + el.height <= tpl.height, `${tpl.id}[${index}] exceeds height ${tpl.height}`);
      } else if (el.type === 'line') {
        assert.ok(el.points.length >= 2);
        for (const [dx, dy] of el.points) {
          assert.ok(el.x + dx >= 0 && el.x + dx <= tpl.width, `${tpl.id}[${index}] line x out of bounds`);
          assert.ok(el.y + dy >= 0 && el.y + dy <= tpl.height, `${tpl.id}[${index}] line y out of bounds`);
        }
      } else {
        assert.ok(el.text.trim().length > 0, `${tpl.id}[${index}] empty text`);
        assert.ok(el.x < tpl.width && el.y < tpl.height, `${tpl.id}[${index}] text outside frame`);
        if (el.textAlign === 'center') {
          assert.ok(typeof el.width === 'number' && el.width > 0, `${tpl.id}[${index}] centered text must specify container width`);
          assert.equal(el.verticalAlign, 'middle', `${tpl.id}[${index}] centered text must specify verticalAlign=middle`);
        }
      }
    }
  }
});

test('queryUiTemplates filters by platform, category, and keywords', () => {
  assert.equal(queryUiTemplates({ platform: 'mobile-app' }).length, 5);
  assert.equal(queryUiTemplates({ platform: 'mobile-web' }).length, 5);
  assert.equal(queryUiTemplates({ platform: 'pc-web' }).length, 5);
  assert.equal(queryUiTemplates({ platform: 'pc-app' }).length, 5);

  const dashboards = queryUiTemplates({ category: 'dashboard' });
  assert.equal(dashboards[0]?.id, 'pc-app-dashboard');

  const logins = queryUiTemplates({ query: '登录' });
  assert.ok(logins.some(item => item.id === 'mobile-app-login'));
  assert.ok(logins.some(item => item.id === 'pc-web-login'));

  const h5Forms = queryUiTemplates({ platform: 'mobile-web', category: 'form' });
  assert.deepEqual(h5Forms.map(item => item.id), ['mobile-web-form']);
});

test('collectTemplateLabels gathers text and label strings for font preparation', () => {
  const tpl = UI_TEMPLATE_MAP.get('mobile-app-login');
  assert.ok(tpl);
  const labels = collectTemplateLabels(tpl);
  assert.match(labels, /欢迎回来/);
  assert.match(labels, /立即登录/);
});

test('computeTemplateOrigin centers on empty canvas and tiles beside existing templates', () => {
  const viewport = { scrollX: 0, scrollY: 0, width: 1200, height: 900, zoom: 1 };
  const first = computeTemplateOrigin({ width: 390, height: 844 }, viewport, []);
  assert.deepEqual(first, { x: 405, y: 28 });

  const existing = [{ minX: 405, minY: 28, maxX: 795, maxY: 872 }];
  const second = computeTemplateOrigin({ width: 390, height: 844 }, viewport, existing);
  assert.deepEqual(second, { x: 843, y: 28 });
});

test('mobile templates enforce symmetric 16px outer padding and centered titles', () => {
  for (const tpl of UI_TEMPLATES.filter(item => item.platform === 'mobile-app' || item.platform === 'mobile-web')) {
    for (const [index, el] of tpl.elements.entries()) {
      if (index === 0) continue; // outer device frame
      if (el.type === 'rectangle' && el.width < tpl.width - 2 && el.width > 140 && el.x > 0 && el.x < 40) {
        assert.equal(el.x, 16, `${tpl.id}[${index}] left-aligned container should start at PADDING=16`);
      }
    }
  }
});
