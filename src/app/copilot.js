/* ---------- AI 코파일럿 분할: 설계 도우미 + 오른쪽 도킹 패널 + 고정 패널 새 창 ----------
   - The four step consoles (1 시스템 · 2 회로 · 3 PCB · 4 기구) keep their own command engines. Their output is painted here as one
     conversation, tagged with the step it came from; what the user types goes to the console of the current step (or the one picked
     in the header). After a run that changed the design, a card offers to keep it or to undo exactly those steps.
   - The right dock holds 설계 도우미 · 정보 · 시뮬레이션.
   - Every fixed panel (도우미, 정보·시뮬레이션, 레이어, 1·4단계 side panels, HSIS panels) can move into its own browser window — or a
     floating window when pop-ups are blocked — and stays live: the panel's own DOM moves, so its handlers and state are shared, and
     $ / $$ also search the panel windows. Closing that window (or "메인 창으로") puts the panel back where it was. */
var COP={log:[],seq:0,src:'auto',hist:[],hi:-1,tab:'ai',shown:'ai',pending:null,chipsFor:null};
const COP_SRC={np:{n:1,label:'시스템',con:'시스템 설계'},sch:{n:2,label:'회로',con:'회로도'},pcb:{n:3,label:'PCB',con:'배치·배선'},cad:{n:4,label:'기구',con:'하우징 Text-to-CAD'}};
const COP_HINT={np:'요구사항이나 질문 — 예: 12V 입력 CAN 센서 노드, STM32, LED 1개 · 8층으로 해줘 · plan',
  sch:'회로 명령이나 질문 — 예: U4 전원 핀에 100nF 달아줘 · pins U1 --free · erc',
  pcb:'배치·배선 명령이나 질문 — 예: 8층으로 바꾸고 크기를 최소화해줘 · 왜 미배선이 남았어? · route',
  cad:'하우징 명령이나 질문 — 예: 오른쪽 벽에 M16 글랜드 2개 · set ip IP67 · compare'};
const NP_CHIPS=[['계획 요약','plan','현재 계획을 요약하고 빠진 블록과 경고를 알려줘'],['다이어그램 검토','diagram','HW 블록 다이어그램을 검토하고 개선할 점을 알려줘'],
  ['회로 생성','generate','다이어그램의 블록으로 회로를 생성해줘'],['도움말','help','이 단계에서 할 수 있는 일을 짧게 알려줘']];
const copChips=src=>src==='pcb'?CLI_CHIPS:src==='sch'?SC_CHIPS:src==='cad'?CAD_CHIPS:NP_CHIPS;
function copActive(){if(COP.src!=='auto')return COP.src;const w=HS.ws;return w==='sys'?'np':w==='cad'?'cad':w==='board'&&S.sch==='full'?'sch':'pcb';}
const COP_EXEC={np:l=>npExec(l),sch:l=>scExec(l),pcb:l=>cliExec(l),cad:l=>cadExec(l)};
// undo stacks per console: the change card undoes exactly the steps a run added
const COP_UNDO={np:()=>NP.hist,sch:()=>SE.undo,pcb:()=>PE.undo,cad:()=>BD&&BD.housing&&BD.housing.undo||[]};
const COP_DO_UNDO={np:()=>npRun('undo'),sch:()=>{seAction('undo');renderSchOv();},pcb:()=>peUndo(),cad:()=>cadRunCmd('undo')};
const copBusyAny=()=>[CLI,SCLI,NP,CADC].some(s=>s&&s.busy);
function copMark(src){const u=COP_UNDO[src]();return{u,n:u.length,top:u[u.length-1]};}
function copDiff(src,m){const u=COP_UNDO[src]();if(u!==m.u||!u.length)return 0;if(u.length>m.n)return u.length-m.n;
  if(u[u.length-1]===m.top)return 0;const i=u.indexOf(m.top);return i>=0?u.length-1-i:u.length;}

