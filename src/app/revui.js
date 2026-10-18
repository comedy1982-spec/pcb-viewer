/* ---------- 리비전 기록: every design change becomes a revision (auto), named revisions on request, and a compare view ----------
   Storage: IndexedDB in this browser (meta in "revs", gzip snapshots in "snaps"), memory when IndexedDB is unavailable. The history
   exports to one JSON file (to keep in Git next to the design) and imports back. Snapshots come from REVLOG (src/core/revlog.js). */
var REV={lv:'list',pid:null,list:[],on:true,sig:null,pend:null,last:null,lastId:null,bdRef:null,logCid:0,busy:false,open:false,a:null,b:'cur',tab:'sum',layer:'T',cache:new Map(),mem:new Map(),view:null,saveOpen:false};
try{if(localStorage.getItem('aod.rev.auto')==='0')REV.on=false;}catch(e){}
const REV_MAX_AUTO=150;
/* ---- storage ---- */
const REVDB={db:null,ok:typeof indexedDB!=='undefined',p:null};
function revDb(){if(REVDB.db||!REVDB.ok)return Promise.resolve(REVDB.db);if(REVDB.p)return REVDB.p;
  REVDB.p=new Promise(res=>{try{const r=indexedDB.open('aod-revisions',1);r.onupgradeneeded=()=>{const d=r.result;const s=d.createObjectStore('revs',{keyPath:'id'});s.createIndex('pid','pid');d.createObjectStore('snaps');};
    r.onsuccess=()=>{REVDB.db=r.result;res(REVDB.db);};r.onerror=()=>{REVDB.ok=false;res(null);};r.onblocked=()=>{REVDB.ok=false;res(null);};}catch(e){REVDB.ok=false;res(null);}});return REVDB.p;}
const idbReq=q=>new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
async function revPut(meta,data){const d=await revDb();if(d){try{const t=d.transaction(['revs','snaps'],'readwrite');t.objectStore('revs').put(meta);t.objectStore('snaps').put(data,meta.id);await new Promise((r,j)=>{t.oncomplete=r;t.onerror=()=>j(t.error);t.onabort=()=>j(t.error);});return;}catch(e){console.warn('revision store',e);}}
  REV.mem.set(meta.id,{meta,data});}
async function revMetaUpdate(meta){const d=await revDb();if(d){try{await idbReq(d.transaction('revs','readwrite').objectStore('revs').put(meta));return;}catch(e){}}const m=REV.mem.get(meta.id);if(m)m.meta=meta;}
async function revMetas(pid){const mem=[...REV.mem.values()].map(x=>x.meta).filter(m=>m.pid===pid);const d=await revDb();if(!d)return mem;
  try{const all=await idbReq(d.transaction('revs').objectStore('revs').index('pid').getAll(pid));return all.concat(mem.filter(m=>!all.some(x=>x.id===m.id)));}catch(e){return mem;}}
async function revData(id){const m=REV.mem.get(id);if(m)return m.data;const d=await revDb();if(!d)return null;try{return await idbReq(d.transaction('snaps').objectStore('snaps').get(id));}catch(e){return null;}}
async function revDelete(id){REV.mem.delete(id);REV.cache.delete(id);const d=await revDb();if(!d)return;try{const t=d.transaction(['revs','snaps'],'readwrite');t.objectStore('revs').delete(id);t.objectStore('snaps').delete(id);}catch(e){}}
async function revPack(s){if(typeof CompressionStream==='undefined')return s;try{return await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).blob();}catch(e){return s;}}
async function revUnpack(d){if(d==null)return null;if(typeof d==='string')return d;return await new Response(d.stream().pipeThrough(new DecompressionStream('gzip'))).text();}
// a revision's restored state ({board, np, hsis}), decoded fresh (or from a small cache when it is only read)
async function revState(id,fresh){if(!fresh&&REV.cache.has(id))return REV.cache.get(id);const raw=await revUnpack(await revData(id));if(!raw)throw new Error('리비전 데이터를 찾지 못했습니다.');
  const st=REVLOG.restore(JSON.parse(raw),PCB);if(!fresh){REV.cache.set(id,st);if(REV.cache.size>6)REV.cache.delete(REV.cache.keys().next().value);}return st;}
async function revRaw(id){return revUnpack(await revData(id));}
/* ---- what is recorded ---- */
function revLive(){return{mb:typeof MB!=='undefined'?{name:MB.name,boards:MB.boards.map(b=>({id:b.id,name:b.B.name,role:b.role||''})),links:JSON.parse(JSON.stringify(MB.links||[])),cur:MB.cur}:null,board:BD,np:{name:($('#npName')||{}).value||'',req:($('#npReq')||{}).value||'',plan:NP.plan||null,arch:NP.arch||null,answers:NP.answers||{},vkey:NP.vkey||null,picked:NP.picked||null},hsis:HS.H||null};}
// a cheap fingerprint of everything a revision holds; the auto recorder only snapshots when it changes and then holds still
function revSig(){if(!BD)return'';let h=2166136261;const H=s=>{s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}};
  H(`${BD.pid}|${BD.name}|${BD.W}x${BD.H}|${BD.copperLayers}|${BD.t}|${!!BD.blank}${!!BD.pcbPending}|${BD.variantLabel||''}`);
  BD.comps.forEach(c=>{H(`${c.ref}${c.val}${c.mpn}${c.fp}${c.side}${(+c.x).toFixed(3)},${(+c.y).toFixed(3)},${c.rot||0}`);c.pads.forEach(p=>H(p.net||'-'));});
  Object.keys(BD.layers).forEach(k=>{const L=BD.layers[k];let s=0;for(const p of L){if(p.a)s+=p.a[0]+p.a[1]*3+p.b[0]*5+p.b[1]*7+(p.w||0);else if(p.pts)s+=p.pts.length+p.pts[0][0]+p.pts[p.pts.length-1][1];else if(p.x!=null)s+=p.x*0.7+p.y*1.3;else if(p.rings)s+=p.rings.length;}H(`${k}${L.length}:${s.toFixed(3)}`);});
  BD.vias.forEach(v=>H(`${(+v.x).toFixed(3)},${(+v.y).toFixed(3)}`));
  try{H(JSON.stringify(NP.arch||null));H(JSON.stringify(NP.plan||null));}catch(e){}
  try{if(typeof MB!=='undefined')H(`${MB.name}|${MB.boards.map(b=>b.id+b.role).join(',')}|${JSON.stringify(MB.links||[])}`);}catch(e){}H(($('#npReq')||{}).value||'');H(($('#npName')||{}).value||'');
  if(BD.housing)H(JSON.stringify({i:BD.housing.inp,c:BD.housing.cad}));if(HS.H){try{H(JSON.stringify(HS.H.items||[]));}catch(e){}}
  return(h>>>0).toString(36);}
