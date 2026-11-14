# Excalidraw+ (`excalidraw-depame`)

> **一句话简介**：Dopame OS 原生 AI 白板

## 参赛信息

- **项目名称**：Excalidraw+（`excalidraw-depame`）
- **一句话简介**：Dopame OS 原生 AI 白板
- **团队成员**：Andy17269（`<wenlei660185@gmail.com>`，如有其他成员请在提交前补充）
- **参赛赛道**：`[请填写参赛赛道]`
- **上游开源项目**：[`@excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw)（版本 `^0.18.1`，MIT License，保留原仓库协议）
- **开赛前已有内容及对应 Commit**：
  - 仓库初始提交 `0ca6f87`（`0ca6f87b0ab617a86aa2389ac6c2061f72de336c`，`2026-11-14`）：包含项目基础脚手架、上游 `@excalidraw/excalidraw`（`^0.18.1`）依赖配置、离线字体资源、基础测试与构建脚本。
  - 后续提交（`85efd80`、`db07c1f`、`669d12f` 及当前工作区）：完成了比赛期间的核心架构改造、原生交互重写、多模态 AI 引擎与 MCP 系统服务接入。

## 比赛期间新增的架构改造与系统能力接入

1. **存储层重构**
   - 彻底剥离浏览器 `IndexedDB` 与在线字体 CDN，通过 `scripts/build-fonts.mjs` 将 Excalifont / Xiaolai 等中英文字体本地离线托管至 `public/excalidraw-assets/fonts/`。
   - 接入 `acde:fs`（`src/services/excalidrawStorage.ts`），实现原生 `.excalidraw` 文件读写、800ms 防抖串行自动保存（`workspace/autosave.excalidraw`）、新建/打开前自动备份（`workspace/recovery-*.excalidraw`）及快照管理。
   - 接入 `acde:notifications` / 系统桌面通知（`src/services/notifications.ts`），在文件保存与 AI 生成完成时触发原生通知（平台不支持时安全降级跳过）。

2. **原生交互层重写**
   - 隐藏原版冗余菜单、协作、素材库、帮助与顶部工具条，重构 Apple 风格双悬浮胶囊 UI（左上磨砂文件/菜单胶囊 + 底部工具与 AI 生成悬浮岛）与参考 Apple 布局的启动欢迎页（`src/components/Welcome.tsx`）。
   - 自研 UI 草图快速模板库（`src/services/uiTemplates.ts`、`src/components/UiLibraryPanel.tsx`），覆盖多平台常用 UI 线框模板，支持缩略图预览与一键插入画布。
   - 针对 `acdert` 原生渲染器优化触摸板以光标为中心的缩放手势（`src/services/trackpad.ts`）、跨平台快捷键兼容（`src/services/undoShortcut.ts`）与无闪烁属性面板。

3. **多模态 AI 引擎**
   - **视口空间上下文切片**：支持将当前画布与视口上下文按需导出并切片传入 AI，结合平滑视口平移缩放与逐元素流式绘制（`src/services/canvasAnimator.ts`、`src/services/sceneMath.ts`），支持随时中断。
   - **语音指令（Push-to-Talk）局部修改**：按住麦克风或左 Fn 录制 16kHz 单声道 PCM16 WAV（最长 120 秒），调用 ASR 识别后直接对画布局部元素进行理解与修改（`src/useVoiceInput.ts`、`server/speech.ts`）。
   - **手绘草图生成高保真 App UI（Sketch-to-UI）**：支持识别手绘线框草图并调用内置 UI 资产库与视觉生成链路，自动生成结构化、可继续编辑的高保真 App UI 元素（`src/services/aiVision.ts`、`server/visionUi.ts`）。

## 第三方代码工具库

### 运行时依赖 (`dependencies`)
- `@excalidraw/excalidraw` (`^0.18.1`, MIT)：核心白板画布与元素引擎
- `@excalidraw/mermaid-to-excalidraw` (`^3.6.0`, MIT)：Mermaid 语法转 Excalidraw 可编辑元素
- `mermaid` (`^11.17.2`, MIT)：流程图与各类图表语法解析
- `@modelcontextprotocol/sdk` (`^1.32.2`, MIT)：MCP 协议 SDK，用于接入外部 MCP 工具与提供 `canvas-mcp.mjs` stdio 服务
- `heic-convert` (`^2.1.0`, ISC；底层解码器 `libheif-js` 为 LGPL-3.0)：本地 Node Worker 将拖入/粘贴的 HEIC/HEIF 图片转为 PNG
- `react` / `react-dom` (`^19.3.1`, MIT)：前端 UI 框架
- `zod` (`^4.6.7`, MIT)：接口与配置数据结构校验

### 开发与构建工具 (`devDependencies`)
- `@dopame/acde-api` (`0.0.9`)：Dopame OS 应用运行时与 `acde:fs` 等系统能力类型及加载接口
- `vite` (`^8.3.6`)、`@vitejs/plugin-react` (`^6.1.2`)、`rolldown` (`^1.2.19`)：前端与纯 JS 产物打包构建
- `typescript` (`~7.0.2`)、`oxlint` (`^1.90.0`)：静态类型检查与代码规范检查
- `pngjs` (`^6.0.0`)：图像处理与测试辅助

## AI 与系统服务配置

- **AI 配置**（`server/deepseek.ts`、`server/aiConfig.ts`）：优先读取环境变量 `DEEPSEEK_API_KEY`，支持在左上角菜单的 AI 设置面板中配置模型与 API 地址。
- **MCP 服务**（`server/mcpManager.ts`、`scripts/canvas-mcp.mjs`）：完整接入说明见 [MCP 使用文档](docs/MCP.md)。

## 开发、测试与纯 JS 打包验证

需要 Node.js 22.18+ 与匹配的 `acde` / `acdert`（当前验证版本 `0.0.9`）：

```sh
npm ci
npm run lint
npm test
npm run build
acde check
acde build
```

- 普通浏览器调试使用 `npm run dev`，Vite 同时转发本地 `/api` 后端。
- `acde build` 会将前端静态资源与纯 JS 后端（`.acde/backend/server.js`）打包至 `.acde/` 目录，可直接用于 Dopame OS 提交与运行。
- 原生回归测试脚本位于 `tests/native-*.mjs`（采用独立空白 profile，不会覆盖已有白板数据）。

## 开源许可说明

- `@excalidraw/excalidraw`：MIT License，[上游许可](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)。
- `@excalidraw/mermaid-to-excalidraw`：MIT License，[上游仓库](https://github.com/excalidraw/mermaid-to-excalidraw)。
- `heic-convert`：ISC License；其解码器 `libheif-js` 采用 LGPL-3.0，许可随包保留在 `public/licenses/`。
- 离线字体沿用 Excalidraw 自带字体文件及其上游许可，托管于 `public/excalidraw-assets/fonts/`。
