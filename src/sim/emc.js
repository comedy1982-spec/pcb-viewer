/* EMC/EMI pre-compliance analysis for motor-controller boards (layout-based estimates, not a field solver).
   Follows the four parameter groups of a motor-controller EMC review:
   1 power stage: commutation loop inductance L_loop (DC-link cap → VM → half-bridge → PGND), turn-off spike L·dI/dt,
     reverse recovery (Qrr, trr), ringing frequency with C_oss, trapezoid spectrum (tr/tf corners −20/−40 dB/dec)
   2 gate drive & coupling: gate loop L_gate and common-source inductance L_CSI (discrete FETs), crosstalk C_m/L_m from
     high dV/dt phase nodes and PWM lines to sensor/communication/ADC lines (method of images over the return plane)
   3 passive parasitics: decoupling-cap ESL incl. mounting (vias, stubs) → self-resonance f_SRF; EMI-filter presence
   4 system coupling: switch-node copper ↔ heatsink/housing capacitance C_p (I_cm = C_p·dV/dt), return-path slots and
     loop areas, harness common-mode radiation (Ott: E_DM = 1.316e-14·f²·A·I/r, E_CM = 1.257e-6·f·L·I/r).
   Needs PCB (segDist) and SIM (microstrip, nominalV). */
const EMC=(function(){
"use strict";
const MU0=4e-7*Math.PI,EPS0=8.854e-12,C0=2.998e8;
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|0V)$/i.test(String(n||'').replace(/^\//,''));
const ESL_PKG={'0201':0.3,'0402':0.4,'0603':0.6,'0805':0.8,'1206':1.0,'1210':1.1,'1812':1.3,'2220':1.4};
const DEF={Vbus:null,fsw:null,Ipk:2,tr:50,tf:50,Coss:300,Qrr:20,trr:40,trDig:5,Vdig:3.3,Vabs:null,
  hsPos:'below',timT:1.0,timEr:6,harness:1.0,shield:false,shieldDb:20,dist:1.0,Zana:1000,Zdig:10000,Zcom:60,Ciss:600};
const segsOf=(B,net)=>{const o=[];['T','B'].forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.net!==net)return;if(p.t==='seg')o.push({a:p.a,b:p.b,w:p.w,L});else if(p.t==='path')for(let i=1;i<p.pts.length;i++)o.push({a:p.pts[i-1],b:p.pts[i],w:p.w,L});}));return o;};
const len=s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);
const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
const hasPour=(B,L)=>B.layers[L+'.cu'].some(p=>p.t==='pour'&&isGnd(p.net));
const opp=L=>L==='T'?'B':'T';
// per-length inductance of a trace over its return plane (nH/mm) from the microstrip Z0 and delay; without a plane: two-wire
function Lpm(B,w,L,env){if(hasPour(B,opp(L))||hasPour(B,L)){const m=SIM.microstrip(w,env.h,env.cu*1e-3,env.er);return m.z0*m.ps*1e-3;}return 0.4*Math.log(2*5/Math.max(0.05,w));}
const Lvia=(h,d)=>0.2*h*(Math.log(4*h/d)+1); // nH, h,d in mm
const pkgOf=fp=>{const m=String(fp||'').match(/(0201|0402|0603|0805|1206|1210|1812|2220)/);return m?m[1]:null;};

