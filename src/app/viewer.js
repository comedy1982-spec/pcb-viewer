(function(){
"use strict";
const D2R=Math.PI/180,TAU=Math.PI*2;
// panels moved into their own window (copilot.js) keep their ids: $ and $$ look there too
const PANEL_DOCS=new Set();
const $=s=>{const e=document.querySelector(s);if(e)return e;for(const d of PANEL_DOCS){try{const x=d.querySelector(s);if(x)return x;}catch(err){}}return null;};
const $$=s=>{const out=[...document.querySelectorAll(s)];PANEL_DOCS.forEach(d=>{try{out.push(...d.querySelectorAll(s));}catch(err){}});return out;};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- colours ---------- */
const FR4='#c4ad74',CU='#c7763d',CU_PAD='#d98b4f',FIN='#d8b45f',HL='#ffd23f',HOLE='#0b0d0e';
const MASKS={
 green:{mask:'#1e6a3e',under:'#3a9457',silk:'#f4f4ec',name:'그린'},
 black:{mask:'#16181b',under:'#30363b',silk:'#efefe8',name:'매트 블랙'},
 blue:{mask:'#1b3f78',under:'#3765ad',silk:'#f4f4ec',name:'블루'},
 purple:{mask:'#46276c',under:'#7550a3',silk:'#f4f4ec',name:'퍼플'},
 red:{mask:'#8a2020',under:'#b9463f',silk:'#f4f4ec',name:'레드'}};
function dim(hex,k){const n=parseInt(hex.slice(1),16);const r=(n>>16&255)*k|0,g=(n>>8&255)*k|0,b=(n&255)*k|0;return`rgb(${r},${g},${b})`;}

/* ---------- state ---------- */
let BD=null;
const S={cu:null,view:'3d',mask:'green',layers:{cuT:true,cuB:true,silk:true,mask:true,drill:true,body2d:false,body3d:true,ghost:false,inner:true},selRef:null,hlNet:null,explode:0,tab:'sel',q:''};

/* ---------- 2D primitives ---------- */
function rr(ctx,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function outlinePath(ctx){ctx.beginPath();BD.outline.forEach(r=>{ctx.moveTo(r[0][0],r[0][1]);for(let i=1;i<r.length;i++)ctx.lineTo(r[i][0],r[i][1]);ctx.closePath();});}
function circ(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function padPath(ctx,p,grow){
  ctx.save();ctx.translate(p.x,p.y);if(p.ang)ctx.rotate(p.ang*D2R);ctx.beginPath();
  const w=(p.w||0)+2*grow,h=(p.h||0)+2*grow;
  switch(p.shape){
    case'circle':ctx.arc(0,0,w/2,0,TAU);break;
    case'oval':rr(ctx,-w/2,-h/2,w,h,Math.min(w,h)/2);break;
    case'roundrect':rr(ctx,-w/2,-h/2,w,h,(p.rr||0)+grow);break;
    case'parts':p.parts.forEach(q=>{if(q.c){ctx.moveTo(q.c[0]+q.c[2]+grow,q.c[1]);ctx.arc(q.c[0],q.c[1],q.c[2]+grow,0,TAU);}else{const v=q.p;ctx.moveTo(v[0][0],v[0][1]);for(let k=1;k<v.length;k++)ctx.lineTo(v[k][0],v[k][1]);ctx.closePath();}});break;
    default:if(p.rr)rr(ctx,-w/2,-h/2,w,h,p.rr+grow);else ctx.rect(-w/2,-h/2,w,h);
  }
  ctx.fill('nonzero');ctx.restore();
}
function drawText(ctx,p){
  let a=((p.ang||0)%360+360)%360;if(a>90.5&&a<=270.5)a-=180;
  const k=p.size*1.3/20;ctx.save();ctx.translate(p.x,p.y);if(a)ctx.rotate((p.mir?-a:a)*D2R);ctx.scale(p.mir?-k:k,-k);
  ctx.font=(p.bold?700:600)+' 20px "JetBrains Mono", ui-monospace, monospace';ctx.textAlign=p.align||'center';ctx.textBaseline='middle';ctx.fillText(p.s,0,0);ctx.restore();
}
function drawPour(ctx,p,layer,fill,clear){
  ctx.fillStyle=fill;ctx.beginPath();rr(ctx,p.inset,p.inset,BD.W-2*p.inset,BD.H-2*p.inset,p.r||0);ctx.fill();
  ctx.fillStyle=clear;ctx.strokeStyle=clear;const c=p.clr;
  layer.forEach(q=>{if(q===p||q.net===p.net||q.clear)return;
    if(q.t==='seg'){ctx.lineWidth=q.w+2*c;ctx.beginPath();ctx.moveTo(q.a[0],q.a[1]);ctx.lineTo(q.b[0],q.b[1]);ctx.stroke();}
    else if(q.t==='path'){ctx.lineWidth=q.w+2*c;ctx.beginPath();q.pts.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.stroke();}
    else if(q.t==='pad')padPath(ctx,q,c);});
  BD.vias.forEach(v=>{if(v.net!==p.net)circ(ctx,v.x,v.y,v.d/2+c);});
  BD.drills.forEach(d=>{if(!d.plated)circ(ctx,d.x,d.y,d.d/2+2*c);});
}
function drawPrims(ctx,prims,colFn,extra){
  let open=false,bw=-1,bc=null;const flush=()=>{if(open){ctx.stroke();open=false;}};
  for(let i=0;i<prims.length;i++){
    const p=prims[i];const c=colFn(p);if(!c)continue;
    if(p.t==='seg'||p.t==='path'){
      const w=p.w>0.02?p.w:0.02;
      if(!open||w!==bw||c!==bc){flush();ctx.strokeStyle=c;ctx.lineWidth=w;bw=w;bc=c;ctx.beginPath();open=true;}
      if(p.t==='seg'){ctx.moveTo(p.a[0],p.a[1]);ctx.lineTo(p.b[0],p.b[1]);}
      else{const q=p.pts;ctx.moveTo(q[0][0],q[0][1]);for(let k=1;k<q.length;k++)ctx.lineTo(q[k][0],q[k][1]);}
      continue;
    }
    flush();ctx.fillStyle=c;
    if(p.t==='pad')padPath(ctx,p,0);
    else if(p.t==='poly'){ctx.beginPath();p.rings.forEach(r=>{ctx.moveTo(r[0][0],r[0][1]);for(let k=1;k<r.length;k++)ctx.lineTo(r[k][0],r[k][1]);ctx.closePath();});ctx.fill('evenodd');}
    else if(p.t==='circle')circ(ctx,p.x,p.y,p.r);
    else if(p.t==='text')drawText(ctx,p);
    else if(p.t==='pour')drawPour(ctx,p,prims,c,extra&&extra.clear);
  }
  flush();
}
function brackets(ctx,bb,color,w){
  const m=0.45,x0=bb[0]-m,y0=bb[1]-m,x1=bb[2]+m,y1=bb[3]+m,L=Math.min(1.4,(x1-x0)/3,(y1-y0)/3);
  ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='square';ctx.beginPath();
  [[x0,y0,1,1],[x1,y0,-1,1],[x1,y1,-1,-1],[x0,y1,1,-1]].forEach(([x,y,sx,sy])=>{ctx.moveTo(x+sx*L,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*L);});ctx.stroke();ctx.lineCap='round';
}
function bodyColor(c){
  const k=c.kind,r=c.ref[0];
  if(k==='chip')return r==='C'?'#a8835a':r==='L'?'#3b3d40':'#1f1f20';
  return{diode:'#1f1f20',motor:'#b8bdc2',ic:'#1d1e21',usb:'#a9afb4',conn:'#2b2c2f',xtal:'#b8bdc2',btn:'#2a2d31',hdr:'#151617',led:'#e6ece6',elcap:'#aeb4ba',tht2:r==='C'?'#2c4f8a':r==='R'?'#d8c9a3':'#232425',box:'#6b7076'}[k]||'#6b7076';
}
const padOn=(p,side)=>p.side==='both'||p.side===side||!p.side;
// the inner copper layer shown in the 2D view (null = the outer layer of `side`)
const innerKey=(side,o)=>{const k=o&&o.cu!==undefined?o.cu:S.cu;return side==='T'&&k&&!(o&&o.texture)&&BD&&BD.layers[k+'.cu']?k:null;};
const CORE='#4a4230',CU_IN='#d4844a';
function drawSide(ctx,side,o){
  const L=S.layers,M=MASKS[S.mask];const ik=innerKey(side,o);
  const base=ik?CORE:L.mask?M.mask:FR4,cu=ik?CU_IN:L.mask?M.under:CU,fin=ik?CU_IN:L.mask?FIN:CU_PAD;
  const cuOn=ik?true:side==='T'?L.cuT:L.cuB,cuL=ik?BD.layers[ik+'.cu']:BD.layers[side+'.cu'],oth=BD.layers[(side==='T'&&!ik?'B':'T')+'.cu'];
  // through pads cross every inner layer: the plated barrel's annular ring is copper there too
  const thru=ik?BD.layers['T.cu'].filter(p=>p.t==='pad'&&!p.clear&&!p.via&&(p.side==='both'||p.drill)):null;
  ctx.save();
  outlinePath(ctx);ctx.fillStyle=base;ctx.fill('evenodd');
  outlinePath(ctx);ctx.clip('evenodd');
  ctx.lineCap='round';ctx.lineJoin='round';
  if(L.ghost){const g='rgba(255,255,255,.15)';drawPrims(ctx,oth,p=>p.clear||p.t==='text'||p.t==='pour'?null:g);}
  if(cuOn){
    drawPrims(ctx,cuL,p=>p.t==='pad'?null:p.clear?base:cu,{clear:base});
    ctx.fillStyle=cu;BD.vias.forEach(v=>circ(ctx,v.x,v.y,v.d/2));
    drawPrims(ctx,cuL,p=>p.t!=='pad'?null:p.clear?base:p.via?cu:fin);
    if(thru)drawPrims(ctx,thru,()=>fin);
  }
  // inner signal layers (multilayer boards): seen through the board, one colour per layer
  if(!ik&&L.inner&&!o.texture&&(BD.copperLayers||2)>2){const IC=['#4fc38a','#c46bd6','#e0b341','#58b6e0','#e07a58','#9aa0ff'];let j=0;
    ctx.save();ctx.globalAlpha=0.7;PCB.stackOf(BD).forEach(x=>{if(x.k==='T'||x.k==='B'||x.role!=='sig')return;const col=IC[j++%IC.length];drawPrims(ctx,BD.layers[x.k+'.cu'],p=>(p.t==='seg'||p.t==='path')&&!p.clear?col:null);});ctx.restore();}
  if(L.silk&&!ik)drawPrims(ctx,BD.layers[side+'.silk'],p=>p.clear?base:M.silk);
  drawOverlay(ctx,side);
  if(S.hlNet){
    outlinePath(ctx);ctx.fillStyle='rgba(0,0,0,.52)';ctx.fill('evenodd');
    const n=S.hlNet;
    drawPrims(ctx,cuL,p=>p.net===n&&!p.clear?(p.t==='pour'?'rgba(255,210,63,.55)':HL):null,{clear:dim(base,0.48)});
    if(thru)drawPrims(ctx,thru,p=>p.net===n?HL:null);
    ctx.fillStyle=HL;BD.vias.forEach(v=>{if(v.net===n)circ(ctx,v.x,v.y,v.d/2);});
  }
  // holes
  BD.drills.forEach(d=>{if(!d.plated||L.drill){ctx.fillStyle=HOLE;
    if(d.x2!=null){ctx.strokeStyle=HOLE;ctx.lineWidth=d.d;ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x2,d.y2);ctx.stroke();}
    else if(d.w&&d.h&&Math.abs(d.w-d.h)>0.01){ctx.save();ctx.translate(d.x,d.y);ctx.rotate((d.ang||0)*D2R);ctx.beginPath();rr(ctx,-d.w/2,-d.h/2,d.w,d.h,Math.min(d.w,d.h)/2);ctx.fill();ctx.restore();}
    else circ(ctx,d.x,d.y,d.d/2);}});
  if(L.drill){ctx.fillStyle=HOLE;BD.vias.forEach(v=>circ(ctx,v.x,v.y,v.drill/2));}
  const sel=S.selRef&&BD.byRef[S.selRef];
  if(sel&&(sel.side===side||sel.pads.some(p=>p.side==='both'))){
    if(!S.hlNet){ctx.fillStyle='rgba(255,210,63,.9)';sel.pads.forEach(p=>{if(ik?p.side==='both'||p.drill:padOn(p,side))padPath(ctx,p,0);});}
    if(sel.side===side&&!ik)brackets(ctx,sel.bb,HL,Math.max(0.15,BD.W/400));
  }
  if(!ik&&o.hover&&o.hover!==sel&&o.hover.side===side)brackets(ctx,o.hover.bb,'rgba(255,255,255,.75)',Math.max(0.1,BD.W/600));
  if(!ik&&!o.texture&&typeof recDraw==='function'&&typeof HS!=='undefined'&&HS.ws==='board')recDraw(ctx,side,o);
  ctx.restore();
  if(L.body2d&&!o.texture&&!ik){
    BD.comps.forEach(c=>{if(c.side!==side||c.kind==='none')return;const b=c.body;if(!(b.w>0&&b.h>0))return;
      ctx.save();ctx.translate(b.cx,b.cy);ctx.rotate(b.ang*D2R);ctx.globalAlpha=0.82;ctx.fillStyle=bodyColor(c);ctx.beginPath();rr(ctx,-b.w/2,-b.h/2,b.w,b.h,Math.min(0.15,b.w/6));ctx.fill();
      ctx.globalAlpha=1;ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=0.06;ctx.stroke();ctx.restore();
      const light=/^(usb|xtal|led)$/.test(c.kind)||(c.kind==='chip'&&c.ref[0]==='C')||(c.kind==='tht2'&&c.ref[0]==='R');
      ctx.fillStyle=light?'#111':'#fff';const sz=Math.max(0.35,Math.min(1.5,Math.min(b.w,b.h)*0.34));
      drawText(ctx,{s:c.ref,x:b.cx,y:b.cy,size:sz,ang:0,mir:side==='B',bold:true});
    });
  }
}

/* ---------- hit testing ---------- */
function inPad(p,x,y,g){
  const dx=x-p.x,dy=y-p.y;if(p.shape==='circle')return Math.hypot(dx,dy)<=p.w/2+g;
  const a=-(p.ang||0)*D2R,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
  if(p.lbb)return lx>=p.lbb[0]-g&&lx<=p.lbb[2]+g&&ly>=p.lbb[1]-g&&ly<=p.lbb[3]+g;
  return Math.abs(lx)<=p.w/2+g&&Math.abs(ly)<=p.h/2+g;
}
function hit(x,y,side,tol,cu){
  if(!BD||x<-1||y<-1||x>BD.W+1||y>BD.H+1)return null;
  const ik=innerKey(side,cu!==undefined?{cu}:undefined);const L=ik?BD.layers[ik+'.cu'].concat(BD.layers['T.cu'].filter(p=>p.t==='pad'&&(p.side==='both'||p.drill))):BD.layers[side+'.cu'],cuOn=ik?true:side==='T'?S.layers.cuT:S.layers.cuB;if(ik)side=ik;
  if(cuOn){
    for(let i=L.length-1;i>=0;i--){const p=L[i];if(p.t==='pad'&&!p.clear&&!p.via&&inPad(p,x,y,tol*0.3))return{type:'pad',p,c:p.ref?BD.byRef[p.ref]:null,net:p.net};}
    for(const v of BD.vias)if(Math.hypot(x-v.x,y-v.y)<=v.d/2+tol*0.3)return{type:'via',v,net:v.net};
    for(let i=L.length-1;i>=0;i--){const p=L[i];if(p.t==='pad'&&p.via&&!p.clear&&inPad(p,x,y,0))return{type:'via',net:p.net};}
    for(let i=L.length-1;i>=0;i--){const t=L[i];if(t.clear)continue;
      if(t.t==='seg'){if(PCB.segDist(x,y,t.a,t.b)<=t.w/2+tol)return{type:'track',t,net:t.net,side};}
      else if(t.t==='path'){for(let k=1;k<t.pts.length;k++)if(PCB.segDist(x,y,t.pts[k-1],t.pts[k])<=t.w/2+tol)return{type:'track',t,net:t.net,side};}}
  }
  for(const c of BD.comps){if(ik||c.side!==side||c.kind==='none')continue;const b=c.body;if(!(b.w>0))continue;
    const dx=x-b.cx,dy=y-b.cy,a=-b.ang*D2R,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
    if(Math.abs(lx)<=b.w/2&&Math.abs(ly)<=b.h/2)return{type:'comp',c};}
  if(cuOn){for(let i=L.length-1;i>=0;i--){const p=L[i];
    if(p.t==='poly'&&!p.clear&&p.net){let inside=false;p.rings.forEach(r=>{if(PCB.inRing(x,y,r))inside=!inside;});if(inside)return{type:'zone',net:p.net,side};}
    if(p.t==='pour'&&x>p.inset&&y>p.inset&&x<BD.W-p.inset&&y<BD.H-p.inset)return{type:'zone',net:p.net,side,pour:true};}}
  return null;
}
function applyHit(h){
  if(h&&(h.type==='none'||(h.type==='zone'&&h.pour)))h=null;
  if(!h){S.selRef=null;S.hlNet=null;}
  else if(h.type==='pad'){S.selRef=h.c?h.c.ref:null;S.hlNet=h.net||null;}
  else if(h.type==='comp'){S.selRef=h.c.ref;S.hlNet=null;}
  else{S.selRef=null;S.hlNet=h.net||null;}
  S.tab='sel';refresh(true);
}
const sideKo=k=>k==='T'?'상단':k==='B'?'하단':`내층 ${k}`;
function tipHTML(h){
  if(!h)return'';const net=h.net?` <span class="net">${esc(h.net)}</span>`:'';
  if(h.type==='pad'){const ref=h.p.ref?`${esc(h.p.ref)}${h.p.n!=null?'.'+esc(h.p.n):''}`:'패드';return`<b>${ref}</b> ${esc(h.p.fn||'')}${net}`;}
  if(h.type==='comp')return`<b>${esc(h.c.ref)}</b> ${esc(h.c.val)}`;
  if(h.type==='via')return`비아${net}`;
  if(h.type==='track')return`트랙 ${sideKo(h.side)} · ${(+h.t.w).toFixed(2)} mm${net}`;
  if(h.type==='zone')return`${sideKo(h.side)} 동박면${net}`;
  return'';
}

/* ---------- 2D view ---------- */
const vp=$('#vp'),cv2=$('#cv2'),cv3=$('#cv3'),ctx2=cv2.getContext('2d'),tip=$('#tip');
let dpr=1,vw=0,vh=0;const V2={s:10,ox:0,oy:0};let hover2=null,raf2=0;
function fit2(){if(!BD||!vw)return;V2.s=Math.min((vw-48)/BD.W,(vh-96)/BD.H);V2.ox=(vw-BD.W*V2.s)/2;V2.oy=(vh-BD.H*V2.s)/2;}
function draw2D(){if(raf2)return;raf2=requestAnimationFrame(()=>{raf2=0;paint2D();});}
function paint2D(){
  if(S.view==='3d'||S.sch==='full'||!BD)return;
  ctx2.setTransform(1,0,0,1,0,0);ctx2.clearRect(0,0,cv2.width,cv2.height);
  const mir=S.view==='B',s=V2.s;
  ctx2.setTransform(dpr*s*(mir?-1:1),0,0,-dpr*s,dpr*(V2.ox+(mir?BD.W*s:0)),dpr*(V2.oy+BD.H*s));
  ctx2.save();ctx2.shadowColor='rgba(0,0,0,.35)';ctx2.shadowBlur=22*dpr;ctx2.shadowOffsetY=8*dpr;outlinePath(ctx2);ctx2.fillStyle='#000';ctx2.fill('evenodd');ctx2.restore();
  drawSide(ctx2,S.view,{hover:hover2&&hover2.type==='comp'?hover2.c:null});
  if(PE&&PE.on)peOverlay(ctx2,S.view);
  updateScale();
}
function s2w(px,py){let x=(px-V2.ox)/V2.s;if(S.view==='B')x=BD.W-x;return[x,BD.H-(py-V2.oy)/V2.s];}
function zoomAt(px,py,f){const[wx,wy]=s2w(px,py);V2.s=Math.max(1,Math.min(600,V2.s*f));const sx=S.view==='B'?BD.W-wx:wx;V2.ox=px-sx*V2.s;V2.oy=py-(BD.H-wy)*V2.s;draw2D();}
function updateScale(){const target=110/V2.s,steps=[0.1,0.2,0.5,1,2,5,10,20,50,100];let mm=steps[0];steps.forEach(s=>{if(s<=target)mm=s;});$('#scaleBar').style.width=(mm*V2.s)+'px';$('#scaleTxt').textContent=mm+' mm';}
(function(){
  const pts=new Map();let start=null,moved=0,pinch=0,hq=null,hraf=0,edPtr=null;
  const pos=e=>{const r=cv2.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  cv2.addEventListener('pointerdown',e=>{cv2.setPointerCapture(e.pointerId);
    if(PE.on&&e.button===0&&pts.size===0&&BD){const[px,py]=pos(e);if(peDown(s2w(px,py))){edPtr=e.pointerId;cv2.classList.add('moving');return;}}
    pts.set(e.pointerId,pos(e));moved=0;start=pos(e);cv2.classList.add('drag');
    if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  const hoverRun=()=>{hraf=0;if(!hq||!BD)return;const p=hq;const[wx,wy]=s2w(p[0],p[1]);
    $('#coord').textContent=(wx>=0&&wx<=BD.W&&wy>=0&&wy<=BD.H)?`X ${wx.toFixed(2)} · Y ${wy.toFixed(2)} mm`:'X — · Y — mm';
    const h=hit(wx,wy,S.view,3/V2.s);const was=hover2&&hover2.type==='comp'?hover2.c:null;hover2=h;
    if((h&&h.type==='comp'?h.c:null)!==was)draw2D();
    const extra=overlayTip(h,wx,wy);if(h||extra){tip.innerHTML=(h?tipHTML(h):'')+extra;tip.hidden=false;tipAt(cv2,p[0],p[1]);cv2.style.cursor=h?'pointer':'';}else{tip.hidden=true;cv2.style.cursor='';}};
  cv2.addEventListener('pointermove',e=>{
    const p=pos(e);
    if(PE.on&&BD){const w=s2w(p[0],p[1]);if(edPtr===e.pointerId){peDrag(w);tip.hidden=true;return;}pePoint(w);}
    if(pts.has(e.pointerId)){
      const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);
      if(pts.size===1){V2.ox+=p[0]-prev[0];V2.oy+=p[1]-prev[1];moved+=Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]);draw2D();}
      else if(pts.size===2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/pinch);pinch=d;moved=99;}
      tip.hidden=true;return;
    }
    hq=p;if(!hraf)hraf=requestAnimationFrame(hoverRun);
  });
  const end=e=>{if(edPtr===e.pointerId){edPtr=null;cv2.classList.remove('moving');peUp();return;}if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);cv2.classList.remove('drag');
    if(pts.size===0&&moved<5&&start&&e.type==='pointerup'&&BD){const[wx,wy]=s2w(start[0],start[1]);if(PE.on)peClick([wx,wy]);else applyHit(hit(wx,wy,S.view,3/V2.s));}
    if(pts.size<2)pinch=0;};
  cv2.addEventListener('pointerup',end);cv2.addEventListener('pointercancel',end);
  cv2.addEventListener('pointerleave',()=>{hq=null;tip.hidden=true;if(hover2){hover2=null;draw2D();}});
  cv2.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pos(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  cv2.addEventListener('dblclick',()=>{if(PE.on&&peDbl())return;if(PE.on&&PE.tool!=='sel')return;fit2();draw2D();});
})();

/* ---------- 3D view ---------- */
let G3=null;const MAT={};
function mats(){
  if(MAT.ok)return MAT;const M=o=>new THREE.MeshStandardMaterial(o);
  Object.assign(MAT,{ok:1,black:M({color:0x1b1c1f,roughness:0.55}),plastic:M({color:0x161718,roughness:0.75}),steel:M({color:0xc8ced3,metalness:0.85,roughness:0.32}),
    tin:M({color:0xd7dbde,metalness:0.75,roughness:0.3}),gold:M({color:0xd9b25a,metalness:0.85,roughness:0.28}),cap:M({color:0xa8835a,roughness:0.6}),
    res:M({color:0x1e1e1f,roughness:0.6}),ind:M({color:0x3b3d40,roughness:0.6}),ledBody:M({color:0xeef2ee,roughness:0.4}),lens:M({color:0x7dffa8,emissive:0x1fd060,emissiveIntensity:0.9,transparent:true,opacity:0.85,roughness:0.2}),
    ceramic:M({color:0xd8d1c0,roughness:0.7}),btnBase:M({color:0x2b2e32,roughness:0.6}),act:M({color:0x202225,roughness:0.5}),dark:M({color:0x0a0a0a,roughness:0.9}),
    elec:M({color:0x2c4f8a,roughness:0.45}),beige:M({color:0xd8c9a3,roughness:0.6}),grey:M({color:0x4a4f55,roughness:0.65}),conn:M({color:0x2b2c2f,roughness:0.7}),
    edge:M({color:0xbfa66b,roughness:0.85})});
  return MAT;
}
function box(w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x||0,y||0,(z||0)+d/2);return m;}
let markCount=0;
function markTex(lines,bw,bh,dot){
  const c=document.createElement('canvas'),k=Math.min(96,512/Math.max(bw,bh));c.width=Math.max(8,Math.round(bw*k));c.height=Math.max(8,Math.round(bh*k));const g=c.getContext('2d');
  g.fillStyle='#1b1c1f';g.fillRect(0,0,c.width,c.height);
  const fs=Math.max(6,Math.round(Math.min(c.width/(Math.max(...lines.map(l=>l.length))*0.68),c.height*0.22)));g.fillStyle='#8d9297';g.font=`500 ${fs}px "JetBrains Mono", monospace`;g.textAlign='center';g.textBaseline='middle';
  lines.forEach((l,i)=>g.fillText(l,c.width/2,c.height/2+(i-(lines.length-1)/2)*fs*1.35));
  if(dot){g.fillStyle='#3a3d42';g.beginPath();g.arc(fs*0.9,fs*0.9,fs*0.35,0,TAU);g.fill();}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
}
function ledColor(c){const t=(c.val+' '+c.mpn+' '+(c.desc||'')).toLowerCase();
  return new THREE.Color(/빨|적색|red|630|625|r6c/.test(t)?0xff3b2f:/파랑|청색|blue|470|465/.test(t)?0x3d8bff:/노랑|황색|yellow|amber|590|585/.test(t)?0xffc23d:/흰|백색|white/.test(t)?0xf4f6ff:0x3dff7a);}
let GLOW=null;function glowTex(){if(GLOW)return GLOW;const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.25,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);GLOW=new THREE.CanvasTexture(c);return GLOW;}
function build3D(c){
  const m=mats(),outer=new THREE.Group(),inner=new THREE.Group();outer.add(inner);
  const b=c.body,f=c.f,T=BD.t;
  if(f){outer.position.set(c.x,c.y,0);outer.rotation.z=c.rot*D2R;}else{outer.position.set(b.cx,b.cy,0);outer.rotation.z=b.ang*D2R;}
  if(c.side==='B')inner.rotation.y=Math.PI;
  const bw=b.w,bh=b.h,ht=b.ht,k=c.kind;
  if(k==='chip'||k==='led'||k==='diode'){
    const e=bw*0.2;inner.add(box(e,bh,ht,m.tin,-(bw/2-e/2),0,0),box(e,bh,ht,m.tin,bw/2-e/2,0,0));
    if(k==='led'){
      // each LED gets its own lens material and an additive glow sprite, driven by the circuit simulation
      const col=ledColor(c),lens=new THREE.MeshStandardMaterial({color:col.clone().lerp(new THREE.Color(0xffffff),0.35),emissive:col,emissiveIntensity:0.06,transparent:true,opacity:0.88,roughness:0.2});
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color:col,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));
      glow.position.set(0,0,ht+0.25);glow.visible=false;glow.userData.noPick=true;
      inner.add(box(bw-2*e,bh*0.98,ht*0.55,m.ledBody,0,0,0),box(bw-2*e,bh*0.8,ht*0.45,lens,0,0,ht*0.55),glow);outer.userData.led={mat:lens,glow,b:0};}
    else if(k==='diode')inner.add(box(bw-2*e,bh*0.98,ht*0.98,m.res,0,0,0),box(Math.max(0.3,bw*0.08),bh*0.99,ht*1.0,m.ceramic,(c.pads[0]&&c.pads[0].n==='1'&&/^(K|C)$/i.test(c.pads[0].fn||'')?-1:1)*(bw/2-e-bw*0.08),0,0.005));
    else inner.add(box(bw-2*e,bh*0.98,ht*0.98,c.ref[0]==='C'?m.cap:c.ref[0]==='L'?m.ind:m.res,0,0,0));
  }else if(k==='motor'){
    // can lying along local +x on a bracket, a lead post per pad, fan on the shaft; dimensions scale with the body (130 DC can = 24 mm)
    const k3=bw/24,bl3=f&&f.pads.length>=6,r=Math.min(bh,ht)/2-0.3,zc=ht-r,cyl=(rr,len,mat,x,seg)=>{const g=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,len,seg||40),mat);g.rotation.z=Math.PI/2;g.position.set(x,0,zc);return g;};
    inner.add(box(bw*0.62,bh*0.82,zc-r*0.55,m.conn,-1*k3,0,0));
    inner.add(cyl(r,17*k3,bl3?m.grey:m.steel,-1.5*k3),cyl(r*0.96,2.4*k3,bl3?m.black:m.beige,-11.2*k3),cyl(r*0.42,1.2*k3,m.steel,7.6*k3,24),cyl(0.9*k3,5.6*k3,m.steel,10.6*k3,16));
    if(bl3)inner.add(cyl(r*1.01,1.2*k3,m.elec,4.5*k3));
    (f?f.pads:[{x:-14,y:2.5},{x:-14,y:-2.5}]).forEach(p=>inner.add(box(0.5,Math.min(1.2,2.5*0.5),zc-r*0.15,m.tin,p.x+1.1,p.y,0)));
    const rot=new THREE.Group();rot.position.set(13.2*k3,0,zc);
    const prop=m.prop||(m.prop=new THREE.MeshStandardMaterial({color:0xe8590c,roughness:0.5}));
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(1.9*k3,1.9*k3,2.6*k3,28),m.plastic);hub.rotation.z=Math.PI/2;rot.add(hub);
    const nb=bl3?5:3;for(let i=0;i<nb;i++){const a=i*TAU/nb,bl=new THREE.Group();bl.rotation.x=a;const blade=box(0.7*k3,2.9*k3,5.6*k3,i===0?m.ceramic:prop,0,0,1.6*k3);blade.rotation.y=0.35;bl.add(blade);rot.add(bl);}
    inner.add(rot);outer.userData.rotor=rot;
  }else if(k==='ic'){
    const st=f?(f.stand||0):(c.pads.some(p=>p.drill)?0.5:0.05);
    let top=m.black;if(bw*bh>=4&&markCount<160){markCount++;const lines=f?({'STM32F042K6U6':['STM32','F042K6','U6 GH24'],'AMS1117-3.3':['AMS1117','3.3 2638'],'W25Q32JV':['25Q32JV','SIQ 2635'],'DRV8313':['DRV8313','TI 2B4'],'TC364DP':['AURIX','TC364DP','64F300F'],'TLE9251V':['TLE9251V'],'AMS1117-5.0':['AMS1117','5.0 2641']}[c.val]||[c.val]):[c.ref,(c.val||'').slice(0,12)].filter(Boolean);
      top=new THREE.MeshStandardMaterial({map:markTex(lines,bw,bh,f?!!f.dot:true),roughness:0.55});}
    inner.add(box(bw,bh,ht,[m.black,m.black,m.black,m.black,top,m.black],0,0,st));
    if(f)f.pads.forEach(p=>{
      if(p.n==='33')return;
      if(st===0){inner.add(box(p.w*0.75,p.h*0.75,0.06,m.tin,p.x,p.y,0));return;}
      if(Math.abs(p.x)>bw/2){const sx=Math.sign(p.x),len=Math.abs(p.x)-bw/2+0.2;inner.add(box(p.w*0.7,p.h*0.75,0.12,m.tin,p.x,p.y,0),box(len,p.h*0.75,0.12,m.tin,sx*(bw/2+len/2-0.2),p.y,st+ht*0.35));}
      else{const sy=Math.sign(p.y),len=Math.abs(p.y)-bh/2+0.2;inner.add(box(p.w*0.75,p.h*0.7,0.12,m.tin,p.x,p.y,0),box(p.w*0.75,len,0.12,m.tin,p.x,sy*(bh/2+len/2-0.2),st+ht*0.35));}
    });
  }else if(k==='elcap'){
    const r=Math.min(bw,bh)/2-0.15,base=Math.min(1.1,ht*0.12),hc=ht-base;
    const alu=m.alu||(m.alu=new THREE.MeshStandardMaterial({color:0xc9ced3,metalness:0.8,roughness:0.32}));
    inner.add(box(bw,bh,base,m.black,0,0,0));
    const can=new THREE.Mesh(new THREE.CylinderGeometry(r,r,hc,48),alu);can.rotation.x=Math.PI/2;can.position.z=base+hc/2;inner.add(can);
    const band=m.band||(m.band=new THREE.MeshStandardMaterial({color:0x111418,roughness:0.5}));
    const top=new THREE.Mesh(new THREE.CircleGeometry(r*0.995,48,-Math.PI/3,2*Math.PI/3),band);top.position.z=ht+0.01;inner.add(top);
    const vent=new THREE.Mesh(new THREE.RingGeometry(r*0.18,r*0.24,32),m.steel||alu);vent.position.z=ht+0.02;inner.add(vent);
    if(f)f.pads.forEach(p=>inner.add(box(p.w*0.85,0.9,0.12,m.tin,p.x,p.y,0)));
  }else if(k==='usb'){
    inner.add(box(bw,bh,ht,m.steel,0,0,0),box(0.06,bh*0.8,ht*0.55,m.dark,-bw/2-0.03,0,ht*0.22));
    if(f)f.pads.forEach(p=>inner.add(box(p.w*0.8,p.h*0.6,0.1,m.tin,p.x,p.y,0)));
  }else if(k==='xtal'){inner.add(box(bw,bh,Math.min(0.3,ht*0.3),m.ceramic,0,0,0),box(bw-0.3,bh-0.3,ht*0.7,m.steel,0,0,Math.min(0.3,ht*0.3)));}
  else if(k==='btn'){
    inner.add(box(bw,bh,ht*0.57,m.btnBase,0,0,0),box(bw*0.95,bh*0.95,0.25,m.steel,0,0,ht*0.57));
    const r=Math.min(bw,bh)*0.29;const cy=new THREE.Mesh(new THREE.CylinderGeometry(r,r,ht*0.37,32),m.act);cy.rotation.x=Math.PI/2;cy.position.z=ht*0.64+ht*0.185;inner.add(cy);
    if(f)f.pads.forEach(p=>inner.add(box(1.2,0.7,0.12,m.tin,p.x,p.y,0)));
  }else if(k==='sealhdr'&&f&&f.seal){
    // sealed right-angle header: flange, hollow shroud with the pin field, latch ramp, pins bent down behind the flange, board-lock pegs
    const q=f.seal,sh=q.shroud,wt=1.1,x0=sh.x0,x1=q.flangeX,L=x1-x0,zc=(sh.z0+sh.z1)/2;
    inner.add(box(q.flangeT,2*q.flange.y,q.flange.z1-q.flange.z0,m.plastic,x1+q.flangeT/2,0,q.flange.z0));
    inner.add(box(3.4,2*q.rear.y,q.rear.z1,m.plastic,x1+q.flangeT+1.7,0,0));
    inner.add(box(L,2*sh.y,wt,m.plastic,x0+L/2,0,sh.z0),box(L,2*sh.y,wt,m.plastic,x0+L/2,0,sh.z1-wt),box(L,wt,sh.z1-sh.z0,m.plastic,x0+L/2,sh.y-wt/2,sh.z0),box(L,wt,sh.z1-sh.z0,m.plastic,x0+L/2,-sh.y+wt/2,sh.z0));
    inner.add(box(0.3,2*sh.y-2*wt,sh.z1-sh.z0-2*wt,m.dark||m.black,x1-0.15,0,sh.z0+wt));
    inner.add(box(4,4.4,1.0,m.plastic,x0+3.2,0,sh.z1),box(1.2,4.4,1.8,m.plastic,x0+1.4,0,sh.z1));
    f.pads.forEach(p=>{if(!/^\d+$/.test(p.n)){inner.add(box(1.4,1.4,2.6,m.plastic,p.x,p.y,-2.4));return;}
      const zr=+p.n<=6?zc-1.25:zc+1.25,xb=x1+q.flangeT+3.4;
      inner.add(box(x1-(x0+1.6),0.64,0.64,m.gold,(x0+1.6+x1)/2,p.y,zr-0.32),box(p.x-xb+0.32,0.64,0.64,m.tin,(xb+p.x)/2,p.y,zr-0.32),box(0.64,0.64,zr+2.6,m.tin,p.x,p.y,-2.6));});
  }else if(k==='hdr'){inner.add(box(bw,bh,ht,m.plastic,0,0,0));f.pads.forEach(p=>inner.add(box(0.64,0.64,11.5,m.gold,p.x,p.y,-3.0)));}
  else if(k==='conn'){inner.add(box(bw,bh,ht,/USB/i.test(c.fp)?m.steel:m.conn,0,0,0));}
  else if(k==='tht2'){
    if(c.ref[0]==='C'&&Math.abs(bw-bh)<0.3*Math.max(bw,bh)){const cy=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(bw,bh)/2,Math.min(bw,bh)/2,Math.max(ht,Math.min(bw,bh)*1.4),32),m.elec);cy.rotation.x=Math.PI/2;cy.position.z=Math.max(ht,Math.min(bw,bh)*1.4)/2+0.3;inner.add(cy);}
    else{const r=Math.min(bw,bh)/2;const cy=new THREE.Mesh(new THREE.CylinderGeometry(r,r,Math.max(bw,bh),24),c.ref[0]==='R'?m.beige:c.ref[0]==='C'?m.elec:m.black);if(bw>=bh)cy.rotation.z=Math.PI/2;cy.position.z=r+0.4;inner.add(cy);}
  }else inner.add(box(bw,bh,ht,m.grey,0,0,0));
  outer.traverse(o=>{o.userData.ref=c.ref;});
  return outer;
}
function texSize(){const k=Math.min(4096/BD.W,4096/BD.H,48);return[Math.max(64,Math.round(BD.W*k)),Math.max(64,Math.round(BD.H*k)),k];}
function updateTextures(){
  if(!G3||!G3.board)return;const[TW,TH,K]=G3.ts;
  ['T','B'].forEach(side=>{const cv=G3.texCv[side],ctx=cv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,TW,TH);ctx.setTransform(K,0,0,-K,0,TH);drawSide(ctx,side,{texture:true});G3.tex[side].needsUpdate=true;});
  G3.dirty=true;G3.ver=(G3.ver||0)+1;
}
function init3D(){
  if(G3)return true;
  const fail=msg=>{vp.insertAdjacentHTML('beforeend',`<div class="nogl">${msg}</div>`);return false;};
  if(!window.THREE)return fail('3D 라이브러리를 불러오지 못했습니다. TOP·BOTTOM 보기를 사용하세요.');
  let renderer;try{renderer=new THREE.WebGLRenderer({canvas:cv3,antialias:true,alpha:true});}catch(err){return fail('이 브라우저에서 WebGL을 사용할 수 없습니다. TOP·BOTTOM 보기를 사용하세요.');}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputEncoding=THREE.sRGBEncoding;
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(30,1,0.5,5000);cam.up.set(0,0,1);
  scene.add(new THREE.HemisphereLight(0xffffff,0x39434c,0.78));
  const d1=new THREE.DirectionalLight(0xffffff,0.9);d1.position.set(-40,-60,100);scene.add(d1);
  const d2=new THREE.DirectionalLight(0xdfe8ff,0.4);d2.position.set(60,70,-80);scene.add(d2);
  const sel=new THREE.BoxHelper(undefined,0xffd23f);sel.visible=false;scene.add(sel);
  G3={renderer,scene,cam,sel,dirty:true,orb:{th:-1.95,ph:0.95,r:110,t:new THREE.Vector3()},anim:null,board:null};
  bind3D();
  (function loop(now){requestAnimationFrame(loop);stepAnim();stepPlay(now||performance.now());if(G3.dirty&&S.view==='3d'&&S.sch!=='full'&&G3.board){G3.renderer.render(G3.scene,G3.cam);G3.dirty=false;}})();
  return true;
}
function disposeTree(o){o.traverse(n=>{if(n.geometry)n.geometry.dispose();const ms=Array.isArray(n.material)?n.material:n.material?[n.material]:[];ms.forEach(mm=>{if(mm.map){mm.map.dispose();mm.dispose();}});});}
function rebuild3D(){
  if(!G3)return;
  if(G3.root){G3.scene.remove(G3.root);disposeTree(G3.root);['T','B'].forEach(s=>G3.tex&&G3.tex[s].dispose());}
  markCount=0;
  const W=BD.W,H=BD.H,T=BD.t,m=mats();
  const root=new THREE.Group();root.position.set(-W/2,-H/2,0);G3.scene.add(root);G3.root=root;
  const ring=r=>{const o=r.slice();if(o.length>2&&Math.hypot(o[0][0]-o[o.length-1][0],o[0][1]-o[o.length-1][1])<1e-6)o.pop();return o.map(p=>new THREE.Vector2(p[0],p[1]));};
  const mkShape=withHoles=>{const sh=new THREE.Shape(ring(BD.outline[0]));
    BD.outline.slice(1).forEach(r=>sh.holes.push(new THREE.Path(ring(r))));
    if(withHoles){let n=0;BD.drills.forEach(d=>{if(n>700||d.x2!=null||d.d<0.5)return;if(!PCB.inRing(d.x,d.y,BD.outline[0]))return;n++;const p=new THREE.Path();p.absarc(d.x,d.y,d.d/2,0,TAU,true);sh.holes.push(p);});}
    return sh;};
  let sh=mkShape(true),edgeGeo,sg;
  try{edgeGeo=new THREE.ExtrudeGeometry(sh,{depth:T,bevelEnabled:false,curveSegments:12});sg=new THREE.ShapeGeometry(sh,12);if(!sg.attributes.position.count)throw 0;}
  catch(e){sh=mkShape(false);edgeGeo=new THREE.ExtrudeGeometry(sh,{depth:T,bevelEnabled:false,curveSegments:12});sg=new THREE.ShapeGeometry(sh,12);}
  const edge=new THREE.Mesh(edgeGeo,[m.edge,m.edge]);edge.position.z=-T/2;root.add(edge);
  G3.ts=texSize();const[TW,TH]=G3.ts;
  G3.texCv={T:document.createElement('canvas'),B:document.createElement('canvas')};G3.tex={};
  const maxAn=G3.renderer.capabilities.getMaxAnisotropy();
  ['T','B'].forEach(s=>{const cv=G3.texCv[s];cv.width=TW;cv.height=TH;const t=new THREE.CanvasTexture(cv);t.repeat.set(1/W,1/H);t.anisotropy=maxAn;t.encoding=THREE.sRGBEncoding;G3.tex[s]=t;});
  const top=new THREE.Mesh(sg,new THREE.MeshStandardMaterial({map:G3.tex.T,roughness:0.55,metalness:0.05}));top.position.z=T/2+0.01;top.userData.side='T';root.add(top);
  const bot=new THREE.Mesh(sg,new THREE.MeshStandardMaterial({map:G3.tex.B,roughness:0.55,metalness:0.05,side:THREE.BackSide}));bot.position.z=-T/2-0.01;bot.userData.side='B';root.add(bot);
  G3.planes=[top,bot];
  const compRoot=new THREE.Group();root.add(compRoot);G3.compRoot=compRoot;G3.comps={};G3.leds={};G3.rotors={};
  BD.comps.forEach(c=>{if(c.kind==='none'||!(c.body.w>0.1&&c.body.h>0.1))return;const g=build3D(c);compRoot.add(g);G3.comps[c.ref]=g;
    if(g.userData.led)G3.leds[c.ref]=g.userData.led;if(g.userData.rotor)G3.rotors[c.ref]=g.userData.rotor;});PLAY.applied=null;
  if(typeof mech3D==='function'&&BD.housing&&BD.housing.show)mech3D();
  G3.board=BD;setExplode(S.explode,true);updateTextures();resize3D();homeCam(false);
}
function resize3D(){if(!G3||S.view!=='3d'||S.sch==='full')return;const w=cv3.clientWidth,h=cv3.clientHeight;if(!w||!h)return;G3.renderer.setSize(w,h,false);G3.cam.aspect=w/h;G3.cam.updateProjectionMatrix();G3.dirty=true;}
function fitR(){const a=G3.cam.aspect||1.5,t=Math.tan(G3.cam.fov*D2R/2);return Math.max(BD.H*1.25/(2*t),BD.W*1.25/(2*t*a));}
function placeCam(){const o=G3.orb,c=G3.cam;c.position.set(o.t.x+o.r*Math.sin(o.ph)*Math.cos(o.th),o.t.y+o.r*Math.sin(o.ph)*Math.sin(o.th),o.t.z+o.r*Math.cos(o.ph));c.near=Math.max(0.1,o.r/500);c.far=o.r*20;c.updateProjectionMatrix();c.lookAt(o.t);G3.dirty=true;}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function camTo(th,ph,r,animate){
  const o=G3.orb;if(!animate||reduceMotion){o.th=th;o.ph=ph;o.r=r;o.t.set(0,0,0);placeCam();return;}
  let dth=th-o.th;while(dth>Math.PI)dth-=TAU;while(dth<-Math.PI)dth+=TAU;
  G3.anim={from:{th:o.th,ph:o.ph,r:o.r,tx:o.t.x,ty:o.t.y},to:{th:o.th+dth,ph,r},t0:performance.now()};
}
function stepAnim(){const a=G3&&G3.anim;if(!a)return;const k=Math.min(1,(performance.now()-a.t0)/450),e=1-Math.pow(1-k,3),o=G3.orb,L=(p,q)=>p+(q-p)*e;
  o.th=L(a.from.th,a.to.th);o.ph=L(a.from.ph,a.to.ph);o.r=L(a.from.r,a.to.r);o.t.set(L(a.from.tx,0),L(a.from.ty,0),0);placeCam();if(k>=1)G3.anim=null;}
