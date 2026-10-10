/* Example HSIS for the built-in SENSE-32 board. Some rows contain deliberate gaps so the checks have something to find. */
const SAMPLE_HSIS={
  meta:{docId:'HSIS-SENSE32',title:'SENSE-32 HW/SW 인터페이스 사양',version:'0.3',mcuRef:'U1',date:'2026-10-11',file:'SENSE-32_HSIS.xlsx (예제)'},
  header:['ID','신호명','분류','MCU 핀','포트','핀 기능','주변장치','방향','초기값','활성 레벨','풀업/풀다운','회로도 넷','HW 연결','전기적 특성','변환식','타이밍','SW 모듈','SW 설정 ID','API','요구사항 ID','테스트 ID','ASIL','상태','비고'],
  rows:[
    ['HSIS-001','VDD','전원','1, 5, 17','','VDD / VDDA / VDDIO2','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%, 최대 40 mA','','','','','','SYS-REQ-001','TC-PWR-01','QM','승인','디커플링 C3(VDD), C4(VDDA) 100 nF'],
    ['HSIS-002','VSS','접지','33','','VSS (노출 패드)','PWR','접지','','','','GND','J1.3','','','','','','','SYS-REQ-001','TC-PWR-01','QM','승인','노출 패드(33) 포함'],
    ['HSIS-005','NRST','리셋·부트','4','NRST','NRST','RCC','입력','','Low','외부 풀업 10kΩ','NRST','SW1.1','','','최소 펄스 20 µs','','','','SYS-REQ-006','TC-RST-01','QM','승인','리셋 버튼 SW1'],
    ['HSIS-006','BOOT0','리셋·부트','31','BOOT0','BOOT0','SYSCFG','입력','','High','외부 풀다운 10kΩ','BOOT0','','','','','','','','SYS-REQ-006','TC-BOOT-01','QM','리뷰 중','플래시 부팅 고정'],
    ['HSIS-007','USB_DP','통신','22','PA12','USB_DP','USB','양방향','','','','USB_DP','J1.5','USB 2.0 FS, 차동 90 Ω','','12 Mbps','Usb','UsbGeneral','','SYS-REQ-010','TC-USB-01','QM','승인',''],
    ['HSIS-008','USB_DM','통신','21','PA11','USB_DM','USB','양방향','','','','USB_DM','J1.4','USB 2.0 FS, 차동 90 Ω','','12 Mbps','Usb','UsbGeneral','','SYS-REQ-010','TC-USB-01','QM','승인',''],
    ['HSIS-009','LED_STATUS','디지털 출력','26','PB3','GPIO','Dio','출력','Low','High','없음','LED','R2.1','4.4 mA @ 3.3 V','','1 Hz 점멸','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-030','TC-LED-01','QM','승인','R2 330 Ω → D1'],
    ['HSIS-010','I2C1_SCL','통신','29','PB6','I2C1_SCL','I2C1','양방향(오픈 드레인)','','','외부 풀업 4.7kΩ','I2C_SCL','J2.3','','','400 kHz','I2c','I2cChannel_0','I2c_AsyncTransmit','SYS-REQ-020','','QM','승인','센서 확장 헤더'],
    ['HSIS-011','I2C1_SDA','통신','30','PB7','I2C1_SDA','I2C1','양방향(오픈 드레인)','','','외부 풀업 4.7kΩ','I2C_SDA','J2.2','','','400 kHz','I2c','I2cChannel_0','I2c_AsyncTransmit','SYS-REQ-020','TC-I2C-01','QM','승인',''],
    ['HSIS-012','FLASH_CS','디지털 출력','10','PA4','GPIO','Dio','출력','High','Low','없음','FLASH_CS','U3.1','','','','Dio','DioConf_DioChannel_FLASH_CS','Dio_WriteChannel','SYS-REQ-040','TC-FLASH-01','QM','승인','SPI 플래시 칩 선택'],
    ['HSIS-013','SPI1_SCK','통신','11','PA5','SPI1_SCK','SPI1','출력','','','','FLASH_CLK','U3.6','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','Spi_AsyncTransmit','SYS-REQ-040','TC-FLASH-01','QM','승인',''],
    ['HSIS-014','SPI1_MISO','통신','12','PA6','SPI1_MISO','SPI1','입력','','','','FLASH_MISO','U3.2','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','','','TC-FLASH-01','QM','승인',''],
    ['HSIS-015','SPI1_MOSI','통신','13','PA7','SPI1_MOSI','SPI1','출력','','','','FLASH_MOSI','U3.5','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','','SYS-REQ-040','TC-FLASH-01','QM','승인',''],
    ['HSIS-016','VBUS_MON','아날로그','6','PA0','ADC1_IN0','ADC1','아날로그 입력','','','','VBUS_MON','R6/R7 분압 (10k/10k)','0–6.6 V','VBUS = ADC × 3.3 / 4095 × 2.0','1 kHz 샘플링','Adc','AdcGroup_VbusMon','Adc_ReadGroup','SYS-REQ-050','TC-ADC-01','QM','초안','HW rev B에서 추가 예정'],
  ]
};
function buildArxml(note,pins){
  return (function(){
  const D='/AUTOSAR/EcucDefs/Port/PortConfigSet/PortContainer/PortPin';
  const num=(n,v)=>`            <ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${D}/${n}</DEFINITION-REF><VALUE>${v}</VALUE></ECUC-NUMERICAL-PARAM-VALUE>`;
  const txt=(n,v)=>`            <ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-ENUMERATION-PARAM-DEF">${D}/${n}</DEFINITION-REF><VALUE>${v}</VALUE></ECUC-TEXTUAL-PARAM-VALUE>`;
  const body=pins.map(([n,id,dir,mode,lvl])=>`        <ECUC-CONTAINER-VALUE>
          <SHORT-NAME>PortPin_${n}</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${D}</DEFINITION-REF>
          <PARAMETER-VALUES>
${[num('PortPinId',id),txt('PortPinDirection',dir),txt('PortPinMode',mode)].concat(lvl?[txt('PortPinLevelValue',lvl)]:[]).join('\n')}
          </PARAMETER-VALUES>
        </ECUC-CONTAINER-VALUE>`).join('\n');
  return`<?xml version="1.0" encoding="UTF-8"?>
<!-- ${note} 이 예제에서 PortPinId는 MCU 패키지 핀 번호를 씁니다. -->
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucConfig</SHORT-NAME><ELEMENTS>
  <ECUC-MODULE-CONFIGURATION-VALUES>
    <SHORT-NAME>Port</SHORT-NAME>
    <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/EcucDefs/Port</DEFINITION-REF>
    <CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>PortConfigSet</SHORT-NAME>
      <SUB-CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>PortContainer_0</SHORT-NAME>
      <SUB-CONTAINERS>
${body}
      </SUB-CONTAINERS></ECUC-CONTAINER-VALUE></SUB-CONTAINERS>
    </ECUC-CONTAINER-VALUE></CONTAINERS>
  </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE></AR-PACKAGES>
</AUTOSAR>
`;})();
}
const SAMPLE_ARXML=buildArxml('SENSE-32 예제 Port 설정 (STM32F042K6U6).',[['LED_STATUS',26,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],['FLASH_CS',10,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],
    ['SPI1_SCK',11,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],['SPI1_MISO',12,'PORT_PIN_IN','PORT_PIN_MODE_SPI',''],['SPI1_MOSI',13,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],
    ['I2C1_SCL',29,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],['I2C1_SDA',31,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],
    ['USB_DP',22,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],['USB_DM',21,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],
    ['VBUS_MON',6,'PORT_PIN_IN','PORT_PIN_MODE_ADC',''],['UART_TX',19,'PORT_PIN_OUT','PORT_PIN_MODE_UART','']]);

