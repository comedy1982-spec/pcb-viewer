/* ---------- placement / routing jobs (ROUTEJOB) ----------
   The PCB console's place · route · gloss pipelines without any UI: they take a board B, the parsed console arguments a and a
   `ui` object (set(msg) / say(kind,msg) / tick() / stopped() / prog*), and return the report text. The same code runs on the
   main thread (pcbcli.js wraps it with undo, repaint and the progress line) or inside a Web Worker (ROUTEJOB.workerMain —
   the board travels as JSON, the result comes back as a BOARDSNAP), so a long job never freezes the page. */
const ROUTEJOB=(function(){
"use strict";
const f1=v=>(Math.round(v*10)/10).toFixed(1);
function placeText(r,m,scratch){
  const lines=[`${scratch?'회로도 기준 처음부터 ':''}배치 완료 · 전략 ${r.strategy} (${r.label}) · 부품 ${r.moved}개 · 반복 ${r.iters.toLocaleString()}회`];
  if(r.bottom&&r.bottom.length)lines.push(`하단 배치: ${r.bottom.join(', ')}`);
  if(r.fails.length)lines.push(`자리 부족으로 겹칠 수 있는 부품: ${r.fails.join(', ')} → board size로 보드를 키우거나 --strategy compact`);
  lines.push(metricText(m));return lines.join('\n');}
function metricText(m){
  const hp=m.hotPairs[0],hs=m.hotSens[0],ns=m.noiseSens[0];
  return[`신호 배선 추정(HPWL) ${f1(m.hpwl)} mm · 디커플링 캡–전원 핀 평균 ${f1(m.decapAvg)} mm (최대 ${f1(m.decapMax)}) · 부품 면적 ${(m.util*100).toFixed(0)}%`,
    hp?`발열 부품 간 최소 거리 ${hp.a}–${hp.b} ${f1(hp.d)} mm · 열원 분산 반경 ${f1(m.heatSpread)} mm (총 ${m.Ptot.toFixed(2)} W)`:'발열 부품(≥0.1 W) 2개 미만',
    hs?`열에 민감한 부품까지 최소 간격 ${hs.a}→${hs.b} ${f1(hs.d)} mm`:null,
    ns?`스위칭 부품–민감 부품 최소 간격 ${ns.a}↔${ns.b} ${f1(ns.d)} mm`:'스위칭(노이즈원) 부품 없음'].filter(Boolean).join('\n');}
function placeJob(B,a,scratch,ui){
  const st=a.strategy;if(B.pcbPending){scratch=true;B.pcbPending=false;}
  const fixed=(a.fixed||[]).filter(r=>B.byRef[r]);const only=a.only?String(a.only).split(/[,\s]+/).filter(Boolean):null;
  const cleared=AUTOPLACE.clearCopper(B,{keepZones:!scratch&&!!a['keep-zones']});const pour=AUTOPLACE.ensurePour(B);
  let r=AUTOPLACE.place(B,{strategy:st,scratch,seed:a.seed!=null?+a.seed:(scratch?1+Math.floor(Math.random()*1e6):1),both:!!a.both,effort:a.effort?+a.effort:1,fixed,only,power:a.pwrMap||null});
  // parts that found no room: grow the board 10 % at a time (up to 3× the area) and place again — unless --no-grow
  let grown='';if(scratch&&r.fails.length&&a.grow!==false&&!a['no-grow']){const W0=B.W,H0=B.H;let k=0;
    while(r.fails.length&&k<12&&B.W*B.H<W0*H0*3){k++;const W=Math.ceil(B.W*1.1*2)/2,H=Math.ceil(B.H*1.1*2)/2;PCBEDIT.resizeBoard(B,W,H,{anchor:'center'});AUTOPLACE.clearCopper(B);AUTOPLACE.ensurePour(B);
      r=AUTOPLACE.place(B,{strategy:st,scratch:true,seed:a.seed!=null?+a.seed:1+k*7919,both:!!a.both,effort:a.effort?+a.effort:1,fixed,only,power:a.pwrMap||null});}
    if(k)grown=`보드가 ${f1(W0)} × ${f1(H0)} mm로는 부족해 ${f1(B.W)} × ${f1(B.H)} mm로 키웠습니다${r.fails.length?' (그래도 겹치는 부품 있음)':''}.\n`;}
  const m=AUTOPLACE.metrics(B,{power:a.pwrMap||null});
  
  return grown+(cleared.tracks||cleared.vias?`트랙·동박 ${cleared.tracks}개와 비아 ${cleared.vias}개를 지웠습니다.\n`:'')+(pour?`${pour.net} 동박면을 ${pour.layer==='B'?'하단':'상단'}에 깔았습니다.\n`:'')+placeText(r,m,scratch)+(fixed.length?`\n고정 부품: ${fixed.join(', ')}`:'');
}
function fineDepth(B,nets){const want=new Set(nets);const planes=new Set(PCB.stackOf(B).filter(x=>x.net&&x.role!=='sig').map(x=>x.net));const out={};
  const sigNet=n=>n&&want.has(n)&&!planes.has(n)&&!/^(GND|AGND|PGND|DGND)$/i.test(n);
  B.comps.forEach(c=>{const ps=c.pads.filter(p=>!p.drill);if(ps.length<8)return;
    // pitch = most common nearest-neighbour distance; only fine-pitch parts
    const nn=ps.map(p=>Math.min(...ps.filter(q=>q!==p).map(q=>Math.hypot(q.x-p.x,q.y-p.y))));const pitch=nn.slice().sort((a,b)=>a-b)[Math.floor(nn.length/2)];if(!(pitch>0.3&&pitch<=0.66))return;
    const used=new Set();ps.forEach(p0=>{if(used.has(p0))return;
      // grow the straight row through p0 (neighbours at one pitch along the same line)
      const row=[p0];used.add(p0);let grew=true;while(grew){grew=false;for(const q of ps){if(used.has(q))continue;const ends=[row[0],row[row.length-1]];
        for(const e of ends){if(Math.abs(Math.hypot(q.x-e.x,q.y-e.y)-pitch)<pitch*0.2){if(row.length>1){const a=row[0],b=row[row.length-1];const cr=Math.abs((b.x-a.x)*(q.y-a.y)-(b.y-a.y)*(q.x-a.x))/Math.max(1e-6,Math.hypot(b.x-a.x,b.y-a.y));if(cr>pitch*0.3)continue;}
          if(e===row[0])row.unshift(q);else row.push(q);used.add(q);grew=true;break;}}}}
      if(row.length<3)return;
      // runs of consecutive signal pins (different nets); depth = distance to the nearer run end
      let i=0;while(i<row.length){if(!sigNet(row[i].net)){i++;continue;}let j=i;while(j+1<row.length&&sigNet(row[j+1].net)&&row[j+1].net!==row[j].net)j++;
        for(let k=i;k<=j;k++){const d=Math.min(k-i,j-k);const n=row[k].net;if(d>(out[n]||0))out[n]=d;}i=j+1;}});});
  return out;}
async function routeJob(B,a,ui){
  if(B.pcbPending)throw new Error('부품이 아직 배치되지 않았습니다. 먼저 reset(배치) 또는 auto를 실행하세요.');
  const st=a.strategy;
  // multilayer boards use the smaller via of a fine-line process (0.45/0.2 mm, 0.15 mm clearance); 2-layer keeps 0.6/0.3 · 0.2
  const ml=(B.copperLayers||2)>2;const dirCost=a.dir==null?(a.dirDef!=null?a.dirDef:1):(a.dir===false||/^(off|no|0)$/i.test(String(a.dir))?1:Math.max(1,+a.dir||1));const via=a.via?{d:+a.via,drill:+(a.drill||Math.max(0.15,+a.via/2-0.05))}:ml?{d:0.45,drill:0.2}:{d:0.6,drill:0.3};
  const sig=a.signal?+a.signal:0.2,pwr=a.power?+a.power:0.3,clr=a.clear?+a.clear:ml?0.15:0.2;
  // multilayer power-stage board: the bottom layer will carry phase / supply fill (its GND pour is dropped then), and the
  // inner planes are the ground — drop that pour now, so the bottom-side pads get their own plane via before signals route
  if(ml&&B.zones&&B.zones.on!==false&&B.zones.rects&&B.zones.rects.stage&&a.fill!==false&&!a['no-fill']){const kB=PCB.cuKeys(B).slice(-1)[0]+'.cu';B.layers[kB]=B.layers[kB].filter(p=>!(p.t==='pour'&&!p.plane));}
  // fine-pitch pins of plane nets get their via after the signals have escaped
  const fan=AUTOPLACE.fanout(B,{thermal:st==='thermal',clear:clr,width:Math.min(0.4,pwr),via,skipFine:true});
  let nets=AUTOROUTE.openNets(B).map(o=>o.net);
  if(a.nets){const want=new Set(String(a.nets).split(/[,\s]+/));nets=nets.filter(n=>want.has(n));}
  const lines=[`${PCB.stackOf(B).some(x=>x.role==='pwr')?'GND·전원 플레인':'GND'} 팬아웃 비아 ${fan.vias}개${fan.fail.length?` (자리 없음: ${fan.fail.slice(0,6).join(', ')})`:''}`];
  if(!nets.length){const f2=AUTOPLACE.fanout(B,{thermal:st==='thermal',clear:clr,width:Math.min(0.4,pwr),via});lines[0]+=` · 미세 피치 핀 비아 ${f2.vias}개`;PCBEDIT.rebuildNets(B);return lines.concat('배선할 열린 넷이 없습니다.').join('\n');}
  // noise: switching and supply loops first and short, keep the ground plane whole (bottom layer costs more)
  // per-net widths: user overrides always; --iw adds IPC-2221 widths for the current-carrying nets (capped, wider → pour)
  const iw=a.iw!=null?!!a.iw&&a.iw!=='off':!a['no-iw']&&!!(B.newPlan||B.netCurrent);const wCap=a.iwmax?+a.iwmax:(B.oz||1)>=2?3:2;
  const netWidth={};const WW=typeof CURRENT!=='undefined'?CURRENT.widths(B,{oz:B.oz||1,dT:B.dT||10,cap:wCap}):{};
  Object.keys(WW).forEach(n=>{const w=WW[n];if(w.manual)netWidth[n]=w.w;else if(iw&&(w.cls==='rail'||w.cls==='phase')&&w.I>=0.5&&w.ipc>pwr)netWidth[n]=w.w;});
  // high-current nets stay on the top layer (the power-stage copper fill goes there; the bottom keeps the GND plane whole)
  const netBottom={};if(iw)Object.keys(WW).forEach(n=>{const w=WW[n];if(w.I>=3&&(w.cls==='rail'||w.cls==='phase'))netBottom[n]=8;});
  const iwNote=Object.keys(netWidth).length?` · 넷별 폭 ${Object.keys(netWidth).length}개 (${Object.entries(netWidth).slice(0,4).map(([n,w])=>n+' '+w).join(', ')}${Object.keys(netWidth).length>4?' …':''})`+(a.iw?Object.values(WW).some(w=>w.pour&&netWidth[w]===undefined)?'':'':''):'';
  if(iw){const pours=Object.entries(WW).filter(([n,w])=>w.pour&&!w.manual).map(([n,w])=>`${n} ${w.I.toFixed(1)} A → ${w.ipc} mm`);if(pours.length)lines.push(`동박면 권장 (트랙 ${wCap} mm 상한): ${pours.join(' · ')}`);}
  if(iwNote)lines[0]+=iwNote;
  // routing order (ECU practice): ① high-current power/drive → ② clocks·high-speed·differential → ③ sensitive analog → ④ general digital;
  // within a class the shorter net first. --order length keeps the plain shortest-first order.
  let keepOrder=false;const prioOf=n=>AUTOROUTE.netPrio(B,n,WW);
  if(a.order!=='length'){const I=st==='noise'?AUTOPLACE.classify(B,{}):null;const sw=I?new Set(I.switchNets):null;
    // fine-pitch escape (≤ 0.65 mm pitch rows): a pin with signal neighbours on both sides can only leave straight out between
    // them — route a run of such pins from its middle outwards, else the neighbours take both lanes and seal it in (SPI SDO
    // between SCK and SDI). Within a class: deeper pins first, then the shorter net.
    const depth=fineDepth(B,nets);
    nets=nets.map(n=>({n,r:sw&&sw.has(n)?0:prioOf(n),d:depth[n]||0,e:AUTOROUTE.estimate(B,n)})).sort((x,y)=>x.r-y.r||y.d-x.d||x.e-y.e).map(x=>x.n);keepOrder=true;
    {const k=Object.values(depth).filter(v=>v>0).length;if(k)lines.push(`미세 피치 핀 탈출 순서: 가운데 핀부터 ${k}개 넷`);}
    const cnt=[0,0,0,0];nets.forEach(n=>cnt[prioOf(n)]++);lines.push(`배선 순서: ${AUTOROUTE.PRIO_LABEL.map((l,i)=>`${i+1}. ${l} ${cnt[i]}`).join(' → ')}`);}
  const prog=ui.say('out',`배선 준비 중… (${nets.length}개 넷)`);await ui.tick();
  // power stage: the high-current nets are routed first on the top layer, then every other net pays to cross a corridor
  // around them (half the IPC width), so the copper fill added at the end is not cut by signal tracks
  let avoid=null;const PW=iw?powerNets(B,WW):null;
  if(PW&&PW.nets.length){
    // the power nets are routed thin: their width comes from the copper fill (no wide-track attempts that fail and retry)
    PW.nets.forEach(n=>{if(!(WW[n]&&WW[n].manual))delete netWidth[n];});
    // via-in-pad on the big power pads before anything is routed under them (multilayer: planes and the far outer layer)
    if(ml){const pv0=AUTOROUTE.padVias(B,PW.nets,{via:{d:Math.max(via.d,0.6),drill:Math.max(via.drill,0.3)},pitch:0.9});if(pv0)lines.push(`전력 패드 안 비아 ${pv0}개 (평면·아래층으로 전류 분산)`);}
    // the stage is routed locally first, before any corridor exists: power nets, then every net with a pad on a part in the
    // stage region (gate drive, bootstrap, shunt sense) — so a gate pin is never sealed in by the power copper
    const R0=PW.rect,inStage=c=>{const x=(c.bb[0]+c.bb[2])/2,y=(c.bb[1]+c.bb[3])/2;return x>=R0[0]&&x<=R0[2]&&y>=R0[1]&&y<=R0[3];};
    const stageNets=new Set();B.comps.filter(c=>/^(Q|U|R|D|C)\d/.test(c.ref)&&inStage(c)&&c.pads.some(p=>PW.nets.includes(p.net))).forEach(c=>c.pads.forEach(p=>{if(p.net&&!PW.planes.has(p.net)&&!/^(GND|AGND|PGND)$/i.test(p.net))stageNets.add(p.net);}));
    const first=nets.filter(n=>PW.route.includes(n)).concat(nets.filter(n=>!PW.route.includes(n)&&stageNets.has(n)));
    if(first.length){ui.set(`파워스테이지 먼저 배선… (전력 ${PW.route.length} · 구동 ${first.length-PW.route.length})`);await ui.tick();const nb1={};PW.route.forEach(n=>{nb1[n]=20;});B._nb=nb1;
      const pw1=first.filter(n=>PW.route.includes(n)),st1=first.filter(n=>!PW.route.includes(n));
      // power nets on the top layer only (their width comes from the fill there), then the stage's drive nets anywhere
      const NL0=PCB.cuKeys(B).length,avB=ml?[{net:null,r:0,layers:[NL0-1],shapes:[{k:'rect',x:(R0[0]+R0[2])/2,y:(R0[1]+R0[3])/2,hw:(R0[2]-R0[0])/2,hh:(R0[3]-R0[1])/2,ang:0,L:[NL0-1]}]}]:null;
      for(const [list,extra] of [[pw1,{innerCost:30}],[st1,{netBottom:undefined,avoid:avB,avoidCost:6}]]){if(!list.length)continue;const it1=AUTOROUTE.jobRR(B,list,Object.assign({width:{signal:sig,power:pwr},netWidth,widthCap:wCap,netBottom:nb1,W:WW,clear:clr,via,laneVia:ml?2:0,keepOrder:true,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:300000,viaCost:ml?1.2:2,rounds:6},extra));
      for(;;){const q=it1.next();if(q.done)break;if(ui.stopped())break;}}PCBEDIT.rebuildNets(B);}
    const SS=AUTOROUTE.shapesOfBoard(B);const R=PW.rect;const inR=s=>{const x=s.k==='cap'?(s.a[0]+s.b[0])/2:s.x,y=s.k==='cap'?(s.a[1]+s.b[1])/2:s.y;return x>=R[0]-1&&x<=R[2]+1&&y>=R[1]-1&&y<=R[3]+1;};
    const NLc=PCB.cuKeys(B).length;avoid=PW.route.map(n=>({net:n,r:Math.min(4,PW.need[n]/2),layers:ml?[0,NLc-1]:[0],shapes:SS.filter(s=>s.net===n&&s.L.includes(0)&&!s.via&&!s.hole&&inR(s))}));
    if(B.powerBus&&B.nets[B.powerBus.net]){const b=B.powerBus.rect;avoid.push({net:B.powerBus.net,r:0.2,layers:[0],shapes:[{k:'rect',x:(b[0]+b[2])/2,y:(b[1]+b[3])/2,hw:(b[2]-b[0])/2,hh:(b[3]-b[1])/2,ang:0,L:[0]}]});}
    // multilayer: the bottom layer of the whole stage ∪ input region carries phase / supply copper — every other net pays
    // to cross it there (it has the inner signal layers), so a single signal track cannot cut the phase fill in two
    if(ml){const r=PW.rect;avoid.push({net:null,r:0,layers:[NLc-1],shapes:[{k:'rect',x:(r[0]+r[2])/2,y:(r[1]+r[3])/2,hw:(r[2]-r[0])/2,hh:(r[3]-r[1])/2,ang:0,L:[NLc-1]}]});}
    B._avoid=avoid;
    const done=new Set(first.filter(n=>!AUTOROUTE.openNets(B,x=>x===n).length));nets=nets.filter(n=>!done.has(n));}
  else{B._avoid=null;B._nb=null;}
  const edgeBand=a.edge===false||a['no-edge']?0:(a.edge!=null&&isFinite(+a.edge)?+a.edge:2);
  // parallel pass: the plain signal nets (analog · general digital) whose pads sit inside one strip of the board are routed in
  // Web Workers, one strip each, with the search confined to the strip — nothing two workers do can collide. Power, clocks and
  // the nets that span strips stay on the main thread afterwards, with rip-up over everything (the workers' copper included).
  const K=ui.par?ui.par.count(a):0;if(K>=2&&nets.length>=12&&!ui.stopped()){const cand=nets.filter(n=>prioOf(n)>=2);const R=ui.par.regions(B,cand,K,1.5);
    if(R&&R.groups.length>=2){ui.set(`병렬 배선 준비… (워커 ${R.groups.length} · 지역 넷 ${R.groups.reduce((x,g)=>x+g.nets.length,0)})`);await ui.tick();const tP=performance.now();
      const board=AUTOROUTE.pack(B);const optsW={rounds:4,width:{signal:sig,power:pwr},netWidth,widthCap:wCap,netBottom,avoid,avoidCost:6,W:WW,edgeBand,edgeCost:1.5,clear:clr,via,laneVia:ml?2:0,keepOrder:true,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?600000:300000),bottomCost:st==='noise'?1.6:1.05,viaCost:(B.copperLayers||2)>2?1.2:2,dirCost,mst:a.mst===true||a.mst===true,sealLim:a.seal!=null?+a.seal:undefined,...(a.grid?{grid:+a.grid}:{})};
      let out=null;try{out=await Promise.all(R.groups.map((g,i)=>ui.par.run({id:i,cmd:'route',board,nets:g.nets,opts:optsW,region:g.rect})));}catch(e){lines.push('병렬 배선 건너뜀: '+(e.message||e));}
      if(out){let nt=0,nv=0,okN=0;const routed=new Set();out.forEach((o,i)=>{o.tracks.forEach(t=>{const side=t._side;delete t._side;B.layers[side+'.cu'].push(t);nt++;});o.vias.forEach(v=>{B.vias.push(v);nv++;});(o.res&&o.res.results||[]).forEach(r=>{if(r.ok){okN++;routed.add(r.net);}});});
        PCBEDIT.rebuildNets(B);const still=new Set(AUTOROUTE.openNets(B).map(o=>o.net));nets=nets.filter(n=>still.has(n));
        lines.push(`병렬 배선: 워커 ${R.groups.length}개 (${R.groups.map(g=>g.nets.length).join('+')} 넷 · 전역 ${R.global.length}) → ${okN}개 연결 · 트랙 ${nt} · 비아 ${nv} · ${((performance.now()-tP)/1000).toFixed(1)} s (워커 안 ${out.map(o=>(o.ms/1000).toFixed(1)).join('/')} s)`);}}}
  const it=AUTOROUTE.jobRR(B,nets,{rounds:a.rounds!=null?+a.rounds:(PW&&PW.nets.length?8:undefined),width:{signal:sig,power:pwr},netWidth,widthCap:wCap,netBottom,avoid,avoidCost:6,W:WW,edgeBand,edgeCost:1.5,clear:clr,via,laneVia:ml?2:0,keepOrder,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?600000:300000),bottomCost:st==='noise'?1.6:1.05,viaCost:(B.copperLayers||2)>2?1.2:2,dirCost,mst:a.mst===true||a.mst===true,sealLim:a.seal!=null?+a.seal:undefined,...(a.grid?{grid:+a.grid}:{})});
  const t0=performance.now();let r,last=performance.now();
  for(;;){r=it.next();if(r.done)break;const p=r.value;
    if(performance.now()-last>80){ui.set(p.phase==='route'?`배선 중… ${p.i+1}/${p.total} · ${p.net}`:`막힌 넷 다시 배선 ${p.round}/${p.max} · ${p.net} (완료 ${p.ok}/${p.total})`);await ui.tick();last=performance.now();}
    if(ui.stopped()){ui.set('중지했습니다. 지금까지의 배선을 남깁니다.');break;}}
  // stage 2 — PathFinder (negotiated congestion): the nets still open are routed through the congestion and every net
  // that then shares a cell is re-routed with rising congestion prices until the conflicts are gone
  let pfNote='';if(!a['no-pf']&&a.pf!==false&&!ui.stopped()){PCBEDIT.rebuildNets(B);const open1=AUTOROUTE.openNets(B).filter(o=>nets.includes(o.net)).length;
    if(open1){ui.set(`협상 배선(PathFinder) 준비… 미배선 ${open1}개`);await ui.tick();
      const it3=AUTOROUTE.jobPF(B,nets,{width:{signal:sig,power:pwr},netWidth,widthCap:wCap,netBottom,avoid,avoidCost:6,W:WW,edgeBand,edgeCost:1.5,clear:clr,via,laneVia:ml?2:0,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?600000:300000),bottomCost:st==='noise'?1.6:1.05,viaCost:(B.copperLayers||2)>2?1.2:2,dirCost,mst:a.mst===true||a.mst===true,sealLim:a.seal!=null?+a.seal:undefined,...(a.grid?{grid:+a.grid}:{}),pfRounds:a['pf-rounds']?+a['pf-rounds']:(PW&&PW.nets.length?8:14),pfTimeMs:a['pf-time']?+a['pf-time']*1000:(PW&&PW.nets.length?30000:90000)});
      let r3,last3=performance.now();for(;;){r3=it3.next();if(r3.done)break;const p=r3.value;
        if(performance.now()-last3>80){ui.set(`협상 배선 라운드 ${p.round}/${p.max} · ${p.i+1}/${p.total} ${p.net} (충돌 ${p.conflicts} · 미배선 ${p.open})`);await ui.tick();last3=performance.now();}
        if(ui.stopped())break;}
      PCBEDIT.rebuildNets(B);const v=r3&&r3.done?r3.value:null;const open2=AUTOROUTE.openNets(B).filter(o=>nets.includes(o.net)).length;
      pfNote=`협상 배선(PathFinder): 미배선 ${open1} → ${open2}${v?` · 라운드 ${v.rounds} · ${(v.ms/1000).toFixed(1)} s${v.dropped?` · 충돌 잔류 ${v.dropped}`:''}`:''}`;lines.push(pfNote);}}
  const fan2=AUTOPLACE.fanout(B,{thermal:st==='thermal',clear:clr,width:Math.min(0.4,pwr),via});fan.vias+=fan2.vias;fan.fail=fan2.fail;lines[0]=`${PCB.stackOf(B).some(x=>x.role==='pwr')?'GND·전원 플레인':'GND'} 팬아웃 비아 ${fan.vias}개${fan.fail.length?` (자리 없음: ${fan.fail.slice(0,6).join(', ')})`:''}${ml?` · 비아 ${via.d}/${via.drill} mm · 간격 ${clr} mm`:''}`;
  PCBEDIT.rebuildNets(B);const res=r&&r.done?r.value:null;const ms=performance.now()-t0;
  lines[0]+=AUTOROUTE.WASM&&AUTOROUTE.WASM.mod?' · WebAssembly 커널':' · JS 커널'+(AUTOROUTE.WASM&&AUTOROUTE.WASM.err?' ('+AUTOROUTE.WASM.err+')':'');
  let open=AUTOROUTE.openNets(B).filter(o=>nets.includes(o.net));
  // wide nets that did not fit: route them once more at the base width and say so (the user can pour copper instead)
  const wideOpen=open.map(o=>o.net).filter(n=>netWidth[n]>pwr&&!ui.stopped());
  if(wideOpen.length){ui.set(`폭을 줄여 다시 배선… (${wideOpen.join(', ')})`);await ui.tick();const nw2=Object.assign({},netWidth);wideOpen.forEach(n=>{nw2[n]=pwr;});
    const it2=AUTOROUTE.jobRR(B,wideOpen,{width:{signal:sig,power:pwr},netWidth:nw2,clear:clr,via,laneVia:ml?2:0,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?600000:300000),bottomCost:st==='noise'?1.6:1.05,viaCost:(B.copperLayers||2)>2?1.2:2,dirCost,mst:a.mst===true||a.mst===true,sealLim:a.seal!=null?+a.seal:undefined,...(a.grid?{grid:+a.grid}:{}),rounds:4});
    for(;;){const q=it2.next();if(q.done)break;}PCBEDIT.rebuildNets(B);const still=new Set(AUTOROUTE.openNets(B).map(o=>o.net));const narrowed=wideOpen.filter(n=>!still.has(n));
    if(narrowed.length)lines.push(`넓은 폭으로 자리가 없어 기본 폭으로 배선: ${narrowed.map(n=>`${n} (${netWidth[n]} → ${pwr} mm)`).join(', ')} → 동박면(pour)으로 보강하거나 보드를 키우세요`);
    open=AUTOROUTE.openNets(B).filter(o=>nets.includes(o.net));}
  // supplies that still could not leave a fine-pitch pin (a 0.3 mm supply track does not fit a 0.5 mm pitch): once more at signal width
  const thinOpen=open.map(o=>o.net).filter(n=>!ui.stopped()&&!(PW&&PW.nets.includes(n)));
  if(thinOpen.length){ui.set(`미세 피치 핀에서 신호 폭으로 다시 배선… (${thinOpen.join(', ')})`);await ui.tick();const nw3=Object.assign({},netWidth);thinOpen.forEach(n=>{delete nw3[n];});
    const snap3=AUTOROUTE.copperSnap(B);const r0=PCBEDIT.ratsnest(B,thinOpen).length;AUTOROUTE.unroute(B,thinOpen);PCBEDIT.rebuildNets(B);
    const it4=AUTOROUTE.jobRR(B,thinOpen,{width:{signal:sig,power:sig},netWidth:nw3,clear:clr,via,laneVia:ml?2:0,keepOrder:true,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?1500000:600000),viaCost:(B.copperLayers||2)>2?1.2:2,dirCost,rounds:4});
    for(;;){const q=it4.next();if(q.done)break;}PCBEDIT.rebuildNets(B);const r1=PCBEDIT.ratsnest(B,thinOpen).length;
    if(r1>r0){AUTOROUTE.copperRestore(B,snap3);PCBEDIT.rebuildNets(B);}else{const still=new Set(AUTOROUTE.openNets(B).map(o=>o.net));const fixed=thinOpen.filter(n=>!still.has(n));
      if(fixed.length)lines.push(`미세 피치 핀 탈출 — 신호 폭 ${sig} mm로 다시 배선: ${fixed.join(', ')}`);}
    open=AUTOROUTE.openNets(B).filter(o=>nets.includes(o.net));}
  const stopped=!!ui.stopped();ui.set(`${stopped?'중지함 — ':''}배선 ${nets.length-open.length}/${nets.length} 넷 · ${(ms/1000).toFixed(1)} s${res?` · 트랙 ${f1(res.len)} mm · 비아 ${res.vias}개${res.rounds?` · 다시 배선 ${res.rounds}회`:''}`:''}`);
  if(open.length)lines.push(`미배선 ${open.length}개: ${open.slice(0,10).map(o=>o.net).join(', ')}${open.length>10?' …':''} → place로 간격을 바꾸거나 board size로 보드를 키우고 다시 route`);
  // return vias next to the layer changes of clock / analog nets
  if(!a['no-retvia']&&a.retvia!==false){const rv=AUTOROUTE.returnVias(B,{dist:a.retvia&&isFinite(+a.retvia)?+a.retvia:0.8,clear:clr,via,W:WW});if(rv.added||rv.skipped)lines.push(`리턴(GND) 비아 ${rv.added}개 추가 — 고속·아날로그 넷 층 전환 옆${rv.skipped?` · 자리 없음 ${rv.skipped}개`:''}`);PCBEDIT.rebuildNets(B);}
  
  // post-optimisation (via reduction) only on request: --gloss, or the gloss command / [비아 줄이기] chip afterwards — it costs about as much as the routing itself
  const wantGloss=a.gloss===true||/^(1|on|yes)$/i.test(String(a.gloss||''));
  if(wantGloss&&!a['no-gloss']&&!a.inFix&&!ui.stopped()&&nets.length){try{const g=await glossJob(B,{par:a.par,fixedPar:a.fixedPar},ui,true);if(g)lines.push(g);}catch(e){lines.push('사후 최적화 건너뜀: '+(e.message||e));}}
  else if(!a.inFix&&nets.length&&B.vias.some(v=>v.auto&&!v.fan))lines.push('비아 줄이기(사후 최적화)는 생략 — 필요하면 gloss 명령 또는 [비아 줄이기] 버튼');
  if(iw&&a.fill!==false&&!a['no-fill']&&!ui.stopped()){try{const fl=powerFill(B,WW,clr,via);if(fl)lines.push(fl);}catch(e){lines.push('전력 동박 채우기 건너뜀: '+(e.message||e));}}
  // pads of plane nets still without a via (dense double-sided boards): one more fan-out pass that looks further for room
  if(!ui.stopped()&&ml&&AUTOPLACE.fanout){const pl=new Set(PCB.stackOf(B).filter(x=>x.net&&x.role!=='sig').map(x=>x.net));if(PCBEDIT.ratsnest(B).some(r=>pl.has(r.net))){const f3=AUTOPLACE.fanout(B,{clear:clr,width:0.25,via,reach:4});if(f3.vias)lines.push(`평면 비아 ${f3.vias}개 추가 (멀리 찾은 자리)`);}}
  if(!ui.stopped()&&AUTOROUTE.bridgeRats){try{const br=AUTOROUTE.bridgeRats(B,{clear:clr,width:Math.min(0.25,pwr)});if(br.added)lines.push(`짧은 미연결 ${br.added}개를 같은 층 트랙으로 직접 연결`);}catch(e){}}
  const d=PCBEDIT.drc(B).length,rats=PCBEDIT.ratsnest(B).length;lines.push(`DRC ${d}건 · 래츠네스트 ${rats}개`);
  return lines.join('\n');
}
function powerNets(B,WW){if(typeof AUTOROUTE==='undefined'||!AUTOROUTE.powerFill)return null;const oz=B.oz||1,dT=B.dT||10;
  const nets=Object.keys(WW).filter(n=>WW[n].I>=3&&/^(rail|phase|gnd)$/.test(WW[n].cls)&&WW[n].ipc>0.6&&B.nets[n]);if(!nets.length)return null;
  let rect=null;const Z=B.zones&&B.zones.on!==false&&AUTOPLACE.zonesFit?AUTOPLACE.zonesFit(B):null;
  if(Z&&Z.rects&&Z.rects.stage){const rs=[Z.rects.stage,Z.rects.input].filter(Boolean);rect=[Math.min(...rs.map(r=>r[0])),Math.min(...rs.map(r=>r[1])),Math.max(...rs.map(r=>r[2])),Math.max(...rs.map(r=>r[3]))];}
  else{const ps=B.comps.filter(c=>/^(Q|J|CP)\d/.test(c.ref)&&c.pads.some(p=>nets.includes(p.net)));if(!ps.length)return null;rect=[Math.min(...ps.map(c=>c.bb[0]))-3,Math.min(...ps.map(c=>c.bb[1]))-3,Math.max(...ps.map(c=>c.bb[2]))+3,Math.max(...ps.map(c=>c.bb[3]))+3];}
  const need={};nets.forEach(n=>{need[n]=WW[n].ipc!=null?WW[n].ipc:CURRENT.ipcWidth(WW[n].I,{oz,dT});});
  const planes=new Set(PCB.stackOf(B).filter(x=>x.net&&x.role!=='sig').map(x=>x.net));
  return{nets,rect,need,planes,route:nets.filter(n=>WW[n].cls!=='gnd'&&!planes.has(n))};}
