/* HW architecture block diagram (step 1): functional blocks only — no part numbers — grouped in bands
   (power supply → communication → microcontroller → actuation / sensing / diagnostics → external connector),
   with the interfaces between them (rails, buses, control and feedback signals) labelled on the arrows.
   archFrom(text) reads a requirement with fixed rules; the console / Claude edit it with block · link · feat · impl.
   Each block can name the circuit blocks that implement it (impl → NEWPROJ library), so step 2 turns the
   architecture into real parts: toPlan(arch). */
const HWARCH=(function(){
"use strict";
const GROUPS=[['power','전원','Power Supply Block'],['comm','통신','Communication Block'],['ctrl','제어','Microcontroller Unit'],['io','구동 · 센싱 · 진단','Actuation · Sensing · Diag.'],['ext','외부 연결','External Interface']];
const GK=Object.fromEntries(GROUPS.map(g=>[g[0],g]));
const gAlias=s=>{s=String(s||'').toLowerCase();if(GK[s])return s;if(/전원|power|pwr|psu/.test(s))return'power';if(/통신|comm|bus|can|lin|eth/.test(s))return'comm';if(/제어|mcu|ctrl|control|micro/.test(s))return'ctrl';if(/외부|ext|conn|커넥터/.test(s))return'ext';if(/구동|센|진단|io|act|sens|diag|drv/.test(s))return'io';return null;};
const KINDS=['power','signal','bus','safe'];
const ASIL_HUE={QM:null,A:'#4f8ff7',B:'#2fbf7a',C:'#e6a93a',D:'#d9534f'};
function blank(name){return{name:name||'새 프로젝트',req:'',blocks:[],links:[],seq:0,safety:{level:'QM',goals:[]}};}
function uid(A,base){base=String(base||'blk').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,16)||'blk';let id=base,k=1;while(A.blocks.some(b=>b.id===id))id=base+(++k);return id;}
function addBlock(A,group,label,o){o=o||{};const g=gAlias(group);if(!g)throw new Error('그룹: '+GROUPS.map(x=>x[0]).join(' · '));if(!label)throw new Error('블록 이름이 필요합니다');
  const b={id:o.id&&!A.blocks.some(x=>x.id===o.id)?o.id:uid(A,o.id||label),group:g,label:String(label).slice(0,40),feats:(o.feats||[]).filter(Boolean).map(String),impl:o.impl||[],ext:!!o.ext,rails:o.rails||[]};if(o.asil)b.asil=String(o.asil).toUpperCase();A.blocks.push(b);return b;}
function find(A,id){const b=A.blocks.find(x=>x.id===id)||A.blocks.find(x=>x.id.toLowerCase()===String(id).toLowerCase());if(!b)throw new Error(`블록 ${id}가 없습니다 — diagram으로 ID를 보세요`);return b;}
function link(A,a,b,label,o){o=o||{};const x=find(A,a),y=find(A,b);const kind=KINDS.includes(o.kind)?o.kind:/safe|세이프|reset|nreset|fs0b|wdi|차단/i.test(label||'')?'safe':/v\b|vcc|vdd|vbat|전원|\d\s*v/i.test(label||'')?'power':/can|lin|eth|bus|버스/i.test(label||'')&&(x.ext||y.ext)?'bus':'signal';
  A.links=A.links.filter(l=>!(l.a===x.id&&l.b===y.id));const l={a:x.id,b:y.id,label:String(label||'').slice(0,40),kind,both:!!o.both};A.links.push(l);return l;}
function unlink(A,a,b){const n=A.links.length;A.links=A.links.filter(l=>!((l.a===a&&l.b===b)||(l.a===b&&l.b===a)));return n-A.links.length;}
function remove(A,id){const b=find(A,id);A.blocks=A.blocks.filter(x=>x!==b);A.links=A.links.filter(l=>l.a!==b.id&&l.b!==b.id);return b;}

/* ---- requirement → architecture (deterministic rules) ---- */
function archFrom(text,name){
  const s=String(text||''),lo=s.toLowerCase();const A=blank(name||(typeof NEWPROJ!=='undefined'?NEWPROJ.guessName(s):null));A.req=s;const log=[];
  const usb=/usb/.test(lo)&&!/usb\s*없/.test(lo);let vin=null;const m=s.match(/(\d+(?:\.\d+)?)\s*V(?![a-z])/i);if(m)vin=+m[1];
  const bldc=/bldc|3상|브러시리스|brushless|인버터/.test(lo),dc=!bldc&&/(dc|브러시|직류)\s*모터|모터\s*(구동|제어)|h-?bridge|h\s*브리지|액추에이터|actuator|lsd|팬|fan|솔레노이드|밸브/.test(lo),motor=bldc||dc;
  const can=/\bcan\b|can-?fd|캔\s*통신/.test(lo),canfd=/can-?fd/.test(lo),lin=/\blin\b/.test(lo),eth=/ethernet|이더넷|100base|1000base/.test(lo);
  const tc=/tc3|aurix|오릭스|tc364|tricore/.test(lo),stm=/stm32|cortex-?m/.test(lo);
  const ecu=/ecu|차량|automotive|자동차|asil|iso\s*26262|기능\s*안전|safety/.test(lo)||tc;const asil=(s.match(/ASIL\s*([A-D])/i)||[])[1];
  const flash=/플래시|flash|메모리|로그|저장/.test(lo),dbg=/uart|jtag|디버그|debug|xcp|calib|캘리브/.test(lo)||ecu,xcp=/xcp/.test(lo)||ecu&&can;
  const curr=/전류|current|shunt|션트/.test(lo)||motor,temp=/온도|temp|ntc/.test(lo)||motor,hall=/홀|hall|엔코더|encoder|위치|position|resolver|리졸버/.test(lo)||bldc&&!/센서리스|sensorless/.test(lo);
  const nl=s.match(/LED\s*(\d+)\s*개|(\d+)\s*개의?\s*LED/i);const nled=nl?+(nl[1]||nl[2]):/led|표시등/i.test(s)?1:0;const nb=s.match(/버튼\s*(\d+)\s*개|(\d+)\s*개의?\s*버튼/);const nbt=nb?+(nb[1]||nb[2]):/버튼|button/.test(lo)?1:0;
  if(!vin)vin=motor||can||ecu?12:usb?5:5;const batt=/배터리|battery|vbat|차량|ecu/.test(lo)||vin>=12;
  const need5=can||motor||curr;
  // power
  addBlock(A,'power',usb&&vin<=5.5?'USB-C 5 V 입력':batt?`Battery Input (${vin} V)`:`DC Input (${vin} V)`,{id:'pin',feats:usb&&vin<=5.5?['VBUS 5 V','ESD 보호']:['역전압 보호 (Reverse Polarity)','서지 보호 (Surge / TVS)'],impl:[usb&&vin<=5.5?{type:'usb_in',params:{data:1}}:{type:'pwr_in',params:{vin}}]});
  const rails=[{name:'VCC_MCU',v:3.3}];if(need5)rails.unshift({name:need5&&can?'VCC_5V':'VCC_SENS',v:5});if(curr||hall)rails.some(r=>r.name==='VCC_SENS')||rails.push({name:'VCC_SENS',v:5});if(motor)rails.push({name:'VCC_DRV',v:vin});
  const implReg=vin>5.5&&need5?[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}}]:[{type:'ldo',params:{vout:3.3}}];
  addBlock(A,'power',ecu?'PMIC / LDO / Buck':'Voltage Regulators (LDO / Buck)',{id:'reg',feats:[ecu?'전압 레귤레이터 (Voltage Regulators)':'전압 변환',...rails.map(r=>`${r.name} ${r.v} V`)].slice(0,4),rails,impl:implReg});
  if(ecu||asil){const w=addBlock(A,'power','Watchdog / Reset',{id:'wdg',feats:['외부 워치독 (Window WDT)','리셋 감시 (Reset Supervisor)']});w.impl=[{type:'supervisor',params:{}}];w.safety='wdt_ext';}
  link(A,'pin','reg',batt?`VBAT ${vin} V`:`${vin} V`,{kind:'power'});
  // communication
  if(can){addBlock(A,'comm',`${canfd?'CAN-FD':'CAN'} Bus (H / L)`,{id:'canbus',ext:true,feats:['차량 네트워크']});addBlock(A,'comm',`${canfd?'CAN-FD':'CAN'} Transceiver`,{id:'canx',feats:['물리 계층 (5 V)','스플릿 종단 · ESD'],impl:[{type:'can',params:{}}]});link(A,'canbus','canx','CAN_H / CAN_L',{kind:'bus',both:true});}
  if(lin){addBlock(A,'comm','LIN Transceiver',{id:'linx',feats:['LIN 2.x 물리 계층']});}
  if(eth){addBlock(A,'comm','Ethernet PHY',{id:'phy',feats:['100BASE-T1']});}
  // MCU
  const core=tc?'AURIX TC3xx (TriCore)':stm?'Cortex-M (STM32)':ecu?'AURIX / Cortex-R/M':'Cortex-M';
  addBlock(A,'ctrl','Main MCU',{id:'mcu',feats:[`Core: ${core}`,'ADC (Analog-to-Digital)',motor?'PWM Output / Timer Modules':'GPIO / Timer',ecu?`Watchdog & Safety${asil?` (ASIL ${asil.toUpperCase()})`:' (ASIL B/D Support)'}`:'Watchdog'],
    impl:[{type:'mcu',params:{part:tc?'TC364DP-64F300F':'STM32F042K6U6'}},...(tc||can?[{type:'xtal',params:{}}]:[])]});
  link(A,'reg','mcu','VCC_MCU 3.3 V',{kind:'power'});
  if(A.blocks.some(b=>b.id==='wdg'))link(A,'wdg','mcu','WDI / nRESET',{kind:'safe',both:true});
  if(can){link(A,'canx','mcu','TXD / RXD',{kind:'signal',both:true});link(A,'reg','canx','VCC_5V',{kind:'power'});}
  if(lin)link(A,'linx','mcu','UART (LIN)',{both:true});if(eth)link(A,'phy','mcu','RMII',{both:true});
  // actuation / sensing / diagnostics
  const nm=(()=>{const m=lo.match(/(?:bldc|모터|motor|액추에이터)[^.\n]{0,16}?(\d+)\s*(?:개|대|축|ea)/)||lo.match(/(\d+)\s*(?:개|대|축)\s*(?:의\s*)?(?:bldc|모터|motor)/)||lo.match(/(?:듀얼|dual|2축|two)\s*(?:bldc|모터|motor)/);return m?(m[1]?Math.max(1,Math.min(8,+m[1])):2):1;})();
  for(let i=1;i<=(motor?nm:0);i++){const id=i===1?'drv':'drv'+i,sfx=nm>1?` #${i}`:'';
    const kind=motorKind(lo,bldc);
    if(kind.type==='gdrv3')addBlock(A,'io','3-Phase Gate Driver + MOSFET Inverter'+sfx,{id,feats:[`외부 N-MOSFET ×6${kind.par>1?' (병렬 '+kind.par+')':''} · 상전류 ${kind.i} A`,'게이트 드라이버 ×3 · 부트스트랩','레그 션트 ×3 + 전류 앰프'],impl:[{type:'gdrv3',params:{i:kind.i,hall:hall?1:0}}]});
    else if(kind.type==='bldc')addBlock(A,'io','3-Phase Inverter / Gate Driver'+sfx,{id,feats:['FET 내장 3상 드라이버 (≤ 2.5 A)','PWM ×3 · 상 전류'],impl:[{type:'bldc',params:{hall:hall?1:0}}]});
    else if(kind.type==='hbridge')addBlock(A,'io','H-Bridge Gate Driver + MOSFET ×4'+sfx,{id,feats:[`외부 N-MOSFET ×4${kind.par>1?' (병렬 '+kind.par+')':''} · ${kind.i} A`,'게이트 드라이버 ×2 · 부트스트랩 · 정/역회전','공통 션트 + 전류 앰프'],impl:[{type:'hbridge',params:{i:kind.i}}]});
    else addBlock(A,'io','Low-side MOSFET Switch'+sfx,{id,feats:['단방향 · 로우사이드 FET 1개 (≤ 3 A)','과전류 검출 션트'],impl:[{type:'dcmotor',params:{shunt:1}}]});
    link(A,'mcu',id,`Control (PWM / EN)${sfx}`,{kind:'signal'});link(A,'reg',id,`VCC_DRV ${vin} V`,{kind:'power'});}
  if(curr||temp||hall){addBlock(A,'io',`${curr?'Current Sensing':''}${curr&&(temp||hall)?' & ':''}${temp?'Temp. Sensor':''}${!curr&&!temp&&hall?'Position Sensor':''}`,{id:'sense',feats:[curr?'전류 센싱 (Shunt + Amp)':null,temp?'온도 센서 (NTC)':null,hall?'홀 / 위치 센서':null,'HW Diagnostics'].filter(Boolean),impl:[{type:'vmon',params:{}}]});
    link(A,'sense','mcu','Analog Feedback (ADC)',{kind:'signal'});if(A.blocks.some(b=>b.id==='reg'))link(A,'reg','sense','VCC_SENS 5 V',{kind:'power'});}
  if(flash){addBlock(A,'io','External Flash',{id:'mem',feats:['데이터 로그 · 설정 저장'],impl:[{type:'flash',params:{}}]});link(A,'mcu','mem','SPI',{both:true});}
  if(dbg){addBlock(A,'io','Debug / Calib. Interface',{id:'dbg',feats:[tc?'JTAG / DAP':'SWD / JTAG','UART',xcp?'XCP over CAN':null].filter(Boolean),impl:/uart|시리얼|디버그\s*포트|콘솔/.test(lo)||ecu?[{type:'uart',params:{}}]:[]});link(A,'mcu','dbg','Diagnostic / Debug',{both:true});link(A,'reg','dbg','VCC_MCU 3.3 V',{kind:'power'});}
  if(nled||nbt){addBlock(A,'io','HMI (LED / Button)',{id:'hmi',feats:[nled?`LED ×${nled}`:null,nbt?`Button ×${nbt}`:null].filter(Boolean),impl:[...(nled?[{type:'led',params:{n:nled}}]:[]),...(nbt?[{type:'button',params:{n:nbt}}]:[])]});link(A,'mcu','hmi','GPIO',{});}
  // external connector
  if(motor||curr||hall){addBlock(A,'ext','External Connector',{id:'conn',ext:true,feats:[`To Electric ${bldc?'BLDC ':dc?'DC ':''}Motor & Sensors`]});
    if(motor)A.blocks.filter(b=>/^drv\d*$/.test(b.id)).forEach(b=>link(A,b.id,'conn',`High-Current PWM / Power${nm>1?' '+b.id.replace('drv','#').replace(/^#$/,'#1'):''}`,{kind:'power'}));if(hall||curr)link(A,'conn','sense','Sensor Signals',{});}
  log.push(`블록 ${A.blocks.length}개 · 연결 ${A.links.length}개 (${[batt?`배터리 ${vin} V`:`${vin} V`,can?(canfd?'CAN-FD':'CAN'):null,bldc?`BLDC${nm>1?' ×'+nm:''}`:dc?`DC 모터${nm>1?' ×'+nm:''}`:null,ecu?'ECU/안전':null].filter(Boolean).join(' · ')})`);
  return{arch:A,log};}

