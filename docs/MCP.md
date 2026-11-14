# 白板 MCP 与系统服务

白板提供两个工具：`draw_diagram` 将 Mermaid 追加到当前画布，`read_canvas` 读取当前画布的元素摘要。工具直接操作 Excalidraw，不调用 DeepSeek，不需要 AI Key。

## 连接方式

| 使用方 | 接入方式 | 入口 |
| --- | --- | --- |
| 支持 MCP 的外部 AI 客户端 | 本机 stdio MCP | `scripts/canvas-mcp.mjs` |
| 同一 Dopame 桌面中的应用或智能体 | 桌面 `canvas` 自定义服务 | `src/services/canvasService.ts` |

桌面服务是 Dopame 的服务接口，本身不是 MCP 传输端点。MCP 进程通过 `acde eval` 连接已运行的白板；两条路径最终调用同一个 `window.canvasBridge`。

## 外部 MCP 客户端配置

需要 Node.js 22.18+、已安装的项目依赖、匹配的 acde/acdert，以及打开的白板窗口。当前项目已安装这些依赖。

先在项目目录启动白板，并保持运行：

```powershell
Set-Location C:\Users\seven\Downloads\Archive
& .\.tools\acde\current\bin\acde.exe dev
```

macOS / Linux 或 CLI 已在 PATH 中时可使用 `acde dev`。

在支持 `mcpServers` 配置格式的客户端中加入：

```json
{
  "mcpServers": {
    "dopame-canvas": {
      "command": "node",
      "args": ["C:/Users/seven/Downloads/Archive/scripts/canvas-mcp.mjs"]
    }
  }
}
```

将脚本路径换成实际项目位置；客户端找不到 Node 时，将 `command` 换成 Node 可执行文件的绝对路径。MCP 客户端负责启动该进程，无需另开 `npm run mcp`。直接运行 `npm run mcp` 会等待 stdio 协议输入，不会弹出界面。

服务会以脚本所在项目为工作目录，优先使用项目内 `.tools/acde/current/bin/acde`（Windows 为 `acde.exe`），其次使用 PATH 中的 `acde`。

### 多会话与自定义路径

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `ACDE_BIN` | 项目内 CLI，其次 PATH | acde 可执行文件绝对路径 |
| `ACDE_SESSION` | CLI 按项目选择 | 正在运行的 `acde dev` 进程 PID |
| `ACDE_CANVAS_WEB` | `excalidraw-depame` | 目标 Web 页面名称 |

同时运行多个开发会话时，在客户端配置的 `env` 中明确指定目标：

```json
{
  "mcpServers": {
    "dopame-canvas": {
      "command": "node",
      "args": ["C:/Users/seven/Downloads/Archive/scripts/canvas-mcp.mjs"],
      "env": {
        "ACDE_SESSION": "替换为当前 acde dev 的 PID",
        "ACDE_CANVAS_WEB": "excalidraw-depame"
      }
    }
  }
}
```

`ACDE_SESSION` 是开发进程的 PID，不是白板窗口 ID。重启开发进程后需要更新。可以在相同项目目录执行 `acde webs` 查看页面；指定会话时使用 `acde webs --session PID`，将 `PID` 换成实际数字。存在多个同名页面时，将 `ACDE_CANVAS_WEB` 设为 `webs` 输出中对应的精确页面名称。

## 工具协议

### `draw_diagram`

参数：

```json
{
  "mermaid_code": "flowchart LR\nA[输入] --> B[校验]\nB --> C[完成]"
}
```

`mermaid_code` 必填，长度 1–50,000 个字符。以 `flowchart`、`graph`、`mindmap`、`sequenceDiagram`、`classDiagram`、`stateDiagram`、`stateDiagram-v2` 或 `erDiagram` 开头。会清理首尾 Markdown 代码围栏，但推荐直接传入 Mermaid。

成功返回 MCP 文本内容，例如：

```json
{
  "content": [{ "type": "text", "text": "{\"count\":5}" }]
}
```

`count` 是本次新增的 Excalidraw 元素数量，包含形状、文字和连线，不等于 Mermaid 节点数量。

- 图表追加在现有内容右侧；空白画布从原点开始。不会清空旧图。
- 视图自动定位到新增图表，可使用画布撤销操作撤销本次追加。
- 流程图转换为可编辑元素；思维导图读取层级后转换为可编辑树状流程图。其他类型的可编辑程度取决于上游转换器，不承诺所有 Mermaid 特性均支持。
- 并发绘图串行处理。请求处理中若切换文档或窗口，旧请求不会继续写入新画布。
- 完成后沿用现有自动保存逻辑；MCP 不会代替用户选择文件路径或执行“另存为”。

失败返回 `isError: true`，文本为“绘图失败，请检查画布连接与 Mermaid 语法”。

### `read_canvas`

参数为空对象：

```json
{}
```

成功返回一个文本内容块，其中 `text` 是 JSON 数组字符串。例如解析后的内容：

```json
[
  { "id": "shape-id", "type": "rectangle", "x": 0, "y": 0, "width": 180, "height": 80 },
  { "id": "text-id", "type": "text", "x": 60, "y": 28, "width": 60, "height": 24, "text": "输入" }
]
```

