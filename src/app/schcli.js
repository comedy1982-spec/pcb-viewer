/* ---------- schematic console (CLI) with the same Claude agent as the layout console ----------
   Commands edit BD.schSheets through SCHEDIT (each one is a single schematic undo step); "apply" back-annotates the board. */
var SCLI={open:false,log:[],hist:[],hi:-1,busy:false,seq:0,stopReq:false,abort:null};
const SCLI_HELP=[
  ['help [명령]','명령 목록과 사용법'],
  ['status','페이지·부품·넷·ERC·보드와 다른 점'],
  ['pages · page <n>','페이지 목록 · 페이지로 이동'],
  ['parts [검색어]','부품 목록 (참조·값·풋프린트·페이지)'],
  ['pins <부품> [--free] [--net 넷]','핀 번호·이름·연결된 넷 (--free 미연결만)'],
  ['nets [검색어] · net <넷>','넷 목록(핀 수) · 넷에 연결된 핀'],
  ['find <부품|넷>','화면을 그 부품이나 넷으로 이동'],
  ['add <R|C|CP|L|FB|D|LED> [값] [--pins 넷1,넷2] [--near 부품] [--page n] [--at x y] [--vert|--horiz] [--ref R9] [--fp 0603]','부품 추가. --pins면 핀 1·2에 넷 라벨(전원은 전원 심볼)을 붙여 연결. 전원,GND 캡은 세로로 세움. 위치를 안 주면 --near 부품 옆 빈 자리'],
  ['connect <부품.핀> <넷>','핀 끝에 짧은 배선과 넷 라벨(전원·GND는 전원 심볼)을 붙여 연결. 핀은 번호나 이름(U1.23, U1.VEXT)'],
  ['disconnect <부품.핀>','핀에 붙은 배선·라벨·전원 심볼 떼기'],
  ['nc <부품.핀>','미연결(NC) 표시'],
  ['value <부품> <값> · fp <부품> <풋프린트> · rename <부품> <새 참조>','속성 변경'],
  ['move <부품> <x> <y> · rotate <부품> · mirror <부품> [x|y] · delete <부품>','부품 옮기기(배선 유지)·회전·반전·삭제'],
  ['erc','전기 규칙 검사 목록'],
  ['diff · apply','보드와 다른 점 보기 · 보드에 반영 (F8과 같음, 새 부품은 보드 빈 자리에)'],
  ['regen','보드 넷리스트로 회로도를 처음부터 다시 생성 (편집 내용 버림)'],
  ['export','KiCad 회로도(.kicad_sch) zip 저장'],
  ['undo · redo · clear','실행 취소 · 다시 실행 · 화면 지우기'],
  ['ai <요청>','Claude가 위 명령을 골라 실행 (명령이 아닌 문장도 Claude에게 갑니다)']];
const SCLI_CMDS=new Set(['help','?','status','pages','page','parts','pins','nets','net','find','add','connect','disconnect','nc','value','fp','rename','move','rotate','mirror','delete','erc','diff','apply','regen','export','undo','redo','clear','ai','history']);

/* ---- panel ---- */
function scSay(k,t){const e={k,t,id:++SCLI.seq};SCLI.log.push(e);if(SCLI.log.length>400)SCLI.log.shift();scPaint(e);return e;}
function scSet(e,t){e.t=t;scPaint(e,true);}
function scPaint(e,upd){const L=$('#scLog');if(!L)return;
  if(upd){const el=L.querySelector(`[data-id="${e.id}"]`);if(el){el.textContent=e.t;L.scrollTop=L.scrollHeight;return;}}
  const d=document.createElement('div');d.className='cl-'+e.k;d.dataset.id=e.id;d.textContent=(e.k==='cmd'?'› ':'')+e.t;L.appendChild(d);while(L.children.length>400)L.firstChild.remove();L.scrollTop=L.scrollHeight;}
