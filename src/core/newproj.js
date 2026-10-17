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
      ctx.part('J',`${vin}V 입력`,'HDR-1x2',{1:'VIN_RAW',2:'GND'},{mpn:'61300211121',desc:`${vin} V 전원 입력`,pinNames:{1:'+',2:'GND'}});
      ctx.part('D','SS14','SMA',{1:'VIN_RAW',2:rail},{mpn:'SS14',desc:'역전압 보호 쇼트키 (직렬)',pinNames:{1:'A',2:'K'}});
      if(+p.tvs)ctx.part('D',tvsFor(vin),'SMA',{1:'GND',2:rail},{desc:`입력 서지 TVS (${tvsFor(vin)})`,pinNames:{1:'A',2:'K'}});
      const bulk=p.bulk==='auto'?(ctx.has('bldc')||ctx.has('dcmotor')?'470µF':vin>6?'22µF':'10µF'):p.bulk;ctx.cap(rail,bulk,'입력 벌크 커패시터');ctx.cap(rail,'100nF','입력 고주파 바이패스');}},
  usb_in:{label:'USB-C 전원·데이터',desc:'USB-C 리셉터클 · CC 5.1 kΩ 풀다운 · VBUS 5 V · D+/D− → MCU USB',params:{data:{def:1,desc:'USB 데이터 연결 (1/0)'}},
    build(ctx,p){ctx.provide('VBUS',5,'USB');const d=+p.data;
      ctx.part('J','USB-C','USB-C',{1:'CC1',2:'VBUS',3:'GND',4:d?'USB_DM':null,5:d?'USB_DP':null,6:'GND',S1:'GND',S2:'GND'},{mpn:'USB4105-GF-A',desc:'USB-C 리셉터클',pinNames:{1:'CC1',2:'VBUS',3:'GND',4:'D−',5:'D+',6:'GND',S1:'SHIELD',S2:'SHIELD'}});
      ctx.part('R','5.1kΩ','0603',{1:'CC1',2:'GND'},{desc:'CC 풀다운 (싱크 5 V)'});ctx.cap('VBUS','10µF','VBUS 벌크');
      if(d){ctx.sig('USB_DM','usb_dm','usb');ctx.sig('USB_DP','usb_dp','usb');}}},
  ldo:{label:'LDO 레귤레이터',desc:'AMS1117 (SOT-223) · 입력/출력 10 µF',params:{vin:{def:'auto',desc:'입력 레일 (auto = 가장 높은 레일)'},vout:{def:3.3,desc:'출력 전압 (3.3 · 5)'},iout:{def:'auto',desc:'예상 부하 전류 [A] (auto = 블록 합)'}},
    build(ctx,p){const vout=+p.vout;const out=railOf(vout);const mpn=vout===5?'AMS1117-5.0':'AMS1117-3.3';
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
  vmon:{label:'전압 감시',desc:'100 kΩ/22 kΩ 분압 + 100 nF → ADC (입력 레일 감시)',params:{rail:{def:'auto',desc:'감시할 레일 (auto = 입력)'}},
    build(ctx,p){const r=p.rail==='auto'?ctx.highest(0):p.rail;ctx.use(r);ctx.part('R','100kΩ','0603',{1:r,2:'VMON'},{desc:'분압 상단'});ctx.part('R','22kΩ','0603',{1:'VMON',2:'GND'},{desc:'분압 하단'});ctx.part('C','100nF','0603',{1:'VMON',2:'GND'},{desc:'ADC 필터'});ctx.sig('VMON','adc');}}};
const BLOCK_ALIAS={dcdc:'buck',smps:'buck',switching:'buck',power:'pwr_in',pwr:'pwr_in',dc:'pwr_in',input:'pwr_in',usb:'usb_in',usbc:'usb_in',regulator:'ldo',reg:'ldo',crystal:'xtal',osc:'xtal',motor:'dcmotor',dc_motor:'dcmotor',
  bldc3:'bldc',led:'led',leds:'led',btn:'button',sw:'button',spi:'flash',memory:'flash',serial:'uart',debug:'uart',monitor:'vmon',adc:'vmon'};
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
  if(can)addBlock(plan,'can',{});if(bldc)addBlock(plan,'bldc',{hall:/센서리스|sensorless/.test(lo)?0:1});if(dc)addBlock(plan,'dcmotor',{shunt:/전류|current|보호/.test(lo)||true?1:0});
  if(/플래시|flash|메모리|로그|저장/.test(lo))addBlock(plan,'flash',{});
  if(/uart|시리얼|serial|디버그\s*포트|콘솔/.test(lo))addBlock(plan,'uart',{});
  if(/i2c|i²c|센서\s*확장/.test(lo))addBlock(plan,'i2c',{});
  if(/전압\s*(감시|모니터|측정)|배터리|vbat|vmon/.test(lo)||bldc)addBlock(plan,'vmon',{});
  const nl=s.match(/LED\s*(\d+)\s*개|(\d+)\s*개의?\s*LED/i);const nled=nl?+(nl[1]||nl[2]):/led|표시등|상태/i.test(s)?1:0;if(nled)addBlock(plan,'led',{n:nled});
  const nb=s.match(/버튼\s*(\d+)\s*개|(\d+)\s*개의?\s*버튼/);const nbt=nb?+(nb[1]||nb[2]):/버튼|스위치|button/.test(lo)?1:0;if(nbt)addBlock(plan,'button',{n:nbt});
  // a first-stage LDO that would burn more than ~0.7 W becomes a buck converter
  const r0=build(plan);r0.parts.filter(c=>c.ldo&&c.P>0.7).forEach(c=>{const b=plan.blocks.find(x=>x.id===c.block);if(!b||b.type!=='ldo')return;
    if(/ldo|선형/.test(lo)){log.push(`${c.ref} LDO 손실 ${c.P} W — 요구사항에 LDO가 명시돼 유지`);return;}
    b.type='buck';b.id=b.id.replace(/^ldo/,'buck');b.params={vin:b.params.vin,vout:b.params.vout};log.push(`${b.params.vout} V 1단을 LDO(손실 ${c.P} W) 대신 벅 컨버터로`);});
  if(bldc)plan.strategy='thermal';else if(can||dc)plan.strategy='noise';
  return{plan,log};
}
function guessName(s){const lo=s.toLowerCase();const bl=/bldc|3상/.test(lo);const k=[bl?'BLDC':'',/\bcan\b/.test(lo)?'CAN':'',!bl&&/(^|[^l])dc\s*모터|팬|fan/.test(lo)?'DC-MOTOR':'',/usb/.test(lo)?'USB':''].filter(Boolean);return(k.join('-')||'NEW')+' BOARD v0.1';}

