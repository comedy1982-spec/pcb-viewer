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
const SAMPLE_ARXML=(function(){
  const pins=[['LED_STATUS',15,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],['FLASH_CS',2,'PORT_PIN_OUT','PORT_PIN_MODE_DIO','PORT_PIN_LEVEL_HIGH'],
    ['SPI1_SCK',5,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],['SPI1_MISO',3,'PORT_PIN_IN','PORT_PIN_MODE_SPI',''],['SPI1_MOSI',4,'PORT_PIN_OUT','PORT_PIN_MODE_SPI',''],
    ['I2C1_SCL',18,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],['I2C1_SDA',20,'PORT_PIN_INOUT','PORT_PIN_MODE_I2C',''],
    ['USB_DP',10,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],['USB_DM',9,'PORT_PIN_INOUT','PORT_PIN_MODE_USB',''],
    ['VBUS_MON',26,'PORT_PIN_IN','PORT_PIN_MODE_ADC',''],['UART_TX',22,'PORT_PIN_OUT','PORT_PIN_MODE_UART','']];
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
<!-- SENSE-32 예제 Port 설정. 이 예제에서 PortPinId는 MCU 패키지 핀 번호를 씁니다. -->
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
if(typeof module!=='undefined')module.exports={SAMPLE_HSIS,SAMPLE_ARXML};
