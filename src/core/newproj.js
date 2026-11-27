/* New-design mode: a project is a list of circuit blocks (power input, regulators, MCU, CAN, motor drivers, LEDs…)
   built from real parts in the library. Blocks add parts and nets; signals that must reach the MCU are requested by
   role (PWM, ADC, CAN, SPI, UART, GPIO…) and assigned to MCU pins from the pin-function database. The result is a
   board spec (PCB.fromSpec) whose netlist drives the auto schematic, auto placement and routing.
   planFrom(text) turns a plain-language requirement into blocks with fixed rules (the deterministic path); the AI path
   drives the same plan commands. Needs PCB, MCU_PINS (and AUTOPLACE for placement). */
const NEWPROJ=(function(){
"use strict";
const ST_NAMES=()=>{const d=MCU_PINS.DB['STM32F042K6U6'];const o={};Object.entries(d.pins).forEach(([n,p])=>{o[n]=p.name;});return o;};
const TC_NAMES=()=>{const d=MCU_PINS.DB['TC364DP-64F300F'];const o={};Object.entries(d.pins).forEach(([n,p])=>{o[n]=p.name;});o[145]='VSS (노출 패드)';return o;};
/* ---------- MCUs ---------- */
const MCUS={
  'STM32F042K6U6':{label:'STM32F042K6U6 (Cortex-M0 48 MHz, QFN-32)',fp:'QFN-32',val:'STM32F042K6U6',names:ST_NAMES,P:0.08,
    rails:{'+3V3':[1,5,17]},gnd:[33],xtal:[2,3],usb:[21,22],reserved:[23,24],boot:31,reset:4,
    caps:[['+3V3','100nF',1],['+3V3','100nF',5],['+3V3','100nF',17],['+3V3','10µF',1]],
    extra(ctx){const R=ctx.part('R','10kΩ','0603',{1:'BOOT0',2:'GND'},{mpn:'RC0603FR-0710KL',desc:'BOOT0 풀다운 (플래시에서 부팅)'});void R;ctx.mcuPin(31,'BOOT0');
      ctx.part('R','10kΩ','0603',{1:'NRST',2:'+3V3'},{mpn:'RC0603FR-0710KL',desc:'NRST 풀업'});ctx.part('C','100nF','0603',{1:'NRST',2:'GND'},{mpn:'CL10B104KB8NNNC',desc:'NRST 필터'});ctx.mcuPin(4,'NRST');
      ctx.part('J','SWD','HDR-1x4',{1:'+3V3',2:'SWDIO',3:'SWCLK',4:'GND'},{mpn:'61300411121',desc:'SWD 디버그 (3V3 · SWDIO · SWCLK · GND)',pinNames:{1:'3V3',2:'SWDIO',3:'SWCLK',4:'GND'}});ctx.mcuPin(23,'SWDIO');ctx.mcuPin(24,'SWCLK');}},
  'TC364DP-64F300F':{label:'Infineon AURIX TC364DP (TriCore 300 MHz, TQFP-144)',fp:'TQFP-144',val:'TC364DP',names:TC_NAMES,P:0.9,
    rails:{'+3V3':[23,69,78,83,125,126,44,42,52],VDD:[10,22,72,79,99,127]},gnd:[41,43,80,145],xtal:[81,82],usb:[],reserved:[89,91,92],reset:97,
    caps:[['+3V3','100nF',23],['+3V3','100nF',69],['+3V3','100nF',125],['+3V3','10µF',83],['VDD','100nF',10],['VDD','100nF',72],['VDD','470nF',99],['+3V3','100nF',44]],
    extra(ctx){ctx.part('R','10kΩ','0603',{1:'PORST',2:'+3V3'},{mpn:'RC0603FR-0710KL',desc:'PORST 풀업'});ctx.mcuPin(97,'PORST');
      ctx.part('R','10kΩ','0603',{1:'ESR0',2:'+3V3'},{mpn:'RC0603FR-0710KL',desc:'ESR0 풀업'});ctx.mcuPin(98,'ESR0');
      ctx.part('J','DAP','HDR-1x4',{1:'+3V3',2:'TMS',3:'TCK',4:'GND'},{mpn:'61300411121',desc:'DAP 디버그 (3V3 · TMS(DAP1) · TCK(DAP0) · GND)',pinNames:{1:'3V3',2:'TMS',3:'TCK',4:'GND'}});ctx.mcuPin(89,'TMS');ctx.mcuPin(92,'TCK');
      ctx.need('xtal');}}};
const MCU_ALIAS={stm32:'STM32F042K6U6',stm32f042:'STM32F042K6U6',f042:'STM32F042K6U6',tc364:'TC364DP-64F300F',tc364dp:'TC364DP-64F300F',aurix:'TC364DP-64F300F',tc3:'TC364DP-64F300F'};
const mcuKey=s=>{const nz=x=>String(x||'').toLowerCase().replace(/[\s_-]/g,'');const k=nz(s);if(!k)return null;return MCU_ALIAS[k]||Object.keys(MCUS).find(x=>nz(x).startsWith(k)||k.startsWith(nz(x)))||null;};
// 100 V X7R / X7S automotive ceramics for rails above 30 V: value → [MPN, case]
const capHV={'100nF':['GCM188R72A104KA64D','0603'],'1µF':['GCM21BC72A105KE36L','0805'],'2.2µF':['GCM32ER72A225KA35L','1210'],'4.7µF':['GCM32DC72A475KE02L','1210']};
const railOf=v=>{const n=+v;return n===3.3?'+3V3':n===1.8?'+1V8':'+'+String(n).replace('.','V')+(String(n).includes('.')?'':'V');};
const capMpn={'100nF':'CL10B104KB8NNNC','10nF':'CL10B103KB8NNNC','1µF':'CL10A105KB8NNNC','10µF':'CL21A106KAYNNNE','22µF':'GRM32ER61E226KE15','470nF':'GRM188R71C474KA88D','470µF':'EEE-FK1E471P','100µF':'GRM31CR60J107ME39','3.3nF':'CL10B332KB8NNNC','47pF':'CL10C470JB8NNNC','12pF':'CL10C120JB8NNNC','1nF':'CL10B102KB8NNNC','4.7nF':'CL10B472KB8NNNC'};
const capFp=v=>v==='10µF'?'0805':v==='22µF'?'1210':v==='470µF'?'CP-SMD-10x10':v==='100µF'?'1206':'0603';
const rMpn=v=>{const m={'10kΩ':'RC0603FR-0710KL','4.7kΩ':'RC0603FR-074K7L','330Ω':'RC0603FR-07330RL','100Ω':'RC0603FR-07100RL','5.1kΩ':'RC0603FR-075K1L','100kΩ':'RC0603FR-07100KL','22kΩ':'RC0603FR-0722KL','60.4Ω':'RC0603FR-0760R4L','0.1Ω':'RL1206FR-070R1L'};return m[v]||'';};
const tvsFor=v=>v<=5.5?'SMAJ5.0A':v<=13?'SMAJ15A':v<=26?'SMAJ28A':'SMAJ58A';

/* ---------- blocks ---------- */
const LIB={
  pwr_in:{label:'DC 전원 입력',desc:'커넥터 + 역전압 보호 쇼트키 + 서지 TVS + 벌크 캡 → 입력 레일',params:{pick:{def:'',desc:'시스템 설계에서 고른 부품 (핀 표가 블록 역할에 맞으면 이 부품으로 회로를 만듦)'},vin:{def:12,desc:'입력 전압 [V]'},tvs:{def:1,desc:'입력 TVS: 1 (서지) · loaddump (로드덤프 SMB, ISO 16750-2 중앙 억제 전제) · 0'},bulk:{def:'auto',desc:'벌크 캡 (auto · 10µF · 22µF · 470µF)'},revq:{def:'auto',desc:'역접속 P-FET 패키지: auto (상시 15 A 또는 피크 25 A 이상 D2PAK-7 · 그 밖 DPAK) · dpak · d2pak7'},ign:{def:0,desc:'IGN(KL15) 입력 감지 — 분압 · 필터 · 클램프 → MCU 웨이크업 (1/0)'},uvlo:{def:'off',desc:'입력 저전압 차단: off · auto (12 V계 6.0 V 정지 / 7.0 V 재시작) · 정지 전압 V (재시작 = +1 V) — 1단 벅 EN 분압'},conn:{def:'sep',desc:'외부 커넥터: sep (전원 2핀 + IGN 2핀 따로) · combo (BAT · IGN · GND 3핀 하나, ign=1일 때) · ecu (차량용 ECU 커넥터 하나 — Molex MX150 방수 직각 헤더: 전원 · IGN · 부하 출력 · CAN을 한 커넥터로, 전류에 맞춰 핀 병렬) · ecu-io (입력 ECU 커넥터 하나 — 전원 · IGN · CAN + 모터 블록마다 출력 ECU 커넥터 하나)'}},
    build(ctx,p){const vin=+p.vin;const rail=railOf(vin);ctx.provide(rail,vin,'입력');
      // 48 V systems: the 40 V reverse-polarity P-FETs do not apply — the connector feeds the DC link directly (keyed connector assumed)
      const hv=vin>40,RAW=hv?rail:'VIN_RAW';if(hv)ctx.warn(`${vin} V 입력: 역접속 보호 없음 (키 커넥터 전제) — 필요하면 이상적 다이오드 컨트롤러 + 100 V N-FET을 DC 링크 앞에 추가 · 80 V FET/드라이버는 ISO 21780 동적 과전압 70 V 기준, TVS 클램프 전압은 그보다 높으므로 벌크 캡으로 서지를 흡수해야 함`);
      const combo=+p.ign&&String(p.conn)==='combo';
      const inJ=(fp,o)=>combo?ctx.part('J','BAT/IGN/GND',fp.replace(/^TERM-2-/,'TERM-3-').replace(/^HDR-1x2$/,'HDR-1x3'),{1:RAW,2:'IGN_IN',3:'GND'},Object.assign({},o,{desc:o.desc.replace(/전원 입력/,'전원 입력 커넥터 BAT(KL30) · IGN(KL15) · GND 3핀'),pinNames:{1:'BAT',2:'IGN',3:'GND'}})):ctx.part('J',`${vin}V 입력`,fp,{1:RAW,2:'GND'},o);
      const mb=(ctx.plan&&ctx.plan.blocks||[]).filter(b=>b.type==='hbridge'||b.type==='gdrv3');const Im=mb.reduce((a,b)=>a+(+b.params.i||0),0);
      const Impk=mb.reduce((a,b)=>a+peakOf(b.params,+b.params.i||0).Ipk,0),tpkIn=Math.max(0.01,...mb.map(b=>peakOf(b.params,+b.params.i||0).tpk),0.01);
      if(Im>2){const big=bigTerm(Im,Impk);termFp(2,big?7.62:5.08);const n=Math.max(1,Math.ceil(Im/40));if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){FPGEN.ensure(PCB,'TO-252');FPGEN.ensure(PCB,'SOD-123');}
        if(combo)termFp(3,big?7.62:5.08);inJ(termName(2,big?99:Im),{mpn:big?'':combo?'1729131':'1729128',desc:`${vin} V 전원 입력 (${big?`7.62 mm 단자 — 상시 ${Im} A · 피크 ${Impk} A 정격 품번 지정 필요`:'5.08 mm 단자'} · 상시 ${Im} A${Impk>Im?` · 피크 ${Impk} A ${tpkIn} s`:''})`,pinNames:{1:'+',2:'GND'}});
        const pf=p.pick?pfetPick(p.pick):null;
        if(!hv&&!(p.pick&&!pf&&idealDiode(ctx,p,rail,Im))){
        // ≥ 15 A without a picked part: D2PAK-7 P-FET — five source leads spread the rail current into many vias (a DPAK's single
        // 1.2 mm source lead leaves room for only ~6 vias around it, too few for 20 A into the inner plane)
        const big7=!pf&&(String(p.revq||'auto')==='d2pak7'||String(p.revq||'auto')==='auto'&&(Im>=15||Impk>=25));if(big7&&typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'TO-263-7');
        if(big7){const n7=Math.max(1,Math.ceil(Im/60));for(let i=0;i<n7;i++)ctx.part('Q','IPB180P04P4L-02','TO-263-7',{1:'VIN_PG',2:rail,3:rail,4:'VIN_RAW',5:rail,6:rail,7:rail},{mpn:'IPB180P04P4L-02',desc:`역전압 보호 P-MOSFET (−40 V · 2.4 mΩ · D2PAK-7, 소스 리드 5개 · AEC 인증)${n7>1?' · 병렬 '+n7:''}`,pinNames:{1:'G',2:'S',3:'S',4:'D',5:'S',6:'S',7:'S'},P:+(((Im/n7)**2)*0.0024+0.02).toFixed(2),lk:'batt'});}
        else for(let i=0;i<n;i++)ctx.part('Q',pf||'SQD50P04-09L','TO-252',{1:'VIN_PG',2:'VIN_RAW',3:rail},{mpn:pf||'SQD50P04-09L_GE3',desc:`역전압 보호 P-MOSFET ${pf?pf+' (시스템 설계에서 고른 부품)':'(−40 V · 9 mΩ · AEC-Q101)'}${n>1?' · 병렬 '+n:''}`,pinNames:{1:'G',2:'D',3:'S'},P:+(((Im/n)**2)*0.009+0.02).toFixed(2),lk:'batt'});
        ctx.part('R','10kΩ','0603',{1:'VIN_PG',2:'GND'},{desc:'역전압 P-FET 게이트 풀다운 (정극성이면 ON)'});ctx.part('D','BZT52C12','SOD-123',{1:rail,2:'VIN_PG'},{mpn:'BZT52C12Q-7-F',desc:'게이트–소스 12 V 클램프 제너',pinNames:{1:'K',2:'A'}});
        }
        const Imw=mb.reduce((a,b)=>{const i=+b.params.i||0,q=peakOf(b.params,i),u=i>0?copperOf({plan:ctx.plan},b.params,i,q.Ipk,q.tpk,false):null;return a+(u?u.Iw:i);},0);if(!hv){ctx.curr('VIN_RAW',Imw);ctx.peak('VIN_RAW',Impk,tpkIn);}ctx.curr(rail,Imw);ctx.peak(rail,Impk,tpkIn);ctx.curr('GND',Imw);ctx.peak('GND',Impk,tpkIn);}
      else{if(combo&&typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'HDR-1x3',3);inJ('HDR-1x2',{mpn:combo?'61300311121':'61300211121',desc:`${vin} V 전원 입력`,pinNames:{1:'+',2:'GND'}});
      const pf=p.pick?pfetPick(p.pick):null;
      if(pf){if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){FPGEN.ensure(PCB,'TO-252');FPGEN.ensure(PCB,'SOD-123');}
        ctx.part('Q',pf,'TO-252',{1:'VIN_PG',2:'VIN_RAW',3:rail},{mpn:pf,desc:`역전압 보호 P-MOSFET ${pf} (시스템 설계에서 고른 부품)`,pinNames:{1:'G',2:'D',3:'S'},lk:'batt'});
        ctx.part('R','10kΩ','0603',{1:'VIN_PG',2:'GND'},{desc:'역전압 P-FET 게이트 풀다운 (정극성이면 ON)'});ctx.part('D','BZT52C12','SOD-123',{1:rail,2:'VIN_PG'},{mpn:'BZT52C12Q-7-F',desc:'게이트–소스 12 V 클램프 제너',pinNames:{1:'K',2:'A'}});}
      else if(!(p.pick&&idealDiode(ctx,p,rail,2)))ctx.part('D','SS14','SMA',{1:rail,2:'VIN_RAW'},{mpn:'SS14HE3_A/H',desc:'역전압 보호 쇼트키 (직렬)',pinNames:{1:'K',2:'A'}});}
      if(String(p.tvs)==='loaddump'){const t=vin<=16?'SMBJ26CA':vin<=32?'SMBJ36CA':'SMBJ58CA';if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'SMB');
        ctx.part('D',t,'SMB',{1:'GND',2:'VIN_RAW'},{mpn:t,desc:`로드덤프 TVS ${t} (양방향 600 W · 역전압 보호 앞단이라 역접속에도 안전 · 중앙 억제 로드덤프 전제, 미억제면 SM8S급 필요)`,pinNames:{1:'A1',2:'A2'}});}
      else if(+p.tvs&&hv){if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'SMC');ctx.part('D','SMCJ58A','SMC',{1:rail,2:'GND'},{mpn:'SMCJ58A',desc:'입력 서지 TVS SMCJ58A (1500 W · 스탠드오프 58 V · 클램프 93.6 V — 80 V 소자 보호에는 벌크 캡 병용)',pinNames:{1:'K',2:'A'}});}
      else if(+p.tvs)ctx.part('D',tvsFor(vin),'SMA',{1:rail,2:'GND'},{desc:`입력 서지 TVS (${tvsFor(vin)})`,pinNames:{1:'K',2:'A'}});
      // IGN (KL15): wake / ignition sense for the MCU — 33 k / 10 k divider (12 V → 2.8 V), RC 10 nF, clamp to the logic rail, TVS on the pin
      if(+p.ign){const vl='+3V3';ctx.use(vl);
        if(!combo)ctx.part('J','IGN','HDR-1x2',{1:'IGN_IN',2:'GND'},{mpn:'61300211121',desc:'IGN (KL15) 점화 신호 입력',pinNames:{1:'IGN',2:'GND'}});
        const ld=String(p.tvs)==='loaddump',ti=ld?(vin<=16?'SMBJ26CA':vin<=32?'SMBJ36CA':'SMBJ58CA'):tvsFor(vin).replace(/A$/,'CA');if(ld&&typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'SMB');
        ctx.part('D',ti,ld?'SMB':'SMA',{1:'GND',2:'IGN_IN'},{mpn:ti,desc:`IGN 서지 TVS ${ti} (양방향 — IGN 역접속에도 도통 안 함)`,pinNames:{1:'A1',2:'A2'}});
        ctx.part('R','33kΩ','0603',{1:'IGN_IN',2:'IGN_DET'},{desc:`IGN 분압 상단 (${vin} V → ${(vin*10/43).toFixed(1)} V)`});ctx.part('R','10kΩ','0603',{1:'IGN_DET',2:'GND'},{desc:'IGN 분압 하단'});
        ctx.part('C','10nF','0603',{1:'IGN_DET',2:'GND'},{desc:'IGN 노이즈 필터 (τ ≈ 77 µs)'});
        ctx.part('D','BAT54S','SOT-23',{1:'GND',2:vl,3:'IGN_DET'},{mpn:'BAT54S',desc:`IGN 입력 클램프 (GND · ${vl})`,pinNames:{1:'A1',2:'K2',3:'K1/A2'}});ctx.sig('IGN_DET','irq_in');}
      const bulk=p.bulk==='auto'?(ctx.has('bldc')||ctx.has('dcmotor')||ctx.has('hbridge')||ctx.has('gdrv3')?'470µF':vin>6?'22µF':'10µF'):p.bulk;
      // 48 V: the stock 25 / 35 V electrolytic does not apply — a 100 µF part rated 80 V or more, to be specified, and 100 V ceramics
      if(hv){if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'CP-SMD-10x10');ctx.part('CP','100µF','CP-SMD-10x10',{1:rail,2:'GND'},{mpn:'',desc:'입력 벌크 커패시터 (100 µF · 정격 80 V 이상 — 품번 지정 필요)'});ctx.cap(rail,'2.2µF','입력 세라믹');}
      else ctx.cap(rail,bulk,'입력 벌크 커패시터');ctx.cap(rail,'100nF','입력 고주파 바이패스');}},
  usb_in:{label:'USB-C 전원·데이터',desc:'USB-C 리셉터클 · CC 5.1 kΩ 풀다운 · VBUS 5 V · D+/D− → MCU USB',params:{data:{def:1,desc:'USB 데이터 연결 (1/0)'}},
    build(ctx,p){ctx.provide('VBUS',5,'USB');const d=+p.data;
      ctx.part('J','USB-C','USB-C',{1:'CC1',2:'VBUS',3:'GND',4:d?'USB_DM':null,5:d?'USB_DP':null,6:'GND',S1:'GND',S2:'GND'},{mpn:'USB4105-GF-A',desc:'USB-C 리셉터클',pinNames:{1:'CC1',2:'VBUS',3:'GND',4:'D−',5:'D+',6:'GND',S1:'SHIELD',S2:'SHIELD'}});
      ctx.part('R','5.1kΩ','0603',{1:'CC1',2:'GND'},{desc:'CC 풀다운 (싱크 5 V)'});ctx.cap('VBUS','10µF','VBUS 벌크');
      if(d){ctx.sig('USB_DM','usb_dm','usb');ctx.sig('USB_DP','usb_dp','usb');}}},
  ldo:{label:'LDO 레귤레이터',desc:'AMS1117 (SOT-223) · 입력/출력 10 µF',params:{pick:{def:'',desc:'시스템 설계에서 고른 부품 (핀 표가 블록 역할에 맞으면 이 부품으로 회로를 만듦)'},vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:3.3,desc:'출력 전압 (3.3 · 5)'},iout:{def:'auto',desc:'예상 부하 전류 [A] (auto = 블록 합)'}},
    build(ctx,p){const vout=+p.vout;const out=railOf(vout);
      // other rails (9 V hall supply, 8 V, 12 V …): adjustable LM317 (40 V input) + 240 Ω / R2 divider, Vout = 1.25·(1 + R2/240)
      // a picked adjustable LDO whose feedback voltage is on record (TPS7B86: 0.65 V) is built with its own FB divider
      if(vout!==5&&vout!==3.3&&p.pick&&LDO_VFB.some(([re])=>re.test(p.pick))){const src=p.vin==='auto'?ctx.highest(vout+0.6):p.vin;ctx.provide(out,vout,'LDO');ctx.use(src);if(ldoPick(ctx,p,src,out,vout,true))return;}
      if(vout!==5&&vout!==3.3){const src=p.vin==='auto'?ctx.highest(vout+2):p.vin;ctx.provide(out,vout,'LDO');ctx.use(src);const adj=ctx.uniq('LDO_ADJ');
        const E24=[1,1.1,1.2,1.3,1.5,1.6,1.8,2,2.2,2.4,2.7,3,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];const r2x=240*(vout/1.25-1);const dec=Math.pow(10,Math.floor(Math.log10(r2x)));const r2=E24.map(e=>e*dec).concat([10*dec]).reduce((a,b)=>Math.abs(b-r2x)<Math.abs(a-r2x)?b:a);
        const fmt=r=>r>=1000?(+(r/1000).toFixed(2))+'kΩ':Math.round(r)+'Ω';const vr=1.25*(1+r2/240);
        ctx.part('U','LM317','SOT-223',{1:adj,2:out,3:src,4:out},{mpn:'LM317DCYR',desc:`${vout} V 가변 LDO (입력 ${src}, 드롭아웃 ~2 V)`,pinNames:{1:'ADJ',2:'VOUT',3:'VIN',4:'VOUT'},ldo:{src,out,vout}});
        ctx.part('R','240Ω','0603',{1:out,2:adj},{desc:`LM317 분압 상단 (Vout = ${vr.toFixed(2)} V)`});ctx.part('R',fmt(r2),'0603',{1:adj,2:'GND'},{desc:'LM317 분압 하단'});
        ctx.cap(src,'1µF','LDO 입력 커패시터');ctx.cap(out,'10µF','LDO 출력 커패시터');const vs=ctx.railV?ctx.railV(src):null;if(vs&&vs<vout+2.5)ctx.warn(`${out}: 입력 ${vs} V − ${vout} V 출력 — 드롭아웃 여유 부족 (배터리 저하 시 유지 안 됨)`);return;}
      const mpn=vout===5?'AMS1117-5.0':'AMS1117-3.3';
      const src=p.vin==='auto'?ctx.highest(vout+1.1):p.vin;ctx.provide(out,vout,'LDO');ctx.use(src);
      if(p.pick&&ldoPick(ctx,p,src,out,vout))return;
      ctx.part('U',mpn,'SOT-223',{1:'GND',2:out,3:src,4:out},{mpn,desc:`${vout} V LDO (입력 ${src})`,pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},ldo:{src,out,vout}});
      ctx.cap(src,'10µF','LDO 입력 커패시터');ctx.cap(out,'10µF','LDO 출력 커패시터');}},
  buck:{label:'벅 컨버터 (DC-DC)',desc:'TPS54331 (3.5–28 V 입력, 3 A, 570 kHz) · 10 µH 인덕터 · MBRA340T3G(SMA) 캐치 다이오드 · 22 µF 출력 · 피드백 분압 · 보상',params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:5,desc:'출력 전압 (5 · 3.3)'},part:{def:'',desc:'핀 호환 부품 (TPS54331DR · TPS54331QDRQ1 · TPS54331D)'}},
    build(ctx,p){const vout=+p.vout;const mpn=/^TPS54331/i.test(String(p.part||''))?String(p.part).toUpperCase():'TPS54331DR';if(p.part&&mpn==='TPS54331DR'&&!/^TPS54331DR$/i.test(p.part))ctx.warn(`벅 ${p.part}: TPS54331 핀 호환 부품만 이 회로에 넣을 수 있습니다 — TPS54331DR로 생성`);const out=railOf(vout);const src=p.vin==='auto'?ctx.highest(vout+2):p.vin;ctx.provide(out,vout,'벅');ctx.use(src);
      const fb=vout===5?['52.3kΩ','10kΩ']:vout===3.3?['31.6kΩ','10kΩ']:[String(Math.round((vout/0.8-1)*100)/10)+'kΩ','10kΩ'];
      ctx.part('U','TPS54331','SOIC-8',{1:'BUCK_BOOT',2:src,3:'BUCK_EN',4:'BUCK_SS',5:'BUCK_FB',6:'BUCK_COMP',7:'GND',8:'BUCK_SW'},{mpn,desc:`${vout} V 벅 컨버터 (입력 ${src}) · 비동기 — 캐치 쇼트키 필요`,pinNames:{1:'BOOT',2:'VIN',3:'EN',4:'SS',5:'VSENSE',6:'COMP',7:'GND',8:'PH'},buck:{src,out,vout}});
      ctx.part('C','100nF','0603',{1:'BUCK_BOOT',2:'BUCK_SW'},{desc:'부트스트랩 캡 (BOOT–PH)'});
      ctx.part('L','10µH','IND-5x5',{1:'BUCK_SW',2:out},{mpn:'SRN5040-100M',desc:'출력 인덕터 10 µH (Bourns SRN5040)',P:0.12});
      ctx.part('D','MBRA340T3G','SMA',{1:'BUCK_SW',2:'GND'},{mpn:'MBRA340T3G',desc:'캐치 쇼트키 3 A 40 V (SMA)',pinNames:{1:'K',2:'A'},P:0.15});
      ctx.cap(src,'22µF','벅 입력 커패시터');ctx.cap(src,'100nF','벅 입력 고주파 바이패스 (VIN 핀 옆)');ctx.cap(out,'22µF','벅 출력 커패시터');ctx.cap(out,'22µF','벅 출력 커패시터');
      ctx.part('R',fb[0],'0603',{1:out,2:'BUCK_FB'},{desc:`피드백 상단 (VOUT = 0.8 V × (1 + R상/R하) ≈ ${vout} V)`});ctx.part('R',fb[1],'0603',{1:'BUCK_FB',2:'GND'},{desc:'피드백 하단'});
      ctx.part('C','10nF','0603',{1:'BUCK_SS',2:'GND'},{desc:'소프트 스타트'});
      ctx.part('R','76.8kΩ','0603',{1:'BUCK_COMP',2:'BUCK_RC'},{desc:'보상 Rc'});ctx.part('C','3.3nF','0603',{1:'BUCK_RC',2:'GND'},{desc:'보상 Cc'});ctx.part('C','47pF','0603',{1:'BUCK_COMP',2:'GND'},{desc:'보상 고주파 극점'});
      // input undervoltage lockout on EN (TPS54331 datasheet): Ren1 = (Vstart − Vstop) / 3 µA, Ren2 = 1.25 V / ((Vstop − 1.25) / Ren1 + 4 µA), Vstop > 3.5 V
      const pin=(ctx.plan&&ctx.plan.blocks||[]).find(b=>b.type==='pwr_in');const uv=pin&&pin.params?pin.params.uvlo:null;const vIn=ctx.railV?ctx.railV(src):0;
      if(uv&&uv!=='off'&&pin&&railOf(+pin.params.vin)===src){const vstop=uv==='auto'||uv===true||uv==='1'?(vIn>16?Math.round(vIn*0.6):6):+uv;const vstart=vstop+(vIn>16?2:1);
        if(!(vstop>3.5)||vstart>=vIn){ctx.warn(`저전압 차단 ${vstop} V: TPS54331 정지 전압은 3.5 V 초과 · 재시작 ${vstart} V는 입력 ${vIn} V보다 낮아야 함 — EN 풀업 유지`);ctx.part('R','100kΩ','0603',{1:src,2:'BUCK_EN'},{desc:'EN 풀업 (입력 인가 시 동작)'});return;}
        const E96=[1,1.02,1.05,1.07,1.1,1.13,1.15,1.18,1.21,1.24,1.27,1.3,1.33,1.37,1.4,1.43,1.47,1.5,1.54,1.58,1.62,1.65,1.69,1.74,1.78,1.82,1.87,1.91,1.96,2,2.05,2.1,2.15,2.21,2.26,2.32,2.37,2.43,2.49,2.55,2.61,2.67,2.74,2.8,2.87,2.94,3.01,3.09,3.16,3.24,3.32,3.4,3.48,3.57,3.65,3.74,3.83,3.92,4.02,4.12,4.22,4.32,4.42,4.53,4.64,4.75,4.87,4.99,5.11,5.23,5.36,5.49,5.62,5.76,5.9,6.04,6.19,6.34,6.49,6.65,6.81,6.98,7.15,7.32,7.5,7.68,7.87,8.06,8.25,8.45,8.66,8.87,9.09,9.31,9.53,9.76];
        const e96=v=>{const d=Math.pow(10,Math.floor(Math.log10(v)));return E96.map(e=>e*d).concat([10*d]).reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);};const k=r=>r>=1e6?(+(r/1e6).toFixed(2))+'MΩ':(+(r/1000).toFixed(1))+'kΩ';
        const r1=e96((vstart-vstop)/3e-6),r2=e96(1.25/((vstop-1.25)/r1+4e-6));const vs2=+(1.25*(1+r1/r2)+0+r1*1e-6).toFixed(2); // start ≈ 1.25·(1 + R1/R2) − R1·I1, with I1 ≈ 1 µA
        const vst=+((vstop>0?((1.25*(r1+r2)/r2)-r1*1e-6):0)).toFixed(2),vsp=+(((1.25*(r1+r2)/r2)-r1*4e-6)).toFixed(2);void vs2;
        ctx.part('R',k(r1),'0603',{1:src,2:'BUCK_EN'},{desc:`저전압 차단 EN 분압 상단 (목표 정지 ${vstop} V · 재시작 ${vstart} V, 계산 약 ${vsp} V / ${vst} V)`});
        ctx.part('R',k(r2),'0603',{1:'BUCK_EN',2:'GND'},{desc:'저전압 차단 EN 분압 하단 (TPS54331 EN 1.25 V · 히스테리시스 3 µA)'});
        ctx.warn(`입력 저전압 차단: ${src} ${vstop} V 이하에서 ${out} 벅 정지, ${vstart} V 이상에서 재시작 (EN 분압 ${k(r1)} / ${k(r2)})`);return;}
      ctx.part('R','100kΩ','0603',{1:src,2:'BUCK_EN'},{desc:'EN 풀업 (입력 인가 시 동작)'});}},
  hvbuck:{label:'48 V → 12 V 벅 모듈 (APM81815)',desc:'Allegro APM81815 (QFN-24 4 × 4): 80 V · 1.5 A 동기 벅 모듈, VIN 5–72 V, 출력 3.3 / 5 / 5.35 / 12 V (VS1 · VS2), 2.15 MHz · 6.8 µH · 10 µF',
    params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:12,desc:'출력 전압 (3.3 · 5 · 5.35 · 12)'}},
    build(ctx,p){const vout=[3.3,5,5.35,12].includes(+p.vout)?+p.vout:12;const out=railOf(vout);const src=p.vin==='auto'?ctx.highest(vout+2):p.vin;ctx.provide(out,vout,'벅 모듈');ctx.use(src);apmPkg();
      // data sheet terminal list and application circuit: EN to VIN (always on, rated 80 V); SS, FSET, SYNC, LP/PWM to VCC (0.7 ms soft start,
      // 2.15 MHz with dither, forced PWM); VS1 / VS2 to VCC or GND select the output; BIAS senses VOUT (no divider); BOOT stays open
      const V='HVB_VCC',SW='HVB_SW',PG='HVB_PG';const vs={3.3:['GND','GND'],5:['GND',V],5.35:[V,'GND'],12:[V,V]}[vout];
      ctx.part('U','APM81815','QFN-24-4x4-APM81815',{1:'GND',2:'GND',3:'GND',5:src,7:src,9:V,10:vs[0],11:vs[1],12:V,13:'GND',14:V,15:'GND',16:V,17:V,18:PG,19:out,23:SW,25:src,26:'GND'},
        {mpn:'APM81815KNBJTR',desc:`${vout} V 벅 모듈 (입력 ${src} · 80 V 1.5 A 동기 · 2.15 MHz · 입력/부트 캡 내장)`,pinNames:{1:'PGND',2:'PGND',3:'PGND',5:'VIN',7:'EN',9:'SS',10:'VS1',11:'VS2',12:'SYNC',13:'NC',14:'FSET',15:'GND',16:'LP/PWM',17:'VCC',18:'PGOOD',19:'BIAS',21:'BOOT',23:'SW',25:'VIN',26:'PGND'},buck:{src,out,vout},P:0.35});
      ctx.cap(src,'4.7µF','APM81815 입력 커패시터 CIN (VIN–PGND 바로 옆)');ctx.part('C','4.7µF','0603',{1:V,2:'GND'},{mpn:'GRM188Z71A475KE15D',desc:'APM81815 VCC 바이패스 4.7 µF (3.3 V 내부 레귤레이터 · 핀 가까이)'});
      ctx.part('L','6.8µH','IND-5x5',{1:SW,2:out},{mpn:'SRN5040-6R8M',desc:'APM81815 출력 인덕터 6.8 µH (데이터시트 응용 회로 · 18 µH 이하)',P:0.1});
      ctx.cap(out,'10µF','APM81815 출력 커패시터 COUT (응용 회로 10 µF)');ctx.cap(out,'10µF','APM81815 출력 커패시터 (DC 바이어스 여유)');
      const io=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(io);ctx.part('R','10kΩ','0603',{1:PG,2:io},{desc:'APM81815 PGOOD 오픈 드레인 풀업'});ctx.sig(PG,'irq_in');
      ctx.warn('APM81815: 풋프린트는 QFN-24 4 × 4 mm 0.5 mm 피치 기준 가정 치수(핀 4 · 6 · 8 · 20 · 22 · 24 없음, 노출 패드 2개 위치 추정) — 출도 전 Allegro 패키지 도면과 대조');}},
  mcu:{label:'MCU',desc:'MCU + 전원 핀 디커플링 + 리셋 + 부트 + 디버그 헤더',params:{part:{def:'STM32F042K6U6',desc:'STM32F042K6U6 · TC364DP'}},
    build(ctx,p){const k=mcuKey(p.part)||'STM32F042K6U6';const M=MCUS[k];ctx.setMcu(k);
      const pins={};Object.entries(M.rails).forEach(([r,ns])=>{ns.forEach(n=>{pins[n]=r;});ctx.use(r==='VDD'?null:r);});M.gnd.forEach(n=>{pins[n]='GND';});
      ctx.part('U',M.val,M.fp,pins,{mpn:k,desc:M.label,pinNames:M.names(),mcu:true,P:M.P});
      M.caps.forEach(([r,v])=>ctx.cap(r,v,`MCU ${r} 디커플링`));M.extra(ctx);}},
  xtal:{label:'크리스털',desc:'20 MHz 크리스털 + 부하 캡 2개 → MCU OSC 핀',params:{freq:{def:'20MHz',desc:'주파수'},cl:{def:'12pF',desc:'부하 캡 값'}},
    build(ctx,p){ctx.part('Y',p.freq,'XTAL-3225',{1:'XTAL1',2:'GND',3:'XTAL2',4:'GND'},{mpn:'ABM8-20.000MHZ-B2-T',desc:`${p.freq} 크리스털`});
      ctx.part('C',p.cl,'0603',{1:'XTAL1',2:'GND'},{desc:'크리스털 부하 캡'});ctx.part('C',p.cl,'0603',{1:'XTAL2',2:'GND'},{desc:'크리스털 부하 캡'});ctx.xtal('XTAL1','XTAL2');}},
  can:{label:'CAN 통신',desc:'TLE9251V CAN FD 트랜시버 (VCC 5 V · VIO 3.3 V) · 스플릿 종단 · PESD1CAN TVS · 커넥터',params:{pick:{def:'',desc:'시스템 설계에서 고른 부품 (핀 표가 블록 역할에 맞으면 이 부품으로 회로를 만듦)'},term:{def:1,desc:'스플릿 종단 60 Ω×2 + 4.7 nF (1/0)'},tvs:{def:1,desc:'PESD1CAN (1/0)'},vsup:{def:'',desc:'트랜시버 배터리 핀(VSUP · VBAT) 레일 — 비우면 가장 높은 레일, 48 V 계통은 +12V'}},
    build(ctx,p){ctx.use('+5V');ctx.use('+3V3');
      if(!(p.pick&&canPick(ctx,p)))ctx.part('U','TLE9251V','SOIC-8',{1:'CAN_TX',2:'GND',3:'+5V',4:'CAN_RX',5:'+3V3',6:'CANL',7:'CANH',8:'CAN_STB'},{mpn:'TLE9251VSJ',desc:'CAN FD 트랜시버',pinNames:{1:'TxD',2:'GND',3:'VCC',4:'RxD',5:'VIO',6:'CANL',7:'CANH',8:'STB'},P:0.08});
      ctx.cap('+5V','100nF','CAN VCC 디커플링');ctx.cap('+3V3','100nF','CAN VIO 디커플링');
      if(+p.term){ctx.part('R','60.4Ω','0603',{1:'CANH',2:'CAN_SPLIT'},{desc:'스플릿 종단'});ctx.part('R','60.4Ω','0603',{1:'CAN_SPLIT',2:'CANL'},{desc:'스플릿 종단'});ctx.part('C','4.7nF','0603',{1:'CAN_SPLIT',2:'GND'},{desc:'스플릿 종단 공통 모드 캡'});}
      const hvSys=Object.values(ctx.rails||{}).some(r=>r&&r.v>40);if(+p.tvs&&hvSys)ctx.warn('CAN: 48 V 계통 — 24 V급 PESD1CAN은 버스가 48 V에 단락되면 도통하므로 넣지 않음. 버스 단락 내성이 필요하면 스탠드오프 60 V 이상 CAN TVS를 지정');
      if(+p.tvs&&!hvSys)ctx.part('D','PESD1CAN','SOT-23',{1:'CANL',2:'CANH',3:'GND'},{desc:'CAN 버스 ESD/TVS (Nexperia PESD1CAN)',pinNames:{1:'CANL',2:'CANH',3:'GND'}});
      ctx.part('J','CAN','HDR-1x4',{1:'CANH',2:'CANL',3:'GND',4:null},{mpn:'61300411121',desc:'CAN 버스 커넥터',pinNames:{1:'CANH',2:'CANL',3:'GND',4:'NC'}});
      ctx.sig('CAN_TX','can_tx','can');ctx.sig('CAN_RX','can_rx','can');if(!p._noStb)ctx.sig('CAN_STB','gpio_out');}},
  bldc:{label:'BLDC 3상 드라이버',desc:'DRV8313 (VM 8–60 V, 2.5 A) · 차지 펌프 · VM 벌크 · 홀 센서 입력 · 모터·홀 커넥터',params:{hall:{def:1,desc:'홀 센서 입력 (1/0)'},vm:{def:'auto',desc:'VM 레일 (auto = 입력 레일)'}},
    build(ctx,p){const vm=p.vm==='auto'?ctx.highest(8):p.vm;ctx.use(vm);
      ctx.part('U','DRV8313','HTSSOP-28',{1:'DRV_CPL',2:'DRV_CPH',3:'DRV_VCP',4:vm,5:'PH_W',6:'GND',7:'GND',8:'PH_V',9:'PH_U',10:'GND',11:vm,14:'GND',15:'DRV_V3P3',16:'DRV_V3P3',17:'DRV_V3P3',18:'NFAULT',20:'GND',22:'EN_U',23:'IN_U',24:'EN_V',25:'IN_V',26:'EN_W',27:'IN_W',28:'GND',29:'GND'},
        {mpn:'DRV8313PWPR',desc:'3상 하프브리지 드라이버',pinNames:{1:'CPL',2:'CPH',3:'VCP',4:'VM',5:'OUT1',6:'PGND1',7:'PGND2',8:'OUT2',9:'OUT3',10:'PGND3',11:'VM',12:'COMPP',13:'COMPN',14:'GND',15:'V3P3',16:'nRESET',17:'nSLEEP',18:'nFAULT',19:'nCOMPO',20:'GND',21:'NC',22:'EN3',23:'IN3',24:'EN2',25:'IN2',26:'EN1',27:'IN1',28:'GND',29:'PAD'},P:0.5});
      ctx.part('C','10nF','0603',{1:'DRV_CPL',2:'DRV_CPH'},{desc:'차지 펌프 (CPL–CPH)'});ctx.part('C','100nF','0603',{1:vm,2:'DRV_VCP'},{desc:'VCP–VM'});ctx.part('C','470nF','0603',{1:'DRV_V3P3',2:'GND'},{desc:'V3P3 바이패스'});
      ctx.cap(vm,'100nF','VM 고주파 바이패스 (핀 4)');ctx.cap(vm,'100nF','VM 고주파 바이패스 (핀 11)');ctx.cap(vm,'22µF','VM 벌크');
      ctx.part('R','10kΩ','0603',{1:'+3V3',2:'NFAULT'},{desc:'nFAULT 풀업 (오픈 드레인)'});ctx.use('+3V3');
      ['U','V','W'].forEach(x=>{ctx.sig('IN_'+x,'pwm','pwm3');ctx.sig('EN_'+x,'gpio_out');});ctx.sig('NFAULT','irq_in');
      const h=+p.hall;const J={1:'PH_W',2:'PH_V',3:'PH_U',4:h?'HALL_A':null,5:h?'HALL_B':null,6:h?'HALL_C':null,7:h?'+5V':null,8:'GND'};
      ctx.part('J','모터·홀','HDR-1x8',J,{mpn:'61300811121',desc:'BLDC 상(W V U) + 홀(H1–H3) + 5 V',pinNames:{1:'W',2:'V',3:'U',4:'H1',5:'H2',6:'H3',7:'5V',8:'GND'}});
      if(h){ctx.use('+5V');['A','B','C'].forEach(x=>{ctx.part('R','4.7kΩ','0603',{1:'+3V3',2:'HALL_'+x},{desc:'홀 출력 풀업 (오픈 컬렉터)'});ctx.part('C','1nF','0603',{1:'HALL_'+x,2:'GND'},{desc:'홀 입력 필터'});ctx.sig('HALL_'+x,'irq_in');});}}},
  hbridge:{label:'H-브리지 (게이트 드라이버 + 외부 N-MOSFET 4개)',desc:'하프브리지 게이트 드라이버 ×2 (IR2104S: 부트스트랩 다이오드·캡, 데드타임 내장) + N-MOSFET ×4 (DPAK, 전류 등급에 맞춰 병렬) + 게이트 저항·G-S 풀다운 + 로우사이드 공통 션트 + 전류 앰프(INA181-Q1 ×50) → ADC + VM 벌크/세라믹 + 모터 단자(5.08 mm) · 정/역회전 PWM',
    params:{i:{def:10,desc:'모터 상시(연속) 전류 A — 손실 · 발열 · 상시 패턴 폭'},ipk:{def:'auto',desc:'피크 전류 A (기동 · 구속 · 과부하, auto = 상시와 같음) — FET · 션트 범위 · 단자 · 피크 패턴 폭'},tpk:{def:2,desc:'피크 지속 시간 s (패턴의 피크 온도 상승 계산)'},tper:{def:0,desc:'피크 반복 주기 s (0 = 단발 · 값을 주면 상시 전류 대신 RMS로 패턴 폭 계산)'},prof:{def:'',desc:'추가 전류 구간 "A@초/주기초, …" (예: 40@2/30, 60@0.1) — RMS와 구간별 피크 온도 상승에 반영'},vm:{def:'auto',desc:'VM 레일 (auto = 입력 레일)'},shunt:{def:1,desc:'전류 검출 (1/0)'},fet:{def:'single',desc:'MOSFET 패키지: single (DPAK ×4) · IAUC60N04S6N050H (하프브리지 ×2) · IPG20N04S4L-07 (듀얼 ×2)'},driver:{def:'IR2104',desc:'게이트 드라이버: IR2104 (하프브리지 ×2) · A4911 · A4918 (Allegro 3상 중 2레그 사용 · SPI 진단 · 센스 앰프 ×2)'},load:{def:'motor',desc:'부하: motor (DC 모터) · solenoid (솔레노이드 — 정/역 극성 구동, 끌 때 역기전력은 FET 바디 다이오드로 VM 회생)'},out:{def:'auto',desc:'출력 단자 이름 (auto = 모터 · 솔레노이드는 ELD 등)'}},
    build(ctx,p){const vm=p.vm==='auto'?ctx.highest(8):p.vm;ctx.use(vm);const I=Math.max(1,+p.i||10);const{Ipk,tpk}=peakOf(p,I);ctx._cu=copperOf(ctx,p,I,Ipk,tpk,false);const k=ctx.uniq('HB');const N=x=>k==='HB'?'HB_'+x:k+'_'+x;
      const V=ctx.railV?ctx.railV(vm):12;const pwr=motorPower(ctx,I,V,fetChoice(ctx,p,I,V,k),Ipk);if(ctx._cu)ctx._cu.par=pwr.par||1;const sn=+p.shunt;
      let drv=allegroDrv(p.driver);pwr.tpk=tpk;if(drv&&!allegro3(ctx,drv,vm,I,pwr,N,{legs:{A:'A',B:'B'}}))drv=null;if(!drv&&/8334/.test(String(p.driver||''))&&ti8334(ctx,vm,I,pwr,N,{legs:{A:'A',B:'B'}}))drv='DRV8334';
      if(!drv&&V&&V<10)ctx.warn(`${k}: VM ${V} V — IR2104 VCC는 10 V 이상 필요 (게이트 전원 별도 레일)`);
      const ret=sn?N('SNS'):'GND';
      if(!drv)['A','B'].forEach(h=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO');
        ctx.part('U','IR2104S','SOIC-8',{1:vm,2:N('IN'+h),3:N('EN'),4:'GND',5:lo,6:ph,7:ho,8:vb},{mpn:'IR2104STRPBF',desc:`하프브리지 게이트 드라이버 (${h} 레그 · 데드타임 520 ns)`,pinNames:{1:'VCC',2:'IN',3:'nSD',4:'COM',5:'LO',6:'VS',7:'HO',8:'VB'},P:0.05});
        ctx.cap(vm,'1µF',`IR2104 VCC 디커플링 (${h})`);
        ctx.part('D','ES1D','SMA',{1:vb,2:vm},{mpn:'ES1D',desc:`부트스트랩 다이오드 (${h})`,pinNames:{1:'K',2:'A'}});
        ctx.part('C','1µF','0805',{1:vb,2:ph},{desc:`부트스트랩 캡 VB–VS (${h})`});
        fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);ctx.peak(ph,Ipk,tpk);});
      bulk(ctx,vm,I,'H-브리지');ctx.peak(vm,Ipk,tpk);if(sn&&!drv)ctx.peak(ret,Ipk,tpk);
      if(sn&&!drv)shuntAmp(ctx,ret,N('ISNS'),I,'H-브리지 공통',Ipk,tpk);
      if(!drv)ctx.part('R','10kΩ','0603',{1:N('EN'),2:'GND'},{desc:'nSD 풀다운 (MCU 리셋 중 브리지 OFF)'});
      const big=bigTerm(I,Ipk);termFp(2,big?7.62:5.08);const sol=/^sol/i.test(String(p.load||''));const on=p.out&&p.out!=='auto'?String(p.out):sol?'솔레노이드':'모터';
      ctx.part('J',on,termName(2,big?99:I),{1:N('A'),2:N('B')},{mpn:big?'':'1729128',desc:`${sol?on+' 솔레노이드 출력 2핀':'DC 모터 단자'} (${big?'7.62':'5.08'} mm · 상시 ${I} A${Ipk>I?` · 피크 ${Ipk} A ${tpk} s`:''})`,pinNames:sol?{1:on+'+',2:on+'−'}:{1:'M+',2:'M−'}});
      ctx.curr(N('A'),I);ctx.curr(N('B'),I);ctx.curr(vm,I);if(drv)return;if(sn)ctx.curr(ret,I);
      ctx.sig(N('INA'),'pwm');ctx.sig(N('INB'),'pwm');ctx.sig(N('EN'),'gpio_out');}},
  gdrv3:{label:'3상 인버터 (게이트 드라이버 + 외부 N-MOSFET 6개)',desc:'하프브리지 게이트 드라이버 ×3 (IR2104S) + N-MOSFET ×6 (DPAK, 병렬) + 게이트 저항·풀다운 + 레그별 로우사이드 션트 ×3 + 전류 앰프 ×3 → ADC + VM 벌크/세라믹 + 상 단자(5.08 mm) + 홀 입력(선택)',
    params:{i:{def:20,desc:'상시(연속) 상전류 A — 손실 · 발열 · 상시 패턴 폭'},ipk:{def:'auto',desc:'피크 상전류 A (기동 · 구속 · 과부하, auto = 상시와 같음) — FET · 션트 범위 · 단자 · 피크 패턴 폭'},tpk:{def:2,desc:'피크 지속 시간 s (패턴의 피크 온도 상승 계산)'},tper:{def:0,desc:'피크 반복 주기 s (0 = 단발 · 값을 주면 상시 전류 대신 RMS로 패턴 폭 계산)'},prof:{def:'',desc:'추가 전류 구간 "A@초/주기초, …" (예: 40@2/30, 60@0.1) — RMS와 구간별 피크 온도 상승에 반영'},hall:{def:1,desc:'홀 센서 입력 (1/0)'},hallv:{def:5,desc:'홀 센서 공급 전압 V (5 · 9 · 12 — 그 레일이 있어야 함)'},fet:{def:'single',desc:'MOSFET 패키지: single (DPAK ×6) · IAUC60N04S6N050H (하프브리지 ×3) · IPG20N04S4L-07 (듀얼 ×3)'},driver:{def:'IR2104',desc:'게이트 드라이버: IR2104 (하프브리지 ×3) · A4911 · A4918 (Allegro 3상 · SPI 진단 · 센스 앰프 ×3 내장) · DRV8334 (TI 3상 · SPI · 센스 앰프 ×3, 4.5–60 V)'},vm:{def:'auto',desc:'VM 레일 (auto = 입력 레일)'}},
    build(ctx,p){const vm=p.vm==='auto'?ctx.highest(8):p.vm;ctx.use(vm);const I=Math.max(1,+p.i||20);const{Ipk,tpk}=peakOf(p,I);ctx._cu=copperOf(ctx,p,I,Ipk,tpk,true);const k=ctx.uniq('PH');const N=x=>k==='PH'?'PH_'+x:k+'_'+x;
      const V=ctx.railV?ctx.railV(vm):12;const pwr=motorPower(ctx,I,V,fetChoice(ctx,p,I,V,k),Ipk);pwr.tpk=tpk;if(ctx._cu)ctx._cu.par=pwr.par||1;
      let drv=allegroDrv(p.driver);if(drv&&!allegro3(ctx,drv,vm,I,pwr,N))drv=null;if(!drv&&/8334/.test(String(p.driver||''))&&ti8334(ctx,vm,I,pwr,N))drv='DRV8334'; // no pin table → IR2104 stage instead (warned)
      if(!drv&&V&&V<10)ctx.warn(`${k}: VM ${V} V — IR2104 VCC는 10 V 이상 필요 (게이트 전원 별도 레일)`);
      if(!drv)['U','V','W'].forEach(h=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO'),ret=N(h+'_SNS');
        ctx.part('U','IR2104S','SOIC-8',{1:vm,2:N('IN_'+h),3:N('EN'),4:'GND',5:lo,6:ph,7:ho,8:vb},{mpn:'IR2104STRPBF',desc:`하프브리지 게이트 드라이버 (${h}상)`,pinNames:{1:'VCC',2:'IN',3:'nSD',4:'COM',5:'LO',6:'VS',7:'HO',8:'VB'},P:0.05});
        ctx.cap(vm,'1µF',`IR2104 VCC 디커플링 (${h})`);
        ctx.part('D','ES1D','SMA',{1:vb,2:vm},{mpn:'ES1D',desc:`부트스트랩 다이오드 (${h})`,pinNames:{1:'K',2:'A'}});
        ctx.part('C','1µF','0805',{1:vb,2:ph},{desc:`부트스트랩 캡 VB–VS (${h})`});
        fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);shuntAmp(ctx,ret,N('ISNS_'+h),I,h+'상',Ipk,tpk);
        ctx.curr(ph,I);ctx.curr(ret,I,'leg');ctx.peak(ph,Ipk,tpk);ctx.peak(ret,Ipk,tpk);ctx.sig(N('IN_'+h),'pwm','pwm3');});
      bulk(ctx,vm,I,'3상 인버터');ctx.curr(vm,I);ctx.peak(vm,Ipk,tpk);
      if(!drv){ctx.part('R','10kΩ','0603',{1:N('EN'),2:'GND'},{desc:'nSD 풀다운 (MCU 리셋 중 인버터 OFF)'});ctx.sig(N('EN'),'gpio_out');}
      const big=bigTerm(I,Ipk);termFp(3,big?7.62:5.08);ctx.part('J','모터 상',termName(3,big?99:I),{1:N('U'),2:N('V'),3:N('W')},{mpn:big?'':'1729131',desc:`3상 모터 단자 (${big?'7.62 mm — 상시 '+I+' A · 피크 '+Ipk+' A 정격 품번 지정 필요':'5.08 mm'} · 상시 ${I} A${Ipk>I?` · 피크 ${Ipk} A ${tpk} s`:''})`,pinNames:{1:'U',2:'V',3:'W'}});
      if(+p.hall){const hv=+p.hallv||5;const hr=railOf(hv);ctx.use(hr);ctx.use('+3V3');const hin=x=>N('HALL_'+x+(hv>5?'_IN':''));ctx.part('J','홀','HDR-1x5',{1:hr,2:hin('A'),3:hin('B'),4:hin('C'),5:'GND'},{mpn:'61300511121',desc:`홀 센서 커넥터 (공급 ${hv} V)`,pinNames:{1:hv+'V',2:'H1',3:'H2',4:'H3',5:'GND'}});
        // open-collector hall outputs pulled up to the MCU rail; with a supply above 5 V a series resistor + clamp keeps a shorted / push-pull sensor off the MCU pin
        ['A','B','C'].forEach(x=>{const raw=N('HALL_'+x+(hv>5?'_IN':''));if(hv>5){ctx.part('R','1kΩ','0603',{1:raw,2:N('HALL_'+x)},{desc:'홀 입력 직렬 저항 (과전압 전류 제한)'});ctx.part('D','BAT54S','SOT-23',{1:'GND',2:'+3V3',3:N('HALL_'+x)},{mpn:'BAT54S',desc:'홀 입력 클램프 (GND·3.3 V)',pinNames:{1:'A1',2:'K2',3:'K1/A2'}});
            ctx.part('C','1nF','0603',{1:raw,2:'GND'},{desc:'홀 커넥터 측 필터'});}
          ctx.part('R','4.7kΩ','0603',{1:'+3V3',2:N('HALL_'+x)},{desc:'홀 출력 풀업'});ctx.part('C','1nF','0603',{1:N('HALL_'+x),2:'GND'},{desc:'홀 입력 필터'});ctx.sig(N('HALL_'+x),'irq_in');});}}},
  spare:{label:'예비 I/O (아날로그 입력 · PWM 출력)',desc:'예비 아날로그 입력 (직렬 1 kΩ + 10 nF + BAT54S 클램프 → ADC) · 예비 PWM 출력 (MCU → 2.7 kΩ 직렬 · 1 nF) · 2핀 커넥터',params:{ain:{def:1,desc:'예비 아날로그 입력 (1/0)'},pwm:{def:1,desc:'예비 PWM 출력 (1/0)'}},
    build(ctx,p){const vs=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(vs);const k=ctx.uniq('SPARE');const N=x=>k==='SPARE'?'SPARE_'+x:k+'_'+x;const J={};let i=1;const nm={};
      if(+p.ain){const raw=N('AIN_IN'),ain=N('AIN');ctx.part('R','1kΩ','0603',{1:raw,2:ain},{desc:'예비 아날로그 입력 직렬 저항 (과전압 전류 제한)'});ctx.part('C','10nF','0603',{1:ain,2:'GND'},{desc:'예비 아날로그 입력 RC 필터'});
        ctx.part('D','BAT54S','SOT-23',{1:'GND',2:vs,3:ain},{mpn:'BAT54S',desc:'예비 아날로그 입력 클램프 (GND · 3.3 V)',pinNames:{1:'A1',2:'K2',3:'K1/A2'}});ctx.sig(ain,'adc');J[i]=raw;nm[i]='SPARE_AIN';i++;}
      if(+p.pwm){const pw=N('PWM'),out=N('PWM_OUT');ctx.part('R','2.7kΩ','0603',{1:pw,2:out},{desc:'예비 PWM 출력 직렬 저항 2.7 kΩ — 배터리 단락(16 V) 시 MCU 핀 주입 ≤ 5 mA (TC364 한도) · RC 2.7 µs로 kHz PWM 통과'});ctx.part('C','1nF','0603',{1:out,2:'GND'},{desc:'예비 PWM 출력 ESD · EMC 캡'});ctx.sig(pw,'pwm');J[i]=out;nm[i]='SPARE_PWM';i++;}
      if(i>1)ctx.part('J','SPARE','HDR-1x'+(i-1),J,{mpn:'',desc:'예비 I/O 커넥터',pinNames:nm});}},
  dcmotor:{label:'DC 모터 (로우사이드 FET)',desc:'AO3400A + 게이트 저항·풀다운 + 플라이백 SS14 + 0.1 Ω 션트 + RC 필터 → ADC',params:{shunt:{def:1,desc:'전류 검출 (1/0)'}},
    build(ctx,p){const vm=ctx.highest(3);ctx.use(vm);const s=+p.shunt;
      ctx.part('J','모터','HDR-1x2',{1:vm,2:'MOT_N'},{mpn:'61300211121',desc:'DC 모터 커넥터',pinNames:{1:'+',2:'−'}});
      ctx.part('Q','AO3400A','SOT-23',{1:'GATE',2:s?'I_SENSE':'GND',3:'MOT_N'},{mpn:'AO3400A',desc:'N채널 MOSFET 로우사이드 스위치',pinNames:{1:'G',2:'S',3:'D'},P:0.15,lk:'phase'});
      ctx.part('R','100Ω','0603',{1:'MOT_PWM',2:'GATE'},{desc:'게이트 직렬 저항'});ctx.part('R','10kΩ','0603',{1:'GND',2:'GATE'},{desc:'게이트 풀다운'});
      ctx.part('D','SS14','SMA',{1:vm,2:'MOT_N'},{mpn:'SS14HE3_A/H',desc:'플라이백 쇼트키',pinNames:{1:'K',2:'A'}});ctx.cap(vm,'100nF','모터 전원 바이패스');
      ctx.sig('MOT_PWM','pwm');
      if(s){ctx.part('R','0.1Ω','1206',{1:'GND',2:'I_SENSE'},{mpn:'RL1206FR-070R1L',desc:'전류 검출 션트',P:0.05});ctx.part('R','10kΩ','0603',{1:'ISNS_ADC',2:'I_SENSE'},{desc:'RC 필터 저항'});ctx.part('C','1µF','0603',{1:'ISNS_ADC',2:'GND'},{desc:'RC 필터 캡'});ctx.sig('ISNS_ADC','adc');}}},
  led:{label:'상태 LED',desc:'LED + 330 Ω (MCU GPIO 구동)',params:{n:{def:1,desc:'개수'},color:{def:'녹색',desc:'녹색 · 빨강 · 파랑'}},
    build(ctx,p){const n=Math.max(1,Math.min(8,+p.n||1));const mpn={녹색:'APT1608SGC',빨강:'APT1608EC',파랑:'APT1608QBC/D'}[p.color]||'APT1608SGC';
      for(let i=0;i<n;i++){const net=ctx.uniq('LED'),a=net+'_A';ctx.part('R','330Ω','0603',{1:a,2:net},{desc:'LED 전류 제한'});ctx.part('D','LED '+p.color,'LED-0603',{1:'GND',2:a},{mpn,desc:'상태 LED',pinNames:{1:'K',2:'A'}});ctx.sig(net,'gpio_out');}}},
  button:{label:'버튼',desc:'6×6 택트 스위치 + 10 kΩ 풀업 + 100 nF 디바운스',params:{n:{def:1,desc:'개수'}},
    build(ctx,p){const n=Math.max(1,Math.min(6,+p.n||1));for(let i=0;i<n;i++){const net=ctx.uniq('BTN');ctx.use('+3V3');
      ctx.part('SW','B3FS','SW-6x6',{1:net,2:net,3:'GND',4:'GND'},{mpn:'B3FS-1000P',desc:'택트 스위치'});ctx.part('R','10kΩ','0603',{1:'+3V3',2:net},{desc:'버튼 풀업'});ctx.part('C','100nF','0603',{1:net,2:'GND'},{desc:'디바운스'});ctx.sig(net,'irq_in');}}},
  flash:{label:'SPI 플래시',desc:'W25Q32JV 32 Mbit · /WP·/HOLD 풀업 · 100 nF',params:{},
    build(ctx){ctx.use('+3V3');ctx.part('U','W25Q32JV','SOIC-8',{1:'FLASH_CS',2:'FLASH_MISO',3:'FLASH_WP',4:'GND',5:'FLASH_MOSI',6:'FLASH_SCK',7:'FLASH_HOLD',8:'+3V3'},{mpn:'W25Q32JVSSIQ',desc:'SPI NOR 플래시',pinNames:{1:'/CS',2:'DO',3:'/WP',4:'GND',5:'DI',6:'CLK',7:'/HOLD',8:'VCC'},P:0.03});
      ctx.cap('+3V3','100nF','플래시 디커플링');ctx.part('R','10kΩ','0603',{1:'+3V3',2:'FLASH_WP'},{desc:'/WP 풀업'});ctx.part('R','10kΩ','0603',{1:'+3V3',2:'FLASH_HOLD'},{desc:'/HOLD 풀업'});ctx.part('R','10kΩ','0603',{1:'+3V3',2:'FLASH_CS'},{desc:'/CS 풀업 (부팅 중 비선택)'});
      ctx.sig('FLASH_SCK','spi_sck','spi');ctx.sig('FLASH_MOSI','spi_mosi','spi');ctx.sig('FLASH_MISO','spi_miso','spi');ctx.sig('FLASH_CS','gpio_out');}},
  uart:{label:'UART 헤더',desc:'디버그 시리얼 헤더 (TX · RX · GND · 3V3)',params:{},
    build(ctx){ctx.use('+3V3');ctx.part('J','UART','HDR-1x4',{1:'DBG_TX',2:'DBG_RX',3:'GND',4:'+3V3'},{mpn:'61300411121',desc:'UART 디버그 헤더',pinNames:{1:'TX',2:'RX',3:'GND',4:'3V3'}});ctx.sig('DBG_TX','uart_tx','uart');ctx.sig('DBG_RX','uart_rx','uart');}},
  i2c:{label:'I²C 확장 헤더',desc:'SDA·SCL 4.7 kΩ 풀업 + 헤더',params:{},
    build(ctx){ctx.use('+3V3');ctx.part('J','I²C','HDR-1x4',{1:'+3V3',2:'I2C_SDA',3:'I2C_SCL',4:'GND'},{mpn:'61300411121',desc:'I²C 확장 헤더',pinNames:{1:'3V3',2:'SDA',3:'SCL',4:'GND'}});
      ctx.part('R','4.7kΩ','0603',{1:'+3V3',2:'I2C_SDA'},{desc:'SDA 풀업'});ctx.part('R','4.7kΩ','0603',{1:'+3V3',2:'I2C_SCL'},{desc:'SCL 풀업'});ctx.sig('I2C_SCL','i2c_scl','i2c');ctx.sig('I2C_SDA','i2c_sda','i2c');}},
  supervisor:{label:'전원 감시 + 외부 워치독',desc:'TPS3823 (SOT-23-5): VDD 감시 리셋 + WDI 윈도우 워치독 → MCU 리셋 · WDI는 MCU GPIO',params:{rail:{def:'+3V3',desc:'감시할 코어 레일'},wdt:{def:1,desc:'WDI 워치독 연결 (1/0)'}},
    build(ctx,p){const rail=p.rail||'+3V3';ctx.use(rail);const rst=rstNet(ctx);
      // TPS3823 DBV pinout (datasheet · KiCad TPS3823-xxDBV): 1 RESET · 2 GND · 3 MR (unused → VDD) · 4 WDI · 5 VDD
      ctx.part('U','TPS3823-33','SOT-23-5',{1:rst,2:'GND',3:rail,4:+p.wdt?'WDI':'',5:rail},{mpn:'TPS3823-33DBVR',desc:'전원 감시 리셋 + 윈도우 워치독 (1.6 s)',pinNames:{1:'RESET',2:'GND',3:'MR',4:'WDI',5:'VDD'}});
      ctx.cap(rail,'100nF','감시 IC 디커플링');if(+p.wdt)ctx.sig('WDI','gpio_out');}},
  // Infineon TLF35584 safety PMIC: step-down pre-regulator → µC LDO (QUC) · communication LDO (QCO 5 V) · reference (QVR 5 V) ·
  // standby LDO (QST) · trackers, window/functional watchdog, reset (ROT), interrupt, error-pin monitor, safe-state outputs, SPI.
  // Built without the optional step-up stage (battery ≥ 6 V): BSG / RSH / RSL / STU to GND, DRG open. External parts from the data sheet
  // pin table and Infineon's support notes: 2.2 MHz → 4.7 µH + 10–47 µF, 400 kHz → 22 µH + 68–100 µF; 100 nF FB–PG; QST 2 × 1 µF;
  // QUC 2.2–47 µF, QCO 1–47 µF, QVR 1–10 µF, QT1/QT2 1–10 µF, QST 0.47–10 µF (data sheet tables 13/16/27). The step-down is synchronous
  // (internal P/N MOSFETs, no catch diode; VPREREG 5.8 V typ). Unused pins per the pin table: WAK/ENA to GND, VCI/SYN/EVC open.
  pmic:{label:'안전 PMIC (TLF35584)',desc:'TLF35584 (VQFN-48): 스텝다운 프리레귤레이터 + µC LDO 3.3 V/600 mA + 통신 LDO 5 V/200 mA + 기준 5 V + 스탠바이 LDO + 윈도 워치독 · 리셋 · 안전 상태 출력 · SPI',
    params:{part:{def:'TLF35584QVVS2',desc:'TLF35584QVVS2 (µC 3.3 V) · TLF35584QVVS1 (µC 5 V)'},vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},freq:{def:'2.2M',desc:'스텝다운 주파수 2.2M (FRE 개방, 4.7 µH) · 400k (FRE = GND, 22 µH)'}},
    build(ctx,p){const mpn=String(p.part||'TLF35584QVVS2');const rec=pickRec(mpn)||pickRec('TLF35584QVVS2');if(!rec)throw new Error('TLF35584 핀 표가 없습니다 (datasheets/pins.json)');
      const src=p.vin==='auto'?ctx.highest(6):p.vin;ctx.use(src);const vuc=/VS1/i.test(mpn)?5:3.3;const quc=railOf(vuc),qco=vuc===5?'+5V_COM':'+5V';const lf=/400/.test(String(p.freq));
      ctx.provide(quc,vuc,'PMIC');ctx.provide(qco,5,'PMIC');const pre=ctx.uniq('PMIC_PRE'),sw=ctx.uniq('PMIC_SW'),qvr=ctx.uniq('VREF_5V'),qst=ctx.uniq('VSTBY');ctx.provide(qvr,5,'PMIC');ctx.provide(qst,vuc,'PMIC');
      const rst=rstNet(ctx);const qt1=ctx.uniq('PMIC_QT1'),qt2=ctx.uniq('PMIC_QT2');
      const N={BSG:'GND',VST:src,ENA:'GND',WAK:'GND',QST:qst,AG1:'GND',AG2:'GND',AG3:'GND',AGS1:'GND',AGS2:'GND',SS1:'PMIC_SS1',SS2:'PMIC_SS2',SDI:'PMIC_SDI',SDO:'PMIC_SDO',SCL:'PMIC_SCL',SCS:'PMIC_SCS',WDI:'WDI',ROT:rst,INT:'PMIC_INT',SYN:'',ERR:'PMIC_ERR',EVC:'',
        MPS:'GND',SEC:'GND',FRE:lf?'GND':'',STU:'GND',VCI:'',GST:'GND',QVR:qvr,QUC:quc,QCO:qco,QT1:qt1,QT2:qt2,FB1:pre,FB2:pre,PG1:'GND',PG2:'GND',SW1:sw,VS1:src,DRG:'',RSH:'GND',RSL:'GND'};
      const pins={},names={};let ep=false;rec.pins.forEach(q=>{const num=String(q.num),nm=String(q.name||'').toUpperCase().replace(/[\s.]/g,'');if(/^EP\d$/.test(num))return; // corner pads: not soldered, not connected
        if(/^(EP|PAD|TAB)$/.test(num)){ep=true;return;}names[num]=q.name;if(/^NC$/.test(nm))return;if(!(nm in N)){ctx.warn(`${rec.mpn}: 핀 ${q.name}의 역할을 몰라 개방으로 둡니다`);return;}if(N[nm])pins[num]=N[nm];});
      const fp=(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')?FPGEN.ensure(PCB,'VQFN-48-EP',48):'QFN-48';if(ep){pins['49']='GND';names['49']='GND (쿨링 탭)';}
      const u=ctx.part('U',rec.mpn,fp,pins,{mpn:rec.mpn,desc:`안전 PMIC ${rec.mpn}: 프리레귤레이터 ${lf?'400 kHz':'2.2 MHz'} → ${quc} ${vuc} V/600 mA (µC) · ${qco} 5 V/200 mA (통신) · ${qvr} 5 V 기준 · ${qst} 스탠바이 · 워치독 · 리셋 ${rst} · SS1/SS2 (입력 ${src}, 스텝업 미사용 — 배터리 6 V 이상)`,pinNames:names,P:0.6});
      if(u)u.pmic={src,vmin:6,outs:[{out:quc,vout:vuc},{out:qco,vout:5},{out:qvr,vout:5},{out:qst,vout:vuc}],basis:'TLF35584 공급 6–40 V (스텝업 미사용), 기동 시 6.0 V 이상'};
      ctx.part('L',lf?'22µH':'4.7µH','IND-5x5',{1:sw,2:pre},{mpn:lf?'SRN5040-220M':'SRN5040-4R7M',desc:`TLF35584 스텝다운 인덕터 (${lf?'400 kHz → 22 µH':'2.2 MHz → 4.7 µH'}, Infineon 지원 안내값 · 포화 전류는 부하로 확인)`,P:0.1});
      ctx.part('C','22µF','1210',{1:pre,2:'GND'},{desc:`TLF35584 프리레귤레이터 출력 커패시터 (${lf?'400 kHz는 68–100 µF 필요 — 병렬 추가':'2.2 MHz: 10–47 µF'}, FB1/FB2에 저임피던스로)`});
      if(lf){ctx.part('C','22µF','1210',{1:pre,2:'GND'},{desc:'TLF35584 프리레귤레이터 출력 커패시터 (병렬 2)'});ctx.part('C','22µF','1210',{1:pre,2:'GND'},{desc:'TLF35584 프리레귤레이터 출력 커패시터 (병렬 3)'});}
      ctx.part('C','100nF','0603',{1:pre,2:'GND'},{desc:'TLF35584 FB1/FB2 – PG1/PG2 100 nF (핀 가까이)'});
      ctx.cap(src,'10µF','TLF35584 VS1 입력 커패시터 (역접속 보호 뒤)');ctx.cap(src,'100nF','TLF35584 VS1 · VST 디커플링');
      ctx.part('C','1µF','0603',{1:qst,2:'GND'},{desc:'TLF35584 QST 스탠바이 LDO 출력 (0.47–10 µF, ESR ≤ 200 mΩ · 2 × 1 µF) 1'});ctx.part('C','1µF','0603',{1:qst,2:'GND'},{desc:'TLF35584 QST 스탠바이 LDO 출력 2'});
      ctx.cap(quc,'10µF','TLF35584 QUC 출력 커패시터 (2.2–47 µF, ESR ≤ 200 mΩ)');ctx.part('C','4.7µF','0805',{1:qco,2:'GND'},{desc:'TLF35584 QCO 출력 커패시터 (1–47 µF, ESR ≤ 200 mΩ)'});
      ctx.part('C','2.2µF','0603',{1:qvr,2:'GND'},{desc:'TLF35584 QVR 기준 출력 커패시터 (1–10 µF, ESR ≤ 200 mΩ)'});
      ctx.part('C','2.2µF','0603',{1:qt1,2:'GND'},{desc:'TLF35584 트래커 1 출력 커패시터 (1–10 µF, ESR ≤ 200 mΩ · QVR 추종 ±10 mV, 150 mA — 센서 전원으로 쓰면 이 넷에서)'});ctx.part('C','2.2µF','0603',{1:qt2,2:'GND'},{desc:'TLF35584 트래커 2 출력 커패시터 (1–10 µF, ESR ≤ 200 mΩ)'});
      ctx.sig('PMIC_SCL','spi_sck','spi');ctx.sig('PMIC_SDI','spi_mosi','spi');ctx.sig('PMIC_SDO','spi_miso','spi');ctx.sig('PMIC_SCS','gpio_out');ctx.sig('WDI','gpio_out');ctx.sig('PMIC_INT','irq_in');ctx.sig('PMIC_ERR','gpio_out');
      ctx.warn(`${rec.mpn}: WAK · ENA는 GND(미사용) — 배터리 연결 시 자동 기동, STANDBY/SLEEP에서 깨우려면 WAK 또는 ENA에 신호 필요(임계 0.8–2.0 V) · SS1/SS2는 넷만 만들고 미연결(INIT/FAILSAFE에서 Low, NORMAL에서 High)`);
      ctx.warn(`${rec.mpn}: 스텝업 단을 넣지 않아 배터리 6 V 미만(크랭킹)에서는 출력이 유지되지 않습니다 — 필요하면 외부 MOSFET · 다이오드 · 인덕터 · 센스 저항으로 스텝업 추가`);}},
  pmic48:{label:'48 V 안전 PMIC (A81481)',desc:'Allegro A81481 (QFN 6 × 6): 48 V 직결 단일 칩 PMIC — VIN 12–72 V(절대 최대 80 V), 벅 2개(12.5 V · 5.4 V) + 1 % LDO 5개, 3중 워치독, ASIL D 대응. 출시 전 부품 — 핀 배치는 A81411 계열 기준 가정',
    params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vuc:{def:3.3,desc:'µC LDO 전압 3.3 · 5 (VUCSEL)'}},
    build(ctx,p){const rec=pickRec('A81481');if(!rec)throw new Error('A81481 핀 표가 없습니다 (datasheets/pins.json)');
      // published: 12–72 V input, 80 V abs max, buck 12.5 V and 5.4 V feeding five LDOs, triple watchdog, 6 × 6 QFN. Everything else here —
      // pin numbers, the split of the five LDOs (µC · general · always-on · two protected sensor outputs, as on the A81411), switching
      // frequency and the L / C values — is an assumption until the data sheet is available
      const src=p.vin==='auto'?ctx.highest(14):p.vin;ctx.use(src);const vuc=+p.vuc===5?5:3.3;const quc=railOf(vuc),qa=vuc===5?'+5V_COM':'+5V',v12=railOf(12);
      const v54=ctx.uniq('PMIC_VREG2'),lx1=ctx.uniq('PMIC_LX1'),lx2=ctx.uniq('PMIC_LX2'),b1=ctx.uniq('PMIC_BOOT1'),b2=ctx.uniq('PMIC_BOOT2'),vcc=ctx.uniq('PMIC_VCC'),qb=ctx.uniq('V5_AON'),p1=ctx.uniq('V5P1'),p2=ctx.uniq('V5P2');
      ctx.provide(v12,12.5,'PMIC');ctx.provide(quc,vuc,'PMIC');ctx.provide(qa,5,'PMIC');ctx.provide(qb,5,'PMIC');ctx.provide(p1,5,'PMIC');ctx.provide(p2,5,'PMIC');const rst=rstNet(ctx);
      const N={VIN:src,BOOT1:b1,LX1:lx1,PGND1:'GND',VREG1:v12,VIN2:v12,BOOT2:b2,LX2:lx2,PGND2:'GND',VREG2:v54,VREGLDO:v54,VUCIN:v54,VUC:quc,VUCSEL:vuc===5?vcc:'GND',VLDOA:qa,VLDOB:qb,VLDOBSEL:vcc,VLDOP1:p1,VLDOP2:p2,VCC:vcc,AGND:'GND',
        ENBAT:'PMIC_ENBAT',ENCAN:'GND',EN:'GND',NPOR:rst,FFN:'PMIC_FFN',POE:'PMIC_POE',WD_FN:'PMIC_WDF',WDIN:'WDI',SCK:'PMIC_SCL',SDI:'PMIC_SDI',SDO:'PMIC_SDO',STRN:'PMIC_SCS',DIAG:'PMIC_DIAG',GND:'GND'};
      const pins={},names={};rec.pins.forEach(q=>{const num=String(q.num),nm=String(q.name||'').toUpperCase().replace(/[\s.]/g,'');names[num]=q.name;if(/^(EP|PAD|TAB)$/.test(nm)){pins[num]='GND';names[num]='GND (노출 패드)';return;}if(/^NC$/.test(nm))return;
        if(!(nm in N)){ctx.warn(`A81481: 핀 ${q.name}의 역할을 몰라 개방으로 둡니다`);return;}if(N[nm])pins[num]=N[nm];});
      const fp=(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')?FPGEN.ensure(PCB,'QFN-40-6x6',40):'QFN-40-6x6';
      const u=ctx.part('U','A81481',fp,pins,{mpn:'A81481',desc:`48 V 안전 PMIC A81481 (입력 ${src} 12–72 V): 벅 1 → ${v12} 12.5 V · 벅 2 → 5.4 V → LDO ${quc} ${vuc} V (µC) · ${qa} 5 V · ${qb} 5 V 상시 · ${p1}/${p2} 5 V 보호 센서 출력 · 워치독 · 리셋 ${rst} — 핀 배치 가정(출시 전)`,pinNames:names,P:0.9});
      if(u){u.pmic={src,vmin:12,outs:[{out:v12,vout:12.5},{out:quc,vout:vuc},{out:qa,vout:5},{out:qb,vout:5},{out:p1,vout:5},{out:p2,vout:5}],basis:'A81481 공급 12–72 V (제품 페이지), 기동 시 12 V 이상'};}
      ctx.cap(src,'4.7µF','A81481 VIN 입력 커패시터 (VIN–PGND1 바로 옆)');ctx.cap(src,'100nF','A81481 VIN 고주파 디커플링');
      ctx.part('C','100nF','0603',{1:b1,2:lx1},{desc:'A81481 벅 1 부트스트랩 (BOOT1–LX1)'});ctx.part('C','100nF','0603',{1:b2,2:lx2},{desc:'A81481 벅 2 부트스트랩 (BOOT2–LX2)'});
      ctx.part('L','22µH','IND-5x5',{1:lx1,2:v12},{mpn:'SRN5040-220M',desc:'A81481 벅 1 인덕터 48 → 12.5 V (가정값 — 주파수 · 전류 미공개)',P:0.15});
      ctx.cap(v12,'10µF','A81481 벅 1 출력 커패시터 (VREG1)');ctx.cap(v12,'10µF','A81481 벅 1 출력 커패시터 (DC 바이어스 여유)');
      ctx.part('L','4.7µH','IND-5x5',{1:lx2,2:v54},{mpn:'SRN5040-4R7M',desc:'A81481 벅 2 인덕터 12.5 → 5.4 V (가정값)',P:0.1});
      ctx.part('C','22µF','1210',{1:v54,2:'GND'},{desc:'A81481 벅 2 출력 커패시터 (VREG2 5.4 V · LDO 입력)'});ctx.part('C','100nF','0603',{1:v54,2:'GND'},{desc:'A81481 VREGLDO · VUCIN 디커플링 (핀 가까이)'});
      ctx.part('C','1µF','0603',{1:vcc,2:'GND'},{desc:'A81481 VCC 내부 바이어스 바이패스'});
      ctx.cap(quc,'10µF','A81481 VUC 출력 커패시터');ctx.part('C','2.2µF','0603',{1:qa,2:'GND'},{desc:'A81481 VLDOA 출력 커패시터 (5 V · CAN 등)'});ctx.part('C','2.2µF','0603',{1:qb,2:'GND'},{desc:'A81481 VLDOB 출력 커패시터 (5 V 상시)'});
      ctx.part('C','2.2µF','0603',{1:p1,2:'GND'},{desc:'A81481 VLDOP1 출력 커패시터 (보호 센서 전원 1)'});ctx.part('C','2.2µF','0603',{1:p2,2:'GND'},{desc:'A81481 VLDOP2 출력 커패시터 (보호 센서 전원 2)'});
      ctx.part('R','100kΩ','0603',{1:src,2:'PMIC_ENBAT'},{desc:'A81481 ENBAT 직렬 저항 (입력에서 상시 기동 · 전류 제한)'});
      ['PMIC_FFN','PMIC_WDF'].forEach(n=>ctx.part('R','10kΩ','0603',{1:n,2:quc},{desc:`A81481 ${n==='PMIC_FFN'?'FFn 고장 플래그':'WD_Fn 워치독 고장'} 오픈 드레인 풀업`}));
      ctx.sig('PMIC_SCL','spi_sck','spi');ctx.sig('PMIC_SDI','spi_mosi','spi');ctx.sig('PMIC_SDO','spi_miso','spi');ctx.sig('PMIC_SCS','gpio_out');ctx.sig('WDI','gpio_out');ctx.sig('PMIC_FFN','irq_in');ctx.sig('PMIC_WDF','irq_in');ctx.sig('PMIC_POE','gpio_in');ctx.sig('PMIC_DIAG','adc');
      ctx.warn('A81481: 출시 전 부품(데이터시트 비공개 · 샘플 요청 단계) — 핀 번호 · LDO 구성 · 인덕터/커패시터 값은 A81411 계열 기준 가정입니다. 실제 데이터시트로 핀 표(datasheets/pins.json)와 주변 회로를 교체하기 전에는 출도 불가');}},
  hs_switch:{label:'하이사이드 전원 스위치 (세이프 스테이트)',desc:'P-MOSFET 하이사이드 + N-MOSFET 레벨시프트 · MCU SAFE_EN이 High일 때만 부하 전원 공급 (이중 차단)',params:{pick:{def:'',desc:'시스템 설계에서 고른 부품 (핀 표가 블록 역할에 맞으면 이 부품으로 회로를 만듦)'},rail:{def:'auto',desc:'끊을 전원 레일 (auto = 입력)'}},
    build(ctx,p){const r=p.rail==='auto'?ctx.highest(0):p.rail;ctx.use(r);const out=r+'_SW';ctx.provide(out,ctx.railV?ctx.railV(r):12,'스위치');
      if(p.pick&&hsPick(ctx,p,r,out))return;
      ctx.part('Q','AO3401A','SOT-23',{1:'HS_G',2:out,3:r},{mpn:'AO3401A',desc:'하이사이드 P-MOSFET (부하 전원 차단)',pinNames:{1:'G',2:'D',3:'S'}});
      ctx.part('R','10kΩ','0603',{1:r,2:'HS_G'},{desc:'게이트 풀업 (기본 OFF)'});ctx.part('Q','AO3400A','SOT-23',{1:'SAFE_EN',2:'HS_G',3:'GND'},{mpn:'AO3400A',desc:'레벨 시프트 N-MOSFET'});
      ctx.part('R','10kΩ','0603',{1:'SAFE_EN',2:'GND'},{desc:'SAFE_EN 풀다운 (MCU 리셋 중 OFF)'});ctx.sig('SAFE_EN','gpio_out');}},
  part:{label:'지정 부품 (MPN)',desc:'부품 라이브러리(승인 목록·내장·Claude 추정)의 핀 배열로 심볼·풋프린트를 만들어 넣음 · 전원/접지 핀은 레일에, SPI/I²C/UART/IRQ 핀은 MCU에 자동 배정',params:{mpn:{def:'',desc:'부품 번호 (예: CC2420RTCR)'},pins:{def:'',desc:'핀=넷 지정 (SI=SPI_MOSI,CSn=RF_CS …)'},vcc:{def:'auto',desc:'전원 핀 레일 (auto = 3.3 V급 레일)'}},
    build(ctx,p){const mpn=String(p.mpn||'').trim();if(!mpn){ctx.warn('part 블록: --mpn 부품 번호가 필요합니다');return;}const rec=NEWPROJ.partLookup?NEWPROJ.partLookup(mpn):null;
      if(!rec||!(rec.pins&&rec.pins.length)){ctx.warn(`${mpn}: 라이브러리에 핀 정보가 없어 회로에 넣지 못했습니다 — 2단계 회로 콘솔에서 "add part ${mpn}" (Claude 추정)`);return;}
      const R=typeof PARTLIB!=='undefined'?PARTLIB.role:()=>'';const W={};String(p.pins||'').split(/[,\s]+/).filter(Boolean).forEach(t=>{const m=t.match(/^([^=:]+)[=:](.+)$/);if(m)W[m[1].toUpperCase()]=m[2];});
      const vcc=p.vcc&&p.vcc!=='auto'?p.vcc:(ctx.railNear?ctx.railNear(3.3):ctx.highest(0));ctx.use(vcc);const short=mpn.replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase()+String(ctx._b||'').replace(/\D/g,'');
      const pins={},names={};const sig=[];rec.pins.forEach(q=>{const nm=String(q.name||''),num=String(q.num);names[num]=nm;const r=R(nm);const w=W[nm.toUpperCase()]||W[num];
        if(w){pins[num]=w;return;}if(r==='GND'){pins[num]='GND';return;}if(r==='VCC'||r==='VIN'||/^(VDD|VCC|AVDD|DVDD|VDDIO|VBAT)/i.test(nm)){pins[num]=vcc;return;}
        const role=r==='MOSI'||/^(SI|SDI|MOSI|DIN)$/i.test(nm)?'spi_mosi':r==='MISO'||/^(SO|SDO|MISO|DOUT)$/i.test(nm)?'spi_miso':r==='SCL'&&/SCK|SCLK|CLK/i.test(nm)?'spi_sck':r==='CS'?'spi_cs':r==='SDA'?'i2c_sda':r==='SCL'?'i2c_scl':/^(TX|TXD)$/i.test(nm)?'uart_rx':/^(RX|RXD)$/i.test(nm)?'uart_tx':/INT|IRQ|FIFOP|DRDY|ALERT/i.test(nm)?'irq_in':/^(RESET|RESETN|RST|NRST|EN|CE|SHDN|VREG_EN|STB)/i.test(nm)?'gpio_out':null;
        if(role){const net=`${short}_${nm.replace(/[^A-Za-z0-9]/g,'').toUpperCase()}`;pins[num]=net;sig.push([net,role]);}});
      const fp=rec.fp&&typeof PCB!=='undefined'&&PCB.FP[rec.fp]?rec.fp:(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'&&rec.pkg?FPGEN.ensure(PCB,rec.pkg,rec.pins.length):'')||rec.pkg||'SOIC-8';
      const prefix=/connector|커넥터/i.test(rec.cat||'')?'J':/mosfet|fet|transistor/i.test(rec.cat||'')?'Q':/diode|tvs/i.test(rec.cat||'')?'D':'U';
      ctx.part(prefix,rec.mpn,fp,pins,{mpn:rec.mpn,desc:(rec.title||rec.desc||'지정 부품')+(rec.src==='ai'?' (Claude 추정 핀 배열)':''),pinNames:names,P:0.05});
      ctx.cap(vcc,'100nF',`${rec.mpn} 디커플링`);sig.forEach(([n,r])=>ctx.sig(n,r));}},
  ntc:{label:'온도 센서 (NTC)',desc:'NTC 10 kΩ B3435 + 10 kΩ 풀업 (3.3 V) + 100 nF → ADC — 보드 온도 (FET·레귤레이터 근처)',params:{pick:{def:'',desc:'시스템 설계에서 고른 부품 (핀 표가 블록 역할에 맞으면 이 부품으로 회로를 만듦)'},n:{def:1,desc:'센서 수'}},
    build(ctx,p){const n=Math.max(1,Math.min(4,+p.n||1));ctx.use('+3V3');let warned=false;for(let i=0;i<n;i++){const t=ctx.uniq('TEMP');
      const pk=p.pick?(i===0||!warned?ntcPick(ctx,p,t):null):null;if(p.pick&&!pk)warned=true;
      if(pk==='ic'){ctx.sig(t,'adc');continue;}
      ctx.part('R','10kΩ','0603',{1:'+3V3',2:t},{desc:'NTC 풀업 (1 %)'});if(pk&&pk.size)ctx.part('RT','NTC 10k',pk.size,{1:t,2:'GND'},{mpn:p.pick,desc:`NTC 서미스터 ${p.pick} (시스템 설계에서 고른 부품 · 10 kΩ 기준 — B 상수는 데이터시트로 펌웨어 환산표 확인)`,pinNames:{1:'1',2:'2'}});else ctx.part('RT','NTC 10k','0603',{1:t,2:'GND'},{mpn:'NCP18XH103F03RB',desc:'NTC 서미스터 10 kΩ B=3380 (보드 온도)',pinNames:{1:'1',2:'2'}});
      ctx.part('C','100nF','0603',{1:t,2:'GND'},{desc:'ADC 필터'});ctx.sig(t,'adc');}}},
  vmon:{label:'전압 감시',desc:'100 kΩ/22 kΩ 분압 + 100 nF → ADC (입력 레일 감시)',params:{rail:{def:'auto',desc:'감시할 레일 (auto = 입력)'}},
    build(ctx,p){const r=p.rail==='auto'?ctx.highest(0):p.rail;ctx.use(r);ctx.part('R','100kΩ','0603',{1:r,2:'VMON'},{desc:'분압 상단'});ctx.part('R','22kΩ','0603',{1:'VMON',2:'GND'},{desc:'분압 하단'});ctx.part('C','100nF','0603',{1:'VMON',2:'GND'},{desc:'ADC 필터'});ctx.sig('VMON','adc');}}};