/* ---------- build: plan → parts, nets, MCU pin assignment, board spec ---------- */
function build(plan){
  const parts=[],warn=[],rails={},used=new Set(),sigs=[],fixedPins={},xt=[];let mcu=null;const cnt={};const uq={};
  const has=t=>plan.blocks.some(b=>b.type===t);
  const ctx={
    part(prefix,val,fp,pins,o){o=o||{};cnt[prefix]=(cnt[prefix]||0)+1;const ref=prefix+cnt[prefix];const c={ref,val,fp,pins:Object.fromEntries(Object.entries(pins).filter(([,v])=>v)),mpn:o.mpn||(prefix==='C'?capMpn[val]:prefix==='R'?rMpn(val):'')||'',desc:o.desc||'',pinNames:o.pinNames||null,block:ctx._b,P:o.P||0,ldo:o.ldo,mcu:!!o.mcu};parts.push(c);return c;},
    cap(rail,val,desc){if(!rail)return;used.add(rail);return ctx.part('C',val,capFp(val),{1:rail,2:'GND'},{desc,mpn:capMpn[val]});},
    provide(rail,v,by){rails[rail]={v,by};},use(r){if(r)used.add(r);},has,
    highest(min){const r=Object.entries(rails).filter(([,x])=>x.v>=min).sort((a,b)=>b[1].v-a[1].v)[0];if(!r){warn.push(`${min} V 이상 레일이 없음 — 전원 블록을 먼저 넣으세요`);return'+12V';}return r[0];},
    setMcu(k){mcu=k;},mcuPin(n,net){fixedPins[n]=net;},need(t){if(!has(t))warn.push(`${t} 블록이 필요합니다 (예: add ${t})`);},
    sig(net,role,group){sigs.push({net,role,group:group||null,block:ctx._b});},xtal(a,b){xt.push(a,b);},
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
  const spec={_source:'신규 설계',_demo:null,board:{name:plan.name,width:W,height:H,thickness:1.6,corner:2,holes:W>=35&&H>=30?[[3.5,3.5,3.2],[W-3.5,3.5,3.2],[3.5,H-3.5,3.2],[W-3.5,H-3.5,3.2]]:[]},
    components:parts.map((c,i)=>({ref:c.ref,value:c.val,footprint:c.fp,side:'top',x:6+(i%12)*6,y:6+Math.floor(i/12)*6,rotation:0,mpn:c.mpn,description:c.desc,pins:c.pins,pinNames:c.pinNames||undefined}))};
  return{spec,parts,warn,rails,pinmap,assigned,mcu,area,W,H,power:parts.filter(c=>c.P).map(c=>({ref:c.ref,P:c.P}))};
}
// board from a plan: place from scratch with the plan's strategy (routing is left to the caller)
function toBoard(plan,opts){opts=opts||{};const r=build(plan);const B=PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(r.spec))));B.newPlan=JSON.parse(JSON.stringify(plan));
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
return{LIB,MCUS,mcuKey,blockKey,newPlan,addBlock,setParam,removeBlock,planFrom,build,toBoard,summary,railOf};
})();
if(typeof module!=='undefined')module.exports=NEWPROJ;
