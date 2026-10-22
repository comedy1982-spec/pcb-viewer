/* ---------- schematic view (shares viewer scope) ---------- */
const cvs=$('#cvs'),sctx=cvs.getContext('2d');
const SV={data:null,page:0,s:3,ox:0,oy:0,fitted:-1,w:0,h:0,hover:null,lastKey:'',fromMe:false,cv:cvs,ctx:sctx,win:window,dpr:1};
S.sch='off';
const SE={on:false,tool:'sel',sel:null,cursor:null,wire:null,vfirst:false,ghost:null,ghostType:null,ghostBoard:null,drag:null,undo:[],redo:[],erc:[],dirty:false};
function schData(){
  if(!SV.data||SV.data.board!==BD){
    if(BD.schSheets){const c=SCH.connect(BD.schSheets,BD);SV.data={sheets:BD.schSheets,auto:false,edited:true,groups:c.groups,matched:c.matched,total:c.total,board:BD};SV.page=Math.min(SV.page,BD.schSheets.length-1);SV.fitted=-1;renderSchOv();return SV.data;}
    try{SV.data=SCH.build(BD,BD.schFiles&&BD.schFiles.length?BD.schFiles:null);}
    catch(e){console.error(e);SV.data=SCH.build(BD,null);toast('회로도를 읽지 못해 넷리스트로 만든 회로도를 보여줍니다: '+e.message);}
    SV.data.board=BD;SV.page=0;SV.fitted=-1;renderSchOv();if(typeof POPS!=='undefined')POPS.forEach(P=>{P.page=0;P.fitted=-1;});
  }
  return SV.data;
}
function schColors(){const cs=getComputedStyle(document.documentElement);const v=n=>cs.getPropertyValue(n).trim();
  return{paper:v('--sch-paper'),frame:v('--sch-frame'),wire:v('--sch-wire'),body:v('--sch-body'),fill:v('--sch-fill'),text:v('--sch-text'),pin:v('--sch-pin'),label:v('--sch-label'),power:v('--sch-power'),hl:v('--sch-hl'),sel:v('--sch-sel'),bus:v('--sch-bus')};}
