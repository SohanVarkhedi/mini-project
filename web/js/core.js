'use strict';
/* =========================================================
   PhishVerse · core: map, characters, hi-res props, world
   Logic grid: 16 units per tile. Props + world drawn at R=2.
   ========================================================= */
if(!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){r=Math.max(0,Math.min(+r||0,w/2,h/2));this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath()}}
const T=16, R=2, TR=T*R, MW=52, MH=40;
const VOID=0, CAP=1, FACE=2, CARPET=10, ITF=11, WOOD=12, HRC=13, CAFE=14, MARBLE=15;
const tiles=new Uint8Array(MW*MH), baseSolid=new Uint8Array(MW*MH), solid=new Uint8Array(MW*MH);
const idx=(x,y)=>y*MW+x, inb=(x,y)=>x>=0&&y>=0&&x<MW&&y<MH;
const tileAt=(x,y)=>inb(x,y)?tiles[idx(x,y)]:CAP;
const isWallT=t=>t===CAP||t===FACE||t===VOID;
const setT=(x,y,t)=>{if(inb(x,y))tiles[idx(x,y)]=t};
const fillT=(x,y,w,h,t)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)setT(x+i,y+j,t)};
const hwall=(x,y,w)=>{for(let i=0;i<w;i++){setT(x+i,y,CAP);setT(x+i,y+1,FACE);setT(x+i,y+2,FACE)}};
const vwall=(x,y,h)=>{for(let j=0;j<h;j++)setT(x,y+j,CAP)};
const DOORS=[{x:6,y:13,w:2},{x:24,y:13,w:2},{x:41,y:13,w:2},{x:9,y:27,w:2},{x:33,y:27,w:6}];
function buildMap(){
  fillT(1,3,14,10,ITF);fillT(16,3,17,10,WOOD);fillT(34,3,17,10,HRC);
  fillT(1,16,50,11,CARPET);fillT(1,30,20,9,CAFE);fillT(22,30,29,9,MARBLE);
  hwall(0,0,52);hwall(0,13,52);hwall(0,27,52);
  vwall(15,3,10);vwall(33,3,10);vwall(21,30,9);fillT(0,39,52,1,CAP);
  fillT(6,13,2,3,CARPET);fillT(24,13,2,3,CARPET);fillT(41,13,2,3,CARPET);fillT(9,27,2,3,CAFE);fillT(33,27,6,3,MARBLE);
  vwall(0,0,40);vwall(51,0,40);
  for(let i=0;i<MW*MH;i++)baseSolid[i]=isWallT(tiles[i])?1:0;
}
const ROOMS=[
  {n:'IT & Server Room',x:1,y:3,w:14,h:10,c:'#c3c9d0'},
  {n:'Executive Suite',x:16,y:3,w:17,h:10,c:'#a8774f'},
  {n:'People & HR',x:34,y:3,w:17,h:10,c:'#b39a7f'},
  {n:'Open Office',x:1,y:13,w:50,h:14,c:'#58687f'},
  {n:'Cafeteria',x:1,y:27,w:20,h:12,c:'#cfe0d8'},
  {n:'Lobby',x:22,y:27,w:29,h:12,c:'#e3e0da'},
];
const roomAt=(x,y)=>ROOMS.find(r=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h);

