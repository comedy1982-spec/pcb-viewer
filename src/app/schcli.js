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
  ['add <R|C|CP|L|FB|D|LED|TVS|Z|F|TP> [값] [--pins 넷1,넷2 | U1.12,GND] [--near 부품] [--page n] [--at x y] [--vert|--horiz] [--ref R9] [--fp 0603]','부품 추가. --pins면 핀 1·2에 넷 라벨(전원은 전원 심볼)을 붙여 연결. 전원,GND 캡은 세로로 세움. 위치를 안 주면 --near 부품 옆 빈 자리'],
  ['connect <부품.핀> <넷>','핀 끝에 짧은 배선과 넷 라벨(전원·GND는 전원 심볼)을 붙여 연결. 핀은 번호나 이름(U1.23, U1.VEXT)'],
  ['disconnect <부품.핀>','핀에 붙은 배선·라벨·전원 심볼 떼기'],
  ['nc <부품.핀>','미연결(NC) 표시'],
  ['value <부품> <값> · fp <부품> <풋프린트> · rename <부품> <새 참조>','속성 변경'],
  ['hsis [검색어] [--cat power,analog,comm,…] [--port P02*] [--notp]','HSIS 신호 목록 (분류 · MCU 핀 · 회로도 넷 · 테스트 포인트 유무)'],
  ['tp [--cat power,analog,…] [--port P02*] [--nets A,B] [--fp TP-1.5|TP-1.0|TP-TH] [--max n]','테스트 포인트 일괄 추가 — 기본은 HSIS의 모든 신호 넷, 이미 TP가 있는 넷은 건너뜀'],
  ['tie <부품> [--free | --pins 3,4,PA3] [--net GND] [--val 10kΩ] [--type R|C] [--direct] [--max n]','미연결(NC) 핀을 저항/커패시터로(또는 직접) 넷에 묶기'],
  ['insert <R|L|FB|F|D> [값] --at <부품.핀> [--name 새넷]','핀의 넷에 직렬 부품 삽입 (전원선 페라이트 비드·퓨즈·직렬 저항)'],
  ['replace <부품> [<MPN|설명>]','부품 교체 (대화형) — 승인 목록→내장 DB→Claude 추정→부품 API 순으로 찾고 핀 대응을 확인한 뒤 회로도·보드·BOM·HSIS에 반영. 예: replace U3 AP2112K-3.3'],
  ['move <부품> <x> <y> · rotate <부품> · mirror <부품> [x|y] · delete <부품>','부품 옮기기(배선 유지)·회전·반전·삭제'],
  ['erc','전기 규칙 검사 목록'],
  ['diff · apply','보드와 다른 점 보기 · 보드에 반영 (F8과 같음, 새 부품은 보드 빈 자리에)'],
  ['regen','보드 넷리스트로 회로도를 처음부터 다시 생성 (편집 내용 버림)'],
  ['export','KiCad 회로도(.kicad_sch) zip 저장'],
  ['undo · redo · clear','실행 취소 · 다시 실행 · 화면 지우기'],
  GUIDE_HELP,
  ['ai <요청>','Claude가 위 명령을 골라 실행. 헤더에서 결정론/AI를 고르면 문장·버튼이 그 방식으로 실행되고, AI 실행마다 모델 등급과 토큰(추정)을 표시']];
const SC_CHIPS=[['상태','status','회로도 상태를 요약하고 먼저 손볼 곳을 알려줘'],['ERC','erc','ERC 문제를 찾아 원인을 설명하고, 확실한 것은 고쳐줘'],
  ['가이드라인 점검','guide check','회로 설계 가이드라인을 점검하고 빠진 디커플링·보호 소자·부하 캡을 추가하는 명령을 제안해줘 (내가 승인하기 전엔 수정하지 말 것)'],
  ['보드와 다른 점','diff','회로도와 보드가 어떻게 다른지 설명해줘'],['보드에 반영','apply','ERC를 확인한 뒤 문제가 없으면 회로도를 보드에 반영해줘'],['도움말','help','이 콘솔로 할 수 있는 일을 짧게 알려줘']];
const SCLI_CMDS=new Set(['guide','help','?','status','pages','page','parts','pins','nets','net','find','add','replace','tp','tie','insert','hsis','connect','disconnect','nc','value','fp','rename','move','rotate','mirror','delete','erc','diff','apply','regen','export','undo','redo','clear','ai','history']);