/* ---- conversation ---- */
function copFill(d,e){
  const t=String(e.t==null?'':e.t),k=e.k,S0=COP_SRC[e.src];
  const tag=e.newSrc&&S0?`<span class="cp-src">${S0.n} ${esc(S0.label)}</span>`:'';
  if(k==='cmd'&&e.user){d.className='cp cp-user';d.innerHTML=tag+`<div class="cp-b">${esc(t.replace(/\s+\(AI 모드\)\s*$/,''))}</div>`;return;}
  if(k==='cmd'){const ai=/\(Claude\)\s*$/.test(t);d.className='cp cp-tool'+(ai?' ai':'');
    d.innerHTML=tag+`<code>${esc(t.replace(/\s+\((Claude|AI 모드)\)\s*$/,''))}</code>${ai?'<span class="cp-by">Claude 실행</span>':''}`;return;}
  if(k==='ok'){const L=t.split('\n');d.className='cp cp-ok';
    d.innerHTML=tag+(L.length>9?`<details><summary><span>${esc(L[0].slice(0,140))}</span><em>${L.length}줄</em></summary><pre>${esc(L.slice(1).join('\n'))}</pre></details>`:`<pre>${esc(t)}</pre>`);return;}
  if(k==='ai'){d.className='cp cp-ai';d.innerHTML=tag+`<div class="cp-b">${esc(t)}</div>`;return;}
  if(k==='use'){d.className='cp cp-use';d.innerHTML=tag+esc(t);return;}
  if(k==='err'){d.className='cp cp-err';d.innerHTML=tag+esc(t);return;}
  if(k==='chg'){d.className='cp cp-chg';
    const msg=e.state==='undone'?`되돌렸습니다 (${e.n}단계).`:e.state==='kept'?`${S0?S0.label+' ':''}변경 ${e.n}단계를 유지했습니다.`
      :e.state==='stale'?'그 뒤에 다른 변경이 있어 여기서는 되돌릴 수 없습니다. 실행 취소(Ctrl+Z)로 한 단계씩 되돌리세요.'
      :`${e.by==='ai'?'Claude가 ':''}${S0?S0.label+' ':''}설계를 ${e.n}단계 바꿨습니다.`;
    if(e.cr&&e.cr.total){d.className+=' cp-cr'+(e.state==='open'?' open':'');const title=e.state==='open'?`변경 요청 · ${e.by==='ai'?'Claude':'직접 실행'} · ${e.n}건`:e.state==='kept'?`변경 승인${e.rev?' · '+esc(e.rev):''}`:e.state==='undone'?'되돌림':'변경 (되돌리기 불가)';
      d.innerHTML=tag+`<div class="cr-h"><b>${title}</b>${e.req?`<span class="cr-q">${esc(e.req.slice(0,80))}</span>`:''}</div>`+(typeof nxCrHTML==='function'?nxCrHTML(e):'')+(e.state==='open'?`<span class="cp-acts"><button type="button" class="btn primary sm" data-approve="${e.cid}">승인 · 리비전 기록</button><button type="button" class="btn sm" data-cmp="${e.cid}">겹쳐 보기</button><button type="button" class="btn sm" data-undo="${e.cid}">되돌리기</button></span>`:'');return;}
    d.innerHTML=tag+`<span class="cp-msg">${msg}</span>`+(e.state==='open'?`<span class="cp-acts"><button type="button" class="btn sm" data-keep="${e.cid}">유지</button><button type="button" class="btn sm" data-undo="${e.cid}">되돌리기</button></span>`:'');return;}
  if(k==='ask'){d.className='cp cp-ask'+(e.state==='open'?' open':'');const sel=e.sel||[];
    if(e.state!=='open'){d.innerHTML=tag+`<div class="ask-q">${esc(e.q)}</div><div class="ask-a">${e.answer==null?'건너뜀 (기본값)':'→ '+esc(e.answer)}</div>`;return;}
    d.innerHTML=tag+`<div class="ask-q">${esc(e.q)}</div>${e.why?`<div class="ask-w">${esc(e.why)}</div>`:''}
      <div class="ask-o">${(e.opts||[]).map((o,i)=>`<button type="button" class="pill vbtn${sel.includes(i)?' on':''}" data-opt="${i}">${esc(o)}</button>`).join('')}</div>
      <div class="ask-f"><input type="text" placeholder="${e.multi?'직접 적기 (여러 개면 , 로 구분)':'직접 적기'}" aria-label="답"><button type="button" class="btn primary sm" data-ok>${e.multi?'선택 완료':'보내기'}</button><button type="button" class="btn sm" data-skip>건너뛰기</button></div>`;return;}
  if(k==='html'){d.className='cp cp-html'+(e.cls?' '+e.cls:'');d.innerHTML=tag+t;return;}
  d.className='cp cp-out';d.innerHTML=tag+esc(t);}
