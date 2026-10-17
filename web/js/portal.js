/* =========================================================
   PORTAL: data layer (db + user capabilities, demo fallback) + views
   ========================================================= */
const BADGE={orientation:'Sharp Eye',inbox:'Inbox Guardian',signals:'Signal Keeper',access:'Gatekeeper',executive:'Fraud Buster'};
const Store={ready:false,mode:'demo',me:{id:'me',name:'',avatar:''},isMgr:true,canWrite:true,db:null,user:null,
  members:{},assignments:{},progress:{},config:{defaultLevels:[],defaultDueDays:14},myMember:null,myAssign:null,myProg:null,profiles:{}};
let tab='team';const draft={sel:new Set(),levels:new Set(['orientation','inbox']),due:'',note:'',defLevels:null,defDays:null,joinName:'',joinDept:'',msgA:'',msgD:''};
const dayMs=864e5,todayISO=()=>new Date().toISOString().slice(0,10);
const addDaysISO=(ms,d)=>new Date(ms+d*dayMs).toISOString().slice(0,10);
const fmtDate=iso=>{if(!iso)return'';const d=new Date(iso+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const ago=ms=>{if(!ms)return'never';const m=Math.round((Date.now()-ms)/6e4);if(m<2)return'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';return Math.round(h/24)+' d ago'};
function initialsAv(name,col){const ini=(name||'?').split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();return'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${col||'#2f6b4a'}"/><text x="32" y="41" font-family="Inter,Arial" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${ini}</text></svg>`)}
const COLS=['#2f6b4a','#7c3aed','#0e7490','#b45309','#be123c','#1d4ed8','#4d7c0f'];
const avatarFor=(id,name)=>Store.profiles[id]&&Store.profiles[id].avatarUrl||initialsAv(name,COLS[(hash(String(id).length,String(id).charCodeAt(2)||0)*COLS.length)|0]);

/* ---------- effective assignment / progress helpers ---------- */
function assignFor(uid,member,assign){
  if(assign&&assign.levels&&assign.levels.length)return{...assign,source:'manager'};
  const c=Store.config;if(member&&c.defaultLevels&&c.defaultLevels.length)return{levels:c.defaultLevels,due:addDaysISO(member.joinedAt||Date.now(),c.defaultDueDays||14),note:'',source:'default'};
  return null;
}
const lvDone=(prog,lid)=>!!(prog&&prog.levels&&prog.levels[lid]&&prog.levels[lid].done);
function statusOf(a,prog){
  if(!a)return{k:'none',t:'Not assigned'};
  const done=a.levels.filter(l=>lvDone(prog,l)).length;
  if(done===a.levels.length)return{k:'ok',t:'Completed',done};
  if(a.due&&a.due<todayISO())return{k:'late',t:'Overdue',done};
  return{k:done?'go':'',t:done?'In progress':'Not started',done};
}

/* ---------- demo data ---------- */
function initDemo(){
  Store.mode='demo';Store.me={id:'me',name:'Demo user',avatar:''};Store.isMgr=true;Store.canWrite=true;
  const now=Date.now();
  Store.members={a1:{name:'Aarav Mehta',dept:'Sales',joinedAt:now-20*dayMs},a2:{name:'Sara Khan',dept:'Finance',joinedAt:now-18*dayMs},a3:{name:'Rohan Das',dept:'Engineering',joinedAt:now-9*dayMs},a4:{name:'Meera Iyer',dept:'People & HR',joinedAt:now-3*dayMs},me:{name:'Demo user',dept:'Operations',joinedAt:now-dayMs}};
  Store.assignments={a1:{levels:['orientation','inbox','signals'],due:addDaysISO(now,5),note:'Please finish before the quarterly review.',assignedAt:now-10*dayMs,by:'me'},a2:{levels:['orientation','inbox','signals','access','executive'],due:addDaysISO(now,-2),note:'',assignedAt:now-15*dayMs,by:'me'},a3:{levels:['orientation','inbox'],due:addDaysISO(now,10),note:'',assignedAt:now-7*dayMs,by:'me'},me:{levels:['orientation','inbox','signals','access','executive'],due:addDaysISO(now,14),note:'Welcome aboard! Start with Office Orientation.',assignedAt:now,by:'me'}};
  const mk=(best,outs)=>({best,last:best,stars:best>=90?3:best>=70?2:1,done:true,attempts:1,completedAt:now-2*dayMs,outcomes:outs});
  Store.progress={a1:{levels:{orientation:mk(85,{usb:'safe',qr:'safe',sticky:'acceptable',laptop:'safe'}),inbox:mk(73,{e1:'safe',e2:'compromise',e3:'safe',e4:'safe',e5:'false_alarm',e6:'safe'})},lastActive:now-3600e3},
    a2:{levels:{orientation:mk(100,{usb:'safe',qr:'safe',sticky:'safe',laptop:'safe'})},lastActive:now-4*dayMs},
    a3:{levels:{orientation:mk(55,{usb:'compromise',qr:'compromise',sticky:'safe',laptop:'acceptable'}),inbox:mk(93,{e1:'safe',e2:'safe',e3:'safe',e4:'safe',e5:'safe',e6:'acceptable'})},lastActive:now-8*3600e3}};
  Store.config={defaultLevels:['orientation','inbox'],defaultDueDays:14};
  syncMine();Store.ready=true;$('demoSeg').hidden=false;renderPortal();
}
function syncMine(){const id=Store.me.id;if(Store.mode==='demo'){Store.myMember=Store.members[id]||null;Store.myAssign=Store.assignments[id]||null;Store.myProg=Store.progress[id]||null}}

/* ---------- live data ---------- */
let pendingRender=false;
function scheduleRender(){if(pendingRender)return;pendingRender=true;requestAnimationFrame(()=>{pendingRender=false;if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('[data-keep]')){holdRender=true;return}renderPortal()})}
let holdRender=false;document.addEventListener('focusout',()=>{if(holdRender){holdRender=false;setTimeout(()=>{if(!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('[data-keep]')))renderPortal();else holdRender=true},0)}});
async function initLive(){
  if(!window.claude||typeof window.claude.use!=='function')return false;
  let db,user;try{[db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')])}catch(e){return false}
  if(!db||!user)return false;const me=await user.me();if(!me||!me.id)return false;
  Object.assign(Store,{mode:'live',db,user,me:{id:me.id,name:me.name||'',avatar:me.avatarUrl},isMgr:!!me.canEdit,canWrite:await user.can('data.write')});
  const err=()=>{};
  db.doc('members/'+me.id).onSnapshot(s=>{Store.myMember=s.exists?s.data():null;Store.ready=true;scheduleRender()},err);
  db.doc('assignments/'+me.id).onSnapshot(s=>{Store.myAssign=s.exists?s.data():null;scheduleRender()},err);
  db.doc('progress/'+me.id).onSnapshot(s=>{Store.myProg=s.exists?s.data():null;scheduleRender()},err);
  db.doc('config/team').onSnapshot(s=>{if(s.exists)Store.config=Object.assign({defaultLevels:[],defaultDueDays:14},s.data());scheduleRender()},err);
  if(Store.isMgr){
    const coll=(name,key)=>db.collection(name).onSnapshot(q=>{Store[key]=Object.fromEntries(q.docs.map(d=>[d.id,d.data()]));if(key==='members')resolveProfiles();scheduleRender()},err);
    coll('members','members');coll('assignments','assignments');coll('progress','progress');
  }
  setTimeout(()=>{if(!Store.ready){Store.ready=true;scheduleRender()}},2500);
  return true;
}
async function resolveProfiles(){if(!Store.user)return;const ids=Object.keys(Store.members);if(!ids.length)return;try{const ps=await Store.user.profiles(ids);Store.profiles=Object.assign(Store.profiles,ps);scheduleRender()}catch(e){}}
async function write(path,data){
  if(Store.mode==='local')return writeLocal(path,data);
  if(Store.mode==='demo'){const[c,id]=path.split('/');const map=c==='members'?Store.members:c==='assignments'?Store.assignments:c==='progress'?Store.progress:null;
    if(c==='config'){Store.config=data}else if(data===null)delete map[id];else map[id]=data;syncMine();scheduleRender();return true}
  try{if(data===null)await Store.db.doc(path).delete();else await Store.db.doc(path).set(data);return true}catch(e){console.warn('write failed',path,e&&e.code);return e&&e.code||'error'}
}

/* ---------- local server mode (Flask + SQLite, see server.py) ---------- */
let authMode='login';
const API=(p,opt={})=>fetch('api/'+p,Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}},opt)).then(async r=>{let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw Object.assign(new Error((j&&j.error)||r.statusText),{status:r.status});return j});
async function initLocal(){
  if(location.protocol==='file:')return false;
  try{await API('health')}catch(e){return false}
  Store.mode='local';Store.canWrite=true;Store.authed=false;
  try{setLocalMe(await API('me'));await loadLocalState()}catch(e){Store.authed=false}
  Store.ready=true;renderPortal();
  setInterval(()=>{if(Store.authed&&$('game').hidden&&!document.hidden)loadLocalState().catch(()=>{})},10000);
  return true;
}
function setLocalMe(me){Store.authed=true;Store.me={id:me.id,name:me.name,avatar:'',email:me.email};Store.isMgr=me.role==='manager';tab=Store.isMgr?'team':'me'}
async function loadLocalState(){const s=await API('state');Store.config=Object.assign({defaultLevels:[],defaultDueDays:14},s.config||{});
  if(Store.isMgr){Store.members=s.members||{};Store.assignments=s.assignments||{};Store.progress=s.progress||{}}
  Store.myMember=s.myMember||null;Store.myAssign=s.myAssign||null;Store.myProg=s.myProg||null;scheduleRender()}
