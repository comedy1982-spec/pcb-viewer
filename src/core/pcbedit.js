/* PCB layout editing (Pcbnew-style): rigid part transforms that carry pads, drills, silkscreen and body, interactive tracks
   and vias, net bookkeeping, live ratsnest (copper islands joined by a minimum spanning tree), DRC (clearance, holes,
   courtyards, board edge) and a .kicad_pcb writer. World frame: mm, y up (as drawn by the viewer). Needs PCB, AUTOROUTE. */
const PCBEDIT=(function(){
"use strict";
const D2R=Math.PI/180;
const snapTo=(v,g)=>Math.round(v/g)*g;
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(String(n||'').replace(/^\//,''));

/* ---- ownership: silkscreen / drills that move with a part ---- */
function prepare(B){
  if(B._pe)return;B._pe=true;
  B.comps.forEach(c=>c.pads.forEach(p=>{if(p.drill&&!p._dr){const d=B.drills.find(d=>d.plated&&!d._pad&&Math.abs(d.x-p.x)<1e-4&&Math.abs(d.y-p.y)<1e-4);if(d){p._dr=d;d._pad=p;d.own=c;}}}));
  // silkscreen without an owner (e.g. older data): the nearest part whose box holds it, or its reference text
  ['T.silk','B.silk'].forEach(L=>B.layers[L].forEach(p=>{if(p.own)return;
    if(p.t==='text'){const c=B.comps.find(c=>c.ref===p.s&&Math.hypot(c.x-p.x,c.y-p.y)<Math.max(6,(c.bb[2]-c.bb[0])));if(c){p.own=c;return;}}
    const pts=primPts(p);if(!pts.length)return;
    const c=B.comps.find(c=>{const b=c.bb,m=1.2;return pts.every(q=>q[0]>=b[0]-m&&q[0]<=b[2]+m&&q[1]>=b[1]-m&&q[1]<=b[3]+m)&&(L[0]===c.side);});if(c)p.own=c;}));
}
function primPts(p){if(p.t==='seg')return[p.a,p.b];if(p.t==='path')return p.pts;if(p.t==='poly')return p.rings.flat();if(p.x!=null)return[[p.x,p.y]];return[];}

/* ---- rigid transforms ---- */
// f maps a world point; da = angle change (deg); mir = mirrored (flip)
function applyComp(B,c,f,da,mir){
  const ang=a=>mir?((-(a||0))%360+360)%360:(((a||0)+da)%360+360)%360;
  const xy=o=>{const q=f([o.x,o.y]);o.x=q[0];o.y=q[1];};
  [c.x,c.y]=f([c.x,c.y]);c.rot=mir?((-(c.rot||0))%360+360)%360:(((c.rot||0)+da)%360+360)%360;
  c.pads.forEach(p=>{xy(p);p.ang=ang(p.ang);
    if(mir&&p.parts){p.parts=p.parts.map(q=>q.c?{c:[-q.c[0],q.c[1],q.c[2]]}:{p:q.p.map(v=>[-v[0],v[1]])});if(p.lbb)p.lbb=[-p.lbb[2],p.lbb[1],-p.lbb[0],p.lbb[3]];}
    if(p._dr){p._dr.x=p.x;p._dr.y=p.y;if(p._dr.ang!=null)p._dr.ang=p.ang;}});
  B.drills.forEach(d=>{if(d.own===c&&!d._pad){xy(d);}});
  if(c.body){const q=f([c.body.cx,c.body.cy]);c.body.cx=q[0];c.body.cy=q[1];c.body.ang=ang(c.body.ang);}
  if(c.lab)c.lab=f(c.lab);
  Object.keys(B.layers).forEach(L=>B.layers[L].forEach(p=>{if(p.own!==c||p.t==='pad')return;
    if(p.t==='seg'){p.a=f(p.a);p.b=f(p.b);}else if(p.t==='path')p.pts=p.pts.map(f);else if(p.t==='poly')p.rings=p.rings.map(r=>r.map(f));
    else if(p.x!=null){xy(p);if(p.t==='text'){p.ang=mir?-(p.ang||0):((p.ang||0)+da);if(mir)p.mir=!p.mir;}}}));
  bbox(c);
}
function bbox(c){const pts=[];const bd=c.body;
  if(bd&&bd.w>0){const a=bd.ang*D2R;[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{const lx=sx*bd.w/2,ly=sy*bd.h/2;pts.push([bd.cx+lx*Math.cos(a)-ly*Math.sin(a),bd.cy+lx*Math.sin(a)+ly*Math.cos(a)]);});}
  c.pads.forEach(p=>{const r=Math.hypot(p.w||0,p.h||0)/2;pts.push([p.x-r,p.y-r],[p.x+r,p.y+r]);});
  if(!pts.length)pts.push([c.x-1,c.y-1],[c.x+1,c.y+1]);
  c.bb=[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];}
function move(B,c,dx,dy){applyComp(B,c,q=>[q[0]+dx,q[1]+dy],0,false);}
function rotate(B,c,deg){const a=deg*D2R,ca=Math.cos(a),sa=Math.sin(a),cx=c.x,cy=c.y;applyComp(B,c,q=>[cx+(q[0]-cx)*ca-(q[1]-cy)*sa,cy+(q[0]-cx)*sa+(q[1]-cy)*ca],deg,false);}
// flip to the other side, mirrored about the part's vertical axis (as seen from the top)
function flip(B,c){
  const cx=c.x;applyComp(B,c,q=>[2*cx-q[0],q[1]],0,true);
  const to=c.side==='T'?'B':'T';
  c.pads.forEach(p=>{if(p.side==='both')return;const from=B.layers[p.side+'.cu'],i=from.indexOf(p);if(i>=0)from.splice(i,1);p.side=to;B.layers[to+'.cu'].push(p);});
  {const a=c.side+'.silk',b=to+'.silk';const keep=[],mv=[];B.layers[a].forEach(p=>(p.own===c?mv:keep).push(p));if(mv.length){B.layers[a]=keep;mv.forEach(p=>B.layers[b].push(p));}}
  c.side=to;
}
// first point of the part that should sit on the grid (KiCad keeps the footprint anchor on grid)
function snapDelta(c,dx,dy,g){return[snapTo(c.x+dx,g)-c.x,snapTo(c.y+dy,g)-c.y];}

/* ---- nets ---- */
function rebuildNets(B){
  const keep={};Object.values(B.nets||{}).forEach(n=>{keep[n.name]=n;});
  const N={};const net=n=>N[n]||(N[n]={name:n,pads:[],tracks:[],vias:[],zones:0,len:{T:0,B:0}});const ad=(n,s,l)=>{n.len[s]=(n.len[s]||0)+l;};
  PCB.cuKeys(B).forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(!p.net||p.clear)return;
    if(p.t==='seg'){ad(net(p.net),s,Math.hypot(p.b[0]-p.a[0],p.b[1]-p.a[1]));net(p.net).tracks.push(p);}
    else if(p.t==='path'){let l=0;for(let i=1;i<p.pts.length;i++)l+=Math.hypot(p.pts[i][0]-p.pts[i-1][0],p.pts[i][1]-p.pts[i-1][1]);ad(net(p.net),s,l);net(p.net).tracks.push(p);}
    else if(p.t==='poly'||p.t==='pour')net(p.net).zones++;}));
  const seen=new Set();B.comps.forEach(c=>c.pads.forEach(p=>{if(p.net&&!seen.has(p)){seen.add(p);net(p.net).pads.push(p);}}));
  B.vias.forEach(v=>{if(v.net)net(v.net).vias.push(v);});
  B.nets=N;B.netOrder=Object.keys(N).sort((a,b)=>{const r=x=>B.netClass(x)==='접지'?0:B.netClass(x)==='전원'?1:2;return r(a)-r(b)||a.localeCompare(b,undefined,{numeric:true});});
}
function addTrack(B,layer,net,w,pts){const p=pts.length===2?{t:'seg',a:pts[0].slice(),b:pts[1].slice(),w,net}:{t:'path',pts:pts.map(q=>q.slice()),w,net};p.user=true;B.layers[layer+'.cu'].push(p);return p;}
function addVia(B,x,y,net,d,drill){const v={x,y,d:d||0.6,drill:drill||0.3,net,user:true};B.vias.push(v);return v;}
function removePrim(B,p){for(const L of PCB.cuKeys(B).map(k=>k+'.cu')){const i=B.layers[L].indexOf(p);if(i>=0){B.layers[L].splice(i,1);return{L,i};}}const i=B.vias.indexOf(p);if(i>=0){B.vias.splice(i,1);return{L:'via',i};}return null;}
function restorePrim(B,p,at){if(at.L==='via')B.vias.splice(at.i,0,p);else B.layers[at.L].splice(at.i,0,p);}

/* ---- ratsnest: islands of each net (copper + pours) joined by a minimum spanning tree ---- */
function ratsnest(B,onlyNets){
  const S=AUTOROUTE.shapesOfBoard(B);const out=[];
  const pour={};PCB.cuKeys(B).forEach((s,li)=>B.layers[s+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)(pour[p.net]=pour[p.net]||new Set()).add(li);}));
  const nets=onlyNets?[...onlyNets]:Object.keys(B.nets);
  nets.forEach(n=>{const N=B.nets[n];if(!N||N.pads.length<2)return;
    let isl=AUTOROUTE.components(S,n);if(isl.length<2&&!pour[n])return;
    // islands touching a pour of their net (a via, a through pad or a pad on the poured layer) are already joined
    if(pour[n]){const L=pour[n];const onPour=g=>g.some(s=>s.via||(s.pad&&s.L.some(l=>L.has(l))));const a=isl.filter(onPour),b=isl.filter(g=>!onPour(g));isl=a.length?[[].concat(...a)].concat(b):b;}
    if(isl.length<2)return;
    const pts=isl.map(g=>g.filter(s=>s.pad||s.via||s.prim).map(s=>s.pad?[s.pad.x,s.pad.y]:s.via?[s.via.x,s.via.y]:s.a));
    const inT=new Set([0]);
    while(inT.size<isl.length){let best=null;
      inT.forEach(i=>pts[i].forEach(p=>isl.forEach((_,j)=>{if(inT.has(j))return;pts[j].forEach(q=>{const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!best||d<best.d)best={d,a:p,b:q,j};});})));
      if(!best)break;inT.add(best.j);out.push({net:n,a:best.a,b:best.b,len:best.d});}});
  return out;
}

