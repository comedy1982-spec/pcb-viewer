/* ---------- project save / open / resume ----------
   A project file (<name>.aod.json, format "aod-project") holds the whole design at any step: every board of the system
   (multi-board) with its own design state — requirements, system diagram, plan, circuit variants, answers, HSIS — plus the
   step and view that were open. It uses the revision log's encoding (REVLOG.enc / dec), so boards keep their routing,
   housing and safety data exactly.
   · 저장 button / Ctrl+S → download the project file;  열기 (home, import dialog, Ctrl+O) → open it again
   · the session is also kept in this browser (IndexedDB "aod-session", gzip) whenever the design changes, so after a reload
     or a crash the home screen offers "이어서 하기". Nothing leaves the browser; private / blocked storage just hides it. */
const PROJ={fmt:'aod-project',v:1,sig:'',fileSig:'',timer:null,db:null,dbp:null,ok:typeof indexedDB!=='undefined',last:null,saving:false};
function projStepName(n){return['','1 시스템','2 회로','3 PCB','4 기구'][n]||'뷰어';}
function projCurName(){return(($('#npName')||{}).value||'').trim()||(BD&&!BD.blank&&BD.name)||(typeof MB!=='undefined'&&MB.name)||'새 프로젝트';}
function projDoc(){if(!BD)return null;const E=REVLOG.enc;
  const cur=typeof mbCur==='function'?mbCur():null;if(cur&&typeof mbSaveState==='function')mbSaveState(cur);
  const list=typeof MB!=='undefined'&&MB.boards.length?MB.boards:[{id:'B1',B:BD,role:'',st:null}];
  const one=b=>{let st=b.st;if(!st&&b.B===BD&&typeof mbSaveState==='function'){const t={};mbSaveState(t);st=t.st;}
    return{id:b.id,role:b.role||'',board:E(b.B),st:st?E(st):null};};
  const st=typeof stepCur==='function'?stepCur():0;
  return{format:PROJ.fmt,v:PROJ.v,saved:new Date().toISOString(),name:projCurName(),
    mb:typeof MB!=='undefined'?{name:MB.name||'',links:MB.links||[],cur:MB.cur||(list[0]&&list[0].id),seq:MB.seq||list.length}:null,
    boards:list.map(one),ui:{mode:typeof APP!=='undefined'?APP.mode:'viewer',step:st,view:S.view,ws:typeof HS!=='undefined'?HS.ws:null},
    summary:{step:st,parts:BD.blank?0:BD.comps.length,blocks:NP.arch&&NP.arch.blocks?NP.arch.blocks.length:0,boards:list.length}};}
function projIsDoc(d){return!!(d&&d.format===PROJ.fmt&&Array.isArray(d.boards)&&d.boards.length);}
// open a project document: rebuild the boards (and the multi-board system), restore each board's design state and the step
function projApply(doc){if(!projIsDoc(doc))throw new Error('AllInOneDesign 프로젝트 파일이 아닙니다 (format: aod-project).');
  const boards=doc.boards.map(x=>{const B=REVLOG.restore({board:x.board},PCB).board;if(!B)throw new Error(`보드 ${x.id}를 읽지 못했습니다.`);return{id:x.id,B,role:x.role||'',st:x.st?REVLOG.dec(x.st):null};});
  const curId=doc.mb&&doc.mb.cur&&boards.some(b=>b.id===doc.mb.cur)?doc.mb.cur:boards[0].id;const cur=boards.find(b=>b.id===curId);
  if(typeof MB!=='undefined'){MB.boards=boards;MB.name=doc.mb&&doc.mb.name||'';MB.links=doc.mb&&doc.mb.links||[];MB.seq=Math.max(doc.mb&&doc.mb.seq||0,boards.length);MB.cur=curId;MB.adding=null;}
  setBoard(cur.B);
  if(typeof mbLoadState==='function')mbLoadState(cur);
  if(typeof REV!=='undefined'&&cur.B.pid&&typeof revSwitch==='function')revSwitch(cur.B.pid).then(()=>{REV.bdRef=BD;REV.sig=typeof revSig==='function'?revSig():'';if(typeof revBadge==='function')revBadge();}).catch(()=>{});
  const ui=doc.ui||{};const mode=ui.mode==='home'||!ui.mode?(cur.B.blank||cur.B.source==='신규 설계'?'steps':'viewer'):ui.mode;
  setMode(mode);
  try{if(typeof npRender==='function')npRender();if(typeof sysRender==='function')sysRender();if(HS.H&&typeof hsisRun==='function')hsisRun();}catch(e){console.warn(e);}
  if(mode==='steps'&&ui.step>=1&&ui.step<=4){try{setStep(ui.step);}catch(e){}}else if(ui.view&&typeof setView==='function'&&ui.view!=='sch'){try{setView(ui.view);}catch(e){}}
  try{if(typeof stepPaint==='function')stepPaint();if(typeof mbPaint==='function')mbPaint();refresh(true);if(typeof cadRefresh==='function')cadRefresh();}catch(e){}
  PROJ.sig=projSig();PROJ.fileSig=PROJ.sig;
  return{name:doc.name||cur.B.name,boards:boards.length,step:ui.step||0};}