async function writeLocal(path,data){const[c,id]=path.split('/');
  try{if(c==='assignments')await API('assignments/'+encodeURIComponent(id),data===null?{method:'DELETE'}:{method:'PUT',body:JSON.stringify(data)});
    else if(c==='config')await API('config',{method:'PUT',body:JSON.stringify(data)});
    else if(c==='progress')await API('progress',{method:'PUT',body:JSON.stringify(data)});
    else if(c==='members')await API('profile',{method:'PUT',body:JSON.stringify(data)});
    loadLocalState().catch(()=>{});return true}catch(e){return e.status===403?'invalid_argument':'error'}}
function authView(){const reg=authMode==='register';
  return`<div class="card joinc" data-keep><div class="seg" id="authSeg" style="margin-bottom:16px"><button type="button" data-am="login" class="${reg?'':'on'}">Sign in</button><button type="button" data-am="register" class="${reg?'on':''}">Create account</button></div>
   <h2 style="font:700 24px/1.15 var(--display);margin:0 0 6px">${reg?"Join your team's training":'Sign in to PhishVerse'}</h2><p class="sub" style="font-size:13.5px">${reg?'Create an employee account. Your manager will see you on the team dashboard.':'Managers and employees sign in here.'}</p>
   <form id="authForm" novalidate>${reg?`<label class="f" for="aName">Full name</label><input class="inp" id="aName" maxlength="60" autocomplete="name" required>
   <label class="f" for="aDept">Team or department</label><input class="inp" id="aDept" maxlength="40" placeholder="e.g. Finance">`:''}
   <label class="f" for="aEmail">Email</label><input class="inp" id="aEmail" type="email" maxlength="120" autocomplete="email" required>
   <label class="f" for="aPw">Password</label><input class="inp" id="aPw" type="password" minlength="8" autocomplete="${reg?'new-password':'current-password'}" required>
   <button class="btn wide" type="submit" id="authBtn">${reg?'Create account':'Sign in'}</button><div class="note" id="authNote"></div></form></div>`}
