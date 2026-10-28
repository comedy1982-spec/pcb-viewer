/* ---------- layout console (CLI): board size, reset from the schematic, strategy placement, auto-routing, reports.
   Plain commands run here; anything else goes to Claude (when the viewer allows it), which drives the same commands as a tool. */
var CLI={open:false,log:[],hist:[],hi:-1,busy:false,lock:new Set(),strategy:'balanced',sample:undefined,abort:null,seq:0,stopReq:false,autoFix:true};
try{if(localStorage.getItem('aod.autofix')==='off')CLI.autoFix=false;}catch(e){}
const CLI_HELP=[
  ['zone [on|off|auto [motor|general]|hard|soft]','기능 영역(전원부 · MCU부 · 파워스테이지 · 입력 · 통신 · 센싱): 없이 = 영역별 부품 수 · 사용률 · 영역 밖 부품. auto = 다시 나누기, hard = 영역 밖 금지에 가깝게. 바꾼 뒤 reset으로 다시 배치'],
  ['help [명령]','명령 목록과 사용법'],
  ['status','보드 크기·부품·넷·배선 상태'],
  ['safety [check|parts [--apply]|fmeda] [--asil B]','기능 안전 점검 · 등급 부품 점검/교체 · FMEDA 추정'],
  ['analyze [all|power|decap|rc|ac|dc|ir|si|thermal|emc] [--from 넷 --to 넷] [--net 넷 --total mA]','회로·보드 해석(조회): 전원 트리 · 디커플링 · RC/LC 패턴 · AC 응답 · DC 동작점 · IR drop · 신호 무결성 · 열 · EMC'],
  ['board size <가로> <세로> [--anchor center|bl] [--corner R]','보드 크기 변경 (mm). 기본은 왼쪽 아래 기준, center는 부품을 가운데 유지'],
  ['board corner <R>','모서리 반지름 변경'],
  ['board shape <rect|round|circle|oval|L|T|hex|oct|poly> [가로 [세로]] [--corner R] [--cut 가로x세로] [--at tr|tl|br|bl] [--pts "x,y x,y …"] [--anchor center]','보드 외곽 모양. circle은 지름 하나, hex/oct는 폭, L/T는 --cut(절개·기둥 크기)과 --at(절개 모서리), poly는 --pts 꼭짓점'],
  ['board cutout circle <지름> --at x,y · board cutout rect <가로>x<세로> --at x,y [--corner R] · board cutout clear','보드 안 컷아웃(구멍) 추가/삭제 — 배치·배선이 피함'],
  ['board layers <2|4|6|8|10> [--pwr 넷] [--route]','동박 층 수 변경. 표준 스택업(예: 8층 S·GND·S·GND·PWR·S·GND·S)으로 내층 GND/전원 플레인과 내층 신호층을 만들고, 플레인 넷은 비아로 연결 (--route면 이어서 배선)'],
  ['board stack','층 구성(스택업)과 플레인 넷 보기'],
  ['board minimize [--route] [--strategy S] [--both] [--seeds 2] [--tries 4] [--grow|--no-grow] [--maxgrow 3] [--margin 1] [--keep]','가장 작은 보드 크기 탐색 후 재배치(--route 면 배선까지). 부품이 원래 크기에 안 들어가면 원래 면적의 3배까지 키워 가며 배치 (--no-grow 면 멈춤)'],
  ['strategies','배치 전략 설명 (balanced · thermal · noise · compact)'],
  ['reset [--strategy S] [--seed N] [--both] [--route] [--no-grow]','배선을 모두 지우고 회로도(넷리스트) 기준으로 처음부터 자동 배치. 자리가 모자라면 보드를 10 %씩 키워(최대 3배 면적) 다시 배치. 기본은 상단 단면(조립 1회); --both 면 수동소자·소형 IC를 하단에도 배치(양면 조립). --route면 이어서 자동 배선'],
  ['place [--strategy S] [--only U1,C3] [--effort N]','현재 배치에서 다시 최적화 (트랙·비아는 지움)'],
  ['route [--strategy S] [--signal 0.2] [--power 0.3] [--clear 0.2] [--nets A,B] [--iw] [--iwmax 2] [--order length] [--edge 2|--no-edge] [--retvia 0.8|--no-retvia] [--no-pf] [--pf-rounds 14] [--pf-time 90] [--dir 1.5] [--mst] [--gloss] [--par auto|N|0]','열린 넷을 자동 배선(① 순차 A* ② 막힌 넷 rip-up ③ 남으면 PathFinder 협상 배선 — --no-pf 로 끔 · --mst: 다핀 넷을 MST 순서(짧은 핀 쌍부터)로 — 기본 끔(실측 효과 미미) · --dir N: 층별 선호 방향(홀수 신호층 수평·짝수 수직, 역방향 N배 비용 — 기본 끔, DCM-10A 실측에서 비아 +25%): 순서 ① 대전류 전원·구동 ② 고속·클록·차동 ③ 민감 아날로그 ④ 일반 디지털, 고속 넷은 보드 외곽 2 mm 띠를 피함, 층 전환 옆에 GND 리턴 비아. --iw 면 전원·모터 넷 폭을 추정 전류(IPC-2221)로'],
  ['unroute','자동 배선한 트랙·비아 지우기'],
  ['width [넷 <mm|x2|+50%|auto>] [--apply] [넷 --current A] [--oz 1|2] [--dt 10]','넷별 전류 추정과 IPC-2221 권장 트랙 폭 보기 · 넷 폭 직접 지정(mm) 또는 현재 폭의 배수(x2·2배·+50%) · --apply 로 그 넷만 지우고 새 폭으로 다시 배선 · 전류 지정 · 동박 두께/허용 온도 상승. 넷 이름은 느슨하게 찾음(12V → +12V)'],
  ['pinswap [--all] [--apply] [--route]','배선을 위한 MCU 핀 재배정 (회로 동시 수정): 데이터시트 핀 기능이 맞는 핀 중 상대 부품에 가까운 핀을 추천. --apply면 보드 넷·회로도·HSIS를 함께 바꾸고 해당 넷 배선을 지움, --route면 이어서 배선. --all은 유효한 핀도 다시 배정'],
  ['gloss [--passes 1] [--via 3] [--all] [--par auto|N|0]','사후 최적화: 넷을 하나씩 다른 넷은 고정한 채 비아 비용 3배로 다시 깔아 비아가 줄거나(같으면 길이가 줄면) 채택 · DRC·연결 악화 시 되돌림. route --gloss 로 배선에 이어 실행'],
  ['fix [--maxgrow 1.5] [--maxlayers 6] [--no-grow] [--no-layers] [--pinswap]','미배선 자동 개선: 비용이 적은 순서로 시도하고 다 배선되면 멈춤 — ① 전부 다시 배선(짧은 넷 먼저) ② 다른 시드로 재배치 ③ 다른 전략 ④ 보드 10·20·35·50% 키움 ⑤ 층 늘림(2→4→6) ⑥ (--pinswap) MCU 핀 재배정. 가장 좋은 결과를 남기고 한 번에 되돌리기. autofix on|off: 배선 뒤 미배선이 남으면 자동 실행(기본 켬)'],
  ['auto [S] [--tries N]','리셋 → 배치 → 배선 → DRC → 리포트를 한 번에. 미배선이 남으면 다른 시드로 다시 시도해 가장 좋은 결과를 남김'],
  ['lock <부품…> · unlock <부품…|all> · locks','자동 배치에서 고정할 부품'],
  ['move <부품> <x> <y> [각도] · rotate <부품> <각도> · flip <부품> [--no-route]','부품 하나 옮기기 · 돌리기 · 반대면으로. 그 부품 넷의 자동 배선은 지우고 바로 다시 배선 (--no-route 면 래츠네스트만 남김)'],
  ['drc · rats','설계 규칙 검사 · 미연결(래츠네스트) 목록'],
  ['report [place|thermal|emc]','배치 지표 · 열 해석 · EMC 점검 요약'],
  ['undo · redo · clear','실행 취소 · 다시 실행 · 화면 지우기'],
  GUIDE_HELP,
  MECH_HELP,
  ['ai <요청>','Claude가 위 명령을 골라 실행. 헤더에서 결정론/AI를 고르면 문장·버튼이 그 방식으로 실행되고, AI 실행마다 모델 등급과 토큰(추정)을 표시']];
function cliSay(k,t){const e={k,t,id:++CLI.seq};CLI.log.push(e);if(CLI.log.length>400)CLI.log.shift();cliPaint(e);return e;}
function cliSet(e,t){e.t=t;cliPaint(e,true);}
function cliPaint(e,upd){copPaint('pcb',e,upd);}
function cliPanel(){return copEnsure();}
// the console lives in the 설계 도우미 panel now: "open" just focuses it
function cliToggle(on){if(on===false)return;copFocus('pcb');}
function cliBusy(b){CLI.busy=b;copBusyPaint();const r=$('#cliRun'),s=$('#cliStop'),i=$('#cliIn');if(r)r.disabled=b;if(s)s.hidden=!b;if(i)i.disabled=b;if(!b){CLI.stopReq=false;CLI.abort=null;setTimeout(()=>i&&CLI.open&&i.focus(),10);}}
const cliTick=()=>new Promise(r=>setTimeout(r,0));

/* ---- Claude (sample capability): probe once, quietly ---- */
async function cliAiProbe(){
  const badge=()=>{const b=$('#cliAi');if(!b)return;b.textContent=CLI.sample?'AI 사용 가능':'AI 없음 · 문장은 규칙으로 해석';b.classList.toggle('on',!!CLI.sample);};
  if(CLI.sample!==undefined){badge();return;}
  try{CLI.sample=window.claude&&typeof window.claude.use==='function'?await window.claude.use('sample'):null;}catch(e){CLI.sample=null;}
  if(!CLI.sample&&!(window.claude&&typeof window.claude.use==='function')&&typeof laiConfigured==='function'&&laiConfigured())CLI.sample=laiBuild(); // outside claude.ai: Messages API (key or proxy)
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
  ['비아 줄이기','gloss','배선을 넷별로 다시 깔아 비아를 줄여줘 (사후 최적화)'],
  ['가이드라인 점검','guide check','PCB 설계 가이드라인을 점검하고 가장 중요한 개선 3가지를 알려줘'],
  ['하우징 설계','housing','현재 보드에 맞는 보호 하우징을 설계하고 재질·IP·진동 조건별 트레이드오프를 비교해 추천해줘'],
  ['리포트','report all','배치·열·EMC 리포트를 보고 문제를 우선순위대로 요약해줘'],['도움말','help','이 콘솔로 할 수 있는 일을 짧게 알려줘']];
const CLI_CMDS=new Set(['zone','gloss','fix','autofix','width','analyze','analyse','safety','pinswap','housing','guide','help','?','status','board','strategies','strategy','reset','place','route','unroute','auto','lock','unlock','locks','move','rotate','flip','drc','rats','report','undo','redo','clear','ai','history']);

