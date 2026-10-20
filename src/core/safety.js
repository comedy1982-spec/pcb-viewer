/* Functional safety layer (ISO 26262 style ASIL QM/A/B/C/D): safety level and goals on the HW architecture, recommended
   safety-mechanism blocks per level, freedom-from-interference boundaries, circuit-level checks on the board and a rough
   FMEDA (FIT budget, diagnostic coverage, SPFM / PMHF estimate). All numbers are early-design estimates. */
const SAFETY=(function(){
"use strict";
const LEVELS=['QM','A','B','C','D'];const rank=l=>Math.max(0,LEVELS.indexOf(String(l||'QM').toUpperCase()));
const norm=l=>LEVELS[rank(l)];
function parseLevel(text){const t=String(text||'');let m=t.match(/ASIL[\s\-_]*([ABCD])\b/i);if(m)return m[1].toUpperCase();m=t.match(/\bSIL[\s\-_]*([123])\b/i);if(m)return{1:'B',2:'C',3:'D'}[m[1]];if(/\bQM\b/i.test(t))return'QM';return null;}
/* targets per ISO 26262-5 (hardware architectural metrics / PMHF) */
const TARGETS={QM:{spfm:null,lfm:null,pmhf:null},A:{spfm:null,lfm:null,pmhf:1000},B:{spfm:90,lfm:60,pmhf:100},C:{spfm:97,lfm:80,pmhf:100},D:{spfm:99,lfm:90,pmhf:10}};
/* safety mechanisms recommended from a level upward: how to recognise one already in the architecture (kw on label/feats),
   the block to add (group · label · feats · circuit impl), and the diagnostic coverage it brings to which part class */
const MECH=[
  {id:'uv',min:'A',label:'전원 감시 (UV/OV 리셋)',group:'power',feats:['입력·코어 전압 저전압/과전압 감시','임계 이하면 MCU 리셋 유지'],impl:'supervisor',kw:/supervis|감시|\buv\b|\bov\b|reset ic|brown|monitor|모니터/i,dc:{power:90,mcu:0},link:{to:'ctrl',label:'nRESET',kind:'safe'}},
  {id:'wdt_int',min:'A',label:'내부 워치독 (SW)',sw:true,kw:/iwdg|내부 워치독|internal wdt/i,dc:{mcu:60}},
  {id:'wdt_ext',min:'B',label:'외부 윈도우 워치독',group:'power',feats:['MCU가 주기적으로 WDI 토글','창 밖이면 리셋 → 세이프 스테이트'],impl:'supervisor',kw:/watchdog|워치독|wdt|wdi/i,dc:{mcu:90},link:{to:'ctrl',label:'WDI / nRESET',kind:'safe'}},
  {id:'adc_diag',min:'B',label:'ADC 레퍼런스·자가 진단',sw:true,kw:/adc.*(진단|self|ref)|레퍼런스 검사|자가 진단/i,dc:{sensor:60}},
  {id:'conn_diag',min:'B',label:'커넥터 open/short 진단',group:'io',feats:['입력 핀 풀업/풀다운으로 open 검출','short-to-BAT/GND 범위 검사'],kw:/open.?short|단선|진단 풀|conn.*diag/i,dc:{conn:60}},
  {id:'drv_fb',min:'B',label:'드라이버 fault·전류 리드백',group:'io',feats:['드라이버 nFAULT → MCU','전류 감지·과전류 차단'],kw:/fault|리드백|readback|과전류|current sens|전류 감지/i,dc:{driver:90},link:{to:'ctrl',label:'nFAULT / I_SENSE',kind:'signal'}},
  {id:'sbc',min:'C',label:'SBC (전원 + 질의응답 워치독 + 세이프 스테이트)',group:'power',feats:['PMIC + 질의응답(Q&A) 워치독','FS0B 세이프 스테이트 출력 → 드라이버 비활성'],impl:null,kw:/\bsbc\b|system basis|질의응답|challenge|fs0b|tle92|l99|fs6/i,dc:{power:99,mcu:99},link:{to:'ctrl',label:'SPI · nRESET · FS0B',kind:'safe'}},
  {id:'monitor',min:'C',label:'독립 모니터 경로',group:'io',feats:['주 경로와 독립된 전압/전류 레퍼런스로 2차 감시','불일치 시 세이프 스테이트'],kw:/독립 모니터|secondary monitor|2차 감시|independent/i,dc:{sensor:90,driver:90}},
  {id:'sensor_red',min:'C',label:'리던던트 센서 (이종)',group:'io',feats:['주 센서 + 이종 보조 센서','교차 검증 · 공통 원인 고장 분리'],kw:/리던던|redund|이중 센서|보조 센서|dual sensor/i,dc:{sensor:99}},
  {id:'cutoff2',min:'C',label:'이중 차단 세이프 스테이트',group:'power',feats:['드라이버 EN 차단 + 상위 전원 스위치(하이사이드 FET/릴레이)','전원 상실에도 안전 측으로'],impl:'hs_switch',kw:/이중 차단|cut.?off|하이사이드 스위치|safe state|세이프 스테이트|relay|릴레이/i,dc:{driver:99},link:{to:'ctrl',label:'SAFE_EN',kind:'safe'}},
  {id:'decomp',min:'D',label:'ASIL 분해 (2채널)',group:'ctrl',feats:['ASIL D = B(D) + B(D)','독립 채널 2개의 비교·투표'],kw:/분해|decompos|2채널|dual channel|two.?channel/i,dc:{mcu:99}},
  {id:'lockstep',min:'D',label:'락스텝 코어 / 2-MCU 상호 감시',group:'ctrl',feats:['락스텝 MCU 또는 보조 MCU','상호 생존 신호·결과 비교'],kw:/lockstep|락스텝|2-?mcu|상호 감시|checker/i,dc:{mcu:99}}];
function level(A){return norm(A&&A.safety&&A.safety.level||'QM');}
function blockLevel(A,b){return b.asil?norm(b.asil):level(A);}
function hasMech(A,m){return(A.blocks||[]).find(b=>m.kw.test(b.label+' '+(b.feats||[]).join(' ')+' '+(b.impl||[]).map(i=>i.type).join(' ')))||null;}
function mechanisms(A,lv){lv=norm(lv||level(A));return MECH.filter(m=>rank(m.min)<=rank(lv)).map(m=>{const p=hasMech(A,m);return Object.assign({},m,{present:p?p.id:null,presentLabel:p?p.label:''});});}
/* links whose two blocks have different ASIL: freedom-from-interference boundaries */
function boundaries(A){const B=id=>(A.blocks||[]).find(b=>b.id===id);return(A.links||[]).map(l=>{const a=B(l.a),b=B(l.b);if(!a||!b)return null;const la=blockLevel(A,a),lb=blockLevel(A,b);if(la===lb)return null;
  return{link:l,a:a.id,b:b.id,from:la,to:lb,high:rank(la)>rank(lb)?a.id:b.id,msg:`${a.label} (ASIL ${la}) ↔ ${b.label} (ASIL ${lb}): "${l.label||l.kind}" 경계 — 낮은 쪽이 높은 쪽을 방해하지 못하도록 진단·격리(FFI)`};}).filter(Boolean);}
/* add the recommended blocks that are missing (ids or 'all'); links them to the controller / driver blocks */
function apply(A,HW,ids,lv){lv=norm(lv||level(A));const want=mechanisms(A,lv).filter(m=>!m.sw&&!m.present&&(ids==='all'||!ids||ids.includes(m.id)));const ctrl=(A.blocks||[]).find(b=>b.group==='ctrl');const drv=(A.blocks||[]).filter(b=>b.group==='io'&&/driv|드라이버|bridge|브리지|모터|motor|actuat|구동/i.test(b.label+' '+b.feats.join(' ')));const added=[];
  want.forEach(m=>{const b=HW.addBlock(A,m.group,m.label,{feats:m.feats.slice(),id:'sm_'+m.id,asil:lv});b.safety=m.id;if(m.impl&&typeof NEWPROJ!=='undefined'&&NEWPROJ.LIB&&NEWPROJ.LIB[m.impl])b.impl=[{type:m.impl,params:{}}];
    if(m.link&&ctrl){const target=m.link.to==='ctrl'?ctrl:null;if(target)HW.link(A,b.id,target.id,m.link.label,{kind:m.link.kind,both:m.id==='sbc'});}
    if(m.id==='cutoff2')drv.forEach(d=>HW.link(A,b.id,d.id,'전원 차단',{kind:'safe'}));
    if(m.id==='drv_fb')drv.forEach(d=>HW.link(A,d.id,b.id,'nFAULT · I_SENSE',{kind:'signal'}));
    added.push(b);});
  return added;}
function archText(A){const lv=level(A);const M=mechanisms(A,lv);const F=boundaries(A);const G=A.safety&&A.safety.goals||[];
  return`[기능 안전] 시스템 ASIL ${lv}${G.length?` · 안전 목표: ${G.join(' / ')}`:''}\n블록 등급: ${(A.blocks||[]).map(b=>`${b.id} ${blockLevel(A,b)}`).join(', ')||'-'}\n안전 메커니즘 (${lv} 기준 ${M.length}개): `+(M.length?M.map(m=>`${m.present?'✓':m.sw?'○':'✕'} ${m.label}${m.present?' ← '+m.presentLabel:m.sw?' (SW)':' — 없음'}`).join('; '):'QM: 없음')+(F.length?`\nFFI 경계 ${F.length}: `+F.map(f=>f.msg).join('; '):'')+(M.some(m=>!m.present&&!m.sw)?'\n→ safety apply 로 빠진 메커니즘 블록을 추가':'');}
/* ---------- circuit-level checks on the board ---------- */
const FIT={R:0.2,C:0.5,CP:2,L:0.5,FB:0.3,D:1,LED:2,TVS:1,Q:3,U:10,MCU:30,REG:8,DRV:15,XCVR:10,J:0.5,Y:5,SW:5,TP:0,M:0,X:2};
function cat(c){const r=c.ref.toUpperCase(),t=(c.val+' '+(c.desc||'')+' '+(c.mpn||'')+' '+c.fp).toUpperCase();
  if(/^TP\d/.test(r))return'TP';if(/^(R|RN)\d/.test(r))return'R';if(/^C\d/.test(r))return/ELCAP|µF|UF/.test(t)&&/^CP|10X10|ELEC/.test(c.fp.toUpperCase()+(c.kind||'').toUpperCase())?'CP':'C';if(/^L\d/.test(r))return'L';if(/^FB\d/.test(r))return'FB';
  if(/^(D|LED)\d/.test(r))return/SMAJ|SMBJ|TVS|PESD|ESD/.test(t)?'TVS':c.kind==='led'||/LED/.test(t)?'LED':'D';if(/^Q\d/.test(r))return'Q';if(/^(J|P|CN|USB)\d/.test(r))return'J';if(/^(Y|X)\d/.test(r))return'Y';if(/^(SW|S|BTN)\d/.test(r))return'SW';if(/^(M|MOT)\d/.test(r))return'M';
  if(/^(U|IC|VR|PS)\d/.test(r)){if(c.pads.length>=20||/MCU|STM32|TC3|CORTEX|AURIX/.test(t))return'MCU';if(/1117|LDO|REG|TPS5|TPS7|BUCK|MP1|LM2|AP2112|CONVERTER|레귤/.test(t))return'REG';if(/DRV|BRIDGE|GATE|DRIVER|드라이버|8313|8870|BTN|BTS/.test(t))return'DRV';if(/CAN|TJA|TLE92|MCP25|SN65|RS485|TRANSCEIVER|트랜시버|PHY/.test(t))return'XCVR';return'U';}return'X';}
/* which part class a mechanism covers */
const CLASS={MCU:'mcu',REG:'power',DRV:'driver',XCVR:'comm',Q:'driver',J:'conn',U:'other',Y:'mcu'};
function partClass(c,B){const k=cat(c);if(CLASS[k])return CLASS[k];if(k==='R'||k==='C'||k==='CP'||k==='L'||k==='FB'||k==='D'||k==='TVS'){const nets=c.pads.map(p=>p.net).filter(Boolean);const pw=nets.some(n=>B.netClass&&B.netClass(n)==='전원');return pw?'power':'signal';}return'other';}
function reach(B,net,ref){return!!net&&(B.nets[net]&&B.nets[net].pads||[]).some(p=>p.ref===ref);}
function circuitChecks(B,opt){opt=opt||{};const lv=norm(opt.level||(B.safety&&B.safety.level)||'QM');const A=opt.arch||null;const out=[];const add=(id,min,sev,label,msg,fix)=>out.push({id,min,sev:rank(lv)<rank(min)?'na':sev,label,msg,fix:fix||''});
  const comps=B.comps;const T=c=>(c.val+' '+(c.desc||'')+' '+(c.mpn||'')).toUpperCase();const mcu=comps.filter(c=>cat(c)==='MCU').sort((a,b)=>b.pads.length-a.pads.length)[0]||null;
  const mcuNets=new Set(mcu?mcu.pads.map(p=>p.net).filter(Boolean):[]);
  // power supervision / reset
  const sup=comps.find(c=>/^(U|IC)\d/i.test(c.ref)&&/TPS38|TPS37|MAX6|MAX8|MAX16|SUPERVIS|RESET IC|VOLTAGE DETECTOR|감시|BROWN|TLE42|TLE92|L99|SBC|FS6|NCV86|APX8|STM6|STM11/.test(T(c)));
  add('supervisor','A',sup?'ok':'err','전원 감시(UV) · 리셋','전원 감시 IC: '+(sup?`${sup.ref} ${sup.val}`:'없음 — 코어 전압 저하 시 MCU 오동작을 막을 리셋 소스가 없습니다.'),sup?'':'1단계 safety apply (supervisor) 또는 회로 콘솔 add … / impl');
  // watchdog: supervisor with WDI pin on an MCU net, or SBC
  const wdt=comps.find(c=>/^(U|IC)\d/i.test(c.ref)&&(/\bWDT\b|WATCHDOG|\bWDI\b|TPS3823|TPS3824|MAX6369|MAX6371|\bSBC\b|TLE92|L99|워치독/.test(T(c))||c.pads.some(p=>/^WDI$/i.test(p.fn||'')))&&c.pads.some(p=>mcuNets.has(p.net)));
  add('wdt','B',wdt?'ok':'err','외부 워치독','외부 워치독: '+(wdt?`${wdt.ref} ${wdt.val} (MCU와 연결됨)`:'없음 — SW 행(hang)을 독립적으로 잡을 수 없습니다.'),wdt?'':'supervisor 블록(TPS3823 WDI) 또는 SBC');
  const qa=comps.find(c=>/SBC|TLE92|L99|FS6|질의응답|Q&A/.test(T(c)));add('wdt_qa','C',qa?'ok':'warn','질의응답 워치독 (SBC)',qa?`SBC/Q&A 워치독: ${qa.ref} ${qa.val}`:'질의응답(challenge-response) 워치독이 없습니다 — ASIL C/D에서는 단순 윈도우 WDT만으로 프로그램 흐름 감시가 약합니다.','SBC(TLE926x · L9963 · FS65 등) 검토');
  // reverse polarity / TVS on the input
  const conns=comps.filter(c=>cat(c)==='J');const connNets=new Set(conns.flatMap(c=>c.pads.map(p=>p.net).filter(Boolean)));
  const pwrIn=n=>!!n&&(/VIN|BAT|RAW|VBUS|SUPPLY|IN$/i.test(n)||(B.netClass&&B.netClass(n)==='전원'));
  const rev=comps.find(c=>(cat(c)==='D'||cat(c)==='Q')&&!/LED/.test(T(c))&&(()=>{const n=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];if(n.length!==2)return false;const [a,b]=n;const pw=n=>B.netClass&&B.netClass(n)==='전원';return(connNets.has(a)&&pwrIn(a)&&pw(b)&&pw(a))||(connNets.has(b)&&pwrIn(b)&&pw(a)&&pw(b));})());
  add('revpol','A',rev?'ok':'warn','역전압 보호',rev?`역전압 보호: ${rev.ref} ${rev.val} (입력 직렬)`:'입력에 직렬 다이오드/역전압 FET가 없습니다.','pwr_in 블록(쇼트키) 또는 insert D --at <커넥터 핀>');
  const tvs=comps.filter(c=>cat(c)==='TVS');add('tvs','A',tvs.length?'ok':'warn','입력 서지·ESD 보호',tvs.length?`TVS: ${tvs.map(c=>c.ref+' '+c.val).join(', ')}`:'입력/버스에 TVS가 없습니다 (ISO 7637 펄스 · ESD).','add TVS SMAJ… --pins <레일>,GND');
  // driver fault / enable / current sense
  const drvs=comps.filter(c=>cat(c)==='DRV');const qdrv=drvs.length?[]:comps.filter(c=>cat(c)==='Q'&&c.pads.some(p=>connNets.has(p.net)&&!(B.netClass&&B.netClass(p.net)==='전원')));
  if(drvs.length||qdrv.length){if(!drvs.length){add('drv_fault','B','na','드라이버 fault 리드백',`이산 FET 구동 (${qdrv.map(q=>q.ref).join(', ')}) — fault 핀 없음, 전류 감지·리드백으로 대체`);const g=qdrv.filter(q=>q.pads.some(p=>/^G/i.test(p.fn||'')&&(mcuNets.has(p.net)||comps.some(r=>cat(r)==='R'&&r.pads.some(x=>x.net===p.net)&&r.pads.some(x=>mcuNets.has(x.net))))));add('drv_en','B',g.length===qdrv.length?'ok':'err','구동 차단(세이프 스테이트) 경로',`게이트 → MCU: ${g.map(q=>q.ref).join(', ')||'없음'} (게이트 풀다운으로 리셋 중 OFF)`,'게이트 풀다운 저항 + MCU GPIO');}
  else{const flt=drvs.filter(d=>d.pads.some(p=>/FAULT|FLT|ERR|DIAG/i.test(p.fn||'')&&mcuNets.has(p.net)));const en=drvs.filter(d=>d.pads.some(p=>/^(N?SLEEP|EN|ENABLE|N?RESET|INH|DIS)/i.test(p.fn||'')&&mcuNets.has(p.net)));
    add('drv_fault','B',flt.length===drvs.length?'ok':flt.length?'warn':'err','드라이버 fault 리드백',`fault 핀 → MCU: ${flt.map(d=>d.ref).join(', ')||'없음'} / 드라이버 ${drvs.map(d=>d.ref).join(', ')}`,'connect <드라이버.nFAULT> <MCU 넷>');
    add('drv_en','B',en.length===drvs.length?'ok':'err','드라이버 비활성(세이프 스테이트) 경로',`EN/nSLEEP → MCU: ${en.map(d=>d.ref).join(', ')||'없음'}`,'드라이버 EN을 MCU GPIO(풀다운)로');}
    const shunt=comps.find(c=>cat(c)==='R'&&(SAFETYparseVal(c.val)<=1)&&c.pads.some(p=>p.net&&B.netClass&&B.netClass(p.net)==='접지'));
    add('isense','B',shunt?'ok':'warn','전류 감지',shunt?`션트 ${shunt.ref} ${shunt.val}`:'전류 감지 션트가 없습니다 — 과전류·고착 진단 불가.','add R 0.1Ω --pins <드라이버 GND>,GND (로우사이드 션트)');
    const hs=comps.find(c=>cat(c)==='Q'&&c.pads.filter(p=>p.net&&B.netClass&&B.netClass(p.net)==='전원').length>=2);
    add('cutoff2','C',hs?'ok':'err','이중 차단 (상위 전원 스위치)',hs?`하이사이드 스위치 ${hs.ref} ${hs.val}`:'드라이버 EN 외에 모터/부하 전원을 끊는 2차 경로(하이사이드 FET·릴레이)가 없습니다.','1단계 safety apply (cutoff2 → hs_switch)');}
  else{add('drv_fault','B','na','드라이버 fault 리드백','드라이버 IC 없음');add('cutoff2','C','na','이중 차단','구동 출력 없음');}
  // communication
  const xcv=comps.filter(c=>cat(c)==='XCVR');if(xcv.length)add('can_tx','B',xcv.some(c=>/TJA10|TLE92|MCP25|SN65HVD23|TCAN/.test(T(c)))?'ok':'info','버스 트랜시버 진단',`${xcv.map(c=>c.ref+' '+c.val).join(', ')} — TXD 도미넌트 타임아웃·버스 폴트 진단 내장 여부 확인, E2E 보호는 SW`,'');
  // sensors: redundancy (two sensor-class signals or arch blocks)
  const sensorBlocks=A?A.blocks.filter(b=>/센서|sensor|감지|encoder|hall|홀/i.test(b.label+' '+b.feats.join(' '))):[];const adcNets=mcu?mcu.pads.filter(p=>/AN\d|ADC|AIN/i.test(p.fn||'')&&p.net).length:0;
  add('sensor_red','C',sensorBlocks.length>=2||adcNets>=2?'ok':'warn','센서 리던던시',sensorBlocks.length>=2?`센서 블록 ${sensorBlocks.map(b=>b.label).join(', ')}`:adcNets>=2?`아날로그 입력 ${adcNets}채널 (교차 검증 가능)`:'안전 관련 센서가 한 경로뿐입니다.','1단계 safety apply (sensor_red)');
  // connector: a high-voltage power pin next to a safety/signal pin
  conns.forEach(c=>{const ps=c.pads.slice().sort((a,b)=>+a.n-+b.n);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];const va=a.net&&B.netClass&&B.netClass(a.net)==='전원'?SAFETYnomV(a.net):0,vb=b.net&&B.netClass&&B.netClass(b.net)==='전원'?SAFETYnomV(b.net):0;
    if((va>=12&&b.net&&!vb&&mcuNets.has(b.net))||(vb>=12&&a.net&&!va&&mcuNets.has(a.net)))add('conn_adj','B','warn','커넥터 핀 분리',`${c.ref} 핀 ${a.n}(${a.net}) · ${b.n}(${b.net}) — 고전압 전원 옆에 신호 핀: 인접 핀 단락 시 신호가 BAT로 묶입니다.`,'핀 배치 변경 또는 사이에 GND 핀');}});
  // clock monitor / crystal (D)
  add('clk','D',comps.some(c=>cat(c)==='Y')?'info':'na','클럭 감시',comps.some(c=>cat(c)==='Y')?'외부 크리스털 있음 — MCU 클럭 감시(CSS/CLK monitor) 활성화 필요(SW)':'');
  return{level:lv,checks:out,mcu:mcu?mcu.ref:null};}
