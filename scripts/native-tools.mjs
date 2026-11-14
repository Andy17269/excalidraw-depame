import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { acdeBinary } from './acde-driver.mjs';
const client = new Client({ name: 'native-regression', version: '1.0.0' });
const transport = new StdioClientTransport({ command: acdeBinary, args: ['mcp'], cwd: process.cwd() });
try {
  await client.connect(transport);
  if (process.argv[2] === 'list') {
    const { tools } = await client.listTools();
    console.log(JSON.stringify(tools.map(({ name, inputSchema }) => ({ name, inputSchema })), null, 2));
  } else {
    console.log(JSON.stringify(await client.callTool({ name: process.argv[2], arguments: JSON.parse(process.argv[3] || '{}') }), null, 2));
  }
} finally { await client.close(); }
