/* PCB / circuit design guidelines: weighted rules with P0–P3 priority, domain presets and a compliance score
   (after the "PCB 통합 설계 가이드라인 & Datasheet 우선순위 선정기"). Every rule is checked deterministically from the
   board (and the schematic for circuit rules) where the data allows; rules the data cannot settle come back as
   'manual' and can be decided by the user or the AI reviewer with set(). Needs PCB, PCBEDIT, AUTOPLACE, EMC, SIM, SCHEDIT. */
const GUIDE=(function(){
"use strict";
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(String(n||'').replace(/^\//,''));
const RULES=[
  {key:'ds_footprint',scope:'pcb',cat:'Datasheet',w:10,title:'부품 Datasheet 권장 Land Pattern & Keep-out 100% 일치',desc:'패드 치수, NSMD/SMD 여부, 크리스털/인덕터 하부 동박 금지 구역(Keep-out)을 제조사 도면 기준으로 검증',ref:"Datasheet 'Package Dimensions' & 'Recommended Land Pattern'"},
  {key:'ds_thermal_pad',scope:'pcb',cat:'Datasheet',w:9,title:'Exposed Thermal Pad 방열 비아 및 솔더 개구율(40~60%) 설계',desc:'MCU/드라이버/FET 하부 방열 패드의 Thermal Via 피치 준수 및 메탈마스크 분할(Window Pane) 적용',ref:"Datasheet 'Thermal Pad Layout & Stencil Design'"},
  {key:'rt_return_path',scope:'pcb',cat:'배선',w:10,title:'고속/클록 신호의 Solid GND 반환 경로(Return Path) 확보',desc:'신호선 하부 GND 플레인 분할선(Split) 횡단 금지 및 레이어 변경 시 인접 GND 스티칭 비아 배치',ref:'SI/EMC 핵심 기본 규칙 (루프 인덕턴스 최소화)'},
  {key:'pl_sw_loop',scope:'pcb',cat:'배치',w:10,title:'스위칭 전원(SMPS) 및 인버터 브릿지 Hot-Loop 면적 극소화',desc:'고주파 di/dt가 흐르는 입력 캡-스위칭 소자-GND 루프를 최단 거리 및 폴리곤으로 직결',ref:"PMIC/Gate Driver Datasheet 'PCB Layout Guidelines'"},
  {key:'ds_kelvin',scope:'pcb',cat:'Datasheet',w:9,title:'션트 저항 4단자 켈빈 연결(Kelvin Sense) 및 차동 배선',desc:'전류 센싱 패드 내부 인출 및 CSA 입력단까지 대칭 차동 라우팅 적용',ref:"Current Sense Amp / Motor Driver Datasheet 'Shunt Layout'"},
  {key:'pl_decoupling',scope:'pcb',cat:'배치',w:9,title:'디커플링 커패시터 IC 핀 최단 배치 및 순서 준수',desc:'전원 소스 → 커패시터 패드 → IC 핀 순서로 배선하며 소용량(100nF)을 핀에 가장 가깝게 배치',ref:"MCU Hardware Design Guide 'Power Supply Decoupling'"},
  {key:'pw_solid_gnd',scope:'pcb',cat:'전원/접지',w:9,title:'단절 없는 연속 Solid GND 플레인 및 AGND/DGND 단일점 연결',desc:'비아 밀집 구간으로 인한 GND 단절(Slot) 방지 및 아날로그/디지털 접지 간섭 분리',ref:"ADC/MCU Datasheet 'Grounding & Partitioning'"},
  {key:'pl_esd_tvs',scope:'pcb',cat:'배치',w:8,title:'커넥터 인입부 TVS/ESD 보호소자 최우선 관통(Feed-through) 배치',desc:'외부 서지가 내부 회로로 진입하기 전 커넥터 핀 직후방에서 TVS 패드를 관통하도록 라우팅',ref:'TVS Diode / Transceiver Application Note'},
  {key:'rt_diff_pair',scope:'pcb',cat:'배선',w:8,title:'통신 차동 페어(CAN/USB/Ethernet) 임피던스 및 대칭 매칭',desc:'120Ω/100Ω/90Ω 특성 임피던스 선폭 유지, 스큐 보정 및 CMC/종단 저항 대칭 배치',ref:"Transceiver Datasheet 'Bus Pin Routing'"},
  {key:'pw_via_amp',scope:'pcb',cat:'전원/접지',w:8,title:'대전류 라인 선폭(IPC-2152) 및 병렬 비아 허용 전류 확보',desc:'전류 용량에 맞는 Copper Pour 폭 확보 및 레이어 전환 시 복수 비아 병렬 타공',ref:'IPC-2152 전류-온도 상승 차트'},
  {key:'rt_3w',scope:'pcb',cat:'배선',w:7,title:'신호선 간 누화 방지 3W / 5W 이격 규칙',desc:'인접 신호 중심 간격을 선폭의 3배 이상(클록·스위칭 노드는 5배 이상) 확보',ref:'High-Speed Layout Guidelines'},
  {key:'rt_priority',scope:'pcb',cat:'배선',w:8,title:'배선 우선순위: 대전류 전원·구동 → 고속·클록·차동 → 민감 아날로그 → 일반 디지털',desc:'핵심 신호 경로를 먼저 최단으로 확보하고 일반 디지털은 남은 공간에 — 고속·아날로그 넷이 전원·구동 넷보다 길게 돌아가지 않도록',ref:'ECU Layout Practice (routing priority)'},
  {key:'rt_return_via',scope:'pcb',cat:'배선',w:8,title:'고속·아날로그 신호 비아 옆 GND 리턴 비아',desc:'층을 바꾸는 신호 비아 1 mm 이내에 GND 비아를 두어 귀환 전류 연속성 확보 · 고속 신호의 비아 수 최소화',ref:'High-Speed Layout Guidelines (return path)'},
  {key:'rt_edge_keepout',scope:'pcb',cat:'배선',w:6,title:'보드 외곽 2 mm 띠에 고속 신호 배선 금지',desc:'가장자리 방사 EMI 저감 — 클록·차동·고속 신호는 외곽 띠를 피해 안쪽으로',ref:'EMC Design Guide (edge radiation)'},
  {key:'pw_agnd_star',scope:'pcb',cat:'전원/접지',w:8,title:'아날로그·디지털(스위칭) 영역 분리와 단일점(Star) 접지',desc:'센서·ADC 부품 영역과 모터/스위칭 영역을 떨어뜨리고, AGND가 있으면 전원부 인근 한 점에서만 GND와 연결',ref:"ADC/Sensor Datasheet 'Grounding & Partitioning'"},
  {key:'th_via_array',scope:'pcb',cat:'열',w:7,title:'발열 소자 하단 써멀 비아 어레이',desc:'노출 패드 아래 비아 배열로 내층·바닥 동박(및 하우징 열보스)으로 방열',ref:"Power IC Datasheet 'Thermal Considerations'"},
  {key:'rt_45deg',scope:'pcb',cat:'배선',w:6,title:'45도 절곡 또는 Arc 라우팅 및 DFM 클리어런스 준수',desc:'90도 직각 배선 배제, 보드 외곽 이격 및 솔더마스크 댐(4mil 이상) 확보',ref:'PCB 제조사 표준 DFM 룰'},
  // circuit (schematic) rules
  {key:'sch_decap',scope:'sch',cat:'회로',w:9,title:'IC 전원 레일마다 디커플링 커패시터(≤1µF) 연결',desc:'각 IC가 쓰는 전원 레일마다 GND로 가는 소용량 캡이 있는지',ref:"MCU/IC Datasheet 'Power Supply Decoupling'"},
  {key:'sch_bulk',scope:'sch',cat:'회로',w:7,title:'레귤레이터 입력·출력 벌크 커패시터',desc:'LDO/DC-DC의 VIN·VOUT 넷에 데이터시트 최소 용량(≥1µF) 캡',ref:"Regulator Datasheet 'Input/Output Capacitor'"},
  {key:'sch_xtal',scope:'sch',cat:'회로',w:8,title:'크리스털 부하 커패시터(C_L) 연결',desc:'크리스털 두 단자에 각각 GND로 가는 부하 캡',ref:"Crystal Datasheet 'Load Capacitance'"},
  {key:'sch_tvs',scope:'sch',cat:'회로',w:8,title:'외부 커넥터 신호의 TVS/ESD 보호',desc:'커넥터로 나가는 신호 넷마다 TVS/ESD 다이오드',ref:'TVS / ESD Application Note'},
  {key:'sch_can_term',scope:'sch',cat:'회로',w:7,title:'CAN 버스 종단(120Ω 또는 60Ω+60Ω 스플릿 + 4.7nF)',desc:'CANH–CANL 사이 종단 또는 스플릿 종단 (하네스 끝단이면 해당 없음)',ref:"CAN Transceiver Datasheet 'Bus Termination'"},
  {key:'sch_reset',scope:'sch',cat:'회로',w:6,title:'리셋 핀 풀업',desc:'NRST/PORST/RESET 넷에 전원으로 가는 풀업 저항',ref:"MCU Datasheet 'Reset Circuit'"},
  {key:'sch_erc',scope:'sch',cat:'회로',w:8,title:'ERC 0건 (미연결 핀은 NC 표시)',desc:'떠 있는 배선, 연결 안 된 핀, 핀 없는 라벨이 없는지',ref:'KiCad ERC'}];
const PRESETS={
  default:{label:'표준 밸런스',w:{rt_priority:8,rt_return_via:8,rt_edge_keepout:6,pw_agnd_star:8,th_via_array:7,ds_footprint:10,ds_thermal_pad:9,rt_return_path:10,pl_sw_loop:10,ds_kelvin:9,pl_decoupling:9,pw_solid_gnd:9,pl_esd_tvs:8,rt_diff_pair:8,pw_via_amp:8,rt_3w:7,rt_45deg:6,sch_decap:9,sch_bulk:7,sch_xtal:8,sch_tvs:8,sch_can_term:7,sch_reset:6,sch_erc:8}},
  motor:{label:'BLDC/인버터 구동 (대전류/방열)',w:{rt_priority:9,rt_return_via:7,rt_edge_keepout:6,pw_agnd_star:9,th_via_array:10,ds_footprint:10,ds_thermal_pad:10,rt_return_path:9,pl_sw_loop:10,ds_kelvin:10,pl_decoupling:9,pw_solid_gnd:9,pl_esd_tvs:8,rt_diff_pair:7,pw_via_amp:10,rt_3w:7,rt_45deg:6,sch_decap:9,sch_bulk:10,sch_xtal:7,sch_tvs:8,sch_can_term:7,sch_reset:6,sch_erc:8}},
  ecu:{label:'전장 ECU (CISPR 25/EMC/신뢰성)',w:{rt_priority:9,rt_return_via:9,rt_edge_keepout:8,pw_agnd_star:9,th_via_array:8,ds_footprint:10,ds_thermal_pad:9,rt_return_path:10,pl_sw_loop:10,ds_kelvin:9,pl_decoupling:10,pw_solid_gnd:10,pl_esd_tvs:10,rt_diff_pair:9,pw_via_amp:8,rt_3w:9,rt_45deg:7,sch_decap:10,sch_bulk:8,sch_xtal:8,sch_tvs:10,sch_can_term:9,sch_reset:7,sch_erc:9}},
  highspeed:{label:'고속 신호 (SI/임피던스)',w:{rt_priority:9,rt_return_via:10,rt_edge_keepout:8,pw_agnd_star:7,th_via_array:6,ds_footprint:10,ds_thermal_pad:7,rt_return_path:10,pl_sw_loop:8,ds_kelvin:6,pl_decoupling:9,pw_solid_gnd:10,pl_esd_tvs:8,rt_diff_pair:10,pw_via_amp:7,rt_3w:10,rt_45deg:8,sch_decap:10,sch_bulk:7,sch_xtal:9,sch_tvs:8,sch_can_term:8,sch_reset:6,sch_erc:8}}};
const PRESET_ALIAS={default:'default',standard:'default','표준':'default',motor:'motor',motorpower:'motor',bldc:'motor',inverter:'motor','모터':'motor','인버터':'motor',
  ecu:'ecu',automotive:'ecu',automotiveemc:'ecu',emc:'ecu','전장':'ecu',highspeed:'highspeed',hs:'highspeed',si:'highspeed','고속':'highspeed'};
const presetKey=s=>PRESET_ALIAS[String(s||'').toLowerCase().replace(/[\s_-]/g,'')]||null;
function prio(w){return w>=9?{tier:0,label:'P0 (최우선)'}:w>=8?{tier:1,label:'P1 (핵심)'}:w>=6?{tier:2,label:'P2 (권장)'}:{tier:3,label:'P3 (일반)'};}
// per-board state: preset, weights, manual decisions
function state(B){if(!B.guide)B.guide={preset:'default',w:Object.assign({},PRESETS.default.w),over:{}};return B.guide;}
function setPreset(B,k){const key=presetKey(k);if(!key)throw new Error('프리셋: default · motor · ecu · highspeed');const g=state(B);g.preset=key;g.w=Object.assign({},PRESETS[key].w);return key;}
function setWeight(B,key,w){if(!RULES.find(r=>r.key===key))throw new Error('알 수 없는 규칙: '+key);const g=state(B);g.w[key]=Math.max(1,Math.min(10,Math.round(+w)||1));return g.w[key];}
function set(B,key,status,note,by){if(!RULES.find(r=>r.key===key))throw new Error('알 수 없는 규칙: '+key);const g=state(B);
  if(status==='auto'||status==null){delete g.over[key];return null;}if(!/^(pass|fail|na)$/.test(status))throw new Error('상태는 pass · fail · na · auto');
  g.over[key]={status,note:note||'',by:by||'user'};return g.over[key];}

/* ---- helpers ---- */
const parseR=v=>{const s=String(v||'').replace(/Ω|ohm/gi,'').trim();let m=s.match(/^(\d+)[Rr](\d+)$/);if(m)return parseFloat(m[1]+'.'+m[2]);m=s.match(/^(\d+(?:\.\d+)?)\s*([mkM])?/);if(!m)return null;return parseFloat(m[1])*({m:1e-3,k:1e3,M:1e6}[m[2]]||1);};
const parseC=v=>{const m=String(v||'').replace(/[µμ]/g,'u').match(/(\d+(?:\.\d+)?)\s*([pnu])?F?/i);if(!m)return null;return parseFloat(m[1])*({p:1e-12,n:1e-9,u:1e-6}[(m[2]||'').toLowerCase()]||1e-6);};
const isTVS=c=>/^D/i.test(c.ref)&&/TVS|ESD|PESD|SMBJ|SMAJ|SMF|TPD|PRTR|NUP|CDSOT|SP05|ESDA|SM712|NUP2105|PESD1CAN/i.test((c.val||'')+' '+(c.mpn||''));
const isConn=c=>/^(J|P|CN|X|USB|CON)\d/i.test(c.ref)||/^(usb|hdr|conn)$/.test(c.kind||'');
const segsOf=(B,L)=>{const o=[];B.layers[L+'.cu'].forEach(p=>{if(p.t==='seg')o.push({a:p.a,b:p.b,w:p.w,net:p.net,p});else if(p.t==='path')for(let i=1;i<p.pts.length;i++)o.push({a:p.pts[i-1],b:p.pts[i],w:p.w,net:p.net,p,i});});return o;};
const len=s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);
// a netlist view shared by board and schematic: parts with pins → nets
function partsOf(B,sheets){
  if(sheets&&typeof SCHEDIT!=='undefined'){const nl=SCHEDIT.netlist(sheets,B).pinNet;const map=new Map();
    sheets.forEach(sh=>sh.symbols.forEach(s=>{if(s.power)return;const o=map.get(s.ref)||{ref:s.ref,val:s.val||'',mpn:'',kind:s.kind||(B.byRef[s.ref]&&B.byRef[s.ref].kind)||'',pins:[]};
      s.pins.forEach(p=>o.pins.push({num:String(p.num),name:p.name||'',net:nl.get(s.ref+'.'+p.num)||null}));map.set(s.ref,o);}));return[...map.values()];}
  return B.comps.filter(c=>c.pads.length).map(c=>{const seen=new Set();return{ref:c.ref,val:c.val||'',mpn:c.mpn||'',kind:c.kind||'',pins:c.pads.filter(p=>{const k=p.n;if(seen.has(k))return false;seen.add(k);return true;}).map(p=>({num:String(p.n),name:p.fn||'',net:p.net||null}))};});}
function netsOf(parts){const N=new Map();parts.forEach(c=>c.pins.forEach(p=>{if(!p.net)return;if(!N.has(p.net))N.set(p.net,[]);N.get(p.net).push({c,p});}));return N;}
const cls=(B,n)=>B.netClass?B.netClass(n):isGnd(n)?'접지':'신호';

/* ---- rule checks: {status, score (0..1), ev (evidence), fix} ---- */
function checkPcb(B,key,X){
  const R=X.emc,M=X.met;
  switch(key){
    case'ds_footprint':{const noFp=B.comps.filter(c=>c.pads.length&&c.kind!=='none'&&!c.fp).map(c=>c.ref);const court=X.drc.filter(d=>d.code==='courtyard');
      const keep=[];B.comps.filter(c=>c.kind==='xtal'||/^(Y|L)\d/i.test(c.ref)).forEach(c=>{const own=new Set(c.pads.map(p=>p.net));const b=c.bb;
        segsOf(B,c.side).forEach(s=>{if(!s.net||own.has(s.net)||isGnd(s.net))return;const x0=Math.min(s.a[0],s.b[0]),x1=Math.max(s.a[0],s.b[0]),y0=Math.min(s.a[1],s.b[1]),y1=Math.max(s.a[1],s.b[1]);if(x0<b[2]&&b[0]<x1&&y0<b[3]&&b[1]<y1&&!keep.includes(c.ref+'←'+s.net))keep.push(c.ref+'←'+s.net);});});
      const n=noFp.length+court.length+keep.length;const tot=Math.max(1,B.comps.length);
      return{status:n?'fail':'pass',score:Math.max(0,1-n/tot*3),ev:`풋프린트 없음 ${noFp.length}${noFp.length?' ('+noFp.slice(0,5).join(', ')+')':''} · 부품 영역 겹침 ${court.length} · 크리스털/인덕터 하부 다른 넷 동박 ${keep.length}${keep.length?' ('+keep.slice(0,4).join(', ')+')':''}`,fix:n?'라이브러리 풋프린트 지정, 겹침 해소, 크리스털·인덕터 아래로 지나는 트랙 우회':'',manualNote:'패드 치수·NSMD 여부는 데이터시트 도면과 직접 대조 필요'};}
    case'ds_thermal_pad':{const eps=[];B.comps.forEach(c=>{if(c.pads.length<8)return;const cx=(c.bb[0]+c.bb[2])/2,cy=(c.bb[1]+c.bb[3])/2;c.pads.forEach(p=>{if(p.w*p.h<4||Math.hypot(p.x-cx,p.y-cy)>Math.min(c.bb[2]-c.bb[0],c.bb[3]-c.bb[1])*0.3)return;
        const a=-(p.ang||0)*Math.PI/180;const inPad=v=>{const dx=v.x-p.x,dy=v.y-p.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);return Math.abs(lx)<=p.w/2&&Math.abs(ly)<=p.h/2;};
        const n=B.vias.filter(inPad).length;const need=Math.max(2,Math.floor((p.w-0.6)/1.2+1)*Math.floor((p.h-0.6)/1.2+1));eps.push({ref:c.ref,n,need:Math.max(2,Math.round(need*0.5)),full:need});});});
      if(!eps.length)return{status:'na',ev:'노출(방열) 패드가 있는 패키지 없음'};
      const sc=eps.reduce((s,e)=>s+Math.min(1,e.n/e.need),0)/eps.length;
      return{status:sc>=0.999?'pass':sc>=0.5?'partial':'fail',score:sc,ev:eps.map(e=>`${e.ref} 방열 비아 ${e.n}/${e.full}(최소 ${e.need})`).join(' · ')+' · 솔더 페이스트 분할은 보드 데이터에 없어 미확인',fix:sc<1?'노출 패드 안에 0.3 mm 비아를 1.0–1.2 mm 피치로 배열 (route --strategy thermal은 자동으로 넣음)':'',manualNote:'메탈마스크 40~60% 분할 개구율은 스텐실 설계에서 확인'};}
    case'rt_return_path':{if(X.plane)return{status:'pass',score:1,ev:`${X.plane.n}층 스택업 · 내층 ${X.plane.net} 플레인(L${X.plane.idx}) — 신호층마다 인접 기준면이 있어 귀환 경로가 끊기지 않음`};if(!X.pour)return{status:'fail',score:0,ev:'GND 동박면(기준면)이 없음',fix:'하단 전면 GND 동박면을 깔고 신호는 상단에 배선'};
      const n=R?R.slots.length:0;return{status:n===0?'pass':n<=5?'partial':'fail',score:n===0?1:n<=5?0.5:0.1,ev:`신호선이 기준면을 끊는 반대층 트랙을 건너는 곳 ${n}곳${n?' ('+[...new Set(R.slots.map(s=>s.net))].slice(0,4).join(', ')+')':''}`,fix:n?'반대층(GND면 층) 트랙을 짧게 하거나 신호를 우회, 레이어 변경 지점 옆 GND 스티칭 비아':''};}
    case'pl_sw_loop':{if(!R||!R.ps.drivers.length)return{status:'na',ev:'스위칭 파워 스테이지(드라이버·하프브리지) 없음'};
      if(!R.ps.loops.length)return{status:'fail',score:0,ev:`${R.ps.vmNet}–GND DC-Link 캡 없음`,fix:'VM 핀 옆에 0.1 µF MLCC + 벌크 캡'};
      const L=R.ps.Lbest;return{status:L<5?'pass':L<15?'partial':'fail',score:L<5?1:L<15?0.5:0.1,ev:`Hot-loop 인덕턴스 ${L.toFixed(1)} nH (${R.ps.loops[0].cap}, ${R.ps.loops[0].lf.toFixed(1)} mm)`,fix:L<5?'':'VM·PGND 핀에 MLCC를 1–2 mm 이내로, GND 비아를 패드 바로 옆에 (place --strategy noise)'};}
    case'ds_kelvin':{const sh=B.comps.filter(c=>/^R/i.test(c.ref)&&((parseR(c.val)!=null&&parseR(c.val)<=0.1)||/SHUNT/i.test(c.val+' '+(c.mpn||''))));
      if(!sh.length)return{status:'na',ev:'션트 저항(≤0.1 Ω) 없음'};
      const four=sh.filter(c=>new Set(c.pads.map(p=>p.n)).size>=4);
      return four.length===sh.length?{status:'pass',score:1,ev:`4단자 션트 ${four.map(c=>c.ref).join(', ')}`}:{status:'manual',ev:`2단자 션트 ${sh.filter(c=>!four.includes(c)).map(c=>c.ref+' '+c.val).join(', ')} — 패드 안쪽 센스선 인출 여부는 동박 형상으로만 판단 가능`,fix:'4단자(켈빈) 풋프린트로 바꾸거나 패드 안쪽에서 센스선을 차동으로 인출'};}
    case'pl_decoupling':{const d=M.decap;const ics=B.comps.filter(c=>/^U/i.test(c.ref)&&c.pads.length>=4);
      if(!d.length)return ics.length?{status:'fail',score:0,ev:'IC 전원 핀용 소용량 디커플링 캡이 없음',fix:'IC 전원 핀마다 100 nF'}:{status:'na',ev:'IC 없음'};
      const ok=d.filter(x=>x.d<=3).length;const sc=ok/d.length;const far=d.filter(x=>x.d>3).sort((a,b)=>b.d-a.d);
      return{status:sc>=0.999?'pass':sc>=0.5?'partial':'fail',score:sc,ev:`캡–전원 핀 3 mm 이내 ${ok}/${d.length} · 평균 ${M.decapAvg.toFixed(1)} mm${far.length?' · 먼 캡 '+far.slice(0,4).map(x=>`${x.ref}→${x.to} ${x.d.toFixed(1)} mm`).join(', '):''}`,fix:far.length?'먼 캡을 해당 IC 전원 핀 옆으로 (place --strategy noise 또는 move)':''};}
    case'pw_solid_gnd':{if(X.plane)return{status:'pass',score:1,ev:`내층 ${X.plane.net} 플레인 L${X.plane.idx} (${PCB.cuName(X.plane.layer)}) — 트랙 없는 전면 동박`};if(!X.pour)return{status:'fail',score:0,ev:'GND 동박면 없음',fix:'하단 전면 GND 동박면'};
      const L=X.pour.layer;let cut=0;segsOf(B,L).forEach(s=>{if(s.net&&!isGnd(s.net))cut+=len(s);});const ratio=cut/(B.W+B.H);const slots=R?R.slots.length:0;
      const split=Object.keys(B.nets).filter(n=>/^(AGND|DGND|PGND|GNDA|GNDD)$/i.test(n));
      const sc=ratio<0.5&&!slots?1:ratio<2?0.5:0.15;
      return{status:sc===1?'pass':sc>=0.5?'partial':'fail',score:sc,ev:`${X.pour.net} 동박면 ${L==='B'?'하단':'상단'} · 같은 층 다른 넷 트랙 ${cut.toFixed(0)} mm (보드 둘레 반의 ${(ratio*100).toFixed(0)}%) · 기준면 횡단 ${slots}곳${split.length?' · 분리 접지 넷 '+split.join(', ')+' (단일점 연결은 수동 확인)':''}`,fix:sc<1?'동박면 층의 트랙을 줄이고(route --strategy noise는 하단 사용을 억제) 짧은 점퍼만 남기기':''};}
    case'pl_esd_tvs':{const parts=partsOf(B);const tvs=B.comps.filter(isTVS);const sw=new Set(X.emc?X.emc.ps.switchNets:[]);const ext=[];B.comps.filter(isConn).forEach(c=>c.pads.forEach(p=>{if(p.net&&cls(B,p.net)==='신호'&&!sw.has(p.net)&&!/SWD|SWCLK|TMS|TCK|TDI|TDO|DBG_|JTAG|DAP/i.test(p.net)&&!ext.some(e=>e.net===p.net))ext.push({net:p.net,c,p});}));void parts;
      if(!ext.length)return{status:'na',ev:'외부 커넥터 신호 없음'};
      const prot=ext.filter(e=>tvs.some(t=>t.pads.some(q=>q.net===e.net)&&Math.hypot(t.x-e.p.x,t.y-e.p.y)<12));
      const sc=prot.length/ext.length;const miss=ext.filter(e=>!prot.includes(e));
      return{status:sc>=0.999?'pass':sc>0?'partial':'fail',score:sc,ev:`커넥터 신호 ${ext.length}개 중 TVS로 보호 ${prot.length}개${miss.length?' · 보호 없음: '+miss.slice(0,8).map(e=>e.net).join(', '):''}`,fix:miss.length?'회로도 CLI에서 커넥터 옆 TVS/ESD 다이오드 추가 후 커넥터 핀 → TVS 패드 → 내부 순서로 관통 배선':''};}
    case'rt_diff_pair':{const pairs=[];const base={};Object.keys(B.nets).forEach(n=>{const m=n.match(/^(.*?)(_?D[PM]|_?[PN]|[+-]|H|L)$/i);if(!m||!/CAN|USB|ETH|LVDS|_D|RS485|[+-]$/i.test(n))return;const k=m[1]+'|'+(/^(_?DP|_?P|\+|H)$/i.test(m[2])?'P':'N');base[k]=n;});
      Object.keys(base).forEach(k=>{if(!k.endsWith('|P'))return;const nk=k.replace(/\|P$/,'|N');if(base[nk])pairs.push([base[k],base[nk]]);});
      if(!pairs.length)return{status:'na',ev:'차동 쌍(CAN/USB/Ethernet) 없음'};
      const L=n=>{const N=B.nets[n];return N?Object.values(N.len).reduce((a,v)=>a+(v||0),0):0;};const rows=pairs.map(([p,n])=>{const a=L(p),b=L(n);const mis=Math.abs(a-b),r=Math.max(a,b)?mis/Math.max(a,b):0;return{p,n,a,b,mis,ok:a>0&&b>0&&(mis<=2||r<=0.1)};});
      const sc=rows.filter(r=>r.ok).length/rows.length;
      return{status:sc>=0.999?'pass':sc>0?'partial':'fail',score:sc,ev:rows.map(r=>`${r.p}/${r.n} ${r.a.toFixed(1)}/${r.b.toFixed(1)} mm (차 ${r.mis.toFixed(1)})${r.a&&r.b?'':' 미배선'}`).join(' · ')+' · 차동 임피던스는 SI 시뮬레이션에서 확인',fix:sc<1?'두 선을 같은 층에서 나란히, 길이 차 10% 이내로 (트롬본/우회)':'',manualNote:'CMC·종단 대칭 배치는 육안 확인'};}
    case'pw_via_amp':{const fine=[];B.comps.forEach(c=>c.pads.forEach(p=>{if(Math.min(p.w,p.h)<0.36)fine.push(p);}));const nearFine=q=>fine.some(p=>Math.hypot(p.x-q[0],p.y-q[1])<1.2);
      let wmin=1e9,thin=[];const lay={};PCB.cuKeys(B).forEach(L=>segsOf(B,L).forEach(s=>{if(!s.net||cls(B,s.net)!=='전원'||/MON|SENSE|SNS|ADC|REF/i.test(s.net))return;(lay[s.net]=lay[s.net]||new Set()).add(L);if(nearFine(s.a)||nearFine(s.b))return;if(s.w<wmin)wmin=s.w;if(s.w<0.4&&!thin.includes(s.net))thin.push(s.net);}));
      if(wmin===1e9)return{status:'na',ev:'배선된 전원 트랙 없음 (동박면 전원만 있거나 미배선)'};
      const single=Object.keys(lay).filter(n=>lay[n].size>1&&(B.nets[n]?B.nets[n].vias.length:0)<2);
      const sc=(wmin>=0.4?1:wmin>=0.3?0.6:0.2)*(single.length?0.8:1);
      return{status:sc>=0.999?'pass':sc>=0.5?'partial':'fail',score:sc,ev:`전원 트랙 최소 폭 ${wmin.toFixed(2)} mm (미세 피치 핀 근처 넥다운 제외)${thin.length?' · 0.4 mm 미만: '+thin.slice(0,5).join(', '):''}${single.length?' · 층 전환 비아 1개뿐: '+single.join(', '):''}`,fix:sc<1?'전원 폭을 넓혀 다시 배선 (route --power 0.5), 층 전환은 비아 2개 이상 (전류는 IPC-2152 표로 확인)':'',manualNote:'실제 전류값 기준 폭은 시뮬레이션 → 전압 강하·열로 확인'};}
    case'rt_3w':{const viol=[];PCB.cuKeys(B).forEach(L=>{const ss=segsOf(B,L).filter(s=>s.net&&cls(B,s.net)==='신호'&&len(s)>1.5);
        for(let i=0;i<ss.length;i++)for(let j=i+1;j<ss.length;j++){const a=ss[i],b=ss[j];if(a.net===b.net)continue;
          const ux=(a.b[0]-a.a[0])/len(a),uy=(a.b[1]-a.a[1])/len(a),vx=(b.b[0]-b.a[0])/len(b),vy=(b.b[1]-b.a[1])/len(b);if(Math.abs(ux*vy-uy*vx)>0.17)continue;
          const d=Math.abs((b.a[0]-a.a[0])*uy-(b.a[1]-a.a[1])*ux);const w=Math.max(a.w,b.w);const t0=(b.a[0]-a.a[0])*ux+(b.a[1]-a.a[1])*uy,t1=(b.b[0]-a.a[0])*ux+(b.b[1]-a.a[1])*uy;const ov=Math.min(len(a),Math.max(t0,t1))-Math.max(0,Math.min(t0,t1));
          if(ov>2&&d<3*w){const k=[a.net,b.net].sort().join('↔');if(!viol.includes(k))viol.push(k);}}});
      const xt=R&&R.xt[0];const bad=xt&&xt.ratio>=1;const n=viol.length;
      const sc=(n===0?1:n<=3?0.6:0.2)*(bad?0.5:1);
      return{status:sc>=0.999?'pass':sc>=0.5?'partial':'fail',score:sc,ev:`중심 간격 3W 미만으로 2 mm 넘게 나란한 신호 쌍 ${n}개${n?' ('+viol.slice(0,4).join(', ')+')':''}${xt?` · 최악 누화 ${xt.aggr}→${xt.vict} ${(xt.V*1e3).toFixed(1)} mV (허용의 ${(xt.ratio*100).toFixed(0)}%)`:''}`,fix:sc<1?'평행 구간을 떼어 놓거나 사이에 GND 가드, 스위칭 노드는 5W':''};}
    case'rt_priority':{const W=typeof CURRENT!=='undefined'?CURRENT.widths(B):null;const pr=n=>AUTOROUTE.netPrio(B,n,W);const L=n=>{const N=B.nets[n];return N?Object.values(N.len).reduce((a,v)=>a+(v||0),0):0;};
      const est=n=>{const N=B.nets[n];if(!N||N.pads.length<2)return 0;const xs=N.pads.map(p=>p.x),ys=N.pads.map(p=>p.y);return (Math.max(...xs)-Math.min(...xs))+(Math.max(...ys)-Math.min(...ys));};
      const rows=Object.keys(B.nets).filter(n=>L(n)>0&&est(n)>2&&cls(B,n)!=='접지').map(n=>({n,p:pr(n),det:L(n)/Math.max(1,est(n))}));if(!rows.length)return{status:'na',ev:'배선된 넷 없음'};
      const by=[0,1,2,3].map(k=>{const r=rows.filter(x=>x.p===k);return r.length?r.reduce((a,x)=>a+x.det,0)/r.length:null;});
      const bad=rows.filter(x=>x.p<=2&&x.det>2.2).map(x=>`${x.n}(${x.det.toFixed(1)}×)`);const sc=bad.length?Math.max(0.2,1-bad.length/Math.max(1,rows.filter(x=>x.p<=2).length)):1;
      return{status:sc>=0.999?'pass':sc>=0.6?'partial':'fail',score:sc,ev:`우회율(배선/맨해튼) 평균: ${AUTOROUTE.PRIO_LABEL.map((l,i)=>`${l} ${by[i]==null?'-':by[i].toFixed(2)}`).join(' · ')}${bad.length?' · 2.2× 넘는 우선 넷: '+bad.slice(0,6).join(', '):''}`,fix:bad.length?'route 는 우선순위대로 배선합니다 — 돌아가는 우선 넷은 unroute 뒤 route --nets 로 먼저 배선하거나 부품을 가깝게 옮기세요':null,manualNote:'스택업·커넥터 위치에 따른 경로 선택은 사람이 확인'};}
    case'rt_return_via':{const W=typeof CURRENT!=='undefined'?CURRENT.widths(B):null;const gnd=Object.keys(B.nets).find(n=>/^GND$/i.test(n));const sig=B.vias.filter(v=>v.net&&v.net!==gnd&&!v.fan&&AUTOROUTE.netPrio(B,v.net,W)<=2&&!(cls(B,v.net)==='전원'));
      if(!sig.length)return{status:'na',ev:'고속·아날로그 넷의 층 전환 비아 없음'};const gv=B.vias.filter(v=>v.net===gnd);const ok=sig.filter(v=>gv.some(g=>Math.hypot(g.x-v.x,g.y-v.y)<=1.0));const sc=ok.length/sig.length;
      const perNet={};sig.forEach(v=>{perNet[v.net]=(perNet[v.net]||0)+1;});const many=Object.entries(perNet).filter(([n,k])=>k>2&&AUTOROUTE.netPrio(B,n,W)===1).map(([n,k])=>`${n} ${k}개`);
      return{status:sc>=0.999&&!many.length?'pass':sc>=0.6?'partial':'fail',score:sc*(many.length?0.8:1),ev:`신호 비아 ${sig.length}개 중 1 mm 내 GND 비아 ${ok.length}개${many.length?' · 비아 2개 초과 고속 넷: '+many.join(', '):''}`,fix:sc<1?'route 가 리턴 비아를 자동으로 둡니다 (route --retvia 0.8); 자리가 없으면 비아 주변 부품을 옮기세요':many.length?'고속 넷은 한 층으로 끝내거나 비아를 줄이세요':null};}
    case'rt_edge_keepout':{const W=typeof CURRENT!=='undefined'?CURRENT.widths(B):null;const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];const band=2;const nearEdge=p=>{let m=1e9;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const d=PCB.segDist(p[0],p[1],ring[j],ring[i]);if(d<m)m=d;}return m<band;};
      const hs=[];let tot=0;PCB.cuKeys(B).forEach(L=>segsOf(B,L).forEach(s=>{if(!s.net||AUTOROUTE.netPrio(B,s.net,W)!==1)return;tot+=len(s);if(nearEdge(s.a)||nearEdge(s.b)||nearEdge([(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2]))hs.push({n:s.net,l:len(s)});}));
      if(!tot)return{status:'na',ev:'배선된 고속 넷 없음'};const bad=hs.reduce((a,x)=>a+x.l,0);const sc=1-bad/tot;const nets=[...new Set(hs.map(x=>x.n))];
      return{status:sc>=0.98?'pass':sc>=0.85?'partial':'fail',score:sc,ev:`고속 넷 트랙 ${tot.toFixed(0)} mm 중 외곽 2 mm 띠 ${bad.toFixed(1)} mm${nets.length?' ('+nets.slice(0,5).join(', ')+')':''}`,fix:nets.length?'route 는 고속 넷에 외곽 띠 비용을 줍니다 — 커넥터 근처라 불가피하면 해당 핀을 안쪽으로 배치(move)하거나 보드를 키우세요':null};}
    case'pw_agnd_star':{const agnd=Object.keys(B.nets).find(n=>/^AGND$/i.test(n)),gnd=Object.keys(B.nets).find(n=>/^GND$/i.test(n));const W=typeof CURRENT!=='undefined'?CURRENT.widths(B):null;
      const anal=B.comps.filter(c=>c.kind!=='none'&&c.pads.some(p=>p.net&&AUTOROUTE.netPrio(B,p.net,W)===2)&&!/^(C|R)\d/.test(c.ref));const sw=new Set(X.emc?X.emc.ps.switchNets:[]);const swp=B.comps.filter(c=>c.kind!=='none'&&c.pads.some(p=>p.net&&(sw.has(p.net)||AUTOROUTE.netPrio(B,p.net,W)===0&&/PH_|OUT|MOTOR/i.test(p.net)))&&/^(U|Q)\d/.test(c.ref));
      if(!anal.length)return{status:'na',ev:'아날로그 센서·ADC 부품 없음'};
      const bb=cs=>cs.length?[Math.min(...cs.map(c=>c.bb[0])),Math.min(...cs.map(c=>c.bb[1])),Math.max(...cs.map(c=>c.bb[2])),Math.max(...cs.map(c=>c.bb[3]))]:null;const A=bb(anal),S=bb(swp);
      let gap=null;if(A&&S){gap=Math.max(S[0]-A[2],A[0]-S[2],S[1]-A[3],A[1]-S[3]);}
      let star='';let sc=gap==null?0.8:gap>=8?1:gap>=3?0.7:0.3;
      if(agnd&&gnd){const tie=B.comps.filter(c=>c.pads.some(p=>p.net===agnd)&&c.pads.some(p=>p.net===gnd));star=` · AGND↔GND 연결점 ${tie.length}개 (${tie.map(c=>c.ref).join(', ')||'없음'})`;if(tie.length!==1)sc*=0.6;}
      return{status:sc>=0.999?'pass':sc>=0.6?'partial':'fail',score:sc,ev:`아날로그 부품 ${anal.length}개(${anal.slice(0,4).map(c=>c.ref).join(', ')}) ↔ 스위칭·구동 ${swp.length}개 거리 ${gap==null?'-':gap.toFixed(1)+' mm'}${star}`,fix:sc<1?(agnd?'AGND는 전원부 인근 한 점(0 Ω/페라이트)에서만 GND에 연결하고, ':'')+'아날로그 부품을 모터·스위칭 부품에서 8 mm 이상 떨어뜨리세요 (place --strategy noise)':null,manualNote:'접지 영역 분할과 리턴 경로는 동박면 모양을 보고 사람이 판단'};}
    case'th_via_array':{const hot=B.comps.filter(c=>c.kind!=='none'&&(c.P>0.3||(X.emc&&X.emc.ps&&X.emc.ps.hot&&X.emc.ps.hot.includes(c.ref))||/DRV|TPS54|LDO|AMS1117|TLE|BTS|VND|MOSFET|IRF|AO3|NVM/i.test(c.mpn||c.val||'')));
      const rows=hot.map(c=>{const ep=c.pads.filter(p=>Math.min(p.w,p.h)>=1.2&&p.w*p.h>=2);if(!ep.length)return{ref:c.ref,ep:false};const n=ep.reduce((a,p)=>a+B.vias.filter(v=>Math.abs(v.x-p.x)<=p.w/2&&Math.abs(v.y-p.y)<=p.h/2).length,0);return{ref:c.ref,ep:true,n,need:Math.min(9,Math.max(4,Math.round(ep[0].w*ep[0].h/2.5)))};});
      const withEp=rows.filter(r=>r.ep);if(!withEp.length)return{status:'na',ev:hot.length?`발열 부품 ${hot.length}개에 노출 패드 없음 (바닥 동박 방열 → 하우징 열보스)`:'발열 부품 없음'};
      const sc=withEp.reduce((a,r)=>a+Math.min(1,r.n/r.need),0)/withEp.length;
      return{status:sc>=0.999?'pass':sc>=0.5?'partial':'fail',score:sc,ev:withEp.map(r=>`${r.ref} 비아 ${r.n}/${r.need}`).join(' · '),fix:sc<1?'route --strategy thermal 또는 auto thermal 이 노출 패드 아래 비아 어레이를 둡니다':null};}
    case'rt_45deg':{let right=0,acute=0;PCB.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.t!=='path')return;for(let i=2;i<p.pts.length;i++){const a=p.pts[i-2],b=p.pts[i-1],c=p.pts[i];const u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];const lu=Math.hypot(...u),lv=Math.hypot(...v);if(lu<1e-6||lv<1e-6)continue;
        const cos=(u[0]*v[0]+u[1]*v[1])/(lu*lv);if(cos<-0.05)acute++;else if(cos<0.05)right++;}}));
      const edge=X.drc.filter(d=>d.code==='edge').length,clr=X.drc.filter(d=>d.code==='clearance'||d.code==='short').length;const n=right+acute*2+edge*3+clr*3;
      return{status:n===0?'pass':n<=6?'partial':'fail',score:n===0?1:n<=6?0.6:0.2,ev:`직각 꺾임 ${right} · 예각 ${acute} · 가장자리 ${edge} · 간격/단락 ${clr}`,fix:n?'직각 코너를 45°로(배선 도구 / 키), DRC 위반 해소':''};}
  }
  return{status:'manual',ev:'자동 판정 규칙 없음'};
}
function checkSch(B,key,X){
  const parts=X.parts,N=X.nets;const capsOn=(n,max)=>parts.filter(c=>/^C/i.test(c.ref)&&c.pins.length===2&&c.pins.some(p=>p.net===n)&&c.pins.some(p=>isGnd(p.net))&&(max==null||(parseC(c.val)||0)<=max));
  switch(key){
    case'sch_decap':{const isReg=c=>c.pins.some(p=>/^(VIN|VI)$/i.test(p.name))&&c.pins.some(p=>/^(VOUT|VO)$/i.test(p.name));const ics=parts.filter(c=>/^U|^IC/i.test(c.ref)&&c.pins.length>=4&&!isConn(c)&&!isReg(c));const rows=[];
      ics.forEach(c=>{const rails=[...new Set(c.pins.map(p=>p.net).filter(n=>n&&!isGnd(n)&&cls(B,n)==='전원'))];rails.forEach(r=>rows.push({ref:c.ref,rail:r,ok:capsOn(r,1.01e-6).length>0}));});
      if(!rows.length)return{status:'na',ev:'전원 레일을 쓰는 IC 없음'};const bad=rows.filter(r=>!r.ok);const sc=1-bad.length/rows.length;
      return{status:bad.length?(sc>=0.5?'partial':'fail'):'pass',score:sc,ev:`IC·레일 ${rows.length}쌍 중 소용량 캡 있음 ${rows.length-bad.length}${bad.length?' · 없음: '+bad.slice(0,6).map(r=>r.ref+'/'+r.rail).join(', '):''}`,fix:bad.length?bad.slice(0,3).map(r=>`add C 100nF --pins ${r.rail},GND --near ${r.ref}`).join(' ; '):''};}
    case'sch_bulk':{const regs=parts.filter(c=>c.pins.some(p=>/^(VIN|VI|IN)$/i.test(p.name))&&c.pins.some(p=>/^(VOUT|VO|OUT)$/i.test(p.name))&&!/^(J|Q)/i.test(c.ref));
      if(!regs.length)return{status:'na',ev:'레귤레이터(VIN/VOUT 핀) 없음'};const rows=[];
      regs.forEach(c=>{['VIN|VI|IN','VOUT|VO|OUT'].forEach((re,i)=>{const p=c.pins.find(q=>new RegExp('^('+re+')$','i').test(q.name));if(!p||!p.net)return;const big=capsOn(p.net).filter(x=>(parseC(x.val)||0)>=0.99e-6);rows.push({ref:c.ref,side:i?'출력':'입력',net:p.net,ok:big.length>0});});});
      const bad=rows.filter(r=>!r.ok);const sc=rows.length?1-bad.length/rows.length:1;
      return{status:bad.length?(sc>=0.5?'partial':'fail'):'pass',score:sc,ev:rows.map(r=>`${r.ref} ${r.side} ${r.net} ${r.ok?'✓':'✕'}`).join(' · '),fix:bad.map(r=>`add C 10uF --pins ${r.net},GND --near ${r.ref}`).slice(0,3).join(' ; ')};}
    case'sch_xtal':{const xs=parts.filter(c=>c.kind==='xtal'||/^(Y|XTAL)\d/i.test(c.ref));if(!xs.length)return{status:'na',ev:'크리스털 없음'};const rows=[];
      xs.forEach(c=>c.pins.forEach(p=>{if(!p.net||isGnd(p.net))return;rows.push({ref:c.ref,net:p.net,ok:capsOn(p.net).length>0});}));
      const bad=rows.filter(r=>!r.ok);const sc=rows.length?1-bad.length/rows.length:1;
      return{status:bad.length?(sc>=0.5?'partial':'fail'):'pass',score:sc,ev:rows.map(r=>`${r.ref} ${r.net} ${r.ok?'부하 캡 있음':'부하 캡 없음'}`).join(' · '),fix:bad.map(r=>`add C 12pF --pins ${r.net},GND --near ${r.ref}`).slice(0,2).join(' ; '),manualNote:'C_L 값은 크리스털 데이터시트(C_L, 기생 용량)로 계산'};}
    case'sch_tvs':{const tvs=parts.filter(c=>isTVS(c));const sw=new Set(X.emc?X.emc.ps.switchNets:[]);const ext=[];parts.filter(isConn).forEach(c=>c.pins.forEach(p=>{if(p.net&&cls(B,p.net)==='신호'&&!sw.has(p.net)&&!/SWD|SWCLK|TMS|TCK|TDI|TDO|DBG_|JTAG|DAP/i.test(p.net)&&!ext.includes(p.net))ext.push(p.net);}));
      if(!ext.length)return{status:'na',ev:'외부 커넥터 신호 없음'};const prot=ext.filter(n=>tvs.some(t=>t.pins.some(p=>p.net===n)));const sc=prot.length/ext.length;
      return{status:sc>=0.999?'pass':sc>0?'partial':'fail',score:sc,ev:`커넥터 신호 ${ext.length}개 중 TVS 연결 ${prot.length}${prot.length<ext.length?' · 없음: '+ext.filter(n=>!prot.includes(n)).slice(0,8).join(', '):''}`,fix:'신호마다 TVS/ESD 다이오드(예: add D PESD5V0 --pins <넷>,GND --near <커넥터>)',manualNote:'TVS 동작 전압·용량은 신호 속도와 버스 규격으로 선정'};}
    case'sch_can_term':{const h=[...N.keys()].find(n=>/CAN.*H$|^CANH$/i.test(n)),l=[...N.keys()].find(n=>/CAN.*L$|^CANL$/i.test(n));if(!h||!l)return{status:'na',ev:'CANH/CANL 넷 없음'};
      const R=parts.filter(c=>/^R/i.test(c.ref)&&c.pins.length===2);const direct=R.find(c=>c.pins.some(p=>p.net===h)&&c.pins.some(p=>p.net===l));
      const split=R.filter(c=>c.pins.some(p=>p.net===h||p.net===l));const mid=split.length>=2?split.map(c=>c.pins.find(p=>p.net!==h&&p.net!==l)).filter(Boolean).map(p=>p.net):[];const sp=mid.length>=2&&mid[0]===mid[1];
      if(direct)return{status:'pass',score:1,ev:`${direct.ref} ${direct.val} 종단 (CANH–CANL)`};if(sp)return{status:'pass',score:1,ev:`스플릿 종단 ${split.map(c=>c.ref).join('+')} (중점 ${mid[0]})`};
      return{status:'manual',ev:'보드에 종단 저항 없음 — 버스 끝단 노드면 필요, 중간 노드면 해당 없음',fix:`add R 120 --pins ${h},${l} --near <CAN 트랜시버>`};}
    case'sch_reset':{const rs=[...N.keys()].filter(n=>/N?RST|RESET|PORST/i.test(n)&&!/^DRV_|nRESET/i.test(n));if(!rs.length)return{status:'na',ev:'리셋 넷 없음'};
      const rows=rs.map(n=>({n,ok:parts.some(c=>/^R/i.test(c.ref)&&c.pins.length===2&&c.pins.some(p=>p.net===n)&&c.pins.some(p=>p.net&&cls(B,p.net)==='전원'))}));const bad=rows.filter(r=>!r.ok);
      return{status:bad.length?'fail':'pass',score:1-bad.length/rows.length,ev:rows.map(r=>`${r.n} ${r.ok?'풀업 있음':'풀업 없음'}`).join(' · '),fix:bad.map(r=>`add R 10k --pins ${r.n},+3V3`).slice(0,2).join(' ; '),manualNote:'MCU 내부 풀업으로 충분한지는 데이터시트 확인'};}
    case'sch_erc':{if(!X.sheets)return{status:'manual',ev:'회로도가 없음 (회로도 보기에서 편집을 시작하면 검사)'};const e=SCHEDIT.erc(X.sheets);
      return{status:e.length?(e.length<=3?'partial':'fail'):'pass',score:e.length?Math.max(0,1-e.length/10):1,ev:e.length?`ERC ${e.length}건: `+e.slice(0,4).map(x=>x.msg).join(', '):'ERC 0건',fix:e.length?'미연결 핀은 연결하거나 nc로 표시, 떠 있는 배선 삭제':''};}
  }
  return{status:'manual',ev:'자동 판정 규칙 없음'};
}
/* evaluate the rules of a scope ('pcb' | 'sch' | 'all') */
function evaluate(B,opts){
  opts=opts||{};const scope=opts.scope||'pcb';const g=state(B);
  if(typeof PCBEDIT!=='undefined')PCBEDIT.prepare(B);
  const X={};const lazy=(k,f)=>Object.defineProperty(X,k,{get(){const v=f();Object.defineProperty(X,k,{value:v});return v;},configurable:true});
  lazy('emc',()=>{try{return EMC.analyze(B,{});}catch(e){return null;}});lazy('met',()=>AUTOPLACE.metrics(B,{}));lazy('drc',()=>opts.drc||PCBEDIT.drc(B));
  lazy('plane',()=>{const st=PCB.stackOf(B);const i=st.findIndex(x=>x.role==='gnd'&&x.net&&x.k!=='T'&&x.k!=='B');return i<0?null:{layer:st[i].k,net:st[i].net,idx:i+1,n:st.length};});
  lazy('pour',()=>{for(const L of['B','T']){const p=B.layers[L+'.cu'].find(q=>q.t==='pour'&&isGnd(q.net));if(p)return{layer:L,net:p.net};}return null;});
  X.sheets=opts.sheets||null;lazy('parts',()=>partsOf(B,X.sheets));lazy('nets',()=>netsOf(X.parts));
  const rules=RULES.filter(r=>scope==='all'||r.scope===scope);
  const res=rules.map(r=>{let c;try{c=r.scope==='pcb'?checkPcb(B,r.key,X):checkSch(B,r.key,X);}catch(e){c={status:'manual',ev:'자동 판정 오류: '+(e.message||e)};}
    const w=g.w[r.key]!=null?g.w[r.key]:r.w;const o=g.over[r.key];const auto=Object.assign({},c);
    if(o){c=Object.assign({},c,{status:o.status,score:o.status==='pass'?1:o.status==='fail'?0:null,note:o.note,by:o.by});}
    const p=prio(w);return Object.assign({key:r.key,scope:r.scope,cat:r.cat,title:r.title,desc:r.desc,ref:r.ref,w,prio:p.label,tier:p.tier,auto},c);});
  const scored=res.filter(r=>r.status!=='na'&&r.status!=='manual');const tw=scored.reduce((s,r)=>s+r.w,0),ew=scored.reduce((s,r)=>s+r.w*(r.score!=null?r.score:r.status==='pass'?1:0),0);
  const pct=tw?ew/tw*100:0;const crit=res.filter(r=>r.w>=8&&(r.status==='fail'||(r.status==='partial'&&r.score<0.5)||r.status==='manual')).length;
  const passed=res.filter(r=>r.status==='pass').length,app=res.filter(r=>r.status!=='na').length,manual=res.filter(r=>r.status==='manual').length;
  const verdict=crit===0&&pct>=90?(scope==='sch'?'우수 (보드 반영 가능)':'우수 (Gerber 출도 가능)'):crit<=1&&pct>=75?'보통 (P0/P1 보완 필요)':'위험 (핵심 룰 미준수)';
  res.sort((a,b)=>b.w-a.w||(sev(a)-sev(b))||RULES.findIndex(r=>r.key===a.key)-RULES.findIndex(r=>r.key===b.key));res.forEach((r,i)=>{r.rank=i+1;});
  return{scope,preset:g.preset,presetLabel:PRESETS[g.preset].label,pct,crit,passed,applicable:app,manual,total:res.length,verdict,rules:res};
}
const sev=r=>({fail:0,manual:1,partial:2,pass:3,na:4}[r.status]);
return{RULES,PRESETS,presetKey,prio,state,setPreset,setWeight,set,evaluate,partsOf};
})();
if(typeof module!=='undefined')module.exports=GUIDE;
