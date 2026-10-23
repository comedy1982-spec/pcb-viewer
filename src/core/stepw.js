/* STEP (ISO 10303-21, AP214) writer for triangle meshes.
   Each closed mesh becomes a MANIFOLD_SOLID_BREP: triangles are welded by position, coplanar connected triangles are merged
   into one planar ADVANCED_FACE (outer loop + holes), and edges/vertices are shared between faces so the shell is a proper
   B-rep that Fusion, SolidWorks, FreeCAD, SolidCraft … can open as a solid body (faceted: cylinders are polygon facets).
   Input: [{name, tris:number[] (x,y,z × 3 per triangle)}], output: STEP text. Open meshes (not closed) are skipped and counted. */
const STEPW=(function(){
"use strict";
const Q=1e-4;                                   // weld tolerance (mm)
const key=(x,y,z)=>Math.round(x/Q)+','+Math.round(y/Q)+','+Math.round(z/Q);
const f=v=>{const s=(Math.round(v*1e5)/1e5).toString();return /[.eE]/.test(s)?s.replace(/e/i,'E'):s+'.';};
const esc=s=>String(s||'').replace(/[^\x20-\x7E]/g,'_').replace(/'/g,"''");

/* mesh → {V:[[x,y,z]], T:[[a,b,c]]} welded, degenerate triangles dropped */
function weld(tris){const V=[],T=[],deg=[],m=new Map();
  const id=(x,y,z)=>{const k=key(x,y,z);let i=m.get(k);if(i==null){i=V.length;V.push([x,y,z]);m.set(k,i);}return i;};
  for(let i=0;i+8<tris.length;i+=9){const a=id(tris[i],tris[i+1],tris[i+2]),b=id(tris[i+3],tris[i+4],tris[i+5]),c=id(tris[i+6],tris[i+7],tris[i+8]);
    if(a===b||b===c||a===c)continue;const n=normal(V[a],V[b],V[c]);if(!n){deg.push([a,b,c]);continue;}T.push([a,b,c]);}
  // zero-area (collinear) triangles from cap triangulation: their long edge equals the chain end–middle–end, so the
  // neighbour that uses the long edge gets the middle vertex inserted (polygon), which keeps the shell edge-matched
  const d2=(i,j)=>{const p=V[i],q=V[j];return (p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;};
  const items=deg.map(t=>{const e=[[t[0],t[1],t[2]],[t[1],t[2],t[0]],[t[2],t[0],t[1]]].map(([p,q,r])=>({p,q,r,L:d2(p,q)})).sort((x,y)=>y.L-x.L)[0];return e;}).sort((x,y)=>y.L-x.L);
  for(const e of items){for(const poly of T){for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];if((a===e.p&&b===e.q)||(a===e.q&&b===e.p)){poly.splice(j+1,0,e.r);j++;}}}}
  // T-junctions (a vertex lying on another polygon's edge, e.g. cap triangles spanning collinear hole edges): split the edge there
  if(V.length<20000){for(const poly of T){for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];const p=V[a],q=V[b];const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2];const L2=dx*dx+dy*dy+dz*dz;if(L2<1e-8)continue;const ins=[];
      for(let v=0;v<V.length;v++){if(v===a||v===b)continue;const r=V[v];const t=((r[0]-p[0])*dx+(r[1]-p[1])*dy+(r[2]-p[2])*dz)/L2;if(t<=1e-6||t>=1-1e-6)continue;const ex=p[0]+dx*t-r[0],ey=p[1]+dy*t-r[1],ez=p[2]+dz*t-r[2];if(ex*ex+ey*ey+ez*ez<1e-6)ins.push([t,v]);}
      if(ins.length){ins.sort((x,y)=>x[0]-y[0]);poly.splice(j+1,0,...ins.map(x=>x[1]));j+=ins.length;}}}}
  return{V,T};}
