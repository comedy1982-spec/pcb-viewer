/* AURIX-364 INV — Infineon TC364DP (TQFP-144) with a DRV8313 3-phase driver, TLE9251V CAN FD transceiver, W25Q32 QSPI flash,
   one sealed ECU connector (JAE MX23A12NF1, 2 × 6, 2.5 mm: 12 V, CAN, motor phases, hall sensors), debug UART and battery monitor. Parts are placed and power is wired, but most MCU signal pins are still
   unassigned: the HSIS pin recommender proposes MCU pins (ALT functions from the TC36x data sheet) for them. */
const SAMPLE_TC364=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.8,drill:0.4}));
  // 12 V from the ECU connector J1 (MX23A pin 12) → 5 V (U2) → 3.3 V (U6)
  tr('T','+12V',0.8,'J1.12',[9.15,57.5],[14,52.65],[14,13],[24.3,13],'U2.3');tr('T','+12V',0.6,[14,14.8],'C1.1');
  tr('T','+5V',0.8,'U2.4',[30,23.15],[30,13],[40.3,13],'U6.3');tr('T','+5V',0.5,[30,16.8],'C2.2');
  tr('T','+3V3',0.8,'U6.4',[46,23.15]);tr('T','+3V3',0.5,[44.4,23.15],'C3.2');
  // DRV8313 → ECU connector rear row (OUT1 → W pin 7, OUT2 → V pin 8, OUT3 → U pin 9), charge pump, V3P3 ties, nFAULT pull-up
  tr('T','PH_W',0.4,'U3.5',[51.625,82.89],[19.79,82.89],'J1.7');tr('T','PH_V',0.4,'U3.8',[49.675,80.35],[19.75,80.35],'J1.8');tr('T','PH_U',0.4,'U3.9',[49.025,78.2],[20.1,78.2],'J1.9');
  tr('T','DRV_CPL',0.25,'U3.1',[54.225,78],[56,78],'C8.1');tr('T','DRV_CPH',0.25,'U3.2',[53.575,81.6],[56,81.6],'C8.2');tr('T','DRV_VCP',0.25,'U3.3',[52.925,83],[59,83],'C9.2');
  tr('T','DRV_V3P3',0.25,'U3.15',[45.775,70],[46.425,70],'U3.16');tr('T','DRV_V3P3',0.25,[45.775,70],'C10.2');
  tr('T','NFAULT',0.25,'R10.2','U3.18');
  // VM bulk: aluminium electrolytic C13 tied to the 22 µF MLCC C12 (+12V) with its own ground vias
  tr('T','+12V',0.8,'C13.1',[64,82],[64,87],'C12.2');tr('T','GND',0.8,'C13.2',[79.4,82]);via('GND',[79.4,81],[79.4,83]);
  // CAN bus: transceiver next to the connector (pins 10 CANL / 11 CANH)
  tr('T','CANL',0.3,'J1.10',[19.2,64.75],[19.81,64.14],'U4.6');tr('T','CANH',0.3,'J1.11',[19.2,62.25],[19.81,62.87],'U4.7');
  // battery monitor divider + filter, status LED
  tr('T','VBAT_MON',0.25,'R5.2','R6.2');tr('T','VBAT_MON',0.25,'R5.2',[66,29],'C11.1');
  tr('T','LED_A',0.25,'R7.1','D2.2');
  // ground stubs to the bottom pour
  [['J1.5',[4.6,62.25]],['J1.6',[4.6,59.75]],['U2.1',[19.7,14.6]],['U6.1',[35.7,14.6]],['C1.2',[17,16.4]],['C2.1',[27.4,19.6]],['C3.1',[42.8,19.3]],['C10.1',[44,65.6]],['R6.1',[70,23.5]],['C11.2',[70.4,30.2]],['D2.1',[100,19.6]],
   ['U4.2',[28.4,62.87]],['J4.3',[113,43.73]],['Y1.2',[88.6,38.6]],['Y1.4',[83.4,42.4]],['C4.1',[55.2,40]],['C5.1',[66,63.6]],['C6.1',[84.4,46.5]],['C7.1',[75.6,29.4]],['C12.1',[56.5,87]]]
    .forEach(([a,b])=>{tr('T','GND',0.4,a,b);via('GND',b);});
  via('GND',[67,42],[73,42],[67,48],[73,48]);
  const U1PINS={1:'CAN_TX',2:'CAN_RX',51:'VBAT_MON',10:'VDD',22:'VDD',72:'VDD',79:'VDD',99:'VDD',127:'VDD',23:'+3V3',69:'+3V3',78:'+3V3',83:'+3V3',125:'+3V3',126:'+3V3',44:'+3V3',42:'+3V3',52:'+3V3',
    41:'GND',43:'GND',80:'GND',145:'GND',81:'XTAL1',82:'XTAL2',97:'PORST',98:'ESR0'};
  const names={};Object.entries(MCU_PINS.DB['TC364DP-64F300F'].pins).forEach(([n,p])=>{names[n]=p.name;});names[145]='VSS (노출 패드)';
  return{
    _source:'예제',_demo:'tc364',
    board:{name:'AURIX-364 INV v0.1',width:120,height:92,thickness:1.6,corner:2.5,holes:[[4,4,3.2],[116,4,3.2],[4,88,3.2],[116,88,3.2]]},
    components:[
      {ref:'J1',value:'MX23A 12P',footprint:'MX23A-12-RA',side:'top',x:0.65,y:66,rotation:0,mpn:'MX23A12NF1',description:'JAE MX23A 방수 커넥터 헤더 (2 × 6, 2.5 mm, 직각, 3 A/핀) — 전원·CAN·모터 3상·홀 센서. 하네스 측 MX23A12SF1 (결합부 실 링). 하우징 벽을 관통하고 플랜지가 내벽에 실링',
        pins:{1:'HALL_A',2:'HALL_B',3:'HALL_C',4:'+5V',5:'GND',6:'GND',7:'PH_W',8:'PH_V',9:'PH_U',10:'CANL',11:'CANH',12:'+12V'},pinNames:{1:'H1',2:'H2',3:'H3',4:'5V_HALL',5:'GND_HALL',6:'GND',7:'W',8:'V',9:'U',10:'CANL',11:'CANH',12:'KL30',P1:'PEG',P2:'PEG'},label:[9,48.6]},
      {ref:'U2',value:'AMS1117-5.0',footprint:'SOT-223',side:'top',x:22,y:20,rotation:0,mpn:'AMS1117-5.0',description:'5 V LDO — CAN 트랜시버 VCC, 홀 센서 전원',pins:{1:'GND',2:'+5V',3:'+12V',4:'+5V'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[22,26]},
      {ref:'U6',value:'AMS1117-3.3',footprint:'SOT-223',side:'top',x:38,y:20,rotation:0,mpn:'AMS1117-3.3',description:'3.3 V LDO — TC364 VEXT (단일 3.3 V 공급, 코어 VDD는 내부 EVR)',pins:{1:'GND',2:'+3V3',3:'+5V',4:'+3V3'},pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'VOUT'},label:[38,26]},
      {ref:'C1',value:'10µF',footprint:'0805',side:'top',x:15.4,y:15.6,rotation:90,mpn:'CL21A106KAYNNNE',description:'12 V 입력 커패시터',pins:{1:'+12V',2:'GND'}},
      {ref:'C2',value:'10µF',footprint:'0805',side:'top',x:28.6,y:17.6,rotation:270,mpn:'CL21A106KAYNNNE',description:'5 V 출력 커패시터',pins:{1:'GND',2:'+5V'}},
      {ref:'C3',value:'10µF',footprint:'0805',side:'top',x:43.6,y:21,rotation:0,mpn:'CL21A106KAYNNNE',description:'3.3 V 출력 커패시터',pins:{1:'GND',2:'+3V3'}},
      {ref:'U1',value:'TC364DP',footprint:'TQFP-144',side:'top',x:70,y:45,rotation:0,mpn:'TC364DP-64F300F',description:'Infineon AURIX TC36x · TriCore 300 MHz · TQFP-144 — 신호 핀 대부분이 아직 미배정 (HSIS → 핀 추천)',
        pins:U1PINS,pinNames:names,label:[70,58.5]},
      {ref:'C4',value:'100nF',footprint:'0603',side:'top',x:55.2,y:42,rotation:90,mpn:'CL10B104KB8NNNC',description:'VEXT 디커플링',pins:{1:'GND',2:'+3V3'}},
      {ref:'C5',value:'470nF',footprint:'0603',side:'top',x:66,y:61.4,rotation:270,mpn:'GRM188R71C474KA88D',description:'VDD (EVR13 출력) 디커플링',pins:{1:'GND',2:'VDD'}},
      {ref:'C6',value:'100nF',footprint:'0603',side:'top',x:84.4,y:44.4,rotation:270,mpn:'CL10B104KB8NNNC',description:'VEXT 디커플링',pins:{1:'GND',2:'+3V3'}},
      {ref:'C7',value:'100nF',footprint:'0603',side:'top',x:74,y:28.6,rotation:270,mpn:'CL10B104KB8NNNC',description:'VDDM (ADC) 디커플링',pins:{1:'GND',2:'+3V3'}},
      {ref:'Y1',value:'20MHz',footprint:'XTAL-3225',side:'top',x:86,y:40.5,rotation:0,mpn:'ABM8-20.000MHZ-B2-T',description:'20 MHz 크리스털 (XTAL1/XTAL2)',pins:{1:'XTAL1',2:'GND',3:'XTAL2',4:'GND'},label:[86,37.6]},
      {ref:'R8',value:'10kΩ',footprint:'0603',side:'top',x:86,y:48.25,rotation:0,mpn:'RC0603FR-0710KL',description:'PORST 풀업',pins:{1:'PORST',2:'+3V3'}},
      {ref:'R9',value:'10kΩ',footprint:'0603',side:'top',x:86,y:50.6,rotation:0,mpn:'RC0603FR-0710KL',description:'ESR0 풀업',pins:{1:'ESR0',2:'+3V3'}},
      {ref:'U3',value:'DRV8313',footprint:'HTSSOP-28',side:'top',x:50,y:74,rotation:270,mpn:'DRV8313PWPR',description:'TI 3상 하프브리지 드라이버 · INx = PWM, ENx = 상 enable, nFAULT 오픈 드레인',
        pins:{1:'DRV_CPL',2:'DRV_CPH',3:'DRV_VCP',4:'+12V',5:'PH_W',6:'GND',7:'GND',8:'PH_V',9:'PH_U',10:'GND',11:'+12V',14:'GND',15:'DRV_V3P3',16:'DRV_V3P3',17:'DRV_NSLEEP',18:'NFAULT',20:'GND',22:'EN_U',23:'IN_U',24:'EN_V',25:'IN_V',26:'EN_W',27:'IN_W',28:'GND',29:'GND'},
        pinNames:{1:'CPL',2:'CPH',3:'VCP',4:'VM',5:'OUT1',6:'PGND1',7:'PGND2',8:'OUT2',9:'OUT3',10:'PGND3',11:'VM',12:'COMPP',13:'COMPN',14:'GND',15:'V3P3',16:'nRESET',17:'nSLEEP',18:'nFAULT',19:'nCOMPO',20:'GND',21:'NC',22:'EN3',23:'IN3',24:'EN2',25:'IN2',26:'EN1',27:'IN1',28:'GND',29:'PAD'},label:[42.5,74]},
      {ref:'C8',value:'10nF',footprint:'0603',side:'top',x:56,y:80,rotation:90,mpn:'CL10B103KB8NNNC',description:'차지 펌프 (CPL–CPH)',pins:{1:'DRV_CPL',2:'DRV_CPH'}},
      {ref:'C9',value:'100nF',footprint:'0603',side:'top',x:59,y:80,rotation:90,mpn:'CL10B104KB8NNNC',description:'VCP–VM',pins:{1:'+12V',2:'DRV_VCP'}},
      {ref:'C10',value:'470nF',footprint:'0603',side:'top',x:44,y:67.6,rotation:90,mpn:'GRM188R71C474KA88D',description:'DRV8313 V3P3 바이패스',pins:{1:'GND',2:'DRV_V3P3'}},
      {ref:'C12',value:'22µF',footprint:'1210',side:'top',x:60,y:87,rotation:0,mpn:'GRM32ER61E226KE15',description:'VM 벌크 커패시터',pins:{1:'GND',2:'+12V'}},
      {ref:'C13',value:'470µF',footprint:'CP-SMD-10x10',side:'top',x:72,y:82,rotation:0,mpn:'EEE-FK1E471P',description:'VM 벌크 알루미늄 전해 커패시터 (DC-Link · 모터 리플 전류 흡수)',pins:{1:'+12V',2:'GND'},pinNames:{1:'+',2:'−'},label:[72,89.2]},
      {ref:'R10',value:'10kΩ',footprint:'0603',side:'top',x:47.725,y:67.4,rotation:90,mpn:'RC0603FR-0710KL',description:'nFAULT 풀업 (오픈 드레인)',pins:{1:'+3V3',2:'NFAULT'}},
      {ref:'U5',value:'W25Q32JV',footprint:'SOIC-8',side:'top',x:44,y:50,rotation:0,mpn:'W25Q32JVSSIQ',description:'32 Mbit QSPI NOR 플래시 (데이터 로그)',
        pins:{1:'FLASH_CS',2:'FLASH_MISO',3:'+3V3',4:'GND',5:'FLASH_MOSI',6:'FLASH_SCLK',7:'+3V3',8:'+3V3'},pinNames:{1:'/CS',2:'DO',3:'/WP',4:'GND',5:'DI',6:'CLK',7:'/HOLD',8:'VCC'},label:[44,54.5]},
      {ref:'U4',value:'TLE9251V',footprint:'SOIC-8',side:'top',x:24,y:63.5,rotation:180,mpn:'TLE9251VSJ',description:'Infineon CAN FD 트랜시버 · VCC 5 V, VIO 3.3 V',
        pins:{1:'CAN_TX',2:'GND',3:'+5V',4:'CAN_RX',5:'+3V3',6:'CANL',7:'CANH',8:'CAN_STB'},pinNames:{1:'TxD',2:'GND',3:'VCC',4:'RxD',5:'VIO',6:'CANL',7:'CANH',8:'STB'},label:[24,58.8]},
      {ref:'J4',value:'DEBUG UART',footprint:'HDR-1x4',side:'top',x:110,y:45,rotation:0,mpn:'61300411121',description:'디버그 UART (3.3 V 레벨)',pins:{1:'DBG_TX',2:'DBG_RX',3:'GND',4:'+3V3'},pinNames:{1:'TX',2:'RX',3:'GND',4:'3V3'}},
      {ref:'R5',value:'100kΩ',footprint:'0603',side:'top',x:66,y:26,rotation:90,mpn:'RC0603FR-07100KL',description:'배터리 전압 분압 (상단)',pins:{1:'+12V',2:'VBAT_MON'}},
      {ref:'R6',value:'22kΩ',footprint:'0603',side:'top',x:70,y:26,rotation:90,mpn:'RC0603FR-0722KL',description:'배터리 전압 분압 (하단)',pins:{1:'GND',2:'VBAT_MON'}},
      {ref:'C11',value:'100nF',footprint:'0603',side:'top',x:68,y:29,rotation:0,mpn:'CL10B104KB8NNNC',description:'ADC 입력 필터',pins:{1:'VBAT_MON',2:'GND'}},
      {ref:'R7',value:'330Ω',footprint:'0603',side:'top',x:100,y:27,rotation:90,mpn:'RC0603FR-07330RL',description:'상태 LED 전류 제한',pins:{1:'LED_A',2:'LED_ST'}},
      {ref:'D2',value:'LED 녹색',footprint:'LED-0603',side:'top',x:100,y:22,rotation:90,mpn:'APT1608SGC',description:'상태 LED',pins:{1:'GND',2:'LED_A'},pinNames:{1:'K',2:'A'}},
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.4,inset:0.5}],
    texts:[
      {side:'top',text:'AURIX-364 INV',x:60,y:5,size:1.3},{side:'top',text:'v0.1 · 배치 단계',x:71,y:5,size:0.8,align:'left'},
      {side:'top',text:'ECU · MX23A',x:13,y:84,size:0.7,align:'left'},{side:'top',text:'UART',x:110,y:51.5,size:0.7},
      {side:'bottom',text:'AURIX-364 · TC364DP + DRV8313',x:60,y:6,size:0.9},
    ]
  };
})();
