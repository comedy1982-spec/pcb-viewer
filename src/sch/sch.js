/* Schematic: KiCad .kicad_sch parser, connectivity, board-net mapping, and an auto-generated
   net-label schematic for boards that come without a schematic. World units are mm, y grows downward. */
const SCH=(function(){
"use strict";
const D2R=Math.PI/180,F=parseFloat;
const ch=(l,k)=>{for(let i=1;i<l.length;i++){const c=l[i];if(Array.isArray(c)&&c[0]===k)return c;}return null;};
const all=(l,k)=>{const o=[];for(let i=1;i<l.length;i++){const c=l[i];if(Array.isArray(c)&&c[0]===k)o.push(c);}return o;};
const xy=(l,k)=>{const c=ch(l,k);return c?[F(c[1]),F(c[2])]:null;};
const PAPER={A5:[210,148],A4:[297,210],A3:[420,297],A2:[594,420],A1:[841,594],A0:[1189,841],A:[279.4,215.9],B:[431.8,279.4],C:[558.8,431.8],D:[863.6,558.8],E:[1117.6,863.6],USLetter:[279.4,215.9],USLegal:[355.6,215.9],USLedger:[431.8,279.4]};
function hidden(l){if(!Array.isArray(l))return false;if(l.indexOf('hide')>0)return true;const h=ch(l,'hide');if(h&&h[1]!=='no')return true;const e=ch(l,'effects');if(e){if(e.indexOf('hide')>0)return true;const h2=ch(e,'hide');if(h2&&h2[1]!=='no')return true;}return false;}
function textFx(l){const e=l&&ch(l,'effects');const f=e&&ch(e,'font');const s=f&&ch(f,'size');const j=e&&ch(e,'justify');
  return{size:s?F(s[1]):1.27,h:j?(j.indexOf('left')>0?'left':j.indexOf('right')>0?'right':'center'):'center',v:j?(j.indexOf('top')>0?'top':j.indexOf('bottom')>0?'bottom':'middle'):'middle',mirror:!!(j&&j.indexOf('mirror')>0),bold:!!(f&&(f.indexOf('bold')>0||(ch(f,'bold')&&ch(f,'bold')[1]==='yes')))};}
function arc3(s,m,e){const ax=s[0],ay=s[1],bx=m[0],by=m[1],cx=e[0],cy=e[1];const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));if(Math.abs(d)<1e-12)return[s,e];
  const s2=ax*ax+ay*ay,b2=bx*bx+by*by,c2=cx*cx+cy*cy;const ux=(s2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/d,uy=(s2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/d,r=Math.hypot(ax-ux,ay-uy);
  const n2=a=>{a%=2*Math.PI;return a<0?a+2*Math.PI:a;};const a0=Math.atan2(ay-uy,ax-ux),am=Math.atan2(by-uy,bx-ux),a1=Math.atan2(cy-uy,cx-ux);const ccw=n2(am-a0)<n2(a1-a0);const da=ccw?n2(a1-a0):-n2(a0-a1);
  const n=Math.max(6,Math.min(64,Math.ceil(Math.abs(da)*r/0.3)));const o=[];for(let i=0;i<=n;i++){const a=a0+da*i/n;o.push([ux+r*Math.cos(a),uy+r*Math.sin(a)]);}return o;}

/* ---------- library symbols (lib coordinates, y up) ---------- */
function libGfx(it){
  const h=it[0],fill=(ch(ch(it,'fill')||[],'type')||[])[1]||'none',sw=(ch(ch(it,'stroke')||[],'width')||[])[1];
  const w=sw!=null?F(sw):0;
  if(h==='rectangle'){const s=xy(it,'start'),e=xy(it,'end');return{t:'poly',pts:[s,[e[0],s[1]],e,[s[0],e[1]],s],fill,w};}
  if(h==='polyline'){const p=all(ch(it,'pts')||[],'xy').map(q=>[F(q[1]),F(q[2])]);return p.length>1?{t:'poly',pts:p,fill,w}:null;}
  if(h==='circle'){const c=xy(it,'center'),r=F((ch(it,'radius')||[0,1])[1]);return{t:'circle',c,r,fill,w};}
  if(h==='arc'){const s=xy(it,'start'),m=xy(it,'mid'),e=xy(it,'end');if(!m)return null;return{t:'poly',pts:arc3(s,m,e),fill,w};}
  if(h==='bezier'){const p=all(ch(it,'pts')||[],'xy').map(q=>[F(q[1]),F(q[2])]);if(p.length!==4)return null;const o=[];for(let i=0;i<=16;i++){const t=i/16,u=1-t;o.push([u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]]);}return{t:'poly',pts:o,fill,w};}
  if(h==='text'){const a=ch(it,'at');if(hidden(it))return null;return{t:'text',s:it[1],p:[F(a[1]),F(a[2])],rot:a[3]?F(a[3]):0,fx:textFx(it)};}
  return null;
}
function parseLib(sym,libs){
  const def={name:sym[1],units:{},power:!!ch(sym,'power')||sym.indexOf('power')>0,pinNumHide:false,pinNameHide:false,pinNameOff:0.508,props:{}};
  const pn=ch(sym,'pin_numbers');if(pn&&(pn.indexOf('hide')>0||(ch(pn,'hide')&&ch(pn,'hide')[1]!=='no')))def.pinNumHide=true;
  const pna=ch(sym,'pin_names');if(pna){if(pna.indexOf('hide')>0||(ch(pna,'hide')&&ch(pna,'hide')[1]!=='no'))def.pinNameHide=true;const o=ch(pna,'offset');if(o)def.pinNameOff=F(o[1]);}
  all(sym,'property').forEach(p=>{def.props[p[1]]=p[2];});
  const ext=ch(sym,'extends');if(ext&&libs[ext[1]]){const b=libs[ext[1]];def.units=b.units;def.pinNumHide=b.pinNumHide;def.pinNameHide=b.pinNameHide;def.pinNameOff=b.pinNameOff;}
  const add=(unit,style,node)=>{const k=unit+'_'+style;const u=def.units[k]||(def.units[k]={unit,style,g:[],pins:[]});
    for(let i=1;i<node.length;i++){const it=node[i];if(!Array.isArray(it))continue;
      if(it[0]==='pin'){const a=ch(it,'at');const nm=ch(it,'name'),nu=ch(it,'number');u.pins.push({type:it[1],shape:it[2],p:[F(a[1]),F(a[2])],ang:a[3]?F(a[3]):0,len:F((ch(it,'length')||[0,2.54])[1]),name:nm?nm[1]:'',num:nu?nu[1]:'',hide:hidden(it),nameHide:nm?hidden(nm):false,numHide:nu?hidden(nu):false});}
      else{const g=libGfx(it);if(g)u.g.push(g);}}};
  add(0,0,sym);
  all(sym,'symbol').forEach(s=>{const m=String(s[1]).match(/_(\d+)_(\d+)$/);add(m?+m[1]:0,m?+m[2]:0,s);});
  return def;
}

/* ---------- schematic sheet ---------- */
function parseKicadSch(text,file){
  const root=PCB.sexp(text);if(!root||root[0]!=='kicad_sch')throw new Error('KiCad 회로도(.kicad_sch) 형식이 아닙니다.');
  const libs={};const ls=ch(root,'lib_symbols');if(ls)all(ls,'symbol').forEach(s=>{libs[s[1]]=parseLib(s,libs);});
  const pap=ch(root,'paper');let size=PAPER.A4;if(pap){if(PAPER[pap[1]])size=PAPER[pap[1]];else if(pap[1]==='User')size=[F(pap[2]),F(pap[3])];if(pap.indexOf('portrait')>0)size=[size[1],size[0]];}
  const tb=ch(root,'title_block');const tbv=k=>{const c=tb&&ch(tb,k);return c?c[1]:'';};
  const sh={file:file||'',name:(file||'').replace(/\.kicad_sch$/,''),title:tbv('title'),rev:tbv('rev'),date:tbv('date'),company:tbv('company'),w:size[0],h:size[1],
    symbols:[],wires:[],buses:[],junctions:[],nocon:[],labels:[],texts:[],lines:[],sheets:[],auto:false};
  for(let i=1;i<root.length;i++){const it=root[i];if(!Array.isArray(it))continue;const h=it[0];
    if(h==='wire'||h==='bus'){const p=all(ch(it,'pts')||[],'xy').map(q=>[F(q[1]),F(q[2])]);for(let k=1;k<p.length;k++)(h==='wire'?sh.wires:sh.buses).push({a:p[k-1],b:p[k]});}
    else if(h==='junction')sh.junctions.push(xy(it,'at'));
    else if(h==='no_connect')sh.nocon.push(xy(it,'at'));
    else if(h==='label'||h==='global_label'||h==='hierarchical_label'){const a=ch(it,'at');const sp=ch(it,'shape');sh.labels.push({kind:h==='label'?'local':h==='global_label'?'global':'hier',s:it[1],p:[F(a[1]),F(a[2])],rot:a[3]?F(a[3]):0,shape:sp?sp[1]:'',fx:textFx(it)});}
    else if(h==='text'){const a=ch(it,'at');if(a)sh.texts.push({s:it[1],p:[F(a[1]),F(a[2])],rot:a[3]?F(a[3]):0,fx:textFx(it)});}
    else if(h==='polyline'){const p=all(ch(it,'pts')||[],'xy').map(q=>[F(q[1]),F(q[2])]);if(p.length>1)sh.lines.push(p);}
    else if(h==='sheet'){const a=xy(it,'at'),s=xy(it,'size');const pr={};all(it,'property').forEach(p=>{pr[p[1]]=p[2];});
      sh.sheets.push({p:a,size:s,name:pr.Sheetname||pr['Sheet name']||'',file:pr.Sheetfile||pr['Sheet file']||'',pins:all(it,'pin').map(p=>{const q=ch(p,'at');return{s:p[1],type:p[2],p:[F(q[1]),F(q[2])],rot:q[3]?F(q[3]):0};})});}
    else if(h==='symbol'){const lid=(ch(it,'lib_id')||[])[1];const def=libs[lid]||libs[(ch(it,'lib_name')||[])[1]];if(!def)continue;sh.symbols.push(placeSymbol(it,def));}
  }
  return sh;
}
function xform(x,y,rot,mir){
  const c=Math.round(Math.cos(rot*D2R)),s=Math.round(Math.sin(rot*D2R));
  return(lx,ly)=>{let px=lx,py=-ly;let rx=px*c+py*s,ry=-px*s+py*c;if(mir==='x')ry=-ry;else if(mir==='y')rx=-rx;return[x+rx,y+ry];};
}
function placeSymbol(it,def){
  const a=ch(it,'at');const x=F(a[1]),y=F(a[2]),rot=a[3]?F(a[3]):0;const m=ch(it,'mirror');const mir=m?m[1]:'';
  const unit=+((ch(it,'unit')||[0,1])[1]),style=+((ch(it,'body_style')||ch(it,'convert')||[0,1])[1]);
  const T=xform(x,y,rot,mir);const props={};const ptext=[];
  all(it,'property').forEach(p=>{props[p[1]]=p[2];const pa=ch(p,'at');if(!pa||hidden(p)||!p[2]||def.power&&p[1]==='Reference')return;if(!/^(Reference|Value)$/.test(p[1])&&!ch(p,'show_name'))return;
    if(p[1]!=='Reference'&&p[1]!=='Value')return;ptext.push({s:p[2],p:[F(pa[1]),F(pa[2])],rot:pa[3]?F(pa[3]):0,fx:textFx(p),role:p[1]});});
  const S={ref:props.Reference||'',val:props.Value||'',fp:props.Footprint||'',lib:def.name,power:def.power,x,y,rot,mir,g:[],pins:[],texts:ptext,bb:null};
  const ux=Object.values(def.units).filter(u=>(u.unit===0||u.unit===unit)&&(u.style===0||u.style===style));
  ux.forEach(u=>{
    u.g.forEach(g=>{if(g.t==='poly')S.g.push({t:'poly',pts:g.pts.map(q=>T(q[0],q[1])),fill:g.fill,w:g.w});else if(g.t==='circle')S.g.push({t:'circle',c:T(g.c[0],g.c[1]),r:g.r,fill:g.fill,w:g.w});
      else if(g.t==='text'){S.g.push({t:'text',s:g.s,p:T(g.p[0],g.p[1]),rot:(g.rot+rot)%180,fx:g.fx});}});
    u.pins.forEach(pp=>{const dx=Math.cos(pp.ang*D2R),dy=Math.sin(pp.ang*D2R);const end=[pp.p[0]+dx*pp.len,pp.p[1]+dy*pp.len];
      S.pins.push({num:pp.num,name:pp.name,type:pp.type,shape:pp.shape,p:T(pp.p[0],pp.p[1]),e:T(end[0],end[1]),hide:pp.hide,
        nameShow:!def.pinNameHide&&!pp.nameHide&&pp.name&&pp.name!=='~',numShow:!def.pinNumHide&&!pp.numHide&&!def.power,nameOff:def.pinNameOff});});
  });
  const pts=[];S.g.forEach(g=>{if(g.pts)g.pts.forEach(q=>pts.push(q));else if(g.c){pts.push([g.c[0]-g.r,g.c[1]-g.r],[g.c[0]+g.r,g.c[1]+g.r]);}});S.pins.forEach(p=>{pts.push(p.p,p.e);});
  if(!pts.length)pts.push([x-1,y-1],[x+1,y+1]);
  let a1=1e9,b1=1e9,a2=-1e9,b2=-1e9;pts.forEach(q=>{a1=Math.min(a1,q[0]);b1=Math.min(b1,q[1]);a2=Math.max(a2,q[0]);b2=Math.max(b2,q[1]);});S.bb=[a1,b1,a2,b2];
  return S;
}

/* ---------- connectivity ---------- */
function connect(sheets,B){
  const key=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100);
  const par=[];const find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)par[a]=b;};
  const nodes=new Map();const node=(si,p)=>{const k=si+':'+key(p);let i=nodes.get(k);if(i==null){i=par.length;par.push(i);nodes.set(k,i);}return i;};
  const byName=new Map();const nameNode=n=>{let i=byName.get(n);if(i==null){i=par.length;par.push(i);byName.set(n,i);}return i;};
  sheets.forEach((sh,si)=>{
    const pts=[];sh.wires.forEach(w=>{w.na=node(si,w.a);w.nb=node(si,w.b);uni(w.na,w.nb);pts.push(w.a,w.b);});
    sh.symbols.forEach(s=>s.pins.forEach(p=>{p.node=node(si,p.p);pts.push(p.p);}));
    sh.labels.forEach(l=>{l.node=node(si,l.p);pts.push(l.p);uni(l.node,nameNode((l.kind==='local'?'':'')+l.s));});
    sh.junctions.forEach(j=>{node(si,j);pts.push(j);});
    sh.sheets.forEach(s=>s.pins.forEach(p=>{p.node=node(si,p.p);pts.push(p.p);uni(p.node,nameNode(p.s));}));
    // points on wire interiors
    pts.forEach(p=>{sh.wires.forEach(w=>{const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],l=dx*dx+dy*dy;if(!l)return;const t=((p[0]-w.a[0])*dx+(p[1]-w.a[1])*dy)/l;if(t<=1e-6||t>=1-1e-6)return;
      const d=Math.abs((p[0]-w.a[0])*dy-(p[1]-w.a[1])*dx)/Math.sqrt(l);if(d<0.01)uni(node(si,p),w.na);});});
    sh.symbols.forEach(s=>{if(s.power&&s.val)s.pins.forEach(p=>uni(p.node,nameNode(s.val)));});
  });
  // groups → names, pins, board nets
  const G=new Map();const grp=i=>{const r=find(i);let g=G.get(r);if(!g){g={id:G.size,names:new Set(),pins:[],net:null};G.set(r,g);}return g;};
  byName.forEach((i,n)=>grp(i).names.add(n));
  sheets.forEach(sh=>{sh.symbols.forEach(s=>s.pins.forEach(p=>{const g=grp(p.node);p.g=g;if(!s.power)g.pins.push({ref:s.ref,num:p.num});}));
    sh.wires.forEach(w=>{w.g=grp(w.na);});sh.labels.forEach(l=>{l.g=grp(l.node);});sh.sheets.forEach(s=>s.pins.forEach(p=>{p.g=grp(p.node);}));});
  let matched=0,total=0;
  G.forEach(g=>{
    if(B){for(const p of g.pins){const c=B.byRef[p.ref];const pad=c&&c.pads.find(q=>String(q.n)===String(p.num));if(pad&&pad.net){g.net=pad.net;break;}}}
    if(!g.net){const n=[...g.names][0];if(n&&B&&B.nets[n])g.net=n;else if(n)g.net=n;}
    if(g.pins.length){total++;if(B&&g.pins.some(p=>B.byRef[p.ref]))matched++;}
  });
  return{groups:[...G.values()],matched,total};
}

