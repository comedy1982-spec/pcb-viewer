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
const railOf=v=>{const n=+v;return n===3.3?'+3V3':n===1.8?'+1V8':'+'+String(n).replace('.','V')+(String(n).includes('.')?'':'V');};
const capMpn={'100nF':'CL10B104KB8NNNC','10nF':'CL10B103KB8NNNC','1µF':'CL10A105KB8NNNC','10µF':'CL21A106KAYNNNE','22µF':'GRM32ER61E226KE15','470nF':'GRM188R71C474KA88D','470µF':'EEE-FK1E471P','100µF':'GRM31CR60J107ME39','3.3nF':'CL10B332KB8NNNC','47pF':'CL10C470JB8NNNC','12pF':'CL10C120JB8NNNC','1nF':'CL10B102KB8NNNC','4.7nF':'CL10B472KB8NNNC'};
const capFp=v=>v==='10µF'?'0805':v==='22µF'?'1210':v==='470µF'?'CP-SMD-10x10':v==='100µF'?'1206':'0603';
const rMpn=v=>{const m={'10kΩ':'RC0603FR-0710KL','4.7kΩ':'RC0603FR-074K7L','330Ω':'RC0603FR-07330RL','100Ω':'RC0603FR-07100RL','5.1kΩ':'RC0603FR-075K1L','100kΩ':'RC0603FR-07100KL','22kΩ':'RC0603FR-0722KL','60.4Ω':'RC0603FR-0760R4L','0.1Ω':'RL1206FR-070R1L'};return m[v]||'';};
const tvsFor=v=>v<=5.5?'SMAJ5.0A':v<=13?'SMAJ15A':v<=26?'SMAJ28A':'SMAJ58A';