/* ---- a finished board → architecture: the part-level diagram (SYSDIAG.fromBoard) with the part numbers taken out ---- */
function fromDiagram(D){
  const A=blank(D.name);A.req='';const idmap={};
  const generic=n=>{const t=((n.label||'')+' '+(n.sub||'')).toLowerCase();
    if(n.type==='mcu')return['ctrl','Main MCU',['Core / ADC / PWM / Timer']];
    if(n.type==='reg'){const out=(n.prov||[])[0];return['power',`Voltage Regulator${out?` (${out})`:''}`,out?[`출력 ${out}`]:[]];}
    if(n.type==='xtal')return null;
    if(n.ext){if(n.col===0)return['power',`Power Input${(n.nets||[]).length?` (${(n.nets||[]).join(', ')})`:''}`,['외부 전원']];return['ext',/can/.test(t)&&!/모터|motor/.test(t)?'CAN Bus Connector':/debug|디버그|uart|swd|dap|jtag/.test(t)?'Debug Connector':'External Connector',[]];}
    if(/can|lin|트랜시버|transceiver/.test(t))return['comm',/lin/.test(t)?'LIN Transceiver':'CAN Transceiver',['물리 계층']];
    if(n.type==='driver'||/모터|motor|브리지|bridge|inverter|하프브리지|gate/.test(t))return['io',/3상|3-phase|bldc|inverter/.test(t)?'3-Phase Motor Driver':'Motor / Load Driver',['MOSFET Control']];
    if(/flash|플래시|eeprom|memory|메모리/.test(t))return['io','External Memory',['SPI']];
    if(/sens|센서|전류|current|temp|온도/.test(t))return['io','Sensor Interface',[]];
    return['io',String(n.label||'Function').replace(/\b(TI|Infineon|ST|NXP|Renesas|Microchip|Winbond|TLE\w+|DRV\w+|W25\w+|AMS\w+)\b/g,'').trim().slice(0,30)||'Function',[]];};
  D.nodes.forEach(n=>{const g=generic(n);if(!g)return;const b=addBlock(A,g[0],g[1],{id:n.id.replace('~p','_in'),feats:g[2],ext:!!n.ext});idmap[n.id]=b.id;});
  const mcu=D.nodes.find(n=>n.type==='mcu');const xt=D.nodes.find(n=>n.type==='xtal');if(mcu&&xt&&idmap[mcu.id])find(A,idmap[mcu.id]).feats.push('외부 크리스털 클럭');
  D.edges.forEach(e=>{const a=idmap[e.a],b=idmap[e.b];if(!a||!b||a===b)return;try{link(A,a,b,e.label,{kind:e.kind==='power'?'power':e.kind==='ext'?(/can/i.test(e.label)?'bus':'signal'):'signal',both:!!e.both});}catch(err){}});
  const v=b=>{const m=String(b.label).match(/\+(\d+)V(\d*)/);return m?+(m[1]+'.'+(m[2]||0)):0;};
  const pw=A.blocks.filter(b=>b.group==='power').sort((x,y)=>(y.ext-x.ext)||(v(y)-v(x)));A.blocks=pw.concat(A.blocks.filter(b=>b.group!=='power'));
  A.fromBoard=true;return A;}