function schResize(V){V=V||SV;const r=V.cv.getBoundingClientRect();const d=Math.min(V.win.devicePixelRatio||1,2);if(!r.width)return;V.w=r.width;V.h=r.height;V.cv.width=Math.round(r.width*d);V.cv.height=Math.round(r.height*d);V.dpr=d;}
function schFit(V){V=V||SV;V.userMoved=false;const sh=schData().sheets[V.page];if(!sh||!V.w)return;const top=V===SV?18:0,pad=V===SV?90:30;V.s=Math.min((V.w-40)/sh.w,(V.h-pad)/sh.h);V.ox=(V.w-sh.w*V.s)/2;V.oy=(V.h-sh.h*V.s)/2+top;V.fitted=V.page;}
let schRaf=0;function drawSch(){if(schRaf)return;schRaf=requestAnimationFrame(()=>{schRaf=0;paintSch();});}
const isHL=g=>!!(S.hlNet&&g&&(g.net===S.hlNet||g.names.has(S.hlNet)));
function tx(ctx,str,x,y,size,rot,h,v,bold){
  if(!str)return;let r=((rot||0)%360+360)%360;const vert=r===90||r===270;
  ctx.save();ctx.translate(x,y);if(vert)ctx.rotate(-Math.PI/2);const k=size*1.35/20;ctx.scale(k,k);
  ctx.font=(bold?700:500)+' 20px "IBM Plex Sans KR", system-ui, sans-serif';ctx.textAlign=h||'center';ctx.textBaseline=v==='top'?'top':v==='bottom'?'alphabetic':'middle';
  ctx.fillText(str,0,0);const w=ctx.measureText(str).width*k;ctx.restore();return w;
}
function paintSch(){if(S.sch!=='off')paintSchV(SV);}
function paintSchV(V){
  if(!BD)return;const d=schData(),sh=d.sheets[V.page];if(!sh)return;
  if(V.fitted!==V.page)schFit(V);
  const C=schColors(),ctx=V.ctx,s=V.s,lw=w=>Math.max(w||0.15,1.1/s);
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,V.cv.width,V.cv.height);
  ctx.setTransform(V.dpr*s,0,0,V.dpr*s,V.dpr*V.ox,V.dpr*V.oy);ctx.lineCap='round';ctx.lineJoin='round';
  // paper and frame
  ctx.save();ctx.shadowColor='rgba(0,0,0,.18)';ctx.shadowBlur=14*V.dpr;ctx.shadowOffsetY=4*V.dpr;ctx.fillStyle=C.paper;ctx.fillRect(0,0,sh.w,sh.h);ctx.restore();
  ctx.strokeStyle=C.frame;ctx.lineWidth=lw(0.25);ctx.strokeRect(5,5,sh.w-10,sh.h-10);
  const tw=110,th=18,tx0=sh.w-5-tw,ty0=sh.h-5-th;ctx.strokeRect(tx0,ty0,tw,th);ctx.beginPath();ctx.moveTo(tx0,ty0+9);ctx.lineTo(tx0+tw,ty0+9);ctx.moveTo(tx0+70,ty0+9);ctx.lineTo(tx0+70,ty0+th);ctx.stroke();
  ctx.fillStyle=C.text;tx(ctx,sh.title||BD.name,tx0+2,ty0+4.6,2,0,'left','middle',true);tx(ctx,(d.sheets.length>1?`시트 ${V.page+1}/${d.sheets.length} · `:'')+(sh.name||''),tx0+2,ty0+13.6,1.5,0,'left','middle');
  tx(ctx,[sh.rev&&'Rev '+sh.rev,sh.date].filter(Boolean).join(' · ')||(sh.auto?'자동 생성':''),tx0+72,ty0+13.6,1.5,0,'left','middle');
  ctx.strokeStyle=C.frame;ctx.lineWidth=lw(0.15);ctx.setLineDash([1,1]);sh.lines.forEach(p=>{ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();});ctx.setLineDash([]);
  // hierarchical sheet boxes
  sh.sheets.forEach(b=>{ctx.strokeStyle=C.body;ctx.lineWidth=lw(0.2);ctx.fillStyle=C.fill;ctx.fillRect(b.p[0],b.p[1],b.size[0],b.size[1]);ctx.strokeRect(b.p[0],b.p[1],b.size[0],b.size[1]);
    ctx.fillStyle=C.text;tx(ctx,b.name,b.p[0],b.p[1]-0.8,1.5,0,'left','bottom',true);tx(ctx,b.file,b.p[0],b.p[1]+b.size[1]+0.8,1.2,0,'left','top');
    b.pins.forEach(p=>{ctx.fillStyle=isHL(p.g)?C.hl:C.label;const left=Math.abs(p.p[0]-b.p[0])<0.1;tx(ctx,p.s,p.p[0]+(left?1.2:-1.2),p.p[1],1.27,0,left?'left':'right','middle');});});
  // wires & buses
  ctx.strokeStyle=C.bus;ctx.lineWidth=lw(0.5);sh.buses.forEach(w=>{ctx.beginPath();ctx.moveTo(w.a[0],w.a[1]);ctx.lineTo(w.b[0],w.b[1]);ctx.stroke();});
  const wires=hl=>{ctx.beginPath();sh.wires.forEach(w=>{if(isHL(w.g)!==hl)return;ctx.moveTo(w.a[0],w.a[1]);ctx.lineTo(w.b[0],w.b[1]);});ctx.stroke();};
  ctx.strokeStyle=C.wire;ctx.lineWidth=lw(0.16);wires(false);
  // symbols
  const selRef=S.selRef;
  const drawSy=sy=>{
    const sel=selRef&&sy.ref===selRef,hov=V.hover&&V.hover.s===sy;
    if(sel||hov){const b=sy.bb;ctx.fillStyle=sel?'rgba(255,210,63,.25)':'rgba(120,140,160,.12)';ctx.fillRect(b[0]-0.8,b[1]-0.8,b[2]-b[0]+1.6,b[3]-b[1]+1.6);if(sel){ctx.strokeStyle=C.sel;ctx.lineWidth=lw(0.35);ctx.setLineDash([1.2,0.8]);ctx.strokeRect(b[0]-0.8,b[1]-0.8,b[2]-b[0]+1.6,b[3]-b[1]+1.6);ctx.setLineDash([]);}}
    const bodyC=sy.power?(isHL(sy.pins[0]&&sy.pins[0].g)?C.hl:C.power):C.body;
    sy.g.forEach(g=>{
      if(g.t==='text'){ctx.fillStyle=C.body;tx(ctx,g.s,g.p[0],g.p[1],g.fx.size,g.rot,g.fx.h,g.fx.v);return;}
      ctx.beginPath();if(g.t==='poly'){g.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));}else{ctx.moveTo(g.c[0]+g.r,g.c[1]);ctx.arc(g.c[0],g.c[1],g.r,0,TAU);}
      if(g.fill==='background'){ctx.fillStyle=C.fill;ctx.fill();}else if(g.fill==='outline'||g.fill==='color'){ctx.fillStyle=bodyC;ctx.fill();}
      ctx.strokeStyle=bodyC;ctx.lineWidth=lw(g.w||0.2);ctx.stroke();});
    sy.pins.forEach(p=>{if(p.hide)return;const len=Math.hypot(p.p[0]-p.e[0],p.p[1]-p.e[1]);
      const h=isHL(p.g);if(len>0.01){ctx.strokeStyle=h?C.hl:C.pin;ctx.lineWidth=lw(h?0.35:0.16);ctx.beginPath();ctx.moveTo(p.p[0],p.p[1]);ctx.lineTo(p.e[0],p.e[1]);ctx.stroke();}
      if(len<0.01)return;const ux=(p.p[0]-p.e[0])/len,uy=(p.p[1]-p.e[1])/len,horiz=Math.abs(ux)>0.5;const mx=(p.p[0]+p.e[0])/2,my=(p.p[1]+p.e[1])/2;
      if(p.numShow&&p.num){ctx.fillStyle=h?C.hl:C.pin;if(horiz)tx(ctx,p.num,mx,my-0.35,1.0,0,'center','bottom');else tx(ctx,p.num,mx-0.35,my,1.0,90,'center','bottom');}
      if(p.nameShow&&p.name){ctx.fillStyle=h?C.hl:C.text;const off=p.nameOff>0?p.nameOff:0;
        if(off>0){const ax=p.e[0]-ux*(off+0.2),ay=p.e[1]-uy*(off+0.2);if(horiz)tx(ctx,p.name,ax,ay,1.15,0,ux<0?'left':'right','middle');else tx(ctx,p.name,ax,ay,1.15,90,uy>0?'left':'right','middle');}
        else{if(horiz)tx(ctx,p.name,mx,my+0.35,1.0,0,'center','top');else tx(ctx,p.name,mx+0.35,my,1.0,90,'center','top');}}});
    sy.texts.forEach(t=>{ctx.fillStyle=sy.power?bodyC:t.role==='Reference'?C.text:C.text;let r=((t.rot%180)+180)%180;tx(ctx,t.s,t.p[0],t.p[1],t.fx.size,r===90?90:0,t.fx.h,t.fx.v,t.role==='Reference'&&!sy.power);});
  };
  sh.symbols.forEach(drawSy);
  // highlighted wires on top
  ctx.strokeStyle=C.hl;ctx.lineWidth=lw(0.4);wires(true);
  // junctions & no-connects
  sh.junctions.forEach(j=>{ctx.fillStyle=C.wire;ctx.beginPath();ctx.arc(j[0],j[1],0.5,0,TAU);ctx.fill();});
  ctx.strokeStyle=C.body;ctx.lineWidth=lw(0.2);sh.nocon.forEach(p=>{const a=0.65;ctx.beginPath();ctx.moveTo(p[0]-a,p[1]-a);ctx.lineTo(p[0]+a,p[1]+a);ctx.moveTo(p[0]+a,p[1]-a);ctx.lineTo(p[0]-a,p[1]+a);ctx.stroke();});
  // labels
  sh.labels.forEach(l=>{const h=isHL(l.g);const col=h?C.hl:C.label;ctx.fillStyle=col;ctx.strokeStyle=col;const sz=l.fx.size||1.27;const r=((l.rot%360)+360)%360;
    const right=r===0||r===90,vert=r===90||r===270;
    if(l.kind==='local'){const w=tx(ctx,l.s,l.p[0]+(vert?0:right?0.3:-0.3)+(vert?-0.3:0),l.p[1]+(vert?(r===90?-0.3:0.3):-0.3),sz,vert?90:0,right?'left':'right','bottom',h);l._w=w;}
    else{ctx.save();ctx.translate(l.p[0],l.p[1]);if(vert)ctx.rotate(-Math.PI/2);const dirR=vert?(r===90):right;const k=sz*1.35/20;ctx.font='600 20px "IBM Plex Sans KR", system-ui, sans-serif';const w=ctx.measureText(l.s).width*k;const H=sz*1.15,pad=sz*0.5,tip=H/2;
      const sg=dirR?1:-1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(sg*tip,-H/2);ctx.lineTo(sg*(tip+w+pad*2),-H/2);ctx.lineTo(sg*(tip+w+pad*2),H/2);ctx.lineTo(sg*tip,H/2);ctx.closePath();ctx.lineWidth=lw(0.15);ctx.stroke();
      ctx.scale(k,k);ctx.textAlign=dirR?'left':'right';ctx.textBaseline='middle';ctx.fillText(l.s,sg*(tip+pad)/k,0);let xw=0;
      if(l.xr){ctx.font='500 16px "IBM Plex Sans KR", system-ui, sans-serif';const t='['+l.xr+']';xw=ctx.measureText(t).width*k+0.6;ctx.fillText(t,sg*(tip+w+pad*2+0.6)/k,0);}ctx.restore();l._w=w+tip+pad*2+xw;}});
  // texts
  ctx.fillStyle=C.text;sh.texts.forEach(t=>{String(t.s).split('\n').forEach((line,i)=>tx(ctx,line,t.p[0],t.p[1]+i*t.fx.size*1.5,t.fx.size,t.rot,t.fx.h==='center'?'left':t.fx.h,'bottom'));});
  if(V===SV&&typeof SE!=='undefined'&&SE.on)seOverlay(ctx,sh,V,C,lw,drawSy);
}
function schS2W(V,px,py){return[(px-V.ox)/V.s,(py-V.oy)/V.s];}
function schHit(V,x,y){
  const sh=schData().sheets[V.page];if(!sh)return null;const tol=Math.max(0.5,5/V.s);
  for(const sy of sh.symbols)for(const p of sy.pins){if(Math.hypot(p.p[0]-x,p.p[1]-y)<=tol*0.9||PCB.segDist(x,y,p.p,p.e)<=tol*0.5)return sy.power?{type:'net',g:p.g}:{type:'pin',s:sy,p,g:p.g};}
  for(const l of sh.labels){const w=l._w||l.s.length*(l.fx.size||1.27)*0.7,sz=l.fx.size||1.27;const r=((l.rot%360)+360)%360;let bb;
    if(r===0)bb=[l.p[0],l.p[1]-sz*1.4,l.p[0]+w+0.6,l.p[1]+sz*0.6];else if(r===180)bb=[l.p[0]-w-0.6,l.p[1]-sz*1.4,l.p[0],l.p[1]+sz*0.6];else if(r===90)bb=[l.p[0]-sz*1.4,l.p[1]-w-0.6,l.p[0]+sz*0.6,l.p[1]];else bb=[l.p[0]-sz*1.4,l.p[1],l.p[0]+sz*0.6,l.p[1]+w+0.6];
    if(x>=bb[0]&&x<=bb[2]&&y>=bb[1]&&y<=bb[3])return{type:'net',g:l.g};}
  for(const w of sh.wires)if(PCB.segDist(x,y,w.a,w.b)<=tol*0.6)return{type:'net',g:w.g};
  let best=null,ba=1e18;for(const sy of sh.symbols){const b=sy.bb;if(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]){const a=(b[2]-b[0])*(b[3]-b[1]);if(a<ba){ba=a;best=sy;}}}
  if(best)return best.power?{type:'net',g:best.pins[0]&&best.pins[0].g}:{type:'sym',s:best};
  return null;
}
function schTip(h){
  if(!h)return'';const net=h.g&&h.g.net;const n=net?` <span class="net">${esc(net)}</span>`:'';
  if(h.type==='sym'){const c=BD.byRef[h.s.ref];return`<b>${esc(h.s.ref)}</b> ${esc(h.s.val)}${c?'':' <span class="cls">보드에 없음</span>'}`;}
  if(h.type==='pin')return`<b>${esc(h.s.ref)}.${esc(h.p.num)}</b> ${esc(h.p.name&&h.p.name!=='~'?h.p.name:'')}${n}`;
  if(h.type==='net')return`넷${n}`;return'';
}
function schApply(h,V){
  (V||SV).fromMe=true;
  if(!h){S.selRef=null;S.hlNet=null;}
  else if(h.type==='sym'){S.selRef=BD.byRef[h.s.ref]?h.s.ref:null;S.hlNet=null;if(!S.selRef)toast(`${h.s.ref}는 보드에 없는 부품입니다.`);}
  else if(h.type==='pin'){S.selRef=BD.byRef[h.s.ref]?h.s.ref:null;S.hlNet=h.g&&h.g.net||null;}
  else{S.selRef=null;S.hlNet=h.g&&h.g.net||null;}
  S.tab='sel';refresh(true);if(!V||V===SV)schInfoPaint(h);
}
/* floating info card on the schematic: what the clicked part is, its datasheet keys and every pin → net */
function schInfoPaint(h){const el=$('#schInfo');if(!el)return;
  if(!h||h.type==='net'){el.hidden=true;el.innerHTML='';return;}
  const sy=h.s,c=BD.byRef[sy.ref]||null,val=(c&&c.val)||sy.val||'',mpn=(c&&c.mpn)||'',info=typeof PARTS!=='undefined'?(PARTS.find(mpn)||PARTS.find(val)):null;
  const pins=c&&c.pads&&c.pads.length?c.pads.map(p=>({n:p.n,name:p.fn||'',net:p.net||''})):sy.pins.map(p=>({n:p.num,name:p.name&&p.name!=='~'?p.name:'',net:p.g&&p.g.net||''}));
  const selN=h.type==='pin'?String(h.p.num):null;
  const kv=[['풋프린트',c&&c.fp],['부품 번호',mpn],['제조사',info&&info.mfr]].filter(x=>x[1]).concat(info?info.specs.slice(0,6):[]);
  const links=typeof PARTS!=='undefined'?PARTS.links(info,mpn||val).slice(0,2):[];
  el.innerHTML=`<div class="si-h"><b>${esc(sy.ref)}</b>${c?'':'<span class="cls">보드에 없음</span>'}<button class="x" data-si-x aria-label="닫기">✕</button></div>
    <div class="si-v">${esc(val||'값 정보 없음')}</div>${c&&c.desc?`<div class="si-d">${esc(c.desc)}</div>`:''}
    ${kv.length?`<dl>${kv.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:''}
    ${links.length?`<div class="si-l">${links.map(([t,u])=>`<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}</div>`:''}
    <div class="si-s">핀 ${pins.length}개</div><table><tbody>${pins.map(p=>`<tr${selN!=null&&String(p.n)===selN?' class="on"':''}><td>${esc(p.n!=null?p.n:'')}</td><td>${esc(p.name)}</td><td class="n">${p.net?esc(p.net):'<span class="cls">미연결</span>'}</td></tr>`).join('')}</tbody></table>`;
  el.hidden=false;const on=el.querySelector('tr.on');if(on)on.scrollIntoView({block:'nearest'});
  el.querySelector('[data-si-x]').onclick=()=>{el.hidden=true;};}
