/* ---------- layout console (CLI): board size, reset from the schematic, strategy placement, auto-routing, reports.
   Plain commands run here; anything else goes to Claude (when the viewer allows it), which drives the same commands as a tool. */
var CLI={open:false,log:[],hist:[],hi:-1,busy:false,lock:new Set(),strategy:'balanced',sample:undefined,abort:null,seq:0,stopReq:false};
const CLI_HELP=[
  ['help [명령]','명령 목록과 사용법'],
  ['status','보드 크기·부품·넷·배선 상태'],
  ['board size <가로> <세로> [--anchor center|bl] [--corner R]','보드 크기 변경 (mm). 기본은 왼쪽 아래 기준, center는 부품을 가운데 유지'],
  ['board corner <R>','모서리 반지름 변경'],
  ['strategies','배치 전략 설명 (balanced · thermal · noise · compact)'],
  ['reset [--strategy S] [--seed N] [--both] [--route]','배선을 모두 지우고 회로도(넷리스트) 기준으로 처음부터 자동 배치. --route면 이어서 자동 배선'],
  ['place [--strategy S] [--only U1,C3] [--effort N]','현재 배치에서 다시 최적화 (트랙·비아는 지움)'],
  ['route [--strategy S] [--signal 0.2] [--power 0.3] [--clear 0.2] [--nets A,B]','GND 비아 팬아웃 후 열린 넷을 자동 배선 (막히면 주변 넷을 뜯고 다시 배선)'],
  ['unroute','자동 배선한 트랙·비아 지우기'],
  ['auto [S] [--tries N]','리셋 → 배치 → 배선 → DRC → 리포트를 한 번에. 미배선이 남으면 다른 시드로 다시 시도해 가장 좋은 결과를 남김'],
  ['lock <부품…> · unlock <부품…|all> · locks','자동 배치에서 고정할 부품'],
  ['move <부품> <x> <y> [각도] · rotate <부품> <각도> · flip <부품>','부품 하나 옮기기'],
  ['drc · rats','설계 규칙 검사 · 미연결(래츠네스트) 목록'],
  ['report [place|thermal|emc]','배치 지표 · 열 해석 · EMC 점검 요약'],
  ['undo · redo · clear','실행 취소 · 다시 실행 · 화면 지우기'],
  GUIDE_HELP,
  ['ai <요청>','Claude가 위 명령을 골라 실행. 헤더에서 결정론/AI를 고르면 문장·버튼이 그 방식으로 실행되고, AI 실행마다 모델 등급과 토큰(추정)을 표시']];
function cliSay(k,t){const e={k,t,id:++CLI.seq};CLI.log.push(e);if(CLI.log.length>400)CLI.log.shift();cliPaint(e);return e;}
function cliSet(e,t){e.t=t;cliPaint(e,true);}
function cliPaint(e,upd){const L=$('#cliLog');if(!L)return;
  if(upd){const el=L.querySelector(`[data-id="${e.id}"]`);if(el){el.textContent=e.t;L.scrollTop=L.scrollHeight;return;}}
  const d=document.createElement('div');d.className='cl-'+e.k;d.dataset.id=e.id;d.textContent=(e.k==='cmd'?'› ':'')+e.t;L.appendChild(d);while(L.children.length>400)L.firstChild.remove();L.scrollTop=L.scrollHeight;}