function scPanel(){
  let el=$('#schCli');if(el)return el;
  el=document.createElement('section');el.id='schCli';el.className='pe-cli sch-cli';el.hidden=true;el.setAttribute('aria-label','회로도 CLI');
  el.innerHTML=`<div class="cli-h"><b>회로도 CLI</b><span class="cli-ai" id="scAi" title="명령이 아닌 문장은 Claude가 명령으로 바꿔 실행합니다">AI 확인 중…</span>
    <span class="cli-sp"></span><button type="button" class="pill vbtn" id="scStop" hidden>중지</button><button type="button" class="pill vbtn" id="scX" title="닫기 (\`)">닫기</button></div>
    <div class="cli-chips" role="toolbar" aria-label="빠른 명령">
      <button type="button" class="pill vbtn" data-c="status">상태</button>
      <button type="button" class="pill vbtn" data-c="erc">ERC</button>
      <button type="button" class="pill vbtn" data-c="diff">보드와 다른 점</button>
      <button type="button" class="pill vbtn" data-c="apply">보드에 반영</button>
      <button type="button" class="pill vbtn" data-c="help">도움말</button></div>
    <div class="cli-log" id="scLog" role="log" aria-live="polite"></div>
    <form class="cli-in" id="scForm" autocomplete="off"><span aria-hidden="true">›</span><input id="scIn" spellcheck="false" placeholder="예: pins U1 --free · add C 100nF --pins +3V3,GND --near U1 · U4 전원 핀에 디커플링 캡 달아줘" aria-label="회로도 명령 입력"><button class="btn primary sm" id="scRun">실행</button></form>`;
  $('#schOv').appendChild(el);
  el.querySelector('#scForm').addEventListener('submit',e=>{e.preventDefault();const i=$('#scIn');const v=i.value.trim();if(!v||SCLI.busy)return;i.value='';SCLI.hist.push(v);SCLI.hi=SCLI.hist.length;scExec(v);});
  el.querySelector('#scIn').addEventListener('keydown',e=>{const i=e.target;
    if(e.key==='ArrowUp'){if(SCLI.hi>0){SCLI.hi--;i.value=SCLI.hist[SCLI.hi]||'';}e.preventDefault();}
    else if(e.key==='ArrowDown'){if(SCLI.hi<SCLI.hist.length){SCLI.hi++;i.value=SCLI.hist[SCLI.hi]||'';}e.preventDefault();}
    else if(e.key==='Tab'){const w=i.value.trim();const m=[...SCLI_CMDS].filter(n=>n.length>2&&n.startsWith(w));if(w&&m.length){i.value=m[0]+' ';e.preventDefault();}}
    else if(e.key==='Escape')i.blur();
    e.stopPropagation();});
  el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='scX')scToggle(false);else if(b.id==='scStop'){SCLI.stopReq=true;if(SCLI.abort)SCLI.abort.abort();}else if(b.dataset.c&&!SCLI.busy)scExec(b.dataset.c);});
  el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation());
  scSay('out','회로도 명령을 입력하거나 하고 싶은 일을 문장으로 적으세요. help로 명령 목록을 봅니다.');
  scAiBadge();return el;
}
async function scAiBadge(){await cliAiProbe();const b=$('#scAi');if(!b)return;b.textContent=CLI.sample?'AI 사용 가능':'AI 없음 · 문장은 규칙으로 해석';b.classList.toggle('on',!!CLI.sample);}
function scToggle(on){if(S.sch==='off')return;if(!SE.on)seBegin();const el=scPanel();SCLI.open=on==null?!SCLI.open:on;el.hidden=!SCLI.open;seBar();if(SCLI.open)setTimeout(()=>$('#scIn')&&$('#scIn').focus(),20);}
function scBusy(b){SCLI.busy=b;const r=$('#scRun'),s=$('#scStop'),i=$('#scIn');if(r)r.disabled=b;if(s)s.hidden=!b;if(i)i.disabled=b;if(!b){SCLI.stopReq=false;SCLI.abort=null;setTimeout(()=>i&&SCLI.open&&i.focus(),10);}}

/* ---- model helpers ---- */
const scIsGnd=n=>/^(GND|AGND|DGND|PGND|VSS|GNDA|GNDD|EARTH|0V)$/i.test(String(n||''));
function scSheets(){if(!SE.on)seBegin();return BD.schSheets;}
function scSyms(ref){const out=[];scSheets().forEach((sh,pi)=>sh.symbols.forEach(s=>{if(!s.power&&s.ref.toLowerCase()===String(ref).toLowerCase())out.push({s,sh,page:pi});}));if(!out.length)throw new Error(`회로도에 ${ref} 부품이 없습니다.`);return out;}
function scPin(spec){const m=String(spec||'').match(/^([^.:]+)[.:](.+)$/);if(!m)throw new Error(`핀은 부품.핀 형식입니다 (예: U1.23, U1.VEXT): ${spec}`);
  const units=scSyms(m[1]);const want=m[2].toLowerCase();let hits=[];
  units.forEach(u=>u.s.pins.forEach(p=>{if(String(p.num).toLowerCase()===want)hits.push({...u,pin:p});}));
  if(!hits.length)units.forEach(u=>u.s.pins.forEach(p=>{if(String(p.name||'').toLowerCase()===want)hits.push({...u,pin:p});}));
  if(!hits.length)throw new Error(`${m[1]}에 ${m[2]} 핀이 없습니다. pins ${m[1]}로 확인하세요.`);
  if(hits.length>1){const nl=scNets();const free=hits.filter(h=>!nl.get(h.s.ref+'.'+h.pin.num));if(free.length===1)return free[0];
    throw new Error(`${m[1]}.${m[2]} 이름의 핀이 ${hits.length}개입니다: ${hits.map(h=>h.pin.num).join(', ')} — 번호로 지정하세요.`);}
  return hits[0];}
function scNets(){return SCHEDIT.netlist(scSheets(),BD).pinNet;}
function scBatch(fn){const sheets=scSheets();const before=SCHEDIT.snapshot(sheets);let r;try{r=fn();}catch(e){BD.schSheets=SCHEDIT.restore(before);seRefresh(false);throw e;}
  SE.undo.push(before);if(SE.undo.length>80)SE.undo.shift();SE.redo=[];SE.sel=null;seRefresh(true);renderSchOv();drawSch();return r;}
function scLabelRect(l){const w=l._w||l.s.length*1.27*0.95,sz=1.27;const r=((l.rot%360)+360)%360;
  return r===0?[l.p[0],l.p[1]-sz*1.4,l.p[0]+w+0.6,l.p[1]+sz*0.6]:r===180?[l.p[0]-w-0.6,l.p[1]-sz*1.4,l.p[0],l.p[1]+sz*0.6]:r===90?[l.p[0]-sz*1.4,l.p[1]-w-0.6,l.p[0]+sz*0.6,l.p[1]]:[l.p[0]-sz*1.4,l.p[1],l.p[0]+sz*0.6,l.p[1]+w+0.6];}
