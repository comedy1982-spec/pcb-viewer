/* Built-in example board, expressed in the viewer JSON format */
// STM32F042K6U6 (UFQFPN32) pin names, from the ST datasheet pin-definition table; the exposed pad (33 here) is VSS
const STM32F042K6U6_PINS={1:'VDD',2:'PF0',3:'PF1',4:'NRST',5:'VDDA',6:'PA0',7:'PA1',8:'PA2',9:'PA3',10:'PA4',11:'PA5',12:'PA6',13:'PA7',14:'PB0',15:'PB1',16:'PB2',17:'VDDIO2',18:'PA8',19:'PA9',20:'PA10',21:'PA11',22:'PA12',23:'PA13',24:'PA14',25:'PA15',26:'PB3',27:'PB4',28:'PB5',29:'PB6',30:'PB7',31:'BOOT0',32:'PB8',33:'VSS'};
const SAMPLE_SPEC=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const G=(...pairs)=>{for(let i=0;i<pairs.length;i+=2)tr('T','GND',0.3,pairs[i],pairs[i+1]);};
  // U1 = STM32F042K6U6 (UFQFPN32) rotated 270°: VDD/NRST/VDDA on top, SPI1 on the left, USB on the bottom, I²C/PB3/BOOT0 on the right
  tr('T','VBUS',0.6,'J1.2',[7.6,21.5],[7.6,31],'C1.1');
  tr('T','VBUS',0.6,'C1.1',[11,32.2],[11.95,33.15],'U2.3');
  // 3.3 V: LDO → VDDA (pin 5), VDD (pin 1, from the bottom trunk), VDDIO2 (pin 17, via the flash supply)
  tr('T','+3V3',0.6,'U2.2','U2.4');
  tr('T','+3V3',0.5,'U2.4',[24.3,26.85]);
  tr('T','+3V3',0.4,[22,26.85],'C2.1');
  tr('T','+3V3',0.3,[24.3,26.85],[24.3,24.3],[31.75,24.3],'U1.5');
  tr('T','+3V3',0.3,[28.8,24.3],'C4.1');
  tr('T','+3V3',0.3,'U1.1',[33.75,23.6],'C3.1');tr('T','+3V3',0.3,'C3.1',[34.4,24.6]);
  tr('T','+3V3',0.3,'U1.17',[29.6,17.3],[28.4,17.3]);
  tr('T','+3V3',0.3,'R1.2',[40.8,34.2]);
  tr('T','+3V3',0.3,'R3.2',[45,25.6]);
  tr('T','+3V3',0.3,'R4.1',[48,13.4]);
  tr('T','NRST',0.25,'U1.4',[32.25,25.6],[37.6,25.6],[39.2,27.2],'R1.1');
  tr('T','NRST',0.25,'R1.1',[39.2,28.6],[42.2,28.6],'SW1.3');
  tr('T','NRST',0.25,'SW1.3','SW1.1');
  // USB FS (crystal-less: HSI48 + CRS)
  tr('T','USB_DM',0.25,'J1.4',[7.5,19.5],[10.5,16.5],[32.25,16.5],'U1.21');
  tr('T','USB_DP',0.25,'J1.5',[7.2,18.5],[9.7,16.0],[32.75,16.0],'U1.22');
  tr('T','CC1',0.25,'J1.1',[6.6,23.4]);
  // I²C1 on PB6/PB7 to the header
  tr('T','I2C_SDA',0.25,'U1.30',[38,20.75],[38.52,21.27],'J2.2');
  tr('T','I2C_SDA',0.25,[45,21.27],'R3.1');
  tr('T','I2C_SCL',0.25,'U1.29',[39,20.25],[40.52,18.73],'J2.3');
  tr('T','I2C_SCL',0.25,[48,18.73],'R4.2');
  // status LED on PB3
  tr('T','LED',0.25,'U1.26',[36.2,18.75],[37.6,17.35],[37.6,11],'R2.1');
  tr('T','LED_A',0.25,'R2.2','D1.1');
  // SPI1 (PA4–PA7) to the flash on the bottom side
  tr('T','FLASH_CS',0.25,'U1.10',[28.2,21.25],[27.6,21.9]);tr('B','FLASH_CS',0.25,[27.6,21.9],'U3.1');
  tr('T','FLASH_MISO',0.25,'U1.12',[28.7,20.25]);tr('B','FLASH_MISO',0.25,[28.7,20.25],[24.5,20.635],'U3.2');
  tr('T','FLASH_CLK',0.25,'U1.11',[26.5,20.75],[25.2,19.365],[15.8,19.365]);tr('B','FLASH_CLK',0.25,[15.8,19.365],'U3.6');
  tr('T','FLASH_MOSI',0.25,'U1.13',[27.2,19.75],[26.6,18.095],[15.8,18.095]);tr('B','FLASH_MOSI',0.25,[15.8,18.095],'U3.5');
  G('J1.3',[6.9,20.5],'J1.6',[6.8,16.8],'J1.S1',[4.5,25.4],'J1.S2',[4.5,14.6],'C1.2',[11,27.7],'U2.1',[18.3,35.2],'C2.2',[22,32.4],
    'C3.2',[37.2,23.6],'C4.2',[31.2,26.6],'D1.2',[46,10],'SW1.2',[52.6,32.25],'SW1.4',[52.6,27.75]);
  // bottom: 3.3 V trunk, flash supply, CC pull-down
  tr('B','+3V3',0.45,[24.3,26.85],[24.3,34.2],[54,34.2],[56.5,31.7],[56.5,15.9],[54,13.4],[48,13.4]);
  tr('B','+3V3',0.3,[56.5,23.81],'J2.1');
  tr('B','+3V3',0.3,[45,25.6],[45,34.2]);
  tr('B','+3V3',0.3,[34.4,24.6],[34.4,34.2]);
  tr('B','+3V3',0.3,[24.3,26.85],[16.3,26.85],[16.3,20.635],'U3.7');
  tr('B','+3V3',0.3,[16.3,21.905],'U3.8');
  tr('B','+3V3',0.3,[22.4,26.85],[20.8,25.25],'C7.1');
  tr('B','+3V3',0.3,[28.4,17.3],[23.9,17.3],[23.9,19.0],'U3.3');
  tr('B','+3V3',0.3,'U3.3',[21.6,19.6],[18.4,21.6],'U3.8');
  tr('B','CC1',0.25,[6.6,23.4],[6.6,27.8],'R5.1');
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.6,drill:0.3}));
  via('GND',[6.9,20.5],[6.8,16.8],[4.5,25.4],[4.5,14.6],[11,27.7],[18.3,35.2],[22,32.4],[37.2,23.6],[31.2,26.6],[46,10],[52.6,32.25],[52.6,27.75],
    [31.4,19.4],[32.6,19.4],[31.4,20.6],[32.6,20.6],[12,7],[20,7],[44,6.5],[52,7.5],[11,37.2],[50,37.2]);
  via('+3V3',[24.3,26.85],[40.8,34.2],[45,25.6],[48,13.4],[34.4,24.6],[28.4,17.3]);
  via('CC1',[6.6,23.4]);via('FLASH_CS',[27.6,21.9]);via('FLASH_MISO',[28.7,20.25]);via('FLASH_MOSI',[15.8,18.095]);via('FLASH_CLK',[15.8,19.365]);
  const C=(ref,value,footprint,side,x,y,rotation,mpn,description,pins,extra)=>Object.assign({ref,value,footprint,side,x,y,rotation,mpn,description,pins},extra||{});
  return{
    _source:'예제',
    board:{name:'SENSE-32 DEV v1.2',width:60,height:40,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[56.5,3.5,3.2],[3.5,36.5,3.2],[56.5,36.5,3.2]]},
    components:[
      C('J1','USB-C 16P','USB-C','top',3,20,0,'USB4105-GF-A','USB-C 리셉터클 (GCT) · 전원과 USB 2.0 데이터 · 뷰어 풋프린트는 사용 핀만 단순화',{1:'CC1',2:'VBUS',3:'GND',4:'USB_DM',5:'USB_DP',6:'GND',S1:'GND',S2:'GND'},{label:[3,20],pinNames:{1:'CC1',2:'VBUS',3:'GND',4:'D−',5:'D+',6:'GND',S1:'SHIELD',S2:'SHIELD'}}),
      C('U2','AMS1117-3.3','SOT-223','top',16,30,180,'AMS1117-3.3','3.3 V LDO 레귤레이터 · 최대 1 A',{1:'GND',2:'+3V3',3:'VBUS',4:'+3V3'},{label:[16,30],pinNames:{1:'GND',2:'VOUT',3:'VIN',4:'TAB'}}),
      C('C1','10µF','0805','top',11,30,270,'CL21A106KAYNNNE','LDO 입력 커패시터 · X5R 25 V',{1:'VBUS',2:'GND'},{label:[9.3,30]}),
      C('C2','10µF','0805','top',22,30,90,'CL21A106KAYNNNE','LDO 출력 커패시터 · X5R 25 V',{1:'+3V3',2:'GND'},{label:[23.9,30]}),
      C('U1','STM32F042K6U6','QFN-32','top',32,20,270,'STM32F042K6U6','Arm Cortex-M0 48 MHz · 32 KB 플래시 · 6 KB SRAM · 크리스털리스 USB FS (HSI48+CRS) · UFQFPN32',
        {1:'+3V3',4:'NRST',5:'+3V3',10:'FLASH_CS',11:'FLASH_CLK',12:'FLASH_MISO',13:'FLASH_MOSI',17:'+3V3',21:'USB_DM',22:'USB_DP',26:'LED',29:'I2C_SCL',30:'I2C_SDA',33:'GND'},
        {pinNames:STM32F042K6U6_PINS,label:[32,14.6]}),
      C('C3','100nF','0603','top',35.2,23.6,0,'CL10B104KB8NNNC','디커플링 · VDD(1번 핀)',{1:'+3V3',2:'GND'},{label:[35.2,22.5]}),
      C('C4','100nF','0603','top',29.6,25.6,0,'CL10B104KB8NNNC','디커플링 · VDDA(5번 핀)',{1:'+3V3',2:'GND'},{label:[29.6,26.7]}),
      C('R1','10kΩ','0603','top',40,30,0,'RC0603FR-0710KL','NRST 풀업 저항 · 1%',{1:'NRST',2:'+3V3'}),
      C('SW1','RESET','SW-6x6','top',47,30,0,'B3FS-1000P','리셋 택트 스위치 (Omron) · 6×6 mm SMD',{1:'NRST',2:'GND',3:'NRST',4:'GND'},{label:[47,30]}),
      C('R2','330Ω','0603','top',40,10,0,'RC0603FR-07330RL','LED 전류 제한 저항',{1:'LED',2:'LED_A'}),
      C('D1','LED 녹색','LED-0603','top',44,10,0,'APT1608SGC','상태 표시 LED (Kingbright) · 568 nm',{1:'LED_A',2:'GND'},{pinNames:{1:'A',2:'K'}}),
      C('R3','4.7kΩ','0603','top',45,23.5,90,'RC0603FR-074K7L','I²C SDA 풀업 저항',{1:'I2C_SDA',2:'+3V3'},{label:[46.7,23.5]}),
      C('R4','4.7kΩ','0603','top',48,15.5,90,'RC0603FR-074K7L','I²C SCL 풀업 저항',{1:'+3V3',2:'I2C_SCL'},{label:[49.7,15.5]}),
      C('J2','I²C 헤더','HDR-1x4','top',55,20,0,'61300411121','I²C 확장 헤더 (Würth WR-PHD) · 2.54 mm 스루홀',{1:'+3V3',2:'I2C_SDA',3:'I2C_SCL',4:'GND'},{pinNames:{1:'3V3',2:'SDA',3:'SCL',4:'GND'}}),
      C('U3','W25Q32JV','SOIC-8','bottom',20,20,0,'W25Q32JVSSIQ','32 Mbit SPI NOR 플래시 (Winbond)',{1:'FLASH_CS',2:'FLASH_MISO',3:'+3V3',4:'GND',5:'FLASH_MOSI',6:'FLASH_CLK',7:'+3V3',8:'+3V3'},{label:[20,20],pinNames:{1:'/CS',2:'DO',3:'/WP',4:'GND',5:'DI',6:'CLK',7:'/HOLD',8:'VCC'}}),
      C('C7','100nF','0603','bottom',20,24.5,0,'CL10B104KB8NNNC','플래시 디커플링',{1:'+3V3',2:'GND'},{label:[17.6,24.5]}),
      C('R5','5.1kΩ','0603','bottom',9,27,90,'RC0603FR-075K1L','USB-C CC 풀다운 (싱크 지정)',{1:'CC1',2:'GND'},{label:[10.7,27]}),
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.3,inset:0.5}],
    texts:[
      {side:'top',text:'SENSE-32 DEV',x:31,y:37.3,size:1.2},{side:'top',text:'v1.2',x:37.4,y:37.3,size:0.8,align:'left'},
      {side:'top',text:'USB',x:2.6,y:26.6,size:0.72},{side:'top',text:'RST',x:47,y:34.2,size:0.72},
      {side:'top',text:'3V3',x:56.6,y:23.81,size:0.56,align:'left'},{side:'top',text:'SDA',x:56.6,y:21.27,size:0.56,align:'left'},
      {side:'top',text:'SCL',x:56.6,y:18.73,size:0.56,align:'left'},{side:'top',text:'GND',x:56.6,y:16.19,size:0.56,align:'left'},
      {side:'bottom',text:'SENSE-32',x:38,y:6.9,size:1.1},{side:'bottom',text:'REV A · 2026-10 · LOT 0001',x:38,y:4.6,size:0.6},
      {side:'bottom',text:'SPI FLASH',x:20,y:13.4,size:0.64},
    ]
  };
})();
