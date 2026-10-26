/* Simulation engines: IR drop, signal integrity, thermal, circuit (MNA). Pure functions over the board model. */
const SIM=(function(){
"use strict";
const RHO20=1.72e-8,ALPHA=0.00393,D2R=Math.PI/180;

/* ---------- value parsing ---------- */
const MULT={p:1e-12,n:1e-9,u:1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9,R:1,r:1};
function parseVal(s){
  if(s==null)return NaN;s=String(s).replace(/Ω|ohms?/gi,'').replace(/[µμ]/g,'u').trim();
  let m=s.match(/^(\d+)([pnumkKMGRr])(\d+)/);if(m)return parseFloat(m[1]+'.'+m[3])*MULT[m[2]];
  m=s.match(/(\d*\.?\d+)\s*(meg|[pnumkKMGRr])?/i);if(!m)return NaN;
  const u=m[2]||'';return parseFloat(m[1])*(u.toLowerCase()==='meg'?1e6:(MULT[u]||1));
}
function fmtSI(v,unit,d){if(!isFinite(v))return'—';if(Math.abs(v)<1e-15)return'0 '+unit;const a=Math.abs(v);const P=[[1e9,'G'],[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p']];
  for(const[f,s]of P)if(a>=f*0.9995||f===1e-12){const x=v/f;return(Math.abs(x)>=100?x.toFixed(0):Math.abs(x)>=10?x.toFixed(d==null?1:d):x.toFixed(d==null?2:d))+' '+s+unit;}return v+' '+unit;}
function nominalV(n){
  n=(n||'').replace(/^\//,'').toUpperCase();let m=n.match(/(\d+)V(\d+)/);if(m)return parseFloat(m[1]+'.'+m[2]);
  m=n.match(/(\d+(?:\.\d+)?)V/);if(m)return parseFloat(m[1]);
  if(/VBUS|USB/.test(n))return 5;if(/VBAT|BAT/.test(n))return 3.7;if(/VIN|VSYS/.test(n))return 5;return 3.3;
}

/* ---------- linear algebra ---------- */
function cg(n,mul,b,diag,tol,maxIt){
  const x=new Float64Array(n),r=Float64Array.from(b),z=new Float64Array(n),p=new Float64Array(n),Ap=new Float64Array(n);
  for(let i=0;i<n;i++){z[i]=r[i]/diag[i];p[i]=z[i];}
  let rz=0,bn=0;for(let i=0;i<n;i++){rz+=r[i]*z[i];bn+=b[i]*b[i];}bn=Math.sqrt(bn)||1;
  let it=0;
  for(;it<maxIt;it++){
    mul(p,Ap);let pAp=0;for(let i=0;i<n;i++)pAp+=p[i]*Ap[i];if(!(pAp>0))break;
    const a=rz/pAp;let rn=0;for(let i=0;i<n;i++){x[i]+=a*p[i];r[i]-=a*Ap[i];rn+=r[i]*r[i];}
    if(Math.sqrt(rn)/bn<tol)break;
    let rz2=0;for(let i=0;i<n;i++){z[i]=r[i]/diag[i];rz2+=r[i]*z[i];}const be=rz2/rz;rz=rz2;for(let i=0;i<n;i++)p[i]=z[i]+be*p[i];
  }
  return{x,it};
}
let NZ=new Int32Array(64);
function lusolve(A,b,n){ // dense storage, partial pivot, skips zero columns; A is Float64Array n*n (destroyed)
  if(NZ.length<n)NZ=new Int32Array(n*2);
  for(let k=0;k<n;k++){
    let p=k,mx=Math.abs(A[k*n+k]);for(let i=k+1;i<n;i++){const v=Math.abs(A[i*n+k]);if(v>mx){mx=v;p=i;}}
    if(mx<1e-300)return null;
    if(p!==k){for(let j=0;j<n;j++){const t=A[k*n+j];A[k*n+j]=A[p*n+j];A[p*n+j]=t;}const t=b[k];b[k]=b[p];b[p]=t;}
    const akk=A[k*n+k],kn=k*n;
    // circuit matrices are sparse: only update the columns where the pivot row is non-zero
    let m=0;for(let j=k+1;j<n;j++)if(A[kn+j]!==0)NZ[m++]=j;
    for(let i=k+1;i<n;i++){const f=A[i*n+k]/akk;if(f===0)continue;A[i*n+k]=0;const inn=i*n;for(let q=0;q<m;q++){const j=NZ[q];A[inn+j]-=f*A[kn+j];}b[i]-=f*b[k];}
  }
  const x=new Float64Array(n);for(let i=n-1;i>=0;i--){let s=b[i];for(let j=i+1;j<n;j++)s-=A[i*n+j]*x[j];x[i]=s/A[i*n+i];}return x;
}

/* ---------- geometry helpers ---------- */
function inPad(p,x,y,g){const dx=x-p.x,dy=y-p.y;if(p.shape==='circle')return Math.hypot(dx,dy)<=p.w/2+g;const a=-(p.ang||0)*D2R,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
  if(p.lbb)return lx>=p.lbb[0]-g&&lx<=p.lbb[2]+g&&ly>=p.lbb[1]-g&&ly<=p.lbb[3]+g;return Math.abs(lx)<=p.w/2+g&&Math.abs(ly)<=p.h/2+g;}
function proj(px,py,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((px-a[0])*dx+(py-a[1])*dy)/l:0;t=t<0?0:t>1?1:t;return{t,d:Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)};}
function inRing(x,y,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;}
function netSegs(B,net){
  const out=[];['T','B'].forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.net!==net||p.clear)return;
    if(p.t==='seg')out.push({L,a:p.a,b:p.b,w:p.w});else if(p.t==='path')for(let i=1;i<p.pts.length;i++)out.push({L,a:p.pts[i-1],b:p.pts[i],w:p.w});}));
  return out;
}
function netPads(B,net){const s=new Set();['T','B'].forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.t==='pad'&&p.net===net&&!p.clear&&!p.via)s.add(p);}));return[...s];}
const IPC=(I,wmm,tum)=>{const A=(wmm/0.0254)*(tum/25.4);return Math.pow(Math.abs(I)/(0.048*Math.pow(A,0.725)),1/0.44);};
const IPCmax=(dT,wmm,tum)=>{const A=(wmm/0.0254)*(tum/25.4);return 0.048*Math.pow(dT,0.44)*Math.pow(A,0.725);};

