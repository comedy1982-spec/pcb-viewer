/* Circuit analysis for the consoles (and Claude): power tree, decoupling audit, passive network patterns (RC/LC/divider/LED),
   and a small-signal AC sweep of the passive network (complex MNA with R, L, C; ICs open, regulators as ideal sources).
   Everything here reads the board model only; the MNA DC/transient engine and the copper IR-drop solver live in SIM. */
const ANALYZE=(function(){
"use strict";
const parseVal=s=>{if(typeof SIM!=='undefined'&&SIM.parseVal)return SIM.parseVal(s);const m=String(s||'').replace(/Ω|ohm|F|H/gi,'').match(/^\s*([\d.]+)\s*([pnuµmkMG]?)/);if(!m)return NaN;return parseFloat(m[1])*({p:1e-12,n:1e-9,u:1e-6,'µ':1e-6,m:1e-3,k:1e3,M:1e6,G:1e9}[m[2]]||1);};
const fmt=(v,u)=>{if(!isFinite(v))return'—';const a=Math.abs(v);const[k,s]=a>=1e9?[1e9,'G']:a>=1e6?[1e6,'M']:a>=1e3?[1e3,'k']:a>=1?[1,'']:a>=1e-3?[1e-3,'m']:a>=1e-6?[1e-6,'µ']:a>=1e-9?[1e-9,'n']:[1e-12,'p'];const x=v/k;return(Math.abs(x)>=100?x.toFixed(0):Math.abs(x)>=10?x.toFixed(1):x.toFixed(2))+' '+s+(u||'');};
const isGnd=(B,n)=>!!n&&(B.netClass?B.netClass(n)==='접지':/^(GND|VSS|AGND|PGND|DGND|0V)/i.test(n));
const isPwr=(B,n)=>!!n&&(B.netClass?B.netClass(n)==='전원':/^(\+|V(CC|DD|IN|BAT|BUS|SYS|M)|\d+V)/i.test(n));
const nomV=n=>typeof SIM!=='undefined'&&SIM.nominalV?SIM.nominalV(n):(()=>{const m=String(n||'').match(/(\d+)V(\d+)?/i);return m?parseFloat(m[1]+'.'+(m[2]||'0')):0;})();
const two=c=>{const n=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];return n.length===2&&c.pads.length<=4?n:null;};
const kind=c=>{const r=c.ref.toUpperCase();return/^(R|RN)\d/.test(r)?'R':/^C\d/.test(r)?'C':/^L\d/.test(r)?'L':/^FB\d/.test(r)?'FB':/^(D|LED)\d/.test(r)?(c.kind==='led'||/LED/i.test(c.val+' '+c.fp)?'LED':'D'):/^(U|IC|VR|PS)\d/.test(r)?'U':/^Q\d/.test(r)?'Q':/^(J|P|CN|USB|BT)\d/.test(r)?'J':/^TP\d/.test(r)?'TP':'X';};
/* ---------- power tree ---------- */
function powerTree(B){const ckt=typeof SIM!=='undefined'&&SIM.extractCircuit?SIM.extractCircuit(B):{els:[],srcs:[],gnd:null};
  const regs=ckt.els.filter(e=>e.type==='REG').map(e=>({ref:e.ref,in:e.n[0],out:e.n[1],vset:e.vset,vdo:e.vdo}));
  const rails=B.netOrder.filter(n=>isPwr(B,n)).map(n=>{const pads=B.nets[n].pads||[];const comps=[...new Set(pads.map(p=>p.ref))].map(r=>B.byRef[r]).filter(Boolean);
    const ics=comps.filter(c=>kind(c)==='U'||kind(c)==='Q'),caps=comps.filter(c=>kind(c)==='C'&&two(c)&&two(c).some(x=>isGnd(B,x))),conns=comps.filter(c=>kind(c)==='J');
    const reg=regs.find(r=>r.out===n);const src=ckt.srcs.find(s=>s.n[0]===n);const feeds=regs.filter(r=>r.in===n).map(r=>r.ref);
    const load=ckt.els.filter(e=>e.type==='LOAD'&&e.n[0]===n).reduce((a,e)=>a+e.I,0)+regs.filter(r=>r.in===n).reduce((a,r)=>a+0.05,0);
    return{net:n,v:reg?reg.vset:nomV(n),from:reg?`${reg.ref} (${reg.in} → ${fmt(reg.vset,'V')}, 드롭아웃 ${fmt(reg.vdo,'V')})`:src?src.label||'입력 전원':conns.length?`커넥터 ${conns.map(c=>c.ref).join(',')}`:'(출처 불명)',ics:ics.map(c=>c.ref),caps:caps.map(c=>`${c.ref} ${c.val||''}`.trim()),capF:caps.reduce((a,c)=>a+(parseVal(c.val)||0),0),conns:conns.map(c=>c.ref),feeds,loadEst:load,pads:pads.length};});
  const warn=[];rails.forEach(r=>{if(r.ics.length&&!r.caps.length)warn.push(`${r.net}: IC ${r.ics.length}개가 물려 있는데 접지로 가는 커패시터가 없습니다.`);if(r.from==='(출처 불명)'&&r.pads>=2)warn.push(`${r.net}: 공급원(레귤레이터·커넥터)을 찾지 못했습니다.`);});
  regs.forEach(r=>{const vin=nomV(r.in);if(vin&&r.vset&&vin<r.vset+r.vdo)warn.push(`${r.ref}: 입력 ${fmt(vin,'V')}이(가) 출력 ${fmt(r.vset,'V')} + 드롭아웃 ${fmt(r.vdo,'V')}보다 낮습니다.`);});
  return{rails,regs,gnd:ckt.gnd,warn,skipped:ckt.skipped||[]};}
function powerText(B){const P=powerTree(B);
  return`[전원 트리] 접지 ${P.gnd||'?'}\n`+P.rails.map(r=>`${r.net} (${fmt(r.v,'V')}) ← ${r.from}\n  부하: ${r.ics.length?r.ics.join(', '):'-'}${r.feeds.length?` · 레귤레이터 입력: ${r.feeds.join(', ')}`:''} · 추정 ${fmt(r.loadEst,'A')}\n  디커플링: ${r.caps.length?r.caps.join(', ')+` (합 ${fmt(r.capF,'F')})`:'없음'}`).join('\n')+(P.warn.length?'\n경고: '+P.warn.join(' / '):'')+(P.skipped.length?`\n모델 제외: ${P.skipped.map(s=>s[0]).join(', ')}`:'');}
/* ---------- decoupling audit: every IC power pin, the capacitors on that net near the part ---------- */
function decap(B){const out=[];
  B.comps.filter(c=>kind(c)==='U').forEach(c=>{const rails=new Map();c.pads.forEach(p=>{if(p.net&&isPwr(B,p.net)&&!rails.has(p.net))rails.set(p.net,[]);if(p.net&&rails.has(p.net))rails.get(p.net).push(String(p.n)+(p.fn?'('+p.fn+')':''));});
    rails.forEach((pins,net)=>{const caps=B.comps.filter(x=>kind(x)==='C'&&two(x)&&two(x).includes(net)&&two(x).some(n=>isGnd(B,n)));
      const near=caps.map(x=>({ref:x.ref,val:x.val,F:parseVal(x.val)||0,d:Math.hypot(x.x-c.x,x.y-c.y)})).sort((a,b)=>a.d-b.d);
      const small=near.filter(x=>x.F>0&&x.F<=2.2e-7),bulk=near.filter(x=>x.F>=1e-6);
      const sev=!near.length?'err':!small.length?'warn':near[0].d>12?'warn':'ok';
      out.push({ref:c.ref,val:c.val,net,pins,caps:near,small:small.length,bulk:bulk.length,nearest:near.length?near[0].d:null,sev,
        msg:!near.length?`${c.ref} ${net} 핀(${pins.join(',')})에 디커플링 커패시터가 없습니다.`:!small.length?`${c.ref} ${net}: 100 nF급 고주파 디커플링이 없습니다 (${near.map(x=>x.ref+' '+x.val).join(', ')}).`:near[0].d>12?`${c.ref} ${net}: 가장 가까운 커패시터 ${near[0].ref}가 ${near[0].d.toFixed(1)} mm 떨어져 있습니다 (배치에서 5 mm 안으로).`:`${c.ref} ${net}: ${near.map(x=>x.ref+' '+x.val).join(', ')} (가장 가까운 ${near[0].d.toFixed(1)} mm)`});});});
  return out;}
function decapText(B){const L=decap(B);if(!L.length)return'[디커플링] 전원 핀이 있는 IC가 없습니다.';const n=s=>L.filter(x=>x.sev===s).length;
  return`[디커플링] IC 전원 핀 ${L.length}곳 · 문제 ${n('err')} · 경고 ${n('warn')} · 양호 ${n('ok')}\n`+L.map(x=>`${x.sev==='err'?'!!':x.sev==='warn'?'!':'·'} ${x.msg}`).join('\n');}
/* ---------- passive patterns: RC/LC filters, dividers, pull-ups, LED currents ---------- */
function patterns(B){const out=[];const R=B.comps.filter(c=>kind(c)==='R'&&two(c)),C=B.comps.filter(c=>kind(c)==='C'&&two(c)),L=B.comps.filter(c=>kind(c)==='L'&&two(c)),FB=B.comps.filter(c=>kind(c)==='FB'&&two(c)),LED=B.comps.filter(c=>kind(c)==='LED'&&two(c));
  const capsToGnd=n=>C.filter(c=>two(c).includes(n)&&two(c).some(x=>isGnd(B,x))).reduce((a,c)=>a+(parseVal(c.val)||0),0);
  const other=(c,n)=>two(c).find(x=>x!==n);
  // RC low-pass: R from A to N, C from N to GND, N not a rail
  R.forEach(r=>{const[a,b]=two(r);[[a,b],[b,a]].forEach(([from,node])=>{if(isGnd(B,node)||isPwr(B,node))return;const Cf=capsToGnd(node);const Rv=parseVal(r.val);if(Cf>0&&Rv>0){const fc=1/(2*Math.PI*Rv*Cf);out.push({type:'RC',parts:[r.ref],from,node,R:Rv,C:Cf,fc,msg:`RC 저역 필터 ${r.ref} ${r.val} + ${fmt(Cf,'F')} → ${node}: fc ≈ ${fmt(fc,'Hz')} (τ = ${fmt(Rv*Cf,'s')})`});}});});
  // LC / FB-C: L (or bead) from rail A to N, C from N to GND
  L.concat(FB).forEach(l=>{const[a,b]=two(l);[[a,b],[b,a]].forEach(([from,node])=>{if(isGnd(B,node))return;const Cf=capsToGnd(node);if(!(Cf>0))return;if(kind(l)==='L'){const Lv=parseVal(l.val);if(Lv>0){const fc=1/(2*Math.PI*Math.sqrt(Lv*Cf));out.push({type:'LC',parts:[l.ref],from,node,L:Lv,C:Cf,fc,msg:`LC 필터 ${l.ref} ${l.val} + ${fmt(Cf,'F')} → ${node}: fc ≈ ${fmt(fc,'Hz')} (Q 감쇠 저항 없음 — 공진 주의)`});}}
      else{const Cin=capsToGnd(from);out.push({type:'FB',parts:[l.ref],from,node,C:Cf,msg:`페라이트 비드 ${l.ref} ${l.val||''}: ${from} → ${node}${Cin>0?` (π 필터: ${fmt(Cin,'F')} | 비드 | ${fmt(Cf,'F')})`:` (출력 쪽 ${fmt(Cf,'F')}, 입력 쪽 커패시터 없음)`}`});}});});
  // dividers and pull-ups/downs
  R.forEach(r1=>{const[a,b]=two(r1);[[a,b],[b,a]].forEach(([top,mid])=>{if(!isPwr(B,top)||isGnd(B,mid)||isPwr(B,mid))return;const r2=R.find(x=>x!==r1&&two(x).includes(mid)&&two(x).some(n=>isGnd(B,n)));
      const R1=parseVal(r1.val);if(r2){const R2=parseVal(r2.val);if(R1>0&&R2>0&&r1.ref<r2.ref){const V=nomV(top);out.push({type:'DIV',parts:[r1.ref,r2.ref],node:mid,ratio:R2/(R1+R2),msg:`분압 ${r1.ref} ${r1.val} / ${r2.ref} ${r2.val}: ${top} → ${mid} = ×${(R2/(R1+R2)).toFixed(3)}${V?` ≈ ${fmt(V*R2/(R1+R2),'V')}`:''} · 소비 ${V?fmt(V*V/(R1+R2),'W'):'?'}`});}}
      else{const pins=(B.nets[mid]&&B.nets[mid].pads||[]).filter(p=>p.ref!==r1.ref);if(pins.some(p=>/^(D|LED)\d/i.test(p.ref)))return;if(pins.length&&R1>0)out.push({type:'PU',parts:[r1.ref],node:mid,R:R1,msg:`풀업 ${r1.ref} ${r1.val}: ${mid} → ${top} (${pins.map(p=>p.ref+'.'+p.n).slice(0,4).join(', ')})`});}});
    [[a,b],[b,a]].forEach(([g,mid])=>{if(!isGnd(B,g)||isPwr(B,mid)||isGnd(B,mid))return;const up=R.some(x=>x!==r1&&two(x).includes(mid)&&two(x).some(n=>isPwr(B,n)));if(up)return;const R1=parseVal(r1.val);const pins=(B.nets[mid]&&B.nets[mid].pads||[]).filter(p=>p.ref!==r1.ref);
      if(pins.some(p=>/^(D|LED)\d/i.test(p.ref)))return;if(pins.length&&R1>0)out.push(R1<=1?{type:'SHUNT',parts:[r1.ref],node:mid,R:R1,msg:`전류 감지 션트 ${r1.ref} ${r1.val}: ${mid} → ${g} (${pins.map(p=>p.ref+'.'+p.n).slice(0,4).join(', ')}) · 1 A당 ${fmt(R1,'V')}`}:{type:'PD',parts:[r1.ref],node:mid,R:R1,msg:`풀다운 ${r1.ref} ${r1.val}: ${mid} → ${g} (${pins.map(p=>p.ref+'.'+p.n).slice(0,4).join(', ')})`});});});
  // LED current: rail → R → node → LED → GND (or GPIO → R → LED → GND)
  LED.forEach(d=>{const[x,y]=two(d);const node=isGnd(B,x)?y:isGnd(B,y)?x:null;if(!node)return;const r=R.find(q=>two(q).includes(node));if(!r)return;const top=other(r,node);const V=isPwr(B,top)?nomV(top):3.3;const Rv=parseVal(r.val);const vf=/RED|빨강|적색/i.test(d.val+d.desc)?1.9:/BLUE|WHITE|파랑|흰|백색/i.test(d.val+(d.desc||''))?3.0:2.1;
    if(Rv>0&&V>vf)out.push({type:'LED',parts:[d.ref,r.ref],I:(V-vf)/Rv,msg:`LED ${d.ref} (${top}${isPwr(B,top)?'':' GPIO 가정 3.3 V'} → ${r.ref} ${r.val} → ${d.ref}): I ≈ ${fmt((V-vf)/Rv,'A')} (Vf ${vf} V 가정)`});});
  return out;}
function patternText(B){const P=patterns(B);return P.length?`[수동 소자 패턴] ${P.length}개\n`+P.map(p=>'· '+p.msg).join('\n'):'[수동 소자 패턴] RC/LC 필터·분압·풀업·LED 패턴을 찾지 못했습니다.';}
/* ---------- AC sweep of the passive network (complex MNA) ---------- */
function acNetwork(B){const gnd=B.netOrder.find(n=>isGnd(B,n))||null;const els=[];
  B.comps.forEach(c=>{const k=kind(c);const n=two(c);if(!n)return;const v=parseVal(c.val);
    if(k==='R'&&v>0)els.push({ref:c.ref,type:'R',n,val:v});else if(k==='C'&&v>0)els.push({ref:c.ref,type:'C',n,val:v});else if(k==='L'&&v>0)els.push({ref:c.ref,type:'L',n,val:v});
    else if(k==='FB'){const z=(String(c.val||'').match(/(\d+)\s*Ω?\s*@\s*(\d+)\s*M/i));const Z=z?+z[1]:600,f=z?+z[2]*1e6:1e8;els.push({ref:c.ref,type:'R',n,val:0.1},{ref:c.ref+'L',type:'L',n,val:Z/(2*Math.PI*f)});}});
  return{gnd,els};}
/* |H(f)| = V(to)/V(from) with a 1 V source at `from`; rails other than `from` are AC-grounded when `acGnd` is true */
function acSweep(B,from,to,opt){opt=opt||{};const N=acNetwork(B);if(!N.gnd)return{error:'접지 넷을 찾지 못했습니다.'};if(!B.nets[from]||!B.nets[to])return{error:`넷을 찾지 못했습니다: ${!B.nets[from]?from:to}`};
  const short=new Set([N.gnd]);if(opt.acGnd!==false)B.netOrder.forEach(n=>{if(isPwr(B,n)&&n!==from&&n!==to)short.add(n);});
  const nodes=new Map();const id=n=>{if(short.has(n))return-1;if(!nodes.has(n))nodes.set(n,nodes.size);return nodes.get(n);};
  N.els.forEach(e=>e.n.forEach(id));id(from);id(to);const nn=nodes.size;if(nn===0)return{error:'해석할 노드가 없습니다.'};
  const fr=id(from),tn=id(to);if(fr<0)return{error:`${from}은(는) 접지/고정 레일이라 입력으로 쓸 수 없습니다.`};if(tn<0)return{error:`${to}은(는) 접지/고정 레일이라 출력으로 쓸 수 없습니다.`};
  const f0=opt.fmin||1,f1=opt.fmax||1e8,pts=opt.points||61;const freqs=[];for(let i=0;i<pts;i++)freqs.push(f0*Math.pow(f1/f0,i/(pts-1)));
  // complex MNA: unknowns = node voltages (+1 for the source current), solved by Gaussian elimination
  const M=nn+1;const res=[];
  freqs.forEach(f=>{const w=2*Math.PI*f;const Ar=Array.from({length:M},()=>new Float64Array(M)),Ai=Array.from({length:M},()=>new Float64Array(M));const br=new Float64Array(M),bi=new Float64Array(M);
    const stamp=(a,b,gr,gi)=>{if(a>=0){Ar[a][a]+=gr;Ai[a][a]+=gi;}if(b>=0){Ar[b][b]+=gr;Ai[b][b]+=gi;}if(a>=0&&b>=0){Ar[a][b]-=gr;Ai[a][b]-=gi;Ar[b][a]-=gr;Ai[b][a]-=gi;}};
    N.els.forEach(e=>{const a=id(e.n[0]),b=id(e.n[1]);if(e.type==='R')stamp(a,b,1/e.val,0);else if(e.type==='C')stamp(a,b,0,w*e.val);else if(e.type==='L'){const g=1/(w*e.val);stamp(a,b,1e-9,-g);}});
    // tiny leak to ground on every node so floating nodes stay solvable
    for(let i=0;i<nn;i++)Ar[i][i]+=1e-12;
    // voltage source 1 V at `from`: row/col nn
    Ar[fr][nn]+=1;Ar[nn][fr]+=1;br[nn]=1;
    const x=csolve(Ar,Ai,br,bi,M);if(!x)return;const vr=x.r[tn],vi=x.i[tn];const mag=Math.hypot(vr,vi);res.push({f,mag,db:20*Math.log10(Math.max(mag,1e-12)),ph:Math.atan2(vi,vr)*180/Math.PI});});
  if(!res.length)return{error:'AC 해석이 수렴하지 않았습니다.'};
  const dc=res[0].mag;let f3=null;for(let i=1;i<res.length;i++){if(res[i].mag<=dc*Math.SQRT1_2){const a=res[i-1],b=res[i];const t=(a.mag-dc*Math.SQRT1_2)/((a.mag-b.mag)||1);f3=a.f*Math.pow(b.f/a.f,Math.max(0,Math.min(1,t)));break;}}
  let fmax=res[0];res.forEach(r=>{if(r.mag>fmax.mag)fmax=r;});const peak=fmax.mag>dc*1.1?fmax:null;
  return{from,to,points:res,dc,dcDb:res[0].db,f3,peak,els:N.els.length,shorted:[...short]};}
function csolve(Ar,Ai,br,bi,M){for(let c=0;c<M;c++){let p=c,best=0;for(let r=c;r<M;r++){const m=Ar[r][c]*Ar[r][c]+Ai[r][c]*Ai[r][c];if(m>best){best=m;p=r;}}if(best<1e-30)return null;
    if(p!==c){[Ar[p],Ar[c]]=[Ar[c],Ar[p]];[Ai[p],Ai[c]]=[Ai[c],Ai[p]];[br[p],br[c]]=[br[c],br[p]];[bi[p],bi[c]]=[bi[c],bi[p]];}
    const pr=Ar[c][c],pi=Ai[c][c],den=pr*pr+pi*pi;
    for(let r=c+1;r<M;r++){const xr=Ar[r][c],xi=Ai[r][c];if(!xr&&!xi)continue;const fr=(xr*pr+xi*pi)/den,fi=(xi*pr-xr*pi)/den;
      for(let k=c;k<M;k++){Ar[r][k]-=fr*Ar[c][k]-fi*Ai[c][k];Ai[r][k]-=fr*Ai[c][k]+fi*Ar[c][k];}br[r]-=fr*br[c]-fi*bi[c];bi[r]-=fr*bi[c]+fi*br[c];}}
  const xr=new Float64Array(M),xi=new Float64Array(M);
  for(let r=M-1;r>=0;r--){let sr=br[r],si=bi[r];for(let k=r+1;k<M;k++){sr-=Ar[r][k]*xr[k]-Ai[r][k]*xi[k];si-=Ar[r][k]*xi[k]+Ai[r][k]*xr[k];}const pr=Ar[r][r],pi=Ai[r][r],den=pr*pr+pi*pi;xr[r]=(sr*pr+si*pi)/den;xi[r]=(si*pr-sr*pi)/den;}
  return{r:xr,i:xi};}
function acText(B,from,to,opt){const r=acSweep(B,from,to,opt);if(r.error)return'[AC 해석] '+r.error;if(r.dc<1e-6&&r.points.every(p=>p.mag<1e-6))return`[AC 해석] ${from} → ${to}: 수동 소자(R·L·C)만으로 이어지는 경로가 없습니다 (IC·레귤레이터·트랜지스터는 소신호 해석에서 열린 것으로 봄). 필터 입력·출력 넷을 직접 지정하세요.`;
  const pick=[1,10,100,1e3,1e4,1e5,1e6,1e7,1e8].filter(f=>f>=r.points[0].f&&f<=r.points[r.points.length-1].f).map(f=>{let b=r.points[0];r.points.forEach(p=>{if(Math.abs(Math.log(p.f/f))<Math.abs(Math.log(b.f/f)))b=p;});return`${fmt(b.f,'Hz')}: ${b.db.toFixed(1)} dB`;});
  return`[AC 해석] ${from} → ${to} (수동 소자 ${r.els}개 · 1 V 소신호 · 고정 레일은 AC 접지: ${r.shorted.join(', ')})\nDC 이득 ${r.dcDb.toFixed(1)} dB (×${r.dc.toFixed(3)}) · -3 dB ${r.f3?fmt(r.f3,'Hz'):'범위 밖 (평탄)'}${r.peak?` · 피크 ${r.peak.db.toFixed(1)} dB @ ${fmt(r.peak.f,'Hz')} (공진)`:''}\n${pick.join(' · ')}`;}
/* ---------- DC operating point through SIM.dcop ---------- */
function dcText(B){if(typeof SIM==='undefined'||!SIM.dcop)return'[DC 동작점] 시뮬레이션 엔진이 없습니다.';const ckt=SIM.extractCircuit(B);if(!ckt.srcs.length)return'[DC 동작점] 전원 소스를 찾지 못했습니다 (전원 넷과 접지 넷이 필요).';
  const r=SIM.dcop(Object.assign({},ckt,{tDC:1e9}));if(r.error)return'[DC 동작점] '+r.error;
  const nets=Object.entries(r.nets||{}).filter(([n])=>!/#/.test(n)).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([n,v])=>`${n}=${fmt(v,'V')}`);
  const parts=(r.parts||[]).filter(p=>p.I!=null&&Math.abs(p.I)>1e-6).sort((a,b)=>Math.abs(b.P||0)-Math.abs(a.P||0)).slice(0,30).map(p=>`${p.ref||p.id} ${fmt(Math.abs(p.I),'A')}${p.P!=null?' · '+fmt(Math.abs(p.P),'W'):''}`);
  return`[DC 동작점] 소스 ${ckt.srcs.map(s=>`${s.id} ${s.n[0]} ${fmt(s.v,'V')}`).join(', ')}\n노드: ${nets.join(', ')}\n전류·소비: ${parts.join(', ')||'-'}${ckt.skipped.length?`\n모델 제외: ${ckt.skipped.map(s=>`${s[0]}(${s[1]})`).join(', ')}`:''}`;}
return{powerTree,powerText,decap,decapText,patterns,patternText,acNetwork,acSweep,acText,dcText,fmt,parseVal};
})();
if(typeof module!=='undefined')module.exports=ANALYZE;