function cliPanel(){
  let el=$('#peCli');if(el)return el;
  el=document.createElement('section');el.id='peCli';el.className='ov pe-cli';el.hidden=true;el.setAttribute('aria-label','배치·배선 CLI');
  el.innerHTML=`<div class="cli-h"><b>배치·배선 CLI</b>${aimControls()}
    <span class="cli-sp"></span><button type="button" class="pill vbtn" id="cliStop" hidden>중지</button><button type="button" class="pill vbtn" id="cliX" title="닫기 (\`)">닫기</button></div>
    <div class="cli-chips" role="toolbar" aria-label="빠른 명령">${CLI_CHIPS.map(([l,c,g],i)=>`<button type="button" class="pill vbtn" data-chip="${i}" title="결정론: ${esc(c)}
AI: ${esc(g)}">${l}</button>`).join('')}</div>
    <div class="cli-log" id="cliLog" role="log" aria-live="polite"></div>
    <form class="cli-in" id="cliForm" autocomplete="off"><span aria-hidden="true">›</span><input id="cliIn" spellcheck="false" placeholder="예: board size 100 60 · reset --strategy noise --route · 열이 고르게 퍼지게 다시 배치해줘" aria-label="명령 입력"><button class="btn primary sm" id="cliRun">실행</button></form>`;
  $('#vp').appendChild(el);
  el.querySelector('#cliForm').addEventListener('submit',e=>{e.preventDefault();const i=$('#cliIn');const v=i.value.trim();if(!v||CLI.busy)return;i.value='';CLI.hist.push(v);CLI.hi=CLI.hist.length;cliExec(v);});
  el.querySelector('#cliIn').addEventListener('keydown',e=>{const i=e.target;
    if(e.key==='ArrowUp'){if(CLI.hi>0){CLI.hi--;i.value=CLI.hist[CLI.hi]||'';}e.preventDefault();}
    else if(e.key==='ArrowDown'){if(CLI.hi<CLI.hist.length){CLI.hi++;i.value=CLI.hist[CLI.hi]||'';}e.preventDefault();}
    else if(e.key==='Tab'){const w=i.value.trim();const names=['help','status','board size','board corner','strategies','reset','place','route','unroute','auto','lock','unlock','locks','move','rotate','flip','drc','rats','report','undo','redo','clear','ai'];const m=names.filter(n=>n.startsWith(w));if(w&&m.length){i.value=m[0]+' ';e.preventDefault();}}
    else if(e.key==='Escape'){i.blur();}
    e.stopPropagation();});
  el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='cliX')cliToggle(false);else if(b.id==='cliStop'){CLI.stopReq=true;if(CLI.abort)CLI.abort.abort();}else if(b.dataset.chip&&!CLI.busy){const[,c,g]=CLI_CHIPS[+b.dataset.chip];if(AIM.mode==='ai')cliGoal(g);else cliExec(c);}});
  cliSay('out','명령을 입력하거나 하고 싶은 일을 문장으로 적으세요. help로 명령 목록을 봅니다.');
  aimBind(el);cliAiProbe().then(aimPaint);return el;
}
function cliToggle(on){const el=cliPanel();CLI.open=on==null?!CLI.open:on;el.hidden=!CLI.open;peBar();if(CLI.open)setTimeout(()=>$('#cliIn')&&$('#cliIn').focus(),20);}
function cliBusy(b){CLI.busy=b;const r=$('#cliRun'),s=$('#cliStop'),i=$('#cliIn');if(r)r.disabled=b;if(s)s.hidden=!b;if(i)i.disabled=b;if(!b){CLI.stopReq=false;CLI.abort=null;setTimeout(()=>i&&CLI.open&&i.focus(),10);}}
const cliTick=()=>new Promise(r=>setTimeout(r,0));

/* ---- Claude (sample capability): probe once, quietly ---- */
async function cliAiProbe(){
  const badge=()=>{const b=$('#cliAi');if(!b)return;b.textContent=CLI.sample?'AI 사용 가능':'AI 없음 · 문장은 규칙으로 해석';b.classList.toggle('on',!!CLI.sample);};
  if(CLI.sample!==undefined){badge();return;}
  try{CLI.sample=window.claude&&typeof window.claude.use==='function'?await window.claude.use('sample'):null;}catch(e){CLI.sample=null;}
  try{if(CLI.sample&&CLI.sample.limits){const l=await CLI.sample.limits();CLI.tools=!!(l&&l.tools);}}catch(e){CLI.tools=false;}
  badge();
}

/* ---- parsing ---- */
function cliTok(s){const out=[];const re=/"([^"]*)"|'([^']*)'|(\S+)/g;let m;while((m=re.exec(s)))out.push(m[1]!=null?m[1]:m[2]!=null?m[2]:m[3]);return out;}
function cliArgs(t){const a={_:[]};for(let i=0;i<t.length;i++){const x=t[i];if(x.startsWith('--')){const[k,v]=x.slice(2).split('=');if(v!=null)a[k]=v;else if(t[i+1]!=null&&!t[i+1].startsWith('--'))a[k]=t[++i];else a[k]=true;}else a._.push(x);}return a;}
const CLI_CHIPS=[['열 분산 자동 배치·배선','auto thermal','열 분산 전략으로 회로도 기준 처음부터 배치하고 배선해줘. 미배선이 남으면 시드나 전략 가중치를 바꿔 개선하고, 열 리포트로 결과를 확인해줘'],
  ['노이즈 최소화 자동 배치·배선','auto noise','노이즈 최소화 전략으로 처음부터 배치하고 배선해줘. EMC 리포트를 보고 디커플링·Hot-loop가 나쁘면 개선해줘'],
  ['회로도로 리셋','reset --strategy balanced','회로도 기준으로 처음부터 배치해줘 (배선은 하지 말고 배치 지표만 알려줘)'],
  ['자동 배선','route','열린 넷을 자동 배선하고, 미배선이 남으면 원인을 보고 해결해줘'],
  ['가이드라인 점검','guide check','PCB 설계 가이드라인을 점검하고 가장 중요한 개선 3가지를 알려줘'],
  ['리포트','report all','배치·열·EMC 리포트를 보고 문제를 우선순위대로 요약해줘'],['도움말','help','이 콘솔로 할 수 있는 일을 짧게 알려줘']];
const CLI_CMDS=new Set(['guide','help','?','status','board','strategies','strategy','reset','place','route','unroute','auto','lock','unlock','locks','move','rotate','flip','drc','rats','report','undo','redo','clear','ai','history']);

/* ---- snapshots for undo (same objects: tracks, pads and silk keep their identity) ---- */
function cliSnap(){return{poses:BD.comps.map(c=>({c,x:c.x,y:c.y,rot:c.rot||0,side:c.side})),layers:Object.fromEntries(Object.keys(BD.layers).map(k=>[k,BD.layers[k].slice()])),vias:BD.vias.slice()};}
function cliRestore(s){
  s.poses.forEach(p=>{const c=p.c;if(c.side!==p.side)PCBEDIT.flip(BD,c);const dr=p.rot-(c.rot||0);if(Math.abs(dr)>1e-9)PCBEDIT.rotate(BD,c,dr);if(Math.abs(p.x-c.x)>1e-12||Math.abs(p.y-c.y)>1e-12)PCBEDIT.move(BD,c,p.x-c.x,p.y-c.y);c.rot=p.rot;});
  Object.keys(s.layers).forEach(k=>{BD.layers[k]=s.layers[k].slice();});BD.vias=s.vias.slice();PCBEDIT.rebuildNets(BD);}
function cliCommit(before,label){const after=cliSnap();pePush({copper:true,label,undo:()=>cliRestore(before),redo:()=>cliRestore(after)});}
function cliEnsureEdit(){if(!PE.on)peBegin();else PCBEDIT.prepare(BD);if(!(S.view==='T'||S.view==='B'))setView('T');}
function cliAfter(fit){PE.drag=null;PE.route=null;if(fit){fit2();try{header();}catch(e){}}if(typeof SV!=='undefined'){SV.data=null;SV.lastKey='';}peChanged(true);}
function cliPower(){try{const cfg=thConfig();const P={};let any=false;Object.entries(cfg.P||{}).forEach(([k,v])=>{if(+v>0){P[k]=+v;any=true;}});return any?P:null;}catch(e){return null;}}
function cliStrat(a,def){const s=a.strategy||a.s||def||CLI.strategy;const k=AUTOPLACE.strategy(s);if(!k)throw new Error(`알 수 없는 전략: ${s} (balanced · thermal · noise · compact)`);return k;}
const f1=v=>(Math.round(v*10)/10).toString();

/* ---- command implementations ---- */
function cliStatus(){
  const ring=BD.outline[0];const R=PCBEDIT.cornerRadius(BD);const open=AUTOROUTE.openNets(BD);const rats=PCBEDIT.ratsnest(BD).length;const drc=PCBEDIT.drc(BD).length;
  const auto=['T','B'].reduce((a,s)=>a+BD.layers[s+'.cu'].filter(p=>p.auto).length,0);
  return[`보드 ${f1(BD.W)} × ${f1(BD.H)} mm${R?` · 모서리 R${f1(R)}`:''}${PCBEDIT.rectLike(BD)?'':' · 사각형이 아닌 외곽'} · 두께 ${BD.t} mm`,
    `부품 ${BD.comps.length}개 (상단 ${BD.comps.filter(c=>c.side==='T').length} · 하단 ${BD.comps.filter(c=>c.side==='B').length}) · 넷 ${BD.netOrder.length}개 · 비아 ${BD.vias.length}개 · 자동 트랙 ${auto}개`,
    `열린 넷 ${open.length}개 · 래츠네스트 ${rats}개 · DRC ${drc}건 · 기본 전략 ${CLI.strategy} (${AUTOPLACE.STRATS[CLI.strategy].label})${CLI.lock.size?` · 고정 ${[...CLI.lock].join(', ')}`:''}`].join('\n');}
function cliBoard(a){
  const sub=a._[0];
  if(!sub)return cliStatus().split('\n')[0];
  let W,H,corner=a.corner;
  if(sub==='size'){W=parseFloat(a._[1]);H=parseFloat(a._[2]);if(a._[1]&&/x|×/i.test(a._[1])&&!a._[2]){const m=a._[1].split(/x|×/i);W=parseFloat(m[0]);H=parseFloat(m[1]);}}
  else if(sub==='corner'){W=BD.W;H=BD.H;corner=parseFloat(a._[1]);if(!isFinite(corner))throw new Error('board corner <반지름 mm>');}
  else{const m=sub.split(/x|×/i);if(m.length===2){W=parseFloat(m[0]);H=parseFloat(m[1]);}else throw new Error('board size <가로> <세로> 또는 board corner <R>');}
  if(!isFinite(W)||!isFinite(H))throw new Error('board size <가로 mm> <세로 mm>');
  cliEnsureEdit();const before=cliSnap();const W0=BD.W,H0=BD.H,R0=PCBEDIT.cornerRadius(BD),outline0=BD.outline,anchor=a.anchor==='center'?'center':'bl';
  const pours0=Object.fromEntries(['T.cu','B.cu'].map(k=>[k,BD.layers[k].filter(p=>p.t==='pour')]));
  const r=PCBEDIT.resizeBoard(BD,W,H,{anchor,corner:corner!=null?+corner:undefined});
  const restoreSize=()=>{PCBEDIT.resizeBoard(BD,W0,H0,{anchor,corner:R0});BD.outline=outline0;['T.cu','B.cu'].forEach(k=>{let i=0;BD.layers[k]=BD.layers[k].map(p=>p.t==='pour'?(pours0[k][i++]||p):p);});};
  const again=()=>PCBEDIT.resizeBoard(BD,W,H,{anchor,corner:corner!=null?+corner:undefined});
  pePush({copper:true,label:'board',undo:()=>{restoreSize();cliAfter(true);},redo:()=>{again();cliAfter(true);}});
  void before;cliAfter(true);
  return`보드 ${f1(r.W0)} × ${f1(r.H0)} → ${f1(r.W)} × ${f1(r.H)} mm${r.R?` (모서리 R${f1(r.R)})`:''} · ${r.anchor==='center'?'가운데 기준':'왼쪽 아래 기준'}${r.holes?` · 모서리 장착 구멍 ${r.holes}개 따라 이동`:''}${r.rebuilt?'':' · 외곽선은 비율로 늘림'}`+
    (r.outside.length?`\n보드 밖 부품 ${r.outside.length}개: ${r.outside.slice(0,12).join(', ')}${r.outside.length>12?' …':''} → place 또는 reset으로 다시 배치하세요.`:'');
}
function cliPlaceText(r,m,scratch){
  const lines=[`${scratch?'회로도 기준 처음부터 ':''}배치 완료 · 전략 ${r.strategy} (${r.label}) · 부품 ${r.moved}개 · 반복 ${r.iters.toLocaleString()}회`];
  if(r.bottom&&r.bottom.length)lines.push(`하단 배치: ${r.bottom.join(', ')}`);
  if(r.fails.length)lines.push(`자리 부족으로 겹칠 수 있는 부품: ${r.fails.join(', ')} → board size로 보드를 키우거나 --strategy compact`);
  lines.push(cliMetricText(m));return lines.join('\n');}
function cliMetricText(m){
  const hp=m.hotPairs[0],hs=m.hotSens[0],ns=m.noiseSens[0];
  return[`신호 배선 추정(HPWL) ${f1(m.hpwl)} mm · 디커플링 캡–전원 핀 평균 ${f1(m.decapAvg)} mm (최대 ${f1(m.decapMax)}) · 부품 면적 ${(m.util*100).toFixed(0)}%`,
    hp?`발열 부품 간 최소 거리 ${hp.a}–${hp.b} ${f1(hp.d)} mm · 열원 분산 반경 ${f1(m.heatSpread)} mm (총 ${m.Ptot.toFixed(2)} W)`:'발열 부품(≥0.1 W) 2개 미만',
    hs?`열에 민감한 부품까지 최소 간격 ${hs.a}→${hs.b} ${f1(hs.d)} mm`:null,
    ns?`스위칭 부품–민감 부품 최소 간격 ${ns.a}↔${ns.b} ${f1(ns.d)} mm`:'스위칭(노이즈원) 부품 없음'].filter(Boolean).join('\n');}
function cliPlace(a,scratch){
  const st=cliStrat(a);cliEnsureEdit();const before=cliSnap();
  const fixed=[...CLI.lock].filter(r=>BD.byRef[r]);const only=a.only?String(a.only).split(/[,\s]+/).filter(Boolean):null;
  const cleared=AUTOPLACE.clearCopper(BD,{keepZones:!scratch&&!!a['keep-zones']});const pour=AUTOPLACE.ensurePour(BD);
  const r=AUTOPLACE.place(BD,{strategy:st,scratch,seed:a.seed!=null?+a.seed:(scratch?1+Math.floor(Math.random()*1e6):1),both:!!a.both,effort:a.effort?+a.effort:1,fixed,only,power:cliPower()});
  CLI.strategy=st;const m=AUTOPLACE.metrics(BD,{power:cliPower()});
  cliCommit(before,scratch?'reset':'place');cliAfter(false);
  return(cleared.tracks||cleared.vias?`트랙·동박 ${cleared.tracks}개와 비아 ${cleared.vias}개를 지웠습니다.\n`:'')+(pour?`${pour.net} 동박면을 ${pour.layer==='B'?'하단':'상단'}에 깔았습니다.\n`:'')+cliPlaceText(r,m,scratch)+(fixed.length?`\n고정 부품: ${fixed.join(', ')}`:'');
}
async function cliRoute(a){
  cliEnsureEdit();const st=cliStrat(a);const before=cliSnap();
  const sig=a.signal?+a.signal:0.2,pwr=a.power?+a.power:0.3,clr=a.clear?+a.clear:0.2;
  const fan=AUTOPLACE.fanout(BD,{thermal:st==='thermal',clear:clr,width:Math.min(0.4,pwr)});
  let nets=AUTOROUTE.openNets(BD).map(o=>o.net);
  if(a.nets){const want=new Set(String(a.nets).split(/[,\s]+/));nets=nets.filter(n=>want.has(n));}
  const lines=[`GND 팬아웃 비아 ${fan.vias}개${fan.fail.length?` (자리 없음: ${fan.fail.slice(0,6).join(', ')})`:''}`];
  if(!nets.length){cliCommit(before,'route');cliAfter(false);return lines.concat('배선할 열린 넷이 없습니다.').join('\n');}
  // noise: switching and supply loops first and short, keep the ground plane whole (bottom layer costs more)
  let keepOrder=false;if(st==='noise'){const I=AUTOPLACE.classify(BD,{});const sw=new Set(I.switchNets);const cls=n=>BD.netClass(n);
    nets=nets.map(n=>({n,r:sw.has(n)?0:cls(n)==='전원'?1:/XTAL|OSC|CAN|USB/i.test(n)?2:3,e:AUTOROUTE.estimate(BD,n)})).sort((x,y)=>x.r-y.r||x.e-y.e).map(x=>x.n);keepOrder=true;}
  const prog=cliSay('out',`배선 준비 중… (${nets.length}개 넷)`);await cliTick();
  const it=AUTOROUTE.jobRR(BD,nets,{width:{signal:sig,power:pwr},clear:clr,keepOrder,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:300000,bottomCost:st==='noise'?1.6:1.05,rounds:a.rounds!=null?+a.rounds:undefined});
  const t0=performance.now();let r,last=performance.now();
  for(;;){r=it.next();if(r.done)break;const p=r.value;
    if(performance.now()-last>80){cliSet(prog,p.phase==='route'?`배선 중… ${p.i+1}/${p.total} · ${p.net}`:`막힌 넷 다시 배선 ${p.round}/${p.max} · ${p.net} (완료 ${p.ok}/${p.total})`);await cliTick();last=performance.now();}
    if(CLI.stopReq){cliSet(prog,'중지했습니다. 지금까지의 배선을 남깁니다.');break;}}
  PCBEDIT.rebuildNets(BD);const res=r&&r.done?r.value:null;const ms=performance.now()-t0;
  const open=AUTOROUTE.openNets(BD).filter(o=>nets.includes(o.net));
  cliSet(prog,`배선 ${nets.length-open.length}/${nets.length} 넷 · ${(ms/1000).toFixed(1)} s${res?` · 트랙 ${f1(res.len)} mm · 비아 ${res.vias}개${res.rounds?` · 다시 배선 ${res.rounds}회`:''}`:''}`);
  if(open.length)lines.push(`미배선 ${open.length}개: ${open.slice(0,10).map(o=>o.net).join(', ')}${open.length>10?' …':''} → place로 간격을 바꾸거나 board size로 보드를 키우고 다시 route`);
  cliCommit(before,'route');cliAfter(false);
  const d=PCBEDIT.drc(BD).length,rats=PCBEDIT.ratsnest(BD).length;lines.push(`DRC ${d}건 · 래츠네스트 ${rats}개`);
  return lines.join('\n');
}
function cliUnroute(){cliEnsureEdit();const before=cliSnap();const n=['T','B'].reduce((a,s)=>a+BD.layers[s+'.cu'].filter(p=>p.auto).length,0)+BD.vias.filter(v=>v.auto).length;AUTOROUTE.unroute(BD);PCBEDIT.rebuildNets(BD);cliCommit(before,'unroute');cliAfter(false);return`자동 배선 ${n}개(트랙·비아)를 지웠습니다.`;}
async function cliAuto(a){
  const st=cliStrat(a,a._[0]);const tries=Math.max(1,Math.min(5,a.tries?+a.tries:3));let best=null;cliEnsureEdit();const start=cliSnap();const u0=PE.undo.length;
  let lastK=0;for(let k=0;k<tries;k++){lastK=k;
    if(k){cliRestore(start);cliSay('out',`미배선이 남아 다른 시드로 다시 시도합니다 (${k+1}/${tries}).`);}
    cliSay('ok',cliPlace({strategy:st,seed:a.seed!=null?+a.seed+k:1+k*7919,both:a.both},true));await cliTick();
    cliSay('ok',await cliRoute({strategy:st}));
    const open=AUTOROUTE.openNets(BD).length,d=PCBEDIT.drc(BD).length;const al=['T','B'].reduce((s,L)=>s+BD.layers[L+'.cu'].filter(p=>p.auto).length,0);
    const sc=open*1000+d*100+al*0.01;if(!best||sc<best.sc){best={sc,snap:cliSnap(),k,open};}
    if(!open||CLI.stopReq)break;}
  if(best&&best.k!==lastK&&best.snap){cliRestore(best.snap);cliSay('out',`${best.k+1}번째 결과가 가장 좋아 그것을 남겼습니다.`);}
  // fold the whole run into one undo step
  PE.undo.splice(u0);const after=cliSnap();pePush({copper:true,label:'auto',undo:()=>cliRestore(start),redo:()=>cliRestore(after)});cliAfter(false);
  return cliReport({_:['place']});
}
function cliReport(a){
  const what=a._[0]||'place';const out=[];
  if(what==='place'||what==='all'){out.push('[배치]');out.push(cliMetricText(AUTOPLACE.metrics(BD,{power:cliPower()})));const open=AUTOROUTE.openNets(BD).length;out.push(`열린 넷 ${open}개 · DRC ${PCBEDIT.drc(BD).length}건`);}
  if(what==='thermal'||what==='all'){out.push('[열 해석]');try{SR.cfg.th=null;const cfg=thConfig();runTH();const T=SR.th;
      if(!T||T.error)out.push(T&&T.error||'열 해석을 실행하지 못했습니다.');
      else{out.push(`주변 ${cfg.Ta} °C · 총 ${T.tot.toFixed(2)} W · 보드 최고 ${f1(T.tmax)} °C`);T.hot.filter(x=>x.P>0).slice(0,6).forEach(x=>out.push(`  ${x.ref.padEnd(5)} ${x.P.toFixed(2)} W · 보드 ${f1(x.Tbmax)} °C${x.Tj!=null?` · Tj ${f1(x.Tj)} °C (여유 ${f1(x.margin)} °C)`:''}`));}
      if(S.panel==='sim'&&typeof renderSim==='function')renderSim();}catch(e){out.push('열 해석 오류: '+(e.message||e));}}
  if(what==='emc'||what==='all'){out.push('[EMC 점검]');try{const R=EMC.analyze(BD,{H:typeof HS!=='undefined'?HS.H:null});const c=R.checks;const n=s=>c.filter(x=>x.sev===s).length;
      out.push(`문제 ${n('err')} · 주의 ${n('warn')} · 정상 ${n('ok')}`);c.filter(x=>x.sev==='err'||x.sev==='warn').slice(0,8).forEach(x=>out.push(`  ${x.sev==='err'?'✕':'!'} ${x.item}: ${x.val}${x.fix?` → ${x.fix}`:''}`));}catch(e){out.push('EMC 점검 오류: '+(e.message||e));}}
  if(!out.length)throw new Error('report place | thermal | emc | all');
  return out.join('\n');
}
function cliRefs(list){const out=[];list.forEach(x=>String(x).split(/[,\s]+/).forEach(r=>{if(!r)return;const c=BD.byRef[r]||BD.comps.find(c=>c.ref.toLowerCase()===r.toLowerCase());if(!c)throw new Error(`부품 ${r}을(를) 찾지 못했습니다.`);out.push(c);}));return out;}
function cliOne(op,a){cliEnsureEdit();const[c]=cliRefs([a._[0]||'']);const before=cliSnap();
  if(op==='move'){const x=parseFloat(a._[1]),y=parseFloat(a._[2]);if(!isFinite(x)||!isFinite(y))throw new Error('move <부품> <x> <y> [각도]');if(a._[3]!=null){const r=parseFloat(a._[3]);PCBEDIT.rotate(BD,c,r-(c.rot||0));}PCBEDIT.move(BD,c,x-c.x,y-c.y);}
  else if(op==='rotate'){const r=parseFloat(a._[1]);if(!isFinite(r))throw new Error('rotate <부품> <각도>');PCBEDIT.rotate(BD,c,r);}
  else PCBEDIT.flip(BD,c);
  cliCommit(before,op);S.selRef=c.ref;cliAfter(false);return`${c.ref} · X ${c.x.toFixed(2)} Y ${c.y.toFixed(2)} mm · ${Math.round(c.rot||0)}° · ${c.side==='T'?'상단':'하단'}`;}

/* natural language → commands, used when Claude is not available */
function cliNL(t){const s=t.toLowerCase();const out=[];
  const strat=/열|발열|방열|thermal|heat/.test(s)?'thermal':/노이즈|잡음|emc|emi|noise/.test(s)?'noise':/작게|소형|compact|촘촘|조밀/.test(s)?'compact':/균형|balanced/.test(s)?'balanced':null;
  const m=s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)/)||(/보드|board|크기|사이즈/.test(s)&&s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:,|와|과|및|by|\s)\s*(\d+(?:\.\d+)?)/));
  if(m&&/보드|board|크기|사이즈|size|mm|x|×/.test(s))out.push(`board size ${m[1]} ${m[2]}${/가운데|중앙|center/.test(s)?' --anchor center':''}`);
  const wantRoute=/배선|라우팅|route|routing|연결/.test(s);
  if(/리셋|초기화|처음부터|reset|새로|전부\s*다시|싹/.test(s))out.push(`reset${strat?' --strategy '+strat:''}`);
  else if(/배치|place|옮겨|재배치|정리/.test(s)||(strat&&!wantRoute))out.push(`place${strat?' --strategy '+strat:''}`);
  if(wantRoute)out.push(`route${strat?' --strategy '+strat:''}`);
  if(/drc|검사|규칙/.test(s))out.push('drc');
  if(/리포트|보고|report|분석|평가|결과|온도|열\s*해석/.test(s))out.push(`report ${/온도|열/.test(s)?'thermal':/emc|노이즈|잡음/.test(s)?'emc':'place'}`);
  return out;}

async function cliRun(line,quiet,by){
  const t=cliTok(line);if(!t.length)return'';let cmd=t[0].toLowerCase();const a=cliArgs(t.slice(1));
  switch(cmd){
    case 'help':case '?':{if(a._[0]){const h=CLI_HELP.filter(x=>x[0].split(/[\s·]/).some(w=>w===a._[0]));return h.length?h.map(x=>`${x[0]}\n  ${x[1]}`).join('\n'):`${a._[0]}: 없는 명령입니다.`;}
      return CLI_HELP.map(x=>`${x[0]}\n  ${x[1]}`).join('\n')+'\n\n키: ` 로 열고 닫기 · ↑↓ 이전 명령 · Tab 자동 완성. 모든 변경은 Ctrl+Z로 되돌릴 수 있습니다.';}
    case 'status':return cliStatus();
    case 'board':return cliBoard(a);
    case 'strategies':return Object.entries(AUTOPLACE.STRATS).map(([k,v])=>`${k.padEnd(9)} ${v.label} — ${v.desc}`).join('\n');
    case 'strategy':{if(!a._[0])return`기본 전략: ${CLI.strategy}`;const k=AUTOPLACE.strategy(a._[0]);if(!k)throw new Error('balanced · thermal · noise · compact 중 하나');CLI.strategy=k;return`기본 전략을 ${k} (${AUTOPLACE.STRATS[k].label})로 바꿨습니다.`;}
    case 'reset':{const s=cliPlace(a,true);if(a.route){if(!quiet)cliSay('ok',s);return await cliRoute(a);}return s;}
    case 'place':return cliPlace(a,false);
    case 'route':return await cliRoute(a);
    case 'unroute':return cliUnroute();
    case 'auto':return await cliAuto(a);
    case 'lock':cliRefs(a._).forEach(c=>CLI.lock.add(c.ref));return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'unlock':if(a._[0]==='all'||!a._.length)CLI.lock.clear();else cliRefs(a._).forEach(c=>CLI.lock.delete(c.ref));return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'locks':return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'move':case 'rotate':case 'flip':return cliOne(cmd,a);
    case 'drc':{PCBEDIT.prepare(BD);const d=PCBEDIT.drc(BD);if(PE.on)peRecalc(true);return d.length?`DRC ${d.length}건\n`+d.slice(0,15).map(x=>`  ${x.msg}${x.refs&&x.refs.length?' ('+x.refs.join(', ')+')':''}`).join('\n')+(d.length>15?'\n  …':''):'DRC 문제 없음';}
    case 'rats':{const r=PCBEDIT.ratsnest(BD);if(!r.length)return'래츠네스트 없음 — 모든 연결이 동박으로 이어졌습니다.';const by={};r.forEach(x=>{by[x.net]=(by[x.net]||0)+1;});return`래츠네스트 ${r.length}개\n`+Object.entries(by).sort((x,y)=>y[1]-x[1]).slice(0,20).map(([n,k])=>`  ${n} ${k}`).join('\n');}
    case 'report':return cliReport(a);
    case 'undo':if(!PE.undo.length)return'되돌릴 것이 없습니다.';peUndo();return'실행 취소했습니다.';
    case 'redo':if(!PE.redo.length)return'다시 실행할 것이 없습니다.';peRedo();return'다시 실행했습니다.';
    case 'clear':{const L=$('#cliLog');if(L)L.innerHTML='';CLI.log=[];return'';}
    case 'history':return CLI.hist.slice(-20).join('\n');
    case 'guide':{const r=guideRun(a,'pcb',{by});if(typeof r==='string')return r;const txt=guideText(r,(a.ai||(AIM.mode==='ai'&&!a.det))&&by!=='ai'?'ai':'det');
      if(by!=='ai'&&(a.ai||(AIM.mode==='ai'&&!a.det))){cliSay('ok',txt);const ok=await cliAgent(GUIDE_AI+`\n\n점검 결과:\n${txt}\n\n사용자 요청: 가이드라인 점검 결과를 검토해줘`);if(!ok)cliSay('err','Claude를 쓸 수 없어 결정론 결과만 표시했습니다.');return'';}return txt;}
    case 'ai':return await cliAI(t.slice(1).join(' '));
    default:throw new Error(`알 수 없는 명령: ${cmd}`);
  }
}
async function cliExec(line){
  if(!BD)return;cliPanel();cliSay('cmd',line);cliBusy(true);
  try{
    const first=(cliTok(line)[0]||'').toLowerCase();
    if(CLI_CMDS.has(first)){const out=await cliRun(line);if(out)cliSay('ok',out);}
    else{if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){await cliAI(line);cliBusy(false);return;}cliSay('out','Claude를 쓸 수 없어 규칙으로 해석합니다.');}
      {const cmds=cliNL(line);if(!cmds.length)cliSay('err','명령을 알아듣지 못했습니다. help로 목록을 보세요.');else{cliSay('out','해석: '+cmds.join(' → '));for(const c of cmds){cliSay('cmd',c);const o=await cliRun(c);if(o)cliSay('ok',o);if(CLI.stopReq)break;}}}}
  }catch(e){console.error(e);cliSay('err',e&&e.message?e.message:String(e));}
  cliBusy(false);
}

