/* Schematic editing engine (Eeschema-style): operations on the sheet model used by the viewer, connectivity-driven
   netlist, back-annotation to the board ("Update PCB from Schematic"), a light ERC and a .kicad_sch writer.
   The sheet model is the one SCH.parseKicadSch / SCH.autoSchematic produce: symbols (absolute graphics, pins p=connection
   point / e=body side), wires {a,b}, labels, junctions, nocon. Needs SCH (twoPin, powerSym, finishBB, moveSym, connect). */
const SCHEDIT=(function(){
"use strict";
const GR=1.27,EPS=1e-6;
const snap=v=>Math.round(v/GR)*GR;
const sp=p=>[snap(p[0]),snap(p[1])];
const same=(a,b)=>Math.abs(a[0]-b[0])<1e-3&&Math.abs(a[1]-b[1])<1e-3;
const key=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100);
const onSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)return false;const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l;if(t<=EPS||t>=1-EPS)return false;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/Math.sqrt(l)<0.01;};

/* ---- undo snapshots: geometry only (runtime connectivity fields are rebuilt by SCH.connect) ---- */
const SKIP=new Set(['node','na','nb','_pad','_w','_c','board']);
function snapshot(sheets){return JSON.stringify(sheets,(k,v)=>{if(SKIP.has(k))return undefined;if(k==='g'&&v&&!Array.isArray(v))return undefined;return v;});}
function restore(json){return JSON.parse(json);}

