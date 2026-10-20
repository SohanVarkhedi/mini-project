/* =========================================================
   JOURNEY + SKILLS REPORT (portal). Game -> Skills report -> Training -> Final test -> Certificate.
   Local mode: the server derives the journey (/api/state myJourney, journeys) and stores reports.
   Demo/live modes: clientJourney() runs js/rules.js (kept identical to the server by tests/e2e/test_parity.py)
   on recorded sessions (PV_CONTENT.demo sample sessions + plays made in the demo). Uses portal.js globals at call time (Store, icon, esc, API, ...).
   ========================================================= */
const SKILLS=(window.PV_CONTENT&&PV_CONTENT.skills)||[];
const skillById=id=>SKILLS.find(s=>s.id===id);
const CUE_LABEL={urgency:'Urgent deadlines',authority:'Senior or official senders',reward:'Rewards and freebies',fear:'Threats and scares',
  curiosity:'Tempting files and links',familiarity:'Familiar names',secrecy:'Requests for secrecy',helpfulness:'Requests for favours'};
const CHANNEL_LABEL={email:'Email',sms:'Text message',call:'Phone call',chat:'Chat',mfa:'MFA prompt',object:'In the office',person:'In person'};
const BAND_UI={strong:['safe','check','Strong'],watch:['caution','dash','Watch'],weak:['danger','alert','Weak'],insufficient:['','circle','Not enough evidence']};
const STAGE_ABOUT={game:'Play your assigned levels. Your first try at each one becomes your skills report.',
  report:'Your strong areas and weak spots, built from your choices in the game.',training:'Short simulations for the skills you need to practise.',
  test:'Unseen scenarios with no hints.',certificate:'A certificate your manager can verify when you pass the final test.'};
const STAGE_TITLE={game:'Game',report:'Skills report',training:'Training',test:'Final test',certificate:'Certificate'};
const bandPill=b=>{const[tone,ic,label]=BAND_UI[b]||BAND_UI.insufficient;return`<span class="status-pill"${tone?` data-tone="${tone}"`:''}>${icon(ic)}${label}</span>`};
const reportCache={};/* uid -> report | null (none yet) */

/* ---------- journey in demo/live: web/js/rules.js, the same rules as the server ---------- */
function sessionsFor(uid){
  if(Store.mode==='demo')return(Store.demoSessions&&Store.demoSessions[uid])||[];
  /* live mode keeps only progress summaries: rebuild one session per finished level from them */
  const pr=uid===Store.me.id?(Store.myProg||Store.progress[uid]):Store.progress[uid];
  return Object.entries((pr&&pr.levels)||{}).filter(([lid,L])=>L.done&&levelById(lid)).map(([lid,L],n)=>({level_id:lid,purpose:'baseline',started_at:1+n,finished_at:L.completedAt||2+n,score:L.best,
    decisions:scoredTasks(levelById(lid)).map(t=>{const o=(L.outcomes||{})[t.id]||'safe',i=Math.max(0,t.enc.acts.findIndex(a=>a.o===o));return{task_id:t.id,action_index:i,outcome:o,severity:o==='compromise'?(t.enc.acts[i].sev||null):null,n_inspections:1,response_ms:8000}})}));
}
function clientJourney(uid){
  const isMe=uid===Store.me.id,m=isMe?(Store.myMember||Store.members[uid]):Store.members[uid];
  const a=assignFor(uid,m,isMe?(Store.myAssign||Store.assignments[uid]):Store.assignments[uid]);
  const program=a?{levels:a.levels.filter(levelById),due:a.due||'',note:a.note||'',pass_mark:a.passMark||70,allow_watch_training:a.allowWatchTraining!==false,created_at:0,source:a.source}:null;
  const j=PVRules.journey(PV_CONTENT,SKILLS,program,sessionsFor(uid),null,todayISO());
  return{...j,report_id:j.report?'local_'+uid:null};
}
const myJourney=()=>Store.mode==='local'&&Store.myJourney?Store.myJourney:clientJourney(Store.me.id);
function journeySummary(uid){
  if(Store.mode==='local')return(Store.journeys||{})[uid]||null;
  const j=clientJourney(uid);if(!j.program)return null;const game=j.stages[0];
  return{current:j.current,game:game.state,played:j.levels.filter(l=>l.state==='done').length,levels:j.levels.length,weakest:j.weakest,report_id:j.report_id,overdue:j.overdue,plan:j.plan&&j.plan.skills};
}

