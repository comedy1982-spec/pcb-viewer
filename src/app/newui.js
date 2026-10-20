/* ---------- new design: project → blocks → board + schematic (NEWPROJ), deterministic or AI ---------- */
var NP={plan:null,hist:[],log:[],seq:0,busy:false,stopReq:false,abort:null,inHist:[],hi:-1};
const NP_TPL=[
  ['eLSD ECU','eLSD ECU','eLSD ECU: 12V 배터리 입력(역전압·서지 보호), AURIX MCU, CAN-FD 통신, DC 모터 H-bridge 게이트 드라이버, 전류·온도 센싱, UART/JTAG 디버그와 XCP 캘리브레이션, 워치독, ASIL B'],
  ['BLDC 팬 컨트롤러','BLDC 팬 컨트롤러 v0.1','12V 입력 BLDC 모터 컨트롤러, STM32, 홀 센서, CAN 통신, 상태 LED 2개, 버튼 1개, 전압 감시'],
  ['CAN 센서 노드','CAN 센서 노드 v0.1','12V 입력 CAN 센서 노드, STM32, I2C 센서 확장, UART 디버그, LED 1개'],
  ['USB DC 모터 보드','USB DC 모터 보드 v0.1','USB 전원 DC 모터 구동, 전류 감시, LED 2개, 버튼 1개'],
  ['AURIX CAN 게이트웨이','AURIX CAN 노드 v0.1','24V 입력 TC364 AURIX CAN 노드, UART 디버그, 데이터 로그용 플래시, LED 2개'],
  ['빈 프로젝트','새 프로젝트','']];
const NP_HELP=[
  ['help','명령 목록'],
  ['arch <요구사항>','요구사항 → HW 블록 다이어그램 (부품 미정, 결정론 규칙)'],
  ['block <그룹> "<이름>" [--feat "기능1; 기능2"] [--id ID] [--ext]','HW 블록 추가. 그룹: power comm ctrl io ext (전원 · 통신 · 제어 · 구동/센싱/진단 · 외부)'],
  ['feat <ID> "<기능>" · feat <ID> --clear · rename <ID> "<이름>" · move <ID> <그룹> · del <ID>','블록 기능 줄 · 이름 · 그룹 · 삭제'],
  ['link <A> <B> "<신호/레일>" [--kind power|signal|bus] [--both] · unlink <A> <B>','블록 사이 인터페이스 (화살표와 라벨)'],
  ['impl <ID> <회로블록|none> [--파라미터 값] [--swap <기존블록>] · impl <ID> part <MPN> [--pins SI=SPI_MOSI,…]','HW 블록을 구현할 회로 라이브러리 블록 (2단계 부품 선정용). part <MPN>이면 부품 라이브러리/Claude 추정 핀 배열로 그 부품을 직접 넣음(전원·접지 자동, SPI/I²C/UART/IRQ 핀은 MCU 배정). --swap 이면 기존 구현을 바꿈'],
  ['safety level <QM|A|B|C|D> [--goal "…"] · safety block <ID> <등급|auto> · safety apply [all|sw|uv wdt_ext drv_fb sbc cutoff2 …] · safety sw · safety ffi · safety','기능 안전: 시스템/블록 ASIL, 등급별 권장 HW 메커니즘 블록(전원 감시·외부 워치독·fault 리드백·SBC·이중 차단·리던던트 센서·2채널)과 SW 메커니즘(흐름 감시·BIST·범위 검사·메모리·클럭·ADC·E2E·리드백·타당성·HW 주기 테스트·파티셔닝 — MCU 블록에 기록), HW 부품마다 필요한 SW, FFI 경계, 상태'],
  ['bind','블록 이름·기능에 적힌 부품 번호(CC2420 등)를 impl part 로 연결 (AI 모드면 핀 배열 추정)'],
  ['map · view hw|parts','아키텍처 → 회로 블록 대응 · 다이어그램 종류 (HW 블록 / 부품 구성)'],['plan · status','블록·전원 레일·MCU 핀 배정·BOM·경고'],['name <이름> · req <요구사항>','프로젝트 이름·요구사항'],
  ['auto','요구사항 문장을 규칙으로 블록 계획으로 바꿈 (결정론)'],['blocks · mcus','블록 라이브러리와 파라미터 · MCU 목록'],
  ['add <블록> [--파라미터 값]','블록 추가 (예: add led --n 3 --color 빨강, add ldo --vout 5, add pwr_in --vin 24)'],
  ['set <블록ID> <파라미터> <값> · remove <블록ID>','블록 수정·삭제 (ID는 plan에 표시)'],['mcu <stm32|tc364>','MCU 바꾸기'],
  ['board <가로> <세로> | board auto | board min · board layers <2|4|6|8|10> · board route on|off · strategy <balanced|thermal|noise|compact>','PCB 조건 (3단계 PCB 시작 때 적용): 보드 크기(자동 · 최소화 · 직접) · 동박 층 수 · 자동 배선 · 배치 전략'],
  ['diagram','시스템 다이어그램을 글로 (블록 · 전원 레일 · MCU 신호 · 외부 연결)'],
  ['variants · variants pick <cost|std|ext>','회로 안 3가지(저가형 · 표준 · 확장형)를 가격·기능·확장성으로 비교하고 고름 → 2단계'],
  ['generate [cost|std|ext] [--pcb]','다이어그램의 블록으로 회로(부품·넷리스트·회로도)를 생성 → 2단계. PCB 배치·배선은 3단계에서 시작 (--pcb면 이어서 3단계 PCB 시작)'],
  ['undo · clear','계획 되돌리기 · 화면 지우기'],['ai <요청>','Claude가 위 명령으로 계획을 세우거나 고침']];
