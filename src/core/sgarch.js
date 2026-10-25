/* ---------- safety-goal driven architecture (ISO 26262-3/-4 on the HW block diagram) ----------
   A safety goal (SG) says what must not happen, with its ASIL, FTTI and safe state. Blocks and links carry sg tags
   (the violation path). From the goals SGARCH proposes 2–3 structure variants (single MCU + external monitoring,
   main + safety MCU with an independent shutdown path, ASIL decomposition into two channels), scores them
   (diagnostic coverage per goal, FTTI, extra blocks, cost, complexity) and verifies any architecture — AI-drawn or
   not — with deterministic rules: every SG needs a detection block, an independent reaction path to the safe state,
   detection + reaction inside the FTTI, no single block playing both roles, and no common-cause supply/clock. */
const SGARCH=(()=>{
const SA=()=>typeof SAFETY!=='undefined'?SAFETY:null;
const rank=l=>['QM','A','B','C','D'].indexOf(String(l||'QM').toUpperCase());
/* kinds of violation: what a mechanism can detect / what a goal is about */
const KINDS={actuation:'의도하지 않은 출력(토크·구동·스위칭)',loss:'기능 상실(전원·통신·제어)',thermal:'과전류·과열·화재',hv:'고전압 노출·절연',data:'잘못된 값 보고(센서·SOC·메시지)'};
/* default safety goals per product template */
const GOALS={
  eps:[{id:'SG1',text:'의도하지 않은 조향 토크 / 자가 조향 방지',asil:'D',ftti:50,kind:'actuation',state:'토크 0 · 모터 상 차단 (수동 조향 유지)',path:['mcu','gate','inv','pcut','tsens','asens','isense','sbc']},
       {id:'SG2',text:'조향 보조 상실 시 경고 · 점진적 저감',asil:'C',ftti:200,kind:'loss',state:'저감 모드 + CAN 경고 · 수동 조향',path:['pin','sbc','mcu','canx','canbus']},
       {id:'SG3',text:'과전류·과열에 의한 손상 · 화재 방지',asil:'B',ftti:500,kind:'thermal',state:'전류 제한 → 구동 정지',path:['inv','isense','gate','pcut']}],
  bms:[{id:'SG1',text:'셀 과충전 방지 (열폭주)',asil:'D',ftti:100,kind:'actuation',state:'메인 컨택터 개방 · 충전 정지',path:['afe','mcu','ctr','iso','sbc']},
       {id:'SG2',text:'과방전 · 과열 셀 운전 방지',asil:'C',ftti:200,kind:'thermal',state:'부하 제한 → 컨택터 개방',path:['afe','mcu','ctr','ntc']},
       {id:'SG3',text:'절연 고장 시 고전압 노출 방지',asil:'C',ftti:1000,kind:'hv',state:'컨택터 개방 · HV 인터록 경고',path:['iso','mcu','ctr']},
       {id:'SG4',text:'잘못된 SOC·전류 보고 방지',asil:'B',ftti:500,kind:'data',state:'타당성 플래그 · 보수적 SOC',path:['isense','afe','mcu','canx']}],
  bcm:[{id:'SG1',text:'외부 조명 의도하지 않은 소등 방지',asil:'B',ftti:200,kind:'loss',state:'램프 ON 유지 (림프홈)',path:['hsd','mcu','pin','sbc']},
       {id:'SG2',text:'와이퍼 · 윈도우 의도하지 않은 동작 방지',asil:'A',ftti:300,kind:'actuation',state:'출력 OFF',path:['lsd','hsd','mcu']},
       {id:'SG3',text:'출력 단락·과전류에 의한 화재 방지',asil:'B',ftti:500,kind:'thermal',state:'채널 차단 · 재시도 제한',path:['hsd','lsd','pin']}],
  dadu:[{id:'SG1',text:'의도하지 않은 모터 구동 · 역회전 방지',asil:'B',ftti:100,kind:'actuation',state:'전 FET OFF (드라이버 ENABLE Low) · 프리휠 정지',path:['hall','isense','hallps','mcu','sbc','gate','inv']},
        {id:'SG2',text:'과전류·과열에 의한 손상 · 화재 방지',asil:'B',ftti:500,kind:'thermal',state:'전류 제한 → 구동 정지',path:['isense','ptemp','mcu','gate','inv']},
        {id:'SG3',text:'모터 상태(속도 · 전류 · 고장) 잘못 보고 방지',asil:'A',ftti:1000,kind:'data',state:'CAN 고장 플래그 · 대체값',path:['hall','isense','ptemp','mcu','canx']}],
  inv:[{id:'SG1',text:'의도하지 않은 토크 · 역토크 방지',asil:'D',ftti:20,kind:'actuation',state:'ASC(능동 단락) 또는 게이트 전면 차단',path:['mcu','gdrv','pm','rdc','isense','sbc']},
       {id:'SG2',text:'HV 활성 상태 노출 방지 (인터록 · 방전)',asil:'C',ftti:1000,kind:'hv',state:'능동 방전 · 컨택터 개방 요청',path:['hvm','mcu','gdrv','pin']},
       {id:'SG3',text:'과전류·과열에 의한 파워 모듈 손상 방지',asil:'B',ftti:100,kind:'thermal',state:'전류 제한 → 차단',path:['pm','isense','gdrv']}]};
/* mechanism → kinds it detects, detection latency (ms), reaction latency (ms), which blocks it watches, cost ($, parts) */
const MECHX={uv:{kinds:['loss','actuation'],det:1,act:1,cost:0.4,n:1,role:'detect'},
  wdt_ext:{kinds:['actuation','loss'],det:20,act:1,cost:0.6,n:1,role:'detect'},
  conn_diag:{kinds:['data','loss'],det:5,act:10,cost:0.3,n:1,role:'detect'},
  drv_fb:{kinds:['actuation','thermal'],det:1,act:1,cost:0.8,n:1,role:'detect'},
  sbc:{kinds:['actuation','loss'],det:10,act:1,cost:3.5,n:1,role:'both'},
  monitor:{kinds:['actuation','thermal','hv','data'],det:5,act:1,cost:1.2,n:2,role:'detect'},
  sensor_red:{kinds:['data','actuation'],det:2,act:10,cost:4,n:2,role:'detect'},
  cutoff2:{kinds:['actuation','thermal','hv'],det:0,act:1,cost:2,n:3,role:'react'},
  decomp:{kinds:['actuation','loss','data'],det:2,act:5,cost:25,n:8,role:'both'},
  lockstep:{kinds:['actuation','loss','data'],det:1,act:5,cost:4.5,n:2,role:'both'}};
/* structure variants */
const VARIANTS=[
  {key:'single',label:'단일 MCU + 외부 감시',short:'단일+감시',cx:1,desc:'락스텝 MCU 하나에 외부 윈도우 워치독·전원 감시·드라이버 fault·이중 차단 경로를 붙입니다. 가장 싸고 단순하며, MCU 자체 고장은 외부 감시 IC가 잡습니다.',
    mech:{A:['uv','wdt_ext'],B:['uv','wdt_ext','drv_fb','conn_diag'],C:['uv','wdt_ext','drv_fb','conn_diag','sbc','cutoff2'],D:['uv','wdt_ext','drv_fb','conn_diag','sbc','cutoff2','monitor']},use:'단일 채널 ECU · ASIL C 이하 또는 락스텝 MCU로 D'},
  {key:'dual',label:'메인 + 세이프티 MCU · 독립 차단',short:'듀얼 MCU',cx:2,desc:'작은 세이프티 MCU가 메인 MCU와 결과·생존 신호를 교환하고, 메인과 독립된 경로로 차단(세이프 스테이트)을 구동합니다. 감시 소프트웨어가 독립 전원·클럭에서 돌아 공통 원인 고장을 분리합니다.',
    mech:{A:['uv','lockstep'],B:['uv','drv_fb','lockstep'],C:['uv','drv_fb','conn_diag','sbc','lockstep','cutoff2'],D:['uv','drv_fb','conn_diag','sbc','lockstep','cutoff2','monitor','sensor_red']},use:'메인 MCU가 락스텝이 아닐 때 · 짧은 FTTI의 D 등급'},
  {key:'decomp',label:'ASIL 분해 2채널 B(D)+B(D)',short:'2채널 분해',cx:3,desc:'MCU·게이트·인버터·전원을 두 채널로 복제해 각 채널을 ASIL B(D)로 낮춥니다. 한 채널 고장 시 다른 채널이 저감 운전을 이어 가므로 기능 상실 목표(가용성)까지 함께 만족합니다.',
    mech:{A:['uv'],B:['uv','drv_fb'],C:['uv','drv_fb','sbc','decomp'],D:['uv','drv_fb','sbc','decomp','cutoff2','monitor']},use:'가용성 요구(조향 보조 유지 · 페일 오퍼레이셔널) · 상용차 · 자율주행 L3+'}];
const DUP_IDS=['mcu','gate','inv','sbc','gdrv','pm','afe','drv','reg'];
/* ---- goals on the architecture ---- */
function goals(A){return A&&A.safety&&Array.isArray(A.safety.sgs)?A.safety.sgs:[];}
function defaults(key){return (GOALS[key]||[]).map(g=>Object.assign({},g,{path:g.path.slice()}));}
function setGoals(A,list){A.safety=A.safety||{level:'QM',goals:[]};A.safety.sgs=list.map((g,i)=>({id:g.id||'SG'+(i+1),text:String(g.text||''),asil:String(g.asil||'QM').toUpperCase(),ftti:+g.ftti||100,kind:KINDS[g.kind]?g.kind:'actuation',state:g.state||'',path:(g.path||[]).slice()}));
  A.safety.goals=A.safety.sgs.map(g=>`${g.id} ${g.text} (ASIL ${g.asil}, FTTI ${g.ftti} ms)`);
  const top=A.safety.sgs.reduce((m,g)=>rank(g.asil)>rank(m)?g.asil:m,'QM');if(rank(top)>rank(A.safety.level))A.safety.level=top;
  tag(A);return A.safety.sgs;}
function addGoal(A,g){const L=goals(A).slice();g.id=g.id||'SG'+(L.length+1);L.push(g);return setGoals(A,L);}
function removeGoal(A,id){return setGoals(A,goals(A).filter(g=>g.id!==id));}
/* tag blocks and links on each goal's violation path; mechanism blocks get the goals of the kinds they cover */
function tag(A){const G=goals(A);const B=id=>(A.blocks||[]).find(b=>b.id===id);(A.blocks||[]).forEach(b=>{b.sg=[];});(A.links||[]).forEach(l=>{l.sg=[];});
  G.forEach(g=>{g.path.forEach(id=>{const b=B(id)||B(id.replace(/\d+$/,''))||(A.blocks||[]).find(x=>x.id.replace(/\d+$/,'')===id);if(b&&!b.sg.includes(g.id))b.sg.push(g.id);(A.blocks||[]).filter(x=>x.id!==id&&x.id.replace(/\d+$/,'')===id).forEach(x=>{if(!x.sg.includes(g.id))x.sg.push(g.id);});});
    (A.blocks||[]).forEach(b=>{const m=b.safety&&MECHX[b.safety];if(m&&m.kinds.includes(g.kind)&&!b.sg.includes(g.id))b.sg.push(g.id);});
    (A.links||[]).forEach(l=>{const a=B(l.a),b=B(l.b);if(a&&b&&a.sg.includes(g.id)&&b.sg.includes(g.id))l.sg.push(g.id);});});
  const lvl=g=>g.asil;G.forEach(g=>{(A.blocks||[]).forEach(b=>{if(b.sg.includes(g.id)&&!b.ext&&(!b.asil||rank(b.asil)<rank(lvl(g))))b.asil=lvl(g);});});
  return A;}
function tagBlock(A,id,sgId,on){const b=(A.blocks||[]).find(x=>x.id===id);if(!b)throw new Error('블록 없음: '+id);const g=goals(A).find(x=>x.id===sgId);if(!g)throw new Error('안전 목표 없음: '+sgId);
  g.path=g.path.filter(x=>x!==id);if(on!==false)g.path.push(id);tag(A);return b;}
/* ---- verification rules ---- */
function present(A){const S=SA();if(!S)return[];const lv=S.level(A);return S.mechanisms(A,'D').filter(m=>!m.sw&&m.present).map(m=>Object.assign({},m,MECHX[m.id]||{}));}
function verify(A){const G=goals(A);const S=SA();const P=present(A);const B=id=>(A.blocks||[]).find(b=>b.id===id);const ctrl=(A.blocks||[]).find(b=>b.group==='ctrl');
  const out=G.map(g=>{const issues=[];const det=P.filter(m=>(m.kinds||[]).includes(g.kind)&&(m.role==='detect'||m.role==='both'));const react=P.filter(m=>(m.kinds||[]).includes(g.kind)&&(m.role==='react'||m.role==='both'));
    // 1. detection
    if(!det.length)issues.push({sev:'err',rule:'detect',msg:`감지 메커니즘 없음 — ${KINDS[g.kind]} 위반을 감지할 블록(감시 IC·fault 리드백·모니터·리던던트 센서)이 없습니다`});
    // 2. reaction path to the safe state, independent from the main controller
    const safeLinks=(A.links||[]).filter(l=>l.kind==='safe');const indep=safeLinks.filter(l=>ctrl?l.a!==ctrl.id:true);
    if(rank(g.asil)>=rank('C')&&!react.length)issues.push({sev:'err',rule:'react',msg:`세이프 스테이트 경로 없음 — ${g.state||'안전 상태'}로 가는 차단 블록(SBC FS0B · 이중 차단 · 세이프티 릴레이)이 없습니다`});
    else if(rank(g.asil)>=rank('C')&&!indep.length)issues.push({sev:'err',rule:'indep',msg:'차단 경로가 메인 MCU에서만 나옵니다 — MCU 고장 시 세이프 스테이트에 들어갈 수 없으므로 감시 IC/세이프티 MCU에서 나오는 독립 차단 링크(kind safe)가 필요합니다'});
    else if(rank(g.asil)>=rank('A')&&!safeLinks.length)issues.push({sev:'warn',rule:'react',msg:'세이프 스테이트 링크(kind safe)가 없습니다 — 어떤 경로로 안전 상태에 가는지 표시하세요'});
    // 3. FTTI: fastest detection + reaction
    const dl=det.length?Math.min(...det.map(m=>m.det||0)):Infinity;const rl=react.length?Math.min(...react.map(m=>m.act||0)):(det.length?10:Infinity);const lat=isFinite(dl)?dl+rl:Infinity;
    if(isFinite(lat)&&lat>g.ftti)issues.push({sev:'err',rule:'ftti',msg:`감지 ${dl} ms + 반응 ${rl} ms = ${lat} ms > FTTI ${g.ftti} ms — 더 빠른 HW 감지(fault 리드백·비교기)나 HW 차단이 필요합니다`});
    // 4. independence: the watching block is not the watched block; 2-channel/lockstep for D unless lockstep core
    const detB=det.map(m=>B(m.present)).filter(Boolean);if(ctrl&&detB.length&&detB.every(b=>b.id===ctrl.id))issues.push({sev:'err',rule:'indep',msg:'감지가 모두 MCU 안에서만 이루어집니다 — MCU 자체 고장을 잡는 외부 요소가 필요합니다'});
    if(rank(g.asil)>=rank('D')){const ls=ctrl&&/lockstep|락스텝|TC3|TC2|S32K3|SPC58|RH850|TMS570/i.test(ctrl.label+' '+(ctrl.feats||[]).join(' ')+' '+JSON.stringify(ctrl.impl||[]));const two=P.some(m=>m.id==='decomp'||m.id==='lockstep');if(!ls&&!two)issues.push({sev:'err',rule:'indep',msg:'ASIL D인데 MCU가 락스텝이 아니고 2채널/세이프티 MCU도 없습니다 — 락스텝 MCU · 세이프티 MCU · ASIL 분해 중 하나가 필요합니다'});}
    // 5. common cause: one supply block feeds the whole path without a supervisor
    if(rank(g.asil)>=rank('B')){const pw=(A.blocks||[]).filter(b=>b.group==='power'&&!b.ext);const sup=pw.some(b=>/supervis|감시|sbc|uv|watchdog|워치독/i.test(b.label+' '+(b.feats||[]).join(' ')));if(pw.length&&!sup)issues.push({sev:'warn',rule:'ccf',msg:'전원 블록을 감시하는 요소가 없습니다 — 공통 원인 고장(전원 이상)이 감지되지 않습니다'});}
    // 6. path tagged
    const tagged=(A.blocks||[]).filter(b=>(b.sg||[]).includes(g.id));if(!tagged.length)issues.push({sev:'warn',rule:'path',msg:'위반 경로 블록이 지정되지 않았습니다 (sg tag <블록> '+g.id+')'});
    const dc=det.length?Math.min(99,Math.round(100*(1-det.reduce((p,m)=>p*(1-(dcOf(m)/100)),1)))):0;
    return{id:g.id,text:g.text,asil:g.asil,ftti:g.ftti,kind:g.kind,ok:!issues.some(i=>i.sev==='err'),issues,det:det.map(m=>m.label),react:react.map(m=>m.label),lat:isFinite(lat)?lat:null,dc,blocks:tagged.map(b=>b.id)};});
  return{goals:out,ok:out.every(g=>g.ok),n:out.length,errs:out.reduce((a,g)=>a+g.issues.filter(i=>i.sev==='err').length,0)};}
function dcOf(m){const d=m.dc||{};const v=Object.values(d).map(Number).filter(isFinite);return v.length?Math.max(...v):60;}
/* ---- variants: propose, score, apply ---- */
function propose(A,HW){const S=SA();if(!S)throw new Error('SAFETY 필요');const G=goals(A);const lv=G.reduce((m,g)=>rank(g.asil)>rank(m)?g.asil:m,S.level(A));if(lv==='QM')return[];
  const H=HW||(typeof HWARCH!=='undefined'?HWARCH:null);
  return VARIANTS.map(v=>{const T=JSON.parse(JSON.stringify(A));const ids=v.mech[lv]||v.mech.D;const added=applyVariant(T,H,v.key,ids);tag(T);const V=verify(T);
    const cost=added.reduce((a,b)=>a+((MECHX[b.safety]||{}).cost||(b.dup?6:1)),0);const n=added.reduce((a,b)=>a+((MECHX[b.safety]||{}).n||(b.dup?4:1)),0);
    const dc=V.goals.length?Math.round(V.goals.reduce((a,g)=>a+g.dc,0)/V.goals.length):0;const ftti=V.goals.filter(g=>!g.issues.some(i=>i.rule==='ftti')).length;
    const want=G.some(g=>g.kind==='loss'&&rank(g.asil)>=rank('C'));const score=(V.ok?40:0)+dc*0.3+ftti/Math.max(1,V.goals.length)*20-cost*0.4-v.cx*4+(want&&v.key==='decomp'?15:0)+(v.key==='single'&&lv==='D'&&!V.ok?-10:0);
    return{key:v.key,label:v.label,short:v.short,desc:v.desc,use:v.use,cx:v.cx,ids,added:added.map(b=>b.label),blocks:added.length,parts:n,cost:+cost.toFixed(1),dc,fttiOk:ftti,verify:V,score:+score.toFixed(1)};}).sort((a,b)=>b.score-a.score);}
function applyVariant(A,H,key,ids){const S=SA();const v=VARIANTS.find(x=>x.key===key);if(!v)throw new Error('변형: '+VARIANTS.map(x=>x.key).join(' · '));
  const G=goals(A);const lv=G.reduce((m,g)=>rank(g.asil)>rank(m)?g.asil:m,S.level(A));ids=ids||v.mech[lv]||v.mech.D;A.safety=A.safety||{level:lv,goals:[]};if(rank(lv)>rank(A.safety.level))A.safety.level=lv;
  const ctrl=(A.blocks||[]).find(b=>b.group==='ctrl');const added=[];
  // 2-channel decomposition: duplicate the control/actuation chain, then record the decomp mechanism on the copies
  if(ids.includes('decomp')&&!(A.blocks||[]).some(b=>/#2$/.test(b.label))){DUP_IDS.forEach(id=>{const src=(A.blocks||[]).find(b=>b.id===id);if(!src)return;const nid=id+'2';if(A.blocks.some(b=>b.id===nid))return;
      const nb=H.addBlock(A,src.group,src.label.replace(/\s*#\d+$/,'')+' #2',{id:nid,feats:src.feats.filter(f=>!/^SW:/.test(f)).slice(),impl:JSON.parse(JSON.stringify(src.impl||[])),ext:src.ext});nb.asil=lv;nb.dup=true;if(!/#1$/.test(src.label))src.label+=' #1';
      for(const l of A.links.slice()){if(l.a===id)H.link(A,nid,l.b,l.label+' #2',{kind:l.kind});else if(l.b===id)H.link(A,l.a,nid,l.label+' #2',{kind:l.kind});}added.push(nb);});
    if(ctrl){ctrl.feats.push('ASIL 분해 B(D) · 채널 비교/투표');ctrl.safety='decomp';const c2=A.blocks.find(b=>b.id===ctrl.id+'2');if(c2){c2.safety='decomp';H.link(A,ctrl.id,c2.id,'채널 간 비교 · 생존 신호',{kind:'safe',both:true});}}}
  // safety MCU (lockstep mechanism as a second controller) with its own shutdown link
  if(ids.includes('lockstep')&&!(A.blocks||[]).some(b=>b.safety==='lockstep')){const sm=H.addBlock(A,'ctrl','Safety MCU (감시 · 독립 차단)',{id:'smcu',feats:['메인 MCU와 결과·생존 신호 교환 (SPI)','독립 전원·클럭','세이프 스테이트 구동 (SAFE_EN)'],asil:lv});sm.safety='lockstep';sm.impl=[{type:'mcu',params:{}}];
    if(ctrl)H.link(A,ctrl.id,sm.id,'상호 감시 (SPI · 생존 신호)',{kind:'safe',both:true});
    const drv=(A.blocks||[]).filter(b=>b.group==='io'&&/driv|드라이버|bridge|브리지|motor|모터|contactor|컨택터|relay|릴레이|switch|스위치|cut|차단/i.test(b.label+' '+b.feats.join(' ')));drv.slice(0,3).forEach(d=>H.link(A,sm.id,d.id,'SAFE_EN 차단',{kind:'safe'}));added.push(sm);}
  const rest=ids.filter(i=>i!=='decomp'&&i!=='lockstep');const got=S.apply(A,H,rest.concat(['sw']),lv).filter(b=>!b.sw);got.forEach(b=>added.push(b));
  A.safety.variant=key;tag(A);return added;}
/* ---- text ---- */
function goalsText(A){const G=goals(A);if(!G.length)return'안전 목표 없음 — sg add "<목표>" --asil D --ftti 50 --kind actuation|loss|thermal|hv|data --state "<안전 상태>" --path mcu,gate';
  return G.map(g=>`${g.id} [ASIL ${g.asil} · FTTI ${g.ftti} ms · ${KINDS[g.kind]}] ${g.text} → 안전 상태: ${g.state||'-'} · 경로: ${g.path.join(', ')||'-'}`).join('\n');}
function verifyText(A){const V=verify(A);if(!V.n)return goalsText(A);
  return`[안전 목표 검증] ${V.ok?'모두 만족':V.errs+'개 위반'}${A.safety&&A.safety.variant?' · 구조: '+(VARIANTS.find(v=>v.key===A.safety.variant)||{}).label:''}\n`+V.goals.map(g=>`${g.ok?'✓':'✗'} ${g.id} ${g.text} (ASIL ${g.asil}) — 감지: ${g.det.join(', ')||'없음'} · 반응: ${g.react.join(', ')||'없음'} · 지연 ${g.lat==null?'?':g.lat+' ms'}/${g.ftti} ms · DC ${g.dc}%`+(g.issues.length?'\n   '+g.issues.map(i=>(i.sev==='err'?'✗ ':'△ ')+i.msg).join('\n   '):'')).join('\n');}
function proposeText(A,HW){const P=propose(A,HW);if(!P.length)return'ASIL QM — 구조 변형 추천 없음 (sg add 로 안전 목표부터)';
  return'[구조 변형 추천] 점수순 — sg apply <single|dual|decomp>\n'+P.map((p,i)=>`${i+1}. ${p.label}${i===0?' ★추천':''} · 점수 ${p.score}\n   ${p.desc}\n   추가 블록 ${p.blocks}개(부품 ~${p.parts}) · 추가 원가 ~$${p.cost} · 평균 DC ${p.dc}% · FTTI 만족 ${p.fttiOk}/${p.verify.n} · 검증 ${p.verify.ok?'✓ 통과':'✗ '+p.verify.errs+'건'} · 복잡도 ${'●'.repeat(p.cx)}${'○'.repeat(3-p.cx)}\n   적합: ${p.use}`).join('\n');}
function aiRules(A){const G=goals(A);return`Safety goals (ISO 26262): each block/link on a goal's violation path is tagged with the goal id; a goal needs (1) a detection block outside the MCU for its violation kind, (2) an independent reaction link (kind safe) from the monitor/SBC/safety MCU to the actuator cut, (3) detection+reaction latency within the FTTI, (4) for ASIL D a lockstep MCU, a safety MCU or a 2-channel decomposition, (5) a supervised supply. Commands: sg list · sg add "<text>" --asil D --ftti 50 --kind actuation|loss|thermal|hv|data --state "<safe state>" --path mcu,gate · sg tag <block> SG1 · sg variants (scores single / dual / decomp) · sg apply <single|dual|decomp> · sg verify. After changing safety-related blocks run sg verify and fix every ✗ before you finish.${G.length?'\nCurrent goals:\n'+goalsText(A):''}`;}
return{KINDS,GOALS,MECHX,VARIANTS,goals,defaults,setGoals,addGoal,removeGoal,tag,tagBlock,verify,propose,applyVariant,goalsText,verifyText,proposeText,aiRules};
})();
if(typeof module!=='undefined')module.exports=SGARCH;
