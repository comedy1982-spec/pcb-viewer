/* ---------- multi-view windows: a grid of cells (TOP / BOTTOM / 회로도 / 3D) in a browser window, or floating in-page when popups are blocked ---------- */
const POPS=new Set();   // every live cell, across all windows
const WINS=new Set();
const HKINDS={'h-table':['신호 표','table'],'h-pins':['핀 맵','pins'],'h-trace':['추적성','trace'],'h-checks':['검사 결과','checks'],'h-detail':['신호 상세','detail']};
const SKINDS={'s-ir':['전압 강하','ir'],'s-si':['신호 무결성','si'],'s-th':['열 분포','th'],'s-sp':['회로 동작','sp'],'s-emc':['EMC/EMI','emc']};
const OV_LABEL={auto:'자동',none:'없음',ir:'전압 강하',si:'신호 무결성',th:'열 분포',sp:'회로 동작',emc:'EMC/EMI'};
const DKINDS={sys:'시스템 다이어그램',parts:'부품 구성도',cad3:'기구 3D',cadd:'기구 도면'};
const KINDS=['T','B','3d','sch'].concat(Object.keys(HKINDS),Object.keys(SKINDS),Object.keys(DKINDS));
// inner copper layers are kinds too ('In1', 'In2' …) — they exist per board
const isIn=k=>/^In\d+$/.test(k||'');
const kindOk=k=>KINDS.includes(k)||(isIn(k)&&BD&&!!BD.layers[k+'.cu']);
const kindLabel=k=>isIn(k)?(typeof cuLabel==='function'?cuLabel(k):PCB.cuName(k)):KIND_LABEL[k]||k;
const isD=k=>!!DKINDS[k];
const KIND_LABEL=Object.assign({T:'TOP',B:'BOTTOM',sch:'회로도','3d':'3D'},DKINDS,Object.fromEntries(Object.entries(HKINDS).map(([k,v])=>[k,'HSIS '+v[0]])),Object.fromEntries(Object.entries(SKINDS).map(([k,v])=>[k,'시뮬 '+v[0]])));
const isH=k=>k&&k[0]==='h'&&k[1]==='-';
const isS=k=>k&&k[0]==='s'&&k[1]==='-';
const isHtml=k=>isH(k)||isS(k)||k==='sys'||k==='parts'||k==='cadd';
// overlay drawn on a TOP/BOTTOM cell: its own choice; "자동" = the first simulation cell in the same window, else the main window's sim panel
function cellOv(C){if(C.ov==='none')return null;if(C.ov&&C.ov!=='auto')return C.ov;const sc=C.W.cells.find(x=>isS(x.kind));if(sc)return SKINDS[sc.kind][1];return S.panel==='sim'?SR.tab:null;}
// grouped <option>s for every viewer kind
function kindOptions(sel){const o=k=>`<option value="${k}"${k===sel?' selected':''}>${esc(kindLabel(k))}</option>`;const inner=BD?PCB.stackOf(BD).filter(x=>isIn(x.k)).map(x=>x.k):[];
  return`<optgroup label="보드">${['T'].concat(inner,['B','3d']).map(o).join('')}</optgroup><optgroup label="회로">${o('sch')}</optgroup><optgroup label="시스템 · 기구">${Object.keys(DKINDS).map(o).join('')}</optgroup><optgroup label="HSIS">${Object.keys(HKINDS).map(o).join('')}</optgroup><optgroup label="시뮬레이션">${Object.keys(SKINDS).map(o).join('')}</optgroup>`;}
