/* ---------- PCB layout editing (Pcbnew-style) in the TOP / BOTTOM views ---------- */
var PE={on:false,tool:'sel',grid:0.5,w:0,layer:'T',undo:[],redo:[],drag:null,route:null,cursor:null,rats:[],drc:[],showRats:true,t3d:0,sel:null};
const PE_TOOLS=[['sel','선택·이동','Esc'],['route','배선','X'],['via','비아','V'],['del','삭제','Del']];
const PE_ACTS=[['rot','회전','R'],['flip','뒤집기','F'],['undo','실행 취소','Ctrl+Z'],['redo','다시 실행','Ctrl+Y']];
const PE_GRIDS=[0.05,0.1,0.25,0.5,1,1.27,2.54];
const PE_WIDTHS=[0,0.15,0.2,0.25,0.3,0.4,0.5,0.8,1.0];
function peBegin(){
  if(S.view==='3d'||S.view==='sch')setView('T');
  PCBEDIT.prepare(BD);PE.on=true;PE.tool='sel';PE.layer=S.view==='B'?'B':'T';peRecalc(true);peBar();draw2D();
}
function peEnd(){PE.on=false;PE.route=null;PE.drag=null;peBar();draw2D();}
// ratsnest + DRC after a change (ratsnest of a few nets while dragging)
function peRecalc(full,nets){
  try{if(full||!nets){PE.rats=PCBEDIT.ratsnest(BD);PE.drc=PCBEDIT.drc(BD);}
    else{const keep=PE.rats.filter(r=>!nets.has(r.net));PE.rats=keep.concat(PCBEDIT.ratsnest(BD,nets));}}catch(e){console.error(e);}
  peStat();
}
function peChanged(copper){
  if(copper){PCBEDIT.rebuildNets(BD);}
  peRecalc(true);try{stats();renderPane();}catch(e){}
  if(typeof SV!=='undefined')SV.lastKey='';
  clearTimeout(PE.t3d);PE.t3d=setTimeout(()=>{try{if(typeof rebuild3D==='function'&&G3)rebuild3D();if(typeof simReset==='function')simReset();}catch(e){console.error(e);}},450);
  peBar();draw2D();
}
function pePush(cmd){PE.undo.push(cmd);if(PE.undo.length>100)PE.undo.shift();PE.redo=[];}
function peUndo(){const c=PE.undo.pop();if(!c)return;c.undo();PE.redo.push(c);peChanged(c.copper);}
function peRedo(){const c=PE.redo.pop();if(!c)return;c.redo();PE.undo.push(c);peChanged(c.copper);}
const peComp=ref=>BD.byRef[ref];
const peNetsOf=c=>new Set(c.pads.map(p=>p.net).filter(Boolean));
// commands that only keep the reference, so they survive other edits
function peMoveCmd(ref,dx,dy){return{copper:false,undo:()=>PCBEDIT.move(BD,peComp(ref),-dx,-dy),redo:()=>PCBEDIT.move(BD,peComp(ref),dx,dy)};}
function peRotate(c,deg){PCBEDIT.rotate(BD,c,deg);const ref=c.ref;pePush({copper:false,undo:()=>PCBEDIT.rotate(BD,peComp(ref),-deg),redo:()=>PCBEDIT.rotate(BD,peComp(ref),deg)});peChanged(false);}
function peFlip(c){PCBEDIT.flip(BD,c);const ref=c.ref;pePush({copper:false,undo:()=>PCBEDIT.flip(BD,peComp(ref)),redo:()=>PCBEDIT.flip(BD,peComp(ref))});peChanged(false);}
function peNudge(c,dx,dy){PCBEDIT.move(BD,c,dx,dy);const last=PE.undo[PE.undo.length-1];
  // consecutive arrow presses on the same part fold into one undo step
  if(last&&last.nudge===c.ref&&Date.now()-last.t<1200){last.dx+=dx;last.dy+=dy;last.t=Date.now();}
  else{const cmd={copper:false,nudge:c.ref,dx,dy,t:Date.now()};cmd.undo=()=>PCBEDIT.move(BD,peComp(cmd.nudge),-cmd.dx,-cmd.dy);cmd.redo=()=>PCBEDIT.move(BD,peComp(cmd.nudge),cmd.dx,cmd.dy);pePush(cmd);}
  peRecalc(false,peNetsOf(c));clearTimeout(PE.tn);PE.tn=setTimeout(()=>peChanged(false),350);draw2D();refresh(false);}