function powerFill(B,WW,clr,via){if(typeof AUTOROUTE==='undefined'||!AUTOROUTE.powerFill)return'';const oz=B.oz||1,dT=B.dT||10;
  const PW=powerNets(B,WW);if(!PW||!PW.nets.length)return'';const hi=PW.nets,rect=PW.rect;const keys=PCB.cuKeys(B),NL=keys.length,ml=NL>2;
  via=via||(ml?{d:0.45,drill:0.2}:{d:0.6,drill:0.3});const cl=Math.max(ml?0.2:0.25,clr||0.2);
  // nets whose power terminals already touch (shunt right on the FET source) need no fill
  const BP0=AUTOROUTE.bottleneckPrep(B);const direct=hi.filter(n=>{if(WW[n].cls==='gnd'||PW.planes.has(n))return false;const b=AUTOROUTE.bottleneck(B,n,{P:BP0});return b.terms.length>=2&&!b.open&&b.width==null;});
  AUTOROUTE.releaseGrid(BP0.G);  const fillNets=hi.filter(n=>!direct.includes(n));const width={};fillNets.forEach(n=>{if(!PW.planes.has(n)&&WW[n].cls!=='gnd')width[n]=PW.need[n];});
  // multilayer: GND / supply are inner planes, so both outer layers carry the other power nets (phases, input); the bottom GND
  // pour of a 2-layer board stays and only the top is filled
  const pv=ml?AUTOROUTE.padVias(B,hi,{via:{d:Math.max(via.d,0.6),drill:Math.max(via.drill,0.3)},pitch:0.9}):0; // power pads: 0.6 / 0.3 mm vias carry ~1.5× a 0.45 / 0.2 one
  const layers=ml?[0,NL-1]:[0];let refan=0;
  if(ml){const had=B.layers[keys[NL-1]+'.cu'].some(p=>p.t==='pour'&&!p.plane);B.layers[keys[NL-1]+'.cu']=B.layers[keys[NL-1]+'.cu'].filter(p=>!(p.t==='pour'&&!p.plane));
    // bottom-side pads counted on that pour (no via of their own) now need one down to their inner plane
    if(had&&AUTOPLACE.fanout){const f=AUTOPLACE.fanout(B,{clear:cl,width:0.3,via});refan=f.vias;}}
  const fs=layers.map(l=>AUTOROUTE.powerFill(B,{nets:fillNets,rect,clr:cl,via,width,layer:l,claim:B.powerBus&&B.nets[B.powerBus.net]&&l===0?[B.powerBus]:[]}));
  const tb=ml?AUTOROUTE.stitchLayers(B,fillNets.filter(n=>!PW.planes.has(n)&&WW[n].cls!=='gnd'),{via}):0;
  const pr=AUTOROUTE.pruneIslands?AUTOROUTE.pruneIslands(B,hi):{fills:0,vias:0};
  const BP1=AUTOROUTE.bottleneckPrep(B);const rep=[];hi.forEach(n=>{if(WW[n].cls==='gnd'||PW.planes.has(n))return;const need=WW[n].ipc!=null?WW[n].ipc:CURRENT.ipcWidth(WW[n].I,{oz,dT});const pk=WW[n].pk||null;
    const bs=layers.map(l=>AUTOROUTE.bottleneck(B,n,{layer:l,proj:l!==0,P:BP1}));const dir=bs[0].terms.length>=2&&!bs[0].open&&bs[0].width==null;
    const ws=bs.map(b=>b.width!=null&&!b.open?b.width:0);const eff=+ws.reduce((x,y)=>x+y,0).toFixed(2);
    rep.push({net:n,I:WW[n].I,width:dir?'직결':eff,layers:ws,open:bs[0].open,need,ok:dir||eff>=need*0.95,rise:!dir&&eff?CURRENT.ipcRise(eff,WW[n].I,{oz}):null,pk:pk?{I:pk.I,t:pk.t,rise:!dir&&eff?CURRENT.peakRise(eff,pk.I,pk.t,{oz,tb:B.t}):null}:null,by:WW[n].by,terms:bs[0].terms});});
  const area={};fs.forEach((f,i)=>f.area.forEach(x=>{area[x.net]=(area[x.net]||0)+x.mm2;}));
  // vias at each power terminal (current changing layers) and the inner planes, at the continuous and the peak current
  const Ic={},Pk={};hi.forEach(n=>{Ic[n]=WW[n].I;if(WW[n].pk)Pk[n]=WW[n].pk;});// share of a net's current that has to change layers at a terminal: top + bottom copper in parallel → the bottom share; a plane net
  // also reachable on the top copper → half; nets whose terminals touch directly need none
  const share={};hi.forEach(n=>{const x=rep.find(q=>q.net===n);if(x){share[n]=x.width==='직결'?0:(x.layers&&x.layers.length>1&&(x.layers[0]+x.layers[1])>0?x.layers[1]/(x.layers[0]+x.layers[1]):1);return;}
    let top=null;try{const b=AUTOROUTE.bottleneck(B,n,{layer:0,P:BP1});top=b&&!b.open&&b.width>0?b.width:null;}catch(e){}share[n]=top?0.5:1;});
  AUTOROUTE.releaseGrid(BP1.G);  let VC=ml&&CURRENT.viaCheck?CURRENT.viaCheck(B,{nets:hi,I:Ic,pk:Pk,share}):[];
  // terminals whose vias run too hot: add 0.6 / 0.3 mm vias in the net's copper around them (to the bottom copper, or down to the
  // net's plane), widening the search once; then check again
  let farm=0;if(ml&&VC.some(v=>!v.ok)&&AUTOROUTE.stitchLayers){const pv={d:0.6,drill:0.3};
    for(const R of [2.5,4]){const bad=VC.filter(v=>!v.ok);if(!bad.length)break;
      bad.forEach(v=>{const c=B.byRef?B.byRef[v.ref]:B.comps.find(q=>q.ref===v.ref);if(!c)return;const ps=c.pads.filter(p=>p.net===v.net);if(!ps.length)return;
        const rects=ps.map(p=>{const h=Math.max(p.w,p.h)/2+R;return[p.x-h,p.y-h,p.x+h,p.y+h];});const plane=PW.planes.has(v.net)||WW[v.net].cls==='gnd';
        try{farm+=AUTOROUTE.stitchLayers(B,[v.net],{via:pv,step:0.9,la:0,lb:plane?0:NL-1,rects});}catch(e){}});
      VC=CURRENT.viaCheck(B,{nets:hi,I:Ic,pk:Pk,share});}}const PC=ml&&CURRENT.planeCheck?CURRENT.planeCheck(B,{I:Ic,pk:Pk}):[];
  B.powerReport={oz,dT,nets:rep,fill:area,vias:fs.reduce((a,f)=>a+f.vias,0)+tb+pv-pr.vias,padVias:pv,pruned:pr,planes:[...PW.planes],viaChk:VC,planeChk:PC,viaFarm:farm,at:Date.now()};
  const bad=rep.filter(x=>!x.ok);const vworst={};VC.forEach(v=>{const w=vworst[v.net];if(!w||(!v.ok&&w.ok)||(v.ok===w.ok&&(v.rise+v.riseP)>(w.rise+w.riseP)))vworst[v.net]=v;});const vbad=VC.filter(v=>!v.ok);
  return`전력 동박(${oz} oz · 상시 ΔT ${dT} °C${Object.keys(B.netPeak||{}).length?` · 피크 ΔT ${B.dTpk||40} °C`:''} · ${ml?'위·아래층':'위층'}${PW.planes.size?' · 평면 '+[...PW.planes].join(', '):''}): ${Object.entries(area).map(([n,a])=>n+' '+a.toFixed(0)+' mm²').join(' · ')} · 스티칭 비아 ${B.powerReport.vias}개 (패드 안 ${pv})${pr.fills?` · 고립 동박 ${pr.fills}조각 제거`:''}${refan?` · 아래층 패드 평면 비아 ${refan}개`:''}\n`+
    rep.map(x=>`  ${x.ok?'✓':'✕'} ${x.net} 상시 ${x.I} A${x.pk?` · 피크 ${x.pk.I} A ${x.pk.t} s`:''} — 유효 폭 ${typeof x.width==='string'?x.width:x.width+' mm'+(x.layers&&x.layers.length>1?` (위 ${x.layers[0]} + 아래 ${x.layers[1]})`:'')}${x.open?' (위층 단자 사이 끊김)':''} / 필요 ${x.need} mm${x.by==='peak'?' (피크 기준)':''}${x.rise!=null?` → 상시 +${Math.min(999,x.rise)} °C`:''}${x.pk&&x.pk.rise!=null?` · 피크 끝 +${Math.min(999,+(x.rise+x.pk.rise).toFixed(1))} °C (한도 ${B.dTpk||40})`:''}`).join('\n')+
    (PC.length?'\n  내층 평면 (1 oz · 단면 ≈ 보드 짧은 변 ½ × 층 수): '+PC.map(x=>`${x.ok?'✓':'✕'} ${x.net} ${x.layers}층 ${x.w} mm — 상시 +${x.rise} °C${x.pk?` · 피크 끝 +${+(x.rise+x.riseP).toFixed(1)} °C`:''}`).join(' · '):'')+
    (Object.keys(vworst).length?`\n  단자 비아 (층을 바꾸는 몫 · 가장 나쁜 단자, 도금 25 µm${farm?` · 부족한 단자에 0.6/0.3 mm 비아 ${farm}개 추가`:''}): `+Object.values(vworst).map(v=>v.lead?`✓ ${v.net} ${v.ref} 관통 리드`:v.n?`${v.ok?'✓':'✕'} ${v.net} ${v.ref} ${v.n}개${v.th?`(관통 ${v.th})`:''} ⌀${v.drill} · 몫 ${Math.round(v.share*100)}% — ${v.Iv} A/개 +${v.rise} °C${v.Ivpk!=null?` · 피크 ${v.Ivpk} A/개 끝 +${+(v.rise+v.riseP).toFixed(1)} °C`:''}`:`✕ ${v.net} ${v.ref} 비아 없음`).join(' · '):'')+
    (bad.length?`\n→ 전류 경로 부족 ${bad.length}개: 보드를 키우거나(board size) 층을 늘리세요(board layers)`:'')+(vbad.length?`\n→ 비아 부족 ${vbad.length}곳: ${vbad.slice(0,6).map(v=>v.net+' '+v.ref).join(', ')} — 패드 옆 비아를 늘리세요`:'');}
