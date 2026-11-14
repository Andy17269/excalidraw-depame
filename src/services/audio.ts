export function encodeWav(chunks: Float32Array[], sourceRate: number): ArrayBuffer {
  const source = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
  const targetRate = 16000;
  const samples = Math.floor(source.length * targetRate / sourceRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const data = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) data.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, targetRate, true); data.setUint32(28, targetRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  text(36, 'data'); data.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const start = Math.floor(i * sourceRate / targetRate);
    const end = Math.max(start + 1, Math.floor((i + 1) * sourceRate / targetRate));
    let value = 0;
    for (let j = start; j < Math.min(end, source.length); j++) value += source[j]!;
    value = Math.max(-1, Math.min(1, value / Math.min(end - start, source.length - start)));
    data.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}
