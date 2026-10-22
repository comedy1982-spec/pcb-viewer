/* ---------- board outline drawing tool (paint-style) in the PCB editor ----------
   Tool "외곽 그리기": pick a shape and drag it on the board — rectangle / rounded / circle / oval, or click the corners of a
   polygon (double-click · Enter to finish). Cut-outs (circle / rect) are drawn the same way. Vertices of the current outline
   can be dragged in "꼭짓점" mode. Everything goes through PCBEDIT.setOutlineRing / addCutout, so undo works and the parts keep
   their place relative to the new outline. */
const SH_KINDS=[['rect','사각형','끌어서'],['round','라운드','끌어서 · 코너 R'],['circle','원','끌어서 (지름)'],['oval','타원','끌어서'],['poly','다각형','꼭짓점 클릭 · 더블클릭/Enter 끝'],['vertex','꼭짓점','외곽 꼭짓점 끌기'],['cut_circle','컷아웃 원','끌어서'],['cut_rect','컷아웃 사각','끌어서'],['cut_clear','컷아웃 지우기','클릭']];
const SH={kind:'rect',start:null,cur:null,poly:null,corner:3,vtx:null};
function shKindLabel(k){const x=SH_KINDS.find(q=>q[0]===k);return x?x[1]:k;}
/* ring of the shape being dragged, in board coordinates */
function shRing(kind,a,b){const x0=Math.min(a[0],b[0]),y0=Math.min(a[1],b[1]),x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]);const w=x1-x0,h=y1-y0;if(w<1||h<1)return null;
  let r;switch(kind){
    case'rect':r=PCBEDIT.shapeRing('rect',{w,h,r:0});break;
    case'round':r=PCBEDIT.shapeRing('round',{w,h,r:SH.corner});break;
    case'circle':{const d=Math.max(w,h);r=PCBEDIT.shapeRing('circle',{d});return r.map(p=>[p[0]+x0,p[1]+y0]);}
    case'oval':r=PCBEDIT.shapeRing('oval',{w,h});break;
    case'cut_rect':r=PCBEDIT.shapeRing('rect',{w,h,r:0});break;
    case'cut_circle':{const d=Math.max(w,h);r=PCBEDIT.shapeRing('circle',{d});return r.map(p=>[p[0]+x0,p[1]+y0]);}
    default:return null;}
  return r.map(p=>[p[0]+x0,p[1]+y0]);}
function shSnapOutline(){const s0=()=>({outline:JSON.parse(JSON.stringify(BD.outline)),W:BD.W,H:BD.H,shape:BD.shape?JSON.parse(JSON.stringify(BD.shape)):null,cut:BD.cutouts?JSON.parse(JSON.stringify(BD.cutouts)):null});return s0();}
function shApplyRing(ring,meta){const s0=shSnapOutline();cliEnsureEdit();
  const r=PCBEDIT.setOutlineRing(BD,ring,meta);const s1=shSnapOutline();const dx=r.dx,dy=r.dy;
  pePush({copper:true,label:'board shape',undo:()=>{if(dx||dy)PCBEDIT.translateAll(BD,-dx,-dy);Object.assign(BD,{outline:JSON.parse(JSON.stringify(s0.outline)),W:s0.W,H:s0.H,shape:s0.shape,cutouts:s0.cut});cliAfter(true);},
    redo:()=>{if(dx||dy)PCBEDIT.translateAll(BD,dx,dy);Object.assign(BD,{outline:JSON.parse(JSON.stringify(s1.outline)),W:s1.W,H:s1.H,shape:s1.shape,cutouts:s1.cut});cliAfter(true);}});
  cliAfter(true);
  const msg=`보드 외곽 → ${shKindLabel(meta.kind)} · ${r.W.toFixed(1)} × ${r.H.toFixed(1)} mm${r.holesDropped?` · 외곽 밖 장착 구멍 ${r.holesDropped}개 삭제`:''}${r.outside.length?` · 보드 밖 부품 ${r.outside.length}개 (${r.outside.slice(0,6).join(', ')}) → place/reset`:''}`;
  if(typeof cliSay==='function')cliSay('ok',msg);else toast(msg);}
