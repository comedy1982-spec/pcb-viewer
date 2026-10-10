/* Built-in example 2: MCU-controlled DC motor with LEDs. U1 runs editable firmware that is co-simulated with the circuit. */
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
        pinNames:{1:'VDD',2:'PA0',3:'PA2',4:'PA3',5:'PA4',6:'VSS',7:'PA5',8:'VSS',9:'PB0',10:'PB3',11:'PB4',12:'PB5',13:'PB6',14:'PB7',15:'PA1',16:'PA6',17:'PA7',18:'PA8',19:'PA9',20:'PA10',21:'PA11',22:'PA12',23:'PA13',24:'VDD',25:'NRST',26:'PA14',27:'PA15',28:'PB8',29:'PB9',30:'PC14',31:'PC15',32:'BOOT0',33:'EP'},
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