// what the person or Claude ran since the last revision (copilot log)
function revCauses(){const L=(typeof COP!=='undefined'&&COP.log||[]).filter(e=>(e.cid||0)>REV.logCid&&(e.k==='cmd'||e.k==='user')&&e.t);
  const t=L.map(e=>String(e.t).replace(/\s+/g,' ').trim().slice(0,70));return t.length?t.slice(-5).join(' · ')+(t.length>5?` 외 ${t.length-5}건`:''):'';}
const revSlug=s=>String(s||'board').toLowerCase().replace(/[^\w가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'board';
function revPidFor(B){if(B.pid)return B.pid;if(REV.pid&&/^p-/.test(REV.pid)&&(B.source==='신규 설계'||(typeof APP!=='undefined'&&APP.mode==='steps'&&!B.demo)))return REV.pid;
  return B.source==='예제'?'ex-'+revSlug(B.name):B.source==='신규 설계'?'p-'+Date.now().toString(36):'f-'+revSlug(B.name);}
const revLabel=r=>r?(r==='cur'?'현재':`r${r.n}${r.label?' '+r.label:''}`):'';
/* ---- record ---- */
async function revRecord(o){o=o||{};if(!BD||REV.busy||typeof REVLOG==='undefined')return null;REV.busy=true;
  try{if(!BD.pid)BD.pid=revPidFor(BD);if(BD.pid!==REV.pid)await revSwitch(BD.pid);
    const json=JSON.stringify(REVLOG.snapshot(revLive()));const clone=REVLOG.restore(JSON.parse(json),PCB);
    const d=REV.last?REVLOG.compare(REV.last,clone):null;REV.sig=revSig();REV.pend=null;REV.bdRef=BD;
    if(d&&!d.total&&!o.tag){revBadge();return null;}
    const n=REV.list.reduce((m,r)=>Math.max(m,r.n),0)+1;const now=Date.now();
    const meta={id:`${REV.pid}#${n}#${now.toString(36)}`,pid:REV.pid,project:BD.name,n,time:now,kind:o.tag?'tag':o.kind||'auto',label:o.label||'',stage:o.stage||'',note:o.note||'',
      cause:o.cause||revCauses()||(d?'직접 편집':''),summary:d?(d.total?d.summary:`r${(REV.list[REV.list.length-1]||{}).n||'?'}과 같은 상태에 이름을 붙임`):(o.first||'첫 기록'),counts:d?d.counts:null,stats:JSON.parse(json).stats,size:json.length,
      where:typeof APP!=='undefined'?(APP.mode==='steps'?`${typeof stepCur==='function'?stepCur():''}단계`:APP.mode==='viewer'?'뷰어':''):''};
    await revPut(meta,await revPack(json));
    REV.list.push(meta);REV.last=clone;REV.lastId=meta.id;REV.cache.set(meta.id,clone);if(REV.cache.size>6)REV.cache.delete(REV.cache.keys().next().value);
    const cl=typeof COP!=='undefined'&&COP.log||[];REV.logCid=cl.length?cl[cl.length-1].cid||REV.logCid:REV.logCid;
    await revPrune();revBadge();if(REV.open){if(REV.b==='cur'&&REV.a==null)REV.a=meta.id;revRender();}
    return meta;}
  catch(e){console.error('revision',e);return null;}finally{REV.busy=false;}}
async function revPrune(){const autos=REV.list.filter(r=>r.kind==='auto'&&r.n>1);if(autos.length<=REV_MAX_AUTO)return;const drop=autos.slice(0,autos.length-REV_MAX_AUTO);
  for(const r of drop)await revDelete(r.id);REV.list=REV.list.filter(r=>!drop.includes(r));}
// a different project: load its history and its newest snapshot as the baseline
async function revSwitch(pid){REV.pid=pid;REV.list=(await revMetas(pid)).sort((a,b)=>a.n-b.n);REV.last=null;REV.lastId=null;REV.cache.clear();REV.a=null;REV.b='cur';
  const top=REV.list[REV.list.length-1];if(top){try{REV.last=await revState(top.id,true);REV.lastId=top.id;}catch(e){console.warn(e);}}}
// the auto recorder: when the fingerprint changes and then stays the same for one tick, record
async function revTick(){if(REV.ticking)return;REV.ticking=true;try{await revTick0();}finally{REV.ticking=false;}}
async function revTick0(){if(!BD||REV.busy||typeof APP!=='undefined'&&APP.mode==='home')return;if(typeof copBusyAny==='function'&&copBusyAny())return;
  const fresh=BD.pid!==REV.pid||!BD.pid||REV.bdRef!==BD;
  if(fresh){const switching=!BD.pid||BD.pid!==REV.pid;if(!BD.pid)BD.pid=revPidFor(BD);if(BD.pid!==REV.pid){await revSwitch(BD.pid);}
    if(REV.on||!REV.list.length){const cause=switching?(BD.source==='예제'||BD.demo?`예제 열기 · ${BD.name}`:BD.source==='신규 설계'?'신규 설계 시작':`파일 열기 · ${BD.source||''}`):(revCauses()||(BD.variantLabel?`회로 생성 · ${BD.variantLabel}`:'보드 교체'));
      await revRecord({cause:REV.nextCause||cause,first:REV.nextCause||cause});REV.nextCause=null;}
    else{REV.bdRef=BD;REV.sig=revSig();}revBadge();return;}
  if(typeof nxStripPaint==='function')nxStripPaint();if(typeof nxOvRender==='function')nxOvRender();
  const s=revSig();if(s===REV.sig){REV.pend=null;revBadge();return;}
  revBadge(true);if(!REV.on)return;if(REV.pend!==s){REV.pend=s;return;}
  await revRecord();}
setInterval(()=>{if(document.visibilityState!=='hidden')revTick();},2000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&REV.on&&BD&&REV.sig&&revSig()!==REV.sig)revRecord();});
function revOnBoard(cause){if(typeof nxStripPaint==='function')setTimeout(nxStripPaint,0);if(cause)REV.nextCause=cause;setTimeout(revTick,60);}
/* ---- header badge ---- */
function revBadge(dirty){const b=$('#revBtn');if(!b)return;const last=REV.list[REV.list.length-1];const d=dirty!=null?dirty:!!(BD&&REV.sig&&REV.bdRef===BD&&revSig()!==REV.sig);
  const t=b.querySelector('.rv-n');if(t)t.textContent=last?revLabel(last):'—';b.classList.toggle('dirty',d);b.title=`리비전 기록 · ${last?revLabel(last)+' · '+new Date(last.time).toLocaleString('ko-KR'):'아직 없음'}${d?' · 저장되지 않은 변경 있음':''}${REV.on?'':' · 자동 기록 꺼짐'}`;}