/* ---------- helpers ---------- */
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c};
const hash=(a,b=0)=>{let h=(a*374761393+b*668265263)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296};
const hexRGB=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
function outline(c,col='#1b1524',th=140){
  const g=c.getContext('2d'),W=c.width,H=c.height,d=g.getImageData(0,0,W,H),a=d.data,o=new Uint8ClampedArray(a),[Rr,G,B]=hexRGB(col);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(a[i+3]>20)continue;
    const n=(xx,yy)=>xx>=0&&yy>=0&&xx<W&&yy<H&&a[(yy*W+xx)*4+3]>th;
    if(n(x-1,y)||n(x+1,y)||n(x,y-1)||n(x,y+1)){o[i]=Rr;o[i+1]=G;o[i+2]=B;o[i+3]=255}}
  g.putImageData(new ImageData(o,W,H),0,0);return c;
}
/* painter used for both 1x sprites and hi-res props */
function painter(g){
  return {g,
    r(x,y,w,h,c){g.fillStyle=c;g.fillRect(x,y,w,h)},
    p(x,y,c){g.fillStyle=c;g.fillRect(x,y,1,1)},
    rr(x,y,w,h,r,c){g.fillStyle=c;g.beginPath();g.roundRect(x,y,w,h,r);g.fill()},
    vg(x,y,w,h,c1,c2,r=0){const gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,c1);gr.addColorStop(1,c2);g.fillStyle=gr;if(r){g.beginPath();g.roundRect(x,y,w,h,r);g.fill()}else g.fillRect(x,y,w,h)},
    hg(x,y,w,h,c1,c2,r=0){const gr=g.createLinearGradient(x,0,x+w,0);gr.addColorStop(0,c1);gr.addColorStop(1,c2);g.fillStyle=gr;if(r){g.beginPath();g.roundRect(x,y,w,h,r);g.fill()}else g.fillRect(x,y,w,h)},
    el(cx,cy,rx,ry,c,rot=0){g.fillStyle=c;g.beginPath();g.ellipse(cx,cy,Math.max(.1,rx),Math.max(.1,ry),rot,0,Math.PI*2);g.fill()},
    ln(x1,y1,x2,y2,c,w=1){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()},
    poly(pts,c){g.fillStyle=c;g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.closePath();g.fill()},
    txt(s,x,y,font,c,al='left'){g.font=font;g.fillStyle=c;g.textAlign=al;g.textBaseline='alphabetic';g.fillText(s,x,y)},
    disc(cx,cy,rad,c){for(let yy=-rad;yy<=rad;yy++)for(let xx=-rad;xx<=rad;xx++)if(xx*xx+yy*yy<=rad*rad+rad*.8){g.fillStyle=c;g.fillRect(cx+xx,cy+yy,1,1)}},
  };
}
/* hi-res prop: w,h in hi-res px; 1px outline margin */
function H(w,h,fn,ol=true){const c=mk(w+2,h+2),g=c.getContext('2d');g.translate(1,1);fn(painter(g));return ol?outline(c,'#201b2a',110):c}
/* 1x sprite */
function S(w,h,fn,ol=true){const c=mk(w+2,h+2),g=c.getContext('2d');g.translate(1,1);fn(painter(g));return ol?outline(c):c}
const mirror=c=>{const m=mk(c.width,c.height),g=m.getContext('2d');g.translate(c.width,0);g.scale(-1,1);g.drawImage(c,0,0);return m};
const FONT={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','&':'010101010101011','!':'010010010000010','?':'110001010000010','0':'010101101101010','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100110101010','7':'111001010010010','8':'010101010101010','9':'010101011001110',' ':'000000000000000','-':'000000111000000','.':'000000000000010',':':'000010000010000','%':'101001010100101','$':'011110010011110'};
function ptext(g,str,x,y,col,k=1){g.fillStyle=col;let cx=x;for(const ch of str){const gl=FONT[ch]||FONT[' '];for(let i=0;i<15;i++)if(gl[i]==='1')g.fillRect(cx+(i%3)*k,y+((i/3)|0)*k,k,k);cx+=4*k}}
const UIF="Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

/* =========================================================
   CHARACTERS (chibi, 16x24 base, 4 dirs × 4 frames + sit)
   ========================================================= */
const BASE={skin:'#eab48c',skinS:'#c98d68',hair:'#2a1c18',hairS:'#1a110f',hairH:'#4a332b',coat:'#2b3d68',coatS:'#1f2c4f',coatH:'#3e5590',shirt:'#f5f4ef',tie:null,pants:'#2b2e38',pantsS:'#1e2028',shoe:'#151219',hairStyle:'short',skirt:false,glasses:false,lanyard:false,cap:null,vest:null,box:false};
const pal=o=>Object.assign({},BASE,o);
const SKIN={light:['#f6d0ad','#dca784'],med:['#eab48c','#c98d68'],tan:['#c98d62','#a76d47'],brown:['#9c6644','#7d4e32'],dark:['#74482f','#5a3522']};
const sk=k=>({skin:SKIN[k][0],skinS:SKIN[k][1]});
function charFrame(p,view,f){
  const c=mk(18,28),g=c.getContext('2d');
  const O=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x+1,y+3,w,h)};
  const step=(f===1||f===3),sit=view==='sit',b=sit?0:(step?-1:0);
  const EYE='#1c1a2a',BL='#ee9b88',MO='#9d4f48',GL='#2b2b36',hs=p.hairStyle,hr=p.hair,hh=p.hairH,hsd=p.hairS;
  if(view==='down'||view==='up'){
    const lU=f===1?1:0,rU=f===3?1:0;
    if(p.skirt){O(5,21,2,1-lU,p.skin);O(5,22-lU,2,2,p.shoe);O(9,21,2,1-rU,p.skin);O(9,22-rU,2,2,p.shoe);O(4,19,8,2,p.pants);O(4,20,8,1,p.pantsS)}
    else{O(5,19,2,3-lU,p.pants);O(7,19,1,3-lU,p.pantsS);O(5,22-lU,3,2,p.shoe);O(9,19,2,3-rU,p.pants);O(8,19,1,3-rU,p.pantsS);O(8,22-rU,3,2,p.shoe);if(view==='down'){O(5,22-lU,1,1,'#3d3848');O(8,22-rU,1,1,'#3d3848')}}
  }
  if(view==='left'){
    if(!step){if(p.skirt){O(6,21,3,1,p.skin);O(5,22,4,2,p.shoe)}else{O(6,19,3,3,p.pants);O(8,19,1,3,p.pantsS);O(5,22,5,2,p.shoe)}}
    else{const fr=f===1?p.pants:p.pantsS,bk=f===1?p.pantsS:p.pants;if(p.skirt){O(5,21,2,1,p.skin);O(4,22,3,2,p.shoe);O(9,21,2,1,p.skin);O(9,21,3,1,p.shoe)}else{O(9,19,2,2,bk);O(9,21,3,2,p.shoe);O(5,19,2,3,fr);O(4,22,3,2,p.shoe)}}
    if(p.skirt){O(5,19,6,2,p.pants);O(5,20,6,1,p.pantsS)}
  }
  O(5,13+b,6,6,p.coat);O(10,13+b,1,6,p.coatS);O(5,18+b,6,1,p.coatS);
  if(view==='left'){O(5,13+b,1,2,p.shirt);if(p.tie)O(5,15+b,1,2,p.tie)}
  else if(view==='down'){O(7,13+b,2,3,p.shirt);if(p.tie){O(7,14+b,2,4,p.tie);O(8,15+b,1,3,'rgba(0,0,0,.18)')}O(6,13+b,1,3,p.coatH);O(9,13+b,1,3,p.coatH);
    if(p.vest){O(5,15+b,6,3,p.vest);O(5,16+b,6,1,'#f8fafc')}
    if(p.lanyard){O(6,13+b,1,3,'#1f9d63');O(9,16+b,2,2,'#f1f5f3');O(9,16+b,2,1,'#22c55e')}}
  else{O(6,13+b,4,1,p.shirt);O(8,16+b,1,3,p.coatS)}
  if(view==='left'){
    if(f===1){O(6,13+b,2,4,p.coatS);O(4,17+b,2,1,p.skin);O(5,16+b,2,1,p.coatS)}
    else if(f===3){O(8,13+b,2,4,p.coatS);O(10,17+b,2,1,p.skin);O(9,16+b,2,1,p.coatS)}
    else{O(7,13+b,2,5,p.coatS);O(7,18+b,2,1,p.skin)}
  }else if(sit){const t=f%2;O(3,13,2,3,p.coat);O(11,13,2,3,p.coat);O(4,15,2,1,p.coatS);O(10,15,2,1,p.coatS);O(5,14+t,1,1,p.skin);O(10,15-t,1,1,p.skin)}
  else{const la=f===1?4:f===3?6:5,ra=f===1?6:f===3?4:5;O(3,13+b,2,la,p.coat);O(3,13+b,1,la,p.coatS);O(3,13+b+la,2,1,p.skin);O(11,13+b,2,ra,p.coat);O(12,13+b,1,ra,p.coatS);O(11,13+b+ra,2,1,p.skin)}
  if(p.box&&view==='down'){O(4,14+b,8,6,'#c08a4e');O(4,14+b,8,1,'#d9a466');O(7,14+b,2,6,'#e8d3a8')}
  O(7,12+b,2,1,p.skinS);
  if(view==='down'){
    if(hs==='long'){O(2,3+b,2,11,hsd);O(12,3+b,2,11,hsd)}
    O(4,3+b,8,1,p.skin);O(3,4+b,10,6,p.skin);O(4,10+b,8,1,p.skin);O(5,11+b,6,1,p.skinS);O(2,7+b,1,2,p.skin);O(13,7+b,1,2,p.skin);
    O(5,7+b,2,2,EYE);O(9,7+b,2,2,EYE);O(5,7+b,1,1,'#ffffff');O(9,7+b,1,1,'#ffffff');O(4,9+b,1,1,BL);O(11,9+b,1,1,BL);O(7,10+b,2,1,MO);
    if(p.glasses){O(4,6+b,4,1,GL);O(8,6+b,4,1,GL);O(4,7+b,1,2,GL);O(11,7+b,1,2,GL);O(7,7+b,2,1,GL)}
  }else if(view==='left'){
    O(4,3+b,7,1,p.skin);O(3,4+b,8,6,p.skin);O(4,10+b,6,1,p.skin);O(5,11+b,4,1,p.skinS);O(2,7+b,1,2,p.skin);O(4,7+b,2,2,EYE);O(4,7+b,1,1,'#ffffff');O(6,9+b,1,1,BL);O(3,10+b,2,1,MO);
    if(p.glasses){O(3,6+b,4,1,GL);O(3,7+b,1,2,GL);O(6,7+b,4,1,GL)}
  }else{O(2,6+b,1,2,p.skin);O(13,6+b,1,2,p.skin);O(5,10+b,6,2,p.skinS)}
  hair(O,view,hs,hr,hh,hsd,b,p);
  return outline(c);
}
function hair(O,v,s,hr,hh,hd,b,p){
  if(s==='cap'){
    if(v==='down'){O(3,0+b,10,4,p.cap);O(2,4+b,12,1,'#7d1f1a');O(3,5+b,1,2,hr);O(12,5+b,1,2,hr);O(6,1+b,4,2,'#f4f4f4')}
    else if(v==='left'){O(3,0+b,10,4,p.cap);O(1,4+b,6,1,'#7d1f1a');O(8,4+b,4,5,hr);O(9,6+b,1,2,p.skin)}
    else{O(3,0+b,10,4,p.cap);O(3,4+b,10,6,hr);O(5,10+b,6,1,hr)}
    return;
  }
  if(v==='down'){
    if(s==='curly'){O(2,-1+b,12,5,hr);O(3,-2+b,3,1,hr);O(7,-2+b,3,1,hr);O(1,1+b,2,7,hr);O(13,1+b,2,7,hr);O(3,4+b,3,1,hr);O(10,4+b,3,1,hr);O(4,-1+b,2,1,hh);O(9,0+b,2,1,hh);O(2,6+b,1,2,hd);O(13,6+b,1,2,hd)}
    else if(s==='gray'){O(3,1+b,10,2,hr);O(4,0+b,8,1,hr);O(2,3+b,2,5,hr);O(12,3+b,2,5,hr);O(5,1+b,4,1,hh);O(6,9+b,4,1,hr)}
    else{O(3,0+b,10,4,hr);O(4,-1+b,8,1,hr);O(2,2+b,2,5,hr);O(12,2+b,2,4,hr);O(3,4+b,10,1,hr);O(3,5+b,2,1,hr);O(7,5+b,1,1,hr);O(11,5+b,2,1,hr);O(5,0+b,3,1,hh);O(10,1+b,1,1,hh);O(3,3+b,1,1,hd);
      if(s==='messy'){O(5,-2+b,2,1,hr);O(9,-2+b,2,1,hr);O(1,3+b,1,2,hr);O(14,3+b,1,2,hr);O(6,5+b,1,1,hr);O(9,5+b,1,1,hr)}
      if(s==='spiky'){O(4,-2+b,1,1,hr);O(7,-3+b,2,2,hr);O(11,-2+b,1,1,hr);O(6,-1+b,2,1,hh)}
      if(s==='bun'){O(6,-4+b,4,3,hr);O(7,-4+b,2,1,hh)}
      if(s==='long'){O(2,3+b,2,10,hr);O(12,3+b,2,10,hr);O(2,12+b,2,1,hd);O(12,12+b,2,1,hd)}}
  }else if(v==='left'){
    if(s==='curly'){O(2,-1+b,12,5,hr);O(3,-2+b,4,1,hr);O(8,-2+b,4,1,hr);O(8,4+b,6,6,hr);O(3,4+b,3,1,hr);O(5,-1+b,2,1,hh)}
    else if(s==='gray'){O(4,1+b,8,2,hr);O(9,3+b,4,6,hr);O(3,9+b,3,1,hr);O(9,6+b,1,2,p.skinS)}
    else{O(3,0+b,10,4,hr);O(4,-1+b,8,1,hr);O(8,4+b,5,6,hr);O(12,3+b,1,5,hr);O(3,4+b,3,1,hr);O(9,6+b,1,2,p.skin);O(6,0+b,3,1,hh);
      if(s==='messy'){O(5,-2+b,2,1,hr);O(10,-2+b,2,1,hr);O(13,3+b,1,3,hr);O(2,3+b,1,1,hr)}
      if(s==='spiky'){O(5,-3+b,2,2,hr);O(9,-2+b,2,1,hr)}
      if(s==='bun'){O(10,-2+b,4,4,hr);O(11,-2+b,2,1,hh)}
      if(s==='long'){O(8,4+b,5,10,hr);O(9,13+b,4,1,hd)}}
  }else{
    if(s==='gray'){O(4,0+b,8,3,p.skin);O(3,3+b,10,6,hr);O(4,9+b,8,1,hr)}
    else if(s==='curly'){O(2,-1+b,12,10,hr);O(3,-2+b,4,1,hr);O(8,-2+b,4,1,hr);O(3,9+b,10,1,hr);O(5,0+b,3,1,hh)}
    else{O(3,0+b,10,10,hr);O(4,-1+b,8,1,hr);O(4,10+b,8,1,hr);O(5,1+b,3,1,hh);O(9,2+b,1,1,hh);O(6,9+b,4,1,hd);
      if(s==='messy'){O(5,-2+b,2,1,hr);O(9,-2+b,2,1,hr);O(2,3+b,1,2,hr);O(13,3+b,1,2,hr)}
      if(s==='spiky'){O(7,-3+b,2,2,hr);O(4,-2+b,1,1,hr);O(11,-2+b,1,1,hr)}
      if(s==='bun'){O(6,-4+b,4,3,hr);O(7,-4+b,2,1,hh)}
      if(s==='long'){O(3,10+b,10,5,hr);O(3,14+b,10,1,hd)}}
  }
}
const sheetCache=new Map();
function sheet(p){
  if(sheetCache.has(p))return sheetCache.get(p);
  const s={down:[],left:[],right:[],up:[],sit:[]};
  for(let f=0;f<4;f++){s.down.push(charFrame(p,'down',f));s.up.push(charFrame(p,'up',f));const l=charFrame(p,'left',f);s.left.push(l);s.right.push(mirror(l))}
  s.sit.push(charFrame(p,'sit',0),charFrame(p,'sit',1));sheetCache.set(p,s);return s;
}

/* =========================================================
   HI-RES PROPS (R=2: 32px per tile)
   ========================================================= */
