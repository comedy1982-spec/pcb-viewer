/* MCU pin-function database for pin-assignment recommendation and MCAL generation.
   Sources:
   - STM32F042K6U6 (UFQFPN32): ST DS10152 "STM32F042x4/x6" Table 13 (pin definitions) and Tables 14/15 (AF0–AF7 for port A/B).
   - TC364DP (TQFP-144): Infineon "TC36x Data Sheet" V1.1 2021-03 — Figure 2-5 (TQFP-144 logic symbol) and the port function tables
     (P00, P02, P10, P11, P13, P14.0–P14.2). Ports whose function tables are not in this DB yet (P14.3+, P15, P20, P21, P22, P23, P33)
     are offered as plain GPIO only, and are marked so in the UI. AN0–AN31 → EVADC Gx CHy follows the TC3xx convention G = n / 8, CH = n mod 8. */
const MCU_PINS=(function(){
"use strict";

/* ---------- TC364DP · TQFP-144 ---------- */
// '#pin|name' rows; function rows: 'port|I:a;b|O1:x|O2:y …' (IOM_MON/IOM_REF and reserved slots left out)
const TC_PKG='1:P02.0,2:P02.1,3:P02.2,4:P02.3,5:P02.4,6:P02.5,7:P02.6,8:P02.7,9:P02.8,10:VDD,11:P00.0,12:P00.1,13:P00.2,14:P00.3,15:P00.4,16:P00.5,17:P00.6,18:P00.7,19:P00.8,20:P00.9,21:P00.12,22:VDD,23:VEXT,'+
 '24:P40.9/AN39,25:P40.8/AN38,26:P40.7/AN37,27:P40.6/AN36,28:AN35,29:AN34,30:P40.5/AN33,31:P40.4/AN32,32:AN28,33:P40.3/AN27,34:P40.2/AN26,35:P40.1/AN25,36:P40.0/AN24,37:AN21,38:AN20,39:AN17,40:AN16,'+
 '41:VAGND1,42:VAREF1,43:VSSM,44:VDDM,45:AN11,46:AN5,47:AN4,48:AN3,49:AN2,50:AN1,51:AN0,52:VEVRSB,53:NC,54:NC,55:NC,56:P33.0,57:P33.1,58:P33.2,59:P33.3,60:P33.4,61:P33.5,62:P33.6,63:P33.7,64:P33.8,'+
 '65:P33.9,66:P33.10,67:P33.11,68:P33.12,69:VEXT,70:P32.0/VGATE1N,71:P32.1/VGATE1P,72:VDD,73:P23.1,74:P22.0,75:P22.1,76:P22.2,77:P22.3,78:VEXT,79:VDD,80:VSS,81:XTAL1,82:XTAL2,83:VEXT,'+
 '84:P21.2,85:P21.3,86:P21.4,87:P21.5,88:P21.6/TDI,89:TMS,90:P21.7/TDO,91:TRST,92:TCK,93:P20.0,94:P20.2,95:P20.3,96:ESR1,97:PORST,98:ESR0,99:VDD,100:P20.6,101:P20.7,102:P20.8,103:P20.9,104:P20.10,'+
 '105:P20.11,106:P20.12,107:P20.13,108:P20.14,109:P15.0,110:P15.1,111:P15.2,112:P15.3,113:P15.4,114:P15.5,115:P15.6,116:P15.7,117:P15.8,118:P14.0,119:P14.1,120:P14.2,121:P14.3,122:P14.4,'+
 '123:P14.5,124:P14.6,125:VEXT,126:VDDP3,127:VDD,128:P13.0,129:P13.1,130:P13.2,131:P13.3,132:P11.2,133:P11.3,134:P11.6,135:P11.9,136:P11.8,137:P11.10,138:P11.11,139:P11.12,140:P10.1,141:P10.2,'+
 '142:P10.3,143:P10.5,144:P10.6,145:VSS';
const TC_FN=`P02.0|I:GTM_TIM1_IN0_2;GTM_TIM0_IN0_2;CCU61_CC60INB;ASCLIN2_ARXG;CCU60_CC60INA;SCU_E_REQ3_2|O1:GTM_TOUT0|O2:ASCLIN2_ATX|O3:QSPI3_SLSO1|O4:EDSADC_CGPWMN|O5:CAN00_TXD|O6:ERAY0_TXDA|O7:CCU60_CC60
P02.1|I:GTM_TIM1_IN1_2;GTM_TIM0_IN1_2;ERAY0_RXDA2;ASCLIN2_ARXB;CAN00_RXDA;SCU_E_REQ2_1|O1:GTM_TOUT1|O3:QSPI3_SLSO2|O4:EDSADC_CGPWMP|O7:CCU60_COUT60
P02.2|I:GTM_TIM1_IN2_2;GTM_TIM0_IN2_2;CCU61_CC61INB;CCU60_CC61INA|O1:GTM_TOUT2|O2:ASCLIN1_ATX|O3:QSPI3_SLSO3|O4:PSI5_TX0|O5:CAN02_TXD|O6:ERAY0_TXDB|O7:CCU60_CC61
P02.3|I:GTM_TIM1_IN3_2;GTM_TIM0_IN3_2;ERAY0_RXDB2;CAN02_RXDB;ASCLIN1_ARXG;PSI5_RX0B|O1:GTM_TOUT3|O2:ASCLIN2_ASLSO|O3:QSPI3_SLSO4|O7:CCU60_COUT61
P02.4|I:GTM_TIM1_IN4_1;GTM_TIM0_IN4_1;CCU61_CC62INB;QSPI3_SLSIA;CCU60_CC62INA;I2C0_SDAA;CAN11_RXDA|O1:GTM_TOUT4|O2:ASCLIN2_ASCLK|O3:QSPI3_SLSO0|O4:PSI5S_CLK|O5:I2C0_SDA|O6:ERAY0_TXENA|O7:CCU60_CC62
P02.5|I:GTM_TIM1_IN5_1;GTM_TIM0_IN5_1;I2C0_SCLA;PSI5_RX1B;PSI5S_RXB;QSPI3_MRSTA;SENT_SENT3C|O1:GTM_TOUT5|O2:CAN11_TXD|O3:QSPI3_MRST|O5:I2C0_SCL|O6:ERAY0_TXENB|O7:CCU60_COUT62
P02.6|I:GTM_TIM1_IN6_1;GTM_TIM0_IN6_1;CCU60_CC60INC;SENT_SENT2C;GPT120_T3INA;CCU60_CCPOS0A;QSPI3_MTSRA|O1:GTM_TOUT6|O2:PSI5S_TX|O3:QSPI3_MTSR|O4:PSI5_TX1|O5:EVADC_EMUX00|O7:CCU60_CC60
P02.7|I:GTM_TIM1_IN7_1;GTM_TIM0_IN7_1;CCU60_CC61INC;SENT_SENT1C;GPT120_T3EUDA;CCU60_CCPOS1A;QSPI3_SCLKA|O1:GTM_TOUT7|O3:QSPI3_SCLK|O4:EDSADC_DSCOUT3|O5:EVADC_EMUX01|O6:SENT_SPC1|O7:CCU60_CC61
P02.8|I:GTM_TIM2_IN0_2;CCU60_CC62INC;SENT_SENT0C;CCU60_CCPOS2A;GPT120_T4INA|O1:GTM_TOUT8|O2:QSPI3_SLSO5|O3:ASCLIN8_ASCLK|O5:EVADC_EMUX02|O6:GETH_MDC|O7:CCU60_CC62
P00.0|I:GTM_TIM2_IN0_1;CCU61_CTRAPA;CCU60_T12HRE;MSC0_INJ0;GETH_MDIOA|O1:GTM_TOUT9|O2:ASCLIN3_ASCLK|O3:ASCLIN3_ATX|O5:CAN10_TXD|O7:CCU60_COUT63
P00.1|I:GTM_TIM2_IN1_1;CCU60_CC60INB;ASCLIN3_ARXE;CAN10_RXDA;PSI5_RX0A;CCU61_CC60INA;SENT_SENT0B;EVADC_G9CH11|O1:GTM_TOUT10|O2:ASCLIN3_ATX|O6:SENT_SPC0|O7:CCU61_CC60
P00.2|I:GTM_TIM2_IN1_2;SENT_SENT1B;EVADC_G9CH10|O1:GTM_TOUT11|O2:ASCLIN3_ASCLK|O4:PSI5_TX0|O5:CAN03_TXD|O6:QSPI3_SLSO4|O7:CCU61_COUT60
P00.3|I:GTM_TIM2_IN2_1;CCU60_CC61INB;EDSADC_DSCIN3A;PSI5_RX1A;CAN03_RXDA;PSI5S_RXA;SENT_SENT2B;CCU61_CC61INA;EVADC_G9CH9|O1:GTM_TOUT12|O2:ASCLIN3_ASLSO|O4:EDSADC_DSCOUT3|O6:SENT_SPC2|O7:CCU61_CC61
P00.4|I:GTM_TIM2_IN3_1;SCU_E_REQ2_2;SENT_SENT3B;EDSADC_DSDIN3A;EDSADC_SGNA;ASCLIN10_ARXA;EVADC_G9CH8|O1:GTM_TOUT13|O2:PSI5S_TX|O3:CAN11_TXD|O4:PSI5_TX1|O6:SENT_SPC3|O7:CCU61_COUT61
P00.5|I:GTM_TIM2_IN4_1;CCU60_CC62INB;EDSADC_DSCIN2A;CCU61_CC62INA;SENT_SENT4B;CAN11_RXDB;EVADC_G9CH7|O1:GTM_TOUT14|O2:EDSADC_CGPWMN|O3:QSPI3_SLSO3|O4:EDSADC_DSCOUT2|O5:EVADC_FC0BFLOUT|O6:SENT_SPC4|O7:CCU61_CC62
P00.6|I:GTM_TIM2_IN5_1;EDSADC_DSDIN2A;SENT_SENT5B;ASCLIN5_ARXA;EVADC_G9CH6|O1:GTM_TOUT15|O2:EDSADC_CGPWMP|O5:EVADC_EMUX10|O6:SENT_SPC5|O7:CCU61_COUT62
P00.7|I:GTM_TIM2_IN6_1;CCU61_CC60INC;SENT_SENT6B;GPT120_T2INA;CCU61_CCPOS0A;CCU60_T12HRB;EVADC_G9CH5|O1:GTM_TOUT16|O2:ASCLIN5_ATX|O5:EVADC_EMUX11|O6:SENT_SPC6|O7:CCU61_CC60
P00.8|I:GTM_TIM2_IN7_1;CCU61_CC61INC;SENT_SENT7B;GPT120_T2EUDA;CCU61_CCPOS1A;CCU60_T13HRB;ASCLIN10_ARXB;EVADC_G9CH4|O1:GTM_TOUT17|O2:QSPI3_SLSO6|O3:ASCLIN10_ATX|O5:EVADC_EMUX12|O6:SENT_SPC7|O7:CCU61_CC61
P00.9|I:GTM_TIM1_IN0_1;GTM_TIM0_IN0_1;CCU61_CC62INC;SENT_SENT8B;CCU61_CCPOS2A;EDSADC_DSCIN1A;GPT120_T4EUDA;EVADC_G9CH3|O1:GTM_TOUT18|O2:QSPI3_SLSO7|O3:ASCLIN3_ARTS|O4:EDSADC_DSCOUT1|O5:ASCLIN4_ATX|O6:SENT_SPC8|O7:CCU61_CC62
P00.12|I:GTM_TIM1_IN3_1;GTM_TIM0_IN3_1;ASCLIN3_ACTSA;EDSADC_DSDIN0A;ASCLIN4_ARXA;EVADC_G9CH0|O1:GTM_TOUT21|O7:CCU61_COUT63
P10.1|I:GTM_TIM1_IN1_3;GTM_TIM0_IN1_3;GPT120_T5EUDB;QSPI1_MRSTA|O1:GTM_TOUT103|O2:QSPI1_MTSR|O3:QSPI1_MRST|O4:MSC0_EN1|O5:EVADC_FC1BFLOUT
P10.2|I:GTM_TIM1_IN2_3;GTM_TIM0_IN2_3;CAN02_RXDE;MSC0_SDI1;QSPI1_SCLKA;GPT120_T6INB;SCU_E_REQ2_0|O1:GTM_TOUT104|O3:QSPI1_SCLK|O4:MSC0_EN0
P10.3|I:GTM_TIM1_IN3_3;GTM_TIM0_IN3_3;QSPI1_MTSRA;SCU_E_REQ3_0;GPT120_T5INB|O1:GTM_TOUT105|O3:QSPI1_MTSR|O4:MSC0_EN0|O6:CAN02_TXD
P10.5|I:GTM_TIM1_IN2_4;GTM_TIM0_IN2_4;PMS_HWCFG4IN;MSC0_INJ1|O1:GTM_TOUT107|O2:ASCLIN2_ATX|O3:QSPI3_SLSO8|O4:QSPI1_SLSO9|O5:GPT120_T6OUT|O6:ASCLIN2_ASLSO
P10.6|I:GTM_TIM1_IN3_4;GTM_TIM0_IN3_4;ASCLIN2_ARXD;QSPI3_MTSRB;PMS_HWCFG5IN|O1:GTM_TOUT108|O2:ASCLIN2_ASCLK|O3:QSPI3_MTSR|O4:GPT120_T3OUT|O6:QSPI1_MRST
P11.2|I:GTM_TIM2_IN1_3|O1:GTM_TOUT95|O3:QSPI0_SLSO5|O4:QSPI1_SLSO5|O5:MSC0_EN1|O6:GETH_TXD1|O7:CCU60_COUT63
P11.3|I:GTM_TIM2_IN2_2;MSC0_SDI3;QSPI1_MRSTB|O1:GTM_TOUT96|O3:QSPI1_MRST|O4:ERAY0_TXDA|O6:GETH_TXD0|O7:CCU60_COUT62
P11.6|I:GTM_TIM2_IN3_2;QSPI1_SCLKB|O1:GTM_TOUT97|O2:ERAY0_TXENB|O3:QSPI1_SCLK|O4:ERAY0_TXENA|O5:MSC0_FCLP|O6:GETH_TXEN|O7:CCU60_COUT61
P11.8|I:GTM_TIM2_IN5_8;GETH_RXD2A;CAN12_RXDD|O1:GTM_TOUT124
P11.9|I:GTM_TIM2_IN4_2;QSPI1_MTSRB;ERAY0_RXDA1;GETH_RXD1A|O1:GTM_TOUT98|O3:QSPI1_MTSR|O5:MSC0_SOP|O7:CCU60_COUT60
P11.10|I:GTM_TIM2_IN5_2;GTM_TIM2_IN0_9;CAN03_RXDD;ERAY0_RXDB1;ASCLIN1_ARXE;SCU_E_REQ6_3;MSC0_SDI0;GETH_RXD0A;QSPI1_SLSIA|O1:GTM_TOUT99|O3:QSPI0_SLSO3|O4:QSPI1_SLSO3|O7:CCU60_CC62
P11.11|I:GTM_TIM2_IN6_2;GETH_CRSDVA;GETH_RXDVA|O1:GTM_TOUT100|O3:QSPI0_SLSO4|O4:QSPI1_SLSO4|O5:MSC0_EN0|O6:ERAY0_TXENB|O7:CCU60_CC61
P11.12|I:GTM_TIM2_IN7_2;GETH_REFCLKA;GETH_TXCLKB;GETH_RXCLKA|O1:GTM_TOUT101|O2:ASCLIN1_ATX|O3:GTM_CLK2|O4:ERAY0_TXDB|O5:CAN03_TXD|O6:CCU_EXTCLK1|O7:CCU60_CC60
P13.0|I:GTM_TIM2_IN5_3;ASCLIN10_ARXC|O1:GTM_TOUT91|O2:ASCLIN10_ATX|O3:QSPI2_SCLKN|O4:MSC0_EN1|O5:MSC0_FCLN|O7:CAN10_TXD
P13.1|I:GTM_TIM2_IN6_3;I2C0_SCLB;CAN10_RXDD;ASCLIN10_ARXD|O1:GTM_TOUT92|O3:QSPI2_SCLKP|O5:MSC0_FCLP|O6:I2C0_SCL
P13.2|I:GTM_TIM2_IN7_3;GPT120_CAPINA;I2C0_SDAB|O1:GTM_TOUT93|O2:ASCLIN10_ASCLK|O3:QSPI2_MTSRN|O4:MSC0_FCLP|O5:MSC0_SON|O6:I2C0_SDA
P13.3|I:GTM_TIM2_IN0_3|O1:GTM_TOUT94|O2:ASCLIN10_ASLSO|O3:QSPI2_MTSRP|O5:MSC0_SOP
P14.0|I:GTM_TIM1_IN3_5;GTM_TIM0_IN3_5|O1:GTM_TOUT80|O2:ASCLIN0_ATX|O3:ERAY0_TXDA|O4:ERAY0_TXDB|O5:CAN01_TXD|O6:ASCLIN0_ASCLK|O7:CCU60_COUT62
P14.1|I:GTM_TIM1_IN4_3;GTM_TIM0_IN4_3;ERAY0_RXDA3;ASCLIN0_ARXA;ERAY0_RXDB3;CAN01_RXDB;SCU_E_REQ3_1;PMS_PINAWKP|O1:GTM_TOUT81|O2:ASCLIN0_ATX|O7:CCU60_COUT63
P14.2|I:GTM_TIM1_IN5_3;GTM_TIM0_IN5_3;PMS_HWCFG2IN|O1:GTM_TOUT82|O2:ASCLIN2_ATX|O3:QSPI2_SLSO1|O6:ASCLIN2_ASCLK`;

function buildTC(){
  const fnBy={};TC_FN.split('\n').forEach(l=>{const[port,...cols]=l.trim().split('|');const f=[];
    cols.forEach(c=>{const i=c.indexOf(':'),k=c.slice(0,i),v=c.slice(i+1).split(';');v.forEach(s=>f.push(k==='I'?['IN',s]:['ALT'+k.slice(1),s]));});fnBy[port]=f;});
  const pins={};
  TC_PKG.split(',').forEach(e=>{const i=e.indexOf(':'),n=e.slice(0,i),name=e.slice(i+1);const m=name.match(/^(P\d\d\.\d+)/);const an=name.match(/AN(\d+)/);
    const o={name};
    if(m){o.port=m[1];o.f=(fnBy[o.port]||[]).slice();o.known=!!fnBy[o.port];
      if(/^P40/.test(o.port))o.inOnly=true;}
    else if(an){o.f=[];o.analogOnly=true;}
    if(an){const ch=+an[1];o.f.push(['ANALOG',ch<32?`EVADC_G${ch>>3}CH${ch&7}`:`AN${ch}`]);o.an=ch;if(o.port)o.known=true;}
    if(!m&&!an)o.supply=true;
    pins[n]=o;});
  // reserved / caution pins
  const R={88:'JTAG TDI (디버그)',90:'JTAG TDO (디버그)',70:'EVR 게이트 드라이브 (VGATE1N)',71:'EVR 게이트 드라이브 (VGATE1P)'};
  Object.entries(R).forEach(([n,why])=>{pins[n].reserved=why;});
  const C={120:'PMS_HWCFG2 (리셋 시 부트 설정 래치)',143:'PMS_HWCFG4 (리셋 시 부트 설정 래치)',144:'PMS_HWCFG5 (리셋 시 부트 설정 래치)',119:'PMS_PINAWKP (대기 모드 깨우기 핀)'};
  Object.entries(C).forEach(([n,why])=>{pins[n].caution=why;});
  return{mpn:'TC364DP-64F300F',family:'aurix',vendor:'Infineon',pkg:'TQFP-144',vext:3.3,pins,
    note:'포트 기능은 TC36x 데이터시트 V1.1의 P00·P02·P10·P11·P13·P14.0–2 표 기준입니다. P14.3 이후, P15, P20–P23, P33은 아직 기능 표를 넣지 않아 GPIO로만 추천합니다.'};
}

/* ---------- STM32F042K6U6 · UFQFPN32 ---------- */
const ST_AF=`PA0|AF1:USART2_CTS|AF2:TIM2_CH1_ETR|AF3:TSC_G1_IO1|ADD:ADC_IN0
PA1|AF0:EVENTOUT|AF1:USART2_RTS|AF2:TIM2_CH2|AF3:TSC_G1_IO2|ADD:ADC_IN1
PA2|AF1:USART2_TX|AF2:TIM2_CH3|AF3:TSC_G1_IO3|ADD:ADC_IN2
PA3|AF1:USART2_RX|AF2:TIM2_CH4|AF3:TSC_G1_IO4|ADD:ADC_IN3
PA4|AF0:SPI1_NSS|AF1:USART2_CK|AF2:USB_NOE|AF3:TSC_G2_IO1|AF4:TIM14_CH1|ADD:ADC_IN4
PA5|AF0:SPI1_SCK|AF1:CEC|AF2:TIM2_CH1_ETR|AF3:TSC_G2_IO2|ADD:ADC_IN5
PA6|AF0:SPI1_MISO|AF1:TIM3_CH1|AF2:TIM1_BKIN|AF3:TSC_G2_IO3|AF5:TIM16_CH1|AF6:EVENTOUT|ADD:ADC_IN6
PA7|AF0:SPI1_MOSI|AF1:TIM3_CH2|AF2:TIM1_CH1N|AF3:TSC_G2_IO4|AF4:TIM14_CH1|AF5:TIM17_CH1|AF6:EVENTOUT|ADD:ADC_IN7
PB0|AF0:EVENTOUT|AF1:TIM3_CH3|AF2:TIM1_CH2N|AF3:TSC_G3_IO2|ADD:ADC_IN8
PB1|AF0:TIM14_CH1|AF1:TIM3_CH4|AF2:TIM1_CH3N|AF3:TSC_G3_IO3|ADD:ADC_IN9
PB2|AF3:TSC_G3_IO4
PA8|AF0:MCO|AF1:USART1_CK|AF2:TIM1_CH1|AF3:EVENTOUT|AF4:CRS_SYNC
PA9|AF1:USART1_TX|AF2:TIM1_CH2|AF3:TSC_G4_IO1|AF4:I2C1_SCL|AF5:MCO
PA10|AF0:TIM17_BKIN|AF1:USART1_RX|AF2:TIM1_CH3|AF3:TSC_G4_IO2|AF4:I2C1_SDA
PA11|AF0:EVENTOUT|AF1:USART1_CTS|AF2:TIM1_CH4|AF3:TSC_G4_IO3|AF4:CAN_RX|AF5:I2C1_SCL|ADD:USB_DM
PA12|AF0:EVENTOUT|AF1:USART1_RTS|AF2:TIM1_ETR|AF3:TSC_G4_IO4|AF4:CAN_TX|AF5:I2C1_SDA|ADD:USB_DP
PA13|AF0:SWDIO|AF1:IR_OUT|AF2:USB_NOE
PA14|AF0:SWCLK|AF1:USART2_TX
PA15|AF0:SPI1_NSS|AF1:USART2_RX|AF2:TIM2_CH1_ETR|AF3:EVENTOUT|AF5:USB_NOE
PB3|AF0:SPI1_SCK|AF1:EVENTOUT|AF2:TIM2_CH2|AF3:TSC_G5_IO1
PB4|AF0:SPI1_MISO|AF1:TIM3_CH1|AF2:EVENTOUT|AF3:TSC_G5_IO2|AF5:TIM17_BKIN
PB5|AF0:SPI1_MOSI|AF1:TIM3_CH2|AF2:TIM16_BKIN|AF3:I2C1_SMBA
PB6|AF0:USART1_TX|AF1:I2C1_SCL|AF2:TIM16_CH1N|AF3:TSC_G5_IO3
PB7|AF0:USART1_RX|AF1:I2C1_SDA|AF2:TIM17_CH1N|AF3:TSC_G5_IO4
PB8|AF0:CEC|AF1:I2C1_SCL|AF2:TIM16_CH1|AF3:TSC_SYNC|AF4:CAN_RX
PF0|AF0:CRS_SYNC|AF1:I2C1_SDA|ADD:OSC_IN
PF1|AF1:I2C1_SCL|ADD:OSC_OUT`;
function buildST(){
  const fnBy={};ST_AF.split('\n').forEach(l=>{const[port,...cols]=l.trim().split('|');fnBy[port]=cols.map(c=>{const i=c.indexOf(':');const k=c.slice(0,i),v=c.slice(i+1);return[k==='ADD'?(/^ADC/.test(v)?'ANALOG':'ADD'):k,v];});});
  const PK={1:'VDD',2:'PF0',3:'PF1',4:'NRST',5:'VDDA',6:'PA0',7:'PA1',8:'PA2',9:'PA3',10:'PA4',11:'PA5',12:'PA6',13:'PA7',14:'PB0',15:'PB1',16:'PB2',17:'VDDIO2',
    18:'PA8',19:'PA9',20:'PA10',21:'PA11',22:'PA12',23:'PA13',24:'PA14',25:'PA15',26:'PB3',27:'PB4',28:'PB5',29:'PB6',30:'PB7',31:'BOOT0',32:'PB8',33:'VSS'};
  const pins={};Object.entries(PK).forEach(([n,name])=>{const o={name};if(fnBy[name]){o.port=name;o.f=fnBy[name];o.known=true;}else o.supply=true;pins[n]=o;});
  pins[23].reserved='SWD SWDIO (디버그)';pins[24].reserved='SWD SWCLK (디버그)';
  pins[21].caution='USB DM과 공유';pins[22].caution='USB DP와 공유';pins[2].caution='HSE 크리스털 입력과 공유';pins[3].caution='HSE 크리스털 출력과 공유';
  return{mpn:'STM32F042K6U6',family:'stm32',vendor:'STMicroelectronics',pkg:'UFQFPN32',vext:3.3,pins,note:'STM32F042x4/x6 데이터시트 Table 13–15 (AF0–AF7) 기준입니다.'};
}

const DB={'TC364DP-64F300F':buildTC(),'STM32F042K6U6':buildST()};
const ALIAS={'TC364DP':'TC364DP-64F300F','TC364':'TC364DP-64F300F','SAK-TC364DP-64F300F':'TC364DP-64F300F','STM32F042K6':'STM32F042K6U6'};
function find(mpn){if(!mpn)return null;const k=String(mpn).trim().toUpperCase().replace(/\s*\(.*\)$/,'');if(DB[k])return DB[k];if(ALIAS[k])return DB[ALIAS[k]];
  for(const key in DB)if(k.startsWith(key)||key.startsWith(k)&&k.length>=8)return DB[key];for(const a in ALIAS)if(k.startsWith(a))return DB[ALIAS[a]];return null;}

/* ---------- roles ----------
   role: what a signal needs from an MCU pin. A function entry [sel, sig] of a pin is mapped to {role, inst, ch, insel}. */
const ROLES={pwm:'PWM 출력',cap:'타이머 캡처 입력',adc:'아날로그 입력',spi_sck:'SPI 클럭',spi_mosi:'SPI 데이터 출력',spi_miso:'SPI 데이터 입력',spi_cs:'SPI 칩 선택',
  uart_tx:'UART 송신',uart_rx:'UART 수신',can_tx:'CAN 송신',can_rx:'CAN 수신',i2c_scl:'I2C 클럭',i2c_sda:'I2C 데이터',irq_in:'외부 인터럽트 입력',
  gpio_out:'GPIO 출력',gpio_in:'GPIO 입력',usb_dm:'USB DM',usb_dp:'USB DP'};
const BUS={spi_sck:'spi',spi_mosi:'spi',spi_miso:'spi',spi_cs:'spi',uart_tx:'uart',uart_rx:'uart',can_tx:'can',can_rx:'can',i2c_scl:'i2c',i2c_sda:'i2c',pwm:'pwm',cap:'cap'};
function classify(family,sel,sig){
  let m;
  if(family==='stm32'){
    if((m=sig.match(/^TIM(\d+)_CH(\d)$/)))return[{role:'pwm',inst:'TIM'+m[1],ch:+m[2]},{role:'cap',inst:'TIM'+m[1],ch:+m[2]}];
    if((m=sig.match(/^SPI(\d)_(SCK|MOSI|MISO|NSS)$/)))return[{role:{SCK:'spi_sck',MOSI:'spi_mosi',MISO:'spi_miso',NSS:'spi_cs'}[m[2]],inst:'SPI'+m[1]}];
    if((m=sig.match(/^USART(\d)_(TX|RX)$/)))return[{role:m[2]==='TX'?'uart_tx':'uart_rx',inst:'USART'+m[1]}];
    if((m=sig.match(/^I2C(\d)_(SCL|SDA)$/)))return[{role:m[2]==='SCL'?'i2c_scl':'i2c_sda',inst:'I2C'+m[1]}];
    if((m=sig.match(/^CAN_(TX|RX)$/)))return[{role:m[1]==='TX'?'can_tx':'can_rx',inst:'CAN'}];
    if((m=sig.match(/^ADC_IN(\d+)$/)))return[{role:'adc',inst:'ADC',ch:+m[1]}];
    if((m=sig.match(/^USB_(DM|DP)$/)))return[{role:m[1]==='DM'?'usb_dm':'usb_dp',inst:'USB'}];
    return[];
  }
  const out=/^ALT/.test(sel),inp=sel==='IN';
  if(out&&(m=sig.match(/^GTM_TOUT(\d+)$/)))return[{role:'pwm',inst:'GTM',ch:+m[1]}];
  if(inp&&(m=sig.match(/^GTM_TIM(\d)_IN(\d)_(\d+)$/)))return[{role:'cap',inst:'GTM_TIM'+m[1],tim:+m[1],ch:+m[2],insel:+m[3]}];
  if(out&&(m=sig.match(/^QSPI(\d)_(SCLK|MTSR|SLSO(\d+))$/)))return[{role:m[2]==='SCLK'?'spi_sck':m[2]==='MTSR'?'spi_mosi':'spi_cs',inst:'QSPI'+m[1],ch:m[3]!=null?+m[3]:undefined}];
  if(inp&&(m=sig.match(/^QSPI(\d)_MRST([A-Z])$/)))return[{role:'spi_miso',inst:'QSPI'+m[1],insel:m[2]}];
  if(out&&(m=sig.match(/^ASCLIN(\d+)_ATX$/)))return[{role:'uart_tx',inst:'ASCLIN'+m[1]}];
  if(inp&&(m=sig.match(/^ASCLIN(\d+)_ARX([A-Z])$/)))return[{role:'uart_rx',inst:'ASCLIN'+m[1],insel:m[2]}];
  if(out&&(m=sig.match(/^CAN(\d\d)_TXD$/)))return[{role:'can_tx',inst:'CAN'+m[1]}];
  if(inp&&(m=sig.match(/^CAN(\d\d)_RXD([A-Z])$/)))return[{role:'can_rx',inst:'CAN'+m[1],insel:m[2]}];
  if(out&&(m=sig.match(/^I2C(\d)_(SCL|SDA)$/)))return[{role:m[2]==='SCL'?'i2c_scl':'i2c_sda',inst:'I2C'+m[1]}];
  if((inp||sel==='ANALOG')&&(m=sig.match(/^EVADC_G(\d+)CH(\d+)$/)))return[{role:'adc',inst:'EVADC_G'+m[1],ch:+m[2]}];
  if(inp&&(m=sig.match(/^SCU_E_REQ(\d)_(\d)$/)))return[{role:'irq_in',inst:'ERU',ch:+m[1],insel:+m[2]}];
  return[];
}
// every way a pin can serve a role: [{role,inst,ch,insel,sel,sig}]
function options(db,n){
  const p=db.pins[n];if(!p||p.supply)return[];if(p._opts)return p._opts;
  const o=[];(p.f||[]).forEach(([sel,sig])=>classify(db.family,sel,sig).forEach(c=>o.push(Object.assign({sel,sig},c))));
  if(p.port&&!p.analogOnly){
    if(!p.inOnly)o.push({role:'gpio_out',inst:'DIO',sel:db.family==='aurix'?'GPIO':'OUTPUT',sig:'GPIO'});
    o.push({role:'gpio_in',inst:'DIO',sel:db.family==='aurix'?'IN':'INPUT',sig:'GPIO'});
    if(db.family==='stm32'){const ln=+(p.port.match(/\d+$/)||[0])[0];o.push({role:'irq_in',inst:'EXTI',ch:ln,sel:'INPUT',sig:'EXTI'+ln});}
  }
  // I2C on AURIX needs the matching input too; keep only output entries (input selection is derived in MCAL)
  p._opts=o;return o;
}

/* ---------- peer IC pins (what each pin expects from the MCU) ---------- */
const PEER={
  'DRV8313PWPR':{27:['IN1','pwm'],25:['IN2','pwm'],23:['IN3','pwm'],26:['EN1','gpio_out'],24:['EN2','gpio_out'],22:['EN3','gpio_out'],18:['nFAULT','irq_in','오픈 드레인 출력 · 외부 풀업 필요'],
    17:['nSLEEP','gpio_out','내부 풀다운 · High = 동작'],16:['nRESET','gpio_out','내부 풀다운 · High = 동작'],19:['nCOMPO','gpio_in','비교기 출력 (오픈 드레인)']},
  'W25Q32JVSSIQ':{1:['/CS','spi_cs'],6:['CLK','spi_sck'],5:['DI (IO0)','spi_mosi'],2:['DO (IO1)','spi_miso'],3:['/WP (IO2)','gpio_out'],7:['/HOLD (IO3)','gpio_out']},
  'TLE9251VSJ':{1:['TxD','can_tx','내부 풀업 · Low = 도미넌트'],4:['RxD','can_rx'],8:['STB','gpio_out','내부 풀업 · Low = 정상 동작']},
};
function peer(mpn){if(!mpn)return null;const k=String(mpn).trim().toUpperCase().replace(/\s*\(.*\)$/,'');return PEER[k]||null;}

return{DB,find,options,classify,ROLES,BUS,PEER,peer};
})();
if(typeof module!=='undefined')module.exports=MCU_PINS;