/* ---- Claude drives the CLI ---- */
function cliBrief(){
  const I=AUTOPLACE.classify(BD,{power:cliPower()});
  const parts=I.list.slice(0,120).map(o=>`${o.ref} ${o.role} ${o.c.fp||''}${o.P?` ${o.P.toFixed(2)}W`:''}${o.noisy?' noisy':''}${o.sens?' sensitive':''}${o.hs?' heat-sensitive':''}`).join('; ');
  return`${cliStatus()}\n부품: ${parts}\n스위칭 넷: ${I.switchNets.join(', ')||'없음'}`;}
const CLI_SYS=`You are a PCB layout assistant embedded in a PCB viewer. The user writes in Korean. You can change the board only by calling the run_cli tool with one command at a time.
Commands (exactly this syntax):
${'$'}{CMDS}
Strategies: balanced (wirelength/decoupling/heat/noise evenly), thermal (heat sources spread apart, away from electrolytic caps/crystals/analog), noise (decaps at pins, short switching loops, switching parts far from MCU/crystal/analog, ground plane kept whole), compact (short wiring, parts gathered).
Rules: use at most 6 commands; "reset" re-places everything from the netlist (schematic) and clears copper; "route" auto-routes open nets; run "report" (place, thermal or emc) when the user asks about heat/noise quality; every command is undoable. After the tool calls, answer in Korean in 2-5 short sentences: what you ran, the key numbers from the outputs, and one concrete next step if something is left (unrouted nets, DRC, overlaps). Do not invent numbers.`;
async function cliAgent(prompt){
  return aiAgent({prompt,toolName:'run_cli',toolDesc:'Run one PCB layout console command (see the command list) and return its text output.',example:'"reset --strategy thermal" or "guide set ds_kelvin fail --note ..."',
    run:c=>cliRun(c,true,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();return!CLI_CMDS.has(f)||f==='ai'?'unknown command: '+f:'';},
    say:cliSay,set:cliSet,drop:e=>{const el=$('#cliLog')&&$('#cliLog').querySelector(`[data-id="${e.id}"]`);if(el)el.remove();CLI.log=CLI.log.filter(x=>x!==e);},
    setAbort:c=>{CLI.abort=c;},stopped:()=>CLI.stopReq,max:10});}
