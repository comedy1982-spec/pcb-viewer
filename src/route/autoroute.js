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
const ALL=n=>Array.from({length:n},(_,i)=>i);
function padShape(p,NL){NL=NL||2;const L=p.side==='both'||p.drill?ALL(NL):p.side==='B'?[NL-1]:[0];
  if(p.shape==='circle')return{k:'cap',a:[p.x,p.y],b:[p.x,p.y],r:Math.min(p.w,p.h)/2,L,net:p.net,pad:p};
  return{k:'rect',x:p.x,y:p.y,hw:p.w/2,hh:p.h/2,ang:(p.ang||0)*D2R,L,net:p.net,pad:p};}
function shapesOfBoard(B){
  const S=[];const keys=PC.cuKeys(B),NL=keys.length,all=ALL(NL);
  B.comps.forEach(c=>c.pads.forEach(p=>S.push(padShape(p,NL))));
  keys.forEach((s,li)=>B.layers[s+'.cu'].forEach(p=>{
    if(p.t==='seg')S.push({k:'cap',a:p.a,b:p.b,r:p.w/2,L:[li],net:p.net,prim:p});
    else if(p.t==='path')for(let i=1;i<p.pts.length;i++)S.push({k:'cap',a:p.pts[i-1],b:p.pts[i],r:p.w/2,L:[li],net:p.net,prim:p});
    else if(p.t==='pad'&&!B.comps.some(c=>c.pads.includes(p)))S.push(padShape(p,NL));
    else if(p.t==='poly'&&p.rect&&p.net){const r=p.rect;S.push({k:'rect',x:(r[0]+r[2])/2,y:(r[1]+r[3])/2,hw:(r[2]-r[0])/2,hh:(r[3]-r[1])/2,ang:0,L:[li],net:p.net,prim:p,fill:true});}}));
  B.vias.forEach(v=>S.push({k:'cap',a:[v.x,v.y],b:[v.x,v.y],r:v.d/2,L:all,net:v.net,via:v}));
  B.drills.forEach(d=>{if(!d.plated)S.push({k:'cap',a:[d.x,d.y],b:[d.x2!=null?d.x2:d.x,d.y2!=null?d.y2:d.y],r:d.d/2,L:all,net:null,hole:true});});
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
  // two rectangles: exact (separating axes; overlap → −penetration, else closest edge distance) — corner sampling missed crossings
  const cor=s=>{const c=Math.cos(s.ang),sn=Math.sin(s.ang);return[[1,1],[1,-1],[-1,-1],[-1,1]].map(([u,v])=>[s.x+u*s.hw*c-v*s.hh*sn,s.y+u*s.hw*sn+v*s.hh*c]);};
  const P=cor(a),Q=cor(b);let pen=1e9,sep=false;
  [a.ang,a.ang+Math.PI/2,b.ang,b.ang+Math.PI/2].forEach(t=>{if(sep)return;const ux=Math.cos(t),uy=Math.sin(t);const pr=X=>X.map(p=>p[0]*ux+p[1]*uy);
    const pa=pr(P),pb=pr(Q);const o=Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb));if(o<0)sep=true;else pen=Math.min(pen,o);});
  if(!sep)return -pen;
  let m=1e9;for(let i=0;i<4;i++){const a0=P[i],a1=P[(i+1)%4],b0=Q[i],b1=Q[(i+1)%4];
    for(let j=0;j<4;j++){m=Math.min(m,PC.segDist(Q[j][0],Q[j][1],a0,a1),PC.segDist(P[j][0],P[j][1],b0,b1));}}
  return m;
}
// groups of a net that are not yet joined by copper
function components(S,net){
  const it=S.filter(s=>s.net===net);const par=it.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));
  const bb=it.map(s=>bboxOf(s,0.01));const join=(i,j)=>{if(f(i)===f(j))return;if(!it[i].L.some(l=>it[j].L.includes(l)))return;
    const bi=bb[i],bj=bb[j];if(bi[2]<bj[0]||bj[2]<bi[0]||bi[3]<bj[1]||bj[3]<bi[1])return;if(shapeGap(it[i],it[j])<=0.005)par[f(i)]=f(j);};
  if(it.length<64){for(let i=0;i<it.length;i++)for(let j=i+1;j<it.length;j++)join(i,j);}
  else{ // many shapes (copper fill): only pairs that share a 2 mm grid cell
    const C=2,grid=new Map();bb.forEach((b,i)=>{for(let x=Math.floor(b[0]/C);x<=Math.floor(b[2]/C);x++)for(let y=Math.floor(b[1]/C);y<=Math.floor(b[3]/C);y++){const k=x*100003+y;let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(i);}});
    grid.forEach(a=>{for(let p=0;p<a.length;p++)for(let q=p+1;q<a.length;q++)join(a[p],a[q]);});}
  const g={};it.forEach((s,i)=>{(g[f(i)]=g[f(i)]||[]).push(s);});
  return Object.values(g).filter(c=>c.some(s=>s.pad||s.prim||s.via));
}

/* copper groups of a net with its pours taken into account: every island that touches a pour of the net (a via, a through
   pad, a pad or track on the poured layer) is already joined, so those islands form one group that comes first */
function groups(B,S,net){const c=components(S,net);if(c.length<2)return c;const L=new Set();PC.cuKeys(B).forEach((k,li)=>B.layers[k+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net===net)L.add(li);}));
  if(!L.size)return c;const on=g=>g.some(s=>s.via||(s.pad&&(s.pad.drill||s.L.some(l=>L.has(l))))||(s.prim&&s.L.some(l=>L.has(l))));
  const a=c.filter(on),b=c.filter(g=>!on(g));return a.length?[[].concat(...a)].concat(b):b;}
/* ---------- grid ---------- */
function makeGrid(B,o){
  const g=o.grid;
  // align the grid to the finest-pitch pads (e.g. 0.5 mm QFP rows)
  const fine=[];B.comps.forEach(c=>c.pads.forEach(p=>{if(Math.min(p.w,p.h)<0.36)fine.push(p);}));
  const mode=vs=>{if(!vs.length)return 0;const h={};vs.forEach(v=>{const k=Math.round((((v%g)+g)%g)/g*20)%20;h[k]=(h[k]||0)+1;});const k=+Object.entries(h).sort((a,b)=>b[1]-a[1])[0][0];return k/20*g;};
  const ox=mode(fine.map(p=>p.x))-g,oy=mode(fine.map(p=>p.y))-g;
  const nx=Math.ceil((B.W-ox)/g)+2,ny=Math.ceil((B.H-oy)/g)+2,N=nx*ny;
  const NL=PC.cuKeys(B).length,mk=()=>Array.from({length:NL},()=>new Int32Array(N));
  return{g,ox,oy,nx,ny,N,NL,occT:mk(),occV:mk(),esc:mk()};
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
      if(!inside){const i=y*G.nx+x;for(let l=0;l<G.NL;l++){G.occT[l][i]=-1;G.occV[l][i]=-1;}}}}
  for(let i=0,j=ring.length-1;i<ring.length;j=i++)paint(G,{k:'cap',a:ring[j],b:ring[i],r:0,L:ALL(G.NL),net:null},-1,0,0,edge);
  // cutouts: cells inside any further ring are off the board too
  for(const h of B.outline.slice(1)){for(let y=0;y<G.ny;y++){const py=G.oy+y*G.g;for(let x=0;x<G.nx;x++){const px=G.ox+x*G.g;if(PCB.inRing(px,py,h)){const i=y*G.nx+x;for(let l=0;l<G.NL;l++){G.occT[l][i]=-1;G.occV[l][i]=-1;}}}}
    for(let i=0,j=h.length-1;i<h.length;j=i++)paint(G,{k:'cap',a:h[j],b:h[i],r:0,L:ALL(G.NL),net:null},-1,0,0,edge);}
}

