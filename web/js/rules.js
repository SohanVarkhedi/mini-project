/* =========================================================
   RULES (no DOM): the skills report and journey rules for demo and live modes.
   A line-by-line mirror of phishverse/skills.py (build_report, summary, habit_advice, plan_skills)
   and phishverse/journey.py (journey). tests/e2e/test_parity.py runs both on the same fixture
   histories and requires identical output: CHANGE BOTH TOGETHER.
   ========================================================= */
const PVRules=(()=>{
  const SEVERITY_PENALTY={2:.1,3:.2},STRONG=80,WATCH=60,MIN_EVIDENCE=1.5,MIN_CUE_SCENARIOS=2,TOP_CUES=3;
  const BANDS={strong:'Strong',watch:'Watch',weak:'Weak',insufficient:'Not enough evidence'};
  const CUE_PHRASES={urgency:"there's an urgent deadline",authority:'the request seems to come from someone senior or official',
    reward:"there's a reward on offer",fear:"there's a threat or a scare",curiosity:'something looks tempting to open',
    familiarity:'a familiar name is used',secrecy:"you're asked to keep it quiet",helpfulness:'someone asks you for a favour'};
  const ART_ADDRESS_KEYS=['addr','num','link','loc'];
  const roundHalfUp=x=>Math.floor(x+0.5);
  const round2=x=>Math.round(x*100)/100;
  const scoredTasks=(content,lid)=>{const L=content.levels.find(l=>l.id===lid);return L?L.tasks.filter(t=>t.enc):[]};
  const scoredTask=(content,lid,tid)=>scoredTasks(content,lid).find(t=>t.id===tid)||null;

  function decisionPoints(outcome,severity,scale){const pts=scale[outcome].pts,pen=outcome==='compromise'?(SEVERITY_PENALTY[severity||0]||0):0;return[pts,pen]}
  function band(score,evidence){if(evidence<MIN_EVIDENCE||score==null)return'insufficient';return score>=STRONG?'strong':score>=WATCH?'watch':'weak'}
  function median(values){const v=[...values].sort((a,b)=>a-b);if(!v.length)return null;const mid=Math.floor(v.length/2);return v.length%2?v[mid]:(v[mid-1]+v[mid])/2}
  function scenarioAddresses(enc){const art=enc.art||{},out=[];for(const k of ART_ADDRESS_KEYS){let v=art[k];if(v&&typeof v==='object')v=v.h;if(typeof v==='string'&&v.trim())out.push(v.split(' · ')[0].trim())}return out}
  const cmp=(...keys)=>(a,b)=>{for(const k of keys){const x=k(a),y=k(b);if(x<y)return-1;if(x>y)return 1}return 0};

  function buildReport(content,decisions,skillsMeta){
    const scale=content.outcomes,acc={},cues={};let legitN=0,legitFa=0,inspected=0;const times=[],rows=[];
    for(const s of skillsMeta)acc[s.id]={w:0,pts:0,pen:0,n:0,items:[]};
    for(const d of decisions){
      const task=scoredTask(content,d.level_id,d.task_id);if(!task)continue;
      const enc=task.enc,act=enc.acts[d.action_index],[p,pen]=decisionPoints(d.outcome,d.severity,scale),safeAct=enc.acts.find(a=>a.o==='safe')||null;
      const row={level_id:d.level_id,task_id:d.task_id,title:enc.title,channel:enc.ch,legit:!!enc.legit,chose:act.l,outcome:d.outcome,
        outcome_label:scale[d.outcome].label,severity:d.severity==null?null:d.severity,safer:safeAct?safeAct.l:null,lesson:enc.lesson,points:round2(p-pen),
        addresses:scenarioAddresses(enc),skills:[...enc.skills],cues:[...enc.cues]};
      rows.push(row);
      enc.skills.forEach((sid,k)=>{const a=acc[sid];if(!a)return;const w=k===0?1:.5;a.w+=w;a.pts+=w*p;a.pen+=w*pen;a.n+=1;a.items.push(row)});
      if(enc.legit){legitN++;legitFa+=d.outcome==='false_alarm'?1:0}
      else for(const cue of enc.cues){const c=cues[cue]=cues[cue]||{n:0,fails:0};c.n++;c.fails+=d.outcome==='compromise'?1:0}
      inspected+=(d.n_inspections||0)>0?1:0;if(d.response_ms!=null)times.push(d.response_ms);
    }
    const skills=skillsMeta.map(s=>{const a=acc[s.id],score=a.w?roundHalfUp(100*Math.max(0,a.pts-a.pen)/a.w):null,b=band(score,a.w);
      const revealed=a.items.filter(r=>r.outcome!=='safe').sort(cmp(r=>r.points,r=>r.title));
      return{id:s.id,name:s.name,icon:s.icon,description:s.description,score,band:b,band_label:BANDS[b],evidence:round2(a.w),scenarios:a.n,
        safe:a.items.filter(r=>r.outcome==='safe').length,tasks:a.items.map(r=>`${r.level_id}/${r.task_id}`),
        safe_tasks:a.items.filter(r=>r.outcome==='safe').map(r=>`${r.level_id}/${r.task_id}`),revealed:(b==='weak'||b==='watch')?revealed:[]}});
    const ranked=skills.filter(s=>s.band!=='insufficient');
    const strong=ranked.filter(s=>s.band==='strong').sort(cmp(s=>-s.score,s=>-s.evidence));
    const weak=ranked.filter(s=>s.band==='weak').sort(cmp(s=>s.score,s=>-s.evidence));
    const watch=ranked.filter(s=>s.band==='watch').sort(cmp(s=>s.score,s=>-s.evidence));
    const weakest=(weak.length?weak:watch)[0]||null;
    const risky=Object.entries(cues).filter(([,v])=>v.n>=MIN_CUE_SCENARIOS&&v.fails>0).map(([c,v])=>({cue:c,phrase:CUE_PHRASES[c],scenarios:v.n,fails:v.fails,rate:roundHalfUp(100*v.fails/v.n)}))
      .sort(cmp(r=>-r.rate,r=>-r.fails,r=>r.cue));
    const total=rows.length,med=median(times);
    const habits={decisions:total,inspected,inspection_rate:total?roundHalfUp(100*inspected/total):null,median_ms:med==null?null:Math.trunc(med),
      genuine:legitN,false_alarms:legitFa,false_alarm_rate:legitN?roundHalfUp(100*legitFa/legitN):null};
    const report={skills,strong:strong.map(s=>s.id),weak:weak.map(s=>s.id),watch:watch.map(s=>s.id),
      weakest:weakest?{id:weakest.id,name:weakest.name,score:weakest.score}:null,cues:risky.slice(0,TOP_CUES),habits,decisions:total,
      compromises:rows.filter(r=>r.outcome==='compromise').length,safe:rows.filter(r=>r.outcome==='safe').length};
    report.summary=summary(report);report.summary_manager=summary(report,'they');report.advice=habitAdvice(habits);
    return report;
  }

  /* ---------- words (same sentences as skills.py) ---------- */
  const lower=name=>/^[A-Z]{2}/.test(name)?name:name[0].toLowerCase()+name.slice(1);/* keep acronyms (MFA) */
  function of(k,n,noun){if(n===1)return`the one ${noun}`;if(k===n)return n===2?`both ${noun}s`:`all ${n} ${noun}s`;return`${k} of ${n} ${noun}s`}
  function safeCalls(k,n,you){const[subj,poss]=you?['You','your']:['They','their'];
    if(n===1)return k?`${subj} made the safe call in the one situation.`:`${subj} didn't make the safe call in the one situation.`;
    if(k===0)return`None of ${poss} ${n} choices was the safe call.`;
    if(k===n)return`${subj} made the safe call in ${n===2?'both':`all ${n}`} situations.`;
    return`${subj} made the safe call in ${k} of ${n} situations.`}
  const countWord=n=>n>=0&&n<=10?['no','one','two','three','four','five','six','seven','eight','nine','ten'][n]:String(n);
  function summary(report,perspective='you'){
    const you=perspective==='you',sk=Object.fromEntries(report.skills.map(s=>[s.id,s])),sents=[];
    const strong=report.strong.slice(0,2).map(i=>sk[i]);
    if(strong.length){const names=strong.map(s=>lower(s.name)).join(' and on ');
      const n=new Set(strong.flatMap(s=>s.tasks)).size,safe=new Set(strong.flatMap(s=>s.safe_tasks)).size;
      sents.push(`${you?'You were':'They were'} strong on ${names}, making the safe call in ${of(safe,n,'situation')} there.`)}
    else if(report.decisions)sents.push(safeCalls(report.safe,report.decisions,you));
    const w=report.weakest;
    if(w){const s=sk[w.id],slipped=new Set(s.revealed.filter(r=>r.outcome==='compromise').flatMap(r=>r.cues||[]));
      const cue=report.cues.find(c=>slipped.has(c.cue))||null;
      let risk=`${you?'You':'They'}'re most at risk from ${lower(s.name)}`;
      if(cue){risk+=`, especially when ${cue.phrase}`;if(!you)risk=risk.replace("you're asked","they're asked").replace('asks you','asks them')}
      sents.push(risk+'.');const n=report.weak.length+report.watch.length;
      sents.push(you?`Your training plan starts there${n<=1?'':` and covers ${countWord(n)} skills in all`}, with short simulations rather than long lessons.`
        :`Their training plan starts there${n<=1?'':` and covers ${countWord(n)} skills`}.`)}
    else sents.push(`${you?'You':'They'} showed no weak spots, so training is optional and the final test is next.`);
    return sents.slice(0,3).join(' ');
  }
  function habitAdvice(h){
    const tips=[],n=h.decisions;
    if(n){const k=h.inspected;
      if(k===0)tips.push({icon:'search',text:'You decided without opening any clues. Checking first is the habit that catches most scams.'});
      else if(k===n)tips.push({icon:'search',text:`You opened clues before deciding in ${of(k,n,'situation')}. Keep that habit: checking first catches most scams.`});
      else if(k/n>=.8)tips.push({icon:'search',text:`You opened clues before deciding in ${k} of ${n} situations. Keep that habit: checking first catches most scams.`});
      else tips.push({icon:'search',text:`You opened clues before deciding in ${k} of ${n} situations. Checking first is the habit that catches most scams.`})}
    if(h.median_ms!=null){const secs=Math.max(1,roundHalfUp(h.median_ms/1000));
      tips.push(secs<6?{icon:'clock',text:`You usually decided within ${secs} seconds. Slow down a little: scams count on quick reactions.`}
        :{icon:'clock',text:`You usually took about ${secs} seconds per decision. That's a careful pace; keep it when you're busy.`})}
    if(h.genuine){const fa=h.false_alarms,g=h.genuine;
      if(fa===0)tips.push({icon:'check',text:`You trusted ${g===1?'the one genuine request':g===2?'both genuine requests':`all ${g} genuine requests`}. Security isn't about saying no to everything.`});
      else tips.push({icon:'info',text:`You reported ${g===1?'the one genuine request as a scam':`${of(fa,g,'genuine request')} as scams`}. When unsure, verify through a known channel instead of refusing.`})}
    return tips;
  }
  const planSkills=(report,includeWatch)=>[...report.weak,...(includeWatch?report.watch:[])];

  /* ---------- journey (same states and texts as journey.py) ---------- */
  const STAGES=[['game','Game','Play your assigned levels. Your first try at each one becomes your skills report.'],
    ['report','Skills report','Your strong areas and weak spots, built from your choices in the game.'],
    ['training','Training','Short simulations for the skills you need to practise.'],
    ['test','Final test','Unseen scenarios with no hints.'],
    ['certificate','Certificate','A certificate your manager can verify when you pass the final test.']];
  /* program: {levels, due, pass_mark, allow_watch_training, created_at}
     sessions: [{level_id, purpose, started_at, finished_at|null, score, decisions:[...]}]
     planOverride: skills list if a manager edited the plan, else null */
  function journey(content,skillsMeta,program,sessions,planOverride=null,today=null){
    if(!program)return{program:null,levels:[],stages:STAGES.map(([id,title,d])=>({id,title,state:'locked',description:d})),current:null,next:null,report:null,weakest:null,plan:null};
    const level=id=>content.levels.find(l=>l.id===id);
    const since=sessions.filter(s=>s.purpose==='baseline'&&s.started_at>=program.created_at&&program.levels.includes(s.level_id));
    const firsts={};for(const s of since.filter(s=>s.finished_at!=null).sort(cmp(s=>s.finished_at,s=>s._order||0)))if(!(s.level_id in firsts))firsts[s.level_id]=s;
    const started=new Set(since.map(s=>s.level_id));
    let next=null;const levels=program.levels.map(lid=>{const L=level(lid),done=lid in firsts,state=done?'done':(next===null?(next=lid,'next'):'locked');
      return{id:lid,n:L?L.n:null,title:L?L.title:lid,state,score:done?firsts[lid].score:null,started:started.has(lid)}});
    const nDone=Object.keys(firsts).length,gameDone=nDone===program.levels.length;
    let report=null;
    if(gameDone){const ds=[];for(const lid of program.levels)for(const d of firsts[lid].decisions)ds.push({...d,level_id:lid});
      report=buildReport(content,ds,skillsMeta);report.levels=Object.fromEntries(program.levels.map(l=>[l,firsts[l].score]))}
    const planIds=report?(planOverride||planSkills(report,program.allow_watch_training)):[];
    const names=Object.fromEntries(skillsMeta.map(s=>[s.id,s.name]));
    const st={game:[gameDone?'done':(nDone||started.size)?'in_progress':'available',`${nDone} of ${program.levels.length} levels played.`],
      report:[report?'done':'locked',report?'Ready.':"Unlocks when you've played every level once."],
      training:!report?['locked','Short simulations for the skills your report flags.']
        :planIds.length?['available',`${planIds.length} skill${planIds.length===1?'':'s'} to practise: ${planIds.slice(0,3).map(s=>names[s]||s).join(', ')}. Simulations arrive in the next update.`]
        :['done',"No weak spots, so there's nothing you have to practise."],
      test:['locked',`Unseen scenarios, no hints. Pass mark ${program.pass_mark}%. Arrives in a later update.`],
      certificate:['locked','Pass the final test to earn a certificate your manager can verify.']};
    const stages=STAGES.map(([id,title,about])=>({id,title,state:st[id][0],description:st[id][1],about}));
    const current=(stages.find(s=>s.state!=='done')||{}).id||null;let nx=null;
    if(current==='game'){const L=level(next);nx={stage:'game',action:'play',level_id:next,label:`${started.has(next)?'Resume':'Start'} Level ${L.n} · ${L.title}`}}
    else if(current==='training')nx={stage:'training',action:'plan',label:'Start your training plan'};
    else if(current==='test')nx={stage:'test',action:null,label:'The final test opens in a later update'};
    const todayISO=today||new Date().toISOString().slice(0,10);
    return{program,levels,stages,current,next:nx,report,weakest:report?report.weakest:null,plan:report?{skills:planIds}:null,
      overdue:!!(program.due&&!gameDone&&program.due<todayISO)};
  }
  return{buildReport,summary,habitAdvice,planSkills,journey,band,decisionPoints,CUE_PHRASES};
})();
if(typeof module!=='undefined')module.exports=PVRules;
