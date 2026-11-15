/* ---------- capacitors: voltage derating, transient withstand, DC bias, temperature range, part number vs footprint ----------
   Runs on generated parts or a board. The rating, dielectric, size and tolerance come from the part number (Samsung CL ·
   Murata GRM/GCM/GCJ · TDK C/CGA · Panasonic EEE-F aluminium); a capacitor without a decodable part number is listed as
   "정격 미확인". The voltage across each capacitor is worked out from its nets:
     battery-side nets  steady = requirement VBAT max (default 16 V) · transient = jump start 24 V (ISO 16750-2, 12 V system)
                        or the suppressed load dump 35 V when the input TVS is the load-dump one
     regulated rails    nominal + 5 %
     gate-drive nodes   (GVDD / VREG / charge pump / bootstrap) the driver's datasheet limit
     connector signals  short to battery (transient) · the connector's highest supply (steady)
     other signals      ≤ 5 V (assumption)
   Limits (common automotive derating practice): class II MLCC steady ≤ 50 % of rating (≤ 80 % = check), class I and
   aluminium ≤ 80 %; every transient ≤ the rating (≥ 90 % = no margin). Effective capacitance in the worst case
   = nominal × DC bias × (1 − tolerance) × (1 − temperature coefficient) × (1 − ageing). The DC bias curve is an
   approximation from the part's volume and capacitance (±30 %) — confirm with the maker's curve. */