const PRESETS=[[1,1],[1,2],[1,4],[2,2]];
const MAXR=2,MAXC=4;
function defaultKinds(r,c){const n=r*c;if(n===1)return['sch'];if(n===2)return['sch','T'];if(n===4)return['T','B','sch','3d'];const cyc=['T','sch','B','3d'];return Array.from({length:n},(_,i)=>cyc[i%4]);}
function gridIcon(r,c){return`<span class="gi" style="grid-template-columns:repeat(${c},1fr);grid-template-rows:repeat(${r},1fr)" aria-hidden="true">${'<i></i>'.repeat(r*c)}</span>`;}
const TOKENS=['--bg','--surface','--raised','--fg','--muted','--line','--accent','--accent-soft','--on-accent','--vp','--grid','--f-ui','--f-mono','--critical','--warning','--good','--warn-bg','--warn-fg','--err','--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
// popup windows get the page's own styles (HSIS tables, pills, cards…) then the live theme tokens
const pageCSS=()=>[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
function tokenCSS(){const cs=getComputedStyle(document.documentElement);return':root{'+TOKENS.map(t=>`${t}:${cs.getPropertyValue(t).trim()}`).join(';')+'}';}
const POP_BASE=`*{box-sizing:border-box}html,body{height:100%;margin:0}body{background:var(--bg);color:var(--fg);font-family:var(--f-ui);font-size:13px}[hidden]{display:none!important}`;
const WIN_CSS=`
.pw{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bg);color:var(--fg);font-family:var(--f-ui);font-size:13px}
.pw .pbar{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap;user-select:none}
.pw .ptitle{font-family:var(--f-mono);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34%}
.pw :is(.pbar,.chead) :is(select,button){font:inherit;font-size:12px;padding:3px 8px;border-radius:7px;border:1px solid var(--line);background:var(--raised);color:var(--fg);cursor:pointer}
.pw :is(.pbar,.chead) button:hover{border-color:var(--accent);color:var(--accent)}
.pw button:focus-visible,.pw select:focus-visible,.pw .gdiv:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.pw .sp{flex:1}
.pw .lays{display:flex;gap:3px;align-items:center}.pw .lays .lbl{color:var(--muted);font-size:12px;margin-right:2px}
.pw .lays button{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;font-family:var(--f-mono);font-size:11.5px}
.pw .lays button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.gi{display:inline-grid;gap:1.5px;width:16px;height:12px;flex:none}.gi i{background:currentColor;border-radius:1.5px;opacity:.75}
.pw .pgrid{position:relative;flex:1;min-height:0;display:grid;gap:5px;padding:5px;background:var(--bg)}
.pw .cell{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--surface)}
.pw .cell.sel{border-color:var(--accent)}
.pw .chead{display:flex;align-items:center;gap:5px;padding:4px 6px;border-bottom:1px solid var(--line);background:var(--surface);min-width:0}
.pw .chead .cn{font-family:var(--f-mono);font-size:11px;color:var(--muted);min-width:12px;text-align:center}
.pw .chead .c3{display:inline-flex;gap:3px}
.pw .chead :is(select,button){padding:2px 7px;font-size:11.5px}
.pw .cbody{position:relative;flex:1;min-height:0;background-color:var(--vp);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;touch-action:none;overflow:hidden}
.pw .cbody>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.pw .hview{position:absolute;inset:0;overflow:auto;padding:10px;background:var(--surface);font-size:13px;line-height:1.5;touch-action:auto}
.pw .hview .tscroll{max-height:none}.pw .hview .pinwrap{min-height:0;height:100%}.pw .hview .pinmap{flex:1;min-height:220px;max-height:none}.pw .hview .mini canvas{position:static}
.pw .hview .stbl.hs td,.pw .hview .stbl.hs th{padding:5px 7px}
.pw .hview .hnone{color:var(--muted);display:grid;place-items:center;height:100%;text-align:center}
.pw .chead .cov{max-width:120px}
.pw .clegend{position:absolute;left:8px;bottom:8px;z-index:2;pointer-events:none;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--line);border-radius:8px;max-width:calc(100% - 16px);font-size:12px}
.pw .hview .simenv{font-size:12px;color:var(--muted);margin:0 0 10px;padding:6px 9px;border:1px dashed var(--line);border-radius:8px}
.pw .hview .sim .scroll{max-height:none}
.pw .sysd-wrap{padding:6px}.pw .sysd-wrap svg{width:100%;height:auto;display:block;background:var(--surface)}
.pw .chead .cexp{font-family:var(--f-mono);font-size:10.5px;padding:2px 6px}
.pw .cmsg{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);padding:16px;text-align:center}
.pw .ptip{position:absolute;pointer-events:none;background:var(--raised);border:1px solid var(--line);border-radius:7px;padding:5px 9px;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.18);white-space:nowrap;transform:translate(12px,12px);z-index:3}
.pw .ptip.flip{transform:translate(calc(-100% - 12px),12px)}
.pw .ptip b{font-family:var(--f-mono)}.pw .ptip .net{color:var(--accent);font-family:var(--f-mono)}.pw .ptip .cls{color:var(--muted)}
.pw .gdiv{position:absolute;z-index:4;touch-action:none;outline:none}
.pw .gdiv.c{width:10px;margin-left:-5px;cursor:col-resize}.pw .gdiv.r{height:10px;margin-top:-5px;cursor:row-resize}
.pw .gdiv::after{content:'';position:absolute;background:var(--accent);opacity:0;transition:opacity .12s;border-radius:2px}
.pw .gdiv.c::after{left:4px;width:2px;top:0;bottom:0}.pw .gdiv.r::after{top:4px;height:2px;left:0;right:0}
.pw .gdiv:hover::after,.pw .gdiv.on::after,.pw .gdiv:focus-visible::after{opacity:1}
body.gdrag,body.gdrag *{cursor:col-resize!important;user-select:none}body.gdrag-v,body.gdrag-v *{cursor:row-resize!important;user-select:none}`;
function ensureWinCSS(){if(document.getElementById('winCss'))return;const s=document.createElement('style');s.id='winCss';s.textContent=WIN_CSS;document.head.appendChild(s);}
function winMarkup(floating){
  return`<div class="pw"><div class="pbar">${floating?'<span class="fdrag" title="끌어서 옮기기" aria-hidden="true">⠿</span>':''}<b class="ptitle"></b>
    <div class="lays" role="group" aria-label="창 레이아웃"><span class="lbl">레이아웃</span>${PRESETS.map(([r,c])=>`<button data-lay="${r}x${c}" aria-pressed="false" title="${r}행 ${c}열">${gridIcon(r,c)}${r}×${c}</button>`).join('')}</div>
    <span class="sp"></span><button class="pfitall" title="모든 칸을 화면에 맞춤">모두 맞춤</button>${floating?'<button class="pclose" aria-label="창 닫기">✕</button>':''}</div>
    <div class="pgrid"></div></div>`;
}
function openWindow(rows,cols,kinds){
  rows=Math.max(1,Math.min(MAXR,rows|0));cols=Math.max(1,Math.min(MAXC,cols|0));
  const def=defaultKinds(rows,cols);kinds=Array.from({length:rows*cols},(_,i)=>(kinds&&kindOk(kinds[i]))?kinds[i]:def[i]);
  let w=null;
  try{w=window.open('','_blank',`popup=yes,width=${cols>2?1440:1240},height=${rows>1?860:720}`);
    if(w){w.document.open();w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(BD.name)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap"><style>${pageCSS()}${tokenCSS()}${POP_BASE}${WIN_CSS}</style></head><body>${winMarkup(false)}</body></html>`);w.document.close();}}
  catch(e){try{w&&w.close();}catch(_){}w=null;}
  if(w&&w.document&&w.document.querySelector('.pw'))return mountWindow(w,w.document,w.document.body,false,rows,cols,kinds);
  ensureWinCSS();
  const el=document.createElement('div');el.className='fwin';el.setAttribute('role','dialog');el.setAttribute('aria-label',`${rows}×${cols} 보기 창`);
  const n=WINS.size;el.style.left=(60+n*28)+'px';el.style.top=(90+n*28)+'px';
  el.style.width=`min(${cols>2?1180:cols>1?960:720}px,calc(100vw - 32px))`;el.style.height=`min(${rows>1?720:520}px,calc(100vh - 120px))`;
  el.innerHTML=winMarkup(true);document.body.appendChild(el);
  const W=mountWindow(window,document,el,true,rows,cols,kinds);
  if(!openWindow.warned){openWindow.warned=1;toast('브라우저가 새 창을 막아 화면 안에 떠 있는 창으로 열었습니다. 제목 줄을 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿀 수 있습니다.');}
  return W;
}
function openPop(kind){return openWindow(1,1,[kindOk(kind)?kind:'T']);}

function mountWindow(win,doc,root,floating,rows,cols,kinds){
  const q=s=>root.querySelector(s);
  const W={win,doc,root,floating,rows:0,cols:0,cells:[],colFr:[],rowFr:[],grid:q('.pgrid'),divs:[],alive:true};
  W.applyGrid=()=>{W.grid.style.gridTemplateColumns=W.colFr.map(f=>`minmax(0,${f}fr)`).join(' ');W.grid.style.gridTemplateRows=W.rowFr.map(f=>`minmax(0,${f}fr)`).join(' ');};
  W.placeDividers=()=>{const g=W.grid.getBoundingClientRect();if(!g.width)return;
    W.divs.forEach(d=>{const a=W.cells[d.a].root.getBoundingClientRect(),b=W.cells[d.b].root.getBoundingClientRect();
      if(d.axis==='c'){d.el.style.left=((a.right+b.left)/2-g.left)+'px';d.el.style.top=(a.top-g.top)+'px';d.el.style.height=(W.cells[(W.rows-1)*W.cols+d.i].root.getBoundingClientRect().bottom-a.top)+'px';}
      else{d.el.style.top=((a.bottom+b.top)/2-g.top)+'px';d.el.style.left=(a.left-g.left)+'px';d.el.style.width=(W.cells[d.a+W.cols-1].root.getBoundingClientRect().right-a.left)+'px';}});};
  W.sync=()=>{q('.ptitle').textContent=BD.name;const t=`${BD.name} · ${W.cells.map(C=>kindLabel(C.kind)).join(' / ')}`;
    if(!floating)try{doc.title=t;}catch(e){}else root.setAttribute('aria-label',t);
    root.querySelectorAll('[data-lay]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lay===`${W.rows}x${W.cols}`?'true':'false'));
    W.cells.forEach(C=>C.sync());};
  W.layout=(r,c,ks)=>{
    const old=W.cells.map(C=>C.kind),def=defaultKinds(r,c),n=r*c;
    ks=Array.from({length:n},(_,i)=>(ks&&ks[i])||old[i]||def[i]);
    while(W.cells.length>n)W.cells.pop().destroy();
    W.cells.forEach((C,i)=>{if(C.kind!==ks[i])C.setKind(ks[i]);});
    for(let i=W.cells.length;i<n;i++){const C=makeCell(W,ks[i],i);W.cells.push(C);W.grid.appendChild(C.root);C.observe();}
    W.rows=r;W.cols=c;W.colFr=Array(c).fill(1);W.rowFr=Array(r).fill(1);W.applyGrid();
    W.divs.forEach(d=>d.el.remove());W.divs=[];
    for(let i=0;i<c-1;i++)W.divs.push(makeDivider(W,'c',i,i,i+1));
    for(let j=0;j<r-1;j++)W.divs.push(makeDivider(W,'r',j,j*c,(j+1)*c));
    W.sync();
    win.requestAnimationFrame(()=>{W.cells.forEach(C=>{C.resize();C.userMoved=false;C.refit();C.paint();});W.placeDividers();});
  };
  W.drop=()=>{if(!W.alive)return;W.alive=false;W.cells.forEach(C=>C.destroy());W.cells=[];WINS.delete(W);};
  W.close=()=>{W.drop();if(floating)root.remove();else try{win.close();}catch(e){}};
  // toolbar
  root.querySelectorAll('[data-lay]').forEach(b=>b.addEventListener('click',()=>{const[r,c]=b.dataset.lay.split('x').map(Number);W.layout(r,c);}));
  q('.pfitall').addEventListener('click',()=>W.cells.forEach(C=>{C.userMoved=false;C.refit();C.paint();}));
  if(floating){q('.pclose').addEventListener('click',W.close);
    const bar=q('.pbar');bar.addEventListener('pointerdown',e=>{if(e.target.closest('select,button'))return;e.preventDefault();const r=root.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
      const mv=ev=>{root.style.left=Math.max(0,Math.min(window.innerWidth-80,ev.clientX-sx))+'px';root.style.top=Math.max(0,Math.min(window.innerHeight-40,ev.clientY-sy))+'px';};
      const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);});
    root.addEventListener('pointerdown',()=>{root.style.zIndex=String(26+(mountWindow.z=(mountWindow.z||0)+1));},true);}
  else{win.addEventListener('pagehide',W.drop);
    win.addEventListener('keydown',e=>{if(e.key==='Escape'){S.selRef=null;S.hlNet=null;refresh(true);}});}
  new win.ResizeObserver(()=>W.placeDividers()).observe(W.grid);
  WINS.add(W);W.layout(rows,cols,kinds);
  if(doc.fonts&&doc.fonts.ready)doc.fonts.ready.then(()=>W.cells.forEach(C=>C.draw()));
  setTimeout(()=>{W.cells.forEach(C=>{C.resize();if(!C.userMoved)C.refit();C.paint();});W.placeDividers();},150);
  return W;
}
function makeDivider(W,axis,i,a,b){
  const el=W.doc.createElement('div');el.className='gdiv '+axis;el.tabIndex=0;el.setAttribute('role','separator');
  el.setAttribute('aria-orientation',axis==='c'?'vertical':'horizontal');el.setAttribute('aria-label',axis==='c'?`${i+1}열과 ${i+2}열 사이 너비`:`${i+1}행과 ${i+2}행 사이 높이`);
  W.grid.appendChild(el);
  const sizes=()=>axis==='c'?Array.from({length:W.cols},(_,k)=>W.cells[k].root.getBoundingClientRect().width):Array.from({length:W.rows},(_,k)=>W.cells[k*W.cols].root.getBoundingClientRect().height);
  const apply=sz=>{W[axis==='c'?'colFr':'rowFr']=sz.map(v=>+v.toFixed(1));W.applyGrid();W.placeDividers();};
  const nudge=(sz,d)=>{const sum=sz[i]+sz[i+1],mn=Math.min(90,sum/2);const na=Math.max(mn,Math.min(sum-mn,sz[i]+d));sz[i]=na;sz[i+1]=sum-na;apply(sz);};
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('on');W.doc.body.classList.add(axis==='c'?'gdrag':'gdrag-v');
    const s0=sizes(),x0=axis==='c'?e.clientX:e.clientY;
    const mv=ev=>nudge(s0.slice(),(axis==='c'?ev.clientX:ev.clientY)-x0);
    const up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.classList.remove('on');W.doc.body.classList.remove('gdrag','gdrag-v');};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);});
  el.addEventListener('keydown',e=>{const k=e.key,st=e.shiftKey?48:16;let d=0;
    if(axis==='c'&&k==='ArrowLeft'||axis==='r'&&k==='ArrowUp')d=-st;else if(axis==='c'&&k==='ArrowRight'||axis==='r'&&k==='ArrowDown')d=st;else return;e.preventDefault();nudge(sizes(),d);});
  el.addEventListener('dblclick',()=>{W[axis==='c'?'colFr':'rowFr'].fill(1);W.applyGrid();W.placeDividers();});
  return{el,axis,i,a,b};
}

