/* Simple 2-layer grid autorouter.
   - The board is rasterised on a square grid (default 0.1 mm, aligned to the finest-pitch pads).
   - Every copper shape paints a "keep-out halo" per layer: copper radius + clearance + half the new track width (track grid)
     and + via radius (via grid). A cell is free for net k when no other net's halo covers it.
   - Each unconnected group of a net is joined to the rest with A* over 8 directions per layer plus vias.
   - Routed copper is added to the board as ordinary tracks/vias (flagged auto) and painted for the following nets. */
const AUTOROUTE=(function(){
"use strict";
const PC=typeof PCB!=='undefined'?PCB:(typeof require!=='undefined'?require('../core/pcb-core.js'):null);
const D2R=Math.PI/180;
const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS)$/i.test(String(n||'').replace(/^\//,''));

/* ---------- copper shapes ---------- */
function padShape(p){const L=p.side==='both'||p.drill?[0,1]:p.side==='B'?[1]:[0];
  if(p.shape==='circle')return{k:'cap',a:[p.x,p.y],b:[p.x,p.y],r:Math.min(p.w,p.h)/2,L,net:p.net,pad:p};
  return{k:'rect',x:p.x,y:p.y,hw:p.w/2,hh:p.h/2,ang:(p.ang||0)*D2R,L,net:p.net,pad:p};}
function shapesOfBoard(B){
  const S=[];
  B.comps.forEach(c=>c.pads.forEach(p=>S.push(padShape(p))));
  ['T','B'].forEach((s,li)=>B.layers[s+'.cu'].forEach(p=>{
    if(p.t==='seg')S.push({k:'cap',a:p.a,b:p.b,r:p.w/2,L:[li],net:p.net,prim:p});
    else if(p.t==='path')for(let i=1;i<p.pts.length;i++)S.push({k:'cap',a:p.pts[i-1],b:p.pts[i],r:p.w/2,L:[li],net:p.net,prim:p});
    else if(p.t==='pad'&&!B.comps.some(c=>c.pads.includes(p)))S.push(padShape(p));}));
  B.vias.forEach(v=>S.push({k:'cap',a:[v.x,v.y],b:[v.x,v.y],r:v.d/2,L:[0,1],net:v.net,via:v}));
  B.drills.forEach(d=>{if(!d.plated)S.push({k:'cap',a:[d.x,d.y],b:[d.x2!=null?d.x2:d.x,d.y2!=null?d.y2:d.y],r:d.d/2,L:[0,1],net:null,hole:true});});
  return S;
}
// signed distance from point to shape (≤ 0 inside)
function dist(s,x,y){
  if(s.k==='cap')return PC.segDist(x,y,s.a,s.b)-s.r;
  const c=Math.cos(-s.ang),sn=Math.sin(-s.ang),dx=x-s.x,dy=y-s.y;const lx=Math.abs(dx*c-dy*sn)-s.hw,ly=Math.abs(dx*sn+dy*c)-s.hh;
  return lx>0||ly>0?Math.hypot(Math.max(lx,0),Math.max(ly,0)):Math.max(lx,ly);
}
function bboxOf(s,m){if(s.k==='cap')return[Math.min(s.a[0],s.b[0])-s.r-m,Math.min(s.a[1],s.b[1])-s.r-m,Math.max(s.a[0],s.b[0])+s.r+m,Math.max(s.a[1],s.b[1])+s.r+m];
  const e=Math.hypot(s.hw,s.hh)+m;return[s.x-e,s.y-e,s.x+e,s.y+e];}
function shapeGap(a,b){ // ≤ 0 when touching (sampled; fine for pads/tracks)
  if(a.k==='cap'&&b.k==='cap'){const d=Math.min(PC.segDist(a.a[0],a.a[1],b.a,b.b),PC.segDist(a.b[0],a.b[1],b.a,b.b),PC.segDist(b.a[0],b.a[1],a.a,a.b),PC.segDist(b.b[0],b.b[1],a.a,a.b));return d-a.r-b.r;}
  if(a.k!=='cap')[a,b]=[b,a];
  if(a.k==='cap'){const n=Math.max(1,Math.ceil(Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1])/0.05));let m=1e9;for(let i=0;i<=n;i++){const t=i/n;m=Math.min(m,dist(b,a.a[0]+(a.b[0]-a.a[0])*t,a.a[1]+(a.b[1]-a.a[1])*t)-a.r);}return m;}
  const pts=s=>{const c=Math.cos(s.ang),sn=Math.sin(s.ang);return[[0,0],[1,1],[1,-1],[-1,1],[-1,-1]].map(([u,v])=>[s.x+u*s.hw*c-v*s.hh*sn,s.y+u*s.hw*sn+v*s.hh*c]);};
  return Math.min(...pts(a).map(p=>dist(b,p[0],p[1])),...pts(b).map(p=>dist(a,p[0],p[1])));
}
// groups of a net that are not yet joined by copper
function components(S,net){
  const it=S.filter(s=>s.net===net);const par=it.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));
  for(let i=0;i<it.length;i++)for(let j=i+1;j<it.length;j++){if(f(i)===f(j))continue;if(!it[i].L.some(l=>it[j].L.includes(l)))continue;
    const bi=bboxOf(it[i],0.01),bj=bboxOf(it[j],0.01);if(bi[2]<bj[0]||bj[2]<bi[0]||bi[3]<bj[1]||bj[3]<bi[1])continue;if(shapeGap(it[i],it[j])<=0.005)par[f(i)]=f(j);}
  const g={};it.forEach((s,i)=>{(g[f(i)]=g[f(i)]||[]).push(s);});
  return Object.values(g).filter(c=>c.some(s=>s.pad||s.prim||s.via));
}

