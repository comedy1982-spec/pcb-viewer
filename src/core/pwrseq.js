/* ---------- power sequencing and cranking: does every rail and every IC stay within its supply range as the battery sags? ----------
   Runs on the generator's result (parts with c.ldo / c.buck, rails with the block that makes them, the plan).
   Chain (worst case): battery → reverse-polarity protection drop (P-FET RDS(on) at the gate drive the battery gives, hot ×1.75,
   or a diode 0.5 V) → input rail → each regulator (LDO: VOUT + dropout max; buck: VOUT / max duty + RDS·I, and its UVLO /
   EN lockout) → derived rails → the ICs on them (minimum supply from the datasheet records).
   Battery points: normal low = requirement VBAT min (default 9 V) — everything must work; cranking = plan.vcrank (default 4.5 V,
   an assumption to replace with the vehicle's starting profile) — reported as which functions keep running, reset or stop.
   Sequencing: supervisor threshold vs the MCU's minimum supply, reset-safe states of power-stage inputs (IFCHECK), rail order. */
const PWRSEQ=(function(){
"use strict";
/* regulators: dropout (LDO, max) or max duty (buck), minimum input; src = where the figure comes from */
const REG=[
  {re:/AMS1117/i,do:1.3,src:'AMS1117 드롭아웃 최대 1.3 V (1 A / 800 mA)'},
  {re:/LM1117/i,do:1.7,vmin:2.5,src:'LM1117-Q1 드롭아웃 최대 1.7 V @ 1 A'},
  {re:/LM317/i,do:2.0,src:'LM317 드롭아웃 약 2 V (부품 설명 — 데이터시트 표 미기록)'},
  {re:/TPS7B81/i,do:0.675,vmin:3,src:'TPS7B81 드롭아웃 최대 675 mV @ 150 mA · 입력 최소 3 V'},
  {re:/TPS7B86/i,do:0.535,vmin:3,src:'TPS7B86 드롭아웃 최대 535 mV @ 500 mA · 입력 최소 3 V'},
  {re:/TLV755/i,do:0.5,vmin:1.45,src:'TLV755 드롭아웃 (가정 0.5 V)'},
  {re:/TPS54331/i,buck:true,dmax:0.9,rds:0.15,vmin:3.5,src:'TPS54331 입력 최소 3.5 V · 하이사이드 RDS 최대 150 mΩ · 최대 듀티 90 % (가정 — 기록 없음)'}];
/* minimum supply of the ICs (datasheet records). pin: supply pin name pattern; min: full function; alt: [V, what still works] */
const CONS=[
  {re:/TC3[0-9]{2}/i,pin:/^VEXT|^VDDP3|^VDDM|^VEVRSB/i,min:v=>v<=3.63?2.97:4.5,src:'TC364 VEXT 최소 2.97 V (3.3 V 공급) / 4.5 V (5 V 공급)',what:'MCU'},
  {re:/TLE9251/i,pin:/^VCC$/i,min:()=>4.5,alt:[3.8,'수신만 (VCC 저전압 3.8–4.5 V에서 송신 정지)'],src:'TLE9251V VCC 4.5–5.5 V · 저전압 3.8–4.5 V',what:'CAN 송신'},
  {re:/TLE9251/i,pin:/^VIO$/i,min:()=>3.0,src:'TLE9251V VIO 최소 3.0 V',what:'CAN 로직'},
  {re:/TJA1443|TJR1443/i,pin:/^VCC$/i,min:()=>4.5,src:'TJA1443 VCC 4.5–5.5 V (저전압 감지 4.0–4.5 V)',what:'CAN 송신'},
  {re:/TJA1443|TJR1443/i,pin:/^VIO$/i,min:()=>2.95,src:'TJA1443 VIO 2.95–5.5 V (저전압 감지 2.65–2.95 V · 150 ms 넘으면 Sleep)',what:'CAN 로직'},
  {re:/TJA1443|TJR1443/i,pin:/^VBAT$/i,min:()=>4.5,src:'TJA1443 VBAT 4.5–28 V (저전압 감지 4.0–4.5 V → Off)',what:'CAN 웨이크업'},
  {re:/TPS3823/i,pin:/^VDD$/i,min:()=>1.1,src:'TPS3823 VDD 최소 1.1 V',what:'리셋 IC'},
  {re:/DRV8334/i,pin:/^PVDD$/i,min:()=>4.5,alt:[4.0,'로직 · SPI만 (게이트 구동 정지)'],start:4.85,src:'DRV8334-Q1 PVDD 4.5 V (기동 4.85 V · 크랭킹 중 로직 4.0 V)',what:'게이트 드라이버'},
  {re:/A49(11|10|18)/i,pin:/^VBB$/i,min:()=>5.5,alt:[3.4,'출력만 꺼짐 (리셋 없음)'],src:'A4911 VBB 5.5 V (3.4 V까지 리셋 없이 출력만 off · 차지펌프 7 V부터 완전 구동)',what:'게이트 드라이버'},
  {re:/A4964|A3941|A4919/i,pin:/^VBB$/i,min:()=>5.5,src:'Allegro 게이트 드라이버 VBB (가정 5.5 V)',what:'게이트 드라이버'}];
/* full datasheet record text (DSDB) for figures the pin lookup does not carry */
const recText=(c,lookup)=>{const keys=[c.mpn,c.val].filter(Boolean);keys.slice().forEach(k=>{const k2=String(k).replace(/-\d{2}(?=[A-Z])/,'');if(k2!==k)keys.push(k2);});for(const k of keys){const it=typeof DSDB!=='undefined'&&DSDB.items&&DSDB.items[k];if(it&&it.rec)return JSON.stringify(it.rec);}
  try{const r=lookup&&(lookup(c.mpn)||lookup(c.val));return JSON.stringify(r||{});}catch(e){return'{}';}};
const railNom=n=>{const m=String(n||'').match(/^\+(\d+)V(\d*)$/);return m?+(m[1]+(m[2]?'.'+m[2]:'')):null;};
/* opt: lookup (pin names), iface (IFCHECK result), diag (DIAGTHR-style supervisor threshold override) */
function run(R,plan,opt){opt=opt||{};plan=plan||{};const parts=R.parts||[];const rails=R.rails||{};const lookup=opt.lookup||(typeof NEWPROJ!=='undefined'&&NEWPROJ.partLookup)||null;
  const vop=(plan.vop&&plan.vop.length===2?plan.vop:[9,16]).map(Number);const vopSrc=plan.vop?'요구사항':'기본값';
  const vcrank=plan.vcrank!=null?+plan.vcrank:4.5;const crSrc=plan.vcrank!=null?'요구사항':'기본 가정 — 차량 시동 프로파일 값으로 바꾸세요';
  const pw=(plan.blocks||[]).find(b=>b.type==='pwr_in');const batRails=Object.entries(rails).filter(([,x])=>pw&&x.block===pw.id).map(([k])=>k);
  const curr=R.curr||{};const iin=Math.max(0.5,...batRails.map(n=>+curr[n]||0));
  // reverse-polarity protection in the input path
  const qrev=parts.find(c=>/^Q/.test(c.ref)&&/역전압|역접속/.test(c.desc||'')&&/P-?MOSFET|P-FET|P채널/i.test(c.desc||''));const drev=parts.find(c=>/^D/.test(c.ref)&&/역전압|역접속/.test(c.desc||'')&&!/TVS|제너|클램프/.test(c.desc||''));
  let rds45=0.02,rds10=0.01,vth=2.5,revSrc='';
  if(qrev){const s=recText(qrev,lookup);
    const m45=s.match(/VGS\s*=\s*[−-]4\.5\s*V[^"]*?최대\s*([\d.]+)\s*mΩ/);const m10=s.match(/VGS\s*=\s*[−-]10\s*V[^"]*?최대\s*([\d.]+)\s*mΩ/);const mt=s.match(/VGS\(th\)",\s*"[−-]?([\d.]+)\s*~\s*[−-]?([\d.]+)/);
    if(m45)rds45=+m45[1]/1000;if(m10)rds10=+m10[1]/1000;if(mt)vth=+mt[2];revSrc=`${qrev.ref} ${qrev.val} RDS(on) 최대 ${(rds45*1000).toFixed(0)} mΩ @ −4.5 V · ${(rds10*1000).toFixed(1)} mΩ @ −10 V · 고온 ×1.75 · VGS(th) 최대 ${vth} V${m45?' (DS)':' (가정)'}`;}
  else if(drev)revSrc=`${drev.ref} ${drev.val} 순방향 0.5 V (가정)`;else revSrc='역전압 보호 소자 없음';
  const revDrop=vb=>qrev?(vb<=vth+0.5?Math.min(vb,0.8):iin*(vb<6?rds45:rds10)*1.75):drev?0.5:0;
  // regulators
  const regs=parts.filter(c=>c.ldo||c.buck).map(c=>{const k=c.ldo||c.buck;const t=REG.find(x=>x.re.test(c.mpn||c.val||''))||(c.buck?{buck:true,dmax:0.9,rds:0.2,vmin:4,src:'벅 (가정)'}:{do:1.0,src:'LDO 드롭아웃 (가정 1 V)'});
    const mI=String(c.desc||'').match(/부하 약 (\d+) mA/);const I=mI?+mI[1]/1000:0.3;
    let uv=null;if(c.buck){const en=parts.find(p=>/^R/.test(p.ref)&&/저전압 차단 EN 분압 상단/.test(p.desc||''));if(en){const m=String(en.desc).match(/계산 약 ([\d.]+) V \/ ([\d.]+) V/);if(m)uv={stop:+m[1],start:+m[2]};}}
    return{ref:c.ref,mpn:c.mpn||c.val,src:k.src,out:k.out,vout:+k.vout,buck:!!c.buck,t,I,uv};});
  // a PMIC makes several rails from one input; each holds while the input stays above the PMIC's minimum supply
  parts.filter(c=>c.pmic).forEach(c=>c.pmic.outs.forEach(o=>regs.push({ref:c.ref,mpn:c.mpn||c.val,src:c.pmic.src,out:o.out,vout:+o.vout,buck:false,pmic:true,t:{do:0,vmin:c.pmic.vmin,src:c.pmic.basis},I:0.3,uv:null})));
  const regOf=n=>regs.find(g=>g.out===n);
  /* rail voltages (worst case) at a battery voltage; rising = power-up (start thresholds) else falling (stop thresholds) */
  function railsAt(vb,rising){const V={};const get=n=>{if(V[n]!=null)return V[n];if(batRails.includes(n)||/^(VIN|VIN_RAW|VBAT)$/i.test(n))return V[n]=Math.max(0,vb-revDrop(vb));
      const g=regOf(n);if(!g){const nm=railNom(n);return V[n]=nm!=null?nm:null;}V[n]=0;const vi=get(g.src)||0;let v;
      if(g.uv&&vi<(rising?g.uv.start:g.uv.stop))v=0;else if(g.t.vmin&&vi<g.t.vmin)v=0;
      else if(g.buck)v=Math.min(g.vout,Math.max(0,(vi-g.I*g.t.rds)*g.t.dmax));else v=Math.min(g.vout,Math.max(0,vi-g.t.do));return V[n]=+v.toFixed(3);};
    Object.keys(rails).forEach(get);return V;}
  const vbMin=(net,need,rising)=>{if(railsAt(40,rising)[net]==null||railsAt(40,rising)[net]<need-1e-9)return null;let lo=0,hi=40;for(let i=0;i<40;i++){const m=(lo+hi)/2;if(railsAt(m,rising)[net]>=need-1e-9)hi=m;else lo=m;}return+hi.toFixed(2);};
  // rails: lowest battery voltage that keeps each regulated rail in regulation (−1 % of nominal)
  const railRows=regs.map(g=>{const need=g.vout*0.99;const vb=vbMin(g.out,need,false);const at=railsAt(vop[0],false)[g.out],atC=railsAt(vcrank,false)[g.out];
    return{rail:g.out,ref:g.ref,mpn:g.mpn,src:g.src,kind:g.pmic?'PMIC':g.buck?'벅':'LDO',basis:g.t.src+(g.uv?` · EN 저전압 차단 정지 ${g.uv.stop} V / 재시작 ${g.uv.start} V`:''),vbMin:vb,atLow:at,atCrank:atC};});
  // ICs: their supply pins and minimums
  const cons=[];parts.filter(c=>/^U/.test(c.ref)&&!(c.ldo||c.buck||c.pmic)).forEach(c=>{let names={};try{const rec=lookup&&(lookup(c.mpn)||lookup(c.val));(rec&&rec.pins||[]).forEach(q=>{names[String(q.num)]=String(q.name||'');});}catch(e){}
    Object.assign(names,Object.fromEntries(Object.entries(c.pinNames||{}).filter(([n])=>!names[n])));
    CONS.filter(k=>k.re.test((c.mpn||'')+' '+c.val)).forEach(k=>{const nets=[...new Set(Object.entries(c.pins||{}).filter(([n,net])=>net&&k.pin.test(names[n]||'')).map(([,net])=>net))];
      nets.forEach(net=>{const nom=rails[net]?rails[net].v:railNom(net);const min=k.min(nom||0);cons.push({ref:c.ref,mpn:c.mpn||c.val,net,min,alt:k.alt,start:k.start,src:k.src,what:k.what});});});});
  const out=[];const add=(sev,code,msg,fix,extra)=>out.push(Object.assign({sev,code,msg,fix},extra||{}));
  // supply / ground pins: the generator's own pin names must match the datasheet record (a swapped supply pin shorts the rail)
  const AL={VO:'VOUT',OUT:'VOUT',OUTPUT:'VOUT',VI:'VIN',IN:'VIN',INPUT:'VIN'};const nrm=x=>{const t=String(x||'').toUpperCase().replace(/[~{}_\s]/g,'');return AL[t]||t;};
  parts.filter(c=>/^U/.test(c.ref)&&c.pinNames&&Object.keys(c.pinNames).length).forEach(c=>{let rec=null;try{rec=lookup&&(lookup(c.mpn)||lookup(c.val));}catch(e){}if(!rec||!rec.pins||!rec.pins.length)return;
    const T={};rec.pins.forEach(q=>{T[String(q.num)]=nrm(q.name);});const G=x=>/^(P|A|D)?GND$|^VSS|^EP$|^PAD$/.test(x),isG=n=>/^(A|D|P)?GND|^VSS/i.test(n||''),isR=n=>!!(rails[n]||railNom(n)!=null||/^(VIN|VBAT|VDD|VIN_RAW)/i.test(n||''));
    const bad=Object.entries(c.pinNames).filter(([n,nm])=>{const ds=T[n],net=(c.pins||{})[n];if(!ds||nrm(nm)===ds||!net)return false;
      return(G(ds)&&!isG(net))||(!G(ds)&&!/^(NC|DNC)$/.test(ds)&&isG(net)&&G(nrm(nm)))||(/^V(DD|CC|IN|S|BAT|SUP|BB|M)/.test(ds)&&!isR(net));});
    if(bad.length)add('err','pinmap',`${c.ref} ${c.mpn||c.val}: 생성 회로의 핀 배치가 데이터시트와 다름 — ${bad.map(([n,nm])=>`${n}번 회로 ${nm} / DS ${T[n]} (넷 ${(c.pins||{})[n]||'-'})`).join(' · ')}`,'데이터시트 핀 표대로 회로 블록의 핀 번호 수정 (전원 핀이 바뀌면 레일 단락)',{ref:c.ref});});
  {const bad=new Set(out.filter(f=>f.code==='pinmap').map(f=>f.ref));for(let i=cons.length-1;i>=0;i--)if(bad.has(cons[i].ref))cons.splice(i,1);}
  const lowV=railsAt(vop[0],false),crV=railsAt(vcrank,false);
  cons.forEach(x=>{x.vbMin=vbMin(x.net,x.min,false);x.vbStart=x.start?vbMin(x.net,x.start,true):null;x.atLow=lowV[x.net];x.atCrank=crV[x.net];
    x.crank=x.atCrank==null?'?':x.atCrank>=x.min?'동작':x.alt&&x.atCrank>=x.alt[0]?x.alt[1]:'정지';
    if(x.atLow!=null&&x.atLow<x.min)add('err','low_supply',`${x.ref} ${x.mpn} (${x.what}): 정상 최저 배터리 ${vop[0]} V(${vopSrc})에서 ${x.net} ${x.atLow} V < 최소 ${x.min} V — 정상 범위에서 동작 보장 안 됨`,'앞단 레귤레이터의 드롭아웃이 작은 부품으로, 또는 레일 구성 변경 (배터리 직결 저드롭아웃 LDO · 벅-부스트)',{ref:x.ref,net:x.net});});
  railRows.forEach(r=>{if(r.vbMin==null||r.vbMin>vop[0]){const users=cons.filter(x=>x.net===r.rail);
      add(users.some(x=>x.atLow<x.min)?'err':'warn','rail_low',`${r.rail} (${r.ref} ${r.mpn} ${r.kind}): 조정 유지에 배터리 ${r.vbMin==null?'— (도달 못함)':r.vbMin+' V'} 이상 필요 — 정상 최저 ${vop[0]} V에서 ${r.atLow} V (공칭 ${railNom(r.rail)||''} V)`,
        r.kind==='LDO'?`드롭아웃이 작은 LDO, 레일 전압을 낮추거나(예: 홀 센서 5 V 공급), 배터리 저하 시에도 유지해야 하면 벅-부스트/SEPIC`:'최대 듀티 · UVLO 확인, 필요하면 벅-부스트',{net:r.rail});}});
  // supervisor threshold vs the MCU's minimum supply on the same rail
  const sup=parts.find(c=>/TPS3823|TPS3828|TPS3890|TLF35584|감시 IC|리셋 IC/i.test((c.mpn||'')+' '+c.val+' '+(c.desc||''))&&/^U/.test(c.ref));
  let supRow=null;if(sup){const net=Object.values(sup.pins||{}).find(n=>rails[n]);let vit=null,vsrc='';try{const s=recText(sup,lookup);const m=s.match(/VIT[−-]?[^"]*",\s*"[^"]*?([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)\s*V/);if(m){vit=[+m[1],+m[2],+m[3]];vsrc=`${sup.mpn||sup.val} VIT− ${m[1]} / ${m[2]} / ${m[3]} V (DS)`;}}catch(e){}
    if(!vit&&/TPS3823-33/i.test(sup.mpn||sup.val)){vit=[2.84,2.93,3.0];vsrc='TPS3823-33 VIT− 2.84 / 2.93 / 3.00 V';}
    const mcu=cons.find(x=>x.what==='MCU'&&x.net===net);supRow={ref:sup.ref,mpn:sup.mpn||sup.val,net,vit,src:vsrc,mcu:mcu?{ref:mcu.ref,min:mcu.min}:null};
    if(vit&&mcu&&vit[0]<mcu.min)add('warn','sup_window',`${sup.ref} ${supRow.mpn} 리셋 임계 최소 ${vit[0]} V < ${mcu.ref} 최소 공급 ${mcu.min} V — ${net}가 ${vit[0]}–${mcu.min} V 사이면 MCU가 규격 밖에서 리셋 없이 동작`,`임계 최소가 ${mcu.min} V 이상인 감시 IC, 또는 MCU 내부 전원 감시(PORST · EVR 저전압 감지)가 이 구간을 덮는지 데이터시트로 확인`,{ref:sup.ref,net});
    if(vit&&mcu&&vit[2]>(railNom(net)||3.3)*0.95)add('warn','sup_high',`${sup.ref} 리셋 임계 최대 ${vit[2]} V가 ${net} 공칭의 95 % 초과 — 레일 공차로 오리셋 가능`,'레일 공차와 임계 확인',{ref:sup.ref,net});}
  // power-up order: rails by derivation depth, the power stage on the battery is live before the MCU leaves reset
  const depth=n=>{let d=0,g=regOf(n);const seen=new Set();while(g&&!seen.has(g.out)){seen.add(g.out);d++;g=regOf(g.src);}return d;};
  const order=Object.keys(rails).sort((a,b)=>depth(a)-depth(b)).map(n=>({rail:n,depth:depth(n),from:regOf(n)?regOf(n).src:'배터리',vbStart:regOf(n)?vbMin(n,regOf(n).vout*0.99,true):null}));
  const drvOnBat=cons.filter(x=>x.what==='게이트 드라이버'&&(batRails.includes(x.net)));
  const ifc=opt.iface;const unsafe=ifc?ifc.findings.filter(f=>f.code==='default_float'||f.code==='default_wrong'):null;
  if(drvOnBat.length&&unsafe&&unsafe.length)add('err','seq_unsafe',`게이트 드라이버 ${drvOnBat.map(x=>x.ref).join(' ')}는 배터리로 먼저 켜지는데 MCU 리셋 중 제어 입력 ${unsafe.map(f=>f.net).join(' · ')}가 안전 상태로 고정되지 않음`,'블록 간 인터페이스 점검의 풀 저항 (생성 때 자동 추가)',{net:unsafe[0].net});
  // input lockout: with the buck's EN lockout the logic rails stop together below the stop voltage (good); without it they brown out gradually
  const uvReg=regs.find(g=>g.uv);if(!uvReg&&regs.some(g=>g.buck&&batRails.includes(g.src)))add('info','no_uvlo',`입력 저전압 차단 없음 — 배터리가 내려가면 레일이 차례로 드롭아웃 (크랭킹 ${vcrank} V에서 아래 표 상태)`,'정해진 전압에서 깨끗하게 끄려면 pwr_in uvlo (예: 6 V 정지 / 7 V 재시작)');
  const n=k=>out.filter(f=>f.sev===k).length;
  return{vop,vopSrc,vcrank,crSrc,iin,rev:revSrc,rails:railRows,cons,sup:supRow,order,findings:out,err:n('err'),warn:n('warn'),low:lowV,crank:crV};}
const SEV={err:'✕',warn:'△',info:'·'};
function text(S){const L=[`전원 시퀀싱 · 크랭킹 (정상 최저 ${S.vop[0]} V ${S.vopSrc} · 크랭킹 ${S.vcrank} V ${S.crSrc}): 오류 ${S.err} · 확인 ${S.warn}`,`  입력 경로: ${S.rev} · 입력 전류 ${S.iin} A`];
  S.rails.forEach(r=>L.push(`  레일 ${r.rail} (${r.kind} ${r.mpn}): 유지 최저 배터리 ${r.vbMin==null?'—':r.vbMin+' V'} · ${S.vop[0]} V에서 ${r.atLow} V · 크랭킹 ${r.atCrank} V`));
  S.cons.forEach(x=>L.push(`  ${x.ref} ${x.what} (${x.net} ≥ ${x.min} V): 동작 최저 배터리 ${x.vbMin==null?'—':x.vbMin+' V'}${x.vbStart?` · 기동 ${x.vbStart} V`:''} · 크랭킹 중 ${x.crank}`));
  S.findings.forEach(f=>L.push(`${SEV[f.sev]} ${f.msg}\n   → ${f.fix}`));return L.join('\n');}
return{run,text,REG,CONS};
})();
if(typeof module!=='undefined')module.exports=PWRSEQ;