/* motor power stage from the words: current class, H-bridge / external FET / gate driver / direction → library block */
function motorKind(text,bldc){const t=String(text||'').toLowerCase();const ms=[...t.matchAll(/(\d+(?:\.\d+)?)\s*a(?![a-z가-힣])/g)].map(m=>+m[1]).filter(v=>v>=0.1&&v<=400);const i=ms.length?Math.max(...ms):null;
  const ext=/외부\s*(n-?)?\s*(mos)?fet|게이트\s*드라이버|gate\s*driver|mosfet\s*[x×]?\s*\d|\d\s*(n-?)?\s*mosfet|인버터|inverter|파워\s*스테이지|power\s*stage|프리\s*드라이버|pre-?driver/.test(t);
  const hb=/h-?\s*bridge|h\s*브리지|풀\s*브리지|full\s*bridge|정\s*[/·,]?\s*역|양방향|bidirection|reverse|4\s*(n-?)?\s*mosfet|mosfet\s*[x×]\s*4/.test(t);
  if(bldc){const big=(i!=null&&i>2.5)||ext;const I=i!=null?i:20;return big?{type:'gdrv3',i:I,par:I<=25?1:I<=60?2:I<=100?3:4}:{type:'bldc',i:i||2};}
  const big=(i!=null&&i>3)||ext||hb;const I=i!=null?i:hb||ext?10:2;return big?{type:'hbridge',i:I,par:I<=25?1:I<=60?2:I<=100?3:4}:{type:'dcmotor',i:I};}