const NP_CMDS=new Set(['bind','safety','variants','arch','block','feat','rename','move','link','unlink','del','impl','map','view','diagram','help','?','plan','status','name','req','auto','blocks','mcus','add','set','remove','mcu','board','strategy','generate','undo','clear','ai']);
function npSay(k,t){const e={k,t,id:++NP.seq};NP.log.push(e);if(NP.log.length>300)NP.log.shift();npPaint(e);return e;}
function npSet(e,t){e.t=t;npPaint(e,true);}
function npPaint(e,upd){copPaint('np',e,upd);}
function npPush(){NP.hist.push(JSON.stringify({plan:NP.plan,arch:NP.arch||null}));if(NP.hist.length>60)NP.hist.shift();}
function npEnsure(){if(!NP.plan)NP.plan=NEWPROJ.newPlan($('#npName').value.trim()||'새 프로젝트');return NP.plan;}
function npOpen(){setStep(1);}
function npInit(){
  const M=$('#sysWs');
  if(!M.dataset.init){M.dataset.init=1;
    $('#npTpl').innerHTML=NP_TPL.map(([l],i)=>`<button type="button" class="pill vbtn" data-tpl="${i}">${esc(l)}</button>`).join('');
    $('#npAddSel').innerHTML=Object.entries(NEWPROJ.LIB).map(([k,v])=>`<option value="${k}">${esc(v.label)} (${k})</option>`).join('');
    npSay('out','요구사항을 적고 [블록 다이어그램 만들기]를 누르세요. 1단계는 부품을 정하지 않은 HW 블록 다이어그램입니다. 결정론 모드는 정해진 규칙으로, AI 모드는 Claude가 블록·인터페이스를 설계합니다. 명령은 help.');}
  npRender();
}
function npRender(){
  const P=NP.plan;$('#npPlanHint').textContent=AIM.mode==='ai'?'AI: Claude가 블록·인터페이스를 설계 (보는 사람의 사용량)':'결정론: 낱말 규칙으로 블록 설계';
  if(P){if(document.activeElement!==$('#npName'))$('#npName').value=P.name;if(document.activeElement!==$('#npReq')&&P.req)$('#npReq').value=P.req;}
  if(P&&P.blocks.length){const k=JSON.stringify(P.blocks);if(SYS.pk!==k){SYS.pk=k;SYS.src='plan';}}sysRender();
  {const h=$('#implHint');if(h)h.textContent=P&&P.blocks.length?` · 회로 블록 ${P.blocks.length}개${NP.planManual?' (직접 수정)':' (아키텍처에서 자동)'}`:'';}
  if(NP.arch&&document.activeElement!==$('#npName')&&NP.arch.name)$('#npName').value=NP.arch.name;
  const host=$('#npBlocks');
  if(!P||!P.blocks.length){host.innerHTML='<p class="lead" style="margin:0">아직 블록이 없습니다.</p>';$('#npSum').textContent=P?NEWPROJ.summary(P).text:'요구사항을 적고 [계획 세우기]를 누르거나, 블록을 직접 추가하세요.';$('#npGen').disabled=!P||!P.blocks.length;return;}
  host.innerHTML=P.blocks.map(b=>{const L=NEWPROJ.LIB[b.type];return`<div class="np-blk" data-b="${b.id}"><div class="np-bh"><b>${esc(L.label)}</b><span class="mono">${b.id}</span><button type="button" class="linkbtn" data-rm="${b.id}" aria-label="${b.id} 삭제">삭제</button></div>
    ${Object.keys(L.params).length?`<div class="np-ps">${Object.entries(L.params).map(([k,d])=>`<label title="${esc(d.desc)}">${k} <input data-p="${k}" value="${esc(b.params[k])}" size="${Math.max(3,String(b.params[k]).length+1)}"></label>`).join('')}</div>`:''}<div class="np-bd">${esc(L.desc)}</div></div>`;}).join('');
  const s=NEWPROJ.summary(P);$('#npSum').textContent=s.text;$('#npGen').disabled=false;
  $('#npMsg').textContent=s.r.warn.length?`경고 ${s.r.warn.length}개 · 부품 ${s.r.parts.length}개`:`부품 ${s.r.parts.length}개 · 보드 ${s.r.W} × ${s.r.H} mm`;
}
function npBusy(b){NP.busy=b;['#npGen','#npPlan','#npAdd'].forEach(id=>{const e=$(id);if(e)e.disabled=b;});if(!b){NP.stopReq=false;NP.abort=null;}copBusyPaint();}
/* commands */
async function npRun(line,by){
  const t=cliTok(line);if(!t.length)return'';const cmd=t[0].toLowerCase();const a=cliArgs(t.slice(1));
  switch(cmd){
    case'help':case'?':return NP_HELP.map(x=>`${x[0]}\n  ${x[1]}`).join('\n')+'\n\n라이브러리에 없는 부품은 생성 후 회로도 CLI의 add로 더하세요.';
    case'plan':case'status':return NEWPROJ.summary(npEnsure()).text;
    case'arch':{const req=a._.join(' ')||$('#npReq').value.trim();if(!req)throw new Error('요구사항이 비어 있습니다 (arch <문장> 또는 왼쪽 칸)');npPush();const r=HWARCH.archFrom(req,$('#npName').value.trim()||null);NP.arch=r.arch;SYS.view='hw';archToPlan(true);npRender();return'규칙 해석: '+r.log.join(' · ')+'\n'+HWARCH.text(NP.arch);}
    case'block':{npPush();const A=archEnsure();const feats=a.feat&&a.feat!==true?String(a.feat).split(/\s*;\s*/):[];const b=HWARCH.addBlock(A,a._[0],a._.slice(1).join(' '),{feats,id:a.id&&a.id!==true?String(a.id):null,ext:!!a.ext});archToPlan();npRender();return`${b.id}: ${HWARCH.GROUPS.find(g=>g[0]===b.group)[1]} 그룹에 "${b.label}" 추가`;}
    case'feat':{npPush();const b=HWARCH.find(archEnsure(),a._[0]);if(a.clear)b.feats=[];else{const t=a._.slice(1).join(' ');if(!t)throw new Error('feat <ID> "<기능>"');b.feats.push(t);}npRender();return`${b.id}: ${b.feats.join(' · ')||'(기능 없음)'}`;}
    case'rename':{npPush();const b=HWARCH.find(archEnsure(),a._[0]);b.label=a._.slice(1).join(' ')||b.label;npRender();return`${b.id} → "${b.label}"`;}
    case'move':{npPush();const b=HWARCH.find(archEnsure(),a._[0]);const g=HWARCH.gAlias(a._[1]);if(!g)throw new Error('그룹: power comm ctrl io ext');b.group=g;npRender();return`${b.id} → ${g}`;}
    case'link':{npPush();const l=HWARCH.link(archEnsure(),a._[0],a._[1],a._.slice(2).join(' '),{kind:a.kind,both:!!a.both});npRender();return`${l.a} ${l.both?'↔':'→'} ${l.b} : ${l.label} [${l.kind}]`;}
    case'unlink':{npPush();const n=HWARCH.unlink(archEnsure(),a._[0],a._[1]);npRender();return n?`${a._[0]} — ${a._[1]} 연결 삭제`:'그런 연결이 없습니다.';}
    case'del':{npPush();const b=HWARCH.remove(archEnsure(),a._[0]);archToPlan();npRender();return`${b.id} "${b.label}" 삭제`;}
    case'impl':{npPush();const b=HWARCH.find(archEnsure(),a._[0]);const t=String(a._[1]||'').toLowerCase();if(t==='none'||t==='-'){b.impl=[];}else{const k=NEWPROJ.blockKey(t);if(!k)throw new Error('회로 블록: '+Object.keys(NEWPROJ.LIB).join(', ')+' · none');const params={};Object.keys(a).forEach(x=>{if(x!=='_'&&x!=='swap'&&x!=='replace')params[x]=a[x];});if(k==='part'){if(a._[2]&&!params.mpn)params.mpn=a._.slice(2).join(' ');if(!params.mpn)throw new Error('impl <ID> part <MPN> [--pins 핀=넷,…]');const rec=NEWPROJ.partLookup?NEWPROJ.partLookup(params.mpn):null;if(!rec||!(rec.pins&&rec.pins.length)){if(typeof plAskClaude==='function'&&AIM.mode==='ai'){try{npSay('out',`${params.mpn}: 라이브러리에 핀 정보가 없어 Claude가 추정합니다…`);await plAskClaude(params.mpn,{hint:(NP.arch&&NP.arch.name)||'',role:b.label});}catch(e){npSay('err',e.message||String(e));}}}}const sw=a.swap||a.replace;const swK=sw&&sw!==true?NEWPROJ.blockKey(String(sw)):null;
      if(sw===true||swK){const old=(b.impl||[]).find(i=>swK?i.type===swK:true);if(old&&old.params)Object.keys(old.params).forEach(p=>{if(!(p in params)&&NEWPROJ.LIB[k].params[p])params[p]=old.params[p];});b.impl=swK?(b.impl||[]).filter(i=>i!==old):[];}
      b.impl=(b.impl||[]).concat([{type:k,params}]);}NP.planManual=false;archToPlan(true);npRender();return`${b.id} ⇒ ${(b.impl||[]).map(i=>i.type).join(' + ')||'(구현 없음)'}`;}
    case'safety':{const A=archEnsure();A.safety=A.safety||{level:'QM',goals:[]};const sub=String(a._[0]||'').toLowerCase();
      if(!sub||sub==='status'||sub==='check'){npRender();return SAFETY.archText(A);}
      if(sub==='level'){npPush();const lv=SAFETY.parseLevel('ASIL '+String(a._[1]||''))||SAFETY.parseLevel(String(a._[1]||''));if(!lv)throw new Error('safety level <QM|A|B|C|D>');A.safety.level=lv;if(a.goal&&a.goal!==true)A.safety.goals=[String(a.goal)];npRender();return`시스템 ASIL ${lv}${A.safety.goals.length?' · 안전 목표: '+A.safety.goals.join(' / '):''}\n`+SAFETY.archText(A);}
      if(sub==='goal'){npPush();const g=a._.slice(1).join(' ');if(a.clear)A.safety.goals=[];else if(g)A.safety.goals.push(g);npRender();return'안전 목표: '+(A.safety.goals.join(' / ')||'(없음)');}
      if(sub==='block'){npPush();const b=HWARCH.find(A,a._[1]);const lv=String(a._[2]||'').toUpperCase();if(lv==='-'||lv==='NONE'||lv==='AUTO')delete b.asil;else{if(!SAFETY.LEVELS.includes(lv))throw new Error('safety block <ID> <QM|A|B|C|D|auto>');b.asil=lv;}npRender();return`${b.id} ${b.label}: ASIL ${SAFETY.blockLevel(A,b)}${b.asil?'':' (시스템 등급 상속)'}`;}
      if(sub==='apply'){npPush();const ids=a._.length>1&&a._[1]!=='all'?a._.slice(1):'all';const added=SAFETY.apply(A,HWARCH,ids);NP.planManual=false;archToPlan(true);npRender();const hw=added.filter(b=>!b.sw),sw=added.filter(b=>b.sw);return added.length?`${hw.length?`HW 메커니즘 블록 ${hw.length}개 추가: ${hw.map(b=>`${b.id} "${b.label}"${(b.impl||[]).length?' ⇒ '+b.impl.map(i=>i.type).join('+'):' (회로 블록 없음 — 2단계에서 직접)'}`).join(', ')}`:''}${sw.length?`${hw.length?'\n':''}SW 메커니즘 ${sw.length}개를 MCU 블록에 기록: ${sw.map(b=>b.label).join(' · ')}`:''}\n`+SAFETY.archText(A):'추가할 메커니즘이 없습니다 (이미 모두 있음).';}
      if(sub==='sw'){const SW=SAFETY.swMechanisms(A);const N=SAFETY.hwNeeds(A);return`SW 메커니즘 (ASIL ${SAFETY.level(A)} 기준 ${SW.length}개)\n`+SW.map(m=>`${m.present?'✓':'○'} [${m.min}+] ${m.label} — ${m.desc}`).join('\n')+(N.length?'\n\nHW 부품이 등급을 내려면 필요한 SW:\n'+N.map(n=>`• ${n.label} (${n.block}): ${n.needs}`).join('\n'):'');}
      if(sub==='ffi'){const F=SAFETY.boundaries(A);return F.length?F.map(f=>f.msg).join('\n'):'ASIL이 다른 블록 사이의 인터페이스(FFI 경계)가 없습니다.';}
      throw new Error('safety [status|level <QM|A|B|C|D> [--goal "…"]|goal "…"|block <ID> <등급|auto>|apply [all|sw|id…]|sw|ffi]');}
    case'bind':{const r=await npBindParts();return r.length?'부품 번호 → 회로 구현: '+r.join(', '):'블록 이름·기능에서 라이브러리에 있는 부품 번호를 찾지 못했습니다 (impl <ID> part <MPN> 으로 직접 지정).';}
    case'map':{const A=archEnsure();const t=HWARCH.toPlan(A);return`${A.blocks.filter(b=>!b.ext).map(b=>`${b.id} ${b.label} ⇒ ${(b.impl||[]).map(i=>i.type).join(' + ')||'(없음 — 회로 단계에서 직접)'}`).join('\n')}${t.log.length?'\n'+t.log.join(' · '):''}\n\n${NEWPROJ.summary(t.plan).text.split('\n').slice(0,4).join('\n')}`;}
    case'view':{const v=/part|부품/.test(a._[0]||'')?'parts':'hw';SYS.view=v;sysRender();return v==='hw'?'HW 블록 다이어그램':'부품 구성도';}
    case'diagram':{const A=sysArch();if(SYS.view!=='parts'&&A)return HWARCH.text(A);const D=sysDiagram();return D?SYSDIAG.text(D):'다이어그램이 없습니다. 요구사항으로 계획을 세우거나 보드를 불러오세요.';}
    case'name':{npPush();npEnsure().name=a._.join(' ')||'새 프로젝트';npRender();return'이름: '+NP.plan.name;}
    case'req':{npPush();npEnsure().req=a._.join(' ');npRender();return'요구사항을 저장했습니다.';}
    case'auto':{const req=a._.join(' ')||(NP.plan&&NP.plan.req)||$('#npReq').value.trim();if(!req)throw new Error('요구사항이 비어 있습니다 (req <문장> 또는 왼쪽 칸)');
      if(NP.plan)npPush();const prevP=NP.plan;const r=NEWPROJ.planFrom(req,$('#npName').value.trim()||null);NP.plan=r.plan;if(prevP&&prevP.pcb)NP.plan.pcb=prevP.pcb;npRender();return'규칙 해석: '+r.log.join(' · ')+'\n'+NEWPROJ.summary(NP.plan).text;}
    case'blocks':return Object.entries(NEWPROJ.LIB).map(([k,v])=>`${k.padEnd(8)} ${v.label} — ${v.desc}${Object.keys(v.params).length?'\n    '+Object.entries(v.params).map(([p,d])=>`--${p} (${d.def}) ${d.desc}`).join(' · '):''}`).join('\n');
    case'mcus':return Object.entries(NEWPROJ.MCUS).map(([k,v])=>`${k} — ${v.label}`).join('\n');
    case'add':{npPush();const params={};Object.keys(a).forEach(k=>{if(k!=='_')params[k]=a[k];});
      if(NP.arch&&NP.arch.blocks.length){const k=NEWPROJ.blockKey(a._[0]);if(!k){NP.hist.pop();throw new Error('블록: '+Object.keys(NEWPROJ.LIB).join(', '));}const L=NEWPROJ.LIB[k];const g=npGroupOf(k);const b=HWARCH.addBlock(NP.arch,g,L.label,{feats:[L.desc.split(' · ')[0]],id:k});b.impl=[{type:k,params}];const ctrl=NP.arch.blocks.find(x=>x.group==='ctrl');if(ctrl&&b!==ctrl)HWARCH.link(NP.arch,g==='power'?b.id:ctrl.id,g==='power'?ctrl.id:b.id,g==='power'?(params.vout?params.vout+' V':'전원'):g==='comm'?'버스':'제어 · 피드백',{kind:g==='power'?'power':'signal'});NP.planManual=false;archToPlan(true);npRender();return`${b.id} "${b.label}" HW 블록 추가 ⇒ ${k} ${Object.entries(params).map(([x,v])=>`${x}=${v}`).join(' ')} (다이어그램·회로 계획 동기화)`;}
      NP.planManual=true;try{const b=NEWPROJ.addBlock(npEnsure(),a._[0],params);npRender();return`${b.id} 추가 · ${NEWPROJ.LIB[b.type].label} ${Object.entries(b.params).map(([k,v])=>`${k}=${v}`).join(' ')}`;}catch(e){NP.hist.pop();throw e;}}
    case'set':{npPush();const v=a._.slice(2).join(' ');if(NP.arch&&NP.arch.blocks.length){const hit=npArchImpl(a._[0]);if(hit){if(!(a._[1] in NEWPROJ.LIB[hit.im.type].params)){NP.hist.pop();throw new Error(`${hit.im.type} 파라미터: ${Object.keys(NEWPROJ.LIB[hit.im.type].params).join(', ')}`);}hit.im.params=hit.im.params||{};hit.im.params[a._[1]]=v;NP.planManual=false;archToPlan(true);npRender();return`${hit.b.id} (${hit.im.type}).${a._[1]} = ${v} (다이어그램·회로 계획 동기화)`;}}
      NP.planManual=true;try{NEWPROJ.setParam(npEnsure(),a._[0],a._[1],v);}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]}.${a._[1]} = ${v}`;}
    case'remove':{npPush();if(NP.arch&&NP.arch.blocks.length){const hit=npArchImpl(a._[0]);if(hit){hit.b.impl=hit.b.impl.filter(x=>x!==hit.im);const gone=!hit.b.impl.length&&!hit.b.ext&&!hit.b.safety;if(gone)HWARCH.remove(NP.arch,hit.b.id);NP.planManual=false;archToPlan(true);npRender();return`${hit.im.type} 구현 삭제${gone?` · HW 블록 ${hit.b.id} "${hit.b.label}" 삭제`:` (HW 블록 ${hit.b.id}는 남김)`}`;}}
      NP.planManual=true;try{NEWPROJ.removeBlock(npEnsure(),a._[0]);}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]} 삭제`;}
    case'mcu':{const k=NEWPROJ.mcuKey(a._[0]);if(!k)throw new Error('MCU: '+Object.keys(NEWPROJ.MCUS).join(', '));npPush();if(NP.arch&&NP.arch.blocks.length){const hit=npArchImpl('mcu');if(hit){hit.im.params=Object.assign(hit.im.params||{},{part:k});hit.b.feats=hit.b.feats.map(f=>/^Core:/.test(f)?`Core: ${NEWPROJ.MCUS[k].label}`:f);NP.planManual=false;archToPlan(true);npRender();return`MCU → ${k} (${hit.b.id} 블록 구현 갱신)`;}}const P=npEnsure();const b=P.blocks.find(x=>x.type==='mcu');if(b)b.params.part=k;else NEWPROJ.addBlock(P,'mcu',{part:k});npRender();return'MCU → '+k;}
    case'board':{npPush();const P=npEnsure();const s0=String(a._[0]||'').toLowerCase();P.pcb=P.pcb||{};
      const live=()=>BD&&!BD.pcbPending&&BD.newPlan?'\n지금 보드는 이미 PCB가 배치돼 있습니다. 3단계 배치·배선 CLI에서 같은 명령(board layers / board minimize --route)을 실행하면 바로 바뀝니다.':(BD&&BD.pcbPending?(BD.pcbPlan=Object.assign(BD.pcbPlan||{},P.pcb,P.board?{board:{w:P.board.w,h:P.board.h}}:{}),''):'');
      if(s0==='layers'||s0==='layer'){const n=+a._[1];if(!PCB.STACKS[n])throw new Error('board layers <2|4|6|8|10>');P.pcb.layers=n;npRender();return`PCB 조건: ${n}층 (${PCB.STACKS[n].map(x=>x==='sig'?'S':x==='gnd'?'GND':'PWR').join('·')}) — 3단계 PCB 시작 때 적용`+live();}
      if(/^(min|minimize|minimise|최소|최소화)$/.test(s0)){P.board=null;P.pcb.min=true;npRender();return'PCB 조건: 보드 크기 최소화 — 3단계에서 부품이 들어가고 배선되는 가장 작은 크기를 찾습니다.'+live();}
      if(s0==='route'){P.pcb.route=!/^(off|0|false|no)$/i.test(a._[1]||'on');npRender();return`PCB 조건: 자동 배선 ${P.pcb.route?'켬':'끔'}`;}
      if(a._[0]==='auto'||!a._.length){P.board=null;P.pcb.min=false;}else{let w=+a._[0],h=+a._[1];if(!h&&/x|×/i.test(a._[0])){[w,h]=a._[0].split(/x|×/i).map(Number);}if(!(w>=20&&h>=20))throw new Error('board <가로> <세로> (mm, 20 이상) 또는 board auto');P.board={w,h};P.pcb.min=false;}npRender();return(P.board?`보드 ${P.board.w} × ${P.board.h} mm`:'보드 크기 자동')+' — 3단계 PCB 시작 때 적용';}
    case'strategy':{const k=AUTOPLACE.strategy(a._[0]);if(!k)throw new Error('balanced · thermal · noise · compact');npPush();npEnsure().strategy=k;npRender();return'배치 전략 '+k;}
    case'generate':return await npGenerate({pcb:!!(a.pcb||a.route===true||a.route==='1'||a.view==='pcb'),strategy:a.strategy,variant:a.variant||a._[0],by});
    case'variants':{if(a._[0]==='pick'&&a._[1])return await npGenerate({variant:a._[1],by});const vs=npVariants(true);NP.chooser=true;if(HS.ws!=='board'||S.sch!=='full')setStep(2);else stepPaint();return '회로 안 비교 (참고 단가는 데이터시트 DB의 추정값):\n'+NEWPROJ.variantsText(vs)+'\n→ variants pick cost|std|ext 또는 카드의 버튼으로 생성';}
    case'undo':{if(!NP.hist.length)return'되돌릴 것이 없습니다.';const h=JSON.parse(NP.hist.pop());if(h&&'plan' in h){NP.plan=h.plan;NP.arch=h.arch;}else NP.plan=h;npRender();return'되돌렸습니다.';}
    case'clear':{copClear('np');NP.log=[];return'';}
    case'ai':return await npAI(t.slice(1).join(' '));
    default:throw new Error('알 수 없는 명령: '+cmd);
  }
}
async function npExec(line){
  npSay('cmd',line);npBusy(true);
  try{const f=(cliTok(line)[0]||'').toLowerCase();
    if(NP_CMDS.has(f)){const o=await npRun(line);if(o)npSay('ok',o);}
    else if(typeof plIntent==='function'&&plIntent(line)&&BD&&!BD.blank){await plReplaceFlow(plIntent(line),'np');}
    else if(typeof plIntent==='function'&&plIntent(line)){npSay('out','부품 교체는 회로가 만들어진 뒤(2단계 이후) 할 수 있습니다. 블록 수준에서는 impl <블록> <라이브러리 블록>으로 구현을 바꾸세요.');}
    else if(AIM.mode==='ai'&&(await cliAiProbe(),CLI.sample)&&(NP.arch&&NP.arch.blocks.length)&&(npIsChange(line)||!npIsReq(line)))await npAI(line);
    else if(AIM.mode==='ai'&&!CLI.sample&&aimUnavailableNote(npSay)&&false){}
    else if(await aimDetQuestion(line,npSay,()=>npRun('status'))){}
    else if(npNL(line)){const cmds=npNL(line);npSay('out','해석: '+cmds.join(' → '));for(const c of cmds){npSay('cmd',c);const o=await npRun(c);if(o)npSay('ok',o);}}
    else if(NP.arch&&NP.arch.blocks.length&&npIsChange(line)){npSay('err','변경 요청을 규칙으로 해석하지 못했습니다. 예: "LDO를 벅으로 바꿔줘" · "LED 3개로" · "CAN 빼줘" · "MCU를 TC364로" · "버튼 추가" — 또는 impl/add/set/remove/mcu 명령, 아니면 AI 모드로 전환하세요. (문장을 요구사항에 덧붙여 다시 분석하지 않았습니다)');}
    else{const cur=$('#npReq').value.trim();const req=cur&&NP.arch&&NP.arch.blocks.length&&!/요구|설계|만들|보드|노드|컨트롤러|ecu/i.test(line)?cur+'\n'+line:line;$('#npReq').value=req;await npAnalyze(req,true);}
  }catch(e){console.error(e);npSay('err',e.message||String(e));}
  npBusy(false);
}
// PCB wishes typed as a sentence in steps 1–2 (layer count, minimum size, exact size) → board commands, not a new architecture
const npIsChange=t=>/바꿔|바꾸|교체|변경|대체|대신|추가|넣어|넣고|달아|붙여|빼|삭제|제거|없애|늘려|줄여|개로|으로\s*해|로\s*해|하도록|되도록|대응|적용|변경해|바꿔줘|swap|replace|change|remove|add\b/i.test(t);
const NP_WORDS=[[/벅|buck|dc-?dc|스위칭|smps/i,'buck'],[/ldo|리니어|선형|레귤레이터|regulator/i,'ldo'],[/usb/i,'usb_in'],[/dc\s*전원|전원\s*입력|입력\s*전원|배터리|pwr_in|power\s*in/i,'pwr_in'],[/mcu|마이컨|마이크로컨트롤러/i,'mcu'],[/크리스털|crystal|xtal|오실/i,'xtal'],[/\bcan\b/i,'can'],[/bldc|3상/i,'bldc'],[/dc\s*모터|모터|motor/i,'dcmotor'],[/led/i,'led'],[/버튼|button|스위치|switch/i,'button'],[/플래시|flash|메모리|memory/i,'flash'],[/uart|시리얼|serial|디버그|debug/i,'uart'],[/i2c|i²c/i,'i2c'],[/전압\s*감시|vmon|분압/i,'vmon'],[/워치독|watchdog|감시\s*ic|supervisor/i,'supervisor'],[/하이사이드|차단\s*스위치|hs_switch|cut.?off/i,'hs_switch']];
function npWordKey(seg){for(const[re,k]of NP_WORDS)if(re.test(seg))return k;return null;}
function npGroupOf(k){return/^(pwr_in|usb_in|ldo|buck|supervisor|hs_switch|vmon)$/.test(k)?'power':/^(can|uart|i2c)$/.test(k)?'comm':/^(mcu|xtal)$/.test(k)?'ctrl':'io';}
/* the HW block (and its impl entry) that implements a circuit block type or plan id */
function npArchImpl(idOrType){const A=NP.arch;if(!A)return null;const t=String(idOrType||'').toLowerCase().replace(/\d+$/,'');const k=NEWPROJ.blockKey(t)||t;
  for(const b of A.blocks){const im=(b.impl||[]).find(i=>i.type===k);if(im)return{b,im};}return null;}