/* ---------- grid ---------- */
function makeGrid(B,o){
  const g=o.grid;
  // align the grid to the finest-pitch pads (e.g. 0.5 mm QFP rows)
  const fine=[];B.comps.forEach(c=>c.pads.forEach(p=>{if(Math.min(p.w,p.h)<0.36)fine.push(p);}));
  const mode=vs=>{if(!vs.length)return 0;const h={};vs.forEach(v=>{const k=Math.round((((v%g)+g)%g)/g*20)%20;h[k]=(h[k]||0)+1;});const k=+Object.entries(h).sort((a,b)=>b[1]-a[1])[0][0];return k/20*g;};
  const ox=mode(fine.map(p=>p.x))-g,oy=mode(fine.map(p=>p.y))-g;
  const nx=Math.ceil((B.W-ox)/g)+2,ny=Math.ceil((B.H-oy)/g)+2,N=nx*ny;
  return{g,ox,oy,nx,ny,N,occT:[new Int32Array(N),new Int32Array(N)],occV:[new Int32Array(N),new Int32Array(N)]};
}
function mark(arr,i,k){const v=arr[i];if(v===-1)return;if(k===-1||(v!==0&&v!==k))arr[i]=-1;else arr[i]=k;}
function paint(G,s,k,wHalf,viaR,clr){
  const mT=s.hole?wHalf+clr:wHalf+clr,mV=viaR+clr;const m=Math.max(mT,mV);const bb=bboxOf(s,m);
  const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(s,G.ox+x*G.g,G.oy+y*G.g);if(d>m)continue;const i=y*G.nx+x;
    s.L.forEach(l=>{if(d<=mT)mark(G.occT[l],i,k);if(d<=mV)mark(G.occV[l],i,k);});}
}
function outlineBlock(B,G,edge){
  const ring=B.outline[0];if(!ring)return;
  for(let y=0;y<G.ny;y++){const py=G.oy+y*G.g;const xs=[];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>py)!==(b[1]>py))xs.push((b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]);}xs.sort((a,b)=>a-b);
    for(let x=0;x<G.nx;x++){const px=G.ox+x*G.g;let inside=false;for(let k=0;k+1<xs.length;k+=2)if(px>xs[k]&&px<xs[k+1]){inside=true;break;}
      if(!inside){const i=y*G.nx+x;[0,1].forEach(l=>{G.occT[l][i]=-1;G.occV[l][i]=-1;});}}}
  for(let i=0,j=ring.length-1;i<ring.length;j=i++)paint(G,{k:'cap',a:ring[j],b:ring[i],r:0,L:[0,1],net:null},-1,0,0,edge);
}