const BLOCK_ALIAS={dcdc:'buck',smps:'buck',switching:'buck',power:'pwr_in',pwr:'pwr_in',dc:'pwr_in',input:'pwr_in',usb:'usb_in',usbc:'usb_in',regulator:'ldo',reg:'ldo',crystal:'xtal',osc:'xtal',motor:'dcmotor',dc_motor:'dcmotor',
  bldc3:'bldc',led:'led',leds:'led',btn:'button',sw:'button',spi:'flash',memory:'flash',serial:'uart',debug:'uart',monitor:'vmon',adc:'vmon',temp:'ntc',thermistor:'ntc',temperature:'ntc',wdt:'supervisor',watchdog:'supervisor',reset:'supervisor',sbc:'supervisor',cutoff:'hs_switch',hsswitch:'hs_switch',hs:'hs_switch'};
const blockKey=s=>{const k=String(s||'').toLowerCase();return LIB[k]?k:BLOCK_ALIAS[k]||null;};

/* ---------- plan ---------- */
function innerOn(plan){const v=plan&&plan.pcb?plan.pcb.inner:null;return v!=null&&v!==''?(v===true||/^(on|1|true|yes)$/i.test(String(v))):!!(plan&&plan.capInner===true);}
function newPlan(name){return{name:name||'새 프로젝트',req:'',blocks:[],board:null,seq:0,strategy:'balanced',rstFix:true,curModel:2,connGap:true,cohesion:1,underKeep:true,capInner:true};}
function addBlock(plan,type,params){const k=blockKey(type);if(!k)throw new Error(`블록: ${Object.keys(LIB).join(', ')}`);const L=LIB[k];const p={};Object.entries(L.params).forEach(([n,d])=>{p[n]=d.def;});
  Object.entries(params||{}).forEach(([n,v])=>{if(!(n in L.params))throw new Error(`${k} 블록 파라미터: ${Object.keys(L.params).join(', ')||'(없음)'}`);p[n]=v;});
  if(k==='mcu'&&plan.blocks.some(b=>b.type==='mcu'))throw new Error('MCU는 하나만 넣을 수 있습니다 (set으로 바꾸기)');
  const b={id:k+(++plan.seq),type:k,params:p};plan.blocks.push(b);return b;}
