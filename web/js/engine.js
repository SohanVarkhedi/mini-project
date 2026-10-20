/* =========================================================
   ENGINE: actors, levels, render, highlights, UI, audio
   ========================================================= */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIRS={down:[0,1],up:[0,-1],left:[-1,0],right:[1,0]};
const opposite={down:'up',up:'down',left:'right',right:'left'};
let activeNpcs=[];
class Actor{
  constructor(o){Object.assign(this,{dir:'down',moving:false,prog:0,speed:4.2,frame:0,animT:0,stepN:0,mode:'stand'},o);this.place(this.x,this.y,this.dir);this.sheet=sheet(this.pal)}
  place(x,y,dir){this.x=x;this.y=y;this.fx=x;this.fy=y;this.tx=x;this.ty=y;this.dir=dir||this.dir;this.moving=false;this.prog=0;this.px=x*T;this.py=y*T;this.animT=0;this.frame=0}
  occupies(x,y){return (this.x===x&&this.y===y)||(this.moving&&this.tx===x&&this.ty===y)}
  start(dir,speed){const[dx,dy]=DIRS[dir];this.dir=dir;const nx=this.x+dx,ny=this.y+dy;if(blocked(nx,ny,this))return false;this.fx=this.x;this.fy=this.y;this.tx=nx;this.ty=ny;this.moving=true;this.prog=0;this.speed=speed;return true}
  update(dt){
    if(this.moving){this.prog+=dt*this.speed;this.animT+=dt;if(this.prog>=1){this.x=this.tx;this.y=this.ty;this.moving=false;this.stepN++;const ex=this.prog-1;this.prog=0;this.onArrive&&this.onArrive(ex)}}
    else this.animT=0;
    const k=this.moving?this.prog:0;
    if(this.moving){this.px=(this.fx+(this.tx-this.fx)*k)*T;this.py=(this.fy+(this.ty-this.fy)*k)*T}else{this.px=this.x*T;this.py=this.y*T}
    this.frame=this.moving?[1,0,3,2][Math.floor(this.animT*this.speed*2)%4]:0;
  }
}
const player=new Actor({id:'you',name:'You',x:36,y:38,dir:'up',pal:P.you});
const npcAll=NPCDEF.map(d=>{const a=new Actor(Object.assign({pal:P[d.id],mode:'stand'},d));a.def=d;a.speed=3;a.typePhase=Math.random()*10;return a});
const npc=id=>activeNpcs.find(n=>n.id===id);
function blocked(x,y,self){
  if(!inb(x,y)||solid[idx(x,y)])return true;
  if(self!==player&&player.occupies(x,y))return true;
  for(const n of activeNpcs)if(n!==self&&n.occupies(x,y))return true;
  if(self&&self.area){const[a,b,w,h]=self.area;if(x<a||y<b||x>=a+w||y>=b+h)return true}
  return false;
}

/* ---------- level state ---------- */
let G=null;
Object.defineProperty(window,'G',{get:()=>G,configurable:true}); /* read-only test hook */
const objActive=o=>!o.levels||(G&&o.levels.includes(G.level.id));
function rebuildSolid(){solid.set(baseSolid);for(const o of objects){if(!o.solid||o.layer!=='y'||!objActive(o)||o.hidden)continue;for(let j=0;j<o.h;j++)for(let i=0;i<o.w;i++)if(inb(o.x+i,o.y+j))solid[idx(o.x+i,o.y+j)]=1}}
const isDone=id=>!!(G&&G.res[id]);
const taskOpen=t=>!isDone(t.id)&&(!t.after||isDone(t.after));
const allDone=()=>G.level.tasks.every(t=>isDone(t.id));
function tasksAtNpc(n){return G.level.tasks.filter(t=>t.at.npc===n.id)}
function tasksAtObj(o){return o.id?G.level.tasks.filter(t=>t.at.obj===o.id):[]}
function targetRef(t){return t.at.npc?{type:'npc',n:npc(t.at.npc)}:{type:'obj',o:objById(t.at.obj)}}
function activeTargets(){
  const out=[],seen=new Set();
  for(const t of G.level.tasks){if(!taskOpen(t))continue;const r=targetRef(t);const key=r.type+(r.n?r.n.id:r.o.id);if(seen.has(key))continue;seen.add(key);out.push({...r,t})}
  if(allDone()&&!G.finished)out.push({type:'npc',n:npc('ada'),t:{id:'debrief',label:'Report back to Ada'}});
  return out;
}
function isTargetRef(tg){if(!G)return false;return activeTargets().some(a=>a.type===tg.type&&(a.type==='npc'?a.n===tg.n:a.o===tg.o))}

/* ---------- rendering ---------- */
const cv=$('screen'),ctx=cv.getContext('2d');
let Zd=2,dpr=1,VW=480,VH=270;const cam={x:0,y:0},camR={x:0,y:0};
function resize(){
  dpr=Math.min(2,window.devicePixelRatio||1);const W=innerWidth,Hh=innerHeight;
  cv.width=Math.max(1,Math.round(W*dpr));cv.height=Math.max(1,Math.round(Hh*dpr));cv.style.width=W+'px';cv.style.height=Hh+'px';
  Zd=Math.max(2,Math.round(cv.width/720));while(cv.width/Zd>MW*T||cv.height/Zd>MH*T)Zd++;
  VW=cv.width/Zd;VH=cv.height/Zd;if(G)updateCamera(0,true);
}
addEventListener('resize',resize);
const SX=u=>Math.round((u-cam.x)*Zd),SY=u=>Math.round((u-cam.y)*Zd);
function frameOf(o,time){return o.frames[o.fps?Math.floor(time*o.fps+o.phase)%o.frames.length:0]}
function objBox(o,time){
  if(!o.frames)return o.hl?{X:o.hl.x,Y:o.hl.y,w:o.hl.w,h:o.hl.h,top:o.hl.y,base:o.hl.y+o.hl.h,cx:o.hl.x+o.hl.w/2}:null;
  const fr=frameOf(o,time),w=fr.width/R,h=fr.height/R;
  if(o.layer==='wall'){const X=o.x*T+(o.w*T-w)/2+o.dx,Y=o.y*T+o.dy;return{fr,X,Y,w,h,top:Y,base:Y+h,cx:X+w/2}}
  const X=o.x*T+(o.w*T-w)/2+o.dx,Y=(o.y+o.h)*T-h+.5+o.dy;return{fr,X,Y,w,h,top:Y,base:(o.y+o.h)*T+o.dy*.3,cx:X+w/2};
}
const glowCache=new WeakMap();
function glowOf(spr){let gl=glowCache.get(spr);if(gl)return gl;const pad=6,sil=mk(spr.width,spr.height),sg=sil.getContext('2d');sg.drawImage(spr,0,0);sg.globalCompositeOperation='source-in';sg.fillStyle='#fde047';sg.fillRect(0,0,sil.width,sil.height);
  gl=mk(spr.width+pad*2,spr.height+pad*2);const g=gl.getContext('2d');g.shadowColor='#f59e0b';g.shadowBlur=pad;for(const[dx,dy]of[[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1],[-1,1],[1,-1]])g.drawImage(sil,pad+dx,pad+dy);glowCache.set(spr,gl);return gl}
function drawHi(spr,X,Y){ctx.drawImage(spr,SX(X),SY(Y),spr.width*Zd/R,spr.height*Zd/R)}
function drawPx(spr,X,Y){const s=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;ctx.drawImage(spr,SX(X),SY(Y),spr.width*Zd,spr.height*Zd);ctx.imageSmoothingEnabled=s}
const EXCL={red:S(9,11,o=>{o.r(1,0,7,9,'#ffffff');o.r(0,1,9,7,'#ffffff');o.r(3,9,3,1,'#ffffff');o.p(4,10,'#ffffff');o.r(4,2,1,4,'#e5484d');o.r(4,7,1,1,'#e5484d')}),
  q:S(9,11,o=>{o.r(1,0,7,9,'#ffffff');o.r(0,1,9,7,'#ffffff');o.r(3,9,3,1,'#ffffff');o.p(4,10,'#ffffff');o.r(3,2,3,1,'#3b82f6');o.r(5,3,1,1,'#3b82f6');o.r(4,4,1,2,'#3b82f6');o.r(4,7,1,1,'#3b82f6')})};
