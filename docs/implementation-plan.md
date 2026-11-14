# Excalidraw Dopame 改造计划

执行依据：用户 TODO、附带故障交接记录和当前 SDK/官方文档。当前目录是解压项目，无 Git 仓库，直接原地完成，不创建分支或提交。

- [x] 核实 SDK 通知、窗口、服务、后端与文件 API，安装依赖并建立可运行基线。
- [x] 替换 Excalidraw 原生 UI 与危险属性面板，保留元素编辑与透明度 0，排查拖动渲染；添加焦点缩放及原生 pinch 处理。
- [x] 抽离 `canvasBridge.ts`，通过 DeepSeek Flash 非思考模式生成 Mermaid，验证后追加到当前白板，保留原有内容和图片。
- [x] 采用官方后端与可选桌面服务桥接，提供真正的 MCP stdio tools `draw_diagram`、`read_canvas`，支持请求超时、页面断开和多窗口隔离。
- [x] 修正自动保存竞态与异步资源释放，复用原生文件选择器，成功保存/绘图调用已核实的系统通知。
- [x] 运行回归、类型检查、lint、Vite/acde 构建和原生界面检查，更新 README，明确无法在 Windows 验证的 MacBook 硬件行为。

重点验证：连续拖动和透明度 0/100、缩放锚点、生成失败不丢画布、旧保存请求不得覆盖新场景、MCP 只针对活跃会话操作。

架构选择：保留 Excalidraw 画布和公开 imperative API，自定义浮层；不修改依赖产物。桌面服务按官方 ServiceFactory 导出，独立应用不强依赖桌面服务，MCP stdio 通过 Node 调用 acde 的本机页面桥接。

追加范围已完成：HEIC 本地转 PNG、DeepSeek 官方 ASR、已有画布上下文与联网参考路径；语音和绘图结果受文档 revision 保护。实机与协议验证边界见 verification.md。