function setParam(plan,id,k,v){const b=plan.blocks.find(x=>x.id===id);if(!b)throw new Error('블록 없음: '+id);if(!(k in LIB[b.type].params))throw new Error(`${b.type} 파라미터: ${Object.keys(LIB[b.type].params).join(', ')}`);b.params[k]=v;return b;}
function removeBlock(plan,id){const i=plan.blocks.findIndex(x=>x.id===id);if(i<0)throw new Error('블록 없음: '+id);plan.blocks.splice(i,1);}

/* requirement text → blocks (fixed rules) */
function planFrom(text,name){
  const s=String(text||'');const lo=s.toLowerCase();const plan=newPlan(name||guessName(s));plan.req=s;const log=[];
  const usb=/usb/.test(lo)&&!/usb\s*없/.test(lo);let vin=null;const m=s.match(/(\d+(?:\.\d+)?)\s*V(?![a-z])/i);if(m)vin=+m[1];
  const bldc=/bldc|3상|브러시리스|brushless/.test(lo),dc=!bldc&&/(dc|브러시|직류)\s*모터|모터\s*(구동|제어)|fan|팬/.test(lo);
  const can=/\bcan\b|can\s*(fd|통신|버스)|캔\s*통신/.test(lo);const tc=/tc3|aurix|오릭스|tc364/.test(lo);
  if(!vin)vin=bldc?12:usb?5:dc?5:can?12:5;
  if(usb&&vin<=5.5)addBlock(plan,'usb_in',{data:1});else addBlock(plan,'pwr_in',{vin});log.push(usb&&vin<=5.5?'USB-C 5 V 입력':`${vin} V DC 입력`);
  const need5=can||bldc;if(vin>5.5&&need5){addBlock(plan,'ldo',{vout:5});addBlock(plan,'ldo',{vout:3.3,vin:'+5V'});log.push(`${vin} V → 5 V → 3.3 V (LDO 2단, 손실 분산)`);}
  else if(vin>5.5){addBlock(plan,'ldo',{vout:3.3});log.push(`${vin} V → 3.3 V LDO`);}else{addBlock(plan,'ldo',{vout:3.3});log.push('5 V → 3.3 V LDO');}
  addBlock(plan,'mcu',{part:tc?'TC364DP-64F300F':'STM32F042K6U6'});log.push(tc?'MCU TC364DP':'MCU STM32F042K6U6');
  if(tc||can||/크리스털|crystal|xtal|정밀/.test(lo)){addBlock(plan,'xtal',{});log.push(tc?'TC364 시스템 클럭용 20 MHz 크리스털':'CAN 비트 타이밍용 크리스털');}
  if(can)addBlock(plan,'can',{});const mk=typeof HWARCH!=='undefined'&&HWARCH.motorKind?HWARCH.motorKind(lo,bldc):{type:bldc?'bldc':'dcmotor'};const hl=/센서리스|sensorless/.test(lo)?0:1;
  if(bldc){if(mk.type==='gdrv3')addBlock(plan,'gdrv3',{i:mk.i,hall:hl});else addBlock(plan,'bldc',{hall:hl});}if(dc){if(mk.type==='hbridge')addBlock(plan,'hbridge',{i:mk.i});else addBlock(plan,'dcmotor',{shunt:1});}
  if(/플래시|flash|메모리|로그|저장/.test(lo))addBlock(plan,'flash',{});
  if(/uart|시리얼|serial|디버그\s*포트|콘솔/.test(lo))addBlock(plan,'uart',{});
  if(/i2c|i²c|센서\s*확장/.test(lo))addBlock(plan,'i2c',{});
  if(/전압\s*(감시|모니터|측정)|배터리|vbat|vmon/.test(lo)||bldc)addBlock(plan,'vmon',{});
  const nl=s.match(/LED\s*(\d+)\s*개|(\d+)\s*개의?\s*LED/i);const nled=nl?+(nl[1]||nl[2]):/led|표시등|상태/i.test(s)?1:0;if(nled)addBlock(plan,'led',{n:nled});
  const nb=s.match(/버튼\s*(\d+)\s*개|(\d+)\s*개의?\s*버튼/);const nbt=nb?+(nb[1]||nb[2]):/버튼|스위치|button/.test(lo)?1:0;if(nbt)addBlock(plan,'button',{n:nbt});
  ldoToBuck(plan,log,/ldo|선형/.test(lo));
  if(bldc)plan.strategy='thermal';else if(can||dc)plan.strategy='noise';
  return{plan,log};
}
// a first-stage LDO that would burn more than ~0.7 W becomes a buck converter
function ldoToBuck(plan,log,keep){log=log||[];const r0=build(plan);r0.parts.filter(c=>c.ldo&&c.P>0.7).forEach(c=>{const b=plan.blocks.find(x=>x.id===c.block);if(!b||b.type!=='ldo')return;
    if(keep){log.push(`${c.ref} LDO 손실 ${c.P} W — 요구사항에 LDO가 명시돼 유지`);return;}
    b.type='buck';b.id=b.id.replace(/^ldo/,'buck');b.params={vin:b.params.vin,vout:b.params.vout};log.push(`${b.params.vout} V 1단을 LDO(손실 ${c.P} W) 대신 벅 컨버터로`);});return log;}