/* ---------- IR drop ---------- */
function irSolve(B,net,env,srcPad,Vs,loads){
  const t=env.cu*1e-6,rho=RHO20*(1+ALPHA*(env.Ta-20)),Rs=rho/t;
  let segs=netSegs(B,net);
  // split at T-junctions
  const ends=[];segs.forEach(s=>{ends.push([s.L,s.a],[s.L,s.b]);});
  const split=segs.map(()=>[]);
  segs.forEach((s,i)=>{ends.forEach(([L,e])=>{if(L!==s.L)return;const q=proj(e[0],e[1],s.a,s.b);if(q.t>1e-4&&q.t<1-1e-4&&q.d<=s.w/2+0.01)split[i].push(q.t);});});
  const fin=[];segs.forEach((s,i)=>{const ts=[0].concat(split[i].sort((a,b)=>a-b),[1]);for(let k=1;k<ts.length;k++){if(ts[k]-ts[k-1]<1e-6)continue;const p=(t)=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];fin.push({L:s.L,a:p(ts[k-1]),b:p(ts[k]),w:s.w});}});
  segs=fin;
  const nodes=[],key=new Map();
  const node=(L,x,y)=>{const k=L+Math.round(x*200)+','+Math.round(y*200);let i=key.get(k);if(i==null){i=nodes.length;nodes.push({L,x,y});key.set(k,i);}return i;};
  const par=[];const find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)par[a]=b;};
  const edges=[];
  segs.forEach(s=>{s.na=node(s.L,s.a[0],s.a[1]);s.nb=node(s.L,s.b[0],s.b[1]);const len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])*1e-3;s.R=rho*len/(Math.max(s.w,0.01)*1e-3*t);});
  const endN=nodes.length;
  const pads=netPads(B,net);const padNode=new Map();
  pads.forEach(p=>{const i=nodes.length;nodes.push({L:p.side||'T',x:p.x,y:p.y,pad:p});padNode.set(p,i);});
  const vias=B.vias.filter(v=>v.net===net);const viaN=[];
  vias.forEach(v=>{const a=nodes.length;nodes.push({L:'T',x:v.x,y:v.y,via:v});const b=nodes.length;nodes.push({L:'B',x:v.x,y:v.y,via:v});viaN.push([a,b,v]);});
  const zones=[];['T','B'].forEach(L=>B.layers[L+'.cu'].forEach(p=>{if(p.net!==net||p.clear)return;
    if(p.t==='poly'){const i=nodes.length;nodes.push({L,zone:p});zones.push({i,L,inside:(x,y)=>{let c=false;p.rings.forEach(r=>{if(inRing(x,y,r))c=!c;});return c;}});}
    else if(p.t==='pour'){const i=nodes.length;nodes.push({L,zone:p});zones.push({i,L,inside:(x,y)=>x>p.inset&&y>p.inset&&x<B.W-p.inset&&y<B.H-p.inset});}}));
  for(let i=0;i<nodes.length;i++)par[i]=i;
  pads.forEach(p=>{const pi=padNode.get(p);for(let i=0;i<endN;i++){const n=nodes[i];if((p.side==='both'||p.side===n.L||!p.side)&&inPad(p,n.x,n.y,0.02))uni(i,pi);}});
  viaN.forEach(([a,b,v])=>{for(let i=0;i<endN;i++){const n=nodes[i];if(Math.hypot(n.x-v.x,n.y-v.y)<=v.d/2+0.02)uni(i,n.L==='T'?a:b);}
    pads.forEach(p=>{if(inPad(p,v.x,v.y,0)){if(p.side!=='B')uni(a,padNode.get(p));if(p.side!=='T')uni(b,padNode.get(p));}});
    const pl=25e-6,dr=Math.max(v.drill||0.3,0.1)*1e-3;edges.push({a,b,R:rho*B.t*1e-3/(Math.PI*dr*pl),via:v});});
  segs.forEach(s=>{if(s.R<1e-9)uni(s.na,s.nb);else edges.push({a:s.na,b:s.nb,R:s.R,seg:s});});
  zones.forEach(z=>{const Rz=Rs*0.5;
    for(let i=0;i<nodes.length;i++){const n=nodes[i];if(n.zone)continue;if(n.pad){const p=n.pad;if(!(p.side==='both'||p.side===z.L||!p.side))continue;}else if(n.L!==z.L)continue;if(z.inside(n.x,n.y))edges.push({a:i,b:z.i,R:Rz,zone:true});}});
  // compress
  const root=new Map();const idx=i=>{const r=find(i);let k=root.get(r);if(k==null){k=root.size;root.set(r,k);}return k;};
  for(let i=0;i<nodes.length;i++)idx(i);
  const N=root.size;const E=edges.map(e=>({a:idx(e.a),b:idx(e.b),R:e.R,e})).filter(e=>e.a!==e.b);
  const adj=Array.from({length:N},()=>[]);E.forEach((e,k)=>{adj[e.a].push(k);adj[e.b].push(k);});
  const src=idx(padNode.get(srcPad));
  // reachable
  const reach=new Uint8Array(N);const st=[src];reach[src]=1;while(st.length){const u=st.pop();for(const k of adj[u]){const e=E[k];const v=e.a===u?e.b:e.a;if(!reach[v]){reach[v]=1;st.push(v);}}}
  const map=new Int32Array(N).fill(-1);let n=0;for(let i=0;i<N;i++)if(reach[i]&&i!==src)map[i]=n++;
  const diag=new Float64Array(n),b=new Float64Array(n);
  E.forEach(e=>{const g=1/e.R;const ia=map[e.a],ib=map[e.b];if(ia>=0)diag[ia]+=g;if(ib>=0)diag[ib]+=g;if(e.a===src&&ib>=0)b[ib]+=g*Vs;if(e.b===src&&ia>=0)b[ia]+=g*Vs;});
  const unconnected=[];
  loads.forEach(l=>{const k=idx(padNode.get(l.pad));if(!reach[k]){unconnected.push(l);return;}if(k===src)return;b[map[k]]-=l.I;});
  for(let i=0;i<n;i++)if(!(diag[i]>0))diag[i]=1e-9;
  const mul=(x,y)=>{for(let i=0;i<n;i++)y[i]=diag[i]*x[i];E.forEach(e=>{const ia=map[e.a],ib=map[e.b];if(ia>=0&&ib>=0){const g=1/e.R;y[ia]-=g*x[ib];y[ib]-=g*x[ia];}});};
  const sol=n?cg(n,mul,b,diag,1e-12,Math.max(400,n*4)):{x:new Float64Array(0),it:0};
  const V=new Float64Array(N).fill(NaN);V[src]=Vs;for(let i=0;i<N;i++)if(map[i]>=0)V[i]=sol.x[map[i]];
  const nodeV=i=>V[idx(i)];
  // results per segment / via
  let loss=0,maxI=0,maxDT=0,over=0;
  const segR=segs.map(s=>{const va=nodeV(s.na),vb=nodeV(s.nb);const I=s.R>1e-9&&isFinite(va)&&isFinite(vb)?(va-vb)/s.R:0;const aI=Math.abs(I);loss+=I*I*s.R;if(aI>maxI)maxI=aI;
    const dT=aI>0?IPC(aI,s.w,env.cu):0;if(dT>maxDT)maxDT=dT;if(dT>10)over++;return{L:s.L,a:s.a,b:s.b,w:s.w,I:aI,dT,va,vb};});
  const viaR=viaN.map(([a,b,v])=>({x:v.x,y:v.y,d:v.d,v:nodeV(a)}));
  const padR=pads.map(p=>({pad:p,v:nodeV(padNode.get(p))}));
  E.forEach(e=>{if(e.e.via||e.e.zone){const I=(V[e.a]-V[e.b])/e.R;if(isFinite(I))loss+=I*I*e.R;}});
  const loadR=loads.filter(l=>!unconnected.includes(l)).map(l=>({pad:l.pad,I:l.I,v:nodeV(padNode.get(l.pad))}));
  let vmin=Vs,worst=null;loadR.forEach(l=>{if(l.v<vmin){vmin=l.v;worst=l;}});
  return{net,Vs,src:srcPad,segs:segR,vias:viaR,pads:padR,loads:loadR,unconnected,loss,maxI,maxDT,over,vmin,worst,iters:sol.it,zones:zones.length};
}