const scDir=pin=>{const dx=pin.p[0]-pin.e[0],dy=pin.p[1]-pin.e[1];if(Math.abs(dx)<1e-6&&Math.abs(dy)<1e-6)return[1,0];return Math.abs(dx)>=Math.abs(dy)?[Math.sign(dx),0]:[0,Math.sign(dy)];};
// a pin gets a short stub and a net label (power and ground get a power symbol), like hand-drawn label-style schematics
function scAttach(sh,pin,net){
  const[ux,uy]=scDir(pin);const q=SCHEDIT.sp([pin.p[0]+ux*2.54,pin.p[1]+uy*2.54]);
  SCHEDIT.addWire(sh,pin.p,q);
  const pwr=scIsGnd(net)||BD.netClass(net)==='전원';
  if(pwr)SCHEDIT.addPower(sh,net,q,ux>0?0:uy>0?1:ux<0?2:3,scIsGnd(net));
  else SCHEDIT.addLabel(sh,'global',net,q,ux>0?0:ux<0?180:uy<0?90:270);
}
// room a new symbol needs: its box plus the stubs and labels its pins will get
function scNeed(s,nets){const b=s.bb.slice();s.pins.forEach((p,i)=>{const[ux,uy]=scDir(p);const L=2.54+((nets&&nets[i])?String(nets[i]).length*1.25+2:1);
  if(ux>0)b[2]=Math.max(b[2],p.p[0]+L);if(ux<0)b[0]=Math.min(b[0],p.p[0]-L);if(uy>0)b[3]=Math.max(b[3],p.p[1]+L);if(uy<0)b[1]=Math.min(b[1],p.p[1]-L);});return b;}
function scFree(sh,s,target,nets){
  const m=1.27;const busy=(b)=>{if(b[0]<8||b[1]<8||b[2]>sh.w-8||b[3]>sh.h-8)return true;
    for(const o of sh.symbols){if(o===s)continue;const q=o.bb;if(b[0]<q[2]+m&&q[0]<b[2]+m&&b[1]<q[3]+m&&q[1]<b[3]+m)return true;}
    for(const l of sh.labels){const q=scLabelRect(l);if(b[0]<q[2]&&q[0]<b[2]&&b[1]<q[3]&&q[1]<b[3])return true;}
    for(const w of sh.wires){const x0=Math.min(w.a[0],w.b[0]),x1=Math.max(w.a[0],w.b[0]),y0=Math.min(w.a[1],w.b[1]),y1=Math.max(w.a[1],w.b[1]);if(b[0]-0.5<x1&&x0<b[2]+0.5&&b[1]-0.5<y1&&y0<b[3]+0.5)return true;}
    for(const j of sh.nocon)if(j[0]>b[0]&&j[0]<b[2]&&j[1]>b[1]&&j[1]<b[3])return true;
    return false;};
  const G=2.54;const t=SCHEDIT.sp(target);
  for(let r=0;r<=60;r++){const cand=[];if(!r)cand.push([0,0]);else for(let k=-r;k<=r;k++){cand.push([k,-r],[k,r]);if(k>-r&&k<r)cand.push([-r,k],[r,k]);}
    cand.sort((a,b)=>Math.hypot(a[0],a[1]*1.3)-Math.hypot(b[0],b[1]*1.3));
    for(const[i,j]of cand){const a=SCHEDIT.anchor(s);SCHEDIT.moveSym(s,t[0]+i*G-a[0],t[1]+j*G-a[1]);if(!busy(scNeed(s,nets)))return true;}}
  return false;}
function scFocus(page,p){SV.page=page;renderSchOv();SV.userMoved=true;SV.s=Math.max(SV.s,6);const cp=$('#schCli'),vis=cp&&!cp.hidden?Math.max(120,SV.h-cp.offsetHeight-12):SV.h;SV.ox=SV.w/2-p[0]*SV.s;SV.oy=vis/2-p[1]*SV.s;drawSch();}
const scNum=v=>{const x=parseFloat(v);if(!isFinite(x))throw new Error('숫자가 필요합니다: '+v);return x;};

/* ---- commands ---- */
function scStatus(){
  const sh=scSheets();const nl=scNets();const syms=sh.flatMap(x=>x.symbols.filter(s=>!s.power));const refs=new Set(syms.map(s=>s.ref));
  const nets=new Set(nl.values());const res=SCHEDIT.annotate(sh,BD);const erc=SCHEDIT.erc(sh);
  return[`페이지 ${sh.length}쪽 (지금 ${SV.page+1}쪽) · 부품 ${refs.size}개 · 넷 ${nets.size}개 · 배선 ${sh.reduce((a,x)=>a+x.wires.length,0)}개 · 라벨 ${sh.reduce((a,x)=>a+x.labels.length,0)}개`,
    `ERC ${erc.length}건 · 보드와 다른 점 ${res.changes.length}건${res.changes.length?' (diff로 보기, apply로 반영)':''}${res.missing.length?` · 회로도에 없는 보드 부품 ${res.missing.length}개`:''}`].join('\n');}