/* ---------- A* ---------- */
function astar(G,k,src,tgt,anchors,o){
  const N=G.N,nx=G.nx,ny=G.ny,NL=G.NL;const tot=NL*N;const rl=G.route||ALL(NL);
  if(!G.gs||G.gs.length!==tot){G.gs=new Float32Array(tot);G.par=new Int32Array(tot);G.stamp=new Uint32Array(tot);G.cl=new Uint32Array(tot);G.dir=new Int8Array(tot);G.gen=0;}
  const gs=G.gs,par=G.par,stamp=G.stamp,cl=G.cl,dir=G.dir;const gen=++G.gen;
  const DX=[1,-1,0,0,1,1,-1,-1],DY=[0,0,1,-1,1,-1,1,-1],DC=[1,1,1,1,Math.SQRT2,Math.SQRT2,Math.SQRT2,Math.SQRT2];
  const dil=o.dil|0;const DIL=[];if(dil>0)for(let dy=-dil;dy<=dil;dy++)for(let dx=-dil;dx<=dil;dx++)if(dx*dx+dy*dy<=dil*dil&&(dx||dy))DIL.push([dx,dy]);
  const free0=(l,i)=>{const v=G.occT[l][i];return v===0||v===k||tgt.has(l*N+i)||src.has(l*N+i);};
  // wide tracks: every cell within `dil` cells of the centre line must be free too (the halos were painted for the base width)
  const free=dil>0?(l,i)=>{if(!free0(l,i))return false;const x=i%nx,y=(i/nx)|0;for(const[dx,dy]of DIL){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=nx||yy>=ny)return false;const v=G.occT[l][yy*nx+xx];if(!(v===0||v===k))return false;}return true;}:free0;
  const freeV=i=>{for(let l=0;l<NL;l++){const a=G.occV[l][i];if(!(a===0||a===k))return false;}return true;};
  const h=(x,y)=>{let m=1e9;for(const p of anchors){const dx=Math.abs(p[0]-x),dy=Math.abs(p[1]-y);const d=Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);if(d<m)m=d;}return m*1.08;};
  // binary heap
  let hn=0,hid=new Int32Array(1<<16),hf=new Float32Array(1<<16);
  const push=(id,f)=>{if(hn===hid.length){const a=new Int32Array(hn*2);a.set(hid);hid=a;const b=new Float32Array(hn*2);b.set(hf);hf=b;}let i=hn++;while(i>0){const p=(i-1)>>1;if(hf[p]<=f)break;hid[i]=hid[p];hf[i]=hf[p];i=p;}hid[i]=id;hf[i]=f;};
  const pop=()=>{const r=hid[0];hn--;if(hn>0){const id=hid[hn],f=hf[hn];let i=0;for(;;){let c=2*i+1;if(c>=hn)break;if(c+1<hn&&hf[c+1]<hf[c])c++;if(hf[c]>=f)break;hid[i]=hid[c];hf[i]=hf[c];i=c;}hid[i]=id;hf[i]=f;}return r;};
  src.forEach(id=>{gs[id]=0;stamp[id]=gen;par[id]=-1;dir[id]=-1;const i=id%N;push(id,h(i%nx,(i/nx)|0));});
  let exp=0;const av=G.avoid||null,avC=o.avoidCost||6;const viaC=o.viaCost/G.g,bot=o.bottomCost||1,esc=o.escCost?G.esc:null,escC=o.escCost||0,edgeC=o.edgeCost||0;
  // PathFinder: cost × (1 + history) × (1 + pres × other nets on the cell) — overuse is allowed and priced, not forbidden
  const pf=o.pf||null,pres=pf?pf.pres:0;
  const dirC=o.dirCost&&o.dirCost!==1&&G.pref?+o.dirCost:0,dirD=dirC?Math.sqrt(dirC):0;const pref=G.pref||null;
  // per move direction: 0..3 orthogonal (0,1 horizontal · 2,3 vertical), 4..7 diagonal
  const wrong=(l,d)=>{if(!dirC)return 1;const p=pref[l];if(!p)return 1;if(d>=4)return dirD;const horiz=d<2;return (p===1)===horiz?1:dirC;};
  while(hn){const id=pop();if(cl[id]===gen)continue;cl[id]=gen;if(tgt.has(id)){const path=[];let c=id;while(c>=0){path.push(c);c=par[c];}return{path:path.reverse(),exp};}
    if(++exp>o.maxExp)return{fail:'탐색 한도 초과',exp};
    const l=(id/N)|0,i=id-l*N,x=i%nx,y=(i/nx)|0,g0=gs[id],d0=dir[id];const lc=l===NL-1?bot:l?(o.innerCost||1):1;
    for(let d=0;d<8;d++){const xx=x+DX[d],yy=y+DY[d];if(xx<0||yy<0||xx>=nx||yy>=ny)continue;const j=yy*nx+xx;if(!free(l,j))continue;
      if(d>=4&&(!free(l,y*nx+xx)||!free(l,yy*nx+x)))continue;
      const nid=l*N+j;if(cl[nid]===gen)continue;const ev=esc?esc[l][j]:0;let step=DC[d]*lc*wrong(l,d);if(av){const a=av[l][j];if(a!==0&&a!==k)step*=avC;}if(pf){const oc=pf.occ[l][j];step*=(1+pf.hist[l][j])*(oc>0?1+pres*oc:1);}const ng=g0+step+(d0>=0&&d0!==d&&d0<8?0.35:0)+(ev!==0&&ev!==k?escC:0)+(edgeC&&G.edgeBand&&G.edgeBand[j]?edgeC:0);
      if(stamp[nid]!==gen||ng<gs[nid]){stamp[nid]=gen;gs[nid]=ng;par[nid]=id;dir[nid]=d;push(nid,ng+h(xx,yy));}}
    // via
    let fv=-1;for(const l2 of rl){if(l2===l)continue;const nid=l2*N+i;if(cl[nid]===gen||!free(l2,i))continue;
      const thr=(src.has(id)&&src.has(nid))||(tgt.has(id)&&tgt.has(nid));if(!thr){if(fv<0)fv=freeV(i)?1:0;if(!fv)continue;}
      let vc=viaC;if(pf){const ov=pf.occV[i],ot=pf.occ[l2][i];vc*=(1+pf.histV[i]+pf.hist[l2][i])*(ov>0||ot>0?1+pres*(ov+ot):1);}const ng=g0+vc;if(stamp[nid]!==gen||ng<gs[nid]){stamp[nid]=gen;gs[nid]=ng;par[nid]=id;dir[nid]=8;push(nid,ng+h(x,y));}}
  }
  return{fail:'경로 없음 (막힘)',exp};
}

/* ---------- routing priority (ECU layout practice): 0 high-current power/drive → 1 clocks·high-speed·differential →
   2 sensitive analog/sensor → 3 general digital. Current-carrying nets come from CURRENT when it is loaded. ---------- */
const HS_RE=/XTAL|OSC|CLK|CLOCK|MCO|CAN[HL]$|CAN_?[HL]\b|USB_?D[PM]|D[+-]$|LVDS|ETH|MDI|TX[PN]|RX[PN]|RS485|SPI_?SCK|SCK|SCLK|QSPI|SWCLK|JTCK|TCK|PWM_?[UVW]|IN_?[UVW]$|LIN$/i;
const AN_RE=/ADC|AIN|ANALOG|SENSE|SNS|ISENSE|VSENSE|CS[+-]|SHUNT|VREF|AREF|VMON|TEMP|NTC|THERM|HALL|ENC|RESOLVER|SIN|COS|TORQUE|AMP|OPAMP|MIC|AUDIO/i;
function netPrio(B,net,W){const n=String(net||'');if(/^(GND|AGND|DGND|PGND|VSS)$/i.test(n))return 0;
  const cur=W&&W[n];if(cur&&(cur.cls==='phase'||(cur.cls==='rail'&&cur.I>=0.5)))return 0;
  if(B.netClass&&B.netClass(n)==='전원')return cur?(cur.I>=0.5?0:3):0;
  if(HS_RE.test(n))return 1;if(AN_RE.test(n))return 2;return 3;}
const PRIO_LABEL=['대전류 전원·구동','고속·클록·차동','민감 아날로그','일반 디지털'];
/* ---------- return vias: a GND via next to every signal via of a clock / analog net (return-current continuity) ---------- */
function returnVias(B,opts){opts=opts||{};const gnd=opts.gnd||Object.keys(B.nets||{}).find(n=>/^GND$/i.test(n))||Object.keys(B.nets||{}).find(n=>/^(AGND|DGND|PGND|VSS)$/i.test(n));if(!gnd)return{added:0,skipped:0,why:'GND 넷 없음'};
  const keys=PC.cuKeys(B);const hasGndCu=keys.some(k=>B.layers[k+'.cu'].some(p=>p.t==='pour'&&p.net===gnd))||PC.stackOf(B).some(x=>x.net===gnd&&x.role!=='sig');if(!hasGndCu)return{added:0,skipped:0,why:'GND 플레인/동박면 없음'};
  const d=opts.dist||0.8,clr=opts.clear||0.2,via=Object.assign({d:0.6,drill:0.3},opts.via||{});const want=opts.nets?new Set(opts.nets):null;
  let S=shapesOfBoard(B);const freeAt=(x,y)=>{const r=via.d/2+clr;for(const s of S){if(s.net===gnd&&s.via)continue;if(s.hole||s.net!==gnd){const bb=bboxOf(s,r);if(x<bb[0]||x>bb[2]||y<bb[1]||y>bb[3])continue;if(dist(s,x,y)<r)return false;}}
    return x>r&&y>r&&x<B.W-r&&y<B.H-r&&(!B.outline[0]||PC.inRing(x,y,B.outline[0]));};
  let added=0,skipped=0;const near=(x,y)=>B.vias.some(v=>v.net===gnd&&Math.hypot(v.x-x,v.y-y)<=d*1.3);
  B.vias.filter(v=>v.auto&&!v.fan&&!v.ret&&v.net&&v.net!==gnd&&(want?want.has(v.net):netPrio(B,v.net,opts.W)<=2)).forEach(v=>{if(near(v.x,v.y))return;let ok=false;
    for(const rr of[d,d*1.25,d*1.6]){for(let k=0;k<8&&!ok;k++){const a=k*Math.PI/4;const x=+(v.x+rr*Math.cos(a)).toFixed(3),y=+(v.y+rr*Math.sin(a)).toFixed(3);if(!freeAt(x,y))continue;
        const nv={x,y,d:via.d,drill:via.drill,net:gnd,auto:true,ret:true,layers:'all'};B.vias.push(nv);if(B.nets[gnd])B.nets[gnd].vias.push(nv);S.push({k:'cap',a:[x,y],b:[x,y],r:via.d/2,L:ALL(keys.length),net:gnd,via:nv});added++;ok=true;}if(ok)break;}
    if(!ok)skipped++;});
  return{added,skipped,gnd};}