/* ---- DRC ---- */
const DRC_DEF={clear:0.15,hole:0.25,edge:0.3,courtyard:0.1};
function drc(B,opts){
  const o=Object.assign({},DRC_DEF,opts||{});const S=AUTOROUTE.shapesOfBoard(B);const out=[];
  const box=s=>s.k==='cap'?[Math.min(s.a[0],s.b[0])-s.r,Math.min(s.a[1],s.b[1])-s.r,Math.max(s.a[0],s.b[0])+s.r,Math.max(s.a[1],s.b[1])+s.r]:(e=>[s.x-e,s.y-e,s.x+e,s.y+e])(Math.hypot(s.hw,s.hh));
  const cell=4,grid=new Map();S.forEach((s,i)=>{s._b=box(s);for(let x=Math.floor(s._b[0]/cell);x<=Math.floor(s._b[2]/cell);x++)for(let y=Math.floor(s._b[1]/cell);y<=Math.floor(s._b[3]/cell);y++){const k=x+','+y;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}});
  const seen=new Set();const owner=s=>s.pad&&s.pad.ref;
  grid.forEach(list=>{for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++){const i=list[a],j=list[b];const k=i<j?i+'|'+j:j+'|'+i;if(seen.has(k))continue;seen.add(k);
    const A=S[i],Bs=S[j];if(!A.L.some(l=>Bs.L.includes(l)))continue;
    if(A.hole||Bs.hole){if(A.hole&&Bs.hole)continue;const g=AUTOROUTE_gap(A,Bs);if(g<o.hole-0.02)out.push({code:'hole',msg:`구멍과 동박 간격 ${Math.max(0,g).toFixed(2)} mm`,at:A.hole?(A.a):(Bs.a),refs:[owner(A),owner(Bs)].filter(Boolean)});continue;}
    if(A.net&&A.net===Bs.net)continue;
    if(owner(A)&&owner(A)===owner(Bs))continue;
    const m=o.clear;if(A._b[0]>Bs._b[2]+m||Bs._b[0]>A._b[2]+m||A._b[1]>Bs._b[3]+m||Bs._b[1]>A._b[3]+m)continue;
    const g=AUTOROUTE_gap(A,Bs);if(g<m-0.02)out.push({code:g<=0?'short':'clearance',msg:`${A.net||'(넷 없음)'} ↔ ${Bs.net||'(넷 없음)'} ${g<=0?'단락':'간격 '+g.toFixed(2)+' mm'}`,at:at(A,Bs),refs:[owner(A),owner(Bs)].filter(Boolean),nets:[A.net,Bs.net],shapes:[A,Bs]});}});
  // courtyards (part bodies + pads) on the same side
  for(let i=0;i<B.comps.length;i++)for(let j=i+1;j<B.comps.length;j++){const a=B.comps[i],b=B.comps[j];if(a.kind==='none'||b.kind==='none')continue;if(a.side!==b.side&&!a.pads.some(p=>p.drill)&&!b.pads.some(p=>p.drill))continue;
    const m=o.courtyard;const ox=Math.min(a.bb[2],b.bb[2])-Math.max(a.bb[0],b.bb[0]),oy=Math.min(a.bb[3],b.bb[3])-Math.max(a.bb[1],b.bb[1]);
    if(ox>m&&oy>m&&a.side===b.side)out.push({code:'courtyard',msg:`${a.ref}와 ${b.ref} 부품 영역이 겹침`,at:[(Math.max(a.bb[0],b.bb[0])+Math.min(a.bb[2],b.bb[2]))/2,(Math.max(a.bb[1],b.bb[1])+Math.min(a.bb[3],b.bb[3]))/2],refs:[a.ref,b.ref]});}
  // board edge
  const ring=B.outline[0];if(ring)B.comps.forEach(c=>{if(c.kind==='none')return;const pts=c.pads.map(p=>[p.x,p.y]);
    const off=pts.find(p=>!PCB.inRing(p[0],p[1],ring))||(pts.length?null:null);
    const near=c.pads.find(p=>{for(let k=1;k<ring.length;k++)if(PCB.segDist(p.x,p.y,ring[k-1],ring[k])<Math.max(p.w,p.h)/2+o.edge)return true;return false;});
    if(off)out.push({code:'edge',msg:`${c.ref}가 보드 밖에 있음`,at:off,refs:[c.ref]});else if(near)out.push({code:'edge',msg:`${c.ref} 패드가 보드 가장자리에 너무 가까움`,at:[near.x,near.y],refs:[c.ref]});});
  return out;
}
const AUTOROUTE_gap=(a,b)=>{ // same sampled gap as the router, local copy to stay independent of its internals
  const dist=(s,x,y)=>{if(s.k==='cap')return PCB.segDist(x,y,s.a,s.b)-s.r;const c=Math.cos(-s.ang),sn=Math.sin(-s.ang),dx=x-s.x,dy=y-s.y,lx=dx*c-dy*sn,ly=dx*sn+dy*c;
    if(s.k==='circ')return Math.hypot(dx,dy)-s.hw;const qx=Math.abs(lx)-s.hw,qy=Math.abs(ly)-s.hh;return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0);};
  if(a.k==='cap'&&b.k==='cap'){const d=Math.min(PCB.segDist(a.a[0],a.a[1],b.a,b.b),PCB.segDist(a.b[0],a.b[1],b.a,b.b),PCB.segDist(b.a[0],b.a[1],a.a,a.b),PCB.segDist(b.b[0],b.b[1],a.a,a.b));return d-a.r-b.r;}
  if(a.k!=='cap')[a,b]=[b,a];
  if(a.k==='cap'){const n=Math.max(1,Math.ceil(Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1])/0.05));let m=1e9;for(let i=0;i<=n;i++){const t=i/n;m=Math.min(m,dist(b,a.a[0]+(a.b[0]-a.a[0])*t,a.a[1]+(a.b[1]-a.a[1])*t)-a.r);}return m;}
  const pts=s=>{const c=Math.cos(s.ang),sn=Math.sin(s.ang);return[[0,0],[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]].map(([u,v])=>[s.x+u*s.hw*c-v*s.hh*sn,s.y+u*s.hw*sn+v*s.hh*c]);};
  return Math.min(...pts(a).map(p=>dist(b,p[0],p[1])),...pts(b).map(p=>dist(a,p[0],p[1])));
};
const at=(a,b)=>{const c=s=>s.k==='cap'?[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2]:[s.x,s.y];const p=c(a),q=c(b);return[(p[0]+q[0])/2,(p[1]+q[1])/2];};