function scParts(q){const nl=scNets();const rows=[];const seen=new Set();scSheets().forEach((sh,pi)=>sh.symbols.forEach(s=>{if(s.power||seen.has(s.ref+'@'+pi))return;seen.add(s.ref+'@'+pi);
    const used=s.pins.filter(p=>nl.get(s.ref+'.'+p.num)).length;rows.push({ref:s.ref,t:`${s.ref} ${s.val||''} · ${s.fp||'-'} · ${pi+1}쪽 · 핀 ${s.pins.length}(연결 ${used})${BD.byRef[s.ref]?'':' · 보드에 없음'}`});}));
  const qq=(q||'').toLowerCase();const list=rows.filter(r=>!qq||r.t.toLowerCase().includes(qq)).sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true}));
  return list.length?list.slice(0,80).map(r=>r.t).join('\n')+(list.length>80?`\n… 외 ${list.length-80}개`:''):'해당 부품이 없습니다.';}
function scPins(a){const units=scSyms(a._[0]);const nl=scNets();const rows=[];
  units.forEach(u=>u.s.pins.forEach(p=>{const n=nl.get(u.s.ref+'.'+p.num)||'';const nc=u.sh.nocon.some(q=>SCHEDIT.same(q,p.p));
    if(a.free&&(n||nc))return;if(a.net&&n!==a.net)return;rows.push(`${p.num}${p.name?' '+p.name:''} → ${n||(nc?'NC':'(미연결)')}${units.length>1?` · ${u.page+1}쪽`:''}`);}));
  const s=units[0].s;return`${s.ref} ${s.val||''} · 핀 ${rows.length}개${a.free?' (미연결)':''}\n`+(rows.length?rows.join('; '):'없음');}
function scNetList(q){const nl=scNets();const cnt=new Map();nl.forEach(n=>cnt.set(n,(cnt.get(n)||0)+1));const qq=(q||'').toLowerCase();
  const list=[...cnt.entries()].filter(([n])=>!qq||n.toLowerCase().includes(qq)).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],undefined,{numeric:true}));
  return list.length?list.slice(0,100).map(([n,k])=>`${n}(${k})`).join(' · ')+(list.length>100?` … 외 ${list.length-100}개`:''):'해당 넷이 없습니다.';}
function scNetPins(n){const nl=scNets();const pins=[];nl.forEach((v,k)=>{if(v===n)pins.push(k);});if(!pins.length)throw new Error(`넷 ${n}에 연결된 핀이 없습니다.`);
  return`${n} · 핀 ${pins.length}개: `+pins.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join(', ')+(BD.nets[n]?'':' · 보드에 없는 새 넷');}
function scFind(x){
  const sheets=scSheets();const sy=[];sheets.forEach((sh,pi)=>sh.symbols.forEach(s=>{if(!s.power&&s.ref.toLowerCase()===x.toLowerCase())sy.push({pi,s});}));
  if(sy.length){scFocus(sy[0].pi,SCHEDIT.anchor(sy[0].s));SE.sel={type:'sym',o:sy[0].s};drawSch();return`${sy[0].s.ref}: ${sy.map(u=>u.pi+1+'쪽').join(', ')}`;}
  const hits=[];sheets.forEach((sh,pi)=>{sh.labels.forEach(l=>{if(l.s===x)hits.push({pi,p:l.p});});sh.symbols.forEach(s=>{if(s.power&&s.val===x)hits.push({pi,p:s.pins[0].p});});});
  if(!hits.length)throw new Error(`${x}을(를) 찾지 못했습니다.`);scFocus(hits[0].pi,hits[0].p);return`${x}: ${[...new Set(hits.map(h=>h.pi+1))].map(p=>p+'쪽').join(', ')} (라벨·전원 ${hits.length}곳)`;}
