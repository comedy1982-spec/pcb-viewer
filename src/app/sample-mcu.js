/* Built-in example 2: MCU-controlled DC motor with LEDs. U1 runs editable firmware that is co-simulated with the circuit. */
const MCU_Q32_PINS={1:'VDD',2:'PA0',3:'PA2',4:'PA3',5:'PA4',6:'VSS',7:'PA5',8:'VSS',9:'PB0',10:'PB3',11:'PB4',12:'PB5',13:'PB6',14:'PB7',15:'PA1',16:'PA6',17:'PA7',18:'PA8',19:'PA9',20:'PA10',21:'PA11',22:'PA12',23:'PA13',24:'VDD',25:'NRST',26:'PA14',27:'PA15',28:'PB8',29:'PB9',30:'PC14',31:'PC15',32:'BOOT0',33:'EP'};
const SAMPLE_MCU_FW=`// U1 MCU-Q32 펌웨어 — 회로 시뮬레이션과 함께 실행됩니다 (JavaScript 문법, Arduino 스타일 API)
// ▼ 주요 파라미터: 값을 바꾸고 [빌드 & 시뮬레이션]을 누르세요
const PWM_FREQ_HZ      = 500;   // 모터 PWM 주파수 [Hz]
const TARGET_DUTY      = 70;    // 목표 듀티 [%]
const START_DELAY_MS   = 50;    // 전원 인가 후 기동 지연 [ms]
const SOFT_START_MS    = 250;   // 0 → 목표 듀티까지 올리는 시간 [ms]
const CURRENT_LIMIT_MA = 400;   // 모터 평균 전류 제한 [mA]
const LED_BLINK_MS     = 60;    // 가속 중 상태 LED 점멸 반주기 [ms]

const SHUNT_OHM = 0.1;          // R5 전류 검출 저항
let duty = 0;                   // 현재 듀티 [%]
let limitCount = 0;             // 전류 제한이 걸린 횟수 [ms]

function setup() {
  pinMode(PB3, OUTPUT);          // D3 상태 LED (R4 경유)
  pwmInit(PA8, PWM_FREQ_HZ);     // R1 → Q1 게이트 → M1 모터
  log('부팅: PWM', PWM_FREQ_HZ, 'Hz · 목표 듀티', TARGET_DUTY, '%');
}

function loop(ms) {              // 1 ms마다 호출됩니다
  // R5 션트 전압을 R6·C4 필터로 평균낸 값 → 모터 평균 전류 [mA]
  const iMotor = analogReadVoltage(PA1) / SHUNT_OHM * 1000;

  if (ms < START_DELAY_MS) {
    duty = 0;
  } else {
    const ramp = Math.min(1, (ms - START_DELAY_MS) / SOFT_START_MS);
    let want = TARGET_DUTY * ramp;
    if (iMotor > CURRENT_LIMIT_MA) {             // 전류 제한: 초과분만큼 듀티를 줄임
      want = Math.min(want, duty * CURRENT_LIMIT_MA / iMotor);
      if (limitCount++ === 0) log('전류 제한 시작:', Math.round(iMotor), 'mA');
    }
    duty = want;
    if (ms === START_DELAY_MS + SOFT_START_MS) log('가속 끝 · 듀티', duty.toFixed(1), '% · 전류 제한', limitCount, 'ms');
  }
  pwmWrite(PA8, duty);

  // 상태 LED: 대기 중 꺼짐 · 가속 중 점멸 · 정속 운전 중 켜짐
  const accel = ms >= START_DELAY_MS && ms < START_DELAY_MS + SOFT_START_MS;
  if (accel) digitalWrite(PB3, Math.floor(ms / LED_BLINK_MS) % 2);
  else digitalWrite(PB3, ms >= START_DELAY_MS ? HIGH : LOW);
}
`;
const SAMPLE_MCU=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.8,drill:0.4}));
  // 5 V input → motor, bulk caps, LDO
  tr('T','VIN',1.0,'J1.1',[9,39.27],[9,47.5],[44,47.5],'M1.1');
  tr('T','VIN',0.6,[9,43.15],'U2.3');tr('T','VIN',0.6,'C1.1',[11,47.5]);tr('T','VIN',0.8,'C5.1',[28.5,47.5]);tr('T','VIN',0.8,'D1.2',[40,47.5]);
  tr('B','VIN',0.5,[44,40],[76,40],[76,8]);tr('T','VIN',0.4,[76,8],'R7.2');via('VIN',[44,40],[76,8]);
  // 3.3 V from the LDO to the MCU, decoupling and the power LED
  tr('T','+3V3',0.6,'U2.4',[16,26.5],[22.45,26.5],'U1.24');tr('T','+3V3',0.6,'U2.2','U2.4');
  tr('T','+3V3',0.3,'U1.1',[17.55,26.5]);tr('T','+3V3',0.4,'C2.2',[16,32]);tr('T','+3V3',0.3,'C3.1',[22.45,28],[22.45,26.5]);
  tr('T','+3V3',0.3,'R3.2',[13,28],'C2.2');
  tr('T','PWR_A',0.3,'R3.1',[7.2,25.6],'D2.2');
  // MCU → gate drive → MOSFET low side
  tr('T','PWM_M',0.3,'U1.18','R1.1');
  tr('T','GATE',0.3,'R1.2',[30,20.75],[30,14.95],'Q1.1');tr('T','GATE',0.3,'R2.2',[30,17.8]);
  tr('T','MOT_N',1.0,'Q1.3',[34,23.5],'M1.2');tr('T','MOT_N',0.8,'D1.1',[40,23.5]);
  tr('T','MOT_N',0.4,'D4.2',[42,8],[42,23.5]);
  // current sense: shunt → RC filter → ADC
  tr('T','I_SENSE',0.6,'Q1.2',[38,14.95],'R5.2');tr('T','I_SENSE',0.3,'Q1.2',[34.95,11],'R6.2');
  tr('T','ISNS_ADC',0.3,'U1.15',[21.25,17.5],[24.5,14.25],[24.5,11],'R6.1');tr('T','ISNS_ADC',0.3,'C4.2',[26,11]);
  // status + run LEDs
  tr('T','LED_ST',0.3,'U1.10','R4.2');tr('T','STAT_A',0.3,'R4.1','D3.2');
  tr('T','RUN_A',0.3,'R7.1','D4.1');
  // ground stubs to the bottom pour
  [['U2.1',[20.6,43.15]],['C1.2',[14.6,46.5]],['C2.1',[11,30.3]],['C3.2',[27.4,28]],['C5.2',[33.1,44]],['R2.1',[28,14.7]],['R5.1',[38,7.8]],['C4.1',[26,5.7]],['D2.1',[8,21.7]],['D3.1',[18.75,6.7]]]
    .forEach(([a,b])=>{tr('T','GND',0.5,a,b);via('GND',b);});
  tr('T','GND',0.4,'U1.6',[15.6,21.25],[15.6,20.25],'U1.8');via('GND',[15.6,20.75],[20,22]);
  return{
    _source:'예제',_demo:'mcu',
    board:{name:'MOTION-32 DEV v1.0',width:80,height:50,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[76.5,3.5,3.2],[3.5,46.5,3.2],[76.5,46.5,3.2]]},
    components:[
      {ref:'J1',value:'5V 입력',footprint:'HDR-1x2',side:'top',x:5,y:38,rotation:0,mpn:'PH-2.54-1x2',description:'5 V 전원 입력 · 2.54 mm',pins:{1:'VIN',2:'GND'},pinNames:{1:'5V',2:'GND'}},
      {ref:'U2',value:'AMS1117-3.3',footprint:'SOT-223',side:'top',x:16,y:40,rotation:180,mpn:'AMS1117-3.3',description:'3.3 V LDO 레귤레이터 (MCU 전원)',pins:{1:'GND',2:'+3V3',3:'VIN',4:'+3V3'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[16,35]},
      {ref:'C1',value:'10µF',footprint:'0805',side:'top',x:12,y:46.5,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 입력 커패시터',pins:{1:'VIN',2:'GND'}},
      {ref:'C2',value:'10µF',footprint:'0805',side:'top',x:12,y:32,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 출력 커패시터',pins:{1:'GND',2:'+3V3'}},
      {ref:'C3',value:'100nF',footprint:'0603',side:'top',x:25,y:28,rotation:0,mpn:'CL10B104KB8NNNC',description:'MCU 디커플링',pins:{1:'+3V3',2:'GND'}},
      {ref:'C5',value:'100µF',footprint:'1206',side:'top',x:30,y:44,rotation:0,mpn:'GRM31CR60J107ME39',description:'모터 전원 벌크 커패시터',pins:{1:'VIN',2:'GND'}},
      {ref:'U1',value:'MCU-Q32',footprint:'QFN-32',side:'top',x:20,y:22,rotation:0,mpn:'MCU-Q32 (예시 부품)',description:'32비트 마이크로컨트롤러 · 펌웨어로 모터 PWM·LED를 제어 (부품을 클릭해 펌웨어 편집)',
        pins:{1:'+3V3',6:'GND',8:'GND',10:'LED_ST',15:'ISNS_ADC',18:'PWM_M',24:'+3V3',33:'GND'},
        pinNames:MCU_Q32_PINS,
        firmware:SAMPLE_MCU_FW,label:[20,17]},
      {ref:'R1',value:'100Ω',footprint:'0603',side:'top',x:27,y:20.75,rotation:0,mpn:'RC0603FR-07100RL',description:'게이트 직렬 저항',pins:{1:'PWM_M',2:'GATE'}},
      {ref:'R2',value:'10kΩ',footprint:'0603',side:'top',x:28,y:17,rotation:90,mpn:'RC0603FR-0710KL',description:'게이트 풀다운 (MCU 리셋 중 모터 OFF)',pins:{1:'GND',2:'GATE'},label:[26.4,17]},
      {ref:'Q1',value:'AO3400A',footprint:'SOT-23',side:'top',x:34,y:16,rotation:0,mpn:'AO3400A',description:'N채널 MOSFET 30 V 5.7 A · 로우사이드 스위치',pins:{1:'GATE',2:'I_SENSE',3:'MOT_N'},pinNames:{1:'G',2:'S',3:'D'},model:{type:'nmos',vth:1.2,kp:8,lambda:0.01},label:[34,19]},
      {ref:'R5',value:'0.1Ω',footprint:'1206',side:'top',x:38,y:11,rotation:90,mpn:'RL1206FR-070R1L',description:'모터 전류 검출 션트',pins:{1:'GND',2:'I_SENSE'},label:[40.4,11]},
      {ref:'R6',value:'10kΩ',footprint:'0603',side:'top',x:30,y:11,rotation:0,mpn:'RC0603FR-0710KL',description:'전류 검출 RC 필터 저항',pins:{1:'ISNS_ADC',2:'I_SENSE'},label:[30,12.6]},
      {ref:'C4',value:'1µF',footprint:'0603',side:'top',x:26,y:8,rotation:90,mpn:'CL10A105KB8NNNC',description:'전류 검출 RC 필터 (τ = 10 ms)',pins:{1:'GND',2:'ISNS_ADC'},label:[24.4,8]},
      {ref:'D1',value:'SS14',footprint:'SMA',side:'top',x:40,y:32,rotation:90,mpn:'SS14',description:'플라이백 쇼트키 다이오드',pins:{1:'MOT_N',2:'VIN'},pinNames:{1:'A',2:'K'},label:[43,32]},
      {ref:'M1',value:'DC 모터 130',footprint:'MOTOR-130',side:'top',x:58,y:26,rotation:0,mpn:'RF-130 + 기어 1:48',description:'브러시 DC 모터 · 5 V · 기어비 1:48 출력 팬',pins:{1:'VIN',2:'MOT_N'},pinNames:{1:'+',2:'-'},label:[58,15.5],
        model:{R:2.5,L:5e-4,ke:0.004,kt:0.004,J:6e-7,b:2e-7,tf:1e-4,tl:0,gear:48}},
      {ref:'R3',value:'330Ω',footprint:'0603',side:'top',x:8,y:28,rotation:0,mpn:'RC0603FR-07330RL',description:'전원 LED 전류 제한',pins:{1:'PWR_A',2:'+3V3'}},
      {ref:'D2',value:'LED 빨강',footprint:'LED-0603',side:'top',x:8,y:24,rotation:90,mpn:'19-217/R6C',description:'3.3 V 전원 표시 LED',pins:{1:'GND',2:'PWR_A'},pinNames:{1:'K',2:'A'},label:[5.8,24]},
      {ref:'R4',value:'330Ω',footprint:'0603',side:'top',x:18.75,y:13,rotation:90,mpn:'RC0603FR-07330RL',description:'상태 LED 전류 제한',pins:{1:'STAT_A',2:'LED_ST'},label:[16.8,13]},
      {ref:'D3',value:'LED 녹색',footprint:'LED-0603',side:'top',x:18.75,y:9,rotation:90,mpn:'19-217/GHC',description:'MCU 상태 LED (PB3)',pins:{1:'GND',2:'STAT_A'},pinNames:{1:'K',2:'A'},label:[16.8,9]},
      {ref:'R7',value:'680Ω',footprint:'0603',side:'top',x:72,y:8,rotation:0,mpn:'RC0603FR-07680RL',description:'구동 LED 전류 제한',pins:{1:'RUN_A',2:'VIN'}},
      {ref:'D4',value:'LED 파랑',footprint:'LED-0603',side:'top',x:66,y:8,rotation:180,mpn:'19-217/BHC',description:'모터 구동 표시 LED (MOSFET이 켜지면 점등)',pins:{1:'RUN_A',2:'MOT_N'},pinNames:{1:'A',2:'K'}},
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.4,inset:0.5}],
    texts:[
      {side:'top',text:'MOTION-32 DEV',x:46,y:3.6,size:1.2},{side:'top',text:'v1.0',x:53.6,y:3.6,size:0.8,align:'left'},
      {side:'top',text:'5V',x:2.4,y:41.6,size:0.8},{side:'top',text:'PWR',x:8,y:19.6,size:0.6},{side:'top',text:'STAT',x:21.4,y:9,size:0.6,align:'left'},
      {side:'top',text:'RUN',x:66,y:10.4,size:0.6},{side:'top',text:'MCU',x:20,y:28.4,size:0.6},
      {side:'bottom',text:'MOTION-32 · MCU PWM MOTOR + LED',x:40,y:6,size:0.9},
    ]
  };
})();

