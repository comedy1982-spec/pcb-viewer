/* HSIS → test case generator, split by the boundary "how is it measured / which layer is verified":
   - SYS.4 System Integration Test (SYSITS): needs physical instruments (oscilloscope, multimeter, power supply, bus analyser) —
     electrical characteristics, waveforms, HW–SW physical consistency (divider/RC path, PWM frequency/slew/dead-time/reset
     glitches, FTTI physical delay, SPI/CAN physical layer, power hold and watchdog reset waveforms, full-load endurance).
   - SWE.6 Software Qualification Test (SWQT): SW view only, through a debugger (TRACE32), HIL or XCP with physical error
     excluded — formulas and raw-value boundaries, debouncing, hysteresis, state transitions, timing logic, duty clamping,
     safe-state machine/latch/DTC, communication error handling, watchdog window and shutdown, MCU resources (RAM/Flash/stack/MPU/CPU load).
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
const DOM={adc:'1. 아날로그 입력',dio:'2. 디지털 & PWM',safe:'3. 안전 & 인터럽트',com:'4. 통신',pwr:'5. 전원 & PMIC',res:'6. MCU 리소스'};
const TOOL={sw:'TRACE32 디버거 · XCP(CANape/INCA) · HIL',hw:'오실로스코프 · 멀티미터 · 파워 서플라이 · 버스 분석기'};
const domainOf=(role,cat)=>/전원|접지|클럭|리셋|부트/.test(cat||'')?DOM.pwr:role==='adc'?DOM.adc:role==='irq_in'?DOM.safe:/^(spi|can|uart|i2c|usb)_/.test(role||'')?DOM.com:DOM.dio;
function mk(level,it,n,o){const base=String(it.id).replace(/^HSIS-?/i,'');
  return Object.assign({id:`${level==='SWE.6'?'SWQT':'SYSIT'}-${base}-${String(n).padStart(2,'0')}`,level,hsis:it.id,signal:it.signal,req:it.req||'',asil:it.asil||'',prio:sev(it.asil),
    pre:[],steps:[],env:'',method:'',kind:'',stage:'',domain:'',tool:level==='SWE.6'?TOOL.sw:TOOL.hw},o);}
const step=(action,expected)=>({action,expected});
const SWENV='대상 ECU(통합 SW) + TRACE32 디버거 · XCP 측정 · HIL(입력 주입) — 물리 계측 없음';
const fx=v=>{if(Math.abs(v)<0.005)v=0;return Number.isInteger(v)?String(v):v.toFixed(2);};

/* SWE.6 — SW logic only (no oscilloscope/multimeter) */
function swqt(it,ctx){
  const role=PR.roleOf(it,null),out=[];let n=0;const cat=it._cat||it.cat||'';const dom=domainOf(role,cat);
  const add=o=>out.push(mk('SWE.6',it,++n,Object.assign({domain:dom,env:SWENV},o)));
  const port=it.port||'',pin=pins(it).join(', '),api=it.api||'',cfg=cfgText(ctx.M,it),mod=it.swmod||'',sc=it.swcfg||'',MOD=(mod||'MODULE').toUpperCase();
  const where=`${it.signal} (${ctx.mcu}.${pin||'?'}${port?' '+port:''})`;
  if(/클럭/.test(cat)){add({kind:'클럭 설정',title:`${it.signal} 클럭 설정·PLL 상태 로직`,method:'요구사항 기반 시험 (디버거)',
      pre:['리셋 직후 정지'],steps:[step('Mcu_Init → Mcu_InitClock 실행 후 클럭 레지스터 조회',`설정 ${sc||'McuClockSetting'} 값과 일치`),step('Mcu_GetPllStatus 조회','MCU_PLL_LOCKED'),step('PLL 미고정 상태 강제(디버거) 후 Mcu_DistributePllClock 호출','E_NOT_OK, PLL 분배 안 함')],pass:'설정·상태 판단 로직이 요구와 일치'});return out;}
  if(/리셋|부트/.test(cat)){add({kind:'리셋 원인·초기화',title:`${it.signal} 리셋 원인 판별과 재초기화`,method:'요구사항 기반 시험 (디버거)',
      pre:['정상 동작 중'],steps:[step('HIL로 외부 리셋 유발 후 Mcu_GetResetReason 조회','외부(핀) 리셋으로 판별'),step('워치독·SW 리셋을 각각 유발','각 원인으로 구분 기록'),step('재초기화 후 SW 상태 변수 확인','초기 상태 머신·출력 요청값이 HSIS 초기값과 일치')],pass:'리셋 원인별 처리 로직이 요구와 일치'});return out;}
  if(!role||/전원|접지/.test(cat))return out;
  // configuration as the SW sees it (registers read with the debugger)
  add({kind:'설정·초기 상태',title:`${where} 설정 레지스터와 초기 요청값`,method:'인터페이스 시험 (디버거 레지스터 조회)',
    pre:['Port_Init'+(mod?', '+mod+'_Init':'')+' 직후 정지 (TRACE32)'],
    steps:[step(`${port||'핀'} 설정 레지스터 조회`,cfg||`방향 ${it.dir||'-'}, 기능 ${it.func||'-'} (HSIS)`)]
      .concat(lvl(it.init)&&/OUT|출력/i.test(it.dir)?[step('출력 레지스터(OMR/ODR) 조회',`초기값 ${lvl(it.init)}`)]:[])
      .concat(sc?[step(`설정 ID ${sc} 조회`,'생성 설정에 존재하고 위 값과 일치')]:[]),
    pass:'레지스터·초기 요청값이 HSIS·SW 설정과 일치'});
  if(role==='gpio_out'){const a=lvl(it.active)||'High',f=freqOf(it.timing);
    add({kind:'출력 로직',title:`${it.signal} 출력 요청 → 레지스터 갱신`,method:'요구사항 기반 시험 · 동치 분할',pre:['초기화 완료'],
      steps:[step(`기능 ON 요청 (상위 SW 인터페이스 또는 ${api||'Dio_WriteChannel'})`,`출력 레지스터 비트 = ${a} (활성 레벨)`),step('기능 OFF 요청',`출력 레지스터 비트 = ${inv(a)}`),step('Dio_ReadChannel 되읽기','요청값과 일치')]
        .concat(f?[step(`주기 동작 로직 (${it.timing}) — XCP로 토글 시점 기록`,`주기 ${fmtHz(f)}, 태스크 지터 ±1 태스크 주기 이내`)]:[]),pass:'요청 → 레지스터 반영이 요구와 일치'});}
  if(role==='gpio_in'||role==='cap'){
    add({kind:'입력 디바운스·상태',title:`${it.signal} 입력 디바운스·상태 판정`,method:'요구사항 기반 시험 · 경계값(시간)',pre:['초기화 완료','HIL 디지털 출력으로 논리값 주입 (또는 디버거로 포트 입력 레지스터 강제)'],
      steps:[step('디바운스 시간 T_deb 동안 유지 후 해제 (T_deb는 SW 요구사항 값)','상태 변화 없음 (채터링 무시)'),step('T_deb + 1 태스크 주기 이상 유지','상태 확정, 상태 변수 갱신'),step('T_deb 경계 직전·직후 유지 시간으로 반복','경계 직전 미확정, 직후 확정')]
        .concat(role==='cap'?[step(`주파수 입력을 HIL로 주입: 최소·정격·최대 (${it.timing||'HSIS'})`,'SW 계산 속도/주기 값 오차 ±1 % (계산식 정밀도)'),step('입력 정지','타임아웃 후 속도 0 판정')]:[]),
      pass:'디바운스·상태 판정 로직이 요구와 일치'});}
  if(role==='irq_in'){const edge=lvl(it.active)==='Low'?'하강':'상승';
    add({kind:'Safe State 전이',title:`${it.signal} 인터럽트 → Safe State 상태 머신`,method:'요구사항 기반 시험 · 상태 전이 시험',domain:DOM.safe,pre:['정상 동작 상태(예: 구동 중)','HIL로 입력 에지 주입'],
      steps:[step(`${edge} 에지 주입 → 인터럽트 진입`,'ISR 실행, 고장 플래그 설정 (XCP 확인)'),step('상태 머신 조회','Safe State로 전이, 관련 출력 요청 OFF'),step('입력을 정상으로 되돌림','래치 유지 — 자동 복귀하지 않음'),
        step('DTC 조회 (Dem)','해당 DTC 기록, 상태 바이트 Confirmed'),step('정의된 복구 조건(예: 재시동/진단 해제) 수행','래치 해제, 정상 상태 복귀')],pass:'전이·래치·DTC 기록이 안전 요구와 일치'});}
  if(role==='pwm'){const f=freqOf(it.timing);
    add({kind:'Duty 요청·Clamping',title:`${it.signal} Duty 요청 → 레지스터 갱신과 상하한 제한`,method:'요구사항 기반 시험 · 경계값 분석',pre:[`${mod||'Pwm'}_Init 완료`,'디버거로 타이머 비교 레지스터 관찰'],
      steps:[step(`${api||'Pwm_SetDutyCycle'}(0x0000 / 0x4000 / 0x8000)`,`비교 레지스터 = 0 / 주기의 50 % / 주기 (주기 레지스터는 ${f?fmtHz(f):'설정 주파수'}에 해당)`),
        step('목표 Duty를 최소 허용값 −1, 최대 허용값 +1로 요청 (상위 SW)','상하한으로 Clamping, 범위 밖 값이 레지스터에 쓰이지 않음'),step('0x8001 이상 값 직접 호출','DET 파라미터 오류 또는 100 % 제한'),
        step('Pwm_SetOutputToIdle','유휴 레벨 요청 반영')],pass:'Duty 계산·Clamping·레지스터 반영이 요구와 일치'});}
  if(role==='adc'){const sc2=scaleOf(it.scale),r=rangeOf(it.elec);const steps=[];
    if(sc2){const pts=r?[r[0],r[1]]:[];
      [...pts].forEach(v=>{const raw=Math.round((v-sc2.o)/sc2.k);const rs=[raw-1,raw,raw+1].filter(x=>x>=0&&x<=4095);steps.push(step(`HIL/스텁으로 원시값 ${rs.join(' · ')} 주입 (${sc2.unit} ${fx(v)} 경계)`,`환산값 ${rs.map(x=>fx(sc2.o+sc2.k*x)).join(' · ')}, 범위 판정이 경계에서 바뀜`));});
      steps.push(step('원시값 0과 최대(4095) 주입','하한·상한 진단 판정, 환산 오버플로 없음'));}
    else steps.push(step('원시값 경계(임계값 −1 / 임계값 / +1 LSB) 주입',`${it.scale||'변환식'} 결과와 판정이 경계에서 바뀜`));
    steps.push(step('임계값을 넘는 값을 디바운스 시간 T_deb 미만/이상 유지','미만은 무시, 이상이면 진단 확정 (T_deb는 SW 요구사항 값)'),step('확정 뒤 임계값 − 히스테리시스 폭 경계로 복귀','히스테리시스 폭 이상 내려가야 해제'));
    add({kind:'ADC 수식·진단',title:`${it.signal} ADC 원시값 경계(BVA)·디바운스·히스테리시스`,method:'요구사항 기반 시험 · 경계값 분석',domain:DOM.adc,pre:[`${mod||'Adc'}_Init, ${sc||'ADC 그룹'} 설정`,'원시값은 HIL 또는 Adc 결과 버퍼 스텁으로 주입 (물리 오차 배제)','경계는 HSIS 전기적 특성 범위 — SW 요구사항에 진단 임계값이 있으면 그 값으로 교체'],steps,pass:'수식 정밀도(±1 LSB)·디바운스·히스테리시스 로직이 요구와 일치'});}
  if(/^(spi|can|uart|i2c)_/.test(role)){const b=role.split('_')[0].toUpperCase();
    const st=b==='CAN'?[step('주기 수신 메시지를 HIL에서 중단','수신 Timeout 검출(설정 시간), 대체값 사용, 통신 고장 진단'),step('E2E CRC 오류 프레임 주입','CRC 오류 카운트, 데이터 폐기'),step('Alive Counter 정지·건너뜀 주입','시퀀스 오류 검출, 허용 횟수 초과 시 고장 확정'),step('Bus-off 상태 강제 (Can 상태 조작)','복구 절차(재시작 간격·횟수) 수행, DTC 기록')]
      :b==='SPI'?[step('상대 장치 응답 없음 (HIL 또는 스텁으로 Spi_GetJobResult = SPI_JOB_FAILED)','재시도 N회 후 통신 고장 진단'),step('수신 데이터 CRC/패리티 오류 주입 (해당 시)','데이터 폐기·오류 카운트'),step('정상 복귀','오류 카운트 감소·고장 해제 조건')]
      :b==='UART'?[step('프레이밍·오버런 오류 주입','오류 카운트, 수신 버퍼 복구'),step('응답 Timeout','재시도 후 고장 판정')]:[step('NACK·버스 고착 주입','재시도·버스 복구 로직, 고장 판정')];
    add({kind:'통신 오류 처리',title:`${it.signal} ${b} 오류 처리 (Timeout·CRC·재시도)`,method:'결함 주입 (SW) · 요구사항 기반 시험',domain:DOM.com,pre:[`${b} 드라이버 초기화, 정상 통신 중`],steps:st,pass:'오류 검출·재시도·고장 진단 로직이 요구와 일치'});}
  if(isSafety(it.asil)&&role!=='irq_in')add({kind:'안전 진단',title:`${it.signal} 타당성 진단과 Safe State`,method:'결함 주입 (SW) · 상태 전이 시험',domain:DOM.safe,pre:['정상 동작 중'],
    steps:[step(`디버거로 ${it.signal} 관련 SW 신호를 고정·범위 이탈 값으로 강제`,'타당성 진단 검출'),step('상태 머신 조회','Safe State 전이, DTC 기록'),step(`${MOD}_E_PARAM 계열 잘못된 호출`,`DET에 ${MOD} 파라미터 오류 보고`)],pass:'진단·전이·DTC가 안전 요구와 일치'});
  return out;
}