function scAdd(a){
  const type=String(a._[0]||'').toUpperCase();const L=SCHEDIT.LIB.find(x=>x.id===type);if(!L)throw new Error(`부품 종류: ${SCHEDIT.LIB.map(x=>x.id).join(', ')}`);
  const nets=a.pins?String(a.pins).split(/[,\s]+/).filter(Boolean):[];if(nets.length>2)throw new Error('2핀 부품이라 넷은 두 개까지입니다.');
  const sheets=scSheets();const ref=a.ref?String(a.ref):SCHEDIT.nextRef(sheets,L.prefix,BD);if(sheets.some(sh=>sh.symbols.some(s=>s.ref===ref))||BD.byRef[ref])throw new Error(`${ref}는 이미 있습니다.`);
  // page and spot: next to --near (its pin on the first net if any), else where the net already is, else the current page
  let page=a.page!=null?Math.round(scNum(a.page))-1:-1,target=null;
  if(a.near){const u=scSyms(a.near);const nl=scNets();let hit=null;for(const v of u){for(const p of v.s.pins){if(nets.length&&nets.includes(nl.get(v.s.ref+'.'+p.num))&&!scIsGnd(nl.get(v.s.ref+'.'+p.num))){hit={v,p};break;}}if(hit)break;}
    const v=hit?hit.v:u[0];if(page<0)page=v.page;const[ux,uy]=hit?scDir(hit.p):[1,0];target=hit?[hit.p.p[0]+ux*12.7,hit.p.p[1]+uy*12.7]:[v.s.bb[2]+10,(v.s.bb[1]+v.s.bb[3])/2];}
  if(page<0&&nets.length){const sig=nets.find(n=>!scIsGnd(n))||nets[0];sheets.some((sh,pi)=>{const l=sh.labels.find(x=>x.s===sig)||sh.symbols.find(x=>x.power&&x.val===sig);if(l){page=pi;target=l.p?l.p.slice():l.pins[0].p.slice();target[1]+=10;return true;}return false;});}
  if(page<0)page=SV.page;if(page<0||page>=sheets.length)throw new Error(`페이지는 1–${sheets.length}`);
  const sh=sheets[page];if(a.at){const xy=a._.slice(-2);target=[scNum(a.at),scNum(xy[xy.length-1])];}
  if(!target)target=[sh.w/2,sh.h/2];
  // decoupling / bulk caps (supply + ground) stand upright with the supply on top, as drawn by hand
  const decap=nets.length===2&&scIsGnd(nets[1])&&!scIsGnd(nets[0])&&!a.horiz;
  return scBatch(()=>{const s=SCHEDIT.newPart(type,ref,target,!!a.vert||decap);
    if(decap){const ps=s.pins.slice().sort((x,y)=>String(x.num).localeCompare(String(y.num),undefined,{numeric:true}));if(ps[0].p[1]>ps[1].p[1])SCHEDIT.mirror(s,'y');}if(a._[1])s.val=String(a._[1]);if(a.fp)s.fp=String(a.fp);s.texts.forEach(t=>{if(t.role==='Value')t.s=s.val;});
    const placed=a.at?true:scFree(sh,s,target,nets);sh.symbols.push(s);
    // pin order as drawn: two-pin symbols keep pin 1 / pin 2 in s.pins
    const pins=s.pins.slice().sort((x,y)=>String(x.num).localeCompare(String(y.num),undefined,{numeric:true}));nets.forEach((n,i)=>{if(n&&n!=='-')scAttach(sh,pins[i],n);});
    SCHEDIT.cleanWires(sh);SV.page=page;SE.sel={type:'sym',o:s};
    return`${ref} ${s.val} (${s.fp}) 추가 · ${page+1}쪽 (${s.x.toFixed(1)}, ${s.y.toFixed(1)})${nets.length?` · 핀 ${nets.map((n,i)=>`${pins[i].num}→${n}`).join(', ')}`:''}${placed?'':' · 빈 자리를 못 찾아 겹칠 수 있음'}\n보드에도 넣으려면 apply`;});}
function scConnect(spec,net){if(!net)throw new Error('connect <부품.핀> <넷>');const h=scPin(spec);const nl=scNets();const cur=nl.get(h.s.ref+'.'+h.pin.num);
  if(cur===net)return`${h.s.ref}.${h.pin.num}은(는) 이미 ${net}입니다.`;
  if(cur&&!/^Net-\(/.test(cur)){const g=h.pin.g;if(g&&(g.pins.length>1||g.names.size))throw new Error(`${h.s.ref}.${h.pin.num}은(는) 이미 ${cur}에 연결돼 있습니다. 먼저 disconnect ${spec}`);}
  return scBatch(()=>{const sh=scSheets()[h.page];const pin=sh.symbols.find(s=>s.ref===h.s.ref&&s.pins.some(p=>SCHEDIT.same(p.p,h.pin.p))).pins.find(p=>SCHEDIT.same(p.p,h.pin.p));
    sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,pin.p));scAttach(sh,pin,net);SCHEDIT.cleanWires(sh);return`${h.s.ref}.${h.pin.num}${h.pin.name?' ('+h.pin.name+')':''} → ${net} · ${h.page+1}쪽`;});}
function scDisconnect(spec){const h=scPin(spec);
  return scBatch(()=>{const sh=scSheets()[h.page];const p0=h.pin.p;let n=0;const ends=[];
    sh.wires=sh.wires.filter(w=>{if(SCHEDIT.same(w.a,p0)){ends.push(w.b);n++;return false;}if(SCHEDIT.same(w.b,p0)){ends.push(w.a);n++;return false;}return true;});
    const lone=p=>!sh.wires.some(w=>SCHEDIT.same(w.a,p)||SCHEDIT.same(w.b,p)||SCHEDIT.onSeg(p,w.a,w.b))&&!sh.symbols.some(s=>!s.power&&s.pins.some(q=>SCHEDIT.same(q.p,p)));
    [p0,...ends].forEach(p=>{if(p!==p0&&!lone(p))return;const kl=sh.labels.filter(l=>SCHEDIT.same(l.p,p));kl.forEach(l=>{sh.labels.splice(sh.labels.indexOf(l),1);n++;});
      const kp=sh.symbols.filter(s=>s.power&&SCHEDIT.same(s.pins[0].p,p));kp.forEach(s=>{sh.symbols.splice(sh.symbols.indexOf(s),1);n++;});});
    sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,p0));SCHEDIT.cleanWires(sh);
    if(!n)return`${spec}에 직접 붙은 배선·라벨이 없습니다.`;return`${h.s.ref}.${h.pin.num}에서 ${n}개 항목을 뗐습니다.`;});}
