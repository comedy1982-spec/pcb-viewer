/* ---------- product profiles: standard HW blocks + per-block Q&A for automotive ECUs ----------
   A profile says what a product (EPS, BMS, BCM, inverter …) normally contains: standard requirement defaults,
   the HW blocks it always has (with features / circuit implementation), the interfaces between them, and the
   few questions whose answers change that architecture (type, current class, sensor interface, redundancy …).
   Each answer option carries an "effect" that edits the architecture deterministically, so the diagram is built
   without a second AI round. Claude produces the same shape for any product (aiPrompt/fromAi); the built-in
   templates are the deterministic fallback and the worked example in the prompt. */
const PRODUCTS=(()=>{
const GROUPS=['power','comm','ctrl','io','ext'];
const IMPLS=['pwr_in','usb_in','ldo','buck','mcu','xtal','can','bldc','gdrv3','hbridge','dcmotor','led','button','flash','uart','i2c','supervisor','hs_switch','vmon','ntc','part'];
const S=v=>v==null?'':String(v).trim();
/* ---- templates ---- */
const T={};
T.eps={key:'eps',name:'EPS (전동 파워 스티어링) ECU',re:/\beps\b|파워\s*스티어링|power\s*steering|전동\s*조향|steering/i,
  defaults:['12 V 차량 배터리 (KL30 · 6–16 V · 로드덤프 40 V)','KL15 이그니션 웨이크','AURIX TC3xx 락스텝 코어','CAN-FD 차량 네트워크','PMSM/BLDC 3상 구동','ASIL D (조향 상실)','-40 ~ +125 °C · CISPR 25'],
  req:'12 V 차량 배터리, AURIX TC364, CAN-FD, BLDC 모터 구동(홀), 전류 온도 센싱, XCP, ASIL D',
  blocks:[
    {id:'pin',group:'power',label:'Battery Input KL30 (12 V)',feats:['역전압 보호 (Reverse Polarity FET)','로드덤프 · 서지 보호 (TVS)','입력 π 필터 · 커먼모드 초크'],impl:[{type:'pwr_in',params:{vin:12}}],why:'차량 배터리 직결 — ISO 7637 펄스·로드덤프 내성'},
    {id:'ign',group:'power',label:'KL15 Ignition Wake',feats:['웨이크업 입력 · 슬립 전류 < 1 mA'],why:'이그니션으로 깨고 슬립'},
    {id:'sbc',group:'power',label:'Safety PMIC / SBC',feats:['VCC_5V 5 V · VCC_MCU 3.3 V/1.25 V','전원 감시 (UV/OV)','질의응답 워치독 · FS0B 세이프 스테이트','CAN-FD 트랜시버 통합'],impl:[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}},{type:'supervisor',params:{}}],parts:['TLF35584','FS26'],why:'ASIL D 전원·감시·워치독을 한 IC로'},
    {id:'mcu',group:'ctrl',label:'Main MCU (Lockstep)',feats:['Core: AURIX TC3xx (TriCore · 락스텝)','ADC ×2 (상전류 · 토크 · 각도)','GTM PWM ×6 (3상)','SENT / SPI 센서 IF','Watchdog & Safety (ASIL D)'],impl:[{type:'mcu',params:{part:'TC364DP-64F300F'}},{type:'xtal',params:{}}],why:'조향 제어 루프 · 안전 감시'},
    {id:'canbus',group:'comm',label:'CAN-FD Bus (H / L)',ext:true,feats:['차량 네트워크 · UDS 진단'],why:'차량 통신'},
    {id:'canx',group:'comm',label:'CAN-FD Transceiver',feats:['물리 계층 (5 V)','스플릿 종단 · ESD'],impl:[{type:'can',params:{}}],why:'CAN 물리 계층'},
    {id:'gate',group:'io',label:'3-Phase Gate Driver',feats:['MOSFET 6개 제어 (부트스트랩 · 차지펌프)','게이트 진단 · 단락 보호','PWM ×3 · 상 전류 리드백'],impl:[{type:'gdrv3',params:{i:60,hall:0}}],parts:['TLE9180','L9908'],why:'3상 인버터 구동'},
    {id:'inv',group:'io',label:'3-Phase MOSFET Inverter',feats:['MOSFET ×6 (40 V · 저 RDS(on))','상 션트 ×3','방열판 밀착'],why:'모터 전력단'},
    {id:'pcut',group:'io',label:'Phase-Cut / Safety Relay',feats:['모터 상 분리 FET ×3','독립 감시 경로로 구동 (세이프 스테이트)'],impl:[{type:'hs_switch',params:{}}],why:'안전 상태 = 토크 0, 수동 조향 유지'},
    {id:'isense',group:'io',label:'Phase Current Sensing',feats:['전류 센싱 (Shunt + Amp)','3상 션트 · 동기 샘플링','HW Diagnostics'],impl:[{type:'vmon',params:{}}],why:'FOC 전류 루프'},
    {id:'tsens',group:'io',label:'Torque Sensor Interface',feats:['이중 채널 입력','센서 전원 5 V 이중화 · 감시'],why:'운전자 토크 입력 (안전 관련)'},
    {id:'asens',group:'io',label:'Motor Position / Angle Sensor IF',feats:['MR 각도 센서 ×2 (SPI/SENT)','센서 전원 감시'],why:'FOC 회전자 위치 · 조향각'},
    {id:'dbg',group:'io',label:'Debug / Calib. Interface',feats:['JTAG / DAP','UART','XCP over CAN'],impl:[{type:'uart',params:{}}],why:'개발·캘리브레이션'},
    {id:'conn',group:'ext',label:'Motor & Sensor Connector',ext:true,feats:['3상 모터 (고전류)','토크 · 각도 센서'],why:'외부 연결'}],
  links:[['pin','sbc','VBAT 12 V','power'],['ign','sbc','KL15 Wake','signal'],['sbc','mcu','VCC_MCU · nRESET · WDI','safe'],['sbc','canx','VCC_5V','power'],['canbus','canx','CAN_H / CAN_L','bus'],['canx','mcu','TXD / RXD','signal'],
    ['mcu','gate','PWM ×6 · EN','signal'],['gate','inv','Gate ×6','signal'],['pin','inv','VBAT (Motor)','power'],['inv','pcut','Phase U/V/W','power'],['pcut','conn','Phase U/V/W','power'],['sbc','pcut','FS0B (차단)','safe'],['mcu','pcut','Phase-cut EN','safe'],
    ['isense','mcu','Analog Feedback (ADC)','signal'],['inv','isense','Shunt','signal'],['tsens','mcu','Torque (SENT/ADC)','signal'],['asens','mcu','Angle (SPI/SENT)','signal'],['conn','tsens','Sensor Signals','signal'],['conn','asens','Sensor Signals','signal'],['sbc','tsens','VCC_SENS 5 V','power'],['sbc','asens','VCC_SENS 5 V','power'],['mcu','dbg','Diagnostic / Debug','signal']],
  questions:[
    {key:'type',block:'inv',q:'EPS 타입과 상전류 등급은?',why:'MOSFET 수·션트·방열·커넥터 등급이 달라집니다.',re:/컬럼|column|랙|rack|\d+\s*a\b/i,
      options:[{label:'컬럼 타입 (C-EPS) · 상전류 ~60 A',effect:{impl:{id:'gate',type:'gdrv3',params:{i:60}},feats:{inv:['상전류 60 A급 · MOSFET ×6'],conn:['커넥터 60 A급']},req:'컬럼 타입 60 A'}},
               {label:'듀얼 피니언 / 랙 타입 · ~120 A',effect:{impl:{id:'gate',type:'gdrv3',params:{i:120}},feats:{inv:['상전류 120 A급 · MOSFET ×6 병렬 ×2'],conn:['커넥터 120 A급 · 버스바']},req:'랙 타입 120 A'}},
               {label:'상용차 랙 타입 · ~200 A',effect:{impl:{id:'gate',type:'gdrv3',params:{i:200}},feats:{inv:['상전류 200 A급 · MOSFET 병렬 ×3 · 버스바'],conn:['버스바 단자 200 A']},req:'상용차 200 A'}}]},
    {key:'torque',block:'tsens',q:'토크 센서 인터페이스는?',why:'MCU 핀·센서 전원·진단 방식이 정해집니다.',re:/sent|psi5|아날로그\s*토크|torque/i,
      options:[{label:'SENT 이중 채널',effect:{feats:{tsens:['SENT ×2 (SAE J2716)'],mcu:['SENT IF ×2']},req:'토크센서 SENT'}},
               {label:'아날로그 이중 채널 (비율 출력)',effect:{feats:{tsens:['아날로그 ×2 (0.5–4.5 V) · 상호 비교'],mcu:['ADC ×2 토크']},req:'토크센서 아날로그 이중'}},
               {label:'PSI5',effect:{feats:{tsens:['PSI5 트랜시버 · 센서 전원 라인 변조'],mcu:['PSI5 IF']},req:'토크센서 PSI5'}}]},
    {key:'angle',block:'asens',q:'모터 위치 / 조향각 센서는?',why:'센서 IF 블록과 센서 전원 이중화가 달라집니다.',re:/리졸버|resolver|mr\s*센서|홀\s*센서|hall|각도\s*센서/i,
      options:[{label:'MR 각도 센서 ×2 (SPI/SENT)',effect:{feats:{asens:['MR 각도 센서 ×2 · SPI']}}},
               {label:'리졸버 (여자 회로 + RDC)',effect:{feats:{asens:['리졸버 여자 앰프 · RDC (AD2S1210 급)']},req:'리졸버'}},
               {label:'홀 센서 ×3 (저가)',effect:{feats:{asens:['홀 센서 ×3 · 디지털 입력']},impl:{id:'gate',type:'gdrv3',params:{hall:1}},req:'홀 센서'}}]},
    {key:'redund',block:'mcu',q:'리던던시(이중 채널) 구성인가요?',why:'2채널이면 MCU·게이트·인버터·전원을 복제하고 ASIL 분해(B(D)+B(D))를 적용합니다.',re:/리던던|redund|이중\s*채널|dual\s*channel|2\s*채널/i,
      options:[{label:'단일 채널 (ASIL D 단일 MCU 락스텝)',effect:{}},
               {label:'2채널 리던던트 EPS (각 ASIL B(D))',effect:{dup:[{id:'mcu',n:2},{id:'gate',n:2},{id:'inv',n:2},{id:'sbc',n:2}],feats:{mcu:['채널 간 상호 감시 (SPI/CAN)','ASIL 분해 B(D)']},req:'2채널 리던던트, 이중 급전'}}]},
    {key:'comm2',block:'canx',q:'추가 통신이 있나요?',why:'트랜시버·커넥터 핀이 늘어납니다.',multi:true,re:/flexray|사설\s*can|private\s*can|lin\b/i,
      options:[{label:'없음 (CAN-FD 1채널)',effect:{}},
               {label:'사설 CAN (센서·리던던트 채널)',effect:{add:[{id:'canx2',group:'comm',label:'Private CAN Transceiver',feats:['사설 CAN · 센서/채널 간'],impl:[{type:'can',params:{}}]}],links:[['canx2','mcu','TXD / RXD #2','signal'],['sbc','canx2','VCC_5V','power']],req:'사설 CAN'}},
               {label:'FlexRay',effect:{add:[{id:'frx',group:'comm',label:'FlexRay Transceiver ×2',feats:['FlexRay A/B 채널']}],links:[['frx','mcu','FlexRay','signal']],req:'FlexRay'}}]}]};
