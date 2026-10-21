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
/* ---- outline-following housings: polygon helpers (rings are [x,y] lists, made counter-clockwise) ---- */
const ringArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);return a/2;}; // > 0 for counter-clockwise
const ringCCW=r=>ringArea(r)<0?r.slice().reverse():r.slice();
const ringPerim=r=>{let p=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];p+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return p;};
const ringBBox=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
// offset a CCW ring outward by d (inward when d < 0): per-edge offset, mitred at the corners (bevelled when the mitre gets long)
function offsetRing(ring,d){const r=ringCCW(ring).filter((p,i,a)=>{const q=a[(i+1)%a.length];return Math.hypot(q[0]-p[0],q[1]-p[1])>1e-6;});const n=r.length;if(n<3||!d)return r.slice();const out=[];
  const E=r.map((p,i)=>{const q=r[(i+1)%n];const dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1;return{nx:dy/L,ny:-dx/L};}); // outward normal of edge i (CCW ring)
  for(let i=0;i<n;i++){const e0=E[(i+n-1)%n],e1=E[i];const p=r[i];const mx=e0.nx+e1.nx,my=e0.ny+e1.ny;const ml=Math.hypot(mx,my);
    if(ml<1e-6){out.push([p[0]+e1.nx*d,p[1]+e1.ny*d]);continue;}const cos=(mx*e1.nx+my*e1.ny)/ml;const k=d/Math.max(cos,0.35);
    if(cos<0.35&&d>0){out.push([p[0]+e0.nx*d,p[1]+e0.ny*d]);out.push([p[0]+e1.nx*d,p[1]+e1.ny*d]);}else out.push([p[0]+mx/ml*k,p[1]+my/ml*k]);}
  return out;}
// n points spread evenly along a ring by arc length (lid screws)
function ringPoints(ring,n){const r=ringCCW(ring);const per=ringPerim(r);const pts=[];let i=0,acc=0;
  for(let k=0;k<n;k++){const s=(k+0.5)/n*per;while(true){const a=r[i],b=r[(i+1)%r.length];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(acc+L>=s||i>=r.length*2){const t=L?Math.min(1,Math.max(0,(s-acc)/L)):0;pts.push({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t});break;}acc+=L;i=(i+1)%r.length;}}
  return pts;}
// where a ray from p in direction dir first leaves the ring: point and outward normal of that edge
function ringHit(ring,p,dir){const r=ringCCW(ring);let best=null;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];const ex=b[0]-a[0],ey=b[1]-a[1];const den=dir[0]*ey-dir[1]*ex;if(Math.abs(den)<1e-9)continue;
    const t=((a[0]-p[0])*ey-(a[1]-p[1])*ex)/den,u=((a[0]-p[0])*dir[1]-(a[1]-p[1])*dir[0])/den;if(t>=0&&u>=0&&u<=1&&(!best||t<best.t)){const L=Math.hypot(ex,ey)||1;best={t,x:p[0]+dir[0]*t,y:p[1]+dir[1]*t,nx:ey/L,ny:-ex/L};}}
  return best;}
function shapedBoard(B){const ring=B.outline&&B.outline[0];if(!ring||ring.length<3)return false;if(B.shape)return!/^(rect|round)$/.test(B.shape.kind);
  const bb=ringBBox(ring);const full=(bb[2]-bb[0])*(bb[3]-bb[1]);return Math.abs(ringArea(ring))<full*0.9;}