const peSnap=p=>[PCBEDIT.snapTo(p[0],PE.grid),PCBEDIT.snapTo(p[1],PE.grid)];
const peTol=()=>Math.max(0.25,5/V2.s);
function peTrackWidth(net){if(PE.w)return PE.w;if(!net)return 0.25;return BD.netClass(net)==='신호'?0.25:0.5;}
/* pointer hooks (called from the 2D view) */
function peDown(w){
  if(PE.tool!=='sel')return false;
  const h=hit(w[0],w[1],S.view,3/V2.s);const c=h&&(h.type==='comp'?h.c:h.type==='pad'?h.c:null);
  if(!c)return false;
  S.selRef=c.ref;S.hlNet=null;PE.drag={ref:c.ref,start:w,ox:c.x,oy:c.y,moved:false,nets:peNetsOf(c)};refresh(true);return true;
}
function peDrag(w){const D=PE.drag;if(!D)return;const c=peComp(D.ref);if(!c)return;
  const tx=PCBEDIT.snapTo(D.ox+(w[0]-D.start[0]),PE.grid),ty=PCBEDIT.snapTo(D.oy+(w[1]-D.start[1]),PE.grid);const dx=tx-c.x,dy=ty-c.y;
  if(Math.abs(dx)<1e-9&&Math.abs(dy)<1e-9)return;PCBEDIT.move(BD,c,dx,dy);D.moved=true;
  if(!D.raf)D.raf=requestAnimationFrame(()=>{D.raf=0;peRecalc(false,D.nets);draw2D();});}