/* ---------- geometry ---------- */
function toCopper(G,path,w,via,net,startShape,endShape){
  const N=G.N,P=id=>{const l=(id/N)|0,i=id-l*N;return{l,x:G.ox+(i%G.nx)*G.g,y:G.oy+((i/G.nx)|0)*G.g};};
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
const DEF={grid:0.1,clear:0.2,edge:0.4,width:{signal:0.2,power:0.3},via:{d:0.6,drill:0.3},viaCost:2.0,maxExp:700000,bottomCost:1.05,escCost:0,escape:0.45,reserve:false,neck:0,dirCost:1};
function widthFor(B,net,o){let w=B.netClass&&B.netClass(net)==='전원'?o.width.power:o.width.signal;
  if(o.netWidth&&o.netWidth[net]>0)w=Math.min(o.netWidth[net],o.widthCap||3); // per-net width (current-based / user)
  // supplies that land on fine-pitch pins neck down so the track fits between the neighbouring pads
  if(o.neck&&w>o.neck&&B.nets[net]&&B.nets[net].pads.some(p=>Math.min(p.w,p.h)<0.36&&!p.drill))return o.neck;return w;}
function prepare(B,opts){
  const o=Object.assign({},DEF,opts||{});o.width=Object.assign({},DEF.width,(opts||{}).width);o.via=Object.assign({},DEF.via,(opts||{}).via);
  const G=makeGrid(B,o);const S=shapesOfBoard(B);const ids={};let nid=1;const idOf=n=>n==null?-1:(ids[n]||(ids[n]=++nid));
  // edge band: cells within o.edgeBand mm of the outline (high-speed nets pay extra there — radiation / return path)
  if(o.edgeBand>0){const ring=B.outline[0]||[[0,0],[B.W,0],[B.W,B.H],[0,B.H]];const band=new Uint8Array(G.N);const bb=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
    for(let y=0;y<G.ny;y++){const py=G.oy+y*G.g;for(let x=0;x<G.nx;x++){const px=G.ox+x*G.g;if(px-bb[0]<o.edgeBand||bb[2]-px<o.edgeBand||py-bb[1]<o.edgeBand||bb[3]-py<o.edgeBand){band[y*G.nx+x]=1;continue;}
        if(ring.length>4){let m=1e9;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const dd=PC.segDist(px,py,ring[j],ring[i]);if(dd<m)m=dd;if(m<o.edgeBand)break;}if(m<o.edgeBand)band[y*G.nx+x]=1;}}}G.edgeBand=band;}
  const wMax=Math.max(o.width.signal,o.width.power)/2;
  outlineBlock(B,G,o.edge);
  // plane layers (inner GND / PWR) carry no tracks; through vias pass them with an antipad
  const st=PC.stackOf(B);G.keys=PC.cuKeys(B);G.route=st.map((x,i)=>x.role==='sig'?i:-1).filter(i=>i>=0);
  st.forEach((x,i)=>{if(x.role!=='sig')G.occT[i].fill(-1);});
  // preferred routing direction per signal layer (odd signal layer horizontal, even vertical — adjacent layers cross,
  // so one layer's tracks do not wall off the other); a wrong-way move costs o.dirCost ×, a diagonal √(dirCost) ×
  G.pref=new Array(G.NL).fill(0);if(o.dirCost&&o.dirCost!==1&&G.route.length>=2)G.route.forEach((l,i)=>{G.pref[l]=i%2===0?1:2;});
  S.forEach(s=>paint(G,s,s.hole?-1:idOf(s.net),wMax,o.via.d/2,s.hole?Math.max(o.clear,o.holeClear||0.25):o.clear));
  // pin escapes: a short virtual stub of each IC pad's own net, straight out along the pad, so other nets cannot seal the pin
  if(o.reserve){B.comps.forEach(c=>{if(c.pads.length<6)return;const cx=(c.bb[0]+c.bb[2])/2,cy=(c.bb[1]+c.bb[3])/2;
    c.pads.forEach(p=>{if(!p.net||isGnd(p.net)||p.drill)return;const a=(p.ang||0)*D2R;let ux=Math.cos(a),uy=Math.sin(a),half=p.w/2;if(p.h>p.w){ux=-Math.sin(a);uy=Math.cos(a);half=p.h/2;}
      if((p.x-cx)*ux+(p.y-cy)*uy<0){ux=-ux;uy=-uy;}if(Math.abs((p.x-cx)*ux+(p.y-cy)*uy)<0.3)return; // centre pads
      const L=half+(o.reserve===true?0.6:+o.reserve);const sh={k:'cap',a:[p.x,p.y],b:[p.x+ux*L,p.y+uy*L],r:Math.min(p.w,p.h)/2*0.5,L:p.side==='B'?[G.NL-1]:[0],net:p.net};
      const k=idOf(p.net);const mT=wMax+o.clear;const bb=bboxOf(sh,mT);
      const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
      const lv=o.laneVia!=null?+o.laneVia:2;const mV=lv===0?-1:lv===1?o.via.d/2+o.clear:Math.max(o.via.d/2+o.clear,o.via.d/2+o.clear+o.width.signal/2-sh.r-0.01);const bb2=bboxOf(sh,Math.max(mT,mV));
      const X0=Math.max(0,Math.floor((bb2[0]-G.ox)/G.g)),X1=Math.min(G.nx-1,Math.ceil((bb2[2]-G.ox)/G.g)),Y0=Math.max(0,Math.floor((bb2[1]-G.oy)/G.g)),Y1=Math.min(G.ny-1,Math.ceil((bb2[3]-G.oy)/G.g));
      // the lane is kept for this pin's own track and via: other nets may neither cross it nor drop a via into it
      for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++){const d=dist(sh,G.ox+x*G.g,G.oy+y*G.g);if(d<=mT)mark(G.occT[sh.L[0]],y*G.nx+x,k);if(d<=mV)mark(G.occV[sh.L[0]],y*G.nx+x,k);}});});}
  // escape zones: the ring just outside each pad's keep-out is kept for that pad's own track (others pay o.escCost to cross)
  if(o.escCost)S.forEach(s=>{if(!s.pad||!s.net)return;const k=idOf(s.net),m0=wMax+o.clear,m1=m0+(o.escape||0.45);const bb=bboxOf(s,m1);
    const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(s,G.ox+x*G.g,G.oy+y*G.g);if(d<=m0||d>m1)continue;const i=y*G.nx+x;s.L.forEach(l=>{const v=G.esc[l][i];G.esc[l][i]=v===0||v===k?k:-1;});}});
  // power corridors: cells near a high-current net's copper on a layer cost other nets o.avoidCost × to cross (they go around or
  // change layer), so the copper fill that follows is not cut by signal tracks
  if(o.avoid&&o.avoid.length){G.avoid=Array.from({length:G.NL},()=>new Int32Array(G.N));o.avoid.forEach(c=>{const k=idOf(c.net);(c.shapes||[]).forEach(sh=>{const bb=bboxOf(sh,c.r);
      const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(dist(sh,G.ox+x*G.g,G.oy+y*G.g)>c.r)continue;const i=y*G.nx+x;sh.L.forEach(l=>{if(c.layers&&!c.layers.includes(l))return;const a=G.avoid[l][i];G.avoid[l][i]=a===0||a===k?k:-1;});}});});}
  return{o,G,S,idOf};
}
// nets that still have more than one copper group
function openNets(B,filter){
  const S=shapesOfBoard(B);const pour=new Set();PC.cuKeys(B).forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)pour.add(p.net);}));
  const out=[];Object.keys(B.nets).forEach(n=>{if(filter&&!filter(n))return;const c=groups(B,S,n);if(c.length>1)out.push({net:n,groups:c.length});});return out;
}
/* grid cells of a net's copper shapes that a track of width w may start from / arrive at (deep inside pads) */
function padCells(G,w,shapes,set,owner){shapes.forEach(s=>{const bb=bboxOf(s,0);const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
  const deep=s.k==='rect'?-Math.min(w/2,Math.min(s.hw,s.hh)-0.01):s.r>w/2?-(Math.min(w/2,s.r-0.01)):0.001;
  const SL=s.L.filter(l=>!G.route||G.route.includes(l));if(!SL.length)return;
  let any=false;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(s,G.ox+x*G.g,G.oy+y*G.g);if(d<=deep){SL.forEach(l=>{const id=l*G.N+y*G.nx+x;set.add(id);owner.set(id,s);});any=true;}}
  if(!any){const x=Math.round(((s.k==='cap'?s.a[0]:s.x)-G.ox)/G.g),y=Math.round(((s.k==='cap'?s.a[1]:s.y)-G.oy)/G.g);SL.forEach(l=>{const id=l*G.N+y*G.nx+x;set.add(id);owner.set(id,s);});}});}
/* MST over the copper groups of a net (closest points between groups): the 2-pin sub-connections in the order a
   rectilinear Steiner tree would make them — shortest first; joining into the middle of already routed copper is
   allowed, so the routed tree ends close to a Steiner tree instead of a chain of "smallest group → everything else" */
function mstEdges(comps){const pts=comps.map(g=>g.flatMap(s=>s.k==='cap'?[s.a,s.b]:[[s.x,s.y]]));const n=comps.length;const d=(i,j)=>{let m=1e18;for(const p of pts[i])for(const q of pts[j]){const v=Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1]);if(v<m)m=v;}return m;};
  const inT=new Uint8Array(n);inT[0]=1;const best=new Float64Array(n).fill(1e18),from=new Int32Array(n).fill(0);for(let j=1;j<n;j++)best[j]=d(0,j);const E=[];
  for(let k=1;k<n;k++){let j=-1,m=1e18;for(let i=0;i<n;i++)if(!inT[i]&&best[i]<m){m=best[i];j=i;}if(j<0)break;inT[j]=1;E.push([from[j],j,m]);for(let i=0;i<n;i++)if(!inT[i]){const v=d(j,i);if(v<best[i]){best[i]=v;from[i]=j;}}}
  return E.sort((a,b)=>a[2]-b[2]);}
