/* =========================================================
   TRAINER: short training simulations, one per skill (content/training.json).
   Opens full-screen inside #game so it reuses the game's look: Ada's dialog box (say), the encounter art
   (artHTML), NPC sprites (sceneCanvas) and the look-alike highlighter (UI.renderAddr).
   Local mode: the server grades every round (/api/training/...), so answers never reach the browser before
   the player answers. Demo/live: js/training-data.js loads on demand and js/rules.js grades with the same rules.
   Trainer.open(simId) · Trainer.isOpen()
   ========================================================= */
const Trainer=(()=>{
  let T=null;/* {simId, sim, attempt, backend, i, results[], el, done, busy, leaving} */
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q=s=>T.el.querySelector(s);
  const TYPE_LABEL={spot:'Spot the red flags',realfake:'Real or fake',sort:'Sort',call:'Phone call',verify:'Check it safely',door:'In person',mfa:'Sign-in prompts'};
  const SIDE={safe:'Safe',report:'Report'},MFA_LABEL={approve:'Approve',deny:'Deny',report:'Report'};

  /* ---------- backends: server (local) or client rules (demo/live) ---------- */
  function serverBackend(simId){
    const u=p=>`training/${encodeURIComponent(simId)}/${p}`;
    return API(u('start'),{method:'POST',body:'{}'}).then(s=>({attempt:s.attempt,sim:s.sim,
      answer:(i,answer)=>API(u('rounds'),{method:'POST',body:JSON.stringify({attempt_id:s.attempt_id,round:i,answer})}),
      complete:()=>API(u('complete'),{method:'POST',body:JSON.stringify({attempt_id:s.attempt_id})})}));
  }
  let fullLoad=null;
  function loadFull(){
    if(window.PV_TRAINING_FULL)return Promise.resolve(window.PV_TRAINING_FULL);
    return fullLoad=fullLoad||new Promise((res,rej)=>{const s=document.createElement('script');s.src='js/training-data.js';
      s.onload=()=>res(window.PV_TRAINING_FULL);s.onerror=()=>{fullLoad=null;rej(new Error("Couldn't load the simulations."))};document.head.append(s)});
  }
  const demoProgress=uid=>{Store.demoTraining=Store.demoTraining||{};return Store.demoTraining[uid]=Store.demoTraining[uid]||{}};
  let demoEventId=1e6;
  const demoEvent=(kind,data)=>Live.emit({id:++demoEventId,kind,user_id:Store.me.id,name:(Store.myMember&&Store.myMember.name)||Store.me.name,data,created_at:Date.now()});
  function clientBackend(simId){
    return loadFull().then(doc=>{
      const sim=doc.simulations.find(s=>s.id===simId);if(!sim)throw new Error("That simulation isn't available.");
      const prog=demoProgress(Store.me.id),tried=(prog[simId]&&prog[simId].attempts)||0;
      const plan=PVRules.buildAttempt(sim,tried>0),scores=[];
      return{attempt:tried+1,sim:{id:sim.id,skill:sim.skill,title:sim.title,minutes:sim.minutes,intro:sim.intro,recap:sim.recap,sources:sim.sources,rounds:plan.map(e=>PVRules.clientRound(sim,e))},
        answer:async(i,answer)=>{
          if(scores[i]!=null)throw new Error("You've already answered this round.");
          const e=plan[i],r=sim.rounds[e.r],res=PVRules.gradeRound(r,PVRules.toCanonical(sim,e,answer));
          if(!Object.values(prog).some(p=>p.attempts)&&!scores.some(x=>x!=null))demoEvent('training_started',{sim_id:simId,title:sim.title});
          scores[i]=res.score;return{round:i,...PVRules.shownDetail(r,e,res)};
        },
        complete:async()=>{
          const pct=PVRules.attemptPct(scores),mastered=pct>=PVRules.MASTERY,before=myJourney().training;
          const p=prog[simId]=prog[simId]||{attempts:0,best_pct:0,completed:false};p.attempts++;p.best_pct=Math.max(p.best_pct,pct);p.completed=p.completed||mastered;
          const j=myJourney(),t=j.training||{mastered:0,total:0},planDone=t.total>0&&t.mastered===t.total;
          demoEvent('training_progress',{sim_id:simId,title:sim.title,skill:sim.skill,pct,mastered});
          const finished=planDone&&!(before&&before.total&&before.mastered===before.total);
          if(finished)demoEvent('training_completed',{simulations:t.total});
          return{pct,mastered,best_pct:p.best_pct,attempts:p.attempts,sim_mastered:p.completed,plan_done:planDone,plan_finished:finished,next:j.next};
        }};
    });
  }

  /* ---------- open / close ---------- */
  async function open(simId,{retry=false}={}){
    if(T)return;
    try{audioInit()}catch(e){}
    const game=$('game'),el=document.createElement('div');
    el.className='trainer';el.id='trainer';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Training simulation');
    el.innerHTML=`<div class="tr-loading" role="status"><span class="tr-spin" aria-hidden="true"></span>Loading the simulation…</div>`;
    T={simId,i:0,results:[],el,done:false,busy:false,retry};
    game.classList.add('trainer-on');game.append(el);$('portal').hidden=true;game.hidden=false;modal.hidden=true;window.scrollTo(0,0);
    if(!(history.state&&history.state.pvTrainer))history.pushState({pvTrainer:1},'');
    let b;try{b=await(Store.mode==='local'?serverBackend:clientBackend)(simId)}
    catch(e){if(!T||T.el!==el)return;el.innerHTML=`<div class="tr-loading"><p>${esc(e.status===404?"This simulation isn't in your training plan.":e.message||"Couldn't start the simulation.")}</p><button class="btn" type="button" data-close>Back to your plan</button></div>`;
      el.querySelector('[data-close]').addEventListener('click',()=>close());el.querySelector('[data-close]').focus();return}
    if(!T||T.el!==el)return;
    Object.assign(T,{backend:b,sim:b.sim,attempt:b.attempt});
    shell();retry?titleCard(true):intro();
  }
  function close({fromHistory=false}={}){
    if(!T)return;const t=T;T=null;
    if(D.open){D.open=false;D.done=null;dlg.hidden=true}
    cancelAnimationFrame(tickRaf);tickRaf=0;
    t.el.remove();const game=$('game');game.classList.remove('trainer-on');game.hidden=true;$('portal').hidden=false;
    if(!fromHistory&&history.state&&history.state.pvTrainer)history.back();
    if(Store.mode==='local')loadLocalState().catch(()=>{});
    renderPortal();
    requestAnimationFrame(()=>{const b=document.querySelector(`[data-train="${t.simId}"]`)||document.querySelector('#app h1');b&&b.focus&&b.focus({preventScroll:false})});
  }
  addEventListener('popstate',()=>{if(T)close({fromHistory:true})});

  /* Ada's typewriter needs ticking; the game loop only runs during a level */
  let tickRaf=0,tickLast=0;
  function tick(n){tickRaf=0;if(!T||!D.open)return;const dt=Math.min(.05,(n-tickLast)/1000||0);tickLast=n;
    if(reduced()&&D.typing){D.shown=D.full.length;D.typing=false;renderText()}else tickDialog(dt);tickRaf=requestAnimationFrame(tick)}
  function startTick(){if(!tickRaf){tickLast=performance.now();tickRaf=requestAnimationFrame(tick)}}

  /* ---------- layout: top bar (leave, title, progress) · stage · dock (thumb controls) ---------- */
  function shell(){
    const s=T.sim,meta=skillById(s.skill)||{name:s.skill},n=s.rounds.length;
    T.el.setAttribute('aria-label',`Training: ${s.title}`);
    T.el.innerHTML=`<header class="tr-top"><button class="tr-x" type="button" data-leave aria-label="Leave the simulation">✕</button>
      <div class="tr-meta"><small>${esc(meta.name)}</small><b>${esc(s.title)}</b></div><span class="tr-count" aria-live="polite"></span>
      <div class="tr-progress" role="progressbar" aria-label="Rounds answered" aria-valuemin="0" aria-valuemax="${n}">${s.rounds.map(()=>'<i></i>').join('')}</div></header>
      <main class="tr-stage"><div class="tr-inner"></div></main><footer class="tr-dock"><div class="tr-dock-inner"></div></footer>`;
    q('[data-leave]').addEventListener('click',leave);
    T.el.addEventListener('keydown',e=>{if(e.key==='Escape'&&!D.open){e.preventDefault();T.leaving?resumeFromLeave():leave()}});
    top();
  }
  function top(){
    const n=T.sim.rounds.length,answered=T.results.filter(Boolean).length;
    q('.tr-count').textContent=T.done?'Done':`${Math.min(T.i+1,n)} of ${n}`;
    const bar=q('.tr-progress');bar.setAttribute('aria-valuenow',answered);
    [...bar.children].forEach((seg,k)=>{const r=T.results[k];seg.dataset.state=r?(r.correct?'good':r.score>0?'part':'bad'):k===T.i&&!T.done?'now':''});
  }
  const stage=()=>q('.tr-inner');
  function dock(html){const d=q('.tr-dock-inner');d.innerHTML=html;q('.tr-dock').hidden=!html;return d}
  function focusFirst(sel){requestAnimationFrame(()=>{const el=T&&q(sel);el&&el.focus({preventScroll:true})})}

  function titleCard(skipAda){
    const s=T.sim,meta=skillById(s.skill)||{name:s.skill};
    stage().innerHTML=`<div class="tr-title-card"><p class="tr-eyebrow">Training · ${esc(meta.name)}</p><h1>${esc(s.title)}</h1>
      <p class="tr-sub">${s.rounds.length} rounds · about ${s.minutes} minutes</p>${T.attempt>1?`<p class="tr-sub">Try ${T.attempt}: the rounds and answers are in a new order.</p>`:''}</div>`;
    if(skipAda){dock(`<button class="btn tr-go" type="button" data-go>Start ▶</button>`).querySelector('[data-go]').addEventListener('click',()=>round(0));focusFirst('[data-go]')}
  }
  function intro(){
    titleCard(false);dock('');
    say({speaker:SP('ada'),pages:T.sim.intro,end:"Let's start ✓",onDone:()=>{if(T)round(0)}});startTick();
    requestAnimationFrame(()=>dNext.focus({preventScroll:true}));
  }

  /* ---------- rounds ---------- */
  function round(i){
    T.i=i;T.answered=false;T.leaving=false;const r=T.sim.rounds[i];top();
    stage().innerHTML=`<p class="tr-eyebrow">${TYPE_LABEL[r.type]}</p><h2 class="tr-prompt" tabindex="-1">${esc(r.prompt)}</h2><div class="tr-task" data-type="${r.type}"></div><div class="tr-after" hidden></div>`;
    dock('');q('.tr-stage').scrollTop=0;
    RENDER[r.type](r,q('.tr-task'));
    if(!T.focusSet)focusFirst('.tr-prompt');T.focusSet=false;
  }
  async function submit(ans){
    if(!T||T.busy||T.answered)return;T.busy=true;
    const task=q('.tr-task');task.setAttribute('aria-busy','true');task.querySelectorAll('button,[tabindex="0"]').forEach(b=>b.setAttribute('data-locked',''));
    const el=T.el;let res;
    try{res=await T.backend.answer(T.i,ans)}
    catch(e){if(!T||T.el!==el)return;T.busy=false;task.removeAttribute('aria-busy');task.querySelectorAll('[data-locked]').forEach(b=>b.removeAttribute('data-locked'));
      const d=dock(`<p class="tr-err" role="alert">${esc(e.status?e.message:"Couldn't reach the server. Check your connection and try again.")}</p>`+q('.tr-dock-inner').innerHTML);return}
    if(!T||T.el!==el)return;
    T.busy=false;T.answered=true;T.results[T.i]=res;task.removeAttribute('aria-busy');
    const r=T.sim.rounds[T.i];REVEAL[r.type](r,res,task);feedback(r,res);top();
    sfx(res.correct?'quest':res.score>0?'next':'bad');
  }
  function headline(r,res){
    const d=res.detail||{};
    if(r.type==='call')return res.correct?'Safe ending':'That call went badly';
    if(res.correct)return'Correct';
    if(res.score>0){
      if(r.type==='spot')return`Found ${d.found} of ${d.found+d.missed}${d.wrong?` · ${d.wrong} wasn't a red flag`:''}`;
      if(r.type==='sort')return`${d.items.filter(x=>x.right).length} of ${d.items.length} right`;
      if(r.type==='mfa')return`${d.prompts.filter(x=>x.score===1).length} of ${d.prompts.length} right`;
      return'Partly right';
    }
    return r.type==='spot'&&d.found?`Found ${d.found} of ${d.found+d.missed}, but ${d.wrong} wasn't a red flag`:'Not quite';
  }
  function feedback(r,res){
    const tone=res.correct?'good':res.score>0?'part':'bad',last=T.i===T.sim.rounds.length-1;
    const d=dock(`<div class="tr-fb" data-tone="${tone}" role="status"><span class="tr-fb-icon" aria-hidden="true">${tone==='good'?'✓':tone==='part'?'~':'!'}</span><div><b>${esc(headline(r,res))}</b><p>${esc(res.explain)}</p></div></div>
      <button class="btn tr-go" type="button" data-next>${last?'See your score ▶':'Next ▶'}</button>`);
    d.querySelector('[data-next]').addEventListener('click',()=>{sfx('next');last?finish():round(T.i+1)});
    focusFirst('[data-next]');
  }

  /* ---------- end screen ---------- */
  async function finish(){
    T.done=true;top();dock(`<p class="tr-wait" role="status"><span class="tr-spin" aria-hidden="true"></span>Working out your score…</p>`);
    const el=T.el;let c;
    try{c=await T.backend.complete()}catch(e){if(!T||T.el!==el)return;T.done=false;
      dock(`<p class="tr-err" role="alert">${esc(e.status?e.message:"Couldn't reach the server, so your score isn't saved yet.")}</p><button class="btn tr-go" type="button" data-retry>Try saving again</button>`).querySelector('[data-retry]').addEventListener('click',finish);return}
    if(!T||T.el!==el)return;
    const s=T.sim,n=s.rounds.length,right=T.results.filter(r=>r.correct).length,tone=c.mastered?'good':c.pct>=50?'part':'bad';
    const R=52,C=2*Math.PI*R;
    const lead=c.mastered?(c.plan_finished?"That's your whole training plan done. The final test is your next step, and it arrives in the next update.":'Your plan shows what to practise next.')
      :`You need ${PVRules.MASTERY}% to master this. Try again and the rounds and answers come in a new order.`;
    stage().innerHTML=`<div class="tr-end"><div class="tr-ring" data-tone="${tone}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="bg"/><circle cx="60" cy="60" r="${R}" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C*(1-c.pct/100)}"/></svg><b>${c.pct}%</b></div>
      <h2 class="tr-end-h" tabindex="-1">${c.mastered?(c.plan_finished?'Training complete':'Mastered'):'Not mastered yet'}</h2>
      <p class="tr-sub">${right} of ${n} rounds fully right${c.attempts>1?` · try ${c.attempts} · best ${c.best_pct}%`:''}</p><p class="tr-lead">${esc(lead)}</p>
      <ol class="tr-dots" aria-label="Your rounds">${T.results.map((r,k)=>`<li data-tone="${r.correct?'good':r.score>0?'part':'bad'}"><span class="sr-only">Round ${k+1}: ${r.correct?'right':r.score>0?'partly right':'wrong'}</span></li>`).join('')}</ol>
      <section class="tr-habits" aria-labelledby="trHab"><h3 id="trHab">Three habits to keep</h3><ul>${s.recap.map(h=>`<li><span aria-hidden="true">✓</span>${esc(h)}</li>`).join('')}</ul></section>
      <details class="tr-src"><summary>Based on guidance from</summary><ul>${(s.sources||[]).map(x=>`<li><b>${esc(x.org)}</b> · ${esc(x.title)}</li>`).join('')}</ul></details></div>`;
    q('.tr-stage').scrollTop=0;
    const d=dock(c.mastered?`<button class="btn tr-go" type="button" data-continue>Continue ▶</button>`
      :`<div class="tr-two"><button class="btn ghost tr-go" type="button" data-continue>Back to plan</button><button class="btn tr-go" type="button" data-again>Try again ↻</button></div>`);
    d.querySelector('[data-continue]').addEventListener('click',()=>close());
    const again=d.querySelector('[data-again]');again&&again.addEventListener('click',()=>{const id=T.simId;close();setTimeout(()=>open(id,{retry:true}),0)});
    sfx(c.mastered?'win':'next');if(c.mastered&&!reduced())confettiGo();
    focusFirst('.tr-end-h');
  }

  /* ---------- leaving mid-way ---------- */
  function leave(){
    if(!T)return;
    if(T.done||!T.results.some(Boolean)||!T.sim)return close();
    if(T.leaving)return;T.leaving={html:q('.tr-dock-inner').innerHTML,hidden:q('.tr-dock').hidden,focus:document.activeElement};
    const d=dock(`<div class="tr-fb" data-tone="part" role="alert"><span class="tr-fb-icon" aria-hidden="true">?</span><div><b>Leave this simulation?</b><p>Rounds you've answered won't count. You can start again from your plan.</p></div></div>
      <div class="tr-two"><button class="btn ghost tr-go" type="button" data-stay>Keep going</button><button class="btn tr-go tr-danger" type="button" data-bye>Leave</button></div>`);
    d.querySelector('[data-stay]').addEventListener('click',resumeFromLeave);d.querySelector('[data-bye]').addEventListener('click',()=>close());
    focusFirst('[data-stay]');
  }
  function resumeFromLeave(){
    /* the dock's buttons were rebuilt from HTML, so re-render the current step */
    const L=T.leaving;T.leaving=false;if(!L)return;
    if(T.answered){const r=T.sim.rounds[T.i];feedback(r,T.results[T.i])}else{dock(L.html);rebindDock()}
  }
  let rebindDock=()=>{};

  /* ---------- helpers ---------- */
  const optBtn=(text,i,inner)=>`<button class="tr-opt" type="button" data-i="${i}"><span class="tr-opt-k" aria-hidden="true">${'ABCD'[i]}</span><span class="tr-opt-t">${inner||esc(text)}</span></button>`;
  function choiceList(box,options,render){
    box.insertAdjacentHTML('beforeend',`<div class="tr-choices" role="group" aria-label="Answers">${options.map((o,i)=>optBtn(o.text,i,render&&render(o))).join('')}</div>`);
    box.querySelector('.tr-choices').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b||b.hasAttribute('data-locked'))return;sfx('click');b.setAttribute('data-picked','');submit(+b.dataset.i)});
  }
  function markChoices(box,d,{realFake}={}){
    box.querySelectorAll('.tr-opt').forEach((b,k)=>{const o=d.options[k];
      b.dataset.res=k===d.right?'right':k===d.chose?'wrong':realFake?'fake':'dim';
      const tag=k===d.right?(realFake?'Real':'Best answer'):realFake?'Fake':k===d.chose?'Your pick':'';
      b.querySelector('.tr-opt-k').textContent=k===d.right?'✓':k===d.chose?'✗':'ABCD'[k];
      if(tag)b.querySelector('.tr-opt-t').insertAdjacentHTML('afterbegin',`<span class="tr-tag">${tag}${k===d.chose&&k===d.right?' · your pick':''}</span>`);
      if(o.note)b.querySelector('.tr-opt-t').insertAdjacentHTML('beforeend',`<small class="tr-note">${esc(o.note)}</small>`);
      b.setAttribute('aria-disabled','true')});
  }
  /* mark where a look-alike differs from the real one when there are no confusable letters to flag */
  function diffMark(fake,real){
    let a=0;while(a<fake.length&&a<real.length&&fake[a]===real[a])a++;
    let b=0;while(b<fake.length-a&&b<real.length-a&&fake[fake.length-1-b]===real[real.length-1-b])b++;
    if(a+b>=fake.length)return`<span class="addr">${esc(fake)}</span>`;
    return`<span class="addr">${esc(fake.slice(0,a))}<mark>${esc(fake.slice(a,fake.length-b))}</mark>${esc(fake.slice(fake.length-b))}</span>`;
  }
  /* the fake option, with only its address-like parts that differ from the real one highlighted */
  function markFake(fake,real){
    const ft=fake.split(/(\s+)/),rt=real.split(/(\s+)/);
    return`<span class="addr">${ft.map((tok,i)=>{if(/^\s*$/.test(tok)||tok===rt[i]||!/[@./]/.test(tok))return esc(tok);
      const f=UI.renderAddr(tok,{flag:true});return f.includes('<mark')?f:diffMark(tok,rt[i]||'')}).join('')}</span>`;
  }
  const list=rows=>`<ul class="tr-list">${rows.map(([tone,ic,title,tag,why])=>`<li data-tone="${tone}"><i aria-hidden="true">${ic}</i><span><b>${title}</b>${tag?` <small class="tr-pill">${tag}</small>`:''}${why?`<br>${esc(why)}`:''}</span></li>`).join('')}</ul>`;
  function after(html){const a=q('.tr-after');a.innerHTML=html;a.hidden=!html}

  /* ---------- the seven round types: RENDER builds the task, REVEAL shows what was right ---------- */
  const RENDER={
    spot(r,box){
      const ids=new Set(r.regions.map(g=>g.id)),sel=new Set();
      const html=artHTML(r.artifact).replace(/\[\[([a-z0-9_]+)\|([^\]]+)\]\]/g,(m,id,txt)=>`<span class="tr-hl" role="button" tabindex="0" data-r="${id}" aria-pressed="false">${txt}</span>`);
      box.innerHTML=`<div class="tr-art">${html}</div><p class="tr-hint">Tap anything that looks wrong. Tap again to undo.</p>`;
      const slot=box.querySelector('#sceneSlot');if(slot)slot.replaceWith(sceneCanvas(r.artifact));
      box.querySelectorAll('[data-hl]').forEach(el=>{const id=el.dataset.hl;if(!ids.has(id))return;
        el.classList.add('tr-hl');el.dataset.r=id;el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-pressed','false');el.removeAttribute('data-href')});
      const st=box.querySelector('#mstatus');if(st){const l=r.artifact.art.link;st.textContent=l?'Link goes to: '+l.h:''}
      const toggle=el=>{if(el.hasAttribute('data-locked'))return;const id=el.dataset.r;sel.has(id)?sel.delete(id):sel.add(id);sfx('click');
        box.querySelectorAll(`[data-r="${id}"]`).forEach(x=>x.setAttribute('aria-pressed',String(sel.has(id))));upd()};
      box.addEventListener('click',e=>{const el=e.target.closest('[data-r]');if(!el)return;e.preventDefault();toggle(el)});
      box.addEventListener('keydown',e=>{const el=e.target.closest('[data-r]');if(el&&el.tagName!=='BUTTON'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle(el)}});
      const mk=()=>{const d=dock(`<button class="btn tr-go" type="button" data-check disabled>Check</button>`);d.querySelector('[data-check]').addEventListener('click',()=>submit([...sel]));upd()};
      const upd=()=>{const b=T&&q('[data-check]');if(!b)return;b.disabled=!sel.size;b.textContent=sel.size?`Check · ${sel.size} tapped`:'Tap the red flags first'};
      rebindDock=mk;mk();
    },
    realfake(r,box){choiceList(box,r.options,o=>UI.renderAddr(o.text))},
    verify(r,box){if(r.request)box.insertAdjacentHTML('beforeend',`<div class="tr-request">${esc(r.request)}</div>`);choiceList(box,r.options)},
    door(r,box){
      const who=(npcAll.find(n=>n.id===r.npc)||{name:''}).name;
      box.innerHTML=`<div class="tr-door"><p class="tr-place">${esc(r.place)}</p><div class="scene"><span id="sceneSlot"></span><div class="say"><div class="nm">${esc(who)}</div>${r.lines.map((l,i)=>`<div class="bub" style="animation-delay:${reduced()?0:i*.35}s">${esc(l)}</div>`).join('')}</div></div></div>`;
      box.querySelector('#sceneSlot').replaceWith(sceneCanvas({art:{npc:r.npc}}));choiceList(box,r.options);
    },
    sort(r,box){
      const answers={};let k=0;
      box.innerHTML=`<div class="tr-sort"><div class="tr-deck"></div><p class="tr-hint" id="trSortHint">Swipe left for Safe, right for Report<span class="tr-kbd">, or use the arrow keys and Enter</span>.</p><ol class="tr-sorted" aria-label="Sorted so far"></ol></div>`;
      const deck=box.querySelector('.tr-deck');
      const card=()=>{const it=r.items[k];
        deck.innerHTML=`${k<r.items.length-1?'<div class="tr-card tr-card-next" aria-hidden="true"></div>':''}<div class="tr-card" tabindex="0" role="group" aria-roledescription="card" aria-describedby="trSortHint" aria-label="Item ${k+1} of ${r.items.length}: ${esc(it.label)}">
          <span class="tr-stamp" data-side="safe" aria-hidden="true">Safe</span><span class="tr-stamp" data-side="report" aria-hidden="true">Report</span>
          <small class="tr-card-n">${k+1} of ${r.items.length}</small><b>${esc(it.label)}</b>${it.detail?`<p>${esc(it.detail)}</p>`:''}</div>`;
        bindCard(deck.querySelector('.tr-card:not(.tr-card-next)'))};
      const commit=(side,c,dx)=>{if(T.busy||T.answered||!c||c.dataset.gone)return;c.dataset.gone='1';const it=r.items[k];answers[it.id]=side;sfx('click');
        box.querySelector('.tr-sorted').insertAdjacentHTML('beforeend',`<li data-side="${side}"><span>${SIDE[side]}</span>${esc(it.label)}</li>`);
        const go=()=>{k++;if(k<r.items.length){card();focusFirst('.tr-card:not(.tr-card-next)')}else{deck.innerHTML='';submit({...answers})}};
        if(reduced())return go();
        const x=(side==='safe'?-1:1)*Math.max(innerWidth,600);c.style.transition='transform .28s cubic-bezier(.23,1,.32,1),opacity .28s';c.style.transform=`translateX(${x}px) rotate(${side==='safe'?-18:18}deg)`;c.style.opacity='0';setTimeout(go,220)};
      const lean=(c,side)=>{c.dataset.lean=side||'';c.style.transform=side?`translateX(${side==='safe'?-28:28}px) rotate(${side==='safe'?-3:3}deg)`:''};
      function bindCard(c){
        let x0=0,y0=0,dx=0,t0=0,id=null,axis=null;
        c.addEventListener('pointerdown',e=>{if(id!==null||T.answered)return;id=e.pointerId;x0=e.clientX;y0=e.clientY;dx=0;t0=performance.now();axis=null});
        c.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;const mx=e.clientX-x0,my=e.clientY-y0;
          if(!axis){if(Math.abs(mx)<8&&Math.abs(my)<8)return;axis=Math.abs(mx)>Math.abs(my)?'x':'y';if(axis==='x'){c.setPointerCapture(id);c.classList.add('dragging')}}
          if(axis!=='x')return;dx=mx;c.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;c.dataset.lean=dx<-50?'safe':dx>50?'report':''});
        const end=e=>{if(e.pointerId!==id)return;id=null;c.classList.remove('dragging');if(axis!=='x')return;
          const v=Math.abs(dx)/Math.max(1,performance.now()-t0);if(Math.abs(dx)>90||(v>.5&&Math.abs(dx)>30))commit(dx<0?'safe':'report',c,dx);else lean(c,'')};
        /* once the drag is sideways, cancel the browser's own gesture, or it ends as a fling that eats the next tap */
        c.addEventListener('touchmove',e=>{if(axis==='x'&&e.cancelable)e.preventDefault()},{passive:false});
        c.addEventListener('pointerup',end);c.addEventListener('pointercancel',e=>{if(e.pointerId===id){id=null;c.classList.remove('dragging');lean(c,'')}});
        c.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();lean(c,'safe')}else if(e.key==='ArrowRight'){e.preventDefault();lean(c,'report')}
          else if((e.key==='Enter'||e.key===' ')&&c.dataset.lean){e.preventDefault();commit(c.dataset.lean,c)}});
      }
      const mk=()=>{const d=dock(`<div class="tr-two"><button class="btn tr-go tr-safe" type="button" data-side="safe">← Safe</button><button class="btn tr-go tr-report" type="button" data-side="report">Report →</button></div>`);
        d.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>commit(b.dataset.side,q('.tr-deck .tr-card:not(.tr-card-next)'))))};
      rebindDock=mk;card();mk();T.focusSet=true;focusFirst('.tr-card:not(.tr-card-next)');
    },
    call(r,box){
      const path=[];
      box.innerHTML=`<div class="tr-call"><div class="tr-caller"><span class="tr-cav" aria-hidden="true">${esc((r.caller.name.replace(/[^A-Za-z]/g,'')[0]||'?').toUpperCase())}</span><div><b>${esc(r.caller.name)}</b><small>${esc(r.caller.num)}</small></div><span class="tr-oncall">On call</span></div><div class="tr-log" aria-live="polite"></div></div>`;
      const log=box.querySelector('.tr-log');
      const node=id=>{const n=r.nodes[id];n.say.forEach((l,i)=>log.insertAdjacentHTML('beforeend',`<div class="bub" style="animation-delay:${reduced()?0:i*.3}s">${esc(l)}</div>`));
        const d=dock(`<p class="tr-dock-label">Your reply</p><div class="tr-replies">${n.choices.map((c,i)=>`<button class="tr-opt tr-reply" type="button" data-i="${i}"><span class="tr-opt-t">${esc(c.text)}</span></button>`).join('')}</div>`);
        d.querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>{if(T.busy||T.answered)return;const c=n.choices[+b.dataset.i];path.push(+b.dataset.i);sfx('click');
          log.insertAdjacentHTML('beforeend',`<div class="bub me">${esc(c.text)}</div>`);
          if(c.end){dock(`<p class="tr-wait" role="status"><span class="tr-spin" aria-hidden="true"></span>Ending the call…</p>`);submit(path.slice())}else node(c.next);
          q('.tr-stage').scrollTop=1e6}));
        rebindDock=()=>node(id);focusFirst('.tr-reply');};
      T.focusSet=true;node('start');
    },
    mfa(r,box){
      const answers=[];let k=0;
      box.innerHTML=`<div class="tr-mfa"><div class="phone"><div class="scr"><div class="sbar"><span>NovaCorp</span><span>5G ▮▮▮</span></div><div class="tr-notifs" aria-live="polite"></div></div></div><p class="tr-hint tr-mfa-n"></p></div>`;
      const show=()=>{const p=r.prompts[k];box.querySelector('.tr-mfa-n').textContent=`Prompt ${k+1} of ${r.prompts.length}`;
        box.querySelector('.tr-notifs').innerHTML=`<div class="tr-clock">${esc(p.time)}</div><div class="notif tr-notif"><b>${esc(p.app)}</b>Approve sign-in request?<dl><dt>Where</dt><dd>${esc(p.loc)}</dd><dt>When</dt><dd>${esc(p.time)}</dd></dl></div><p class="tr-context">${esc(p.context)}</p>`};
      const mk=()=>{const d=dock(`<div class="tr-three">${['approve','deny','report'].map(a=>`<button class="btn tr-go tr-${a}" type="button" data-a="${a}">${MFA_LABEL[a]}</button>`).join('')}</div>`);
        d.querySelectorAll('[data-a]').forEach(b=>b.addEventListener('click',()=>{if(T.busy||T.answered||answers.length>k)return;answers.push(b.dataset.a);sfx('click');k++;
          if(k<r.prompts.length){show();focusFirst('[data-a="approve"]')}else submit(answers.slice())}))};
      rebindDock=mk;show();mk();
    },
  };
  const REVEAL={
    spot(r,res,box){
      const d=res.detail;
      d.regions.forEach(g=>box.querySelectorAll(`[data-r="${g.id}"]`).forEach(el=>{el.dataset.res=g.flag?(g.tapped?'found':'missed'):g.tapped?'wrong':'fine';el.setAttribute('aria-pressed',String(g.tapped))}));
      const rows=[...d.regions.filter(g=>g.flag).map(g=>g.tapped?['good','✓',esc(g.label),'Found',g.why]:['part','○',esc(g.label),'Missed',g.why]),
        ...d.regions.filter(g=>!g.flag&&g.tapped).map(g=>['bad','✗',esc(g.label),'Not a red flag',g.why])];
      after(list(rows));
    },
    realfake(r,res,box){
      const d=res.detail,real=d.options[d.right].text;markChoices(box,d,{realFake:true});
      box.querySelectorAll('.tr-opt').forEach((b,k)=>{if(k===d.right)return;const t=d.options[k].text;
        const slot=b.querySelector('.addr');if(slot)slot.outerHTML=markFake(t,real)});
    },
    verify(r,res,box){markChoices(box,res.detail)},
    door(r,res,box){markChoices(box,res.detail)},
    sort(r,res,box){
      const d=res.detail;box.querySelector('.tr-deck').remove();box.querySelector('#trSortHint').remove();box.querySelector('.tr-sorted').remove();
      after(list(d.items.map(x=>[x.right?'good':'bad',x.right?'✓':'✗',esc(x.label),x.right?SIDE[x.safe?'safe':'report']:`It was ${SIDE[x.safe?'safe':'report']}`,x.right?'':x.why])));
    },
    call(r,res,box){
      const d=res.detail;box.querySelector('.tr-oncall').textContent='Call ended';box.querySelector('.tr-oncall').dataset.off='';
      box.querySelector('.tr-log').insertAdjacentHTML('beforeend',`<p class="tr-sys" data-tone="${d.outcome==='safe'?'good':'bad'}">${d.outcome==='safe'?'✓ ':'! '}${esc(d.why)}</p>`);
      q('.tr-stage').scrollTop=1e6;
    },
    mfa(r,res,box){
      const d=res.detail;box.querySelector('.tr-mfa').remove();
      after(list(d.prompts.map(p=>[p.score===1?'good':p.score>0?'part':'bad',p.score===1?'✓':p.score>0?'~':'✗',`${esc(p.loc)} · ${esc(p.time)}`,
        p.score===1?MFA_LABEL[p.answer]:`You chose ${MFA_LABEL[p.chose]} · ${MFA_LABEL[p.answer]} was right`,p.why])));
    },
  };

  /* test hook: the round on screen (what the player sees; no answers) */
  const current=()=>T&&T.sim&&!T.done?{i:T.i,round:T.sim.rounds[T.i],answered:!!T.answered}:null;
  return{open,isOpen:()=>!!T,current};
})();
