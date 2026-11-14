import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const local = resolve('.tools/acde/current/bin', process.platform === 'win32' ? 'acde.exe' : 'acde');
export const acdeBinary = process.env.ACDE_BIN || (existsSync(local) ? local : 'acde');
const skill = execFileSync(acdeBinary, ['skills', 'path'], { encoding: 'utf8', windowsHide: true }).trim();
export const { Acde } = await import(pathToFileURL(resolve(skill, '../../dist/driver/index.js')).href);