// a cheap fingerprint: the revision signature (board + plan + diagram + HSIS + housing) plus the step and the board list
function projSig(){if(!BD)return'';let s='';try{s=(typeof revSig==='function'?revSig():'')+'|'+(typeof APP!=='undefined'?APP.mode:'')+'|'+(typeof stepCur==='function'?stepCur():0)+'|'+(typeof MB!=='undefined'?MB.boards.length+MB.cur:'');}catch(e){}return s;}

/* ---- project file ---- */
async function projSaveFile(){const d=projDoc();if(!d){toast('저장할 설계가 없습니다. 신규 설계를 시작하거나 파일을 여세요.');return null;}
  const name=(d.name||'project').replace(/[\\/:*?"<>|\s]+/g,'_').slice(0,60)||'project';
  const fn=await expSave(`${name}.aod.json`,JSON.stringify(d),'application/json',`${name}.aod.json 저장 — ${projStepName(d.summary.step)} 단계${d.summary.boards>1?` · 보드 ${d.summary.boards}개`:''}. 첫 화면의 [프로젝트 열기]나 파일 불러오기로 다시 엽니다.`);
  if(fn){PROJ.fileSig=projSig();projSession(true);}return fn;}
async function projOpenText(text,fname){let d;try{d=JSON.parse(text);}catch(e){toast(`${fname||'파일'}: JSON을 읽지 못했습니다.`);return false;}
  if(!projIsDoc(d))return false;
  // ask only for a real design whose latest changes are not in a file yet (examples and empty projects just get replaced)
  if(BD&&!BD.blank&&BD.source!=='예제'&&!BD.demo&&projSig()!==PROJ.fileSig&&!confirm(`${d.name||fname} 프로젝트를 엽니다. 지금 화면의 설계는 브라우저 세션과 리비전 기록에 남아 있지만, 파일로 저장하지 않은 변경은 이 프로젝트로 바뀝니다. 계속할까요?`))return true;
  try{const r=projApply(d);toast(`${r.name} 프로젝트를 열었습니다${r.step?` — ${projStepName(r.step)} 단계`:''}${r.boards>1?` · 보드 ${r.boards}개`:''}.`);projSession(true);}catch(e){console.error(e);toast('프로젝트를 열지 못했습니다: '+(e.message||e));}
  return true;}
// called by the import dialog: a project file among the dropped files opens as a project instead of being imported
async function projTryFiles(files){const f=[...files].find(x=>/\.aod\.json$/i.test(x.name)||(/\.json$/i.test(x.name)&&x.size<200e6));if(!f)return false;
  let text;try{text=await f.text();}catch(e){return false;}if(!/"format"\s*:\s*"aod-project"/.test(text.slice(0,200)))return false;
  if(typeof closeImport==='function'){IMP.busy=false;closeImport();}return projOpenText(text,f.name);}
function projPick(){const i=document.createElement('input');i.type='file';i.accept='.json,.aod.json,application/json';i.addEventListener('change',async()=>{const f=i.files&&i.files[0];if(!f)return;const t=await f.text();if(!(await projOpenText(t,f.name)))toast(`${f.name}: AllInOneDesign 프로젝트 파일(.aod.json)이 아닙니다. 보드·회로 파일은 [파일 불러오기]로 여세요.`);});i.click();}

/* ---- browser session (resume after reload) ---- */
function projDb(){if(PROJ.db||!PROJ.ok)return Promise.resolve(PROJ.db);if(PROJ.dbp)return PROJ.dbp;
  PROJ.dbp=new Promise(res=>{try{const r=indexedDB.open('aod-session',1);r.onupgradeneeded=()=>{r.result.createObjectStore('kv');};r.onsuccess=()=>{PROJ.db=r.result;res(PROJ.db);};r.onerror=()=>{PROJ.ok=false;res(null);};r.onblocked=()=>res(null);}catch(e){PROJ.ok=false;res(null);}});return PROJ.dbp;}
const projIdb=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
async function projSession(force){if(PROJ.saving||!BD||(typeof APP!=='undefined'&&APP.mode==='home'))return;if(BD.blank&&!(NP.arch&&NP.arch.blocks&&NP.arch.blocks.length)&&!(($('#npReq')||{}).value||'').trim())return;
  if(!force&&typeof copBusyAny==='function'&&copBusyAny())return;const sig=projSig();if(!force&&sig===PROJ.sig)return;
  PROJ.saving=true;try{const d=projDoc();if(!d)return;const db=await projDb();if(!db)return;
    const meta={name:d.name,saved:d.saved,step:d.summary.step,parts:d.summary.parts,blocks:d.summary.blocks,boards:d.summary.boards};
    const data=typeof revPack==='function'?await revPack(JSON.stringify(d)):JSON.stringify(d);
    const t=db.transaction('kv','readwrite');t.objectStore('kv').put({meta,data},'last');await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error);});
    PROJ.sig=sig;PROJ.last=meta;projHomePaint();}
  catch(e){console.warn('session save',e);}finally{PROJ.saving=false;}}
