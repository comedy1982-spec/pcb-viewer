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
  ['impl <ID> <회로블록|none> [--파라미터 값]','HW 블록을 구현할 회로 라이브러리 블록 (2단계 부품 선정용, 다이어그램에는 부품을 쓰지 않음)'],
  ['map · view hw|parts','아키텍처 → 회로 블록 대응 · 다이어그램 종류 (HW 블록 / 부품 구성)'],['plan · status','블록·전원 레일·MCU 핀 배정·BOM·경고'],['name <이름> · req <요구사항>','프로젝트 이름·요구사항'],
  ['auto','요구사항 문장을 규칙으로 블록 계획으로 바꿈 (결정론)'],['blocks · mcus','블록 라이브러리와 파라미터 · MCU 목록'],
  ['add <블록> [--파라미터 값]','블록 추가 (예: add led --n 3 --color 빨강, add ldo --vout 5, add pwr_in --vin 24)'],
  ['set <블록ID> <파라미터> <값> · remove <블록ID>','블록 수정·삭제 (ID는 plan에 표시)'],['mcu <stm32|tc364>','MCU 바꾸기'],
  ['board <가로> <세로> | board auto · strategy <balanced|thermal|noise|compact>','보드 크기 · 배치 전략'],
  ['diagram','시스템 다이어그램을 글로 (블록 · 전원 레일 · MCU 신호 · 외부 연결)'],
  ['generate [--route] [--view sch|pcb]','다이어그램의 블록으로 보드·회로도 생성 (자동 배치, --route면 이어서 자동 배선) → 2단계 회로'],
  ['undo · clear','계획 되돌리기 · 화면 지우기'],['ai <요청>','Claude가 위 명령으로 계획을 세우거나 고침']];
const NP_CMDS=new Set(['arch','block','feat','rename','move','link','unlink','del','impl','map','view','diagram','help','?','plan','status','name','req','auto','blocks','mcus','add','set','remove','mcu','board','strategy','generate','undo','clear','ai']);
function npSay(k,t){const e={k,t,id:++NP.seq};NP.log.push(e);if(NP.log.length>300)NP.log.shift();npPaint(e);return e;}
function npSet(e,t){e.t=t;npPaint(e,true);}
function npPaint(e,upd){const L=$('#npLog');if(!L)return;if(upd){const el=L.querySelector(`[data-id="${e.id}"]`);if(el){el.textContent=e.t;L.scrollTop=L.scrollHeight;return;}}
  const d=document.createElement('div');d.className='cl-'+e.k;d.dataset.id=e.id;d.textContent=(e.k==='cmd'?'› ':'')+e.t;L.appendChild(d);L.scrollTop=L.scrollHeight;}