/* Built-in example 3: MCU + integrated 3-phase driver + hall-sensor BLDC motor, six-step commutation in firmware */
const SAMPLE_BLDC_FW=`// U1 MCU-Q32 BLDC 펌웨어 — 홀 센서 6스텝 정류, 회로 시뮬레이션과 함께 실행됩니다
// ▼ 주요 파라미터: 값을 바꾸고 [빌드 & 시뮬레이션]을 누르세요
const PWM_FREQ_HZ    = 1000;  // 상단 스위치 PWM 주파수 [Hz]
const TARGET_DUTY    = 80;    // 목표 듀티 [%]
const START_DELAY_MS = 20;    // 전원 인가 후 기동 지연 [ms]
const SOFT_START_MS  = 150;   // 0 → 목표 듀티까지 올리는 시간 [ms]
const LOOP_PERIOD_US = 50;    // 제어 루프 주기 [µs] (홀 변화 → 정류 지연)
const DIRECTION      = 1;     // 회전 방향: 1 정방향, -1 역방향
const POLE_PAIRS     = 2;     // 모터 극쌍 수 (속도 계산용)

// 상별 드라이버 입력 (U3): INx = PWM, ENx = 상 활성화
const PH = [ { name: 'U', inp: PA13, en: PA12 },
             { name: 'V', inp: PA11, en: PA10 },
             { name: 'W', inp: PA9,  en: PA8  } ];
// 홀 코드 (H3 H2 H1) → [PWM 거는 상단 상, ON 하는 하단 상]
const STEP = { 5: [2, 1], 1: [0, 1], 3: [0, 2], 2: [1, 2], 6: [1, 0], 4: [2, 0] };

let duty = 0, lastHall = -1, steps = 0, loggedSteps = 0;

function setup() {
  PH.forEach(p => { pwmInit(p.inp, PWM_FREQ_HZ); pinMode(p.en, OUTPUT); });
  pinMode(PB3, OUTPUT);          // D3 상태 LED
  log('BLDC 6스텝 · PWM', PWM_FREQ_HZ, 'Hz · 루프', LOOP_PERIOD_US, 'µs');
}

function stopAll() { PH.forEach(p => { pwmWrite(p.inp, 0); digitalWrite(p.en, LOW); }); }

function loop(ms) {              // LOOP_PERIOD_US마다 호출됩니다 (ms는 소수일 수 있음)
  if (digitalRead(PA7) === LOW) { stopAll(); return; }          // U3 nFAULT
  const hall = digitalRead(PB5) | (digitalRead(PB6) << 1) | (digitalRead(PB7) << 2);
  duty = ms < START_DELAY_MS ? 0 : TARGET_DUTY * Math.min(1, (ms - START_DELAY_MS) / SOFT_START_MS);
  let s = STEP[hall];
  if (!s || duty <= 0) { stopAll(); digitalWrite(PB3, LOW); return; }
  if (DIRECTION < 0) s = [s[1], s[0]];
  PH.forEach((p, i) => {
    if (i === s[0])      { pwmWrite(p.inp, duty); digitalWrite(p.en, HIGH); }  // 상단 PWM
    else if (i === s[1]) { pwmWrite(p.inp, 0);    digitalWrite(p.en, HIGH); }  // 하단 ON
    else                 { pwmWrite(p.inp, 0);    digitalWrite(p.en, LOW);  }  // 개방
  });
  if (hall !== lastHall) { steps++; lastHall = hall; }
  digitalWrite(PB3, Math.floor(steps / (6 * POLE_PAIRS)) % 2);  // 기계 1회전마다 LED 토글

  if (Number.isInteger(ms) && ms % 100 === 0) {                 // 100 ms마다 홀로 잰 속도
    log('홀 속도', Math.round((steps - loggedSteps) / (6 * POLE_PAIRS) * 600), 'rpm · 듀티', Math.round(duty), '%');
    loggedSteps = steps;
  }
}
`;
const SAMPLE_BLDC=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.8,drill:0.4}));
  // 12 V input → LDO, bulk cap, driver VM
  tr('T','+12V',1.0,'J1.1',[9,45.27],[9,53],[48,53],[48,31.5],'U3.20');
  tr('T','+12V',0.6,[9,49.15],'U2.3');tr('T','+12V',0.6,'C1.1',[11,53]);tr('T','+12V',0.8,'C5.1',[48,44]);
  // 3.3 V
  tr('T','+3V3',0.6,'U2.4',[16,30.5],[26.2,30.5]);tr('T','+3V3',0.6,'U2.2','U2.4');
  tr('T','+3V3',0.3,'U1.24',[24.45,30.5]);tr('T','+3V3',0.3,'U1.1',[19.55,30.5]);
  tr('T','+3V3',0.4,'C2.2',[16,38]);tr('T','+3V3',0.3,'C3.1',[26.2,30.5]);tr('T','+3V3',0.3,'R3.2',[13,34],'C2.2');
  via('+3V3',[26.2,30.5]);tr('B','+3V3',0.4,[26.2,30.5],[26.2,34.5],[55.2,34.5],[55.2,20.75],'M1.7');
  tr('T','+3V3',0.3,'R10.1',[38,19.6]);via('+3V3',[38,19.6]);tr('B','+3V3',0.3,[38,19.6],[38,34.5]);
  tr('T','PWR_A',0.3,'R3.1',[7.2,31.6],'D2.2');
  // MCU → driver: monotonic fan-out (no crossings)
  [[17,7,'NFAULT'],[18,6,'EN_W'],[19,5,'IN_W'],[20,4,'EN_V'],[21,3,'IN_V'],[22,2,'EN_U'],[23,1,'IN_U']].forEach(([mp,dp,net])=>{
    const ym=26-1.75+0.5*(mp-17),yd=27+2.925-0.65*(dp-1);tr('T',net,0.25,'U1.'+mp,[28,ym],[36,yd],'U3.'+dp);});
  tr('T','NFAULT',0.25,'R10.2',[38,26.025]);
  // driver → motor phases
  tr('T','PH_U',0.5,'U3.19',[48.5,29.275],[52,35.75],'M1.1');
  tr('T','PH_V',0.5,'U3.17',[50,27.975],[53,33.25],'M1.2');
  tr('T','PH_W',0.5,'U3.15',[51.5,26.675],[54,30.75],'M1.3');
  // hall sensors back to the MCU (bottom layer)
  tr('T','HALL1',0.25,'M1.4',[53.8,28.25]);via('HALL1',[53.8,28.25],[20.9,17.5]);tr('B','HALL1',0.25,[53.8,28.25],[53.8,17.5],[20.9,17.5]);tr('T','HALL1',0.25,[20.9,17.5],[21.75,19],'U1.12');
  tr('T','HALL2',0.25,'M1.5',[53,25.75]);via('HALL2',[53,25.75],[22.25,16]);tr('B','HALL2',0.25,[53,25.75],[53,16],[22.25,16]);tr('T','HALL2',0.25,[22.25,16],'U1.13');
  tr('T','HALL3',0.25,'M1.6',[52.2,23.25]);via('HALL3',[52.2,23.25],[23.6,14.5]);tr('B','HALL3',0.25,[52.2,23.25],[52.2,14.5],[23.6,14.5]);tr('T','HALL3',0.25,[23.6,14.5],[22.75,19.5],'U1.14');
  // status LED
  tr('T','LED_ST',0.3,'U1.10',[20.75,22],[18,19.25],'R4.2');tr('T','STAT_A',0.3,'R4.1','D3.2');
  // ground
  [['U2.1',[20.6,49.15]],['C1.2',[14.6,51.6]],['C2.1',[11,36.3]],['C3.2',[29.3,32]],['C5.2',[55,44]],['D2.1',[8,27.7]],['D3.1',[18,11.7]],['M1.8',[55.6,17.2]]]
    .forEach(([a,b])=>{tr('T','GND',0.5,a,b);via('GND',b);});
  tr('T','GND',0.4,'U1.6',[17.6,25.25],[17.6,24.25],'U1.8');via('GND',[17.6,24.75],[22,26],[44,26],[44,28]);
  tr('T','GND',0.5,'U3.13',[45,25.375]);tr('T','GND',0.4,'U3.10',[42.9,25.2]);
  return{
    _source:'예제',_demo:'bldc',
    board:{name:'MOTION-32 BLDC v1.0',width:100,height:55,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[96.5,3.5,3.2],[3.5,51.5,3.2],[96.5,51.5,3.2]]},
    components:[
      {ref:'J1',value:'12V 입력',footprint:'HDR-1x2',side:'top',x:5,y:44,rotation:0,mpn:'PH-2.54-1x2',description:'12 V 모터 전원 입력',pins:{1:'+12V',2:'GND'},pinNames:{1:'12V',2:'GND'}},
      {ref:'U2',value:'AMS1117-3.3',footprint:'SOT-223',side:'top',x:16,y:46,rotation:180,mpn:'AMS1117-3.3',description:'3.3 V LDO (MCU·홀 센서 전원)',pins:{1:'GND',2:'+3V3',3:'+12V',4:'+3V3'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[16,41]},
      {ref:'C1',value:'10µF',footprint:'0805',side:'top',x:12,y:51.6,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 입력 커패시터',pins:{1:'+12V',2:'GND'}},
      {ref:'C2',value:'10µF',footprint:'0805',side:'top',x:12,y:38,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 출력 커패시터',pins:{1:'GND',2:'+3V3'}},
      {ref:'C3',value:'100nF',footprint:'0603',side:'top',x:27,y:32,rotation:0,mpn:'CL10B104KB8NNNC',description:'MCU 디커플링',pins:{1:'+3V3',2:'GND'}},
      {ref:'C5',value:'220µF',footprint:'1206',side:'top',x:52,y:44,rotation:0,mpn:'EEE-FK1E221P (예시)',description:'모터 전원 벌크 커패시터',pins:{1:'+12V',2:'GND'}},
      {ref:'U1',value:'MCU-Q32',footprint:'QFN-32',side:'top',x:22,y:26,rotation:0,mpn:'MCU-Q32 (예시 부품)',description:'32비트 MCU · 홀 센서로 6스텝 정류, 3상 PWM 출력 (부품을 클릭해 펌웨어 편집)',
        pins:{1:'+3V3',6:'GND',8:'GND',10:'LED_ST',12:'HALL1',13:'HALL2',14:'HALL3',17:'NFAULT',18:'EN_W',19:'IN_W',20:'EN_V',21:'IN_V',22:'EN_U',23:'IN_U',24:'+3V3',33:'GND'},
        pinNames:MCU_Q32_PINS,firmware:SAMPLE_BLDC_FW,label:[22,21.2]},
      {ref:'U3',value:'BLDC-DRV3',footprint:'HTSSOP-20',side:'top',x:44,y:27,rotation:0,mpn:'BLDC-DRV3 (예시 부품)',description:'3상 하프브리지 드라이버 · 상별 IN(PWM)/EN, RDS(on) 0.3 Ω, 바디 다이오드',
        pins:{1:'IN_U',2:'EN_U',3:'IN_V',4:'EN_V',5:'IN_W',6:'EN_W',7:'NFAULT',10:'GND',13:'GND',15:'PH_W',17:'PH_V',19:'PH_U',20:'+12V',21:'GND'},
        pinNames:{1:'IN1',2:'EN1',3:'IN2',4:'EN2',5:'IN3',6:'EN3',7:'nFAULT',8:'NC',9:'NC',10:'GND',11:'NC',12:'NC',13:'PGND',14:'NC',15:'OUT3',16:'NC',17:'OUT2',18:'NC',19:'OUT1',20:'VM',21:'EP'},
        model:{type:'bridge3',ron:0.3},label:[44,22]},
      {ref:'R10',value:'10kΩ',footprint:'0603',side:'top',x:38,y:22,rotation:90,mpn:'RC0603FR-0710KL',description:'nFAULT 풀업 (오픈 드레인)',pins:{1:'+3V3',2:'NFAULT'},label:[39.8,22]},
      {ref:'M1',value:'BLDC 2418',footprint:'BLDC-2418',side:'top',x:76,y:27,rotation:0,mpn:'BL2418-12V-2P (예시)',description:'3상 BLDC 모터 · 12 V · 2극쌍 · 홀 센서 내장, 직결 팬',
        pins:{1:'PH_U',2:'PH_V',3:'PH_W',4:'HALL1',5:'HALL2',6:'HALL3',7:'+3V3',8:'GND'},pinNames:{1:'U',2:'V',3:'W',4:'H1',5:'H2',6:'H3',7:'VCC',8:'GND'},label:[76,13.5],
        model:{R:1.2,L:6e-4,ke:0.02,kt:0.02,J:3e-5,b:1e-5,tf:2e-3,tl:0,poles:2,gear:1,hallV:3.3}},
      {ref:'R3',value:'330Ω',footprint:'0603',side:'top',x:8,y:34,rotation:0,mpn:'RC0603FR-07330RL',description:'전원 LED 전류 제한',pins:{1:'PWR_A',2:'+3V3'}},
      {ref:'D2',value:'LED 빨강',footprint:'LED-0603',side:'top',x:8,y:30,rotation:90,mpn:'19-217/R6C',description:'3.3 V 전원 표시 LED',pins:{1:'GND',2:'PWR_A'},pinNames:{1:'K',2:'A'},label:[5.8,30]},
      {ref:'R4',value:'330Ω',footprint:'0603',side:'top',x:18,y:18,rotation:90,mpn:'RC0603FR-07330RL',description:'상태 LED 전류 제한',pins:{1:'STAT_A',2:'LED_ST'},label:[16.2,18]},
      {ref:'D3',value:'LED 녹색',footprint:'LED-0603',side:'top',x:18,y:14,rotation:90,mpn:'19-217/GHC',description:'MCU 상태 LED (PB3) · 회전마다 토글',pins:{1:'GND',2:'STAT_A'},pinNames:{1:'K',2:'A'},label:[16.2,14]},
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.4,inset:0.5}],
    texts:[
      {side:'top',text:'MOTION-32 BLDC',x:40,y:4,size:1.2},{side:'top',text:'v1.0',x:48.6,y:4,size:0.8,align:'left'},
      {side:'top',text:'12V',x:2.6,y:47.6,size:0.8},{side:'top',text:'PWR',x:8,y:25.6,size:0.6},{side:'top',text:'STAT',x:20,y:12,size:0.6,align:'left'},
      {side:'top',text:'U V W H1 H2 H3 + -',x:59,y:11.5,size:0.55},
      {side:'bottom',text:'MOTION-32 BLDC · 6-STEP HALL',x:50,y:6,size:0.9},
    ]
  };
})();