function peUp(){const D=PE.drag;PE.drag=null;if(!D||!D.moved){draw2D();return;}const c=peComp(D.ref);const dx=c.x-D.ox,dy=c.y-D.oy;pePush(peMoveCmd(D.ref,dx,dy));peChanged(false);}
function pePoint(w){PE.cursor=w;if(PE.tool!=='sel')draw2D();}
function peClick(w){
  const L=PE.layer;
  if(PE.tool==='sel'){applyHit(hit(w[0],w[1],S.view,3/V2.s));return;}
  if(PE.tool==='del'){const h=hit(w[0],w[1],S.view,3/V2.s);let p=null;if(h&&h.type==='track')p=h.t;else if(h&&h.type==='via')p=h.v||BD.vias.find(v=>Math.hypot(v.x-w[0],v.y-w[1])<=v.d/2+peTol());
    if(!p){toast('지울 트랙이나 비아를 누르세요 (부품은 지우지 않습니다).');return;}const at=PCBEDIT.removePrim(BD,p);if(!at)return;
    pePush({copper:true,undo:()=>PCBEDIT.restorePrim(BD,p,at),redo:()=>PCBEDIT.removePrim(BD,p)});peChanged(true);return;}
  if(PE.tool==='via'&&!PE.route){const it=PCBEDIT.itemAt(BD,w[0],w[1],L,peTol())||PCBEDIT.itemAt(BD,w[0],w[1],L==='T'?'B':'T',peTol());const p=it&&it.type!=='pad'?it.at:peSnap(w);
    const v=PCBEDIT.addVia(BD,p[0],p[1],it?it.net:null);pePush({copper:true,undo:()=>PCBEDIT.removePrim(BD,v),redo:()=>BD.vias.push(v)});peChanged(true);return;}
  if(PE.tool==='route'){
    const it=PCBEDIT.itemAt(BD,w[0],w[1],L,peTol());
    if(!PE.route){const net=it?it.net:null;const p=it?it.at.slice():peSnap(w);PE.route={net,runs:[{layer:L,pts:[p]}],vias:[],w:peTrackWidth(net)};peStat();draw2D();return;}
    const R=PE.route,run=R.runs[R.runs.length-1];const last=run.pts[run.pts.length-1];
    const end=it&&(it.net===R.net||!R.net)?it.at.slice():peSnap(w);
    const seg=PCBEDIT.posture(last,end,PE.diag).slice(1);seg.forEach(q=>run.pts.push(q));if(!R.net&&it&&it.net)R.net=it.net;
    if(it&&(it.net===R.net)&&!(Math.abs(end[0]-R.runs[0].pts[0][0])<1e-6&&Math.abs(end[1]-R.runs[0].pts[0][1])<1e-6))peRouteFinish();
    draw2D();return;}
}
function peDbl(){if(PE.tool==='route'&&PE.route){peRouteFinish();return true;}return false;}
function peRouteVia(){const R=PE.route;if(!R)return;const run=R.runs[R.runs.length-1];const p=run.pts[run.pts.length-1];R.vias.push({x:p[0],y:p[1]});const nl=run.layer==='T'?'B':'T';R.runs.push({layer:nl,pts:[p.slice()]});PE.layer=nl;toast(`비아를 넣고 ${nl==='T'?'상단':'하단'} 층으로 바꿨습니다.`);peBar();draw2D();}
function peRouteFinish(){
  const R=PE.route;PE.route=null;if(!R)return;const added=[],vias=[];
  R.runs.forEach(r=>{const pts=r.pts.filter((p,i)=>i===0||Math.hypot(p[0]-r.pts[i-1][0],p[1]-r.pts[i-1][1])>1e-6);if(pts.length>=2)added.push(PCBEDIT.addTrack(BD,r.layer,R.net,R.w,pts));});
  R.vias.forEach(v=>{if(added.length)vias.push(PCBEDIT.addVia(BD,v.x,v.y,R.net));});
  if(!added.length){draw2D();return;}
  pePush({copper:true,undo:()=>{added.forEach(p=>PCBEDIT.removePrim(BD,p));vias.forEach(v=>PCBEDIT.removePrim(BD,v));},redo:()=>{added.forEach(p=>BD.layers[(p._L||'T')+'.cu'].push(p));vias.forEach(v=>BD.vias.push(v));}});
  added.forEach(p=>{p._L=BD.layers['T.cu'].includes(p)?'T':'B';});
  peChanged(true);
}
/* drawing (inside the 2D world transform) */
function peOverlay(ctx,side){
  const lw=Math.max(0.05,1.2/V2.s);
  if(PE.showRats){ctx.save();ctx.strokeStyle='rgba(255,236,150,.9)';ctx.lineWidth=lw;ctx.setLineDash([lw*4,lw*3]);ctx.beginPath();PE.rats.forEach(r=>{ctx.moveTo(r.a[0],r.a[1]);ctx.lineTo(r.b[0],r.b[1]);});ctx.stroke();ctx.restore();}
  ctx.save();ctx.strokeStyle='#ff4d4d';ctx.lineWidth=lw*1.5;PE.drc.forEach(d=>{const r=Math.max(0.5,6/V2.s);ctx.beginPath();ctx.arc(d.at[0],d.at[1],r,0,TAU);ctx.stroke();});ctx.restore();
  // grid dots when zoomed in
  if(V2.s*PE.grid>9){ctx.save();ctx.fillStyle='rgba(255,255,255,.18)';const g=PE.grid,x0=Math.max(0,Math.floor(((-V2.ox)/V2.s)/g)*g),x1=Math.min(BD.W,(vw-V2.ox)/V2.s),y0=Math.max(0,BD.H-(vh-V2.oy)/V2.s),y1=Math.min(BD.H,BD.H+V2.oy/V2.s);const r=Math.max(0.02,0.8/V2.s);
    const xa=side==='B'?0:x0,xb=side==='B'?BD.W:x1;for(let x=Math.ceil(xa/g)*g;x<=xb;x+=g)for(let y=Math.ceil(y0/g)*g;y<=y1;y+=g)ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();}
  const R=PE.route;
  if(R){const col=l=>l==='T'?'rgba(255,120,60,.85)':'rgba(80,150,255,.85)';ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    R.runs.forEach(r=>{ctx.strokeStyle=col(r.layer);ctx.lineWidth=R.w;ctx.beginPath();r.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();});
    const run=R.runs[R.runs.length-1];if(PE.cursor){const last=run.pts[run.pts.length-1];const it=PCBEDIT.itemAt(BD,PE.cursor[0],PE.cursor[1],run.layer,peTol());const end=it&&(it.net===R.net||!R.net)?it.at:peSnap(PE.cursor);
      ctx.globalAlpha=0.6;ctx.strokeStyle=col(run.layer);ctx.beginPath();PCBEDIT.posture(last,end,PE.diag).forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();}
    R.vias.forEach(v=>{ctx.fillStyle='#d8d8d8';ctx.beginPath();ctx.arc(v.x,v.y,0.3,0,TAU);ctx.fill();});ctx.restore();}
  if(PE.cursor&&PE.tool!=='sel'){const p=peSnap(PE.cursor);ctx.save();ctx.strokeStyle='#ffd23f';ctx.lineWidth=lw;const k=Math.max(0.6,8/V2.s);ctx.beginPath();ctx.moveTo(p[0]-k,p[1]);ctx.lineTo(p[0]+k,p[1]);ctx.moveTo(p[0],p[1]-k);ctx.lineTo(p[0],p[1]+k);ctx.stroke();ctx.restore();}
}
/* toolbar */
function peBar(){
  let el=$('#peBar');if(!el){el=document.createElement('div');el.id='peBar';el.className='ov pe-bar';$('#vp').appendChild(el);
    el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ptool)peSetTool(b.dataset.ptool);else if(b.dataset.pact)peAction(b.dataset.pact);else if(b.id==='peDrc')peDrcList();else if(b.id==='peRats'){PE.showRats=!PE.showRats;peBar();draw2D();}else if(b.id==='peSave')peSave();});
    el.addEventListener('change',e=>{if(e.target.id==='peGrid')PE.grid=+e.target.value;if(e.target.id==='peW'){PE.w=+e.target.value;if(PE.route)PE.route.w=peTrackWidth(PE.route.net);}draw2D();});}
  const show=PE.on&&(S.view==='T'||S.view==='B');el.hidden=!show;
  const btn=$('#ctl [data-pe]');if(btn){btn.classList.toggle('on',PE.on);btn.textContent=PE.on?'편집 끝내기':'PCB 편집';}
  if(!show)return;
  el.innerHTML=`<div class="setools" role="toolbar" aria-label="PCB 편집 도구">${PE_TOOLS.map(([t,l,k])=>`<button class="pill vbtn${PE.tool===t?' on':''}" data-ptool="${t}" title="${l} (${k})">${l}<kbd>${k}</kbd></button>`).join('')}
    ${PE_ACTS.map(([a,l,k])=>`<button class="pill vbtn" data-pact="${a}" title="${l} (${k})"${(a==='undo'&&!PE.undo.length)||(a==='redo'&&!PE.redo.length)?' disabled':''}>${l}<kbd>${k}</kbd></button>`).join('')}</div>
    <div class="setools"><label class="pill vbtn">격자 <select id="peGrid" aria-label="격자">${PE_GRIDS.map(g=>`<option value="${g}"${g===PE.grid?' selected':''}>${g} mm</option>`).join('')}</select></label>
    <label class="pill vbtn">트랙 폭 <select id="peW" aria-label="트랙 폭">${PE_WIDTHS.map(w=>`<option value="${w}"${w===PE.w?' selected':''}>${w?w+' mm':'넷 종류별'}</option>`).join('')}</select></label>
    <span class="pill vbtn" title="배선할 층 (비아를 넣으면 바뀜)">층 <b class="${PE.layer==='T'?'c-top':'c-bot'}">${PE.layer==='T'?'상단 F.Cu':'하단 B.Cu'}</b></span>
    <button class="pill vbtn${PE.showRats?' on':''}" id="peRats" title="아직 동박으로 이어지지 않은 연결">래츠네스트 <b>${PE.rats.length}</b></button>
    <button class="pill vbtn${PE.drc.length?' warn':''}" id="peDrc" title="간격·단락·부품 겹침·보드 가장자리 검사">DRC <b>${PE.drc.length}</b></button>
    <button class="pill vbtn" id="peSave" title="KiCad 프로젝트(.kicad_pcb + 회로도)로 저장">KiCad로 저장</button></div>
    <span class="pill hint2" id="peStat"></span>`;
  peStat();
}
function peStat(){const el=$('#peStat');if(!el)return;const c=S.selRef&&BD.byRef[S.selRef];
  const t={sel:c?`${c.ref} · X ${c.x.toFixed(2)} Y ${c.y.toFixed(2)} mm · ${Math.round(c.rot||0)}° · ${c.side==='T'?'상단':'하단'} — 끌어서 이동 · 방향키 ${PE.grid} mm (Shift ×10) · R 회전 · F 뒤집기`:'부품을 끌어서 옮기거나 클릭해 고른 뒤 방향키로 움직입니다.',
    route:PE.route?`${PE.route.net||'(넷 없음)'} · ${PE.route.w} mm — 클릭으로 꺾기 · 같은 넷 패드에서 끝 · V 비아 · / 45° 방향 · Esc 끝`:'배선을 시작할 패드·트랙을 누르세요.',
    via:'비아를 놓을 곳을 누르세요 (트랙 위면 그 넷).',del:'지울 트랙·비아를 누르세요.'}[PE.tool]||'';
  el.textContent=t;const rb=$('#peRats b');if(rb)rb.textContent=PE.rats.length;const db=$('#peDrc b');if(db)db.textContent=PE.drc.length;}