function guessName(s){const lo=s.toLowerCase();const bl=/bldc|3상/.test(lo);const k=[bl?'BLDC':'',/\bcan\b/.test(lo)?'CAN':'',!bl&&/(^|[^l])dc\s*모터|팬|fan/.test(lo)?'DC-MOTOR':'',/usb/.test(lo)?'USB':''].filter(Boolean);return(k.join('-')||'NEW')+' BOARD v0.1';}

/* ---- power stage helpers for hbridge / gdrv3: FET choice and parallel count by current, shunt + amplifier, bulk caps ---- */
const FETS=[{mpn:'IPD90N04S4-04',v:40,rds:0.0038,label:'40 V 90 A OptiMOS-T2 (AEC-Q101)'},{mpn:'IPD50N06S4L-12',v:60,rds:0.0117,label:'60 V 50 A OptiMOS-T2 (AEC-Q101)'},{mpn:'IPD50N10S3L-16',v:100,rds:0.016,label:'100 V 50 A OptiMOS-T (AEC-Q101)'}];
// package choice of a bridge stage: explicit fet param, else the package-shrink policy (half-bridge 5 × 6 mm when it fits)
function fetChoice(ctx,p,I,V,k){if(p.fet&&p.fet!=='single')return p.fet;const lv=+(ctx.plan&&ctx.plan.shrink)||0;
  if(lv>=1&&p.fet!=='single!'&&I<=60&&(V||12)*2.5<=40){ctx.shrinkLog&&ctx.shrinkLog.push({ref:k,from:'TO-252 (DPAK) MOSFET',to:'IAUC60N04S6N050H 하프브리지 (PG-TDSON-8 5 × 6 mm)',why:`상전류 ${I} A ≤ 60 A · 2개 → 1개`,area:(6.6*10.1*2)-(5.15*6.1)});return'IAUC60N04S6N050H';}
  if(lv>=1&&ctx.shrinkLog)ctx.shrinkLog.push({ref:k,keep:true,from:'TO-252 MOSFET',why:I>60?`상전류 ${I} A > 하프브리지 60 A`:'VM 전압이 40 V 소자에 높음'});return null;}
function motorPower(ctx,I,V,fet,Ipk){Ipk=Math.max(I,+Ipk||0);const r=motorPower0(ctx,I,V,fet);r.Ipk=Ipk;const Irat=(r.f2?r.f2.i:r.f1?r.f1.i:/90N/.test(r.f.mpn)?90:50)*r.par;
  if(Ipk>Irat&&ctx.warn)ctx.warn(`${r.f.mpn}: 피크 ${Ipk} A가 연속 정격 ${Irat} A(병렬 ${r.par})를 넘음 — 데이터시트 펄스 정격 · SOA로 피크 시간 확인`);return r;}
/* drain rating a bridge FET needs: 12 / 24 V systems 2.5 × nominal (load dump), 48 V systems (ISO 21780: 60 V upper limit, 70 V
   dynamic overvoltage) the usual 80 V class */
function fetVneed(V){V=V||12;return V>=36?Math.max(75,V*1.6):V*2.5;}
/* single N-MOSFETs in small power packages: pinout and figures from the datasheet page 1.
   NVTFS6H850N (onsemi, WDFN8 3.3 × 3.3 "µ8FL"): S 1–3 · G 4 · D 5–8 (+ drain flag), 80 V, 9.5 mΩ max at 10 V, 68 A, Qg 19 nC */
const FET1={'NVTFS6H850N':{v:80,rds:0.0095,i:68,qg:19,pmax:1.0,fp:'WDFN8-3.3-FET',label:'80 V 68 A 9.5 mΩ (WDFN8 3.3 × 3.3 · AEC-Q101)',pin:(g,d,s)=>({1:s,2:s,3:s,4:g,5:d,6:d,7:d,8:d,9:d}),names:{1:'S',2:'S',3:'S',4:'G',5:'D',6:'D',7:'D',8:'D',9:'D'}}};
function apmPkg(){if(typeof PCB==='undefined'||!PCB.FP||PCB.FP['QFN-24-4x4-APM81815'])return;
  // 6 positions a side at 0.5 mm, numbered counter-clockwise from the top of the left side; positions 4, 6, 8, 20, 22, 24 are not
  // in the terminal list (creepage around VIN and SW). Exposed pads: 26 = PGND next to pins 1–3, 25 = VIN next to pin 5 — positions assumed.
  const p=[],skip=new Set([4,6,8,20,22,24]);const at=i=>{const k=(i-1)%6,o=-1.25+0.5*k;const side=Math.floor((i-1)/6);return side===0?[-1.95,-o,0.8,0.26]:side===1?[o,-1.95,0.26,0.8]:side===2?[1.95,o,0.8,0.26]:[-o,1.95,0.26,0.8];};
  for(let i=1;i<=24;i++){if(skip.has(i))continue;const[x,y,w,h]=at(i);p.push({n:''+i,x:+x.toFixed(3),y:+y.toFixed(3),w,h});}
  // pads kept 0.6 mm clear of the pin rows so a pin can reach its pad's net (GND pin 15 → PGND) and the 48 V pad keeps its distance
  p.push({n:'26',x:0,y:0.72,w:1.9,h:1.0});p.push({n:'25',x:-0.3,y:-0.72,w:1.3,h:1.0});
  const f={kind:'ic',stand:0,body:[4,4,2.1],pads:p,dot:[-1.95,1.75],gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP['QFN-24-4x4-APM81815']=f;}
function fet1Pkg(){if(typeof PCB==='undefined'||!PCB.FP||PCB.FP['WDFN8-3.3-FET'])return;
  // source / gate leads 1–4 down the left edge (0.65 mm pitch), drain leads 5–8 up the right edge joined to the drain flag (pad 9).
  // Land sizes are nominal for a 3.3 × 3.3 mm flat-lead package — check against the onsemi 511AB land pattern before release.
  const p=[];for(let i=0;i<4;i++)p.push({n:''+(1+i),x:-1.5,y:+(0.975-0.65*i).toFixed(3),w:0.75,h:0.4});for(let i=0;i<4;i++)p.push({n:''+(5+i),x:1.5,y:+(-0.975+0.65*i).toFixed(3),w:0.75,h:0.4});
  p.push({n:'9',x:0.35,y:0,w:1.9,h:2.5});const f={kind:'ic',stand:0,body:[3.3,3.3,0.75],pads:p,dot:[-1.5,1.55],gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP['WDFN8-3.3-FET']=f;}
function motorPower0(ctx,I,V,fet){const F=fet&&FET2[fet];const F1=fet&&FET1[fet];
  if(F1&&F1.v>=fetVneed(V)){
    // parallel count from the loss one small package can shed (≈ 1 W on 2 oz copper with thermal vias): each switch carries I/√2
    // RMS (×1.2 for switching), RDS(on) ×1.6 hot → P ≈ (I/par)² · RDS · 0.6 · 1.6
    const pq=n=>((I/n)**2)*F1.rds*0.6*1.6+0.02;let par=1;while(par<4&&pq(par)>F1.pmax)par++;
    if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){['2512','SOT-23-6','HDR-1x5'].forEach(k=>FPGEN.ensure(PCB,k,k==='SOT-23-6'?6:k==='HDR-1x5'?5:0));termFp(2);termFp(3);}
    if(pq(par)>F1.pmax&&ctx.warn)ctx.warn(`${fet}: 상전류 ${I} A — ${par}개 병렬에서도 FET당 ${pq(par).toFixed(1)} W, 방열 설계 필요`);
    return{f:{mpn:fet,label:F1.label,rds:F1.rds,qg:F1.qg},f1:Object.assign({mpn:fet},F1),par,Pq:+pq(par).toFixed(2),I};}
  if(F1&&ctx.warn)ctx.warn(`${fet}: ${F1.v} V 정격 — VM ${V} V에 내압 여유 부족, 다른 FET로 대체`);
  if(F&&F.v>=fetVneed(V)){const par=Math.max(1,Math.ceil(I/F.i));if(I>F.i*0.66*par&&ctx.warn)ctx.warn(`${fet}: 상전류 ${I} A — 정격 ${F.i} A(케이스 25~100 °C)의 66 % 초과, 방열(써멀 비아 · 하우징 접촉) 확인`);const Pq=+(((I/par)**2)*F.rds*0.6+0.02).toFixed(2);
    if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){['2512','SOT-23-6','HDR-1x5'].forEach(k=>FPGEN.ensure(PCB,k,k==='SOT-23-6'?6:k==='HDR-1x5'?5:0));termFp(2);termFp(3);}
    if(par>2&&ctx.warn)ctx.warn(`${fet}: 상전류 ${I} A에 상마다 ${par}개 병렬 — 더 큰 정격(하프브리지 IAUC60N04S6N050H 또는 단일 FET) 권장`);
    return{f:{mpn:fet,label:F.label,rds:F.rds},f2:Object.assign({mpn:fet},F),par,Pq,I};}
  if(F&&ctx.warn)ctx.warn(`${fet}: ${F.v} V 정격 — VM ${V} V에 내압 여유 부족, 단일 FET로 대체`);
  const f=FETS.find(x=>x.v>=fetVneed(V))||FETS[FETS.length-1];const par=I<=25?1:I<=60?2:I<=100?3:4;
  if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){['TO-252','2512','SOT-23-6','HDR-1x5'].forEach(k=>FPGEN.ensure(PCB,k,k==='SOT-23-6'?6:k==='HDR-1x5'?5:0));termFp(2);termFp(3);}
  const Pq=+(((I/par)**2)*f.rds*0.6+0.02).toFixed(2);return{f,par,Pq,I};}
// screw terminal: 5.08 mm pitch (≤ ~15 A), 7.62 mm pitch for higher currents (wider copper between the pins, larger pad / drill)
const termName=(n,I)=>`TERM-${n}-${I>15?'7.62':'5.08'}`;
// 5.08 mm terminals carry ~15 A continuous and about twice that for a few seconds
const bigTerm=(I,Ipk)=>I>15||(+Ipk||0)>30;
// copper-sizing currents of a motor block (plans with curModel 2): the RMS of the current profile (i, the main peak when it repeats
// every tper seconds, and the extra peaks in prof "I@t/T, …") instead of the continuous value, and for a sinusoidal 3-phase bridge the
// share one switch position carries — each of the high and low side conducts the phase current for half of every PWM period on
// average over an electrical cycle, so its RMS is I/√2 (leg-return / shunt nets, FET and shunt terminals). Peaks stay at their full
// value (a stalled rotor holds one leg at the peak). The DC link keeps the phase value: average 1.06·M·cosφ·I plus the bulk-cap ripple.
function copperOf(ctx,p,I,Ipk,tpk,three){if(!(ctx.plan&&ctx.plan.curModel===2)||typeof CURRENT==='undefined'||!CURRENT.profile)return null;
  const PF=CURRENT.profile(I,p.prof,{I:Ipk,t:tpk,T:+p.tper||0});const hi=PF.peaks.length?PF.peaks[0].I:Ipk;if(hi>Ipk&&ctx.warn)ctx.warn(`전류 프로파일의 ${hi} A가 ipk ${Ipk} A보다 큼 — FET · 션트 · 단자는 ipk로 정하므로 ipk를 ${hi} A로 올리세요`);
  return{I0:I,Iw:Math.max(I,PF.rms),kl:three?Math.SQRT1_2:1,par:1,Ipk:Math.max(Ipk,hi),more:PF.peaks.filter(x=>!(x.I===Ipk&&x.t===tpk)).map(x=>({I:x.I,t:x.t})),rms:PF.rms,duty:PF.duty};}