function schFocus(V){V=V||SV;
  const key=(S.selRef||'')+'|'+(S.hlNet||'');if(key===V.lastKey)return;V.lastKey=key;
  if(V.fromMe){V.fromMe=false;return;}if(!S.selRef&&!S.hlNet)return;
  const d=schData();let pg=-1,pt=null;
  const find=(i)=>{const sh=d.sheets[i];if(S.selRef){const sy=sh.symbols.find(x=>x.ref===S.selRef);if(sy)return[(sy.bb[0]+sy.bb[2])/2,(sy.bb[1]+sy.bb[3])/2];}
    if(S.hlNet){const w=sh.wires.find(x=>isHL(x.g));if(w)return w.a;const l=sh.labels.find(x=>isHL(x.g));if(l)return l.p;const p=sh.symbols.flatMap(x=>x.pins).find(x=>isHL(x.g));if(p)return p.p;}return null;};
  pt=find(V.page);if(pt)pg=V.page;else for(let i=0;i<d.sheets.length&&!pt;i++){pt=find(i);if(pt)pg=i;}
  if(!pt)return;if(pg!==V.page){V.page=pg;schFit(V);if(V===SV)renderSchOv();else if(V.sync)V.sync();}
  const sh=d.sheets[V.page],fitS=Math.min((V.w-40)/sh.w,(V.h-90)/sh.h);
  if(V.s<fitS*1.5){V.s=fitS*(S.selRef?2.6:2);V.ox=V.w/2-pt[0]*V.s;V.oy=V.h/2-pt[1]*V.s;return;}
  const sx=V.ox+pt[0]*V.s,sy=V.oy+pt[1]*V.s;if(sx<40||sy<60||sx>V.w-40||sy>V.h-40){V.ox=V.w/2-pt[0]*V.s;V.oy=V.h/2-pt[1]*V.s;}
}
(function(){
  const pts=new Map();let start=null,moved=0,pinch=0,hq=null,hraf=0,edPtr=null;
  const pos=e=>{const r=cvs.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const zoomAt=(px,py,f)=>{SV.userMoved=true;const[wx,wy]=schS2W(SV,px,py);SV.s=Math.max(0.3,Math.min(80,SV.s*f));SV.ox=px-wx*SV.s;SV.oy=py-wy*SV.s;drawSch();};
  cvs.addEventListener('pointerdown',e=>{cvs.setPointerCapture(e.pointerId);
    if(SE.on&&e.button===0&&pts.size===0){const[px,py]=pos(e);if(seDown(...schS2W(SV,px,py))){edPtr=e.pointerId;return;}}pts.set(e.pointerId,pos(e));moved=0;start=pos(e);cvs.classList.add('drag');if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cvs.addEventListener('pointermove',e=>{const p=pos(e);
    if(SE.on){const w=schS2W(SV,p[0],p[1]);if(edPtr===e.pointerId){seDragMove(w);return;}seCursor(w);}
    if(pts.has(e.pointerId)){const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);
      if(pts.size===1){SV.userMoved=true;SV.ox+=p[0]-prev[0];SV.oy+=p[1]-prev[1];moved+=Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]);drawSch();}
      else if(pts.size===2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/pinch);pinch=d;moved=99;}tip.hidden=true;return;}
    hq=p;if(!hraf)hraf=requestAnimationFrame(()=>{hraf=0;if(!hq)return;const[x,y]=schS2W(SV,hq[0],hq[1]);const h=schHit(SV,x,y);const was=SV.hover&&SV.hover.s;SV.hover=h&&h.type==='sym'?h:null;if((SV.hover&&SV.hover.s)!==was)drawSch();
      if(h){const vr=vp.getBoundingClientRect(),cr=cvs.getBoundingClientRect();tip.innerHTML=schTip(h);tip.hidden=false;tip.style.left=(hq[0]+cr.left-vr.left)+'px';tip.style.top=(hq[1]+cr.top-vr.top)+'px';cvs.style.cursor='pointer';}else{tip.hidden=true;cvs.style.cursor='';}});});
  const end=e=>{if(edPtr===e.pointerId){edPtr=null;seUp();return;}if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);cvs.classList.remove('drag');if(pts.size===0&&moved<5&&start&&e.type==='pointerup'){const[x,y]=schS2W(SV,start[0],start[1]);if(SE.on)seClick([x,y]);else schApply(schHit(SV,x,y),SV);}if(pts.size<2)pinch=0;};
  cvs.addEventListener('pointerup',end);cvs.addEventListener('pointercancel',end);
  cvs.addEventListener('pointerleave',()=>{hq=null;tip.hidden=true;if(SV.hover){SV.hover=null;drawSch();}});
  cvs.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pos(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  cvs.addEventListener('dblclick',e=>{if(SE.on){const[px,py]=pos(e);seDbl(schS2W(SV,px,py));return;}schFit();drawSch();});
})();
function renderSchOv(){
  if(!SV.data)return;const d=SV.data;
  $('#schPages').innerHTML=`<span class="pill side-badge">회로도</span>`+(d.sheets.length>1?d.sheets.map((s,i)=>`<button class="pill vbtn${i===SV.page?' on':''}" data-page="${i}">${esc(s.name||'시트 '+(i+1))}</button>`).join(''):'');
  $('#schNote').innerHTML=d.edited?`<span class="pill hint2">편집한 회로도입니다${SE.dirty?' · 보드와 다름 — 보드에 반영(F8)':''}.</span>`:d.auto?'<span class="pill hint2">넷리스트로 자동 생성한 회로도입니다. .kicad_sch를 불러오면 실제 회로도를 보여줍니다.</span>'
    :(d.matched<d.total?`<span class="pill hint2">보드 부품과 연결된 넷 ${d.matched}/${d.total}개</span>`:'');
}
$('#schPages').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;SV.page=+b.dataset.page;schFit();renderSchOv();drawSch();});
$('#schFitBtn').addEventListener('click',()=>{schFit();drawSch();});
$('#schPop').addEventListener('click',()=>openPop('sch'));
$('#schOpen').addEventListener('click',()=>$('#schFile').click());
$('#schFile').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{const list=[];for(const f of files)list.push({name:f.name,text:await f.text()});const t=SCH.build(BD,list);BD.schFiles=list;BD.schSheets=null;if(SE.on)seEnd();SE.undo=[];SE.redo=[];SV.data=null;schData();drawSch();
    toast(`회로도 ${t.sheets.length}장을 붙였습니다 · 보드 부품과 연결된 넷 ${t.matched}/${t.total}개`+(t.matched<t.total*0.5?' · 부품 참조가 보드와 많이 다릅니다.':''));}
  catch(err){console.error(err);toast('회로도를 읽지 못했습니다: '+(err.message||err));}});