/* HSIS for the MCU motor-control example (MOTION-32 DEV). Two deliberate findings: LED_STATUS has no test ID, and its ARXML initial level differs. */
const SAMPLE_HSIS_MCU={
  meta:{docId:'HSIS-MOTION32',title:'MOTION-32 DEV HW/SW 인터페이스 사양',version:'0.2',mcuRef:'U1',date:'2026-10-11',file:'MOTION-32_HSIS.xlsx (예제)'},
  header:SAMPLE_HSIS.header,
  rows:[
    ['HSIS-101','VDD','전원','1, 5, 17','','VDD / VDDA / VDDIO2','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%, 최대 30 mA','','','','','','SYS-REQ-101','TC-PWR-01','QM','승인','디커플링 C2 10 µF, C3 100 nF'],
    ['HSIS-102','VSS','접지','33','','VSS (노출 패드)','PWR','접지','','','','GND','J1.2','','','','','','','SYS-REQ-101','TC-PWR-01','QM','승인','노출 패드(33) 포함'],
    ['HSIS-103','MOTOR_PWM','디지털 출력','18','PA8','TIM1_CH1','Pwm','출력','Low','High','없음 (게이트 풀다운 R2는 GATE 넷)','PWM_M','R1.1','3.3 V 푸시풀 · 게이트 직렬 100 Ω','듀티 0–100 % → 모터 평균 전압 0–5 V','500 Hz','Pwm','PwmChannel_MOTOR','Pwm_SetDutyCycle','SYS-REQ-110','TC-MOT-01','QM','승인','듀티 60 % 제한 (FA-130 정격 3 V) · 펌웨어 PWM_FREQ_HZ'],
    ['HSIS-104','MOTOR_ISENSE','아날로그','15','PB1','ADC_IN9','Adc','입력','','','','ISNS_ADC','R6.1','R5 0.1 Ω 션트 → R6·C4 RC 필터 (τ 10 ms)','I[mA] = V[V] ÷ 0.1 Ω × 1000','1 kHz 샘플','Adc','AdcGroup_MotorCurrent','Adc_ReadGroup','SYS-REQ-111','TC-MOT-02','QM','승인','전류 제한 400 mA (펌웨어 CURRENT_LIMIT_MA)'],
    ['HSIS-105','LED_STATUS','디지털 출력','10','PA4','GPIO','Dio','출력','Low','High','없음','LED_ST','R4.2','약 4 mA @ 3.3 V (R4 330 Ω)','','가속 중 60 ms 점멸, 정속 시 점등','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-120','','QM','리뷰 중','D3 녹색 LED'],
  ]
};
const SAMPLE_ARXML_MCU=buildArxml('MOTION-32 DEV 예제 Port 설정.',[['MOTOR_PWM',18,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['MOTOR_ISENSE',15,'PORT_PIN_IN','PORT_PIN_MODE_ADC',''],['LED_STATUS',10,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH']]);

/* HSIS for the BLDC example (MOTION-32 BLDC). Deliberate findings: NFAULT has no requirement, HALL2's ARXML direction is wrong. */
const SAMPLE_HSIS_BLDC=(function(){
  const ph=(id,sig,pin,port,fn,net,hw,dir,timing,api,req,test,note)=>[id,sig,'디지털 출력',String(pin),port,fn,fn.startsWith('TIM')?'Pwm':'Dio',dir,'Low','High','없음',net,hw,'3.3 V 푸시풀',fn.startsWith('TIM')?'듀티 0–100 %':'',timing,fn.startsWith('TIM')?'Pwm':'Dio',(fn.startsWith('TIM')?'PwmChannel_':'DioConf_DioChannel_')+sig,api,req,test,'QM','승인',note];
  const hall=(id,sig,pin,port,net,hw,test)=>[id,sig,'디지털 입력',String(pin),port,'GPIO','Dio','입력','','High','내부 풀업 (MCU, 약 40 kΩ) · 홀 출력 오픈 컬렉터',net,hw,'0 / 3.3 V','','전기각 180° 펄스, 12 V에서 최대 ~170 Hz','Dio','DioConf_DioChannel_'+sig,'Dio_ReadChannel','SYS-REQ-210',test,'QM','승인','6스텝 정류 입력'];
  return{
    meta:{docId:'HSIS-MOTION32-BLDC',title:'MOTION-32 BLDC HW/SW 인터페이스 사양',version:'0.1',mcuRef:'U1',date:'2026-10-11',file:'MOTION-32-BLDC_HSIS.xlsx (예제)'},
    header:SAMPLE_HSIS.header,
    rows:[
      ['HSIS-201','VDD','전원','1, 5, 17','','VDD / VDDA / VDDIO2','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%','','','','','','SYS-REQ-201','TC-PWR-01','QM','승인','C3 100 nF'],
      ['HSIS-202','VSS','접지','33','','VSS (노출 패드)','PWR','접지','','','','GND','J1.2','','','','','','','SYS-REQ-201','TC-PWR-01','QM','승인',''],
      ph('HSIS-203','IN_U',21,'PA11','TIM1_CH4','IN_U','U3.23','출력','2 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','DRV8313 IN3 → OUT3 → U상'),
      ph('HSIS-204','EN_U',25,'PA15','GPIO','EN_U','U3.22','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','DRV8313 EN3'),
      ph('HSIS-205','IN_V',20,'PA10','TIM1_CH3','IN_V','U3.25','출력','2 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','DRV8313 IN2 → OUT2 → V상'),
      ph('HSIS-206','EN_V',22,'PA12','GPIO','EN_V','U3.24','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','DRV8313 EN2'),
      ph('HSIS-207','IN_W',18,'PA8','TIM1_CH1','IN_W','U3.27','출력','2 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','DRV8313 IN1 → OUT1 → W상'),
      ph('HSIS-208','EN_W',19,'PA9','GPIO','EN_W','U3.26','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','DRV8313 EN1'),
      ['HSIS-209','NFAULT','디지털 입력','26','PB3','GPIO','Dio','입력(오픈 드레인)','','Low','외부 풀업 10kΩ','NFAULT','U3.18','DRV8313 오픈 드레인, Low = 과전류·과열·저전압','','','Dio','DioConf_DioChannel_NFAULT','Dio_ReadChannel','','TC-BLDC-03','QM','리뷰 중','Low이면 즉시 모든 상 개방'],
      hall('HSIS-210','HALL1',12,'PA6','HALL1','M1.4','TC-BLDC-02'),
      hall('HSIS-211','HALL2',13,'PA7','HALL2','M1.5','TC-BLDC-02'),
      hall('HSIS-212','HALL3',14,'PB0','HALL3','M1.6','TC-BLDC-02'),
      ['HSIS-213','LED_STATUS','디지털 출력','10','PA4','GPIO','Dio','출력','Low','High','없음','LED_ST','R4.2','약 4 mA @ 3.3 V','','기계 1회전마다 토글','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-230','TC-LED-01','QM','승인','D3 APT1608SGC'],
    ]};
})();
const SAMPLE_ARXML_BLDC=buildArxml('MOTION-32 BLDC 예제 Port 설정 (STM32F042K6U6).',[
  ['IN_U',21,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_U',25,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['IN_V',20,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_V',22,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['IN_W',18,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_W',19,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['NFAULT',26,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],['HALL1',12,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],['HALL2',13,'PORT_PIN_OUT','PORT_PIN_MODE_DIO',''],['HALL3',14,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],
  ['LED_STATUS',10,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW']]);
// which HSIS belongs to which built-in board
const HSIS_SAMPLES={
  sense:{hsis:SAMPLE_HSIS,arxml:SAMPLE_ARXML,file:'SENSE-32_Port.arxml (예제)'},
  mcu:{hsis:SAMPLE_HSIS_MCU,arxml:SAMPLE_ARXML_MCU,file:'MOTION-32_Port.arxml (예제)'},
  bldc:{hsis:SAMPLE_HSIS_BLDC,arxml:SAMPLE_ARXML_BLDC,file:'MOTION-32-BLDC_Port.arxml (예제)'}};
if(typeof module!=='undefined')module.exports={SAMPLE_HSIS,SAMPLE_ARXML,HSIS_SAMPLES};
