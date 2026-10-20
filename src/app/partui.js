/* ---------- part library + conversational part replacement (PARTLIB / FPGEN) ----------
   PL.user : approved parts list (CSV/Excel import, IndexedDB 'aod-parts')  PL.ai : records Claude estimated  PL.api : records fetched from a distributor
   lookup order: user → built-in PARTS → ai → api.  `replace <ref> <부품>` and sentences like "U3를 AP2112K로 바꿔줘" run the flow in the copilot. */
var PL={user:[],ai:[],api:[],db:null,api_cfg:{provider:'',key:'',url:''},open:false,q:'',tab:'all',busy:false,last:null};
const PL_SRC={user:'승인 목록',builtin:'내장 DB',ai:'Claude 추정',api:'부품 API'};
function plGrade(p){const g=p&&p.grade;if(!g)return'';const auto=PARTLIB.gradeAuto(g);return`<span class="pl-src ${auto?'pl-aec':'pl-com'}" title="${esc(PARTLIB.GRADE_LABEL[g]||g)}${p.temp?' · '+p.temp[0]+'~'+p.temp[1]+' °C':''}">${esc(auto?g:PARTLIB.GRADE_LABEL[g]||g)}</span>`;}
function plAll(){const b=typeof PARTS!=='undefined'?PARTLIB.fromBuiltin(PARTS,plBuiltinPins):[];return PARTLIB.merge([PL.user,b,PL.ai,PL.api]);}
/* pin names for a built-in part: from the open board when a component uses it */
function plBuiltinPins(mpn){if(!BD)return[];const c=BD.comps.find(x=>(x.mpn||'').trim()===mpn&&x.pads.some(p=>p.fn));return c?[...new Map(c.pads.map(p=>[String(p.n),{num:String(p.n),name:p.fn||''}])).values()]:[];}
/* ---- persistence ---- */
function plDb(){if(PL.db)return Promise.resolve(PL.db);return new Promise(res=>{try{const r=indexedDB.open('aod-parts',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('lib'))d.createObjectStore('lib');};
  r.onsuccess=()=>{PL.db=r.result;res(PL.db);};r.onerror=()=>res(null);}catch(e){res(null);}});}
async function plLoad(){try{PL.api_cfg=Object.assign(PL.api_cfg,JSON.parse(localStorage.getItem('aod.partapi')||'{}'));}catch(e){}
  const d=await plDb();if(!d)return;await new Promise(res=>{const tx=d.transaction('lib','readonly').objectStore('lib');const g=k=>new Promise(r=>{const q=tx.get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);});
    Promise.all([g('user'),g('ai'),g('api')]).then(([u,a,p])=>{PL.user=Array.isArray(u)?u:[];PL.ai=Array.isArray(a)?a:[];PL.api=Array.isArray(p)?p:[];res();});});}
async function plSave(){const d=await plDb();if(!d)return;try{const tx=d.transaction('lib','readwrite').objectStore('lib');tx.put(PL.user,'user');tx.put(PL.ai,'ai');tx.put(PL.api,'api');}catch(e){console.warn(e);}}
function plSaveCfg(){try{localStorage.setItem('aod.partapi',JSON.stringify(PL.api_cfg));}catch(e){}}
function plRemember(p){const L=p.src==='ai'?PL.ai:p.src==='api'?PL.api:PL.user;const k=PARTLIB.norm(p.mpn);const i=L.findIndex(x=>PARTLIB.norm(x.mpn)===k);if(i>=0)L[i]=p;else L.push(p);plSave();}
/* ---- import (CSV / Excel) ---- */
async function plImportFiles(files){const msgs=[];let n=0;for(const f of files){const ext=(f.name.split('.').pop()||'').toLowerCase();let aoa=null;
    if(ext==='xlsx'||ext==='xls'||ext==='xlsm'){if(!window.XLSX)throw new Error('엑셀 라이브러리를 불러오지 못했습니다. CSV로 저장해서 넣어 주세요.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
      for(const sn of wb.SheetNames){const r=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:''});const t=PARTLIB.parseTable(r);if(t.parts.length){aoa=r;break;}}if(!aoa)throw new Error(`${f.name}: MPN 열이 있는 시트를 찾지 못했습니다.`);}
    else aoa=PARTLIB.parseCsv(await f.text());
    const t=PARTLIB.parseTable(aoa);if(t.error)throw new Error(`${f.name}: ${t.error}`);
    t.parts.forEach(p=>{p.file=f.name;const k=PARTLIB.norm(p.mpn);const i=PL.user.findIndex(x=>PARTLIB.norm(x.mpn)===k);if(i>=0)PL.user[i]=p;else PL.user.push(p);n++;});msgs.push(`${f.name}: ${t.parts.length}개${t.skipped?` (건너뜀 ${t.skipped})`:''}`);}
  await plSave();return{n,msg:msgs.join(' · ')};}
function plPickFiles(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='.csv,.tsv,.txt,.xlsx,.xls,.xlsm';i.multiple=true;i.onchange=()=>res([...i.files]);i.oncancel=()=>res([]);i.click();});}
/* ---- lookups ---- */
function plFind(q){const all=plAll();return PARTLIB.find(all,q);}
function plSearch(q){return PARTLIB.search(plAll(),q);}
async function plAskClaude(q,ctx){await cliAiProbe();if(!CLI.sample)throw new Error('Claude를 쓸 수 없습니다 (AI 사용 허용 필요). 부품 목록 파일을 가져오거나 부품 API를 설정하세요.');
  const r=await CLI.sample.json(PARTLIB.aiPrompt(q,ctx),{cache:false,modelTier:AIM.tier});const p=PARTLIB.fromAi(r,q);if(p.error)throw new Error('Claude: '+p.error);
  if(typeof FPGEN!=='undefined'&&p.pkg)p.fp=FPGEN.ensure(PCB,p.pkg,p.pins.length)||'';plRemember(p);return p;}
