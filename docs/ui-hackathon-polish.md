# Excalidraw+ 黑客松 UI/UX 视觉升级与精修待办（Codex Handoff）

> 当前状态：已完成基础毛玻璃质感、文件弹窗截断修复、空画布「灵感胶囊」、启动页 Slogan 与极光背景、`.tool-picker` 间距微调。
> 本文档列出**剩余待办任务**，供 Codex 接着完成，以进一步提升明天黑客松路演的视觉完成度。

---

## 1. 项目上下文与核心文件

- **项目路径**：`/Users/andywen/Developer/excalidraw-depame`
- **设计规范**：[DESIGN.md](../DESIGN.md)、[AGENTS.md](../AGENTS.md)
- **核心文件**：
  - [src/App.css](../src/App.css)（含 `[data-theme="dark"]` 暗色主题样式）
  - [src/App.tsx](../src/App.tsx)
  - [src/components/Startup.tsx](../src/components/Startup.tsx)
  - [src/components/MenuPanel.tsx](../src/components/MenuPanel.tsx)、[src/components/McpSection.tsx](../src/components/McpSection.tsx)、[src/components/SystemSection.tsx](../src/components/SystemSection.tsx)
  - [src/services/visionDemo.ts](../src/services/visionDemo.ts)（`insertDemoSketch`）

---

## 2. 必须遵守的硬性约束（Engineering & Runtime Rules）

1. **禁止编造 `@dopame/acde-api` API**：涉及系统能力必须先查阅 `node_modules/@dopame/acde-api/*.d.ts`（见 [AGENTS.md](../AGENTS.md)）。
2. **`acdert` 渲染兼容约束**（见 [DESIGN.md](../DESIGN.md)）：
   - 避免零透明度层（动画起始用 `opacity: .01`）和百分比 `transform`（居中用 flex 布局，不用 `translateX(-50%)`）。
   - 隐藏面板必须同时设置 `aria-hidden` 与 `inert`。
   - 遵循 `prefers-reduced-motion`。
   - 保留现有 `aria-label`、`role`、`data-testid` 及按钮 `disabled` 逻辑，避免破坏自动化测试。
3. **深色模式同步**：所有新增或修改的样式必须同步适配 `[data-theme="dark"]`。
4. **验收命令**：每次改动后运行并确保通过：
   ```bash
   npm run lint && npm test && npm run build && npm run acde:check
   ```

---

## 3. 已完成项（Codex 无需重复修改）

- [x] **文件信息弹窗修复**：[src/App.css](../src/App.css) `.file-info-popover` 已放宽至 `320px`、`.file-info-value` 放宽至 `200px`；[src/App.tsx](../src/App.tsx)「保存状态」已改为 `.file-status-pill` 胶囊标签。
- [x] **真毛玻璃与主按钮渐变**：[src/App.css](../src/App.css) `.glass` 与 `[data-theme="dark"] .glass` 已加上 `backdrop-filter: blur(20px) saturate(160%)`；`.generate-button.has-prompt` 与 `.startup-action-btn.is-primary` 已升级电光蓝渐变。
- [x] **空画布「灵感胶囊」**：[src/App.tsx](../src/App.tsx) 已新增 `QUICK_PROMPTS` 与 `.quick-prompts`，画布为空时浮现 4 个一键触发按钮，有元素后自动隐藏。
- [x] **启动页 Slogan 与极光晕染**：[src/components/Startup.tsx](../src/components/Startup.tsx) 已补充 `.startup-tagline`；[src/App.css](../src/App.css) `.welcome-screen` 已叠加浅/深色双色径向渐变光晕。
- [x] **`.tool-picker` 间距微调**：[src/App.css](../src/App.css) 已对称调整 `.tool-picker` 与 `.tool-picker-rail` 内边距。

---

## 4. 剩余待办清单（给 Codex 执行）

### TODO-1（P1）：启动页右侧无历史文件时展示「精选演示模板」
- **目标文件**：[src/components/Startup.tsx](../src/components/Startup.tsx)、[src/App.tsx](../src/App.tsx)、[src/App.css](../src/App.css)
- **现状痛点**：全新演示环境下 `recentFiles.length === 0`，启动页右侧 50% 区域为空白「暂无历史文件」占位，首屏略显空洞。
- **要求**：
  1. 在 `Startup` 的 `recentFiles.length === 0` 分支中，保留简洁提示的同时，在下方/主体区域展示 **3 个可点击的「精选演示模板」卡片**（如：`电商微服务架构图`、`Agent 协作流程图`、`手绘 App UI 草图`）。
  2. 通过 `StartupProps` 新增回调（如 `onStartPreset?: (presetId: string) => void`），点击模板卡片后先以空白画布关闭启动页（`setWelcome('leaving')`），并在画布就绪后自动触发对应的 `generate(...)` 或 `insertDemoSketch(api)`。
  3. 同步适配 `[data-theme="dark"]` 与窄屏响应式布局，不能影响原有 `Tab` 焦点循环与 `Escape` 关闭行为。