/* polygon normal (Newell) — robust when the first vertices are collinear after edge splitting */
function pnormal(V,t){let x=0,y=0,z=0;for(let i=0;i<t.length;i++){const p=V[t[i]],q=V[t[(i+1)%t.length]];x+=(p[1]-q[1])*(p[2]+q[2]);y+=(p[2]-q[2])*(p[0]+q[0]);z+=(p[0]-q[0])*(p[1]+q[1]);}const L=Math.hypot(x,y,z);return L<1e-9?null:[x/L,y/L,z/L];}
function normal(p,q,r){const ux=q[0]-p[0],uy=q[1]-p[1],uz=q[2]-p[2],vx=r[0]-p[0],vy=r[1]-p[1],vz=r[2]-p[2];const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;const L=Math.hypot(x,y,z);return L<1e-9?null:[x/L,y/L,z/L];}
const ekey=(a,b)=>a<b?a+'-'+b:b+'-'+a;
/* every edge must be used exactly twice (once per direction) for a closed manifold */
function closed(M){const c=new Map();for(const t of M.T)for(let i=0;i<t.length;i++){const k=ekey(t[i],t[(i+1)%t.length]);c.set(k,(c.get(k)||0)+1);}for(const v of c.values())if(v!==2)return false;return c.size>0;}
/* planar faces: group by plane, split into edge-connected components, chain boundary edges into loops */
function faces(M){const V=M.V,groups=new Map();
  M.T.forEach((t,i)=>{const n=pnormal(V,t);if(!n)return;const d=n[0]*V[t[0]][0]+n[1]*V[t[0]][1]+n[2]*V[t[0]][2];
    const k=n.map(x=>Math.round(x*500)).join(',')+'|'+Math.round(d*100);let g=groups.get(k);if(!g){g={n,d,tris:[]};groups.set(k,g);}g.tris.push(i);});
  const out=[];
  for(const g of groups.values()){
    // connected components inside the plane (shared edges)
    const byEdge=new Map();g.tris.forEach(i=>{const t=M.T[i];for(let j=0;j<t.length;j++){const k=ekey(t[j],t[(j+1)%t.length]);(byEdge.get(k)||byEdge.set(k,[]).get(k)).push(i);}});
    const seen=new Set();
    for(const s of g.tris){if(seen.has(s))continue;const comp=[];const st=[s];seen.add(s);
      while(st.length){const i=st.pop();comp.push(i);const t=M.T[i];for(let j=0;j<t.length;j++){for(const o of byEdge.get(ekey(t[j],t[(j+1)%t.length]))){if(!seen.has(o)){seen.add(o);st.push(o);}}}}
      const loops=boundary(M,comp);
      if(loops)out.push({n:g.n,loops});else comp.forEach(i=>{out.push({n:g.n,loops:[M.T[i].slice()]});});}}
  return out;}
/* directed boundary edges of a triangle set → loops (outer first, CCW about the normal); null when the chaining is ambiguous */
function boundary(M,comp){const dir=new Map(),cnt=new Map();
  for(const i of comp){const t=M.T[i];for(let j=0;j<t.length;j++){const a=t[j],b=t[(j+1)%t.length];const k=ekey(a,b);cnt.set(k,(cnt.get(k)||0)+1);dir.set(a+'>'+b,[a,b]);}}
  const next=new Map();for(const[k,v]of cnt){if(v!==1)continue;const[a,b]=k.split('-').map(Number);const e=dir.get(a+'>'+b)||dir.get(b+'>'+a);if(!e)return null;if(next.has(e[0]))return null;next.set(e[0],e[1]);}
  if(!next.size)return null;const loops=[];const used=new Set();
  for(const s of next.keys()){if(used.has(s))continue;const L=[];let v=s;while(v!=null&&!used.has(v)){used.add(v);L.push(v);v=next.get(v);}if(v!==s||L.length<3)return null;loops.push(L);}
  if(loops.length>1){const V=M.V,n=comp.length?pnormal(V,M.T[comp[0]]):[0,0,1];
    const area=L=>{let a=[0,0,0];for(let i=0;i<L.length;i++){const p=V[L[i]],q=V[L[(i+1)%L.length]];a[0]+=p[1]*q[2]-p[2]*q[1];a[1]+=p[2]*q[0]-p[0]*q[2];a[2]+=p[0]*q[1]-p[1]*q[0];}return a[0]*n[0]+a[1]*n[1]+a[2]*n[2];};
    loops.sort((a,b)=>area(b)-area(a));if(area(loops[0])<=0)return null;}
  return loops;}