/* blocks whose words ask for an external-FET stage but whose circuit is the small single-FET / integrated driver: upgrade */
function upgradeMotor(A,log){const hv=/고전압|\bhv\b|[4-9]\d\d\s*v\b|igbt|\bsic\b|절연\s*게이트/i.test((A.req||'')+' '+(A.blocks||[]).map(b=>b.label+' '+(b.feats||[]).join(' ')).join(' '));if(hv){log&&log.push('고전압 인버터 — 저전압 게이트 드라이버/FET 블록으로 바꾸지 않음 (절연 게이트 드라이버는 datasheet로 부품 지정)');return log;}
  (A.blocks||[]).forEach(b=>{const txt=[b.label].concat(b.feats||[]).join(' ')+' '+(A.req||'');(b.impl||[]).forEach(im=>{
    if(im.type==='dcmotor'){const k=motorKind([b.label].concat(b.feats||[]).join(' ')+' '+(A.req||''),false);if(k.type==='hbridge'){im.type='hbridge';im.params={i:k.i};log&&log.push(`${b.id}: 단일 로우사이드 FET → H-브리지 (게이트 드라이버 + MOSFET ×4, ${k.i} A)`);}}
    else if(im.type==='bldc'){const k=motorKind(txt,true);if(k.type==='gdrv3'){im.type='gdrv3';im.params={i:k.i,hall:im.params&&im.params.hall!=null?im.params.hall:1};log&&log.push(`${b.id}: FET 내장 DRV8313 → 3상 게이트 드라이버 + MOSFET ×6 (${k.i} A)`);}}});});
  // inverter / MOSFET blocks without a circuit next to a gate-driver block: realised by that block
  const drv=(A.blocks||[]).find(b=>(b.impl||[]).some(i=>i.type==='gdrv3'||i.type==='hbridge'));if(drv)(A.blocks||[]).forEach(b=>{if(b!==drv&&!b.ext&&!(b.impl||[]).length&&/inverter|인버터|mosfet|fet\b|브리지|bridge/i.test(b.label)){b.via=drv.id;}});
  return log;}