function scProp(kind,ref,v){if(!v)throw new Error(`${kind} <부품> <값>`);const units=scSyms(ref);
  if(kind==='rename'&&(scSheets().some(sh=>sh.symbols.some(s=>s.ref===v))||BD.byRef[v]))throw new Error(`${v}는 이미 있습니다.`);
  if(kind==='fp'&&!PCB.FP[v])throw new Error(`알 수 없는 풋프린트: ${v} (예: ${Object.keys(PCB.FP).slice(0,12).join(', ')} …)`);
  return scBatch(()=>{const sheets=scSheets();units.forEach(u=>{const s=sheets[u.page].symbols[u.sh.symbols.indexOf(u.s)];
      if(kind==='value'){s.val=v;s.texts.forEach(t=>{if(t.role==='Value')t.s=v;});}else if(kind==='fp')s.fp=v;else{s.texts.forEach(t=>{if(t.role==='Reference'&&t.s===s.ref)t.s=v;});s.ref=v;}});
    return`${ref} ${kind==='value'?'값':kind==='fp'?'풋프린트':'참조'} → ${v}${kind==='rename'&&BD.byRef[ref]?' · 보드 부품과의 연결이 끊어집니다':''}`;});}
function scXform(kind,a){const units=scSyms(a._[0]);const u=units[0];
  return scBatch(()=>{const sh=scSheets()[u.page];const s=sh.symbols[u.sh.symbols.indexOf(u.s)];
    if(kind==='move'){const x=scNum(a._[1]),y=scNum(a._[2]);const an=SCHEDIT.anchor(s);SCHEDIT.drag(sh,s,SCHEDIT.snap(x)-an[0],SCHEDIT.snap(y)-an[1]);}
    else if(kind==='rotate')SCHEDIT.rotateKeep(sh,s);else if(kind==='mirror')SCHEDIT.mirrorKeep(sh,s,a._[1]==='y'?'y':'x');
    else{units.forEach(v=>{const S2=scSheets()[v.page];SCHEDIT.remove(S2,S2.symbols[v.sh.symbols.indexOf(v.s)]);});return`${s.ref} 삭제 (붙어 있던 배선은 남음 · erc로 확인)`;}
    SCHEDIT.cleanWires(sh);SE.sel={type:'sym',o:s};const an=SCHEDIT.anchor(s);return`${s.ref} · ${u.page+1}쪽 (${an[0].toFixed(1)}, ${an[1].toFixed(1)})${kind==='rotate'?` · ${s.rot||0}°`:''}`;});}
function scErc(){const e=SCHEDIT.erc(scSheets());SE.erc=e;seStat();drawSch();if(!e.length)return'ERC 문제 없음';const by={};e.forEach(x=>{by[x.code]=(by[x.code]||0)+1;});
  return`ERC ${e.length}건 (${Object.entries(by).map(([k,n])=>({dangling:'떠 있는 배선',unconnected:'미연결 핀',label:'핀 없는 라벨'}[k]||k)+' '+n).join(' · ')})\n`+e.slice(0,40).map(x=>`  ${x.page+1}쪽 ${x.msg}`).join('\n')+(e.length>40?'\n  …':'');}
function scDiff(){const res=SCHEDIT.annotate(scSheets(),BD);const ch=res.changes;if(!ch.length)return'보드와 회로도가 같습니다.';
  const row=c=>c.kind==='net'?`  ${c.ref}.${c.pin} ${c.from||'(없음)'} → ${c.to||'(없음)'}`:c.kind==='value'?`  ${c.ref} 값 ${c.from} → ${c.to}`:`  ${c.ref} 새 부품 ${c.val} · ${c.fp||'풋프린트 없음'}`;
  return`보드와 다른 점 ${ch.length}건\n`+ch.slice(0,50).map(row).join('\n')+(ch.length>50?`\n  … 외 ${ch.length-50}건`:'')+(res.conflicts.length?`\n이름이 둘인 넷 ${res.conflicts.length}개: ${res.conflicts.slice(0,5).map(x=>x.join('/')).join(', ')}`:'');}
function scApply(){const res=SCHEDIT.annotate(scSheets(),BD);if(!res.changes.length)return'보드와 회로도가 같아 반영할 것이 없습니다.';const r=seApplyAnnotation(res);
  return`보드에 ${r.n}건 반영 (넷 ${r.nets} · 값 ${r.vals} · 새 부품 ${r.added.length}${r.added.length?': '+r.added.join(', ')+(r.out.length?` — ${r.out.join(', ')}은 보드 밖 오른쪽`:' — 보드 빈 자리'):''}). 배선은 PCB 편집의 래츠네스트·route로 이어 주세요.`;}