/* ---------- auto-generated schematic from board connectivity ----------
   Multi-page: one page per function block group (power · MCU · driver · comms …), blocks placed by signal flow
   (main block in the middle, connected blocks in columns left/right, their own passives next to the host pins),
   then every signal net on a page is drawn as real orthogonal wires (A* maze router on a 1.27 mm grid; crossings
   allowed only straight through, junction dots at T joins). Supply/ground rails use power symbols (rails tie
   repeated IC power pins); nets that continue on another page get a global label with the page numbers. */
const G=2.54,GR=1.27,CW=1.15;
const snapR=v=>Math.round(v/GR)*GR;
const DX=[1,0,-1,0],DY=[0,1,0,-1];
const dirOf=(ux,uy)=>Math.abs(ux)>Math.abs(uy)?(ux>0?0:2):(uy>0?1:3);
const pnum=p=>{const x=parseFloat(p.n);return isNaN(x)?1e6:x;};
const cmpPin=(a,b)=>pnum(a)-pnum(b)||String(a.n).localeCompare(String(b.n));
function nomV(n){n=String(n||'').replace(/^\//,'').toUpperCase();let m=n.match(/(\d+)V(\d+)/);if(m)return parseFloat(m[1]+'.'+m[2]);m=n.match(/(\d+(?:\.\d+)?)V/);return m?parseFloat(m[1]):0;}
function textRect(t){const s=t.fx.size||1.27,w=String(t.s||'').length*s*0.88,h=s*1.25;let r=((t.rot||0)%180+180)%180;const vert=r===90;
  const W=vert?h:w,H=vert?w:h;let x=t.p[0],y=t.p[1];const ha=t.fx.h,va=t.fx.v;
  let x1=ha==='left'?x:ha==='right'?x-W:x-W/2,y1=va==='top'?y:va==='bottom'?y-H:y-H/2;if(vert){x1=x-W/2;y1=ha==='left'?y-H:ha==='right'?y:y-H/2;}
  return[x1,y1,x1+W,y1+H];}
function moveSym(s,dx,dy){const mv=q=>[q[0]+dx,q[1]+dy];
  s.g.forEach(g=>{if(g.pts)g.pts=g.pts.map(mv);if(g.c)g.c=mv(g.c);if(g.p)g.p=mv(g.p);});s.pins.forEach(p=>{p.p=mv(p.p);p.e=mv(p.e);});s.texts.forEach(t=>{t.p=mv(t.p);});
  s.x+=dx;s.y+=dy;s.bb=[s.bb[0]+dx,s.bb[1]+dy,s.bb[2]+dx,s.bb[3]+dy];if(s._body)s._body=[s._body[0]+dx,s._body[1]+dy,s._body[2]+dx,s._body[3]+dy];}
function finishBB(s,extra){let a1=1e9,b1=1e9,a2=-1e9,b2=-1e9;const add=q=>{a1=Math.min(a1,q[0]);b1=Math.min(b1,q[1]);a2=Math.max(a2,q[0]);b2=Math.max(b2,q[1]);};
  s.g.forEach(g=>{if(g.pts)g.pts.forEach(add);if(g.c){add([g.c[0]-g.r,g.c[1]-g.r]);add([g.c[0]+g.r,g.c[1]+g.r]);}});s.pins.forEach(p=>{add(p.p);add(p.e);});
  s.texts.forEach(t=>{const r=textRect(t);add([r[0],r[1]]);add([r[2],r[3]]);});
  const m=extra||0;s.bb=[a1-m,b1-m,a2+m,b2+m];s.bw=s.bb[2]-s.bb[0];s.bh=s.bb[3]-s.bb[1];return s;}
function bodyOf(s){let a1=1e9,b1=1e9,a2=-1e9,b2=-1e9;s.g.forEach(g=>{const pts=g.pts||(g.c?[[g.c[0]-g.r,g.c[1]-g.r],[g.c[0]+g.r,g.c[1]+g.r]]:[]);pts.forEach(q=>{a1=Math.min(a1,q[0]);b1=Math.min(b1,q[1]);a2=Math.max(a2,q[0]);b2=Math.max(b2,q[1]);});});s._body=[a1,b1,a2,b2];return s;}
// 2-pin part, horizontal, pin 1 left; vertical variant rotates it so pin 1 is on top
function twoPin(c,pads,vert){
  const s={ref:c.ref,val:c.val,fp:c.fp,lib:'auto',power:false,x:0,y:0,rot:0,mir:'',g:[],pins:[],texts:[],_c:c,_two:true};
  const r=c.ref.toUpperCase(),poly=(pts,fill)=>s.g.push({t:'poly',pts,fill:fill||'none',w:0.254});
  let half=2.54;
  if(/^R/.test(r)||/^F\d/.test(r)){poly([[-2.54,-1],[2.54,-1],[2.54,1],[-2.54,1],[-2.54,-1]]);}
  else if(/^C/.test(r)&&c.kind==='elcap'){half=1.27;poly([[-0.5,-2],[-0.5,2]]);const a=[];for(let i=0;i<=12;i++){const t=-0.9+1.8*i/12;a.push([0.5+0.55*(1-Math.cos(t))*1.6,2.2*Math.sin(t)/Math.sin(0.9)]);}poly(a);
    poly([[-1.27,0],[-0.5,0]]);poly([[0.5,0],[1.27,0]]);poly([[-1.9,-1.9],[-1.1,-1.9]]);poly([[-1.5,-2.3],[-1.5,-1.5]]);}
  else if(/^C/.test(r)){half=1.27;poly([[-0.5,-2],[-0.5,2]]);poly([[0.5,-2],[0.5,2]]);poly([[-1.27,0],[-0.5,0]]);poly([[0.5,0],[1.27,0]]);}
  else if(/^(L|FB)/.test(r)){const p=[];for(let k=0;k<4;k++){for(let i=0;i<=8;i++){const a=Math.PI-Math.PI*i/8;p.push([-2.54+k*1.27+0.635+0.635*Math.cos(a),-0.635*Math.sin(a)]);}}poly(p);}
  else if(/^(D|LED)/.test(r)){poly([[-1.27,-1.27],[1.27,0],[-1.27,1.27],[-1.27,-1.27]]);poly([[1.27,-1.27],[1.27,1.27]]);poly([[-2.54,0],[-1.27,0]]);poly([[1.27,0],[2.54,0]]);
    if(c.kind==='led'||/LED/i.test(c.val+c.fp)){poly([[0,-1.6],[1.1,-2.7]]);poly([[0.7,-2.7],[1.1,-2.7],[1.1,-2.3]]);poly([[0.8,-1.6],[1.9,-2.7]]);poly([[1.5,-2.7],[1.9,-2.7],[1.9,-2.3]]);}}
  else if(/^(M|MOT)\d/.test(r)){const p=[];for(let i=0;i<=24;i++){const t=i/24*2*Math.PI;p.push([1.9*Math.cos(t),1.9*Math.sin(t)]);}poly(p);poly([[-2.54,0],[-1.9,0]]);poly([[1.9,0],[2.54,0]]);poly([[-0.8,0.7],[-0.8,-0.7],[0,0.2],[0.8,-0.7],[0.8,0.7]]);}
  else if(/^(Y|X)/.test(r)){poly([[-0.8,-1.6],[0.8,-1.6],[0.8,1.6],[-0.8,1.6],[-0.8,-1.6]]);poly([[-1.6,-1.6],[-1.6,1.6]]);poly([[1.6,-1.6],[1.6,1.6]]);poly([[-2.54,0],[-1.6,0]]);poly([[1.6,0],[2.54,0]]);}
  else poly([[-2.54,-1.27],[2.54,-1.27],[2.54,1.27],[-2.54,1.27],[-2.54,-1.27]]);
  const [p1,p2]=pads;
  if(c.kind==='elcap'){const neg=p=>/^(-|−|N|NEG)$/i.test(p.fn||'')||(!p.fn&&String(p.n)==='2');if(neg(p1))s.g.forEach(g=>{g.pts=g.pts.map(q=>[-q[0],q[1]]);});}
  if(/^(D|LED)/.test(r)){const isK=p=>/^(K|KA|CATHODE|-)$/i.test(p.fn||'');const isA=p=>/^(A|ANODE|\+)$/i.test(p.fn||'');if(isK(p1)||isA(p2))s.g.forEach(g=>{g.pts=g.pts.map(q=>[-q[0],q[1]]);});}
  s.pins.push({num:String(p1.n),name:'',p:[-half-2.54,0],e:[-half,0],nameShow:false,numShow:false,_pad:p1},{num:String(p2.n),name:'',p:[half+2.54,0],e:[half,0],nameShow:false,numShow:false,_pad:p2});
  if(vert){const R=q=>[-q[1],q[0]];s.g.forEach(g=>{g.pts=g.pts.map(R);});s.pins.forEach(p=>{p.p=R(p.p);p.e=R(p.e);});
    bodyOf(s);const bx=s._body[2]+0.8;
    s.texts.push({s:c.ref,p:[bx,-0.9],rot:0,fx:{size:1.27,h:'left',v:'middle'},role:'Reference'},{s:c.val||'',p:[bx,1.0],rot:0,fx:{size:1.1,h:'left',v:'middle'},role:'Value'});}
  else{bodyOf(s);s.texts.push({s:c.ref,p:[0,-3.0],rot:0,fx:{size:1.27,h:'center',v:'middle'},role:'Reference'},{s:c.val||'',p:[0,3.0],rot:0,fx:{size:1.1,h:'center',v:'middle'},role:'Value'});}
  return finishBB(s,0.3);
}
// power / ground symbol pointing away from its pin along direction d
function powerSym(net,at,d,gnd){
  const ux=DX[d],uy=DY[d],vx=-uy,vy=ux;const P=(a,b)=>[at[0]+ux*a+vx*b,at[1]+uy*a+vy*b];
  const s={ref:'#PWR',val:net,lib:'auto-power',power:true,x:at[0],y:at[1],rot:0,mir:'',g:[],pins:[{num:'1',name:net,p:at,e:at,nameShow:false,numShow:false}],texts:[]};
  const L=(pts)=>s.g.push({t:'poly',pts,fill:'none',w:0.254});
  if(gnd){L([P(0,0),P(1.27,0)]);L([P(1.27,-1.27),P(1.27,1.27),P(2.54,0),P(1.27,-1.27)]);}else{L([P(0,0),P(1.27,0)]);L([P(1.27,-1.27),P(1.27,1.27)]);}
  const tp=P(gnd?3.1:2.0,0);const fx={size:1.1,h:'center',v:'middle'};
  if(d===1)fx.v='top';else if(d===3)fx.v='bottom';else fx.h=d===0?'left':'right';
  s.texts.push({s:net,p:tp,rot:0,fx,role:'Value'});
  return finishBB(s,0.2);
}
// IC / connector box: L/R signal pins, supply pins on top, ground pins at the bottom (tied by short rails)
function boxSym(c,plan,railSym){
  const s={ref:c.ref,val:c.val,fp:c.fp,lib:'auto',power:false,x:0,y:0,rot:0,mir:'',g:[],pins:[],texts:[],_c:c};
  const nm=p=>p.fn||'';const cw=0.8;const ext={psyms:[],rails:[],nocon:[]};
  const mx=a=>Math.max(0,...a.map(p=>nm(p).length))*cw;
  const lw=mx(plan.L),rw=mx(plan.R),tn=mx(plan.T.flatMap(g=>g.pads)),bn=mx(plan.B.flatMap(g=>g.pads));
  const topPad=plan.T.length?Math.max(G,Math.ceil((tn+1.8)/G)*G):G,botPad=plan.B.length?Math.max(G,Math.ceil((bn+1.8)/G)*G):G;
  const rows=Math.max(plan.L.length,plan.R.length,1);const Hh=topPad+(rows-1)*G+botPad;
  const refW=Math.max(c.ref.length*1.4*1.0,(c.val||'').length*1.2*0.95)+2;
  const slots=(groups,x0)=>{let x=x0,prevSym=-1e9,prevHw=0;return groups.map(g=>{const hw=g.net.length*1.1*0.4+0.6,mid=Math.floor(g.pads.length/2)*G;
    let st=Math.max(x,prevSym+prevHw+hw+1-mid);st=Math.ceil(st/G)*G;const xs=g.pads.map((_,i)=>st+i*G);prevSym=st+mid;prevHw=hw;x=xs[xs.length-1]+2*G;return{g,xs,sym:st+mid};});};
  const tS=slots(plan.T,Math.ceil(refW/G)*G),bS=slots(plan.B,G);
  const lastX=a=>a.length?a[a.length-1].xs[a[a.length-1].xs.length-1]:0;
  const conn=!plan.R.length||!plan.L.length;
  let W=Math.max(conn&&!plan.T.length&&!plan.B.length?7.62:15.24,Math.ceil((lw+rw+(plan.R.length&&plan.L.length?3:1.5))/G)*G,lastX(tS)+G,lastX(bS)+G);
  if(!conn)W=Math.max(W,Math.ceil(refW/G)*G);
  s.g.push({t:'poly',pts:[[0,0],[W,0],[W,Hh],[0,Hh],[0,0]],fill:'background',w:0.254});
  const pin=(pd,p,e,side)=>{const o={num:String(pd.n),name:nm(pd),p,e,nameShow:!!nm(pd),numShow:true,nameOff:0.5,_pad:pd,side};s.pins.push(o);return o;};
  plan.L.forEach((pd,i)=>pin(pd,[-G,topPad+i*G],[0,topPad+i*G],'L'));
  plan.R.forEach((pd,i)=>pin(pd,[W+G,topPad+i*G],[W,topPad+i*G],'R'));
  tS.forEach(({g,xs,sym})=>{g.pads.forEach((pd,i)=>pin(pd,[xs[i],-G],[xs[i],0],'T'));if(xs.length>1)ext.rails.push({a:[xs[0],-G],b:[xs[xs.length-1],-G],net:g.net});ext.psyms.push(powerSym(g.net,[sym,-G],3,false));});
  bS.forEach(({g,xs,sym})=>{g.pads.forEach((pd,i)=>pin(pd,[xs[i],Hh+G],[xs[i],Hh],'B'));if(xs.length>1)ext.rails.push({a:[xs[0],Hh+G],b:[xs[xs.length-1],Hh+G],net:g.net});ext.psyms.push(powerSym(g.net,[sym,Hh+G],1,true));});
  // rail pins kept on a side (connectors): power symbol right at the pin end
  s.pins.forEach(p=>{if((p.side==='L'||p.side==='R')&&p._pad.net&&railSym(p._pad.net))ext.psyms.push(powerSym(p._pad.net,p.p,p.side==='L'?2:0,railSym(p._pad.net)==='gnd'));
    if(!p._pad.net)ext.nocon.push(p.p);});
  s.texts.push({s:c.ref,p:[0,-1.0-1.9],rot:0,fx:{size:1.4,h:'left',v:'bottom',bold:true},role:'Reference'},{s:c.val||'',p:[0,-1.0],rot:0,fx:{size:1.2,h:'left',v:'bottom'},role:'Value'});
  s._body=[0,0,W,Hh];finishBB(s,0.3);
  return Object.assign(ext,{s,W,Hh});
}

/* ---- block model ---- */
function blocksOf(B,ctx){
  const comps=B.comps.filter(c=>c.pads.some(p=>p.net));
  const anchors=comps.filter(c=>!ctx.two(c)).sort((a,b)=>{const r=x=>/^(J|P|CN|USB)/i.test(x.ref)?0:/^U/i.test(x.ref)?1:2;return r(a)-r(b)||b.pads.length-a.pads.length||a.ref.localeCompare(b.ref,undefined,{numeric:true});});
  const blocks=anchors.map(a=>({a,items:[]}));const loose={a:null,items:[]};
  comps.filter(ctx.two).forEach(c=>{const nets=new Set(c.pads.map(p=>p.net).filter(n=>n&&!ctx.isRail(n)));let best=null,bs=0;
    blocks.forEach(k=>{const s=k.a.pads.filter(p=>nets.has(p.net)).length;if(s>bs){bs=s;best=k;}});
    if(!best){const pn=new Set(c.pads.map(p=>p.net).filter(n=>n&&!ctx.isGnd(n)));blocks.forEach(k=>{const s=k.a.pads.filter(p=>pn.has(p.net)).length;if(s>bs){bs=s;best=k;}});}
    (best||loose).items.push(c);});
  for(let moved=true,guard=0;moved&&guard<8;guard++){moved=false;
    loose.items.slice().forEach(c=>{const nets=c.pads.map(p=>p.net).filter(n=>n&&!ctx.isRail(n));const k=blocks.find(b=>b.items.some(x=>x.pads.some(p=>nets.includes(p.net))));
      if(k){k.items.push(c);loose.items.splice(loose.items.indexOf(c),1);moved=true;}});}
  if(loose.items.length)blocks.push(loose);
  const ics=blocks.filter(b=>b.a&&/^U/i.test(b.a.ref)&&ctx.uniq(b.a).length>=20).sort((x,y)=>ctx.uniq(y.a).length-ctx.uniq(x.a).length);
  blocks.forEach((b,i)=>{b.id=i;b.comps=(b.a?[b.a]:[]).concat(b.items);const a=b.a;
    const allRail=a&&a.pads.every(p=>!p.net||ctx.isRail(p.net));
    b.kind=!a?'loose':a===(ics[0]&&ics[0].a)?'mcu':(/^U/i.test(a.ref)&&(a.pads.some(p=>/^(VIN|VOUT|VI|VO|IN|OUT)$/i.test(p.fn||''))&&a.pads.filter(p=>p.net&&!ctx.isRail(p.net)).length<=1||/1117|LDO|78\d\d|LM317|REG|TPS7|AMS|LP29|NCV|TLS8|TLE42/i.test(a.val||'')))||allRail?'power':/^U/i.test(a.ref)?'ic':'other';
    b.sig=new Set();b.comps.forEach(c=>c.pads.forEach(p=>{if(p.net&&!ctx.isRail(p.net))b.sig.add(p.net);}));});
  return blocks;
}
const share=(x,y,f)=>{let k=0;(f?f(x):x.sig).forEach(n=>{if((f?f(y):y.sig).has(n))k++;});return k;};
function pageTitle(blocks){
  const has=re=>blocks.some(b=>b.a&&re.test((b.a.val||'')+' '+(b.a.mpn||'')));const lab=[];
  if(blocks.some(b=>b.kind==='mcu'))lab.push('MCU');
  if(has(/DRV|BTN|L298|A4988|TMC|IR21|L6234|gate|bridge/i))lab.push('모터 드라이버');
  if(has(/TLE92|TJA|MCP25|SN65HVD|CAN|LIN|RS485|MAX3/i))lab.push('통신');
  if(has(/W25|AT25|24C|FLASH|EEPROM|FRAM/i))lab.push('메모리');
  if(blocks.every(b=>b.kind==='power'||b.kind==='loose'))lab.unshift('전원');
  else if(!lab.length)lab.push(blocks.some(b=>b.kind==='power')?'전원·주변 회로':'주변 회로');
  return lab.slice(0,3).join(' · ');
}

/* ---- page layout ---- */
function planAnchor(c,b,L){
  const pads=L.ctx.uniq(c).sort(cmpPin);const big=pads.length>64;
  const conn=/^(J|P|CN|USB|X|M)\d/i.test(c.ref)&&pads.length<=24;
  const par=L.parent.get(b),kids=L.kids.get(b)||[],sd=L.side.get(b);
  const inS=sd==='L'?'R':sd==='R'?'L':null,outS=inS?(inS==='L'?'R':'L'):null;
  const it=[],T=new Map(),Bm=new Map(),unused=[];const cat=new Map();
  pads.forEach(p=>{const n=p.net;
    if(!n){if(big)unused.push(p);else it.push({p,cat:'nc'});return;}
    if(!L.sigNet(n)){if(conn){it.push({p,cat:'rail'});return;}const m=L.ctx.isGnd(n)?Bm:T;if(!m.has(n))m.set(n,[]);m.get(n).push(p);return;}
    const others=L.netBlocks(n).filter(x=>x!==b);let k=null;
    if(par&&others.includes(par))it.push({p,cat:'in'});
    else if((k=kids.find(x=>others.includes(x))))it.push({p,cat:'ext',tgt:k});
    else if(!sd&&(k=others.find(x=>L.side.get(x))))it.push({p,cat:'ext',tgt:k});
    else if(others.length)it.push({p,cat:'sib'});
    else if(L.offNet(n)||!b.items.some(c=>c.pads.some(q=>q.net===n))&&pads.filter(q=>q.net===n).length<2)it.push({p,cat:'off'});
    else it.push({p,cat:'local'});});
  const kOrd=new Map();kids.map(k=>{const ps=it.filter(x=>x.tgt===k).map(x=>pnum(x.p));return[k,ps.length?ps.reduce((a,v)=>a+v,0)/ps.length:1e6];}).sort((a,b)=>a[1]-b[1]).forEach(([k],i)=>kOrd.set(k,i));
  const S={L:[],R:[]};
  const bal=()=>S.L.length<=S.R.length?'L':'R';
  const singleSide=conn?(inS||(kids.length&&L.side.get(kids[0])==='R'?'R':'L')):null;
  const netSide=new Map();
  ['in','ext','off','sib','local','rail','nc'].forEach(cn=>it.filter(x=>x.cat===cn).forEach(x=>{let sd2;
    if(singleSide)sd2=singleSide;else if(cn==='in')sd2=inS;else if(cn==='ext')sd2=L.side.get(x.tgt)||bal();else sd2=outS||(x.p.net&&netSide.get(x.p.net))||bal();
    if(x.p.net&&!netSide.has(x.p.net))netSide.set(x.p.net,sd2);x.side=sd2;S[sd2].push(x);}));
  const first=new Map();pads.forEach(p=>{if(p.net&&!first.has(p.net))first.set(p.net,pnum(p));});
  const rank=conn?{in:0,ext:1,off:2,sib:3,local:4,rail:5,nc:6}:{in:0,off:1,ext:2,sib:3,local:4,rail:5,nc:6};
  const key=x=>x.cat==='in'?(L.partnerY(x.p.net)??1e6):x.cat==='ext'?(kOrd.get(x.tgt)??99)*1e4+pnum(x.p):x.p.net?first.get(x.p.net)*1e3+pnum(x.p)*1e-3:pnum(x.p);
  ['L','R'].forEach(sd2=>S[sd2].sort((a,b)=>rank[a.cat]-rank[b.cat]||key(a)-key(b)));
  it.forEach(x=>cat.set(x.p,x.cat));
  const grp=m=>[...m.entries()].sort((a,b)=>nomV(b[0])-nomV(a[0])||a[0].localeCompare(b[0])).map(([net,ps])=>({net,pads:ps.sort(cmpPin)}));
  return{L:S.L.map(x=>x.p),R:S.R.map(x=>x.p),T:grp(T),B:grp(Bm),cat,unused};
}
function newGrp(){return{syms:[],psyms:[],rails:[],nocon:[],terms:[],bb:[1e9,1e9,-1e9,-1e9]};}
function grpAdd(gr,s){(s.power?gr.psyms:gr.syms).push(s);}
function grpMove(gr,dx,dy){dx=snapR(dx);dy=snapR(dy);const mv=q=>[q[0]+dx,q[1]+dy];gr.syms.concat(gr.psyms).forEach(s=>moveSym(s,dx,dy));gr.rails.forEach(r=>{r.a=mv(r.a);r.b=mv(r.b);});gr.nocon=gr.nocon.map(mv);gr.terms.forEach(t=>{t.p=mv(t.p);});
  gr.bb=[gr.bb[0]+dx,gr.bb[1]+dy,gr.bb[2]+dx,gr.bb[3]+dy];}
function grpBB(gr){let b=[1e9,1e9,-1e9,-1e9];const add=r=>{b=[Math.min(b[0],r[0]),Math.min(b[1],r[1]),Math.max(b[2],r[2]),Math.max(b[3],r[3])];};
  gr.syms.concat(gr.psyms).forEach(s=>add(s.bb));gr.terms.forEach(t=>{if(t.cat==='off'){const len=G+String(t.net).length*CW+7;const e=[t.p[0]+DX[t.d]*len,t.p[1]+DY[t.d]*len];add([Math.min(t.p[0],e[0]),Math.min(t.p[1],e[1])-1,Math.max(t.p[0],e[0]),Math.max(t.p[1],e[1])+1]);}});
  gr.bb=b;return gr;}
function termsOf(gr,s,L,cat){s.pins.forEach(p=>{const pd=p._pad;if(!pd||!pd.net||!L.sigNet(pd.net))return;const dx=p.p[0]-p.e[0],dy=p.p[1]-p.e[1];
  gr.terms.push({p:p.p,d:dirOf(dx,dy),net:pd.net,ref:s.ref,num:p.num,cat:cat?cat.get(pd)||'local':'local'});});}
function layoutBlock(b,L){
  const ctx=L.ctx,gr=newGrp();let A=null,plan=null;
  const railSym=n=>!L.sigNet(n)?(ctx.isGnd(n)?'gnd':'sup'):null;
  if(b.a){plan=planAnchor(b.a,b,L);A=boxSym(b.a,plan,railSym);grpAdd(gr,A.s);A.psyms.forEach(s=>grpAdd(gr,s));gr.rails.push(...A.rails);gr.nocon.push(...A.nocon);termsOf(gr,A.s,L,plan.cat);gr.unused=plan.unused;}
  // passives
  const host=new Map();if(A)A.s.pins.forEach(p=>{const pd=p._pad;if(pd&&pd.net&&L.sigNet(pd.net)&&(p.side==='L'||p.side==='R'))if(!host.has(pd.net)||(host.get(pd.net).cat!=='local'&&plan.cat.get(pd)==='local'))host.set(pd.net,{side:p.side,y:p.p[1],cat:plan.cat.get(pd)});});
  const info=b.items.map(c=>{const pads=ctx.uniq(c);const sig=pads.filter(p=>p.net&&L.sigNet(p.net)),rl=pads.filter(p=>p.net&&!L.sigNet(p.net));return{c,pads,sig,rl};});
  const placed=new Map();let frontier=[];
  info.forEach(x=>{const hs=x.sig.filter(p=>host.has(p.net));if(!hs.length)return;const hp=hs.find(p=>host.get(p.net).cat==='local')||hs[0];const h=host.get(hp.net);
    placed.set(x,{side:h.side,depth:1,pref:h.cat==='local'?h.y:Infinity,inner:hp});frontier.push(x);});
  for(let depth=2;frontier.length&&depth<6;depth++){const nx=[];
    info.forEach(x=>{if(placed.has(x))return;for(const f of frontier){const fo=f.sig.filter(p=>p!==placed.get(f).inner).map(p=>p.net);const hp=x.sig.find(p=>fo.includes(p.net));if(hp){const pf=placed.get(f);placed.set(x,{side:pf.side,depth,pref:null,inner:hp,par:f});nx.push(x);break;}}});frontier=nx;}
  const mk=(x,pl)=>{let s;
    if(x.sig.length===1&&x.rl.length===1){const r=x.rl[0],sup=!ctx.isGnd(r.net);s=twoPin(x.c,sup?[r,x.sig[0]]:[x.sig[0],r],true);}
    else if(!x.sig.length){const[a,c2]=x.pads;const ga=a.net&&ctx.isGnd(a.net),gc=c2.net&&ctx.isGnd(c2.net);s=twoPin(x.c,ga&&!gc?[c2,a]:gc&&!ga?[a,c2]:nomV(a.net)>=nomV(c2.net)?[a,c2]:[c2,a],true);}
    else{const inner=pl?pl.inner:x.sig[0];const outer=x.pads.find(p=>p!==inner);s=twoPin(x.c,pl&&pl.side==='R'?[inner,outer]:[outer,inner],false);}
    s.pins.forEach(p=>{const n=p._pad.net;if(!n)return;if(!L.sigNet(n))gr.psyms.push(powerSym(n,p.p,dirOf(p.p[0]-p.e[0],p.p[1]-p.e[1]),ctx.isGnd(n)));});
    s.pins.forEach(p=>{if(!p._pad.net)gr.nocon.push(p.p);});
    return s;};
  const psFrom=(s,from)=>gr.psyms.splice(from);
  const box=A?A.s._body:[0,0,0,0];const yBottom=A?Math.max(A.s.bb[3],...A.psyms.map(s=>s.bb[3])):0;
  ['L','R'].forEach(sd=>{let edge=sd==='L'?(A?-G:0)-5.08:(A?A.W+G:0)+5.08;
    for(let depth=1;depth<6;depth++){const col=[...placed.entries()].filter(([,v])=>v.side===sd&&v.depth===depth);if(!col.length)break;
      const parts=col.map(([x,pl])=>{const p0=gr.psyms.length;const s=mk(x,pl);const ps=psFrom(s,p0);
        const ip=s.pins.find(p=>p._pad===pl.inner);let pref=pl.pref;if(pl.par){const pp=placed.get(pl.par);pref=pp.sym?pp.sym.pins.find(q=>q._pad!==pp.inner)?.p[1]:null;}
        return{x,pl,s,ps,ip,pref:pref==null?Infinity:pref};});
      parts.sort((a,b)=>a.pref-b.pref);const busy=A?A.s.pins.filter(p=>p.side===sd&&p._pad.net&&L.sigNet(p._pad.net)&&!['local','nc'].includes(plan.cat.get(p._pad))).map(p=>p.p[1]):[];
      let cur=busy.length?Math.max(...busy)+G:-1e9,wmax=0;const pushTop=A?box[3]+G:0;
      parts.forEach(pt=>{const s=pt.s;let bbAll=[s.bb[0],s.bb[1],s.bb[2],s.bb[3]];pt.ps.forEach(q=>{bbAll=[Math.min(bbAll[0],q.bb[0]),Math.min(bbAll[1],q.bb[1]),Math.max(bbAll[2],q.bb[2]),Math.max(bbAll[3],q.bb[3])];});
        let dy=isFinite(pt.pref)?pt.pref-pt.ip.p[1]:Math.max(cur,pushTop)-bbAll[1];if(bbAll[1]+dy<cur)dy=cur-bbAll[1];dy=Math.ceil(dy/GR-1e-6)*GR;
        const dx=sd==='L'?edge-bbAll[2]:edge-bbAll[0];moveSym(s,snapR(dx),dy);pt.ps.forEach(q=>moveSym(q,snapR(dx),dy));
        cur=bbAll[3]+dy+3.81;wmax=Math.max(wmax,bbAll[2]-bbAll[0]);grpAdd(gr,s);gr.psyms.push(...pt.ps);pt.pl.sym=s;termsOf(gr,s,L,null);});
      edge=sd==='L'?edge-wmax-6.35:edge+wmax+6.35;}});
  // free / decoupling row under everything
  const rest=info.filter(x=>!placed.has(x));
  if(rest.length){grpBB(gr);const x0=isFinite(gr.bb[0])?gr.bb[0]:0;let x=x0,y=(isFinite(gr.bb[3])?Math.max(gr.bb[3],yBottom):0)+3.81,rowH=0;const maxW=Math.max(isFinite(gr.bb[2])?gr.bb[2]-x0:0,70);
    // chains (passives joined by signal nets) become one vertical stack: supply side on top, ground at the bottom
    const comp=[];const seen=new Set();
    rest.forEach(r=>{if(seen.has(r))return;const st=[r];seen.add(r);for(let k=0;k<st.length;k++){const ns=st[k].sig.map(p=>p.net);rest.forEach(o=>{if(!seen.has(o)&&o.sig.some(p=>ns.includes(p.net))){seen.add(o);st.push(o);}});}comp.push(st);});
    const rk=x=>x.rl.some(p=>!ctx.isGnd(p.net))&&!x.rl.some(p=>ctx.isGnd(p.net))?0:x.rl.some(p=>ctx.isGnd(p.net))&&!x.rl.some(p=>!ctx.isGnd(p.net))?2:1;
    comp.forEach(st=>st.sort((a,b)=>rk(a)-rk(b)||String(a.c.ref).localeCompare(b.c.ref,undefined,{numeric:true})));
    comp.sort((a,b)=>(a.length>1||a[0].sig.length?1:0)-(b.length>1||b[0].sig.length?1:0)||String(a[0].c.ref).localeCompare(b[0].c.ref,undefined,{numeric:true}));
    comp.forEach(st=>{const parts=st.map(xi=>{const p0=gr.psyms.length;const s=mk(xi,null);const ps=psFrom(s,p0);let bbA=s.bb.slice();ps.forEach(q=>{bbA=[Math.min(bbA[0],q.bb[0]),Math.min(bbA[1],q.bb[1]),Math.max(bbA[2],q.bb[2]),Math.max(bbA[3],q.bb[3])];});return{s,ps,bbA};});
      const w=Math.max(...parts.map(q=>q.bbA[2]-q.bbA[0])),h=parts.reduce((a,q)=>a+q.bbA[3]-q.bbA[1]+2.54,-2.54);
      if(x>x0&&x+w>x0+maxW){x=x0;y+=rowH+2.54;rowH=0;}
      let cy=y;const left=Math.min(...parts.map(q=>q.s.pins[0].p[0]-q.bbA[0]));
      parts.forEach(q=>{const dx=snapR(x+left-q.s.pins[0].p[0]),dy=snapR(cy-q.bbA[1]);moveSym(q.s,dx,dy);q.ps.forEach(z=>moveSym(z,dx,dy));grpAdd(gr,q.s);gr.psyms.push(...q.ps);termsOf(gr,q.s,L,null);cy+=q.bbA[3]-q.bbA[1]+2.54;});
      x+=w+3.81;rowH=Math.max(rowH,h);});}
  grpBB(gr);gr.block=b;return gr;
}
function layoutPage(P,blocks){
  const ctx=P.ctx;const set=new Set(blocks);
  const rails=blocks.every(b=>b.kind==='power'||b.kind==='loose');
  const sigNet=n=>!!n&&(!ctx.isRail(n)||(rails&&!ctx.isGnd(n)));
  const bn=new Map(blocks.map(b=>{const s=new Set();b.comps.forEach(c=>c.pads.forEach(p=>{if(sigNet(p.net))s.add(p.net);}));return[b,s];}));
  const sh=(x,y)=>share(x,y,z=>bn.get(z));
  const L={ctx,sigNet,parent:new Map(),kids:new Map(),side:new Map(),level:new Map(),
    netBlocks:n=>blocks.filter(b=>bn.get(b).has(n)),
    offNet:n=>!ctx.isRail(n)&&P.netBlocks(n).some(b=>!set.has(b)),partnerY:()=>null};
  // main block and signal-flow tree
  let main=blocks[0],bs=-1;blocks.forEach(b=>{const w=(b.kind==='mcu'?1e6:0)+blocks.reduce((a,o)=>o===b?a:a+sh(b,o),0)*100+(b.a?ctx.uniq(b.a).length:0);if(w>bs){bs=w;main=b;}});
  L.level.set(main,0);const placed=[main];const wsum={L:0,R:0};const order=[];
  for(;;){let best=null,bw=0,bp=null;
    blocks.forEach(b=>{if(L.level.has(b))return;placed.forEach(p=>{const s=sh(b,p);if(s>bw||(s===bw&&s>0&&bp&&L.level.get(p)>L.level.get(bp))){bw=s;best=b;bp=p;}});});
    if(!best)break;
    L.level.set(best,L.level.get(bp)+1);L.parent.set(best,bp);if(!L.kids.has(bp))L.kids.set(bp,[]);L.kids.get(bp).push(best);
    let sd;if(bp===main){sd=wsum.L<=wsum.R?'L':'R';wsum[sd]+=bw+(best.a?ctx.uniq(best.a).length*0.05:0);}else sd=L.side.get(bp);
    L.side.set(best,sd);placed.push(best);order.push(best);}
  const free=blocks.filter(b=>!L.level.has(b));
  const groups=new Map();
  const mg=layoutBlock(main,L);groups.set(main,mg);
  const maxLv=Math.max(0,...[...L.level.values()]);
  const cross=(sd,lv)=>{let k=0;order.filter(b=>L.side.get(b)===sd&&L.level.get(b)>=lv).forEach(b=>{k+=sh(b,L.parent.get(b));});return k;};
  for(let lv=1;lv<=maxLv;lv++)['L','R'].forEach(sd=>{
    const col=order.filter(b=>L.level.get(b)===lv&&L.side.get(b)===sd);if(!col.length)return;
    const inner=[...groups.entries()].filter(([b])=>b===main||(L.side.get(b)===sd&&L.level.get(b)<lv)).map(([,g])=>g);
    const edge=sd==='L'?Math.min(...inner.map(g=>g.bb[0])):Math.max(...inner.map(g=>g.bb[2]));
    const ch=10.16+GR*Math.min(40,cross(sd,lv));
    const items=col.map(b=>{const pg=groups.get(L.parent.get(b));
      L.partnerY=n=>{const t=pg.terms.filter(t=>t.net===n);return t.length?t.reduce((a,t)=>a+t.p[1],0)/t.length:null;};
      const g=layoutBlock(b,L);L.partnerY=()=>null;
      // shift that lines up the most facing pins with their partners (median of per-pin offsets)
      const dl=g.terms.filter(t=>t.cat==='in'||!g.terms.some(x=>x.cat==='in')).flatMap(t=>{const u=pg.terms.filter(u=>u.net===t.net);if(!u.length)return[];const best=u.reduce((a,v)=>Math.abs(v.p[0]-t.p[0])<Math.abs(a.p[0]-t.p[0])?v:a);return[best.p[1]-t.p[1]];}).sort((a,b)=>a-b);
      const dy=dl.length?dl[dl.length>>1]:pg.bb[1]-g.bb[1];
      return{b,g,top:g.bb[1]+dy};});
    items.sort((a,b)=>a.top-b.top);let cur=-1e9;
    items.forEach(it=>{let top=Math.max(it.top,cur);const dx=sd==='L'?edge-ch-it.g.bb[2]:edge+ch-it.g.bb[0];grpMove(it.g,dx,top-it.g.bb[1]);cur=it.g.bb[3]+7.62;groups.set(it.b,it.g);});});
  // unrelated blocks: a row under (or beside, when nothing is related) the tree
  if(free.length){let bb=[1e9,1e9,-1e9,-1e9];groups.forEach(g=>{bb=[Math.min(bb[0],g.bb[0]),Math.min(bb[1],g.bb[1]),Math.max(bb[2],g.bb[2]),Math.max(bb[3],g.bb[3])];});
    const alone=groups.size===1;let x=alone?bb[2]+12.7:bb[0],y=alone?bb[1]:bb[3]+12.7,rowH=alone?bb[3]-bb[1]:0;const maxW=Math.max(380,bb[2]-bb[0]);const x0=bb[0];
    const fr=free.slice().sort((a,b)=>(a.a&&/^(J|P|CN)/i.test(a.a.ref)?0:1)-(b.a&&/^(J|P|CN)/i.test(b.a.ref)?0:1)||Math.max(0,...[...bn.get(b)].map(nomV))-Math.max(0,...[...bn.get(a)].map(nomV))||(a.a?a.a.ref:'~').localeCompare(b.a?b.a.ref:'~',undefined,{numeric:true}));
    fr.forEach(b=>{const g=layoutBlock(b,L);const w=g.bb[2]-g.bb[0],h=g.bb[3]-g.bb[1];if(x>x0&&x+w>x0+maxW){x=x0;y+=rowH+12.7;rowH=0;}grpMove(g,x-g.bb[0],y-g.bb[1]);groups.set(b,g);x+=w+12.7;rowH=Math.max(rowH,h);});}
  let bb=[1e9,1e9,-1e9,-1e9];groups.forEach(g=>{bb=[Math.min(bb[0],g.bb[0]),Math.min(bb[1],g.bb[1]),Math.max(bb[2],g.bb[2]),Math.max(bb[3],g.bb[3])];});
  groups.forEach(g=>grpMove(g,15-bb[0],15-bb[1]));
  return{groups:[...groups.values()],w:bb[2]-bb[0],h:bb[3]-bb[1],sigNet,rails,blocks};
}

/* ---- wire router ---- */
function routePage(sh,lay,xref){
  const W=Math.ceil(sh.w/GR)+1,H=Math.ceil(sh.h/GR)+1,N=W*H;
  const blk=new Uint8Array(N),near=new Uint8Array(N),nNet=new Int32Array(N),nKind=new Uint8Array(N),conn=new Uint8Array(N),deg=new Uint8Array(N),eH=new Int32Array(N),eV=new Int32Array(N),tdir=new Int8Array(N).fill(-1);
  const id=(x,y)=>Math.round(y/GR)*W+Math.round(x/GR);const ix=i=>i%W,iy=i=>(i/W)|0;const pt=i=>[ix(i)*GR,iy(i)*GR];
  const inb=(gx,gy)=>gx>=0&&gy>=0&&gx<W&&gy<H;
  const rect=(r,v)=>{const x1=Math.max(0,Math.ceil(r[0]/GR-1e-6)),x2=Math.min(W-1,Math.floor(r[2]/GR+1e-6)),y1=Math.max(0,Math.ceil(r[1]/GR-1e-6)),y2=Math.min(H-1,Math.floor(r[3]/GR+1e-6));for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)blk[y*W+x]=v||1;};
  const line=(a,b)=>{const n=Math.round(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/GR);const out=[];for(let k=0;k<=n;k++)out.push(id(a[0]+(b[0]-a[0])*k/Math.max(1,n),a[1]+(b[1]-a[1])*k/Math.max(1,n)));return out;};
  const nets=new Map();const nid=n=>{if(!nets.has(n))nets.set(n,{id:nets.size+1,name:n,terms:[],edges:[],labels:0});return nets.get(n);};
  const syms=lay.groups.flatMap(g=>g.syms),psyms=lay.groups.flatMap(g=>g.psyms);
  syms.forEach(s=>{if(s._body)rect(s._body);s.texts.forEach(t=>{const r=textRect(t);rect([r[0]-0.4,r[1]-0.5,r[2]+0.4,r[3]+0.5]);});
    s.pins.forEach(p=>{const ln=line(p.e,p.p);ln.slice(0,-1).forEach(i=>{blk[i]=1;});const d=dirOf(p.p[0]-p.e[0],p.p[1]-p.e[1]);const ox=d%2===0?0:-1,oy=d%2===0?-1:0;ln.slice(0,-1).forEach(i=>{const gx=ix(i)+ox,gy=iy(i)+oy;if(inb(gx,gy))blk[gy*W+gx]=1;});
      if(!p._pad||!p._pad.net)blk[ln[ln.length-1]]=1;});});
  const halo=new Uint8Array(N);syms.forEach(s=>s.pins.forEach(p=>{const d=dirOf(p.p[0]-p.e[0],p.p[1]-p.e[1]);const i=id(p.p[0],p.p[1]);const gx=ix(i),gy=iy(i);
    [[d%2===0?0:1,d%2===0?1:0],[d%2===0?0:-1,d%2===0?-1:0]].forEach(([ox,oy])=>{if(inb(gx+ox,gy+oy))halo[(gy+oy)*W+gx+ox]=1;});}));
  psyms.forEach(s=>{rect(s.bb);});
  lay.groups.forEach(g=>{g.rails.forEach(r=>line(r.a,r.b).forEach(i=>{blk[i]=1;}));g.nocon.forEach(p=>{blk[id(p[0],p[1])]=1;});});
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(blk[i])continue;for(let k=0;k<4;k++){const gx=x+DX[k],gy=y+DY[k];if(inb(gx,gy)&&blk[gy*W+gx]){near[i]=1;break;}}}
  // terminals
  const terms=lay.groups.flatMap(g=>g.terms);
  const esc=new Int32Array(N);
  terms.forEach(t=>{const N2=nid(t.net);t.i=id(t.p[0],t.p[1]);N2.terms.push(t);nNet[t.i]=N2.id;nKind[t.i]=4;tdir[t.i]=t.d;blk[t.i]=0;
    const gx=ix(t.i)+DX[t.d],gy=iy(t.i)+DY[t.d];if(inb(gx,gy)){const j=gy*W+gx;esc[j]=esc[j]&&esc[j]!==N2.id?-1:N2.id;}});
  const commitEdge=(a,b,N2)=>{const d=ix(b)>ix(a)?0:ix(b)<ix(a)?2:iy(b)>iy(a)?1:3;if(d===0)eH[a]=N2.id;else if(d===2)eH[b]=N2.id;else if(d===1)eV[a]=N2.id;else eV[b]=N2.id;deg[a]++;deg[b]++;N2.edges.push([a,b]);};
  const edgeOwner=(i,d)=>{const j=i+DX[d]+DY[d]*W;return d===0?eH[i]:d===2?eH[j]:d===1?eV[i]:eV[j];};
  // labels: off-page globals, power symbols for wired rails, names for single-pin nets
  const rayFree=(t,len)=>{for(let k=1;k<=len;k++){const gx=ix(t.i)+DX[t.d]*k,gy=iy(t.i)+DY[t.d]*k;if(!inb(gx,gy))return false;const j=gy*W+gx;if(blk[j]||nNet[j]||(esc[j]&&esc[j]!==nets.get(t.net).id))return false;if(k>2&&t.d%2===0&&(gy<1||blk[j-W]))return false;}return true;};
  const reserveRay=(t,N2,len,stub)=>{let prev=t.i;for(let k=1;k<=len;k++){const j=(iy(t.i)+DY[t.d]*k)*W+ix(t.i)+DX[t.d]*k;if(k<=stub){commitEdge(prev,j,N2);nNet[j]=N2.id;nKind[j]=4;conn[j]=1;prev=j;}else blk[j]=1;
      if(k>stub&&t.d%2===0){const up=j-W;if(up>=0)blk[up]=1;}}conn[t.i]=1;return prev;};
  const rotOf=d=>d===0?0:d===2?180:d===3?90:270;
  const label=(kind,N2,at,d,extra)=>{const l=Object.assign({kind,s:N2.name,p:pt(at),rot:rotOf(d),fx:{size:1.27,h:d===2?'right':'left',v:'bottom'}},extra||{});sh.labels.push(l);N2.labels++;return l;};
  nets.forEach(N2=>{
    const pages=xref(N2.name);const isRailW=lay.rails&&P_isRail(N2.name);
    if(!(pages.length||isRailW||N2.terms.length===1))return;
    const txt=isRailW?6:Math.ceil((N2.name.length*CW+3+(pages.length?pages.join(',').length*0.8+3:0))/GR);
    const cand=N2.terms.slice().sort((a,b)=>(a.cat==='off'?0:1)-(b.cat==='off'?0:1));
    let t=cand.find(t=>rayFree(t,2+txt))||null;
    if(t){const end=reserveRay(t,N2,2+txt,2);
      if(isRailW)sh.symbols.push(powerSym(N2.name,pt(end),t.d,false));
      else if(pages.length)label('global',N2,end,t.d,{xr:pages.join(',')});
      else label('local',N2,end,t.d);
      N2.root=t;}
  });
  // route nets, shortest first
  const heapK=[],heapV=[];const push=(k,v)=>{heapK.push(k);heapV.push(v);let i=heapK.length-1;while(i>0){const p=(i-1)>>1;if(heapK[p]<=heapK[i])break;[heapK[p],heapK[i]]=[heapK[i],heapK[p]];[heapV[p],heapV[i]]=[heapV[i],heapV[p]];i=p;}};
  const pop=()=>{const v=heapV[0],k=heapK[0];const lk=heapK.pop(),lv=heapV.pop();if(heapK.length){heapK[0]=lk;heapV[0]=lv;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heapK.length&&heapK[l]<heapK[m])m=l;if(r<heapK.length&&heapK[r]<heapK[m])m=r;if(m===i)break;[heapK[m],heapK[i]]=[heapK[i],heapK[m]];[heapV[m],heapV[i]]=[heapV[i],heapV[m]];i=m;}}return[k,v];};
  const gS=new Float32Array(N*4).fill(Infinity),from=new Int32Array(N*4),touched=[];
  function astar(N2,t,tb){
    heapK.length=0;heapV.length=0;touched.forEach(s=>{gS[s]=Infinity;});touched.length=0;
    const hz=i=>{const x=ix(i),y=iy(i);return Math.max(0,tb[0]-x,x-tb[2])+Math.max(0,tb[1]-y,y-tb[3]);};
    const s0=t.i*4+t.d;gS[s0]=0;touched.push(s0);from[s0]=-1;push(hz(t.i),s0);let pops=0;
    while(heapK.length&&pops<250000){const[,s]=pop();pops++;const i=s>>2,d=s&3;const g=gS[s];
      const other=nNet[i]&&nNet[i]!==N2.id;
      for(let nd=0;nd<4;nd++){
        if(i===t.i&&nd!==t.d)continue;if(nd===((d+2)&3))continue;if(other&&nd!==d)continue;
        const gx=ix(i)+DX[nd],gy=iy(i)+DY[nd];if(!inb(gx,gy))continue;const j=gy*W+gx;
        if(blk[j]||edgeOwner(i,nd)||(esc[j]&&esc[j]!==N2.id&&!(esc[j]===-1&&j===t.i+DX[t.d]+DY[t.d]*W)))continue;
        let c=1+(nd!==d?2.5:0)+near[j]*1.2+halo[j]*3;
        if(nNet[j]===N2.id){if(!conn[j])continue;if(tdir[j]>=0&&(deg[j]>0||nd!==((tdir[j]+2)&3)))continue;
          const sj=j*4+nd;if(g+c<gS[sj]){if(gS[sj]===Infinity)touched.push(sj);gS[sj]=g+c;from[sj]=s;}
          // goal: rebuild path
          const path=[];let q=sj;while(q>=0){path.push(q>>2);q=from[q];}return path.reverse();}
        if(nNet[j]){const k=nKind[j];if(!((k===1&&nd%2===1)||(k===2&&nd%2===0)))continue;c+=3;}
        const sj=j*4+nd;if(g+c<gS[sj]){if(gS[sj]===Infinity)touched.push(sj);gS[sj]=g+c;from[sj]=s;push(g+c+hz(j),sj);}}}
    return null;}
  const fails=[];
  const order=[...nets.values()].filter(N2=>N2.terms.length+(N2.root?0:0)>=1).map(N2=>{const xs=N2.terms.map(t=>t.p[0]),ys=N2.terms.map(t=>t.p[1]);return[N2,Math.max(...xs)-Math.min(...xs)+Math.max(...ys)-Math.min(...ys)];}).sort((a,b)=>a[1]-b[1]).map(a=>a[0]);
  order.forEach(N2=>{
    if(N2.terms.length<2)return;
    const tb=[1e9,1e9,-1e9,-1e9];const grow=i=>{const x=ix(i),y=iy(i);tb[0]=Math.min(tb[0],x);tb[1]=Math.min(tb[1],y);tb[2]=Math.max(tb[2],x);tb[3]=Math.max(tb[3],y);};
    const root=N2.root||N2.terms[0];conn[root.i]=1;grow(root.i);
    for(let k=0;k<N.length;k++){} // no-op
    N2.edges.forEach(([a,b])=>{grow(a);grow(b);});
    const rest=N2.terms.filter(t=>t!==root).sort((a,b)=>{const da=Math.abs(ix(a.i)-ix(root.i))+Math.abs(iy(a.i)-iy(root.i)),db=Math.abs(ix(b.i)-ix(root.i))+Math.abs(iy(b.i)-iy(root.i));return da-db;});
    rest.forEach(t=>{const path=astar(N2,t,tb);
      if(!path){fails.push(t);return;}
      for(let k=1;k<path.length;k++)commitEdge(path[k-1],path[k],N2);
      path.forEach((i,k)=>{grow(i);if(k===0){conn[i]=1;return;}if(k===path.length-1){if(nNet[i]===N2.id)nKind[i]=4;return;}
        const a=path[k-1],b=path[k+1];const hor=iy(a)===iy(i)&&iy(b)===iy(i),ver=ix(a)===ix(i)&&ix(b)===ix(i);
        if(nNet[i]&&nNet[i]!==N2.id){nKind[i]=3;return;}nNet[i]=N2.id;conn[i]=1;nKind[i]=hor?1:ver?2:4;});});
  });
  // failed terminals: name them with local labels at the pin and somewhere on the routed tree
  fails.forEach(t=>{const N2=nets.get(t.net);
    if(!N2.labels||N2._lbl!==true){const on=N2.edges.find(([a,b])=>iy(a)===iy(b));if(on)label('local',N2,on[0],0);else{const r=N2.root||N2.terms[0];if(r!==t)label('local',N2,r.i,r.d);}N2._lbl=true;}
    label('local',N2,t.i,t.d);});
  // edges → wires, junction dots
  nets.forEach(N2=>{if(!N2.edges.length)return;const hs=new Map(),vs=new Map();
    N2.edges.forEach(([a,b])=>{if(iy(a)===iy(b)){const y=iy(a),x=Math.min(ix(a),ix(b));if(!hs.has(y))hs.set(y,[]);hs.get(y).push(x);}else{const x=ix(a),y=Math.min(iy(a),iy(b));if(!vs.has(x))vs.set(x,[]);vs.get(x).push(y);}});
    const runs=(m,mk)=>m.forEach((arr,k)=>{arr.sort((a,b)=>a-b);let s=arr[0],e=arr[0]+1;for(let q=1;q<=arr.length;q++){if(q<arr.length&&arr[q]===e){e++;continue;}sh.wires.push(mk(k,s,e));if(q<arr.length){s=arr[q];e=s+1;}}});
    runs(hs,(y,a,b)=>({a:[a*GR,y*GR],b:[b*GR,y*GR]}));runs(vs,(x,a,b)=>({a:[x*GR,a*GR],b:[x*GR,b*GR]}));
    const dg=new Map();N2.edges.forEach(([a,b])=>{dg.set(a,(dg.get(a)||0)+1);dg.set(b,(dg.get(b)||0)+1);});
    dg.forEach((v,i)=>{if(v+(tdir[i]>=0?1:0)>=3)sh.junctions.push(pt(i));});});
  return{fails:fails.length,nets:nets.size};
}
let P_isRail=()=>false;

