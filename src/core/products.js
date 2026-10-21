/* ---------- product profiles: standard HW blocks + per-block Q&A for automotive ECUs ----------
   A profile says what a product (EPS, BMS, BCM, inverter …) normally contains: standard requirement defaults,
   the HW blocks it always has (with features / circuit implementation), the interfaces between them, and the
   few questions whose answers change that architecture (type, current class, sensor interface, redundancy …).
   Each answer option carries an "effect" that edits the architecture deterministically, so the diagram is built
   without a second AI round. Claude produces the same shape for any product (aiPrompt/fromAi); the built-in
   templates are the deterministic fallback and the worked example in the prompt. */
const PRODUCTS=(()=>{
const GROUPS=['power','comm','ctrl','io','ext'];
const IMPLS=['pwr_in','usb_in','ldo','buck','mcu','xtal','can','bldc','dcmotor','led','button','flash','uart','i2c','supervisor','hs_switch','vmon','part'];
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
    {id:'gate',group:'io',label:'3-Phase Gate Driver',feats:['MOSFET 6개 제어 (부트스트랩 · 차지펌프)','게이트 진단 · 단락 보호','PWM ×3 · 상 전류 리드백'],impl:[{type:'bldc',params:{hall:0}}],parts:['TLE9180','L9908'],why:'3상 인버터 구동'},
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
      options:[{label:'컬럼 타입 (C-EPS) · 상전류 ~60 A',effect:{feats:{inv:['상전류 60 A급 · MOSFET ×6'],conn:['커넥터 60 A급']},req:'컬럼 타입 60 A'}},
               {label:'듀얼 피니언 / 랙 타입 · ~120 A',effect:{feats:{inv:['상전류 120 A급 · MOSFET ×6 병렬 ×2'],conn:['커넥터 120 A급 · 버스바']},req:'랙 타입 120 A'}},
               {label:'상용차 랙 타입 · ~200 A',effect:{feats:{inv:['상전류 200 A급 · MOSFET 병렬 ×3 · 버스바'],conn:['버스바 단자 200 A']},req:'상용차 200 A'}}]},
    {key:'torque',block:'tsens',q:'토크 센서 인터페이스는?',why:'MCU 핀·센서 전원·진단 방식이 정해집니다.',re:/sent|psi5|아날로그\s*토크|torque/i,
      options:[{label:'SENT 이중 채널',effect:{feats:{tsens:['SENT ×2 (SAE J2716)'],mcu:['SENT IF ×2']},req:'토크센서 SENT'}},
               {label:'아날로그 이중 채널 (비율 출력)',effect:{feats:{tsens:['아날로그 ×2 (0.5–4.5 V) · 상호 비교'],mcu:['ADC ×2 토크']},req:'토크센서 아날로그 이중'}},
               {label:'PSI5',effect:{feats:{tsens:['PSI5 트랜시버 · 센서 전원 라인 변조'],mcu:['PSI5 IF']},req:'토크센서 PSI5'}}]},
    {key:'angle',block:'asens',q:'모터 위치 / 조향각 센서는?',why:'센서 IF 블록과 센서 전원 이중화가 달라집니다.',re:/리졸버|resolver|mr\s*센서|홀\s*센서|hall|각도\s*센서/i,
      options:[{label:'MR 각도 센서 ×2 (SPI/SENT)',effect:{feats:{asens:['MR 각도 센서 ×2 · SPI']}}},
               {label:'리졸버 (여자 회로 + RDC)',effect:{feats:{asens:['리졸버 여자 앰프 · RDC (AD2S1210 급)']},req:'리졸버'}},
               {label:'홀 센서 ×3 (저가)',effect:{feats:{asens:['홀 센서 ×3 · 디지털 입력']},impl:{id:'gate',type:'bldc',params:{hall:1}},req:'홀 센서'}}]},
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
      options:[{label:'없음 (릴레이로 구동)',effect:{}},{label:'H-브리지 DC 모터 ×1–2',effect:{add:[{id:'hb',group:'io',label:'H-Bridge Motor Driver',feats:['DC 모터 ×2 · 전류 센싱'],impl:[{type:'dcmotor',params:{shunt:1}}]}],links:[['mcu','hb','PWM / EN','signal'],['pin','hb','VBAT','power'],['hb','conn','Motor','power']],req:'DC 모터 2개'}}]},
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
/* ---- detection ---- */
function detect(text){const s=String(text||'');for(const k of Object.keys(T)){if(T[k].re.test(s))return clone(T[k]);}return null;}
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
  L.push(`필요 블록 ${(prof.blocks||[]).length}개:`);for(const b of prof.blocks||[])L.push(`  [${b.id}] ${b.label}${b.parts&&b.parts.length?' ('+b.parts.join(', ')+')':''}${b.why?' — '+b.why:''}`);
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
- "blocks": EVERY HW block the product normally has (8-16): id (short lowercase ascii), group one of ${GROUPS.join('|')}, Korean/English label ≤ 40 chars, 2-4 feats, optional impl from ${IMPLS.join('|')} with params like the example (mcu part: "TC364DP-64F300F" or "STM32F042K6U6"; ldo vout; pwr_in vin; led n; button n; dcmotor shunt; bldc hall), optional parts (2 typical part numbers), why. Use ids pin, sbc or reg, mcu, canbus, canx, conn, dbg where they apply; set "ext": true for buses/connectors.
- "links": every interface between blocks [from, to, label, kind power|signal|bus|safe].
- "questions": 3-6 questions, each tied to a block, ONLY about facts that change the architecture and that the request does not already state (type/current class, sensor interface, bus, redundancy, safety level, channel counts). Each option has an "effect": feats {blockId:[...]}, add [blocks], links, remove [ids], impl {id,type,params}, dup [{id,n}], asil "A|B|C|D|QM", req "keywords". Use "multi": true only when several options can be chosen together.
- Answer everything in Korean except ids/part numbers. No prose outside the JSON.