function bindAuth(){
  const sg=$('authSeg');sg&&sg.addEventListener('click',e=>{const b=e.target.closest('[data-am]');if(!b)return;authMode=b.dataset.am;renderPortal()});
  const f=$('authForm');f&&f.addEventListener('submit',async e=>{e.preventDefault();const note=$('authNote'),btn=$('authBtn');btn.disabled=true;note.textContent='';
    const body={email:$('aEmail').value.trim(),password:$('aPw').value};if(authMode==='register'){body.name=$('aName').value.trim();body.dept=$('aDept').value.trim()}
    try{setLocalMe(await API(authMode,{method:'POST',body:JSON.stringify(body)}));await loadLocalState();renderPortal()}catch(err){note.textContent=err.message||'Something went wrong.';btn.disabled=false}});
}
async function logoutLocal(){try{await API('logout',{method:'POST',body:'{}'})}catch(e){}Store.authed=false;Store.members={};Store.assignments={};Store.progress={};Store.myMember=Store.myAssign=Store.myProg=null;Store.me={id:'',name:'',avatar:''};renderPortal()}
let progQ=Promise.resolve();
onLevelComplete=(lid,s)=>{
  progQ=progQ.then(async()=>{
    const cur=JSON.parse(JSON.stringify(Store.myProg||{levels:{}}));cur.levels=cur.levels||{};const L=cur.levels[lid]||{attempts:0,best:0,stars:0};
    L.attempts=(L.attempts||0)+1;L.last=s.score;if(s.score>=(L.best||0)){L.best=s.score;L.outcomes=s.outcomes}L.stars=Math.max(L.stars||0,s.stars);L.done=true;L.completedAt=Date.now();L.timeMs=s.timeMs;
    cur.levels[lid]=L;cur.lastActive=Date.now();
    if(Store.mode==='demo'){Store.progress[Store.me.id]=cur;syncMine();return{saved:false,msg:'Demo mode: saved for this session only.'}}
    if(Store.canWrite===false)return{saved:false,msg:'View-only access: ask your manager for Contributor access so results can be saved.'};
    const r=await write('progress/'+Store.me.id,cur);if(r===true){Store.myProg=cur;return{saved:true}}
    return{saved:false,msg:r==='invalid_argument'?'Your access level is view-only, so this result could not be saved.':'Could not save right now. Your result is shown above.'};
  });return progQ;
};
window.onGameExit=()=>renderPortal();