/* ---- pages ---- */
const PAPERS=[['A5',210,148],['A4',297,210],['A3',420,297],['A2',594,420],['A1',841,594],['A0',1189,841]];
function autoSchematic(B){
  const isGnd=n=>!!n&&B.netClass(n)==='접지';
  const isRail=n=>!!n&&B.netClass(n)!=='신호'&&!/(MON|SENSE|SNS|ADC|FB|DET)/i.test(String(n).replace(/^\//,''));
  P_isRail=isRail;
  const uniq=c=>[...new Map(c.pads.map(p=>[String(p.n),p])).values()];
  const two=c=>{const u=uniq(c);return u.length===2&&/^(R|C|L|FB|D|LED|F|Y|X)\d/i.test(c.ref)?u:null;};
  const ctx={isGnd,isRail,uniq,two};
  const blocks=blocksOf(B,ctx);
  const P={ctx,netBlocks:n=>blocks.filter(b=>b.comps.some(c=>c.pads.some(p=>p.net===n)))};
  const fits=bl=>{const L=layoutPage(P,bl);return L.w<=267&&L.h<=163;};
  let pages;
  if(!blocks.length)pages=[];
  else if(fits(blocks))pages=[blocks];
  else{
    const seed=[];const pw=blocks.filter(b=>b.kind==='power'||b.kind==='loose');if(pw.length)seed.push(pw);
    blocks.filter(b=>b.kind==='mcu'||b.kind==='ic').forEach(b=>seed.push([b]));
    blocks.filter(b=>b.kind==='other').forEach(b=>{let best=null,bs=0;seed.forEach(g=>{const s=g.reduce((a,x)=>a+share(b,x),0);if(s>bs){bs=s;best=g;}});
      if(!best)best=b.a.pads.every(p=>!p.net||isRail(p.net))&&pw.length?seed[0]:(seed.find(g=>g.some(x=>x.kind==='mcu'))||seed[0]);if(!best){best=[];seed.push(best);}best.push(b);});
    pages=seed.filter(g=>g.length);
    for(let guard=0;guard<20;guard++){const cand=[];
      for(let i=0;i<pages.length;i++)for(let j=i+1;j<pages.length;j++){const s=pages[i].reduce((a,x)=>a+pages[j].reduce((c,y)=>c+share(x,y),0),0);if(s>0)cand.push([s,i,j]);}
      cand.sort((a,b)=>b[0]-a[0]);let done=false;
      for(const[,i,j]of cand){const u=pages[i].concat(pages[j]);if(fits(u)){pages[i]=u;pages.splice(j,1);done=true;break;}}
      if(!done)break;}
    const rk=g=>g.every(b=>b.kind==='power'||b.kind==='loose')?0:g.some(b=>b.kind==='mcu')?1:2;
    pages.sort((a,b)=>rk(a)-rk(b)||Math.min(...a.map(x=>x.id))-Math.min(...b.map(x=>x.id)));
  }
  // which page each signal net appears on
  const netPages=new Map();pages.forEach((g,pi)=>g.forEach(b=>b.sig.forEach(n=>{if(!netPages.has(n))netPages.set(n,new Set());netPages.get(n).add(pi);})));
  const sheets=[];const meta={fails:0};
  pages.forEach((g,pi)=>{const lay=layoutPage(P,g);
    const sh=mkSheet(B,lay,pageTitle(g));
    const cx=Math.max(0,(sh.w-lay.w)/2-15),cy=Math.max(0,(sh.h-28-lay.h)/2-15);lay.groups.forEach(gr=>grpMove(gr,cx,cy));
    lay.groups.forEach(gr=>{sh.symbols.push(...gr.syms,...gr.psyms);gr.rails.forEach(r=>sh.wires.push({a:r.a,b:r.b}));sh.nocon.push(...gr.nocon);});
    const r=routePage(sh,lay,n=>isRail(n)?[]:[...(netPages.get(n)||[])].filter(x=>x!==pi).map(x=>x+1).sort((a,b)=>a-b));meta.fails+=r.fails;
    sheets.push(sh);});
  // unused pins of large ICs
  blocks.forEach(b=>{if(!b.a)return;const un=uniq(b.a).filter(p=>!p.net).sort(cmpPin);if(uniq(b.a).length<=64||!un.length)return;
    const chunks=[];for(let i=0;i<un.length;i+=80)chunks.push(un.slice(i,i+80));const lay={groups:[],w:0,h:0};let x=15;
    chunks.forEach((ch,k)=>{const half=Math.ceil(ch.length/2);const c={ref:b.a.ref,val:b.a.val||'',fp:b.a.fp,pads:ch};
      const bx=boxSym(c,{L:ch.slice(0,half),R:ch.slice(half),T:[],B:[]},()=>null);const gr=newGrp();grpAdd(gr,bx.s);gr.nocon.push(...bx.nocon);grpBB(gr);grpMove(gr,x-gr.bb[0],22-gr.bb[1]);gr.note={s:`${b.a.ref} 미사용 핀${chunks.length>1?` ${k+1}/${chunks.length}`:''} (NC)`,p:[gr.bb[0],gr.bb[1]-4],rot:0,fx:{size:1.5,h:'left',v:'bottom'}};x=gr.bb[2]+15;lay.groups.push(gr);lay.w=Math.max(lay.w,gr.bb[2]-15);lay.h=Math.max(lay.h,gr.bb[3]-15);});
    const sh=mkSheet(B,lay,`${b.a.ref} 미사용 핀`);lay.groups.forEach(gr=>{sh.symbols.push(...gr.syms);sh.nocon.push(...gr.nocon);if(gr.note)sh.texts.push(gr.note);});sheets.push(sh);});
  sheets.forEach((s,i)=>{s.name=`${i+1}. ${s.name}`;});
  sheets.meta=meta;
  return sheets;
}
function mkSheet(B,lay,name){
  const need=[lay.w+30,lay.h+15+32];const pp=PAPERS.find(([,w,h])=>w>=need[0]&&h>=need[1])||['custom',Math.ceil(need[0]/10)*10,Math.ceil(need[1]/10)*10];
  return{file:'',name,title:B.name+' · 넷리스트로 만든 회로도',rev:'',date:'',company:'',paper:pp[0],symbols:[],wires:[],buses:[],junctions:[],nocon:[],labels:[],texts:[],lines:[],sheets:[],auto:true,w:pp[1],h:pp[2]};
}

function build(B,files){
  let sheets,auto=false;
  if(files&&files.length){sheets=files.map(f=>parseKicadSch(f.text,f.name));
    // order: root sheet (the one that references others) first
    const refd=new Set();sheets.forEach(s=>s.sheets.forEach(x=>refd.add(x.file.split('/').pop())));sheets.sort((a,b)=>(refd.has(a.file.split('/').pop())?1:0)-(refd.has(b.file.split('/').pop())?1:0));}
  else{sheets=autoSchematic(B);auto=true;}
  const c=connect(sheets,B);
  return{sheets,auto,groups:c.groups,matched:c.matched,total:c.total};
}
return{parseKicadSch,autoSchematic,connect,build,twoPin,powerSym,boxSym,finishBB,moveSym};
})();
if(typeof module!=='undefined')module.exports=SCH;
