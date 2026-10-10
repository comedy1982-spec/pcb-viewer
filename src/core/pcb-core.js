/* PCB core: parsers + common board model. No DOM access in this block. */
const PCB=(function(){
"use strict";
const D2R=Math.PI/180;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

function newBoard(){return{name:'',source:'',t:1.6,outline:[],layers:{'T.cu':[],'B.cu':[],'T.silk':[],'B.silk':[]},vias:[],drills:[],comps:[],warnings:[],notes:[],copperLayers:2,files:[],hasNets:false};}

/* ---------- geometry helpers ---------- */
function arcPts(cx,cy,r,a0,a1){const da=a1-a0;const n=Math.max(4,Math.min(160,Math.ceil(Math.abs(da)*Math.max(r,0.2)/0.2)));const o=[];for(let i=0;i<=n;i++){const a=a0+da*i/n;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return o;}
function circlePts(cx,cy,r){return arcPts(cx,cy,r,0,Math.PI*2);}
const norm2pi=a=>{a%=2*Math.PI;return a<0?a+2*Math.PI:a;};
function arc3(s,m,e){
  const ax=s[0],ay=s[1],bx=m[0],by=m[1],cx=e[0],cy=e[1];
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
  if(Math.abs(d)<1e-12)return[[ax,ay],[cx,cy]];
  const s2=ax*ax+ay*ay,b2=bx*bx+by*by,c2=cx*cx+cy*cy;
  const ux=(s2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/d,uy=(s2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/d,r=Math.hypot(ax-ux,ay-uy);
  const a0=Math.atan2(ay-uy,ax-ux),am=Math.atan2(by-uy,bx-ux),a1=Math.atan2(cy-uy,cx-ux);
  const ccw=norm2pi(am-a0)<norm2pi(a1-a0);
  let da=ccw?norm2pi(a1-a0):-norm2pi(a0-a1);
  if(Math.abs(da)<1e-9)da=ccw?2*Math.PI:-2*Math.PI;
  const p=arcPts(ux,uy,r,a0,a0+da);p[0]=[ax,ay];p[p.length-1]=[cx,cy];return p;
}
function bezier(p0,p1,p2,p3){const o=[];for(let i=0;i<=24;i++){const t=i/24,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
function area(r){let a=0;for(let i=0,n=r.length;i<n;i++){const p=r[i],q=r[(i+1)%n];a+=p[0]*q[1]-q[0]*p[1];}return a/2;}
function inRing(x,y,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;}
function segDist(px,py,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((px-a[0])*dx+(py-a[1])*dy)/l:0;t=t<0?0:t>1?1:t;return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy);}
function rotPt(x,y,deg){const r=deg*D2R,c=Math.cos(r),s=Math.sin(r);return[x*c-y*s,x*s+y*c];}

function chainLoops(polys,tol){
  const loops=[],open=[];const seenSeg=new Set();
  polys.forEach(p=>{if(!p||p.length<2)return;
    if(p.length===2){const r=q=>Math.round(q[0]*1000)+':'+Math.round(q[1]*1000);const k1=r(p[0]),k2=r(p[1]);if(k1===k2)return;const k=k1<k2?k1+'|'+k2:k2+'|'+k1;if(seenSeg.has(k))return;seenSeg.add(k);}if(p.length>2&&dist(p[0],p[p.length-1])<tol)loops.push(p.slice());else open.push(p.slice());});
  // endpoint index for speed
  const key=pt=>Math.round(pt[0]/tol)+','+Math.round(pt[1]/tol);
  const used=new Array(open.length).fill(false);const idx=new Map();
  const addIdx=(pt,i)=>{const k=key(pt);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){}let a=idx.get(k);if(!a)idx.set(k,a=[]);a.push(i);};
  open.forEach((p,i)=>{addIdx(p[0],i);addIdx(p[p.length-1],i);});
  const near=pt=>{const out=[];const kx=Math.round(pt[0]/tol),ky=Math.round(pt[1]/tol);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=idx.get((kx+dx)+','+(ky+dy));if(a)a.forEach(i=>{if(!used[i])out.push(i);});}return out;};
  for(let s=0;s<open.length;s++){
    if(used[s])continue;used[s]=true;let cur=open[s].slice();
    for(let guard=0;guard<100000;guard++){
      const end=cur[cur.length-1];if(cur.length>2&&dist(end,cur[0])<tol)break;
      let found=false;
      for(const i of near(end)){const q=open[i];
        if(dist(q[0],end)<tol){cur=cur.concat(q.slice(1));used[i]=true;found=true;break;}
        if(dist(q[q.length-1],end)<tol){cur=cur.concat(q.slice(0,-1).reverse());used[i]=true;found=true;break;}}
      if(found)continue;
      for(const i of near(cur[0])){const q=open[i];
        if(dist(q[q.length-1],cur[0])<tol){cur=q.slice(0,-1).concat(cur);used[i]=true;found=true;break;}
        if(dist(q[0],cur[0])<tol){cur=q.slice(1).reverse().concat(cur);used[i]=true;found=true;break;}}
      if(!found)break;
    }
    if(cur.length>2&&dist(cur[0],cur[cur.length-1])<tol*4)loops.push(cur);
  }
  return loops;
}
function cleanRing(r){const o=[];r.forEach(p=>{if(!o.length||dist(o[o.length-1],p)>1e-6)o.push([p[0],p[1]]);});if(o.length>1&&dist(o[0],o[o.length-1])<1e-6)o.pop();return o;}
function outlineFrom(polys,warn){
  const all=[];polys.forEach(p=>p&&p.forEach(q=>all.push(q)));const bb=bboxOf(all);if(!bb)return[];
  const full=(bb[2]-bb[0])*(bb[3]-bb[1]);
  for(const tol of[0.05,0.3]){const r=outlineTry(polys,tol);if(r.length){const ob=bboxOf(r[0]);if((ob[2]-ob[0])*(ob[3]-ob[1])>=full*0.5)return r;}}
  if(warn)warn('외곽선이 완전히 닫혀 있지 않아 외곽선 범위의 사각형으로 표시합니다.');
  return[[[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]]];
}
function outlineTry(polys,tol){
  const loops=chainLoops(polys,tol).map(cleanRing).filter(l=>l.length>=3&&Math.abs(area(l))>0.01);
  if(!loops.length)return[];
  loops.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
  const outer=loops[0],rings=[outer];
  for(let i=1;i<loops.length;i++){const L=loops[i];const c=L.reduce((a,p)=>[a[0]+p[0]/L.length,a[1]+p[1]/L.length],[0,0]);if(inRing(c[0],c[1],outer)||inRing(L[0][0],L[0][1],outer))rings.push(L);}
  return rings;
}

/* ---------- S-expression ---------- */
function sexp(text){
  let i=0;const n=text.length;
  function list(){const out=[];i++;
    while(i<n){const c=text.charCodeAt(i);
      if(c===41){i++;return out;}
      if(c===40){out.push(list());continue;}
      if(c<=32){i++;continue;}
      if(c===34){let j=i+1,s='',st=j;while(j<n&&text.charCodeAt(j)!==34){if(text.charCodeAt(j)===92){s+=text.slice(st,j)+text[j+1];j+=2;st=j;}else j++;}s+=text.slice(st,j);out.push(s);i=j+1;continue;}
      let j=i;while(j<n){const d=text.charCodeAt(j);if(d<=32||d===40||d===41)break;j++;}out.push(text.slice(i,j));i=j;}
    return out;}
  while(i<n&&text[i]!=='(')i++;
  return i<n?list():null;
}
const ch=(l,k)=>{for(let i=1;i<l.length;i++){const c=l[i];if(Array.isArray(c)&&c[0]===k)return c;}return null;};
const all=(l,k)=>{const o=[];for(let i=1;i<l.length;i++){const c=l[i];if(Array.isArray(c)&&c[0]===k)o.push(c);}return o;};
const F=v=>parseFloat(v);

/* ---------- KiCad ---------- */
function parseKicad(text){
  const root=sexp(text);
  if(!root||root[0]!=='kicad_pcb')throw new Error('KiCad PCB 파일 형식이 아닙니다.');
  const B=newBoard();B.source='KiCad';
  const xy=(l,k)=>{const c=ch(l,k);return c?[F(c[1]),F(c[2])]:null;};
  const width=l=>{const s=ch(l,'stroke');const w=s?ch(s,'width'):ch(l,'width');return w?F(w[1]):0.12;};
  const layerOf=l=>{const c=ch(l,'layer');return c?c[1]:null;};
  const sideOf=n=>n&&n[0]==='B'?'B':'T';
  const isSilk=n=>/^[FB]\.(SilkS|Silkscreen)$/.test(n||'');
  const isCu=n=>n==='F.Cu'||n==='B.Cu';
  const K=(x,y)=>[x,-y];
  const g=ch(root,'general');if(g){const t=ch(g,'thickness');if(t)B.t=F(t[1]);}
  const tb=ch(root,'title_block');if(tb){const t=ch(tb,'title');if(t&&t[1])B.name=t[1];}
  const ly=ch(root,'layers');if(ly){B.copperLayers=ly.slice(1).filter(l=>Array.isArray(l)&&/\.Cu$/.test(l[1])).length||2;}
  const netMap={};all(root,'net').forEach(n=>{netMap[n[1]]=n[2];});
  const netOf=l=>{const c=ch(l,'net');let v=null;if(c){if(c.length>=3)v=c[2];else v=(c[1] in netMap)?netMap[c[1]]:c[1];}if(!v){const nn=ch(l,'net_name');if(nn)v=nn[1];}return v||null;};
  const ptsOf=pl=>{const o=[];if(!pl)return o;for(let i=1;i<pl.length;i++){const c=pl[i];if(!Array.isArray(c))continue;if(c[0]==='xy')o.push([F(c[1]),F(c[2])]);else if(c[0]==='arc'){const a=arc3(xy(c,'start'),xy(c,'mid'),xy(c,'end'));(o.length?a.slice(1):a).forEach(p=>o.push(p));}}return o;};
  function gfx(it){
    const k=it[0].replace(/^(gr_|fp_)/,'');const w=width(it),layer=layerOf(it);
    const fc=ch(it,'fill');const fill=!!fc&&(fc[1]==='yes'||fc[1]==='solid'||fc[1]==='true');
    if(k==='line'){const s=xy(it,'start'),e=xy(it,'end');return s&&e?{polys:[[s,e]],w,layer}:null;}
    if(k==='rect'){const s=xy(it,'start'),e=xy(it,'end');return{polys:[[s,[e[0],s[1]],e,[s[0],e[1]],[s[0],s[1]]]],closed:true,fill,w,layer};}
    if(k==='circle'){const c=xy(it,'center'),e=xy(it,'end');return{polys:[circlePts(c[0],c[1],dist(c,e))],closed:true,fill,w,layer};}
    if(k==='arc'){const s=xy(it,'start'),m=xy(it,'mid'),e=xy(it,'end');if(m)return{polys:[arc3(s,m,e)],w,layer};
      const an=ch(it,'angle');if(an&&s&&e){const r=dist(s,e),a0=Math.atan2(e[1]-s[1],e[0]-s[0]);return{polys:[arcPts(s[0],s[1],r,a0,a0+F(an[1])*D2R)],w,layer};}return null;}
    if(k==='poly'){const p=ptsOf(ch(it,'pts'));if(p.length<2)return null;return{polys:[p.concat([p[0]])],closed:true,fill,w,layer};}
    if(k==='curve'){const p=ptsOf(ch(it,'pts'));return p.length===4?{polys:[bezier(p[0],p[1],p[2],p[3])],w,layer}:null;}
    return null;
  }
  function hidden(l){if(l.indexOf('hide')>0)return true;const h=ch(l,'hide');if(h&&h[1]!=='no')return true;const e=ch(l,'effects');if(e){if(e.indexOf('hide')>0)return true;const h2=ch(e,'hide');if(h2&&h2[1]!=='no')return true;}return false;}
  function textPrim(l,str,tf,abs){
    const at=ch(l,'at');if(!at)return null;const layer=layerOf(l);
    const e=ch(l,'effects'),f=e&&ch(e,'font'),sz=f&&ch(f,'size'),j=e&&ch(e,'justify');
    const size=sz?F(sz[1]):1;const [x,y]=tf(F(at[1]),F(at[2]));
    let align='center';if(j){if(j.indexOf('left')>0)align='left';else if(j.indexOf('right')>0)align='right';}
    const bold=!!(f&&(f.indexOf('bold')>0||(ch(f,'bold')&&ch(f,'bold')[1]==='yes')));
    return{t:'text',s:str,x,y,size,ang:at[3]?F(at[3]):0,mir:sideOf(layer)==='B',align,bold,layer};
  }
  const edges=[],zonesBy={T:[],B:[]};let unfilled=0,innerItems=0;
  const pushGfx=(r,tf,owner)=>{
    if(!r)return;const L=r.layer;if(!L)return;
    const polys=r.polys.map(p=>p.map(q=>tf(q[0],q[1])));
    if(L==='Edge.Cuts'){polys.forEach(p=>edges.push(p));return;}
    let tgt=null;if(isSilk(L))tgt=B.layers[sideOf(L)+'.silk'];else if(isCu(L))tgt=B.layers[sideOf(L)+'.cu'];
    if(!tgt)return;
    if(r.fill&&r.closed)tgt.push({t:'poly',rings:polys});
    if(!r.fill||r.w>0)polys.forEach(p=>tgt.push({t:'path',pts:p,w:Math.max(r.w,0.05)}));
  };
  // footprints
  all(root,'footprint').concat(all(root,'module')).forEach(fp=>{
    const at=ch(fp,'at');if(!at)return;
    const fx=F(at[1]),fy=F(at[2]),fr=at[3]?F(at[3]):0,lay=layerOf(fp),side=sideOf(lay);
    const ca=Math.cos(fr*D2R),sa=Math.sin(fr*D2R);
    const tf=(lx,ly)=>{const ux=lx,uy=-ly;return[fx+ux*ca-uy*sa,-fy+ux*sa+uy*ca];};
    const libname=typeof fp[1]==='string'?fp[1]:'';
    const c={ref:'',val:'',fp:libname.split(':').pop(),lib:libname,side,x:fx,y:-fy,rot:fr,pads:[],mpn:'',desc:''};
    const props={};
    all(fp,'property').forEach(p=>{props[p[1]]=p[2];});
    all(fp,'fp_text').forEach(p=>{if(p[1]==='reference')props.Reference=p[2];if(p[1]==='value')props.Value=p[2];});
    c.ref=props.Reference||'';c.val=props.Value||'';
    const dsc=ch(fp,'descr');c.desc=props.Description||'';c.fpDesc=dsc?dsc[1]:'';
    for(const k in props){if(/^(mpn|mfr.?part|manufacturer.?part|part.?number|mfr.?pn|lcsc)/i.test(k)&&props[k]){c.mpn=props[k];break;}}
    const fab=[],crt=[];
    for(let i=1;i<fp.length;i++){const it=fp[i];if(!Array.isArray(it))continue;const h=it[0];
      if(/^fp_(line|rect|circle|arc|poly|curve)$/.test(h)){
        const r=gfx(it);if(!r)continue;
        if(/\.Fab$/.test(r.layer))r.polys.forEach(p=>p.forEach(q=>fab.push(q)));
        else if(/\.(CrtYd|Courtyard)$/.test(r.layer))r.polys.forEach(p=>p.forEach(q=>crt.push(q)));
        else pushGfx(r,tf);
      }
    }
    const txt=(l,str)=>{const L=layerOf(l);if(!isSilk(L)||hidden(l)||!str)return;str=str.replace(/\$\{REFERENCE\}/g,c.ref).replace(/\$\{VALUE\}/g,c.val);const t=textPrim(l,str,tf);if(t)B.layers[sideOf(L)+'.silk'].push(t);};
    all(fp,'property').forEach(p=>txt(p,p[2]));
    all(fp,'fp_text').forEach(p=>txt(p,p[2]));
    const padLocal=[];
    all(fp,'pad').forEach(p=>{
      const num=p[1],type=p[2],shp=p[3];const pa=ch(p,'at');if(!pa)return;
      const px=F(pa[1]),py=F(pa[2]),ang=pa[3]?F(pa[3]):0;
      const sz=ch(p,'size');const w=sz?F(sz[1]):0,hh=sz?F(sz[2]):0;
      const lays=(ch(p,'layers')||[]).slice(1);
      const top=lays.some(l=>l==='F.Cu'||l==='*.Cu'||l==='F&B.Cu'),bot=lays.some(l=>l==='B.Cu'||l==='*.Cu'||l==='F&B.Cu');
      const [x,y]=tf(px,py);
      const dr=ch(p,'drill');let drill=null;
      if(dr){if(dr[1]==='oval')drill={w:F(dr[2]),h:F(dr[3]||dr[2])};else if(dr[1]!==undefined&&!isNaN(F(dr[1])))drill={w:F(dr[1]),h:F(dr[1])};}
      if(drill&&drill.w>0)B.drills.push({x,y,d:Math.min(drill.w,drill.h),w:drill.w,h:drill.h,ang,plated:type==='thru_hole'});
      padLocal.push([px-w/2,py-hh/2],[px+w/2,py+hh/2]);
      if(!top&&!bot)return;
      let shape=shp;if(shp==='trapezoid'||shp==='chamfered')shape='rect';
      const pad={t:'pad',x,y,w,h:hh,ang,shape,net:netOf(p),ref:null,n:num,drill:drill?drill.w:null,side:top&&bot?'both':top?'T':'B'};
      const rr=ch(p,'roundrect_rratio');if(shape==='roundrect')pad.rr=(rr?F(rr[1]):0.25)*Math.min(w,hh);
      const pf=ch(p,'pinfunction');if(pf&&pf[1])pad.fn=pf[1];
      if(shp==='custom'){
        const parts=[];const opt=ch(p,'options'),anc=opt&&ch(opt,'anchor');
        if(anc&&anc[1]==='circle')parts.push({c:[0,0,w/2]});else parts.push({p:[[-w/2,-hh/2],[w/2,-hh/2],[w/2,hh/2],[-w/2,hh/2]]});
        const pr=ch(p,'primitives');if(pr)for(let i=1;i<pr.length;i++){const it=pr[i];if(!Array.isArray(it))continue;const r=gfx(it.concat([['layer','X']]));
          if(!r)continue;r.polys.forEach(poly=>{const q=poly.map(v=>[v[0],-v[1]]);if(r.closed)parts.push({p:q});else for(let k=1;k<q.length;k++){const a=q[k-1],b=q[k],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1,nx=-dy/L*r.w/2,ny=dx/L*r.w/2;parts.push({p:[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]});parts.push({c:[a[0],a[1],r.w/2]},{c:[b[0],b[1],r.w/2]});}});}
        pad.shape='parts';pad.parts=parts;setPartsBox(pad);
      }
      c.pads.push(pad);
    });
    let bb=bboxOf(fab);let fromFab=!!bb;
    if(!bb){bb=bboxOf(crt);if(bb){bb=[bb[0]+0.25,bb[1]+0.25,bb[2]-0.25,bb[3]-0.25];}}
    if(!bb)bb=bboxOf(padLocal);
    if(bb&&bb[2]>bb[0]&&bb[3]>bb[1]){const[cx,cy]=tf((bb[0]+bb[2])/2,(bb[1]+bb[3])/2);c.body={cx,cy,w:bb[2]-bb[0],h:bb[3]-bb[1],ang:fr,fromFab};}
    else c.body={cx:c.x,cy:c.y,w:0,h:0,ang:fr};
    if(c.pads.length){
      c.pads.forEach(p=>{p.ref=c.ref;const s=p.side;if(s==='T'||s==='both')B.layers['T.cu'].push(p);if(s==='B'||s==='both')B.layers['B.cu'].push(p);});
      if(c.ref&&!/^REF\*\*$/.test(c.ref))B.comps.push(c);
    }
  });
  // board-level items
  for(let i=1;i<root.length;i++){
    const it=root[i];if(!Array.isArray(it))continue;const h=it[0];
    if(h==='segment'){const L=layerOf(it);if(!isCu(L)){if(/In\d+\.Cu/.test(L||''))innerItems++;continue;}
      const s=xy(it,'start'),e=xy(it,'end');B.layers[sideOf(L)+'.cu'].push({t:'seg',a:K(s[0],s[1]),b:K(e[0],e[1]),w:width(it),net:netOf(it)});}
    else if(h==='arc'&&ch(it,'mid')&&ch(it,'net')!==null&&!ch(it,'stroke')){const L=layerOf(it);if(!isCu(L)){innerItems++;continue;}
      const p=arc3(xy(it,'start'),xy(it,'mid'),xy(it,'end')).map(q=>K(q[0],q[1]));B.layers[sideOf(L)+'.cu'].push({t:'path',pts:p,w:width(it),net:netOf(it)});}
    else if(h==='via'){const a=ch(it,'at'),sz=ch(it,'size'),dr=ch(it,'drill');B.vias.push({x:F(a[1]),y:-F(a[2]),d:sz?F(sz[1]):0.6,drill:dr?F(dr[1]):0.3,net:netOf(it)});}
    else if(h==='zone'){const net=netOf(it);const fps=all(it,'filled_polygon');
      if(!fps.length&&net)unfilled++;
      fps.forEach(fpg=>{const L=layerOf(fpg);if(!isCu(L))return;const r=ptsOf(ch(fpg,'pts')).map(q=>K(q[0],q[1]));if(r.length>2)zonesBy[sideOf(L)].push({t:'poly',rings:[r],net,zone:true});});}
    else if(/^gr_(line|rect|circle|arc|poly|curve)$/.test(h)){pushGfx(gfx(it),K);}
    else if(h==='gr_text'){const L=layerOf(it);if(isSilk(L)&&!hidden(it)){const t=textPrim(it,it[1],K);if(t)B.layers[sideOf(L)+'.silk'].push(t);}}
  }
  ['T','B'].forEach(s=>{B.layers[s+'.cu']=zonesBy[s].concat(B.layers[s+'.cu']);});
  B.outline=outlineFrom(edges,m=>B.warnings.push(m));
  if(B.copperLayers>2)B.notes.push(`내층 ${B.copperLayers-2}개는 표시하지 않고 상단·하단 동박만 보여줍니다.`);
  if(unfilled)B.warnings.push(`채워지지 않은 동박 존 ${unfilled}개가 있습니다. KiCad에서 존을 채운(B 키) 뒤 저장하면 표시됩니다.`);
  B.hasNets=true;
  return B;
}
function bboxOf(pts){if(!pts.length)return null;let a=1e18,b=1e18,c=-1e18,d=-1e18;pts.forEach(p=>{if(p[0]<a)a=p[0];if(p[1]<b)b=p[1];if(p[0]>c)c=p[0];if(p[1]>d)d=p[1];});return[a,b,c,d];}
function setPartsBox(pad){const pts=[];pad.parts.forEach(q=>{if(q.c){pts.push([q.c[0]-q.c[2],q.c[1]-q.c[2]],[q.c[0]+q.c[2],q.c[1]+q.c[2]]);}else q.p.forEach(v=>pts.push(v));});const bb=bboxOf(pts)||[0,0,0,0];pad.lbb=bb;pad.w=bb[2]-bb[0];pad.h=bb[3]-bb[1];}

/* ---------- Gerber RS-274X ---------- */
function parseGerber(text){
  const out={prims:[],ff:null,x2:false};
  let fmt={li:2,ld:4,trail:false},fmtY=null,unit=1,unitSet=false;
  const aps={},macros={};let ap=null,x=0,y=0,interp=1,mq=true,region=false,contour=null,contours=[],clear=false,lastD=null;
  const attr={N:null,C:null,P:null};let taFn=null;
  const normNet=s=>{s=(s||'').split(',')[0];if(!s||s==='N/C')return null;return s;};
  function coord(s,isY){if(s==null)return null;if(s.indexOf('.')>=0)return parseFloat(s)*unit;let neg=false;if(s[0]==='-'||s[0]==='+'){neg=s[0]==='-';s=s.slice(1);}
    const f=(isY&&fmtY)||fmt;if(f.trail){while(s.length<f.li+f.ld)s+='0';}const v=parseInt(s,10)/Math.pow(10,f.ld);return(neg?-v:v)*unit;}
  function evalMacro(name,params,u){
    const body=macros[name];if(!body)return null;const vars={};params.forEach((v,i)=>{vars[i+1]=v;});
    const ev=s=>{s=s.replace(/\$(\d+)/g,(_,k)=>'('+(vars[k]||0)+')').replace(/[xX]/g,'*');if(!/^[-+*/().\d\seE]*$/.test(s))return 0;try{return Function('return ('+s+')')();}catch(e){return 0;}};
    const parts=[];const rot=(pts,deg)=>deg?pts.map(p=>rotPt(p[0],p[1],deg)):pts;
    body.forEach(line=>{
      if(/^0(\s|$)/.test(line))return;
      const m=line.match(/^\$(\d+)\s*=\s*(.+)$/);if(m){vars[m[1]]=ev(m[2]);return;}
      const a=line.split(',').map(s=>s.trim());const code=parseInt(a[0],10);const v=a.slice(1).map(ev);
      if(code===1){let cx=v[2]*u,cy=v[3]*u;if(v[4])[cx,cy]=rotPt(cx,cy,v[4]);parts.push({e:v[0],c:[cx,cy,v[1]*u/2]});}
      else if(code===20||code===2){const w=v[1]*u,sx=v[2]*u,sy=v[3]*u,ex=v[4]*u,ey=v[5]*u,dx=ex-sx,dy=ey-sy,l=Math.hypot(dx,dy)||1,nx=-dy/l*w/2,ny=dx/l*w/2;parts.push({e:v[0],p:rot([[sx+nx,sy+ny],[ex+nx,ey+ny],[ex-nx,ey-ny],[sx-nx,sy-ny]],v[6])});}
      else if(code===21){const w=v[1]*u,h=v[2]*u,cx=v[3]*u,cy=v[4]*u;parts.push({e:v[0],p:rot([[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]],v[5])});}
      else if(code===22){const w=v[1]*u,h=v[2]*u,x0=v[3]*u,y0=v[4]*u;parts.push({e:v[0],p:rot([[x0,y0],[x0+w,y0],[x0+w,y0+h],[x0,y0+h]],v[5])});}
      else if(code===4){const n=v[1]|0;const pts=[];for(let i=0;i<=n;i++)pts.push([v[2+i*2]*u,v[3+i*2]*u]);parts.push({e:v[0],p:rot(pts,v[2+(n+1)*2])});}
      else if(code===5){const n=v[1]|0,cx=v[2]*u,cy=v[3]*u,r=v[4]*u/2;const pts=[];for(let i=0;i<n;i++){const an=2*Math.PI*i/n;pts.push([cx+r*Math.cos(an),cy+r*Math.sin(an)]);}parts.push({e:v[0],p:rot(pts,v[5])});}
      else if(code===7){parts.push({e:1,c:[v[0]*u,v[1]*u,v[2]*u/2]});}
      else if(code===6){parts.push({e:1,c:[v[0]*u,v[1]*u,v[2]*u/2]});}
    });
    return parts.filter(q=>q.e!==0);
  }
  function apParts(a){if(!a.parts)a.parts=evalMacro(a.type,a.params,a.unit)||[];return a.parts;}
  function apWidth(a){const P=a.params,u=a.unit;if(a.type==='C'||a.type==='P')return P[0]*u;if(a.type==='R'||a.type==='O')return Math.min(P[0],P[1])*u;const pp=apParts(a);const t={parts:pp};setPartsBox(t);return Math.min(t.w,t.h)||0.1;}
  function arcFrom(sx,sy,ex,ey,I,J,cw){
    let cx=sx+I,cy=sy+J;
    if(!mq){let best=1e18;[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,b])=>{const tx=sx+a*Math.abs(I),ty=sy+b*Math.abs(J);const d=Math.abs(Math.hypot(sx-tx,sy-ty)-Math.hypot(ex-tx,ey-ty));
      let a0=Math.atan2(sy-ty,sx-tx),a1=Math.atan2(ey-ty,ex-tx);let da=cw?norm2pi(a0-a1):norm2pi(a1-a0);if(da>Math.PI/2+1e-3)return;if(d<best){best=d;cx=tx;cy=ty;}});}
    const r=Math.hypot(sx-cx,sy-cy);let a0=Math.atan2(sy-cy,sx-cx),a1=Math.atan2(ey-cy,ex-cx);
    let da=cw?-norm2pi(a0-a1):norm2pi(a1-a0);if(Math.abs(da)<1e-9&&mq)da=cw?-2*Math.PI:2*Math.PI;
    const p=arcPts(cx,cy,r,a0,a0+da);p[0]=[sx,sy];p[p.length-1]=[ex,ey];return p;
  }
  function flushRegion(){if(contour&&contour.length>2)contours.push(contour);if(contours.length)out.prims.push({t:'poly',rings:contours,net:attr.N,clear});contours=[];contour=null;}
  function flash(nx,ny){
    if(!ap)return;const P=ap.params,u=ap.unit,t=ap.type;
    const pad={t:'pad',x:nx,y:ny,ang:0,net:attr.N,clear};
    if(attr.P){pad.ref=attr.P.ref;pad.n=attr.P.pin;if(attr.P.fn&&attr.P.fn!=='~')pad.fn=attr.P.fn;}else if(attr.C)pad.ref=attr.C;
    if(t==='C'){pad.shape='circle';pad.w=pad.h=P[0]*u;}
    else if(t==='R'){pad.shape='rect';pad.w=P[0]*u;pad.h=(P[1]||P[0])*u;}
    else if(t==='O'){pad.shape='oval';pad.w=P[0]*u;pad.h=(P[1]||P[0])*u;}
    else if(t==='P'){const r=P[0]*u/2,n=P[1]|0,ro=(P[2]||0)*D2R,pts=[];for(let i=0;i<n;i++){const a=ro+2*Math.PI*i/n;pts.push([r*Math.cos(a),r*Math.sin(a)]);}pad.shape='parts';pad.parts=[{p:pts}];setPartsBox(pad);}
    else{const pp=apParts(ap);if(!pp.length)return;pad.shape='parts';pad.parts=pp;setPartsBox(pad);}
    if(ap.fn&&/ViaPad/i.test(ap.fn))pad.via=true;
    out.prims.push(pad);
  }
  function ext(blk){
    if(blk.startsWith('AM')){const parts=blk.split('*');macros[parts[0].slice(2).trim()]=parts.slice(1).map(s=>s.replace(/\s+/g,'')).filter(s=>s);return;}
    blk.split('*').forEach(c=>{c=c.trim();if(!c)return;
      if(c.startsWith('FS')){const m=c.match(/FS([LTD]?)([AI]?)(?:N\d)?(?:G\d)?X(\d)(\d)Y(\d)(\d)/);if(m){fmt={li:+m[3],ld:+m[4],trail:m[1]==='T'};fmtY={li:+m[5],ld:+m[6],trail:m[1]==='T'};}}
      else if(c.startsWith('MO')){unit=c.indexOf('IN')>=0?25.4:1;unitSet=true;}
      else if(c.startsWith('AD')){const m=c.match(/^ADD(\d+)([^,]+)(?:,(.*))?$/);if(m){aps[+m[1]]={type:m[2].trim(),params:m[3]?m[3].split(/[xX]/).map(parseFloat):[],unit,fn:taFn};}}
      else if(c.startsWith('LP'))clear=c[2]==='C';
      else if(c.startsWith('TF.FileFunction')){out.ff=c.slice(16);out.x2=true;}
      else if(c.startsWith('TA.AperFunction')){taFn=c.split(',')[1]||null;out.x2=true;}
      else if(c.startsWith('TO.N')){attr.N=normNet(c.slice(5));out.x2=true;out.nets=true;}
      else if(c.startsWith('TO.C,'))attr.C=c.split(',')[1]||null;
      else if(c.startsWith('TO.P,')){const a=c.split(',');attr.P={ref:a[1],pin:a[2],fn:a[3]||null};}
      else if(c.startsWith('TD')){const k=c.slice(2);if(!k){attr.N=attr.C=attr.P=null;taFn=null;}else if(k==='.N')attr.N=null;else if(k==='.C')attr.C=null;else if(k==='.P')attr.P=null;else if(k==='.AperFunction')taFn=null;}
    });
  }
  function word(w){
    if(!w)return;if(/^G0*4(?!\d)/.test(w))return;
    let rest=w,m;
    while((m=rest.match(/^G0*(\d+)/))){const gc=+m[1];rest=rest.slice(m[0].length);
      if(gc===1)interp=1;else if(gc===2)interp=2;else if(gc===3)interp=3;
      else if(gc===36){region=true;contours=[];contour=null;}else if(gc===37){flushRegion();region=false;}
      else if(gc===74)mq=false;else if(gc===75)mq=true;else if(gc===70&&!unitSet)unit=25.4;else if(gc===71&&!unitSet)unit=1;}
    if(/^M0*[02]/.test(rest))return;
    const cx=rest.match(/X([+-]?[\d.]+)/),cy=rest.match(/Y([+-]?[\d.]+)/),ci=rest.match(/I([+-]?[\d.]+)/),cj=rest.match(/J([+-]?[\d.]+)/),cd=rest.match(/D0*(\d+)/);
    let d=cd?+cd[1]:null;
    if(d!==null&&d>=10){ap=aps[d]||null;return;}
    if(d===null){if(cx||cy)d=lastD||1;else return;}
    lastD=d;
    const nx=cx?coord(cx[1]):x,ny=cy?coord(cy[1],true):y,I=ci?coord(ci[1]):0,J=cj?coord(cj[1],true):0;
    if(d===1){
      const pts=interp===1?[[x,y],[nx,ny]]:arcFrom(x,y,nx,ny,I,J,interp===2);
      if(region){if(!contour)contour=[[x,y]];for(let i=1;i<pts.length;i++)contour.push(pts[i]);}
      else if(ap){const wd=apWidth(ap);if(pts.length===2)out.prims.push({t:'seg',a:pts[0],b:pts[1],w:wd,net:attr.N,clear});else out.prims.push({t:'path',pts,w:wd,net:attr.N,clear});}
    }else if(d===2){if(region){if(contour&&contour.length>2)contours.push(contour);contour=[[nx,ny]];}}
    else if(d===3){flash(nx,ny);}
    x=nx;y=ny;
  }
  let i=0;const n=text.length;
  while(i<n){const c=text[i];
    if(c==='%'){const j=text.indexOf('%',i+1);if(j<0)break;ext(text.slice(i+1,j).replace(/[\r\n]/g,''));i=j+1;}
    else if(c<=' '){i++;}
    else{const j=text.indexOf('*',i);if(j<0)break;word(text.slice(i,j).replace(/\s+/g,''));i=j+1;}}
  return out;
}

/* ---------- Excellon ---------- */
function parseExcellon(text,name){
  const lines=text.replace(/\r/g,'').split('\n');
  let unit=25.4,zeros='TZ',fmt={i:2,d:4},explicitFmt=false,header=false,tool=null,x=0,y=0,plated=!/npth|non.?plated/i.test(name||''),route=false,plunge=false;
  const tools={},holes=[];
  const num=s=>{if(s.indexOf('.')>=0)return parseFloat(s)*unit;let neg=false;if(s[0]==='-'||s[0]==='+'){neg=s[0]==='-';s=s.slice(1);}let v;
    if(zeros==='LZ'){while(s.length<fmt.i+fmt.d)s+='0';v=parseInt(s,10)/Math.pow(10,fmt.d);}else v=parseInt(s,10)/Math.pow(10,fmt.d);return(neg?-v:v)*unit;};
  const unitLine=(l,u)=>{unit=u;if(!explicitFmt)fmt=u===1?{i:3,d:3}:{i:2,d:4};if(/TZ/.test(l))zeros='TZ';else if(/LZ/.test(l))zeros='LZ';const m=l.match(/(0+)\.(0+)/);if(m){fmt={i:m[1].length,d:m[2].length};explicitFmt=true;}};
  for(const raw of lines){const l=raw.trim();if(!l)continue;
    if(l[0]===';'){if(/TYPE=NON_PLATED/i.test(l))plated=false;else if(/TYPE=PLATED/i.test(l))plated=true;const m=l.match(/FORMAT=\{-?(\d+):-?(\d+)/);if(m){fmt={i:+m[1],d:+m[2]};explicitFmt=true;}continue;}
    if(l==='M48'){header=true;continue;}
    if(/^(METRIC|M71)/.test(l)){unitLine(l,1);continue;}
    if(/^(INCH|M72)/.test(l)){unitLine(l,25.4);continue;}
    if(l==='%'||l==='M95'){header=false;continue;}
    let m=l.match(/^T0*(\d+)(?:[FSBHZ][\d.+-]+)*C([\d.]+)/);if(m){tools[+m[1]]=parseFloat(m[2])*unit;if(!header)tool=+m[1];continue;}
    m=l.match(/^T0*(\d+)\s*$/);if(m){tool=+m[1];continue;}
    if(/^M30/.test(l))break;
    if(/^M15/.test(l)){plunge=true;continue;}if(/^M1[67]/.test(l)){plunge=false;continue;}
    if(/^G0?5/.test(l))route=false;
    const g85=l.match(/^X([+-]?[\d.]+)?Y([+-]?[\d.]+)?G85X([+-]?[\d.]+)?Y([+-]?[\d.]+)?/);
    if(g85){const x1=g85[1]?num(g85[1]):x,y1=g85[2]?num(g85[2]):y,x2=g85[3]?num(g85[3]):x1,y2=g85[4]?num(g85[4]):y1;if(tools[tool])holes.push({x:x1,y:y1,x2,y2,d:tools[tool],plated});x=x2;y=y2;continue;}
    const cx=l.match(/X([+-]?[\d.]+)/),cy=l.match(/Y([+-]?[\d.]+)/);
    if(cx||cy){const nx=cx?num(cx[1]):x,ny=cy?num(cy[1]):y;
      if(/^G0?0/.test(l)){route=true;}
      else if(/^G0?[123]/.test(l)){if(plunge&&tools[tool])holes.push({x,y,x2:nx,y2:ny,d:tools[tool],plated});}
      else if(!route&&tool!=null&&tools[tool])holes.push({x:nx,y:ny,d:tools[tool],plated});
      x=nx;y=ny;}
  }
  return holes;
}

/* ---------- CSV / tables ---------- */
const key=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function splitCSV(line,d){if(d===' ')return line.trim().split(/\s+/);const o=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else if(c==='"')q=true;else if(c===d){o.push(cur);cur='';}else cur+=c;}o.push(cur);return o.map(s=>s.trim());}
const REFK=['designator','ref','refdes','reference','references','designators','refdesignator','partref','componentref','component','part','parts','name'];
function parseTable(text){
  const lines=text.replace(/^﻿/,'').replace(/\r/g,'').split('\n');
  // KiCad .pos
  const hashHead=lines.filter(l=>/^#\s*Ref\s/i.test(l)).pop();
  if(hashHead){const header=hashHead.replace(/^#/,'').trim().split(/\s+/);const rows=lines.filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.trim().split(/\s+/));return{header,rows,unitHint:/unit\s*=\s*in/i.test(text)?'in':''};}
  for(let i=0;i<Math.min(lines.length,40);i++){
    const l=lines[i];if(!l.trim())continue;
    const cnt=d=>splitCSV(l,d).length;const ds=[',',';','\t'];let d=ds.reduce((a,b)=>cnt(b)>cnt(a)?b:a);if(cnt(d)<2)d=' ';
    const header=splitCSV(l,d);const ks=header.map(key);
    if(ks.some(k=>REFK.indexOf(k)>=0)){const rows=[];for(let j=i+1;j<lines.length;j++){if(!lines[j].trim())continue;rows.push(splitCSV(lines[j],d));}return{header,rows,unitHint:''};}
  }
  return null;
}
function col(header,names,re){const ks=header.map(key);for(const n of names){const i=ks.indexOf(n);if(i>=0)return i;}if(re){for(let i=0;i<ks.length;i++)if(re.test(ks[i]))return i;}return -1;}
function sniffTable(text){const t=parseTable(text);if(!t)return null;const h=t.header;
  const x=col(h,['posx','midx','centerx','x','refx','locationx','locx','xposition','xcoord','xloc'],/^(center|mid|pos|ref|loc|location|cx)?x(mm|mil|in)?$/);
  const y=col(h,['posy','midy','centery','y','refy','locationy','locy','yposition','ycoord','yloc'],/^(center|mid|pos|ref|loc|location|cy)?y(mm|mil|in)?$/);
  if(x>=0&&y>=0)return'pnp';
  if(col(h,['value','comment','val','qty','quantity','mpn','manufacturerpartnumber','footprint','description','partnumber'])>=0)return'bom';return null;}
function parsePnP(text){
  const t=parseTable(text);if(!t)throw new Error('Pick-and-Place 표의 머리글(Designator, X, Y 등)을 찾지 못했습니다.');
  const h=t.header;
  const iR=col(h,REFK),iX=col(h,['posx','midx','centerx','x','refx','locationx','locx','xposition','xcoord','xloc'],/^(center|mid|pos|ref|loc|location|cx)?x(mm|mil|in)?$/),
        iY=col(h,['posy','midy','centery','y','refy','locationy','locy','yposition','ycoord','yloc'],/^(center|mid|pos|ref|loc|location|cy)?y(mm|mil|in)?$/),
        iRot=col(h,['rot','rotation','angle','orientation','rotate']),iS=col(h,['side','layer','tb','placement','pcbside','mirror']),
        iV=col(h,['val','value','comment','values']),iP=col(h,['package','footprint','pattern','pkg','case','packagefootprint','footprintname']);
  if(iR<0||iX<0||iY<0)throw new Error('Pick-and-Place 표에 Designator, X, Y 열이 필요합니다.');
  const hx=key(h[iX]);let u=1;if(/mil/.test(hx)||/mil/i.test(h[iX]))u=0.0254;else if(/in$|inch/.test(hx)||t.unitHint==='in')u=25.4;
  const val=s=>{s=(s||'').trim();let k=u;if(/mil$/i.test(s))k=0.0254;else if(/mm$/i.test(s))k=1;else if(/(in|")$/i.test(s))k=25.4;return parseFloat(s.replace(/[^\d.+-eE]/g,''))*k;};
  const rows=[];
  t.rows.forEach(r=>{const ref=(r[iR]||'').trim();const x=val(r[iX]),y=val(r[iY]);if(!ref||isNaN(x)||isNaN(y))return;
    const sd=iS>=0?(r[iS]||''):'';const B=/^(b|bot|bottom|back|bottomlayer|bottom layer|b\.cu|solder|yes)$/i.test(sd.trim());
    rows.push({ref,x,y,rot:iRot>=0?(parseFloat(r[iRot])||0):0,side:B?'B':'T',val:iV>=0?r[iV]||'':'',fp:iP>=0?r[iP]||'':''});});
  if(!rows.length)throw new Error('Pick-and-Place 표에서 부품 행을 찾지 못했습니다.');
  return rows;
}
function expandRefs(s){const out=[];(s||'').split(/[,;\s]+/).forEach(tok=>{if(!tok)return;const m=tok.match(/^([A-Za-z_]+)(\d+)-\1?(\d+)$/);if(m){const a=+m[2],b=+m[3];if(b>=a&&b-a<500){for(let i=a;i<=b;i++)out.push(m[1]+i);return;}}out.push(tok);});return out;}
function parseBOM(text){
  const t=parseTable(text);if(!t)throw new Error('BOM 표의 머리글(Designator/Reference 등)을 찾지 못했습니다.');const h=t.header;
  const iR=col(h,['designator','designators','reference','references','ref','refdes','refdesignator','parts','part']),iV=col(h,['value','comment','val']),iF=col(h,['footprint','package','pattern','case']),
    iM=col(h,['mpn','manufacturerpartnumber','mfrpartnumber','mfrpn','mfgpartnumber','mfgpn','partnumber','manufacturerpart','lcsc','lcscpart','lcscpartnumber','supplierpart','pn']),iD=col(h,['description','desc']);
  if(iR<0)throw new Error('BOM 표에 Designator(Reference) 열이 필요합니다.');
  const map={};t.rows.forEach(r=>{expandRefs(r[iR]).forEach(ref=>{map[ref]={val:iV>=0?r[iV]:'',fp:iF>=0?r[iF]:'',mpn:iM>=0?r[iM]:'',desc:iD>=0?r[iD]:''};});});
  return map;
}
/* ---------- IPC-D-356 netlist ---------- */
function parseIPC356(text){
  let u=0.0001*25.4;const out=[];
  text.replace(/\r/g,'').split('\n').forEach(l=>{
    if(/^P\s+UNITS\s+CUST\s+1/.test(l))u=0.001;else if(/^P\s+UNITS\s+CUST\s+[02]/.test(l))u=0.0001*25.4;else if(/^P\s+UNITS\s+SI/.test(l))u=0.001;
    if(!/^3[12]7/.test(l))return;
    const net=l.slice(3,17).trim(),ref=l.slice(20,26).trim(),pin=l.slice(27,31).trim(),acc=l.slice(39,42);
    const m=l.match(/X([+-]?\d+)\s*Y([+-]?\d+)/);if(!m)return;
    out.push({net:net==='N/C'?null:net,ref:ref==='VIA'?null:ref,pin,x:+m[1]*u,y:+m[2]*u,side:acc==='A01'?'T':acc==='A02'?'B':'both',via:ref==='VIA'});
  });
  return out;
}

/* ---------- package size table ---------- */
function pkgSize(s){
  if(!s)return null;s=s.toUpperCase();
  const chips={'01005':[0.4,0.2,0.15],'0201':[0.6,0.3,0.25],'0402':[1.0,0.5,0.35],'0603':[1.6,0.8,0.45],'0805':[2.0,1.25,0.6],'1206':[3.2,1.6,0.6],'1210':[3.2,2.5,0.7],'1812':[4.5,3.2,0.8],'2010':[5.0,2.5,0.6],'2512':[6.4,3.2,0.6]};
  for(const k in chips)if(new RegExp('(^|[^0-9])'+k+'([^0-9]|$)').test(s))return chips[k];
  let m=s.match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)(?:\s*X\s*(\d+(?:\.\d+)?))?\s*MM/);if(m)return[+m[1],+m[2],m[3]?+m[3]:1];
  const tbl=[[/SOT-?23-?[56]/,[2.9,1.6,1.1]],[/SOT-?23|SOT23/,[2.9,1.3,1.0]],[/SOT-?223/,[6.5,3.5,1.7]],[/SOT-?89/,[4.5,2.5,1.5]],[/SC-?70|SOT-?323|SOT-?363/,[2,1.25,0.9]],[/SOD-?123/,[2.7,1.6,1.1]],[/SOD-?323/,[1.7,1.25,0.9]],[/SOD-?523/,[1.2,0.8,0.6]],
    [/SMA\b|DO-?214AC/,[4.3,2.6,2.1]],[/SMB\b|DO-?214AA/,[4.3,3.6,2.1]],[/SMC\b|DO-?214AB/,[7,6,2.3]],[/D2PAK|TO-?263/,[10,9,4.4]],[/DPAK|TO-?252/,[6.5,6.1,2.3]],[/TO-?220/,[10,4.5,9]],[/TO-?92/,[4.5,3.5,4.5]]];
  for(const [re,v] of tbl)if(re.test(s))return v;
  if((m=s.match(/SOIC-?(\d+)/)))return[3.9,(+m[1])/2*1.27+0.6,1.5];
  if((m=s.match(/TSSOP-?(\d+)/)))return[4.4,(+m[1])/2*0.65+0.6,1.1];
  if((m=s.match(/SSOP-?(\d+)/)))return[5.3,(+m[1])/2*0.65+0.8,1.8];
  if((m=s.match(/[LT]?QFP-?(\d+)|QFN-?(\d+)/))){const n=+(m[1]||m[2]);const sd=n/4*0.5+1;return[sd,sd,/QFN/.test(s)?0.9:1.4];}
  return null;
}

/* ---------- component helpers ---------- */
function kindOf(c){
  const r=(c.ref||'').toUpperCase(),lib=((c.fp||'')+' '+(c.lib||'')).toUpperCase(),np=c.pads.length,tht=c.pads.some(p=>p.drill);
  if(/^(H|MH|MK|FID|LOGO|G\*\*\*|REF\*\*|KIBUZZARD)/.test(r)||/(^|[ :])(MOUNTINGHOLE|FIDUCIAL|LOGO|NETTIE|TESTPOINT)/.test(lib)||/^TP\d/.test(r))return'none';
  if(/LED/.test(lib)||/^LED/.test(r))return'led';
  if(/^(R|C|L|FB|F)\d/.test(r)&&np<=3&&!tht)return'chip';
  if(/^(Y|X)\d/.test(r)&&!/CONN/.test(lib))return'xtal';
  if(/^(SW|S|BTN|K)\d/.test(r))return'btn';
  if(/^(J|P|CN|CON|X|USB)\d/.test(r)||/CONN|HEADER|USB|JACK|TERMINAL/.test(lib))return'conn';
  if(/^(C|R|L|D)\d/.test(r)&&tht)return'tht2';
  if(/^(U|IC|Q|D|VR|T|M|PS|RN|AR)\d/.test(r))return'ic';
  return'box';
}
function defaultHt(k,b,c){
  const tht=c.pads.some(p=>p.drill),a=b.w*b.h;
  switch(k){case'chip':return Math.max(0.3,Math.min(1.0,Math.min(b.w,b.h)*0.6));case'led':return 0.6;case'xtal':return a>20?3.5:0.8;case'btn':return 3.5;
    case'conn':return tht?(/USB/i.test(c.fp)?3.3:6):3;case'tht2':return 2.5;case'ic':return tht?3.5:a<6?1.0:a<40?1.3:1.6;default:return 1.5;}
}

/* ---------- spec (viewer JSON + built-in footprints) ---------- */
const FP={};
(function(){
  const chip=(bw,bh,ht,px,pw,ph,kind)=>({kind,body:[bw,bh,ht],pads:[{n:'1',x:-px,y:0,w:pw,h:ph},{n:'2',x:px,y:0,w:pw,h:ph}]});
  FP['0402']=chip(1.0,0.5,0.35,0.5,0.6,0.6,'chip');FP['0603']=chip(1.6,0.8,0.45,0.8,0.8,0.9,'chip');FP['0805']=chip(2.0,1.25,0.6,1.0,1.0,1.3,'chip');FP['1206']=chip(3.2,1.6,0.6,1.5,1.2,1.8,'chip');
  FP['LED-0603']=chip(1.6,0.8,0.6,0.8,0.8,0.9,'led');
  FP['SOT-223']={kind:'ic',stand:0.1,body:[6.5,3.5,1.7],pads:[{n:'1',x:-2.3,y:-3.15,w:0.95,h:2},{n:'2',x:0,y:-3.15,w:0.95,h:2},{n:'3',x:2.3,y:-3.15,w:0.95,h:2},{n:'4',x:0,y:3.15,w:3.3,h:2}]};
  const q=[];for(let i=0;i<8;i++){q.push({n:''+(1+i),x:-2.45,y:1.75-0.5*i,w:0.8,h:0.25});q.push({n:''+(9+i),x:-1.75+0.5*i,y:-2.45,w:0.25,h:0.8});q.push({n:''+(17+i),x:2.45,y:-1.75+0.5*i,w:0.8,h:0.25});q.push({n:''+(25+i),x:1.75-0.5*i,y:2.45,w:0.25,h:0.8});}
  q.push({n:'33',x:0,y:0,w:3.4,h:3.4});q.sort((a,b)=>a.n-b.n);
  FP['QFN-32']={kind:'ic',stand:0,body:[5,5,0.9],pads:q,dot:[-3.15,3.15]};
  const s=[];for(let i=0;i<4;i++)s.push({n:''+(1+i),x:-2.7,y:1.905-1.27*i,w:1.55,h:0.6});for(let i=0;i<4;i++)s.push({n:''+(5+i),x:2.7,y:-1.905+1.27*i,w:1.55,h:0.6});
  FP['SOIC-8']={kind:'ic',stand:0.1,body:[3.9,4.9,1.5],pads:s,dot:[-2.7,2.85]};
  FP['USB-C']={kind:'usb',body:[7.3,9.0,3.2],pads:[1,2,3,4,5,6].map(i=>({n:''+i,x:2.8,y:3.5-i,w:1.2,h:0.6})).concat([{n:'S1',x:0,y:4.3,w:1.8,h:1.0},{n:'S2',x:0,y:-4.3,w:1.8,h:1.0}])};
  FP['XTAL-3225']={kind:'xtal',body:[3.2,2.5,0.8],pads:[{n:'1',x:-1.1,y:-0.8,w:1.4,h:1.2},{n:'2',x:1.1,y:-0.8,w:1.4,h:1.2},{n:'3',x:1.1,y:0.8,w:1.4,h:1.2},{n:'4',x:-1.1,y:0.8,w:1.4,h:1.2}]};
  FP['SW-6x6']={kind:'btn',body:[6,6,3.5],pads:[{n:'1',x:-4,y:2.25,w:1.6,h:1.4},{n:'2',x:4,y:2.25,w:1.6,h:1.4},{n:'3',x:-4,y:-2.25,w:1.6,h:1.4},{n:'4',x:4,y:-2.25,w:1.6,h:1.4}]};
  FP['HDR-1x4']={kind:'hdr',body:[2.54,10.16,2.5],pads:[3.81,1.27,-1.27,-3.81].map((y,i)=>({n:''+(i+1),x:0,y,w:1.7,h:1.7,round:true,drill:1.0}))};
  for(const k in FP){const f=FP[k];const[bw,bh]=f.body;let a=-bw/2,b=-bh/2,c=bw/2,d=bh/2;f.pads.forEach(p=>{a=Math.min(a,p.x-p.w/2);b=Math.min(b,p.y-p.h/2);c=Math.max(c,p.x+p.w/2);d=Math.max(d,p.y+p.h/2);});f.lbb=[a,b,c,d];}
})();
function fromSpec(spec){
  const B=newBoard();B.source=spec._source||'JSON';const bd=spec.board||{};
  B.name=bd.name||'';B.t=bd.thickness||1.6;
  const W=+bd.width,H=+bd.height;if(!(W>0&&H>0))throw new Error('JSON의 board.width, board.height가 필요합니다.');
  const R=bd.corner!=null?+bd.corner:0;
  if(bd.outline&&bd.outline.length>2)B.outline=[bd.outline.map(p=>[+p[0],+p[1]])];
  else{const r=Math.min(R,W/2,H/2);if(r>0){const o=[];[[W-r,r,-90],[W-r,H-r,0],[r,H-r,90],[r,r,180]].forEach(([cx,cy,a])=>arcPts(cx,cy,r,a*D2R,(a+90)*D2R).forEach(p=>o.push(p)));B.outline=[o];}else B.outline=[[[0,0],[W,0],[W,H],[0,H]]];}
  (bd.holes||[]).forEach(h=>B.drills.push({x:+h[0],y:+h[1],d:+(h[2]||3.2),plated:false}));
  const sideOf=s=>/^(b|bot|bottom|back)$/i.test(s||'')?'B':'T';
  const byRef={};
  (spec.components||[]).forEach(cs=>{
    const side=sideOf(cs.side),rot=+(cs.rotation||cs.rot||0),x=+cs.x,y=+cs.y;
    const lib=FP[cs.footprint];
    const c={ref:cs.ref,val:cs.value||'',fp:cs.footprint||'',side,x,y,rot,pads:[],mpn:cs.mpn||'',desc:cs.description||'',pn:cs.pinNames||null,lab:cs.label||null};
    const xf=(lx,ly)=>{const xx=side==='B'?-lx:lx,a=rot*D2R;return[x+xx*Math.cos(a)-ly*Math.sin(a),y+xx*Math.sin(a)+ly*Math.cos(a)];};
    const padsL=cs.pads||(lib?lib.pads:[]);
    padsL.forEach(p=>{const[wx,wy]=xf(+p.x,+p.y);const n=''+(p.n!=null?p.n:p.number);const round=p.round||p.shape==='circle';
      const pad={t:'pad',x:wx,y:wy,w:+p.w||+p.d||1,h:+p.h||+p.d||1,ang:rot,shape:round?(n==='1'&&p.drill?'rect':'circle'):(p.shape||'rect'),net:(cs.pins&&cs.pins[n])||p.net||null,ref:c.ref,n,drill:p.drill||null,side:p.drill?'both':side};
      if(pad.shape==='rect'&&!p.drill)pad.rr=Math.min(0.1,Math.min(pad.w,pad.h)*0.25);
      if(c.pn&&c.pn[n])pad.fn=c.pn[n];c.pads.push(pad);if(p.drill)B.drills.push({x:wx,y:wy,d:+p.drill,plated:true});});
    let bw,bh,ht;if(cs.size){[bw,bh,ht]=cs.size;}else if(lib){[bw,bh,ht]=lib.body;}else{const ps=pkgSize(cs.footprint)||[2,2,1];[bw,bh,ht]=ps;}
    c.body={cx:x,cy:y,w:+bw,h:+bh,ang:rot,ht:+ht};
    if(lib){c.f=lib;c.kind=lib.kind;}
    B.comps.push(c);byRef[c.ref]=c;
    c.pads.forEach(p=>{if(p.side!=='B')B.layers['T.cu'].push(p);if(p.side!=='T')B.layers['B.cu'].push(p);});
  });
  const P=v=>{if(typeof v!=='string')return[+v[0],+v[1]];const i=v.indexOf('.');const c=byRef[v.slice(0,i)];const p=c&&c.pads.find(q=>q.n===v.slice(i+1));if(!p)throw new Error('트랙 좌표 참조를 찾지 못했습니다: '+v);return[p.x,p.y];};
  (spec.pours||[]).forEach(p=>{B.layers[sideOf(p.layer)+'.cu'].unshift({t:'pour',net:p.net,inset:p.inset||0.5,clr:p.clearance||0.3,r:Math.max(0,R-(p.inset||0.5))});});
  (spec.tracks||[]).forEach(t=>{const pts=(t.points||[]).map(P);if(pts.length<2)return;B.layers[sideOf(t.layer)+'.cu'].push(pts.length===2?{t:'seg',a:pts[0],b:pts[1],w:+t.width||0.25,net:t.net||null}:{t:'path',pts,w:+t.width||0.25,net:t.net||null});});
  (spec.vias||[]).forEach(v=>B.vias.push({x:+v.x,y:+v.y,d:+(v.size||0.6),drill:+(v.drill||0.3),net:v.net||null}));
  // silkscreen
  B.comps.forEach(c=>{
    const S=B.layers[c.side+'.silk'],f=c.f,mir=c.side==='B';
    const xf=(lx,ly)=>{const xx=mir?-lx:lx,a=c.rot*D2R;return[c.x+xx*Math.cos(a)-ly*Math.sin(a),c.y+xx*Math.sin(a)+ly*Math.cos(a)];};
    const kind=c.kind||'box';
    if(f&&kind==='hdr'){const[bw,bh]=f.body;const r=[[-bw/2,-bh/2],[bw/2,-bh/2],[bw/2,bh/2],[-bw/2,bh/2],[-bw/2,-bh/2]].map(p=>xf(p[0],p[1]));S.push({t:'path',pts:r,w:0.13});S.push({t:'seg',a:xf(-bw/2,bh/2-2.54),b:xf(bw/2,bh/2-2.54),w:0.13});}
    else if(f&&kind!=='chip'&&kind!=='led'){const m=0.3,[a,b,cc,d]=f.lbb,x0=a-m,y0=b-m,x1=cc+m,y1=d+m,L=Math.min(1.1,(x1-x0)/3,(y1-y0)/3);
      [[x0,y0,1,1],[x1,y0,-1,1],[x1,y1,-1,-1],[x0,y1,1,-1]].forEach(([px,py,sx,sy])=>S.push({t:'path',pts:[xf(px+sx*L,py),xf(px,py),xf(px,py+sy*L)],w:0.13}));
      if(f.dot){const[dx,dy]=xf(f.dot[0],f.dot[1]);S.push({t:'circle',x:dx,y:dy,r:0.25});}}
    if(kind==='led')S.push({t:'seg',a:xf(1.5,-0.6),b:xf(1.5,0.6),w:0.22});
    const big=kind==='ic'||kind==='usb'||kind==='btn';const size=big?0.85:0.65;
    let lp=c.lab;if(!lp){const ys=c.pads.map(p=>p.y+Math.max(p.w,p.h)/2).concat([c.y+Math.max(c.body.w,c.body.h)/2]);lp=[c.x,Math.max(...ys)+0.35+size/2];}
    S.push({t:'text',s:c.ref,x:lp[0],y:lp[1],size,ang:0,mir,align:'center',bold:true});
  });
  (spec.texts||[]).forEach(t=>B.layers[sideOf(t.side)+'.silk'].push({t:'text',s:t.text,x:+t.x,y:+t.y,size:+t.size||1,ang:+t.angle||0,mir:sideOf(t.side)==='B',align:t.align||'center',bold:true}));
  B.hasNets=true;
  return B;
}

/* ---------- Gerber set assembly ---------- */
function assembleGerber(entries){
  const B=newBoard();B.source='Gerber';
  const by=r=>entries.filter(e=>e.role===r);
  let anyNets=false;const allPads=[];
  [['tcu','T.cu'],['bcu','B.cu'],['tsilk','T.silk'],['bsilk','B.silk']].forEach(([r,L])=>{by(r).forEach(e=>{const g=parseGerber(e.text);g.prims.forEach(p=>B.layers[L].push(p));if(g.nets)anyNets=true;
    if(L.endsWith('cu'))g.prims.forEach(p=>{if(p.t==='pad'&&!p.clear){p.side=L[0];allPads.push(p);}});});});
  const edges=[];by('outline').forEach(e=>{const g=parseGerber(e.text);g.prims.forEach(p=>{if(p.t==='seg')edges.push([p.a,p.b]);else if(p.t==='path')edges.push(p.pts);else if(p.t==='poly')p.rings.forEach(r=>edges.push(r.concat([r[0]])));});});
  B.outline=outlineFrom(edges,m=>B.warnings.push(m));
  by('drill').forEach(e=>parseExcellon(e.text,e.name).forEach(h=>B.drills.push(h)));
  // IPC-D-356
  by('ipc356').forEach(e=>{const recs=parseIPC356(e.text);let hit=0;
    recs.forEach(r=>{const cands=allPads.filter(p=>(r.side==='both'||p.side===r.side||p.side==='both')&&Math.abs(p.x-r.x)<0.15&&Math.abs(p.y-r.y)<0.15);
      cands.forEach(p=>{if(r.net)p.net=r.net;if(r.ref&&!p.ref){p.ref=r.ref;p.n=r.pin;}if(r.via)p.via=true;hit++;});});
    if(hit){anyNets=true;propagateNets(B);B.notes.push('IPC-D-356 넷리스트로 패드에 넷을 붙이고, 연결된 트랙으로 넷을 이어 붙였습니다.');}
    else B.warnings.push('IPC-D-356 좌표가 Gerber 패드와 맞지 않아 넷을 붙이지 못했습니다.');});
  // through-hole pads appear on both copper layers: mark as 'both' when a drill sits under them
  if(B.drills.length){allPads.forEach(p=>{if(B.drills.some(d=>Math.abs(d.x-p.x)<0.05&&Math.abs(d.y-p.y)<0.05)){p.drill=B.drills.find(d=>Math.abs(d.x-p.x)<0.05&&Math.abs(d.y-p.y)<0.05).d;}});}
  // components
  const groups={};allPads.forEach(p=>{if(p.ref){(groups[p.ref]=groups[p.ref]||[]).push(p);}});
  const pnp=by('pnp');
  if(pnp.length){
    let rows=[];pnp.forEach(e=>{rows=rows.concat(parsePnP(e.text));});
    const bb=rawBBox(B);
    if(bb){const inside=f=>rows.filter(r=>{const y=f(r.y);return r.x>=bb[0]-2&&r.x<=bb[2]+2&&y>=bb[1]-2&&y<=bb[3]+2;}).length;
      const a=inside(y=>y),b=inside(y=>-y);if(b>a){rows.forEach(r=>{r.y=-r.y;});B.notes.push('Pick-and-Place의 Y축 방향을 보드에 맞게 뒤집었습니다.');}
      if(Math.max(a,b)<rows.length*0.3)B.warnings.push('Pick-and-Place 좌표 대부분이 보드 밖에 있습니다. 원점이나 단위가 Gerber와 다를 수 있습니다.');}
    rows.forEach(r=>{const c={ref:r.ref,val:r.val,fp:r.fp,side:r.side,x:r.x,y:r.y,rot:r.rot,pads:groups[r.ref]||[],mpn:'',desc:''};c.pads.forEach(p=>{p.ref=c.ref;});B.comps.push(c);});
  }else{
    Object.keys(groups).forEach(ref=>{const ps=groups[ref];const bb=bboxOf(ps.map(p=>[p.x,p.y]));const side=ps.every(p=>p.side==='B')?'B':'T';
      B.comps.push({ref,val:'',fp:'',side,x:(bb[0]+bb[2])/2,y:(bb[1]+bb[3])/2,rot:0,pads:ps,mpn:'',desc:''});});
    if(B.comps.length)B.notes.push('Gerber에 들어 있는 부품 속성(X2)으로 부품 위치를 만들었습니다.');
  }
  B.comps.forEach(c=>{c.body=bodyFromPads(c);});
  B.hasNets=anyNets;
  if(!anyNets)B.warnings.push('Gerber에 넷 정보가 없어 같은 넷 강조는 동작하지 않습니다. X2 속성을 켜고 내보내거나 IPC-D-356 넷리스트를 함께 넣어 주세요.');
  if(!by('outline').length)B.warnings.push('외곽선 Gerber가 없어 보드 외곽을 배선 범위로 추정했습니다.');
  if(!by('tcu').length&&!by('bcu').length)B.warnings.push('동박 Gerber가 없어 부품 배치만 표시합니다.');
  return B;
}
function bodyFromPads(c){
  const ps=pkgSize(c.fp)||pkgSize(c.val);
  if(ps&&!c.pads.length)return{cx:c.x,cy:c.y,w:ps[0],h:ps[1],ht:ps[2],ang:c.rot};
  if(c.pads.length){
    const a=-c.rot*D2R,ca=Math.cos(a),sa=Math.sin(a);let mn=[1e9,1e9],mx=[-1e9,-1e9];
    c.pads.forEach(p=>{const dx=p.x-c.x,dy=p.y-c.y,lx=dx*ca-dy*sa,ly=dx*sa+dy*ca;const r=Math.max(p.w||0,p.h||0)/2*0.6;mn=[Math.min(mn[0],lx-r),Math.min(mn[1],ly-r)];mx=[Math.max(mx[0],lx+r),Math.max(mx[1],ly+r)];});
    let w=mx[0]-mn[0],h=mx[1]-mn[1];if(ps){w=ps[0];h=ps[1];const sw=(c.rot%180+180)%180>45&&(c.rot%180+180)%180<135;}
    const lcx=(mn[0]+mx[0])/2,lcy=(mn[1]+mx[1])/2,b=c.rot*D2R;
    return{cx:c.x+lcx*Math.cos(b)-lcy*Math.sin(b),cy:c.y+lcx*Math.sin(b)+lcy*Math.cos(b),w:Math.max(w,0.4),h:Math.max(h,0.4),ht:ps?ps[2]:null,ang:c.rot};
  }
  return{cx:c.x,cy:c.y,w:2,h:2,ang:c.rot};
}
function propagateNets(B){
  ['T','B'].forEach(s=>{const L=B.layers[s+'.cu'];const lines=L.filter(p=>(p.t==='seg'||p.t==='path')&&!p.clear);const pads=L.filter(p=>p.t==='pad'&&!p.clear);
    for(let pass=0;pass<6;pass++){let changed=false;
      lines.forEach(t=>{if(t.net)return;const ends=t.t==='seg'?[t.a,t.b]:[t.pts[0],t.pts[t.pts.length-1]];
        for(const e of ends){const p=pads.find(q=>q.net&&Math.abs(q.x-e[0])<=q.w/2+0.01&&Math.abs(q.y-e[1])<=q.h/2+0.01);if(p){t.net=p.net;changed=true;break;}
          const o=lines.find(q=>q!==t&&q.net&&((q.t==='seg'?[q.a,q.b]:[q.pts[0],q.pts[q.pts.length-1]]).some(z=>Math.abs(z[0]-e[0])<0.01&&Math.abs(z[1]-e[1])<0.01)));if(o){t.net=o.net;changed=true;break;}}});
      pads.forEach(p=>{if(p.net)return;const t=lines.find(q=>q.net&&((q.t==='seg'?[q.a,q.b]:[q.pts[0],q.pts[q.pts.length-1]]).some(z=>Math.abs(p.x-z[0])<=p.w/2+0.01&&Math.abs(p.y-z[1])<=p.h/2+0.01)));if(t){p.net=t.net;changed=true;}});
      if(!changed)break;}});
}
function rawBBox(B){
  if(B.outline.length)return bboxOf(B.outline[0]);
  const pts=[];['T.cu','B.cu'].forEach(L=>B.layers[L].forEach(p=>{if(p.t==='pad')pts.push([p.x,p.y]);else if(p.t==='seg')pts.push(p.a,p.b);else if(p.t==='path')p.pts.forEach(q=>pts.push(q));else if(p.t==='poly')p.rings[0].forEach(q=>pts.push(q));}));
  B.drills.forEach(d=>pts.push([d.x,d.y]));return bboxOf(pts);
}

/* ---------- BOM merge ---------- */
function applyBOM(B,map){let n=0;B.comps.forEach(c=>{const m=map[c.ref];if(!m)return;n++;if(m.val&&!c.val)c.val=m.val;if(m.fp&&!c.fp)c.fp=m.fp;if(m.mpn)c.mpn=m.mpn;if(m.desc)c.desc=m.desc;});
  if(n)B.notes.push(`BOM에서 부품 ${n}개의 값·부품 번호·설명을 합쳤습니다.`);else B.warnings.push('BOM의 Designator가 보드 부품과 하나도 맞지 않습니다.');}

/* ---------- finalize: normalize to origin, nets, bboxes ---------- */
function finalize(B){
  let bb=null;
  if(B.outline.length)bb=bboxOf(B.outline[0]);
  if(!bb){const pts=[];const r=rawBBox(B);if(r){pts.push([r[0],r[1]],[r[2],r[3]]);}
    B.comps.forEach(c=>pts.push([c.x,c.y]));bb=bboxOf(pts);if(!bb)throw new Error('보드에 표시할 내용이 없습니다.');
    bb=[bb[0]-2,bb[1]-2,bb[2]+2,bb[3]+2];B.outline=[[[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]]];
    if(B.source==='KiCad')B.warnings.push('Edge.Cuts 외곽선이 없어 보드 크기를 추정했습니다.');}
  const dx=-bb[0],dy=-bb[1];
  const seenA=new WeakSet(),seenO=new WeakSet();
  const mv=p=>{if(!p||seenA.has(p))return;seenA.add(p);p[0]+=dx;p[1]+=dy;};
  const prim=p=>{if(seenO.has(p))return;seenO.add(p);if(p.x!=null){p.x+=dx;p.y+=dy;}if(p.x2!=null){p.x2+=dx;p.y2+=dy;}if(p.a){mv(p.a);mv(p.b);}if(p.pts)p.pts.forEach(mv);if(p.rings)p.rings.forEach(r=>r.forEach(mv));};
  B.outline.forEach(r=>r.forEach(mv));
  Object.values(B.layers).forEach(L=>L.forEach(prim));
  B.vias.forEach(prim);B.drills.forEach(prim);
  B.comps.forEach(c=>{c.x+=dx;c.y+=dy;if(c.body){c.body.cx+=dx;c.body.cy+=dy;}c.pads.forEach(prim);if(c.lab)c.lab=[c.lab[0]+dx,c.lab[1]+dy];});
  B.W=bb[2]-bb[0];B.H=bb[3]-bb[1];
  B.outline=B.outline.map(cleanRing);
  // comps
  const refs={};B.comps=B.comps.filter(c=>{if(!c.ref||refs[c.ref])return false;refs[c.ref]=1;return true;});
  B.comps.forEach(c=>{
    c.pads.sort((a,b)=>{const na=parseFloat(a.n),nb=parseFloat(b.n);if(!isNaN(na)&&!isNaN(nb)&&na!==nb)return na-nb;return(''+a.n).localeCompare(''+b.n);});
    if(!c.kind)c.kind=kindOf(c);
    if(!c.body)c.body={cx:c.x,cy:c.y,w:2,h:2,ang:c.rot};
    if(c.body.ht==null||isNaN(c.body.ht))c.body.ht=defaultHt(c.kind,c.body,c);
    const pts=[];const bd=c.body;if(bd.w>0){const a=bd.ang*D2R;[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{const lx=sx*bd.w/2,ly=sy*bd.h/2;pts.push([bd.cx+lx*Math.cos(a)-ly*Math.sin(a),bd.cy+lx*Math.sin(a)+ly*Math.cos(a)]);});}
    c.pads.forEach(p=>{const r=Math.hypot(p.w||0,p.h||0)/2;pts.push([p.x-r,p.y-r],[p.x+r,p.y+r]);});
    c.bb=bboxOf(pts)||[c.x-1,c.y-1,c.x+1,c.y+1];
  });
  // nets
  const N={};const net=n=>N[n]||(N[n]={name:n,pads:[],tracks:[],vias:[],zones:0,len:{T:0,B:0}});
  ['T','B'].forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(!p.net||p.clear)return;
    if(p.t==='seg'){const l=Math.hypot(p.b[0]-p.a[0],p.b[1]-p.a[1]);net(p.net).len[s]+=l;net(p.net).tracks.push(p);}
    else if(p.t==='path'){let l=0;for(let i=1;i<p.pts.length;i++)l+=Math.hypot(p.pts[i][0]-p.pts[i-1][0],p.pts[i][1]-p.pts[i-1][1]);net(p.net).len[s]+=l;net(p.net).tracks.push(p);}
    else if(p.t==='poly'||p.t==='pour')net(p.net).zones++;}));
  const seenP=new Set();B.comps.forEach(c=>c.pads.forEach(p=>{if(p.net&&!seenP.has(p)){seenP.add(p);net(p.net).pads.push(p);}}));
  ['T','B'].forEach(s=>B.layers[s+'.cu'].forEach(p=>{if(p.t==='pad'&&p.net&&!seenP.has(p)&&!p.via){seenP.add(p);net(p.net).pads.push(p);}}));
  B.vias.forEach(v=>{if(v.net)net(v.net).vias.push(v);});
  B.nets=N;
  const isGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(n.replace(/^\//,''));
  const isPwr=n=>/^(\+|V(CC|DD|BUS|IN|BAT|SYS)|[0-9.]+V\d*|\+?\d+V\d*|VREF|AVCC|AVDD|DVDD|3V3|5V|12V)/i.test(n.replace(/^\//,''));
  B.netClass=n=>isGnd(n)?'접지':isPwr(n)?'전원':'신호';
  B.netOrder=Object.keys(N).sort((a,b)=>{const r=x=>isGnd(x)?0:isPwr(x)?1:2;return r(a)-r(b)||a.localeCompare(b,undefined,{numeric:true});});
  B.comps.sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true}));
  B.byRef={};B.comps.forEach(c=>{B.byRef[c.ref]=c;});
  return B;
}

/* ---------- file role detection ---------- */
const ROLES={kicad:'KiCad PCB',json:'뷰어 JSON',tcu:'Gerber · 상단 동박',bcu:'Gerber · 하단 동박',tsilk:'Gerber · 상단 실크',bsilk:'Gerber · 하단 실크',outline:'Gerber · 외곽선',drill:'드릴 (Excellon)',pnp:'Pick-and-Place',bom:'BOM',ipc356:'넷리스트 (IPC-D-356)',ignore:'사용 안 함'};
function detectRole(name,text){
  const n=(name||'').toLowerCase(),base=n.split('/').pop(),ext=base.includes('.')?base.split('.').pop():'',head=(text||'').slice(0,6000);
  if(text&&/\u0000/.test(text.slice(0,2000)))return{role:'ignore',note:'바이너리 파일'};
  if(ext==='kicad_pcb'||/^\s*\(kicad_pcb/.test(head))return{role:'kicad'};
  if(ext==='kicad_sch'||ext==='sch')return{role:'ignore',note:'회로도 파일 (위치 정보 없음)'};
  if(ext==='kicad_pro'||ext==='kicad_prl')return{role:'ignore',note:'KiCad 프로젝트 설정'};
  if(/^(pcbdoc|schdoc|prjpcb|brd|pcb|dsn|max|pads|asc|cce|lbr)$/.test(ext))return{role:'ignore',note:'원본 설계 파일은 직접 읽을 수 없습니다. Gerber나 KiCad로 내보내 주세요.'};
  if(ext==='json'){try{const o=JSON.parse(text);if(o&&o.board&&o.components)return{role:'json'};}catch(e){}return{role:'ignore',note:'뷰어 형식이 아닌 JSON'};}
  if(/IPC-2581/i.test(head))return{role:'ignore',note:'IPC-2581은 아직 지원하지 않습니다. Gerber로 내보내 주세요.'};
  if(/^(tgz|gz|odb)$/.test(ext)||/odb\+\+/i.test(n))return{role:'ignore',note:'ODB++는 아직 지원하지 않습니다. Gerber로 내보내 주세요.'};
  if(/^(ipc|d356|356)$/.test(ext)||/^P\s+(JOB|UNITS|CODE)/m.test(head)&&/^3[12]7/m.test(head))return{role:'ipc356'};
  if(/^(pdf|png|jpg|jpeg|gif|svg|step|stp|wrl|zip|rar|7z|html|htm|md|doc|docx|xls|xlsx|pptx)$/.test(ext))return{role:'ignore',note:'PCB 데이터가 아닌 파일'};
  const isG=/%FS[LTD]?[AI]?/.test(head)||/%ADD\d+/.test(head)||(/^G04/m.test(head)&&/D0?[123]\*/.test(text.slice(0,20000)));
  if(isG){
    const ff=(head.match(/%TF\.FileFunction,([^*]+)\*%/)||[])[1];
    if(ff){const f=ff.toLowerCase();
      if(f.startsWith('copper')){if(/,top/.test(f))return{role:'tcu'};if(/,bot/.test(f))return{role:'bcu'};return{role:'ignore',note:'내층 동박 (표시하지 않음)'};}
      if(f.startsWith('legend')){return{role:/,bot/.test(f)?'bsilk':'tsilk'};}
      if(f.startsWith('profile'))return{role:'outline'};
      if(f.startsWith('soldermask'))return{role:'ignore',note:'솔더마스크 (색상만 사용)'};
      if(f.startsWith('paste'))return{role:'ignore',note:'솔더 페이스트'};
    }
    const tests=[['outline',/\.(gko|gm1|gml|gm|gm3|mil|dim|oln|bor)$|edge[_.\- ]?cuts|outline|profile|board[_\- ]?shape|mechanical[_ ]?1/],['ignore:솔더 페이스트',/\.(gtp|gbp|crc|crs)$|paste/],
      ['ignore:솔더마스크 (색상만 사용)',/\.(gts|gbs|stc|sts)$|[fb][_.]mask|soldermask|solder[_\- ]?mask|stop/],['tsilk',/\.(gto|plc)$|f[_.]silk|silk[_\- ]?top|top[_\- ]?silk|legend[_\- ]?top|top[_\- ]?overlay|topoverlay/],
      ['bsilk',/\.(gbo|pls)$|b[_.]silk|silk[_\- ]?bot|bot(tom)?[_\- ]?silk|legend[_\- ]?bot|bottom[_\- ]?overlay|bottomoverlay/],['ignore:내층 동박 (표시하지 않음)',/\.(g\d+l?|gp\d+|in\d+)$|in\d+[_.]cu|inner/],
      ['tcu',/\.(gtl|cmp|top)$|f[_.]cu|copper[_\- ]?top|top[_\- ]?copper|top[_\- ]?layer|toplayer|\.l1$/],['bcu',/\.(gbl|sol|bot)$|b[_.]cu|copper[_\- ]?bot|bot(tom)?[_\- ]?copper|bottom[_\- ]?layer|bottomlayer/]];
    for(const [r,re] of tests)if(re.test(base)){if(r.startsWith('ignore:'))return{role:'ignore',note:r.slice(7)};return{role:r};}
    return{role:'ignore',note:'역할을 알 수 없는 Gerber. 직접 지정해 주세요.'};
  }
  if(/^(drl|xln|drd|exc|tap|nc|drill|txt|cnc)$/.test(ext)&&(/^M48/m.test(head)||/^T\d+C[\d.]/m.test(head)))return{role:'drill'};
  if(/^(csv|txt|pos|tsv|xy|mnt|mnb|bom|xls)$/.test(ext)||/,/.test(head.split('\n')[0]||'')){
    const r=sniffTable(text);if(r)return{role:r};}
  return{role:'ignore',note:'알 수 없는 형식'};
}

/* ---------- build from entries ---------- */
function build(entries){
  const by=r=>entries.filter(e=>e.role===r);let B;
  const baseName=()=>{const ns=entries.filter(e=>e.role!=='ignore').map(e=>e.name.split('/').pop().replace(/\.[^.]+$/,''));if(!ns.length)return'';let p=ns[0];ns.forEach(s=>{let i=0;while(i<p.length&&i<s.length&&p[i]===s[i])i++;p=p.slice(0,i);});p=p.replace(/[-_. ]+$/,'');return p.length>=3?p:ns[0];};
  if(by('kicad').length){B=parseKicad(by('kicad')[0].text);if(by('kicad').length>1)B.warnings.push('KiCad 파일이 여러 개라 첫 번째만 사용했습니다.');if(by('pnp').length||by('tcu').length)B.notes.push('KiCad 파일을 기준으로 만들고 Gerber·Pick-and-Place는 사용하지 않았습니다.');}
  else if(by('json').length){B=fromSpec(JSON.parse(by('json')[0].text));}
  else if(['tcu','bcu','tsilk','bsilk','outline','drill','pnp'].some(r=>by(r).length))B=assembleGerber(entries);
  else throw new Error('보드를 만들 수 있는 파일이 없습니다. KiCad PCB, Gerber, Pick-and-Place 중 하나가 필요합니다.');
  by('bom').forEach(e=>applyBOM(B,parseBOM(e.text)));
  if(!B.name)B.name=baseName()||'업로드한 보드';
  B.files=entries.map(e=>({name:e.name,role:e.role}));
  return finalize(B);
}

return{parseKicad,parseGerber,parseExcellon,parsePnP,parseBOM,parseIPC356,fromSpec,assembleGerber,finalize,build,detectRole,ROLES,FP,pkgSize,inRing,segDist,arcPts,D2R};
})();
if(typeof module!=='undefined')module.exports=PCB;
