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

/* ---------- auto-generated schematic from board connectivity ---------- */
const G=2.54;
function autoSchematic(B){
  const isP=n=>n&&B.netClass(n)!=='신호';
  const comps=B.comps.filter(c=>c.pads.some(p=>p.net));
  const sh={file:'',name:'자동 생성',title:B.name+' · 넷리스트로 만든 회로도',rev:'',date:'',company:'',symbols:[],wires:[],buses:[],junctions:[],nocon:[],labels:[],texts:[],lines:[],sheets:[],auto:true,w:0,h:0};
  const two=c=>{const u=[...new Map(c.pads.map(p=>[String(p.n),p])).values()];return u.length===2&&/^(R|C|L|FB|D|LED|F|Y|X)\d/i.test(c.ref)?u:null;};
  const mk=c=>{const t=two(c);return t?twoPin(c,t):box(c);};
  // clusters: anchor = multi-pin parts, passives attach to the anchor sharing most signal nets
  const anchors=comps.filter(c=>!two(c)).sort((a,b)=>{const r=x=>/^(J|P|CN|USB)/i.test(x.ref)?0:/^U/i.test(x.ref)?1:2;return r(a)-r(b)||b.pads.length-a.pads.length||a.ref.localeCompare(b.ref,undefined,{numeric:true});});
  const clusters=anchors.map(a=>({a,items:[]}));const loose={a:null,items:[]};
  comps.filter(two).forEach(c=>{const nets=new Set(c.pads.map(p=>p.net).filter(n=>n&&!isP(n)));let best=null,bs=0;
    clusters.forEach(k=>{const s=k.a.pads.filter(p=>nets.has(p.net)).length;if(s>bs){bs=s;best=k;}});
    if(!best){const pn=new Set(c.pads.map(p=>p.net).filter(Boolean));clusters.forEach(k=>{const s=k.a.pads.filter(p=>pn.has(p.net)&&!/GND|VSS/i.test(p.net)).length;if(s>bs){bs=s;best=k;}});}
    (best||loose).items.push(c);});
  if(loose.items.length)clusters.push(loose);
  // measure clusters first so the page can be sized to the content
  const built=clusters.map(k=>{
    const parts=[];let w=0,h=0;
    if(k.a){const s=mk(k.a);parts.push({s,dx:0,dy:0});w=s.bw;h=s.bh;}
    if(k.items.length){const col=k.items.map(mk);const colW=Math.max(...col.map(s=>s.bw));const x0=k.a?w+6:0;let y=0;const perCol=Math.max(3,Math.ceil(Math.max(h,30)/16));
      col.forEach((s,i)=>{const ci=Math.floor(i/perCol),ri=i%perCol;if(ri===0)y=0;parts.push({s,dx:x0+ci*(colW+6),dy:y});y+=s.bh+3;h=Math.max(h,y);w=Math.max(w,x0+(ci+1)*(colW+6));});}
    return{parts,w,h};
  });
  const area=built.reduce((a,b)=>a+(b.w+14)*(b.h+14),0);
  const maxW=Math.max(Math.max(...built.map(b=>b.w),0)+10,Math.min(600,Math.sqrt(area*1.45)*1.12));
  let cx=15,cy=18,rowH=0,usedW=0;
  built.forEach(({parts,w,h})=>{
    if(cx+w>maxW+15&&cx>15){cx=15;cy+=rowH+12;rowH=0;}
    parts.forEach(({s,dx,dy})=>{place(sh,s,cx+dx,cy+dy);});
    cx+=w+14;usedW=Math.max(usedW,cx);rowH=Math.max(rowH,h);
  });
  sh.w=Math.ceil((Math.max(usedW,150)+10)/10)*10;sh.h=Math.ceil((cy+rowH+34)/10)*10;
  // labels & power symbols at pin ends
  sh.symbols.forEach(s=>s.pins.forEach(p=>{
    const pad=s._c.pads.find(q=>String(q.n)===p.num);const net=pad&&pad.net;const dir=[p.p[0]-p.e[0],p.p[1]-p.e[1]];const L=Math.hypot(dir[0],dir[1])||1;const u=[dir[0]/L,dir[1]/L];
    if(!net){sh.nocon.push(p.p);return;}
    const end=[p.p[0]+u[0]*G,p.p[1]+u[1]*G];sh.wires.push({a:p.p,b:end});
    if(isP(net)&&s._two){const gnd=B.netClass(net)==='접지';sh.symbols.push(powerSym(net,end,u,gnd));}
    else{const rot=u[0]>0.5?0:u[0]<-0.5?180:u[1]<-0.5?90:270;sh.labels.push({kind:'local',s:net,p:end,rot,fx:{size:1.27,h:'left',v:'bottom'}});}
  }));
  return sh;
}
function place(sh,s,x,y){const dx=x-s.bb[0],dy=y-s.bb[1];const mv=q=>[q[0]+dx,q[1]+dy];
  s.g.forEach(g=>{if(g.pts)g.pts=g.pts.map(mv);if(g.c)g.c=mv(g.c);if(g.p)g.p=mv(g.p);});s.pins.forEach(p=>{p.p=mv(p.p);p.e=mv(p.e);});s.texts.forEach(t=>{t.p=mv(t.p);});
  s.x+=dx;s.y+=dy;s.bb=[s.bb[0]+dx,s.bb[1]+dy,s.bb[2]+dx,s.bb[3]+dy];sh.symbols.push(s);}