/* ---------- signal integrity ---------- */
function microstrip(w,h,t,er){
  let we=w;if(t>0){const x=w/h>=1/(2*Math.PI)?2*h/t:4*Math.PI*w/t;we=w+(t/Math.PI)*(1+Math.log(x));}
  const u=we/h;let ee=(er+1)/2+(er-1)/2*Math.pow(1+12/u,-0.5);if(u<1)ee+=(er-1)/2*0.04*Math.pow(1-u,2);
  const z=u<=1?60/Math.sqrt(ee)*Math.log(8/u+u/4):120*Math.PI/(Math.sqrt(ee)*(u+1.393+0.667*Math.log(u+1.444)));
  return{z0:z,eeff:ee,ps:Math.sqrt(ee)*3.33564};
}
function pairKey(n){const s=n.replace(/^\//,'');let m;
  if((m=s.match(/^(.*?)(\+|-)$/)))return{b:m[1]+'±',p:m[2]==='+'};
  if((m=s.match(/^(.*?)_?D(P|M|N)$/i)))return{b:m[1]+'_D',p:m[2].toUpperCase()==='P'};
  if((m=s.match(/^(.*?)_(P|N)$/i)))return{b:m[1]+'_PN',p:m[2].toUpperCase()==='P'};
  if((m=s.match(/^(.*?[A-Z0-9])(P|N)$/))&&m[1].length>=2)return{b:m[1]+'PN',p:m[2]==='P'};
  return null;}
function siAnalyze(B,env){
  const h=env.h,t=env.cu*1e-3,er=env.er;const nets=[];const cache={};
  const ms=w=>cache[w]||(cache[w]=microstrip(w,h,t,er));
  B.netOrder.forEach(n=>{
    const segs=netSegs(B,n);if(!segs.length)return;
    let len=0,delay=0,zmin=1e9,zmax=0,wmin=1e9,wmax=0;const lenL={T:0,B:0};
    segs.forEach(s=>{const l=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);const m=ms(s.w);len+=l;lenL[s.L]+=l;delay+=l*m.ps;zmin=Math.min(zmin,m.z0);zmax=Math.max(zmax,m.z0);wmin=Math.min(wmin,s.w);wmax=Math.max(wmax,s.w);});
    nets.push({net:n,cls:B.netClass(n),len,lenL,delay,zmin,zmax,wmin,wmax,vias:(B.nets[n]?B.nets[n].vias.length:0),segs});
  });
  const byBase={};nets.forEach(r=>{const k=pairKey(r.net);if(!k)return;(byBase[k.b]=byBase[k.b]||{})[k.p?'P':'N']=r;});
  const pairs=[];
  Object.entries(byBase).forEach(([b,v])=>{if(!v.P||!v.N)return;
    let sum=0,cnt=0,tot=0;
    v.P.segs.forEach(s=>{const l=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);const k=Math.max(1,Math.ceil(l/0.2));for(let i=0;i<k;i++){const tt=(i+0.5)/k,x=s.a[0]+(s.b[0]-s.a[0])*tt,y=s.a[1]+(s.b[1]-s.a[1])*tt;tot++;
      let best=1e9,bw=0;v.N.segs.forEach(q=>{if(q.L!==s.L)return;const d=proj(x,y,q.a,q.b).d;if(d<best){best=d;bw=q.w;}});
      const gap=best-(s.w+bw)/2;if(gap<Math.max(1.0,4*s.w)){sum+=gap;cnt++;}}});
    const sp=cnt?sum/cnt:null;const z0=ms((v.P.wmin+v.P.wmax)/2).z0;
    pairs.push({base:b.replace(/(±|_D|_PN|PN)$/,''),P:v.P,N:v.N,mis:Math.abs(v.P.len-v.N.len),skew:Math.abs(v.P.delay-v.N.delay),spacing:sp,coupled:tot?cnt/tot:0,zdiff:sp!=null?2*z0*(1-0.48*Math.exp(-0.96*Math.max(sp,0.01)/h)):null});});
  nets.sort((a,b)=>b.len-a.len);
  return{nets,pairs,h,er,t:env.cu,ref:{w:0.25,...ms(0.25)}};
}

/* ---------- thermal (2D sheet conduction + convection) ---------- */
function thermalSolve(grid,env,P){
  const{nx,ny,a,mask,cov}=grid;const n=nx*ny;
  const tb=env.t*1e-3,tcu=env.cu*1e-6;
  const Gs=new Float64Array(n);for(let i=0;i<n;i++)Gs[i]=mask[i]?0.3*tb+385*tcu*cov[i]:0;
  const Gc=2*env.hconv*a*a;
  const id=new Int32Array(n).fill(-1);let m=0;for(let i=0;i<n;i++)if(mask[i])id[i]=m++;
  const diag=new Float64Array(m),bb=new Float64Array(m);const nb=[];// pairs
  const gh=(x,y)=>2*x*y/(x+y);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i;if(!mask[k])continue;const u=id[k];diag[u]+=Gc;bb[u]+=P[k]+Gc*env.Ta;
    if(i+1<nx&&mask[k+1]){const g=gh(Gs[k],Gs[k+1]);nb.push(u,id[k+1],g);diag[u]+=g;diag[id[k+1]]+=g;}
    if(j+1<ny&&mask[k+nx]){const g=gh(Gs[k],Gs[k+nx]);nb.push(u,id[k+nx],g);diag[u]+=g;diag[id[k+nx]]+=g;}}
  const NB=Float64Array.from(nb),L=NB.length;
  const mul=(x,y)=>{for(let i=0;i<m;i++)y[i]=diag[i]*x[i];for(let q=0;q<L;q+=3){const u=NB[q],v=NB[q+1],g=NB[q+2];y[u]-=g*x[v];y[v]-=g*x[u];}};
  const sol=cg(m,mul,bb,diag,1e-10,4000);
  const T=new Float32Array(n).fill(NaN);let tmax=-1e9,tmin=1e9;for(let i=0;i<n;i++)if(id[i]>=0){const v=sol.x[id[i]];T[i]=v;if(v>tmax)tmax=v;if(v<tmin)tmin=v;}
  return{T,tmax,tmin,iters:sol.it};
}

/* ---------- thermal, 2-layer board (top/bottom copper sheets coupled through FR-4 and thermal vias) ----------
   grid: {nx,ny,a(m),mask,covT,covB,viaG(W/K per cell, vertical via conductance), pkgT/pkgB (extra sheet conductance of package
         lead frames / exposed pads that spread heat over the footprint), inT/inB (W/K sheet conductance of the inner copper layers,
         each lumped into the nearer outer sheet — planes are thin FR-4 away from it and joined by the same vias)}
   env:  {t(mm), cuT, cuB (µm), kxy, kz (FR-4 W/m·K), kcu, hT, hB (convection W/m²K), eps, Ta}
   Radiation is linearised around the mean board temperature and refined over a few outer passes. */
