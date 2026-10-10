/* Built-in example 2: MCU-controlled DC motor with LEDs. U1 runs editable firmware that is co-simulated with the circuit. */
const SAMPLE_MCU_FW=`// U1 STM32F042K6U6 펌웨어 — 회로 시뮬레이션과 함께 실행됩니다 (JavaScript 문법, Arduino 스타일 API)
// ▼ 주요 파라미터: 값을 바꾸고 [빌드 & 시뮬레이션]을 누르세요
const PWM_FREQ_HZ      = 500;   // 모터 PWM 주파수 [Hz]
const TARGET_DUTY      = 60;    // 목표 듀티 [%] (FA-130 정격 3 V를 고려한 평균 전압 제한)
const START_DELAY_MS   = 50;    // 전원 인가 후 기동 지연 [ms]
const SOFT_START_MS    = 250;   // 0 → 목표 듀티까지 올리는 시간 [ms]
const CURRENT_LIMIT_MA = 400;   // 모터 평균 전류 제한 [mA]
const LED_BLINK_MS     = 60;    // 가속 중 상태 LED 점멸 반주기 [ms]

const SHUNT_OHM = 0.1;          // R5 전류 검출 저항
let duty = 0;                   // 현재 듀티 [%]
let limitCount = 0;             // 전류 제한이 걸린 횟수 [ms]

function setup() {
  pinMode(PA4, OUTPUT);          // D3 상태 LED (R4 경유)
  pwmInit(PA8, PWM_FREQ_HZ);     // TIM1_CH1 → R1 → Q1 게이트 → M1 모터
  log('부팅: PWM', PWM_FREQ_HZ, 'Hz · 목표 듀티', TARGET_DUTY, '%');
}

function loop(ms) {              // 1 ms마다 호출됩니다
  // R5 션트 전압을 R6·C4 필터로 평균낸 값 → 모터 평균 전류 [mA]
  const iMotor = analogReadVoltage(PB1) / SHUNT_OHM * 1000;   // PB1 = ADC_IN9

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
  if (accel) digitalWrite(PA4, Math.floor(ms / LED_BLINK_MS) % 2);
  else digitalWrite(PA4, ms >= START_DELAY_MS ? HIGH : LOW);
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
  tr('T','+3V3',0.6,'U2.4',[16,26.5],[22.45,26.5]);tr('T','+3V3',0.4,[16,26.5],[16,21.75],'U1.5');
  tr('T','+3V3',0.3,'U1.17',[23.4,19.3]);via('+3V3',[23.4,19.3],[23.4,27.6]);tr('B','+3V3',0.3,[23.4,19.3],[23.4,27.6]);tr('T','+3V3',0.3,[23.4,27.6],'C3.1');tr('T','+3V3',0.6,'U2.2','U2.4');
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
  via('GND',[20,22],[19.2,21.2],[20.8,22.8]);
  return{
    _source:'예제',_demo:'mcu',
    board:{name:'MOTION-32 DEV v1.0',width:80,height:50,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[76.5,3.5,3.2],[3.5,46.5,3.2],[76.5,46.5,3.2]]},
    components:[
      {ref:'J1',value:'5V 입력',footprint:'HDR-1x2',side:'top',x:5,y:38,rotation:0,mpn:'61300211121',description:'5 V 전원 입력 (Würth WR-PHD 2.54 mm)',pins:{1:'VIN',2:'GND'},pinNames:{1:'5V',2:'GND'}},
      {ref:'U2',value:'AMS1117-3.3',footprint:'SOT-223',side:'top',x:16,y:40,rotation:180,mpn:'AMS1117-3.3',description:'3.3 V LDO 레귤레이터 (MCU 전원)',pins:{1:'GND',2:'+3V3',3:'VIN',4:'+3V3'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[16,35]},
      {ref:'C1',value:'10µF',footprint:'0805',side:'top',x:12,y:46.5,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 입력 커패시터',pins:{1:'VIN',2:'GND'}},
      {ref:'C2',value:'10µF',footprint:'0805',side:'top',x:12,y:32,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 출력 커패시터',pins:{1:'GND',2:'+3V3'}},
      {ref:'C3',value:'100nF',footprint:'0603',side:'top',x:25,y:28,rotation:0,mpn:'CL10B104KB8NNNC',description:'MCU 디커플링',pins:{1:'+3V3',2:'GND'}},
      {ref:'C5',value:'100µF',footprint:'1206',side:'top',x:30,y:44,rotation:0,mpn:'GRM31CR60J107ME39',description:'모터 전원 벌크 커패시터',pins:{1:'VIN',2:'GND'}},
      {ref:'U1',value:'STM32F042K6U6',footprint:'QFN-32',side:'top',x:20,y:22,rotation:0,mpn:'STM32F042K6U6',description:'Arm Cortex-M0 48 MHz · PA8 TIM1 PWM으로 모터, PA4로 LED, PB1 ADC로 전류 (부품을 클릭해 펌웨어 편집)',
        pins:{1:'+3V3',5:'+3V3',10:'LED_ST',15:'ISNS_ADC',17:'+3V3',18:'PWM_M',33:'GND'},
        pinNames:STM32F042K6U6_PINS,
        firmware:SAMPLE_MCU_FW,label:[20,17]},
      {ref:'R1',value:'100Ω',footprint:'0603',side:'top',x:27,y:20.75,rotation:0,mpn:'RC0603FR-07100RL',description:'게이트 직렬 저항',pins:{1:'PWM_M',2:'GATE'}},
      {ref:'R2',value:'10kΩ',footprint:'0603',side:'top',x:28,y:17,rotation:90,mpn:'RC0603FR-0710KL',description:'게이트 풀다운 (MCU 리셋 중 모터 OFF)',pins:{1:'GND',2:'GATE'},label:[26.4,17]},
      {ref:'Q1',value:'AO3400A',footprint:'SOT-23',side:'top',x:34,y:16,rotation:0,mpn:'AO3400A',description:'N채널 MOSFET (Alpha & Omega) 30 V 5.7 A · VGS(th) 1.05 V · 로우사이드 스위치',pins:{1:'GATE',2:'I_SENSE',3:'MOT_N'},pinNames:{1:'G',2:'S',3:'D'},model:{type:'nmos',vth:1.05,kp:8,lambda:0.01},label:[34,19]},
      {ref:'R5',value:'0.1Ω',footprint:'1206',side:'top',x:38,y:11,rotation:90,mpn:'RL1206FR-070R1L',description:'모터 전류 검출 션트',pins:{1:'GND',2:'I_SENSE'},label:[40.4,11]},
      {ref:'R6',value:'10kΩ',footprint:'0603',side:'top',x:30,y:11,rotation:0,mpn:'RC0603FR-0710KL',description:'전류 검출 RC 필터 저항',pins:{1:'ISNS_ADC',2:'I_SENSE'},label:[30,12.6]},
      {ref:'C4',value:'1µF',footprint:'0603',side:'top',x:26,y:8,rotation:90,mpn:'CL10A105KB8NNNC',description:'전류 검출 RC 필터 (τ = 10 ms)',pins:{1:'GND',2:'ISNS_ADC'},label:[24.4,8]},
      {ref:'D1',value:'SS14',footprint:'SMA',side:'top',x:40,y:32,rotation:90,mpn:'SS14',description:'플라이백 쇼트키 다이오드 (Vishay) · 40 V 1 A',pins:{1:'MOT_N',2:'VIN'},pinNames:{1:'A',2:'K'},label:[43,32]},
      {ref:'M1',value:'FA-130RA',footprint:'MOTOR-130',side:'top',x:58,y:26,rotation:0,mpn:'FA-130RA',description:'Mabuchi FA-130 브러시 DC 모터 · 3 V 무부하 12,300 rpm · Tamiya 70097 기어박스 58:1 출력 팬',pins:{1:'VIN',2:'MOT_N'},pinNames:{1:'+',2:'-'},label:[58,15.5],
        model:{R:1.43,L:1.5e-4,ke:0.00216,kt:0.00216,J:1.6e-7,b:1e-9,tf:3.2e-4,tl:0,gear:58}},
      {ref:'R3',value:'330Ω',footprint:'0603',side:'top',x:8,y:28,rotation:0,mpn:'RC0603FR-07330RL',description:'전원 LED 전류 제한',pins:{1:'PWR_A',2:'+3V3'}},
      {ref:'D2',value:'LED 빨강',footprint:'LED-0603',side:'top',x:8,y:24,rotation:90,mpn:'APT1608EC',description:'3.3 V 전원 표시 LED (Kingbright)',pins:{1:'GND',2:'PWR_A'},pinNames:{1:'K',2:'A'},label:[5.8,24]},
      {ref:'R4',value:'330Ω',footprint:'0603',side:'top',x:18.75,y:13,rotation:90,mpn:'RC0603FR-07330RL',description:'상태 LED 전류 제한',pins:{1:'STAT_A',2:'LED_ST'},label:[16.8,13]},
      {ref:'D3',value:'LED 녹색',footprint:'LED-0603',side:'top',x:18.75,y:9,rotation:90,mpn:'APT1608SGC',description:'MCU 상태 LED (PA4, Kingbright)',pins:{1:'GND',2:'STAT_A'},pinNames:{1:'K',2:'A'},label:[16.8,9]},
      {ref:'R7',value:'680Ω',footprint:'0603',side:'top',x:72,y:8,rotation:0,mpn:'RC0603FR-07680RL',description:'구동 LED 전류 제한',pins:{1:'RUN_A',2:'VIN'}},
      {ref:'D4',value:'LED 파랑',footprint:'LED-0603',side:'top',x:66,y:8,rotation:180,mpn:'APT1608QBC/D',description:'모터 구동 표시 LED (Kingbright 청색, MOSFET이 켜지면 점등)',pins:{1:'RUN_A',2:'MOT_N'},pinNames:{1:'A',2:'K'}},
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

/* Built-in example 3: STM32F042K6U6 + TI DRV8313 3-phase driver + 42BLF01 hall-sensor BLDC motor, six-step commutation in firmware */
const SAMPLE_BLDC_FW=`// U1 STM32F042K6U6 BLDC 펌웨어 — 홀 센서 6스텝 정류, 회로 시뮬레이션과 함께 실행됩니다
// ▼ 주요 파라미터: 값을 바꾸고 [빌드 & 시뮬레이션]을 누르세요
const PWM_FREQ_HZ    = 2000;  // 상단 스위치 PWM 주파수 [Hz] (실제 제품은 보통 20 kHz 이상)
const TARGET_DUTY    = 80;    // 목표 듀티 [%]
const START_DELAY_MS = 10;    // 전원 인가 후 기동 지연 [ms]
const SOFT_START_MS  = 60;    // 0 → 목표 듀티까지 올리는 시간 [ms]
const LOOP_PERIOD_US = 50;    // 제어 루프 주기 [µs] (홀 변화 → 정류 지연)
const DIRECTION      = 1;     // 회전 방향: 1 정방향, -1 역방향
const POLE_PAIRS     = 4;     // 42BLF01: 8극 = 4극쌍 (속도 계산용)