/* ---- snapshots for undo (same objects: tracks, pads and silk keep their identity) ---- */
function cliSnap(){return{poses:BD.comps.map(c=>({c,x:c.x,y:c.y,rot:c.rot||0,side:c.side})),layers:Object.fromEntries(Object.keys(BD.layers).map(k=>[k,BD.layers[k].slice()])),vias:BD.vias.slice(),
  board:{W:BD.W,H:BD.H,outline:JSON.parse(JSON.stringify(BD.outline)),shape:BD.shape?JSON.parse(JSON.stringify(BD.shape)):null,cut:BD.cutouts?JSON.parse(JSON.stringify(BD.cutouts)):null,nw:BD.netWidth?Object.assign({},BD.netWidth):null,nc:BD.netCurrent?Object.assign({},BD.netCurrent):null,oz:BD.oz||null,dT:BD.dT||null,holes:BD.drills.filter(d=>!d.own&&!d._pad).map(d=>[d,d.x,d.y]),cl:BD.copperLayers||2,stack:BD.stack,t:BD.t,pend:!!BD.pcbPending,pr:BD.powerReport||null,pb:BD.powerBus||null}};}
function cliRestore(s){
  s.poses.forEach(p=>{const c=p.c;if(c.side!==p.side)PCBEDIT.flip(BD,c);const dr=p.rot-(c.rot||0);if(Math.abs(dr)>1e-9)PCBEDIT.rotate(BD,c,dr);if(Math.abs(p.x-c.x)>1e-12||Math.abs(p.y-c.y)>1e-12)PCBEDIT.move(BD,c,p.x-c.x,p.y-c.y);c.rot=p.rot;});
  Object.keys(s.layers).forEach(k=>{BD.layers[k]=s.layers[k].slice();});BD.vias=s.vias.slice();
  if(s.board){const b=s.board;Object.keys(BD.layers).forEach(k=>{if(!(k in s.layers))delete BD.layers[k];});BD.W=b.W;BD.H=b.H;BD.outline=JSON.parse(JSON.stringify(b.outline));BD.shape=b.shape||null;BD.cutouts=b.cut||null;BD.netWidth=b.nw||null;BD.netCurrent=b.nc||null;BD.oz=b.oz||null;BD.dT=b.dT||null;b.holes.forEach(([d,x,y])=>{d.x=x;d.y=y;});BD.copperLayers=b.cl;BD.stack=b.stack;BD.t=b.t;BD.pcbPending=b.pend;if('pr' in b){if(b.pr)BD.powerReport=b.pr;else delete BD.powerReport;}if('pb' in b)BD.powerBus=b.pb;if(typeof pcbGatePaint==='function')setTimeout(pcbGatePaint,0);}
  PCBEDIT.rebuildNets(BD);}
function cliCommit(before,label){const after=cliSnap();pePush({copper:true,label,undo:()=>cliRestore(before),redo:()=>cliRestore(after)});}
function cliEnsureEdit(){if(!PE.on)peBegin();else PCBEDIT.prepare(BD);if(!(S.view==='T'||S.view==='B'))setView('T');}
function cliAfter(fit,keepSch){PE.drag=null;PE.route=null;if(fit)fit2();try{header();}catch(e){}if(typeof stepPaint==='function')setTimeout(stepPaint,0);if(typeof SV!=='undefined'&&!keepSch){SV.data=null;SV.lastKey='';}peChanged(true);}
function cliPower(){try{const cfg=thConfig();const P={};let any=false;Object.entries(cfg.P||{}).forEach(([k,v])=>{if(+v>0){P[k]=+v;any=true;}});return any?P:null;}catch(e){return null;}}
function cliStrat(a,def){const s=a.strategy||a.s||def||CLI.strategy;const k=AUTOPLACE.strategy(s);if(!k)throw new Error(`알 수 없는 전략: ${s} (balanced · thermal · noise · compact)`);return k;}
const f1=v=>(Math.round(v*10)/10).toString();

/* ---- command implementations ---- */
function cliStatus(){
  const ring=BD.outline[0];const R=PCBEDIT.cornerRadius(BD);const open=AUTOROUTE.openNets(BD);const rats=PCBEDIT.ratsnest(BD).length;const drc=PCBEDIT.drc(BD).length;
  const keys=PCB.cuKeys(BD);const auto=keys.reduce((a,s)=>a+BD.layers[s+'.cu'].filter(p=>p.auto).length,0);
  const per=keys.length>2?' ('+keys.map(k=>k+' '+BD.layers[k+'.cu'].filter(p=>p.t==='seg'||p.t==='path').length).join(' · ')+')':'';
  const planes=PCB.stackOf(BD).filter(x=>x.net&&x.role!=='sig').map(x=>`${x.k} ${x.net}`);
  return[`보드 ${f1(BD.W)} × ${f1(BD.H)} mm${R?` · 모서리 R${f1(R)}`:''}${BD.shape&&BD.shape.kind!=='rect'?' · '+PCBEDIT.shapeText(BD):PCBEDIT.rectLike(BD)?'':' · 사각형이 아닌 외곽'} · ${BD.copperLayers||2}층${planes.length?` (플레인 ${planes.join(', ')})`:''} · 두께 ${BD.t} mm${BD.pcbPending?' · PCB 설계 시작 전 (부품 미배치)':''}`,
    `부품 ${BD.comps.length}개 (상단 ${BD.comps.filter(c=>c.side==='T').length} · 하단 ${BD.comps.filter(c=>c.side==='B').length}) · 넷 ${BD.netOrder.length}개 · 비아 ${BD.vias.length}개 · 자동 트랙 ${auto}개${per}`,
    `열린 넷 ${open.length}개 · 래츠네스트 ${rats}개 · DRC ${drc}건 · 기본 전략 ${CLI.strategy} (${AUTOPLACE.STRATS[CLI.strategy].label})${CLI.lock.size?` · 고정 ${[...CLI.lock].join(', ')}`:''}`].join('\n');}
