/* Protective housing (enclosure) design for the loaded board.
   From the board (outline, mounting holes, connectors at the edge, part heights, heat sources) and the environment
   (heat load W, IP rating, vibration Grms, ambient and limit temperature) it sizes an enclosure for every candidate
   material, then picks the cheapest one that keeps the thermal margin, the IP rating and the vibration safety:
   - thermal: surface convection + radiation (iterated), wall conduction, internal air film, TIM pedestals on hot parts,
     optional fins; internal air and hot-part case temperatures, thermal margin to the limit
   - sealing by IP code (gasket / O-ring / FIPG, breather vent, screw pitch for even gasket compression)
   - vibration: PCB first mode (Steinberg plate on its supports), 3σ deflection under a flat PSD vs Steinberg's allowable
     for the largest package; centre supports are added until the safety factor is ≥ 2
   - mass and a relative unit-cost index per candidate
   Geometry is in board coordinates (mm, board bottom-left = 0,0, board mid-plane z = 0) for the 3D view and exports. */
const HOUSING=(function(){
"use strict";
const SIG=5.670e-8;
const MATS={
  pcabs:{epsIn:0.9,label:'PC/ABS 사출 (UL94 V-0)',short:'PC/ABS',k:0.2,rho:1150,eps:0.9,t0:2.5,costKg:3.2,proc:1.0,maxIP:67,maxVib:8,metal:false,proc_label:'사출'},
  pa66gf:{epsIn:0.9,label:'PA66-GF30 사출',short:'PA66-GF30',k:0.35,rho:1360,eps:0.9,t0:2.2,costKg:4.6,proc:1.1,maxIP:69,maxVib:14,metal:false,proc_label:'사출'},
  spcc:{epsIn:0.8,label:'SPCC 판금 (도장)',short:'SPCC 판금',k:50,rho:7850,eps:0.85,t0:1.2,costKg:1.6,proc:1.6,maxIP:54,maxVib:20,metal:true,proc_label:'판금 절곡'},
  a6063:{epsIn:0.8,label:'알루미늄 압출 A6063 (아노다이징) + 엔드캡',short:'A6063 압출',k:180,rho:2700,eps:0.85,t0:2.0,costKg:4.2,proc:1.35,maxIP:67,maxVib:20,metal:true,proc_label:'압출 + 절단·가공'},
  adc12:{epsIn:0.3,label:'알루미늄 다이캐스팅 (ADC12)',short:'ADC12 다이캐스팅',k:96,rho:2700,eps:0.85,t0:2.5,costKg:3.6,proc:1.5,maxIP:69,maxVib:20,metal:true,proc_label:'다이캐스팅'},
  az91d:{epsIn:0.4,label:'마그네슘 다이캐스팅 (AZ91D, 화성 처리)',short:'AZ91D 다이캐스팅',k:73,rho:1810,eps:0.85,t0:2.0,costKg:6.5,proc:1.8,maxIP:69,maxVib:20,metal:true,proc_label:'다이캐스팅 + 방식 처리'}};
const IPS=['IP20','IP40','IP54','IP65','IP67','IP69K'];
const IPN={IP20:20,IP40:40,IP54:54,IP65:65,IP67:67,IP69K:69};
const ipKey=v=>{const s=String(v==null?'':v).toUpperCase().replace(/\s/g,'');if(IPN[s])return s;if(IPN['IP'+s])return'IP'+s;const n=parseInt(s.replace(/^IP/,''),10);if(!isFinite(n))return null;return IPS.slice().reverse().find(k=>IPN[k]<=n)||'IP20';};
const SEAL={
  IP20:{label:'씰 없음 · 통풍 슬롯 허용',gasket:'없음',vent:'통풍 슬롯 (대류 냉각)',pitch:90,cost:0,slots:true},
  IP40:{label:'커버 밀폐 · 1 mm 이상 이물 차단',gasket:'없음 (정밀 맞춤)',vent:'없음',pitch:80,cost:0.1},
  IP54:{label:'발포 / TPE 개스킷',gasket:'EPDM 발포 개스킷 3 × 2 mm',vent:'미로형 배수 구조',pitch:70,cost:0.4},
  IP65:{label:'실리콘 O-링 / FIPG 액상 개스킷',gasket:'실리콘 O-링 Ø2.0 (압축 25%)',vent:'없음 (온도 변화 크면 벤트 권장)',pitch:60,cost:0.8,groove:true},
  IP67:{label:'실리콘 O-링 / FIPG 액상 개스킷 + 벤트 필터',gasket:'실리콘 O-링 Ø2.0 (압축 25%)',vent:'ePTFE 벤트 필터 (Breather Vent) 필수',pitch:50,cost:1.6,groove:true,breather:true},
  IP69K:{label:'FKM/EPDM O-링 + 고온 고압 세척 대응 벤트',gasket:'FKM O-링 Ø2.4 (압축 25%)',vent:'고압 세척용 보호 캡 ePTFE 벤트 필수',pitch:40,cost:2.6,groove:true,breather:true,extraWall:0.3}};
const isConn=c=>/^(J|P|CN|X|USB|CON)\d/i.test(c.ref)||/^(usb|hdr|conn)$/.test(c.kind||'');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---- what the board needs from a housing ---- */
function boardNeeds(B,opts){
  opts=opts||{};const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const bb=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  const comps=B.comps.filter(c=>c.kind!=='none'&&c.body);
  const htTop=Math.max(0,...comps.filter(c=>c.side!=='B').map(c=>c.body.ht||0)),htBot=Math.max(0,...comps.filter(c=>c.side==='B').map(c=>c.body.ht||0));
  const holes=B.drills.filter(d=>!d.plated&&!d.own&&!d._pad&&d.d>=2).map(d=>({x:d.x,y:d.y,d:d.d}));
  // connectors at an edge need a wall opening on that side
  const cuts=[];comps.filter(isConn).forEach(c=>{const b=c.bb;const ds=[['W',b[0]-bb[0]],['E',bb[2]-b[2]],['S',b[1]-bb[1]],['N',bb[3]-b[3]]].sort((x,y)=>x[1]-y[1]);const[side,d]=ds[0];
    if(d>4)return;const along=side==='W'||side==='E'?[b[1],b[3]]:[b[0],b[2]];const z0=c.side==='B'?-B.t/2-(c.body.ht||3):B.t/2;const z1=c.side==='B'?-B.t/2:B.t/2+(c.body.ht||3);
    cuts.push({ref:c.ref,side,a:along[0]-0.6,b:along[1]+0.6,z0:z0-0.4,z1:z1+0.6,val:c.val});});
  // heat sources: given power or typical figures
  let P=opts.power;if(!P&&typeof AUTOPLACE!=='undefined'){P={};AUTOPLACE.classify(B,{}).list.forEach(o=>{if(o.P>0)P[o.ref]=o.P;});}
  const hot=Object.entries(P||{}).map(([ref,w])=>({ref,P:+w,c:B.byRef[ref]})).filter(h=>h.c&&h.P>0).sort((a,b)=>b.P-a.P);
  // the biggest package decides the vibration allowable (leadless parts are the most fragile)
  const ics=comps.filter(c=>c.pads.length>=8&&!isConn(c)).map(c=>({ref:c.ref,L:Math.max(c.body.w,c.body.h),leadless:/QFN|BGA|LGA|DFN|SON/i.test(c.fp||''),fp:c.fp})).sort((a,b)=>b.L-a.L);
  const compMass=comps.reduce((s,c)=>s+c.body.w*c.body.h*Math.max(0.3,c.body.ht||0.5)*1e-3*(isConn(c)?0.9:1.6)*0.6,0); // g
  return{bb,W:bb[2]-bb[0],H:bb[3]-bb[1],t:B.t||1.6,htTop,htBot,holes,cuts,hot,Ptot:hot.reduce((s,h)=>s+h.P,0),big:ics[0]||null,compMass};
}

/* ---- PCB vibration (Steinberg) ---- */
function pcbVibration(N,supports,grms){
  // largest unsupported rectangle between supports (mounting holes, centre supports) — or the board edges when there are none
  const xs=[N.bb[0],...supports.map(s=>s.x),N.bb[2]].sort((a,b)=>a-b),ys=[N.bb[1],...supports.map(s=>s.y),N.bb[3]].sort((a,b)=>a-b);
  const gap=v=>{let m=0;for(let i=1;i<v.length;i++)m=Math.max(m,v[i]-v[i-1]);return m;};
  const a=Math.max(10,supports.length>=4?gap(xs):N.W)/1000,b=Math.max(10,supports.length>=4?gap(ys):N.H)/1000,h=N.t/1000;
  const E=18.6e9,nu=0.13,D=E*h*h*h/(12*(1-nu*nu));const area=N.W*N.H*1e-6;const w=(1850*h*area+N.compMass*1e-3)/area; // kg/m²
  const fn=0.65*(Math.PI/2)*Math.sqrt(D/w)*(1/(a*a)+1/(b*b)); // point supports ≈ 0.65 × simply supported
  const psd=grms*grms/1980;const Q=Math.sqrt(fn);const gout=Math.sqrt(Math.PI/2*fn*Q*psd);
  const z3=3*9.81*gout/Math.pow(2*Math.PI*fn,2)*1000; // mm
  const big=N.big||{L:5,leadless:true,ref:'-'};const B_in=Math.max(a,b)*1000/25.4,L_in=big.L/25.4,h_in=N.t/25.4,c=big.leadless?2.25:1.0;
  const zAllow=0.00022*B_in/(c*h_in*1*Math.sqrt(L_in))*25.4; // mm
  return{fn,gout,z3,zAllow,sf:grms>0?zAllow/Math.max(1e-9,z3):99,span:[a*1000,b*1000],part:big.ref,leadless:big.leadless};
}

/* ---- thermal ---- */
function thermal(m,geo,inp,N,fins){
  const Ao=2*(geo.Lo*geo.Wo+geo.Lo*geo.Ho+geo.Wo*geo.Ho)*1e-6;const Ai=2*(geo.Li*geo.Wi+geo.Li*geo.Hi+geo.Wi*geo.Hi)*1e-6;
  const finA=fins?fins.area*1e-6*0.75:0; // fin efficiency ≈ 0.75
  const Aeff=Ao+finA,P=inp.P,Ta=inp.ta;
  let Ts=Ta+10;for(let i=0;i<40;i++){const T1=Ts+273.15,T0=Ta+273.15;const hr=m.eps*SIG*(T1*T1+T0*T0)*(T1+T0);const hc=1.42*Math.pow(Math.max(0.1,Ts-Ta)/Math.max(0.03,geo.Ho/1000),0.25)*0.85;const h=hc+hr;const n=Ta+P/(h*Aeff);if(Math.abs(n-Ts)<0.01){Ts=n;break;}Ts=0.5*(Ts+n);}
  const Rwall=geo.t/1000/(m.k*Ao);const Twin=Ts+P*Rwall;
  // heat that leaves the hot parts through TIM pedestals (metal only) skips the internal air
  let Ptim=0;const peds=[];const kTim=3.0,blt=1.0;
  if(m.metal&&inp.tim!==false)N.hot.forEach(hp=>{if(hp.P<0.25||hp.c.side==='B')return;const A=Math.max(4,hp.c.body.w*hp.c.body.h)*1e-6;const R=blt/1000/(kTim*A)+0.8;const share=0.7;Ptim+=hp.P*share;peds.push({ref:hp.ref,P:hp.P,R,share});});
  // the board is the heat source: convection + radiation to the inner walls, plus conduction through the supports
  const Apcb=2*N.W*N.H*1e-6,epsE=1/(1/0.9+1/m.epsIn-1);const Tm=(Twin+30)+273.15;const hi=(inp.slots?7:4.5)+epsE*4*SIG*Tm*Tm*Tm;
  const gBoss=Math.min(0.25,m.k*38.5e-6/Math.max(0.002,geo.stand/1000));const G=hi*Apcb+gBoss*N.nsup;
  const Tboard=Twin+(P-Ptim)/G;const Tair=(Tboard+Twin)/2;
  peds.forEach(p=>{p.Tcase=Twin+p.P*p.share*p.R;});
  const margin=(inp.tmax-Tboard)/Math.max(1,inp.tmax-Ta);
  return{Ts,Twin,Tair,Tboard,margin,Ptim,peds,Ao,Ai,Rwall,finA,G};
}

/* ---- one candidate material ---- */
function design(B,inp,matKey,N){
  const m=MATS[matKey];const ip=ipKey(inp.ip)||'IP54';const S=SEAL[ip];
  const gap=1.5;const t=Math.round((m.t0+0.05*inp.vib+0.002*Math.max(N.W,N.H)+(S.extraWall||0))*10)/10;
  const stand=Math.max(4,Math.ceil(N.htBot+2));const top=Math.max(3,Math.ceil(N.htTop+2.5));
  const rim=S.groove?Math.max(t,4.6):t; // a groove for the O-ring needs ~4.6 mm of flange
  const geo={t,gap,stand,top,rim,Li:N.W+2*gap,Wi:N.H+2*gap,Hi:stand+N.t+top};geo.Lo=geo.Li+2*rim;geo.Wo=geo.Wi+2*rim;geo.Ho=geo.Hi+2*t;
  geo.x0=N.bb[0]-gap-rim;geo.y0=N.bb[1]-gap-rim;geo.zFloor=-N.t/2-stand;geo.zLid=N.t/2+top;geo.zSplit=N.t/2+Math.min(top-1,Math.max(1.5,top*0.4));
  // supports: mounting holes (or corners), centre supports until the PCB safety factor reaches 2
  let sup=N.holes.length?N.holes.map(h=>({x:h.x,y:h.y,d:h.d,kind:'hole'})):[[3.5,3.5],[N.W-3.5,3.5],[3.5,N.H-3.5],[N.W-3.5,N.H-3.5]].map(([x,y])=>({x:N.bb[0]+x,y:N.bb[1]+y,d:3.2,kind:'corner'}));
  let vib=pcbVibration(N,sup,inp.vib);const added=[];
  for(let k=0;k<3&&inp.vib>0&&vib.sf<2;k++){const cands=[[0.5,0.5],[0.5,0.25],[0.5,0.75],[0.25,0.5],[0.75,0.5]].map(([u,v])=>({x:N.bb[0]+u*N.W,y:N.bb[1]+v*N.H,d:3.2,kind:'centre'}));
    const pick=cands.find(c=>!sup.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<15));if(!pick)break;sup=sup.concat([pick]);added.push(pick);vib=pcbVibration(N,sup,inp.vib);}
  // lid screws: pitch from the IP code (even gasket pressure) and vibration
  const screwM=inp.vib>=5||Math.max(N.W,N.H)>150?'M4':'M3';const pitch=Math.min(S.pitch,inp.vib>=5?60:S.pitch);
  const per=2*(geo.Lo+geo.Wo);let ns=Math.max(4,Math.ceil(per/pitch));if(ns%2)ns++;
  const screws=perimeterPoints(geo,ns,screwM==='M4'?4.5:3.75);
  // fins when the plain box runs too hot (metal only)
  N.nsup=sup.length;let th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,null);let fins=null;
  if(m.metal&&matKey!=='spcc'&&th.margin<0.3&&inp.fins!==false){const pitchF=8,hf=Math.min(25,Math.max(8,inp.P*0.8)),nF=Math.floor((geo.Lo-10)/pitchF);fins={n:nF,h:hf,t:2,pitch:pitchF,len:geo.Wo-8,area:nF*2*hf*(geo.Wo-8)};th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,fins);}
  // mass and a relative cost
  const vol=(geo.Lo*geo.Wo*geo.Ho-geo.Li*geo.Wi*geo.Hi)+sup.length*Math.PI*9*stand+ns*Math.PI*16*geo.Hi*0.5+(fins?fins.n*fins.t*fins.h*fins.len:0)+th.peds.length*120*Math.max(0,top-1);
  const mass=vol*1e-9*m.rho*1000; // g
  const cost=mass/1000*m.costKg*m.proc+S.cost+ns*0.05+(S.breather?1.2:0)+(fins?0.6:0)+th.peds.length*0.25+(added.length*0.1);
  const why=[];const ok={thermal:th.margin>=0.25,ip:IPN[ip]<=m.maxIP,vib:inp.vib<=m.maxVib&&vib.sf>=1.5};
  if(!ok.thermal)why.push(`열 여유 ${(th.margin*100).toFixed(0)}% < 25%`);if(!ok.ip)why.push(`${ip} 대응 어려움 (${m.short} 최대 IP${m.maxIP})`);if(!ok.vib)why.push(inp.vib>m.maxVib?`진동 ${inp.vib} Grms 초과 (보스 강도)`:`PCB 진동 안전율 ${vib.sf.toFixed(2)}`);
  return{mat:matKey,m,ip,seal:S,geo,sup,added,vib,screwM,screws,ns,pitch,th,fins,mass,cost,ok,feasible:ok.thermal&&ok.ip&&ok.vib,why};
}
function perimeterPoints(geo,n,rb){const L=geo.Lo,W=geo.Wo,inset=geo.rim+(rb||3.75)*0.45;const per=2*(L+W-4*inset);const pts=[];
  for(let i=0;i<n;i++){let s=(i/n)*per;const a=L-2*inset,b=W-2*inset;let x,y;
    if(s<a){x=inset+s;y=inset;}else if((s-=a)<b){x=L-inset;y=inset+s;}else if((s-=b)<a){x=L-inset-s;y=W-inset;}else{s-=a;x=inset;y=W-inset-s;}
    pts.push({x:geo.x0+x,y:geo.y0+y});}
  return pts;}