function scRegen(){return scBatch(()=>{const d=SCH.build(BD,null);BD.schSheets=d.sheets;SV.page=0;SV.fitted=-1;return`보드 넷리스트로 회로도를 다시 만들었습니다 (${d.sheets.length}쪽). undo로 되돌릴 수 있습니다.`;});}
async function scRun(line){
  const t=cliTok(line);if(!t.length)return'';const cmd=t[0].toLowerCase();const a=cliArgs(t.slice(1));
  switch(cmd){
    case'help':case'?':{if(a._[0]){const h=SCLI_HELP.filter(x=>x[0].split(/[\s·]/).some(w=>w===a._[0]));return h.length?h.map(x=>`${x[0]}\n  ${x[1]}`).join('\n'):`${a._[0]}: 없는 명령입니다.`;}
      return SCLI_HELP.map(x=>`${x[0]}\n  ${x[1]}`).join('\n')+'\n\n` 로 열고 닫기 · ↑↓ 이전 명령 · Tab 자동 완성. 모든 변경은 Ctrl+Z(회로도 실행 취소)로 되돌립니다.';}
    case'status':return scStatus();
    case'pages':return scSheets().map((sh,i)=>`${i+1}. ${sh.name||sh.title||'페이지'} · 부품 ${new Set(sh.symbols.filter(s=>!s.power).map(s=>s.ref)).size}개 · ${sh.paper||''}`).join('\n');
    case'page':{const n=Math.round(scNum(a._[0]))-1;if(n<0||n>=scSheets().length)throw new Error(`페이지는 1–${scSheets().length}`);SV.page=n;renderSchOv();schFit();drawSch();return`${n+1}쪽`;}
    case'parts':return scParts(a._.join(' '));
    case'pins':return scPins(a);
    case'nets':return scNetList(a._.join(' '));
    case'net':return scNetPins(a._[0]);
    case'find':return scFind(a._[0]||'');
    case'add':return scAdd(a);
    case'connect':return scConnect(a._[0],a._[1]);
    case'disconnect':return scDisconnect(a._[0]);
    case'nc':{const h=scPin(a._[0]);return scBatch(()=>{SCHEDIT.addNoConnect(scSheets()[h.page],h.pin.p);return`${h.s.ref}.${h.pin.num} NC`;});}
    case'value':case'fp':case'rename':return scProp(cmd,a._[0],a._[1]);
    case'move':case'rotate':case'mirror':case'delete':return scXform(cmd,a);
    case'erc':return scErc();
    case'diff':return scDiff();
    case'apply':return scApply();
    case'regen':return scRegen();
    case'export':await seExport();return'.kicad_sch zip을 내려받습니다.';
    case'undo':if(!SE.undo.length)return'되돌릴 것이 없습니다.';seAction('undo');renderSchOv();return'실행 취소했습니다.';
    case'redo':if(!SE.redo.length)return'다시 실행할 것이 없습니다.';seAction('redo');renderSchOv();return'다시 실행했습니다.';
    case'clear':{const L=$('#scLog');if(L)L.innerHTML='';SCLI.log=[];return'';}
    case'history':return SCLI.hist.slice(-20).join('\n');
    case'ai':return await scAI(t.slice(1).join(' '));
    default:throw new Error(`알 수 없는 명령: ${cmd}`);
  }
}
// sentences → commands when Claude is not available
function scNL(t){const s=t.toLowerCase();const out=[];
  if(/다시\s*(만들|생성)|재생성|regen|처음부터/.test(s))out.push('regen');
  if(/erc|규칙|검사|오류/.test(s))out.push('erc');
  if(/다른\s*점|차이|diff/.test(s))out.push('diff');
  if(/반영|적용|apply|보드에/.test(s))out.push('apply');
  if(/상태|status|요약/.test(s))out.push('status');
  const m=t.match(/\b([A-Z]{1,3}\d+)\b/);if(m&&/핀|pin/.test(s))out.push(`pins ${m[1]}${/미연결|빈|free/.test(s)?' --free':''}`);
  return out;}
async function scExec(line){
  if(!BD)return;scPanel();scSay('cmd',line);scBusy(true);
  try{const first=(cliTok(line)[0]||'').toLowerCase();
    if(SCLI_CMDS.has(first)){const o=await scRun(line);if(o)scSay('ok',o);}
    else{await cliAiProbe();if(CLI.sample)await scAI(line);
      else{const cmds=scNL(line);if(!cmds.length)scSay('err','명령을 알아듣지 못했습니다. help로 목록을 보세요. (문장 해석은 Claude가 필요합니다)');else{scSay('out','해석: '+cmds.join(' → '));for(const c of cmds){scSay('cmd',c);const o=await scRun(c);if(o)scSay('ok',o);}}}}
  }catch(e){console.error(e);scSay('err',e&&e.message?e.message:String(e));}
  scBusy(false);
}
/* ---- Claude drives the schematic console ---- */
function scBrief(){
  const sh=scSheets();const nl=scNets();const parts=new Map();sh.forEach((x,pi)=>x.symbols.forEach(s=>{if(s.power)return;const o=parts.get(s.ref)||{s,pages:new Set(),pins:0,used:0};o.pages.add(pi+1);o.pins+=s.pins.length;o.used+=s.pins.filter(p=>nl.get(s.ref+'.'+p.num)).length;parts.set(s.ref,o);}));
  const cnt=new Map();nl.forEach(n=>cnt.set(n,(cnt.get(n)||0)+1));
  return scStatus()+`\n페이지: ${sh.map((x,i)=>`${i+1} ${x.name||''}`).join(' | ')}\n부품: `+[...parts.values()].slice(0,150).map(o=>`${o.s.ref} ${o.s.val||''} ${o.s.fp||''} (핀 ${o.pins}, 연결 ${o.used}, ${[...o.pages].join('/')}쪽)`).join('; ')+
    `\n넷: `+[...cnt.entries()].sort((a,b)=>b[1]-a[1]).slice(0,120).map(([n,k])=>`${n}(${k})`).join(' ');}