const DOTS=[1,2,3].map(n=>S(13,9,o=>{o.r(1,0,11,7,'#ffffff');o.r(0,1,13,5,'#ffffff');o.r(3,7,2,1,'#ffffff');o.p(3,8,'#ffffff');for(let i=0;i<n;i++)o.r(3+i*3,3,2,1,'#3b3b4a')}));
let time=0;const particles=[];let marker=null;
function targetGeom(tg,tm){
  if(tg.type==='npc'){const n=tg.n;if(!n)return null;const sit=n.mode==='sit';const cx=(sit?n.x*T+16:n.px+8),top=(sit?n.y*T-12:n.py-14),base=(sit?n.y*T+14:n.py+15);return{cx,top,base,label:tg.t.label}}
  const b=objBox(tg.o,tm);if(!b)return null;return{cx:b.cx,top:b.top,base:b.base,label:tg.t.label,box:b};
}
function render(){
  const W=cv.width,Hh=cv.height;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#14121a';ctx.fillRect(0,0,W,Hh);
  ctx.imageSmoothingEnabled=(Zd%R)!==0;ctx.imageSmoothingQuality='high';
  ctx.drawImage(world,cam.x*R,cam.y*R,VW*R,VH*R,0,0,W,Hh);
  const vis=(x,y,w,h)=>x+w>cam.x-8&&y+h>cam.y-8&&x<cam.x+VW+8&&y<cam.y+VH+8;
  const targets=activeTargets(),tgObjs=new Set(targets.filter(t=>t.type==='obj').map(t=>t.o)),tgNpcs=new Set(targets.filter(t=>t.type==='npc').map(t=>t.n));
  const pulse=.55+.45*Math.sin(time*4);
  /* wall layer */
  for(const o of objects){if(o.layer!=='wall'||!objActive(o))continue;const b=objBox(o,time);if(!vis(b.X,b.Y,b.w,b.h))continue;drawHi(b.fr,b.X,b.Y);
    if(o.kind==='clock'){const d=new Date(),mx=SX(b.X+6.5),my=SY(b.Y+6.5),ma=d.getMinutes()/60*Math.PI*2,ha=(d.getHours()%12+d.getMinutes()/60)/12*Math.PI*2;ctx.lineCap='round';ctx.strokeStyle='#1f2937';ctx.lineWidth=Zd*.7;ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.sin(ma)*4.2*Zd,my-Math.cos(ma)*4.2*Zd);ctx.stroke();ctx.strokeStyle='#ef4444';ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.sin(ha)*3*Zd,my-Math.cos(ha)*3*Zd);ctx.stroke()}}
  /* floor beams + rings under targets */
  for(const tg of targets){const g=targetGeom(tg,time);if(!g)continue;const bx=SX(g.cx),by=SY(g.base),tp=SY(g.top-30);
    const gr=ctx.createLinearGradient(0,tp,0,by);gr.addColorStop(0,'rgba(251,191,36,0)');gr.addColorStop(1,`rgba(251,191,36,${.16+.1*pulse})`);ctx.fillStyle=gr;ctx.fillRect(bx-7*Zd,tp,14*Zd,by-tp);
    const ph=(time*.9)%1;ctx.strokeStyle=`rgba(251,191,36,${(1-ph)*.9})`;ctx.lineWidth=Math.max(1.5,Zd*.8);ctx.beginPath();ctx.ellipse(bx,by,(9+ph*10)*Zd,(3.6+ph*4)*Zd,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(251,191,36,.16)';ctx.beginPath();ctx.ellipse(bx,by,9*Zd,3.6*Zd,0,0,Math.PI*2);ctx.fill();
    if(tg.type==='obj'&&!tg.o.frames&&g.box){const b=g.box;ctx.save();ctx.shadowColor='#f59e0b';ctx.shadowBlur=12*pulse*dpr;ctx.strokeStyle=`rgba(253,224,71,${.6+.4*pulse})`;ctx.lineWidth=Zd;ctx.beginPath();ctx.roundRect(SX(b.X-2),SY(b.Y-2),(b.w+4)*Zd,(b.h+4)*Zd,3*Zd);ctx.stroke();ctx.restore()}}
  /* y-sorted */
  const list=[];
  for(const o of objects){if(o.layer!=='y'||o.hidden||!objActive(o))continue;const b=objBox(o,time);if(!vis(b.X,b.Y,b.w,b.h))continue;
    const hl=tgObjs.has(o);list.push({z:(o.y+o.h)*T-1+o.zb,d:()=>{if(hl){const gl=glowOf(b.fr);ctx.globalAlpha=.55+.45*pulse;ctx.drawImage(gl,SX(b.X-6/R),SY(b.Y-6/R),gl.width*Zd/R,gl.height*Zd/R);ctx.globalAlpha=1}drawHi(b.fr,b.X,b.Y)}})}
  for(const a of [player,...activeNpcs]){
    const hl=tgNpcs.has(a);
    if(a.mode==='sit'){const X=a.x*T+7,Y=a.y*T-13;if(!vis(X,Y,18,28))continue;list.push({z:a.y*T+14,a,hx:X+9,hy:Y+1,d:()=>{const fr=a.talking?a.sheet.sit[0]:a.sheet.sit[Math.floor(time*6+a.typePhase)%2];if(hl){const gl=glowOf(fr);ctx.globalAlpha=.55+.45*pulse;drawPx(gl,X-6,Y-6);ctx.globalAlpha=1}drawPx(fr,X,Y)}});continue}
    const X=Math.round(a.px*Zd)/Zd-1,Y=Math.round(a.py*Zd)/Zd-12;if(!vis(X,Y,18,28))continue;
    list.push({z:a.py+15,a,hx:X+9,hy:Y+1,d:()=>{ctx.fillStyle='rgba(15,10,25,.32)';ctx.beginPath();ctx.ellipse(SX(X+9),SY(Y+27),6.5*Zd,2.3*Zd,0,0,Math.PI*2);ctx.fill();const fr=a.sheet[a.dir][a.frame];if(hl){const gl=glowOf(fr);ctx.globalAlpha=.55+.45*pulse;drawPx(gl,X-6,Y-6);ctx.globalAlpha=1}drawPx(fr,X,Y)}});
  }
  list.sort((p,q)=>p.z-q.z);for(const it of list)it.d();
  /* emotes */
  for(const it of list){if(!it.a||it.a===player||tgNpcs.has(it.a))continue;const e=emoteFor(it.a);if(!e)continue;const bob=Math.sin(time*5+it.a.typePhase)*1.5;
    if(e==='dots')drawPx(DOTS[Math.floor(time*2.5)%3],it.hx+1,it.hy-12+bob);else drawPx(EXCL[e],it.hx-5,it.hy-14+bob)}
  /* quest markers */
  for(const tg of targets){const g=targetGeom(tg,time);if(!g)continue;const bob=Math.sin(time*3.2)*2.2,mx=SX(g.cx),my=SY(g.top-11+bob),s=6.5*Zd;
    ctx.save();ctx.shadowColor='rgba(245,158,11,.9)';ctx.shadowBlur=14*dpr;ctx.fillStyle='#fbbf24';ctx.beginPath();ctx.moveTo(mx,my-s);ctx.lineTo(mx+s*.8,my);ctx.lineTo(mx,my+s);ctx.lineTo(mx-s*.8,my);ctx.closePath();ctx.fill();ctx.restore();
    ctx.strokeStyle='#fff7d6';ctx.lineWidth=Math.max(1.5,Zd*.6);ctx.stroke();ctx.fillStyle='#3a2600';ctx.font=`900 ${Math.round(8*Zd)}px ${UIF}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(tg.t.id==='debrief'?'✓':'!',mx,my+Zd*.4)}
  /* particles */
  for(const p of particles){ctx.globalAlpha=p.fade?Math.max(0,1-p.t/p.life):Math.min(1,(p.life-p.t)*3);ctx.fillStyle=p.col;ctx.fillRect(SX(p.x),SY(p.y),p.sz*Zd*.6,p.sz*Zd*.6)}ctx.globalAlpha=1;
  if(marker){const k=marker.t/.5;ctx.globalAlpha=1-k;ctx.strokeStyle=marker.talk?'#fbbf24':'#4ade80';ctx.lineWidth=Zd*.6;ctx.beginPath();ctx.ellipse(SX(marker.x),SY(marker.y),(3+k*7)*Zd,(1.6+k*3.5)*Zd,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}
  /* edge arrows for off-screen goals */
  const m=46*dpr;
  for(const tg of targets){const g=targetGeom(tg,time);if(!g)continue;const tx=SX(g.cx),ty=SY((g.top+g.base)/2);if(tx>m*.4&&ty>m*.4&&tx<W-m*.4&&ty<Hh-m*.4)continue;
    const cx=W/2,cy=Hh/2,ang=Math.atan2(ty-cy,tx-cx);let ex=Math.max(m,Math.min(W-m,tx)),ey=Math.max(m+40*dpr,Math.min(Hh-m-14*dpr,ty));if(!mini.hidden&&innerWidth>560&&ex<250*dpr&&ey>Hh-200*dpr)ex=250*dpr;
    const r=16*dpr;ctx.save();ctx.translate(ex,ey);ctx.shadowColor='rgba(245,158,11,.8)';ctx.shadowBlur=12*dpr*pulse;ctx.fillStyle='rgba(20,16,8,.85)';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fbbf24';ctx.lineWidth=2*dpr;ctx.stroke();
    ctx.rotate(ang);ctx.fillStyle='#fbbf24';ctx.beginPath();ctx.moveTo(r*.65,0);ctx.lineTo(-r*.35,-r*.45);ctx.lineTo(-r*.15,0);ctx.lineTo(-r*.35,r*.45);ctx.closePath();ctx.fill();ctx.restore();
    const lb=g.label.length>24?g.label.slice(0,23)+'…':g.label;ctx.font=`700 ${11*dpr}px ${UIF}`;const tw=ctx.measureText(lb).width;let lx=Math.max(8*dpr+tw/2,Math.min(W-8*dpr-tw/2,ex)),ly=ey+r+12*dpr;if(ly>Hh-10*dpr)ly=ey-r-12*dpr;
    ctx.fillStyle='rgba(8,16,12,.85)';ctx.beginPath();ctx.roundRect(lx-tw/2-7*dpr,ly-9*dpr,tw+14*dpr,18*dpr,9*dpr);ctx.fill();ctx.fillStyle='#fde68a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(lb,lx,ly+.5*dpr)}
}
function emoteFor(n){if(n.id==='rex'&&!G.talked.rex&&G.level.id!=='inbox')return'q';if(n.chat&&!n.talking)return n.id==='sam'?'dots':null;return null}

/* ---------- minimap ---------- */
const mini=$('mini'),mg=mini.getContext('2d');let miniBase=null;const MSc=4;
function buildMini(){
  miniBase=mk(MW*MSc,MH*MSc);const g=miniBase.getContext('2d');
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const t=tileAt(x,y);if(isWallT(t)){g.fillStyle='#22202a'}else{const r=roomAt(x,y);g.fillStyle=r?r.c:'#555'}g.fillRect(x*MSc,y*MSc,MSc,MSc)}
  g.fillStyle='rgba(0,0,0,.28)';for(const o of objects){if(o.layer!=='y'||!o.solid||o.levels)continue;g.fillRect(o.x*MSc,o.y*MSc,o.w*MSc,o.h*MSc)}
}
function drawMini(){
  const W=mini.width,Hh=mini.height,s=W/(MW*MSc);mg.setTransform(1,0,0,1,0,0);mg.clearRect(0,0,W,Hh);mg.imageSmoothingEnabled=false;mg.globalAlpha=.92;mg.drawImage(miniBase,0,0,W,Hh);mg.globalAlpha=1;
  const k=MSc*s;mg.strokeStyle='rgba(255,255,255,.55)';mg.lineWidth=1;mg.strokeRect(cam.x/T*k+.5,cam.y/T*k+.5,VW/T*k,VH/T*k);
  for(const n of activeNpcs){mg.fillStyle='#cbd5e1';mg.fillRect((n.px/T+.25)*k,(n.py/T+.25)*k,k*.6,k*.6)}
  for(const tg of activeTargets()){const g=targetGeom(tg,time);if(!g)continue;const x=g.cx/T*k,y=g.base/T*k;mg.fillStyle='#fbbf24';mg.beginPath();mg.arc(x,y,k*(1+.5*Math.sin(time*5)),0,7);mg.fill();mg.strokeStyle='rgba(251,191,36,.5)';mg.beginPath();mg.arc(x,y,k*(2+((time*1.5)%1)*2),0,7);mg.stroke()}
  mg.fillStyle='#22c55e';mg.strokeStyle='#fff';mg.lineWidth=1.5;mg.beginPath();mg.arc((player.px/T+.5)*k,(player.py/T+.5)*k,k*1.1,0,7);mg.fill();mg.stroke();
}
mini.addEventListener('pointerdown',e=>{if(!G||G.paused)return;const r=mini.getBoundingClientRect();const tx=Math.floor((e.clientX-r.left)/r.width*MW),ty=Math.floor((e.clientY-r.top)/r.height*MH);walkToTile(tx,ty)});

/* ---------- input & movement ---------- */
const KEYMAP={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
const held=[],pressAt={};let running=false,inputLock=0,path=[],pendingAct=null;
addEventListener('keydown',e=>{
  if(!G||$('game').hidden)return;
  if(!$('modal').hidden){if(e.code==='Escape'&&modalClosable)closeModal();return}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(e.code))e.preventDefault();
  if(e.code==='ShiftLeft'||e.code==='ShiftRight')running=true;
  const d=KEYMAP[e.code];if(d&&!held.includes(d)){held.push(d);pressAt[d]=performance.now();path=[];pendingAct=null}
  if(e.code==='KeyM'){mini.hidden=!mini.hidden}
  if(['Space','Enter','KeyE','KeyZ'].includes(e.code)&&!e.repeat){if(D.open)advance();else if(performance.now()>inputLock)tryInteract()}
});
addEventListener('keyup',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')running=false;const d=KEYMAP[e.code];if(d){const i=held.indexOf(d);if(i>=0)held.splice(i,1)}});
addEventListener('blur',()=>{held.length=0;running=false});
const frontTile=a=>{const[dx,dy]=DIRS[a.dir];return[a.x+dx,a.y+dy]};
function targetAt(x,y){
  for(const n of activeNpcs)if(n.x===x&&n.y===y&&!n.moving)return{type:'npc',n};
  const here=objects.filter(o=>o.info&&!o.hidden&&objActive(o)&&x>=o.x&&y>=o.y&&x<o.x+o.w&&y<o.y+o.h);
  if(!here.length)return null;
  const q=here.find(o=>G.level.tasks.some(t=>t.at.obj===o.id&&taskOpen(t)));if(q)return{type:'obj',o:q};
  const k=here.find(o=>o.id&&G.level.tasks.some(t=>t.at.obj===o.id));if(k)return{type:'obj',o:k};
  return{type:'obj',o:here.sort((a,b)=>(b.zb||0)-(a.zb||0))[0]};
}
function tryInteract(){if(player.moving||G.paused||D.open)return;const[x,y]=frontTile(player);const tg=targetAt(x,y);if(tg)interact(tg)}
function bfs(sx,sy,goals){
  const key=(x,y)=>y*MW+x,prev=new Int32Array(MW*MH).fill(-1),seen=new Uint8Array(MW*MH),q=[key(sx,sy)];seen[q[0]]=1;const Gs=new Set(goals.map(([x,y])=>key(x,y)));let hit=-1,qi=0;
  while(qi<q.length){const k=q[qi++];if(Gs.has(k)){hit=k;break}const x=k%MW,y=(k/MW)|0;for(const[dx,dy]of Object.values(DIRS)){const nx=x+dx,ny=y+dy;if(!inb(nx,ny))continue;const nk=key(nx,ny);if(seen[nk]||blocked(nx,ny,player))continue;seen[nk]=1;prev[nk]=k;q.push(nk)}}
  if(hit<0)return null;const out=[];let k=hit;while(prev[k]>=0){const p=prev[k],dx=k%MW-p%MW,dy=((k/MW)|0)-((p/MW)|0);out.unshift(dx===1?'right':dx===-1?'left':dy===1?'down':'up');k=p}return out;
}
function walkToTarget(tg){
  let ox,oy,w=1,h=1;if(tg.type==='npc'){ox=tg.n.x;oy=tg.n.y}else{const o=tg.o;ox=o.x;oy=o.y;w=o.w;h=o.h;if(o.layer==='none'||o.layer==='wall'){oy=o.y;}}
  const cells=[];for(let j=0;j<h;j++)for(let i=0;i<w;i++)for(const[dx,dy]of Object.values(DIRS)){const cx=ox+i+dx,cy=oy+j+dy;if(cx>=ox&&cx<ox+w&&cy>=oy&&cy<oy+h)continue;if(!blocked(cx,cy,player)||(cx===player.x&&cy===player.y))cells.push([cx,cy,ox+i,oy+j])}
  const p=bfs(player.x,player.y,cells.map(c=>[c[0],c[1]]));if(!p){sfx('bump');return false}
  path=p;const ex=player.x+p.reduce((s,d)=>s+DIRS[d][0],0),ey=player.y+p.reduce((s,d)=>s+DIRS[d][1],0);const c=cells.find(c=>c[0]===ex&&c[1]===ey);pendingAct={x:c[2],y:c[3]};marker={x:c[2]*T+8,y:c[3]*T+14,t:0,talk:true};sfx('click');return true;
}
function walkToTile(tx,ty){if(!inb(tx,ty))return;if(blocked(tx,ty,player)){const tg=targetAt(tx,ty);if(tg)return walkToTarget(tg);sfx('bump');return}const p=bfs(player.x,player.y,[[tx,ty]]);if(p){path=p;pendingAct=null;marker={x:tx*T+8,y:ty*T+14,t:0};sfx('click')}}
function clickWorld(wx,wy){
  const tx=Math.floor(wx/T),ty=Math.floor(wy/T);if(!inb(tx,ty))return;
  for(const n of activeNpcs){const sit=n.mode==='sit',X=sit?n.x*T+7:n.px-1,Y=sit?n.y*T-13:n.py-12;if(wx>=X+2&&wx<X+16&&wy>=Y&&wy<Y+27)return walkToTarget({type:'npc',n})}
  const cand=objects.filter(o=>o.info&&!o.hidden&&objActive(o)&&(o.layer==='y'||o.layer==='none')).map(o=>({o,b:objBox(o,time)})).filter(({b})=>b&&wx>=b.X&&wx<b.X+b.w&&wy>=b.Y&&wy<b.base).sort((a,b)=>(b.o.zb||0)-(a.o.zb||0)||b.b.base-a.b.base);
  const quest=cand.find(c=>G.level.tasks.some(t=>t.at.obj===c.o.id&&taskOpen(t)));
  if(quest)return walkToTarget({type:'obj',o:quest.o});
  if(!blocked(tx,ty,player)){const p=bfs(player.x,player.y,[[tx,ty]]);if(p){path=p;pendingAct=null;marker={x:tx*T+8,y:ty*T+14,t:0};sfx('click')}return}
  if(cand.length)return walkToTarget({type:'obj',o:cand[0].o});
  const tg=targetAt(tx,ty);if(tg)return walkToTarget(tg);sfx('bump');
}
cv.addEventListener('pointerdown',e=>{if(!G||G.paused)return;if(D.open){advance();return}audioInit();clickWorld(cam.x+(e.clientX)*dpr/Zd,cam.y+(e.clientY)*dpr/Zd)});

function decideMove(speed){
  if(held.length){const d=held[held.length-1];if(d!==player.dir&&!player.moving&&performance.now()-pressAt[d]<85&&player.animT===0){player.dir=d;return false}if(player.start(d,speed))return true;player.dir=d;return false}
  if(path.length){const d=path[0];if(player.start(d,speed)){path.shift();return true}path=[];return false}
  if(pendingAct&&!player.moving){const dx=pendingAct.x-player.x,dy=pendingAct.y-player.y;player.dir=dx>0?'right':dx<0?'left':dy>0?'down':'up';pendingAct=null;setTimeout(tryInteract,60)}
  return false;
}
function updatePlayer(dt){
  const busy=D.open||G.paused,speed=running?7.5:4.4;
  player.onArrive=ex=>{sfx('step',player.stepN%2?850:1050);if(running&&player.stepN%2)puff(player.px+8,player.py+14);const r=roomAt(player.x,player.y);if(r&&r!==G.room){G.room=r;showRoom(r.n)}if(!busy&&decideMove(speed))player.prog=Math.min(ex,.5)};
  if(!player.moving&&!busy)decideMove(speed);player.update(dt);
}
function updateNPCs(dt){
  for(const n of activeNpcs){
    if(n.mode==='wander'&&!n.talking&&!D.open&&!G.paused){if(!n.moving){n.wanderT=(n.wanderT??1+Math.random()*2)-dt;if(n.wanderT<=0){n.wanderT=.8+Math.random()*2.6;const ds=Object.keys(DIRS),d=ds[(Math.random()*4)|0];n._s=Math.random()<.5?1:2;n.onArrive=()=>{if(--n._s>0)n.start(n.dir,n.speed)};if(!n.start(d,n.speed))n.dir=d}}}
    if(n.chat&&!n.talking&&!n.moving){const m=npc(n.chat);if(m)n.dir=m.x>n.x?'right':m.x<n.x?'left':m.y>n.y?'down':'up'}
    if(!n.chat&&n.mode==='stand'&&!n.talking&&!n.moving){n.idleT=(n.idleT??3+Math.random()*4)-dt;if(n.idleT<=0){n.idleT=2.5+Math.random()*4;const dx=player.x-n.x,dy=player.y-n.y;n.dir=Math.abs(dx)+Math.abs(dy)<5?(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')):n.def.dir}}
    n.update(dt);
  }
}
function updateCamera(dt,snap){
  const Wm=MW*T,Hm=MH*T;let tx=player.px+8-VW/2,ty=player.py+4-VH/2;tx=Math.max(0,Math.min(Wm-VW,tx));ty=Math.max(0,Math.min(Hm-VH,ty));
  const k=snap?1:1-Math.exp(-dt*7);camR.x+=(tx-camR.x)*k;camR.y+=(ty-camR.y)*k;if(snap){camR.x=tx;camR.y=ty}
  cam.x=Math.round(camR.x*Zd)/Zd;cam.y=Math.round(camR.y*Zd)/Zd;cam.x=Math.max(0,Math.min(Wm-VW,cam.x));cam.y=Math.max(0,Math.min(Hm-VH,cam.y));
}
const promptEl=$('prompt'),promptVerb=$('promptVerb');/* touch controls (joystick + action button): js/touch.js */
function updatePrompt(){
  const off=()=>{promptEl.classList.remove('on')};
  if(D.open||player.moving||G.paused)return off();
  const[x,y]=frontTile(player);const tg=targetAt(x,y);if(!tg)return off();
  const quest=isTargetRef(tg);promptEl.classList.toggle('quest',quest);promptVerb.textContent=quest?(tg.type==='npc'?'Talk':'Investigate'):(tg.type==='npc'?'Talk':'Inspect');
  const g=tg.type==='npc'?{cx:(tg.n.mode==='sit'?tg.n.x*T+16:tg.n.px+8),top:(tg.n.mode==='sit'?tg.n.y*T-12:tg.n.py-14)}:(()=>{const b=objBox(tg.o,time);return b?{cx:b.cx,top:b.top}:{cx:(tg.o.x+tg.o.w/2)*T,top:tg.o.y*T}})();
  const lift=quest?24:4;promptEl.style.left=((g.cx-cam.x)*Zd/dpr)+'px';promptEl.style.top=((g.top-lift-cam.y)*Zd/dpr)+'px';promptEl.classList.add('on');
}
let roomTimer=0;function showRoom(n){const el=$('room');$('roomName').textContent=n;el.classList.add('show');clearTimeout(roomTimer);roomTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function burst(x,y,col){const a=Math.random()*Math.PI*2,s=30+Math.random()*60;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,g:120,life:.8+Math.random()*.4,t:0,col,sz:Math.random()<.5?1:2})}
function puff(x,y){for(let i=0;i<3;i++)particles.push({x:x+(Math.random()*6-3),y,vx:(Math.random()-.5)*14,vy:-6-Math.random()*8,g:0,life:.4,t:0,col:'rgba(255,255,255,.55)',sz:2,fade:1})}

/* ---------- loop ---------- */
let last=0,raf=0,steamT=0,miniT=0;
function loop(now){
  raf=requestAnimationFrame(loop);if(!G)return;
  const dt=Math.max(0,Math.min(.05,(now-last)/1000||0));last=now;time+=dt;
  updatePlayer(dt);updateNPCs(dt);tickDialog(dt);updateCamera(dt);
  steamT-=dt;if(steamT<=0){steamT=.22;particles.push({x:41+Math.random()*4,y:468,vx:(Math.random()-.5)*4,vy:-10-Math.random()*6,g:0,life:1.4,t:0,col:'rgba(255,255,255,.5)',sz:Math.random()<.5?1:2,fade:1})}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.t+=dt;p.vy+=(p.g||0)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.t>p.life)particles.splice(i,1)}
  if(marker){marker.t+=dt;if(marker.t>.5)marker=null}
  render();updatePrompt();if(typeof Pad!=='undefined')Pad.frame();miniT-=dt;if(miniT<=0&&!mini.hidden){miniT=1/20;drawMini()}
}

/* =========================================================
   DIALOG (typewriter, dots, Next / Got it)
   ========================================================= */
const D={open:false,pages:[],i:0,shown:0,full:'',done:null,end:'Got it! ✓',speaker:null,typing:false,acc:0};
const dlg=$('dlg'),dName=$('dlgName'),dText=$('dlgText'),dDots=$('dlgDots'),dNext=$('dlgNext'),dPort=$('dlgPortrait'),dIcon=$('dlgIcon');
const SP=id=>{const n=npcAll.find(a=>a.id===id);return{name:n.name,pal:n.pal}};
const OBJ=(name,icon,tag='')=>({name,icon,tag});
function say({speaker,pages,end='Got it! ✓',onDone}){
  D.open=true;D.pages=pages;D.i=0;D.end=end;D.done=onDone||null;D.speaker=speaker;
  dlg.hidden=false;dlg.classList.remove('out','in');void dlg.offsetWidth;dlg.classList.add('in');dDots.innerHTML=pages.map(()=>'<i></i>').join('');showPage();sfx('open');
}
function drawPortrait(c,p,size){const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;const fr=sheet(p).down[0];g.drawImage(fr,0,0,18,22,1,-2,54,66)}
function setSpeaker(s){dName.textContent=(s.tag?s.tag+' ':'')+s.name;if(s.pal){dIcon.hidden=true;dPort.hidden=false;drawPortrait(dPort,s.pal)}else{dPort.hidden=true;dIcon.hidden=false;dIcon.textContent=s.icon||'💬'}}
function showPage(){
  const pg=D.pages[D.i],s=typeof pg==='string'?D.speaker:pg.s,t=typeof pg==='string'?pg:pg.t;setSpeaker(s);
  D.full=t;D.shown=0;D.acc=0;D.typing=true;D.voice=200+hash(s.name.length,s.name.charCodeAt(0))*260;
  [...dDots.children].forEach((d,k)=>d.classList.toggle('on',k===D.i));dNext.textContent=D.i===D.pages.length-1?D.end:'Next ▶';renderText();
}
function renderText(){dText.textContent=D.full.slice(0,D.shown);if(D.typing){const c=document.createElement('span');c.className='caret';dText.append(c)}}
function advance(){if(!D.open)return;if(D.typing){D.shown=D.full.length;D.typing=false;renderText();return}sfx('next');if(D.i<D.pages.length-1){D.i++;showPage()}else closeDialog()}
function closeDialog(){D.open=false;dlg.classList.remove('in');dlg.classList.add('out');const cb=D.done;setTimeout(()=>{if(!D.open)dlg.hidden=true},160);activeNpcs.forEach(n=>n.talking=false);inputLock=performance.now()+180;cb&&cb()}
function tickDialog(dt){if(!D.open||!D.typing)return;D.acc+=dt*50;const n=Math.floor(D.acc);if(n<=0)return;D.acc-=n;const b=D.shown;D.shown=Math.min(D.full.length,D.shown+n);for(let k=b;k<D.shown;k++)if(k%2===0&&/[a-z0-9]/i.test(D.full[k]))sfx('blip',D.voice);if(D.shown>=D.full.length)D.typing=false;renderText()}
dNext.addEventListener('click',e=>{e.stopPropagation();advance()});
dlg.addEventListener('click',e=>{if(e.target!==dNext)advance()});

/* =========================================================
   INTERACTION
   ========================================================= */
function interact(tg){
  if(tg.type==='npc'){
    const n=tg.n;n.talking=true;if(n.mode!=='sit')n.dir=opposite[player.dir];if(n.chat){const m=npc(n.chat);if(m)m.talking=true}
    if(n.id==='ada'&&allDone()&&!G.finished)return debrief();
    const t=tasksAtNpc(n).find(taskOpen);
    if(t){if(t.talk)return say({speaker:SP(n.id),pages:t.talk,end:"I'm on it ✓",onDone:()=>completeTask(t,null)});return openEncounter(t)}
    return talkDefault(n);
  }
  const o=tg.o,ts=tasksAtObj(o),open=ts.filter(taskOpen);
  if(open.length===1&&ts.length===1)return openEncounter(open[0]);
  if(ts.length>1&&ts.some(t=>!t.after||isDone(t.after)))return openHub(o);
  if(open.length===1)return openEncounter(open[0]);
  inspectDefault(o);
}
function talkDefault(n){
  const L=(...pages)=>say({speaker:SP(n.id),pages});
  const left=G.level.tasks.filter(t=>!isDone(t.id)).length;
  switch(n.id){
    case 'ada': if(left)L(`You have ${left} objective${left>1?'s':''} left. Follow the gold markers, or pick one from the list in the top right.`,"Inspect first, then decide. Take your time.");else L("Good work today. See you in the next module.");break;
    case 'mira': L("Good morning! Keep your badge visible at all times.","If anyone asks you to let them through a door, send them to me. Even if their hands are full.");break;
    case 'rex': G.talked.rex=1;L("Hey, fellow intern!","I clicked a link this morning that said I'd won a gift card. Then it asked for my password...","That's normal, right? ...Right?");break;
    case 'dev': L("Dev, IT Helpdesk. If an email looks weird, use the Report button.","Or call me on extension 4357. That spells HELP. And I'll never ask for your password.");break;
    case 'priya': L("Hi, I'm Priya from People & HR.","Our emails only ever come from @novacorp.com. Anything else, report it.");break;
    case 'hale': L("Hale. CFO. Busy day.","If anyone ever asks you to move money urgently and quietly, it isn't me.");break;
    case 'sam': case 'neha': say({pages:[{s:SP('sam'),t:"Did you hear? Someone in Sales got a call from 'IT' asking for their login code."},{s:SP('neha'),t:"Classic. Real IT never asks for your code."},{s:SP('sam'),t:"He nearly read it out. Then he remembered the training and hung up."}]});break;
    case 'arjun': L("The vending machine ate my coins again.","At least it doesn't ask for my password.");break;
    case 'courier': L("Just waiting on reception to sign me in. Lovely fish tank, isn't it?");break;
    case 'kiran': L("Can't talk, sprint demo in ten minutes.","Quick tip: hover over a link to see where it really goes.");break;
    case 'lena': L("I turned on MFA for every account last week. Took five minutes.");break;
    case 'omar': L("If an email feels off, it probably is.");break;
    case 'tess': L("Payroll changes only happen in the HR portal. Never over email.");break;
    case 'ravi': L("Onboarding forms live in the HR portal. We never send them as attachments.");break;
    default: L("Hello!");
  }
}
const FLAVOR={
  rack:['Server rack','🗄️',"Rows of blinking servers humming away. Best not to touch anything."],soc:['Security wall','🛡️',"A threat map, a blocked-email counter and a scrolling log."],tv:['Meeting screen','📈',"Q3 revenue: up eighteen percent."],
  meeting:['Meeting table','🪑',"Laptops, notepads and a conference phone."],execDesk:["CFO's desk",'🗂️',"A neat desk with a brass nameplate: R. HALE, CFO."],books:['Bookshelf','📚',"Policy binders. 'Acceptable Use Policy, v7'. Very thick."],
  cabinet:['Filing cabinet','🗄️',"Locked. As it should be."],plant:['Plant','🪴',"A very well-watered office plant."],cooler:['Water cooler','🚰',"Cold water, and the office's best gossip."],
  printer:['Printer','🖨️',"A big multifunction printer. Secure print is enabled. Mostly."],coffee:['Kitchen counter','☕',"The espresso machine hums. It smells like a long day ahead."],fridge:['Fridge','🧊',"A note on the door: 'Label your lunch. Yes, you, Rex.'"],
  vending:['Vending machine','🍫',"Snacks and drinks. Card only."],table:['Table','🍽️',"Someone left a coffee and a half-eaten samosa."],aquarium:['Fish tank','🐠',"Three very calm fish. They have not done their security training."],
  sofa:['Sofa','🛋️',"Comfy. Maybe too comfy for a work day."],trash:['Bin','🗑️',"Crumpled printouts. Sensitive papers belong in the shredder, not here."],desk:['Desk','🖥️',"A tidy desk. The screen is locked. Good habit."],
  myDesk:['Your desk','💻',"Your desk. The nameplate says NEW INTERN."],stickyDesk:["Someone's desk",'🖥️',"A colleague's desk."],devDesk:['Helpdesk','🖥️',"Dev's desk. Three monitors, two coffees, one rubber duck."],
  adaDesk:['Security console','📊',"Live dashboards: login attempts, blocked emails, open tickets."],notice:['Notice board','📋',"SECURITY WEEK: every day, a new module. Report anything odd to IT on ext. 4357."],
  reception:['Reception','🛎️',"Mira's desk. Visitors sign in here."],usb:['USB drive','💾',"You've already dealt with this drive."],laptop:['Laptop','💻',"The laptop is locked now."],phone:['Phone','📱',"Nothing new on this phone."],qr:['Poster','🍱',"'FREE LUNCH TODAY! Scan to claim your voucher.'"],
};
function inspectDefault(o){
  if(o.info==='reception')return talkDefault(npc('mira'));
  if(o.info==='devDesk'&&npc('dev'))return interact({type:'npc',n:npc('dev')});
  if(o.info==='clock'){const d=new Date();return say({speaker:OBJ('Wall clock','🕘'),pages:[`It reads ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}.`]})}
  const f=FLAVOR[o.info];if(!f)return;say({speaker:OBJ(f[0],f[1],o.info==='notice'?'📌':''),pages:[f[2]]});
}

/* ---------- tracker ---------- */
function renderTracker(){
  const lv=G.level,items=lv.tasks.map(t=>{const r=G.res[t.id];if(r)return`<button class="titem done ${r.o==='talk'?'safe':r.o}" type="button" disabled><i>${r.o==='talk'?'✓':OUT[r.o].icon}</i><span>${esc(t.label)}</span></button>`;
    if(!taskOpen(t))return`<button class="titem lock" type="button" disabled><i></i><span>${t.after&&lv.tasks.find(x=>x.id===t.after).enc&&lv.id==='executive'?'Locked: finish the previous stage':esc(t.label)}</span></button>`;
    return`<button class="titem todo" type="button" data-t="${t.id}"><i></i><span>${esc(t.label)}</span><small>Go</small></button>`});
  const fin=allDone()?(G.finished?`<button class="titem done safe" type="button" disabled><i>✓</i><span>Report back to Ada</span></button>`:`<button class="titem todo" type="button" data-t="debrief"><i></i><span>Report back to Ada</span><small>Go</small></button>`):`<button class="titem lock" type="button" disabled><i></i><span>Report back to Ada</span></button>`;
  $('tList').innerHTML=items.join('')+fin;
  $('tCount').textContent=`${lv.tasks.filter(t=>isDone(t.id)).length}/${lv.tasks.length}`;
}
$('tList').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(!b||!G||G.paused||D.open)return;audioInit();const id=b.dataset.t;
  const tg=id==='debrief'?{type:'npc',n:npc('ada')}:targetRef(G.level.tasks.find(t=>t.id===id));if(tg&&(tg.n||tg.o))walkToTarget(tg)});
$('tToggle').addEventListener('click',()=>{const t=$('tracker');t.classList.toggle('min');$('tToggle').textContent=t.classList.contains('min')?'+':'–'});
function toast(kind,text,icon,col){const t=$('toast');$('toastKind').textContent=kind;$('toastKind').style.color=col;$('toastText').textContent=text;const ic=$('toastIcon');ic.textContent=icon;ic.style.background=col+'26';ic.style.border=`2px solid ${col}`;ic.style.color=col;t.classList.remove('show');void t.offsetWidth;t.classList.add('show')}
function completeTask(t,rec){
  G.res[t.id]=rec||{o:'talk'};renderTracker();
  if(rec){const O=OUT[rec.o];toast(O.label,t.label,O.icon,O.col);if(rec.o==='safe'){sfx('found');for(let i=0;i<16;i++)burst(player.px+8,player.py-4,['#4ade80','#fbbf24','#ffffff'][i%3])}else if(rec.o==='compromise'){sfx('bad');const f=$('flash');f.classList.remove('on');void f.offsetWidth;f.classList.add('on')}else sfx('next')}
  else sfx('quest');
  if(allDone()&&!G.finished)setTimeout(()=>toast('All objectives done','Report back to Ada','★','#fbbf24'),rec?2300:400);
}

/* =========================================================
   MODALS: encounter, hub, results, confirm
   ========================================================= */
const modal=$('modal');let modalClosable=false;
function openModal(html,closable){modal.innerHTML=html;modal.hidden=false;modalClosable=!!closable;G&&(G.paused=true);held.length=0;path=[];const f=modal.querySelector('button:not([disabled]):not(.icon-btn)');f&&setTimeout(()=>f.focus({preventScroll:true}),40)}
function closeModal(){modal.hidden=true;modal.innerHTML='';if(G)G.paused=false;inputLock=performance.now()+200}
modal.addEventListener('pointerdown',e=>{if(e.target===modal&&modalClosable)closeModal()});
const CHN={email:'Email',sms:'Text message',call:'Phone call',chat:'Chat',mfa:'MFA prompt',object:'Inspect',person:'In person'};
function sceneCanvas(e){
  const c=mk(140,140),g=c.getContext('2d');g.imageSmoothingEnabled=false;let spr;const a=e.art;
  if(a.npc){spr=sheet(P[a.npc]).down[0];g.drawImage(spr,0,0,spr.width,spr.height,(140-spr.width*4.5)/2,4,spr.width*4.5,spr.height*4.5);return c}
  if(a.sprite==='qr'){const p=painter(g);p.rr(30,10,80,120,4,'#f8fafc');p.r(30,10,80,26,'#f97316');p.txt('FREE',70,30,`800 16px ${UIF}`,'#fff','center');p.txt('LUNCH TODAY!',70,52,`800 11px ${UIF}`,'#c2410c','center');g.save();g.translate(70,94);g.rotate(-.12);p.r(-24,-24,48,48,'#fffef0');for(let j=0;j<12;j++)for(let i=0;i<12;i++)if(hash(i+3,j+7)>.5||(i<3&&j<3)||(i>8&&j<3)||(i<3&&j>8))p.r(-21+i*3.5,-21+j*3.5,3.5,3.5,'#111827');g.restore();return c}
  spr={usb:PROPS.usb[0],laptop:PROPS.laptop[0],printer:PROPS.printer[0],sticky:deskFrames('sticky','')[0]}[a.sprite];
  if(spr){const k=Math.min(120/spr.width,110/spr.height);g.imageSmoothingEnabled=k<2.5;g.drawImage(spr,(140-spr.width*k)/2,(140-spr.height*k)/2,spr.width*k,spr.height*k)}return c;
}
function artHTML(e){
  const a=e.art;
  if(e.ch==='email'){const ini=a.from.split(/\s+/).map(w=>w[0]).filter(c=>/[A-Za-z]/.test(c)).slice(0,2).join('').toUpperCase();
    const body=a.body.map(p=>p==='{link}'?`<p><a class="mlink" data-hl="link" data-href="${esc(a.link.h)}" tabindex="0">${esc(a.link.t)}</a></p>`:`<p>${esc(p)}</p>`).join('');
    return`<div class="mail"><div class="bar"><i></i><i></i><i></i><span>NovaMail · Inbox</span></div><div class="hd"><div class="subj">${esc(a.subj)}</div><div class="from"><span class="av" style="background:${a.av}">${esc(ini)}</span><div><b>${esc(a.from)}</b> <span class="addr" data-hl="addr">&lt;${esc(a.addr)}&gt;</span><br><small>to me · ${esc(a.time)}</small></div></div></div><div class="bd" data-hl="body">${body}${a.attach?`<div class="att" data-hl="attach">📎 ${esc(a.attach.n)} · ${esc(a.attach.s)}</div>`:''}</div><div class="status" id="mstatus">${a.link?'Hover over a link to see where it really goes':''}</div></div>`}
  if(e.ch==='sms')return`<div class="phone"><div class="scr"><div class="sbar"><span>1:32</span><span>5G ▮▮▮</span></div><div class="who2" ><span data-hl="addr">${esc(a.from)}<small>${esc(a.num)}</small></span></div><div data-hl="body" style="display:flex;flex-direction:column;gap:8px"><div class="bub">${esc(a.text)} <a data-hl="link" data-href="https://${esc(a.link)}">${esc(a.link)}</a></div></div></div></div>`;
  if(e.ch==='call')return`<div class="phone"><div class="scr"><div class="sbar"><span>2:47</span><span>5G ▮▮▮</span></div><div class="call"><div class="cav">${esc(a.caller[0])}</div><b>${esc(a.caller)}</b><span class="num" data-hl="addr">${esc(a.num)}</span><small style="color:#4ade80;font:600 11px/1 ${UIF}">On call · 00:${String(12+a.lines.length*9).padStart(2,'0')}</small><div class="lines" data-hl="body">${a.lines.map((l,i)=>`<div class="bub" style="animation-delay:${i*.5}s">${esc(l)}</div>`).join('')}</div></div></div></div>`;
  if(e.ch==='chat')return`<div class="chatw ${a.wa?'wa':''}"><div class="ch"><span class="av" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.25);display:grid;place-items:center">${esc(a.from[0])}</span><div><span data-hl="addr">${esc(a.from)} <span class="ext">${esc(a.badge)}</span></span><small>${esc(a.app)}</small></div></div><div class="msgs" data-hl="body">${a.msgs.map((m,i)=>`<div class="bub" style="animation-delay:${i*.45}s">${esc(m)}</div>`).join('')}</div></div>`;
  if(e.ch==='mfa')return`<div class="phone"><div class="scr" data-hl="body"><div class="sbar"><span>2:14</span><span>5G ▮▮▮</span></div><div style="text-align:center;color:#e2e8f0;font:300 44px/1 ${UIF};margin:6px 0 4px">2:14</div>${Array.from({length:a.count},(_,i)=>`<div class="notif" style="animation-delay:${i*.25}s"><b>NovaCorp SSO</b>Approve sign-in request? · <span data-hl="loc">${esc(a.loc)}</span>${i===0?'<div class="btns"><span>Deny</span><span>Approve</span></div>':''}</div>`).join('')}</div></div>`;
  return`<div class="scene"><span id="sceneSlot"></span><div class="say" data-hl="body">${a.npc?`<div class="nm">${esc(npcAll.find(n=>n.id===a.npc).name)}</div>${a.lines.map((l,i)=>`<div class="bub" style="animation-delay:${i*.4}s">${esc(l)}</div>`).join('')}`:`<div class="desc">${esc(a.desc)}</div>`}</div></div>`;
}
function shuffleSeed(arr,seed){const a=arr.map((x,i)=>({x,k:hash(seed,i)}));a.sort((p,q)=>p.k-q.k);return a.map(p=>p.x)}
function openEncounter(t){
  const e=t.enc,lv=G.level,sc=scoredTasks(lv),n=sc.indexOf(t)+1,t0=performance.now();let used=0;const seen=[];
  const acts=shuffleSeed(e.acts,t.id.charCodeAt(0)*31+t.id.length+(G.attempt||0));
  openModal(`<div class="mcard" role="dialog" aria-label="${esc(e.title)}"><div class="mhead"><span class="chip">${CHN[e.ch]}</span><h3>${esc(e.title)}</h3><span class="step-n">Scenario ${n} of ${sc.length}</span><button class="icon-btn" type="button" id="encX" aria-label="Step away">✕</button></div>
   <div class="encb"><div class="art">${artHTML(e)}</div><div class="side"><div><h4>Inspect</h4><div class="ibtns" id="encIns">${e.inspect.map((s,i)=>`<button class="ibtn" type="button" data-i="${i}">🔍 ${esc(s.l)}</button>`).join('')}</div></div>
   <div><h4>What you've noticed</h4><ul class="clues" id="encClues"><li class="none">Inspect to reveal clues before you decide.</li></ul></div>
   <div><h4>Decide</h4><div class="acts" id="encActs">${acts.map((a,i)=>`<button class="act" type="button" data-a="${e.acts.indexOf(a)}">${esc(a.l)}</button>`).join('')}</div></div></div></div></div>`,true);
  const slot=modal.querySelector('#sceneSlot');if(slot)slot.replaceWith(sceneCanvas(e));
  const st=modal.querySelector('#mstatus');modal.querySelectorAll('[data-href]').forEach(a=>{const show=()=>{if(st){st.textContent='→ '+a.dataset.href}};a.addEventListener('mouseenter',show);a.addEventListener('focus',show);a.addEventListener('click',ev=>{ev.preventDefault();show();a.animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:260})});a.addEventListener('mouseleave',()=>{if(st&&!a.classList.contains('hl-red')&&!a.classList.contains('hl-green'))st.textContent='Hover over a link to see where it really goes'})});
  $('encX').addEventListener('click',closeModal);
  $('encIns').addEventListener('click',ev=>{const b=ev.target.closest('[data-i]');if(!b||b.classList.contains('used'))return;b.classList.add('used');used++;seen.push(+b.dataset.i);const s=e.inspect[+b.dataset.i];sfx('click');
    const ul=$('encClues');ul.querySelector('.none')?.remove();const li=document.createElement('li');li.className=s.f?'red':'green';li.innerHTML=`<i>${s.f?'!':'✓'}</i><span></span>`;li.querySelector('span').textContent=s.c;ul.append(li);
    if(s.hl)modal.querySelectorAll(`[data-hl="${s.hl}"]`).forEach(el=>{el.classList.remove('hl-red','hl-green');void el.offsetWidth;el.classList.add(s.f?'hl-red':'hl-green')});
    if(s.hl==='link'&&st){const l=modal.querySelector('[data-hl="link"][data-href]');if(l)st.textContent='→ '+l.dataset.href}});
  $('encActs').addEventListener('click',ev=>{const b=ev.target.closest('[data-a]');if(!b)return;const ai=+b.dataset.a,a=e.acts[ai],meta={insp:used,seen:seen.slice(),ms:Math.round(performance.now()-t0)};
    try{onDecision(lv.id,t,{act:ai,o:a.o,inspected:meta.seen,ms:meta.ms})}catch(err){console.warn('onDecision failed',err)}showVerdict(t,a,meta)});
}
function showVerdict(t,a,meta){
  const e=t.enc,O=OUT[a.o];modalClosable=false;sfx(a.o==='safe'?'quest':a.o==='compromise'?'bad':'next');
  const card=modal.querySelector('.mcard');
  card.innerHTML=`<div class="mhead"><span class="chip">${CHN[e.ch]}</span><h3>${esc(e.title)}</h3></div><div class="result"><div class="verdict v-${a.o}"><div class="big">${O.icon}</div><div><h3>${O.label}</h3><p>${esc(a.fb)}</p></div></div>
   <div><h4 style="margin:0 0 8px;font:800 10px/1 ${UIF};letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">${e.legit?'Why this one was genuine':'Red flags to look for'}</h4><ul class="clues">${e.inspect.map(s=>`<li class="${s.f?'red':'green'}"><i>${s.f?'!':'✓'}</i><span>${esc(s.c)}</span></li>`).join('')}</ul></div>
   <div class="lesson"><small>REMEMBER</small>${esc(e.lesson)}</div><div class="rfoot"><button class="btn" type="button" id="encDone">Continue ▶</button></div></div>`;
  $('encDone').addEventListener('click',()=>{closeModal();completeTask(t,{o:a.o,insp:meta.insp,seen:meta.seen,ms:meta.ms,act:e.acts.indexOf(a)})});$('encDone').focus({preventScroll:true});
}
function openHub(o){
  const ts=tasksAtObj(o).filter(t=>!t.after||isDone(t.after));const ch=ts[0].enc.ch;
  const title=o.id==='myDesk'?(ch==='call'?'Your desk phone':'Your inbox'):o.id==='execDesk'?"Assistant's workstation":'Messages';
  openModal(`<div class="mcard sm" style="padding:0"><div class="mhead"><span class="chip">${ch==='call'?'Phone':'Inbox'}</span><h3>${title}</h3><button class="icon-btn" type="button" id="hubX" aria-label="Close">✕</button></div><div class="hub">${ts.map(t=>{const r=G.res[t.id],a=t.enc.art;return`<button type="button" data-t="${t.id}" class="${r?'dn':''}" ${r?'disabled':''}><span class="dot"></span><span style="min-width:0"><b>${esc(a.subj||t.enc.title)}</b><small>${esc(a.from||a.caller||'')}${r?' · '+OUT[r.o].label:''}</small></span></button>`}).join('')}</div></div>`,true);
  $('hubX').addEventListener('click',closeModal);
  modal.querySelector('.hub').addEventListener('click',ev=>{const b=ev.target.closest('[data-t]');if(!b)return;const t=G.level.tasks.find(x=>x.id===b.dataset.t);openEncounter(t)});
}
function summary(){
  const sc=scoredTasks(G.level),outs=sc.map(t=>G.res[t.id]);const score=Math.round(outs.reduce((s,r)=>s+OUT[r.o].pts,0)/sc.length*100);
  return{score,stars:score>=90?3:score>=70?2:1,outcomes:Object.fromEntries(sc.map(t=>[t.id,G.res[t.id].o])),
    safe:outs.filter(r=>r.o==='safe').length,compromise:outs.filter(r=>r.o==='compromise').length,falseAlarm:outs.filter(r=>r.o==='false_alarm').length,
    inspected:outs.reduce((s,r)=>s+(r.insp||0),0),timeMs:Date.now()-G.startAt};
}
function debrief(){
  const s=summary(),n=scoredTasks(G.level).length;
  const pages=[`That's everything. You handled ${s.safe} of ${n} situations in the safest way.`,
    s.compromise?`${s.compromise} choice${s.compromise>1?'s':''} would have led to a real compromise. The results screen shows what to watch for.`:"Not a single compromise. That's exactly what we want to see.",
    s.falseAlarm?"You also flagged something genuine. Careful is good, but verifying is better than refusing.":"And you trusted the genuine requests. Security isn't about saying no to everything.",
    s.inspected>=n*2?"I noticed you inspected before deciding. Keep that habit.":"Next time, inspect a bit more before you decide. The clues are always there."];
  say({speaker:SP('ada'),pages,end:'See my results ✓',onDone:()=>{G.finished=true;renderTracker();showResults(s)}});
}
function starStr(n){return'★'.repeat(n)+'<i>'+'★'.repeat(3-n)+'</i>'}
function showResults(s){
  sfx('win');const lv=G.level,C=2*Math.PI*56;
  openModal(`<div class="mcard sm res"><div class="eyebrow">Level ${lv.n} complete</div><div class="score"><svg width="132" height="132" viewBox="0 0 132 132"><circle cx="66" cy="66" r="56" fill="none" stroke="#1b2a22" stroke-width="12"/><circle cx="66" cy="66" r="56" fill="none" stroke="${s.score>=70?'#22c55e':'#f59e0b'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 66 66)" id="scoreArc"/></svg><b>${s.score}%</b></div>
   <h2>${esc(lv.title)}</h2><div class="stars">${starStr(s.stars)}</div>
   <ul>${scoredTasks(lv).map(t=>{const o=OUT[G.res[t.id].o];return`<li><i style="background:${o.col}">${o.icon}</i><span>${esc(t.label)}</span><small>${o.label}</small></li>`}).join('')}</ul>
   <div class="saved" id="savedNote">Saving your result…</div><button class="btn wide" type="button" id="resBack">Back to my training</button><button class="btn ghost wide" type="button" id="resReplay" style="margin-top:8px">Replay level</button></div>`,false);
  requestAnimationFrame(()=>{const arc=$('scoreArc');arc.style.transition='stroke-dashoffset 1.2s cubic-bezier(.2,.9,.25,1)';arc.style.strokeDashoffset=C*(1-s.score/100)});
  confettiGo();
  Promise.resolve(onLevelComplete(lv.id,s)).then(r=>{const el=$('savedNote');if(!el)return;
    if(r&&typeof r.score==='number'&&r.score!==s.score){/* the server's score is the record */s.score=r.score;s.stars=r.stars;const b=modal.querySelector('.res .score b'),arc=$('scoreArc'),st=modal.querySelector('.res .stars');if(b)b.textContent=r.score+'%';if(arc){arc.style.strokeDashoffset=C*(1-r.score/100);arc.setAttribute('stroke',r.score>=70?'#22c55e':'#f59e0b')}if(st)st.innerHTML=starStr(r.stars)}
    el.textContent=r&&r.saved?'Saved to your training record.':(r&&r.msg)||'Practice run: this result was not saved.';el.classList.toggle('ok',!!(r&&r.saved))});
  $('resBack').addEventListener('click',()=>{closeModal();stopGame()});$('resReplay').addEventListener('click',()=>{closeModal();startLevel(lv.id,G.opts)});
}
$('exitBtn').addEventListener('click',()=>{if(!G)return;if(D.open)closeDialog();
  if(G.finished)return stopGame();
  openModal(`<div class="mcard sm"><div class="eyebrow">Leave level?</div><h2 style="font:700 22px/1.2 var(--display);margin:8px 0">Leave ${esc(G.level.title)}?</h2><p style="color:var(--text-2);font:500 13.5px/1.5 var(--ui);margin:0 0 16px">This attempt won't be saved. You can start the level again from your training page.</p><div class="rfoot"><button class="btn ghost" type="button" id="cfStay">Keep playing</button><button class="btn" type="button" id="cfLeave">Leave level</button></div></div>`,true);
  $('cfStay').addEventListener('click',closeModal);$('cfLeave').addEventListener('click',()=>{closeModal();stopGame()})});