function cliBoard(a){
  const sub=a._[0];
  if(!sub)return cliStatus().split('\n')[0];
  if(sub==='shapes')return Object.entries(PCBEDIT.SHAPES).map(([k,v])=>`${k.padEnd(7)} ${v}`).join('\n')+'\n지금: '+PCBEDIT.shapeText(BD);
  if(sub==='shape'||sub==='cutout'){cliEnsureEdit();const snap=()=>({outline:JSON.parse(JSON.stringify(BD.outline)),W:BD.W,H:BD.H,shape:BD.shape?JSON.parse(JSON.stringify(BD.shape)):null,cut:BD.cutouts?JSON.parse(JSON.stringify(BD.cutouts)):null});
    const put=o=>{BD.outline=JSON.parse(JSON.stringify(o.outline));BD.W=o.W;BD.H=o.H;BD.shape=o.shape;BD.cutouts=o.cut;};const s0=snap();let msg;
    if(sub==='shape'){const kind=String(a._[1]||'').replace(/^l$/i,'L').replace(/^t$/i,'T');const dims=a._.slice(2).join(' ').split(/[\sx×]+/).filter(Boolean).map(parseFloat);
      const p={w:dims[0]||BD.W,h:dims[1]||(kind==='circle'||kind==='hex'||kind==='oct'?dims[0]||BD.W:BD.H),d:dims[0]||Math.min(BD.W,BD.H),r:a.corner!=null?+a.corner:undefined};
      if(a.cut){const m=String(a.cut).split(/x|×/i);p.cw=parseFloat(m[0]);p.ch=parseFloat(m[1]||m[0]);}if(a.at)p.at=String(a.at);
      if(a.pts)p.pts=String(a.pts).trim().split(/\s+/).map(t=>t.split(',').map(parseFloat));
      const r=PCBEDIT.setShape(BD,kind,p,{anchor:a.anchor==='center'?'center':'bl'});
      msg=`보드 모양 → ${r.label} · ${f1(r.W)} × ${f1(r.H)} mm${r.holesDropped?` · 외곽 밖 장착 구멍 ${r.holesDropped}개 삭제`:''}`+(r.outside.length?`\n보드 밖 부품 ${r.outside.length}개: ${r.outside.slice(0,12).join(', ')} → place 또는 reset으로 다시 배치하세요.`:'');}
    else{const k=String(a._[1]||'');if(k==='clear'){const n=PCBEDIT.clearCutouts(BD);msg=`컷아웃 ${n}개 삭제`;}
      else{const at=String(a.at||'').split(',').map(parseFloat);const p={x:at[0],y:at[1],r:a.corner!=null?+a.corner:0};
        if(k==='circle')p.d=parseFloat(a._[2]);else if(k==='rect'){const m=String(a._[2]||'').split(/x|×/i);p.w=parseFloat(m[0]);p.h=parseFloat(m[1]||m[0]);}else throw new Error('board cutout circle <지름> --at x,y · rect <가로>x<세로> --at x,y · clear');
        const r=PCBEDIT.addCutout(BD,k,p);msg=`컷아웃 #${r.n} ${k==='circle'?'Ø'+f1(p.d):f1(p.w)+'×'+f1(p.h)} @ ${f1(p.x)},${f1(p.y)}`+(r.outside.length?`\n컷아웃 위 부품 ${r.outside.length}개: ${r.outside.join(', ')} → 옮기세요.`:'');}}
    const s1=snap();pePush({copper:true,label:'board '+sub,undo:()=>{put(s0);cliAfter(true);},redo:()=>{put(s1);cliAfter(true);}});cliAfter(true);return msg;}
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
/* ---- copper layers and board minimisation ---- */
function cliLayers(a){const n=parseInt(a._[1]);if(!PCB.STACKS[n])throw new Error('board layers <2|4|6|8|10> [--pwr 넷] [--route]');
  cliEnsureEdit();const before=cliSnap();const n0=BD.copperLayers||2;
  const r=PCBEDIT.setLayers(BD,n,{pwr:a.pwr,gnd:a.gnd,t:a.t});const L=[`${n0}층 → ${n}층 · 두께 ${BD.t} mm${r.dropped?` · 없어진 내층의 트랙 ${r.dropped}개 삭제`:''}`,PCBEDIT.stackText(BD)];
  const planes=new Set(r.stack.filter(x=>x.net&&x.role!=='sig').map(x=>x.net));
  if(planes.size&&!BD.pcbPending){
    // nets now carried by a plane: their routed tracks are no longer needed, every pad drops a via into the plane instead
    const kill=[];PCB.cuKeys(BD).forEach(k=>BD.layers[k+'.cu'].forEach(p=>{if(p.auto&&!p.fan&&planes.has(p.net))kill.push(p);}));BD.vias.forEach(v=>{if(v.auto&&!v.fan&&planes.has(v.net))kill.push(v);});
    if(kill.length)AUTOROUTE.unroute(BD,kill);const fan=AUTOPLACE.fanout(BD,{});PCBEDIT.rebuildNets(BD);
    L.push(`플레인 넷 ${[...planes].join(', ')}: 기존 배선 ${kill.length}개를 지우고 플레인 비아 ${fan.vias}개를 넣었습니다${fan.fail.length?` (자리 없음: ${fan.fail.slice(0,6).join(', ')})`:''}.`);}
  const open=BD.pcbPending?0:AUTOROUTE.openNets(BD).length;
  cliCommit(before,'layers');cliAfter(true);
  if(n>2)L.push(`신호층 ${PCB.stackOf(BD).filter(x=>x.role==='sig').map(x=>PCB.cuName(x.k)).join(' · ')}을 배선에 씁니다.${open?` 열린 넷 ${open}개 → route (또는 board minimize --route)로 배선하세요.`:''}`);
  return L.join('\n');}
async function cliMinimize(a){
  cliEnsureEdit();const start=cliSnap();const u0=PE.undo.length;const W0=BD.W,H0=BD.H;const m=a.margin!=null?+a.margin:1;
  if(a.keep||(a._[0]||'').toLowerCase()==='fit'){
    const cs=BD.comps.filter(c=>c.kind!=='none');const bb=[Math.min(...cs.map(c=>c.bb[0])),Math.min(...cs.map(c=>c.bb[1])),Math.max(...cs.map(c=>c.bb[2])),Math.max(...cs.map(c=>c.bb[3]))];
    const W=Math.ceil((bb[2]-bb[0]+2*m)*2)/2,H=Math.ceil((bb[3]-bb[1]+2*m)*2)/2;PCBEDIT.translateAll(BD,m-bb[0],m-bb[1]);PCBEDIT.resizeBoard(BD,W,H,{anchor:'bl'});PCBEDIT.rebuildNets(BD);
    const after=cliSnap();pePush({copper:true,label:'minimize',undo:()=>{cliRestore(start);cliAfter(true);},redo:()=>{cliRestore(after);cliAfter(true);}});cliAfter(true);
    return`외곽을 부품에 맞춰 ${f1(W0)} × ${f1(H0)} → ${f1(W)} × ${f1(H)} mm로 줄였습니다 (여유 ${m} mm, 배치 유지). 장착 구멍이 부품과 겹치는지 drc로 확인하세요.`;}
  const st=cliStrat(a,'compact');const KS=AUTOPLACE.MIN_KS;const prog=cliSay('out','가장 작은 보드 크기를 찾는 중…');await cliTick();
  let best=null,routeTries=0;const maxRoute=a.tries?+a.tries:4;const pend0=!!BD.pcbPending;BD.pcbPending=false;
  // when the parts do not fit the original size the search keeps growing (up to --maxgrow × the original area, default 3) instead of stopping
  const grow=a.grow!==false&&!a['no-grow'];const maxA=W0*H0*(a.maxgrow?+a.maxgrow:3);let grew=false;
  // with --route a size that places but does not route clean is tried again with other placement seeds (--seeds, default 2)
  // before the board grows — the annealer's layout varies, and one seed is often enough to close the last connections
  const seeds=a.route?Math.max(1,a.seeds!=null?+a.seeds:2):1;let si=0;
  for(let i=0;i<KS.length;i++){
    AUTOPLACE.clearCopper(BD);
    const r=AUTOPLACE.minimize(BD,{ks:[KS[i]],max:false,strategy:st,margin:m,power:cliPower(),fixed:[...CLI.lock].filter(x=>BD.byRef[x]),seed:(a.seed!=null?+a.seed:1)+si*7919,both:!!a.both});const t=r.tries[0];
    if(t.W*t.H>W0*H0+1e-6){if(!grow){cliSay('out',`${f1(t.W)} × ${f1(t.H)} mm는 원래 보드보다 커서 멈춥니다 (--grow 로 계속).`);break;}
      if(t.W*t.H>maxA){cliSay('out',`${f1(t.W)} × ${f1(t.H)} mm는 원래 면적의 ${(a.maxgrow||3)}배를 넘어 멈춥니다 (--maxgrow N 으로 한도 변경).`);break;}
      if(!grew){grew=true;cliSay('out',`원래 크기 ${f1(W0)} × ${f1(H0)} mm에는 부품이 들어가지 않습니다 — 보드를 키워 가며 배치합니다.`);}}
    cliSet(prog,`크기 ${f1(t.W)} × ${f1(t.H)} mm: ${r.ok?'부품 배치 가능':'겹침 '+t.bad+'건 → 키움'}`);await cliTick();
    if(!r.ok)continue;
    if(!a.route){best={snap:cliSnap(),W:t.W,H:t.H,open:null};break;}
    AUTOPLACE.ensurePour(BD);routeTries++;cliSay('ok',`${f1(t.W)} × ${f1(t.H)} mm에서 배선 시도 ${routeTries}/${maxRoute}`);cliSay('ok',await cliRoute({strategy:st}));
    // judge the whole result: unconnected pads (planes and copper fill included), DRC errors and power paths short of their IPC width
    const rats=cliOpenCount(),drcN=PCBEDIT.drc(BD).length,pwBad=BD.powerReport?BD.powerReport.nets.filter(x=>!x.ok).length:0;const open=rats+drcN+pwBad;
    cliSay('ok',`${f1(t.W)} × ${f1(t.H)} mm: 미연결 ${rats} · DRC ${drcN} · 전류 폭 부족 ${pwBad}`);
    if(!best||open<best.open)best={snap:cliSnap(),W:t.W,H:t.H,open,rats,drcN,pwBad};
    if(!open||CLI.stopReq||routeTries>=maxRoute)break;
    if(++si<seeds){i--;cliSay('out',`문제 ${open}건 — 같은 크기에서 다른 배치로 다시 시도합니다 (${si+1}/${seeds}).`);await cliTick();continue;}
    si=0;cliSay('out',`문제 ${open}건 — 한 단계 큰 크기로 다시 시도합니다.`);await cliTick();}
  PE.undo.splice(u0);
  if(!best){cliRestore(start);BD.pcbPending=pend0;cliAfter(true);return grow?`원래 면적의 ${a.maxgrow||3}배까지 키워도 배치할 수 없었습니다. lock한 부품을 풀거나 --margin을 줄이거나 --both(양면)로 해 보세요.`:`원래 크기 ${f1(W0)} × ${f1(H0)} mm보다 작게 배치할 수 없었습니다. board minimize --grow 로 키워 가며 배치하거나, lock한 부품을 풀거나 --margin을 줄여 보세요.`;}
  cliRestore(best.snap);const after=cliSnap();pePush({copper:true,label:'minimize',undo:()=>{cliRestore(start);cliAfter(true);},redo:()=>{cliRestore(after);cliAfter(true);}});cliAfter(true);
  const A0=W0*H0,A1=best.W*best.H;
  return`보드 ${f1(W0)} × ${f1(H0)} → ${f1(best.W)} × ${f1(best.H)} mm (면적 ${A1<=A0?Math.round((1-A1/A0)*100)+'% 감소':Math.round((A1/A0-1)*100)+'% 증가 — 원래 크기에 부품이 안 들어가 키움'}) · ${st} 전략으로 다시 배치${a.both?' · 양면':''} · ${BD.copperLayers||2}층`+
    (best.open==null?'\n배선은 지웠습니다 → route로 배선하세요 (배선까지 확인하려면 board minimize --route).':best.open?`\n가장 좋은 결과도 문제 ${best.open}건 (미연결 ${best.rats} · DRC ${best.drcN} · 전류 폭 부족 ${best.pwBad}) — board size로 조금 키우거나 --tries 를 늘려 보세요.`:'\n모든 넷 배선 완료 · DRC 0 · 전류 폭 충족.')+'\n'+cliMetricText(AUTOPLACE.metrics(BD,{power:cliPower()}));}
/* ---- MCU pin re-assignment for routing (the PCB step may change the circuit: which MCU pin carries which signal) ---- */
async function cliPinswap(a){
  const H0=HS.H&&HS.mcu&&BD.byRef[HS.mcu]?HS.H:null;const mcu=H0?HS.mcu:HSIS.pickMcu(BD,[]);if(!mcu)throw new Error('보드에서 MCU를 찾지 못했습니다.');
  const H=H0||HSIS.fromBoard(BD,mcu);const res=PINREC.recommend(BD,H,mcu,{mode:a.all?'all':'keep'});if(res.error)throw new Error(res.error);
  const ch=res.recs.filter(r=>r.rec&&(r.status==='change'||r.status==='new'));
  const L=[`${mcu} 핀 재배정 ${a.all?'(전체 다시 배정)':'(빈 핀·기능 오류·더 가까운 핀)'} · 변경 ${res.sum.change} · 새 배정 ${res.sum.new} · 유지 ${res.sum.keep} · 불가 ${res.sum.none}`];
  ch.slice(0,24).forEach(r=>L.push(`  ${r.signal}: ${r.cur||'미배정'} → ${r.rec.pin} ${r.rec.port||''} (${r.rec.sig||r.roleName}${r.rec.dist!=null?` · 상대 핀까지 ${f1(r.rec.dist)} mm`:''})`));
  if(!ch.length)return L.concat('바꿀 핀이 없습니다. --all로 전체를 다시 배정해 볼 수 있습니다.').join('\n');
  if(!a.apply)return L.concat('적용하려면 pinswap --apply (보드 넷·회로도·HSIS가 함께 바뀌고 Ctrl+Z로 되돌릴 수 있음).').join('\n');
  cliEnsureEdit();const before=cliSnap();const nets0=BD.comps.map(c=>c.pads.map(p=>p.net));const sch0=BD.schSheets?SCHEDIT.snapshot(BD.schSheets):null;const items0=H.items.map(it=>Object.assign({},it));
  const nets=new Set();ch.forEach(r=>{const pad=BD.byRef[mcu].pads.find(p=>String(p.n)===String(r.rec.pin));if(pad&&pad.net)nets.add(pad.net);const op=r.cur&&BD.byRef[mcu].pads.find(p=>String(p.n)===String(r.cur));if(op&&op.net)nets.add(op.net);if(r.it.net)nets.add(r.it.net);});
  const done=PINREC.apply(BD,H,res,ch.map(r=>r.id));
  // copper of the moved nets no longer matches the pins
  const kill=[];PCB.cuKeys(BD).forEach(k=>BD.layers[k+'.cu'].forEach(p=>{if((p.t==='seg'||p.t==='path')&&!p.fan&&nets.has(p.net))kill.push(p);}));BD.vias.forEach(v=>{if(!v.fan&&nets.has(v.net))kill.push(v);});
  kill.forEach(p=>PCBEDIT.removePrim(BD,p));PCBEDIT.rebuildNets(BD);
  // the schematic follows the board netlist
  BD.schSheets=null;if(typeof SV!=='undefined'){SV.data=null;SV.lastKey='';}if(H0&&typeof hsisRun==='function'){hsisRun();if(HS.rec)HS.rec.res=null;}
  const after=cliSnap(),nets1=BD.comps.map(c=>c.pads.map(p=>p.net)),items1=H.items.map(it=>Object.assign({},it));
  const setNets=(v,items,sch)=>{BD.comps.forEach((c,i)=>c.pads.forEach((p,j)=>{p.net=v[i][j];}));H.items.forEach((it,i)=>Object.assign(it,items[i]));BD.schSheets=sch?SCHEDIT.restore(sch):null;PINREC.relink(BD);if(typeof SV!=='undefined'){SV.data=null;SV.lastKey='';}};
  pePush({copper:true,label:'pinswap',undo:()=>{setNets(nets0,items0,sch0);cliRestore(before);},redo:()=>{setNets(nets1,items1,null);cliRestore(after);}});
  cliAfter(false);if(S.sch!=='off'&&typeof drawSch==='function')try{schData();drawSch();}catch(e){}
  L.push(`적용: ${done.length}개 신호 · 바뀐 넷의 트랙·비아 ${kill.length}개 삭제 · 회로도를 보드 넷리스트로 다시 그림${H0?' · HSIS 갱신':''}`);
  if(a.route){L.push(await cliRoute({nets:[...nets].filter(n=>BD.nets[n]).join(',')}));}else L.push('route로 바뀐 넷을 배선하세요.');
  return L.join('\n');}
/* depth of each net's pins inside runs of adjacent signal pins on fine-pitch rows (QFP / SOIC / TSSOP sides): 0 at a run end,
   1 for the next pin in, … — the router escapes the deepest first */
/* ---- parallel routing: Web Workers built from the page's own core scripts (data-w) ---- */
let WK_URL=null;function wkUrl(){if(WK_URL)return WK_URL;const src=[...document.querySelectorAll('script[data-w]')].map(s=>s.textContent).join('\n')+'\nROUTEJOB.workerMain();const __hj=self.onmessage;AUTOROUTE.workerMain();const __hr=self.onmessage;self.onmessage=e=>(e.data&&e.data.cmd==="job"?__hj:__hr)(e);';WK_URL=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return WK_URL;}
function wkRun(msg){return new Promise((res,rej)=>{let w;try{w=new Worker(wkUrl());}catch(e){return rej(e);}const kill=()=>{try{w.terminate();}catch(e){}};
  w.onmessage=e=>{kill();const m=e.data;if(m&&m.ok)res(m);else rej(new Error(m&&m.err||'worker'));};w.onerror=e=>{kill();rej(new Error(e.message||'worker error'));};w.postMessage(msg);});}
/* how many workers: --par N / --par auto; without --par the routing pass stays sequential (the hard, cross-board nets dominate it and are
   sequential by nature) and the post-optimisation uses workers when the machine has 4 cores or more (its per-net work splits by strip) */
function wkCount(a,auto){if(typeof Worker==='undefined')return 0;const hc=navigator.hardwareConcurrency||2;const v=a.par!=null?a.par:(CLI.par!=null?CLI.par:(auto&&hc>=4?'auto':0));if(v===false||/^(0|off|no)$/i.test(String(v)))return 0;
  if(v===true||v==='auto')return Math.min(4,Math.max(2,hc-1));return Math.max(0,Math.min(8,+v||0));}
/* split the board into K strips (vertical cuts, each at the x that leaves the most nets wholly inside one side); a net is local to a strip
   when its pads plus a margin fit inside — those are routed in parallel, each worker confined to its strip; the rest stay sequential */
function wkRegions(B,nets,K,margin){const bb={};nets.forEach(n=>{const ps=(B.nets[n]&&B.nets[n].pads)||[];if(!ps.length)return;bb[n]=[Math.min(...ps.map(p=>p.x))-margin,Math.min(...ps.map(p=>p.y))-margin,Math.max(...ps.map(p=>p.x))+margin,Math.max(...ps.map(p=>p.y))+margin];});
  const fits=(n,r)=>{const b=bb[n];return!!b&&b[0]>=r[0]&&b[1]>=r[1]&&b[2]<=r[2]&&b[3]<=r[3];};
  let regs=[[0,0,B.W,B.H]];
  while(regs.length<K){let best=null;regs.forEach((r,ri)=>{const vert=(r[2]-r[0])>=(r[3]-r[1]);const lo=vert?r[0]:r[1],hi=vert?r[2]:r[3];if(hi-lo<20)return;
      for(let c=lo+8;c<=hi-8;c+=1){const A=vert?[r[0],r[1],c,r[3]]:[r[0],r[1],r[2],c],Bq=vert?[c,r[1],r[2],r[3]]:[r[0],c,r[2],r[3]];const na=nets.filter(n=>fits(n,A)).length,nb=nets.filter(n=>fits(n,Bq)).length;const sc=Math.min(na,nb)*2+na+nb;if(!best||sc>best.sc)best={ri,A,B:Bq,sc,na,nb};}});
    if(!best||Math.min(best.na,best.nb)<4)break;regs.splice(best.ri,1,best.A,best.B);}
  if(regs.length<2)return null;const groups=regs.map(r=>({rect:r,nets:nets.filter(n=>fits(n,r))}));const local=new Set();groups.forEach(g=>g.nets.forEach(n=>local.add(n)));
  return{groups:groups.filter(g=>g.nets.length),global:nets.filter(n=>!local.has(n))};}
/* high-current nets whose IPC width exceeds a track: copper fill in the power-stage region (stage ∪ input zone, else the
   bounding box of the power parts), stitching vias to the GND plane, then the effective width of each net between its
   power terminals compared with IPC-2221 at the board's copper weight / ΔT */
/* the power nets of the board (≥ 3 A supply / phase / ground) and the region their copper may use: stage ∪ input zone, else
   the box around the power parts. route = the ones routed first and protected by a corridor (not GND: it is a plane). */
/* ---- place · route · gloss: the pipelines live in ROUTEJOB (src/route/routejob.js) and run in a Web Worker when the browser
   has one (the page stays responsive: panning, zooming and the console keep working, [중지] ends the job); otherwise inline ---- */
function jobArgs(a,strat){return Object.assign({},a,{strategy:strat||cliStrat(a),pwrMap:cliPower(),fixed:[...CLI.lock],dirDef:CLI.dirDef,mst:CLI.mst,inFix:!!CLI.inFix,par:a.par!=null?a.par:CLI.par});}
function jobUI(){const U={last:null};U.say=(k,t)=>{const e=cliSay(k,t);U.last=e;return e;};U.set=t=>{if(U.last)cliSet(U.last,t);};U.tick=cliTick;U.stopped=()=>!!CLI.stopReq;
  U.prog=(id,label,o)=>typeof progStart==='function'?progStart(id,label,Object.assign({},o,{stop:()=>{CLI.stopReq=true;}})):null;U.progSet=(id,o)=>typeof progSet==='function'&&progSet(id,o);U.progEnd=id=>typeof progEnd==='function'&&progEnd(id);
  U.par={count:wkCount,regions:wkRegions,run:wkRun};return U;}
function jobUseWorker(a){return typeof Worker!=='undefined'&&CLI.jobWorker!==false&&!a.inline&&!/^(0|off|no)$/i.test(String(a.worker||''));}
/* one job worker is kept alive between jobs (its scripts and the WebAssembly module stay compiled, its grid memories pooled); [중지] terminates it */
function jobWorkerGet(){if(CLI.jobW)return CLI.jobW;const w=new Worker(wkUrl());CLI.jobW=w;return w;}
function jobWorkerDrop(){if(CLI.jobW){try{CLI.jobW.terminate();}catch(e){}CLI.jobW=null;}}
function jobInWorker(kind,A,onProg){return new Promise((res,rej)=>{let w;try{w=jobWorkerGet();}catch(e){return rej(e);}let done=false;const id=++CLI.seq;
  const iv=setInterval(()=>{if(CLI.stopReq&&!done){done=true;clearInterval(iv);jobWorkerDrop();rej(new Error('중지'));}},150);
  w.onmessage=e=>{const m=e.data;if(!m||m.id!==id)return;if(m.prog!=null){onProg(m.prog);return;}done=true;clearInterval(iv);if(m.ok)res(m);else{jobWorkerDrop();rej(new Error(m.err||'worker'));}};
  w.onerror=e=>{done=true;clearInterval(iv);jobWorkerDrop();rej(new Error(e.message||'worker error'));};
  const json=ROUTEJOB.boardToJSON(BD);w.postMessage({id,cmd:'job',kind,board:json,a:Object.assign({},A,{par:0})});});}
function jobApply(m){const r=BOARDSNAP.apply(BD,m.snap);const x=m.extra||{};if(x.zones)BD.zones=x.zones;BD._avoid=x._avoid||null;BD._nb=x._nb||null;BD.pcbPending=!!x.pcbPending;
  if(x.rats&&x.drc&&typeof PE!=='undefined'){const byRef=BD.byRef||{};x.drc.forEach(d=>{if(d.refs)d.refs=d.refs.filter(Boolean);});PE.fresh={B:BD,rats:x.rats,drc:x.drc};PE.drcKey=null;}return r;}
async function cliJob(kind,a,label,strat){const A=jobArgs(a,strat);cliEnsureEdit();const before=cliSnap();let text=null;
  if(jobUseWorker(a)){const prog=cliSay('out',`${label} — 백그라운드에서 실행 중… (화면은 그대로 쓸 수 있습니다)`);const t0=performance.now();
    try{const m=await jobInWorker(kind,A,t=>cliSet(prog,t));jobApply(m);text=m.text;cliSet(prog,`${label} 완료 · ${((performance.now()-t0)/1000).toFixed(1)} s (백그라운드)`);}
    catch(e){if(/^중지/.test(e.message||'')){cliRestore(before);cliAfter(false);return'중지했습니다 (보드는 그대로).';}cliSay('err',`백그라운드 실행 실패 → 이 탭에서 실행합니다: ${String(e.message||e).split('\n')[0]}`);text=null;}}
  if(text==null)text=await ROUTEJOB.runJob(BD,kind,A,jobUI());
  if(kind==='place')CLI.strategy=A.strategy;if(kind==='route')CLI.routed=true;
  cliCommit(before,label);cliAfter(false,true);return text;}  // placement and routing leave the netlist alone: the schematic view stays valid
async function cliPlace(a,scratch){return cliJob('place',Object.assign({},a,{scratch:!!scratch}),scratch?'reset':'place');}
async function cliRoute(a){return cliJob('route',a,'route');}
async function cliGloss(a,quiet){return cliJob('gloss',Object.assign({},a||{},{quiet:!!quiet}),'gloss');}
function cliMetricText(m){return ROUTEJOB.metricText(m);}
function cliUnroute(){cliEnsureEdit();const before=cliSnap();const n=PCB.cuKeys(BD).reduce((a,s)=>a+BD.layers[s+'.cu'].filter(p=>p.auto).length,0)+BD.vias.filter(v=>v.auto).length;AUTOROUTE.unroute(BD);PCBEDIT.rebuildNets(BD);cliCommit(before,'unroute');cliAfter(false);return`자동 배선 ${n}개(트랙·비아)를 지웠습니다.`;}
/* ---- unrouted nets → find a fix by itself (cheapest first, stop at the first fully routed result, keep the best) ----
   Every attempt starts from the same snapshot, so steps do not compound; the board only grows / gains layers in the steps
   that say so. Score: (unconnected + DRC) ×1000 + area growth ×400 (per 100 %) + added layers ×150 → a DRC error weighs as much as an open
   connection, and growing the board or adding layers has to remove at least one problem to be chosen. */
/* unconnected pad pairs left on the board, including GND / poured nets (a pad that could not reach its plane) */
function cliOpenCount(){try{return PCBEDIT.ratsnest(BD).length;}catch(e){return AUTOROUTE.openNets(BD).length;}}
/* post-route optimisation on the nets that have auto copper (see AUTOROUTE.gloss) */
async function cliFix(a){a=a||{};if(BD.pcbPending)throw new Error('부품이 아직 배치되지 않았습니다. 먼저 reset 또는 auto를 실행하세요.');
  cliEnsureEdit();const st0=cliStrat(a);const start=cliSnap();const u0=PE.undo.length;const W0=BD.W,H0=BD.H,L0=BD.copperLayers||2;
  const open0=cliOpenCount();if(!open0&&!a.force)return'미배선(래츠네스트)이 없습니다.';
  const shaped=BD.shape&&BD.shape.kind&&BD.shape.kind!=='rect';const maxG=a.maxgrow?Math.max(1,+a.maxgrow):1.5;const maxL=a.maxlayers?+a.maxlayers:6;
  const stacks=Object.keys(PCB.STACKS).map(Number).filter(n=>n>L0&&n<=maxL).sort((x,y)=>x-y).slice(0,2);
  const alt=st0==='balanced'?'thermal':'balanced';
  const place=async(st,seed)=>{const r=await cliPlace({strategy:st,seed,both:a.both},true);if(AUTOPLACE.ensurePour)AUTOPLACE.ensurePour(BD);return r;};
  const route=async st=>{await cliRoute({strategy:st});};
  const size=async f=>{await cliRun(`board size ${f1(W0*f)} ${f1(H0*f)} --anchor center`,true);};
  const layers=async n=>{await cliRun(`board layers ${n}`,true);};
  const steps=[];
  steps.push({k:'reroute',label:'전부 지우고 다시 배선 (짧은 넷 먼저)',run:async()=>{AUTOROUTE.unroute(BD);PCBEDIT.rebuildNets(BD);await cliRoute({strategy:st0,order:'length'});}});
  [7919*3+1,7919*5+1].forEach((sd,i)=>steps.push({k:'seed'+i,label:`다른 시드로 재배치 ${i+1}/2 → 배선`,run:async()=>{await place(st0,sd);await route(st0);}}));
  steps.push({k:'strat',label:`${alt} 전략으로 재배치 → 배선`,run:async()=>{await place(alt,1);await route(alt);}});
  if(a.pinswap)steps.push({k:'pinswap',label:'MCU 핀 재배정 → 재배치 → 배선 (회로 변경)',run:async()=>{await cliPinswap({});await place(st0,1);await route(st0);}});
  if(!shaped&&a.grow!==false&&!a['no-grow'])[1.1,1.2,1.35,1.5].filter(f=>f<=maxG+1e-9).forEach(f=>steps.push({k:'grow'+f,label:`보드 ${Math.round((f-1)*100)}% 키움 (${f1(W0*f)} × ${f1(H0*f)} mm) → 재배치 → 배선`,area:f*f,run:async()=>{await size(f);await place(st0,1);await route(st0);}}));
  if(a.layers!==false&&!a['no-layers'])stacks.forEach(n=>{steps.push({k:'L'+n,label:`${n}층으로 → 재배치 → 배선 (크기 유지)`,L:n,run:async()=>{await layers(n);await place(st0,1);await route(st0);}});
    if(!shaped&&a.grow!==false&&!a['no-grow']&&maxG>=1.2)steps.push({k:'L'+n+'g',label:`${n}층 + 보드 20% 키움 → 재배치 → 배선`,L:n,area:1.44,run:async()=>{await layers(n);await size(1.2);await place(st0,1);await route(st0);}});});
  const score=()=>{const o=cliOpenCount(),d=PCBEDIT.drc(BD).length;return{o,d,s:(o+d)*1000+Math.max(0,(BD.W*BD.H)/(W0*H0)-1)*400+Math.max(0,(BD.copperLayers||2)-L0)*150};};
  const s0=score();let best={...s0,snap:start,label:'처음 상태'};const tried=[];
  cliSay('out',`미연결 ${open0}개(래츠네스트) — 개선안을 차례로 시도합니다 (${steps.length}단계, 다 배선되면 멈춤).`);
  const pid=typeof progStart==='function'?progStart('fix','미배선 개선',{total:steps.length,stop:()=>{CLI.stopReq=true;}}):null;
  CLI.inFix=true;
  try{for(let i=0;i<steps.length;i++){const S=steps[i];if(CLI.stopReq)break;
      if(pid)progSet('fix',{i,label:`미배선 개선 ${i+1}/${steps.length} · ${S.label}`});
      cliRestore(start);const line=cliSay('out',`${i+1}/${steps.length} ${S.label}…`);await cliTick();
      try{await S.run();}catch(e){cliSet(line,`${i+1}/${steps.length} ${S.label} — 건너뜀: ${e.message||e}`);continue;}
      const r=score();tried.push({label:S.label,o:r.o,d:r.d});
      cliSet(line,`${i+1}/${steps.length} ${S.label} → 미연결 ${r.o} · DRC ${r.d}${r.s<best.s?' (지금까지 최선)':''}`);
      if(r.s<best.s)best={...r,snap:cliSnap(),label:S.label};
      if(!r.o&&!r.d)break;}
    // polish: on top of the best result, the nets still open get a deeper search (more expansions, more rip-up rounds)
    if((best.o||best.d)&&!CLI.stopReq){cliRestore(best.snap);const line=cliSay('out',`마무리: 가장 좋은 결과에서 남은 미연결 ${best.o}개만 더 깊게 탐색해 다시 배선…`);if(pid)progSet('fix',{i:steps.length,label:'미배선 개선 · 마무리 (남은 넷 깊게 탐색)'});await cliTick();
      try{await cliRoute({strategy:st0,exp:(BD.copperLayers||2)>2?2400000:1200000});const r=score();cliSet(line,`마무리: 남은 넷 깊게 탐색 → 미연결 ${r.o} · DRC ${r.d}${r.s<best.s?' (개선)':''}`);if(r.s<best.s)best={...r,snap:cliSnap(),label:best.label+' + 마무리 재배선'};}
      catch(e){cliSet(line,'마무리 건너뜀: '+(e.message||e));}}}
  finally{CLI.inFix=false;CLI.routed=false;if(pid)progEnd('fix');}
  cliRestore(best.snap);if(!CLI.stopReq&&best.snap!==start){try{const g=await cliGloss({},true);if(g)cliSay('ok',g);}catch(e){}}PE.undo.splice(u0);const after=cliSnap();pePush({copper:true,label:'fix',undo:()=>{cliRestore(start);cliAfter(true);},redo:()=>{cliRestore(after);cliAfter(true);}});cliAfter(true);
  const L=[`미연결(래츠네스트) ${s0.o} → ${best.o}개${best.label!=='처음 상태'?` · 채택: ${best.label}`:' · 개선안 없음 (처음 상태 유지)'}${CLI.stopReq?' · 중지함':''}`,
    `보드 ${f1(W0)} × ${f1(H0)} → ${f1(BD.W)} × ${f1(BD.H)} mm · ${L0} → ${BD.copperLayers||2}층 · DRC ${best.d}건`];
  if(best.o){const nets=[...new Set(PCBEDIT.ratsnest(BD).map(r=>r.net))].slice(0,8);L.push(`남은 미배선: ${nets.join(', ')}${best.o>8?' …':''}`);
    L.push('다음 방법: fix --maxgrow 2 (더 크게) · fix --maxlayers 8 · fix --pinswap (MCU 핀 재배정, 회로 변경) · 남은 넷을 수동 배선 · 대전류 넷은 동박면(pour)');}
  if(best.d)L.push(`DRC 위반 ${best.d}건이 남았습니다 → drc 로 위치를 보고 고치세요.`);
  L.push('되돌리기 한 번(Ctrl+Z)으로 개선 전 상태로 돌아갑니다.');return L.join('\n');}
async function cliAuto(a){
  const st=cliStrat(a,a._[0]);const tries=Math.max(1,Math.min(5,a.tries?+a.tries:3));let best=null;cliEnsureEdit();const start=cliSnap();const u0=PE.undo.length;
  let lastK=0;for(let k=0;k<tries;k++){lastK=k;
    if(k){cliRestore(start);cliSay('out',`미배선이 남아 다른 시드로 다시 시도합니다 (${k+1}/${tries}).`);}
    cliSay('ok',await cliPlace({strategy:st,seed:a.seed!=null?+a.seed+k:1+k*7919,both:a.both},true));await cliTick();
    cliSay('ok',await cliRoute({strategy:st}));
    const open=AUTOROUTE.openNets(BD).length,d=PCBEDIT.drc(BD).length;const al=PCB.cuKeys(BD).reduce((s,L)=>s+BD.layers[L+'.cu'].filter(p=>p.auto).length,0);
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
/* move / rotate / flip one part. Its pads leave the tracks behind, so the auto-routed tracks of its nets are removed and
   (unless --no-route) those nets are routed again; hand-drawn tracks stay and show up in the ratsnest/DRC if now open. */
async function cliOne(op,a){cliEnsureEdit();const[c]=cliRefs([a._[0]||'']);const before=cliSnap();
  const planes=new Set(PCB.stackOf(BD).filter(x=>x.net&&x.role!=='sig').map(x=>x.net));const nets=new Set(c.pads.map(p=>p.net).filter(n=>n&&!planes.has(n)));
  const routed=[];PCB.cuKeys(BD).forEach(k=>BD.layers[k+'.cu'].forEach(p=>{if(p.auto&&!p.fan&&nets.has(p.net))routed.push(p);}));BD.vias.forEach(v=>{if(v.auto&&!v.fan&&nets.has(v.net))routed.push(v);});
  if(op==='move'){const x=parseFloat(a._[1]),y=parseFloat(a._[2]);if(!isFinite(x)||!isFinite(y))throw new Error('move <부품> <x> <y> [각도]');if(a._[3]!=null){const r=parseFloat(a._[3]);PCBEDIT.rotate(BD,c,r-(c.rot||0));}PCBEDIT.move(BD,c,x-c.x,y-c.y);}
  else if(op==='rotate'){const r=parseFloat(a._[1]);if(!isFinite(r))throw new Error('rotate <부품> <각도>');PCBEDIT.rotate(BD,c,r);}
  else PCBEDIT.flip(BD,c);
  let note='';
  if(routed.length){AUTOROUTE.unroute(BD,routed);PCBEDIT.rebuildNets(BD);note=` · 연결된 넷 ${nets.size}개의 자동 트랙 ${routed.length}개 지움`;}
  cliCommit(before,op);S.selRef=c.ref;cliAfter(false);
  let head=`${c.ref} · X ${c.x.toFixed(2)} Y ${c.y.toFixed(2)} mm · ${Math.round(c.rot||0)}° · ${c.side==='T'?'상단':'하단'}${note}`;
  if(routed.length&&a.route!==false&&!a['no-route']&&a.noroute==null){try{const r=await cliRoute({_:[],nets:[...nets].join(',')});head+='\n다시 배선: '+String(r).split('\n').slice(-1)[0];}catch(e){head+='\n다시 배선 실패: '+(e.message||e)+' → route 로 배선하세요';}}
  else if(nets.size){const open=AUTOROUTE.openNets(BD).filter(o=>nets.has(o.net)).length;if(open)head+=`\n열린 연결 ${open}개 (래츠네스트) → route 로 배선하세요`;}
  return head;}

/* natural language → commands, used when Claude is not available */
/* net name from loose text: exact (any case) → without +/-/_/space ("12V" → "+12V", "vbat" → "VBAT") → unique substring */
function cliNetFind(tok){const N=Object.keys(BD.nets||{});if(!tok)return null;const t=String(tok).trim();
  let k=N.find(n=>n.toLowerCase()===t.toLowerCase());if(k)return k;
  const norm=x=>String(x).toUpperCase().replace(/^[+]/,'').replace(/[\s_\-.]/g,'');const nt=norm(t);if(!nt)return null;
  const eq=N.filter(n=>norm(n)===nt);if(eq.length)return eq.sort((a,b)=>(a[0]==='+'?0:1)-(b[0]==='+'?0:1))[0];
  const sub=N.filter(n=>norm(n).includes(nt));return sub.length===1?sub[0]:null;}
function cliNetHint(tok){const N=Object.keys(BD.nets||{});const nt=String(tok).toUpperCase().replace(/[^A-Z0-9]/g,'');const c=N.filter(n=>n.toUpperCase().replace(/[^A-Z0-9]/g,'').includes(nt)).slice(0,6);return c.length?` — 후보: ${c.join(', ')}`:'';}
/* "x2", "2x", "×1.5", "2배", "+50%", "-20%" → factor */
function cliWidthFactor(v){v=String(v).trim();let m=v.match(/^[x×*]\s*(\d+(?:\.\d+)?)$/i)||v.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|배)$/i);if(m)return +m[1]>0?+m[1]:null;
  m=v.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*%$/);if(m)return 1+(m[1]==='-'?-1:1)*(+m[2])/100;return null;}