function homeCam(an){camTo(-1.95,0.95,fitR()*1.05,an);}
function setExplode(v,quiet){
  S.explode=v;if(!G3||!G3.board)return;const T=BD.t,lift=Math.max(6,Math.min(BD.W,BD.H)*0.25);
  BD.comps.forEach(c=>{const g=G3.comps[c.ref];if(g)g.position.z=(c.side==='B'?-1:1)*(T/2+v*lift);});
  if(G3.sel.visible)G3.sel.update();G3.ver=(G3.ver||0)+1;if(!quiet)G3.dirty=true;
}
/* ---------- circuit playback in 3D: LED glow and motor rotation from the circuit simulation ---------- */
const PLAY={on:true,simT:0,dur:6,rt:false,last:0,key:null,ang:{},applied:null,bar:0};
function playReset(){PLAY.key=null;PLAY.simT=0;PLAY.on=true;PLAY.ang={};}
function playSrc(){
  if(typeof SR==='undefined'||!SR.sp||SR.sp.error)return null;
  const tr=SR.cfg&&SR.cfg.sp&&SR.cfg.sp.tran;
  if(SR.sp.fromTran&&tr&&tr.anim&&tr.anim.t.length>1){const A=tr.anim;if(!Object.keys(A.led).length&&!Object.keys(A.mot).length)return null;return{tran:A,T:A.t[A.t.length-1]};}
  if(SR.sp.parts&&SR.sp.parts.some(p=>(p.type==='MOTOR'||p.type==='BLDC')||(p.type==='D'&&BD.byRef[p.id]&&BD.byRef[p.id].kind==='led')))return{dc:SR.sp};
  return null;
}
const bsearch=(a,t)=>{let lo=0,hi=a.length-1;if(t<=a[0])return 0;if(t>=a[hi])return hi;while(hi-lo>1){const m=(lo+hi)>>1;if(a[m]<=t)lo=m;else hi=m;}return lo;};
function interpAt(ts,v,t){const i=bsearch(ts,t);if(i>=ts.length-1)return v[v.length-1];const k=(t-ts[i])/(ts[i+1]-ts[i]||1);return v[i]+(v[i+1]-v[i])*k;}
// average LED current over the sim-time window one display frame covers, so fast PWM looks dimmed rather than strobing
function ledAvg(A,ref,t,win){const cum=A._cum||(A._cum={});let c=cum[ref];if(!c){const v=A.led[ref];c=cum[ref]=new Float64Array(v.length);for(let i=1;i<v.length;i++)c[i]=c[i-1]+(v[i]+v[i-1])/2*(A.t[i]-A.t[i-1]);}
  const t0=Math.max(0,t-win);if(t-t0<1e-12)return interpAt(A.t,A.led[ref],t);return(interpAt(A.t,c,t)-interpAt(A.t,c,t0))/(t-t0);}
