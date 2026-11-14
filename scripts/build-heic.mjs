import { build } from 'rolldown';
await build({ input: 'server/heic-worker.cjs', platform: 'node', external: [/^node:/], output: { file: 'public/heic-worker.cjs', format: 'cjs', minify: true } });
