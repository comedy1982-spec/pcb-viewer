/* ---------- pop-out views: separate browser windows, or floating in-page windows when popups are blocked ---------- */
const POPS=new Set();
const KIND_LABEL={sch:'회로도',T:'TOP',B:'BOTTOM'};
const TOKENS=['--bg','--surface','--raised','--fg','--muted','--line','--accent','--accent-soft','--vp','--grid','--f-ui','--f-mono'];
function tokenCSS(){const cs=getComputedStyle(document.documentElement);return':root{'+TOKENS.map(t=>`${t}:${cs.getPropertyValue(t).trim()}`).join(';')+'}';}
const POP_CSS=`
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--fg);font-family:var(--f-ui);font-size:13px}
.pw{display:flex;flex-direction:column;height:100%;min-height:0}
.pbar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
.pbar b{font-family:var(--f-mono);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%}
.pbar select,.pbar button{font:inherit;font-size:12.5px;padding:4px 9px;border-radius:7px;border:1px solid var(--line);background:var(--raised);color:var(--fg);cursor:pointer}
.pbar button:hover{border-color:var(--accent);color:var(--accent)}
.pbar .sp{flex:1}
.pbody{position:relative;flex:1;min-height:0;background-color:var(--vp);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;touch-action:none}
.pbody canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.ptip{position:absolute;pointer-events:none;background:var(--raised);border:1px solid var(--line);border-radius:7px;padding:5px 9px;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.18);white-space:nowrap;transform:translate(12px,12px);z-index:3}
.ptip b{font-family:var(--f-mono)}.ptip .net{color:var(--accent);font-family:var(--f-mono)}.ptip .cls{color:var(--muted)}
[hidden]{display:none!important}`;
function popMarkup(floating){
  return`<div class="pw"><div class="pbar">${floating?'<span class="fdrag" title="끌어서 옮기기" aria-hidden="true">⠿</span>':''}<b class="ptitle"></b>
    <select class="pkind" aria-label="보기"><option value="sch">회로도</option><option value="T">TOP</option><option value="B">BOTTOM</option></select>
    <select class="ppage" aria-label="회로도 시트"></select><span class="sp"></span><button class="pfit">화면 맞춤</button>${floating?'<button class="pclose" aria-label="창 닫기">✕</button>':''}</div>
    <div class="pbody"><canvas aria-label="떼어낸 보기"></canvas><div class="ptip" hidden></div></div></div>`;
}
function openPop(kind){
  let w=null;
  try{w=window.open('','_blank','popup=yes,width=1180,height=780');if(w){w.document.open();w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(BD.name)} · ${KIND_LABEL[kind]}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap"><style>${tokenCSS()}${POP_CSS}</style></head><body>${popMarkup(false)}</body></html>`);w.document.close();}}
  catch(e){try{w&&w.close();}catch(_){}w=null;}
  if(w&&w.document&&w.document.querySelector('.pw')){mountPop(kind,w,w.document,w.document.body,false);return;}
  // floating fallback
  const el=document.createElement('div');el.className='fwin';el.setAttribute('role','dialog');el.setAttribute('aria-label',KIND_LABEL[kind]+' 창');
  const n=POPS.size;el.style.left=(80+n*28)+'px';el.style.top=(110+n*28)+'px';el.innerHTML=popMarkup(true);document.body.appendChild(el);
  mountPop(kind,window,document,el,true);
  if(!openPop.warned){openPop.warned=1;toast('브라우저가 새 창을 막아 화면 안에 떠 있는 창으로 열었습니다. 제목 줄을 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿀 수 있습니다.');}
}
function mountPop(kind,win,doc,root,floating){
  const q=s=>root.querySelector(s);
  const P={kind,win,doc,root,floating,cv:q('canvas'),tip:q('.ptip'),dpr:1,w:0,h:0,s:3,ox:0,oy:0,page:0,fitted:-1,hover:null,lastKey:'',fromMe:false,raf:0};
  P.ctx=P.cv.getContext('2d');
  P.sync=()=>{q('.ptitle').textContent=BD.name;q('.pkind').value=P.kind;const pg=q('.ppage');
    if(P.kind==='sch'){const d=schData();pg.hidden=d.sheets.length<2;pg.innerHTML=d.sheets.map((s,i)=>`<option value="${i}"${i===P.page?' selected':''}>${esc(s.name||'시트 '+(i+1))}</option>`).join('');}else pg.hidden=true;
    if(!floating)try{doc.title=`${BD.name} · ${KIND_LABEL[P.kind]}`;}catch(e){}};
  P.resize=()=>{const r=P.cv.getBoundingClientRect();if(!r.width)return;const d=Math.min(win.devicePixelRatio||1,2);P.w=r.width;P.h=r.height;P.dpr=d;P.cv.width=Math.round(r.width*d);P.cv.height=Math.round(r.height*d);};
  P.fit=()=>{if(P.kind==='sch'){schFit(P);return;}P.s=Math.min((P.w-40)/BD.W,(P.h-40)/BD.H);P.ox=(P.w-BD.W*P.s)/2;P.oy=(P.h-BD.H*P.s)/2;P.fitted=0;};
  P.paint=()=>{if(!BD||!P.w)return;
    if(P.kind==='sch'){paintSchV(P);return;}
    if(P.fitted<0)P.fit();const c=P.ctx,mir=P.kind==='B',s=P.s,d=P.dpr;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,P.cv.width,P.cv.height);
    c.setTransform(d*s*(mir?-1:1),0,0,-d*s,d*(P.ox+(mir?BD.W*s:0)),d*(P.oy+BD.H*s));
    c.save();c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=18*d;c.shadowOffsetY=6*d;outlinePath(c);c.fillStyle='#000';c.fill('evenodd');c.restore();
    drawSide(c,P.kind,{hover:P.hover&&P.hover.type==='comp'?P.hover.c:null});};
  P.draw=()=>{if(P.raf)return;P.raf=win.requestAnimationFrame(()=>{P.raf=0;P.paint();});};
  P.s2w=(px,py)=>{if(P.kind==='sch')return schS2W(P,px,py);let x=(px-P.ox)/P.s;if(P.kind==='B')x=BD.W-x;return[x,BD.H-(py-P.oy)/P.s];};
  P.hit=(px,py)=>{const[x,y]=P.s2w(px,py);return P.kind==='sch'?schHit(P,x,y):hit(x,y,P.kind,3/P.s);};
  P.close=()=>{POPS.delete(P);if(floating)root.remove();else try{win.close();}catch(e){}};
  // controls
  q('.pkind').addEventListener('change',e=>{P.kind=e.target.value;P.fitted=-1;P.hover=null;P.lastKey='';P.sync();P.paint();});
  q('.ppage').addEventListener('change',e=>{P.page=+e.target.value;P.fitted=-1;P.paint();});
  q('.pfit').addEventListener('click',()=>{P.fitted=-1;P.fit();P.paint();});
  if(floating){q('.pclose').addEventListener('click',P.close);
    const bar=q('.pbar');bar.addEventListener('pointerdown',e=>{if(e.target.closest('select,button'))return;e.preventDefault();const r=root.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
      const mv=ev=>{root.style.left=Math.max(0,Math.min(window.innerWidth-80,ev.clientX-sx))+'px';root.style.top=Math.max(0,Math.min(window.innerHeight-40,ev.clientY-sy))+'px';};
      const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);});
    root.addEventListener('pointerdown',()=>{root.style.zIndex=String(26+(mountPop.z=(mountPop.z||0)+1));},true);
    new ResizeObserver(()=>{P.resize();P.paint();}).observe(root);}
  else{win.addEventListener('resize',()=>{P.resize();P.paint();});win.addEventListener('pagehide',()=>POPS.delete(P));
    win.addEventListener('keydown',e=>{if(e.key==='Escape'){S.selRef=null;S.hlNet=null;refresh(true);}});}
  // pointer: pan, zoom, hover, click
  const pts=new Map();let start=null,moved=0,pinch=0,hq=null,hraf=0;const cv=P.cv;
  const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const zoomAt=(px,py,f)=>{const[wx,wy]=P.kind==='sch'?schS2W(P,px,py):[(px-P.ox)/P.s,(py-P.oy)/P.s];P.s=Math.max(0.3,Math.min(600,P.s*f));P.ox=px-wx*P.s;P.oy=py-wy*P.s;P.draw();};
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,pos(e));moved=0;start=pos(e);if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cv.addEventListener('pointermove',e=>{const p=pos(e);
    if(pts.has(e.pointerId)){const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);
      if(pts.size===1){P.ox+=p[0]-prev[0];P.oy+=p[1]-prev[1];moved+=Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]);P.draw();}
      else if(pts.size===2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/pinch);pinch=d;moved=99;}P.tip.hidden=true;return;}
    hq=p;if(!hraf)hraf=win.requestAnimationFrame(()=>{hraf=0;if(!hq||!BD)return;const h=P.hit(hq[0],hq[1]);
      const was=P.hover&&(P.hover.s||P.hover.c);P.hover=h&&(h.type==='sym'||h.type==='comp')?h:null;if((P.hover&&(P.hover.s||P.hover.c))!==was)P.draw();
      const html=h?(P.kind==='sch'?schTip(h):tipHTML(h)):'';if(html){P.tip.innerHTML=html;P.tip.hidden=false;P.tip.style.left=hq[0]+'px';P.tip.style.top=hq[1]+'px';cv.style.cursor='pointer';}else{P.tip.hidden=true;cv.style.cursor='';}});});
  const end=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=0;
    if(pts.size===0&&moved<5&&start&&e.type==='pointerup'&&BD){const h=P.hit(start[0],start[1]);if(P.kind==='sch')schApply(h,P);else applyHit(h);}};
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  cv.addEventListener('pointerleave',()=>{hq=null;P.tip.hidden=true;if(P.hover){P.hover=null;P.draw();}});
  cv.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pos(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  cv.addEventListener('dblclick',()=>{P.fitted=-1;P.fit();P.draw();});
  POPS.add(P);P.sync();
  const first=()=>{P.resize();P.fitted=-1;P.paint();};
  if(doc.fonts&&doc.fonts.ready)doc.fonts.ready.then(()=>P.draw());win.requestAnimationFrame(first);setTimeout(first,120);
  return P;
}
function popsRefresh(boardChanged){
  POPS.forEach(P=>{let gone=false;try{gone=!P.floating&&P.win.closed;}catch(e){gone=true;}if(gone){POPS.delete(P);return;}
    if(boardChanged){P.fitted=-1;P.page=0;P.hover=null;P.lastKey='';P.sync();}
    if(P.kind==='sch')schFocus(P);P.draw();});
}
window.addEventListener('beforeunload',()=>POPS.forEach(P=>{if(!P.floating)try{P.win.close();}catch(e){}}));