$('#splitBtn').addEventListener('click',()=>{S.sch=S.sch==='split'?'off':'split';setView('__keep');});

/* ---------- schematic editing (Eeschema-style tools and hotkeys) ---------- */
const SE_TOOLS=[['sel','선택','Esc'],['move','이동','M'],['drag','끌기','G'],['wire','배선','W'],['label','라벨','L'],['glabel','글로벌 라벨','Ctrl+L'],['power','전원','P'],['add','부품','A'],['nc','NC','Q'],['del','삭제','Del']];
const SE_ACTS=[['rot','회전','R'],['mirx','좌우 반전','X'],['miry','상하 반전','Y'],['props','속성','E'],['undo','실행 취소','Ctrl+Z'],['redo','다시 실행','Ctrl+Y']];
const seSheets=()=>BD.schSheets;
const seSh=()=>BD.schSheets&&BD.schSheets[SV.page];
function seBegin(){
  const d=schData();if(!BD.schSheets){BD.schSheets=d.sheets;d.auto=false;d.edited=true;}
  SE.on=true;SE.tool='sel';SE.sel=null;seRefresh(false);seBar();renderSchOv();drawSch();
}
function seEnd(){SE.on=false;SE.wire=null;SE.ghost=null;SE.drag=null;seBar();renderSchOv();drawSch();}
// recompute connectivity, ERC and the board-difference count after every change
function seRefresh(changed){
  const sh=seSheets();if(!sh)return;if(!SV.data)schData();
  SE.erc=SCHEDIT.erc(sh);const c=SCH.connect(sh,BD);Object.assign(SV.data,{sheets:sh,groups:c.groups,matched:c.matched,total:c.total,auto:false,edited:true,board:BD});
  if(changed){SE.dirty=true;SE.diff=null;}
  if(typeof POPS!=='undefined')POPS.forEach(P=>{if(P.kind==='sch'&&P.draw)P.draw();});
  seStat();
}
function seCommit(fn){const before=SCHEDIT.snapshot(seSheets());const r=fn(seSh());if(r===false)return false;SE.undo.push(before);if(SE.undo.length>80)SE.undo.shift();SE.redo=[];seRefresh(true);drawSch();return true;}
function seSwap(from,to){if(!from.length)return;to.push(SCHEDIT.snapshot(seSheets()));BD.schSheets=SCHEDIT.restore(from.pop());SE.sel=null;seRefresh(true);drawSch();}
const seTol=()=>Math.max(0.6,6/SV.s);
// item under a point: label, wire, junction / NC, symbol (smallest box)
function seHit(p){
  const sh=seSh();if(!sh)return null;const[x,y]=p,tol=seTol();
  for(const l of sh.labels){const w=l._w||l.s.length*1.27*0.95,sz=1.27;const r=((l.rot%360)+360)%360;let bb;
    if(r===0)bb=[l.p[0],l.p[1]-sz*1.4,l.p[0]+w+0.6,l.p[1]+sz*0.6];else if(r===180)bb=[l.p[0]-w-0.6,l.p[1]-sz*1.4,l.p[0],l.p[1]+sz*0.6];else if(r===90)bb=[l.p[0]-sz*1.4,l.p[1]-w-0.6,l.p[0]+sz*0.6,l.p[1]];else bb=[l.p[0]-sz*1.4,l.p[1],l.p[0]+sz*0.6,l.p[1]+w+0.6];
    if(x>=bb[0]&&x<=bb[2]&&y>=bb[1]&&y<=bb[3])return{type:'label',o:l};}
  const nc=sh.nocon.find(q=>Math.hypot(q[0]-x,q[1]-y)<tol);if(nc)return{type:'nc',o:nc};
  const w=SCHEDIT.hitWire(sh,x,y,tol*0.7);if(w)return{type:'wire',o:w};
  let best=null,ba=1e18;for(const s of sh.symbols){const b=s.bb;if(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]){const a=(b[2]-b[0])*(b[3]-b[1]);if(a<ba){ba=a;best=s;}}}
  return best?{type:'sym',o:best}:null;
}
const seTarget=()=>SE.sel||(SE.cursor&&seHit(SE.cursor));
function seSetTool(t){
  SE.tool=t;SE.wire=null;SE.drag=null;if(t!=='add'){SE.ghost=null;}
  if((t==='move'||t==='drag')){const h=seTarget();if(h&&(h.type==='sym'||h.type==='label')){seStartDrag(h,SE.cursor||[0,0],t);}else{toast('옮길 부품이나 라벨 위에 마우스를 두고 누르세요.');SE.tool='sel';}}
  if(t==='add')sePalette();
  seBar();drawSch();
}
/* drag / move: restore the snapshot and re-apply the whole offset each frame */
function seStartDrag(h,at,mode){const sh=seSh();const list=h.type==='sym'?sh.symbols:sh.labels;SE.drag={json:SCHEDIT.snapshot(seSheets()),page:SV.page,kind:h.type,idx:list.indexOf(h.o),from:SCHEDIT.sp(at),d:[0,0],mode:mode||'drag',moved:false};}
function seDragMove(w){const D=SE.drag;if(!D)return;const p=SCHEDIT.sp(w);const d=[p[0]-D.from[0],p[1]-D.from[1]];if(SCHEDIT.same(d,D.d))return;D.d=d;D.moved=true;
  const sheets=SCHEDIT.restore(D.json);const sh=sheets[D.page];
  if(D.kind==='sym'){const s=sh.symbols[D.idx];if(D.mode==='move')SCHEDIT.moveSym(s,d[0],d[1]);else SCHEDIT.drag(sh,s,d[0],d[1]);SE.sel={type:'sym',o:s};}
  else{const l=sh.labels[D.idx];SCHEDIT.moveLabel(l,d[0],d[1]);SE.sel={type:'label',o:l};}
  BD.schSheets=sheets;seRefresh(false);drawSch();}