/* SYS.4 — physical measurement of the integrated HW + SW */
function sysit(it,ctx){
  const role=PR.roleOf(it,null),out=[];let n=0;const cat=it._cat||it.cat||'';
  const stage=/전원|접지|클럭|리셋|부트/.test(cat)?'S1':/통신/.test(cat)?'S2':'S3';const dom=domainOf(role,cat);
  const add=o=>out.push(mk('SYS.4',it,++n,Object.assign({stage,domain:dom},o)));
  const pin=pins(it).join(', '),port=it.port||'',hw=it.hw||'',net=it.net||'';
  const path=`${hw||'HW 연결'} → 넷 ${net||'-'} → ${ctx.mcu}.${pin||'?'}${port?' ('+port+')':''}`;
  const env='통합 시료(보드 + 양산 SW) + 오실로스코프 · 멀티미터 · 파워 서플라이';
  if(/전원/.test(cat)){const v=num(it.elec);
    add({kind:'전원 레일',title:`${it.signal} 전원 레일 전압·리플 실측`,method:'인터페이스 시험 (전기적 측정)',env,pre:['정격 입력 전압 인가, SW 정상 동작'],
      steps:[step(`MCU ${pin} 핀 전압 측정 (멀티미터)`,`${it.elec||'정격 전압'}`),step('최소·최대 입력 전압에서 반복 (파워 서플라이)','허용 범위 유지'),step('전 부하(모든 출력 ON, 통신 동작)에서 리플 측정 (오실로스코프)',`리플 ≤ ${v?(v*0.02).toFixed(2)+' V':'2 %'}`)],pass:'전 조건에서 허용 범위 이내'});return out;}
  if(/접지/.test(cat)){add({kind:'접지',title:`${it.signal} 접지 저항·전위차 실측`,method:'인터페이스 시험',env,pre:['전원 OFF / ON'],
      steps:[step(`${pin} 핀 ↔ ${hw||'GND 기준점'} 저항 측정`,'≤ 0.1 Ω'),step('동작 중 MCU GND ↔ 커넥터 GND 전위차 측정','≤ 50 mV')],pass:'기준 이내'});return out;}
  if(/클럭/.test(cat)){add({kind:'클럭',title:`${it.signal} 발진 기동·주파수 실측`,method:'인터페이스 시험',env,pre:['전원 인가'],
      steps:[step('전원 투입 후 발진 기동 시간 측정 (오실로스코프)','데이터시트 기동 시간 이내'),step('클럭 출력 핀 또는 주파수 카운터로 측정',`${it.elec||it.timing||'정격'} ±50 ppm`)],pass:'발진·주파수 정상'});return out;}
  if(/리셋|부트/.test(cat)){add({kind:'리셋 파형',title:`${it.signal} 리셋 파형·풀업 실측`,method:'인터페이스 시험',env,pre:['보드 조립 완료'],
      steps:[step(`${it.signal} 비활성 레벨·풀업 측정`,`${it.pull||'풀업/풀다운'}에 따른 레벨`),step(`${it.hw||'리셋 소스'}로 리셋 인가, 펄스 폭 측정`,`${it.timing||'최소 펄스 폭'} 이상, MCU 재기동`),step('전원 투입 시 전원 대비 리셋 해제 시점 측정','전원 안정 후 해제')],pass:'리셋 파형 규격 만족'});return out;}
  if(!role)return out;
  const isOut=/OUT|출력/i.test(it.dir)&&!/입력/.test(it.dir),isIn=/입력|^IN/i.test(it.dir);
  if(role==='adc'){const r=rangeOf(it.elec);
    add({kind:'분압·RC 경로',title:`${it.signal} 커넥터 전압 → MCU 핀 전압 (분압·RC 필터)`,method:'인터페이스 시험 (전기적 측정)',env,pre:['통합 SW 동작'],
      steps:[step(`${hw||'입력 커넥터'}에 ${r?fx(r[0])+' / '+fx((r[0]+r[1])/2)+' / '+fx(r[1])+' V':'최소·중간·최대 전압'} 인가 (파워 서플라이)`,'MCU 핀 전압 = 인가 전압 × 분압비, 저항 공차 범위 이내 (멀티미터)'),
        step('계단 전압 인가 후 MCU 핀 파형 측정 (오실로스코프)','RC 필터 시정수(설계값 ±20 %) 이내로 안정'),step(`같은 조건에서 SW 물리값 확인 (XCP)`,`${it.scale||'변환식'} 결과가 인가값과 HW 공차 포함 ±2 % 이내`)],pass:'분압비·RC 지연·HW-SW 물리값 정합',note:path});}
  else if(role==='pwm'){const f=freqOf(it.timing);const sib=ctx.H.items.filter(j=>j!==it&&PR.roleOf(j,null)==='pwm'&&(String(j.hw).match(/\b[A-Z]{1,3}\d+/)||[])[0]===(String(it.hw).match(/\b[A-Z]{1,3}\d+/)||[])[0]).length;
    add({kind:'PWM 파형',title:`${it.signal} PWM 파형 실측 (${hw||'상대 부품 입력'})`,method:'인터페이스 시험 (파형 측정)',env,pre:['통합 SW, 시험 Duty 10 / 50 / 90 %'],
      steps:[step(`${hw||'수신 측 핀'}에서 주파수·Duty 측정`,`${f?fmtHz(f):'설정 주파수'} ±2 %, Duty ±1 %`),step('상승·하강 슬루율, 오버슈트·링잉 측정','수신 부품 입력 규격 이내')]
        .concat(sib?[step('같은 브리지의 상·하단 구동 신호 간 Dead-time 측정','설계 Dead-time 이상 (드라이버 내부 Dead-time 포함), 동시 ON 없음')]:[])
        .concat([step('전원 투입·리셋·SW 초기화 구간 파형 기록','Glitch(의도하지 않은 펄스) 없음')]),pass:'파형 규격 만족',note:path});}
  else if(/^(spi|can|uart|i2c)_/.test(role)){const b=role.split('_')[0].toUpperCase(),f=freqOf(it.timing),r=rateOf(it.timing);
    const st=b==='SPI'?[step('SPI 클럭 주파수·Duty 측정',`${f?fmtHz(f)+' 이하':'설정값'}`),step('CS Setup/Hold 시간, 데이터 Setup/Hold 측정','상대 장치 데이터시트 최소값 이상'),step('신호 레벨·링잉','수신 VIH/VIL 만족')]
      :b==='CAN'?[step('CANH/CANL 우성·열성 전압 측정 (차동 프로브)','우성 차동 1.5–3.0 V, 열성 차동 ≈ 0 V (ISO 11898-2)'),step('비트 시간·Sample Point 측정 (버스 분석기)',`${r?fmtBaud(r):'설정 속도'}, Sample Point 설계값(예: 80 %) ±2 %`),step('종단 저항 측정 (전원 OFF)','CANH–CANL 60 Ω ±10 %')]
      :[step('비트 타이밍·레벨 측정',`${r?fmtBaud(r):f?fmtHz(f):'설정값'}, 수신 레벨 규격 만족`)];
    add({kind:'통신 물리 파형',title:`${it.signal} ${b} 물리 계층 파형`,method:'인터페이스 시험 (파형 측정)',env:env+' · 버스 분석기',pre:['통합 SW 통신 동작'],steps:st,pass:'물리 계층 규격 만족',note:path});}
  else{ // digital I/O: level + path
    const el=[];
    if(isOut)el.push(step(`SW 요청 ON/OFF 시 ${hw||'수신 측'} 전압 측정`,`High/Low가 수신 부품 VIH/VIL 만족 (${it.elec||'3.3 V 로직'})`));
    if(isIn)el.push(step(`${hw||'구동 측'}에서 High/Low 구동 시 MCU 핀 전압 측정`,`MCU VIH/VIL 만족${/5\s*V/.test(it.elec||'')?' · 5 V 신호면 클램프/분압 후 전압 확인':''}`));
    if(/외부\s*풀업|외부\s*풀다운/.test(it.pull||''))el.push(step(`외부 ${/업/.test(it.pull)?'풀업':'풀다운'} 저항 측정, 구동 해제 시 레벨`,`${it.pull}, 비구동 시 ${/업/.test(it.pull)?'High':'Low'}`));
    if(/mA/.test(it.elec||''))el.push(step('부하 전류 측정',`${it.elec}`));
    el.push(step(`${isOut?'SW 요청을 바꾸며':'입력을 바꾸며'} 상대 핀과 SW 값을 동시에 기록 (오실로스코프 + XCP)`,'HW 레벨과 SW 값이 일치 (HW-SW 물리 정합)'));
    add({kind:'디지털 신호 레벨·경로',title:`${it.signal} 신호 레벨·경로 실측`,method:'인터페이스 시험 (전기적 측정)',env,pre:['통합 SW 동작'],steps:el,pass:'레벨·경로 규격 만족',note:path});}
  if(isOut)add({kind:'리셋 중 출력 상태',title:`${it.signal} 전원 인가·리셋 중 출력 파형`,method:'인터페이스 시험 · 안전 분석 기반',env,pre:['전원 OFF 상태에서 프로브 연결'],
    steps:[step('전원 투입 → Port_Init 전까지 레벨 기록',`안전 상태 유지 (${lvl(it.init)||'정의된 초기값'}${/풀/.test(it.pull||'')?', '+it.pull:''}), ${hw||'상대 부품'} 오동작 없음`),step('외부 리셋 인가 중 레벨 기록','Glitch 없음'),step('Port_Init 직후 레벨',`HSIS 초기값 ${lvl(it.init)||'-'}`)],
    pass:'전 구간에서 의도하지 않은 활성화 없음'});
  if(role==='irq_in'&&isSafety(it.asil))add({kind:'FTTI 물리 지연',title:`${it.signal} 고장 핀 에지 → 출력 차단 물리 지연 (FTTI)`,method:'결함 주입 시험 · 타이밍 측정',domain:DOM.safe,stage:'S4',env:env+' · 다채널 오실로스코프',
    pre:['구동 중(PWM 출력 동작)'],steps:[step(`${hw||'고장 핀'}을 ${lvl(it.active)==='Low'?'Low로 끌어내림':'활성화'} (결함 주입)`,'트리거 시점 기록'),step('같은 화면에서 구동 출력(PWM·Enable) 차단 시점 측정','총 지연 ≤ FTTI 할당 (안전 요구 값, 예: 50 µs)'),step('100회 반복','최대 지연도 할당 이내')],pass:'물리 총 지연이 FTTI 할당 이내'});
  if(isSafety(it.asil))add({kind:'결함 주입',title:`${it.signal} 단선·단락 결함 주입`,method:'결함 주입 시험',domain:DOM.safe,stage:'S4',env:env+' · 결함 주입 박스',pre:['통합 SW 동작, 진단 활성'],
    steps:[step(`${hw||'신호선'} 단선`,'시스템 안전 상태, 진단 기록'),step('GND 단락','안전 상태, 부품 손상 없음'),step('전원 단락','안전 상태, 부품 손상 없음'),step('결함 제거','요구된 복구')],pass:'모든 결함에서 정의된 안전 반응'});
  return out;
}