/* ---- architecture → circuit plan (step 2): the impl of every block, in order ---- */
function toPlan(A){
  if(typeof NEWPROJ==='undefined')throw new Error('NEWPROJ 필요');const P=NEWPROJ.newPlan(A.name);P.req=A.req;if(A.safety&&A.safety.level&&A.safety.level!=='QM')P.asil=A.safety.level;const log=[];const map=[];
  upgradeMotor(A,log);
  const order=['power','ctrl','comm','io','ext'];
  order.forEach(g=>A.blocks.filter(b=>b.group===g).forEach(b=>(b.impl||[]).forEach(im=>{try{const x=NEWPROJ.addBlock(P,im.type,im.params||{});map.push({arch:b.id,plan:x.id});}catch(e){log.push(`${b.id}: ${e.message}`);}})));
  NEWPROJ.ldoToBuck(P,log,false);
  const motor=A.blocks.some(b=>(b.impl||[]).some(i=>i.type==='bldc'||i.type==='gdrv3'||i.type==='hbridge'));P.strategy=motor?'thermal':A.blocks.some(b=>(b.impl||[]).some(i=>i.type==='can'||i.type==='dcmotor'))?'noise':'balanced';
  const unmapped=A.blocks.filter(b=>!b.ext&&!b.via&&!(b.impl||[]).length).map(b=>b.label);
  return{plan:P,log,map,unmapped};}


/* ---- readiness check before step 2: what would silently drop out of the circuit, or come out unconnected ----
   err  noImpl   block without a circuit implementation (it is not in the circuit at all)
   warn noPower  block with an implementation but no power-rail link (its supply pin ends up unconnected)
   warn noCtrl   actuation / sensing / comm block with no link to a controller block (no control / feedback signal)
   warn isolated block with no link at all
   Every issue carries the console command that fixes it; implGuess() proposes a type from the block's wording. */
const IMPL_GUESS=[[/buck|강압|dc-?dc|smps|스위칭/i,'buck'],[/ldo|레귤|regulator|pmic|sbc|전압\s*변환/i,'ldo'],[/watchdog|워치독|supervisor|reset|감시/i,'supervisor'],
  [/can/i,'can'],[/flash|플래시|메모리|eeprom|memory/i,'flash'],[/led|표시등|램프/i,'led'],[/button|버튼|스위치\s*입력|key/i,'button'],[/uart|debug|디버그|jtag|swd|console|콘솔|xcp|calib/i,'uart'],[/i2c|i²c|iic|센서\s*확장|expander/i,'i2c'],
  [/3[-\s]?phase|3상|bldc|pmsm|inverter|인버터|gate\s*driver|게이트/i,'gdrv3'],[/h-?bridge|h\s*브리지|dc\s*모터|dc\s*motor|정\/역|양방향|스텝|stepper|step\s*motor/i,'hbridge'],[/low-?side|로우사이드|솔레노이드|solenoid|밸브|valve|fan|팬|히터|heater|릴레이|relay/i,'dcmotor'],
  [/high-?side|하이사이드|부하\s*스위치|load\s*switch|phase-?cut|차단|relay/i,'hs_switch'],[/sens|센싱|센서|current|전류|temp|온도|monitor|모니터|adc|feedback|피드백|torque|토크|angle|각도|position|위치/i,'vmon'],
  [/mcu|micro|controller|컨트롤러|cortex|aurix|stm32|tc3/i,'mcu'],[/usb/i,'usb_in'],[/battery|배터리|입력|input|vin|kl30/i,'pwr_in']];
function implGuess(b){const t=(b.label||'')+' '+(b.feats||[]).join(' ');for(const[re,ty]of IMPL_GUESS)if(re.test(t))return ty;return null;}
function check(A){const out=[];if(!A)return out;const B=id=>A.blocks.find(b=>b.id===id);const has=b=>(b.impl||[]).length||b.part;
  const ctrl=new Set(A.blocks.filter(b=>b.group==='ctrl').map(b=>b.id));
  A.blocks.forEach(b=>{if(b.ext||b.via)return;const links=A.links.filter(l=>l.a===b.id||l.b===b.id);
    if(!has(b)){const g=implGuess(b);out.push({sev:'err',code:'noImpl',id:b.id,label:b.label,msg:`"${b.label}" 블록에 회로 구현(impl)이 없어 회로에서 빠집니다`,fix:g?`impl ${b.id} ${g}`:`impl ${b.id} part <부품번호>  (라이브러리 종류는 help)`,guess:g});}
    if(!links.length){out.push({sev:'warn',code:'isolated',id:b.id,label:b.label,msg:`"${b.label}" 블록이 아무 블록과도 연결되지 않았습니다`,fix:`link <상대> ${b.id} <신호>`});return;}
    if(has(b)&&b.group!=='power'&&!links.some(l=>l.kind==='power')){const reg=A.blocks.find(x=>x.group==='power'&&(x.rails||[]).length)||A.blocks.find(x=>x.group==='power'&&x.id!=='pin');
      out.push({sev:'warn',code:'noPower',id:b.id,label:b.label,msg:`"${b.label}" 블록에 전원 레일 연결이 없습니다 (전원 핀 미연결)`,fix:reg?`link ${reg.id} ${b.id} ${(reg.rails||[])[0]?reg.rails[0].name+' '+reg.rails[0].v+' V':'VCC'} --kind power`:`link <전원블록> ${b.id} VCC --kind power`});}
    if(has(b)&&(b.group==='io'||b.group==='comm')&&ctrl.size&&!links.some(l=>ctrl.has(l.a)||ctrl.has(l.b))){const m=[...ctrl][0];out.push({sev:'warn',code:'noCtrl',id:b.id,label:b.label,msg:`"${b.label}" 블록이 MCU와 연결되지 않았습니다 (제어·피드백 신호 없음)`,fix:`link ${m} ${b.id} <신호> --both`});}});
  if(!A.blocks.some(b=>b.group==='ctrl'&&has(b)))out.push({sev:'err',code:'noMcu',id:null,label:'',msg:'제어 블록(MCU)이 없거나 구현이 없습니다',fix:'block ctrl "Main MCU" 뒤 impl mcu part=<MPN>'});
  if(!A.blocks.some(b=>b.group==='power'&&has(b)))out.push({sev:'err',code:'noPower',id:null,label:'',msg:'전원 블록(입력·레귤레이터)이 없거나 구현이 없습니다',fix:'block power "Regulator" 뒤 impl reg ldo vout=3.3'});
  return out;}