async function projSessionGet(){const db=await projDb();if(!db)return null;try{return await projIdb(db.transaction('kv').objectStore('kv').get('last'));}catch(e){return null;}}
async function projResume(){const s=await projSessionGet();if(!s){toast('이어서 할 작업이 없습니다.');projHomePaint();return;}
  try{const raw=typeof revUnpack==='function'?await revUnpack(s.data):s.data;const d=JSON.parse(raw);const r=projApply(d);toast(`${r.name} — 마지막 작업 상태로 이어서 합니다${r.step?` (${projStepName(r.step)} 단계)`:''}.`);}
  catch(e){console.error(e);toast('이전 작업을 불러오지 못했습니다: '+(e.message||e));}}
async function projForget(){const db=await projDb();if(db){try{await projIdb(db.transaction('kv','readwrite').objectStore('kv').delete('last'));}catch(e){}}PROJ.last=null;projHomePaint();}
function projAgo(iso){const s=(Date.now()-new Date(iso).getTime())/1000;if(!(s>=0))return'';if(s<60)return'방금';if(s<3600)return`${Math.round(s/60)}분 전`;if(s<86400)return`${Math.round(s/3600)}시간 전`;return new Date(iso).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
async function projHomePaint(){const host=$('#homeResume');if(!host)return;if(PROJ.last===null&&PROJ.ok){const s=await projSessionGet();PROJ.last=s?s.meta:false;}
  const m=PROJ.last;if(!m){host.hidden=true;return;}host.hidden=false;
  host.querySelector('.hr-t').textContent=`${m.name} · ${projStepName(m.step)} 단계${m.boards>1?` · 보드 ${m.boards}개`:''}${m.parts?` · 부품 ${m.parts}개`:m.blocks?` · 블록 ${m.blocks}개`:''} · ${projAgo(m.saved)} 자동 저장`;}
function projStart(){
  const sv=$('#projSave');if(sv)sv.addEventListener('click',projSaveFile);
  const op=$('#projOpen');if(op)op.addEventListener('click',projPick);
  const ho=$('#homeProj');if(ho)ho.addEventListener('click',projPick);
  const hr=$('#homeResume');if(hr){hr.querySelector('[data-resume]').addEventListener('click',()=>homeGo(projResume,'steps'));hr.querySelector('[data-forget]').addEventListener('click',()=>{if(confirm('브라우저에 자동 저장된 마지막 작업을 지울까요? (리비전 기록과 저장한 파일은 그대로)'))projForget();});}
  document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();
    if(k==='s'){e.preventDefault();projSaveFile();}else if(k==='o'&&!e.shiftKey){e.preventDefault();projPick();}});
  // autosave: a few seconds after the design changes, and when the tab is hidden or closed
  PROJ.timer=setInterval(()=>{const go=()=>projSession(false);if(typeof requestIdleCallback==='function')requestIdleCallback(go,{timeout:3000});else go();},5000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')projSession(false);});
  window.addEventListener('pagehide',()=>projSession(false));
  projHomePaint();}
projStart();