/* a question to the user (step 1 requirement analysis): resolves with the answer text, or null when skipped */
function copAsk(q){return new Promise(res=>{const e={k:'ask',t:q.q,q:q.q,why:q.why,opts:q.opts||[],multi:!!q.multi,state:'open',sel:[],res};COP.ask=e;copPaint(COP.askSrc||'np',e);copBusyPaint();copFocus();
  setTimeout(()=>{const L=$('#copLog');const d=L&&L.querySelector(`[data-cid="${e.cid}"] input`);if(d)d.focus();},30);});}
function copAnswer(e,val){if(!e||e.state!=='open')return;e.state='done';e.answer=val;COP.ask=null;copPaint(e.src,e,true);copBusyPaint();const r=e.res;e.res=null;if(r)r(val);}
function copAskClick(d,e,b){const i=+b.dataset.opt;const inp=d.querySelector('input');
  if(b.dataset.opt!=null){if(e.multi){const k=e.sel.indexOf(i);if(k>=0)e.sel.splice(k,1);else e.sel.push(i);copPaint(e.src,e,true);}else copAnswer(e,e.opts[i]);return;}
  if(b.hasAttribute('data-skip')){copAnswer(e,null);return;}
  if(b.hasAttribute('data-ok')){const txt=(inp&&inp.value.trim())||'';const parts=e.sel.map(k=>e.opts[k]).concat(txt?[txt]:[]);if(!parts.length){toast('답을 고르거나 적어 주세요.');return;}copAnswer(e,parts.join(', '));}}
function copNode(e,doc){const d=doc.createElement('div');d.dataset.cid=e.cid;copFill(d,e);return d;}
// called by every console's say/set: new entries join the log, updates repaint in place
function copPaint(src,e,upd){try{copPaint0(src,e,upd);}finally{if(typeof progNote==='function')progNote(e,upd);}}
function copPaint0(src,e,upd){
  if(!e.cid){e.cid=++COP.seq;e.src=src;
    if(e.k==='cmd'&&COP.pending!=null&&String(e.t).replace(/\s+\(AI 모드\)\s*$/,'').trim()===COP.pending){e.user=true;COP.pending=null;}
    const prev=COP.log[COP.log.length-1];e.newSrc=!prev||prev.src!==src;COP.log.push(e);if(COP.log.length>600)COP.log.shift();}
  const L=$('#copLog');if(!L)return;
  const near=L.scrollHeight-L.scrollTop-L.clientHeight<140;
  let d=L.querySelector(`[data-cid="${e.cid}"]`);
  if(d)copFill(d,e);else{d=copNode(e,L.ownerDocument);L.appendChild(d);while(L.children.length>600)L.firstChild.remove();}
  if(near||e.user||!upd)L.scrollTop=L.scrollHeight;}
