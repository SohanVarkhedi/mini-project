/* =========================================================
   CONTENT: world objects, NPCs. Levels and scenarios live in content/levels.json
   ========================================================= */
const objects=[];
function addObj(kind,x,y,w,h,o={}){
  const ob=Object.assign({kind,x,y,w,h,frames:o.frames||PROPS[kind],fps:0,layer:'y',dx:0,dy:0,zb:0,solid:true,phase:Math.random()*10},o);
  objects.push(ob);return ob;
}
function desk(x,y,type,acc,o={}){const d=addObj('desk',x,y,2,1,Object.assign({frames:deskFrames(type,acc||''),fps:2,info:'desk'},o));addObj('chairUp',x,y+1,1,1,{dx:8,noShadow:true});return d}
function placeObjects(){
  objects.length=0;
  /* IT */
  for(let i=1;i<=5;i++)addObj('rack',i,3,1,1,{frames:PROPS.rack.map((_,k)=>PROPS.rack[(k+i*2)%6]),fps:3,info:'rack'});
  for(let i=1;i<=3;i++)addObj('rack',i,7,1,1,{frames:PROPS.rack.map((_,k)=>PROPS.rack[(k+i*3+1)%6]),fps:4,info:'rack'});
  addObj('soc',8,1,6,2,{layer:'wall',fps:2,dy:3,info:'soc',solid:false});
  desk(9,5,'dash','lamp',{id:'adaDesk',info:'adaDesk'});
  addObj('cabinet',1,11,1,1,{info:'cabinet'});addObj('cabinet',2,11,1,1,{info:'cabinet'});
  addObj('plant',13,11,1,1,{fps:1,info:'plant'});addObj('snake',13,3,1,1,{fps:.7,info:'plant'});
  /* Executive */
  addObj('meeting',21,6,5,2,{id:'meeting',info:'meeting'});
  for(let i=0;i<5;i++){addObj('chairDown',21+i,5,1,1,{noShadow:true});addObj('chairUp',21+i,8,1,1,{noShadow:true})}
  addObj('tv',22,1,3,2,{layer:'wall',fps:1.5,dy:2,info:'tv',solid:false});
  addObj('bookshelf',30,3,2,1,{info:'books'});
  addObj('execDesk',28,10,3,1,{id:'execDesk',info:'execDesk'});addObj('chairDown',29,9,1,1,{noShadow:true,solid:true});
  addObj('bigPlant',16,3,1,1,{fps:.8,info:'plant'});addObj('bigPlant',32,12,1,1,{fps:.8,info:'plant'});addObj('snake',16,12,1,1,{fps:.7,info:'plant'});
  addObj('laptop',25,7,1,1,{id:'laptop',dy:-12,zb:2,solid:false,levels:['orientation'],info:'laptop'});
  /* HR */
  desk(36,5,'mail','plant');desk(39,5,'code','papers');
  addObj('bookshelf',43,3,2,1,{info:'books'});
  for(let i=0;i<4;i++)addObj('cabinet',46+i,3,1,1,{info:'cabinet'});
  addObj('sofa',45,11,3,1,{id:'hrSofa',info:'sofa'});
  addObj('plant',34,3,1,1,{fps:1,info:'plant'});addObj('bigPlant',50,12,1,1,{fps:.8,info:'plant'});addObj('snake',34,12,1,1,{fps:.7,info:'plant'});
  addObj('phone',46,11,1,1,{id:'phoneHR',dy:-14,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  /* Open office */
  desk(2,18,'code','lamp');desk(9,18,'mail','plant');desk(12,18,'code','phone',{id:'devDesk',info:'devDesk'});
  desk(17,18,'dash','papers');desk(20,18,'mail','plant');desk(27,18,'code','lamp');desk(30,18,'mail','');
  desk(35,18,'mail','plant');desk(38,18,'off','papers');desk(44,18,'code','lamp');desk(47,18,'dash','plant');
  desk(2,22,'mail','papers');desk(9,22,'sticky','',{id:'stickyDesk',info:'stickyDesk'});desk(12,22,'off','plant');
  desk(17,22,'code','');desk(20,22,'off','lamp');desk(27,22,'mine','phone',{id:'myDesk',info:'myDesk'});desk(30,22,'chart','plant');
  desk(35,22,'off','lamp');desk(38,22,'code','papers');desk(44,22,'mail','');desk(47,22,'off','plant');
  addObj('cooler',33,16,1,1,{fps:3,info:'cooler'});
  addObj('printer',48,16,2,1,{id:'printer',fps:1.2,info:'printer'});
  addObj('bookshelf',45,16,2,1,{info:'books'});
  addObj('bigPlant',1,16,1,1,{fps:.8,info:'plant'});addObj('plant',50,26,1,1,{fps:1,info:'plant'});addObj('snake',1,26,1,1,{fps:.7,info:'plant'});addObj('bigPlant',15,16,1,1,{fps:.8,info:'plant'});addObj('plant',32,26,1,1,{fps:1,info:'plant'});
  addObj('trash',14,19,1,1,{info:'trash'});addObj('trash',33,23,1,1,{info:'trash'});
  addObj('clock',14,14,1,1,{layer:'wall',solid:false,dy:6,dx:0,info:'clock'});
  /* Cafeteria */
  addObj('counter',2,30,6,1,{info:'coffee'});addObj('fridge',8,30,1,1,{info:'fridge'});addObj('vending',11,30,2,1,{fps:1.5,info:'vending'});
  [[4,34],[12,34],[17,36]].forEach(([x,y],i)=>{addObj('table',x,y,2,1,{info:'table',id:'cafeTable'+i});addObj('stool',x-1,y,1,1,{frames:[PROPS.stool[i%3]],info:'table'});addObj('stool',x+2,y,1,1,{frames:[PROPS.stool[(i+1)%3]],info:'table'})});
  addObj('bigPlant',1,30,1,1,{fps:.8,info:'plant'});addObj('plant',20,38,1,1,{fps:1,info:'plant'});addObj('snake',1,38,1,1,{fps:.7,info:'plant'});addObj('trash',19,30,1,1,{info:'trash'});
  addObj('qr',15,29,2,1,{id:'qr',layer:'none',solid:false,info:'qr',frames:null,hl:{x:15*T+3,y:28*T,w:26,h:31}});
  addObj('usb',8,37,1,1,{id:'usb',info:'usb',dy:-4,levels:['orientation']});
  addObj('phone',12,34,1,1,{id:'phoneCafe',dy:-12,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  /* Lobby */
  addObj('reception',25,33,5,1,{id:'reception',info:'reception'});
  addObj('aquarium',45,30,2,1,{fps:4,info:'aquarium'});
  addObj('notice',31,36,2,1,{id:'notice',info:'notice'});
  addObj('sofa',42,37,3,1,{id:'lobbySofa',info:'sofa'});addObj('armchair',47,36,1,1,{info:'sofa',dx:4});addObj('coffeeTable',42,35,3,1,{info:'table',dx:8,noShadow:false});
  addObj('phone',43,37,1,1,{id:'phoneLobby',dy:-14,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  addObj('bigPlant',22,30,1,1,{fps:.8,info:'plant'});addObj('bigPlant',50,30,1,1,{fps:.8,info:'plant'});addObj('snake',22,38,1,1,{fps:.7,info:'plant'});addObj('plant',50,38,1,1,{fps:1,info:'plant'});addObj('plant',32,30,1,1,{fps:1,info:'plant'});addObj('plant',39,30,1,1,{fps:1,info:'plant'});
}
const objById=id=>objects.find(o=>o.id===id);

/* ---------- people ---------- */
const P={
  you:pal({...sk('med'),hairStyle:'messy',tie:'#c8363d',lanyard:true}),
  ada:pal({...sk('dark'),hair:'#18120f',hairH:'#3a2a22',hairS:'#0e0a08',hairStyle:'curly',glasses:true,coat:'#1d6f69',coatS:'#165450',coatH:'#2a8f87',shirt:'#f4f1e6',lanyard:true,pants:'#25272f'}),
  mira:pal({...sk('light'),hair:'#7a3b22',hairH:'#a0563a',hairS:'#5a2a18',hairStyle:'long',coat:'#8e2f45',coatS:'#6e2234',coatH:'#a8455d',shirt:'#fbeee6',skirt:true,pants:'#3a3d48',pantsS:'#2c2f38'}),
  rex:pal({...sk('light'),hair:'#d9a441',hairH:'#f0c46a',hairS:'#a8782a',hairStyle:'spiky',coat:'#6b7280',coatS:'#525863',coatH:'#848b97',tie:'#e0b52c',pants:'#3b3f4a'}),
  dev:pal({...sk('brown'),hair:'#141010',hairStyle:'short',glasses:true,coat:'#3f6b3a',coatS:'#30542c',coatH:'#4f8449',shirt:'#cfe3f5',pants:'#3a3a40'}),
  priya:pal({...sk('tan'),hair:'#15100e',hairH:'#33261f',hairStyle:'bun',coat:'#5a4b8a',coatS:'#463a6d',coatH:'#6e5ea5',shirt:'#f6f1ff',skirt:true,pants:'#2b2f45',pantsS:'#1f2236'}),
  hale:pal({...sk('light'),hair:'#a7adb5',hairH:'#d1d5db',hairS:'#7d838b',hairStyle:'gray',coat:'#30333a',coatS:'#23252b',coatH:'#454952',tie:'#2f4a8a',pants:'#26282e'}),
  sam:pal({...sk('med'),hair:'#5a3a24',hairH:'#7a5638',hairStyle:'short',coat:'#b39a74',coatS:'#937c5a',coatH:'#c8b18c',tie:'#6b3f22',pants:'#4a4237'}),
  neha:pal({...sk('tan'),hair:'#1a1210',hairH:'#382820',hairStyle:'long',coat:'#2e5d8a',coatS:'#234a6f',coatH:'#3c74a8',shirt:'#ffffff',skirt:true,pants:'#2b2e38'}),
  arjun:pal({...sk('brown'),hair:'#1b1412',hairStyle:'messy',coat:'#40444f',coatS:'#30333c',coatH:'#525764',tie:'#9b2c2c',pants:'#2b2e38'}),
  courier:pal({...sk('med'),hair:'#3a2a20',hairStyle:'cap',cap:'#c0392b',coat:'#8a5a2b',coatS:'#6e4620',coatH:'#a26c35',shirt:'#e8d7b5',pants:'#3b5b8a',pantsS:'#2e4870',box:true}),
  kiran:pal({...sk('brown'),hair:'#211816',hairStyle:'short',coat:'#344054',coatS:'#273041',coatH:'#465670',tie:'#22c55e'}),
  lena:pal({...sk('light'),hair:'#e6c27a',hairH:'#f6dca3',hairStyle:'long',coat:'#a14d7a',coatS:'#813d61',coatH:'#bb6392',skirt:true}),
  omar:pal({...sk('tan'),hair:'#1a1412',hairStyle:'short',coat:'#4b5563',coatS:'#3a424e',coatH:'#5d6878',tie:'#3b82f6'}),
  tess:pal({...sk('dark'),hair:'#120d0b',hairStyle:'bun',coat:'#c26a2b',coatS:'#9c5420',coatH:'#d9823f'}),
  ravi:pal({...sk('med'),hair:'#2a1d18',hairStyle:'messy',coat:'#2e6b5a',coatS:'#235446',coatH:'#3a8571',tie:'#f5b941'}),
  vik:pal({...sk('tan'),hair:'#2a1d18',hairStyle:'cap',cap:'#2563eb',coat:'#1e3a8a',coatS:'#172d6b',coatH:'#2747a6',shirt:'#e5e7eb',vest:'#f59e0b',pants:'#334155'}),
  kabir:pal({...sk('brown'),hair:'#1a1210',hairStyle:'short',coat:'#475569',coatS:'#334155',coatH:'#64748b',tie:'#0ea5e9',lanyard:true}),
  zoe:pal({...sk('light'),hair:'#3b2416',hairH:'#5c3a24',hairStyle:'long',coat:'#0f766e',coatS:'#0b5c56',coatH:'#14928a',skirt:true,lanyard:true}),
};
const NPCDEF=[
  {id:'ada',name:'Ada Okoye',x:11,y:8,dir:'down'},
  {id:'mira',name:'Mira',x:27,y:32,dir:'down'},
  {id:'rex',name:'Rex',x:22,y:21,dir:'down',mode:'wander',area:[14,20,26,7]},
  {id:'dev',name:'Dev',x:12,y:19,dir:'up',mode:'sit'},
  {id:'priya',name:'Priya',x:44,y:7,dir:'down'},
  {id:'hale',name:'Mr. Hale',x:28,y:5,dir:'down'},
  {id:'sam',name:'Sam',x:32,y:17,dir:'right',chat:'neha'},
  {id:'neha',name:'Neha',x:34,y:17,dir:'left',chat:'sam'},
  {id:'arjun',name:'Arjun',x:12,y:31,dir:'up'},
  {id:'courier',name:'Courier',x:44,y:33,dir:'left',mode:'wander',area:[38,31,12,6]},
  {id:'kiran',name:'Kiran',x:2,y:19,dir:'up',mode:'sit'},
  {id:'lena',name:'Lena',x:17,y:19,dir:'up',mode:'sit'},
  {id:'omar',name:'Omar',x:44,y:19,dir:'up',mode:'sit'},
  {id:'tess',name:'Tess',x:38,y:23,dir:'up',mode:'sit'},
  {id:'ravi',name:'Ravi',x:36,y:6,dir:'up',mode:'sit'},
  {id:'vik',name:'"Vik" (CoolAir)',x:5,y:17,dir:'up',levels:['access']},
  {id:'kabir',name:'Kabir',x:24,y:34,dir:'right',levels:['access']},
  {id:'zoe',name:'Zoe',x:15,y:33,dir:'down',levels:['access']},
];

/* ---------- outcome scale + levels: content/levels.json, loaded via js/content-data.js ---------- */
if(!window.PV_CONTENT)throw new Error('js/content-data.js is missing. Run: python scripts/build_content.py');
const OUT=window.PV_CONTENT.outcomes;
const LEVELS=window.PV_CONTENT.levels;
const levelById=id=>LEVELS.find(l=>l.id===id);
const scoredTasks=lv=>lv.tasks.filter(t=>t.enc);