/* ---------- A* ---------- */
function astar(G,k,src,tgt,anchors,o){
  const N=G.N,nx=G.nx,ny=G.ny;const tot=2*N;
  if(!G.gs||G.gs.length!==tot){G.gs=new Float32Array(tot);G.par=new Int32Array(tot);G.stamp=new Uint32Array(tot);G.cl=new Uint32Array(tot);G.dir=new Int8Array(tot);G.gen=0;}
  const gs=G.gs,par=G.par,stamp=G.stamp,cl=G.cl,dir=G.dir;const gen=++G.gen;
  const DX=[1,-1,0,0,1,1,-1,-1],DY=[0,0,1,-1,1,-1,1,-1],DC=[1,1,1,1,Math.SQRT2,Math.SQRT2,Math.SQRT2,Math.SQRT2];
  const free=(l,i)=>{const v=G.occT[l][i];return v===0||v===k||tgt.has(l*N+i)||src.has(l*N+i);};
  const freeV=i=>{const a=G.occV[0][i],b=G.occV[1][i];return(a===0||a===k)&&(b===0||b===k);};
  const h=(x,y)=>{let m=1e9;for(const p of anchors){const dx=Math.abs(p[0]-x),dy=Math.abs(p[1]-y);const d=Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);if(d<m)m=d;}return m*1.08;};
  // binary heap
  let hn=0,hid=new Int32Array(1<<16),hf=new Float32Array(1<<16);
  const push=(id,f)=>{if(hn===hid.length){const a=new Int32Array(hn*2);a.set(hid);hid=a;const b=new Float32Array(hn*2);b.set(hf);hf=b;}let i=hn++;while(i>0){const p=(i-1)>>1;if(hf[p]<=f)break;hid[i]=hid[p];hf[i]=hf[p];i=p;}hid[i]=id;hf[i]=f;};
  const pop=()=>{const r=hid[0];hn--;if(hn>0){const id=hid[hn],f=hf[hn];let i=0;for(;;){let c=2*i+1;if(c>=hn)break;if(c+1<hn&&hf[c+1]<hf[c])c++;if(hf[c]>=f)break;hid[i]=hid[c];hf[i]=hf[c];i=c;}hid[i]=id;hf[i]=f;}return r;};
  src.forEach(id=>{gs[id]=0;stamp[id]=gen;par[id]=-1;dir[id]=-1;const i=id%N;push(id,h(i%nx,(i/nx)|0));});
  let exp=0;const viaC=o.viaCost/G.g,bot=o.bottomCost||1;
  while(hn){const id=pop();if(cl[id]===gen)continue;cl[id]=gen;if(tgt.has(id)){const path=[];let c=id;while(c>=0){path.push(c);c=par[c];}return{path:path.reverse(),exp};}
    if(++exp>o.maxExp)return{fail:'탐색 한도 초과',exp};
    const l=id>=N?1:0,i=id-l*N,x=i%nx,y=(i/nx)|0,g0=gs[id],d0=dir[id];
    for(let d=0;d<8;d++){const xx=x+DX[d],yy=y+DY[d];if(xx<0||yy<0||xx>=nx||yy>=ny)continue;const j=yy*nx+xx;if(!free(l,j))continue;
      if(d>=4&&(!free(l,y*nx+xx)||!free(l,yy*nx+x)))continue;
      const nid=l*N+j;if(cl[nid]===gen)continue;const ng=g0+DC[d]*(l?bot:1)+(d0>=0&&d0!==d&&d0<8?0.35:0);
      if(stamp[nid]!==gen||ng<gs[nid]){stamp[nid]=gen;gs[nid]=ng;par[nid]=id;dir[nid]=d;push(nid,ng+h(xx,yy));}}
    // via
    const thr=(src.has(id)&&src.has((1-l)*N+i))||(tgt.has(id)&&tgt.has((1-l)*N+i));
    if(freeV(i)||thr){const nid=(1-l)*N+i;if(cl[nid]!==gen&&free(1-l,i)){const ng=g0+viaC;if(stamp[nid]!==gen||ng<gs[nid]){stamp[nid]=gen;gs[nid]=ng;par[nid]=id;dir[nid]=8;push(nid,ng+h(x,y));}}}
  }
  return{fail:'경로 없음 (막힘)',exp};
}