function routeNet(P,B,net){
  const{o,G}=P;const k=P.idOf(net);const w=widthFor(B,net,o);let added={tracks:[],vias:[],len:0,nvia:0};let guard=0;
  // MST order: representative shape of each initial group; each edge joins the two current groups that hold them
  let plan=null;if(o.mst===true){const c0=groups(B,P.S,net);if(c0.length>2){const reps=c0.map(g=>g.find(s=>s.pad)||g[0]);plan=mstEdges(c0).map(([a,b])=>[reps[a],reps[b]]);}}
  for(;;){
    const comps=groups(B,P.S,net);if(comps.length<=1)return Object.assign(added,{ok:true});
    if(++guard>Math.max(24,comps.length+8))return Object.assign(added,{ok:false,why:'반복 한도'});
    let srcC,rest;
    if(plan){let e=null;while(plan.length){const[ra,rb]=plan[0];const ia=comps.findIndex(g=>g.includes(ra)),ib=comps.findIndex(g=>g.includes(rb));if(ia<0||ib<0||ia===ib){plan.shift();continue;}e=[ia,ib];break;}
      if(e){const A=comps[e[0]],Bc=comps[e[1]];if(A.length<=Bc.length){srcC=A;rest=Bc;}else{srcC=Bc;rest=A;}plan.shift();}else plan=null;}
    if(!plan){comps.sort((a,b)=>a.length-b.length);srcC=comps[0];rest=comps.slice(1).flat();}
    const cellsOf=(shapes,set,owner)=>padCells(G,w,shapes,set,owner);
    const src=new Set(),tgt=new Set(),own=new Map();cellsOf(srcC,src,own);cellsOf(rest,tgt,own);
    let anchors=[];rest.forEach(s=>{const pts=s.k==='cap'?[s.a,s.b]:[[s.x,s.y]];pts.forEach(p=>anchors.push([(p[0]-G.ox)/G.g,(p[1]-G.oy)/G.g]));});
    // big nets: keep the heuristic cheap — only the anchors nearest to the group being joined
    if(anchors.length>24){let sx=0,sy=0,sn=0;srcC.forEach(s=>{const p=s.k==='cap'?s.a:[s.x,s.y];sx+=(p[0]-G.ox)/G.g;sy+=(p[1]-G.oy)/G.g;sn++;});sx/=sn;sy/=sn;anchors=anchors.map(a=>[a,Math.abs(a[0]-sx)+Math.abs(a[1]-sy)]).sort((a,b)=>a[1]-b[1]).slice(0,24).map(a=>a[0]);}
    const wBase=Math.max(o.width.signal,o.width.power);const dil=w>wBase+1e-6?Math.ceil((w-wBase)/2/G.g):0;const edgeCost=o.edgeBand>0&&netPrio(B,net,o.W)===1?(o.edgeCost||1.5):0;
    const nb=o.netBottom&&o.netBottom[net];const r=astar(G,k,src,tgt,anchors,(dil||edgeCost||nb)?Object.assign({},o,{dil,edgeCost},nb?{bottomCost:nb}:{}):o);
    if(!r.path)return Object.assign(added,{ok:false,why:r.fail});
    const cu=toCopper(G,r.path,w,o.via,net,own.get(r.path[0]),own.get(r.path[r.path.length-1]));
    // commit: board + shapes + grid
    cu.tracks.forEach(t=>{t._side=G.keys[t._l];B.layers[t._side+'.cu'].push(t);if(B.nets[net]){B.nets[net].tracks.push(t);}
      for(let i=1;i<t.pts.length;i++){const s={k:'cap',a:t.pts[i-1],b:t.pts[i],r:w/2,L:[t._l],net,prim:t};P.S.push(s);paint(G,s,k,Math.max(o.width.signal,o.width.power)/2,o.via.d/2,o.clear);}
      if(B.nets[net]){let L=0;for(let i=1;i<t.pts.length;i++)L+=Math.hypot(t.pts[i][0]-t.pts[i-1][0],t.pts[i][1]-t.pts[i-1][1]);const ln=B.nets[net].len;ln[t._side]=(ln[t._side]||0)+L;}
      delete t._l;added.tracks.push(t);});
    cu.vias.forEach(v=>{B.vias.push(v);if(B.nets[net])B.nets[net].vias.push(v);const s={k:'cap',a:[v.x,v.y],b:[v.x,v.y],r:v.d/2,L:ALL(G.NL),net,via:v};P.S.push(s);paint(G,s,k,Math.max(o.width.signal,o.width.power)/2,o.via.d/2,o.clear);added.vias.push(v);});
    added.len+=cu.len;added.nvia+=cu.vias.length;
  }
}
// estimated length of an open net: closest pair between its first two groups
function estimate(B,net){const S=shapesOfBoard(B);const c=groups(B,S,net);if(c.length<2)return 0;const pts=g=>g.flatMap(s=>s.k==='cap'?[s.a,s.b]:[[s.x,s.y]]);
  const a=pts(c[0]);let m=1e9;c.slice(1).forEach(g=>pts(g).forEach(q=>a.forEach(p=>{m=Math.min(m,Math.hypot(p[0]-q[0],p[1]-q[1]));})));return m*(c.length-1);}
/* the whole job as a generator: yields progress, returns the best of up to `attempts` orderings
   (nets that failed are moved to the front of the next attempt) */
function* job(B,nets,opts){
  const o=Object.assign({},DEF,opts||{});const tries=o.attempts||3;
  let order=o.keepOrder?nets.slice():nets.map(n=>({n,e:estimate(B,n)})).sort((a,b)=>a.e-b.e).map(x=>x.n);
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
  best.cu.forEach(({t,net})=>{B.layers[t._side+'.cu'].push(t);const n=B.nets[net];if(n){n.tracks.push(t);n.len[t._side]=n.len[t._side]||0;for(let i=1;i<t.pts.length;i++)n.len[t._side]+=Math.hypot(t.pts[i][0]-t.pts[i-1][0],t.pts[i][1]-t.pts[i-1][1]);}});
  best.vv.forEach(({v,net})=>{B.vias.push(v);if(B.nets[net])B.nets[net].vias.push(v);});
  return{results:best.res,ok:best.ok,fail:best.res.filter(r=>!r.ok),len:best.len,vias:best.nv,attempt:best.att+1,added:best.cu.map(x=>x.t).concat(best.vv.map(x=>x.v))};
}
function route(B,nets,opts){const it=job(B,nets,opts);let r;do{r=it.next();}while(!r.done);return r.value;}
/* ---------- rip-up and reroute ----------
   Route every net once; then, for each net that failed, rip up the auto-routed nets whose copper passes close to its
   pads, route the failed net first and the ripped nets after it. A round is kept only when it routes more nets
   (or the same number with less copper); otherwise the board goes back to the copper it had before. */
function copperSnap(B){const o={v:B.vias.slice(),L:{}};PC.cuKeys(B).forEach(k=>{o.L[k]=B.layers[k+'.cu'].slice();});o.T=o.L.T;o.B=o.L.B;return o;}
function copperRestore(B,s){Object.keys(s.L||{T:1,B:1}).forEach(k=>{B.layers[k+'.cu']=(s.L?s.L[k]:s[k]).slice();});B.vias=s.v.slice();
  Object.values(B.nets).forEach(n=>{n.tracks=[];n.vias=[];n.len={T:0,B:0};});
  PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(!(p.t==='seg'||p.t==='path')||!p.net||p.clear)return;const n=B.nets[p.net];if(!n)return;n.tracks.push(p);const q=p.pts||[p.a,p.b];n.len[L]=n.len[L]||0;for(let i=1;i<q.length;i++)n.len[L]+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);}));
  B.vias.forEach(v=>{const n=v.net&&B.nets[v.net];if(n)n.vias.push(v);});}
function autoLen(B){let l=0,v=0;PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(!p.auto)return;const q=p.pts||[p.a,p.b];for(let i=1;i<q.length;i++)l+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);}));B.vias.forEach(x=>{if(x.auto)v++;});return{l,v};}
function* jobRR(B,nets,opts){
  const o=Object.assign({},DEF,opts||{});const maxRounds=o.rounds!=null?o.rounds:Math.min(16,4+nets.length);
  let order=o.keepOrder?nets.slice():nets.map(n=>({n,e:estimate(B,n)})).sort((a,b)=>a.e-b.e).map(x=>x.n);
  let P=prepare(B,o);const res={};
  for(let i=0;i<order.length;i++){yield{phase:'route',i,total:order.length,net:order[i]};res[order[i]]=routeNet(P,B,order[i]);}
  const okCount=()=>{const S=shapesOfBoard(B);return nets.filter(n=>groups(B,S,n).length<=1).length;};
  let best={ok:okCount(),...autoLen(B)};const tries={};let rounds=0;
  const failedNow=()=>{const S=shapesOfBoard(B);return nets.filter(n=>groups(B,S,n).length>1);};
  let queue=failedNow();
  while(queue.length&&rounds<maxRounds){
    const X=queue.shift();tries[X]=(tries[X]||0)+1;if(tries[X]>3)continue;rounds++;
    yield{phase:'ripup',round:rounds,max:maxRounds,net:X,ok:best.ok,total:nets.length};
    // nets with auto copper near the failed net's pads (tracks and vias)
    const pads=(B.nets[X]&&B.nets[X].pads)||[];let blockers=[];
    for(const R of[1.5,3,6]){const cnt={};
      PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(!p.auto||p.net===X||!p.net)return;const q=p.pts||[p.a,p.b];
        for(const pd of pads){let hitp=false;for(let i=1;i<q.length;i++)if(PC.segDist(pd.x,pd.y,q[i-1],q[i])<R+Math.max(pd.w,pd.h)/2){hitp=true;break;}if(hitp){cnt[p.net]=(cnt[p.net]||0)+1;break;}}}));
      B.vias.forEach(v=>{if(!v.auto||v.net===X||!v.net||v.fan)return;if(pads.some(pd=>Math.hypot(pd.x-v.x,pd.y-v.y)<R+Math.max(pd.w,pd.h)/2))cnt[v.net]=(cnt[v.net]||0)+1;});
      blockers=Object.keys(cnt).filter(n=>nets.includes(n)).sort((a,b)=>cnt[b]-cnt[a]).slice(0,3);if(blockers.length)break;}
    if(!blockers.length)continue;
    const snap=copperSnap(B);
    const kill=[];PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.auto&&!p.fan&&(p.net===X||blockers.includes(p.net)))kill.push(p);}));B.vias.forEach(v=>{if(v.auto&&!v.fan&&(v.net===X||blockers.includes(v.net)))kill.push(v);});
    unroute(B,kill);P=prepare(B,o);
    [X,...blockers].forEach(n=>{res[n]=routeNet(P,B,n);});
    const now={ok:okCount(),...autoLen(B)};
    if(now.ok>best.ok||(now.ok===best.ok&&now.l+3*now.v<best.l+3*best.v-0.5)){best=now;queue=failedNow().filter(n=>(tries[n]||0)<3);}
    else{copperRestore(B,snap);P=null;}
    if(!P)P=prepare(B,o);
  }
  const fail=failedNow();const al=autoLen(B);
  return{ok:nets.length-fail.length,total:nets.length,fail:fail.map(n=>({net:n,why:(res[n]&&res[n].why)||'막힘'})),len:al.l,vias:al.v,rounds,results:nets.map(n=>({net:n,ok:!fail.includes(n)}))};
}

/* ---------- PathFinder: negotiated congestion routing (McMurchie & Ebeling 1995) as a repair stage ----------
   The routes already on the board (auto copper of the given nets) are the starting point; the unrouted nets are routed
   through whatever is in the way (overuse is priced, not forbidden). Each round every net that shares a cell with
   another net is ripped up and re-routed with cost × (1 + history) × (1 + pres × occupancy); pres grows each round
   and the history of overused cells accumulates, so nets settle where they fit. At the end only conflict-free routes
   are committed; what is still in conflict is dropped and tried once more sequentially. */