async function cliAI(req){
  if(!req.trim())return'요청을 적어 주세요. 예: ai 열이 고르게 퍼지게 배치하고 배선해줘';
  const cmds=CLI_HELP.filter(x=>!/^ai /.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const ok=await cliAgent(CLI_SYS.replace('${CMDS}',cmds)+`\n\n현재 보드:\n${cliBrief()}\n\n사용자 요청: ${req}`);
  if(!ok){const list=cliNL(req);if(!list.length)return'Claude를 쓸 수 없고 문장도 해석하지 못했습니다. help를 보세요.';cliSay('out','Claude를 쓸 수 없어 규칙으로 해석: '+list.join(' → '));for(const c of list){cliSay('cmd',c);const o=await cliRun(c,true);if(o)cliSay('ok',o);}}
  return'';
}
// a toolbar goal in AI mode
async function cliGoal(g){if(!BD)return;cliPanel();cliSay('cmd',g+'   (AI 모드)');cliBusy(true);try{if(!PE.on)peBegin();await cliAI(g);}catch(e){cliSay('err',e.message||String(e));}cliBusy(false);}
/* ---- dialogs behind the toolbar buttons (they run the same commands, so the console shows what happened) ---- */
function cliDialog(kind){
  const el=document.createElement('div');el.className='sedlg';const R=PCBEDIT.cornerRadius(BD);
  el.innerHTML=kind==='size'?`<form class="sedlg-in" data-f><b>보드 크기</b>
      <div class="cli-grid"><label>가로 <input type="number" name="w" step="0.5" min="5" max="1000" value="${f1(BD.W)}"> mm</label><label>세로 <input type="number" name="h" step="0.5" min="5" max="1000" value="${f1(BD.H)}"> mm</label>
      <label>모서리 R <input type="number" name="r" step="0.5" min="0" max="50" value="${f1(R)}"> mm</label>
      <label>기준 <select name="a"><option value="bl">왼쪽 아래 고정</option><option value="center">가운데 유지</option></select></label></div>
      <p class="lead" style="margin:0">모서리 근처 장착 구멍은 모서리를 따라갑니다. 보드 밖으로 나간 부품은 reset·place로 다시 배치하세요.</p>
      <div class="acts"><button type="button" class="btn sm" data-x>취소</button><button class="btn primary sm">적용</button></div></form>`
    :`<form class="sedlg-in" data-f><b>회로도 기준으로 리셋 · 자동 배치</b>
      <p class="lead" style="margin:0">트랙·비아를 모두 지우고 넷리스트(회로도)만 보고 처음부터 배치합니다. Ctrl+Z로 되돌릴 수 있습니다.</p>
      <div class="cli-strats">${Object.entries(AUTOPLACE.STRATS).map(([k,v])=>`<label><input type="radio" name="s" value="${k}"${k===CLI.strategy?' checked':''}> <b>${v.label}</b> <span>${v.desc}</span></label>`).join('')}</div>
      <label class="chkl"><input type="checkbox" name="route" checked> 이어서 자동 배선</label>
      <div class="acts"><button type="button" class="btn sm" data-x>취소</button><button class="btn primary sm">리셋하고 배치</button></div></form>`;
  $('#vp').appendChild(el);const F=el.querySelector('[data-f]');setTimeout(()=>{const i=F.querySelector('input');if(i)i.focus();},20);
  el.addEventListener('click',e=>{if(e.target===el||e.target.closest('[data-x]'))el.remove();});
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){el.remove();e.stopPropagation();}});
  F.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(F);el.remove();cliToggle(true);
    if(kind==='size')cliExec(`board size ${d.get('w')} ${d.get('h')} --corner ${d.get('r')}${d.get('a')==='center'?' --anchor center':''}`);
    else if(AIM.mode==='ai')cliGoal(`${AUTOPLACE.STRATS[d.get('s')].label} 전략(${d.get('s')})으로 회로도 기준 처음부터 배치${d.get('route')?'하고 배선해줘. 미배선이 남으면 개선해줘':'해줘 (배선은 하지 말 것)'}`);
    else cliExec(d.get('route')?`auto ${d.get('s')}`:`reset --strategy ${d.get('s')}`);});
}
// ` toggles the console in the TOP / BOTTOM views
document.addEventListener('keydown',e=>{if(e.key!=='`'||e.ctrlKey||e.metaKey||e.altKey)return;if(e.target.matches('input,select,textarea'))return;if(!BD||!(S.view==='T'||S.view==='B'))return;e.preventDefault();e.stopImmediatePropagation();if(!PE.on)peBegin();cliToggle();},true);