function copDrop(e){if(typeof progDropNote==='function')progDropNote(e);COP.log=COP.log.filter(x=>x!==e);const L=$('#copLog');const d=L&&L.querySelector(`[data-cid="${e.cid}"]`);if(d)d.remove();}
function copClear(src){COP.log=src?COP.log.filter(x=>x.src!==src):[];copRebuild();}
function copRebuild(){const L=$('#copLog');if(!L)return;L.innerHTML='';let prev=null;COP.log.forEach(e=>{e.newSrc=!prev||prev.src!==e.src;prev=e;L.appendChild(copNode(e,L.ownerDocument));});L.scrollTop=L.scrollHeight;}
function copSay(k,t){copPaint('sys',{k,t});}
function copBusyPaint(){if(typeof progSync==='function')progSync();const b=copBusyAny();const ask=!!(COP.ask&&COP.ask.state==='open');const s=$('#copStop'),r=$('#copSend'),el=$('#copilot');if(s)s.hidden=!b;if(r)r.disabled=b&&!ask;if(el)el.classList.toggle('busy',b);}
async function copChg(cid,act){const e=COP.log.find(x=>x.cid===+cid);if(!e||e.state!=='open')return;
  if(act==='keep'){e.state='kept';copPaint(e.src,e,true);return;}
  if(copBusyAny()){toast('실행 중에는 되돌릴 수 없습니다.');return;}
  const u=COP_UNDO[e.src]();if(u!==e.u||u[u.length-1]!==e.after){e.state='stale';copPaint(e.src,e,true);return;}
  try{for(let i=0;i<e.n;i++)await COP_DO_UNDO[e.src]();e.state='undone';}catch(err){console.error(err);e.state='stale';}
  copPaint(e.src,e,true);}
// one message from the user: to the current step's console; a run that changed the design leaves a keep / undo card
async function copSubmit(text,opt){
  text=String(text||'').trim();if(!text)return;
  if(COP.ask&&COP.ask.state==='open'){copAnswer(COP.ask,text);return;}
  if(copBusyAny()){toast('실행 중입니다. 끝나거나 [중지]한 뒤 보내세요.');return;}
  let src=opt&&opt.src||copActive();
  if(src!=='np'&&!BD){copSay('err','보드가 없습니다. 1단계에서 회로를 만들거나 파일을 불러오세요.');return;}
  COP.hist.push(text);if(COP.hist.length>100)COP.hist.shift();COP.hi=COP.hist.length;
  COP.log.forEach(x=>{if(x.k==='chg'&&x.state==='open'){x.state='kept';copPaint(x.src,x,true);}});
  const m=copMark(src);const marks={};Object.keys(COP_UNDO).forEach(k=>{if(k!==src)try{marks[k]=copMark(k);}catch(e){}});COP.pending=text;const before=typeof nxCrBefore==='function'?nxCrBefore():null;const cid0=COP.seq;
  try{await COP_EXEC[src](text);}catch(err){console.error(err);copPaint(src,{k:'err',t:err&&err.message||String(err)});}
  finally{COP.pending=null;}
  let n=copDiff(src,m);let csrc=src;
  if(!n)for(const k in marks){const d=copDiff(k,marks[k]);if(d>0){n=d;csrc=k;break;}}
  if(n>0){src=csrc;const u=COP_UNDO[src]();const cmds=COP.log.filter(x=>x.cid>cid0&&x.k==='cmd'&&x.t).map(x=>String(x.t).replace(/\s+\(Claude\)$/,'').trim());const cr=typeof nxCrImpact==='function'?nxCrImpact(before):null;copPaint(src,{k:'chg',t:'',n,by:AIM.mode==='ai'?'ai':'user',state:'open',u,after:u[u.length-1],cr,cmds,req:text});}
  copBusyPaint();}
function copCtx(){
  if(!$('#copilot'))return;const src=copActive(),S0=COP_SRC[src];
  const c=$('#copCtx');if(c)c.textContent=`${COP.src==='auto'?'지금 단계':'고정'} · ${S0.n} ${S0.label} (${S0.con})`;
  const i=$('#copIn');if(i){i.placeholder=COP_HINT[src];i.dataset.mode=AIM.mode;}
  const key=src+'|'+AIM.mode;
  if(COP.chipsFor!==key){COP.chipsFor=key;const box=$('#copChips');
    if(box)box.innerHTML=copChips(src).map(([l,c,g],k)=>`<button type="button" class="pill vbtn" data-cchip="${k}" title="${esc(AIM.mode==='ai'?'AI 요청: '+g:'명령: '+c)}">${esc(l)}</button>`).join('');}
  const sel=$('#copSrc');if(sel&&sel.value!==COP.src)sel.value=COP.src;}