/* ---------- 1. power stage ---------- */
function findDrivers(B){
  const out=[];B.comps.forEach(c=>{const fn=p=>String(p.fn||'').toUpperCase();
    const vm=c.pads.filter(p=>/^(VM|VBB|VS|VMOT|VIN_M|PVDD)$/.test(fn(p))&&p.net),outs=c.pads.filter(p=>/^(OUT\d|OUT[A-C]|SH[A-C]|PHASE[A-C]?|SW\d?)$/.test(fn(p))&&p.net),pg=c.pads.filter(p=>/^(PGND\d?|GND)$/.test(fn(p))&&p.net&&isGnd(p.net));
    if(vm.length&&outs.length)out.push({c,vm,outs,pg:pg.length?pg:c.pads.filter(p=>isGnd(p.net)),kind:'integrated'});});
  B.comps.forEach(c=>{const g=c.pads.find(p=>/^G$/i.test(p.fn||'')),s=c.pads.find(p=>/^S$/i.test(p.fn||'')),d=c.pads.find(p=>/^D$/i.test(p.fn||''));
    if(g&&s&&d&&(/^Q\d/.test(c.ref)||(c.model&&c.model.type==='nmos')))out.push({c,g,s,d,kind:'fet'});});
  return out;
}
function powerStage(B,cfg,env){
  const drv=findDrivers(B),br=drv.filter(d=>d.kind==='integrated'),fets=drv.filter(d=>d.kind==='fet');
  const res={drivers:br.map(d=>d.c.ref),fets:fets.map(d=>d.c.ref),loops:[],switchNets:[]};
  const h=env.t,dvia=0.3;
  if(br.length){const D=br[0];const vmNet=D.vm[0].net;res.vmNet=vmNet;res.Vbus=cfg.Vbus||SIM.nominalV(vmNet)||12;
    res.switchNets=[...new Set(D.outs.map(p=>p.net))];
    const caps=B.comps.filter(c=>/^C\d/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===vmNet)&&c.pads.some(p=>isGnd(p.net)));
    caps.forEach(c=>{const pv=c.pads.find(p=>p.net===vmNet),pg=c.pads.find(p=>isGnd(p.net));
      const vmP=D.vm.slice().sort((a,b)=>dist([a.x,a.y],[pv.x,pv.y])-dist([b.x,b.y],[pv.x,pv.y]))[0];const gP=D.pg.slice().sort((a,b)=>dist([a.x,a.y],[pg.x,pg.y])-dist([b.x,b.y],[pg.x,pg.y]))[0]||vmP;
      const lf=dist([pv.x,pv.y],[vmP.x,vmP.y])*1.2,lr=dist([pg.x,pg.y],[gP.x,gP.y])*1.2;const w=0.5;const layer=pv.side==='B'?'B':'T';
      const pkg=pkgOf(c.fp);const cp=capPar(c);const esl=cp&&cp.esl?cp.esl:pkg?ESL_PKG[pkg]:/(µ|u)F/.test(c.val)&&parseFloat(c.val)>=47?5:1.0;
      const Lfwd=Lpm(B,w,layer,env)*lf,Lv=2*Lvia(h,dvia),Lpkg=1.0;const Ltot=Lfwd+Lv+esl+Lpkg;
      const area=(lf+lr)/2*h+dist([pv.x,pv.y],[pg.x,pg.y])*h; // mm² (forward over plane + cap body)
      res.loops.push({cap:c.ref,val:c.val,pkg,lf,lr,esl,Lfwd,Lvia:Lv,Lpkg,L:Ltot,area,pts:[[pv.x,pv.y],[vmP.x,vmP.y],[gP.x,gP.y],[pg.x,pg.y]]});});
    res.loops.sort((a,b)=>a.L-b.L);
    const Ls=res.loops.map(l=>l.L);res.L=Ls.length?1/Ls.reduce((a,l)=>a+1/l,0):NaN;res.Lbest=Ls[0];res.area=res.loops[0]?res.loops[0].area:NaN;
    const vabs=cfg.Vabs||absMax(D.c)||res.Vbus*2;res.Vabs=vabs;
    const L=res.loops.length?res.Lbest:30;res.Lused=L;
    const didt=cfg.Ipk/(cfg.tf*1e-9);res.didt=didt;res.dV=L*1e-9*didt;
    res.Irr=2*cfg.Qrr*1e-9/(cfg.trr*1e-9);res.dVrr=L*1e-9*res.Irr/(cfg.trr*0.5e-9);
    res.Vpk=res.Vbus+Math.max(res.dV,res.dVrr);res.fring=1/(2*Math.PI*Math.sqrt(L*1e-9*cfg.Coss*1e-12));res.dvdt=res.Vbus/(cfg.tr*1e-9);}
  // gate loops of discrete FETs
  res.gates=fets.map(F=>{const gN=F.g.net,sN=F.s.net;const gl=segsOf(B,gN).reduce((a,s)=>a+len(s),0);
    // one hop through a series resistor on the gate net
    let extra=0,via='';const r=B.comps.find(c=>/^R\d/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>p.net===gN)&&c!==F.c);if(r){const o=r.pads.find(p=>p.net!==gN);if(o&&o.net){extra=segsOf(B,o.net).reduce((a,s)=>a+len(s),0);via=`${r.ref} ${r.val}`;}}
    const Lg=Lpm(B,0.3,'T',env)*(gl+extra)+0.5+Lvia(h,dvia);const sl=isGnd(sN)?0:segsOf(B,sN).reduce((a,s)=>a+len(s),0);
    const shunt=isGnd(sN)?null:B.comps.find(c=>/^R\d/.test(c.ref)&&c.pads.some(p=>p.net===sN)&&c.pads.some(p=>isGnd(p.net)));
    const Lcsi=isGnd(sN)?Lvia(h,dvia):Lpm(B,1.0,'T',env)*sl+(shunt?ESL_PKG[pkgOf(shunt.fp)]||1:0)+Lvia(h,dvia);
    const fg=1/(2*Math.PI*Math.sqrt(Lg*1e-9*cfg.Ciss*1e-12));const didt=cfg.Ipk/(cfg.tf*1e-9);
    return{ref:F.c.ref,val:F.c.val,gateNet:gN,srcNet:sN,len:gl+extra,via,Lg,Lcsi,shunt:shunt&&shunt.ref,fg,bounce:Lcsi*1e-9*didt};});
  return res;
}
function absMax(c){if(typeof PARTS==='undefined')return null;const info=PARTS.find(c.mpn)||PARTS.find(c.val);if(!info||!info.specs)return null;
  for(const[,v]of info.specs){const m=String(v).match(/절대\s*최대\s*(\d+(?:\.\d+)?)\s*V/);if(m)return parseFloat(m[1]);}return null;}

