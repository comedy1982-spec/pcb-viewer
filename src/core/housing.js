/* Protective housing (enclosure) design for the loaded board.
   From the board (outline, mounting holes, connectors at the edge, part heights, heat sources) and the environment
   (heat load W, IP rating, vibration Grms, ambient and limit temperature) it sizes an enclosure for every candidate
   material, then picks the cheapest one that keeps the thermal margin, the IP rating and the vibration safety:
   - thermal: surface convection + radiation (iterated), wall conduction, board → inner wall (convection, radiation, supports),
     and per hot part a conduction path into the housing: package top → gap pad → lid pedestal, or exposed pad → thermal-via
     array → gap pad / gap filler → base pedestal; the TIM material and bond line are chosen per part for the junction limit;
     optional fins; board, wall and junction temperatures, thermal margin to the limit
   - sealed board connectors (e.g. JAE MX23A): the shroud passes through a window in the wall, the header flange seals against
     the inner face (that side's wall sits on the flange plane), the split line stays below the window, keep-out for the plug
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
/* thermal interface materials between a part (or its thermal-via field) and a housing pedestal */
const TIMS={
  pad15:{label:'실리콘 갭 패드 1.5 W/m·K',short:'갭 패드 1.5',k:1.5,minBlt:0.5,comp:0.25,costCm2:0.02,form:'패드',kv:'≥ 4 kV/mm 절연'},
  pad30:{label:'실리콘 갭 패드 3.0 W/m·K',short:'갭 패드 3.0',k:3.0,minBlt:0.5,comp:0.25,costCm2:0.05,form:'패드',kv:'≥ 4 kV/mm 절연'},
  gel40:{label:'디스펜싱 갭 필러 4.0 W/m·K (1액형 · 저응력)',short:'갭 필러 4.0',k:4.0,minBlt:0.25,comp:0,costCm2:0.08,form:'디스펜싱',kv:'≥ 5 kV/mm 절연'},
  pad60:{label:'고성능 갭 패드 6.0 W/m·K',short:'갭 패드 6.0',k:6.0,minBlt:0.5,comp:0.2,costCm2:0.16,form:'패드',kv:'≥ 3 kV/mm 절연'}};
const TOL={top:0.8,bottom:0.4}; // nominal gap from the tolerance stack: package height + solder + boss/casting (top), boss + PCB flatness (bottom)
const VIA={pitch:1.0,drill:0.3,plate:0.025,kCu:385};
const D2R=Math.PI/180;
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
  const cuts=[];
  comps.filter(c=>c.f&&c.f.seal&&c.f.face&&c.side!=='B').forEach(c=>{const q=c.f.seal,a=c.rot*D2R,ca=Math.cos(a),sa=Math.sin(a);
    const fx=Math.round(c.f.face[0]*ca-c.f.face[1]*sa),fy=Math.round(c.f.face[0]*sa+c.f.face[1]*ca);const side=fx<0?'W':fx>0?'E':fy<0?'S':'N';
    const L=(lx,ly)=>[c.x+lx*ca-ly*sa,c.y+lx*sa+ly*ca];const fl=L(q.flangeX,0),hz=side==='W'||side==='E';const ac=hz?fl[1]:fl[0];
    const gap=side==='W'?bb[0]-fl[0]:side==='E'?fl[0]-bb[2]:side==='S'?bb[1]-fl[1]:fl[1]-bb[3];const zb=(B.t||1.6)/2,clr=0.3;
    cuts.push({ref:c.ref,side,a:ac-q.shroud.y-clr,b:ac+q.shroud.y+clr,z0:zb+q.shroud.z0-clr,z1:zb+q.shroud.z1+clr,val:c.val,sealed:true,mpn:q.mpn||c.mpn,mate:q.mate,
      gap,plane:hz?fl[0]:fl[1],flange:{a:ac-q.flange.y,b:ac+q.flange.y,z0:zb+q.flange.z0,z1:zb+q.flange.z1},land:Math.min(q.flange.y-q.shroud.y,q.shroud.z0-q.flange.z0,q.flange.z1-q.shroud.z1),
      shroudLen:q.flangeX-q.shroud.x0,plug:q.plug,rated:q.rated});});
  comps.filter(c=>isConn(c)&&!cuts.some(k=>k.ref===c.ref)).forEach(c=>{const b=c.bb;const ds=[['W',b[0]-bb[0]],['E',bb[2]-b[2]],['S',b[1]-bb[1]],['N',bb[3]-b[3]]].sort((x,y)=>x[1]-y[1]);const[side,d]=ds[0];
    if(d>4)return;const along=side==='W'||side==='E'?[b[1],b[3]]:[b[0],b[2]];const z0=c.side==='B'?-B.t/2-(c.body.ht||3):B.t/2;const z1=c.side==='B'?-B.t/2:B.t/2+(c.body.ht||3);
    cuts.push({ref:c.ref,side,a:along[0]-0.6,b:along[1]+0.6,z0:z0-0.4,z1:z1+0.6,val:c.val});});
  // heat sources: given power or typical figures
  let P=opts.power;if(!P&&typeof AUTOPLACE!=='undefined'){P={};AUTOPLACE.classify(B,{}).list.forEach(o=>{if(o.P>0)P[o.ref]=o.P;});}
  const hot=Object.entries(P||{}).map(([ref,w])=>({ref,P:+w,c:B.byRef[ref]})).filter(h=>h.c&&h.P>0).sort((a,b)=>b.P-a.P);
  // the biggest package decides the vibration allowable (leadless parts are the most fragile)
  // heat sources: exposed pad / tab (largest pad under the body) decides whether the heat can go down through thermal vias
  hot.forEach(h=>heatInfo(h,comps));
  const ics=comps.filter(c=>c.pads.length>=8&&!isConn(c)).map(c=>({ref:c.ref,L:Math.max(c.body.w,c.body.h),leadless:/QFN|BGA|LGA|DFN|SON/i.test(c.fp||''),fp:c.fp})).sort((a,b)=>b.L-a.L);
  const compMass=comps.reduce((s,c)=>s+c.body.w*c.body.h*Math.max(0.3,c.body.ht||0.5)*1e-3*(isConn(c)?0.9:1.6)*0.6,0); // g
  return{bb,W:bb[2]-bb[0],H:bb[3]-bb[1],t:B.t||1.6,htTop,htBot,holes,cuts,hot,Ptot:hot.reduce((s,h)=>s+h.P,0),big:ics[0]||null,compMass};
}

