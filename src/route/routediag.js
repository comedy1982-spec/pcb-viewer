/* ---------- routing diagnosis and the supervisor's prescriptions ----------
   After a route leaves connections open, the supervisor (Claude through the console tool, or the rules below when Claude is
   not available) needs to know WHY each one failed. diagnose() reports, per open connection: both ends (part · pin · side),
   what stands on the straight corridor between them (other nets' copper per layer, parts), how boxed-in each end pad is,
   whether an end is an MCU pin that could be re-assigned, plus power-width and via-current shortfalls and a score.
   plan() turns a diagnosis into console commands, a different remedy each time a net is seen again:
     1 rip   — route --nets <all open> --rip <nets around their end pins and on their corridors> --first <all open>
               (the rip also lifts the power fill, which was laid after the signals and blocks them; it is rebuilt)
     2 swap  — pinswap --nets N --apply --route            (MCU pin nearer its peer)
     3 move  — move <small part on the corridor> x y       (out of the way; its nets re-route)
     4 deep  — route --nets N --exp 2400000                (deeper search) */
const ROUTEDIAG=(function(){
"use strict";
const f1=v=>(Math.round(v*10)/10).toString();
const segDist=(px,py,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((px-a[0])*dx+(py-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy);};
/* distance between two segments (sampled along the shorter one — enough for corridor tests) */
const segSeg=(a,b,c,d)=>{let m=Infinity;const n=Math.max(2,Math.ceil(Math.hypot(d[0]-c[0],d[1]-c[1])/0.4));for(let i=0;i<=n;i++){const t=i/n;m=Math.min(m,segDist(c[0]+(d[0]-c[0])*t,c[1]+(d[1]-c[1])*t,a,b));}return m;};
const isMcu=c=>c&&c.pads.length>=32&&/TC[23]\d\d|STM32|S32K|RH850|AURIX|MCU|마이크로컨트롤러/i.test((c.val||'')+' '+(c.mpn||'')+' '+(c.desc||''));
const bbOf=c=>c.bb||(()=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;c.pads.forEach(p=>{const h=Math.max(p.w,p.h)/2;x0=Math.min(x0,p.x-h);y0=Math.min(y0,p.y-h);x1=Math.max(x1,p.x+h);y1=Math.max(y1,p.y+h);});return[x0,y0,x1,y1];})();
function endOf(B,pt,net){let best=null;B.comps.forEach(c=>c.pads.forEach(p=>{if(p.net!==net)return;const d=Math.hypot(p.x-pt[0],p.y-pt[1]);if(d<Math.max(p.w,p.h)/2+0.05&&(!best||d<best.d))best={d,c,p};}));
  if(best)return{ref:best.c.ref,pin:String(best.p.n),fn:best.p.fn||'',side:best.p.drill?'both':best.c.side||'T',x:+best.p.x.toFixed(2),y:+best.p.y.toFixed(2),val:best.c.val,mcu:isMcu(best.c),pitch:pitchOf(best.c,best.p),pad:best.p,comp:best.c};
  return{ref:null,pin:'',fn:'',side:'?',x:+pt[0].toFixed(2),y:+pt[1].toFixed(2),what:'트랙·비아 끝'};}
function pitchOf(c,p){let m=Infinity;c.pads.forEach(q=>{if(q!==p){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<m)m=d;}});return isFinite(m)?+m.toFixed(2):null;}
/* opt: rats, drc (precomputed), width (corridor half-width, default 1.2 mm), max (open connections reported, default 8) */
function diagnose(B,opt){opt=opt||{};const rats=opt.rats||PCBEDIT.ratsnest(B);const drc=opt.drc||PCBEDIT.drc(B);const keys=PCB.cuKeys(B);const W=opt.width||1.2;
  const stack=(PCB.stackOf?PCB.stackOf(B):[]);const lname=i=>keys[i]==='T'?'위(L1)':i===keys.length-1?`아래(L${i+1})`:`L${i+1}`;
  const prims=[];keys.forEach((k,li)=>B.layers[k+'.cu'].forEach(p=>{if(!p.net)return;if(p.t==='seg')prims.push({net:p.net,li,a:p.a,b:p.b,auto:!!p.auto,fill:!!p.fill});else if(p.t==='path')for(let i=1;i<p.pts.length;i++)prims.push({net:p.net,li,a:p.pts[i-1],b:p.pts[i],auto:!!p.auto,fill:!!p.fill});}));
  const planeNets=new Set(stack.filter(x=>x.net&&x.role!=='sig').map(x=>x.net).concat(Object.keys(B.nets||{}).filter(n=>/^(GND|AGND|PGND)$/i.test(n))));
  const isPwr=n=>/^(GND|AGND|PGND|VDD|VIN|VBAT)|^\+/i.test(n)||(B.netClass&&B.netClass(n)==='전원');
  const open=rats.slice(0,opt.max||8).map(r=>{const A=endOf(B,r.a,r.net),E=endOf(B,r.b,r.net);
    // other nets' copper on the corridor, per net and layer
    const by={};prims.forEach(p=>{if(p.net===r.net)return;if(segSeg(r.a,r.b,p.a,p.b)>W)return;const o=by[p.net]||(by[p.net]={net:p.net,n:0,layers:new Set(),auto:false,fill:false});o.n++;o.layers.add(p.li);if(p.auto)o.auto=true;if(p.fill)o.fill=true;});
    (B.vias||[]).forEach(v=>{if(!v.net||v.net===r.net)return;if(segDist(v.x,v.y,r.a,r.b)>W)return;const o=by[v.net]||(by[v.net]={net:v.net,n:0,layers:new Set(),auto:false,fill:false});o.n+=2;if(v.auto)o.auto=true;o.via=(o.via||0)+1;});
    const blockers=Object.values(by).sort((x,y)=>y.n-x.n).slice(0,6).map(o=>({net:o.net,n:o.n,layers:[...o.layers].sort().map(lname),rip:o.auto&&!o.fill&&!isPwr(o.net),via:o.via||0}));
    // parts standing on the corridor (not the two end parts)
    const parts=B.comps.filter(c=>c.ref!==A.ref&&c.ref!==E.ref).map(c=>{const b=bbOf(c);const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;const d=segDist(cx,cy,r.a,r.b);const half=Math.max(b[2]-b[0],b[3]-b[1])/2;return{c,d,half,cx,cy};})
      .filter(x=>x.d<x.half+0.3).sort((x,y)=>x.d-y.d).slice(0,5).map(x=>({ref:x.c.ref,val:x.c.val,side:x.c.side||'T',x:+x.c.x.toFixed(2),y:+x.c.y.toFixed(2),pads:x.c.pads.length,movable:x.c.pads.length<=2&&/^(R|C|D|L|FB)\d/i.test(x.c.ref)&&!x.c.locked}));
    // how boxed-in each end pad is: other nets' copper / pads within 0.6 mm of the pad edge on its side
    const boxed=e=>{if(!e.pad)return 0;const p=e.pad,R=Math.max(p.w,p.h)/2+0.6;const s=new Set();prims.forEach(q=>{if(q.net!==r.net&&segDist(p.x,p.y,q.a,q.b)<R)s.add(q.net);});B.comps.forEach(c=>c.pads.forEach(q=>{if(q!==p&&q.net&&q.net!==r.net&&Math.hypot(q.x-p.x,q.y-p.y)<R+Math.max(q.w,q.h)/2)s.add(q.net);}));return s.size;};
    // rippable signal copper right at each end pad (the neighbours that sealed the pin in)
    const near=e=>{if(!e.pad)return[];const p=e.pad,R=Math.max(p.w,p.h)/2+0.9;const s={};prims.forEach(q=>{if(q.net!==r.net&&q.auto&&!q.fill&&segDist(p.x,p.y,q.a,q.b)<R)s[q.net]=(s[q.net]||0)+1;});return Object.keys(s).filter(n=>!isPwr(n)).sort((x,y)=>s[y]-s[x]).slice(0,6);};
    A.boxed=boxed(A);E.boxed=boxed(E);A.near=near(A);E.near=near(E);
    // a two-pin part at an end: would turning it 180° shorten (uncross) its two connections? gain = mm saved, by nearest same-net pad
    const flip=e=>{const c=e.comp;if(!c||c.pads.length!==2||c.locked||!/^(R|C|D|L|FB)\d/i.test(c.ref))return null;const[p,q]=c.pads;
      const nearest=(net,x,y)=>{if(!net||isPwr(net)&&planeNets.has(net))return 0;let m=Infinity;B.comps.forEach(o=>{if(o===c)return;o.pads.forEach(t=>{if(t.net===net){const d=Math.hypot(t.x-x,t.y-y);if(d<m)m=d;}});});return isFinite(m)?m:0;};
      const cur=nearest(p.net,p.x,p.y)+nearest(q.net,q.x,q.y),sw=nearest(p.net,q.x,q.y)+nearest(q.net,p.x,p.y);return{ref:c.ref,nets:[p.net,q.net].filter(Boolean),gain:+(cur-sw).toFixed(2)};};
    A.flip=flip(A);E.flip=flip(E);
    const cls=B.netClass?B.netClass(r.net):'';const mcuEnd=A.mcu?A:E.mcu?E:null;
    const strip=e=>{const o=Object.assign({},e);delete o.pad;delete o.comp;return o;};
    return{net:r.net,len:+r.len.toFixed(1),cls,a:strip(A),b:strip(E),blockers,parts,swap:!!mcuEnd&&cls!=='전원'&&!/^(\+|GND|VDD|VIN)/i.test(r.net),mcuPin:mcuEnd?`${mcuEnd.ref}.${mcuEnd.pin}`:null};});
  const pr=B.powerReport||null;const badPower=pr?pr.nets.filter(n=>n.ok!=null?!n.ok:(n.width!=='직결'&&n.width<n.need*0.95)).map(n=>({net:n.net,width:n.width,need:n.need})):[];
  const badVia=pr?(pr.viaChk||[]).filter(v=>!v.ok).map(v=>({net:v.net,ref:v.ref,n:v.n,rise:+(v.rise+(v.riseP||0)).toFixed(0)})):[];
  const D={W:B.W,H:B.H,layers:keys.length,rats:rats.length,drc:drc.length,drcMsgs:drc.slice(0,4).map(d=>d.msg),open,badPower,badVia};
  // orchestration: who owns each open connection, and the priority vector the verifier compares (see AGENTS / verdict)
  const own=ownerFn(B);open.forEach(o=>{o.owner=own(o.net);});const cnt={};AGENT_ORDER.forEach(k=>{cnt[k]=0;});const openNets={};rats.forEach(r=>{const k=own(r.net);cnt[k]++;openNets[r.net]=k;});
  D.byOwner=cnt;D.openNets=openNets;D.vec=[cnt.power,D.drc,badPower.length,cnt.gate,cnt.sense+cnt.mcu+cnt.signal,badVia.length];
  D.score=score(D);D.ok=!D.rats&&!D.drc&&!badPower.length;return D;}
/* ---------- orchestration: function agents and the verifier ----------
   Each open connection belongs to one function agent; the orchestrator lets them work in a fixed priority order and the
   verifier accepts a change only when nothing of higher priority got worse:
     power  — rails, phases, shunt nodes (current width, thermal)      gate — gate drive, bootstrap, driver supplies (loop area)
     sense  — current sense, ADC, references                           mcu  — signals ending on a fine-pitch MCU pin
     signal — everything else
   verdict() compares [open power nets, DRC, power nets under width, open gate nets, other open nets, hot via sites]
   lexicographically, and rejects outright when a power net that was connected came open (the scalar score let a
   supervisor trade a phase net for a signal). */
const AGENT_ORDER=['power','gate','sense','mcu','signal'];
const AGENTS={power:{label:'파워스테이지',goal:'전류 경로(레일 · 상 · 션트 노드)를 먼저 잇는다 — 신호선만 뜯고 전력 동박은 건드리지 않는다',steps:['rip','deep']},
  gate:{label:'게이트 · EMC',goal:'게이트 구동 · 부트스트랩 · 드라이버 전원 루프를 잇는다',steps:['rot','rip','move','deep','ripwide']},
  sense:{label:'센싱',goal:'전류 센스 · ADC 선을 잇는다',steps:['rot','move','rip','deep']},
  mcu:{label:'MCU 탈출',goal:'미세 피치 MCU 핀에서 빠져나오는 신호를 잇는다 — 핀 재배정을 먼저 쓴다',steps:['swap','rip','deep','ripwide']},
  signal:{label:'일반 신호',goal:'남은 신호를 잇는다',steps:['rot','rip','swap','move','deep']}};
const GATE_RE=/(^|_)(HO|LO|[HL]G(_?\d+)?|G[HL][A-C1-3]?|VB|BOOT\w*|BST\w*|LSS|HSS?|CP\d?[PN]?|VCP|VREG|LX|SW)$/i,SENSE_RE=/SNS|ISNS|ISEN|_AMP|ADC|AIN|NTC|VMON|VREF|TEMP/i;
function ownerFn(B){const pw=new Set((B.powerReport&&B.powerReport.nets||[]).map(n=>n.net));const mcuNets=new Set();B.comps.forEach(c=>{if(isMcu(c))c.pads.forEach(p=>{if(p.net)mcuNets.add(p.net);});});const memo={};
  return net=>{if(net in memo)return memo[net];const n=String(net||'');const cls=B.netClass?B.netClass(n):'';let k;
    if(cls==='전원'||cls==='접지'||pw.has(n)||/^(GND|AGND|PGND|VDD|VIN|VBAT)|^\+/i.test(n)||(B.netCurrent&&B.netCurrent[n]>=2))k='power';
    else if(GATE_RE.test(n))k='gate';else if(SENSE_RE.test(n)||(typeof AUTOROUTE!=='undefined'&&AUTOROUTE.AN_RE&&AUTOROUTE.AN_RE.test(n)))k='sense';else if(mcuNets.has(n))k='mcu';else k='signal';return memo[net]=k;};}
const VEC_LABEL=['전력 넷 미연결','DRC','전류 폭 미달','게이트 넷 미연결','신호 미연결','비아 전류 미달'];
/* the verifier: {ok, better, why}. ok=false → the orchestrator undoes the change */
function verdict(before,after){const lost=Object.keys(after.openNets||{}).filter(n=>after.openNets[n]==='power'&&!(before.openNets||{})[n]);
  if(lost.length)return{ok:false,better:false,why:`연결돼 있던 전력 넷이 끊김: ${lost.join(', ')}`};
  const a=before.vec,b=after.vec;for(let i=0;i<a.length;i++){if(b[i]<a[i])return{ok:true,better:true,why:`${VEC_LABEL[i]} ${a[i]} → ${b[i]}`};if(b[i]>a[i])return{ok:false,better:false,why:`${VEC_LABEL[i]} ${a[i]} → ${b[i]}`};}
  return{ok:true,better:false,why:'변화 없음'};}
/* the orchestrator's next move: the highest-priority agent that still has open nets and an untried remedy. One action per call —
   small steps the verifier can judge one at a time. hist: {'@agent:nets':[kinds…], _all:[…]} */
function agentPlan(D,B,hist,opt){hist=hist||{};opt=opt||{};const G=hist._all||(hist._all=[]);
  for(const k of AGENT_ORDER){const opens=D.open.filter(o=>o.owner===k);if(!opens.length)continue;const nets=[...new Set(opens.map(o=>o.net))].slice(0,4);const key='@'+k+':'+nets.slice().sort().join(',');const h=hist[key]||(hist[key]=[]);
    const ripSet=n=>{const w={};opens.forEach(o=>{[o.a,o.b].forEach(e=>(e.near||[]).forEach((x,i)=>{w[x]=(w[x]||0)+6-i;}));o.blockers.filter(b=>b.rip).forEach(b=>{w[b.net]=(w[b.net]||0)+Math.min(4,b.n/2);});});
      const own=ownerFn(B);return Object.keys(w).filter(x=>!nets.includes(x)&&own(x)!=='power'&&(k==='power'||k==='gate'||own(x)!=='gate')).sort((x,y)=>w[y]-w[x]).slice(0,n);};
    const act=(kind,cmd,why,then)=>({agent:k,net:nets.join(','),kind,cmd,then,why:`[${AGENTS[k].label}] ${why}`});
    for(const st of AGENTS[k].steps){if(h.includes(st))continue;
      if(st==='rot'){const c=[];opens.forEach(o=>[o.a,o.b].forEach(e=>{if(e.flip&&e.flip.gain>-0.5&&!G.includes('rot:'+e.flip.ref)&&!c.some(x=>x.ref===e.flip.ref))c.push(e.flip);}));c.sort((x,y)=>y.gain-x.gain);if(!c.length){h.push(st);continue;}
        const f=c[0];G.push('rot:'+f.ref);if(c.length===1)h.push(st);const rp=ripSet(6).filter(n=>!f.nets.includes(n));const ns=[...new Set(nets.concat(f.nets.filter(n=>!/^(GND|AGND|PGND)$/i.test(n)&&!/^\+/.test(n))))];
        return[act('rot',`rotate ${f.ref} 180 --no-route`,`${f.ref}를 180° 돌려 교차를 풀고(${f.gain} mm) ${nets.join(', ')}부터 다시 배선`,`route --nets ${ns.join(',')}${rp.length?' --rip '+rp.join(','):' --refill'} --first ${nets.join(',')}`)];}
      if(st==='swap'){const o=opens.find(o=>o.swap&&!G.includes('swap:'+o.net));if(!o||opt.pinswap===false){h.push(st);continue;}G.push('swap:'+o.net);if(!opens.some(q=>q.swap&&!G.includes('swap:'+q.net)))h.push(st);
        return[act('swap',`pinswap --nets ${o.net} --apply --route`,`${o.net}: MCU 핀 ${o.mcuPin}을 상대에 가까운 핀으로 재배정`)];}
      if(st==='move'){let hit=null;for(const o of opens){const mv=o.parts.find(p=>p.movable&&!G.includes('move:'+p.ref));if(!mv)continue;const pos=B&&nudge(B,mv.ref,[o.a.x,o.a.y],[o.b.x,o.b.y]);G.push('move:'+mv.ref);if(pos){hit={o,mv,pos};break;}}
        if(!hit){h.push(st);continue;}return[act('move',`move ${hit.mv.ref} ${hit.pos.x} ${hit.pos.y}`,`${hit.o.net}: 통로 위 ${hit.mv.ref}를 ${hit.pos.d} mm 옮김`,`route --nets ${hit.o.net} --exp 1200000`)];}
      if(st==='rip'||st==='ripwide'){h.push(st);const rp=ripSet(st==='rip'?6:14);if(!rp.length||(st==='ripwide'&&rp.length<=6))continue;
        return[act(st,`route --nets ${nets.join(',')} --rip ${rp.join(',')} --first ${nets.join(',')}${st==='ripwide'?' --exp 1200000':''}`,`${nets.join(', ')}의 핀 주변 · 통로 배선 ${rp.length}개를 뜯고 먼저 배선`)];}
      if(st==='deep'){h.push(st);return[act('deep',`route --nets ${nets.join(',')} --exp 2400000`,`${nets.join(', ')}: 더 깊게 탐색`)];}}}
  return[];}
/* what is left, by agent, with the likely cause of each open connection */
function causeOf(o){const fine=e=>e.pitch&&e.pitch<=0.65;if((o.a.boxed>=4&&fine(o.a))||(o.b.boxed>=4&&fine(o.b)))return'미세 피치 핀이 이웃 배선에 막힘';if(o.blockers.some(b=>!b.rip))return'통로를 전력 동박 · 고정 배선이 가로막음';
  if(o.parts.length>=2)return'통로 위에 부품이 있음';if(o.blockers.length>=3)return'통로 혼잡';if(o.len>40)return'거리가 멀어 층 전환이 많이 필요';return'원인 불명 (더 깊은 탐색 필요)';}
function agentText(D){const L=[];AGENT_ORDER.forEach(k=>{const n=D.byOwner[k];if(!n)return;const os=D.open.filter(o=>o.owner===k);L.push(`${AGENTS[k].label}: 미연결 ${n}건${os.length?' — '+os.map(o=>`${o.net}(${causeOf(o)})`).join(', '):''}`);});return L.join('\n');}
/* lower is better: an open connection or a DRC error weighs 1000, a power net under its width 500, a hot via site 100 */
function score(D){return(D.rats+D.drc)*1000+D.badPower.length*500+D.badVia.length*100;}
function text(D){const L=[`보드 ${f1(D.W)} × ${f1(D.H)} mm · ${D.layers}층 · 미연결 ${D.rats} · DRC ${D.drc} · 전류 폭 미달 ${D.badPower.length} · 비아 전류 미달 ${D.badVia.length} (점수 ${D.score}, 낮을수록 좋음)`];
  const E=e=>e.ref?`${e.ref}.${e.pin}${e.fn?'('+e.fn+')':''} @${e.x},${e.y} ${e.side==='B'?'아래면':e.side==='both'?'관통':'위면'}${e.mcu?' · MCU 핀':''}${e.pitch&&e.pitch<=0.65?` · 미세 피치 ${e.pitch}`:''} · 주변 다른 넷 ${e.boxed}개${e.near&&e.near.length?` (핀을 둘러싼 배선: ${e.near.join(', ')})`:''}`:`${e.what} @${e.x},${e.y}`;
  D.open.forEach((o,i)=>{L.push(`${i+1}. [${o.net}] ${o.cls||''} · 직선 ${o.len} mm`);L.push(`   끝 A: ${E(o.a)}`);L.push(`   끝 B: ${E(o.b)}`);
    L.push(`   통로를 막는 넷: ${o.blockers.length?o.blockers.map(b=>`${b.net}(${b.layers.join('·')||'비아'}${b.via?` 비아${b.via}`:''}${b.rip?'':' · 고정'})`).join(', '):'없음'}`);
    if(o.parts.length)L.push(`   통로 위 부품: ${o.parts.map(p=>`${p.ref} ${p.val||''} @${p.x},${p.y} ${p.side==='B'?'아래':'위'}${p.movable?' · 옮길 수 있음':''}`).join(', ')}`);
    [o.a,o.b].forEach(e=>{if(e.flip&&e.flip.gain>-0.5)L.push(`   ${e.flip.ref}를 180° 돌리면 두 연결이 ${e.flip.gain>=0?e.flip.gain+' mm 짧아짐 (교차 풀림 가능)':(-e.flip.gain)+' mm 길어짐'} — rotate ${e.flip.ref} 180 후보`);});
    if(o.swap)L.push(`   MCU 핀 ${o.mcuPin} — pinswap 후보`);});
  if(D.rats>D.open.length)L.push(`… 외 ${D.rats-D.open.length}건`);
  if(D.drcMsgs.length)L.push('DRC: '+D.drcMsgs.join(' / '));
  if(D.badPower.length)L.push('전류 폭 미달: '+D.badPower.map(p=>`${p.net} ${p.width}/${p.need} mm`).join(', '));
  if(D.badVia.length)L.push('비아 전류 미달: '+D.badVia.map(v=>`${v.net} ${v.ref} 비아 ${v.n}개 +${v.rise} °C`).join(', '));
  return L.join('\n');}
/* a free spot for a small part, pushed off the corridor a–b: perpendicular, 0.6 … 2.0 mm, either way; no pad / part overlap */
function nudge(B,ref,a,b){const c=B.byRef?B.byRef[ref]:B.comps.find(q=>q.ref===ref);if(!c)return null;const bb=bbOf(c);const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;const nx=-dy/l,ny=dx/l;
  const side=(c.x-a[0])*nx+(c.y-a[1])*ny>=0?1:-1;
  const free=(ox,oy)=>{const r=[bb[0]+ox-0.25,bb[1]+oy-0.25,bb[2]+ox+0.25,bb[3]+oy+0.25];if(r[0]<0.5||r[1]<0.5||r[2]>B.W-0.5||r[3]>B.H-0.5)return false;
    return!B.comps.some(o=>{if(o===c||(o.side||'T')!==(c.side||'T'))return false;const q=bbOf(o);return r[0]<q[2]&&r[2]>q[0]&&r[1]<q[3]&&r[3]>q[1];});};
  for(const s of[side,-side])for(const d of[0.6,0.9,1.2,1.6,2.0]){const ox=nx*d*s,oy=ny*d*s;if(free(ox,oy))return{x:+(c.x+ox).toFixed(2),y:+(c.y+oy).toFixed(2),d};}return null;}
/* rule-based prescriptions. hist: {net: ['rip','swap',…]} of what was already tried (updated here). Returns [{net,kind,cmd,why}] */
function plan(D,B,hist,opt){hist=hist||{};opt=opt||{};const out=[];const seen=new Set();const G=hist._all||(hist._all=[]);
  // 1–2: all open nets together — rip the nets around their end pins and on their corridors, route the failed nets first
  const nets=[...new Set(D.open.map(o=>o.net))].slice(0,6);
  const ripSet=k=>{const w={};D.open.forEach(o=>{[o.a,o.b].forEach(e=>(e.near||[]).forEach((n,i)=>{w[n]=(w[n]||0)+6-i;}));o.blockers.filter(b=>b.rip).forEach(b=>{w[b.net]=(w[b.net]||0)+Math.min(4,b.n/2);});});
    return Object.keys(w).filter(n=>!nets.includes(n)).sort((x,y)=>w[y]-w[x]).slice(0,k);};
  const key=nets.slice().sort().join(',');
  // 0: a two-pin part at a failed net's end that would uncross by turning 180° — turn it, lift what surrounds it, route the failed nets first
  {const c=[];D.open.forEach(o=>[o.a,o.b].forEach(e=>{if(e.flip&&e.flip.gain>-0.5&&!G.includes('rot:'+e.flip.ref)&&!c.some(x=>x.ref===e.flip.ref))c.push(e.flip);}));c.sort((x,y)=>y.gain-x.gain);
    if(c.length){const f=c[0];G.push('rot:'+f.ref);const rp=ripSet(8).filter(n=>!f.nets.includes(n));const ns=[...new Set(nets.concat(f.nets.filter(n=>!/^(GND|AGND|PGND)$/i.test(n))))];
      out.push({net:nets.join(','),kind:'rot',cmd:`rotate ${f.ref} 180 --no-route`,then:`route --nets ${ns.join(',')}${rp.length?' --rip '+rp.join(','):' --refill'} --first ${nets.join(',')}`,why:`${f.ref}를 180° 돌려 교차를 풀고(${f.gain} mm), 주변 넷을 뜯어 실패한 넷부터 다시 배선`});return out;}}
  if(nets.length&&!G.includes('ripall:'+key)){G.push('ripall:'+key);const rp=ripSet(8);if(rp.length){out.push({net:nets.join(','),kind:'ripall',cmd:`route --nets ${nets.join(',')} --rip ${rp.join(',')} --first ${nets.join(',')}`,why:`실패한 ${nets.length}개 넷의 핀 주변 · 통로 배선 ${rp.length}개를 뜯고, 실패한 넷부터 다시 배선`});return out;}}
  if(nets.length&&!G.includes('ripwide:'+key)){G.push('ripwide:'+key);const rp=ripSet(16);if(rp.length>8){out.push({net:nets.join(','),kind:'ripwide',cmd:`route --nets ${nets.join(',')} --rip ${rp.join(',')} --first ${nets.join(',')} --exp 1200000`,why:`더 넓게 ${rp.length}개를 뜯고 깊게 탐색`});return out;}}
  // 3…: per net — MCU pin swap, a small part off the corridor, deeper search
  D.open.slice(0,opt.max||3).forEach(o=>{if(seen.has(o.net))return;seen.add(o.net);const h=hist[o.net]||(hist[o.net]=[]);const mv=o.parts.find(p=>p.movable);let pos=null;
    if(!h.includes('swap')&&o.swap&&opt.pinswap!==false){h.push('swap');out.push({net:o.net,kind:'swap',cmd:`pinswap --nets ${o.net} --apply --route`,why:`${o.net}: MCU 핀 ${o.mcuPin}을 상대 핀에 가까운 핀으로 교환`});}
    else if(!h.includes('move')&&mv&&B&&(pos=nudge(B,mv.ref,[o.a.x,o.a.y],[o.b.x,o.b.y]))){h.push('move');out.push({net:o.net,kind:'move',cmd:`move ${mv.ref} ${pos.x} ${pos.y}`,then:`route --nets ${o.net} --exp 1200000`,why:`${o.net}: 통로 위 ${mv.ref}를 ${pos.d} mm 옮김`});}
    else if(!h.includes('deep')){h.push('deep');out.push({net:o.net,kind:'deep',cmd:`route --nets ${o.net} --exp 2400000`,why:`${o.net}: 더 깊게 탐색`});}});
  return out;}
/* what the supervisor (Claude) is told */
const SYS=`You supervise a PCB auto-router. The algorithmic router (A* on a grid, rip-up and re-route, negotiated congestion) has finished and left problems. You get a diagnosis; prescribe fixes by calling the run_cli tool, one console command per call. Tools you should use:
- route --nets A,B --rip N1,N2,… --first A,B : remove the auto-routed copper of nets N1,N2,… then route A,B first and the ripped nets after them. Best first move: name ALL open nets together and rip the nets listed as "핀을 둘러싼 배선" at their end pins plus the rippable "통로를 막는 넷" (not marked 고정), 6–12 nets. A fine-pitch pin sealed in by its neighbours needs those neighbours ripped.
- pinswap --nets NET --apply --route : re-assign the MCU pin of NET to a free pin nearer its peer and route it (changes the circuit; only for signals whose end is an MCU pin — "pinswap 후보").
- rotate REF 180 --no-route : turn a two-pin part end-for-end when the diagnosis says "rotate REF 180 후보" (its two connections cross); follow it with route --nets <its nets and the open nets> --rip <surrounding nets> --first <open nets>.
- move REF x y [deg] : move a small part (marked 옮길 수 있음) 0.5–1.5 mm off the corridor; its nets re-route by themselves. Keep parts inside the board and off other parts.
- route --nets NET --exp 2400000 : deeper search for one net.
- unroute is NOT allowed (it removes everything). reset / board size / board layers are NOT allowed unless the diagnosis is hopeless — then say so in your answer instead of doing it.
- diag : the diagnosis again (after your changes). rats / drc : details.
Rules: at most 5 commands. Fix the open connections first (each weighs 1000), then DRC, then power widths. Do not repeat a remedy listed under "이미 시도" for the same net — choose a different one. Never touch GND or supply-plane nets. After your commands, answer in Korean in 2–4 short sentences: what you did and why, and what is left. Do not invent numbers.`;
function prompt(D,tried,round,max){return`${SYS}\n\n진단 (감독 ${round}/${max}회차):\n${text(D)}\n\n이미 시도: ${tried&&tried.length?tried.map(t=>`${t.cmd} → ${t.res}`).join(' ; '):'없음'}\n\n사용자 요청: 위 진단의 문제를 고쳐줘.`;}
return{diagnose,score,text,plan,nudge,prompt,SYS,AGENTS,AGENT_ORDER,ownerFn,verdict,agentPlan,agentText,causeOf,VEC_LABEL};
})();
if(typeof module!=='undefined')module.exports=ROUTEDIAG;