/* ---- analysis over all candidates ---- */
function analyze(B,input){
  const inp=Object.assign({P:null,ip:'IP54',vib:2,ta:25,tmax:85,mat:'auto',tim:true,fins:true},input||{});
  const N=boardNeeds(B,{power:inp.power});if(inp.P==null||inp.P===''||!isFinite(+inp.P))inp.P=Math.round(N.Ptot*100)/100;
  // a heat load given by hand is spread over the heat sources in the same proportions (or put on the biggest IC)
  if(+inp.P>0&&Math.abs(+inp.P-N.Ptot)>1e-6){if(N.Ptot>0){const k=+inp.P/N.Ptot;N.hot.forEach(h=>{h.P*=k;});}else{const c=B.comps.filter(c=>c.pads.length>=8&&!isConn(c)).sort((a,b)=>b.pads.length-a.pads.length)[0];if(c)N.hot=[{ref:c.ref,P:+inp.P,c}];}N.Ptot=+inp.P;}inp.P=Math.max(0,+inp.P);inp.vib=Math.max(0,+inp.vib||0);inp.ta=+inp.ta;inp.tmax=+inp.tmax;inp.ip=ipKey(inp.ip)||'IP54';
  const all=Object.keys(MATS).map(k=>design(B,inp,k,N));
  const maxC=Math.max(...all.map(d=>d.cost)),maxM=Math.max(...all.map(d=>d.mass));
  all.forEach(d=>{d.costIdx=Math.round(d.cost/maxC*100);d.massIdx=Math.round(d.mass/maxM*100);});
  let pick;if(inp.mat&&inp.mat!=='auto'&&MATS[inp.mat])pick=all.find(d=>d.mat===inp.mat);
  else{const f=all.filter(d=>d.feasible).sort((a,b)=>a.cost-b.cost||a.mass-b.mass);pick=f[0]||all.slice().sort((a,b)=>b.th.margin-a.th.margin)[0];}
  const d=pick;const warn=[];
  if(!d.feasible)warn.push(`${d.m.short}: ${d.why.join(' · ')}`);
  if(!N.holes.length)warn.push('보드에 장착 구멍(무도금 Ø2 mm 이상)이 없어 네 모서리에 보스를 가정했습니다 — 보드에 장착 구멍을 추가하세요.');
  if(N.cuts.length&&IPN[d.ip]>=65)warn.push(`커넥터 ${N.cuts.map(c=>c.ref).join(', ')}: ${d.ip}에는 방수 커넥터(씰 일체형) 또는 케이블 글랜드가 필요합니다.`);
  if(d.th.margin<0.25)warn.push(`열 여유 ${(d.th.margin*100).toFixed(0)}% — 강제 공랭, 더 큰 핀, 또는 발열 부품의 하우징 직결 방열(TIM)을 검토하세요.`);
  d.th.peds.forEach(p=>{if(p.Tcase>inp.tmax+10)warn.push(`${p.ref} 케이스 온도 약 ${p.Tcase.toFixed(0)} °C — TIM 두께를 줄이거나 열전도율 높은 패드로`);});
  if(d.vib.sf<2&&inp.vib>0)warn.push(`PCB 진동 안전율 ${d.vib.sf.toFixed(2)} (목표 2 이상) — 지지점을 늘리거나 두꺼운 PCB(2.0 mm)를 검토하세요.`);
  const conds=[];
  if(inp.P>12)conds.push(`발열량 기준 초과 (${inp.P} W > 12 W): 수지 재질 한계로 금속 하우징${d.m.metal?' 및 TIM 적용':''}이 유리`);else if(inp.P>5)conds.push(`발열 ${inp.P} W: 수지는 내부 온도 여유를 확인해야 하는 구간`);else conds.push(`발열 ${inp.P} W: 수지 하우징으로 충분한 구간`);
  conds.push(`방수 및 압력 균형: ${d.ip} — ${d.seal.label}${d.seal.breather?' · 내외부 압력 변동 방지용 벤트 필터 필수':''}`);
  conds.push(`구조 및 밀착 보강: 진동 ${inp.vib} Grms${d.th.peds.length?' 및 방열 패드면 압착 균일도':''}를 위해 ${d.screwM} 체결 보스 ${d.ns}개 (간격 ≤ ${d.pitch} mm)`);
  return{inp,N,all,d,warn,conds,
    idx:{cost:d.costIdx,mass:d.massIdx,thermal:Math.round(clamp(d.th.margin,0,1)*100),vib:Math.round(clamp(d.vib.sf/2.5,0,1)*100)}};
}
/* ---- text report ---- */
function text(R){const d=R.d,i=R.inp,g=d.geo;const L=[];
  L.push(`하우징 설계 · 발열 ${i.P} W · ${d.ip} · 진동 ${i.vib} Grms · 주위 ${i.ta} °C · PCB 한계 ${i.tmax} °C`);
  L.push('설계 조건:');R.conds.forEach(c=>L.push('  • '+c));
  L.push(`재질: ${d.m.label} · 벽두께 ${g.t} mm${g.rim>g.t?` (실링 플랜지 ${g.rim} mm)`:''} · 공정 ${d.m.proc_label}`);
  L.push(`외형: ${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm · 내부 ${g.Li.toFixed(1)} × ${g.Wi.toFixed(1)} × ${g.Hi.toFixed(1)} mm · 보드 아래 스탠드오프 ${g.stand} mm · 위 여유 ${g.top} mm`);
  L.push(`방열: ${d.m.metal?(d.th.peds.length?`TIM(방열 패드 3 W/m·K, 1.0 mm) + 하우징 내벽 페데스탈 (${d.th.peds.map(p=>p.ref).join(', ')})`:'하우징 벽 전도'):'수지 벽 전도 + 내부 대류'}${d.fins?` · 핀 ${d.fins.n}개 (높이 ${d.fins.h.toFixed(0)} mm, 피치 ${d.fins.pitch} mm)`:''}${d.seal.slots?' · 통풍 슬롯':''} · 자연대류`);
  L.push(`  표면 ${d.th.Ts.toFixed(1)} °C · PCB ${d.th.Tboard.toFixed(1)} °C · 내부 공기 약 ${d.th.Tair.toFixed(1)} °C${d.th.peds.length?` · 페데스탈 부품 케이스 ${d.th.peds.map(p=>`${p.ref} ${p.Tcase.toFixed(0)} °C`).join(', ')}`:''} · TIM 경로 ${d.th.Ptim.toFixed(1)} W`);
  L.push(`실링: ${d.seal.gasket} · ${d.seal.vent}`);
  L.push(`체결: 커버 ${d.screwM} 나사 ${d.ns}개 (간격 ≤ ${d.pitch} mm) · PCB 보스 ${d.sup.length}개 (${d.sup.filter(s=>s.kind==='hole').length?'장착 구멍 '+d.sup.filter(s=>s.kind==='hole').length:'모서리 가정 '+d.sup.filter(s=>s.kind==='corner').length}${d.added.length?` + 중앙 지지 ${d.added.length}`:''})${R.inp.vib>=4?' · 내부 대각 보강 리브':''}`);
  L.push(`진동: PCB 1차 고유진동수 ${d.vib.fn.toFixed(0)} Hz · 응답 ${d.vib.gout.toFixed(1)} Grms · 3σ 처짐 ${d.vib.z3.toFixed(3)} mm / 허용 ${d.vib.zAllow.toFixed(3)} mm (${d.vib.part}${d.vib.leadless?' 리드리스':''}) → 안전율 ${d.vib.sf.toFixed(2)}`);
  L.push(`커넥터 개구부: ${R.N.cuts.length?R.N.cuts.map(c=>`${c.ref}(${c.side})`).join(', '):'없음'}`);
  L.push(`트레이드오프: 원가 지수 ${R.idx.cost}/100 · 중량 지수 ${R.idx.mass}/100 (약 ${d.mass.toFixed(0)} g) · 방열 여유도 ${R.idx.thermal}% · 내진동 안전율 ${R.idx.vib}%`);
  if(R.warn.length)L.push('경고:\n'+R.warn.map(w=>'  ! '+w).join('\n'));
  return L.join('\n');}