T.bms={key:'bms',name:'BMS (배터리 관리 시스템) 마스터',re:/\bbms\b|배터리\s*관리|battery\s*management|셀\s*밸런싱/i,
  defaults:['12 V 보조 배터리 (KL30)','고전압 팩 절연 (1500 V 절연 통신)','셀 모니터링 AFE 데이지체인','CAN-FD','ASIL C/D (과충전·열폭주)','-40 ~ +85 °C'],
  req:'12 V 차량 배터리, AURIX TC364, CAN-FD, 전류 온도 전압 센싱, ASIL C',
  blocks:[
    {id:'pin',group:'power',label:'Battery Input KL30 (12 V)',feats:['역전압 보호','서지 보호 (TVS)'],impl:[{type:'pwr_in',params:{vin:12}}]},
    {id:'sbc',group:'power',label:'Safety PMIC / SBC',feats:['VCC_5V · VCC_MCU 3.3 V','전원 감시 (UV/OV)','질의응답 워치독 · FS0B'],impl:[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}},{type:'supervisor',params:{}}],parts:['TLF35584','FS26']},
    {id:'mcu',group:'ctrl',label:'Main MCU (Lockstep)',feats:['Core: AURIX TC3xx (TriCore)','SPI (AFE 체인) · ADC','Watchdog & Safety (ASIL C)'],impl:[{type:'mcu',params:{part:'TC364DP-64F300F'}},{type:'xtal',params:{}}]},
    {id:'canbus',group:'comm',label:'CAN-FD Bus (H / L)',ext:true,feats:['차량 네트워크 · UDS']},
    {id:'canx',group:'comm',label:'CAN-FD Transceiver',feats:['물리 계층 (5 V)','스플릿 종단 · ESD'],impl:[{type:'can',params:{}}]},
    {id:'iso',group:'comm',label:'Isolated Daisy-Chain IF (AFE)',feats:['절연 SPI/isoSPI 트랜시버','셀 모니터 IC 체인 (12–18 셀/IC)','1500 V 절연 · CMTI'],parts:['LTC6820','MC33664'],why:'고전압 팩 측 AFE와 통신'},
    {id:'cur',group:'io',label:'Pack Current Sensing',feats:['션트 + 절연 ADC 또는 홀 센서','이중화 (션트 + 홀)','HW Diagnostics'],impl:[{type:'vmon',params:{}}]},
    {id:'hvm',group:'io',label:'HV Measurement / Insulation Monitor',feats:['팩 전압 · 링크 전압 (절연 분압)','절연 저항 감시 (IMD)']},
    {id:'ctr',group:'io',label:'Contactor / Pre-charge Driver',feats:['메인 컨택터 ×2 · 프리차지 릴레이','코일 전류 진단 · 용착 감지','독립 차단 경로'],impl:[{type:'hs_switch',params:{}}]},
    {id:'temp',group:'io',label:'Temperature Inputs',feats:['NTC ×N (팩 · 컨택터 · 보드)']},
    {id:'dbg',group:'io',label:'Debug / Calib. Interface',feats:['JTAG / DAP','UART','XCP over CAN'],impl:[{type:'uart',params:{}}]},
    {id:'conn',group:'ext',label:'Pack / Vehicle Connector',ext:true,feats:['HV 인터락 (HVIL)','컨택터 · 센서']}],
  links:[['pin','sbc','VBAT 12 V','power'],['sbc','mcu','VCC_MCU · nRESET · WDI','safe'],['sbc','canx','VCC_5V','power'],['canbus','canx','CAN_H / CAN_L','bus'],['canx','mcu','TXD / RXD','signal'],['mcu','iso','SPI','signal'],['iso','conn','isoSPI 체인','bus'],
    ['cur','mcu','Analog Feedback (ADC)','signal'],['hvm','mcu','HV ADC','signal'],['mcu','ctr','Contactor EN','safe'],['sbc','ctr','FS0B (차단)','safe'],['ctr','conn','Coil drive','power'],['temp','mcu','NTC (ADC)','signal'],['conn','cur','Shunt / Hall','signal'],['conn','hvm','HV+ / HV-','power'],['mcu','dbg','Diagnostic / Debug','signal']],
  questions:[
    {key:'cells',block:'iso',q:'팩 구성(직렬 셀 수)과 AFE 체인은?',why:'AFE IC 수·절연 토폴로지가 정해집니다.',re:/\d+\s*s\b|\d+\s*셀|400\s*v|800\s*v/i,
      options:[{label:'48 V 마일드 하이브리드 (12–14 셀)',effect:{feats:{iso:['AFE 1개 · 비절연 가능']},req:'48 V 14S'}},{label:'400 V 팩 (~96 셀)',effect:{feats:{iso:['AFE 8개 데이지체인 · 절연']},req:'400 V 96S'}},{label:'800 V 팩 (~192 셀)',effect:{feats:{iso:['AFE 16개 체인 ×2 · 절연 2단']},req:'800 V 192S'}}]},
    {key:'cur',block:'cur',q:'팩 전류 측정 방식은?',why:'션트는 절연 ADC, 홀은 센서 전원이 필요합니다.',re:/션트|shunt|홀\s*전류|hall/i,
      options:[{label:'션트 + 절연 ΔΣ ADC',effect:{feats:{cur:['절연 ΔΣ ADC (AMC131x 급)']}}},{label:'홀 전류 센서 (이중 레인지)',effect:{feats:{cur:['홀 센서 ×2 레인지 · 5 V 전원']}}},{label:'둘 다 (이중화)',effect:{feats:{cur:['션트 + 홀 이중화 · 상호 비교']},req:'전류 이중화'}}]},
    {key:'asil',block:'mcu',q:'안전 등급은?',why:'워치독·차단 경로·AFE 진단 범위가 달라집니다.',re:/asil\s*[a-d]/i,
      options:[{label:'ASIL C',effect:{asil:'C',req:'ASIL C'}},{label:'ASIL D',effect:{asil:'D',req:'ASIL D',feats:{ctr:['차단 경로 이중화 (MCU + SBC)']}}}]},
    {key:'bal',block:'iso',q:'셀 밸런싱 방식은?',why:'AFE 선택과 열 설계에 영향.',re:/밸런싱|balanc/i,
      options:[{label:'패시브 (AFE 내장 방전)',effect:{feats:{iso:['패시브 밸런싱 (AFE 내장)']}}},{label:'액티브 (DC/DC 전하 이동)',effect:{add:[{id:'bal',group:'io',label:'Active Balancing DC/DC',feats:['셀 간 전하 이동 · 플라이백']}],links:[['mcu','bal','PWM / EN','signal']],req:'액티브 밸런싱'}}]}]};