function makeCell(W,kind,idx){
  const doc=W.doc,win=W.win,el=doc.createElement('div');el.className='cell';
  el.innerHTML=`<div class="chead"><span class="cn" aria-hidden="true">${idx+1}</span><select class="ckind" aria-label="${idx+1}번 칸 보기">${kindOptions(kind)}</select><select class="cpage" aria-label="회로도 시트" hidden></select><select class="cov" aria-label="시뮬레이션 결과 겹쳐 보기" title="시뮬레이션 결과 겹쳐 보기" hidden>${Object.entries(OV_LABEL).map(([k,v])=>`<option value="${k}">겹치기: ${v}</option>`).join('')}</select><span class="sp"></span><span class="c3" hidden><button data-c="iso" title="등각 보기">등각</button><button data-c="top" title="위에서 보기">위</button><button data-c="bot" title="아래에서 보기">아래</button></span><button class="cfit" title="화면 맞춤 (더블클릭)">맞춤</button><button class="cexp" data-x="svg" title="이 칸을 SVG로 저장">SVG</button><button class="cexp" data-x="png" title="이 칸을 PNG로 저장">PNG</button><button class="cexp" data-x="xlsx" title="이 칸의 표를 엑셀로 저장" hidden>Excel</button></div><div class="cbody"><div class="ptip" hidden></div><div class="clegend legend" hidden></div></div>`;
  const q=s=>el.querySelector(s),body=q('.cbody');
  const C={kind:null,W,win,doc,root:el,cv:null,tip:q('.ptip'),ctx:null,dpr:1,w:0,h:0,s:3,ox:0,oy:0,page:0,fitted:-1,hover:null,lastKey:'',fromMe:false,userMoved:false,raf:0,g:null,ro:null,ov:'auto',leg:q('.clegend')};
  C.sync=()=>{const ks=q('.ckind');if(!ks.querySelector(`option[value="${C.kind}"]`)||ks.dataset.n!==String(BD.copperLayers||2)){ks.innerHTML=kindOptions(C.kind);ks.dataset.n=String(BD.copperLayers||2);}ks.value=C.kind;const pg=q('.cpage');q('.c3').hidden=!(C.kind==='3d'||C.kind==='cad3');const ov=q('.cov');ov.hidden=!(C.kind==='T'||C.kind==='B');ov.value=C.ov;
    const html=isHtml(C.kind);q('[data-x="svg"]').hidden=C.kind==='3d'||C.kind==='cad3'||(html&&!isD(C.kind));q('[data-x="png"]').hidden=html&&!isD(C.kind);q('[data-x="xlsx"]').hidden=!(isH(C.kind)||isS(C.kind));
    if(C.kind==='sch'){const d=schData();pg.hidden=d.sheets.length<2;pg.innerHTML=d.sheets.map((s,i)=>`<option value="${i}"${i===C.page?' selected':''}>${esc(s.name||'시트 '+(i+1))}</option>`).join('');}else pg.hidden=true;};
  C.resize=()=>{if(!C.cv)return;const r=C.cv.getBoundingClientRect();if(!r.width||!r.height)return;const d=Math.min(win.devicePixelRatio||1,2);C.w=r.width;C.h=r.height;C.dpr=d;
    if(C.g){C.g.renderer.setPixelRatio(d);C.g.renderer.setSize(r.width,r.height,false);C.g.cam.aspect=r.width/r.height;C.g.cam.updateProjectionMatrix();if(!C.g.homed){C.g.homed=true;C.g.home(false);}C.g.dirty=true;}
    else{C.cv.width=Math.round(r.width*d);C.cv.height=Math.round(r.height*d);}};
  C.fit=()=>{if(C.kind==='sch'){schFit(C);return;}C.s=Math.min((C.w-30)/BD.W,(C.h-30)/BD.H);C.ox=(C.w-BD.W*C.s)/2;C.oy=(C.h-BD.H*C.s)/2;C.fitted=0;};
  C.refit=()=>{if(!C.w)return;if(C.g){C.g.home(false);return;}C.fitted=-1;C.fit();};
  C.paint=()=>{if(C.hv){if(isS(C.kind))paintSimCell(C);else if(isD(C.kind))paintDesignCell(C);else paintHsCell(C);return;}if(!BD||!C.w)return;
    if(C.g){C.g.dirty=true;return;}if(!C.ctx)return;
    if(C.kind==='sch'){paintSchV(C);return;}
    if(C.fitted<0)C.fit();const c=C.ctx,mir=C.kind==='B',s=C.s,d=C.dpr;const cu=isIn(C.kind)?C.kind:null,side=mir?'B':'T';
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,C.cv.width,C.cv.height);
    c.setTransform(d*s*(mir?-1:1),0,0,-d*s,d*(C.ox+(mir?BD.W*s:0)),d*(C.oy+BD.H*s));
    c.save();c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=18*d;c.shadowOffsetY=6*d;outlinePath(c);c.fillStyle='#000';c.fill('evenodd');c.restore();
    const ov=cu?null:cellOv(C);OV_FORCE=ov;try{drawSide(c,side,{cu,hover:C.hover&&C.hover.type==='comp'?C.hover.c:null});C.ovk=cu?null:ovKey();}finally{OV_FORCE=undefined;}
    const lg=C.ovk?legendHTML(C.ovk):'';C.leg.hidden=!lg;if(lg&&C.leg.innerHTML!==lg)C.leg.innerHTML=lg;};
  C.draw=()=>{if(C.g){C.g.dirty=true;return;}if(C.hv){if(C.raf)return;C.raf=win.requestAnimationFrame(()=>{C.raf=0;C.paint();});return;}if(C.raf)return;C.raf=win.requestAnimationFrame(()=>{C.raf=0;C.paint();});};
  C.s2w=(px,py)=>{if(C.kind==='sch')return schS2W(C,px,py);let x=(px-C.ox)/C.s;if(C.kind==='B')x=BD.W-x;return[x,BD.H-(py-C.oy)/C.s];};
  C.hit=(px,py)=>{const[x,y]=C.s2w(px,py);return C.kind==='sch'?schHit(C,x,y):hit(x,y,C.kind==='B'?'B':'T',3/C.s,isIn(C.kind)?C.kind:null);};
  C.showTip=(html,x,y)=>{if(!html){C.tip.hidden=true;return;}C.tip.innerHTML=html;C.tip.hidden=false;C.tip.style.left=x+'px';C.tip.style.top=y+'px';C.tip.classList.toggle('flip',x>C.w*0.58);};
  C.setKind=k=>{
    if(C.g){C.g.dispose();C.g=null;}if(C.cv){C.cv.remove();C.cv=null;}if(C.hv){C.hv.remove();C.hv=null;}const m=body.querySelector('.cmsg');if(m)m.remove();
    C.kind=k;C.fitted=-1;C.hover=null;C.lastKey='';C.fromMe=false;C.userMoved=false;C.tip.hidden=true;C.ctx=null;C.hkey='';
    q('.cfit').hidden=isHtml(k);C.leg.hidden=true;C.simDirty=true;
    if(isHtml(k)){C.w=0;const hv=doc.createElement('div');hv.className='hview';hv.tabIndex=0;hv.setAttribute('aria-label',KIND_LABEL[k]);body.insertBefore(hv,C.tip);C.hv=hv;C.sync();C.paint();if(W.alive&&W.cells.includes(C)){W.sync();W.cells.forEach(x=>x!==C&&x.draw());}return;}
    const cv=doc.createElement('canvas');cv.setAttribute('aria-label',KIND_LABEL[k]+' 보기');body.insertBefore(cv,C.tip);C.cv=cv;
    if(k==='3d'||k==='cad3'){if(k==='cad3'&&!BD.blank&&!BD.pcbPending&&typeof mechCfg==='function'){mechCfg().show=true;if(typeof mech3D==='function')mech3D();}if(!mount3DCell(C)){cv.remove();C.cv=null;body.insertAdjacentHTML('afterbegin','<div class="cmsg">이 브라우저에서 3D(WebGL)를 표시할 수 없습니다.<br>TOP·BOTTOM 보기를 사용하세요.</div>');}}
    else{C.ctx=cv.getContext('2d');bind2DCell(C);}
    C.sync();C.resize();if(C.kind==='sch')schFocus(C);C.paint();if(W.alive&&W.cells.includes(C)){W.sync();W.cells.forEach(x=>x!==C&&x.draw());}};
  C.observe=()=>{C.ro=new win.ResizeObserver(()=>{if(C.hv){if(C.kind==='h-detail')drawMini(C.hv);if(C.kind==='s-sp'){C.simDirty=true;C.draw();}return;}C.resize();if(!C.userMoved)C.refit();C.paint();});C.ro.observe(body);};
  C.destroy=()=>{if(C.g){C.g.dispose();C.g=null;}if(C.ro)try{C.ro.disconnect();}catch(e){}POPS.delete(C);el.remove();};
  q('.ckind').addEventListener('change',e=>C.setKind(e.target.value));
  q('.cov').addEventListener('change',e=>{C.ov=e.target.value;C.paint();});
  q('.cpage').addEventListener('change',e=>{C.page=+e.target.value;C.fitted=-1;C.userMoved=false;C.paint();});
  q('.cfit').addEventListener('click',()=>{C.userMoved=false;C.refit();C.paint();});
  el.querySelectorAll('.cexp').forEach(b=>b.addEventListener('click',()=>cellExport(C,b.dataset.x)));
  q('.c3').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b||!C.g)return;const g=C.g,r=g.fitR();C.userMoved=true;
    if(b.dataset.c==='iso')g.home(true);else if(b.dataset.c==='top')g.to(-Math.PI/2,0.02,r,true);else g.to(Math.PI/2,Math.PI-0.02,r,true);});
  POPS.add(C);C.setKind(kind);
  return C;
}
// HSIS cells: HTML views that share HS state; re-rendered only when what they show changes, keeping scroll position
function paintHsCell(C){
  if(!BD)return;if(!HS.H){hsisLoadSample();}if(!HS.res)hsisRun();
  const sub=HKINDS[C.kind][1],key=[sub,HS.ver,HS.sel,HS.selPin,S.hlNet,HS.mcu,BD.name,HS.q,HS.sev,[...HS.cats].join(',')].join('|');if(key===C.hkey)return;C.hkey=key;
  const hv=C.hv,sc=hv.querySelector('.tscroll'),st=[hv.scrollTop,hv.scrollLeft,sc?sc.scrollTop:0,sc?sc.scrollLeft:0];
  if(sub==='detail'){renderDetail(hv,true);return;}
  hv.innerHTML=sub==='table'?tableHTML():sub==='pins'?pinmapHTML():sub==='trace'?traceHTML():checksHTML();
  bindHsBody(hv);
  hv.scrollTop=st[0];hv.scrollLeft=st[1];const sc2=hv.querySelector('.tscroll');if(sc2){sc2.scrollTop=st[2];sc2.scrollLeft=st[3];}
  // bring the selected row into view if it is off screen
  const on=hv.querySelector('tr.on');if(on&&sub==='table'){const r=on.getBoundingClientRect(),b=(sc2||hv).getBoundingClientRect();if(r.top<b.top+30||r.bottom>b.bottom)on.scrollIntoView({block:'nearest'});}
}
// simulation cells: the same panels as the main window's 시뮬레이션 tab, sharing settings and results
function paintSimCell(C){
  if(!BD)return;const tab=SKINDS[C.kind][1],key=[tab,S.hlNet,S.selRef,BD.name].join('|');
  if(!C.simDirty&&key===C.hkey)return;C.simDirty=false;C.hkey=key;
  if(!SR.cfg)simReset();
  const hv=C.hv,st=hv.scrollTop,hadRes=!!hv.querySelector('.res,.errline,#spChart svg');
  try{if(tab==='si'&&!SR.si)runSI();
    const env=`<p class="simenv">기판 조건: 동박 ${ENV.cu} µm · 유전체 ${ENV.h.toFixed(2)} mm · εr ${ENV.er} · 주변 ${ENV.Ta} °C — 원래 창의 시뮬레이션 패널에서 바꿉니다.</p>`;
    hv.innerHTML=env+(tab==='ir'?irHTML():tab==='si'?siHTML():tab==='th'?thHTML():tab==='emc'?emcHTML():spHTML());
    (tab==='ir'?irBind:tab==='si'?siBind:tab==='th'?thBind:tab==='emc'?emcBind:spBind)(hv);}
  catch(e){console.error(e);hv.innerHTML=`<p class="errline">시뮬레이션 화면을 그리지 못했습니다: ${esc(e.message)}</p>`;}
  hv.scrollTop=st;
  // a run just produced results: bring them into view
  const res=!hadRes&&hv.querySelector('.res,.errline,#spChart svg');if(res){const r=res.getBoundingClientRect(),b=hv.getBoundingClientRect();if(r.top>b.bottom-40||r.bottom<b.top)res.scrollIntoView({block:'nearest'});}
}
// 2D board (TOP/BOTTOM) and schematic cells: pan, zoom, hover, click
function bind2DCell(C){
  const cv=C.cv,win=C.win,pts=new Map();let start=null,moved=0,pinch=0,hq=null,hraf=0;
  const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const zoomAt=(px,py,f)=>{const[wx,wy]=C.kind==='sch'?schS2W(C,px,py):[(px-C.ox)/C.s,(py-C.oy)/C.s];C.s=Math.max(0.3,Math.min(600,C.s*f));C.ox=px-wx*C.s;C.oy=py-wy*C.s;C.userMoved=true;C.draw();};
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,pos(e));moved=0;start=pos(e);if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cv.addEventListener('pointermove',e=>{const p=pos(e);
    if(pts.has(e.pointerId)){const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);
      if(pts.size===1){C.ox+=p[0]-prev[0];C.oy+=p[1]-prev[1];moved+=Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]);if(moved>=5)C.userMoved=true;C.draw();}
      else if(pts.size===2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/pinch);pinch=d;moved=99;}C.tip.hidden=true;return;}
    hq=p;if(!hraf)hraf=win.requestAnimationFrame(()=>{hraf=0;if(!hq||!BD)return;const h=C.hit(hq[0],hq[1]);
      const was=C.hover&&(C.hover.s||C.hover.c);C.hover=h&&(h.type==='sym'||h.type==='comp')?h:null;if((C.hover&&(C.hover.s||C.hover.c))!==was)C.draw();
      let html=h?(C.kind==='sch'?schTip(h):tipHTML(h)):'';
      if(C.kind!=='sch'&&C.ovk){const[wx,wy]=C.s2w(hq[0],hq[1]);OV_FORCE=C.ovk;try{html+=overlayTip(h,wx,wy);}finally{OV_FORCE=undefined;}}
      C.showTip(html,hq[0],hq[1]);cv.style.cursor=html?'pointer':'';});});
  const end=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=0;
    if(pts.size===0&&moved<5&&start&&e.type==='pointerup'&&BD){const h=C.hit(start[0],start[1]);if(C.kind==='sch')schApply(h,C);else applyHit(h);}};
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  cv.addEventListener('pointerleave',()=>{hq=null;C.tip.hidden=true;if(C.hover){C.hover=null;C.draw();}});
  cv.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pos(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));},{passive:false});
  cv.addEventListener('dblclick',()=>{C.userMoved=false;C.refit();C.draw();});
}
// 3D cells: own renderer + camera on the shared scene (G3.scene), redrawn when the scene version changes
function mount3DCell(C){
  if(!window.THREE)return false;
  if(!G3&&!init3D())return false;
  if(G3.board!==BD){rebuild3D();sync3D();}
  // three.js detects WebGL2 with instanceof, which fails across windows; in a separate window hand it a WebGL1 context so its shader setup matches
  let renderer;try{const opt={canvas:C.cv,antialias:true,alpha:true};
    if(C.win!==window){const gl=C.cv.getContext('webgl',{antialias:true,alpha:true})||C.cv.getContext('experimental-webgl',{antialias:true,alpha:true});if(!gl)return false;opt.context=gl;}
    renderer=new THREE.WebGLRenderer(opt);}catch(e){return false;}
  renderer.outputEncoding=THREE.sRGBEncoding;renderer.setPixelRatio(Math.min(C.win.devicePixelRatio||1,2));
  const cam=new THREE.PerspectiveCamera(30,1,0.5,5000);cam.up.set(0,0,1);
  const g={renderer,cam,orb:{th:-1.95,ph:0.95,r:110,t:new THREE.Vector3()},dirty:true,ver:-1,anim:null,alive:true,homed:false};
  g.place=()=>{const o=g.orb;cam.position.set(o.t.x+o.r*Math.sin(o.ph)*Math.cos(o.th),o.t.y+o.r*Math.sin(o.ph)*Math.sin(o.th),o.t.z+o.r*Math.cos(o.ph));cam.near=Math.max(0.1,o.r/500);cam.far=o.r*20;cam.updateProjectionMatrix();cam.lookAt(o.t);g.dirty=true;};
  g.fitR=()=>{const a=cam.aspect||1.5,t=Math.tan(cam.fov*D2R/2);return Math.max(BD.H*1.25/(2*t),BD.W*1.25/(2*t*a));};
  g.to=(th,ph,r,an)=>{const o=g.orb;if(!an||reduceMotion){g.anim=null;o.th=th;o.ph=ph;o.r=r;o.t.set(0,0,0);g.place();return;}
    let dth=th-o.th;while(dth>Math.PI)dth-=TAU;while(dth<-Math.PI)dth+=TAU;g.anim={from:{th:o.th,ph:o.ph,r:o.r,tx:o.t.x,ty:o.t.y},to:{th:o.th+dth,ph,r},t0:performance.now()};};
  g.home=an=>g.to(-1.95,0.95,g.fitR()*1.05,an);
  const step=()=>{const a=g.anim;if(!a)return;const k=Math.min(1,(performance.now()-a.t0)/450),e=1-Math.pow(1-k,3),o=g.orb,L=(p,q)=>p+(q-p)*e;
    o.th=L(a.from.th,a.to.th);o.ph=L(a.from.ph,a.to.ph);o.r=L(a.from.r,a.to.r);o.t.set(L(a.from.tx,0),L(a.from.ty,0),0);g.place();if(k>=1)g.anim=null;};
  const tick=()=>{if(!g.alive)return;C.win.requestAnimationFrame(tick);step();stepPlay(performance.now()); // keeps circuit playback moving even if the main window is in the background
    if(G3.ver!==g.ver){g.ver=G3.ver;g.dirty=true;}
    if(g.dirty&&G3.board&&C.w){try{renderer.render(G3.scene,cam);}catch(e){console.error(e);g.alive=false;}g.dirty=false;}};
  g.dispose=()=>{g.alive=false;try{renderer.dispose();renderer.forceContextLoss();}catch(e){}};
  C.g=g;bind3DCell(C);C.win.requestAnimationFrame(tick);
  return true;
}
function bind3DCell(C){
  const cv=C.cv,win=C.win,pts=new Map();let start=null,moved=0,pinch=0,mode='rot',hovQ=null,hraf=0;
  const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
  const pick=(x,y)=>C.g&&G3.board?pick3DCam(C.g.cam,C.w,C.h,x,y):null;
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,pos(e));start=pos(e);moved=0;if(C.g)C.g.anim=null;
    mode=(e.button===2||e.shiftKey||e.button===1)?'pan':'rot';if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  cv.addEventListener('pointermove',e=>{const p=pos(e),g=C.g;if(!g)return;
    if(pts.has(e.pointerId)){const prev=pts.get(e.pointerId);pts.set(e.pointerId,p);const dx=p[0]-prev[0],dy=p[1]-prev[1];moved+=Math.abs(dx)+Math.abs(dy);const o=g.orb;
      if(pts.size>=2){const[a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)o.r=Math.max(5,Math.min(3000,o.r*pinch/d));pinch=d;}
      else if(mode==='pan'){const k=o.r*0.0016,rx=new THREE.Vector3().setFromMatrixColumn(g.cam.matrixWorld,0),uy=new THREE.Vector3().setFromMatrixColumn(g.cam.matrixWorld,1);o.t.addScaledVector(rx,-dx*k).addScaledVector(uy,dy*k);}
      else{o.th-=dx*0.008;o.ph=Math.max(0.02,Math.min(Math.PI-0.02,o.ph-dy*0.008));}
      if(moved>=5)C.userMoved=true;g.place();C.tip.hidden=true;return;}
    hovQ=p;if(!hraf)hraf=win.requestAnimationFrame(()=>{hraf=0;if(!hovQ)return;const h=pick(hovQ[0],hovQ[1]);
      const real=h&&h.type!=='none'?h:null;const extra=h&&typeof overlayTip==='function'?overlayTip(real,h._x,h._y):'';
      C.showTip((real?tipHTML(real):'')+extra,hovQ[0],hovQ[1]);cv.style.cursor=real?'pointer':'grab';});});
  const end=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=0;if(pts.size===0&&moved<5&&start&&e.type==='pointerup'&&G3&&G3.board)applyHit(pick(start[0],start[1]));};
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  cv.addEventListener('pointerleave',()=>{hovQ=null;C.tip.hidden=true;});
  cv.addEventListener('wheel',e=>{e.preventDefault();const g=C.g;if(!g)return;g.anim=null;const o=g.orb;o.r=Math.max(5,Math.min(3000,o.r*Math.exp(e.deltaY*0.0012)));C.userMoved=true;g.place();},{passive:false});
  cv.addEventListener('dblclick',()=>{if(C.g){C.userMoved=false;C.g.home(true);}});
}
// system diagram / housing drawing cells: live SVG, re-rendered when the data changes
function paintDesignCell(C){if(!BD)return;const hv=C.hv;let key,html;
  try{if(C.kind==='sys'||C.kind==='parts'){const svg=sysSVG(C.kind==='sys'?'hw':'parts');key=C.kind+'|'+svg.length+'|'+svg.slice(0,400);if(key===C.hkey)return;C.hkey=key;hv.innerHTML=svg?`<div class="sysd-wrap">${svg}</div>`:'<div class="hnone">시스템 다이어그램이 없습니다.<br>1단계에서 요구사항을 분석하거나 [보드에서 추출]을 누르세요.</div>';}
    else{if(typeof mechRun!=='function'||BD.blank||BD.pcbPending){hv.innerHTML='<div class="hnone">하우징은 PCB가 배치된 뒤(3단계 이후) 만들어집니다.</div>';return;}mechCfg();const R=mechRun();key='cadd|'+JSON.stringify(BD.housing.cad)+'|'+JSON.stringify(BD.housing.inp)+'|'+BD.name;if(key===C.hkey)return;C.hkey=key;hv.innerHTML=`<div class="sysd-wrap">${HOUSING.drawingSVG(R,BD.name)}</div>`;}}
  catch(e){console.error(e);hv.innerHTML=`<p class="errline">${esc(e.message)}</p>`;}}