const SAFETYparseVal=s=>{if(typeof SIM!=='undefined'&&SIM.parseVal)return SIM.parseVal(s);const m=String(s||'').match(/^\s*([\d.]+)\s*([munpkMG]?)/);if(!m)return NaN;return parseFloat(m[1])*({m:1e-3,u:1e-6,n:1e-9,p:1e-12,k:1e3,M:1e6,G:1e9}[m[2]]||1);};
const SAFETYnomV=n=>typeof SIM!=='undefined'&&SIM.nominalV?SIM.nominalV(n):0;
/* ---------- FMEDA (rough): FIT per part class, diagnostic coverage from the mechanisms found on the board ---------- */
function fmeda(B,opt){opt=opt||{};const R=circuitChecks(B,opt);const lv=R.level;const ok=id=>R.checks.some(c=>c.id===id&&c.sev==='ok');
  const dc={mcu:ok('wdt_qa')?99:ok('wdt')?90:60,power:ok('supervisor')?90:0,driver:ok('cutoff2')?99:ok('drv_fault')&&ok('isense')?90:ok('drv_en')?60:0,comm:ok('can_tx')?60:0,conn:ok('conn_adj')?60:30,sensor:ok('sensor_red')?99:60,signal:0,other:0};
  const rows=B.comps.filter(c=>cat(c)!=='TP'&&cat(c)!=='M').map(c=>{const k=cat(c);const fit=k==='J'?FIT.J*c.pads.length:FIT[k]!=null?FIT[k]:FIT.X;const cls=partClass(c,B);const d=dc[cls]||0;const sr=cls!=='other'&&cls!=='signal'||/^(U|Q)/.test(c.ref);
    return{ref:c.ref,val:c.val,cat:k,cls,fit,sr,dc:sr?d:0,res:sr?fit*(1-d/100):0,mech:sr?(cls==='mcu'?(ok('wdt_qa')?'SBC Q&A WDT':ok('wdt')?'외부 WDT':'내부 WDT'):cls==='power'?(ok('supervisor')?'전원 감시':'—'):cls==='driver'?(ok('cutoff2')?'이중 차단':ok('drv_fault')?'fault·전류 리드백':ok('drv_en')?'EN 차단':'—'):cls==='sensor'?'ADC 진단':cls==='conn'?'open/short 진단':'—'):'—'};});
  const tot=rows.reduce((a,r)=>a+r.fit,0),srTot=rows.filter(r=>r.sr).reduce((a,r)=>a+r.fit,0),res=rows.reduce((a,r)=>a+r.res,0);
  const spfm=srTot?100*(1-res/srTot):100;const lfm=Math.min(99,Math.max(0,spfm-10));const pmhf=res;const t=TARGETS[lv];
  const verdict=[];if(t.spfm!=null)verdict.push({k:'SPFM',v:spfm,target:t.spfm,ok:spfm>=t.spfm});if(t.lfm!=null)verdict.push({k:'LFM',v:lfm,target:t.lfm,ok:lfm>=t.lfm});if(t.pmhf!=null)verdict.push({k:'PMHF',v:pmhf,target:t.pmhf,ok:pmhf<=t.pmhf});
  return{level:lv,rows,total:tot,srTotal:srTot,residual:res,spfm,lfm,pmhf,targets:t,verdict,dc};}