/* ---------- resizable panes ---------- */
const LAYOUT_KEY='pcbv.layout';
const LAY=(function(){try{return JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')||{};}catch(e){return{};}})();
function saveLayout(){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(LAY));}catch(e){}}
function applyLayout(){const m=$('.main'),h=$('#hsisWs');
  [['lw',m,'--lw'],['rw',m,'--rw'],['rws',m,'--rws'],['hl',h,'--hl'],['hr',h,'--hr']].forEach(([k,el,v])=>{if(LAY[k])el.style.setProperty(v,LAY[k]+'px');else el.style.removeProperty(v);});
  if(LAY.split)vp.style.setProperty('--split',LAY.split+'%');else vp.style.removeProperty('--split');}
function makeHandle(el,opts){
  // opts: {get():px, set(px), min, max, reset()}
  const vert=()=>typeof opts.vertical==='function'?opts.vertical():!!opts.vertical;
  el.setAttribute('role','separator');el.setAttribute('tabindex','0');el.setAttribute('aria-orientation',vert()?'horizontal':'vertical');el.setAttribute('aria-label',opts.label);
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('on');const V=vert();el.setAttribute('aria-orientation',V?'horizontal':'vertical');document.body.classList.add(V?'resizing-v':'resizing');const s0=opts.get(),x0=V?e.clientY:e.clientX;
    const mv=ev=>{const d=(V?ev.clientY:ev.clientX)-x0;opts.set(Math.max(opts.min,Math.min(opts.max(),s0+d*(opts.dir||1))));};
    const up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.classList.remove('on');document.body.classList.remove('resizing','resizing-v');saveLayout();};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);});
  el.addEventListener('keydown',e=>{const k=e.key;const step=e.shiftKey?48:16;let d=0;if(k==='ArrowLeft'||k==='ArrowUp')d=-step;else if(k==='ArrowRight'||k==='ArrowDown')d=step;else return;e.preventDefault();opts.set(Math.max(opts.min,Math.min(opts.max(),opts.get()+d*(opts.dir||1))));saveLayout();});
  el.addEventListener('dblclick',()=>{opts.reset();saveLayout();});
}
(function(){
  const m=$('.main'),h=$('#hsisWs');
  const w=(el)=>el.getBoundingClientRect().width;
  const sim=()=>m.classList.contains('simwide');
  makeHandle($('#hLeft'),{label:'왼쪽 패널 너비',get:()=>w($('.layers')),set:v=>{LAY.lw=Math.round(v);applyLayout();},min:170,max:()=>Math.min(420,w(m)*0.35),reset:()=>{delete LAY.lw;applyLayout();}});
  makeHandle($('#hRight'),{label:'오른쪽 패널 너비',dir:-1,get:()=>w($('.insp')),set:v=>{LAY[sim()?'rws':'rw']=Math.round(v);applyLayout();},min:260,max:()=>Math.min(720,w(m)*0.5),reset:()=>{delete LAY[sim()?'rws':'rw'];applyLayout();}});
  makeHandle($('#hHsL'),{label:'HSIS 왼쪽 패널 너비',get:()=>w($('#hsLeft')),set:v=>{LAY.hl=Math.round(v);applyLayout();},min:190,max:()=>Math.min(440,w(h)*0.35),reset:()=>{delete LAY.hl;applyLayout();}});
  makeHandle($('#hHsR'),{label:'HSIS 상세 패널 너비',dir:-1,get:()=>w($('#hsDetail')),set:v=>{LAY.hr=Math.round(v);applyLayout();bindDetail();},min:280,max:()=>Math.min(760,w(h)*0.55),reset:()=>{delete LAY.hr;applyLayout();bindDetail();}});
  const sp=$('#splitter');const narrow=()=>matchMedia('(max-width:760px)').matches;
  makeHandle(sp,{label:'회로도와 보드 나누기',vertical:narrow,get:()=>{const r=vp.getBoundingClientRect();const f=LAY.split||50;return(narrow()?r.height:r.width)*f/100;},
    set:v=>{const r=vp.getBoundingClientRect();LAY.split=+(v/(narrow()?r.height:r.width)*100).toFixed(1);applyLayout();relayoutViews();},min:120,max:()=>{const r=vp.getBoundingClientRect();return(narrow()?r.height:r.width)-120;},
    reset:()=>{delete LAY.split;applyLayout();relayoutViews();}});
  applyLayout();
})();
let relayRaf=0;
function relayoutViews(){if(relayRaf)return;relayRaf=requestAnimationFrame(()=>{relayRaf=0;if(S.sch!=='off'){schResize();if(!SV.userMoved)schFit();paintSch();}if(S.sch!=='full'){if(S.view==='3d')resize3D();else{measure();paint2D();}}});}