function seDropDrag(){const D=SE.drag;if(!D)return;SE.drag=null;if(D.moved){SE.undo.push(D.json);SE.redo=[];SCHEDIT.cleanWires(seSh());seRefresh(true);}if(SE.tool==='move'||SE.tool==='drag')SE.tool='sel';seBar();drawSch();}
function seDown(x,y){
  if(SE.tool==='sel'){const h=seHit([x,y]);if(h&&(h.type==='sym'||h.type==='label')){SE.sel=h;seStartDrag(h,[x,y],'drag');SE.drag.press=true;drawSch();return true;}}
  return false;
}
function seUp(){const D=SE.drag;if(D&&D.press&&!D.moved){SE.drag=null;drawSch();return;}seDropDrag();}
function seCursor(w){SE.cursor=w;if(SE.drag&&!SE.drag.press){seDragMove(w);return;}if(SE.ghost){const a=SCHEDIT.anchor(SE.ghost),p=SCHEDIT.sp(w);SCHEDIT.moveSym(SE.ghost,p[0]-a[0],p[1]-a[1]);}drawSch();}
async function seClick(w){
  const p=SCHEDIT.sp(w);const sh=seSh();if(!sh)return;
  if(SE.drag){seDropDrag();return;}
  switch(SE.tool){
    case'sel':{SE.sel=seHit(w);const h=SE.sel;if(h&&h.type==='sym'&&!h.o.power&&BD.byRef[h.o.ref]){S.selRef=h.o.ref;S.hlNet=null;SV.fromMe=true;refresh(true);}drawSch();break;}
    case'wire':{
      if(!SE.wire){SE.wire={from:p};drawSch();break;}
      const a=SE.wire.from;if(SCHEDIT.same(a,p)){SE.wire=null;drawSch();break;}
      seCommit(s=>{SCHEDIT.addWire(s,a,p,SE.vfirst);});
      // finishing on a pin / wire / label ends the wire, like Eeschema
      const hitEnd=sh.symbols.some(s=>s.pins.some(q=>SCHEDIT.same(q.p,p)))||sh.labels.some(l=>SCHEDIT.same(l.p,p))||seSh().wires.filter(x=>SCHEDIT.same(x.a,p)||SCHEDIT.same(x.b,p)||SCHEDIT.onSeg(p,x.a,x.b)).length>1;
      SE.wire=hitEnd?null:{from:p};drawSch();break;}
    case'label':case'glabel':{const g=seGroupAt(p);const name=await seAsk(SE.tool==='glabel'?'글로벌 라벨 이름':'넷 라벨 이름',g&&g.net&&!/^Net-/.test(g.net)?g.net:'',seNetNames());if(!name)break;
      const w2=SCHEDIT.hitWire(sh,p[0],p[1],0.2);const rot=w2&&Math.abs(w2.a[0]-w2.b[0])<1e-3?90:0;seCommit(s=>{SCHEDIT.addLabel(s,SE.tool==='glabel'?'global':'local',name,p,rot);});break;}
    case'power':{const name=await seAsk('전원 넷 (예: +3V3, +12V, GND)','+3V3',seNetNames().filter(n=>BD.netClass(n)!=='신호').concat(['GND','+3V3','+5V','+12V']));if(!name)break;
      const gnd=/^(GND|AGND|DGND|PGND|VSS|0V)$/i.test(name);seCommit(s=>{SCHEDIT.addPower(s,name,p,gnd?1:3,gnd);});break;}
    case'nc':{const pe=SCHEDIT.hitPinEnd(sh,p,seTol());if(!pe){toast('NC는 핀 끝에 놓습니다.');break;}seCommit(s=>{SCHEDIT.addNoConnect(s,pe.pin.p);});break;}
    case'del':{const h=seHit(w);if(h)seCommit(s=>SCHEDIT.remove(s,h.o));break;}
    case'add':{if(!SE.ghost)break;const g=SE.ghost;SE.ghost=null;seCommit(s=>{s.symbols.push(g);});SE.sel={type:'sym',o:g};
      if(SE.ghostBoard){SE.tool='sel';}else{SE.ghost=SCHEDIT.newPart(SE.ghostType,SCHEDIT.nextRef(seSheets(),SCHEDIT.LIB.find(x=>x.id===SE.ghostType).prefix,BD),p,SE.ghostVert);}
      seBar();drawSch();break;}
    case'move':case'drag':break;
  }
}
function seDbl(w){if(SE.tool==='wire'){SE.wire=null;drawSch();return;}const h=seHit(w);if(h){SE.sel=h;seProps();}}
function seGroupAt(p){const sh=seSh();const w=SCHEDIT.hitWire(sh,p[0],p[1],0.3);if(w)return w.g;const pe=SCHEDIT.hitPinEnd(sh,p,0.3);return pe&&pe.pin.g;}
function seNetNames(){return BD.netOrder.slice();}
// one-line prompt / small forms inside the schematic overlay
function seDialog(html,onOk){
  let el=$('#seDlg');if(!el){el=document.createElement('div');el.id='seDlg';el.className='sedlg';$('#schOv').appendChild(el);}
  el.innerHTML=`<form class="sedlg-in">${html}<div class="acts"><button type="submit" class="btn primary sm">확인</button><button type="button" class="btn sm ghost" data-x>취소</button></div></form>`;el.hidden=false;
  return new Promise(res=>{const f=el.querySelector('form');const close=v=>{el.hidden=true;res(v);};
    f.addEventListener('submit',e=>{e.preventDefault();close(onOk(f));});f.querySelector('[data-x]').addEventListener('click',()=>close(null));
    f.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close(null);}});
    const fi=f.querySelector('input,select');if(fi){fi.focus();if(fi.select)fi.select();}});
}
function seAsk(label,def,opts){const id='seo'+Math.random().toString(36).slice(2,7);
  return seDialog(`<label class="fld"><span>${esc(label)}</span><input name="v" value="${esc(def||'')}" list="${id}" autocomplete="off"></label><datalist id="${id}">${[...new Set(opts||[])].map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`,f=>f.v.value.trim()||null);}