function checkText(I){if(!I.length)return'점검: 문제 없음 — 모든 블록에 회로 구현과 전원·제어 연결이 있습니다.';const e=I.filter(x=>x.sev==='err'),w=I.filter(x=>x.sev==='warn');
  return[`점검: 오류 ${e.length} · 경고 ${w.length}`].concat(I.map(x=>`  ${x.sev==='err'?'✕':'△'} ${x.msg}\n      → ${x.fix}`)).join('\n');}
/* ---- layout: bands top to bottom, blocks centred in each band ---- */
const LW=150,BW=196,GX=84,BAND=30,PAD=22,LH=15;
function bh(b){const sw=b.feats.filter(f=>/^SW:/.test(f)).length;const n=Math.min(4,b.feats.length-sw+(sw?1:0));return 34+n*LH+(b.feats.length?6:0);}
function layout(A){
  const rows=GROUPS.map(g=>A.blocks.filter(b=>b.group===g[0])).map((bs,i)=>({g:GROUPS[i],bs})).filter(r=>r.bs.length);
  const wOf=b=>b.group==='ctrl'?Math.max(BW,300):BW;
  const rowW=r=>r.bs.reduce((a,b)=>a+wOf(b),0)+(r.bs.length-1)*GX;const inner=Math.max(560,...rows.map(rowW));
  let y=PAD+26;rows.forEach(r=>{const h=Math.max(...r.bs.map(bh));let x=LW+PAD+(inner-rowW(r))/2;r.y=y;r.h=h+BAND*2;
    r.bs.forEach(b=>{b.w=wOf(b);b.h=bh(b);b.x=x;b.y=y+BAND+(h-b.h)/2;x+=b.w+GX;});y+=r.h+18;});
  const W=LW+PAD*2+inner+40,H=y+28;return{rows,W,H,inner};}
