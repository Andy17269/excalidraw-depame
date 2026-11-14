# 白板 MCP 接入

当前版本支持两个方向：外部 MCP 客户端通过本机 stdio 读写白板，以及白板内的 AI 调用用户配置的外部 MCP 工具。

## 外部客户端操作白板

需要 Node.js 22.18+、项目依赖、acde 0.0.11 和运行中的源码开发会话：

```sh
npm ci
acde dev
```

在支持 `mcpServers` 配置的客户端加入下面的配置，将路径替换为本机源码路径：

```json
{
  "mcpServers": {
    "dopame-canvas": {
      "command": "node",
      "args": ["/absolute/path/excalidraw-dopame/scripts/canvas-mcp.mjs"]
    }
  }
}
```

客户端负责启动 stdio 进程，通常无需另开 `npm run mcp`。独立执行该脚本会等待 MCP 协议输入。

桥接脚本调用本机 `acde eval`，将请求转给页面的 `window.canvasBridge`。菜单「设置 → MCP 服务 → 允许外部 MCP 调用画布」可以关闭或开启此入口。绘图工具直接转换 Mermaid，不消耗 AI API 用量。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `ACDE_BIN` | 项目内 CLI 或 PATH 中的 `acde` | 指定 CLI 可执行文件 |
| `ACDE_SESSION` | 按当前项目选择 | 多开发会话时指定目标 acde dev PID |
| `ACDE_CANVAS_WEB` | `excalidraw-depame` | 指定目标页面名称 |

执行 `acde webs` 查看页面；指定会话可使用 `acde webs --session PID`。会话 PID 与页面窗口 ID 不同，重启开发进程后需要更新显式设置的 PID。

### `read_canvas`

输入为空对象。返回一个 MCP 文本内容块，其中的 `text` 是 JSON 数组字符串，例如：

```json
[
  {"id":"shape-id","type":"rectangle","x":0,"y":0,"width":180,"height":80},
  {"id":"text-id","type":"text","x":30,"y":25,"width":80,"height":25,"text":"输入"}
]
```

仅包含未删除元素及其类型、坐标、尺寸和文本。不提供图片二进制、完整样式、绑定关系或撤销历史。空画布返回 `[]`；未连接时返回 `isError: true`。

### `draw_diagram`

```json
{"mermaid_code":"flowchart LR\nA[输入] --> B[完成]"}
```

`mermaid_code` 长度为 1–50,000 字符。支持由现有转换器处理的 flowchart/graph、mindmap、sequenceDiagram、classDiagram、stateDiagram、stateDiagram-v2 和 erDiagram；不同图表类型的可编辑程度取决于转换器。

- 在现有内容旁追加，不清空旧白板。
- 流程图和思维导图生成可编辑节点与连线，完成后沿用自动保存。
- 并发绘图串行处理；切换文档后旧任务不会写入新场景。
- 一次撤销可以移除本次图表。
- 成功结果中的 `count` 是新增元素数量，包括形状、文字和连线。

单次 CLI 调用有 60 秒超时，没有请求去重键。发生超时应先调用 `read_canvas` 核对结果，再决定是否重试。

## 白板调用外部 MCP 工具

进入「菜单 → 设置 → MCP 服务」可添加 stdio、HTTP 或 SSE 服务，填写命令参数或 URL、环境变量、请求头与工作目录。支持连接测试、工具发现、逐工具开关、JSON 配置导入、工具调试和删除。

示例 stdio 工具：

```text
命令：node
参数：scripts/filesystem-mcp.mjs .
```

```text
命令：node
参数：scripts/memory-mcp.mjs
```

以上相对脚本用于源码目录。显式填写工作目录时，相对参数以该工作目录为准。Memory 可用 `MEMORY_FILE_PATH` 指定测试或项目自己的持久化文件。

开启的工具可以参与 AI 生成链路；白板外部 stdio 绘图和白板内部调用第三方 MCP 是两种不同的连接。

## 发布与验证边界

当前 acde 应用配置的 `services` 为空，没有注册桌面 `canvas` 自定义服务。旧交接文档中的 `desktop/`、`canvasService.ts` 和 `systemCanvas.ts` 不属于当前版本。

迁移后的纯应用安装包已验证可启动、绘图、加载离线字体、转换 HEIC 和保存文件。安装包不携带源码开发用 stdio 脚本及其 Node 依赖；外部 `dopame-canvas` 连接仍需保留源码目录和 acde dev 会话。本机客户端配置应指向实际存在的源码脚本，不能使用安装包数据目录中不存在的脚本路径。

```sh
npm run test:native -- --filter='regression|mcp-paths|native-settings[.]mjs|packaged'
```

这些测试使用隔离会话，覆盖真实 MCP stdio 读写、Filesystem/Memory 连接、工具调试与开关、配置持久化，以及迁移后的发布包。具体结果和不支持的模拟项目见 [2026-11-15 验证报告](verification-2026-11-15.md)。