function heatInfo(h,comps){const c=h.c,bd=c.body,A=Math.max(1,bd.w*bd.h);let ep=null;
  c.pads.forEach(p=>{if(p.drill)return;const ar=p.w*p.h;if(ar>=4&&ar>A*0.12&&Math.abs(p.x-bd.cx)<bd.w/2+p.w/2+0.5&&Math.abs(p.y-bd.cy)<bd.h/2+p.h/2+0.5&&(!ep||ar>ep.w*ep.h)){const r=Math.abs(Math.round((p.ang||0)/90))%2;ep={n:p.n,x:p.x,y:p.y,w:r?p.h:p.w,h:r?p.w:p.h,net:p.net};}});
  // a part on the bottom side, or bottom-side parts under the pad, rule the base pedestal out
  if(ep&&(c.side==='B'||(comps||[]).some(o=>o.side==='B'&&o.bb&&o.bb[0]<ep.x+ep.w/2+2&&o.bb[2]>ep.x-ep.w/2-2&&o.bb[1]<ep.y+ep.h/2+2&&o.bb[3]>ep.y-ep.h/2-2)))ep.blocked=true;
  h.ep=ep;h.A=A;h.jcTop=6+300/A;h.jcBot=ep?1+30/(ep.w*ep.h):null;h.Rsp=20/Math.sqrt(A/10);h.Rb=(ep?h.jcBot:20)+h.Rsp;return h;}

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
// one conduction path from a hot part into the housing; kind 'bottom' = exposed pad → thermal vias → TIM → base pedestal,
// 'top' = package top → TIM → lid pedestal. Returns its resistance junction → inner wall for a TIM material.
function pathR(h,kind,tk,m,geo,N){const T=TIMS[tk];const blt=Math.max(T.minBlt,TOL[kind]);let R,A,vias=0,ped;
  if(kind==='bottom'){const e=h.ep;const nx=Math.max(2,Math.floor((e.w+2)/VIA.pitch)),ny=Math.max(2,Math.floor((e.h+2)/VIA.pitch));vias=nx*ny; // in the pad and the copper ring around it
    const ri=VIA.drill/2,ro=ri+VIA.plate;const Rvia=N.t/1000/(VIA.kCu*Math.PI*(ro*ro-ri*ri)*1e-6);
    const w=e.w+3,hh=e.h+3;A=w*hh;const hp=Math.max(0.5,geo.stand-blt);ped={x:e.x-w/2,y:e.y-hh/2,w,h:hh,z0:geo.zFloor,z1:-N.t/2-blt};
    R=h.jcBot+Rvia/vias+blt/1000/(T.k*A*1e-6)+hp/1000/(m.k*A*1e-6)+0.15;}
  else{const bd=h.c.body;A=Math.max(4,bd.w*bd.h);const top=N.t/2+(bd.ht||1);const hp=Math.max(0.5,geo.zLid-top-blt);
    ped={x:bd.cx-bd.w/2,y:bd.cy-bd.h/2,w:bd.w,h:bd.h,z0:top+blt,z1:geo.zLid,tz:top};
    R=h.jcTop+blt/1000/(T.k*A*1e-6)+hp/1000/(m.k*A*1e-6)+0.15;}
  return{R,A,blt,vias,ped,padT:T.comp?Math.round(blt/(1-T.comp)*10)/10:null};}
function thermal(m,geo,inp,N,fins){
  const Ao=2*(geo.Lo*geo.Wo+geo.Lo*geo.Ho+geo.Wo*geo.Ho)*1e-6;const Ai=2*(geo.Li*geo.Wi+geo.Li*geo.Hi+geo.Wi*geo.Hi)*1e-6;
  const finA=fins?fins.area*1e-6*0.75:0; // fin efficiency ≈ 0.75
  const Aeff=Ao+finA,P=inp.P,Ta=inp.ta;
  let Ts=Ta+10;for(let i=0;i<40;i++){const T1=Ts+273.15,T0=Ta+273.15;const hr=m.eps*SIG*(T1*T1+T0*T0)*(T1+T0);const hc=1.42*Math.pow(Math.max(0.1,Ts-Ta)/Math.max(0.03,geo.Ho/1000),0.25)*0.85;const h=hc+hr;const n=Ta+P/(h*Aeff);if(Math.abs(n-Ts)<0.01){Ts=n;break;}Ts=0.5*(Ts+n);}
  const Rwall=geo.t/1000/(m.k*Ao);const Twin=Ts+P*Rwall;
  // the board is the heat source: convection + radiation to the inner walls, plus conduction through the supports
  const Apcb=2*N.W*N.H*1e-6,epsE=1/(1/0.9+1/m.epsIn-1);const Tm=(Twin+30)+273.15;const hi=(inp.slots?7:4.5)+epsE*4*SIG*Tm*Tm*Tm;
  const gBoss=Math.min(0.25,m.k*38.5e-6/Math.max(0.002,geo.stand/1000));const G=hi*Apcb+gBoss*N.nsup;
  // per hot part: no path (plastic, small parts) or the better of bottom / top with the cheapest TIM that keeps Tj in limit
  const tj=inp.tj,useTim=m.metal&&inp.tim!==false&&inp.tim!=='none';const timKeys=inp.tim&&TIMS[inp.tim]?[inp.tim]:Object.keys(TIMS).sort((a,b)=>TIMS[a].costCm2-TIMS[b].costCm2);
  const parts=N.hot.map(h=>({h,ref:h.ref,P:h.P,path:null}));let Tboard=Twin+P/G;
  const solve=(pt,Tb)=>{const h=pt.h;if(!pt.path)return{Tj:Tb+h.P*h.Rb,Pp:0};const Rp=pt.path.R,Rb=h.Rb;const Tj=(h.P+Twin/Rp+Tb/Rb)/(1/Rp+1/Rb);return{Tj,Pp:(Tj-Twin)/Rp};};
  for(let it=0;it<5;it++){
    parts.forEach(pt=>{const h=pt.h;pt.path=null;if(!useTim||h.P<0.25)return;if(inp.tim==='auto'&&solve(pt,Tboard).Tj<=tj-25)return; // cool enough through the board alone: no pedestal
      const kinds=[];if(h.ep&&!h.ep.blocked)kinds.push('bottom');if(h.c.side!=='B')kinds.push('top');let best=null;
      for(const tk of timKeys){let cand=null;for(const kd of kinds){const r=Object.assign({kind:kd,tim:tk},pathR(h,kd,tk,m,geo,N));pt.path=r;r.Tj=solve(pt,Tboard).Tj;if(!cand||r.Tj<cand.Tj)cand=r;}
        if(!cand)break;if(!best||cand.Tj<best.Tj)best=cand;if(cand.Tj<=tj-10){best=cand;break;}}
      pt.path=best;});
    const Pp=parts.reduce((a,pt)=>a+solve(pt,Tboard).Pp,0);Tboard=Twin+Math.max(0,P-Pp)/G;}
  let Ptim=0;parts.forEach(pt=>{const s=solve(pt,Tboard);pt.Tj=s.Tj;pt.Pp=Math.max(0,s.Pp);pt.share=pt.P>0?pt.Pp/pt.P:0;Ptim+=pt.Pp;pt.tjmax=tj;});
  const peds=parts.filter(pt=>pt.path).map(pt=>({ref:pt.ref,P:pt.P,R:pt.path.R,share:pt.share,Tcase:pt.Tj,Tj:pt.Tj,kind:pt.path.kind,tim:pt.path.tim,blt:pt.path.blt,padT:pt.path.padT,vias:pt.path.vias,area:pt.path.A,ped:pt.path.ped,ep:pt.h.ep}));
  const Tair=(Tboard+Twin)/2;const margin=(inp.tmax-Tboard)/Math.max(1,inp.tmax-Ta);const hotJ=parts.filter(pt=>pt.Tj>tj);
  return{Ts,Twin,Tair,Tboard,margin,Ptim,peds,parts:parts.map(pt=>({ref:pt.ref,P:pt.P,Tj:pt.Tj,path:pt.path?pt.path.kind:null,share:pt.share})),hotJ:hotJ.map(pt=>pt.ref),Ao,Ai,Rwall,finA,G};
}