// export one cell as SVG / PNG / Excel
async function cellExport(C,fmt){if(!BD)return;const k=C.kind;
  try{if(fmt==='xlsx'){const tbls=[...C.hv.querySelectorAll('table')];return exportXlsx(tbls.map((t,i)=>({name:kindLabel(k)+(tbls.length>1?' '+(i+1):''),table:t})),expName()+'_'+k.replace(/^[hs]-/,'')+'.xlsx');}
    if(k==='3d'||k==='cad3'){if(!C.g)return;const url=threePNG(C.g.renderer,C.g.cam,C.cv);return url?expSave(expName()+(k==='cad3'?'_housing_3D.png':'_3D.png'),dataUrlBytes(url),'image/png'):null;}
    if(k==='sch')return exportSch(fmt,C.page);if(k==='sys'||k==='parts')return exportSys(fmt,k==='sys'?'hw':'parts');if(k==='cadd')return exportHousing(fmt==='png'?'drawing-png':'drawing');
    return exportLayer(fmt,k==='B'?'B':'T',isIn(k)?k:null);}
  catch(e){console.error(e);toast('내보내기 실패: '+e.message);}}
function popsRefresh(boardChanged){
  WINS.forEach(W=>{let gone=false;try{gone=!W.floating&&W.win.closed;}catch(e){gone=true;}if(gone)W.drop();});
  let has3=false;POPS.forEach(C=>{if(C.g)has3=true;});
  if(has3&&G3){if(G3.board!==BD){rebuild3D();sync3D();}else if(S.view!=='3d')sync3D();}
  POPS.forEach(C=>{
    if(boardChanged){if(isIn(C.kind)&&!BD.layers[C.kind+'.cu']){C.setKind('T');}C.fitted=-1;C.page=0;C.hover=null;C.lastKey='';C.userMoved=false;C.hkey='';if(C.g){C.g.homed=false;C.g.ver=-1;}C.resize();C.refit();}
    if(C.kind==='sch')schFocus(C);C.draw();});
  if(boardChanged)WINS.forEach(W=>W.sync());
}
window.addEventListener('beforeunload',()=>WINS.forEach(W=>{if(!W.floating)try{W.win.close();}catch(e){}}));