/* ---------- people table: journey stage pill + weakest skill ---------- */
function journeyPill(s,fallback){
  if(!s)return statusPill(fallback);
  const t=(tone,ic,label)=>`<span class="status-pill"${tone?` data-tone="${tone}"`:''}>${icon(ic)}${label}</span>`;
  if(s.current==='game'){if(s.overdue)return t('danger','alert',s.played?`Overdue · ${s.played}/${s.levels}`:'Overdue');return s.game==='available'?t('','circle','Not started'):t('info','play',`Playing · ${s.played}/${s.levels}`)}
  if(s.current==='training')return t('info','target','Training');
  if(s.current==='test')return t('info','clock','Final test');
  if(s.current==='certificate')return t('info','certificate','Certificate');
  return t('safe','check','Complete');
}

/* ---------- employee journey: the five stages; levels nested in the Game stage ---------- */
function journeyStages(j,pr){
  const nextStage=j.next&&j.next.stage;
  const items=j.stages.map(s=>{
    const isNext=nextStage===s.id&&s.id!=='game'&&j.next.action;/* the game's marker sits on its next level */
    const node=s.state==='done'?icon('check'):isNext?'<span class="next-marker" aria-hidden="true"></span>':s.state==='locked'?icon('lock','icon--sm'):s.id==='game'?icon('play','icon--sm'):icon('circle','icon--sm');
    const label={done:'Done',in_progress:'In progress',available:'Ready',locked:'Coming up'}[s.state];
    let sub='',action='';
    if(s.id==='game')sub=`<ol class="lvl-list">${j.levels.map(l=>levelRow(l,pr)).join('')}</ol>`;
    if(s.id==='report'&&s.state==='done')action=`<a class="button button--secondary button--sm" href="#skills">View report</a>`;
    if(s.id==='training'&&isNext)action=`<a class="button button--primary" href="#plan">${esc(j.next.label)}${icon('arrow','icon--sm')}</a>`;
    else if(s.id==='training'&&s.state!=='locked')action=`<a class="button button--secondary button--sm" href="#plan">View plan</a>`;
    return`<li class="stage" data-state="${s.state}"${j.current===s.id?' data-current':''}><span class="stage-node">${node}</span><div class="stage-body"><h3>${isNext?'<span class="sr-only">Next step: </span>':''}${esc(s.title)} <small class="stage-state">${label}</small></h3><p>${esc(s.description)}</p>${sub}</div>${action?`<div class="stage-action">${action}</div>`:''}</li>`});
  return`<section class="panel" aria-labelledby="jH"><div class="panel-head"><div><h2 id="jH">Your journey</h2><p>Five steps from your first game to your certificate. The gold marker shows your next step.</p></div></div><ol class="stages" data-stagger>${items.join('')}</ol></section>`;
}
function levelRow(l,pr){
  const L=pr&&pr.levels&&pr.levels[l.id],lv=levelById(l.id),isNext=l.state==='next';
  const node=l.state==='done'?icon('check'):isNext?'<span class="next-marker" aria-hidden="true"></span>':icon('lock','icon--sm');
  const meta=l.state==='done'?`${L&&L.stars?starRow(L.stars):''}First try <span class="num">${l.score}%</span>${L&&L.best!==l.score?` · best <span class="num">${L.best}%</span>`:''}`:isNext?`${esc(lv.topic)} · ${scoredTasks(lv).length} scenarios · about ${lv.minutes} min`:'Unlocks after the level before';
  const action=l.state==='done'?`<button class="button button--secondary button--sm" type="button" data-play="${l.id}" aria-label="Replay Level ${l.n}">Replay</button>`
    :isNext?`<button class="button button--primary" type="button" data-play="${l.id}">${l.started||L?'Resume':'Start'}${icon('play','icon--sm')}</button>`:'';
  return`<li class="lvl" data-state="${l.state}"><span class="lvl-node">${node}</span><div class="lvl-body"><b>${isNext?'<span class="sr-only">Next step: </span>':''}Level ${l.n} · ${esc(l.title)}</b><small>${meta}</small></div>${action}</li>`;
}