/* ---- one candidate material ---- */
function design(B,inp,matKey,N){
  const m=MATS[matKey];const ip=ipKey(inp.ip)||'IP54';const S=SEAL[ip];
  const O=(inp.cad&&inp.cad.over)||{},F=(inp.cad&&inp.cad.feats)||[];const num=v=>v!=null&&v!==''&&isFinite(+v);
  const gap=num(O.gap)?Math.max(0.3,+O.gap):1.5;const gp={W:gap,E:gap,S:gap,N:gap};N.cuts.filter(c=>c.sealed).forEach(c=>{const v=Math.max(0.3,c.gap);gp[c.side]=gp[c.side]===gap?v:Math.min(gp[c.side],v);});const tAuto=Math.round((m.t0+0.05*inp.vib+0.002*Math.max(N.W,N.H)+(S.extraWall||0))*10)/10;const t=num(O.wall)?Math.max(0.8,+O.wall):tAuto;
  const stand=num(O.stand)?Math.max(N.htBot+0.5,1.5,+O.stand):Math.max(4,Math.ceil(N.htBot+2));const top=num(O.top)?Math.max(N.htTop+0.5,1,+O.top):Math.max(3,Math.ceil(N.htTop+2.5));
  const rim=S.groove?Math.max(t,4.6):t; // a groove for the O-ring needs ~4.6 mm of flange
  const geo={t,gap,gaps:gp,stand,top,rim,Li:N.W+gp.W+gp.E,Wi:N.H+gp.S+gp.N,Hi:stand+N.t+top};geo.Lo=geo.Li+2*rim;geo.Wo=geo.Wi+2*rim;geo.Ho=geo.Hi+2*t;
  geo.x0=N.bb[0]-gp.W-rim;geo.y0=N.bb[1]-gp.S-rim;geo.zFloor=-N.t/2-stand;geo.zLid=N.t/2+top;geo.zSplit=N.t/2+Math.min(top-1,Math.max(1.5,top*0.4));geo.tAuto=tAuto;geo.r=num(O.corner)?Math.max(0.5,Math.min(+O.corner,geo.Wo/2-1,geo.Lo/2-1)):3;
  // a sealed connector window must lie wholly in the cover: the split line drops below it, leaving a seal land under the window
  const win=N.cuts.filter(c=>c.sealed);if(win.length){geo.zSplit=Math.max(geo.zFloor+2,Math.min(geo.zSplit,Math.min(...win.map(c=>c.z0))-1.8));geo.splitWin=true;}
  if(num(O.split))geo.zSplit=Math.max(geo.zFloor+1,Math.min(geo.zLid-1,+O.split));
  // supports: mounting holes (or corners), centre supports until the PCB safety factor reaches 2
  let sup=N.holes.length?N.holes.map(h=>({x:h.x,y:h.y,d:h.d,kind:'hole'})):[[3.5,3.5],[N.W-3.5,3.5],[3.5,N.H-3.5],[N.W-3.5,N.H-3.5]].map(([x,y])=>({x:N.bb[0]+x,y:N.bb[1]+y,d:3.2,kind:'corner'}));
  F.filter(f=>f.type==='boss').forEach(f=>sup.push({x:f.x==null?N.bb[0]+N.W/2:+f.x,y:f.y==null?N.bb[1]+N.H/2:+f.y,d:+(f.d||3.2),kind:'user',id:f.id}));
  let vib=pcbVibration(N,sup,inp.vib);const added=[];
  for(let k=0;k<3&&inp.vib>0&&vib.sf<2;k++){const cands=[[0.5,0.5],[0.5,0.25],[0.5,0.75],[0.25,0.5],[0.75,0.5]].map(([u,v])=>({x:N.bb[0]+u*N.W,y:N.bb[1]+v*N.H,d:3.2,kind:'centre'}));
    const pick=cands.find(c=>!sup.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<15));if(!pick)break;sup=sup.concat([pick]);added.push(pick);vib=pcbVibration(N,sup,inp.vib);}
  // lid screws: pitch from the IP code (even gasket pressure) and vibration
  const screwM=inp.vib>=5||Math.max(N.W,N.H)>150?'M4':'M3';const pitch=Math.min(S.pitch,inp.vib>=5?60:S.pitch);
  const per=2*(geo.Lo+geo.Wo);let ns=Math.max(4,Math.ceil(per/pitch));if(ns%2)ns++;
  const screws=perimeterPoints(geo,ns,screwM==='M4'?4.5:3.75);
  // fins when the plain box runs too hot (metal only)
  N.nsup=sup.length;let th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,null);let fins=null;const fu=F.find(f=>f.type==='fins');
  if(fu&&!fu.off){const nF=Math.max(1,Math.round(+fu.n||10)),hf=Math.max(2,+fu.h||12),pitchF=+fu.pitch||Math.max(3,(geo.Lo-10)/nF);fins={n:nF,h:hf,t:+fu.t||2,pitch:pitchF,len:geo.Wo-8,area:nF*2*hf*(geo.Wo-8),user:true};th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,fins);}
  else if(!fu&&m.metal&&matKey!=='spcc'&&(th.margin<0.3||th.hotJ.length)&&inp.fins!==false){const pitchF=8,hf=Math.min(25,Math.max(8,inp.P*0.8)),nF=Math.floor((geo.Lo-10)/pitchF);fins={n:nF,h:hf,t:2,pitch:pitchF,len:geo.Wo-8,area:nF*2*hf*(geo.Wo-8)};th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,fins);}
  // user CAD features (text-to-CAD console): wall / cover / floor holes and slots, mounting tabs, floor ribs, an engraved label
  const feats=cadFeatures(F,geo,N,sup);const fv=feats.reduce((a,f)=>a+(f.vol||0),0),fc=feats.reduce((a,f)=>a+(f.cost||0),0);
  // mass and a relative cost
  const vol=fv+(geo.Lo*geo.Wo*geo.Ho-geo.Li*geo.Wi*geo.Hi)+sup.length*Math.PI*9*stand+ns*Math.PI*16*geo.Hi*0.5+(fins?fins.n*fins.t*fins.h*fins.len:0)+th.peds.reduce((a,p)=>a+p.ped.w*p.ped.h*Math.max(0,p.ped.z1-p.ped.z0),0);
  const mass=vol*1e-9*m.rho*1000; // g
  const cost=mass/1000*m.costKg*m.proc+S.cost+ns*0.05+(S.breather?1.2:0)+(fins?0.6:0)+th.peds.reduce((a,p)=>a+0.15+TIMS[p.tim].costCm2*p.area/100+p.vias*0.002,0)+(added.length*0.1)+N.cuts.filter(c=>c.sealed).length*0.3+fc;
  const why=[];const ok={thermal:th.margin>=0.25&&!th.hotJ.length,ip:IPN[ip]<=m.maxIP,vib:inp.vib<=m.maxVib&&vib.sf>=1.5};
  if(th.margin<0.25)why.push(`열 여유 ${(th.margin*100).toFixed(0)}% < 25%`);if(th.hotJ.length)why.push(`Tj > ${inp.tj} °C (${th.hotJ.join(', ')})`);if(!ok.ip)why.push(`${ip} 대응 어려움 (${m.short} 최대 IP${m.maxIP})`);if(!ok.vib)why.push(inp.vib>m.maxVib?`진동 ${inp.vib} Grms 초과 (보스 강도)`:`PCB 진동 안전율 ${vib.sf.toFixed(2)}`);
  return{mat:matKey,m,ip,seal:S,geo,sup,added,vib,screwM,screws,ns,pitch,th,fins,mass,cost,ok,feasible:ok.thermal&&ok.ip&&ok.vib,why,feats};
}
/* user features → absolute geometry. Side walls: W (x min) · E (x max) · S (y min, front) · N (y max, back); T = cover top, B = floor.
   Wall position u runs along the wall from its start (x0 or y0), height z is in board coordinates (board mid-plane = 0). */