/* ---- panel ---- */
function scSay(k,t){const e={k,t,id:++SCLI.seq};SCLI.log.push(e);if(SCLI.log.length>400)SCLI.log.shift();scPaint(e);return e;}
function scSet(e,t){e.t=t;scPaint(e,true);}
function scPaint(e,upd){copPaint('sch',e,upd);}
function scPanel(){return copEnsure();}

function scToggle(on){if(on===false)return;copFocus('sch');}
function scBusy(b){SCLI.busy=b;copBusyPaint();const r=$('#scRun'),s=$('#scStop'),i=$('#scIn');if(r)r.disabled=b;if(s)s.hidden=!b;if(i)i.disabled=b;if(!b){SCLI.stopReq=false;SCLI.abort=null;setTimeout(()=>i&&SCLI.open&&i.focus(),10);}}

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
function scParts(q){if(/^lib/i.test(q||'')){if(typeof openPartLib==='function')openPartLib();return'부품 라이브러리 창을 열었습니다.';}const nl=scNets();const rows=[];const seen=new Set();scSheets().forEach((sh,pi)=>sh.symbols.forEach(s=>{if(s.power||seen.has(s.ref+'@'+pi))return;seen.add(s.ref+'@'+pi);
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
/* a "--pins" token may be a net name or a part pin (U1.12 / U1.PA3): a pin that already has a net gives that net; a free pin gets
   a new net named after its function (or REF_PIN) and is attached to it along with the new part */
function scPinTok(tok){if(!/^[A-Za-z]{1,4}\d+[A-Za-z]?[.:][A-Za-z0-9_+\-]+$/.test(tok))return null;try{return scPin(tok);}catch(e){return null;}}
function scNetFor(tok,nl,attach){const h=scPinTok(tok);if(!h)return tok;const cur=nl.get(h.s.ref+'.'+h.pin.num);if(cur)return cur;
  const base=(h.pin.name||`${h.s.ref}_${h.pin.num}`).replace(/[^A-Za-z0-9_+\-]/g,'_');let net=base,k=2;const used=new Set(nl.values());while(used.has(net))net=`${base}_${k++}`;attach.push({h,net});return net;}
function scAttachPins(sheets,attach){attach.forEach(({h,net})=>{const sh=sheets[h.page];sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,h.pin.p));scAttach(sh,h.pin,net);});}
/* add one part (inside a batch); returns {s,page,nets,msg} */
function scAddOne(a){
  const type=String(a._[0]||'').toUpperCase();const L=SCHEDIT.LIB.find(x=>x.id===type);if(!L)throw new Error(`부품 종류: ${SCHEDIT.LIB.map(x=>x.id).join(', ')}`);
  const sheets=scSheets();const nl=scNets();const attach=[];
  const nets=(a.pins?String(a.pins).split(/[,\s]+/).filter(Boolean):[]).map(t=>scNetFor(t,nl,attach));if(nets.length>L.pins.length)throw new Error(`${L.label}은(는) ${L.pins.length}핀이라 넷은 ${L.pins.length}개까지입니다.`);
  const ref=a.ref?String(a.ref):SCHEDIT.nextRef(sheets,L.prefix,BD);if(sheets.some(sh=>sh.symbols.some(s=>s.ref===ref))||BD.byRef[ref])throw new Error(`${ref}는 이미 있습니다.`);
  // page and spot: next to --near (its pin on the first net if any), else where the net already is, else the current page
  let page=a.page!=null?Math.round(scNum(a.page))-1:-1,target=null;
  if(a.near){const u=scSyms(a.near);let hit=null;for(const v of u){for(const p of v.s.pins){if(nets.length&&nets.includes(nl.get(v.s.ref+'.'+p.num))&&!scIsGnd(nl.get(v.s.ref+'.'+p.num))){hit={v,p};break;}}if(hit)break;}
    const v=hit?hit.v:u[0];if(page<0)page=v.page;const[ux,uy]=hit?scDir(hit.p):[1,0];target=hit?[hit.p.p[0]+ux*12.7,hit.p.p[1]+uy*12.7]:[v.s.bb[2]+10,(v.s.bb[1]+v.s.bb[3])/2];}
  if(!target&&attach.length){const h=attach[0].h;if(page<0)page=h.page;const[ux,uy]=scDir(h.pin);target=[h.pin.p[0]+ux*10.16,h.pin.p[1]+uy*10.16];}
  if(page<0&&nets.length){const sig=nets.find(n=>!scIsGnd(n))||nets[0];sheets.some((sh,pi)=>{const l=sh.labels.find(x=>x.s===sig)||sh.symbols.find(x=>x.power&&x.val===sig);if(l){page=pi;target=l.p?l.p.slice():l.pins[0].p.slice();target[1]+=10;return true;}return false;});}
  if(page<0)page=SV.page;if(page<0||page>=sheets.length)throw new Error(`페이지는 1–${sheets.length}`);
  const sh=sheets[page];if(a.at){const xy=a._.slice(-2);target=[scNum(a.at),scNum(xy[xy.length-1])];}
  if(!target)target=[sh.w/2,sh.h/2];
  // decoupling / bulk caps (supply + ground) stand upright with the supply on top, as drawn by hand
  const decap=nets.length===2&&scIsGnd(nets[1])&&!scIsGnd(nets[0])&&!a.horiz;
  const s=SCHEDIT.newPart(type,ref,target,!!a.vert||decap);
  if(decap&&s.pins.length===2){const ps=s.pins.slice().sort((x,y)=>String(x.num).localeCompare(String(y.num),undefined,{numeric:true}));if(ps[0].p[1]>ps[1].p[1])SCHEDIT.mirror(s,'y');}
  if(a._[1]&&!(a.at&&/^[\d.-]+$/.test(String(a._[1]))))s.val=String(a._[1]);if(a.val)s.val=String(a.val);if(a.fp){if(!PCB.FP[a.fp])throw new Error(`알 수 없는 풋프린트: ${a.fp}`);s.fp=String(a.fp);}s.texts.forEach(t=>{if(t.role==='Value')t.s=s.val;});
  const placed=a.at?true:scFree(sh,s,target,nets);sh.symbols.push(s);
  // pin order as drawn: two-pin symbols keep pin 1 / pin 2 in s.pins
  const pins=s.pins.slice().sort((x,y)=>String(x.num).localeCompare(String(y.num),undefined,{numeric:true}));nets.forEach((n,i)=>{if(n&&n!=='-')scAttach(sh,pins[i],n);});
  scAttachPins(sheets,attach);SCHEDIT.cleanWires(sh);
  return{s,page,nets,placed,attach,msg:`${ref} ${s.val} (${s.fp}) 추가 · ${page+1}쪽 (${s.x.toFixed(1)}, ${s.y.toFixed(1)})${nets.length?` · 핀 ${nets.map((n,i)=>`${pins[i].num}→${n}`).join(', ')}`:''}${attach.length?` · ${attach.map(x=>`${x.h.s.ref}.${x.h.pin.num}→${x.net}`).join(', ')} 연결`:''}${placed?'':' · 빈 자리를 못 찾아 겹칠 수 있음'}`};}
function scAdd(a){return scBatch(()=>{const r=scAddOne(a);SV.page=r.page;SE.sel={type:'sym',o:r.s};return r.msg+'\n보드에도 넣으려면 apply';});}
/* ---- bulk helpers used by tp / tie / insert and by Claude ---- */
function scTpOnNet(net){const nl=scNets();let hit=null;scSheets().forEach(sh=>sh.symbols.forEach(s=>{if(!s.power&&/^TP\d/i.test(s.ref)&&s.pins.some(p=>nl.get(s.ref+'.'+p.num)===net))hit=s.ref;}));return hit;}
function scHsisItems(){if(typeof HS==='undefined'||!HS.H||!Array.isArray(HS.H.items))return[];const mcu=HS.mcu&&BD.byRef[HS.mcu];
  return HS.H.items.map(it=>{const cat=typeof HSIS!=='undefined'?HSIS.category(it):(it.cat||'');const pins=String(it.pins||'').split(/[,\s/]+/).filter(Boolean);
    let net=it.net||'';if(!net&&mcu){for(const n of pins){const pd=mcu.pads.find(p=>String(p.n)===n);if(pd&&pd.net){net=pd.net;break;}}}
    return{id:it.id,signal:it.signal,cat,pins,port:it.port,func:it.func,dir:it.dir,net,tp:net?scTpOnNet(net):null};});}
const HSIS_CAT_ALIAS={power:'전원',전원:'전원',gnd:'접지',ground:'접지',접지:'접지',analog:'아날로그',아날로그:'아날로그',adc:'아날로그',comm:'통신',통신:'통신',bus:'통신',clk:'클럭',clock:'클럭',클럭:'클럭',reset:'리셋·부트',리셋:'리셋·부트',boot:'리셋·부트',out:'디지털 출력',output:'디지털 출력',출력:'디지털 출력',in:'디지털 입력',input:'디지털 입력',입력:'디지털 입력',digital:'디지털'};
function scCatFilter(spec){if(!spec)return null;const want=String(spec).split(/[,\s]+/).filter(Boolean).map(w=>HSIS_CAT_ALIAS[w.toLowerCase()]||w);return cat=>want.some(w=>cat===w||cat.startsWith(w));}
function scHsisCmd(a){const items=scHsisItems();if(!items.length)return'HSIS가 없습니다. HSIS 작업 공간에서 표를 불러오거나 보드에서 초안을 만드세요 (hsis 탭 → 보드에서 만들기).';
  const cf=scCatFilter(a.cat);const q=(a._.join(' ')||'').toLowerCase();
  const rows=items.filter(it=>(!cf||cf(it.cat))&&(!q||[it.id,it.signal,it.port,it.func,it.net].join(' ').toLowerCase().includes(q))&&(!a.notp||!it.tp)&&(!a.port||String(it.port||'').toUpperCase().startsWith(String(a.port).toUpperCase().replace(/\*$/,''))));
  const cats=new Map();items.forEach(it=>cats.set(it.cat,(cats.get(it.cat)||0)+1));
  return`HSIS 신호 ${rows.length}/${items.length}개 (분류: ${[...cats.entries()].map(([k,v])=>`${k} ${v}`).join(', ')}) · TP 있음 ${items.filter(x=>x.tp).length}개\n`+rows.slice(0,120).map(it=>`${it.id} ${it.signal} [${it.cat}] 핀 ${it.pins.join('/')||'-'} ${it.port||''} ${it.func||''} → 넷 ${it.net||'(없음)'}${it.tp?' · '+it.tp:''}`).join('\n');}
/* tp: test points on HSIS signals (default), on given nets, or on every MCU net */
function scTp(a){const sheets=scSheets();const fp=a.fp?String(a.fp):'TP-1.5';if(!PCB.FP[fp])throw new Error(`풋프린트: TP-1.5 · TP-1.0 · TP-TH`);
  let targets=[];const skip=[];
  if(a.nets){targets=String(a.nets).split(/[,\s]+/).filter(Boolean).map(n=>({net:n,label:n}));}
  else{const items=scHsisItems();if(!items.length)throw new Error('HSIS가 없습니다. tp --nets <넷,…> 로 넷을 직접 주거나 HSIS를 먼저 불러오세요.');
    const cf=scCatFilter(a.cat);items.forEach(it=>{if(cf&&!cf(it.cat))return;if(a.port&&!String(it.port||'').toUpperCase().startsWith(String(a.port).toUpperCase().replace(/\*$/,'')))return;
      if(!it.net){skip.push(`${it.signal} (넷 없음)`);return;}if(targets.some(t=>t.net===it.net))return;targets.push({net:it.net,label:it.signal,cat:it.cat});});}
  const max=a.max?Math.round(scNum(a.max)):200;const nl=scNets();const allNets=new Set(nl.values());
  return scBatch(()=>{const done=[];let last=null;
    for(const t of targets){if(done.length>=max)break;if(scTpOnNet(t.net)){skip.push(`${t.net} (이미 ${scTpOnNet(t.net)})`);continue;}
      if(!allNets.has(t.net)){skip.push(`${t.net} (회로도에 없는 넷)`);continue;}
      const r=scAddOne({_:['TP',t.label||t.net],pins:t.net,fp,val:t.label&&t.label!==t.net?t.label:'TP'});done.push(`${r.s.ref}→${t.net}`);last=r;}
    if(last){SV.page=last.page;SE.sel={type:'sym',o:last.s};}
    if(typeof HS!=='undefined'&&HS.H&&typeof hsisRun==='function'){try{hsisRun();}catch(e){}}
    return`테스트 포인트 ${done.length}개 추가 (${fp})${done.length?': '+done.join(', '):''}${skip.length?`\n건너뜀 ${skip.length}: ${skip.slice(0,20).join(', ')}${skip.length>20?' …':''}`:''}\n보드에도 넣으려면 apply`;});}
/* tie: free (NC) pins of a part to a net, through a resistor (default) or directly */
function scTie(a){const ref=String(a._[0]||'');if(!ref)throw new Error('tie <부품> [--free | --pins 3,4,5] [--net GND] [--val 10kΩ] [--direct | --type R|C]');
  const units=scSyms(ref);const nl=scNets();const net=a.net?String(a.net):'GND';const type=a.direct?null:String(a.type||'R').toUpperCase();const val=a.val?String(a.val):type==='C'?'100nF':'10kΩ';
  const want=a.pins?String(a.pins).split(/[,\s]+/).filter(Boolean).map(x=>x.toLowerCase()):null;const pins=[];
  units.forEach(u=>u.s.pins.forEach(p=>{const n=nl.get(u.s.ref+'.'+p.num);const nc=u.sh.nocon.some(q=>SCHEDIT.same(q,p.p));
    if(want){if(want.includes(String(p.num).toLowerCase())||want.includes(String(p.name||'').toLowerCase()))pins.push({u,p,n});return;}
    if(!n&&(nc||!a.nconly)&&!/^(VDD|VSS|VCC|GND|VBAT|VREF|NC$|VEXT|VDDM|VSSM|VAREF|VAGND)/i.test(p.name||''))pins.push({u,p,n});}));
  if(!pins.length)return`${ref}: 묶을 핀이 없습니다 (--free = 넷이 없는 핀 전부, NC 표시 핀 포함).`;
  const max=a.max?Math.round(scNum(a.max)):200;
  return scBatch(()=>{const done=[];let last=null;
    for(const{u,p,n}of pins.slice(0,max)){const tok=`${u.s.ref}.${p.num}`;
      if(type){const r=scAddOne({_:[type,val],pins:`${tok},${net}`,fp:a.fp});done.push(`${r.s.ref} ${tok}${p.name?'('+p.name+')':''}→${net}`);last=r;}
      else{const sh=scSheets()[u.page];sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,p.p));scAttach(sh,p,net);SCHEDIT.cleanWires(sh);done.push(`${tok}→${net}`);}}
    if(last){SV.page=last.page;SE.sel={type:'sym',o:last.s};}
    return`${ref}: 핀 ${done.length}개를 ${type?`${type} ${val}로 `:'직접 '}${net}에 묶음: ${done.join(', ')}\n보드에도 넣으려면 apply`;});}