$('sndBtn').addEventListener('click',()=>{audioInit();setSound(!A.on)});

function confettiGo(){
  const c=$('confetti'),g=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;
  const Pp=[...Array(140)].map(()=>({x:innerWidth/2+(Math.random()-.5)*200,y:innerHeight*.35,vx:(Math.random()-.5)*900,vy:-Math.random()*700-200,r:Math.random()*6.28,vr:(Math.random()-.5)*12,s:5+Math.random()*5,c:['#22c55e','#4ade80','#fbbf24','#60a5fa','#f472b6','#ffffff'][(Math.random()*6)|0]}));
  const t0=performance.now();(function f(n){const dt=1/60,el=(n-t0)/1000;g.clearRect(0,0,c.width,c.height);for(const p of Pp){p.vy+=900*dt;p.vx*=.99;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=p.vr*dt;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;g.globalAlpha=Math.max(0,1-el/3.2);g.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);g.restore()}if(el<3.3)requestAnimationFrame(f);else g.clearRect(0,0,c.width,c.height)})(t0);
}

/* =========================================================
   AUDIO
   ========================================================= */
const A={ctx:null,master:null,music:null,fx:null,on:true,nb:null,next:0,step:0,timer:0};
try{if(localStorage.getItem('pv-sound')==='0')A.on=false}catch(e){}
function audioInit(){
  if(A.ctx){A.ctx.state==='suspended'&&A.ctx.resume&&A.ctx.resume();return}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{A.ctx=new C()}catch(e){return}
  A.master=A.ctx.createGain();A.master.gain.value=A.on?.5:0;A.master.connect(A.ctx.destination);
  A.music=A.ctx.createGain();A.music.gain.value=.15;const lp=A.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2400;A.music.connect(lp);lp.connect(A.master);
  A.fx=A.ctx.createGain();A.fx.gain.value=.5;A.fx.connect(A.master);
  const len=A.ctx.sampleRate*.5;A.nb=A.ctx.createBuffer(1,len,A.ctx.sampleRate);const d=A.nb.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  A.next=A.ctx.currentTime+.1;A.timer=setInterval(schedule,40);
}
const mf=m=>440*Math.pow(2,(m-69)/12);
function tone(f,dur,type,vol,when,dest,glide){if(!A.ctx)return;const t=Math.max(A.ctx.currentTime,when||A.ctx.currentTime),o=A.ctx.createOscillator(),g=A.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(glide)o.frequency.exponentialRampToValueAtTime(glide,t+dur);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(dest||A.fx);o.start(t);o.stop(t+dur+.05)}
function noise(dur,vol,freq,when,dest){if(!A.ctx)return;const t=when||A.ctx.currentTime,s=A.ctx.createBufferSource();s.buffer=A.nb;const f=A.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=.8;const g=A.ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(dest||A.fx);s.start(t);s.stop(t+dur+.02)}
const CH=[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]];
function schedule(){if(!A.ctx)return;const sp=60/94/4;if(!G){A.next=Math.max(A.next,A.ctx.currentTime);return}
  while(A.next<A.ctx.currentTime+.25){const s=A.step%16,bar=Math.floor(A.step/16)%4,c=CH[bar],t=A.next;
    if(s===0){c.forEach(m=>tone(mf(m),sp*15,'sine',.05,t,A.music));tone(mf(c[0]-24),sp*6,'triangle',.22,t,A.music)}
    if(s===8)tone(mf(c[0]-24),sp*5,'triangle',.18,t,A.music);if(s===14)tone(mf(c[2]-24),sp*2,'triangle',.14,t,A.music);
    if(s%2===0){const arp=[0,1,2,3,2,1,3,2][s/2];tone(mf(c[arp]+12),sp*1.6,'triangle',.07,t,A.music)}
    if(s%4===2)noise(.04,.05,8000,t,A.music);if(s===4||s===12)noise(.08,.07,1800,t,A.music);A.next+=sp;A.step++}}