const SCREW_D={M3:3.4,M4:4.5,M5:5.5,M6:6.6,M8:9};
function cadFeatures(F,g,N,sup){const out=[];const along=s=>s==='S'||s==='N'?[g.x0,g.Lo]:[g.y0,g.Wo];
  F.forEach(f=>{const o=Object.assign({},f);
    if(f.type==='hole'||f.type==='slot'){const sd=f.side;const w=f.type==='hole'?+f.d:+f.w,h=f.type==='hole'?+f.d:+f.h;
      if(sd==='T'||sd==='B'){o.x=f.u!=null&&f.u!==''?g.x0+(+f.u):g.x0+g.Lo/2+(+f.du||0);o.y=f.v!=null&&f.v!==''?g.y0+(+f.v):g.y0+g.Wo/2;}
      else{const[a0,L]=along(sd);o.a=f.u!=null&&f.u!==''?a0+(+f.u):a0+L/2+(+f.du||0);o.z=f.v!=null&&f.v!==''?+f.v:(g.zSplit+g.zLid)/2;}
      o.w=w;o.h=h;o.cost=f.type==='hole'?0.05:0.08;}
    else if(f.type==='tabs'){const n=Math.max(2,Math.round(+f.n||4)),tw=+f.w||16,tl=+f.len||14,tt=+f.t||Math.max(3,g.t+1),hd=SCREW_D[f.screw]||+f.d||5.5;const sides=f.sides==='SN'?'SN':'WE';
      const pts=[];if(sides==='WE'){const ys=n>=4?[g.y0+g.Wo*0.18,g.y0+g.Wo*0.82]:[g.y0+g.Wo*0.5];[[g.x0,-1],[g.x0+g.Lo,1]].forEach(([x,sg])=>ys.forEach((y,k)=>{if(n===2&&pts.length>=2)return;pts.push({x,y,dir:[sg,0]});}));if(n===2&&pts.length<2)pts.push({x:g.x0+g.Lo,y:g.y0+g.Wo*0.5,dir:[1,0]});}
      else{const xs=n>=4?[g.x0+g.Lo*0.18,g.x0+g.Lo*0.82]:[g.x0+g.Lo*0.5];[[g.y0,-1],[g.y0+g.Wo,1]].forEach(([y,sg])=>xs.forEach(x=>pts.push({x,y,dir:[0,sg]})));}
      o.tabs=pts.slice(0,n>=4?4:2).map(p=>{const c=p.dir[0]?{x:p.x+p.dir[0]*tl/2,y:p.y}:{x:p.x,y:p.y+p.dir[1]*tl/2};return{cx:c.x,cy:c.y,sx:p.dir[0]?tl:tw,sy:p.dir[0]?tw:tl,hx:p.dir[0]?p.x+p.dir[0]*tl*0.55:p.x,hy:p.dir[0]?p.y:p.y+p.dir[1]*tl*0.55};});
      o.tt=tt;o.hd=hd;o.z0=g.zFloor-g.t;o.vol=o.tabs.length*tw*tl*tt;o.cost=0.4;}
    else if(f.type==='rib'){const ax=f.axis==='y'?'y':'x';const pos=f.pos!=null&&f.pos!==''?+f.pos:(ax==='x'?N.bb[1]+N.H/2:N.bb[0]+N.W/2);const h=Math.min(+f.h||3,g.stand-0.5),tt=+f.t||2;
      o.axis=ax;o.pos=pos;o.h=h;o.tt=tt;o.len=ax==='x'?g.Li:g.Wi;o.vol=o.len*h*tt;o.cost=0.05;}
    else if(f.type==='label'){o.x=f.u!=null&&f.u!==''?g.x0+(+f.u):g.x0+g.Lo/2;o.y=f.v!=null&&f.v!==''?g.y0+(+f.v):g.y0+g.Wo/2;o.size=+f.size||6;o.cost=0.05;}
    else if(f.type!=='boss'&&f.type!=='fins')return;
    out.push(o);});
  return out;}