function copFocus(){
  if(LAY.dockOff){LAY.dockOff=false;saveLayout();}
  const P=PANELS.ai;if(P.out){if(P.win)try{P.win.focus();}catch(e){}}else{COP.tab='ai';dockPaint();}
  setTimeout(()=>{const i=$('#copIn');if(i)i.focus();},20);}
const SVG_POP='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>';
function copEnsure(){
  let el=$('#copilot');if(el)return el;
  el=document.createElement('section');el.id='copilot';el.className='copilot';el.setAttribute('aria-label','설계 도우미');
  el.innerHTML=`<div class="cop-h"><div class="cop-t"><b>설계 도우미</b><span class="cop-ctx" id="copCtx"></span></div><span class="cop-sp"></span>
      <label class="cop-src"><span class="sr">명령 대상</span><select id="copSrc" title="문장·명령을 보낼 단계 콘솔"><option value="auto">지금 단계</option>${Object.entries(COP_SRC).map(([k,v])=>`<option value="${k}">${v.n} ${v.label}</option>`).join('')}</select></label>
      <button type="button" class="dock-btn" id="copClr" title="대화 지우기" aria-label="대화 지우기"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg></button></div>
    <div class="cop-ctl">${aimControls()}</div>
    <div class="cop-log" id="copLog" role="log" aria-live="polite"></div>
    <div class="cop-chips" id="copChips" role="toolbar" aria-label="빠른 요청"></div>
    <form class="cop-in" id="copForm" autocomplete="off"><label class="sr" for="copIn">메시지</label><textarea id="copIn" rows="2" spellcheck="false"></textarea>
      <div class="cop-row"><span class="cop-k">Enter 보내기 · Shift+Enter 줄바꿈 · ↑ 이전</span><span class="cop-sp"></span><button type="button" class="btn sm" id="copStop" hidden>중지</button><button class="btn primary sm" id="copSend">보내기</button></div></form>`;
  const host=document.getElementById('dockBody');host.insertBefore(el,host.firstChild);
  const inp=el.querySelector('#copIn'),form=el.querySelector('#copForm');
  form.addEventListener('submit',e=>{e.preventDefault();const v=inp.value.trim();if(!v)return;if(COP.ask&&COP.ask.state==='open'){inp.value='';copAnswer(COP.ask,v);return;}if(copBusyAny()){toast('실행 중입니다. 끝나거나 [중지]한 뒤 보내세요.');return;}inp.value='';copSubmit(v);});
  inp.addEventListener('keydown',e=>{e.stopPropagation();
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();form.requestSubmit();return;}
    if(e.key==='ArrowUp'&&inp.selectionStart===0&&inp.selectionEnd===0&&COP.hi>0){COP.hi--;inp.value=COP.hist[COP.hi]||'';e.preventDefault();}
    else if(e.key==='ArrowDown'&&inp.selectionStart===inp.value.length&&COP.hi<COP.hist.length){COP.hi++;inp.value=COP.hist[COP.hi]||'';e.preventDefault();}
    else if(e.key==='Escape')inp.blur();});
  el.querySelector('#copStop').addEventListener('click',()=>[CLI,SCLI,NP,CADC].forEach(s=>{if(s&&s.busy){s.stopReq=true;if(s.abort)s.abort.abort();}}));
  el.querySelector('#copSrc').addEventListener('change',e=>{COP.src=e.target.value;copCtx();});
  el.querySelector('#copClr').addEventListener('click',()=>{COP.log=[];copRebuild();});
  el.querySelector('#copChips').addEventListener('click',e=>{const b=e.target.closest('[data-cchip]');if(!b||copBusyAny())return;const[,c,g]=copChips(copActive())[+b.dataset.cchip]||[];if(c)copSubmit(AIM.mode==='ai'?g:c);});
  el.querySelector('#copLog').addEventListener('click',e=>{const k=e.target.closest('[data-keep]'),u=e.target.closest('[data-undo]');const ap=e.target.closest('[data-approve]'),cp=e.target.closest('[data-cmp]');if(ap){const x=COP.log.find(z=>z.cid===+ap.dataset.approve);if(x&&typeof nxCrApprove==='function')nxCrApprove(x);return;}if(cp){if(typeof nxCrCompare==='function')nxCrCompare();return;}if(k){copChg(k.dataset.keep,'keep');return;}if(u){copChg(u.dataset.undo,'undo');return;}
    const d=e.target.closest('.cp-ask');const b=e.target.closest('button');if(d&&b){const ent=COP.log.find(x=>x.cid===+d.dataset.cid);if(ent&&ent.state==='open')copAskClick(d,ent,b);}});
  el.querySelector('#copLog').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const d=e.target.closest('.cp-ask');if(!d||e.target.tagName!=='INPUT')return;e.preventDefault();const ent=COP.log.find(x=>x.cid===+d.dataset.cid);const ok=d.querySelector('[data-ok]');if(ent&&ent.state==='open'&&ok)copAskClick(d,ent,ok);});
  aimBind(el);cliAiProbe().then(aimPaint);
  copRebuild();copCtx();return el;}