/* ---------- the report (employee page + manager drawer) ---------- */
async function loadReport(uid){
  const self=uid===Store.me.id;
  if(Store.mode!=='local'){const j=self?myJourney():clientJourney(uid);return j.report?{...j.report,id:j.report_id,created_at:Date.now()}:null}
  if(uid in reportCache)return reportCache[uid];
  try{reportCache[uid]=await API(self?'report':`people/${encodeURIComponent(uid)}/report`)}catch(e){if(e.status===404)reportCache[uid]=null;else throw e}
  return reportCache[uid];
}
const skillIcon=s=>icon((skillById(s.id)||s).icon||'target');
function reportHTML(r,{they=false,name='',planCta=''}={}){
  const sk=Object.fromEntries(r.skills.map(s=>[s.id,s]));const levels=Object.keys(r.levels||{}).map(levelById).filter(Boolean).sort((a,b)=>a.n-b.n);/* JSON key order isn't kept */
  const list=(ids,tone,emptyText)=>ids.length?`<ul class="sw-list">${ids.map(id=>{const s=sk[id];return`<li><span class="sw-icon" data-tone="${tone}">${skillIcon(s)}</span><span><b>${esc(s.name)}</b><small>${s.score}% · ${s.safe} of ${s.scenarios} safe</small></span></li>`}).join('')}</ul>`:`<p class="muted sw-empty">${emptyText}</p>`;
  const weakOrWatch=[...r.weak,...(r.weak.length?[]:r.watch.slice(0,1))];
  const bars=r.skills.filter(s=>s.scenarios).map(s=>{const[tone]=BAND_UI[s.band];const v=s.score==null?'–':s.score+'%';
    return`<li class="skill"><span class="skill-name">${skillIcon(s)}${esc(s.name)}</span><span class="skill-value">${v}</span><div class="progress"${tone?` data-tone="${tone}"`:''} aria-hidden="true"><i style="--p:${(s.score||0)/100}"></i></div><div class="skill-meta">${bandPill(s.band)}<small>Tested in ${s.scenarios} situation${s.scenarios===1?'':'s'}</small></div></li>`}).join('');
  const untested=r.skills.filter(s=>!s.scenarios).map(s=>s.name);
  const slips=r.skills.filter(s=>s.revealed&&s.revealed.length&&(s.band==='weak'||(!r.weak.length&&r.watch[0]===s.id))).map(s=>`<section class="slip-group" aria-label="${esc(s.name)}"><h3>${skillIcon(s)}${esc(s.name)} ${bandPill(s.band)}</h3><ol class="slips">${s.revealed.map(x=>{const[tone,ic]=OUT_UI[x.outcome]||OUT_UI.acceptable;
    return`<li class="slip"><div class="slip-head"><span class="tag">${CHANNEL_LABEL[x.channel]||x.channel}</span><b>${esc(x.title)}</b></div>
      ${x.addresses&&x.addresses.length?`<p class="slip-addr">${x.addresses.map(a=>UI.renderAddr(a,{flag:true})).join(' ')}</p>`:''}
      <dl class="slip-dl"><dt>${they?'They chose':'You chose'}</dt><dd>${esc(x.chose)} <span class="status-pill" data-tone="${tone}">${icon(ic)}${esc(x.outcome_label)}</span></dd>${x.safer?`<dt>Safer</dt><dd>${esc(x.safer)}</dd>`:''}</dl>
      <p class="slip-lesson">${icon('info','icon--sm')}${esc(x.lesson)}</p></li>`}).join('')}</ol></section>`).join('');
  const h=r.habits,cues=r.cues.length?`<ul class="cue-list">${r.cues.map(c=>`<li><b>${CUE_LABEL[c.cue]||c.cue}</b><span class="num">${c.fails} of ${c.scenarios}</span><div class="progress" data-tone="danger" aria-hidden="true"><i style="--p:${c.rate/100}"></i></div><small>${they?'Fell for':'You fell for'} ${c.fails} of ${c.scenarios} scams that used this.</small></li>`).join('')}</ul>`:`<p class="muted">${they?'No pressure tactic caught them out more than once.':'No pressure tactic caught you out more than once. Nice.'}</p>`;
  const habits=they?`<dl class="dl habit-dl"><dt>Opened clues first</dt><dd>${h.inspected} of ${h.decisions} situations</dd>${h.median_ms!=null?`<dt>Typical decision time</dt><dd>${Math.max(1,Math.round(h.median_ms/1000))} seconds</dd>`:''}${h.genuine?`<dt>Genuine requests reported</dt><dd>${h.false_alarms} of ${h.genuine}</dd>`:''}</dl>`
    :`<ul class="advice">${r.advice.map(a=>`<li>${icon(a.icon)}<span>${esc(a.text)}</span></li>`).join('')}</ul>`;
  return`<section class="panel report-summary" aria-label="Summary"><p>${esc(they?r.summary_manager:r.summary)}</p><small class="muted">From ${they?`${esc(name)}'s`:'your'} first try at ${levels.map(l=>esc(l.title)).join(' and ')} · ${fmtDay(r.created_at)}</small></section>
    <div class="sw-grid"><section class="panel" aria-labelledby="swS${they?'m':''}"><h2 id="swS${they?'m':''}" class="sw-title">${icon('check')}Strong areas</h2>${list(r.strong,'safe',they?'No strong areas yet.':'No strong areas yet. Training builds them.')}</section>
      <section class="panel" aria-labelledby="swW${they?'m':''}"><h2 id="swW${they?'m':''}" class="sw-title">${icon('alert')}Weak spots</h2>${list(weakOrWatch,r.weak.length?'danger':'caution',they?'No weak spots.':'No weak spots. Keep it up.')}</section></div>
    ${planCta}
    <section class="panel" aria-labelledby="allS${they?'m':''}"><div class="panel-head"><div><h2 id="allS${they?'m':''}">Every skill</h2><p>Strong 80% and up · Watch 60 to 79% · Weak below 60%. A skill needs a few situations before it's scored.</p></div></div><ul class="skill-list">${bars}</ul>${untested.length?`<p class="skill-untested">${icon('circle','icon--sm')}<span>Not tested by ${they?'their':'these'} levels yet: ${esc(untested.join(', '))}.</span></p>`:''}</section>
    ${slips?`<section class="panel" aria-labelledby="slS${they?'m':''}"><div class="panel-head"><div><h2 id="slS${they?'m':''}">Where ${they?'they':'you'} slipped</h2><p>The situations that revealed ${they?'their':'your'} weak spots, and the safer choice.</p></div></div>${slips}</section>`:''}
    <section class="panel" aria-labelledby="cuS${they?'m':''}"><div class="panel-head"><div><h2 id="cuS${they?'m':''}">Pressure tactics to watch</h2><p>Scams lean on a few tricks. These worked on ${they?'them':'you'} most often.</p></div></div>${cues}</section>
    <section class="panel" aria-labelledby="haS${they?'m':''}"><div class="panel-head"><div><h2 id="haS${they?'m':''}">${they?'Habits':'Your habits'}</h2></div></div>${habits}</section>`;
}
function reportPage(){
  const j=myJourney(),r=reportCache[Store.me.id];
  if(!j.report_id){const left=j.levels.filter(l=>l.state!=='done').length;
    return comingSoon('skills','Your skills report appears here',j.program?`Play ${left===1?'your last level':`your ${left} remaining levels`} once and your report is ready straight away: where you're strong and which scams to practise.`:"When your manager assigns training, your report is built from your first try at each level.",'Go to your journey','#journey')}
  if(r===undefined||(r&&r.id!==j.report_id)){loadReport(Store.me.id).then(()=>scheduleRender()).catch(()=>{});return`<section class="panel"><span class="skeleton skeleton--title"></span><span class="skeleton skeleton--text" style="margin-top:12px"></span><span class="skeleton skeleton--text" style="--w:80%;margin-top:8px"></span></section>`}
  const cta=j.plan&&j.plan.skills.length?`<div class="report-next"><span class="next-marker" aria-hidden="true"></span><a class="button button--primary" href="#plan">Start your training plan${icon('arrow','icon--sm')}</a></div>`:`<div class="report-next"><a class="button button--secondary" href="#journey">See what's next${icon('arrow','icon--sm')}</a></div>`;
  return`<header class="page-intro"><span class="label">Skills report</span><h1 class="display">Your skills report</h1></header>${reportHTML(r,{planCta:cta})}`;
}
function planPage(){
  const j=myJourney();
  if(!j.plan)return comingSoon('target','Your training plan appears here','It is made from your skills report, which is ready after you play every level once.','Go to your journey','#journey');
  const r=reportCache[Store.me.id],sk=r?Object.fromEntries(r.skills.map(s=>[s.id,s])):{};
  if(r===undefined&&j.report_id)loadReport(Store.me.id).then(()=>scheduleRender()).catch(()=>{});
  const items=j.plan.skills.map((id,i)=>{const meta=skillById(id)||{name:id,description:''},s=sk[id];
    return`<li class="plan-item"><span class="plan-n" aria-hidden="true">${i+1}</span><span class="sw-icon">${icon(meta.icon||'target')}</span><div><b>${esc(meta.name)}</b><small>${esc(meta.description)}</small></div>${s?bandPill(s.band):''}</li>`}).join('');
  return`<header class="page-intro"><span class="label">Training</span><h1 class="display">Your plan</h1><p class="muted">Short simulations for the skills your report flagged, weakest first.</p></header>
    ${j.plan.skills.length?`<div class="banner">${icon('clock')}<div><b>Simulations for these skills arrive in the next update.</b> Your manager can see this plan and may adjust it.</div></div>
    <section class="panel" aria-label="Skills to practise"><ol class="plan-list">${items}</ol>${j.plan.edited_by?'<p class="muted" style="font-size:var(--t-xs);margin-top:12px">Your manager adjusted this plan.</p>':''}</section>`
    :`<section class="panel">${emptyState('check','Nothing to practise',"Your report showed no weak spots. The final test is your next step.",'',true)}</section>`}
    <p><a href="#skills">Back to your skills report</a></p>`;
}

