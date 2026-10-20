/* =========================================================
   TOUCH CONTROLS: floating joystick (bottom-left) + action button (bottom-right).
   Shown on touch screens only. The joystick writes into the same `held` direction stack and
   `running` flag the keyboard uses, so walking, turning on the spot and collisions behave
   exactly like the arrow keys (+ Shift). Engine calls Pad.frame() once per frame.
   ========================================================= */
const Pad=(()=>{
  const game=$('game'),zone=$('joyZone'),joy=$('joy'),knob=$('joyKnob'),btn=$('tapBtn'),verbEl=$('actVerb');
  const DEAD=.25,DEAD_OUT=.2,RUN=.85,AXIS=1.25;/* dead zone (enter/leave), run threshold, axis hysteresis (~51° to switch) */
  let enabled=false,J=null,dir=null,run=false,B=null,pressedAt=0,restKey='',lastBtn='',lefty=false;

  /* ---------- touch detection ---------- */
  function enable(){if(enabled)return;enabled=true;game.classList.add('touch-on')}
  try{if(matchMedia('(pointer: coarse)').matches)enable()}catch(e){}
  addEventListener('pointerdown',e=>{if(e.pointerType==='touch')enable()},{capture:true,passive:true});
  function setLefty(v){lefty=!!v;game.classList.toggle('lefty',lefty);restKey='';try{localStorage.setItem('pv-lefty',lefty?'1':'0')}catch(e){}}
  try{lefty=localStorage.getItem('pv-lefty')==='1'}catch(e){}game.classList.toggle('lefty',lefty);

  /* ---------- geometry ---------- */
  const probe=document.createElement('div');probe.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';game.append(probe);
  const insets=()=>{const c=getComputedStyle(probe);return{t:parseFloat(c.paddingTop)||0,r:parseFloat(c.paddingRight)||0,b:parseFloat(c.paddingBottom)||0,l:parseFloat(c.paddingLeft)||0}};
  const radius=()=>innerWidth<360?52:60;
  const BOTTOM_GAP=32;/* clear of the bottom-edge gesture area */
  function restPos(){
    const r=radius(),s=insets(),y=innerHeight-s.b-BOTTOM_GAP-r;
    if(lefty)return{x:innerWidth-s.r-24-r,y};
    let x=s.l+24+r;const mr=!mini.hidden&&getComputedStyle(mini).display!=='none'?mini.getBoundingClientRect():null;
    if(mr&&mr.width)x=Math.max(x,mr.right+20+r);/* landscape/tablet: sit beside the minimap */
    return{x,y};
  }
  function clampBase(x,y){const r=radius(),s=insets();return{x:Math.max(s.l+r+4,Math.min(innerWidth-s.r-r-4,x)),y:Math.max(s.t+r+4,Math.min(innerHeight-s.b-r-12,y))}}
  const place=(x,y)=>{joy.style.transform=`translate(${x}px,${y}px)`};

  /* ---------- direction + run, fed into the keyboard's input state ---------- */
  function pick(dx,dy,d,r){
    if(d<(dir?DEAD_OUT:DEAD)*r)return null;
    const ax=Math.abs(dx),ay=Math.abs(dy);let horiz;
    if(dir==='left'||dir==='right')horiz=!(ay>ax*AXIS);else if(dir==='up'||dir==='down')horiz=ax>ay*AXIS;else horiz=ax>=ay;
    return horiz?(dx>0?'right':'left'):(dy>0?'down':'up');
  }
  function tick(){try{if(navigator.vibrate&&(!navigator.userActivation||navigator.userActivation.hasBeenActive))navigator.vibrate(8)}catch(e){}}
  function setDir(n){
    if(n===dir)return;
    if(dir){const i=held.indexOf(dir);if(i>=0)held.splice(i,1)}
    dir=n;joy.dataset.dir=n||'';
    if(n){const i=held.indexOf(n);if(i>=0)held.splice(i,1);held.push(n);pressAt[n]=performance.now();path=[];pendingAct=null;tick()}
  }
  function setRun(v){if(v===run)return;run=v;running=v;if(v)joy.dataset.run='';else delete joy.dataset.run}

  /* ---------- joystick pointer handling (one finger, captured) ---------- */
  function move(e){
    const r=radius();let dx=e.clientX-J.bx,dy=e.clientY-J.by;const d=Math.hypot(dx,dy),k=d>r?r/d:1;
    knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;/* 1:1, no easing while dragging */
    setDir(pick(dx,dy,d,r));setRun(!!dir&&d>=RUN*r);
  }
  function release(){
    if(!J&&!dir&&!run)return;
    setDir(null);setRun(false);J=null;delete joy.dataset.active;knob.style.transform='';const p=restPos();place(p.x,p.y);
  }
  zone.addEventListener('pointerdown',e=>{
    if(J||!G||G.paused||D.open)return;e.preventDefault();e.stopPropagation();
    try{zone.setPointerCapture(e.pointerId)}catch(err){}audioInit();
    const p=clampBase(e.clientX,e.clientY);J={id:e.pointerId,bx:p.x,by:p.y};joy.dataset.active='';place(p.x,p.y);move(e);
  });
  zone.addEventListener('pointermove',e=>{if(J&&e.pointerId===J.id)move(e)});
  for(const t of['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(t,e=>{if(J&&e.pointerId===J.id)release()});
  zone.addEventListener('contextmenu',e=>e.preventDefault());

  /* ---------- action button: acts on press; Enter/Space when focused ---------- */
  function act(){audioInit();if(D.open)advance();else if(G&&!G.paused&&performance.now()>inputLock)tryInteract()}
  btn.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();if(B!==null)return;B=e.pointerId;try{btn.setPointerCapture(e.pointerId)}catch(err){}
    btn.dataset.pressed='';pressedAt=performance.now();act();
  });
  const unpress=e=>{if(e.pointerId!==B)return;B=null;setTimeout(()=>{delete btn.dataset.pressed},Math.max(0,100-(performance.now()-pressedAt)))};
  for(const t of['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(t,unpress);
  btn.addEventListener('click',e=>{if(e.detail===0)act()});/* keyboard activation only; touches act on press */
  btn.addEventListener('contextmenu',e=>e.preventDefault());
  /* Acting on press can open a modal under the finger; cancelling touchstart stops the browser's
     synthetic click from landing on whatever is underneath when the finger lifts (a "ghost click"). */
  for(const el of[btn,zone])el.addEventListener('touchstart',e=>{if(e.cancelable)e.preventDefault()},{passive:false});

  addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});

  /* ---------- per frame: visibility, button state, resting spot ---------- */
  function frame(){
    const live=enabled&&G&&!game.hidden,modalOpen=!modal.hidden;
    const showJoy=live&&!modalOpen&&!D.open&&!G.paused,showBtn=live&&!modalOpen;
    if(zone.hidden===showJoy){zone.hidden=!showJoy;joy.hidden=!showJoy}
    if(!showJoy&&(J||dir))release();
    if(showJoy&&!J){const p=restPos(),k=p.x+','+p.y+','+innerWidth;if(k!==restKey){restKey=k;joy.style.transition='none';place(p.x,p.y);void joy.offsetWidth;joy.style.transition='';
      /* the touch zone is the left 40% of the lower half, widened so it always covers the resting stick */
      const reach=lefty?innerWidth-p.x+radius()+16:p.x+radius()+16;zone.style.width=Math.max(innerWidth*.4,reach)+'px'}}
    if(btn.hidden===showBtn)btn.hidden=!showBtn;
    if(!showBtn)return;
    let on=false,verb='';
    if(D.open){on=true;verb='Next'}
    else if(!player.moving&&!G.paused){const[x,y]=frontTile(player),tg=targetAt(x,y);if(tg){on=true;verb=isTargetRef(tg)?(tg.type==='npc'?'Talk':'Investigate'):(tg.type==='npc'?'Talk':'Inspect')}}
    const key=on+verb+(D.open?'d':'');
    if(key!==lastBtn){lastBtn=key;if(on)btn.dataset.on='';else delete btn.dataset.on;verbEl.textContent=verb;
      btn.setAttribute('aria-label',on?(D.open?'Next':'Action: '+verb):'Action: nothing in front of you')}
    /* during dialogs, sit just above the dialog box */
    if(D.open&&!dlg.hidden){const top=dlg.getBoundingClientRect().top;btn.style.bottom=Math.max(0,innerHeight-top+12)+'px'}else if(btn.style.bottom)btn.style.bottom='';
  }
  return{frame,release,setLefty,get enabled(){return enabled},get lefty(){return lefty},get dir(){return dir},get run(){return run}};
})();