/* ---- right dock: 설계 도우미 · 정보 · 시뮬레이션 ---- */
function dockPaint(){
  const app=$('.app');const aiOut=!!PANELS.ai.out,inOut=!!PANELS.insp.out,off=!!LAY.dockOff,empty=aiOut&&inOut;
  let t=COP.tab;if(t==='ai'&&aiOut)t=inOut?'ds':(S.panel||'info');if((t==='info'||t==='sim')&&inOut)t=aiOut?'ds':'ai';COP.shown=t;
  app.classList.toggle('dock-off',off);app.classList.toggle('dock-empty',empty);app.classList.toggle('dk',!off&&!empty);
  const tg=$('#dockTg');if(tg)tg.setAttribute('aria-pressed',String(!off&&!empty));
  const allow=typeof modeTabs==='function'?modeTabs():['ai','info','sim','ds'];if(t&&!allow.includes(t)){t=allow[0]||null;COP.shown=t;}
  $$('[data-dock]').forEach(b=>{const k=b.dataset.dock;b.hidden=(k==='ai'?aiOut:k==='ds'?false:inOut)||!allow.includes(k);b.setAttribute('aria-selected',k===t?'true':'false');});
  const cp=PANELS.ai.el,ins=PANELS.insp.el,ds=$('#dsPane');if(cp)cp.hidden=!aiOut&&t!=='ai';if(ins)ins.hidden=!inOut&&!(t==='info'||t==='sim');if(ds){ds.hidden=t!=='ds';if(t==='ds'&&typeof dsRender==='function')dsRender();}
  const d=$('#dock');if(d)d.classList.toggle('wide',t==='sim');}
function dockTab(t){COP.tab=t;LAY.dockTab=t;saveLayout();if(t==='info'||t==='sim')setPanel(t);dockPaint();
  if(t==='ai')setTimeout(()=>{const L=$('#copLog');if(L)L.scrollTop=L.scrollHeight;},0);}
// setPanel from the panel's own tabs (when it sits in a separate window it keeps them); in the dock the tab follows
function dockOnPanel(p){if(PANELS.insp&&!PANELS.insp.out&&COP.tab!=='ai'){COP.tab=p;dockPaint();}}
function dockToggle(on){LAY.dockOff=on==null?!LAY.dockOff:!on;if(!LAY.dockOff&&PANELS.ai.out&&PANELS.insp.out){toast('설계 도우미와 정보 패널이 모두 새 창에 있습니다. 새 창의 [메인 창으로]로 되돌리세요.');}saveLayout();dockPaint();}

