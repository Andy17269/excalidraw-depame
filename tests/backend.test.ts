import { test } from 'node:test';
import assert from 'node:assert/strict';
import backend from '../server.ts';

test('generation rejects blank prompts before contacting DeepSeek', async () => {
  const response = await backend.fetch(new Request('http://localhost/api/generate', { method: 'POST', body: JSON.stringify({ prompt: ' ' }) }));
  assert.equal(response.status, 400);
});

test('image conversion rejects corrupt and oversized files', async () => {
  const invalid = await backend.fetch(new Request('http://localhost/api/images/convert', { method: 'POST', body: new Uint8Array(64) }));
  assert.equal(invalid.status, 422);
  const oversized = await backend.fetch(new Request('http://localhost/api/images/convert', { method: 'POST', headers: { 'content-length': '40000000' }, body: '' }));
  assert.equal(oversized.status, 413);
});
