/* Example HSIS for the built-in SENSE-32 board. Some rows contain deliberate gaps so the checks have something to find. */
const SAMPLE_HSIS={
  meta:{docId:'HSIS-SENSE32',title:'SENSE-32 HW/SW 인터페이스 사양',version:'0.3',mcuRef:'U1',date:'2026-10-11',file:'SENSE-32_HSIS.xlsx (예제)'},
  header:['ID','신호명','분류','MCU 핀','포트','핀 기능','주변장치','방향','초기값','활성 레벨','풀업/풀다운','회로도 넷','HW 연결','전기적 특성','변환식','타이밍','SW 모듈','SW 설정 ID','API','요구사항 ID','테스트 ID','ASIL','상태','비고'],
  rows:[
    ['HSIS-001','VDD','전원','1, 24, 32','','VDD','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%, 최대 40 mA','','','','','','SYS-REQ-001','TC-PWR-01','QM','승인','디커플링 C3, C4 100 nF'],
    ['HSIS-002','VSS','접지','6, 8, 11, 30, 33','','VSS / EP','PWR','접지','','','','GND','J1.3','','','','','','','SYS-REQ-001','TC-PWR-01','QM','승인','노출 패드(33) 포함'],
    ['HSIS-003','OSC_IN','클럭','12','PF0','RCC_OSC_IN','RCC','입력','','','','XIN','Y1.1','HSE 크리스털','','16 MHz, CL 8 pF','Mcu','McuClockSettingConfig_HSE','Mcu_InitClock','SYS-REQ-005','TC-CLK-01','QM','승인',''],
    ['HSIS-004','OSC_OUT','클럭','13','PF1','RCC_OSC_OUT','RCC','출력','','','','XOUT','Y1.3','','','16 MHz','Mcu','McuClockSettingConfig_HSE','','SYS-REQ-005','TC-CLK-01','QM','승인',''],
    ['HSIS-005','NRST','리셋·부트','25','NRST','NRST','RCC','입력','','Low','외부 풀업 10kΩ','NRST','SW1.1','','','최소 펄스 20 µs','','','','SYS-REQ-006','TC-RST-01','QM','승인','리셋 버튼 SW1'],
    ['HSIS-006','BOOT0','리셋·부트','31','BOOT0','BOOT0','SYSCFG','입력','','High','외부 풀다운 10kΩ','BOOT0','','','','','','','','SYS-REQ-006','TC-BOOT-01','QM','리뷰 중','플래시 부팅 고정'],
    ['HSIS-007','USB_DP','통신','10','PA12','USB_DP','USB','양방향','','','','USB_DP','J1.5','USB 2.0 FS, 차동 90 Ω','','12 Mbps','Usb','UsbGeneral','','SYS-REQ-010','TC-USB-01','QM','승인',''],
    ['HSIS-008','USB_DM','통신','9','PA11','USB_DM','USB','양방향','','','','USB_DM','J1.4','USB 2.0 FS, 차동 90 Ω','','12 Mbps','Usb','UsbGeneral','','SYS-REQ-010','TC-USB-01','QM','승인',''],
    ['HSIS-009','LED_STATUS','디지털 출력','15','PB3','GPIO','Dio','출력','Low','High','없음','LED','R2.1','4.4 mA @ 3.3 V','','1 Hz 점멸','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-030','TC-LED-01','QM','승인','R2 330 Ω → D1'],
    ['HSIS-010','I2C1_SCL','통신','18','PB6','I2C1_SCL','I2C1','양방향(오픈 드레인)','','','외부 풀업 4.7kΩ','I2C_SCL','J2.3','','','400 kHz','I2c','I2cChannel_0','I2c_AsyncTransmit','SYS-REQ-020','','QM','승인','센서 확장 헤더'],
    ['HSIS-011','I2C1_SDA','통신','19','PB7','I2C1_SDA','I2C1','양방향(오픈 드레인)','','','외부 풀업 4.7kΩ','I2C_SDA','J2.2','','','400 kHz','I2c','I2cChannel_0','I2c_AsyncTransmit','SYS-REQ-020','TC-I2C-01','QM','승인',''],
    ['HSIS-012','FLASH_CS','디지털 출력','2','PA4','GPIO','Dio','출력','High','Low','없음','FLASH_CS','U3.1','','','','Dio','DioConf_DioChannel_FLASH_CS','Dio_WriteChannel','SYS-REQ-040','TC-FLASH-01','QM','승인','SPI 플래시 칩 선택'],
    ['HSIS-013','SPI1_SCK','통신','5','PA5','SPI1_SCK','SPI1','출력','','','','FLASH_CLK','U3.6','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','Spi_AsyncTransmit','SYS-REQ-040','TC-FLASH-01','QM','승인',''],
    ['HSIS-014','SPI1_MISO','통신','3','PA6','SPI1_MISO','SPI1','입력','','','','FLASH_MISO','U3.2','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','','','TC-FLASH-01','QM','승인',''],
    ['HSIS-015','SPI1_MOSI','통신','4','PA7','SPI1_MOSI','SPI1','출력','','','','FLASH_MOSI','U3.5','','','최대 20 MHz','Spi','SpiExternalDevice_Flash','','SYS-REQ-040','TC-FLASH-01','QM','승인',''],
    ['HSIS-016','VBUS_MON','아날로그','26','PA0','ADC1_IN0','ADC1','아날로그 입력','','','','VBUS_MON','R6/R7 분압 (10k/10k)','0–6.6 V','VBUS = ADC × 3.3 / 4095 × 2.0','1 kHz 샘플링','Adc','AdcGroup_VbusMon','Adc_ReadGroup','SYS-REQ-050','TC-ADC-01','QM','초안','HW rev B에서 추가 예정'],
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
const SAMPLE_ARXML=buildArxml('SENSE-32 예제 Port 설정.',[['LED_STATUS',15,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],['FLASH_CS',2,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],
    ['SPI1_SCK',5,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],['SPI1_MISO',3,'PORT_PIN_IN','PORT_PIN_MODE_SPI',''],['SPI1_MOSI',4,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],
    ['I2C1_SCL',18,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],['I2C1_SDA',20,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],
    ['USB_DP',10,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],['USB_DM',9,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],
    ['VBUS_MON',26,'PORT_PIN_IN','PORT_PIN_MODE_ADC',''],['UART_TX',22,'PORT_PIN_OUT','PORT_PIN_MODE_UART','']]);

/* HSIS for the MCU motor-control example (MOTION-32 DEV). Two deliberate findings: LED_STATUS has no test ID, and its ARXML initial level differs. */
const SAMPLE_HSIS_MCU={
  meta:{docId:'HSIS-MOTION32',title:'MOTION-32 DEV HW/SW 인터페이스 사양',version:'0.2',mcuRef:'U1',date:'2026-10-11',file:'MOTION-32_HSIS.xlsx (예제)'},
  header:SAMPLE_HSIS.header,
  rows:[
    ['HSIS-101','VDD','전원','1, 24','','VDD','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%, 최대 30 mA','','','','','','SYS-REQ-101','TC-PWR-01','QM','승인','디커플링 C2 10 µF, C3 100 nF'],
    ['HSIS-102','VSS','접지','6, 8, 33','','VSS / EP','PWR','접지','','','','GND','J1.2','','','','','','','SYS-REQ-101','TC-PWR-01','QM','승인','노출 패드(33) 포함'],
    ['HSIS-103','MOTOR_PWM','디지털 출력','18','PA8','TIM1_CH1','Pwm','출력','Low','High','없음 (게이트 풀다운 R2는 GATE 넷)','PWM_M','R1.1','3.3 V 푸시풀 · 게이트 직렬 100 Ω','듀티 0–100 % → 모터 평균 전압 0–5 V','500 Hz','Pwm','PwmChannel_MOTOR','Pwm_SetDutyCycle','SYS-REQ-110','TC-MOT-01','QM','승인','소프트 스타트 250 ms · 펌웨어 PWM_FREQ_HZ'],
    ['HSIS-104','MOTOR_ISENSE','아날로그','15','PA1','ADC1_IN1','Adc','입력','','','','ISNS_ADC','R6.1','R5 0.1 Ω 션트 → R6·C4 RC 필터 (τ 10 ms)','I[mA] = V[V] ÷ 0.1 Ω × 1000','1 kHz 샘플','Adc','AdcGroup_MotorCurrent','Adc_ReadGroup','SYS-REQ-111','TC-MOT-02','QM','승인','전류 제한 400 mA (펌웨어 CURRENT_LIMIT_MA)'],
    ['HSIS-105','LED_STATUS','디지털 출력','10','PB3','GPIO','Dio','출력','Low','High','없음','LED_ST','R4.2','약 4 mA @ 3.3 V (R4 330 Ω)','','가속 중 60 ms 점멸, 정속 시 점등','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-120','','QM','리뷰 중','D3 녹색 LED'],
  ]
};
const SAMPLE_ARXML_MCU=buildArxml('MOTION-32 DEV 예제 Port 설정.',[['MOTOR_PWM',18,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['MOTOR_ISENSE',15,'PORT_PIN_IN','PORT_PIN_MODE_ADC',''],['LED_STATUS',10,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH']]);

/* HSIS for the BLDC example (MOTION-32 BLDC). Deliberate findings: NFAULT has no requirement, HALL2's ARXML direction is wrong. */
const SAMPLE_HSIS_BLDC=(function(){
  const ph=(id,sig,pin,port,fn,net,hw,dir,timing,api,req,test,note)=>[id,sig,'디지털 출력',String(pin),port,fn,fn.startsWith('TIM')?'Pwm':'Dio',dir,'Low','High','없음',net,hw,'3.3 V 푸시풀',fn.startsWith('TIM')?'듀티 0–100 %':'',timing,fn.startsWith('TIM')?'Pwm':'Dio',(fn.startsWith('TIM')?'PwmChannel_':'DioConf_DioChannel_')+sig,api,req,test,'QM','승인',note];
  const hall=(id,sig,pin,port,net,hw,test)=>[id,sig,'디지털 입력',String(pin),port,'GPIO','Dio','입력','','High','없음 (홀 IC 푸시풀 출력)',net,hw,'0 / 3.3 V','','전기각 180° 펄스, 최대 ~100 Hz','Dio','DioConf_DioChannel_'+sig,'Dio_ReadChannel','SYS-REQ-210',test,'QM','승인','6스텝 정류 입력'];
  return{
    meta:{docId:'HSIS-MOTION32-BLDC',title:'MOTION-32 BLDC HW/SW 인터페이스 사양',version:'0.1',mcuRef:'U1',date:'2026-10-11',file:'MOTION-32-BLDC_HSIS.xlsx (예제)'},
    header:SAMPLE_HSIS.header,
    rows:[
      ['HSIS-201','VDD','전원','1, 24','','VDD','PWR','전원','','','','+3V3','U2.2 (LDO 출력)','3.3 V ±3%','','','','','','SYS-REQ-201','TC-PWR-01','QM','승인','홀 센서 전원 공용'],
      ['HSIS-202','VSS','접지','6, 8, 33','','VSS / EP','PWR','접지','','','','GND','J1.2','','','','','','','SYS-REQ-201','TC-PWR-01','QM','승인',''],
      ph('HSIS-203','IN_U',23,'PA13','TIM1_CH1','IN_U','U3.1','출력','1 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','U상 상단 PWM'),
      ph('HSIS-204','EN_U',22,'PA12','GPIO','EN_U','U3.2','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','U상 활성화'),
      ph('HSIS-205','IN_V',21,'PA11','TIM1_CH2','IN_V','U3.3','출력','1 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','V상 상단 PWM'),
      ph('HSIS-206','EN_V',20,'PA10','GPIO','EN_V','U3.4','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','V상 활성화'),
      ph('HSIS-207','IN_W',19,'PA9','TIM1_CH3','IN_W','U3.5','출력','1 kHz','Pwm_SetDutyCycle','SYS-REQ-220','TC-BLDC-01','W상 상단 PWM'),
      ph('HSIS-208','EN_W',18,'PA8','GPIO','EN_W','U3.6','출력','정류 스텝마다 변경','Dio_WriteChannel','SYS-REQ-220','TC-BLDC-01','W상 활성화'),
      ['HSIS-209','NFAULT','디지털 입력','17','PA7','GPIO','Dio','입력(오픈 드레인)','','Low','외부 풀업 10kΩ','NFAULT','U3.7','오픈 드레인, Low = 과전류·과열','','','Dio','DioConf_DioChannel_NFAULT','Dio_ReadChannel','','TC-BLDC-03','QM','리뷰 중','Low이면 즉시 모든 상 개방'],
      hall('HSIS-210','HALL1',12,'PB5','HALL1','M1.4','TC-BLDC-02'),
      hall('HSIS-211','HALL2',13,'PB6','HALL2','M1.5','TC-BLDC-02'),
      hall('HSIS-212','HALL3',14,'PB7','HALL3','M1.6','TC-BLDC-02'),
      ['HSIS-213','LED_STATUS','디지털 출력','10','PB3','GPIO','Dio','출력','Low','High','없음','LED_ST','R4.2','약 4 mA @ 3.3 V','','기계 1회전마다 토글','Dio','DioConf_DioChannel_LED_STATUS','Dio_WriteChannel','SYS-REQ-230','TC-LED-01','QM','승인','D3 녹색 LED'],
    ]};
})();
const SAMPLE_ARXML_BLDC=buildArxml('MOTION-32 BLDC 예제 Port 설정.',[
  ['IN_U',23,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_U',22,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['IN_V',21,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_V',20,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['IN_W',19,'PORT_PIN_OUT','PORT_PIN_MODE_PWM','PORT_PIN_LEVEL_LOW'],['EN_W',18,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW'],
  ['NFAULT',17,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],['HALL1',12,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],['HALL2',13,'PORT_PIN_OUT','PORT_PIN_MODE_DIO',''],['HALL3',14,'PORT_PIN_IN','PORT_PIN_MODE_DIO',''],
  ['LED_STATUS',10,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_LOW']]);
// which HSIS belongs to which built-in board
const HSIS_SAMPLES={
  sense:{hsis:SAMPLE_HSIS,arxml:SAMPLE_ARXML,file:'SENSE-32_Port.arxml (예제)'},
  mcu:{hsis:SAMPLE_HSIS_MCU,arxml:SAMPLE_ARXML_MCU,file:'MOTION-32_Port.arxml (예제)'},
  bldc:{hsis:SAMPLE_HSIS_BLDC,arxml:SAMPLE_ARXML_BLDC,file:'MOTION-32-BLDC_Port.arxml (예제)'}};
if(typeof module!=='undefined')module.exports={SAMPLE_HSIS,SAMPLE_ARXML,HSIS_SAMPLES};