function featWarn(R){const d=R.d,g=d.geo,w=[];const IPN_=IPN[d.ip]||0;
  d.feats.forEach(f=>{const nm=`${f.id||'?'} ${f.type==='hole'?`구멍 Ø${f.w}`:f.type==='slot'?`사각 구멍 ${f.w}×${f.h}`:''}`;
    if(f.type==='hole'||f.type==='slot'){
      if(f.side==='T'||f.side==='B'){if(f.x-f.w/2<g.x0+g.rim||f.x+f.w/2>g.x0+g.Lo-g.rim||f.y-f.h/2<g.y0+g.rim||f.y+f.h/2>g.y0+g.Wo-g.rim)w.push(`${nm}: ${f.side==='T'?'커버':'바닥'} 가장자리(실링 플랜지)에 걸립니다.`);
        if(f.side==='T')d.th.peds.filter(p=>p.kind==='top').forEach(p=>{const q=p.ped;if(f.x+f.w/2>q.x&&f.x-f.w/2<q.x+q.w&&f.y+f.h/2>q.y&&f.y-f.h/2<q.y+q.h)w.push(`${nm}: ${p.ref} 방열 페데스탈과 겹칩니다.`);});
        if(f.side==='B')d.th.peds.filter(p=>p.kind==='bottom').forEach(p=>{const q=p.ped;if(f.x+f.w/2>q.x&&f.x-f.w/2<q.x+q.w&&f.y+f.h/2>q.y&&f.y-f.h/2<q.y+q.h)w.push(`${nm}: ${p.ref} 베이스 페데스탈과 겹칩니다.`);});}
      else{const L=f.side==='S'||f.side==='N'?[g.x0,g.x0+g.Lo]:[g.y0,g.y0+g.Wo];
        if(f.a-f.w/2<L[0]+g.r||f.a+f.w/2>L[1]-g.r)w.push(`${nm}: 벽 끝(모서리 R)에 걸립니다.`);
        if(f.z+f.h/2>g.zLid+g.t-0.5||f.z-f.h/2<g.zFloor-g.t+0.5)w.push(`${nm}: 벽 높이 밖으로 나갑니다.`);
        if(f.z-f.h/2<g.zSplit+1.5&&f.z+f.h/2>g.zSplit-1.5)w.push(`${nm}: 분할면(z ${g.zSplit.toFixed(1)})을 가로지릅니다 — 실링이 끊기니 높이를 옮기세요.`);
        R.N.cuts.filter(c=>c.side===f.side).forEach(c=>{if(f.a+f.w/2>c.a-2&&f.a-f.w/2<c.b+2&&f.z+f.h/2>c.z0-2&&f.z-f.h/2<c.z1+2)w.push(`${nm}: ${c.ref} 커넥터 창과 겹칩니다.`);});}
      if(IPN_>=54&&!/gland|vent|plug|connector|글랜드|벤트|플러그|커넥터/i.test(f.kind||f.label||''))w.push(`${nm}: ${d.ip}을 지키려면 케이블 글랜드·벤트·실링 플러그로 막아야 합니다.`);}
  });return w;}
function perimeterPoints(geo,n,rb){const L=geo.Lo,W=geo.Wo,inset=geo.rim+(rb||3.75)*0.45;const per=2*(L+W-4*inset);const pts=[];
  for(let i=0;i<n;i++){let s=(i/n)*per;const a=L-2*inset,b=W-2*inset;let x,y;
    if(s<a){x=inset+s;y=inset;}else if((s-=a)<b){x=L-inset;y=inset+s;}else if((s-=b)<a){x=L-inset-s;y=W-inset;}else{s-=a;x=inset;y=W-inset-s;}
    pts.push({x:geo.x0+x,y:geo.y0+y});}
  return pts;}