function npPush(){NP.hist.push(JSON.stringify({plan:NP.plan,arch:NP.arch||null}));if(NP.hist.length>60)NP.hist.shift();}
function npEnsure(){if(!NP.plan)NP.plan=NEWPROJ.newPlan($('#npName').value.trim()||'새 프로젝트');return NP.plan;}
function npOpen(){setStep(1);}
function npInit(){
  const M=$('#sysWs');
  if(!M.dataset.init){M.dataset.init=1;$('#npMode').innerHTML=aimControls();aimBind($('#npMode'));cliAiProbe().then(aimPaint);
    $('#npTpl').innerHTML=NP_TPL.map(([l],i)=>`<button type="button" class="pill vbtn" data-tpl="${i}">${esc(l)}</button>`).join('');
    $('#npAddSel').innerHTML=Object.entries(NEWPROJ.LIB).map(([k,v])=>`<option value="${k}">${esc(v.label)} (${k})</option>`).join('');
    npSay('out','요구사항을 적고 [블록 다이어그램 만들기]를 누르세요. 1단계는 부품을 정하지 않은 HW 블록 다이어그램입니다. 결정론 모드는 정해진 규칙으로, AI 모드는 Claude가 블록·인터페이스를 설계합니다. 명령은 help.');}
  npRender();
}
function npRender(){
  const P=NP.plan;$('#npPlanHint').textContent=AIM.mode==='ai'?'AI: Claude가 블록·인터페이스를 설계 (보는 사람의 사용량)':'결정론: 낱말 규칙으로 블록 설계';
  if(P){if(document.activeElement!==$('#npName'))$('#npName').value=P.name;if(document.activeElement!==$('#npReq')&&P.req)$('#npReq').value=P.req;$('#npStrat').value=P.strategy||'balanced';
    $('#npW').value=P.board?P.board.w:'';$('#npH').value=P.board?P.board.h:'';}
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
function npBusy(b){NP.busy=b;['#npRun','#npGen','#npPlan','#npAdd'].forEach(id=>{const e=$(id);if(e)e.disabled=b;});$('#npStop').hidden=!b;$('#npIn').disabled=b;if(!b){NP.stopReq=false;NP.abort=null;}}
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
    case'impl':{npPush();const b=HWARCH.find(archEnsure(),a._[0]);const t=String(a._[1]||'').toLowerCase();if(t==='none'||t==='-'){b.impl=[];}else{const k=NEWPROJ.blockKey(t);if(!k)throw new Error('회로 블록: '+Object.keys(NEWPROJ.LIB).join(', ')+' · none');const params={};Object.keys(a).forEach(x=>{if(x!=='_')params[x]=a[x];});b.impl=(b.impl||[]).concat([{type:k,params}]);}archToPlan(true);npRender();return`${b.id} ⇒ ${(b.impl||[]).map(i=>i.type).join(' + ')||'(구현 없음)'}`;}
    case'map':{const A=archEnsure();const t=HWARCH.toPlan(A);return`${A.blocks.filter(b=>!b.ext).map(b=>`${b.id} ${b.label} ⇒ ${(b.impl||[]).map(i=>i.type).join(' + ')||'(없음 — 회로 단계에서 직접)'}`).join('\n')}${t.log.length?'\n'+t.log.join(' · '):''}\n\n${NEWPROJ.summary(t.plan).text.split('\n').slice(0,4).join('\n')}`;}
    case'view':{const v=/part|부품/.test(a._[0]||'')?'parts':'hw';SYS.view=v;sysRender();return v==='hw'?'HW 블록 다이어그램':'부품 구성도';}
    case'diagram':{const A=sysArch();if(SYS.view!=='parts'&&A)return HWARCH.text(A);const D=sysDiagram();return D?SYSDIAG.text(D):'다이어그램이 없습니다. 요구사항으로 계획을 세우거나 보드를 불러오세요.';}
    case'name':{npPush();npEnsure().name=a._.join(' ')||'새 프로젝트';npRender();return'이름: '+NP.plan.name;}
    case'req':{npPush();npEnsure().req=a._.join(' ');npRender();return'요구사항을 저장했습니다.';}
    case'auto':{const req=a._.join(' ')||(NP.plan&&NP.plan.req)||$('#npReq').value.trim();if(!req)throw new Error('요구사항이 비어 있습니다 (req <문장> 또는 왼쪽 칸)');
      if(NP.plan)npPush();const r=NEWPROJ.planFrom(req,$('#npName').value.trim()||null);NP.plan=r.plan;npRender();return'규칙 해석: '+r.log.join(' · ')+'\n'+NEWPROJ.summary(NP.plan).text;}
    case'blocks':return Object.entries(NEWPROJ.LIB).map(([k,v])=>`${k.padEnd(8)} ${v.label} — ${v.desc}${Object.keys(v.params).length?'\n    '+Object.entries(v.params).map(([p,d])=>`--${p} (${d.def}) ${d.desc}`).join(' · '):''}`).join('\n');
    case'mcus':return Object.entries(NEWPROJ.MCUS).map(([k,v])=>`${k} — ${v.label}`).join('\n');
    case'add':{npPush();NP.planManual=true;const params={};Object.keys(a).forEach(k=>{if(k!=='_')params[k]=a[k];});try{const b=NEWPROJ.addBlock(npEnsure(),a._[0],params);npRender();return`${b.id} 추가 · ${NEWPROJ.LIB[b.type].label} ${Object.entries(b.params).map(([k,v])=>`${k}=${v}`).join(' ')}`;}catch(e){NP.hist.pop();throw e;}}
    case'set':{npPush();NP.planManual=true;try{NEWPROJ.setParam(npEnsure(),a._[0],a._[1],a._.slice(2).join(' '));}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]}.${a._[1]} = ${a._.slice(2).join(' ')}`;}
    case'remove':{npPush();NP.planManual=true;try{NEWPROJ.removeBlock(npEnsure(),a._[0]);}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]} 삭제`;}
    case'mcu':{const k=NEWPROJ.mcuKey(a._[0]);if(!k)throw new Error('MCU: '+Object.keys(NEWPROJ.MCUS).join(', '));npPush();const P=npEnsure();const b=P.blocks.find(x=>x.type==='mcu');if(b)b.params.part=k;else NEWPROJ.addBlock(P,'mcu',{part:k});npRender();return'MCU → '+k;}
    case'board':{npPush();const P=npEnsure();if(a._[0]==='auto'||!a._.length){P.board=null;}else{let w=+a._[0],h=+a._[1];if(!h&&/x|×/i.test(a._[0])){[w,h]=a._[0].split(/x|×/i).map(Number);}if(!(w>=20&&h>=20))throw new Error('board <가로> <세로> (mm, 20 이상) 또는 board auto');P.board={w,h};}npRender();return P.board?`보드 ${P.board.w} × ${P.board.h} mm`:'보드 크기 자동';}
    case'strategy':{const k=AUTOPLACE.strategy(a._[0]);if(!k)throw new Error('balanced · thermal · noise · compact');npPush();npEnsure().strategy=k;npRender();return'배치 전략 '+k;}
    case'generate':return await npGenerate({route:a.route!=null?a.route!=='0'&&a.route!=='false':$('#npRoute').checked,view:a.view||'sch',strategy:a.strategy,by});
    case'undo':{if(!NP.hist.length)return'되돌릴 것이 없습니다.';const h=JSON.parse(NP.hist.pop());if(h&&'plan' in h){NP.plan=h.plan;NP.arch=h.arch;}else NP.plan=h;npRender();return'되돌렸습니다.';}
    case'clear':{$('#npLog').innerHTML='';NP.log=[];return'';}
    case'ai':return await npAI(t.slice(1).join(' '));
    default:throw new Error('알 수 없는 명령: '+cmd);
  }
}
async function npExec(line){
  npSay('cmd',line);npBusy(true);
  try{const f=(cliTok(line)[0]||'').toLowerCase();
    if(NP_CMDS.has(f)){const o=await npRun(line);if(o)npSay('ok',o);}
    else if(AIM.mode==='ai'&&(await cliAiProbe(),CLI.sample))await npAI(line);
    else{npSay('out','문장을 요구사항으로 보고 규칙으로 HW 블록 다이어그램을 만듭니다.');const o=await npRun('arch '+line);npSay('ok',o);}
  }catch(e){console.error(e);npSay('err',e.message||String(e));}
  npBusy(false);
}
// build the board from the plan and load it into the viewer
async function npGenerate(o){
  if(NP.arch&&!NP.planManual)archToPlan(true);const P=npEnsure();if(!P.blocks.length)throw new Error('회로로 구현할 블록이 없습니다 (HW 블록에 impl을 지정하세요)');
  if(NP.arch){const um=NP.arch.blocks.filter(b=>!b.ext&&!(b.impl||[]).length).map(b=>b.label);if(um.length)npSay('out',`회로 라이브러리에 대응 블록이 없는 HW 블록: ${um.join(', ')} — 회로 단계에서 회로 CLI(add)로 직접 추가하세요.`);}const st=o.strategy?AUTOPLACE.strategy(o.strategy):P.strategy;
  const prog=npSay('out','보드를 만들고 부품을 배치하는 중…');await new Promise(r=>setTimeout(r,20));
  const{B,r}=NEWPROJ.toBoard(P,{strategy:st||'balanced',seed:1+Math.floor(Math.random()*1e5)});
  B.notes.push(`새 설계: ${P.blocks.length}개 블록에서 부품 ${r.parts.length}개를 만들고 ${st} 전략으로 배치했습니다.`);r.warn.forEach(w=>B.warnings.push(w));
  setBoard(B);
  const sheets=BD.schSheets||(schData()&&schData().sheets);const g=GUIDE.evaluate(BD,{scope:'sch',sheets});
  npSet(prog,`생성: 부품 ${B.comps.length}개 · 넷 ${Object.keys(B.nets).length}개 · 보드 ${f1(B.W)} × ${f1(B.H)} mm · 회로도 ${sheets?sheets.length:0}쪽 · 배치 ${st}${r.place&&r.place.fails.length?` (겹침 가능: ${r.place.fails.join(', ')})`:''}\n회로 가이드라인 ${g.pct.toFixed(0)}% · ${g.verdict}${g.rules.filter(x=>x.status==='fail'||x.status==='partial').slice(0,3).map(x=>`\n  ! ${x.title}: ${x.ev}`).join('')}${r.warn.length?'\n경고: '+r.warn.join(' / '):''}`);
  SYS.src='plan';setStep(o.route||o.view==='pcb'?3:2);
  if(o.route){setView('T');if(!PE.on)peBegin();cliToggle(true);await cliExec(`auto ${st} --tries 2`);}
  if(o.view==='pcb'||o.route){if(S.view!=='T')setView('T');}else setView('sch');
  toast(`${P.name}: 부품 ${B.comps.length}개로 회로도와 보드를 만들었습니다.${o.route?' 배선 결과는 CLI에 있습니다.':' TOP 보기에서 배치를 확인하세요.'}`);
  return'생성 완료 — 회로도는 회로도 보기, 배치·배선은 TOP 보기에서 확인합니다.';
}
/* Claude plans with the same commands */
const NP_SYS=`You are a hardware system architect working inside a design tool. The user writes in Korean. Step 1 is a HW ARCHITECTURE BLOCK DIAGRAM: functional blocks without part numbers (e.g. "Battery Input (12 V)", "PMIC / LDO / Buck", "CAN-FD Transceiver", "Main MCU", "H-Bridge / Gate Driver IC", "Current Sensing & Temp. Sensor", "Debug / Calib. Interface", "External Connector") grouped in bands power · comm · ctrl · io · ext, with labelled interfaces (rails such as VCC_MCU 3.3 V, buses such as CAN_H / CAN_L, control and feedback signals). Build it with arch / block / feat / link commands through the run_np tool, one command at a time. Use impl only to say which library circuit block will realise a block in step 2; never put part numbers in labels or features unless the user names them.
Commands:
\${CMDS}
Blocks (type: label — description; params with defaults):
\${BLOCKS}
MCUs: \${MCUS}
Rules for the diagram: start from "arch <requirement>" when the diagram is empty or the user asks for a new one, then refine with block/feat/link/rename/del so it matches the request (safety: watchdog, ASIL; diagnostics; calibration such as XCP); every block that needs power gets a rail link or the regulator lists the rail; keep 4–12 blocks; finish with "diagram". Only touch the circuit plan (add/set/mcu) or run generate when the user asks for circuits. Rules for the plan (step 2): pick an input block (pwr_in with the right vin, or usb_in), regulators so every used rail exists (CAN needs +5V and +3V3, BLDC needs ≥8 V on VM, AURIX needs a crystal), one mcu, then the function blocks. Use "plan" to see rails, MCU pin assignment, BOM and warnings, and fix warnings (e.g. high LDO loss → lower input or add a 5 V stage). Pick a placement strategy (thermal for motor drivers, noise for CAN/mixed-signal). Only run "generate" if the user asked to create the board now. Parts outside the library cannot be added here — say which and suggest adding them later in the schematic console. At most 14 commands. Answer in Korean, 3-6 short lines: chosen parts and why, open warnings, next step.`;
async function npAI(req){
  if(!req.trim())return'요청을 적어 주세요.';
  const cmds=NP_HELP.filter(x=>!/^ai /.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const blocks=Object.entries(NEWPROJ.LIB).map(([k,v])=>`- ${k}: ${v.label} — ${v.desc}; params ${Object.entries(v.params).map(([p,d])=>`${p}=${d.def} (${d.desc})`).join(', ')||'none'}`).join('\n');
  const prompt=NP_SYS.replace('${CMDS}',cmds).replace('${BLOCKS}',blocks).replace('${MCUS}',Object.entries(NEWPROJ.MCUS).map(([k,v])=>k+' = '+v.label).join('; '))+
    `\n\n현재 HW 블록 다이어그램:\n${NP.arch?HWARCH.text(NP.arch):'(비어 있음)'}\n\n현재 회로 계획 (2단계):\n${NP.plan?NEWPROJ.summary(NP.plan).text.split('\n').slice(0,14).join('\n'):'(비어 있음)'}\n\n사용자 요청: ${req}`;
  const ok=await aiAgent({prompt,toolName:'run_np',toolDesc:'Run one new-design console command (add/set/remove/mcu/board/strategy/plan/generate) and return its text output.',example:'"add pwr_in --vin 12" or "plan"',
    run:c=>npRun(c,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();if(!NP_CMDS.has(f)||f==='ai')return'unknown command: '+f;if(f==='generate'&&!/(회로|보드|PCB|기판)[^.]{0,10}(생성|만들|그려|까지)|generate/i.test(req))return'not allowed: generate (the user did not ask to create the board yet)';return'';},
    say:npSay,set:npSet,drop:e=>{const el=$('#npLog')&&$('#npLog').querySelector(`[data-id="${e.id}"]`);if(el)el.remove();NP.log=NP.log.filter(x=>x!==e);},setAbort:c=>{NP.abort=c;},stopped:()=>NP.stopReq,max:16});
  if(!ok){npSay('out','Claude를 쓸 수 없어 규칙으로 HW 블록 다이어그램을 만듭니다.');return await npRun('arch '+req);}
  return'';
}
// wiring
$('#openNew')?.addEventListener('click',npOpen);
$('#sysWs').addEventListener('click',e=>{
  const t=e.target.closest('[data-tpl]');if(t){const[,n,r]=NP_TPL[+t.dataset.tpl];$('#npName').value=n;$('#npReq').value=r;if(!r){NP.arch=HWARCH.blank(n);NP.plan=NEWPROJ.newPlan(n);NP.hist=[];SYS.view='hw';npRender();npSay('out','빈 프로젝트입니다. HW 블록을 추가하세요 (block power "Battery Input (12 V)" …).');}}
  const ar=e.target.closest('[data-adel]');if(ar&&!NP.busy)npExec('del '+ar.dataset.adel);
  const rm=e.target.closest('[data-rm]');if(rm&&!NP.busy)npExec('remove '+rm.dataset.rm);});
$('#npBlocks').addEventListener('change',e=>{const i=e.target.closest('[data-p]');if(!i)return;const id=e.target.closest('[data-b]').dataset.b;npExec(`set ${id} ${i.dataset.p} ${i.value.trim()}`);});
$('#npPlan').addEventListener('click',async()=>{const req=$('#npReq').value.trim(),name=$('#npName').value.trim();if(!req){npSay('err','요구사항을 적어 주세요.');return;}
  if(AIM.mode==='ai'){npBusy(true);npSay('cmd',`HW 블록 다이어그램 (AI): ${req}`);try{npPush();if(!NP.arch){NP.arch=HWARCH.blank(name||null);}NP.arch.req=req;if(name)NP.arch.name=name;SYS.view='hw';
      await npAI(`${name?'프로젝트 이름: '+name+'. ':''}요구사항: ${req}. 이 요구사항으로 HW 블록 다이어그램(부품 미정)을 ${NP.arch.blocks.length?'다시 ':''}만들어줘.`);archToPlan();npRender();}catch(e){npSay('err',e.message||String(e));}npBusy(false);}
  else npExec(`arch ${req}`);});
$('#npAdd').addEventListener('click',()=>npExec('add '+$('#npAddSel').value));
$('#npName').addEventListener('change',()=>{const v=$('#npName').value.trim();if(NP.arch&&v)NP.arch.name=v;if(NP.plan){NP.plan.name=v||NP.plan.name;}npRender();});
$('#npStrat').addEventListener('change',()=>{if(NP.plan){NP.plan.strategy=$('#npStrat').value;npRender();}});
['#npW','#npH'].forEach(id=>$(id).addEventListener('change',()=>{const w=+$('#npW').value,h=+$('#npH').value;npExec(w>=20&&h>=20?`board ${w} ${h}`:'board auto');}));
$('#npGen').addEventListener('click',()=>{if(NP.busy)return;npExec(`generate${$('#npRoute').checked?' --route':' --route 0'}`);});
$('#npForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#npIn').value.trim();if(!v||NP.busy)return;$('#npIn').value='';NP.inHist.push(v);NP.hi=NP.inHist.length;npExec(v);});
$('#npIn').addEventListener('keydown',e=>{const i=e.target;if(e.key==='ArrowUp'){if(NP.hi>0){NP.hi--;i.value=NP.inHist[NP.hi]||'';}e.preventDefault();}else if(e.key==='ArrowDown'){if(NP.hi<NP.inHist.length){NP.hi++;i.value=NP.inHist[NP.hi]||'';}e.preventDefault();}});
$('#npStop').addEventListener('click',()=>{NP.stopReq=true;if(NP.abort)NP.abort.abort();});