/* ---------- 4. system coupling ---------- */
function copperArea(B,nets){const set=new Set(nets);let aT=0,aB=0;
  ['T','B'].forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(!set.has(p.net))return;let a=0;if(p.t==='seg')a=len(p)*p.w;else if(p.t==='path')for(let i=1;i<p.pts.length;i++)a+=dist(p.pts[i-1],p.pts[i])*p.w;else return;if(L==='T')aT+=a;else aB+=a;}));
  B.comps.forEach(c=>c.pads.forEach(p=>{if(!set.has(p.net))return;const a=p.w*p.h*(p.shape==='circle'?Math.PI/4:1);if(p.side==='both'){aT+=a;aB+=a;}else if(p.side==='B')aB+=a;else aT+=a;}));
  return{aT,aB};}
function heatsinkC(B,nets,cfg,env){const{aT,aB}=copperArea(B,nets);
  const ser=(A,parts)=>A>0?1/parts.reduce((s,[d,er])=>s+d*1e-3/(EPS0*er*A*1e-6),0):0;
  let C;if(cfg.hsPos==='below')C=ser(aT,[[env.t,env.er],[cfg.timT,cfg.timEr]])+ser(aB,[[cfg.timT,cfg.timEr]]);
  else C=ser(aT,[[cfg.timT,cfg.timEr]])+ser(aB,[[env.t,env.er],[cfg.timT,cfg.timEr]]);
  const Cgnd=hasPour(B,'B')?EPS0*env.er*aT*1e-6/(env.t*1e-3):0;return{aT,aB,C,Cgnd};}