const SC_SYS=`You are a schematic-editing assistant embedded in a PCB/schematic viewer (KiCad-like). The user writes in Korean. You change the schematic only by calling the run_sch tool with one command at a time.
Commands (exactly this syntax):
\${CMDS}
Notes: two-pin parts are R, C, CP (electrolytic), L, FB (ferrite bead), D, LED; "add ... --pins A,B" connects pin 1 to A and pin 2 to B (for D/LED pin 1 is K, pin 2 is A). Power and ground nets get power symbols automatically. Inspect before you edit: use "pins <ref> --free" or "net <name>" to learn real pin numbers and net names; never guess them. Typical decoupling: one 100nF C per supply pin of an IC, "add C 100nF --pins <supply>,GND --near <IC>". Use at most 8 commands. Finish with "erc" when you added or rewired something, and run "apply" only if the user asked to update the board. Then answer in Korean in 2-5 short sentences: what changed (refs, nets), ERC result, and a next step. Do not invent numbers.`;
async function scAI(req){
  if(!req.trim())return'요청을 적어 주세요. 예: ai U4 전원 핀에 100nF 디커플링 캡을 달아줘';
  await cliAiProbe();
  if(!CLI.sample){const cmds=scNL(req);if(!cmds.length)return'Claude를 쓸 수 없고 문장도 해석하지 못했습니다. help를 보세요.';scSay('out','Claude를 쓸 수 없어 규칙으로 해석: '+cmds.join(' → '));for(const c of cmds){scSay('cmd',c);const o=await scRun(c);if(o)scSay('ok',o);}return'';}
  const cmds=SCLI_HELP.filter(x=>!/^ai /.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const prompt=SC_SYS.replace('${CMDS}',cmds)+`\n\n현재 회로도:\n${scBrief()}\n\n사용자 요청: ${req}`;
  const ans=scSay('ai','Claude가 생각하는 중…');SCLI.abort=new AbortController();
  const runOne=async c=>{const first=(cliTok(c)[0]||'').toLowerCase();if(!SCLI_CMDS.has(first)||first==='ai'||first==='regen'&&!/regen|다시|처음|재생성/i.test(req))throw new Error('not allowed: '+first);
    scSay('cmd',c+'   (Claude)');try{const o=await scRun(c);if(o)scSay('ok',o);return String(o||'done').slice(0,3500);}catch(e){scSay('err',e.message||String(e));throw e;}};
  try{
    if(CLI.tools!==false){let n=0;
      const tool={name:'run_sch',description:'Run one schematic console command (see the command list) and return its text output.',
        inputSchema:{type:'object',properties:{command:{type:'string',description:'One command line, e.g. "pins U4 --free" or "add C 100nF --pins +3V3,GND --near U4"'}},required:['command']},
        execute:async(inp,ctx)=>{const c=String(inp&&inp.command||'').trim();if(!c)throw new Error('empty command');if(++n>10)throw new Error('command limit reached');if(ctx&&ctx.signal&&ctx.signal.aborted)throw new Error('stopped');return runOne(c);}};
      const r=await CLI.sample(prompt,{tools:[tool],signal:SCLI.abort.signal,onText:({text})=>scSet(ans,text)});
      if(n){const el=$('#scLog')&&$('#scLog').querySelector(`[data-id="${ans.id}"]`);if(el)el.remove();SCLI.log=SCLI.log.filter(e=>e!==ans);scSay('ai',r.text||'(응답 없음)');}else scSet(ans,r.text||'(응답 없음)');
    }else{
      const plan=await CLI.sample.json(prompt+`\n\nReturn ONLY JSON: {"commands":["..."],"note":"Korean one-line plan"}`,{signal:SCLI.abort.signal,cache:false});
      const list=(plan&&Array.isArray(plan.commands)?plan.commands:[]).slice(0,8).map(String);scSet(ans,(plan&&plan.note?plan.note+'\n':'')+'실행: '+list.join(' → '));
      for(const c of list){try{await runOne(c);}catch(e){}if(SCLI.stopReq)break;}
    }
  }catch(e){
    if(e&&e.code==='cancelled')scSet(ans,(e.text||'')+'\n(중지됨)');
    else if(e&&/^(not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed)$/.test(e.code||'')){CLI.sample=null;scAiBadge();cliAiProbe();scSet(ans,'Claude 사용이 허용되지 않아 규칙으로 해석합니다.');for(const c of scNL(req)){scSay('cmd',c);const o=await scRun(c);if(o)scSay('ok',o);}}
    else if(e&&e.code==='tools_unavailable'){CLI.tools=false;scSet(ans,'이 화면에서는 Claude 도구 호출을 쓸 수 없어 계획만 받아 실행합니다. 다시 실행해 주세요.');}
    else if(e&&e.code==='rate_limited')scSet(ans,'Claude 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요. (명령은 그대로 쓸 수 있습니다)');
    else scSet(ans,(e&&e.text?e.text+'\n':'')+'Claude 호출 실패: '+(e&&(e.message||e.code)||e));
  }
  return'';
}
// ` toggles the schematic console while the schematic fills the view
document.addEventListener('keydown',e=>{if(e.key!=='`'||e.ctrlKey||e.metaKey||e.altKey)return;if(e.target.matches('input,select,textarea'))return;if(!BD||S.sch==='off'||S.view!=='sch')return;e.preventDefault();e.stopImmediatePropagation();scToggle();},true);