function screenHi(o,x,y,w,h,type,f){
  if(type==='mail'||type==='sticky'||type==='mine'){o.r(x,y,w,h,'#f1f5f9');o.r(x,y,w,2,'#2563eb');o.r(x,y+2,4,h-2,'#e2e8f0');for(let i=0;i<3;i++)o.r(x+5,y+4+i*3,w-7,2,i===f%3?'#bfdbfe':'#d5dde7');if(f%2)o.r(x+w-3,y+4,2,2,'#ef4444')}
  else if(type==='code'){o.r(x,y,w,h,'#0f172a');const L=[11,7,14,9,12,6,10],C=['#4ade80','#7dd3fc','#fbbf24','#c4b5fd'];for(let i=0;i<4;i++)o.r(x+2+(i%2)*2,y+2+i*3,Math.min(w-4,L[(i+f)%7]),1,C[(i+f)%4]);if(f%2)o.r(x+3,y+h-2,2,1,'#fff')}
  else if(type==='dash'){o.r(x,y,w,h,'#0b1220');for(let i=0;i<6;i++){const hh=2+((i*3+f)%(h-4));o.r(x+2+i*3,y+h-1-hh,2,hh,i%2?'#4ade80':'#60a5fa')}o.r(x+2,y+2,7,1,'#e5e7eb')}
  else if(type==='chart'){o.r(x,y,w,h,'#0b1220');let py=y+h-3;for(let i=0;i<w-3;i+=2){const ny=y+3+((Math.sin((i+f*3)*.5)+1)*(h-7)/2);o.ln(x+1+i,py,x+3+i,ny,'#4ade80',1);py=ny}}
  else{o.r(x,y,w,h,'#0b1220');o.rr(x+w/2-2,y+h/2-3,5,6,1,f%2?'#22c55e':'#15803d')}
}
function monHi(o,x,y,w,h,type,f){
  o.rr(x,y,w,h,2,'#1b1f27');screenHi(o,x+1,y+1,w-2,h-4,type,f);o.r(x,y+h-3,w,3,'#14171d');o.r(x+w/2-.5,y+h-2,1,1,'#4ade80');
  o.poly([x+w-7,y+1,x+w-2,y+1,x+w-10,y+h-4,x+w-15,y+h-4],'rgba(255,255,255,.06)');
  o.r(x+w/2-1,y+h,2,4,'#4b5260');o.rr(x+w/2-5,y+h+3,10,2,1,'#3b414b');
}
const ALT={mail:'code',code:'dash',dash:'mail',off:'off',sticky:'mail',mine:'mail',chart:'mail'};
function deskHi(type,acc,f){return H(64,60,o=>{
  o.vg(3,40,3,19,'#a3abb5','#7b838d');o.vg(58,40,3,19,'#a3abb5','#7b838d');o.r(1,57,7,2,'#5d646d');o.r(56,57,7,2,'#5d646d');
  o.vg(6,40,52,12,'#c6ccd3','#9aa2ac');o.r(6,40,52,1,'#d9dee3');
  o.rr(1,0,62,17,3,'#5d7189');o.vg(2,1,60,14,'#7a8ea6','#62768d',2);o.r(1,0,62,2,'#cfd6de');
  for(let i=0;i<46;i++)o.p(3+((hash(i,7)*58)|0),3+((hash(i,9)*12)|0),'rgba(255,255,255,.10)');
  o.vg(0,16,64,25,'#ecd8b8','#d9bb92');o.r(0,16,64,1,'#f7ead6');
  for(let i=0;i<4;i++)o.r(2+((hash(i,3)*20)|0),20+i*5,20+((hash(i,4)*30)|0),1,'rgba(150,110,70,.14)');
  o.vg(0,41,64,4,'#b38f64','#94734d');
  monHi(o,7,1,23,15,type,f);monHi(o,34,1,23,15,ALT[type]||'mail',(f+1)%4);
  o.rr(19,28,26,7,1.5,'#f1f3f5');o.r(19,34,26,1,'#c3c8cf');for(let r=0;r<3;r++)for(let c=0;c<12;c++)o.r(20+c*2,29+r*2,1,1,'#c9ced5');
  o.rr(47,27,9,10,2,'#2b3440');o.rr(50,29,3,5,1.5,'#eef1f4');
  o.rr(4,24,6,7,1.5,'#fafafa');o.r(5,24,4,1,'#6b4226');o.rr(10,26,2,3,1,'#e5e7eb');
  if(acc==='phone'||type==='mine'){o.rr(3,32,13,8,2,'#2a2e36');o.rr(3,30,4,10,2,'#1b1e24');o.r(9,33,6,2,'#7dd3fc');for(let i=0;i<3;i++)for(let j=0;j<2;j++)o.r(9+i*2,36+j*2,1,1,'#9aa3ad')}
  if(acc==='plant'){o.rr(55,24,7,7,2,'#e7e5df');o.el(58.5,21,4,3,'#3f8a49');o.el(56,19,2,3.5,'#5fb36b',-.5);o.el(61,19,2,3.5,'#5fb36b',.5)}
  if(acc==='lamp'){o.el(58,31,4,1.6,'#2b2f36');o.ln(58,30,55,19,'#3a3f48',1.5);o.el(53,19,4.5,2.5,'#2b2f36');o.el(53,22,6,2.5,'rgba(255,230,160,.35)')}
  if(acc==='papers'){o.r(52,21,10,12,'#fbfaf6');o.r(53,22,10,12,'#f1efe8');for(let i=0;i<4;i++)o.r(55,25+i*2,6,1,'#c9c4b5')}
  if(type==='mine'){o.rr(21,37,22,4,1,'#c9a45c');o.r(24,38,16,1,'#7a5a1a')}
  if(type==='sticky'){o.r(50,2,7,7,'#ffe066');o.r(51,4,5,1,'#b38f00');o.r(51,6,4,1,'#b38f00')}
})}
const PROPS={};
const deskCache={};
const deskFrames=(t,a)=>deskCache[t+a]||(deskCache[t+a]=[0,1,2,3].map(f=>deskHi(t,a,f)));
PROPS.chairUp=[H(28,34,o=>{o.r(4,30,20,2,'#25272e');o.el(4,32,2,1.5,'#111');o.el(24,32,2,1.5,'#111');o.el(14,33,2,1.5,'#111');o.vg(12,22,4,8,'#9aa1aa','#6b727b');o.rr(1,14,26,10,4,'#323a4b');o.rr(0,11,4,9,1.5,'#262c38');o.rr(24,11,4,9,1.5,'#262c38');o.vg(4,0,20,21,'#4a5570','#2d3446',6);for(let i=0;i<6;i++)o.r(6,4+i*3,16,1,'rgba(255,255,255,.06)');o.r(7,2,14,1,'rgba(255,255,255,.25)');o.r(6,15,16,2,'#262c39')})];
PROPS.chairDown=[H(28,34,o=>{o.r(4,30,20,2,'#25272e');o.el(4,32,2,1.5,'#111');o.el(24,32,2,1.5,'#111');o.el(14,33,2,1.5,'#111');o.vg(12,22,4,8,'#9aa1aa','#6b727b');o.vg(4,0,20,13,'#3c4560','#2c3346',5);o.r(7,2,14,1,'rgba(255,255,255,.2)');o.vg(1,11,26,13,'#56617c','#3c4459',5);o.r(4,12,20,1,'rgba(255,255,255,.2)');o.rr(0,9,4,10,1.5,'#262c38');o.rr(24,9,4,10,1.5,'#262c38')})];
PROPS.plant=[0,1].map(s=>H(28,48,o=>{
  const L=[[8,24,8,3.5,.45,'#2f6e3a'],[20,24,8,3.5,-.45,'#2f6e3a'],[6,17,8,3.2,.85,'#3c8848'],[22,17,8,3.2,-.85,'#3c8848'],[10,10,7,3,1.2,'#4a9a55'],[18,10,7,3,-1.2,'#4a9a55'],[14,6,3.5,7,0,'#5cb565'],[14,18,4,9,0,'#3c8848'],[11,20,6,2.6,.2,'#4a9a55'],[17,21,6,2.6,-.2,'#4a9a55']];
  for(const[cx,cy,rx,ry,rot,c]of L){const dx=cy<14?s:0;o.el(cx+dx,cy,rx,ry,c,rot);o.el(cx+dx-rx*.25*Math.cos(rot),cy-1,rx*.5,ry*.35,'rgba(160,230,150,.25)',rot)}
  o.vg(6,31,16,17,'#f6f4ef','#cfcac0',3);o.rr(4,29,20,4,2,'#fdfcf9');o.r(6,29,16,1,'#5b4030');o.r(17,33,3,14,'rgba(0,0,0,.06)');
}));
PROPS.bigPlant=[0,1].map(s=>H(36,68,o=>{
  o.ln(18,48,15,22,'#5b4630',2);o.ln(18,48,23,26,'#5b4630',2);o.ln(18,48,18,12,'#5b4630',1.5);
  const L=[[9,40,7,10,.9,'#2c6b37'],[27,38,7,10,-.9,'#2c6b37'],[7,27,7,10,.6,'#357a40'],[29,25,7,10,-.6,'#357a40'],[12,15,7,10,.35,'#3f8a49'],[25,13,7,10,-.35,'#3f8a49'],[18,6,6,9,0,'#4a9a55'],[18,30,6,9,.1,'#357a40']];
  for(const[cx,cy,rx,ry,rot,c]of L){const dx=cy<20?s:0;o.el(cx+dx,cy,rx,ry,c,rot);o.ln(cx+dx-Math.sin(rot)*ry*.8,cy+Math.cos(rot)*ry*.8,cx+dx+Math.sin(rot)*ry*.7,cy-Math.cos(rot)*ry*.7,'rgba(180,230,160,.35)',.8)}
  o.vg(8,48,20,20,'#9aa2a8','#6b7379',3);o.rr(6,46,24,4,2,'#b4bbc0');o.r(9,48,18,1,'#4a3a2a');o.r(22,50,3,16,'rgba(0,0,0,.08)');
}));
PROPS.snake=[0,1].map(s=>H(22,46,o=>{
  const LV=[[4,30,6,'#3d7a45'],[8,34,0,'#2f6b3a'],[12,32,3,'#468a4e'],[16,28,-4,'#2f6b3a'],[10,24,-1,'#5a9a5a']];
  for(const[x,hgt,lean,c]of LV){const tx=x+lean+(s&&hgt>29?1:0);o.poly([x-2,34,x+2,34,tx+.5,34-hgt,tx-.5,34-hgt],c);o.ln(x-2,34,tx-.5,34-hgt,'#d4c35a',.6)}
  o.vg(4,32,14,14,'#33353c','#1e2025',2);o.rr(3,31,16,3,1,'#44474f');
}));
PROPS.bookshelf=[H(64,68,o=>{
  o.vg(0,0,64,68,'#8b603b','#6b4729');o.r(0,0,64,3,'#a87a50');o.r(3,3,58,62,'#3a281a');
  const C=['#b91c1c','#1d4ed8','#15803d','#ca8a04','#7e22ce','#c2410c','#e5e7eb','#0f766e','#9f1239','#334155'];
  [3,24,45].forEach((sy,si)=>{let x=4,k=si*31;const lim=si===0?46:si===1?50:58;
    while(x<lim){const bw=3+((hash(k,1)*3)|0),bh=12+((hash(k,2)*5)|0),col=C[(hash(k,3)*C.length)|0];o.r(x,sy+19-bh,bw,bh,col);o.r(x,sy+19-bh,bw,1,'rgba(255,255,255,.3)');o.r(x,sy+15-((hash(k,5)*6)|0),bw,1,'rgba(255,255,255,.25)');x+=bw+(hash(k,4)>.85?2:0);k++}
    o.r(3,sy+19,58,3,'#7d5634');o.r(3,sy+19,58,1,'#9a6f47');});
  o.rr(50,9,8,7,2,'#e7e5df');o.el(54,7,4,3,'#4a9a55');o.el(52,5,2,3,'#5cb565',-.4);
  o.r(53,30,6,10,'#d9b44a');o.el(56,30,4,2.5,'#f0d070');o.r(55,40,3,2,'#8a6a1a');
  o.r(0,65,64,3,'#4f331d');
})];
PROPS.cabinet=[H(28,48,o=>{o.vg(0,0,28,48,'#c3cad2','#9aa3ad',2);o.r(0,0,28,2,'#e1e6ea');for(let i=0;i<3;i++){const y=4+i*14;o.rr(2,y,24,12,1.5,'#b2bac3');o.r(2,y+11,24,1,'#8a929c');o.rr(10,y+5,8,2,1,'#5e666f');o.r(11,y+1,6,3,'#f1f5f9')}o.r(23,2,2,46,'rgba(0,0,0,.06)')})];
PROPS.printer=[0,1].map(f=>H(60,56,o=>{
  o.vg(2,26,56,30,'#d5d9de','#b4bac2',2);o.r(4,35,52,1,'#9aa1aa');o.r(4,45,52,1,'#9aa1aa');for(let i=0;i<3;i++)o.rr(24,29+i*10,12,2,1,'#7b838d');
  o.vg(0,8,60,20,'#f3f4f6','#d3d7dc',3);o.vg(4,0,52,10,'#e2e5e9','#c8ccd2',2);o.r(8,3,40,2,'#7dd3fc');
  o.rr(8,13,30,7,1,'#ffffff');o.r(10,15,24,1,'#d1d5db');o.r(10,17,18,1,'#d1d5db');
  o.rr(43,10,14,10,2,'#1f2937');o.r(45,12,10,6,'#3b82f6');o.r(46,13,5,1,'#bfdbfe');o.el(40,14,1.6,1.6,f?'#4ade80':'#14532d');o.r(0,24,60,2,'#22c55e');
}));
PROPS.cooler=[0,1,2,3].map(f=>H(28,62,o=>{
  o.vg(3,26,22,36,'#f1f4f7','#cfd6dd',2);o.rr(7,33,4,4,1,'#3b82f6');o.rr(17,33,4,4,1,'#ef4444');o.r(6,42,16,2,'#9aa3ab');o.rr(23,28,4,14,1,'#e2e8f0');
  o.vg(4,2,20,24,'#bde8fb','#5fb4e2',6);o.r(10,24,8,4,'#3b82f6');o.r(7,5,2,16,'rgba(255,255,255,.55)');o.r(5,8,18,1,'rgba(255,255,255,.35)');
  o.el(10+(f%2)*2,21-f*4,1.3,1.3,'rgba(255,255,255,.85)');o.el(16,19-((f*5)%14),1,1,'rgba(255,255,255,.75)');
}));
PROPS.counter=[H(192,62,o=>{
  o.r(0,0,192,22,'#eef2f3');for(let r=0;r<5;r++){o.r(0,r*4+3,192,1,'#d5dcdf');for(let c=0;c<24;c++)o.r(c*8+(r%2?4:0),r*4,1,4,'#d5dcdf')}
  o.vg(0,22,192,7,'#f3f4f6','#d1d5db');for(let i=0;i<60;i++)o.p((hash(i,2)*192)|0,23+((hash(i,3)*5)|0),'rgba(100,110,120,.25)');o.r(0,28,192,2,'#b8bec6');
  o.r(0,30,192,28,'#fafafa');for(let i=0;i<12;i++){o.r(i*16+1,32,14,24,'#f1f2f4');o.r(i*16+(i%2?3:12),35,1,8,'#8b939c')}o.r(0,58,192,4,'#5b6270');
  o.vg(6,4,24,22,'#3a3d44','#25272c',2);o.r(6,4,24,2,'#c0c6cc');o.rr(14,12,8,4,1,'#9aa1a9');o.rr(15,19,6,5,1,'#ffffff');o.r(16,19,4,1,'#6b4226');o.r(9,7,6,3,'#ef4444');
  o.el(41,19,5,6,'#e5e7eb');o.rr(39,12,4,2,1,'#9ca3af');o.ln(46,16,49,20,'#9ca3af',1.5);
  o.rr(70,22,30,6,2,'#9aa3ab');o.rr(72,23,26,4,2,'#6b7480');o.r(84,10,2,13,'#c9ced5');o.r(84,10,8,2,'#c9ced5');
  o.vg(120,2,32,22,'#e5e7eb','#c9ced5',2);o.rr(122,4,20,17,1,'#1f2937');o.poly([126,5,130,5,124,19,122,19],'rgba(255,255,255,.12)');o.r(144,4,6,17,'#d1d5db');o.r(145,6,4,2,'#22c55e');
  o.el(168,25,8,3,'#f5f5f4');o.el(165,22,3,3,'#dc2626');o.el(170,22,3,3,'#eab308');o.el(168,20,2.5,2.5,'#65a30d');
  o.rr(181,18,8,8,2,'#e7e5df');o.el(185,15,4,3,'#4a9a55');
})];
PROPS.fridge=[H(34,70,o=>{o.vg(0,0,34,70,'#eef0f2','#b9bfc6',2);o.r(0,24,34,1,'#9aa1aa');o.vg(27,4,2,16,'#d1d5db','#8b939c');o.vg(27,28,2,30,'#d1d5db','#8b939c');o.r(5,0,3,70,'rgba(255,255,255,.35)');o.rr(8,8,10,10,2,'#1f2937');o.r(10,10,6,2,'#60a5fa');o.r(6,32,8,9,'#fff6a8');o.r(7,34,6,1,'#c2b45c');o.r(7,36,5,1,'#c2b45c');o.el(18,34,2,2,'#ef4444');o.el(20,44,2,2,'#3b82f6')})];
PROPS.vending=[0,1,2].map(f=>H(58,78,o=>{
  o.vg(0,0,58,78,'#c53030','#8f1d1d',3);o.r(0,0,58,9,'#e53e3e');o.txt('SNACKS',6,7,`800 7px ${UIF}`,'#ffffff');
  o.rr(4,11,36,52,2,'#0f1a24');const C=['#f59e0b','#ef4444','#22c55e','#3b82f6','#a855f7','#eab308','#f97316','#14b8a6'];
  for(let r=0;r<5;r++){const y=14+r*10;o.r(5,y+7,34,1,'#334155');for(let c=0;c<4;c++){o.rr(7+c*8,y,6,7,1,C[(r*3+c*2)%8]);o.r(7+c*8,y,6,1,'rgba(255,255,255,.35)')}}
  o.poly([6+f*12,11,12+f*12,11,4+f*12,63,-2+f*12,63],'rgba(255,255,255,.07)');o.r(4,11,36,2,'rgba(254,243,199,.55)');
  o.rr(43,12,12,24,2,'#1f2023');for(let i=0;i<4;i++)for(let j=0;j<3;j++)o.r(45+j*3,18+i*3,2,2,'#9ca3af');o.r(45,13,8,3,'#22c55e');o.r(45,40,8,6,'#111');o.r(46,42,6,1,'#4ade80');
  o.rr(6,66,32,8,2,'#0a0a0a');o.r(0,75,58,3,'#5a1212');
}));
PROPS.table=[H(60,44,o=>{o.vg(27,22,6,16,'#4b5563','#2f353e');o.el(30,40,12,3,'#2f353e');o.el(30,14,29,12,'#d8d2c6');o.el(30,12,29,11,'#faf8f4');o.el(21,8,10,3,'rgba(255,255,255,.8)');o.rr(10,7,15,9,2,'#c9a37a');o.el(17.5,11.5,4,3,'#ffffff');o.el(17,11,2,1.5,'#f97316');o.el(39,11,3.5,3.5,'#ffffff');o.el(39,11,2.2,2.2,'#6b4226');o.el(46,15,3,3,'#ffffff')})];
PROPS.stool=['#e07a3f','#2fa38a','#f2c14e'].map(c=>H(24,30,o=>{o.r(5,14,2,16,'#3a3f48');o.r(17,14,2,16,'#3a3f48');o.r(10,16,2,13,'#2b3038');o.rr(4,0,16,9,3,c);o.r(5,1,14,1,'rgba(255,255,255,.3)');o.el(12,15,11,5.5,c);o.el(12,13,11,4.5,'rgba(255,255,255,.22)')}));
PROPS.sofa=[H(96,50,o=>{
  o.vg(0,0,96,22,'#2f7f7b','#256663',6);for(let i=0;i<3;i++){o.vg(8+i*27,3,26,17,'#3a948f','#2c7a75',5);o.r(10+i*27,4,22,1,'rgba(255,255,255,.18)')}
  o.vg(2,18,92,18,'#3a958f','#2c7a75',4);o.r(33,20,1,15,'#256663');o.r(62,20,1,15,'#256663');o.r(6,19,84,1,'rgba(255,255,255,.2)');
  o.vg(0,10,11,32,'#2a716d','#1f5754',4);o.vg(85,10,11,32,'#2a716d','#1f5754',4);o.r(4,36,88,6,'#1e5250');
  o.r(8,42,3,6,'#3a2a1d');o.r(85,42,3,6,'#3a2a1d');o.rr(14,9,15,13,4,'#f2c14e');o.r(16,10,11,1,'rgba(255,255,255,.35)');o.rr(68,9,15,13,4,'#e8eef0');
})];
PROPS.armchair=[H(36,38,o=>{o.vg(2,0,32,16,'#6b7280','#525866',6);o.vg(3,12,30,16,'#7b8390','#5f6672',4);o.r(6,13,24,1,'rgba(255,255,255,.2)');o.vg(0,8,7,24,'#555b68','#434855',3);o.vg(29,8,7,24,'#555b68','#434855',3);o.r(3,28,30,4,'#3b4049');o.r(5,32,3,6,'#3a2a1d');o.r(28,32,3,6,'#3a2a1d')})];
PROPS.coffeeTable=[H(48,28,o=>{o.r(4,14,3,14,'#5a3b22');o.r(41,14,3,14,'#5a3b22');o.vg(0,2,48,14,'#9a6a45','#7c5233',3);o.r(2,3,44,1,'rgba(255,255,255,.25)');o.rr(6,5,12,8,1,'#2563eb');o.r(8,7,8,1,'#bfdbfe');o.rr(16,6,11,7,1,'#f43f5e');o.rr(34,4,7,7,2,'#e7e5df');o.el(37.5,3,4,3,'#4a9a55');o.r(0,16,48,2,'#5f3f27')})];
PROPS.reception=[H(160,64,o=>{
  o.r(0,20,160,38,'#6e4a30');for(let x=0;x<160;x+=6){o.r(x,20,1,36,'#5a3b25');o.r(x+1,20,1,36,'#7d5638')}
  o.r(0,52,160,6,'rgba(74,222,128,.28)');o.r(0,55,160,2,'#4ade80');o.r(0,58,160,6,'#2a1e16');
  o.rr(56,27,48,18,3,'#16231c');o.r(56,27,48,1,'#2f4a3b');
  o.poly([65,30,72,32,72,37,65,42,58,37,58,32],'#22c55e');o.txt('NOVACORP',76,39,`800 8px ${UIF}`,'#e8f5ec');
  o.vg(0,9,160,12,'#f6f4f0','#dcd7cf',2);o.r(0,9,160,1,'#ffffff');for(let i=0;i<6;i++){let x=10+i*26,y=11;for(let k=0;k<12;k++){o.p(x,y,'rgba(150,140,130,.35)');x+=1;y+=hash(i,k)>.5?1:0;if(y>18)break}}
  o.rr(18,0,28,12,2,'#2b2f37');o.el(32,6,1.5,1.5,'#4b5563');o.rr(28,11,8,2,1,'#3b414b');
  o.r(60,4,16,6,'#ffffff');o.r(62,6,10,1,'#c9cdd4');o.rr(82,4,6,6,1,'#334155');o.r(83,1,1,4,'#ef4444');o.r(85,0,1,5,'#2563eb');
  o.el(120,9,5,2,'#a8862e');o.el(120,7,4,3.5,'#d9b44a');o.r(119.5,2,1,2,'#f0d070');
  o.rr(138,1,7,9,2,'#e8e4da');o.el(139,0,2.5,2.5,'#e86a92');o.el(143,0,2.5,2.5,'#f5b941');o.el(141,-2,2,2,'#e86a92');
})];
PROPS.aquarium=[0,1,2,3,4,5,6,7].map(f=>H(64,62,o=>{
  o.vg(2,36,60,26,'#3b3e47','#24262c',2);o.r(31,38,1,22,'#1f2126');o.r(12,46,8,1,'#50545f');o.r(44,46,8,1,'#50545f');
  o.rr(0,0,64,37,2,'#2b2d35');o.vg(2,2,60,33,'#8bdaf9','#0e7490');o.r(2,2,60,3,'#e0f7ff');o.vg(2,28,60,7,'#f1dfae','#d6be86');
  for(const[x,h,c]of[[8,16,'#15803d'],[12,12,'#22c55e'],[50,18,'#15803d'],[54,11,'#22c55e'],[46,9,'#16a34a']])for(let i=0;i<h;i++)o.r(x+Math.round(Math.sin((i+f)*.6)),30-i,2,1,c);
  o.el(30,30,6,3,'#7c8590');o.el(37,31,4,2,'#6b7280');
  const fx=4+((f*6)%52);o.el(fx,12,4,2.5,'#fb923c');o.r(fx-1,10,1,5,'#ffffff');o.poly([fx-4,12,fx-7,10,fx-7,14],'#fb923c');o.p(fx+2,11,'#111');
  const gx=58-((f*5)%48);o.el(gx,20,4,3,'#facc15');o.poly([gx+4,20,gx+7,17,gx+7,23],'#facc15');o.p(gx-2,19,'#111');
  const bx=26+((f*3)%10);o.el(bx,24,3,1.6,'#3b82f6');
  for(let i=0;i<3;i++)o.el(20+i*2,26-((f*4+i*9)%24),1,1,'rgba(255,255,255,.8)');
  o.r(3,4,2,26,'rgba(255,255,255,.35)');
}));
PROPS.rack=[0,1,2,3,4,5].map(f=>H(28,70,o=>{
  o.vg(0,0,28,70,'#22262d','#15181d',2);o.rr(2,2,24,66,1,'#2b3038');
  for(let u=0;u<10;u++){const y=4+u*6;o.r(4,y,20,5,'#353b45');o.r(4,y,20,1,'#4a515d');for(let k=0;k<3;k++){const on=hash(u*7+k,f*13+3)>.4;o.r(5+k*3,y+2,2,1,on?(k===0?'#4ade80':k===1?'#fbbf24':'#60a5fa'):'#1a1d22')}o.r(15,y+2,7,1,'#1a1d22')}
  o.r(24,30,1,8,'#9aa1a9');o.r(2,66,24,2,'#0f1114');o.r(3,3,1,62,'rgba(255,255,255,.06)');
}));
PROPS.meeting=[H(160,70,o=>{
  o.r(10,52,4,18,'#2a1c14');o.r(146,52,4,18,'#2a1c14');
  o.vg(0,4,160,44,'#7f5233','#5f3b24',5);o.r(6,8,148,3,'rgba(255,255,255,.12)');for(let i=0;i<5;i++)o.r(8+((hash(i,1)*60)|0),14+i*7,40+((hash(i,2)*60)|0),1,'rgba(40,20,10,.22)');
  o.vg(0,48,160,6,'#4f311d','#3e2616',2);
  for(const x of [14,44,74,104,134]){o.rr(x-2,7,16,9,1,'#c9ccd3');o.el(x+6,11.5,1.5,1.5,'#e5e7eb')}
  for(const x of [14,44,104,134]){o.rr(x-2,32,16,10,1,'#1f2328');o.r(x-1,33,14,7,'#dbeafe');o.r(x,34,8,1,'#93c5fd');o.rr(x-3,41,18,3,1,'#9da2ab')}
  o.el(80,27,10,6,'#1f2328');o.el(80,26,5,3,'#3a3f48');o.el(80,26,1.4,1.4,'#4ade80');
  o.r(60,20,2,6,'#bfe6f7');o.r(98,18,2,6,'#bfe6f7');o.rr(30,22,8,10,1,'#fbfaf6');o.rr(120,20,8,10,1,'#fef3c7');
})];
PROPS.execDesk=[H(96,60,o=>{
  o.r(4,50,4,10,'#2a1810');o.r(88,50,4,10,'#2a1810');o.vg(2,30,92,22,'#4a2e20','#331f15',2);o.rr(8,34,34,14,1,'#55362a');o.rr(54,34,34,14,1,'#55362a');o.r(23,40,4,1,'#c9a45c');o.r(69,40,4,1,'#c9a45c');
  o.vg(0,16,96,16,'#6b4430','#55331f',3);o.r(2,17,92,1,'rgba(255,255,255,.18)');o.rr(28,19,40,10,2,'#2a3a2e');
  o.rr(34,6,26,14,2,'#c9ccd3');o.el(47,13,2,2,'#e5e7eb');o.rr(32,19,30,3,1,'#9da2ab');
  o.r(80,4,3,18,'#c9a45c');o.rr(73,0,18,7,3,'#1f6e4f');o.r(75,1,14,1,'rgba(255,255,255,.3)');o.el(82,12,8,3,'rgba(255,230,160,.18)');
  o.rr(8,23,16,5,1,'#c9a45c');o.r(10,25,12,1,'#7a5a1a');o.rr(70,22,8,6,1,'#ffffff');o.rr(13,14,6,8,1,'#1f2937');
})];
PROPS.notice=[H(60,64,o=>{
  o.vg(6,42,4,22,'#6e4a2e','#4f331e');o.vg(50,42,4,22,'#6e4a2e','#4f331e');
  o.rr(0,0,60,44,3,'#7a5434');o.r(0,0,60,2,'#9a6e46');o.r(4,4,52,36,'#c99a63');for(let i=0;i<40;i++)o.p(5+((hash(i,9)*50)|0),5+((hash(i,8)*34)|0),'#b8874f');
  o.r(7,7,17,13,'#f7f4ea');o.r(7,7,17,3,'#22c55e');o.r(9,12,12,1,'#b9b3a3');o.r(9,14,10,1,'#b9b3a3');o.r(9,16,12,1,'#b9b3a3');o.el(15,7,1.5,1.5,'#ef4444');
  o.r(29,6,18,16,'#fff3a0');o.r(31,10,14,1,'#c9b25a');o.r(31,13,12,1,'#c9b25a');o.r(31,16,13,1,'#c9b25a');o.el(38,6,1.5,1.5,'#3b82f6');
  o.r(9,24,15,12,'#cde6ff');o.r(11,27,10,1,'#7aa7d6');o.r(11,30,8,1,'#7aa7d6');o.el(16,24,1.5,1.5,'#22c55e');
  o.r(30,25,20,12,'#ffd6e0');o.r(32,28,15,1,'#c98a9b');o.r(32,31,12,1,'#c98a9b');o.el(40,25,1.5,1.5,'#f59e0b');
})];
PROPS.trash=[H(20,24,o=>{o.vg(2,4,16,20,'#4b5563','#2f353e',2);for(let i=0;i<5;i++)o.r(4+i*3,6,1,16,'rgba(0,0,0,.25)');o.el(10,4,9,3,'#6b7280');o.el(10,4,7,2,'#1f2328');o.el(8,3,3,2,'#ffffff')})];
PROPS.usb=[H(18,10,o=>{o.rr(0,1,12,8,2,'#2563eb');o.r(1,2,10,1,'rgba(255,255,255,.35)');o.rr(12,2,6,6,1,'#d1d5db');o.r(14,4,3,2,'#6b7280');o.r(2,4,7,3,'#f8fafc')})];
PROPS.laptop=[H(30,24,o=>{o.rr(1,15,28,9,2,'#c9ccd3');o.r(3,17,24,4,'#b4b9c1');o.rr(3,0,24,16,2,'#1f2328');o.r(4,1,22,13,'#f1f5f9');o.r(4,1,22,2,'#2563eb');for(let i=0;i<3;i++)o.r(6,5+i*3,18,1,'#cbd5e1');o.r(4,1,22,13,'rgba(96,165,250,.08)')})];
PROPS.phone=[0,1].map(f=>H(16,24,o=>{o.rr(f,0,14,24,3,'#0b1220');o.rr(f+1,2,12,19,2,f?'#38bdf8':'#0ea5e9');o.rr(f+2,5,10,5,1,'#f8fafc');o.r(f+3,7,6,1,'#64748b');o.el(f+7,22.5,1.5,.8,'#334155')}));
PROPS.tv=[0,1,2,3,4,5].map(f=>H(92,52,o=>{
  o.rr(0,0,92,52,2,'#16181d');o.vg(3,3,86,44,'#0f1d33','#0b1424');o.txt('Q3 REVENUE',8,13,`700 7px ${UIF}`,'#e5e7eb');o.txt('+18%',70,13,`800 7px ${UIF}`,'#4ade80');
  for(let i=0;i<7;i++){const h=6+i*3+((i+f)%3);o.rr(9+i*11,43-h,7,h,1,i===6?'#4ade80':'#3b82f6')}o.r(8,43,76,1,'#334155');o.r(44,49,4,1,'#22c55e');
}));
PROPS.soc=[0,1,2,3,4,5].map(f=>H(184,48,o=>{
  for(let s=0;s<3;s++){const x=s*62;o.rr(x,0,58,40,2,'#16181d');o.r(x+2,2,54,34,'#07111c');o.r(x+26,40,6,6,'#2b2f38')}
  for(const[x,y,w,h]of[[6,10,12,8],[20,8,14,12],[36,14,10,10],[14,22,8,8],[44,8,8,6]])o.rr(x,y,w,h,3,'#1c4d34');
  [[10,13],[26,12],[40,18],[17,25],[47,10]].forEach(([x,y],i)=>{if((f+i)%3===0){o.el(x,y,2.5,2.5,'rgba(239,68,68,.35)');o.el(x,y,1.2,1.2,'#ef4444')}});
  o.txt('BLOCKED TODAY',68,12,`700 6px ${UIF}`,'#94a3b8');o.txt(String(14+(f>2?1:0)),70,31,`800 18px ${UIF}`,'#4ade80');
  for(let i=0;i<7;i++){const L=[30,20,40,26,36,16,44];o.r(130,5+i*4,L[(i+f)%7],2,i===(f%7)?'#f59e0b':'#60a5fa')}
}));
PROPS.clock=[H(24,24,o=>{o.el(12,12,11.5,11.5,'#1f2937');o.el(12,12,10,10,'#f8fafc');for(let i=0;i<12;i++){const a=i/12*Math.PI*2;o.r(12+Math.sin(a)*8-.5,12-Math.cos(a)*8-.5,1,1,'#64748b')}})];