/* function chains: signals meeting at one counterpart part integrated together (S4, physical) */
function chains(H,ctx){
  const by={};H.items.forEach(it=>{if(/전원|접지|클럭|리셋|부트/.test(it._cat||it.cat||''))return;const m=String(it.hw||'').match(/\b([A-Z]{1,3}\d+)(?:\.|\b)/);if(!m||m[1]===ctx.mcu)return;(by[m[1]]=by[m[1]]||[]).push(it);});
  const out=[];let k=0;
  Object.entries(by).filter(([,v])=>v.length>=2).forEach(([ref,its])=>{const c=ctx.B&&ctx.B.byRef[ref];const name=c?`${ref} ${c.val||''}`.trim():ref;
    const outs=its.filter(i=>/출력/.test(i.dir)),ins=its.filter(i=>/입력/.test(i.dir));const asil=its.map(i=>i.asil).find(isSafety)||its[0].asil||'';
    out.push({id:`SYSIT-CH-${String(++k).padStart(2,'0')}`,level:'SYS.4',stage:'S4',domain:outs.some(i=>PR.roleOf(i,null)==='pwm')?DOM.dio:DOM.com,tool:TOOL.hw,hsis:its.map(i=>i.id).join(', '),signal:its.map(i=>i.signal).join(', '),
      req:[...new Set(its.map(i=>i.req).filter(Boolean))].join(', '),asil,prio:sev(asil),kind:'기능 체인',title:`${name} 기능 체인 통합 실측 (${its.length}개 신호)`,method:'인터페이스 시험 · 기능 시험',env:'통합 시료 + 실제 부하 + 다채널 오실로스코프 · 전류 프로브',
      pre:['S1–S3 통과',`${name}와 실제 부하 연결`],
      steps:[step(`${outs.map(i=>i.signal).join(', ')||'출력'} 동작 중 다채널 파형 기록`,`${name} 입력·출력 파형이 요구 순서·지연대로 동작`)]
        .concat(ins.length?[step(`${ins.map(i=>i.signal).join(', ')} 피드백 파형 기록`,'출력 동작과 일관')]:[])
        .concat([step('부하 전류·온도 측정','정격 이내')]),pass:'기능 체인의 물리 동작이 요구와 일치'});});
  return out;
}