function finishBB(s,extra){let a1=1e9,b1=1e9,a2=-1e9,b2=-1e9;const add=q=>{a1=Math.min(a1,q[0]);b1=Math.min(b1,q[1]);a2=Math.max(a2,q[0]);b2=Math.max(b2,q[1]);};
  s.g.forEach(g=>{if(g.pts)g.pts.forEach(add);if(g.c){add([g.c[0]-g.r,g.c[1]-g.r]);add([g.c[0]+g.r,g.c[1]+g.r]);}});s.pins.forEach(p=>{add(p.p);add(p.e);});s.texts.forEach(t=>add(t.p));
  const m=extra||0;s.bb=[a1-m,b1-m,a2+m,b2+m];s.bw=s.bb[2]-s.bb[0];s.bh=s.bb[3]-s.bb[1];return s;}
function twoPin(c,pads){
  // horizontal 2-pin part centred at 0,0; pin 1 left
  const s={ref:c.ref,val:c.val,fp:c.fp,lib:'auto',power:false,x:0,y:0,rot:0,mir:'',g:[],pins:[],texts:[],_c:c,_two:true};
  const r=c.ref.toUpperCase(),poly=(pts,fill)=>s.g.push({t:'poly',pts,fill:fill||'none',w:0.254});
  let half=2.54;
  if(/^R/.test(r)||/^F\d/.test(r)){poly([[-2.54,-1],[2.54,-1],[2.54,1],[-2.54,1],[-2.54,-1]]);}
  else if(/^C/.test(r)){half=1.27;poly([[-0.5,-2],[-0.5,2]]);poly([[0.5,-2],[0.5,2]]);poly([[-1.27,0],[-0.5,0]]);poly([[0.5,0],[1.27,0]]);}
  else if(/^(L|FB)/.test(r)){const p=[];for(let k=0;k<4;k++){for(let i=0;i<=8;i++){const a=Math.PI-Math.PI*i/8;p.push([-2.54+k*1.27+0.635+0.635*Math.cos(a),-0.635*Math.sin(a)]);}}poly(p);}
  else if(/^(D|LED)/.test(r)){poly([[-1.27,-1.27],[1.27,0],[-1.27,1.27],[-1.27,-1.27]],c.kind==='led'?'none':'none');poly([[1.27,-1.27],[1.27,1.27]]);poly([[-2.54,0],[-1.27,0]]);poly([[1.27,0],[2.54,0]]);
    if(c.kind==='led'||/LED/i.test(c.val+c.fp)){poly([[0,-1.6],[1.1,-2.7]]);poly([[0.7,-2.7],[1.1,-2.7],[1.1,-2.3]]);poly([[0.8,-1.6],[1.9,-2.7]]);poly([[1.5,-2.7],[1.9,-2.7],[1.9,-2.3]]);}}
  else if(/^(Y|X)/.test(r)){poly([[-0.8,-1.6],[0.8,-1.6],[0.8,1.6],[-0.8,1.6],[-0.8,-1.6]]);poly([[-1.6,-1.6],[-1.6,1.6]]);poly([[1.6,-1.6],[1.6,1.6]]);poly([[-2.54,0],[-1.6,0]]);poly([[1.6,0],[2.54,0]]);}
  else poly([[-2.54,-1.27],[2.54,-1.27],[2.54,1.27],[-2.54,1.27],[-2.54,-1.27]]);
  // anode/cathode: pin with fn A goes left for diodes
  let p1=pads[0],p2=pads[1];if(/^(D|LED)/.test(r)){const a=pads.find(p=>/^(A|ANODE|\+)$/i.test(p.fn||''));if(a){p1=a;p2=pads.find(p=>p!==a);}else{const k=pads.find(p=>String(p.n)==='1');if(k){p2=k;p1=pads.find(p=>p!==k);}}}
  s.pins.push({num:String(p1.n),name:'',p:[-half-2.54,0],e:[-half,0],nameShow:false,numShow:false},{num:String(p2.n),name:'',p:[half+2.54,0],e:[half,0],nameShow:false,numShow:false});
  s.texts.push({s:c.ref,p:[0,-3.3],rot:0,fx:{size:1.27,h:'center',v:'middle'},role:'Reference'},{s:c.val||'',p:[0,3.3],rot:0,fx:{size:1.1,h:'center',v:'middle'},role:'Value'});
  return finishBB(s,1.5);
}
function box(c){
  const s={ref:c.ref,val:c.val,fp:c.fp,lib:'auto',power:false,x:0,y:0,rot:0,mir:'',g:[],pins:[],texts:[],_c:c};
  const pads=[...new Map(c.pads.map(p=>[String(p.n),p])).values()].sort((a,b)=>{const x=parseFloat(a.n),y=parseFloat(b.n);return!isNaN(x)&&!isNaN(y)?x-y:String(a.n).localeCompare(String(b.n));});
  const conn=/^(J|P|CN|USB|X)\d/i.test(c.ref)&&pads.length<=24;
  const L=conn?pads:pads.slice(0,Math.ceil(pads.length/2)),R=conn?[]:pads.slice(Math.ceil(pads.length/2));
  const nm=p=>p.fn||'';const cw=0.75;
  const lw=Math.max(0,...L.map(p=>nm(p).length))*cw,rw=Math.max(0,...R.map(p=>nm(p).length))*cw;
  const W=Math.max(conn?7.62:15.24,Math.ceil((lw+rw+(R.length?3:1.5))/G)*G),rows=Math.max(L.length,R.length),Hh=(rows+1)*G;
  s.g.push({t:'poly',pts:[[0,0],[W,0],[W,Hh],[0,Hh],[0,0]],fill:'background',w:0.254});
  L.forEach((p,i)=>s.pins.push({num:String(p.n),name:nm(p),p:[-G*1.2,(i+1)*G],e:[0,(i+1)*G],nameShow:!!nm(p),numShow:true,nameOff:0.5}));
  R.forEach((p,i)=>s.pins.push({num:String(p.n),name:nm(p),p:[W+G*1.2,(i+1)*G],e:[W,(i+1)*G],nameShow:!!nm(p),numShow:true,nameOff:0.5}));
  s.texts.push({s:c.ref,p:[0,-1.6],rot:0,fx:{size:1.4,h:'left',v:'bottom',bold:true},role:'Reference'},{s:c.val||'',p:[0,Hh+1.6],rot:0,fx:{size:1.2,h:'left',v:'top'},role:'Value'});
  return finishBB(s,1);
}
function powerSym(net,at,u,gnd){
  const s={ref:'#PWR',val:net,lib:'auto-power',power:true,x:at[0],y:at[1],rot:0,mir:'',g:[],pins:[{num:'1',name:net,p:at,e:at,nameShow:false,numShow:false}],texts:[]};
  // orient: ground symbols point down, supplies point up, regardless of pin side
  const x=at[0],y=at[1];
  if(gnd){const y0=y+(u[1]<-0.5?-0:0);s.g.push({t:'poly',pts:[[x,y],[x,y+1.27]],fill:'none',w:0.254},{t:'poly',pts:[[x-1.27,y+1.27],[x+1.27,y+1.27],[x,y+2.54],[x-1.27,y+1.27]],fill:'none',w:0.254});
    s.texts.push({s:net,p:[x,y+3.6],rot:0,fx:{size:1.1,h:'center',v:'top'},role:'Value'});}
  else{s.g.push({t:'poly',pts:[[x,y],[x,y-1.27]],fill:'none',w:0.254},{t:'poly',pts:[[x-1.27,y-1.27],[x+1.27,y-1.27]],fill:'none',w:0.254});
    s.texts.push({s:net,p:[x,y-2],rot:0,fx:{size:1.1,h:'center',v:'bottom'},role:'Value'});}
  return finishBB(s,0.3);
}
function build(B,files){
  let sheets,auto=false;
  if(files&&files.length){sheets=files.map(f=>parseKicadSch(f.text,f.name));
    // order: root sheet (the one that references others) first
    const refd=new Set();sheets.forEach(s=>s.sheets.forEach(x=>refd.add(x.file.split('/').pop())));sheets.sort((a,b)=>(refd.has(a.file.split('/').pop())?1:0)-(refd.has(b.file.split('/').pop())?1:0));}
  else{sheets=[autoSchematic(B)];auto=true;}
  const c=connect(sheets,B);
  return{sheets,auto,groups:c.groups,matched:c.matched,total:c.total};
}
return{parseKicadSch,autoSchematic,connect,build};
})();
if(typeof module!=='undefined')module.exports=SCH;
