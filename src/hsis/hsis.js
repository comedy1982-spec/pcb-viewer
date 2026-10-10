/* HSIS engine: column mapping, ARXML Port parsing, consistency checks, traceability. Pure functions. */
const HSIS=(function(){
"use strict";
const nk=s=>String(s==null?'':s).toLowerCase().replace(/[\s_\-./()·:]+/g,'');
const FIELDS={
  id:['id','hsisid','항목id','번호','no'],signal:['신호명','신호','signal','signalname','신호이름','name'],cat:['분류','category','type','종류','신호분류'],
  pins:['mcu핀','핀','핀번호','pin','pins','pinno','pinnumber','ball','mcupin'],port:['포트','port','gpio','portpin'],
  func:['핀기능','기능','function','altfunction','af','대체기능','pinfunction'],periph:['주변장치','peripheral','ip'],
  dir:['방향','direction','dir','io'],init:['초기값','init','initial','initialvalue','초기상태','initiallevel'],active:['활성레벨','활성','active','activelevel','polarity'],
  pull:['풀업풀다운','풀업','pull','pullupdown','bias','풀'],net:['회로도넷','넷','net','netname','schematicnet','신호넷'],
  hw:['hw연결','hw','연결','connector','hwconnection','하드웨어연결','연결부품'],elec:['전기적특성','전기특성','electrical','전압레벨','level'],
  scale:['변환식','스케일','scaling','conversion','formula','물리값변환'],timing:['타이밍','주기','timing','frequency','속도','speed'],
  swmod:['sw모듈','swmodule','드라이버','driver','bsw모듈','module'],swcfg:['sw설정id','sw설정','설정id','swconfig','config','configid','설정'],
  api:['api','swapi','함수'],req:['요구사항id','요구사항','requirement','req','reqid','상위요구사항','requirementid'],
  test:['테스트id','테스트','테스트케이스','test','testcase','tc','testid'],asil:['asil','안전등급','safety','asil등급'],
  status:['상태','status','리뷰상태','reviewstatus'],note:['비고','note','notes','remark','comment','설명']};
const LABEL={id:'ID',signal:'신호명',cat:'분류',pins:'MCU 핀',port:'포트',func:'핀 기능',periph:'주변장치',dir:'방향',init:'초기값',active:'활성 레벨',pull:'풀업/풀다운',net:'회로도 넷',hw:'HW 연결',elec:'전기적 특성',scale:'변환식',timing:'타이밍',swmod:'SW 모듈',swcfg:'SW 설정 ID',api:'API',req:'요구사항 ID',test:'테스트 ID',asil:'ASIL',status:'상태',note:'비고'};

/* ---------- tables ---------- */
function csvRows(text){
  const lines=text.replace(/^﻿/,'').replace(/\r/g,'').split('\n').filter(l=>l.trim());if(!lines.length)return[];
  const cnt=(l,d)=>l.split(d).length;const d=[',',';','\t'].reduce((a,b)=>cnt(lines[0],b)>cnt(lines[0],a)?b:a);
  return lines.map(line=>{const o=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else if(c==='"')q=true;else if(c===d){o.push(cur);cur='';}else cur+=c;}o.push(cur);return o.map(s=>s.trim());});
}
function mapColumns(header){
  const map={},used=new Set();const ks=header.map(nk);
  Object.entries(FIELDS).forEach(([f,names])=>{for(const n of names){const i=ks.findIndex((k,j)=>k===n&&!used.has(j));if(i>=0){map[f]=i;used.add(i);break;}}});
  return map;
}
function fromRows(rows,meta){
  let hi=-1,map=null;
  for(let i=0;i<Math.min(rows.length,30);i++){const m=mapColumns((rows[i]||[]).map(v=>v==null?'':String(v)));if(m.id!=null&&m.signal!=null){hi=i;map=m;break;}}
  if(hi<0)throw new Error('HSIS 표의 머리글(ID, 신호명)을 찾지 못했습니다.');
  const header=rows[hi].map(v=>v==null?'':String(v));
  const items=[];
  for(let i=hi+1;i<rows.length;i++){const r=rows[i]||[];const get=f=>map[f]!=null&&r[map[f]]!=null?String(r[map[f]]).trim():'';
    if(!get('id')&&!get('signal'))continue;const o={};Object.keys(FIELDS).forEach(f=>{o[f]=get(f);});o.row=i+1;items.push(o);}
  const unmapped=header.filter((h,i)=>h&&!Object.values(map).includes(i));
  return{items,map,header,unmapped,meta:Object.assign({},meta||{})};
}

/* ---------- ARXML Port ---------- */
function parseARXML(text){
  const out=[];
  // leaf containers only: blocks without nested containers
  const blocks=[];let m;const stack=[];const tag=/<(\/?)ECUC-CONTAINER-VALUE\b[^>]*>/g;
  while((m=tag.exec(text))){if(!m[1])stack.push({s:m.index+m[0].length,nested:false});else{const o=stack.pop();if(!o)continue;if(stack.length)stack[stack.length-1].nested=true;if(!o.nested)blocks.push(text.slice(o.s,m.index));}}
  blocks.forEach(b=>{const def=(b.match(/<DEFINITION-REF[^>]*>([^<]+)<\/DEFINITION-REF>/)||[])[1]||'';if(!/\/PortPin$/.test(def.trim()))return;
    const name=((b.match(/<SHORT-NAME>([^<]+)<\/SHORT-NAME>/)||[])[1]||'').trim();const params={};
    const pr=/<ECUC-(?:NUMERICAL|TEXTUAL)-PARAM-VALUE>[\s\S]*?<DEFINITION-REF[^>]*>([^<]+)<\/DEFINITION-REF>[\s\S]*?<VALUE>([^<]*)<\/VALUE>[\s\S]*?<\/ECUC-(?:NUMERICAL|TEXTUAL)-PARAM-VALUE>/g;let p;
    while((p=pr.exec(b)))params[p[1].trim().split('/').pop()]=p[2].trim();
    out.push({name,id:params.PortPinId!=null?String(parseInt(params.PortPinId,10)):null,dir:params.PortPinDirection||'',mode:params.PortPinMode||'',level:params.PortPinLevelValue||'',params});});
  if(!out.length)throw new Error('ARXML에서 Port/PortPin 설정을 찾지 못했습니다.');
  return out;
}

/* ---------- helpers ---------- */
function parsePins(s){const out=[];String(s||'').split(/[,;\s]+/).forEach(t=>{if(!t)return;const m=t.match(/^(\d+)[-~](\d+)$/);if(m){for(let i=+m[1];i<=+m[2]&&i-+m[1]<200;i++)out.push(String(i));}else out.push(t.replace(/^(pin|p)/i,''));});return out;}
const netN=s=>String(s||'').replace(/^\//,'').replace(/\s+/g,'').toUpperCase();
function parseVal(s){if(s==null)return NaN;s=String(s).replace(/Ω|ohms?/gi,'').replace(/[µμ]/g,'u');const M={p:1e-12,n:1e-9,u:1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,R:1,r:1};
  let m=s.match(/(\d+)([kKMRr])(\d+)/);if(m)return parseFloat(m[1]+'.'+m[3])*M[m[2]];m=s.match(/(\d*\.?\d+)\s*([pnumkKMRr])?/);if(!m)return NaN;return parseFloat(m[1])*(M[m[2]]||1);}
function category(it){
  if(it.cat)return it.cat;const f=(it.func+' '+it.dir+' '+it.periph).toUpperCase();
  if(/VDD|VCC|전원/.test(f))return'전원';if(/VSS|GND|접지/.test(f))return'접지';if(/OSC|XTAL|CLK.?IN|HSE|LSE/.test(f))return'클럭';
  if(/RST|RESET|BOOT/.test(f))return'리셋·부트';if(/ADC|AIN|아날로그|DAC/.test(f))return'아날로그';
  if(/I2C|SPI|UART|USART|CAN|LIN|USB|ETH|SDIO/.test(f))return'통신';if(/출력|OUT/.test(f))return'디지털 출력';return'디지털 입력';
}
const CAT_ORDER=['통신','디지털 출력','디지털 입력','아날로그','클럭','리셋·부트','전원','접지'];
function pickMcu(B,items){
  let best=null,score=-1;B.comps.forEach(c=>{if(c.pads.length<8)return;let s=0;items.forEach(it=>parsePins(it.pins).forEach(n=>{const p=c.pads.find(q=>q.n===n);if(p&&it.net&&p.net&&netN(p.net)===netN(it.net))s+=2;else if(p)s+=0.1;}));if(score<0||s>score){score=s;best=c;}});
  return best?best.ref:null;
}
const levelOf=s=>{s=String(s||'').toUpperCase();if(/HIGH|^1$|하이|H$/.test(s))return'H';if(/LOW|^0$|로우|L$/.test(s))return'L';return null;};
const dirOf=s=>{s=String(s||'').toUpperCase();if(/INOUT|양방향|BIDIR|I\/O/.test(s))return'IO';if(/OUT|출력/.test(s))return'O';if(/IN|입력/.test(s))return'I';return null;};

/* ---------- checks ---------- */
function check(B,H,arxml,mcuRef){
  const res=[];const add=(sev,code,id,msg,extra)=>res.push(Object.assign({sev,code,id,msg},extra||{}));
  const mcu=mcuRef&&B.byRef[mcuRef];
  const items=H.items;const pinOwners={};
  if(!mcu)add('err','MCU_MISSING',null,`보드에서 MCU ${mcuRef||''}를 찾지 못했습니다. HSIS 위쪽에서 MCU 부품을 고르세요.`);
  items.forEach(it=>{
    const pins=parsePins(it.pins);const cat=category(it);it._cat=cat;it._pins=pins;
    pins.forEach(n=>{(pinOwners[n]=pinOwners[n]||[]).push(it.id);});
    // 1. MCU pin ↔ schematic net
    if(mcu&&pins.length){
      let okPins=0;
      pins.forEach(n=>{const pad=mcu.pads.find(p=>String(p.n)===n);
        if(!pad){add('err','PIN_NOT_FOUND',it.id,`${mcu.ref}에 ${n}번 핀이 없습니다.`,{pin:n});return;}
        if(!pad.net){add('err','PIN_NC',it.id,`${mcu.ref}.${n} 핀이 회로도에서 연결되어 있지 않습니다. HSIS는 ${it.net||'(넷 없음)'}로 정의했습니다.`,{pin:n});return;}
        if(it.net&&netN(pad.net)!==netN(it.net)){add('err','NET_MISMATCH',it.id,`${mcu.ref}.${n} 핀은 회로도에서 ${pad.net} 넷인데, HSIS는 ${it.net}입니다.`,{pin:n,net:pad.net});return;}
        const toks=(it.port+' '+it.func).toUpperCase().split(/[\s/,]+/).filter(Boolean);
        if(pad.fn&&toks.length&&!toks.some(t=>t===pad.fn.toUpperCase()||t.includes(pad.fn.toUpperCase())||pad.fn.toUpperCase().includes(t)))
          add('warn','PIN_NAME',it.id,`${mcu.ref}.${n} 핀 이름은 풋프린트에서 ${pad.fn}인데, HSIS는 ${it.port||it.func}입니다.`,{pin:n});
        okPins++;});
      if(okPins===pins.length)add('ok','PIN_NET',it.id,`MCU 핀 ${pins.join(', ')} → 회로도 넷 ${it.net||mcu.pads.find(p=>String(p.n)===pins[0]).net} 일치`);
    }else if(!pins.length)add('info','NO_PIN',it.id,'MCU 핀이 지정되지 않아 회로도 대조를 건너뜁니다.');
    if(it.net&&!B.nets[it.net]&&!Object.keys(B.nets).some(n=>netN(n)===netN(it.net)))add('err','NET_MISSING',it.id,`회로도 넷 ${it.net}이(가) 보드에 없습니다.`);
    // 2. HW connection refs
    const refs=[...String(it.hw||'').matchAll(/\b([A-Z]{1,3}\d+)(?:\.([A-Za-z0-9]+))?/g)];
    refs.forEach(m=>{const c=B.byRef[m[1]];
      if(!c){add('err','HW_PART_MISSING',it.id,`HW 연결에 적힌 ${m[1]}이(가) 보드에 없습니다.`);return;}
      if(m[2]){const p=c.pads.find(q=>String(q.n)===m[2]);if(!p){add('err','HW_PIN_MISSING',it.id,`${m[1]}에 ${m[2]}번 핀이 없습니다.`);return;}
        if(it.net&&p.net&&netN(p.net)!==netN(it.net))add('err','HW_NET',it.id,`${m[1]}.${m[2]}는 ${p.net} 넷인데, HSIS 넷은 ${it.net}입니다.`);
        else if(it.net&&p.net)add('ok','HW_NET',it.id,`HW 연결 ${m[1]}.${m[2]} → ${p.net} 일치`);}});
    // 3. pull resistor
    const pl=String(it.pull||'');
    if(/외부|ext/i.test(pl)&&/(풀업|풀다운|pull)/i.test(pl)&&it.net&&B.nets[it.net]){
      const up=/업|up/i.test(pl);const want=parseVal(pl.replace(/^[^\d]*/,''));
      const cands=B.comps.filter(c=>/^R\d/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===it.net)).map(c=>{const o=c.pads.find(p=>p.net!==it.net);return{c,other:o&&o.net};})
        .filter(x=>x.other&&(up?B.netClass(x.other)==='전원':B.netClass(x.other)==='접지'));
      if(!cands.length)add('err','PULL_MISSING',it.id,`${it.net} 넷에서 ${up?'전원으로 가는 외부 풀업':'접지로 가는 외부 풀다운'} 저항을 찾지 못했습니다.`);
      else{const x=cands[0];const v=parseVal(x.c.val);if(isFinite(want)&&isFinite(v)&&Math.abs(v-want)/want>0.05)add('warn','PULL_VALUE',it.id,`${x.c.ref} ${x.c.val}가 ${up?'풀업':'풀다운'}으로 연결되어 있지만, HSIS 값은 ${pl.replace(/^[^\d]*/,'')}입니다.`);
        else add('ok','PULL',it.id,`${up?'풀업':'풀다운'} ${x.c.ref} ${x.c.val} → ${x.other} 확인`);}
    }
    // 4. traceability
    if(!it.req)add('warn','TRACE_REQ',it.id,'연결된 요구사항 ID가 없습니다.');
    if(!it.test)add('warn','TRACE_TEST',it.id,'연결된 테스트 ID가 없습니다.');
  });
  // 5. duplicate pins
  Object.entries(pinOwners).forEach(([n,ids])=>{if(ids.length>1)ids.forEach(id=>add('err','PIN_DUP',id,`${n}번 핀이 여러 신호(${ids.join(', ')})에 중복 할당되어 있습니다.`,{pin:n}));});
  // 6. undocumented connected MCU pins
  if(mcu)mcu.pads.forEach(p=>{if(p.net&&!pinOwners[String(p.n)])add('warn','PIN_UNDOC',null,`${mcu.ref}.${p.n}${p.fn?' ('+p.fn+')':''} 핀이 회로도에서 ${p.net}에 연결되어 있지만 HSIS에 없습니다.`,{pin:String(p.n)});});
  // 7. SW configuration (ARXML Port)
  if(arxml){
    const used=new Set();
    items.forEach(it=>{
      const keys=[it.signal,it.func,it.swcfg&&it.swcfg.replace(/^.*_/,'')].filter(Boolean).map(netN);
      const ap=arxml.find(a=>{const n=netN(a.name.replace(/^PortPin_?/i,''));return keys.includes(n);});
      const swPin=/Dio|Port|Spi|I2c|Usb|Adc|Pwm|Icu|Uart|Can|Lin/i.test(it.swmod||'');
      if(!ap){if(swPin&&it._pins.length===1)add('warn','SW_MISSING',it.id,`ARXML Port 설정에 ${it.signal}에 해당하는 PortPin이 없습니다.`);return;}
      used.add(ap);
      if(it._pins.length===1&&ap.id&&ap.id!==it._pins[0])add('err','SW_PIN',it.id,`SW 설정 ${ap.name}은(는) ${ap.id}번 핀인데, HSIS는 ${it._pins[0]}번 핀입니다.`,{pin:it._pins[0]});
      else add('ok','SW_PIN',it.id,`SW 설정 ${ap.name} → ${ap.id}번 핀 일치`);
      const d1=dirOf(it.dir),d2=dirOf(ap.dir.replace('PORT_PIN_',''));if(d1&&d2&&d1!==d2&&d1!=='IO'&&d2!=='IO')add('warn','SW_DIR',it.id,`방향이 다릅니다: HSIS ${it.dir}, SW 설정 ${ap.dir}.`);
      const l1=levelOf(it.init),l2=levelOf(ap.level.replace('PORT_PIN_LEVEL_',''));if(l1&&l2&&l1!==l2)add('warn','SW_INIT',it.id,`초기값이 다릅니다: HSIS ${it.init}, SW 설정 ${ap.level}.`);
    });
    arxml.forEach(a=>{if(!used.has(a))add('warn','SW_UNDOC',null,`SW 설정 ${a.name}(${a.id}번 핀)이 HSIS에 없습니다.`,{pin:a.id});});
  }
  // per-item status
  const st={};items.forEach(it=>{st[it.id]='ok';});
  res.forEach(r=>{if(!r.id||!(r.id in st))return;if(r.sev==='err')st[r.id]='err';else if(r.sev==='warn'&&st[r.id]!=='err')st[r.id]='warn';});
  return{results:res,status:st};
}
function trace(H){
  const reqs={},noReq=[];
  H.items.forEach(it=>{const rs=String(it.req||'').split(/[,;\s]+/).filter(Boolean);if(!rs.length)noReq.push(it);rs.forEach(r=>{(reqs[r]=reqs[r]||{id:r,items:[],tests:new Set()}).items.push(it);String(it.test||'').split(/[,;\s]+/).filter(Boolean).forEach(t=>reqs[r].tests.add(t));});});
  const n=H.items.length||1;
  return{reqs:Object.values(reqs).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).map(r=>Object.assign(r,{tests:[...r.tests]})),noReq,
    reqCov:H.items.filter(i=>i.req).length/n,testCov:H.items.filter(i=>i.test).length/n};
}
// firmware ↔ HSIS: pins the firmware drives (setup) and reads (code) against the documented ports, directions and PWM frequency
// fw: {ref, out:[{pin,pwm,freq}], reads:[{pin,analog}], error}
function checkFw(H,fw,prev){
  const res=[];const add=(sev,code,id,msg,extra)=>res.push(Object.assign({sev,code,id,msg},extra||{}));
  const items=H.items,port=it=>String(it.port||'').trim().toUpperCase(),byPort=p=>items.find(it=>port(it)===p);
  const pinOf=it=>{const ps=parsePins(it.pins);return ps.length===1?{pin:ps[0]}:{};};
  if(fw.error)add('warn','FW_BUILD',null,`펌웨어를 빌드하지 못해 펌웨어 대조를 건너뜁니다: ${fw.error}`);
  else{
    fw.out.forEach(o=>{const it=byPort(o.pin);
      if(!it){add('warn','FW_UNDOC',null,`펌웨어가 ${o.pin}을(를) ${o.pwm?'PWM':'GPIO'} 출력으로 쓰지만 HSIS에 해당 포트가 없습니다.`);return;}
      const d=dirOf(it.dir);if(d==='I')add('err','FW_DIR',it.id,`펌웨어는 ${o.pin}을(를) 출력으로 설정하는데, HSIS 방향은 ${it.dir}입니다.`,pinOf(it));
      else add('ok','FW_DIR',it.id,`펌웨어 ${o.pin} ${o.pwm?'PWM':'GPIO'} 출력 ↔ HSIS ${it.dir||'출력'} 일치`);
      if(o.pwm){const m=String(it.timing||'').match(/(\d+(?:\.\d+)?)\s*(k|K)?\s*Hz/);
        if(m){const hz=parseFloat(m[1])*(m[2]?1000:1);if(Math.abs(hz-o.freq)/hz>0.02)add('warn','FW_FREQ',it.id,`PWM 주파수가 다릅니다: HSIS ${hz} Hz, 펌웨어 ${o.freq} Hz.`,pinOf(it));else add('ok','FW_FREQ',it.id,`PWM ${o.freq} Hz ↔ HSIS 타이밍 일치`);}
        else add('info','FW_FREQ',it.id,`HSIS 타이밍에 PWM 주파수가 없습니다 (펌웨어 ${o.freq} Hz).`);}});
    fw.reads.forEach(r=>{const it=byPort(r.pin);
      if(!it){add('warn','FW_UNDOC',null,`펌웨어가 ${r.pin}을(를) ${r.analog?'ADC로':'디지털 입력으로'} 읽지만 HSIS에 해당 포트가 없습니다.`);return;}
      const d=dirOf(it.dir);if(d==='O')add('err','FW_DIR',it.id,`펌웨어는 ${r.pin}을(를) 읽는데, HSIS 방향은 ${it.dir}입니다.`,pinOf(it));
      else if(r.analog&&category(it)!=='아날로그'&&!/ADC/i.test(it.func+' '+it.periph))add('warn','FW_ADC',it.id,`펌웨어는 ${r.pin}을(를) ADC로 읽는데, HSIS에 아날로그/ADC 기능이 없습니다.`,pinOf(it));
      else add('ok','FW_IN',it.id,`펌웨어 ${r.pin} ${r.analog?'ADC':'디지털'} 입력 ↔ HSIS 일치`);});
    items.forEach(it=>{const p=port(it);if(/^P[A-K]\d{1,2}$/.test(p)&&dirOf(it.dir)==='O'&&!fw.out.some(o=>o.pin===p))add('warn','FW_UNUSED',it.id,`HSIS는 ${p}를 출력으로 정의했지만 펌웨어 setup()에서 설정하지 않습니다.`,pinOf(it));});
  }
  // merge into an existing check() result
  const out={results:prev.results.concat(res),status:Object.assign({},prev.status)};
  res.forEach(r=>{if(!r.id||!(r.id in out.status))return;if(r.sev==='err')out.status[r.id]='err';else if(r.sev==='warn'&&out.status[r.id]!=='err')out.status[r.id]='warn';});
  return out;
}
return{FIELDS,LABEL,CAT_ORDER,csvRows,mapColumns,fromRows,parseARXML,parsePins,category,pickMcu,check,checkFw,trace,netN};
})();
if(typeof module!=='undefined')module.exports=HSIS;