const SIGMA=5.670e-8;
function hRad(eps,Ta,Tm){const a=Ta+273.15,b=Tm+273.15;return eps*SIGMA*(a*a+b*b)*(a+b);}
function thermalSolve2(grid,env,Pt,Pb,extra){
  // extra: junction nodes [{cells:[k], layer:'T'|'B', gB (W/K junction→board), gA (W/K junction→ambient via TIM/housing), P}]
  extra=extra||[];
  const{nx,ny,a,mask,covT,covB,viaG}=grid;const n=nx*ny;
  const tb=env.t*1e-3,kcu=env.kcu||390,kxy=env.kxy||0.3,kz=env.kz||0.3;
  const GsT=new Float64Array(n),GsB=new Float64Array(n),Gz=new Float64Array(n);
  const pT=grid.pkgT,pB=grid.pkgB;
  const iT=grid.inT,iB=grid.inB; // inner copper (planes · inner signal layers) lumped into the nearer outer sheet as extra lateral conductance
  for(let i=0;i<n;i++)if(mask[i]){GsT[i]=kcu*env.cuT*1e-6*covT[i]+kxy*tb/2+(pT?pT[i]:0)+(iT?iT[i]:0);GsB[i]=kcu*env.cuB*1e-6*covB[i]+kxy*tb/2+(pB?pB[i]:0)+(iB?iB[i]:0);Gz[i]=kz*a*a/tb+(viaG?viaG[i]:0);}
  const id=new Int32Array(n).fill(-1);let m=0;for(let i=0;i<n;i++)if(mask[i])id[i]=m++;
  const gh=(x,y)=>2*x*y/(x+y);const nb=[];
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i;if(!mask[k])continue;const u=id[k];
    if(i+1<nx&&mask[k+1]){nb.push(u,id[k+1],gh(GsT[k],GsT[k+1]),m+u,m+id[k+1],gh(GsB[k],GsB[k+1]));}
    if(j+1<ny&&mask[k+nx]){nb.push(u,id[k+nx],gh(GsT[k],GsT[k+nx]),m+u,m+id[k+nx],gh(GsB[k],GsB[k+nx]));}
    nb.push(u,m+u,Gz[k]);}
  extra.forEach((e,q)=>{const node=2*m+q;const cs=e.cells.filter(k=>id[k]>=0);const g=e.gB/Math.max(1,cs.length);cs.forEach(k=>nb.push(node,(e.layer==='B'?m:0)+id[k],g));});
  const NB=Float64Array.from(nb),L=NB.length,NN=2*m+extra.length;let Tm=env.Ta+10,sol=null,hrT=0,hrB=0;
  for(let pass=0;pass<3;pass++){
    hrT=hRad(env.eps,env.Ta,Tm);hrB=hrT;const gT=(env.hT+hrT)*a*a,gB=(env.hB+hrB)*a*a;
    const diag=new Float64Array(NN),bb=new Float64Array(NN);extra.forEach((e,q)=>{diag[2*m+q]+=e.gA;bb[2*m+q]+=e.P+e.gA*env.Ta;});
    for(let k=0;k<n;k++){const u=id[k];if(u<0)continue;diag[u]+=gT;diag[m+u]+=gB;bb[u]+=Pt[k]+gT*env.Ta;bb[m+u]+=Pb[k]+gB*env.Ta;}
    for(let q=0;q<L;q+=3){diag[NB[q]]+=NB[q+2];diag[NB[q+1]]+=NB[q+2];}
    const mul=(x,y)=>{for(let i=0;i<NN;i++)y[i]=diag[i]*x[i];for(let q=0;q<L;q+=3){const u=NB[q],v=NB[q+1],g=NB[q+2];y[u]-=g*x[v];y[v]-=g*x[u];}};
    sol=cg(NN,mul,bb,diag,1e-10,8000);let s=0;for(let i=0;i<2*m;i++)s+=sol.x[i];const nm=s/(2*m);if(Math.abs(nm-Tm)<0.2){Tm=nm;break;}Tm=nm;}
  const T=new Float32Array(n).fill(NaN),Tb=new Float32Array(n).fill(NaN);let tmax=-1e9,tmin=1e9,qc=0,qr=0;
  for(let k=0;k<n;k++){const u=id[k];if(u<0)continue;const t1=sol.x[u],t2=sol.x[m+u];T[k]=t1;Tb[k]=t2;tmax=Math.max(tmax,t1,t2);tmin=Math.min(tmin,t1,t2);
    qc+=env.hT*a*a*(t1-env.Ta)+env.hB*a*a*(t2-env.Ta);qr+=hrT*a*a*(t1-env.Ta)+hrB*a*a*(t2-env.Ta);}
  const Tj=extra.map((e,q)=>sol.x[2*m+q]),qTop=extra.reduce((a,e,q)=>a+e.gA*(sol.x[2*m+q]-env.Ta),0);
  return{T,Tb,tmax,tmin,iters:sol.it,qConv:qc,qRad:qr,qTop,hRad:hrT,Tmean:Tm,Tj};
}
/* convection coefficient presets (W/m²K): natural convection depends on mounting, forced from air speed (flat-plate fit) */
function hConv(mode,v){if(mode==='forced'){const s=Math.max(0,v||0);return{hT:7+15*Math.sqrt(s),hB:7+15*Math.sqrt(s)};}
  if(mode==='nat_h')return{hT:10,hB:5};return{hT:9,hB:9};}
/* vertical conductance of one plated through hole (barrel ring of plating thickness tp) */
function viaG(drill,tp,t,kcu){const r=drill*1e-3/2,R=r+tp*1e-6;return(kcu||390)*Math.PI*(R*R-r*r)/(t*1e-3);}