/* part-composition sentences → block commands (step 1, deterministic) */
function npNL2(t){const s=t.trim();const out=[];let m;
  if((m=s.match(/ASIL[\s\-_]*([ABCD])\b/i))&&/대응|적용|맞춰|설계|등급|으로|로\b/.test(s))return[`safety level ${m[1].toUpperCase()}`,'safety apply all'];
  if((m=s.match(/(bldc|dc\s*모터|모터|motor|can|uart|i2c|버튼|button)\s*(?:motor|모터)?\s*(?:을|를|이|가)?\s*(\d+)\s*개/i))&&/구동|추가|필요|넣|달|써|연결|해야/.test(s)){const k=npWordKey(m[1]);const n=+m[2];if(k&&k!=='led'){const have=NP.arch?NP.arch.blocks.reduce((a,b)=>a+(b.impl||[]).filter(i=>i.type===k).length,0):0;const cmds=[];for(let i=have;i<n;i++)cmds.push(`add ${k}`);return cmds.length?cmds:[`plan`];}}
  const mcuOf=x=>{const k=NEWPROJ.mcuKey?NEWPROJ.mcuKey(x):null;if(k)return k;if(/tc364|aurix|tc3/i.test(x))return'tc364';if(/stm32|cortex|st/i.test(x))return'stm32';return null;};
  // "A를 B로 바꿔/교체/대신"
  if((m=s.match(/^(.+?)\s*(?:을|를|은|는)?\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|바꾸|교체|변경|대체|해\s*줘|해줘)/))||(m=s.match(/^(.+?)\s*대신(?:에)?\s+(.+?)\s*(?:을|를)?\s*(?:써|사용|넣|적용)/))){
    const a=m[1],b=m[2];if(/mcu|마이컨/i.test(a)||mcuOf(b)&&!npWordKey(b)){const k=mcuOf(b);if(k)return[`mcu ${k}`];}
    const ka=npWordKey(a),kb=npWordKey(b);if(ka&&kb&&ka!==kb){const hit=npArchImpl(ka);const n=(b.match(/(\d+)\s*개/)||[])[1];const v=(b.match(/(\d+(?:\.\d+)?)\s*v/i)||[])[1];const extra=(kb==='led'&&n?' --n '+n:'')+(/^(ldo|buck)$/.test(kb)&&v?' --vout '+v:'');
      if(hit)return[`impl ${hit.b.id} ${kb}${extra} --swap ${ka}`];return[`remove ${ka}`,`add ${kb}${extra}`];}
    if(ka&&!kb){const v=(b.match(/(\d+(?:\.\d+)?)\s*v/i)||[])[1];const n=(b.match(/(\d+)\s*개/)||[])[1];if(v&&/^(ldo|buck)$/.test(ka))return[`set ${ka} vout ${v}`];if(v&&ka==='pwr_in')return[`set pwr_in vin ${v}`];if(n&&ka==='led')return[`set led n ${n}`];}}
  // "LED 3개로" / "LED를 3개로 늘려"
  if((m=s.match(/(led|버튼|button)\s*(?:을|를)?\s*(\d+)\s*개/i))){const k=npWordKey(m[1]);if(k==='led')return[`set led n ${m[2]}`];}
  // "입력 24V로" / "전원 12V로 바꿔"
  if((m=s.match(/(입력|전원|vin)[^\d]{0,6}(\d+(?:\.\d+)?)\s*v/i))&&/바꿔|변경|로\b|으로/.test(s))return[`set pwr_in vin ${m[2]}`];
  // "X 추가/넣어" · "X 빼/삭제"
  if((m=s.match(/^(.+?)\s*(?:을|를)?\s*(?:추가|넣어|넣고|달아|붙여|add)/i))){const k=npWordKey(m[1]);if(k){const n=(s.match(/(\d+)\s*개/)||[])[1];const v=(s.match(/(\d+(?:\.\d+)?)\s*v/i)||[])[1];return[`add ${k}${k==='led'&&n?' --n '+n:''}${/^(ldo|buck)$/.test(k)&&v?' --vout '+v:''}${k==='pwr_in'&&v?' --vin '+v:''}`];}}
  if((m=s.match(/^(.+?)\s*(?:을|를|은|는)?\s*(?:빼|삭제|제거|없애|remove|delete)/i))){const k=npWordKey(m[1]);if(k)return[`remove ${k}`];}
  return out.length?out:null;}