function* jobPF(B,nets,opts){
  const o=Object.assign({},DEF,opts||{});const rounds=o.pfRounds||14,tLimit=o.pfTimeMs||90000;let pres=o.pfPres||0.6;const presMul=o.pfPresMul||1.6,hFac=o.pfHist||0.35;
  const t0=Date.now();const wMax=o.width.signal/2-0.001;
  // existing auto copper of these nets → PF routes; take it off the board so the grid holds the fixed copper only
  const own=new Set(nets);const R={};const kill=[];
  PC.cuKeys(B).forEach((L,li)=>B.layers[L+'.cu'].forEach(p=>{if(!p.auto||p.fan||!own.has(p.net)||!(p.t==='path'||p.t==='seg'))return;const r=R[p.net]||(R[p.net]={tracks:[],vias:[],len:0});const t=p.t==='seg'?{t:'path',pts:[p.a,p.b],w:p.w,net:p.net,auto:true}:p;t._l=li;t._side=L;r.tracks.push(t);kill.push(p);}));
  B.vias.forEach(v=>{if(!v.auto||v.fan||!own.has(v.net))return;(R[v.net]||(R[v.net]={tracks:[],vias:[],len:0})).vias.push(v);kill.push(v);});
  unroute(B,kill);const P=prepare(B,o);const G=P.G,N=G.N,NL=G.NL;
  const occ=Array.from({length:NL},()=>new Int16Array(N)),hist=Array.from({length:NL},()=>new Float32Array(N)),occV=new Int16Array(N),histV=new Float32Array(N);
  const stT=Array.from({length:NL},()=>new Int32Array(N)),stV=new Int32Array(N);let gen=0;
  const pf={occ,hist,occV,histV,pres};
  // cells a route occupies for other nets: track halo (w/2 + clearance + wMax) and via halo, plus the via-vs-via disk
  const cellsOfRoute=r=>{gen++;const T=[],V=[];const disk=(sh,mT,mV)=>{const m=Math.max(mT,mV);const bb=bboxOf(sh,m);
      const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(sh,G.ox+x*G.g,G.oy+y*G.g);if(d>m)continue;const i=y*G.nx+x;
        if(d<=mT)sh.L.forEach(l=>{if(stT[l][i]!==gen){stT[l][i]=gen;T.push(l*N+i);}});if(d<=mV&&stV[i]!==gen){stV[i]=gen;V.push(i);}}};
    r.tracks.forEach(t=>{for(let i=1;i<t.pts.length;i++)disk({k:'cap',a:t.pts[i-1],b:t.pts[i],r:t.w/2,L:[t._l]},wMax+o.clear,o.via.d/2+o.clear);});
    r.vias.forEach(v=>disk({k:'cap',a:[v.x,v.y],b:[v.x,v.y],r:v.d/2,L:ALL(NL)},wMax+o.clear,o.via.d/2+o.clear));
    // the resources the route itself uses: its centre-line cells and via cells (a conflict = another net's halo on these)
    gen++;const LT=[],LV=[];r.tracks.forEach(t=>{for(let i=1;i<t.pts.length;i++){const sh={k:'cap',a:t.pts[i-1],b:t.pts[i],r:0,L:[t._l]};const bb=bboxOf(sh,G.g);
      const x0=Math.max(0,Math.floor((bb[0]-G.ox)/G.g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/G.g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/G.g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/G.g));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(dist(sh,G.ox+x*G.g,G.oy+y*G.g)>G.g*0.51)continue;const i=y*G.nx+x;if(stT[t._l][i]!==gen){stT[t._l][i]=gen;LT.push(t._l*N+i);}}}});
    r.vias.forEach(v=>{const x=Math.round((v.x-G.ox)/G.g),y=Math.round((v.y-G.oy)/G.g);if(x<0||y<0||x>=G.nx||y>=G.ny)return;const i=y*G.nx+x;if(stV[i]!==gen){stV[i]=gen;LV.push(i);}});
    return{T:Int32Array.from(T),V:Int32Array.from(V),LT:Int32Array.from(LT),LV:Int32Array.from(LV)};};
  const add=(net,d)=>{const r=R[net];r.cells=cellsOfRoute(r);r.cells.T.forEach(id=>{occ[(id/N)|0][id%N]+=d;});r.cells.V.forEach(i=>{occV[i]+=d;});};
  const sub=net=>{const r=R[net];if(!r||!r.cells)return;r.cells.T.forEach(id=>{occ[(id/N)|0][id%N]-=1;});r.cells.V.forEach(i=>{occV[i]-=1;});r.cells=null;};
  Object.keys(R).forEach(n=>add(n,1));
  const conflicted=net=>{const r=R[net];if(!r||!r.cells)return false;const c=r.cells;for(const id of c.LT)if(occ[(id/N)|0][id%N]>1)return true;
    for(const i of c.LV){if(occV[i]>1)return true;for(let l=0;l<NL;l++)if(occ[l][i]>1)return true;}return false;};
  const S0=shapesOfBoard(B);const openNow=nets.filter(n=>!R[n]&&groups(B,S0,n).length>1);
  let todo=openNow.slice(),round=0,last={conflicts:openNow.length,open:openNow.length};
  for(round=1;round<=rounds;round++){pf.pres=pres;
    for(let i=0;i<todo.length;i++){const net=todo[i];yield{phase:'pf',round,max:rounds,i,total:todo.length,net,conflicts:last.conflicts,open:last.open};
      sub(net);const r=routeNetPF(P,B,net,pf);if(r.ok){R[net]=r;add(net,1);}else{delete R[net];}
      if(Date.now()-t0>tLimit)break;}
    // history grows where cells are overused; the next round re-routes every net that stands on such a cell
    let over=0;for(let l=0;l<NL;l++){const a=occ[l],h=hist[l];for(let i=0;i<N;i++)if(a[i]>1){h[i]+=hFac*(a[i]-1);over++;}}for(let i=0;i<N;i++)if(occV[i]>1){histV[i]+=hFac*(occV[i]-1);over++;}
    const bad=nets.filter(n=>R[n]&&conflicted(n));const open=nets.filter(n=>!R[n]&&groups(B,S0,n).length>1);
    last={conflicts:bad.length,open:open.length,over};
    if((!bad.length&&!open.length)||Date.now()-t0>tLimit)break;
    todo=bad.concat(open.filter(n=>!bad.includes(n)));pres*=presMul;}
  // commit: conflict-free routes first, then any route whose cells are still free of committed copper
  const cm=Array.from({length:NL},()=>new Uint8Array(N)),cv=new Uint8Array(N);const done=new Set(),dropped=[];
  const clean=n=>{const c=R[n].cells;for(const id of c.LT)if(cm[(id/N)|0][id%N])return false;for(const i of c.LV){if(cv[i])return false;for(let l=0;l<NL;l++)if(cm[l][i])return false;}return true;};
  const order=nets.filter(n=>R[n]).sort((a,b)=>(conflicted(a)?1:0)-(conflicted(b)?1:0)||netPrio(B,a,o.W)-netPrio(B,b,o.W));
  for(const n of order){const r=R[n];if(!clean(n)){dropped.push(n);continue;}r.cells.T.forEach(id=>{cm[(id/N)|0][id%N]=1;});r.cells.V.forEach(i=>{cv[i]=1;});
    r.tracks.forEach(t=>{t._side=G.keys[t._l];B.layers[t._side+'.cu'].push(t);delete t._l;});r.vias.forEach(v=>{B.vias.push(v);});done.add(n);}
  // exact geometry check of what was committed: a PF route that still violates clearance is taken off and re-tried
  {const viol=drc(B,o);const badNets=new Set(viol.filter(v=>v.net&&done.has(v.net)).map(v=>v.net));
    if(badNets.size){const kill2=[];PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.auto&&!p.fan&&badNets.has(p.net))kill2.push(p);}));B.vias.forEach(v=>{if(v.auto&&!v.fan&&badNets.has(v.net))kill2.push(v);});
      unroute(B,kill2);badNets.forEach(n=>{done.delete(n);dropped.push(n);});}}
  // the dropped ones get one sequential try against the committed copper
  const P2=prepare(B,o);const seq={};for(const n of dropped){seq[n]=routeNet(P2,B,n);if(seq[n].ok)done.add(n);}
  const S1=shapesOfBoard(B);const fail=nets.filter(n=>groups(B,S1,n).length>1);
  return{ok:nets.length-fail.length,total:nets.length,fail:fail.map(n=>({net:n,why:'협상 배선 후에도 막힘'})),rounds:round,dropped:dropped.length,ms:Date.now()-t0,start:openNow.length};
}
/* one net under PathFinder costs: joins its groups one after another without touching the board or the grid */
function routeNetPF(P,B,net,pf){
  const{o,G}=P;const k=P.idOf(net);const w=widthFor(B,net,o);let comps=groups(B,P.S,net);if(comps.length<=1)return{ok:true,tracks:[],vias:[],len:0};
  comps.sort((a,b)=>a.length-b.length);let cur=comps[0],rest=comps.slice(1);const tracks=[],vias=[];let len=0;const ext=new Set();let guard=0;
  const wBase=Math.max(o.width.signal,o.width.power);const dil=w>wBase+1e-6?Math.ceil((w-wBase)/2/G.g):0;const edgeCost=o.edgeBand>0&&netPrio(B,net,o.W)===1?(o.edgeCost||1.5):0;
  while(rest.length){if(++guard>Math.max(24,comps.length+8))return{ok:false,why:'반복 한도'};
    const src=new Set(ext),tgt=new Set(),own=new Map();padCells(G,w,cur,src,own);padCells(G,w,rest.flat(),tgt,own);
    let anchors=[];rest.flat().forEach(s=>{const pts=s.k==='cap'?[s.a,s.b]:[[s.x,s.y]];pts.forEach(p=>anchors.push([(p[0]-G.ox)/G.g,(p[1]-G.oy)/G.g]));});
    if(anchors.length>24){let sx=0,sy=0,sn=0;cur.forEach(s=>{const p=s.k==='cap'?s.a:[s.x,s.y];sx+=(p[0]-G.ox)/G.g;sy+=(p[1]-G.oy)/G.g;sn++;});sx/=sn;sy/=sn;anchors=anchors.map(a=>[a,Math.abs(a[0]-sx)+Math.abs(a[1]-sy)]).sort((a,b)=>a[1]-b[1]).slice(0,24).map(a=>a[0]);}
    const nb=o.netBottom&&o.netBottom[net];const r=astar(G,k,src,tgt,anchors,Object.assign({},o,{dil,edgeCost,pf},nb?{bottomCost:nb}:{}));if(!r.path)return{ok:false,why:r.fail};
    const endS=own.get(r.path[r.path.length-1]);let gi=rest.findIndex(g=>g.includes(endS));if(gi<0)gi=0;
    const cu=toCopper(G,r.path,w,o.via,net,own.get(r.path[0]),endS);
    cu.tracks.forEach(t=>{tracks.push(t);});cu.vias.forEach(v=>vias.push(v));len+=cu.len;r.path.forEach(id=>ext.add(id));
    cur=cur.concat(rest[gi]);rest.splice(gi,1);}
  return{ok:true,tracks,vias,len};
}

