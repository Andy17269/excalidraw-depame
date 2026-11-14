import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

test('bundled MCP manager resolves relative scripts outside its data cwd and respects explicit cwd', async () => {
  const project = resolve(import.meta.dirname, '..');
  const buildRoot = await mkdtemp(join(project, '.mcp-path-test-'));
  const data = await mkdtemp(join(tmpdir(), 'mcp-path-data-'));
  const previousCwd = process.cwd();
  const previousSettings = process.env.EXCALIDRAW_MCP_SETTINGS_FILE;
  let manager: typeof import('../server/mcpManager.ts') | undefined;
  try {
    const output = join(buildRoot, 'profile', 'build', 'backend', 'server.mjs');
    const bundle = await rolldown({ input: join(project, 'server/mcpManager.ts'), platform: 'node' });
    try { await bundle.write({ file: output, format: 'esm' }); }
    finally { await bundle.close(); }
    process.chdir(data);
    process.env.EXCALIDRAW_MCP_SETTINGS_FILE = join(data, 'mcp-servers.json');
    manager = await import(pathToFileURL(output).href);
    assert.ok(manager);

    for (const [name, args, tool, toolArgs, expected] of [
      ['Filesystem', ['scripts/filesystem-mcp.mjs', '.'], 'read_text_file', { path: join(project, 'package.json') }, 'excalidraw-depame'],
      ['Memory', ['scripts/memory-mcp.mjs'], 'read_graph', {}, 'entities'],
    ] as const) {
      const snapshot = await manager.createMcpServer({
        id: name.toLowerCase(), name, command: 'node', args: [...args],
        env: { MEMORY_FILE_PATH: join(data, 'memory.jsonl') },
      });
      const server = snapshot.servers.find(item => item.name === name)!;
      assert.equal(server.status, 'connected', server.error);
      const result = await manager.callMcpServerTool(server.id, tool, toolArgs);
      assert.equal(result.ok, true, result.error || result.text);
      assert.ok(result.text.includes(expected), result.text);
    }
    const snapshot = await manager.getMcpSnapshot();
    assert.equal(snapshot.localServer.scriptPath, join(project, 'scripts/canvas-mcp.mjs'));

    // A configured working directory must still govern relative script arguments.
    const custom = join(data, 'custom');
    await mkdir(custom);
    await writeFile(join(custom, 'memory.mjs'), `import ${JSON.stringify(pathToFileURL(join(project, 'scripts/memory-mcp.mjs')).href)};\n`);
    const explicit = await manager.testMcpServerDraft({
      name: 'Custom cwd', command: 'node', args: ['memory.mjs'], cwd: custom,
      env: { MEMORY_FILE_PATH: join(data, 'custom-memory.jsonl') },
    });
    assert.equal(explicit.ok, true, explicit.error);
    assert.ok(explicit.tools?.some(tool => tool.name === 'read_graph'));
  } finally {
    await manager?.disconnectAllMcpServers();
    process.chdir(previousCwd);
    if (previousSettings === undefined) delete process.env.EXCALIDRAW_MCP_SETTINGS_FILE;
    else process.env.EXCALIDRAW_MCP_SETTINGS_FILE = previousSettings;
    await Promise.all([rm(buildRoot, { recursive: true, force: true }), rm(data, { recursive: true, force: true })]);
  }
});
