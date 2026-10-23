/* Key-part candidates per system block, ranked for the requirement.
   For every circuit implementation type (ldo, buck, can, gdrv3 …) a short list of representative parts with the specs that
   decide fitness (current, input voltage, channels, package), qualification (AEC-Q100/Q101, ASIL support), a reference
   price and a one-line reason. rank(block, ctx) merges the product profile's own candidates (first), the library's parts
   and these lists, drops what cannot meet the block's current / voltage, and scores the rest for the requirement:
   safety (ASIL), automotive grade, price, pin data on hand (circuit can be generated at once), fit to the requested
   priority (price · features · extensibility). Reference figures only — stock, price and life cycle need the part API. */
const PARTRANK=(function(){
"use strict";
const C={
  pwr_in:[
    {mpn:'LM74700-Q1',mfr:'TI',note:'이상 다이오드 컨트롤러 + 외부 N-FET · 역접속 · 3–65 V',spec:{vin:[3,65],i:20,pkg:'SOT-23-6'},grade:'Q100',price:1.1,why:'손실 적은 역접속 보호, 차량용'},
    {mpn:'LM74701QDDFRQ1',mfr:'TI',note:'이상 다이오드 컨트롤러 · TVS 없이 역접속 보호 · 3.2–65 V',spec:{vin:[3.2,65],i:20,pkg:'SOT-23-8'},grade:'Q100',price:1.2,why:'입력 TVS 생략 가능(부품 절감)'},
    {mpn:'LTC4359',mfr:'ADI',note:'이상 다이오드 컨트롤러 · 4–80 V · 로드덤프 내성',spec:{vin:[4,80],i:20,pkg:'MSOP-8'},grade:'Q100',price:2.4,why:'80 V 입력, 로드덤프 100 V 과도 내성'},
    {mpn:'IPD90P04P4L-04',mfr:'Infineon',note:'P-FET 역접속 보호 · 40 V · 90 A',spec:{vin:[0,40],i:90,pkg:'TO-252'},grade:'Q101',price:1.6,why:'부품 하나로 끝나는 고전류 역접속 보호'},
    {mpn:'SM8S33A',mfr:'Littelfuse',note:'로드덤프 TVS 6.6 kW · 33 V',spec:{vin:[0,33],pkg:'DO-218AB'},grade:'Q101',price:0.9,why:'ISO 7637 로드덤프 흡수(보호 소자)'}],
  ldo:[
    {mpn:'TLV1117LV33QDCYRQ1',mfr:'TI',note:'1 A LDO 3.3 V · SOT-223 · AMS1117 핀 호환',spec:{i:1,vin:[2.5,5.5],vout:3.3,pkg:'SOT-223'},grade:'Q100',price:0.62,why:'저가·핀 호환, 5 V → 3.3 V'},
    {mpn:'TPS7B8133QDRVRQ1',mfr:'TI',note:'300 mA LDO 3.3 V · 40 V 입력 · 저 Iq 2.4 µA · WSON-6',spec:{i:0.3,vin:[4,40],vout:3.3,pkg:'WSON-6'},grade:'Q100',price:0.95,why:'배터리 직결 · 상시 전원(저 대기 전류)'},
    {mpn:'UA78M33QDCYRQ1',mfr:'TI',note:'500 mA LDO 3.3 V · 25 V 입력 · SOT-223',spec:{i:0.5,vin:[5.3,25],vout:3.3,pkg:'SOT-223'},grade:'Q100',price:0.35,why:'가장 싼 차량용 3.3 V'},
    {mpn:'UA78M05QDCYRQ1',mfr:'TI',note:'500 mA LDO 5 V · 25 V 입력 · SOT-223',spec:{i:0.5,vin:[7,25],vout:5,pkg:'SOT-223'},grade:'Q100',price:0.35,why:'12 V → 5 V 저가 차량용'},
    {mpn:'TLV76733QWDRBRQ1',mfr:'TI',note:'1 A LDO 3.3 V · 16 V 입력 · EN · VSON-8',spec:{i:1,vin:[2.5,16],vout:3.3,pkg:'VSON-8'},grade:'Q100',price:0.55,why:'1 A 차량용 · 5 V → 3.3 V'},
    {mpn:'TLV76750QWDRBRQ1',mfr:'TI',note:'1 A LDO 5 V · 16 V 입력 · EN · VSON-8',spec:{i:1,vin:[6,16],vout:5,pkg:'VSON-8'},grade:'Q100',price:0.55,why:'1 A 차량용 5 V'},
    {mpn:'MCP1799T-3302H/TT',mfr:'Microchip',note:'80 mA LDO 3.3 V · 45 V 입력 · SOT-23',spec:{i:0.08,vin:[4.5,45],vout:3.3,pkg:'SOT-23'},grade:'Q100',price:0.4,why:'배터리 직결 소전류(상시 전원)'},
    {mpn:'MCP1799T-5002H/TT',mfr:'Microchip',note:'80 mA LDO 5 V · 45 V 입력 · SOT-23',spec:{i:0.08,vin:[6,45],vout:5,pkg:'SOT-23'},grade:'Q100',price:0.4,why:'배터리 직결 소전류 5 V'},
    {mpn:'NCV8664CST33T3G',mfr:'onsemi',note:'150 mA LDO 3.3 V · 45 V · 저 Iq',spec:{i:0.15,vin:[4,45],vout:3.3,pkg:'SOT-223'},grade:'Q100',price:0.7,why:'KL30 상시 전원용'},
    {mpn:'MIC5219-3.3YM5',mfr:'Microchip',note:'500 mA LDO 3.3 V · SOT-23-5',spec:{i:0.5,vin:[2.5,12],vout:3.3,pkg:'SOT-23-5'},grade:'',price:0.5,why:'상용 소형·저가'},
    {mpn:'AMS1117-3.3',mfr:'AMS',note:'1 A LDO 3.3 V · SOT-223 (상용)',spec:{i:1,vin:[4.5,15],vout:3.3,pkg:'SOT-223'},grade:'',price:0.12,why:'가장 싼 범용 LDO'}],
  buck:[
    {mpn:'TPS54331QDRQ1',mfr:'TI',note:'3 A 동기 벅 · 3.5–28 V · 570 kHz',spec:{i:3,vin:[3.5,28],pkg:'SOIC-8'},grade:'Q100',price:1.4,why:'12 V → 5/3.3 V 범용 차량용 벅'},
    {mpn:'LMR33630AQRNXRQ1',mfr:'TI',note:'3 A 동기 벅 · 3.8–36 V · 400 kHz · 소형',spec:{i:3,vin:[3.8,36],pkg:'VQFN-12'},grade:'Q100',price:1.9,why:'36 V 입력(로드덤프 여유)·고효율'},
    {mpn:'TLF4277-2LD',mfr:'Infineon',note:'400 mA LDO+벅 복합 · 전류 센스',spec:{i:0.4,vin:[3,40],pkg:'VQFN-24'},grade:'Q100',price:2.2,why:'전류 센스 내장 진단'},
    {mpn:'MP2451DJ-LF-Z',mfr:'MPS',note:'600 mA 벅 · 4.5–36 V',spec:{i:0.6,vin:[4.5,36],pkg:'TSOT-23-6'},grade:'',price:0.6,why:'상용 소형 저가'},
    {mpn:'MP1584EN',mfr:'MPS',note:'3 A 벅 · 4.5–28 V (상용)',spec:{i:3,vin:[4.5,28],pkg:'SOIC-8'},grade:'',price:0.5,why:'가장 싼 3 A 벅'}],
  supervisor:[
    {mpn:'TLF35584QVVS2',mfr:'Infineon',note:'안전 PMIC · Q&A 워치독 · FS0B · ASIL D',spec:{pkg:'VQFN-48'},grade:'Q100',asil:'D',price:7.5,why:'AURIX와 짝을 이루는 안전 SBC'},
    {mpn:'TPS65381A-Q1',mfr:'TI',note:'안전 PMIC · 워치독 · 진단 · ASIL D',spec:{pkg:'HTSSOP-32'},grade:'Q100',asil:'D',price:6.8,why:'TI MCU와 짝, 자기 진단'},
    {mpn:'FS2600',mfr:'NXP',note:'FS26 안전 SBC · 다중 레일 · ASIL D',spec:{pkg:'QFN-48'},grade:'Q100',asil:'D',price:7.2,why:'S32K와 짝'},
    {mpn:'TPS3823-33QDBVRQ1',mfr:'TI',note:'전원 감시 + 윈도우 없는 워치독 · SOT-23-5',spec:{pkg:'SOT-23-5'},grade:'Q100',asil:'B',price:0.95,why:'ASIL B까지 저가 외부 워치독'},
    {mpn:'MAX6369KA+T',mfr:'ADI',note:'윈도우 워치독 · 핀 선택 타임아웃',spec:{pkg:'SOT-23-8'},grade:'',asil:'B',price:1.8,why:'윈도우 워치독(상용)'}],
  can:[
    {mpn:'TJA1463ATK/0Z',mfr:'NXP',note:'CAN-FD 8 Mbit/s · 신호 개선(SIC) · 슬립·웨이크',spec:{pkg:'HVSON-14',fd:1},grade:'Q100',price:1.6,why:'CAN SIC, 링 버스 품질'},
    {mpn:'TCAN1044AVDRQ1',mfr:'TI',note:'CAN-FD 5 Mbit/s · 대기 모드 · 3.3/5 V I/O',spec:{pkg:'SOIC-8',fd:1},grade:'Q100',price:0.9,why:'저가 CAN-FD, 3.3 V MCU 직결'},
    {mpn:'MCP2562FD-E/SN',mfr:'Microchip',note:'CAN-FD 8 Mbit/s · 1.8–5.5 V I/O',spec:{pkg:'SOIC-8',fd:1},grade:'Q100',price:1.0,why:'범용 CAN-FD'},
    {mpn:'TJA1042T/3',mfr:'NXP',note:'CAN-FD 5 Mbit/s · VIO 분리 · 대기 모드',spec:{pkg:'SOIC-8',fd:1},grade:'Q100',price:0.75,why:'가장 많이 쓰는 차량용 CAN-FD'},
    {mpn:'TJA1049T/3',mfr:'NXP',note:'CAN-FD 5 Mbit/s · VIO 분리 · 대기 모드 · 저 Iq',spec:{pkg:'SOIC-8',fd:1},grade:'Q100',price:0.8,why:'TJA1042 개량(대기 전류↓)'},
    {mpn:'TCAN1043HDRQ1',mfr:'TI',note:'CAN-FD 5 Mbit/s · 슬립 · INH 전원 제어 · WAKE · nFAULT',spec:{pkg:'SOIC-14',fd:1},grade:'Q100',price:1.4,why:'KL30 상시 전원 ECU의 슬립·웨이크(INH로 레귤레이터 제어)'},
    {mpn:'TJA1145T/FD',mfr:'NXP',note:'CAN 부분 네트워킹 · SPI · INH · WAKE · FD 수동',spec:{pkg:'SOIC-14',fd:1},grade:'Q100',price:1.9,why:'부분 네트워킹(선택 웨이크)'},
    {mpn:'TCAN4551RGYRQ1',mfr:'TI',note:'SPI CAN-FD 컨트롤러 + 트랜시버 · 5 Mbit/s · VQFN-20',spec:{pkg:'VQFN-20',fd:1},grade:'Q100',price:3.2,why:'MCU에 CAN-FD가 없을 때 SPI로 추가'},
    {mpn:'TJA1051T/3',mfr:'NXP',note:'고속 CAN 1 Mbit/s(클래식) · 3.3 V I/O',spec:{pkg:'SOIC-8',fd:0},grade:'Q100',price:0.8,why:'클래식 CAN 저가'},
    {mpn:'SN65HVD230DR',mfr:'TI',note:'3.3 V CAN 트랜시버(산업용)',spec:{pkg:'SOIC-8',fd:0},grade:'',price:1.3,why:'3.3 V 단일 전원 상용'}],
  mcu:[
    {mpn:'TC364DP-64F300F',mfr:'Infineon',note:'AURIX TC36x · 락스텝 · GTM · SENT · ASIL D',spec:{pkg:'LQFP-144'},grade:'Q100',asil:'D',price:18,why:'ASIL D 구동·모터 제어 표준'},
    {mpn:'S32K344',mfr:'NXP',note:'Cortex-M7 락스텝 · 1 MB · CAN-FD ×6 · ASIL D',spec:{pkg:'MAPBGA-172'},grade:'Q100',asil:'D',price:14,why:'ASIL D, 소프트웨어 생태계'},
    {mpn:'TMS570LC4357',mfr:'TI',note:'Cortex-R5F 락스텝 · ASIL D',spec:{pkg:'nFBGA-337'},grade:'Q100',asil:'D',price:22,why:'Hercules 안전 MCU'},
    {mpn:'S32K144',mfr:'NXP',note:'Cortex-M4F 112 MHz · 512 KB · CAN-FD · ASIL B',spec:{pkg:'LQFP-100'},grade:'Q100',asil:'B',price:6,why:'ASIL B 바디·센서 노드 표준'},
    {mpn:'STM32G474RET6',mfr:'ST',note:'Cortex-M4 170 MHz · 고분해능 PWM · 상용',spec:{pkg:'LQFP-64'},grade:'',asil:'',price:5.5,why:'모터 제어 상용(HRTIM)'},
    {mpn:'STM32F042K6U6',mfr:'ST',note:'Cortex-M0 48 MHz · CAN · USB · 저가',spec:{pkg:'QFN-32'},grade:'',asil:'',price:2.2,why:'가장 싼 CAN MCU'}],
  gdrv3:[
    {mpn:'TLE9180D-31QK',mfr:'Infineon',note:'3상 게이트 드라이버 · 진단 · 세이프티 FET 출력 · ASIL D',spec:{v:60,pkg:'TQFP-64'},grade:'Q100',asil:'D',price:9,why:'EPS·브레이크급 안전 드라이버'},
    {mpn:'L9908',mfr:'ST',note:'3상 게이트 드라이버 · 안전 기능 · 전류 센스 앰프 ×3',spec:{v:75,pkg:'TQFP-64'},grade:'Q100',asil:'D',price:8,why:'48 V 시스템까지'},
    {mpn:'DRV8353RS-Q1',mfr:'TI',note:'3상 게이트 드라이버 · 벅 · 전류 센스 앰프 ×3 · SPI',spec:{v:100,pkg:'VQFN-56'},grade:'Q100',asil:'',price:6.5,why:'센스 앰프·벅 내장으로 부품 절감'},
    {mpn:'GD3000',mfr:'NXP',note:'3상 프리드라이버 · 진단 · SPI',spec:{v:40,pkg:'LQFP-32'},grade:'Q100',asil:'',price:4.5,why:'저가 차량용 프리드라이버'},
    {mpn:'A4919',mfr:'Allegro',note:'3상 게이트 드라이버 · 진단',spec:{v:50,pkg:'QFN-28'},grade:'Q100',asil:'',price:5,why:'소형'},
    {mpn:'DRV8302DCAR',mfr:'TI',note:'3상 게이트 드라이버 · 벅 · 센스 앰프 ×2 (상용)',spec:{v:60,pkg:'HTSSOP-56'},grade:'',asil:'',price:5.8,why:'상용 저가'}],
  hbridge:[
    {mpn:'IR2104S',mfr:'Infineon',note:'하프브리지 드라이버 ×2 · 600 V · 부트스트랩',spec:{v:600,pkg:'SOIC-8'},grade:'',price:1.2,why:'외부 FET H-브리지 기본 드라이버(저가)'},
    {mpn:'DRV8701ERGER',mfr:'TI',note:'H-브리지 게이트 드라이버 · 전류 레귤레이션 · 진단',spec:{v:45,pkg:'VQFN-24'},grade:'',price:2.6,why:'전류 제한·보호 내장'},
    {mpn:'DRV8706S-Q1',mfr:'TI',note:'H-브리지 게이트 드라이버 · 40 V · SPI 진단 · 전류 센스 앰프',spec:{v:40,pkg:'VQFN-32'},grade:'Q100',price:3.4,why:'차량용 DC 모터·솔레노이드'},
    {mpn:'TLE9201SG',mfr:'Infineon',note:'H-브리지 내장 6 A · 진단',spec:{v:40,i:6,pkg:'DSO-12'},grade:'Q100',price:2.9,why:'6 A까지 FET 내장(부품 수 최소)'},
    {mpn:'BTN9970LV',mfr:'Infineon',note:'하프브리지 내장 40 A ×2 사용 · 전류 센스',spec:{v:40,i:40,pkg:'TSDSO-14'},grade:'Q100',price:4.2,why:'고전류 집적 하프브리지'}],
  bldc:[
    {mpn:'DRV8313PWPR',mfr:'TI',note:'3상 드라이버 FET 내장 2.5 A · 60 V',spec:{v:60,i:2.5,pkg:'HTSSOP-28'},grade:'',price:2.6,why:'소형 BLDC 팬·펌프'},
    {mpn:'TLE9879QXA40',mfr:'Infineon',note:'BLDC 드라이버 + MCU(Cortex-M3) SoC · 40 V',spec:{v:40,pkg:'VQFN-48'},grade:'Q100',price:3.8,why:'모터 제어 단일 칩(차량용)'},
    {mpn:'MCF8316A',mfr:'TI',note:'센서리스 FOC 내장 · 8 A 피크',spec:{v:35,i:8,pkg:'VQFN-40'},grade:'',price:5,why:'코드 없는 FOC'},
    {mpn:'A4964',mfr:'Allegro',note:'센서리스 BLDC 컨트롤러 + 프리드라이버 · 50 V',spec:{v:50,pkg:'TSSOP-28'},grade:'Q100',price:4.5,why:'차량용 펌프·팬'}],
  dcmotor:[
    {mpn:'IPD90N04S4-04',mfr:'Infineon',note:'N-MOSFET 40 V · 90 A · 4 mΩ',spec:{v:40,i:90,pkg:'TO-252'},grade:'Q101',price:1.1,why:'로우사이드 스위치 기본'},
    {mpn:'BTS3011TE',mfr:'Infineon',note:'보호형 로우사이드 스위치 · 진단',spec:{v:40,i:5,pkg:'PG-SOT223'},grade:'Q100',price:1.4,why:'단락·과온 보호 내장'},
    {mpn:'VND7050AJ',mfr:'ST',note:'보호형 하이사이드 ×2 · 전류 센스',spec:{v:41,i:7,pkg:'PowerSSO-24'},grade:'Q100',price:2.4,why:'전류 리드백 진단'},
    {mpn:'AO3400A',mfr:'AOS',note:'N-MOSFET 30 V · 5.7 A · SOT-23 (상용)',spec:{v:30,i:5.7,pkg:'SOT-23'},grade:'',price:0.08,why:'가장 싼 소형 스위치'}],
  hs_switch:[
    {mpn:'BTS7008-2EPA',mfr:'Infineon',note:'PROFET+2 하이사이드 ×2 · 전류 센스 · 진단',spec:{v:28,i:5,pkg:'TSDSO-14'},grade:'Q100',price:2.1,why:'바디 부하 표준'},
    {mpn:'VN7050AJ',mfr:'ST',note:'VIPower 하이사이드 · 전류 센스',spec:{v:41,i:7,pkg:'PowerSSO-16'},grade:'Q100',price:1.9,why:'전류 센스 진단'},
    {mpn:'TPS1H100-Q1',mfr:'TI',note:'스마트 하이사이드 · 전류 센스 · 40 V',spec:{v:40,i:2,pkg:'HTSSOP-14'},grade:'Q100',price:1.7,why:'소형 부하'},
    {mpn:'BTS50010-1TAD',mfr:'Infineon',note:'PROFET 10 mΩ 하이사이드 · 고전류',spec:{v:28,i:40,pkg:'TO-263-7'},grade:'Q100',price:3.5,why:'40 A급 상 차단·메인 스위치'}],
  vmon:[
    {mpn:'INA181A1QDBVRQ1',mfr:'TI',note:'전류 센스 앰프 ×20 · 26 V · 양방향',spec:{pkg:'SOT-23-6'},grade:'Q100',price:0.75,why:'션트 전류 센싱 기본'},
    {mpn:'INA240A2QPWRQ1',mfr:'TI',note:'전류 센스 앰프 ×50 · PWM 동상 제거 · 80 V',spec:{pkg:'TSSOP-8'},grade:'Q100',price:1.9,why:'인버터 상 션트(PWM 노이즈 제거)'},
    {mpn:'TLE4972',mfr:'Infineon',note:'코어리스 홀 전류 센서 · 절연',spec:{pkg:'TISON-8'},grade:'Q100',price:2.8,why:'션트 없는 절연 전류 센싱'},
    {mpn:'MAX40056FAUA+',mfr:'ADI',note:'양방향 전류 센스 앰프 · 65 V · PWM 제거',spec:{pkg:'µMAX-8'},grade:'',price:2.3,why:'상용 고전압 센싱'}],
  flash:[
    {mpn:'W25Q64JVSSIQ',mfr:'Winbond',note:'64 Mbit SPI NOR · 133 MHz',spec:{pkg:'SOIC-8'},grade:'',price:0.9,why:'범용 로그·설정 저장'},
    {mpn:'MX25L6433F',mfr:'Macronix',note:'64 Mbit SPI NOR',spec:{pkg:'SOIC-8'},grade:'',price:0.85,why:'핀 호환 대체'},
    {mpn:'IS25LP064A-JBLA3',mfr:'ISSI',note:'64 Mbit SPI NOR · 차량용 등급',spec:{pkg:'SOIC-8'},grade:'Q100',price:1.3,why:'AEC-Q100'},
    {mpn:'AT25SF641B-SHB-T',mfr:'Renesas',note:'64 Mbit SPI NOR · 차량용',spec:{pkg:'SOIC-8'},grade:'Q100',price:1.4,why:'AEC-Q100'}],
  uart:[
    {mpn:'MAX3232EIDR',mfr:'TI',note:'RS-232 트랜시버 ×2 · 3–5.5 V',spec:{pkg:'SOIC-16'},grade:'',price:0.9,why:'디버그 시리얼 레벨 변환'},
    {mpn:'THVD1450DR',mfr:'TI',note:'RS-485 트랜시버 · 50 Mbps · ±18 kV ESD',spec:{pkg:'SOIC-8'},grade:'',price:1.4,why:'RS-485 현장 버스'},
    {mpn:'FT232RL',mfr:'FTDI',note:'USB-UART 브리지',spec:{pkg:'SSOP-28'},grade:'',price:3.2,why:'PC 직결 디버그'},
    {mpn:'TJA1021T/20',mfr:'NXP',note:'LIN 2.x 트랜시버',spec:{pkg:'SOIC-8'},grade:'Q100',price:0.8,why:'LIN 물리 계층'}],
  i2c:[
    {mpn:'TMP117AIDRVR',mfr:'TI',note:'I²C 온도 센서 ±0.1 °C',spec:{pkg:'WSON-6'},grade:'',price:1.9,why:'고정밀 온도'},
    {mpn:'TMP102AIDRLR',mfr:'TI',note:'I²C 온도 센서 ±0.5 °C',spec:{pkg:'SOT-563'},grade:'',price:0.7,why:'저가 온도'},
    {mpn:'PCA9306DCUR',mfr:'TI',note:'I²C 레벨 변환',spec:{pkg:'VSSOP-8'},grade:'',price:0.5,why:'3.3/5 V 혼용'},
    {mpn:'24LC256T-I/SN',mfr:'Microchip',note:'I²C EEPROM 256 Kbit',spec:{pkg:'SOIC-8'},grade:'',price:0.5,why:'설정 저장'}],
  usb_in:[
    {mpn:'TPD2E2U06DBZR',mfr:'TI',note:'USB ESD ×2 채널',spec:{pkg:'SOT-23-3'},grade:'',price:0.2,why:'D+/D- ESD'},
    {mpn:'USBLC6-2SC6',mfr:'ST',note:'USB ESD 저용량',spec:{pkg:'SOT-23-6'},grade:'',price:0.25,why:'표준 USB ESD'},
    {mpn:'TPS2553DBVR',mfr:'TI',note:'USB 전류 제한 스위치 1.5 A',spec:{pkg:'SOT-23-6'},grade:'',price:0.9,why:'VBUS 과전류 보호'}],
};
const S=v=>v==null?'':String(v).trim();
const norm=x=>{if(!x)return null;if(typeof x==='string')return{mpn:x,mfr:'',note:''};if(Array.isArray(x))return{mpn:S(x[0]),mfr:S(x[1]),note:S(x[2])};return Object.assign({},x,{mpn:S(x.mpn||x.part),mfr:S(x.mfr||x.maker),note:S(x.note||x.desc)});};
const asilRank={'':0,QM:0,A:1,B:2,C:3,D:4};
/* needs of a block from its implementation parameters and the request */
function needs(b,ctx){const n={i:null,v:null,fd:false,vouts:[]};(b.impl||[]).forEach(im=>{const p=im.params||{};if(/^(ldo|buck)$/.test(im.type)&&p.vout!=null&&!isNaN(+p.vout))n.vouts.push(+p.vout);if(p.i)n.i=Math.max(n.i||0,+p.i);if(p.vin&&!isNaN(+p.vin))n.v=Math.max(n.v||0,+p.vin);});
  if(ctx&&ctx.vin&&(b.group==='power'||(b.impl||[]).some(im=>/pwr_in|buck|ldo|hs_switch|hbridge|gdrv3|dcmotor|bldc/.test(im.type))))n.v=Math.max(n.v||0,ctx.vin);
  if(/can-?fd/i.test((ctx&&ctx.req)||'')||/CAN-FD/i.test(b.label))n.fd=true;return n;}
/* candidates of a block: profile list first, then by implementation type (deduplicated by MPN) */
const IDX=(()=>{const m={};Object.values(C).forEach(L=>L.forEach(p=>{m[p.mpn.toUpperCase()]=p;}));return m;})();
const enrich=p=>{const k=p.mpn.toUpperCase();const base=IDX[k]||Object.values(IDX).find(x=>k.startsWith(x.mpn.toUpperCase().replace(/[-\/].*$/,''))&&x.mpn.length>=6)||null;const o=Object.assign({},base||{});Object.keys(p).forEach(k=>{if(p[k]!=null&&p[k]!=='')o[k]=p[k];});
  if(!o.asil){const m=(o.note||'').match(/ASIL\s*([A-D])/i);if(m)o.asil=m[1].toUpperCase();}if(!o.grade&&/Q100|Q101|AEC|차량용|automotive/i.test(o.note||''))o.grade='Q100';if(!o.spec)o.spec={};return o;};
function candidates(b,prof){const out=[];const seen=new Set();const push=(p,src)=>{p=norm(p);if(!p||!p.mpn||seen.has(p.mpn.toUpperCase()))return;seen.add(p.mpn.toUpperCase());out.push(Object.assign({src},enrich(p)));};
  if(prof&&typeof PRODUCTS!=='undefined'){try{(PRODUCTS.candidates(prof,b.id)||[]).forEach(p=>push(p,'profile'));}catch(e){}}
  (b.impl||[]).forEach(im=>{(C[im.type]||[]).forEach(p=>push(p,'lib'));});
  if(!out.length&&typeof HWARCH!=='undefined'&&HWARCH.implGuess){const g=HWARCH.implGuess(b);(C[g]||[]).forEach(p=>push(p,'lib'));}
  return out;}
function rank(b,ctx){ctx=ctx||{};const N=needs(b,ctx);const pref=ctx.pref||{price:1,feat:1,ext:1};const sys=asilRank[(ctx.asil||'').toUpperCase()]||0,blk=asilRank[(b.asil||'').toUpperCase()]||0,need=Math.max(sys,blk);
  const auto=!!ctx.auto;const look=ctx.lookup||(()=>null);const priceOf=ctx.priceOf||(()=>null);
  const rows=candidates(b,ctx.prof).map(p=>{const sp=p.spec||{};const why=[],bad=[];let s=0;
    if(N.i&&sp.i!=null){if(sp.i<N.i)bad.push(`전류 ${sp.i} A < 요구 ${N.i} A`);else{s+=1;why.push(`${sp.i} A ≥ ${N.i} A`);}}
    if(N.v&&sp.vin){if(sp.vin[1]<N.v)bad.push(`입력 ${sp.vin[1]} V < ${N.v} V`);else if(sp.vin[1]>=N.v*1.6){s+=0.6;why.push('과도 전압 여유');}}
    if(N.v&&sp.v!=null){if(sp.v<N.v*1.5)bad.push(`내압 ${sp.v} V 부족(권장 ≥ ${Math.round(N.v*1.5)} V)`);else s+=0.4;}
    if(N.fd&&sp.fd===0)bad.push('클래식 CAN(FD 미지원)');
    if(N.vouts.length&&sp.vout!=null&&!N.vouts.some(v=>Math.abs(v-sp.vout)<0.05))bad.push(`출력 ${sp.vout} V ≠ 요구 ${[...new Set(N.vouts)].join('/')} V`);
    if(N.vouts.length&&sp.vout!=null&&sp.vin&&N.v&&sp.vin[1]<N.v&&N.vouts.some(v=>v>=sp.vout+1.5))bad.splice(bad.findIndex(x=>/^입력/.test(x)),1);  // a 2nd-stage LDO is fed from the 5 V rail, not the battery
    // ASIL matters for the parts that carry a safety mechanism: MCU, supervisor / PMIC, gate driver, cut-off switch, or a block tagged safety
  const safetyBlock=(b.impl||[]).some(im=>/^(mcu|supervisor|gdrv3|hs_switch)$/.test(im.type))||!!b.safety||(b.sg&&b.sg.length);
  const pa=asilRank[(p.asil||'').toUpperCase()]||0;if(need>=2&&safetyBlock){if(pa>=need){s+=2.5;why.push(`ASIL ${p.asil}`);}else if(pa){s+=1;why.push(`ASIL ${p.asil} (요구 ${'ABCD'[need-1]} 미달)`);}else bad.push('안전 기능 없음');}
    if(auto){if(/Q10/.test(p.grade||'')){s+=1.5;why.push(p.grade);}else{s-=1;bad.push('차량용 등급 아님');}}
    const rec=look(p.mpn);const pins=!!(rec&&rec.pins&&rec.pins.length);const kic=rec&&(rec.src==='kicad'||rec.pinSrc==='kicad');const fam=rec&&(rec.match==='family'||rec.pinMatch==='family');
    const pinNote=pins?(kic?'KiCad'+(fam?' 계열':''):rec.src==='ds'?'데이터시트':rec.src==='ai'?'Claude 추정':'라이브러리'):'';if(pins){s+=fam?0.6:1;why.push('핀 데이터 있음');}
    const price=priceOf(p.mpn)!=null?priceOf(p.mpn):p.price;if(price!=null){s+=pref.price*Math.max(-1.5,1-Math.log10(Math.max(0.05,price))*0.9);}
    if(pref.feat>1||pref.ext>1){if(/진단|센스|SPI|FOC|보호|내장/.test(p.note||'')){s+=0.6*Math.max(pref.feat,pref.ext);why.push('기능 풍부');}}
    if(p.src==='profile'){s+=0.8;why.push('제품 표준 후보');}
    if(p.why)why.push(p.why);
    return Object.assign({},p,{pinNote,score:+s.toFixed(2),ok:!bad.some(x=>/</.test(x)||/미지원|≠/.test(x)),why,bad,pins,price});});
  rows.sort((a,b)=>(b.ok-a.ok)||(b.score-a.score));rows.forEach((r,i)=>{r.rank=i+1;});return{needs:N,rows};}
function text(b,R){const L=[`${b.label} (${b.id}) 주요 소자 후보 ${R.rows.length}개${R.needs.i?` · 요구 전류 ${R.needs.i} A`:''}${R.needs.v?` · 전압 ${R.needs.v} V`:''}`];
  R.rows.forEach(r=>L.push(`  ${r.rank}. ${r.mpn} · ${r.mfr}${r.price!=null?' · $'+r.price:''}${r.grade?' · '+r.grade:''}${r.asil?' · ASIL '+r.asil:''} — ${r.note}${r.bad.length?' ✕ '+r.bad.join(', '):''}${r.why.length?' ✓ '+r.why.slice(0,3).join(' · '):''}`));
  return L.join('\n');}
return{C,candidates,rank,needs,text,norm};
})();
if(typeof module!=='undefined')module.exports=PARTRANK;