/* ---------- post-route optimisation (gloss): fewer vias, shorter and straighter tracks ----------
   Every net is re-routed once on its own while all other copper stays fixed: its auto tracks and vias come off, the
   router runs with a via price several times higher (so a same-layer detour beats a layer change) and the result is
   kept only when it has fewer vias, or the same vias and less copper, and does not add DRC errors or open connections. */
function* gloss(B,nets,opts){
  const o=Object.assign({},DEF,opts||{});const passes=o.glossPasses||1,viaMul=o.glossVia||3,maxLen=o.glossMaxLen||1.6;const t0=Date.now(),tLimit=o.glossTimeMs||60000;
  const stat=net=>{let l=0,v=0;PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(!p.auto||p.fan||p.net!==net||!(p.t==='path'||p.t==='seg'))return;const q=p.pts||[p.a,p.b];for(let i=1;i<q.length;i++)l+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);}));B.vias.forEach(x=>{if(x.auto&&!x.fan&&x.net===net)v++;});return{l,v};};
  const tot=()=>{let l=0,v=0;nets.forEach(n=>{const s=stat(n);l+=s.l;v+=s.v;});return{l,v};};const before=tot();
  const drc0=drc(B,o).length;let changed=0,tried=0;
  for(let pass=0;pass<passes;pass++){
    const order=nets.map(n=>({n,s:stat(n)})).filter(x=>x.s.v>0||(o.glossAll&&x.s.l>0)).sort((a,b)=>b.s.v-a.s.v||b.s.l-a.s.l).map(x=>x.n);let any=false;
    for(let i=0;i<order.length;i++){const net=order[i];if(Date.now()-t0>tLimit)break;tried++;
      yield{phase:'gloss',pass:pass+1,passes,i,total:order.length,net,changed};
      const s0=stat(net);
      const snap=copperSnap(B);const kill=[];PC.cuKeys(B).forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.auto&&!p.fan&&p.net===net)kill.push(p);}));B.vias.forEach(v=>{if(v.auto&&!v.fan&&v.net===net)kill.push(v);});
      unroute(B,kill);const P=prepare(B,Object.assign({},o,{viaCost:(o.viaCost||2)*viaMul,pf:null}));const r=routeNet(P,B,net);
      const s1=stat(net);const ok=r.ok&&groups(B,shapesOfBoard(B),net).length<=1&&(s1.v<s0.v||(s1.v===s0.v&&s1.l<s0.l-0.2))&&s1.l<=s0.l*maxLen+3;
      if(ok&&drc(B,o).length>drc0){copperRestore(B,snap);continue;}
      if(ok){changed++;any=true;}else copperRestore(B,snap);}
    if(!any)break;}
  const after=tot();return{changed,tried,vias:[before.v,after.v],len:[before.l,after.l],ms:Date.now()-t0};
}
function unroute(B,list){ // remove auto tracks/vias (all, or only those in list)
  const kill=list?new Set(list):null;const keep=p=>!((p.auto||(!kill&&(p.fill||p.stitch)))&&(!kill||kill.has(p))); // unrouting everything also drops the power fill
  const keys=PC.cuKeys(B);keys.forEach(s=>{B.layers[s+'.cu']=B.layers[s+'.cu'].filter(keep);});B.vias=B.vias.filter(keep);
  Object.values(B.nets).forEach(n=>{n.tracks=n.tracks.filter(keep);n.vias=n.vias.filter(keep);n.len={T:0,B:0};n.tracks.forEach(t=>{const L=t._side||keys.find(k=>B.layers[k+'.cu'].includes(t))||'T';const q=t.pts||[t.a,t.b];n.len[L]=n.len[L]||0;for(let i=1;i<q.length;i++)n.len[L]+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);});});
}
// clearance check of the auto-routed copper against everything else (exact geometry, not the grid)
function drc(B,opts){
  const o=Object.assign({},DEF,opts||{});const S=shapesOfBoard(B);const mine=S.filter(s=>s.prim&&s.prim.auto||s.via&&s.via.auto);const out=[];
  mine.forEach(a=>{S.forEach(b=>{if(a===b||b.net===a.net&&!b.hole)return;if(!a.L.some(l=>b.L.includes(l)))return;const ba=bboxOf(a,o.clear),bb=bboxOf(b,0);if(ba[2]<bb[0]||bb[2]<ba[0]||ba[3]<bb[1]||bb[3]<ba[1])return;
    const gap=shapeGap(a,b);if(gap<o.clear-0.03)out.push({net:a.net,other:b.net||(b.hole?'구멍':'(넷 없음)'),gap,at:a.k==='cap'?a.a:[a.x,a.y]});});});
  return out;
}

/* ---------- power copper fill (high-current nets in the power-stage region) ----------
   A grid zone fill: every free cell of the region (no other net's copper within the clearance, not in the escape ring of
   another net's pad) is given to the nearest high-current net by a multi-source BFS from that net's own copper; cells of
   two different fill nets are kept ≥ clearance apart; islands that touch none of the net's copper are dropped. The cells
   become copper as merged rectangles (fat segments, prim.fill = true), so routing, DRC and connectivity see them.
   GND fill gets stitching vias to the plane. bottleneck() measures what the copper really offers: the widest path
   (maximin of the distance transform) between the net's power terminals → an effective width to compare with IPC-2221. */
function powerFill(B,o){o=Object.assign({layer:0,clr:0.25,esc:0.9,grid:0.1,stitch:1.3,via:{d:0.6,drill:0.3}},o||{});
  const keys=PC.cuKeys(B),L=o.layer,lk=keys[L];const nets=o.nets.filter(n=>B.nets[n]);if(!nets.length)return{cells:0,nets:[]};
  B.layers[lk+'.cu']=B.layers[lk+'.cu'].filter(p=>!(p.fill&&nets.includes(p.net)));B.vias=B.vias.filter(v=>!(v.stitch&&v.fillL===L&&nets.includes(v.net))); // only this layer's earlier plane stitching (pad vias / layer stitching stay)
  const P=prepare(B,{grid:o.grid,clear:o.clr,width:{signal:o.grid,power:o.grid},via:o.via});const G=P.G,S=P.S,g=G.g;const occ=G.occT[L];
  const r0=o.rect;const X0=Math.max(0,Math.ceil((r0[0]-G.ox)/g)),X1=Math.min(G.nx-1,Math.floor((r0[2]-G.ox)/g)),Y0=Math.max(0,Math.ceil((r0[1]-G.oy)/g)),Y1=Math.min(G.ny-1,Math.floor((r0[3]-G.oy)/g));
  const inR=i=>{const x=i%G.nx,y=(i/G.nx)|0;return x>=X0&&x<=X1&&y>=Y0&&y<=Y1;};
  const id=nets.map(n=>P.idOf(n)),own=new Int16Array(G.N).fill(-1),blocked=new Uint8Array(G.N);
  const cellsNear=(s,m,f)=>{const bb=bboxOf(s,m);const x0=Math.max(X0,Math.floor((bb[0]-G.ox)/g)),x1=Math.min(X1,Math.ceil((bb[2]-G.ox)/g)),y0=Math.max(Y0,Math.floor((bb[1]-G.oy)/g)),y1=Math.min(Y1,Math.ceil((bb[3]-G.oy)/g));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=dist(s,G.ox+x*g,G.oy+y*g);if(d<=m)f(y*G.nx+x,d);}};
  // the escape ring of every other net's pad stays free (a track or via must still reach it)
  S.forEach(s=>{if(!s.pad||!s.L.includes(L)||nets.includes(s.net)||!s.net)return;cellsNear(s,o.esc,i=>{blocked[i]=1;});});
  // seeds: the fill nets' own copper on this layer
  const Q=[];S.forEach(s=>{const k=nets.indexOf(s.net);if(k<0||!s.L.includes(L))return;cellsNear(s,0,i=>{if(own[i]<0&&(occ[i]===id[k])){own[i]=k;Q.push(i);}});});
  const seed=new Uint8Array(G.N);Q.forEach(i=>{seed[i]=1;});
  // corridors first: the nets with a target width (o.width[net], mm) grow alone up to half that width around their own copper,
  // highest current first, so a bus keeps its width where the space allows; then every net grows into what is left
  // reserved strips (the supply bus beside the bridge) belong to their net before anything else grows
  (o.claim||[]).forEach(c=>{const k=nets.indexOf(c.net);if(k<0)return;const r=c.rect;for(let y=Math.max(Y0,Math.ceil((r[1]-G.oy)/g));y<=Math.min(Y1,Math.floor((r[3]-G.oy)/g));y++)for(let x=Math.max(X0,Math.ceil((r[0]-G.ox)/g));x<=Math.min(X1,Math.floor((r[2]-G.ox)/g));x++){const i=y*G.nx+x;
      if(own[i]>=0||blocked[i])continue;const v=occ[i];if(v!==0&&v!==id[k])continue;own[i]=k;Q.push(i);}});
  if(o.width){const order=nets.map((n,k)=>k).filter(k=>o.width[nets[k]]>0).sort((a,b)=>(o.width[nets[b]]||0)-(o.width[nets[a]]||0));
    order.forEach(k=>{const lim=Math.ceil(o.width[nets[k]]/2/g);const dep=new Map();const q=[];for(let i=0;i<G.N;i++)if(own[i]===k&&seed[i]){q.push(i);dep.set(i,0);}
      for(let h=0;h<q.length;h++){const i=q[h],d0=dep.get(i);if(d0>=lim)continue;const x=i%G.nx;for(const j of [x>X0?i-1:-1,x<X1?i+1:-1,i-G.nx,i+G.nx]){if(j<0||j>=G.N||own[j]>=0||blocked[j]||!inR(j))continue;const v=occ[j];if(v!==0&&v!==id[k])continue;own[j]=k;dep.set(j,d0+1);q.push(j);Q.push(j);}}});}
  for(let h=0;h<Q.length;h++){const i=Q[h],k=own[i];const x=i%G.nx;const nb=[x>X0?i-1:-1,x<X1?i+1:-1,i-G.nx,i+G.nx];
    for(const j of nb){if(j<0||j>=G.N||own[j]>=0||blocked[j]||!inR(j))continue;const v=occ[j];if(v!==0&&v!==id[k])continue;own[j]=k;Q.push(j);}}
  // gap between different fill nets ≥ clearance
  const r=Math.ceil((o.clr+g*0.5)/g);const keep=new Int16Array(own);
  for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++){const i=y*G.nx+x,k=own[i];if(k<0||seed[i])continue;let bad=false;
    for(let dy=-r;dy<=r&&!bad;dy++){const yy=y+dy;if(yy<Y0||yy>Y1)continue;for(let dx=-r;dx<=r;dx++){const xx=x+dx;if(xx<X0||xx>X1)continue;const k2=own[yy*G.nx+xx];if(k2>=0&&k2!==k){bad=true;break;}}}if(bad)keep[i]=-1;}
  // keep only the parts joined to the net's own copper
  const fin=new Int16Array(G.N).fill(-1);const Q2=[];for(let i=0;i<G.N;i++)if(seed[i]&&keep[i]>=0){fin[i]=keep[i];Q2.push(i);}
  for(let h=0;h<Q2.length;h++){const i=Q2[h],k=fin[i];const x=i%G.nx;for(const j of [x>X0?i-1:-1,x<X1?i+1:-1,i-G.nx,i+G.nx]){if(j<0||j>=G.N||fin[j]>=0||keep[j]!==k)continue;fin[j]=k;Q2.push(j);}}
  // cells → rectangles → fat segments
  const add=[];const cnt=nets.map(()=>0);
  nets.forEach((n,k)=>{let open={};for(let y=Y0;y<=Y1+1;y++){const runs={};if(y<=Y1){let x=X0;while(x<=X1){if(fin[y*G.nx+x]===k&&!seed[y*G.nx+x]){let e=x;while(e+1<=X1&&fin[y*G.nx+e+1]===k&&!seed[y*G.nx+e+1])e++;runs[x+':'+e]=1;cnt[k]+=e-x+1;x=e+1;}else x++;}}
      const next={};Object.keys(runs).forEach(key=>{next[key]=open[key]?open[key]:{y0:y};});
      Object.keys(open).forEach(key=>{if(next[key])return;const[xa,xb]=key.split(':').map(Number);const ya=open[key].y0,yb=y-1;
        const x0=G.ox+(xa-0.5)*g,x1=G.ox+(xb+0.5)*g,y0=G.oy+(ya-0.5)*g,y1=G.oy+(yb+0.5)*g,w=x1-x0,h=y1-y0;
        const q=v=>+v.toFixed(3);const R=[q(x0),q(y0),q(x1),q(y1)];
        add.push({t:'poly',rings:[[[R[0],R[1]],[R[2],R[1]],[R[2],R[3]],[R[0],R[3]]]],rect:R,net:n,fill:true});});open=next;}});
  // the cells seeded from the net's own copper (pads, tracks) are filled too where they lie outside the copper
  B.layers[lk+'.cu'].push(...add);
  // stitching vias: GND (and any plane net) fill → plane, on a lattice inside the fill
  let nv=0;const planeNets=new Set();keys.forEach((kk,li)=>{if(li===L)return;B.layers[kk+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)planeNets.add(p.net);});});
  const vr=Math.ceil((o.via.d/2+0.05)/g),st=Math.max(1,Math.round(o.stitch/g));
  nets.forEach((n,k)=>{if(!planeNets.has(n))return;const kid=id[k];for(let y=Y0+vr;y<=Y1-vr;y+=st)for(let x=X0+vr;x<=X1-vr;x+=st){let ok=true;
      for(let dy=-vr;dy<=vr&&ok;dy++)for(let dx=-vr;dx<=vr;dx++){const j=(y+dy)*G.nx+x+dx;if(fin[j]!==k&&!(seed[j]&&own[j]===k)){ok=false;break;}}
      if(!ok)continue;const i=y*G.nx+x;if(G.occV.some(a=>a[i]!==0&&a[i]!==kid))continue;const v={x:+(G.ox+x*g).toFixed(3),y:+(G.oy+y*g).toFixed(3),d:o.via.d,drill:o.via.drill,net:n,stitch:true,fillL:L};B.vias.push(v);nv++;}});
  if(typeof PCBEDIT!=='undefined')try{PCBEDIT.rebuildNets(B);}catch(e){}
  return{nets,cells:cnt.reduce((a,b)=>a+b,0),area:nets.map((n,k)=>({net:n,mm2:+(cnt[k]*g*g).toFixed(1)})),segs:add.length,vias:nv,grid:g,rect:r0};}
