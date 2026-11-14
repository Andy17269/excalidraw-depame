const ROOT='/Users/andywen/Developer/excalidraw-dopame';
const blue='#0866F5',ink='#10274B',muted='#61738C';
function box(s,name,x,y,w,h,fill,r=0){return s.shapes.add({name,geometry:r?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0},...(r?{borderRadius:r}:{})});}
function txt(s,name,str,x,y,w,h,size,color=ink,bold=false){const q=box(s,name,x,y,w,h,'none');q.text=str;q.text.style={typeface:'PingFang SC',fontSize:size,color,bold,alignment:'left',verticalAlignment:'middle',insets:0,wrap:'none',autoFit:'none'};return q;}
export async function revise({presentation:p}){
 if(p.slides.items.length!==8)throw new Error('Expected original eight-slide deck; inspect before retrying');
 const s=p.slides.getItem(2);s.shapes.deleteAll();s.background.fill='#FFFFFF';
 txt(s,'技术页眉','PORTING / 底层移植',64,38,1000,30,17,blue,true);
 txt(s,'技术标题','移植的核心：补齐六处底层差异',64,91,1152,76,47,ink,true);
 txt(s,'工作边界','沿用 Excalidraw 编辑引擎，新增运行时兼容层与系统桥接',66,178,1150,40,23,muted);
 const cards=[
  ['01','存储替换','原先：浏览器 IndexedDB','改造：acde:fs + 本地文件，串行自动保存'],
  ['02','Canvas 渲染兼容','问题：零透明度泄漏、曲线渲染尖刺','修复：跳过不可见绘制，细分近水平曲线'],
  ['03','图片加载兼容','问题：离屏 data/blob 图片无法加载','修复：临时挂接 DOM，加载完成后移除'],
  ['04','字体与资源本地化','原先：在线字体与默认资源路径','改造：离线字体、资源寻址与编辑字体同步'],
  ['05','输入事件桥接','问题：平台标识与快捷键、缩放行为不一致','适配：Cmd/Ctrl 桥接，光标锚定与帧合并'],
  ['06','原生运行与打包','目标：交付可由 acdert 运行的应用包','改造：前后端纯 JS，HEIC Worker 独立 CJS'],
 ];
 cards.forEach((a,i)=>{const x=64+(i%2)*588,y=249+Math.floor(i/2)*143;box(s,'适配模块 '+a[1],x,y,564,126,'#EFF6FF',18);txt(s,'编号 '+a[0],a[0],x+22,y+14,43,35,24,blue,true);txt(s,'模块 '+a[1],a[1],x+79,y+12,460,39,26,ink,true);txt(s,'原始问题 '+a[1],a[2],x+23,y+57,520,27,18,muted);txt(s,'底层方案 '+a[1],a[3],x+23,y+89,520,27,18,ink,true);});
 s.speakerNotes.text=`建议用时：60 秒。\n移植真正需要处理的是这六处底层差异。第一，把 IndexedDB 持久化改为 acde 文件系统，用串行自动保存避免写入竞争。第二，原生 Canvas 遇到零透明度会泄漏渲染层，近水平曲线会出现尖刺，因此在兼容层分别跳过不可见绘制、细分曲线。第三，离屏的 data 和 blob 图片不加载，就临时挂到 DOM，完成后再移除。第四，把字体打包到本地，统一资源路径与编辑字体。第五，桥接平台标识造成的 Cmd 和 Ctrl 差异，并重做光标锚定缩放和帧合并。最后，前后端打包成纯 JS，HEIC 解码 Worker 单独保留 CJS。这里保留的是上游编辑引擎，我新增的是使它能在 Dopame 环境工作的一层适配。\n\n源码依据：\n${['src/main.tsx','src/services/excalidrawStorage.ts','src/useCanvasDocument.ts','src/services/canvasCompat.ts','src/services/imageCompat.ts','scripts/build-fonts.mjs','src/services/fonts.ts','src/services/trackpad.ts','src/services/undoShortcut.ts','scripts/build-heic.mjs','acde.config.jsonc','vite.config.ts'].map(f=>ROOT+'/'+f).join('\n')}`;
 const old4=p.slides.getItem(3),old5=p.slides.getItem(4);p.delete([old4.id,old5.id]);
 const ai=p.slides.getItem(3),mcp=p.slides.getItem(4),end=p.slides.getItem(5);
 ai.shapes.getItem('label 03 / AI 能力').text='能力扩展 / AI';
 mcp.shapes.getItem('label 04 / MCP 协作').text='能力扩展 / MCP';
 ai.speakerNotes.text=ai.speakerNotes.text.replace('建议用时：30 秒','建议用时：35 秒');
 mcp.speakerNotes.text=mcp.speakerNotes.text.replace('建议用时：30 秒','建议用时：35 秒');
 end.speakerNotes.text=end.speakerNotes.text.replace('建议用时：10 秒','建议用时：20 秒').replace('总建议用时：220 秒','总建议用时：210 秒');
 return {slides:p.slides.items.length,technicalSlide:3,totalSeconds:210};
}