// peak current of a motor block: ipk (auto = continuous) and how long it lasts
function peakOf(p,I){const v=p&&p.ipk;const mx=String(v||'').match(/^[x×]\s*(\d+(?:\.\d+)?)$/i);const Ipk=v==null||v==='auto'||v===''?I:mx?I*+mx[1]:Math.max(I,parseFloat(v)||I);return{Ipk,tpk:Math.max(0.01,+(p&&p.tpk)||2)};}
function termFp(n,pitch){if(typeof PCB==='undefined'||!PCB.FP)return;pitch=pitch||5.08;const k=`TERM-${n}-${pitch.toFixed(2)}`;if(PCB.FP[k])return;const p=pitch,y0=(n-1)/2*p;const big=p>6;
  const f={kind:'hdr',body:[big?10:7.6,n*p+0.5,big?12:10],pads:Array.from({length:n},(_,i)=>({n:''+(i+1),x:0,y:+(y0-i*p).toFixed(3),w:big?4.2:3,h:big?4.2:3,round:true,drill:big?1.9:1.4})),gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP[k]=f;}
/* one vehicle connector for the whole ECU: Molex MX150 sealed right-angle PCB header (2 rows, 3.50 mm mating pitch, 1.5 mm
   terminals, max. steady-state 15 A per contact (Molex MX150 selection guide), IP67/IP69K, −40…125 °C, 14 V). The board's
   separate external connectors (supply, IGN, load output, CAN) are folded into it; each power signal gets parallel contacts
   so the continuous current stays ≤ 80 % of 15 A and the peak ≤ 15 A per contact. PCB footprint dimensions are assumed
   (3.50 mm grid, 1.4 mm holes) — check against the Molex drawing of series 34830 before release. */
const MX150={pitch:3.5,iMax:15,sizes:[4,6,8,12,16,20]};
function mx150Fp(n){if(typeof PCB==='undefined'||!PCB.FP)return'MX150-2x'+n/2+'-RA';const k='MX150-2x'+n/2+'-RA';if(PCB.FP[k])return k;const c=n/2,p=MX150.pitch,D=22,W=c*p+8;
  const pads=[];for(let r=0;r<2;r++)for(let i=0;i<c;i++)pads.push({n:''+(r*c+i+1),x:+((i-(c-1)/2)*p).toFixed(3),y:+(D/2-3-r*p).toFixed(3),w:2.3,h:2.3,round:true,drill:1.4});
  const f={kind:'hdr',body:[W,D,14],pads,gen:true,note:'Molex MX150 방수 직각 헤더 (가정 치수 — 34830 도면 확인)'};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP[k]=f;return k;}
/* conn = ecu-io: one ECU connector for the input side (supply, ground, IGN, CAN) and one per load block for its outputs (and its
   hall sensor) — the harness to the vehicle and the harness to each motor are separate. Same header family and the same column
   rules as the single connector: parallel contacts take whole columns, a spare column between two outputs when the size allows. */
function ecuConnectorIO(plan,parts,curr,peak,warn){
  const pi=plan.blocks.find(b=>b.type==='pwr_in');const J=parts.filter(c=>/^J/.test(c.ref));
  const inJ=J.filter(c=>c.block===pi.id&&Object.values(c.pins).includes('GND')&&c.val!=='IGN');if(!inJ.length){warn.push('ECU 커넥터: 전원 입력 커넥터가 없어 바꾸지 않았습니다');return;}
  const bat=Object.values(inJ[0].pins).find(n=>n&&n!=='GND'&&n!=='IGN_IN');const ignJ=J.filter(c=>c.val==='IGN'),canJ=J.filter(c=>c.val==='CAN'&&Object.values(c.pins).includes('CANH'));
  const need=net=>{const I=+curr[net]||0,pk=peak[net]?+peak[net].I:I;return Math.max(1,Math.ceil(I/(MX150.iMax*0.8)),Math.ceil(pk/MX150.iMax));};
  const pack=(sig,g)=>{g=g||1;sig.forEach(s=>{if(s.n>1&&s.n%2)s.n++;});const whole=s=>Array.from({length:Math.max(1,s.n/2)},()=>s.n>1?[s,s]:[s,null]);
    const sup=[].concat(...sig.filter(s=>!s.load&&s.n>1).map(whole));const can=sig.filter(s=>!s.load&&s.n===1&&/^CAN/.test(s.net)),one=sig.filter(s=>!s.load&&s.n===1&&!/^CAN/.test(s.net));if(one.length%2)one.push(null);
    const small=[];for(let i=0;i<one.length;i+=2)small.push([one[i],one[i+1]]);const canC=can.length===2?[[can[0],can[1]]]:can.map(c=>[c,null]);const loads=sig.filter(s=>s.load);
    const used=sup.length+small.length+canC.length+loads.reduce((a,s)=>a+Math.max(1,s.n/2),0);let gaps=Math.max(0,loads.length-1)*g;let n=MX150.sizes.find(v=>v>=(used+gaps)*2);if(!n){gaps=Math.max(0,loads.length-1);g=1;n=MX150.sizes.find(v=>v>=(used+gaps)*2)||MX150.sizes.find(v=>v>=used*2);}if(!n)return null;const c2=n/2; // room for spare columns between outputs when a size has it
    let free=c2-used;const cols=sup.concat(small,canC);while(free>gaps){cols.push([null,null]);free--;}
    loads.forEach((s,i)=>{if(i)for(let k=0;k<g&&free>0;k++){cols.push([null,null]);free--;}whole(s).forEach(c=>cols.push(c));});while(cols.length<c2)cols.push([null,null]);
    const pins={},names={};cols.forEach((cl,i)=>{[0,1].forEach(r=>{const k=r*c2+i+1,s=cl[r];names[k]=s?s.name:'NC';if(s)pins[k]=s.net;});});return{n,pins,names,sig};};
  const mk=(val,P,blk,what)=>({ref:'J?',val,fp:mx150Fp(P.n),pins:P.pins,mpn:'034830'+String(P.n).padStart(2,'0')+'01',desc:`${what} Molex MX150 방수 직각 헤더 2열 ${P.n}핀 (3.50 mm · 접점당 최대 15 A로 계산 · 30 V를 넘는 계통은 MX150 Mid-Voltage(60 V) 품번 지정) — ${P.sig.map(s=>s.name+(s.n>1?'×'+s.n:'')).join(' · ')} · 품번 · 풋프린트 치수는 Molex 도면으로 확인`,pinNames:P.names,block:blk,P:0,mcu:false});
  // input side
  const si=[{name:'BAT',net:bat,n:need(bat)},{name:'GND',net:'GND',n:need('GND')}];if(Object.values(inJ[0].pins).includes('IGN_IN')||ignJ.length)si.push({name:'IGN',net:'IGN_IN',n:1});if(canJ.length){si.push({name:'CAN_H',net:'CANH',n:1});si.push({name:'CAN_L',net:'CANL',n:1});}
  const Pin=pack(si);if(!Pin){warn.push('ECU 입력 커넥터: 접점이 MX150 20핀을 넘어 바꾸지 않았습니다');return;}
  // one output connector per load block
  const outs=[];let fail=false;plan.blocks.filter(b=>/^(hbridge|gdrv3|dcmotor|bldc)$/.test(b.type)).forEach((b,bi)=>{const oj=J.filter(c=>c.block===b.id);if(!oj.length)return;const so=[];
    oj.filter(c=>c.val!=='홀').forEach(c=>Object.keys(c.pins).sort((a,b)=>a-b).forEach(k=>{const net=c.pins[k];if(net&&!so.some(s=>s.net===net))so.push({name:(c.pinNames&&c.pinNames[k])||c.val+k,net,n:need(net),load:true});}));
    oj.filter(c=>c.val==='홀').forEach(c=>Object.keys(c.pins).sort((a,b)=>a-b).forEach(k=>{const nm0=(c.pinNames&&c.pinNames[k])||'';so.push({name:{H1:'HALL_U',H2:'HALL_V',H3:'HALL_W',GND:'HALL_GND'}[nm0]||nm0,net:c.pins[k],n:1});}));
    // discrete FETs beside each output need a wider cell than one connector pitch pair: three spare columns between outputs (14 mm)
    const P=pack(so,FET1[String(b.params.fet||'')]?3:1);if(!P){fail=true;return;}outs.push({P,b,oj,bi});});
  if(fail){warn.push('ECU 출력 커넥터: 접점이 MX150 20핀을 넘어 바꾸지 않았습니다');return;}
  const gone=inJ.concat(ignJ,canJ,...outs.map(o=>o.oj));const at=parts.indexOf(inJ[0]);gone.forEach(c=>{const i=parts.indexOf(c);if(i>=0)parts.splice(i,1);});
  const nu=[mk('ECU-IN',Pin,pi.id,'ECU 입력 커넥터')].concat(outs.map((o,i)=>mk(outs.length>1?'ECU-OUT'+(i+1):'ECU-OUT',o.P,o.b.id,`ECU 출력 커넥터${outs.length>1?' '+(i+1):''} (모터)`)));parts.splice(Math.max(0,Math.min(at,parts.length)),0,...nu);
  let m=0;nu.forEach(c=>{c.ref='J'+(++m);});parts.filter(c=>/^J/.test(c.ref)&&!nu.includes(c)).forEach(c=>{c.ref='J'+(++m);});
  warn.push(`ECU 커넥터: 입력 MX150 ${Pin.n}핀 (${Pin.sig.map(s=>s.name+(s.n>1?'×'+s.n:'')).join(', ')}) + 출력 ${outs.map(o=>`MX150 ${o.P.n}핀 (${o.P.sig.map(s=>s.name+(s.n>1?'×'+s.n:'')).join(', ')})`).join(' · ')}`);}
function ecuConnector(plan,parts,curr,peak,warn){
  const J=parts.filter(c=>/^J/.test(c.ref));const pick=f=>J.filter(f);
  const inJ=pick(c=>Object.values(c.pins).includes('VIN_RAW')),ignJ=pick(c=>c.val==='IGN'),canJ=pick(c=>c.val==='CAN'&&Object.values(c.pins).includes('CANH'));
  const ldB=new Set(plan.blocks.filter(b=>/^(hbridge|gdrv3|dcmotor|bldc)$/.test(b.type)).map(b=>b.id));const hallJ=pick(c=>c.val==='홀'),spJ=pick(c=>c.val==='SPARE');const outJ=pick(c=>ldB.has(c.block)&&c.val!=='홀');
  if(!inJ.length){warn.push('ECU 커넥터: 전원 입력 커넥터가 없어 합치지 않았습니다');return;}
  const need=(net)=>{const I=+curr[net]||0,pk=peak[net]?+peak[net].I:I;return Math.max(1,Math.ceil(I/(MX150.iMax*0.8)),Math.ceil(pk/MX150.iMax));};
  const sig=[];const add=(name,net,own)=>{if(net&&(own||!sig.some(s=>s.net===net&&!s.own)))sig.push({name,net,n:own?1:need(net),own:!!own});};
  add('BAT','VIN_RAW');add('GND','GND');
  outJ.forEach(c=>Object.keys(c.pins).sort((a,b)=>a-b).forEach(k=>add((c.pinNames&&c.pinNames[k])||c.val+k,c.pins[k])));
  if(Object.values(inJ[0].pins).includes('IGN_IN')||ignJ.length)add('IGN','IGN_IN');
  if(canJ.length){add('CAN_H','CANH');add('CAN_L','CANL');}
  // hall sensor: its supply, three outputs and its own ground contact (sensor return, not shared with the power ground)
  hallJ.forEach(c=>{const L={H1:'HALL_U',H2:'HALL_V',H3:'HALL_W',GND:'HALL_GND'};Object.keys(c.pins).sort((a,b)=>a-b).forEach(k=>{const nm0=(c.pinNames&&c.pinNames[k])||'';add(L[nm0]||nm0,c.pins[k],true);});});
  spJ.forEach(c=>Object.keys(c.pins).sort((a,b)=>a-b).forEach(k=>add((c.pinNames&&c.pinNames[k])||'SPARE'+k,c.pins[k],true)));
  // contacts by column (inner row + outer row): a power signal with parallel contacts takes whole columns, so its copper enters
  // on the inner pad and the outer pad hangs on it — no other net between them. Single contacts pair up; CAN_H / CAN_L share one column.
  sig.forEach(s=>{if(s.n>1&&s.n%2)s.n++;});
  // column order from one end: supply and ground, the small signals, then the load outputs at the far end (the power stage sits there).
  // Load outputs are not put side by side: the copper of a middle output (phase V between U and W) is boxed in by its neighbours'
  // pours and leaves the connector as a bare track. A column of unused contacts or of a small signal goes between two outputs
  // (unused first, CAN last — it is kept away from the switching outputs while anything else is left), so each output has a lane
  // of two pitches less one pad on every copper layer.
  const whole=s=>Array.from({length:s.n/2},()=>[s,s]);const isLoad=s=>!s.own&&!/^(VIN_RAW|GND)$/.test(s.net);
  const sup=[].concat(...sig.filter(s=>s.n>1&&!isLoad(s)).map(whole));
  const can=sig.filter(s=>s.n===1&&/^CAN/.test(s.net)),one=sig.filter(s=>s.n===1&&!/^CAN/.test(s.net));if(one.length%2)one.push(null);
  const small=[];for(let i=0;i<one.length;i+=2)small.push([one[i],one[i+1]]);const canC=can.length===2?[[can[0],can[1]]]:can.map(c=>[c,null]);
  const loads=sig.filter(s=>s.n>1&&isLoad(s));const used=sup.length+small.length+canC.length+loads.reduce((a,s)=>a+s.n/2,0);
  const n=MX150.sizes.find(v=>v>=used*2);if(!n){warn.push(`ECU 커넥터: 접점 ${used*2}개 — MX150 20핀을 넘어 합치지 않았습니다`);return;}
  const c2=n/2;const gaps=plan.connGap===true?Math.max(0,loads.length-1):0;/* plans saved before v1.119 keep their pinout */const sp=[];for(let i=0;i<c2-used&&sp.length<gaps;i++)sp.push([null,null]);
  while(sp.length<gaps&&small.length)sp.push(small.pop());while(sp.length<gaps&&canC.length)sp.push(canC.pop());
  const cols=sup.concat(small,canC);while(cols.length+sp.length+loads.reduce((a,s)=>a+s.n/2,0)<c2)cols.push([null,null]);
  loads.forEach((s,i)=>{if(i&&sp.length)cols.push(sp.shift());whole(s).forEach(c=>cols.push(c));});
  if(gaps&&cols.length>c2)throw new Error('ECU connector columns');
  const pins={},names={};cols.forEach((cl,i)=>{[0,1].forEach(r=>{const k=r*c2+i+1,s=cl[r];names[k]=s?s.name:'NC';if(s)pins[k]=s.net;});});
  const fp=mx150Fp(n);const all=inJ.concat(ignJ,canJ,outJ,hallJ,spJ);const blk=inJ[0].block;
  const at=parts.indexOf(inJ[0]);for(const c of all){const i=parts.indexOf(c);if(i>=0)parts.splice(i,1);}
  const I0=+curr.VIN_RAW||0,pk0=peak.VIN_RAW?+peak.VIN_RAW.I:I0;
  parts.splice(Math.max(0,Math.min(at,parts.length)),0,{ref:'J1',val:'ECU',fp,pins,mpn:'034830'+String(n).padStart(2,'0')+'01',desc:`ECU 커넥터 Molex MX150 방수 직각 헤더 2열 ${n}핀 (34830 계열 · 품번은 계열 규칙으로 추정 · 3.50 mm · 접점당 최대 15 A · IP67/IP69K) — ${sig.map(s=>s.name+(s.n>1?'×'+s.n:'')).join(' · ')} · 상대 커넥터 MX150 리셉터클 33472-${String(n).padStart(2,'0')}xx · 품번 · 풋프린트 치수는 Molex 도면으로 확인`,pinNames:names,block:blk,P:0,mcu:false});
  // keep reference designators compact: J1 = ECU connector, the rest renumbered
  let m=1;parts.filter(c=>/^J/.test(c.ref)&&c.val!=='ECU').forEach(c=>{m++;c.ref='J'+m;});
  warn.push(`ECU 커넥터: 외부 커넥터 ${all.length}개를 MX150 ${n}핀 하나로 — 핀 ${sig.map(s=>s.name+(s.n>1?'×'+s.n:'')).join(', ')} (BAT 상시 ${I0} A${pk0>I0?' · 피크 '+pk0+' A':''} → 접점 ${need('VIN_RAW')}개 병렬)`);}
/* two-FET packages in Infineon PG-TDSON-8 (5 × 6 mm), pinout from the datasheets (page 1 pin diagram):
   IAUC60N04S6N050H half-bridge — 1 G(HS) · 2,3 Phase · 4 G(LS) · 5,6 ground (LS source) · 7,8 battery (HS drain); pads 9 = battery, 10 = phase
   IPG20N04S4L-07 dual (independent) — 1 S1 · 2 G1 · 3 S2 · 4 G2 · 5,6 D2 · 7,8 D1; pads 9 = D1, 10 = D2 → FET1 high side, FET2 low side */
const FET2={
  'IAUC60N04S6N050H':{kind:'hb',v:40,rds:0.005,i:60,qg:17,label:'하프브리지 40 V 60 A 5.0 mΩ OptiMOS 6 (AEC-Q101)',pin:(hg,lg,vm,ph,ret)=>({1:hg,2:ph,3:ph,4:lg,5:ret,6:ret,7:vm,8:vm,9:vm,10:ph}),names:{1:'G_HS',2:'PH',3:'PH',4:'G_LS',5:'GND',6:'GND',7:'BAT',8:'BAT',9:'BAT',10:'PH'}},
  'IPG20N04S4L-07':{kind:'dual',v:40,rds:0.0072,i:20,qg:50,label:'듀얼 40 V 20 A 7.2 mΩ OptiMOS-T2 로직 레벨 (AEC-Q101)',pin:(hg,lg,vm,ph,ret)=>({1:ph,2:hg,3:ret,4:lg,5:ph,6:ph,7:vm,8:vm,9:vm,10:ph}),names:{1:'S1',2:'G1',3:'S2',4:'G2',5:'D2',6:'D2',7:'D1',8:'D1',9:'D1',10:'D2'}}};
function fetPkg(){if(typeof PCB==='undefined'||!PCB.FP||PCB.FP['TDSON-8-2FET'])return;
  // pins 1–4 left column (top → bottom), 5–8 right column (bottom → top); exposed pad 9 on the 1/2 · 7/8 half, 10 on the 3/4 · 5/6 half
  const p=[];for(let i=0;i<4;i++)p.push({n:''+(1+i),x:-2.95,y:+(1.905-1.27*i).toFixed(3),w:1.1,h:0.6});for(let i=0;i<4;i++)p.push({n:''+(5+i),x:2.95,y:+(-1.905+1.27*i).toFixed(3),w:1.1,h:0.6});
  p.push({n:'9',x:0,y:1.2,w:3.6,h:1.9});p.push({n:'10',x:0,y:-1.2,w:3.6,h:1.9});
  const f={kind:'ic',stand:0,body:[5.15,6.1,1.0],pads:p,dot:[-2.95,2.75],gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP['TDSON-8-2FET']=f;}
function fets(ctx,pw,ho,lo,vm,ph,ret,h,N){if(pw.f2){fetPkg();const F=pw.f2;
    for(let j=0;j<pw.par;j++){const t=pw.par>1?'_'+(j+1):'';const hg=N(h+'_HG'+t),lg=N(h+'_LG'+t);
      ctx.part('R','10Ω','0603',{1:ho,2:hg},{desc:`하이사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:hg,2:ph},{desc:'하이사이드 G-S 풀다운'});
      ctx.part('R','10Ω','0603',{1:lo,2:lg},{desc:`로우사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:lg,2:ret},{desc:'로우사이드 G-S 풀다운'});
      /* both switches in one package: its phase pad carries the whole phase current */(ctx.part('Q',F.mpn,'TDSON-8-2FET',F.pin(hg,lg,vm,ph,ret),{mpn:F.mpn,desc:`${h}상 ${F.kind==='hb'?'하프브리지':'듀얼'} MOSFET (상·하 FET 2개) ${F.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:F.names,P:+(pw.Pq*1.1).toFixed(2),lk:'phase'})||{}).Itx=ph;}
    return;}
  if(pw.f1){fet1Pkg();const F=pw.f1;
    for(let j=0;j<pw.par;j++){const t=pw.par>1?'_'+(j+1):'';const hg=N(h+'_HG'+t),lg=N(h+'_LG'+t);
      ctx.part('R','10Ω','0603',{1:ho,2:hg},{desc:`하이사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:hg,2:ph},{desc:'하이사이드 G-S 풀다운'});
      ctx.part('Q',F.mpn,F.fp,F.pin(hg,vm,ph),{mpn:F.mpn,desc:`${h}상 하이사이드 N-MOSFET ${F.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:F.names,P:pw.Pq,lk:'phase'});
      ctx.part('R','10Ω','0603',{1:lo,2:lg},{desc:`로우사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:lg,2:ret},{desc:'로우사이드 G-S 풀다운'});
      ctx.part('Q',F.mpn,F.fp,F.pin(lg,ph,ret),{mpn:F.mpn,desc:`${h}상 로우사이드 N-MOSFET ${F.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:F.names,P:pw.Pq,lk:'phase'});}
    return;}
  for(let j=0;j<pw.par;j++){const t=pw.par>1?'_'+(j+1):'';const hg=N(h+'_HG'+t),lg=N(h+'_LG'+t);
    ctx.part('R','10Ω','0603',{1:ho,2:hg},{desc:`하이사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:hg,2:ph},{desc:'하이사이드 G-S 풀다운'});
    ctx.part('Q',pw.f.mpn,'TO-252',{1:hg,2:vm,3:ph},{mpn:pw.f.mpn,desc:`하이사이드 N-MOSFET ${pw.f.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:{1:'G',2:'D',3:'S'},P:pw.Pq,lk:'phase'});
    ctx.part('R','10Ω','0603',{1:lo,2:lg},{desc:`로우사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:lg,2:ret},{desc:'로우사이드 G-S 풀다운'});
    ctx.part('Q',pw.f.mpn,'TO-252',{1:lg,2:ph,3:ret},{mpn:pw.f.mpn,desc:`로우사이드 N-MOSFET ${pw.f.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:{1:'G',2:'D',3:'S'},P:pw.Pq,lk:'phase'});}}
const SHUNTS=[0.01,0.005,0.002,0.001,0.0005,0.00025];
function shunt(ctx,net,I,what,vmax,Ipk,tpk){vmax=vmax||0.045;Ipk=Math.max(I,+Ipk||0);const R=SHUNTS.find(r=>r*Ipk<=vmax)||SHUNTS[SHUNTS.length-1];const P=+(I*I*R).toFixed(2);const lab=R>=0.001?(R*1000)+'mΩ':(R*1e6)+'µΩ';
  ctx.part('R',lab,'2512',{1:net,2:'GND'},{mpn:'',desc:`${what} 전류 션트 ${lab} · 상시 ${I} A에서 ${(R*I*1000).toFixed(0)} mV · ${P} W${Ipk>I?` · 피크 ${Ipk} A에서 ${(R*Ipk*1000).toFixed(0)} mV · ${(Ipk*Ipk*R).toFixed(1)} W 순간`:''}${P>2?' (2 W 초과 — 병렬 또는 3 W 2512)':''}`,P,lk:'phase',pk:Ipk>I?{P:+(Ipk*Ipk*R).toFixed(2),t:+tpk||2}:null});return R;}
/* ---------- parts picked in the system design (block.part → plan param "pick") ----------
   A library block builds its circuit around the picked part when the part's pin table fits the block's job: pins are wired by
   their datasheet names (wireByName), the footprint comes from the part's package. Otherwise the block keeps its own part and
   says why (the pre-generation check also lists such picks as "recorded only"). Pins estimated by Claude are not used here. */
// pins from the datasheet record (datasheets/records → DSDB) when the part library has none; only records written from the
// datasheet (done / verified) and one-table, number-per-row pin sections; ranges "8–10" and lists "7, 11" are expanded
function recordPins(mpn){if(typeof DSDB==='undefined'||typeof DSREC==='undefined'||!DSDB.items)return null;const I=DSDB.items;const m=String(mpn||'').trim();if(!m)return null;
  let it=I[m];const up=m.replace(/\s*\(.*\)$/,'').toUpperCase();
  if(!it){const k=Object.keys(I).find(x=>x.toUpperCase()===up);if(k)it=I[k];}
  if(!it)it=Object.values(I).find(v=>v.alias&&new RegExp('^(?:'+v.alias.trim().split(/\s+/).map(g=>g.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')).join('|')+')$','i').test(up));
  if(!it||!it.rec||!/^(done|verified)$/.test(it.status))return null;
  const tabs=DSREC.pinTables(it.rec);if(tabs.length!==1)return null;const t=tabs[0];if(t.head.length<2||!/이름|name|신호|signal/i.test(t.head[1]))return null;
  const pins=[],seen=new Set();let bad=false;
  t.pins.forEach(row=>{const cell=String(row[0]||'').replace(/\s+/g,'');let nm=String(row[1]||'').trim().replace(/\s*\(.*$/,'').split(/\s*\/\s*/)[0].trim();if(/^n\.?c\.?$/i.test(nm))nm='NC';
    const nums=[];cell.split(',').forEach(part=>{const r=part.match(/^(\d+)[–-](\d+)$/);if(r){for(let i=+r[1];i<=+r[2];i++)nums.push(String(i));}else if(/^(\d{1,3}|[A-Z]{1,2}\d{1,2}|EP|PAD|TAB)$/i.test(part))nums.push(part.toUpperCase());});
    if(!nums.length||!nm)return;nums.forEach(n=>{if(seen.has(n))bad=true;seen.add(n);pins.push({num:n,name:nm});});});
  if(bad||pins.length<2)return null;
  const pin=it.rec.sections.find(x=>/핀/.test(x.h));const ptxt=pin?DSREC.text(JSON.stringify(pin.blocks.filter(b=>b.html))):'';
  const pkg=(ptxt.match(/\b(?:PG-)?(?:T?SOT|SOIC|SO|HSOIC|SOP|TSSOP|HTSSOP|MSOP|VSSOP|TSDSO|QFN|VQFN|DFN|VSON|WSON|SON|TQFP|LQFP|QFP|TO-?252|TO-?263|DPAK|D2PAK|SC70|SC-70)[- ]?\d+(?:[- ]?\d+)?(?:[- ]EP)?/i)||[])[0]||'';
  return{mpn:it.rec.mpn,pins,pkg:pkg.replace(/\s+/g,'-')+(/노출 ?패드|exposed|thermal pad|파워패드|PowerPAD/i.test(ptxt)&&!/EP$/i.test(pkg)?'-EP':''),title:it.title,cat:it.cat,src:'record'};}
function pickRec(mpn){if(!mpn||!NEWPROJ.partLookup)return null;let r=null;try{r=NEWPROJ.partLookup(mpn);}catch(e){r=null;}
  if(!(r&&r.pins&&r.pins.length)){const rp=recordPins(mpn);if(rp)r=Object.assign({},r||{},rp);}
  return r&&r.pins&&r.pins.length&&r.src!=='ai'?r:null;}
// pins by datasheet name: rules [[RegExp on the upper-case name without spaces, net | null (open) | fn(name) → net]], first match wins
function wireByName(rec,rules){const pins={},names={},miss=[];
  rec.pins.forEach(q=>{const num=String(q.num),nm=String(q.name||'').trim();names[num]=nm;const u=nm.toUpperCase().replace(/[\s_{}]/g,'').replace(/[‾̅~]/g,'N'); // KiCad overbar ~{STB} → NSTB
    const r=rules.find(([re])=>re.test(u));if(!r){miss.push(nm||num);return;}const v=typeof r[1]==='function'?r[1](u):r[1];if(v===undefined){miss.push(nm||num);return;}pins[num]=v;});
  return{pins,names,miss};}
// footprint for a part record: the record's KiCad footprint name, else its package; the exposed pad (EP / PAD / TAB) becomes the
// footprint's extra pad after the leads
function recFootprint(rec,pins,names){if(typeof PCB==='undefined'||typeof FPGEN==='undefined')return null;const n=rec.pins.length;
  const cands=[rec.fp&&String(rec.fp).replace(/^[^:]*:/,''),rec.pkg&&String(rec.pkg).replace(/\s*\(.*$/,'')+(/thermal|EP|노출/i.test(rec.pkg)&&!/EP\b/i.test(rec.pkg)?'-EP':'')].filter(Boolean);
  const numeric=rec.pins.filter(q=>/^\d+$/.test(String(q.num))).map(q=>+q.num);const maxN=numeric.length?Math.max(...numeric):0;
  for(const c of cands){let fp=null;try{fp=PCB.FP[c]?c:FPGEN.ensure(PCB,c,n);}catch(e){fp=null;}const F=fp&&PCB.FP[fp];if(!F)continue;
    const pads=new Set(F.pads.map(x=>String(x.n)));if(!numeric.every(k=>pads.has(String(k))))continue;
    const extra=F.pads.map(x=>String(x.n)).find(x=>/^\d+$/.test(x)&&+x>maxN);const P={},N={};let ok=true;
    Object.entries(pins).forEach(([k,v])=>{if(/^\d+$/.test(k)){P[k]=v;N[k]=names[k];}else if(extra){P[extra]=v;N[extra]=names[k]+' (노출 패드)';}else ok=false;});
    if(ok)return{fp,pins:P,names:N};}
  return null;}
function pickNote(rec){return rec.src==='record'?'핀: 데이터시트 레코드':rec.src==='ds'?'핀: 데이터시트 PDF':'핀: 부품 라이브러리';}
// CAN transceiver picked for the CAN block (TJA1043/1044/1443, TCAN1043/1044, MCP2542 …): TXD/RXD to the MCU CAN, VCC 5 V, VIO
// 3.3 V, VSUP/VBAT on the protected input rail, STB/EN as MCU outputs, nFAULT/ERR with a pull-up, WAKE tied low through 10 kΩ
function canPick(ctx,p){const rec=pickRec(p.pick);const keep='CAN 트랜시버는 기본 TLE9251VSJ로 만듭니다';
  if(!rec){ctx.warn(`${p.pick}: 데이터시트로 확인된 핀 표가 없어 ${keep} — datasheet ${p.pick} 로 핀 표를 넣으면 반영`);return false;}
  // the transceiver's battery pin (VSUP / VBAT) takes the given rail — on a 48 V system the 12 V rail, not the DC link
  const bat=p.vsup||ctx.highest(0);if((ctx.railV?ctx.railV(bat):0)>40&&ctx.warn)ctx.warn(`${p.pick}: VSUP/VBAT를 ${bat}에 연결 — 트랜시버 전원 정격을 넘을 수 있음, can 블록 vsup 파라미터로 12 V 레일 지정`);
  const w=wireByName(rec,[[/^TXD$/,'CAN_TX'],[/^RXD$/,'CAN_RX'],[/^CANH$/,'CANH'],[/^CANL$/,'CANL'],[/^(GND|VSS|EP|PAD|THERMALPAD|EXPOSEDPAD)$/,'GND'],
    [/^(VCC|VDD|V5|VCC5V?)$/,'+5V'],[/^(VIO|VCCIO|VDDIO|VIO\/NC)$/,'+3V3'],[/^(VSUP|VBAT|VS|BAT)$/,bat],
    [/^(STB|STBY|S|NSTB|STBN|NSTBY|SILENT|STANDBY|NSTANDBY)$/,'CAN_STB'],[/^EN$/,'CAN_EN'],[/^(NFAULT|ERR|NERR|ERRN|FAULT|NFLT)$/,'CAN_ERR'],
    [/^INH$/,null],[/^(WAKE|NWAKE|WAKEN)$/,'CAN_WAKE'],[/^SPLIT$/,+p.term?'CAN_SPLIT':null],[/^(NC|N\.C\.|DNC)$/,null]]);
  if(w.miss.length){ctx.warn(`${rec.mpn}: 핀 ${w.miss.join(', ')}의 역할을 정하지 못해 ${keep}`);return false;}
  const v=Object.values(w.pins);const need=['CAN_TX','CAN_RX','CANH','CANL','GND'].filter(n=>!v.includes(n));if(need.length){ctx.warn(`${rec.mpn}: ${need.join(', ')} 핀을 찾지 못해 ${keep}`);return false;}
  const f=recFootprint(rec,w.pins,w.names);if(!f){ctx.warn(`${rec.mpn}: 패키지(${rec.pkg||'?'}) 풋프린트를 만들 수 없어 ${keep}`);return false;}
  ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`CAN FD 트랜시버 ${rec.mpn} (시스템 설계에서 고른 부품 · ${pickNote(rec)})`,pinNames:f.names,P:0.08});
  if(v.includes(bat)){ctx.use(bat);ctx.cap(bat,'100nF',`${rec.mpn} VSUP 디커플링 (역접속 보호 뒤 입력 레일)`);}
  if(v.includes('CAN_EN')){ctx.part('R','10kΩ','0603',{1:'CAN_EN',2:'GND'},{desc:`${rec.mpn} EN 풀다운 (MCU 리셋 중 비활성)`});ctx.sig('CAN_EN','gpio_out');}
  if(v.includes('CAN_ERR')){ctx.part('R','10kΩ','0603',{1:'CAN_ERR',2:'+3V3'},{desc:`${rec.mpn} 고장 출력 풀업 (오픈 드레인)`});ctx.sig('CAN_ERR','irq_in');}
  if(v.includes('CAN_WAKE'))ctx.part('R','10kΩ','0603',{1:'CAN_WAKE',2:'GND'},{desc:`${rec.mpn} WAKE 미사용 — 10 kΩ로 GND (로컬 웨이크를 쓰면 스위치 입력으로 바꾸고 데이터시트 전류 제한 확인)`});
  if(rec.pins.some(q=>/^INH$/i.test(q.name)))ctx.warn(`${rec.mpn}: INH 출력은 개방 — 레귤레이터 EN을 이 핀으로 켜려면 회로도에서 연결`);
  // an active-low standby input (STB_N: LOW = Standby, as on TJA1043 / TJA1443): pull it down so the transceiver stays in Standby while the MCU is in reset
  {const stb=Object.keys(w.pins).find(k=>w.pins[k]==='CAN_STB');const un=stb?String(w.names[stb]||'').toUpperCase().replace(/[\s_]/g,''):'';
    if(stb&&/^(NSTB|STBN|NSTBY|NSTANDBY)$/.test(un))ctx.part('R','10kΩ','0603',{1:'CAN_STB',2:'GND'},{desc:`${rec.mpn} ${w.names[stb]} 풀다운 (액티브 LOW — MCU 리셋 중 Standby 유지)`});}
  p._noStb=!v.includes('CAN_STB');
  return true;}
// temperature sensor picked for the NTC block: a 2-terminal NTC keeps the pull-up divider (only the part changes, size from the
// part number or record), an analog sensor IC (VDD / VOUT / GND, e.g. TMP235) replaces the divider
function ntcPick(ctx,p,t){const mpn=String(p.pick||'');const rec=pickRec(mpn);
  if(rec&&rec.pins.length===3){const w=wireByName(rec,[[/^(VDD|VCC|V\+|VS)$/,'+3V3'],[/^(VOUT|OUT|VO)$/,t],[/^(GND|VSS)$/,'GND']]);
    if(!w.miss.length&&Object.values(w.pins).includes(t)){const f=recFootprint(rec,w.pins,w.names);
      if(f){ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`아날로그 온도 센서 ${rec.mpn} (시스템 설계에서 고른 부품 · ${pickNote(rec)})`,pinNames:f.names,P:0.001});ctx.cap('+3V3','100nF',`${rec.mpn} 디커플링`);return 'ic';}}}
  const size=(String(rec&&rec.pkg||'').match(/\b(0402|0603|0805)\b/)||[])[1]||(/^NC[PU]15/i.test(mpn)?'0402':/^NC[PU]18/i.test(mpn)?'0603':/^NC[PU]21/i.test(mpn)?'0805':null);
  if(size&&/^(NC[PU]\d|NTC|ERT|B5784|NTCS)/i.test(mpn))return{size};
  ctx.warn(`${mpn}: 표면실장 NTC(0402/0603/0805)나 3핀 온도 센서 IC로 확인되지 않아 기본 NCP18XH103F03RB를 씁니다`);return null;}
// LDO picked for a 3.3 / 5 V LDO block (fixed-output version): IN / OUT / GND / EN (tied to IN) and an optional power-good
// output with a pull-up to the output; parts that need a feedback divider (FB-only pin) or other pins keep the library LDO
// the MCU's reset net for a supervisor / PMIC: PORST on AURIX, NRST otherwise — from the plan's MCU block (the MCU block is built
// after the power blocks, so ctx.mcu() is not set yet). Plans saved before v1.114.0 (plan.rstFix !== true) keep the old net "NRST",
// which left the reset output unconnected on AURIX boards.
function rstNet(ctx){const P=ctx.plan||{};if(P.rstFix!==true)return'NRST';const mb=(P.blocks||[]).find(b=>b.type==='mcu');const k=mb?(mcuKey(mb.params&&mb.params.part)||''):'';return/^TC3/i.test(k)?'PORST':'NRST';}
const LDO_VFB=[[/TPS7B86/i,0.65,'TPS7B86-Q1 VFB 0.65 V (0.644–0.656 V)']];
function ldoPick(ctx,p,src,out,vout,adj){const rec=pickRec(p.pick);const keep='기본 AMS1117로 만듭니다';if(!rec){ctx.warn(`${p.pick}: 데이터시트로 확인된 핀 표가 없어 ${keep}`);return false;}
  const pg='PG_'+out.replace(/[^A-Za-z0-9]/g,'');
  const w=wireByName(rec,[[/^(IN|VIN|VI|VBAT)$/,src],[/^(OUT|VOUT|VO)$/,out],[/^(GND|VSS|EP|PAD|THERMALPAD|TAB)$/,'GND'],[/^(EN|ENABLE|INH)$/,src],
    [/^(FB\/NC|NC\/FB)$/,adj?'@FB':null],[/^(FB|ADJ)$/,adj?'@FB':undefined],[/^(SENSE|NC|N\.C\.|DNC|DELAY|CT|DLY)$/,null],[/^(PG|PGOOD|POK|RESET|NRESET|RO|RST|NRST)$/,pg]]);
  if(w.miss.length){ctx.warn(`${rec.mpn}: 핀 ${w.miss.join(', ')}의 역할을 정하지 못해 ${keep} (가변형 FB 핀은 분압이 필요)`);return false;}
  if(adj){const vf=LDO_VFB.find(([re])=>re.test(rec.mpn)||re.test(p.pick));const fbPin=Object.keys(w.pins).find(k=>w.pins[k]==='@FB');if(!vf||!fbPin){ctx.warn(`${rec.mpn}: 가변 출력에 쓸 FB 핀 · 기준 전압 기록이 없어 기본 LM317로 만듭니다`);return false;}
    const fb=ctx.uniq('LDO_FB');w.pins[fbPin]=fb;const f=recFootprint(rec,w.pins,w.names);if(!f){ctx.warn(`${rec.mpn}: 패키지(${rec.pkg||'?'}) 풋프린트를 만들 수 없어 기본 LM317로 만듭니다`);return false;}
    // Vout = VFB·(1 + R1/R2), R2 = 10 kΩ, R1 from E96
    const E96=[100,102,105,107,110,113,115,118,121,124,127,130,133,137,140,143,147,150,154,158,162,165,169,174,178,182,187,191,196,200,205,210,215,221,226,232,237,243,249,255,261,267,274,280,287,294,301,309,316,324,332,340,348,357,365,374,383,392,402,412,422,432,442,453,464,475,487,499,511,523,536,549,562,576,590,604,619,634,649,665,681,698,715,732,750,768,787,806,825,845,866,887,909,931,953,976];
    const r2=10000,r1x=r2*(vout/vf[1]-1);const dec=Math.pow(10,Math.floor(Math.log10(r1x))-2);const r1=E96.map(e=>e*dec).reduce((a,b)=>Math.abs(b-r1x)<Math.abs(a-r1x)?b:a);const vr=vf[1]*(1+r1/r2);const fmt=r=>r>=1000?(+(r/1000).toFixed(2))+'kΩ':Math.round(r)+'Ω';
    ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`${vout} V 가변 LDO ${rec.mpn} (입력 ${src} · 시스템 설계에서 고른 부품 · ${pickNote(rec)} — 가변(01) 버전 주문 코드 확인)`,pinNames:f.names,ldo:{src,out,vout}});
    ctx.part('R',fmt(r1),'0603',{1:out,2:fb},{desc:`${rec.mpn} FB 분압 상단 1 % (Vout = ${vr.toFixed(2)} V · ${vf[2]})`});ctx.part('R','10kΩ','0603',{1:fb,2:'GND'},{desc:`${rec.mpn} FB 분압 하단 1 %`});
    ctx.cap(src,'1µF','LDO 입력 커패시터 (≥ 0.5 µF, EMI)');ctx.cap(out,'10µF','LDO 출력 커패시터 (X7R, 실효 ≥ 1 µF)');return true;}
  const f=recFootprint(rec,w.pins,w.names);if(!f){ctx.warn(`${rec.mpn}: 패키지(${rec.pkg||'?'}) 풋프린트를 만들 수 없어 ${keep}`);return false;}
  ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`${vout} V LDO ${rec.mpn} 고정 ${vout} V 버전 (입력 ${src} · 시스템 설계에서 고른 부품 · ${pickNote(rec)} — 주문 코드의 출력 전압 확인)`,pinNames:f.names,ldo:{src,out,vout}});
  ctx.cap(src,'1µF','LDO 입력 커패시터 (≥ 0.5 µF, EMI)');ctx.cap(out,'10µF','LDO 출력 커패시터 (X7R)');
  if(Object.values(w.pins).includes(pg)){ctx.part('R','10kΩ','0603',{1:pg,2:out},{desc:`${rec.mpn} 파워 굿 풀업 (오픈 드레인)`});ctx.sig(pg,'gpio_in');}
  return true;}
// a P-channel MOSFET picked for the input block replaces the reverse-protection P-FET (TO-252 / DPAK, pins G / D / S)
function pfetPick(mpn){const rec=pickRec(mpn);if(!rec||rec.pins.length!==3)return null;const t=String((rec.title||'')+' '+(rec.desc||'')+' '+(rec.cat||''));
  if(!/P-?(channel|채널|ch\b)|P-MOSFET|-\d+\s*V/i.test(t)||!/TO-?252|DPAK/i.test(String(rec.pkg||'')+' '+t))return null;
  const n=rec.pins.map(q=>String(q.name).toUpperCase());return n.includes('G')&&n.includes('D')&&n.includes('S')?rec.mpn:null;}
// ideal-diode controller picked for the input block (LM74700-Q1, LTC4359 …): N-MOSFET(s) in series instead of the P-FET or
// Schottky — ANODE/SOURCE on the connector side, CATHODE/OUT on the rail, GATE to the FET gates, VCAP charge-pump capacitor
function idealDiode(ctx,p,rail,I){const rec=pickRec(p.pick);if(!rec){ctx.warn(`${p.pick}: 데이터시트로 확인된 핀 표가 없어 역전압 보호는 기본 회로로 만듭니다`);return false;}
  const w=wireByName(rec,[[/^(ANODE|A|SOURCE|IN|VIN)$/,'VIN_RAW'],[/^(CATHODE|K|OUT|VOUT)$/,rail],[/^(GATE|G|DGATE)$/,'VIN_GATE'],[/^VCAP$/,'IDC_VCAP'],
    [/^(EN|ON)$/,'VIN_RAW'],[/^(SHDN|NSHDN|SHDNN)$/,'VIN_RAW'],[/^(GND|VSS|EP|PAD)$/,'GND'],[/^(NC|N\.C\.|DNC)$/,null]]);
  if(w.miss.length){ctx.warn(`${rec.mpn}: 핀 ${w.miss.join(', ')}의 역할을 정하지 못해 역전압 보호는 기본 회로로 만듭니다`);return false;}
  const v=Object.values(w.pins);if(!v.includes('VIN_GATE')||!v.includes(rail)){ctx.warn(`${rec.mpn}: GATE/CATHODE 핀이 없어 역전압 보호는 기본 회로로 만듭니다`);return false;}
  const f=recFootprint(rec,w.pins,w.names);if(!f){ctx.warn(`${rec.mpn}: 패키지(${rec.pkg||'?'}) 풋프린트를 만들 수 없어 역전압 보호는 기본 회로로 만듭니다`);return false;}
  if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'TO-252');
  const n=Math.max(1,Math.ceil(I/40));
  ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`이상적 다이오드 컨트롤러 ${rec.mpn} — 역전압 보호 (시스템 설계에서 고른 부품 · ${pickNote(rec)})`,pinNames:f.names,P:0.01});
  for(let i=0;i<n;i++)ctx.part('Q','IPD50N06S4L-12','TO-252',{1:'VIN_GATE',2:rail,3:'VIN_RAW'},{mpn:'IPD50N06S4L-12',desc:`이상적 다이오드 N-MOSFET (60 V · AEC-Q101 · 소스 = 커넥터 쪽, 드레인 = 레일)${n>1?' · 병렬 '+n:''}`,pinNames:{1:'G',2:'D',3:'S'},P:+(((I/n)**2)*0.0117+0.02).toFixed(2),lk:'batt'});
  if(v.includes('IDC_VCAP'))ctx.part('C','100nF','0603',{1:'IDC_VCAP',2:'VIN_RAW'},{desc:`${rec.mpn} VCAP 차지펌프 커패시터 (≥ 0.1 µF · ≥ 10 × FET Ciss, 50 V)`});
  ctx.part('C','100nF','0805',{1:'VIN_RAW',2:'GND'},{desc:`${rec.mpn} 입력 커패시터 (≥ 22 nF, 50 V)`});
  return true;}
// smart high-side switch picked for the high-side block (PROFET BTS7xxx, VIPower, TPS1Hxx …): inputs from the MCU through
// 4.7 kΩ, sense output to a 1.2 kΩ sense resistor and a 4.7 kΩ / 220 pF filter to the ADC, GND through 47 Ω (reverse-battery
// network), 100 nF on VS, 10 nF on each output — values from the PROFET+2 application circuit; others are checked by pin name
function hsPick(ctx,p,r,out){const rec=pickRec(p.pick);const keep='P-MOSFET 스위치로 만듭니다';if(!rec){ctx.warn(`${p.pick}: 데이터시트로 확인된 핀 표가 없어 ${keep}`);return false;}
  const outs=[];const ins=[];
  const w=wireByName(rec,[[/^(VS|VBB|VBAT|VCC|VSUP)$/,r],[/^(OUT|VOUT|OUTPUT)(\d?)$/,u=>{const k=(u.match(/(\d)$/)||[,'0'])[1];if(!outs.includes(k))outs.push(k);return k==='0'?out:out+'_'+k;}],
    [/^(IN|INPUT|EN)(\d?)$/,u=>{const k=(u.match(/(\d)$/)||[,'0'])[1];if(!ins.includes(k))ins.push(k);return (k==='0'?'SAFE_EN':'SAFE_EN'+k)+'_IN';}],
    [/^(DEN|DIAEN|DIA_EN|SEN)$/,'HS_DEN'],[/^(DSEL|SEL\d?|SEL0|SEL1)$/,u=>'HS_'+u],[/^(IS|SNS|SENSE|MULTISENSE|CS)$/,'HS_IS'],
    [/^(GND|EP|PAD)$/,'HS_GND'],[/^(LATCH|FAULTRST)$/,'HS_LATCH'],[/^(NC|N\.C\.|DNC)$/,null]]);
  if(w.miss.length){ctx.warn(`${rec.mpn}: 핀 ${w.miss.join(', ')}의 역할·값을 정하지 못해 ${keep} (예: 전류 제한 저항 ILIM은 데이터시트 수식 필요)`);return false;}
  const v=Object.values(w.pins);if(!v.includes(r)||!outs.length||!ins.length){ctx.warn(`${rec.mpn}: 전원·출력·입력 핀을 찾지 못해 ${keep}`);return false;}
  const f=recFootprint(rec,w.pins,w.names);if(!f){ctx.warn(`${rec.mpn}: 패키지(${rec.pkg||'?'}) 풋프린트를 만들 수 없어 ${keep}`);return false;}
  ctx.part('U',rec.mpn,f.fp,f.pins,{mpn:rec.mpn,desc:`스마트 하이사이드 스위치 ${rec.mpn} ${outs.length}채널 (시스템 설계에서 고른 부품 · ${pickNote(rec)})${rec.src==='record'?' — 채널·핀 번호는 데이터시트 도면으로 한 번 확인':''}`,pinNames:f.names,P:0.3,lk:'batt'});
  ctx.part('R','47Ω','0603',{1:'HS_GND',2:'GND'},{desc:`${rec.mpn} GND 저항 (역접속 보호 네트워크)`});ctx.cap(r,'100nF',`${rec.mpn} VS 디커플링`);
  outs.forEach(k=>{const o=k==='0'?out:out+'_'+k;if(k!=='0')ctx.provide(o,ctx.railV?ctx.railV(r):12,'스위치');ctx.part('C','10nF','0603',{1:o,2:'GND'},{desc:`${rec.mpn} 출력 ${k} ESD/BCI 커패시터`});});
  const ser=(net,mcu,role,what)=>{ctx.part('R','4.7kΩ','0603',{1:mcu,2:net},{desc:`${rec.mpn} ${what} 직렬 저항 (MCU 보호)`});ctx.sig(mcu,role);};
  ins.forEach(k=>{const m=k==='0'?'SAFE_EN':'SAFE_EN'+k;ser(m+'_IN',m,'gpio_out',`IN${k}`);ctx.part('R','10kΩ','0603',{1:m,2:'GND'},{desc:`IN${k} 풀다운 (MCU 리셋 중 OFF)`});});
  if(v.includes('HS_DEN'))ser('HS_DEN','HS_DEN_MCU','gpio_out','DEN');
  v.filter(x=>/^HS_(DSEL|SEL)/.test(String(x))).filter((x,i,a)=>a.indexOf(x)===i).forEach(x=>ser(x,x+'_MCU','gpio_out',x.replace(/^HS_/,'')));
  if(v.includes('HS_LATCH'))ctx.part('R','4.7kΩ','0603',{1:'HS_LATCH',2:'GND'},{desc:`${rec.mpn} LATCH/FaultRST — GND (자동 재시도 모드; MCU로 제어하려면 GPIO에 연결)`});
  if(v.includes('HS_IS')){ctx.part('R','1.2kΩ','0603',{1:'HS_IS',2:'GND'},{desc:`${rec.mpn} 센스 저항 RSENSE (전류 → 전압, kILIS로 환산)`});ctx.part('R','4.7kΩ','0603',{1:'HS_IS',2:'HS_ISADC'},{desc:'센스 보호 저항 RIS_PROT / RADC'});
    ctx.part('C','220pF','0603',{1:'HS_ISADC',2:'GND'},{desc:'센스 ADC 필터 (RC > 1 µs)'});ctx.sig('HS_ISADC','adc');}
  return true;}
/* Allegro 3-phase gate drivers (A4911 · A4918): one chip drives all six FETs, has its own gate-drive regulator (VREG),
   charge pump, bootstrap per phase, three current-sense amplifiers and SPI diagnostics. Pins are wired by name from the
   registered pin table (datasheets/pins.json → KPINS), so a part whose table is missing is reported instead of guessed. */
/* AMT49100 (80 V, data sheet terminal list and application information): VREG 12 V from the built-in buck (100 µH LX–VREG, ≥ 420 mA
   saturation; Schottky ≥ 100 V 1 A LX–GND; CBB ≥ 4.7 µF), CREG ≥ 10 µF and ≥ 40 × CBOOT, pump capacitor CP1–CP2 ≥ 1 µF, VBRG ≥ 100 nF,
   CBOOT = 20 × QGATE / VBOOT. Logic 3.3 V on the -3 variants; sense amplifiers CS1…3 (gain 20 default, offset 0–2.5 V by SPI). */
const ALLEGRO={A4911:'A4911KJPTR-T-1',A4918:'A4918KJPTR-1A-3-T',AMT49100:'AMT49100KJPTR-A-3'};
function allegroDrv(d){const m=String(d||'').toUpperCase().match(/AMT49100|A491[18]/);return m?m[0]:null;}
function allegro3(ctx,drv,vm,I,pwr,N,o){o=o||{};const mpn=ALLEGRO[drv];const rec=NEWPROJ.partLookup?NEWPROJ.partLookup(mpn):null;
  if(!rec||!(rec.pins&&rec.pins.length)){ctx.warn(`${drv}: 핀 표가 없어 IR2104 ×3 스테이지로 대신 만들었습니다 — ${drv} 전체 데이터시트의 핀 배치를 datasheets/pins.json에 추가하면 ${drv} 회로가 생성됩니다`);return false;}
  const num={};rec.pins.forEach(q=>{const nm=String(q.name||'').toUpperCase();(num[nm]=num[nm]||[]).push(String(q.num));});
  const pins={},names={};rec.pins.forEach(q=>{names[String(q.num)]=String(q.name||'');});
  const set=(nm,net)=>{(num[nm.toUpperCase()]||[]).forEach(n=>{pins[n]=net;});};
  const miss=['VBB','VBRG','VREG','CP1','CP2','GND','ENABLE','RESETN','STRN','SCK','SDI','SDO','DIAG'].filter(x=>!num[x]);
  if(miss.length){ctx.warn(`${drv}: 핀 표에 ${miss.join(', ')} 핀이 없어 회로를 만들지 못했습니다`);return false;}
  const vio=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(vio);const vreg=N('VREG');
  // bootstrap (datasheet "Bootstrap Capacitor Selection"): CBOOT = 20 × QGATE / VBOOT, VBOOT = VREG (8 V default, 11 V with VRG = 1);
  // QGATE = the high-side FETs of one phase (max Qg), ×1.5 for tolerance and DC bias, next standard value. CREG ≥ 40 × CBOOT
  // for sinusoidal drive (≥ 20 × for block commutation) and not below the 22 µF the datasheet characterises; ceramic, ≥ 2 × VREG rated.
  const qg=((pwr.f2&&pwr.f2.qg)||(pwr.f&&pwr.f.qg)||60)*(pwr.par||1),qgKnown=!!((pwr.f2&&pwr.f2.qg)||(pwr.f&&pwr.f.qg));
  const AMT=/^AMT/.test(drv),vboot=AMT?12:8;const cbMin=20*qg/vboot*1.5;const CB=[47,68,100,150,220,330,470,680,1000].find(v=>v>=cbMin)||1000;const cbLab=CB>=1000?(CB/1000)+'µF':CB+'nF';
  const crMin=Math.max(AMT?10:22,40*CB/1000);const CR=[10,22,47,100].find(v=>v>=crMin)||100;
  if(AMT)set('LX',N('LX'));
  set('VBB',vm);set('VBRG',vm);set('GND','GND');set('PAD','GND');set('EP','GND');set('VREG',vreg);set('CP1',N('CP1'));set('CP2',N('CP2'));
  // several drivers on one board share the SPI bus (SDO is high-impedance while STRn is high); each keeps its own strobe
  const nDrv=(ctx.plan&&ctx.plan.blocks||[]).filter(b=>(b.type==='gdrv3'||b.type==='hbridge')&&allegroDrv(b.params.driver)).length;const SP=nDrv>1?(x=>'DRV_'+x):N;
  set('OOS',N('ISNS_OOS'));set('ENABLE',N('EN'));set('RESETN',N('RESETN'));set('STRN',N('STRN'));set('SCK',SP('SCK'));set('SDI',SP('SDI'));set('SDO',SP('SDO'));set('DIAG',N('DIAG'));
  const PH=o.legs||{A:'U',B:'V',C:'W'};const CSN={A:1,B:2,C:3};const amp=[];let Rs=0.002;const unused=['A','B','C'].filter(x=>!PH[x]);const LG=h=>o.legs?h+' 레그':h+'상';
  Object.entries(PH).forEach(([x,h],i)=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO'),ret=N(h+'_SNS'),out=N('ISNS_'+h);
    set('GH'+x,ho);set('GL'+x,lo);set('S'+x,ph);set('C'+x,vb);set('LSS'+x,N(h+'_LSS'));set('H'+x,N('INH_'+h));set('L'+x,N('INL_'+h));
    // sense amplifier i+1 across the leg shunt (Kelvin to the shunt ends)
    // datasheet layout rules: CSxP / CSxM as independent, matched traces to the two shunt ends (Kelvin) — CSxM gets its own net,
    // tied to ground by a 0 Ω net tie placed on the shunt's ground pad
    const c=String(CSN[x]);if(num['CS'+c+'P']){set('CS'+c+'P',N(h+'_SNSP'));set('CS'+c+'M',N(h+'_SNSM'));set('CS'+c+'O',N('ISNS_'+h+'_AMP'));amp.push(h);}});
  // unused leg (H-bridge on a 3-phase driver): inputs and LSS to ground, SC to ground so the bootstrap node stays defined (small cap on CC),
  // gate outputs open, sense amplifier inputs grounded; its faults (VC · CHO · CLO · OC3) are masked over SPI (datasheet: Fault Masks)
  unused.forEach(x=>{const c=String(CSN[x]);set('S'+x,'GND');set('C'+x,N('C'+x+'_UNUSED'));set('LSS'+x,'GND');set('H'+x,'GND');set('L'+x,'GND');if(num['CS'+c+'P']){set('CS'+c+'P','GND');set('CS'+c+'M','GND');}});
  const fpName=String(rec.fp||'').replace(/^[^:]*:/,'');
  ctx.part('U',drv,rec.fp&&typeof PCB!=='undefined'&&PCB.FP[rec.fp]?rec.fp:(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'?FPGEN.ensure(PCB,fpName||rec.pkg,rec.pins.length)||FPGEN.ensure(PCB,rec.pkg,rec.pins.length):'')||rec.pkg||'LQFP-48',pins,
    {mpn,desc:unused.length?`H-브리지 게이트 드라이버 (Allegro ${drv} 3상 중 ${Object.keys(PH).join('·')} 레그 사용 · ${unused.join('·')} 레그 미사용 — SPI로 ${unused.map(x=>'V'+x+' · '+x+'HO · '+x+'LO · OC'+CSN[x]).join(' · ')} 고장 마스크 · SPI 진단 · 센스 앰프 ×${Object.keys(PH).length})`:`3상 MOSFET 게이트 드라이버 (Allegro ${drv} · SPI 진단 · 센스 앰프 ×3)`,pinNames:names,P:0.3});
  unused.forEach(x=>ctx.part('C','100nF','0402',{1:N('C'+x+'_UNUSED'),2:'GND'},{desc:`${drv} 미사용 ${x} 레그 부트스트랩 핀 C${x} (S${x} = GND, 노드 고정용)`}));
  ctx.cap(vm,'100nF',`${drv} VBB 디커플링 (단자 가까이)`);ctx.cap(vm,'100nF',`${drv} VBRG 디커플링`);
  ctx.part('C',CR+'µF',CR<=10?'0805':'1206',{1:vreg,2:'GND'},{desc:`${drv} VREG 저장 커패시터 ${CR} µF 세라믹 25 V (≥ 40 × CBOOT · 데이터시트 CREG ${AMT?'10 µF 이상(벅 모드)':'22 µF'})`});
  if(AMT){ctx.part('C','1µF','0805',{1:N('CP1'),2:N('CP2')},{mpn:capHV['1µF'][0],desc:`${drv} 펌프 커패시터 CP1–CP2 (≥ 1 µF 세라믹 · 100 V — 단자 가까이)`});
    // built-in buck for VREG straight from the 48 V link
    if(num['LX']){if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'SOD-123');
      ctx.part('L','100µH','IND-5x5',{1:N('LX'),2:vreg},{mpn:'SRN5040-101M',desc:`${drv} 내장 벅 인덕터 100 µH ±20 % (포화 전류 ≥ 420 mA · LX–VREG, 410 kHz)`,P:0.05});
      ctx.part('D','PMEG10010ELR','SOD-123',{1:N('LX'),2:'GND'},{mpn:'PMEG10010ELR',desc:`${drv} 내장 벅 환류 쇼트키 (100 V · 1 A · LX–GND)`,pinNames:{1:'K',2:'A'}});
      ctx.cap(vm,'4.7µF',`${drv} VBB 입력 커패시터 (벅 모드 ≥ 4.7 µF)`);}}
  else ctx.part('C','470nF','0805',{1:N('CP1'),2:N('CP2')},{desc:`${drv} 차지펌프 커패시터 CP1–CP2 (≥ 470 nF, 데이터시트)`});
  Object.entries(PH).forEach(([x,h])=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO'),ret=N(h+'_SNS');
    ctx.part('C',cbLab,'0603',{1:vb,2:ph},{desc:`부트스트랩 C${x}–S${x} (${LG(h)} · ${cbLab} 25 V — 20 × Qg ${qg} nC / ${vboot} V × 1.5${qgKnown?'':' · Qg 미상 60 nC 가정'})`});
    fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);
    // the amplifier is in the driver (gain 20 V/V, 2.5 V offset by default; input range −1.8…2 V): shunt sized for ≤ 60 mV at the phase current (±1.2 V at the output, ~1 W)
    Rs=shunt(ctx,ret,I,LG(h),0.06,pwr.Ipk,pwr.tpk);ctx.peak(ret,pwr.Ipk,pwr.tpk||2);const cs=CSN[x];ctx.part('R','0Ω','0402',{1:N(h+'_SNSM'),2:'GND'},{desc:`센스 켈빈 넷 타이 CS${cs}M (${LG(h)} — 션트 GND 패드에 붙여 배치)`});
    // the 20 A shunt node touches only the FET source and the shunt; the driver's sense (+) and low-side source pins get their own
    // traces through net ties at that node (datasheet: independent CSxP / LSSx connections) — they route like signals
    ctx.part('R','0Ω','0402',{1:N(h+'_SNSP'),2:ret},{desc:`센스 켈빈 넷 타이 CS${cs}P (${LG(h)} — ${drv} 핀 옆, 션트 노드까지는 전류 없는 켈빈 선)`});
    ctx.part('R','0Ω','0402',{1:N(h+'_LSS'),2:ret},{desc:`LSS 넷 타이 (${LG(h)} — ${drv} 핀 옆, 로우사이드 FET 소스에서 독립 연결)`});const amp=N('ISNS_'+h+'_AMP'),out=N('ISNS_'+h);
    ctx.part('R','1kΩ','0603',{1:amp,2:out},{desc:'ADC RC 필터'});ctx.part('C','1nF','0603',{1:out,2:'GND'},{desc:'ADC RC 필터'});ctx.sig(out,'adc');
    ctx.curr(ph,I);ctx.curr(ret,I,'leg');ctx.peak(ph,pwr.Ipk||I,pwr.tpk||2);ctx.peak(ret,pwr.Ipk||I,pwr.tpk||2);ctx.sig(N('INH_'+h),'pwm','pwm6');ctx.sig(N('INL_'+h),'pwm','pwm6');});
  ctx.part('R','10kΩ','0603',{1:N('DIAG'),2:vio},{desc:`${drv} DIAG 오픈 드레인 풀업 (10~20 kΩ)`});
  ctx.part('R','10kΩ','0603',{1:N('EN'),2:'GND'},{desc:'ENABLE 풀다운 (MCU 리셋 중 게이트 OFF)'});
  ctx.sig(N('EN'),'gpio_out');ctx.sig(N('RESETN'),'gpio_out');ctx.sig(N('DIAG'),'irq_in');if(num['OOS'])ctx.sig(N('ISNS_OOS'),'adc'); // CSxO is referenced to OOS: read both, subtract
  if(!(nDrv>1&&ctx._drvSpi)){ctx.sig(SP('SCK'),'spi_sck','spi2');ctx.sig(SP('SDI'),'spi_mosi','spi2');ctx.sig(SP('SDO'),'spi_miso','spi2');ctx._drvSpi=true;}ctx.sig(N('STRN'),'gpio_out');
  // sense amplifier range (datasheet "Current Sense Amplifier Configuration"): VCSO = VID × AV + VOOS within 0.3…4.8 V and the ADC range
  const vadc=ctx.railV?ctx.railV(vio):3.3,dv=Rs*I*20;const lo=(o)=>+(o-dv).toFixed(2),hi=(o)=>+(o+dv).toFixed(2);
  if(AMT){ctx.warn(`${drv}: 센스 앰프 이득 20(기본) · 오프셋은 SPI(SAO)로 0–2.5 V — ±${pwr.Ipk||I} A에서 ±${(Rs*(pwr.Ipk||I)*20).toFixed(2)} V이므로 ADC ${vadc} V에는 VOOS 1.5 V 설정 권장 (출력 유효 범위 0.3–4.8 V) · 로직 3.3 V는 -3 품번 · 내장 벅은 -A 품번(BRE = 1)`);return true;}
  if(vadc<4.9){const ok=lo(1.5)>=0.3&&hi(1.5)<=Math.min(4.8,vadc-0.2);
    ctx.warn(`${drv}: MCU ADC ${vadc} V — 센스 앰프 기본 오프셋 2.5 V면 ±${I} A에서 ${lo(2.5)}~${hi(2.5)} V로 넘칠 수 있음 → 초기화에서 SPI로 SAO = 11 (VOOS 1.5 V) · 이득 20 설정 시 ${lo(1.5)}~${hi(1.5)} V${ok?' (범위 안)':' — 그래도 넘침, 이득을 낮추세요'} · OOS도 ADC로 읽어 빼기`);}
  ctx.warn(`${drv}: VREG 기본 8 V(VRG = 0) — 부트스트랩 ${cbLab}는 8 V 기준 계산, 11 V(VRG = 1)로 바꾸면 여유가 더 커짐`);
  return true;}
/* TI DRV8334-Q1 (SLVSHC8A): 3-phase smart gate driver — PVDD/VDRAIN from the bridge supply, GVDD charge pump (CPH–CPL), trickle
   charge pump (CPTH–CPTL, VCP–VDRAIN) for 100 % duty, bootstrap per phase, three low-side sense amplifiers SPx/SNx → SOx
   (referenced to VREF), SPI, DRVOFF / nSLEEP / nFAULT. Component values from the datasheet "External Components" table. */
function ti8334(ctx,vm,I,pwr,N,o){o=o||{};const mpn='DRV8334-Q1';const rec=NEWPROJ.partLookup?NEWPROJ.partLookup(mpn):null;
  if(!rec||!(rec.pins&&rec.pins.length)){ctx.warn(`${mpn}: 핀 표가 없어 IR2104 ×3 스테이지로 대신 만들었습니다`);return false;}
  const num={};rec.pins.forEach(q=>{const nm=String(q.name||'').toUpperCase();(num[nm]=num[nm]||[]).push(String(q.num));});
  const pins={};const set=(nm,net)=>{(num[nm.toUpperCase()]||[]).forEach(n=>{pins[n]=net;});};
  const miss=['PVDD','VDRAIN','GVDD','CPH','CPL','CPTH','CPTL','VCP','VREF','DRVOFF','NSLEEP','NFAULT','SDI','SDO','SCLK','NSCS','GND','AGND'].filter(x=>!num[x]);
  if(miss.length){ctx.warn(`${mpn}: 핀 표에 ${miss.join(', ')} 핀이 없어 회로를 만들지 못했습니다`);return false;}
  const vio=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(vio);
  // CBST > 20 × Qg / (VGHx − VSHx) — GVDD ≈ 10–11 V class, take 10 V; the datasheet's default is 1.0 µF 20 V
  const qg=((pwr.f2&&pwr.f2.qg)||(pwr.f&&pwr.f.qg)||60)*(pwr.par||1);const cbMin=20*qg/10;const CB=[1000,2200].find(v=>v>=cbMin)||2200;const cbLab=(CB/1000)+'µF';
  set('PVDD',vm);set('VDRAIN',vm);set('GND','GND');set('AGND','GND');set('PAD','GND');set('GVDD',N('GVDD'));set('CPH',N('CPH'));set('CPL',N('CPL'));set('CPTH',N('CPTH'));set('CPTL',N('CPTL'));set('VCP',N('VCP'));
  set('VREF',vio);set('DRVOFF',N('DRVOFF'));set('NSLEEP',N('NSLEEP'));set('NFAULT',N('NFAULT'));set('SDI',N('SDI'));set('SDO',N('SDO'));set('SCLK',N('SCK'));set('NSCS',N('NSCS'));
  const PH=o.legs||{A:'U',B:'V',C:'W'};const unused=['A','B','C'].filter(x=>!PH[x]);const LG=h=>o.legs?h+' 레그':h+'상';
  Object.entries(PH).forEach(([x,h])=>{set('GH'+x,N(h+'_HO'));set('GL'+x,N(h+'_LO'));set('SH'+x,N(h));set('BST'+x,N(h+'_VB'));set('SL'+x,N(h+'_LSS'));set('INH'+x,N('INH_'+h));set('INL'+x,N('INL_'+h));
    set('SP'+x,N(h+'_SNSP'));set('SN'+x,N(h+'_SNSM'));set('SO'+x,N('ISNS_'+h+'_AMP'));});
  unused.forEach(x=>{set('SH'+x,'GND');set('BST'+x,N('BST'+x+'_UNUSED'));set('SL'+x,'GND');set('INH'+x,'GND');set('INL'+x,'GND');set('SP'+x,'GND');set('SN'+x,'GND');});
  const fpName=String(rec.fp||'').replace(/^[^:]*:/,'');
  ctx.part('U','DRV8334-Q1',(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'?FPGEN.ensure(PCB,fpName||rec.pkg,rec.pins.length)||FPGEN.ensure(PCB,rec.pkg,rec.pins.length):'')||'QFP-48-EP',pins,
    {mpn,desc:`3상 스마트 게이트 드라이버 (TI DRV8334-Q1 · ${Object.keys(PH).length}레그 · SPI 진단 · 로우사이드 센스 앰프 ×${Object.keys(PH).length} · 4.5–60 V)${unused.length?' · 미사용 '+unused.join('·')+' 레그 SPI로 마스크':''}`,P:0.3});
  unused.forEach(x=>ctx.part('C','100nF','0402',{1:N('BST'+x+'_UNUSED'),2:'GND'},{desc:`DRV8334 미사용 ${x} 레그 BST${x} (SH${x} = GND, 노드 고정용)`}));
  ctx.part('C','10µF','1206',{1:vm,2:'GND'},{desc:'DRV8334 CPVDD 10 µF 세라믹 (PVDD 핀 옆, 데이터시트 외부 부품 표)'});
  ctx.part('C','1µF','0603',{1:vm,2:'GND'},{desc:'DRV8334 CVDRAIN 1 µF (VDRAIN 핀 옆)'});
  ctx.part('C','10µF','0805',{1:N('GVDD'),2:'GND'},{desc:'DRV8334 CGVDD 10 µF 세라믹 25 V'});
  ctx.part('C','1µF','0603',{1:N('CPH'),2:N('CPL')},{desc:'DRV8334 CCP_FLY 1.0 µF (CPH–CPL, 핀 바로 옆) 25 V'});
  ctx.part('C','1µF','0603',{1:N('CPTH'),2:N('CPTL')},{desc:'DRV8334 CCPT_FLY 1.0 µF (CPTH–CPTL) 25 V'});
  ctx.part('C','1µF','0805',{1:N('VCP'),2:vm},{desc:'DRV8334 CVCP 1.0 µF (VCP–VDRAIN) 25 V'});
  ctx.part('C','100nF','0402',{1:vio,2:'GND'},{desc:'DRV8334 CVREF 0.1 µF (VREF 핀 옆)'});
  let Rs=0.002;
  Object.entries(PH).forEach(([x,h])=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO'),ret=N(h+'_SNS');
    ctx.part('C',cbLab,'0805',{1:vb,2:ph},{desc:`부트스트랩 BST${x}–SH${x} (${LG(h)} · ${cbLab} 25 V — CBST > 20 × Qg ${qg} nC / 10 V)`});
    fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);
    // sense common mode ±2 V: shunt sized for ≤ 60 mV at the peak current; SPx/SNx as a Kelvin pair from the shunt ends (net ties)
    Rs=shunt(ctx,ret,I,LG(h),0.06,pwr.Ipk,pwr.tpk);
    ctx.part('R','0Ω','0402',{1:N(h+'_SNSM'),2:'GND'},{desc:`센스 켈빈 넷 타이 SN${x} (${LG(h)} — 션트 GND 패드에 붙여 배치)`});
    ctx.part('R','0Ω','0402',{1:N(h+'_SNSP'),2:ret},{desc:`센스 켈빈 넷 타이 SP${x} (${LG(h)} — 션트 노드, 평행 켈빈 선)`});
    ctx.part('R','0Ω','0402',{1:N(h+'_LSS'),2:ret},{desc:`SL${x} 넷 타이 (${LG(h)} — 로우사이드 FET 소스에 직접, VDS 감지)`});
    const amp=N('ISNS_'+h+'_AMP'),out=N('ISNS_'+h);
    ctx.part('R','160Ω','0402',{1:amp,2:out},{desc:'DRV8334 RSO 160 Ω 출력 필터'});ctx.part('C','470pF','0402',{1:out,2:'GND'},{desc:'DRV8334 CSO 470 pF 출력 필터'});ctx.sig(out,'adc');
    ctx.curr(ph,I);ctx.curr(ret,I,'leg');ctx.peak(ph,pwr.Ipk||I,pwr.tpk||2);ctx.peak(ret,pwr.Ipk||I,pwr.tpk||2);ctx.sig(N('INH_'+h),'pwm','pwm6');ctx.sig(N('INL_'+h),'pwm','pwm6');});
  ctx.part('R','10kΩ','0402',{1:N('NFAULT'),2:vio},{desc:'DRV8334 RnFAULT 10 kΩ 풀업 (MCU I/O 전원)'});
  ctx.part('R','10kΩ','0402',{1:N('DRVOFF'),2:vio},{desc:'DRVOFF 풀업 — MCU 리셋 중 게이트 OFF (액티브 하이 차단)'});
  ctx.part('R','10kΩ','0402',{1:N('NSLEEP'),2:'GND'},{desc:'nSLEEP 풀다운 — MCU가 깨울 때까지 슬립'});
  ctx.sig(N('DRVOFF'),'gpio_out');ctx.sig(N('NSLEEP'),'gpio_out');ctx.sig(N('NFAULT'),'irq_in');
  ctx.sig(N('SCK'),'spi_sck','spi2');ctx.sig(N('SDI'),'spi_mosi','spi2');ctx.sig(N('SDO'),'spi_miso','spi2');ctx.sig(N('NSCS'),'gpio_out');
  ctx.warn(`DRV8334-Q1: 센스 앰프 출력은 VREF(${vio}) 기준 — 이득은 SPI로 설정 (9단계), 션트 ${Rs*1000} mΩ에서 ±${I} A면 ±${(Rs*I*1000).toFixed(0)} mV 입력 · 주문 품번(E/Q 등급)과 노출 패드 치수는 패키지 도면으로 확인`);
  return true;}
function shuntAmp(ctx,net,out,I,what,Ipk,tpk){Ipk=Math.max(I,+Ipk||0);const R=shunt(ctx,net,I,what,0.045,Ipk,tpk);
  const vs=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(vs);const amp=out+'_AMP';
  ctx.part('U','INA181A2-Q1','SOT-23-6',{1:amp,2:'GND',3:net,4:'GND',5:'GND',6:vs},{mpn:'INA181A2QDBVRQ1',desc:`${what} 전류 앰프 ×50 (${(R*Ipk*50).toFixed(2)} V @ 피크 ${Ipk} A)`,pinNames:{1:'OUT',2:'GND',3:'IN+',4:'IN−',5:'REF',6:'VS'},P:0.002});
  ctx.cap(vs,'100nF','전류 앰프 디커플링');ctx.part('R','1kΩ','0603',{1:amp,2:out},{desc:'ADC RC 필터'});ctx.part('C','1nF','0603',{1:out,2:'GND'},{desc:'ADC RC 필터'});ctx.sig(out,'adc');}
function bulk(ctx,vm,I,what){const Vb=ctx.railV?ctx.railV(vm):12;
  if(Vb>30){const n=Math.max(2,Math.min(6,Math.ceil(I/10)));if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')FPGEN.ensure(PCB,'CP-SMD-10x10');
    for(let i=0;i<n;i++)ctx.part('CP','100µF','CP-SMD-10x10',{1:vm,2:'GND'},{mpn:'',desc:`${what} DC 링크 벌크 (100 µF · 정격 80 V 이상 하이브리드/알루미늄 · 리플 전류 정격으로 품번 지정 필요)`});
    for(let i=0;i<4;i++)ctx.part('C','2.2µF','1210',{1:vm,2:'GND'},{mpn:capHV['2.2µF'][0],desc:`${what} DC 링크 세라믹 (100 V X7R — FET 가까이)`});ctx.cap(vm,'100nF',`${what} DC 링크 고주파 바이패스`);return;}
  const n=Math.max(1,Math.min(4,Math.ceil(I/20)));for(let i=0;i<n;i++)ctx.part('CP','470µF','CP-SMD-10x10',{1:vm,2:'GND'},{mpn:'EEE-FK1V471SP',desc:`${what} VM 벌크 (35 V 470 µF · 리플 전류)`});
  ctx.part('C','2.2µF','1210',{1:vm,2:'GND'},{desc:`${what} VM 세라믹 (50 V)`});ctx.part('C','2.2µF','1210',{1:vm,2:'GND'},{desc:`${what} VM 세라믹 (50 V)`});ctx.cap(vm,'100nF',`${what} VM 고주파 바이패스`);}
/* ---------- build: plan → parts, nets, MCU pin assignment, board spec ---------- */
/* motor currents written in a sentence: continuous ("상시 · 연속 · 정격 10 A"), peak ("피크 · 최대 · 기동 · 구속 40 A") and its
   duration ("2초", "2 s", "500 ms"). Without the words, the largest ampere figure is the continuous current (as before). */
function motorCurrents(text){const t=String(text||'');const A='(\\d+(?:\\.\\d+)?)\\s*A(?![a-zA-Z가-힣])';
  const g=re=>{const m=t.match(new RegExp(re,'i'));return m?+m[m.length-1]:null;};
  const i=g(`(?:상시|연속|정격|평균|rated|continuous|cont\\.?)\\s*(?:전류|상전류|current)?\\s*[:=]?\\s*${A}`);
  const ipk=g(`(?:피크|peak|최대|기동|돌입|구속|stall|과부하|inrush)\\s*(?:전류|상전류|current)?\\s*[:=]?\\s*${A}`);
  let tpk=null;const m=t.match(/(?:피크|peak|최대|기동|구속|stall|과부하)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*(ms|초|s|sec)(?![a-zA-Z0-9])/i)||t.match(/(\d+(?:\.\d+)?)\s*(ms|초|sec)\s*(?:이내|동안|간|피크|peak)/i);
  if(m)tpk=+m[1]*(/^ms$/i.test(m[2])?0.001:1);return{i,ipk,tpk};}
function motorOptions(plan){const t=String(plan&&plan.req||'');if(!t)return plan;const c=motorCurrents(t);if(c.i==null&&c.ipk==null&&c.tpk==null)return plan;let ch=0;
  const blocks=plan.blocks.map(b=>{if(!/^(gdrv3|hbridge)$/.test(b.type))return b;const P=Object.assign({},b.params);const def=LIB[b.type].params;
    if(c.i!=null&&(P.i==null||+P.i===+def.i.def)){P.i=c.i;ch=1;}if(c.ipk!=null&&(P.ipk==null||P.ipk==='auto')){P.ipk=c.ipk;ch=1;}if(c.tpk!=null&&(P.tpk==null||+P.tpk===+def.tpk.def)){P.tpk=c.tpk;ch=1;}
    return Object.assign({},b,{params:P});});return ch?Object.assign({},plan,{blocks}):plan;}
/* input-stage options from the requirement text (explicit block parameters win): IGN / KL15, undervoltage lockout, load dump */
function inputOptions(plan){const t=String(plan&&plan.req||'');const i=(plan.blocks||[]).findIndex(b=>b.type==='pwr_in');if(i<0||!t)return plan;
  const P=Object.assign({},plan.blocks[i].params),dflt=(k,d)=>P[k]==null||String(P[k])===String(d);let ch=0;
  if(dflt('ign',0)&&/\bIGN\b|KL\s*15|점화|이그니션|ignition/i.test(t)){P.ign=1;ch=1;}
  if(dflt('uvlo','off')){const m=t.match(/(?:저전압|약전압|UVLO|언더\s*볼티지|undervoltage)[^0-9\n]{0,12}(\d+(?:\.\d+)?)\s*V/i);if(m){P.uvlo=+m[1];ch=1;}else if(/저전압|약전압|UVLO|언더\s*볼티지|undervoltage/i.test(t)){P.uvlo='auto';ch=1;}}
  if(dflt('tvs',1)&&/로드\s*덤프|load\s*dump/i.test(t)){P.tvs='loaddump';ch=1;}
  if(!ch)return plan;const blocks=plan.blocks.slice();blocks[i]=Object.assign({},blocks[i],{params:P});return Object.assign({},plan,{blocks});}
function build(plan){plan=motorOptions(inputOptions(plan));const asil=plan.asil&&String(plan.asil).toUpperCase()!=='QM'?String(plan.asil).toUpperCase():null;
  const parts=[],warn=[],rails={},used=new Set(),sigs=[],fixedPins={},xt=[],curr={},currFull={},peak={};let mcu=null;const cnt={};const uq={};
  const has=t=>plan.blocks.some(b=>b.type===t);
  const shrinkLog=[];const ctx={plan,shrinkLog,rails,
    part(prefix,val,fp,pins,o){o=o||{};cnt[prefix]=(cnt[prefix]||0)+1;const ref=prefix+cnt[prefix];const c={ref,val,fp,pins:Object.fromEntries(Object.entries(pins).filter(([,v])=>v)),mpn:o.mpn||(prefix==='C'?capMpn[val]:prefix==='R'?rMpn(val):'')||'',desc:o.desc||'',pinNames:o.pinNames||null,block:ctx._b,P:o.P||0,lk:o.lk,pk:o.pk,ldo:o.ldo,buck:o.buck,mcu:!!o.mcu};{const u=ctx._cu;if(u&&o.lk==='phase'&&(prefix==='Q'||prefix==='R')){const n=prefix==='Q'?Math.max(1,u.par||1):1;c.It=+(u.Iw*u.kl/n).toFixed(2);c.Itpk=+(u.Ipk/n).toFixed(2);}}parts.push(c);return c;},
    // rails above 30 V (48 V systems): 100 V ceramics — class II at no more than half its rating
    cap(rail,val,desc){if(!rail)return;used.add(rail);const hv=(ctx.railV?ctx.railV(rail):0)>30&&capHV[val];if(hv)return ctx.part('C',val,hv[1],{1:rail,2:'GND'},{desc:desc+' · 100 V',mpn:hv[0]});return ctx.part('C',val,capFp(val),{1:rail,2:'GND'},{desc,mpn:capMpn[val]});},
    provide(rail,v,by){rails[rail]={v,by,block:ctx._b};},railV(r){return rails[r]?rails[r].v:(typeof SIM!=='undefined'&&SIM.nominalV?SIM.nominalV(r):0);},use(r){if(r)used.add(r);},has,
    railNear(v){const r=Object.entries(rails).filter(([,x])=>x.v>0).sort((a,b)=>Math.abs(a[1].v-v)-Math.abs(b[1].v-v))[0];return r?r[0]:ctx.highest(0);},
    highest(min){const r=Object.entries(rails).filter(([,x])=>x.v>=min).sort((a,b)=>b[1].v-a[1].v)[0];if(!r){warn.push(`${min} V 이상 레일이 없음 — 전원 블록을 먼저 넣으세요`);return'+12V';}return r[0];},
    setMcu(k){mcu=k;},mcu(){return mcu;},warn(t){warn.push(t);},mcuPin(n,net){fixedPins[n]=net;},need(t){if(!has(t))warn.push(`${t} 블록이 필요합니다 (예: add ${t})`);},
    sig(net,role,group){sigs.push({net,role,group:group||null,block:ctx._b});},xtal(a,b){xt.push(a,b);},curr(net,I,kind){const u=ctx._cu;if(u&&I>0){const f=I*(u.Iw/u.I0);if(kind==='leg'&&u.kl<1&&net)currFull[net]=Math.max(currFull[net]||0,+f.toFixed(2));I=f*(kind==='leg'?u.kl:1);}if(net&&I>0)curr[net]=Math.max(curr[net]||0,+(+I).toFixed(2));},
    // peaks: the highest one, plus lower ones that last longer (plans with curModel 2; a block's profile adds its own)
    peak(net,I,t){if(!net||!(I>0))return;const add=(I,t)=>{const o=peak[net];if(!o){peak[net]={I:+I,t:+t||2};return;}if(!ctx._cu){if(I>o.I)peak[net]={I:+I,t:+t||2};return;}
        if(I>o.I){const m=(o.more||[]).concat(t<o.t?[{I:o.I,t:o.t}]:[]);peak[net]=m.length?{I:+I,t:+t,more:m}:{I:+I,t:+t};}else if(I===o.I)o.t=Math.max(o.t,+t);else if(t>o.t&&!(o.more||[]).some(m=>m.I>=I&&m.t>=t))(o.more=o.more||[]).push({I:+I,t:+t});};
      add(I,t);if(ctx._cu)ctx._cu.more.forEach(x=>add(x.I,x.t));},
    uniq(base){uq[base]=(uq[base]||0)+1;return uq[base]===1&&base!=='LED'&&base!=='BTN'?base:base+uq[base];}};
  // power first (rails), then MCU, then the rest
  const order=['pwr_in','usb_in','buck','ldo','mcu','xtal'];const bl=plan.blocks.slice().sort((a,b)=>{const i=order.indexOf(a.type),j=order.indexOf(b.type);return(i<0?9:i)-(j<0?9:j);});
  bl.forEach(b=>{ctx._b=b.id;ctx._cu=null;try{LIB[b.type].build(ctx,b.params);}catch(e){warn.push(`${b.id}: ${e.message}`);}ctx._cu=null;});
  {const pi=plan.blocks.find(b=>b.type==='pwr_in');if(pi&&String(pi.params&&pi.params.conn)==='ecu')ecuConnector(plan,parts,curr,peak,warn);else if(pi&&String(pi.params&&pi.params.conn)==='ecu-io')ecuConnectorIO(plan,parts,curr,peak,warn);}
  // rails used but never produced
  used.forEach(r=>{if(r!=='GND'&&r!=='VDD'&&!rails[r])warn.push(`${r} 레일을 만드는 블록이 없음 (예: add ldo --vout ${r==='+5V'?5:3.3})`);});
  // LDO checks: headroom and dissipation from the loads on its rail
  const load={};parts.forEach(c=>{const blkI={mcu:0.06,can:0.07,flash:0.02,led:0.01,uart:0,i2c:0.002,button:0,vmon:0,bldc:0.01,xtal:0}[(plan.blocks.find(b=>b.id===c.block)||{}).type];void blkI;});
  plan.blocks.forEach(b=>{const I={mcu:b.params.part&&mcuKey(b.params.part)==='TC364DP-64F300F'?0.35:0.03,can:0.06,flash:0.02,led:0.006*(+b.params.n||1),bldc:0.02,i2c:0.002}[b.type]||0;const r=b.type==='can'?'+5V':'+3V3';if(I)load[r]=(load[r]||0)+I;});
  parts.filter(c=>c.buck).forEach(c=>{const{src,out,vout}=c.buck;let I=load[out]||0;parts.filter(d=>(d.ldo||d.buck)&&(d.ldo||d.buck).src===out&&d!==c).forEach(d=>{I+=load[(d.ldo||d.buck).out]||0;});
    const P=vout*I*(1/0.88-1);c.P=Math.round(Math.max(0.05,P)*100)/100;const vi=rails[src]?rails[src].v:null;c.desc+=` · 부하 약 ${(I*1000).toFixed(0)} mA → 손실 약 ${c.P} W (효율 88% 가정)`;
    if(vi!=null&&/TPS54331/.test(c.val)&&(vi<vout+1.5||vi>28))warn.push(`${c.ref}: 입력 ${vi} V가 TPS54331 범위(${vout+1.5}–28 V) 밖`);});
  parts.filter(c=>c.ldo).forEach(c=>{const{src,out,vout}=c.ldo;const vi=rails[src]?rails[src].v:null;let I=load[out]||0;
    // a 5 V LDO also feeds the 3.3 V LDO behind it
    parts.filter(d=>(d.ldo||d.buck)&&(d.ldo||d.buck).src===out&&d!==c).forEach(d=>{I+=load[(d.ldo||d.buck).out]||0;});
    if(vi!=null&&vi<vout+1.1)warn.push(`${c.ref}: 입력 ${vi} V가 ${vout} V + 드롭아웃 1.1 V보다 낮음`);
    if(vi!=null){const P=(vi-vout)*I;c.P=Math.round(P*100)/100;c.desc+=` · 부하 약 ${(I*1000).toFixed(0)} mA → 손실 ${P.toFixed(2)} W`;if(P>0.8)warn.push(`${c.ref}: LDO 손실 ${P.toFixed(2)} W — 방열 동박을 넓히거나 DC-DC로 바꾸기 권장`);}});
  const shr=shrink(plan,parts,rails,warn,shrinkLog);
  // MCU pin assignment
  const pinmap={};const assigned=[];
  if(mcu){const db=MCU_PINS.DB[mcu];const M=MCUS[mcu];const U=parts.find(c=>c.mcu);
    const busy=new Set(Object.keys(U.pins).map(String));Object.entries(fixedPins).forEach(([n,net])=>{U.pins[n]=net;busy.add(String(n));});
    M.reserved.forEach(n=>busy.add(String(n)));if(M.boot)busy.add(String(M.boot));if(M.reset)busy.add(String(M.reset));
    if(xt.length&&M.xtal.length){U.pins[M.xtal[0]]=xt[0];U.pins[M.xtal[1]]=xt[1];busy.add(String(M.xtal[0]));busy.add(String(M.xtal[1]));}
    else if(mcu==='TC364DP-64F300F')warn.push('TC364는 외부 크리스털이 필요합니다 (add xtal)');
    if(!sigs.some(s=>s.role==='usb_dm'))M.usb.forEach(n=>{});else M.usb.forEach(n=>busy.add('usbres'+n));
    const opts=n=>{const p=db.pins[n];if(!p)return[];const o=MCU_PINS.options(db,n).slice();if(p.an!=null&&!o.some(x=>x.role==='adc'))o.push({role:'adc',inst:'EVADC',ch:p.an});return o;};
    const pinsAll=Object.keys(db.pins).filter(n=>!db.pins[n].supply||db.pins[n].an!=null);
    const free=n=>!busy.has(String(n));
    const cands=(role,inst)=>pinsAll.filter(free).map(n=>({n,o:opts(n)})).filter(x=>x.o.some(o=>o.role===role&&(inst==null||o.inst===inst)))
      .sort((a,b)=>a.o.length-b.o.length||(+a.n)-(+b.n));
    const put=(s,n)=>{U.pins[n]=s.net;busy.add(String(n));const p=db.pins[n];assigned.push({net:s.net,role:s.role,pin:n,name:p.name,inst:(opts(n).find(o=>o.role===s.role)||{}).inst||''});};
    // USB pins are fixed on the STM32F042
    sigs.filter(s=>s.role==='usb_dm'||s.role==='usb_dp').forEach(s=>{const n=s.role==='usb_dm'?M.usb[0]:M.usb[1];if(n){put(s,n);}else warn.push(`${mcu}에는 USB가 없습니다`);});
    const groups={};sigs.forEach(s=>{if(s.group&&s.group!=='usb'){(groups[s.group]=groups[s.group]||[]).push(s);}});
    const prio=['can','spi','spi2','uart','i2c','pwm6','pwm3'];
    Object.keys(groups).sort((a,b)=>prio.indexOf(a)-prio.indexOf(b)).forEach(g=>{const list=groups[g];
      const insts=new Set();list.forEach(s=>cands(s.role).forEach(c=>c.o.forEach(o=>{if(o.role===s.role)insts.add(o.inst);})));
      let ok=false;for(const inst of insts){const pick=[];const tmp=new Set();let fail=false;
        for(const s of list){const c=cands(s.role,inst).find(x=>!tmp.has(x.n));if(!c){fail=true;break;}pick.push([s,c.n]);tmp.add(c.n);}
        if(!fail){pick.forEach(([s,n])=>put(s,n));ok=true;break;}}
      if(!ok)list.forEach(s=>{const c=cands(s.role)[0];if(c){put(s,c.n);warn.push(`${s.net}: 같은 주변장치(${g})로 묶지 못해 따로 배정`);}else warn.push(`${s.net}: ${MCU_PINS.ROLES[s.role]||s.role} 가능한 핀이 남지 않음`);});});
    ['adc','pwm','cap','irq_in','gpio_in','gpio_out'].forEach(role=>sigs.filter(s=>!s.group&&s.role===role).forEach(s=>{
      let c=cands(role)[0];if(!c&&role==='irq_in')c=cands('gpio_in')[0];if(!c&&role==='pwm')c=null;
      if(c)put(s,c.n);else warn.push(`${s.net}: ${MCU_PINS.ROLES[role]||role} 가능한 MCU 핀이 남지 않음`);}));
    assigned.forEach(a=>{pinmap[a.net]=a;});}
  else if(sigs.length)warn.push('MCU 블록이 없어 제어 신호를 연결하지 못했습니다 (add mcu)');
  // interfaces between blocks: open-drain outputs get their pull-up, control inputs of power stages / bus transceivers get the pull
  // that holds them in the safe state while the MCU is in reset (plan.ifaceFix = true from the generate step; saved boards replay without it unless their snapshot says so)
  let iface=null;if(typeof IFCHECK!=='undefined'){try{iface=IFCHECK.run({parts});const fixed=[];
      if(plan.ifaceFix===true){const seen=new Set();iface.findings.filter(f=>f.pull&&(f.code==='od_pullup'||f.code==='default_float')).forEach(f=>{if(seen.has(f.net))return;seen.add(f.net);
          ctx.part('R','10kΩ','0402',{1:f.net,2:f.pull.to},{desc:`인터페이스 ${f.pull.to==='GND'?'풀다운':'풀업'} — ${f.pull.why} (블록 간 점검 자동 추가)`});{const np=parts[parts.length-1],ow=parts.find(c=>c.ref===f.refs[0]);if(np&&ow&&ow.block)np.block=ow.block;}fixed.push(f);});
        if(fixed.length)iface=Object.assign(IFCHECK.run({parts}),{fixed});}
      iface.findings.forEach(f=>warn.push(`인터페이스 ${f.sev==='err'?'✕':'△'} ${f.net}: ${f.msg} → ${f.fix}`));}catch(e){iface=null;}
    // external connector signals: a 24 V-class dual ESD diode at the pin for every unprotected signal (two signals per part)
    try{const vmax=(plan.vop&&plan.vop[1])||16;let pr=IFCHECK.connProt({parts},{vbat:vmax,curr});const added=[];
      // 48 V systems: the 24 V part would conduct with the pin shorted to the DC link — nothing is added automatically
      const hv48=Object.values(rails).some(r=>r&&r.v>40);if(hv48&&pr.findings.some(f=>f.add))warn.push('커넥터 신호 ESD: 48 V 계통이라 24 V급 다이오드를 자동으로 넣지 않음 — 스탠드오프 60 V 이상 부품을 지정');
      if(plan.ifaceFix===true&&!hv48){const need=pr.findings.filter(f=>f.add);for(let i=0;i<need.length;i+=2){const a=need[i],b2=need[i+1];const E=IFCHECK.ESD_PART;
          ctx.part('D',E.mpn,'SOT-23',{[E.pins.a]:a.net,[E.pins.b]:b2?b2.net:a.net,[E.pins.gnd]:'GND'},{mpn:E.mpn,desc:`커넥터 신호 ESD/TVS — ${a.net}${b2?' · '+b2.net:' (두 채널 병렬)'} (${a.conn} 핀 가까이 · 24 V급, 블록 간 점검 자동 추가)`,pinNames:E.names});
          const np=parts[parts.length-1],ow=parts.find(c=>c.ref===a.conn);if(np&&ow&&ow.block)np.block=ow.block;added.push(a.net);if(b2)added.push(b2.net);}
        if(added.length)pr=IFCHECK.connProt({parts},{vbat:vmax,curr});}
      pr.added=added;if(iface)iface.prot=pr;else iface={findings:[],prot:pr};
      pr.findings.filter(f=>f.sev!=='info').forEach(f=>warn.push(`커넥터 보호 ${f.sev==='err'?'✕':'△'} ${f.net}: ${f.msg} → ${f.fix}`));}catch(e){}}
  // board size from the part area
  let area=0;parts.forEach(c=>{const f=PCB.FP[c.fp];const b=f?f.lbb:[-1,-1,1,1];area+=(b[2]-b[0]+1.6)*(b[3]-b[1]+1.6);});
  let W,H;if(plan.board){W=plan.board.w;H=plan.board.h;}else{const A=Math.max(1200,area*4.2);W=Math.ceil(Math.sqrt(A*1.6)/5)*5;H=Math.ceil(A/W/5)*5;}
  // value-only parts get an orderable default MPN so BOM, datasheet tab and HSIS can link them
  parts.forEach(c=>{if(!(c.mpn||'').trim()){const m=defaultMpn(c);if(m)c.mpn=m;}});
  // functional-safety part policy: an ASIL plan swaps commercial parts for automotive drop-ins (same package & pinout)
  if(asil&&typeof PARTLIB!=='undefined'){let n=0;parts.forEach(c=>{const alt=PARTLIB.autoAlt(c.mpn||c.val);if(alt&&alt.mpn&&alt.dropIn){const rec=alt.rec;if(/^U|^Q|^D/.test(c.ref)&&rec&&rec.mpn!==c.val)c.val=rec.mpn;c.mpn=alt.mpn;c.desc=(c.desc||'')+` (ASIL ${asil}: ${rec&&rec.grade?rec.grade:'AEC'} 대체)`;n++;}else if(alt&&alt.hint&&/^U/.test(c.ref))warn.push(`${c.ref} ${c.val}: ${alt.hint}`);});if(n)warn.push(`ASIL ${asil} 부품 정책: 상용 부품 ${n}개를 차량용(AEC) 핀 호환 부품으로 바꿨습니다 (safety parts 로 확인)`);}
  // capacitors: voltage derating · transient (jump start / load dump) · DC bias · temperature range · part number vs footprint,
  // on the final part numbers (after defaults and the ASIL swap). The generate step (plan.ifaceFix) swaps in a passing known part.
  let caps=null;if(typeof CAPCHECK!=='undefined'){try{const pw=plan.blocks.find(b=>b.type==='pwr_in');const vin=pw?+(pw.params.vin||12):12;
      const bat=Object.entries(rails).filter(([,x])=>{const b=plan.blocks.find(q=>q.id===x.block);return b&&b.type==='pwr_in';}).map(([k])=>k).concat(['VIN_RAW','VIN_PG']);
      const copt={vin,vbat:(plan.vop&&plan.vop[1])||(vin>16?32:16),loaddump:!!(pw&&String(pw.params.tvs)==='loaddump'),bat,rails:Object.fromEntries(Object.entries(rails).map(([k,x])=>[k,x.v])),Tmax:plan.tmax!=null?+plan.tmax:undefined};
      let changed=[];if(plan.ifaceFix===true)changed=CAPCHECK.fix(parts,copt,(t,v,fp,pins,o)=>ctx.part(t,v,fp,pins,o));
      caps=CAPCHECK.run({parts},copt);caps.fixed=changed;caps.opt=copt;}catch(e){caps=null;}} // reported on its own (r.caps), not in warn
  // power sequencing and cranking: rails and IC supplies as the battery sags, supervisor window, reset-safe power stage
  let pwrseq=null;if(typeof PWRSEQ!=='undefined'){try{pwrseq=PWRSEQ.run({parts,rails,curr},plan,{iface});}catch(e){pwrseq=null;}}
  const spec={_source:'신규 설계',_demo:null,board:{name:plan.name,width:W,height:H,thickness:1.6,corner:2,holes:W>=35&&H>=30?[[3.5,3.5,3.2],[W-3.5,3.5,3.2],[3.5,H-3.5,3.2],[W-3.5,H-3.5,3.2]]:[]},
    components:parts.map((c,i)=>({ref:c.ref,value:c.val,footprint:c.fp,side:'top',x:6+(i%12)*6,y:6+Math.floor(i/12)*6,rotation:0,mpn:c.mpn,description:c.desc,pins:c.pins,pinNames:c.pinNames||undefined}))};
  return{currFull,spec,parts,warn,rails,pinmap,assigned,sigs,mcu,area,W,H,curr,peak,iface,caps,pwrseq,power:parts.filter(c=>c.P).map(c=>({ref:c.ref,P:c.P})),shrink:shr};
}
/* ---------- package shrink (plan.shrink: 0 off · 1 표준 · 2 최대) ----------
   Swaps a part for a smaller package only where the replacement's pinout is known (KiCad 10 symbol / datasheet) and the
   electrical / thermal check passes; everything else is reported with the reason it stayed.
   1: chip R/C 0805·1206 → 0603 · shunt 2512 → 2010/1206 by power · SOT-223 LDO → SOT-23-5 / WSON-6 by input voltage, load and
      dissipation · bridge MOSFETs DPAK → half-bridge 5 × 6 (fetChoice)          2: also chip R/C 0603 → 0402 */
const C0402={'100nF':['CL05B104KO5NNNC',16],'10nF':['CL05B103KB5NNNC',50],'1nF':['CL05B102KB5NNNC',50],'4.7nF':['CL05B472KB5NNNC',50],'3.3nF':['CL05B332KB5NNNC',50],'47pF':['CL05C470JB5NNNC',50],'12pF':['CL05C120JB5NNNC',50],'1µF':['CL05A105KA5NNNC',25]};
const C0603={'10µF':['CL10A106KP8NNNC',10],'1µF':['CL10A105KB8NNNC',50],'2.2µF':['CL10A225KO8NNNC',16]};
/* default orderable part numbers for value-only parts (chip R/C, shunts, discrete diodes named by their part number) */
const C1210={'2.2µF':'CGA6M3X7R1H225K200AB','22µF':'GRM32ER61E226KE15'};
const C0603D={'68nF':'CL10B683KB8NNNC','100nF':'CL10B104KB8NNNC','10nF':'CL10B103KB8NNNC','470nF':'GRM188R71C474KA88D','1µF':'CL10A105KB8NNNC','10µF':'CL10A106KP8NNNC','2.2µF':'CL10A225KO8NNNC'};
const SHUNT={'1206':v=>v===2?'WSLP12062L000FEA':v===1?'WSLP12061L000FEA':null,'2512':v=>({1:'WSL25121L000FEA',2:'WSL25122L000FEA',5:'WSL25125L000FEA'})[v]||null};
const yageoCode=ohm=>{const f=(x,u)=>{const t=(+x.toPrecision(3)).toString();return t.includes('.')?t.replace('.',u):t+u;};return ohm<1e3?f(ohm,'R'):ohm<1e6?f(ohm/1e3,'K'):f(ohm/1e6,'M');};
const ohmOf=v=>{const m=String(v).replace(/\s/g,'').match(/^([\d.]+)(m|k|M)?Ω$/);if(!m)return null;return+m[1]*({m:1e-3,k:1e3,M:1e6}[m[2]]||1);};
function defaultMpn(c){const fp=String(c.fp||'');
  if(/^R/.test(c.ref)){const r=ohmOf(c.val);if(r==null)return null;
    if(r===0&&/^(0402|0603|0805|1206)$/.test(fp))return`RC${fp}JR-070RL`;
    if(r<0.1){const g=SHUNT[fp];return g?g(Math.round(r*1e3)):null;}
    if(/^(0402|0603|0805|1206)$/.test(fp))return`RC${fp}FR-07${yageoCode(r)}L`;return null;}
  if(/^C/.test(c.ref)){if(fp==='1210')return C1210[c.val]||null;if(fp==='0603')return C0603D[c.val]||null;if(fp==='0402')return(C0402[c.val]||[])[0]||null;return null;}
  if(/^D/.test(c.ref)&&/^[A-Z][A-Z0-9\-]{3,}$/.test(String(c.val||'')))return c.val;
  return null;}
/* small LDOs with the KiCad 10 pinout (Regulator_Linear): [mpn, fp, vinMax, iMax, vout, pins{IN,GND,EN,OUT,…}, θJA °C/W, note] */
const LDO_S=[
  ['TLV75533PDBVR','SOT-23-5',5.5,0.5,3.3,{1:'IN',2:'GND',3:'EN',4:'NC',5:'OUT'},180,'500 mA · 5.5 V 입력 (KiCad TLV75533PDBV)'],
  ['TPS7B8133QDRVRQ1','WSON-6-2x2',40,0.15,3.3,{1:'IN',2:'EN',3:'GND',4:'GND',5:'NC',6:'OUT',7:'GND'},75,'150 mA · 40 V 입력 · AEC-Q100 (KiCad TPS7B8133DRV)'],
  ['TPS7B8150QDRVRQ1','WSON-6-2x2',40,0.15,5,{1:'IN',2:'EN',3:'GND',4:'GND',5:'NC',6:'OUT',7:'GND'},75,'150 mA · 40 V 입력 · AEC-Q100 (KiCad TPS7B8150DRV)']];
const railVolt=(rails,net)=>{if(!net)return 0;if(rails[net])return rails[net].v;const m=String(net).match(/^\+(\d+)V(\d*)$/);if(m)return+(m[1]+(m[2]?'.'+m[2]:''));if(/VIN|VBAT|VM\b|RAW/i.test(net))return 14;return 5;};
const capVal=v=>{const m=String(v).match(/^([\d.]+)\s*(p|n|µ|u)F/);if(!m)return null;return+m[1]*{p:1e-12,n:1e-9,'µ':1e-6,u:1e-6}[m[2]];};
const FPAREA={'0402':1.0*0.5,'0603':1.6*0.8,'0805':2.0*1.25,'1206':3.2*1.6,'1210':3.2*2.5,'2010':5.0*2.5,'2512':6.3*3.2,'SOT-223':6.5*7.0,'SOT-23-5':2.9*2.8,'WSON-6-2x2':2*2};
function shrink(plan,parts,rails,warn,log){const lv=+plan.shrink||0;if(!lv)return null;if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined')['0402','2010','1206','SOT-23-5'].forEach(k=>{try{FPGEN.ensure(PCB,k,k==='SOT-23-5'?5:2);}catch(e){}});const out={level:lv,swaps:[],kept:[],saved:0};
  log.forEach(x=>{if(x.keep)out.kept.push({ref:x.ref,what:x.from,why:x.why});else{out.swaps.push({ref:x.ref,from:x.from,to:x.to,why:x.why});out.saved+=x.area||0;}});
  const vmax=c=>Math.max(...Object.values(c.pins).filter(n=>n!=='GND').map(n=>railVolt(rails,n)),0);
  const swap=(c,fp,mpn,why)=>{const a=(FPAREA[c.fp]||0)-(FPAREA[fp]||0);out.swaps.push({ref:c.ref,key:`${c.ref[0]==='C'?'커패시터':'저항'} ${c.fp} → ${fp}`,from:`${c.val} ${c.fp}`,to:`${fp}${mpn?' '+mpn:''}`,why});out.saved+=a;c.fp=fp;if(mpn!=null)c.mpn=mpn;c.desc=(c.desc||'')+` (패키지 축소 → ${fp})`;};
  parts.forEach(c=>{
    // chip resistors (not shunts): 63 mW (0402) / 100 mW (0603) with 50 % derating
    if(/^R\d/.test(c.ref)&&/^(0402|0603|0805|1206)$/.test(c.fp)){const P=c.P||0;
      if((c.fp==='0805'||c.fp==='1206')&&P<=0.05)swap(c,'0603',c.mpn?c.mpn.replace(/^RC(0805|1206)/,'RC0603'):'','저항 0603 (100 mW, 50 % 경감)');
      if(lv>=2&&c.fp==='0603'&&P<=0.03)swap(c,'0402',c.mpn?c.mpn.replace(/^RC0603/,'RC0402'):'','저항 0402 (63 mW, 50 % 경감)');return;}
    // current-sense shunts by dissipation (2010 ≈ 0.75 W, 1206 ≈ 0.25 W rated, 50 % derating)
    // shunt: continuous loss within the derated rating and the peak (start · stall) within the short-time overload — 2.5 × rating
    // for up to 5 s (thick-film / metal-strip chip shunts); longer peaks count as continuous at half the rating
    if(/^R\d/.test(c.ref)&&c.fp==='2512'){const P=c.P||0,pk=c.pk;const RT={'1206':0.5,'2010':0.75};const pkOk=f=>!pk||(pk.t<=5?pk.P<=2.5*RT[f]:pk.P<=0.5*RT[f]);
      const why=f=>`션트 손실 ${P} W${pk?` · 피크 ${pk.P} W ${pk.t} s (단시간 과부하 ${pk.t<=5?2.5*RT[f]:0.5*RT[f]} W 이내)`:''}`;
      if(P<=0.12&&pkOk('1206'))swap(c,'1206',null,why('1206'));else if(P<=0.37&&pkOk('2010'))swap(c,'2010',null,why('2010'));else out.kept.push({ref:c.ref,what:`션트 ${c.val} 2512`,why:`손실 ${P} W${pk?` · 피크 ${pk.P} W ${pk.t} s`:''} — 2512 유지`});return;}
    // ceramic capacitors: the smaller part must keep a voltage rating ≥ 2 × the rail (50 V on battery-side nets)
    if(/^C\d/.test(c.ref)&&/^(0603|0805|1206|1210)$/.test(c.fp)){const v=vmax(c);const need=v>=9?Math.max(50,2*v):2*v;const f=capVal(c.val);
      if((c.fp==='0805'||c.fp==='1206'||c.fp==='1210')){const k=C0603[c.val];if(k&&k[1]>=need){swap(c,'0603',k[0],`${c.val} ${k[1]} V 0603 (레일 ${v} V)`);if(f>=1e-6&&v>3.3)warn.push(`${c.ref}: ${c.val} 0603 — DC 바이어스로 실효 용량 감소, 필요 시 병렬`);}
        else out.kept.push({ref:c.ref,what:`${c.val} ${c.fp}`,why:k?`정격 ${k[1]} V < 필요 ${need} V (레일 ${v} V)`:'0603 대체 부품 없음 (용량 · 전압)'});return;}
      if(lv>=2&&c.fp==='0603'){const k=C0402[c.val];if(k&&k[1]>=need)swap(c,'0402',k[0],`${c.val} ${k[1]} V 0402 (레일 ${v} V)`);
        else out.kept.push({ref:c.ref,what:`${c.val} 0603`,why:k?`0402 정격 ${k[1]} V < 필요 ${need} V (레일 ${v} V)`:'0402 대체 부품 없음'});}
      return;}
    // SOT-223 LDOs → SOT-23-5 / WSON-6 (pinout from the KiCad 10 symbols)
    if(c.ldo&&c.fp==='SOT-223'){const{src,out:o,vout}=c.ldo;const vi=railVolt(rails,src);const I=vi>vout?(c.P||0)/(vi-vout):0;
      const pick=LDO_S.find(L=>Math.abs(L[4]-vout)<0.05&&vi<=L[2]&&I<=L[3]*0.8&&(c.P||0)*L[6]<=40);
      if(!pick){out.kept.push({ref:c.ref,what:`${c.val} SOT-223`,why:`입력 ${vi} V · 부하 약 ${(I*1000).toFixed(0)} mA · 손실 ${c.P||0} W — 소형 LDO(${LDO_S.filter(L=>Math.abs(L[4]-vout)<0.05).map(L=>L[0]+' '+L[3]*1000+' mA/'+L[2]+' V').join(', ')||'해당 전압 없음'}) 범위 밖`});return;}
      const[mpn,fp,,,,pn,th,note]=pick;const pins={};Object.entries(pn).forEach(([n,nm])=>{pins[n]=nm==='IN'||nm==='EN'?src:nm==='OUT'?o:nm==='GND'?'GND':null;});
      const a=(FPAREA[c.fp]||0)-(FPAREA[fp]||0);out.swaps.push({ref:c.ref,from:`${c.val} SOT-223`,to:`${mpn} ${fp}`,why:`${note} · 손실 ${c.P||0} W → 온도 상승 약 ${Math.round((c.P||0)*th)} °C`});out.saved+=a;
      c.val=mpn.replace(/R(Q1)?$/,'$1');c.mpn=mpn;c.fp=fp;c.pins=Object.fromEntries(Object.entries(pins).filter(([,v])=>v));c.pinNames=Object.assign({},pn);c.desc=(c.desc||'')+` (패키지 축소 → ${mpn} ${fp}, EN = 입력)`;
      if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){const nm=FPGEN.ensure(PCB,fp,+(fp.match(/-(\d+)/)||[0,Object.keys(pn).length])[1]);if(nm&&nm!==fp){c.fp=nm;}}return;}
    if(/^(U|Q|D)\d/.test(c.ref)&&/^(SOIC-8|SMA|TO-252|HTSSOP|TQFP)/.test(c.fp)&&!out.kept.some(k=>k.ref===c.ref))out.kept.push({ref:c.ref,what:`${c.val} ${c.fp}`,why:'더 작은 패키지의 핀 데이터 없음 — 데이터시트로 확인 후 추가'});});
  out.saved=Math.round(out.saved*10)/10;
  return out;}
function shrinkText(r){const s=r&&r.shrink;if(!s)return'패키지 축소: 꺼짐 (shrink 1 = 표준 · shrink 2 = 최대)';
  const L=[`패키지 축소 ${s.level===2?'최대':'표준'}: ${s.swaps.length}개 교체 · 부품 면적 약 ${s.saved} mm² 감소 · 유지 ${s.kept.length}개`];
  const grp={};s.swaps.forEach(x=>{const k=x.key||(x.from+' → '+x.to);(grp[k]=grp[k]||[]).push(x);});
  Object.entries(grp).forEach(([k,v])=>L.push(`  ✓ ${k} ×${v.length}  (${v.slice(0,6).map(x=>x.ref).join(' ')}${v.length>6?' …':''}) — ${v[0].why}`));
  const kg={};s.kept.forEach(x=>{(kg[x.why]=kg[x.why]||[]).push(x);});Object.entries(kg).forEach(([w,v])=>L.push(`  · 유지 ${v.map(x=>x.ref+(x.what?' '+x.what:'')).slice(0,4).join(', ')}${v.length>4?' 외 '+(v.length-4)+'개':''} — ${w}`));
  return L.join('\n');}
// board from a plan: place from scratch with the plan's strategy (routing is left to the caller)
/* functional group of a generated part (for PCB zones): from its circuit block, refined by what the part does */
const GROUP_OF={pwr_in:'input',usb_in:'input',ldo:'power',buck:'power',supervisor:'power',mcu:'mcu',xtal:'mcu',flash:'mcu',uart:'mcu',led:'mcu',button:'mcu',i2c:'mcu',can:'comm',
  gdrv3:'stage',hbridge:'stage',bldc:'stage',dcmotor:'stage',hs_switch:'stage',vmon:'sense',ntc:'sense',pmic48:'power'};
function partGroups(plan,parts){const g={};parts.forEach(c=>{const b=plan.blocks.find(x=>x.id===c.block);let k=b?GROUP_OF[b.type]:null;
    if(k==='stage'&&/전류 앰프|ADC RC|홀 (출력|입력)|홀 커넥터 측|홀 입력/.test(c.desc||''))k='sense';
    /* cohesion plans: the PMIC and the 48 V module belong to the power zone (older plans left them without a zone) */if(!k&&b&&plan.cohesion>=2)k={pmic:'power',hvbuck:'power'}[b.type]||null;g[c.ref]=k||null;});return g;}
function toBoard(plan,opts){opts=opts||{};const r=build(plan);const B=PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(r.spec))));B.newPlan=JSON.parse(JSON.stringify(plan));if(r.pwrseq)B.pwrseq=r.pwrseq;
  // dissipation the generator worked out (FET conduction · regulator loss · shunt I²R · IC typical) travels with the part — the thermal analysis starts from it
  {const PM=Object.fromEntries(r.parts.filter(c=>c.P>0).map(c=>[c.ref,c]));B.comps.forEach(c=>{const q=PM[c.ref];if(q){c.P=q.P;if(q.lk)c.lk=q.lk;}});
   // terminal currents of the bridge switches and shunts (curModel 2): what their vias carry
   {const TM=Object.fromEntries(r.parts.filter(c=>c.It>0).map(c=>[c.ref,c]));B.comps.forEach(c=>{const q=TM[c.ref];if(q){c.It=q.It;c.Itpk=q.Itpk;if(q.Itx)c.Itx=q.Itx;}});}
   // the current those losses were worked out at (motor blocks' phase current) — a current profile scales them from here
   const mbs=plan.blocks.filter(b=>/^(gdrv3|hbridge|dcmotor|bldc)$/.test(b.type));const I0=mbs.reduce((a,b)=>a+(+b.params.i||0),0);if(I0>0){B.lossI0=I0;B.lossIpk=mbs.reduce((a,b)=>a+peakOf(b.params,+b.params.i||0).Ipk,0);B.lossTpk=Math.max(...mbs.map(b=>peakOf(b.params,+b.params.i||0).tpk));}}
  r.groups=partGroups(plan,r.parts);
  // copper weight / allowed temperature rise for the current-based widths: motor boards default to 2 oz · ΔT 20 °C
  const motor=plan.blocks.some(b=>/^(gdrv3|hbridge)$/.test(b.type));const pc=plan.pcb||{};B.oz=+pc.oz||(motor?2:1);B.dT=+pc.dT||(motor?20:10);if(plan.curModel===2)B.curModel=2;if(plan.underKeep===true)B.underKeep=true;if(String(pc.std)==='2152')B.ipcStd='2152';if(+pc.plane>0)B.planeDist=+pc.plane;
  // capacity methods chosen at design time (CURRENT, capacity methods)
  /* inner-layer current sharing: on by default for new plans (plan.capInner) — the phase / rail copper also runs on the inner signal layers, tied with vias; pcb.inner=off turns it off */if(innerOn(plan))B.innerPower=true;if(pc.inres!=null&&pc.inres!==''&&isFinite(+pc.inres))B.innerReserve=+pc.inres;if(+pc.ozin>0)B.ozIn=+pc.ozin;if(pc.mask===true||/^(on|1|true|yes)$/i.test(String(pc.mask))){B.maskOpen=true;if(+pc.solder>0)B.solderT=+pc.solder;}{const bb=typeof CURRENT!=='undefined'&&CURRENT.parseBusbar?CURRENT.parseBusbar(pc.busbar):null;if(bb)B.busbar=bb;}if(+pc.k>0)B.kFr4=+pc.k;if(typeof AUTOPLACE!=='undefined'&&AUTOPLACE.floorplan&&plan.zones!==false&&(plan.pcb||{}).zones!==false){const Z=AUTOPLACE.floorplan(B,r.groups,{template:plan.zoneTemplate});if(Z){B.zones=Z;/* block of every part: the placer keeps a circuit block together (plan.cohesion: 1 = bridge channels around their fixed FET cells, 2 = also the other blocks around their own centre) */if(plan.cohesion){Z.blockOf=Object.fromEntries(r.parts.filter(c=>c.block).map(c=>[c.ref,c.block]));Z.coh=+plan.cohesion||1;}}}
  if(r.curr&&Object.keys(r.curr).length)B.netCurrent=Object.assign({},r.curr,B.netCurrent||{});
  // leg-return nets: the whole phase current still passes the node (one switch at a time) — placement pull and routing keep-out stay sized for it
  if(r.currFull&&Object.keys(r.currFull).length)B.netCurrentFull=r.currFull;
  // peak currents (start · stall · overload) and how long they last: the copper is sized for the continuous current and checked / widened for the peak
  {const pk=Object.fromEntries(Object.entries(r.peak||{}).filter(([n,o])=>!(r.curr&&r.curr[n]!=null)||o.I>+r.curr[n]));if(Object.keys(pk).length)B.netPeak=pk;B.dTpk=+pc.dTpk||40;}
  // ambient temperature → allowed rises (board limits 105 °C steady / 125 °C during a peak unless set); explicit dT / dTpk win
  if(pc.tamb!=null&&pc.tamb!==''&&isFinite(+pc.tamb)&&typeof CURRENT!=='undefined'&&CURRENT.budget){const bg=CURRENT.budget(+pc.tamb,pc.tmax,pc.tmaxpk);B.tamb=+pc.tamb;if(!(+pc.dT>0))B.dT=bg.dT;if(!(+pc.dTpk>0))B.dTpk=bg.dTpk;if(bg.tight)r.warn.push(`주위 온도 ${pc.tamb} °C에서 기판 한계(${bg.tmax} / ${bg.tmaxpk} °C)까지 여유가 거의 없음 — 허용 온도 상승을 ${bg.dT} / ${bg.dTpk} °C로 제한`);}
  if(typeof AUTOPLACE!=='undefined'&&opts.place!==false){PCBEDIT.prepare(B);AUTOPLACE.ensurePour(B);const power={};r.power.forEach(x=>{power[x.ref]=x.P;});
    r.place=AUTOPLACE.place(B,{strategy:opts.strategy||plan.strategy||'balanced',scratch:true,seed:opts.seed||1,power});r.macro=r.place.macro;}
  return{B,r};}
function summary(plan){const r=build(plan);const L=[];
  L.push(`프로젝트 ${plan.name} · 블록 ${plan.blocks.length}개 · 부품 ${r.parts.length}개 · 보드 ${r.W} × ${r.H} mm${plan.board?'':' (자동)'} · 배치 전략 ${plan.strategy}`);
  if(plan.req)L.push(`요구사항: ${plan.req}`);
  if(+plan.shrink)L.push(shrinkText(r));
  plan.blocks.forEach(b=>L.push(`  [${b.id}] ${LIB[b.type].label} ${Object.entries(b.params).map(([k,v])=>`${k}=${v}`).join(' ')}`));
  L.push('전원 레일: '+(Object.entries(r.rails).map(([k,v])=>`${k} (${v.by})`).join(' · ')||'없음'));
  if(r.mcu)L.push(`MCU 핀 배정 (${r.assigned.length}): `+r.assigned.map(a=>`${a.net}→${a.name}(${a.pin}${a.inst&&a.inst!=='DIO'?' '+a.inst:''})`).join(', '));
  const bom={};r.parts.forEach(c=>{const k=c.val+' · '+c.fp;bom[k]=(bom[k]||[]);bom[k].push(c.ref);});
  L.push('BOM: '+Object.entries(bom).map(([k,v])=>`${k} ×${v.length}`).join(' · '));
  if(r.power.length)L.push('발열: '+r.power.map(x=>`${x.ref} ${x.P} W`).join(' · '));
  L.push(r.warn.length?'경고:\n'+r.warn.map(w=>'  ! '+w).join('\n'):'경고 없음');
  return{text:L.join('\n'),r};}
/* ---------- BOM cost and circuit variants (step 2: pick a plan by price · features · extensibility) ---------- */
const catOf=c=>c.mcu?'MCU':/^C\d/.test(c.ref)?'커패시터':/^R\d/.test(c.ref)?'저항':/^D\d/.test(c.ref)?'다이오드':/^J\d/.test(c.ref)?'커넥터':/^L\d/.test(c.ref)?'인덕터':/^Y\d/.test(c.ref)?'크리스털':/^Q\d/.test(c.ref)?'트랜지스터':/^M\d/.test(c.ref)?'모터':'전원';
function bom(plan){const r=build(plan);const P=typeof PARTS!=='undefined'?PARTS:null;const items=new Map();let total=0,unknown=0;
  r.parts.forEach(c=>{const key=(c.mpn||c.val)+'|'+c.fp;const it=items.get(key)||{mpn:c.mpn||'',val:c.val,fp:c.fp,refs:[],unit:null,cat:catOf(c)};it.refs.push(c.ref);
    if(it.unit==null){it.unit=P?P.price(c.mpn,it.cat):null;if(it.unit==null){it.unit=0;it.est=true;unknown++;}}items.set(key,it);});
  items.forEach(it=>{it.sub=+(it.unit*it.refs.length).toFixed(3);total+=it.sub;});
  const list=[...items.values()].sort((a,b)=>b.sub-a.sub);return{items:list,total:+total.toFixed(2),unknown,parts:r.parts.length,r};}
// spare MCU pins: assignable signal pins left after the plan's signals
function spareMcuPins(r){if(!r.mcu)return 0;const db=MCU_PINS.DB[r.mcu];const M=MCUS[r.mcu];const U=r.parts.find(c=>c.mcu);if(!db||!U)return 0;
  const busy=new Set(Object.keys(U.pins).map(String));M.reserved.forEach(n=>busy.add(String(n)));if(M.boot)busy.add(String(M.boot));if(M.reset)busy.add(String(M.reset));
  return Object.keys(db.pins).filter(n=>!db.pins[n].supply&&!busy.has(String(n))&&(MCU_PINS.options(db,n).length||db.pins[n].an!=null)).length;}
const FEAT_W={pwr_in:1,usb_in:2,ldo:1,buck:2,mcu:0,xtal:1,can:3,bldc:4,hbridge:5,gdrv3:7,dcmotor:3,led:1,button:1,flash:2,uart:1,i2c:2,vmon:1};
/* unit cost beyond the parts: PCB fabrication (layers × area), assembly (parts, pads, through-hole), part-grade uplift.
   Rough mid-volume (~500 pcs) figures so the three plans can be compared, not a quote. */
const PCB_COST={2:0.065,4:0.14,6:0.24,8:0.36,10:0.5};  // $/cm² incl. amortised setup
const GRADE_K={comm:[1,'상용 등급'],ind:[1.12,'산업 등급 (-40~85 °C)'],core:[1.2,'핵심 IC만 AEC-Q100'],auto:[1.35,'전 IC AEC-Q100'],full:[1.5,'전 부품 AEC-Q100/Q200 + 보호 강화']};
function costModel(r,B,opt){opt=opt||{};const layers=+opt.layers||2;const area=(r.W*r.H)/100;
  const pcb=+(area*(PCB_COST[layers]||PCB_COST[2])+0.6).toFixed(2);
  let pads=0,th=0;r.parts.forEach(c=>{const f=PCB.FP[c.fp];const n=f&&f.pads?f.pads.length:2;pads+=n;if(f&&f.pads&&f.pads.some(p=>p.drill))th+=n;});
  const asm=+(1.2+r.parts.length*0.03+pads*0.01+th*0.04).toFixed(2);
  const g=GRADE_K[opt.grade||'comm']||GRADE_K.comm;const ic=B.items.filter(i=>/^(U|Q|D|J|Y)/.test(i.refs[0]||'')).reduce((a,i)=>a+i.sub,0);
  const grade=+(ic*(g[0]-1)).toFixed(2);
  return{parts:B.total,pcb,asm,grade,gradeLabel:g[1],layers,area:+area.toFixed(1),pads,th,total:+(B.total+pcb+asm+grade).toFixed(2)};}
function planMetrics(plan,tier){const B=bom(plan);const r=B.r;const cost=costModel(r,B,tier||plan.pcb||{});const feat=plan.blocks.reduce((a,b)=>a+(FEAT_W[b.type]||1)*(b.type==='led'||b.type==='button'?Math.min(3,+b.params.n||1):1),0);
  const spare=spareMcuPins(r);const headers=plan.blocks.filter(b=>/^(uart|i2c|usb_in)$/.test(b.type)).length;const ext=Math.round(spare*0.5+headers*8+(r.mcu==='TC364DP-64F300F'?15:0)+(plan.blocks.some(b=>b.type==='flash')?6:0));
  const loss=r.power.reduce((a,x)=>a+x.P,0);
  return{price:cost.total,partsPrice:B.total,cost,unknown:B.unknown,parts:B.parts,feat,spare,headers,ext,loss:+loss.toFixed(2),mcu:r.mcu,warn:r.warn.length,bom:B};}
const clone=p=>JSON.parse(JSON.stringify(p));
const has=(p,t)=>p.blocks.some(b=>b.type===t);
const reqHas=(p,re)=>re.test(String(p.req||'').toLowerCase());
function addSafe(p,t,params){try{return addBlock(p,t,params||{});}catch(e){return null;}}
/* three plans from one: 저가형 (cost) · 표준 (balanced, the plan itself) · 확장형 (features and headroom) */
function variants(plan){
  const base=clone(plan);const out=[];
  // 저가형: cheapest MCU that still meets stated needs, LDO instead of buck when the loss is bearable, optional blocks dropped unless the requirement names them
  const c=clone(plan);const dc=[];
  const mcuB=c.blocks.find(b=>b.type==='mcu');const needTc=reqHas(c,/aurix|tc3|tc364|asil|iso\s*26262|기능\s*안전|lockstep|오릭스/);
  if(mcuB&&mcuKey(mcuB.params.part)==='TC364DP-64F300F'&&!needTc){mcuB.params.part='STM32F042K6U6';dc.push('MCU를 STM32F042K6U6로 (요구사항에 AURIX·ASIL이 없음)');}
  else if(mcuB&&mcuKey(mcuB.params.part)==='TC364DP-64F300F'){dc.push('MCU TC364DP(부품값의 큰 몫)는 요구사항의 AURIX·ASIL 때문에 유지 — 더 싼 안전 MCU(TC334·S32K3)는 부품 라이브러리에 핀 데이터를 넣으면 선택 가능');}
  c.blocks.filter(b=>b.type==='buck').forEach(b=>{b.type='ldo';b.id=b.id.replace(/^buck/,'ldo');b.params={vin:b.params.vin,vout:b.params.vout,iout:'auto'};dc.push(`${b.params.vout} V 벅 컨버터를 LDO로 (부품 7개 → 3개)`);});
  const drop=(t,why,re)=>{const i=c.blocks.findIndex(b=>b.type===t);if(i>=0&&!reqHas(c,re)){c.blocks.splice(i,1);dc.push(why);}};
  drop('flash','SPI 플래시 제거 (요구사항에 로그·저장이 없음)',/플래시|flash|메모리|로그|저장/);
  drop('vmon','전압 감시 제거 (요구사항에 없음)',/전압\s*(감시|모니터|측정)|배터리|vbat|vmon/);
  drop('uart','UART 헤더 제거 (SWD 디버그로 충분)',/uart|시리얼|serial|콘솔|디버그/);
  if(mcuKey((c.blocks.find(b=>b.type==='mcu')||{params:{}}).params.part)==='STM32F042K6U6'&&!has(c,'can')&&has(c,'xtal')&&!reqHas(c,/크리스털|crystal|xtal|정밀/)){c.blocks=c.blocks.filter(b=>b.type!=='xtal');dc.push('크리스털 제거 (STM32 내부 RC · 크리스털리스 USB)');}
  c.blocks.filter(b=>b.type==='led'&&+b.params.n>1).forEach(b=>{dc.push(`LED ${b.params.n}개 → 1개`);b.params.n=1;});
  // the loss check: an LDO that would burn more than 1.2 W goes back to a buck even in the cheap plan
  {const r1=build(c);r1.parts.filter(x=>x.ldo&&x.P>1.2).forEach(x=>{const b=c.blocks.find(y=>y.id===x.block);if(!b)return;b.type='buck';b.id=b.id.replace(/^ldo/,'buck');b.params={vin:b.params.vin,vout:b.params.vout};dc.push(`${b.params.vout} V LDO는 손실 ${x.P} W라 벅 컨버터 유지`);});}
  out.push({key:'cost',label:'저가형',tag:'가격 우선',desc:'요구사항에 적힌 기능만 가장 싼 부품 구성으로. 여유 핀·확장 헤더는 최소.',plan:c,diff:dc.length?dc:['기본 안과 같음 (더 뺄 선택 블록이 없음)']});
  // 표준
  out.push({key:'std',label:'표준',tag:'균형',desc:'요구사항을 규칙대로 구현한 기본 안. 손실이 큰 LDO는 벅으로, CAN·모터는 전용 레일.',plan:base,diff:['요구사항 그대로 (기준 안)']});
  // 확장형
  const e=clone(plan);const de=[];
  e.blocks.filter(b=>b.type==='ldo').forEach(b=>{const r0=build(e);const part=r0.parts.find(x=>x.ldo&&x.block===b.id);if(part&&part.P>0.35){b.type='buck';b.id=b.id.replace(/^ldo/,'buck');b.params={vin:b.params.vin,vout:b.params.vout};de.push(`${b.params.vout} V LDO(손실 ${part.P} W)를 벅 컨버터로 (발열·효율)`);}});
  if(!has(e,'flash')){addSafe(e,'flash');de.push('SPI 플래시 추가 (로그·설정 저장)');}
  if(!has(e,'uart')){addSafe(e,'uart');de.push('UART 디버그 헤더 추가');}
  if(!has(e,'i2c')){addSafe(e,'i2c');de.push('I²C 센서 확장 헤더 추가');}
  if(!has(e,'vmon')){addSafe(e,'vmon');de.push('입력 전압 감시 추가');}
  const led=e.blocks.find(b=>b.type==='led');if(led){if(+led.params.n<2){led.params.n=2;de.push('상태 LED 2개');}}else{addSafe(e,'led',{n:2});de.push('상태 LED 2개 추가');}
  if(!has(e,'button')){addSafe(e,'button',{n:1});de.push('사용자 버튼 추가');}
  const mcuE=e.blocks.find(b=>b.type==='mcu');const needPins=e.blocks.reduce((a,b)=>a+({can:2,bldc:9,hbridge:4,gdrv3:7,dcmotor:2,flash:4,uart:2,i2c:2,vmon:1,led:+b.params.n||1,button:+b.params.n||1,usb_in:2}[b.type]||0),0);
  if(mcuE&&mcuKey(mcuE.params.part)==='STM32F042K6U6'&&(needPins>18||reqHas(e,/차량|automotive|ecu|산업|asil/))){mcuE.params.part='TC364DP-64F300F';if(!has(e,'xtal'))addSafe(e,'xtal');de.push('MCU를 AURIX TC364DP로 (핀 여유 · 안전 기능 · 성능)');}
  out.push({key:'ext',label:'확장형',tag:'기능·확장 우선',desc:'나중에 기능을 더할 수 있게 헤더·메모리·감시를 넣고, 핀이 모자라면 큰 MCU로.',plan:e,diff:de});
  // tiers: PCB layers and part grade differ between the plans, and so does the unit cost (parts + PCB + assembly + grade)
  const auto=reqHas(plan,/차량|automotive|ecu|asil|iso\s*26262|aec/),ind=reqHas(plan,/산업|industrial|-40/),aurix=out[1].m?false:mcuKey((base.blocks.find(b=>b.type==='mcu')||{params:{}}).params.part)==='TC364DP-64F300F';
  const heavy=has(base,'bldc')||has(base,'gdrv3')||has(base,'hbridge')||has(base,'dcmotor')||has(base,'can');
  const tier={cost:{layers:heavy&&aurix?4:2,grade:auto?'core':'comm'},std:{layers:heavy?4:2,grade:auto?'auto':ind?'ind':'comm'},ext:{layers:heavy&&aurix?6:4,grade:auto?'full':'ind'}};
  out.forEach(v=>{const t=tier[v.key];v.plan.pcb=Object.assign({},v.plan.pcb||{},{layers:t.layers,grade:t.grade});v.m=planMetrics(v.plan,t);
    const c=v.m.cost;v.diff.push(`PCB ${t.layers}층 (${c.area} cm² · 약 $${c.pcb}) · 조립 약 $${c.asm} (패드 ${c.pads}) · ${c.gradeLabel}${c.grade?` (+$${c.grade})`:''}`);});
  // relative scores 0–100 for the cards
  const mn=k=>Math.min(...out.map(v=>v.m[k])),mx=k=>Math.max(...out.map(v=>v.m[k]));
  const sc=(v,k,inv)=>{const a=mn(k),b=mx(k);if(b-a<1e-9)return 60;const t=(v.m[k]-a)/(b-a);return Math.round(20+80*(inv?1-t:t));};
  out.forEach(v=>{v.score={price:sc(v,'price',true),feat:sc(v,'feat'),ext:sc(v,'ext')};});
  return out;}
// weighted pick: w = {price,feat,ext} in 0..1
function recommend(vs,w){w=Object.assign({price:1,feat:1,ext:1},w||{});let best=null;vs.forEach(v=>{const s=v.score.price*w.price+v.score.feat*w.feat+v.score.ext*w.ext;v.total=Math.round(s/(w.price+w.feat+w.ext));if(!best||v.total>best.total)best=v;});return best;}
function variantsText(vs){return vs.map(v=>`[${v.key}] ${v.label} (${v.tag}) · 예상 단가 약 $${v.m.price} (부품 $${v.m.partsPrice} + PCB $${v.m.cost.pcb} + 조립 $${v.m.cost.asm}${v.m.cost.grade?' + 등급 $'+v.m.cost.grade:''})${v.m.unknown?' (+미정 '+v.m.unknown+')':''} · 부품 ${v.m.parts}개 · 기능 ${v.m.feat} · 여유 핀 ${v.m.spare} · MCU ${v.m.mcu||'-'} · 손실 ${v.m.loss} W\n  ${v.diff.join(' · ')}`).join('\n');}
return{innerOn,motorCurrents,peakOf,LIB,MCUS,partGroups,GROUP_OF,shrink,shrinkText,LDO_S,partLookup:(mpn)=>{if(typeof PARTLIB==='undefined')return null;const lib=PARTLIB.merge([PARTLIB.fromBuiltin(typeof PARTS!=='undefined'?PARTS:null),typeof KPINS!=='undefined'?PARTLIB.fromKpins(KPINS):[]]);const r=PARTLIB.find(lib,mpn);if(r&&!(r.pins&&r.pins.length)){const kp=PARTLIB.pinoutFor(r.mpn,r.val,r.pkg);if(kp)r.pins=kp;}return r;},mcuKey,blockKey,newPlan,addBlock,setParam,removeBlock,planFrom,costModel,PCB_COST,GRADE_K,ldoToBuck,guessName,build,toBoard,summary,railOf,bom,planMetrics,variants,recommend,variantsText};
})();
if(typeof module!=='undefined')module.exports=NEWPROJ;
