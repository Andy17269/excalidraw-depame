const ROOT='/Users/andywen/Developer/excalidraw-dopame';
const C={blue:'#0866F5',ink:'#10274B',muted:'#61738C',pale:'#EFF6FF',line:'#D8E6F7',white:'#FFFFFF',cyan:'#64C9F5'};
function shape(s,name,x,y,w,h,fill=C.white,stroke='none',r=0){return s.shapes.add({name,geometry:r?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1,style:'solid'},...(r?{borderRadius:r}:{})});}
function text(s,name,str,x,y,w,h,size=28,color=C.ink,bold=false,align='left'){let q=shape(s,name,x,y,w,h,'none');q.text=str;q.text.style={typeface:'PingFang SC',fontSize:size,color,bold,alignment:align,verticalAlignment:'middle',insets:0,wrap:'none',autoFit:'none'};return q;}
function ellipse(s,name,x,y,w,h,fill,stroke='none'){return s.shapes.add({name,geometry:'ellipse',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1,style:'solid'}});}
function poly(s,name,pts,fill,stroke='none',width=1){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);let x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x||1,h=Math.max(...ys)-y||1;return s.shapes.add({name,geometry:'custom',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width,style:'solid'},customPaths:[{width:w,height:h,commands:[{moveTo:{x:pts[0][0]-x,y:pts[0][1]-y}},...pts.slice(1).map(p=>({lineTo:{x:p[0]-x,y:p[1]-y}})),...(fill!=='none'?[{close:{}}]:[])]}]});}
function line(s,name,x1,y1,x2,y2,color=C.line,width=2){return poly(s,name,[[x1,y1],[x2,y2]],'none',color,width);}
function arrow(s,name,x,y,w=45,color=C.blue){line(s,name+'shaft',x,y,x+w,y,color,2.5);poly(s,name+'head',[[x+w-8,y-6],[x+w,y],[x+w-8,y+6]],'none',color,2.5);}
function label(s,str,x,y,w=200,color=C.blue){text(s,'label '+str,str,x,y,w,30,17,color,true);}
function head(s,kicker,title,sub){s.background.fill=C.white;label(s,kicker,64,40,850);text(s,'标题',title,64,96,1160,80,49,C.ink,true);if(sub)text(s,'引导',sub,66,184,1150,40,23,C.muted);}
function note(s,seconds,script,sources){s.speakerNotes.text=`建议用时：${seconds} 秒。\n${script}\n\n事实来源（备查，不在台上朗读）：\n${sources.map(x=>ROOT+'/'+x).join('\n')}`;}
function icon(s,x,y,size=84){s.images.add({path:ROOT+'/public/icon.png',alt:'Excalidraw+ 应用图标',position:{left:x,top:y,width:size,height:size},fit:'contain'});}
function newSlide(p){return p.slides.add({width:1280,height:720});}
function board(s,x,y,k=1){
  const p=(u,v)=>[x+(u+v*.37)*k,y+(v-u*.12)*k];
  const slab=(dy,fill,stroke)=>poly(s,'浮空画布层',[[0,dy],[390,dy],[390,dy+285],[0,dy+285]].map(([u,v])=>p(u,v)),fill,stroke,1.5);
  slab(64,'#C6DDFF','#AFCDFB');slab(33,'#E4F0FF','#BDD7FF');slab(0,C.white,'#A9CCFC');
  for(let u=40;u<380;u+=32)for(let v=36;v<265;v+=32){let pt=p(u,v);ellipse(s,'画布网格',pt[0],pt[1],2,2,'#DCE8F8');}
  const tile=(u,v,w,h,f)=>poly(s,'可编辑流程节点',[[u,v],[u+w,v],[u+w,v+h],[u,v+h]].map(([a,b])=>p(a,b)),f,C.blue,2);
  tile(138,40,110,50,'#D8EAFF');tile(42,163,106,54,'#EEF6FF');tile(252,163,106,54,'#EEF6FF');
  poly(s,'流程连线',[p(193,90),p(193,125),p(95,125),p(95,163)],'none',C.blue,3);
  poly(s,'流程连线',[p(193,125),p(305,125),p(305,163)],'none',C.blue,3);
  [[160,64,226,64],[61,189,127,189],[272,189,338,189]].forEach(a=>poly(s,'节点文字示意',[p(a[0],a[1]),p(a[2],a[3])],'none','#70A4EE',4));
}
export async function cover({presentation:p}){
 const s=p.slides.items[0];s.size={width:1280,height:720};s.background.fill='#F7FAFF';
 ellipse(s,'空间背景',710,90,510,510,'#E6F1FF');ellipse(s,'空间内环',760,140,410,410,'#EDF6FF');
 icon(s,62,48,86);text(s,'品牌','Excalidraw+',166,70,390,46,29,C.ink,true);
 label(s,'DOPAME OS · AI 白板',66,196,450);
 text(s,'主标题一','让想法',62,252,600,90,76,C.ink,true);text(s,'主标题二','自然成形',62,344,600,96,76,C.blue,true);
 text(s,'定位','为 Dopame OS 重构的 AI 白板',66,484,580,44,28,C.muted);
 text(s,'主张','本地文件 · 原生交互 · 智能体协作',66,542,580,36,22,C.muted);
 board(s,698,256,1.02);
 shape(s,'悬浮胶囊',864,172,302,61,C.blue,'none',24);text(s,'悬浮提示','一句话，生成一张图',864,178,302,48,20,C.white,true,'center');
 ellipse(s,'轨道小球',1114,563,36,36,C.blue);ellipse(s,'轨道小球高光',1119,567,10,10,'#71C1FF');
 note(s,15,'大家好，我带来的是 Excalidraw+，一块为 Dopame OS 重构的 AI 白板。它希望让一句话、一段语音，甚至一张草图，都能变成可以继续编辑的想法。',['README.md']);
 return {slide:1};
}
export async function introAndArchitecture({presentation:p}){
 let s=newSlide(p);head(s,'ABOUT ME / LIVE DEMO','我是 Andy17269','项目开发者 · Excalidraw+');
 icon(s,68,269,110);text(s,'个人主张','把想法变成工具',64,404,410,48,32,C.ink,true);
 text(s,'个人工作一','界面与原生适配',66,474,360,38,24,C.muted);text(s,'个人工作二','AI、语音与 MCP 接入',66,520,360,38,24,C.muted);
 shape(s,'运行视频可替换区域',470,263,744,418.5,'#EDF5FF',C.line,22);
 ellipse(s,'播放按钮',805,402,76,76,C.blue);poly(s,'播放三角',[[834,423],[834,456],[859,439]],C.white);
 text(s,'视频标题','运行演示',470,496,744,44,29,C.ink,true,'center');text(s,'视频提示','在此插入你的运行视频 · 建议 30–35 秒',490,550,704,35,19,C.muted,false,'center');
 note(s,45,'我是 Andy17269，这次负责了界面、Dopame 适配以及 AI、语音和 MCP 接入。先看一段运行演示。\n【预留视频 30–35 秒，当前尚未嵌入】\n建议录屏顺序：打开白板 → 自然语言生成 → 拖动修改 → 保存到本地。插入视频后删除播放图形与提示文字，保留或删除底框。',['docs/submission-disclosure.md']);
 s=newSlide(p);head(s,'REBUILD / 适配总览','从网页白板，到系统画布','保留 Excalidraw 编辑引擎，重做与系统连接的部分');
 const rows=[['01','数据层','IndexedDB','本地 .excalidraw 文件','持久化、恢复与快照'],['02','交互层','网页交互假设','acdert 原生运行','窗口、触摸板与工具栏'],['03','能力层','人工绘图入口','AI + MCP 双向连接','生成、局部修改与协作']];
 rows.forEach((r,i)=>{let y=278+i*117;shape(s,'适配行',64,y,1152,99,i%2?'#F7FAFF':C.pale,'none',17);text(s,'序号',r[0],88,y+21,62,55,34,C.blue,true);text(s,'层级',r[1],176,y+19,120,40,27,C.ink,true);text(s,'改造前',r[2],333,y+29,250,38,24,C.muted);arrow(s,'升级',600,y+49,50);text(s,'改造后',r[3],690,y+12,490,42,28,C.ink,true);text(s,'改造目的',r[4],692,y+55,490,30,19,C.muted);});
 note(s,25,'这次适配主要发生在三层。数据层，从浏览器数据库迁移到本地文件；交互层，针对 acdert 调整窗口、缩放和工具入口；能力层，把 AI 和 MCP 接到可编辑画布。Excalidraw 提供成熟的编辑引擎，我完成的是这些面向系统的连接。',['README.md','docs/submission-disclosure.md']);return {slides:[2,3]};
}
export async function storageAndNative({presentation:p}){
 let s=newSlide(p);head(s,'01 / 数据层','把每一次灵感，稳稳留在本地','从“浏览器里的状态”，到可打开、可恢复的文件');
 shape(s,'存储机制面板',64,272,1152,221,C.pale,'none',24);
 const names=['画布变更','串行写入','系统文件接口','.excalidraw'];const xs=[104,382,661,939];
 names.forEach((n,i)=>{shape(s,'数据节点',xs[i],320,207,93,i===3?C.blue:C.white,'none',17);text(s,'流程节点',n,xs[i],337,207,56,i===3?25:27,i===3?C.white:C.ink,true,'center');if(i<3)arrow(s,'数据流',xs[i]+222,367,35);});
 text(s,'防抖数值','800 ms',102,430,240,42,28,C.blue,true);text(s,'防抖说明','防抖自动保存',339,432,650,35,23,C.muted);
 const cols=[['恢复优先','新建 / 打开前，先保留恢复数据'],['失败可知','写入失败有状态反馈，可重试'],['快照可回看','手动创建快照，找回关键版本']];
 cols.forEach((r,i)=>{let x=66+i*392;text(s,'可靠性标题',r[0],x,548,355,42,27,C.ink,true);text(s,'可靠性说明',r[1],x,599,355,34,20,C.muted);});
 note(s,35,'最关键的底层改造是文件持久化。画布变更经过八百毫秒防抖，再串行写入本地 excalidraw 文件，避免并发保存互相覆盖。新建或打开文件之前，先保留恢复数据；写入失败能看到状态并重试，也可以手动创建快照。白板的内容由用户自己的文件承载，基础编辑和本地保存不依赖 AI 服务。',['src/useCanvasDocument.ts','src/services/filesystem.ts','README.md']);
 s=newSlide(p);head(s,'02 / 原生交互','让画布，真正融入桌面','围绕 acdert 重做运行适配与操作细节');
 const items=[['系统窗口','按能力接入窗口状态与控制'],['操作手感','光标锚定缩放、键盘撤销重做'],['界面减负','玻璃菜单胶囊 + 底部 Dock']];
 items.forEach((r,i)=>{let y=289+i*118;ellipse(s,'功能点',67,y+8,12,12,C.blue);text(s,'功能名',r[0],100,y-4,350,43,29,C.ink,true);text(s,'功能说明',r[1],100,y+44,380,35,20,C.muted);});
 shape(s,'截图底板',528,272,688,395,'#EEF5FF',C.line,22);
 s.images.add({path:ROOT+'/marketing/excalidraw-plus/assets/diagram.png',alt:'Excalidraw+ 实际画布界面',fit:'contain',position:{left:540,top:280,width:664,height:379}});
 note(s,30,'第二部分是原生交互。应用通过 acdert 运行，并根据系统能力接入窗口状态与控制。我们调整了触摸板缩放，使缩放围绕光标发生，同时修复撤销和属性面板等交互。界面上，把常用入口集中到菜单胶囊和底部 Dock，给画布留出更多空间。系统通知采用标准 Notification API，在运行环境支持时使用。',['src/services/acdeKernel.ts','src/services/notifications.ts','docs/verification-2026-11-15.md']);return {slides:[4,5]};
}
export async function aiAndMcp({presentation:p}){
 let s=newSlide(p);head(s,'03 / AI 能力','让一句话，变成可编辑的图','生成之后，仍然可以拖动、改字、调整结构');
 const x=[64,463,862];const titles=['表达想法','理解与转换','落到画布'];const desc=['文字 / 语音 / 草图','DeepSeek + 图表转换','原生可编辑元素'];
 x.forEach((xx,i)=>{shape(s,'AI阶段',xx,287,354,220,i===1?C.blue:C.pale,'none',24);text(s,'阶段数字','0'+(i+1),xx+28,308,100,54,42,i===1?'#A9D5FF':C.blue,true);text(s,'阶段名称',titles[i],xx+28,380,300,46,32,i===1?C.white:C.ink,true);text(s,'阶段说明',desc[i],xx+28,439,305,34,22,i===1?'#DCEBFF':C.muted);if(i<2)arrow(s,'AI箭头',xx+365,397,24);});
 line(s,'分隔线',66,554,1213,554,C.line,1);
 text(s,'能力一','语音改图',66,586,340,38,25,C.ink,true);text(s,'能力二','草图生成 UI',463,586,340,38,25,C.ink,true);text(s,'能力三','局部修改与取消',862,586,350,38,25,C.ink,true);
 note(s,30,'第三部分是 AI。用户可以输入文字、语音或草图。以图表为例，模型输出结构，经过 Mermaid 转换后成为画布上的可编辑元素。语音先识别为指令，草图也可以生成界面。我们还处理了异步结果的冲突：当用户已经改图、切换文档或取消任务时，旧结果不会覆盖新操作。AI 需要用户配置可用的模型服务。',['README.md','docs/verification-2026-11-15.md','src/App.tsx']);
 s=newSlide(p);s.background.fill='#0759D5';label(s,'04 / MCP 协作',64,40,700,'#B8DFFF');text(s,'标题','让智能体，也能使用画布',64,100,1150,80,49,C.white,true);text(s,'引导','把白板开放成可读、可画的工具',66,192,1100,40,23,'#CFDEFA');
 const nodes=[['智能体','提出任务'],['MCP 桥接','stdio → canvasBridge'],['Excalidraw+','读取与绘制']];
 nodes.forEach((r,i)=>{let xx=64+i*414;shape(s,'MCP节点',xx,305,i===2?324:322,176,i===1?'#2977E2':'#FFFFFF','none',23);text(s,'节点名',r[0],xx+18,337,286,53,32,i===1?C.white:C.ink,true,'center');text(s,'节点说明',r[1],xx+12,409,298,34,20,i===1?'#D7EAFF':C.muted,false,'center');if(i<2)arrow(s,'调用方向',xx+338,391,56,'#BEE3FF');});
 shape(s,'read_canvas工具',220,545,360,62,'#2C7BE6','none',25);shape(s,'draw_diagram工具',700,545,360,62,'#2C7BE6','none',25);
 text(s,'读取工具','read_canvas · 读取画布',220,554,360,43,23,C.white,true,'center');text(s,'绘图工具','draw_diagram · 绘制图表',700,554,360,43,23,C.white,true,'center');
 text(s,'验证范围','当前：开发会话 stdio 链路已验证',64,647,1152,34,19,'#C3DDFF',false,'center');
 note(s,30,'MCP 把白板变成智能体可以调用的工具。read_canvas 读取当前元素和文字，draw_diagram 把图表追加到画布。两者通过 stdio 桥接到运行中的 canvasBridge，已做真实的工具列举与调用测试。目前验证的是开发会话链路，安装包还没有独立注册这套画布服务，这也是后续集成要继续完成的一步。',['scripts/canvas-mcp.mjs','docs/verification-2026-11-15.md']);return {slides:[6,7]};
}
export async function closing({presentation:p}){
 let s=newSlide(p);s.background.fill='#F6FAFF';icon(s,568,51,144);
 text(s,'结尾标题','画布，成为系统的一部分',64,232,1152,83,57,C.ink,true,'center');
 text(s,'结尾副标题','让人的灵感，与 AI 的能力在这里相遇',64,332,1152,45,28,C.muted,false,'center');
 const v=[['89','项单元测试'],['29','组原生回归'],['2','组真实接口回归']];v.forEach((a,i)=>{let xx=220+i*310;text(s,'验证数量',a[0],xx,458,220,74,62,C.blue,true,'center');text(s,'验证类别',a[1],xx-20,543,260,36,21,C.muted,false,'center');});
 text(s,'结语品牌','Excalidraw+',64,632,1152,43,29,C.ink,true,'center');
 note(s,10,'目前，记录中的八十九项单元测试、二十九组原生回归和两组真实接口回归通过。Excalidraw+ 希望让画布成为系统的一部分，让人的灵感与 AI 的能力在这里相遇。谢谢。\n这些数字来自已有项目验证记录，并非本次制作 PPT 重新运行的结果。总建议用时：220 秒，含 30–35 秒视频。',['docs/verification-2026-11-15.md']);return {slide:8};
}