function peSetTool(t){if(PE.route&&t!=='route')peRouteFinish();PE.tool=t;if(t==='route'||t==='via')PE.layer=S.view==='B'?'B':'T';peBar();draw2D();}
function peAction(a){const c=S.selRef&&BD.byRef[S.selRef];
  if(a==='undo')return peUndo();if(a==='redo')return peRedo();
  if(!c){toast('먼저 부품을 고르세요.');return;}
  if(a==='rot')peRotate(c,90);else if(a==='flip')peFlip(c);}
function peDrcList(){peRecalc(true);peBar();const d=PE.drc;if(!d.length){toast('DRC 문제 없음');return;}
  const el=document.createElement('div');el.className='sedlg';el.innerHTML=`<div class="sedlg-in"><b>DRC ${d.length}건</b><ul class="sediff">${d.slice(0,120).map((x,i)=>`<li><button type="button" class="linkbtn" data-d="${i}">보기</button> ${esc(x.msg)}${x.refs&&x.refs.length?` <span class="cls">${esc(x.refs.join(', '))}</span>`:''}</li>`).join('')}</ul>
    <p class="lead" style="margin:0">간격 ${PCBEDIT.DRC_DEF.clear} mm · 구멍 ${PCBEDIT.DRC_DEF.hole} mm · 가장자리 ${PCBEDIT.DRC_DEF.edge} mm 기준. 같은 부품의 패드끼리, 같은 넷끼리는 검사하지 않습니다.</p><div class="acts"><button class="btn sm" data-x>닫기</button></div></div>`;
  $('#vp').appendChild(el);el.addEventListener('click',e=>{if(e.target===el||e.target.closest('[data-x]'))el.remove();const b=e.target.closest('[data-d]');if(b){const x=d[+b.dataset.d];V2.s=Math.max(V2.s,30);const sx=S.view==='B'?BD.W-x.at[0]:x.at[0];V2.ox=vw/2-sx*V2.s;V2.oy=vh/2-(BD.H-x.at[1])*V2.s;el.remove();draw2D();}});}