const xe=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const HUE={power:'#d9822b',signal:'#3d7fd9',bus:'#8a5cd6',safe:'#d9534f'};
function svg(A,opts){opts=opts||{};const sel=opts.sel||null;const L=layout(A);const B=id=>A.blocks.find(b=>b.id===id);const rowOf=b=>L.rows.findIndex(r=>r.g[0]===b.group);
  const o=[];o.push(`<svg class="hwa" viewBox="0 0 ${L.W} ${L.H}" role="img" aria-label="${xe(`${A.name} HW 아키텍처 블록 다이어그램: ${A.blocks.length}개 블록, ${A.links.length}개 인터페이스`)}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans KR, system-ui, sans-serif">`);
  o.push(`<defs>${Object.entries(HUE).map(([k,c])=>`<marker id="hw-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('')}</defs>`);
  o.push(`<text x="${L.W/2}" y="${PAD+4}" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${xe(A.name)} · HW Architecture</text>`);
  // bands
  L.rows.forEach(r=>{o.push(`<rect x="${PAD}" y="${r.y}" width="${L.W-PAD*2}" height="${r.h}" rx="10" fill="currentColor" fill-opacity="0.035" stroke="currentColor" stroke-opacity="0.14"/>`);
    o.push(`<text x="${PAD+14}" y="${r.y+r.h/2-4}" font-size="12.5" font-weight="700" fill="currentColor">${xe(r.g[1])}</text><text x="${PAD+14}" y="${r.y+r.h/2+12}" font-size="10.5" fill="currentColor" opacity="0.6">${xe(r.g[2])}</text>`);});
  // links: adjacent bands run straight through the gap; longer ones take a lane on the right
  const lanes={n:0};const ports={};const cnt={};const key=(id,s)=>id+s;
  const plan=A.links.map(l=>{const a=B(l.a),b=B(l.b);if(!a||!b)return null;const ra=rowOf(a),rb=rowOf(b);let sa,sb,mode;
    if(ra===rb){mode='h';sa=a.x<b.x?'R':'L';sb=a.x<b.x?'L':'R';}else if(Math.abs(ra-rb)===1){mode='v';sa=ra<rb?'B':'T';sb=ra<rb?'T':'B';}
    else if(l.kind==='power')return{l,a,b,mode:'tag'}; // a rail that skips a band is shown as an input tag on the user (like [ VCC_DRV ])
    else{mode='lane';sa=ra<rb?'B':'T';sb=ra<rb?'T':'B';}
    cnt[key(a.id,sa)]=(cnt[key(a.id,sa)]||0)+1;cnt[key(b.id,sb)]=(cnt[key(b.id,sb)]||0)+1;return{l,a,b,sa,sb,mode};}).filter(Boolean);
  const port=(n,s)=>{const k=key(n.id,s);ports[k]=(ports[k]||0)+1;const f=ports[k]/(cnt[k]+1);return s==='B'?[n.x+n.w*f,n.y+n.h]:s==='T'?[n.x+n.w*f,n.y]:s==='R'?[n.x+n.w,n.y+n.h*f]:[n.x,n.y+n.h*f];};
  const labels=[];const tags={};const ffi=new Set(typeof SAFETY!=='undefined'?SAFETY.boundaries(A).map(f=>f.link):[]);const lvOf=b=>typeof SAFETY!=='undefined'?SAFETY.blockLevel(A,b):'QM';const sysLv=typeof SAFETY!=='undefined'?SAFETY.level(A):'QM';
  plan.forEach(p=>{const{l,a,b}=p;if(p.mode==='tag'){(tags[b.id]=tags[b.id]||[]).push(l);return;}const[x1,y1]=port(a,p.sa),[x2,y2]=port(b,p.sb);let d,lx,ly;
    if(p.mode==='v'){const my=(y1+y2)/2;d=`M${x1},${y1} V${my} H${x2} V${y2}`;lx=x2;ly=my+(y2>y1?8:-8)*0;}
    else if(p.mode==='h'){const mx=(x1+x2)/2;d=`M${x1},${y1} H${mx} V${y2} H${x2}`;lx=mx;ly=Math.min(y1,y2)-13;}
    else{const k=lanes.n++;const lx0=L.W-PAD-12-k*10;const RA=L.rows[rowOf(a)],RB=L.rows[rowOf(b)];const down=rowOf(a)<rowOf(b);
      const ca=down?RA.y+RA.h-7-k*3:RA.y+7+k*3,cb=down?RB.y+7+k*3:RB.y+RB.h-7-k*3;d=`M${x1},${y1} V${ca} H${lx0} V${cb} H${x2} V${y2}`;lx=lx0;ly=(ca+cb)/2;}
    const on=sel&&(l.a===sel||l.b===sel),dim=sel&&!on;const c=HUE[l.kind]||'currentColor';
    o.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${on?2.4:1.5}"${l.kind==='power'?' stroke-dasharray="6 4"':''} stroke-linejoin="round" opacity="${dim?0.2:0.95}" marker-end="url(#hw-${l.kind})"${l.both?` marker-start="url(#hw-${l.kind})"`:''}/>`);
    if(l.label||ffi.has(l))labels.push({x:lx,y:ly,t:(ffi.has(l)?'FFI ⚠ ':'')+(l.label||''),c:ffi.has(l)?HUE.safe:c,dim,on,lane:p.mode==='lane'});});
  labels.sort((p,q)=>p.y-q.y);for(let i=1;i<labels.length;i++)for(let j=0;j<i;j++){const p=labels[i],q=labels[j];const w=(p.t.length+q.t.length)*3.4+12;if(Math.abs(p.x-q.x)<w&&Math.abs(p.y-q.y)<15)p.y=q.y+15;}
  labels.forEach(lb=>{const w=Math.min(190,lb.t.length*6.4+12);const x=lb.lane?lb.x-w-4:lb.x-w/2;o.push(`<g opacity="${lb.dim?0.25:1}"><rect x="${x}" y="${lb.y-8.5}" width="${w}" height="17" rx="4" fill="var(--surface,#fff)" stroke="${lb.c}" stroke-opacity="0.4"/><text x="${x+w/2}" y="${lb.y+4}" text-anchor="middle" font-size="11" fill="currentColor"${lb.on?' font-weight="600"':''}>${xe(lb.t.length>28?lb.t.slice(0,27)+'…':lb.t)}</text></g>`);});
  // rail tags: rails arriving from a band further away
  Object.entries(tags).forEach(([id,ls])=>{const b=B(id);ls.forEach((l,i)=>{const t='⇢ '+(l.label||l.a);const w=Math.min(170,t.length*6.2+12);const x=b.x+b.w-w-(i*0),y=b.y-10-i*18;const dim=sel&&!(l.a===sel||l.b===sel);
    o.push(`<g opacity="${dim?0.3:1}"><rect x="${x}" y="${y-8.5}" width="${w}" height="17" rx="8.5" fill="var(--surface,#fff)" stroke="${HUE.power}" stroke-dasharray="4 2"/><text x="${x+w/2}" y="${y+4}" text-anchor="middle" font-size="10.5" fill="${HUE.power}"><title>${xe(l.a)} → ${xe(l.b)}</title>${xe(t)}</text></g>`);});});
  // blocks
  A.blocks.forEach(b=>{const on=sel===b.id,dim=sel&&!on&&!A.links.some(l=>(l.a===sel&&l.b===b.id)||(l.b===sel&&l.a===b.id));
    o.push(`<g class="sd-n" data-n="${xe(b.id)}" tabindex="0" role="button" aria-label="${xe(b.label)}" opacity="${dim?0.4:1}" style="cursor:pointer">`);
    const lv=lvOf(b),lc=ASIL_HUE[lv];o.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.ext?16:6}" fill="var(--raised,#fff)" stroke="${on?'#3d7fd9':lc||'currentColor'}" stroke-opacity="${on?1:lc?0.95:0.55}" stroke-width="${on?2.2:lc?2:1.2}"${b.ext?' stroke-dasharray="5 3"':''}/>`);
    if(lc){o.push(`<rect x="${b.x+b.w-46}" y="${b.y-8}" width="42" height="15" rx="7" fill="${lc}"/><text x="${b.x+b.w-25}" y="${b.y+3.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">ASIL ${lv}</text>`);}if(b.safety)o.push(`<text x="${b.x+6}" y="${b.y+b.h-5}" font-size="9" fill="${HUE.safe}">안전 메커니즘</text>`);if(b.sg&&b.sg.length)o.push(`<text x="${b.x+b.w-6}" y="${b.y+b.h-5}" text-anchor="end" font-size="9" font-weight="700" fill="${HUE.safe}" opacity="0.85">${xe(b.sg.join(' · '))}</text>`);
    o.push(`<text x="${b.x+b.w/2}" y="${b.y+21}" text-anchor="middle" font-size="12.5" font-weight="700" fill="currentColor">${xe(b.label.length>30?b.label.slice(0,29)+'…':b.label)}</text>`);
    {const sw=b.feats.filter(f=>/^SW:/.test(f)),hw=b.feats.filter(f=>!/^SW:/.test(f));const show=hw.slice(0,sw.length?3:4);show.forEach((f,i)=>o.push(`<text x="${b.x+12}" y="${b.y+40+i*LH}" font-size="10.5" fill="currentColor" opacity="0.72">· ${xe(f.length>34?f.slice(0,33)+'…':f)}</text>`));if(sw.length)o.push(`<text x="${b.x+12}" y="${b.y+40+show.length*LH}" font-size="10.5" fill="${HUE.safe}" opacity="0.9">⚑ SW 안전 메커니즘 ${sw.length}개</text>`);}
    if(b.via)o.push(`<text x="${b.x+b.w-6}" y="${b.y+14}" text-anchor="end" font-size="9" fill="currentColor" opacity="0.6">→ ${xe(b.via)} 회로에 포함</text>`);
    if(!(b.impl||[]).length&&!b.ext&&!b.via)o.push(`<circle cx="${b.x+b.w-9}" cy="${b.y+9}" r="3.2" fill="none" stroke="currentColor" stroke-opacity="0.5"><title>회로 구현 블록 없음</title></circle>`);
    o.push('</g>');});
  const ly=L.H-12;o.push(`<g font-size="10.5" fill="currentColor" opacity="0.78"><line x1="${PAD}" y1="${ly}" x2="${PAD+24}" y2="${ly}" stroke="${HUE.power}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${PAD+30}" y="${ly+3.5}">전원 · 고전류</text>
    <line x1="${PAD+120}" y1="${ly}" x2="${PAD+144}" y2="${ly}" stroke="${HUE.signal}" stroke-width="1.5"/><text x="${PAD+150}" y="${ly+3.5}">제어 · 피드백 신호</text>
    <line x1="${PAD+262}" y1="${ly}" x2="${PAD+286}" y2="${ly}" stroke="${HUE.bus}" stroke-width="1.5"/><text x="${PAD+292}" y="${ly+3.5}">외부 버스</text>
    <rect x="${PAD+372}" y="${ly-7}" width="22" height="13" rx="6" fill="none" stroke="currentColor" stroke-dasharray="5 3"/><text x="${PAD+400}" y="${ly+3.5}">보드 밖</text>${sysLv!=='QM'?`<line x1="${PAD+450}" y1="${ly}" x2="${PAD+474}" y2="${ly}" stroke="${HUE.safe}" stroke-width="1.5"/><text x="${PAD+480}" y="${ly+3.5}">세이프 스테이트 · FFI 경계</text><text x="${L.W-PAD}" y="${ly+3.5}" text-anchor="end" font-weight="700">시스템 ASIL ${sysLv}</text>`:''}</g>`);
  o.push('</svg>');return o.join('');}
function text(A){const B=id=>A.blocks.find(b=>b.id===id);const L=[`HW 아키텍처 · ${A.name} · 블록 ${A.blocks.length} · 인터페이스 ${A.links.length}`];
  GROUPS.forEach(g=>{const bs=A.blocks.filter(b=>b.group===g[0]);if(!bs.length)return;L.push(`[${g[1]} · ${g[2]}]`);bs.forEach(b=>L.push(`  ${b.id}: ${b.label}${b.sg&&b.sg.length?' {'+b.sg.join(',')+'}':''}${b.asil?' [ASIL '+b.asil+']':''}${b.ext?' (보드 밖)':''}${b.feats.length?' — '+b.feats.join(' · '):''}${(b.impl||[]).length?`  ⇒ 회로: ${b.impl.map(i=>i.type+(i.params&&Object.keys(i.params).length?`(${Object.entries(i.params).map(([k,v])=>k+'='+v).join(',')})`:'')).join(' + ')}`:b.ext?'':'  ⇒ 회로: (없음)'}`));});
  L.push('인터페이스:');A.links.forEach(l=>{const a=B(l.a),b=B(l.b);L.push(`  ${l.a} ${l.both?'↔':'→'} ${l.b} : ${l.label} [${{power:'전원',signal:'신호',bus:'버스',safe:'세이프 스테이트'}[l.kind]}]${a&&b?'':' (끊김)'}`);});
  if(typeof SAFETY!=='undefined'&&SAFETY.level(A)!=='QM')L.push(SAFETY.archText(A));
  return L.join('\n');}
return{check,checkText,implGuess,GROUPS,gAlias,blank,addBlock,find,link,unlink,remove,motorKind,upgradeMotor,archFrom,fromDiagram,toPlan,layout,svg,text};
})();
if(typeof module!=='undefined')module.exports=HWARCH;