/* board-level cases (not tied to one HSIS row): watchdog/power and MCU resources */
function common(ctx){
  const sw=[],si=[];const C=(level,n,o)=>Object.assign({id:`${level==='SWE.6'?'SWQT':'SYSIT'}-COM-${String(n).padStart(2,'0')}`,level,hsis:'공통',signal:'(보드 공통)',req:'',asil:'',prio:'높음',pre:[],steps:[],stage:'',tool:level==='SWE.6'?TOOL.sw:TOOL.hw},o);
  sw.push(C('SWE.6',1,{domain:DOM.pwr,kind:'워치독 피딩',title:'워치독 Open Window 내 정상 피딩 주기',method:'타이밍 시험 (XCP·트레이스)',env:SWENV,pre:['정상 동작, 태스크 트레이스 활성'],
    steps:[step('피딩 태스크 실행 시점을 10 분간 기록','모든 피딩이 Open Window(예: 15–30 ms, WdgM 설정값) 안'),step('최대 CPU 부하 시나리오에서 반복','윈도우 위반 없음'),step('피딩 태스크를 디버거로 지연시켜 윈도우 밖으로 밀기','WdgM이 고장을 검출하고 정의된 반응(리셋 요청) 수행')],pass:'피딩 타이밍·고장 반응이 요구와 일치'}));
  sw.push(C('SWE.6',2,{domain:DOM.pwr,kind:'Shutdown 시퀀스',title:'IG OFF → Shutdown 시퀀스 (NvM 저장)',method:'상태 전이 시험',env:SWENV,pre:['정상 동작 중, NvM 블록 변경 상태'],
    steps:[step('HIL로 IG OFF 신호 주입','EcuM Shutdown 진입, 출력 요청 OFF'),step('NvM_WriteAll 완료까지 상태 기록','모든 블록 저장 완료 후 전원 유지 해제 요청'),step('저장 중 IG ON 재인가','정의된 재기동 경로')],pass:'Shutdown 상태 전이·저장 순서가 요구와 일치'}));
  sw.push(C('SWE.6',3,{domain:DOM.res,kind:'메모리 사용량',title:'Map 파일 기반 RAM/Flash 할당 준수',method:'정적 분석 · 검토',env:'빌드 산출물(.map/.elf) + 분석 스크립트',pre:['릴리스 빌드'],
    steps:[step('섹션별 RAM/Flash 사용량 추출','할당 예산(요구 값) 이내, 여유율 기준 만족'),step('안전 파티션 메모리 영역 배치 확인','ASIL/QM 영역 분리 설계와 일치')],pass:'예산·배치 기준 만족'}));
  sw.push(C('SWE.6',4,{domain:DOM.res,kind:'스택',title:'스택 사용량·오버플로 방지',method:'스택 패턴 측정 · 결함 주입',env:SWENV,pre:['스택 패턴 채움 활성'],
    steps:[step('최대 부하 시나리오 후 각 태스크 스택 최고 수위 측정','할당량의 80 % 이하'),step('디버거로 스택 한계 침범 유도','스택 모니터 검출, 정의된 고장 반응')],pass:'여유율·검출 동작 만족'}));
  sw.push(C('SWE.6',5,{domain:DOM.res,kind:'MPU 보호',title:'MPU 불법 접근 Trap',method:'결함 주입 (SW)',env:SWENV,pre:['MPU 설정 활성'],
    steps:[step('QM 파티션에서 ASIL 영역 쓰기 시도 (시험 코드)','MPU Trap 발생, 보호 훅 호출'),step('Trap 이후 상태 확인','해당 파티션 종료/재시작 등 정의된 반응, 다른 파티션 영향 없음')],pass:'메모리 보호 동작이 요구와 일치'}));
  sw.push(C('SWE.6',6,{domain:DOM.res,kind:'CPU 부하',title:'CPU 부하·태스크 실행 시간',method:'타이밍 분석 (트레이스)',env:SWENV,pre:['최대 부하 시나리오 (모든 통신·출력 동작)'],
    steps:[step('코어별 CPU 부하 측정','요구 상한(예: 70 %) 이하'),step('주기 태스크 WCET·지터 측정','데드라인 미스 없음')],pass:'부하·타이밍 기준 만족'}));
  si.push(C('SYS.4',1,{stage:'S1',domain:DOM.pwr,kind:'전원 유지',title:'IG OFF 후 NvM 저장까지 전원 유지 시간 실측',method:'인터페이스 시험 (파형 측정)',env:'통합 시료 + 오실로스코프 · 파워 서플라이',pre:['정상 동작'],
    steps:[step('IG OFF 시점과 MCU 전원(VEXT) 하강 시점 측정','전원 유지 시간 ≥ SW Shutdown 소요 시간 + 여유'),step('최소 입력 전압에서 반복','유지 시간 만족')],pass:'저장 완료 전 전원 차단 없음'}));
  si.push(C('SYS.4',2,{stage:'S1',domain:DOM.pwr,kind:'워치독 리셋 파형',title:'워치독 피딩 중단 시 리셋 핀 하드웨어 리셋 파형',method:'결함 주입 시험 · 파형 측정',env:'통합 시료 + 오실로스코프',pre:['외부 워치독(또는 내부 WDT) 활성, 시험 빌드에서 피딩 중단 가능'],
    steps:[step('피딩 중단','타임아웃 후 리셋 핀(PORST/NRST) Low 펄스 발생'),step('리셋 펄스 폭·지연 측정','데이터시트·설계값 만족'),step('리셋 후 재기동','정상 기동')],pass:'하드웨어 리셋 경로 정상'}));
  si.push(C('SYS.4',3,{stage:'S4',domain:DOM.res,kind:'풀로드 장기 시험',title:'최대 버스·액추에이터 부하 장시간 러닝',method:'내구·스트레스 시험',env:'통합 시료 + 실제 부하 + 버스 부하 발생기 + 온도 기록',pre:['S1–S3 통과'],
    steps:[step('최대 통신 부하·전 출력 동작으로 8시간 이상 운전','예기치 않은 리셋 0회'),step('부품·MCU 온도 기록','과열 없음 (정격 이내)'),step('오류 카운터·DTC 확인','신규 고장 없음')],pass:'장시간 안정 동작'}));
  return{sw,si};
}