/* insert: a series part into a pin's net (filter bead / resistor / fuse in a supply or signal line) */
function scInsert(a){const type=String(a._[0]||'').toUpperCase();const L=SCHEDIT.LIB.find(x=>x.id===type);if(!L||L.pins.length!==2)throw new Error('insert <R|L|FB|F|D> [값] --at <부품.핀> [--name 새넷]');
  if(!a.at)throw new Error('--at <부품.핀> 이 필요합니다 (예: insert FB --at U2.3).');const h=scPin(String(a.at));const nl=scNets();const net=nl.get(h.s.ref+'.'+h.pin.num);if(!net)throw new Error(`${a.at}은(는) 연결된 넷이 없습니다. 직렬 삽입은 이미 연결된 핀에만 됩니다.`);
  const base=a.name?String(a.name):`${net}_${h.s.ref}`.replace(/[^A-Za-z0-9_+\-]/g,'_');let nn=base,k=2;const used=new Set(nl.values());while(used.has(nn))nn=`${base}_${k++}`;
  return scBatch(()=>{const sh=scSheets()[h.page];scDetach(sh,h.pin.p);scAttach(sh,h.pin,nn);SCHEDIT.cleanWires(sh);
    const r=scAddOne({_:[type,a._[1]||L.val],pins:`${net},${nn}`,near:h.s.ref,page:h.page+1,fp:a.fp,horiz:true});SV.page=r.page;SE.sel={type:'sym',o:r.s};
    return`${r.s.ref} ${r.s.val}을(를) ${net} → ${h.s.ref}.${h.pin.num} 사이에 직렬로 넣음 (핀 쪽 새 넷 ${nn}) · ${r.page+1}쪽\n보드에도 넣으려면 apply`;});}