/* ---------- circuit extraction ---------- */
const REG_RE=/1117|LDO|78L?\d\d|LM317|REGUL|AP2112|XC62|MCP1700|TLV7|LD39|NCP11|SPX|RT9|ME62|HT7|LP29|LM1117|TPS7|MIC52/i;
function extractCircuit(B){
  const cls=n=>B.netClass(n);
  const gnd=B.netOrder.find(n=>cls(n)==='접지')||null;
  const els=[],skipped=[];
  const regOut=new Set();
  B.comps.forEach(c=>{
    const r=c.ref.toUpperCase();const nets=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];
    const two=nets.length===2&&c.pads.length<=4;
    if(/^(R|RN)\d/.test(r)&&two){const v=parseVal(c.val);els.push({id:c.ref,ref:c.ref,type:'R',n:nets,val:v>0?v:1e3,guess:!(v>0),on:true});}
    else if(/^C\d/.test(r)&&two){const v=parseVal(c.val);els.push({id:c.ref,ref:c.ref,type:'C',n:nets,val:v>0&&v<1?v:1e-7,guess:!(v>0&&v<1),on:true});}
    else if(/^FB\d/.test(r)&&two){els.push({id:c.ref,ref:c.ref,type:'R',n:nets,val:0.1,guess:true,on:true,fb:true});}
    else if(/^L\d/.test(r)&&two){const v=parseVal(c.val);els.push({id:c.ref,ref:c.ref,type:'L',n:nets,val:v>0&&v<1?v:1e-5,guess:!(v>0&&v<1),on:true});}
    else if(/^(D|LED)\d/.test(r)&&nets.length===2){
      let pa=c.pads.find(p=>/^(A|ANODE|\+)$/i.test(p.fn||'')),pk=c.pads.find(p=>/^(K|C|CATHODE|-)$/i.test(p.fn||''));
      if(!pa||!pk){pk=c.pads.find(p=>p.n==='1')||c.pads[0];pa=c.pads.find(p=>p.net&&p.net!==pk.net);}
      if(!pa||!pk||!pa.net||!pk.net){skipped.push([c.ref,'다이오드 핀 방향을 알 수 없음']);return;}
      const led=c.kind==='led'||/LED/i.test(c.val+' '+c.fp+' '+(c.lib||''));
      els.push({id:c.ref,ref:c.ref,type:'D',n:[pa.net,pk.net],led,on:true});}
    else if(/^(SW|S|BTN|K)\d/.test(r)&&nets.length>=2){els.push({id:c.ref,ref:c.ref,type:'SW',n:nets.slice(0,2),closed:false,on:true});}
    else if(/^(U|IC)\d/.test(r)&&[1,2,3].every(k=>['OUT','IN','EN'].every(f=>c.pads.some(p=>(p.fn||'').toUpperCase()===f+k&&p.net)))){
      // integrated 3-phase half-bridge driver: OUTk to VM when ENk & INk, to GND when ENk & !INk, high-Z when !ENk; body diodes
      const net=f=>{const p=c.pads.find(q=>(q.fn||'').toUpperCase()===f&&q.net);return p&&p.net;};const vm=net('VM'),pg=net('PGND')||net('GND')||gnd;
      if(vm&&pg){const m=c.model||{};els.push({id:c.ref,ref:c.ref,type:'BRIDGE3',n:[vm,pg,net('OUT1'),net('OUT2'),net('OUT3'),net('IN1'),net('IN2'),net('IN3'),net('EN1'),net('EN2'),net('EN3')],ron:m.ron||0.3,vth:m.vth||1.6,iq:m.iq||0.003,on:true});return;}
      skipped.push([c.ref,'VM/GND 핀을 찾지 못함']);}
    else if(/^(U|IC|VR|PS)\d/.test(r)){
      const txt=c.val+' '+c.fp+' '+(c.desc||'')+' '+(c.mpn||'');
      const fn=re=>c.pads.find(p=>re.test(p.fn||''));
      let pin=fn(/^V?IN$/i),pout=fn(/^V?OUT$/i);
      if(REG_RE.test(txt)||(pin&&pout)){
        const pw=nets.filter(n=>cls(n)!=='접지');
        let nin=pin&&pin.net,nout=pout&&pout.net;
        if(!nin||!nout){const s=pw.slice().sort((a,b)=>nominalV(b)-nominalV(a));nin=nin||s[0];nout=nout||s.find(x=>x!==nin);}
        const ng=nets.find(n=>cls(n)==='접지')||gnd;
        if(nin&&nout&&ng&&nin!==nout){let m=txt.match(/[-_ ](\d{1,2})[.Vv](\d)\b/)||txt.match(/78L?(\d\d)/);let vset=m?(m[2]!=null?parseFloat(m[1]+'.'+m[2]):parseFloat(m[1])):nominalV(nout);
          els.push({id:c.ref,ref:c.ref,type:'REG',n:[nin,nout,ng],vset,vdo:/1117/.test(txt)?1.1:0.3,iq:0.005,on:true});regOut.add(nout);return;}
      }
      const pw=nets.filter(n=>cls(n)==='전원');
      if(pw.length&&gnd){els.push({id:c.ref,ref:c.ref,type:'LOAD',n:[pw[0],gnd],I:0.01,vmin:1.0,on:true});}
      else skipped.push([c.ref,'전원 핀을 찾지 못해 제외']);
    }
    else if(/^Q\d/.test(r)){
      // N-channel MOSFET (pins named G/D/S, or a MOSFET part number); BJTs and P-channel parts are not modelled
      const txt=(c.val+' '+c.fp+' '+(c.desc||'')+' '+(c.mpn||'')).toUpperCase(),fn=re=>c.pads.find(p=>re.test(p.fn||''));
      const pg=fn(/^G(ATE)?$/i),pd=fn(/^D(RAIN)?$/i),ps=fn(/^S(OURCE)?$/i);
      const nch=/N-?CH|NMOS|N-MOS|AO3400|2N7002|BSS138|IRLML2502|SI2302|DMN|IRLZ|FDN3/.test(txt)||(c.model&&c.model.type==='nmos');
      if(pg&&pd&&ps&&pg.net&&pd.net&&ps.net&&nch&&!/P-?CH|PMOS/.test(txt)){const m=c.model||{};
        els.push({id:c.ref,ref:c.ref,type:'NMOS',n:[pd.net,pg.net,ps.net],vth:m.vth||1.2,kp:m.kp||8,lam:m.lambda||0.01,on:true});}
      else skipped.push([c.ref,'트랜지스터 모델 없음 (N채널 MOSFET만 지원)']);}
    else if(/^(M|MOT)\d/.test(r)&&['U','V','W'].every(k=>c.pads.some(p=>(p.fn||'').toUpperCase()===k&&p.net))){
      // 3-phase BLDC: Y windings with internal neutral, trapezoidal back-EMF, hall sensors from rotor angle
      const m=Object.assign({R:1.2,L:6e-4,ke:0.02,kt:0.02,J:3e-5,b:1e-5,tf:2e-3,tl:0,poles:2,gear:1,hallV:3.3},c.model||{});
      const ph=['U','V','W'].map(k=>c.pads.find(p=>(p.fn||'').toUpperCase()===k).net);
      els.push(Object.assign({id:c.ref,ref:c.ref,type:'BLDC',n:ph.concat([c.ref+'#N'])},m,{on:true}));
      ['H1','H2','H3'].forEach((h,i)=>{const p=c.pads.find(q=>(q.fn||'').toUpperCase()===h);if(p&&p.net&&gnd)els.push({id:c.ref+'.'+h,ref:c.ref,type:'HALL',n:[p.net,gnd],mot:c.ref,hk:i,poles:m.poles,v:m.hallV,on:true});});}
    else if(/^(M|MOT)\d/.test(r)&&nets.length===2){
      // brushed DC motor: electrical R-L + back-EMF, mechanical inertia, viscous + Coulomb friction, gearbox
      const m=Object.assign({R:2.5,L:5e-4,ke:0.004,kt:0.004,J:1.2e-6,b:2e-7,tf:1e-4,tl:0,gear:1},c.model||{});
      let pp=c.pads.find(p=>/^(\+|M\+|P)$/i.test(p.fn||''))||c.pads.find(p=>p.n==='1');const pm=c.pads.find(p=>p!==pp&&p.net&&p.net!==pp.net);
      if(!pp||!pm){skipped.push([c.ref,'모터 단자를 알 수 없음']);return;}
      els.push(Object.assign({id:c.ref,ref:c.ref,type:'MOTOR',n:[pp.net,pm.net],on:true},m));}
    else if(/^(Y|X)\d/.test(r)&&c.kind==='xtal')skipped.push([c.ref,'크리스털은 모델링하지 않음']);
  });
  // sources
  const srcs=[];
  const pwr=B.netOrder.filter(n=>cls(n)==='전원'&&!regOut.has(n));
  const fromConn=pwr.filter(n=>B.comps.some(c=>/^(J|P|CN|USB|BT)\d/i.test(c.ref)&&c.pads.some(p=>p.net===n)));
  const cands=(fromConn.length?fromConn:pwr).sort((a,b)=>nominalV(b)-nominalV(a));
  if(cands.length&&gnd)srcs.push({id:'V1',type:'V',n:[cands[0],gnd],v:nominalV(cands[0]),wave:'step',t0:0.5e-3,tr:1e-3,per:2e-3,duty:0.5,label:'입력 전원'});
  else if(gnd){const reg=els.find(e=>e.type==='REG');if(reg)srcs.push({id:'V1',type:'V',n:[reg.n[0],gnd],v:Math.max(5,Math.ceil(reg.vset+reg.vdo+1.5)),wave:'step',t0:0.5e-3,tr:1e-3,per:2e-3,duty:0.5,label:'레귤레이터 입력 (전압 추정)'});}
  return{gnd,els,srcs,skipped};
}