/* =========================================================
   STATIC WORLD (floors, walls, light, wall art) at R=2
   ========================================================= */
const world=mk(MW*TR,MH*TR);
const WALLPAL={
  'IT & Server Room':{p:['#dfe4ea','#c9d0d9'],panel:'#b7c0cb',rail:'#8e99a7',base:'#3d4652'},
  'Executive Suite':{p:['#f0e8db','#e3d7c4'],panel:'#7a5236',rail:'#5e3d27',base:'#3a2618',wood:1},
  'People & HR':{p:['#f3eadf','#e7dbcd'],panel:'#d9c9b6',rail:'#c3b09a',base:'#6b5a48'},
  'Open Office':{p:['#eceff2','#dde2e7'],panel:'#cfd6dd',rail:'#22c55e',base:'#46505b'},
  'Cafeteria':{tile:1,base:'#4b5563'},
  'Lobby':{p:['#f1ede6','#e4ddd2'],panel:'#d7cfc2',rail:'#b5a994',base:'#4b4036'},
};
function faceRoom(x,y){let yy=y;while(yy<MH&&isWallT(tileAt(x,yy)))yy++;return roomAt(x,yy)}
function drawWorld(objs){
  const g=world.getContext('2d'),o=painter(g);
  g.clearRect(0,0,world.width,world.height);
  const F=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h)};
  /* floors */
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const t=tileAt(x,y),X=x*TR,Y=y*TR,hv=hash(x,y);
    if(t===CARPET){const a=((x>>1)+(y>>1))%2;F(X,Y,TR,TR,a?'#56667d':'#5b6c84');for(let i=0;i<TR;i+=3)a?F(X,Y+i,TR,1,'rgba(255,255,255,.025)'):F(X+i,Y,1,TR,'rgba(255,255,255,.025)');
      for(let i=0;i<34;i++)F(X+((hash(x*31+i,y)*TR)|0),Y+((hash(x,y*29+i)*TR)|0),1,1,i%2?'#6c7d97':'#4b5a70');if(x%2===0)F(X,Y,1,TR,'rgba(0,0,0,.13)');if(y%2===0)F(X,Y,TR,1,'rgba(0,0,0,.13)')}
    else if(t===ITF){F(X,Y,TR,TR,'#c5cbd2');F(X,Y,TR,1,'#a3abb5');F(X,Y,1,TR,'#a3abb5');F(X+1,Y+1,TR-2,1,'#d8dde2');F(X+1,Y+1,1,TR-2,'#d8dde2');
      if(hv<.35)for(let j=0;j<6;j++)for(let i=0;i<6;i++)F(X+5+i*4,Y+5+j*4,2,2,'#9aa2ab');F(X+3,Y+3,1,1,'#8a929c');F(X+28,Y+3,1,1,'#8a929c');F(X+3,Y+28,1,1,'#8a929c');F(X+28,Y+28,1,1,'#8a929c')}
    else if(t===WOOD){const P=['#b5835a','#a8774f','#bd8b60','#9f6f48'];for(let r=0;r<4;r++){const row=y*4+r,pid=Math.floor((x*TR+row*23)/96);F(X,Y+r*8,TR,8,P[(hash(pid,row)*4)|0]);let gy=Y+r*8+2+((hash(x,row)*3)|0);for(let i=0;i<TR;i+=2){F(X+i,gy,2,1,'rgba(80,50,25,.16)');if(hash(x*7+i,row)>.8)gy+=hash(i,row)>.5?1:-1;gy=Math.max(Y+r*8+1,Math.min(Y+r*8+6,gy))}
      const off=(row*23)%96,ex=((96-((x*TR+row*23)%96))%96);if(ex<TR)F(X+ex,Y+r*8,1,8,'rgba(60,35,15,.45)');F(X,Y+r*8+7,TR,1,'rgba(60,35,15,.35)')}}
    else if(t===HRC){F(X,Y,TR,TR,((x>>1)+(y>>1))%2?'#b39a7f':'#ad9378');for(let i=0;i<30;i++)F(X+((hash(x*13+i,y)*TR)|0),Y+((hash(x,y*17+i)*TR)|0),1,1,i%2?'#c4ab90':'#9e866c')}
    else if(t===CAFE){for(let j=0;j<2;j++)for(let i=0;i<2;i++){F(X+i*16,Y+j*16,16,16,((x*2+i)+(y*2+j))%2?'#f0ece4':'#a7cfc1');F(X+i*16+2,Y+j*16+2,5,1,'rgba(255,255,255,.55)')}F(X,Y,TR,1,'#d6d0c5');F(X,Y+16,TR,1,'#d6d0c5');F(X,Y,1,TR,'#d6d0c5');F(X+16,Y,1,TR,'#d6d0c5')}
    else if(t===MARBLE){F(X,Y,TR,TR,((x>>1)+(y>>1))%2?'#e8e5df':'#e0dcd5')}
  }
  /* marble veins + grout per 2x2 slab */
  for(let y=0;y<MH;y+=1)for(let x=0;x<MW;x+=1){if(tileAt(x,y)!==MARBLE)continue;const X=x*TR,Y=y*TR;if(x%2===0)F(X,Y,1,TR,'#cbc5bb');if(y%2===0)F(X,Y,TR,1,'#cbc5bb');
    if(x%2===0&&y%2===0&&hash(x,y)<.75){let vx=X+4+hash(x,y*3)*50,vy=Y+2;g.strokeStyle='rgba(140,130,118,.28)';g.lineWidth=.8;g.beginPath();g.moveTo(vx,vy);for(let i=0;i<14;i++){vx+=(hash(x+i,y)-.4)*8;vy+=4;g.lineTo(vx,vy)}g.stroke()}}
  /* lobby gloss */
  g.save();g.globalAlpha=.10;for(let i=0;i<6;i++){g.fillStyle='#ffffff';g.beginPath();const sx=(23+i*5)*TR;g.moveTo(sx,30*TR);g.lineTo(sx+40,30*TR);g.lineTo(sx-60,39*TR);g.lineTo(sx-100,39*TR);g.fill()}g.restore();
  /* rugs */
  const rug=(x,y,w,h,c1,c2,c3)=>{const X=x*TR+6,Y=y*TR+6,W=w*TR-12,Hh=h*TR-12;g.save();g.shadowColor='rgba(0,0,0,.25)';g.shadowBlur=6;o.rr(X,Y,W,Hh,4,c2);g.restore();o.rr(X+5,Y+5,W-10,Hh-10,3,c1);g.strokeStyle=c3;g.lineWidth=1;g.strokeRect(X+9.5,Y+9.5,W-19,Hh-19);for(let i=X+14;i<X+W-14;i+=8){F(i,Y+2,3,2,c3);F(i,Y+Hh-4,3,2,c3)}};
  rug(19,4,9,6,'#7a2f3a','#c9a45c','#f0d58a');
  {const cx=23.5*TR,cy=7*TR;g.strokeStyle='#c9a45c';g.lineWidth=2;g.beginPath();g.ellipse(cx,cy,60,34,0,0,7);g.stroke();g.strokeStyle='rgba(240,213,138,.6)';g.beginPath();g.ellipse(cx,cy,40,22,0,0,7);g.stroke()}
  rug(33,33,6,5,'#25624d','#d9b44a','#f0d58a');
  {const X=36*TR,Y=35.5*TR;g.fillStyle='#d9b44a';g.beginPath();g.moveTo(X,Y-22);g.lineTo(X+22,Y);g.lineTo(X,Y+22);g.lineTo(X-22,Y);g.fill();g.fillStyle='#25624d';g.beginPath();g.moveTo(X,Y-15);g.lineTo(X+15,Y);g.lineTo(X,Y+15);g.lineTo(X-15,Y);g.fill();g.fillStyle='#4ade80';g.fillRect(X-4,Y-4,8,8)}
  rug(41,35,7,4,'#384766','#9aa8c7','#c8d2e8');
  rug(44,9,5,4,'#6b8f71','#e8e4da','#f5f1e6');
  /* door mats */
  DOORS.forEach(d=>{if(d.w>4)return;const my=d.y+3;o.rr(d.x*TR+3,my*TR+5,d.w*TR-6,20,3,'#3a3f4c');o.rr(d.x*TR+6,my*TR+8,d.w*TR-12,14,2,'#474e5d')});
  /* floor ambient occlusion near walls */
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(isWallT(tileAt(x,y)))continue;const X=x*TR,Y=y*TR;
    if(isWallT(tileAt(x,y-1))){const gr=g.createLinearGradient(0,Y,0,Y+14);gr.addColorStop(0,'rgba(15,10,25,.32)');gr.addColorStop(1,'rgba(15,10,25,0)');g.fillStyle=gr;g.fillRect(X,Y,TR,14)}
    if(isWallT(tileAt(x-1,y))){const gr=g.createLinearGradient(X,0,X+8,0);gr.addColorStop(0,'rgba(15,10,25,.25)');gr.addColorStop(1,'rgba(15,10,25,0)');g.fillStyle=gr;g.fillRect(X,Y,8,TR)}
    if(isWallT(tileAt(x+1,y))){const gr=g.createLinearGradient(X+TR,0,X+TR-6,0);gr.addColorStop(0,'rgba(15,10,25,.18)');gr.addColorStop(1,'rgba(15,10,25,0)');g.fillStyle=gr;g.fillRect(X+TR-6,Y,6,TR)}}
  /* baked contact shadows under props */
  for(const ob of objs){if(ob.layer!=='y'||ob.levels||ob.noShadow)continue;const X=ob.x*TR+4+ob.dx*R,W=ob.w*TR-8,B=(ob.y+ob.h)*TR+ob.dy*R;g.save();g.shadowColor='rgba(12,8,22,.5)';g.shadowBlur=10;g.shadowOffsetY=2;g.fillStyle='rgba(12,8,22,.28)';g.beginPath();g.roundRect(X,B-9,W,9,4);g.fill();g.restore()}
  /* ceiling light pools */
  g.save();g.globalCompositeOperation='screen';
  const pool=(cx,cy,r,a)=>{const gr=g.createRadialGradient(cx,cy,0,cx,cy,r);gr.addColorStop(0,`rgba(255,244,220,${a})`);gr.addColorStop(1,'rgba(255,244,220,0)');g.fillStyle=gr;g.fillRect(cx-r,cy-r,r*2,r*2)};
  for(const rm of ROOMS){const y0=rm.n==='Open Office'?16:rm.y,h=rm.n==='Open Office'?11:rm.h;for(let yy=y0+2;yy<y0+h;yy+=4)for(let xx=rm.x+2;xx<rm.x+rm.w;xx+=4)pool(xx*TR+16,yy*TR+16,96,rm.n==='Lobby'?.10:.13)}
  /* window beams */
  for(const wx of [17,27,35,38,41]){const gr=g.createLinearGradient(0,3*TR,0,8*TR);gr.addColorStop(0,'rgba(255,248,225,.22)');gr.addColorStop(1,'rgba(255,248,225,0)');g.fillStyle=gr;g.beginPath();g.moveTo(wx*TR+8,3*TR);g.lineTo(wx*TR+56,3*TR);g.lineTo(wx*TR+90,8*TR);g.lineTo(wx*TR-10,8*TR);g.fill()}
  g.restore();
  /* walls */
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const t=tileAt(x,y),X=x*TR,Y=y*TR;
    if(t===CAP){F(X,Y,TR,TR,'#302e39');for(let i=0;i<8;i++)F(X+((hash(x*3+i,y)*TR)|0),Y+((hash(x,y*5+i)*TR)|0),2,1,'rgba(255,255,255,.03)');if(!isWallT(tileAt(x,y-1)))F(X,Y,TR,3,'#4b4860');if(!isWallT(tileAt(x-1,y)))F(X,Y,3,TR,'#3c3a49');if(!isWallT(tileAt(x+1,y)))F(X+TR-3,Y,3,TR,'#25232d');if(tileAt(x,y+1)===FACE)F(X,Y+TR-3,TR,3,'#1d1b24')}
    else if(t===FACE){const upper=tileAt(x,y-1)!==FACE,rm=faceRoom(x,y),P=WALLPAL[rm?rm.n:'Open Office']||WALLPAL['Open Office'];
      const glass=(y===14||y===15)&&x>=16&&x<=32;
      if(glass){g.fillStyle=(()=>{const gr=g.createLinearGradient(0,Y,0,Y+TR);gr.addColorStop(0,upper?'#cfe3ec':'#b7d2df');gr.addColorStop(1,upper?'#b9d5e2':'#a3c3d3');return gr})();g.fillRect(X,Y,TR,TR);
        if(upper){F(X,Y,TR,4,'#596474');F(X,Y+4,TR,1,'rgba(0,0,0,.15)')}else{F(X,Y+8,TR,8,'rgba(255,255,255,.55)');for(let i=0;i<TR;i+=4)F(X+i+1,Y+11,2,2,'rgba(160,190,205,.55)');F(X,Y+TR-5,TR,5,'#3f4855')}
        if(x%2===0)F(X,Y,2,TR,'#6b7785');g.fillStyle='rgba(255,255,255,.28)';g.beginPath();g.moveTo(X+10,Y);g.lineTo(X+16,Y);g.lineTo(X+6,Y+TR);g.lineTo(X,Y+TR);g.fill()}
      else if(P.tile){F(X,Y,TR,TR,'#f4f6f6');for(let r=0;r<8;r++){F(X,Y+r*4+3,TR,1,'#d3dadd');for(let c=0;c<4;c++)F(X+c*8+(r%2?4:0),Y+r*4,1,4,'#d3dadd')}
        if(upper){F(X,Y,TR,3,'#c9d0d4')}else{F(X,Y+6,TR,3,'#2fa38a');F(X,Y+TR-5,TR,5,P.base)}}
      else if(upper){const gr=g.createLinearGradient(0,Y,0,Y+TR);gr.addColorStop(0,P.p[0]);gr.addColorStop(1,P.p[1]);g.fillStyle=gr;g.fillRect(X,Y,TR,TR);F(X,Y,TR,3,'#bfb7a8');F(X,Y+3,TR,2,'rgba(0,0,0,.07)')}
      else{F(X,Y,TR,9,P.p[1]);F(X,Y+9,TR,2,P.rail);F(X,Y+11,TR,1,'rgba(0,0,0,.18)');F(X,Y+12,TR,14,P.panel);
        const L=P.wood?'rgba(255,220,180,.18)':'rgba(255,255,255,.4)',D='rgba(0,0,0,.14)';F(X+3,Y+14,26,1,L);F(X+3,Y+23,26,1,D);F(X+3,Y+14,1,10,L);F(X+28,Y+14,1,10,D);
        F(X,Y+26,TR,6,P.base);F(X,Y+26,TR,1,'rgba(255,255,255,.18)')}
    }
  }
  /* door casings */
  DOORS.forEach(d=>{for(const yy of [d.y+1,d.y+2]){F(d.x*TR-5,yy*TR,5,TR,'#8a6a4f');F(d.x*TR-5,yy*TR,1,TR,'#a8876a');F((d.x+d.w)*TR,yy*TR,5,TR,'#8a6a4f');F((d.x+d.w)*TR+4,yy*TR,1,TR,'#6a4f38')}
    F(d.x*TR-5,(d.y+1)*TR,d.w*TR+10,4,'#7a5c43');const gr=g.createLinearGradient(0,d.y*TR,0,(d.y+1)*TR);gr.addColorStop(0,'rgba(10,8,18,.35)');gr.addColorStop(1,'rgba(10,8,18,.05)');g.fillStyle=gr;g.fillRect(d.x*TR,d.y*TR,d.w*TR,TR)});
  /* windows */
  const win=x=>{const X=x*TR,Y=TR;o.rr(X+4,Y+4,56,52,2,'#e6e9ec');const gr=g.createLinearGradient(0,Y+7,0,Y+52);gr.addColorStop(0,'#8ecdf2');gr.addColorStop(1,'#e2f3fb');g.fillStyle=gr;g.fillRect(X+7,Y+7,50,46);
    o.el(X+18,Y+30,7,3,'#ffffff');o.el(X+24,Y+29,6,3.5,'#ffffff');
    for(let i=0;i<8;i++){const bh=8+((hash(x,i)*20)|0),bx=X+7+i*6.3;F(bx,Y+53-bh,6,bh,i%2?'#7f9fb8':'#6f8fa8');for(let k=0;k<bh-3;k+=4)if(hash(i,k+x)>.55)F(bx+2,Y+55-bh+k,1,1,'#fef3c7')}
    for(let i=0;i<7;i++){F(X+7,Y+7+i*2,50,1,'#f3f4f6');F(X+7,Y+8+i*2,50,1,'#d1d5db')}F(X+30,Y+20,1,8,'#9ca3af');
    F(X+31,Y+7,2,46,'#e6e9ec');F(X+7,Y+28,50,2,'#e6e9ec');g.fillStyle='rgba(255,255,255,.25)';g.beginPath();g.moveTo(X+40,Y+21);g.lineTo(X+48,Y+21);g.lineTo(X+30,Y+53);g.lineTo(X+22,Y+53);g.fill();
    F(X+2,Y+55,60,4,'#f8fafc');F(X+2,Y+58,60,1,'#b9b1a1')};
  [17,27,35,38,41].forEach(win);
  /* wall art & signage */
  const plaque=(x,y,w,txt)=>{const X=x*TR+6,Y=y*TR+6,W=w*TR-12;o.rr(X,Y,W,18,3,'#1f2a33');o.r(X,Y,W,1,'#3c4a59');o.txt(txt,X+W/2,Y+12.5,`700 8.5px ${UIF}`,'#e2e8f0','center')};
  plaque(1,14,3,'IT & SECURITY');plaque(38,14,3,'PEOPLE & HR');
  {const X=16*TR+8,Y=14*TR+8;o.txt('EXECUTIVE SUITE',X+8*TR,Y+30,`700 10px ${UIF}`,'rgba(60,80,95,.55)','center')}
  /* poster */
  {const X=4*TR+8,Y=14*TR+4;o.rr(X,Y,48,56,2,'#0f2a1c');o.rr(X+2,Y+2,44,52,2,'#14532d');o.txt('THINK',X+24,Y+16,`800 10px ${UIF}`,'#4ade80','center');o.txt('BEFORE',X+24,Y+27,`800 8px ${UIF}`,'#e2e8f0','center');o.txt('YOU',X+24,Y+37,`800 8px ${UIF}`,'#e2e8f0','center');o.txt('CLICK',X+24,Y+48,`800 10px ${UIF}`,'#fbbf24','center')}
  /* whiteboard */
  {const X=9*TR+4,Y=14*TR+5;o.rr(X,Y,152,44,2,'#9aa3ad');o.r(X+3,Y+3,146,36,'#fbfcfd');o.r(X+20,Y+41,30,3,'#6b7280');o.r(X+24,Y+40,6,2,'#2563eb');o.r(X+33,Y+40,6,2,'#dc2626');
   o.txt('Sprint 14',X+8,Y+14,`700 9px ${UIF}`,'#2563eb');o.r(X+8,Y+19,50,1.5,'#dc2626');o.r(X+8,Y+24,38,1.5,'#16a34a');o.r(X+8,Y+29,44,1.5,'#334155');
   for(let i=0;i<4;i++){o.r(X+72+i*18,Y+8,15,13,['#fde68a','#bbf7d0','#bfdbfe','#fecaca'][i]);o.r(X+74+i*18,Y+12,10,1,'rgba(0,0,0,.3)')}o.ln(X+70,Y+28,X+140,Y+28,'#334155',1);o.ln(X+134,Y+25,X+140,Y+28,'#334155',1);o.ln(X+134,Y+31,X+140,Y+28,'#334155',1)}
  /* kanban */
  {const X=34*TR+6,Y=14*TR+5;o.rr(X,Y,84,46,2,'#cbd5e1');o.r(X+2,Y+2,80,42,'#f8fafc');['TO DO','DOING','DONE'].forEach((h,c)=>{o.txt(h,X+5+c*26,Y+10,`700 5.5px ${UIF}`,'#64748b');for(let r=0;r<3-c;r++)o.r(X+5+c*26,Y+14+r*9,22,7,['#fde68a','#bfdbfe','#bbf7d0'][c])})}
  /* report phish poster */
  {const X=44*TR+6,Y=14*TR+4;o.rr(X,Y,50,56,2,'#450a0a');o.rr(X+2,Y+2,46,52,2,'#991b1b');o.txt('REPORT',X+25,Y+16,`800 9px ${UIF}`,'#fecaca','center');o.txt('PHISH',X+25,Y+28,`800 11px ${UIF}`,'#ffffff','center');o.el(X+22,Y+42,9,5,'#fbbf24');o.poly([X+30,Y+42,X+36,Y+37,X+36,Y+47],'#fbbf24');o.p(X+17,Y+41,'#111');o.ln(X+10,Y+33,X+10,Y+44,'#e2e8f0',1);o.ln(X+10,Y+44,X+14,Y+44,'#e2e8f0',1)}
  /* security week banner */
  {const X=47*TR+4,Y=14*TR+8;o.rr(X,Y,88,22,3,'#22c55e');o.txt('SECURITY WEEK',X+44,Y+14.5,`800 8px ${UIF}`,'#052e16','center')}
  /* cafeteria menu + QR poster */
  {const X=2*TR+6,Y=28*TR+2;o.rr(X,Y,108,26,2,'#5c4330');o.r(X+2,Y+2,104,22,'#22302a');o.txt('TODAY',X+8,Y+12,`800 8px ${UIF}`,'#fbbf24');o.txt('Masala dosa · Thali · Salad',X+8,Y+21,`600 6.5px ${UIF}`,'#e2e8f0')}
  {const X=15*TR+8,Y=28*TR+2;o.rr(X,Y,48,60,2,'#f8fafc');o.r(X,Y,48,16,'#f97316');o.txt('FREE',X+24,Y+11,`800 9px ${UIF}`,'#ffffff','center');o.txt('LUNCH TODAY!',X+24,Y+25,`800 6.5px ${UIF}`,'#c2410c','center');o.txt('Scan to claim',X+24,Y+33,`600 5.5px ${UIF}`,'#475569','center');
   g.save();g.translate(X+24,Y+47);g.rotate(-.12);o.r(-11,-11,22,22,'#fffef0');o.r(-11,-11,22,1,'#e5e1c8');for(let j=0;j<9;j++)for(let i=0;i<9;i++)if(hash(i+3,j+7)>.5||(i<3&&j<3)||(i>5&&j<3)||(i<3&&j>5))o.r(-9+i*2,-9+j*2,2,2,'#111827');g.restore()}
  /* lobby logo wall */
  {const X=23*TR,Y=28*TR+2;for(let i=0;i<9*TR;i+=5){F(X+i,Y-2,3,TR+28,'#9c7350');F(X+i+3,Y-2,2,TR+28,'#7d5a3c')}
   g.save();g.shadowColor='rgba(74,222,128,.9)';g.shadowBlur=12;o.poly([X+60,Y+8,X+76,Y+13,X+76,Y+24,X+60,Y+34,X+44,Y+24,X+44,Y+13],'#22c55e');o.txt('NovaCorp',X+86,Y+29,`800 22px ${UIF}`,'#f0fdf4');g.restore()}
  const art=(x,y,c1,c2)=>{const X=x*TR+8,Y=y*TR+4;o.rr(X,Y,48,36,2,'#c9a45c');o.r(X+3,Y+3,42,30,'#f8f5ee');o.r(X+6,Y+6,36,24,c1);o.poly([X+6,Y+30,X+20,Y+16,X+30,Y+24,X+36,Y+19,X+42,Y+26,X+42,Y+30],c2);o.el(X+34,Y+11,3,3,'#fde68a')};
  art(40,28,'#7dd3fc','#15803d');art(46,28,'#fda4af','#7c3aed');art(20,1,'#bae6fd','#a16207');art(44,1,'#fde68a','#b45309');
  /* glass entrance doors */
  {const X=34*TR,Y=39*TR;o.r(X-4,Y-4,TR*4+8,TR+4,'#4b5563');const gr=g.createLinearGradient(0,Y,0,Y+TR);gr.addColorStop(0,'#cbe9f6');gr.addColorStop(1,'#8fcbe4');g.fillStyle=gr;g.fillRect(X,Y,TR*4,TR);F(X+TR*2-2,Y,4,TR,'#4b5563');F(X+TR*2-10,Y+10,3,12,'#e5e7eb');F(X+TR*2+7,Y+10,3,12,'#e5e7eb');g.fillStyle='rgba(255,255,255,.4)';g.fillRect(X+8,Y+2,4,26);g.fillRect(X+TR*2+16,Y+2,4,26)}
}
