import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { main } from '../node_modules/@modelcontextprotocol/server-memory/dist/index.js';

if (!process.env.MEMORY_FILE_PATH?.trim()) {
  const defaultPath = process.env.ACDE_APP_DATA?.trim()
    ? join(process.env.ACDE_APP_DATA.trim(), 'memory.jsonl')
    : join(homedir(), '.excalidraw-depame', 'memory.jsonl');
  mkdirSync(dirname(defaultPath), { recursive: true });
  process.env.MEMORY_FILE_PATH = defaultPath;
}

await main();