async function peSave(){
  const base=(BD.name||'board').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'board';const date=new Date().toISOString().slice(0,10);
  const z=new JSZip();z.file(base+'.kicad_pcb',PCBEDIT.toKicadPcb(BD,{title:BD.name,date}));
  const sheets=BD.schSheets||(schData()&&schData().sheets);if(sheets){SCHEDIT.toKicad(sheets,{name:base,title:BD.name,board:BD,date}).forEach(f=>z.file(f.name,f.text));}
  z.file(base+'.kicad_pro',JSON.stringify({meta:{filename:base+'.kicad_pro',version:1},board:{},schematic:{},sheets:[]},null,2));
  const data=await z.generateAsync({type:'uint8array'});offerFile(base+'_kicad.zip',data,'application/zip');
}
// Pcbnew-like keys while editing in the TOP / BOTTOM view
document.addEventListener('keydown',e=>{
  if(!PE.on||!(S.view==='T'||S.view==='B')||S.sch==='full')return;if(e.target.matches('input,select,textarea'))return;
  const k=e.key,ctl=e.ctrlKey||e.metaKey;let done=true;const c=S.selRef&&BD.byRef[S.selRef];
  if(ctl&&(k==='z'||k==='Z')&&!e.shiftKey)peUndo();else if(ctl&&(k==='y'||k==='Y'||((k==='z'||k==='Z')&&e.shiftKey)))peRedo();
  else if(ctl)done=false;
  else if(k.startsWith('Arrow')){if(!c){done=false;}else{const st=PE.grid*(e.shiftKey?10:1);let dx=k==='ArrowLeft'?-st:k==='ArrowRight'?st:0,dy=k==='ArrowUp'?st:k==='ArrowDown'?-st:0;if(S.view==='B')dx=-dx;peNudge(c,dx,dy);}}
  else if(k==='Escape'){if(PE.route){const R=PE.route;const n=R.runs.reduce((a,r)=>a+r.pts.length-1,0);if(n>0)peRouteFinish();else PE.route=null;}else if(PE.tool!=='sel')PE.tool='sel';else{S.selRef=null;refresh(true);}peBar();draw2D();}
  else if(k==='Delete'||k==='Backspace'){if(PE.cursor){const t=PE.tool;PE.tool='del';peClick(PE.cursor);PE.tool=t;}}
  else if(k==='r'||k==='R'){if(c)peRotate(c,e.shiftKey?-90:90);}
  else if(k==='f'||k==='F'){if(c)peFlip(c);}
  else if(k==='x'||k==='X')peSetTool('route');
  else if(k==='v'||k==='V'){if(PE.route)peRouteVia();else peSetTool('via');}
  else if(k==='/'){PE.diag=!PE.diag;draw2D();}
  else done=false;
  if(done){e.preventDefault();e.stopImmediatePropagation();}
},true);
