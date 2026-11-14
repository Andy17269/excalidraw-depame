import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

/** Opt-in live tests use only synthetic scenes and an explicitly local credential. */
export async function configureLiveAi(app) {
  const local = await readFile('.env.local', 'utf8').then(parseEnv).catch(() => ({}));
  const apiKey = process.env.DEEPSEEK_API_KEY || local.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Live AI test needs DEEPSEEK_API_KEY or ignored .env.local');
  const config = { apiKey, ...(process.env.DEEPSEEK_BASE_URL || local.DEEPSEEK_BASE_URL ? { baseUrl: process.env.DEEPSEEK_BASE_URL || local.DEEPSEEK_BASE_URL } : {}), ...(process.env.DEEPSEEK_MODEL || local.DEEPSEEK_MODEL ? { model: process.env.DEEPSEEK_MODEL || local.DEEPSEEK_MODEL } : {}) };
  const result = await app.evaluate(`fetch('/api/settings/ai', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(config)})}).then(r=>({ok:r.ok}))`);
  if (!result.ok) throw new Error('Unable to configure isolated live-test provider');
}