/* ---------- manager drawer tabs ---------- */
let drawerState=null;/* {id, d, tab} while a person's drawer is open */
function drawerTabs(active){return`<div class="tabs drawer-tabs" role="tablist" aria-label="Person">${[['overview','Overview'],['report','Skills report'],['plan','Training plan']].map(([k,l])=>`<button type="button" class="tab" role="tab" data-dtab="${k}" aria-selected="${k===active}">${l}</button>`).join('')}</div>`}
async function drawerReportTab(id,el){
  const m=Store.members[id]||{},name=firstName(m.name),s=journeySummary(id);
  el.innerHTML='<span class="skeleton skeleton--block" style="--h:120px"></span>';
  let r=null;try{r=await loadReport(id)}catch(e){el.innerHTML=emptyState('wifiOff','Could not load the report','Check your connection and try again.','',true);return}
  if(!drawerState||drawerState.id!==id||drawerState.tab!=='report')return;
  el.innerHTML=r?reportHTML(r,{they:true,name}):emptyState('skills','No skills report yet',s&&s.levels?`It's ready as soon as ${esc(name)} plays every assigned level once (${s.played} of ${s.levels} so far).`:`${esc(name)} needs a program first.`,'',true);
}
async function drawerPlanTab(id,el){
  const m=Store.members[id]||{},name=firstName(m.name),s=journeySummary(id);
  if(!s||!s.plan){el.innerHTML=emptyState('target','No training plan yet',`It's made from ${esc(name)}'s skills report.`,'',true);return}
  let r=null;try{r=await loadReport(id)}catch(e){}
  const sk=r?Object.fromEntries(r.skills.map(x=>[x.id,x])):{},chosen=new Set(s.plan);
  const rank=id=>{const x=sk[id];return!x||x.band==='insufficient'?101:x.score};
  const order=[...s.plan.map(skillById).filter(Boolean),...SKILLS.filter(x=>!chosen.has(x.id)).sort((a,b)=>rank(a.id)-rank(b.id))];/* the plan's own order, then the rest weakest first */
  const note=x=>!x||!x.scenarios?'Not tested yet':x.band==='insufficient'?`Not enough evidence (${x.scenarios} situation${x.scenarios===1?'':'s'})`:`${x.score}% · ${BAND_UI[x.band][2]}`;
  el.innerHTML=`<p class="muted" style="font-size:var(--t-sm)">Skills ${esc(name)} will practise, weakest first. Made from the report${Store.mode==='local'?'; changes save for this program only':''}.</p>
    <div class="option-list" role="group" aria-label="Skills in the plan">${order.map(x=>`<label class="check"><input type="checkbox" data-plan="${x.id}" ${chosen.has(x.id)?'checked':''}><span>${esc(x.name)}<small>${note(sk[x.id])}</small></span></label>`).join('')}</div>
    <button type="button" class="button button--secondary button--block" data-save-plan ${Store.mode==='local'?'':'disabled'}>Save plan</button>${Store.mode==='local'?'':'<p class="field-hint">Demo mode: plans can be edited with the local server.</p>'}`;
  const save=el.querySelector('[data-save-plan]');save&&save.addEventListener('click',async()=>{
    const skills=[...el.querySelectorAll('[data-plan]:checked')].map(c=>c.dataset.plan);
    const ordered=[...s.plan.filter(x=>skills.includes(x)),...skills.filter(x=>!s.plan.includes(x))];
    save.setAttribute('aria-busy','true');
    try{await API(`people/${encodeURIComponent(id)}/plan`,{method:'PUT',body:JSON.stringify({skills:ordered})});UI.toast('Training plan saved',{description:`${name}'s plan now covers ${ordered.length} ${plural(ordered.length,'skill')}.`});await loadLocalState()}
    catch(e){UI.toast('Could not save the plan',{type:'error',description:e.message||'Check your connection and try again.'})}
    save.removeAttribute('aria-busy');
  });
}