/* ---------- geometry ---------- */
function toCopper(G,path,w,via,net,startShape,endShape){
  const N=G.N,P=id=>{const l=id>=N?1:0,i=id-l*N;return{l,x:G.ox+(i%G.nx)*G.g,y:G.oy+((i/G.nx)|0)*G.g};};
  const pts=path.map(P);const runs=[];let cur=null;const vias=[];
  pts.forEach((p,i)=>{if(!cur||cur.l!==p.l){if(cur){vias.push({x:p.x,y:p.y});}cur={l:p.l,pts:[]};runs.push(cur);}cur.pts.push([p.x,p.y]);});
  // snap ends to pad / via centres so the track visibly lands on the copper
  const ctr=s=>s&&(s.pad?[s.pad.x,s.pad.y]:s.via?[s.via.x,s.via.y]:null);
  const c0=ctr(startShape),c1=ctr(endShape);if(c0)runs[0].pts.unshift(c0);if(c1)runs[runs.length-1].pts.push(c1);
  const simp=q=>{const o=[q[0]];for(let i=1;i<q.length;i++){const a=o[o.length-1],b=q[i];if(Math.hypot(b[0]-a[0],b[1]-a[1])<1e-6)continue;
      if(o.length>=2){const z=o[o.length-2];const cr=(a[0]-z[0])*(b[1]-a[1])-(a[1]-z[1])*(b[0]-a[0]);if(Math.abs(cr)<1e-6){o[o.length-1]=b;continue;}}o.push(b);}return o;};
  const tracks=runs.map(r=>({layer:r.l,pts:simp(r.pts)})).filter(r=>r.pts.length>=2).map(r=>({t:'path',pts:r.pts,w,net,auto:true,_l:r.layer}));
  let len=0;tracks.forEach(t=>{for(let i=1;i<t.pts.length;i++)len+=Math.hypot(t.pts[i][0]-t.pts[i-1][0],t.pts[i][1]-t.pts[i-1][1]);});
  return{tracks,vias:vias.map(v=>({x:v.x,y:v.y,d:via.d,drill:via.drill,net,auto:true})),len};
}

