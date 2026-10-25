/* ---------- power topology: which rail comes from where and what draws from it, per IC or per unit ----------
   From the board (or the board generated from the plan): every supply rail, its source (input connector, regulator, or a
   switch / reverse-protection FET between two rails of the same voltage), the ICs drawing from it with an estimated
   current and power (CURRENT load table), regulator input current, loss and efficiency (LDO: (Vin − Vout) · Iout,
   buck: Pout · (1/η − 1), η = 0.88), the motor bridge as one load (0.7 × phase current), and connectors on a rail as
   external loads (not estimated). units: parts grouped by system block (plan / architecture), else by functional zone.
   Early-design estimates — typical currents, not worst case. */
const POWERTOPO=(function(){
"use strict";
const ETA=0.88;
const r2=v=>Math.round(v*100)/100,r3=v=>Math.round(v*1000)/1000;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* opts.units: {ref → {id,label}} (from the plan / architecture); opts.motorI: phase current */
function build(B,opts){opts=opts||{};const C=typeof CURRENT!=='undefined'?CURRENT:null;if(!C)throw new Error('CURRENT 모듈 없음');
  // gate / sense nets named after a rail (VIN_PG, VM_G …) are not supplies
  const isRail=n=>n&&C.isRail(n)&&!/_(PG|G|GATE|GD|SNS|SENSE|ADJ|FB)$/i.test(n),V=n=>C.railV(n);const comps=B.comps.filter(c=>c.kind!=='none');
  const rails={};const R=n=>rails[n]||(rails[n]={net:n,v:V(n),src:null,loads:[],out:[],I:0,P:0});
  const unitOf=c=>(opts.units&&opts.units[c.ref])||(B.zones&&B.zones.groupOf&&B.zones.groupOf[c.ref]?{id:'z:'+B.zones.groupOf[c.ref],label:(opts.zoneLabels||{})[B.zones.groupOf[c.ref]]||B.zones.groupOf[c.ref]}:{id:'z:other',label:'기타'});
  const railsOf=c=>[...new Set(c.pads.map(p=>p.net).filter(isRail))].sort((a,b)=>(V(b)||0)-(V(a)||0));
  const edges=[];let motor=null;
  comps.forEach(c=>{const L=C.partLoad(c);const rs=railsOf(c);if(!rs.length)return;const ref=String(c.ref||'');
    // regulators: input = highest rail on the part, output = the next one
    if(L&&/^(buck|ldo|pmic)$/.test(L.role)){let to=rs.slice(1);
      // a switcher's output comes through its inductor: switch-node pin → L → output rail
      if(!to.length){c.pads.forEach(p=>{if(!p.net||isRail(p.net))return;comps.filter(l=>/^L\d/.test(l.ref)&&l.pads.length===2&&l.pads.some(q=>q.net===p.net)).forEach(l=>{const o=l.pads.find(q=>q.net!==p.net);if(o&&isRail(o.net)&&o.net!==rs[0]&&!to.includes(o.net))to.push(o.net);});});}
      if(to.length){edges.push({kind:L.role,c,from:rs[0],to});return;}}
    // switch / reverse protection: a FET or diode joining two rails of the same voltage
    if(/^(Q|D)\d/.test(ref)&&rs.length===2&&Math.abs((V(rs[0])||0)-(V(rs[1])||0))<0.01&&!c.pads.some(p=>/^PH_/.test(p.net||''))){
      const a=rs.find(n=>/RAW|IN$|KL30|VBAT/i.test(n))||rs[0];edges.push({kind:'switch',c,from:a,to:[rs.find(n=>n!==a)]});return;}
    if(/^J\d/.test(ref)){rs.forEach(n=>R(n).loads.push({kind:'ext',c,ref,label:c.val||ref,desc:c.desc||'',I:null,unit:unitOf(c)}));return;}
    if(!L||L.role==='fet')return;
    if(L.role==='gdrv'||L.role==='mdrv'){const Im=opts.motorI||null;const vm=rs[0];
      R(vm).loads.push({kind:'ic',c,ref,label:c.val,desc:c.desc||'',I:0.03,unit:unitOf(c)});
      if(Im){motor=motor||{net:vm,I:r2(Im*0.7),Iph:Im,unit:unitOf(c),by:ref};}return;}
    // the rail it draws from: CAN transceivers drive the bus from VCC (the higher rail, VIO is the logic level); others the lowest
    const sup=L.role==='can'?rs[0]:rs[rs.length-1];R(sup).loads.push({kind:'ic',c,ref,label:c.val,desc:c.desc||'',I:L.I,unit:unitOf(c)});});
  if(motor)R(motor.net).loads.push({kind:'motor',ref:'M',label:`모터 (3상 브리지 · 상전류 ${motor.Iph} A)`,desc:`${motor.by} 구동 · 평균 0.7 × 상전류`,I:motor.I,unit:motor.unit});
  edges.forEach(e=>{R(e.from);e.to.forEach(t=>{const r=R(t);r.src=e;});R(e.from).out.push(e);});
  // currents bottom-up: a rail draws its loads plus the input current of every regulator / switch it feeds
  const done=new Set();const solve=n=>{if(done.has(n))return rails[n].I;done.add(n);const r=rails[n];let I=r.loads.reduce((a,l)=>a+(l.I||0),0);
    r.out.forEach(e=>{const Io=e.to.reduce((a,t)=>a+solve(t),0);const vo=V(e.to[0])||0,vi=V(e.from)||0;
      e.Iout=r3(Io);e.Iin=r3(e.kind==='buck'?(vi?Io*vo/vi/ETA:Io):Io+(e.kind==='switch'?0:0.005));
      e.loss=r2(e.kind==='ldo'||e.kind==='pmic'?Math.max(0,(vi-vo))*Io:e.kind==='buck'?vo*Io*(1/ETA-1):0);e.eff=vi&&e.Iin?r2(vo*Io/(vi*e.Iin)):null;I+=e.Iin;});
    r.I=r3(I);r.P=r2(I*(r.v||0));return r.I;};
  Object.keys(rails).forEach(solve);
  const roots=Object.values(rails).filter(r=>!r.src).sort((a,b)=>(b.v||0)-(a.v||0));
  roots.forEach(r=>{const js=r.loads.filter(l=>l.kind==='ext');r.inputs=js;});
  const all=Object.values(rails);const loss=edges.reduce((a,e)=>a+(e.loss||0),0);
  const Pin=roots.reduce((a,r)=>a+(r.P||0),0);
  // per-unit totals
  const units={};all.forEach(r=>r.loads.forEach(l=>{if(l.kind==='ext')return;const u=l.unit||{id:'z:other',label:'기타'};const U=units[u.id]||(units[u.id]={id:u.id,label:u.label,refs:[],rails:{},I:0,P:0});
    U.refs.push(l.ref);U.rails[r.net]=r3((U.rails[r.net]||0)+(l.I||0));U.P=r2(U.P+(l.I||0)*(r.v||0));}));
  edges.forEach(e=>{if(!e.loss)return;const u=unitOf(e.c);const U=units[u.id]||(units[u.id]={id:u.id,label:u.label,refs:[],rails:{},I:0,P:0});U.refs.push(e.c.ref);U.P=r2(U.P+e.loss);});
  return{rails,roots,edges,units,Pin:r2(Pin),loss:r2(loss),motor};}
/* per-unit rows of a rail: the loads grouped by unit */
function unitRows(r){const m=new Map();r.loads.forEach(l=>{const u=l.unit||{id:'z:other',label:'기타'};const k=u.id+(l.kind==='ext'?'#ext':'');const g=m.get(k)||{label:u.label,refs:[],I:0,ext:l.kind==='ext'};g.refs.push(l.ref);if(l.I)g.I+=l.I;m.set(k,g);});
  return[...m.values()].map(g=>({ref:g.refs.join(', '),label:g.label,I:g.ext?null:r3(g.I),ext:g.ext}));}
function icRows(r){return r.loads.map(l=>({ref:l.ref,label:l.label,I:l.I,ext:l.kind==='ext',desc:l.desc}));}
const fA=I=>I==null?'—':I>=1?r2(I)+' A':Math.round(I*1000)+' mA';
const fW=P=>P==null?'':P>=1?r2(P)+' W':Math.round(P*1000)+' mW';
const KIND={buck:'벅',ldo:'LDO',pmic:'PMIC',switch:'보호 · 스위치'};
/* SVG: rails as boxes left → right (depth), the regulator / switch on the link, loads listed inside each rail box */
function svg(M,o){o=o||{};const mode=o.mode==='unit'?'unit':'ic';const W=236,GX=26,GY=74,HH=46,RH=17,PAD=14;
  const rowsOf=r=>mode==='unit'?unitRows(r):icRows(r);const H=r=>HH+Math.max(1,rowsOf(r).length)*RH+8;
  // top → bottom: depth on y, siblings side by side; a parent sits over its first child
  const pos=new Map();const depthH=[];
  const place=(r,d,x)=>{const h=H(r);depthH[d]=Math.max(depthH[d]||0,h);const kids=r.out.flatMap(e=>e.to.map(t=>M.rails[t])).filter(Boolean);let cx=x;
    kids.forEach((k,i)=>{cx+=place(k,d+1,cx)+(i<kids.length-1?GX:0);});const w=Math.max(W,cx-x);pos.set(r.net,{x,d,h});return w;};
  let x=PAD;M.roots.forEach((r,i)=>{x+=place(r,0,x)+GX*2;});
  const yOf=[];let yy=PAD+18;depthH.forEach((h,d)=>{yOf[d]=yy;yy+=h+GY;});pos.forEach(p=>{p.y=yOf[p.d];});
  let maxX=0,maxY=0;pos.forEach(p=>{maxX=Math.max(maxX,p.x+W);maxY=Math.max(maxY,p.y+p.h);});
  const out=[];const col=v=>v>=8?'#e05a5a':v>=4.5?'#e0a040':v>=2.5?'#4f8fe0':'#3fb08a';
  M.edges.forEach(e=>{const a=pos.get(e.from);e.to.forEach(t=>{const b=pos.get(t);if(!a||!b)return;const x1=a.x+W/2,y1=a.y+a.h,x2=b.x+W/2,y2=b.y,my=(y1+y2)/2;
    out.push(`<path d="M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}" fill="none" stroke="var(--pt-line,#8892a0)" stroke-width="1.6"/>`);
    const lb=`${e.c.ref} ${e.c.val||''}`,sb=`${KIND[e.kind]||e.kind}${e.eff&&e.kind!=='switch'?' · η '+Math.round(e.eff*100)+'%':''}${e.loss?' · 손실 '+fW(e.loss):''}`;const bw=Math.max(lb.length*6.6,sb.length*6)+18;const lx=x2; // over the rail it feeds: siblings never share a spot
    out.push(`<g data-n="${esc(e.c.ref)}" style="cursor:pointer"><rect x="${lx-bw/2}" y="${my-17}" width="${bw}" height="34" rx="6" fill="var(--pt-reg,#fff)" stroke="${e.loss>0.5?'#e05a5a':'#8892a0'}"/><text x="${lx}" y="${my-3}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--pt-fg,#222)">${esc(lb)}</text><text x="${lx}" y="${my+11}" text-anchor="middle" font-size="10" fill="var(--pt-mut,#667)">${esc(sb)}</text></g>`);});});
  M.roots.forEach(r=>{const p=pos.get(r.net);if(!p)return;const js=(r.inputs||[]).filter(l=>/입력|전원|KL30|배터리|DC/i.test(l.desc+l.label));if(!js.length)return;
    out.push(`<text x="${p.x}" y="${p.y-6}" font-size="10.5" fill="var(--pt-mut,#667)">입력: ${esc(js.map(j=>j.ref+' '+(j.desc||j.label)).join(' · ').slice(0,52))}</text>`);});
  Object.values(M.rails).forEach(r=>{const p=pos.get(r.net);if(!p)return;const rows=rowsOf(r);const c=col(r.v||0);
    out.push(`<g><rect x="${p.x}" y="${p.y}" width="${W}" height="${p.h}" rx="8" fill="var(--pt-bg,#fff)" stroke="${c}" stroke-width="1.6"/><rect x="${p.x}" y="${p.y}" width="${W}" height="${HH-8}" rx="8" fill="${c}" opacity="0.14"/>
      <text x="${p.x+10}" y="${p.y+17}" font-size="13" font-weight="700" fill="var(--pt-fg,#222)">${esc(r.net)}</text><text x="${p.x+W-10}" y="${p.y+17}" text-anchor="end" font-size="11.5" fill="var(--pt-fg,#222)">${r.v!=null?r.v+' V':''}</text>
      <text x="${p.x+10}" y="${p.y+32}" font-size="10.5" fill="var(--pt-mut,#667)">합계 ${fA(r.I)} · ${fW(r.P)}</text>`);
    rows.forEach((w,i)=>{const y=p.y+HH+i*RH+8;const lab=`${w.ref}  ${w.label||''}`;out.push(`<text x="${p.x+10}" y="${y}" font-size="10.5" fill="var(--pt-fg,#222)"${w.ext?' font-style="italic"':''}>${esc(lab.length>33?lab.slice(0,32)+'…':lab)}</text><text x="${p.x+W-10}" y="${y}" text-anchor="end" font-size="10.5" fill="var(--pt-mut,#667)">${w.ext?'외부':fA(w.I)}</text>`);});
    if(!rows.length)out.push(`<text x="${p.x+10}" y="${p.y+HH+8}" font-size="10.5" fill="var(--pt-mut,#667)">(직접 부하 없음)</text>`);
    out.push('</g>');});
  const w=Math.max(maxX+PAD,560),h=maxY+PAD+26;
  out.push(`<text x="${PAD}" y="${h-10}" font-size="10.5" fill="var(--pt-mut,#667)">입력 약 ${fW(M.Pin)} · 레귤레이터 손실 ${fW(M.loss)}${M.motor?` (모터 ${fA(M.motor.I)} 포함)`:''} · 전형값 추정, 최악 조건 아님 · 커넥터(외부) 부하 미포함</text>`);
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" role="img" aria-label="전원 토폴로지">${out.join('')}</svg>`;}
function text(M,o){o=o||{};const mode=o.mode==='unit'?'unit':'ic';const L=[`[전원 토폴로지 · ${mode==='unit'?'유닛별':'IC별'}] 입력 약 ${fW(M.Pin)} · 레귤레이터 손실 ${fW(M.loss)}`];
  const walk=(r,ind)=>{L.push(`${ind}${r.net} ${r.v!=null?r.v+' V':''} — ${fA(r.I)} · ${fW(r.P)}${r.src?` ← ${r.src.c.ref} ${r.src.c.val} (${KIND[r.src.kind]||r.src.kind}${r.src.loss?', 손실 '+fW(r.src.loss):''})`:''}`);
    (mode==='unit'?unitRows(r):icRows(r)).forEach(w=>L.push(`${ind}  · ${w.ref} ${w.label||''} ${w.ext?'(외부)':fA(w.I)}`));
    r.out.forEach(e=>e.to.forEach(t=>M.rails[t]&&walk(M.rails[t],ind+'    ')));};
  M.roots.forEach(r=>walk(r,''));
  if(mode==='unit'){L.push('유닛 합계:');Object.values(M.units).sort((a,b)=>b.P-a.P).forEach(u=>L.push(`  ${u.label}: ${fW(u.P)} (${Object.entries(u.rails).map(([n,I])=>n+' '+fA(I)).join(', ')||'손실만'}) · ${u.refs.join(', ')}`));}
  return L.join('\n');}
/* ref → unit from the plan (and the architecture's block labels when given): regenerate the parts to learn each one's block */
function unitsFromPlan(plan,arch){if(!plan||typeof NEWPROJ==='undefined')return null;let parts;try{parts=NEWPROJ.build(plan).parts;}catch(e){return null;}
  const lib=NEWPROJ.LIB||{};const num=id=>String(id||'').replace(/^\D+/,'');const archOf={};
  if(arch&&typeof HWARCH!=='undefined'){try{const T=HWARCH.toPlan(arch);(T.map||[]).forEach(m=>{const a=arch.blocks.find(b=>b.id===m.arch);if(a)archOf[num(m.plan)]={id:'a:'+a.id,label:a.label};});}catch(e){}}
  const out={};parts.forEach(c=>{const b=plan.blocks.find(x=>x.id===c.block);if(!b)return;out[c.ref]=archOf[num(b.id)]||{id:'p:'+b.id,label:(lib[b.type]&&lib[b.type].label)||b.type};});return out;}
return{build,svg,text,unitRows,icRows,unitsFromPlan};
})();
if(typeof module!=='undefined')module.exports=POWERTOPO;