/* the width a net has now: its widest routed track, else the fixed width, else the default/IPC width */
function cliNetWidthNow(key){let w=0;PCB.cuKeys(BD).forEach(k=>BD.layers[k+'.cu'].forEach(p=>{if(p.net===key&&(p.t==='path'||p.t==='seg'||p.t==='track')&&p.w>w)w=p.w;}));
  if(w)return +w.toFixed(3);if(BD.netWidth&&BD.netWidth[key]!=null)return +BD.netWidth[key];const W=CURRENT.widths(BD,{oz:BD.oz||1,dT:BD.dT||10})[key];return W?W.w:0.2;}
function cliNL(t){const s=t.toLowerCase();const out=[];
  // unrouted → automatic improvement: "미배선 해결해줘", "미배선 없애", "배선 안 된 거 고쳐", "알아서 개선"
  if(/(미배선|배선\s*안\s*된|안\s*된\s*배선|unrouted|open\s*net)/.test(s)&&/(해결|없애|고쳐|개선|처리|줄여|fix|알아서|자동)/.test(s)||/^(fix|개선)$/.test(s.trim())){const g=s.match(/(\d+(?:\.\d+)?)\s*배/);out.push(`fix${/층/.test(s)&&!/층\s*(유지|그대로)|층은\s*안/.test(s)?'':''}${g?' --maxgrow '+g[1]:''}${/핀\s*(재배정|스왑|바꿔)|pinswap/.test(s)?' --pinswap':''}${/키우지\s*(말|마)|크기\s*(유지|그대로)/.test(s)?' --no-grow':''}${/층\s*(유지|그대로|늘리지)/.test(s)?' --no-layers':''}`);return out;}
  const strat=/열|발열|방열|thermal|heat/.test(s)?'thermal':/노이즈|잡음|emc|emi|noise/.test(s)?'noise':/작게|소형|compact|촘촘|조밀/.test(s)?'compact':/균형|balanced/.test(s)?'balanced':null;
  const m=s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)/)||(/보드|board|크기|사이즈/.test(s)&&s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:,|와|과|및|by|\s)\s*(\d+(?:\.\d+)?)/));
  if(m&&/보드|board|크기|사이즈|size|mm|x|×/.test(s))out.push(`board size ${m[1]} ${m[2]}${/가운데|중앙|center/.test(s)?' --anchor center':''}`);
  // one part: "U3를 하단으로 (뒤집어)", "C5를 20,30으로 옮겨", "U1 90도 돌려" — refs are the original text's case
  const refs=[...t.matchAll(/\b([A-Z]{1,3}\d{1,3})\b/g)].map(x=>x[1]).filter(r=>BD.byRef&&BD.byRef[r]);
  if(refs.length&&!/보드|board|기판/.test(s)){const nr=/배선\s*(없이|말고|하지)|--no-route/.test(s)?' --no-route':'';
    if(/하단|bottom|뒷면|뒤집|반대\s*면|flip|아랫면/.test(s)&&!/상단으로/.test(s)){refs.forEach(r=>{if(BD.byRef[r].side!=='B')out.push(`flip ${r}${nr}`);});return out;}
    if(/상단으로|top으로|윗면으로/.test(s)){refs.forEach(r=>{if(BD.byRef[r].side==='B')out.push(`flip ${r}${nr}`);});return out;}
    const mv=s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[,\s]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:으로|로|위치|에)/);const rot=s.match(/(\d+)\s*(?:도|°|deg)/);
    if(mv&&/옮|이동|move|놓/.test(s)){refs.forEach(r=>out.push(`move ${r} ${mv[1]} ${mv[2]}${rot?' '+rot[1]:''}${nr}`));return out;}
    if(rot&&/돌|회전|rotate/.test(s)){refs.forEach(r=>out.push(`rotate ${r} ${rot[1]}${nr}`));return out;}}
  // board shape: "원형 보드 60mm", "보드를 L자로 (절개 40x25 오른쪽 위)", "육각형 50", "라운드 모서리 3"
  const shp=/원형|동그란|circle|round\s*board|원판/.test(s)?'circle':/타원|스타디움|oval|stadium|캡슐/.test(s)?'oval':/\bL\s*자|ㄱ\s*자|l-?shape/i.test(s)?'L':/\bT\s*자|t-?shape/i.test(s)?'T':/육각/.test(s)||/\bhex/i.test(s)?'hex':/팔각|octagon/i.test(s)?'oct':/라운드|둥근\s*모서리|rounded/.test(s)?'round':/사각형으로|직사각/.test(s)?'rect':null;
  if(shp&&/보드|board|기판|모양|외곽|형상|shape|모서리/.test(s)){const d=s.match(/(?:지름|직경|Ø|⌀|φ|diameter)?\s*(\d+(?:\.\d+)?)\s*mm/)||s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:짜리|의|로)/);const cm=s.match(/(?:절개|컷|cut|기둥|stem)\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);const pairs=[...s.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/g)];const cut=cm||(pairs.length>=2?pairs[1]:(!m?pairs[0]:null));const at=/오른쪽\s*위|우상|top.?right|\btr\b/i.test(s)?'tr':/왼쪽\s*위|좌상|top.?left|\btl\b/i.test(s)?'tl':/오른쪽\s*아래|우하|bottom.?right|\bbr\b/i.test(s)?'br':/왼쪽\s*아래|좌하|bottom.?left|\bbl\b/i.test(s)?'bl':'';
    const R=s.match(/(?:모서리|corner|R)\s*(\d+(?:\.\d+)?)/i);
    if(shp==='circle'||shp==='hex'||shp==='oct')out.push(`board shape ${shp} ${d?d[1]:Math.min(BD.W,BD.H)}`);
    else if(shp==='L'||shp==='T')out.push(`board shape ${shp} ${m?m[1]+' '+m[2]:f1(BD.W)+' '+f1(BD.H)}${cut?' --cut '+cut[1]+'x'+cut[2]:''}${at?' --at '+at:''}`);
    else if(shp==='round')out.push(`board shape round ${m?m[1]+' '+m[2]:f1(BD.W)+' '+f1(BD.H)}${R?' --corner '+R[1]:''}`);
    else out.push(`board shape ${shp} ${m?m[1]+' '+m[2]:f1(BD.W)+' '+f1(BD.H)}`);
    if(m)out.splice(out.indexOf(`board size ${m[1]} ${m[2]}${/가운데|중앙|center/.test(s)?' --anchor center':''}`),1);}
  // net width, loose names and relative: "12V라인의 폭을 2배로 확장해", "+5V 폭 1.2mm", "VBAT 배선 50% 넓혀", "GND 폭 두 배"
  if(/폭|width|굵|두껍|넓혀|넓게|얇게|좁게/.test(s)&&!/(폭|width)\s*(표|보여|알려|확인|어때|얼마)/.test(s)){
    const KN={'두':2,'세':3,'네':4,'한':1};let f=null,mm=null;
    const xm=s.match(/(\d+(?:\.\d+)?)\s*배/)||s.match(/[x×]\s*(\d+(?:\.\d+)?)/);if(xm)f=+xm[1];else{const km=s.match(/(두|세|네)\s*배/);if(km)f=KN[km[1]];}
    const pm=s.match(/(\d+(?:\.\d+)?)\s*%/);if(!f&&pm)f=/줄|좁|얇|감소|reduce/.test(s)?1-(+pm[1])/100:1+(+pm[1])/100;
    if(!f){const mmm=s.match(/(\d+(?:\.\d+)?)\s*mm/);if(mmm)mm=+mmm[1];}
    if(!f&&mm==null&&/넓혀|넓게|두껍|굵게/.test(s))f=1.5;if(!f&&mm==null&&/얇게|좁게|가늘/.test(s))f=0.75;
    const cands=[...t.matchAll(/[+-]?\d+(?:\.\d+)?\s*V\d*(?![a-z])|[+]?[A-Za-z][A-Za-z0-9_+.]{1,15}/g)].map(x=>x[0].replace(/\s+/g,'')).filter(x=>!/^(mm|width|net|line|x\d*)$/i.test(x));
    let key=null;for(const c of cands){key=cliNetFind(c);if(key)break;}
    if(key&&(f||mm!=null)){const apply=/확장|넓혀|넓게|키워|늘려|줄여|좁게|얇게|적용|바꿔|변경|다시|배선|route|해\s*줘|해$|해줘/.test(s);
      out.push(`width ${key} ${f?'x'+(+f.toFixed(3)):mm}${apply&&PCB.cuKeys(BD).some(k=>BD.layers[k+'.cu'].some(p=>p.auto&&p.net===key))?' --apply':''}`);return out;}}
  // track width by current: "전류 기준으로 폭", "VCC_DRV 폭 1.5mm", "모터 전원 10A로"
  const wn=t.match(/(?:^|[\s,])([A-Z+][A-Z0-9_+.]{1,15})\s*(?:넷|net)?\s*(?:폭|width)\s*(\d+(?:\.\d+)?)\s*mm/i)||t.match(/(?:폭|width)\s*(?:을|를)?\s*(\d+(?:\.\d+)?)\s*mm\s*(?:로|으로)?\s*.*?\b([A-Z+][A-Z0-9_+.]{1,15})\b/i);
  if(wn){const net=wn[2]&&/^\d/.test(wn[2])?wn[1]:(/^\d/.test(wn[1])?wn[2]:wn[1]),mm=/^\d/.test(wn[1])?wn[1]:wn[2];if(BD.nets&&BD.nets[net]){out.push(`width ${net} ${mm}`);if(/배선|route/.test(s))out.push('route');return out;}}
  const wc=t.match(/(?:^|[\s,])([A-Z+][A-Z0-9_+.]{1,15})(?=[\s,가-힣])[^\d]{0,12}(\d+(?:\.\d+)?)\s*A(?![A-Za-z])/);if(wc&&BD.nets&&BD.nets[wc[1]]&&/전류|current|A로|폭/.test(s)){out.push(`width ${wc[1]} --current ${wc[2]}`);if(/배선|route/.test(s))out.push('route --iw');return out;}
  if(/(전류|current|ipc)\s*(기준|대로|따라|맞춰|based)/.test(s)&&/폭|width|배선|route/.test(s)){out.push(/배선|route/.test(s)?'route --iw':'width');return out;}
  if(/(폭|width)\s*(표|보여|알려|확인|어때|얼마)/.test(s)){out.push('width');return out;}
  const wantRoute=/배선|라우팅|route|routing|연결/.test(s);
  const ly=s.match(/(\d+)\s*(?:층|레이어|layers?|l\b)/);if(ly&&PCB.STACKS[+ly[1]])out.push(`board layers ${ly[1]}`);
  const mini=/(최소화|최소로|최소\s*크기|minimi[sz]e|shrink|줄여|작게)/.test(s)&&/(크기|사이즈|싸이즈|size|보드|기판|면적|외곽)/.test(s);
  if(mini){out.push(`board minimize${wantRoute||PCB.cuKeys(BD).some(k=>BD.layers[k+'.cu'].some(p=>p.auto&&!p.fan))?' --route':''}${/유지|그대로|외곽만/.test(s)?' --keep':''}`);return out;}
  if(ly&&!/배치|배선|리셋|place|route/.test(s))return out;
  const both=/양면|하단(에|으로)?\s*(도|까지)|bottom.?side|both\s*side|뒷면(에|도)/.test(s)&&!/단면|top만|상단만/.test(s)?' --both':'';
  if(/리셋|초기화|처음부터|reset|새로|전부\s*다시|싹/.test(s))out.push(`reset${strat?' --strategy '+strat:''}${both}`);
  else if(/배치|place|옮겨|재배치|정리/.test(s)||(strat&&!wantRoute)||both)out.push(`${both&&/처음|새로|다시/.test(s)?'reset':'place'}${strat?' --strategy '+strat:''}${both}`);
  if(wantRoute)out.push(`route${strat?' --strategy '+strat:''}`);
  if(/drc|검사|규칙/.test(s))out.push('drc');
  if(/리포트|보고|report|분석|평가|결과|온도|열\s*해석/.test(s))out.push(`report ${/온도|열/.test(s)?'thermal':/emc|노이즈|잡음/.test(s)?'emc':'place'}`);
  return out;}