/* ---------- MNA engine ---------- */
const VT=0.025852;
function srcVal(s,t){if(s.wave==='dc')return s.v;if(s.wave==='step'){if(t<=s.t0)return 0;if(t>=s.t0+s.tr)return s.v;return s.v*(t-s.t0)/s.tr;}
  if(s.wave==='pulse'){if(t<s.t0)return 0;const ph=((t-s.t0)%s.per)/s.per;return ph<s.duty?s.v:0;}
  if(s.wave==='fw'){if(!s.pwm)return s.level?s.v:0;if(s.duty<=0)return 0;if(s.duty>=1)return s.v;const ph=((t-s.ph0)*s.freq)%1;return ph<s.duty?s.v:0;}
  return s.v;}
function compile(ckt){
  const nodes=new Map();const id=n=>{if(!n||n===ckt.gnd)return-1;let k=nodes.get(n);if(k==null){k=nodes.size;nodes.set(n,k);}return k;};
  const els=ckt.els.filter(e=>e.on).concat(ckt.srcs.filter(s=>s.on!==false)).map(e=>Object.assign({},e,{k:e.n.map(id)}));
  let nb=nodes.size;els.forEach(e=>{if((e.type==='V'&&e.wave!=='fw')||e.type==='REG'||e.type==='L'||e.type==='MOTOR')e.br=nb++;if(e.type==='BLDC')e.brs=[nb++,nb++,nb++];});
  return{nodes,els,N:nb,nn:nodes.size};
}
// level-1 square law, smoothed around threshold, symmetric in drain/source
function mosEval(e,vgs,vds){
  if(vds<0){const r=mosEval(e,vgs-vds,-vds);return{id:-r.id,gm:-r.gm,gds:r.gm+r.gds};}
  const sm=0.04,z=(vgs-e.vth)/sm,vov=z>30?vgs-e.vth:sm*Math.log1p(Math.exp(z)),dvov=z>30?1:1/(1+Math.exp(-z));
  const k=e.kp,lam=e.lam;
  if(vds<vov){const id=k*(vov*vds-vds*vds/2)*(1+lam*vds);return{id,gm:k*vds*(1+lam*vds)*dvov,gds:k*(vov-vds)*(1+lam*vds)+k*(vov*vds-vds*vds/2)*lam};}
  const id=k/2*vov*vov*(1+lam*vds);return{id,gm:k*vov*(1+lam*vds)*dvov,gds:k/2*vov*vov*lam};
}
// motor branch equation  Va-Vc - req*I = rhs ; h=0 means steady state (DC)
function motorDir(e,wp,I){const eps=1e-3;if(wp>eps)return 1;if(wp<-eps)return-1;const T=e.kt*I-e.tl;return Math.abs(T)>e.tf?Math.sign(T):0;}
function motorCoef(e,h,wp,Ip,I){
  const s=motorDir(e,wp,I),jh=h?e.J/h:0,lh=h?e.L/h:0;
  if(s===0&&Math.abs(wp)<1e-3)return{req:e.R+lh,rhs:-lh*Ip,s:0};
  const D=jh+e.b;return{req:e.R+lh+e.ke*e.kt/D,rhs:-lh*Ip+e.ke*(jh*wp-e.tl-s*e.tf)/D,s};
}
function motorSpeed(e,h,wp,I){const jh=h?e.J/h:0,s=motorDir(e,wp,I);if(s===0&&Math.abs(wp)<1e-3)return 0;let w=(jh*wp+e.kt*I-e.tl-s*e.tf)/(jh+e.b);if(s!==0&&w*s<0)w=0;return w;}
const TAU_=2*Math.PI;
// trapezoidal back-EMF shape (flat ±1 over 120°), phase k lags by k·120° electrical
function trap(th){const d=((th*180/Math.PI)%360+360)%360;return d<30?d/30:d<150?1:d<210?1-(d-150)/30:d<330?-1:-1+(d-330)/30;}
const bldcF=(e,th,k)=>trap(th*e.poles-k*TAU_/3);
const hallLevel=(e,th)=>((((th*e.poles-e.hk*TAU_/3)%TAU_)+TAU_)%TAU_)<Math.PI?1:0;
function newton(C,x0,mode,h,t,xprev,state){
  const N=C.N,gmin=1e-9;let x=Float64Array.from(x0);
  for(let it=0;it<150;it++){
    let lim=false;
    const A=C.A||(C.A=new Float64Array(N*N)),b=C.b||(C.b=new Float64Array(N));A.fill(0);b.fill(0);
    const add=(i,j,v)=>{if(i>=0&&j>=0)A[i*N+j]+=v;};const rhs=(i,v)=>{if(i>=0)b[i]+=v;};
    const V=i=>i>=0?x[i]:0,Vp=i=>i>=0?xprev[i]:0;
    const G=(a,c,g)=>{add(a,a,g);add(c,c,g);add(a,c,-g);add(c,a,-g);};
    for(let i=0;i<C.nn;i++)A[i*N+i]+=gmin;
    const diode=(a,c,key,Is,n)=>{const vt=n*VT;let vd=V(a)-V(c);const old=state.vd[key]==null?0:state.vd[key];
      const vcrit=vt*Math.log(vt/(Math.SQRT2*Is));if(vd>vcrit&&Math.abs(vd-old)>2*vt){lim=true;if(old>0){const arg=1+(vd-old)/vt;vd=arg>0?old+vt*Math.log(arg):vcrit;}else vd=vt*Math.log(vd/vt);}
      state.vd[key]=vd;const ex=Math.exp(Math.min(vd/vt,80));const id_=Is*(ex-1),gd=Is/vt*ex+gmin;const ieq=id_-gd*vd;G(a,c,gd);rhs(a,-ieq);rhs(c,ieq);};
    for(const e of C.els){const[a,c,d]=e.k;
      if(e.type==='R')G(a,c,1/Math.max(e.val,1e-6));
      else if(e.type==='SW')G(a,c,e.closed?20:1e-9);
      else if(e.type==='C'){if(mode==='tran'){const g=e.val/h,ieq=g*(Vp(a)-Vp(c));G(a,c,g);rhs(a,ieq);rhs(c,-ieq);}}
      else if(e.type==='L'){const k=e.br;add(a,k,1);add(c,k,-1);add(k,a,1);add(k,c,-1);if(mode==='tran'){add(k,k,-e.val/h);b[k]+=-(e.val/h)*xprev[k];}}
      else if(e.type==='D'){const Is=e.led?1e-18:1e-14,n=e.led?2:1,vt=n*VT;let vd=V(a)-V(c);const old=state.vd[e.id]==null?0:state.vd[e.id];
        const vcrit=vt*Math.log(vt/(Math.SQRT2*Is));if(vd>vcrit&&Math.abs(vd-old)>2*vt){lim=true;if(old>0){const arg=1+(vd-old)/vt;vd=arg>0?old+vt*Math.log(arg):vcrit;}else vd=vt*Math.log(vd/vt);}
        state.vd[e.id]=vd;const ex=Math.exp(Math.min(vd/vt,80));const id_=Is*(ex-1),gd=Is/vt*ex+gmin;const ieq=id_-gd*vd;G(a,c,gd);rhs(a,-ieq);rhs(c,ieq);}
      else if(e.type==='NMOS'){const[dn,gn,sn]=e.k;let vgs=V(gn)-V(sn),vds=V(dn)-V(sn);
        const old=state.vgs[e.id];if(old!=null&&Math.abs(vgs-old)>0.5){vgs=old+Math.sign(vgs-old)*0.5;lim=true;}state.vgs[e.id]=vgs;
        const m=mosEval(e,vgs,vds);const ieq=m.id-m.gm*vgs-m.gds*vds;
        add(dn,dn,m.gds);add(dn,sn,-m.gds-m.gm);add(dn,gn,m.gm);add(sn,sn,m.gds+m.gm);add(sn,dn,-m.gds);add(sn,gn,-m.gm);rhs(dn,-ieq);rhs(sn,ieq);
        G(dn,sn,1e-9);}
      else if(e.type==='MOTOR'){const k=e.br;add(a,k,1);add(c,k,-1);add(k,a,1);add(k,c,-1);
        const I=x[k],m=motorCoef(e,mode==='tran'?h:0,mode==='tran'?(state.w[e.id]||0):0,mode==='tran'?xprev[k]:0,I);add(k,k,-m.req);b[k]+=m.rhs;}
      else if(e.type==='BLDC'){const nn=e.k[3],w=mode==='tran'?(state.w[e.id]||0):0,th=state.th[e.id]||0,lh=mode==='tran'?e.L/h:0;
        for(let q=0;q<3;q++){const kb=e.brs[q],tn=e.k[q];add(tn,kb,1);add(nn,kb,-1);add(kb,tn,1);add(kb,nn,-1);add(kb,kb,-(e.R+lh));b[kb]+=(mode==='tran'?-lh*xprev[kb]:0)+e.ke*w*bldcF(e,th,q);}}
      // MCU pins and hall outputs are push-pull drivers: Norton source with output resistance (keeps the matrix small)
      else if(e.type==='HALL'){const g=1/(e.rout||50),vv=hallLevel(e,state.th[e.mot]||0)?e.v:0;G(a,c,g);rhs(a,vv*g);rhs(c,-vv*g);}
      else if(e.type==='BRIDGE3'){const[vm,pg]=e.k;rhs(vm,-e.iq);rhs(pg,e.iq);
        for(let q=0;q<3;q++){const o=e.k[2+q],en=V(e.k[8+q])-V(pg)>e.vth,hi=V(e.k[5+q])-V(pg)>e.vth;
          G(o,vm,en&&hi?1/e.ron:1e-9);G(o,pg,en&&!hi?1/e.ron:1e-9);diode(o,vm,e.id+'h'+q,1e-12,1.4);diode(pg,o,e.id+'l'+q,1e-12,1.4);}}
      else if(e.type==='LOAD'){const v=V(a)-V(c);if(v<e.vmin)G(a,c,e.I/e.vmin);else{rhs(a,-e.I);rhs(c,e.I);}}
      else if(e.type==='V'&&e.wave==='fw'){const g=1/(e.rout||25),vv=srcVal(e,t);G(a,c,g);rhs(a,vv*g);rhs(c,-vv*g);}
      else if(e.type==='V'){const k=e.br;add(a,k,1);add(c,k,-1);add(k,a,1);add(k,c,-1);b[k]+=srcVal(e,t);}
      else if(e.type==='REG'){const[ni,no,ng]=e.k,k=e.br;const vin=V(ni)-V(ng);
        add(no,k,1);add(ni,k,-1);rhs(ni,-e.iq*Math.min(1,Math.max(vin,0)/1));rhs(ng,e.iq*Math.min(1,Math.max(vin,0)/1));
        if(vin-e.vdo>=e.vset){add(k,no,1);add(k,ng,-1);b[k]+=e.vset;}
        else if(vin>e.vdo){add(k,no,1);add(k,ni,-1);b[k]+=-e.vdo;}
        else{add(k,no,1);add(k,ng,-1);}}
    }
    const xn=lusolve(A,b,N);if(!xn)return{x,ok:false};
    let dmax=0;for(let i=0;i<N;i++){let d=xn[i]-x[i];if(i<C.nn){if(d>2)d=2;else if(d<-2)d=-2;}x[i]+=d;dmax=Math.max(dmax,Math.abs(d));}
    if(dmax<1e-7&&!lim)return{x,ok:true,it};
  }
  return{x,ok:false};
}
function report(C,x,t,st){
  const V=i=>i>=0?x[i]:0;const nets={};C.nodes.forEach((k,n)=>{nets[n]=x[k];});
  const parts=[];
  C.els.forEach(e=>{const[a,c]=e.k;let I=null,P=null;const v=V(a)-V(c);
    if(e.type==='R'){I=v/e.val;P=v*I;}
    else if(e.type==='SW'){I=v*(e.closed?20:1e-9);P=v*I;}
    else if(e.type==='D'){const Is=e.led?1e-18:1e-14,vt=(e.led?2:1)*VT;I=Is*(Math.exp(Math.min(v/vt,80))-1);P=v*I;}
    else if(e.type==='LOAD'){I=v<e.vmin?e.I*v/e.vmin:e.I;P=v*I;}
    else if(e.type==='V'&&e.wave==='fw'){I=(srcVal(e,t)-v)/(e.rout||25);P=-srcVal(e,t)*I;}
    else if(e.type==='V'){I=-x[e.br];P=-srcVal(e,t)*I;}
    else if(e.type==='REG'){const[ni,no,ng]=e.k;const Io=-x[e.br];const vin=V(ni)-V(ng),vout=V(no)-V(ng);I=Io;P=(vin-vout)*Io+vin*e.iq*Math.min(1,Math.max(vin,0));}
    else if(e.type==='L'){I=x[e.br];P=0;}else if(e.type==='C'){I=0;P=0;}
    let extra=null;
    if(e.type==='NMOS'){const[dn,gn,sn]=e.k;const vds=V(dn)-V(sn);I=mosEval(e,V(gn)-V(sn),vds).id;P=vds*I;}
    if(e.type==='HALL'){I=0;P=0;}
    if(e.type==='BRIDGE3'){I=null;P=null;}
    if(e.type==='BLDC'){const ii=e.brs.map(k=>x[k]);I=(Math.abs(ii[0])+Math.abs(ii[1])+Math.abs(ii[2]))/2;P=ii.reduce((s2,q,j)=>s2+q*q*e.R,0);const w=st&&st.w[e.id]!=null?st.w[e.id]:0;extra={w,rpm:w/e.gear*60/(2*Math.PI),gear:e.gear,phases:ii};}
    if(e.type==='MOTOR'){I=x[e.br];P=v*I;const w=st&&st.w[e.id]!=null?st.w[e.id]:motorSpeed(e,0,0,I);extra={w,rpm:w/e.gear*60/(2*Math.PI),gear:e.gear,torque:e.kt*I};}
    parts.push(Object.assign({id:e.id,ref:e.ref||null,type:e.type,I,P,v},extra));});
  return{nets,parts};
}
const newState=()=>({vd:{},vgs:{},w:{},th:{}});
// after an accepted time step: integrate motor speed and shaft angle
function advance(C,x,h,st){C.els.forEach(e=>{
  if(e.type==='BLDC'){const wp=st.w[e.id]||0,th=st.th[e.id]||0;let T=0;for(let q=0;q<3;q++)T+=e.kt*bldcF(e,th,q)*x[e.brs[q]];T-=e.tl;
    let w;const jh=e.J/h;if(Math.abs(wp)<1e-3&&Math.abs(T)<=e.tf)w=0;else{const s=Math.abs(wp)>1e-3?Math.sign(wp):Math.sign(T);w=(jh*wp+T-s*e.tf)/(jh+e.b);if(s!==0&&w*s<0)w=0;}
    st.th[e.id]=th+(wp+w)/2*h;st.w[e.id]=w;return;}
  if(e.type!=='MOTOR')return;const w=motorSpeed(e,h,st.w[e.id]||0,x[e.br]);st.th[e.id]=(st.th[e.id]||0)+((st.w[e.id]||0)+w)/2*h;st.w[e.id]=w;});}