function shApplyCut(kind,ring){const s0=shSnapOutline();cliEnsureEdit();
  if(!ring.every(q=>PCB.inRing(q[0],q[1],BD.outline[0]))){toast('컷아웃이 보드 밖으로 나갑니다.');return;}
  BD.outline.push(ring);BD.cutouts=(BD.cutouts||[]).concat([{kind:kind==='cut_circle'?'circle':'rect',drawn:true}]);const s1=shSnapOutline();
  pePush({copper:true,label:'board cutout',undo:()=>{Object.assign(BD,{outline:JSON.parse(JSON.stringify(s0.outline)),cutouts:s0.cut});cliAfter(false);},redo:()=>{Object.assign(BD,{outline:JSON.parse(JSON.stringify(s1.outline)),cutouts:s1.cut});cliAfter(false);}});
  cliAfter(false);const over=BD.comps.filter(c=>c.kind!=='none'&&c.pads.some(q=>PCB.inRing(q.x,q.y,ring))).map(c=>c.ref);
  const msg=`컷아웃 #${BD.outline.length-1} 추가${over.length?` · 컷아웃 위 부품 ${over.join(', ')} → 옮기세요`:''}`;if(typeof cliSay==='function')cliSay('ok',msg);else toast(msg);}
/* ---- pointer handling (called from pcbui when PE.tool==='shape') ---- */
function shDown(w){const k=SH.kind;const p=peSnap(w);
  if(k==='poly')return false;                                                            // polygon is click-based
  if(k==='vertex'){const ring=BD.outline[0];const tol=peTol()*1.5;let best=-1,bd=1e9;ring.forEach((q,i)=>{const d=Math.hypot(q[0]-w[0],q[1]-w[1]);if(d<bd){bd=d;best=i;}});
    if(best<0||bd>tol){return false;}SH.vtx={i:best,ring0:JSON.parse(JSON.stringify(ring)),moved:false};return true;}
  if(k==='cut_clear')return false;
  SH.start=p;SH.cur=p;return true;}
function shDrag(w){const p=peSnap(w);
  if(SH.vtx){const ring=BD.outline[0];ring[SH.vtx.i]=[p[0],p[1]];SH.vtx.moved=true;draw2D();return;}
  if(!SH.start)return;SH.cur=p;draw2D();}
function shUp(){
  if(SH.vtx){const V=SH.vtx;SH.vtx=null;if(!V.moved){draw2D();return;}const ring=BD.outline[0].map(q=>[q[0],q[1]]);BD.outline[0]=V.ring0;shApplyRing(ring,{kind:'poly'});return;}
  if(!SH.start)return;const a=SH.start,b=SH.cur;SH.start=null;SH.cur=null;const k=SH.kind;const ring=shRing(k,a,b);
  if(!ring){draw2D();return;}
  if(k==='cut_circle'||k==='cut_rect')shApplyCut(k,ring);else shApplyRing(ring,{kind:k,params:k==='round'?{r:SH.corner}:k==='circle'?{d:Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))}:{}});}
function shClick(w){const p=peSnap(w);const k=SH.kind;
  if(k==='poly'){if(!SH.poly)SH.poly=[];const P=SH.poly;if(P.length>=3&&Math.hypot(P[0][0]-p[0],P[0][1]-p[1])<=peTol()*1.5){shPolyFinish();return;}
    if(!P.length||Math.hypot(P[P.length-1][0]-p[0],P[P.length-1][1]-p[1])>1e-6)P.push(p);peStat();draw2D();return;}
  if(k==='cut_clear'){const i=BD.outline.slice(1).findIndex(h=>PCB.inRing(w[0],w[1],h));if(i<0){toast('지울 컷아웃을 누르세요.');return;}const s0=shSnapOutline();BD.outline.splice(i+1,1);if(BD.cutouts)BD.cutouts.splice(i,1);const s1=shSnapOutline();
    pePush({copper:true,label:'cutout clear',undo:()=>{Object.assign(BD,{outline:JSON.parse(JSON.stringify(s0.outline)),cutouts:s0.cut});cliAfter(false);},redo:()=>{Object.assign(BD,{outline:JSON.parse(JSON.stringify(s1.outline)),cutouts:s1.cut});cliAfter(false);}});cliAfter(false);return;}}