/* ---- symbol transforms ---- */
function anchor(s){const b=s._body||s.bb;return sp([(b[0]+b[2])/2,(b[1]+b[3])/2]);}
function xform(s,f,textToo){
  s.g.forEach(g=>{if(g.pts)g.pts=g.pts.map(f);if(g.c)g.c=f(g.c);if(g.p)g.p=f(g.p);});
  s.pins.forEach(p=>{p.p=f(p.p);p.e=f(p.e);if(p.side)p.side=null;});
  if(textToo!==false)s.texts.forEach(t=>{t.p=f(t.p);});
  if(s._body){const a=f([s._body[0],s._body[1]]),b=f([s._body[2],s._body[3]]);s._body=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
  const xy=f([s.x,s.y]);s.x=xy[0];s.y=xy[1];
  SCH.finishBB(s,0.3);
}
function moveSym(s,dx,dy){xform(s,q=>[q[0]+dx,q[1]+dy]);}
// 90° counter-clockwise on screen (y grows downwards); field texts move with the part but stay upright
function rotate(s){const[ax,ay]=anchor(s);xform(s,q=>[ax+(q[1]-ay),ay-(q[0]-ax)]);s.rot=((s.rot||0)+90)%360;}
function mirror(s,axis){const[ax,ay]=anchor(s);xform(s,axis==='y'?q=>[q[0],2*ay-q[1]]:q=>[2*ax-q[0],q[1]]);
  s.texts.forEach(t=>{if(axis!=='y'&&t.fx.h!=='center')t.fx.h=t.fx.h==='left'?'right':'left';});}
// pins of a symbol that touch wire ends, for drag (G) that keeps connections
function attached(sh,s){const out=[];s.pins.forEach(p=>sh.wires.forEach(w=>{if(same(w.a,p.p))out.push({w,end:'a',pin:p});else if(same(w.b,p.p))out.push({w,end:'b',pin:p});}));return out;}
// would a new segment a→b touch anything it should not (overlap a wire, run over a wire end, pin or label)?
function segBad(sh,a,b,skip){
  if(same(a,b))return false;const h=Math.abs(a[1]-b[1])<1e-3,v=Math.abs(a[0]-b[0])<1e-3;
  const ov=(w)=>{const wh=Math.abs(w.a[1]-w.b[1])<1e-3,wv=Math.abs(w.a[0]-w.b[0])<1e-3;
    if(h&&wh&&Math.abs(w.a[1]-a[1])<1e-3)return Math.min(Math.max(a[0],b[0]),Math.max(w.a[0],w.b[0]))-Math.max(Math.min(a[0],b[0]),Math.min(w.a[0],w.b[0]))>1e-3;
    if(v&&wv&&Math.abs(w.a[0]-a[0])<1e-3)return Math.min(Math.max(a[1],b[1]),Math.max(w.a[1],w.b[1]))-Math.max(Math.min(a[1],b[1]),Math.min(w.a[1],w.b[1]))>1e-3;return false;};
  for(const w of sh.wires){if(skip.has(w))continue;if(ov(w)||onSeg(w.a,a,b)||onSeg(w.b,a,b))return true;}
  for(const s of sh.symbols)for(const p of s.pins)if(onSeg(p.p,a,b))return true;
  for(const l of sh.labels)if(onSeg(l.p,a,b))return true;
  return false;
}
// drag (G): the part moves with the power symbols / labels / NC flags sitting on its pins, and connected wires are re-routed
// with one bend (whichever corner does not touch anything else; a straight diagonal as the last resort)
function drag(sh,s,dx,dy){keep(sh,s,()=>moveSym(s,dx,dy));}
function rotateKeep(sh,s){keep(sh,s,()=>rotate(s));}
function mirrorKeep(sh,s,axis){keep(sh,s,()=>mirror(s,axis));}
// apply a transform to a part and keep everything that was connected to its pins connected
function keep(sh,s,op){
  // split wires touching the part at their branch points first, so only the last piece to each pin gets re-routed
  attached(sh,s).forEach(({w})=>{const i=sh.wires.indexOf(w);if(i<0)return;
    const pts=[];sh.symbols.forEach(o=>o.pins.forEach(p=>pts.push(p.p)));sh.labels.forEach(l=>pts.push(l.p));sh.junctions.forEach(j=>pts.push(j));sh.wires.forEach(x=>{if(x!==w)pts.push(x.a,x.b);});
    const cut=pts.filter(p=>onSeg(p,w.a,w.b));if(!cut.length)return;const k=Math.abs(w.a[0]-w.b[0])>Math.abs(w.a[1]-w.b[1])?0:1;
    const all=[w.a,...cut,w.b].sort((p,q)=>(p[k]-q[k])*(w.b[k]>=w.a[k]?1:-1));const parts=[];for(let j=1;j<all.length;j++)if(!same(all[j-1],all[j]))parts.push({a:all[j-1].slice(),b:all[j].slice()});
    sh.wires.splice(i,1,...parts);});
  const att=attached(sh,s);const pinPts=s.pins.map(p=>p.p.slice());const idx=q=>pinPts.findIndex(p=>same(p,q));
  const riders=sh.symbols.filter(o=>o!==s&&o.power&&o.pins.some(p=>idx(p.p)>=0)).map(o=>({o,i:idx(o.pins[0].p)}));
  const labels=sh.labels.map(l=>({l,i:idx(l.p)})).filter(x=>x.i>=0),ncs=sh.nocon.map(p=>({p,i:idx(p)})).filter(x=>x.i>=0);
  const both=new Set(att.filter(x=>att.filter(y=>y.w===x.w).length>1).map(x=>x.w));
  const ends=att.map(x=>({w:x.w,end:x.end,i:idx(x.pin.p)}));
  op();
  const d=i=>[s.pins[i].p[0]-pinPts[i][0],s.pins[i].p[1]-pinPts[i][1]];
  riders.forEach(({o,i})=>{const v=d(i);if(o.pins[0])moveSym(o,v[0],v[1]);});labels.forEach(({l,i})=>{l.p=s.pins[i].p.slice();});ncs.forEach(({p,i})=>{p[0]=s.pins[i].p[0];p[1]=s.pins[i].p[1];});
  both.forEach(w=>{const ea=ends.find(e=>e.w===w&&e.end==='a'),eb=ends.find(e=>e.w===w&&e.end==='b');w.a=s.pins[ea.i].p.slice();w.b=s.pins[eb.i].p.slice();});
  ends.filter(x=>!both.has(x.w)).forEach(({w,end,i})=>{
    const far=(end==='a'?w.b:w.a).slice(),np=s.pins[i].p.slice();const k=sh.wires.indexOf(w);if(k<0)return;sh.wires.splice(k,1);
    const skip=new Set();const cands=[];
    if(Math.abs(far[0]-np[0])<1e-3||Math.abs(far[1]-np[1])<1e-3)cands.push([[far,np]]);
    else{const cA=[np[0],far[1]],cB=[far[0],np[1]];const horiz=Math.abs(w.a[1]-w.b[1])<1e-3;(horiz?[cA,cB]:[cB,cA]).forEach(c=>cands.push([[far,c],[c,np]]));}
    // Z-shaped detours (two bends) through a free column / row, nearest first
    const zs=[];for(let k=-24;k<=24;k++){const mx=snap((far[0]+np[0])/2)+k*GR,my=snap((far[1]+np[1])/2)+k*GR;
      zs.push([Math.abs(k),[[far,[mx,far[1]]],[[mx,far[1]],[mx,np[1]]],[[mx,np[1]],np]]],[Math.abs(k)+0.5,[[far,[far[0],my]],[[far[0],my],[np[0],my]],[[np[0],my],np]]]);}
    zs.sort((a,b)=>a[0]-b[0]).forEach(z=>cands.push(z[1]));
    cands.push([[far,np]]);
    const ptBad=c=>sh.symbols.some(o=>o.pins.some(p=>same(p.p,c)))||sh.labels.some(l=>same(l.p,c))||sh.wires.some(x=>same(x.a,c)||same(x.b,c)||onSeg(c,x.a,x.b));
    const ok=path=>path.every(([p,q])=>!segBad(sh,p,q,skip))&&path.slice(1).every(([p])=>!ptBad(p));
    const pick=cands.find(ok)||[[far,np]];
    pick.forEach(([p,q])=>{if(!same(p,q))sh.wires.push({a:p.slice(),b:q.slice()});});});
  cleanWires(sh);
}
function moveLabel(l,dx,dy){l.p=[l.p[0]+dx,l.p[1]+dy];}

/* ---- wires, labels, junctions ---- */
// orthogonal path between two points: horizontal first unless vfirst
function lpath(a,b,vfirst){a=sp(a);b=sp(b);if(Math.abs(a[0]-b[0])<1e-3||Math.abs(a[1]-b[1])<1e-3)return[[a,b]];const c=vfirst?[a[0],b[1]]:[b[0],a[1]];return[[a,c],[c,b]];}
function addWire(sh,a,b,vfirst){lpath(a,b,vfirst).forEach(([p,q])=>{if(!same(p,q))sh.wires.push({a:p,b:q});});cleanWires(sh);}
// merge collinear touching segments of the same run, drop zero-length ones, then recompute junction dots
function cleanWires(sh){
  sh.wires=sh.wires.filter(w=>!same(w.a,w.b));
  const pins=new Set();sh.symbols.forEach(s=>s.pins.forEach(p=>pins.add(key(p.p))));sh.labels.forEach(l=>pins.add(key(l.p)));
  for(let changed=true,guard=0;changed&&guard<200;guard++){changed=false;
    outer:for(let i=0;i<sh.wires.length;i++)for(let j=i+1;j<sh.wires.length;j++){const u=sh.wires[i],v=sh.wires[j];
      const hu=Math.abs(u.a[1]-u.b[1])<1e-3,hv=Math.abs(v.a[1]-v.b[1])<1e-3;if(hu!==hv)continue;
      if(hu&&Math.abs(u.a[1]-v.a[1])>1e-3)continue;if(!hu&&Math.abs(u.a[0]-v.a[0])>1e-3)continue;
      const ends=[[u.a,v.a],[u.a,v.b],[u.b,v.a],[u.b,v.b]];const sharedEnd=ends.find(([p,q])=>same(p,q));
      const k=hu?0:1;const lo=x=>Math.min(x.a[k],x.b[k]),hi=x=>Math.max(x.a[k],x.b[k]);
      const overlap=Math.min(hi(u),hi(v))-Math.max(lo(u),lo(v));
      if(overlap>1e-3||sharedEnd){const p=sharedEnd&&sharedEnd[0];
        if(!overlap&&p){const k2=key(p);const deg=sh.wires.filter(w=>same(w.a,p)||same(w.b,p)).length;if(deg!==2||pins.has(k2))continue;}
        const a=Math.min(lo(u),lo(v)),b=Math.max(hi(u),hi(v));const c=hu?u.a[1]:u.a[0];
        sh.wires[i]=hu?{a:[a,c],b:[b,c]}:{a:[c,a],b:[c,b]};sh.wires.splice(j,1);changed=true;break outer;}}}
  junctions(sh);
}
function junctions(sh){
  const cnt=new Map();const bump=(p,n)=>{const k=key(p);const e=cnt.get(k)||{p,n:0,w:0};e.n+=n;cnt.set(k,e);return e;};
  sh.wires.forEach(w=>{bump(w.a,1).w++;bump(w.b,1).w++;});
  const pts=[...cnt.values()].map(e=>e.p);
  sh.symbols.forEach(s=>s.pins.forEach(p=>{const e=cnt.get(key(p.p));if(e)e.n++;else pts.push(p.p);}));
  // a wire end (or pin) landing inside another wire makes a T
  const inner=new Map();pts.forEach(p=>sh.wires.forEach(w=>{if(onSeg(p,w.a,w.b)){const k=key(p);inner.set(k,(inner.get(k)||0)+2);}}));
  const out=[];cnt.forEach((e,k)=>{if(e.w&&e.n+(inner.get(k)||0)>=3)out.push(e.p);});
  inner.forEach((v,k)=>{if(!cnt.has(k)){const p=pts.find(q=>key(q)===k);const isPin=sh.symbols.some(s=>s.pins.some(x=>key(x.p)===k));if(p&&isPin)out.push(p);}});
  sh.junctions=out;
}
function addLabel(sh,kind,name,p,rot){const l={kind:kind||'local',s:name,p:sp(p),rot:rot||0,fx:{size:1.27,h:(rot===180?'right':'left'),v:'bottom'}};if(kind==='global')l.shape='bidirectional';sh.labels.push(l);return l;}
function addPower(sh,net,p,dir,gnd){const s=SCH.powerSym(net,sp(p),dir==null?(gnd?1:3):dir,!!gnd);sh.symbols.push(s);return s;}
function addNoConnect(sh,p){p=sp(p);if(!sh.nocon.some(q=>same(q,p)))sh.nocon.push(p);}

/* ---- parts ---- */
const LIB=[
  {id:'R',label:'저항',prefix:'R',val:'10kΩ',fp:'0603',pins:[['1',''],['2','']]},
  {id:'C',label:'커패시터',prefix:'C',val:'100nF',fp:'0603',pins:[['1',''],['2','']]},
  {id:'CP',label:'전해 커패시터',prefix:'C',val:'470µF',fp:'CP-SMD-10x10',kind:'elcap',pins:[['1','+'],['2','−']]},
  {id:'L',label:'인덕터',prefix:'L',val:'10µH',fp:'1210',pins:[['1',''],['2','']]},
  {id:'FB',label:'페라이트 비드',prefix:'FB',val:'600Ω@100MHz',fp:'0603',pins:[['1',''],['2','']]},
  {id:'D',label:'다이오드',prefix:'D',val:'SS14',fp:'SMA',pins:[['1','K'],['2','A']]},
  {id:'LED',label:'LED',prefix:'D',val:'LED',fp:'LED-0603',kind:'led',pins:[['1','K'],['2','A']]},
];
function nextRef(sheets,prefix,B){const used=new Set();sheets.forEach(sh=>sh.symbols.forEach(s=>{if(!s.power)used.add(s.ref);}));if(B)B.comps.forEach(c=>used.add(c.ref));
  for(let i=1;;i++)if(!used.has(prefix+i))return prefix+i;}
function newPart(type,ref,at,vert){
  const L=LIB.find(x=>x.id===type)||LIB[0];
  const pads=L.pins.map(([n,fn])=>({n,fn,net:null}));
  const c={ref,val:L.val,fp:L.fp,kind:L.kind||(type==='LED'?'led':''),pads};
  // diodes: anode left (pin 2), cathode right (pin 1) as drawn
  const order=/^(D|LED)$/.test(type)?[pads[1],pads[0]]:pads;
  const s=SCH.twoPin(c,order,!!vert);delete s._c;s.lib='auto';s.fp=L.fp;s.kind=c.kind;s._new=true;
  const a=anchor(s);moveSym(s,snap(at[0])-a[0],snap(at[1])-a[1]);
  return s;
}
// a board part that has no symbol yet, as a generic box (or 2-pin symbol)
function boardPart(c,at){
  const uniq=[...new Map(c.pads.map(p=>[String(p.n),p])).values()];let s;
  if(uniq.length===2&&/^(R|C|L|FB|D|LED|F|Y|X)\d/i.test(c.ref))s=SCH.twoPin(c,uniq,false);
  else{const half=Math.ceil(uniq.length/2);s=SCH.boxSym(c,{L:uniq.slice(0,half),R:uniq.slice(half),T:[],B:[]},()=>null).s;}
  delete s._c;const a=anchor(s);moveSym(s,snap(at[0])-a[0],snap(at[1])-a[1]);return s;
}

/* ---- hit testing ---- */
function hitWire(sh,x,y,tol){let best=null,bd=tol;sh.wires.forEach(w=>{const d=PCB.segDist(x,y,w.a,w.b);if(d<bd){bd=d;best=w;}});return best;}
function hitPinEnd(sh,p,tol){for(const s of sh.symbols)for(const q of s.pins)if(Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<=tol)return{s,pin:q};return null;}
// points where a wire may end (pins, wire ends and interiors, labels)
function isConnPoint(sh,p){p=sp(p);return sh.symbols.some(s=>s.pins.some(q=>same(q.p,p)))||sh.wires.some(w=>same(w.a,p)||same(w.b,p)||onSeg(p,w.a,w.b))||sh.labels.some(l=>same(l.p,p));}

/* ---- delete ---- */
function remove(sh,item){
  if(!item)return false;
  const del=(arr,o)=>{const i=arr.indexOf(o);if(i>=0){arr.splice(i,1);return true;}return false;};
  const ok=del(sh.symbols,item)||del(sh.wires,item)||del(sh.labels,item)||del(sh.junctions,item)||del(sh.nocon,item);
  if(ok)cleanWires(sh);return ok;
}

/* ---- netlist from the schematic (labels / power names first, then the board's current name, then Net-(REF-PadN)) ---- */
function netlist(sheets,B){
  const c=SCH.connect(sheets,null);const used=new Set();const pinNet=new Map();const conflicts=[];
  const named=c.groups.filter(g=>g.names.size),anon=c.groups.filter(g=>!g.names.size&&g.pins.length);
  named.forEach(g=>{const nm=[...g.names];if(nm.length>1)conflicts.push(nm);const n=nm.sort((a,b)=>a.length-b.length||a.localeCompare(b))[0];used.add(n);g.pins.forEach(p=>pinNet.set(p.ref+'.'+p.num,n));});
  // keep board names for wired-only nets when they are unambiguous
  const vote=g=>{const m=new Map();g.pins.forEach(p=>{const cc=B&&B.byRef[p.ref];const pad=cc&&cc.pads.find(q=>String(q.n)===String(p.num));if(pad&&pad.net)m.set(pad.net,(m.get(pad.net)||0)+1);});return[...m.entries()].sort((a,b)=>b[1]-a[1]);};
  anon.sort((a,b)=>b.pins.length-a.pins.length).forEach(g=>{
    const v=vote(g);let n=v.length&&!used.has(v[0][0])&&(v.length===1||v[0][1]>v[1][1])?v[0][0]:null;
    if(!n&&g.pins.length<2)return; // a lone pin with nothing attached: unconnected
    if(!n){const p=g.pins.slice().sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true}))[0];n=`Net-(${p.ref}-Pad${p.num})`;}
    used.add(n);g.pins.forEach(p=>pinNet.set(p.ref+'.'+p.num,n));});
  return{pinNet,conflicts,groups:c.groups};
}
// differences between schematic and board, like Eeschema's Update PCB from Schematic
function annotate(sheets,B){
  const nl=netlist(sheets,B);const changes=[];const seen=new Set();const sym=new Map();
  sheets.forEach(sh=>sh.symbols.forEach(s=>{if(s.power)return;if(!sym.has(s.ref))sym.set(s.ref,[]);sym.get(s.ref).push(s);}));
  sym.forEach((ss,ref)=>{const c=B.byRef[ref];const s=ss[0];
    if(!c){changes.push({kind:'add',ref,val:s.val,fp:s.fp,sym:s,pins:ss.flatMap(x=>x.pins.map(p=>({num:p.num,name:p.name,net:nl.pinNet.get(ref+'.'+p.num)||null})))});return;}
    if((s.val||'')!==(c.val||''))changes.push({kind:'value',ref,from:c.val,to:s.val});
    const nums=new Set(ss.flatMap(x=>x.pins.map(p=>String(p.num))));
    c.pads.forEach(p=>{const k=ref+'.'+p.n;if(!nums.has(String(p.n))||seen.has(k+'|'+p.x+','+p.y))return;seen.add(k+'|'+p.x+','+p.y);
      const to=nl.pinNet.get(k)||null;if((p.net||null)!==to)changes.push({kind:'net',ref,pin:String(p.n),from:p.net||null,to});});});
  const missing=B.comps.filter(c=>!sym.has(c.ref)&&c.pads.some(p=>p.net)).map(c=>c.ref);
  return{changes,missing,conflicts:nl.conflicts};
}
function applyAnnotation(B,res,addPart){
  let n=0;res.changes.forEach(ch=>{
    if(ch.kind==='value'){B.byRef[ch.ref].val=ch.to;n++;}
    else if(ch.kind==='net'){B.byRef[ch.ref].pads.forEach(p=>{if(String(p.n)===ch.pin){p.net=ch.to;}});n++;}
    else if(ch.kind==='add'&&addPart){if(addPart(ch))n++;}});
  return n;
}

