import { fileURLToPath } from 'node:url';
import { main } from '../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
await main(args.length ? args : [projectRoot]);