function sePalette(){
  const sh=seSheets();const placed=new Set(sh.flatMap(s=>s.symbols.map(x=>x.ref)));const loose=BD.comps.filter(c=>!placed.has(c.ref)&&c.pads.length);
  seDialog(`<b>부품 추가</b><div class="sepal">${SCHEDIT.LIB.map(l=>`<label><input type="radio" name="t" value="${l.id}"${l.id==='R'?' checked':''}> ${esc(l.label)} <span class="cls">${esc(l.val)} · ${esc(l.fp)}</span></label>`).join('')}
    ${loose.length?`<div class="sub">보드에만 있는 부품</div>`+loose.map(c=>`<label><input type="radio" name="t" value="@${esc(c.ref)}"> ${esc(c.ref)} <span class="cls">${esc(c.val)}</span></label>`).join(''):''}</div>
    <label class="chkl"><input type="checkbox" name="vert"> 세로로 놓기</label>`,f=>({t:f.t.value,vert:f.vert.checked})).then(r=>{
    if(!r){SE.tool='sel';seBar();return;}const at=SE.cursor||[SV.data.sheets[SV.page].w/2,SV.data.sheets[SV.page].h/2];
    if(r.t[0]==='@'){const c=BD.byRef[r.t.slice(1)];SE.ghost=SCHEDIT.boardPart(c,at);SE.ghostBoard=c.ref;}
    else{SE.ghostType=r.t;SE.ghostVert=r.vert;SE.ghostBoard=null;SE.ghost=SCHEDIT.newPart(r.t,SCHEDIT.nextRef(sh,SCHEDIT.LIB.find(x=>x.id===r.t).prefix,BD),at,r.vert);}
    SE.tool='add';seBar();drawSch();});
}
function seProps(){
  const h=seTarget();if(!h){toast('속성을 볼 항목 위에 마우스를 두거나 선택하세요.');return;}
  if(h.type==='label')return seAsk('라벨 이름',h.o.s,seNetNames()).then(v=>{if(v&&v!==h.o.s){const i=seSh().labels.indexOf(h.o);seCommit(s=>{s.labels[i].s=v;});}});
  if(h.type!=='sym')return;const s=h.o;
  if(s.power)return seAsk('전원 넷 이름',s.val,seNetNames()).then(v=>{if(v&&v!==s.val){const i=seSh().symbols.indexOf(s);seCommit(sh=>{const o=sh.symbols[i];o.val=v;o.pins[0].name=v;o.texts.forEach(t=>{t.s=v;});});}});
  const fps=Object.keys(PCB.FP);
  seDialog(`<b>${esc(s.ref)} 속성</b><div class="thgrid"><label class="fld"><span>참조 (Reference)</span><input name="ref" value="${esc(s.ref)}"></label><label class="fld"><span>값 (Value)</span><input name="val" value="${esc(s.val||'')}"></label>
    <label class="fld"><span>풋프린트</span><select name="fp"><option value="">(없음)</option>${fps.map(f=>`<option${f===(s.fp||'')?' selected':''}>${esc(f)}</option>`).join('')}</select></label></div>
    ${BD.byRef[s.ref]?'<p class="lead" style="margin:0">값을 바꾸면 "보드에 반영"할 때 보드 부품 값도 바뀝니다. 참조를 바꾸면 보드 부품과의 연결이 끊어집니다.</p>':'<p class="lead" style="margin:0">보드에 없는 새 부품입니다. "보드에 반영"하면 이 풋프린트로 보드 밖 오른쪽에 놓입니다.</p>'}`,
    f=>({ref:f.ref.value.trim(),val:f.val.value.trim(),fp:f.fp.value})).then(r=>{if(!r)return;const i=seSh().symbols.indexOf(s);
      if(r.ref!==s.ref&&seSheets().some(x=>x.symbols.some(y=>y.ref===r.ref&&y!==s))){toast(`${r.ref}는 이미 있는 참조입니다.`);return;}
      seCommit(sh=>{const o=sh.symbols[i];o.texts.forEach(t=>{if(t.role==='Reference'&&t.s===o.ref)t.s=r.ref;if(t.role==='Value')t.s=r.val;});o.ref=r.ref;o.val=r.val;o.fp=r.fp;});});
}
function seAction(a){
  if(a==='undo')return seSwap(SE.undo,SE.redo);if(a==='redo')return seSwap(SE.redo,SE.undo);
  if(a==='props')return seProps();
  if(SE.ghost&&(a==='rot'||a==='mirx'||a==='miry')){if(a==='rot')SCHEDIT.rotate(SE.ghost);else SCHEDIT.mirror(SE.ghost,a==='miry'?'y':'x');SE.ghostVert=!SE.ghostVert;drawSch();return;}
  const h=seTarget();if(!h||h.type!=='sym'){if(h&&h.type==='label'&&a==='rot'){const i=seSh().labels.indexOf(h.o);seCommit(s=>{const l=s.labels[i];l.rot=((l.rot||0)+90)%360;l.fx.h=l.rot===180||l.rot===270?'right':'left';});}return;}
  const i=seSh().symbols.indexOf(h.o);
  seCommit(s=>{const o=s.symbols[i];if(a==='rot')SCHEDIT.rotateKeep(s,o);else SCHEDIT.mirrorKeep(s,o,a==='miry'?'y':'x');SE.sel={type:'sym',o};});
}
/* back-annotation: Update PCB from Schematic (F8) */
function seAnnotate(){
  const res=SCHEDIT.annotate(seSheets(),BD);const ch=res.changes;
  const nets=ch.filter(c=>c.kind==='net'),vals=ch.filter(c=>c.kind==='value'),adds=ch.filter(c=>c.kind==='add');
  const row=c=>c.kind==='net'?`<li><span class="mono">${esc(c.ref)}.${esc(c.pin)}</span> ${esc(c.from||'(연결 없음)')} → <b>${esc(c.to||'(연결 없음)')}</b></li>`:c.kind==='value'?`<li><span class="mono">${esc(c.ref)}</span> 값 ${esc(c.from)} → <b>${esc(c.to)}</b></li>`:`<li><span class="mono">${esc(c.ref)}</span> 새 부품 <b>${esc(c.val)}</b> · ${esc(c.fp||'풋프린트 없음')}</li>`;
  seDialog(`<b>보드에 반영 (Update PCB from Schematic)</b>
    <p class="lead" style="margin:0">핀 넷 ${nets.length}건 · 값 ${vals.length}건 · 새 부품 ${adds.length}개${res.missing.length?` · 회로도에 없는 보드 부품 ${res.missing.length}개(${esc(res.missing.slice(0,6).join(', '))}) 유지`:''}${res.conflicts.length?` · 이름이 둘 이상인 넷 ${res.conflicts.length}개(첫 이름 사용)`:''}</p>
    ${ch.length?`<ul class="sediff">${ch.slice(0,60).map(row).join('')}${ch.length>60?`<li>… 외 ${ch.length-60}건</li>`:''}</ul>`:'<p class="lead">보드와 회로도가 같습니다.</p>'}
    <p class="lead" style="margin:0">트랙·비아는 그대로 두므로 넷이 바뀐 동박은 래츠네스트와 DRC로 확인하세요.</p>`,()=>true).then(ok=>{
    if(!ok||!ch.length)return;
    const r=seApplyAnnotation(res);
    toast(`보드에 ${r.n}건을 반영했습니다.`+(r.added.length?` 새 부품 ${r.added.join(', ')}을 ${r.out.length?'보드 오른쪽 바깥(빈 자리 없음)':'보드의 빈 자리'}에 놓았습니다. 배선은 래츠네스트로 표시됩니다.`:''));});
}
function seApplyAnnotation(res){
  const ch=res.changes,adds=ch.filter(c=>c.kind==='add');
  let k=0;const n=SCHEDIT.applyAnnotation(BD,res,c=>seAddBoardPart(c,k++));
  PINREC.relink(BD);if(typeof PCBEDIT!=='undefined'&&BD._pe)PCBEDIT.rebuildNets(BD);const added=adds.map(a=>a.ref).filter(r=>BD.byRef[r]);if(added.length){S.selRef=added[0];SV.fromMe=true;}seBoardChanged();SE.dirty=false;seRefresh(false);renderSchOv();
  if(typeof PE!=='undefined'&&PE.on)peRecalc(true);
  return{n,nets:ch.filter(c=>c.kind==='net').length,vals:ch.filter(c=>c.kind==='value').length,added,out:adds.filter(a=>a.placed==='outside').map(a=>a.ref)};
}
// a new schematic part becomes a board footprint parked to the right of the board (like Eeschema → Pcbnew)
function seAddBoardPart(c,k){
  if(c.fp&&!PCB.FP[c.fp]&&typeof FPGEN!=='undefined'){const nm=FPGEN.ensure(PCB,c.fp,c.pins.length);if(nm)c.fp=nm;}
  const lib=PCB.FP[c.fp];const xs=BD.outline.flat().map(p=>p[0]).concat(BD.comps.map(o=>o.bb[2]));const ys=BD.outline.flat().map(p=>p[1]);
  const x=Math.max(...xs)+8+(k%4)*8,y=Math.min(...ys)+6+Math.floor(k/4)*8;
  const pins={};c.pins.forEach(p=>{if(p.net)pins[p.num]=p.net;});const pn={};c.pins.forEach(p=>{if(p.name)pn[p.num]=p.name;});
  const cs={ref:c.ref,value:c.val,footprint:c.fp||'',side:'top',x,y,rotation:0,pins,pinNames:pn,mpn:c.sym&&c.sym.mpn||'',description:c.sym&&c.sym.desc||'회로도에서 추가'};
  if(!lib)cs.pads=c.pins.map((p,i)=>({n:p.num,x:i*2.54,y:0,w:1.6,h:1.6}));
  // look for a free spot on the board (no part bodies, no copper of other nets under the pads); otherwise park it outside
  const free=(px,py)=>{const m=PCB.finalize(PCB.fromSpec({board:{width:10,height:10},components:[Object.assign({},cs,{x:px,y:py})]}));const c=m.comps[0];const b=c.bb,g=0.6;
    if(!BD.outline[0]||![[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].every(q=>PCB.inRing(q[0],q[1],BD.outline[0])))return null;
    if(BD.comps.some(o=>o.bb[0]-g<b[2]&&b[0]<o.bb[2]+g&&o.bb[1]-g<b[3]&&b[1]<o.bb[3]+g))return null;
    if(BD.drills.some(d=>d.x>b[0]-d.d&&d.x<b[2]+d.d&&d.y>b[1]-d.d&&d.y<b[3]+d.d))return null;
    const cu=BD.layers['T.cu'];for(const p of c.pads){for(const q of cu){if(q.t==='seg'&&PCB.segDist(p.x,p.y,q.a,q.b)<Math.max(p.w,p.h)/2+q.w/2+0.3)return null;if(q.t==='path'){for(let i=1;i<q.pts.length;i++)if(PCB.segDist(p.x,p.y,q.pts[i-1],q.pts[i])<Math.max(p.w,p.h)/2+q.w/2+0.3)return null;}}
      if(BD.vias.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<v.d/2+Math.max(p.w,p.h)/2+0.3))return null;}
    return m;};
  let mini=null;const ob=[Math.min(...BD.outline[0].map(p=>p[0])),Math.min(...ys),Math.max(...BD.outline[0].map(p=>p[0])),Math.max(...ys)];
  for(let py=ob[3]-4;py>ob[1]+3&&!mini;py-=1)for(let px=ob[2]-4;px>ob[0]+3&&!mini;px-=1)mini=free(px,py);
  if(mini)c.placed='board';else{mini=PCB.finalize(PCB.fromSpec({board:{width:10,height:10},components:[cs]}));c.placed='outside';}
  const comp=mini.comps[0];
  BD.comps.push(comp);BD.byRef[comp.ref]=comp;comp.pads.forEach(p=>{if(p.side!=='B')BD.layers['T.cu'].push(p);if(p.side!=='T')BD.layers['B.cu'].push(p);});
  (mini.layers['T.silk']||[]).forEach(p=>BD.layers['T.silk'].push(p));
  return true;
}
function seBoardChanged(){
  try{stats();header();renderPane();if(typeof rebuild3D==='function'&&G3)rebuild3D();if(typeof hsisRun==='function'&&HS.H){hsisRun();if(HS.ws==='hsis')renderHSIS();}if(typeof simReset==='function')simReset();}catch(e){console.error(e);}
  measure.done=0;refresh(true);
}
async function seExport(){
  const files=SCHEDIT.toKicad(seSheets()||schData().sheets,{name:BD.name||'board',title:BD.name,board:BD,date:new Date().toISOString().slice(0,10)});
  const z=new JSZip();files.forEach(f=>z.file(f.name,f.text));const blob=await z.generateAsync({type:'uint8array'});
  offerFile(files[0].name.replace(/\.kicad_sch$/,'')+'_schematic.zip',blob,'application/zip');
}
function seBar(){
  let el=$('#seBar');if(!el){el=document.createElement('div');el.id='seBar';el.className='sov sov-ed';$('#schOv').appendChild(el);
    el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tool)seSetTool(b.dataset.tool);else if(b.dataset.act)seAction(b.dataset.act);else if(b.id==='seAnn')seAnnotate();else if(b.id==='seErc')seErcList();else if(b.id==='seExp')seExport();else if(b.id==='seCli')scToggle();});}
  el.hidden=!SE.on;{const cp=$('#schCli');if(cp)cp.hidden=!(SE.on&&SCLI.open);}const eb=$('#schEdit');if(eb){eb.classList.toggle('on',SE.on);eb.textContent=SE.on?'편집 끝내기':'회로 편집';}
  if(!SE.on)return;
  el.innerHTML=`<div class="setools" role="toolbar" aria-label="회로 편집 도구">${SE_TOOLS.map(([t,l,k])=>`<button class="pill vbtn${SE.tool===t?' on':''}" data-tool="${t}" title="${l} (${k})">${l}<kbd>${k}</kbd></button>`).join('')}</div>
    <div class="setools">${SE_ACTS.map(([a,l,k])=>`<button class="pill vbtn" data-act="${a}" title="${l} (${k})"${(a==='undo'&&!SE.undo.length)||(a==='redo'&&!SE.redo.length)?' disabled':''}>${l}<kbd>${k}</kbd></button>`).join('')}
    <button class="pill vbtn" id="seErc" title="전기 규칙 검사 결과">ERC <b id="seErcN">${SE.erc.length}</b></button><button class="pill vbtn${SE.dirty?' warn':''}" id="seAnn" title="회로도 연결을 보드 패드 넷에 반영 (F8)">보드에 반영<kbd>F8</kbd></button><button class="pill vbtn" id="seExp" title="KiCad 회로도(.kicad_sch)로 저장">.kicad_sch 저장</button><button class="pill vbtn" id="seCli" title="오른쪽 설계 도우미에서 회로 명령·질문 (\`)">도우미<kbd>\`</kbd></button></div>
    <span class="pill hint2" id="seStat"></span>`;
  seStat();
}
function seStat(){const el=$('#seStat');if(!el)return;const hint={sel:'클릭으로 선택 · 끌어서 이동(연결 유지) · 더블클릭 속성',move:'클릭하면 내려놓기 (연결 끊김)',drag:'클릭하면 내려놓기 (배선 따라옴)',wire:SE.wire?'클릭으로 꺾기 · 핀/배선에 닿으면 끝 · / 꺾는 방향 · Esc 끝':'시작점을 클릭하세요',
  label:'라벨을 붙일 배선·핀 끝을 클릭',glabel:'다른 페이지와 이어질 지점을 클릭',power:'전원 심볼을 놓을 곳을 클릭',add:'클릭해서 놓기 · R 회전',nc:'연결하지 않을 핀 끝을 클릭',del:'지울 항목을 클릭'}[SE.tool]||'';
  el.textContent=hint+(SE.dirty?' · 보드와 다름':'');const n=$('#seErcN');if(n)n.textContent=SE.erc.length;
  const ann=$('#seAnn');if(ann)ann.classList.toggle('warn',SE.dirty);}