function shPolyFinish(){const P=SH.poly;SH.poly=null;if(!P||P.length<3){toast('꼭짓점이 3개 이상 필요합니다.');draw2D();return;}shApplyRing(P.map(q=>[q[0],q[1]]),{kind:'poly'});}
function shDbl(){if(SH.kind==='poly'&&SH.poly&&SH.poly.length>=3){const P=SH.poly,last=P[P.length-1];const c=PE.cursor?peSnap(PE.cursor):last;if(Math.hypot(c[0]-last[0],c[1]-last[1])<=peTol()*2){P.pop();if(P.length>=3)shPolyFinish();else{P.push(last);}return true;}}return false;}
function shCancel(){SH.start=null;SH.cur=null;SH.poly=null;if(SH.vtx){BD.outline[0]=SH.vtx.ring0;SH.vtx=null;}draw2D();}
function shKey(k){if(k==='Enter'&&SH.kind==='poly'&&SH.poly){shPolyFinish();return true;}if(k==='Escape'&&(SH.poly||SH.start||SH.vtx)){shCancel();return true;}return false;}
/* ---- preview ---- */
function shOverlay(ctx){const lw=Math.max(0.05,1.4/V2.s);ctx.save();ctx.strokeStyle='#ffd23f';ctx.fillStyle='rgba(255,210,63,.12)';ctx.lineWidth=lw;ctx.setLineDash([lw*5,lw*3]);
  const path=r=>{ctx.beginPath();r.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();};
  if(SH.start&&SH.cur){const r=shRing(SH.kind,SH.start,SH.cur);if(r){path(r);ctx.fill();ctx.stroke();}const w=Math.abs(SH.cur[0]-SH.start[0]),h=Math.abs(SH.cur[1]-SH.start[1]);ctx.setLineDash([]);ctx.fillStyle='#ffd23f';drawText(ctx,{x:SH.cur[0]+1,y:SH.cur[1]+1,s:SH.kind==='circle'||SH.kind==='cut_circle'?`Ø${Math.max(w,h).toFixed(1)}`:`${w.toFixed(1)} × ${h.toFixed(1)}`,size:Math.max(1.2,12/V2.s),align:'left',mir:S.view==='B'});}
  if(SH.poly&&SH.poly.length){ctx.beginPath();SH.poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(PE.cursor){const c=peSnap(PE.cursor);ctx.lineTo(c[0],c[1]);}ctx.stroke();
    ctx.setLineDash([]);const k=Math.max(0.5,4/V2.s);SH.poly.forEach((p,i)=>{ctx.fillStyle=i?'#ffd23f':'#ff7a1a';ctx.beginPath();ctx.arc(p[0],p[1],k,0,2*Math.PI);ctx.fill();});}
  if(SH.kind==='vertex'){ctx.setLineDash([]);const k=Math.max(0.5,4/V2.s);ctx.fillStyle='#ffd23f';(BD.outline[0]||[]).forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],k,0,2*Math.PI);ctx.fill();});}
  ctx.restore();}
function shStat(){const k=SH.kind;const d=(SH_KINDS.find(q=>q[0]===k)||[])[2]||'';return`외곽 그리기 · ${shKindLabel(k)} — ${d}${k==='poly'&&SH.poly?` · 꼭짓점 ${SH.poly.length}개 (첫 점을 다시 누르면 완성)`:''}${k==='round'?` · 코너 R ${SH.corner} mm`:''} · 격자 ${PE.grid} mm · Esc 취소`;}
function shBarHTML(){return`<div class="setools sh-sub" role="toolbar" aria-label="외곽 모양">${SH_KINDS.map(([k,l,d])=>`<button class="pill vbtn${SH.kind===k?' on':''}" data-shk="${k}" title="${d}">${l}</button>`).join('')}
  <label class="pill vbtn" title="라운드 사각형 코너 반지름">R <input id="shR" type="number" min="0" max="50" step="0.5" value="${SH.corner}" style="width:3.4em"></label>
  <span class="pill hint2">지금: ${PCBEDIT.shapeText(BD)}</span></div>`;}
function shBind(el){el.addEventListener('click',e=>{const b=e.target.closest('[data-shk]');if(!b)return;SH.kind=b.dataset.shk;shCancel();peBar();});
  el.addEventListener('change',e=>{if(e.target.id==='shR'){SH.corner=Math.max(0,+e.target.value||0);}});}
