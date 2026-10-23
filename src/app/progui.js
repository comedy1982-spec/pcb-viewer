/* ---------- progress / loading UI ----------
   One place shows that something is running: a thin bar at the very top of the page (moving stripe when the length of the
   job is unknown, filling when it is known) and a status card (spinner · what is running · n/m · % · elapsed · 중지).
   Sources:
   - consoles (PCB · 회로 · 회로도 · 기구): copBusyPaint() → progSync() starts/ends one task per console (ending is debounced,
     so a chain of commands such as "PCB 설계 시작" stays one task)
   - log lines that say they are in progress ("배선 중… 12/59 · NET", "Claude가 생각하는 중…", "… 읽는 중…"): copPaint()
     → progNote() puts the text and the n/m fraction on the card until the line is replaced or dropped
   - direct calls for work outside the consoles (exports, PCB gate chain): progStart / progSet / progEnd / progRun
   The animations use transform only, so they keep moving while a long synchronous step (autoroute, STEP, report) blocks JS. */
var PROG={tasks:new Map(),notes:new Map(),seq:0,tick:0,raf:0,endT:{}};
function progStart(id,label,o){o=o||{};clearTimeout(PROG.endT[id]);const t=PROG.tasks.get(id);
  if(t){t.label=label||t.label;if(o.total!=null)t.total=o.total;if(o.stop)t.stop=o.stop;}
  else PROG.tasks.set(id,{id,label:label||'작업 중…',i:o.i||0,total:o.total||0,stop:o.stop||null,t0:performance.now(),seq:++PROG.seq});
  progPaint();return id;}
function progSet(id,p){const t=PROG.tasks.get(id);if(!t)return;if(p.label!=null)t.label=p.label;if(p.i!=null)t.i=p.i;if(p.total!=null)t.total=p.total;progPaint();}
function progEnd(id,delay){clearTimeout(PROG.endT[id]);const go=()=>{PROG.tasks.delete(id);[...PROG.notes.keys()].forEach(k=>{if(PROG.notes.get(k).src===id)PROG.notes.delete(k);});progPaint();};
  if(delay)PROG.endT[id]=setTimeout(go,delay);else go();}
/* run an async (or blocking) job with the card up; the double frame lets the card paint before a synchronous step starts */
async function progRun(label,fn,o){const id='run'+(++PROG.seq);progStart(id,label,o);await progFrame();try{return await fn(id);}finally{progEnd(id);}}
function progFrame(){return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));}

/* consoles → tasks */
const PROG_SRC={pcb:[()=>CLI,'PCB 배치·배선'],sch:[()=>SCLI,'회로도'],np:[()=>NP,'회로 설계'],cad:[()=>CADC,'기구 설계']};
function progSync(){if(!PROG)return;for(const[k,[get,label]]of Object.entries(PROG_SRC)){let S=null;try{S=get();}catch(e){}
  if(!S)continue;const id='c:'+k;
  if(S.busy)progStart(id,PROG.tasks.has(id)?null:label+' 진행 중…',{stop:()=>{S.stopReq=true;if(S.abort)try{S.abort.abort();}catch(e){}}});
  else if(PROG.tasks.has(id))progEnd(id,350);}}
/* in-progress log lines → notes on the card */
const PROG_RE=/중…|중\.\.\.|…\s*(\([^)]*\))?\s*$|다시 배선 \d+\/\d+|준비 중/;
function progNote(e,upd){if(!PROG||!e||!e.cid)return;const live=(e.k==='ai'||e.k==='out')&&PROG_RE.test(String(e.t||''))&&String(e.t).length<240;
  if(live){const t=String(e.t);const m=t.match(/완료\s*(\d+)\s*\/\s*(\d+)/)||t.match(/(\d+)\s*\/\s*(\d+)/);
    PROG.notes.set(e.cid,{src:'c:'+(e.src||''),text:t.split('\n')[0],i:m?+m[1]:null,total:m?+m[2]:null,t0:(PROG.notes.get(e.cid)||{}).t0||performance.now(),last:performance.now(),seq:++PROG.seq});progPaint();}
  else if(PROG.notes.has(e.cid)){PROG.notes.delete(e.cid);progPaint();}}
function progDropNote(e){if(PROG&&e&&PROG.notes.delete(e.cid))progPaint();}

function progEls(){let top=document.getElementById('progTop');if(top)return{top,card:document.getElementById('progCard')};
  top=document.createElement('div');top.id='progTop';top.setAttribute('aria-hidden','true');top.innerHTML='<i></i>';document.body.appendChild(top);
  const card=document.createElement('div');card.id='progCard';card.setAttribute('role','status');card.setAttribute('aria-live','polite');
  card.innerHTML='<span class="pg-spin" aria-hidden="true"></span><div class="pg-b"><b class="pg-l"></b><div class="pg-s"><span class="pg-n"></span><span class="pg-t"></span></div><div class="pg-bar"><i></i></div></div><button type="button" class="btn sm pg-stop">중지</button>';
  card.querySelector('.pg-stop').addEventListener('click',()=>{PROG.tasks.forEach(t=>{if(t.stop)try{t.stop();}catch(e){}});card.classList.add('stopping');card.querySelector('.pg-l').textContent='중지하는 중…';});
  document.body.appendChild(card);return{top,card};}
const progClock=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function progPaint(){if(PROG.raf)return;PROG.raf=requestAnimationFrame(()=>{PROG.raf=0;progDraw();});}
function progDraw(){const{top,card}=progEls();const now=performance.now();
  // a note lives while its own console task runs; one without such a task (e.g. a narrative line on the shared log) only
  // while some task runs and for at most 30 s since its last update — so a line that is never closed cannot pin the card
  for(const[k,n]of PROG.notes){if(PROG.tasks.has(n.src))continue;if(!PROG.tasks.size||now-n.last>30000)PROG.notes.delete(k);}
  const tasks=[...PROG.tasks.values()],notes=[...PROG.notes.values()];const on=tasks.length>0;
  document.documentElement.classList.toggle('prog-on',on);top.classList.toggle('on',on);card.classList.toggle('on',on);
  if(!on){card.classList.remove('stopping');clearInterval(PROG.tick);PROG.tick=0;return;}
  if(!PROG.tick)PROG.tick=setInterval(()=>progDraw(),500);
  const t=tasks.sort((a,b)=>b.seq-a.seq)[0]||null,n=notes.sort((a,b)=>b.seq-a.seq)[0]||null;
  const label=n?n.text:t.label;const i=n&&n.total?n.i:t&&t.total?t.i:null,total=n&&n.total?n.total:t&&t.total?t.total:null;
  const t0=tasks.length?Math.min(...tasks.map(x=>x.t0)):Math.min(...notes.map(x=>x.t0));const pct=total?Math.max(0,Math.min(100,i/total*100)):null;
  if(!card.classList.contains('stopping'))card.querySelector('.pg-l').textContent=label;
  card.querySelector('.pg-n').textContent=total?`${i}/${total} · ${pct.toFixed(0)}%`:'';
  card.querySelector('.pg-t').textContent=progClock(now-t0);
  card.querySelector('.pg-stop').hidden=!tasks.some(x=>x.stop);
  const det=pct!=null;[top,card.querySelector('.pg-bar')].forEach(b=>{b.classList.toggle('det',det);b.firstChild.style.transform=det?`scaleX(${(Math.max(2,pct)/100).toFixed(3)})`:'';});}