/* mandatory-content checklists (per the SYS.4 / SWE.6 boundary) */
function checklist(level,cases,H){
  const sw=H.items.filter(i=>PR.roleOf(i,null)),all=H.items;const role=i=>PR.roleOf(i,null);
  const has=(it,kinds)=>cases.some(c=>c.hsis.split(', ').includes(it.id)&&kinds.includes(c.kind));
  const row=(title,why,targets,okFn)=>{const miss=targets.filter(t=>!okFn(t));return{title,why,total:targets.length,ok:targets.length-miss.length,miss:miss.map(t=>t.id||t)};};
  const com=k=>cases.some(c=>c.kind===k);const one=(title,why,k)=>({title,why,total:1,ok:com(k)?1:0,miss:com(k)?[]:['공통']});
  if(level==='SWE.6')return[
    row('설정 레지스터·초기 요청값','디버거로 HSIS 설정이 SW에 반영됐는지',sw,i=>has(i,['설정·초기 상태'])),
    row('ADC 원시값 BVA·디바운스·히스테리시스','1. 아날로그 — 수식 정밀도와 진단 로직',sw.filter(i=>role(i)==='adc'),i=>has(i,['ADC 수식·진단'])),
    row('Duty 요청·Clamping','2. PWM — 레지스터 갱신과 상하한 제한',sw.filter(i=>role(i)==='pwm'),i=>has(i,['Duty 요청·Clamping'])),
    row('디지털 입출력 로직 (디바운스·상태)','2. 디지털 — 요청 반영·디바운스',sw.filter(i=>/gpio|cap/.test(role(i))),i=>has(i,['출력 로직','입력 디바운스·상태'])),
    row('Safe State 전이·래치·DTC','3. 안전 — 인터럽트·진단 상태 머신',sw.filter(i=>role(i)==='irq_in'||isSafety(i.asil)),i=>has(i,['Safe State 전이','안전 진단'])),
    row('통신 오류 처리 (Timeout·CRC·Alive)','4. 통신 — 재시도·고장 진단 로직',sw.filter(i=>/^(spi|can|uart|i2c)_/.test(role(i))),i=>has(i,['통신 오류 처리'])),
    one('워치독 피딩 윈도우','5. 전원 — Open Window 내 피딩','워치독 피딩'),one('Shutdown 시퀀스','5. 전원 — IG OFF 후 NvM 저장','Shutdown 시퀀스'),
    one('RAM/Flash·스택·MPU·CPU 부하','6. MCU 리소스 — Map·스택·MPU Trap·부하','MPU 보호'),
    row('요구사항 추적성','SWE.6 BP5 — 케이스 ↔ 요구사항',all.filter(i=>cases.some(c=>c.hsis.split(', ').includes(i.id))),i=>!!i.req),
  ];
  return[
    row('S1 전원·클럭·리셋 실측','통합 첫 단계 (전원 레일·클럭·리셋 파형)',all.filter(i=>/전원|접지|클럭|리셋|부트/.test(i._cat||i.cat||'')),i=>cases.some(c=>c.hsis===i.id&&c.stage==='S1')),
    row('ADC 분압·RC 경로','1. 아날로그 — 커넥터 전압 → MCU 핀',sw.filter(i=>role(i)==='adc'),i=>has(i,['분압·RC 경로'])),
    row('PWM 파형 (주파수·슬루율·Dead-time·Glitch)','2. PWM — 파형 계측 필수',sw.filter(i=>role(i)==='pwm'),i=>has(i,['PWM 파형'])),
    row('디지털 신호 레벨·HW-SW 정합','2. 디지털 — 레벨·풀업·경로',sw.filter(i=>/gpio|cap|irq/.test(role(i))),i=>has(i,['디지털 신호 레벨·경로'])),
    row('리셋 중 출력 Glitch 부재','2. 디지털·PWM — 전원 인가·리셋 구간',sw.filter(i=>/출력/.test(i.dir)&&!/입력/.test(i.dir)),i=>has(i,['리셋 중 출력 상태'])),
    row('FTTI 물리 지연','3. 안전 — 고장 핀 에지 → 출력 차단',sw.filter(i=>role(i)==='irq_in'&&isSafety(i.asil)),i=>has(i,['FTTI 물리 지연'])),
    row('통신 물리 파형','4. 통신 — SPI 타이밍·CAN 레벨·Sample Point',sw.filter(i=>/^(spi|can|uart|i2c)_/.test(role(i))),i=>has(i,['통신 물리 파형'])),
    one('전원 유지·워치독 리셋 파형','5. 전원 — PMIC 유지 시간·리셋 핀','워치독 리셋 파형'),
    one('풀로드 장기 러닝','6. MCU 리소스 — 리셋·과열 부재','풀로드 장기 시험'),
    row('결함 주입 (ASIL 신호)','단선·단락 시 안전 반응',sw.filter(i=>isSafety(i.asil)),i=>has(i,['결함 주입'])),
    row('요구사항 추적성','SYS.4 BP7 — 케이스 ↔ 시스템 요구사항·HSIS',all.filter(i=>cases.some(c=>c.hsis.split(', ').includes(i.id))),i=>!!i.req),
  ];
}
const STAGES={S1:'S1 전원·클럭·리셋',S2:'S2 MCU ↔ 통신 장치',S3:'S3 디지털·아날로그 I/O',S4:'S4 기능 체인·안전·내구'};
const RULE={sys4:'오실로스코프·멀티미터·파워 서플라이 등 물리 장비가 필요한 전기적 특성, 파형, HW-SW 물리 정합성',swe6:'디버거(TRACE32)·HIL·XCP로 물리 오차를 배제하고 보는 수식, 상태 전이, 디바운싱, 타이밍 로직'};