async function glossJob(B,a,ui,quiet){a=a||{};if(B.pcbPending)throw new Error('배치·배선 뒤에 실행하세요.');
  const ml=(B.copperLayers||2)>2;const via=ml?{d:0.45,drill:0.2}:{d:0.6,drill:0.3};const clr=a.clear?+a.clear:ml?0.15:0.2;const sig=a.signal?+a.signal:0.2,pwr=a.power?+a.power:0.3;
  const WW=typeof CURRENT!=='undefined'?CURRENT.widths(B,{oz:B.oz||1,dT:B.dT||10,cap:a.iwmax?+a.iwmax:2}):{};const netWidth={};Object.keys(WW).forEach(n=>{if(WW[n].manual)netWidth[n]=WW[n].w;});
  const nets=[...new Set(PCB.cuKeys(B).flatMap(L=>B.layers[L+'.cu'].filter(p=>p.auto&&!p.fan&&p.net).map(p=>p.net)).concat(B.vias.filter(v=>v.auto&&!v.fan&&v.net).map(v=>v.net)))];
  if(!nets.length)return'자동 배선한 넷이 없습니다.';
  const prog=ui.say('out',`사후 최적화 준비… (${nets.length}개 넷)`);await ui.tick();const pid=ui.prog?ui.prog('gloss','사후 최적화 (비아 감축)',{total:nets.length}):null;
  // parallel: nets local to one strip of the board are re-routed in workers confined to their strip; the rest on the main thread
  let glossNets=nets;const K=ui.par?ui.par.count(a,true):0;let parLine='';if(K>=2&&nets.length>=12&&!ui.stopped()){const R=ui.par.regions(B,nets,K,1.5);
    if(R&&R.groups.length>=2){ui.set(`병렬 사후 최적화… (워커 ${R.groups.length})`);await ui.tick();const tP=performance.now();const board=AUTOROUTE.pack(B);
      const optsW={avoid:B._avoid||undefined,avoidCost:6,netBottom:B._nb||undefined,width:{signal:sig,power:pwr},netWidth,widthCap:a.iwmax?+a.iwmax:2,W:WW,clear:clr,via,laneVia:ml?2:0,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:120000,viaCost:ml?1.2:2,glossPasses:a.passes?+a.passes:1,glossVia:a.via!=null&&a.via!==true?+a.via:3,glossAll:!!a.all,glossTimeMs:a.time?+a.time*1000:60000};
      let out=null;try{out=await Promise.all(R.groups.map((g,i)=>ui.par.run({id:i,cmd:'gloss',board,nets:g.nets,opts:optsW,region:g.rect})));}catch(e){parLine='병렬 사후 최적화 건너뜀: '+(e.message||e);}
      if(out){let nc=0;out.forEach(o=>{const cs=new Set(o.changed);if(!cs.size)return;PCB.cuKeys(B).forEach(k=>{B.layers[k+'.cu']=B.layers[k+'.cu'].filter(p=>!(p.auto&&!p.fan&&cs.has(p.net)));});B.vias=B.vias.filter(v=>!(v.auto&&!v.fan&&cs.has(v.net)));
          o.tracks.forEach(t=>{const side=t._side;delete t._side;B.layers[side+'.cu'].push(t);});o.vias.forEach(v=>B.vias.push(v));nc+=cs.size;});
        PCBEDIT.rebuildNets(B);glossNets=R.global;parLine=`병렬 사후 최적화: 워커 ${R.groups.length}개 (${R.groups.map(g=>g.nets.length).join('+')} 넷) → ${nc}개 개선 · ${((performance.now()-tP)/1000).toFixed(1)} s (워커 안 ${out.map(o=>(o.ms/1000).toFixed(1)).join('/')} s) · 전역 ${R.global.length}개는 이어서`;}}}
  if(parLine)ui.say('out',parLine);
  const it=AUTOROUTE.gloss(B,glossNets,{avoid:B._avoid||undefined,avoidCost:6,netBottom:B._nb||undefined,width:{signal:sig,power:pwr},netWidth,widthCap:a.iwmax?+a.iwmax:2,W:WW,clear:clr,via,laneVia:ml?2:0,reserve:0.6,neck:0.25,maxExp:a.exp?+a.exp:(ml?600000:300000),viaCost:ml?1.2:2,glossPasses:a.passes?+a.passes:1,glossVia:a.via!=null&&a.via!==true?+a.via:3,glossAll:!!a.all,glossTimeMs:a.time?+a.time*1000:60000});
  let r,last=performance.now();try{for(;;){r=it.next();if(r.done)break;const p=r.value;if(performance.now()-last>80){ui.set(`사후 최적화 ${p.pass}/${p.passes} · ${p.i+1}/${p.total} ${p.net} (개선 ${p.changed})`);if(pid)ui.progSet('gloss',{i:p.i,label:`사후 최적화 · ${p.net} (개선 ${p.changed})`});await ui.tick();last=performance.now();}if(ui.stopped())break;}}
  finally{if(pid)ui.progEnd('gloss');}
  PCBEDIT.rebuildNets(B);const v=r&&r.done?r.value:null;if(!v)return'중지했습니다.';
  ui.set(`사후 최적화: 비아 ${v.vias[0]} → ${v.vias[1]} · 트랙 ${f1(v.len[0])} → ${f1(v.len[1])} mm · 넷 ${v.changed}/${v.tried} 개선 · ${(v.ms/1000).toFixed(1)} s`);
  
  const line=(parLine?parLine+'\n':'')+`사후 최적화: 비아 ${v.vias[0]} → ${v.vias[1]} (${v.vias[0]?Math.round((1-v.vias[1]/Math.max(1,v.vias[0]))*100):0}% 감소) · 트랙 ${f1(v.len[0])} → ${f1(v.len[1])} mm · 넷 ${v.changed}개 개선`;return quiet?line:line+` · DRC ${PCBEDIT.drc(B).length}건`;}