/* ---------- resizable panes ---------- */
const LAYOUT_KEY='pcbv.layout';
const LAY=(function(){try{return JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')||{};}catch(e){return{};}})();
function saveLayout(){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(LAY));}catch(e){}}
function applyLayout(){const m=$('.main'),h=$('#hsisWs');
  [['lw',m,'--lw'],['dock',$('.work'),'--dock'],['hl',h,'--hsw-l'],['hr',h,'--hsw-r'],['sl',$('#sysWs'),'--sys-l'],['sr',$('#sysWs'),'--sys-r'],['cl',$('#cadWs'),'--cad-l']].forEach(([k,el,v])=>{if(LAY[k])el.style.setProperty(v,LAY[k]+'px');else el.style.removeProperty(v);});
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
  makeHandle($('#hLeft'),{label:'왼쪽 패널 너비',get:()=>w($('.layers')),set:v=>{LAY.lw=Math.round(v);applyLayout();},min:170,max:()=>Math.min(420,w(m)*0.35),reset:()=>{delete LAY.lw;applyLayout();}});
  makeHandle($('#hDock'),{label:'오른쪽 패널(설계 도우미) 너비',dir:-1,get:()=>w($('#dock')),set:v=>{LAY.dock=Math.round(v);applyLayout();relayoutViews();},min:300,max:()=>Math.min(760,window.innerWidth*0.5),reset:()=>{delete LAY.dock;applyLayout();relayoutViews();}});
  makeHandle($('#hHsL'),{label:'HSIS 왼쪽 패널 너비',get:()=>w($('#hsLeft')),set:v=>{LAY.hl=Math.round(v);applyLayout();},min:190,max:()=>Math.min(440,w(h)*0.35),reset:()=>{delete LAY.hl;applyLayout();}});
  const sw=$('#sysWs');if($('#hSysL'))makeHandle($('#hSysL'),{label:'시스템 다이어그램 왼쪽 패널 너비',get:()=>w($('#sysLeft')),set:v=>{LAY.sl=Math.round(v);applyLayout();},min:220,max:()=>Math.min(560,w(sw)*0.5),reset:()=>{delete LAY.sl;applyLayout();}});
  if($('#hSysR'))makeHandle($('#hSysR'),{label:'시스템 다이어그램 오른쪽 패널 너비',dir:-1,get:()=>w($('#sysRight')),set:v=>{LAY.sr=Math.round(v);applyLayout();},min:220,max:()=>Math.min(560,w(sw)*0.5),reset:()=>{delete LAY.sr;applyLayout();}});
  const cw=$('#cadWs');if($('#hCadL'))makeHandle($('#hCadL'),{label:'기구 설계 왼쪽 패널 너비',get:()=>w($('#cadLeft')),set:v=>{LAY.cl=Math.round(v);applyLayout();},min:240,max:()=>Math.min(600,w(cw)*0.5),reset:()=>{delete LAY.cl;applyLayout();}});
  makeHandle($('#hHsR'),{label:'HSIS 상세 패널 너비',dir:-1,get:()=>w($('#hsDetail')),set:v=>{LAY.hr=Math.round(v);applyLayout();drawMini();},min:280,max:()=>Math.min(760,w(h)*0.55),reset:()=>{delete LAY.hr;applyLayout();drawMini();}});
  const sp=$('#splitter');const narrow=()=>matchMedia('(max-width:760px)').matches;
  makeHandle(sp,{label:'회로도와 보드 나누기',vertical:narrow,get:()=>{const r=vp.getBoundingClientRect();const f=LAY.split||50;return(narrow()?r.height:r.width)*f/100;},
    set:v=>{const r=vp.getBoundingClientRect();LAY.split=+(v/(narrow()?r.height:r.width)*100).toFixed(1);applyLayout();relayoutViews();},min:120,max:()=>{const r=vp.getBoundingClientRect();return(narrow()?r.height:r.width)-120;},
    reset:()=>{delete LAY.split;applyLayout();relayoutViews();}});
  applyLayout();
})();
let relayRaf=0;
function relayoutViews(){if(relayRaf)return;relayRaf=requestAnimationFrame(()=>{relayRaf=0;if(S.sch!=='off'){schResize();if(!SV.userMoved)schFit();paintSch();}if(S.sch!=='full'){if(S.view==='3d')resize3D();else{measure();paint2D();}}});}

