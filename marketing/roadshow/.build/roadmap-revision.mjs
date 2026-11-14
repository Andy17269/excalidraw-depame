const ROOT='/Users/andywen/Developer/excalidraw-dopame';
const blue='#0866F5',ink='#10274B',muted='#61738C';
function box(s,name,x,y,w,h,fill,r=0){return s.shapes.add({name,geometry:r?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0},...(r?{borderRadius:r}:{})});}
function txt(s,name,str,x,y,w,h,size,color=ink,bold=false,alignment='left'){const q=box(s,name,x,y,w,h,'none');q.text=str;q.text.style={typeface:'PingFang SC',fontSize:size,color,bold,alignment,verticalAlignment:'middle',insets:0,wrap:'none',autoFit:'none'};return q;}
function header(s,tag,title,sub){s.background.fill='#FFFFFF';txt(s,'页眉',tag,64,38,1152,30,17,blue,true);txt(s,'标题',title,64,91,1152,76,47,ink,true);txt(s,'副标题',sub,66,178,1150,40,23,muted);}
export async function revisePorting({presentation:p}){
 if(p.slides.items.length!==6)throw new Error('Expected six slides before this revision');
 const s=p.slides.getItem(2);s.shapes.deleteAll();
 header(s,'PORTING / 底层移植','四处底层适配，完成原生移植','保留上游编辑引擎，围绕 acdert 重做系统连接与运行细节');
 const cards=[
  ['01','本地文件链路','IndexedDB 持久化改接 acde:fs 本地文件','800 ms 防抖、串行保存与恢复快照'],
  ['02','Canvas 与资源兼容','处理零透明度绘制、离屏图片加载问题','字体本地化，统一资源路径与编辑字体'],
  ['03','动画性能优化','按帧合并更新，属性签名过滤无关重绘','按耗时调节更新频率，结束后一次提交'],
  ['04','原生交互与交付','Cmd/Ctrl 桥接，光标锚定触摸板缩放','前后端纯 JS 打包，HEIC Worker 保留 CJS'],
 ];
 cards.forEach((a,i)=>{const x=64+(i%2)*588,y=252+Math.floor(i/2)*216,dark=i===2;box(s,'适配模块 '+a[1],x,y,564,195,dark?blue:'#EFF6FF',22);txt(s,'编号 '+a[0],a[0],x+25,y+19,48,40,25,dark?'#B6D9FF':blue,true);txt(s,'模块 '+a[1],a[1],x+84,y+17,451,47,29,dark?'#FFFFFF':ink,true);txt(s,'措施一 '+a[1],a[2],x+26,y+90,515,37,21,dark?'#FFFFFF':ink);txt(s,'措施二 '+a[1],a[3],x+26,y+137,515,36,21,dark?'#E3EFFF':muted);});
 s.speakerNotes.text=`建议用时：45 秒。\n移植工作集中在四个重点。首先，把持久化主动改为本地文件链路，接入 acde 文件系统，并补上串行保存和恢复。其次，针对原生渲染环境处理透明度、离屏图片和字体资源问题。第三是动画性能：按帧合并更新，只在属性变化时刷新面板，动画还会根据渲染耗时调节更新频率，结束后统一提交，减少无效重绘和历史记录。最后，桥接快捷键与触摸板交互，完成原生应用打包。\n\n依据：\nhttps://docs.dopame.ai/reference/web.md\nhttps://docs.dopame.ai/guide/backend.md\n${['src/App.tsx','src/services/canvasAnimator.ts','src/services/trackpad.ts','src/services/excalidrawStorage.ts','src/useCanvasDocument.ts','src/services/canvasCompat.ts','src/services/imageCompat.ts','scripts/build-fonts.mjs','src/services/undoShortcut.ts','scripts/build-heic.mjs'].map(f=>ROOT+'/'+f).join('\n')}\n文档明确 IndexedDB 已实现，故此处表述为本项目的文件管理选择，不声称系统不支持。动画优化来自项目实现，不声称官方承诺性能指标。`;
 return {slide:3,focusCount:4};
}
export async function addRoadmap({presentation:p}){
 if(p.slides.items.length!==6)throw new Error('Expected six slides before inserting roadmap');
 const {slide:s}=p.slides.insert({after:4});s.size={width:1280,height:720};
 header(s,'NEXT / 后续适配设想','下一步，接入 Dopame OS 系统能力','从能独立运行的白板，走向与系统模型、Agent 和应用协同');
 const items=[
  ['01','调用系统模型能力','接入系统提供的模型入口，统一使用模型配置与推理能力','计划接入'],
  ['02','与系统 Agent 互通','双向 MCP 已就绪：白板调用工具，Agent 读取与绘制画布','已有基础'],
  ['03','跨应用文件协作','围绕系统文件打开能力，扩展上下文传递与结果回流','继续拓展'],
  ['04','独立服务化交付','把开发会话桥接推进为可安装、可发现的白板服务','下一阶段'],
 ];
 items.forEach((a,i)=>{const y=250+i*105,dark=i===1;box(s,'规划 '+a[1],64,y,1152,91,dark?blue:'#EFF6FF',18);txt(s,'路线编号 '+a[0],a[0],86,y+22,52,42,26,dark?'#B6D9FF':blue,true);txt(s,'路线标题 '+a[1],a[1],151,y+12,850,37,26,dark?'#FFFFFF':ink,true);txt(s,'路线说明 '+a[1],a[2],152,y+51,900,29,19,dark?'#E0EDFF':muted);box(s,'状态底框 '+a[1],1082,y+18,112,32,dark?'#3D88F4':'#DEEAFB',15);txt(s,'路线状态 '+a[1],a[3],1082,y+18,112,32,16,dark?'#FFFFFF':blue,true,'center');});
 s.speakerNotes.text=`建议用时：50 秒。\n接下来，我希望进一步接入 Dopame OS 的系统能力。首先是调用系统模型，让用户沿用系统提供的模型配置。第二是和系统内 Agent 互通：我们已经准备了双向 MCP，白板能作为客户端调用外部工具，也能作为服务端提供读画布和画图能力，下一步是完成与系统 Agent 的对接。第三，围绕现有系统文件打开能力，扩展跨应用的上下文传递和结果回流。最后，把当前开发会话中的桥接推进为可安装、可发现的独立白板服务。\n\n状态边界：系统模型、系统 Agent 的实际集成以及独立服务化交付均为后续设想；双向 MCP 客户端和服务端已有代码基础，开发链路已验证。当前官方公开模块文档未列出可直接引用的统一模型 API，此处不虚构函数名或承诺已接入。\n\n依据：\nhttps://docs.dopame.ai/llms.txt\nhttps://docs.dopame.ai/guide/services.md\nhttps://docs.dopame.ai/guide/open.md\n${ROOT}/server/mcpManager.ts\n${ROOT}/scripts/canvas-mcp.mjs\n${ROOT}/src/services/excalidrawStorage.ts\n${ROOT}/docs/verification-2026-11-15.md`;
 const durations=[15,45,45,25,25,50,15];p.slides.items.forEach((sl,i)=>{sl.speakerNotes.text=sl.speakerNotes.text.replace(/建议用时：\d+ 秒/,`建议用时：${durations[i]} 秒`).replace(/总建议用时：\d+ 秒/,'总建议用时：220 秒');});
 return {slides:p.slides.items.length,roadmapSlide:6,totalSeconds:220};
}