Request: ${req}`;}
function fromAi(o){if(!o||typeof o!=='object'||!o.product||!Array.isArray(o.blocks)||!o.blocks.length)return null;
  const p={key:'ai',name:S(o.name||o.product),defaults:Array.isArray(o.defaults)?o.defaults.map(S).filter(Boolean):[],req:S(o.req),blocks:[],links:[],questions:[]};
  const seen=new Set();for(const b of o.blocks){const id=S(b.id).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,16);if(!id||seen.has(id)||!S(b.label))continue;seen.add(id);
    p.blocks.push({id,group:S(b.group)||'io',label:S(b.label).slice(0,40),feats:Array.isArray(b.feats)?b.feats.map(S).filter(Boolean).slice(0,6):[],impl:Array.isArray(b.impl)?b.impl.filter(i=>i&&IMPLS.includes(i.type)).map(i=>({type:i.type,params:i.params&&typeof i.params==='object'?i.params:{}})):[],ext:!!b.ext,parts:Array.isArray(b.parts)?b.parts.map(S).filter(Boolean).slice(0,3):[],why:S(b.why)});}
  for(const l of o.links||[]){if(Array.isArray(l)&&l.length>=2)p.links.push([S(l[0]),S(l[1]),S(l[2]),S(l[3])]);else if(l&&l.from)p.links.push([S(l.from),S(l.to),S(l.label),S(l.kind)]);}
  for(const q of o.questions||[]){if(!q||!S(q.q))continue;const opts=(q.options||[]).map(x=>typeof x==='string'?{label:x,effect:{}}:x).filter(x=>x&&S(x.label)).map(x=>({label:S(x.label).slice(0,60),effect:x.effect&&typeof x.effect==='object'?x.effect:{}}));if(!opts.length)continue;
    p.questions.push({key:S(q.key)||'q'+(p.questions.length+1),block:S(q.block),q:S(q.q),why:S(q.why),multi:!!q.multi,options:opts});}
  return p;}
return{T,detect,apply,summary,aiPrompt,fromAi,GROUPS,IMPLS};
})();
if(typeof module!=='undefined')module.exports=PRODUCTS;
