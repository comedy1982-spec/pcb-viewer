/* ---------- HW diagnostic thresholds from part tolerances (worst-case EVA + RSS) ----------
   For each safety mechanism that compares a measured quantity with a threshold, the measurement chain is built from the parts
   the circuit actually has (divider resistors, NTC + pull-up, shunt + sense amplifier, ADC and its reference, comparators,
   supervisor, enable divider …) with their tolerances: initial tolerance, temperature coefficient over the temperature range,
   ADC total unadjusted error, reference tolerance and the comparators' own threshold spread. Two numbers come out of every chain:
     - the normal band: what the measurement can read while the quantity is still inside its normal operating range — a
       threshold inside it trips falsely;
     - the detection band: the true values at which a threshold set at value X actually trips.
   A threshold is recommended outside the normal band by a guard margin, and the detection band shows what is really guaranteed.
   Extreme value analysis (EVA, every parameter at its worst corner) is the result; RSS (√Σ of half-ranges) is shown beside it.
   Specs carry their source: 'DS' read from the datasheet, '가정' assumed — editable in the view. */
const DIAGTHR=(function(){
"use strict";
/* ---- part specs (source noted). A4911: Allegro A4911-1 Datasheet Rev. 11 (attached); NCP18XH103F03RB: Murata (R25 ±1 %, B25/50 3380 ±1 %) ---- */
const SPEC={
  A4911:{src:'DS',csa:{vios:1e-3,dvios:2e-6,ea:1.6,ead:30e-6,evo:0.075,dvoo:135e-6,gains:[10,15,20,25,30,35,40,50],sao:[0,0,0.1,0.1,0.2,0.3,0.4,0.5,0.75,1,1.25,1.5,1.75,2,2.25,2.5],vmax:4.8},
    vds:{step:0.05,max:3.15,hsOff:[0.15,0.3],lsOff:[0.15,0.2]},oct:{step:0.3,rel:[0.8/0.9,1.08/0.9]},vregUV:[5.5,5.7,5.9],vregUV11:[6.9,7.18,7.4],bootUV:[55,66],vbbUV:4.0,tjw:[125,135,145],tjf:[165,175,185]},
  'NCP18XH103F03RB':{src:'DS',r25:10e3,tol:1,B:3380,btol:1},
  'TPS3823':{src:'가정',note:'TI TPS3823-33 전형값 2.93 V · 1.6 s — 최소/최대는 데이터시트 표로 확인',vit:[2.89,2.93,2.97],twd:[1.1,1.6,2.3],td:[0.14,0.2,0.28]},
  'TPS54331':{src:'가정',note:'EN 1.25 V · 풀업 1 µA · 히스테리시스 3 µA는 데이터시트 값, 범위는 가정',ven:[1.2,1.25,1.3],i1:[0.7e-6,1e-6,1.3e-6],ih:[2.5e-6,3e-6,3.5e-6],vstopMin:3.5},
  'AMS1117':{src:'가정',note:'AMS1117-3.3 출력 ±2 % (라인 · 부하 · 온도 포함, 일반값)',tol:2},
  ADC:{src:'가정',note:'TC3xx EVADC 12비트 TUE ±4 LSB (데이터시트 확인)',bits:12,tue:4},
  MCUIO:{src:'가정',note:'CMOS 입력 VIL ≤ 0.3·VDDP · VIH ≥ 0.7·VDDP (패드 데이터시트로 확인)',vil:0.3,vih:0.7,vmin:2.97},
  // RDS(on) at 25 °C, max (datasheet) and typical; temperature factor of an OptiMOS die (normalised curve): −40 °C ≈ 0.75, 150 °C ≈ 1.75
  FET:{src:'가정',note:'RDS(on) 최대값은 부품 표, 온도 계수 −40 °C 0.75 · 150 °C 1.75 (OptiMOS 정규화 곡선 근사)',kCold:0.75,kHot:1.75,
    parts:{'IPD90N04S4-04':{max:3.8e-3,typ:3.1e-3,ipk:360},'IAUC60N04S6N050H':{max:5.0e-3,typ:4.1e-3,ipk:240},'IPG20N04S4L-07':{max:7.2e-3,typ:5.9e-3,ipk:80},'IPD50N06S4L-12':{max:11.7e-3,typ:9.5e-3,ipk:200},'SQD50P04-09L':{max:9e-3,typ:7.5e-3,ipk:150}}}};
const DEF={Tmin:-40,Tmax:125,Tref:25,rTol:1,rTCR:100,shTol:1,shTCR:75,margin:5,vop:[9,16],ntc:[100,120],ntcRange:[-40,150],ilimK:1.5};
/* ---- worst case over corners + RSS ---- */
function eva(ps,f){const n=ps.length;let lo=Infinity,hi=-Infinity;const nom=f(ps.map(p=>p.nom));
  for(let m=0;m<(1<<n);m++){const v=f(ps.map((p,i)=>(m>>i)&1?p.hi:p.lo));if(v<lo)lo=v;if(v>hi)hi=v;}
  let s=0;ps.forEach((p,i)=>{const a=ps.map(q=>q.nom);a[i]=p.hi;const vh=f(a);a[i]=p.lo;const vl=f(a);s+=((vh-vl)/2)**2;});const r=Math.sqrt(s);
  return{nom,lo,hi,rssLo:nom-r,rssHi:nom+r};}
const P=(name,nom,tolAbs,src)=>({name,nom,lo:nom-tolAbs,hi:nom+tolAbs,src:src||''});
const Pr=(name,nom,lo,hi,src)=>({name,nom,lo,hi,src:src||''});
/* resistor tolerance from the part number (Yageo RC…F = 1 %, …J = 5 %) or the description, else the default */
function rTol(c,A){const m=String(c.mpn||'').toUpperCase();if(/^RC\d{4}F/.test(m))return 1;if(/^RC\d{4}J/.test(m))return 5;const d=String(c.desc||'').match(/\((\d+(?:\.\d+)?)\s*%\)/);return d?+d[1]:A.rTol;}
function rVal(v){const m=String(v||'').replace(/Ω|ohm/i,'').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmMµu]?)/);if(!m)return null;const k={k:1e3,K:1e3,M:1e6,m:1e-3,'µ':1e-6,u:1e-6,'':1}[m[2]];return +m[1]*k;}
/* resistor as a corner parameter: initial tolerance + TCR over the temperature range */
function resP(c,A,tcr){const R=rVal(c.val);const t=rTol(c,A)/100,dT=Math.max(A.Tmax-A.Tref,A.Tref-A.Tmin),k=(tcr||A.rTCR)*1e-6*dT;return Pr(`${c.ref} ${c.val} ±${rTol(c,A)} %${tcr!==0?` · ${tcr||A.rTCR} ppm`:''}`,R,R*(1-t-k),R*(1+t+k),rTol(c,A)===A.rTol&&!/^RC\d{4}F/i.test(c.mpn||'')?'가정':'DS');}
const pinOf=(c,n)=>Object.keys(c.pins||{}).find(k=>c.pins[k]===n);
const has=(c,n)=>Object.values(c.pins||{}).includes(n);
/* ---- the calculators ---- */
function compute(parts,o){o=o||{};const A=Object.assign({},DEF,o.assume||{});const out=[];const fs=1<<SPEC.ADC.bits;
  const E24=[1,1.1,1.2,1.3,1.5,1.6,1.8,2,2.2,2.4,2.7,3,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];const e24=v=>{const d=Math.pow(10,Math.floor(Math.log10(v)));return E24.map(e=>e*d).concat([10*d]).reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);};const kLab=v=>v>=1e6?+(v/1e6).toFixed(2)+'MΩ':v>=1e3?+(v/1e3).toFixed(1)+'kΩ':v+'Ω';
  const vref=3.3,vrefT=(parts.some(c=>/AMS1117/i.test(c.val))?SPEC.AMS1117.tol:A.vrefTol||2)/100;const tue=A.tue!=null?+A.tue:SPEC.ADC.tue;const lsb=vref/fs;
  const Iop=+o.I||10,Ipk=+o.Ipk||Iop,tpk=+o.tpk||2,ftti=o.ftti||null;const R=(x,d)=>+(+x).toFixed(d==null?2:d);const code=v=>Math.round(v/vref*fs);
  const row=(r)=>{out.push(Object.assign({ok:true,src:[]},r));};
  // 1 VBAT monitor: divider → ADC (absolute — the ADC reference error counts)
  const rt=parts.find(c=>/^R/.test(c.ref)&&has(c,'VMON')&&!has(c,'GND')),rb=parts.find(c=>/^R/.test(c.ref)&&has(c,'VMON')&&has(c,'GND'));
  if(rt&&rb){const Pt=resP(rt,A),Pb=resP(rb,A);const kN=Pb.nom/(Pt.nom+Pb.nom);
    const meas=V=>{const ps=[Pt,Pb,Pr('VAREF ±'+vrefT*100+' %',vref,vref*(1-vrefT),vref*(1+vrefT),'가정'),P('ADC TUE ±'+tue+' LSB',0,tue*lsb,'가정')];
      return eva(ps,([rt_,rb_,vr,e])=>{const va=V*rb_/(rt_+rb_)+e;return va/vr*vref/kN;});};
    const fsV=vref/kN;const [lo,hi]=A.vop;const eL=meas(lo),eH=meas(hi);
    const uv=(eL.lo)*(1-A.margin/100),ov=(eH.hi)*(1+A.margin/100);
    const dUV=meas(uv),dOV=meas(ov);// true voltage that reads uv: invert with the band — approximate by symmetric error at that point
    const errUV=Math.max(dUV.hi-uv,uv-dUV.lo),errOV=Math.max(dOV.hi-ov,ov-dOV.lo);
    row({mech:'vbat_rng',block:'cur',title:'VBAT 저전압 · 과전압 (분압 → ADC)',chain:[Pt.name,Pb.name,'VAREF +3V3 ±'+vrefT*100+' %','ADC 12비트 TUE ±'+tue+' LSB'],
      normal:`정상 ${lo}–${hi} V에서 읽힘 ${R(eL.lo)}–${R(eH.hi)} V (오차 ±${R(Math.max(eL.hi-lo,lo-eL.lo))} / ±${R(Math.max(eH.hi-hi,hi-eH.lo))} V)`,
      thr:`UV ${R(uv)} V (ADC ${code(uv*kN)}) · OV ${R(ov)} V (ADC ${code(ov*kN)})`,detect:`UV 실제 ${R(uv-errUV)}–${R(uv+errUV)} V에서 판정 · OV 실제 ${R(ov-errOV)}–${R(ov+errOV)} V`,
      margin:`ADC 풀스케일 ${R(fsV,1)} V — OV 임계 대비 ${R(fsV-ov-errOV,1)} V 여유`,ok:ov+errOV<fsV*0.98,
      advice:ov+errOV<fsV*0.98?`로드덤프(최대 수십 V)는 ADC 범위를 넘으므로 포화 = 과전압으로 처리. 입력 주입 전류 (40 V−3.3)/${rVal(rt.val)/1e3} kΩ = ${R((40-3.3)/rVal(rt.val)*1e3,2)} mA`:(()=>{const fsT=(ov+errOV)*1.25;const rbN=e24(rVal(rt.val)/(fsT/vref-1));return`과전압 판정이 ADC 풀스케일 ${R(fsV,1)} V에 닿음 — 하단 저항 ${rb.val} → ${kLab(rbN)} (풀스케일 약 ${R(vref*(rVal(rt.val)+rbN)/rbN,1)} V)로 바꾸면 OV 판정이 범위 안`;})(),
      rss:`RSS 오차 ±${R((eL.rssHi-eL.rssLo)/2)} V @ ${lo} V`,src:[Pt.src,Pb.src,'가정']});}
  // 2 NTC board temperature: ratiometric to +3V3 (VAREF = +3V3 → reference cancels), Beta model
  const ntc=parts.find(c=>/^RT/.test(c.ref)&&/NTC/i.test(c.val+c.desc));
  if(ntc){const net=Object.values(ntc.pins).find(n=>n&&n!=='GND');const pu=parts.find(c=>/^R\d/.test(c.ref)&&has(c,net)&&!has(c,'GND'));
    const sp=SPEC[ntc.mpn]||{src:'가정',r25:10e3,tol:1,B:3380,btol:1};const Ppu=pu?resP(pu,A):Pr('풀업 10 kΩ',10e3,9.9e3,10.1e3,'가정');
    const ps=[Pr(`NTC R25 ±${sp.tol} %`,sp.r25,sp.r25*(1-sp.tol/100),sp.r25*(1+sp.tol/100),sp.src),Pr(`B ${sp.B} ±${sp.btol} %`,sp.B,sp.B*(1-sp.btol/100),sp.B*(1+sp.btol/100),sp.src),Ppu,P('ADC TUE',0,tue,'가정')];
    const Rn=(T,r25,B)=>r25*Math.exp(B*(1/(T+273.15)-1/298.15));const cd=(T,a)=>{const r=Rn(T,a[0],a[1]);return r/(a[2]+r)*fs+a[3];};
    const Tof=c=>{let lo=-60,hi=200;for(let k=0;k<50;k++){const m=(lo+hi)/2;if(cd(m,[sp.r25,sp.B,Ppu.nom,0])>c)lo=m;else hi=m;}return(lo+hi)/2;};// nominal code→°C as the firmware will
    const band=T=>eva(ps,a=>Tof(cd(T,a)));
    const ths=A.ntc.map(T=>{const b=band(T);const err=Math.max(b.hi-T,T-b.lo);return{T,err,set:T-err,code:Math.round(cd(T-err,[sp.r25,sp.B,Ppu.nom,0])),rss:(b.rssHi-b.rssLo)/2};});
    const cold=eva(ps,a=>cd(A.ntcRange[0],a)),hot=eva(ps,a=>cd(A.ntcRange[1],a));const openThr=Math.round((cold.hi+(fs-1))/2),shortThr=Math.round(hot.lo/2);
    row({mech:'ntc_derate',block:'temp',title:'보드 과열 디레이팅 · 정지 (NTC → ADC)',chain:[`${ntc.ref} ${ntc.mpn||ntc.val} R25 ±${sp.tol} % · B ${sp.B} ±${sp.btol} %`,Ppu.name,'VAREF = 풀업 전원 (비율 측정 — 기준 전압 오차 상쇄)','ADC TUE ±'+tue+' LSB'],
      normal:ths.map(t=>`${t.T} °C 읽음 오차 ±${R(t.err,1)} °C`).join(' · '),thr:ths.map((t,i)=>`${i?'정지':'디레이팅'} 설정 ${R(t.set,1)} °C (ADC ≤ ${t.code})`).join(' · '),
      detect:ths.map(t=>`실제 ${R(t.set-t.err,1)}–${R(t.T,1)} °C에서 판정 (한계 ${t.T} °C 넘기 전)`).join(' · '),margin:`RSS ±${ths.map(t=>R(t.rss,1)).join(' / ')} °C`,ok:true,
      advice:'설정 = 목표 한계 − 최악 오차 → 최악 조합에서도 한계 전에 동작. 보드 온도와 FET 접합 온도 차(정상 해석)를 목표 한계에 반영하세요',src:[sp.src,Ppu.src,'가정']});
    row({mech:'ntc_range',block:'temp',title:'NTC 단선 · 단락 (ADC 범위)',chain:[`정상 ${A.ntcRange[0]}…${A.ntcRange[1]} °C 의 ADC 범위(최악)`],
      normal:`ADC ${Math.round(hot.lo)}–${Math.round(cold.hi)} (${A.ntcRange[1]} °C 최소 · ${A.ntcRange[0]} °C 최대)`,thr:`단선 ADC > ${openThr} · 단락 ADC < ${shortThr}`,
      detect:'단선 → 풀업으로 4095 근처 · 단락 → 0 근처',margin:`단선 여유 ${openThr-Math.round(cold.hi)} LSB · 단락 여유 ${Math.round(hot.lo)-shortThr} LSB`,ok:openThr-cold.hi>20&&hot.lo-shortThr>20,advice:'임계는 정상 끝과 레일의 가운데. 여유가 20 LSB 미만이면 풀업 값을 조정',src:[sp.src]});}
  // 3 phase current: shunt → A4911 sense amp → ADC (zero-current calibration in PWM off removes the initial offsets; drift remains)
  const shunts=parts.filter(c=>/^R/.test(c.ref)&&/션트/.test(c.desc||'')&&/m[ΩO]|µΩ/.test(c.val));const drv=parts.find(c=>/A491[18]/.test(c.val));
  if(shunts.length&&drv){const S=SPEC.A4911.csa;const Rs=rVal(shunts[0].val);const Av=o.gain||20;const voos=o.voos!=null?o.voos:1.5;const dT=Math.max(A.Tmax-A.Tref,A.Tref-A.Tmin);
    const ps=[Pr(`${shunts[0].ref} ${shunts[0].val} ±${A.shTol} % · ${A.shTCR} ppm`,Rs,Rs*(1-A.shTol/100-A.shTCR*1e-6*dT),Rs*(1+A.shTol/100+A.shTCR*1e-6*dT),'가정'),
      Pr(`게인 ${Av} 오차 ±${S.ea} % · 드리프트 ${S.ead*1e6} ppm/°C`,Av,Av*(1-S.ea/100-S.ead*dT),Av*(1+S.ea/100+S.ead*dT),'DS'),P(`입력 오프셋 드리프트 ±${S.dvios*1e6} µV/°C`,0,S.dvios*dT,'DS'),
      P(`출력 오프셋 드리프트 ±${S.dvoo*1e6} µV/°C`,0,S.dvoo*dT,'DS'),Pr('VAREF ±'+vrefT*100+' %',vref,vref*(1-vrefT),vref*(1+vrefT),'가정'),P('ADC TUE ×2 (전류 − 영점 두 번 읽음)',0,2*tue*lsb,'가정')];
    // zero-current calibration: every PWM-off window (cal 'pwm', default) removes VOOS, the initial offsets and their drift and the
    // reference error on VOOS; calibrated only at start-up (cal 'start'), the offset drift over temperature stays
    const drift=o.cal==='start';if(!drift){ps[2]=P('입력 오프셋 (매 주기 영점 보정)',0,0,'DS');ps[3]=P('출력 오프셋 (매 주기 영점 보정)',0,0,'DS');}
    const meas=I=>eva(ps,([rs,av,vi,vo,vr,e])=>{const sig=av*(I*rs+vi)+vo;const rd=sig*vref/vr+e;return rd/(Av*Rs);});
    const eI=I=>{const b=meas(I);return Math.max(b.hi-I,I-b.lo);};const ePk=eI(Ipk);const oc=(Ipk+ePk)*(1+A.margin/100);const eOc=eI(oc);
    const vMax=voos+Av*Rs*oc*1.05,vMin=voos-Av*Rs*oc*1.05;const rangeOk=vMax<vref*0.97&&vMin>0.05;
    row({mech:'cur_range',block:'cur',title:(shunts.length>=3?'상전류':'레그(부하) 전류')+' 측정 · SW 과전류 (션트 → A4911 CSA → ADC)',chain:ps.filter(p=>p.hi!==p.lo).map(p=>p.name).concat([`VOOS ${voos} V (SAO) · ${drift?'기동 때 한 번 영점 보정 — 온도 드리프트 남음':'PWM OFF마다 영점 보정 — 초기 오프셋 ±'+S.vios*1e3+' mV(입력) · ±'+S.evo*1e3+' mV(출력)와 드리프트 제거'}`]),
      normal:`피크 ${Ipk} A 읽음 오차 ±${R(ePk,2)} A · 상시 ${Iop} A ±${R(eI(Iop),2)} A`,thr:`SW 과전류 ${R(oc,1)} A (|CSxO − OOS| ≥ ${R(oc*Av*Rs,3)} V)`,detect:`실제 ${R(oc-eOc,1)}–${R(oc+eOc,1)} A에서 판정`,
      margin:`CSA 출력 ${R(vMin,2)}–${R(vMax,2)} V (ADC 0–${vref} V ${rangeOk?'안':'밖!'}) · 해상도 ${R(lsb/(Av*Rs)*1000,0)} mA/LSB`,ok:rangeOk,
      advice:rangeOk?'영점 보정 없이 쓰면 초기 오프셋 ±1 mV(입력) · ±75 mV(출력)가 그대로 남아 오차가 크게 늘어남 — PWM OFF 구간 보정 필수':'게인(SAG) 또는 오프셋(SAO)을 바꿔 피크가 ADC 안에 들어오게',src:['가정','DS','DS','DS','가정','가정']});
    // sum of the three phases: one at +Ipk, two at −Ipk/2 — every channel error adds
    const sumE=ePk+2*eI(Ipk/2),sumThr=sumE*(1+A.margin/100);
    if(shunts.length>=3)row({mech:'cur_sum',block:'cur',title:'3상 합 Σi ≈ 0 교차 비교',chain:['채널 3개 오차의 최악 합 (한 상 +Ipk, 두 상 −Ipk/2)'],normal:`정상일 때 |Σi| 최대 ${R(sumE,2)} A`,thr:`|Σi| > ${R(sumThr,2)} A 가 N회 연속`,detect:`채널 하나가 ${R(sumThr+sumE,2)} A 이상 틀리면 반드시 검출`,
      margin:`피크 대비 ${R(sumThr/Ipk*100,1)} %`,ok:sumThr<Ipk*0.25,advice:'검출 한계(=임계+정상 오차)보다 작은 센서 오차는 이 비교로 못 잡음 — 범위 검사 · 이종 비교와 함께',src:['DS','가정']});
    // A4911 overcurrent comparator: IOCT = VOCT / (Rs · Av), VOCT = (n+1) · 0.3 V
    const O=SPEC.A4911.oct;let n=0,best=null;for(;n<16;n++){const v=(n+1)*O.step;const iMin=v*O.rel[0]/(Rs*(1+A.shTol/100+A.shTCR*1e-6*dT)*Av*(1+S.ea/100));const iMax=v*O.rel[1]/(Rs*(1-A.shTol/100-A.shTCR*1e-6*dT)*Av*(1-S.ea/100));if(iMin>Ipk*(1+A.margin/100)&&!best)best={n,v,iMin,iMax};}
    const fet=parts.find(c=>/^Q/.test(c.ref)&&SPEC.FET.parts[c.val]&&c.lk!=='batt');const lim=fet?Math.min(SPEC.FET.parts[fet.val].ipk,Ipk*A.ilimK*2):Ipk*A.ilimK*2;
    if(best)row({mech:'cur_ocp',block:'cur',title:'A4911 과전류 비교기 (OCT · 7.5 µs)',chain:[`VOCT = (OCT+1) × 0.3 V, 기본값 오차 0.8–1.08 V(0.9 V) 비율 적용`,`IOCT = VOCT / (Rs · Av)`],normal:`피크 ${Ipk} A에서 동작하면 안 됨`,
      thr:`OCT = ${best.n} (VOCT ${R(best.v,2)} V)`,detect:`실제 ${R(best.iMin,1)}–${R(best.iMax,1)} A에서 차단`,margin:`피크 대비 +${R((best.iMin/Ipk-1)*100,0)} % · 상한 ${R(best.iMax,0)} A vs FET 펄스 ${fet?SPEC.FET.parts[fet.val].ipk:'?'} A`,ok:best.iMax<lim,
      advice:'SAO 오프셋은 VOCT에도 같이 더해져 IOCT에 영향 없음(데이터시트). 범위가 넓으면 SW 과전류가 정밀 판정, OCT는 빠른 보호',src:['DS']});
  }
  // 4 VDS monitor (short circuit): VDS = I · RDS(on); threshold n × 50 mV with the high-side / low-side offset
  const fets=parts.filter(c=>/^Q/.test(c.ref)&&c.lk==='phase'&&SPEC.FET.parts[c.val]);
  if(fets.length&&drv){const F=SPEC.FET.parts[fets[0].val],V=SPEC.A4911.vds;const rHot=F.max*SPEC.FET.kHot,rCold=F.typ*SPEC.FET.kCold;
    const vdsPk=Ipk*rHot;const pick=(off)=>{for(let n=1;n*V.step<=V.max;n++){const v=n*V.step;const of=v<1?off[0]:off[1];if(v-of>=vdsPk*(1+A.margin/100))return{n,v,of};}return null;};
    ['HS','LS'].forEach(side=>{const s=pick(side==='HS'?V.hsOff:V.lsOff);if(!s)return;const iMin=(s.v-s.of)/rHot,iMax=(s.v+s.of)/rCold;
      row({mech:'cur_vds',block:'gate',title:`VDS 단락 감시 — ${side==='HS'?'하이사이드 VTH':'로우사이드 VTL'} (A4911)`,chain:[`${fets[0].val} RDS(on) 최대 ${R(F.max*1e3,1)} mΩ × ${SPEC.FET.kHot} (150 °C) · 전형 ${R(F.typ*1e3,1)} mΩ × ${SPEC.FET.kCold} (−40 °C)`,`임계 오차 ±${s.of*1000} mV (${s.v<1?'< 1 V':'≥ 1 V'})`],
        normal:`피크 ${Ipk} A · 고온에서 VDS 최대 ${R(vdsPk,3)} V`,thr:`${side==='HS'?'VTH':'VTL'} = ${s.n} (${R(s.v,2)} V)`,detect:`실제 ${R(iMin,0)}–${R(iMax,0)} A에서 단락 판정`,margin:`FET 펄스 ${F.ipk} A 대비 상한 ${R(iMax/F.ipk*100,0)} %`,ok:iMax<=F.ipk,
        advice:'RDS(on)가 온도로 2배 넘게 변해 VDS 감시는 정밀 과전류가 아닌 단락 보호 — 과전류 판정은 션트 쪽으로',src:['DS',SPEC.FET.src]});});}
  // 5 MCU supply supervisor
  const sup=parts.find(c=>/TPS3823/.test(c.val));
  if(sup){const S=SPEC.TPS3823;const rail=3.3,rt=(SPEC.AMS1117.tol)/100;const railMin=rail*(1-rt);
    row({mech:'sbc_uv',block:'sbc',title:'MCU 전원 저전압 리셋 (TPS3823-33)',chain:[`VIT− ${S.vit.join(' / ')} V (${S.src})`,`+3V3 LDO ±${SPEC.AMS1117.tol} %`,`MCU 최소 동작 ${SPEC.MCUIO.vmin} V (가정)`],
      normal:`레일 최저 ${R(railMin,3)} V`,thr:`고정 ${S.vit[1]} V`,detect:`실제 ${S.vit[0]}–${S.vit[2]} V에서 리셋`,margin:`오리셋 여유 ${R((railMin-S.vit[2])*1000,0)} mV · MCU 최소까지 ${R((S.vit[0]-SPEC.MCUIO.vmin)*1000,0)} mV`,
      ok:railMin>S.vit[2]&&S.vit[0]>=SPEC.MCUIO.vmin,advice:S.vit[0]<SPEC.MCUIO.vmin?'감시 하한이 MCU 최소 동작 전압보다 낮을 수 있음 — 그 사이 구간은 MCU 내부 저전압 감시(EVR)로 덮거나 임계가 높은 감시 IC 선택':'정상',src:[S.src]});
    const twd=S.twd;row({mech:'sbc_wdt',block:'sbc',title:'외부 워치독 (TPS3823 WDI)',chain:[`tWD ${twd.join(' / ')} s (${S.src})`,`리셋 지속 ${S.td.join(' / ')} s`],normal:`정상 서비스 주기는 tWD 최소보다 짧아야`,
      thr:`WDI 토글 ≤ ${R(twd[0]/2,2)} s (tWD 최소의 ½)`,detect:`멈춤 후 ${twd[0]}–${twd[2]} s 안에 리셋`,margin:ftti?`가장 짧은 FTTI ${ftti} ms 대비 ${R(twd[2]*1000/ftti,0)}배 느림`:'',ok:!ftti||twd[2]*1000<=ftti,
      advice:ftti&&twd[2]*1000>ftti?'외부 워치독은 FTTI 안의 검출에 쓸 수 없음 — FTTI 안 검출은 내부 워치독 · SMU · 프로그램 흐름 감시가 맡고, 외부 WDT는 독립 감시(잠재 고장 · 공통 원인) 역할':'FTTI 안',src:[S.src]});}
  // 6 input UVLO (buck EN divider)
  const en1=parts.find(c=>/^R/.test(c.ref)&&has(c,'BUCK_EN')&&!has(c,'GND')&&/저전압/.test(c.desc||'')),en2=parts.find(c=>/^R/.test(c.ref)&&has(c,'BUCK_EN')&&has(c,'GND'));
  if(en1&&en2){const T=SPEC.TPS54331;const p1=resP(en1,A),p2=resP(en2,A);const ps=[p1,p2,Pr('VEN',T.ven[1],T.ven[0],T.ven[2],T.src),Pr('I1 풀업',T.i1[1],T.i1[0],T.i1[2],T.src),Pr('Ih 히스테리시스',T.ih[1],T.ih[0],T.ih[2],T.src)];
    const vstart=eva(ps,([r1,r2,ve,i1])=>ve*(r1+r2)/r2-i1*r1),vstop=eva(ps,([r1,r2,ve,i1,ih])=>ve*(r1+r2)/r2-(i1+ih)*r1);
    row({mech:'pin_uvlo',block:'pin',title:'입력 저전압 차단 (TPS54331 EN 분압)',chain:ps.map(p=>p.name),normal:`정상 최저 ${A.vop[0]} V에서는 켜져 있어야`,thr:`분압 ${en1.val} / ${en2.val}`,
      detect:`재시작 ${R(vstart.lo)}–${R(vstart.hi)} V · 정지 ${R(vstop.lo)}–${R(vstop.hi)} V`,margin:`재시작 상한 → 정상 최저 ${R(A.vop[0]-vstart.hi)} V · 정지 하한 → 3.5 V 제한 ${R(vstop.lo-T.vstopMin)} V`,
      ok:vstart.hi<A.vop[0]&&vstop.lo>T.vstopMin,advice:'정지 하한이 3.5 V 아래로 내려가면 TPS54331이 내부 UVLO 전에 꺼지지 않음(데이터시트 제한)',src:[p1.src,p2.src,T.src]});}
  // 7 IGN (KL15) detection: divider → MCU digital input
  const ig1=parts.find(c=>/^R/.test(c.ref)&&has(c,'IGN_IN')&&has(c,'IGN_DET')),ig2=parts.find(c=>/^R/.test(c.ref)&&has(c,'IGN_DET')&&has(c,'GND'));
  if(ig1&&ig2){const M=SPEC.MCUIO,vdd=3.3;const p1=resP(ig1,A),p2=resP(ig2,A);const k=eva([p1,p2],([a,b])=>b/(a+b));const vdl=vdd*(1-SPEC.AMS1117.tol/100),vdh=vdd*(1+SPEC.AMS1117.tol/100);
    const on=M.vih*vdh/k.lo,off=M.vil*vdl/k.hi;
    row({mech:'pin_ign',block:'pin',title:'IGN(KL15) 켜짐 · 꺼짐 판정 (분압 → MCU 입력)',chain:[p1.name,p2.name,`VIH ≥ ${M.vih}·VDDP · VIL ≤ ${M.vil}·VDDP (${M.src})`],normal:`분압비 ${R(k.lo,4)}–${R(k.hi,4)}`,
      thr:'MCU 입력 히스테리시스(디지털)',detect:`IGN ≥ ${R(on,1)} V면 반드시 켜짐 · ≤ ${R(off,1)} V면 반드시 꺼짐`,margin:`켜짐 보장 전압 ${R(on,1)} V vs 정상 최저 ${A.vop[0]} V`,ok:on<A.vop[0]&&off>0.8,
      advice:on<A.vop[0]?'크랭킹 중 IGN이 켜짐 보장 전압 아래로 내려갈 수 있으면 SW 디바운스로 처리':(()=>{const kNeed=M.vih*vdh/(A.vop[0]*0.9)*(1+(rTol(ig1,A)+rTol(ig2,A))/100);const rtN=e24(rVal(ig2.val)*(1/kNeed-1));return`정상 최저 ${A.vop[0]} V에서 켜짐 보장이 안 됨 — 상단 ${ig1.val} → ${kLab(rtN)} (분압비 ${R(rVal(ig2.val)/(rtN+rVal(ig2.val)),3)}, 켜짐 보장 약 ${R(M.vih*vdh/(rVal(ig2.val)/(rtN+rVal(ig2.val))*(1-0.02)),1)} V). 상한 ${A.vop[1]} V에서 핀 전압은 클램프(BAT54S)가 잡음`;})(),src:[p1.src,p2.src,M.src]});}
  // 8 gate driver supplies (A4911 internal, fixed)
  if(drv){const D=SPEC.A4911;row({mech:'drv_uv',block:'gate',title:'게이트 구동 전원 저전압 (A4911 내장)',chain:['VREG UV (VRG = 0)','부트스트랩 UV','VBB UV'],normal:'VREG 8 V 정상',thr:'고정 (내장)',
    detect:`VREG ${D.vregUV[0]}–${D.vregUV[2]} V · 부트스트랩 ${D.bootUV[0]}–${D.bootUV[1]} % VREG · VBB ${D.vbbUV} V(전형)`,margin:`VREG UV 하한 ${D.vregUV[0]} V에서 게이트 전압 — FET RDS(on) 지정 조건(10 V)보다 낮음`,ok:true,
    advice:'VREG UV 근처에서는 FET 저항이 커짐(발열) — VRG = 1(11 V)이면 UV 6.9–7.4 V로 여유 증가',src:['DS']});
    row({mech:'drv_temp',block:'gate',title:'드라이버 과열 경고 · 차단 (A4911 내장)',chain:['TJWH','TJF'],normal:'',thr:'고정',detect:`경고 ${D.tjw[0]}–${D.tjw[2]} °C · 차단 ${D.tjf[0]}–${D.tjf[2]} °C`,margin:'',ok:true,advice:'경고는 SPI 진단 레지스터로 주기 읽기',src:['DS']});}
  return{rows:out,assume:A,spec:SPEC};}
