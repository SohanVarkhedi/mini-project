/* =========================================================
   UI helpers for the portal design system (docs/UI_GUIDE.md §6).
   Standalone (no game globals) so /styleguide.html can use it too.
   toast(), openDrawer(), confirmModal(), renderAddr(), icon(), avatarHTML(), theme helpers.
   ========================================================= */
const UI=(()=>{
  const escH=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- icons (24px grid, stroke = currentColor) ---------- */
  const P={
    overview:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.2 14.8c1.9.8 3 2.5 3.3 5.2"/>',
    programs:'<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
    reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play:'<path d="M7 4.5v15l12-7.5z"/>',
    journey:'<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
    skills:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    certificate:'<circle cx="12" cy="9" r="6"/><path d="m8.5 14 -1.5 7 5-2.5 5 2.5-1.5-7"/>',
    profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
    system:'<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    close:'<path d="M6 6l12 12M18 6 6 18"/>',
    check:'<path d="m4.5 12.5 5 5 10-11"/>',
    alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    circle:'<circle cx="12" cy="12" r="8"/>',
    dash:'<path d="M6 12h12"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M19 8v6M16 11h6"/>',
    target:'<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
    shield:'<path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6z"/>',
    /* skill icons (content/skills.json) */
    link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    paperclip:'<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
    phone:'<path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1 4.2 1.6V17a2.5 2.5 0 0 1-2.5 2.5A15 15 0 0 1 2.5 6 2.5 2.5 0 0 1 5 3.5z"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    key:'<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16 7l2.5 2.5M14 9l2 2"/>',
    printer:'<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    door:'<path d="M5 21V3.5h11V21M3 21h18"/><path d="M16 5.5 20 4v17"/><circle cx="12.5" cy="12.5" r=".8"/>',
    rupee:'<path d="M7 4h11M7 8.5h11M7 4h3.5a4.5 4.5 0 0 1 0 9H7l8.5 7.5"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    qr:'<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6h-6M17 20.5v-1"/>',
    copy:'<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    wifiOff:'<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.5-2.4M14.5 10.1A10 10 0 0 1 19 12.5M2 9a15 15 0 0 1 4.6-2.7M12 4.5a15 15 0 0 1 10 4.5"/><circle cx="12" cy="20" r=".8"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  };
  const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name]||P.circle}</svg>`;
  const mark=(lg)=>`<span class="mark${lg?' mark--lg':''}" aria-hidden="true"><svg viewBox="0 0 46 52" fill="none"><path d="M23 3 41 9.5v14.2c0 11.4-7.4 20-18 24.8C12.4 43.7 5 35.1 5 23.7V9.5L23 3Z" fill="currentColor"/><path class="mark-check" d="M14.5 26.5l6 6L32 20.5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

  /* ---------- avatar ---------- */
  const hue=s=>{let h=0;for(const c of String(s||'?'))h=(h*31+c.charCodeAt(0))>>>0;return [210,152,262,24,330,190,96,288][h%8]};
  const initials=name=>(String(name||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?');
  const avatarHTML=(name,{size='',seed}={})=>`<span class="avatar${size?' avatar--'+size:''}" style="--av-h:${hue(seed||name)}" aria-hidden="true">${escH(initials(name))}</span>`;

  /* ---------- inspected text with confusable characters ---------- */
  /* (no regex lookbehind: older iOS Safari can't parse it) */
  const isLetter=c=>!!c&&/[a-z]/i.test(c);
  function confusables(s){
    const marks=[];
    for(let i=0;i<s.length;i++){
      const c=s[i],near=isLetter(s[i-1])||isLetter(s[i+1]);
      if(c==='0'&&near)marks.push({s:i,e:i+1,why:'zero, not the letter o'});
      else if(c==='1'&&near)marks.push({s:i,e:i+1,why:'one, not the letter l'});
      else if(s.slice(i,i+2)==='rn'){marks.push({s:i,e:i+2,why:'r and n, not the letter m'});i++}
      else if(s.slice(i,i+2)==='vv'){marks.push({s:i,e:i+2,why:'two v’s, not the letter w'});i++}
      else if(c.charCodeAt(0)>127&&/\p{L}/u.test(c))marks.push({s:i,e:i+1,why:'a non-Latin letter that looks like a Latin one'});
    }
    return marks;
  }
  function renderAddr(text,{flag=false,label}={}){
    const s=String(text==null?'':text);
    if(!flag)return`<span class="addr">${escH(s)}</span>`;
    const marks=confusables(s);
    let out='',i=0;const notes=[];
    for(const k of marks){out+=escH(s.slice(i,k.s))+`<mark title="${escH(k.why)}">${escH(s.slice(k.s,k.e))}</mark>`;i=k.e;notes.push(`“${s.slice(k.s,k.e)}” is ${k.why}`)}
    out+=escH(s.slice(i));
    const sr=notes.length?`<span class="sr-only"> (look-alike characters: ${escH(notes.join('; '))})</span>`:'';
    return`<span class="addr"${label?` aria-label="${escH(label)}"`:''}>${out}</span>${sr}`;
  }

  /* ---------- overlay layer ---------- */
  function layer(){let l=document.getElementById('ui-layer');if(!l){l=document.createElement('div');l.id='ui-layer';l.className='ds';document.body.append(l)}return l}
  const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trapFocus(panel,e){if(e.key!=='Tab')return;const f=[...panel.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null);if(!f.length)return;const a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
  const open=el=>requestAnimationFrame(()=>requestAnimationFrame(()=>el.setAttribute('data-open','')));
  function closeAnim(el,ms){el.setAttribute('data-closing','');el.removeAttribute('data-open');return new Promise(r=>setTimeout(()=>{el.remove();r()},reduced()?0:ms))}
  const stack=[];
  document.addEventListener('keydown',e=>{const top=stack[stack.length-1];if(!top)return;if(e.key==='Escape'){e.preventDefault();top.dismiss()}else trapFocus(top.panel,e)});

  /* drawer: right side, 480 px, full screen on phones. body: HTML string or Node. */
  function openDrawer({title,body,footer,label,onClose}={}){
    const ret=document.activeElement,l=layer();
    const scrim=document.createElement('div');scrim.className='scrim';
    const d=document.createElement('aside');d.className='drawer';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');
    const hid='dr'+Math.random().toString(36).slice(2,8);d.setAttribute('aria-labelledby',hid);
    d.innerHTML=`<header class="drawer-head"><h2 id="${hid}">${escH(title||'')}</h2><button type="button" class="button button--quiet button--icon" data-close aria-label="${escH(label||'Close panel')}">${icon('close')}</button></header><div class="drawer-body"></div>${footer?'<footer class="drawer-foot"></footer>':''}`;
    const bodyEl=d.querySelector('.drawer-body');if(body instanceof Node)bodyEl.append(body);else bodyEl.innerHTML=body||'';
    if(footer){const f=d.querySelector('.drawer-foot');if(footer instanceof Node)f.append(footer);else f.innerHTML=footer}
    l.append(scrim,d);document.documentElement.style.overflow='hidden';
    let closed=false;
    const api={el:d,body:bodyEl,panel:d,close:async()=>{if(closed)return;closed=true;const i=stack.indexOf(api);if(i>=0)stack.splice(i,1);if(!stack.length)document.documentElement.style.overflow='';scrim.removeAttribute('data-open');setTimeout(()=>scrim.remove(),reduced()?0:220);await closeAnim(d,200);onClose&&onClose();ret&&ret.focus&&ret.focus({preventScroll:true})}};
    api.dismiss=api.close;stack.push(api);
    scrim.addEventListener('click',api.close);d.querySelector('[data-close]').addEventListener('click',api.close);
    open(scrim);open(d);setTimeout(()=>{const f=bodyEl.querySelector(FOCUSABLE)||d.querySelector('[data-close]');f.focus({preventScroll:true})},60);
    return api;
  }

  /* confirm modal: centred, for confirmations only. Resolves true/false. */
  function confirmModal({title,body='',confirm='Confirm',cancel='Cancel',danger=false}={}){
    return new Promise(resolve=>{
      const ret=document.activeElement,l=layer();
      const scrim=document.createElement('div');scrim.className='scrim';
      const m=document.createElement('div');m.className='modal-panel';m.setAttribute('role','alertdialog');m.setAttribute('aria-modal','true');
      const hid='md'+Math.random().toString(36).slice(2,8);m.setAttribute('aria-labelledby',hid);m.setAttribute('aria-describedby',hid+'d');
      m.innerHTML=`<h2 id="${hid}">${escH(title)}</h2><p id="${hid}d">${escH(body)}</p><div class="modal-actions"><button type="button" class="button button--secondary" data-v="0">${escH(cancel)}</button><button type="button" class="button ${danger?'button--danger':'button--primary'}" data-v="1">${escH(confirm)}</button></div>`;
      l.append(scrim,m);let done=false;
      const api={panel:m,dismiss:()=>finish(false)};stack.push(api);
      function finish(v){if(done)return;done=true;const i=stack.indexOf(api);if(i>=0)stack.splice(i,1);scrim.removeAttribute('data-open');setTimeout(()=>scrim.remove(),reduced()?0:160);closeAnim(m,140).then(()=>{ret&&ret.focus&&ret.focus({preventScroll:true})});resolve(v)}
      m.addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b)finish(b.dataset.v==='1')});scrim.addEventListener('click',()=>finish(false));
      open(scrim);open(m);setTimeout(()=>m.querySelector('[data-v="0"]').focus({preventScroll:true}),40);
    });
  }

  /* form modal: a confirmation with one text field (e.g. an optional reminder message).
     Resolves the trimmed text, or null when cancelled. */
  function formModal({title,body='',label,placeholder='',maxlength=140,confirm='Send',cancel='Cancel'}={}){
    return new Promise(resolve=>{
      const ret=document.activeElement,l=layer();
      const scrim=document.createElement('div');scrim.className='scrim';
      const m=document.createElement('div');m.className='modal-panel';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
      const hid='fm'+Math.random().toString(36).slice(2,8);m.setAttribute('aria-labelledby',hid);
      m.innerHTML=`<h2 id="${hid}">${escH(title)}</h2>${body?`<p>${escH(body)}</p>`:''}<form novalidate style="display:grid;gap:12px;margin-top:16px"><div class="field"><label class="field-label" for="${hid}f">${escH(label)} <small>(optional)</small></label><textarea class="input" id="${hid}f" maxlength="${maxlength}" placeholder="${escH(placeholder)}" aria-describedby="${hid}c"></textarea><span class="field-hint" id="${hid}c" aria-live="polite">0 / ${maxlength}</span></div><div class="modal-actions" style="margin-top:4px"><button type="button" class="button button--secondary" data-v="0">${escH(cancel)}</button><button type="submit" class="button button--primary">${escH(confirm)}</button></div></form>`;
      l.append(scrim,m);let done=false;const ta=m.querySelector('textarea'),cnt=m.querySelector('.field-hint');
      ta.addEventListener('input',()=>{cnt.textContent=`${ta.value.length} / ${maxlength}`});
      const api={panel:m,dismiss:()=>finish(null)};stack.push(api);
      function finish(v){if(done)return;done=true;const i=stack.indexOf(api);if(i>=0)stack.splice(i,1);scrim.removeAttribute('data-open');setTimeout(()=>scrim.remove(),reduced()?0:160);closeAnim(m,140).then(()=>{ret&&ret.focus&&ret.focus({preventScroll:true})});resolve(v)}
      m.querySelector('form').addEventListener('submit',e=>{e.preventDefault();finish(ta.value.trim())});
      m.querySelector('[data-v="0"]').addEventListener('click',()=>finish(null));scrim.addEventListener('click',()=>finish(null));
      open(scrim);open(m);setTimeout(()=>ta.focus({preventScroll:true}),40);
    });
  }

  /* toast: one region (bottom-right on desktop, top on phones), stacks, pauses when the tab is
     hidden or hovered, dismiss with ✕, Escape, or a sideways swipe. */
  let toaster=null;const toasts=[];
  function region(){if(toaster&&toaster.isConnected)return toaster;toaster=document.createElement('section');toaster.className='toaster';toaster.setAttribute('aria-live','polite');toaster.setAttribute('aria-label','Notifications');layer().append(toaster);return toaster}
  function toast(title,{type='success',description='',duration=4000}={}){
    const r=region(),t=document.createElement('div');t.className='toast-item';t.dataset.type=type;t.setAttribute('role',type==='error'?'alert':'status');
    t.innerHTML=`${icon(type==='error'?'alert':type==='info'?'info':'check')}<div><b>${escH(title)}</b>${description?`<p>${escH(description)}</p>`:''}</div><button type="button" class="button button--quiet button--icon toast-close" aria-label="Dismiss notification">${icon('close','icon--sm')}</button>`;
    r.append(t);while(toasts.length>=3)toasts[0].dismiss();
    let left=duration,started=Date.now(),timer=null,hover=false,gone=false;
    const run=()=>{if(gone||hover||document.hidden)return;clearTimeout(timer);started=Date.now();timer=setTimeout(dismiss,left)};
    const pause=()=>{if(timer){clearTimeout(timer);timer=null;left=Math.max(600,left-(Date.now()-started))}};
    function dismiss(){if(gone)return;gone=true;clearTimeout(timer);const i=toasts.indexOf(api);if(i>=0)toasts.splice(i,1);document.removeEventListener('visibilitychange',vis);closeAnim(t,140)}
    const vis=()=>document.hidden?pause():run();document.addEventListener('visibilitychange',vis);
    t.addEventListener('mouseenter',()=>{hover=true;pause()});t.addEventListener('mouseleave',()=>{hover=false;run()});
    t.querySelector('.toast-close').addEventListener('click',dismiss);
    /* swipe: distance or velocity, pointer captured */
    let sx=null,st=0;
    t.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;sx=e.clientX;st=Date.now();t.setPointerCapture(e.pointerId);t.style.transition='none';pause()});
    t.addEventListener('pointermove',e=>{if(sx==null)return;const dx=e.clientX-sx;t.style.transform=`translateX(${dx}px)`;t.style.opacity=String(Math.max(.2,1-Math.abs(dx)/240))});
    const end=e=>{if(sx==null)return;const dx=e.clientX-sx,v=Math.abs(dx)/Math.max(1,Date.now()-st);sx=null;t.style.transition='';
      if(Math.abs(dx)>80||v>.11){t.style.transform=`translateX(${dx>0?120:-120}%)`;t.style.opacity='0';gone=true;clearTimeout(timer);const i=toasts.indexOf(api);if(i>=0)toasts.splice(i,1);setTimeout(()=>t.remove(),160)}else{t.style.transform='';t.style.opacity='';run()}};
    t.addEventListener('pointerup',end);t.addEventListener('pointercancel',end);
    const api={el:t,dismiss};toasts.push(api);open(t);run();return api;
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!stack.length&&toasts.length)toasts[toasts.length-1].dismiss()});

  /* ---------- theme: System / Light / Dark, saved per device ---------- */
  const THEME_KEY='pv-theme';
  function getTheme(){try{const t=localStorage.getItem(THEME_KEY);return t==='light'||t==='dark'?t:'system'}catch(e){return'system'}}
  function setTheme(t){try{if(t==='system')localStorage.removeItem(THEME_KEY);else localStorage.setItem(THEME_KEY,t)}catch(e){}
    if(t==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
    document.querySelectorAll('[data-theme-set]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeSet===t)))}
  function themeSwitch(extra=''){const cur=getTheme();return`<div class="segmented segmented--icons theme-switch ${extra}" role="group" aria-label="Theme">${[['system','System theme'],['light','Light theme'],['dark','Dark theme']].map(([k,l])=>`<button type="button" data-theme-set="${k}" aria-pressed="${cur===k}" aria-label="${l}" title="${l}">${icon({system:'system',light:'sun',dark:'moon'}[k])}</button>`).join('')}</div>`}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-set]');if(b)setTheme(b.dataset.themeSet)});

  return{esc:escH,icon,mark,avatarHTML,initials,renderAddr,openDrawer,confirmModal,formModal,toast,getTheme,setTheme,themeSwitch,reduced};
})();
const{toast:uiToast,openDrawer,confirmModal,renderAddr}=UI;