function write(solids,opt){opt=opt||{};const name=esc(opt.name||'housing');const L=[];let id=0;const E=s=>{L.push('#'+(++id)+'='+s+';');return id;};
  const ctxApp=E("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  E("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#"+ctxApp+")");
  const pc=E("PRODUCT_CONTEXT('',#"+ctxApp+",'mechanical')");
  const prod=E("PRODUCT('"+name+"','"+name+"','',(#"+pc+"))");
  const pdf=E("PRODUCT_DEFINITION_FORMATION('','',#"+prod+")");
  const pdc=E("PRODUCT_DEFINITION_CONTEXT('part definition',#"+ctxApp+",'design')");
  const pd=E("PRODUCT_DEFINITION('design','',#"+pdf+",#"+pdc+")");
  const pds=E("PRODUCT_DEFINITION_SHAPE('','',#"+pd+")");
  const uL=E("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))"),uA=E("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))"),uS=E("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const unc=E("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#"+uL+",'distance_accuracy_value','')");
  const gctx=E("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#"+unc+"))GLOBAL_UNIT_ASSIGNED_CONTEXT((#"+uL+",#"+uA+",#"+uS+"))REPRESENTATION_CONTEXT('',''))");
  const o=E("CARTESIAN_POINT('',(0.,0.,0.))"),dz=E("DIRECTION('',(0.,0.,1.))"),dx=E("DIRECTION('',(1.,0.,0.))");const ax0=E("AXIS2_PLACEMENT_3D('',#"+o+",#"+dz+",#"+dx+")");
  const items=[ax0];const stats={solids:0,faces:0,skipped:[]};
  for(const S of solids){const M=weld(S.tris||[]);if(!M.T.length||!closed(M)){stats.skipped.push(S.name||'?');continue;}
    const vp=new Map(),pt=new Map(),ec=new Map();
    const P=i=>{let p=pt.get(i);if(p==null){const v=M.V[i];p=E("CARTESIAN_POINT('',("+f(v[0])+","+f(v[1])+","+f(v[2])+"))");pt.set(i,p);}return p;};
    const VX=i=>{let v=vp.get(i);if(v==null){v=E("VERTEX_POINT('',#"+P(i)+")");vp.set(i,v);}return v;};
    const EC=(a,b)=>{const k=ekey(a,b);let e=ec.get(k);const lo=Math.min(a,b),hi=Math.max(a,b);
      if(e==null){const p=M.V[lo],q=M.V[hi];const d=[q[0]-p[0],q[1]-p[1],q[2]-p[2]];const Ln=Math.hypot(...d)||1;const dir=E("DIRECTION('',("+f(d[0]/Ln)+","+f(d[1]/Ln)+","+f(d[2]/Ln)+"))");const vec=E("VECTOR('',#"+dir+","+f(Ln)+")");
        const ln=E("LINE('',#"+P(lo)+",#"+vec+")");e=E("EDGE_CURVE('',#"+VX(lo)+",#"+VX(hi)+",#"+ln+",.T.)");ec.set(k,e);}
      return E("ORIENTED_EDGE('',*,*,#"+e+","+(a===lo?'.T.':'.F.')+")");};
    const fids=[];
    for(const F of faces(M)){const n=F.n;const ref=Math.abs(n[2])<0.9?[-n[1],n[0],0]:[1,0,0];const rl=Math.hypot(...ref);const r=ref.map(x=>x/rl);
      const p0=M.V[F.loops[0][0]];const org=E("CARTESIAN_POINT('',("+f(p0[0])+","+f(p0[1])+","+f(p0[2])+"))");const nd=E("DIRECTION('',("+f(n[0])+","+f(n[1])+","+f(n[2])+"))"),rd=E("DIRECTION('',("+f(r[0])+","+f(r[1])+","+f(r[2])+"))");
      const ax=E("AXIS2_PLACEMENT_3D('',#"+org+",#"+nd+",#"+rd+")");const pl=E("PLANE('',#"+ax+")");
      const bnds=F.loops.map((Lp,li)=>{const oe=Lp.map((v,i)=>EC(v,Lp[(i+1)%Lp.length]));const lp=E("EDGE_LOOP('',("+oe.map(x=>'#'+x).join(',')+"))");return E((li?"FACE_BOUND":"FACE_OUTER_BOUND")+"('',#"+lp+",.T.)");});
      fids.push(E("ADVANCED_FACE('',("+bnds.map(x=>'#'+x).join(',')+"),#"+pl+",.T.)"));}
    const sh=E("CLOSED_SHELL('',("+fids.map(x=>'#'+x).join(',')+"))");items.push(E("MANIFOLD_SOLID_BREP('"+esc(S.name||name)+"',#"+sh+")"));stats.solids++;stats.faces+=fids.length;}
  const rep=E("ADVANCED_BREP_SHAPE_REPRESENTATION('"+name+"',("+items.map(x=>'#'+x).join(',')+"),#"+gctx+")");
  E("SHAPE_DEFINITION_REPRESENTATION(#"+pds+",#"+rep+")");
  const date=(opt.date||new Date()).toISOString().slice(0,19);
  const head=["ISO-10303-21;","HEADER;","FILE_DESCRIPTION(('"+name+" housing (faceted B-rep from AllinOneDesign)'),'2;1');",
    "FILE_NAME('"+esc(opt.file||name+'.step')+"','"+date+"',('AllinOneDesign'),(''),'AllinOneDesign STEP writer','AllinOneDesign','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));","ENDSEC;","DATA;"];
  return{text:head.concat(L,["ENDSEC;","END-ISO-10303-21;",""]).join("\n"),stats};}
return{write,weld,closed,faces};
})();
if(typeof module!=='undefined')module.exports=STEPW;
