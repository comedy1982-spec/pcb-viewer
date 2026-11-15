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
/* ---------- external connector signals: ESD / transient protection at the pin and short-to-battery injection into the MCU ----------
   An external connector is any J except debug / programming headers. A signal net on it (not ground, not a supply rail, not a
   high-current power net) is protected when a TVS / ESD diode sits on that very net. Short to battery: the line may meet the
   battery maximum (requirement, default 16 V); the series resistance between the pin and the MCU must hold the MCU's injection
   current below its limit (TC3xx: digital ±5 mA, analog ±3 mA — TC364 datasheet record), unless an external clamp diode takes it. */
const ESD_PART={mpn:'PESD1CAN',src:'Nexperia PESD1CAN: VRWM 24 V (배터리 단락 · 점프 스타트 견딤), IEC 61000-4-2 접촉 23 kV, Cd 11 pF',pins:{a:1,b:2,gnd:3},names:{1:'K1',2:'K2',3:'K'}};
function connProt(B,opt){opt=opt||{};const vbat=opt.vbat||16;const iDig=opt.iDig||5e-3,iAna=opt.iAna||3e-3;const curr=opt.curr||{};const out=[];
  const comps=(B.comps||B.parts||[]).map(c=>c.pads?c:Object.assign({},c,{pads:Object.entries(c.pins||{}).map(([n,net])=>({n,net:net||null}))}));
  const on=(c,n)=>c.pads.some(p=>p.net===n);const isDbg=c=>/디버그|DAP|JTAG|SWD|UART|프로그래밍|TAG-?CONNECT/i.test((c.desc||'')+' '+c.val);
  const isTvs=c=>/^D/i.test(c.ref)&&/TVS|ESD|PESD|TPD\d|SMAJ|SMBJ|ESD\d/i.test((c.desc||'')+' '+c.val+' '+(c.mpn||''));
  const mcu=comps.find(c=>/TC3|TC2|STM32|S32K|RH850|AURIX/i.test((c.val||'')+' '+(c.desc||''))&&c.pads.length>=32);
  const J=comps.filter(c=>/^J\d/i.test(c.ref)&&!isDbg(c));const seen=new Set();const sig=[],sup=[];
  J.forEach(j=>j.pads.forEach(p=>{const n=p.net;if(!n||seen.has(n)||isGnd(n))return;seen.add(n);
    if(railV(n)!=null||/^(VBAT|VIN|VIN_RAW|KL30|KL15|BAT)/i.test(n)){if(railV(n)!=null&&railV(n)<=12)sup.push({n,j});return;}
    if((+curr[n]||0)>=1)return;sig.push({n,j});}));
  sig.forEach(({n,j})=>{const prot=comps.some(c=>isTvs(c)&&on(c,n));
    // path to the MCU: directly, or through one series resistor (+ an optional clamp diode on the MCU side)
    let rs=null,via=null,clamp=false,ana=false;if(mcu&&on(mcu,n))rs=0;
    else comps.filter(c=>/^R\d/i.test(c.ref)&&c.pads.length===2&&on(c,n)).forEach(r=>{const o=r.pads.find(p=>p.net!==n);if(!o||!o.net)return;const n2=o.net;
      const reach=mcu&&on(mcu,n2)||comps.some(c=>/^R\d/i.test(c.ref)&&c.ref!==r.ref&&c.pads.length===2&&on(c,n2)&&mcu&&on(mcu,(c.pads.find(q=>q.net!==n2)||{}).net));
      if(!reach)return;const v=rOhm(r.val);if(v==null)return;if(rs==null||v>rs){rs=v;via=r;clamp=comps.some(c=>/^D/i.test(c.ref)&&/클램프|BAT54|clamp/i.test((c.desc||'')+c.val)&&on(c,n2));ana=/아날로그|ADC|AIN/i.test((r.desc||'')+n);}});
    if(!prot)out.push({sev:'warn',code:'esd_missing',net:n,conn:j.ref,msg:`${j.ref} 커넥터 신호 ${n}에 ESD/TVS 다이오드가 없음`,fix:`커넥터 핀 가까이 ${ESD_PART.mpn}(2채널 · VRWM 24 V) — 배터리 단락에도 견디는 24 V급`,add:true});
    if(rs!=null&&!clamp){const lim=ana?iAna:iDig;const vio=3.3;const i=(vbat-vio-0.3)/Math.max(rs,1e-3);const rmin=(vbat-vio-0.3)/lim;
      if(i>lim)out.push({sev:rs===0?'err':'warn',code:'stb_inject',net:n,conn:j.ref,msg:`${n}가 배터리(${vbat} V)에 단락되면 MCU 핀 주입 전류 ${rs===0?'제한 없음':(i*1000).toFixed(0)+' mA'} (직렬 ${rs===0?'없음':via.ref+' '+via.val}) — 허용 ±${lim*1000} mA (${ana?'아날로그':'디지털'} 핀, TC364 데이터시트)`,
        fix:`직렬 저항을 ${(rmin/1000).toFixed(1)} kΩ 이상으로 하거나 MCU 쪽에 클램프 다이오드(예: BAT54S → 3.3 V · GND) — 클램프 전류가 3.3 V 레일로 흘러들므로 레일 최소 부하가 그보다 커야`});}});
  sup.forEach(({n,j})=>out.push({sev:'info',code:'supply_out',net:n,conn:j.ref,msg:`${j.ref}로 나가는 센서 공급 ${n}: 외부 단락(GND · 배터리) 시 레귤레이터 보호 확인`,fix:'전류 제한 · 역류 차단 다이오드 · 배터리 단락 시 레귤레이터 출력 허용 전압(데이터시트) 확인'}));
  const n=k=>out.filter(f=>f.sev===k).length;return{findings:out,err:n('err'),warn:n('warn'),signals:sig.map(x=>x.n),vbat};}
const rOhm=v=>{const m=String(v||'').replace(/Ω|ohm/i,'').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM]?)/);if(!m)return null;return +m[1]*({k:1e3,K:1e3,M:1e6,m:1e-3,'':1}[m[2]]);};
function protText(R){if(!R.findings.length)return`외부 커넥터 신호 보호: 문제 없음 (${R.signals.length}개 신호)`;return`외부 커넥터 신호 보호 (배터리 단락 ${R.vbat} V 기준): `+R.findings.map(f=>`\n${f.sev==='err'?'✕':f.sev==='warn'?'△':'·'} [${f.net}] ${f.msg}\n   → ${f.fix}`).join('');}
function text(R){if(!R.findings.length)return`블록 간 인터페이스: 문제 없음 (I/O 전압 ${R.io.map(x=>`${x.ref} ${x.io} V`).join(' · ')})`;
  return`블록 간 인터페이스: 오류 ${R.err} · 확인 ${R.warn}\n`+R.findings.map(f=>`${f.sev==='err'?'✕':'△'} [${f.net}] ${f.msg}\n   → ${f.fix}`).join('\n');}
return{run,text,SPEC,SAFE,connProt,protText,ESD_PART};
})();
if(typeof module!=='undefined')module.exports=IFCHECK;