const ledLevel=I=>I>2e-5?Math.min(1,Math.pow(I/0.005,0.5)):0;
function stepPlay(now){
  const dt=PLAY.last?Math.min(0.1,(now-PLAY.last)/1000):0;PLAY.last=now;
  if(!G3||!G3.board||!G3.leds)return;
  const src=playSrc();let changed=false;
  const setLed=(ref,I)=>{const L=G3.leds[ref];if(!L)return;const b=ledLevel(I);if(Math.abs(L.b-b)<0.003&&PLAY.applied)return;L.b=b;L.I=I;
    L.mat.emissiveIntensity=0.06+b*2.6;L.glow.material.opacity=b>0.01?Math.min(1,0.3+b*0.8):0;const sc=1+b*8;L.glow.scale.set(sc,sc,1);L.glow.visible=b>0.01;changed=true;};
  const setRot=(ref,a)=>{const g=G3.rotors[ref];if(!g)return;if(Math.abs(g.rotation.x-a)>1e-4){g.rotation.x=a;changed=true;}};
  if(!src){if(PLAY.applied!=='none'){Object.keys(G3.leds).forEach(r=>{G3.leds[r].b=-1;setLed(r,0);});PLAY.applied='none';}}
  else if(src.tran){const A=src.tran,T=src.T;if(PLAY.key!==A){PLAY.key=A;PLAY.simT=0;}
    const speed=PLAY.rt?1:T/PLAY.dur;if(PLAY.on){PLAY.simT+=dt*speed;if(PLAY.simT>T)PLAY.simT%=T;}
    const t=PLAY.simT,win=Math.max(PLAY.on?dt*speed:0,(T/(A.t.length-1))*2);
    Object.keys(G3.leds).forEach(r=>setLed(r,A.led[r]?ledAvg(A,r,t,win):0));
    Object.keys(A.mot).forEach(r=>{const m=A.mot[r];setRot(r,interpAt(A.t,m.th,t)/(m.gear||1));});PLAY.applied='tran';}
  else{const P=src.dc.parts;const by={};P.forEach(p=>{by[p.id]=p;});
    Object.keys(G3.leds).forEach(r=>setLed(r,by[r]&&by[r].type==='D'?by[r].I:0));
    P.filter(p=>(p.type==='MOTOR'||p.type==='BLDC')).forEach(p=>{if(PLAY.on)PLAY.ang[p.id]=((PLAY.ang[p.id]||0)+p.w/(p.gear||1)*dt)%TAU;setRot(p.id,PLAY.ang[p.id]||0);});PLAY.applied='dc';}
  if(changed){G3.dirty=true;G3.ver=(G3.ver||0)+1;}
  if(now-PLAY.bar>90){PLAY.bar=now;updatePlayBar(src);}
}
function updatePlayBar(src){
  const bar=$('#playBar');const show=!!src&&S.view==='3d'&&S.sch!=='full'&&HS.ws==='board';bar.hidden=!show;if(!show)return;
  const tr=!!src.tran;bar.classList.toggle('dc',!tr);
  $('#pbPlay').textContent=PLAY.on?'❚❚':'▶';$('#pbPlay').setAttribute('aria-label',PLAY.on?'일시 정지':'재생');
  const f=SIM.fmtSI;let info=[];
  if(tr){const A=src.tran,T=src.T,t=PLAY.simT;if(document.activeElement!==$('#pbSeek'))$('#pbSeek').value=String(Math.round(t/T*1000));
    $('#pbTime').textContent=`${(t*1e3).toFixed(t<0.01?2:1)} / ${(T*1e3).toFixed(0)} ms`;
    Object.keys(A.mot).forEach(r=>{const m=A.mot[r];const w=interpAt(A.t,m.w,t);info.push(`${r} ${(w/(m.gear||1)*60/TAU).toFixed(0)} rpm · ${f(Math.abs(interpAt(A.t,m.I,t)),'A')}`);});
    const F=SR.fw&&SR.fw.trace;if(F&&F.t.length){const k=bsearch(F.t,t*1000);let best=null;(SR.fw.srcs||[]).filter(s=>s.pwm).forEach(s=>{const p=s.id.slice(3),d=F.out[p][k];if(!best||d>best[1])best=[p,d];});if(best)info.unshift(`${best[0]} 듀티 ${(best[1]*100).toFixed(0)}%`);}}
  else{$('#pbTime').textContent='DC 동작점';src.dc.parts.filter(p=>(p.type==='MOTOR'||p.type==='BLDC')).forEach(p=>info.push(`${p.id} ${p.rpm.toFixed(0)} rpm · ${f(Math.abs(p.I),'A')}`));}
  Object.keys(G3&&G3.leds||{}).forEach(r=>{const L=G3.leds[r];if(L.b>0.01)info.push(`${r} ${f(L.I,'A')}`);});
  $('#pbInfo').textContent=info.join(' · ');
}
$('#pbPlay').addEventListener('click',()=>{PLAY.on=!PLAY.on;PLAY.bar=0;});
$('#pbSeek').addEventListener('input',e=>{const s=playSrc();if(!s||!s.tran)return;PLAY.simT=+e.target.value/1000*s.T;PLAY.on=false;PLAY.bar=0;});
$('#pbDur').addEventListener('change',e=>{const v=e.target.value;PLAY.rt=v==='rt';if(!PLAY.rt)PLAY.dur=+v;});
function sync3D(){
  if(!G3||!G3.board)return;const g=S.selRef&&G3.comps[S.selRef];
  if(g){G3.sel.setFromObject(g);G3.sel.visible=true;}else G3.sel.visible=false;
  G3.compRoot.visible=S.layers.body3d;updateTextures();
}
function pick3D(px,py){const r=cv3.getBoundingClientRect();return pick3DCam(G3.cam,r.width,r.height,px,py);}
function pick3DCam(cam,w,h,px,py){
  const v=new THREE.Vector2((px/w)*2-1,-(py/h)*2+1),rc=new THREE.Raycaster();rc.setFromCamera(v,cam);
  const objs=(S.layers.body3d?[G3.compRoot]:[]).concat(G3.planes);
  for(const h of rc.intersectObjects(objs,true)){
    if(h.object.userData.side){if(!h.uv)return null;const r=hit(h.uv.x,h.uv.y,h.object.userData.side,0.2)||{type:'none'};r._x=h.uv.x;r._y=h.uv.y;return r;}
    if(h.object.isSprite)continue;const ref=h.object.userData.ref;if(ref)return{type:'comp',c:BD.byRef[ref]};
  }
  return null;
}
function bind3D(){
  const pts=new Map();let start=null,moved=0,pinch=0,mode='rot',hovQ=null,hraf=0;
  const pos=e=>{const r=cv3.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  cv3.addEventListener('contextmenu',e=>e.preventDefault());
  cv3.addEventListener('pointerdown',e=>{cv3.setPointerCapture(e.pointerId);pts.set(e.pointerId,pos(e));start=pos(e);moved=0;G3.anim=null;
    mode=(e.button===2||e.shiftKey||e.button===1)?'pan':'rot';if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cv3.addEventListener('pointermove',e=>{
    const p=pos(e);
    if(pts.has(e.pointerId)){
      const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);const dx=p[0]-prev[0],dy=p[1]-prev[1];moved+=Math.abs(dx)+Math.abs(dy);const o=G3.orb;
      if(pts.size>=2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)o.r=Math.max(5,Math.min(3000,o.r*pinch/d));pinch=d;}
      else if(mode==='pan'){const k=o.r*0.0016,rx=new THREE.Vector3().setFromMatrixColumn(G3.cam.matrixWorld,0),uy=new THREE.Vector3().setFromMatrixColumn(G3.cam.matrixWorld,1);o.t.addScaledVector(rx,-dx*k).addScaledVector(uy,dy*k);}
      else{o.th-=dx*0.008;o.ph=Math.max(0.02,Math.min(Math.PI-0.02,o.ph-dy*0.008));}
      placeCam();tip.hidden=true;return;
    }
    hovQ=p;if(!hraf)hraf=requestAnimationFrame(()=>{hraf=0;if(!hovQ||!G3.board)return;if(typeof cadHover3D==='function'&&HS.ws==='cad'){const ht=cadHover3D(hovQ[0],hovQ[1]);if(ht){tip.innerHTML=ht;tip.hidden=false;tipAt(cv3,hovQ[0],hovQ[1]);cv3.style.cursor='pointer';return;}}const h=pick3D(hovQ[0],hovQ[1]);
      const real=h&&h.type!=='none'?h:null;const extra=h?overlayTip(real,h._x,h._y):'';if(real||extra){tip.innerHTML=(real?tipHTML(real):'')+extra;tip.hidden=false;tipAt(cv3,hovQ[0],hovQ[1]);cv3.style.cursor=real?'pointer':'grab';}else{tip.hidden=true;cv3.style.cursor='grab';}});
  });
  const end=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=0;if(pts.size===0&&moved<5&&start&&e.type==='pointerup'&&G3.board){if(typeof cadPick3D==='function'&&cadPick3D(start[0],start[1],e))return;applyHit(pick3D(start[0],start[1]));}};
  cv3.addEventListener('pointerup',end);cv3.addEventListener('pointercancel',end);
  cv3.addEventListener('pointerleave',()=>{hovQ=null;tip.hidden=true;});
  cv3.addEventListener('wheel',e=>{e.preventDefault();G3.anim=null;const o=G3.orb;o.r=Math.max(5,Math.min(3000,o.r*Math.exp(e.deltaY*0.0012)));placeCam();},{passive:false});
  cv3.addEventListener('dblclick',()=>homeCam(true));
}