### TODO-2（P1）：放大 AI 生成过程的「剧场感」与 Dock 状态反馈
- **目标文件**：[src/App.tsx](../src/App.tsx)、[src/App.css](../src/App.css)
- **现状痛点**：演示时 AI 生成图表的 3~8 秒等待期，Dock 边框流光偏微弱，缺少更清晰的进度/阶段氛围。
- **要求**：
  1. 检查 `.dock-shell.is-generating` 下的 `.dock-glow`、`.dock-glow-ring` 动画与阴影，在浅色与深色模式下适度提升辨识度（保持优雅克制，不刺眼、不遮挡画布）。
  2. 优化 `.ai-tool-toast.is-pending` 的排版与呼吸状态点动画，让「正在规划布局 / 正在绘制…」等状态提示在演示大屏上更醒目。
  3. 当画布为空且 `UI草图`（`.vision-button`）处于 disabled 时，确保 hover/title 文案清晰引导用户（例如：`请先在画布绘制或点击下方「插入手绘 UI 草图」`）。

### TODO-3（P2）：重构设置弹窗（`MenuPanel`）为分段 Tab 结构并修复布局对齐
- **目标文件**：[src/components/MenuPanel.tsx](../src/components/MenuPanel.tsx)、[src/components/McpSection.tsx](../src/components/McpSection.tsx)、[src/App.css](../src/App.css)
- **现状痛点**：当前设置弹窗是单列长滚动表单；`AI 设置` 底部的 `恢复默认` 孤立在左侧；`MCP 管理` 在无外部服务时存在多层灰色框嵌套。
- **要求**：
  1. 在 `MenuPanel` 顶部增加分段 Tab 切换（`通用` / `AI 引擎` / `MCP 服务`，可复用现有的 `SpringRail` 组件或轻量分段控件），减少弹窗滚动高度与视觉拥挤感。
  2. 修复 `AI 设置` 底部操作行对齐问题，让 `恢复默认`、`测试连接`、`保存` 整齐排列在同一操作栏中。
  3. 优化 `MCP 管理` 推荐一键接入（`+ Filesystem` / `+ Memory`）与空状态展示，去掉冗余的多层嵌套边框。
  4. 确保不破坏 `MenuPanel` 原有的表单校验、异步加载、重置确认 `<dialog>` 与无障碍属性。

---

## 5. 最终验收检查

- [x] 浅色模式与深色模式（`data-theme="dark"`）下检查启动页、空白画布、生成中状态、设置弹窗 3 个 Tab；完成 390px 窄窗口检查与焦点滚动验证。
- [x] 运行 `npm run lint && npm test && npm run build && npm run acde:check` 全部通过（80 项单元测试）。

## 6. 执行记录（2026-11-15）

- TODO-1：已接入三个演示模板。复用新建/备份及未保存确认，启动页退出后触发一次生成；本地草图无需 AI 请求，离线时仍可用。补齐深色标题、窄窗口标题换行与焦点滚动。
- TODO-2：已增强 Dock 光晕与流光边框，补齐普通生成的规划/绘制阶段，增加双行状态和呼吸点；空画布草图按钮带操作引导。生成提示居中已移除百分比 transform。
- TODO-3：设置改为「通用 / AI 引擎 / MCP 服务」Tab，支持方向键及 Home/End；隐藏面板同时使用 hidden、aria-hidden、inert，切换保留草稿。AI 三个操作按钮同栏右对齐，MCP 空状态去掉多层灰框。
- 原生回归额外发现确认框默认位置在视口外且被启动页覆盖，已为原生 `<dialog>` 添加显式居中和层级。
- 新增 `tests/native-ui-polish.mjs`：隔离 profile、模拟 AI 响应，验证模板单次触发、空白画布时序、未保存取消/继续、Tab 草稿保留、浅深色/窄窗口、减少动效与 Escape。截图位于 `.debug/ui-polish/`。该测试验证交互和渲染，不验证真实 AI 服务的输出质量。
- 最终原生回归 `node tests/native-ui-polish.mjs` 通过，运行时错误为零。构建保留原有大分包及动态/静态导入并存提示，不影响构建成功。
- 通用设计静态审计另有 4 项原有 MCP textarea resize 提示和 1 项滚动条误报（全局标准属性已定义于 `src/index.css`）；本次保留既有文本编辑和全局滚动条行为。
