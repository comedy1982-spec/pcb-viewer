/* ---------- new design: project → blocks → board + schematic (NEWPROJ), deterministic or AI ---------- */
var NP={plan:null,hist:[],log:[],seq:0,busy:false,stopReq:false,abort:null,inHist:[],hi:-1};
const NP_TPL=[
  ['BLDC 팬 컨트롤러','BLDC 팬 컨트롤러 v0.1','12V 입력 BLDC 모터 컨트롤러, STM32, 홀 센서, CAN 통신, 상태 LED 2개, 버튼 1개, 전압 감시'],
  ['CAN 센서 노드','CAN 센서 노드 v0.1','12V 입력 CAN 센서 노드, STM32, I2C 센서 확장, UART 디버그, LED 1개'],
  ['USB DC 모터 보드','USB DC 모터 보드 v0.1','USB 전원 DC 모터 구동, 전류 감시, LED 2개, 버튼 1개'],
  ['AURIX CAN 게이트웨이','AURIX CAN 노드 v0.1','24V 입력 TC364 AURIX CAN 노드, UART 디버그, 데이터 로그용 플래시, LED 2개'],
  ['빈 프로젝트','새 프로젝트','']];
const NP_HELP=[
  ['help','명령 목록'],['plan · status','블록·전원 레일·MCU 핀 배정·BOM·경고'],['name <이름> · req <요구사항>','프로젝트 이름·요구사항'],
  ['auto','요구사항 문장을 규칙으로 블록 계획으로 바꿈 (결정론)'],['blocks · mcus','블록 라이브러리와 파라미터 · MCU 목록'],
  ['add <블록> [--파라미터 값]','블록 추가 (예: add led --n 3 --color 빨강, add ldo --vout 5, add pwr_in --vin 24)'],
  ['set <블록ID> <파라미터> <값> · remove <블록ID>','블록 수정·삭제 (ID는 plan에 표시)'],['mcu <stm32|tc364>','MCU 바꾸기'],
  ['board <가로> <세로> | board auto · strategy <balanced|thermal|noise|compact>','보드 크기 · 배치 전략'],
  ['generate [--route] [--view sch|pcb]','보드·회로도 생성 (자동 배치, --route면 이어서 자동 배선)'],
  ['undo · clear','계획 되돌리기 · 화면 지우기'],['ai <요청>','Claude가 위 명령으로 계획을 세우거나 고침']];
const NP_CMDS=new Set(['help','?','plan','status','name','req','auto','blocks','mcus','add','set','remove','mcu','board','strategy','generate','undo','clear','ai']);
function npSay(k,t){const e={k,t,id:++NP.seq};NP.log.push(e);if(NP.log.length>300)NP.log.shift();npPaint(e);return e;}
function npSet(e,t){e.t=t;npPaint(e,true);}
function npPaint(e,upd){const L=$('#npLog');if(!L)return;if(upd){const el=L.querySelector(`[data-id="${e.id}"]`);if(el){el.textContent=e.t;L.scrollTop=L.scrollHeight;return;}}
  const d=document.createElement('div');d.className='cl-'+e.k;d.dataset.id=e.id;d.textContent=(e.k==='cmd'?'› ':'')+e.t;L.appendChild(d);L.scrollTop=L.scrollHeight;}
