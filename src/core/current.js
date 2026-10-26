/* ---------- net current estimate → IPC-2221 track width ----------
   Which net carries how much current is read off the board: rails by name/voltage, the parts on them (regulators,
   drivers, MCU, transceivers, LEDs …) by part number or description, motor phases by name. Widths follow IPC-2221
   (external / internal layers, copper weight, allowed temperature rise). Rough early-design numbers: a load table,
   not a simulation. */
const CURRENT=(function(){
"use strict";
/* ---- IPC-2221: I = k · ΔT^0.44 · A^0.725, A in mil², k = 0.048 outer / 0.024 inner ---- */
function ipcWidth(I,o){o=o||{};const k=o.inner?0.024:0.048,dT=o.dT||10,oz=o.oz||1;if(!(I>0))return 0;
  const A=Math.pow(I/(k*Math.pow(dT,0.44)),1/0.725);const wMil=A/(1.378*oz);return +(wMil*0.0254).toFixed(2);}
function ipcCurrent(w,o){o=o||{};const k=o.inner?0.024:0.048,dT=o.dT||10,oz=o.oz||1;const A=(w/0.0254)*1.378*oz;return +(k*Math.pow(dT,0.44)*Math.pow(A,0.725)).toFixed(2);}
function ipcRise(w,I,o){o=o||{};const k=o.inner?0.024:0.048,oz=o.oz||1;if(!(w>0)||!(I>0))return 0;const A=(w/0.0254)*1.378*oz;return +Math.pow(I/(k*Math.pow(A,0.725)),1/0.44).toFixed(1);}
/* ---- peak current for a few seconds (start · stall · overload) ----
   Temperature rise of a conductor (total width w mm, outer copper oz) carrying Ipk for t seconds: copper heats with almost no
   time to shed it, so the rise is set by heat capacity, not by the IPC steady-state chart. Joule heat I²ρ/A per length goes into
   the copper plus the FR-4 under it to the effective thermal depth √(π·α·t)/2 (α 1.5×10⁻⁷ m²/s, at most half the board):
   ΔT = I² ρ t / (A · (A ρc_Cu + w δ ρc_FR4)). Conservative — lateral spreading and convection are ignored. */
function peakRise(w,Ipk,t,o){o=o||{};if(!(w>0)||!(Ipk>0)||!(t>0))return 0;const oz=o.oz||1,tb=(o.tb||1.6)*1e-3;const W=w*1e-3,A=W*35e-6*oz;
  const d=Math.min(0.886*Math.sqrt(1.5e-7*t),tb/2);/* effective depth of a semi-infinite solid under constant flux: √(π·α·t)/2 */const C=A*3.45e6+W*d*2.0e6;return +(Ipk*Ipk*1.72e-8*t/(A*C)).toFixed(1);}
/* width for a continuous current I (IPC rise ≤ dT) that also keeps continuous rise + peak rise ≤ dTpk while Ipk flows for t s */
function needWidth(I,pk,o){o=o||{};const oz=o.oz||1,dT=o.dT||10,dTpk=o.dTpk||40;const w0=ipcWidth(I,{oz,dT});
  if(!pk||!(pk.I>I))return{w:w0,by:'cont',rise:I>0?ipcRise(w0,I,{oz}):0,riseP:0};
  const tot=w=>(I>0?ipcRise(w,I,{oz}):0)+peakRise(w,pk.I,pk.t,{oz,tb:o.tb});
  let lo=Math.max(0.05,w0),hi=Math.max(lo,ipcWidth(pk.I,{oz,dT:Math.min(dT,dTpk)}))*1.5;if(tot(lo)<=dTpk)return{w:lo,by:'cont',rise:ipcRise(lo,I,{oz}),riseP:peakRise(lo,pk.I,pk.t,{oz,tb:o.tb})};
  for(let k=0;k<40;k++){const m=(lo+hi)/2;if(tot(m)<=dTpk)hi=m;else lo=m;}const w=+hi.toFixed(2);return{w,by:'peak',rise:I>0?ipcRise(w,I,{oz}):0,riseP:peakRise(w,pk.I,pk.t,{oz,tb:o.tb})};}
/* ---- vias carrying power current ----
   A plated via is a copper tube: width π·drill, thickness = plating (25 µm ≈ 0.71 oz). Its rise follows the same rules as a track
   (IPC-2221 outer chart — what common via calculators use) plus the peak rise for the peak current over its duration.
   viaCheck: for each power net and each power terminal on it (connector · FET · shunt · fuse · diode), the vias of that net within
   r mm of the terminal's pads share the terminal current (through-hole pads count as one barrel each). A terminal with no via on
   a multilayer board pushes all its current through one layer — reported, since the plane / bottom copper can't help it. */
/* continuous: the IPC-2221 track chart on the barrel (width π·drill, plating thickness) — what via calculators use, conservative.
   peak: a barrel is only the board thickness long and both ends sit in copper (pad · fill · plane): its own heat leaves through the
   ends within milliseconds (τ ≈ (L/2)²/α_Cu ≈ 6 ms), so for a peak of seconds it is a rod cooled at both ends —
   ΔT = I²·ρ·L² / (8·k·A²) on top of the continuous rise. */
function viaRise(drill,Iv,pk,o){o=o||{};const plat=(o.plat||25),w=Math.PI*drill,oz=plat/35,L=(o.tb||1.6)*1e-3,A=Math.PI*drill*1e-3*plat*1e-6;
  const rod=I=>+(I*I*1.72e-8*L*L/(8*390*A*A)).toFixed(1);return{rise:ipcRise(w,Iv,{oz}),riseP:pk&&pk.I>0?rod(pk.I):0};}
function viaCheck(B,o){o=o||{};const r=o.r!=null?o.r:2.5,dT=o.dT||B.dT||10,dTpk=o.dTpk||B.dTpk||40,plat=o.plat||25,tb=B.t||1.6;const out=[];
  const inRect=(v,p)=>{const a=-(p.ang||0)*Math.PI/180,dx=v.x-p.x,dy=v.y-p.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);const ex=Math.max(0,Math.abs(lx)-p.w/2),ey=Math.max(0,Math.abs(ly)-p.h/2);return Math.hypot(ex,ey)<=r;};
  // the parts the power current actually passes: bridge / reverse FETs and shunts (load kind from the circuit), power terminals, fuses;
  // without circuit tags: FETs, milliohm shunts and big-pad connectors
  const tagged=B.comps.some(c=>c.lk);const isTerm=c=>/^J\d/i.test(c.ref)&&(/전원 입력|모터|power|motor|battery|배터리/i.test(c.desc||'')||c.pads.some(p=>p.drill>=1.3));
  const power=c=>tagged?(!!c.lk||isTerm(c)||/^F\d/i.test(c.ref)):(/^Q\d/i.test(c.ref)||(/^R\d/i.test(c.ref)&&/[mµu]Ω|mohm/i.test(c.val||''))||isTerm(c)||/^F\d/i.test(c.ref));
  (o.nets||[]).forEach(n=>{const I0=+((o.I||{})[n]||0);if(!(I0>0))return;const sh=o.share&&o.share[n]!=null?+o.share[n]:1;if(!(sh>0))return;const I=I0*sh;const pk0=(o.pk||{})[n]||null;const pk=pk0?{I:pk0.I*sh,t:pk0.t}:null;const vs=(B.vias||[]).filter(v=>v.net===n);
    B.comps.filter(power).forEach(c=>{const ps=c.pads.filter(p=>p.net===n);if(!ps.length)return;
      const th=ps.filter(p=>p.drill);const near=vs.filter(v=>ps.some(p=>inRect(v,p)));const nb=near.length+th.length;
      const dr=near.length?near.reduce((a,v)=>a+(v.drill||0.3),0)/near.length:th.reduce((a,p)=>a+(+p.drill),0)/th.length;
      if(!nb){out.push({net:n,ref:c.ref,n:0,I,ok:false,msg:'비아 없음'});return;}
      // a through-hole terminal carries its current on the soldered lead — the barrel is not the limit
      if(th.length&&/^J\d/i.test(c.ref)){out.push({net:n,ref:c.ref,n:nb,th:th.length,drill:+(th.reduce((a,p)=>a+(+p.drill),0)/th.length).toFixed(2),I,share:sh,Iv:null,Ivpk:null,rise:0,riseP:0,ok:true,lead:true});return;}
      // through-hole barrels are wide: weigh the share by circumference
      const cap=near.reduce((a,v)=>a+(v.drill||0.3),0)+th.reduce((a,p)=>a+(+p.drill),0);const Iv=I*dr/cap,pkv=pk?{I:pk.I*dr/cap,t:pk.t}:null;
      const R=viaRise(dr,Iv,pkv,{plat,tb});const ok=R.rise<=dT&&R.rise+R.riseP<=dTpk;
      out.push({net:n,ref:c.ref,n:nb,th:th.length,drill:+dr.toFixed(2),I,share:sh,Iv:+Iv.toFixed(2),Ivpk:pkv?+pkv.I.toFixed(2):null,rise:R.rise,riseP:R.riseP,ok});});});
  return out;}
/* inner plane carrying a power net: rough cross-section = half the shorter board side (antipads, splits), inner IPC chart */
function planeCheck(B,o){o=o||{};const st=(B.stack||[]).filter(x=>x.net&&x.role!=='sig'&&x.k!=='T'&&x.k!=='B');const dT=o.dT||B.dT||10,dTpk=o.dTpk||B.dTpk||40,ozIn=o.ozIn||1;const w=0.5*Math.min(B.W,B.H);
  const by={};st.forEach(x=>{by[x.net]=(by[x.net]||0)+1;});
  return Object.entries(by).map(([n,k])=>{const I=+((o.I||{})[n]||0);if(!(I>0))return null;const pk=(o.pk||{})[n]||null;const ww=w*k;const rise=ipcRise(ww,I,{oz:ozIn,inner:true}),riseP=pk?peakRise(ww,pk.I,pk.t,{oz:ozIn,tb:B.t}):0;
    return{net:n,layers:k,w:+ww.toFixed(1),I,pk,rise,riseP,ok:rise<=dT&&rise+riseP<=dTpk};}).filter(Boolean);}
/* ---- part load table: [regex on mpn|value|description, amps, role] ---- */
const LOADS=[
  [/DRV8313|DRV8305|DRV8323|DRV8353|DRV8301/i,2.5,'mdrv'],[/A4910|A4911|A4919|TLE9180|L9908|GD3000|DRV8353R/i,20,'gdrv'],[/DRV8870|DRV8871|DRV8876|DRV8251|BTN8982|VNH/i,3.6,'mdrv'],[/DRV8833|DRV8835|TB6612/i,1.2,'mdrv'],
  [/TPS5433|TPS5430|LM2596|MP1584|LMR\d|TPS56|AP6\d/i,3,'buck'],[/TPS62|TLV62|MP2|RT8|AP3|TPS5401/i,1.5,'buck'],[/AMS1117|LD1117|NCP1117|AZ1117|LM1117|TLV1117|LM317|LM1084|LM1085|LT1086|TPS7B8|TPS7B6|TLV755|TLS8\d\d/i,1,'ldo'],[/AP2112|MCP1700|XC6206|ME6211|RT9013|TLV7|AP7\d/i,0.5,'ldo'],[/TLF35584|TPS65381|FS26|L9396|TLE9471|FS45/i,1.2,'pmic'],
  [/TC3\d\d|AURIX|S32K3|SPC58|RH850|TMS570/i,0.4,'mcu'],[/STM32|S32K1|ATSAM|ESP32|RP2040|LPC|nRF52/i,0.15,'mcu'],[/TJA10|TJA14|TLE92|TCAN|MCP254|MCP251|ATA656|SN65HVD/i,0.1,'can'],[/W25Q|MX25|IS25|AT25|GD25/i,0.03,'flash'],
  [/INA240|INA2\d\d|AD8418|NCS21|MAX40056|TLE4972|ACS7|TLI497/i,0.01,'sense'],[/TPS3823|TPS382|MAX809|STM6|TLV803|ADM6/i,0.001,'sup'],[/LED|WS2812|SK6812/i,0.02,'led'],[/CC2420|CC25|nRF24|ESP8266|ATWINC|BG9|SIM8/i,0.3,'rf']];
function partLoad(c){const ref0=String(c.ref||'');if(/^(R|C|CP|L|FB|J|TP|Y|X)\d/i.test(ref0))return null; // passives / connectors: their description may name the IC they serve
  const key=`${c.mpn||''} ${c.val||''} ${c.desc||''}`;for(const[re,I,role]of LOADS){if(re.test(key))return{I,role};}
  const ref=String(c.ref||'');if(/^D/.test(ref)&&/LED/i.test(key))return{I:0.02,role:'led'};if(/^U/.test(ref))return{I:0.05,role:'ic'};if(/^Q/.test(ref))return{I:1,role:'fet'};return null;}
/* ---- rails: voltage read from the net name ---- */
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(String(n||'').replace(/^\//,''));
function railV(n){n=String(n||'').replace(/^\//,'');let m=n.match(/^\+?(\d+)V(\d)?$/i);if(m)return+m[1]+(m[2]?+m[2]/10:0);m=n.match(/^\+?(\d+(?:\.\d+)?)\s*V$/i);if(m)return+m[1];m=n.match(/(?:VCC|VDD|V)_?(\d+)V(\d)/i);if(m)return+m[1]+(+m[2])/10;m=n.match(/(?:VCC|VDD|AVDD|DVDD|VIO|V)[_-]?(\d+(?:\.\d+)?)V?$/i);if(m&&+m[1]<60)return+m[1];
  if(/VIN|VBAT|VBUS_IN|VIN_RAW|KL30|VBB|VSUP/i.test(n))return 12;if(/^VBUS$|^USB_?5V|^VUSB/i.test(n))return 5;if(/VCC_DRV|VM\b|VMOT|VDRV|PVDD/i.test(n))return 12;if(/VCC_MCU|VDDA|3V3|VCC3/i.test(n))return 3.3;if(/VCC_5V|VCC_SENS|VCC5|5V/i.test(n))return 5;if(/VCC|VDD/i.test(n))return 3.3;return null;}
const isRail=n=>!isGnd(n)&&!/USB_?D|_D[PM]$|D[+-]$|DATA|_TX|_RX|CAN[HL]|SDA|SCL|SW$|_FB|_EN|_SS|_COMP|BOOT|_RC$|_CP[LH]|VCP|VMON|SENSE|_CS/i.test(String(n||''))&&railV(n)!=null;
const isPhase=n=>/^(PH_?[UVWABC]|PHASE_?[UVWABC]|MOTOR_?[UVWABC1-4]?|OUT_?[UVWABC1-4]|M[1-4][+-]?|OUT[1-4][+-]?|SH[ABC]|HB\d*_?[AB]|PH\d+_?[UVW])$/i.test(String(n||'').replace(/^\//,''));
/* ---- the estimate ---- */
function motorCurrent(B){const p=B.newPlan;let I=null;const txt=String(p&&p.req||'');const m=txt.match(/(\d+(?:\.\d+)?)\s*A\b/i);if(m&&+m[1]>=1)I=+m[1];
  if(p)for(const b of p.blocks||[]){if(/^(bldc|dcmotor|hbridge|gdrv3)$/.test(b.type)&&b.params&&+b.params.i>0)I=+b.params.i;}return I;}
function netCurrents(B,opt){opt=opt||{};const out={};const rails={};const Im=motorCurrent(B);
  const nets=Object.keys(B.nets||{});nets.forEach(n=>{out[n]={I:0,cls:isGnd(n)?'gnd':isRail(n)?'rail':isPhase(n)?'phase':'sig',v:railV(n),loads:[]};});
  // parts: what each one draws from which rail, and what its outputs carry
  const parts=B.comps.filter(c=>c.kind!=='none');const regs=[];
  parts.forEach(c=>{const L=partLoad(c);if(!L)return;const netsOf=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];const railsOf=netsOf.filter(isRail).sort((a,b)=>(railV(b)||0)-(railV(a)||0));
    if(L.role==='buck'||L.role==='ldo'||L.role==='pmic'){const vin=railsOf[0],vouts=railsOf.slice(1);regs.push({c,vin,vouts,I:L.I,role:L.role});return;}
    if(L.role==='mdrv'||L.role==='gdrv'){const I=Im!=null?Im:L.I;const sup=railsOf[0];const ph=netsOf.filter(isPhase);ph.forEach(n=>{out[n].I=Math.max(out[n].I,I);out[n].loads.push(`${c.ref} 상전류`);});
      if(sup){const avg=I*0.7;out[sup].I+=avg;out[sup].loads.push(`${c.ref} 모터 전원 ${avg.toFixed(1)} A`);}railsOf.slice(1).forEach(n=>{out[n].I+=0.03;});return;}
    if(L.role==='fet'){const I=Im!=null?Im:L.I;netsOf.filter(isPhase).forEach(n=>{out[n].I=Math.max(out[n].I,I);});return;}
    const sup=railsOf[0];if(sup){out[sup].I+=L.I;out[sup].loads.push(`${c.ref} ${L.I} A`);}
    if(L.role==='led'){netsOf.filter(n=>!isRail(n)&&!isGnd(n)).forEach(n=>{out[n].I=Math.max(out[n].I,L.I);});}});
  // regulators: output rail current flows in, scaled by voltage ratio (buck) or 1:1 (LDO); walk from the lowest rail up
  const byV=regs.slice().sort((a,b)=>(railV(a.vin)||0)-(railV(b.vin)||0));
  byV.forEach(r=>{const Iout=r.vouts.reduce((a,n)=>a+out[n].I,0);if(!r.vin||!Iout)return;const vo=r.vouts.length?railV(r.vouts[0])||3.3:3.3,vi=railV(r.vin)||12;
    const Iin=r.role==='buck'?Iout*vo/vi/0.9+0.01:Iout+0.005;out[r.vin].I+=Iin;out[r.vin].loads.push(`${r.c.ref} ${r.role==='buck'?'벅':'LDO'} 입력 ${Iin.toFixed(2)} A (출력 ${Iout.toFixed(2)} A)`);});
  // currents the circuit generator recorded (motor stage: VM, phases, shunt nodes) are a floor for the estimate
  if(B.netCurrent)Object.entries(B.netCurrent).forEach(([n,I])=>{if(out[n]&&+I>out[n].I){out[n].I=+I;out[n].loads.push(`회로 생성 기록 ${I} A`);}});
  // input protection nets (VIN_RAW → +12V through a diode/FET): same current as the first rail they feed
  nets.filter(n=>/VIN_RAW|KL30|VIN$/i.test(n)).forEach(n=>{if(out[n].I>0)return;const first=parts.filter(c=>c.pads.some(p=>p.net===n)).flatMap(c=>[...new Set(c.pads.map(p=>p.net))]).filter(x=>x!==n&&isRail(x));const I=Math.max(0,...first.map(x=>out[x].I));if(I){out[n].I=I;out[n].loads.push(`입력 보호단 → ${first[0]} ${I.toFixed(2)} A`);}});
  // a "signal" net that carries ampere-level current (shunt nodes, low-side sources) is treated like a motor phase
  nets.forEach(n=>{const o=out[n];if(o.cls==='sig'&&o.I>=1)o.cls='phase';});
  // ground returns the largest supply / phase current (motor current comes back through the shunts)
  nets.forEach(n=>{const o=out[n];if(o.cls==='sig'&&!o.I)o.I=0.02;if(o.cls==='gnd'){o.I=Math.max(...Object.values(out).filter(x=>x.cls==='rail'||x.cls==='phase').map(x=>x.I),0);o.loads=['플레인/동박면 귀환 (모터 전류 포함)'];}});
  return out;}
/* ---- widths per net, with the user's overrides (B.netWidth: net → mm, B.netCurrent: net → A) ---- */
function widths(B,opt){opt=opt||{};const oz=opt.oz||B.oz||1,dT=opt.dT||10,cap=opt.cap||3;const cur=netCurrents(B,opt);const out={};const dTpk=opt.dTpk||B.dTpk||40;
  Object.keys(cur).forEach(n=>{const c=cur[n];const I=B.netCurrent&&B.netCurrent[n]!=null?+B.netCurrent[n]:c.I;const pk=B.netPeak&&B.netPeak[n]||null;const nw=needWidth(I,pk,{oz,dT,dTpk,tb:B.t});const ipc=nw.w;
    let w=B.netWidth&&B.netWidth[n]!=null?+B.netWidth[n]:ipc;const min=c.cls==='rail'||c.cls==='phase'?0.3:0.2;w=Math.max(min,w);
    out[n]={I:+I.toFixed(3),pk,by:nw.by,riseP:nw.riseP,cls:c.cls,v:c.v,ipc,w:+Math.min(cap,w).toFixed(2),pour:ipc>cap,loads:c.loads,manual:!!(B.netWidth&&B.netWidth[n]!=null),manualI:!!(B.netCurrent&&B.netCurrent[n]!=null)};});
  return out;}
/* ---- check: routed tracks narrower than the current needs ---- */
function check(B,opt){opt=opt||{};const W=widths(B,opt);const out=[];const keys=(typeof PCB!=='undefined'?PCB.cuKeys(B):['T','B']);
  Object.keys(W).forEach(n=>{const w=W[n];if(w.cls!=='rail'&&w.cls!=='phase'||w.I<0.5)return;let minW=null;keys.forEach(k=>(B.layers[k+'.cu']||[]).forEach(p=>{if(p.net!==n||!(p.t==='seg'||p.t==='path'))return;if(minW==null||p.w<minW)minW=p.w;}));
    if(minW==null)return;const need=w.ipc;if(minW<need*0.85){const oz=opt.oz||1;const rise=ipcRise(minW,w.I,{oz});const rp=w.pk?peakRise(minW,w.pk.I,w.pk.t,{oz,tb:B.t}):0;out.push({net:n,I:w.I,w:minW,need,rise,riseP:rp,msg:`${n}: 트랙 ${minW} mm 에 ${w.I} A → 온도 상승 약 ${rise} °C${w.pk?` · 피크 ${w.pk.I} A ${w.pk.t} s 동안 +${rp} °C`:''} (권장 ${need} mm${w.by==='peak'?' — 피크 기준':''}${w.pour?' → 동박면 권장':''})`});}});
  return out;}
function text(B,opt){const W=widths(B,opt);const rows=Object.entries(W).filter(([n,w])=>w.cls!=='sig').sort((a,b)=>b[1].I-a[1].I);
  const L=[`넷 전류 · 폭 (IPC-2221 상시, ${opt&&opt.oz||B.oz||1} oz, ΔT ${opt&&opt.dT||B.dT||10} °C · 피크는 ${B.dTpk||40} °C 이내) — 추정값`];
  rows.forEach(([n,w])=>L.push(`  ${n.padEnd(12)} ${w.cls==='gnd'?'접지':w.cls==='phase'?'모터상':'전원'}${w.v!=null?' '+w.v+' V':''}  ${w.I.toFixed(2)} A${w.pk?` (피크 ${w.pk.I} A ${w.pk.t} s → +${w.riseP} °C)`:''} → 권장 ${w.ipc} mm${w.by==='peak'?' [피크 기준]':''}${w.pour?' (동박면)':''}${w.manual?` · 지정 ${w.w} mm`:''}${w.manualI?' · 전류 지정':''}${w.loads.length?'  ← '+w.loads.slice(0,3).join(', '):''}`));
  const sig=Object.values(W).filter(w=>w.cls==='sig').length;L.push(`  신호 넷 ${sig}개: 0.02 A → 0.2 mm`);return L.join('\n');}
return{viaRise,viaCheck,planeCheck,ipcWidth,ipcCurrent,ipcRise,peakRise,needWidth,partLoad,railV,isRail,isPhase,netCurrents,widths,check,text,LOADS};
})();
if(typeof module!=='undefined')module.exports=CURRENT;