async function cliRun(line,quiet,by){
  const t=cliTok(line);if(!t.length)return'';let cmd=t[0].toLowerCase();const a=cliArgs(t.slice(1));
  switch(cmd){
    case'zone':{const sub=String(a._[0]||'').toLowerCase();
      if(sub==='auto'||!BD.zones&&sub&&sub!=='off'){let groups=BD.zones&&BD.zones.groupOf;if(!groups&&BD.newPlan&&typeof NEWPROJ!=='undefined'){const r=NEWPROJ.build(BD.newPlan);groups=NEWPROJ.partGroups(BD.newPlan,r.parts);}
        if(!groups)throw new Error('부품의 기능 그룹을 알 수 없습니다 (신규 설계로 만든 보드에서 사용)');const Z=AUTOPLACE.floorplan(BD,groups,{template:a._[1]==='motor'||a._[1]==='general'?a._[1]:undefined});if(!Z)throw new Error('영역을 나눌 부품이 없습니다');
        const hard=BD.zones&&BD.zones.hard;BD.zones=Z;if(hard)Z.hard=true;}
      else if(sub==='off'){if(BD.zones)BD.zones.on=false;refresh(false);return'기능 영역 끔 — 배치에 영향 없음 (zone on으로 다시)';}
      else if(sub==='on'){if(!BD.zones)throw new Error('영역이 없습니다 — zone auto');BD.zones.on=true;}
      else if(sub==='hard'||sub==='soft'){if(!BD.zones)throw new Error('영역이 없습니다 — zone auto');BD.zones.hard=sub==='hard';}
      if(!BD.zones)return'기능 영역이 없습니다 — zone auto 로 만드세요 (신규 설계 보드는 자동)';
      refresh(false);const R=AUTOPLACE.zoneReport(BD);
      return[`기능 영역 ${BD.zones.on===false?'(꺼짐) ':''}· ${BD.zones.template==='motor'?'모터 구동형':'일반형'} · ${BD.zones.hard?'강제':'권장(벌점)'}`]
        .concat(R.map(x=>`  ${x.label.padEnd(8)} ${f1(x.rect[2]-x.rect[0])} × ${f1(x.rect[3]-x.rect[1])} mm · 부품 ${x.parts}개 · 사용률 ${x.util}%${x.out.length?' · 영역 밖 '+x.out.join(' '):''}`))
        .concat(sub?['→ 배치에 반영하려면 reset (처음부터 다시 배치)']:[]).join('\n');}
    case 'help':case '?':{if(a._[0]){const h=CLI_HELP.filter(x=>x[0].split(/[\s·]/).some(w=>w===a._[0]));return h.length?h.map(x=>`${x[0]}\n  ${x[1]}`).join('\n'):`${a._[0]}: 없는 명령입니다.`;}
      return CLI_HELP.map(x=>`${x[0]}\n  ${x[1]}`).join('\n')+'\n\n키: ` 로 열고 닫기 · ↑↓ 이전 명령 · Tab 자동 완성. 모든 변경은 Ctrl+Z로 되돌릴 수 있습니다.';}
    case 'status':return cliStatus();
    case 'board':{const sb=(a._[0]||'').toLowerCase();if(sb==='layers'||sb==='layer')return cliLayers(a);if(sb==='stack')return`${BD.copperLayers||2}층 · 두께 ${BD.t} mm\n`+PCBEDIT.stackText(BD);
      if(/^(minimize|minimise|min|shrink|fit)$/.test(sb)){if(sb==='fit')a.keep=true;return await cliMinimize(a);}return cliBoard(a);}
    case 'strategies':return Object.entries(AUTOPLACE.STRATS).map(([k,v])=>`${k.padEnd(9)} ${v.label} — ${v.desc}`).join('\n');
    case 'strategy':{if(!a._[0])return`기본 전략: ${CLI.strategy}`;const k=AUTOPLACE.strategy(a._[0]);if(!k)throw new Error('balanced · thermal · noise · compact 중 하나');CLI.strategy=k;return`기본 전략을 ${k} (${AUTOPLACE.STRATS[k].label})로 바꿨습니다.`;}
    case 'reset':{const s=await cliPlace(a,true);if(a.route){if(!quiet)cliSay('ok',s);return await cliRoute(a);}return s;}
    case 'place':return await cliPlace(a,false);
    case 'route':return await cliRoute(a);
    case 'unroute':return cliUnroute();
    case 'width':{if(typeof CURRENT==='undefined')throw new Error('전류 모듈 없음');if(a.oz){BD.oz=Math.max(0.5,+a.oz);}if(a.dt){BD.dT=Math.max(5,+a.dt);}
      const net=a._[0];if(net){const key=cliNetFind(net);if(!key)throw new Error('넷 '+net+' 없음'+cliNetHint(net));
        BD.netWidth=BD.netWidth||{};BD.netCurrent=BD.netCurrent||{};
        if(a.current!=null){BD.netCurrent[key]=+a.current;delete BD.netWidth[key];}
        else{const v=a._[1];if(v==null)throw new Error('width <넷> <mm|auto> 또는 --current A');if(v==='auto'){delete BD.netWidth[key];delete BD.netCurrent[key];}else{const f=cliWidthFactor(v);let mm;if(f){const b=cliNetWidthNow(key);mm=+(b*f).toFixed(2);cliSay('out',`${key}: 현재 ${b} mm × ${+f.toFixed(3)} → ${mm} mm`);}else mm=parseFloat(v);if(!(mm>=0.1&&mm<=10))throw new Error('폭 0.1–10 mm (계산값 '+mm+' mm)');BD.netWidth[key]=mm;}}
        if(a.apply){const kill=[];PCB.cuKeys(BD).forEach(k=>BD.layers[k+'.cu'].forEach(p=>{if(p.auto&&p.net===key)kill.push(p);}));BD.vias.forEach(v=>{if(v.auto&&v.net===key)kill.push(v);});
          if(kill.length){cliEnsureEdit();AUTOROUTE.unroute(BD,kill);PCBEDIT.rebuildNets(BD);}const r=await cliRoute({nets:key,iw:false});const w2=CURRENT.widths(BD,{oz:BD.oz||1,dT:BD.dT||10})[key];return`${key} 폭 ${BD.netWidth[key]!=null?BD.netWidth[key]:w2.w} mm 로 다시 배선 (지운 자동 트랙·비아 ${kill.length}개)\n${r}`;}
        const w=CURRENT.widths(BD,{oz:BD.oz||1,dT:BD.dT||10})[key];return`${key}: ${w.I.toFixed(2)} A → 권장 ${w.ipc} mm${w.manual?' · 지정 '+w.w+' mm':''}${w.pour?' (동박면 권장)':''} — route --iw 또는 route 로 적용`;}
      return CURRENT.text(BD,{oz:BD.oz||1,dT:BD.dT||10});}
    case 'pinswap':return await cliPinswap(a);
    case 'auto':return await cliAuto(a);
    case 'fix':return await cliFix(a);
    case 'gloss':return await cliGloss(a);
    case 'autofix':{const v=String(a._[0]||'').toLowerCase();if(v==='on'||v==='off'){CLI.autoFix=v==='on';try{localStorage.setItem('aod.autofix',v);}catch(e){}}return`배선 뒤 미배선 자동 개선: ${CLI.autoFix?'켬':'끔'} (autofix on|off)`;}
    case 'lock':cliRefs(a._).forEach(c=>CLI.lock.add(c.ref));return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'unlock':if(a._[0]==='all'||!a._.length)CLI.lock.clear();else cliRefs(a._).forEach(c=>CLI.lock.delete(c.ref));return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'locks':return`고정: ${[...CLI.lock].join(', ')||'없음'}`;
    case 'move':case 'rotate':case 'flip':return await cliOne(cmd,a);
    case 'drc':{PCBEDIT.prepare(BD);const d=PCBEDIT.drc(BD);if(PE.on)peRecalc(true);const cw=typeof CURRENT!=='undefined'?CURRENT.check(BD,{oz:BD.oz||1,dT:BD.dT||10}):[];const extra=cw.length?`\n전류 대비 폭 부족 ${cw.length}건 (route --iw 로 넓히거나 동박면):\n`+cw.map(x=>'  ! '+x.msg).join('\n'):'';return (d.length?`DRC ${d.length}건\n`+d.slice(0,15).map(x=>`  ${x.msg}${x.refs&&x.refs.length?' ('+x.refs.join(', ')+')':''}`).join('\n')+(d.length>15?'\n  …':''):'DRC 문제 없음')+extra;}
    case 'rats':{const r=PCBEDIT.ratsnest(BD);if(!r.length)return'래츠네스트 없음 — 모든 연결이 동박으로 이어졌습니다.';const by={};r.forEach(x=>{by[x.net]=(by[x.net]||0)+1;});return`래츠네스트 ${r.length}개\n`+Object.entries(by).sort((x,y)=>y[1]-x[1]).slice(0,20).map(([n,k])=>`  ${n} ${k}`).join('\n');}
    case 'report':return cliReport(a);
    case 'analyze':case 'analyse':return scAnalyze(a);
    case 'safety':return scSafety(a);
    case 'undo':if(!PE.undo.length)return'되돌릴 것이 없습니다.';peUndo();return'실행 취소했습니다.';
    case 'redo':if(!PE.redo.length)return'다시 실행할 것이 없습니다.';peRedo();return'다시 실행했습니다.';
    case 'clear':{copClear('pcb');CLI.log=[];return'';}
    case 'history':return CLI.hist.slice(-20).join('\n');
    case 'housing':{const useAI=by!=='ai'&&(a.ai||(AIM.mode==='ai'&&!a.det&&!a._[0]));const txt=await mechCmd(a);
      if(useAI){cliSay('ok',txt);const ok=await cliAgent(MECH_AI+`\n\n현재 분석:\n${txt}\n\n${HOUSING.compareText(mechRun())}\n\n사용자 요청: 하우징 트레이드오프를 검토하고 추천해줘`);if(!ok)cliSay('err','Claude를 쓸 수 없어 결정론 결과만 표시했습니다.');if(S.panel==='sim'&&SR.tab==='mech')renderSim();return'';}return txt;}
    case 'guide':{const r=guideRun(a,'pcb',{by});if(typeof r==='string')return r;const txt=guideText(r,(a.ai||(AIM.mode==='ai'&&!a.det))&&by!=='ai'?'ai':'det');
      if(by!=='ai'&&(a.ai||(AIM.mode==='ai'&&!a.det))){cliSay('ok',txt);const ok=await cliAgent(GUIDE_AI+`\n\n점검 결과:\n${txt}\n\n사용자 요청: 가이드라인 점검 결과를 검토해줘`,'agent');if(!ok)cliSay('err','Claude를 쓸 수 없어 결정론 결과만 표시했습니다.');return'';}return txt;}
    case 'ai':return await cliAI(t.slice(1).join(' '));
    default:throw new Error(`알 수 없는 명령: ${cmd}`);
  }
}
/* after a command that routed: unrouted nets left → run fix by itself (autofix off to disable) */
async function cliAutoFix(){if(!CLI.autoFix||!CLI.routed||CLI.inFix||CLI.stopReq||!BD||BD.pcbPending)return;CLI.routed=false;
  const n=cliOpenCount();if(!n)return;cliSay('out',`미연결 ${n}개(래츠네스트)가 남아 자동 개선(fix)을 시작합니다 — 끄려면 autofix off`);
  cliSay('cmd','fix');const o=await cliFix({});if(o)cliSay('ok',o);}