/* ---- worker side: {cmd:'job', kind:'place'|'route'|'gloss', board (boardToJSON), a} → {snap, extra, text} ---- */
function boardToJSON(B){const skip=new Set(['nets','byRef','netClass','_pe','_dr','demo','files','guide','notes','warnings']);const cls={};Object.keys(B.nets||{}).forEach(n=>{cls[n]=B.netClass?B.netClass(n):null;});
  const o={};Object.keys(B).forEach(k=>{if(!skip.has(k))o[k]=B[k];});o.__netClass=cls;
  return JSON.stringify(o,(k,v)=>{if(typeof v==='function')return undefined;if(k==='own'||k==='_pad'||k==='_dr')return undefined;return v;});}
function boardFromJSON(s){const B=JSON.parse(s);const cls=B.__netClass||{};delete B.__netClass;B.warnings=[];B.notes=[];B.files=[];
  // the pad prims on the copper layers are the very objects in comps[].pads (moving a part moves them): JSON made copies, re-link them
  const padOf=new Map();const key=p=>p.ref+'|'+p.n+'|'+(+p.x).toFixed(4)+'|'+(+p.y).toFixed(4);B.comps.forEach(c=>c.pads.forEach(p=>padOf.set(key(p),p)));
  Object.keys(B.layers).forEach(k=>{B.layers[k]=B.layers[k].map(p=>p&&p.t==='pad'&&p.ref!=null?(padOf.get(key(p))||p):p);});
  B.netClass=n=>cls[n]||(/^(GND|AGND|DGND|PGND|VSS)$/i.test(String(n||''))?'접지':'신호');B.byRef={};B.comps.forEach(c=>{B.byRef[c.ref]=c;});PCBEDIT.prepare(B);PCBEDIT.rebuildNets(B);return B;}