function sfx(k,v){if(!A.ctx||!A.on)return;const t=A.ctx.currentTime;switch(k){
  case 'blip':tone(v||320,.045,'square',.035,t);break;case 'open':tone(660,.07,'triangle',.12,t);tone(990,.09,'triangle',.1,t+.06);break;case 'next':tone(520,.05,'triangle',.08,t);break;
  case 'step':noise(.035,.05,v||900,t);break;case 'bump':tone(120,.08,'square',.06,t,null,80);break;case 'click':tone(880,.05,'triangle',.06,t);break;
  case 'quest':[523,659,784].forEach((f,i)=>tone(f,.18,'triangle',.12,t+i*.08));break;case 'found':[659,784,988,1319].forEach((f,i)=>tone(f,.2,'square',.05,t+i*.07));tone(1319,.4,'triangle',.08,t+.28);break;
  case 'bad':tone(220,.25,'sawtooth',.06,t,null,110);tone(165,.35,'square',.05,t+.12,null,90);break;case 'win':[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,.22,'square',.05,t+i*.1));break}}
function setSound(on){A.on=on;if(A.master)A.master.gain.setTargetAtTime(on?.5:0,A.ctx.currentTime,.05);$('sndWave').style.display=on?'':'none';try{localStorage.setItem('pv-sound',on?'1':'0')}catch(e){}}
$('sndWave').style.display=A.on?'':'none';