只包含未删除元素。坐标和尺寸是画布坐标，不是屏幕像素。文本元素额外包含 `text`；当前摘要不包含图片二进制、颜色、绑定关系、完整场景状态或历史记录。空画布返回 `[]`，未连接时返回 `isError: true` 与“画布未连接”。

### 给智能体的调用示例

```text
先调用 read_canvas 读取当前白板。
再调用 draw_diagram，追加一个“输入 → 校验 → 完成”的流程图。
完成后再次调用 read_canvas，确认三个节点已经存在。
```

## Dopame 桌面服务

SDK 没有应用端 `registerService` 接口。本项目使用 SDK 声明的 `ServiceFactory`，在 `desktop/acde.config.jsonc` 中配置服务模块。签名依据 `node_modules/@dopame/acde-api/src/types/service.d.ts` 和 `src/runtime/load.d.ts`；官方规范见 [Service API](https://docs.dopame.ai/zh/reference/service/)。

运行提供该服务的桌面：

```powershell
& .\.tools\acde\current\bin\acde.exe dev desktop
```

现有配置的关键部分：

```json
{
  "services": {
    "canvas": {
      "module": "../src/services/canvasService.ts",
      "modules": ["windows"]
    }
  },
  "apps": [{ "id": "excalidraw-depame", "services": ["canvas"] }]
}
```

这是配置片段，完整配置以项目文件为准。消费该服务的其他应用也需要声明 `services: ["canvas"]`，并运行在同一个提供该服务的桌面中。独立运行根目录的应用不会自动拥有这个桌面服务。

调用示例（项目内 TypeScript）：

```ts
import { load } from '@dopame/acde-api';
import type { CanvasService } from './src/services/systemCanvas';

const canvas = await load('canvas') as CanvasService | null;
if (!canvas) throw new Error('画布服务不可用');
const windows = await canvas.windows();
if (windows.length !== 1) throw new Error('请指定目标画布窗口');
const windowId = windows[0];
const result = await canvas.draw_diagram('flowchart LR\nA[输入]-->B[完成]', windowId);
const elements = JSON.parse(await canvas.read_canvas(windowId));
```

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `windows()` | `Promise<string[]>` | 已就绪白板的窗口 ID |
| `draw_diagram(mermaid_code, windowId?)` | `Promise<{ count: number }>` | 向指定窗口追加图表 |
| `read_canvas(windowId?)` | `Promise<string>` | 读取 JSON 数组字符串 |

只有一个注册窗口时可以省略窗口 ID；零个或多个窗口时应先调用 `windows()`，选择目标后传入 ID。这里的窗口 ID 不同于 MCP 配置的 `ACDE_SESSION` PID。

画布完成本地恢复后即连接服务，欢迎页显示期间也可读写。内部 `register / unregister / respond` 属于窗口桥接实现，智能体无需调用。显式应答令牌用于区分窗口实例和请求；旧页面卸载不会注销新实例。窗口关闭会清理注册并拒绝未完成请求，服务等待上限为 60 秒。

## 边界与排查

MCP 仅使用本机 stdio 与 CLI，不提供 HTTP/SSE 监听端口，也不自动对外发布服务。连接客户端拥有读取画布文本和追加内容的能力，部署时按客户端权限管理该连接。窗口令牌用于防止过期应答，不是网络认证机制。

| 现象 | 检查 |
| --- | --- |
| 客户端找不到服务 | Node 路径、脚本绝对路径、项目依赖是否已安装 |
| “画布未连接” | 白板是否打开并完成恢复，`acde webs` 是否存在目标页面 |
| 连接到错误画布 | 明确设置 `ACDE_SESSION` 与 `ACDE_CANVAS_WEB` |
| “绘图失败” | 先调用 `read_canvas` 检查连接，再用两节点 `flowchart LR` 检查 Mermaid |
| 桌面提示“请指定画布窗口” | 调用 `windows()`，传入实际窗口 ID |
| 操作超时 | 检查窗口是否关闭、图表是否过大；先读取画布确认是否已追加，再决定重试 |

绘图没有去重键。超时后盲目重试可能重复追加，请先核对画布。MCP 子进程的 CLI 调用同样有 60 秒超时，标准输出仅供 MCP 协议使用。

## 验证与代码位置

```sh
node tests/native-regression.mjs
node tests/native-desktop.mjs
node tests/native-welcome.mjs
```

第一项使用真实 MCP SDK 客户端列出工具并执行读写，第二项验证桌面服务应答与关闭重开，第三项覆盖欢迎页显示期间的桥接和启动恢复。均使用隔离测试数据；完整原生回归的 HEIC 样例配置见 [README](../README.md)。

- MCP 协议入口：`scripts/canvas-mcp.mjs`
- 元素转换与摘要：`src/services/canvasBridge.ts`、`src/services/sceneMath.ts`
- 窗口端连接：`src/services/systemCanvas.ts`
- 桌面端服务：`src/services/canvasService.ts`
- 桌面注册配置：`desktop/acde.config.jsonc`