function scConnect(spec,net){if(!net)throw new Error('connect <부품.핀> <넷>');const h=scPin(spec);const nl=scNets();const cur=nl.get(h.s.ref+'.'+h.pin.num);
  if(cur===net)return`${h.s.ref}.${h.pin.num}은(는) 이미 ${net}입니다.`;
  if(cur&&!/^Net-\(/.test(cur)){const g=h.pin.g;if(g&&(g.pins.length>1||g.names.size))throw new Error(`${h.s.ref}.${h.pin.num}은(는) 이미 ${cur}에 연결돼 있습니다. 먼저 disconnect ${spec}`);}
  return scBatch(()=>{const sh=scSheets()[h.page];const pin=sh.symbols.find(s=>s.ref===h.s.ref&&s.pins.some(p=>SCHEDIT.same(p.p,h.pin.p))).pins.find(p=>SCHEDIT.same(p.p,h.pin.p));
    sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,pin.p));scAttach(sh,pin,net);SCHEDIT.cleanWires(sh);return`${h.s.ref}.${h.pin.num}${h.pin.name?' ('+h.pin.name+')':''} → ${net} · ${h.page+1}쪽`;});}
/* take the wires, labels and power symbols off a pin end (p0) on a sheet; returns how many items went */
function scDetach(sh,p0){let n=0;const ends=[];
  sh.wires=sh.wires.filter(w=>{if(SCHEDIT.same(w.a,p0)){ends.push(w.b);n++;return false;}if(SCHEDIT.same(w.b,p0)){ends.push(w.a);n++;return false;}return true;});
  const lone=p=>!sh.wires.some(w=>SCHEDIT.same(w.a,p)||SCHEDIT.same(w.b,p)||SCHEDIT.onSeg(p,w.a,w.b))&&!sh.symbols.some(s=>!s.power&&s.pins.some(q=>SCHEDIT.same(q.p,p)));
  [p0,...ends].forEach(p=>{if(p!==p0&&!lone(p))return;const kl=sh.labels.filter(l=>SCHEDIT.same(l.p,p));kl.forEach(l=>{sh.labels.splice(sh.labels.indexOf(l),1);n++;});
    const kp=sh.symbols.filter(s=>s.power&&SCHEDIT.same(s.pins[0].p,p));kp.forEach(s=>{sh.symbols.splice(sh.symbols.indexOf(s),1);n++;});});
  sh.nocon=sh.nocon.filter(q=>!SCHEDIT.same(q,p0));return n;}