function compareText(R){return['재질 비교 (같은 조건):',...R.all.map(d=>`  ${d===R.d?'▶':' '} ${d.m.short.padEnd(14)} 벽 ${d.geo.t} mm · PCB ${d.th.Tboard.toFixed(0)} °C (여유 ${(d.th.margin*100).toFixed(0)}%) · 진동 SF ${d.vib.sf.toFixed(2)} · ${d.mass.toFixed(0)} g · 원가 ${d.costIdx}${d.fins?` · 핀 ${d.fins.n}개`:''}${d.th.peds.length?' · TIM':''} · ${d.feasible?'적합':'부적합: '+d.why.join(', ')}`)].join('\n');}
/* ---- OpenSCAD source (parametric, real CSG) ---- */
function scad(R,name){const d=R.d,g=d.geo,f=v=>(Math.round(v*100)/100).toString();
  const o=[`// ${name||'board'} 하우징 — PCB 뷰어 기구 설계 (${d.m.label}, ${d.ip}, 진동 ${R.inp.vib} Grms)`,`// 좌표: 보드 왼쪽 아래 = (0,0), 보드 중간면 z = 0 (mm)`,`$fn=40;`,
    `wall=${f(g.t)}; rim=${f(g.rim)}; x0=${f(g.x0)}; y0=${f(g.y0)}; Lo=${f(g.Lo)}; Wo=${f(g.Wo)};`,`zFloor=${f(g.zFloor)}; zLid=${f(g.zLid)}; zSplit=${f(g.zSplit)}; r=3;`,
    `module rbox(x,y,z,l,w,h,rr){translate([x,y,z]) hull(){for(i=[rr,l-rr],j=[rr,w-rr]) translate([i,j,0]) cylinder(r=rr,h=h);}}`,
    `module shell(){difference(){rbox(x0,y0,zFloor-wall,Lo,Wo,zLid+wall-(zFloor-wall),r); rbox(x0+rim,y0+rim,zFloor,Lo-2*rim,Wo-2*rim,zLid-zFloor,max(0.5,r-rim/2));`,
    ...R.N.cuts.map(c=>{const w=c.b-c.a,h=c.z1-c.z0;return c.side==='W'?`  translate([x0-1,${f(c.a)},${f(c.z0)}]) cube([rim+2,${f(w)},${f(h)}]); /* ${c.ref} */`:c.side==='E'?`  translate([x0+Lo-rim-1,${f(c.a)},${f(c.z0)}]) cube([rim+2,${f(w)},${f(h)}]); /* ${c.ref} */`:c.side==='S'?`  translate([${f(c.a)},y0-1,${f(c.z0)}]) cube([${f(w)},rim+2,${f(h)}]); /* ${c.ref} */`:`  translate([${f(c.a)},y0+Wo-rim-1,${f(c.z0)}]) cube([${f(w)},rim+2,${f(h)}]); /* ${c.ref} */`;}),
    ...(d.seal.breather?[`  translate([x0+Lo/2,y0+Wo+1,zSplit-4]) rotate([90,0,0]) cylinder(d=12,h=rim+2); // 벤트 필터 M12`]:[]),
    `}}`,
    `module pcb_bosses(){${d.sup.map(s=>`translate([${f(s.x)},${f(s.y)},zFloor]) difference(){cylinder(d=${s.d>3.4?9:7},h=${f(g.stand)}); cylinder(d=${s.d>3.4?3.3:2.5},h=${f(g.stand+1)});}`).join(' ')}}`,
    `module lid_screws(){${d.screws.map(s=>`translate([${f(s.x)},${f(s.y)},zFloor]) difference(){cylinder(d=${d.screwM==='M4'?9:7.5},h=zSplit-zFloor); cylinder(d=${d.screwM==='M4'?3.3:2.5},h=zSplit-zFloor+1);}`).join(' ')}}`,
    `module pedestals(){${d.th.peds.map(p=>{const c=R.N.hot.find(h=>h.ref===p.ref).c;const top=(c.body.ht||1)+R.N.t/2+1.0;return`translate([${f(c.body.cx-c.body.w/2)},${f(c.body.cy-c.body.h/2)},${f(top)}]) cube([${f(c.body.w)},${f(c.body.h)},${f(g.zLid-top)}]); /* ${p.ref}: TIM 1.0 mm */`;}).join(' ')}}`,
    `module fins(){${d.fins?`for(i=[0:${d.fins.n-1}]) translate([x0+5+i*${d.fins.pitch},y0+4,zLid+wall]) cube([${d.fins.t},${f(d.fins.len)},${f(d.fins.h)}]);`:''}}`,
    `module base(){intersection(){union(){shell(); pcb_bosses(); lid_screws();} translate([x0-1,y0-1,zFloor-wall-1]) cube([Lo+2,Wo+2,zSplit-(zFloor-wall)+1]);}}`,
    `module lid(){intersection(){union(){shell(); pedestals(); fins();} translate([x0-1,y0-1,zSplit]) cube([Lo+2,Wo+2,zLid+wall+40-zSplit]);}}`,
    `base();`,`translate([0,0,15]) lid(); // 열린 상태로 보기 — 조립은 translate 제거`];
  return o.join('\n')+'\n';}
return{MATS,IPS,ipKey,SEAL,boardNeeds,pcbVibration,analyze,text,compareText,scad};
})();
if(typeof module!=='undefined')module.exports=HOUSING;
