/* ---------- interfaces between blocks: logic levels, default states during reset, open-drain pull-ups, floating inputs ----------
   Runs on a generated board (parts + nets). Pin directions come from the part's pin table (datasheet records / KiCad pins);
   an IC's I/O voltage is the rail on its I/O-supply pin. The MCU's pins are GPIO at its V_EXT rail. Findings carry the net,
   the parts on both ends, what can go wrong and the fix. Severity: err = will misbehave / can damage, warn = check, info = note. */
const IFCHECK=(function(){
"use strict";
/* part notes that pin tables do not carry (datasheet facts; 'src' says where from) */
const SPEC={
  'DRV8334':{src:'DRV8334-Q1 SLVSHC8A 권장 동작 조건',od:['NFAULT','SDO'],in55:true,note:'로직 입력 0–5.5 V (권장) · nFAULT · SDO 오픈 드레인'},
  'A4911':{src:'A4911 데이터시트',od:['FF1','FF2','NFAULT'],in55:true},
  'TLE9251':{src:'TLE9251V 데이터시트',vio:'VIO'},
  'TPS3823':{src:'TPS3823 데이터시트',pp:['RESET']}};
const spec=c=>{const k=Object.keys(SPEC).find(k=>String(c.val||'').toUpperCase().includes(k)||String(c.mpn||'').toUpperCase().includes(k));return k?SPEC[k]:null;};
/* control inputs whose level during MCU reset decides whether the power stage / bus is safe; level = the safe state */
const SAFE=[
  {re:/^(DRVOFF|DIS|DISABLE)$/i,lvl:'H',why:'게이트 차단 입력 — 리셋 중 High(차단)여야'},
  {re:/^(N?SLEEP|EN|ENABLE|RESETN|NRESET)$/i,drv:true,lvl:'L',why:'드라이버 활성 입력 — 리셋 중 Low(꺼짐)여야'},
  {re:/^(INH|INL|IN|HIN|LIN|PWM)[A-C1-3]?(_[UVW])?$|^IN[HL][ABC]$|^[HL]I[ABC123]?$/i,drv:true,lvl:'L',why:'게이트 PWM 입력 — 리셋 중 Low(FET OFF)여야'},
  {re:/^(STB|NSTB|S)$/i,can:true,lvl:'H',why:'CAN 대기 입력 — 리셋 중 High(대기)여야 버스를 방해하지 않음'}];
const isGnd=n=>/^(A|D|P)?GND|^VSS|^0V$/i.test(n||'');
const railV=n=>{const s=String(n||'');let m=s.match(/^\+?(\d+)V(\d+)?$/i);if(m)return+(m[1]+'.'+(m[2]||0));m=s.match(/^\+?(\d+(?:\.\d+)?)V\b/i);if(m)return+m[1];if(/^VDD$/i.test(s))return null;return null;};
const isRail=n=>railV(n)!=null||/^(VBAT|VIN_RAW|VCC|VDD)/i.test(n||'');
function pinsOf(c,lookup){const rec=lookup?(lookup(c.mpn)||lookup(c.val)):null;const T={};(rec&&rec.pins||[]).forEach(p=>{T[String(p.num)]={name:String(p.name||'').toUpperCase(),type:String(p.type||'')};});
  return c.pads.map(p=>Object.assign({n:String(p.n),net:p.net,fn:p.fn||''},T[String(p.n)]||{name:String((c.pinNames&&c.pinNames[p.n])||p.fn||'').toUpperCase(),type:''}));}
function run(B,opt){opt=opt||{};const lookup=opt.lookup||(typeof NEWPROJ!=='undefined'?NEWPROJ.partLookup:null);const out=[];
  // a board (comps with pads) or the generator's part list (pins {num: net})
  const comps=(B.comps||B.parts||[]).map(c=>c.pads?c:Object.assign({},c,{pads:Object.entries(c.pins||{}).map(([n,net])=>({n,net:net||null}))}));const byNet={};
  const ICs=comps.filter(c=>/^(U|IC)\d/i.test(c.ref)).map(c=>{const P=pinsOf(c,lookup);const mcu=/TC3|TC2|STM32|S32K|RH850|AURIX|MCU/i.test((c.val||'')+' '+(c.desc||''))&&c.pads.length>=32;const S=spec(c);
    // I/O voltage: a VIO-type pin first, then the logic supply; MCU = its V_EXT / VDDP3 rail
    let io=null;const sup=P.filter(p=>p.net&&!isGnd(p.net)&&railV(p.net)!=null);
    const vioP=sup.find(p=>/^(VIO|VCCIO|VDDIO|VL|VLOGIC|IOREF)$/.test(p.name));
    if(vioP)io=railV(vioP.net);else if(mcu){const r=sup.map(p=>railV(p.net)).filter(v=>v>=3&&v<=5.5);io=r.length?Math.min(...r):null;}
    else{const lg=sup.filter(p=>/^(VCC|VDD|VEXT|VDDP\d?|VS|V\+)$/.test(p.name)&&railV(p.net)<=5.5);io=lg.length?Math.min(...lg.map(p=>railV(p.net))):null;}
    const ioNet=io==null?null:(sup.find(p=>railV(p.net)===io)||{}).net||null;return{c,P,mcu,S,io,ioNet};});
  ICs.forEach(x=>x.P.forEach(p=>{if(p.net)(byNet[p.net]=byNet[p.net]||[]).push({ic:x,p});}));
  const resOn=n=>comps.filter(c=>/^R\d/i.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===n)).map(c=>({c,other:c.pads.find(p=>p.net!==n)}));
  const pullOf=n=>{const R=resOn(n);const up=R.filter(r=>r.other&&isRail(r.other.net)),dn=R.filter(r=>r.other&&isGnd(r.other.net));return{up,dn};};
  const add=(sev,code,net,msg,fix,refs,pull)=>out.push({sev,code,net,msg,fix,refs:[...new Set(refs||[])],pull:pull||null});
  const label=x=>`${x.ic.c.ref} ${x.ic.c.val}.${x.p.name||x.p.n}`;
  const isOD=x=>/open_(collector|drain|emitter)/.test(x.p.type)||(x.ic.S&&(x.ic.S.od||[]).includes(x.p.name));
  const isOut=x=>x.p.type==='out'||x.p.type==='tri_state'||isOD(x)||(x.ic.S&&(x.ic.S.pp||[]).includes(x.p.name));
  const isIn=x=>x.p.type==='in'||x.p.type==='input';
  Object.entries(byNet).forEach(([net,L])=>{if(isGnd(net)||isRail(net))return;const mcuEnds=L.filter(x=>x.ic.mcu),others=L.filter(x=>!x.ic.mcu);
    // 1 open-drain output needs a pull-up
    L.filter(isOD).forEach(x=>{const {up}=pullOf(net);if(!up.length)add('err','od_pullup',net,`${label(x)}는 오픈 드레인 출력인데 ${net} 넷에 풀업 저항이 없음 — 항상 Low로 읽히거나 떠 있음`,`${net}에 10 kΩ 풀업을 수신 쪽 I/O 전원(${(mcuEnds[0]&&mcuEnds[0].ic.io)||3.3} V 레일)으로 추가${mcuEnds.length?' (MCU 내부 풀업은 수 십 kΩ · 리셋 중 꺼질 수 있음)':''}`,L.map(y=>y.ic.c.ref),{to:(mcuEnds[0]&&mcuEnds[0].ic.ioNet)||(L.find(y=>y.ic.ioNet)||{ic:{}}).ic.ioNet||'+3V3',why:`${label(x)} 오픈 드레인 풀업`});});
    // 2 logic levels between ICs on different I/O rails
    const drivers=L.filter(x=>isOut(x)&&!isOD(x)).concat(mcuEnds.filter(()=>others.some(isIn)));
    const recv=L.filter(isIn).concat(mcuEnds.filter(()=>others.some(isOut)));
    drivers.forEach(d=>recv.forEach(r=>{if(d===r||d.ic===r.ic||d.ic.io==null||r.ic.io==null)return;const Vd=d.ic.io,Vr=r.ic.io;
      if(Vd>Vr+0.3&&!(r.ic.S&&r.ic.S.in55&&Vd<=5.5))add('err','level_over',net,`${label(d)} (${Vd} V 출력) → ${label(r)} (${Vr} V I/O) — 수신 핀 허용 전압 초과 가능`,`레벨 변환(분압 · 버퍼 · 변환 IC)을 넣거나 ${d.ic.c.ref}의 I/O 전원을 ${Vr} V로 — 수신 핀이 ${Vd} V 허용(5 V tolerant)이면 데이터시트 근거로 무시`,[d.ic.c.ref,r.ic.c.ref]);
      else if(Vd<0.7*Vr&&!(r.ic.S&&r.ic.S.in55&&Vd>=3))add('warn','level_under',net,`${label(d)} (${Vd} V 출력) → ${label(r)} (${Vr} V I/O) — CMOS VIH(0.7 × ${Vr} = ${(0.7*Vr).toFixed(2)} V) 미달 가능`,`수신 핀 VIH를 데이터시트로 확인 (TTL 호환이면 OK) — 아니면 레벨 변환`,[d.ic.c.ref,r.ic.c.ref]);}));
    // 3 default state of control inputs while the MCU is in reset (its pins float or are weak pulls)
    if(mcuEnds.length)others.forEach(x=>{const nm=x.p.name;const rule=SAFE.find(s=>s.re.test(nm)&&(!s.drv||/게이트|드라이버|DRV|A49|IR21|브리지/i.test((x.ic.c.desc||'')+x.ic.c.val))&&(!s.can||/CAN|TLE925|TJA|MCP25/i.test((x.ic.c.desc||'')+x.ic.c.val)));if(!rule)return;
      const {up,dn}=pullOf(net);const ok=rule.lvl==='H'?up.length:dn.length,wrong=rule.lvl==='H'?dn.length:up.length;
      if(wrong&&!ok)add('err','default_wrong',net,`${label(x)}: ${rule.why} — 그런데 ${rule.lvl==='H'?'풀다운':'풀업'}이 달려 리셋 중 반대 상태`,`${net}의 풀 저항을 ${rule.lvl==='H'?'전원(풀업)':'GND(풀다운)'} 쪽으로`,[x.ic.c.ref].concat((rule.lvl==='H'?dn:up).map(r=>r.c.ref)));
      else if(!ok)add('warn','default_float',net,`${label(x)}: ${rule.why} — ${net}에 풀 저항이 없어 MCU 리셋 · 부팅 중 상태가 MCU 핀 기본값에 맡겨짐`,`${net}에 10 kΩ ${rule.lvl==='H'?'풀업':'풀다운'} 추가 (부품 내부 풀 저항이 있으면 데이터시트 근거로 생략)`,[x.ic.c.ref].concat(mcuEnds.map(y=>y.ic.c.ref)),{to:rule.lvl==='H'?(mcuEnds[0].ic.ioNet||'+3V3'):'GND',why:`${label(x)} 리셋 중 ${rule.lvl==='H'?'High':'Low'} 고정`});});
    // 4 two push-pull outputs driving one net
    const pp=L.filter(x=>(x.p.type==='out')&&!isOD(x));if(pp.length>1)add('err','multi_drive',net,`${pp.map(label).join(' · ')} — 푸시풀 출력 ${pp.length}개가 한 넷을 구동 (충돌)`,`하나를 입력으로 바꾸거나 직렬 저항 · 와이어드 OR(오픈 드레인)로`,pp.map(x=>x.ic.c.ref));
  });
  // 5 IC inputs left floating (no net, or alone on their net)
  ICs.forEach(x=>x.P.forEach(p=>{if(!isIn({p,ic:x}))return;const alone=!p.net||!comps.some(o=>o.ref!==x.c.ref&&o.pads.some(q=>q.net===p.net))&&x.c.pads.filter(q=>q.net===p.net).length<=1;
    if(alone&&!/^NC$|^DNC$|^N\.?C\.?$/i.test(p.name))add('warn','in_float',p.net||'(미연결)',`${x.c.ref} ${x.c.val}.${p.name||p.n} 입력이 연결 없이 떠 있음`,`쓰지 않는 입력은 데이터시트 권장대로 GND / 전원에 묶거나 풀 저항`,[x.c.ref]);}));
  const n=k=>out.filter(f=>f.sev===k).length;
  return{findings:out,err:n('err'),warn:n('warn'),io:ICs.filter(x=>x.io!=null).map(x=>({ref:x.c.ref,val:x.c.val,io:x.io})),checked:Object.keys(byNet).length};}
function text(R){if(!R.findings.length)return`블록 간 인터페이스: 문제 없음 (I/O 전압 ${R.io.map(x=>`${x.ref} ${x.io} V`).join(' · ')})`;
  return`블록 간 인터페이스: 오류 ${R.err} · 확인 ${R.warn}\n`+R.findings.map(f=>`${f.sev==='err'?'✕':'△'} [${f.net}] ${f.msg}\n   → ${f.fix}`).join('\n');}
return{run,text,SPEC,SAFE};
})();
if(typeof module!=='undefined')module.exports=IFCHECK;