function npNL(t){const s=t.toLowerCase();const out=[];const c2=NP.arch&&NP.arch.blocks.length?npNL2(t):null;if(c2)return c2;const ly=s.match(/(\d+)\s*(?:층|레이어|layers?)/);if(ly&&PCB.STACKS[+ly[1]])out.push(`board layers ${ly[1]}`);
  if(/(최소화|최소로|최소\s*크기|minimi[sz]e|줄여|작게)/.test(s)&&/(크기|사이즈|싸이즈|size|보드|기판|면적)/.test(s))out.push('board min');
  const m=s.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)/);if(m&&/보드|기판|board|크기|사이즈/.test(s))out.push(`board ${m[1]} ${m[2]}`);
  return out.length?out:null;}
// build the board from the plan and load it into the viewer
async function npGenerate(o){
  if(NP.arch&&!NP.planManual)archToPlan(true);const P0=npEnsure();if(!P0.blocks.length)throw new Error('회로로 구현할 블록이 없습니다 (HW 블록에 impl을 지정하세요)');
  if(!o.variant){const vs=npVariants(true);NP.chooser=true;setStep(2);const rec=NEWPROJ.recommend(vs,NP.vw);return '회로 안을 고르세요 (참고 단가는 데이터시트 DB 추정값):\n'+NEWPROJ.variantsText(vs)+`\n추천: ${rec.label} (${rec.tag}) — 카드의 [이 안으로 회로 생성] 또는 variants pick ${rec.key}`;}
  const V=npVariants().find(v=>v.key===o.variant);if(!V)throw new Error('회로 안: cost · std · ext');const P=V.plan;P.name=P0.name;P.req=P0.req;NP.picked=V.key;NP.chooser=false;
  if(NP.arch){const um=NP.arch.blocks.filter(b=>!b.ext&&!(b.impl||[]).length).map(b=>b.label);if(um.length)npSay('out',`회로 라이브러리에 대응 블록이 없는 HW 블록: ${um.join(', ')} — 회로 단계에서 회로 CLI(add)로 직접 추가하세요.`);}
  const st=o.strategy?AUTOPLACE.strategy(o.strategy):P.strategy;
  const prog=npSay('out','부품을 고르고 넷리스트·회로도를 만드는 중…');await new Promise(r=>setTimeout(r,20));
  // step 2 is the circuit only: parts, nets and schematic. Placement and routing wait for step 3 (B.pcbPending).
  const{B,r}=NEWPROJ.toBoard(P,{place:false});B.pcbPending=true;B.variant=V.key;B.variantLabel=`${V.label} (${V.tag})`;
  B.pcbPlan=Object.assign({layers:2,min:false,route:true},P.pcb||{},{strategy:st||'balanced',board:P.board?{w:P.board.w,h:P.board.h}:null});
  if(BD&&BD.pid)B.pid=BD.pid;B.notes.push(`새 설계: ${P.blocks.length}개 블록에서 부품 ${r.parts.length}개와 회로도를 만들었습니다. 부품 배치·배선은 3단계(PCB)에서 시작합니다.`);r.warn.forEach(w=>B.warnings.push(w));
  setBoard(B);
  const sheets=BD.schSheets||(schData()&&schData().sheets);const g=GUIDE.evaluate(BD,{scope:'sch',sheets});
  npSet(prog,`회로 생성 [${V.label}]: 부품 ${B.comps.length}개 · BOM 약 $${V.m.price} · 넷 ${Object.keys(B.nets).length}개 · 회로도 ${sheets?sheets.length:0}쪽 · MCU 핀 배정 ${r.assigned.length}개\n회로 가이드라인 ${g.pct.toFixed(0)}% · ${g.verdict}${g.rules.filter(x=>x.status==='fail'||x.status==='partial').slice(0,3).map(x=>'\n  △ '+x.title).join('')}\nPCB 조건(3단계에서 적용): ${pcbPlanText(B.pcbPlan)}`);
  SYS.src='plan';setStep(2);
  if(o.pcb){setStep(3);await pcbStart(B.pcbPlan);return'회로 생성 후 PCB 설계를 시작했습니다 — 결과는 배치·배선 CLI에 있습니다.';}
  toast(`${P.name}: 부품 ${B.comps.length}개로 회로를 만들었습니다. 회로도를 검토한 뒤 3단계에서 PCB를 시작하세요.`);
  return'회로 생성 완료 — 2단계(회로도)에서 검토·수정하고, 3단계 PCB에서 배치·배선을 시작합니다.';
}
const pcbPlanText=p=>`${p.layers||2}층 · ${p.min?'크기 최소화':p.board?`${p.board.w} × ${p.board.h} mm`:'크기 자동'} · ${AUTOPLACE.STRATS[p.strategy]?AUTOPLACE.STRATS[p.strategy].label:p.strategy} 배치 · 자동 배선 ${p.route===false?'끔':'켬'}`;
/* ---------- step 3 gate: the PCB is started explicitly (layers, size, strategy, routing), the console shows each command ---------- */
function pcbGatePaint(){
  const show=!!(BD&&BD.pcbPending&&!BD.blank&&HS.ws==='board'&&S.sch!=='full');let el=$('#pcbGate');
  if(!show){if(el)el.remove();return;}
  if(el)return;const p=Object.assign({layers:2,min:false,route:true,strategy:'balanced',board:null},BD.pcbPlan||{});
  el=document.createElement('div');el.id='pcbGate';el.className='pcb-gate';
  el.innerHTML=`<form class="pg-in" data-f><b>3단계 · PCB 설계 시작</b>
    <p class="lead">회로(부품 ${BD.comps.length}개 · 넷 ${BD.netOrder.length}개)는 준비됐고 아직 배치·배선 전입니다. 조건을 정하면 설계 도우미가 명령을 차례로 실행합니다 (Ctrl+Z로 되돌릴 수 있음).</p>
    <div class="pg-grid">
      <label>동박 층 <select name="layers">${[2,4,6,8,10].map(n=>`<option value="${n}"${n===+p.layers?' selected':''}>${n}층 · ${PCB.STACKS[n].map(x=>x==='sig'?'S':x==='gnd'?'G':'P').join('')}</option>`).join('')}</select></label>
      <label>보드 크기 <select name="size"><option value="min"${p.min?' selected':''}>최소화 (가장 작은 크기 탐색)</option><option value="auto"${!p.min&&!p.board?' selected':''}>자동 (여유 있게)</option><option value="fix"${!p.min&&p.board?' selected':''}>직접 입력</option></select></label>
      <label class="pg-wh">가로 <input type="number" name="w" min="10" max="1000" step="0.5" value="${p.board?p.board.w:f1(BD.W)}"> × 세로 <input type="number" name="h" min="10" max="1000" step="0.5" value="${p.board?p.board.h:f1(BD.H)}"> mm</label>
      <label>배치 전략 <select name="s">${Object.entries(AUTOPLACE.STRATS).map(([k,v])=>`<option value="${k}"${k===p.strategy?' selected':''}>${v.label}</option>`).join('')}</select></label>
      <label class="chkl"><input type="checkbox" name="route"${p.route!==false?' checked':''}> 이어서 자동 배선${'' }</label></div>
    <p class="lead pg-note">PCB 단계에서는 배선을 위해 MCU 핀 배정을 바꾸는 등 회로를 함께 고칠 수 있습니다 (CLI pinswap · 분할 보기에서 회로도 편집).</p>
    <div class="acts"><button type="button" class="btn sm" data-sch>회로도로 돌아가기</button><button type="button" class="btn sm" data-cli title="오른쪽 설계 도우미에 명령이나 문장으로 지시">도우미로 지시</button><button class="btn primary sm">PCB 설계 시작</button></div></form>`;
  $('#vp').appendChild(el);const F=el.querySelector('[data-f]');const wh=F.querySelector('.pg-wh');const sz=F.querySelector('[name=size]');const upd=()=>{wh.hidden=sz.value!=='fix';};sz.addEventListener('change',upd);upd();
  el.querySelector('[data-sch]').addEventListener('click',()=>setStep(2));
  el.querySelector('[data-cli]').addEventListener('click',()=>{if(S.view!=='T'&&S.view!=='B')setView('T');cliToggle(true);});
  F.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(F);const q={layers:+d.get('layers'),min:d.get('size')==='min',board:d.get('size')==='fix'?{w:+d.get('w'),h:+d.get('h')}:null,strategy:d.get('s'),route:!!d.get('route')};BD.pcbPlan=q;pcbStart(q);});
}
async function pcbStart(p){
  p=Object.assign({layers:2,min:false,route:true,strategy:'balanced',board:null},p||{});const g=$('#pcbGate');if(g)g.remove();
  if(S.sch==='full'||!(S.view==='T'||S.view==='B'))setView('T');if(!PE.on)peBegin();cliToggle(true);
  const cmds=[];if(+p.layers!==(BD.copperLayers||2))cmds.push(`board layers ${p.layers}`);
  if(p.min)cmds.push(`board minimize --strategy ${p.strategy}${p.route?' --route':''}`);
  else{if(p.board)cmds.push(`board size ${p.board.w} ${p.board.h} --anchor center`);cmds.push(`reset --strategy ${p.strategy}${p.route?' --route':''}`);}
  cliSay('out','PCB 설계 시작: '+cmds.join(' → '));for(const c of cmds){await cliExec(c);if(CLI.stopReq)break;}
  stepPaint();}
