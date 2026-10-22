/* Automatic placement from the netlist (schematic) with selectable strategies, plus the copper helpers the CLI needs.
   - classify(): roles of every part — connectors, ICs, decoupling / bulk caps, crystals, heat sources, noisy (switching)
     and sensitive (MCU, crystal, analog, comms) parts — from footprints, values, pin functions and nets.
   - place(): simulated annealing over position, 90° rotation and (optionally) side, then grid snap + legalisation.
     Cost = weighted HPWL of the nets + decap-to-pin distance + courtyard overlap + board edge
            + thermal spreading (heat sources apart, away from heat-sensitive parts)
            + noise separation (switching parts away from sensitive ones) + connector-to-edge + centre pull.
     Strategies only change the weights (balanced / thermal / noise / compact).
   - clearCopper(), ensurePour(), fanout(): start from an empty board, give GND a plane and drop a via next to every
     pad that has to reach the plane, so the router only has to join the remaining nets.
   Needs PCB, PCBEDIT, AUTOROUTE (and EMC when present for driver detection). */
const AUTOPLACE=(function(){
"use strict";
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(String(n||'').replace(/^\//,''));
function rng(seed){let a=(seed>>>0)||1;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function parseC(v){const m=String(v||'').replace(/[µμ]/g,'u').match(/(\d+(?:\.\d+)?)\s*([pnu])?F?/i);if(!m)return null;return parseFloat(m[1])*({p:1e-12,n:1e-9,u:1e-6}[(m[2]||'').toLowerCase()]||1e-6);}

/* ---------- strategies ---------- */
const STRATS={
  balanced:{label:'균형',desc:'배선 길이 · 디커플링 · 열 · 노이즈를 고르게',wl:1,decap:2,th:12,nz:3,cen:0.04,halo:1,edge:3,sw:1.6,xt:2.5,pwr:0.12},
  thermal:{label:'열 분산',desc:'발열 부품을 서로 멀리, 전해 캡·크리스털·아날로그 부품에서 떨어뜨림',wl:0.7,decap:1.5,th:70,nz:2,cen:0,halo:1.15,edge:3,sw:1.4,xt:2,pwr:0.1},
  noise:{label:'노이즈 최소화',desc:'디커플링 캡을 핀 옆에, 스위칭 루프를 짧게, 스위칭 부품을 MCU·크리스털·아날로그에서 멀리',wl:1,decap:6,th:8,nz:14,cen:0.03,halo:1.05,edge:3,sw:3.5,xt:5,pwr:0.25},
  compact:{label:'소형화',desc:'배선 길이를 줄이고 부품을 가운데로 모음',wl:1.8,decap:2,th:5,nz:1.5,cen:0.35,halo:0.82,edge:3,sw:1.6,xt:2.5,pwr:0.15}};
const ALIAS={balanced:'balanced',balance:'balanced',default:'balanced','균형':'balanced','기본':'balanced',
  thermal:'thermal',heat:'thermal',therm:'thermal','열':'thermal','열분산':'thermal','발열':'thermal','방열':'thermal',
  noise:'noise',emc:'noise',emi:'noise',lownoise:'noise','노이즈':'noise','잡음':'noise','노이즈최소화':'noise',
  compact:'compact',small:'compact',dense:'compact','소형':'compact','소형화':'compact','작게':'compact'};
function strategy(s){const k=ALIAS[String(s||'balanced').toLowerCase().replace(/[\s_-]/g,'')];return k||null;}

/* ---------- roles ---------- */
// smallest centre distance between neighbouring pads (fine-pitch parts need room to fan out)
function pitchOf(c){let m=1e9;const P=c.pads;if(P.length<6)return m;for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const d=Math.hypot(P[i].x-P[j].x,P[i].y-P[j].y);if(d>0.05&&d<m)m=d;}return m;}
function classify(B,opts){
  opts=opts||{};const P=opts.power||{};
  const cls=n=>B.netClass?B.netClass(n):isGnd(n)?'접지':'신호';const rail=n=>n&&cls(n)!=='신호';
  const comps=B.comps.filter(c=>c.pads&&c.pads.length&&c.kind!=='none');
  const drv=typeof EMC!=='undefined'&&EMC.findDrivers?EMC.findDrivers(B):[];
  const drivers=new Set(drv.filter(d=>d.kind==='integrated').map(d=>d.c.ref)),fets=new Set(drv.filter(d=>d.kind==='fet').map(d=>d.c.ref));
  const sw=new Set(),vm=new Set();
  drv.forEach(d=>{(d.outs||[]).forEach(p=>{if(p.net&&!rail(p.net))sw.add(p.net);});(d.vm||[]).forEach(p=>p.net&&vm.add(p.net));
    if(d.kind==='fet')[d.d,d.s].forEach(p=>{if(p&&p.net&&!rail(p.net))sw.add(p.net);});});
  const two=c=>c.pads.length===2;
  const isConn=c=>/^(J|P|CN|X|USB|CON)\d/i.test(c.ref)||/^(usb|hdr|conn|motor)$/.test(c.kind||'');
  const ics=comps.filter(c=>!two(c)&&!isConn(c)&&/^U|^IC/i.test(c.ref));
  const mcu=ics.slice().sort((a,b)=>b.pads.length-a.pads.length)[0];const isMcu=c=>mcu&&c===mcu&&c.pads.length>=20;
  const isReg=c=>/1117|LDO|78\d\d|LM317|REG|TPS7|TPS54|TPS56|LMR|LM259|MP1584|AMS|LP29|NCV|TLS8|TLE42|TLF|LT17|MIC5/i.test((c.val||'')+' '+(c.mpn||''))||c.pads.some(p=>/^(VIN|VI)$/i.test(p.fn||''))&&c.pads.some(p=>/^(VOUT|VO)$/i.test(p.fn||''));
  const anaRe=/ADC|AIN|SENSE|SNS|ISNS|VREF|XTAL|OSC|XIN|XOUT|XI\b|XO\b/i;
  const out=comps.map(c=>{
    const nets=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];const fp=String(c.fp||'');
    const o={ref:c.ref,c,two:two(c),conn:isConn(c),tht:c.pads.some(p=>p.drill),nets,P:0,role:'passive'};
    o.elcap=c.kind==='elcap';o.xtal=c.kind==='xtal'||/^(Y|X|XTAL)\d/i.test(c.ref)&&!o.conn;
    const g=c.pads.find(p=>isGnd(p.net)),r=c.pads.find(p=>p.net&&!isGnd(p.net)&&cls(p.net)==='전원');
    o.decap=o.two&&/^C/i.test(c.ref)&&!!g&&!!r;if(o.decap){o.rail=r.net;o.C=parseC(c.val)||0;o.bulk=o.elcap||o.C>=4.7e-6;}
    o.mcu=isMcu(c);o.driver=drivers.has(c.ref);o.fet=fets.has(c.ref);o.reg=!o.two&&!o.conn&&isReg(c);
    o.ic=!o.two&&!o.conn&&!o.xtal;
    o.role=o.conn?'conn':o.mcu?'mcu':o.driver?'driver':o.fet?'fet':o.reg?'reg':o.xtal?'xtal':o.ic?'ic':o.decap?(o.bulk?'bulk':'decap'):'passive';
    // heat (W): from the thermal setup when given, else typical figures
    const big=/1206|1210|2010|2512/.test(fp);
    o.P=P[c.ref]!=null?+P[c.ref]||0:o.driver?0.5:o.fet?0.3:o.reg?0.4:o.mcu?(c.pads.length>=100?0.6:c.pads.length>=48?0.3:0.08):o.ic?0.05:/^R/i.test(c.ref)&&big?0.1:0;
    o.hs=o.elcap||o.xtal||(o.ic&&/OPA|INA|AD8|LM358|MCP6|TLV|REF|ADC|SENS|NTC/i.test((c.val||'')+' '+(c.mpn||'')));
    o.sens=o.mcu||o.xtal||(o.ic&&/CAN|TJA|MCP25|SN65|LIN|ADC|OPA|INA|AD8|LM358|MCP6|TLV|REF|SENS|TLE92/i.test((c.val||'')+' '+(c.mpn||'')))||(o.two&&nets.some(n=>anaRe.test(n)));
    o.noisy=!o.sens&&(o.driver||o.fet||/^L\d/i.test(c.ref)||(o.decap&&vm.has(o.rail))||nets.some(n=>sw.has(n)));
    o.pitch=pitchOf(c);o.halo=o.two?(o.elcap?0.55:0.35):o.conn?0.9:o.xtal?0.5:c.pads.length<=8?0.8:Math.min(3.2,1.1+c.pads.length*0.014+(o.pitch<0.66?0.8:0));
    return o;});
  return{list:out,byRef:Object.fromEntries(out.map(o=>[o.ref,o])),switchNets:[...sw],vmNets:[...vm],mcu:mcu&&mcu.pads.length>=20?mcu.ref:null};
}

/* ---------- placement ---------- */
// local geometry variants: v = mirror*4 + quarter turns (mirror = bottom side, seen from the top)
const XF=(x,y,v)=>{if(v>=4)x=-x;switch(v&3){case 1:return[-y,x];case 2:return[-x,-y];case 3:return[y,-x];default:return[x,y];}};
function canonical(B,c){if(c.side==='B')PCBEDIT.flip(B,c);if(Math.abs(c.rot||0)>1e-9)PCBEDIT.rotate(B,c,-(c.rot||0));c.rot=0;}
function place(B,opts){
  opts=opts||{};const sk=strategy(opts.strategy)||'balanced';const st=Object.assign({},STRATS[sk],opts.weights||{});
  PCBEDIT.prepare(B);const info=classify(B,opts);const R=rng(opts.seed!=null?opts.seed:1);
  const fixed=new Set((opts.fixed||[]).map(String));const only=opts.only?new Set(opts.only.map(String)):null;
  const movable=info.list.filter(o=>!fixed.has(o.ref)&&(!only||only.has(o.ref)));
  const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const ob=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  const BW=ob[2]-ob[0],BH=ob[3]-ob[1],diag=Math.hypot(BW,BH),edgeM=opts.edge!=null?+opts.edge:1.0;
  const holesBB=B.outline.slice(1).map(r=>[Math.min(...r.map(p=>p[0]))-0.3,Math.min(...r.map(p=>p[1]))-0.3,Math.max(...r.map(p=>p[0]))+0.3,Math.max(...r.map(p=>p[1]))+0.3]);const holeHit=A=>holesBB.some(h=>A[0]<h[2]&&h[0]<A[2]&&A[1]<h[3]&&h[1]<A[3]);
  const n=movable.length;if(!n)return{moved:0,log:['움직일 부품이 없습니다.'],strategy:sk};
  // previous pose, then canonical (top, 0°) to read the local geometry
  const prev=movable.map(o=>({x:o.c.x,y:o.c.y,v:((Math.round((o.c.rot||0)/90)%4)+4)%4+(o.c.side==='B'?4:0)}));
  // board-level labels next to a part (connector pin names, "CAN", "12V"…) travel with that part
  const follow=[];['T.silk','B.silk'].forEach(L=>B.layers[L].forEach(p=>{if(p.t!=='text'||p.own)return;let best=null,bd=2.5;
    movable.forEach(o=>{const b=o.c.bb;const dx=Math.max(b[0]-p.x,0,p.x-b[2]),dy=Math.max(b[1]-p.y,0,p.y-b[3]);const d=Math.hypot(dx,dy);if(d<bd){bd=d;best=o.c;}});
    if(best)follow.push({p,c:best,ox:p.x-(best.bb[0]+best.bb[2])/2,oy:p.y-(best.bb[1]+best.bb[3])/2,rot:best.rot||0,side:best.side});}));
  movable.forEach(o=>canonical(B,o.c));
  const G=movable.map(o=>{const c=o.c;const lb=[c.bb[0]-c.x,c.bb[1]-c.y,c.bb[2]-c.x,c.bb[3]-c.y];
    // a sealed connector reaches through the housing wall: only its on-board part counts for spacing and the board edge
    const fo=c.f&&c.f.over&&c.f.face;if(fo){const[fx,fy]=c.f.face,ov=c.f.over;if(fx<0)lb[0]+=ov;else if(fx>0)lb[2]-=ov;else if(fy<0)lb[1]+=ov;else lb[3]-=ov;}const bb=[],pads=[];
    for(let v=0;v<8;v++){const q=[XF(lb[0],lb[1],v),XF(lb[2],lb[3],v)];bb.push([Math.min(q[0][0],q[1][0]),Math.min(q[0][1],q[1][1]),Math.max(q[0][0],q[1][0]),Math.max(q[0][1],q[1][1])]);
      pads.push(c.pads.map(p=>XF(p.x-c.x,p.y-c.y,v)));}
    return{bb,pads,area:(lb[2]-lb[0])*(lb[3]-lb[1])};});
  // connectors whose pads sit to one side of the body open on the other side: that face should meet the board edge
  const FACE=movable.map(o=>{if(!o.conn)return null;const c=o.c,bd=c.body;if(!bd||!(bd.w>0))return null;let px=0,py=0;c.pads.forEach(p=>{px+=p.x;py+=p.y;});px/=c.pads.length;py/=c.pads.length;
    const vx=bd.cx-px,vy=bd.cy-py;if(Math.hypot(vx,vy)<Math.max(1,0.18*Math.max(bd.w,bd.h)))return null;return Math.abs(vx)>Math.abs(vy)?[Math.sign(vx),0]:[0,Math.sign(vy)];});
  const idx=new Map(movable.map((o,i)=>[o.ref,i]));
  const both=opts.both||opts.sides==='both';
  // bottom side (--both): passives, and small SMD ICs (SOT-23 · SOIC-8 class, ≤ 7 mm) that are not heat sources / the MCU;
  // through-hole parts, connectors and electrolytics stay on top. opts.bothIcs=false limits it to 2-pin parts.
  const small=o=>{const b=o.c.bb;return b&&(b[2]-b[0])<=7&&(b[3]-b[1])<=7;};
  const canB=movable.map(o=>both&&!o.tht&&!o.elcap&&!o.conn&&(o.two||(opts.bothIcs!==false&&small(o)&&!o.mcu&&!o.driver&&!o.reg&&!o.fet&&!(o.P>0.3))));
  // obstacles: fixed parts and mounting holes
  const obst=[];info.list.forEach(o=>{if(idx.has(o.ref))return;obst.push({bb:o.c.bb.slice(),side:o.tht?'both':o.c.side,halo:o.halo,o,cx:(o.c.bb[0]+o.c.bb[2])/2,cy:(o.c.bb[1]+o.c.bb[3])/2});});
  B.drills.forEach(d=>{if(d.plated||d.own||d._pad)return;const k=d.d/2+0.8;obst.push({bb:[d.x-k,d.y-k,d.x+k,d.y+k],side:'both',halo:0.4,hole:true,cx:d.x,cy:d.y});});
  // nets → pins
  const cls=nm=>B.netClass?B.netClass(nm):isGnd(nm)?'접지':'신호';const swSet=new Set(info.switchNets);
  const NET=[];const netsOf=movable.map(()=>[]);
  Object.keys(B.nets).forEach(nm=>{if(isGnd(nm))return;const pins=[];let fx=[];
    info.list.forEach(o=>o.c.pads.forEach((p,k)=>{if(p.net!==nm)return;const i=idx.get(o.ref);if(i!=null)pins.push([i,k]);else fx.push([p.x,p.y]);}));
    if(pins.length+fx.length<2||!pins.length)return;
    let w=cls(nm)==='전원'?st.pwr*(pins.length+fx.length>10?0.5:1):1;if(swSet.has(nm))w*=st.sw;if(/XTAL|OSC|XIN|XOUT|XI$|XO$|XTAL[12]/i.test(nm))w*=st.xt;
    const id=NET.length;NET.push({nm,pins,fx,w:w*st.wl});pins.forEach(([i])=>{if(!netsOf[i].includes(id))netsOf[i].push(id);});});
  // decoupling: each cap belongs to the IC with the most pins on its rail (spread over ICs by pin share)
  const DEC=[];const decOf=movable.map(()=>[]);{const load={};
    info.list.filter(o=>o.decap).forEach(o=>{const ci=idx.get(o.ref);if(ci==null)return;
      const cand=info.list.filter(x=>x.ic&&!x.conn&&x.c.pads.some(p=>p.net===o.rail));if(!cand.length)return;
      const score=x=>x.c.pads.filter(p=>p.net===o.rail).length/((load[x.ref]||0)+1)*(o.bulk&&x.driver?4:1)*(o.bulk&&x.reg?2:1);
      const a=cand.sort((p,q)=>score(q)-score(p))[0];load[a.ref]=(load[a.ref]||0)+1;
      const ai=idx.get(a.ref);const rk=o.c.pads.findIndex(p=>p.net===o.rail),gk=o.c.pads.findIndex(p=>isGnd(p.net));
      const tk=[],tg=[];a.c.pads.forEach((p,k)=>{if(p.net===o.rail)tk.push(k);else if(isGnd(p.net))tg.push(k);});
      const w=st.decap*(o.bulk?(a.driver?1.2:0.35):1);
      const id=DEC.length;DEC.push({ci,ai,a,rk,gk,tk,tg,w});decOf[ci].push(id);if(ai!=null)decOf[ai].push(id);});}
  const ROLE=movable;
  // pairs that may sit closer than the usual spacing: a decap and the IC it serves, a crystal and its MCU
  info.list.forEach((o,k)=>{o._id=k;});const TG=new Map();const tg=(a,b,g)=>{TG.set(a._id*100000+b._id,g);TG.set(b._id*100000+a._id,g);};
  DEC.forEach(D=>{const c=ROLE[D.ci];tg(c,D.a,c.halo*st.halo+0.45);});
  info.list.filter(o=>o.xtal).forEach(x=>{const m=info.list.find(o=>o.mcu&&o.c.pads.some(p=>p.net&&x.nets.includes(p.net)));if(m)tg(x,m,x.halo*st.halo+0.6);});
  const X=new Float64Array(n),Y=new Float64Array(n),V=new Int8Array(n);
  const scratch=!!opts.scratch;
  const inner=[ob[0]+edgeM,ob[1]+edgeM,ob[2]-edgeM,ob[3]-edgeM];
  if(scratch){movable.forEach((o,i)=>{const b=G[i].bb[0];
      if(o.conn){const e=Math.floor(R()*4),t=R();X[i]=e===0?inner[0]-b[0]:e===1?inner[2]-b[2]:inner[0]+t*(BW-2*edgeM);Y[i]=e===2?inner[1]-b[1]:e===3?inner[3]-b[3]:inner[1]+t*(BH-2*edgeM);}
      else{X[i]=ob[0]+BW*(0.2+0.6*R());Y[i]=ob[1]+BH*(0.2+0.6*R());}V[i]=o.conn&&R()<0.5?1:0;});}
  else prev.forEach((p,i)=>{X[i]=p.x;Y[i]=p.y;V[i]=canB[i]||p.v<4?p.v:p.v&3;});
  const sideOf=i=>ROLE[i].tht?'both':V[i]>=4?'B':'T';
  const bbI=(i,out)=>{const b=G[i].bb[V[i]];out[0]=X[i]+b[0];out[1]=Y[i]+b[1];out[2]=X[i]+b[2];out[3]=Y[i]+b[3];return out;};
  const A=[0,0,0,0],Bq=[0,0,0,0];
  const conflict=(s,t)=>s==='both'||t==='both'||s===t;
  const Dth=0.38*diag,Dhs=0.25*diag,Dn=Math.min(30,0.3*diag);
  let wOv=5;const halo=i=>ROLE[i].halo*st.halo;
  // per-part flags so the pair term only measures distance when a rule applies
  movable.forEach(o=>{o._h=o.P>0.04;o._q=o.noisy||o.sens||o._h||o.hs;o._k=o.mcu||o.xtal?1.4:1;});info.list.forEach(o=>{if(o._h==null){o._h=o.P>0.04;o._q=o.noisy||o.sens||o._h||o.hs;o._k=o.mcu||o.xtal?1.4:1;}});
  function pairCost(i,b,sb,hb,ob2){ // i movable; b = box of the other part, ob2 = role of the other (or null)
    bbI(i,A);let c=0;
    if(conflict(sideOf(i),sb)){let h=halo(i)+hb;if(ob2&&TG.size){const t=TG.get(ROLE[i]._id*100000+ob2._id);if(t!=null)h=t;}const ox=(A[2]<b[2]?A[2]:b[2])-(A[0]>b[0]?A[0]:b[0])+h;if(ox>0){const oy=(A[3]<b[3]?A[3]:b[3])-(A[1]>b[1]?A[1]:b[1])+h;if(oy>0){const m=ox<oy?ox:oy;c+=wOv*(ox*oy+m*m);}}}
    if(ob2&&ob2._q){const o=ROLE[i];if(!o._q)return c;
      const th=o._h&&(ob2._h||ob2.hs)||ob2._h&&o.hs,nz=(o.noisy&&ob2.sens)||(o.sens&&ob2.noisy);if(!th&&!nz)return c;
      const dx=(A[0]+A[2]-b[0]-b[2])/2,dy=(A[1]+A[3]-b[1]-b[3])/2,d=Math.sqrt(dx*dx+dy*dy);
      if(th){if(o._h&&ob2._h&&d<Dth)c+=st.th*o.P*ob2.P*(Dth-d);
        if(d<Dhs){if(o._h&&ob2.hs)c+=st.th*0.5*o.P*(Dhs-d);if(ob2._h&&o.hs)c+=st.th*0.5*ob2.P*(Dhs-d);}}
      if(nz&&d<Dn)c+=st.nz*(Dn-d)*(o._k>1||ob2._k>1?1.4:1);}
    return c;}
  function ownCost(i){bbI(i,A);const o=ROLE[i];let c=0;const m=o.conn?0.35:edgeM;
    const ex=Math.max(0,ob[0]+m-A[0])+Math.max(0,A[2]-(ob[2]-m))+Math.max(0,ob[1]+m-A[1])+Math.max(0,A[3]-(ob[3]-m));if(ex>0)c+=(wOv*4+50)*(ex+ex*ex);
    if(ring.length>4||B.outline.length>1)[[A[0],A[1]],[A[2],A[1]],[A[2],A[3]],[A[0],A[3]],[(A[0]+A[2])/2,(A[1]+A[3])/2]].forEach(p=>{if(!PCB.inBoard(p[0],p[1],B.outline))c+=wOv*2+20;});if(holeHit(A))c+=wOv*2+20;
    if(o.conn){let d;const f=FACE[i];if(f){const v=XF(f[0],f[1],V[i]);d=v[0]>0.5?ob[2]-A[2]:v[0]<-0.5?A[0]-ob[0]:v[1]>0.5?ob[3]-A[3]:A[1]-ob[1];d*=1.5;}
      else d=Math.min(A[0]-ob[0],ob[2]-A[2],A[1]-ob[1],ob[3]-A[3]);c+=st.edge*Math.max(0,d-0.3)*(1+o.c.pads.length*0.05);}
    else{const cx=(A[0]+A[2])/2-(ob[0]+ob[2])/2,cy=(A[1]+A[3])/2-(ob[1]+ob[3])/2;c+=st.cen*Math.hypot(cx,cy)*Math.sqrt(G[i].area+1);}
    obst.forEach(q=>{c+=pairCost(i,q.bb,q.side,q.halo,q.o||null);});
    return c;}
  const px=(i,k)=>X[i]+G[i].pads[V[i]][k][0],py=(i,k)=>Y[i]+G[i].pads[V[i]][k][1];
  function netCost(e){const N=NET[e];let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const[i,k]of N.pins){const x=px(i,k),y=py(i,k);if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    for(const q of N.fx){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1];}
    return N.w*((x1-x0)+(y1-y0));}
  const tp=(D,k)=>D.ai!=null?[px(D.ai,k),py(D.ai,k)]:[D.a.c.pads[k].x,D.a.c.pads[k].y];
  function decCost(d){const D=DEC[d];const cx=px(D.ci,D.rk),cy=py(D.ci,D.rk);let m=1e9;D.tk.forEach(k=>{const q=tp(D,k);m=Math.min(m,Math.hypot(q[0]-cx,q[1]-cy));});
    let g=0;if(D.gk>=0&&D.tg.length){const gx=px(D.ci,D.gk),gy=py(D.ci,D.gk);g=1e9;D.tg.forEach(k=>{const q=tp(D,k);g=Math.min(g,Math.hypot(q[0]-gx,q[1]-gy));});g*=0.35;}
    return D.w*(m+g);}
  function costSet(S){let c=0;const nets=new Set(),decs=new Set();
    S.forEach(i=>{c+=ownCost(i);for(let j=0;j<n;j++){if(j===i||(S.includes(j)&&j<i))continue;bbI(j,Bq);c+=pairCost(i,Bq,sideOf(j),halo(j),ROLE[j]);}
      netsOf[i].forEach(e=>nets.add(e));decOf[i].forEach(d=>decs.add(d));});
    nets.forEach(e=>{c+=netCost(e);});decs.forEach(d=>{c+=decCost(d);});return c;}
  function total(){let c=0;for(let i=0;i<n;i++){c+=ownCost(i);for(let j=i+1;j<n;j++){bbI(j,Bq);c+=pairCost(i,Bq,sideOf(j),halo(j),ROLE[j]);}}
    NET.forEach((_,e)=>{c+=netCost(e);});DEC.forEach((_,d)=>{c+=decCost(d);});return c;}
  // satellites: passives that hang off one part (jump moves)
  const anchorOf=movable.map((o,i)=>{if(!o.two)return-1;const d=DEC.find(D=>D.ci===i);if(d&&d.ai!=null)return d.ai;
    let best=-1,bs=0;movable.forEach((q,j)=>{if(j===i||q.two)return;const s=q.c.pads.filter(p=>p.net&&!isGnd(p.net)&&o.nets.includes(p.net)&&cls(p.net)==='신호').length;if(s>bs){bs=s;best=j;}});return best;});
  // annealing
  const iters=Math.min(600000,Math.round((opts.effort||1)*n*(scratch?1500:900)));
  const sv=[0,0,0],sv2=[0,0,0];const save=(i,s)=>{s[0]=X[i];s[1]=Y[i];s[2]=V[i];},load=(i,s)=>{X[i]=s[0];Y[i]=s[1];V[i]=s[2];};
  let T0=0;{let s=0,k=0;for(let t=0;t<Math.min(300,n*10);t++){const i=Math.floor(R()*n);save(i,sv);const c0=costSet([i]);X[i]+=(R()-0.5)*BW*0.3;Y[i]+=(R()-0.5)*BH*0.3;const c1=costSet([i]);load(i,sv);s+=Math.abs(c1-c0);k++;}T0=Math.max(1,s/k)*(scratch?1.2:0.4);}
  const Tend=T0*2e-4;let acc=0;
  for(let it=0;it<iters;it++){
    const prog=it/iters,T=T0*Math.pow(Tend/T0,prog);wOv=5+400*prog*prog;
    const range=Math.max(0.3,Math.max(BW,BH)*0.5*Math.pow(1-prog,1.6)*(scratch?1:0.5));
    const i=Math.floor(R()*n);const u=R();
    if(u<0.08&&n>1){ // swap two parts of similar size
      const j=Math.floor(R()*n);if(j===i||Math.abs(Math.log((G[i].area+0.5)/(G[j].area+0.5)))>0.9)continue;
      save(i,sv);save(j,sv2);const c0=costSet([i,j]);const ci=[(G[i].bb[V[i]][0]+G[i].bb[V[i]][2])/2,(G[i].bb[V[i]][1]+G[i].bb[V[i]][3])/2],cj=[(G[j].bb[V[j]][0]+G[j].bb[V[j]][2])/2,(G[j].bb[V[j]][1]+G[j].bb[V[j]][3])/2];
      const xi=X[i]+ci[0],yi=Y[i]+ci[1],xj=X[j]+cj[0],yj=Y[j]+cj[1];X[i]=xj-ci[0];Y[i]=yj-ci[1];X[j]=xi-cj[0];Y[j]=yi-cj[1];
      const d=costSet([i,j])-c0;if(d<=0||R()<Math.exp(-d/T))acc++;else{load(i,sv);load(j,sv2);}continue;}
    save(i,sv);const c0=costSet([i]);
    if(u<0.2)V[i]=(V[i]&4)|((V[i]+(R()<0.5?1:3)+(R()<0.2?1:0))&3);
    else if(u<0.25&&canB[i])V[i]^=4;
    else if(u<0.33&&anchorOf[i]>=0&&prog<0.85){const a=anchorOf[i];const k=Math.floor(R()*G[a].pads[V[a]].length);const p=G[a].pads[V[a]][k];const r=Math.hypot(p[0],p[1])||1;const off=1.2+R()*2.5;
      X[i]=X[a]+p[0]+p[0]/r*off+(R()-0.5);Y[i]=Y[a]+p[1]+p[1]/r*off+(R()-0.5);if(R()<0.5)V[i]=(V[i]&4)|(Math.abs(p[0])>Math.abs(p[1])?0:1);}
    else{X[i]+=(R()*2-1)*range;Y[i]+=(R()*2-1)*range;}
    const d=costSet([i])-c0;if(d<=0||R()<Math.exp(-d/T))acc++;else load(i,sv);
  }
  wOv=405;
  // legalise on the grid: biggest parts first, nearest free spot (full spacing, then half, then the DRC minimum)
  const grid=opts.grid||0.25;const snap=v=>Math.round(v/grid)*grid;const escG=opts.escape!=null?+opts.escape:1.3;
  const order=movable.map((_,i)=>i).sort((a,b)=>(ROLE[b].conn-ROLE[a].conn)||G[b].area-G[a].area);
  const placed=[];const fails=[];
  const ok=(i,f)=>{bbI(i,A);const o=ROLE[i];const m=o.conn?0.35:Math.min(edgeM,0.6+0.4*f);if(A[0]<ob[0]+m||A[1]<ob[1]+m||A[2]>ob[2]-m||A[3]>ob[3]-m)return false;
    if((ring.length>4||B.outline.length>1)&&![[A[0],A[1]],[A[2],A[1]],[A[2],A[3]],[A[0],A[3]],[(A[0]+A[2])/2,(A[1]+A[3])/2]].every(p=>PCB.inBoard(p[0],p[1],B.outline)))return false;if(holeHit(A))return false;
    const si=sideOf(i);const gap=(q,o2)=>{const t=o2&&TG.get(ROLE[i]._id*100000+o2._id);
      // next to a fine-pitch IC keep a fan-out lane even when space is tight (vias and escape tracks need it)
      const fl=t==null&&(ROLE[i].pitch<0.66||(o2&&o2.pitch<0.66))?escG:0.2;return Math.max(fl,t!=null?t*Math.max(f,0.7):(halo(i)+q)*f);};
    for(const q of obst){if(!conflict(si,q.side))continue;const g=gap(q.halo,q.o);if(A[0]<q.bb[2]+g&&q.bb[0]<A[2]+g&&A[1]<q.bb[3]+g&&q.bb[1]<A[3]+g)return false;}
    for(const j of placed){if(!conflict(si,sideOf(j)))continue;bbI(j,Bq);const g=gap(halo(j),ROLE[j]);if(A[0]<Bq[2]+g&&Bq[0]<A[2]+g&&A[1]<Bq[3]+g&&Bq[1]<A[3]+g)return false;}
    return true;};
  for(const i of order){const x0=snap(X[i]),y0=snap(Y[i]);let done=false;
    for(const f of[1,0.6,0]){
      let best=null;const maxR=Math.max(BW,BH);
      for(let r=0;r<=maxR&&!done;r+=r<4?grid:r<12?grid*2:grid*4){
        const cands=[];if(r===0)cands.push([x0,y0]);else{const k=Math.max(1,Math.round(r/grid));for(let t=-k;t<=k;t++){cands.push([x0+t*grid,y0-r],[x0+t*grid,y0+r]);if(t>-k&&t<k)cands.push([x0-r,y0+t*grid],[x0+r,y0+t*grid]);}}
        for(const[cx,cy]of cands){X[i]=cx;Y[i]=cy;if(!ok(i,f))continue;const c=costSet([i]);if(!best||c<best.c)best={c,x:cx,y:cy};}
        if(best){X[i]=best.x;Y[i]=best.y;done=true;}}
      if(done)break;}
    if(!done){X[i]=x0;Y[i]=y0;fails.push(ROLE[i].ref);}
    placed.push(i);}
  const finalCost=total();
  // apply to the board
  movable.forEach((o,i)=>{const c=o.c;if(V[i]>=4)PCBEDIT.flip(B,c);const r=(V[i]&3)*90;if(r)PCBEDIT.rotate(B,c,r);PCBEDIT.move(B,c,X[i]-c.x,Y[i]-c.y);});
  follow.forEach(f=>{const c=f.c;const a=(f.side===c.side?((c.rot||0)-f.rot):0)*Math.PI/180;const ox=f.ox*Math.cos(a)-f.oy*Math.sin(a),oy=f.ox*Math.sin(a)+f.oy*Math.cos(a);
    f.p.x=(c.bb[0]+c.bb[2])/2+ox;f.p.y=(c.bb[1]+c.bb[3])/2+oy;
    // keep it on the board
    f.p.x=Math.max(ob[0]+1,Math.min(ob[2]-1,f.p.x));f.p.y=Math.max(ob[1]+1,Math.min(ob[3]-1,f.p.y));});
  PCBEDIT.rebuildNets(B);
  return{moved:n,strategy:sk,label:STRATS[sk].label,iters,accepted:acc,cost:finalCost,fails,bottom:movable.filter((_,i)=>V[i]>=4).map(o=>o.ref),info};
}

/* ---------- metrics of the current placement ---------- */
function metrics(B,opts){
  const info=classify(B,opts);const cls=nm=>B.netClass?B.netClass(nm):'신호';
  let hpwl=0;Object.keys(B.nets).forEach(nm=>{if(cls(nm)!=='신호')return;const ps=B.nets[nm].pads;if(ps.length<2)return;const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);hpwl+=Math.max(...xs)-Math.min(...xs)+Math.max(...ys)-Math.min(...ys);});
  const ctr=o=>[(o.c.bb[0]+o.c.bb[2])/2,(o.c.bb[1]+o.c.bb[3])/2];const dist=(a,b)=>{const p=ctr(a),q=ctr(b);return Math.hypot(p[0]-q[0],p[1]-q[1]);};
  const gapBB=(a,b)=>{const A=a.c.bb,Bb=b.c.bb;const dx=Math.max(0,Math.max(A[0],Bb[0])-Math.min(A[2],Bb[2])),dy=Math.max(0,Math.max(A[1],Bb[1])-Math.min(A[3],Bb[3]));return Math.hypot(dx,dy);};
  const dec=info.list.filter(o=>o.decap&&!o.bulk).map(o=>{const rp=o.c.pads.find(p=>p.net===o.rail);let m=1e9,who=null;info.list.forEach(x=>{if(!x.ic||x===o)return;x.c.pads.forEach(p=>{if(p.net!==o.rail)return;const d=Math.hypot(p.x-rp.x,p.y-rp.y);if(d<m){m=d;who=x.ref;}});});return m<1e9?{ref:o.ref,d:m,to:who}:null;}).filter(Boolean);
  const hot=info.list.filter(o=>o.P>=0.1);const hp=[];for(let i=0;i<hot.length;i++)for(let j=i+1;j<hot.length;j++)hp.push({a:hot[i].ref,b:hot[j].ref,d:dist(hot[i],hot[j]),P:hot[i].P*hot[j].P});hp.sort((a,b)=>a.d-b.d);
  const hs=[];hot.forEach(h=>info.list.forEach(o=>{if(o.hs&&o!==h)hs.push({a:h.ref,b:o.ref,d:gapBB(h,o)});}));hs.sort((a,b)=>a.d-b.d);
  const ns=[];info.list.forEach(a=>{if(!a.noisy)return;info.list.forEach(b=>{if(b.sens&&(b.mcu||b.xtal||b.ic))ns.push({a:a.ref,b:b.ref,d:gapBB(a,b)});});});ns.sort((a,b)=>a.d-b.d);
  const area=info.list.reduce((s,o)=>s+(o.c.bb[2]-o.c.bb[0])*(o.c.bb[3]-o.c.bb[1]),0);
  // heat spread: P-weighted spread of the heat sources about their centroid
  const Pt=hot.reduce((s,o)=>s+o.P,0);let spread=0;if(Pt>0){const cx=hot.reduce((s,o)=>s+o.P*ctr(o)[0],0)/Pt,cy=hot.reduce((s,o)=>s+o.P*ctr(o)[1],0)/Pt;spread=Math.sqrt(hot.reduce((s,o)=>s+o.P*((ctr(o)[0]-cx)**2+(ctr(o)[1]-cy)**2),0)/Pt);}
  return{hpwl,decap:dec,decapAvg:dec.length?dec.reduce((s,x)=>s+x.d,0)/dec.length:0,decapMax:dec.length?Math.max(...dec.map(x=>x.d)):0,hotPairs:hp,hotSens:hs,noiseSens:ns,util:area/(B.W*B.H),heatSpread:spread,Ptot:Pt,info};
}

/* ---------- copper helpers ---------- */
function clearCopper(B,o){o=o||{};let nT=0,nV=B.vias.length;
  PCB.cuKeys(B).map(k=>k+'.cu').forEach(L=>{const a=B.layers[L];B.layers[L]=a.filter(p=>p.t==='pad'||(p.t==='pour'&&(!o.pours||p.plane))||(p.t==='poly'&&o.keepZones));nT+=a.length-B.layers[L].length;});
  B.vias=[];PCBEDIT.rebuildNets(B);return{tracks:nT,vias:nV};}
function gndNet(B){let best=null,bn=0;Object.keys(B.nets).forEach(n=>{if(!isGnd(n))return;const k=B.nets[n].pads.length;if(k>bn){bn=k;best=n;}});return best;}
function ensurePour(B,layer){const g=gndNet(B);if(!g)return null;const has=['T','B'].some(s=>B.layers[s+'.cu'].some(p=>p.t==='pour'&&p.net===g));if(has)return null;
  const L=layer==='T'?'T':'B';const R=PCBEDIT.cornerRadius(B);B.layers[L+'.cu'].unshift({t:'pour',net:g,inset:0.5,clr:0.3,r:Math.max(0,R-0.5)});PCBEDIT.rebuildNets(B);return{net:g,layer:L};}
/* a via (and a short stub) next to every SMD pad whose net is poured on the other layer only */
function fanout(B,opts){
  opts=opts||{};const pour={};const keys=PCB.cuKeys(B),NL=keys.length,ALL=keys.map((_,i)=>i);keys.forEach((s,li)=>B.layers[s+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)(pour[p.net]=pour[p.net]||new Set()).add(li);}));
  if(!Object.keys(pour).length)return{vias:0,fail:[]};
  const via=Object.assign({d:0.6,drill:0.3},opts.via||{}),clr=opts.clear||0.2,w=opts.width||0.3;
  const P=AUTOROUTE.prepare(B,{clear:clr,via,width:{signal:w,power:w}});const G=P.G;const wMax=w/2;
  const cell=(x,y)=>{const i=Math.round((x-G.ox)/G.g),j=Math.round((y-G.oy)/G.g);return i<0||j<0||i>=G.nx||j>=G.ny?-1:j*G.nx+i;};
  const okV=(x,y,k)=>{const i=cell(x,y);if(i<0)return false;for(let l=0;l<NL;l++){const a=G.occV[l][i];if(!(a===0||a===k))return false;}return true;};
  const okT=(a,b,l,k)=>{const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const m=Math.max(1,Math.ceil(L/(G.g/2)));for(let t=0;t<=m;t++){const i=cell(a[0]+(b[0]-a[0])*t/m,a[1]+(b[1]-a[1])*t/m);if(i<0)return false;const v=G.occT[l][i];if(!(v===0||v===k))return false;}return true;};
  const add=[],fail=[];const D2R=Math.PI/180;
  // pads already joined to a via of their net (an earlier fanout or a routed stub) need nothing more
  const joined=new Set();{const S0=AUTOROUTE.shapesOfBoard(B);Object.keys(pour).forEach(n=>AUTOROUTE.components(S0,n).forEach(g=>{if(g.some(x=>x.via))g.forEach(x=>{if(x.pad)joined.add(x.pad);});}));}
  // escape lanes in front of fine-pitch IC pins: a fanout via of another net there would wall the pin in
  const lanes=[];B.comps.forEach(c=>{if(c.pads.length<6)return;const cx=(c.bb[0]+c.bb[2])/2,cy=(c.bb[1]+c.bb[3])/2;
    c.pads.forEach(q=>{if(!q.net||q.drill||Math.min(q.w,q.h)>=0.36)return;const a=(q.ang||0)*D2R;let ux=Math.cos(a),uy=Math.sin(a),half=q.w/2;if(q.h>q.w){ux=-Math.sin(a);uy=Math.cos(a);half=q.h/2;}
      if((q.x-cx)*ux+(q.y-cy)*uy<0){ux=-ux;uy=-uy;}if(Math.abs((q.x-cx)*ux+(q.y-cy)*uy)<0.3)return;
      lanes.push({net:q.net,a:[q.x,q.y],b:[q.x+ux*(half+(opts.lane||1.5)),q.y+uy*(half+(opts.lane||1.5))]});});});
  const laneHit=(a,b,net,m)=>{const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const n=Math.max(1,Math.ceil(L/0.1));for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;if(lanes.some(l=>l.net!==net&&PCB.segDist(x,y,l.a,l.b)<m))return true;}return false;};
  const inLane=(x,y,net)=>lanes.some(l=>l.net!==net&&PCB.segDist(x,y,l.a,l.b)<via.d/2+clr+0.12);
  B.comps.forEach(c=>c.pads.forEach(p=>{
    if(!p.net||!pour[p.net]||p.drill)return;const li=p.side==='B'?NL-1:0;if(pour[p.net].has(li))return;if(joined.has(p))return;
    if(B.vias.some(v=>v.net===p.net&&Math.abs(v.x-p.x)<=p.w/2+v.d/2&&Math.abs(v.y-p.y)<=p.h/2+v.d/2&&Math.hypot(v.x-p.x,v.y-p.y)<Math.max(p.w,p.h)/2+v.d))return;
    const k=P.idOf(p.net);const pw=p.shape==='parts'&&p.lbb?p.lbb[2]-p.lbb[0]:p.w,ph=p.shape==='parts'&&p.lbb?p.lbb[3]-p.lbb[1]:p.h;
    // fine-pitch pins can wait until the signals have escaped (opts.skipFine), then take whatever room is left
    if(opts.skipFine&&Math.min(pw,ph)<0.36){fail.push(p.ref+'.'+p.n);return;}
    const put=(x,y,stub)=>{const v={x,y,d:via.d,drill:via.drill,net:p.net,auto:true,fan:true};B.vias.push(v);add.push(v);
      AUTOROUTE.paint(G,{k:'cap',a:[x,y],b:[x,y],r:via.d/2,L:ALL,net:p.net},k,wMax,via.d/2,clr);
      if(stub){const t={t:'seg',a:[p.x,p.y],b:[x,y],w,net:p.net,auto:true,fan:true,_side:keys[li]};B.layers[keys[li]+'.cu'].push(t);add.push(t);AUTOROUTE.paint(G,{k:'cap',a:t.a,b:t.b,r:w/2,L:[li],net:p.net},k,wMax,via.d/2,clr);}};
    // big (exposed / tab) pads: vias inside the pad, a small array for heat when asked
    if(Math.min(pw,ph)>=1.2&&pw*ph>=2){const n=opts.thermal?Math.max(1,Math.min(9,Math.floor(pw/1.2)*Math.floor(ph/1.2))):1;const nx=Math.max(1,Math.round(Math.sqrt(n*pw/ph))),ny=Math.max(1,Math.ceil(n/nx));let any=false;
      const a=(p.ang||0)*D2R;for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const lx=(i-(nx-1)/2)*Math.min(1.2,(pw-0.8)/Math.max(1,nx-1||1)),ly=(j-(ny-1)/2)*Math.min(1.2,(ph-0.8)/Math.max(1,ny-1||1));
        const x=p.x+lx*Math.cos(a)-ly*Math.sin(a),y=p.y+lx*Math.sin(a)+ly*Math.cos(a);if(okV(x,y,k)){put(x,y,false);any=true;}}
      if(any)return;}
    // a fine-pitch supply pin next to its decoupling cap: tie the pin to the cap pad on the surface and let the cap pad carry the via
    if(Math.min(pw,ph)<0.36){const near=B.nets[p.net].pads.filter(q=>q!==p&&q.side===p.side&&!q.drill&&Math.min(q.w,q.h)>=0.36&&Math.hypot(q.x-p.x,q.y-p.y)<4.5).sort((q,r)=>Math.hypot(q.x-p.x,q.y-p.y)-Math.hypot(r.x-p.x,r.y-p.y));
      const a0=(p.ang||0)*D2R;let ux=Math.cos(a0),uy=Math.sin(a0),half=p.w/2;if(p.h>p.w){ux=-Math.sin(a0);uy=Math.cos(a0);half=p.h/2;}
      const cxa=(c.bb[0]+c.bb[2])/2,cya=(c.bb[1]+c.bb[3])/2;if((p.x-cxa)*ux+(p.y-cya)*uy<0){ux=-ux;uy=-uy;}
      for(const q of near){const m=[p.x+ux*(half+0.45),p.y+uy*(half+0.45)];const tw=Math.min(w,0.25);
        const opts2=[[[p.x,p.y],[q.x,q.y]],[[p.x,p.y],m,[q.x,q.y]]];
        for(const pts of opts2){let ok=true;for(let i=1;i<pts.length;i++)if(!okT(pts[i-1],pts[i],li,k)||laneHit(pts[i-1],pts[i],p.net,tw/2+clr+0.1)){ok=false;break;}if(!ok)continue;
          const t=pts.length===2?{t:'seg',a:pts[0],b:pts[1],w:tw,net:p.net,auto:true,fan:true,_side:keys[li]}:{t:'path',pts,w:tw,net:p.net,auto:true,fan:true,_side:keys[li]};
          B.layers[keys[li]+'.cu'].push(t);add.push(t);for(let i=1;i<pts.length;i++)AUTOROUTE.paint(G,{k:'cap',a:pts[i-1],b:pts[i],r:tw/2,L:[li],net:p.net},k,wMax,via.d/2,clr);return;}}}
    const ca=(c.bb[0]+c.bb[2])/2,cb=(c.bb[1]+c.bb[3])/2;let ox=p.x-ca,oy=p.y-cb;const ol=Math.hypot(ox,oy)||1;ox/=ol;oy/=ol;
    const dirs=[];for(let d=0;d<8;d++){const t=d*45*D2R;dirs.push([Math.cos(t),Math.sin(t)]);}
    const a=-(p.ang||0)*D2R;const ext=(ux,uy)=>{const lx=ux*Math.cos(a)-uy*Math.sin(a),ly=ux*Math.sin(a)+uy*Math.cos(a);return Math.min(Math.abs(lx)>1e-9?pw/2/Math.abs(lx):1e9,Math.abs(ly)>1e-9?ph/2/Math.abs(ly):1e9);};
    const cands=[];dirs.forEach(([ux,uy])=>{const s0=ext(ux,uy)+via.d/2+clr*0.5;for(let s=s0;s<=s0+(Math.min(pw,ph)<0.36?3.4:2.4);s+=0.1)cands.push({x:p.x+ux*s,y:p.y+uy*s,sc:s-1.2*(ux*ox+uy*oy)});});
    cands.sort((q,r)=>q.sc-r.sc);
    for(const q of cands){if(okV(q.x,q.y,k)&&!inLane(q.x,q.y,p.net)&&okT([p.x,p.y],[q.x,q.y],li,k)){put(q.x,q.y,true);return;}}
    for(const q of cands){if(okV(q.x,q.y,k)&&okT([p.x,p.y],[q.x,q.y],li,k)){put(q.x,q.y,true);return;}}
    fail.push(p.ref+'.'+p.n);}));
  PCBEDIT.rebuildNets(B);
  return{vias:add.filter(x=>x.d).length,added:add,fail};
}
/* smallest board that the parts fit on: try board sizes from dense to loose (same aspect ratio unless given),
   place from scratch on each and keep the first one without overlaps or parts off the board. Copper must be cleared by the caller. */