// segments of nets on one layer that cross segments of another layer where that layer carries the GND plane → plane slots
function segX(a,b,c,d){const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;}
function returnPath(B,sigNets,env){
  const out=[];['T','B'].forEach(L=>{const P=opp(L);if(!hasPour(B,P))return;
    const cutters=[];B.layers[P+'.cu'].forEach(p=>{if(isGnd(p.net)||p.t==='pour'||p.t==='pad')return;if(p.t==='seg')cutters.push({a:p.a,b:p.b,net:p.net});else if(p.t==='path')for(let i=1;i<p.pts.length;i++)cutters.push({a:p.pts[i-1],b:p.pts[i],net:p.net});});
    sigNets.forEach(n=>{segsOf(B,n).filter(s=>s.L===L).forEach(s=>{cutters.forEach(c=>{if(c.net!==n&&segX(s.a,s.b,c.a,c.b)){const t=((c.a[0]-s.a[0])*(c.b[1]-c.a[1])-(c.a[1]-s.a[1])*(c.b[0]-c.a[0]))/((s.b[0]-s.a[0])*(c.b[1]-c.a[1])-(s.b[1]-s.a[1])*(c.b[0]-c.a[0]));
      out.push({net:n,cut:c.net,layer:L,at:[s.a[0]+t*(s.b[0]-s.a[0]),s.a[1]+t*(s.b[1]-s.a[1])]});}});});});});
  return out;}
function loopAreas(B,sigNets,env){return sigNets.map(n=>{const ss=segsOf(B,n);const l=ss.reduce((a,s)=>a+len(s),0);if(!l)return null;
  const plane=ss.every(s=>hasPour(B,opp(s.L))||hasPour(B,s.L));const hgt=plane?env.t:5;return{net:n,len:l,area:l*hgt,plane};}).filter(Boolean).sort((a,b)=>b.area-a.area);}

/* ---------- 2. crosstalk (method of images over the return plane) ---------- */
function coupling(s,h,w,er){const e=EPS0*(er+1)/2,r=w/4;const p11=Math.log(2*h/r)/(2*Math.PI*e),p12=Math.log(Math.sqrt(s*s+4*h*h)/s)/(2*Math.PI*e);
  return{Cm:p12/(p11*p11-p12*p12),Lm:MU0/(2*Math.PI)*Math.log(Math.sqrt(s*s+4*h*h)/s)};} // per metre
function crosstalk(B,aggr,vict,env){
  const pairs=[];
  aggr.forEach(A=>vict.forEach(V=>{if(A.net===V.net)return;let Lp=0,sw=0;const marks=[];
    segsOf(B,A.net).forEach(sa=>segsOf(B,V.net).forEach(sv=>{if(sa.L!==sv.L)return;const la=len(sa);if(la<1e-6)return;const ux=(sa.b[0]-sa.a[0])/la,uy=(sa.b[1]-sa.a[1])/la;
      const lv=len(sv);if(lv<1e-6)return;const vx=(sv.b[0]-sv.a[0])/lv,vy=(sv.b[1]-sv.a[1])/lv;if(Math.abs(ux*vx+uy*vy)<Math.cos(20*Math.PI/180))return;
      const pr=p=>(p[0]-sa.a[0])*ux+(p[1]-sa.a[1])*uy;const t0=Math.max(0,Math.min(pr(sv.a),pr(sv.b))),t1=Math.min(la,Math.max(pr(sv.a),pr(sv.b)));if(t1-t0<0.3)return;
      const mid=[(sv.a[0]+sv.b[0])/2,(sv.a[1]+sv.b[1])/2];const d=Math.abs((mid[0]-sa.a[0])*uy-(mid[1]-sa.a[1])*ux);const s=Math.max(0.05,d-(sa.w+sv.w)/2);if(d>5)return;
      Lp+=t1-t0;sw+=(t1-t0)*d;marks.push([[sa.a[0]+ux*(t0+t1)/2,sa.a[1]+uy*(t0+t1)/2],[mid[0],mid[1]]]);}));
    if(Lp>0.5){const d=sw/Lp;const k=coupling(d,env.t,0.25,env.er);pairs.push({aggr:A.net,akind:A.kind,dvdt:A.dvdt,didt:A.didt||0,vict:V.net,vkind:V.kind,Z:V.Z,thr:V.thr,len:Lp,d,Cm:k.Cm*Lp*1e-3,Lm:k.Lm*Lp*1e-3,marks});}}));
  pairs.forEach(p=>{p.Vc=p.Cm*p.dvdt*p.Z;p.Vl=p.Lm*p.didt;p.V=p.Vc+p.Vl;p.ratio=p.V/p.thr;});
  return pairs.sort((a,b)=>b.ratio-a.ratio);
}