/* ---------- blocks ---------- */
const LIB={
  pwr_in:{label:'DC 전원 입력',desc:'커넥터 + 역전압 보호 쇼트키 + 서지 TVS + 벌크 캡 → 입력 레일',params:{vin:{def:12,desc:'입력 전압 [V]'},tvs:{def:1,desc:'TVS 넣기 (1/0)'},bulk:{def:'auto',desc:'벌크 캡 (auto · 10µF · 22µF · 470µF)'}},
    build(ctx,p){const vin=+p.vin;const rail=railOf(vin);ctx.provide(rail,vin,'입력');
      const Im=(ctx.plan&&ctx.plan.blocks||[]).filter(b=>b.type==='hbridge'||b.type==='gdrv3').reduce((a,b)=>a+(+b.params.i||0),0);
      if(Im>2){termFp(2);const n=Math.max(1,Math.ceil(Im/40));if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){FPGEN.ensure(PCB,'TO-252');FPGEN.ensure(PCB,'SOD-123');}
        ctx.part('J',`${vin}V 입력`,'TERM-2-5.08',{1:'VIN_RAW',2:'GND'},{mpn:'1729128',desc:`${vin} V 전원 입력 (5.08 mm 단자 · ${Im} A)`,pinNames:{1:'+',2:'GND'}});
        for(let i=0;i<n;i++)ctx.part('Q','SQD50P04-09L','TO-252',{1:'VIN_PG',2:'VIN_RAW',3:rail},{mpn:'SQD50P04-09L_GE3',desc:`역전압 보호 P-MOSFET (−40 V · 9 mΩ · AEC-Q101)${n>1?' · 병렬 '+n:''}`,pinNames:{1:'G',2:'D',3:'S'},P:+(((Im/n)**2)*0.009+0.02).toFixed(2)});
        ctx.part('R','10kΩ','0603',{1:'VIN_PG',2:'GND'},{desc:'역전압 P-FET 게이트 풀다운 (정극성이면 ON)'});ctx.part('D','BZT52C12','SOD-123',{1:'VIN_PG',2:rail},{mpn:'BZT52C12',desc:'게이트–소스 12 V 클램프 제너',pinNames:{1:'A',2:'K'}});
        ctx.curr('VIN_RAW',Im);ctx.curr(rail,Im);}
      else{ctx.part('J',`${vin}V 입력`,'HDR-1x2',{1:'VIN_RAW',2:'GND'},{mpn:'61300211121',desc:`${vin} V 전원 입력`,pinNames:{1:'+',2:'GND'}});
      ctx.part('D','SS14','SMA',{1:'VIN_RAW',2:rail},{mpn:'SS14',desc:'역전압 보호 쇼트키 (직렬)',pinNames:{1:'A',2:'K'}});}
      if(+p.tvs)ctx.part('D',tvsFor(vin),'SMA',{1:'GND',2:rail},{desc:`입력 서지 TVS (${tvsFor(vin)})`,pinNames:{1:'A',2:'K'}});
      const bulk=p.bulk==='auto'?(ctx.has('bldc')||ctx.has('dcmotor')||ctx.has('hbridge')||ctx.has('gdrv3')?'470µF':vin>6?'22µF':'10µF'):p.bulk;ctx.cap(rail,bulk,'입력 벌크 커패시터');ctx.cap(rail,'100nF','입력 고주파 바이패스');}},
  usb_in:{label:'USB-C 전원·데이터',desc:'USB-C 리셉터클 · CC 5.1 kΩ 풀다운 · VBUS 5 V · D+/D− → MCU USB',params:{data:{def:1,desc:'USB 데이터 연결 (1/0)'}},
    build(ctx,p){ctx.provide('VBUS',5,'USB');const d=+p.data;
      ctx.part('J','USB-C','USB-C',{1:'CC1',2:'VBUS',3:'GND',4:d?'USB_DM':null,5:d?'USB_DP':null,6:'GND',S1:'GND',S2:'GND'},{mpn:'USB4105-GF-A',desc:'USB-C 리셉터클',pinNames:{1:'CC1',2:'VBUS',3:'GND',4:'D−',5:'D+',6:'GND',S1:'SHIELD',S2:'SHIELD'}});
      ctx.part('R','5.1kΩ','0603',{1:'CC1',2:'GND'},{desc:'CC 풀다운 (싱크 5 V)'});ctx.cap('VBUS','10µF','VBUS 벌크');
      if(d){ctx.sig('USB_DM','usb_dm','usb');ctx.sig('USB_DP','usb_dp','usb');}}},
  ldo:{label:'LDO 레귤레이터',desc:'AMS1117 (SOT-223) · 입력/출력 10 µF',params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:3.3,desc:'출력 전압 (3.3 · 5)'},iout:{def:'auto',desc:'예상 부하 전류 [A] (auto = 블록 합)'}},
    build(ctx,p){const vout=+p.vout;const out=railOf(vout);
      // other rails (9 V hall supply, 8 V, 12 V …): adjustable LM317 (40 V input) + 240 Ω / R2 divider, Vout = 1.25·(1 + R2/240)
      if(vout!==5&&vout!==3.3){const src=p.vin==='auto'?ctx.highest(vout+2):p.vin;ctx.provide(out,vout,'LDO');ctx.use(src);const adj=ctx.uniq('LDO_ADJ');
        const E24=[1,1.1,1.2,1.3,1.5,1.6,1.8,2,2.2,2.4,2.7,3,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];const r2x=240*(vout/1.25-1);const dec=Math.pow(10,Math.floor(Math.log10(r2x)));const r2=E24.map(e=>e*dec).concat([10*dec]).reduce((a,b)=>Math.abs(b-r2x)<Math.abs(a-r2x)?b:a);
        const fmt=r=>r>=1000?(+(r/1000).toFixed(2))+'kΩ':Math.round(r)+'Ω';const vr=1.25*(1+r2/240);
        ctx.part('U','LM317','SOT-223',{1:adj,2:out,3:src,4:out},{mpn:'LM317DCYR',desc:`${vout} V 가변 LDO (입력 ${src}, 드롭아웃 ~2 V)`,pinNames:{1:'ADJ',2:'VOUT',3:'VIN',4:'VOUT'},ldo:{src,out,vout}});
        ctx.part('R','240Ω','0603',{1:out,2:adj},{desc:`LM317 분압 상단 (Vout = ${vr.toFixed(2)} V)`});ctx.part('R',fmt(r2),'0603',{1:adj,2:'GND'},{desc:'LM317 분압 하단'});
        ctx.cap(src,'1µF','LDO 입력 커패시터');ctx.cap(out,'10µF','LDO 출력 커패시터');const vs=ctx.railV?ctx.railV(src):null;if(vs&&vs<vout+2.5)ctx.warn(`${out}: 입력 ${vs} V − ${vout} V 출력 — 드롭아웃 여유 부족 (배터리 저하 시 유지 안 됨)`);return;}
      const mpn=vout===5?'AMS1117-5.0':'AMS1117-3.3';
      const src=p.vin==='auto'?ctx.highest(vout+1.1):p.vin;ctx.provide(out,vout,'LDO');ctx.use(src);
      ctx.part('U',mpn,'SOT-223',{1:'GND',2:out,3:src,4:out},{mpn,desc:`${vout} V LDO (입력 ${src})`,pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},ldo:{src,out,vout}});
      ctx.cap(src,'10µF','LDO 입력 커패시터');ctx.cap(out,'10µF','LDO 출력 커패시터');}},
  buck:{label:'벅 컨버터 (DC-DC)',desc:'TPS54331 (3.5–28 V 입력, 3 A, 570 kHz) · 10 µH 인덕터 · SS34 캐치 다이오드 · 22 µF 출력 · 피드백 분압 · 보상',params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:5,desc:'출력 전압 (5 · 3.3)'}},
    build(ctx,p){const vout=+p.vout;const out=railOf(vout);const src=p.vin==='auto'?ctx.highest(vout+2):p.vin;ctx.provide(out,vout,'벅');ctx.use(src);
      const fb=vout===5?['52.3kΩ','10kΩ']:vout===3.3?['31.6kΩ','10kΩ']:[String(Math.round((vout/0.8-1)*100)/10)+'kΩ','10kΩ'];
      ctx.part('U','TPS54331','SOIC-8',{1:'BUCK_BOOT',2:src,3:'BUCK_EN',4:'BUCK_SS',5:'BUCK_FB',6:'BUCK_COMP',7:'GND',8:'BUCK_SW'},{mpn:'TPS54331DR',desc:`${vout} V 벅 컨버터 (입력 ${src})`,pinNames:{1:'BOOT',2:'VIN',3:'EN',4:'SS',5:'VSENSE',6:'COMP',7:'GND',8:'PH'},buck:{src,out,vout}});
      ctx.part('C','100nF','0603',{1:'BUCK_BOOT',2:'BUCK_SW'},{desc:'부트스트랩 캡 (BOOT–PH)'});
      ctx.part('L','10µH','IND-5x5',{1:'BUCK_SW',2:out},{mpn:'SRN5040-100M',desc:'출력 인덕터 10 µH (Bourns SRN5040)',P:0.12});
      ctx.part('D','SS34','SMA',{1:'GND',2:'BUCK_SW'},{desc:'캐치 쇼트키 3 A 40 V',pinNames:{1:'A',2:'K'},P:0.15});
      ctx.cap(src,'22µF','벅 입력 커패시터');ctx.cap(src,'100nF','벅 입력 고주파 바이패스 (VIN 핀 옆)');ctx.cap(out,'22µF','벅 출력 커패시터');ctx.cap(out,'22µF','벅 출력 커패시터');
      ctx.part('R',fb[0],'0603',{1:out,2:'BUCK_FB'},{desc:`피드백 상단 (VOUT = 0.8 V × (1 + R상/R하) ≈ ${vout} V)`});ctx.part('R',fb[1],'0603',{1:'BUCK_FB',2:'GND'},{desc:'피드백 하단'});
      ctx.part('C','10nF','0603',{1:'BUCK_SS',2:'GND'},{desc:'소프트 스타트'});
      ctx.part('R','76.8kΩ','0603',{1:'BUCK_COMP',2:'BUCK_RC'},{desc:'보상 Rc'});ctx.part('C','3.3nF','0603',{1:'BUCK_RC',2:'GND'},{desc:'보상 Cc'});ctx.part('C','47pF','0603',{1:'BUCK_COMP',2:'GND'},{desc:'보상 고주파 극점'});
      ctx.part('R','100kΩ','0603',{1:src,2:'BUCK_EN'},{desc:'EN 풀업 (입력 인가 시 동작)'});}},
  mcu:{label:'MCU',desc:'MCU + 전원 핀 디커플링 + 리셋 + 부트 + 디버그 헤더',params:{part:{def:'STM32F042K6U6',desc:'STM32F042K6U6 · TC364DP'}},
    build(ctx,p){const k=mcuKey(p.part)||'STM32F042K6U6';const M=MCUS[k];ctx.setMcu(k);
      const pins={};Object.entries(M.rails).forEach(([r,ns])=>{ns.forEach(n=>{pins[n]=r;});ctx.use(r==='VDD'?null:r);});M.gnd.forEach(n=>{pins[n]='GND';});
      ctx.part('U',M.val,M.fp,pins,{mpn:k,desc:M.label,pinNames:M.names(),mcu:true,P:M.P});
      M.caps.forEach(([r,v])=>ctx.cap(r,v,`MCU ${r} 디커플링`));M.extra(ctx);}},
  xtal:{label:'크리스털',desc:'20 MHz 크리스털 + 부하 캡 2개 → MCU OSC 핀',params:{freq:{def:'20MHz',desc:'주파수'},cl:{def:'12pF',desc:'부하 캡 값'}},
    build(ctx,p){ctx.part('Y',p.freq,'XTAL-3225',{1:'XTAL1',2:'GND',3:'XTAL2',4:'GND'},{mpn:'ABM8-20.000MHZ-B2-T',desc:`${p.freq} 크리스털`});
      ctx.part('C',p.cl,'0603',{1:'XTAL1',2:'GND'},{desc:'크리스털 부하 캡'});ctx.part('C',p.cl,'0603',{1:'XTAL2',2:'GND'},{desc:'크리스털 부하 캡'});ctx.xtal('XTAL1','XTAL2');}},
  can:{label:'CAN 통신',desc:'TLE9251V CAN FD 트랜시버 (VCC 5 V · VIO 3.3 V) · 스플릿 종단 · PESD1CAN TVS · 커넥터',params:{term:{def:1,desc:'스플릿 종단 60 Ω×2 + 4.7 nF (1/0)'},tvs:{def:1,desc:'PESD1CAN (1/0)'}},
    build(ctx,p){ctx.use('+5V');ctx.use('+3V3');
      ctx.part('U','TLE9251V','SOIC-8',{1:'CAN_TX',2:'GND',3:'+5V',4:'CAN_RX',5:'+3V3',6:'CANL',7:'CANH',8:'CAN_STB'},{mpn:'TLE9251VSJ',desc:'CAN FD 트랜시버',pinNames:{1:'TxD',2:'GND',3:'VCC',4:'RxD',5:'VIO',6:'CANL',7:'CANH',8:'STB'},P:0.08});
      ctx.cap('+5V','100nF','CAN VCC 디커플링');ctx.cap('+3V3','100nF','CAN VIO 디커플링');
      if(+p.term){ctx.part('R','60.4Ω','0603',{1:'CANH',2:'CAN_SPLIT'},{desc:'스플릿 종단'});ctx.part('R','60.4Ω','0603',{1:'CAN_SPLIT',2:'CANL'},{desc:'스플릿 종단'});ctx.part('C','4.7nF','0603',{1:'CAN_SPLIT',2:'GND'},{desc:'스플릿 종단 공통 모드 캡'});}
      if(+p.tvs)ctx.part('D','PESD1CAN','SOT-23',{1:'CANL',2:'CANH',3:'GND'},{desc:'CAN 버스 ESD/TVS (Nexperia PESD1CAN)',pinNames:{1:'CANL',2:'CANH',3:'GND'}});
      ctx.part('J','CAN','HDR-1x4',{1:'CANH',2:'CANL',3:'GND',4:null},{mpn:'61300411121',desc:'CAN 버스 커넥터',pinNames:{1:'CANH',2:'CANL',3:'GND',4:'NC'}});
      ctx.sig('CAN_TX','can_tx','can');ctx.sig('CAN_RX','can_rx','can');ctx.sig('CAN_STB','gpio_out');}},
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
    params:{i:{def:10,desc:'모터 정격 전류 A (FET 병렬 수·션트·트레이스 폭)'},vm:{def:'auto',desc:'VM 레일 (auto = 입력 레일)'},shunt:{def:1,desc:'전류 검출 (1/0)'}},
    build(ctx,p){const vm=p.vm==='auto'?ctx.highest(8):p.vm;ctx.use(vm);const I=Math.max(1,+p.i||10);const k=ctx.uniq('HB');const N=x=>k==='HB'?'HB_'+x:k+'_'+x;
      const V=ctx.railV?ctx.railV(vm):12;const pwr=motorPower(ctx,I,V);const sn=+p.shunt;
      if(V&&V<10)ctx.warn(`${k}: VM ${V} V — IR2104 VCC는 10 V 이상 필요 (게이트 전원 별도 레일)`);
      const ret=sn?N('SNS'):'GND';
      ['A','B'].forEach(h=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO');
        ctx.part('U','IR2104S','SOIC-8',{1:vm,2:N('IN'+h),3:N('EN'),4:'GND',5:lo,6:ph,7:ho,8:vb},{mpn:'IR2104STRPBF',desc:`하프브리지 게이트 드라이버 (${h} 레그 · 데드타임 520 ns)`,pinNames:{1:'VCC',2:'IN',3:'nSD',4:'COM',5:'LO',6:'VS',7:'HO',8:'VB'},P:0.05});
        ctx.cap(vm,'1µF',`IR2104 VCC 디커플링 (${h})`);
        ctx.part('D','ES1D','SMA',{1:vm,2:vb},{mpn:'ES1D',desc:`부트스트랩 다이오드 (${h})`,pinNames:{1:'A',2:'K'}});
        ctx.part('C','1µF','0805',{1:vb,2:ph},{desc:`부트스트랩 캡 VB–VS (${h})`});
        fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);});
      bulk(ctx,vm,I,'H-브리지');
      if(sn)shuntAmp(ctx,ret,N('ISNS'),I,'H-브리지 공통');
      ctx.part('R','10kΩ','0603',{1:N('EN'),2:'GND'},{desc:'nSD 풀다운 (MCU 리셋 중 브리지 OFF)'});
      ctx.part('J','모터','TERM-2-5.08',{1:N('A'),2:N('B')},{mpn:'1729128',desc:`DC 모터 단자 (5.08 mm · ${I} A)`,pinNames:{1:'M+',2:'M−'}});
      ctx.curr(N('A'),I);ctx.curr(N('B'),I);ctx.curr(vm,I);if(sn)ctx.curr(ret,I);
      ctx.sig(N('INA'),'pwm');ctx.sig(N('INB'),'pwm');ctx.sig(N('EN'),'gpio_out');}},
  gdrv3:{label:'3상 인버터 (게이트 드라이버 + 외부 N-MOSFET 6개)',desc:'하프브리지 게이트 드라이버 ×3 (IR2104S) + N-MOSFET ×6 (DPAK, 병렬) + 게이트 저항·풀다운 + 레그별 로우사이드 션트 ×3 + 전류 앰프 ×3 → ADC + VM 벌크/세라믹 + 상 단자(5.08 mm) + 홀 입력(선택)',
    params:{i:{def:20,desc:'상전류 A (FET 병렬 수·션트·트레이스 폭)'},hall:{def:1,desc:'홀 센서 입력 (1/0)'},hallv:{def:5,desc:'홀 센서 공급 전압 V (5 · 9 · 12 — 그 레일이 있어야 함)'},fet:{def:'single',desc:'MOSFET 패키지: single (DPAK ×6) · IAUC60N04S6N050H (하프브리지 ×3) · IPG20N04S4L-07 (듀얼 ×3)'},vm:{def:'auto',desc:'VM 레일 (auto = 입력 레일)'}},
    build(ctx,p){const vm=p.vm==='auto'?ctx.highest(8):p.vm;ctx.use(vm);const I=Math.max(1,+p.i||20);const k=ctx.uniq('PH');const N=x=>k==='PH'?'PH_'+x:k+'_'+x;
      const V=ctx.railV?ctx.railV(vm):12;const pwr=motorPower(ctx,I,V,p.fet&&p.fet!=='single'?p.fet:null);
      if(V&&V<10)ctx.warn(`${k}: VM ${V} V — IR2104 VCC는 10 V 이상 필요 (게이트 전원 별도 레일)`);
      ['U','V','W'].forEach(h=>{const ph=N(h),vb=N(h+'_VB'),ho=N(h+'_HO'),lo=N(h+'_LO'),ret=N(h+'_SNS');
        ctx.part('U','IR2104S','SOIC-8',{1:vm,2:N('IN_'+h),3:N('EN'),4:'GND',5:lo,6:ph,7:ho,8:vb},{mpn:'IR2104STRPBF',desc:`하프브리지 게이트 드라이버 (${h}상)`,pinNames:{1:'VCC',2:'IN',3:'nSD',4:'COM',5:'LO',6:'VS',7:'HO',8:'VB'},P:0.05});
        ctx.cap(vm,'1µF',`IR2104 VCC 디커플링 (${h})`);
        ctx.part('D','ES1D','SMA',{1:vm,2:vb},{mpn:'ES1D',desc:`부트스트랩 다이오드 (${h})`,pinNames:{1:'A',2:'K'}});
        ctx.part('C','1µF','0805',{1:vb,2:ph},{desc:`부트스트랩 캡 VB–VS (${h})`});
        fets(ctx,pwr,ho,lo,vm,ph,ret,h,N);shuntAmp(ctx,ret,N('ISNS_'+h),I,h+'상');
        ctx.curr(ph,I);ctx.curr(ret,I);ctx.sig(N('IN_'+h),'pwm','pwm3');});
      bulk(ctx,vm,I,'3상 인버터');ctx.curr(vm,I);
      ctx.part('R','10kΩ','0603',{1:N('EN'),2:'GND'},{desc:'nSD 풀다운 (MCU 리셋 중 인버터 OFF)'});ctx.sig(N('EN'),'gpio_out');
      ctx.part('J','모터 상','TERM-3-5.08',{1:N('U'),2:N('V'),3:N('W')},{mpn:'1729131',desc:`3상 모터 단자 (5.08 mm · ${I} A)`,pinNames:{1:'U',2:'V',3:'W'}});
      if(+p.hall){const hv=+p.hallv||5;const hr=railOf(hv);ctx.use(hr);ctx.use('+3V3');const hin=x=>N('HALL_'+x+(hv>5?'_IN':''));ctx.part('J','홀','HDR-1x5',{1:hr,2:hin('A'),3:hin('B'),4:hin('C'),5:'GND'},{mpn:'61300511121',desc:`홀 센서 커넥터 (공급 ${hv} V)`,pinNames:{1:hv+'V',2:'H1',3:'H2',4:'H3',5:'GND'}});
        // open-collector hall outputs pulled up to the MCU rail; with a supply above 5 V a series resistor + clamp keeps a shorted / push-pull sensor off the MCU pin
        ['A','B','C'].forEach(x=>{const raw=N('HALL_'+x+(hv>5?'_IN':''));if(hv>5){ctx.part('R','1kΩ','0603',{1:raw,2:N('HALL_'+x)},{desc:'홀 입력 직렬 저항 (과전압 전류 제한)'});ctx.part('D','BAT54S','SOT-23',{1:'GND',2:'+3V3',3:N('HALL_'+x)},{mpn:'BAT54S',desc:'홀 입력 클램프 (GND·3.3 V)',pinNames:{1:'A1',2:'K2',3:'K1/A2'}});
            ctx.part('C','1nF','0603',{1:raw,2:'GND'},{desc:'홀 커넥터 측 필터'});}
          ctx.part('R','4.7kΩ','0603',{1:'+3V3',2:N('HALL_'+x)},{desc:'홀 출력 풀업'});ctx.part('C','1nF','0603',{1:N('HALL_'+x),2:'GND'},{desc:'홀 입력 필터'});ctx.sig(N('HALL_'+x),'irq_in');});}}},
  dcmotor:{label:'DC 모터 (로우사이드 FET)',desc:'AO3400A + 게이트 저항·풀다운 + 플라이백 SS14 + 0.1 Ω 션트 + RC 필터 → ADC',params:{shunt:{def:1,desc:'전류 검출 (1/0)'}},
    build(ctx,p){const vm=ctx.highest(3);ctx.use(vm);const s=+p.shunt;
      ctx.part('J','모터','HDR-1x2',{1:vm,2:'MOT_N'},{mpn:'61300211121',desc:'DC 모터 커넥터',pinNames:{1:'+',2:'−'}});
      ctx.part('Q','AO3400A','SOT-23',{1:'GATE',2:s?'I_SENSE':'GND',3:'MOT_N'},{mpn:'AO3400A',desc:'N채널 MOSFET 로우사이드 스위치',pinNames:{1:'G',2:'S',3:'D'},P:0.15});
      ctx.part('R','100Ω','0603',{1:'MOT_PWM',2:'GATE'},{desc:'게이트 직렬 저항'});ctx.part('R','10kΩ','0603',{1:'GND',2:'GATE'},{desc:'게이트 풀다운'});
      ctx.part('D','SS14','SMA',{1:'MOT_N',2:vm},{mpn:'SS14',desc:'플라이백 쇼트키',pinNames:{1:'A',2:'K'}});ctx.cap(vm,'100nF','모터 전원 바이패스');
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
    build(ctx,p){const rail=p.rail||'+3V3';ctx.use(rail);const rst=ctx.mcu()==='tc364'?'PORST':'NRST';
      ctx.part('U','TPS3823-33','SOT-23-5',{1:rst,2:rail,3:'GND',4:rail,5:+p.wdt?'WDI':''},{mpn:'TPS3823DBVR',desc:'전원 감시 리셋 + 윈도우 워치독 (1.6 s)',pinNames:{1:'RESET',2:'VDD',3:'GND',4:'MR',5:'WDI'}});
      ctx.cap(rail,'100nF','감시 IC 디커플링');if(+p.wdt)ctx.sig('WDI','gpio_out');}},
  hs_switch:{label:'하이사이드 전원 스위치 (세이프 스테이트)',desc:'P-MOSFET 하이사이드 + N-MOSFET 레벨시프트 · MCU SAFE_EN이 High일 때만 부하 전원 공급 (이중 차단)',params:{rail:{def:'auto',desc:'끊을 전원 레일 (auto = 입력)'}},
    build(ctx,p){const r=p.rail==='auto'?ctx.highest(0):p.rail;ctx.use(r);const out=r+'_SW';ctx.provide(out,ctx.railV?ctx.railV(r):12,'스위치');
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
  ntc:{label:'온도 센서 (NTC)',desc:'NTC 10 kΩ B3435 + 10 kΩ 풀업 (3.3 V) + 100 nF → ADC — 보드 온도 (FET·레귤레이터 근처)',params:{n:{def:1,desc:'센서 수'}},
    build(ctx,p){const n=Math.max(1,Math.min(4,+p.n||1));ctx.use('+3V3');for(let i=0;i<n;i++){const t=ctx.uniq('TEMP');
      ctx.part('R','10kΩ','0603',{1:'+3V3',2:t},{desc:'NTC 풀업 (1 %)'});ctx.part('RT','NTC 10k','0603',{1:t,2:'GND'},{mpn:'NCP18XH103F03RB',desc:'NTC 서미스터 10 kΩ B=3380 (보드 온도)',pinNames:{1:'1',2:'2'}});
      ctx.part('C','100nF','0603',{1:t,2:'GND'},{desc:'ADC 필터'});ctx.sig(t,'adc');}}},
  vmon:{label:'전압 감시',desc:'100 kΩ/22 kΩ 분압 + 100 nF → ADC (입력 레일 감시)',params:{rail:{def:'auto',desc:'감시할 레일 (auto = 입력)'}},
    build(ctx,p){const r=p.rail==='auto'?ctx.highest(0):p.rail;ctx.use(r);ctx.part('R','100kΩ','0603',{1:r,2:'VMON'},{desc:'분압 상단'});ctx.part('R','22kΩ','0603',{1:'VMON',2:'GND'},{desc:'분압 하단'});ctx.part('C','100nF','0603',{1:'VMON',2:'GND'},{desc:'ADC 필터'});ctx.sig('VMON','adc');}}};
const BLOCK_ALIAS={dcdc:'buck',smps:'buck',switching:'buck',power:'pwr_in',pwr:'pwr_in',dc:'pwr_in',input:'pwr_in',usb:'usb_in',usbc:'usb_in',regulator:'ldo',reg:'ldo',crystal:'xtal',osc:'xtal',motor:'dcmotor',dc_motor:'dcmotor',
  bldc3:'bldc',led:'led',leds:'led',btn:'button',sw:'button',spi:'flash',memory:'flash',serial:'uart',debug:'uart',monitor:'vmon',adc:'vmon',temp:'ntc',thermistor:'ntc',temperature:'ntc',wdt:'supervisor',watchdog:'supervisor',reset:'supervisor',sbc:'supervisor',cutoff:'hs_switch',hsswitch:'hs_switch',hs:'hs_switch'};
const blockKey=s=>{const k=String(s||'').toLowerCase();return LIB[k]?k:BLOCK_ALIAS[k]||null;};

/* ---------- plan ---------- */
function newPlan(name){return{name:name||'새 프로젝트',req:'',blocks:[],board:null,seq:0,strategy:'balanced'};}
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
function motorPower(ctx,I,V,fet){const F=fet&&FET2[fet];
  if(F&&F.v>=(V||12)*2.5){const par=Math.max(1,Math.ceil(I/F.i));if(I>F.i*0.66*par&&ctx.warn)ctx.warn(`${fet}: 상전류 ${I} A — 정격 ${F.i} A(케이스 25~100 °C)의 66 % 초과, 방열(써멀 비아 · 하우징 접촉) 확인`);const Pq=+(((I/par)**2)*F.rds*0.6+0.02).toFixed(2);
    if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){['2512','SOT-23-6','HDR-1x5'].forEach(k=>FPGEN.ensure(PCB,k,k==='SOT-23-6'?6:k==='HDR-1x5'?5:0));termFp(2);termFp(3);}
    if(par>2&&ctx.warn)ctx.warn(`${fet}: 상전류 ${I} A에 상마다 ${par}개 병렬 — 더 큰 정격(하프브리지 IAUC60N04S6N050H 또는 단일 FET) 권장`);
    return{f:{mpn:fet,label:F.label,rds:F.rds},f2:Object.assign({mpn:fet},F),par,Pq,I};}
  if(F&&ctx.warn)ctx.warn(`${fet}: ${F.v} V 정격 — VM ${V} V에 내압 여유 부족, 단일 FET로 대체`);
  const f=FETS.find(x=>x.v>=(V||12)*2.5)||FETS[FETS.length-1];const par=I<=25?1:I<=60?2:I<=100?3:4;
  if(typeof FPGEN!=='undefined'&&typeof PCB!=='undefined'){['TO-252','2512','SOT-23-6','HDR-1x5'].forEach(k=>FPGEN.ensure(PCB,k,k==='SOT-23-6'?6:k==='HDR-1x5'?5:0));termFp(2);termFp(3);}
  const Pq=+(((I/par)**2)*f.rds*0.6+0.02).toFixed(2);return{f,par,Pq,I};}
function termFp(n){if(typeof PCB==='undefined'||!PCB.FP)return;const k=`TERM-${n}-5.08`;if(PCB.FP[k])return;const p=5.08,y0=(n-1)/2*p;
  const f={kind:'hdr',body:[7.6,n*p+0.5,10],pads:Array.from({length:n},(_,i)=>({n:''+(i+1),x:0,y:+(y0-i*p).toFixed(3),w:3,h:3,round:true,drill:1.4})),gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP[k]=f;}
/* two-FET packages in Infineon PG-TDSON-8 (5 × 6 mm), pinout from the datasheets (page 1 pin diagram):
   IAUC60N04S6N050H half-bridge — 1 G(HS) · 2,3 Phase · 4 G(LS) · 5,6 ground (LS source) · 7,8 battery (HS drain); pads 9 = battery, 10 = phase
   IPG20N04S4L-07 dual (independent) — 1 S1 · 2 G1 · 3 S2 · 4 G2 · 5,6 D2 · 7,8 D1; pads 9 = D1, 10 = D2 → FET1 high side, FET2 low side */
const FET2={
  'IAUC60N04S6N050H':{kind:'hb',v:40,rds:0.005,i:60,label:'하프브리지 40 V 60 A 5.0 mΩ OptiMOS 6 (AEC-Q101)',pin:(hg,lg,vm,ph,ret)=>({1:hg,2:ph,3:ph,4:lg,5:ret,6:ret,7:vm,8:vm,9:vm,10:ph}),names:{1:'G_HS',2:'PH',3:'PH',4:'G_LS',5:'GND',6:'GND',7:'BAT',8:'BAT',9:'BAT',10:'PH'}},
  'IPG20N04S4L-07':{kind:'dual',v:40,rds:0.0072,i:20,label:'듀얼 40 V 20 A 7.2 mΩ OptiMOS-T2 로직 레벨 (AEC-Q101)',pin:(hg,lg,vm,ph,ret)=>({1:ph,2:hg,3:ret,4:lg,5:ph,6:ph,7:vm,8:vm,9:vm,10:ph}),names:{1:'S1',2:'G1',3:'S2',4:'G2',5:'D2',6:'D2',7:'D1',8:'D1',9:'D1',10:'D2'}}};
function fetPkg(){if(typeof PCB==='undefined'||!PCB.FP||PCB.FP['TDSON-8-2FET'])return;
  // pins 1–4 left column (top → bottom), 5–8 right column (bottom → top); exposed pad 9 on the 1/2 · 7/8 half, 10 on the 3/4 · 5/6 half
  const p=[];for(let i=0;i<4;i++)p.push({n:''+(1+i),x:-2.95,y:+(1.905-1.27*i).toFixed(3),w:1.1,h:0.6});for(let i=0;i<4;i++)p.push({n:''+(5+i),x:2.95,y:+(-1.905+1.27*i).toFixed(3),w:1.1,h:0.6});
  p.push({n:'9',x:0,y:1.2,w:3.6,h:1.9});p.push({n:'10',x:0,y:-1.2,w:3.6,h:1.9});
  const f={kind:'ic',stand:0,body:[5.15,6.1,1.0],pads:p,dot:[-2.95,2.75],gen:true};if(typeof FPGEN!=='undefined')FPGEN.lbb(f);PCB.FP['TDSON-8-2FET']=f;}
function fets(ctx,pw,ho,lo,vm,ph,ret,h,N){if(pw.f2){fetPkg();const F=pw.f2;
    for(let j=0;j<pw.par;j++){const t=pw.par>1?'_'+(j+1):'';const hg=N(h+'_HG'+t),lg=N(h+'_LG'+t);
      ctx.part('R','10Ω','0603',{1:ho,2:hg},{desc:`하이사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:hg,2:ph},{desc:'하이사이드 G-S 풀다운'});
      ctx.part('R','10Ω','0603',{1:lo,2:lg},{desc:`로우사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:lg,2:ret},{desc:'로우사이드 G-S 풀다운'});
      ctx.part('Q',F.mpn,'TDSON-8-2FET',F.pin(hg,lg,vm,ph,ret),{mpn:F.mpn,desc:`${h}상 ${F.kind==='hb'?'하프브리지':'듀얼'} MOSFET (상·하 FET 2개) ${F.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:F.names,P:pw.Pq*2});}
    return;}
  for(let j=0;j<pw.par;j++){const t=pw.par>1?'_'+(j+1):'';const hg=N(h+'_HG'+t),lg=N(h+'_LG'+t);
    ctx.part('R','10Ω','0603',{1:ho,2:hg},{desc:`하이사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:hg,2:ph},{desc:'하이사이드 G-S 풀다운'});
    ctx.part('Q',pw.f.mpn,'TO-252',{1:hg,2:vm,3:ph},{mpn:pw.f.mpn,desc:`하이사이드 N-MOSFET ${pw.f.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:{1:'G',2:'D',3:'S'},P:pw.Pq});
    ctx.part('R','10Ω','0603',{1:lo,2:lg},{desc:`로우사이드 게이트 저항 (${h}${t})`});ctx.part('R','10kΩ','0603',{1:lg,2:ret},{desc:'로우사이드 G-S 풀다운'});
    ctx.part('Q',pw.f.mpn,'TO-252',{1:lg,2:ph,3:ret},{mpn:pw.f.mpn,desc:`로우사이드 N-MOSFET ${pw.f.label}${pw.par>1?' · 병렬 '+pw.par:''}`,pinNames:{1:'G',2:'D',3:'S'},P:pw.Pq});}}
const SHUNTS=[0.01,0.005,0.002,0.001,0.0005,0.00025];
function shuntAmp(ctx,net,out,I,what){const R=SHUNTS.find(r=>r*I<=0.045)||SHUNTS[SHUNTS.length-1];const P=+(I*I*R).toFixed(2);const lab=R>=0.001?(R*1000)+'mΩ':(R*1e6)+'µΩ';
  ctx.part('R',lab,'2512',{1:net,2:'GND'},{mpn:'',desc:`${what} 전류 션트 ${lab} · ${I} A에서 ${(R*I*1000).toFixed(0)} mV · ${P} W${P>2?' (2 W 초과 — 병렬 또는 3 W 2512)':''}`,P});
  const vs=ctx.railNear?ctx.railNear(3.3):'+3V3';ctx.use(vs);const amp=out+'_AMP';
  ctx.part('U','INA181A2-Q1','SOT-23-6',{1:amp,2:'GND',3:net,4:'GND',5:'GND',6:vs},{mpn:'INA181A2QDBVRQ1',desc:`${what} 전류 앰프 ×50 (${(R*I*50).toFixed(2)} V @ ${I} A)`,pinNames:{1:'OUT',2:'GND',3:'IN+',4:'IN−',5:'REF',6:'VS'},P:0.002});
  ctx.cap(vs,'100nF','전류 앰프 디커플링');ctx.part('R','1kΩ','0603',{1:amp,2:out},{desc:'ADC RC 필터'});ctx.part('C','1nF','0603',{1:out,2:'GND'},{desc:'ADC RC 필터'});ctx.sig(out,'adc');}
function bulk(ctx,vm,I,what){const n=Math.max(1,Math.min(4,Math.ceil(I/20)));for(let i=0;i<n;i++)ctx.part('CP','470µF','CP-SMD-10x10',{1:vm,2:'GND'},{mpn:'EEE-FK1V471P',desc:`${what} VM 벌크 (35 V 470 µF · 리플 전류)`});
  ctx.part('C','2.2µF','1210',{1:vm,2:'GND'},{desc:`${what} VM 세라믹 (50 V)`});ctx.part('C','2.2µF','1210',{1:vm,2:'GND'},{desc:`${what} VM 세라믹 (50 V)`});ctx.cap(vm,'100nF',`${what} VM 고주파 바이패스`);}
/* ---------- build: plan → parts, nets, MCU pin assignment, board spec ---------- */
function build(plan){const asil=plan.asil&&String(plan.asil).toUpperCase()!=='QM'?String(plan.asil).toUpperCase():null;
  const parts=[],warn=[],rails={},used=new Set(),sigs=[],fixedPins={},xt=[],curr={};let mcu=null;const cnt={};const uq={};
  const has=t=>plan.blocks.some(b=>b.type===t);
  const ctx={plan,
    part(prefix,val,fp,pins,o){o=o||{};cnt[prefix]=(cnt[prefix]||0)+1;const ref=prefix+cnt[prefix];const c={ref,val,fp,pins:Object.fromEntries(Object.entries(pins).filter(([,v])=>v)),mpn:o.mpn||(prefix==='C'?capMpn[val]:prefix==='R'?rMpn(val):'')||'',desc:o.desc||'',pinNames:o.pinNames||null,block:ctx._b,P:o.P||0,ldo:o.ldo,mcu:!!o.mcu};parts.push(c);return c;},
    cap(rail,val,desc){if(!rail)return;used.add(rail);return ctx.part('C',val,capFp(val),{1:rail,2:'GND'},{desc,mpn:capMpn[val]});},
    provide(rail,v,by){rails[rail]={v,by,block:ctx._b};},railV(r){return rails[r]?rails[r].v:(typeof SIM!=='undefined'&&SIM.nominalV?SIM.nominalV(r):0);},use(r){if(r)used.add(r);},has,
    railNear(v){const r=Object.entries(rails).filter(([,x])=>x.v>0).sort((a,b)=>Math.abs(a[1].v-v)-Math.abs(b[1].v-v))[0];return r?r[0]:ctx.highest(0);},
    highest(min){const r=Object.entries(rails).filter(([,x])=>x.v>=min).sort((a,b)=>b[1].v-a[1].v)[0];if(!r){warn.push(`${min} V 이상 레일이 없음 — 전원 블록을 먼저 넣으세요`);return'+12V';}return r[0];},
    setMcu(k){mcu=k;},mcu(){return mcu;},warn(t){warn.push(t);},mcuPin(n,net){fixedPins[n]=net;},need(t){if(!has(t))warn.push(`${t} 블록이 필요합니다 (예: add ${t})`);},
    sig(net,role,group){sigs.push({net,role,group:group||null,block:ctx._b});},xtal(a,b){xt.push(a,b);},curr(net,I){if(net&&I>0)curr[net]=Math.max(curr[net]||0,+I);},
    uniq(base){uq[base]=(uq[base]||0)+1;return uq[base]===1&&base!=='LED'&&base!=='BTN'?base:base+uq[base];}};
  // power first (rails), then MCU, then the rest
  const order=['pwr_in','usb_in','buck','ldo','mcu','xtal'];const bl=plan.blocks.slice().sort((a,b)=>{const i=order.indexOf(a.type),j=order.indexOf(b.type);return(i<0?9:i)-(j<0?9:j);});
  bl.forEach(b=>{ctx._b=b.id;try{LIB[b.type].build(ctx,b.params);}catch(e){warn.push(`${b.id}: ${e.message}`);}});
  // rails used but never produced
  used.forEach(r=>{if(r!=='GND'&&r!=='VDD'&&!rails[r])warn.push(`${r} 레일을 만드는 블록이 없음 (예: add ldo --vout ${r==='+5V'?5:3.3})`);});
  // LDO checks: headroom and dissipation from the loads on its rail
  const load={};parts.forEach(c=>{const blkI={mcu:0.06,can:0.07,flash:0.02,led:0.01,uart:0,i2c:0.002,button:0,vmon:0,bldc:0.01,xtal:0}[(plan.blocks.find(b=>b.id===c.block)||{}).type];void blkI;});
  plan.blocks.forEach(b=>{const I={mcu:b.params.part&&mcuKey(b.params.part)==='TC364DP-64F300F'?0.35:0.03,can:0.06,flash:0.02,led:0.006*(+b.params.n||1),bldc:0.02,i2c:0.002}[b.type]||0;const r=b.type==='can'?'+5V':'+3V3';if(I)load[r]=(load[r]||0)+I;});
  parts.filter(c=>c.buck).forEach(c=>{const{src,out,vout}=c.buck;let I=load[out]||0;parts.filter(d=>(d.ldo||d.buck)&&(d.ldo||d.buck).src===out&&d!==c).forEach(d=>{I+=load[(d.ldo||d.buck).out]||0;});
    const P=vout*I*(1/0.88-1);c.P=Math.round(Math.max(0.05,P)*100)/100;const vi=rails[src]?rails[src].v:null;c.desc+=` · 부하 약 ${(I*1000).toFixed(0)} mA → 손실 약 ${c.P} W (효율 88% 가정)`;
    if(vi!=null&&(vi<vout+1.5||vi>28))warn.push(`${c.ref}: 입력 ${vi} V가 TPS54331 범위(${vout+1.5}–28 V) 밖`);});
  parts.filter(c=>c.ldo).forEach(c=>{const{src,out,vout}=c.ldo;const vi=rails[src]?rails[src].v:null;let I=load[out]||0;
    // a 5 V LDO also feeds the 3.3 V LDO behind it
    parts.filter(d=>(d.ldo||d.buck)&&(d.ldo||d.buck).src===out&&d!==c).forEach(d=>{I+=load[(d.ldo||d.buck).out]||0;});
    if(vi!=null&&vi<vout+1.1)warn.push(`${c.ref}: 입력 ${vi} V가 ${vout} V + 드롭아웃 1.1 V보다 낮음`);
    if(vi!=null){const P=(vi-vout)*I;c.P=Math.round(P*100)/100;c.desc+=` · 부하 약 ${(I*1000).toFixed(0)} mA → 손실 ${P.toFixed(2)} W`;if(P>0.8)warn.push(`${c.ref}: LDO 손실 ${P.toFixed(2)} W — 방열 동박을 넓히거나 DC-DC로 바꾸기 권장`);}});
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
    const prio=['can','spi','uart','i2c','pwm3'];
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
  // board size from the part area
  let area=0;parts.forEach(c=>{const f=PCB.FP[c.fp];const b=f?f.lbb:[-1,-1,1,1];area+=(b[2]-b[0]+1.6)*(b[3]-b[1]+1.6);});
  let W,H;if(plan.board){W=plan.board.w;H=plan.board.h;}else{const A=Math.max(1200,area*4.2);W=Math.ceil(Math.sqrt(A*1.6)/5)*5;H=Math.ceil(A/W/5)*5;}
  // functional-safety part policy: an ASIL plan swaps commercial parts for automotive drop-ins (same package & pinout)
  if(asil&&typeof PARTLIB!=='undefined'){let n=0;parts.forEach(c=>{const alt=PARTLIB.autoAlt(c.mpn||c.val);if(alt&&alt.mpn&&alt.dropIn){const rec=alt.rec;if(/^U|^Q|^D/.test(c.ref)&&rec&&rec.mpn!==c.val)c.val=rec.mpn;c.mpn=alt.mpn;c.desc=(c.desc||'')+` (ASIL ${asil}: ${rec&&rec.grade?rec.grade:'AEC'} 대체)`;n++;}else if(alt&&alt.hint&&/^U/.test(c.ref))warn.push(`${c.ref} ${c.val}: ${alt.hint}`);});if(n)warn.push(`ASIL ${asil} 부품 정책: 상용 부품 ${n}개를 차량용(AEC) 핀 호환 부품으로 바꿨습니다 (safety parts 로 확인)`);}
  const spec={_source:'신규 설계',_demo:null,board:{name:plan.name,width:W,height:H,thickness:1.6,corner:2,holes:W>=35&&H>=30?[[3.5,3.5,3.2],[W-3.5,3.5,3.2],[3.5,H-3.5,3.2],[W-3.5,H-3.5,3.2]]:[]},
    components:parts.map((c,i)=>({ref:c.ref,value:c.val,footprint:c.fp,side:'top',x:6+(i%12)*6,y:6+Math.floor(i/12)*6,rotation:0,mpn:c.mpn,description:c.desc,pins:c.pins,pinNames:c.pinNames||undefined}))};
  return{spec,parts,warn,rails,pinmap,assigned,sigs,mcu,area,W,H,curr,power:parts.filter(c=>c.P).map(c=>({ref:c.ref,P:c.P}))};
}
// board from a plan: place from scratch with the plan's strategy (routing is left to the caller)
function toBoard(plan,opts){opts=opts||{};const r=build(plan);const B=PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(r.spec))));B.newPlan=JSON.parse(JSON.stringify(plan));
  if(r.curr&&Object.keys(r.curr).length)B.netCurrent=Object.assign({},r.curr,B.netCurrent||{});
  if(typeof AUTOPLACE!=='undefined'&&opts.place!==false){PCBEDIT.prepare(B);AUTOPLACE.ensurePour(B);const power={};r.power.forEach(x=>{power[x.ref]=x.P;});
    r.place=AUTOPLACE.place(B,{strategy:opts.strategy||plan.strategy||'balanced',scratch:true,seed:opts.seed||1,power});}
  return{B,r};}
function summary(plan){const r=build(plan);const L=[];
  L.push(`프로젝트 ${plan.name} · 블록 ${plan.blocks.length}개 · 부품 ${r.parts.length}개 · 보드 ${r.W} × ${r.H} mm${plan.board?'':' (자동)'} · 배치 전략 ${plan.strategy}`);
  if(plan.req)L.push(`요구사항: ${plan.req}`);
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
return{LIB,MCUS,partLookup:(mpn)=>{if(typeof PARTLIB==='undefined')return null;const lib=PARTLIB.merge([PARTLIB.fromBuiltin(typeof PARTS!=='undefined'?PARTS:null),typeof KPINS!=='undefined'?PARTLIB.fromKpins(KPINS):[]]);const r=PARTLIB.find(lib,mpn);if(r&&!(r.pins&&r.pins.length)){const kp=PARTLIB.pinoutFor(r.mpn,r.val,r.pkg);if(kp)r.pins=kp;}return r;},mcuKey,blockKey,newPlan,addBlock,setParam,removeBlock,planFrom,costModel,PCB_COST,GRADE_K,ldoToBuck,guessName,build,toBoard,summary,railOf,bom,planMetrics,variants,recommend,variantsText};
})();
if(typeof module!=='undefined')module.exports=NEWPROJ;