/* ---- every fixed panel can live in its own window ---- */
const PANELS={
  ai:{sel:'#copilot',title:'설계 도우미',w:460,h:780},
  insp:{sel:'.insp',title:'정보 · 시뮬레이션',w:480,h:820},
  layers:{sel:'.main>.layers',title:'레이어 · 보드 요약',w:300,h:760},
  sysL:{sel:'#sysLeft',title:'프로젝트 · HW 블록 · PCB 조건',w:380,h:820},
  sysR:{sel:'#sysRight',title:'선택 블록 · 회로 구현',w:400,h:820},
  cadL:{sel:'#cadLeft',title:'하우징 조건 · 결과',w:420,h:840},
  cadR:{sel:'#cadRight',title:'형상 트리 · 내보내기',w:400,h:820},
  hsL:{sel:'#hsLeft',title:'HSIS 문서 · 필터',w:340,h:800},
  hsD:{sel:'#hsDetail',title:'HSIS 신호 상세',w:460,h:840}};
const WS_CLASSES=['main','sys-ws','cad-ws','hsis-ws'];
const ppShell=(title,floating)=>`<div class="pp"><div class="pp-bar">${floating?'<span class="pp-grip" aria-hidden="true">⠿</span>':''}<b class="pp-title">${esc(title)}</b><span class="pp-sub">${esc(BD?BD.name:'')} · 메인 창과 연동</span><span class="cop-sp"></span><button type="button" class="btn sm" data-back title="이 패널을 메인 창의 원래 자리로 되돌립니다">메인 창으로</button></div><div class="pp-host"></div></div>`;
let ppFloatN=0,ppWarned=false;
function panelPop(key){
  const P=PANELS[key];if(!P||!P.el)return;
  if(P.out){if(P.win)try{P.win.focus();}catch(e){}return;}
  const el=P.el;const ctx=[];for(let a=el.parentElement;a&&a!==document.body;a=a.parentElement)a.classList.forEach(c=>{if(WS_CLASSES.includes(c))ctx.push(c);});
  P.home=document.createComment('panel:'+key);el.parentNode.insertBefore(P.home,el);
  let w=null,ok=false;
  try{w=window.open('','aiod_panel_'+key,`popup=yes,width=${P.w},height=${P.h}`);}catch(e){w=null;}
  if(w){try{const d=w.document;d.open();
      d.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(P.title)} · ${esc(BD?BD.name:'AllinOneDesign')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap"><style>${pageCSS()}${tokenCSS()}${POP_BASE}</style></head><body class="pp-body">${ppShell(P.title,false)}</body></html>`);d.close();
      const host=d.querySelector('.pp-host');
      if(host){host.classList.add(...ctx);host.appendChild(d.adoptNode(el));ok=true;P.win=w;P.doc=d;PANEL_DOCS.add(d);
        d.querySelector('[data-back]').addEventListener('click',()=>panelBack(key));
        w.addEventListener('pagehide',()=>panelBack(key));
        P.poll=setInterval(()=>{let c=true;try{c=w.closed;}catch(e){}if(c)panelBack(key);},800);}}
    catch(e){console.error(e);}}
  if(!ok){if(w)try{w.close();}catch(e){}
    const f=document.createElement('div');f.className='ppfloat';f.setAttribute('role','dialog');f.setAttribute('aria-label',P.title);f.innerHTML=ppShell(P.title,true);
    const n=ppFloatN++%5;f.style.top=(84+n*26)+'px';f.style.right=(28+n*26)+'px';f.style.width=`min(${P.w}px,calc(100vw - 32px))`;
    document.body.appendChild(f);const host=f.querySelector('.pp-host');host.classList.add(...ctx);host.appendChild(el);P.float=f;
    f.querySelector('[data-back]').addEventListener('click',()=>panelBack(key));
    const bar=f.querySelector('.pp-bar');bar.addEventListener('pointerdown',e=>{if(e.target.closest('button,select,input'))return;e.preventDefault();const r=f.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
      const mv=ev=>{f.style.left=Math.max(0,Math.min(window.innerWidth-120,ev.clientX-sx))+'px';f.style.top=Math.max(0,Math.min(window.innerHeight-40,ev.clientY-sy))+'px';f.style.right='auto';};
      const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);});
    f.addEventListener('pointerdown',()=>{f.style.zIndex=String(41+(ppFloatN++));},true);
    if(!ppWarned){ppWarned=true;toast('브라우저가 새 창을 막아 화면 위에 떠 있는 창으로 열었습니다. 제목 줄을 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿀 수 있습니다.');}}
  P.out=true;el.classList.add('popped');el.hidden=false;panelAfter(key);}
