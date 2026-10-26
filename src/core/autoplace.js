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


/* ---------- functional zones (floorplan) ----------
   groups: input (connector · reverse FET · TVS) · power (regulators) · mcu (MCU · crystal · debug · LED/button) · comm (CAN)
           · stage (gate driver · bridge FETs · shunts · bulk · phase terminal) · sense (current amps · NTC · hall inputs)
   floorplan(): vertical strips sized by the parts' area, every zone touching a board edge so its connectors reach one —
     motor:   [comm / mcu] [power / sense] [stage / input]  (stage + battery input share the right edge: the high-current
              loop battery → bulk → bridge → shunt → GND stays in one column, next to the housing / heat-sink side)
     general: [comm / input] [power] [mcu / sense]
   place() adds a cost for every part outside its zone (soft; opts.zoneHard → much stronger) and seeds scratch placement
   inside the zone. B.zones = {on, template, rects:{g:[x0,y0,x1,y1]}, groupOf:{ref:g}} is reused by later re-placements. */
const ZONES={input:{label:'입력 · 보호',col:'#e0a040'},power:{label:'전원부',col:'#e05a5a'},mcu:{label:'MCU부',col:'#4f8fe0'},comm:{label:'통신',col:'#9a6be0'},stage:{label:'파워스테이지',col:'#e07a2a'},sense:{label:'센싱',col:'#3fb08a'}};
function floorplan(B,groupOf,o){o=o||{};const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const x0=Math.min(...ring.map(p=>p[0])),y0=Math.min(...ring.map(p=>p[1])),x1=Math.max(...ring.map(p=>p[0])),y1=Math.max(...ring.map(p=>p[1]));const W=x1-x0,H=y1-y0;
  const area={};B.comps.forEach(c=>{const g=groupOf[c.ref];if(!g||!c.bb)return;area[g]=(area[g]||0)+(c.bb[2]-c.bb[0]+1)*(c.bb[3]-c.bb[1]+1);});
  const has=g=>(area[g]||0)>0;const motor=o.template?o.template==='motor':has('stage');
  const cols=(motor?[['comm','mcu'],['power','sense'],['stage','input']]:[['comm','input'],['power'],['mcu','sense','stage']]).map(c=>c.filter(has)).filter(c=>c.length);
  if(!cols.length)return null;
  const ca=cols.map(c=>c.reduce((s,g)=>s+area[g],0)),tot=ca.reduce((a,b)=>a+b,0);
  let w=ca.map(a=>Math.max(0.12,a/tot));const ws=w.reduce((a,b)=>a+b,0);w=w.map(v=>v/ws*W);
  const rects={};let x=x0;cols.forEach((c,i)=>{const xe=i===cols.length-1?x1:x+w[i];const ct=c.reduce((s,g)=>s+area[g],0);let y=y1;
    c.forEach((g,j)=>{const h=j===c.length-1?y-y0:Math.max(0.2*H,area[g]/ct*H);rects[g]=[+x.toFixed(2),+(y-h).toFixed(2),+xe.toFixed(2),+y.toFixed(2)];y-=h;});x=xe;});
  return{on:true,template:motor?'motor':'general',rects,groupOf:Object.assign({},groupOf),box:[x0,y0,x1,y1]};}
// zones follow a resized board (rects kept as fractions of the outline box)
function zonesFit(B){const Z=B.zones;if(!Z||!Z.rects||!Z.box)return Z;const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const b=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];const o=Z.box;
  if(b.every((v,i)=>Math.abs(v-o[i])<1e-6))return Z;const sx=(b[2]-b[0])/(o[2]-o[0]),sy=(b[3]-b[1])/(o[3]-o[1]);
  Object.keys(Z.rects).forEach(g=>{const r=Z.rects[g];Z.rects[g]=[b[0]+(r[0]-o[0])*sx,b[1]+(r[1]-o[1])*sy,b[0]+(r[2]-o[0])*sx,b[1]+(r[3]-o[1])*sy].map(v=>+v.toFixed(2));});Z.box=b;return Z;}
function zoneReport(B){const Z=B.zones;if(!Z||!Z.rects)return null;const out=[];
  Object.entries(Z.rects).forEach(([g,r])=>{const cs=B.comps.filter(c=>Z.groupOf[c.ref]===g&&c.bb);let used=0,outN=[];
    cs.forEach(c=>{const b=c.bb;used+=(b[2]-b[0])*(b[3]-b[1]);const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;if(cx<r[0]||cx>r[2]||cy<r[1]||cy>r[3])outN.push(c.ref);});
    out.push({g,label:(ZONES[g]||{}).label||g,rect:r,parts:cs.length,util:Math.round(used/((r[2]-r[0])*(r[3]-r[1]))*100),out:outN});});
  return out;}

