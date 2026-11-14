import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../src/services/audio.ts';

test('voice recording produces mono PCM16 WAV accepted by DeepSeek ASR', () => {
  const wave = new DataView(encodeWav([new Float32Array([-2, -.5, 0, .5, 2])], 16000));
  assert.equal(wave.getUint32(24, true), 16000);
  assert.equal(wave.getUint16(22, true), 1);
  assert.equal(wave.getUint16(34, true), 16);
  assert.equal(wave.getInt16(44, true), -32768);
  assert.equal(wave.getInt16(52, true), 32767);
});

test('voice recording downsamples 48kHz audio to 16kHz', () => {
  const wave = new DataView(encodeWav([new Float32Array(48000).fill(.25)], 48000));
  assert.equal(wave.byteLength, 44 + 16000 * 2);
  assert.equal(wave.getInt16(44, true), 8192);
});