/* ---------- 3. decoupling caps ---------- */
function parseC(v){const m=String(v||'').replace(/[µμ]/g,'u').match(/(\d+(?:\.\d+)?)\s*([pnu])?F/i);if(!m)return null;return parseFloat(m[1])*({p:1e-12,n:1e-9,u:1e-6}[(m[2]||'').toLowerCase()]||1);}
function capPar(c){if(typeof PARTS==='undefined')return null;const i=PARTS.find(c.mpn);return i&&i.elec?i.elec:null;}
function decaps(B,env){
  return B.comps.filter(c=>/^C\d/.test(c.ref)&&c.pads.length===2&&c.pads.some(p=>isGnd(p.net))&&c.pads.some(p=>p.net&&!isGnd(p.net))).map(c=>{const C=parseC(c.val);if(!C)return null;
    const pkg=pkgOf(c.fp);const cp=capPar(c);const esl=cp&&cp.esl?cp.esl:pkg?ESL_PKG[pkg]:1.0,esr=cp&&cp.esr?cp.esr:0.01;const pg=c.pads.find(p=>isGnd(p.net));
    const vias=B.vias.filter(v=>isGnd(v.net)&&dist([v.x,v.y],[pg.x,pg.y])<2.5);const near=vias.length?Math.min(...vias.map(v=>dist([v.x,v.y],[pg.x,pg.y]))):null;
    const Lm=vias.length?Lpm(B,0.4,'T',env)*near+Lvia(env.t,0.4)/vias.length:Lpm(B,0.4,'T',env)*5+Lvia(env.t,0.4);
    const L=esl+Lm;const srf=1/(2*Math.PI*Math.sqrt(L*1e-9*C));const Z=f=>Math.hypot(esr,2*Math.PI*f*L*1e-9-1/(2*Math.PI*f*C));
    return{ref:c.ref,val:c.val,C,pkg:pkg||(c.kind==='elcap'?'전해':null),esl,esr,elec:c.kind==='elcap',Lm,L,srf,vias:vias.length,net:c.pads.find(p=>!isGnd(p.net)).net,Z30:Z(30e6),Z100:Z(100e6)};}).filter(Boolean).sort((a,b)=>a.srf-b.srf);
}

/* ---------- spectra ---------- */
// trapezoid envelope: flat 2·A·D, −20 dB/dec from 1/(π·τ), −40 dB/dec from 1/(π·tr)
function trap(A,f0,D,tr,f){const tau=D/f0,f1=1/(Math.PI*tau),f2=1/(Math.PI*tr);const a=2*A*D;return f<f1?a:f<f2?a*f1/f:a*f1*f2/(f*f);}
const dB=(x,ref)=>20*Math.log10(Math.max(1e-30,x/ref));
function spectra(R,cfg,freqs){
  const ps=R.ps,f0=cfg.fsw,D=0.5;if(!ps||!ps.Vbus)return null;const tr=cfg.tr*1e-9;
  const Cp=R.hs?R.hs.C:0;const A=(ps.area||100)*1e-6;const r=cfg.dist;
  return freqs.map(f=>{const V=trap(ps.Vbus,f0,D,tr,f);const I=Math.max(trap(cfg.Ipk,f0,D,cfg.tf*1e-9,f),trap(ps.Irr||0,f0,(cfg.trr*1e-9)*f0,cfg.trr*0.5e-9,f));
    const Icm=2*Math.PI*f*Cp*V;const Vlisn=Icm*25;const Edm=1.316e-14*f*f*A*I/r;const Lc=Math.min(cfg.harness,C0/(2*f));const Ecm=1.257e-6*f*Lc*Icm/r*(cfg.shield?Math.pow(10,-cfg.shieldDb/20):1);
    return{f,V:dB(V,1e-6),Icm:dB(Icm,1e-6),Vlisn:dB(Vlisn,1e-6),Edm:dB(Edm,1e-6),Ecm:dB(Ecm,1e-6)};});
}