const MIN_KS=[1.15,1.25,1.35,1.45,1.6,1.75,1.95,2.2,2.5,2.85,3.3,3.9,4.6];
function minimize(B,o){o=o||{};const m=o.margin!=null?+o.margin:1;const r5=v=>Math.ceil(v*2)/2;
  const parts=B.comps.filter(c=>c.kind!=='none');if(!parts.length)throw new Error('부품이 없습니다.');
  let area=0,bw=0,bh=0;parts.forEach(c=>{const w=c.bb[2]-c.bb[0],h=c.bb[3]-c.bb[1];area+=(w+0.6)*(h+0.6)*(c.side==='B'&&!c.pads.some(p=>p.drill)?0.5:1);bw=Math.max(bw,w);bh=Math.max(bh,h);});
  const holes=B.drills.filter(d=>!d.plated&&!d.own&&!d._pad);holes.forEach(d=>{area+=(d.d+2.4)*(d.d+2.4);});
  const asp=o.aspect||Math.max(0.4,Math.min(2.5,B.W/B.H));const R=PCBEDIT.cornerRadius(B);
  const ks=o.ks||MIN_KS;const tries=[];const W0=B.W,H0=B.H;
  for(const k of ks){let W=r5(Math.sqrt(area*k*asp)),H=r5(area*k/W);W=Math.max(W,r5(bw+2*m+2),r5(2*R+4));H=Math.max(H,r5(bh+2*m+2),r5(2*R+4));
    if(o.max!==false&&W*H>W0*H0+1e-6&&tries.length)break; // never larger than the board we started from
    PCBEDIT.resizeBoard(B,W,H,{anchor:'center'});
    const r=place(B,{strategy:o.strategy||'compact',scratch:true,seed:o.seed!=null?o.seed:1,power:o.power,fixed:o.fixed,edge:m,effort:o.effort||1,both:!!o.both});
    const bad=PCBEDIT.drc(B).filter(d=>d.code==='courtyard'||d.code==='edge').length+r.fails.length;
    tries.push({W,H,k,bad});if(o.onTry)o.onTry(tries[tries.length-1]);
    if(!bad)return{ok:true,W,H,k,place:r,tries,W0,H0};}
  return{ok:false,tries,W0,H0};}
return{STRATS,ALIAS,strategy,classify,place,metrics,clearCopper,ensurePour,fanout,gndNet,minimize,MIN_KS};
})();
if(typeof module!=='undefined')module.exports=AUTOPLACE;