const CAPCHECK=(function(){
"use strict";
const SAM_SIZE={'05':'0402','10':'0603','21':'0805','31':'1206','32':'1210','43':'1812'};
const MUR_SIZE={'15':'0402','18':'0603','21':'0805','31':'1206','32':'1210','43':'1812'};
const TDK_SIZE={'2':'0402','3':'0603','4':'0805','5':'1206','6':'1210','7':'1808','8':'1812'};
const TDK_MM={'1005':'0402','1608':'0603','2012':'0805','3216':'1206','3225':'1210','4532':'1812'};
const SAM_V={R:4,Q:6.3,P:10,O:16,A:25,L:35,B:50,C:100,D:200,E:250};
const SAM_D={A:'X5R',B:'X7R',C:'C0G',F:'Y5V'};
const VCODE={'0G':4,'0J':6.3,'1A':10,'1C':16,'1E':25,'1V':35,'1H':50,'1J':63,'2A':100};
const MUR_D={R6:'X5R',R7:'X7R',C7:'X7S',C8:'X6S',D7:'X7T',L8:'X8L',R9:'X8R','5C':'C0G',C6:'X5S'};
const TOL={B:0.1e-12,C:0.25e-12,D:0.5,F:1,G:2,J:5,K:10,M:20,Z:80};
/* dielectric: max temperature, capacitance change over its range, class */
const DIEL={X5R:{t:85,tc:0.15,cl:2},X5S:{t:85,tc:0.22,cl:2},X6S:{t:105,tc:0.22,cl:2},X7R:{t:125,tc:0.15,cl:2},X7S:{t:125,tc:0.22,cl:2},X7T:{t:125,tc:0.33,cl:2},
  X8R:{t:150,tc:0.15,cl:2},X8L:{t:150,tc:0.40,cl:2},Y5V:{t:85,tc:0.82,cl:2},C0G:{t:125,tc:0,cl:1},ALU:{t:105,tc:0.10,cl:0}};
const VOL={'0402':0.25,'0603':1.02,'0805':3.1,'1206':8.2,'1210':20,'1808':16,'1812':40};
const code3=s=>{s=String(s);if(/R/.test(s))return parseFloat(s.replace('R','.'))*1e-12;return+s.slice(0,2)*Math.pow(10,+s[2])*1e-12;};
/* part number → {mfr, size, diel, vr, c, tol} (null when the series is not known) */
function decode(mpn){const m0=String(mpn||'').toUpperCase().replace(/\s/g,'');let m;
  if((m=m0.match(/^CL(05|10|21|31|32|43)([A-Z])(\d{3}|\dR\d)([A-Z])([A-Z])/)))return{mfr:'Samsung',size:SAM_SIZE[m[1]],diel:SAM_D[m[2]]||null,c:code3(m[3]),tol:TOL[m[4]]||10,vr:SAM_V[m[5]]||null};
  if((m=m0.match(/^G(?:RM|CM|CJ|CB|RT|CQ)(\d{2})\w(\w{2})(\d[A-Z])(\d{3}|\dR\d)([A-Z])/)))return{mfr:'Murata',size:MUR_SIZE[m[1]],diel:MUR_D[m[2]]||null,vr:VCODE[m[3]]||null,c:code3(m[4]),tol:TOL[m[5]]||10};
  if((m=m0.match(/^CGA(\d)[A-Z]\d(X\d[A-Z]|C0G|NP0)(\d[A-Z])(\d{3}|\dR\d)([A-Z])/)))return{mfr:'TDK',size:TDK_SIZE[m[1]],diel:m[2]==='NP0'?'C0G':m[2],vr:VCODE[m[3]]||null,c:code3(m[4]),tol:TOL[m[5]]||10};
  if((m=m0.match(/^C(1005|1608|2012|3216|3225|4532)(X\d[A-Z]|C0G|NP0)(\d[A-Z])(\d{3}|\dR\d)([A-Z])/)))return{mfr:'TDK',size:TDK_MM[m[1]],diel:m[2]==='NP0'?'C0G':m[2],vr:VCODE[m[3]]||null,c:code3(m[4]),tol:TOL[m[5]]||10};
  if((m=m0.match(/^EEE-?F[A-Z]{1,2}(\d[A-Z])(\d{3})/)))return{mfr:'Panasonic',size:null,diel:'ALU',vr:VCODE[m[1]]||null,c:+m[2].slice(0,2)*Math.pow(10,+m[2][2])*1e-6,tol:20};
  return null;}
/* fraction of the capacitance left at a DC voltage (class II MLCC; approximation from volume and capacitance) */
function dcBias(d,V){if(!d||!DIEL[d.diel]||DIEL[d.diel].cl!==2||!d.size||!VOL[d.size]||!d.c||!d.vr)return 1;
  const uF=d.c*1e6,V0=Math.max(10*Math.sqrt(VOL[d.size]/uF),0.4*d.vr);return 1/(1+Math.pow(Math.max(V,0)/V0,1.3));}
/* gate-drive / switcher nodes: the voltage across a capacitor on one of these pins (datasheet records) */
const NODE=[
  {key:'DRV8334',re:/^(GVDD|VCP|CPH|CPL|CPTH|CPTL|BST[A-C])$/i,v:18,src:'DRV8334-Q1 GVDD 절대 최대 18 V (조정값 기록 없음 — 상한으로)'},
  {key:'A4911',re:/^(VREG|CP1|CP2|C[ABC])$/i,v:11.7,src:'A4911 VREG 최대 11.7 V (VRG = 1, 권장 동작 조건)'},
  {key:'TPS54331',re:/^BOOT$/i,v:8,src:'TPS54331 BOOT–PH 절대 최대 8 V'}];
const isGnd=n=>/^(A|D|P)?GND|^VSS|^0V$/i.test(n||'');
const railV=n=>{const m=String(n||'').match(/^\+(\d+)V(\d*)$/);return m?+(m[1]+(m[2]?'.'+m[2]:'')):null;};
const capVal=v=>{const m=String(v||'').replace(/\s/g,'').match(/^([\d.]+)(p|n|µ|u|m)?F/);return m?+m[1]*({p:1e-12,n:1e-9,'µ':1e-6,u:1e-6,m:1e-3}[m[2]]||1):null;};
const fmtC=c=>c>=1e-6?+(c*1e6).toPrecision(3)+' µF':c>=1e-9?+(c*1e9).toPrecision(3)+' nF':+(c*1e12).toPrecision(3)+' pF';
const STORE=/벌크|입력 커패시터|출력 커패시터|저장|GVDD|VREG|CPVDD|CVDRAIN|부트스트랩|차지\s?펌프|CVCP|FLY|디커플링 10|LDO/;
/* pin names: the datasheet record (NEWPROJ.partLookup) first, then the part's own pin names */
function norm(B,lookup){lookup=lookup||(typeof NEWPROJ!=='undefined'&&NEWPROJ.partLookup)||null;return(B.comps||B.parts||[]).map(c=>{let T={};
  if(lookup&&/^U\d/i.test(c.ref)){try{const rec=lookup(c.mpn)||lookup(c.val);(rec&&rec.pins||[]).forEach(q=>{T[String(q.num)]=String(q.name||'');});}catch(e){}}
  const nm=n=>T[String(n)]||(c.pinNames||c.pn||{})[n]||'';
  const pads=c.pads?c.pads.map(p=>({n:p.n,net:p.net||null,fn:T[String(p.n)]||p.fn||nm(p.n)})):Object.entries(c.pins||{}).map(([n,net])=>({n,net:net||null,fn:nm(n)}));return{ref:c.ref,val:c.val||c.value,fp:c.fp||c.footprint||'',mpn:c.mpn||'',desc:c.desc||c.description||'',pads,src:c};});}
/* opt: vbat (steady max), vin (nominal system voltage), loaddump (bool), bat (extra battery-side net names), rails {net: V}, Tmax */
function run(B,opt){opt=opt||{};const comps=norm(B,opt.lookup);const vin=+opt.vin||12;const vbat=+opt.vbat||(vin>16?32:16);
  const jump=vin<=16?24:Math.round(vbat*1.5);const ld=opt.loaddump?(vin<=16?35:58):0;const vtrB=Math.max(jump,ld,vbat);
  const trSrc=ld?`로드덤프(중앙 억제) ${ld} V · ISO 16750-2`:vin<=16?'점프 스타트 24 V · ISO 16750-2':`과도 ${jump} V (가정 1.5 × VBAT)`;
  const Tmax=opt.Tmax!=null?+opt.Tmax:125;const tSrc=opt.tSrc||(opt.Tmax!=null?'요구사항':'기본값 (차량용)');
  const bat=new Set(opt.bat||[]);const rails=opt.rails||{};
  const isBat=n=>bat.has(n)||/^(VIN|VIN_RAW|VIN_PG|VBAT|KL30|VBB|PVDD|VM)$/i.test(n||'')||(railV(n)!=null&&railV(n)>=9&&Math.abs(railV(n)-vin)<0.6);
  const conn=comps.filter(c=>/^J\d/i.test(c.ref));const onConn=n=>conn.find(j=>j.pads.some(p=>p.net===n));
  const ics=comps.filter(c=>/^U\d/i.test(c.ref));
  const nodeOf=n=>{for(const u of ics){const p=u.pads.find(q=>q.net===n);if(!p)continue;const k=NODE.find(x=>(String(u.val)+' '+u.mpn).toUpperCase().includes(x.key)&&x.re.test(p.fn));if(k)return k;}return null;};
  const netV=n=>{if(!n||isGnd(n))return{vop:0,vtr:0,src:'GND'};
    if(isBat(n))return{vop:vbat,vtr:vtrB,src:`배터리 측 — 정상 최대 ${vbat} V · ${trSrc}`,bat:true};
    const r=rails[n]!=null?rails[n]:railV(n);if(r!=null){const v=+(r*1.05).toFixed(2);return{vop:v,vtr:v,src:`레일 ${r} V + 5 %`};}
    const j=onConn(n);if(j){const sup=Math.max(5,...j.pads.map(p=>p.net).filter(x=>x&&!isBat(x)).map(x=>rails[x]!=null?rails[x]:railV(x)||0));return{vop:sup,vtr:vtrB,src:`${j.ref} 커넥터 신호 — 정상 ≤ ${sup} V · 배터리 단락 ${vtrB} V`};}
    if(/^VDD/i.test(n))return{vop:5,vtr:5,src:'MCU 내부 레일 (≤ 5 V 가정)'};
    return{vop:5,vtr:5,src:'신호 (≤ 5 V 가정)'};};
  const rows=[],out=[];
  comps.filter(c=>/^C(P)?\d/i.test(c.ref)&&c.pads.length===2).forEach(c=>{const[a,b]=c.pads.map(p=>p.net);const d=decode(c.mpn);const cN=capVal(c.val);
    // voltage across: gate-drive node on either side → the driver limit; otherwise the larger side (one side GND → that net)
    const nd=nodeOf(a)||nodeOf(b);let V;if(nd)V={vop:nd.v,vtr:nd.v,src:nd.src};else{const A=netV(a),Bv=netV(b);V=isGnd(a)?Bv:isGnd(b)?A:(A.vtr>=Bv.vtr?A:Bv);if(!isGnd(a)&&!isGnd(b)&&!nd&&/부트스트랩/.test(c.desc))V={vop:15,vtr:15,src:'부트스트랩 (게이트 전원 ≤ 15 V 가정)'};}
    const row={ref:c.ref,val:c.val,fp:c.fp,mpn:c.mpn,nets:[a,b],desc:c.desc,vop:V.vop,vtr:V.vtr,vsrc:V.src,d,issues:[]};rows.push(row);
    const add=(sev,code,msg,fix)=>{const f={sev,code,ref:c.ref,net:isGnd(a)?b:a,msg:`${c.ref} ${c.val}${c.mpn?' '+c.mpn:''}: ${msg}`,fix};out.push(f);row.issues.push(f);};
    if(!d||!d.vr){row.status='na';if(!c.mpn)add('info','no_rating','품번 없음 — 정격 전압 · 유전체 미확인','정격 전압 · 유전체가 정해진 품번 지정');else add('info','no_rating',`품번 체계를 몰라 정격 미확인 (${c.mpn})`,'데이터시트로 정격 전압 확인');return;}
    const D=DIEL[d.diel]||null,cl2=!D||D.cl===2,lim=cl2?0.5:0.8,hard=cl2?0.8:0.9;const k=V.vop/d.vr;row.vr=d.vr;row.ratio=+k.toFixed(2);
    if(V.vtr>d.vr)add('err','over',`과도 ${V.vtr} V > 정격 ${d.vr} V (${V.src})`,`정격 ${need(V,cl2)} V 이상 품번으로`);
    else if(k>hard)add('err','derate',`정상 최대 ${V.vop} V = 정격 ${d.vr} V의 ${Math.round(k*100)} % (${cl2?'MLCC 2종':'1종 · 전해'} 한도 ${Math.round(lim*100)} %)`,`정격 ${need(V,cl2)} V 이상 품번으로`);
    else if(k>lim)add('warn','derate',`정상 최대 ${V.vop} V = 정격 ${d.vr} V의 ${Math.round(k*100)} % (권장 ≤ ${Math.round(lim*100)} %)`,`정격 ${need(V,cl2)} V 이상 품번으로`);
    else if(V.vtr>0.9*d.vr)add('warn','margin',`과도 ${V.vtr} V가 정격 ${d.vr} V의 ${Math.round(V.vtr/d.vr*100)} % — 여유 10 % 미만 (${V.src})`,`정격 ${need(V,cl2)} V 이상 품번으로`);
    if(D&&Tmax>D.t)add('warn','temp',`${d.diel==='ALU'?'알루미늄 전해':d.diel} 정격 온도 ${D.t} °C < 동작 온도 상한 ${Tmax} °C (${tSrc})`,d.diel==='ALU'?`${Tmax} °C 정격 차량용 전해(하이브리드 폴리머 등)로 하거나, 부품 위치 온도로 수명 계산 (10 °C마다 수명 ½)`:`${Tmax<=125?'X7R · X7S':'X8R'} 유전체 품번으로`);
    if(d.size&&/^(0402|0603|0805|1206|1210|1812)$/.test(c.fp)&&d.size!==c.fp)add('warn','pkg',`품번 크기 ${d.size} ≠ 풋프린트 ${c.fp}`,`풋프린트를 ${d.size}로 하거나 ${c.fp} 크기 품번으로`);
    if(cN&&d.c&&Math.abs(d.c-cN)/cN>0.05)add('warn','value',`품번 용량 ${fmtC(d.c)} ≠ 회로 값 ${c.val}`,'품번 또는 값을 맞춤');
    const cb=dcBias(d,V.vop),tol=(d.tol||10)/100,tc=D?D.tc:0.15,age=cl2?0.05:0;const eff=cb*(1-tol)*(1-tc)*(1-age);
    row.dcb=+cb.toFixed(2);row.effMin=(cN||d.c)*eff;row.effRatio=+eff.toFixed(2);
    if(cl2&&STORE.test(c.desc)&&cb<0.5)add('warn','dcbias',`최악 실효 용량 ${fmtC(row.effMin)} (공칭의 ${Math.round(eff*100)} % — DC 바이어스 ${Math.round((1-cb)*100)} % 감소 @ ${V.vop} V · 공차 ${Math.round(tol*100)} % · 온도 ${Math.round(tc*100)} % · 노화 5 %)`,'정격 전압이 높거나 큰 패키지 품번, 또는 병렬 추가 — 제조사 DC 바이어스 곡선으로 확인');
    row.status=row.issues.some(f=>f.sev==='err')?'err':row.issues.some(f=>f.sev==='warn')?'warn':'ok';});
  const n=k=>out.filter(f=>f.sev===k).length;
  return{rows,findings:out,err:n('err'),warn:n('warn'),info:n('info'),vbat,vtr:vtrB,trSrc,Tmax,tSrc};}
function need(V,cl2){const x=Math.max(V.vop/(cl2?0.5:0.8),V.vtr/0.9);return[6.3,10,16,25,35,50,63,100].find(v=>v>=x)||100;}
/* known orderable parts for the generator's fixes: [mpn, value, footprint] (rating, dielectric from the part number) */
const ALT=[['CGA6P3X7S1H106K250AB','10µF','1210'],['CGA6M3X7R1H225K200AB','2.2µF','1210'],['CGA3E3X7R1H105K080AB','1µF','0603'],['GCM21BR71A106KE22L','10µF','0805'],
  ['GCM32EC71E226KE36L','22µF','1210'],['GCM188R71H104KA57D','100nF','0603'],['GCM188R71C474KA55D','470nF','0603'],['CGA4J3X7R1H474K125AB','470nF','0805'],['CL10B104KB8NNNC','100nF','0603'],['CL05B104KO5NNNC','100nF','0402'],
  ['CL10B103KB8NNNC','10nF','0603'],['CL10B102KB8NNNC','1nF','0603'],['CL10B683KB8NNNC','68nF','0603'],['CL10B472KB8NNNC','4.7nF','0603'],['CL10B332KB8NNNC','3.3nF','0603'],
  ['CL05B102KB5NNNC','1nF','0402'],['CL05B103KB5NNNC','10nF','0402'],['CL05C470JB5NNNC','47pF','0402'],['CL05C120JB5NNNC','12pF','0402'],['EEE-FK1V471SP','470µF','CP-SMD-10x10']];
const AREA={'0402':0.5,'0603':1.28,'0805':2.5,'1206':5.12,'1210':8,'CP-SMD-10x10':100};
/* generator fix on the part list (in place): pick a known part of the same value that passes, same footprint first, then the
   smallest; a 22 µF that has none becomes two 10 µF 50 V in parallel. Returns the changes. */
function fix(parts,opt,addPart){const R=run({parts},opt);const ch=[];
  R.rows.filter(r=>r.status==='err'||r.status==='warn').forEach(r=>{const c=parts.find(p=>p.ref===r.ref);if(!c)return;const codes=r.issues.map(f=>f.code);
    if(!codes.some(x=>/over|derate|margin|temp|pkg|value/.test(x)))return;
    const t0=r.d&&DIEL[r.d.diel]?DIEL[r.d.diel].t:0;
    const ok=m=>{const d=decode(m[0]),D=DIEL[d.diel],cl2=D.cl===2;return r.vtr<=0.9*d.vr&&r.vop/d.vr<=(cl2?0.5:0.8)&&D.t>=(D.cl===0?Math.min(R.Tmax,t0):R.Tmax);};
    const cand=ALT.filter(m=>m[1]===c.val&&ok(m)).sort((x,y)=>(x[2]!==c.fp)-(y[2]!==c.fp)||(AREA[x[2]]||9)-(AREA[y[2]]||9));
    const was=`${c.val} ${c.fp} ${c.mpn||'-'}`;
    if(cand.length&&cand[0][0]!==c.mpn){const m=cand[0];c.mpn=m[0];c.fp=m[2];const d=decode(m[0]);c.desc=(c.desc||'')+` (커패시터 점검: ${d.vr} V ${d.diel})`;ch.push({ref:c.ref,from:was,to:`${c.val} ${m[2]} ${m[0]}`,why:r.issues.map(f=>f.code).join(',')});return;}
    if(c.val==='22µF'&&addPart){const m=ALT[0];if(!ok(m))return;const d=decode(m[0]);c.val='10µF';c.mpn=m[0];c.fp=m[2];const base=c.desc||'';c.desc=base+` (커패시터 점검: 22 µF ${r.d?r.d.vr+' V':''} → 10 µF ${d.vr} V ${d.diel} × 2 병렬)`;
      const np=addPart('C','10µF',m[2],Object.assign({},c.pins),{mpn:m[0],desc:base+` (커패시터 점검: 22 µF → 10 µF ${d.vr} V × 2 병렬의 두 번째)`});if(np&&c.block)np.block=c.block;
      ch.push({ref:c.ref,from:was,to:`10µF ${m[2]} ${m[0]} × 2`,why:r.issues.map(f=>f.code).join(','),added:np?np.ref:null});return;}
    // a part number whose size disagrees with the footprint: the footprint follows the ordered part
    if(codes.includes('pkg')&&r.d&&r.d.size){c.fp=r.d.size;ch.push({ref:c.ref,from:was,to:`${c.val} ${r.d.size} ${c.mpn}`,why:'pkg'});}});
  return ch;}
const SEV={err:'✕',warn:'△',info:'·'};
function text(R){const L=[`커패시터 정격 · DC 바이어스 (배터리 정상 ${R.vbat} V · 과도 ${R.vtr} V ${R.trSrc} · 상한 ${R.Tmax} °C): ${R.rows.length}개 — 오류 ${R.err} · 확인 ${R.warn}`];
  R.findings.filter(f=>f.sev!=='info').forEach(f=>L.push(`${SEV[f.sev]} ${f.msg}\n   → ${f.fix}`));const na=R.findings.filter(f=>f.code==='no_rating');if(na.length)L.push(`· 정격 미확인 ${na.length}개 (${na.map(f=>f.ref).join(' ')})`);return L.join('\n');}
return{decode,dcBias,run,fix,text,ALT,DIEL,NODE};
})();
if(typeof module!=='undefined')module.exports=CAPCHECK;
