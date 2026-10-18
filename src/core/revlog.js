/* Revision log core: snapshots of the whole design (board graph + plan + system diagram + HSIS + housing) and a structured
   comparison between two snapshots. Pure data — storage and UI live in src/app/revui.js.
   A board is an object graph (a through pad sits in T.cu, B.cu and its component; drills point back at their component), so
   the encoder keeps object identity: objects seen more than once go into a table and are referenced as {"$":id}. */
const REVLOG=(function(){
"use strict";
const VER=1;
const tag=v=>Object.prototype.toString.call(v);const isSet=v=>tag(v)==='[object Set]',isMap=v=>tag(v)==='[object Map]';
// derived or bulky fields that are rebuilt (PCB.finalize, analysis caches) or are UI state
const SKIP={nets:1,netOrder:1,byRef:1,netClass:1,_pe:1,R:1,undo:1,redo:1,key:1,bb:1};
const HOUSE={R:1,undo:1,redo:1,key:1};
const skipKey=(o,k)=>SKIP[k]===1&&(!HOUSE[k]||!!(o&&o.inp&&o.cad!==undefined))&&(k!=='bb'||!!(o&&o.pads));
function enc(root){
  const seen=new Map();
  const count=v=>{if(v===null||typeof v!=='object')return;const n=seen.get(v)||0;seen.set(v,n+1);if(n)return;
    if(ArrayBuffer.isView(v))return;if(Array.isArray(v)){for(const x of v)count(x);return;}if(isSet(v)||isMap(v)){for(const x of v.values())count(x);return;}
    for(const k in v){if(Object.prototype.hasOwnProperty.call(v,k)&&!skipKey(v,k))count(v[k]);}};
  count(root);
  const T=[],ids=new Map();
  const val=v=>{if(v===undefined||typeof v==='function'||typeof v==='symbol')return undefined;if(typeof v==='number')return isFinite(v)?v:null;if(v===null||typeof v!=='object')return v;
    if(ArrayBuffer.isView(v))return undefined;
    if((seen.get(v)||0)>1){if(ids.has(v))return{$:ids.get(v)};const id=T.length;ids.set(v,id);T.push(null);T[id]=body(v);return{$:id};}
    return body(v);};
  const body=v=>{if(Array.isArray(v))return v.map(x=>{const w=val(x);return w===undefined?null:w;});
    if(isSet(v))return{$set:[...v].map(val)};if(isMap(v))return{$map:[...v].map(([k,x])=>[k,val(x)])};
    const o={};for(const k in v){if(!Object.prototype.hasOwnProperty.call(v,k)||skipKey(v,k))continue;const w=val(v[k]);if(w!==undefined)o[k==='$'?'$$':k]=w;}return o;};
  const r=val(root);return{t:T,r};}
function dec(E){const T=E.t||[];const live=new Array(T.length);
  const make=v=>Array.isArray(v)?[]:v&&v.$set?new Set():v&&v.$map?new Map():{};
  T.forEach((v,i)=>{live[i]=make(v);});
  const val=v=>{if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(val);if(v.$!==undefined&&Object.keys(v).length===1)return live[v.$];return fill(make(v),v);};
  const fill=(o,v)=>{if(Array.isArray(v)){v.forEach(x=>o.push(val(x)));return o;}if(v.$set){v.$set.forEach(x=>o.add(val(x)));return o;}if(v.$map){v.$map.forEach(([k,x])=>o.set(k,val(x)));return o;}
    for(const k in v)o[k==='$$'?'$':k]=val(v[k]);return o;};
  T.forEach((v,i)=>fill(live[i],v));return val(E.r);}
/* ---- snapshot of the app state. st = {board, np:{name,req,plan,arch,answers,vkey}, hsis, sys} ---- */
function snapshot(st){const B=st.board;return{v:VER,mb:st.mb||null,board:B?enc(B):null,np:st.np?enc(st.np):null,hsis:st.hsis?enc(st.hsis):null,stats:B?stats(B,st):null};}
function restore(S,PCB){const B=S.board?dec(S.board):null;if(B){if(!B.layers['T.cu'])B.layers['T.cu']=[];if(!B.layers['B.cu'])B.layers['B.cu']=[];
    B.comps.forEach(c=>{if(!c.f&&PCB.FP&&PCB.FP[c.fp])c.f=PCB.FP[c.fp];});PCB.finalize(B);}
  return{board:B,np:S.np?dec(S.np):null,hsis:S.hsis?dec(S.hsis):null,mb:S.mb||null};}
/* ---- numbers that describe one revision ---- */
function trackLen(L){let l=0;(L||[]).forEach(p=>{if(p.clear)return;if(p.t==='seg')l+=Math.hypot(p.b[0]-p.a[0],p.b[1]-p.a[1]);else if(p.t==='path')for(let i=1;i<p.pts.length;i++)l+=Math.hypot(p.pts[i][0]-p.pts[i-1][0],p.pts[i][1]-p.pts[i-1][1]);});return l;}
function cuKeysOf(B){return Object.keys(B.layers).filter(k=>/\.cu$/.test(k)).map(k=>k.slice(0,-3)).sort((a,b)=>(a==='T'?-1:a==='B'?1e3:+a.slice(2))-(b==='T'?-1:b==='B'?1e3:+b.slice(2)));}
function stats(B,st){const L=cuKeysOf(B);let tracks=0;L.forEach(k=>B.layers[k+'.cu'].forEach(p=>{if((p.t==='seg'||p.t==='path')&&!p.clear)tracks++;}));
  const nets=new Set();B.comps.forEach(c=>c.pads.forEach(p=>{if(p.net)nets.add(p.net);}));
  const np=st&&st.np;const H=B.housing;
  return{name:B.name,W:+(+B.W||0).toFixed(2),H:+(+B.H||0).toFixed(2),layers:B.copperLayers||2,comps:B.comps.length,nets:nets.size,vias:B.vias.length,tracks,len:+L.reduce((a,k)=>a+trackLen(B.layers[k+'.cu']),0).toFixed(1),
    blank:!!B.blank,pcb:!B.blank&&!B.pcbPending,variant:B.variantLabel||'',blocks:np&&np.arch&&np.arch.blocks?np.arch.blocks.length:0,hsis:st&&st.hsis&&st.hsis.items?st.hsis.items.length:0,
    housing:!!(H&&H.cad&&((H.cad.feats||[]).length||Object.keys(H.cad.over||{}).length||Object.keys(H.cad.edge||{}).length))};}
/* ---- comparison ---- */
const num=v=>+(+v||0).toFixed(3);
const pinKey=(c,p)=>`${c.ref}.${p.n}`;
function bomOf(B){const m={};B.comps.forEach(c=>{m[c.ref]={ref:c.ref,val:c.val||'',fp:c.fp||'',mpn:c.mpn||'',side:c.side,x:num(c.x),y:num(c.y),rot:num(c.rot||0),desc:c.desc||''};});return m;}
function pinsOf(B){const m={};B.comps.forEach(c=>c.pads.forEach(p=>{if(p.n!=null)m[pinKey(c,p)]=p.net||'';}));return m;}
function netsOf(B){const m={};B.comps.forEach(c=>c.pads.forEach(p=>{if(!p.net)return;(m[p.net]=m[p.net]||new Set()).add(pinKey(c,p));}));return m;}
function layerStats(B){const o={};cuKeysOf(B).forEach(k=>{const L=B.layers[k+'.cu'];let n=0,z=0;L.forEach(p=>{if(p.clear)return;if(p.t==='seg'||p.t==='path')n++;else if(p.t==='poly'||p.t==='pour')z++;});o[k]={tracks:n,zones:z,len:+trackLen(L).toFixed(1)};});return o;}
function diffBoards(A,B){
  const out={board:[],bom:{added:[],removed:[],changed:[]},place:[],nets:{added:[],removed:[],changed:[]},pins:[],layers:[]};
  if(!A||!B)return out;
  const sz=(X)=>`${(+X.W).toFixed(1)} × ${(+X.H).toFixed(1)} mm`;
  [['이름',A.name,B.name],['크기',sz(A),sz(B)],['두께',A.t+' mm',B.t+' mm'],['동박 층',A.copperLayers||2,B.copperLayers||2],['회로 안',A.variantLabel||'',B.variantLabel||''],['PCB 배치',A.blank||A.pcbPending?'아직':'됨',B.blank||B.pcbPending?'아직':'됨'],['비아',A.vias.length,B.vias.length]]
    .forEach(([k,a,b])=>{if(String(a)!==String(b))out.board.push([k,a,b]);});
  const ba=bomOf(A),bb=bomOf(B);
  Object.keys(bb).forEach(r=>{if(!ba[r])out.bom.added.push(bb[r]);});Object.keys(ba).forEach(r=>{if(!bb[r])out.bom.removed.push(ba[r]);});
  Object.keys(ba).forEach(r=>{const a=ba[r],b=bb[r];if(!b)return;const f=['val','fp','mpn'].filter(k=>a[k]!==b[k]);if(f.length)out.bom.changed.push({ref:r,fields:f,a,b});
    const mv=Math.hypot(a.x-b.x,a.y-b.y);if(mv>0.005||a.rot!==b.rot||a.side!==b.side)out.place.push({ref:r,dx:+(b.x-a.x).toFixed(3),dy:+(b.y-a.y).toFixed(3),dist:+mv.toFixed(3),rot:[a.rot,b.rot],side:[a.side,b.side]});});
  const sortRef=(x,y)=>String(x.ref).localeCompare(String(y.ref),undefined,{numeric:true});[out.bom.added,out.bom.removed,out.bom.changed,out.place].forEach(a=>a.sort(sortRef));
  const na=netsOf(A),nb=netsOf(B);const same=(s,t)=>s.size===t.size&&[...s].every(x=>t.has(x));
  Object.keys(nb).forEach(n=>{if(!na[n])out.nets.added.push({net:n,pins:[...nb[n]]});else if(!same(na[n],nb[n]))out.nets.changed.push({net:n,add:[...nb[n]].filter(x=>!na[n].has(x)),rem:[...na[n]].filter(x=>!nb[n].has(x))});});
  Object.keys(na).forEach(n=>{if(!nb[n])out.nets.removed.push({net:n,pins:[...na[n]]});});
  ['added','removed','changed'].forEach(k=>out.nets[k].sort((x,y)=>x.net.localeCompare(y.net,undefined,{numeric:true})));
  const pa=pinsOf(A),pb=pinsOf(B);Object.keys(pb).forEach(k=>{if(k in pa&&pa[k]!==pb[k])out.pins.push({pin:k,a:pa[k],b:pb[k]});});
  out.pins.sort((x,y)=>x.pin.localeCompare(y.pin,undefined,{numeric:true}));
  const la=layerStats(A),lb=layerStats(B);[...new Set([...Object.keys(la),...Object.keys(lb)])].forEach(k=>{const a=la[k]||{tracks:0,zones:0,len:0},b=lb[k]||{tracks:0,zones:0,len:0};
    if(!la[k]||!lb[k]||a.tracks!==b.tracks||a.zones!==b.zones||Math.abs(a.len-b.len)>0.05)out.layers.push({layer:k,a:la[k]||null,b:lb[k]||null});});
  return out;}
function diffArch(A,B){const out={added:[],removed:[],changed:[],links:{added:[],removed:[]}};const bl=x=>x&&x.arch&&x.arch.blocks||[];const key=b=>b.label||b.name||b.id;
  const ma=new Map(bl(A).map(b=>[key(b),b])),mb=new Map(bl(B).map(b=>[key(b),b]));
  mb.forEach((b,k)=>{if(!ma.has(k))out.added.push(b);else{const a=ma.get(k);const f=['group','feats','impl'].filter(x=>JSON.stringify(a[x]||'')!==JSON.stringify(b[x]||''));if(f.length)out.changed.push({name:k,fields:f,a,b});}});
  ma.forEach((a,k)=>{if(!mb.has(k))out.removed.push(a);});
  const lk=x=>(x&&x.arch&&x.arch.links||[]).map(l=>{const nm=id=>{const b=(x.arch.blocks||[]).find(q=>q.id===id);return b?key(b):id;};return`${nm(l.a!=null?l.a:l.from)} ${l.both?'↔':'→'} ${nm(l.b!=null?l.b:l.to)}${l.label?' · '+l.label:''}`;});
  const la=new Set(lk(A)),lb=new Set(lk(B));lb.forEach(x=>{if(!la.has(x))out.links.added.push(x);});la.forEach(x=>{if(!lb.has(x))out.links.removed.push(x);});
  return out;}
function diffPlan(A,B){const out={added:[],removed:[],changed:[],req:null};const bl=x=>x&&x.plan&&x.plan.blocks||[];const key=b=>b.id||b.key||b.type;
  const ma=new Map(bl(A).map(b=>[key(b),b])),mb=new Map(bl(B).map(b=>[key(b),b]));
  mb.forEach((b,k)=>{if(!ma.has(k))out.added.push({id:k,type:b.type,p:b.p||b.params||{}});else{const a=ma.get(k);const pa=JSON.stringify(a.p||a.params||{}),pb=JSON.stringify(b.p||b.params||{});if(pa!==pb||a.type!==b.type)out.changed.push({id:k,type:b.type,a:a.p||a.params||{},b:b.p||b.params||{}});}});
  ma.forEach((a,k)=>{if(!mb.has(k))out.removed.push({id:k,type:a.type,p:a.p||a.params||{}});});
  const ra=A&&A.req||'',rb=B&&B.req||'';if(ra!==rb)out.req=[ra,rb];return out;}
function diffHsis(A,B){const out={added:[],removed:[],changed:[]};const it=x=>x&&x.items||[];const key=i=>i.id||i.signal||i.name;
  const F=['signal','name','cat','dir','pin','pins','net','port','func'];const pick=i=>{const o={};F.forEach(k=>{if(i[k]!=null&&i[k]!=='')o[k]=Array.isArray(i[k])?i[k].join(', '):String(i[k]);});return o;};
  const ma=new Map(it(A).map(i=>[key(i),pick(i)])),mb=new Map(it(B).map(i=>[key(i),pick(i)]));
  mb.forEach((b,k)=>{if(!ma.has(k))out.added.push(Object.assign({id:k},b));else{const a=ma.get(k);const f=F.filter(x=>(a[x]||'')!==(b[x]||''));if(f.length)out.changed.push({id:k,fields:f,a,b});}});
  ma.forEach((a,k)=>{if(!mb.has(k))out.removed.push(Object.assign({id:k},a));});return out;}
function diffHousing(A,B){const out={inp:[],over:[],edge:[],feats:{added:[],removed:[],changed:[]}};const ha=A&&A.housing||{},hb=B&&B.housing||{};
  const kv=(a,b,arr)=>{[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].forEach(k=>{const x=a&&a[k],y=b&&b[k];if(JSON.stringify(x)!==JSON.stringify(y))arr.push([k,x==null?'':typeof x==='object'?JSON.stringify(x):x,y==null?'':typeof y==='object'?JSON.stringify(y):y]);});};
  kv(ha.inp,hb.inp,out.inp);kv(ha.cad&&ha.cad.over,hb.cad&&hb.cad.over,out.over);kv(ha.cad&&ha.cad.edge,hb.cad&&hb.cad.edge,out.edge);
  const fa=new Map(((ha.cad&&ha.cad.feats)||[]).map(f=>[f.id,f])),fb=new Map(((hb.cad&&hb.cad.feats)||[]).map(f=>[f.id,f]));
  fb.forEach((f,k)=>{if(!fa.has(k))out.feats.added.push(f);else if(JSON.stringify(fa.get(k))!==JSON.stringify(f))out.feats.changed.push({id:k,a:fa.get(k),b:f});});fa.forEach((f,k)=>{if(!fb.has(k))out.feats.removed.push(f);});
  return out;}
// a and b are restored states ({board, np, hsis}); returns every section plus a one-line summary
function compare(a,b){const d={board:diffBoards(a.board,b.board),arch:diffArch(a.np,b.np),plan:diffPlan(a.np,b.np),hsis:diffHsis(a.hsis,b.hsis),housing:diffHousing(a.board,b.board)};
  d.counts={board:d.board.board.length,bom:d.board.bom.added.length+d.board.bom.removed.length+d.board.bom.changed.length,place:d.board.place.length,
    nets:d.board.nets.added.length+d.board.nets.removed.length+d.board.nets.changed.length,pins:d.board.pins.length,layers:d.board.layers.length,
    arch:d.arch.added.length+d.arch.removed.length+d.arch.changed.length+d.arch.links.added.length+d.arch.links.removed.length,plan:d.plan.added.length+d.plan.removed.length+d.plan.changed.length+(d.plan.req?1:0),
    hsis:d.hsis.added.length+d.hsis.removed.length+d.hsis.changed.length,housing:d.housing.inp.length+d.housing.over.length+d.housing.edge.length+d.housing.feats.added.length+d.housing.feats.removed.length+d.housing.feats.changed.length};
  d.total=Object.values(d.counts).reduce((x,y)=>x+y,0);d.summary=summaryText(d);return d;}
function summaryText(d){const c=d.counts,b=d.board,P=[];if(!d.total)return'변경 없음';
  if(c.board)P.push(b.board.map(([k,x,y])=>`${k} ${x}→${y}`).join(', '));
  if(c.bom){const s=[];if(b.bom.added.length)s.push(`+${b.bom.added.length}`);if(b.bom.removed.length)s.push(`−${b.bom.removed.length}`);if(b.bom.changed.length)s.push(`값 ${b.bom.changed.length}`);P.push(`부품 ${s.join(' ')}`);}
  if(c.place)P.push(`배치 ${c.place}개 이동`);if(c.nets)P.push(`넷 ${c.nets}개`);if(c.layers)P.push(`동박 ${b.layers.map(l=>l.layer).join('·')}`);
  if(c.arch)P.push(`다이어그램 ${c.arch}`);if(c.plan)P.push(`회로 계획 ${c.plan}`);if(c.hsis)P.push(`HSIS ${c.hsis}`);if(c.housing)P.push(`기구 ${c.housing}`);
  return P.join(' · ');}
return{VER,enc,dec,snapshot,restore,stats,compare,summaryText,cuKeysOf,trackLen};
})();
if(typeof module!=='undefined')module.exports=REVLOG;
