# Excalidraw+ · 想法，自然成形。

48 秒中文产品宣传片，1920×1080，60 fps。HTML/CSS/GSAP 可编辑源文件，HyperFrames 0.9.46。无旁白。主成片在 `../marketing/excalidraw-plus/`。

## 继续编辑

修改 `index.html` 中的文本、CSS 与时间线。颜色和创意约定见 `DESIGN.md`。视频所有左下角注释与右下角编号均已删除。

```sh
npx --yes hyperframes@0.9.46 preview --background
npx --yes hyperframes@0.9.46 check
npx --yes hyperframes@0.9.46 render --fps 60 --quality high --output final.mp4
```

依赖 Node.js 22+、FFmpeg 与 Chrome。GSAP 3.15.0 已作为本地资源保留，避免 CDN 可用性影响重渲染。字体使用本机 PingFang SC；成片已经栅格化，无需观看者安装字体。在非 macOS 环境重渲染时，请自行配置已许可的中文字体，修改 @font-face。

`subtitles.srt` 为可选外置字幕；主要文字已在视频画面中呈现。

## 质量记录

已通过 HyperFrames 完整 check：静态检查无错误、运行无错误、布局无错误、对比度无警告、craft 无警告、音频无错误。两条静态提示已审阅：重复使用品牌图标属预期；本地中文字体适用于此次 macOS 导出，跨机器重渲染需配置字体。转场叠化期间的短暂文字重叠为预期。

已人工检查各场景关键帧，并用独立 GSAP 时间线审计检查场景可见性与资源完整性。旧版技能内 animation-map 脚本需要未随当前 CLI 分发的 @hyperframes/producer，因此使用本目录 `audit-motion.mjs` 进行替代审计，结果保留在 `motion-audit.json`。

未发布到外部平台，未提交 Git，未修改产品代码。

## 动态空间版
新增 `depth.css` 与 `depth.js`：确定性 CSS 3D 玻璃画布、分层板片、旋转轨道、漂浮画笔和微粒；镜头采用景深叠化与两处空间推进。真实 UI 整体轻微透视旋转，文字保持清晰。48 秒 1080p / 60fps；保留 168px 主图标、句号悬挂居中与无角落注释。
