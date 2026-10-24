/* ---------- board snapshot: a placed + routed board stored compactly and restored onto a freshly generated one ----------
   The parts, nets and footprints come from the generator (same plan → same board); the snapshot only carries what layout
   added: layer count, part positions, copper (tracks, paths, fill rectangles), vias and the power report.
   Coordinates are integers in µm, nets are indices into snap.nets. */
const BOARDSNAP=(function(){
const U=1000,q=v=>Math.round(v*U),f=v=>v/U;
const FLAG={auto:1,fan:2,stitch:4,inpad:8};
const flags=o=>Object.keys(FLAG).reduce((m,k)=>o[k]?m|FLAG[k]:m,0);
const unflag=(o,m)=>{Object.keys(FLAG).forEach(k=>{if(m&FLAG[k])o[k]=true;});return o;};
function save(B,meta){const keys=PCB.cuKeys(B);const nets=[];const ni=n=>{if(n==null)return-1;let i=nets.indexOf(n);if(i<0){i=nets.length;nets.push(n);}return i;};
  const S={v:1,meta:meta||{},layers:keys.length,oz:B.oz,dT:B.dT,nets,place:[],seg:[],path:[],fill:[],via:[],
    board:{W:B.W,H:B.H,outline:B.outline.map(r=>r.map(p=>[q(p[0]),q(p[1])])),holes:B.drills.filter(d=>!d.plated&&!d.own&&!d._pad).map(d=>[q(d.x),q(d.y)])}};
  B.comps.forEach(c=>S.place.push([c.ref,q(c.x),q(c.y),Math.round(c.rot||0),c.side==='B'?1:0]));
  keys.forEach((k,L)=>B.layers[k+'.cu'].forEach(p=>{
    if(p.t==='seg')S.seg.push([L,ni(p.net),q(p.a[0]),q(p.a[1]),q(p.b[0]),q(p.b[1]),q(p.w),flags(p)]);
    else if(p.t==='path')S.path.push([L,ni(p.net),q(p.w),flags(p)].concat(...p.pts.map(t=>[q(t[0]),q(t[1])])));
    else if(p.t==='poly'&&p.rect&&p.fill)S.fill.push([L,ni(p.net)].concat(p.rect.map(q)));}));
  B.vias.forEach(v=>S.via.push([ni(v.net),q(v.x),q(v.y),q(v.d),q(v.drill),flags(v),v.fillL!=null?v.fillL:-1]));
  if(B.powerReport)S.powerReport=JSON.parse(JSON.stringify(B.powerReport));
  if(B.powerBus)S.powerBus=JSON.parse(JSON.stringify(B.powerBus));
  return S;}
/* restore onto B (the board generated from the same plan): layers, placement, copper, vias. Returns the parts it could
   not find (should be none). */
function apply(B,S){if(!S||S.v!==1)throw new Error('스냅샷 형식이 다릅니다.');
  if(S.layers&&S.layers!==PCB.cuKeys(B).length)PCBEDIT.setLayers(B,S.layers);
  if(S.oz)B.oz=S.oz;if(S.dT)B.dT=S.dT;
  if(S.board){const b=S.board;if(Math.abs(B.W-b.W)>1e-6||Math.abs(B.H-b.H)>1e-6)PCBEDIT.resizeBoard(B,b.W,b.H,{anchor:'center'});
    B.W=b.W;B.H=b.H;B.outline=b.outline.map(r=>r.map(p=>[f(p[0]),f(p[1])]));const hs=B.drills.filter(d=>!d.plated&&!d.own&&!d._pad);hs.forEach((d,i)=>{if(b.holes[i]){d.x=f(b.holes[i][0]);d.y=f(b.holes[i][1]);}});}
  const miss=[];const byRef=new Map(B.comps.map(c=>[c.ref,c]));
  S.place.forEach(([ref,x,y,rot,side])=>{const c=byRef.get(ref);if(!c){miss.push(ref);return;}
    if(c.side==='B')PCBEDIT.flip(B,c);if(Math.abs(c.rot||0)>1e-9)PCBEDIT.rotate(B,c,-(c.rot||0));c.rot=0;
    if(side)PCBEDIT.flip(B,c);if(rot)PCBEDIT.rotate(B,c,rot-(c.rot||0));PCBEDIT.move(B,c,f(x)-c.x,f(y)-c.y);});
  const keys=PCB.cuKeys(B);const net=i=>i<0?null:S.nets[i];
  keys.forEach(k=>{B.layers[k+'.cu']=B.layers[k+'.cu'].filter(p=>!(p.t==='seg'||p.t==='path'||(p.t==='poly'&&p.fill)));});
  S.seg.forEach(([L,n,ax,ay,bx,by,w,m])=>{const p=unflag({t:'seg',a:[f(ax),f(ay)],b:[f(bx),f(by)],w:f(w),net:net(n)},m);if(m&FLAG.auto)p._side=keys[L];B.layers[keys[L]+'.cu'].push(p);});
  S.path.forEach(r=>{const [L,n,w,m]=r;const pts=[];for(let i=4;i<r.length;i+=2)pts.push([f(r[i]),f(r[i+1])]);const p=unflag({t:'path',pts,w:f(w),net:net(n)},m);if(m&FLAG.auto)p._side=keys[L];B.layers[keys[L]+'.cu'].push(p);});
  S.fill.forEach(([L,n,x0,y0,x1,y1])=>{const R=[f(x0),f(y0),f(x1),f(y1)];B.layers[keys[L]+'.cu'].push({t:'poly',rings:[[[R[0],R[1]],[R[2],R[1]],[R[2],R[3]],[R[0],R[3]]]],rect:R,net:net(n),fill:true});});
  B.vias=S.via.map(([n,x,y,d,dr,m,fl])=>{const v=unflag({x:f(x),y:f(y),d:f(d),drill:f(dr),net:net(n)},m);if(fl>=0)v.fillL=fl;return v;});
  if(S.powerReport)B.powerReport=JSON.parse(JSON.stringify(S.powerReport));
  if(S.powerBus)B.powerBus=JSON.parse(JSON.stringify(S.powerBus));
  B.pcbPending=false;PCBEDIT.rebuildNets(B);return{missing:miss};}
return{save,apply};
})();
if(typeof module!=='undefined')module.exports=BOARDSNAP;