/* ---- dialog ---- */
const revTime=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;};
const STAGES=['','Proto','EVT','DVT','PVT','MP'];
function revListHTML(){const rows=REV.list.slice().reverse();const dirty=!!(BD&&REV.sig&&revSig()!==REV.sig);
  const ab=id=>`<span class="rv-ab"><button type="button" class="ab${REV.a===id?' on':''}" data-a="${id}" aria-pressed="${REV.a===id}" title="비교 기준(A)">A</button><button type="button" class="ab b${REV.b===id?' on':''}" data-b="${id}" aria-pressed="${REV.b===id}" title="비교 대상(B)">B</button></span>`;
  return`<li class="rv-row cur${REV.b==='cur'||REV.a==='cur'?' sel':''}">${ab('cur')}<div class="rv-main"><b>현재</b><span class="rv-t">${dirty?'저장되지 않은 변경 있음':'마지막 리비전과 같음'}</span></div></li>
  ${rows.map(r=>`<li class="rv-row ${r.kind}${REV.a===r.id||REV.b===r.id?' sel':''}" data-id="${esc(r.id)}">${ab(r.id)}<div class="rv-main"><div class="rv-l1"><b>r${r.n}</b>${r.label?`<span class="rv-tag">${esc(r.label)}${r.stage?' · '+esc(r.stage):''}</span>`:''}${r.kind==='restore'?'<span class="rv-k">복원</span>':''}<time>${revTime(r.time)}</time>${r.where?`<span class="rv-w">${esc(r.where)}</span>`:''}</div>
    <p class="rv-s">${esc(r.summary||'')}</p>${r.cause?`<p class="rv-c" title="${esc(r.cause)}">${esc(r.cause)}</p>`:''}${r.note?`<p class="rv-c">📝 ${esc(r.note)}</p>`:''}</div>
    <div class="rv-act"><button type="button" class="pill vbtn" data-open="${esc(r.id)}" title="이 리비전으로 되돌리기 (지금 상태는 먼저 기록)">복원</button><button type="button" class="pill vbtn" data-name="${esc(r.id)}" title="이름·단계·메모">이름</button>${r.n>1||REV.list.length===1?`<button type="button" class="pill vbtn" data-del="${esc(r.id)}" title="삭제" aria-label="r${r.n} 삭제">×</button>`:''}</div></li>`).join('')}`;}
function revDialogHTML(){const P=BD?BD.name:'';return`<div class="sheet rv" role="dialog" aria-modal="true" aria-labelledby="rvT"><div class="sheet-h"><h2 id="rvT">리비전 기록 · ${esc(P)}</h2>
  <div class="rv-tools"><div class="seg rv-lv" role="tablist" aria-label="보기"><button role="tab" type="button" data-lv="list" aria-selected="${REV.lv!=='ledger'}">목록</button><button role="tab" type="button" data-lv="ledger" aria-selected="${REV.lv==='ledger'}">원장</button></div><label class="rv-auto"><input type="checkbox" id="rvAuto"${REV.on?' checked':''}> 자동 기록</label><button type="button" class="btn primary sm" data-rv="save">지금 저장…</button><button type="button" class="btn sm" data-rv="export" title="기록 전체를 JSON 파일로 (Git에 함께 커밋)">기록 내보내기</button><button type="button" class="btn sm" data-rv="import">불러오기</button><input type="file" id="rvFile" accept=".json,application/json" hidden></div>
  <button class="x" data-close aria-label="닫기">✕</button></div>
  <form class="rv-save" id="rvSave"${REV.saveOpen?'':' hidden'}><input id="rvLbl" placeholder="이름 (예: A01, EVT1, 고객 검토용)" maxlength="40" aria-label="리비전 이름"><select id="rvStage" aria-label="단계">${STAGES.map(s=>`<option value="${s}">${s||'단계 없음'}</option>`).join('')}</select><input id="rvNote" placeholder="메모 (바뀐 이유, ECO 번호…)" maxlength="300" aria-label="메모"><button class="btn primary sm" type="submit">저장</button><button class="btn sm" type="button" data-rv="cancel">취소</button></form>
  <div class="rv-body${REV.lv==='ledger'?' lgmode':''}"><div class="rv-ledger" id="rvLedger"${REV.lv==='ledger'?'':' hidden'}>${REV.lv==='ledger'&&typeof nxLedgerHTML==='function'?nxLedgerHTML():''}</div><div class="rv-left"${REV.lv==='ledger'?' hidden':''}><p class="lead rv-help">설계를 바꾸면 2–4초 뒤 자동으로 기록됩니다. A·B를 골라 비교하고, [복원]으로 되돌립니다.</p><ol class="rv-list" id="rvList">${revListHTML()}</ol></div>
  <div class="rv-right" id="rvCmp"><p class="lead">비교할 두 리비전을 고르세요.</p></div></div></div>`;}
async function openRevisions(){if(!BD){toast('먼저 보드를 열거나 신규 설계를 시작하세요.');return;}await revTick();if(BD.pid!==REV.pid)await revSwitch(BD.pid||revPidFor(BD));
  let m=$('#revDlg');if(!m){m=document.createElement('div');m.className='modal';m.id='revDlg';document.body.appendChild(m);revBind(m);}
  const dirty=REV.sig&&revSig()!==REV.sig;const L=REV.list;if(REV.a==null||(REV.a!=='cur'&&!L.some(r=>r.id===REV.a))){REV.b=dirty||L.length<2?'cur':L[L.length-1].id;REV.a=L.length?(dirty||L.length<2?L[L.length-1].id:L[L.length-2].id):null;}
  m.innerHTML=revDialogHTML();m.hidden=false;REV.open=true;revCompareRender();}