T.bcm={key:'bcm',name:'BCM (바디 컨트롤 모듈)',re:/\bbcm\b|바디\s*컨트롤|body\s*control|도어\s*모듈|램프\s*제어/i,
  defaults:['12 V 차량 배터리 (KL30)','다채널 하이사이드/로우사이드 드라이버','CAN-FD + LIN','ASIL A/B (램프·와이퍼)','슬립 전류 < 500 µA'],
  req:'12 V 차량 배터리, STM32, CAN-FD, LIN, LED 4개, 버튼 2개, 릴레이, ASIL B',
  blocks:[
    {id:'pin',group:'power',label:'Battery Input KL30 (12 V)',feats:['역전압 보호','서지 보호 (TVS)','입력 필터'],impl:[{type:'pwr_in',params:{vin:12}}]},
    {id:'sbc',group:'power',label:'SBC (PMIC + CAN/LIN + WDT)',feats:['VCC_5V · VCC_MCU 3.3 V','슬립 · 웨이크 관리 (< 500 µA)','윈도우 워치독 · 리셋 감시','CAN-FD · LIN 트랜시버 통합'],impl:[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}},{type:'supervisor',params:{}}],parts:['TLE9471','MC33FS4500']},
    {id:'mcu',group:'ctrl',label:'Main MCU',feats:['Core: Cortex-M (Automotive)','GPIO ×많음 · PWM · ADC','Watchdog & Safety (ASIL B)'],impl:[{type:'mcu',params:{part:'STM32F042K6U6'}},{type:'xtal',params:{}}]},
    {id:'canbus',group:'comm',label:'CAN-FD Bus (H / L)',ext:true,feats:['차량 네트워크']},
    {id:'canx',group:'comm',label:'CAN-FD Transceiver',feats:['물리 계층 (5 V)','ESD'],impl:[{type:'can',params:{}}]},
    {id:'lin',group:'comm',label:'LIN Transceiver ×N',feats:['LIN 마스터 (도어·시트·미러)','ESD']},
    {id:'hsd',group:'io',label:'High-Side Driver Array',feats:['램프 · 모터 · 릴레이 구동 (HSD ×8)','전류 센스 · 과온 · 개방 진단'],impl:[{type:'hs_switch',params:{}}],parts:['BTS7xxx','VND7xxx']},
    {id:'lsd',group:'io',label:'Low-Side / Relay Driver',feats:['릴레이 코일 ×N · 인덕티브 클램프','진단']},
    {id:'din',group:'io',label:'Digital Inputs (Switches)',feats:['스위치 입력 ×N (풀업 · 디바운스 · 웨이크)','ESD']},
    {id:'ui',group:'io',label:'Indicators',feats:['LED ×4','버튼 ×2'],impl:[{type:'led',params:{n:4}},{type:'button',params:{n:2}}]},
    {id:'dbg',group:'io',label:'Debug Interface',feats:['SWD / JTAG','UART'],impl:[{type:'uart',params:{}}]},
    {id:'conn',group:'ext',label:'Body Harness Connector',ext:true,feats:['램프 · 스위치 · 릴레이 · LIN']}],
  links:[['pin','sbc','VBAT 12 V','power'],['sbc','mcu','VCC_MCU · nRESET · WDI','safe'],['sbc','canx','VCC_5V','power'],['canbus','canx','CAN_H / CAN_L','bus'],['canx','mcu','TXD / RXD','signal'],['lin','mcu','LIN TXD/RXD','signal'],['lin','conn','LIN','bus'],
    ['mcu','hsd','EN / PWM · SPI','signal'],['pin','hsd','VBAT','power'],['hsd','conn','Loads','power'],['mcu','lsd','EN','signal'],['lsd','conn','Relay coils','power'],['conn','din','Switch inputs','signal'],['din','mcu','GPIO','signal'],['mcu','ui','GPIO','signal'],['mcu','dbg','Debug','signal']],
  questions:[
    {key:'loads',block:'hsd',q:'구동 부하 채널 수는?',why:'HSD IC 수·커넥터·방열이 정해집니다.',re:/\d+\s*(채널|ch)/i,
      options:[{label:'소형 (~8 채널)',effect:{feats:{hsd:['HSD 8채널 (2 IC)']}}},{label:'중형 (~16 채널)',effect:{feats:{hsd:['HSD 16채널 (4 IC) · SPI 진단']},req:'16채널'}},{label:'대형 (32 채널+)',effect:{feats:{hsd:['HSD 32채널 · 다중 보드']},req:'32채널'}}]},
    {key:'lin',block:'lin',q:'LIN 채널 수는?',why:'트랜시버 수와 MCU UART 수.',re:/lin\s*\d/i,
      options:[{label:'LIN 없음',effect:{remove:['lin']}},{label:'LIN ×2',effect:{feats:{lin:['LIN ×2']}}},{label:'LIN ×4',effect:{feats:{lin:['LIN ×4']},req:'LIN 4채널'}}]},
    {key:'motor',block:'lsd',q:'모터(와이퍼·윈도·시트) 직접 구동이 있나요?',why:'H-브리지 블록이 추가됩니다.',multi:false,re:/와이퍼|윈도|시트|h-?bridge/i,
      options:[{label:'없음 (릴레이로 구동)',effect:{}},{label:'H-브리지 DC 모터 ×1–2',effect:{add:[{id:'hb',group:'io',label:'H-Bridge Motor Driver',feats:['DC 모터 · 게이트 드라이버 + MOSFET ×4 · 전류 센싱'],impl:[{type:'hbridge',params:{i:10}}]}],links:[['mcu','hb','PWM / EN','signal'],['pin','hb','VBAT','power'],['hb','conn','Motor','power']],req:'DC 모터 2개'}}]},
    {key:'asil',block:'mcu',q:'안전 등급은?',why:'워치독·진단 범위.',re:/asil\s*[a-d]|\bqm\b/i,
      options:[{label:'QM',effect:{asil:'QM',req:'QM'}},{label:'ASIL A',effect:{asil:'A',req:'ASIL A'}},{label:'ASIL B',effect:{asil:'B',req:'ASIL B'}}]}]};