// DRV8313 상별 입력: INx = PWM(TIM1), ENx = 상 활성화 (GPIO)
const PH = [ { name: 'U', inp: PA11, en: PA15 },   // OUT3 → U
             { name: 'V', inp: PA10, en: PA12 },   // OUT2 → V
             { name: 'W', inp: PA8,  en: PA9  } ]; // OUT1 → W
const HALL = [PA6, PA7, PB0];                       // 홀 출력 (오픈 컬렉터, MCU 내부 풀업)
// 홀 코드 (H3 H2 H1) → [PWM 거는 상단 상, ON 하는 하단 상]
const STEP = { 5: [2, 1], 1: [0, 1], 3: [0, 2], 2: [1, 2], 6: [1, 0], 4: [2, 0] };

let duty = 0, lastHall = -1, steps = 0, loggedSteps = 0;

function setup() {
  PH.forEach(p => { pwmInit(p.inp, PWM_FREQ_HZ); pinMode(p.en, OUTPUT); });
  HALL.forEach(h => pinMode(h, INPUT_PULLUP));
  pinMode(PB3, INPUT);           // DRV8313 nFAULT (R10 풀업)
  pinMode(PA4, OUTPUT);          // D3 상태 LED
  log('BLDC 6스텝 · PWM', PWM_FREQ_HZ, 'Hz · 루프', LOOP_PERIOD_US, 'µs');
}