function scDisconnect(spec){const h=scPin(spec);
  return scBatch(()=>{const sh=scSheets()[h.page];const n=scDetach(sh,h.pin.p);SCHEDIT.cleanWires(sh);
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
async function scRun(line,by){
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
    case'replace':{if(typeof plReplaceFlow!=='function')throw new Error('부품 라이브러리 모듈이 없습니다.');await plReplaceFlow({ref:String(a._[0]||'').toUpperCase(),q:a._.slice(1).join(' ')},'sch');return'';}
    case'add':return scAdd(a);
    case'tp':return scTp(a);
    case'tie':return scTie(a);
    case'insert':return scInsert(a);
    case'hsis':return scHsisCmd(a);
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
    case'clear':{copClear('sch');SCLI.log=[];return'';}
    case'history':return SCLI.hist.slice(-20).join('\n');
    case'guide':{const r=guideRun(a,'sch',{by});if(typeof r==='string')return r;const useAI=by!=='ai'&&(a.ai||(AIM.mode==='ai'&&!a.det));const txt=guideText(r,useAI?'ai':'det');
      if(useAI){scSay('ok',txt);const ok=await scAgent(GUIDE_AI+`\n\n점검 결과:\n${txt}\n\n사용자 요청: 가이드라인 점검 결과를 검토해줘`,'agent');if(!ok)scSay('err','Claude를 쓸 수 없어 결정론 결과만 표시했습니다.');return'';}return txt;}
    case'ai':return await scAI(t.slice(1).join(' '));
    default:throw new Error(`알 수 없는 명령: ${cmd}`);
  }
}
// sentences → commands when Claude is not available
function scNL(t){const s=t.toLowerCase();const out=[];
  if(/다시\s*(만들|생성)|재생성|regen|처음부터/.test(s))out.push('regen');
  if(/erc|규칙|검사|오류/.test(s))out.push('erc');
  if(/다른\s*점|차이|diff/.test(s))out.push('diff');
  if(/테스트\s*포인트|test\s*point|\btp\b/.test(s)&&/추가|넣|달|add|붙/.test(s)){const cat=/전원|power|레일/.test(s)?'power':/아날로그|analog|adc/.test(s)?'analog':/통신|comm|can|uart|spi|i2c/.test(s)?'comm':'';out.push('tp'+(cat?' --cat '+cat:'')+(/hsis/i.test(s)?'':''));return out;}
  {const m2=t.match(/\b([A-Z]{1,3}\d+)\b/);if(m2&&/(nc|미연결|빈\s*핀|남는\s*핀|unused)/i.test(s)&&/(저항|풀다운|풀업|묶|tie|pull)/.test(s)){const net=/풀업|pull-?up|vdd|3v3|vcc/i.test(s)?'+3V3':'GND';const v=(s.match(/(\d+(?:\.\d+)?\s*[km]?)\s*(?:ω|ohm|옴)/i)||[])[1];out.push(`tie ${m2[1]} --free --net ${net}${v?' --val '+v.replace(/\s+/g,'')+'Ω':''}`);return out;}}
  if(/반영|적용|apply|보드에/.test(s))out.push('apply');
  if(/상태|status|요약/.test(s))out.push('status');
  const m=t.match(/\b([A-Z]{1,3}\d+)\b/);if(m&&/핀|pin/.test(s))out.push(`pins ${m[1]}${/미연결|빈|free/.test(s)?' --free':''}`);
  return out;}
async function scExec(line){
  if(!BD)return;scPanel();scSay('cmd',line);scBusy(true);
  try{const tk=cliTok(line);const first=(tk[0]||'').toLowerCase();const sentence=/[가-힣]/.test(tk[1]||'');
    if(SCLI_CMDS.has(first)&&!sentence){const o=await scRun(line);if(o)scSay('ok',o);}
    else if(typeof plIntent==='function'&&plIntent(line)){await plReplaceFlow(plIntent(line),'sch');}
    else{if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){await scAI(line);scBusy(false);return;}scSay('out','Claude를 쓸 수 없어 규칙으로 해석합니다.');}
      if(await aimDetQuestion(line,scSay,()=>scRun('status'))){scBusy(false);return;}
      {const cmds=scNL(line);if(!cmds.length)scSay('err','명령을 알아듣지 못했습니다. help로 목록을 보세요. (문장 해석은 Claude가 필요합니다)');else{scSay('out','해석: '+cmds.join(' → '));for(const c of cmds){scSay('cmd',c);const o=await scRun(c);if(o)scSay('ok',o);}}}}
  }catch(e){console.error(e);scSay('err',e&&e.message?e.message:String(e));}
  scBusy(false);
}
/* ---- Claude drives the schematic console ---- */
function scBrief(){
  const sh=scSheets();const nl=scNets();const parts=new Map();sh.forEach((x,pi)=>x.symbols.forEach(s=>{if(s.power)return;const o=parts.get(s.ref)||{s,pages:new Set(),pins:0,used:0};o.pages.add(pi+1);o.pins+=s.pins.length;o.used+=s.pins.filter(p=>nl.get(s.ref+'.'+p.num)).length;parts.set(s.ref,o);}));
  const cnt=new Map();nl.forEach(n=>cnt.set(n,(cnt.get(n)||0)+1));
  const hs=typeof scHsisItems==='function'?scHsisItems():[];const hsTxt=hs.length?`\nHSIS: ${hs.length}개 신호 (TP ${hs.filter(x=>x.tp).length}) — ${hs.slice(0,60).map(x=>`${x.signal}[${x.cat}]→${x.net||'?'}`).join(', ')}${hs.length>60?' …':''}`:'';
  return scStatus()+hsTxt+`\n페이지: ${sh.map((x,i)=>`${i+1} ${x.name||''}`).join(' | ')}\n부품: `+[...parts.values()].slice(0,150).map(o=>`${o.s.ref} ${o.s.val||''} ${o.s.fp||''} (핀 ${o.pins}, 연결 ${o.used}, ${[...o.pages].join('/')}쪽)`).join('; ')+
    `\n넷: `+[...cnt.entries()].sort((a,b)=>b[1]-a[1]).slice(0,120).map(([n,k])=>`${n}(${k})`).join(' ');}