async function plAskApi(q){const c=PL.api_cfg;const P=PARTLIB.PROVIDERS[c.provider];if(!P)throw new Error('부품 API가 설정되지 않았습니다 (부품 라이브러리 → API 설정).');if(c.provider!=='custom'&&!c.key)throw new Error(`${P.name} 키가 없습니다.`);
  const{url,init}=P.req(c.key,q,c.url);let j;try{const r=await fetch(url,init);if(!r.ok)throw new Error(`HTTP ${r.status}`);j=await r.json();}
  catch(e){throw new Error(`${P.name} 호출 실패: ${e.message||e}${/Failed to fetch|NetworkError|CORS/i.test(String(e))?' — 브라우저에서 직접 호출할 수 없는 API면(CORS) 사내 프록시 주소를 "사내 부품 서버"로 설정하세요.':''}`);}
  const L=P.parse(j).filter(p=>p.mpn);if(!L.length)throw new Error(`${P.name}: "${q}" 결과가 없습니다.`);L.forEach(p=>{if(typeof FPGEN!=='undefined'&&p.pkg)p.fp=FPGEN.ensure(PCB,p.pkg,p.pins.length)||'';plRemember(p);});return L;}
/* ---- the sentence: "U3를 AP2112K-3.3으로 바꿔줘" · "replace U3 with AP2112K" · "U3 대신 TLV1117 써" ---- */
function plIntent(line){const s=String(line||'').trim();if(!s)return null;let m;
  if((m=s.match(/^replace\s+([A-Za-z]+\d+[A-Za-z]?)\s+(?:with\s+|to\s+)?(.+)$/i)))return{ref:m[1].toUpperCase(),q:m[2].trim().replace(/^["']|["']$/g,'')};
  if((m=s.match(/([A-Za-z]{1,3}\d+[A-Za-z]?)\s*(?:을|를|은|는|의\s*부품을)?\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|바꾸|교체|변경|대체|갈아|swap|change|replace)/i)))return{ref:m[1].toUpperCase(),q:m[2].trim().replace(/^["']|["']$/g,'')};
  if((m=s.match(/([A-Za-z]{1,3}\d+[A-Za-z]?)\s*(?:대신|대신에)\s+(.+?)\s*(?:을|를)?\s*(?:써|사용|넣|쓰|적용)/i)))return{ref:m[1].toUpperCase(),q:m[2].trim()};
  if((m=s.match(/^(?:replace|swap)\s+([A-Za-z]+\d+[A-Za-z]?)\s*$/i)))return{ref:m[1].toUpperCase(),q:''};
  if(/바꿔|교체|변경|대체|replace/i.test(s)&&(m=s.match(/\b([A-Za-z]{1,3}\d+[A-Za-z]?)\b/))&&BD&&BD.byRef[m[1].toUpperCase()])return{ref:m[1].toUpperCase(),q:'',vague:true};
  return null;}
/* ---- "CC2420 추가해줘" / "add CC2420" → conversational add of any library part ---- */
function plAddIntent(line){const s=String(line||'').trim();let m;const PASS=/^(R|C|CP|L|FB|D|LED|TVS|Z|F|TP|TP\d*|저항|캐패시터|커패시터|콘덴서|인덕터|비드|다이오드|퓨즈|테스트\s*포인트)$/i;
  if((m=s.match(/^(?:회로(?:도)?에\s*)?([A-Za-z]{2,}[A-Za-z0-9\-_.\/]*\d[A-Za-z0-9\-_.\/]*)\s*(?:을|를|도|이|가)?\s*(?:추가|넣어|달아|붙여|넣고|add)/i))||(m=s.match(/^add\s+(?!part\b)([A-Za-z]{2,}[A-Za-z0-9\-_.\/]*\d[A-Za-z0-9\-_.\/]*)\s*$/i))){const q=m[1];if((BD&&BD.byRef&&BD.byRef[q.toUpperCase()])||(/^[A-Z]{1,2}\d{1,3}$/i.test(q)&&!/^(CC|LM|NE|TL|OP|AD|MC|LT|SN|TP(?!\d{1,3}$))/i.test(q))||PASS.test(q))return null;if(/^(0402|0603|0805|1206)$/.test(q))return null;return{q,line:s};}
  return null;}
async function plAddFlow(it,src){src=src||'sch';const say=(k,t)=>{const e={k,t};copPaint(src,e);return e;};const ask=q=>{COP.askSrc=src;return copAsk(q);};
  if(!BD||BD.blank){say('err','회로가 없습니다. 먼저 회로를 만들거나 파일을 불러오세요.');return;}
  const q=it.q;say('out',`"${q}" 부품 추가 — 라이브러리(승인 목록 → 내장 DB → 이전 추정)에서 찾는 중…`);
  let part=null;const cands=plSearch(q);const exact=cands.find(p=>PARTLIB.norm(p.mpn)===PARTLIB.norm(q)||PARTLIB.norm(p.mpn).startsWith(PARTLIB.norm(q)));
  if(exact&&exact.pins&&exact.pins.length)part=exact;
  while(!part){const hasApi=!!PARTLIB.PROVIDERS[PL.api_cfg.provider];const O1='Claude 추정 (핀 배열·패키지·사양을 AI가 채움)',O2=hasApi?`부품 API 조회 (${PARTLIB.PROVIDERS[PL.api_cfg.provider].name})`:'부품 API 설정…',O3='승인 부품 목록 파일 가져오기 (CSV/Excel)',O4='취소';
    const a=await ask({q:`"${q}"${exact?'의 핀 정보가 없습니다':'은(는) 라이브러리에 없습니다'}. 어떻게 가져올까요?`,why:'추정값은 카드에 "Claude 추정"으로 표시되고 데이터시트로 확인해야 합니다.',opts:[O1,O2,O3,O4]});
    if(!a||a===O4){say('out','추가를 취소했습니다.');return;}
    try{if(a===O1){const e=say('ai','Claude가 부품 사양을 찾는 중…');part=await plAskClaude(q,{hint:BD.name,role:'new part to add to the circuit'});copDrop(e);}
      else if(a===O2){if(!hasApi){plOpenSettings(src);const b=await ask({q:'부품 API를 설정한 뒤 "계속"을 누르세요.',opts:['계속','취소']});if(b!=='계속')return;continue;}const e=say('ai','API 조회 중…');const L=await plAskApi(q);copDrop(e);part=L[0];
        if(part&&!(part.pins&&part.pins.length)){const e2=say('ai','Claude가 핀 배열을 찾는 중…');try{const p2=await plAskClaude(part.mpn,{hint:part.title});part.pins=p2.pins;part.pkg=part.pkg||p2.pkg;part.fp=p2.fp||part.fp;plRemember(part);}catch(e3){say('err',e3.message);}copDrop(e2);}}
      else if(a===O3){const files=await plPickFiles();if(!files.length)continue;const r=await plImportFiles(files);say('ok',`가져옴: ${r.msg}`);const f=plFind(q);if(f&&f.pins&&f.pins.length)part=f;else say('out',`가져온 목록에 "${q}"의 핀 정보가 없습니다.`);}
    }catch(e){say('err',e.message||String(e));}}
  plSayHTML(src,`<div class="pl-k">추가할 부품</div>${plPartHTML(part)}`);
  const pw=part.pins.filter(p=>/^(GND|VCC|VIN)$/.test(PARTLIB.role(p.name))||/^(VDD|VCC|AVDD|DVDD|VDDIO|VBAT)/i.test(p.name)).map(p=>p.name).join(', ');
  const a=await ask({q:`${part.mpn} 핀 ${part.pins.length}개 — 어떻게 연결할까요?`,why:`전원/접지 핀(${pw||'없음'})은 레일에 자동으로 잇고, 나머지는 열어 둡니다. 특정 핀을 바로 이으려면 "SDA=I2C_SDA, SCL=I2C_SCL"처럼 적으세요.`,opts:['전원·접지만 자동 연결','연결하지 않고 추가','취소']});
  if(!a||a==='취소'){say('out','추가를 취소했습니다.');return;}
  const opts={auto:a!=='연결하지 않고 추가',pins:/[=:]/.test(a)?a:''};
  try{const r=scBatch(()=>scAddPart(part,opts).msg);say('ok',r);}catch(e){console.error(e);say('err','추가 실패: '+(e.message||e));}}
/* ---- helpers for the cards ---- */
function plPartHTML(p,o){o=o||{};const price=p.price!=null?`$${(+p.price).toFixed(p.price<1?3:2)}`:'—';const badge=`<span class="pl-src pl-${p.src}">${esc(PL_SRC[p.src]||p.src)}${p.src==='ai'&&p.conf!=null?' '+Math.round(p.conf*100)+'%':''}</span>`;
  return`<div class="pl-card"><div class="pl-h"><b class="mono">${esc(p.mpn)}</b>${badge}${plGrade(p)}${p.asil?`<span class="pl-src pl-aec">${esc(p.asil)}</span>`:''}${p.status==='obsolete'?'<span class="pl-src pl-obs">단종</span>':p.status==='preferred'?'<span class="pl-src pl-pref">우선</span>':''}</div>
    <div class="pl-m">${esc(p.mfr||'제조사 미상')}${p.cat?' · '+esc(p.cat):''}${p.pkg?' · '+esc(p.pkg):''}${p.fp&&p.fp!==p.pkg?' · FP '+esc(p.fp):''} · 참고 단가 ${price}${o.oldPrice!=null&&p.price!=null?` (${p.price>o.oldPrice?'+':''}${(p.price-o.oldPrice).toFixed(3)})`:''}</div>
    ${p.title?`<div class="pl-t">${esc(p.title)}</div>`:''}${p.specs&&p.specs.length?`<dl class="pl-specs">${p.specs.slice(0,8).map(s=>`<dt>${esc(s[0])}</dt><dd>${esc(s[1])}</dd>`).join('')}</dl>`:''}
    ${p.pins&&p.pins.length?`<div class="pl-pins">${p.pins.map(x=>`<span class="pill sm" title="역할 ${esc(PARTLIB.role(x.name))}">${esc(x.num)} ${esc(x.name)}</span>`).join('')}</div>`:'<div class="pl-m">핀 이름 정보 없음</div>'}
    ${p.note?`<div class="pl-m">${esc(p.note)}</div>`:''}${p.pdf||p.page?`<div class="pl-m">${p.pdf?`<a href="${esc(p.pdf)}" target="_blank" rel="noopener">데이터시트</a>`:''}${p.page?` · <a href="${esc(p.page)}" target="_blank" rel="noopener">제품 페이지</a>`:''}</div>`:''}</div>`;}
function plMapHTML(ref,pl){const M=pl.map;const how={name:'이름',role:'역할',number:'번호',none:'—'};
  return`<table class="pl-map"><thead><tr><th>${esc(ref)} 핀</th><th>넷</th><th></th><th>새 핀</th><th>근거</th></tr></thead><tbody>${M.map.map(m=>`<tr class="${m.to?(m.conf<0.6?'warn':''):(m.net&&PARTLIB.role(m.name)!=='NC'?'err':'none')}"><td>${esc(m.from)}${m.name?' <small>'+esc(m.name)+'</small>':''}</td><td>${esc(m.net||'—')}</td><td>→</td><td>${m.to?esc(m.to)+(m.toName?' <small>'+esc(m.toName)+'</small>':''):'<i>없음</i>'}</td><td>${how[m.how]||''}</td></tr>`).join('')}
    ${M.extra.map(e=>`<tr class="${e.role==='NC'?'none':'info'}"><td colspan="3"><i>새 핀</i></td><td>${esc(e.num)}${e.name?' <small>'+esc(e.name)+'</small>':''}</td><td>${e.role==='NC'?'NC':'미연결'}</td></tr>`).join('')}</tbody></table>
    ${pl.warn.length?`<ul class="pl-warn">${pl.warn.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}`;}
function plSayHTML(src,html,cls){copPaint(src,{k:'html',t:html,cls:cls||''});}
function plOldPrice(c){try{return typeof PARTS!=='undefined'?PARTS.price(c.mpn,'' ):null;}catch(e){return null;}}
/* ---- the conversation ---- */
async function plReplaceFlow(it,src){src=src||'sch';const say=(k,t)=>{const e={k,t};copPaint(src,e);return e;};const ask=q=>{COP.askSrc=src;return copAsk(q);};
  if(!BD||BD.blank){say('err','바꿀 부품이 있는 보드가 없습니다. 먼저 회로를 만들거나 파일을 불러오세요.');return;}
  let ref=it.ref;let c=ref&&BD.byRef[ref];
  if(!c){const refs=BD.comps.filter(x=>/^(U|Q|D|J|L|Y|X)/i.test(x.ref)).map(x=>x.ref);const a=await ask({q:`어느 부품을 바꿀까요?${ref?` (${ref}는 없습니다)`:''}`,why:'참조 번호를 고르거나 적어 주세요.',opts:refs.slice(0,8)});if(!a)return;ref=String(a).trim().toUpperCase();c=BD.byRef[ref];if(!c){say('err',`${ref}: 보드에 없는 부품입니다.`);return;}}
  // pin names for the old part: the board's pin functions, else the library record, else a known pinout
  if(!c.pads.some(p=>p.fn)){const rec=plFind(c.mpn||'');const pins=rec&&rec.pins&&rec.pins.length?rec.pins:PARTLIB.pinoutFor(c.mpn,c.val,c.fp);if(pins)c.pads.forEach(p=>{const n=pins.find(x=>x.num===String(p.n));if(n&&n.name)p.fn=n.name;});}
  const oldLabel=`${c.ref} ${c.val||''}${c.mpn?' ('+c.mpn+')':''} · ${c.fp||'?'} · 핀 ${c.pads.length}`;
  let q=it.q||'';if(!q){const a=await ask({q:`${oldLabel} — 어떤 부품으로 바꿀까요?`,why:'부품 번호(MPN)나 설명을 적어 주세요. 예: AP2112K-3.3, "3.3V 600mA LDO SOT-23-5"',opts:[]});if(!a)return;q=String(a).trim();}
  say('out',`${oldLabel} → "${q}" 교체를 시작합니다. 라이브러리(승인 목록 → 내장 DB → 이전 추정)에서 찾는 중…`);
  // 1) library (user → builtin → ai/api cache)
  let part=null;let cands=plSearch(q);const exact=cands.find(p=>PARTLIB.norm(p.mpn)===PARTLIB.norm(q));
  if(exact)part=exact;
  else if(cands.length){const opts=cands.slice(0,6).map(p=>`${p.mpn} · ${p.mfr||''} ${p.pkg||''} [${PL_SRC[p.src]}]`);const a=await ask({q:`"${q}"와 비슷한 부품이 ${cands.length}개 있습니다. 어느 것으로 할까요?`,why:'목록에 없으면 "새로 찾기"를 고르세요.',opts:opts.concat(['새로 찾기 (Claude 추정 / 부품 API)'])});
    if(!a)return;const i=opts.indexOf(a);if(i>=0)part=cands[i];else if(!/새로 찾기/.test(a)){part=plFind(a)||null;if(!part){q=a;}}}
  // 2) not in the library: AI estimate (default) → distributor API → import a file
  while(!part){const hasApi=!!PARTLIB.PROVIDERS[PL.api_cfg.provider];
    const O1='Claude 추정 (사양·핀·단가를 AI가 채움)',O2=hasApi?`부품 API 조회 (${PARTLIB.PROVIDERS[PL.api_cfg.provider].name})`:'부품 API 설정…',O3='승인 부품 목록 파일 가져오기 (CSV/Excel)',O4='취소';
    const a=await ask({q:`"${q}"은(는) 라이브러리에 없습니다. 사양을 어떻게 가져올까요?`,why:'우선순위: 승인 부품 목록 → Claude 추정 → 부품 API. 추정값은 카드에 "Claude 추정"으로 표시되고 데이터시트로 확인해야 합니다.',opts:[O1,O2,O3,O4]});
    if(!a||a===O4){say('out','교체를 취소했습니다.');return;}
    try{
      if(a===O1){const e=say('ai','Claude가 부품 사양을 찾는 중…');const ctx={oldPart:`${c.val||''} ${c.mpn||''} (${c.fp||''})`,oldPins:c.pads.map(p=>`${p.n}:${p.fn||'?'}=${p.net||'-'}`).join(', '),role:plRoleOf(c),hint:BD.name};
        const p=await plAskClaude(q,ctx);copDrop(e);if(p.conf<0.5)say('out',`Claude의 확신도가 낮습니다 (${Math.round(p.conf*100)}%). 부품 번호를 확인해 주세요.`);part=p;}
      else if(a===O2){if(!hasApi){plOpenSettings(src);const b=await ask({q:'부품 API를 설정한 뒤 "계속"을 누르세요.',opts:['계속','취소']});if(b!=='계속')return;continue;}
        const e=say('ai',`${PARTLIB.PROVIDERS[PL.api_cfg.provider].name} 조회 중…`);const L=await plAskApi(q);copDrop(e);
        if(L.length===1)part=L[0];else{const opts=L.slice(0,6).map(p=>`${p.mpn} · ${p.mfr||''} ${p.pkg||''}`);const b=await ask({q:`결과 ${L.length}개 — 어느 것으로 할까요?`,opts});if(!b)return;part=L[Math.max(0,opts.indexOf(b))];}
        if(part&&!part.pins.length){const b=await ask({q:`${part.mpn}: API에 핀 이름이 없습니다. 핀 배열을 Claude에게 채우게 할까요?`,opts:['Claude로 핀 채우기','핀 번호가 같다고 보고 진행','취소']});if(b==='취소'||!b)return;
          if(/Claude/.test(b)){const e2=say('ai','Claude가 핀 배열을 찾는 중…');try{const p2=await plAskClaude(part.mpn,{oldPart:c.mpn||c.val,hint:part.title});part.pins=p2.pins;part.pkg=part.pkg||p2.pkg;part.fp=p2.fp||part.fp;part.note=(part.note?part.note+' · ':'')+'핀 배열은 Claude 추정';plRemember(part);}catch(e3){say('err',e3.message);}copDrop(e2);}}}
      else if(a===O3){const files=await plPickFiles();if(!files.length)continue;const r=await plImportFiles(files);say('ok',`가져옴: ${r.msg}`);const f=plFind(q)||plSearch(q)[0];if(f)part=f;else say('out',`가져온 목록에도 "${q}"이(가) 없습니다.`);}
    }catch(e){say('err',e.message||String(e));}
  }
  // 3) show the candidate, propose the pin map, let the user fix open pins
  if(!(part.pins&&part.pins.length)){const kp=PARTLIB.pinoutFor(part.mpn,part.val,part.pkg||part.fp);if(kp){part.pins=kp;if(part.src!=='builtin')plRemember(part);}}
  const oldPrice=plOldPrice(c);let pl=PARTLIB.plan(c,part,null,{oldPrice});
  plSayHTML(src,`<div class="pl-cmp"><div><div class="pl-k">지금</div><div class="pl-card"><div class="pl-h"><b class="mono">${esc(c.mpn||c.val||c.ref)}</b></div><div class="pl-m">${esc(c.ref)} · ${esc(c.val||'')} · ${esc(c.fp||'?')} · 핀 ${c.pads.length}${oldPrice!=null?` · $${oldPrice.toFixed(oldPrice<1?3:2)}`:''}</div><div class="pl-pins">${c.pads.map(p=>`<span class="pill sm">${esc(p.n)} ${esc(p.fn||'')}${p.net?' = '+esc(p.net):''}</span>`).join('')}</div></div></div><div><div class="pl-k">후보</div>${plPartHTML(part,{oldPrice})}</div></div>`);
  if(part.src==='ai'||part.src==='api'){const a=await ask({q:`${part.mpn} 사양이 맞아 보이나요?`,why:part.src==='ai'?'Claude 추정입니다. 데이터시트 링크로 핀 배열을 확인하세요.':'부품 API 결과입니다.',opts:['맞음 · 계속','다른 부품으로','취소']});
    if(!a||a==='취소')return;if(a==='다른 부품으로'){const b=await ask({q:'어떤 부품으로 바꿀까요?',opts:[]});if(!b)return;return plReplaceFlow({ref:c.ref,q:String(b)},src);}}
  plSayHTML(src,`<div class="pl-k">핀 대응 (제안)</div>${plMapHTML(c.ref,pl)}`);
  for(const o of pl.map.open){const free=pl.map.extra.map(e=>`${e.num} ${e.name||''}`.trim());if(!free.length)break;
    const a=await ask({q:`${c.ref}.${o.from}${o.name?' ('+o.name+')':''} = 넷 ${o.net} 은(는) 새 부품의 어느 핀으로 갈까요?`,why:'짝이 없는 핀입니다. 연결하지 않으면 그 넷은 이 부품에서 떨어집니다.',opts:free.concat(['연결 안 함'])});
    const num=a?String(a).split(/\s/)[0]:'';if(a&&a!=='연결 안 함'&&part.pins.some(p=>p.num===num)){const m=pl.map.map.find(x=>x.from===o.from);m.to=num;m.toName=(part.pins.find(p=>p.num===num)||{}).name||'';m.how='user';m.conf=1;pl.map.extra=pl.map.extra.filter(e=>e.num!==num);}}
  pl.map.add=[];const oldNets=[...new Set(c.pads.map(p=>p.net).filter(Boolean))];
  for(const e of pl.map.extra.filter(x=>/^(EN|VIN|VCC|GND|VOUT|PG|BYP)$/.test(x.role))){const a=await ask({q:`새 부품의 핀 ${e.num} (${e.name}) 은(는) 어디에 연결할까요?`,why:e.role==='EN'?'EN(enable)은 보통 VIN에 묶어 항상 켭니다. MCU GPIO로 제어하려면 넷 이름을 적으세요.':e.role==='GND'?'접지 핀은 GND에 묶습니다.':'기존 부품에 없던 핀입니다.',opts:(e.role==='EN'?oldNets.filter(n=>PARTLIB.role(n)!=='GND'):e.role==='GND'?oldNets.filter(n=>PARTLIB.role(n)==='GND'):oldNets).concat(['연결 안 함'])});
    if(a&&a!=='연결 안 함'){pl.map.add.push({num:e.num,name:e.name,net:String(a).trim()});pl.map.extra=pl.map.extra.filter(x=>x.num!==e.num);}}
  pl=PARTLIB.plan(c,part,pl.map,{oldPrice});pl.map.open=pl.map.map.filter(m=>!m.to&&m.net&&PARTLIB.role(m.name)!=='NC');
  if(pl.map.map.some(m=>m.how==='user')||pl.map.add.length)plSayHTML(src,`<div class="pl-k">핀 대응 (확정)</div>${plMapHTML(c.ref,pl)}`);
  const fpNote=pl.fpSame?'풋프린트 같음 · 보드 위치 유지':`풋프린트 ${c.fp||'?'} → ${part.fp||part.pkg||'?'} · 같은 자리에 새 패턴 (재배선 필요)`;
  const go=await ask({q:`${c.ref}: ${c.mpn||c.val} → ${part.mpn} 적용할까요?`,why:`${fpNote} · 회로도 심볼·보드 부품·BOM·데이터시트 탭·HSIS 핀 맵이 함께 바뀝니다. 변경 요청 카드에서 되돌릴 수 있습니다.`,opts:['적용','취소']});
  if(go!=='적용'){say('out','교체를 취소했습니다.');return;}
  try{const r=plApply(c.ref,part,pl.map);say('ok',r);}catch(e){console.error(e);say('err','교체 실패: '+(e.message||e));}}
function plRoleOf(c){const v=(c.val||'')+' '+(c.mpn||'')+' '+(c.desc||'');if(/1117|LDO|REG|TPS7|AP2112|LP29|ME6211|HT7|XC62|RT9|MIC5/i.test(v))return'LDO regulator';if(/MP1584|MP2|TPS54|TPS56|LMR|LM259|BUCK|DC-?DC|MPM/i.test(v))return'DC-DC converter';if(/^U/i.test(c.ref)&&c.pads.length>=20)return'MCU/IC';if(/^Q/i.test(c.ref))return'transistor/MOSFET';if(/^D/i.test(c.ref))return'diode';if(/^J|^CN|^P\d/i.test(c.ref))return'connector';return'IC';}
/* ---- apply: board component (pads, footprint, nets) + schematic symbol + relink; one undo step on the PCB stack ---- */
function plSnap(c){return{f:{pads:c.pads,body:c.body,fp:c.fp,val:c.val,mpn:c.mpn,desc:c.desc,pn:c.pn,bb:c.bb,f:c.f,kind:c.kind,replaced:c.replaced||null},
  drills:BD.drills.filter(d=>d.own===c),silk:{T:BD.layers['T.silk'].filter(p=>p.own===c),B:BD.layers['B.silk'].filter(p=>p.own===c)},sch:BD.schSheets&&typeof SCHEDIT!=='undefined'?SCHEDIT.snapshot(BD.schSheets):null,hw:typeof HS!=='undefined'&&HS.H&&Array.isArray(HS.H.items)?HS.H.items.map(it=>it.hw):null};}
function plRestore(c,S){['T.cu','B.cu'].forEach(k=>{BD.layers[k]=BD.layers[k].filter(p=>!(p.t==='pad'&&p.ref===c.ref));});BD.drills=BD.drills.filter(d=>d.own!==c);['T.silk','B.silk'].forEach(k=>{BD.layers[k]=BD.layers[k].filter(p=>p.own!==c);});
  Object.assign(c,S.f);c.pads.forEach(p=>{if(p.side!=='B')BD.layers['T.cu'].push(p);if(p.side!=='T')BD.layers['B.cu'].push(p);});S.drills.forEach(d=>BD.drills.push(d));S.silk.T.forEach(p=>BD.layers['T.silk'].push(p));S.silk.B.forEach(p=>BD.layers['B.silk'].push(p));
  if(S.sch){BD.schSheets=SCHEDIT.restore(S.sch);}if(S.hw&&typeof HS!=='undefined'&&HS.H&&HS.H.items&&HS.H.items.length===S.hw.length)HS.H.items.forEach((it,i)=>{it.hw=S.hw[i];});plAfter(c);}
function plAfter(c){if(typeof PINREC!=='undefined')PINREC.relink(BD);if(typeof PCBEDIT!=='undefined'&&BD._pe)PCBEDIT.rebuildNets(BD);
  if(typeof seBoardChanged==='function')seBoardChanged();else if(typeof refresh==='function')refresh(true);
  if(typeof SE!=='undefined'&&SE.on){try{SE.sel=null;seRefresh(true);SE.dirty=false;seRefresh(false);renderSchOv();drawSch();}catch(e){console.warn(e);}}
  if(typeof PE!=='undefined'&&PE.on&&typeof peRecalc==='function')peRecalc(true);if(typeof DS!=='undefined'&&typeof dsRender==='function')dsRender();}
function plApply(ref,part,M){const c=BD.byRef[ref];if(!c)throw new Error(`${ref}: 보드에 없습니다.`);
  if(typeof scSheets==='function'){try{scSheets();}catch(e){}}
  const before=plSnap(c);
  const oldPins=c.pads.map(p=>({n:String(p.n),fn:p.fn||'',net:p.net||null}));const oldFp=c.fp,oldMpn=c.mpn,oldVal=c.val;
  const pinsNew=part.pins&&part.pins.length?part.pins:oldPins.map(p=>({num:p.n,name:p.fn}));
  let fp=part.fp&&PCB.FP[part.fp]?part.fp:(typeof FPGEN!=='undefined'&&part.pkg?FPGEN.ensure(PCB,part.pkg,pinsNew.length):null);
  if(!fp&&pinsNew.length===oldPins.length&&PCB.FP[oldFp])fp=oldFp;
  const nets={},pn={};M.map.forEach(m=>{if(m.to&&m.net)nets[m.to]=m.net;});(M.add||[]).forEach(x=>{if(x.net)nets[x.num]=x.net;});pinsNew.forEach(p=>{if(p.name)pn[p.num]=p.name;});
  const cs={ref,value:part.val||part.mpn,footprint:fp||'',side:c.side==='B'?'bottom':'top',x:c.x,y:c.y,rotation:c.rot||0,pins:nets,pinNames:pn,mpn:part.mpn,description:part.title||part.desc||''};
  if(!fp){const half=Math.ceil(pinsNew.length/2);cs.pads=pinsNew.map((p,i)=>({n:p.num,x:(i<half?-1.5:1.5),y:((i%half)-(half-1)/2)*1.0,w:1.2,h:0.6}));cs.size=[3.5,half*1.0+1,1.2];}
  const m=PCB.finalize(PCB.fromSpec({board:{width:10,height:10},components:[cs]}));const nc=m.comps[0];
  // swap pads/body on the existing component object so references (byRef, selection, HSIS) stay valid
  ['T.cu','B.cu'].forEach(k=>{BD.layers[k]=BD.layers[k].filter(p=>!(p.t==='pad'&&p.ref===ref));});BD.drills=BD.drills.filter(d=>d.own!==c);['T.silk','B.silk'].forEach(k=>{BD.layers[k]=BD.layers[k].filter(p=>p.own!==c);});
  c.pads=nc.pads;c.pads.forEach(p=>{p.ref=ref;});c.body=nc.body;c.f=nc.f;c.kind=nc.kind;c.fp=nc.fp;c.val=cs.value;c.mpn=part.mpn;c.desc=cs.description;c.pn=pn;c.bb=nc.bb;
  c.pads.forEach(p=>{if(p.side!=='B')BD.layers['T.cu'].push(p);if(p.side!=='T')BD.layers['B.cu'].push(p);});m.drills.forEach(d=>{d.own=c;BD.drills.push(d);});['T.silk','B.silk'].forEach(k=>{(m.layers[k]||[]).forEach(p=>{if(p.own===nc){p.own=c;BD.layers[k].push(p);}});});
  c.replaced={from:oldMpn||oldVal,fp:oldFp,to:part.mpn,at:Date.now(),fpChanged:oldFp!==c.fp};
  // HSIS: "U2.2" style hardware references follow the pin map
  let hsNote='';if(typeof HS!=='undefined'&&HS.H&&Array.isArray(HS.H.items)){let k=0;const re=new RegExp('\\b'+ref+'\\.([A-Za-z0-9]+)\\b','g');
    HS.H.items.forEach(it=>{if(!it.hw||!re.test(String(it.hw)))return;re.lastIndex=0;it.hw=String(it.hw).replace(re,(m0,pin)=>{const mm=M.map.find(x=>x.from===pin);if(mm&&mm.to){k++;return ref+'.'+mm.to;}const same=M.map.find(x=>x.from===pin&&x.how==='merged');if(same){const o=M.map.find(x=>x.net===same.net&&x.to);if(o){k++;return ref+'.'+o.to;}}return m0;});});
    if(k)hsNote=` · HSIS HW 연결 ${k}곳 갱신`;}
  // schematic
  let schNote='';if(BD.schSheets&&typeof scSyms==='function'){try{schNote=plApplySch(ref,c,part,M,oldPins);}catch(e){console.warn(e);schNote=' · 회로도 갱신 실패: '+(e.message||e);}}
  plAfter(c);const after=plSnap(c);
  if(typeof pePush==='function')pePush({undo:()=>plRestore(c,before),redo:()=>plRestore(c,after),copper:true,label:`부품 교체 ${ref}`});
  const moved=M.map.filter(x=>x.to&&x.net).length,dropped=M.map.filter(x=>!x.to&&x.net&&x.how!=='merged').length;
  return`${ref}: ${oldMpn||oldVal} → ${part.mpn} (${c.fp||'풋프린트 없음'}) · 넷 ${moved}개 옮김${dropped?` · ${dropped}개 떨어짐`:''}${c.replaced.fpChanged?' · 풋프린트가 바뀌어 기존 배선은 끊어졌을 수 있습니다 — PCB에서 래츠네스트·route로 다시 이어 주세요':''}${schNote}${hsNote}`;}
function plApplySch(ref,c,part,M,oldPins){const units=scSyms(ref);if(!units.length)return'';const sheets=BD.schSheets;
  const same=oldPins.length===c.pads.length&&M.map.every(m=>m.to===m.from)&&!(M.add||[]).length;
  if(same){units.forEach(u=>{const s=u.s;s.val=c.val;s.fp=c.fp;s.texts.forEach(t=>{if(t.role==='Value')t.s=c.val;});s.pins.forEach(p=>{const n=(part.pins||[]).find(x=>x.num===String(p.num));if(n){p.name=n.name;p.nameShow=!!n.name;}});});return' · 회로도 값·핀 이름 갱신';}
  // different pinout: take the old symbol(s) off the sheet (labels, wires) and draw a fresh box symbol at the same spot
  const u=units[0];const sh=sheets[u.page];const at=[u.s.x,u.s.y];
  units.forEach(v=>{const shv=sheets[v.page];v.s.pins.forEach(p=>scDetach(shv,p.p));shv.symbols.splice(shv.symbols.indexOf(v.s),1);});
  const padsOf=c.pads.slice().sort((a,b)=>String(a.n).localeCompare(String(b.n),undefined,{numeric:true}));
  const left=[],right=[];padsOf.forEach(p=>{const r=PARTLIB.role(p.fn);(/^(VOUT|SW|PG|TX|TXD|MISO|CANH|CANL|D|K|S)$/.test(r)?right:left).push(p);});
  if(!right.length&&left.length>2){const h=Math.ceil(left.length/2);right.push(...left.splice(h));}
  const bx=SCH.boxSym({ref,val:c.val,fp:c.fp,pads:padsOf},{L:left,R:right,T:[],B:[]},()=>null);const s=bx.s;SCH.moveSym(s,at[0]-s.x,at[1]-s.y);
  sh.symbols.push(s);s.pins.forEach(p=>{const pd=p._pad;if(pd&&pd.net)scAttach(sh,p,pd.net);else sh.nocon.push(p.p.slice());delete p._pad;});
  SCHEDIT.cleanWires(sh);if(typeof SV!=='undefined')SV.page=u.page;return` · 회로도 심볼을 새 핀 배열로 다시 그림 (${u.page+1}쪽)`;}
/* ---- library dialog ---- */
function plDialogHTML(){const all=plAll();const q=PL.q.toLowerCase();const tab=PL.tab;const list=all.filter(p=>tab==='all'||p.src===tab).filter(p=>!q||[p.mpn,p.mfr,p.title,p.cat,p.pkg].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.mpn.localeCompare(b.mpn));
  const cnt=s=>all.filter(p=>p.src===s).length;const onBoard=new Set(BD?BD.comps.map(c=>(c.mpn||'').trim()):[]);const cfg=PL.api_cfg;const P=PARTLIB.PROVIDERS;
  return`<div class="sheet pl" role="dialog" aria-modal="true" aria-labelledby="plT"><div class="sheet-h"><h2 id="plT">부품 라이브러리</h2><span class="pl-cnt">승인 ${cnt('user')} · 내장 ${cnt('builtin')} · Claude 추정 ${cnt('ai')} · API ${cnt('api')}</span><button type="button" class="btn sm" data-close aria-label="닫기">닫기</button></div>
  <div class="sheet-b pl-b"><div class="pl-bar"><div class="seg sm" role="tablist">${[['all','전체'],['user','승인 목록'],['builtin','내장'],['ai','Claude 추정'],['api','API']].map(t=>`<button type="button" role="tab" data-pltab="${t[0]}" aria-selected="${tab===t[0]}">${t[1]}</button>`).join('')}</div>
      <input type="search" id="plQ" placeholder="MPN · 제조사 · 설명 검색" value="${esc(PL.q)}" aria-label="검색"><span class="cop-sp"></span>
      <button type="button" class="btn sm" data-plimp>목록 가져오기 (CSV/Excel)</button><button type="button" class="btn sm" data-pltpl>CSV 템플릿</button><button type="button" class="btn sm" data-plexp>내보내기</button><button type="button" class="btn sm" data-plapi aria-expanded="${PL.apiOpen?'true':'false'}">API 설정</button></div>
    <div class="pl-api" ${PL.apiOpen?'':'hidden'}><label>공급자 <select id="plProv"><option value="">(없음)</option>${Object.keys(P).map(k=>`<option value="${k}" ${cfg.provider===k?'selected':''}>${esc(P[k].name)}</option>`).join('')}</select></label>
      <label>키 / 토큰 <input type="password" id="plKey" value="${esc(cfg.key||'')}" placeholder="브라우저에만 저장됩니다"></label><label>주소 (사내 서버) <input type="text" id="plUrl" value="${esc(cfg.url||'')}" placeholder="https://parts.example.com/find?q={q}"></label>
      <button type="button" class="btn primary sm" data-plsave>저장</button><button type="button" class="btn sm" data-pltest>조회 테스트</button><div class="pl-m">${cfg.provider&&P[cfg.provider]?esc(P[cfg.provider].keyHelp):'우선순위: 승인 부품 목록 → Claude 추정 → 부품 API. Mouser API는 브라우저에서 직접 호출이 막혀 있어(CORS) 사내 프록시가 필요할 수 있습니다.'}</div></div>
    <div class="pl-list">${list.length?`<table class="lgt pl-tbl"><thead><tr><th>MPN</th><th>제조사</th><th>설명</th><th>패키지</th><th>핀</th><th>등급</th><th>단가</th><th>출처</th><th></th></tr></thead><tbody>${list.slice(0,400).map(p=>`<tr class="${onBoard.has(p.mpn)?'on':''}"><td class="mono">${esc(p.mpn)}${onBoard.has(p.mpn)?' <span class="pl-src pl-on">보드</span>':''}</td><td>${esc(p.mfr||'')}</td><td>${esc(p.title||p.desc||'')}</td><td>${esc(p.pkg||p.fp||'')}</td><td>${p.pins&&p.pins.length?p.pins.length:'—'}</td><td>${plGrade(p)||'—'}</td><td>${p.price!=null?'$'+(+p.price).toFixed(p.price<1?3:2):'—'}</td><td><span class="pl-src pl-${p.src}">${esc(PL_SRC[p.src])}</span>${p.status==='obsolete'?' <span class="pl-src pl-obs">단종</span>':''}</td><td>${p.src!=='builtin'?`<button type="button" class="btn sm" data-plpromote="${esc(p.mpn)}" title="승인 목록으로">${p.src==='user'?'':'승인'}</button><button type="button" class="btn sm" data-pldel="${esc(p.mpn)}" data-src="${p.src}" aria-label="삭제">×</button>`:''}</td></tr>`).join('')}</tbody></table>${list.length>400?`<p class="pl-m">${list.length-400}개 더 — 검색으로 좁히세요.</p>`:''}`:'<p class="lead">표시할 부품이 없습니다. 승인 부품 목록(CSV/Excel)을 가져오거나, 설계 도우미에서 "U3를 AP2112K로 바꿔줘"처럼 교체를 요청하면 Claude 추정·API 결과가 여기에 쌓입니다.</p>'}</div>
    <p class="pl-m">CSV 열: ${PARTLIB.CSV_HEAD.join(' · ')} — Grade는 AEC-Q100 Grade 1 · Q200 · industrial 등, Temp는 -40~125, FIT는 공급사 고장률. Pins는 "1:VIN, 2:GND, 3:EN …" 또는 "VIN; GND; EN …". 같은 MPN은 승인 목록이 내장 DB·추정값보다 우선합니다.</p></div></div>`;}
async function openPartLib(){await plLoad();let m=$('#plDlg');if(!m){m=document.createElement('div');m.className='modal';m.id='plDlg';document.body.appendChild(m);plBind(m);}m.innerHTML=plDialogHTML();m.hidden=false;PL.open=true;const q=$('#plQ');if(q)q.focus();}
function plClose(){const m=$('#plDlg');if(m)m.hidden=true;PL.open=false;}
function plRender(){const m=$('#plDlg');if(!m||m.hidden)return;const act=document.activeElement;const isQ=act&&act.id==='plQ';const pos=isQ?act.selectionStart:0;m.innerHTML=plDialogHTML();if(isQ){const q=$('#plQ');q.focus();q.setSelectionRange(pos,pos);}}
function plBind(m){
  m.addEventListener('click',async e=>{if(e.target===m||e.target.closest('[data-close]')){plClose();return;}const t=e.target.closest('button');if(!t)return;const d=t.dataset;
    try{
      if(d.pltab){PL.tab=d.pltab;plRender();return;}
      if('plimp'in d){const files=await plPickFiles();if(!files.length)return;const r=await plImportFiles(files);toast(`부품 ${r.n}개 가져옴 — ${r.msg}`);plRender();return;}
      if('pltpl'in d){await expSave('parts_template.csv','﻿'+PARTLIB.toCsv([{mpn:'AP2112K-3.3TRG1',mfr:'Diodes Inc.',title:'LDO 600 mA 3.3 V',cat:'LDO',pkg:'SOT-23-5',fp:'SOT-23-5',val:'3.3V',pins:[{num:'1',name:'VIN'},{num:'2',name:'GND'},{num:'3',name:'EN'},{num:'4',name:'NC'},{num:'5',name:'VOUT'}],specs:[['입력 전압','2.5–6 V'],['출력 전류','600 mA']],price:0.12,pdf:'https://www.diodes.com/assets/Datasheets/AP2112.pdf',page:'',status:'approved',note:'예시 행 — 지우고 쓰세요'}]),'text/csv');return;}
      if('plexp'in d){const L=plAll().filter(p=>p.src!=='builtin');if(!L.length){toast('내보낼 부품이 없습니다.');return;}await expSave('parts_library.csv','﻿'+PARTLIB.toCsv(L),'text/csv');return;}
      if('plapi'in d){PL.apiOpen=!PL.apiOpen;plRender();return;}
      if('plsave'in d){PL.api_cfg={provider:$('#plProv').value,key:$('#plKey').value.trim(),url:$('#plUrl').value.trim()};plSaveCfg();toast('API 설정을 이 브라우저에 저장했습니다.');plRender();return;}
      if('pltest'in d){PL.api_cfg={provider:$('#plProv').value,key:$('#plKey').value.trim(),url:$('#plUrl').value.trim()};plSaveCfg();const q=prompt('조회할 부품 번호','AMS1117-3.3');if(!q)return;toast('조회 중…');const L=await plAskApi(q);toast(`${L.length}개: ${L.slice(0,3).map(p=>p.mpn).join(', ')}`);plRender();return;}
      if(d.plpromote){const p=plAll().find(x=>x.mpn===d.plpromote);if(!p||p.src==='user')return;const u=Object.assign({},p,{src:'user',status:'approved',conf:1,note:(p.note?p.note+' · ':'')+`${PL_SRC[p.src]}에서 승인`});PL.user.push(u);await plSave();plRender();return;}
      if(d.pldel){const L=d.src==='user'?PL.user:d.src==='ai'?PL.ai:PL.api;const i=L.findIndex(x=>x.mpn===d.pldel);if(i>=0)L.splice(i,1);await plSave();plRender();return;}
    }catch(err){console.error(err);toast(err.message||String(err));}});
  m.addEventListener('input',e=>{if(e.target.id==='plQ'){PL.q=e.target.value;plRender();}});
  m.addEventListener('keydown',e=>{if(e.key==='Escape')plClose();});}
/* ---- datasheet tab fallback: AI/API/user records get a generated page ---- */
function plDsPage(mpn){const p=plFind(mpn);if(!p||p.src==='builtin')return null;return{mpn:p.mpn,file:'',mfr:p.mfr,cat:p.cat,price:p.price,status:p.src==='ai'?'stub':'done',title:`${p.mpn} · ${p.title||''}`,html:PARTLIB.pageHTML(p,esc),gen:true};}
/* ---- CLI help lines (schematic console) ---- */
const PL_HELP=[['replace <부품> [<MPN|설명>]','부품 교체 — 승인 목록→내장 DB→Claude 추정→부품 API 순으로 찾고, 핀 대응을 확인한 뒤 회로도·보드·BOM·HSIS에 반영 (대화형)'],['parts lib','부품 라이브러리 창 (승인 목록 가져오기 · API 설정)']];
document.addEventListener('DOMContentLoaded',()=>{plLoad();const b=$('#plBtn');if(b)b.addEventListener('click',openPartLib);});
