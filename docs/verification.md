# 验证记录

日期：2026-11-14。环境：Windows、acde/acdert 0.0.9、Node.js 24.22.1。

## 原生回归

所有自动化均使用独立空白配置和私有数据目录，不重置用户现有画布。

补充回归 `node tests/native-resize.mjs`：角点缩放、宽度输入、字号预设/数字输入、字号撤销，以及毛玻璃右键菜单的删除操作通过；菜单素材库入口隐藏，运行时无错误。

- 中文与英文文字输入、本地 Excalifont / Xiaolai 字体实际加载。
- 透明度 0 ↔ 100 连续拖动 20 次，撤销后保留图形。
- 元素往返拖动 30 次，零透明度无渲染层泄漏。
- Ctrl+wheel 与原生 gesture 双路径缩放，保持光标锚点。
- 官方 HEIC 样例本地转 PNG，缩放后导入尺寸适配视口，图片可拖动。
- AI 表单经本地模拟响应追加可编辑 Mermaid，原有图形与图片保留。
- 真实 MCP stdio 客户端完成 read_canvas、draw_diagram。
- 原生保存、PNG 内嵌持久化、重新加载、打开与干净撤销历史。
- 480px 窄窗口布局、最终帧缓冲截图与零运行时控制台错误。
- 桌面服务注册、显式绘图应答、读取当前画布、桌面 HEIC 和字体路径；关闭重开后仅保留当前窗口注册。
- 长中文标题换行、容器扩容、居中、普通连线端点调整与撤销；Mermaid 追加与文字修改共存，不支持的路由修改在写入前拒绝。

17 项单元测试、TypeScript、lint、Vite 构建、acde 应用与桌面配置检查、两种 acde 发布构建全部通过。构建保留上游大分块和 use client 指令警告，无构建错误。

## 欢迎页与动效

`node tests/native-welcome.mjs` 在隔离的 acdert 进程中通过：

- 用户提供的三个 SVG 实际显示；底部新建 / 打开居左、Continue 居右，无隐私区。
- 初始焦点、Tab / Shift+Tab 循环、Escape 继续；欢迎页下方画布隐藏且 inert。
- Continue 保留画布；欢迎页显示期间 MCP 绘图仍可用。
- 每次重新加载显示欢迎页；关闭整个测试进程再启动也显示，并恢复保存内容。
- 取消原生打开对话框后保留欢迎页和原场景；新建成功退出，旧图已留存恢复备份；打开文件成功后进入该文件。
- 390px 窄窗口、800×460 矮窗口操作可达；减少动态效果时动画关闭。
- 原生控制台无错误。截图位于 `.debug/welcome/`。

加入动效后重新通过 `native-regression.mjs`、`native-desktop.mjs` 和 `native-resize.mjs`，覆盖连续拖拽、透明度、缩放、HEIC、保存、真实 MCP、服务生命周期、文字尺寸与右键菜单。静态 UI 严格审计无发现，报告位于 `.debug/premium-audit.json`。

本轮独立应用和桌面发布包分别位于 artifacts 的 `verified/welcome-release-app` 与 `verified/welcome-release-desktop`；未修改用户现有画布数据。

`designmd lint DESIGN.md` 返回 0 errors；另有 10 条设计 token 元数据提示，不影响运行时 CSS。设计规范、预览和交接说明一并纳入项目导出包。

## API 与平台边界

DeepSeek 基础图表和已有画布追加均已通过真实按钮调用验证：登录流程、追加退出节点、系统架构、学习计划思维导图返回 200 并上屏。测试使用独立合成画布，未发送用户真实画布。入口回归为 `node tests/native-ai-live.mjs`，会实际调用 DeepSeek。

修复：非空画布不再让所有新图请求进入上下文编辑；模型返回形状 ID 的文字修改会解析到其绑定文字；追加请求缺少新增图表时会请求模型纠正一次；TLS 连接异常最多尝试三次，接口鉴权错误不重试。思维导图通过 Mermaid 官方解析器读取层级，转成可编辑节点，避免 SVG 回退导致原生空白。新增测试后共 17 项单元测试通过，最终实测截图已确认导图可见。

联网参考、文件输入和 ASR 请求协议使用官方文档与模拟请求验证；未把用户的真实录音用于外部接口测试。

ASR 使用 `POST /v1/tools/asr`，Bearer 鉴权，multipart 仅包含 file；录音编码为 16kHz 单声道 PCM16 WAV，最多 120 秒。切换文档会使旧转写结果失效。

Windows 当前运行模式缺少可选 microphone 能力，按钮正确禁用。MacBook 实体 Fn 事件、麦克风授权、系统通知与触摸板手感尚未在 Mac 实机复验。已验证软件事件路径，未将其描述为 Mac 硬件验证。

## 可复现命令

```sh
npm test
npm run lint
npm run build
acde check
acde check desktop
node tests/native-regression.mjs
node tests/native-desktop.mjs
node tests/native-canvas-plan.mjs
node tests/native-welcome.mjs
node tests/native-resize.mjs
```

HEIC 样例与运行方式见 README。截图保存在 CANVAS_TEST_OUTPUT 指定目录；本轮使用独立 artifacts 目录。