/* ---- routing helpers ---- */
// KiCad-like posture: straight leg then a 45° leg (or the other way round)
function posture(a,b,diagFirst){const dx=b[0]-a[0],dy=b[1]-a[1],ax=Math.abs(dx),ay=Math.abs(dy);if(ax<1e-6||ay<1e-6||Math.abs(ax-ay)<1e-6)return[a,b];
  const d=Math.min(ax,ay),sx=Math.sign(dx),sy=Math.sign(dy);
  if(diagFirst){const m=[a[0]+sx*d,a[1]+sy*d];return[a,m,b];}
  const m=ax>ay?[b[0]-sx*d,a[1]]:[a[0],b[1]-sy*d];return[a,m,b];}
function itemAt(B,x,y,layer,tol){
  const L=B.layers[layer+'.cu'];
  let bp=null,bd=1e9;for(const c of B.comps)for(const p of c.pads){if(!(p.side===layer||p.side==='both'))continue;
    const a=-(p.ang||0)*D2R,dx=x-p.x,dy=y-p.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
    const w=(p.shape==='parts'&&p.lbb?p.lbb[2]-p.lbb[0]:p.w)/2,h=(p.shape==='parts'&&p.lbb?p.lbb[3]-p.lbb[1]:p.h)/2;
    if(Math.abs(lx)<=w+tol&&Math.abs(ly)<=h+tol){const d=Math.hypot(dx,dy);if(d<bd){bd=d;bp=p;}}}
  if(bp)return{type:'pad',p:bp,net:bp.net,at:[bp.x,bp.y]};
  for(const v of B.vias)if(Math.hypot(v.x-x,v.y-y)<=v.d/2+tol)return{type:'via',v,net:v.net,at:[v.x,v.y]};
  for(let i=L.length-1;i>=0;i--){const t=L[i];if(t.clear||!(t.t==='seg'||t.t==='path'))continue;const ps=t.t==='seg'?[t.a,t.b]:t.pts;
    for(let k=1;k<ps.length;k++){if(PCB.segDist(x,y,ps[k-1],ps[k])<=t.w/2+tol){const e=[ps[0],ps[ps.length-1]].find(q=>Math.hypot(q[0]-x,q[1]-y)<=t.w/2+tol*2);
      // snap onto the segment's centre line
      const a=ps[k-1],b=ps[k],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,u=l?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l)):0;
      return{type:'track',t,net:t.net,at:e?e.slice():[a[0]+u*dx,a[1]+u*dy]};}}}
  return null;
}