async function cliExec(line){
  if(!BD)return;cliPanel();if(CLI.busy){cliSay('err',`다른 PCB 작업이 실행 중이라 "${line}"을(를) 실행하지 않았습니다 — 끝난 뒤 다시 실행하거나 [중지]를 누르세요.`);return;}cliSay('cmd',line);cliBusy(true);CLI.routed=false;
  try{
    // "전원부·MCU부 영역 나눠줘", "영역 보여줘", "영역 끄기", "영역 강제" → zone
    if(/영역|구역|플로어\s*플랜|floor\s*plan/i.test(line)&&!CLI_CMDS.has((cliTok(line)[0]||'').toLowerCase())){
      const sub=/끄|해제|없애/.test(line)?'off':/강제|반드시|hard/.test(line)?'hard':/권장|soft|느슨/.test(line)?'soft':/나눠|만들|할당|다시|자동|새로/.test(line)?'auto':/켜/.test(line)?'on':'';line=('zone '+sub).trim();cliSay('out','→ '+line);}
    const first=(cliTok(line)[0]||'').toLowerCase();
    if(CLI_CMDS.has(first)){const out=await cliRun(line);if(out)cliSay('ok',out);}
    else if(typeof plIntent==='function'&&plIntent(line)){await plReplaceFlow(plIntent(line),'pcb');}
    else if(typeof plAddIntent==='function'&&plAddIntent(line)){await plAddFlow(plAddIntent(line),'pcb');}
    else{if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){await cliAI(line);cliBusy(false);return;}cliSay('out','Claude를 쓸 수 없어 규칙으로 해석합니다.');}
      if(await aimDetQuestion(line,cliSay,()=>cliRun('status'))){cliBusy(false);return;}
      {const cmds=cliNL(line);if(!cmds.length)cliSay('err','명령을 알아듣지 못했습니다. help로 목록을 보세요.');else{cliSay('out','해석: '+cmds.join(' → '));for(const c of cmds){cliSay('cmd',c);const o=await cliRun(c);if(o)cliSay('ok',o);if(CLI.stopReq)break;}}}}
    await cliAutoFix();
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
Routing order is fixed by ECU practice: high-current power/drive → clocks/high-speed/differential → sensitive analog → general digital; high-speed nets avoid a 2 mm band at the board edge; a GND return via is dropped next to each layer change of clock/analog nets (route does all of this by default; --order length / --no-edge / --no-retvia switch it off). "guide check" reports these as rules (rt_priority, rt_return_via, rt_edge_keepout, pw_agnd_star, th_via_array).
Track width: default 0.2 mm signal / 0.3 mm power by net name. "width" lists the estimated current per net and the IPC-2221 width; "width NET 1.2" fixes a net's width, "width NET x2 --apply" doubles its current width and re-routes only that net (net names match loosely: 12V → +12V), "width NET --current 4" sets its current; "route --iw" routes power/motor nets at their IPC-2221 width (capped by --iwmax, default 2 mm; wider nets should become copper pours). "drc" also reports tracks too thin for their current. Use these when the user talks about current, heating, motor/power trace width.
Sides: parts go on the TOP side only by default (single-sided assembly: one reflow pass, cheapest, connectors/through-hole/electrolytics must be top). "reset --both" / "place --both" also uses the bottom for passives and small ICs (two-sided assembly) — use it when the user asks for 양면/하단 배치 or the board must be smaller than single-sided allows.
Unrouted nets left after a route: run "fix" (it tries, cheapest first, a full re-route, other placement seeds, another strategy, a 10–50 % larger board, more copper layers, and keeps the best) instead of only advising; add --maxgrow 2 / --maxlayers 8 / --pinswap if it is still not enough. Board too small: "reset" grows the board automatically when parts do not fit, and "board minimize" grows past the original size when needed (--no-grow stops that); after any size change run "route" (or add --route). Never stop at "parts outside the board" — re-place (reset) and route again.
Moving: "move REF x y [deg]", "rotate REF deg", "flip REF" (to the other side) remove that part's auto-routed tracks and re-route its nets right away (add --no-route to leave the ratsnest open); hand-drawn tracks are kept.
Board shape: "board shape circle 60" / "board shape oval 80 40" / "board shape L 100 60 --cut 40x25 --at tr" / "board shape hex 60" / "board shape round 100 60 --corner 3" / "board shape poly --pts \"0,0 80,0 80,40 40,60 0,40\""; cutouts: "board cutout circle 8 --at 20,20", "board cutout rect 20x10 --at 50,30". After a shape change that leaves parts outside, run "place" or "reset".
Copper layers: "board layers N" (2/4/6/8/10) builds a standard stack-up (e.g. 8 = S/GND/S/GND/PWR/S/GND/S) with inner GND/PWR planes and inner signal layers, and drops plane vias — always run it when the user asks for a layer count (e.g. "8층"). Size: "board minimize --route" finds the smallest board that still places and routes (slow); "board minimize" only re-places; "board size W H" sets an exact size. MCU pins: "pinswap" shows a routing-friendly re-assignment, "pinswap --apply --route" changes the circuit (board nets, schematic, HSIS) and routes — allowed in the PCB step.
Rules: use at most 6 commands; "reset" re-places everything from the netlist (schematic) and clears copper; "route" auto-routes open nets; run "report" (place, thermal or emc) when the user asks about heat/noise quality; every command is undoable. After the tool calls, answer in Korean in 2-5 short sentences: what you ran, the key numbers from the outputs, and one concrete next step if something is left (unrouted nets, DRC, overlaps). Do not invent numbers.`;
const CLI_RO=c=>{const t=cliTok(c);const f=(t[0]||'').toLowerCase(),s=(t[1]||'').toLowerCase();
  return['help','?','status','strategies','locks','drc','rats','report','history','analyze','analyse','safety'].includes(f)||(f==='width'&&!s)||(f==='guide'&&(!s||/^(check|list|show)$/.test(s)))||(f==='housing'&&/^(check|compare)$/.test(s))||(f==='board'&&(!s||s==='info'||s==='stack'));};
async function cliAgent(prompt,kind){
  return aiAgent({prompt,kind,ro:CLI_RO,roList:'status, report place|thermal|emc, drc, rats, guide check, board stack, housing check',toolName:'run_cli',toolDesc:'Run one PCB layout console command (see the command list) and return its text output.',example:'"reset --strategy thermal" or "guide set ds_kelvin fail --note ..."',
    run:c=>cliRun(c,true,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();return!CLI_CMDS.has(f)||f==='ai'?'unknown command: '+f:'';},
    say:cliSay,set:cliSet,drop:e=>{copDrop(e);CLI.log=CLI.log.filter(x=>x!==e);},
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