/* effective copper width of a net on a layer between its power terminals (pads of FETs, terminals, shunts, bulk caps) */
function bottleneck(B,net,o){o=Object.assign({layer:0,grid:0.1,rect:null,padRing:1.0},o||{});const keys=PC.cuKeys(B);const L=o.layer;
  const P=prepare(B,{grid:o.grid,clear:0.01,width:{signal:o.grid,power:o.grid}});const G=P.G,g=G.g;const S=P.S.filter(s=>s.net===net&&s.L.includes(L));
  const mask=new Uint8Array(G.N);S.forEach(s=>{const bb=bboxOf(s,0);const x0=Math.max(0,Math.floor((bb[0]-G.ox)/g)),x1=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/g)),y0=Math.max(0,Math.floor((bb[1]-G.oy)/g)),y1=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/g));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(dist(s,G.ox+x*g,G.oy+y*g)<=g*0.5)mask[y*G.nx+x]=1;}});
  // distance transform (chamfer 3-4), in cells
  const D=new Float32Array(G.N);for(let i=0;i<G.N;i++)D[i]=mask[i]?1e9:0;const nx=G.nx,ny=G.ny;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x;if(!D[i])continue;let v=D[i];if(x>0)v=Math.min(v,D[i-1]+1);if(y>0){v=Math.min(v,D[i-nx]+1);if(x>0)v=Math.min(v,D[i-nx-1]+1.414);if(x<nx-1)v=Math.min(v,D[i-nx+1]+1.414);}if(x===0||y===0||x===nx-1||y===ny-1)v=Math.min(v,1);D[i]=v;}
  for(let y=ny-1;y>=0;y--)for(let x=nx-1;x>=0;x--){const i=y*nx+x;if(!D[i])continue;let v=D[i];if(x<nx-1)v=Math.min(v,D[i+1]+1);if(y<ny-1){v=Math.min(v,D[i+nx]+1);if(x<nx-1)v=Math.min(v,D[i+nx+1]+1.414);if(x>0)v=Math.min(v,D[i+nx-1]+1.414);}D[i]=v;}
  // terminals: pads of power parts on this net
  const pw=c=>/^(Q|J|CP)\d/.test(c.ref)||/^R\d/.test(c.ref)&&/^(2512|2010|1206)$/.test(c.fp||'')&&/션트|shunt|0\.\d+Ω|mΩ/i.test((c.desc||'')+' '+(c.val||''))||/^D\d/.test(c.ref)&&/역|TVS|SMAJ|SM8S/i.test((c.desc||'')+(c.val||''));
  const terms=[];B.comps.forEach(c=>{if(!pw(c))return;const ps=c.pads.filter(p=>p.net===net&&(o.proj||p.side==='both'||p.drill||(L===0?p.side!=='B':p.side==='B')));if(!ps.length)return;
    const cells=new Set();ps.forEach(p=>{const s=padShape(p,keys.length);const bb=bboxOf(s,o.padRing);for(let y=Math.max(0,Math.floor((bb[1]-G.oy)/g));y<=Math.min(ny-1,Math.ceil((bb[3]-G.oy)/g));y++)for(let x=Math.max(0,Math.floor((bb[0]-G.ox)/g));x<=Math.min(nx-1,Math.ceil((bb[2]-G.ox)/g));x++){const i=y*nx+x;if(mask[i]&&dist(s,G.ox+x*g,G.oy+y*g)<=o.padRing)cells.add(i);}});
    if(cells.size)terms.push({ref:c.ref,cells:[...cells]});});
  if(terms.length<2)return{net,terms:terms.map(t=>t.ref),width:null,pairs:[]};
  const pairs=[];const INF=1e9;
  terms.forEach((T,ti)=>{const best=new Float32Array(G.N);const H=[];T.cells.forEach(i=>{best[i]=INF;H.push(i);});
    // maximin Dijkstra with a bucket-less binary heap
    const heap=[];const push=(i,v)=>{heap.push([v,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]>=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
    const pop=()=>{const t=heap[0];const l=heap.pop();if(heap.length){heap[0]=l;let k=0;for(;;){const a=2*k+1,b=a+1;let m=k;if(a<heap.length&&heap[a][0]>heap[m][0])m=a;if(b<heap.length&&heap[b][0]>heap[m][0])m=b;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return t;};
    H.forEach(i=>push(i,INF));const done=new Uint8Array(G.N);
    while(heap.length){const[v,i]=pop();if(done[i])continue;done[i]=1;const x=i%nx;for(const j of [x>0?i-1:-1,x<nx-1?i+1:-1,i-nx,i+nx]){if(j<0||j>=G.N||!mask[j]||done[j])continue;const w=Math.min(v,D[j]);if(w>best[j]){best[j]=w;push(j,w);}}}
    terms.forEach((U,ui)=>{if(ui<=ti)return;let m=0;U.cells.forEach(i=>{if(best[i]>m)m=best[i];});pairs.push({a:T.ref,b:U.ref,width:m>=INF?null:+(m>0?(2*m-1)*g:0).toFixed(2),open:m===0});});});
  const ws=pairs.filter(p=>p.width!=null).map(p=>p.width);const open=pairs.filter(p=>p.open).length;
  return{net,terms:terms.map(t=>t.ref),width:ws.length?Math.min(...ws):null,open,pairs};}


/* vias between the copper fills of the same net on two layers (outer top + bottom) so both carry the current */
function stitchLayers(B,nets,o){o=Object.assign({via:{d:0.45,drill:0.2},step:1.2,grid:0.1,la:0,lb:null},o||{});const keys=PC.cuKeys(B);const la=o.la,lb=o.lb==null?keys.length-1:o.lb;
  const P=prepare(B,{grid:o.grid,clear:0.15,width:{signal:o.grid,power:o.grid},via:o.via});const G=P.G,g=G.g;const vr=o.via.d/2+0.12;let n=0;
  // a via fits where the net's copper on that layer — the union of its fill tiles (and, with o.pads, its pads) — covers the whole
  // via disk: cover the grid cells, then keep the cells whose ring of radius vr is covered too (fills are many small tiles)
  nets.forEach(net=>{const k=P.idOf(net);const sh=P.S.filter(s=>s.net===net&&(s.fill||(o.pads&&s.pad)));const rr=Math.ceil(vr/g);const ring=[[0,0]];for(let q=0;q<16;q++){const a=q*Math.PI/8;ring.push([Math.round(rr*Math.cos(a)),Math.round(rr*Math.sin(a))]);}
    const on=l=>{const cov=new Uint8Array(G.N);sh.filter(s=>s.L.includes(l)).forEach(s=>{const bb=bboxOf(s,0);
      for(let y=Math.max(0,Math.floor((bb[1]-G.oy)/g));y<=Math.min(G.ny-1,Math.ceil((bb[3]-G.oy)/g));y++)for(let x=Math.max(0,Math.floor((bb[0]-G.ox)/g));x<=Math.min(G.nx-1,Math.ceil((bb[2]-G.ox)/g));x++)if(dist(s,G.ox+x*g,G.oy+y*g)<=0.001)cov[y*G.nx+x]=1;});
      const m=new Uint8Array(G.N);for(let y=0;y<G.ny;y++)for(let x=0;x<G.nx;x++){if(!cov[y*G.nx+x])continue;let ok=1;for(const[dx,dy]of ring){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=G.nx||Y>=G.ny||!cov[Y*G.nx+X]){ok=0;break;}}if(ok)m[y*G.nx+x]=1;}return m;};
    const inR=(x,y)=>!o.rects||o.rects.some(r=>x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3]);const room=v=>!B.vias.some(q=>Math.hypot(q.x-v.x,q.y-v.y)<(q.d+o.via.d)/2+0.2);
    const A=on(la),Bm=la===lb?A:on(lb);const st=o.rects?1:Math.max(1,Math.round(o.step/g));if(o.dbg){const c=a=>a.reduce((x,v)=>x+v,0);let inr=0,fr=0,rm=0;for(let y=0;y<G.ny;y++)for(let x=0;x<G.nx;x++){const i=y*G.nx+x;if(!A[i]||!Bm[i]||!inR(G.ox+x*g,G.oy+y*g))continue;inr++;if(G.occV.some(a=>a[i]!==0&&a[i]!==k))continue;fr++;if(room({x:G.ox+x*g,y:G.oy+y*g}))rm++;}o.dbg.push({net,sh:sh.length,A:c(A),inr,fr,rm});}
    // o.rects: only inside these boxes (vias around one power terminal); la === lb: from that copper down to the net's plane
    for(let y=0;y<G.ny;y+=st)for(let x=0;x<G.nx;x+=st){const i=y*G.nx+x;if(!A[i]||!Bm[i])continue;if(!inR(G.ox+x*g,G.oy+y*g))continue;if(G.occV.some(a=>a[i]!==0&&a[i]!==k))continue;if(o.rects&&!room({x:G.ox+x*g,y:G.oy+y*g}))continue;
      const v={x:+(G.ox+x*g).toFixed(3),y:+(G.oy+y*g).toFixed(3),d:o.via.d,drill:o.via.drill,net,stitch:true};B.vias.push(v);n++;
      const r=Math.ceil((o.via.d+0.3)/g);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const j=(y+dy)*G.nx+x+dx;if(j>=0&&j<G.N)G.occV.forEach(a=>{a[j]=-1;});}}});
  if(typeof PCBEDIT!=='undefined')try{PCBEDIT.rebuildNets(B);}catch(e){}return n;}