/* ---------- step 2 entry: three circuit variants to pick from (price · features · extensibility) ---------- */
function npVariants(fresh){if(NP.arch&&!NP.planManual)archToPlan(true);const P=npEnsure();const key=JSON.stringify(P.blocks)+'|'+P.req;
  if(fresh||!NP.variants||NP.vkey!==key){NP.variants=NEWPROJ.variants(P);NP.vkey=key;}NP.vw=NP.vw||{price:1,feat:1,ext:1};NEWPROJ.recommend(NP.variants,NP.vw);return NP.variants;}
function planGatePaint(){
  const show=!!(NP.chooser&&HS.ws==='board'&&S.sch==='full'&&NP.plan&&NP.plan.blocks.length);let el=$('#planGate');
  if(!show){if(el)el.remove();return;}
  const vs=npVariants();const rec=NEWPROJ.recommend(vs,NP.vw);const W=NP.vw;
  const bar=(l,v)=>`<div class="pg-bar"><span>${l}</span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`;
  const card=v=>`<article class="vcard${v===rec?' rec':''}${NP.picked===v.key&&BD&&BD.variant===v.key?' cur':''}" data-v="${v.key}">
      <div class="vc-h"><b>${esc(v.label)}</b><span class="vc-tag">${esc(v.tag)}</span>${v===rec?'<span class="vc-rec">추천</span>':''}${NP.picked===v.key&&BD&&BD.variant===v.key?'<span class="vc-cur">지금 회로</span>':''}</div>
      <p class="vc-d">${esc(v.desc)}</p>
      <div class="vc-m"><div><b>$${v.m.price}</b><span>BOM 참고가${v.m.unknown?` (미정 ${v.m.unknown})`:''}</span></div><div><b>${v.m.parts}</b><span>부품</span></div><div><b>${v.m.spare}</b><span>여유 MCU 핀</span></div><div><b>${v.m.loss} W</b><span>레귤레이터 손실</span></div></div>
      <div class="vc-s">${bar('가격',v.score.price)}${bar('기능',v.score.feat)}${bar('확장성',v.score.ext)}</div>
      <div class="vc-k">MCU ${esc((v.m.mcu||'-').replace(/-.*$/,''))} · 블록 ${v.plan.blocks.length}개${v.m.warn?` · 경고 ${v.m.warn}`:''}</div>
      <ul class="vc-diff">${v.diff.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
      <div class="acts"><button type="button" class="btn primary sm" data-pick="${v.key}">이 안으로 회로 생성</button><button type="button" class="btn sm" data-bom="${v.key}">BOM 보기</button></div></article>`;
  const html=`<div class="pg-wrap"><div class="pg-head"><div><b>2단계 · 회로 안 고르기</b><p class="lead">1단계 다이어그램을 세 가지 부품 구성으로 풀었습니다. 가격은 데이터시트 DB의 참고 단가(약 1k 수량, 추정)를 더한 값이고, 기능·확장성은 블록·헤더·여유 핀으로 셈한 상대 점수입니다. 고르면 부품·넷리스트·회로도를 만듭니다 (PCB는 3단계).</p></div>
      <div class="pg-w" role="group" aria-label="우선순위"><span>우선순위</span>${[['price','가격'],['bal','균형'],['feat','기능'],['ext','확장성']].map(([k,l])=>`<button type="button" class="pill vbtn${NP.vwk===k||(!NP.vwk&&k==='bal')?' on':''}" data-w="${k}">${l}</button>`).join('')}</div></div>
    <div class="vcards">${vs.map(card).join('')}</div>
    <div class="pg-foot"><button type="button" class="btn sm" data-back>← 1단계 다이어그램 수정</button>${BD&&!BD.blank&&BD.variant?'<button type="button" class="btn sm" data-keep>지금 회로 그대로 보기</button>':''}</div></div>`;
  if(!el){el=document.createElement('div');el.id='planGate';el.className='plan-gate';$('#vp').appendChild(el);
    el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.w){NP.vwk=b.dataset.w;NP.vw={price:{price:3,bal:1,feat:1,ext:1}[b.dataset.w],feat:{price:1,bal:1,feat:3,ext:1}[b.dataset.w],ext:{price:1,bal:1,feat:1,ext:3}[b.dataset.w]};planGatePaint();}
      else if(b.dataset.pick){if(NP.busy)return;npExec(`generate ${b.dataset.pick}`);}
      else if(b.dataset.bom){const v=npVariants().find(x=>x.key===b.dataset.bom);copSay('ok',`[${v.label}] BOM 약 $${v.m.price} (참고 단가)\n`+v.m.bom.items.map(i=>`  ${i.refs.join(',').padEnd(14)} ${(i.mpn||i.val).padEnd(22)} ×${i.refs.length}  $${i.unit}${i.est?'?':''} → $${i.sub.toFixed(2)}`).join('\n'));copFocus();}
      else if(b.hasAttribute('data-back'))setStep(1);
      else if(b.hasAttribute('data-keep')){NP.chooser=false;stepPaint();}});}
  el.innerHTML=html;}
/* ---------- step 1: requirement analysis with follow-up questions (AI or rules) ---------- */
const REQ_Q=[
  {key:'power',label:'전원',re:/\d+(\.\d+)?\s*v\b|배터리|battery|usb|vbat|전원|power|어댑터/i,q:'입력 전원은 무엇인가요?',why:'레귤레이터 단수·보호 회로·커넥터가 입력 전원으로 정해집니다.',opts:['12 V 차량 배터리','24 V 산업 전원','USB 5 V','5 V 어댑터']},
  {key:'mcu',label:'MCU',re:/stm32|aurix|tc3|tc364|cortex|\bmcu\b|마이크로|esp32|\bpic\b|avr|atmega/i,q:'MCU는 어떤 계열을 쓰나요?',why:'핀 수·주변장치·안전 기능이 달라 회로 안이 달라집니다.',opts:['STM32 (Cortex-M, 범용·저가)','AURIX TC364 (차량·기능 안전)','상관없음 — 추천해 주세요']},
  {key:'comm',label:'통신',re:/\bcan\b|can-?fd|\blin\b|uart|usb|i2c|i²c|spi|ethernet|이더넷|통신|\bble\b|wifi|무선|rs-?485/i,q:'외부와 어떤 통신을 하나요?',why:'트랜시버·커넥터·MCU 핀 배정에 필요합니다.',opts:['CAN','CAN-FD','UART (디버그·시리얼)','USB','통신 없음'],multi:true},
  {key:'func',label:'기능',re:/모터|motor|bldc|팬|\bfan\b|센서|sens|led|버튼|button|릴레이|relay|밸브|valve|측정|adc|전류|온도|홀|hall|솔레노이드|플래시|flash|로그/i,q:'보드가 하는 주요 기능은 무엇인가요?',why:'구동·센싱 블록과 전원 용량을 정합니다.',opts:['DC 모터 구동','BLDC 모터 구동 (홀 센서)','센서 측정 (전류·온도·전압)','LED·버튼 (표시·입력)','데이터 로그 (플래시)'],multi:true},
  {key:'env',label:'환경·안전',re:/asil|iso\s*26262|기능\s*안전|safety|산업|industrial|차량|automotive|\becu\b|실내|옥외|-40|온도\s*범위|\bqm\b/i,q:'사용 환경과 안전 등급은요?',why:'워치독·보호 회로·부품 등급이 달라집니다.',opts:['일반 (실내 · QM)','차량용 (ASIL A)','차량용 (ASIL B)','차량용 (ASIL C)','차량용 (ASIL D)','산업용 (-40~85 °C)','모름 — 일반으로']}];
