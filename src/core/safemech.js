/* ---------- safety mechanisms per block, organised by safety goal (ISO 26262-4/-5) ----------
   Each HW block gets a role (position sensor, phase current, temperature, gate driver, power stage, MCU, supply
   monitor, input, communication …). For every role there is a catalogue of mechanisms: what they check (range /
   redundancy comparison / current / readback / supply / MCU HW / MCU SW / communication / shut-off / protection),
   HW or SW, which kinds of goal violation they detect, detection and reaction time, typical diagnostic coverage
   (ISO 26262-5 Annex D: low 60 · medium 90 · high 99 %), the lowest ASIL that calls for them, what implements them in
   the circuit and what the firmware has to do. Some only apply when the circuit has the part (A4911 SPI, lockstep MCU)
   and some HW ones need a net the circuit may not have yet ("회로 추가 필요").
   map(A,K) puts them on the safety goals: a goal's violation path (block tags from SGARCH) → blocks → mechanisms whose
   kinds match the goal, with the worst detection time + fastest reaction against the FTTI, the best DC per block
   against the ASIL target and the blocks on the path that nothing watches. */
const SAFEMECH=(function(){
"use strict";
const LV=['QM','A','B','C','D'];const rank=l=>Math.max(0,LV.indexOf(String(l||'QM').toUpperCase()));
const CATS={range:'범위·타당성',cmp:'리던던시·교차 비교',cur:'전류 감시',rb:'리드백·진단',sup:'전원 감시',wd:'외부 감시',mcuhw:'MCU HW',sw:'MCU SW',comm:'통신',cut:'차단·세이프 스테이트',prot:'보호 회로'};
const ROLES={pos:'위치 센서',cur:'전류·전압 감시',temp:'온도 센서',sens:'센서',gate:'게이트 드라이버',inv:'파워 스테이지',out:'출력 스위치',mcu:'MCU',sbc:'전원 감시·SBC',sps:'센서 전원',pin:'전원 입력',comm:'통신',other:'기타'};
/* where a role sits in the goal's chain: detect (sensors, supply) → decide (MCU) → act (driver, power stage, comm) */
const STAGE={pos:0,cur:0,temp:0,sens:0,sps:0,pin:0,sbc:0,mcu:1,comm:2,gate:2,inv:2,out:2,other:1};
const TARGET={QM:0,A:60,B:90,C:97,D:99};
function roleOf(b){const im=(b.impl||[]).map(i=>i.type);const lb=(b.id+' '+b.label).toLowerCase(),ft=(b.feats||[]).join(' ').toLowerCase();
  const R=[['pin',t=>/^pin\d*\b|kl30|battery input|전원 입력/.test(t)],['sbc',t=>/pmic|\bsbc\b|supervis|감시 ic|watchdog/.test(t)],['other',t=>/connector|커넥터|debug|디버그|calib/.test(t)],
    ['gate',t=>/gate driver|게이트 드라이버/.test(t)],['sps',t=>/sensor supply|센서 (공급 )?전원|supply 9|9 ?v supply/.test(t)],['comm',t=>/transceiver|트랜시버|\blin\b|can/.test(t)],
    ['temp',t=>/temp|온도|ntc|thermist/.test(t)],['pos',t=>/hall|홀|resolver|rdc|encoder|엔코더|회전자 위치/.test(t)],['cur',t=>/current|전류|shunt|션트|vbat/.test(t)],
    ['inv',t=>/mosfet|bridge|inverter|인버터|브리지|power module|파워 모듈/.test(t)],['out',t=>/high.?side|low.?side|\bhsd\b|\blsd\b|switch|스위치|relay|릴레이/.test(t)],['sens',t=>/sensor|센서|torque|토크|pressure|압력/.test(t)]];
  if(im.includes('pwr_in'))return'pin';if(im.includes('supervisor'))return'sbc';if(im.includes('mcu')||b.group==='ctrl')return'mcu';if(im.includes('gdrv3')||im.includes('hbridge'))return'gate';
  if(im.includes('ntc'))return'temp';if(im.includes('vmon'))return'cur';if(im.includes('can'))return'comm';
  for(const t of [lb,ft])for(const [r,f] of R)if(f(t))return r;
  return'other';}
/* mechanism catalogue. k = goal kinds it covers, det / act = detection / reaction time (ms, 0 = µs range, null = at
   start-up only = latent-fault coverage), dc = typical diagnostic coverage %, min = lowest ASIL that needs it,
   by = what implements it (string or fn(K)), fw = firmware duty, need(K) → true or 'what to add', when(K) → applies */
const M=[
  // position sensor (hall)
  {id:'hall_code',role:'pos',cat:'range',sw:1,k:['actuation','data'],det:1,dc:60,min:'A',name:'홀 코드 범위 (000 · 111 금지)',by:'MCU 홀 입력 캡처',fw:'유효한 6개 코드 외 → 즉시 고장. 단선은 풀업으로 111이 되어 같은 검사로 잡힘'},
  {id:'hall_seq',role:'pos',cat:'range',sw:1,k:['actuation','data'],det:2,dc:90,min:'B',name:'홀 전이 순서 · 건너뜀 검사',by:'MCU 홀 입력 캡처',fw:'명령 방향과 다른 순서 · 상태 건너뜀을 카운트, 임계 초과 시 고장'},
  {id:'hall_speed',role:'pos',cat:'cmp',sw:1,k:['actuation','data'],det:10,dc:90,min:'B',name:'속도 타당성 (홀 주기 vs 상전류·역기전력 모델)',by:'MCU 모터 제어 SW',fw:'홀로 잰 속도와 전류·전압 모델 추정 속도의 차이가 허용 오차를 일정 시간 넘으면 고장'},
  {id:'hall_sup',role:'pos',cat:'sup',sw:0,k:['actuation','data','loss'],det:1,dc:60,min:'A',name:'홀 센서 공급 전압 감시',by:'센서 전원 분압 → ADC',fw:'공급 범위 밖이면 홀 값 무효 처리',when:K=>!K.sps,need:K=>K.has(/HALL.*(MON|SNS)|V9_(MON|SNS)|9V_(MON|SNS)|SENS_MON/)||'회로 추가 필요: 센서 전원 → 분압 → ADC'},
  // generic sensor
  {id:'sens_range',role:'sens',cat:'range',sw:1,k:['data','actuation'],det:5,dc:60,min:'A',name:'신호 범위 (open · short · 포화)',by:'MCU ADC',fw:'물리 범위 밖 → 대체값 · 고장 기록'},
  {id:'sens_rate',role:'sens',cat:'range',sw:1,k:['data','actuation'],det:20,dc:60,min:'B',name:'변화율 · 고착(stuck-at) 검사',by:'MCU SW',fw:'물리적으로 불가능한 변화율이나 일정 시간 변화 없음 → 고장'},
  {id:'sens_red',role:'sens',cat:'cmp',sw:1,k:['data','actuation'],det:5,dc:99,min:'C',name:'이중(이종) 센서 교차 비교',by:'보조 센서 + MCU SW',fw:'두 값의 차이가 허용 오차를 넘으면 고장, 한쪽 고장 시 저감 운전',need:K=>K.has(/_B$|_2$|SENS2|AUX/)||'회로 추가 필요: 보조(이종) 센서 채널'},
  // phase current / VBAT
  {id:'cur_range',role:'cur',cat:'range',sw:1,k:['actuation','thermal','data'],det:1,dc:60,min:'A',name:'상전류 범위 · 영점 오프셋 (무전류 구간)',by:K=>K.driver?K.driver+' CSxO · OOS → ADC':'션트 앰프 → ADC',fw:'PWM OFF 구간에서 영점 측정, 오프셋·포화 범위 밖이면 고장'},
  {id:'cur_sum',role:'cur',cat:'cmp',sw:1,k:['actuation','thermal','data'],det:1,dc:90,min:'B',name:'3상 전류 합 Σi ≈ 0 교차 비교',by:'3상 션트 측정',fw:'|iU + iV + iW| > 허용치가 연속 N회면 전류 센서 고장',when:K=>K.phases>=3},
  {id:'cur_vds',role:'cur',cat:'cmp',sw:1,k:['actuation','thermal'],det:2,dc:90,min:'B',name:'션트 전류 vs VDS 감시 (이종 비교)',by:K=>(K.driver||'게이트 드라이버')+' VDS 감시 + 션트',fw:'드라이버 VDS 경고와 션트 전류가 서로 맞지 않으면 센서·FET 고장',when:K=>!!K.vdsDrv},
  {id:'cur_ocp',role:'cur',cat:'cur',sw:0,k:['thermal','actuation'],det:0,act:0,dc:90,min:'A',name:'하드웨어 과전류 차단 (µs)',by:K=>K.vdsDrv?K.driver+' VDS 감시 → 게이트 OFF':'비교기 → 드라이버 EN',fw:'차단 후 DIAG 읽고 재시도 횟수 제한'},
  {id:'vbat_rng',role:'cur',cat:'sup',sw:1,k:['loss','actuation','data'],det:1,dc:60,min:'A',name:'VBAT 범위 (저전압 · 과전압)',by:'VBAT 분압 → ADC',fw:'범위 밖이면 구동 제한 · 고장 기록',need:K=>K.has(/^VMON|VBAT_(ADC|SNS|MON)/)||'회로 추가 필요: VBAT 분압 → ADC'},
  // temperature
  {id:'ntc_range',role:'temp',cat:'range',sw:1,k:['thermal','data'],det:10,dc:90,min:'A',name:'NTC open · short 범위 (ADC 상·하한)',by:'NTC 분압 → ADC',fw:'ADC 상한(단선)·하한(단락) 근처면 센서 고장 → 보수적 디레이팅'},
  {id:'ntc_rate',role:'temp',cat:'range',sw:1,k:['thermal','data'],det:200,dc:60,min:'B',name:'온도 변화율 · 고착 검사',by:'MCU SW',fw:'열 시상수보다 빠른 변화 · 부하 중 변화 없음 → 고장'},
  {id:'ntc_model',role:'temp',cat:'cmp',sw:1,k:['thermal'],det:500,dc:90,min:'B',name:'열 모델(I²R) 추정과 비교',by:'상전류 + 열 모델',fw:'모델 추정 온도와 NTC 차이가 크면 센서 고장'},
  {id:'ntc_derate',role:'temp',cat:'cut',sw:1,k:['thermal'],act:100,react:1,dc:null,min:'A',name:'과열 디레이팅 → 정지',by:'MCU SW',fw:'임계 1 전류 제한, 임계 2 정지'},
  // gate driver
  {id:'drv_diag',role:'gate',cat:'rb',sw:0,k:['actuation','thermal'],det:0,dc:90,min:'A',name:K=>K.driver?`${K.driver} DIAG → MCU 인터럽트 (VDS 단락 · 저전압 · 과열)`:'nFAULT → MCU 인터럽트',by:K=>(K.driver||'게이트 드라이버')+' DIAG/nFAULT',fw:'인터럽트에서 즉시 PWM 0 · ENABLE Low, 원인 읽기'},
  {id:'drv_spi',role:'gate',cat:'rb',sw:1,k:['actuation','thermal'],det:10,dc:90,min:'B',name:'SPI 진단 레지스터 주기 읽기 · 설정 리드백',by:K=>K.driver+' SPI',fw:'고장 레지스터 · 설정(데드타임 · 이득 · VDS 임계) 주기 비교, 다르면 재설정 후 고장 기록',when:K=>K.spiDrv},
  {id:'drv_uv',role:'gate',cat:'sup',sw:0,k:['actuation'],det:0,dc:60,min:'A',name:'부트스트랩 · VREG 저전압 감시 (내장)',by:K=>K.driver||'게이트 드라이버'},
  {id:'drv_pwmrb',role:'gate',cat:'rb',sw:1,k:['actuation'],det:1,dc:60,min:'C',name:'PWM 명령 리드백 (출력 캡처로 비교)',by:'MCU 타이머 캡처 (TC3xx: GTM TIM)',fw:'명령 듀티와 캡처한 듀티 비교'},
  {id:'drv_en',role:'gate',cat:'cut',sw:0,k:['actuation','thermal'],act:0,react:1,dc:null,min:'A',name:'ENABLE Low → 전 FET OFF (독립 차단 경로)',by:K=>(K.driver||'드라이버')+' ENABLE · 10 kΩ 풀다운 (리셋 중 OFF)',fw:'세이프 스테이트: PWM 0 → ENABLE Low'},
  {id:'drv_test',role:'gate',cat:'rb',sw:1,k:['actuation','thermal'],det:null,dc:90,min:'C',name:'차단 경로 기동 테스트 (잠재 고장)',by:'MCU SW',fw:'기동 시 ENABLE OFF → 출력 꺼짐 · DIAG 확인 후에만 구동 허가'},
  // power stage
  {id:'inv_stuck',role:'inv',cat:'cmp',sw:1,k:['actuation','thermal'],det:5,dc:90,min:'B',name:'FET 고착(stuck-on) · 상 개방 검출 (명령 vs 상전류)',by:'상전류 측정 + 명령',fw:'OFF 명령인 상에 전류 · ON인데 전류 없음 → 고장'},
  {id:'inv_short',role:'inv',cat:'rb',sw:1,k:['actuation','thermal'],det:null,dc:90,min:'B',name:'기동 시 상 단락 · 지락 테스트 펄스',by:'짧은 펄스 + 전류 측정',fw:'구동 전 상별 짧은 펄스로 단락·지락 확인'},
  {id:'inv_temp',role:'inv',cat:'range',sw:1,k:['thermal'],det:200,dc:60,min:'A',name:'FET 근접 온도 감시',by:'근처 NTC',fw:'온도 센서 블록과 공유',when:K=>K.has(/^TEMP/)},
  // MCU (HW)
  {id:'mcu_lock',role:'mcu',cat:'mcuhw',sw:0,k:['actuation','data','loss'],det:0,dc:99,min:'B',name:'락스텝 코어 비교 → SMU 알람',by:'TC3xx 락스텝 CPU + SMU',when:K=>K.lockstep},
  {id:'mcu_stl',role:'mcu',cat:'sw',sw:1,k:['actuation','data','loss'],det:20,dc:90,min:'B',name:'CPU 자가 테스트 라이브러리 (STL)',by:'MCU SW',fw:'주기적으로 CPU 명령·레지스터 테스트',when:K=>!K.lockstep},
  {id:'mcu_ecc',role:'mcu',cat:'mcuhw',sw:0,k:['actuation','data','loss'],det:0,dc:99,min:'A',name:'RAM · 플래시 ECC',by:K=>K.lockstep?'TC3xx ECC → SMU':'MCU ECC'},
  {id:'mcu_clk',role:'mcu',cat:'mcuhw',sw:0,k:['actuation','loss'],det:1,dc:90,min:'B',name:'클럭 감시',by:K=>K.lockstep?'TC3xx 클럭 모니터 → SMU':'클럭 보안 시스템 (CSS)'},
  {id:'mcu_smu',role:'mcu',cat:'cut',sw:0,k:['actuation','loss','data','thermal'],act:1,react:1,dc:null,min:'B',name:'SMU 알람 → FSP 출력 · 리셋',by:'TC3xx SMU / FSP',when:K=>K.lockstep},
  // MCU (SW)
  {id:'sw_pfm',role:'mcu',cat:'sw',sw:1,k:['actuation','loss','data'],det:10,dc:90,min:'A',name:'프로그램 흐름 감시 + 워치독 서비스',by:'MCU SW',fw:'주요 태스크 체크포인트를 모두 지났을 때만 워치독 서비스'},
  {id:'sw_bist',role:'mcu',cat:'sw',sw:1,k:['actuation','loss','data'],det:null,dc:90,min:'B',name:'기동 자가 진단 (MBIST · LBIST · 플래시 CRC)',by:'MCU SW',fw:'리셋 원인 확인 · 메모리 · 코어 테스트 통과 후 구동 허가'},
  {id:'sw_adc',role:'mcu',cat:'sw',sw:1,k:['actuation','data','thermal'],det:10,dc:90,min:'B',name:'ADC 자가 진단 (기준 채널 · 단선 검출)',by:K=>K.lockstep?'EVADC 단선 검출 · 기준 전압 채널':'ADC 기준 채널',fw:'기준 채널을 주기적으로 재서 오프셋·이득 범위 확인'},
  {id:'sw_mem',role:'mcu',cat:'sw',sw:1,k:['actuation','data'],det:10,dc:60,min:'B',name:'안전 변수 이중 저장 · 스택 감시',by:'MCU SW',fw:'값과 보수를 함께 저장, 읽을 때 비교'},
  {id:'sw_part',role:'mcu',cat:'sw',sw:1,k:['actuation','data','loss'],det:0,dc:90,min:'C',name:'MPU 파티셔닝 (ASIL · QM 소프트웨어 분리)',by:'MCU MPU',fw:'QM 코드가 안전 데이터·주변장치에 쓰지 못하게 분리'},
  {id:'sw_safe',role:'mcu',cat:'cut',sw:1,k:['actuation','thermal','loss','data'],act:1,react:1,dc:null,min:'A',name:'세이프 스테이트 진입 절차',by:'MCU SW',fw:'PWM 0 → 드라이버 차단 → 고장 기록 · CAN 알림, 재시도 정책'},
  // supervisor / SBC
  {id:'sbc_uv',role:'sbc',cat:'sup',sw:0,k:['loss','actuation'],det:1,dc:90,min:'A',name:'MCU 전원 저전압 · 과전압 → 리셋',by:K=>K.supName||'전원 감시 IC'},
  {id:'sbc_wdt',role:'sbc',cat:'wd',sw:0,k:['actuation','loss'],det:20,dc:90,min:'B',name:'외부 워치독 (MCU와 독립된 시간 기준)',by:K=>K.supName?K.supName+' WDI':'외부 워치독',fw:'정상 흐름에서만 WDI 토글',need:K=>K.has(/^WDI$/)||'회로 추가 필요: 외부 워치독 (supervisor wdt 1)'},
  {id:'sbc_rst',role:'sbc',cat:'cut',sw:0,k:['actuation','loss','thermal'],act:1,react:1,dc:null,min:'A',name:'리셋 → 출력 기본 OFF (드라이버 ENABLE 풀다운)',by:'리셋 라인 + 풀다운'},
  // sensor supply
  {id:'sps_mon',role:'sps',cat:'sup',sw:0,k:['actuation','data','loss'],det:1,dc:60,min:'A',name:'센서 전원 전압 감시',by:'센서 전원 분압 → ADC',fw:'범위 밖이면 센서 값 무효',need:K=>K.has(/HALL.*(MON|SNS)|V9_(MON|SNS)|9V_(MON|SNS)|SENS_MON/)||'회로 추가 필요: 센서 전원 → 분압 → ADC'},
  {id:'sps_prot',role:'sps',cat:'prot',sw:0,k:['loss','thermal'],dc:null,min:'QM',name:'센서 전원 단락 보호 · 전류 제한',by:'레귤레이터 전류 제한'},
  // input
  {id:'pin_uvlo',role:'pin',cat:'sup',sw:0,k:['loss','actuation'],det:1,dc:60,min:'A',name:'입력 저전압 차단 (벅 EN)',by:'EN 분압',need:K=>K.uvlo||'선택: set pwr_in uvlo auto'},
  {id:'pin_rev',role:'pin',cat:'prot',sw:0,k:['loss','thermal'],dc:null,min:'QM',name:'역전압 보호',by:K=>K.has(/^VIN_PG$/)?'역전압 P-FET':'직렬 쇼트키'},
  {id:'pin_tvs',role:'pin',cat:'prot',sw:0,k:['loss','thermal'],dc:null,min:'QM',name:K=>K.loaddump?'로드덤프 TVS':'서지 TVS',by:K=>K.loaddump||'SMAJ'},
  {id:'pin_ign',role:'pin',cat:'range',sw:1,k:['loss','actuation'],det:10,dc:60,min:'A',name:'IGN(KL15) 상태 감시 · 웨이크업',by:'IGN 분압 → MCU 입력',fw:'IGN OFF 시 정해진 순서로 정지',when:K=>K.has(/^IGN_DET$/)},
  // communication
  {id:'com_e2e',role:'comm',cat:'comm',sw:1,k:['data','loss','actuation'],det:20,dc:99,min:'A',name:'E2E 보호 (CRC · 시퀀스 카운터 · 타임아웃)',by:'AUTOSAR E2E 프로파일',fw:'수신 명령 · 송신 상태 메시지 모두 보호'},
  {id:'com_to',role:'comm',cat:'comm',sw:1,k:['loss','data'],det:100,dc:60,min:'A',name:'버스오프 · 수신 타임아웃 감시',by:'CAN 컨트롤러',fw:'명령 끊기면 정해진 기본 동작(정지)'},
  // output switch
  {id:'out_is',role:'out',cat:'cur',sw:0,k:['thermal','actuation'],det:1,dc:90,min:'A',name:'스위치 전류 감지 (IS) · 과전류 차단',by:'하이사이드 스위치'},
  {id:'out_rb',role:'out',cat:'rb',sw:1,k:['actuation'],det:5,dc:60,min:'B',name:'출력 리드백 (명령 vs 출력 전압)',by:'출력 분압 → MCU',fw:'명령과 출력 상태 비교'}];
const val=(x,K)=>typeof x==='function'?x(K):x;
/* circuit facts the catalogue looks at: nets, the gate driver part, lockstep MCU, UVLO / load-dump options */
function facts(A,parts){const nets=new Set();const all=[];(parts||[]).forEach(c=>{Object.values(c.pins||{}).forEach(n=>n&&nets.add(String(n)));all.push(((c.val||'')+' '+(c.mpn||'')+' '+(c.desc||'')).toUpperCase());});
  const txt=all.join(' | ');const blocks=(A&&A.blocks)||[];const imp=[].concat(...blocks.map(b=>b.impl||[]));
  const gd=imp.find(i=>i.type==='gdrv3'||i.type==='hbridge');const drvP=gd&&gd.params&&gd.params.driver;
  const driver=drvP&&drvP!=='IR2104'?drvP:(/A4911/.test(txt)?'A4911':/A4918/.test(txt)?'A4918':(txt.match(/DRV83\d\d/)||[])[0]||(gd||/IR2104/.test(txt)?'IR2104':null));
  const mcuB=blocks.find(b=>(b.impl||[]).some(i=>i.type==='mcu'))||blocks.find(b=>b.group==='ctrl');const mt=mcuB?(mcuB.label+' '+(mcuB.feats||[]).join(' ')+' '+JSON.stringify(mcuB.impl||[])).toUpperCase():'';
  const sup=(parts||[]).find(c=>/TPS38|TLF35|FS65|FS45|TLE94|SBC/.test((c.val||'')+' '+(c.mpn||'')));
  const ld=(parts||[]).find(c=>/SMBJ\d+C?A|SM8S/.test(c.val||''));const pin=imp.find(i=>i.type==='pwr_in');
  const K={nets,driver,vdsDrv:/A491[18]|DRV83/.test(driver||''),spiDrv:/A491[18]|DRV83\d\dS?/.test(driver||''),lockstep:/LOCKSTEP|락스텝|TC3\d\d|TC2\d\d|TMS570|RH850|S32K3/.test(mt+' '+txt),
    supName:sup?sup.val:null,loaddump:ld?ld.val:null,uvlo:!!(pin&&pin.params&&pin.params.uvlo&&pin.params.uvlo!=='off')||[...nets].some(n=>n==='BUCK_EN')&&/저전압 차단/.test(txt),
    phases:gd&&gd.type==='gdrv3'?3:gd?2:0,sps:blocks.some(b=>!b.ext&&roleOf(b)==='sps')};
  K.has=re=>[...nets].some(n=>re.test(n));return K;}
function mechsFor(role,K){return M.filter(m=>m.role===role&&(!m.when||m.when(K))).map(m=>{const nd=m.need?m.need(K):true;
  return{id:m.id,role,cat:m.cat,catLabel:CATS[m.cat],sw:!!m.sw,kinds:m.k,det:m.det===undefined?null:m.det,act:m.act==null?null:m.act,react:!!m.react,latent:m.det===null&&!m.react,dc:m.dc==null?null:m.dc,min:m.min,
    name:val(m.name,K),by:val(m.by,K)||'',fw:m.fw||'',status:m.cat==='prot'?'보호':nd===true?(m.sw?'펌웨어':'회로 있음'):String(nd).startsWith('선택')?'선택':'회로 추가 필요',note:nd===true?'':String(nd)};});}
/* the model: blocks with roles and mechanisms, goals with the mechanisms on their path */
function map(A,parts){const K=facts(A,parts);const G=typeof SGARCH!=='undefined'?SGARCH.goals(A):((A&&A.safety&&A.safety.sgs)||[]);
  const blocks=((A&&A.blocks)||[]).filter(b=>!b.ext).map(b=>{const role=roleOf(b);return{id:b.id,label:b.label,role,roleLabel:ROLES[role],stage:STAGE[role],sg:(b.sg||[]).slice(),mechs:mechsFor(role,K)};});
  const onPath=(g,b)=>b.sg.includes(g.id)||(g.path||[]).some(p=>p===b.id||p===b.id.replace(/\d+$/,''));
  const sgs=G.map(g=>{const lv=String(g.asil||'QM').toUpperCase(),tgt=TARGET[lv]||0;
    const bl=blocks.filter(b=>onPath(g,b)).map(b=>{const ms=b.mechs.filter(m=>m.kinds.includes(g.kind)).map(m=>Object.assign({},m,{opt:rank(m.min)>rank(lv)}));
      const counted=ms.filter(m=>!m.opt&&m.dc!=null&&m.status!=='회로 추가 필요'&&m.status!=='선택');const dc=counted.length?Math.max(...counted.map(m=>m.dc)):0;
      const det=ms.filter(m=>!m.opt&&!m.react&&m.det!=null&&m.status!=='회로 추가 필요'&&m.status!=='선택').map(m=>m.det);
      return{id:b.id,label:b.label,role:b.role,roleLabel:b.roleLabel,stage:b.stage,mechs:ms,dc,det:det.length?Math.min(...det):null,need:ms.some(m=>!m.opt&&m.status==='회로 추가 필요'),gap:!ms.some(m=>!m.opt&&m.cat!=='prot'),low:tgt>0&&ms.some(m=>m.dc!=null)&&dc<tgt};}).sort((a,b)=>a.stage-b.stage);
    const dets=bl.filter(b=>b.det!=null);const tdet=dets.length?Math.max(...dets.map(b=>b.det)):null;const worst=dets.find(b=>b.det===tdet);
    const reacts=[].concat(...bl.map(b=>b.mechs.filter(m=>m.react&&!m.opt&&m.act!=null))).concat(...blocks.filter(b=>!onPath(g,b)).map(b=>b.mechs.filter(m=>m.react&&m.kinds.includes(g.kind)&&rank(m.min)<=rank(lv)&&m.act!=null)));
    const tact=reacts.length?Math.min(...reacts.map(m=>m.act)):null;const rx=reacts.find(m=>m.act===tact);
    const total=tdet!=null&&tact!=null?+(tdet+tact).toFixed(2):null;
    const issues=[];bl.filter(b=>b.gap).forEach(b=>issues.push(`${b.label}: 이 목표(${g.kind})를 보는 메커니즘 없음`));
    bl.filter(b=>b.low&&!b.need).forEach(b=>issues.push(`${b.label}: DC ${b.dc}% < ASIL ${lv} 목표 ${tgt}% (전형값)`));
    bl.forEach(b=>b.mechs.filter(m=>!m.opt&&m.status==='회로 추가 필요').forEach(m=>issues.push(`${b.label}: ${m.name} — ${m.note}`)));
    if(tact==null)issues.push('세이프 스테이트로 가는 반응(차단) 메커니즘 없음');if(total!=null&&total>g.ftti)issues.push(`검출 ${tdet} ms + 반응 ${tact} ms > FTTI ${g.ftti} ms`);
    return{id:g.id,text:g.text,asil:lv,ftti:g.ftti,kind:g.kind,state:g.state||'',target:tgt,blocks:bl,tdet,tact,total,worst:worst?worst.label:null,react:rx?rx.name:null,ok:!issues.length,issues};});
  return{K:{driver:K.driver,lockstep:K.lockstep,supName:K.supName},blocks,sgs,cats:CATS};}
/* ---- text / table / HTML ---- */
const ms_=v=>v==null?'—':v===0?'< 1 ms':v+' ms';
function text(R){if(!R.sgs.length)return'안전 목표가 없습니다 — sg defaults <제품> 또는 sg add "<목표>" --asil B --ftti 100 --kind actuation --path mcu,gate';
  const L=[];R.sgs.forEach(g=>{L.push(`${g.ok?'✓':'⚠'} ${g.id} ${g.text} · ASIL ${g.asil} · FTTI ${g.ftti} ms → ${g.state}`);
    g.blocks.forEach(b=>{L.push(`  [${b.roleLabel}] ${b.label}${b.dc?` · DC ${b.dc}%`:''}`);b.mechs.forEach(m=>L.push(`    ${m.opt?'○':'•'} ${m.catLabel} · ${m.sw?'SW':'HW'} · ${m.name}${m.latent?' (기동 시)':m.react?` (반응 ${ms_(m.act)})`:m.det!=null?` (검출 ${ms_(m.det)})`:''} — ${m.status}${m.note&&m.status!=='회로 있음'&&m.status!=='펌웨어'?': '+m.note.replace(/^(회로 추가 필요|선택):\s*/,''):''}`));});
    L.push(`  시간: 검출 ${ms_(g.tdet)}${g.worst?` (${g.worst})`:''} + 반응 ${ms_(g.tact)} = ${ms_(g.total)} ${g.total!=null&&g.total<=g.ftti?'≤':'>'} FTTI ${g.ftti} ms`);
    g.issues.forEach(i=>L.push('  ⚠ '+i));L.push('');});
  return L.join('\n').trim();}
function aoaSg(R){const rows=[['SG','안전 목표','ASIL','FTTI ms','안전 상태','블록','역할','분류','HW/SW','메커니즘','검출 ms','반응 ms','DC %','최소 ASIL','상태','구현','펌웨어']];
  R.sgs.forEach(g=>g.blocks.forEach(b=>b.mechs.forEach(m=>rows.push([g.id,g.text,g.asil,g.ftti,g.state,b.label,b.roleLabel,m.catLabel,m.sw?'SW':'HW',m.name,m.latent?'기동 시':m.det==null?'':m.det,m.act==null?'':m.act,m.dc==null?'':m.dc,m.min,m.opt?'선택(상위 ASIL)':m.status,m.by,m.fw]))));return rows;}
function aoaBlock(R){const ids=R.sgs.map(g=>g.id);const rows=[['블록','역할'].concat(ids.map(id=>{const g=R.sgs.find(x=>x.id===id);return`${id} (ASIL ${g.asil})`;}),['그 밖'])];
  R.blocks.forEach(b=>{if(!b.mechs.length)return;const used=new Set();const cells=R.sgs.map(g=>{const gb=g.blocks.find(x=>x.id===b.id);if(!gb)return'';gb.mechs.forEach(m=>used.add(m.id));return gb.mechs.filter(m=>!m.opt).map(m=>m.name).join('\n');});
    rows.push([b.label,b.roleLabel].concat(cells,[b.mechs.filter(m=>!used.has(m.id)).map(m=>m.name).join('\n')]));});return rows;}
const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CSS=`<style>.sm{font:13px/1.45 system-ui,sans-serif;color:inherit}.sm .sm-sg{border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:10px;padding:12px 14px;margin:0 0 14px}
.sm .sm-sgh{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;margin-bottom:10px}.sm .sm-sgh b{font-size:14px}.sm .sm-tag{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 30%,transparent);white-space:nowrap}
.sm .sm-ok{color:#1a8f4c;border-color:#1a8f4c}.sm .sm-bad{color:#c4521a;border-color:#c4521a}.sm .sm-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sm .sm-col h4{margin:0 0 6px;font-size:11px;font-weight:600;opacity:.65;letter-spacing:.02em}
.sm .sm-blk{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:color-mix(in srgb,currentColor 3%,transparent)}.sm .sm-blk.sm-gap{border-color:#c4521a}
.sm .sm-bt{font-weight:600;margin-bottom:4px;display:flex;justify-content:space-between;gap:6px}.sm .sm-bt span{font-weight:400;opacity:.6;font-size:11px}.sm ul{margin:0;padding:0;list-style:none}.sm li{margin:3px 0;display:flex;gap:6px;align-items:flex-start}.sm li.sm-opt{opacity:.45}
.sm .sm-c{font-style:normal;flex:none;font-size:10px;padding:0 5px;border-radius:4px;color:#fff;line-height:16px;margin-top:1px}.sm .sm-st{font-size:10.5px;opacity:.7}.sm .sm-st.sm-need{color:#c4521a;opacity:1}
.sm .sm-c-range{background:#3a6fd8}.sm .sm-c-cmp{background:#8a4fd0}.sm .sm-c-cur{background:#d0781f}.sm .sm-c-rb{background:#2f8f8a}.sm .sm-c-sup{background:#b5852a}.sm .sm-c-wd{background:#7a6a3a}.sm .sm-c-mcuhw{background:#555c66}.sm .sm-c-sw{background:#2e7d4f}.sm .sm-c-comm{background:#3d8fb5}.sm .sm-c-cut{background:#c23b3b}.sm .sm-c-prot{background:#888}
.sm .sm-foot{margin-top:6px;font-size:12px}.sm .sm-foot li{display:block;color:#c4521a}.sm table{border-collapse:collapse;width:100%;font-size:12px}.sm th,.sm td{border:1px solid color-mix(in srgb,currentColor 18%,transparent);padding:6px 8px;vertical-align:top;text-align:left}.sm th{background:color-mix(in srgb,currentColor 6%,transparent);font-weight:600}
.sm td .sm-c{display:inline-block;margin:0 4px 0 0}.sm td div{margin:2px 0}.sm .sm-smleg{display:flex;flex-wrap:wrap;gap:6px 10px;margin:0 0 12px;font-size:11px}.sm .sm-smleg span{display:flex;gap:4px;align-items:center}
@media (max-width:760px){.sm .sm-flow{grid-template-columns:1fr}}</style>`;
const legend=()=>`<div class="sm-smleg">${Object.entries(CATS).map(([k,v])=>`<span><i class="sm-c sm-c-${k}">${v.split('·')[0]}</i></span>`).join('')}<span>○ 흐림 = 상위 ASIL에서 필요(선택)</span></div>`;
const mli=m=>`<li class="${m.opt?'sm-opt':''}"><i class="sm-c sm-c-${m.cat}">${m.sw?'SW':'HW'}</i><div>${h(m.name)}${m.latent?' <span class="sm-st">· 기동 시</span>':m.react?` <span class="sm-st">· 반응 ${ms_(m.act)}</span>`:m.det!=null?` <span class="sm-st">· ${ms_(m.det)}${m.dc?` · DC ${m.dc}%`:''}</span>`:''}<div class="sm-st${m.status==='회로 추가 필요'?' sm-need':''}" title="${h(m.fw)}">${h(m.status==='회로 추가 필요'||m.status==='선택'?m.note:m.by)}</div></div></li>`;
function html(R,o){o=o||{};if(!R.sgs.length)return`${CSS}<div class="sm"><p>안전 목표가 없습니다. 콘솔에서 <code>sg defaults ${h(o.product||'<제품>')}</code> 또는 <code>sg add "목표" --asil B --ftti 100 --kind actuation --path mcu,gate</code>.</p></div>`;
  if(o.mode==='block'){const head=`<tr><th>블록</th>${R.sgs.map(g=>`<th>${h(g.id)} · ASIL ${h(g.asil)}<div class="sm-st">${h(g.text)}</div></th>`).join('')}<th>그 밖 (보호 · 다른 목표용)</th></tr>`;
    const rows=R.blocks.filter(b=>b.mechs.length).sort((a,b)=>a.stage-b.stage).map(b=>`<tr><td><b>${h(b.label)}</b><div class="sm-st">${h(b.roleLabel)}</div></td>${R.sgs.map(g=>{const gb=g.blocks.find(x=>x.id===b.id);if(!gb)return'<td class="sm-st">—</td>';const ms=gb.mechs.filter(m=>!m.opt);return`<td>${ms.length?ms.map(m=>`<div><i class="sm-c sm-c-${m.cat}">${m.sw?'SW':'HW'}</i>${h(m.name)}${m.status==='회로 추가 필요'?' <span class="sm-st sm-need">(회로 추가)</span>':''}</div>`).join(''):'<span class="sm-st sm-need">없음</span>'}${gb.dc?`<div class="sm-st">DC ${gb.dc}%</div>`:''}</td>`;}).join('')}<td>${(()=>{const used=new Set();R.sgs.forEach(g=>{const gb=g.blocks.find(x=>x.id===b.id);if(gb)gb.mechs.filter(m=>!m.opt).forEach(m=>used.add(m.id));});return b.mechs.filter(m=>!used.has(m.id)).map(m=>`<div class="${m.cat==='prot'?'':'sm-st'}"><i class="sm-c sm-c-${m.cat}">${m.sw?'SW':'HW'}</i>${h(m.name)}</div>`).join('')||'<span class="sm-st">—</span>';})()}</td></tr>`).join('');
    return`${CSS}<div class="sm">${legend()}<table>${head}${rows}</table></div>`;}
  const COLS=['감지 (센서 · 전원)','판단 (MCU)','구동 · 차단'];
  return`${CSS}<div class="sm">${legend()}${R.sgs.map(g=>`<section class="sm-sg"><div class="sm-sgh"><b>${h(g.id)} ${h(g.text)}</b><span class="sm-tag">ASIL ${h(g.asil)}</span><span class="sm-tag">FTTI ${g.ftti} ms</span><span class="sm-tag ${g.total!=null&&g.total<=g.ftti?'sm-ok':'sm-bad'}">검출 ${ms_(g.tdet)} + 반응 ${ms_(g.tact)} ${g.total!=null&&g.total<=g.ftti?'≤':'>'} FTTI</span><span class="sm-tag ${g.ok?'sm-ok':'sm-bad'}">${g.ok?'충족':'점검 '+g.issues.length}</span><span class="sm-st">→ ${h(g.state)}</span></div>
    <div class="sm-flow">${[0,1,2].map(s=>`<div class="sm-col"><h4>${COLS[s]}</h4>${g.blocks.filter(b=>b.stage===s).map(b=>`<div class="sm-blk${b.gap||b.need||b.low?' sm-gap':''}"><div class="sm-bt">${h(b.label)}<span>${h(b.roleLabel)}${b.dc?` · DC ${b.dc}%`:''}</span></div><ul>${b.mechs.map(mli).join('')||'<li class="sm-st sm-need">메커니즘 없음</li>'}</ul></div>`).join('')||'<div class="sm-st">—</div>'}</div>`).join('')}</div>
    ${g.issues.length?`<ul class="sm-foot">${g.issues.map(i=>`<li>⚠ ${h(i)}</li>`).join('')}</ul>`:''}</section>`).join('')}</div>`;}
return{CATS,ROLES,M,roleOf,facts,map,text,html,aoaSg,aoaBlock,CSS};
})();
if(typeof module!=='undefined')module.exports=SAFEMECH;
