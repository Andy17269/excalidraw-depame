# Settings UI Implementation Plan

**Goal:** 按用户选定的原生桌面方向整理设置页，使用稳定双栏、整齐设置行和克制的视觉层级。

**Architecture:** `MenuPanel` 继续拥有分类与设置状态，`SystemSection` 和 `McpSection` 保留原业务操作。样式由 `App.css` 拥有，复用 `theme.css` 的现有主题 token。仅调整设置界面，不增加系统 API 或修改保存语义。

**Tech Stack:** React、TypeScript、CSS、acdert 原生运行时。

**Spec:** 用户在本次对话选择「原生桌面设置，克制清晰」；设计约定同步到 `DESIGN.md`。

## Global Constraints

- 保留通用、AI 引擎、MCP 服务及已有操作。
- 桌面使用左侧分类，窄窗口使用顶部分类；面板尺寸不随分类内容跳变。
- 保留中文标签、浅色/深色主题、键盘导航、关闭与草稿状态。
- 不触碰未关联的系统能力、权限或存储逻辑。

## Review Focus

- 390px 窄窗口和矮窗口：设置项、长文本与操作按钮不超出界面。
- 分类切换：保持面板位置与尺寸，非活动内容保持隐藏和 inert。
- 深色主题：内容、表单边框和按钮可辨认。
- MCP 添加/导入：长表单在内容区滚动，返回和保存可达。
- 关闭与键盘：支持分类方向键、Escape 和已有焦点恢复。

## Tasks

- [ ] 在 `tests/native-settings-ui.mjs` 建立固定窗口与分类导航回归，先运行确认旧布局未满足。
- [ ] 调整 `src/components/MenuPanel.tsx` 和 `src/App.css`，建立双栏及设置分组。
- [ ] 整理 `src/components/SystemSection.tsx` 和 MCP 空状态的层级，保留操作。
- [ ] 原生截图复核三个分类、浅色/深色、窄屏及 MCP 表单，运行已有交互回归、lint、类型检查与构建。