/* ---------- step 1: HW architecture block diagram (HWARCH) · part-level view (SYSDIAG) ---------- */
var SYS={sel:null,src:null,D:null,view:'hw',A:null};
function archEnsure(){if(!NP.arch)NP.arch=HWARCH.blank($('#npName').value.trim()||(BD&&BD.name)||null);return NP.arch;}
// the circuit plan follows the architecture until the user edits the plan by hand
function archToPlan(force){if(!NP.arch)return;if(NP.planManual&&!force)return;const prev=NP.plan;const t=HWARCH.toPlan(NP.arch);NP.plan=t.plan;NP.planManual=false;if(prev){NP.plan.board=prev.board;if(prev.strategy&&prev.strategy!=='balanced')NP.plan.strategy=prev.strategy;}}
function sysArch(){if(NP.arch&&NP.arch.blocks.length)return NP.arch;if(BD){const D=SYSDIAG.fromBoard(BD);return HWARCH.fromDiagram(D);}return null;}
function sysDiagram(){
  if(SYS.src!=='board'&&NP.plan&&NP.plan.blocks.length){SYS.D=SYSDIAG.fromPlan(NP.plan);SYS.D.from='plan';}
  else if(BD){SYS.D=SYSDIAG.fromBoard(BD);SYS.D.from='board';}else SYS.D=null;
  return SYS.D;}
