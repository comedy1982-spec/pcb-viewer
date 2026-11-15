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
    const cls=B.netClass?B.netClass(r.net):'';const mcuEnd=A.mcu?A:E.mcu?E:null;
    const strip=e=>{const o=Object.assign({},e);delete o.pad;delete o.comp;return o;};
    return{net:r.net,len:+r.len.toFixed(1),cls,a:strip(A),b:strip(E),blockers,parts,swap:!!mcuEnd&&cls!=='전원'&&!/^(\+|GND|VDD|VIN)/i.test(r.net),mcuPin:mcuEnd?`${mcuEnd.ref}.${mcuEnd.pin}`:null};});
  const pr=B.powerReport||null;const badPower=pr?pr.nets.filter(n=>n.width!=='직결'&&n.width<n.need).map(n=>({net:n.net,width:n.width,need:n.need})):[];
  const badVia=pr?(pr.viaChk||[]).filter(v=>!v.ok).map(v=>({net:v.net,ref:v.ref,n:v.n,rise:+(v.rise+(v.riseP||0)).toFixed(0)})):[];
  const D={W:B.W,H:B.H,layers:keys.length,rats:rats.length,drc:drc.length,drcMsgs:drc.slice(0,4).map(d=>d.msg),open,badPower,badVia};
  D.score=score(D);D.ok=!D.rats&&!D.drc&&!badPower.length;return D;}
/* lower is better: an open connection or a DRC error weighs 1000, a power net under its width 500, a hot via site 100 */
function score(D){return(D.rats+D.drc)*1000+D.badPower.length*500+D.badVia.length*100;}
function text(D){const L=[`보드 ${f1(D.W)} × ${f1(D.H)} mm · ${D.layers}층 · 미연결 ${D.rats} · DRC ${D.drc} · 전류 폭 미달 ${D.badPower.length} · 비아 전류 미달 ${D.badVia.length} (점수 ${D.score}, 낮을수록 좋음)`];
  const E=e=>e.ref?`${e.ref}.${e.pin}${e.fn?'('+e.fn+')':''} @${e.x},${e.y} ${e.side==='B'?'아래면':e.side==='both'?'관통':'위면'}${e.mcu?' · MCU 핀':''}${e.pitch&&e.pitch<=0.65?` · 미세 피치 ${e.pitch}`:''} · 주변 다른 넷 ${e.boxed}개${e.near&&e.near.length?` (핀을 둘러싼 배선: ${e.near.join(', ')})`:''}`:`${e.what} @${e.x},${e.y}`;
  D.open.forEach((o,i)=>{L.push(`${i+1}. [${o.net}] ${o.cls||''} · 직선 ${o.len} mm`);L.push(`   끝 A: ${E(o.a)}`);L.push(`   끝 B: ${E(o.b)}`);
    L.push(`   통로를 막는 넷: ${o.blockers.length?o.blockers.map(b=>`${b.net}(${b.layers.join('·')||'비아'}${b.via?` 비아${b.via}`:''}${b.rip?'':' · 고정'})`).join(', '):'없음'}`);
    if(o.parts.length)L.push(`   통로 위 부품: ${o.parts.map(p=>`${p.ref} ${p.val||''} @${p.x},${p.y} ${p.side==='B'?'아래':'위'}${p.movable?' · 옮길 수 있음':''}`).join(', ')}`);
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
- move REF x y [deg] : move a small part (marked 옮길 수 있음) 0.5–1.5 mm off the corridor; its nets re-route by themselves. Keep parts inside the board and off other parts.
- route --nets NET --exp 2400000 : deeper search for one net.
- unroute is NOT allowed (it removes everything). reset / board size / board layers are NOT allowed unless the diagnosis is hopeless — then say so in your answer instead of doing it.
- diag : the diagnosis again (after your changes). rats / drc : details.
Rules: at most 5 commands. Fix the open connections first (each weighs 1000), then DRC, then power widths. Do not repeat a remedy listed under "이미 시도" for the same net — choose a different one. Never touch GND or supply-plane nets. After your commands, answer in Korean in 2–4 short sentences: what you did and why, and what is left. Do not invent numbers.`;
function prompt(D,tried,round,max){return`${SYS}\n\n진단 (감독 ${round}/${max}회차):\n${text(D)}\n\n이미 시도: ${tried&&tried.length?tried.map(t=>`${t.cmd} → ${t.res}`).join(' ; '):'없음'}\n\n사용자 요청: 위 진단의 문제를 고쳐줘.`;}
return{diagnose,score,text,plan,nudge,prompt,SYS};
})();
if(typeof module!=='undefined')module.exports=ROUTEDIAG;