/* ---- electrical rules (light) ---- */
function erc(sheets){
  const out=[];SCH.connect(sheets,null);
  sheets.forEach((sh,pi)=>{
    const wireEnds=new Map();sh.wires.forEach(w=>[w.a,w.b].forEach(p=>{const k=key(p);wireEnds.set(k,(wireEnds.get(k)||0)+1);}));
    const touches=p=>sh.symbols.some(s=>s.pins.some(q=>same(q.p,p)))||sh.labels.some(l=>same(l.p,p))||sh.wires.some(w=>onSeg(p,w.a,w.b))||(wireEnds.get(key(p))||0)>1||sh.nocon.some(q=>same(q,p));
    sh.wires.forEach(w=>[w.a,w.b].forEach(p=>{if(!touches(p))out.push({page:pi,p,code:'dangling',msg:'끝이 아무 데도 연결되지 않은 배선'});}));
    sh.symbols.forEach(s=>{if(s.power)return;s.pins.forEach(p=>{const g=p.g;if(sh.nocon.some(q=>same(q,p.p)))return;
      if(g&&g.pins.length<=1&&!g.names.size)out.push({page:pi,p:p.p,code:'unconnected',msg:`${s.ref}.${p.num}${p.name?' ('+p.name+')':''} 핀이 연결되지 않음`});});});
    sh.labels.forEach(l=>{const g=l.g;if(g&&!g.pins.length)out.push({page:pi,p:l.p,code:'label',msg:`라벨 ${l.s}에 연결된 핀이 없음`});});
  });
  return out;
}