/* ---------- "새 창" layout picker: presets, a table-style size grid, and a viewer per cell ---------- */
(function(){
  const btn=$('#winBtn'),pk=$('#winPick');
  const st=Object.assign({r:2,c:2,k:{}},LAY.win||{});st.r=Math.max(1,Math.min(MAXR,st.r|0||2));st.c=Math.max(1,Math.min(MAXC,st.c|0||2));if(!st.k||typeof st.k!=='object')st.k={};
  const kindsFor=(r,c)=>{const def=defaultKinds(r,c),sv=st.k[r+'x'+c]||[];return def.map((d,i)=>KINDS.includes(sv[i])?sv[i]:d);};
  pk.innerHTML=`<div class="wp-h">새 창 레이아웃</div>
    <div class="wp-pre" role="group" aria-label="자주 쓰는 배치">${PRESETS.map(([r,c])=>`<button type="button" data-pre="${r}x${c}" aria-pressed="false">${gridIcon(r,c)}<span>${r}×${c}</span></button>`).join('')}</div>
    <div class="wp-sub">표에서 칸 수 고르기 <span class="wp-max">최대 ${MAXR}×${MAXC}</span></div>
    <div class="wp-grid" role="group" aria-label="행과 열 수">${Array.from({length:MAXR*MAXC},(_,i)=>{const r=(i/MAXC|0)+1,c=i%MAXC+1;return`<button type="button" data-r="${r}" data-c="${c}" aria-label="${r}행 ${c}열"></button>`;}).join('')}</div>
    <div class="wp-size" aria-live="polite"></div>
    <div class="wp-sub">칸마다 보기 고르기</div>
    <div class="wp-cells"></div>
    <div class="wp-act"><button type="button" class="btn sm" data-x>취소</button><button type="button" class="btn sm primary" data-go>새 창 열기</button></div>`;
  const cells=pk.querySelector('.wp-cells'),size=pk.querySelector('.wp-size'),gridBtns=[...pk.querySelectorAll('.wp-grid button')];
  const mark=(r,c,preview)=>{gridBtns.forEach(b=>{const on=+b.dataset.r<=r&&+b.dataset.c<=c;b.classList.toggle('on',on);b.classList.toggle('pv',!!preview&&on);b.setAttribute('aria-pressed',+b.dataset.r===st.r&&+b.dataset.c===st.c?'true':'false');});
    size.textContent=`${r} × ${c} · ${r*c}칸`+(preview&&(r!==st.r||c!==st.c)?' (미리 보기)':'');};
  const render=()=>{mark(st.r,st.c,false);
    pk.querySelectorAll('[data-pre]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.pre===`${st.r}x${st.c}`?'true':'false'));
    const ks=kindsFor(st.r,st.c);cells.style.gridTemplateColumns=`repeat(${st.c},minmax(0,1fr))`;
    cells.innerHTML=ks.map((k,i)=>`<label class="wp-cell"><span class="wp-n">${i+1}</span><select data-i="${i}" aria-label="${i+1}번 칸 보기">${kindOptions(k)}</select></label>`).join('');};
  const setSize=(r,c)=>{st.r=r;st.c=c;render();};
  const save=()=>{LAY.win={r:st.r,c:st.c,k:st.k};saveLayout();};
  const open=()=>{render();pk.hidden=false;btn.setAttribute('aria-expanded','true');const f=pk.querySelector('[data-pre][aria-pressed="true"]')||gridBtns[0];f.focus();};
  const close=back=>{if(pk.hidden)return;pk.hidden=true;btn.setAttribute('aria-expanded','false');if(back)btn.focus();};
  btn.addEventListener('click',()=>pk.hidden?open():close(true));
  pk.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
    if(t.dataset.pre){const[r,c]=t.dataset.pre.split('x').map(Number);setSize(r,c);}
    else if(t.dataset.r){setSize(+t.dataset.r,+t.dataset.c);}
    else if('x' in t.dataset)close(true);
    else if('go' in t.dataset){save();close(false);openWindow(st.r,st.c,kindsFor(st.r,st.c));}});
  pk.addEventListener('change',e=>{const s=e.target.closest('select[data-i]');if(!s)return;const key=st.r+'x'+st.c,ks=kindsFor(st.r,st.c);ks[+s.dataset.i]=s.value;st.k[key]=ks;});
  const grid=pk.querySelector('.wp-grid');
  grid.addEventListener('pointerover',e=>{const b=e.target.closest('button');if(b)mark(+b.dataset.r,+b.dataset.c,true);});
  grid.addEventListener('pointerleave',()=>mark(st.r,st.c,false));
  grid.addEventListener('focusin',e=>{const b=e.target.closest('button');if(b)mark(+b.dataset.r,+b.dataset.c,true);});
  grid.addEventListener('focusout',()=>mark(st.r,st.c,false));
  grid.addEventListener('keydown',e=>{const b=e.target.closest('button');if(!b)return;let r=+b.dataset.r,c=+b.dataset.c;
    if(e.key==='ArrowRight')c++;else if(e.key==='ArrowLeft')c--;else if(e.key==='ArrowDown')r++;else if(e.key==='ArrowUp')r--;else return;e.preventDefault();
    r=Math.max(1,Math.min(MAXR,r));c=Math.max(1,Math.min(MAXC,c));gridBtns[(r-1)*MAXC+c-1].focus();});
  document.addEventListener('pointerdown',e=>{if(!pk.hidden&&!e.target.closest('#winPick,#winBtn'))close(false);});
  pk.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close(true);}});
})();
