import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const run = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(project, '.tools/acde/current/bin', process.platform === 'win32' ? 'acde.exe' : 'acde');
const binary = process.env.ACDE_BIN || (existsSync(local) ? local : 'acde');
const web = process.env.ACDE_CANVAS_WEB || 'excalidraw-depame';

async function invoke(expression) {
  const args = ['eval', web, expression];
  if (process.env.ACDE_SESSION) args.push('--session', process.env.ACDE_SESSION);
  const { stdout } = await run(binary, args, { cwd: project, timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const result = JSON.parse(stdout.trim());
  return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
}

const server = new McpServer({ name: 'dopame-canvas', version: '1.0.0' });
server.registerTool('draw_diagram', { description: 'Append an editable Mermaid diagram to the open whiteboard.', inputSchema: { mermaid_code: z.string().min(1).max(50000) } }, async ({ mermaid_code }) => {
  try { return await invoke(`(async()=>{if(!window.canvasBridge)throw new Error('Canvas unavailable');return await window.canvasBridge.draw_diagram(${JSON.stringify(mermaid_code)})})()`); }
  catch { return { isError: true, content: [{ type: 'text', text: '绘图失败，请检查画布连接与 Mermaid 语法' }] }; }
});
server.registerTool('read_canvas', { description: 'Read nondeleted whiteboard elements and text.', inputSchema: {} }, async () => {
  try { return await invoke("window.canvasBridge.read_canvas()"); }
  catch { return { isError: true, content: [{ type: 'text', text: '画布未连接' }] }; }
});
await server.connect(new StdioServerTransport());