function revRender(){const m=$('#revDlg');if(!m||m.hidden)return;const ol=$('#rvList');if(ol)ol.innerHTML=revListHTML();const lg=$('#rvLedger');if(lg&&REV.lv==='ledger'&&typeof nxLedgerHTML==='function')lg.innerHTML=nxLedgerHTML();revCompareRender();}
function revClose(){const m=$('#revDlg');if(m)m.hidden=true;REV.open=false;}
function revBind(m){
  m.addEventListener('click',async e=>{if(e.target===m||e.target.closest('[data-close]')){revClose();return;}
    const t=e.target.closest('button');if(!t)return;const ds=t.dataset;
    if(ds.lv){REV.lv=ds.lv;m.innerHTML=revDialogHTML();revCompareRender();return;}
    if(ds.lcol){const id=ds.lcol;if(e.shiftKey){REV.a=id;if(REV.b===id)REV.b='cur';}else{REV.b=id;if(REV.a===id)REV.a=null;if(REV.a==null){const L=REV.list;const i=L.findIndex(r=>r.id===id);REV.a=id==='cur'?(L.length?L[L.length-1].id:null):(i>0?L[i-1].id:null);}}revRender();return;}
    if(ds.a){REV.a=ds.a;if(REV.b===REV.a)REV.b=ds.a==='cur'?(REV.list[REV.list.length-1]||{}).id:'cur';revRender();return;}
    if(ds.b){REV.b=ds.b;if(REV.a===REV.b)REV.a=ds.b==='cur'?(REV.list[REV.list.length-1]||{}).id:'cur';revRender();return;}
    if(ds.tab){REV.tab=ds.tab;revCompareRender();return;}
    if(ds.open){revRestore(ds.open);return;}
    if(ds.del){const r=REV.list.find(x=>x.id===ds.del);if(!r||!confirm(`r${r.n}${r.label?' '+r.label:''}을(를) 기록에서 지울까요?`))return;await revDelete(r.id);REV.list=REV.list.filter(x=>x!==r);if(REV.a===r.id)REV.a=null;if(REV.b===r.id)REV.b='cur';if(REV.lastId===r.id){const top=REV.list[REV.list.length-1];REV.lastId=top?top.id:null;REV.last=top?await revState(top.id,true):null;}revRender();revBadge();return;}
    if(ds.name){const r=REV.list.find(x=>x.id===ds.name);if(!r)return;const lbl=prompt(`r${r.n} 이름 (예: A01, EVT1)`,r.label||'');if(lbl==null)return;const st=prompt('단계 (Proto · EVT · DVT · PVT · MP, 비우면 없음)',r.stage||'');const note=prompt('메모',r.note||'');
      r.label=lbl.trim().slice(0,40);r.stage=STAGES.find(s=>s&&s.toLowerCase()===String(st||'').trim().toLowerCase())||'';if(note!=null)r.note=note.trim().slice(0,300);if(r.label&&r.kind==='auto')r.kind='tag';await revMetaUpdate(r);revRender();revBadge();return;}
    const a=ds.rv;if(!a)return;
    if(a==='save'){REV.saveOpen=true;const f=$('#rvSave');f.hidden=false;$('#rvLbl').focus();return;}
    if(a==='cancel'){REV.saveOpen=false;$('#rvSave').hidden=true;return;}
    if(a==='export'){revExport();return;}if(a==='import'){$('#rvFile').click();return;}
    if(a==='xlsx'){revCompareXlsx();return;}if(a==='fit'){REV.view=null;revPaintOverlay();return;}});
  m.addEventListener('change',async e=>{if(e.target.id==='rvAuto'){REV.on=e.target.checked;try{localStorage.setItem('aod.rev.auto',REV.on?'1':'0');}catch(x){}revBadge();if(REV.on)revTick();return;}
    if(e.target.id==='rvLayer'){REV.layer=e.target.value;REV.view=null;revPaintOverlay();return;}
    if(e.target.id==='rvFile'){const f=e.target.files&&e.target.files[0];e.target.value='';if(f)revImport(await f.text(),f.name);}});
  m.addEventListener('submit',async e=>{if(e.target.id!=='rvSave')return;e.preventDefault();const lbl=$('#rvLbl').value.trim(),st=$('#rvStage').value,note=$('#rvNote').value.trim();
    const r=await revRecord({tag:true,label:lbl||'',stage:st,note,cause:revCauses()||'수동 저장'});REV.saveOpen=false;if(r){toast(`r${r.n}${r.label?' '+r.label:''}로 저장했습니다.`);REV.b='cur';REV.a=r.id;}revRender();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&REV.open)revClose();});}
/* ---- restore ---- */
async function revRestore(id){const r=REV.list.find(x=>x.id===id);if(!r)return;if(!confirm(`${revLabel(r)} (${revTime(r.time)}) 상태로 되돌립니다.\n지금 상태는 먼저 리비전으로 기록되어 언제든 돌아올 수 있습니다.`))return;
  await revRecord({cause:`${revLabel(r)} 복원 전 자동 기록`});
  let st;try{st=await revState(id,true);}catch(e){toast(e.message);return;}
  const B=st.board;if(!B){toast('이 리비전에는 보드가 없습니다.');return;}B.pid=REV.pid;
  setBoard(B);
  if(st.np){NP.plan=st.np.plan||null;NP.arch=st.np.arch||null;NP.answers=st.np.answers||{};NP.vkey=st.np.vkey||null;NP.picked=st.np.picked||null;const n=$('#npName'),q=$('#npReq');if(n)n.value=st.np.name||'';if(q)q.value=st.np.req||'';
    try{if(typeof npRender==='function')npRender();if(typeof sysRender==='function')sysRender();}catch(e){console.warn(e);}}
  if(st.hsis){HS.H=st.hsis;HS.res=null;try{hsisRun();}catch(e){console.warn(e);}}
  if(st.mb&&typeof MB!=='undefined'&&st.mb.boards&&st.mb.boards.every(b=>MB.boards.some(x=>x.id===b.id))){MB.name=st.mb.name||'';MB.links=st.mb.links||[];st.mb.boards.forEach(b=>{const x=MB.boards.find(y=>y.id===b.id);if(x)x.role=b.role||'';});if(typeof mbPaint==='function')mbPaint();}
  try{if(typeof stepPaint==='function')stepPaint();refresh(true);if(typeof cadRefresh==='function')cadRefresh();}catch(e){}
  await revRecord({kind:'restore',cause:`${revLabel(r)} 복원`});REV.a=id;REV.b='cur';revRender();toast(`${revLabel(r)}(으)로 되돌렸습니다.`);}
/* ---- export / import of the whole history ---- */
async function revExport(){if(!REV.list.length)return toast('기록이 없습니다.');const revs=[];for(const r of REV.list){const raw=await revRaw(r.id);if(raw)revs.push(Object.assign({},r,{snap:JSON.parse(raw)}));}
  const doc={format:'aod-revisions',v:1,pid:REV.pid,project:BD&&BD.name,exported:new Date().toISOString(),revisions:revs};
  return expSave(`${expName()}_revisions.json`,JSON.stringify(doc),'application/json',`리비전 ${revs.length}개를 JSON으로 내려받았습니다. 설계 파일과 함께 Git에 커밋하면 이력이 함께 남습니다.`);}
