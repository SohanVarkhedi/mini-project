/* =========================================================
   PORTAL: data layer (local server / live artifact / demo) + shells and views.
   Layout and components follow docs/UI_GUIDE.md; helpers come from ui.js (UI.*).
   ========================================================= */
const BADGE={orientation:'Sharp Eye',inbox:'Inbox Guardian',signals:'Signal Keeper',access:'Gatekeeper',executive:'Fraud Buster'};
const Store={ready:false,mode:'demo',me:{id:'me',name:'',avatar:''},isMgr:true,canWrite:true,db:null,user:null,
  members:{},assignments:{},progress:{},config:{defaultLevels:[],defaultDueDays:14},myMember:null,myAssign:null,myProg:null,profiles:{},activity:[]};
const draft={sel:new Set(),levels:new Set(['orientation','inbox']),due:'',note:'',passMark:70,attempts:3,watch:true,defLevels:null,defDays:null,joinName:'',joinDept:'',search:''};
const dayMs=864e5,todayISO=()=>new Date().toISOString().slice(0,10);
const addDaysISO=(ms,d)=>new Date(ms+d*dayMs).toISOString().slice(0,10);
const fmtDate=iso=>{if(!iso)return'';const d=new Date(iso+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const fmtDay=ms=>ms?new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
const ago=ms=>{if(!ms)return'never';const m=Math.round((Date.now()-ms)/6e4);if(m<2)return'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';return Math.round(h/24)+' d ago'};
const plural=(n,one,many)=>n===1?one:(many||one+'s');
const icon=UI.icon;
function avatarFor(id,name,size){const url=Store.profiles[id]&&Store.profiles[id].avatarUrl||(id===Store.me.id&&Store.me.avatar);
  if(url)return`<img class="avatar${size?' avatar--'+size:''}" src="${esc(url)}" alt="">`;return UI.avatarHTML(name,{size,seed:id})}

/* ---------- effective assignment / progress helpers ---------- */
function assignFor(uid,member,assign){
  if(assign&&assign.levels&&assign.levels.length)return{...assign,source:assign.source||'manager'};
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
const STATUS_UI={none:['','dash'],'':['','circle'],go:['info','clock'],ok:['safe','check'],late:['danger','alert']};
const statusPill=st=>{const[tone,ic]=STATUS_UI[st.k]||STATUS_UI[''];return`<span class="status-pill"${tone?` data-tone="${tone}"`:''}>${icon(ic)}${st.t}</span>`};
const OUT_UI={safe:['safe','check'],acceptable:['caution','dash'],false_alarm:['info','info'],compromise:['danger','alert']};

/* ---------- demo data ---------- */
function initDemo(){
  Store.mode='demo';Store.me={id:'me',name:'Demo user',avatar:''};Store.isMgr=true;Store.canWrite=true;
  const now=Date.now();
  Store.members={a1:{name:'Aarav Mehta',dept:'Sales',joinedAt:now-20*dayMs},a2:{name:'Sara Khan',dept:'Finance',joinedAt:now-18*dayMs},a3:{name:'Rohan Das',dept:'Engineering',joinedAt:now-9*dayMs},a4:{name:'Meera Iyer',dept:'People & HR',joinedAt:now-3*dayMs},me:{name:'Demo user',dept:'Operations',joinedAt:now-dayMs}};
  Store.assignments={a1:{levels:['orientation','inbox','signals'],due:addDaysISO(now,5),note:'Please finish before the quarterly review.',assignedAt:now-10*dayMs,by:'me'},a2:{levels:['orientation','inbox','signals','access','executive'],due:addDaysISO(now,-2),note:'',assignedAt:now-15*dayMs,by:'me'},a3:{levels:['orientation','inbox'],due:addDaysISO(now,10),note:'',assignedAt:now-7*dayMs,by:'me'},me:{levels:['orientation','inbox'],due:addDaysISO(now,14),note:'Welcome aboard! Start with Office Orientation.',assignedAt:now-3*dayMs,by:'me'}};
  const mk=(best,outs)=>({best,last:best,stars:best>=90?3:best>=70?2:1,done:true,attempts:1,completedAt:now-2*dayMs,outcomes:outs});
  Store.progress={a1:{levels:{orientation:mk(85,{usb:'safe',qr:'safe',sticky:'acceptable',laptop:'safe'}),inbox:mk(73,{e1:'safe',e2:'compromise',e3:'safe',e4:'safe',e5:'false_alarm',e6:'safe'})},lastActive:now-3600e3},
    a2:{levels:{orientation:mk(100,{usb:'safe',qr:'safe',sticky:'safe',laptop:'safe'})},lastActive:now-4*dayMs},
    a3:{levels:{orientation:mk(55,{usb:'compromise',qr:'compromise',sticky:'safe',laptop:'acceptable'}),inbox:mk(93,{e1:'safe',e2:'safe',e3:'safe',e4:'safe',e5:'safe',e6:'acceptable'})},lastActive:now-8*3600e3}};
  Store.config={defaultLevels:['orientation','inbox'],defaultDueDays:14};
  /* sample plays behind the demo skills reports (PV_CONTENT.demo, built with the real scoring code) */
  for(const[uid,levels]of Object.entries((PV_CONTENT.demo&&PV_CONTENT.demo.plays)||{})){const pr=Store.progress[uid]=Store.progress[uid]||{levels:{},lastActive:now-dayMs};
    for(const[lid,v]of Object.entries(levels))pr.levels[lid]={best:v.score,last:v.score,stars:v.stars,done:true,attempts:1,completedAt:now-dayMs,outcomes:v.outcomes}}
  syncMine();Store.ready=true;startDemoLive();renderPortal();
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

/* ---------- local server mode (Flask + SQLite, see phishverse/) ---------- */
let authMode='login';
const API=(p,opt={})=>fetch('api/'+p,Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}},opt)).then(async r=>{let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw Object.assign(new Error((j&&j.error)||r.statusText),{status:r.status});return j});
async function initLocal(){
  if(location.protocol==='file:')return false;
  try{await API('health')}catch(e){return false}
  Store.mode='local';Store.canWrite=true;Store.authed=false;
  try{setLocalMe(await API('me'));await loadLocalState();startLive()}catch(e){Store.authed=false}
  Store.ready=true;renderPortal();
  /* safety net only: live events normally refresh the state straight away */
  setInterval(()=>{if(Store.authed&&Live.status!=='connected'&&$('game').hidden&&!document.hidden)loadLocalState().catch(()=>{})},10000);
  return true;
}
function setLocalMe(me){Store.authed=true;Store.me={id:me.id,name:me.name,avatar:'',email:me.email,dept:me.dept};Store.isMgr=me.role==='manager'}
async function loadLocalState(){const s=await API('state');Store.config=Object.assign({defaultLevels:[],defaultDueDays:14},s.config||{});
  if(Store.isMgr){markFreshChips(Store.progress,s.progress||{});Store.members=s.members||{};Store.assignments=s.assignments||{};Store.progress=s.progress||{}}
  Store.myMember=s.myMember||null;Store.myAssign=s.myAssign||null;Store.myProg=s.myProg||null;Store.myJourney=s.myJourney||null;Store.journeys=s.journeys||{};scheduleRender()}
async function writeLocal(path,data){const[c,id]=path.split('/');
  try{if(c==='assignments')await API('assignments/'+encodeURIComponent(id),data===null?{method:'DELETE'}:{method:'PUT',body:JSON.stringify(data)});
    else if(c==='config')await API('config',{method:'PUT',body:JSON.stringify(data)});
    else if(c==='members')await API('profile',{method:'PUT',body:JSON.stringify(data)});
    loadLocalState().catch(()=>{});return true}catch(e){return e.status===403?'invalid_argument':'error'}}
async function logoutLocal(){Live.stop();Store.activity=[];feedList=null;try{await API('logout',{method:'POST',body:'{}'})}catch(e){}Store.authed=false;Store.members={};Store.assignments={};Store.progress={};Store.myMember=Store.myAssign=Store.myProg=null;Store.me={id:'',name:'',avatar:''};
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);renderPortal()}
/* ---------- recording a play (local mode: the server records and scores every decision) ---------- */
const CLIENT_VERSION='pv-web-2';
let play=null; /* {levelId, queue: Promise<session id|null>, unsent: [decision bodies]} */
onLevelStart=lid=>{
  if(Store.mode!=='local'||!Store.authed){play=null;return}
  const a=assignFor(Store.me.id,Store.myMember,Store.myAssign),purpose=a&&a.levels.includes(lid)?'baseline':'practice';
  const p={levelId:lid,unsent:[]};
  p.queue=API('sessions',{method:'POST',body:JSON.stringify({level_id:lid,purpose,client_version:CLIENT_VERSION})}).then(r=>r.id).catch(()=>null);
  play=p;
};
const sendDecision=(sid,body)=>API(`sessions/${encodeURIComponent(sid)}/decisions`,{method:'POST',body:JSON.stringify(body)}).then(()=>true).catch(e=>e.status===409);/* 409: already recorded */
onDecision=(lid,task,d)=>{
  const p=play;if(!p||p.levelId!==lid)return;
  const body={task_id:task.id,action_index:d.act,inspected:d.inspected,response_ms:d.ms};
  p.queue=p.queue.then(async sid=>{if(sid&&!await sendDecision(sid,body))p.unsent.push(body);return sid});
};
async function finishPlay(lid){
  const p=play;if(!p||p.levelId!==lid)return null;
  const sid=await p.queue;if(!sid)return null;
  for(const body of p.unsent.splice(0))if(!await sendDecision(sid,body))return null;
  try{const r=await API(`sessions/${encodeURIComponent(sid)}/finish`,{method:'POST',body:'{}'});if(play===p)play=null;return r}catch(e){return null}
}
let progQ=Promise.resolve();
onLevelComplete=(lid,s)=>{
  progQ=progQ.then(async()=>{
    if(Store.mode==='local'){
      const r=await finishPlay(lid);
      if(!r)return{saved:false,msg:"Couldn't reach the server, so this result wasn't saved. The score above was worked out on this device."};
      await loadLocalState().catch(()=>{});if(r.report_ready)delete reportCache[Store.me.id];return{saved:true,score:r.score,stars:r.stars,reportReady:!!r.report_ready};
    }
    /* demo and live modes score on the device */
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


/* =========================================================
   LIVE: activity feed, live dot, nudges, connect a device (see js/live.js)
   ========================================================= */
let freshChips=new Set(),feedList=null,refreshTimer=0;
function markFreshChips(before,after){
  freshChips=new Set();if(!before||!Object.keys(before).length)return;
  for(const[uid,p]of Object.entries(after||{}))for(const[lid,L]of Object.entries(p.levels||{})){const o=before[uid]&&before[uid].levels&&before[uid].levels[lid];if(!o||o.best!==L.best||o.attempts!==L.attempts)freshChips.add(uid+'/'+lid)}
}
async function startLive(){
  if(Store.mode!=='local'||!Store.authed)return;
  let latest=0;try{const j=await API('activity?limit=30');Store.activity=j.events||[];latest=j.latest_id||0}catch(e){}
  feedList=null;Live.start(latest);scheduleRender();
}
function startDemoLive(){
  feedList=null;const now=Date.now(),ids=['a1','a2','a3','a4'];
  Store.activity=[{id:-3,kind:'level_finished',user_id:'a3',name:'Rohan Das',data:{level_id:'inbox',score:93},created_at:now-8*3600e3},
    {id:-2,kind:'level_finished',user_id:'a1',name:'Aarav Mehta',data:{level_id:'inbox',score:73},created_at:now-3600e3},
    {id:-1,kind:'level_started',user_id:'a4',name:'Meera Iyer',data:{level_id:'orientation'},created_at:now-5*60e3}].reverse();/* newest first */
  const script=[['level_started','a2',{level_id:'inbox'}],['level_finished','a4',{level_id:'orientation',score:85}],['nudge_sent','me',{message:'Please finish Office Orientation this week.',by_name:'Team Manager'}],
    ['level_started','a3',{level_id:'signals'}],['assigned','me',{levels:['orientation','inbox'],due:addDaysISO(now,14)}],['level_finished','a2',{level_id:'inbox',score:77}]];
  Live.simulate(i=>{const[kind,uid,data]=script[i%script.length];const m=Store.members[uid]||{name:'Someone'};return{id:i+1,kind,user_id:uid,name:m.name,data,created_at:Date.now()}},6000);
}
Live.on('*',ev=>{
  Store.activity.unshift(ev);Store.activity.length=Math.min(Store.activity.length,40);
  if(feedList)prependFeedItem(ev);
  const mine=ev.user_id===Store.me.id;
  if(!Store.isMgr&&mine){
    if(ev.kind==='assigned'){const n=(ev.data.levels||[]).length;UI.toast('New training assigned',{description:`${n} ${plural(n,'module')}${ev.data.due?`, due ${fmtDate(ev.data.due)}`:''}. It's on your journey now.`})}
    else if(ev.kind==='unassigned')UI.toast('Your training plan changed',{type:'info',description:'Your manager removed your assigned modules.'});
    else if(ev.kind==='nudge_sent')UI.toast('Reminder from your manager',{type:'info',description:ev.data.message||'Please finish your assigned training.',duration:8000});
    else if(ev.kind==='report_ready'&&$('game').hidden)UI.toast('Your skills report is ready',{description:'See where you are strong and what to practise next.'});
  }
  if(ev.kind==='report_ready'||ev.kind==='plan_updated'||ev.kind==='assigned'){delete reportCache[ev.user_id];if(drawerState&&drawerState.id===ev.user_id)setTimeout(()=>refreshDrawerTab(),120)}
  if(Store.mode==='local'){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadLocalState().catch(()=>{}),60)}
  else if(Store.mode==='demo'&&ev.kind==='nudge_sent'&&!Store.isMgr)scheduleRender();
});
const LIVE_TEXT={connected:['Live',''],reconnecting:['Reconnecting…','refresh'],offline:['Offline','wifiOff']};
Live.onStatus(()=>updateLiveIndicators());
function liveIndicator(){return Store.mode==='live'?'':`<span class="live-indicator" data-live role="status" aria-live="polite"></span>`}
function updateLiveIndicators(){
  const st=Live.status,[label,ic]=LIVE_TEXT[st]||LIVE_TEXT.offline,demo=Live.mode==='demo',poll=Live.mode==='poll';
  document.querySelectorAll('[data-live]').forEach(el=>{el.dataset.state=st;el.innerHTML=`${ic?icon(ic):'<i aria-hidden="true"></i>'}<span class="live-label">${label}${demo?' (demo)':''}</span>`;
    el.title=st==='connected'?(demo?'Sample events every few seconds':poll?'Updating every 10 seconds':'Updates appear as they happen'):st==='reconnecting'?'Trying to reconnect':'Not connected. Check the server is running.'});
}
const firstName=n=>String(n||'Someone').split(' ')[0];
const lvTitle=id=>{const l=levelById(id);return l?l.title:id};
function feedSentence(ev){
  const who=`<b>${esc(firstName(ev.name))}</b>`,d=ev.data||{};
  switch(ev.kind){
    case'joined':return['users','info',`${who} joined the team`];
    case'assigned':{const n=(d.levels||[]).length;return['journey','',`${who} was assigned ${n} ${plural(n,'module')}${d.due?` · due ${fmtDate(d.due)}`:''}`]}
    case'unassigned':return['close','',`${who}'s training plan was removed`];
    case'level_started':return['play','info',`${who} started ${esc(lvTitle(d.level_id))}${d.purpose==='practice'?' (practice)':''}`];
    case'level_finished':return[d.score>=70?'check':'alert',d.score>=70?'safe':'caution',`${who} finished ${esc(lvTitle(d.level_id))} · <span class="num">${d.score}%</span>`];
    case'nudge_sent':return['bell','',Store.isMgr?`Reminder sent to ${who}`:`Your manager sent you a reminder`];
    case'report_ready':return['skills',d.weakest?'caution':'safe',`${who}'s skills report is ready: ${d.weakest?`weakest is ${esc(d.weakest.name)}`:'no weak spots'}`];
    case'plan_updated':return['target','',`${who}'s training plan was updated`];
  }
  return['circle','',`${who}: ${esc(ev.kind)}`];
}
function feedItem(ev,isNew){
  const[ic,tone,html]=feedSentence(ev),li=document.createElement('li');li.className='feed-item';li.dataset.id=ev.id;if(isNew)li.setAttribute('data-new','');
  li.innerHTML=`<span class="feed-icon"${tone?` data-tone="${tone}"`:''}>${icon(ic)}</span><div><p>${html}</p>${ev.kind==='nudge_sent'&&ev.data.message?`<q>${esc(ev.data.message)}</q>`:''}<time datetime="${new Date(ev.created_at).toISOString()}" data-at="${ev.created_at}">${ago(ev.created_at)}</time></div>`;return li;
}
function getFeedList(){
  if(!feedList){feedList=document.createElement('ol');feedList.className='feed';feedList.id='feed';feedList.setAttribute('aria-live','polite');feedList.setAttribute('aria-label','Live activity, newest first');Store.activity.slice(0,30).forEach(ev=>feedList.append(feedItem(ev,false)))}
  refreshFeedTimes();if(!feedList.children.length)feedList.innerHTML=`<li class="feed-empty">${emptyState('reports','No activity yet','Joins, assignments and finished levels appear here as they happen.','',true)}</li>`;return feedList;
}
function prependFeedItem(ev){const e=feedList.querySelector('.feed-empty');if(e)e.remove();feedList.prepend(feedItem(ev,true));while(feedList.children.length>30)feedList.lastChild.remove()}
function refreshFeedTimes(){if(feedList)feedList.querySelectorAll('time[data-at]').forEach(t=>{t.textContent=ago(+t.dataset.at)})}
setInterval(refreshFeedTimes,30000);
function feedPanel(){if(Store.mode==='live')return'';return`<section class="panel feed-panel" aria-labelledby="feedH"><div class="panel-head"><div><h2 id="feedH">Live activity</h2><p>Updates the moment someone plays, on any device.</p></div></div><div data-feed-slot></div></section>`}
const canNudge=id=>(Store.mode==='local'||Store.mode==='demo')&&id!==Store.me.id;
async function nudgePerson(id){
  const m=Store.members[id],name=firstName(m&&m.name);
  const msg=await UI.formModal({title:`Send ${name} a reminder`,body:`${name} sees it on their device straight away.`,label:'Message',placeholder:'For example: please finish Inbox Defense by Friday.',maxlength:140,confirm:'Send reminder'});
  if(msg===null)return;
  if(Store.mode==='demo'){UI.toast(`Reminder sent to ${name}`,{description:'Demo mode: nothing was sent.'});return}
  try{await API('nudges',{method:'POST',body:JSON.stringify({user_id:id,message:msg})});UI.toast(`Reminder sent to ${name}`,{description:msg?`“${msg}”`:`${name} will see it straight away.`})}
  catch(e){UI.toast(e.status===429?'Reminder not sent':'Could not send the reminder',{type:'error',description:e.status===429?e.message:'Check your connection and try again.'})}
}
function nudgeBanner(){
  let seen=0;try{seen=+localStorage.getItem('pv-nudge-seen')||0}catch(e){}
  const n=Store.activity.find(ev=>ev.kind==='nudge_sent'&&ev.user_id===Store.me.id);
  if(!n||n.id===seen||Date.now()-n.created_at>7*dayMs)return'';
  return`<div class="banner nudge-banner" data-tone="caution" role="status">${icon('bell')}<div><b>Reminder from ${esc(n.data.by_name||'your manager')}</b><q>${esc(n.data.message||'Please finish your assigned training.')}</q><small>${ago(n.created_at)}</small></div><button type="button" class="button button--quiet button--sm" data-dismiss-nudge="${n.id}">Dismiss</button></div>`;
}
async function openConnect(){
  const d=openDrawer({title:'Connect a device',body:'<span class="skeleton skeleton--block" style="--h:240px"></span><span class="skeleton skeleton--text"></span>'});
  let info=null;try{info=await API('connect')}catch(e){}
  if(!info){d.body.innerHTML=emptyState('wifiOff','Could not reach the server','Check the server is still running, then try again.','',true);return}
  if(!info.lan){d.body.innerHTML=`<div class="banner" data-tone="caution">${icon('alert')}<div><b>Phones can't reach this server yet.</b> It's only listening on this computer.</div></div>
    <div class="drawer-section"><span class="label">To connect a phone or tablet</span><ol class="connect-steps"><li><span>Stop the server (Ctrl+C in its window).</span></li><li><span>Start it again with <code>python server.py --lan</code></span></li><li><span>Reopen this panel. It will show an address and a QR code for your phone.</span></li></ol></div>
    <p class="muted" style="font-size:var(--t-sm)">Firewall prompts, hotspots and campus Wi-Fi: see <code>docs/MULTI_DEVICE.md</code>.</p>`;return}
  d.body.innerHTML=`<div class="connect-qr"><img src="api/connect/qr.svg" alt="QR code for ${esc(info.url)}" width="240" height="240"><small>Scan with the phone's camera</small></div>
    <div class="drawer-section"><span class="label">Or type this address</span><div class="connect-url">${UI.renderAddr(info.url)}<button type="button" class="button button--secondary button--sm" data-copy-url>${icon('copy','icon--sm')}Copy</button></div></div>
    <div class="drawer-section"><span class="label">Steps</span><ol class="connect-steps"><li><span>Join the same Wi-Fi as this computer.</span></li><li><span>Scan the code, or open the address in the phone's browser.</span></li><li><span>Sign in, or choose <b>Create account</b>. This dashboard updates as they play.</span></li></ol></div>
    <p class="muted" style="font-size:var(--t-sm)">Page doesn't open on the phone? Allow Python through the firewall on private networks, or use a phone hotspot. See <code>docs/MULTI_DEVICE.md</code>.</p>`;
  d.body.querySelector('[data-copy-url]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(info.url);UI.toast('Address copied',{description:info.url})}catch(e){UI.toast('Copy this address',{type:'info',description:info.url})}});
}

/* =========================================================
   ROUTING + SHELLS
   ========================================================= */
const MGR_PAGES=[['overview','Overview','overview'],['people','People','people'],['programs','Programs','programs'],['reports','Reports','reports',1],['settings','Settings','settings',1]];
const MGR_TRAINING=['training','My training','play'];
const EMP_PAGES=[['journey','Journey','journey'],['skills','Skills','skills'],['certificates','Certificates','certificate'],['profile','Profile','profile']];
function pagesFor(){return Store.isMgr?[...MGR_PAGES,MGR_TRAINING]:EMP_PAGES}
const HIDDEN_PAGES=()=>Store.isMgr?['skills','plan']:['plan'];/* reachable by link, not in the nav */
function currentPage(){const h=location.hash.replace(/^#\/?/,'');const ps=pagesFor();return ps.some(p=>p[0]===h)||HIDDEN_PAGES().includes(h)?h:ps[0][0]}
addEventListener('hashchange',()=>{setMenu(false);renderPortal();window.scrollTo(0,0);const v=$('view');v&&v.focus({preventScroll:true})});

const app=$('app');let shellKey='',lastPage='';const animated=new Set();
const demoSwitch=()=>Store.mode==='demo'?`<div class="segmented role-switch" id="demoSeg" role="group" aria-label="Preview as">${[['mgr','Manager'],['emp','Employee']].map(([k,l])=>`<button type="button" data-r="${k}" aria-pressed="${(k==='mgr')===Store.isMgr}">${l}</button>`).join('')}</div>`:'';
const signOutBtn=(cls='')=>Store.mode==='local'?`<button type="button" class="button button--quiet signout ${cls}" data-signout>${icon('logout')}<span>Sign out</span></button>`:'';
const navItem=([k,l,ic,soon])=>`<a class="nav-item" href="#${k}" data-nav="${k}" title="${l}">${icon(ic)}<span class="nav-label">${l}</span>${soon?'<span class="soon">Soon</span>':''}</a>`;
const roleName=()=>Store.isMgr?'Manager':'Employee';

function mgrShell(){
  return`<div class="m-shell">
  <aside class="rail" aria-label="Main navigation"><div class="rail-inner">
    <a class="brand" href="#overview" aria-label="PhishVerse overview">${UI.mark()}<span><span class="wordmark">PhishVerse</span><small>NovaCorp · Security training</small></span></a>
    <nav class="nav-list" aria-label="Manager pages">${MGR_PAGES.map(navItem).join('')}</nav>
    <div class="rail-foot"><span class="label rail-section">Your own training</span>${navItem(MGR_TRAINING)}</div>
  </div></aside>
  <div class="m-main">
    <header class="topbar">
      <button type="button" class="button button--quiet button--icon menu-btn" id="menuBtn" aria-expanded="false" aria-controls="topMenu" aria-label="Open menu">${icon('menu')}</button>
      <h1 class="page-title" id="pageTitle">Overview</h1>
      <div class="topbar-tools">
        ${liveIndicator()}${Store.mode==='local'?`<button type="button" class="button button--secondary button--sm connect-btn" data-connect aria-label="Connect a device" title="Connect a device">${icon('qr','icon--sm')}<span class="btn-label">Connect a device</span></button>`:''}
        ${demoSwitch()}${UI.themeSwitch()}
        <div class="account">${avatarFor(Store.me.id,Store.me.name)}<div class="me-text"><b id="meName"></b><small id="roleChip">${roleName()}</small></div></div>
        ${signOutBtn()}
      </div>
    </header>
    <div class="top-menu" id="topMenu" hidden>
      <nav class="nav-list" aria-label="Manager pages">${[...MGR_PAGES,MGR_TRAINING].map(navItem).join('')}</nav>
      <div class="top-menu-row">${liveIndicator()}${Store.mode==='local'?`<button type="button" class="button button--secondary" data-connect>${icon('qr','icon--sm')}Connect a device</button>`:''}</div>
      <div class="top-menu-row">${UI.themeSwitch()}${demoSwitch().replace('id="demoSeg"','')}${signOutBtn()}</div>
    </div>
    <main class="m-content" id="view" tabindex="-1"></main>
  </div></div>`;
}
function empShell(){
  return`<div class="e-shell">
  <header class="e-top"><div class="e-top-inner${Store.mode==='demo'?' has-demo':''}">
    <a class="brand" href="#journey" aria-label="PhishVerse journey">${UI.mark()}<span class="wordmark">PhishVerse</span></a>
    <nav class="e-nav" aria-label="Your pages">${EMP_PAGES.map(([k,l])=>`<a class="tab" href="#${k}" data-nav="${k}">${l}</a>`).join('')}</nav>
    <div class="e-tools">${liveIndicator()}${demoSwitch()}<a class="me-link" href="#profile" aria-label="Your profile" title="Your profile">${avatarFor(Store.me.id,Store.me.name)}</a><span class="sr-only" id="roleChip">${roleName()}</span></div>
  </div></header>
  <main class="e-content" id="view" tabindex="-1"></main>
  <nav class="bottom-nav" aria-label="Your pages">${EMP_PAGES.map(([k,l,ic])=>`<a href="#${k}" data-nav="${k}">${icon(ic)}<span>${l}</span></a>`).join('')}</nav>
  </div>`;
}
function setMenu(open){const m=$('topMenu'),b=$('menuBtn');if(!m||!b)return;m.hidden=!open;b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'Close menu':'Open menu');b.innerHTML=icon(open?'close':'menu')}
function bindShell(){
  app.querySelectorAll('[data-signout]').forEach(b=>b.addEventListener('click',logoutLocal));
  app.querySelectorAll('[data-connect]').forEach(b=>b.addEventListener('click',()=>{setMenu(false);openConnect()}));
  updateLiveIndicators();
  app.querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',()=>{if(Store.mode!=='demo')return;Store.isMgr=b.dataset.r==='mgr';history.replaceState(null,'',location.pathname+location.search);renderPortal()}));
  const mb=$('menuBtn');mb&&mb.addEventListener('click',()=>setMenu($('topMenu').hidden));
}
const PAGE_TITLE={plan:'Your plan',overview:'Overview',people:'People',programs:'Programs',reports:'Reports',settings:'Settings',training:'My training',journey:'Journey',skills:'Skills',certificates:'Certificates',profile:'Profile'};

function renderPortal(){
  if(!Store.ready){if(shellKey!=='loading'){app.innerHTML=loadingView();shellKey='loading'}return}
  if(Store.mode==='local'&&!Store.authed){const k='auth:'+authMode;if(shellKey!==k){const keep=readAuthDraft();app.innerHTML=authView();bindAuth(keep);shellKey=k}return}
  const key=(Store.isMgr?'mgr':'emp')+'|'+Store.mode+'|'+Store.me.id;
  if(shellKey!==key){app.innerHTML=Store.isMgr?mgrShell():empShell();bindShell();shellKey=key;lastPage=''}
  const page=currentPage();
  app.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  const t=$('pageTitle');if(t)t.textContent=PAGE_TITLE[page];document.title=`${PAGE_TITLE[page]} · PhishVerse`;
  const nm=$('meName');if(nm)nm.textContent=Store.me.name||'You';
  const first=!animated.has(page);animated.add(page);
  const view=$('view');view.innerHTML=banner()+pageHTML(page);
  if(first)view.querySelectorAll('[data-stagger]').forEach(el=>{el.classList.add('stagger');[...el.children].forEach((c,i)=>c.style.setProperty('--i',Math.min(i,10)))});
  bindView(view,page);lastPage=page;
}
function pageHTML(p){
  switch(p){
    case'overview':return overviewPage();case'people':return peoplePage();case'programs':return programsPage();
    case'reports':return comingSoon('reports','Skills reports will appear here',"Each person's strong areas and weak spots, and where the whole team needs practice, built from their decisions in the game.",'See team progress','#overview');
    case'settings':return comingSoon('settings','Settings will appear here',"Your organisation's name, the final-test pass mark and who can manage training. The default plan for new joiners is on Overview.",'Edit the default plan','#overview');
    case'training':return journeyPage();
    case'journey':return journeyPage();
    case'skills':return reportPage();
    case'plan':return planPage();
    case'certificates':return comingSoon('certificate','Your certificate appears here','Pass the final test to earn a certificate your manager can verify.','Go to your journey','#journey');
    case'profile':return profilePage();
  }
  return'';
}
function banner(){
  if(Store.mode!=='demo')return'';
  if(location.protocol==='file:')return`<div class="banner">${icon('info')}<div><b>Demo mode (opened as a file).</b> Sample data only, nothing is saved. Run <code>python server.py</code> and open <b>http://localhost:5000</b> for real accounts and saved progress.</div></div>`;
  return`<div class="banner">${icon('info')}<div><b>Demo mode.</b> You're seeing sample team data. Switch between Manager and Employee at the top to preview both sides.</div></div>`;
}
const emptyState=(ic,title,text,action='',compact)=>`<div class="empty-state${compact?' empty-state--compact':''}"><span class="empty-icon">${icon(ic,'icon--lg')}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
const comingSoon=(ic,title,text,cta,href)=>`<section class="panel">${emptyState(ic,title,text,`<a class="button button--secondary" href="${href}">${cta}${icon('arrow','icon--sm')}</a>`)}</section>`;
function loadingView(){return`<div class="loading-screen ds" role="status" aria-live="polite"><div>${UI.mark(true)}<span class="skeleton skeleton--title" style="--w:70%"></span><span class="skeleton skeleton--text"></span><span class="skeleton skeleton--text" style="--w:80%"></span><span class="sr-only">Loading your training…</span></div></div>`}

/* =========================================================
   SIGN-IN / CREATE ACCOUNT
   ========================================================= */
function readAuthDraft(){const g=id=>{const el=$(id);return el?el.value:''};return{email:g('aEmail'),name:g('aName'),dept:g('aDept')}}
function field(id,label,input,{hint='',optional}={}){return`<div class="field"><label class="field-label" for="${id}">${label}${optional?' <small>(optional)</small>':''}</label>${input}${hint?`<span class="field-hint" id="${id}Hint">${hint}</span>`:''}<span class="field-error" id="${id}Err" role="alert"></span></div>`}
function authView(){const reg=authMode==='register';
  return`<div class="auth"><div class="auth-inner">
   <div class="auth-brand">${UI.mark(true)}<span class="wordmark">PhishVerse</span><p>Security training you play. Learn to spot ${UI.renderAddr('novac0rp.com',{flag:true})} before it costs you.</p></div>
   <section class="panel auth-card" aria-labelledby="authTitle">
    <div class="segmented segmented--block" id="authSeg" role="group" aria-label="Choose"><button type="button" data-am="login" aria-pressed="${!reg}">Sign in</button><button type="button" data-am="register" aria-pressed="${reg}">Create account</button></div>
    <div><h2 id="authTitle">${reg?"Join your team's training":'Sign in to PhishVerse'}</h2><p class="lead">${reg?'Create an employee account. Your manager will see you on the team dashboard.':'Managers and employees sign in here.'}</p></div>
    <form id="authForm" novalidate data-keep>
     ${reg?field('aName','Full name','<input class="input" id="aName" maxlength="60" autocomplete="name" required aria-describedby="aNameErr">')+field('aDept','Team or department','<input class="input" id="aDept" maxlength="40" autocomplete="organization-title" aria-describedby="aDeptHint">',{hint:'For example Finance or Sales.',optional:true}):''}
     ${field('aEmail','Email','<input class="input" id="aEmail" type="email" inputmode="email" maxlength="120" autocomplete="email" autocapitalize="off" spellcheck="false" required aria-describedby="aEmailErr">')}
     ${field('aPw','Password',`<input class="input" id="aPw" type="password" minlength="8" autocomplete="${reg?'new-password':'current-password'}" required aria-describedby="${reg?'aPwHint ':''}aPwErr">`,{hint:reg?'At least 8 characters.':''})}
     <div class="form-error" id="authNote" role="alert"></div>
     <button class="button button--primary button--block" type="submit" id="authBtn">${reg?'Create account':'Sign in'}</button>
    </form>
   </section>
   <p class="auth-foot">Managers sign in with the account set up for them. Employees create their own.</p>
  </div></div>`}
function setFieldError(id,msg){const inp=$(id),e=$(id+'Err');if(!inp||!e)return false;inp.setAttribute('aria-invalid',msg?'true':'false');e.innerHTML=msg?icon('alert')+`<span>${esc(msg)}</span>`:'';return true}
function bindAuth(keep){
  if(keep){if($('aEmail'))$('aEmail').value=keep.email||'';if($('aName'))$('aName').value=keep.name||'';if($('aDept'))$('aDept').value=keep.dept||''}
  $('authSeg').addEventListener('click',e=>{const b=e.target.closest('[data-am]');if(!b||b.dataset.am===authMode)return;authMode=b.dataset.am;renderPortal();const f=$(authMode==='register'?'aName':'aEmail');f&&f.focus()});
  $('authForm').addEventListener('input',e=>{if(e.target.getAttribute('aria-invalid')==='true')setFieldError(e.target.id,'')});
  $('authForm').addEventListener('submit',async e=>{e.preventDefault();const note=$('authNote'),btn=$('authBtn');note.innerHTML='';['aName','aEmail','aPw'].forEach(id=>setFieldError(id,''));
    btn.setAttribute('aria-busy','true');btn.disabled=true;
    const body={email:$('aEmail').value.trim(),password:$('aPw').value};if(authMode==='register'){body.name=$('aName').value.trim();body.dept=$('aDept').value.trim()}
    try{setLocalMe(await API(authMode,{method:'POST',body:JSON.stringify(body)}));await loadLocalState();renderPortal();startLive()}
    catch(err){btn.removeAttribute('aria-busy');btn.disabled=false;const m=err.message||'Something went wrong. Check your connection and try again.';
      const target=/your name/i.test(m)?'aName':err.status===409||/valid email/i.test(m)?'aEmail':/at least 8/i.test(m)?'aPw':null;
      if(target&&setFieldError(target,m))$(target).focus();else{note.innerHTML=icon('alert')+`<span>${esc(m)}</span>`}}});
}

/* =========================================================
   MANAGER PAGES
   ========================================================= */
function memberRows(){
  const ids=Object.keys(Store.members).sort((a,b)=>(Store.members[a].name||'').localeCompare(Store.members[b].name||''));
  return ids.map(id=>{const m=Store.members[id],a=assignFor(id,m,Store.assignments[id]),pr=Store.progress[id],st=statusOf(a,pr);return{id,m,a,pr,st}});
}
const hasCompromise=L=>!!L&&Object.values(L.outcomes||{}).includes('compromise');
function scoreChip(lid,pr,uid){const L=pr&&pr.levels&&pr.levels[lid],lv=levelById(lid);if(!lv)return'';const done=L&&L.done,bad=done&&hasCompromise(L);
  const sr=done?`Level ${lv.n}, best ${L.best}%${bad?', includes a compromised decision':''}`:`Level ${lv.n}, not finished`;
  const fresh=uid&&freshChips.has(uid+'/'+lid);
  return`<span class="score-chip"${done?` data-state="${bad?'bad':'done'}"`:''}${fresh?' data-fresh':''} title="${esc(lv.title)}" aria-label="${esc(sr)}">${icon(done?(bad?'alert':'check'):'circle')}L${lv.n}${done?' · '+L.best+'%':''}</span>`}
function personCell(r){return`<div class="person">${avatarFor(r.id,r.m.name)}<div><b>${esc(r.m.name||'Someone')}${r.id===Store.me.id?' (you)':''}</b><small>${esc(r.m.dept||'No team')}${r.pr&&r.pr.lastActive?' · active '+ago(r.pr.lastActive):''}</small></div></div>`}
function peopleTable(rows,{details}={}){
  if(!rows.length)return emptyState('users','No one has joined yet',Store.mode==='live'?'Share this page with your team as Contributors. They appear here as soon as they open it.':Store.mode==='local'?'Employees appear here as soon as they create an account.':'Sample employees will appear here.',
    Store.mode==='local'?`<button type="button" class="button button--secondary" data-copy-link>${icon('mail','icon--sm')}Copy sign-up link</button>`:'',true);
  return`<div class="table-scroll"><table class="table table--stack people-table"><thead><tr><th scope="col">Person</th><th scope="col">Modules</th><th scope="col">Journey</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
   <tbody data-stagger>${rows.map(r=>{
     const chips=r.a?r.a.levels.map(l=>scoreChip(l,r.pr,r.id)).join(''):'<span class="muted" style="font-size:var(--t-xs)">No modules yet</span>';
     const js=journeySummary(r.id);
     const meta=js&&js.weakest?`Weakest: ${esc(js.weakest.name)}`:js&&js.report_id?'No weak spots':r.a?`${r.a.source==='default'?'Auto plan · ':''}<span class="num">${r.st.done||0}/${r.a.levels.length}</span>${r.a.due?' · due '+fmtDate(r.a.due):''}`:'';
     const act=details?`<button type="button" class="button button--quiet button--icon" data-details="${esc(r.id)}" aria-label="Details for ${esc(r.m.name||'this person')}" title="Details">${icon('chevron')}</button>`
       :(canNudge(r.id)?`<button type="button" class="button button--quiet button--icon" data-nudge="${esc(r.id)}" aria-label="Send ${esc(r.m.name||'this person')} a reminder" title="Send a reminder">${icon('bell')}</button>`:'')
        +(Store.assignments[r.id]?`<button type="button" class="button button--quiet button--icon" data-unassign="${esc(r.id)}" aria-label="Remove ${esc(r.m.name||'this person')}'s program" title="Remove program">${icon('close')}</button>`:'');
     return`<tr data-person="${esc(r.id)}" data-name="${esc((r.m.name+' '+(r.m.dept||'')).toLowerCase())}"${details?' data-href':''}><td data-col="person">${personCell(r)}</td><td data-col="modules"><div class="chips">${chips}</div></td><td data-col="status"><div class="status-cell">${journeyPill(js,r.st)}${meta?`<small>${meta}</small>`:''}</div></td><td class="cell-actions">${act}</td></tr>`}).join('')}</tbody></table></div>`;
}
function teamStats(rows){let tot=0,dn=0,sc=[],att=0;
  rows.forEach(r=>{if(!r.a)return;tot+=r.a.levels.length;r.a.levels.forEach(l=>{if(lvDone(r.pr,l)){dn++;sc.push(r.pr.levels[l].best)}});const comp=r.pr&&Object.values(r.pr.levels||{}).some(hasCompromise);if(r.st.k==='late'||comp)att++});
  return{tot,dn,att,n:sc.length,pct:tot?Math.round(dn/tot*100):0,avg:sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0}}
function overviewPage(){
  const rows=memberRows(),s=teamStats(rows),withPlan=rows.filter(r=>r.a).length;
  const hint=Store.mode==='local'?`<div class="banner">${icon('users')}<div><b>Add your team.</b> Employees open ${UI.renderAddr(location.origin)} and choose <b>Create account</b>. They appear here straight away. For phones on your Wi-Fi, start the server with <code>python server.py --lan</code>.</div></div>`
    :Store.mode==='live'?`<div class="banner">${icon('users')}<div><b>Add your team.</b> Use <b>Share</b> on this page and add employees as <b>Contributors</b>. When they open it, they join the team and show up here. Viewers can play but their results can't be saved.</div></div>`:'';
  const kpi=(v,l,n,tone,ic)=>`<div class="kpi"${tone?` data-tone="${tone}"`:''}><span class="kpi-value">${v}</span><span class="kpi-label">${ic?icon(ic):''}${l}</span><span class="kpi-note">${n}</span></div>`;
  return`${hint}
  <section class="kpi-strip" aria-label="Team summary">${kpi(rows.length,'Team members',`${withPlan} with training assigned`)}${kpi(s.pct+'%','Completion',`${s.dn} of ${s.tot} assigned modules`)}${kpi(s.n?s.avg+'%':'–','Average score','Best attempt per module')}${kpi(s.att,'Need attention','Overdue or had a compromise',s.att?'danger':'',s.att?'alert':'')}</section>
  <div class="ov-grid"><div class="ov-main">
    <section class="panel panel--flush" aria-labelledby="tpH"><div class="panel-head"><div><h2 id="tpH">Team progress</h2><p>Scores are each person's best attempt. Red chips include at least one compromised decision.</p></div><a class="button button--quiet button--sm" href="#people">All people${icon('arrow','icon--sm')}</a></div>${peopleTable(rows)}</section>
    <section class="panel" aria-labelledby="mmH"><div class="panel-head"><div><h2 id="mmH">Most missed scenarios</h2><p>Share of attempts that ended in a compromise or a false alarm.</p></div></div>${missedList()}</section>
  </div><div class="ov-side">${feedPanel()}${assignPanel(rows)}${defaultPlanPanel()}</div></div>`;
}
function missedList(){
  const agg={};Object.values(Store.progress).forEach(pr=>Object.entries(pr.levels||{}).forEach(([lid,L])=>Object.entries(L.outcomes||{}).forEach(([tid,o])=>{const k=lid+'/'+tid;agg[k]=agg[k]||{n:0,bad:0};agg[k].n++;if(o==='compromise'||o==='false_alarm')agg[k].bad++})));
  const miss=Object.entries(agg).filter(([,v])=>v.bad).sort((a,b)=>b[1].bad/b[1].n-a[1].bad/a[1].n||b[1].bad-a[1].bad).slice(0,5).map(([k,v])=>{const[lid,tid]=k.split('/'),lv=levelById(lid),t=lv&&lv.tasks.find(x=>x.id===tid);if(!t)return'';const p=Math.round(v.bad/v.n*100);
    return`<li class="missed-row"><div style="min-width:0"><b>${esc(t.label)}</b><small>Level ${lv.n} · ${esc(lv.topic)}</small></div><div class="progress" data-tone="danger" aria-hidden="true"><i style="--p:${p/100}"></i></div><span class="pct">${p}%</span></li>`}).join('');
  return miss?`<ol class="missed-list" data-stagger>${miss}</ol>`:emptyState('target','Nothing missed yet','Results appear here as people finish modules.','',true);
}
function assignPanel(rows){
  const sel=draft.sel,due=draft.due||addDaysISO(Date.now(),14),ready=sel.size&&draft.levels.size;
  return`<section class="panel" data-keep aria-labelledby="asH"><div class="panel-head"><div><h2 id="asH">Assign program</h2><p>Game levels first, then a skills report, training and a final test. Re-assigning replaces someone's current program.</p></div></div>
   <form class="form-stack" id="assignForm" novalidate>
    <div class="field"><span class="field-label" id="lblPeople">People</span>${rows.length?`<div class="option-list option-list--scroll" role="group" aria-labelledby="lblPeople">${rows.map(r=>`<label class="check"><input type="checkbox" data-sel="${esc(r.id)}" ${sel.has(r.id)?'checked':''}><span>${esc(r.m.name||'Someone')}<small>${esc(r.m.dept||'No team')}</small></span></label>`).join('')}</div>`:'<span class="field-hint">Nobody to assign yet.</span>'}</div>
    <div class="field"><span class="field-label" id="lblMods">Modules</span><div class="option-list" role="group" aria-labelledby="lblMods">${LEVELS.map(l=>`<label class="check"><input type="checkbox" data-lv="${l.id}" ${draft.levels.has(l.id)?'checked':''}><span>L${l.n} · ${esc(l.title)}<small>${esc(l.topic)} · ${l.minutes} min</small></span></label>`).join('')}</div></div>
    ${field('dueIn','Due date',`<input class="input" type="date" id="dueIn" value="${due}" min="${todayISO()}">`)}
    ${field('noteIn','Note to employees',`<textarea class="input" id="noteIn" maxlength="240" placeholder="For example: please finish before the quarterly review." aria-describedby="noteInHint">${esc(draft.note)}</textarea>`,{optional:true,hint:'Shown on their training page.'})}
    <div class="field-row">${field('passIn','Final test pass mark',`<select class="select" id="passIn">${[60,70,75,80,90].map(v=>`<option value="${v}" ${draft.passMark===v?'selected':''}>${v}%</option>`).join('')}</select>`)}
    ${field('attemptsIn','Test attempts',`<select class="select" id="attemptsIn">${[1,2,3,5].map(v=>`<option value="${v}" ${draft.attempts===v?'selected':''}>${v===1?'1 attempt':v+' attempts'}</option>`).join('')}</select>`)}</div>
    <label class="check"><input type="checkbox" id="watchIn" ${draft.watch?'checked':''}><span>Include Watch skills in training<small>Weak skills are always trained. Watch skills (60 to 79%) get practice too.</small></span></label>
    <div class="form-actions"><button class="button button--primary button--block" type="submit" id="assignBtn" ${ready?'':'disabled'} aria-describedby="assignHint">${assignLabel()}</button><span class="field-hint" id="assignHint"${ready?' hidden':''}>Choose at least one person and one module.</span></div>
   </form></section>`;
}
const assignLabel=()=>{const n=draft.sel.size;return`Assign program to ${n} ${n===1?'person':'people'}`};
function defaultPlanPanel(){
  const cfgL=draft.defLevels||new Set(Store.config.defaultLevels||[]),cfgD=draft.defDays||Store.config.defaultDueDays||14;
  return`<section class="panel" data-keep aria-labelledby="dpH"><div class="panel-head"><div><h2 id="dpH">Auto-assign new joiners</h2><p>Anyone who joins without a plan gets these modules.</p></div></div>
   <div class="form-stack"><div class="option-list" role="group" aria-labelledby="dpH">${LEVELS.map(l=>`<label class="check"><input type="checkbox" data-def="${l.id}" ${cfgL.has(l.id)?'checked':''}><span>L${l.n} · ${esc(l.title)}</span></label>`).join('')}</div>
   ${field('defDays','Due after',`<select class="select" id="defDays">${[7,14,21,30].map(d=>`<option value="${d}" ${+cfgD===d?'selected':''}>${d} days</option>`).join('')}</select>`)}
   <button class="button button--secondary button--block" type="button" id="saveDef">Save default plan</button></div></section>`;
}
function peoplePage(){
  const rows=memberRows();
  return`<div class="page-head"><p>Everyone on the team, their plan and their best scores. Open a person to see each decision.</p>
   <div class="search"><label class="sr-only" for="peopleSearch">Search people</label>${icon('search')}<input class="input" id="peopleSearch" type="search" placeholder="Search by name or team" value="${esc(draft.search)}" autocomplete="off"></div></div>
   <section class="panel panel--flush" aria-label="People">${peopleTable(rows,{details:true})}<div id="noMatch" hidden>${emptyState('search','No one matches that search','Try a first name or a team such as Finance.','',true)}</div></section>`;
}
function personDrawer(id){
  const m=Store.members[id];if(!m)return;const a=assignFor(id,m,Store.assignments[id]),pr=Store.progress[id],st=statusOf(a,pr);
  const ids=[...new Set([...(a?a.levels:[]),...Object.keys((pr&&pr.levels)||{})])].filter(levelById);
  const results=ids.map(lid=>{const lv=levelById(lid),L=pr&&pr.levels&&pr.levels[lid];
    const outs=L&&L.done?scoredTasks(lv).map(t=>{const o=L.outcomes&&L.outcomes[t.id];if(!o||!OUT[o])return'';const[tone,ic]=OUT_UI[o];return`<li><span data-tone="${tone}">${icon(ic)}</span><span>${esc(t.label)}</span><span class="muted" style="margin-left:auto">${OUT[o].label}</span></li>`}).join(''):'';
    return`<article class="result-item"><header><h3>Level ${lv.n} · ${esc(lv.title)}</h3>${scoreChip(lid,pr,id)}</header>${L&&L.done?`<p class="muted" style="font-size:var(--t-xs)">${L.attempts} ${plural(L.attempts,'attempt')} · last ${L.last}%${L.completedAt?' · '+fmtDay(L.completedAt):''}</p><ul class="outcome-list">${outs}</ul>`:'<p class="muted" style="font-size:var(--t-xs)">Not finished yet.</p>'}</article>`}).join('');
  const body=`<div class="drawer-person">${avatarFor(id,m.name,'lg')}<div><h3>${esc(m.name||'Someone')}</h3><p>${esc(m.dept||'No team')}${m.joinedAt?' · joined '+fmtDay(m.joinedAt):''}</p></div></div>
   ${drawerTabs('overview')}<div data-dpanel="overview" role="tabpanel" class="drawer-panel">
   <div class="drawer-section"><span class="label">Plan</span><dl class="dl"><dt>Journey</dt><dd>${journeyPill(journeySummary(id),st)}</dd>${a?`<dt>Source</dt><dd>${a.source==='default'?'Auto plan for new joiners':'Assigned by a manager'}</dd><dt>Modules</dt><dd>${a.levels.map(l=>'L'+levelById(l).n).join(', ')}</dd>${a.due?`<dt>Due</dt><dd>${fmtDay(new Date(a.due+'T12:00:00').getTime())}</dd>`:''}`:''}<dt>Last active</dt><dd>${pr&&pr.lastActive?ago(pr.lastActive):'never'}</dd></dl>${a&&a.note?`<div class="quote"><small>Note</small>${esc(a.note)}</div>`:''}</div>
   <div class="drawer-section"><span class="label">Results</span>${results?`<div class="result-list">${results}</div>`:'<p class="muted">No modules yet.</p>'}</div></div>
   <div data-dpanel="report" role="tabpanel" class="drawer-panel" hidden></div><div data-dpanel="plan" role="tabpanel" class="drawer-panel" hidden></div>`;
  const foot=(Store.assignments[id]?`<button type="button" class="button button--danger" data-unassign="${esc(id)}">${icon('trash','icon--sm')}Remove program</button>`:'')
    +(canNudge(id)?`<button type="button" class="button button--secondary" data-nudge="${esc(id)}">${icon('bell','icon--sm')}Send a reminder</button>`:'');
  const d=openDrawer({title:'Person',body,footer:foot||null,onClose:()=>{if(drawerState&&drawerState.d===d)drawerState=null}});
  drawerState={id,d,tab:'overview'};
  d.el.querySelectorAll('[data-dtab]').forEach(b=>b.addEventListener('click',()=>{drawerState.tab=b.dataset.dtab;refreshDrawerTab()}));
  const rb=d.el.querySelector('[data-unassign]');rb&&rb.addEventListener('click',async()=>{if(await unassign(id))d.close()});
  const nb=d.el.querySelector('[data-nudge]');nb&&nb.addEventListener('click',()=>nudgePerson(id));
}
function refreshDrawerTab(){
  if(!drawerState)return;const{d,id,tab}=drawerState;
  d.el.querySelectorAll('[data-dtab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.dtab===tab)));
  d.el.querySelectorAll('[data-dpanel]').forEach(p=>{p.hidden=p.dataset.dpanel!==tab});
  const el=d.el.querySelector(`[data-dpanel="${tab}"]`);
  if(tab==='report')drawerReportTab(id,el);else if(tab==='plan')drawerPlanTab(id,el);
}
async function unassign(id){const m=Store.members[id],name=(m&&m.name)||'this person';
  const ok=await confirmModal({title:`Remove ${name}'s program?`,body:'Their results and any skills report stay. If a default plan is set, they move to it.',confirm:'Remove program',danger:true});
  if(!ok)return false;const r=await write('assignments/'+id,null);
  if(r===true){UI.toast('Program removed',{description:`${name} no longer has a manager-assigned program.`});renderPortal();return true}
  UI.toast('Could not remove the program',{type:'error',description:'Check your connection and try again.'});return false}
function modArt(l){
  const c=mk(260,84),g=c.getContext('2d');const gr=g.createLinearGradient(0,0,260,84);gr.addColorStop(0,'#173524');gr.addColorStop(1,'#0e1a14');g.fillStyle=gr;g.fillRect(0,0,260,84);
  g.fillStyle='rgba(74,222,128,.07)';for(let i=0;i<260;i+=16)g.fillRect(i,0,1,84);for(let j=0;j<84;j+=16)g.fillRect(0,j,260,1);
  const who={orientation:'ada',inbox:'dev',signals:'priya',access:'courier',executive:'hale'}[l.id],spr=sheet(P[who]).down[0];g.imageSmoothingEnabled=false;g.drawImage(spr,60,4,spr.width*2.7,spr.height*2.7);
  const prop={orientation:PROPS.usb[0],inbox:deskFrames('mail','')[0],signals:PROPS.phone[1],access:PROPS.notice[0],executive:PROPS.execDesk[0]}[l.id];g.imageSmoothingEnabled=true;const k=Math.min(90/prop.width,62/prop.height);g.drawImage(prop,150,(84-prop.height*k)/2,prop.width*k,prop.height*k);return c;
}
function programsPage(){
  return`<section class="panel">${emptyState('programs','Training programs will appear here','A program bundles modules with a due date and a pass mark for the final test. Until then, assign modules from Overview.',`<a class="button button--secondary" href="#overview">Assign modules${icon('arrow','icon--sm')}</a>`,true)}</section>
  <div class="page-head"><div><h2 style="font-size:var(--t-xl);font-weight:800">Module library</h2><p>Five levels, ${LEVELS.reduce((s,l)=>s+scoredTasks(l).length,0)} scenarios. Each scenario asks the player to inspect, then decide. Some requests are genuine, so over-reporting costs points too.</p></div></div>
  <div class="module-grid" data-stagger>${LEVELS.map(l=>`<article class="panel module-card"><div class="module-art" data-art="${l.id}"></div><span class="label">Level ${l.n}</span><h3>${esc(l.title)}</h3><p>${esc(l.blurb)}</p><div class="tag-row"><span class="tag">${esc(l.topic)}</span><span class="tag">${scoredTasks(l).length} scenarios</span><span class="tag">${l.minutes} min</span></div><button class="button button--secondary button--sm" type="button" data-play="${l.id}">${icon('play','icon--sm')}Preview level</button></article>`).join('')}</div>`;
}

/* =========================================================
   EMPLOYEE PAGES
   ========================================================= */
const starRow=n=>`<span class="star-row" aria-label="${n} of 3 stars">${'★'.repeat(n)}<i>${'★'.repeat(3-n)}</i></span>`;
function journeyPage(){
  const m=Store.myMember;
  if(Store.mode==='live'&&!m){const nm=draft.joinName||Store.me.name||'';
    return`<section class="panel" data-keep aria-labelledby="joinH"><div class="form-stack"><div><h1 id="joinH" class="display" style="font-size:var(--t-2xl)">Join your team's training</h1><p class="muted" style="margin-top:4px">Your manager uses this page to assign security training. Tell them who you are.</p></div>
      ${field('jName','Your name',`<input class="input" id="jName" maxlength="60" value="${esc(nm)}" autocomplete="name">`)}
      ${field('jDept','Team or department',`<input class="input" id="jDept" maxlength="40" value="${esc(draft.joinDept)}" placeholder="For example Finance">`,{optional:true})}
      <button class="button button--primary button--block" type="button" id="joinBtn">Join training</button><div class="form-error" id="joinNote" role="alert">${Store.canWrite===false?esc('Your access is view-only. Ask your manager to share this page with you as a Contributor so your progress can be saved.'):''}</div></div></section>`}
  const a=assignFor(Store.me.id,m,Store.myAssign),pr=Store.myProg,first=((m&&m.name)||Store.me.name||'there').split(' ')[0],J=myJourney();
  const lvls=a?a.levels.map(levelById).filter(Boolean):[];const done=J.program?J.levels.filter(l=>l.state==='done').length:lvls.filter(l=>lvDone(pr,l.id)).length,pct=lvls.length?Math.round(done/lvls.length*100):0;
  const late=a&&a.due&&a.due<todayISO()&&done<lvls.length,st=statusOf(a,pr);
  const greet=`<header class="greet"><div><h1 class="display" id="greetH">Hi ${esc(first)}</h1><p>${a?(J.report_id?'Your skills report is ready. Your next step is marked below.':late?'Your training is overdue. Pick up where you left off below.':'Your next step is marked below.'):"You don't have any training assigned yet."}</p></div></header>`;
  const C=2*Math.PI*42;
  const program=a?`<section class="panel program" aria-labelledby="progH"><div><span class="label">${a.source==='default'?'Your starter plan':'Your training'}</span><h2 id="progH" style="margin-top:4px">${done} of ${lvls.length} ${plural(lvls.length,'level')} played</h2>
      <div class="program-meta">${statusPill(st)}${a.due?`<span>${late?'Was due':'Due'} ${fmtDate(a.due)}</span>`:''}</div></div>
      <div class="ring" role="img" aria-label="${pct}% complete"><svg viewBox="0 0 100 100"><circle class="ring-track" cx="50" cy="50" r="42"/><circle class="ring-fill" cx="50" cy="50" r="42" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"${pct?'':' stroke-opacity="0"'}/></svg><b>${pct}%</b></div>
      ${a.note?`<div class="quote"><small>Note from your manager</small>${esc(a.note)}</div>`:''}</section>`
    :`<section class="panel">${emptyState('journey','No training assigned yet',"When your manager assigns modules, they appear here in order. Until then, try one for practice.",`<button type="button" class="button button--secondary" data-play="orientation">${icon('play','icon--sm')}Try Level 1</button>`,true)}</section>`;
  let curFound=false;
  const steps=lvls.map((l,i)=>{const L=pr&&pr.levels&&pr.levels[l.id],isD=L&&L.done,cur=!isD&&!curFound;if(cur)curFound=true;const state=isD?'done':cur?'next':'locked';
    const node=isD?icon('check'):cur?'<span class="next-marker" aria-hidden="true"></span>':icon('lock','icon--sm');
    const meta=isD?`${starRow(L.stars||1)}Best <span class="num">${L.best}%</span> · ${L.attempts} ${plural(L.attempts,'attempt')}`:cur?`${esc(l.topic)} · ${scoredTasks(l).length} scenarios · about ${l.minutes} min`:`Unlocks after Level ${lvls[i-1].n}`;
    const action=isD?`<button class="button button--secondary button--sm" type="button" data-play="${l.id}" aria-label="Replay Level ${l.n}">Replay</button>`:cur?`<button class="button button--primary" type="button" data-play="${l.id}">${L?'Resume':'Start'}${icon('play','icon--sm')}</button>`:'<span></span>';
    return`<li class="j-step" data-state="${state}"><span class="j-node">${node}</span><div class="j-body"><h3>${cur?'<span class="sr-only">Next step: </span>':''}Level ${l.n} · ${esc(l.title)}</h3><p>${meta}</p></div>${action}</li>`}).join('');
  const journey=a&&J.program?journeyStages(J,pr):a?`<section class="panel" aria-labelledby="jH"><div class="panel-head"><div><h2 id="jH">Your journey</h2><p>Modules unlock in order. Replay any finished module to improve your score.</p></div></div><ol class="journey" data-stagger>${steps}</ol></section>`:'';
  const badges=`<section class="panel" aria-labelledby="bH"><div class="panel-head"><div><h2 id="bH">Badges</h2><p>Earn one for each module you finish.</p></div></div><ul class="badge-row">${LEVELS.map(l=>{const e=lvDone(pr,l.id);return`<li class="badge" data-earned="${e}"><i>${icon(e?'check':'lock')}</i>${BADGE[l.id]}<span class="sr-only">${e?' (earned)':' (not earned yet)'}</span></li>`}).join('')}</ul></section>`;
  const practice=`<section class="panel" aria-labelledby="pH"><div class="panel-head"><div><h2 id="pH">${a?'Practice any module':'Practice modules'}</h2><p>${a?'Practice runs are recorded too, so your manager sees your best score.':'Results are saved to your record.'}</p></div></div><div class="practice-grid">${LEVELS.map(l=>`<button class="practice-item" type="button" data-play="${l.id}"><span><b>L${l.n} · ${esc(l.title)}</b><small>${esc(l.topic)}${lvDone(pr,l.id)?' · best '+pr.levels[l.id].best+'%':''}</small></span>${icon('play')}</button>`).join('')}</div></section>`;
  return greet+nudgeBanner()+program+journey+badges+practice;
}
function profilePage(){
  const m=Store.myMember||{},name=m.name||Store.me.name||'You';
  return`<section class="panel profile-card" aria-labelledby="prH"><div class="profile-head">${avatarFor(Store.me.id,name,'lg')}<div><h2 id="prH">${esc(name)}</h2><p>${esc(m.dept||Store.me.dept||'No team')} · ${roleName()}</p></div></div>
   <dl class="dl">${Store.me.email?`<dt>Email</dt><dd>${UI.renderAddr(Store.me.email)}</dd>`:''}${m.joinedAt?`<dt>Joined</dt><dd>${fmtDay(m.joinedAt)}</dd>`:''}</dl></section>
   <section class="panel" aria-labelledby="stH"><div class="panel-head"><div><h2 id="stH">This device</h2><p>Settings here apply only to this browser.</p></div></div>
    <div class="form-stack"><div class="setting-row"><div><b>Theme</b><small>System follows your phone or computer.</small></div>${UI.themeSwitch()}</div>
    <label class="check"><input type="checkbox" id="leftyIn" ${typeof Pad!=='undefined'&&Pad.lefty?'checked':''}><span>Left-handed controls<small>On touch screens, puts the joystick on the right and the action button on the left.</small></span></label>
    ${Store.mode==='local'?`<div class="setting-row"><div><b>Sign out</b><small>You can sign back in with your email and password.</small></div><button type="button" class="button button--secondary" data-signout>${icon('logout','icon--sm')}Sign out</button></div>`:''}</div></section>`;
}

/* =========================================================
   VIEW EVENTS
   ========================================================= */
function bindView(view,page){
  view.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click',()=>{audioInit();startLevel(b.dataset.play,{graded:true})}));
  view.querySelectorAll('[data-art]').forEach(el=>el.append(modArt(levelById(el.dataset.art))));
  view.querySelectorAll('[data-signout]').forEach(b=>b.addEventListener('click',logoutLocal));
  const li=$('leftyIn');li&&li.addEventListener('change',()=>{Pad.setLefty(li.checked);UI.toast(li.checked?'Left-handed controls on':'Left-handed controls off',{description:li.checked?'Joystick on the right, action button on the left.':'Joystick on the left, action button on the right.'})});
  view.querySelectorAll('[data-sel]').forEach(c=>c.addEventListener('change',()=>{c.checked?draft.sel.add(c.dataset.sel):draft.sel.delete(c.dataset.sel);updAssignBtn()}));
  view.querySelectorAll('[data-lv]').forEach(c=>c.addEventListener('change',()=>{c.checked?draft.levels.add(c.dataset.lv):draft.levels.delete(c.dataset.lv);updAssignBtn()}));
  view.querySelectorAll('[data-def]').forEach(c=>c.addEventListener('change',()=>{draft.defLevels=draft.defLevels||new Set(Store.config.defaultLevels||[]);c.checked?draft.defLevels.add(c.dataset.def):draft.defLevels.delete(c.dataset.def)}));
  view.querySelectorAll('[data-unassign]').forEach(b=>b.addEventListener('click',async e=>{e.stopPropagation();b.disabled=true;await unassign(b.dataset.unassign);b.disabled=false}));
  view.querySelectorAll('[data-details]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();personDrawer(b.dataset.details)}));
  view.querySelectorAll('[data-nudge]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();nudgePerson(b.dataset.nudge)}));
  const slot=view.querySelector('[data-feed-slot]');if(slot)slot.replaceWith(getFeedList());
  view.querySelectorAll('[data-dismiss-nudge]').forEach(b=>b.addEventListener('click',()=>{try{localStorage.setItem('pv-nudge-seen',b.dataset.dismissNudge)}catch(e){}renderPortal()}));
  view.querySelectorAll('tr[data-href]').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('button,a,input'))return;personDrawer(tr.dataset.person)}));
  view.querySelectorAll('[data-copy-link]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.origin);UI.toast('Link copied',{description:location.origin})}catch(e){UI.toast('Copy this link',{type:'info',description:location.origin})}}));
  const due=$('dueIn');due&&due.addEventListener('change',()=>{draft.due=due.value});
  const note=$('noteIn');note&&note.addEventListener('input',()=>{draft.note=note.value});
  const pi=$('passIn');pi&&pi.addEventListener('change',()=>{draft.passMark=+pi.value});
  const ai=$('attemptsIn');ai&&ai.addEventListener('change',()=>{draft.attempts=+ai.value});
  const wi=$('watchIn');wi&&wi.addEventListener('change',()=>{draft.watch=wi.checked});
  const dd=$('defDays');dd&&dd.addEventListener('change',()=>{draft.defDays=+dd.value});
  const af=$('assignForm');af&&af.addEventListener('submit',async e=>{e.preventDefault();const ab=$('assignBtn');if(ab.disabled)return;ab.disabled=true;ab.setAttribute('aria-busy','true');
    const ids=[...draft.sel],lv=LEVELS.map(l=>l.id).filter(id=>draft.levels.has(id)),dueV=draft.due||addDaysISO(Date.now(),14);let ok=0,fail=0;
    const prog={levels:lv,due:dueV,note:draft.note.trim(),assignedAt:Date.now(),by:Store.me.id,pass_mark:draft.passMark,max_test_attempts:draft.attempts,
      allow_watch_training:draft.watch,passMark:draft.passMark,maxTestAttempts:draft.attempts,allowWatchTraining:draft.watch};
    for(const id of ids){const r=await write('assignments/'+id,prog);r===true?ok++:fail++}
    draft.sel.clear();
    if(fail)UI.toast(`Assigned to ${ok}. ${fail} could not be saved.`,{type:'error',description:'Check that you are a manager or an editor of this page, then try again.'});
    else UI.toast(`Program assigned to ${ok} ${ok===1?'person':'people'}`,{description:`${lv.length} ${plural(lv.length,'level')}, due ${fmtDate(dueV)}. Pass mark ${draft.passMark}%.`});
    renderPortal()});
  const sd=$('saveDef');sd&&sd.addEventListener('click',async()=>{sd.setAttribute('aria-busy','true');const lv=LEVELS.map(l=>l.id).filter(id=>(draft.defLevels||new Set(Store.config.defaultLevels)).has(id));const days=draft.defDays||Store.config.defaultDueDays||14;
    const r=await write('config/team',{defaultLevels:lv,defaultDueDays:days});draft.defLevels=null;draft.defDays=null;if(Store.mode==='live'&&r===true)Store.config={defaultLevels:lv,defaultDueDays:days};
    if(r===true)UI.toast('Default plan saved',{description:lv.length?`New joiners get ${lv.length} ${plural(lv.length,'module')}, due after ${days} days.`:'New joiners get no modules until you assign some.'});else UI.toast('Could not save the default plan',{type:'error',description:'Check your connection and try again.'});
    renderPortal()});
  const ps=$('peopleSearch');if(ps){const apply=()=>{const q=ps.value.trim().toLowerCase();draft.search=ps.value;let n=0;view.querySelectorAll('tr[data-person]').forEach(tr=>{const hit=!q||tr.dataset.name.includes(q);tr.hidden=!hit;if(hit)n++});const nm=$('noMatch');if(nm)nm.hidden=n>0||!q};ps.addEventListener('input',apply);apply()}
  const jn=$('jName'),jd=$('jDept');jn&&jn.addEventListener('input',()=>{draft.joinName=jn.value});jd&&jd.addEventListener('input',()=>{draft.joinDept=jd.value});
  const jb=$('joinBtn');jb&&jb.addEventListener('click',async()=>{const name=(jn.value||'').trim();if(!name){setFieldError('jName','Please enter your name.');jn.focus();return}jb.disabled=true;jb.setAttribute('aria-busy','true');
    const r=await write('members/'+Store.me.id,{name,dept:(jd.value||'').trim(),joinedAt:Date.now()});if(r===true){Store.myMember={name,dept:(jd.value||'').trim(),joinedAt:Date.now()};renderPortal()}else{jb.disabled=false;jb.removeAttribute('aria-busy');$('joinNote').textContent=r==='invalid_argument'?'Your access is view-only. Ask your manager to share this page with you as a Contributor.':'Could not join right now. Please try again.'}});
}
function updAssignBtn(){const b=$('assignBtn');if(!b)return;const ready=!!(draft.sel.size&&draft.levels.size);b.disabled=!ready;b.textContent=assignLabel();const h=$('assignHint');if(h)h.hidden=ready}

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