/* ---- table / HTML ---- */
const MLAB={vbat_rng:'VBAT 범위',ntc_derate:'과열 디레이팅',ntc_range:'NTC open · short',cur_range:'상전류 범위 · SW 과전류',cur_sum:'Σi ≈ 0',cur_ocp:'HW 과전류 (OCT)',cur_vds:'VDS 단락',sbc_uv:'MCU 전원 UV',sbc_wdt:'외부 워치독',pin_uvlo:'입력 UVLO',pin_ign:'IGN 감지',drv_uv:'드라이버 UV',drv_temp:'드라이버 과열'};
function aoa(R){return[['메커니즘','항목','측정 체인 · 공차','정상 범위 (최악)','권장 임계값','고장 판정 범위','여유 · 참고','판정','조언','출처']].concat(R.rows.map(r=>[MLAB[r.mech]||r.mech,r.title,r.chain.join(' / '),r.normal,r.thr,r.detect,r.margin,r.ok?'OK':'점검',r.advice||'',[...new Set(r.src)].join(', ')]));}
function text(R){return R.rows.map(r=>`${r.ok?'✓':'⚠'} ${r.title}\n   체인: ${r.chain.join(' · ')}\n   정상: ${r.normal}\n   임계: ${r.thr}\n   판정: ${r.detect}${r.margin?`\n   여유: ${r.margin}`:''}${r.advice?`\n   → ${r.advice}`:''}`).join('\n');}
const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function html(R){const A=R.assume;const inp=(k,v,w,lab)=>`<label style="display:inline-flex;gap:4px;align-items:center;margin:0 10px 6px 0;font-size:12px">${lab}<input data-dta="${k}" value="${h(v)}" style="width:${w||54}px;font:inherit;padding:2px 4px"></label>`;
  return`<div class="sm"><div style="margin:0 0 8px;font-size:12px">${inp('Tmin',A.Tmin,44,'온도 °C')}${inp('Tmax',A.Tmax,44,'~')}${inp('rTol',A.rTol,40,'저항 기본 %')}${inp('rTCR',A.rTCR,48,'TCR ppm')}${inp('shTol',A.shTol,40,'션트 %')}${inp('margin',A.margin,40,'여유 %')}${inp('vop',A.vop.join('-'),60,'정상 VBAT V')}${inp('ntc',A.ntc.join('/'),60,'보드 한계 °C')}${inp('tue',R.spec.ADC.tue,36,'ADC TUE LSB')}</div>
  <table><tr><th>메커니즘</th><th>측정 체인 · 공차</th><th>정상 범위 (최악)</th><th>권장 임계값</th><th>고장 판정 범위</th><th>여유 · 조언</th></tr>
  ${R.rows.map(r=>`<tr${r.ok?'':' style="background:color-mix(in srgb,#c4521a 9%,transparent)"'}><td><b>${h(r.title)}</b><div class="sm-st">${r.ok?'✓ OK':'⚠ 점검'} · ${h([...new Set(r.src)].join(', '))}</div></td><td>${r.chain.map(x=>`<div class="sm-st">${h(x)}</div>`).join('')}</td><td>${h(r.normal)}</td><td><b>${h(r.thr)}</b></td><td>${h(r.detect)}</td><td>${h(r.margin)}${r.advice?`<div class="sm-st" style="margin-top:3px">→ ${h(r.advice)}</div>`:''}</td></tr>`).join('')}</table>
  <p class="sm-st" style="margin-top:8px">최악 조합(EVA): 모든 공차를 동시에 최악으로 — 보수적. "가정" 출처는 데이터시트 최소/최대로 바꾸세요(SPEC). 측정 오차만 다루며 필터 지연 · 노이즈 · 샘플링은 별도.</p></div>`;}
return{SPEC,DEF,compute,eva,text,aoa,html,MLAB};
})();
if(typeof module!=='undefined')module.exports=DIAGTHR;