const npIsReq=t=>REQ_Q.filter(f=>f.re.test(t)).length>=2||/요구|설계|만들|보드|노드|컨트롤러|ecu|모듈/i.test(t);
async function npAskAI(req){
  const prompt=`You are a hardware system architect. A user wrote this requirement for a new electronics board (Korean). Decide which ESSENTIAL facts are still missing before an HW block diagram can be drawn: input power (voltage/source), MCU family, external communication, main functions (actuation/sensing/UI/storage), environment & safety level, and anything the request makes necessary (e.g. motor rating, sensor type, bus speed). Ask ONLY about missing or ambiguous facts, at most 4 questions, each with 3-5 concrete answer options in Korean (short labels that include the key words a rules engine can read, e.g. "12 V 차량 배터리", "AURIX TC364", "CAN-FD", "BLDC 모터 구동 (홀 센서)", "ASIL B"). If nothing essential is missing return an empty list.
Return ONLY JSON: {"questions":[{"key":"power","label":"전원","q":"…?","why":"…","options":["…"],"multi":false}],"note":"one Korean line on what you understood"}
Requirement:\n${req}`;
  try{const r=await CLI.sample.json(prompt,{cache:false,modelTier:AIM.tier});AIM.calls++;AIM.inTok+=aimTok(prompt)+AIM_OVERHEAD;AIM.outTok+=aimTok(JSON.stringify(r));aimPaint();
    if(r&&r.note)copSay('ai',r.note);const qs=(r&&Array.isArray(r.questions)?r.questions:[]).slice(0,4).map(x=>({key:String(x.key||x.label||'q'),label:String(x.label||x.key||''),q:String(x.q||x.question||''),why:String(x.why||''),opts:(x.options||[]).map(String).slice(0,6),multi:!!x.multi})).filter(x=>x.q);return qs;}
  catch(e){console.error(e);return null;}}
/* part numbers Claude wrote into block labels/features become real implementations (impl <ID> part <MPN>) */
async function npBindParts(){const A=NP.arch;if(!A)return[];const SKIP=/^(ASIL|ISO|AEC|CAN|LIN|SPI|I2C|UART|USB|PWM|ADC|DAC|GPIO|RS485|RS232|IEEE|CORTEX|ARM|FD|FS|Q100|Q200|Q101|V\d+|\d+V\d*|M\d|R\d+|C\d+|U\d+|J\d+|HW|SW|RF|CRC|E2E|MCU|LED|LDO|DC|AC|TVS|ESD|EMC|EMI|MOSFET|FET|BLDC|BOM|PCB|HSIS|TP\d*)$/i;
  const out=[];for(const b of A.blocks){if(b.ext||(b.impl||[]).length)continue;const toks=[...new Set(((b.label+' '+(b.feats||[]).join(' ')).match(/\b[A-Za-z]{2,}[A-Za-z0-9]*\d{2,}[A-Za-z0-9\-\/.]*\b/g)||[]).filter(t=>!SKIP.test(t)&&!/^\d/.test(t)))];
    for(const t of toks){let rec=NEWPROJ.partLookup?NEWPROJ.partLookup(t):null;if(!(rec&&rec.pins&&rec.pins.length)&&AIM.mode==='ai'&&typeof plAskClaude==='function'){try{await cliAiProbe();if(CLI.sample){npSay('out',`${b.id} "${b.label}": 부품 번호 ${t} — Claude가 핀 배열을 찾는 중…`);rec=await plAskClaude(t,{hint:A.name,role:b.label});}}catch(e){npSay('err',`${t}: ${e.message||e}`);}}
      if(rec&&rec.pins&&rec.pins.length){b.impl=[{type:'part',params:{mpn:rec.mpn}}];out.push(`${b.id} ⇒ part ${rec.mpn}${rec.src==='ai'?' (Claude 추정)':''}`);break;}}}
  if(out.length){NP.planManual=false;archToPlan(true);npRender();}return out;}
async function npAnalyze(req,inner){
  if(NP.busy&&!inner)return;npBusy(true);NP.answers=NP.answers||{};const name=$('#npName').value.trim();
  try{
    if(AIM.mode==='ai'){await cliAiProbe();if(!CLI.sample)aimUnavailableNote(npSay);}
    copSay('out',`요구사항 분석 중… (${AIM.mode==='ai'&&CLI.sample?'AI':'규칙'})`);
    let qs=null;if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample)qs=await npAskAI(req);}
    if(!qs)qs=REQ_Q.filter(f=>!f.re.test(req)&&!NP.answers[f.key]).map(f=>({key:f.key,label:f.label,q:f.q,why:f.why,opts:f.opts,multi:!!f.multi}));
    qs=qs.filter(q=>!NP.answers[q.key]);
    if(qs.length){copSay('out',`블록 다이어그램을 그리기 전에 ${qs.length}가지를 확인합니다. 답을 고르거나 적어 주세요 (건너뛰면 기본값).`);
      for(const q of qs){const a=await copAsk(q);if(a==null)continue;NP.answers[q.key]={label:q.label||q.key,v:a};if(NP.stopReq)break;}}
    const add=Object.values(NP.answers).map(x=>`${x.label}: ${x.v}`).join(' · ');
    const base=req.replace(/\n보강:.*$/s,'');const full=add?base+'\n보강: '+add:base;$('#npReq').value=full;if(NP.plan)NP.plan.req=full;
    npPush();if(!NP.arch)NP.arch=HWARCH.blank(name||null);NP.arch.req=full;if(name)NP.arch.name=name;SYS.view='hw';
    if(AIM.mode==='ai'&&CLI.sample){await npAI(`${name?'프로젝트 이름: '+name+'. ':''}요구사항: ${full}. 이 요구사항으로 HW 블록 다이어그램(부품 미정)을 ${NP.arch.blocks.length?'다시 ':''}만들어줘.`);archToPlan();npRender();const bound=await npBindParts();if(bound.length)npSay('ok','블록에 적힌 부품 번호를 회로 구현으로 연결: '+bound.join(', '));}
    else{const o=await npRun('arch '+full);npSay('ok',o);}
    try{const lv=typeof SAFETY!=='undefined'?SAFETY.parseLevel(full):null;if(lv&&NP.arch&&NP.arch.blocks.length&&(!NP.arch.safety||NP.arch.safety.level==='QM')){const o=await npRun(`safety level ${lv}`);npSay('ok',o);if(lv!=='QM'){const M=SAFETY.mechanisms(NP.arch,lv).filter(m=>!m.present&&!m.sw);const SW=SAFETY.swMechanisms(NP.arch,lv).filter(m=>!m.present);if(M.length||SW.length){const a=await copAsk({q:`ASIL ${lv} 권장 안전 메커니즘 — HW 블록 ${M.length}개, SW 항목 ${SW.length}개가 아직 없습니다. 추가할까요?`,why:`HW: ${M.map(m=>m.label).join(' · ')||'없음'}\nSW(MCU 블록에 기록): ${SW.map(m=>m.label).join(' · ')||'없음'}`,opts:['HW + SW 모두 추가','HW 블록만','SW 항목만','나중에']});if(a&&/모두/.test(a)){npSay('ok',await npRun('safety apply all'));}else if(a==='HW 블록만'){npSay('ok',await npRun('safety apply '+M.map(m=>m.id).join(' ')));}else if(a==='SW 항목만'){npSay('ok',await npRun('safety apply sw'));}}}}}catch(e){console.warn(e);}
    copSay('out','다이어그램을 확인하고 블록·기능·인터페이스를 고친 뒤 [다음: 회로 생성]을 누르세요. 부품과 PCB는 다음 단계에서 정합니다.');
  }catch(e){console.error(e);npSay('err',e.message||String(e));}
  npBusy(false);}