const SC_SYS=`You are a schematic-editing assistant embedded in a PCB/schematic viewer (KiCad-like). The user writes in Korean. You change the schematic only by calling the run_sch tool with one command at a time.
Commands (exactly this syntax):
\${CMDS}
Notes: parts you can add: R, C, CP (electrolytic), L, FB (ferrite bead), D, LED, TVS, Z (zener), F (fuse), TP (one-pin test point); "--pins" accepts net names or part pins like U1.12 / U1.PA3 (a free pin gets a new net and is wired to the new part). Bulk commands: "tp" (test points on HSIS signal nets — use "hsis" first to see signals, categories and nets; filter with --cat power,analog,comm or --port), "tie <ref> --free" (NC pins to GND/+3V3 through R or C, --direct for a plain wire), "insert FB --at U2.3" (series part in a supply/signal line, e.g. a pi filter = insert FB + add C on both sides). When you add or change parts, finish with "apply" so the board gets them, then "erc". two-pin parts are R, C, CP (electrolytic), L, FB (ferrite bead), D, LED; "add ... --pins A,B" connects pin 1 to A and pin 2 to B (for D/LED pin 1 is K, pin 2 is A). Power and ground nets get power symbols automatically. Inspect before you edit: use "pins <ref> --free" or "net <name>" to learn real pin numbers and net names; never guess them. Typical decoupling: one 100nF C per supply pin of an IC, "add C 100nF --pins <supply>,GND --near <IC>". Use at most 8 commands. Finish with "erc" when you added or rewired something, and run "apply" only if the user asked to update the board. Then answer in Korean in 2-5 short sentences: what changed (refs, nets), ERC result, and a next step. Do not invent numbers.`;
async function scAgent(prompt,kind){
  return aiAgent({prompt,kind,ro:c=>{const t=cliTok(c);const f=(t[0]||'').toLowerCase();return['help','?','status','pages','parts','pins','nets','net','find','erc','diff','history','hsis'].includes(f)||(f==='guide'&&(!t[1]||/^(check|list|show)$/i.test(t[1])));},roList:'status, pages, parts, pins, nets, hsis, net, find, erc, diff, guide check',toolName:'run_sch',toolDesc:'Run one schematic console command (see the command list) and return its text output.',example:'"pins U4 --free" or "add C 100nF --pins +3V3,GND --near U4"',
    run:c=>scRun(c,'ai'),allowed:c=>{const f=(cliTok(c)[0]||'').toLowerCase();if(!SCLI_CMDS.has(f)||f==='ai')return'unknown command: '+f;if(f==='regen'&&!SCLI.allowRegen)return'not allowed: regen (the user did not ask to regenerate)';return'';},
    say:scSay,set:scSet,drop:e=>{copDrop(e);SCLI.log=SCLI.log.filter(x=>x!==e);},
    setAbort:c=>{SCLI.abort=c;},stopped:()=>SCLI.stopReq,max:40});}
async function scAI(req){
  if(!req.trim())return'요청을 적어 주세요. 예: ai U4 전원 핀에 100nF 디커플링 캡을 달아줘';
  SCLI.allowRegen=/regen|다시\s*(만들|생성)|처음부터|재생성/i.test(req);
  const cmds=SCLI_HELP.filter(x=>!/^(ai |replace )/.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const ok=await scAgent(SC_SYS.replace('${CMDS}',cmds)+`\n\n현재 회로도:\n${scBrief()}\n\n사용자 요청: ${req}`);
  if(!ok){const list=scNL(req);if(!list.length)return'Claude를 쓸 수 없고 문장도 해석하지 못했습니다. help를 보세요.';scSay('out','Claude를 쓸 수 없어 규칙으로 해석: '+list.join(' → '));for(const c of list){scSay('cmd',c);const o=await scRun(c);if(o)scSay('ok',o);}}
  return'';
}
async function scGoal(g){if(!BD)return;scPanel();scSay('cmd',g+'   (AI 모드)');scBusy(true);try{await scAI(g);}catch(e){scSay('err',e.message||String(e));}scBusy(false);}

