/* Part database for the built-in examples: manufacturer, datasheet links and key specs.
   Links point to the manufacturer (or, where noted, an authorised distributor) — PDFs are not bundled; run
   `node scripts/datasheets.mjs --download` to save local copies under datasheets/pdf/. */
const PARTS=(function(){
"use strict";
const P={
  'STM32F042K6U6':{mfr:'STMicroelectronics',title:'STM32F042x4/x6 — Arm Cortex-M0 MCU, USB, CAN',cat:'MCU',
    pdf:'https://www.st.com/resource/en/datasheet/stm32f042k6.pdf',page:'https://www.st.com/en/microcontrollers-microprocessors/stm32f042k6.html',file:'STM32F042K6_datasheet.pdf',
    therm:{tjmax:105,src:'STM32F042 데이터시트 Table 2 (온도 등급 6: TJ 최대 105 °C) · 열저항은 패키지 일반값'},
    specs:[['코어','Arm Cortex-M0, 최대 48 MHz'],['메모리','플래시 32 KB · SRAM 6 KB'],['전원','VDD 2.0–3.6 V · VDDA ≤ 3.6 V (ADC 사용 시 ≥ 2.4 V) · VDDIO2 1.65–3.6 V'],
      ['USB','USB 2.0 FS, 크리스털리스 (HSI48 + CRS) · PA11 DM / PA12 DP'],['타이머','TIM1 고급 제어 (CH1–CH4: PA8–PA11) 외'],['ADC','12비트, ADC_IN0–9 (PA0–PA7, PB0, PB1)'],
      ['패키지','UFQFPN32 5×5 mm · 노출 패드 = VSS · 31번 BOOT0'],['디버그','SWD: PA13 SWDIO / PA14 SWCLK']]},
  'DRV8313PWPR':{mfr:'Texas Instruments',title:'DRV8313 — 2.5 A triple half-bridge driver',cat:'모터 드라이버',
    pdf:'https://www.ti.com/lit/ds/symlink/drv8313.pdf',page:'https://www.ti.com/product/DRV8313',file:'DRV8313_datasheet.pdf',
    therm:{thJB:5.6,thJC:15.9,psiJT:0.2,tjmax:150,src:'TI DRV8313 데이터시트 Thermal Information (PWP)'},
    specs:[['VM','8–60 V (절대 최대 65 V)'],['출력','상당 2.5 A 피크 · 과전류 3 A 최소'],['RDS(on)','0.24 Ω typ (상단·하단 각, 25 °C)'],
      ['입력 논리','ENx=0 → OUTx 하이 임피던스 · ENx=1, INx=1 → H · INx=0 → L'],['보호','과전류·과열·저전압 → nFAULT (오픈 드레인, 외부 풀업)'],
      ['기타','nSLEEP·nRESET 내부 풀다운 · V3P3 3.3 V 10 mA · 차지 펌프 (CPH–CPL 0.01 µF, VCP–VM 0.1 µF)'],['패키지','HTSSOP-28 (PWP), 써멀 패드 GND']]},
  'AMS1117-3.3':{mfr:'Advanced Monolithic Systems',title:'AMS1117 — 1 A low-dropout regulator',cat:'전원',
    pdf:'http://www.advanced-monolithic.com/pdf/ds1117.pdf',page:'http://www.advanced-monolithic.com/',file:'AMS1117_datasheet.pdf',
    therm:{thJB:15,thJC:15,psiJT:3,tjmax:125,src:'AMS1117 데이터시트 (θJC 접합–탭 15 °C/W, 탭을 보드에 납땜)'},
    specs:[['출력','3.3 V 고정, 최대 1 A'],['드롭아웃','약 1.1 V (1 A)'],['입력','최대 15 V'],['패키지','SOT-223: 1 GND · 2 VOUT · 3 VIN · 탭 VOUT']]},
  'W25Q32JVSSIQ':{mfr:'Winbond',title:'W25Q32JV — 3 V 32 Mbit serial NOR flash',cat:'메모리',
    page:'https://www.winbond.com/hq/product/code-storage-flash-memory/serial-nor-flash/?__locale=en&partNo=W25Q32JV',file:'W25Q32JV_datasheet.pdf',
    specs:[['용량','32 Mbit (4 MB)'],['전원','2.7–3.6 V'],['인터페이스','SPI / Dual / Quad SPI, 최대 133 MHz'],['패키지','SOIC-8 208 mil: 1 /CS · 2 DO · 3 /WP · 4 GND · 5 DI · 6 CLK · 7 /HOLD · 8 VCC']]},
  'AO3400A':{mfr:'Alpha & Omega Semiconductor',title:'AO3400A — 30 V N-channel MOSFET',cat:'트랜지스터',
    pdf:'https://www.aosmd.com/res/datasheets/AO3400A.pdf',page:'https://www.aosmd.com/products/mosfets/low-voltage-mosfets/AO3400A',file:'AO3400A_datasheet.pdf',
    specs:[['VDS','30 V'],['ID','5.7 A (VGS 10 V)'],['RDS(on)','19 mΩ typ @ 4.5 V · 24 mΩ typ @ 2.5 V'],['VGS(th)','1.05 V typ (0.65–1.45 V)'],['패키지','SOT-23: 1 G · 2 S · 3 D']]},
  'SS14':{mfr:'Vishay',title:'SS12–SS16 — 1 A surface-mount Schottky rectifier',cat:'다이오드',
    pdf:'https://www.vishay.com/docs/88746/ss12.pdf',file:'SS14_Vishay_datasheet.pdf',
    specs:[['VRRM','40 V (SS14)'],['IF(AV)','1.0 A'],['패키지','SMA (DO-214AC), 띠 = 캐소드']]},
  'APT1608SGC':{mfr:'Kingbright',title:'APT1608SGC — 0603 super bright green LED',cat:'LED',
    pdf:'https://www.kingbrightusa.com/images/catalog/SPEC/APT1608SGC.pdf',file:'APT1608SGC_datasheet.pdf',
    specs:[['색','녹색 568 nm (dominant)'],['VF','2.2 V typ @ 20 mA'],['IF','최대 25 mA DC'],['패키지','0603 (1.6×0.8 mm)']]},
  'APT1608EC':{mfr:'Kingbright',title:'APT1608EC — 0603 high-efficiency red LED',cat:'LED',
    pdf:'https://www.kingbrightusa.com/images/catalog/SPEC/APT1608EC.pdf',file:'APT1608EC_datasheet.pdf',
    specs:[['색','적색 617 nm (dominant)'],['VF','2.0 V typ @ 20 mA'],['IF','최대 30 mA DC'],['패키지','0603']]},
  'APT1608QBC/D':{mfr:'Kingbright',title:'APT1608QBC/D — 0603 blue LED',cat:'LED',
    pdf:'https://www.kingbrightusa.com/images/catalog/SPEC/APT1608QBC-D.pdf',file:'APT1608QBC-D_datasheet.pdf',
    specs:[['색','청색 465 nm (dominant)'],['VF','3.3 V typ @ 20 mA (최대 4.0 V)'],['패키지','0603']]},
  'B3FS-1000P':{mfr:'Omron',title:'B3FS — 6×6 mm SMT tactile switch',cat:'스위치',
    pdf:'https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3fs.pdf',file:'Omron_B3FS_datasheet.pdf',
    specs:[['크기','6×6 mm, 플런저 3.1 mm'],['작동력','0.98 N (100 gf)'],['정격','1–50 mA, 3–24 VDC']]},
  '61300411121':{mfr:'Würth Elektronik',title:'WR-PHD 2.54 mm pin header, 4 pins',cat:'커넥터',
    pdf:'https://www.we-online.com/components/products/datasheet/61300411121.pdf',file:'Wurth_61300411121.pdf',
    specs:[['피치','2.54 mm'],['핀','1×4, 스루홀'],['정격','3 A, 250 V AC']]},
  '61300211121':{mfr:'Würth Elektronik',title:'WR-PHD 2.54 mm pin header, 2 pins',cat:'커넥터',
    pdf:'https://www.we-online.com/components/products/datasheet/61300211121.pdf',file:'Wurth_61300211121.pdf',
    specs:[['피치','2.54 mm'],['핀','1×2, 스루홀'],['정격','3 A, 250 V AC']]},
  'USB4105-GF-A':{mfr:'GCT',title:'USB4105 — USB Type-C 2.0 receptacle',cat:'커넥터',
    page:'https://gct.co/connector/usb4105',file:'GCT_USB4105.pdf',
    specs:[['규격','USB Type-C, USB 2.0 데이터 + 전원'],['비고','뷰어 풋프린트는 사용 핀(CC1, VBUS, D−, D+, GND, 실드)만 단순화']]},
  'FA-130RA':{mfr:'Mabuchi Motor (Tamiya 판매)',title:'FA-130 brushed DC motor + Tamiya 70097 gearbox',cat:'모터',
    page:'https://www.pololu.com/product/77/specs',page2:'https://www.pololu.com/product/61',file:'Mabuchi_FA-130.pdf',
    specs:[['정격','3 V'],['무부하','12,300 rpm, 150 mA (3 V)'],['구속','2.1 A, 0.5 oz·in ≈ 3.5 mN·m (3 V)'],['기어박스','Tamiya 70097 Twin-Motor Gearbox, 58:1 또는 203:1 (예제는 58:1)'],
      ['시뮬레이션 값','R 1.43 Ω, ke = kt 2.16 mV/(rad/s), 마찰 0.32 mN·m — 위 정격에서 계산']],note:'제조사 PDF 대신 Pololu 사양 페이지(유통사) 링크입니다.'},
  '42BLF01 (MIKROE-4455)':{mfr:'MIKROE (42BLF 시리즈)',title:'42BLF01 — 3-phase BLDC motor with hall sensors',cat:'모터',
    pdf:'https://mouser.com/datasheet/2/272/BLDC_Motor_BLDC_Motor_with_Hall_sensor_Datasheet-3217747.pdf',page:'https://www.mikroe.com/motor-bldc-42blf01-with-hall-sensor',file:'42BLF_datasheet.pdf',
    specs:[['정격','24 V, 4000 rpm, 1.9 A'],['극수','8극 (4극쌍), Y결선'],['토크 상수','0.035 N·m/A'],['역기전력 상수','3.7 V/krpm'],['회전자 관성','24 g·cm²'],['홀 센서','120°, 전원 5–20 V'],
      ['시뮬레이션 값','상 저항 0.9 Ω·인덕턴스 1.3 mH는 추정값 (데이터시트에 없음), 예제는 12 V 구동']],note:'Mouser가 호스팅한 데이터시트 PDF입니다.'},
  'CL21A106KAYNNNE':{mfr:'Samsung Electro-Mechanics',title:'MLCC 10 µF 25 V X5R 0805',cat:'커패시터',page:'https://product.samsungsem.com/mlcc/CL21A106KAYNNN.do',specs:[['값','10 µF ±10 %, 25 V, X5R'],['크기','0805']]},
  'CL10B104KB8NNNC':{mfr:'Samsung Electro-Mechanics',title:'MLCC 100 nF 50 V X7R 0603',cat:'커패시터',page:'https://product.samsungsem.com/mlcc/CL10B104KB8NNN.do',specs:[['값','100 nF ±10 %, 50 V, X7R'],['크기','0603']]},
  'CL10B103KB8NNNC':{mfr:'Samsung Electro-Mechanics',title:'MLCC 10 nF 50 V X7R 0603',cat:'커패시터',page:'https://product.samsungsem.com/mlcc/CL10B103KB8NNN.do',specs:[['값','10 nF ±10 %, 50 V, X7R'],['크기','0603']]},
  'CL10A105KB8NNNC':{mfr:'Samsung Electro-Mechanics',title:'MLCC 1 µF 50 V X5R 0603',cat:'커패시터',page:'https://product.samsungsem.com/mlcc/CL10A105KB8NNN.do',specs:[['값','1 µF ±10 %, 50 V, X5R'],['크기','0603']]},
  'GRM31CR60J107ME39':{mfr:'Murata',title:'MLCC 100 µF 6.3 V X5R 1206',cat:'커패시터',page:'https://www.murata.com/en-us/products/productdetail?partno=GRM31CR60J107ME39L',specs:[['값','100 µF ±20 %, 6.3 V, X5R'],['크기','1206']]},
  'EEE-FK1E471P':{mfr:'Panasonic Industry',title:'알루미늄 전해 커패시터 470 µF 25 V · FK 시리즈 SMD (ø10 × 10.2)',cat:'커패시터',
    page:'https://industry.panasonic.com/global/en/products/control/capacitor/aluminum/smd/fk',pdf:'https://docs.rs-online.com/89e5/0900766b8139e2ae.pdf',
    specs:[['값','470 µF ±20 %, 25 V DC'],['케이스','G (ø10 × L10.2 mm), 105 °C 2000 h'],['ESR / 임피던스','80 mΩ (100 kHz, 유통사 기재)'],['허용 리플 전류','850 mA rms (100 kHz, 105 °C, 유통사 기재)'],
      ['랜드 패턴','a 4.6 · b 4.1 · c 2.0 mm (FK 케이스 G 권장)'],['ESL','약 6 nH — 데이터시트 값 없음, ø10 SMD 캔 일반값(추정)']],
    elec:{esr:0.08,esl:6,ripple:0.85},note:'용량·전압·치수·랜드 패턴은 Panasonic FK 데이터시트, ESR·리플 전류는 유통사(RS) 기재값입니다.'},
  'GRM32ER61E226KE15':{mfr:'Murata',title:'MLCC 22 µF 25 V X5R 1210',cat:'커패시터',page:'https://www.murata.com/en-us/products/productdetail?partno=GRM32ER61E226KE15L',specs:[['값','22 µF ±10 %, 25 V, X5R'],['크기','1210']]},
  'GRM188R71C474KA88D':{mfr:'Murata',title:'MLCC 0.47 µF 16 V X7R 0603',cat:'커패시터',page:'https://www.murata.com/en-us/products/productdetail?partno=GRM188R71C474KA88D',specs:[['값','0.47 µF ±10 %, 16 V, X7R'],['크기','0603']]},
  'TC364DP-64F300F':{mfr:'Infineon',title:'AURIX TC36x — 32-bit TriCore automotive MCU, 300 MHz',cat:'MCU',
    pdf:'https://www.infineon.com/dgdl/Infineon-SAK-TC36xDP-DataSheet-v01_01-EN.pdf?fileId=5546d46274dd77260174e8c7c7bf34b1',page2:'https://www.infineon.com/assets/row/public/documents/10/49/infineon-aurix-tc36x-addendum-datasheet-en.pdf',file:'TC36x_datasheet.pdf',
    specs:[['코어','TriCore, 최대 300 MHz (TC36x)'],['ADC','EVADC 주 그룹 4개/32채널 + 보조 그룹 2개/32채널, EDSADC'],['타이머','GTM (TOUT 출력, TIM 입력 캡처), CCU6, GPT12'],
      ['통신','MCMCAN (CAN FD) CAN0x·CAN1x, QSPI0–3, ASCLIN0–11, I2C0, E-Ray, GETH'],['포트 출력','핀마다 ALT1–ALT7 출력 선택 (Pn_IOCR.PCx), 입력은 주변장치 쪽 입력 선택(A/B/…)'],
      ['패키지','TQFP-144 (SAK-TC364DP-64F300F) · 노출 패드 VSS'],['디버그','JTAG/DAP: TMS 89, TCK 92, TRST 91, P21.6 TDI, P21.7 TDO']],
    note:'두 번째 링크는 변형별 사양(패키지·메모리) 문서입니다.'},
  'TLE9251VSJ':{mfr:'Infineon',title:'TLE9251V — high-speed CAN FD transceiver with VIO',cat:'CAN 트랜시버',
    page:'https://www.infineon.com/cms/en/product/interface/automotive-transceiver/automotive-can-transceivers/tle9251vsj/',file:'TLE9251V_datasheet.pdf',
    specs:[['속도','최대 5 Mbit/s (CAN FD)'],['전원','VCC 5 V (송신부) · VIO 3.3 V/5 V (MCU 인터페이스)'],['모드','STB High = 대기 (내부 풀업), Low = 정상 동작 · 대기 중 버스 웨이크업'],
      ['패키지','PG-DSO-8: 1 TxD · 2 GND · 3 VCC · 4 RxD · 5 VIO · 6 CANL · 7 CANH · 8 STB']]},
  'AMS1117-5.0':{mfr:'Advanced Monolithic Systems',title:'AMS1117 — 1 A low-dropout regulator',cat:'전원',
    pdf:'http://www.advanced-monolithic.com/pdf/ds1117.pdf',page:'http://www.advanced-monolithic.com/',file:'AMS1117_datasheet.pdf',
    therm:{thJB:15,thJC:15,psiJT:3,tjmax:125,src:'AMS1117 데이터시트 (θJC 접합–탭 15 °C/W)'},
    specs:[['출력','5.0 V 고정, 최대 1 A'],['드롭아웃','약 1.1 V (1 A)'],['입력','최대 15 V'],['패키지','SOT-223: 1 GND · 2 VOUT · 3 VIN · 탭 VOUT']]},
  'ABM8-20.000MHZ-B2-T':{mfr:'Abracon',title:'ABM8 — 3.2×2.5 mm SMD crystal, 20 MHz',cat:'크리스털',
    pdf:'https://abracon.com/Resonators/abm8.pdf',file:'Abracon_ABM8.pdf',specs:[['주파수','20 MHz'],['패키지','3.2×2.5 mm, 4패드 (1·3 수정, 2·4 GND)']]},
  '61300811121':{mfr:'Würth Elektronik',title:'WR-PHD 2.54 mm pin header, 8 pins',cat:'커넥터',
    pdf:'https://www.we-online.com/components/products/datasheet/61300811121.pdf',file:'Wurth_61300811121.pdf',
    specs:[['피치','2.54 mm'],['핀','1×8, 스루홀'],['정격','3 A, 250 V AC']]},
  'RL1206FR-070R1L':{mfr:'Yageo',title:'RL series low-ohm chip resistor 0.1 Ω 1206',cat:'저항',specs:[['값','0.1 Ω ±1 %'],['크기','1206, 1/4 W']]},
};
// families resolved by prefix
const rval=c=>{let m=c.match(/^(\d+)([KRM])(\d*)$/);if(!m)return c;return m[1]+(m[3]?'.'+m[3]:'')+' '+({K:'kΩ',R:'Ω',M:'MΩ'})[m[2]];};
const FAMILY=[
  [/^RC0603FR-07(.+)L$/,m=>({mfr:'Yageo',title:'RC series thick-film chip resistor 0603',cat:'저항',specs:[['값',rval(m[1])],['정밀도','±1 %'],['크기','0603, 1/10 W']]})],
];
const search=mpn=>'https://octopart.com/search?q='+encodeURIComponent(mpn);
function find(mpn){
  if(!mpn)return null;const k=String(mpn).trim();
  if(P[k])return Object.assign({mpn:k},P[k]);
  const base=k.replace(/\s*\(.*\)$/,'');if(P[base])return Object.assign({mpn:base},P[base]);
  for(const[re,f]of FAMILY){const m=base.match(re);if(m)return Object.assign({mpn:base},f(m));}
  return null;
}
function links(info,mpn){const l=[];if(info&&info.pdf)l.push(['데이터시트 PDF',info.pdf]);if(info&&info.page)l.push([info.pdf?'제품 페이지':'제품·데이터시트 페이지',info.page]);if(info&&info.page2)l.push(['관련 페이지',info.page2]);l.push(['부품 검색 (Octopart)',search(mpn)]);return l;}
return{P,find,links,search};
})();
if(typeof module!=='undefined')module.exports=PARTS;