/* ---- .kicad_sch writer (KiCad 6+ S-expression; one lib symbol per placed part keeps auto-drawn symbols exact) ---- */
const q=s=>'"'+String(s==null?'':s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
const n=v=>(Math.round(v*10000)/10000).toString();
let uu=0;const uuid=seed=>{uu++;const h=(x)=>{let a=2166136261^x;for(const ch of String(seed)+':'+uu){a^=ch.charCodeAt(0);a=Math.imul(a,16777619)>>>0;}return a.toString(16).padStart(8,'0');};
  const s=h(1)+h(2)+h(3)+h(4);return`${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;};
const fx=(size,h,v)=>`(effects (font (size ${n(size)} ${n(size)}))${h&&h!=='center'||v&&v!=='middle'?` (justify${h&&h!=='center'?' '+h:''}${v&&v!=='middle'?' '+v:''})`:''})`;
function libName(s){return(s.power?'power:':'pcbviewer:')+(s.power?s.val:s.ref).replace(/[^\w+\-.]/g,'_');}
function libSym(s){
  const out=[];const name=libName(s);const units=s._units||[s];
  out.push(`  (symbol ${q(name)}${s.power?' (power)':''} (pin_names (offset 0.508)) (in_bom ${s.power?'no':'yes'}) (on_board ${s.power?'no':'yes'})`);
  out.push(`   (property "Reference" ${q(s.power?'#PWR':s.ref.replace(/\d+$/,''))} (at 0 0 0) ${fx(1.27)})`,`   (property "Value" ${q(s.val)} (at 0 0 0) ${fx(1.27)})`);
  units.forEach((u,k)=>{const L=(p)=>[p[0]-u.x,-(p[1]-u.y)];
    out.push(`   (symbol ${q(name.split(':')[1]+'_'+(units.length>1?k+1:1)+'_1')}`);
    u.g.forEach(g=>{if(g.t==='poly')out.push(`    (polyline (pts ${g.pts.map(p=>{const l=L(p);return`(xy ${n(l[0])} ${n(l[1])})`;}).join(' ')}) (stroke (width ${n(g.w||0.254)}) (type default)) (fill (type ${g.fill==='background'?'background':g.fill==='outline'?'outline':'none'})))`);
      else if(g.t==='circle'){const l=L(g.c);out.push(`    (circle (center ${n(l[0])} ${n(l[1])}) (radius ${n(g.r)}) (stroke (width ${n(g.w||0.254)}) (type default)) (fill (type none)))`);}
      else if(g.t==='text'){const l=L(g.p);out.push(`    (text ${q(g.s)} (at ${n(l[0])} ${n(l[1])} ${n((g.rot||0)*10)}) ${fx(g.fx.size)})`);}});
    u.pins.forEach(p=>{const a=L(p.p),b=L(p.e);const len=Math.hypot(b[0]-a[0],b[1]-a[1]);const ang=Math.round(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+360)%360;
      out.push(`    (pin ${s.power?'power_in':'passive'} line (at ${n(a[0])} ${n(a[1])} ${ang}) (length ${n(len)})${s.power?' hide':''} (name ${q(p.name||'~')} ${fx(1.27)}) (number ${q(p.num)} ${fx(1.27)}))`);});
    out.push('   )');});
  out.push('  )');return out.join('\n');
}
function sheetText(sh,opt){
  const o=[];const pap=sh.paper&&/^A[0-5]$/.test(sh.paper)?`(paper ${q(sh.paper)})`:`(paper "User" ${n(sh.w)} ${n(sh.h)})`;
  o.push(`(kicad_sch (version 20230121) (generator pcb_viewer)`,` (uuid ${q(opt.selfUuid||uuid(sh.name))})`,` ${pap}`,
    ` (title_block (title ${q(sh.title||opt.title||'')}) (date ${q(opt.date||'')}) (rev ${q(sh.rev||'')}) (company ${q(sh.company||'')}) (comment 1 ${q(sh.name||'')}))`);
  const libs=new Map();sh.symbols.forEach(s=>{const k=libName(s);if(!libs.has(k))libs.set(k,libSym(s));});
  o.push(' (lib_symbols',...libs.values(),' )');
  sh.junctions.forEach(j=>o.push(` (junction (at ${n(j[0])} ${n(j[1])}) (diameter 0) (color 0 0 0 0) (uuid ${q(uuid('j'))}))`));
  sh.nocon.forEach(p=>o.push(` (no_connect (at ${n(p[0])} ${n(p[1])}) (uuid ${q(uuid('nc'))}))`));
  sh.wires.forEach(w=>o.push(` (wire (pts (xy ${n(w.a[0])} ${n(w.a[1])}) (xy ${n(w.b[0])} ${n(w.b[1])})) (stroke (width 0) (type default)) (uuid ${q(uuid('w'))}))`));
  (sh.buses||[]).forEach(w=>o.push(` (bus (pts (xy ${n(w.a[0])} ${n(w.a[1])}) (xy ${n(w.b[0])} ${n(w.b[1])})) (stroke (width 0) (type default)) (uuid ${q(uuid('b'))}))`));
  sh.labels.forEach(l=>{const r=((l.rot||0)%360+360)%360;const j=r===180||r===270?'right':'left';
    if(l.kind==='global')o.push(` (global_label ${q(l.s)} (shape ${l.shape||'bidirectional'}) (at ${n(l.p[0])} ${n(l.p[1])} ${r}) (fields_autoplaced) ${fx(1.27,j)} (uuid ${q(uuid('gl'))}))`);
    else if(l.kind==='hier')o.push(` (hierarchical_label ${q(l.s)} (shape ${l.shape||'bidirectional'}) (at ${n(l.p[0])} ${n(l.p[1])} ${r}) ${fx(1.27,j)} (uuid ${q(uuid('hl'))}))`);
    else o.push(` (label ${q(l.s)} (at ${n(l.p[0])} ${n(l.p[1])} ${r}) (fields_autoplaced) ${fx(1.27,j,'bottom')} (uuid ${q(uuid('l'))}))`);});
  (sh.texts||[]).forEach(t=>o.push(` (text ${q(t.s)} (at ${n(t.p[0])} ${n(t.p[1])} ${n(t.rot||0)}) ${fx(t.fx.size||1.27,'left','bottom')} (uuid ${q(uuid('t'))}))`));
  opt.pw=opt.pw||{n:0};
  sh.symbols.forEach(s=>{const ref=s.power?`#PWR0${String(++opt.pw.n).padStart(2,'0')}`:s.ref;const tx=s.texts.find(t=>t.role==='Reference')||{p:[s.x,s.y-2.54],fx:{size:1.27}},tv=s.texts.find(t=>t.role==='Value')||{p:[s.x,s.y+2.54],fx:{size:1.27}};
    o.push(` (symbol (lib_id ${q(libName(s))}) (at ${n(s.x)} ${n(s.y)} 0) (unit ${s._unit||1}) (in_bom ${s.power?'no':'yes'}) (on_board ${s.power?'no':'yes'}) (uuid ${q(uuid(ref))})`,
      `  (property "Reference" ${q(ref)} (at ${n(tx.p[0])} ${n(tx.p[1])} 0) ${s.power?'(effects (font (size 1.27 1.27)) hide)':fx(tx.fx.size||1.27,tx.fx.h,tx.fx.v)})`,
      `  (property "Value" ${q(s.val)} (at ${n(tv.p[0])} ${n(tv.p[1])} 0) ${fx(tv.fx.size||1.27,tv.fx.h,tv.fx.v)})`,
      `  (property "Footprint" ${q(s.fp||'')} (at ${n(s.x)} ${n(s.y)} 0) (effects (font (size 1.27 1.27)) hide))`,
      ...s.pins.map(p=>`  (pin ${q(p.num)} (uuid ${q(uuid(ref+p.num))}))`),
      `  (instances (project ${q(opt.project||'pcb_viewer')} (path ${q(opt.path||'/'+(opt.rootUuid||''))} (reference ${q(ref)}) (unit ${s._unit||1})))))`);});
  if(opt.children){let y=20;opt.children.forEach((c,i)=>{o.push(` (sheet (at 20 ${y}) (size 60 12) (fields_autoplaced) (stroke (width 0.1524) (type solid)) (fill (color 0 0 0 0.0000)) (uuid ${q(c.uuid)})`,
    `  (property "Sheetname" ${q(c.name)} (at 20 ${n(y-0.7)} 0) ${fx(1.27,'left','bottom')})`,`  (property "Sheetfile" ${q(c.file)} (at 20 ${n(y+12.6)} 0) ${fx(1.27,'left','top')})`,
    `  (instances (project ${q(opt.project||'pcb_viewer')} (path ${q('/'+(opt.rootUuid||''))} (page ${q(String(i+2))})))))`);y+=20;});}
  o.push(` (sheet_instances (path "/" (page "1")))`,')');return o.join('\n')+'\n';
}
// KiCad joins wires only at end points: split every wire at pins, labels, junctions and other wire ends on its interior
function splitWires(sh){
  const pts=[];sh.symbols.forEach(s=>s.pins.forEach(p=>pts.push(p.p)));sh.labels.forEach(l=>pts.push(l.p));sh.junctions.forEach(j=>pts.push(j));sh.wires.forEach(w=>pts.push(w.a,w.b));
  const out=[];sh.wires.forEach(w=>{const cut=pts.filter(p=>onSeg(p,w.a,w.b));if(!cut.length){out.push(w);return;}
    const k=Math.abs(w.a[0]-w.b[0])>Math.abs(w.a[1]-w.b[1])?0:1;const all=[w.a,...cut,w.b].sort((p,q)=>(p[k]-q[k])*(w.b[k]>=w.a[k]?1:-1));
    for(let i=1;i<all.length;i++)if(!same(all[i-1],all[i]))out.push({a:all[i-1],b:all[i]});});
  sh.wires=out;
}
// name wired-only nets with a local label so KiCad keeps the board's net names
function nameNets(sheets,B){
  const c=SCH.connect(sheets,B);
  sheets.forEach(sh=>{const done=new Set();
    sh.wires.forEach(w=>{const g=w.g;if(!g||g.names.size||!g.net||done.has(g)||/^Net-\(/.test(g.net))return;
      const hs=sh.wires.filter(x=>x.g===g&&Math.abs(x.a[1]-x.b[1])<1e-3&&Math.abs(x.a[0]-x.b[0])>=2*GR-1e-3).sort((a,b)=>Math.abs(b.a[0]-b.b[0])-Math.abs(a.a[0]-a.b[0]));
      const h=hs[0];if(!h)return;const x0=Math.min(h.a[0],h.b[0]),x1=Math.max(h.a[0],h.b[0]);
      const len=String(g.net).length*1.15+1;let x=x1-x0>len+2*GR?x0+GR:snap((x0+x1)/2);x=snap(x);if(x<=x0+1e-3)x=x0+GR;
      sh.labels.push({kind:'local',s:g.net,p:[x,h.a[1]],rot:0,fx:{size:1.27,h:'left',v:'bottom'}});done.add(g);});});
  return c;
}
function toKicad(sheets,meta){
  meta=meta||{};sheets=restore(snapshot(sheets));if(meta.board)nameNets(sheets,meta.board);sheets.forEach(splitWires);
  const byRef=new Map();sheets.forEach(sh=>sh.symbols.forEach(x=>{if(x.power)return;if(!byRef.has(x.ref))byRef.set(x.ref,[]);byRef.get(x.ref).push(x);}));
  byRef.forEach(list=>{if(list.length>1)list.forEach((x,k)=>{x._unit=k+1;x._units=list;});});const base=String(meta.name||'schematic').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'schematic';uu=0;
  const rootUuid=uuid('root');const opt={title:meta.title||'',project:base,date:meta.date||'',rootUuid,selfUuid:rootUuid,pw:{n:0}};
  if(sheets.length===1)return[{name:base+'.kicad_sch',text:sheetText(sheets[0],opt)}];
  const kids=sheets.map((sh,i)=>({name:(sh.name||`page${i+1}`).replace(/^\d+\.\s*/,''),file:`${base}_${i+1}.kicad_sch`,sh,uuid:uuid('sheet'+i)}));
  const root={name:'root',title:meta.title||'',symbols:[],wires:[],junctions:[],nocon:[],labels:[],texts:[{s:'자동 생성 회로도 · 하위 시트로 나뉨',p:[20,12],rot:0,fx:{size:1.5}}],w:297,h:210,paper:'A4'};
  return[{name:base+'.kicad_sch',text:sheetText(root,Object.assign({},opt,{children:kids}))}].concat(kids.map(k=>({name:k.file,text:sheetText(k.sh,Object.assign({},opt,{selfUuid:uuid(k.file),path:'/'+rootUuid+'/'+k.uuid}))})));
}

return{GR,snap,sp,same,snapshot,restore,anchor,rotate,mirror,moveSym,drag,rotateKeep,mirrorKeep,keep,moveLabel,lpath,addWire,cleanWires,junctions,addLabel,addPower,addNoConnect,
  LIB,nextRef,newPart,boardPart,splitWires,nameNets,hitWire,hitPinEnd,isConnPoint,remove,netlist,annotate,applyAnnotation,erc,toKicad,onSeg};
})();
if(typeof module!=='undefined')module.exports=SCHEDIT;
