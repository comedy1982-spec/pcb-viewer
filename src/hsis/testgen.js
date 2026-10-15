/* HSIS → test case generator, kept separate per ASPICE process:
   - SWE.6 Software Qualification Test (SWQT): the integrated software on the target is tested against the HSIS (SW view of the
     HW/SW interface): pin/peripheral configuration, initial state, API behaviour, value ranges and timing, error handling.
   - SYS.4 System Integration and Integration Test (SYSIT): HW and SW integrated step by step (power/clock/reset → communication →
     I/O → function chains); each interface is verified end to end: HW connection ↔ MCU pin ↔ SW value, electrical levels,
     pull resistors, safe state during reset, timing on the wire, interaction with the counterpart part, fault injection.
   Each case carries the HSIS ID and requirement IDs for bidirectional traceability. Needs PINREC (roleOf); MCAL is optional. */
const TESTGEN=(function(){
"use strict";
const PR=typeof PINREC!=='undefined'?PINREC:(typeof require!=='undefined'?require('./pinrec.js'):null);
const MC=typeof MCAL!=='undefined'?MCAL:null;
const num=s=>{const m=String(s||'').match(/-?\d+(?:\.\d+)?/);return m?parseFloat(m[0]):null;};
function freqOf(s){const m=String(s||'').match(/(\d+(?:\.\d+)?)\s*([kKM])?\s*Hz/);return m?parseFloat(m[1])*(m[2]==='M'?1e6:m[2]?1e3:1):null;}
function rateOf(s){const m=String(s||'').match(/(\d+(?:\.\d+)?)\s*([kKM])?\s*(?:bit\/s|bps|Mbps|kbps)/i);if(!m)return null;return parseFloat(m[1])*(m[2]==='M'?1e6:m[2]?1e3:1);}
const fmtHz=f=>f>=1e6?`${+(f/1e6).toFixed(3)} MHz`:f>=1e3?`${+(f/1e3).toFixed(3)} kHz`:`${f} Hz`;
const fmtBaud=f=>f>=1e6?`${+(f/1e6).toFixed(3)} Mbit/s`:f>=1e3?`${+(f/1e3).toFixed(3)} kbit/s`:`${f} bit/s`;
const lvl=s=>/high|하이|^1$/i.test(s||'')?'High':/low|로우|^0$/i.test(s||'')?'Low':null;
const inv=l=>l==='High'?'Low':'High';
// "VBAT = ADC × 3.3 / 4095 × 5.545" → linear map raw → physical
function scaleOf(s){
  const t=String(s||'');const i=t.indexOf('=');if(i<0)return null;let e=t.slice(i+1).replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\bADC\b|\braw\b|\bx\b/gi,'X');
  if(!/X/.test(e)||/[^0-9X.*+\-/() ]/.test(e))return null;
  try{const f=new Function('X','return '+e);const a=f(0),b=f(1);if(!isFinite(a)||!isFinite(b)||b===a)return null;return{k:b-a,o:a,unit:(t.slice(0,i).trim()||'물리값')};}catch(_){return null;}
}
function rangeOf(s){const m=String(s||'').match(/(-?\d+(?:\.\d+)?)\s*[–~-]\s*(-?\d+(?:\.\d+)?)\s*V/);return m?[parseFloat(m[1]),parseFloat(m[2])]:null;}
const pins=it=>String(it.pins||'').split(/[,;\s]+/).filter(Boolean);
const sev=a=>/ASIL\s*[BCD]/i.test(a||'')?'높음':/ASIL\s*A/i.test(a||'')?'중간':'보통';
const isSafety=a=>/ASIL\s*[ABCD]/i.test(a||'');

/* ---------- config expectation from the MCU pin database (via MCAL model) ---------- */
function cfgText(M,it){
  if(!M||!M.pins)return null;const x=M.pins.find(p=>p.it===it||p.id===it.id);if(!x)return null;
  if(M.fam==='aurix'){if(!x.pi)return`${x.port}: 전용 아날로그 입력 (Port 설정 없음, EVADC ${x.o.sig})`;
    const pc=MC.aurixPC(x);return`${x.pi.pname}_IOCR${(x.pi.pin>>2)*4}.PC${x.pi.pin} = 0x${pc.toString(16).toUpperCase().padStart(2,'0')} (${x.o.sel==='IN'?'입력':x.o.sel} ${x.o.sig}${x.o.insel!=null?', 입력 선택 '+x.o.insel:''})`;}
  if(!x.pi||!x.r)return null;const md=['입력','출력','AF','아날로그'][x.r.mode];
  return`${x.pi.pname} MODER${x.pi.pin} = ${x.r.mode.toString(2).padStart(2,'0')}b (${md})${x.r.mode===2?`, AFR${x.pi.pin>7?'H':'L'}${x.pi.pin} = AF${x.r.af} (${x.o.sig})`:''}${x.r.pupd?`, PUPDR = ${x.r.pupd===1?'풀업':'풀다운'}`:''}`;
}

/* ---------- builders ---------- */
function mk(level,it,n,o){const base=String(it.id).replace(/^HSIS-?/i,'');
  return Object.assign({id:`${level==='SWE.6'?'SWQT':'SYSIT'}-${base}-${String(n).padStart(2,'0')}`,level,hsis:it.id,signal:it.signal,req:it.req||'',asil:it.asil||'',prio:sev(it.asil),
    pre:[],steps:[],env:'',method:'',kind:'',stage:''},o);}
const step=(action,expected)=>({action,expected});

function swqt(it,ctx){
  const role=PR.roleOf(it,null),out=[];let n=0;const add=o=>out.push(mk('SWE.6',it,++n,o));
  const port=it.port||'',pin=pins(it).join(', '),api=it.api||'',cfg=cfgText(ctx.M,it),mod=it.swmod||'',sc=it.swcfg||'';
  const where=`${it.signal} (${ctx.mcu}.${pin||'?'}${port?' '+port:''})`;
  const env='대상 ECU(실제 MCU) + 디버거/XCP 측정, HIL 또는 신호 발생기·오실로스코프';
  const cat=it._cat||it.cat||'';
  if(/클럭/.test(cat)){add({kind:'클럭 설정',title:`${it.signal} 클럭 설정과 PLL 고정 확인`,method:'요구사항 기반 시험',env,
      pre:['전원 인가, 디버거 연결'],steps:[step('Mcu_Init → Mcu_InitClock 실행',`클럭 설정 ${sc||'(Mcu 설정)'} 적용`),step('Mcu_GetPllStatus 반복 조회',"MCU_PLL_LOCKED 반환"),step('시스템 타이머로 1 s 측정 구간을 외부 기준과 비교',`오차 ±0.1 % 이내 (${it.elec||it.timing||'기준 주파수'})`)],pass:'PLL 고정, 주파수 오차 기준 이내'});return out;}
  if(/리셋|부트/.test(cat)){add({kind:'리셋 처리',title:`${it.signal} 리셋 원인 판별`,method:'요구사항 기반 시험',env,
      pre:['정상 동작 중'],steps:[step(`${it.signal} 핀으로 리셋 유발 (${it.active||'Low'} 펄스 ${it.timing||''})`,'MCU 재시작'),step('Mcu_GetResetReason 조회','외부(핀) 리셋으로 보고'),step('초기화 후 모든 출력 신호 상태 확인','HSIS 초기값과 일치')],pass:'리셋 원인·초기 상태가 HSIS와 일치'});return out;}
  if(!role||/전원|접지/.test(cat))return out;
  // 1. configuration / initial state
  add({kind:'설정·초기 상태',title:`${where} 포트·주변장치 설정 확인`,method:'인터페이스 시험 (설정 검토 + 레지스터 확인)',env:'대상 ECU + 디버거',
    pre:['SW 빌드(시험 대상 버전) 다운로드','Port_Init, '+(mod?mod+'_Init':'모듈 초기화')+' 완료 직후 정지'],
    steps:[step(`${port||'핀'} 포트 레지스터 확인`,cfg||`방향 ${it.dir||'-'}, 기능 ${it.func||'-'} (HSIS)`)]
      .concat(lvl(it.init)&&/OUT|출력/i.test(it.dir)?[step('출력 레벨 확인',`초기값 ${lvl(it.init)} (HSIS 초기값)`)]:[])
      .concat(sc?[step(`설정 ID ${sc} 확인`,'생성된 설정에 존재하고 위 값과 일치')]:[]),
    pass:'레지스터 값과 초기 레벨이 HSIS·SW 설정과 모두 일치'});
  // 2. role-specific behaviour
  if(role==='gpio_out'){const a=lvl(it.active)||'High';
    add({kind:'출력 동작',title:`${it.signal} ${api||'Dio_WriteChannel'} 동작`,method:'요구사항 기반 시험 · 동치 분할',env,pre:['초기화 완료'],
      steps:[step(`${api||'Dio_WriteChannel'}(${sc||it.signal}, STD_HIGH)`,`${port} 핀 High (≥ 0.8 × VDD)`),step(`${api||'Dio_WriteChannel'}(${sc||it.signal}, STD_LOW)`,`${port} 핀 Low (≤ 0.2 × VDD)`),
        step('Dio_ReadChannel로 되읽기','쓴 값과 같음'),step(`활성 레벨 확인 (활성 = ${a})`,`기능 ON 요청 시 ${a}, OFF 시 ${inv(a)}`)].concat(freqOf(it.timing)?[step(`주기 동작 측정 (${it.timing})`,`${fmtHz(freqOf(it.timing))} ±2 %`)]:[]),pass:'모든 단계 기대값 일치'});}
  if(role==='gpio_in'||role==='irq_in'||role==='cap'){
    const a=lvl(it.active),pull=/풀업/.test(it.pull||'')?'High':/풀다운/.test(it.pull||'')?'Low':null;
    add({kind:'입력 처리',title:`${it.signal} 입력 레벨 인식`,method:'요구사항 기반 시험 · 경계값',env,pre:['초기화 완료','HIL로 입력 핀 구동'],
      steps:[step('입력에 High(VDD) 인가',`${api&&/Read/.test(api)?api:'Dio_ReadChannel'} = STD_HIGH`),step('입력에 Low(0 V) 인가','STD_LOW'),step('VIH/VIL 경계(0.7/0.3 × VDD) 부근 인가','경계 밖에서는 확정값, 경계 안은 불확정 허용')]
        .concat(pull?[step('입력 개방 (구동 해제)',`${pull} 유지 (${it.pull})`)]:[]),pass:'인식값이 인가 레벨과 일치'});
    if(role==='irq_in'||role==='cap'){const edge=a==='Low'?'하강':a==='High'?'상승':'양';
      add({kind:'이벤트·타이밍',title:`${it.signal} ${role==='cap'?'캡처 측정':'인터럽트 알림'}`,method:'요구사항 기반 시험 · 타이밍 시험',env,pre:[`${mod||'Icu'} 초기화, ${role==='cap'?'Icu_StartTimestamp/Icu_StartSignalMeasurement':'Icu_EnableNotification'} 호출`],
        steps:role==='cap'?[step(`입력에 구형파 인가: 최소·정격·최대 주파수 (${it.timing||'HSIS 타이밍'})`,'측정 주기 오차 ±1 % 이내'),step('주파수 0 (정지) 유지','타임아웃 처리, 속도 0 보고'),step('최대 주파수의 120 % 인가','값 포화 또는 범위 초과 진단, 시스템 정지 없음')]
          :[step(`${edge} 에지 1회 인가`,'알림 함수 1회 호출, 지연 ≤ 50 µs'),step('반대 에지 인가','알림 없음'),step('1 kHz 펄스열 10 s','누락·중복 없음')],pass:'측정값·알림 횟수·지연이 기준 이내'});}}
  if(role==='pwm'){const f=freqOf(it.timing);
    add({kind:'PWM 출력',title:`${it.signal} PWM 주파수·듀티 (경계값)`,method:'요구사항 기반 시험 · 경계값 분석',env,pre:[`${mod||'Pwm'}_Init 완료`,'오실로스코프를 핀에 연결'],
      steps:[step(`${api||'Pwm_SetDutyCycle'}(…, 0x0000)`,'0 % — 출력 계속 Low'),step(`${api||'Pwm_SetDutyCycle'}(…, 0x4000)`,`50 % ±0.5 %, 주파수 ${f?fmtHz(f):'HSIS 값'} ±2 %`),step(`${api||'Pwm_SetDutyCycle'}(…, 0x8000)`,'100 % — 출력 계속 High'),
        step('0x0001, 0x7FFF 설정','최소·최대 분해능 듀티 출력, 글리치 없음'),step('Pwm_SetOutputToIdle',`유휴 레벨 ${lvl(it.init)||'Low'}`)],pass:'듀티 오차 ±0.5 %, 주파수 오차 ±2 % 이내'});}
  if(role==='adc'){const sc2=scaleOf(it.scale),r=rangeOf(it.elec);
    const pts=r?[r[0],(r[0]+r[1])/2,r[1]]:null;
    add({kind:'아날로그 변환',title:`${it.signal} ADC 변환값과 물리값 환산`,method:'요구사항 기반 시험 · 경계값 분석',env:'대상 ECU + 정밀 전압원(입력 커넥터 쪽 인가)',pre:[`${mod||'Adc'}_Init, ${sc||'ADC 그룹'} 설정`],
      steps:(pts&&sc2?pts.map(v=>{const raw=Math.round((v-sc2.o)/sc2.k);return step(`입력 ${v.toFixed(2)} V 인가 → ${api||'Adc_ReadGroup'}`,`원시값 ${Math.max(0,raw)} ±4 LSB, ${sc2.unit} ${v.toFixed(2)} ±1 %`);})
        :[step('0 V, 중간, 최대 입력 인가',`원시값과 ${it.scale||'변환식'} 결과가 인가값과 일치`)]).concat([step('최대 입력의 110 % 인가','포화값 처리, 범위 초과 진단(정의된 경우)'),step(`${it.timing||'샘플링 주기'} 확인`,'변환 완료 알림 주기 일치')]),pass:'모든 점에서 허용 오차 이내'});}
  if(/^spi_/.test(role)){const f=freqOf(it.timing);
    add({kind:'통신',title:`${it.signal} SPI 송수신 (${sc||'SpiExternalDevice'})`,method:'요구사항 기반 시험 · 인터페이스 시험',env:'대상 ECU + 로직 분석기',pre:['Spi_Init, 상대 장치 연결'],
      steps:[step('Spi_SetupEB + Spi_AsyncTransmit (JEDEC ID 읽기 등 알려진 명령)','상대 장치 응답 수신, Spi_GetJobResult = SPI_JOB_OK'),step(`클럭 측정`,`${f?fmtHz(f)+' 이하':'설정 보레이트'} · 모드(CPOL/CPHA) 설정과 일치`),step('CS 동작 확인','전송 동안 Low, 끝나면 High')],pass:'데이터·클럭·CS가 기대와 일치'});}
  if(/^can_/.test(role)){const r=rateOf(it.timing);
    add({kind:'통신',title:`${it.signal} CAN 송수신`,method:'요구사항 기반 시험 · 인터페이스 시험',env:'대상 ECU + CAN 인터페이스(CANoe 등)',pre:['Can_Init, 컨트롤러 START'],
      steps:[step('Can_Write로 시험 프레임 송신',`버스에서 수신, 비트 레이트 ${r?fmtBaud(r):'설정값'}`),step('외부에서 프레임 송신','수신 콜백 호출, 데이터 일치'),step('버스 오프 유발 (CAN_H–CAN_L 단락)','버스 오프 보고, 복구 절차 실행')],pass:'송수신 정상, 오류 처리 동작'});}
  if(/^uart_/.test(role)){const r=rateOf(it.timing);
    add({kind:'통신',title:`${it.signal} UART 송수신`,method:'요구사항 기반 시험',env:'대상 ECU + USB-UART',pre:['UART 초기화'],
      steps:[step('알려진 문자열 송신',`PC에서 같은 문자열 수신 (${r?fmtBaud(r):'설정 보레이트'}, 8N1)`),step('PC에서 1 kB 연속 송신','수신 버퍼 손실 없음'),step('잘못된 보레이트로 송신','프레이밍 오류 검출')],pass:'데이터 일치, 오류 검출'});}
  if(/^i2c_/.test(role)){add({kind:'통신',title:`${it.signal} I2C 전송`,method:'요구사항 기반 시험',env:'대상 ECU + 로직 분석기',pre:['I2C 초기화'],
      steps:[step('알려진 장치 레지스터 읽기','ACK 및 값 일치'),step(`SCL 주파수 측정`,`${it.timing||'설정값'} 이하`),step('존재하지 않는 주소 접근','NACK 오류 보고')],pass:'전송·오류 처리 정상'});}
  if(/^usb_/.test(role)){add({kind:'통신',title:`${it.signal} USB 열거`,method:'요구사항 기반 시험',env:'대상 ECU + PC',pre:['USB 스택 초기화'],
      steps:[step('PC에 연결','열거 완료, 장치 설명자 일치'),step('분리 후 재연결','재열거')],pass:'열거 정상'});}
  // 3. robustness / error handling for safety-relevant or driver API signals
  if(isSafety(it.asil)||/Pwm|Dio|Adc|Icu|Spi|Can/i.test(mod)){
    add({kind:'오류 처리',title:`${it.signal} 잘못된 호출·진단 처리`,method:'결함 주입 (SW) · 오류 추정',env:'대상 ECU + 디버거 (DET 활성화 빌드)',pre:['개발 오류 검출(DET) 활성'],
      steps:[step(`${mod||'모듈'} 초기화 전에 ${api||'API'} 호출`,`DET에 ${(mod||'MODULE').toUpperCase()}_E_UNINIT 보고, 출력 변화 없음`),step('잘못된 채널 ID로 호출',`${(mod||'MODULE').toUpperCase()}_E_PARAM_CHANNEL 등 파라미터 오류 보고`)]
        .concat(isSafety(it.asil)?[step('신호 값 고정·범위 이탈 주입 (디버거로 변수 강제)','타당성 진단 검출, 안전 상태 진입 (요구사항 정의에 따름)')]:[]),pass:'정의된 오류 보고·안전 반응 확인'});}
  return out;
}

function sysit(it,ctx){
  const role=PR.roleOf(it,null),out=[];let n=0;const cat=it._cat||it.cat||'';
  const stage=/전원|접지/.test(cat)?'S1':/클럭|리셋|부트/.test(cat)?'S1':/통신/.test(cat)?'S2':'S3';
  const add=o=>out.push(mk('SYS.4',it,++n,Object.assign({stage},o)));
  const pin=pins(it).join(', '),port=it.port||'',hw=it.hw||'',net=it.net||'';
  const path=`${hw||'HW 연결'} → 넷 ${net||'-'} → ${ctx.mcu}.${pin||'?'}${port?' ('+port+')':''}`;
  const env='통합 시료(보드 + SW) + 오실로스코프·멀티미터·전원 공급기';
  if(/전원/.test(cat)){const v=num(it.elec);
    add({kind:'전원',title:`${it.signal} 전원 레일 전압·리플`,method:'인터페이스 시험 (전기적 측정)',env,pre:['정격 입력 전압 인가, SW 정상 동작'],
      steps:[step(`MCU ${pin} 핀에서 전압 측정`,`${it.elec||'정격 전압'}`),step('최소·최대 입력 전압에서 반복','허용 범위 유지'),step('부하 최대(모든 출력 ON, 통신 동작)에서 리플 측정',`리플 ≤ ${v?(v*0.02).toFixed(2)+' V':'2 %'}`)],pass:'전 조건에서 허용 범위 이내'});return out;}
  if(/접지/.test(cat)){add({kind:'접지',title:`${it.signal} 접지 연결·노이즈`,method:'인터페이스 시험',env,pre:['보드 전원 OFF'],
      steps:[step(`${pin} 핀과 ${hw||'GND 기준점'} 사이 저항 측정`,'≤ 0.1 Ω'),step('동작 중 GND 전위차 측정 (MCU ↔ 커넥터)','≤ 50 mV')],pass:'기준 이내'});return out;}
  if(/클럭/.test(cat)){add({kind:'클럭',title:`${it.signal} 발진·기동 시간`,method:'인터페이스 시험',env,pre:['전원 인가'],
      steps:[step('전원 투입 후 발진 기동 시간 측정','데이터시트 기동 시간 이내'),step('클럭 출력(또는 SW 측정 주기)으로 주파수 확인',`${it.elec||it.timing||'정격'} ±50 ppm`),step('-40/25/85 °C에서 반복 (해당 시)','발진 유지')],pass:'발진·주파수 정상'});return out;}
  if(/리셋|부트/.test(cat)){add({kind:'리셋·부트',title:`${it.signal} 리셋·부트 신호`,method:'인터페이스 시험',env,pre:['보드 조립 완료'],
      steps:[step(`${it.signal} 정상 상태 레벨 측정`,`${it.pull||'풀업/풀다운'}에 따른 비활성 레벨`),step(`${it.hw||'리셋 소스'}로 ${it.active||''} 펄스 인가 ${it.timing||''}`,'MCU 리셋 후 정상 기동'),step('전원 투입 시 파형 측정','전원 안정 후 리셋 해제')],pass:'리셋·부트 동작 정상'});return out;}
  if(!role)return out;
  const isOut=/OUT|출력/i.test(it.dir)&&!/입력/.test(it.dir),isIn=/입력|^IN/i.test(it.dir);
  // 1. signal path continuity HW ↔ MCU ↔ SW
  add({kind:'신호 경로',title:`${it.signal} 신호 경로 연속성 (HW ↔ MCU ↔ SW)`,method:'인터페이스 시험',env,pre:['통합 SW 동작, 시험용 진단 서비스 또는 디버거로 SW 값 확인'],
    steps:isOut?[step(`SW에서 ${it.signal}를 활성으로 설정`,`${hw||'상대 부품 핀'}에서 활성 레벨 측정 (${lvl(it.active)||'High'})`),step('SW에서 비활성으로 설정',`${hw||'상대 부품 핀'}에서 ${inv(lvl(it.active)||'High')}`)]
      :role==='adc'?[step(`${hw||'입력 단자'}에 알려진 전압 인가`,`SW 물리값이 인가값과 ±2 % 이내 (${it.scale||'변환식'})`)]
      :[step(`${hw||'입력 단자'}에서 High/Low 인가`,'SW가 같은 논리값을 읽음')],
    pass:`경로 ${path}가 끊김·교차 없이 동작`,note:path});
  // 2. electrical characteristics
  const el=[];
  if(isOut)el.push(step(`출력 High/Low 레벨을 ${hw||'수신 측'}에서 측정`,`수신 부품 VIH/VIL 만족 (${it.elec||'3.3 V 로직'})`));
  if(isIn)el.push(step(`${hw||'구동 측'} 출력 레벨 측정`,`MCU VIH/VIL 만족${/5\s*V/.test(it.elec||'')?' · 5 V 입력이면 클램프/분압 확인':''}`));
  if(/외부\s*풀업|외부\s*풀다운/.test(it.pull||''))el.push(step(`외부 ${/업/.test(it.pull)?'풀업':'풀다운'} 저항 확인`,`${it.pull} — 실장 부품 값과 일치, MCU 비구동 시 ${/업/.test(it.pull)?'High':'Low'}`));
  if(/mA/.test(it.elec||''))el.push(step('부하 전류 측정',`${it.elec}`));
  if(el.length)add({kind:'전기적 특성',title:`${it.signal} 전기적 특성`,method:'인터페이스 시험 (전기적 측정)',env,pre:['통합 SW 동작'],steps:el,pass:'측정값이 HSIS 전기적 특성과 상대 부품 데이터시트 범위 이내'});
  // 3. state during power-up / reset (before Port_Init) — safety for outputs
  if(isOut)add({kind:'전원 인가·리셋 상태',title:`${it.signal} 전원 인가·리셋 중 출력 상태`,method:'인터페이스 시험 · 안전 분석 기반',env,pre:['전원 OFF 상태에서 프로브 연결'],
    steps:[step('전원 투입 → Port_Init 전까지 레벨 기록',`안전 상태 유지 (${lvl(it.init)||'정의된 초기값'}${/풀/.test(it.pull||'')?', '+it.pull:''}), ${hw||'상대 부품'} 오동작 없음`),step('외부 리셋 인가 중 레벨 기록','리셋 동안 안전 상태'),step('Port_Init 직후',`HSIS 초기값 ${lvl(it.init)||'-'}`)],
    pass:'전 구간에서 의도하지 않은 활성화 없음'});
  // 4. timing / protocol on the wire
  const f=freqOf(it.timing),r=rateOf(it.timing);
  if(role==='pwm'&&f)add({kind:'타이밍',title:`${it.signal} PWM 실측 (${hw||'상대 부품'} 입력)`,method:'인터페이스 시험',env,pre:['통합 SW, 시험 듀티 50 %'],
    steps:[step(`${hw||'상대 부품 입력'}에서 주파수·듀티 측정`,`${fmtHz(f)} ±2 %, 50 % ±1 %`),step('상승·하강 시간, 링잉 측정','수신 부품 입력 규격 이내')],pass:'규격 이내'});
  if(/^(can|uart|spi|i2c)_/.test(role)&&(r||f))add({kind:'타이밍',title:`${it.signal} ${role.split('_')[0].toUpperCase()} 실측`,method:'인터페이스 시험',env:env+' · 버스 분석기',pre:['통합 SW 통신 동작'],
    steps:[step('버스 파형·비트 타이밍 측정',`${r?fmtBaud(r):fmtHz(f)} (허용 오차는 프로토콜 규격)`),step('상대 장치와 연속 통신 10분','오류 프레임·재전송 0')],pass:'프로토콜 규격 만족'});
  if((role==='cap'||role==='irq_in')&&it.timing)add({kind:'타이밍',title:`${it.signal} 입력 응답`,method:'인터페이스 시험',env,pre:['통합 SW 동작'],
    steps:[step(`${hw||'입력원'}에서 신호 발생 (${it.timing})`,'SW 인식 지연·주기 측정이 요구 이내')],pass:'요구 응답 시간 만족'});
  // 5. fault injection for safety-relevant signals
  if(isSafety(it.asil))add({kind:'결함 주입',title:`${it.signal} 단선·단락 결함 주입`,method:'결함 주입 시험',env:env+' · 결함 주입 박스',pre:['통합 SW 동작, 진단 활성'],
    steps:[step(`${hw||'신호선'} 단선`,'진단 검출 또는 안전 상태 진입, 진단 코드 기록'),step('GND 단락','검출·안전 상태, 부품 손상 없음'),step('전원 단락','검출·안전 상태, 부품 손상 없음'),step('결함 제거 후 복구 절차','요구사항에 따른 복구')],
    pass:'모든 결함에서 정의된 안전 반응',stage:'S4'});
  return out;
}

/* function-chain cases: all signals that meet at one counterpart part are integrated together (stage S4) */
function chains(H,ctx){
  const by={};H.items.forEach(it=>{if(/전원|접지|클럭|리셋|부트/.test(it._cat||it.cat||''))return;const m=String(it.hw||'').match(/\b([A-Z]{1,3}\d+)(?:\.|\b)/);if(!m||m[1]===ctx.mcu)return;(by[m[1]]=by[m[1]]||[]).push(it);});
  const out=[];let k=0;
  Object.entries(by).filter(([,v])=>v.length>=2).forEach(([ref,its])=>{const c=ctx.B&&ctx.B.byRef[ref];const name=c?`${ref} ${c.val||''}`.trim():ref;
    const outs=its.filter(i=>/출력/.test(i.dir)),ins=its.filter(i=>/입력/.test(i.dir));
    const asil=its.map(i=>i.asil).find(isSafety)||its[0].asil||'';
    out.push({id:`SYSIT-CH-${String(++k).padStart(2,'0')}`,level:'SYS.4',stage:'S4',hsis:its.map(i=>i.id).join(', '),signal:its.map(i=>i.signal).join(', '),req:[...new Set(its.map(i=>i.req).filter(Boolean))].join(', '),asil,prio:sev(asil),
      kind:'기능 체인',title:`${name} 기능 체인 통합 (${its.length}개 신호)`,method:'기능 시험 · 인터페이스 시험',env:'통합 시료 + 실제 부하(또는 부하 모의기) + 다채널 오실로스코프',
      pre:[`S1–S3 통합 시험 통과`,`${name}와 부하 연결`],
      steps:[step(`${outs.map(i=>i.signal).join(', ')||'출력'}을 요구 동작 순서로 구동`,`${name}가 요구사항대로 동작, 신호 간 순서·지연 확인`)]
        .concat(ins.length?[step(`${ins.map(i=>i.signal).join(', ')} 피드백 기록`,'출력 동작과 일관된 피드백')]:[])
        .concat([step('정상 동작 중 상대 부품 결함 상태 유발 (예: 과전류·통신 단절)','SW가 검출해 안전 상태로 전환'),step('정격 부하로 30분 연속 동작','온도·전류·오류 카운터 기준 이내')]),
      pass:'기능 체인이 요구사항대로 동작하고 결함 시 안전 반응'});});
  return out;
}

/* mandatory-content checklists */
function checklist(level,cases,H){
  const sw=H.items.filter(i=>PR.roleOf(i,null)),all=H.items;const has=(it,kind)=>cases.some(c=>c.hsis.split(', ').includes(it.id)&&c.kind===kind);
  const row=(title,why,targets,okFn)=>{const miss=targets.filter(t=>!okFn(t));return{title,why,total:targets.length,ok:targets.length-miss.length,miss:miss.map(t=>t.id)};};
  if(level==='SWE.6')return[
    row('설정·초기 상태 검증','SWE.6 BP2 · HSIS의 포트·주변장치 설정과 초기값이 SW에 반영됐는지',sw,i=>has(i,'설정·초기 상태')),
    row('출력 동작 검증 (Dio/Pwm)','SWE.6 BP2 · 출력 API가 요구 레벨·듀티를 내는지',sw.filter(i=>/gpio_out|pwm/.test(PR.roleOf(i,null))),i=>has(i,'출력 동작')||has(i,'PWM 출력')),
    row('입력 처리 검증 (Dio/Adc/Icu)','SWE.6 BP2 · 입력·변환값이 경계값까지 맞는지',sw.filter(i=>/gpio_in|irq_in|cap|adc/.test(PR.roleOf(i,null))),i=>has(i,'입력 처리')||has(i,'아날로그 변환')),
    row('타이밍·통신 속도 검증','SWE.6 BP2 · HSIS 타이밍 열(주파수·보레이트)',sw.filter(i=>freqOf(i.timing)||rateOf(i.timing)),i=>has(i,'PWM 출력')||has(i,'통신')||has(i,'이벤트·타이밍')||has(i,'아날로그 변환')||has(i,'출력 동작')),
    row('오류 처리 검증 (DET·안전 반응)','SWE.6 BP2 · ASIL 신호의 오류·진단 반응',sw.filter(i=>isSafety(i.asil)),i=>has(i,'오류 처리')),
    row('요구사항 추적성','SWE.6 BP5 · 시험 케이스 ↔ 요구사항 양방향 연결',all.filter(i=>cases.some(c=>c.hsis.split(', ').includes(i.id))),i=>!!i.req),
  ];
  return[
    row('통합 단계별 시험 (S1 전원·클럭·리셋)','SYS.4 BP1·BP3 · 통합 전략의 첫 단계',all.filter(i=>/전원|접지|클럭|리셋|부트/.test(i._cat||i.cat||'')),i=>cases.some(c=>c.hsis===i.id&&c.stage==='S1')),
    row('신호 경로 연속성 (HW ↔ MCU ↔ SW)','SYS.4 BP3 · 시스템 요소 간 인터페이스',sw,i=>has(i,'신호 경로')),
    row('전기적 특성 (레벨·풀업·전류)','SYS.4 BP3 · HSIS 전기적 특성·풀업 열',sw.filter(i=>/출력|입력/.test(i.dir)),i=>has(i,'전기적 특성')),
    row('전원 인가·리셋 중 안전 상태','SYS.4 BP3 · 출력이 Port_Init 전에 오동작하지 않는지',sw.filter(i=>/출력/.test(i.dir)&&!/입력/.test(i.dir)),i=>has(i,'전원 인가·리셋 상태')),
    row('타이밍·프로토콜 실측','SYS.4 BP3 · 배선 위에서 잰 주파수·비트 타이밍',sw.filter(i=>(freqOf(i.timing)||rateOf(i.timing))&&/pwm|can|uart|spi|i2c|cap|irq/.test(PR.roleOf(i,null))),i=>has(i,'타이밍')),
    row('결함 주입 (ASIL 신호)','SYS.4 BP3 · 단선·단락 시 안전 반응',sw.filter(i=>isSafety(i.asil)),i=>has(i,'결함 주입')),
    row('기능 체인 통합 (상대 부품별)','SYS.4 BP1·BP5 · 같은 부품에 모이는 신호를 함께 통합',sw.filter(i=>{const r=(String(i.hw||'').match(/\b([A-Z]{1,3}\d+)/)||[])[1];return r&&sw.filter(j=>(String(j.hw||'').match(/\b([A-Z]{1,3}\d+)/)||[])[1]===r).length>=2;}),i=>cases.some(c=>c.kind==='기능 체인'&&c.hsis.split(', ').includes(i.id))),
    row('요구사항 추적성','SYS.4 BP7 · 시험 케이스 ↔ 시스템 요구사항·HSIS',all.filter(i=>cases.some(c=>c.hsis.split(', ').includes(i.id))),i=>!!i.req),
  ];
}
const STAGES={S1:'S1 전원·클럭·리셋',S2:'S2 MCU ↔ 통신 장치',S3:'S3 디지털·아날로그 I/O',S4:'S4 기능 체인·결함 주입'};

function generate(B,H,mcuRef){
  let M=null;if(MC&&B&&B.byRef[mcuRef]){try{const g=MC.model(B,H,mcuRef);if(!g.error){MC.portRegs(g);M=g;}}catch(e){}}
  const ctx={B,M,mcu:mcuRef||'MCU'};
  H.items.forEach(i=>{if(!i._cat&&typeof HSIS!=='undefined')i._cat=HSIS.category(i);});
  const sw=H.items.flatMap(it=>swqt(it,ctx));
  const si=H.items.flatMap(it=>sysit(it,ctx)).concat(chains(H,ctx));
  const order={S1:1,S2:2,S3:3,S4:4};si.sort((a,b)=>order[a.stage]-order[b.stage]||a.id.localeCompare(b.id,undefined,{numeric:true}));
  const noReq=H.items.filter(i=>!i.req).map(i=>i.id);
  return{swqt:sw,sysit:si,check:{swqt:checklist('SWE.6',sw,H),sysit:checklist('SYS.4',si,H)},stages:STAGES,noReq,
    trace:H.items.map(i=>({hsis:i.id,signal:i.signal,req:i.req||'',swqt:sw.filter(c=>c.hsis===i.id).map(c=>c.id),sysit:si.filter(c=>c.hsis.split(', ').includes(i.id)).map(c=>c.id)}))};
}
// flat rows for spreadsheets
const COLS=['테스트 ID','시험 수준','통합 단계','분류','제목','HSIS ID','신호','요구사항 ID','ASIL','우선순위','시험 기법','시험 환경','사전 조건','절차','기대 결과','합격 기준','비고'];
function rows(cases,stages){return cases.map(c=>[c.id,c.level,c.stage?(stages||STAGES)[c.stage]:'',c.kind,c.title,c.hsis,c.signal,c.req,c.asil,c.prio,c.method,c.env,c.pre.join('\n'),
  c.steps.map((s,i)=>`${i+1}. ${s.action}`).join('\n'),c.steps.map((s,i)=>`${i+1}. ${s.expected}`).join('\n'),c.pass||'',c.note||'']);}
return{generate,rows,COLS,STAGES,scaleOf,freqOf,rateOf};
})();
if(typeof module!=='undefined')module.exports=TESTGEN;