function stopAll() { PH.forEach(p => { pwmWrite(p.inp, 0); digitalWrite(p.en, LOW); }); }

function loop(ms) {              // LOOP_PERIOD_US마다 호출됩니다 (ms는 소수일 수 있음)
  if (digitalRead(PB3) === LOW) { stopAll(); return; }         // nFAULT: 과전류·과열·저전압
  const hall = digitalRead(HALL[0]) | (digitalRead(HALL[1]) << 1) | (digitalRead(HALL[2]) << 2);
  duty = ms < START_DELAY_MS ? 0 : TARGET_DUTY * Math.min(1, (ms - START_DELAY_MS) / SOFT_START_MS);
  let s = STEP[hall];
  if (!s || duty <= 0) { stopAll(); digitalWrite(PA4, LOW); return; }
  if (DIRECTION < 0) s = [s[1], s[0]];
  PH.forEach((p, i) => {
    if (i === s[0])      { pwmWrite(p.inp, duty); digitalWrite(p.en, HIGH); }  // 상단 PWM
    else if (i === s[1]) { pwmWrite(p.inp, 0);    digitalWrite(p.en, HIGH); }  // 하단 ON
    else                 { pwmWrite(p.inp, 0);    digitalWrite(p.en, LOW);  }  // 개방
  });
  if (hall !== lastHall) { steps++; lastHall = hall; }
  digitalWrite(PA4, Math.floor(steps / (6 * POLE_PAIRS)) % 2);  // 기계 1회전마다 LED 토글

  if (Number.isInteger(ms) && ms % 50 === 0) {                  // 50 ms마다 홀로 잰 속도
    log('홀 속도', Math.round((steps - loggedSteps) / (6 * POLE_PAIRS) * 1200), 'rpm · 듀티', Math.round(duty), '%');
    loggedSteps = steps;
  }
}
`;
const SAMPLE_BLDC=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.8,drill:0.4}));
  const via5=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.5,drill:0.25}));
  // 12 V input → LDO, bulk cap, DRV8313 VM (pins 4 and 11)
  tr('T','+12V',1.0,'J1.1',[9,45.27],[9,53],[48.3,53],[48.3,29.275],'U3.11');
  tr('T','+12V',0.6,[9,49.15],'U2.3');tr('T','+12V',0.6,'C1.1',[11,53]);tr('T','+12V',0.8,[48.3,44],'C5.1');
  tr('T','+12V',0.4,'U3.4',[49.05,24.725]);via5('+12V',[49.05,24.725],[48.3,29.275]);tr('B','+12V',0.5,[48.3,29.275],[49.05,28.5],[49.05,24.725]);
  tr('B','+12V',0.3,[49.05,26.4],'C9.1');
  via('+12V',[48.3,40]);tr('B','+12V',0.4,[48.3,40],[55.2,40],[55.2,20.75],'M1.7');       // hall supply (42BLF01: 5–20 V)
  // DRV8313 charge pump caps on the bottom side
  tr('T','DRV_CPL',0.3,'U3.1',[48.25,22.775]);tr('T','DRV_CPH',0.3,'U3.2',[49.05,23.425]);tr('T','DRV_VCP',0.3,'U3.3',[48.25,24.075]);
  via5('DRV_CPL',[48.25,22.775]);via5('DRV_CPH',[49.05,23.425]);via5('DRV_VCP',[48.25,24.075]);
  tr('B','DRV_CPL',0.3,[48.25,22.775],'C8.2');tr('B','DRV_CPH',0.3,[49.05,23.425],'C8.1');tr('B','DRV_VCP',0.3,[48.25,24.075],[49.8,24.075],'C9.2');
  // 3.3 V: LDO → VDD (1), VDDA (5), VDDIO2 (17, via bottom), nFAULT pull-up
  tr('T','+3V3',0.6,'U2.4',[16,25.75],'U1.5');tr('T','+3V3',0.6,'U2.2','U2.4');tr('T','+3V3',0.3,[16,27.75],'U1.1');
  tr('T','+3V3',0.4,'C2.2',[16,38]);tr('T','+3V3',0.3,'C3.1',[16,30.4]);tr('T','+3V3',0.3,'R3.2',[13,34],'C2.2');
  via('+3V3',[16,32]);tr('B','+3V3',0.4,[16,32],[16,34.5],[36,34.5]);
  tr('T','+3V3',0.3,'U1.17',[25.5,23.2]);via('+3V3',[25.5,23.2]);tr('B','+3V3',0.3,[25.5,23.2],[26.2,23.9],[26.2,34.5]);
  tr('T','+3V3',0.3,'R10.1',[35.2,32.7]);via('+3V3',[35.2,32.7]);tr('B','+3V3',0.3,[35.2,32.7],[35.2,34.5]);
  tr('T','PWR_A',0.3,'R3.1',[7.2,31.6],'D2.2');
  // MCU → DRV8313: TIM1 CH1/CH3/CH4 on PA8/PA10/PA11 drive IN1/IN2/IN3, GPIOs drive EN1–EN3
  [[18,27,'IN_W'],[19,26,'EN_W'],[20,25,'IN_V'],[21,23,'IN_U']].forEach(([mp,dp,net])=>{
    const ym=26-1.75+0.5*(mp-17),yd=27-4.225+0.65*(28-dp);tr('T',net,0.25,'U1.'+mp,[28,ym],[36,yd],'U3.'+dp);});
  tr('T','EN_V',0.25,'U1.22',[26.6,26.75],[27.2,27.4]);via5('EN_V',[27.2,27.4],[38.6,25.375]);tr('B','EN_V',0.25,[27.2,27.4],[37.4,27.4],[38.6,25.375]);tr('T','EN_V',0.25,[38.6,25.375],'U3.24');
  tr('T','EN_U',0.25,'U1.25',[23.75,29.4],[37,29.4],[39.2,26.675],'U3.22');
  tr('T','NFAULT',0.25,'U1.26',[23.25,30.2],[38.6,30.2],[39.6,29.275],'U3.18');tr('T','NFAULT',0.25,'R10.2',[36.8,30.2]);
  // DRV8313 nSLEEP / nRESET tied to its own V3P3 regulator
  tr('T','DRV_V3P3',0.3,'U3.17',[40,29.925],[40,31.225],'U3.15');tr('T','DRV_V3P3',0.3,'U3.16',[40,30.575]);tr('T','DRV_V3P3',0.3,[40,31.225],'C10.1');
  // DRV8313 → motor phases (OUT3 → U, OUT2 → V, OUT1 → W)
  tr('T','PH_U',0.5,'U3.9',[49.5,27.975],[52,35.75],'M1.1');
  tr('T','PH_V',0.5,'U3.8',[50.5,27.325],[53,33.25],'M1.2');
  tr('T','PH_W',0.5,'U3.5',[51.5,25.375],[54,30.75],'M1.3');
  // hall sensors back to the MCU (bottom layer)
  tr('T','HALL1',0.25,'M1.4',[53.8,28.25]);via('HALL1',[53.8,28.25],[20.9,17.5]);tr('B','HALL1',0.25,[53.8,28.25],[53.8,17.5],[20.9,17.5]);tr('T','HALL1',0.25,[20.9,17.5],[21.75,19],'U1.12');
  tr('T','HALL2',0.25,'M1.5',[53,25.75]);via('HALL2',[53,25.75],[22.25,16]);tr('B','HALL2',0.25,[53,25.75],[53,16],[22.25,16]);tr('T','HALL2',0.25,[22.25,16],'U1.13');
  tr('T','HALL3',0.25,'M1.6',[52.2,23.25]);via('HALL3',[52.2,23.25],[23.6,14.5]);tr('B','HALL3',0.25,[52.2,23.25],[52.2,14.5],[23.6,14.5]);tr('T','HALL3',0.25,[23.6,14.5],[22.75,19.5],'U1.14');
  // status LED
  tr('T','LED_ST',0.3,'U1.10',[20.75,22],[18,19.25],'R4.2');tr('T','STAT_A',0.3,'R4.1','D3.2');
  // ground: stubs to vias, DRV8313 GND/PGND pins into its thermal pad
  [['U2.1',[20.6,49.15]],['C1.2',[14.6,51.6]],['C2.1',[11,36.3]],['C3.2',[18.4,31.6]],['C5.2',[55,44]],['D2.1',[8,27.7]],['D3.1',[18,11.7]],['M1.8',[55.6,17.2]],['C10.2',[39.8,33.4]]]
    .forEach(([a,b])=>{tr('T','GND',0.5,a,b);via('GND',b);});
  via('GND',[22,26],[44,25.5],[44,27],[44,28.5]);
  [['U3.28',[43,24.6]],['U3.20',[42.9,27.975]],['U3.6',[45.1,26.025]],['U3.7',[45.1,26.675]],['U3.10',[45.1,28.625]],['U3.14',[45,29.3]]].forEach(([a,b])=>tr('T','GND',0.3,a,b));
  return{
    _source:'예제',_demo:'bldc',
    board:{name:'MOTION-32 BLDC v1.0',width:100,height:55,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[96.5,3.5,3.2],[3.5,51.5,3.2],[96.5,51.5,3.2]]},
    components:[
      {ref:'J1',value:'12V 입력',footprint:'HDR-1x2',side:'top',x:5,y:44,rotation:0,mpn:'61300211121',description:'12 V 모터 전원 입력 (Würth WR-PHD 2.54 mm)',pins:{1:'+12V',2:'GND'},pinNames:{1:'12V',2:'GND'}},
      {ref:'U2',value:'AMS1117-3.3',footprint:'SOT-223',side:'top',x:16,y:46,rotation:180,mpn:'AMS1117-3.3',description:'3.3 V LDO (MCU 전원) · 입력 최대 15 V',pins:{1:'GND',2:'+3V3',3:'+12V',4:'+3V3'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[16,41]},
      {ref:'C1',value:'10µF',footprint:'0805',side:'top',x:12,y:51.6,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 입력 커패시터 · X5R 25 V',pins:{1:'+12V',2:'GND'}},
      {ref:'C2',value:'10µF',footprint:'0805',side:'top',x:12,y:38,rotation:0,mpn:'CL21A106KAYNNNE',description:'LDO 출력 커패시터',pins:{1:'GND',2:'+3V3'}},
      {ref:'C3',value:'100nF',footprint:'0603',side:'top',x:17.6,y:30.4,rotation:0,mpn:'CL10B104KB8NNNC',description:'MCU 디커플링 (VDD)',pins:{1:'+3V3',2:'GND'},label:[17.6,31.5]},
      {ref:'C5',value:'22µF',footprint:'1210',side:'top',x:52,y:44,rotation:0,mpn:'GRM32ER61E226KE15',description:'VM 벌크 커패시터 · X5R 25 V 1210',pins:{1:'+12V',2:'GND'}},
      {ref:'U1',value:'STM32F042K6U6',footprint:'QFN-32',side:'top',x:22,y:26,rotation:0,mpn:'STM32F042K6U6',description:'Arm Cortex-M0 48 MHz · TIM1 3상 PWM, 홀 센서 6스텝 정류 (부품을 클릭해 펌웨어 편집)',
        pins:{1:'+3V3',5:'+3V3',10:'LED_ST',12:'HALL1',13:'HALL2',14:'HALL3',17:'+3V3',18:'IN_W',19:'EN_W',20:'IN_V',21:'IN_U',22:'EN_V',25:'EN_U',26:'NFAULT',33:'GND'},
        pinNames:STM32F042K6U6_PINS,firmware:SAMPLE_BLDC_FW,label:[22,21.2]},
      {ref:'U3',value:'DRV8313',footprint:'HTSSOP-28',side:'top',x:44,y:27,rotation:180,mpn:'DRV8313PWPR',description:'TI 3상 하프브리지 드라이버 · VM 8–60 V · 2.5 A 피크 · RDS(on) 0.24 Ω · INx/ENx 입력',
        pins:{1:'DRV_CPL',2:'DRV_CPH',3:'DRV_VCP',4:'+12V',5:'PH_W',6:'GND',7:'GND',8:'PH_V',9:'PH_U',10:'GND',11:'+12V',14:'GND',15:'DRV_V3P3',16:'DRV_V3P3',17:'DRV_V3P3',18:'NFAULT',20:'GND',22:'EN_U',23:'IN_U',24:'EN_V',25:'IN_V',26:'EN_W',27:'IN_W',28:'GND',29:'GND'},
        pinNames:{1:'CPL',2:'CPH',3:'VCP',4:'VM',5:'OUT1',6:'PGND1',7:'PGND2',8:'OUT2',9:'OUT3',10:'PGND3',11:'VM',12:'COMPP',13:'COMPN',14:'GND',15:'V3P3',16:'nRESET',17:'nSLEEP',18:'nFAULT',19:'nCOMPO',20:'GND',21:'NC',22:'EN3',23:'IN3',24:'EN2',25:'IN2',26:'EN1',27:'IN1',28:'GND',29:'PAD'},
        model:{type:'bridge3',ron:0.24},label:[44,20.6]},
      {ref:'C8',value:'10nF',footprint:'0603',side:'bottom',x:50.6,y:23.1,rotation:90,mpn:'CL10B103KB8NNNC',description:'DRV8313 차지 펌프 (CPH–CPL)',pins:{1:'DRV_CPH',2:'DRV_CPL'},label:[52.4,23.1]},
      {ref:'C9',value:'100nF',footprint:'0603',side:'bottom',x:50.6,y:25.6,rotation:90,mpn:'CL10B104KB8NNNC',description:'DRV8313 VCP–VM 커패시터',pins:{1:'+12V',2:'DRV_VCP'},label:[52.4,25.6]},
      {ref:'C10',value:'470nF',footprint:'0603',side:'top',x:38.6,y:32.6,rotation:90,mpn:'GRM188R71C474KA88D',description:'DRV8313 V3P3 바이패스',pins:{1:'DRV_V3P3',2:'GND'},label:[37,32.6]},
      {ref:'R10',value:'10kΩ',footprint:'0603',side:'top',x:36,y:31.6,rotation:0,mpn:'RC0603FR-0710KL',description:'nFAULT 풀업 (오픈 드레인)',pins:{1:'+3V3',2:'NFAULT'},label:[36,32.7]},
      {ref:'M1',value:'42BLF01',footprint:'BLDC-2418',side:'top',x:76,y:27,rotation:0,mpn:'42BLF01 (MIKROE-4455)',description:'3상 BLDC 모터 · 정격 24 V/4000 rpm (예제는 12 V 구동) · 8극 · 홀 센서 120° · 팬 장착',
        pins:{1:'PH_U',2:'PH_V',3:'PH_W',4:'HALL1',5:'HALL2',6:'HALL3',7:'+12V',8:'GND'},pinNames:{1:'U',2:'V',3:'W',4:'H1',5:'H2',6:'H3',7:'VCC',8:'GND'},label:[76,13.5],
        model:{R:0.9,L:1.3e-3,ke:0.0177,kt:0.0175,J:7.4e-6,b:2e-6,tf:4e-3,tl:0,poles:4,gear:1,hallV:3.3}},
      {ref:'R3',value:'330Ω',footprint:'0603',side:'top',x:8,y:34,rotation:0,mpn:'RC0603FR-07330RL',description:'전원 LED 전류 제한',pins:{1:'PWR_A',2:'+3V3'}},
      {ref:'D2',value:'LED 빨강',footprint:'LED-0603',side:'top',x:8,y:30,rotation:90,mpn:'APT1608EC',description:'3.3 V 전원 표시 LED (Kingbright)',pins:{1:'GND',2:'PWR_A'},pinNames:{1:'K',2:'A'},label:[5.8,30]},
      {ref:'R4',value:'330Ω',footprint:'0603',side:'top',x:18,y:18,rotation:90,mpn:'RC0603FR-07330RL',description:'상태 LED 전류 제한',pins:{1:'STAT_A',2:'LED_ST'},label:[16.2,18]},
      {ref:'D3',value:'LED 녹색',footprint:'LED-0603',side:'top',x:18,y:14,rotation:90,mpn:'APT1608SGC',description:'MCU 상태 LED (PA4) · 회전마다 토글',pins:{1:'GND',2:'STAT_A'},pinNames:{1:'K',2:'A'},label:[16.2,14]},
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.4,inset:0.5}],
    texts:[
      {side:'top',text:'MOTION-32 BLDC',x:40,y:4,size:1.2},{side:'top',text:'v1.0',x:48.6,y:4,size:0.8,align:'left'},
      {side:'top',text:'12V',x:2.6,y:47.6,size:0.8},{side:'top',text:'PWR',x:8,y:25.6,size:0.6},{side:'top',text:'STAT',x:20,y:12,size:0.6,align:'left'},
      {side:'top',text:'U V W H1 H2 H3 + -',x:59,y:11.5,size:0.55},
      {side:'bottom',text:'MOTION-32 BLDC · DRV8313 6-STEP',x:50,y:6,size:0.9},
    ]
  };
})();