/* ---- board outline: size, corner radius ---- */
const ringArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return Math.abs(a)/2;};
const ringBB=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
function cornerRadius(B){const r=B.outline[0];if(!r||r.length<=4)return 0;const b=ringBB(r);const lo=r.filter(p=>Math.abs(p[1]-b[1])<1e-3);if(!lo.length)return 0;return Math.max(0,Math.min(...lo.map(p=>p[0]))-b[0]);}
// a rectangle, possibly with rounded corners (then the outline can be rebuilt for any size)
function rectLike(B){const r=B.outline[0];if(!r)return true;if(B.outline.length>1)return false;const b=ringBB(r),R=cornerRadius(B);const full=(b[2]-b[0])*(b[3]-b[1]);return Math.abs(ringArea(r)-(full-(4-Math.PI)*R*R))<Math.max(0.5,full*0.004);}
function roundedRect(W,H,R){const r=Math.min(R,W/2,H/2);if(!(r>0))return[[0,0],[W,0],[W,H],[0,H]];const o=[];[[W-r,r,-90],[W-r,H-r,0],[r,H-r,90],[r,r,180]].forEach(([cx,cy,a])=>PCB.arcPts(cx,cy,r,a*D2R,(a+90)*D2R).forEach(p=>o.push(p)));return o;}
/* ---- board shapes: rect · round · circle · oval (stadium) · L · T · hex · oct · poly, plus cutouts (holes in the outline) ---- */
const SHAPES={rect:'사각형',round:'라운드 사각형',circle:'원형',oval:'타원 (스타디움)',L:'L자형',T:'T자형',hex:'육각형',oct:'팔각형',poly:'다각형 (직접)'};
const closeRing=r=>{if(r.length>1&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-6)r.pop();return r;};
function shapeRing(kind,p){p=p||{};const W=+p.w||100,H=+p.h||W,R=+p.r||0;
  switch(kind){
    case'rect':return roundedRect(W,H,R);
    case'round':return roundedRect(W,H,R||Math.min(W,H)*0.1);
    case'circle':{const D=+p.d||W;return closeRing(PCB.arcPts(D/2,D/2,D/2,0,2*Math.PI));}
    case'oval':return roundedRect(W,H,Math.min(W,H)/2);
    case'L':{const cw=Math.min(W-5,+p.cw||W/2),ch=Math.min(H-5,+p.ch||H/2),at=p.at||'tr';
      if(at==='tr')return[[0,0],[W,0],[W,H-ch],[W-cw,H-ch],[W-cw,H],[0,H]];if(at==='tl')return[[0,0],[W,0],[W,H],[cw,H],[cw,H-ch],[0,H-ch]];
      if(at==='br')return[[0,0],[W-cw,0],[W-cw,ch],[W,ch],[W,H],[0,H]];return[[cw,0],[W,0],[W,H],[0,H],[0,ch],[cw,ch]];}
    case'T':{const sw=Math.min(W-2,+p.cw||W/2),th=Math.min(H-2,+p.ch||H/2),x0=(W-sw)/2;return[[x0,0],[x0+sw,0],[x0+sw,H-th],[W,H-th],[W,H],[0,H],[0,H-th],[x0,H-th]];}
    case'hex':{const Rc=W/Math.sqrt(3);const o=[];for(let k=0;k<6;k++){const a=(30+60*k)*D2R;o.push([W/2+Rc*Math.cos(a),Rc+Rc*Math.sin(a)]);}return o;}
    case'oct':{const c=W/(1+Math.SQRT2);const Hh=+p.h||W;const c2=Hh/(1+Math.SQRT2);return[[c,0],[W-c,0],[W,c2],[W,Hh-c2],[W-c,Hh],[c,Hh],[0,Hh-c2],[0,c2]];}
    case'poly':{const pts=(p.pts||[]).map(q=>[+q[0],+q[1]]).filter(q=>isFinite(q[0])&&isFinite(q[1]));if(pts.length<3)throw new Error('다각형은 꼭짓점 3개 이상 "x,y x,y …" (mm)');
      const mx=Math.min(...pts.map(q=>q[0])),my=Math.min(...pts.map(q=>q[1]));return closeRing(pts.map(q=>[q[0]-mx,q[1]-my]));}
    default:throw new Error('모양: '+Object.keys(SHAPES).join(' · '));}}