T.inv={key:'inv',name:'트랙션 모터 인버터 (HV)',re:/인버터|inverter|트랙션|traction|모터\s*컨트롤러|motor\s*controller|mcu\s*\(모터\)/i,
  defaults:['12 V 보조 전원 + HV DC 링크 (400/800 V)','3상 IGBT/SiC 파워 모듈 + 절연 게이트 드라이버','리졸버 · 상전류 센서','CAN-FD','ASIL C/D','액랭'],
  req:'12 V 차량 배터리, AURIX TC364, CAN-FD, BLDC 모터 구동(리졸버), 전류 온도 센싱, ASIL D',
  blocks:[
    {id:'pin',group:'power',label:'LV Input KL30 (12 V)',feats:['역전압 보호','서지 보호'],impl:[{type:'pwr_in',params:{vin:12}}]},
    {id:'sbc',group:'power',label:'Safety PMIC / SBC',feats:['VCC_5V · VCC_MCU','전원 감시 · 질의응답 워치독 · FS0B'],impl:[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}},{type:'supervisor',params:{}}],parts:['TLF35584']},
    {id:'gps',group:'power',label:'Isolated Gate Supplies',feats:['절연 플라이백 ×6 (+15/-4 V)','HV 측 전원'],why:'게이트 드라이버 절연 전원'},
    {id:'mcu',group:'ctrl',label:'Main MCU (Lockstep)',feats:['Core: AURIX TC3xx','ADC · GTM PWM ×6 · RDC IF','Watchdog & Safety (ASIL D)'],impl:[{type:'mcu',params:{part:'TC364DP-64F300F'}},{type:'xtal',params:{}}]},
    {id:'canbus',group:'comm',label:'CAN-FD Bus (H / L)',ext:true,feats:['차량 네트워크']},
    {id:'canx',group:'comm',label:'CAN-FD Transceiver',feats:['물리 계층','ESD'],impl:[{type:'can',params:{}}]},
    {id:'gate',group:'io',label:'Isolated Gate Drivers ×6',feats:['절연 게이트 드라이버 (DESAT · 액티브 클램프)','소프트 턴오프 · 결함 리포트'],impl:[{type:'bldc',params:{hall:0}}],parts:['1ED3xxx','UCC5870']},
    {id:'pm',group:'io',label:'Power Module (IGBT/SiC)',feats:['3상 하프브리지 ×3','DC 링크 캡 · 방전 저항','NTC 내장'],why:'HV 전력단'},
    {id:'isense',group:'io',label:'Phase Current Sensors',feats:['홀/플럭스게이트 ×3','HW Diagnostics'],impl:[{type:'vmon',params:{}}]},
    {id:'rdc',group:'io',label:'Resolver Interface',feats:['여자 앰프 · RDC','위치 · 속도']},
    {id:'hvm',group:'io',label:'HV DC-Link Measurement',feats:['절연 분압 · 액티브 디스차지 제어']},
    {id:'dbg',group:'io',label:'Debug / Calib. Interface',feats:['JTAG / DAP','XCP over CAN'],impl:[{type:'uart',params:{}}]},
    {id:'conn',group:'ext',label:'HV / Motor / LV Connector',ext:true,feats:['HV+ / HV- (HVIL)','3상 버스바','리졸버 · 온도']}],
  links:[['pin','sbc','VBAT 12 V','power'],['sbc','mcu','VCC_MCU · nRESET · WDI','safe'],['sbc','gps','VCC','power'],['gps','gate','절연 게이트 전원','power'],['sbc','canx','VCC_5V','power'],['canbus','canx','CAN_H / CAN_L','bus'],['canx','mcu','TXD / RXD','signal'],
    ['mcu','gate','PWM ×6 · Fault','signal'],['gate','pm','Gate','signal'],['pm','conn','Phase U/V/W','power'],['conn','pm','HV DC Link','power'],['isense','mcu','Analog Feedback (ADC)','signal'],['rdc','mcu','Position','signal'],['hvm','mcu','HV ADC','signal'],['sbc','gate','FS0B (안전 차단)','safe'],['conn','isense','Phase','signal'],['conn','rdc','Resolver','signal'],['mcu','dbg','Debug','signal']],
  questions:[
    {key:'hv',block:'pm',q:'DC 링크 전압과 파워 소자는?',why:'게이트 드라이버·절연 거리·모듈이 달라집니다.',re:/400\s*v|800\s*v|sic|igbt/i,
      options:[{label:'400 V · IGBT 모듈',effect:{feats:{pm:['650 V IGBT 모듈']},req:'400 V IGBT'}},{label:'800 V · SiC 모듈',effect:{feats:{pm:['1200 V SiC MOSFET 모듈'],gate:['고속 스위칭 · 높은 CMTI']},req:'800 V SiC'}}]},
    {key:'pos',block:'rdc',q:'모터 위치 센서는?',why:'리졸버는 여자 회로, 엔코더/MR은 디지털 IF.',re:/리졸버|resolver|엔코더|encoder|mr\s*센서/i,
      options:[{label:'리졸버',effect:{}},{label:'MR/엔코더 (디지털)',effect:{feats:{rdc:['MR 센서 · SPI/ABZ (리졸버 대신)']}}}]},
    {key:'asil',block:'mcu',q:'안전 등급은?',why:'토크 감시·차단 경로.',re:/asil\s*[a-d]/i,
      options:[{label:'ASIL C',effect:{asil:'C',req:'ASIL C'}},{label:'ASIL D (액티브 쇼트 서킷 세이프 스테이트)',effect:{asil:'D',req:'ASIL D',feats:{gate:['ASC (Active Short Circuit) 세이프 스테이트']}}}]}]};

