/* =========================================================
   LIVE: team activity in real time (Server-Sent Events from /api/events).
   Live.start(lastId) · Live.stop() · Live.on(kind | '*', fn) · Live.onStatus(fn) · Live.status
   Status: 'connected' | 'reconnecting' | 'offline'. Falls back to polling /api/activity every 10 s
   when EventSource fails, and retries the stream every minute. Live.simulate(events) drives the
   same listeners on a timer for demo mode.
   ========================================================= */
const Live=(()=>{
  const listeners={},statusFns=[];let es=null,lastId=0,status='offline',mode='off',watchdog=0,pollTimer=0,retryTimer=0,failures=0,simTimer=0;
  const seen=new Set();
  const STALE_MS=40000,POLL_MS=10000,RETRY_SSE_MS=60000;
  function setStatus(s){if(s===status)return;status=s;statusFns.forEach(f=>{try{f(s,mode)}catch(e){console.warn(e)}})}
  function dispatch(ev){
    if(!ev||seen.has(ev.id))return;seen.add(ev.id);if(ev.id>lastId)lastId=ev.id;
    for(const fn of[...(listeners[ev.kind]||[]),...(listeners['*']||[])]){try{fn(ev)}catch(e){console.warn('live listener failed',e)}}
  }
  function kick(){clearTimeout(watchdog);watchdog=setTimeout(()=>{/* no message or heartbeat for 40 s: the connection is dead */openStream()},STALE_MS)}
  function openStream(){
    closeStream();if(!window.EventSource){startPolling();return}
    mode='sse';es=new EventSource('api/events?last_id='+lastId);kick();
    es.onopen=()=>{failures=0;setStatus('connected');kick()};
    es.onmessage=m=>{kick();try{dispatch(JSON.parse(m.data))}catch(e){}};
    es.addEventListener('ping',()=>{kick();setStatus('connected')});
    es.onerror=()=>{failures++;if(es&&es.readyState===EventSource.CLOSED||failures>=3){closeStream();startPolling()}else setStatus('reconnecting')};
  }
  function closeStream(){clearTimeout(watchdog);if(es){es.onerror=es.onmessage=es.onopen=null;es.close();es=null}}
  async function poll(){
    try{const r=await fetch('api/activity?after='+lastId,{credentials:'same-origin'});if(r.status===401){stop();return}if(!r.ok)throw 0;
      const j=await r.json();(j.events||[]).forEach(dispatch);setStatus('connected')}catch(e){setStatus('offline')}
  }
  function startPolling(){
    if(mode==='poll')return;mode='poll';setStatus('reconnecting');poll();clearInterval(pollTimer);pollTimer=setInterval(poll,POLL_MS);
    clearTimeout(retryTimer);retryTimer=setTimeout(()=>{clearInterval(pollTimer);failures=0;openStream()},RETRY_SSE_MS);
  }
  function start(fromId){lastId=Math.max(lastId,fromId||0);setStatus('reconnecting');openStream()}
  function stop(){closeStream();clearInterval(pollTimer);clearTimeout(retryTimer);clearInterval(simTimer);mode='off';setStatus('offline')}
  function on(kind,fn){(listeners[kind]=listeners[kind]||[]).push(fn);return()=>{listeners[kind]=listeners[kind].filter(f=>f!==fn)}}
  function onStatus(fn){statusFns.push(fn);fn(status,mode)}
  /* demo mode: replay a script of events, one every few seconds, forever */
  function simulate(makeEvent,everyMs=6000){stop();mode='demo';setStatus('connected');let i=0;simTimer=setInterval(()=>{const ev=makeEvent(i++);if(ev)dispatch(ev)},everyMs)}
  /* browsers pause timers in background tabs; check the stream when the tab comes back */
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='sse'&&(!es||es.readyState===EventSource.CLOSED))openStream()});
  return{start,stop,on,onStatus,simulate,get status(){return status},get mode(){return mode},get lastId(){return lastId}};
})();