/* set the outline to a shape; parts keep their coordinates (anchor bl) or stay centred (anchor center) */
function setShape(B,kind,p,o){o=o||{};p=p||{};if(!SHAPES[kind])throw new Error('모양: '+Object.keys(SHAPES).join(' · '));
  const ring=shapeRing(kind,p);const bb=ringBB(ring);const W=bb[2]-bb[0],H=bb[3]-bb[1];if(!(W>=5&&H>=5&&W<=1000&&H<=1000))throw new Error('보드 크기는 5–1000 mm 사이여야 합니다.');
  const W0=B.W,H0=B.H;if(o.anchor==='center'){const dx=(W-W0)/2,dy=(H-H0)/2;if(dx||dy)translateAll(B,dx,dy);}
  B.outline=[ring];B.W=W;B.H=H;B.shape=Object.assign({kind},p);
  // mounting holes that fell off the board go (the housing puts its supports on the new outline)
  const n0=B.drills.length;B.drills=B.drills.filter(d=>d.plated||d.own||d._pad||PCB.inRing(d.x,d.y,ring));const holesDropped=n0-B.drills.length;
  const outside=B.comps.filter(c=>c.kind!=='none'&&c.pads.some(q=>!PCB.inBoard(q.x,q.y,B.outline))).map(c=>c.ref);
  return{kind,label:SHAPES[kind],W,H,W0,H0,outside,holesDropped};}
/* a hole in the board: circle (d) or rect (w×h, corner r) at x,y (centre) */
function addCutout(B,kind,p){p=p||{};const x=+p.x,y=+p.y;if(!isFinite(x)||!isFinite(y))throw new Error('cutout 위치 --at x,y (mm)');
  let ring;if(kind==='circle'){const d=+p.d;if(!(d>=1))throw new Error('cutout circle <지름>');ring=closeRing(PCB.arcPts(x,y,d/2,0,2*Math.PI));}
  else{const w=+p.w,h=+p.h||w;if(!(w>=1&&h>=1))throw new Error('cutout rect <가로>x<세로>');ring=roundedRect(w,h,+p.r||0).map(q=>[q[0]+x-w/2,q[1]+y-h/2]);}
  if(!ring.every(q=>PCB.inRing(q[0],q[1],B.outline[0])))throw new Error('컷아웃이 보드 밖으로 나갑니다');
  B.outline.push(ring);B.cutouts=(B.cutouts||[]).concat([Object.assign({kind},p)]);
  const outside=B.comps.filter(c=>c.kind!=='none'&&c.pads.some(q=>PCB.inRing(q.x,q.y,ring))).map(c=>c.ref);
  return{n:B.outline.length-1,outside};}
function clearCutouts(B){const n=B.outline.length-1;B.outline=B.outline.slice(0,1);B.cutouts=[];return n;}
function shapeText(B){const sh=B.shape;if(!sh)return rectLike(B)?(cornerRadius(B)>0?'라운드 사각형':'사각형'):'다각형';const k=sh.kind;
  return SHAPES[k]+(k==='circle'?` Ø${+sh.d||B.W}`:k==='L'||k==='T'?` (${k==='L'?'절개':'기둥'} ${sh.cw||'-'}×${sh.ch||'-'}${sh.at?' '+sh.at:''})`:'')+((B.outline||[]).length>1?` · 컷아웃 ${B.outline.length-1}개`:'');}
// shift everything on the board (parts carry their pads, drills and silkscreen)
function translateAll(B,dx,dy,skip){
  const seen=new Set();const mv=p=>{if(!p||seen.has(p))return;seen.add(p);p[0]+=dx;p[1]+=dy;};
  B.comps.forEach(c=>move(B,c,dx,dy));
  PCB.cuKeys(B).map(k=>k+'.cu').concat(['T.silk','B.silk']).forEach(L=>B.layers[L].forEach(p=>{if(p.own||p.t==='pad'||p.t==='pour')return;if(p.t==='seg'){mv(p.a);mv(p.b);}else if(p.t==='path')p.pts.forEach(mv);else if(p.t==='poly')p.rings.forEach(r=>r.forEach(mv));else if(p.x!=null){p.x+=dx;p.y+=dy;}}));
  B.vias.forEach(v=>{v.x+=dx;v.y+=dy;});B.drills.forEach(d=>{if(d.own||d._pad||(skip&&skip.has(d)))return;d.x+=dx;d.y+=dy;});
}
/* resize the board. anchor 'bl' keeps the lower-left corner, 'center' keeps the parts centred. Mounting holes near a corner keep
   their distance to that corner; a rectangular outline is rebuilt (with corner radius R), any other outline is scaled. */