/* ---------- copper layer selector (multilayer boards) ---------- */
function cuList(){return BD?PCB.stackOf(BD):[];}
function cuLabel(k){const st=cuList();const i=st.findIndex(x=>x.k===k);const x=st[i];if(i<0)return k;
  const role=x.role==='gnd'?'GND 플레인':x.role==='pwr'?`전원 플레인${x.net?' '+x.net:''}`:'신호';return`L${i+1}/${st.length} ${PCB.cuName(k)}${k==='T'?' (TOP)':k==='B'?' (BOTTOM)':''} · ${role}${x.net&&x.role==='gnd'?' '+x.net:''}`;}
function cuSelPaint(){const sel=$('#vCu');if(!sel)return;const st=cuList();const multi=st.length>2;sel.hidden=!multi;if(!multi){if(S.cu)S.cu=null;return;}
  const cur=S.view==='3d'||S.sch==='full'?'':S.cu||S.view;const key=st.map(x=>x.k).join(',');
  if(sel.dataset.k!==key){sel.dataset.k=key;sel.innerHTML='<option value="">층 선택</option>'+st.map((x,i)=>`<option value="${x.k}">${esc(cuLabel(x.k))}</option>`).join('');}
  sel.value=cur;sel.classList.toggle('on',!!S.cu);}
