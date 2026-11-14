# Antigravity 开发交接

更新时间：2026-11-14。先阅读本文件、`AGENTS.md`、`README.md`、`DESIGN.md` 和 `docs/MCP.md`，再继续修改。

## 项目与当前状态

这是 Dopame OS 上的 Excalidraw 桌面白板，使用 React + TypeScript + Vite，独立应用和自定义 Dopame 桌面两种入口。工作目录来自源代码导出包，没有 Git 历史；不是只包含编译结果的安装包。

本次已完成：

- 隐藏 Excalidraw 菜单、顶部工具栏、素材库、协作和帮助入口。
- 文件胶囊、七工具悬浮岛、AI 输入、文字字号 / 简单图形尺寸控件及统一毛玻璃右键菜单。
- 修复原生运行时拖拽后画面崩坏、透明度 0 渲染错误、脱离 DOM 的图片加载问题；本地手写字体与文字编辑器字体一致。
- 原生文件读写、800ms 自动保存、切换前恢复备份、文档切换时旧 AI 请求失效。
- DeepSeek 直接调用、上下文编辑、可编辑 Mermaid、思维导图转换、HEIC 转 PNG。
- MCP stdio 两个工具和 Dopame `canvas` 自定义服务，详见 `docs/MCP.md`。
- 每次启动显示 Apple 风格欢迎页：三枚用户 SVG 对应 AI / 绘制 / MCP；底部左侧新建 / 打开，右侧 Continue；无隐私区。Continue 保留画布，取消打开留在欢迎页。
- 欢迎页、文件胶囊、工具岛、属性和右键菜单轻动效，支持减少动态效果。

参考截图在 `docs/previews/welcome-reference.jpg`，当前原生实测截图在 `docs/previews/welcome.png` 与 `welcome-narrow.png`。

## 新电脑启动

建议安装 Node.js 24 LTS；本次使用 Node.js 24.22.1、npm 11.19.0、acde/acdert 0.0.9。首先在解压后的项目根目录执行：

```sh
npm ci
npm test
npm run lint
npm run build
```

包内已包含本地字体、许可文件及生成的 HEIC worker。`npm run build` 会重新生成字体 CSS 与 worker。请保留 `package-lock.json`，先复现再升级依赖。

普通浏览器预览：

```sh
npm run dev
```

Vite 会接入本地 `/api` 后端；原生文件私有目录、系统服务等仍需 acdert 实测。

### 安装匹配的 Dopame 工具