function generate(B,H,mcuRef){
  let M=null;if(MC&&B&&B.byRef[mcuRef]){try{const g=MC.model(B,H,mcuRef);if(!g.error){MC.portRegs(g);M=g;}}catch(e){}}
  const ctx={B,H,M,mcu:mcuRef||'MCU'};
  H.items.forEach(i=>{if(!i._cat&&typeof HSIS!=='undefined')i._cat=HSIS.category(i);});
  const cm=common(ctx);
  const sw=H.items.flatMap(it=>swqt(it,ctx)).concat(cm.sw);
  const si=H.items.flatMap(it=>sysit(it,ctx)).concat(chains(H,ctx),cm.si);
  const order={S1:1,S2:2,S3:3,S4:4};si.sort((a,b)=>order[a.stage]-order[b.stage]||a.id.localeCompare(b.id,undefined,{numeric:true}));
  const noReq=H.items.filter(i=>!i.req).map(i=>i.id);
  return{swqt:sw,sysit:si,check:{swqt:checklist('SWE.6',sw,H),sysit:checklist('SYS.4',si,H)},stages:STAGES,domains:DOM,rule:RULE,noReq,
    trace:H.items.map(i=>({hsis:i.id,signal:i.signal,req:i.req||'',swqt:sw.filter(c=>c.hsis===i.id).map(c=>c.id),sysit:si.filter(c=>c.hsis.split(', ').includes(i.id)).map(c=>c.id)}))};
}
const COLS=['테스트 ID','시험 수준','검증 도메인','통합 단계','분류','제목','HSIS ID','신호','요구사항 ID','ASIL','우선순위','시험 기법','측정 수단','시험 환경','사전 조건','절차','기대 결과','합격 기준','신호 경로'];
function rows(cases,stages){return cases.map(c=>[c.id,c.level,c.domain||'',c.stage?(stages||STAGES)[c.stage]:'',c.kind,c.title,c.hsis,c.signal,c.req,c.asil,c.prio,c.method,c.tool||'',c.env,c.pre.join('\n'),
  c.steps.map((s,i)=>`${i+1}. ${s.action}`).join('\n'),c.steps.map((s,i)=>`${i+1}. ${s.expected}`).join('\n'),c.pass||'',c.note||'']);}
return{generate,rows,COLS,STAGES,DOM,RULE,scaleOf,freqOf,rateOf};
})();
if(typeof module!=='undefined')module.exports=TESTGEN;