T.dadu={key:'dadu',name:'Dadu ECU (12 V BLDC 구동)',re:/dadu|다두/i,
  defaults:['12 V 차량 배터리 (KL30 · 6–16 V · 로드덤프)','PMIC (5 V · 3.3 V · 워치독)','AURIX TC364 (TriCore 락스텝)','CAN-FD (중재 500 kbps · 데이터 2 Mbps)','12 V BLDC 3상 · 게이트 드라이버 + MOSFET 6개 브리지','홀 센서 ×3 · 센서 공급 9 V','PCB 온도 센서'],
  req:'12 V 차량 배터리, AURIX TC364, CAN-FD, BLDC 모터 구동(홀 센서 9 V), 게이트 드라이버, MOSFET 6개, PMIC, PCB 온도 센싱',
  blocks:[
    {id:'pin',group:'power',label:'Battery Input KL30 (12 V)',feats:['역전압 보호 (Reverse Polarity FET)','로드덤프 · 서지 보호 (TVS)','입력 π 필터'],impl:[{type:'pwr_in',params:{vin:12}}],why:'차량 배터리 직결'},
    {id:'sbc',group:'power',label:'PMIC (5 V · 3.3 V · WDT)',feats:['VCC_5V 5 V (CAN · 센서)','VCC_MCU 3.3 V','전원 감시 (UV/OV) · 워치독 · 리셋'],impl:[{type:'ldo',params:{vout:5}},{type:'ldo',params:{vout:3.3,vin:'+5V'}},{type:'supervisor',params:{}}],why:'MCU·CAN 전원과 감시'},
    {id:'hallps',group:'power',label:'Hall Sensor Supply 9 V',feats:['9 V 레귤레이터 (배터리 → 9 V)','센서 단락 보호 · 전류 제한','배터리 < 약 11 V(LDO)에서 9 V 유지 안 됨'],impl:[{type:'ldo',params:{vout:9}}],why:'홀 센서 공급 전압 9 V'},
    {id:'mcu',group:'ctrl',label:'Main MCU AURIX TC364',feats:['Core: AURIX TC36x (TriCore · 락스텝)','GTM PWM ×6 (3상)','홀 입력 ×3 (캡처 · 인터럽트)','ADC (상전류 · VBAT · 온도)'],impl:[{type:'mcu',params:{part:'TC364DP-64F300F'}},{type:'xtal',params:{}}],why:'모터 제어 · 통신'},
    {id:'canbus',group:'comm',label:'CAN-FD Bus (H / L)',ext:true,feats:['차량 네트워크 · UDS 진단'],why:'차량 통신'},
    {id:'canx',group:'comm',label:'CAN-FD Transceiver',feats:['중재 500 kbps · 데이터 2 Mbps','물리 계층 (5 V) · ESD · 종단'],impl:[{type:'can',params:{}}],why:'CAN 물리 계층'},
    {id:'gate',group:'io',label:'3-Phase Gate Driver',feats:['하이/로우 사이드 ×3 (부트스트랩)','게이트 진단 · 단락 · 저전압 보호','PWM ×6 · EN · nFAULT'],impl:[{type:'gdrv3',params:{i:20,hall:1,hallv:9}}],why:'3상 MOSFET 구동'},
    {id:'inv',group:'io',label:'MOSFET 6-Bridge (3-Phase)',feats:['N-MOSFET ×6 (40 V · 저 RDS(on))','상 션트 ×3','방열 (써멀 비아 · 하우징 접촉)'],why:'모터 전력단'},
    {id:'hall',group:'io',label:'Hall Sensor Interface ×3',feats:['홀 A/B/C 입력 (오픈 컬렉터)','풀업 3.3 V · RC 필터 · 클램프','센서 공급 9 V'],why:'회전자 위치 (6스텝 · 속도)'},
    {id:'isense',group:'io',label:'Phase Current / VBAT Monitor',feats:['상 션트 앰프 → ADC','VBAT 분압 감시','과전류 HW 감지'],impl:[{type:'vmon',params:{}}],why:'전류 제한 · 진단'},
    {id:'ptemp',group:'io',label:'PCB Temperature Sensor',feats:['NTC (MOSFET 브리지 근처)','ADC 입력 · 과열 디레이팅'],impl:[{type:'ntc',params:{n:1}}],why:'보드 과열 보호'},
    {id:'dbg',group:'io',label:'Debug / Calib. Interface',feats:['JTAG / DAP','UART','XCP over CAN'],impl:[{type:'uart',params:{}}],why:'개발 · 캘리브레이션'},
    {id:'conn',group:'ext',label:'Motor & Hall Connector',ext:true,feats:['3상 모터 U/V/W (고전류)','홀 센서 5핀 (9 V · A · B · C · GND)'],why:'외부 연결'}],
  links:[['pin','sbc','VBAT 12 V','power'],['pin','hallps','VBAT 12 V','power'],['hallps','hall','9 V Hall Supply','power'],['sbc','mcu','VCC_MCU 3.3 V · nRESET · WDI','power'],['sbc','canx','VCC_5V','power'],
    ['canbus','canx','CAN_H / CAN_L','bus'],['canx','mcu','TXD / RXD','signal'],['pin','gate','VBAT (게이트 전원)','power'],['mcu','gate','PWM ×6 · EN','signal'],['gate','mcu','nFAULT','safe'],['gate','inv','Gate ×6','signal'],['pin','inv','VBAT (Motor)','power'],
    ['inv','conn','Phase U/V/W','power'],['conn','hall','Hall A/B/C','signal'],['hall','mcu','Hall A/B/C (캡처)','signal'],['inv','isense','Shunt','signal'],['sbc','isense','VCC_MCU 3.3 V','power'],['isense','mcu','Analog Feedback (ADC)','signal'],
    ['sbc','ptemp','VCC_MCU 3.3 V','power'],['ptemp','mcu','NTC (ADC)','signal'],['sbc','dbg','VCC_MCU 3.3 V','power'],['dbg','mcu','JTAG / UART','signal']],
  questions:[
    {key:'cur',block:'gate',q:'모터 상전류 등급은?',why:'MOSFET 크기·병렬 수·션트·커넥터·방열이 정해집니다.',re:/\d+\s*a\b/i,
      options:[{label:'~20 A (팬 · 소형 펌프)',effect:{impl:{id:'gate',type:'gdrv3',params:{i:20}},feats:{inv:['상전류 20 A급']},req:'상전류 20 A'}},
               {label:'~40 A (펌프 · 블로어)',effect:{impl:{id:'gate',type:'gdrv3',params:{i:40}},feats:{inv:['상전류 40 A급 · MOSFET 병렬 ×2'],conn:['커넥터 40 A급']},req:'상전류 40 A'}},
               {label:'~80 A (액추에이터 · 대형 펌프)',effect:{impl:{id:'gate',type:'gdrv3',params:{i:80}},feats:{inv:['상전류 80 A급 · MOSFET 병렬 ×3 · 버스바'],conn:['커넥터 80 A급']},req:'상전류 80 A'}}]},
    {key:'hallps',block:'hallps',q:'홀 센서 9 V 전원은 크랭킹(배터리 6 V)에서도 유지해야 하나요?',why:'LDO는 배터리가 약 11 V 아래로 내려가면 9 V가 무너집니다. 유지하려면 벅부스트가 필요합니다.',re:/벅\s*부스트|buck-?boost|크랭킹/i,
      options:[{label:'아니오 — LDO 9 V (저가)',effect:{feats:{hallps:['LDO 9 V (TPS7B86-Q1 급, 드롭아웃 0.5 V)']}}},
               {label:'예 — 벅부스트 9 V (6–16 V 입력에서 유지)',effect:{feats:{hallps:['벅부스트 9 V (LM5176-Q1 · TPS55165-Q1 급) — 회로 생성 후 부품 지정']},req:'홀 전원 벅부스트'}}]},
    {key:'canfd',block:'canx',q:'CAN-FD 데이터 속도는?',why:'트랜시버 등급(SIC 여부)과 종단·배선이 달라집니다.',re:/\d\s*mbps/i,
      options:[{label:'중재 500 kbps · 데이터 2 Mbps',effect:{feats:{canx:['데이터 2 Mbps']}}},
               {label:'중재 500 kbps · 데이터 5 Mbps',effect:{feats:{canx:['데이터 5 Mbps — 신호 개선(SIC) 트랜시버 권장']},req:'CAN-FD 5 Mbps'}}]},
    {key:'asil',block:'mcu',q:'안전 등급은?',why:'PMIC(질의응답 워치독 · 세이프 스테이트)와 게이트 드라이버 진단 범위가 달라집니다.',re:/asil\s*[a-d]|\bqm\b/i,
      options:[{label:'QM',effect:{asil:'QM',req:'QM'}},{label:'ASIL B',effect:{asil:'B',req:'ASIL B'}},
               {label:'ASIL D',effect:{asil:'D',req:'ASIL D',feats:{sbc:['안전 PMIC · 질의응답 워치독 · FS0B'],gate:['게이트 드라이버 ASIL D (SPI 진단)']}}}]},
    {key:'temp',block:'ptemp',q:'PCB 온도 센서 위치·개수는?',why:'NTC 수와 MCU ADC 채널이 정해집니다.',re:/ntc\s*\d|온도\s*센서\s*\d/i,
      options:[{label:'1개 — MOSFET 브리지 근처',effect:{}},
               {label:'2개 — MOSFET 브리지 + MCU/PMIC 근처',effect:{impl:{id:'ptemp',type:'ntc',params:{n:2}},feats:{ptemp:['NTC ×2 (브리지 · 제어부)']}}}]}]};
