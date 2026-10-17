/* MCAL configuration generator: turns the (recommended or existing) HSIS pin assignment into
   - AUTOSAR ECUC ARXML for Port, Dio, Pwm, Adc, Icu, Spi and Can,
   - MCAL-style C configuration files (Port register values per port, symbolic IDs, channel tables),
   - STM32 HAL and LL initialisation code (STM32 boards only).
   Register encodings: TC3xx Pn_IOCR.PCx (input 0x00/0x01/0x02, push-pull GPIO 0x10, ALTk 0x10+k, open-drain +0x08);
   STM32 GPIOx MODER/OTYPER/PUPDR/AFR. Needs MCU_PINS and PINREC. */
const MCAL=(function(){
"use strict";
const MP=typeof MCU_PINS!=='undefined'?MCU_PINS:require('../parts/mcu-pins.js');
const PR=typeof PINREC!=='undefined'?PINREC:require('./pinrec.js');
const up=s=>String(s||'').toUpperCase();
const cid=s=>String(s||'').replace(/[^A-Za-z0-9_]/g,'_').replace(/^(\d)/,'_$1');
const hex=(v,w)=>'0x'+(v>>>0).toString(16).toUpperCase().padStart(w||8,'0');
const OUT_ROLES=new Set(['pwm','spi_sck','spi_mosi','spi_cs','uart_tx','can_tx','gpio_out']);
const IO_ROLES=new Set(['i2c_scl','i2c_sda','usb_dm','usb_dp']);
function freqOf(s){const m=String(s||'').match(/(\d+(?:\.\d+)?)\s*([kKM])?\s*Hz/);return m?parseFloat(m[1])*(m[2]==='M'?1e6:m[2]?1e3:1):null;}
function rateOf(s){const m=String(s||'').match(/(\d+(?:\.\d+)?)\s*([kKM])?\s*bit\/s/);return m?parseFloat(m[1])*(m[2]==='M'?1e6:m[2]?1e3:1):null;}
function fdRateOf(s){const m=String(s||'').match(/데이터\s*(\d+(?:\.\d+)?)\s*([kKM])?\s*bit\/s/);return m?parseFloat(m[1])*(m[2]==='M'?1e6:m[2]?1e3:1):null;}
function portIdx(fam,port){if(!port)return null;let m;
  if(fam==='aurix'&&(m=port.match(/^P(\d\d)\.(\d+)$/)))return{port:+m[1],pin:+m[2],pname:'P'+m[1]};
  if(fam==='stm32'&&(m=port.match(/^P([A-F])(\d+)$/)))return{port:m[1].charCodeAt(0)-65,pin:+m[2],pname:'GPIO'+m[1],letter:m[1]};return null;}

/* ---------- model: one entry per configured pin ---------- */
function model(B,H,mcuRef){
  const mcu=B.byRef[mcuRef];const db=mcu&&(MP.find(mcu.mpn)||MP.find(mcu.val));
  if(!db)return{error:`${mcu?mcu.mpn||mcu.val:mcuRef}의 핀 기능 데이터가 없어 MCAL 설정을 만들 수 없습니다.`};
  const fam=db.family,pins=[],warn=[];const seen=new Set();
  H.items.forEach(it=>{
    if(/전원|접지|클럭|리셋|부트/.test(it.cat||it._cat||''))return;
    const ps=String(it.pins||'').split(/[,;\s]+/).filter(Boolean);if(ps.length!==1){if(!ps.length)warn.push(`${it.id} ${it.signal}: MCU 핀이 없어 제외했습니다 (핀 추천을 먼저 적용하세요).`);return;}
    const n=ps[0],p=db.pins[n];if(!p||p.supply){warn.push(`${it.id} ${it.signal}: ${n}번은 설정할 수 있는 포트 핀이 아닙니다.`);return;}
    if(seen.has(n)){warn.push(`${it.id} ${it.signal}: ${n}번 핀이 다른 신호와 겹칩니다.`);return;}seen.add(n);
    const role=PR.roleOf(it,null)||'gpio_out';
    const opts=MP.options(db,n).filter(o=>o.role===role);
    let o=opts.find(x=>up(it.func).includes(up(x.sig)))||opts.find(x=>it._sel&&x.sel===it._sel)||opts[0];
    if(!o){warn.push(`${it.id} ${it.signal}: ${n}번(${p.port||p.name})에는 ${MP.ROLES[role]||role} 기능이 없습니다. GPIO로 설정합니다.`);
      o=MP.options(db,n).find(x=>x.role===(OUT_ROLES.has(role)?'gpio_out':'gpio_in'))||{sel:'IN',sig:'GPIO',inst:'DIO',role:'gpio_in'};}
    const dir=IO_ROLES.has(role)?'IO':OUT_ROLES.has(role)?'OUT':'IN';
    const pl=String(it.pull||'');const pull=/내부\s*풀업|internal\s*pull.?up/i.test(pl)?'UP':/내부\s*풀다운|internal\s*pull.?down/i.test(pl)?'DOWN':'NONE';
    const od=/오픈\s*드레인|open.?drain/i.test(it.dir+' '+it.elec)&&dir!=='IN'||/^i2c/.test(role);
    let level=/high|하이|^1$/i.test(it.init)?'HIGH':/low|로우|^0$/i.test(it.init)?'LOW':null;
    if(!level&&dir!=='IN')level=/can_tx|uart_tx|spi_cs/.test(role)?'HIGH':'LOW';
    const pi=portIdx(fam,p.port);
    pins.push({it,id:it.id,sig:it.signal,name:cid(it.signal),n:+n,port:p.port||p.name,pi,role,o,dir,pull,od,level,analog:role==='adc',
      swmod:it.swmod||'',swcfg:it.swcfg||'',freq:freqOf(it.timing),rate:rateOf(it.timing),fd:fdRateOf(it.timing),active:it.active||'',hw:it.hw||'',timing:it.timing||''});
  });
  pins.sort((a,b)=>a.n-b.n);
  return{db,fam,mcu:mcuRef,mpn:db.mpn,pins,warn,board:B.name};
}

/* ---------- register values ---------- */
function aurixPC(x){ // TC3xx Pn_IOCR.PCx (5 bits)
  if(x.dir==='IN'||x.analog)return x.pull==='UP'?0x02:x.pull==='DOWN'?0x01:0x00;
  const alt=/^ALT(\d)$/.exec(x.o.sel);return(x.od?0x18:0x10)+(alt?+alt[1]:0);}
function stm32Regs(x){
  const mode=x.analog?3:/^AF/.test(x.o.sel)?2:x.dir==='IN'?0:1;
  return{mode,otype:x.od?1:0,pupd:x.pull==='UP'?1:x.pull==='DOWN'?2:0,af:/^AF(\d)$/.test(x.o.sel)?+x.o.sel.slice(2):0};}
function portRegs(M){
  const ports={};
  M.pins.forEach(x=>{if(!x.pi)return;const P=ports[x.pi.pname]=ports[x.pi.pname]||{name:x.pi.pname,idx:x.pi.port,pins:[]};P.pins.push(x);});
  Object.values(ports).forEach(P=>{
    if(M.fam==='aurix'){P.iocr=[0,0,0,0];P.omr=0;P.pdisc=0;P.pins.forEach(x=>{const pc=aurixPC(x);x.pc=pc;P.iocr[x.pi.pin>>2]|=(pc<<3)<<(8*(x.pi.pin&3));
        if(x.dir!=='IN'&&x.level)P.omr|=x.level==='HIGH'?(1<<x.pi.pin):(1<<(x.pi.pin+16));if(x.analog&&/^P40/.test(x.port))P.pdisc|=1<<x.pi.pin;});}
    else{P.moder=0;P.motypr=0;P.otyper=0;P.pupdr=0;P.afr=[0,0];P.odr=0;P.mask=0;P.pins.forEach(x=>{const r=stm32Regs(x);x.r=r;const i=x.pi.pin;P.mask|=1<<i;
        P.moder|=r.mode<<(2*i);P.otyper|=r.otype<<i;P.pupdr|=r.pupd<<(2*i);P.afr[i>>3]|=r.af<<(4*(i&7));if(x.level==='HIGH')P.odr|=1<<i;});}
  });
  return Object.values(ports).sort((a,b)=>a.idx-b.idx);
}

/* ---------- ARXML ---------- */
function xmlEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function arxml(M){
  const ind=n=>'  '.repeat(n);
  const P=(def,name,v,kind)=>({def,name,v,kind});
  const num=(def,name,v)=>P(def,name,v,'int'),flt=(def,name,v)=>P(def,name,v,'float'),bool=(def,name,v)=>P(def,name,v?'true':'false','bool'),en=(def,name,v)=>P(def,name,v,'enum'),ref=(def,name,v)=>P(def,name,v,'ref');
  const cont=(name,def,params,subs,d)=>{const pv=params.filter(x=>x.kind!=='ref'),rv=params.filter(x=>x.kind==='ref');
    return`${ind(d)}<ECUC-CONTAINER-VALUE>\n${ind(d+1)}<SHORT-NAME>${xmlEsc(name)}</SHORT-NAME>\n${ind(d+1)}<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${def}</DEFINITION-REF>\n`+
      (pv.length?`${ind(d+1)}<PARAMETER-VALUES>\n${pv.map(x=>x.kind==='enum'?`${ind(d+2)}<ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-ENUMERATION-PARAM-DEF">${def}/${x.name}</DEFINITION-REF><VALUE>${xmlEsc(x.v)}</VALUE></ECUC-TEXTUAL-PARAM-VALUE>`:
        `${ind(d+2)}<ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-${x.kind==='float'?'FLOAT':x.kind==='bool'?'BOOLEAN':'INTEGER'}-PARAM-DEF">${def}/${x.name}</DEFINITION-REF><VALUE>${x.v}</VALUE></ECUC-NUMERICAL-PARAM-VALUE>`).join('\n')}\n${ind(d+1)}</PARAMETER-VALUES>\n`:'')+
      (rv.length?`${ind(d+1)}<REFERENCE-VALUES>\n${rv.map(x=>`${ind(d+2)}<ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">${def}/${x.name}</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">${x.v}</VALUE-REF></ECUC-REFERENCE-VALUE>`).join('\n')}\n${ind(d+1)}</REFERENCE-VALUES>\n`:'')+
      (subs&&subs.length?`${ind(d+1)}<SUB-CONTAINERS>\n${subs.join('\n')}\n${ind(d+1)}</SUB-CONTAINERS>\n`:'')+`${ind(d)}</ECUC-CONTAINER-VALUE>`;};
  const mod=(name,conts)=>`    <ECUC-MODULE-CONFIGURATION-VALUES>\n      <SHORT-NAME>${name}</SHORT-NAME>\n      <DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/EcucDefs/${name}</DEFINITION-REF>\n      <IMPLEMENTATION-CONFIG-VARIANT>VARIANT-POST-BUILD</IMPLEMENTATION-CONFIG-VARIANT>\n      <CONTAINERS>\n${conts.join('\n')}\n      </CONTAINERS>\n    </ECUC-MODULE-CONFIGURATION-VALUES>`;
  const D='/AUTOSAR/EcucDefs';const pkg='/EcucConfig';const mods=[];
  const modeName=x=>M.fam==='aurix'?(/^ALT\d$/.test(x.o.sel)?'PORT_PIN_MODE_'+x.o.sel:x.analog?'PORT_PIN_MODE_ADC':'PORT_PIN_MODE_GPIO'):(/^AF\d$/.test(x.o.sel)?'PORT_PIN_MODE_'+x.o.sel:x.analog?'PORT_PIN_MODE_ADC':'PORT_PIN_MODE_DIO');
  // Port
  const ports=portRegs(M);
  const pd=D+'/Port/PortConfigSet/PortContainer';
  mods.push(mod('Port',[cont('PortConfigSet',D+'/Port/PortConfigSet',[],ports.map(Pt=>cont('PortContainer_'+Pt.name,pd,[num(pd,'PortNumberOfPortPins',Pt.pins.length)],
    Pt.pins.map(x=>{const pp=pd+'/PortPin';const ps=[num(pp,'PortPinId',x.n),en(pp,'PortPinDirection',x.dir==='OUT'?'PORT_PIN_OUT':'PORT_PIN_IN'),bool(pp,'PortPinDirectionChangeable',x.dir==='IO'),
      en(pp,'PortPinInitialMode',modeName(x)),en(pp,'PortPinMode',modeName(x)),bool(pp,'PortPinModeChangeable',false)];
      if(x.dir!=='IN'&&x.level)ps.push(en(pp,'PortPinLevelValue','PORT_PIN_LEVEL_'+x.level));
      return cont('PortPin_'+x.name,pp,ps,null,8);}),6)),4)]));
  // Dio
  const dioPins=M.pins.filter(x=>x.o.inst==='DIO'||/^(Dio)$/i.test(x.swmod));
  if(dioPins.length){const dp=D+'/Dio/DioConfig/DioPort';const byP={};dioPins.forEach(x=>{if(x.pi)(byP[x.pi.pname]=byP[x.pi.pname]||{idx:x.pi.port,ch:[]}).ch.push(x);});
    mods.push(mod('Dio',[cont('DioConfig',D+'/Dio/DioConfig',[],Object.entries(byP).map(([pn,v])=>cont('DioPort_'+pn,dp,[num(dp,'DioPortId',v.idx)],
      v.ch.map(x=>cont('DioChannel_'+x.name,dp+'/DioChannel',[num(dp+'/DioChannel','DioChannelId',x.pi.pin)],null,8)),6)),4)]));}
  // Pwm
  const pwm=M.pins.filter(x=>x.role==='pwm');
  if(pwm.length){const cp=D+'/Pwm/PwmChannelConfigSet/PwmChannel';const clk=M.fam==='aurix'?100e6:48e6;
    mods.push(mod('Pwm',[cont('PwmChannelConfigSet',D+'/Pwm/PwmChannelConfigSet',[],pwm.map((x,i)=>cont('PwmChannel_'+x.name,cp,[num(cp,'PwmChannelId',i),en(cp,'PwmChannelClass','PWM_FIXED_PERIOD'),
      num(cp,'PwmPeriodDefault',Math.round(clk/(x.freq||20000))),num(cp,'PwmDutycycleDefault',0),en(cp,'PwmPolarity','PWM_HIGH'),en(cp,'PwmIdleState','PWM_LOW')],null,6)),4)]));}
  // Adc
  const adc=M.pins.filter(x=>x.role==='adc');
  if(adc.length){const hw={};adc.forEach(x=>{const u=x.o.inst||'ADC';(hw[u]=hw[u]||[]).push(x);});
    const hp=D+'/Adc/AdcConfigSet/AdcHwUnit';let gid=0;
    mods.push(mod('Adc',[cont('AdcConfigSet',D+'/Adc/AdcConfigSet',[],Object.entries(hw).map(([u,xs],ui)=>cont('AdcHwUnit_'+u,hp,[en(hp,'AdcHwUnitId',M.fam==='aurix'?u.replace('EVADC_G','ADC_HWUNIT_G'):'ADC_HWUNIT_0')],
      xs.map(x=>cont('AdcChannel_'+x.name,hp+'/AdcChannel',[num(hp+'/AdcChannel','AdcChannelId',x.o.ch!=null?x.o.ch:0),en(hp+'/AdcChannel','AdcChannelRefVoltsrcHigh','ADC_REFERENCE_VOLTAGE_VAREF'),num(hp+'/AdcChannel','AdcChannelResolution',12)],null,8))
      .concat(xs.map(x=>cont(x.swcfg||'AdcGroup_'+x.name,hp+'/AdcGroup',[num(hp+'/AdcGroup','AdcGroupId',gid++),en(hp+'/AdcGroup','AdcGroupConversionMode','ADC_CONV_MODE_ONESHOT'),en(hp+'/AdcGroup','AdcGroupTriggSrc','ADC_TRIGG_SRC_SW'),
        en(hp+'/AdcGroup','AdcGroupAccessMode','ADC_ACCESS_MODE_SINGLE'),ref(hp+'/AdcGroup','AdcGroupDefinition',`${pkg}/Adc/AdcConfigSet/AdcHwUnit_${u}/AdcChannel_${x.name}`)],null,8))),6)),4)]));}
  // Icu
  const icu=M.pins.filter(x=>x.role==='cap'||x.role==='irq_in');
  if(icu.length){const ip=D+'/Icu/IcuConfigSet/IcuChannel';
    mods.push(mod('Icu',[cont('IcuConfigSet',D+'/Icu/IcuConfigSet',[],icu.map((x,i)=>cont('IcuChannel_'+x.name,ip,[num(ip,'IcuChannelId',i),
      en(ip,'IcuDefaultStartEdge',x.role==='irq_in'?(/low/i.test(x.active)?'ICU_FALLING_EDGE':'ICU_RISING_EDGE'):'ICU_BOTH_EDGES'),
      en(ip,'IcuMeasurementMode',x.role==='irq_in'?'ICU_MODE_SIGNAL_EDGE_DETECT':'ICU_MODE_TIMESTAMP'),bool(ip,'IcuWakeupCapability',false)],null,6)),4)]));}
  // Spi
  const spi=M.pins.filter(x=>/^spi_/.test(x.role));
  if(spi.length){const groups={};spi.forEach(x=>{const k=x.swcfg||'SpiExternalDevice_0';(groups[k]=groups[k]||[]).push(x);});
    const sd=D+'/Spi/SpiDriver';const subs=[];let ji=0;
    Object.entries(groups).forEach(([dev,xs])=>{const sck=xs.find(x=>x.role==='spi_sck')||xs[0],cs=xs.find(x=>x.role==='spi_cs');const hwu=(xs.find(x=>x.o.inst&&x.o.inst!=='DIO')||{o:{inst:'SPI'}}).o.inst;const dn=cid(dev);
      subs.push(cont(dn,sd+'/SpiExternalDevice',[flt(sd+'/SpiExternalDevice','SpiBaudrate',freqOf(sck.timing)||1e6),en(sd+'/SpiExternalDevice','SpiCsSelection',cs&&cs.o.inst!=='DIO'?'CS_VIA_PERIPHERAL_ENGINE':'CS_VIA_GPIO'),
        en(sd+'/SpiExternalDevice','SpiCsPolarity','LOW'),en(sd+'/SpiExternalDevice','SpiDataShiftEdge','LEADING'),en(sd+'/SpiExternalDevice','SpiShiftClockIdleLevel','LOW'),en(sd+'/SpiExternalDevice','SpiHwUnit','CSIB'+(+(hwu.match(/\d+$/)||[0])[0]))],null,8));
      subs.push(cont('SpiChannel_'+dn,sd+'/SpiChannel',[num(sd+'/SpiChannel','SpiChannelId',ji),en(sd+'/SpiChannel','SpiChannelType','EB'),num(sd+'/SpiChannel','SpiDataWidth',8),num(sd+'/SpiChannel','SpiEbMaxLength',256),en(sd+'/SpiChannel','SpiTransferStart','MSB')],null,8));
      subs.push(cont('SpiJob_'+dn,sd+'/SpiJob',[num(sd+'/SpiJob','SpiJobId',ji),num(sd+'/SpiJob','SpiJobPriority',0),ref(sd+'/SpiJob','SpiDeviceAssignment',`${pkg}/Spi/SpiDriver/${dn}`)],null,8));
      subs.push(cont('SpiSequence_'+dn,sd+'/SpiSequence',[num(sd+'/SpiSequence','SpiSequenceId',ji),bool(sd+'/SpiSequence','SpiInterruptibleSequence',false),ref(sd+'/SpiSequence','SpiJobAssignment',`${pkg}/Spi/SpiDriver/SpiJob_${dn}`)],null,8));ji++;});
    mods.push(mod('Spi',[cont('SpiDriver',sd,[num(sd,'SpiMaxChannel',ji),num(sd,'SpiMaxJob',ji),num(sd,'SpiMaxSequence',ji)],subs,4)]));}
  // Can
  const can=M.pins.filter(x=>x.role==='can_tx');
  if(can.length){const cc=D+'/Can/CanConfigSet/CanController';
    mods.push(mod('Can',[cont('CanConfigSet',D+'/Can/CanConfigSet',[],can.map((x,i)=>cont(x.swcfg||'CanController_'+i,cc,[num(cc,'CanControllerId',i),bool(cc,'CanControllerActivation',true)],
      [cont('CanControllerBaudrateConfig',cc+'/CanControllerBaudrateConfig',[flt(cc+'/CanControllerBaudrateConfig','CanControllerBaudRate',(x.rate||500e3)/1000),num(cc+'/CanControllerBaudrateConfig','CanControllerBaudRateConfigID',0),
        num(cc+'/CanControllerBaudrateConfig','CanControllerPropSeg',0),num(cc+'/CanControllerBaudrateConfig','CanControllerSeg1',13),num(cc+'/CanControllerBaudrateConfig','CanControllerSeg2',2),num(cc+'/CanControllerBaudrateConfig','CanControllerSyncJumpWidth',2)],
        x.fd?[cont('CanControllerFdBaudrateConfig',cc+'/CanControllerBaudrateConfig/CanControllerFdBaudrateConfig',[flt(cc+'/CanControllerBaudrateConfig/CanControllerFdBaudrateConfig','CanControllerFdBaudRate',x.fd/1000),bool(cc+'/CanControllerBaudrateConfig/CanControllerFdBaudrateConfig','CanControllerTxBitRateSwitch',true)],null,10)]:null,8)],6)),4)]));}
  const notes=M.pins.map(x=>`  ${String(x.n).padStart(3)}  ${x.port.padEnd(7)} ${x.sig.padEnd(12)} ${x.o.sig}${x.o.insel!=null?' (입력 선택 '+x.o.insel+')':''}${M.fam==='aurix'?' · PC='+hex(aurixPC(x),2):''}`).join('\n');
  return`<?xml version="1.0" encoding="UTF-8"?>
<!-- ${xmlEsc(M.board)} · ${M.mpn} · 생성: AllinOneDesign HSIS 핀 추천
     PortPinId는 MCU 패키지 핀 번호입니다. PortPinMode는 ${M.fam==='aurix'?'Infineon 방식(ALT1–ALT7 / GPIO)':'AF 번호 방식(AF0–AF7 / DIO)'}으로 적었습니다.
     벤더 MCAL 도구(EB tresos 등)로 가져올 때는 해당 벤더 BSWMD의 파라미터 정의에 맞춰 확인하세요.
${xmlEsc(notes)}
-->
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-3-0.xsd">
  <AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucConfig</SHORT-NAME><ELEMENTS>
${mods.join('\n')}
  </ELEMENTS></AR-PACKAGE></AR-PACKAGES>
</AUTOSAR>
`;
}

/* ---------- MCAL-style C configuration ---------- */
function cfiles(M){
  const ports=portRegs(M),files=[],hdr=(f,desc)=>`/* ${f} — ${desc}\n * ${M.board} · ${M.mpn} · 생성: AllinOneDesign HSIS 핀 추천\n * 구조와 이름은 AUTOSAR MCAL 관례를 따른 예시이며, 벤더 MCAL의 구조체 정의와 1:1로 같지는 않습니다. */\n`;
  const guard=f=>f.replace('.','_').toUpperCase();
  const pp=M.pins.filter(x=>x.pi);
  const pinTbl=pp.map(x=>`  /* ${String(x.n).padStart(3)} ${x.port.padEnd(7)} */ { PortConf_PortPin_${x.name}, ${M.fam==='aurix'?`${x.pi?x.pi.port:0}u, ${x.pi?x.pi.pin:0}u, ${hex(x.pc!=null?x.pc:aurixPC(x),2)}u /* ${x.o.sel} ${x.o.sig} */`:`${x.pi?'GPIO_PORT_'+x.pi.letter:'0'}, ${x.pi?x.pi.pin:0}u, ${x.r?x.r.mode:0}u, ${x.r?x.r.af:0}u /* ${x.o.sel} ${x.o.sig} */`}, PORT_PIN_${x.dir==='OUT'?'OUT':'IN'}, PORT_PIN_LEVEL_${x.level||'LOW'} }`).join(',\n');
  files.push({name:'Port_Cfg.h',text:hdr('Port_Cfg.h','Port 핀 기호와 개수')+`#ifndef PORT_CFG_H\n#define PORT_CFG_H\n\n#define PORT_NUMBER_OF_PORT_PINS   ${pp.length}u\n\n`+pp.map(x=>`#define PortConf_PortPin_${x.name.padEnd(16)} ((Port_PinType)${String(x.n).padStart(3)}u)  /* ${x.port} · ${x.o.sig} */`).join('\n')+(M.pins.length>pp.length?`\n\n/* 포트가 아닌 전용 아날로그 핀(Port 설정 대상 아님): ${M.pins.filter(x=>!x.pi).map(x=>x.n+' '+x.port+' '+x.sig).join(', ')} */`:'')+`\n\n#endif /* PORT_CFG_H */\n`});
  let pb=hdr('Port_PBcfg.c','포트 레지스터 초기값과 핀 설정 표')+`#include "Port.h"\n\n`;
  if(M.fam==='aurix'){
    pb+=`/* Pn_IOCRx.PCx: 0x00 입력(풀 없음) · 0x01 입력 풀다운 · 0x02 입력 풀업 · 0x10 출력 푸시풀 GPIO · 0x11–0x17 ALT1–7 · 0x18–0x1F 오픈 드레인\n   레지스터 값은 PCx를 각 바이트의 비트 7:3에 넣은 값입니다. OMR 상위 16비트는 Low 출력 초기화입니다. */\n`;
    pb+=`const Port_PortRegInitType Port_PortInit[] = {\n`+ports.map(P=>`  { /* ${P.name} */ ${P.idx}u, { ${P.iocr.map(v=>hex(v)).join(', ')} }, /* OMR */ ${hex(P.omr)}, /* PDISC */ ${hex(P.pdisc)} }`).join(',\n')+`\n};\n\n`;
  }else{
    pb+=`/* GPIOx: MODER 00 입력 · 01 출력 · 10 AF · 11 아날로그, PUPDR 01 풀업 · 10 풀다운. 아래 값은 설정하는 핀(MASK)에만 적용합니다. */\n`;
    pb+=`const Port_PortRegInitType Port_PortInit[] = {\n`+ports.map(P=>`  { /* ${P.name} */ ${P.name}, /* MASK */ ${hex(P.mask,4)}, /* MODER */ ${hex(P.moder)}, /* OTYPER */ ${hex(P.otyper,4)}, /* PUPDR */ ${hex(P.pupdr)}, /* AFRL */ ${hex(P.afr[0])}, /* AFRH */ ${hex(P.afr[1])}, /* ODR */ ${hex(P.odr,4)} }`).join(',\n')+`\n};\n\n`;
  }
  pb+=`const Port_PinConfigType Port_PinConfig[PORT_NUMBER_OF_PORT_PINS] = {\n${pinTbl}\n};\n\nconst Port_ConfigType Port_Config = { Port_PortInit, ${ports.length}u, Port_PinConfig, PORT_NUMBER_OF_PORT_PINS };\n`;
  files.push({name:'Port_PBcfg.c',text:pb});
  const dio=M.pins.filter(x=>x.o.inst==='DIO'||/^Dio$/i.test(x.swmod));
  if(dio.length)files.push({name:'Dio_Cfg.h',text:hdr('Dio_Cfg.h','Dio 채널 기호 (채널 ID = 포트 × 16 + 핀)')+`#ifndef DIO_CFG_H\n#define DIO_CFG_H\n\n`+dio.map(x=>`#define DioConf_DioChannel_${x.name.padEnd(14)} ((Dio_ChannelType)${String(x.pi?x.pi.port*16+x.pi.pin:x.n).padStart(3)}u)  /* ${x.port} ${x.dir==='OUT'?'출력':'입력'} */`).join('\n')+`\n\n#endif /* DIO_CFG_H */\n`});
  const pwm=M.pins.filter(x=>x.role==='pwm');
  if(pwm.length){const clk=M.fam==='aurix'?100e6:48e6,cn=M.fam==='aurix'?'GTM CMU_FXCLK0 100 MHz':'TIMx 48 MHz (PSC = 0)';
    files.push({name:'Pwm_Cfg.h',text:hdr('Pwm_Cfg.h','PWM 채널 기호')+`#ifndef PWM_CFG_H\n#define PWM_CFG_H\n\n#define PWM_NUMBER_OF_CHANNELS  ${pwm.length}u\n`+pwm.map((x,i)=>`#define PwmConf_PwmChannel_${x.name.padEnd(10)} ((Pwm_ChannelType)${i}u)  /* ${x.port} ${x.o.sig} */`).join('\n')+`\n\n#endif /* PWM_CFG_H */\n`});
    files.push({name:'Pwm_PBcfg.c',text:hdr('Pwm_PBcfg.c',`PWM 채널 설정 — 주기 틱은 ${cn} 기준`)+`#include "Pwm.h"\n\nconst Pwm_ChannelConfigType Pwm_ChannelConfig[PWM_NUMBER_OF_CHANNELS] = {\n`+
      pwm.map(x=>{const f=x.freq||20000;return`  { PwmConf_PwmChannel_${x.name}, /* HW */ ${M.fam==='aurix'?`GTM_TOUT${x.o.ch}`:`${x.o.inst}_CH${x.o.ch}`}, PWM_FIXED_PERIOD, /* period */ ${Math.round(clk/f)}u /* ${f/1000} kHz */, /* duty */ 0x0000u, PWM_HIGH, PWM_LOW }`;}).join(',\n')+
      `\n};\n${M.fam==='aurix'?'/* GTM_TOUTn는 TOUTSEL로 TOM/ATOM 채널에 연결합니다. 세 상을 같은 TOM 모듈·연속 채널에 두면 동기 갱신이 쉬워집니다. */\n':''}`});}
  const adc=M.pins.filter(x=>x.role==='adc');
  if(adc.length)files.push({name:'Adc_Cfg.h',text:hdr('Adc_Cfg.h','ADC 그룹·채널 기호')+`#ifndef ADC_CFG_H\n#define ADC_CFG_H\n\n`+adc.map((x,i)=>`#define AdcConf_AdcGroup_${cid(x.swcfg||x.name).padEnd(18)} ((Adc_GroupType)${i}u)  /* ${x.port} → ${x.o.sig} */`).join('\n')+`\n\n#endif /* ADC_CFG_H */\n`});
  const icu=M.pins.filter(x=>x.role==='cap'||x.role==='irq_in');
  if(icu.length)files.push({name:'Icu_Cfg.h',text:hdr('Icu_Cfg.h','ICU 채널 기호')+`#ifndef ICU_CFG_H\n#define ICU_CFG_H\n\n`+icu.map((x,i)=>`#define IcuConf_IcuChannel_${x.name.padEnd(12)} ((Icu_ChannelType)${i}u)  /* ${x.port} ${x.o.sig}${x.o.insel!=null?' 입력 선택 '+x.o.insel:''} · ${x.role==='irq_in'?'에지 검출':'타임스탬프'} */`).join('\n')+`\n\n#endif /* ICU_CFG_H */\n`});
  const spi=M.pins.filter(x=>/^spi_/.test(x.role));
  if(spi.length){const hw=(spi.find(x=>x.o.inst&&x.o.inst!=='DIO')||{o:{inst:'?'}}).o.inst;const cs=spi.find(x=>x.role==='spi_cs');
    files.push({name:'Spi_Cfg.h',text:hdr('Spi_Cfg.h','SPI 채널·잡·시퀀스 기호')+`#ifndef SPI_CFG_H\n#define SPI_CFG_H\n\n/* 하드웨어: ${hw} · ${spi.map(x=>`${x.role.replace('spi_','').toUpperCase()} ${x.port} (${x.o.sig}${x.o.insel!=null?' 입력 '+x.o.insel:''})`).join(', ')}\n   칩 선택: ${cs?(cs.o.inst==='DIO'?'GPIO '+cs.port:cs.o.sig):'없음'} */\n#define SpiConf_SpiChannel_Flash   ((Spi_ChannelType)0u)\n#define SpiConf_SpiJob_Flash       ((Spi_JobType)0u)\n#define SpiConf_SpiSequence_Flash  ((Spi_SequenceType)0u)\n#define SPI_FLASH_BAUDRATE         ${Math.round(freqOf((spi.find(x=>x.role==='spi_sck')||spi[0]).timing)||1e6)}u\n\n#endif /* SPI_CFG_H */\n`});}
  const can=M.pins.filter(x=>x.role==='can_tx'||x.role==='can_rx');
  if(can.length){const tx=can.find(x=>x.role==='can_tx'),rx=can.find(x=>x.role==='can_rx');
    files.push({name:'Can_Cfg.h',text:hdr('Can_Cfg.h','CAN 컨트롤러 기호')+`#ifndef CAN_CFG_H\n#define CAN_CFG_H\n\n/* 노드: ${(tx||rx).o.inst} · TX ${tx?tx.port+' '+tx.o.sig:'-'} · RX ${rx?rx.port+' '+rx.o.sig:'-'}${M.fam==='aurix'&&rx&&rx.o.insel?`\n   RXSEL = ${rx.o.insel} (NPCR.RXSEL에서 ${rx.o.sig} 선택)`:''} */\n#define CanConf_CanController_0   ((uint8)0u)\n#define CAN_CONTROLLER0_BAUDRATE  ${Math.round((tx||rx).rate||500e3)}u\n${(tx||rx).fd?`#define CAN_CONTROLLER0_FD_BAUDRATE ${Math.round((tx||rx).fd)}u\n`:''}\n#endif /* CAN_CFG_H */\n`});}
  return files;
}

/* ---------- STM32 HAL / LL ---------- */
function hal(M){
  if(M.fam!=='stm32')return[];
  const G=x=>`GPIO_PIN_${x.pi.pin}`,P=x=>'GPIO'+x.pi.letter;
  const afName=x=>`GPIO_AF${x.r.af}_${x.o.inst}`;
  portRegs(M);
  const out=[],clk=new Set(M.pins.filter(x=>x.pi).map(x=>x.pi.letter));
  let s=`/* mcal_hal_init.c — ${M.board} · ${M.mpn}\n * STM32CubeF0 HAL 초기화 (HSIS 핀 배정에서 생성). SystemClock 48 MHz 가정. */\n#include "stm32f0xx_hal.h"\n\n`;
  const tims={};M.pins.filter(x=>x.role==='pwm'||x.role==='cap').forEach(x=>{(tims[x.o.inst]=tims[x.o.inst]||[]).push(x);});
  const has=r=>M.pins.some(x=>x.role===r);const spiI=(M.pins.find(x=>/^spi_/.test(x.role)&&x.o.inst!=='DIO')||{}).o;const uart=(M.pins.find(x=>/^uart_/.test(x.role))||{}).o;const i2c=(M.pins.find(x=>/^i2c_/.test(x.role))||{}).o;
  Object.keys(tims).forEach(t=>{s+=`TIM_HandleTypeDef h${t.toLowerCase()};\n`;});if(has('adc'))s+=`ADC_HandleTypeDef hadc;\n`;if(spiI)s+=`SPI_HandleTypeDef h${spiI.inst.toLowerCase()};\n`;
  if(uart)s+=`UART_HandleTypeDef h${uart.inst.toLowerCase()};\n`;if(i2c)s+=`I2C_HandleTypeDef h${i2c.inst.toLowerCase()};\n`;if(has('can_tx'))s+=`CAN_HandleTypeDef hcan;\n`;
  s+=`\nvoid MX_GPIO_Init(void)\n{\n  GPIO_InitTypeDef g = {0};\n${[...clk].sort().map(l=>`  __HAL_RCC_GPIO${l}_CLK_ENABLE();`).join('\n')}\n\n`;
  M.pins.filter(x=>x.pi&&x.dir==='OUT'&&x.o.inst==='DIO').forEach(x=>{s+=`  HAL_GPIO_WritePin(${P(x)}, ${G(x)}, GPIO_PIN_${x.level==='HIGH'?'SET':'RESET'});  /* ${x.sig} 초기값 */\n`;});
  M.pins.filter(x=>x.pi).forEach(x=>{const mode=x.analog?'GPIO_MODE_ANALOG':/^AF/.test(x.o.sel)?(x.od?'GPIO_MODE_AF_OD':'GPIO_MODE_AF_PP'):x.role==='irq_in'?(/low/i.test(x.active)?'GPIO_MODE_IT_FALLING':'GPIO_MODE_IT_RISING'):x.dir==='IN'?'GPIO_MODE_INPUT':(x.od?'GPIO_MODE_OUTPUT_OD':'GPIO_MODE_OUTPUT_PP');
    s+=`\n  /* ${x.sig} — ${x.port} (${x.n}번 핀) ${x.o.sig} */\n  g.Pin = ${G(x)};\n  g.Mode = ${mode};\n  g.Pull = GPIO_${x.pull==='UP'?'PULLUP':x.pull==='DOWN'?'PULLDOWN':'NOPULL'};\n  g.Speed = GPIO_SPEED_FREQ_${/spi|pwm/.test(x.role)?'HIGH':'LOW'};\n${/^AF/.test(x.o.sel)?`  g.Alternate = ${afName(x)};\n`:''}  HAL_GPIO_Init(${P(x)}, &g);\n`;});
  const irq=M.pins.filter(x=>x.role==='irq_in');
  if(irq.length){const lines=[...new Set(irq.map(x=>x.pi.pin<=1?'EXTI0_1_IRQn':x.pi.pin<=3?'EXTI2_3_IRQn':'EXTI4_15_IRQn'))];s+=`\n${lines.map(l=>`  HAL_NVIC_SetPriority(${l}, 1, 0);\n  HAL_NVIC_EnableIRQ(${l});`).join('\n')}\n`;}
  s+=`}\n`;
  Object.entries(tims).forEach(([t,xs])=>{const pw=xs.filter(x=>x.role==='pwm'),ic=xs.filter(x=>x.role==='cap');const f=(pw[0]||{}).freq||20000;const h='h'+t.toLowerCase();
    s+=`\nvoid MX_${t}_Init(void)\n{\n  __HAL_RCC_${t}_CLK_ENABLE();\n  ${h}.Instance = ${t};\n  ${h}.Init.Prescaler = 0;\n  ${h}.Init.CounterMode = TIM_COUNTERMODE_UP;\n  ${h}.Init.Period = ${Math.round(48e6/f)-1};  /* ${f/1000} kHz */\n  ${h}.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;\n  ${h}.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;\n`;
    if(pw.length){s+=`  HAL_TIM_PWM_Init(&${h});\n  TIM_OC_InitTypeDef oc = {0};\n  oc.OCMode = TIM_OCMODE_PWM1;\n  oc.Pulse = 0;\n  oc.OCPolarity = TIM_OCPOLARITY_HIGH;\n  oc.OCIdleState = TIM_OCIDLESTATE_RESET;\n`+pw.map(x=>`  HAL_TIM_PWM_ConfigChannel(&${h}, &oc, TIM_CHANNEL_${x.o.ch});  /* ${x.sig} ${x.port} */`).join('\n')+'\n';
      if(t==='TIM1')s+=`  /* TIM1은 고급 타이머: 출력하려면 MOE를 켜야 합니다 */\n  __HAL_TIM_MOE_ENABLE(&${h});\n`;}
    if(ic.length)s+=`  HAL_TIM_IC_Init(&${h});\n  TIM_IC_InitTypeDef ic = {0};\n  ic.ICPolarity = TIM_INPUTCHANNELPOLARITY_BOTHEDGE;\n  ic.ICSelection = TIM_ICSELECTION_DIRECTTI;\n  ic.ICPrescaler = TIM_ICPSC_DIV1;\n  ic.ICFilter = 4;\n`+ic.map(x=>`  HAL_TIM_IC_ConfigChannel(&${h}, &ic, TIM_CHANNEL_${x.o.ch});  /* ${x.sig} ${x.port} */`).join('\n')+'\n';
    s+=`}\n`;});
  if(has('adc')){const a=M.pins.filter(x=>x.role==='adc');s+=`\nvoid MX_ADC_Init(void)\n{\n  __HAL_RCC_ADC1_CLK_ENABLE();\n  hadc.Instance = ADC1;\n  hadc.Init.ClockPrescaler = ADC_CLOCK_ASYNC_DIV1;\n  hadc.Init.Resolution = ADC_RESOLUTION_12B;\n  hadc.Init.DataAlign = ADC_DATAALIGN_RIGHT;\n  hadc.Init.ScanConvMode = ADC_SCAN_DIRECTION_FORWARD;\n  hadc.Init.EOCSelection = ADC_EOC_SINGLE_CONV;\n  hadc.Init.ContinuousConvMode = DISABLE;\n  hadc.Init.ExternalTrigConv = ADC_SOFTWARE_START;\n  HAL_ADC_Init(&hadc);\n  ADC_ChannelConfTypeDef ch = {0};\n  ch.Rank = ADC_RANK_CHANNEL_NUMBER;\n  ch.SamplingTime = ADC_SAMPLETIME_71CYCLES_5;\n`+a.map(x=>`  ch.Channel = ADC_CHANNEL_${x.o.ch};  /* ${x.sig} ${x.port} */\n  HAL_ADC_ConfigChannel(&hadc, &ch);`).join('\n')+`\n  HAL_ADCEx_Calibration_Start(&hadc);\n}\n`;}
  if(spiI){const h='h'+spiI.inst.toLowerCase();const sck=M.pins.find(x=>x.role==='spi_sck');const f=freqOf(sck&&sck.timing)||1e6;const div=[2,4,8,16,32,64,128,256].find(d=>48e6/d<=f)||256;
    s+=`\nvoid MX_${spiI.inst}_Init(void)\n{\n  __HAL_RCC_${spiI.inst}_CLK_ENABLE();\n  ${h}.Instance = ${spiI.inst};\n  ${h}.Init.Mode = SPI_MODE_MASTER;\n  ${h}.Init.Direction = SPI_DIRECTION_2LINES;\n  ${h}.Init.DataSize = SPI_DATASIZE_8BIT;\n  ${h}.Init.CLKPolarity = SPI_POLARITY_LOW;\n  ${h}.Init.CLKPhase = SPI_PHASE_1EDGE;\n  ${h}.Init.NSS = ${M.pins.some(x=>x.role==='spi_cs'&&x.o.inst===spiI.inst)?'SPI_NSS_HARD_OUTPUT':'SPI_NSS_SOFT'};\n  ${h}.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_${div};  /* ${(48/div).toFixed(2)} MHz ≤ ${f/1e6} MHz */\n  ${h}.Init.FirstBit = SPI_FIRSTBIT_MSB;\n  HAL_SPI_Init(&${h});\n}\n`;}
  if(uart){const h='h'+uart.inst.toLowerCase();const x=M.pins.find(y=>/^uart_/.test(y.role));s+=`\nvoid MX_${uart.inst}_UART_Init(void)\n{\n  __HAL_RCC_${uart.inst}_CLK_ENABLE();\n  ${h}.Instance = ${uart.inst};\n  ${h}.Init.BaudRate = ${Math.round(x.rate||115200)};\n  ${h}.Init.WordLength = UART_WORDLENGTH_8B;\n  ${h}.Init.StopBits = UART_STOPBITS_1;\n  ${h}.Init.Parity = UART_PARITY_NONE;\n  ${h}.Init.Mode = UART_MODE_TX_RX;\n  HAL_UART_Init(&${h});\n}\n`;}
  if(i2c){const h='h'+i2c.inst.toLowerCase();const x=M.pins.find(y=>/^i2c_/.test(y.role));const f=freqOf(x.timing)||100e3;
    s+=`\nvoid MX_${i2c.inst}_Init(void)\n{\n  __HAL_RCC_${i2c.inst}_CLK_ENABLE();\n  ${h}.Instance = ${i2c.inst};\n  ${h}.Init.Timing = ${f>=400e3?'0x0000020B':'0x20303E5D'};  /* ${f/1000} kHz @ 48 MHz (CubeMX 계산값으로 확인) */\n  ${h}.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;\n  HAL_I2C_Init(&${h});\n}\n`;}
  if(has('can_tx')){const x=M.pins.find(y=>y.role==='can_tx');const r=x.rate||500e3;s+=`\nvoid MX_CAN_Init(void)\n{\n  __HAL_RCC_CAN1_CLK_ENABLE();\n  hcan.Instance = CAN;\n  hcan.Init.Prescaler = ${Math.round(48e6/(r*16))};  /* ${r/1000} kbit/s, 16 tq */\n  hcan.Init.Mode = CAN_MODE_NORMAL;\n  hcan.Init.SyncJumpWidth = CAN_SJW_1TQ;\n  hcan.Init.TimeSeg1 = CAN_BS1_13TQ;\n  hcan.Init.TimeSeg2 = CAN_BS2_2TQ;\n  HAL_CAN_Init(&hcan);\n}\n`;}
  out.push({name:'mcal_hal_init.c',text:s});
  // LL: GPIO only (register-level, with AF numbers)
  let l=`/* mcal_ll_gpio.c — ${M.board} · ${M.mpn}\n * STM32 LL GPIO 초기화 (HSIS 핀 배정에서 생성). 주변장치 LL 설정은 HAL 파일의 값을 참고하세요. */\n#include "stm32f0xx_ll_bus.h"\n#include "stm32f0xx_ll_gpio.h"\n\nvoid MCAL_LL_GPIO_Init(void)\n{\n  LL_GPIO_InitTypeDef g;\n${[...clk].sort().map(c=>`  LL_AHB1_GRP1_EnableClock(LL_AHB1_GRP1_PERIPH_GPIO${c});`).join('\n')}\n`;
  M.pins.filter(x=>x.pi).forEach(x=>{const mode=x.analog?'LL_GPIO_MODE_ANALOG':/^AF/.test(x.o.sel)?'LL_GPIO_MODE_ALTERNATE':x.dir==='IN'?'LL_GPIO_MODE_INPUT':'LL_GPIO_MODE_OUTPUT';
    if(x.dir==='OUT'&&x.o.inst==='DIO')l+=`\n  LL_GPIO_${x.level==='HIGH'?'SetOutputPin':'ResetOutputPin'}(${P(x)}, LL_GPIO_PIN_${x.pi.pin});`;
    l+=`\n  /* ${x.sig} ${x.port} ${x.o.sig} */\n  LL_GPIO_StructInit(&g);\n  g.Pin = LL_GPIO_PIN_${x.pi.pin};\n  g.Mode = ${mode};\n  g.OutputType = LL_GPIO_OUTPUT_${x.od?'OPENDRAIN':'PUSHPULL'};\n  g.Pull = LL_GPIO_PULL_${x.pull==='UP'?'UP':x.pull==='DOWN'?'DOWN':'NO'};\n  g.Speed = LL_GPIO_SPEED_FREQ_${/spi|pwm/.test(x.role)?'HIGH':'LOW'};\n  g.Alternate = LL_GPIO_AF_${x.r.af};\n  LL_GPIO_Init(${P(x)}, &g);\n`;});
  l+=`}\n`;out.push({name:'mcal_ll_gpio.c',text:l});
  return out;
}

function generate(B,H,mcuRef){
  const M=model(B,H,mcuRef);if(M.error)return M;
  const files=[{name:`${cid(M.board||'Board')}_Mcal.arxml`,kind:'arxml',text:arxml(M)}].concat(cfiles(M).map(f=>Object.assign({kind:'c'},f))).concat(hal(M).map(f=>Object.assign({kind:'hal'},f)));
  return{model:M,ports:portRegs(M),files};
}
return{model,generate,arxml,cfiles,hal,aurixPC,stm32Regs,portRegs};
})();
if(typeof module!=='undefined')module.exports=MCAL;