/* Claude plans with the same commands */
const NP_SYS=`You are a hardware system architect working inside a design tool. The user writes in Korean. Step 1 is a HW ARCHITECTURE BLOCK DIAGRAM: functional blocks without part numbers (e.g. "Battery Input (12 V)", "PMIC / LDO / Buck", "CAN-FD Transceiver", "Main MCU", "H-Bridge / Gate Driver IC", "Current Sensing & Temp. Sensor", "Debug / Calib. Interface", "External Connector") grouped in bands power · comm · ctrl · io · ext, with labelled interfaces (rails such as VCC_MCU 3.3 V, buses such as CAN_H / CAN_L, control and feedback signals). Build it with arch / block / feat / link commands through the run_np tool, one command at a time. Use impl only to say which library circuit block will realise a block in step 2; never put part numbers in labels or features unless the user names them.
When you choose a specific part number for a block (e.g. CC2420 for an RF block, TJA1051 for CAN, BME280 for a sensor), bind it with: impl <ID> part <MPN> [--pins PIN=NET,…] — only then does the part appear in the parts view and in the step-2 circuit; a part number written only in the block label/feats is just text. Library blocks (ldo, buck, can, mcu …) stay the first choice when they fit.
Part-composition changes ("LDO를 벅으로", "LED 3개", "CAN 빼줘", "MCU를 TC364로"): change the HW block's implementation with impl <ID> <circuit block> [--param], or add/remove/set/mcu — these now keep the HW diagram and the circuit plan in sync; never re-create the whole architecture for a small change.
Functional safety: the architecture carries an ASIL level (safety level QM|A|B|C|D) and per-block levels (safety block <ID> <level>); when the requirement mentions ASIL/ISO 26262 set it, then run "safety" to see the recommended safety-mechanism blocks for that level and "safety apply all" (or specific ids) to add them; "safety ffi" lists interference boundaries between blocks of different ASIL.
Commands:
\${CMDS}
Blocks (type: label — description; params with defaults):
\${BLOCKS}
MCUs: \${MCUS}
Rules for the diagram: start from "arch <requirement>" when the diagram is empty or the user asks for a new one, then refine with block/feat/link/rename/del so it matches the request (safety: watchdog, ASIL; diagnostics; calibration such as XCP); every block that needs power gets a rail link or the regulator lists the rail; keep 4–12 blocks; finish with "diagram". Only touch the circuit plan (add/set/mcu) or run generate when the user asks for circuits. Rules for the plan (step 2): pick an input block (pwr_in with the right vin, or usb_in), regulators so every used rail exists (CAN needs +5V and +3V3, BLDC needs ≥8 V on VM, AURIX needs a crystal), one mcu, then the function blocks. Use "plan" to see rails, MCU pin assignment, BOM and warnings, and fix warnings (e.g. high LDO loss → lower input or add a 5 V stage). Pick a placement strategy (thermal for motor drivers, noise for CAN/mixed-signal). Only run "generate" if the user asked to create the circuit now; generate makes the circuit (parts, netlist, schematic = step 2) only — the PCB is placed and routed in step 3. PCB wishes given now (layer count such as "8층", "크기 최소화", exact size, routing on/off) are recorded with "board layers N", "board min", "board W H", "board route on|off" and applied when the PCB starts; use "generate --pcb" only when the user explicitly asks to go on to the PCB now. Parts outside the library cannot be added here — say which and suggest adding them later in the schematic console. At most 14 commands. Answer in Korean, 3-6 short lines: chosen parts and why, open warnings, next step.`;
async function npAI(req){
  if(!req.trim())return'요청을 적어 주세요.';
  const cmds=NP_HELP.filter(x=>!/^ai /.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const blocks=Object.entries(NEWPROJ.LIB).map(([k,v])=>`- ${k}: ${v.label} — ${v.desc}; params ${Object.entries(v.params).map(([p,d])=>`${p}=${d.def} (${d.desc})`).join(', ')||'none'}`).join('\n');
  const prompt=NP_SYS.replace('${CMDS}',cmds).replace('${BLOCKS}',blocks).replace('${MCUS}',Object.entries(NEWPROJ.MCUS).map(([k,v])=>k+' = '+v.label).join('; '))+
    `\n\n현재 HW 블록 다이어그램:\n${NP.arch?HWARCH.text(NP.arch):'(비어 있음)'}\n\n현재 회로 계획 (2단계):\n${NP.plan?NEWPROJ.summary(NP.plan).text.split('\n').slice(0,14).join('\n'):'(비어 있음)'}\n\n사용자 요청: ${req}`;
  const ok=await aiAgent({prompt,ro:c=>['help','?','status','blocks','mcus','view','diagram'].includes((cliTok(c)[0]||'').toLowerCase()),roList:'status, blocks, mcus, diagram',toolName:'run_np',toolDesc:'Run one new-design console command (add/set/remove/mcu/board/strategy/plan/generate) and return its text output.',example:'"add pwr_in --vin 12" or "plan"',
    run:c=>npRun(c,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();if(!NP_CMDS.has(f)||f==='ai')return'unknown command: '+f;if(f==='generate'&&/--pcb/.test(c)&&!/(보드|PCB|기판|배치|배선)[^.]{0,12}(생성|만들|그려|까지|시작|진행)/i.test(req))return'not allowed: generate --pcb (the user did not ask to start the PCB yet; record PCB wishes with board commands)';if(f==='generate'&&!/(회로|보드|PCB|기판)[^.]{0,10}(생성|만들|그려|까지)|generate/i.test(req))return'not allowed: generate (the user did not ask to create the board yet)';return'';},
    say:npSay,set:npSet,drop:e=>{copDrop(e);NP.log=NP.log.filter(x=>x!==e);},setAbort:c=>{NP.abort=c;},stopped:()=>NP.stopReq,max:16});
  if(!ok){npSay('out','Claude를 쓸 수 없어 규칙으로 HW 블록 다이어그램을 만듭니다.');return await npRun('arch '+req);}
  try{const bound=await npBindParts();if(bound.length)npSay('ok','블록에 적힌 부품 번호를 회로 구현으로 연결: '+bound.join(', '));}catch(e){console.warn(e);}
  return'';
}
// wiring
$('#openNew')?.addEventListener('click',npOpen);
$('#sysWs').addEventListener('click',e=>{
  const t=e.target.closest('[data-tpl]');if(t){const[,n,r]=NP_TPL[+t.dataset.tpl];$('#npName').value=n;$('#npReq').value=r;if(!r){NP.arch=HWARCH.blank(n);NP.plan=NEWPROJ.newPlan(n);NP.hist=[];SYS.view='hw';npRender();npSay('out','빈 프로젝트입니다. HW 블록을 추가하세요 (block power "Battery Input (12 V)" …).');}}
  const ar=e.target.closest('[data-adel]');if(ar&&!NP.busy)npExec('del '+ar.dataset.adel);
  const rm=e.target.closest('[data-rm]');if(rm&&!NP.busy)npExec('remove '+rm.dataset.rm);});
$('#npBlocks').addEventListener('change',e=>{const i=e.target.closest('[data-p]');if(!i)return;const id=e.target.closest('[data-b]').dataset.b;npExec(`set ${id} ${i.dataset.p} ${i.value.trim()}`);});
$('#npPlan').addEventListener('click',()=>{if(NP.busy)return;const req=$('#npReq').value.trim();if(!req){npSay('err','요구사항을 적어 주세요.');copFocus();return;}npAnalyze(req);});
$('#npAdd').addEventListener('click',()=>npExec('add '+$('#npAddSel').value));
$('#npName').addEventListener('change',()=>{const v=$('#npName').value.trim();if(NP.arch&&v)NP.arch.name=v;if(NP.plan){NP.plan.name=v||NP.plan.name;}npRender();});
$('#npGen').addEventListener('click',()=>{if(NP.busy)return;npExec('generate');});

/* ---------- step 1: HW architecture block diagram (HWARCH) · part-level view (SYSDIAG) ---------- */
var SYS={sel:null,src:null,D:null,view:'hw',A:null};
function archEnsure(){if(!NP.arch)NP.arch=HWARCH.blank($('#npName').value.trim()||(BD&&BD.name)||null);return NP.arch;}
// the circuit plan follows the architecture until the user edits the plan by hand
function archToPlan(force){if(!NP.arch)return;if(NP.planManual&&!force)return;const prev=NP.plan;const t=HWARCH.toPlan(NP.arch);NP.plan=t.plan;NP.planManual=false;if(prev){NP.plan.board=prev.board;if(prev.pcb)NP.plan.pcb=prev.pcb;if(prev.strategy&&prev.strategy!=='balanced')NP.plan.strategy=prev.strategy;}}
function sysArch(){if(NP.arch&&NP.arch.blocks.length)return NP.arch;if(BD&&!BD.blank){const D=SYSDIAG.fromBoard(BD);return HWARCH.fromDiagram(D);}return null;}
function sysDiagram(){
  if(SYS.src!=='board'&&NP.plan&&NP.plan.blocks.length){SYS.D=SYSDIAG.fromPlan(NP.plan);SYS.D.from='plan';}
  else if(BD){SYS.D=SYSDIAG.fromBoard(BD);SYS.D.from='board';}else SYS.D=null;
  return SYS.D;}
function sysRender(){if(typeof POPS!=='undefined'&&[...POPS].some(C=>C.kind==='sys'||C.kind==='parts'))popsRefresh();const host=$('#sysSvg');if(!host||HS.ws!=='sys')return;
  $$('[data-sv]').forEach(b=>b.setAttribute('aria-selected',b.dataset.sv===SYS.view?'true':'false'));
  if(SYS.view==='hw'){const A=sysArch();SYS.A=A;
    if(!A){host.innerHTML='<p class="lead" style="padding:20px">요구사항을 적고 [블록 다이어그램 만들기]를 누르세요.</p>';return;}
    if(SYS.sel&&!A.blocks.some(b=>b.id===SYS.sel))SYS.sel=null;host.innerHTML=HWARCH.svg(A,{sel:SYS.sel});
    $('#sysTitle').textContent=(A.name||'시스템')+' · HW 블록 다이어그램';
    $('#sysSrc').textContent=`${A.fromBoard&&!NP.arch?'보드에서 추출 (부품 번호 제외)':'아키텍처'} · 블록 ${A.blocks.length} · 인터페이스 ${A.links.length}`;}
  else{const D=sysDiagram();
    if(!D){host.innerHTML='<p class="lead" style="padding:20px">회로 계획이나 보드가 없습니다.</p>';return;}
    if(SYS.sel&&!D.nodes.some(n=>n.id===SYS.sel))SYS.sel=null;host.innerHTML=SYSDIAG.svg(D,{sel:SYS.sel});
    $('#sysTitle').textContent=(D.name||'시스템')+' · 부품 구성도';
    $('#sysSrc').textContent=D.from==='plan'?`회로 계획 · 블록 ${D.nodes.filter(n=>!n.ext).length} · 연결 ${D.edges.length}`:`보드 (${BD.name}) · 블록 ${D.nodes.filter(n=>!n.ext).length} · 연결 ${D.edges.length}`;}
  {const sv=host.firstElementChild;if(sv&&sv.viewBox){const W=sv.viewBox.baseVal.width;sv.style.width=(SYS.zoom==='1'?W:host.clientWidth-14)+'px';sv.style.minWidth='0';}const z=$('#sysZoom');if(z)z.textContent=SYS.zoom==='1'?'화면 맞춤':'100%';}
  host.querySelectorAll('[data-n]').forEach(g=>{const pick=()=>{SYS.sel=SYS.sel===g.dataset.n?null:g.dataset.n;sysRender();};g.addEventListener('click',pick);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});});
  sysSelPaint();archListPaint();}
function archListPaint(){const host=$('#arBlocks');if(!host)return;const A=NP.arch&&NP.arch.blocks.length?NP.arch:null;
  if(!A){host.innerHTML=`<p class="lead" style="margin:0">${BD&&SYS.A?'지금 다이어그램은 보드에서 추출한 것입니다. [보드에서 추출]을 누르면 편집할 수 있는 블록으로 가져옵니다.':'아직 블록이 없습니다.'}</p>`;return;}
  host.innerHTML=HWARCH.GROUPS.map(g=>{const bs=A.blocks.filter(b=>b.group===g[0]);if(!bs.length)return'';return`<div class="ar-g"><span>${esc(g[1])}</span>${bs.map(b=>`<div class="ar-b${SYS.sel===b.id?' on':''}" data-asel="${esc(b.id)}"><b>${esc(b.label)}</b><span class="mono">${esc(b.id)}</span><button type="button" class="linkbtn" data-adel="${esc(b.id)}" aria-label="${esc(b.label)} 삭제">삭제</button></div>`).join('')}</div>`;}).join('');
  host.querySelectorAll('[data-asel]').forEach(d=>d.addEventListener('click',e=>{if(e.target.closest('[data-adel]'))return;SYS.sel=d.dataset.asel;SYS.view='hw';sysRender();}));}