/* ---- analysis over all candidates ---- */
function analyze(B,input){
  const inp=Object.assign({P:null,ip:'IP54',vib:2,ta:25,tmax:85,tj:125,mat:'auto',tim:'auto',fins:true,cad:null},input||{});inp.tj=+inp.tj||125;if(inp.tim===true)inp.tim='auto';
  const N=boardNeeds(B,{power:inp.power});if(inp.P==null||inp.P===''||!isFinite(+inp.P))inp.P=Math.round(N.Ptot*100)/100;
  // a heat load given by hand is spread over the heat sources in the same proportions (or put on the biggest IC)
  if(+inp.P>0&&Math.abs(+inp.P-N.Ptot)>1e-6){if(N.Ptot>0){const k=+inp.P/N.Ptot;N.hot.forEach(h=>{h.P*=k;});}else{const c=B.comps.filter(c=>c.pads.length>=8&&!isConn(c)).sort((a,b)=>b.pads.length-a.pads.length)[0];if(c)N.hot=[heatInfo({ref:c.ref,P:+inp.P,c},B.comps)];}N.Ptot=+inp.P;}inp.P=Math.max(0,+inp.P);inp.vib=Math.max(0,+inp.vib||0);inp.ta=+inp.ta;inp.tmax=+inp.tmax;inp.ip=ipKey(inp.ip)||'IP54';
  const all=Object.keys(MATS).map(k=>design(B,inp,k,N));
  const maxC=Math.max(...all.map(d=>d.cost)),maxM=Math.max(...all.map(d=>d.mass));
  all.forEach(d=>{d.costIdx=Math.round(d.cost/maxC*100);d.massIdx=Math.round(d.mass/maxM*100);});
  let pick;if(inp.mat&&inp.mat!=='auto'&&MATS[inp.mat])pick=all.find(d=>d.mat===inp.mat);
  else{const f=all.filter(d=>d.feasible).sort((a,b)=>a.cost-b.cost||a.mass-b.mass);pick=f[0]||all.slice().sort((a,b)=>b.th.margin-a.th.margin)[0];}
  const d=pick;const warn=[];
  if(!d.feasible)warn.push(`${d.m.short}: ${d.why.join(' · ')}`);
  if(!N.holes.length)warn.push('보드에 장착 구멍(무도금 Ø2 mm 이상)이 없어 네 모서리에 보스를 가정했습니다 — 보드에 장착 구멍을 추가하세요.');
  const open=N.cuts.filter(c=>!c.sealed);if(open.length&&IPN[d.ip]>=65)warn.push(`커넥터 ${open.map(c=>c.ref).join(', ')}: ${d.ip}에는 방수 커넥터(씰 일체형) 또는 케이블 글랜드가 필요합니다.`);
  if(d.th.margin<0.25)warn.push(`열 여유 ${(d.th.margin*100).toFixed(0)}% — 강제 공랭, 더 큰 핀, 또는 발열 부품의 하우징 직결 방열(TIM)을 검토하세요.`);
  d.th.parts.forEach(p=>{if(p.Tj>inp.tj)warn.push(`${p.ref} 접합 온도 약 ${p.Tj.toFixed(0)} °C > ${inp.tj} °C — ${p.path?'더 얇은 BLT·고전도 TIM·서멀 비아 추가':'금속 하우징 + TIM 경로 필요'}`);});
  d.th.peds.forEach(p=>{if(p.kind==='bottom'&&p.ep&&p.ep.net&&!/^(GND|AGND|PGND|VSS|0V)$/i.test(p.ep.net))warn.push(`${p.ref}: 방열 패드 넷이 ${p.ep.net} — 하우징(접지)과 닿는 TIM은 전기 절연형이어야 합니다 (${TIMS[p.tim].kv}).`);});
  N.cuts.filter(c=>c.sealed).forEach(c=>{const pr=c.shroudLen-d.geo.rim;if(pr<2)warn.push(`${c.ref}: 슈라우드가 벽 밖으로 ${pr.toFixed(1)} mm만 나옵니다 — 플러그 래치가 걸리려면 2 mm 이상 (벽을 얇게 하거나 창 주변을 오목하게)`);
    if(c.land<1.5)warn.push(`${c.ref}: 플랜지 실링 폭 ${c.land.toFixed(1)} mm — 1.5 mm 이상 필요`);if(c.gap<0.3)warn.push(`${c.ref}: 플랜지가 보드 가장자리 안쪽에 있습니다 — 벽이 보드에 닿습니다.`);});
  if(d.vib.sf<2&&inp.vib>0)warn.push(`PCB 진동 안전율 ${d.vib.sf.toFixed(2)} (목표 2 이상) — 지지점을 늘리거나 두꺼운 PCB(2.0 mm)를 검토하세요.`);
  featWarn({d,N}).forEach(x=>warn.push(x));
  const conds=[];
  if(inp.P>12)conds.push(`발열량 기준 초과 (${inp.P} W > 12 W): 수지 재질 한계로 금속 하우징${d.m.metal?' 및 TIM 적용':''}이 유리`);else if(inp.P>5)conds.push(`발열 ${inp.P} W: 수지는 내부 온도 여유를 확인해야 하는 구간`);else conds.push(`발열 ${inp.P} W: 수지 하우징으로 충분한 구간`);
  conds.push(`방수 및 압력 균형: ${d.ip} — ${d.seal.label}${d.seal.breather?' · 내외부 압력 변동 방지용 벤트 필터 필수':''}`);
  const ped=d.th.peds;if(ped.length)conds.push(`방열 경로: ${ped.map(p=>`${p.ref} ${p.kind==='bottom'?`노출 패드 → 서멀 비아 ${p.vias}개 → ${TIMS[p.tim].short}`:`패키지 윗면 → ${TIMS[p.tim].short}`} (BLT ${p.blt} mm, Tj ${p.Tj.toFixed(0)} °C)`).join(' · ')}`);
  N.cuts.filter(c=>c.sealed).forEach(c=>conds.push(`커넥터 관통부: ${c.ref} ${c.mpn} — 벽 창 ${(c.b-c.a).toFixed(1)} × ${(c.z1-c.z0).toFixed(1)} mm, 헤더 플랜지를 내벽에 FIPG/실리콘 패킹으로 실링(폭 ${c.land.toFixed(1)} mm), 분할면은 창 아래 · 결합 ${c.mate}`));
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
  L.push(`방열: ${d.m.metal?(d.th.peds.length?`TIM + 하우징 페데스탈 ${d.th.peds.length}곳 (베이스 ${d.th.peds.filter(p=>p.kind==='bottom').length} · 커버 ${d.th.peds.filter(p=>p.kind==='top').length})`:'하우징 벽 전도'):'수지 벽 전도 + 내부 대류'}${d.fins?` · 핀 ${d.fins.n}개 (높이 ${d.fins.h.toFixed(0)} mm, 피치 ${(+d.fins.pitch).toFixed(1)} mm)`:''}${d.seal.slots?' · 통풍 슬롯':''} · 자연대류`);
  L.push(`  표면 ${d.th.Ts.toFixed(1)} °C · 내벽 ${d.th.Twin.toFixed(1)} °C · PCB ${d.th.Tboard.toFixed(1)} °C · 내부 공기 약 ${d.th.Tair.toFixed(1)} °C · TIM 경로 ${d.th.Ptim.toFixed(1)} W / ${i.P} W`);
  d.th.parts.forEach(p=>{const q=d.th.peds.find(x=>x.ref===p.ref);L.push(`  ${p.ref.padEnd(4)} ${p.P.toFixed(2)} W → Tj ${p.Tj.toFixed(0)} °C (한계 ${i.tj})${q?` · ${q.kind==='bottom'?`노출 패드 ${q.ep.w.toFixed(1)}×${q.ep.h.toFixed(1)} → 서멀 비아 ${q.vias}개(Ø${VIA.drill}, ${VIA.pitch} mm 피치, 충전·캡핑) → ${TIMS[q.tim].label} → 베이스 페데스탈`:`패키지 윗면 → ${TIMS[q.tim].label} → 커버 페데스탈`} · BLT ${q.blt} mm${q.padT?` (패드 두께 ${q.padT} mm, 압축 ${Math.round(TIMS[q.tim].comp*100)}%)`:' (디스펜싱)'} · 면적 ${q.area.toFixed(0)} mm² · 경로 ${q.R.toFixed(1)} K/W · ${Math.round(q.share*100)}% 전달`:' · 보드로만 방열'}`);});
  L.push(`실링: ${d.seal.gasket} · ${d.seal.vent}`);
  L.push(`체결: 커버 ${d.screwM} 나사 ${d.ns}개 (간격 ≤ ${d.pitch} mm) · PCB 보스 ${d.sup.length}개 (${d.sup.filter(s=>s.kind==='hole').length?'장착 구멍 '+d.sup.filter(s=>s.kind==='hole').length:'모서리 가정 '+d.sup.filter(s=>s.kind==='corner').length}${d.added.length?` + 중앙 지지 ${d.added.length}`:''})${R.inp.vib>=4?' · 내부 대각 보강 리브':''}`);
  L.push(`진동: PCB 1차 고유진동수 ${d.vib.fn.toFixed(0)} Hz · 응답 ${d.vib.gout.toFixed(1)} Grms · 3σ 처짐 ${d.vib.z3.toFixed(3)} mm / 허용 ${d.vib.zAllow.toFixed(3)} mm (${d.vib.part}${d.vib.leadless?' 리드리스':''}) → 안전율 ${d.vib.sf.toFixed(2)}`);
  L.push(`커넥터 개구부: ${R.N.cuts.length?R.N.cuts.map(c=>`${c.ref}(${c.side})`).join(', '):'없음'}`);
  R.N.cuts.filter(c=>c.sealed).forEach(c=>L.push(`  ${c.ref} ${c.mpn} ↔ ${c.mate}: 창 ${(c.b-c.a).toFixed(1)} × ${(c.z1-c.z0).toFixed(1)} mm (슈라우드 + 0.3 mm), 플랜지 ${(c.flange.b-c.flange.a).toFixed(1)} × ${(c.flange.z1-c.flange.z0).toFixed(1)} mm를 내벽에 실링(폭 ${c.land.toFixed(1)} mm) · 보드 끝 → 내벽 ${c.gap.toFixed(1)} mm · 슈라우드 돌출 ${(c.shroudLen-d.geo.rim).toFixed(1)} mm · 분할면 z ${d.geo.zSplit.toFixed(1)} (창 아래) · 플러그 착탈 공간 ${c.plug.keep} mm · ${c.rated}`));
  if(d.feats.length)L.push(`CAD 형상: ${d.feats.map(featLabel).join(' · ')}`);
  L.push(`트레이드오프: 원가 지수 ${R.idx.cost}/100 · 중량 지수 ${R.idx.mass}/100 (약 ${d.mass.toFixed(0)} g) · 방열 여유도 ${R.idx.thermal}% · 내진동 안전율 ${R.idx.vib}%`);
  if(R.warn.length)L.push('경고:\n'+R.warn.map(w=>'  ! '+w).join('\n'));
  return L.join('\n');}