function panelBack(key){
  const P=PANELS[key];if(!P||!P.out)return;P.out=false;clearInterval(P.poll);
  const el=P.el;try{if(P.home&&P.home.parentNode){P.home.parentNode.insertBefore(document.adoptNode(el),P.home);P.home.remove();}}catch(e){console.error(e);}
  if(P.doc)PANEL_DOCS.delete(P.doc);P.doc=null;
  if(P.win){const w=P.win;P.win=null;try{if(!w.closed)w.close();}catch(e){}}
  if(P.float){P.float.remove();P.float=null;}
  el.classList.remove('popped');panelAfter(key);}
function panelAfter(key){
  dockPaint();
  setTimeout(()=>{try{
    relayoutViews();aimPaint();copCtx();
    if(key==='ai'){const L=$('#copLog');if(L)L.scrollTop=L.scrollHeight;}
    if(key==='insp'){if(S.panel==='sim')renderSim();else renderPane();}
    if(key==='hsD'&&HS.H&&BD)renderDetail();
    if((key==='cadL'||key==='cadR')&&HS.ws==='cad')cadRender();
    if((key==='sysL'||key==='sysR')&&HS.ws==='sys')sysRender();
  }catch(e){console.error(e);}},30);}
// a small "새 창" button on each side panel (kept when the panel re-renders its content)
function panelDecorate(key){
  const P=PANELS[key];const el=P.el;if(!el||key==='ai'||key==='insp')return;
  const mk=()=>{if(el.querySelector(':scope>.pop-btn'))return;const b=el.ownerDocument.createElement('button');b.type='button';b.className='pop-btn';
    b.title=`${P.title} — 새 창으로 (메인 창과 연동)`;b.setAttribute('aria-label',`${P.title} 새 창으로`);b.innerHTML=SVG_POP;
    b.addEventListener('click',()=>panelPop(key));el.prepend(b);};
  mk();new MutationObserver(mk).observe(el,{childList:true});}
window.addEventListener('beforeunload',()=>Object.values(PANELS).forEach(P=>{if(P.win)try{P.win.close();}catch(e){}}));

/* ---- boot ---- */
copEnsure();
Object.entries(PANELS).forEach(([k,P])=>{P.el=$(P.sel);panelDecorate(k);});
if(['info','sim','ai','ds'].includes(LAY.dockTab))COP.tab=LAY.dockTab;
$$('[data-dock]').forEach(b=>b.addEventListener('click',()=>dockTab(b.dataset.dock)));
$('#dockHide').addEventListener('click',()=>dockToggle(false));
$('#dockTg').addEventListener('click',()=>dockToggle());
$('#dockPop').addEventListener('click',()=>{if(COP.shown==='ds'){toast('데이터시트 탭은 새 창으로 띄울 수 없습니다. 페이지의 [원본 파일] 링크를 쓰세요.');return;}panelPop(COP.shown==='ai'?'ai':'insp');});
// ` anywhere (outside a text field) jumps to the 도우미 input
document.addEventListener('keydown',e=>{if(e.key!=='`'||e.ctrlKey||e.metaKey||e.altKey)return;if(e.target.matches('input,select,textarea'))return;e.preventDefault();e.stopImmediatePropagation();copFocus();},true);
dockPaint();if(COP.tab!=='ai')setPanel(COP.tab);
copSay('out','설계 도우미입니다. 요구사항·질문·명령을 적으면 지금 단계(1 시스템 · 2 회로 · 3 PCB · 4 기구)의 콘솔이 처리합니다. AI 모드에서는 Claude가 같은 명령을 골라 실행하고, 설계를 바꾼 실행은 [유지] / [되돌리기]로 정할 수 있습니다. 패널은 오른쪽 위 버튼으로 새 창에 띄울 수 있습니다.');
