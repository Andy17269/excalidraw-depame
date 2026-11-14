import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';

export async function convertHeicToPng(buffer: Uint8Array): Promise<Uint8Array> {
  if (buffer.byteLength < 16 || buffer.byteLength > 32 * 1024 * 1024) throw new Error('图片无效');
  const brand = Buffer.from(buffer.subarray(8, 12)).toString('ascii');
  if (!['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) throw new Error('格式无效');
  const paths = [new URL('../web/heic-worker.cjs', import.meta.url), new URL('../../../desktop/heic-worker.cjs', import.meta.url), new URL('../public/heic-worker.cjs', import.meta.url)];
  const path = paths.find(candidate => existsSync(candidate));
  if (!path) throw new Error('转换器未安装');
  return new Promise((resolve, reject) => {
    const worker = new Worker(path, { workerData: buffer, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('转换超时')); }, 45000);
    const finish = () => { clearTimeout(timer); void worker.terminate(); };
    worker.once('message', (result: { png?: Uint8Array; error?: string }) => { finish(); if (result.png) resolve(result.png); else reject(new Error('转换失败')); });
    worker.once('error', () => { finish(); reject(new Error('转换失败')); });
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('转换失败')); });
  });
}