/* =========================================================
   START / STOP
   ========================================================= */
/* Hooks the portal sets: level start, each decision as it's chosen, and the results screen. */
let onLevelComplete=()=>({saved:false}),onLevelStart=()=>{},onDecision=()=>{};
function startLevel(id,opts={}){
  const lv=levelById(id);if(!lv)return;
  G={level:lv,res:{},startAt:Date.now(),paused:false,opts,talked:{},finished:false,room:null,attempt:(opts.attempt||0)};
  try{onLevelStart(id,opts)}catch(err){console.warn('onLevelStart failed',err)}
  rebuildSolid();
  activeNpcs=npcAll.filter(n=>!n.def.levels||n.def.levels.includes(id));
  for(const n of activeNpcs){const d=n.def;n.place(d.x,d.y,d.dir);n.mode=d.mode||'stand';n.area=d.area||null;n.talking=false;n.wanderT=undefined;n.idleT=undefined}
  player.place(lv.start.x,lv.start.y,lv.start.dir);path=[];pendingAct=null;held.length=0;particles.length=0;
  $('portal').hidden=true;$('game').hidden=false;modal.hidden=true;dlg.hidden=true;D.open=false;
  $('lvlName').textContent=`Level ${lv.n} · ${lv.title}`;$('tracker').classList.toggle('min',innerWidth<560);$('tToggle').textContent=innerWidth<560?'+':'–';renderTracker();resize();updateCamera(0,true);
  if(!miniBase)buildMini();
  G.room=roomAt(player.x,player.y);showRoom(G.room.n);audioInit();
  setTimeout(()=>{if(G&&G.level===lv)say({speaker:OBJ('NovaCorp HQ','🏢'),pages:lv.intro,end:"Let's go ✓"})},450);
  if(!raf){last=performance.now();raf=requestAnimationFrame(loop)}
  window.scrollTo(0,0);
}
function stopGame(){G=null;D.open=false;dlg.hidden=true;modal.hidden=true;$('game').hidden=true;$('portal').hidden=false;cancelAnimationFrame(raf);raf=0;if(window.onGameExit)window.onGameExit()}