/* ---- part candidates per block (several makers each): [mpn, maker, note] ---- */
const SBC=[['TLF35584QVVS2','Infineon','안전 PMIC · Q&A 워치독 · FS0B · ASIL D'],['TPS65381A-Q1','TI','안전 PMIC · 워치독 · 진단 · ASIL D'],['FS2600','NXP','FS26 안전 SBC · 다중 레일 · ASIL D'],['L9396','ST','차량용 안전 PMIC · 워치독']];
const MCU_D=[['TC364DP-64F300F','Infineon','AURIX TC36x 락스텝 · GTM · SENT · ASIL D'],['S32K344','NXP','Cortex-M7 락스텝 · ASIL D'],['SPC58EC80E5','ST','Power Architecture 락스텝 · ASIL D'],['RH850/U2A8','Renesas','락스텝 · ASIL D'],['TMS570LC4357','TI','Cortex-R5F 락스텝 · ASIL D']];
const MCU_B=[['S32K144','NXP','Cortex-M4F · ASIL B'],['SPC560P50','ST','Power Architecture · ASIL B'],['TC334LP','Infineon','AURIX 저가 · ASIL B'],['RH850/F1KM-S1','Renesas','ASIL B'],['STM32F042K6U6','ST','범용 (시제품)']];
const CANX=[['TJA1443AT','NXP','CAN-FD 5 Mbps · 슬립/웨이크'],['TLE9251VSJ','Infineon','CAN-FD 5 Mbps'],['TCAN1043-Q1','TI','CAN-FD · 웨이크 · 인히빗'],['MCP2542FD','Microchip','CAN-FD 8 Mbps'],['ATA6563','Microchip','CAN-FD 5 Mbps']];
const GATE3=[['TLE9180D-31QK','Infineon','3상 게이트 드라이버 · 진단 · 세이프티 FET 출력 · ASIL D'],['L9908','ST','3상 게이트 드라이버 · 안전 기능'],['DRV8353RS-Q1','TI','3상 게이트 드라이버 · 전류 센스 앰프 내장'],['GD3000','NXP','3상 프리드라이버 · 진단'],['A4919','Allegro','3상 게이트 드라이버 · 진단'],['A4911KJPTR-T-1','Allegro','3상 게이트 드라이버 · SPI 진단 · 센스 앰프 ×3 · ASIL D'],['A4918KJPTR-1A-3-T','Allegro','3상 게이트 드라이버 · 4.5 V 동작 · ASIL D']];
const FET40=[['IAUC60N04S6N050H','Infineon','하프브리지 OptiMOS 6 (상·하 2개 내장) · 40 V · 60 A · RDS(on) 5.0 mΩ max @10 V · Qg 13 nC · Vth 2.6 V · PG-TDSON-8-57 · AEC-Q101 — 6-브리지를 3개로'],['IPG20N04S4L-07','Infineon','듀얼 OptiMOS-T2 (독립 2개, 로직 레벨) · 40 V · 20 A · 7.2 mΩ @10 V / 9.2 mΩ @4.5 V · Qg 39 nC · Vth 1.7 V · PG-TDSON-8 · AEC-Q101 — 6개를 3개로'],['IAUC100N04S6N008','Infineon','40 V 0.8 mΩ OptiMOS'],['STL325N4LF8AG','ST','40 V 0.9 mΩ STripFET'],['BUK7S0R5-40H','Nexperia','40 V 0.5 mΩ LFPAK'],['NVMFS5C404N','onsemi','40 V 0.7 mΩ']];
const HALL9=[['TPS7B86-Q1','TI','가변 LDO 1.2–18 V · 500 mA · 40 V 입력 · 드롭아웃 0.5 V'],['LM317DCYR','TI','가변 LDO · 1.5 A · 40 V (상용 · 드롭아웃 ~2 V)'],['LM5176-Q1','TI','벅부스트 컨트롤러 (크랭킹 유지)']];
const NTC=[['NCU18XH103F60RB','Murata','NTC 10 kΩ 0603 · 차량용'],['NCP18XH103F03RB','Murata','NTC 10 kΩ 0603'],['TMP235-Q1','TI','아날로그 온도 IC · 10 mV/°C · SOT-23'],['B57861S0103F040','TDK','NTC 10 kΩ (리드)']];
const ISENSE=[['INA240A2-Q1','TI','션트 앰프 · PWM 제거 · 50 V/V'],['AD8418A','ADI','션트 앰프 · 양방향'],['TLE4972-AE35D5','Infineon','코어리스 전류 센서 · 과전류 핀'],['NCS21671','onsemi','션트 앰프 · 저오프셋']];
const PIN12=[['LM74700-Q1','TI','이상 다이오드 컨트롤러 (역접속)'],['LTC4359','ADI','이상 다이오드 컨트롤러'],['IPD90P04P4L-04','Infineon','P-FET 역접속 보호'],['SM8S33A','Littelfuse','로드덤프 TVS 6.6 kW']];
const HSD=[['BTS7008-2EPA','Infineon','PROFET+2 2ch 8 mΩ · 전류 센스'],['VND7050AJ','ST','VIPower 2ch 50 mΩ · 진단'],['TPS1HB16-Q1','TI','1ch 16 mΩ · 진단'],['MC12XS6','NXP','6ch HSD · SPI']];
const LSD=[['TLE6240GP','Infineon','16ch LSD · SPI 진단'],['L9733','ST','8ch LSD · SPI'],['DRV8912-Q1','TI','12ch 하프브리지 · 릴레이/모터'],['MC33879A','NXP','8ch LSD · 진단']];
const LINX=[['TJA1021T','NXP','LIN 2.2'],['TLE7259-3GE','Infineon','LIN 2.2A'],['TLIN1029-Q1','TI','LIN · 웨이크'],['MCP2003B','Microchip','LIN 2.2']];
const SBC_B=[['TLE9471ES','Infineon','SBC · CAN-FD · LDO · 워치독'],['MC33FS4500','NXP','FS45 SBC · CAN/LIN · 워치독'],['L9788','ST','SBC · CAN · LIN · LDO'],['TCAN4550-Q1','TI','CAN-FD SBC · LDO']];
const ISO_AFE=[['LTC6820','ADI','isoSPI 트랜시버'],['MC33664','NXP','TPL 절연 통신'],['TLE9015DQU','Infineon','isoUART 트랜시버'],['BQ79600-Q1','TI','절연 데이지체인 브리지']];
const ISOADC=[['AMC1306M05','TI','절연 ΔΣ 변조기 (션트)'],['ACS37002','Allegro','홀 전류 센서 · 400 kHz'],['TLI4971-A120T5','Infineon','코어리스 전류 센서'],['MAX22531','ADI','절연 4ch ADC']];
const HVM=[['AMC1311-Q1','TI','절연 전압 앰프'],['ACPL-C87B','Broadcom','절연 전압 센서'],['ISO224','TI','절연 앰프 ±12 V'],['ADuM4190','ADI','절연 오차 앰프']];
const GATEISO=[['1ED3491MC12M','Infineon','절연 게이트 드라이버 · DESAT · ASC'],['UCC5870-Q1','TI','절연 게이트 드라이버 · 진단 · SPI'],['STGAP3S','ST','갈바닉 절연 게이트 드라이버'],['ADuM4135','ADI','절연 게이트 드라이버 · 미러 클램프'],['NCD57000','onsemi','절연 게이트 드라이버 · DESAT']];
const PM=[['FS820R08A6P2','Infineon','HybridPACK Drive 750 V IGBT'],['CAB450M12XM3','Wolfspeed','1200 V SiC 모듈'],['NXH006P120MNF2','onsemi','1200 V SiC 모듈'],['FS600R10A6P2','Infineon','HybridPACK 1 IGBT']];
const RDC=[['AD2S1210','ADI','RDC 16비트 · 여자 출력'],['PGA411-Q1','TI','리졸버 IF · 여자 앰프 · 진단'],['TLE5012B','Infineon','GMR 각도 센서 (대체)']];
const ANG=[['TLE5012B','Infineon','GMR 각도 · SPI/SENT'],['AS5147P-Q1','ams OSRAM','AMR 각도 · SPI'],['ADA4571','ADI','AMR 각도 (아날로그)'],['MLX90380','Melexis','각도 센서 · SENT']];
const TORQ=[['MLX90372','Melexis','토크/각도 · SENT 이중'],['TLE4998S8','Infineon','선형 홀 · SENT'],['A1346','Allegro','선형 홀 · SENT'],['ADA4571','ADI','AMR (아날로그)']];
const PARTS={
  eps:{pin:PIN12,sbc:SBC,mcu:MCU_D,canx:CANX,gate:GATE3,inv:FET40,pcut:FET40,isense:ISENSE,tsens:TORQ,asens:ANG},
  bms:{pin:PIN12,sbc:SBC,mcu:MCU_D,canx:CANX,iso:ISO_AFE,cur:ISOADC,hvm:HVM,ctr:HSD},
  bcm:{pin:PIN12,sbc:SBC_B,mcu:MCU_B,canx:CANX,lin:LINX,hsd:HSD,lsd:LSD},
  inv:{pin:PIN12,sbc:SBC,mcu:MCU_D,canx:CANX,gate:GATEISO,pm:PM,isense:ISOADC,rdc:RDC,hvm:HVM},
  dadu:{pin:PIN12,sbc:SBC.concat(SBC_B),hallps:HALL9,mcu:MCU_D,canx:CANX,gate:GATE3,inv:FET40,isense:ISENSE,ptemp:NTC}};