/* ---------- views ---------- */
const view=$('view');
function header(){
  const m=Store.me;$('meName').textContent=m.name||'You';$('meAv').src=m.avatar||initialsAv(m.name||'You');
  const mgr=Store.isMgr;$('roleChip').textContent=mgr?'Manager':'Employee';$('roleChip').classList.toggle('emp',!mgr);
  $('demoSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',(b.dataset.r==='mgr')===mgr));
}
function renderPortal(){
  header();
  if(!Store.ready){view.innerHTML=`<div class="empty" style="padding:80px 10px"><b>Loading your training…</b>Connecting to your team's records.</div>`;return}
  $('logoutBtn').hidden=!(Store.mode==='local'&&Store.authed);
  if(Store.mode==='local'&&!Store.authed){$('roleChip').hidden=true;view.innerHTML=authView();bindAuth();return}
  $('roleChip').hidden=false;
  const mgr=Store.isMgr;if(!mgr)tab='me';
  const tabs=mgr?`<nav class="tabs" role="tablist">${[['team','Team dashboard'],['modules','Modules'],['me','My training']].map(([k,l])=>`<button type="button" role="tab" data-tab="${k}" class="${tab===k?'on':''}" aria-selected="${tab===k}">${l}</button>`).join('')}</nav>`:'';
  const banner=Store.mode==='demo'&&location.protocol==='file:'?`<div class="banner"><span>ℹ️</span><div><b>Demo mode (opened as a file).</b> Sample data only, nothing is saved. Run <code>python server.py</code> and open <b>http://localhost:5000</b> for real accounts and saved progress.</div></div>`:Store.mode==='demo'?`<div class="banner"><span>ℹ️</span><div><b>Demo mode.</b> You're seeing sample team data. Open this page from your Claude account to manage a real team; switch between Manager and Employee at the top to preview both sides.</div></div>`:'';
  view.innerHTML=banner+tabs+(tab==='team'&&mgr?teamView():tab==='modules'&&mgr?modulesView():meView());
  bindView();
}
function memberRows(){
  const ids=Object.keys(Store.members).sort((a,b)=>(Store.members[a].name||'').localeCompare(Store.members[b].name||''));
  return ids.map(id=>{const m=Store.members[id],a=assignFor(id,m,Store.assignments[id]),pr=Store.progress[id],st=statusOf(a,pr);return{id,m,a,pr,st}});
}
function teamView(){
  const rows=memberRows();let tot=0,dn=0,sc=[],att=0;
  rows.forEach(r=>{if(!r.a)return;tot+=r.a.levels.length;r.a.levels.forEach(l=>{if(lvDone(r.pr,l)){dn++;sc.push(r.pr.levels[l].best)}});const comp=r.pr&&Object.values(r.pr.levels||{}).some(L=>Object.values(L.outcomes||{}).includes('compromise'));if(r.st.k==='late'||comp)att++});
  const pct=tot?Math.round(dn/tot*100):0,avg=sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0;
  const shareHint=Store.mode==='local'?`<div class="banner"><span>👥</span><div><b>Add your team:</b> employees open <b>${esc(location.origin)}</b> and choose <b>Create account</b>. They appear here straight away. (To reach this from other computers, start the server with <code>--host 0.0.0.0</code>.)</div></div>`:Store.mode==='live'?`<div class="banner"><span>👥</span><div><b>Add your team:</b> use <b>Share</b> on this page and add employees as <b>Contributors</b>. When they open it, they join the team and show up here. Viewers can play but their results can't be saved.</div></div>`:'';
  const list=rows.length?`<div class="mrow head"><span>Employee</span><span class="hc">Modules</span><span>Status</span><span></span></div>`+rows.map(r=>{
      const chips=r.a?r.a.levels.map(l=>{const L=r.pr&&r.pr.levels&&r.pr.levels[l],lv=levelById(l);if(!lv)return'';const bad=L&&Object.values(L.outcomes||{}).includes('compromise');return`<span class="mchip ${L&&L.done?(bad?'bad':'done'):''}" title="${esc(lv.title)}">L${lv.n}${L&&L.done?' · '+L.best+'%':''}</span>`}).join(''):'<span class="state">No modules yet</span>';
      return`<div class="mrow"><div class="person"><img alt="" src="${avatarFor(r.id,r.m.name)}"><div style="min-width:0"><b>${esc(r.m.name||'Someone')}${r.id===Store.me.id?' (you)':''}</b><small>${esc(r.m.dept||'')}${r.pr&&r.pr.lastActive?' · active '+ago(r.pr.lastActive):''}</small></div></div><div class="chips">${chips}</div>
        <div class="state ${r.st.k}">${r.st.t}${r.a?`<small>${r.a.source==='default'?'Auto plan · ':''}${r.st.done||0}/${r.a.levels.length}${r.a.due?' · due '+fmtDate(r.a.due):''}</small>`:''}</div>
        ${Store.assignments[r.id]?`<button class="icon-btn" type="button" data-unassign="${esc(r.id)}" aria-label="Remove assignment" title="Remove assignment">✕</button>`:'<span></span>'}</div>`}).join('')
    :`<div class="empty"><b>No one has joined yet</b>${Store.mode==='live'?'Share this page with your team as Contributors. They appear here as soon as they open it.':'Sample employees will appear here.'}</div>`;
  /* most missed */
  const agg={};Object.values(Store.progress).forEach(pr=>Object.entries(pr.levels||{}).forEach(([lid,L])=>Object.entries(L.outcomes||{}).forEach(([tid,o])=>{const k=lid+'/'+tid;agg[k]=agg[k]||{n:0,bad:0};agg[k].n++;if(o==='compromise'||o==='false_alarm')agg[k].bad++})));
  const miss=Object.entries(agg).filter(([,v])=>v.bad).sort((a,b)=>b[1].bad/b[1].n-a[1].bad/a[1].n||b[1].bad-a[1].bad).slice(0,5).map(([k,v])=>{const[lid,tid]=k.split('/'),lv=levelById(lid),t=lv&&lv.tasks.find(x=>x.id===tid);if(!t)return'';const p=Math.round(v.bad/v.n*100);return`<div class="row"><div style="min-width:0">${esc(t.label)}<small>Level ${lv.n} · ${esc(lv.topic)}</small></div><div class="bar"><i style="width:${p}%"></i></div><em>${p}%</em></div>`}).join('');
  const sel=draft.sel,due=draft.due||addDaysISO(Date.now(),14);
  const cfgL=draft.defLevels||new Set(Store.config.defaultLevels||[]),cfgD=draft.defDays||Store.config.defaultDueDays||14;
  return`<h1 class="pg">Team training</h1><p class="lead">Assign PhishVerse modules, set due dates, and see how each person handles real-world attacks.</p>${shareHint}
  <div class="kpis"><div class="kpi"><small>Team members</small><b>${rows.length}</b><span>${rows.filter(r=>r.a).length} with training assigned</span></div><div class="kpi"><small>Completion</small><b>${pct}%</b><span>${dn} of ${tot} assigned modules</span></div><div class="kpi"><small>Average score</small><b>${sc.length?avg+'%':'–'}</b><span>Best attempt per module</span></div><div class="kpi ${att?'warn':''}"><small>Needs attention</small><b>${att}</b><span>Overdue or had a compromise</span></div></div>
  <div class="grid2"><div class="stack"><section class="card"><h2>Team progress</h2><p class="sub">Scores are each person's best attempt. Red chips include at least one compromised decision.</p>${list}</section>
    <section class="card"><h2>Most missed scenarios</h2><p class="sub">Share of attempts that ended in a compromise or a false alarm.</p>${miss?`<div class="missed">${miss}</div>`:'<div class="empty" style="padding:14px"><b>Nothing missed yet</b>Results appear as people finish modules.</div>'}</section></div>
   <div class="stack"><section class="card" data-keep><h2>Assign training</h2><p class="sub">Choose people and modules. Re-assigning replaces their current plan.</p>
     <label class="f">People</label><div class="picks">${rows.length?rows.map(r=>`<label class="pick"><input type="checkbox" data-sel="${esc(r.id)}" ${sel.has(r.id)?'checked':''}><span style="min-width:0">${esc(r.m.name||'Someone')}<small>${esc(r.m.dept||'')}</small></span></label>`).join(''):'<div class="note" style="margin:0">Nobody to assign yet.</div>'}</div>
     <label class="f">Modules</label><div class="picks">${LEVELS.map(l=>`<label class="pick"><input type="checkbox" data-lv="${l.id}" ${draft.levels.has(l.id)?'checked':''}><span>L${l.n} · ${esc(l.title)}<small>${esc(l.topic)} · ${l.minutes} min</small></span></label>`).join('')}</div>
     <label class="f" for="dueIn">Due date</label><input class="inp" type="date" id="dueIn" value="${due}" min="${todayISO()}">
     <label class="f" for="noteIn">Note to employees (optional)</label><textarea class="inp" id="noteIn" maxlength="240" placeholder="e.g. Please finish before the quarterly review.">${esc(draft.note)}</textarea>
     <button class="btn wide" type="button" id="assignBtn" ${sel.size&&draft.levels.size?'':'disabled'}>Assign to ${sel.size||0} ${sel.size===1?'person':'people'}</button><div class="note" id="assignNote">${esc(draft.msgA)}</div></section>
    <section class="card" data-keep><h2>Auto-assign new joiners</h2><p class="sub">Anyone who joins without a plan gets these modules.</p>
     <div class="picks">${LEVELS.map(l=>`<label class="pick"><input type="checkbox" data-def="${l.id}" ${cfgL.has(l.id)?'checked':''}><span>L${l.n} · ${esc(l.title)}</span></label>`).join('')}</div>
     <label class="f" for="defDays">Due after</label><select class="inp" id="defDays">${[7,14,21,30].map(d=>`<option value="${d}" ${+cfgD===d?'selected':''}>${d} days</option>`).join('')}</select>
     <button class="btn ghost wide" type="button" id="saveDef">Save default plan</button><div class="note" id="defNote">${esc(draft.msgD)}</div></section></div></div>`;
}
function modArt(l){
  const c=mk(260,84),g=c.getContext('2d');const gr=g.createLinearGradient(0,0,260,84);gr.addColorStop(0,'#173524');gr.addColorStop(1,'#0e1a14');g.fillStyle=gr;g.fillRect(0,0,260,84);
  g.fillStyle='rgba(74,222,128,.07)';for(let i=0;i<260;i+=16)g.fillRect(i,0,1,84);for(let j=0;j<84;j+=16)g.fillRect(0,j,260,1);
  const who={orientation:'ada',inbox:'dev',signals:'priya',access:'courier',executive:'hale'}[l.id],spr=sheet(P[who]).down[0];g.imageSmoothingEnabled=false;g.drawImage(spr,60,4,spr.width*2.7,spr.height*2.7);
  const prop={orientation:PROPS.usb[0],inbox:deskFrames('mail','')[0],signals:PROPS.phone[1],access:PROPS.notice[0],executive:PROPS.execDesk[0]}[l.id];g.imageSmoothingEnabled=true;const k=Math.min(90/prop.width,62/prop.height);g.drawImage(prop,150,(84-prop.height*k)/2,prop.width*k,prop.height*k);return c;
}
function modulesView(){
  return`<h1 class="pg">Modules</h1><p class="lead">Five levels, ${LEVELS.reduce((s,l)=>s+scoredTasks(l).length,0)} scenarios. Each scenario asks the player to inspect, then decide. Some requests are genuine, so over-reporting costs points too.</p>
  <div class="mods">${LEVELS.map(l=>`<article class="mod"><div class="art" data-art="${l.id}"></div><span class="num">LEVEL ${l.n}</span><h3>${esc(l.title)}</h3><p>${esc(l.blurb)}</p><div class="meta"><span class="tag">${esc(l.topic)}</span><span class="tag">${scoredTasks(l).length} scenarios</span><span class="tag">${l.minutes} min</span></div><button class="btn ghost sm" type="button" data-play="${l.id}" style="align-self:flex-start;margin-top:6px">Preview level ▶</button></article>`).join('')}</div>`;
}
function meView(){
  const m=Store.myMember;
  if(Store.mode==='live'&&!m){const nm=draft.joinName||Store.me.name||'';
    return`<div class="card joinc" data-keep><h2 style="font:700 24px/1.15 var(--display);margin:0 0 6px">Join your team's training</h2><p class="sub" style="font-size:13.5px">Your manager uses this page to assign security training. Tell them who you are.</p>
      <label class="f" for="jName">Your name</label><input class="inp" id="jName" maxlength="60" value="${esc(nm)}" placeholder="Full name">
      <label class="f" for="jDept">Team or department</label><input class="inp" id="jDept" maxlength="40" value="${esc(draft.joinDept)}" placeholder="e.g. Finance">
      <button class="btn wide" type="button" id="joinBtn">Join training</button><div class="note" id="joinNote">${Store.canWrite===false?'Your access is view-only. Ask your manager to share this page with you as a Contributor so your progress can be saved.':''}</div></div>`}
  const a=assignFor(Store.me.id,m,Store.myAssign),pr=Store.myProg,first=((m&&m.name)||Store.me.name||'there').split(' ')[0];
  const lvls=a?a.levels.map(levelById).filter(Boolean):[];const done=lvls.filter(l=>lvDone(pr,l.id)).length,pct=lvls.length?Math.round(done/lvls.length*100):0,C=2*Math.PI*44;
  const late=a&&a.due&&a.due<todayISO()&&done<lvls.length;
  const hero=`<section class="hero"><div><h1>Hi ${esc(first)} 👋</h1><p>${a?`${done} of ${lvls.length} modules complete${a.due?` · ${late?'<b style="color:#fca5a5">overdue</b> since':'due'} ${fmtDate(a.due)}`:''}.`:"You don't have any training assigned yet. Try a module for practice below."}</p>${a&&a.note?`<div class="msg"><small>Note from your manager</small>${esc(a.note)}</div>`:''}</div>
    ${a?`<div class="ring"><svg width="108" height="108" viewBox="0 0 108 108"><circle cx="54" cy="54" r="44" fill="none" stroke="#1b2a22" stroke-width="10"/><circle cx="54" cy="54" r="44" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"/></svg><b>${pct}%</b><small>complete</small></div>`:''}</section>`;
  let curFound=false;
  const trail=a?`<section class="card" style="padding:14px 10px"><h2 style="padding:0 8px">Your training path</h2><p class="sub" style="padding:0 8px">Modules unlock in order. Replay any finished module to improve your score.</p><div class="trail">${lvls.map((l,i)=>{const L=pr&&pr.levels&&pr.levels[l.id],isD=L&&L.done,cur=!isD&&!curFound;if(cur)curFound=true;const lock=!isD&&!cur;
      return`<div class="step ${isD?'done':cur?'cur':''}"><div class="node">${isD?'✓':lock?'🔒':l.n}</div><div class="body"><h3>Level ${l.n} · ${esc(l.title)}</h3><p>${isD?`<span class="stars">${starStr(L.stars||1)}</span> Best ${L.best}% · ${L.attempts} attempt${L.attempts>1?'s':''}`:lock?`Unlocks after Level ${lvls[i-1].n}`:`${esc(l.topic)} · ${scoredTasks(l).length} scenarios · about ${l.minutes} min`}</p></div>
        ${isD?`<button class="btn ghost sm" type="button" data-play="${l.id}">Replay</button>`:cur?`<button class="btn sm" type="button" data-play="${l.id}">${L?'Resume':'Start'} ▶</button>`:'<span></span>'}</div>`}).join('')}</div></section>`:'';
  const badges=`<section class="card"><h2>Badges</h2><p class="sub">Earn one for each module you finish.</p><div class="badges">${LEVELS.map(l=>`<span class="bdg ${lvDone(pr,l.id)?'':'off'}"><i>${lvDone(pr,l.id)?'★':'·'}</i>${BADGE[l.id]}</span>`).join('')}</div></section>`;
  const practice=`<section class="card"><h2>${a?'Practice any module':'Practice modules'}</h2><p class="sub">${a?'Practice runs are recorded too, so your manager sees your best score.':'Results are saved to your record.'}</p><div class="mods" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${LEVELS.map(l=>`<button class="pick" type="button" data-play="${l.id}" style="justify-content:space-between;text-align:left"><span>L${l.n} · ${esc(l.title)}<small>${esc(l.topic)}${lvDone(pr,l.id)?' · best '+pr.levels[l.id].best+'%':''}</small></span><span style="color:var(--green-hi);font-weight:800">▶</span></button>`).join('')}</div></section>`;
  return hero+`<div class="stack">${trail}${badges}${practice}</div>`;
}
function bindView(){
  view.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;renderPortal()}));
  view.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click',()=>{audioInit();startLevel(b.dataset.play,{graded:true})}));
  view.querySelectorAll('[data-art]').forEach(el=>el.append(modArt(levelById(el.dataset.art))));
  view.querySelectorAll('[data-sel]').forEach(c=>c.addEventListener('change',()=>{c.checked?draft.sel.add(c.dataset.sel):draft.sel.delete(c.dataset.sel);updAssignBtn()}));
  view.querySelectorAll('[data-lv]').forEach(c=>c.addEventListener('change',()=>{c.checked?draft.levels.add(c.dataset.lv):draft.levels.delete(c.dataset.lv);updAssignBtn()}));
  view.querySelectorAll('[data-def]').forEach(c=>c.addEventListener('change',()=>{draft.defLevels=draft.defLevels||new Set(Store.config.defaultLevels||[]);c.checked?draft.defLevels.add(c.dataset.def):draft.defLevels.delete(c.dataset.def)}));
  const due=$('dueIn');due&&due.addEventListener('change',()=>{draft.due=due.value});
  const note=$('noteIn');note&&note.addEventListener('input',()=>{draft.note=note.value});
  const dd=$('defDays');dd&&dd.addEventListener('change',()=>{draft.defDays=+dd.value});
  const ab=$('assignBtn');ab&&ab.addEventListener('click',async()=>{ab.disabled=true;const ids=[...draft.sel],lv=LEVELS.map(l=>l.id).filter(id=>draft.levels.has(id)),dueV=draft.due||addDaysISO(Date.now(),14);let ok=0,fail=0;
    for(const id of ids){const r=await write('assignments/'+id,{levels:lv,due:dueV,note:draft.note.trim(),assignedAt:Date.now(),by:Store.me.id});r===true?ok++:fail++}
    draft.sel.clear();draft.msgA=fail?`Assigned to ${ok}. ${fail} could not be saved; check that you are an editor of this page.`:`Assigned to ${ok} ${ok===1?'person':'people'}.`;renderPortal();setTimeout(()=>{draft.msgA=''},6000)});
  const sd=$('saveDef');sd&&sd.addEventListener('click',async()=>{const lv=LEVELS.map(l=>l.id).filter(id=>(draft.defLevels||new Set(Store.config.defaultLevels)).has(id));const r=await write('config/team',{defaultLevels:lv,defaultDueDays:draft.defDays||Store.config.defaultDueDays||14});draft.defLevels=null;draft.defDays=null;if(Store.mode==='live'&&r===true)Store.config={defaultLevels:lv,defaultDueDays:draft.defDays||Store.config.defaultDueDays||14};draft.msgD=r===true?'Default plan saved.':'Could not save the default plan.';renderPortal();setTimeout(()=>{draft.msgD=''},6000)});
  view.querySelectorAll('[data-unassign]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;await write('assignments/'+b.dataset.unassign,null);renderPortal()}));
  const jn=$('jName'),jd=$('jDept');jn&&jn.addEventListener('input',()=>{draft.joinName=jn.value});jd&&jd.addEventListener('input',()=>{draft.joinDept=jd.value});
  const jb=$('joinBtn');jb&&jb.addEventListener('click',async()=>{const name=(jn.value||'').trim();if(!name){$('joinNote').textContent='Please enter your name.';jn.focus();return}jb.disabled=true;
    const r=await write('members/'+Store.me.id,{name,dept:(jd.value||'').trim(),joinedAt:Date.now()});if(r===true){Store.myMember={name,dept:(jd.value||'').trim(),joinedAt:Date.now()};renderPortal()}else{jb.disabled=false;$('joinNote').textContent=r==='invalid_argument'?'Your access is view-only. Ask your manager to share this page with you as a Contributor.':'Could not join right now. Please try again.'}});
}
function updAssignBtn(){const b=$('assignBtn');if(!b)return;const n=draft.sel.size;b.disabled=!(n&&draft.levels.size);b.textContent=`Assign to ${n} ${n===1?'person':'people'}`}
$('logoutBtn').addEventListener('click',logoutLocal);
$('demoSeg').addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(!b||Store.mode!=='demo')return;Store.isMgr=b.dataset.r==='mgr';tab=Store.isMgr?'team':'me';renderPortal()});

/* =========================================================
   BOOT
   ========================================================= */
(async function boot(){
  buildMap();placeObjects();
  renderPortal();
  try{await Promise.race([document.fonts.load(`800 10px Inter`),new Promise(r=>setTimeout(r,1500))])}catch(e){}
  drawWorld(objects);resize();
  const live=await initLive();
  if(live){renderPortal();return}
  const local=await initLocal();
  if(!local)initDemo();
})();