/* ---------- main ---------- */
const DEF={grid:0.1,clear:0.2,edge:0.4,width:{signal:0.2,power:0.3},via:{d:0.6,drill:0.3},viaCost:2.0,maxExp:700000,bottomCost:1.05};
function widthFor(B,net,o){return B.netClass&&B.netClass(net)==='전원'?o.width.power:o.width.signal;}
function prepare(B,opts){
  const o=Object.assign({},DEF,opts||{});o.width=Object.assign({},DEF.width,(opts||{}).width);o.via=Object.assign({},DEF.via,(opts||{}).via);
  const G=makeGrid(B,o);const S=shapesOfBoard(B);const ids={};let nid=1;const idOf=n=>n==null?-1:(ids[n]||(ids[n]=++nid));
  const wMax=Math.max(o.width.signal,o.width.power)/2;
  outlineBlock(B,G,o.edge);
  S.forEach(s=>paint(G,s,s.hole?-1:idOf(s.net),wMax,o.via.d/2,o.clear));
  return{o,G,S,idOf};
}
// nets that still have more than one copper group
function openNets(B,filter){
  const S=shapesOfBoard(B);const pour=new Set();['T','B'].forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)pour.add(p.net);}));
  const out=[];Object.keys(B.nets).forEach(n=>{if(isGnd(n)||pour.has(n))return;if(filter&&!filter(n))return;const c=components(S,n);if(c.length>1)out.push({net:n,groups:c.length});});return out;
}
function routeNet(P,B,net){
  const{o,G}=P;const k=P.idOf(net);const w=widthFor(B,net,o);let added={tracks:[],vias:[],len:0,nvia:0};let guard=0;
  for(;;){
    const comps=components(P.S,net);if(comps.length<=1)return Object.assign(added,{ok:true});
    if(++guard>24)return Object.assign(added,{ok:false,why:'반복 한도'});
    // join the smallest group to the rest
    comps.sort((a,b)=>a.length-b.length);const srcC=comps[0],rest=comps.slice(1).flat();
    const cellsOf=(shapes,set,owner)=>{shapes.forEach(s=>{const bb=bboxOf(s,0);const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
      const deep=s.k==='rect'?-Math.min(w/2,Math.min(s.hw,s.hh)-0.01):s.r>w/2?-(Math.min(w/2,s.r-0.01)):0.001;
      let any=false;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(s,G.ox+x*G.g,G.oy+y*G.g);if(d<=deep){s.L.forEach(l=>{const id=l*G.N+y*G.nx+x;set.add(id);owner.set(id,s);});any=true;}}
      if(!any){const x=Math.round(((s.k==='cap'?s.a[0]:s.x)-G.ox)/G.g),y=Math.round(((s.k==='cap'?s.a[1]:s.y)-G.oy)/G.g);s.L.forEach(l=>{const id=l*G.N+y*G.nx+x;set.add(id);owner.set(id,s);});}});};
    const src=new Set(),tgt=new Set(),own=new Map();cellsOf(srcC,src,own);cellsOf(rest,tgt,own);
    const anchors=[];rest.forEach(s=>{const pts=s.k==='cap'?[s.a,s.b]:[[s.x,s.y]];pts.forEach(p=>anchors.push([(p[0]-G.ox)/G.g,(p[1]-G.oy)/G.g]));});
    const r=astar(G,k,src,tgt,anchors,o);
    if(!r.path)return Object.assign(added,{ok:false,why:r.fail});
    const cu=toCopper(G,r.path,w,o.via,net,own.get(r.path[0]),own.get(r.path[r.path.length-1]));
    // commit: board + shapes + grid
    cu.tracks.forEach(t=>{t._side=t._l?'B':'T';B.layers[t._side+'.cu'].push(t);if(B.nets[net]){B.nets[net].tracks.push(t);}
      for(let i=1;i<t.pts.length;i++){const s={k:'cap',a:t.pts[i-1],b:t.pts[i],r:w/2,L:[t._l],net,prim:t};P.S.push(s);paint(G,s,k,Math.max(o.width.signal,o.width.power)/2,o.via.d/2,o.clear);}
      if(B.nets[net]){let L=0;for(let i=1;i<t.pts.length;i++)L+=Math.hypot(t.pts[i][0]-t.pts[i-1][0],t.pts[i][1]-t.pts[i-1][1]);B.nets[net].len[t._l?'B':'T']+=L;}
      delete t._l;added.tracks.push(t);});
    cu.vias.forEach(v=>{B.vias.push(v);if(B.nets[net])B.nets[net].vias.push(v);const s={k:'cap',a:[v.x,v.y],b:[v.x,v.y],r:v.d/2,L:[0,1],net,via:v};P.S.push(s);paint(G,s,k,Math.max(o.width.signal,o.width.power)/2,o.via.d/2,o.clear);added.vias.push(v);});
    added.len+=cu.len;added.nvia+=cu.vias.length;
  }
}
// estimated length of an open net: closest pair between its first two groups
function estimate(B,net){const S=shapesOfBoard(B);const c=components(S,net);if(c.length<2)return 0;const pts=g=>g.flatMap(s=>s.k==='cap'?[s.a,s.b]:[[s.x,s.y]]);
  const a=pts(c[0]);let m=1e9;c.slice(1).forEach(g=>pts(g).forEach(q=>a.forEach(p=>{m=Math.min(m,Math.hypot(p[0]-q[0],p[1]-q[1]));})));return m*(c.length-1);}
/* the whole job as a generator: yields progress, returns the best of up to `attempts` orderings
   (nets that failed are moved to the front of the next attempt) */