async function revImport(text,fname){let doc;try{doc=JSON.parse(text);}catch(e){return toast('JSON을 읽지 못했습니다.');}
  if(!doc||doc.format!=='aod-revisions'||!Array.isArray(doc.revisions))return toast('리비전 기록 파일이 아닙니다 (format: aod-revisions).');
  const pid=doc.pid||'f-'+revSlug(doc.project||fname);const ex=await revMetas(pid);const have=new Set(ex.map(m=>m.id));let n=0;let maxN=ex.reduce((m,r)=>Math.max(m,r.n),0);const merge=ex.length>0;
  // into an existing history: append after it, renumbered, keeping the file's own number as "가져옴 rN"
  for(const r of doc.revisions.slice().sort((x,y)=>x.n-y.n)){if(!r.snap)continue;const meta=Object.assign({},r);delete meta.snap;meta.pid=pid;if(have.has(meta.id))continue;
    if(merge){meta.orig=r.n;meta.n=++maxN;meta.id=`${pid}#${meta.n}#${Date.now().toString(36)}${n}`;meta.cause=`가져옴 r${r.n}${r.cause?' · '+r.cause:''}`;}
    await revPut(meta,await revPack(JSON.stringify(r.snap)));n++;}
  toast(`리비전 ${n}개를 불러왔습니다${doc.revisions.length-n?` (이미 있던 ${doc.revisions.length-n}개 제외)`:''}.`);
  if(pid===REV.pid){await revSwitch(pid);REV.bdRef=BD;REV.sig=revSig();revRender();revBadge();return;}
  if(!confirm(`다른 프로젝트(${doc.project||pid})의 기록입니다. 마지막 리비전을 열까요?`))return;
  await revSwitch(pid);const top=REV.list[REV.list.length-1];if(!top)return;const st=await revState(top.id,true);st.board.pid=pid;REV.nextCause=null;
  setBoard(st.board);if(st.np){NP.plan=st.np.plan||null;NP.arch=st.np.arch||null;const nm=$('#npName'),q=$('#npReq');if(nm)nm.value=st.np.name||'';if(q)q.value=st.np.req||'';}if(st.hsis){HS.H=st.hsis;HS.res=null;try{hsisRun();}catch(e){}}
  if(typeof APP!=='undefined'&&APP.mode==='home')setMode('viewer');REV.bdRef=BD;REV.sig=revSig();REV.a=REV.list.length>1?REV.list[REV.list.length-2].id:top.id;REV.b=top.id;openRevisions();}