function boardNeeds(B,opts){
  opts=opts||{};const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const bb=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  const comps=B.comps.filter(c=>c.kind!=='none'&&c.body);
  const htTop=Math.max(0,...comps.filter(c=>c.side!=='B').map(c=>c.body.ht||0)),htBot=Math.max(0,...comps.filter(c=>c.side==='B').map(c=>c.body.ht||0));
  const holes=B.drills.filter(d=>!d.plated&&!d.own&&!d._pad&&d.d>=2).map(d=>({x:d.x,y:d.y,d:d.d}));
  const shaped=shapedBoard(B),shapeKind=shaped?(B.shape&&B.shape.kind||'poly'):'rect';
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
  return{bb,W:bb[2]-bb[0],H:bb[3]-bb[1],t:B.t||1.6,ring:ring.map(p=>[p[0],p[1]]),shaped,shapeKind,htTop,htBot,holes,cuts,hot,Ptot:hot.reduce((s,h)=>s+h.P,0),big:ics[0]||null,compMass};
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
  if(N.shaped){geo.shape=N.shapeKind;const gi=Math.max(gp.W,gp.E,gp.S,gp.N);geo.ringI=offsetRing(N.ring,gi);geo.ringO=offsetRing(N.ring,gi+rim);
    const bo=ringBBox(geo.ringO);geo.Lo=bo[2]-bo[0];geo.Wo=bo[3]-bo[1];geo.Li=geo.Lo-2*rim;geo.Wi=geo.Wo-2*rim;geo.areaO=Math.abs(ringArea(geo.ringO));geo.areaI=Math.abs(ringArea(geo.ringI));geo.perO=ringPerim(geo.ringO);}
  geo.x0=N.bb[0]-gp.W-rim;geo.y0=N.bb[1]-gp.S-rim;if(geo.ringO){const bo=ringBBox(geo.ringO);geo.x0=bo[0];geo.y0=bo[1];}geo.zFloor=-N.t/2-stand;geo.zLid=N.t/2+top;geo.zSplit=N.t/2+Math.min(top-1,Math.max(1.5,top*0.4));geo.tAuto=tAuto;geo.r=num(O.corner)?Math.max(0,Math.min(+O.corner,geo.Wo/2-1,geo.Lo/2-1)):3;const E=(inp.cad&&inp.cad.edge)||{};geo.vk=E.V==='chamfer'?'chamfer':'fillet';
  // a sealed connector window must lie wholly in the cover: the split line drops below it, leaving a seal land under the window
  const win=N.cuts.filter(c=>c.sealed);if(win.length){geo.zSplit=Math.max(geo.zFloor+2,Math.min(geo.zSplit,Math.min(...win.map(c=>c.z0))-1.8));geo.splitWin=true;}
  if(num(O.split))geo.zSplit=Math.max(geo.zFloor+1,Math.min(geo.zLid-1,+O.split));
  // outer edge treatment of the cover top and the base bottom perimeters: fillet (R) or chamfer (C), kept off the split line
  {const Zb=geo.zFloor-t,Zt=geo.zLid+t;const lim=(e,room)=>e&&+e.r>0?{k:e.k==='chamfer'?'chamfer':'fillet',r:+Math.max(0.2,Math.min(+e.r,room,geo.Lo/2-1,geo.Wo/2-1)).toFixed(2),req:+e.r}:null;
    geo.eT=lim(E.T,Zt-geo.zSplit-1);geo.eB=lim(E.B,geo.zSplit-Zb-1);}
  // supports: mounting holes (or corners), centre supports until the PCB safety factor reaches 2
  const inBoard=(x,y)=>{let c=false;const r=N.ring;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;};
  let sup=N.holes.length?N.holes.map(h=>({x:h.x,y:h.y,d:h.d,kind:'hole'})):N.shaped?ringPoints(offsetRing(N.ring,-4),4).map(p=>({x:p.x,y:p.y,d:3.2,kind:'corner'})):[[3.5,3.5],[N.W-3.5,3.5],[3.5,N.H-3.5],[N.W-3.5,N.H-3.5]].map(([x,y])=>({x:N.bb[0]+x,y:N.bb[1]+y,d:3.2,kind:'corner'}));
  F.filter(f=>f.type==='boss').forEach(f=>sup.push({x:f.x==null?N.bb[0]+N.W/2:+f.x,y:f.y==null?N.bb[1]+N.H/2:+f.y,d:+(f.d||3.2),kind:'user',id:f.id}));
  let vib=pcbVibration(N,sup,inp.vib);const added=[];
  for(let k=0;k<3&&inp.vib>0&&vib.sf<2;k++){const cands=[[0.5,0.5],[0.5,0.25],[0.5,0.75],[0.25,0.5],[0.75,0.5]].map(([u,v])=>({x:N.bb[0]+u*N.W,y:N.bb[1]+v*N.H,d:3.2,kind:'centre'}));
    const pick=cands.find(c=>(!N.shaped||inBoard(c.x,c.y))&&!sup.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<15));if(!pick)break;sup=sup.concat([pick]);added.push(pick);vib=pcbVibration(N,sup,inp.vib);}
  // lid screws: pitch from the IP code (even gasket pressure) and vibration
  const screwM=inp.vib>=5||Math.max(N.W,N.H)>150?'M4':'M3';const pitch=Math.min(S.pitch,inp.vib>=5?60:S.pitch);
  const per=2*(geo.Lo+geo.Wo);let ns=Math.max(4,Math.ceil(per/pitch));if(ns%2)ns++;
  const screws=geo.ringO?ringPoints(offsetRing(geo.ringO,-(geo.rim+(screwM==='M4'?4.5:3.75)*0.45)),ns):perimeterPoints(geo,ns,screwM==='M4'?4.5:3.75);
  // fins when the plain box runs too hot (metal only)
  N.nsup=sup.length;let th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,null);let fins=null;const fu=F.find(f=>f.type==='fins');
  if(fu&&!fu.off){const nF=Math.max(1,Math.round(+fu.n||10)),hf=Math.max(2,+fu.h||12),pitchF=+fu.pitch||Math.max(3,(geo.Lo-10)/nF);fins={n:nF,h:hf,t:+fu.t||2,pitch:pitchF,len:geo.Wo-8,area:nF*2*hf*(geo.Wo-8),user:true};th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,fins);}
  else if(!fu&&m.metal&&matKey!=='spcc'&&(th.margin<0.3||th.hotJ.length)&&inp.fins!==false){const pitchF=8,hf=Math.min(25,Math.max(8,inp.P*0.8)),nF=Math.floor((geo.Lo-10)/pitchF);fins={n:nF,h:hf,t:2,pitch:pitchF,len:geo.Wo-8,area:nF*2*hf*(geo.Wo-8)};th=thermal(m,geo,Object.assign({},inp,{slots:S.slots}),N,fins);}
  if(fins&&geo.ringO){const inR=(x,y)=>{let c=false;const r=geo.ringI;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;};
    const keep=[];for(let k=0;k<fins.n;k++){const x=geo.x0+5+k*fins.pitch+fins.t/2;if(inR(x,geo.y0+4)&&inR(x,geo.y0+4+fins.len))keep.push(k);}fins.keep=keep;fins.area=keep.length*2*fins.h*fins.len;}
  // user CAD features (text-to-CAD console): wall / cover / floor holes and slots, mounting tabs, floor ribs, an engraved label
  const feats=cadFeatures(F,geo,N,sup);const fv=feats.reduce((a,f)=>a+(f.vol||0),0),fc=feats.reduce((a,f)=>a+(f.cost||0),0);
  // mass and a relative cost
  const vol=fv+(geo.ringO?geo.areaO*geo.Ho-geo.areaI*geo.Hi:geo.Lo*geo.Wo*geo.Ho-geo.Li*geo.Wi*geo.Hi)+sup.length*Math.PI*9*stand+ns*Math.PI*16*geo.Hi*0.5+(fins?fins.n*fins.t*fins.h*fins.len:0)+th.peds.reduce((a,p)=>a+p.ped.w*p.ped.h*Math.max(0,p.ped.z1-p.ped.z0),0);
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
function featWarn(R){const d=R.d,g=d.geo,w=[];const IPN_=IPN[d.ip]||0;const eT=g.eT?g.eT.r:0,eB=g.eB?g.eB.r:0,Zb=g.zFloor-g.t,Zt=g.zLid+g.t;
  [['eT','커버 윗면 둘레','분할면'],['eB','바닥 둘레','분할면']].forEach(([k,nm])=>{const e=g[k];if(e&&e.r<e.req-1e-6)w.push(`${nm} ${e.k==='chamfer'?'C':'R'}${e.req} → ${e.k==='chamfer'?'C':'R'}${e.r}로 줄였습니다 (면에서 분할면 z ${g.zSplit.toFixed(1)}까지 높이 · 외형 한계).`);});
  if(g.eT&&g.eT.r>g.t&&g.eT.k==='fillet')w.push(`커버 윗면 R${g.eT.r}가 벽 두께 ${g.t} mm보다 커 안쪽도 R${(g.eT.r-g.t).toFixed(1)}로 따라 둥글어집니다 (커버 안쪽 높이 여유 확인).`);
  d.feats.forEach(f=>{const nm=`${f.id||'?'} ${f.type==='hole'?`구멍 Ø${f.w}`:f.type==='slot'?`사각 구멍 ${f.w}×${f.h}`:''}`;
    if(f.type==='hole'||f.type==='slot'){
      if(f.side==='T'||f.side==='B'){const mg=Math.max(g.rim,f.side==='T'?eT:eB);if(f.x-f.w/2<g.x0+mg||f.x+f.w/2>g.x0+g.Lo-mg||f.y-f.h/2<g.y0+mg||f.y+f.h/2>g.y0+g.Wo-mg)w.push(`${nm}: ${f.side==='T'?'커버':'바닥'} 가장자리(실링 플랜지${(f.side==='T'?eT:eB)>0?'·모서리 R/C':''})에 걸립니다.`);
        if(f.side==='T')d.th.peds.filter(p=>p.kind==='top').forEach(p=>{const q=p.ped;if(f.x+f.w/2>q.x&&f.x-f.w/2<q.x+q.w&&f.y+f.h/2>q.y&&f.y-f.h/2<q.y+q.h)w.push(`${nm}: ${p.ref} 방열 페데스탈과 겹칩니다.`);});
        if(f.side==='B')d.th.peds.filter(p=>p.kind==='bottom').forEach(p=>{const q=p.ped;if(f.x+f.w/2>q.x&&f.x-f.w/2<q.x+q.w&&f.y+f.h/2>q.y&&f.y-f.h/2<q.y+q.h)w.push(`${nm}: ${p.ref} 베이스 페데스탈과 겹칩니다.`);});}
      else{const L=f.side==='S'||f.side==='N'?[g.x0,g.x0+g.Lo]:[g.y0,g.y0+g.Wo];
        if(f.a-f.w/2<L[0]+g.r||f.a+f.w/2>L[1]-g.r)w.push(`${nm}: 벽 끝(모서리 R)에 걸립니다.`);
        if(f.z+f.h/2>g.zLid+g.t-0.5||f.z-f.h/2<g.zFloor-g.t+0.5)w.push(`${nm}: 벽 높이 밖으로 나갑니다.`);
        else if(f.z+f.h/2>Zt-eT||f.z-f.h/2<Zb+eB)w.push(`${nm}: ${f.z>0?'윗면':'바닥'} 모서리 ${f.z>0?(g.eT.k==='chamfer'?'C':'R'):(g.eB.k==='chamfer'?'C':'R')} 띠에 걸립니다 — 높이를 옮기세요.`);
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
function text(R){const d=R.d,i=R.inp,g=d.geo;const L=[];if(g.ringO)L.push(`보드 외곽을 따르는 하우징 (${({circle:'원형',oval:'타원',hex:'육각형',oct:'팔각형',L:'L자형',T:'T자형',poly:'다각형'})[g.shape]||g.shape}) · 바닥 면적 ${g.areaO.toFixed(0)} mm² · 둘레 ${g.perO.toFixed(0)} mm`);
  L.push(`하우징 설계 · 발열 ${i.P} W · ${d.ip} · 진동 ${i.vib} Grms · 주위 ${i.ta} °C · PCB 한계 ${i.tmax} °C`);
  L.push('설계 조건:');R.conds.forEach(c=>L.push('  • '+c));
  L.push(`재질: ${d.m.label} · 벽두께 ${g.t} mm${g.rim>g.t?` (실링 플랜지 ${g.rim} mm)`:''} · 공정 ${d.m.proc_label}`);
  L.push(`모서리: ${edgeText(g)}`);
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
// applied edge treatment from the geometry: vertical corners + cover top / base bottom perimeters
function edgeText(g){const t=e=>(e.k==='chamfer'?'C':'R')+e.r;return[`세로 ${g.r>0?(g.vk==='chamfer'?'C':'R')+g.r:'없음'}`,g.eT?`윗면 ${t(g.eT)}`:null,g.eB?`바닥 ${t(g.eB)}`:null].filter(Boolean).join(' · ');}
// [z, inset] layers of an outline that is filleted/chamfered at the bottom (eb) and top (et) edges, z from 0 to h
function edgeLayers(h,eb,et,n){n=n||6;const L=[];const band=(e,top)=>{if(!e||!(e.r>0))return[[top?h:0,0]];const out=[];
    if(e.k==='chamfer')out.push([0,e.r],[e.r,0]);else for(let i=0;i<=n;i++){const a=i/n*Math.PI/2;out.push([e.r*(1-Math.cos(a)),e.r*(1-Math.sin(a))]);}
    return top?out.map(([z,s])=>[h-z,s]).reverse():out;};
  band(eb,false).forEach(p=>L.push(p));band(et,true).forEach(p=>L.push(p));
  return L.filter((p,i)=>i===0||Math.abs(p[0]-L[i-1][0])>1e-6||Math.abs(p[1]-L[i-1][1])>1e-6);}
const SIDE_KO={W:'왼쪽 벽',E:'오른쪽 벽',S:'앞 벽',N:'뒤 벽',T:'커버 윗면',B:'바닥'};
function featLabel(f){const id=f.id?f.id+' ':'';switch(f.type){
  case'hole':return`${id}${SIDE_KO[f.side]} ${f.label||'구멍'} Ø${f.w||f.d}`;case'slot':return`${id}${SIDE_KO[f.side]} ${f.label||'사각 구멍'} ${f.w}×${f.h}`;
  case'tabs':return`${id}장착 탭 ${f.tabs?f.tabs.length:f.n}개 (${f.screw||'M5'})`;case'rib':return`${id}바닥 리브 (${f.axis} = ${(+f.pos).toFixed?(+f.pos).toFixed(1):f.pos})`;
  case'label':return`${id}커버 각인 "${f.text}"`;case'boss':return`${id}PCB 보스 ${f.x==null?'(보드 가운데)':`(${f.x}, ${f.y})`}`;case'fins':return f.off?`${id}방열 핀 없음`:`${id}방열 핀 ${f.n}개 ${f.h||12} mm`;default:return id+f.type;}}
function compareText(R){return['재질 비교 (같은 조건):',...R.all.map(d=>`  ${d===R.d?'▶':' '} ${d.m.short.padEnd(14)} 벽 ${d.geo.t} mm · PCB ${d.th.Tboard.toFixed(0)} °C (여유 ${(d.th.margin*100).toFixed(0)}%) · 진동 SF ${d.vib.sf.toFixed(2)} · ${d.mass.toFixed(0)} g · 원가 ${d.costIdx}${d.fins?` · 핀 ${d.fins.n}개`:''}${d.th.peds.length?' · TIM':''} · ${d.feasible?'적합':'부적합: '+d.why.join(', ')}`)].join('\n');}
/* ---- 2D drawing (기구 도면): top view + front (S) + right (E) elevations with the main dimensions, as SVG (mm → px) ---- */
function drawingSVG(R,name,opts){opts=opts||{};const d=R.d,g=d.geo,S=opts.scale||4,M=18*S/4;const xe=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const f=v=>(Math.round(v*10)/10).toString(),f2=v=>(Math.round(v*100)/100).toString();
  const Zb=g.zFloor-g.t,Zt=g.zLid+g.t,Ho=Zt-Zb;const gap=26*S/4;
  // sheet layout: top view (Lo × Wo) above the front elevation (Lo × Ho), right elevation (Wo × Ho) beside it
  const dimPad=16*S/4;const ext={W:0,E:0,S:0,N:0};d.feats.filter(fe=>fe.type==='tabs').forEach(fe=>fe.tabs.forEach(t=>{ext.W=Math.max(ext.W,g.x0-(t.cx-t.sx/2));ext.E=Math.max(ext.E,t.cx+t.sx/2-g.x0-g.Lo);ext.S=Math.max(ext.S,g.y0-(t.cy-t.sy/2));ext.N=Math.max(ext.N,t.cy+t.sy/2-g.y0-g.Wo);}));
  const x0=M+dimPad*2.3+ext.W*S,yTop=M+dimPad+ext.N*S;const yFront=yTop+g.Wo*S+ext.S*S+gap+dimPad*1.3+14;const xRight=x0+g.Lo*S+ext.E*S+gap+dimPad*1.6;
  const W=xRight+g.Wo*S+M+dimPad,H=yFront+Ho*S+M+dimPad*1.3+30*S/4;
  const o=[];const line=(x1,y1,x2,y2,c,w,dash)=>o.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${c||'#1d2126'}" stroke-width="${w||1}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  const text=(x,y,t,sz,anchor,rot)=>o.push(`<text x="${f2(x)}" y="${f2(y)}" font-size="${sz||10}" text-anchor="${anchor||'middle'}" fill="#1d2126"${rot?` transform="rotate(${rot} ${f2(x)} ${f2(y)})"`:''}>${xe(t)}</text>`);
  const rect=(x,y,w,h,rx,fill,stroke,sw,dash)=>o.push(`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"${rx?` rx="${f2(rx)}"`:''} fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="${sw||1.2}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  const circle=(x,y,r,fill,stroke,dash)=>o.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="1"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  // dimension line with arrows and a label; horizontal (dir 'h') below/above or vertical (dir 'v')
  const dim=(x1,y1,x2,y2,label,dir,off)=>{const a=3.2;if(dir==='h'){const y=y1+off;line(x1,y1,x1,y+(off>0?a:-a),'#5a6872',.8);line(x2,y2,x2,y+(off>0?a:-a),'#5a6872',.8);line(x1,y,x2,y,'#5a6872',.9);
      o.push(`<path d="M${f2(x1)} ${f2(y)} l${a*1.6} ${-a*.55} v${a*1.1} z M${f2(x2)} ${f2(y)} l${-a*1.6} ${-a*.55} v${a*1.1} z" fill="#5a6872"/>`);text((x1+x2)/2,y-3,label,9.5);}
    else{const x=x1+off;line(x1,y1,x+(off>0?a:-a),y1,'#5a6872',.8);line(x2,y2,x+(off>0?a:-a),y2,'#5a6872',.8);line(x,y1,x,y2,'#5a6872',.9);
      o.push(`<path d="M${f2(x)} ${f2(y1)} l${-a*.55} ${a*1.6} h${a*1.1} z M${f2(x)} ${f2(y2)} l${-a*.55} ${-a*1.6} h${a*1.1} z" fill="#5a6872"/>`);text(x+(off>0?10:-10),(y1+y2)/2,label,9.5,'middle',90);}};
  const TX=x=>x0+(x-g.x0)*S,TY=y=>yTop+(g.y0+g.Wo-y)*S;   // top view: board y up → svg y down
  const FY=z=>yFront+(Zt-z)*S;                              // elevations: z up → svg y down
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(W)} ${f2(H)}" width="${f2(W)}" height="${f2(H)}" font-family="IBM Plex Sans KR, system-ui, sans-serif" style="background:#fff">`);
  o.push(`<rect x="0" y="0" width="${f2(W)}" height="${f2(H)}" fill="#fff"/>`);
  // ---- top view
  text(x0,yTop-dimPad-4*S/4,'평면도 (커버 위에서)',11,'start');
  const poly=(ring,fill,stroke,sw,dash)=>o.push(`<path d="M${ring.map(p=>`${f2(TX(p[0]))} ${f2(TY(p[1]))}`).join(' L')} Z" fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="${sw||1}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  if(g.ringO){poly(g.ringO,'#f6f3ec','#1d2126',1.4);poly(g.ringI,'none','#9aa3ab',.8,'3 2');}
  else{rect(TX(g.x0),TY(g.y0+g.Wo),g.Lo*S,g.Wo*S,g.r*S,'#f6f3ec','#1d2126',1.4);
  rect(TX(g.x0+g.rim),TY(g.y0+g.Wo-g.rim),(g.Lo-2*g.rim)*S,(g.Wo-2*g.rim)*S,Math.max(0,g.r-g.rim)*S,'none','#9aa3ab',.8,'3 2');}
  // board outline (hidden)
  if(R.N.shaped)poly(R.N.ring,'none','#2f7d4f',.9,'4 2');else rect(TX(R.N.bb[0]),TY(R.N.bb[1]+R.N.H),R.N.W*S,R.N.H*S,0,'none','#2f7d4f',.9,'4 2');
  d.sup.forEach(s=>{circle(TX(s.x),TY(s.y),3.5*S,'none','#1d2126','3 2');circle(TX(s.x),TY(s.y),(s.d>3.4?1.65:1.25)*S,'none','#1d2126');});
  d.screws.forEach(s=>{circle(TX(s.x),TY(s.y),(d.screwM==='M4'?2.25:1.75)*S,'#fff','#1d2126');line(TX(s.x)-2.6*S,TY(s.y),TX(s.x)+2.6*S,TY(s.y),'#1d2126',.6);line(TX(s.x),TY(s.y)-2.6*S,TX(s.x),TY(s.y)+2.6*S,'#1d2126',.6);});
  d.feats.forEach(fe=>{if(fe.type==='tabs')fe.tabs.forEach(t=>{rect(TX(t.cx-t.sx/2),TY(t.cy+t.sy/2),t.sx*S,t.sy*S,1.5*S,'#fff','#1d2126',1.1);circle(TX(t.hx),TY(t.hy),fe.hd/2*S,'#fff','#1d2126');});
    else if((fe.type==='hole'||fe.type==='slot')&&(fe.side==='T'||fe.side==='B')){if(fe.type==='hole')circle(TX(fe.x),TY(fe.y),fe.w/2*S,'#fff','#1d2126',fe.side==='B'?'3 2':null);else rect(TX(fe.x-fe.w/2),TY(fe.y+fe.h/2),fe.w*S,fe.h*S,0,'#fff','#1d2126',1,fe.side==='B'?'3 2':null);text(TX(fe.x),TY(fe.y)-fe.h/2*S-3,`${fe.id} ${fe.type==='hole'?'Ø'+f(fe.w):f(fe.w)+'×'+f(fe.h)}`,8.5);}
    else if(fe.type==='label'){text(TX(fe.x),TY(fe.y)+3,fe.text,Math.max(8,fe.size*S*0.9));}
    else if(fe.type==='fins'&&d.fins){for(let k=0;k<d.fins.n;k++){const x=g.x0+5+k*d.fins.pitch;if(x+d.fins.t>g.x0+g.Lo-2)break;rect(TX(x),TY(g.y0+4+d.fins.len),d.fins.t*S,d.fins.len*S,0,'#e6e2d8','#6b7076',.6);}}});
  if(d.fins&&!d.feats.some(fe=>fe.type==='fins'))for(let k=0;k<d.fins.n;k++){const x=g.x0+5+k*d.fins.pitch;if(x+d.fins.t>g.x0+g.Lo-2)break;rect(TX(x),TY(g.y0+4+d.fins.len),d.fins.t*S,d.fins.len*S,0,'#e6e2d8','#6b7076',.6);}
  // wall openings seen from the top as marks on the edge
  R.N.cuts.concat(d.feats.filter(fe=>(fe.type==='hole'||fe.type==='slot')&&!/^[TB]$/.test(fe.side)).map(fe=>({ref:fe.id,side:fe.side,a:fe.a-fe.w/2,b:fe.a+fe.w/2}))).forEach(c=>{const col='#c0392b';
    if(c.side==='S')line(TX(c.a),TY(g.y0),TX(c.b),TY(g.y0),col,3);else if(c.side==='N')line(TX(c.a),TY(g.y0+g.Wo),TX(c.b),TY(g.y0+g.Wo),col,3);else if(c.side==='W')line(TX(g.x0),TY(c.a),TX(g.x0),TY(c.b),col,3);else line(TX(g.x0+g.Lo),TY(c.a),TX(g.x0+g.Lo),TY(c.b),col,3);});
  dim(TX(g.x0),TY(g.y0),TX(g.x0+g.Lo),TY(g.y0),`${f(g.Lo)}`,'h',dimPad*0.75);
  dim(TX(g.x0),TY(g.y0+g.Wo),TX(g.x0),TY(g.y0),`${f(g.Wo)}`,'v',-dimPad*0.75);
  // ---- front elevation (wall S, looking from -y): x along, z up
  text(x0,yFront-dimPad*1.3-16,'정면도 (앞 벽 S)',11,'start');
  const frontWall=(side,X,len)=>{const xw=u=>X+(u)*S;rect(X,FY(Zt),len*S,Ho*S,0,'#f6f3ec','#1d2126',1.4);
    line(X,FY(g.zSplit),X+len*S,FY(g.zSplit),'#1d2126',.9,'6 3');text(X+4,FY(g.zSplit)-3,'분할면 (베이스 / 커버)',8,'start');
    line(X,FY(R.N.t/2),X+len*S,FY(R.N.t/2),'#2f7d4f',.8,'4 2');line(X,FY(-R.N.t/2),X+len*S,FY(-R.N.t/2),'#2f7d4f',.8,'4 2');
    const o0=side==='S'||side==='N'?g.x0:g.y0;const mir=side==='N'||side==='W';const U=a=>mir?xw(o0+len-a):xw(a-o0);
    R.N.cuts.filter(c=>c.side===side).forEach(c=>{const a=U(c.a),b=U(c.b);rect(Math.min(a,b),FY(c.z1),Math.abs(b-a),(c.z1-c.z0)*S,0,'#fff','#c0392b',1);text((a+b)/2,FY(c.z1)-3,c.ref,8.5);});
    d.feats.filter(fe=>(fe.type==='hole'||fe.type==='slot')&&fe.side===side).forEach(fe=>{const u=U(fe.a);if(fe.type==='hole'){circle(u,FY(fe.z),fe.w/2*S,'#fff','#1d2126');text(u,FY(fe.z)-fe.w/2*S-3,`${fe.id} Ø${f(fe.w)}`,8.5);}
      else{rect(u-fe.w/2*S,FY(fe.z+fe.h/2),fe.w*S,fe.h*S,0,'#fff','#1d2126');text(u,FY(fe.z+fe.h/2)-3,`${fe.id} ${f(fe.w)}×${f(fe.h)}`,8.5);}
      dim(U(o0),FY(Zt),u,FY(Zt),`${f(mir?o0+len-fe.a:fe.a-o0)}`,'h',-dimPad*0.6-(fe.z>g.zSplit?0:9));dim(u,FY(Zb),u,FY(fe.z),`${f(fe.z-Zb)}`,'v',(mir?-1:1)*(fe.w/2*S+9));});
    d.feats.filter(fe=>fe.type==='tabs').forEach(fe=>fe.tabs.forEach(t=>{const horiz=side==='S'||side==='N';const span=horiz?[t.cx-t.sx/2,t.cx+t.sx/2]:[t.cy-t.sy/2,t.cy+t.sy/2];const a=U(span[0]),b=U(span[1]);rect(Math.min(a,b),FY(fe.z0+fe.tt),Math.abs(b-a),fe.tt*S,0,'#fff','#1d2126',1);}));};
  frontWall('S',x0,g.Lo);
  dim(x0,FY(Zb),x0+g.Lo*S,FY(Zb),`${f(g.Lo)}`,'h',dimPad*0.75);
  dim(x0,FY(Zt),x0,FY(Zb),`${f(Ho)}`,'v',-dimPad*0.75);
  dim(x0,FY(g.zSplit),x0,FY(Zb),`${f(g.zSplit-Zb)}`,'v',-dimPad*0.75-24);
  // ---- right elevation (wall E, looking from +x): y along (front at left), z up
  text(xRight,yFront-dimPad*1.3-16,'우측면도 (오른쪽 벽 E)',11,'start');
  frontWall('E',xRight,g.Wo);
  dim(xRight,FY(Zb),xRight+g.Wo*S,FY(Zb),`${f(g.Wo)}`,'h',dimPad*0.75);
  // title block
  const tb=[`${name||'board'} 하우징`,`${d.m.label} · 벽 ${g.t} mm${g.rim>g.t?` · 플랜지 ${g.rim} mm`:''} · ${d.ip} · 모서리 ${edgeText(g)}`,`외형 ${f(g.Lo)} × ${f(g.Wo)} × ${f(Ho)} mm · 단위 mm · 축척 1:1 기준 (${S} px/mm) · AllinOneDesign 기구 설계`];
  o.push(`<rect x="${f2(M)}" y="${f2(H-M-26*S/4)}" width="${f2(W-2*M)}" height="${f2(26*S/4)}" fill="#fff" stroke="#1d2126" stroke-width="1"/>`);
  tb.forEach((t,i)=>text(M+6,H-M-26*S/4+10+i*8.5*S/4,t,i?8.5:10.5,'start'));
  o.push('</svg>');return o.join('\n');}

/* ---- mechanical BOM: the two machined/moulded parts, seals, fasteners, inserts, glands, vents, TIMs ----
   Part numbers HSG-01 (base) / HSG-02 (cover) match the part drawings. Prices are rough reference estimates (USD). */
const STD_L=[4,5,6,8,10,12,14,16,18,20,25,30];
const stdLen=v=>STD_L.find(x=>x>=v)||Math.ceil(v/5)*5;
function rrPerim(L,W,r){r=Math.max(0,Math.min(r,L/2,W/2));return 2*(L+W)-(8-2*Math.PI)*r;}
// the cover flange a screw clamps: a counterbored pocket from the top leaves this much material under the head
const screwGrip=g=>Math.min(g.zLid+g.t-g.zSplit,g.t+2);
function partMass(R){const d=R.d,g=d.geo,m=d.m;const Zb=g.zFloor-g.t,Zt=g.zLid+g.t;const per=g.ringO?ringPerim(offsetRing(g.ringO,-g.rim/2)):rrPerim(g.Lo-g.rim,g.Wo-g.rim,Math.max(0,g.r-g.rim/2));const plate=g.ringO?g.areaO:g.Lo*g.Wo;
  const ring=(Ro,ri,h)=>Math.PI*(Ro*Ro-ri*ri)*Math.max(0,h);
  let vb=plate*g.t+per*g.rim*Math.max(0,g.zSplit-g.zFloor);
  d.sup.forEach(s=>{vb+=ring(s.d>3.4?4.5:3.5,s.d>3.4?1.65:1.25,g.stand);});d.screws.forEach(()=>{vb+=ring(d.screwM==='M4'?4.5:3.75,d.screwM==='M4'?1.65:1.25,g.zSplit-g.zFloor);});
  d.th.peds.filter(p=>p.kind==='bottom').forEach(p=>{vb+=p.ped.w*p.ped.h*Math.max(0,p.ped.z1-p.ped.z0);});d.feats.forEach(f=>{if(f.type==='tabs'||f.type==='rib')vb+=f.vol||0;});
  let vl=plate*g.t+per*g.rim*Math.max(0,g.zLid-g.zSplit);d.th.peds.filter(p=>p.kind==='top').forEach(p=>{vl+=p.ped.w*p.ped.h*Math.max(0,p.ped.z1-p.ped.z0);});
  if(d.fins)vl+=d.fins.n*d.fins.t*d.fins.h*d.fins.len;
  const gk=v=>v*1e-9*m.rho*1000;return{base:gk(vb),lid:gk(vl),hBase:g.zSplit-Zb,hLid:Zt-g.zSplit};}
function mechBom(R){const d=R.d,g=d.geo,m=d.m,S=d.seal;const PM=partMass(R);const rows=[];let no=0;
  const add=(o)=>{rows.push(Object.assign({no:++no,qty:1,unit:'EA',src:'구매',cost:null,note:''},o));};
  const surf=m.metal?(d.mat==='a6063'?'아노다이징 (흑색 또는 투명)':d.mat==='az91d'?'화성 처리 + 분체 도장':d.mat==='spcc'?'인산염 처리 + 분체 도장':'쇼트 블라스트 + 투명 크로메이트'):'무도장 (텍스처 MT-11010)';
  const pc=gm=>+(gm/1000*m.costKg*m.proc).toFixed(2);
  const lbl=d.feats.find(f=>f.type==='label');
  add({pn:'HSG-01',name:'베이스 (하우징 하부)',spec:`${f1(g.Lo)} × ${f1(g.Wo)} × ${f1(PM.hBase)} mm · 벽 ${g.t} mm${g.rim>g.t?` · 플랜지 ${g.rim} mm`:''} · PCB 보스 ${d.sup.length} · 커버 나사 보스 ${d.ns}${d.feats.some(f=>f.type==='tabs')?' · 장착 탭':''}${d.feats.some(f=>f.type==='rib')||R.inp.vib>=4?' · 리브':''}`,mat:m.label,proc:m.proc_label,src:'제작',mass:+PM.base.toFixed(0),cost:pc(PM.base),dwg:'HSG-01',note:`표면: ${surf} · 모서리 ${edgeText(g)}`});
  add({pn:'HSG-02',name:'커버 (하우징 상부)',spec:`${f1(g.Lo)} × ${f1(g.Wo)} × ${f1(PM.hLid)} mm · 윗판 ${g.t} mm${d.th.peds.some(p=>p.kind==='top')?` · 방열 페데스탈 ${d.th.peds.filter(p=>p.kind==='top').length}`:''}${d.fins?` · 방열 핀 ${d.fins.n}개 × ${d.fins.h.toFixed(0)} mm`:''}${S.groove?' · O-링 홈':''}`,mat:m.label,proc:m.proc_label,src:'제작',mass:+PM.lid.toFixed(0),cost:pc(PM.lid),dwg:'HSG-02',note:`표면: ${surf}${lbl?` · 각인 "${lbl.text}" (${m.metal?'레이저 각인':'금형 양각'})`:''}`});
  // seal on the split line
  const sealLen=rrPerim(g.Lo-g.rim,g.Wo-g.rim,Math.max(0,g.r-g.rim/2));
  if(S.gasket&&!/^없음/.test(S.gasket)){const oring=/O-링/.test(S.gasket);const cs=+((S.gasket.match(/Ø([\d.]+)/)||[])[1]||2);
    add({pn:'HSG-10',name:oring?'O-링 (분할면 실링)':'개스킷 (분할면 실링)',spec:oring?`${S.gasket} · 둘레 ${f1(sealLen)} mm (내경 약 ${f1(sealLen/Math.PI-cs)} mm 상당)`:`${S.gasket} · 길이 ${f1(sealLen)} mm (양면 접착, 끝단 맞대기)`,mat:/FKM/.test(S.gasket)?'FKM 70 Shore A':oring?'실리콘 VMQ 60 Shore A':'EPDM 발포',proc:oring?'성형품':'타발',cost:+(oring?0.15+sealLen*0.002:0.1+sealLen*0.001).toFixed(2),note:oring?`커버 홈: 폭 ${f1(cs*1.3)} × 깊이 ${f1(cs*0.75)} mm (압축 25%)`:'베이스 플랜지 위에 부착'});}
  // cover screws: through the cover flange into the base boss
  const metal=m.metal;const sd=d.screwM;const Lc=stdLen(screwGrip(g)+(sd==='M4'?8:6));
  add({pn:'HSG-20',name:'커버 체결 나사',spec:metal?`${sd} × ${Lc} 버튼 헤드 볼트 (ISO 7380) · 베이스 보스 탭 ${sd}`:`${sd} × ${Lc} 기계 나사 (ISO 7045 팬 헤드) · 베이스 보스 열 압입 인서트`,mat:'스테인리스 A2-70',qty:d.ns,cost:+(0.03*d.ns).toFixed(2),note:`간격 ≤ ${d.pitch} mm · 체결 토크 ${sd==='M4'?'1.6':'0.9'} N·m${S.groove||/개스킷/.test(S.gasket)?' · 대각 순서로 체결':''}`});
  if(!metal)add({pn:'HSG-21',name:'열 압입 인서트',spec:`${sd} 황동 인서트 (길이 ${sd==='M4'?6:5} mm) · 커버 나사용`,mat:'황동 C3604',qty:d.ns,cost:+(0.05*d.ns).toFixed(2),note:`보스 구멍 Ø${sd==='M4'?'5.6':'4.0'} mm`});
  // PCB to base
  const pcbT=(R.N.t||1.6);const pcbM=d.sup.some(s=>s.d>=3.4)?'M3':d.sup.some(s=>s.d>=2.7)?'M2.5':'M2';const Lp=stdLen(pcbT+(metal?4:5));
  add({pn:'HSG-22',name:'PCB 고정 나사',spec:metal?`${pcbM} × ${Lp} 팬 헤드 + 스프링 와셔 · 보스 탭`:`${pcbM} × ${Lp} 셀프 태핑 (델타 PT형)`,mat:'스테인리스 A2',qty:d.sup.length,cost:+(0.03*d.sup.length).toFixed(2),note:`보스 ${d.sup.filter(s=>s.kind==='hole').length?'보드 장착 구멍 위치':'모서리 가정 (보드에 장착 구멍 추가 필요)'} · 높이 ${g.stand} mm`});
  // glands and vents
  const gl={};d.feats.filter(f=>f.type==='hole'&&(f.kind==='gland'||/글랜드/.test(f.label||''))).forEach(f=>{const k=(f.label||'').match(/(M|PG)\d+/)?(f.label.match(/(M|PG)\d+/)[0]):`Ø${f.w}`;(gl[k]=gl[k]||[]).push(f.id);});
  Object.entries(gl).forEach(([k,ids])=>add({pn:'HSG-30',name:'케이블 글랜드',spec:`${k}${/^M/.test(k)?' × 1.5':''} · IP68 · 로크너트 포함`,mat:'PA66 (UL94 V-2) · 실 NBR',qty:ids.length,cost:+((/M2[05]|PG1[13]/.test(k)?0.9:0.6)*ids.length).toFixed(2),note:`위치 ${ids.join(', ')}`}));
  const vents=d.feats.filter(f=>f.type==='hole'&&(f.kind==='vent'||/벤트/.test(f.label||''))).map(f=>f.id);const nv=vents.length+(S.breather?1:0);
  if(nv)add({pn:'HSG-31',name:'ePTFE 벤트 필터',spec:`M12 × 1.5 나사식 · IP68/IP69K · 통기량 ≥ 300 ml/min`,mat:'ePTFE 멤브레인 · PA 하우징',qty:nv,cost:+(1.2*nv).toFixed(2),note:[S.breather?'뒤 벽 자동':'',vents.join(', ')].filter(Boolean).join(' · ')});
  // thermal interface per pedestal
  d.th.peds.forEach(p=>{const T=TIMS[p.tim];const a=p.ped.w*p.ped.h;
    if(T.form==='디스펜싱')add({pn:'HSG-40',name:`방열 갭 필러 (${p.ref})`,spec:`${T.label} · 도포 ${f1(p.ped.w)} × ${f1(p.ped.h)} mm × BLT ${p.blt} mm`,mat:T.label,qty:+(a*p.blt*1.15*3.2/1000).toFixed(2),unit:'g',proc:'디스펜싱',cost:+(T.costCm2*a/100).toFixed(2),note:`${p.kind==='bottom'?'베이스':'커버'} 페데스탈 · ${T.kv}`});
    else add({pn:'HSG-40',name:`방열 갭 패드 (${p.ref})`,spec:`${T.label} · ${f1(p.ped.w)} × ${f1(p.ped.h)} × ${p.padT} mm (압축 후 ${p.blt} mm)`,mat:T.label,proc:'타발',cost:+(T.costCm2*a/100).toFixed(2),note:`${p.kind==='bottom'?'베이스':'커버'} 페데스탈 · ${T.kv}`});});
  // sealed connector flange
  R.N.cuts.filter(c=>c.sealed).forEach(c=>{const L=2*((c.flange.b-c.flange.a)+(c.flange.z1-c.flange.z0));add({pn:'HSG-50',name:`커넥터 플랜지 실링 (${c.ref})`,spec:`FIPG 실리콘 비드 Ø1.5 · 길이 ${f1(L)} mm`,mat:'1액형 RTV 실리콘',qty:+(L*1.77*1.1/1000).toFixed(2),unit:'g',proc:'디스펜싱',cost:0.05,note:`${c.mpn||''} 창 둘레 · 플랜지 폭 ${c.land.toFixed(1)} mm`});});
  // customer side (reference)
  const tabs=d.feats.find(f=>f.type==='tabs');if(tabs)add({pn:'(참고)',name:'장착 볼트 (차량/설비 측)',spec:`${tabs.screw||'M5'} · 탭 ${tabs.tabs.length}곳 (구멍 Ø${tabs.hd})`,mat:'—',qty:tabs.tabs.length,src:'별도',note:'하우징 BOM 수량에서 제외'});
  return rows;}
const f1=v=>(Math.round(v*10)/10).toString();
function mechBomAoa(R){const rows=mechBom(R);const tot=rows.reduce((a,r)=>a+(r.src==='별도'?0:+r.cost||0),0),mass=rows.reduce((a,r)=>a+(+r.mass||0),0);
  return[['No','품번','품명','사양','재질','수량','단위','조달','공정','질량 g','참고 단가(USD, 추정)','도면','비고'],...rows.map(r=>[r.no,r.pn,r.name,r.spec,r.mat,r.qty,r.unit,r.src,r.proc||'',r.mass!=null?r.mass:'',r.cost!=null?r.cost:'',r.dwg||'',r.note||'']),['','','합계','','','','','','',+mass.toFixed(0),+tot.toFixed(2),'','하우징 부품 질량 합 (나사·씰 제외)']];}
/* ---- part drawings: HSG-01 base / HSG-02 cover — plan view with hole IDs, section A–A, hole and opening tables, notes, title block ---- */
function partSVG(R,name,part,opts){opts=opts||{};const d=R.d,g=d.geo,m=d.m;const isBase=part!=='lid';const PM=partMass(R);
  const xe=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const f2=v=>(Math.round(v*100)/100).toString();
  const Zb=g.zFloor-g.t,Zt=g.zLid+g.t;const h0=isBase?Zb:g.zSplit,h1=isBase?g.zSplit:Zt,Hp=h1-h0;
  const S=Math.max(1.6,Math.min(5,520/g.Lo,330/g.Wo));const M=20,dp=26;
  // datum: outer corner (x0, y0) of the part = X 0, Y 0; Z from the part's bottom face
  const X=x=>x-g.x0,Y=y=>y-g.y0;
  // ---- hole/feature table
  const T=[];let k=0;const id=p=>p+(++k);
  if(isBase){k=0;d.sup.forEach(s=>T.push({id:id('B'),kind:'PCB 보스',x:X(s.x),y:Y(s.y),dia:`OD ${s.d>3.4?9:7} / ${s.d>3.4?'M3 탭 (Ø2.5 기초)':'M2.5 탭 (Ø2.05 기초)'}`,depth:`높이 ${g.stand} (바닥 안쪽 면에서)`}));
    k=0;d.screws.forEach(s=>T.push({id:id('S'),kind:'커버 나사 보스',x:X(s.x),y:Y(s.y),dia:`OD ${d.screwM==='M4'?9:7.5} / ${m.metal?`${d.screwM} 탭`:`인서트 Ø${d.screwM==='M4'?'5.6':'4.0'}`}`,depth:`분할면까지 ${f2(g.zSplit-g.zFloor)}`}));
    k=0;d.th.peds.filter(p=>p.kind==='bottom').forEach(p=>T.push({id:id('P'),kind:`방열 페데스탈 (${p.ref})`,x:X(p.ped.x+p.ped.w/2),y:Y(p.ped.y+p.ped.h/2),dia:`${f2(p.ped.w)} × ${f2(p.ped.h)}`,depth:`윗면 Z ${f2(p.ped.z1-Zb)}`}));
    k=0;d.feats.filter(f=>f.type==='tabs').forEach(f=>f.tabs.forEach(t=>T.push({id:id('T'),kind:`장착 탭 (${f.id})`,x:X(t.hx),y:Y(t.hy),dia:`Ø${f.hd} 관통`,depth:`탭 두께 ${f.tt}`})));
    d.feats.filter(f=>f.type==='rib').forEach(f=>T.push({id:f.id,kind:'바닥 리브',x:f.axis==='y'?X(f.pos):X(g.x0+g.Lo/2),y:f.axis==='x'?Y(f.pos):Y(g.y0+g.Wo/2),dia:`${f.axis} 방향 · 두께 ${f.tt}`,depth:`높이 ${f2(f.h)}`}));}
  else{k=0;d.screws.forEach(s=>T.push({id:id('S'),kind:'커버 나사 구멍',x:X(s.x),y:Y(s.y),dia:`Ø${d.screwM==='M4'?'4.5':'3.4'} 관통 · 카운터보어 Ø${d.screwM==='M4'?'8.0':'6.5'}`,depth:Hp-screwGrip(g)>0.05?`카운터보어 깊이 ${f2(Hp-screwGrip(g))} (윗면에서) · 남는 두께 ${f2(screwGrip(g))}`:`플랜지 두께 ${f2(Hp)}`}));
    k=0;d.th.peds.filter(p=>p.kind==='top').forEach(p=>T.push({id:id('P'),kind:`방열 페데스탈 (${p.ref})`,x:X(p.ped.x+p.ped.w/2),y:Y(p.ped.y+p.ped.h/2),dia:`${f2(p.ped.w)} × ${f2(p.ped.h)}`,depth:`윗판 안쪽에서 ${f2(g.zLid-p.ped.z0)} 돌출`}));}
  const flat=d.feats.filter(f=>(f.type==='hole'||f.type==='slot')&&f.side===(isBase?'B':'T'));
  flat.forEach(f=>T.push({id:f.id,kind:f.label||(f.type==='hole'?'구멍':'사각 구멍'),x:X(f.x),y:Y(f.y),dia:f.type==='hole'?`Ø${f2(f.w)} 관통`:`${f2(f.w)} × ${f2(f.h)} 관통`,depth:`판 ${g.t}`}));
  // wall openings that fall in this part (by the opening's centre height)
  const inPart=(z0,z1)=>{const zc=(z0+z1)/2;return isBase?zc<g.zSplit:zc>=g.zSplit;};
  const SK=SIDE_KO;const along=s=>s==='S'||s==='N'?g.x0:g.y0;const O=[];
  R.N.cuts.filter(c=>inPart(c.z0,c.z1)).forEach(c=>O.push({id:c.ref,side:c.side,u:c.a-along(c.side),w:c.b-c.a,z:c.z0-h0,h:c.z1-c.z0,kind:c.sealed?`방수 커넥터 창 (${c.mpn||''})`:'커넥터 창'}));
  d.feats.filter(f=>(f.type==='hole'||f.type==='slot')&&!/^[TB]$/.test(f.side)&&inPart(f.z-f.h/2,f.z+f.h/2)).forEach(f=>O.push({id:f.id,side:f.side,u:f.a-along(f.side)-f.w/2,w:f.w,z:f.z-f.h/2-h0,h:f.h,kind:f.label||(f.type==='hole'?`구멍 Ø${f2(f.w)}`:'사각 구멍'),round:f.type==='hole',cu:f.a-along(f.side),cz:f.z-h0}));
  if(!isBase&&false){}
  if(isBase&&d.seal.breather&&g.zSplit-4<g.zSplit)O.push({id:'V',side:'N',u:g.Lo/2-6,w:12,z:g.zSplit-4-6-h0,h:12,kind:'ePTFE 벤트 M12 (자동)',round:true,cu:g.Lo/2,cz:g.zSplit-4-h0});
  // ---- layout
  const planW=g.Lo*S,planH=g.Wo*S,secH=Hp*S+ (isBase?0:(d.fins?d.fins.h*S:0));
  const px=M+dp*1.6,py=M+44;const sx=px+planW+dp*2.4;const secW=Math.max(260,Math.min(g.Lo*S*0.9,420));const sS=secW/g.Lo;
  const rowH=15;const tblY=py+Math.max(planH+dp*1.6,(Hp+(isBase?0:(d.fins?d.fins.h:0)))*sS+dp*2.2+150)+18;
  const Wsv=Math.max(sx+secW+dp*1.5+M,M*2+780);const tblH=(T.length+1)*rowH+(O.length?(O.length+2)*rowH+30:0)+20;const H=tblY+tblH+64+M;
  const o=[];const line=(x1,y1,x2,y2,c,w,dash)=>o.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${c||'#1d2126'}" stroke-width="${w||1}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  const text=(x,y,t,sz,an,w,col)=>o.push(`<text x="${f2(x)}" y="${f2(y)}" font-size="${sz||10}" text-anchor="${an||'middle'}"${w?` font-weight="${w}"`:''} fill="${col||'#1d2126'}">${xe(t)}</text>`);
  const rect=(x,y,w,h,rx,fill,stroke,sw,dash)=>o.push(`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(Math.max(0,w))}" height="${f2(Math.max(0,h))}"${rx?` rx="${f2(rx)}"`:''} fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="${sw||1.2}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  const circle=(x,y,r,fill,stroke,sw,dash)=>o.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="${sw||1}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  const dim=(x1,y1,x2,y2,label,dir,off)=>{const a=3.2,c='#5a6872';if(dir==='h'){const y=y1+off;line(x1,y1,x1,y+(off>0?a:-a),c,.7);line(x2,y2,x2,y+(off>0?a:-a),c,.7);line(x1,y,x2,y,c,.8);
      o.push(`<path d="M${f2(x1)} ${f2(y)} l${a*1.6} ${-a*.55} v${a*1.1} z M${f2(x2)} ${f2(y)} l${-a*1.6} ${-a*.55} v${a*1.1} z" fill="${c}"/>`);text((x1+x2)/2,y-3,label,9);}
    else{const x=x1+off;line(x1,y1,x+(off>0?a:-a),y1,c,.7);line(x2,y2,x+(off>0?a:-a),y2,c,.7);line(x,y1,x,y2,c,.8);
      o.push(`<path d="M${f2(x)} ${f2(y1)} l${-a*.55} ${a*1.6} h${a*1.1} z M${f2(x)} ${f2(y2)} l${-a*.55} ${-a*1.6} h${a*1.1} z" fill="${c}"/>`);o.push(`<text x="${f2(x+(off>0?10:-6))}" y="${f2((y1+y2)/2)}" font-size="9" text-anchor="middle" fill="#1d2126" transform="rotate(-90 ${f2(x+(off>0?10:-6))} ${f2((y1+y2)/2)})">${xe(label)}</text>`);}};
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(Wsv)} ${f2(H)}" width="${f2(Wsv)}" height="${f2(H)}" font-family="IBM Plex Sans KR, system-ui, sans-serif" style="background:#fff">`);
  o.push(`<defs><pattern id="hat${part}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#5a6872" stroke-width="0.8"/></pattern></defs>`);
  o.push(`<rect width="${f2(Wsv)}" height="${f2(H)}" fill="#fff"/><rect x="${M/2}" y="${M/2}" width="${f2(Wsv-M)}" height="${f2(H-M)}" fill="none" stroke="#1d2126" stroke-width="1.2"/>`);
  text(M+4,M+14,`${isBase?'HSG-01 베이스':'HSG-02 커버'} — 부품도`,14,'start','700');text(Wsv-M-4,M+14,`${name||'board'} 하우징`,11,'end');
  // ---- plan view
  const PX=x=>px+X(x)*S,PY=y=>py+(g.Wo-Y(y))*S;
  text(px,py-8,isBase?'평면도 (안쪽, 위에서 본 면)':'평면도 (바깥, 위에서 본 면) — 안쪽 요소는 점선',10.5,'start','600');
  const polyP=(ring,fill,stroke,sw,dash)=>o.push(`<path d="M${ring.map(q=>`${f2(PX(q[0]))} ${f2(PY(q[1]))}`).join(' L')} Z" fill="${fill||'none'}" stroke="${stroke||'#1d2126'}" stroke-width="${sw||1}"${dash?` stroke-dasharray="${dash}"`:''}/>`);
  if(g.ringO){polyP(g.ringO,'#f6f3ec','#1d2126',1.4);polyP(g.ringI,'none',isBase?'#1d2126':'#9aa3ab',isBase?1:.8,isBase?null:'3 2');
    if(!isBase&&g.eT)polyP(offsetRing(g.ringO,-g.eT.r),'none','#6b7076',.7);if(isBase&&g.eB)polyP(offsetRing(g.ringO,-g.eB.r),'none','#9aa3ab',.6,'2 2');
    if(!isBase&&d.seal.groove){const ins=g.rim/2;polyP(offsetRing(g.ringO,-(ins-0.6)),'none','#2f6fb5',.8,'5 2');}}
  else{rect(px,py,planW,planH,g.r*S,'#f6f3ec','#1d2126',1.4);
  rect(px+g.rim*S,py+g.rim*S,(g.Lo-2*g.rim)*S,(g.Wo-2*g.rim)*S,Math.max(0,g.r-g.rim)*S,'none',isBase?'#1d2126':'#9aa3ab',isBase?1:.8,isBase?null:'3 2');
  if(!isBase&&g.eT){const i=g.eT.r*S;rect(px+i,py+i,planW-2*i,planH-2*i,Math.max(0,g.r-g.eT.r)*S,'none','#6b7076',.7);}
  if(isBase&&g.eB){const i=g.eB.r*S;rect(px+i,py+i,planW-2*i,planH-2*i,Math.max(0,g.r-g.eB.r)*S,'none','#9aa3ab',.6,'2 2');}
  if(!isBase&&d.seal.groove){const ins=g.rim/2;rect(px+(ins-0.6)*S,py+(ins-0.6)*S,(g.Lo-2*ins+1.2)*S,(g.Wo-2*ins+1.2)*S,Math.max(0,g.r-ins)*S,'none','#2f6fb5',.8,'5 2');}}
  const tag=(x,y,t,dx,dy)=>{text(x+(dx||0),y+(dy||-6),t,8.5,'middle','600','#b5541c');};
  T.forEach(t=>{const x=PX(t.x+g.x0),y=PY(t.y+g.y0);
    if(/^B\d/.test(t.id)){circle(x,y,(d.sup[0]&&d.sup[0].d>3.4?4.5:3.5)*S,'#fff','#1d2126',1);circle(x,y,1.25*S,'none','#1d2126',.8);tag(x,y,t.id,0,-(3.5*S+3));}
    else if(/^S\d/.test(t.id)){const R0=(d.screwM==='M4'?4.5:3.75)*S;if(isBase){circle(x,y,R0,'#fff','#1d2126',1);circle(x,y,1.25*S,'none','#1d2126',.8);}else{circle(x,y,(d.screwM==='M4'?4:3.25)*S,'#fff','#1d2126',1);circle(x,y,(d.screwM==='M4'?2.25:1.7)*S,'none','#1d2126',.9);}tag(x,y,t.id,0,-(R0+3));}
    else if(/^P\d/.test(t.id)){const p=d.th.peds.filter(q=>q.kind===(isBase?'bottom':'top'))[+t.id.slice(1)-1];if(p)rect(PX(p.ped.x),PY(p.ped.y+p.ped.h),p.ped.w*S,p.ped.h*S,0,`url(#hat${part})`,'#1d2126',.9,isBase?null:'3 2');tag(x,y,t.id,0,-(p?p.ped.h*S/2+3:6));}
    else if(/^T\d/.test(t.id)){const f=d.feats.find(q=>q.type==='tabs');const tb=f&&f.tabs[+t.id.slice(1)-1];if(tb){rect(PX(tb.cx-tb.sx/2),PY(tb.cy+tb.sy/2),tb.sx*S,tb.sy*S,1.5*S,'#fff','#1d2126',1.1);circle(x,y,f.hd/2*S,'#fff','#1d2126');}tag(x,y,t.id,0,-(f?f.hd/2*S+3:6));}});
  if(isBase)d.feats.filter(f=>f.type==='rib').forEach(f=>{if(f.axis==='x')rect(px+g.rim*S,PY(f.pos+f.tt/2),(g.Lo-2*g.rim)*S,f.tt*S,0,'#e6e2d8','#1d2126',.8);else rect(PX(f.pos-f.tt/2),py+g.rim*S,f.tt*S,(g.Wo-2*g.rim)*S,0,'#e6e2d8','#1d2126',.8);tag(f.axis==='x'?px+planW/2:PX(f.pos),f.axis==='x'?PY(f.pos):py+planH/2,f.id);});
  flat.forEach(f=>{const x=PX(f.x),y=PY(f.y);if(f.type==='hole')circle(x,y,f.w/2*S,'#fff','#1d2126',1.1);else rect(x-f.w/2*S,y-f.h/2*S,f.w*S,f.h*S,0,'#fff','#1d2126',1.1);tag(x,y,f.id,0,-(f.h/2*S+3));});
  if(!isBase){const lb=d.feats.find(f=>f.type==='label');if(lb)text(PX(lb.x),PY(lb.y)+3,lb.text,Math.max(8,lb.size*S*0.85),'middle','600','#6b7076');
    if(d.fins)for(let i=0;i<d.fins.n;i++){const x=g.x0+5+i*d.fins.pitch;if(x+d.fins.t>g.x0+g.Lo-2)break;rect(PX(x),PY(g.y0+4+d.fins.len),d.fins.t*S,d.fins.len*S,0,'#e6e2d8','#6b7076',.5);}}
  O.forEach(c=>{const col='#c0392b',u0=c.u,u1=c.u+c.w;if(c.side==='S')line(px+u0*S,py+planH,px+u1*S,py+planH,col,3);else if(c.side==='N')line(px+u0*S,py,px+u1*S,py,col,3);else if(c.side==='W')line(px,py+planH-u1*S,px,py+planH-u0*S,col,3);else line(px+planW,py+planH-u1*S,px+planW,py+planH-u0*S,col,3);});
  // datum + overall dims + section line
  o.push(`<path d="M${f2(px)} ${f2(py+planH)} m-7 0 l7 -7 l7 7 z" fill="#1d2126"/>`);text(px-10,py+planH+12,'기준 A (0,0)',8,'start');
  dim(px,py+planH,px+planW,py+planH,f1(g.Lo),'h',dp*0.9);dim(px,py,px,py+planH,f1(g.Wo),'v',-dp*0.9);
  const ay=py+planH/2;line(px-12,ay,px+planW+12,ay,'#b5541c',.8,'10 3 2 3');text(px-14,ay+3,'A',10,'end','700','#b5541c');text(px+planW+14,ay+3,'A',10,'start','700','#b5541c');
  // ---- section A–A (through the middle, looking from the front)
  const sy0=py+18,QX=x=>sx+(x-g.x0)*sS,QZ=z=>sy0+(h1+(isBase?0:(d.fins?d.fins.h:0))-z)*sS;
  text(sx,py-8,'단면 A–A',10.5,'start','600');
  const L=g.Lo,rim=g.rim,t=g.t;
  // solid outline of the section: U shape (base: floor + walls up to split; cover: top plate + walls down to split)
  const pts=isBase?[[0,h0],[L,h0],[L,h1],[L-rim,h1],[L-rim,g.zFloor],[rim,g.zFloor],[rim,h1],[0,h1]]:[[0,h1],[L,h1],[L,h0],[L-rim,h0],[L-rim,g.zLid],[rim,g.zLid],[rim,h0],[0,h0]];
  o.push(`<path d="M${pts.map(([x,z])=>`${f2(QX(g.x0+x))} ${f2(QZ(z))}`).join(' L')} Z" fill="url(#hat${part})" stroke="#1d2126" stroke-width="1.3"/>`);
  if(isBase){d.sup.slice(0,2).forEach(s=>{const xb=s.x;rect(QX(xb-3.5),QZ(g.zFloor+g.stand),7*sS,g.stand*sS,0,`url(#hat${part})`,'#1d2126',1);});
    dim(QX(g.x0),QZ(h0),QX(g.x0),QZ(h1),`${f2(Hp)}`,'v',-dp*0.8);dim(QX(g.x0+L),QZ(h0),QX(g.x0+L),QZ(g.zFloor),`${t}`,'v',dp*0.6);
    if(d.sup[0])dim(QX(d.sup[0].x+3.5),QZ(g.zFloor),QX(d.sup[0].x+3.5),QZ(g.zFloor+g.stand),`${g.stand}`,'v',dp*0.5);
    dim(QX(g.x0+L-rim),QZ(h1),QX(g.x0+L),QZ(h1),`${rim}`,'h',-dp*0.55);}
  else{d.th.peds.filter(p=>p.kind==='top').slice(0,3).forEach(p=>rect(QX(p.ped.x),QZ(g.zLid),p.ped.w*sS,(g.zLid-p.ped.z0)*sS,0,`url(#hat${part})`,'#1d2126',1));
    if(d.fins)for(let i=0;i<d.fins.n;i++){const x=g.x0+5+i*d.fins.pitch;if(x+d.fins.t>g.x0+g.Lo-2)break;rect(QX(x),QZ(h1+d.fins.h),d.fins.t*sS,d.fins.h*sS,0,`url(#hat${part})`,'#1d2126',.6);}
    if(d.seal.groove){const cs=+((d.seal.gasket.match(/Ø([\d.]+)/)||[])[1]||2);[g.rim/2,L-g.rim/2].forEach(xc=>rect(QX(g.x0+xc-cs*0.65),QZ(h0+cs*0.75),cs*1.3*sS,cs*0.75*sS,0,'#fff','#2f6fb5',.9));}
    dim(QX(g.x0),QZ(h0),QX(g.x0),QZ(h1),`${f2(Hp)}`,'v',-dp*0.8);dim(QX(g.x0+L),QZ(g.zLid),QX(g.x0+L),QZ(h1),`${t}`,'v',dp*0.6);
    if(d.fins)dim(QX(g.x0+L-2),QZ(h1),QX(g.x0+L-2),QZ(h1+d.fins.h),`핀 ${d.fins.h.toFixed(0)}`,'v',dp*1.3);}
  dim(QX(g.x0),QZ(h0),QX(g.x0+L),QZ(h0),f1(L),'h',dp*0.8);
  // ---- notes
  const surf=mechBom(R).find(r=>r.pn===(isBase?'HSG-01':'HSG-02'));const notes=[`재질: ${m.label}`,`공정: ${m.proc_label}${/사출|다이캐스팅/.test(m.proc_label)?' · 빼기 구배 1° (외측) / 1.5° (내측)':''}`,(surf&&surf.note||'').split(' · ')[0],
    `일반 공차: ISO 2768-m · 평면도 ${isBase?'분할면':'분할면·페데스탈 면'} 0.1`,`모서리: ${edgeText(g)} · 지시 없는 모서리 R0.5`,
    isBase?`분할면 실링: ${d.seal.gasket}`:d.seal.groove?`O-링 홈: 폭 ${f1(((d.seal.gasket.match(/Ø([\d.]+)/)||[])[1]||2)*1.3)} × 깊이 ${f1(((d.seal.gasket.match(/Ø([\d.]+)/)||[])[1]||2)*0.75)} mm (파란 점선)`:`분할면: ${d.seal.gasket}`,
    !isBase&&g.rim<(d.screwM==='M4'?8:6.5)+2?`커버 나사 위치: 벽 안쪽에 Ø${d.screwM==='M4'?11:9.5} 보스로 카운터보어 둘레 보강`:'',
    `질량 (추정): ${(isBase?PM.base:PM.lid).toFixed(0)} g · Z 기준 = ${isBase?'바닥 바깥 면':'분할면'}`];
  const ny=sy0+(Hp+(isBase?0:(d.fins?d.fins.h:0)))*sS+dp*1.6+10;text(sx,ny,'주기',10.5,'start','600');notes.filter(Boolean).forEach((n,i)=>text(sx,ny+16+i*14,`${i+1}. ${n}`,9,'start'));
  // ---- tables
  let ty=tblY;const cols=[[M+4,'ID',40],[M+44,'종류',190],[M+234,'X',60],[M+294,'Y',60],[M+354,'크기',230],[M+584,'높이·깊이',200]];
  text(M+4,ty-6,'구멍·형상 표 (기준 A에서, mm)',10,'start','600');
  rect(M,ty,Wsv-2*M,rowH,0,'#f1f3f5','#c7cdd2',.8);cols.forEach(([x,h])=>text(x+2,ty+11,h,9,'start','600'));ty+=rowH;
  T.forEach(t=>{rect(M,ty,Wsv-2*M,rowH,0,'none','#e3e6ea',.6);[t.id,t.kind,f2(t.x),f2(t.y),t.dia,t.depth].forEach((v,i)=>text(cols[i][0]+2,ty+11,v,9,'start',i?null:'600',i?null:'#b5541c'));ty+=rowH;});
  if(O.length){ty+=26;text(M+4,ty-8,'벽 개구 표 (u = 벽 시작 모서리에서, z = 이 부품 아래 면에서, mm)',10,'start','600');ty+=4;const oc=[[M+4,'ID'],[M+70,'면'],[M+150,'종류'],[M+400,'u'],[M+460,'폭'],[M+520,'z'],[M+580,'높이']];
    rect(M,ty,Wsv-2*M,rowH,0,'#f1f3f5','#c7cdd2',.8);oc.forEach(([x,h])=>text(x+2,ty+11,h,9,'start','600'));ty+=rowH;
    O.forEach(c=>{rect(M,ty,Wsv-2*M,rowH,0,'none','#e3e6ea',.6);const out=c.z<-0.05||c.z+c.h>Hp+0.05;[c.id,SK[c.side],c.kind+(out?' ! 부품 높이를 벗어남 — 위치 확인':''),f2(c.u),f2(c.w),f2(c.z),f2(c.h)].forEach((v,i)=>text(oc[i][0]+2,ty+11,v,9,'start'));ty+=rowH;});}
  // ---- title block
  const tbY=H-M-48,tbX=Wsv-M-430;rect(tbX,tbY,430,48,0,'#fff','#1d2126',1);line(tbX,tbY+16,tbX+430,tbY+16,'#1d2126',.6);line(tbX,tbY+32,tbX+430,tbY+32,'#1d2126',.6);line(tbX+110,tbY,tbX+110,tbY+48,'#1d2126',.6);line(tbX+300,tbY,tbX+300,tbY+48,'#1d2126',.6);
  const tbv=[['품번',isBase?'HSG-01':'HSG-02','리비전',opts.rev||'—'],['품명',isBase?'베이스 (하우징 하부)':'커버 (하우징 상부)','축척',`${f2(S)} px/mm`],['프로젝트',name||'board','날짜',opts.date||new Date().toISOString().slice(0,10)]];
  tbv.forEach(([a,b,c,e],i)=>{text(tbX+4,tbY+12+i*16,a,8.5,'start',null,'#5a6872');text(tbX+114,tbY+12+i*16,b,9.5,'start','600');text(tbX+304,tbY+12+i*16,c,8.5,'start',null,'#5a6872');text(tbX+350,tbY+12+i*16,e,9.5,'start');});
  text(M+4,H-M-8,'단위 mm · 3각법 · AllinOneDesign 기구 설계 (초기 설계용 — 양산 도면은 금형/가공 업체 검토 후 확정)',8.5,'start',null,'#5a6872');
  o.push('</svg>');return o.join('\n');}
/* ---- OpenSCAD source (parametric, real CSG) ---- */
function scad(R,name){const d=R.d,g=d.geo,f=v=>(Math.round(v*100)/100).toString();
  const o=[`// ${name||'board'} 하우징 — AllinOneDesign 기구 설계 (${d.m.label}, ${d.ip}, 진동 ${R.inp.vib} Grms)`,`// 좌표: 보드 왼쪽 아래 = (0,0), 보드 중간면 z = 0 (mm)`,`$fn=40;`,
    `wall=${f(g.t)}; rim=${f(g.rim)}; x0=${f(g.x0)}; y0=${f(g.y0)}; Lo=${f(g.Lo)}; Wo=${f(g.Wo)};`,`zFloor=${f(g.zFloor)}; zLid=${f(g.zLid)}; zSplit=${f(g.zSplit)}; r=${f(g.r)};`,
    `// 모서리: ${edgeText(g)} (R = 둥근모따기, C = 각모따기)`,
    `// plan: 바닥 윤곽 (세로 모서리 R 또는 C), rsolid: 층마다 안쪽으로 줄인 윤곽을 hull — 윗면·바닥 둘레의 R/C`,
    `module plan(l,w,rv,ch){if(rv<=0) square([l,w]); else if(ch) polygon([[rv,0],[l-rv,0],[l,rv],[l,w-rv],[l-rv,w],[rv,w],[0,w-rv],[0,rv]]); else translate([rv,rv]) offset(r=rv) square([l-2*rv,w-2*rv]);}`,
    `module rsolid(x,y,z,l,w,rv,ch,layers){translate([x,y,z]) hull() for(L=layers) translate([0,0,L[0]]) linear_extrude(0.01) if(L[1]>0) offset(r=-L[1]) plan(l,w,rv,ch); else plan(l,w,rv,ch);}`,
    (()=>{const ch=g.vk==='chamfer',hO=g.zLid+g.t-(g.zFloor-g.t),hI=g.zLid-g.zFloor;const inE=e=>e?{k:e.k,r:Math.max(0,e.k==='chamfer'?e.r-0.586*g.t:e.r-g.t)}:null;
      const ly=(h,eb,et)=>'['+edgeLayers(h,eb,et).map(([z,s])=>`[${f(Math.min(z,h-0.01))},${f(s)}]`).join(',')+']';
      const ri=Math.max(0,ch?g.r-0.586*g.rim:g.r-g.rim);
      if(g.ringO){const P=r=>'['+r.map(q=>`[${f(q[0])},${f(q[1])}]`).join(',')+']';
        return`// 보드 외곽을 따르는 하우징 (${g.shape}): 윤곽 polygon을 층마다 offset 해 hull\nmodule psolid(pts,z,layers){translate([0,0,z]) hull() for(L=layers) translate([0,0,L[0]]) linear_extrude(0.01) if(L[1]>0) offset(r=-L[1]) polygon(pts); else polygon(pts);}\nouterPts=${P(g.ringO)};\ninnerPts=${P(g.ringI)};\nmodule shell(){difference(){psolid(outerPts,zFloor-wall,${ly(hO,g.eB,g.eT)}); psolid(innerPts,zFloor,${ly(hI,inE(g.eB),inE(g.eT))});`;}
      return`module shell(){difference(){rsolid(x0,y0,zFloor-wall,Lo,Wo,r,${ch},${ly(hO,g.eB,g.eT)}); rsolid(x0+rim,y0+rim,zFloor,Lo-2*rim,Wo-2*rim,${f(ri)},${ch},${ly(hI,inE(g.eB),inE(g.eT))});`;})(),
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
    `module fins(){${d.fins?`for(i=${d.fins.keep?'['+d.fins.keep.join(',')+']':'[0:'+(d.fins.n-1)+']'}) translate([x0+5+i*${d.fins.pitch},y0+4,zLid+wall]) cube([${d.fins.t},${f(d.fins.len)},${f(d.fins.h)}]);`:''}}`,
    `module tabs(){${d.feats.filter(x=>x.type==='tabs').map(x=>x.tabs.map(t=>`translate([${f(t.cx-t.sx/2)},${f(t.cy-t.sy/2)},${f(x.z0)}]) difference(){cube([${f(t.sx)},${f(t.sy)},${f(x.tt)}]); translate([${f(t.hx-(t.cx-t.sx/2))},${f(t.hy-(t.cy-t.sy/2))},-1]) cylinder(d=${f(x.hd)},h=${f(x.tt+2)});}`).join(' ')).join(' ')}}`,
    `module ribs(){${d.feats.filter(x=>x.type==='rib').map(x=>x.axis==='x'?`translate([x0+rim,${f(x.pos-x.tt/2)},zFloor]) cube([Lo-2*rim,${f(x.tt)},${f(x.h)}]);`:`translate([${f(x.pos-x.tt/2)},y0+rim,zFloor]) cube([${f(x.tt)},Wo-2*rim,${f(x.h)}]);`).join(' ')}}`,
    `module base(){intersection(){union(){shell(); pcb_bosses(); lid_screws(); base_pedestals(); tabs(); ribs();} translate([x0-60,y0-60,zFloor-wall-1]) cube([Lo+120,Wo+120,zSplit-(zFloor-wall)+1]);}}`,
    `module lid(){intersection(){union(){shell(); pedestals(); fins();} translate([x0-1,y0-1,zSplit]) cube([Lo+2,Wo+2,zLid+wall+40-zSplit]);}}`,
    `base();`,`translate([0,0,15]) lid(); // 열린 상태로 보기 — 조립은 translate 제거`];
  return o.join('\n')+'\n';}
return{MATS,TIMS,IPS,ipKey,SEAL,SIDE_KO,SCREW_D,offsetRing,ringPoints,ringHit,ringCCW,shapedBoard,featLabel,edgeText,edgeLayers,drawingSVG,partSVG,mechBom,mechBomAoa,partMass,boardNeeds,pcbVibration,analyze,text,compareText,scad};
})();
if(typeof module!=='undefined')module.exports=HOUSING;