function cuStep(d){const st=cuList();if(st.length<3)return false;const cur=S.view==='3d'||S.sch==='full'?null:S.cu||S.view;let i=st.findIndex(x=>x.k===cur);i=i<0?(d>0?0:st.length-1):Math.max(0,Math.min(st.length-1,i+d));setView(st[i].k);return true;}
{const sel=$('#vCu');if(sel)sel.addEventListener('change',()=>{if(sel.value)setView(sel.value);});}

/* ---------- views & panels ---------- */
function setView(v){
  if(typeof stepPaint==='function')setTimeout(stepPaint,0);
  if(/^In\d+$/.test(v||'')){if(!BD||!BD.layers[v+'.cu'])v='T';else{S.cu=v;v='T';if(PE&&PE.on&&typeof peEnd==='function')peEnd();}}else if(v==='T'||v==='B'||v==='3d')S.cu=null;
  if(v==='sch')S.sch='full';else if(v!=='__keep'){S.view=v;if(S.sch==='full')S.sch='off';}
  const full=S.sch==='full',bv=S.view;
  $$('[data-view]').forEach(b=>b.setAttribute('aria-selected',(full?b.dataset.view==='sch':b.dataset.view===bv&&!S.cu)?'true':'false'));cuSelPaint();
  $('#splitBtn').setAttribute('aria-pressed',S.sch==='split'?'true':'false');
  vp.classList.toggle('split',S.sch==='split');vp.classList.toggle('schfull',full);
  cvs.hidden=S.sch==='off';$('#schOv').hidden=S.sch==='off';
  const is3=bv==='3d';cv2.hidden=full||is3;cv3.hidden=full||!is3;tip.hidden=true;
  $('#sideBadge').textContent=is3?'3D':S.cu?`${cuLabel(S.cu)} · 내층 (관통 패드·비아 포함)`:(bv==='T'?'TOP · 위에서 본 면':'BOTTOM · 아래에서 본 면 (좌우 반전)')+(BD&&(BD.copperLayers||2)>2?` · ${cuLabel(bv)}`:'');
  $('#scale').hidden=is3;$('#coord').hidden=is3;
  $('#hint').textContent=is3?'드래그 회전 · 우클릭/Shift 드래그 이동 · 휠 확대 · 클릭 선택':'드래그 이동 · 휠 확대 · 더블클릭 맞춤 · 클릭 선택';
  $('#lbl-body').textContent=is3?'3D 부품':'부품 외형 겹쳐 보기';
  $('#ly-body').checked=is3?S.layers.body3d:S.layers.body2d;
  $('#ctl').innerHTML=(is3?'<button class="pill vbtn" data-cam="iso">등각</button><button class="pill vbtn" data-cam="top">위</button><button class="pill vbtn" data-cam="bot">아래</button>':'<button class="pill vbtn" data-cam="fit">화면 맞춤</button>')+(is3?'':`<button class="pill vbtn${PE&&PE.on?' on':''}" data-pe="1" title="부품 배치·배선을 편집합니다 (Pcbnew 단축키)">${PE&&PE.on?'편집 끝내기':'PCB 편집'}</button>`)+'<button class="pill vbtn" data-pop="1" title="보드를 새 창으로 엽니다">새 창</button><button class="pill vbtn" data-exp="svg" title="지금 보기를 SVG로 저장">SVG</button><button class="pill vbtn" data-exp="png" title="지금 보기를 PNG로 저장">PNG</button>';
  const lk=S.sch;const relayout=setView.lk!==lk;setView.lk=lk;
  if(S.sch!=='off'){schResize();schData();if(relayout){schFit();SV.fromMe=false;SV.lastKey='';}renderSchOv();schFocus();paintSch();}
  if(PE&&typeof peBar==='function')peBar();
  if(full)return;
  if(is3){if(!init3D()){setView('T');return;}if(G3.board!==BD)rebuild3D();else{resize3D();if(relayout)homeCam(false);sync3D();}}
  else{measure.done=0;measure();paint2D();}
  if(PE&&typeof peBar==='function')peBar();
}
function tipAt(cv,x,y){const vr=vp.getBoundingClientRect(),cr=cv.getBoundingClientRect();tip.style.left=(x+cr.left-vr.left)+'px';tip.style.top=(y+cr.top-vr.top)+'px';}
function measure(){const r=cv2.getBoundingClientRect();if(!r.width)return;dpr=Math.min(window.devicePixelRatio||1,2);const changed=Math.abs(r.width-vw)>1||Math.abs(r.height-vh)>1;vw=r.width;vh=r.height;cv2.width=Math.max(1,Math.round(vw*dpr));cv2.height=Math.max(1,Math.round(vh*dpr));if(changed||!measure.done){fit2();measure.done=1;}}
$$('button[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#ctl').addEventListener('click',e=>{const ex=e.target.closest('[data-exp]');if(ex){exportCurrentView(ex.dataset.exp);return;}if(e.target.closest('[data-pe]')){if(PE.on)peEnd();else peBegin();return;}if(e.target.closest('[data-pop]')){openPop(S.view);return;}const b=e.target.closest('[data-cam]');if(!b)return;const k=b.dataset.cam;
  if(k==='fit'){fit2();draw2D();return;}const r=fitR();if(k==='iso')homeCam(true);if(k==='top')camTo(-Math.PI/2,0.02,r,true);if(k==='bot')camTo(Math.PI/2,Math.PI-0.02,r,true);});