const normPart=x=>{if(!x)return null;if(typeof x==='string')return{mpn:x,mfr:'',note:''};if(Array.isArray(x))return{mpn:S(x[0]),mfr:S(x[1]),note:S(x[2])};return{mpn:S(x.mpn||x.part),mfr:S(x.mfr||x.maker),note:S(x.note||x.desc),grade:S(x.grade)};};
function candidates(prof,id){const b=(prof.blocks||[]).find(x=>x.id===id);if(!b)return[];return(b.parts||[]).map(normPart).filter(p=>p&&p.mpn);}
/* ---- detection ---- */
function detect(text){const s=String(text||'');for(const k of Object.keys(T)){if(T[k].re.test(s)){const p=clone(T[k]);const P=PARTS[k]||{};for(const b of p.blocks){const c=P[b.id];if(c)b.parts=c.map(normPart);else b.parts=(b.parts||[]).map(normPart);}return p;}}return null;}
function clone(o){if(o==null||typeof o!=='object')return o;if(o instanceof RegExp||Object.prototype.toString.call(o)==='[object RegExp]')return new RegExp(o.source,o.flags);if(Array.isArray(o))return o.map(clone);const r={};for(const k of Object.keys(o))r[k]=clone(o[k]);return r;}
/* ---- apply profile + answers → architecture (needs HWARCH) ---- */
function apply(prof,answers,name,H){H=H||(typeof HWARCH!=='undefined'?HWARCH:null);if(!H)throw new Error('HWARCH 필요');
  const A=H.blank(name||prof.name);const log=[];const reqAdd=[];const dups=[];
  const addB=b=>{const g=H.gAlias(b.group)||'io';const impl=(b.impl||[]).filter(i=>i&&IMPLS.includes(i.type)).map(i=>({type:i.type,params:i.params||{}}));
    if(A.blocks.some(x=>x.id===b.id))return null;const nb=H.addBlock(A,g,b.label,{id:b.id,feats:b.feats||[],impl,ext:!!b.ext});if(b.asil)nb.asil=String(b.asil).toUpperCase();return nb;};
  const addL=l=>{try{H.link(A,l[0],l[1],l[2]||'',{kind:l[3]||undefined});}catch(e){log.push('링크 생략: '+l[0]+'→'+l[1]);}};
  (prof.blocks||[]).forEach(addB);(prof.links||[]).forEach(addL);
  let asil=null;
  for(const q of prof.questions||[]){const a=answers&&answers[q.key];if(a==null||a==='')continue;
    const parts=String(a).split(/,\s*/).map(s=>s.trim()).filter(Boolean);let matched=0;
    for(const p of parts){const opt=(q.options||[]).find(o=>o.label===p)||(q.options||[]).find(o=>o.label.toLowerCase().startsWith(p.toLowerCase()));
      if(!opt){const b=A.blocks.find(x=>x.id===q.block);if(b){b.feats.push('요구: '+p);log.push(`${q.block}: 요구 "${p}" 기록`);}reqAdd.push(p);continue;}
      matched++;const e=opt.effect||{};
      if(e.feats)for(const id of Object.keys(e.feats)){const b=A.blocks.find(x=>x.id===id);if(b)for(const f of e.feats[id])if(!b.feats.includes(f))b.feats.push(f);}
      if(e.add)e.add.forEach(addB);if(e.links)e.links.forEach(addL);
      if(e.remove)for(const id of e.remove){try{H.remove(A,id);log.push(`${id} 제거`);}catch(x){}}
      if(e.impl){const b=A.blocks.find(x=>x.id===e.impl.id);if(b){const im=(b.impl||[]).find(i=>i.type===e.impl.type);if(im)im.params=Object.assign({},im.params,e.impl.params||{});else b.impl=(b.impl||[]).concat([{type:e.impl.type,params:e.impl.params||{}}]);}}
      if(e.dup)dups.push(...e.dup);if(e.asil)asil=e.asil;if(e.req)reqAdd.push(e.req);
      log.push(`${q.block}: ${opt.label}`);}
  }
  for(const d of dups){const src=A.blocks.find(x=>x.id===d.id);if(!src)continue;for(let k=2;k<=(d.n||2);k++){const id=d.id+k;if(A.blocks.some(x=>x.id===id))continue;
    const nb=H.addBlock(A,src.group,src.label.replace(/\s*#\d+$/,'')+' #'+k,{id,feats:src.feats.filter(f=>!/^SW:/.test(f)).slice(),impl:clone(src.impl||[]),ext:src.ext});if(src.asil)nb.asil=src.asil;if(!/#1$/.test(src.label))src.label=src.label+' #1';
    for(const l of A.links.slice()){if(l.a===d.id)H.link(A,id,l.b,l.label+' #'+k,{kind:l.kind});else if(l.b===d.id)H.link(A,l.a,id,l.label+' #'+k,{kind:l.kind});}}}
  const req=[asil?S(prof.req).replace(/,?\s*ASIL\s*[A-D]/gi,''):S(prof.req)].concat(reqAdd).filter(Boolean).join(', ');
  return{arch:A,log,reqAdd,asil,req};}
/* ---- text ---- */
function summary(prof){const L=[`제품: ${prof.name}`];if(prof.defaults&&prof.defaults.length)L.push('표준 요구사항: '+prof.defaults.join(' · '));
  L.push(`필요 블록 ${(prof.blocks||[]).length}개:`);for(const b of prof.blocks||[])L.push(`  [${b.id}] ${b.label}${b.why?' — '+b.why:''}${b.parts&&b.parts.length?'\n      후보: '+b.parts.map(normPart).filter(Boolean).map(p=>p.mpn+(p.mfr?' ('+p.mfr+')':'')).join(' · '):''}`);
  return L.join('\n');}
/* ---- Claude: same shape for any product ---- */
function aiPrompt(req){const ex=clone(T.eps);ex.blocks=ex.blocks.slice(0,4);ex.links=ex.links.slice(0,3);ex.questions=ex.questions.slice(0,1);delete ex.re;
  return`You are an automotive electronics system architect. The user wants to design the product described below. If it is a known kind of product/ECU (automotive: EPS, BMS, BCM, inverter, OBC, DC/DC, TCU, ABS/ESC, airbag, cluster, telematics, lighting, HVAC, seat, door, sensor module … or any other product with a conventional architecture), produce its STANDARD profile: what such a board normally contains, before asking anything.
Return ONLY JSON with this shape (example, abbreviated):
${JSON.stringify(ex)}
Rules:
- "product": null if the request is not a recognizable product (then return {"product":null}).
- "defaults": 5-8 short Korean lines of the normal requirements (supply, MCU class, bus, actuation/sensing, safety level, temperature/EMC).
- "req": one Korean line of requirement keywords a rules engine can read (e.g. "12 V 차량 배터리, AURIX TC364, CAN-FD, BLDC 모터 구동(홀), ASIL D").
- "blocks": EVERY HW block the product normally has (8-16): id (short lowercase ascii), group one of ${GROUPS.join('|')}, Korean/English label ≤ 40 chars, 2-4 feats, optional impl from ${IMPLS.join('|')} with params like the example (mcu part: "TC364DP-64F300F" or "STM32F042K6U6"; ldo vout; pwr_in vin; led n; button n; dcmotor shunt; bldc hall), parts: 3-5 candidate ICs from DIFFERENT makers as objects {mpn, mfr, note, grade} (real orderable part numbers, AEC-Q100 where it applies; note = one short Korean line on what sets it apart), why. Use ids pin, sbc or reg, mcu, canbus, canx, conn, dbg where they apply; set "ext": true for buses/connectors.
- "links": every interface between blocks [from, to, label, kind power|signal|bus|safe].
- "questions": 3-6 questions, each tied to a block, ONLY about facts that change the architecture and that the request does not already state (type/current class, sensor interface, bus, redundancy, safety level, channel counts). Each option has an "effect": feats {blockId:[...]}, add [blocks], links, remove [ids], impl {id,type,params}, dup [{id,n}], asil "A|B|C|D|QM", req "keywords". Use "multi": true only when several options can be chosen together.
- Answer everything in Korean except ids/part numbers. No prose outside the JSON.

Request: ${req}`;}
function fromAi(o){if(!o||typeof o!=='object'||!o.product||!Array.isArray(o.blocks)||!o.blocks.length)return null;
  const p={key:'ai',name:S(o.name||o.product),defaults:Array.isArray(o.defaults)?o.defaults.map(S).filter(Boolean):[],req:S(o.req),blocks:[],links:[],questions:[]};
  const seen=new Set();for(const b of o.blocks){const id=S(b.id).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,16);if(!id||seen.has(id)||!S(b.label))continue;seen.add(id);
    p.blocks.push({id,group:S(b.group)||'io',label:S(b.label).slice(0,40),feats:Array.isArray(b.feats)?b.feats.map(S).filter(Boolean).slice(0,6):[],impl:Array.isArray(b.impl)?b.impl.filter(i=>i&&IMPLS.includes(i.type)).map(i=>({type:i.type,params:i.params&&typeof i.params==='object'?i.params:{}})):[],ext:!!b.ext,parts:Array.isArray(b.parts)?b.parts.map(normPart).filter(x=>x&&x.mpn).slice(0,5):[],why:S(b.why)});}
  for(const l of o.links||[]){if(Array.isArray(l)&&l.length>=2)p.links.push([S(l[0]),S(l[1]),S(l[2]),S(l[3])]);else if(l&&l.from)p.links.push([S(l.from),S(l.to),S(l.label),S(l.kind)]);}
  for(const q of o.questions||[]){if(!q||!S(q.q))continue;const opts=(q.options||[]).map(x=>typeof x==='string'?{label:x,effect:{}}:x).filter(x=>x&&S(x.label)).map(x=>({label:S(x.label).slice(0,60),effect:x.effect&&typeof x.effect==='object'?x.effect:{}}));if(!opts.length)continue;
    p.questions.push({key:S(q.key)||'q'+(p.questions.length+1),block:S(q.block),q:S(q.q),why:S(q.why),multi:!!q.multi,options:opts});}
  return p;}
return{T,PARTS,detect,apply,summary,aiPrompt,fromAi,candidates,normPart,GROUPS,IMPLS};
})();
if(typeof module!=='undefined')module.exports=PRODUCTS;