function fmedaAoa(F){return[['참조','값','분류','영향 영역','FIT','안전 관련','진단 메커니즘','DC %','잔류 FIT'],...F.rows.map(r=>[r.ref,r.val,r.cat,r.cls,r.fit,r.sr?'Y':'',r.mech,r.sr?r.dc:'',+r.res.toFixed(2)]),[],['합계','','','',+F.total.toFixed(1),'','','',+F.residual.toFixed(2)],['안전 관련 FIT',+F.srTotal.toFixed(1)],['SPFM %',+F.spfm.toFixed(1),'목표',F.targets.spfm!=null?F.targets.spfm:'-'],['LFM % (추정)',+F.lfm.toFixed(1),'목표',F.targets.lfm!=null?F.targets.lfm:'-'],['PMHF FIT',+F.pmhf.toFixed(1),'목표 <',F.targets.pmhf!=null?F.targets.pmhf:'-']];}
function circuitText(B,opt){const R=circuitChecks(B,opt);const F=fmeda(B,opt);const n=s=>R.checks.filter(c=>c.sev===s).length;
  return`[기능 안전 점검] ASIL ${R.level}${R.mcu?' · MCU '+R.mcu:''} · 오류 ${n('err')} · 경고 ${n('warn')} · 양호 ${n('ok')} · 해당 없음 ${n('na')}\n`+R.checks.filter(c=>c.sev!=='na').map(c=>`${c.sev==='err'?'!!':c.sev==='warn'?'!':c.sev==='info'?'·':'✓'} [${c.min}+] ${c.label}: ${c.msg}${c.fix&&c.sev!=='ok'?` → ${c.fix}`:''}`).join('\n')+
  `\n[FMEDA 추정] 부품 ${F.rows.length} · 총 ${F.total.toFixed(1)} FIT · 안전 관련 ${F.srTotal.toFixed(1)} FIT · 잔류 ${F.residual.toFixed(1)} FIT → SPFM ${F.spfm.toFixed(1)} %${F.targets.spfm!=null?` (목표 ≥ ${F.targets.spfm})`:''} · PMHF ${F.pmhf.toFixed(1)} FIT${F.targets.pmhf!=null?` (목표 < ${F.targets.pmhf})`:''}${F.verdict.length?' · '+F.verdict.map(v=>`${v.k} ${v.ok?'충족':'미달'}`).join(', '):''}\n(FIT는 부품 등급 기본값, DC는 발견된 메커니즘 기준 가정 — 실제 FMEDA는 부품 데이터시트·고장 모드 분포로 다시 계산)`;}
return{LEVELS,rank,norm,parseLevel,TARGETS,MECH,FIT,level,blockLevel,mechanisms,boundaries,apply,archText,cat,partClass,circuitChecks,fmeda,fmedaAoa,circuitText};
})();
if(typeof module!=='undefined')module.exports=SAFETY;