/* via-in-pad on the big power pads (exposed pads of the bridge FETs, DPAK tabs, terminal-side pads): the current reaches the
   inner planes / the other outer layer right at the part instead of through one fan-out via */
/* dead copper: fill islands of a net that touch none of its pads (and, for a plane / poured net, no via down to it) carry
   no current and only show up as unconnected copper — remove them with their stitching vias (never a routed track) */
function pruneIslands(B,nets){const S=shapesOfBoard(B);const keys=PC.cuKeys(B);const pour=new Set();
  keys.forEach(k=>B.layers[k+'.cu'].forEach(p=>{if(p.t==='pour'&&p.net)pour.add(p.net);}));PC.stackOf(B).forEach(x=>{if(x.net&&x.role!=='sig')pour.add(x.net);});
  const kill=new Set(),killV=new Set();
  nets.forEach(net=>components(S,net).forEach(g=>{if(g.some(s=>s.pad))return;if(pour.has(net)&&g.some(s=>s.via))return;
    if(g.some(s=>(s.prim&&!s.fill)||(s.via&&!s.via.stitch)))return;g.forEach(s=>{if(s.fill)kill.add(s.prim);else if(s.via)killV.add(s.via);});}));
  if(kill.size)keys.forEach(k=>{B.layers[k+'.cu']=B.layers[k+'.cu'].filter(p=>!kill.has(p));});if(killV.size)B.vias=B.vias.filter(v=>!killV.has(v));
  return{fills:kill.size,vias:killV.size};}
/* last pass: short unconnected pairs (a pad that found no room for its own via next to copper of its net) joined by a
   straight or L-shaped track on a layer both ends share, only where the exact clearance to every other net holds */
function bridgeRats(B,o){o=Object.assign({clear:0.15,width:0.25,maxLen:4},o||{});if(typeof PCBEDIT==='undefined')return{added:0};
  const keys=PC.cuKeys(B),st=PC.stackOf(B);const sigL=st.map((x,i)=>x.role==='sig'?i:-1).filter(i=>i>=0);let added=0;
  for(let pass=0;pass<2;pass++){const R=PCBEDIT.ratsnest(B).filter(r=>r.len<=o.maxLen);if(!R.length)break;const S=shapesOfBoard(B);
    const C=2,G=new Map();const gadd=s=>{const b=bboxOf(s,0);for(let x=Math.floor(b[0]/C);x<=Math.floor(b[2]/C);x++)for(let y=Math.floor(b[1]/C);y<=Math.floor(b[3]/C);y++){const k=x*100003+y;let a=G.get(k);if(!a)G.set(k,a=[]);a.push(s);}};S.forEach(gadd);
    const near=(x,y)=>{const out=new Set();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=G.get((Math.floor(x/C)+i)*100003+Math.floor(y/C)+j);if(a)a.forEach(s=>out.add(s));}return out;};
    const at=(p,net)=>S.filter(s=>s.net===net&&dist(s,p[0],p[1])<=0.01);
    const segOk=(a,b,L,net,w)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/0.05));for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;
      for(const s of near(x,y)){if(!s.L.includes(L))continue;if(s.net===net&&!s.hole)continue;const m=s.hole?Math.max(o.clear,0.25):o.clear;if(dist(s,x,y)-w/2<m-0.005)return false;}}return true;};
    const ring=B.outline[0];const inB=p=>!ring||PC.inRing(p[0],p[1],ring);
    R.forEach(r=>{const A=at(r.a,r.net),Bs=at(r.b,r.net);if(!A.length||!Bs.length)return;
      const LA=new Set([].concat(...A.map(s=>s.L))),Ls=sigL.filter(l=>LA.has(l)&&Bs.some(s=>s.L.includes(l)));
      for(const L of Ls){const w=o.width;const opts=[[r.a,r.b],[r.a,[r.b[0],r.a[1]],r.b],[r.a,[r.a[0],r.b[1]],r.b]];
        for(const pts of opts){if(!pts.every(inB))continue;let ok=true;for(let i=1;i<pts.length;i++)if(!segOk(pts[i-1],pts[i],L,r.net,w)){ok=false;break;}if(!ok)continue;
          const t=pts.length===2?{t:'seg',a:pts[0].slice(),b:pts[1].slice(),w,net:r.net,auto:true,_side:keys[L]}:{t:'path',pts:pts.map(p=>p.slice()),w,net:r.net,auto:true,_side:keys[L]};
          B.layers[keys[L]+'.cu'].push(t);added++;for(let i=1;i<pts.length;i++)gadd({k:'cap',a:pts[i-1],b:pts[i],r:w/2,L:[L],net:r.net});return;}}});
    PCBEDIT.rebuildNets(B);}
  return{added};}
function padVias(B,nets,o){o=Object.assign({via:{d:0.45,drill:0.2},pitch:1.0,minArea:2.5,grid:0.05},o||{});const keys=PC.cuKeys(B),NL=keys.length;
  const P=prepare(B,{grid:o.grid,clear:0.15,width:{signal:0.1,power:0.1},via:o.via});const G=P.G;let n=0;const want=new Set(nets);
  B.comps.forEach(c=>c.pads.forEach(p=>{if(!want.has(p.net)||p.drill||p.w*p.h<o.minArea)return;const k=P.idOf(p.net);const sh=padShape(p,NL);const a=(p.ang||0)*D2R,ca=Math.cos(a),sa=Math.sin(a);
    const hx=p.w/2-o.via.d/2-0.1,hy=p.h/2-o.via.d/2-0.1;if(hx<0||hy<0)return;const nx=Math.max(1,Math.floor(2*hx/o.pitch)+1),ny=Math.max(1,Math.floor(2*hy/o.pitch)+1);
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const u=nx>1?-hx+2*hx*i/(nx-1):0,v=ny>1?-hy+2*hy*j/(ny-1):0;const x=p.x+u*ca-v*sa,y=p.y+u*sa+v*ca;
      const ci=Math.round((x-G.ox)/G.g),cj=Math.round((y-G.oy)/G.g);if(ci<0||cj<0||ci>=G.nx||cj>=G.ny)continue;const idx=cj*G.nx+ci;
      if(G.occV.some((arr,l)=>arr[idx]!==0&&arr[idx]!==k))continue;if(B.vias.some(q=>Math.hypot(q.x-x,q.y-y)<o.via.d+0.15))continue;
      B.vias.push({x:+x.toFixed(3),y:+y.toFixed(3),d:o.via.d,drill:o.via.drill,net:p.net,stitch:true,inpad:true});n++;}}));
  if(typeof PCBEDIT!=='undefined')try{PCBEDIT.rebuildNets(B);}catch(e){}return n;}

return{bridgeRats,pruneIslands,padVias,stitchLayers,powerFill,bottleneck,gloss,jobPF,routeNetPF,groups,mstEdges,DEF,prepare,paint,dist,routeNet,route,job,jobRR,copperSnap,copperRestore,estimate,openNets,components,shapesOfBoard,unroute,drc,widthFor,netPrio,PRIO_LABEL,returnVias,HS_RE,AN_RE};
})();
if(typeof module!=='undefined')module.exports=AUTOROUTE;