function dcop(ckt){const C=compile(ckt);if(!C.nn)return{error:'시뮬레이션할 넷이 없습니다.'};const r=newton(C,new Float64Array(C.N),'dc',0,ckt.tDC||1e9,new Float64Array(C.N),newState());
  if(!r.ok)return{error:'DC 동작점이 수렴하지 않았습니다. 소자 값이나 소스를 확인해 주세요.'};return Object.assign(report(C,r.x,ckt.tDC||1e9),{C});}
function transient(ckt,tstop,steps,probes,ctl){
  const C=compile(ckt);if(!C.nn)return{error:'시뮬레이션할 넷이 없습니다.'};
  const st=newState();let r=newton(C,new Float64Array(C.N),'dc',0,0,new Float64Array(C.N),st);if(!r.ok)return{error:'초기 동작점이 수렴하지 않았습니다.'};
  let x=r.x;const h=tstop/steps;const time=[0];const data={};probes.forEach(p=>{data[p]=[C.nodes.has(p)?x[C.nodes.get(p)]:0];});
  // animation track: LED currents and motor speed / angle / current, sampled every step (decimated at the end)
  const leds=C.els.filter(e=>e.type==='D'&&e.led),mots=C.els.filter(e=>e.type==='MOTOR'||e.type==='BLDC');
  const motI=e=>e.type==='BLDC'?(Math.abs(x[e.brs[0]])+Math.abs(x[e.brs[1]])+Math.abs(x[e.brs[2]]))/2:x[e.br];
  const an={t:[0],led:{},mot:{}};const vOf=i=>i>=0?x[i]:0;const ledI=e=>{const v=vOf(e.k[0])-vOf(e.k[1]);return Math.max(0,1e-18*(Math.exp(Math.min(v/(2*VT),80))-1));};
  leds.forEach(e=>{an.led[e.id]=[ledI(e)];});mots.forEach(e=>{an.mot[e.id]={w:[0],th:[0],I:[motI(e)],gear:e.gear,type:e.type};});
  // firmware co-simulation: every ctl.dt the MCU loop reads node voltages and updates its pin sources
  let tick=null;
  if(ctl){const byId={};C.els.forEach(e=>{if(e.wave==='fw')byId[e.id]=e;});let next=0;
    const set=(id,v)=>{const e=byId[id];if(!e)return;if(v.freq!=null&&v.freq!==e.freq){e.ph0=nowT;e.freq=v.freq;}Object.assign(e,v);};let nowT=0;
    tick=(t,xx)=>{while(t+1e-12>=next){nowT=next;ctl.tick(next,n=>{const k=C.nodes.get(n);return k==null?0:xx[k];},set);next+=ctl.dt;}};
    tick(0,x);}
  let fails=0;
  for(let s=1;s<=steps;s++){const t=s*h;let q=newton(C,x,'tran',h,t,x,st);
    if(q.ok)advance(C,q.x,h,st);
    else{const h2=h/4;let xx=x;let ok=true;for(let k=1;k<=4;k++){const qq=newton(C,xx,'tran',h2,t-h+k*h2,xx,st);if(!qq.ok){ok=false;break;}xx=qq.x;advance(C,xx,h2,st);}if(!ok){fails++;if(fails>20)return{error:`${(t*1e3).toFixed(3)} ms에서 수렴하지 않았습니다.`};}q={x:xx};}
    x=q.x;time.push(t);probes.forEach(p=>{data[p].push(C.nodes.has(p)?x[C.nodes.get(p)]:0);});
    if(tick)tick(t,x);
    an.t.push(t);leds.forEach(e=>an.led[e.id].push(ledI(e)));mots.forEach(e=>{const m=an.mot[e.id];m.w.push(st.w[e.id]||0);m.th.push(st.th[e.id]||0);m.I.push(motI(e));});}
  return Object.assign({time,data,final:report(C,x,tstop,st),anim:an},{C});
}

return{parseVal,fmtSI,nominalV,irSolve,siAnalyze,microstrip,thermalSolve,thermalSolve2,hConv,hRad,viaG,RHO20,ALPHA,extractCircuit,dcop,transient,IPCmax,IPC};
})();
if(typeof module!=='undefined')module.exports=SIM;