const SIDE_KO={W:'왼쪽 벽',E:'오른쪽 벽',S:'앞 벽',N:'뒤 벽',T:'커버 윗면',B:'바닥'};
function featLabel(f){const id=f.id?f.id+' ':'';switch(f.type){
  case'hole':return`${id}${SIDE_KO[f.side]} ${f.label||'구멍'} Ø${f.w||f.d}`;case'slot':return`${id}${SIDE_KO[f.side]} ${f.label||'사각 구멍'} ${f.w}×${f.h}`;
  case'tabs':return`${id}장착 탭 ${f.tabs?f.tabs.length:f.n}개 (${f.screw||'M5'})`;case'rib':return`${id}바닥 리브 (${f.axis} = ${(+f.pos).toFixed?(+f.pos).toFixed(1):f.pos})`;
  case'label':return`${id}커버 각인 "${f.text}"`;case'boss':return`${id}PCB 보스 ${f.x==null?'(보드 가운데)':`(${f.x}, ${f.y})`}`;case'fins':return f.off?`${id}방열 핀 없음`:`${id}방열 핀 ${f.n}개 ${f.h||12} mm`;default:return id+f.type;}}
function compareText(R){return['재질 비교 (같은 조건):',...R.all.map(d=>`  ${d===R.d?'▶':' '} ${d.m.short.padEnd(14)} 벽 ${d.geo.t} mm · PCB ${d.th.Tboard.toFixed(0)} °C (여유 ${(d.th.margin*100).toFixed(0)}%) · 진동 SF ${d.vib.sf.toFixed(2)} · ${d.mass.toFixed(0)} g · 원가 ${d.costIdx}${d.fins?` · 핀 ${d.fins.n}개`:''}${d.th.peds.length?' · TIM':''} · ${d.feasible?'적합':'부적합: '+d.why.join(', ')}`)].join('\n');}
/* ---- OpenSCAD source (parametric, real CSG) ---- */
function scad(R,name){const d=R.d,g=d.geo,f=v=>(Math.round(v*100)/100).toString();
  const o=[`// ${name||'board'} 하우징 — AllinOneDesign 기구 설계 (${d.m.label}, ${d.ip}, 진동 ${R.inp.vib} Grms)`,`// 좌표: 보드 왼쪽 아래 = (0,0), 보드 중간면 z = 0 (mm)`,`$fn=40;`,
    `wall=${f(g.t)}; rim=${f(g.rim)}; x0=${f(g.x0)}; y0=${f(g.y0)}; Lo=${f(g.Lo)}; Wo=${f(g.Wo)};`,`zFloor=${f(g.zFloor)}; zLid=${f(g.zLid)}; zSplit=${f(g.zSplit)}; r=${f(g.r)};`,
    `module rbox(x,y,z,l,w,h,rr){translate([x,y,z]) hull(){for(i=[rr,l-rr],j=[rr,w-rr]) translate([i,j,0]) cylinder(r=rr,h=h);}}`,
    `module shell(){difference(){rbox(x0,y0,zFloor-wall,Lo,Wo,zLid+wall-(zFloor-wall),r); rbox(x0+rim,y0+rim,zFloor,Lo-2*rim,Wo-2*rim,zLid-zFloor,max(0.5,r-rim/2));`,
    ...R.N.cuts.map(c=>{const w=c.b-c.a,h=c.z1-c.z0;const nm=c.sealed?`${c.ref} ${c.mpn} 창, 플랜지 실링`:c.ref;c={...c,ref:nm};return c.side==='W'?`  translate([x0-1,${f(c.a)},${f(c.z0)}]) cube([rim+2,${f(w)},${f(h)}]); /* ${c.ref} */`:c.side==='E'?`  translate([x0+Lo-rim-1,${f(c.a)},${f(c.z0)}]) cube([rim+2,${f(w)},${f(h)}]); /* ${c.ref} */`:c.side==='S'?`  translate([${f(c.a)},y0-1,${f(c.z0)}]) cube([${f(w)},rim+2,${f(h)}]); /* ${c.ref} */`:`  translate([${f(c.a)},y0+Wo-rim-1,${f(c.z0)}]) cube([${f(w)},rim+2,${f(h)}]); /* ${c.ref} */`;}),
    ...(d.seal.breather?[`  translate([x0+Lo/2,y0+Wo+1,zSplit-4]) rotate([90,0,0]) cylinder(d=12,h=rim+2); // 벤트 필터 M12`]:[]),
    ...d.feats.filter(x=>x.type==='hole'||x.type==='slot').map(x=>{const H=x.type==='hole',tag=`/* ${x.id||''} ${x.label||(H?'구멍':'사각 구멍')} */`;
      if(x.side==='T'||x.side==='B'){const z=x.side==='T'?'zLid-1':'zFloor-wall-1';return H?`  translate([${f(x.x)},${f(x.y)},${z}]) cylinder(d=${f(x.w)},h=wall+2); ${tag}`:`  translate([${f(x.x-x.w/2)},${f(x.y-x.h/2)},${z}]) cube([${f(x.w)},${f(x.h)},wall+2]); ${tag}`;}
      const base=x.side==='W'?`x0-1`:x.side==='E'?`x0+Lo-rim-1`:x.side==='S'?`y0-1`:`y0+Wo-rim-1`;
      if(H)return x.side==='W'||x.side==='E'?`  translate([${base},${f(x.a)},${f(x.z)}]) rotate([0,90,0]) cylinder(d=${f(x.w)},h=rim+2); ${tag}`:`  translate([${f(x.a)},${base},${f(x.z)}]) rotate([-90,0,0]) cylinder(d=${f(x.w)},h=rim+2); ${tag}`;
      return x.side==='W'||x.side==='E'?`  translate([${base},${f(x.a-x.w/2)},${f(x.z-x.h/2)}]) cube([rim+2,${f(x.w)},${f(x.h)}]); ${tag}`:`  translate([${f(x.a-x.w/2)},${base},${f(x.z-x.h/2)}]) cube([${f(x.w)},rim+2,${f(x.h)}]); ${tag}`;}),
    ...d.feats.filter(x=>x.type==='label').map(x=>`  translate([${f(x.x)},${f(x.y)},zLid+wall-0.6]) linear_extrude(1) text("${String(x.text||'').replace(/["\\]/g,'')}",size=${f(x.size)},halign="center",valign="center"); /* ${x.id||''} 각인 */`),
    `}}`,
    `module pcb_bosses(){${d.sup.map(s=>`translate([${f(s.x)},${f(s.y)},zFloor]) difference(){cylinder(d=${s.d>3.4?9:7},h=${f(g.stand)}); cylinder(d=${s.d>3.4?3.3:2.5},h=${f(g.stand+1)});}`).join(' ')}}`,
    `module lid_screws(){${d.screws.map(s=>`translate([${f(s.x)},${f(s.y)},zFloor]) difference(){cylinder(d=${d.screwM==='M4'?9:7.5},h=zSplit-zFloor); cylinder(d=${d.screwM==='M4'?3.3:2.5},h=zSplit-zFloor+1);}`).join(' ')}}`,
    `module pedestals(){${d.th.peds.filter(p=>p.kind==='top').map(p=>{const q=p.ped;return`translate([${f(q.x)},${f(q.y)},${f(q.z0)}]) cube([${f(q.w)},${f(q.h)},${f(q.z1-q.z0)}]); /* ${p.ref}: ${TIMS[p.tim].short}, BLT ${p.blt} mm */`;}).join(' ')}}`,
    `module base_pedestals(){${d.th.peds.filter(p=>p.kind==='bottom').map(p=>{const q=p.ped;return`translate([${f(q.x)},${f(q.y)},${f(q.z0-0.5)}]) cube([${f(q.w)},${f(q.h)},${f(q.z1-q.z0+0.5)}]); /* ${p.ref}: 서멀 비아 ${p.vias} + ${TIMS[p.tim].short}, BLT ${p.blt} mm */`;}).join(' ')}}`,
    `module fins(){${d.fins?`for(i=[0:${d.fins.n-1}]) translate([x0+5+i*${d.fins.pitch},y0+4,zLid+wall]) cube([${d.fins.t},${f(d.fins.len)},${f(d.fins.h)}]);`:''}}`,
    `module tabs(){${d.feats.filter(x=>x.type==='tabs').map(x=>x.tabs.map(t=>`translate([${f(t.cx-t.sx/2)},${f(t.cy-t.sy/2)},${f(x.z0)}]) difference(){cube([${f(t.sx)},${f(t.sy)},${f(x.tt)}]); translate([${f(t.hx-(t.cx-t.sx/2))},${f(t.hy-(t.cy-t.sy/2))},-1]) cylinder(d=${f(x.hd)},h=${f(x.tt+2)});}`).join(' ')).join(' ')}}`,
    `module ribs(){${d.feats.filter(x=>x.type==='rib').map(x=>x.axis==='x'?`translate([x0+rim,${f(x.pos-x.tt/2)},zFloor]) cube([Lo-2*rim,${f(x.tt)},${f(x.h)}]);`:`translate([${f(x.pos-x.tt/2)},y0+rim,zFloor]) cube([${f(x.tt)},Wo-2*rim,${f(x.h)}]);`).join(' ')}}`,
    `module base(){intersection(){union(){shell(); pcb_bosses(); lid_screws(); base_pedestals(); tabs(); ribs();} translate([x0-60,y0-60,zFloor-wall-1]) cube([Lo+120,Wo+120,zSplit-(zFloor-wall)+1]);}}`,
    `module lid(){intersection(){union(){shell(); pedestals(); fins();} translate([x0-1,y0-1,zSplit]) cube([Lo+2,Wo+2,zLid+wall+40-zSplit]);}}`,
    `base();`,`translate([0,0,15]) lid(); // 열린 상태로 보기 — 조립은 translate 제거`];
  return o.join('\n')+'\n';}
return{MATS,TIMS,IPS,ipKey,SEAL,SIDE_KO,SCREW_D,featLabel,boardNeeds,pcbVibration,analyze,text,compareText,scad};
})();
if(typeof module!=='undefined')module.exports=HOUSING;