function seErcList(){const e=SE.erc;if(!e.length){toast('ERC 문제 없음');return;}
  seDialog(`<b>ERC ${e.length}건</b><ul class="sediff">${e.slice(0,80).map((x,i)=>`<li><button type="button" class="linkbtn" data-erc="${i}">${x.page+1}쪽</button> ${esc(x.msg)}</li>`).join('')}</ul>`,()=>true);
  $('#seDlg').querySelectorAll('[data-erc]').forEach(b=>b.addEventListener('click',()=>{const x=e[+b.dataset.erc];SV.page=x.page;renderSchOv();SV.s=Math.max(SV.s,8);SV.ox=SV.w/2-x.p[0]*SV.s;SV.oy=SV.h/2-x.p[1]*SV.s;drawSch();}));}
// overlay: grid, selection, previews, ghost part, ERC marks, snapped cursor
function seOverlay(ctx,sh,V,C,lw,drawSy){
  if(V.s>5){ctx.fillStyle=C.frame;const s=2.54,x0=Math.max(0,Math.floor(-V.ox/V.s/s)*s),y0=Math.max(0,Math.floor(-V.oy/V.s/s)*s),x1=Math.min(sh.w,(V.w-V.ox)/V.s),y1=Math.min(sh.h,(V.h-V.oy)/V.s);const r=Math.max(0.06,0.9/V.s);
    for(let x=x0;x<=x1;x+=s)for(let y=y0;y<=y1;y+=s)ctx.fillRect(x-r,y-r,2*r,2*r);}
  const h=SE.sel;ctx.save();ctx.strokeStyle=C.sel;ctx.lineWidth=lw(0.3);ctx.setLineDash([1,0.7]);
  if(h&&h.type==='sym'&&sh.symbols.includes(h.o)){const b=h.o.bb;ctx.strokeRect(b[0]-0.8,b[1]-0.8,b[2]-b[0]+1.6,b[3]-b[1]+1.6);}
  if(h&&h.type==='wire'&&sh.wires.includes(h.o)){ctx.setLineDash([]);ctx.lineWidth=lw(0.6);ctx.beginPath();ctx.moveTo(h.o.a[0],h.o.a[1]);ctx.lineTo(h.o.b[0],h.o.b[1]);ctx.stroke();}
  if(h&&h.type==='label'&&sh.labels.includes(h.o)){ctx.beginPath();ctx.arc(h.o.p[0],h.o.p[1],1.2,0,TAU);ctx.stroke();}
  ctx.restore();
  if(SE.wire&&SE.cursor){ctx.save();ctx.strokeStyle=C.wire;ctx.lineWidth=lw(0.2);ctx.setLineDash([0.8,0.5]);SCHEDIT.lpath(SE.wire.from,SE.cursor,SE.vfirst).forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();});ctx.restore();}
  if(SE.ghost){ctx.save();ctx.globalAlpha=0.55;drawSy(SE.ghost);ctx.restore();}
  ctx.save();ctx.strokeStyle=C.critical||'#d03b3b';ctx.lineWidth=lw(0.25);SE.erc.forEach(e=>{if(e.page!==SV.page)return;ctx.beginPath();ctx.arc(e.p[0],e.p[1],1.0,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(e.p[0]-0.5,e.p[1]-0.5);ctx.lineTo(e.p[0]+0.5,e.p[1]+0.5);ctx.stroke();});ctx.restore();
  if(SE.cursor&&SE.tool!=='sel'){const p=SCHEDIT.sp(SE.cursor);ctx.save();ctx.strokeStyle=C.hl;ctx.lineWidth=lw(0.12);ctx.beginPath();ctx.moveTo(p[0]-1.6,p[1]);ctx.lineTo(p[0]+1.6,p[1]);ctx.moveTo(p[0],p[1]-1.6);ctx.lineTo(p[0],p[1]+1.6);ctx.stroke();ctx.restore();}
}
// Eeschema hotkeys while the schematic is shown in edit mode
document.addEventListener('keydown',e=>{
  if(!SE.on||S.sch==='off')return;if(e.target.matches('input,select,textarea'))return;if($('#seDlg')&&!$('#seDlg').hidden)return;
  const k=e.key,ctl=e.ctrlKey||e.metaKey;let done=true;
  if(ctl&&(k==='z'||k==='Z')&&!e.shiftKey)seAction('undo');else if(ctl&&(k==='y'||k==='Y'||((k==='z'||k==='Z')&&e.shiftKey)))seAction('redo');
  else if(ctl&&(k==='l'||k==='L'))seSetTool('glabel');
  else if(ctl)done=false;
  else if(k==='Escape'){if(SE.wire)SE.wire=null;else if(SE.drag){const D=SE.drag;SE.drag=null;BD.schSheets=SCHEDIT.restore(D.json);seRefresh(false);}else{SE.ghost=null;SE.sel=null;}SE.tool='sel';seBar();drawSch();}
  else if(k==='Delete'||k==='Backspace'){const h=seTarget();if(h)seCommit(s=>SCHEDIT.remove(s,h.o));SE.sel=null;}
  else if(k==='F8')seAnnotate();
  else{const m={m:'move',g:'drag',w:'wire',l:'label',p:'power',a:'add',q:'nc'}[k.toLowerCase()];const act={r:'rot',x:'mirx',y:'miry',e:'props'}[k.toLowerCase()];
    if(m)seSetTool(m);else if(act)seAction(act);else if(k==='/'){SE.vfirst=!SE.vfirst;drawSch();}else done=false;}
  if(done){e.preventDefault();e.stopImmediatePropagation();}
},true);
$('#schEdit').addEventListener('click',()=>{if(SE.on)seEnd();else seBegin();});