/* ---------- main ---------- */
function analyze(B,opts){
  const cfg=Object.assign({},DEF,opts&&opts.cfg||{});const env=Object.assign({t:B.t||1.6,er:4.3,cu:35,h:(B.t||1.6)-0.07},opts&&opts.env||{});env.h=env.h||env.t;
  const H=opts&&opts.H;
  const ps=powerStage(B,cfg,env);
  // fsw from HSIS PWM timing when available
  if(!cfg.fsw){let f=null;if(H)H.items.forEach(it=>{if(/PWM|TOUT|TIM\d*_CH/i.test(it.func||'')&&/출력/.test(it.dir||'')){const m=String(it.timing||'').match(/(\d+(?:\.\d+)?)\s*([kK])?\s*Hz/);if(m){const v=parseFloat(m[1])*(m[2]?1e3:1);f=Math.max(f||0,v);}}});cfg.fsw=f||20000;}
  // aggressors / victims
  const nets=Object.keys(B.nets).filter(n=>!isGnd(n));
  const cat=n=>{if(!H)return null;const it=H.items.find(i=>i.net===n);return it?(it._cat||it.cat||''):null;};
  const pwmNets=new Set();if(H)H.items.forEach(it=>{if(/PWM|TOUT|TIM\d*_CH/i.test(it.func||'')&&it.net)pwmNets.add(it.net);});
  nets.forEach(n=>{if(/^(IN_?[UVW]|PWM|.*_PWM|MOTOR_PWM|GATE)$/i.test(n))pwmNets.add(n);});
  const aggr=ps.switchNets.map(n=>({net:n,kind:'상 출력 (스위칭 노드)',dvdt:ps.Vbus/(cfg.tr*1e-9),didt:cfg.Ipk/(cfg.tf*1e-9)}))
    .concat([...pwmNets].filter(n=>!ps.switchNets.includes(n)).map(n=>({net:n,kind:'PWM 제어선',dvdt:cfg.Vdig/(cfg.trDig*1e-9),didt:0})));
  const vk=n=>{const c=cat(n);if(c==='아날로그'||/ADC|SENSE|ISNS|MON|VBAT/i.test(n))return['아날로그 (ADC)',cfg.Zana,3.3/4096*4];
    if(c==='통신'||/CAN|SPI|FLASH|SCL|SDA|TX|RX|USB|MISO|MOSI|SCLK|SCK/i.test(n))return['통신',cfg.Zcom,0.2];
    if(c==='디지털 입력'||/HALL|FAULT|ENC|SENS/i.test(n))return['디지털 입력',cfg.Zdig,0.3*cfg.Vdig];return null;};
  const vict=nets.filter(n=>!aggr.some(a=>a.net===n)&&B.netClass(n)==='신호').map(n=>{const k=vk(n);return k?{net:n,kind:k[0],Z:k[1],thr:k[2]}:null;}).filter(Boolean);
  const xt=crosstalk(B,aggr,vict,env);
  const sig=nets.filter(n=>B.netClass(n)==='신호');
  const slots=returnPath(B,sig,env);const loops=loopAreas(B,sig,env);
  const hs=ps.switchNets.length?heatsinkC(B,ps.switchNets,cfg,env):null;if(hs){hs.Icm=hs.C*(ps.Vbus/(cfg.tr*1e-9));}
  const dc=decaps(B,env);
  const filt=B.comps.filter(c=>/^(L|FB|LF|CMC)\d/.test(c.ref));
  const R={cfg,env,ps,xt,slots,loops,hs,dc,filt,aggr,vict};
  const fr=[];for(let k=0;k<=120;k++)fr.push(150e3*Math.pow(1e9/150e3,k/120));R.freqs=fr;R.spec=spectra(R,cfg,fr);
  R.checks=checks(R);
  return R;
}
// summary checkpoints with severity
function checks(R){
  const c=[];const ps=R.ps,cfg=R.cfg;const add=(area,item,sev,val,msg,fix)=>c.push({area,item,sev,val,msg,fix});
  if(ps.drivers.length){
    if(!ps.loops.length)add('1. 파워 스테이지','L_loop','err','DC-Link 캡 없음',`${ps.vmNet}–GND 사이 커패시터가 없어 커뮤테이션 루프가 보드 밖 전원까지 커집니다.`,'VM 핀 옆에 0.1 µF MLCC와 벌크 캡을 배치');
    else{const L=ps.Lbest;add('1. 파워 스테이지','L_loop',L<5?'ok':L<15?'warn':'err',`${L.toFixed(1)} nH (${ps.loops[0].cap}, ${ps.loops[0].lf.toFixed(1)} mm)`,`가장 가까운 DC-Link 캡 ${ps.loops[0].cap} ${ps.loops[0].val}까지 루프 인덕턴스.`,L<5?'':'VM·PGND 핀에 0402/0603 MLCC를 1–2 mm 이내로 붙이고 GND 비아를 패드 바로 옆에');}
    const m=ps.Vabs-ps.Vpk;add('1. 파워 스테이지','턴오프 스파이크',m>ps.Vabs*0.2?'ok':m>0?'warn':'err',`${ps.Vpk.toFixed(1)} V / 절대 최대 ${ps.Vabs} V`,`ΔV = L·dI/dt = ${ps.dV.toFixed(1)} V, 역회복 ${ps.dVrr.toFixed(1)} V (Irr ${ps.Irr.toFixed(2)} A).`,'L_loop 축소, 스위칭 속도(Rg) 완화, 스너버');
    const f=ps.fring;add('1. 파워 스테이지','링잉 주파수',f>=30e6&&f<=200e6?'warn':'ok',`${(f/1e6).toFixed(0)} MHz`,`L_loop와 C_oss ${cfg.Coss} pF의 공진. 30–200 MHz면 방사 방출(RE) 대역과 겹칩니다.`,'RC 스너버, 페라이트 비드, 루프 축소');
  }else add('1. 파워 스테이지','파워 스테이지','info','없음','VM/OUT 핀을 가진 드라이버나 하프브리지를 찾지 못했습니다.','');
  R.ps.gates.forEach(g=>{add('2. 게이트 구동',`${g.ref} L_gate / L_CSI`,g.Lcsi<2?'ok':g.Lcsi<5?'warn':'err',`${g.Lg.toFixed(1)} / ${g.Lcsi.toFixed(1)} nH`,`게이트 루프 ${g.len.toFixed(1)} mm${g.via?' (직렬 '+g.via+')':''}, 소스 경로 ${g.shunt?'션트 '+g.shunt+' 공유':'GND 직결'} → 그라운드 바운스 ${g.bounce.toFixed(2)} V, 게이트 공진 ${(g.fg/1e6).toFixed(0)} MHz.`,g.shunt?'켈빈 소스 연결(게이트 리턴을 션트 앞에서 분리)':'게이트 루프 면적 축소');});
  const worst=R.xt[0];if(worst)add('2. 크로스토크',`${worst.aggr} → ${worst.vict}`,worst.ratio<0.5?'ok':worst.ratio<1?'warn':'err',`${(worst.V*1e3).toFixed(1)} mV (허용 ${(worst.thr*1e3).toFixed(1)} mV)`,`평행 ${worst.len.toFixed(1)} mm, 간격 ${worst.d.toFixed(2)} mm · C_m ${(worst.Cm*1e15).toFixed(0)} fF · L_m ${(worst.Lm*1e9).toFixed(2)} nH.`,'간격 3W 이상, 사이에 GND 가드, 다른 층으로 분리');
  else add('2. 크로스토크','고 dV/dt ↔ 민감 신호','ok','평행 구간 없음','스위칭 노드·PWM 선과 5 mm 이내로 나란한 민감 신호가 없습니다.','');
  const small=R.dc.filter(d=>d.C<=1e-6),bad=small.filter(d=>!d.vias||d.L>3),hi=small.slice().sort((a,b)=>b.srf-a.srf)[0];
  add('3. 수동 소자 기생','디커플링 ESL/SRF',!small.length||bad.length?'warn':'ok',hi?`최고 SRF ${(hi.srf/1e6).toFixed(0)} MHz (${hi.ref} ${hi.val}, ${hi.L.toFixed(1)} nH)`:'소용량 캡 없음',small.length?`소용량(≤1 µF) 캡 ${small.length}개${bad.length?` 중 ${bad.length}개(${bad.slice(0,4).map(d=>d.ref).join(', ')})는 실장 인덕턴스가 커서(GND 비아 2.5 mm 밖 또는 ESL+실장 > 3 nH)`:'는 실장 인덕턴스가 작지만'} SRF 위 대역에서는 인덕터로 동작합니다.`:'모든 캡이 대용량이라 수십 MHz 이상에서는 ESL만 남습니다.','0402 패키지, GND 비아를 패드 옆에 2개, 값이 다른 캡 병렬');
  if(ps.vmNet){const hf=R.dc.filter(d=>d.net===ps.vmNet&&d.C<=1e-6);add('3. 수동 소자 기생',`${ps.vmNet} 고주파 바이패스`,hf.length?'ok':'warn',hf.length?hf.map(d=>`${d.ref} ${d.val}`).join(', '):'벌크 캡만 있음',hf.length?'VM 핀 고주파 바이패스 MLCC가 있습니다.':`VM(${ps.vmNet})–GND에 ≤1 µF MLCC가 없어 SRF가 낮은 벌크 캡만으로는 30 MHz 이상 링잉 전류를 받아 줄 수 없습니다.`,hf.length?'':'VM 핀마다 0.1 µF 0402 MLCC를 1 mm 이내에 추가');}
  add('3. 수동 소자 기생','EMI 필터',R.filt.length?'ok':R.ps.drivers.length?'warn':'info',R.filt.length?R.filt.map(c=>c.ref).join(', '):'없음',R.filt.length?'필터 소자의 기생 병렬 C_p는 데이터시트 SRF로 확인하세요.':'전원 입력에 CM 초크·π 필터가 없어 전도 방출(CE)이 하네스로 그대로 나갑니다.','입력단 CM 초크 + X/Y 커패시터');
  if(R.hs){const C=R.hs.C*1e12;add('4. 시스템 결합','C_p,heatsink',C<10?'ok':C<50?'warn':'err',`${C.toFixed(1)} pF → I_cm ${(R.hs.Icm*1e3).toFixed(1)} mA`,`스위칭 노드 동박 ${(R.hs.aT+R.hs.aB).toFixed(0)} mm²와 방열판 사이 결합 (I_cm = C_p·dV/dt).`,'스위칭 노드 동박 면적 축소, 방열판 아래 동박 제거, Y-캡으로 샤시 리턴');}
  const sl=R.slots;add('4. 시스템 결합','리턴 경로',sl.length?(sl.length>5?'err':'warn'):'ok',`슬롯 교차 ${sl.length}곳`,sl.length?`신호선이 GND 기준면을 끊는 반대층 트랙 위를 지나 리턴 전류가 우회합니다 (${[...new Set(sl.map(s=>s.net))].slice(0,4).join(', ')}).`:'신호선 아래 기준면이 끊기지 않았습니다.','반대층 트랙을 짧게 하거나 스티칭 커패시터·비아로 연결');
  const big=R.loops[0];if(big)add('4. 시스템 결합','최대 신호 루프 면적',big.area<50?'ok':big.area<150?'warn':'err',`${big.area.toFixed(0)} mm² (${big.net})`,`길이 ${big.len.toFixed(1)} mm × 기준면까지 ${big.plane?R.env.t+' mm':'기준면 없음(5 mm 가정)'}. 방사 전계는 면적과 f²에 비례합니다.`,'트랙 단축, 기준면 바로 위로 배선');
  add('4. 시스템 결합','하네스',cfg.shield?'ok':'warn',`${cfg.harness} m · ${cfg.shield?'실드':'비실드'}`,'모터 3상 케이블이 가장 효율적인 방사 안테나입니다.',cfg.shield?'':'실드 케이블 + 360° 실드 접지');
  return c;
}
return{analyze,DEF,trap,coupling,Lvia,findDrivers,decaps,spectra};
})();
if(typeof module!=='undefined')module.exports=EMC;