function resizeBoard(B,W,H,o){
  o=o||{};W=+W;H=+H;if(!(W>=5&&H>=5&&W<=1000&&H<=1000))throw new Error('보드 크기는 5–1000 mm 사이여야 합니다.');
  const W0=B.W,H0=B.H,like=rectLike(B),R0=cornerRadius(B),R=o.corner!=null&&isFinite(+o.corner)?Math.max(0,+o.corner):R0;
  const anchor=o.anchor==='center'?'center':'bl';const dx=anchor==='center'?(W-W0)/2:0,dy=anchor==='center'?(H-H0)/2:0;
  const holes=new Set();B.drills.forEach(d=>{if(d.plated||d.own||d._pad)return;const cx=d.x<W0/2?0:W0,cy=d.y<H0/2?0:H0;
    if(Math.abs(d.x-cx)<=Math.max(12,R0+6)&&Math.abs(d.y-cy)<=Math.max(12,R0+6)){d.x=(cx?W:0)+(d.x-cx);d.y=(cy?H:0)+(d.y-cy);holes.add(d);}});
  if(dx||dy)translateAll(B,dx,dy,holes);
  const old=B.outline;const sh=B.shape;
  if(sh&&sh.kind!=='poly'&&sh.kind!=='rect'&&sh.kind!=='round'){const sx=W/W0,sy=H/H0;const q=Object.assign({},sh,{w:W,h:H,d:sh.kind==='circle'?Math.min(W,H):undefined,cw:sh.cw?sh.cw*sx:undefined,ch:sh.ch?sh.ch*sy:undefined});
    B.outline=[shapeRing(sh.kind,q)].concat(old.slice(1).map(r=>r.map(p=>[p[0]*sx,p[1]*sy])));B.shape=q;const b2=ringBB(B.outline[0]);W=b2[2]-b2[0];H=b2[3]-b2[1];}
  else{B.outline=like?[roundedRect(W,H,R)]:old.map(r=>r.map(p=>[p[0]*W/W0,p[1]*H/H0]));if(sh)B.shape=Object.assign({},sh,{w:W,h:H});}
  PCB.cuKeys(B).map(k=>k+'.cu').forEach(L=>{B.layers[L]=B.layers[L].map(p=>p.t==='pour'?Object.assign({},p,{r:Math.max(0,R-(p.inset||0.5))}):p);});
  B.W=W;B.H=H;
  const outside=B.comps.filter(c=>c.kind!=='none'&&c.pads.some(p=>!PCB.inBoard(p.x,p.y,B.outline))).map(c=>c.ref);
  return{W0,H0,W,H,R,anchor,rebuilt:like,outside,holes:holes.size};
}