['cuT','cuB','silk','mask','drill','ghost','inner'].forEach(k=>$('#ly-'+k).addEventListener('change',e=>{S.layers[k]=e.target.checked;refresh(false);}));
$('#ly-body').addEventListener('change',e=>{if(S.view==='3d')S.layers.body3d=e.target.checked;else S.layers.body2d=e.target.checked;refresh(false);});
$('#explode').addEventListener('input',e=>setExplode(e.target.value/100));
(function(){const box=$('#masks');Object.entries(MASKS).forEach(([k,m])=>{const b=document.createElement('button');b.className='mk';b.style.background=m.mask;b.title=m.name;b.setAttribute('aria-label','솔더마스크 '+m.name);b.setAttribute('aria-pressed',k===S.mask?'true':'false');
  b.addEventListener('click',()=>{S.mask=k;box.querySelectorAll('.mk').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');$('#sw-mask').style.background=m.mask;refresh(false);});box.appendChild(b);});})();
$$('.tabs button').forEach(b=>b.addEventListener('click',()=>{S.tab=b.dataset.tab;renderPane();}));
$('#q').addEventListener('input',e=>{S.q=e.target.value.trim().toLowerCase();if(S.tab==='sel'||S.tab==='data')S.tab='bom';renderPane();});
$('#q').addEventListener('keydown',e=>{if(e.key!=='Enter'||!S.q)return;const q=S.q;
  const c=BD.comps.find(c=>c.ref.toLowerCase()===q)||filtComps()[0];if(c){selectComp(c.ref,true);return;}const n=filtNets()[0];if(n){S.hlNet=n;S.tab='sel';refresh(true);}});
function selectComp(ref,focus){
  const c=BD.byRef[ref];if(!c)return;S.selRef=ref;S.hlNet=null;S.tab='sel';
  if(S.view!=='3d'&&c.side!==S.view&&!c.pads.some(p=>p.side==='both'))setView(c.side);
  if(focus&&S.view!=='3d'){const cx=(c.bb[0]+c.bb[2])/2,cy=(c.bb[1]+c.bb[3])/2;const sx=S.view==='B'?BD.W-cx:cx;V2.ox=vw/2-sx*V2.s;V2.oy=vh/2-(BD.H-cy)*V2.s;}
  refresh(true);
}
const filtComps=()=>BD.comps.filter(c=>!S.q||[c.ref,c.val,c.fp,c.mpn,c.desc].concat(c.pads.map(p=>p.net||'')).join(' ').toLowerCase().includes(S.q));
const filtNets=()=>BD.netOrder.filter(n=>!S.q||n.toLowerCase().includes(S.q));
const sideBadge=s=>`<span class="badge ${s}">${s==='T'?'TOP':'BOT'}</span>`;
const fmt=(v,d)=>(+v).toFixed(d==null?2:d);
// datasheet block: key specs from the part database, manufacturer links, and a local copy when the viewer runs from the repo
function dsHTML(c){
  const mpn=(c.mpn||'').trim();if(!mpn&&!c.val)return'';const info=PARTS.find(mpn)||PARTS.find(c.val);const key=mpn||c.val;
  const local=info&&info.file&&location.protocol==='file:'?`<a class="btn sm" href="datasheets/pdf/${encodeURIComponent(info.file)}" target="_blank" rel="noopener">저장된 사본</a>`:'';
  return`<div class="dsbox"><div class="sub">데이터시트${info?` · ${esc(info.mfr)}`:''}</div>
    ${info?`<p class="dst">${esc(info.title)}</p><dl class="kv dskv">${info.specs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${info.note?`<p class="dsnote">${esc(info.note)}</p>`:''}`:`<p class="dsnote">이 부품(${esc(key)})은 내장 부품 정보에 없습니다. 아래 검색으로 데이터시트를 찾을 수 있습니다.</p>`}
    <div class="dsl">${PARTS.links(info,key).map(([t,u],i)=>`<a class="btn sm${i===0&&info&&info.pdf?' primary':''}" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}${local}</div></div>`;
}
function dsTableHTML(){
  const rows=[];const seen=new Map();BD.comps.forEach(c=>{const k=(c.mpn||c.val||'').trim();if(!k)return;if(!seen.has(k))seen.set(k,{refs:[],c});seen.get(k).refs.push(c.ref);});
  seen.forEach((v,k)=>{const info=PARTS.find(k);const l=PARTS.links(info,k)[0];rows.push(`<tr><td class="mono">${esc(v.refs.join(', '))}</td><td><b>${esc(k)}</b><div class="cls">${esc(info?info.mfr:'')}</div></td><td><a href="${esc(l[1])}" target="_blank" rel="noopener">${esc(info&&info.pdf?'PDF':info?'페이지':'검색')} ↗</a></td></tr>`);});
  return`<div class="card" style="margin-bottom:12px"><div class="card-h"><b>부품 데이터시트</b><span class="cls">${seen.size}종</span></div><div class="tblwrap"><table class="pins dst-t"><thead><tr><th>참조</th><th>부품 번호</th><th>링크</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="dsnote">부품을 클릭하면 주요 사양과 링크가 정보 패널에 나옵니다. 저장소의 <span class="mono">datasheets/</span> 폴더에 링크 목록이 있고, <span class="mono">node scripts/datasheets.mjs --download</span>로 PDF를 내려받을 수 있습니다.</p></div>`;
}
function compCard(c){
  const rows=c.pads.map(p=>`<tr><td>${esc(p.n!=null?p.n:'')}</td><td class="pn">${esc(p.fn||'')}</td><td>${p.net?`<button class="lnk${S.hlNet===p.net?' on':''}" data-net="${esc(p.net)}">${esc(p.net)}</button>`:'<span class="cls">미연결</span>'}</td></tr>`).join('');
  const nc=c.pads.filter(p=>!p.net).length,b=c.body;
  return`<div class="card"><div class="card-h"><span class="ref">${esc(c.ref)}</span><span class="hgap">${sideBadge(c.side)}<button class="x" data-clear="comp" aria-label="선택 해제">✕</button></span></div>
  <div class="val">${esc(c.val||'값 정보 없음')}</div>${c.desc?`<p class="desc">${esc(c.desc)}</p>`:'<div style="height:8px"></div>'}
  <dl class="kv"><dt>풋프린트</dt><dd>${esc(c.fp||'—')}</dd><dt>부품 번호</dt><dd>${esc(c.mpn||'—')}</dd><dt>위치</dt><dd>X ${fmt(c.x)} · Y ${fmt(c.y)} mm</dd><dt>회전</dt><dd>${fmt(c.rot,1)}°</dd>${b.w>0?`<dt>바디</dt><dd>${fmt(b.w,1)} × ${fmt(b.h,1)} × ${fmt(b.ht,1)} mm</dd>`:''}</dl>
  ${c.fw?fwCardHTML(c):''}
  ${dsHTML(c)}
  ${c.pads.length?`<div class="sub">패드 ${c.pads.length}개${nc?` · 넷 없음 ${nc}개`:''}</div><div class="tblwrap"><table class="pins"><tbody>${rows}</tbody></table></div>`:'<div class="sub">패드 정보 없음</div><p class="desc">Pick-and-Place 위치만 있는 부품입니다.</p>'}</div>`;
}
function netCard(n){
  const N=BD.nets[n];if(!N)return'';
  const pads=N.pads.slice(0,300).map(p=>p.ref?`<button class="lnk" data-ref="${esc(p.ref)}">${esc(p.ref)}${p.n!=null?'.'+esc(p.n):''}</button>`:'').join(' ');
  return`<div class="card"><div class="card-h"><span class="netname">${esc(n)}</span><button class="x" data-clear="net" aria-label="넷 강조 해제">✕</button></div>
  <p class="desc" style="margin-bottom:8px">${BD.netClass(n)} 넷 · 패드 ${N.pads.length}개</p>
  <dl class="kv"><dt>상단 트랙</dt><dd>${fmt(N.len.T,1)} mm</dd><dt>하단 트랙</dt><dd>${fmt(N.len.B,1)} mm</dd>${Object.keys(N.len).filter(k=>k!=='T'&&k!=='B'&&N.len[k]>0).map(k=>`<dt>${k} 트랙</dt><dd>${fmt(N.len[k],1)} mm</dd>`).join('')}<dt>비아</dt><dd>${N.vias.length}개</dd>${N.zones?`<dt>동박면</dt><dd>${N.zones}개</dd>`:''}</dl>
  ${pads?`<div class="sub">연결된 핀</div><div style="line-height:1.9">${pads}${N.pads.length>300?' …':''}</div>`:''}</div>`;
}
function renderPane(){
  $$('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===S.tab?'true':'false'));
  const fc=filtComps(),fn=filtNets();$('#n-bom').textContent=fc.length;$('#n-net').textContent=fn.length;
  const pane=$('#pane');
  if(S.tab==='sel'){
    let h='';if(S.selRef&&BD.byRef[S.selRef])h+=compCard(BD.byRef[S.selRef]);if(S.hlNet)h+=netCard(S.hlNet);
    if(!h)h=`<div class="empty"><p style="margin:0">보드에서 부품, 패드, 트랙을 클릭해 보세요.</p><ul><li>패드를 클릭하면 부품 정보와 연결된 넷이 함께 표시됩니다.</li><li>트랙이나 비아를 클릭하면 같은 넷 전체가 강조됩니다.</li><li>BOTTOM 보기는 보드를 뒤집어 본 모습이라 좌우가 반전됩니다.</li><li>키보드: <b>1</b> 3D · <b>2</b> TOP · <b>3</b> BOTTOM · <b>Esc</b> 선택 해제</li></ul>${BD.hasNets?'':'<p class="warnline">이 보드는 넷 정보가 없어 넷 강조가 동작하지 않습니다.</p>'}</div>`;
    pane.innerHTML=h;
  }else if(S.tab==='bom'){
    pane.innerHTML=`<div class="list">${fc.slice(0,800).map(c=>`<button class="row${S.selRef===c.ref?' on':''}" data-ref="${esc(c.ref)}"><span class="r">${esc(c.ref)}</span><span class="m">${esc([c.val,c.fp].filter(Boolean).join(' · ')||'—')}</span>${sideBadge(c.side)}</button>`).join('')||'<p class="empty">일치하는 부품이 없습니다.</p>'}</div>`;
  }else if(S.tab==='net'){
    pane.innerHTML=`<div class="list">${fn.slice(0,1500).map(n=>`<button class="row net${S.hlNet===n?' on':''}" data-net="${esc(n)}"><span class="r">${esc(n)}</span><span class="cls">${BD.netClass(n)}</span><span class="m">${BD.nets[n].pads.length}</span></button>`).join('')||`<p class="empty">${BD.hasNets?'일치하는 넷이 없습니다.':'이 보드에는 넷 정보가 없습니다.'}</p>`}</div>`;
  }else{
    pane.innerHTML=dsTableHTML()+$('#dataTpl').innerHTML;
  }
}
$('#pane').addEventListener('click',e=>{
  const x=e.target.closest('[data-clear]');if(x){if(x.dataset.clear==='comp')S.selRef=null;else S.hlNet=null;refresh(true);return;}
  const n=e.target.closest('[data-net]');if(n){S.hlNet=S.hlNet===n.dataset.net&&S.tab==='sel'?null:n.dataset.net;if(S.tab==='net')S.tab='sel';refresh(true);return;}
  const r=e.target.closest('[data-ref]');if(r)selectComp(r.dataset.ref,true);
  const o=e.target.closest('[data-open]');if(o)openImport();
});
document.addEventListener('keydown',e=>{
  if(!$('#imp').hidden){if(e.key==='Escape')closeImport();return;}
  if(e.target.matches('input,select,textarea'))return;
  if(HS.ws==='hsis')return;
  if(e.key===']'||e.key==='['){if(cuStep(e.key===']'?1:-1)){e.preventDefault();return;}}
  if(e.key==='1')setView('3d');else if(e.key==='2')setView('T');else if(e.key==='3')setView('B');else if(e.key==='4')setView('sch');
  else if(e.key==='Escape'){S.selRef=null;S.hlNet=null;refresh(true);}
});
function header(){
  $('#bName').textContent=BD.name;$('#bTag').textContent=BD.source==='예제'?'예제 보드':BD.source;
  const n=BD.comps.length;$('#bSub').textContent=BD.blank?'신규 설계 · 요구사항 → 시스템 다이어그램 → 회로 → PCB → 기구':BD.pcbPending?`회로 · 부품 ${n}개 · 넷 ${BD.netOrder.length}개${BD.variantLabel?' · 회로 안: '+BD.variantLabel:''} · PCB는 3단계에서`:`${fmt(BD.W,1)} × ${fmt(BD.H,1)} mm · ${BD.copperLayers||2}층 · FR-4 ${fmt(BD.t,1)} mm · 부품 ${n}개`;
  const ir=$('#ly-inner-row');if(ir)ir.hidden=!((BD.copperLayers||2)>2&&PCB.cuKeys(BD).length>2);
  document.title=BD.name+' · AllinOneDesign';
}
function stats(){
  let tl=0,pads=0;Object.values(BD.nets).forEach(N=>{Object.values(N.len).forEach(v=>{tl+=v||0;});});
  const prs=new Set();['T.cu','B.cu'].forEach(L=>BD.layers[L].forEach(p=>{if(p.t==='pad'&&!p.via)prs.add(p);}));pads=prs.size;
  $('#stats').innerHTML=`<dt>부품</dt><dd>${BD.comps.length}</dd><dt>상단 / 하단</dt><dd>${BD.comps.filter(c=>c.side==='T').length} / ${BD.comps.filter(c=>c.side==='B').length}</dd><dt>넷</dt><dd>${BD.netOrder.length}</dd><dt>패드</dt><dd>${pads}</dd><dt>비아</dt><dd>${BD.vias.length}</dd><dt>드릴</dt><dd>${BD.drills.length}</dd>${tl?`<dt>트랙 길이</dt><dd>${fmt(tl,0)} mm</dd>`:''}`;
  const src=$('#srcBox');
  if(BD.source==='예제'){src.innerHTML=`<p class="note" style="font-size:12.5px;margin:0">${BD.demo==='mcu'?'MCU DC 모터 예제입니다. STM32F042K6U6 펌웨어가 PA8(TIM1) PWM으로 AO3400A·FA-130 모터를, PA4로 상태 LED를 제어하고 PB1 ADC로 모터 전류를 읽습니다.':BD.demo==='bldc'?'MCU BLDC 3상 예제입니다. STM32F042K6U6 펌웨어가 42BLF01 모터의 홀 센서(PA6·PA7·PB0)를 읽어 TI DRV8313의 IN/EN 6개를 6스텝으로 정류합니다.':BD.demo==='tc364'?'AURIX TC364DP 예제입니다. DRV8313·TLE9251V·W25Q32를 배치했고 MCU 신호 핀은 HSIS 핀 추천으로 정합니다. HSIS → 핀 추천 → MCAL 설정 순서로 써 보세요.':'STM32F042K6U6 기반 예제 보드입니다. 실제 보드 파일을 불러와 보세요.'}</p>
    <div class="acts" style="margin-top:10px;flex-wrap:wrap"><button class="btn primary sm" data-open>파일 불러오기</button>${BD.demo&&fwMcu()?'<button class="btn sm" data-fwopen>펌웨어 편집</button>':''}${BD.demo==='tc364'?'<button class="btn sm" data-gorec>핀 추천 열기</button>':''}${Object.entries(EXAMPLES).filter(([k])=>k!==(BD.demo||'sense')).map(([k,v])=>`<button class="btn sm" data-ex="${k}">${esc(v[0])} 예제</button>`).join('')}</div>`;}
  else{src.innerHTML=`<ul class="files">${BD.files.filter(f=>f.role!=='ignore').map(f=>`<li><span class="fn">${esc(f.name.split('/').pop())}</span><span class="fr">${esc(PCB.ROLES[f.role]||f.role)}</span></li>`).join('')}</ul>`+
    BD.warnings.map(w=>`<p class="warnline">${esc(w)}</p>`).join('')+BD.notes.map(w=>`<p class="noteline">${esc(w)}</p>`).join('');}
}
$('#srcBox').addEventListener('click',e=>{if(e.target.closest('[data-open]'))openImport();const x=e.target.closest('[data-ex]');if(x)loadExample(x.dataset.ex);if(e.target.closest('[data-fwopen]'))fwOpen();if(e.target.closest('[data-gorec]')){HS.tab='rec';setWorkspace('hsis');}});
function refresh(pane){cuSelPaint();if(!BD)return;if(S.view==='3d')sync3D();else draw2D();if(S.sch!=='off'){schFocus();drawSch();}popsRefresh();if(pane!==false){renderPane();if(S.panel==='sim'&&SR.tab==='si')renderSim();}}
function setBoard(B){
  BD=B;S.selRef=null;S.hlNet=null;if(typeof CADSEL!=='undefined')CADSEL.keys=[];if(S.cu&&!(B.layers[S.cu+'.cu'])){S.cu=null;}S.q='';$('#q').value='';S.tab='sel';hover2=null;
  if(PE){PE.on=false;PE.undo=[];PE.redo=[];PE.route=null;PE.drag=null;PE.rats=[];PE.drc=[];}
  header();stats();renderPane();simReset();hsisOnBoard();SV.data=null;SV.lastKey='';measure.done=0;measure();fit2();
  if(S.view==='3d'){if(G3)rebuild3D();}else paint2D();
  if(S.sch!=='off'){schData();renderSchOv();paintSch();}
  popsRefresh(true);cuSelPaint();if(typeof revOnBoard==='function')revOnBoard();
}
new ResizeObserver(()=>{if(!BD)return;if(S.sch!=='off'){schResize();if(!SV.userMoved)schFit();paintSch();}if(S.view==='3d')resize3D();else{measure();paint2D();}}).observe(vp);

/* ---------- import ---------- */
const IMP={entries:[],busy:false};let eid=0;
function openImport(){$('#imp').hidden=false;renderImport();setTimeout(()=>$('#drop').focus(),30);}
function closeImport(){if(IMP.busy)return;$('#imp').hidden=true;}
$('#openImp').addEventListener('click',openImport);
$('#imp').addEventListener('click',e=>{if(e.target.id==='imp'||e.target.closest('[data-close]'))closeImport();});
$('#drop').addEventListener('click',()=>$('#file').click());
$('#drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file').click();}});
$('#file').addEventListener('change',e=>{addFiles([...e.target.files]);e.target.value='';});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(!e.dataTransfer||![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();if(HS.ws==='hsis')return;dragDepth++;$('#imp').hidden=false;$('#drop').classList.add('over');renderImport();});
window.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#drop').classList.remove('over');});
window.addEventListener('drop',e=>{if(!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();if(HS.ws==='hsis'){hsisFiles([...e.dataTransfer.files]);return;}dragDepth=0;$('#drop').classList.remove('over');addFiles([...e.dataTransfer.files]);});
const fsize=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';
async function addFiles(files){
  IMP.busy=true;setMsg('파일을 읽는 중…');renderImport();
  for(const f of files){
    try{
      if(/\.zip$/i.test(f.name)){
        if(!window.JSZip){IMP.entries.push({id:++eid,name:f.name,size:f.size,role:'ignore',note:'zip 라이브러리를 불러오지 못했습니다. 압축을 풀어 파일을 직접 넣어 주세요.'});continue;}
        const zip=await JSZip.loadAsync(f);const items=Object.values(zip.files).filter(z=>!z.dir&&!/(^|\/)(__MACOSX|\.)/.test(z.name));
        for(const z of items){const text=await z.async('string');addEntry(z.name,text,text.length,f.name);}
      }else{
        if(f.size>60*1024*1024){IMP.entries.push({id:++eid,name:f.name,size:f.size,role:'ignore',note:'60 MB보다 큰 파일은 건너뜁니다.'});continue;}
        const text=await f.text();addEntry(f.name,text,f.size);
      }
    }catch(err){IMP.entries.push({id:++eid,name:f.name,size:f.size,role:'ignore',note:'읽지 못했습니다: '+(err.message||err)});}
  }
  IMP.busy=false;setMsg('');renderImport();
}
function addEntry(name,text,size,zip){
  IMP.entries=IMP.entries.filter(e=>e.name!==name);
  const d=PCB.detectRole(name,text);IMP.entries.push({id:++eid,name,size,text,role:d.role,auto:d.role,note:d.note||'',zip});
}
function setMsg(m,kind){const el=$('#impMsg');el.textContent=m;el.className='msg'+(kind?' '+kind:'');}
function plan(){
  const has=r=>IMP.entries.some(e=>e.role===r);const out=[];
  if(has('kicad'))out.push(['ok','KiCad PCB 파일로 보드 전체(동박, 실크, 부품, 넷)를 만듭니다.']);
  else if(has('json'))out.push(['ok','뷰어 JSON으로 보드를 만듭니다.']);
  else if(['tcu','bcu','tsilk','bsilk','outline','drill','pnp'].some(has)){
    out.push(['ok','Gerber 세트로 보드를 만듭니다.']);
    if(!has('tcu')&&!has('bcu'))out.push(['warn','동박 Gerber가 없습니다. 부품 배치만 표시됩니다.']);
    if(!has('outline'))out.push(['warn','외곽선 Gerber가 없어 보드 모양을 배선 범위로 추정합니다.']);
    if(!has('drill'))out.push(['info','드릴 파일을 넣으면 구멍과 스루홀이 표시됩니다.']);
    if(!has('pnp'))out.push(['info','Pick-and-Place를 넣으면 부품 위치와 3D 부품이 표시됩니다.']);
  }else if(IMP.entries.length)out.push(['warn','보드를 만들 수 있는 파일이 아직 없습니다. KiCad PCB, Gerber, Pick-and-Place 중 하나가 필요합니다.']);
  if(has('bom'))out.push(['ok','BOM의 값·부품 번호를 부품에 합칩니다.']);
  if(has('sch'))out.push(['ok',`KiCad 회로도 ${IMP.entries.filter(e=>e.role==='sch').length}장을 보드와 연동합니다.`]);
  return out;
}
function renderImport(){
  const list=$('#flist');const opts=Object.entries(PCB.ROLES);
  list.innerHTML=IMP.entries.length?`<table class="ftab"><thead><tr><th>파일</th><th>역할</th><th></th></tr></thead><tbody>${IMP.entries.map(e=>`<tr>
    <td><div class="fn" title="${esc(e.name)}">${esc(e.name.split('/').pop())}</div><div class="fm">${fsize(e.size)}${e.zip?' · '+esc(e.zip):''}${e.note?' · '+esc(e.note):''}</div></td>
    <td><select data-role="${e.id}" aria-label="${esc(e.name)} 역할" id="role-${e.id}">${opts.map(([k,v])=>`<option value="${k}"${k===e.role?' selected':''}>${v}</option>`).join('')}</select></td>
    <td><button class="x" data-del="${e.id}" aria-label="${esc(e.name)} 빼기">✕</button></td></tr>`).join('')}</tbody></table>`:'';
  const p=plan();$('#impPlan').innerHTML=p.map(([k,t])=>`<li class="${k}">${esc(t)}</li>`).join('');
  $('#impGo').disabled=IMP.busy||!p.some(x=>x[0]==='ok'&&!/BOM/.test(x[1]));
  $('#impClear').hidden=!IMP.entries.length;
}
$('#flist').addEventListener('change',e=>{const s=e.target.closest('[data-role]');if(!s)return;const en=IMP.entries.find(x=>x.id===+s.dataset.role);if(en){en.role=s.value;en.note=en.role===en.auto?en.note:'';}renderImport();});
$('#flist').addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(!d)return;IMP.entries=IMP.entries.filter(x=>x.id!==+d.dataset.del);renderImport();});
$('#impClear').addEventListener('click',()=>{IMP.entries=[];setMsg('');renderImport();});
const EXAMPLES={sense:['SENSE-32',()=>SAMPLE_SPEC],mcu:['MCU DC 모터',()=>SAMPLE_MCU],bldc:['MCU BLDC 3상',()=>SAMPLE_BLDC],tc364:['AURIX TC364 핀 추천',()=>SAMPLE_TC364]};
function loadExample(which){const spec=(EXAMPLES[which]||EXAMPLES.sense)[1]();setBoard(PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec)))));closeImport();
  if(which==='mcu'){selectComp('U1',false);toast('MCU DC 모터 예제입니다. U1(MCU)의 펌웨어 파라미터를 바꾸고 "빌드 & 시뮬레이션"을 누르면 3D에서 모터와 LED가 움직입니다. HSIS 탭에서 펌웨어·회로 대조 결과를 볼 수 있습니다.');}
  else if(which==='bldc'){selectComp('U1',false);toast('MCU BLDC 3상 예제입니다. STM32F042 펌웨어가 홀 센서로 DRV8313을 6스텝 정류합니다. "빌드 & 시뮬레이션"으로 3상 모터를 돌려 보세요.');}
  else if(which==='tc364'){HS.tab='rec';setWorkspace('hsis');toast('AURIX TC364 예제입니다. 부품은 배치됐지만 MCU 신호 핀 대부분이 미배정입니다. 핀 추천 탭에서 추천을 확인하고 적용한 뒤 MCAL 설정을 내보내 보세요.');}
  else toast('예제 보드로 돌아왔습니다.');}
$('#impSample').addEventListener('click',()=>loadExample('sense'));
$('#impSample2').addEventListener('click',()=>loadExample('mcu'));
$('#impSample3').addEventListener('click',()=>loadExample('bldc'));
$('#impSample4').addEventListener('click',()=>loadExample('tc364'));
$('#impGo').addEventListener('click',()=>{
  setMsg('보드를 만드는 중…');IMP.busy=true;$('#impGo').disabled=true;
  setTimeout(()=>{
    try{const B=PCB.build(IMP.entries.map(e=>({name:e.name,role:e.role,text:e.text||''})));IMP.busy=false;setBoard(B);closeImport();
      toast(`${B.name} · 부품 ${B.comps.length}개, 넷 ${B.netOrder.length}개를 불러왔습니다.`+(B.warnings.length?' 왼쪽 패널의 안내를 확인하세요.':''));}
    catch(err){IMP.busy=false;console.error(err);setMsg('보드를 만들지 못했습니다: '+(err.message||err),'err');renderImport();}
  },30);
});
let toastT=0;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},5200);}

/*SIMUI*/
/* ---------- boot ---------- */
setBoard(PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_SPEC)))));
const boot=()=>{setView('3d');setTimeout(()=>{const q=new URLSearchParams(location.search);if(q.has('new'))newProject();else if(q.has('board'))openViewer(null);else setMode('home');},0);};
(document.fonts&&document.fonts.ready?Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]):Promise.resolve()).then(boot);
})();