function sysRender(){const host=$('#sysSvg');if(!host||HS.ws!=='sys')return;
  document.querySelectorAll('[data-sv]').forEach(b=>b.setAttribute('aria-selected',b.dataset.sv===SYS.view?'true':'false'));
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
      <label class="fld"><span>기능 (줄마다 하나)</span><textarea data-ar="feats" rows="3">${esc(b.feats.join('\n'))}</textarea></label>`:`<div class="np-bd">${esc(b.feats.join(' · '))}</div>`}
      <ul class="sys-io">${io.map(l=>{const o=N(l.a===b.id?l.b:l.a);return`<li><span class="k-${l.kind==='bus'?'ext':l.kind}">${l.a===b.id?(l.both?'↔':'→'):(l.both?'↔':'←')}</span> ${esc(o?o.label:'')} <span class="mono">${esc(l.label)}</span></li>`;}).join('')}</ul>
      ${editable&&!b.ext?`<div class="np-bd" style="margin-top:6px">회로 구현 (2단계): <b>${(b.impl||[]).map(i=>esc(NEWPROJ.LIB[i.type]?NEWPROJ.LIB[i.type].label:i.type)).join(' + ')||'없음'}</b></div>
      <div class="np-add"><select data-ar="impl"><option value="">회로 블록 지정…</option>${Object.entries(NEWPROJ.LIB).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}<option value="none">구현 지우기</option></select></div>`:''}
      ${editable?'':'<p class="lead" style="margin:6px 0 0">보드에서 추출한 블록입니다. [보드에서 추출]로 가져오면 편집할 수 있습니다.</p>'}</div>`;
    box.querySelector('[data-ar="label"]')?.addEventListener('change',e=>npExec(`rename ${b.id} "${e.target.value.replace(/"/g,'')}"`));
    box.querySelector('[data-ar="group"]')?.addEventListener('change',e=>npExec(`move ${b.id} ${e.target.value}`));
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
document.querySelectorAll('[data-sv]').forEach(b=>b.addEventListener('click',()=>{SYS.view=b.dataset.sv;SYS.sel=null;sysRender();}));
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
  else if(n===2){if(!BD){toast('먼저 1단계에서 회로를 생성하거나 보드를 불러오세요.');return;}setWorkspace('board');if(S.sch!=='full')setView('sch');}
  else if(n===3){if(!BD){toast('보드가 없습니다.');return;}setWorkspace('board');if(S.sch==='full')setView(S.view&&S.view!=='sch'?S.view:'3d');}
  else if(n===4){if(!BD){toast('보드가 없습니다.');return;}setWorkspace('cad');}
  stepPaint();}
function stepCur(){const w=HS.ws;return w==='sys'?1:w==='cad'?4:w==='board'?(S.sch==='full'?2:3):0;}
function stepPaint(){const cur=stepCur();const done={1:!!(NP.plan&&NP.plan.blocks.length)||!!BD,2:!!BD,3:!!(BD&&BD.comps.length),4:!!(BD&&BD.housing&&BD.housing.R)};
  document.querySelectorAll('[data-step]').forEach(b=>{const k=+b.dataset.step;b.classList.toggle('on',k===cur);b.classList.toggle('done',k!==cur&&done[k]);if(k===cur)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  const hs=$('#ws-hsis');if(hs)hs.setAttribute('aria-selected',HS.ws==='hsis'?'true':'false');}
document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>setStep(b.dataset.step)));