/* ---------- power-stage macro placement (bridge of 2-FET packages) ----------
   The power loop decides the copper: battery bus → half-bridge → phase terminal, shunt on the low-side source. The macro
   puts the motor terminal on the stage zone's outer edge, one 2-FET package per phase in a column facing it (battery pads
   toward the bus side, phase pad toward the terminal, low-side source / shunt node up) and the shunt right on that source;
   everything else is placed around them by the annealer. Returns the refs it fixed (or null). */
function powerMacro(B,rect,o){o=o||{};PCBEDIT.prepare(B);
  const fets=B.comps.filter(c=>c.pads.length===10&&c.pads.some(p=>p.n==='9')&&c.pads.some(p=>p.n==='10')&&/^Q/.test(c.ref));if(fets.length<2)return null;
  const role=c=>{const bat=c.pads.find(p=>p.n==='9').net,ph=c.pads.find(p=>p.n==='10').net;const sns=c.pads.find(p=>p.net&&p.net!==bat&&p.net!==ph&&/SNS|GND/i.test(p.net)&&p.n!=='9'&&p.n!=='10');return{bat,ph,sns:sns?sns.net:null};};
  const R=fets.map(c=>Object.assign({c},role(c)));const bat=R[0].bat;
  const term=B.comps.filter(c=>/^J/.test(c.ref)&&R.every(r=>c.pads.some(p=>p.net===r.ph))).sort((a,b)=>a.pads.length-b.pads.length)[0];if(!term)return null;
  R.forEach(r=>{r.sh=r.sns?B.comps.find(c=>/^R/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===r.sns)&&/^(2512|2010|1206)$/.test(c.fp||'')):null;});
  // supply entry: the reverse-protection FET between the input terminal net and the bridge supply, and that input terminal
  const qin=B.comps.find(c=>/^Q/.test(c.ref)&&!fets.includes(c)&&c.pads.some(p=>p.net===bat));const vin=qin?(qin.pads.find(p=>p.net&&p.net!==bat&&B.comps.some(j=>/^J/.test(j.ref)&&j!==term&&j.pads.some(q=>q.net===p.net)))||{}).net:null;
  const jin=vin?B.comps.find(c=>/^J/.test(c.ref)&&c!==term&&c.pads.some(p=>p.net===vin)):null;
  const pose=(c,x,y,rot)=>{canonical(B,c);if(rot)PCBEDIT.rotate(B,c,rot);PCBEDIT.prepare(B);const bx=(c.bb[0]+c.bb[2])/2,by=(c.bb[1]+c.bb[3])/2;PCBEDIT.move(B,c,x-bx,y-by);PCBEDIT.prepare(B);};
  const cen=(c,f)=>{const ps=c.pads.filter(f);if(!ps.length)return null;const w=p=>p.w*p.h,W=ps.reduce((a,p)=>a+w(p),0);return[ps.reduce((a,p)=>a+p.x*w(p),0)/W-c.x,ps.reduce((a,p)=>a+p.y*w(p),0)/W-c.y];}; // area-weighted (the exposed pad carries the current)
  const bestRot=(c,score)=>{let best=null;[0,90,180,270].forEach(rot=>{canonical(B,c);if(rot)PCBEDIT.rotate(B,c,rot);PCBEDIT.prepare(B);const sc=score(c);if(!best||sc>best.sc)best={rot,sc};});canonical(B,c);if(best.rot)PCBEDIT.rotate(B,c,best.rot);PCBEDIT.prepare(B);return best.rot;};
  const edge=o.edge||0.6,fixed=[],keepout=[];
  // motor terminal: pads in a vertical line on the outer (right) edge of the zone
  const tRot=bestRot(term,c=>{const xs=c.pads.map(p=>p.x),ys=c.pads.map(p=>p.y);return(Math.max(...ys)-Math.min(...ys))-(Math.max(...xs)-Math.min(...xs));});
  const tw=term.bb[2]-term.bb[0];
  // FET orientation: battery away from the terminal, phase toward it, shunt node up
  const fRot=bestRot(R[0].c,c=>{const r=R[0];const b=cen(c,p=>p.net===r.bat),ph=cen(c,p=>p.net===r.ph),sn=cen(c,p=>p.net===r.sns);return(ph?ph[0]:0)-(b?b[0]:0)+(sn?sn[1]:0)*0.5;});
  const fw=R[0].c.bb[2]-R[0].c.bb[0],fh=R[0].c.bb[3]-R[0].c.bb[1];
  const shH=R[0].sh?Math.min(R[0].sh.bb[2]-R[0].sh.bb[0],R[0].sh.bb[3]-R[0].sh.bb[1]):0;
  const busW=Math.max(3,o.busW||4);const shL=R[0].sh?Math.max(R[0].sh.bb[2]-R[0].sh.bb[0],R[0].sh.bb[3]-R[0].sh.bb[1]):0;const tL=rect[2]-edge-tw;
  const fx=Math.min(tL-(o.gap||5)-fw/2,tL-1-shL-fw/2);const busX1=fx-fw/2-0.4,busX0=busX1-busW,bx=(busX0+busX1)/2;
  // supply entry on the bottom edge: reverse-protection FET right under the bus (supply pad up), input terminal beside it
  let yIn=rect[1]+edge;
  if(qin){const r=bestRot(qin,c=>{const a=cen(c,p=>p.net===bat),b=cen(c,p=>p.net===vin);return(a?a[1]:0)-(b?b[1]:0);});const h=qin.bb[3]-qin.bb[1];pose(qin,bx,rect[1]+edge+h/2,r);fixed.push(qin.ref);yIn=Math.max(yIn,qin.bb[3]+1.0);}
  if(jin){bestRot(jin,c=>{const xs=c.pads.map(p=>p.x),ys=c.pads.map(p=>p.y);return(Math.max(...xs)-Math.min(...xs))-(Math.max(...ys)-Math.min(...ys));});
    const w=jin.bb[2]-jin.bb[0],h=jin.bb[3]-jin.bb[1];let x=qin?qin.bb[0]-1.2-w/2:bx;if(x-w/2<rect[0]+edge)x=qin?qin.bb[2]+1.2+w/2:bx;pose(jin,x,rect[1]+edge+h/2,jin.rot||0);fixed.push(jin.ref);if(!qin)yIn=Math.max(yIn,jin.bb[3]+1.2);}
  // FET column (each row: FET with its shunt above) from the top of the zone down, the motor terminal beside it
  const top=rect[3]-edge;const H=top-yIn;const shW=R[0].sh?Math.min(R[0].sh.bb[2]-R[0].sh.bb[0],R[0].sh.bb[3]-R[0].sh.bb[1]):0;
  const blk=fh+(shW?0.9+shW:0)+1.0;let P=Math.max(blk+1.5,9);if(P*R.length>H)P=blk;
  const yc=top-P*R.length/2;pose(term,rect[2]-edge-tw/2,yc,tRot);fixed.push(term.ref);
  const pinY=ph=>{const p=term.pads.find(q=>q.net===ph);return p?p.y:yc;};R.sort((a,b)=>pinY(b.ph)-pinY(a.ph));
  R.forEach((r,k)=>{const bTop=top-k*P;const yF=bTop-(shW?0.9+shW:0)-0.5-fh/2;pose(r.c,fx,yF,fRot);fixed.push(r.c.ref);
    if(r.sh){const sn=r.c.pads.filter(p=>p.net===r.sns);const sx=sn.reduce((a,p)=>a+p.x,0)/sn.length;
      // shunt horizontal right above the FET, its shunt-node pad over the FET's source pins, the GND end toward the terminal side
      const left=o.planes&&o.planes.has(bat);let bs=null;[0,180].forEach(rot=>{canonical(B,r.sh);if(rot)PCBEDIT.rotate(B,r.sh,rot);PCBEDIT.prepare(B);const a=r.sh.pads.find(p=>p.net===r.sns);const v=(a.x-r.sh.x)*(left?-1:1);if(a&&(!bs||v<bs.ax))bs={rot,ax:v};});
      canonical(B,r.sh);if(bs.rot)PCBEDIT.rotate(B,r.sh,bs.rot);PCBEDIT.prepare(B);const a=r.sh.pads.find(p=>p.net===r.sns);
      PCBEDIT.move(B,r.sh,sx-a.x,r.c.bb[3]+0.9-r.sh.bb[1]);PCBEDIT.prepare(B);fixed.push(r.sh.ref);
      // Kelvin net tie of the sense amplifier's minus input (SNS → SNSM): on the shunt's ground pad, just above it
      const tie=B.comps.find(c=>/^R/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===r.sns+'M')&&c.pads.some(p=>/GND/i.test(p.net||'')));
      if(tie){const g=r.sh.pads.find(p=>p.net&&p.net!==r.sns);if(g){canonical(B,tie);PCBEDIT.prepare(B);const right=g.x>(r.sh.bb[0]+r.sh.bb[2])/2;
        // in line with the shunt, beyond its ground end, ground pad toward the shunt
        const tg0=tie.pads.find(p=>/GND/i.test(p.net||''));if((tg0.x>tie.x)===right){PCBEDIT.rotate(B,tie,180);PCBEDIT.prepare(B);}const tg=tie.pads.find(p=>/GND/i.test(p.net||''));
        const x=right?r.sh.bb[2]+0.3-tie.bb[0]:r.sh.bb[0]-0.3-tie.bb[2];PCBEDIT.move(B,tie,x,g.y-tg.y);PCBEDIT.prepare(B);fixed.push(tie.ref);}}}});
  // single-chip 3-phase gate driver (A4911 class): the IC whose pins reach the most gate-drive nets (driver side of the
  // gate resistors) sits beside the FET column, centred on it, gate pins toward the FETs — its 12 gate / bootstrap lines
  // stay short and do not have to cross the board. Per-phase drivers (IR2104: two drive nets each) keep the annealer.
  let drv=null;{const gateNets=new Set();R.forEach(r=>r.c.pads.forEach(p=>{if(p.net&&p.net!==r.bat&&p.net!==r.ph&&p.net!==r.sns&&!/GND/i.test(p.net))gateNets.add(p.net);}));
    const drvNets=new Set();B.comps.filter(c=>/^R/.test(c.ref)&&c.pads.length===2).forEach(c=>{const a=c.pads[0].net,b=c.pads[1].net;if(gateNets.has(a)&&b&&!gateNets.has(b)&&b!==bat)drvNets.add(b);else if(gateNets.has(b)&&a&&!gateNets.has(a)&&a!==bat)drvNets.add(a);});
    const cand=B.comps.filter(c=>/^U/.test(c.ref)&&!fixed.includes(c.ref)).map(c=>({c,n:new Set(c.pads.filter(p=>drvNets.has(p.net)).map(p=>p.net)).size})).sort((a,b)=>b.n-a.n);
    if(cand.length&&cand[0].n>=4&&(cand.length<2||cand[1].n<cand[0].n)){drv=cand[0].c;
      const dRot=bestRot(drv,c=>{const g=cen(c,p=>drvNets.has(p.net));return g?g[0]:0;});const dw=drv.bb[2]-drv.bb[0];
      const leftEdge=planeBus0()?Math.min(...R.map(r=>r.c.bb[0])):busX0;let x=leftEdge-(o.drvGap||6)-dw/2;if(x-dw/2<rect[0]+edge)x=rect[0]+edge+dw/2;
      const ys=R.map(r=>(r.c.bb[1]+r.c.bb[3])/2);pose(drv,x,(Math.min(...ys)+Math.max(...ys))/2,dRot);fixed.push(drv.ref);}}
  function planeBus0(){return!!(o.planes&&o.planes.has(bat));}
  const fitOk=P*R.length<=H+0.01;
  // the supply bus (battery side of the bridge) stays free of other parts
  const planeBus=o.planes&&o.planes.has(bat);if(!planeBus)keepout.push([busX0,yIn-1,busX1,top]);
  // the phase copper between the bridge column and the motor terminal stays free of other parts too
  const colB=Math.min(...R.map(r=>r.c.bb[1])),fR=Math.max(...R.map(r=>r.c.bb[2]));keepout.push([fR+0.2,colB-0.5,term.bb[0]-0.2,top]);
  return{fixed,keepout,bus:planeBus?null:[busX0,rect[1],busX1,top],net:bat,fit:fitOk,planeBus,driver:drv?drv.ref:null};}
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
  PCBEDIT.prepare(B);
  // power stage of 2-FET packages: a fixed macro (terminal · bridge column · shunts · supply entry) in the stage ∪ input
  // column, the rest annealed around it with its keep-outs (supply bus, phase copper)
  let macro=null;if(opts.scratch&&opts.macro!==false&&B.zones&&B.zones.on!==false&&B.zones.rects&&B.zones.rects.stage&&!(opts.only)){const Z=zonesFit(B);const rs=[Z.rects.stage,Z.rects.input].filter(Boolean);
    const col=[Math.min(...rs.map(r=>r[0])),Math.min(...rs.map(r=>r[1])),Math.max(...rs.map(r=>r[2])),Math.max(...rs.map(r=>r[3]))];
    const Imax=Math.max(0,...Object.values(B.netCurrent||{}).map(Number));const Pk=Object.values(B.netPeak||{}).sort((a,b)=>b.I-a.I)[0]||null;const need=typeof CURRENT!=='undefined'&&Imax?(CURRENT.needWidth?CURRENT.needWidth(Imax,Pk,{oz:B.oz||1,dT:B.dT||10,dTpk:B.dTpk||40,tb:B.t}).w:CURRENT.ipcWidth(Imax,{oz:B.oz||1,dT:B.dT||10})):4;
    const planes=new Set(PCB.stackOf(B).filter(x=>x.net&&x.role!=='sig').map(x=>x.net));
    try{macro=powerMacro(B,col,{busW:Math.min(8,need),planes});}catch(e){macro=null;}
    if(macro){B.powerBus=macro.bus?{rect:macro.bus,net:macro.net}:null;opts=Object.assign({},opts,{fixed:(opts.fixed||[]).concat(macro.fixed),keepout:(opts.keepout||[]).concat(macro.keepout)});}else B.powerBus=null;}
  const info=classify(B,opts);const R=rng(opts.seed!=null?opts.seed:1);
  const fixed=new Set((opts.fixed||[]).map(String));const only=opts.only?new Set(opts.only.map(String)):null;
  const movable=info.list.filter(o=>!fixed.has(o.ref)&&(!only||only.has(o.ref)));
  const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];
  const ob=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  const BW=ob[2]-ob[0],BH=ob[3]-ob[1],diag=Math.hypot(BW,BH),edgeM=opts.edge!=null?+opts.edge:1.0;
  const holesBB=B.outline.slice(1).map(r=>[Math.min(...r.map(p=>p[0]))-0.3,Math.min(...r.map(p=>p[1]))-0.3,Math.max(...r.map(p=>p[0]))+0.3,Math.max(...r.map(p=>p[1]))+0.3]);const holeHit=A=>holesBB.some(h=>A[0]<h[2]&&h[0]<A[2]&&A[1]<h[3]&&h[1]<A[3]);
  const n=movable.length;if(!n)return{moved:0,log:['움직일 부품이 없습니다.'],strategy:sk};
  const ZN=opts.zones!==undefined?opts.zones:(B.zones&&B.zones.on!==false?zonesFit(B):null);const zw=opts.zoneHard||(ZN&&ZN.hard)?60:(opts.zoneW!=null?+opts.zoneW:8);
  const ZR=movable.map(o=>ZN&&ZN.rects&&ZN.groupOf?ZN.rects[ZN.groupOf[o.ref]]||null:null);
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
  // power stage ∪ input: its bottom copper carries the phase / supply current (fill on both outer layers), so no bottom-side
  // parts there, and the parts of those groups stay on top
  const PZ=ZN&&ZN.rects&&ZN.rects.stage?[ZN.rects.stage,ZN.rects.input].filter(Boolean).reduce((a,r)=>a?[Math.min(a[0],r[0]),Math.min(a[1],r[1]),Math.max(a[2],r[2]),Math.max(a[3],r[3])]:r.slice(),null):null;
  const pzOv=A=>PZ?Math.max(0,Math.min(A[2],PZ[2])-Math.max(A[0],PZ[0]))*Math.max(0,Math.min(A[3],PZ[3])-Math.max(A[1],PZ[1])):0;
  const inPG=o=>!!(ZN&&ZN.groupOf&&/^(stage|input)$/.test(ZN.groupOf[o.ref]||''));
  const canB=movable.map(o=>!inPG(o)&&both&&!o.tht&&!o.elcap&&!o.conn&&(o.two||(opts.bothIcs!==false&&small(o)&&!o.mcu&&!o.driver&&!o.reg&&!o.fet&&!(o.P>0.3))));
  // obstacles: fixed parts and mounting holes
  const obst=[];(opts.keepout||[]).forEach(k=>obst.push({bb:k.slice(),side:'T',halo:0.3,cx:(k[0]+k[2])/2,cy:(k[1]+k[3])/2}));info.list.forEach(o=>{if(idx.has(o.ref))return;obst.push({bb:o.c.bb.slice(),side:o.tht?'both':o.c.side,halo:o.halo,o,cx:(o.c.bb[0]+o.c.bb[2])/2,cy:(o.c.bb[1]+o.c.bb[3])/2});});
  B.drills.forEach(d=>{if(d.plated||d.own||d._pad)return;const k=d.d/2+0.8;obst.push({bb:[d.x-k,d.y-k,d.x+k,d.y+k],side:'both',halo:0.4,hole:true,cx:d.x,cy:d.y});});
  // nets → pins
  const cls=nm=>B.netClass?B.netClass(nm):isGnd(nm)?'접지':'신호';const swSet=new Set(info.switchNets);
  const NET=[];const netsOf=movable.map(()=>[]);
  const drvRef=macro&&macro.driver;
  Object.keys(B.nets).forEach(nm=>{if(isGnd(nm))return;const pins=[];let fx=[];let onDrv=false;
    info.list.forEach(o=>o.c.pads.forEach((p,k)=>{if(p.net!==nm)return;if(o.ref===drvRef)onDrv=true;const i=idx.get(o.ref);if(i!=null)pins.push([i,k]);else fx.push([p.x,p.y]);}));
    if(pins.length+fx.length<2||!pins.length)return;
    let w=cls(nm)==='전원'?st.pwr*(pins.length+fx.length>10?0.5:1):1;
    // high-current nets (motor supply, phases, shunt nodes): keep the power loop short — pulls FETs, shunts, bulk caps and terminals together
    const Ihi=B.netCurrent&&+B.netCurrent[nm]||0;if(Ihi>=2)w=Math.max(w,1.5+Math.min(Ihi,60)/20);if(swSet.has(nm))w*=st.sw;if(/XTAL|OSC|XIN|XOUT|XI$|XO$|XTAL[12]/i.test(nm))w*=st.xt;
    // a fixed single-chip gate driver's private pin nets (bootstrap cap, RC filter, VREG / pump cap, pull-ups): the one passive on
    // the net sits right at the pin — otherwise its other, high-current end (phase) drags it to the FETs, 25 mm from the driver
    // (the 0 Ω sense / LSS net ties too: the long run from the shunt to the tie carries no current, so the Kelvin point stays at the
    // shunt pad while the fine-pitch pin only has to reach the tie next to it)
    if(onDrv&&pins.length===1&&fx.length===1)w=Math.max(w,8);
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
      else{X[i]=ob[0]+BW*(0.2+0.6*R());Y[i]=ob[1]+BH*(0.2+0.6*R());}
      const z=ZR[i];if(z&&!o.conn){X[i]=z[0]+(z[2]-z[0])*(0.25+0.5*R())-(b[0]+b[2])/2;Y[i]=z[1]+(z[3]-z[1])*(0.25+0.5*R())-(b[1]+b[3])/2;}
      V[i]=o.conn&&R()<0.5?1:0;});}
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
    if(PZ&&V[i]>=4){const ov=pzOv(A);if(ov>0)c+=(wOv*2+40)*(1+ov);}
    const z=ZR[i];if(z){const zx=Math.max(0,z[0]-A[0])+Math.max(0,A[2]-z[2])+Math.max(0,z[1]-A[1])+Math.max(0,A[3]-z[3]);if(zx>0)c+=zw*(zx+0.3*zx*zx)*(1+Math.sqrt(G[i].area)/4);}
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
  // crystals: the annealer can leave the crystal on the far side of the MCU (long XTAL lines that may not route at all).
  // Put it just outside the MCU's XTAL pins, facing them, with its load caps behind it; legalisation then nudges them
  // to the nearest free spot.
  const escX=opts.escape!=null?+opts.escape:1.3;
  movable.forEach((o,i)=>{if(!o.xtal)return;const xn=o.nets.filter(nm=>nm&&!isGnd(nm));if(!xn.length)return;
    const mo=info.list.find(q=>q.mcu&&q.c.pads.some(p=>xn.includes(p.net)));if(!mo)return;const mj=idx.get(mo.ref);
    let pts,ctr;if(mj!=null){const pp=G[mj].pads[V[mj]],b=G[mj].bb[V[mj]];pts=mo.c.pads.map((p,k)=>xn.includes(p.net)?[X[mj]+pp[k][0],Y[mj]+pp[k][1]]:null).filter(Boolean);ctr=[X[mj]+(b[0]+b[2])/2,Y[mj]+(b[1]+b[3])/2];}
    else{pts=mo.c.pads.filter(p=>xn.includes(p.net)).map(p=>[p.x,p.y]);ctr=[(mo.c.bb[0]+mo.c.bb[2])/2,(mo.c.bb[1]+mo.c.bb[3])/2];}
    if(!pts.length)return;const m=[pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];
    let dx=m[0]-ctr[0],dy=m[1]-ctr[1];if(Math.abs(dx)>Math.abs(dy)){dx=Math.sign(dx)||1;dy=0;}else{dy=Math.sign(dy)||1;dx=0;}
    const side=mj!=null?V[mj]&4:(mo.c.side==='B'?4:0);let best=null;
    for(let r=0;r<4;r++){const v=side|r;const b=G[i].bb[v];const ext=dx?(b[2]-b[0])/2:(b[3]-b[1])/2;const d=escX+0.8+ext;
      const cx=m[0]+dx*d,cy=m[1]+dy*d;const x=cx-(b[0]+b[2])/2,y=cy-(b[1]+b[3])/2;
      // the crystal pad of each XTAL net should face its MCU pin
      let c=0;o.c.pads.forEach((p,k)=>{if(!xn.includes(p.net))return;const q=G[i].pads[v][k];const t=pts.find((_,j)=>mo.c.pads.filter(pp=>xn.includes(pp.net))[j].net===p.net)||m;c+=Math.hypot(x+q[0]-t[0],y+q[1]-t[1]);});
      if(!best||c<best.c)best={c,v,x,y,ext};}
    X[i]=best.x;Y[i]=best.y;V[i]=best.v;
    // load caps (two-pin parts on an XTAL net) just beyond the crystal, one on each side of the axis
    const caps=movable.map((q,k)=>k).filter(k=>k!==i&&ROLE[k].two&&ROLE[k].nets.some(nm=>xn.includes(nm)));
    caps.forEach((k,j)=>{const b=G[k].bb[V[k]];const far=escX+0.8+2*best.ext+1.4;const sgn=j%2?1:-1;
      const cx=m[0]+dx*far+(dy?sgn*1.6:0),cy=m[1]+dy*far+(dx?sgn*1.6:0);V[k]=side|(dx?1:0);const b2=G[k].bb[V[k]];X[k]=cx-(b2[0]+b2[2])/2;Y[k]=cy-(b2[1]+b2[3])/2;});});
  wOv=405;
  // legalise on the grid: biggest parts first, nearest free spot (full spacing, then half, then the DRC minimum)
  const grid=opts.grid||0.25;const snap=v=>Math.round(v/grid)*grid;const escG=opts.escape!=null?+opts.escape:1.3;
  const order=movable.map((_,i)=>i).sort((a,b)=>(ROLE[b].conn-ROLE[a].conn)||G[b].area-G[a].area);
  const placed=[];const fails=[];
  const ok=(i,f)=>{bbI(i,A);const o=ROLE[i];const m=o.conn?0.35:Math.min(edgeM,0.6+0.4*f);if(A[0]<ob[0]+m||A[1]<ob[1]+m||A[2]>ob[2]-m||A[3]>ob[3]-m)return false;
    if((ring.length>4||B.outline.length>1)&&![[A[0],A[1]],[A[2],A[1]],[A[2],A[3]],[A[0],A[3]],[(A[0]+A[2])/2,(A[1]+A[3])/2]].every(p=>PCB.inBoard(p[0],p[1],B.outline)))return false;if(holeHit(A))return false;
    if(PZ&&V[i]>=4&&pzOv(A)>0)return false;
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
  return{moved:n,strategy:sk,label:STRATS[sk].label,iters,accepted:acc,cost:finalCost,fails,bottom:movable.filter((_,i)=>V[i]>=4).map(o=>o.ref),info,macro};
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
  // exact clearance of a new via (and its stub) to other nets' copper — the grid alone can be off by up to a cell
  const SX=AUTOROUTE.shapesOfBoard(B).filter(x=>!x.hole||true);const XC=2,XG=new Map();const xadd=(s0)=>{const b=s0.k==='cap'?[Math.min(s0.a[0],s0.b[0])-s0.r,Math.min(s0.a[1],s0.b[1])-s0.r,Math.max(s0.a[0],s0.b[0])+s0.r,Math.max(s0.a[1],s0.b[1])+s0.r]:(e=>[s0.x-e,s0.y-e,s0.x+e,s0.y+e])(Math.hypot(s0.hw,s0.hh));
    for(let x=Math.floor(b[0]/XC);x<=Math.floor(b[2]/XC);x++)for(let y=Math.floor(b[1]/XC);y<=Math.floor(b[3]/XC);y++){const kk=x*100003+y;let a=XG.get(kk);if(!a)XG.set(kk,a=[]);a.push(s0);}};SX.forEach(xadd);
  const near=(x,y)=>{const o=new Set();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=XG.get((Math.floor(x/XC)+i)*100003+Math.floor(y/XC)+j);if(a)a.forEach(s0=>o.add(s0));}return o;};
  const exactOk=(x,y,stub,p,li)=>{const r=via.d/2;for(const s0 of near(x,y)){if(s0.net===p.net&&!s0.hole)continue;const m=s0.hole?Math.max(clr,0.25):clr;if(AUTOROUTE.dist(s0,x,y)-r<m-0.005)return false;}
    if(stub){const L=Math.hypot(x-p.x,y-p.y),n=Math.max(1,Math.ceil(L/0.05));for(let i=0;i<=n;i++){const qx=p.x+(x-p.x)*i/n,qy=p.y+(y-p.y)*i/n;for(const s0 of near(qx,qy)){if(s0.net===p.net&&!s0.hole)continue;if(!s0.L.includes(li))continue;if(AUTOROUTE.dist(s0,qx,qy)-w/2<clr-0.005)return false;}}}
    xadd({k:'cap',a:[x,y],b:[x,y],r,L:ALL,net:p.net});if(stub)xadd({k:'cap',a:[p.x,p.y],b:[x,y],r:w/2,L:[li],net:p.net});return true;};
  B.comps.forEach(c=>c.pads.forEach(p=>{
    if(!p.net||!pour[p.net]||p.drill)return;const li=p.side==='B'?NL-1:0;if(pour[p.net].has(li))return;if(joined.has(p))return;
    if(B.vias.some(v=>v.net===p.net&&Math.abs(v.x-p.x)<=p.w/2+v.d/2&&Math.abs(v.y-p.y)<=p.h/2+v.d/2&&Math.hypot(v.x-p.x,v.y-p.y)<Math.max(p.w,p.h)/2+v.d))return;
    const k=P.idOf(p.net);const pw=p.shape==='parts'&&p.lbb?p.lbb[2]-p.lbb[0]:p.w,ph=p.shape==='parts'&&p.lbb?p.lbb[3]-p.lbb[1]:p.h;
    // fine-pitch pins can wait until the signals have escaped (opts.skipFine), then take whatever room is left
    if(opts.skipFine&&Math.min(pw,ph)<0.36&&!c.pads.some(q=>q!==p&&q.net===p.net&&!q.drill&&Math.min(q.w,q.h)>=1.2)){fail.push(p.ref+'.'+p.n);return;}
    const put0=(x,y,stub)=>exactOk(x,y,stub,p,li)&&(put(x,y,stub),true);
    const put=(x,y,stub)=>{const v={x,y,d:via.d,drill:via.drill,net:p.net,auto:true,fan:true};B.vias.push(v);add.push(v);
      AUTOROUTE.paint(G,{k:'cap',a:[x,y],b:[x,y],r:via.d/2,L:ALL,net:p.net},k,wMax,via.d/2,clr);
      if(stub){const t={t:'seg',a:[p.x,p.y],b:[x,y],w,net:p.net,auto:true,fan:true,_side:keys[li]};B.layers[keys[li]+'.cu'].push(t);add.push(t);AUTOROUTE.paint(G,{k:'cap',a:t.a,b:t.b,r:w/2,L:[li],net:p.net},k,wMax,via.d/2,clr);}};
    // big (exposed / tab) pads: vias inside the pad, a small array for heat when asked
    if(Math.min(pw,ph)>=1.2&&pw*ph>=2){const n=opts.thermal?Math.max(1,Math.min(9,Math.floor(pw/1.2)*Math.floor(ph/1.2))):1;const nx=Math.max(1,Math.round(Math.sqrt(n*pw/ph))),ny=Math.max(1,Math.ceil(n/nx));let any=false;
      const a=(p.ang||0)*D2R;for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const lx=(i-(nx-1)/2)*Math.min(1.2,(pw-0.8)/Math.max(1,nx-1||1)),ly=(j-(ny-1)/2)*Math.min(1.2,(ph-0.8)/Math.max(1,ny-1||1));
        const x=p.x+lx*Math.cos(a)-ly*Math.sin(a),y=p.y+lx*Math.sin(a)+ly*Math.cos(a);if(okV(x,y,k)&&put0(x,y,false))any=true;}
      if(any)return;}
    // a fine-pitch ground pin of a part with an exposed pad of the same net (A4911: "GND terminals connected together and to
    // the exposed pad close to the device"): short track straight in under the body, then to the pad — the pad has the vias
    if(Math.min(pw,ph)<0.36){const ep=c.pads.find(q=>q!==p&&q.net===p.net&&!q.drill&&Math.min(q.w,q.h)>=1.2);
      if(ep){const a0=(p.ang||0)*D2R;let ux=Math.cos(a0),uy=Math.sin(a0),half=p.w/2;if(p.h>p.w){ux=-Math.sin(a0);uy=Math.cos(a0);half=p.h/2;}
        if((p.x-ep.x)*ux+(p.y-ep.y)*uy>0){ux=-ux;uy=-uy;}const tw=Math.min(w,0.25);
        for(const k2 of[half+0.5,half+0.8,half+1.1]){const m=[p.x+ux*k2,p.y+uy*k2];const pts=[[p.x,p.y],m,[ep.x,ep.y]];let ok=true;
          for(let i=1;i<pts.length;i++)if(!okT(pts[i-1],pts[i],li,k)){ok=false;break;}if(!ok)continue;
          const t={t:'path',pts,w:tw,net:p.net,auto:true,fan:true,_side:keys[li]};B.layers[keys[li]+'.cu'].push(t);add.push(t);
          for(let i=1;i<pts.length;i++)AUTOROUTE.paint(G,{k:'cap',a:pts[i-1],b:pts[i],r:tw/2,L:[li],net:p.net},k,wMax,via.d/2,clr);return;}}}
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
    const cands=[];dirs.forEach(([ux,uy])=>{const s0=ext(ux,uy)+via.d/2+clr*0.5;for(let s=s0;s<=s0+(opts.reach?+opts.reach:(Math.min(pw,ph)<0.36?3.4:2.4));s+=0.1)cands.push({x:p.x+ux*s,y:p.y+uy*s,sc:s-1.2*(ux*ox+uy*oy)});});
    cands.sort((q,r)=>q.sc-r.sc);
    for(const q of cands){if(okV(q.x,q.y,k)&&!inLane(q.x,q.y,p.net)&&okT([p.x,p.y],[q.x,q.y],li,k)&&put0(q.x,q.y,true))return;}
    for(const q of cands){if(okV(q.x,q.y,k)&&okT([p.x,p.y],[q.x,q.y],li,k)&&put0(q.x,q.y,true))return;}
    // no room around the pad (dense double-sided board): a via in the pad itself (filled / capped via-in-pad)
    if(opts.inPad!==false&&Math.min(pw,ph)>=via.d+0.05&&okV(p.x,p.y,k)&&put0(p.x,p.y,false)){add[add.length-1].inpad=true;return;}
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
return{ZONES,floorplan,zoneReport,zonesFit,powerMacro,STRATS,ALIAS,strategy,classify,place,metrics,clearCopper,ensurePour,fanout,gndNet,minimize,MIN_KS};
})();
if(typeof module!=='undefined')module.exports=AUTOPLACE;
