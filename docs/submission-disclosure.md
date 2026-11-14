# Excalidraw+ 参赛披露说明

项目名称：Excalidraw+。

一句话简介：支持语音改图与草图生成界面的AI白板（18 字）。

代码仓库：https://github.com/Andy17269/excalidraw-depame 。公开交付分支为 `codex/verified-native-20261115`，也是核查时的默认分支。

## 第三方代码

应用开源清单以 `src/components/AboutModal.tsx` 为基础，依赖的准确安装版本以 `package-lock.json` 为准；间接依赖也记录在该锁文件中。

| 代码或工具 | 来源 | 用途 |
| --- | --- | --- |
| `@excalidraw/excalidraw` 0.18.1（MIT） | https://github.com/excalidraw/excalidraw | 底层画板、元素编辑、撤销重做与导入导出；项目自定义 UI 为另行开发 |
| `@excalidraw/mermaid-to-excalidraw`（MIT） | https://github.com/excalidraw/mermaid-to-excalidraw | Mermaid 图表转换为可编辑画板元素 |
| `mermaid`（MIT） | https://github.com/mermaid-js/mermaid | 图表语法解析 |
| `react`、`react-dom`（MIT） | https://github.com/facebook/react | 应用界面和交互 |
| `@modelcontextprotocol/sdk`（MIT） | https://github.com/modelcontextprotocol/typescript-sdk | MCP 客户端与白板服务通信 |
| `@modelcontextprotocol/server-filesystem`、`server-memory` | https://github.com/modelcontextprotocol/servers | MCP 文件系统、记忆服务接入测试 |
| `zod`（MIT） | https://github.com/colinhacks/zod | 数据结构与参数校验 |
| `heic-convert`（ISC）、底层 `libheif-js`（LGPL-3.0） | https://github.com/catdad-experiments/heic-convert 、https://github.com/catdad-experiments/libheif-js | HEIC/HEIF 图片解码及 PNG 转换；相关许可保存在 `public/licenses/` |
| `@dopame/acde-api` 0.0.11、acde/acdert | https://docs.dopame.ai/ | Dopame 应用运行、系统能力适配与原生验证 |
| Vite、`@vitejs/plugin-react`、Rolldown | https://github.com/vitejs/vite 、https://github.com/vitejs/vite-plugin-react 、https://github.com/rolldown/rolldown | 开发服务及产物打包 |
| TypeScript、`@types/node`、`@types/react`、`@types/react-dom` | https://github.com/microsoft/TypeScript 、https://github.com/DefinitelyTyped/DefinitelyTyped | 类型检查、编译与类型声明 |
| Oxlint | https://github.com/oxc-project/oxc | 代码检查 |
| Playwright | https://github.com/microsoft/playwright | 浏览器回归验证 |
| `pngjs` | https://github.com/pngjs/pngjs | PNG 处理与图像验证 |
| HyperFrames 0.9.46、GSAP 3.15.0 | https://www.npmjs.com/package/hyperframes 、https://gsap.com/ | 宣传片 HTML 动画、时间线及视频渲染；GSAP 依照其 Standard License 使用 |
| Node.js、Google Chrome、FFmpeg | https://nodejs.org/ 、https://www.google.com/chrome/ 、https://ffmpeg.org/ | 本地后端、调试测试与宣传片导出工具 |

## 模型与 AI 工具

- **DeepSeek API**（https://api.deepseek.com）：应用默认模型标识为 `deepseek-flash`，用于自然语言生成图表、画布上下文理解、局部修改和草图转 UI；语音识别调用同一配置服务的 `/v1/tools/asr` 接口。ASR 底层模型未在代码中指定，不另行推测。接口和模型可由用户配置，实际使用的配置应以当次设置为准。
- **OpenAI Codex**（https://openai.com/codex/）：辅助代码开发、调试、测试、文档与提交整理。
- **OpenAI 内置 `image_gen` 工具**（https://openai.com/）：生成 UI 展示素材；购物、科技两组共 20 张素材的提示词保存在 `docs/ui-assets/prompts.json`。工具未在项目内记录底层模型版本，不另行推测。

## 数据、字体与视觉素材

- 未接入外部训练数据集，也未自行训练模型。回归测试使用项目生成的合成画板与合成音频。
- 本地图片使用 Unsplash 摄影作品：Valentin Lacoste 的海岸照片、Howard Walsh 的 Copper Coast 照片。原始作品链接与 Unsplash License 见 `public/showcase-assets/README.md`。
- 本地字体来自 Excalidraw 随包字体资源，包括 Excalifont、Xiaolai 等，沿用相应上游许可；宣传片使用本机 PingFang SC。
- 欢迎页的 AI、绘制、MCP SVG 与布局参考图由作者提供，使用记录见 `DESIGN.md` 与 `HANDOFF.md`。

## 开赛前已有内容及对应 commit

按作者确认，赛前复用的基础是开源 Excalidraw 底层画板引擎；本项目自定义 UI、Dopame OS 适配、AI、语音与 MCP 接入均在开赛后完成。无赛前已有的自研内容，无本项目赛前自研 commit。

所用上游版本 `@excalidraw/excalidraw@0.18.1` 的 `v0.18.1` 标签对应 commit：`a2ec2889babf7d2295469c6d90ebe77fae57df84`，来源 https://github.com/excalidraw/excalidraw/commit/a2ec2889babf7d2295469c6d90ebe77fae57df84 。

公开分支的起始提交 `94e35ac51c86295437334a639d21db52a1fb16fa` 于北京时间 2026-11-15 02:24:17 汇总此前成果，并隔离旧历史中的嵌入式凭据；后续提交保留实际提交时间。该汇总不等于项目开始时间或赛前基线。旧开发提交仅在本地保留，未直接推送。