安装方式依据 acde 0.0.9 随附官方安装说明。可先让开发工具阅读 [官方安装指南](https://calbin-1318886512.cos.ap-beijing.myqcloud.com/pkgs/acde/install.md)。

macOS / Linux：

```sh
curl -fsSL https://calbin-1318886512.cos.ap-beijing.myqcloud.com/pkgs/acde/install.sh | sh -s -- --version 0.0.9
```

Windows PowerShell：

```powershell
& ([scriptblock]::Create((irm https://calbin-1318886512.cos.ap-beijing.myqcloud.com/pkgs/acde/install.ps1))) -Version 0.0.9
```

安装后打开新终端，在项目目录执行：

```sh
acde doctor
acde check
acde dev
```

运行带 `canvas` 服务的桌面：`acde dev desktop`。构建分别使用 `acde build`、`acde build desktop`。

项目脚本会优先查找本地 `.tools` 中的 CLI，否则使用 PATH；本导出包不携带旧电脑的 Windows 可执行文件。也可以通过 `ACDE_BIN` 指定当前平台 CLI。README / MCP 文档中的原电脑绝对路径只是示例，须换成解压后的路径。

## API 配置

DeepSeek 配置位于 `server/deepseek.ts` 的 `DEEPSEEK_API_KEY`。沿用用户指定的后端本地配置，环境变量优先；不要把密钥放进前端代码、日志或交接回复。

acde 后端隔离环境不会自动继承终端任意环境变量。该项目已有本地配置常量，若需要更换账号，在后端配置位修改即可。独立 MCP 绘图和读取不需要 DeepSeek Key。

- 文本图表：`/v1/chat/completions`，`deepseek-flash`，关闭思考。
- 上下文：Messages API，必要时 Files API；显式参考样式请求才启用联网工具。
- ASR：`/v1/tools/asr`，Bearer + multipart `file`，无 `model` 字段；16kHz PCM16 WAV。

不要根据旧任务文本将模型改回 `deepseek-chat` 或编造语音参数。修改 API 前先读官方文档与现有实现。

## 关键文件

| 位置 | 职责 |
| --- | --- |
| `src/App.tsx` | 画布、工具岛、AI 与欢迎页状态 |
| `src/components/Welcome.tsx` | 启动页、焦点管理、三个 SVG |
| `src/App.css`、`DESIGN.md` | 视觉与动效规范 |
| `src/useCanvasDocument.ts` | 文件生命周期、恢复和自动保存 |
| `src/components/Properties.tsx` | 属性、字号、尺寸控件 |
| `src/services/canvasCompat.ts` | acdert Canvas 透明度兼容 |
| `src/services/imageCompat.ts` | acdert 图片加载兼容 |
| `src/services/canvasBridge.ts` | Mermaid 转换、追加、画布摘要 |
| `src/services/canvasPlan.ts`、`canvasPlanLayout.ts` | AI 修改计划和绑定文字布局 |
| `server.ts`、`server/` | DeepSeek / ASR / HEIC 本地后端 |
| `scripts/canvas-mcp.mjs` | MCP stdio 入口 |
| `src/services/systemCanvas.ts`、`canvasService.ts` | 窗口端连接与桌面端服务 |
| `desktop/` | Dopame 桌面配置和入口 |

## 不要回退的修复

1. acdert 在 Canvas `globalAlpha = 0` 时会发生渲染层泄漏。兼容层让逻辑透明度仍为 0，跳过不可见绘制；不要简单改成 `.01` 导致不可见内容露出。
2. 原生运行时 `new Image()` 的 data/blob 图片需要短暂连接 DOM 才能加载。`imageCompat` 同时修复导入器与 Excalidraw 图片缓存。
3. 透明度滑块每帧预览使用 `CaptureUpdateAction.IMMEDIATELY`；改成 `EVENTUALLY` 曾导致撤销删除整个图形。
4. 不要让普通拖拽每帧重绘整套 React 工具栏。保留 App 中的编辑器属性签名判断。
5. 不要恢复 Excalidraw 默认属性面板或全局强制字体；画布文字与应用 UI 字体应分别处理。
6. Mermaid 原生 mindmap 回退为 SVG 在 acdert 中可能空白，目前先解析层级再生成可编辑节点。
7. 系统服务的回调不能依赖 RPC 的回调返回值，必须保留请求 ID + 显式 respond 应答及关闭清理。
8. HEIC 解码 worker 必须保留独立 CJS 输出，避免 libheif 在 ESM 中找不到 `__dirname`。
9. acde 独立应用和 desktop 的资源前缀不同；保留 `main.tsx` 与 `desktop/canvas.html` 的字体资源路径处理。
10. 不在用户真实画布上执行 New / reset 做测试。使用提供的隔离原生回归脚本；测试输出不要放进正在被根目录开发进程重建的 `.acde` 目录。

## 验证

本轮 Windows 实测通过 17 项单元测试、类型检查、lint、Vite 构建、acde 两种配置及发布构建。原生测试覆盖欢迎页、真实 MCP、服务关闭重开、文件恢复、HEIC、拖拽、缩放、字号和右键菜单。

建议按顺序运行，避免多个原生测试同时争用会话发现逻辑：

```sh
node tests/native-welcome.mjs
node tests/native-resize.mjs
node tests/native-regression.mjs
node tests/native-desktop.mjs
node tests/native-canvas-plan.mjs
```

`CANVAS_TEST_OUTPUT` 可指定隔离输出目录。完整回归默认使用包内 `tests/fixtures/example.heic`；可用 `HEIC_TEST_FILE` 替换。

`node tests/native-ai-live.mjs` 会实际请求 DeepSeek，并消耗 API 用量；使用独立合成画布，验证登录流程、已有图追加、系统架构和思维导图。上一次实际调用已通过。

尚未在 Mac 实体设备验证 Fn、麦克风授权、通知与双指触摸板手感；软件手势路径已验证。联网参考、图片理解与 ASR 的协议已验证，但未用用户真实录音做外部端到端测试。模型仍可能在追加时重复部分内容；未把这一点描述为已解决。

## 导出内容

压缩包包含源码、配置、锁文件、静态资源、图标、许可、文档、预览和测试源码 / 公开 HEIC 样例。不包含 `node_modules`、`.tools`、`.acde`、`dist`、测试运行目录、用户画布或 Git 历史。`EXPORT-MANIFEST.json` 列出文件数量、尺寸与 SHA-256，压缩包旁的 `.sha256` 可核对传输完整性。

后续先复现当前实现，再根据新需求继续；不要把交接说明当成额外重构任务。