function npPush(){NP.hist.push(JSON.stringify(NP.plan));if(NP.hist.length>60)NP.hist.shift();}
function npEnsure(){if(!NP.plan)NP.plan=NEWPROJ.newPlan($('#npName').value.trim()||'새 프로젝트');return NP.plan;}
function npOpen(){
  const M=$('#npModal');M.hidden=false;
  if(!M.dataset.init){M.dataset.init=1;$('#npMode').innerHTML=aimControls();aimBind($('#npMode'));cliAiProbe().then(aimPaint);
    $('#npTpl').innerHTML=NP_TPL.map(([l],i)=>`<button type="button" class="pill vbtn" data-tpl="${i}">${esc(l)}</button>`).join('');
    $('#npAddSel').innerHTML=Object.entries(NEWPROJ.LIB).map(([k,v])=>`<option value="${k}">${esc(v.label)} (${k})</option>`).join('');
    npSay('out','요구사항을 적고 [계획 세우기]를 누르세요. 결정론 모드는 정해진 규칙으로, AI 모드는 Claude가 블록·부품을 골라 계획을 세웁니다. 명령은 help.');}
  npRender();setTimeout(()=>$('#npReq').focus(),30);
}
function npClose(){if(NP.busy)return;$('#npModal').hidden=true;}
function npRender(){
  const P=NP.plan;$('#npPlanHint').textContent=AIM.mode==='ai'?'AI 모드: Claude가 계획 (보는 사람의 사용량)':'결정론: 낱말 규칙으로 계획';
  if(P){if(document.activeElement!==$('#npName'))$('#npName').value=P.name;if(document.activeElement!==$('#npReq')&&P.req)$('#npReq').value=P.req;$('#npStrat').value=P.strategy||'balanced';
    $('#npW').value=P.board?P.board.w:'';$('#npH').value=P.board?P.board.h:'';}
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
    case'name':{npPush();npEnsure().name=a._.join(' ')||'새 프로젝트';npRender();return'이름: '+NP.plan.name;}
    case'req':{npPush();npEnsure().req=a._.join(' ');npRender();return'요구사항을 저장했습니다.';}
    case'auto':{const req=a._.join(' ')||(NP.plan&&NP.plan.req)||$('#npReq').value.trim();if(!req)throw new Error('요구사항이 비어 있습니다 (req <문장> 또는 왼쪽 칸)');
      if(NP.plan)npPush();const r=NEWPROJ.planFrom(req,$('#npName').value.trim()||null);NP.plan=r.plan;npRender();return'규칙 해석: '+r.log.join(' · ')+'\n'+NEWPROJ.summary(NP.plan).text;}
    case'blocks':return Object.entries(NEWPROJ.LIB).map(([k,v])=>`${k.padEnd(8)} ${v.label} — ${v.desc}${Object.keys(v.params).length?'\n    '+Object.entries(v.params).map(([p,d])=>`--${p} (${d.def}) ${d.desc}`).join(' · '):''}`).join('\n');
    case'mcus':return Object.entries(NEWPROJ.MCUS).map(([k,v])=>`${k} — ${v.label}`).join('\n');
    case'add':{npPush();const params={};Object.keys(a).forEach(k=>{if(k!=='_')params[k]=a[k];});try{const b=NEWPROJ.addBlock(npEnsure(),a._[0],params);npRender();return`${b.id} 추가 · ${NEWPROJ.LIB[b.type].label} ${Object.entries(b.params).map(([k,v])=>`${k}=${v}`).join(' ')}`;}catch(e){NP.hist.pop();throw e;}}
    case'set':{npPush();try{NEWPROJ.setParam(npEnsure(),a._[0],a._[1],a._.slice(2).join(' '));}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]}.${a._[1]} = ${a._.slice(2).join(' ')}`;}
    case'remove':{npPush();try{NEWPROJ.removeBlock(npEnsure(),a._[0]);}catch(e){NP.hist.pop();throw e;}npRender();return`${a._[0]} 삭제`;}
    case'mcu':{const k=NEWPROJ.mcuKey(a._[0]);if(!k)throw new Error('MCU: '+Object.keys(NEWPROJ.MCUS).join(', '));npPush();const P=npEnsure();const b=P.blocks.find(x=>x.type==='mcu');if(b)b.params.part=k;else NEWPROJ.addBlock(P,'mcu',{part:k});npRender();return'MCU → '+k;}
    case'board':{npPush();const P=npEnsure();if(a._[0]==='auto'||!a._.length){P.board=null;}else{let w=+a._[0],h=+a._[1];if(!h&&/x|×/i.test(a._[0])){[w,h]=a._[0].split(/x|×/i).map(Number);}if(!(w>=20&&h>=20))throw new Error('board <가로> <세로> (mm, 20 이상) 또는 board auto');P.board={w,h};}npRender();return P.board?`보드 ${P.board.w} × ${P.board.h} mm`:'보드 크기 자동';}
    case'strategy':{const k=AUTOPLACE.strategy(a._[0]);if(!k)throw new Error('balanced · thermal · noise · compact');npPush();npEnsure().strategy=k;npRender();return'배치 전략 '+k;}
    case'generate':return await npGenerate({route:a.route!=null?a.route!=='0'&&a.route!=='false':$('#npRoute').checked,view:a.view||'sch',strategy:a.strategy,by});
    case'undo':{if(!NP.hist.length)return'되돌릴 것이 없습니다.';NP.plan=JSON.parse(NP.hist.pop());npRender();return'계획을 되돌렸습니다.';}
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
    else{npSay('out','문장을 요구사항으로 보고 규칙으로 계획합니다.');const o=await npRun('auto '+line);npSay('ok',o);}
  }catch(e){console.error(e);npSay('err',e.message||String(e));}
  npBusy(false);
}
// build the board from the plan and load it into the viewer
async function npGenerate(o){
  const P=npEnsure();if(!P.blocks.length)throw new Error('블록이 없습니다');const st=o.strategy?AUTOPLACE.strategy(o.strategy):P.strategy;
  const prog=npSay('out','보드를 만들고 부품을 배치하는 중…');await new Promise(r=>setTimeout(r,20));
  const{B,r}=NEWPROJ.toBoard(P,{strategy:st||'balanced',seed:1+Math.floor(Math.random()*1e5)});
  B.notes.push(`새 설계: ${P.blocks.length}개 블록에서 부품 ${r.parts.length}개를 만들고 ${st} 전략으로 배치했습니다.`);r.warn.forEach(w=>B.warnings.push(w));
  setBoard(B);if(typeof HS!=='undefined'&&HS.ws==='hsis')setWorkspace('board');
  const sheets=BD.schSheets||(schData()&&schData().sheets);const g=GUIDE.evaluate(BD,{scope:'sch',sheets});
  npSet(prog,`생성: 부품 ${B.comps.length}개 · 넷 ${Object.keys(B.nets).length}개 · 보드 ${f1(B.W)} × ${f1(B.H)} mm · 회로도 ${sheets?sheets.length:0}쪽 · 배치 ${st}${r.place&&r.place.fails.length?` (겹침 가능: ${r.place.fails.join(', ')})`:''}\n회로 가이드라인 ${g.pct.toFixed(0)}% · ${g.verdict}${g.rules.filter(x=>x.status==='fail'||x.status==='partial').slice(0,3).map(x=>`\n  ! ${x.title}: ${x.ev}`).join('')}${r.warn.length?'\n경고: '+r.warn.join(' / '):''}`);
  $('#npModal').hidden=true;
  if(o.route){setView('T');if(!PE.on)peBegin();cliToggle(true);await cliExec(`auto ${st} --tries 2`);}
  if(o.view==='pcb'||o.route){if(S.view!=='T')setView('T');}else setView('sch');
  toast(`${P.name}: 부품 ${B.comps.length}개로 회로도와 보드를 만들었습니다.${o.route?' 배선 결과는 CLI에 있습니다.':' TOP 보기에서 배치를 확인하세요.'}`);
  return'생성 완료 — 회로도는 회로도 보기, 배치·배선은 TOP 보기에서 확인합니다.';
}
/* Claude plans with the same commands */
const NP_SYS=`You design new electronics projects inside a PCB/schematic viewer. The user writes in Korean. You build a project plan out of library blocks by calling the run_np tool with one command at a time, then the viewer turns the plan into a schematic and a placed board.
Commands:
\${CMDS}
Blocks (type: label — description; params with defaults):
\${BLOCKS}
MCUs: \${MCUS}
Rules: start from the requirement; pick an input block (pwr_in with the right vin, or usb_in), regulators so every used rail exists (CAN needs +5V and +3V3, BLDC needs ≥8 V on VM, AURIX needs a crystal), one mcu, then the function blocks. Use "plan" to see rails, MCU pin assignment, BOM and warnings, and fix warnings (e.g. high LDO loss → lower input or add a 5 V stage). Pick a placement strategy (thermal for motor drivers, noise for CAN/mixed-signal). Only run "generate" if the user asked to create the board now. Parts outside the library cannot be added here — say which and suggest adding them later in the schematic console. At most 14 commands. Answer in Korean, 3-6 short lines: chosen parts and why, open warnings, next step.`;
async function npAI(req){
  if(!req.trim())return'요청을 적어 주세요.';
  const cmds=NP_HELP.filter(x=>!/^ai /.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const blocks=Object.entries(NEWPROJ.LIB).map(([k,v])=>`- ${k}: ${v.label} — ${v.desc}; params ${Object.entries(v.params).map(([p,d])=>`${p}=${d.def} (${d.desc})`).join(', ')||'none'}`).join('\n');
  const prompt=NP_SYS.replace('${CMDS}',cmds).replace('${BLOCKS}',blocks).replace('${MCUS}',Object.entries(NEWPROJ.MCUS).map(([k,v])=>k+' = '+v.label).join('; '))+
    `\n\n현재 계획:\n${NP.plan?NEWPROJ.summary(NP.plan).text:'(비어 있음)'}\n\n사용자 요청: ${req}`;
  const ok=await aiAgent({prompt,toolName:'run_np',toolDesc:'Run one new-design console command (add/set/remove/mcu/board/strategy/plan/generate) and return its text output.',example:'"add pwr_in --vin 12" or "plan"',
    run:c=>npRun(c,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();if(!NP_CMDS.has(f)||f==='ai')return'unknown command: '+f;if(f==='generate'&&!/생성|만들어|generate|보드\s*까지|그려/.test(req))return'not allowed: generate (the user did not ask to create the board yet)';return'';},
    say:npSay,set:npSet,drop:e=>{const el=$('#npLog')&&$('#npLog').querySelector(`[data-id="${e.id}"]`);if(el)el.remove();NP.log=NP.log.filter(x=>x!==e);},setAbort:c=>{NP.abort=c;},stopped:()=>NP.stopReq,max:16});
  if(!ok){npSay('out','Claude를 쓸 수 없어 규칙으로 계획합니다.');return await npRun('auto '+req);}
  return'';
}
// wiring
$('#openNew').addEventListener('click',npOpen);
$('#npModal').addEventListener('click',e=>{if(e.target.id==='npModal'||e.target.closest('[data-npclose]'))npClose();
  const t=e.target.closest('[data-tpl]');if(t){const[,n,r]=NP_TPL[+t.dataset.tpl];$('#npName').value=n;$('#npReq').value=r;if(!r){NP.plan=NEWPROJ.newPlan(n);NP.hist=[];npRender();npSay('out','빈 프로젝트입니다. 블록을 추가하세요 (add pwr_in --vin 12 …).');}}
  const rm=e.target.closest('[data-rm]');if(rm&&!NP.busy)npExec('remove '+rm.dataset.rm);});
$('#npModal').addEventListener('keydown',e=>{if(e.key==='Escape'){npClose();e.stopPropagation();}e.stopPropagation();});
$('#npBlocks').addEventListener('change',e=>{const i=e.target.closest('[data-p]');if(!i)return;const id=e.target.closest('[data-b]').dataset.b;npExec(`set ${id} ${i.dataset.p} ${i.value.trim()}`);});
$('#npPlan').addEventListener('click',async()=>{const req=$('#npReq').value.trim(),name=$('#npName').value.trim();if(!req){npSay('err','요구사항을 적어 주세요.');return;}
  if(AIM.mode==='ai'){npBusy(true);npSay('cmd',`계획 세우기 (AI): ${req}`);try{if(!NP.plan||!NP.plan.blocks.length){NP.plan=NEWPROJ.newPlan(name||null);NP.plan.req=req;}else{npPush();NP.plan.req=req;if(name)NP.plan.name=name;}
      await npAI(`${name?'프로젝트 이름: '+name+'. ':''}요구사항: ${req}. 이 요구사항으로 블록 계획을 처음부터 세워줘${NP.plan.blocks.length?' (지금 블록은 필요하면 지우고 다시)':''}.`);npRender();}catch(e){npSay('err',e.message||String(e));}npBusy(false);}
  else npExec(`auto ${req}`);});
$('#npAdd').addEventListener('click',()=>npExec('add '+$('#npAddSel').value));
$('#npName').addEventListener('change',()=>{if(NP.plan){NP.plan.name=$('#npName').value.trim()||NP.plan.name;npRender();}});
$('#npStrat').addEventListener('change',()=>{if(NP.plan){NP.plan.strategy=$('#npStrat').value;npRender();}});
['#npW','#npH'].forEach(id=>$(id).addEventListener('change',()=>{const w=+$('#npW').value,h=+$('#npH').value;npExec(w>=20&&h>=20?`board ${w} ${h}`:'board auto');}));
$('#npGen').addEventListener('click',()=>{if(NP.busy)return;npExec(`generate${$('#npRoute').checked?' --route':' --route 0'}`);});
$('#npForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#npIn').value.trim();if(!v||NP.busy)return;$('#npIn').value='';NP.inHist.push(v);NP.hi=NP.inHist.length;npExec(v);});
$('#npIn').addEventListener('keydown',e=>{const i=e.target;if(e.key==='ArrowUp'){if(NP.hi>0){NP.hi--;i.value=NP.inHist[NP.hi]||'';}e.preventDefault();}else if(e.key==='ArrowDown'){if(NP.hi<NP.inHist.length){NP.hi++;i.value=NP.inHist[NP.hi]||'';}e.preventDefault();}});
$('#npStop').addEventListener('click',()=>{NP.stopReq=true;if(NP.abort)NP.abort.abort();});