async function runJob(B,kind,a,ui){ui=ui||{};const U={set:ui.set||(()=>{}),say:ui.say||((k,t)=>({k,t})),tick:ui.tick||(()=>Promise.resolve()),stopped:ui.stopped||(()=>false),prog:ui.prog||null,progSet:ui.progSet||(()=>{}),progEnd:ui.progEnd||(()=>{}),par:ui.par||null};
  if(kind==='place')return placeJob(B,a,!!a.scratch,U);if(kind==='route')return await routeJob(B,a,U);if(kind==='gloss')return await glossJob(B,a,U,!!a.quiet);throw new Error('unknown job '+kind);}
function workerMain(){self.onmessage=e=>{const m=e.data;const go=async()=>{try{
    if(m.cmd!=='job')throw new Error('unknown cmd');if(typeof AUTOROUTE!=='undefined'&&AUTOROUTE.wasmInit)await AUTOROUTE.wasmInit();
    const B=boardFromJSON(m.board);let last=0;const ui={set:t=>{const now=Date.now();if(now-last>60){last=now;self.postMessage({id:m.id,prog:t});}},say:(k,t)=>({k,t}),tick:()=>Promise.resolve(),stopped:()=>false,prog:null};
    const text=await runJob(B,m.kind,m.a,ui);const snap=BOARDSNAP.save(B,{});let rats=null,drc=null;try{rats=PCBEDIT.ratsnest(B);drc=PCBEDIT.drc(B).map(d=>Object.assign({},d,{refs:d.refs||[]}));}catch(e){}
    const extra={W:B.W,H:B.H,zones:B.zones||null,_avoid:B._avoid||null,_nb:B._nb||null,pcbPending:!!B.pcbPending,copperLayers:B.copperLayers,stack:B.stack||null,rats,drc};
    self.postMessage({id:m.id,ok:true,text,snap,extra});}
  catch(err){self.postMessage({id:m.id,ok:false,err:String(err&&err.stack||err)});}};go();};}
return{placeJob,placeText,metricText,fineDepth,routeJob,powerNets,powerFill,glossJob,runJob,boardToJSON,boardFromJSON,workerMain};
})();
if(typeof module!=='undefined')module.exports=ROUTEJOB;