/* ---- copper layer count (2/4/6/8/10) with a standard stack-up; inner GND/PWR layers become planes (a pour of their net) ---- */
const isGndN=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|0V)$/i.test(String(n||'').replace(/^\//,''));
function planeNets(B,o){o=o||{};let g=null,gn=0,p=null,pn=0;
  Object.keys(B.nets||{}).forEach(n=>{const k=(B.nets[n].pads||[]).length;if(isGndN(n)){if(k>gn){gn=k;g=n;}return;}
    // supply plane: the logic rail with the most pins (motor / battery rails stay as wide tracks)
    if(B.netClass(n)==='전원'&&!/VBAT|VIN|VBUS|VMOT|VM\b|VS\b|12V|24V|48V|HV/i.test(n)&&k>pn){pn=k;p=n;}});
  if(o.gnd)g=o.gnd;if(o.pwr)p=o.pwr;return{gnd:g,pwr:p};}
function setLayers(B,n,o){o=o||{};n=+n;if(!PCB.STACKS[n])throw new Error('층 수는 2, 4, 6, 8, 10 중 하나입니다.');
  if(o.pwr&&!(B.nets||{})[o.pwr])throw new Error('넷 '+o.pwr+'이(가) 없습니다.');
  const old=PCB.cuKeys(B);let dropped=0;
  old.slice(1,-1).forEach(k=>{dropped+=B.layers[k+'.cu'].filter(p=>p.t==='seg'||p.t==='path').length;delete B.layers[k+'.cu'];});
  const roles=PCB.STACKS[n];const pn=planeNets(B,o);const R=cornerRadius(B);
  B.copperLayers=n;const stack=[];
  roles.forEach((role,i)=>{const k=i===0?'T':i===n-1?'B':'In'+i;if(k!=='T'&&k!=='B')B.layers[k+'.cu']=[];
    const net=role==='gnd'?pn.gnd:role==='pwr'?(pn.pwr||pn.gnd):null;const r2=role==='pwr'&&!pn.pwr?'gnd':role;
    stack.push({k,role:r2,net});if(net&&k!=='T'&&k!=='B')B.layers[k+'.cu'].push({t:'pour',net,inset:0.5,clr:0.3,r:Math.max(0,R-0.5),plane:true});});
  B.stack=stack;
  // finished thickness: 1.6 mm up to 8 layers, 2.0 mm for 10
  if(o.t)B.t=+o.t;else if(n>=10&&B.t<2)B.t=2.0;
  rebuildNets(B);
  return{n,stack,dropped,gnd:pn.gnd,pwr:pn.pwr};}
function stackText(B){const st=PCB.stackOf(B);const n=st.length;const t=B.t||1.6;const d=t/(n-1);
  return st.map((l,i)=>`L${i+1} ${PCB.cuName(l.k)} · ${l.role==='sig'?'신호':l.role==='gnd'?'GND 플레인':'전원 플레인'}${l.net?' ('+l.net+')':''}${i<n-1?` — 유전체 ~${d.toFixed(2)} mm`:''}`).join('\n');}

/* ---- .kicad_pcb writer (KiCad 7 format) ---- */
function toKicadPcb(B,meta){
  meta=meta||{};const q=s=>'"'+String(s==null?'':s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';const n=v=>(Math.round(v*10000)/10000).toString();
  const OX=25,OY=25;const Y=y=>B.H-y+OY;const P=p=>`${n(p[0]+OX)} ${n(Y(p[1]))}`;
  const nets=['',...Object.keys(B.nets).sort()];const nid=new Map(nets.map((x,i)=>[x,i]));const NET=x=>x?` (net ${nid.get(x)} ${q(x)})`:'';const NID=x=>` (net ${x?nid.get(x):0})`;
  let u=0;const uuid=()=>{u++;const h=(u*2654435761>>>0).toString(16).padStart(8,'0');return`${h}-0000-4000-8000-${String(u).padStart(12,'0')}`;};
  const o=[];o.push(`(kicad_pcb (version 20221018) (generator pcb_viewer)`,` (general (thickness ${n(B.t||1.6)}))`,` (paper "A4")`,
    ` (title_block (title ${q(meta.title||B.name||'')}) (date ${q(meta.date||'')}))`,
    ` (layers (0 "F.Cu" signal)${PCB.cuKeys(B).slice(1,-1).map((k,i)=>` (${i+1} "${k}.Cu" ${(PCB.stackOf(B)[i+1]||{}).role==='sig'?'signal':'power'})`).join('')} (31 "B.Cu" signal) (32 "B.Adhes" user "B.Adhesive") (33 "F.Adhes" user "F.Adhesive") (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "B.Courtyard") (47 "F.CrtYd" user "F.Courtyard") (48 "B.Fab" user) (49 "F.Fab" user))`,
    ` (setup (pad_to_mask_clearance 0) (pcbplotparams (layerselection 0x00010fc_ffffffff) (outputdirectory "")))`);
  nets.forEach((x,i)=>o.push(` (net ${i} ${q(x)})`));
  const cuL=s=>PCB.cuName(s),silkL=s=>s==='B'?'B.SilkS':'F.SilkS';
  B.comps.forEach(c=>{if(c.kind==='none'&&!c.pads.length)return;
    const a=(c.rot||0)*D2R,ca=Math.cos(a),sa=Math.sin(a);
    // world (y up) → footprint local (KiCad y down)
    const loc=p=>{const dx=p[0]-c.x,dy=p[1]-c.y;const ux=dx*ca+dy*sa,uy=-dx*sa+dy*ca;return[ux,-uy];};
    const L=pt=>{const l=loc(pt);return`${n(l[0])} ${n(l[1])}`;};
    const side=c.side==='B'?'B':'F';
    o.push(` (footprint ${q('pcb_viewer:'+(c.fp||c.ref))} (layer "${side}.Cu") (tstamp ${q(uuid())}) (at ${n(c.x+OX)} ${n(Y(c.y))}${c.rot?' '+n(c.rot):''})`);
    const lab=(Object.values(B.layers).flat().find(p=>p.own===c&&p.t==='text'&&p.s===c.ref))||{x:c.x,y:c.bb[3]+1,size:0.8};
    o.push(`  (fp_text reference ${q(c.ref)} (at ${L([lab.x,lab.y])}${c.rot?' '+n(c.rot):''}) (layer "${side}.SilkS") (effects (font (size ${n(lab.size||1)} ${n(lab.size||1)}) (thickness 0.15))${side==='B'?' (justify mirror)':''}) (tstamp ${q(uuid())}))`,
      `  (fp_text value ${q(c.val||'~')} (at ${L([c.x,c.bb[1]-1])}${c.rot?' '+n(c.rot):''}) (layer "${side}.Fab") (effects (font (size 1 1) (thickness 0.15))${side==='B'?' (justify mirror)':''}) (tstamp ${q(uuid())}))`);
    if(c.mpn)o.push(`  (property "MPN" ${q(c.mpn)})`);
    Object.values(B.layers).forEach((arr,li)=>arr.forEach(p=>{if(p.own!==c||p.t==='pad'||p.t==='text')return;const lay=p.layer||silkL(c.side);
      if(p.t==='seg')o.push(`  (fp_line (start ${L(p.a)}) (end ${L(p.b)}) (stroke (width ${n(p.w||0.12)}) (type solid)) (layer "${side}.SilkS"))`);
      else if(p.t==='path')for(let k=1;k<p.pts.length;k++)o.push(`  (fp_line (start ${L(p.pts[k-1])}) (end ${L(p.pts[k])}) (stroke (width ${n(p.w||0.12)}) (type solid)) (layer "${side}.SilkS"))`);
      else if(p.t==='circle')o.push(`  (fp_circle (center ${L([p.x,p.y])}) (end ${L([p.x+(p.r||0.2),p.y])}) (stroke (width 0.12) (type solid)) (fill solid) (layer "${side}.SilkS"))`);}));
    const bd=c.body;if(bd&&bd.w>0){const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{const t=bd.ang*D2R,lx=sx*bd.w/2,ly=sy*bd.h/2;return[bd.cx+lx*Math.cos(t)-ly*Math.sin(t),bd.cy+lx*Math.sin(t)+ly*Math.cos(t)];});
      for(let k=0;k<4;k++)o.push(`  (fp_line (start ${L(corners[k])}) (end ${L(corners[(k+1)%4])}) (stroke (width 0.1) (type solid)) (layer "${side}.Fab"))`);}
    const seen=new Set();c.pads.forEach(p=>{const key=p.n+'@'+n(p.x)+','+n(p.y);if(seen.has(key))return;seen.add(key);
      const th=!!p.drill,shape=p.shape==='circle'?'circle':p.shape==='oval'?'oval':(p.shape==='roundrect'||p.rr)?'roundrect':'rect';
      const lays=th?'"*.Cu" "*.Mask"':(p.side==='B'?'"B.Cu" "B.Paste" "B.Mask"':'"F.Cu" "F.Paste" "F.Mask"');
      const w=p.shape==='parts'&&p.lbb?p.lbb[2]-p.lbb[0]:p.w,h=p.shape==='parts'&&p.lbb?p.lbb[3]-p.lbb[1]:p.h;
      o.push(`  (pad ${q(p.n)} ${th?'thru_hole':'smd'} ${shape} (at ${L([p.x,p.y])}${p.ang?' '+n(p.ang):''}) (size ${n(w)} ${n(h)})${th?` (drill ${n(p.drill)})`:''} (layers ${lays})${shape==='roundrect'?` (roundrect_rratio ${n(Math.min(0.5,(p.rr||0.1*Math.min(w,h))/Math.min(w,h)))})`:''}${NET(p.net)}${p.fn?` (pinfunction ${q(p.fn)})`:''} (tstamp ${q(uuid())}))`);});
    o.push(' )');});
  // board-level silkscreen, edge, holes, tracks, vias, zones
  ['T','B'].forEach(s=>B.layers[s+'.silk'].forEach(p=>{if(p.own)return;const lay=silkL(s);
    if(p.t==='text')o.push(` (gr_text ${q(p.s)} (at ${P([p.x,p.y])}${p.ang?' '+n(p.ang):''}) (layer "${lay}") (effects (font (size ${n(p.size||1)} ${n(p.size||1)}) (thickness 0.15))${s==='B'?' (justify mirror)':''}))`);
    else if(p.t==='seg')o.push(` (gr_line (start ${P(p.a)}) (end ${P(p.b)}) (stroke (width ${n(p.w||0.15)}) (type solid)) (layer "${lay}"))`);
    else if(p.t==='path')for(let k=1;k<p.pts.length;k++)o.push(` (gr_line (start ${P(p.pts[k-1])}) (end ${P(p.pts[k])}) (stroke (width ${n(p.w||0.15)}) (type solid)) (layer "${lay}"))`);}));
  B.outline.forEach(r=>{for(let k=0;k<r.length;k++){const a=r[k],b=r[(k+1)%r.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)continue;o.push(` (gr_line (start ${P(a)}) (end ${P(b)}) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))`);}});
  let hn=0;B.drills.forEach(d=>{if(d.plated||d.own||d._pad)return;hn++;o.push(` (footprint "pcb_viewer:MountingHole" (layer "F.Cu") (at ${P([d.x,d.y])}) (fp_text reference "H${hn}" (at 0 0) (layer "F.Fab") hide (effects (font (size 1 1))))`,
    `  (pad "" np_thru_hole circle (at 0 0) (size ${n(d.d)} ${n(d.d)}) (drill ${n(d.d)}) (layers "*.Cu" "*.Mask"))`,' )');});
  PCB.cuKeys(B).forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(p.clear||p.own)return;
    if(p.t==='seg')o.push(` (segment (start ${P(p.a)}) (end ${P(p.b)}) (width ${n(p.w)}) (layer "${cuL(s)}")${NID(p.net)} (tstamp ${q(uuid())}))`);
    else if(p.t==='path')for(let k=1;k<p.pts.length;k++)o.push(` (segment (start ${P(p.pts[k-1])}) (end ${P(p.pts[k])}) (width ${n(p.w)}) (layer "${cuL(s)}")${NID(p.net)} (tstamp ${q(uuid())}))`);
    else if(p.t==='poly'&&p.net)p.rings.slice(0,1).forEach(r=>o.push(` (zone${NET(p.net).replace(/^ \(net (\d+) ("[^"]*")\)$/,' (net $1) (net_name $2)')} (layer "${cuL(s)}") (tstamp ${q(uuid())}) (hatch edge 0.5) (connect_pads (clearance 0.3)) (min_thickness 0.25) (filled_areas_thickness no) (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5)) (polygon (pts ${r.map(v=>`(xy ${P(v)})`).join(' ')})))`));
    else if(p.t==='pour'&&p.net){const r=B.outline[0];o.push(` (zone${NET(p.net).replace(/^ \(net (\d+) ("[^"]*")\)$/,' (net $1) (net_name $2)')} (layer "${cuL(s)}") (tstamp ${q(uuid())}) (hatch edge 0.5) (connect_pads (clearance ${n(p.clr||0.3)})) (min_thickness 0.25) (filled_areas_thickness no) (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5)) (polygon (pts ${r.map(v=>`(xy ${P(v)})`).join(' ')})))`);}}));
  B.vias.forEach(v=>o.push(` (via (at ${P([v.x,v.y])}) (size ${n(v.d)}) (drill ${n(v.drill)}) (layers "F.Cu" "B.Cu")${NID(v.net)} (tstamp ${q(uuid())}))`));
  o.push(')');return o.join('\n')+'\n';
}

return{setLayers,planeNets,stackText,prepare,applyComp,move,rotate,flip,snapDelta,snapTo,bbox,rebuildNets,cornerRadius,rectLike,roundedRect,SHAPES,shapeRing,setShape,addCutout,clearCutouts,shapeText,translateAll,resizeBoard,addTrack,addVia,removePrim,restorePrim,ratsnest,drc,posture,itemAt,toKicadPcb,DRC_DEF};
})();
if(typeof module!=='undefined')module.exports=PCBEDIT;