/* ---- compare ---- */
async function revPair(){const get=async k=>k==='cur'?revLive():revState(k);if(REV.a==null||REV.b==null)return null;return[await get(REV.a),await get(REV.b)];}
const rvT=(head,rows,cls)=>rows.length?`<table class="stbl rv-t ${cls||''}"><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${r._c||''}">${(r.c||r).map(c=>`<td>${esc(c==null?'':c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'';
const rvNone='<p class="lead">바뀐 것이 없습니다.</p>';
const rvMeta=k=>k==='cur'?null:REV.list.find(r=>r.id===k);
async function revCompareRender(){const host=$('#rvCmp');if(!host)return;if(REV.a==null||REV.b==null){host.innerHTML='<p class="lead">비교할 두 리비전(A, B)을 고르세요. 기록이 하나뿐이면 설계를 바꾼 뒤 현재와 비교할 수 있습니다.</p>';return;}
  let pair;try{pair=await revPair();}catch(e){host.innerHTML=`<p class="errline">${esc(e.message)}</p>`;return;}
  const[A,B]=pair;const d=REVLOG.compare(A,B);REV.cmp={A,B,d};const c=d.counts;const ma=rvMeta(REV.a),mb=rvMeta(REV.b);
  const tabs=[['sum','요약',c.board],['bom','부품',c.bom],['place','배치',c.place],['nets','넷',c.nets+c.pins],['pcb','PCB 겹쳐 보기',c.layers],['arch','다이어그램·계획',c.arch+c.plan],['hsis','HSIS',c.hsis],['housing','기구',c.housing]];
  host.innerHTML=`<div class="rv-h"><span class="rv-ab-l a">A</span><b>${esc(revLabel(ma||'cur'))}</b><span class="rv-arr">→</span><span class="rv-ab-l b">B</span><b>${esc(revLabel(mb||'cur'))}</b><span class="rv-sum">${esc(d.summary)}</span><span class="cop-sp"></span><button type="button" class="btn sm" data-rv="xlsx" title="비교 결과를 엑셀로">Excel</button></div>
  <div class="rv-tabs" role="tablist">${tabs.map(([k,l,n])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${REV.tab===k}">${l}${n?` <span class="rv-cnt">${n}</span>`:''}</button>`).join('')}</div><div class="rv-pane" id="rvPane"></div>`;
  const P=$('#rvPane');const db=d.board;
  if(REV.tab==='sum'){const sa=A.board?REVLOG.stats(A.board,A):null,sb=B.board?REVLOG.stats(B.board,B):null;
    const row=(k,f,u)=>{const a=sa?f(sa):'',b=sb?f(sb):'';const dd=typeof a==='number'&&typeof b==='number'&&a!==b?(b-a>0?'+':'')+(+(b-a).toFixed(2)):'';return{c:[k,a+(u||''),b+(u||''),dd],_c:String(a)!==String(b)?'chg':''};};
    P.innerHTML=`${rvT(['항목','A','B','변화'],[row('크기',s=>`${s.W} × ${s.H}`,' mm'),row('동박 층',s=>s.layers),row('부품',s=>s.comps),row('넷',s=>s.nets),row('비아',s=>s.vias),row('트랙',s=>s.tracks),row('트랙 길이',s=>s.len,''),row('시스템 블록',s=>s.blocks),row('HSIS 신호',s=>s.hsis),row('회로 안',s=>s.variant||'—'),row('PCB 배치',s=>s.pcb?'됨':'아직')])}
      <div class="rv-chips">${tabs.slice(1).map(([k,l,n])=>`<button type="button" class="pill${n?' on':''}" data-tab="${k}">${l} ${n}</button>`).join('')}</div>
      ${[ma,mb].map((m,i)=>m?`<p class="rv-mt"><b>${i?'B':'A'} · ${esc(revLabel(m))}</b> ${new Date(m.time).toLocaleString('ko-KR')}${m.where?' · '+esc(m.where):''}${m.cause?`<br>${esc(m.cause)}`:''}${m.note?`<br>📝 ${esc(m.note)}`:''}</p>`:`<p class="rv-mt"><b>${i?'B':'A'} · 현재</b> 아직 기록되지 않은 지금 상태</p>`).join('')}`;}
  else if(REV.tab==='bom'){const r=db.bom;P.innerHTML=(r.added.length+r.removed.length+r.changed.length)?`${r.added.length?`<h4 class="add">추가 ${r.added.length}</h4>${rvT(['참조','값','풋프린트','부품 번호','면'],r.added.map(x=>[x.ref,x.val,x.fp,x.mpn,x.side]),'add')}`:''}
      ${r.removed.length?`<h4 class="rem">삭제 ${r.removed.length}</h4>${rvT(['참조','값','풋프린트','부품 번호','면'],r.removed.map(x=>[x.ref,x.val,x.fp,x.mpn,x.side]),'rem')}`:''}
      ${r.changed.length?`<h4 class="chg">바뀜 ${r.changed.length}</h4>${rvT(['참조','항목','A','B'],r.changed.flatMap(x=>x.fields.map(f=>[x.ref,{val:'값',fp:'풋프린트',mpn:'부품 번호'}[f],x.a[f],x.b[f]])))}`:''}`:rvNone;}
  else if(REV.tab==='place'){P.innerHTML=db.place.length?rvT(['참조','Δx mm','Δy mm','거리 mm','회전 A→B','면 A→B'],db.place.map(x=>[x.ref,x.dx,x.dy,x.dist,x.rot[0]===x.rot[1]?x.rot[0]:`${x.rot[0]} → ${x.rot[1]}`,x.side[0]===x.side[1]?x.side[0]:`${x.side[0]} → ${x.side[1]}`])):rvNone;}
  else if(REV.tab==='nets'){const n=db.nets;P.innerHTML=(c.nets+c.pins)?`${db.pins.length?`<h4 class="chg">핀 넷 바뀜 ${db.pins.length}</h4>${rvT(['핀','A 넷','B 넷'],db.pins.map(x=>[x.pin,x.a||'(없음)',x.b||'(없음)']))}`:''}
      ${n.added.length?`<h4 class="add">새 넷 ${n.added.length}</h4>${rvT(['넷','핀'],n.added.map(x=>[x.net,x.pins.join(' ')]),'add')}`:''}${n.removed.length?`<h4 class="rem">없어진 넷 ${n.removed.length}</h4>${rvT(['넷','핀'],n.removed.map(x=>[x.net,x.pins.join(' ')]),'rem')}`:''}
      ${n.changed.length?`<h4 class="chg">연결 바뀐 넷 ${n.changed.length}</h4>${rvT(['넷','더해진 핀','빠진 핀'],n.changed.map(x=>[x.net,x.add.join(' '),x.rem.join(' ')]))}`:''}`:rvNone;}
  else if(REV.tab==='pcb'){const ks=[...new Set([...(A.board?REVLOG.cuKeysOf(A.board):[]),...(B.board?REVLOG.cuKeysOf(B.board):[])])];if(!ks.includes(REV.layer))REV.layer=ks[0]||'T';
    P.innerHTML=`<div class="rv-ov-h"><label>동박 층 <select id="rvLayer">${ks.map(k=>`<option value="${k}"${k===REV.layer?' selected':''}>${esc(PCB.cuName(k))}${db.layers.some(l=>l.layer===k)?' ●':''}</option>`).join('')}</select></label>
      <span class="rv-leg"><i class="same"></i>같음 <i class="rem"></i>A에만 (없어짐) <i class="add"></i>B에만 (새로 생김)</span><span class="cop-sp"></span><button type="button" class="btn sm" data-rv="fit">화면 맞춤</button></div>
      <div class="rv-ov"><canvas id="rvCv" aria-label="두 리비전의 동박 겹쳐 보기"></canvas></div>
      ${db.layers.length?rvT(['층','A 트랙','B 트랙','A 존','B 존','A 길이 mm','B 길이 mm'],db.layers.map(l=>[PCB.cuName(l.layer),l.a?l.a.tracks:'—',l.b?l.b.tracks:'—',l.a?l.a.zones:'—',l.b?l.b.zones:'—',l.a?l.a.len:'—',l.b?l.b.len:'—'])):''}
      <p class="lead">위에서 본 모습입니다(BOTTOM·내층 포함). 휠 확대 · 드래그 이동 · 더블클릭 맞춤.</p>`;revOverlayBind();revPaintOverlay();}
  else if(REV.tab==='arch'){const a=d.arch,p=d.plan;let h='';if(p.req)h+=`<h4 class="chg">요구사항</h4><div class="rv-req"><div><b>A</b><pre>${esc(p.req[0]||'(없음)')}</pre></div><div><b>B</b><pre>${esc(p.req[1]||'(없음)')}</pre></div></div>`;
    if(a.added.length)h+=`<h4 class="add">새 블록 ${a.added.length}</h4>${rvT(['블록','그룹','기능'],a.added.map(b=>[b.label,b.group,(b.feats||[]).join(', ')]),'add')}`;
    if(a.removed.length)h+=`<h4 class="rem">없어진 블록 ${a.removed.length}</h4>${rvT(['블록','그룹','기능'],a.removed.map(b=>[b.label,b.group,(b.feats||[]).join(', ')]),'rem')}`;
    if(a.changed.length)h+=`<h4 class="chg">바뀐 블록 ${a.changed.length}</h4>${rvT(['블록','항목','A','B'],a.changed.flatMap(x=>x.fields.map(f=>[x.name,f,[].concat(x.a[f]||[]).join(', '),[].concat(x.b[f]||[]).join(', ')])))}`;
    if(a.links.added.length||a.links.removed.length)h+=`<h4 class="chg">연결</h4>${rvT(['구분','연결'],[...a.links.added.map(x=>({c:['추가',x],_c:'add'})),...a.links.removed.map(x=>({c:['삭제',x],_c:'rem'}))])}`;
    const pj=o=>Object.entries(o||{}).map(([k,v])=>`${k}=${typeof v==='object'?JSON.stringify(v):v}`).join(' ');
    if(p.added.length||p.removed.length||p.changed.length)h+=`<h4 class="chg">회로 계획 블록</h4>${rvT(['구분','블록','파라미터'],[...p.added.map(x=>({c:['추가',`${x.id} (${x.type})`,pj(x.p)],_c:'add'})),...p.removed.map(x=>({c:['삭제',`${x.id} (${x.type})`,pj(x.p)],_c:'rem'})),...p.changed.map(x=>({c:['바뀜',`${x.id} (${x.type})`,`${pj(x.a)} → ${pj(x.b)}`]}))])}`;
    P.innerHTML=h||rvNone;}
  else if(REV.tab==='hsis'){const x=d.hsis;P.innerHTML=(x.added.length+x.removed.length+x.changed.length)?`${x.added.length?`<h4 class="add">새 신호 ${x.added.length}</h4>${rvT(['ID','신호','분류','핀','넷'],x.added.map(i=>[i.id,i.signal||i.name,i.cat,i.pins||i.pin,i.net]),'add')}`:''}
      ${x.removed.length?`<h4 class="rem">없어진 신호 ${x.removed.length}</h4>${rvT(['ID','신호','분류','핀','넷'],x.removed.map(i=>[i.id,i.signal||i.name,i.cat,i.pins||i.pin,i.net]),'rem')}`:''}
      ${x.changed.length?`<h4 class="chg">바뀐 신호 ${x.changed.length}</h4>${rvT(['ID','항목','A','B'],x.changed.flatMap(i=>i.fields.map(f=>[i.id,f,i.a[f],i.b[f]])))}`:''}`:rvNone;}
  else if(REV.tab==='housing'){const x=d.housing;const fl=f=>typeof HOUSING!=='undefined'?HOUSING.featLabel(Object.assign({},f,{id:''})).trim():f.type;
    P.innerHTML=c.housing?`${x.inp.length?`<h4 class="chg">설계 조건</h4>${rvT(['항목','A','B'],x.inp)}`:''}${x.over.length?`<h4 class="chg">형상 지정값</h4>${rvT(['항목','A','B'],x.over.map(([k,a,b])=>[TEXT2CAD.OVER[k]||k,a,b]))}`:''}
      ${x.edge.length?`<h4 class="chg">모서리 처리</h4>${rvT(['모서리','A','B'],x.edge.map(([k,a,b])=>[TEXT2CAD.EDGE_KO&&TEXT2CAD.EDGE_KO[k]||k,a,b]))}`:''}
      ${x.feats.added.length?`<h4 class="add">추가 형상 ${x.feats.added.length}</h4>${rvT(['ID','형상'],x.feats.added.map(f=>[f.id,fl(f)]),'add')}`:''}${x.feats.removed.length?`<h4 class="rem">없어진 형상 ${x.feats.removed.length}</h4>${rvT(['ID','형상'],x.feats.removed.map(f=>[f.id,fl(f)]),'rem')}`:''}
      ${x.feats.changed.length?`<h4 class="chg">바뀐 형상 ${x.feats.changed.length}</h4>${rvT(['ID','A','B'],x.feats.changed.map(f=>[f.id,fl(f.a),fl(f.b)]))}`:''}`:rvNone;}}
/* ---- copper overlay: same geometry grey, only in A red, only in B green ---- */
const rvGeo=p=>{const r=v=>(+v).toFixed(2);if(p.t==='seg')return`s${r(p.a[0])},${r(p.a[1])},${r(p.b[0])},${r(p.b[1])},${r(p.w)}`;if(p.t==='path')return`p${p.pts.map(q=>r(q[0])+','+r(q[1])).join(';')},${r(p.w)}`;
  if(p.t==='pad')return`d${r(p.x)},${r(p.y)},${r(p.w)},${r(p.h)},${p.shape},${r(p.ang||0)}`;if(p.t==='poly')return`z${p.rings.map(g=>g.length+':'+r(g[0][0])+','+r(g[0][1])).join(';')}`;if(p.t==='circle')return`c${r(p.x)},${r(p.y)},${r(p.r)}`;if(p.t==='pour')return`P${p.net},${r(p.inset)}`;return p.t+JSON.stringify(p).length;};
function revClassify(LA,LB){const cnt=new Map();LA.forEach(p=>{if(p.clear)return;const k=rvGeo(p);cnt.set(k,(cnt.get(k)||0)+1);});const same=[],add=[],cb=new Map();
  LB.forEach(p=>{if(p.clear)return;const k=rvGeo(p);const n=cnt.get(k)||0;if(n>0){cnt.set(k,n-1);same.push(p);cb.set(k,(cb.get(k)||0)+1);}else add.push(p);});
  const rem=[];LA.forEach(p=>{if(p.clear)return;const k=rvGeo(p);const n=cb.get(k)||0;if(n>0)cb.set(k,n-1);else rem.push(p);});return{same,add,rem};}
function revPaintOverlay(){const cv=$('#rvCv');if(!cv||!REV.cmp)return;const{A,B}=REV.cmp;const r=cv.getBoundingClientRect();if(!r.width)return;const dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  const W=Math.max(A.board?A.board.W:0,B.board?B.board.W:0)||10,H=Math.max(A.board?A.board.H:0,B.board?B.board.H:0)||10;
  if(!REV.view){const s=Math.min((r.width-24)/W,(r.height-24)/H);REV.view={s,ox:(r.width-W*s)/2,oy:(r.height-H*s)/2,W,H};}const V=REV.view;
  const c=cv.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);c.setTransform(dpr*V.s,0,0,-dpr*V.s,dpr*V.ox,dpr*(V.oy+V.H*V.s));c.lineCap='round';c.lineJoin='round';
  const ring=(Bd,fill,stroke,dash)=>{if(!Bd||!Bd.outline||!Bd.outline.length)return;c.beginPath();Bd.outline.forEach(g=>{c.moveTo(g[0][0],g[0][1]);for(let i=1;i<g.length;i++)c.lineTo(g[i][0],g[i][1]);c.closePath();});if(fill){c.fillStyle=fill;c.fill('evenodd');}if(stroke){c.setLineDash(dash?[1.2,0.8]:[]);c.strokeStyle=stroke;c.lineWidth=Math.max(0.12,1.4/V.s);c.stroke();c.setLineDash([]);}};
  ring(B.board,'#1c2420',null);
  const k=REV.layer+'.cu',LA=A.board&&A.board.layers[k]||[],LB=B.board&&B.board.layers[k]||[];const thru=Bd=>Bd&&REV.layer!=='T'&&REV.layer!=='B'?Bd.layers['T.cu'].filter(p=>p.t==='pad'&&(p.side==='both'||p.drill)):[];
  const C=revClassify(LA.concat(thru(A.board)),LB.concat(thru(B.board)));
  const draw=(ps,col,al)=>{c.save();ps.forEach(p=>{if(p.t!=='pour')return;c.globalAlpha=al*0.22;ring(B.board,col,null);});c.globalAlpha=al;drawPrims(c,ps.filter(p=>p.t!=='pour'),()=>col);c.restore();};
  draw(C.same,'#8a9690',0.55);draw(C.rem,'#ff5a5f',0.9);draw(C.add,'#3ddc84',0.9);
  const vk=v=>`${(+v.x).toFixed(2)},${(+v.y).toFixed(2)}`;const va=new Set((A.board?A.board.vias:[]).map(vk)),vb=new Set((B.board?B.board.vias:[]).map(vk));
  (A.board?A.board.vias:[]).forEach(v=>{c.fillStyle=vb.has(vk(v))?'#8a9690':'#ff5a5f';c.beginPath();c.arc(v.x,v.y,v.d/2,0,Math.PI*2);c.fill();});(B.board?B.board.vias:[]).forEach(v=>{if(va.has(vk(v)))return;c.fillStyle='#3ddc84';c.beginPath();c.arc(v.x,v.y,v.d/2,0,Math.PI*2);c.fill();});
  const sameOutline=A.board&&B.board&&JSON.stringify(A.board.outline)===JSON.stringify(B.board.outline);ring(B.board,null,sameOutline?'#c9d1cc':'#3ddc84',false);if(!sameOutline)ring(A.board,null,'#ff5a5f',true);}
function revOverlayBind(){const cv=$('#rvCv');if(!cv||cv.dataset.b)return;cv.dataset.b='1';let drag=null;
  cv.addEventListener('wheel',e=>{e.preventDefault();const V=REV.view;if(!V)return;const r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;const f=Math.exp(-e.deltaY*0.0015);const ns=Math.max(0.5,Math.min(400,V.s*f));const k=ns/V.s;V.ox=px-(px-V.ox)*k;V.oy=py-(py-V.oy)*k;V.s=ns;revPaintOverlay();},{passive:false});
  cv.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId);});cv.addEventListener('pointermove',e=>{if(!drag||!REV.view)return;REV.view.ox+=e.clientX-drag[0];REV.view.oy+=e.clientY-drag[1];drag=[e.clientX,e.clientY];revPaintOverlay();});
  cv.addEventListener('pointerup',()=>{drag=null;});cv.addEventListener('dblclick',()=>{REV.view=null;revPaintOverlay();});
  new ResizeObserver(()=>{REV.view=null;revPaintOverlay();}).observe(cv);}
/* ---- compare → Excel ---- */
function revCompareAoa(){if(!REV.cmp)return[];const{d}=REV.cmp,b=d.board,la=revLabel(rvMeta(REV.a)||'cur'),lb=revLabel(rvMeta(REV.b)||'cur');const it=[];
  it.push({name:'요약',aoa:[['A',la],['B',lb],['요약',d.summary],[],['항목','A','B'],...b.board,[],['구분','개수'],...Object.entries(d.counts)]});
  it.push({name:'부품 변경',aoa:[['구분','참조','값 A','값 B','풋프린트 A','풋프린트 B','부품 번호 A','부품 번호 B'],...b.bom.added.map(x=>['추가',x.ref,'',x.val,'',x.fp,'',x.mpn]),...b.bom.removed.map(x=>['삭제',x.ref,x.val,'',x.fp,'',x.mpn,'']),...b.bom.changed.map(x=>['바뀜',x.ref,x.a.val,x.b.val,x.a.fp,x.b.fp,x.a.mpn,x.b.mpn])]});
  it.push({name:'배치 변경',aoa:[['참조','Δx','Δy','거리','회전 A','회전 B','면 A','면 B'],...b.place.map(x=>[x.ref,x.dx,x.dy,x.dist,x.rot[0],x.rot[1],x.side[0],x.side[1]])]});
  it.push({name:'넷 변경',aoa:[['구분','넷','더해진 핀','빠진 핀'],...b.nets.added.map(x=>['새 넷',x.net,x.pins.join(' '),'']),...b.nets.removed.map(x=>['없어짐',x.net,'',x.pins.join(' ')]),...b.nets.changed.map(x=>['바뀜',x.net,x.add.join(' '),x.rem.join(' ')]),[],['핀','A 넷','B 넷'],...b.pins.map(x=>[x.pin,x.a,x.b])]});
  it.push({name:'다이어그램',aoa:[['구분','블록/연결'],...d.arch.added.map(x=>['새 블록',x.label]),...d.arch.removed.map(x=>['없어진 블록',x.label]),...d.arch.changed.map(x=>['바뀐 블록',x.name]),...d.arch.links.added.map(x=>['새 연결',x]),...d.arch.links.removed.map(x=>['없어진 연결',x])]});
  it.push({name:'HSIS',aoa:[['구분','ID','항목','A','B'],...d.hsis.added.map(x=>['추가',x.id,'',''  ,x.signal||'']),...d.hsis.removed.map(x=>['삭제',x.id,'',x.signal||'','']),...d.hsis.changed.flatMap(x=>x.fields.map(f=>['바뀜',x.id,f,x.a[f],x.b[f]]))]});
  it.push({name:'기구',aoa:[['구분','항목','A','B'],...d.housing.inp.map(x=>['조건',...x]),...d.housing.over.map(x=>['지정값',...x]),...d.housing.edge.map(x=>['모서리',...x]),...d.housing.feats.added.map(f=>['추가 형상',f.id,'',f.type]),...d.housing.feats.removed.map(f=>['삭제 형상',f.id,f.type,'']),...d.housing.feats.changed.map(f=>['바뀐 형상',f.id,JSON.stringify(f.a),JSON.stringify(f.b)])]});
  return it.filter(x=>x.aoa.length>1);}
function revCompareXlsx(){const a=revLabel(rvMeta(REV.a)||'cur').replace(/\s+/g,'_'),b=revLabel(rvMeta(REV.b)||'cur').replace(/\s+/g,'_');return exportXlsx(revCompareAoa(),`${expName()}_compare_${a}_${b}.xlsx`,'비교 결과를 엑셀로 내려받았습니다.');}
// the revision table, for the design report and the design workbook
function revAoa(){return[['리비전','이름','단계','시각','위치','변경 요약','원인','메모','부품','넷','층'],...REV.list.map(r=>[`r${r.n}`,r.label,r.stage,new Date(r.time).toLocaleString('ko-KR'),r.where||'',r.summary,r.cause,r.note,r.stats&&r.stats.comps,r.stats&&r.stats.nets,r.stats&&r.stats.layers])];}
{const b=$('#revBtn');if(b)b.addEventListener('click',openRevisions);}