function* job(B,nets,opts){
  const o=Object.assign({},DEF,opts||{});const tries=o.attempts||3;
  let order=nets.map(n=>({n,e:estimate(B,n)})).sort((a,b)=>a.e-b.e).map(x=>x.n);
  let best=null;
  for(let att=0;att<tries;att++){
    const P=prepare(B,opts);const res=[];
    for(let i=0;i<order.length;i++){yield{att,i,total:order.length,net:order[i]};res.push(Object.assign({net:order[i]},routeNet(P,B,order[i])));}
    const ok=res.filter(r=>r.ok).length,len=res.reduce((a,r)=>a+r.len,0),nv=res.reduce((a,r)=>a+r.nvia,0);
    const score=ok*1e6-len-3*nv;const cu=res.flatMap(r=>r.tracks.map(t=>({t,net:r.net}))),vv=res.flatMap(r=>r.vias.map(v=>({v,net:r.net})));
    unroute(B,cu.map(x=>x.t).concat(vv.map(x=>x.v)));
    if(!best||score>best.score)best={score,res,cu,vv,att,ok,len,nv};
    const failed=res.filter(r=>!r.ok).map(r=>r.net);if(!failed.length)break;
    order=failed.concat(order.filter(n=>!failed.includes(n)));
  }
  // put the best attempt back on the board
  best.cu.forEach(({t,net})=>{B.layers[t._side+'.cu'].push(t);const n=B.nets[net];if(n){n.tracks.push(t);for(let i=1;i<t.pts.length;i++)n.len[t._side]+=Math.hypot(t.pts[i][0]-t.pts[i-1][0],t.pts[i][1]-t.pts[i-1][1]);}});
  best.vv.forEach(({v,net})=>{B.vias.push(v);if(B.nets[net])B.nets[net].vias.push(v);});
  return{results:best.res,ok:best.ok,fail:best.res.filter(r=>!r.ok),len:best.len,vias:best.nv,attempt:best.att+1,added:best.cu.map(x=>x.t).concat(best.vv.map(x=>x.v))};
}
function route(B,nets,opts){const it=job(B,nets,opts);let r;do{r=it.next();}while(!r.done);return r.value;}
function unroute(B,list){ // remove auto tracks/vias (all, or only those in list)
  const kill=list?new Set(list):null;const keep=p=>!(p.auto&&(!kill||kill.has(p)));
  ['T','B'].forEach(s=>{B.layers[s+'.cu']=B.layers[s+'.cu'].filter(keep);});B.vias=B.vias.filter(keep);
  Object.values(B.nets).forEach(n=>{n.tracks=n.tracks.filter(keep);n.vias=n.vias.filter(keep);n.len={T:0,B:0};n.tracks.forEach(t=>{const L=t._side||(B.layers['B.cu'].includes(t)?'B':'T');const q=t.pts||[t.a,t.b];for(let i=1;i<q.length;i++)n.len[L]+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);});});
}
// clearance check of the auto-routed copper against everything else (exact geometry, not the grid)
function drc(B,opts){
  const o=Object.assign({},DEF,opts||{});const S=shapesOfBoard(B);const mine=S.filter(s=>s.prim&&s.prim.auto||s.via&&s.via.auto);const out=[];
  mine.forEach(a=>{S.forEach(b=>{if(a===b||b.net===a.net&&!b.hole)return;if(!a.L.some(l=>b.L.includes(l)))return;const ba=bboxOf(a,o.clear),bb=bboxOf(b,0);if(ba[2]<bb[0]||bb[2]<ba[0]||ba[3]<bb[1]||bb[3]<ba[1])return;
    const gap=shapeGap(a,b);if(gap<o.clear-0.03)out.push({net:a.net,other:b.net||(b.hole?'구멍':'(넷 없음)'),gap,at:a.k==='cap'?a.a:[a.x,a.y]});});});
  return out;
}
return{DEF,prepare,routeNet,route,job,estimate,openNets,components,shapesOfBoard,unroute,drc,widthFor};
})();
if(typeof module!=='undefined')module.exports=AUTOROUTE;
