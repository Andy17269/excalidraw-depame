// Deterministic CSS 3D objects. No external geometry, textures or render loops.
const marks = [
 '<path d="M48 106C75 20 101 173 132 90S199 54 229 97"/><path d="M230 97l-6-24m6 24-24-2"/>',
 '<rect x="24" y="54" width="60" height="50" rx="12"/><rect x="184" y="54" width="60" height="50" rx="12"/><path d="M84 79h100m-15-12 15 12-15 12"/>',
 '<rect x="84" y="12" width="100" height="136" rx="18"/><path d="M105 38h58M104 64h60v42h-60zM106 123h14m14 0h27"/>'
];
function slab(name,mark){return `<div class="glass-slab ${name}"><div class="slab-face back"></div><div class="slab-face middle"></div><div class="slab-face front"><svg class="slab-mark" viewBox="0 0 268 160">${mark}</svg></div></div>`}
for(let n=1;n<=8;n++){
 const scene=document.querySelector('#s'+n);
 const world=document.createElement('div');world.className='depth-world';world.setAttribute('aria-hidden','true');world.setAttribute('data-layout-ignore','');
 world.innerHTML=`<div class="depth-light"></div><div class="depth-light secondary"></div><div class="depth-floor"></div>${slab('slab-a',marks[(n-1)%3])}${slab('slab-b',marks[n%3])}<div class="depth-ring ring-a"><i class="orbit-bead"></i><i class="orbit-bead small"></i></div><div class="depth-ring ring-b"><i class="orbit-bead"></i></div><div class="depth-pencil"></div>`;
 for(let i=0;i<9;i++){const dot=document.createElement('i');dot.className='depth-speck';dot.style.left=(70+((i*193+n*53)%1750))+'px';dot.style.top=(40+((i*137+n*71)%950))+'px';dot.style.opacity=String(.22+(i%3)*.13);dot.style.width=dot.style.height=(6+(i%4)*4)+'px';world.appendChild(dot)}
 world.insertAdjacentHTML('beforeend','<div class="depth-haze"></div>');scene.prepend(world);
}
window.addDepthMotion=function(tl){
 const starts=[0,4.8,11.8,17.8,26.8,32.8,38.8,43.1],ends=[5.45,12.45,18.45,27.45,33.45,39.45,43.75,48];
 starts.forEach((s,i)=>{
  const root='#s'+(i+1),d=ends[i]-s;
  tl.from(root+' .glass-slab',{opacity:i===0?.35:0,z:-140,rotationY:'-=18',duration:1.5,ease:'power2.out',stagger:.15},s+.12);
  tl.to(root+' .slab-a',{y:-60,rotationX:'+=12',rotationZ:'+=9',duration:d-.3,ease:'sine.inOut'},s+.25);
  tl.to(root+' .slab-b',{y:50,rotationY:'-=14',rotationZ:'-=12',duration:d-.3,ease:'sine.inOut'},s+.25);
  tl.from(root+' .depth-ring',{opacity:0,scale:.88,duration:1.4,ease:'sine.out',stagger:.15},s+.1);
  tl.to(root+' .ring-a',{rotationZ:'+=47',rotationY:'+=9',duration:d,ease:'none'},s);
  tl.to(root+' .ring-b',{rotationZ:'-=38',rotationX:'+=6',duration:d,ease:'none'},s);
  tl.from(root+' .depth-pencil',{opacity:0,x:85,z:80,duration:1.2,ease:'power3.out'},s+.25);
  tl.to(root+' .depth-pencil',{y:32,rotationZ:'+=11',duration:d-1.4,ease:'sine.inOut'},s+1.4);
  tl.to(root+' .depth-light',{x:130,y:-80,scale:1.12,duration:d,ease:'sine.inOut',stagger:.1},s);
  tl.from(root+' .depth-speck',{opacity:0,z:-80,duration:.8,stagger:.035,ease:'power1.out'},s+.3);
  tl.to(root+' .depth-speck',{y:(j)=>j%2?-45:35,x:(j)=>j%3?-20:25,duration:d-.6,stagger:.025,ease:'sine.inOut'},s+.5);
 });
 // UI rises into place, then gently pivots in depth, preserving pixel colors.
 tl.from('#s2 .screen',{rotationY:-12,rotationX:6,transformPerspective:1600,duration:1.7,ease:'expo.out'},6.25);
 tl.to('#s2 .screen',{rotationY:2,rotationX:-1,duration:3.2,ease:'sine.inOut'},8.1);
 tl.from('#s4 .before .phone',{rotationY:15,rotationX:4,transformPerspective:1600,duration:1.6,ease:'power3.out'},18.65);
 tl.from('#s4 .after .phone',{rotationY:-18,rotationX:5,transformPerspective:1600,duration:1.7,ease:'expo.out'},20.55);
 tl.to('#s4 .before .phone',{rotationY:-3,rotationX:1,duration:4.5,ease:'sine.inOut'},21);
 tl.to('#s4 .after .phone',{rotationY:3,rotationX:-1,duration:3.8,ease:'sine.inOut'},22.5);
 tl.from('#s5 .edit-canvas',{rotationX:9,transformPerspective:1800,duration:1.5,ease:'expo.out'},27.4);
 tl.to('#s5 .edit-canvas',{rotationX:-1.5,rotationY:1.5,duration:3,ease:'sine.inOut'},29.2);
 tl.from('#s6 .mcp-node',{rotationY:-12,rotationX:8,transformPerspective:1600,duration:1.4,stagger:.18,ease:'power3.out'},33.85);
 tl.to('#s6 .mcp-node',{rotationY:3,rotationX:-2,duration:2.8,stagger:.15,ease:'sine.inOut'},35.7);
 tl.from('#s7 .save-icon',{rotationY:-24,rotationX:12,transformPerspective:900,duration:1.15,stagger:.14,ease:'expo.out'},39.65);
 tl.to('#s7 .save-icon',{y:-12,rotationY:5,duration:1.8,stagger:.1,ease:'sine.inOut'},41);
 tl.to('#s1 .hero-icon',{y:-10,rotationY:7,rotationX:-5,transformPerspective:1000,duration:3.2,ease:'sine.inOut'},1.4);
 tl.to('#s8 .hero-icon',{y:-9,rotationY:-6,rotationX:4,transformPerspective:1000,duration:3.6,ease:'sine.inOut'},44.2);
};