function sysSelPaint(){const box=$('#sysSel');if(!box)return;
  if(SYS.view==='hw'){const A=SYS.A;const b=A&&SYS.sel&&A.blocks.find(x=>x.id===SYS.sel);
    if(!b){box.innerHTML='<p class="lead" style="margin:0">블록을 누르면 기능·인터페이스·회로 구현을 여기서 고칩니다.</p>';return;}
    const editable=!!(NP.arch&&NP.arch.blocks.includes(b));const io=A.links.filter(l=>l.a===b.id||l.b===b.id);const N=id=>A.blocks.find(x=>x.id===id);
    box.innerHTML=`<div class="np-blk"><div class="np-bh"><b>${esc(b.label)}</b><span class="mono">${esc(b.id)}</span></div>
      ${editable?`<label class="fld"><span>이름</span><input data-ar="label" value="${esc(b.label)}"></label>
      <label class="fld"><span>그룹</span><select data-ar="group">${HWARCH.GROUPS.map(g=>`<option value="${g[0]}"${g[0]===b.group?' selected':''}>${esc(g[1])} · ${esc(g[2])}</option>`).join('')}</select></label>
      <label class="fld"><span>기능 (줄마다 하나)</span><textarea data-ar="feats" rows="3">${esc(b.feats.join('\n'))}</textarea></label>
      <label class="fld"><span>ASIL (시스템 ${typeof SAFETY!=='undefined'?SAFETY.level(A):'QM'})</span><select data-ar="asil"><option value="auto"${b.asil?'':' selected'}>상속 (${typeof SAFETY!=='undefined'?SAFETY.level(A):'QM'})</option>${['QM','A','B','C','D'].map(l=>`<option value="${l}"${b.asil===l?' selected':''}>ASIL ${l}</option>`).join('')}</select></label>`:`<div class="np-bd">${esc(b.feats.join(' · '))}${b.asil?' · ASIL '+esc(b.asil):''}</div>`}
      <ul class="sys-io">${io.map(l=>{const o=N(l.a===b.id?l.b:l.a);return`<li><span class="k-${l.kind==='bus'?'ext':l.kind}">${l.a===b.id?(l.both?'↔':'→'):(l.both?'↔':'←')}</span> ${esc(o?o.label:'')} <span class="mono">${esc(l.label)}</span></li>`;}).join('')}</ul>
      ${editable&&!b.ext?`<div class="np-bd" style="margin-top:6px">회로 구현 (2단계): <b>${(b.impl||[]).map(i=>esc(NEWPROJ.LIB[i.type]?NEWPROJ.LIB[i.type].label:i.type)).join(' + ')||'없음'}</b></div>
      <div class="np-add"><select data-ar="impl"><option value="">회로 블록 지정…</option>${Object.entries(NEWPROJ.LIB).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}<option value="none">구현 지우기</option></select></div>`:''}
      ${editable?'':'<p class="lead" style="margin:6px 0 0">보드에서 추출한 블록입니다. [보드에서 추출]로 가져오면 편집할 수 있습니다.</p>'}</div>`;
    box.querySelector('[data-ar="label"]')?.addEventListener('change',e=>npExec(`rename ${b.id} "${e.target.value.replace(/"/g,'')}"`));
    box.querySelector('[data-ar="group"]')?.addEventListener('change',e=>npExec(`move ${b.id} ${e.target.value}`));
    box.querySelector('[data-ar="asil"]')?.addEventListener('change',e=>npExec(`safety block ${b.id} ${e.target.value}`));
    box.querySelector('[data-ar="feats"]')?.addEventListener('change',e=>{npPush();b.feats=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);npRender();});
    box.querySelector('[data-ar="impl"]')?.addEventListener('change',e=>{if(e.target.value)npExec(`impl ${b.id} ${e.target.value}`);});
    return;}
  const D=SYS.D;const n=D&&SYS.sel&&D.nodes.find(x=>x.id===SYS.sel);
  if(!n){box.innerHTML='<p class="lead" style="margin:0">부품 구성도의 블록을 누르면 부품·전원·신호와 파라미터가 여기 나옵니다.</p>';return;}
  const N=id=>D.nodes.find(x=>x.id===id);const io=D.edges.filter(e=>e.a===n.id||e.b===n.id);const b=n.block;const L=b&&NEWPROJ.LIB[b.type];
  box.innerHTML=`<div class="np-blk"><div class="np-bh"><b>${esc(n.label)}</b><span class="mono">${esc(n.id)}</span>${b?`<button type="button" class="linkbtn" data-rm="${esc(b.id)}">삭제</button>`:''}</div>
    <div class="np-bd">${esc(n.sub||'')}${L?' — '+esc(L.desc):''}</div>
    ${L&&Object.keys(L.params).length?`<div class="np-ps" data-b="${esc(b.id)}">${Object.entries(L.params).map(([k,d])=>`<label title="${esc(d.desc)}">${k} <input data-p="${k}" value="${esc(b.params[k])}" size="${Math.max(3,String(b.params[k]).length+1)}"></label>`).join('')}</div>`:''}
    ${(n.prov||[]).length?`<div class="np-bd">출력 레일: ${esc(n.prov.join(', '))}</div>`:''}${(n.used||[]).length?`<div class="np-bd">사용 레일: ${esc(n.used.join(', '))}</div>`:''}
    <ul class="sys-io">${io.map(e=>{const o=N(e.a===n.id?e.b:e.a);return`<li><span class="k-${e.kind}">${e.a===n.id?(e.both?'↔':'→'):(e.both?'↔':'←')}</span> ${esc(o?o.label:'')} <span class="mono">${esc(e.label||'')}</span></li>`;}).join('')}</ul></div>`;
  box.querySelectorAll('[data-p]').forEach(i=>i.addEventListener('change',()=>npExec(`set ${b.id} ${i.dataset.p} ${i.value.trim()}`)));}
function sysEnter(){npInit();if(!(NP.plan&&NP.plan.blocks.length))SYS.src='board';else if(!SYS.src)SYS.src='plan';sysRender();npRender();}
$$('[data-sv]').forEach(b=>b.addEventListener('click',()=>{SYS.view=b.dataset.sv;SYS.sel=null;sysRender();}));
$('#sysZoom').addEventListener('click',()=>{SYS.zoom=SYS.zoom==='1'?'fit':'1';sysRender();});
window.addEventListener('resize',()=>{if(HS.ws==='sys')sysRender();});
$('#sysFromBoard').addEventListener('click',()=>{if(!BD){toast('불러온 보드가 없습니다.');return;}
  if(SYS.view==='hw'){npPush();NP.arch=HWARCH.fromDiagram(SYSDIAG.fromBoard(BD));NP.arch.fromBoard=true;NP.planManual=true;SYS.sel=null;npRender();npSay('ok',`보드 ${BD.name}에서 HW 블록 ${NP.arch.blocks.length}개를 가져왔습니다 (부품 번호 제외). 이제 편집할 수 있습니다.`);}
  else{SYS.src=SYS.src==='board'&&NP.plan&&NP.plan.blocks.length?'plan':'board';SYS.sel=null;sysRender();}});
$('#arAdd').addEventListener('click',()=>{const l=$('#arLabel').value.trim();if(!l){$('#arLabel').focus();return;}npExec(`block ${$('#arGroup').value} "${l.replace(/"/g,'')}"`);$('#arLabel').value='';});
$('#arGroup').innerHTML=HWARCH.GROUPS.map(g=>`<option value="${g[0]}">${g[1]}</option>`).join('');
$('#sysSvgDl').addEventListener('click',async()=>{const svgS=SYS.view==='hw'?(SYS.A&&HWARCH.svg(SYS.A)):(SYS.D&&SYSDIAG.svg(SYS.D));if(!svgS)return;const svg=svgS.replace('<svg ','<svg style="color:#1d2126;background:#fff;--surface:#fff;--raised:#fff" ');
  const nm=SYS.view==='hw'?SYS.A.name:SYS.D.name;const fn=await offerFile(String(nm||'system').replace(/[^\w\-]+/g,'_')+(SYS.view==='hw'?'_hw_block.svg':'_parts.svg'),new TextEncoder().encode(svg),'image/svg+xml');if(fn)toast('다이어그램을 SVG로 내려받았습니다.');});

/* ---------- design flow: 1 system diagram → 2 schematic → 3 PCB → 4 mechanical CAD ---------- */
function setStep(n){n=+n;
  if(n===1)setWorkspace('sys');
  else if(n===2){if((!BD||BD.blank)&&!(NP.chooser&&NP.plan&&NP.plan.blocks.length)){toast('먼저 1단계에서 요구사항으로 다이어그램을 만들고 [다음: 회로 생성]을 누르세요.');return;}setWorkspace('board');if(S.sch!=='full')setView('sch');}
  else if(n===3){if(!BD||BD.blank){toast('회로(2단계)를 먼저 생성하세요.');return;}setWorkspace('board');if(S.sch==='full')setView(S.view&&S.view!=='sch'?S.view:'3d');}
  else if(n===4){if(!BD||BD.blank){toast('회로(2단계)를 먼저 생성하세요.');return;}if(BD.pcbPending){toast('4단계 기구 설계는 PCB(3단계)를 배치한 뒤에 할 수 있습니다.');setStep(3);return;}setWorkspace('cad');}
  stepPaint();}
function stepCur(){const w=HS.ws;return w==='sys'?1:w==='cad'?4:w==='board'?(S.sch==='full'?2:3):0;}
function stepPaint(){const cur=stepCur();const real=!!(BD&&!BD.blank);const done={1:!!(NP.plan&&NP.plan.blocks.length)||real,2:real,3:!!(real&&BD.comps.length&&!BD.pcbPending),4:!!(real&&BD.housing&&BD.housing.R)};
  pcbGatePaint();planGatePaint();
  $$('[data-step]').forEach(b=>{const k=+b.dataset.step;const lock=k===4&&!!(BD&&BD.pcbPending)||k>2&&!real||k===2&&!real&&!(NP.chooser&&NP.plan&&NP.plan.blocks.length);b.classList.toggle('lock',lock);b.title=lock?(k===4?'PCB(3단계)를 먼저 설계하세요':'회로(2단계)를 먼저 생성하세요'):'';});
  $$('[data-step]').forEach(b=>{const k=+b.dataset.step;b.classList.toggle('on',k===cur);b.classList.toggle('done',k!==cur&&done[k]);if(k===cur)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  const hs=$('#ws-hsis');if(hs)hs.setAttribute('aria-selected',HS.ws==='hsis'?'true':'false');if(typeof copCtx==='function')copCtx();if(typeof modePaint==='function')modePaint();if(typeof nxStripPaint==='function')nxStripPaint();}
$$('[data-step]').forEach(b=>b.addEventListener('click',()=>setStep(b.dataset.step)));
