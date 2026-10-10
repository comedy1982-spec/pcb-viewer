/* ---------- schematic view (shares viewer scope) ---------- */
const cvs=$('#cvs'),sctx=cvs.getContext('2d');
const SV={data:null,page:0,s:3,ox:0,oy:0,fitted:-1,w:0,h:0,hover:null,lastKey:'',fromMe:false,cv:cvs,ctx:sctx,win:window,dpr:1};
S.sch='off';
function schData(){
  if(!SV.data||SV.data.board!==BD){
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
  sh.symbols.forEach(sy=>{
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
  });
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
      ctx.scale(k,k);ctx.textAlign=dirR?'left':'right';ctx.textBaseline='middle';ctx.fillText(l.s,sg*(tip+pad)/k,0);ctx.restore();l._w=w+tip+pad*2;}});
  // texts
  ctx.fillStyle=C.text;sh.texts.forEach(t=>{String(t.s).split('\n').forEach((line,i)=>tx(ctx,line,t.p[0],t.p[1]+i*t.fx.size*1.5,t.fx.size,t.rot,t.fx.h==='center'?'left':t.fx.h,'bottom'));});
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
  S.tab='sel';refresh(true);
}
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
  const pts=new Map();let start=null,moved=0,pinch=0,hq=null,hraf=0;
  const pos=e=>{const r=cvs.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const zoomAt=(px,py,f)=>{SV.userMoved=true;const[wx,wy]=schS2W(SV,px,py);SV.s=Math.max(0.3,Math.min(80,SV.s*f));SV.ox=px-wx*SV.s;SV.oy=py-wy*SV.s;drawSch();};
  cvs.addEventListener('pointerdown',e=>{cvs.setPointerCapture(e.pointerId);pts.set(e.pointerId,pos(e));moved=0;start=pos(e);cvs.classList.add('drag');if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cvs.addEventListener('pointermove',e=>{const p=pos(e);
    if(pts.has(e.pointerId)){const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);
      if(pts.size===1){SV.userMoved=true;SV.ox+=p[0]-prev[0];SV.oy+=p[1]-prev[1];moved+=Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]);drawSch();}
      else if(pts.size===2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/pinch);pinch=d;moved=99;}tip.hidden=true;return;}
    hq=p;if(!hraf)hraf=requestAnimationFrame(()=>{hraf=0;if(!hq)return;const[x,y]=schS2W(SV,hq[0],hq[1]);const h=schHit(SV,x,y);const was=SV.hover&&SV.hover.s;SV.hover=h&&h.type==='sym'?h:null;if((SV.hover&&SV.hover.s)!==was)drawSch();
      if(h){const vr=vp.getBoundingClientRect(),cr=cvs.getBoundingClientRect();tip.innerHTML=schTip(h);tip.hidden=false;tip.style.left=(hq[0]+cr.left-vr.left)+'px';tip.style.top=(hq[1]+cr.top-vr.top)+'px';cvs.style.cursor='pointer';}else{tip.hidden=true;cvs.style.cursor='';}});});
  const end=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);cvs.classList.remove('drag');if(pts.size===0&&moved<5&&start&&e.type==='pointerup'){const[x,y]=schS2W(SV,start[0],start[1]);schApply(schHit(SV,x,y),SV);}if(pts.size<2)pinch=0;};
  cvs.addEventListener('pointerup',end);cvs.addEventListener('pointercancel',end);
  cvs.addEventListener('pointerleave',()=>{hq=null;tip.hidden=true;if(SV.hover){SV.hover=null;drawSch();}});
  cvs.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pos(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  cvs.addEventListener('dblclick',()=>{schFit();drawSch();});
})();
function renderSchOv(){
  if(!SV.data)return;const d=SV.data;
  $('#schPages').innerHTML=`<span class="pill side-badge">회로도</span>`+(d.sheets.length>1?d.sheets.map((s,i)=>`<button class="pill vbtn${i===SV.page?' on':''}" data-page="${i}">${esc(s.name||'시트 '+(i+1))}</button>`).join(''):'');
  $('#schNote').innerHTML=d.auto?'<span class="pill hint2">넷리스트로 자동 생성한 회로도입니다. .kicad_sch를 불러오면 실제 회로도를 보여줍니다.</span>'
    :(d.matched<d.total?`<span class="pill hint2">보드 부품과 연결된 넷 ${d.matched}/${d.total}개</span>`:'');
}
$('#schPages').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;SV.page=+b.dataset.page;schFit();renderSchOv();drawSch();});
$('#schFitBtn').addEventListener('click',()=>{schFit();drawSch();});
$('#schPop').addEventListener('click',()=>openPop('sch'));
$('#schOpen').addEventListener('click',()=>$('#schFile').click());
$('#schFile').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{const list=[];for(const f of files)list.push({name:f.name,text:await f.text()});const t=SCH.build(BD,list);BD.schFiles=list;SV.data=null;schData();drawSch();
    toast(`회로도 ${t.sheets.length}장을 붙였습니다 · 보드 부품과 연결된 넷 ${t.matched}/${t.total}개`+(t.matched<t.total*0.5?' · 부품 참조가 보드와 많이 다릅니다.':''));}
  catch(err){console.error(err);toast('회로도를 읽지 못했습니다: '+(err.message||err));}});
$('#splitBtn').addEventListener('click',()=>{S.sch=S.sch==='split'?'off':'split';setView('__keep');});
