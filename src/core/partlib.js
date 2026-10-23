/* Part library: the user's approved-parts list (CSV/Excel), the built-in PARTS database, parts Claude estimated and parts
   fetched from a distributor API — one lookup, one record shape — plus pin-function matching for part replacement.
   Record: {mpn, mfr, title, cat, pkg, fp, val, pins:[{num,name}], specs:[[k,v]], price, pdf, page, desc, src:'user'|'builtin'|'ai'|'api',
            status:'approved'|'preferred'|'obsolete'|'', conf:0..1, note} */
const PARTLIB=(function(){
"use strict";
const S=v=>v==null?'':String(v).trim();
const norm=s=>S(s).toUpperCase().replace(/[\s_\-\/.,()]/g,'');
/* ---------- table import (CSV / Excel rows) ---------- */
const HEAD={mpn:['mpn','part number','partnumber','part no','part_no','pn','부품번호','부품 번호','품번','manufacturer part number','mfr part number','mfg p/n','제조사 품번'],
  mfr:['manufacturer','mfr','mfg','vendor','maker','제조사','제조업체','메이커'],
  title:['title','name','part name','부품명','품명','description','desc','설명'],
  cat:['category','cat','type','분류','종류','카테고리'],
  pkg:['package','pkg','case','패키지','케이스'],
  fp:['footprint','fp','land pattern','풋프린트','풋프린트명'],
  val:['value','val','값','정격','사양값'],
  pins:['pins','pin','pinout','pin names','핀','핀 이름','핀배열','핀 배열'],
  price:['price','unit price','cost','단가','가격','참고 단가','usd'],
  pdf:['datasheet','datasheet url','pdf','데이터시트','데이터시트 링크'],
  page:['url','link','product page','제품 페이지','링크'],
  status:['status','approval','approved','승인','상태'],
  note:['note','notes','remark','비고','메모'],
  specs:['specs','spec','specification','사양','주요 사양'],
  grade:['grade','aec','aec-q100','aec-q200','qualification','qual','등급','자격','차량용','automotive'],temp:['temp','temperature','operating temperature','동작 온도','동작온도','온도 범위','온도'],
  asil:['asil','asil ready','safety','기능 안전','기능안전','safeassure'],fit:['fit','failure rate','고장률','λ','lambda']};
const hkey=h=>{const k=S(h).toLowerCase().replace(/[*:]/g,'').trim();for(const f in HEAD)if(HEAD[f].includes(k))return f;for(const f in HEAD)if(HEAD[f].some(a=>k.startsWith(a)||k.endsWith(a)))return f;return null;};
/* qualification grade: 'Q100-0' | 'Q100-1' | 'Q100-2' | 'Q100-3' | 'Q200' | 'Q101' | 'industrial' | 'commercial' | '' */
function gradeOf(txt){const t=S(txt).toUpperCase().replace(/\s+/g,'');if(!t)return'';let m;
  if((m=t.match(/Q100[-_]?(?:GRADE)?[-_]?([0-3])/)))return'Q100-'+m[1];if(/Q100/.test(t))return'Q100-1';if(/Q101/.test(t))return'Q101';if(/Q200/.test(t))return'Q200';
  if(/AEC|AUTOMOTIVE|차량|자동차|-Q1\b|QDBV|Q1$/.test(t))return'Q100-1';if(/^(RC|RL|AC|RT)0(402|603|805)|^(RC|RL)1206|^GCM|^CGA|^GCJ/.test(t))return'Q200';if(/^6130\d{7}|^EEE-?FK|^EEE-?FP/.test(t))return'industrial';if(/INDUSTRIAL|산업|-40~85|-40TO85|-40\/85/.test(t))return'industrial';if(/COMMERCIAL|상용|CONSUMER|0~70|0TO70/.test(t))return'commercial';return'';}
/* temperature range text → [min,max] */
function tempOf(txt){const m=S(txt).replace(/°/g,'').match(/(-?\d+)\s*(?:~|to|–|-|\.\.)\s*\+?(\d+)/i);return m?[+m[1],+m[2]]:null;}
const GRADE_LABEL={'Q100-0':'AEC-Q100 Grade 0 (-40~150)','Q100-1':'AEC-Q100 Grade 1 (-40~125)','Q100-2':'AEC-Q100 Grade 2 (-40~105)','Q100-3':'AEC-Q100 Grade 3 (-40~85)','Q101':'AEC-Q101 (디스크리트)','Q200':'AEC-Q200 (수동)',industrial:'산업용',commercial:'상용'};
const gradeAuto=g=>/^Q(100|101|200)/.test(g||'');
/* pins text: "1:VIN,2:GND,3:EN,4:NC,5:VOUT" · "VIN;GND;EN;NC;VOUT" (numbered 1..n) · "1=VIN 2=GND" */
function parsePins(txt){const t=S(txt);if(!t)return[];const parts=t.split(/[;,\n|]+/).map(x=>x.trim()).filter(Boolean);const out=[];
  parts.forEach((p,i)=>{const m=p.match(/^([A-Za-z0-9]+)\s*[:=]\s*(.+)$/);if(m)out.push({num:m[1],name:m[2].trim()});else out.push({num:String(i+1),name:p});});return out;}
function parseSpecs(txt){const t=S(txt);if(!t)return[];return t.split(/[;\n|]+/).map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.search(/[:=]/);return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:['사양',x];});}
function parseTable(aoa){if(!aoa||!aoa.length)return{parts:[],cols:{},skipped:0};
  let hi=aoa.findIndex(r=>r&&r.some(c=>hkey(c)==='mpn'));if(hi<0)hi=0;const head=aoa[hi]||[];const cols={};head.forEach((h,i)=>{const k=hkey(h);if(k&&cols[k]==null)cols[k]=i;});
  if(cols.mpn==null)return{parts:[],cols,skipped:aoa.length,error:'MPN(부품 번호) 열을 찾지 못했습니다. 머리글에 MPN · Part Number · 부품번호 중 하나가 있어야 합니다.'};
  const parts=[];let skipped=0;const g=(r,k)=>cols[k]!=null?S(r[cols[k]]):'';
  for(let i=hi+1;i<aoa.length;i++){const r=aoa[i];if(!r||!g(r,'mpn')){skipped++;continue;}
    const p={mpn:g(r,'mpn'),mfr:g(r,'mfr'),title:g(r,'title'),cat:g(r,'cat'),pkg:g(r,'pkg'),fp:g(r,'fp'),val:g(r,'val'),pins:parsePins(g(r,'pins')),specs:parseSpecs(g(r,'specs')),
      price:(()=>{const v=g(r,'price').replace(/[^0-9.]/g,'');return v?+v:null;})(),pdf:g(r,'pdf'),page:g(r,'page'),desc:g(r,'title'),src:'user',status:statusOf(g(r,'status')),conf:1,note:g(r,'note'),
      grade:gradeOf(g(r,'grade')||g(r,'mpn')),temp:tempOf(g(r,'temp')),asil:g(r,'asil'),fitv:(()=>{const v=parseFloat(g(r,'fit'));return isFinite(v)?v:null;})()};
    if(!p.pkg&&p.fp)p.pkg=p.fp;parts.push(p);}
  return{parts,cols,skipped};}
function statusOf(s){s=S(s).toLowerCase();if(!s)return'approved';if(/obso|단종|금지|nrnd|disc/.test(s))return'obsolete';if(/pref|우선|권장/.test(s))return'preferred';if(/^(y|yes|ok|approved|승인|사용|true|1)$/.test(s))return'approved';return s;}
/* a CSV template and the export of a list */
const CSV_HEAD=['MPN','Manufacturer','Title','Category','Package','Footprint','Value','Pins','Specs','Price','Datasheet','URL','Status','Note','Grade','Temp','ASIL','FIT'];
function toAoa(parts){return[CSV_HEAD.slice(),...parts.map(p=>[p.mpn,p.mfr||'',p.title||p.desc||'',p.cat||'',p.pkg||'',p.fp||'',p.val||'',(p.pins||[]).map(x=>`${x.num}:${x.name}`).join(', '),(p.specs||[]).map(x=>`${x[0]}: ${x[1]}`).join('; '),p.price!=null?p.price:'',p.pdf||'',p.page||'',p.status||'',p.note||'',p.grade||'',p.temp?`${p.temp[0]}~${p.temp[1]}`:'',p.asil||'',p.fitv!=null?p.fitv:''])];}
function toCsv(parts){const q=v=>{v=v==null?'':String(v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};return toAoa(parts).map(r=>r.map(q).join(',')).join('\n');}
function parseCsv(text){const rows=[];let row=[],cell='',q=false;const t=String(text||'').replace(/^﻿/,'');
  for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"')q=true;else if(c===','||c==='\t'){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows.filter(r=>r.some(c=>S(c)));}
/* ---------- built-in PARTS → records ---------- */
function fromBuiltin(PARTS,pinsOf){const P=PARTS&&PARTS.P||{};return Object.keys(P).map(mpn=>{const d=P[mpn];const pkg=(d.specs||[]).map(s=>s[1]).join(' ').match(/(UFQFPN\d+|TQFP-?\d+|SOT-?223|SOT-?23(?:-\d)?|SOIC-?\d+|HTSSOP-?\d+|TSSOP-?\d+|QFN-?\d+|0603|0805|1206|1210|SMA)/i);
  return{mpn,mfr:d.mfr||'',title:d.title||'',cat:d.cat||'',pkg:pkg?pkg[1]:'',fp:'',val:'',pins:(pinsOf&&pinsOf(mpn)||[]).length?pinsOf(mpn):(pinoutFor(mpn,'',null)||[]),specs:(d.specs||[]).map(s=>[s[0],s[1]]),price:PARTS.price?PARTS.price(mpn,d.cat):null,pdf:d.pdf||'',page:d.page||'',desc:d.title||'',src:'builtin',status:'',conf:1,therm:d.therm||null,grade:d.grade||'',temp:d.temp||null,asil:d.asil||'',fitv:d.fit!=null?d.fit:null};}).concat(AUTO_PARTS.map(p=>Object.assign({src:'builtin',status:'',conf:1,specs:[],pins:[],fp:'',val:'',desc:p.title},p)));}
/* ---------- lookup ---------- */
const ORDER={user:0,ds:1,builtin:2,kicad:2.5,ai:3,api:4};
/* one record per MPN (the most trusted source wins); a winner without pins takes the pins of the next source that has them
   (e.g. the built-in DB has specs and price, the KiCad symbol has the pinout) and says where they came from */
function merge(lists){const m=new Map(),pin=new Map();lists.flat().forEach(p=>{if(!p||!p.mpn)return;const k=norm(p.mpn);const cur=m.get(k);if(!cur||ORDER[p.src]<ORDER[cur.src])m.set(k,p);
    if(p.pins&&p.pins.length){const q=pin.get(k);if(!q||ORDER[p.src]<ORDER[q.src])pin.set(k,p);}});
  return[...m.entries()].map(([k,p])=>{if(p.pins&&p.pins.length)return p;const q=pin.get(k);return q?Object.assign({},p,{pins:q.pins,pinSrc:q.src,pinFrom:q.kicad||q.mpn,pinMatch:q.match||'',fp:p.fp||q.fp||'',pkg:p.pkg||q.pkg||'',pdf:p.pdf||q.pdf||''}):p;});}
/* bundled KiCad pin table (src/parts/kicadpins.js) → records */
function fromKpins(K){return Object.entries(K||{}).map(([mpn,r])=>({mpn,mfr:'',title:r.t||'',cat:'',pkg:r.pkg||'',fp:r.fp||'',val:'',pins:(r.p||[]).map(x=>({num:String(x[0]),name:String(x[1]||''),type:x[2]||''})),specs:[],price:null,pdf:r.pdf||'',page:'',desc:r.t||'',src:'kicad',kicad:r.k,lib:r.l,match:r.m,status:'',conf:r.m==='exact'?0.95:r.m==='prefix'?0.8:0.6}));}
function find(parts,mpn){const k=norm(mpn);if(!k)return null;return parts.find(p=>norm(p.mpn)===k)||parts.find(p=>norm(p.mpn).startsWith(k)||k.startsWith(norm(p.mpn)))||null;}
function search(parts,q){const t=S(q);if(!t)return[];const k=norm(t);const words=t.toLowerCase().split(/\s+/).filter(Boolean);
  const score=p=>{const pm=norm(p.mpn);let s=0;if(pm===k)s+=100;else if(pm.startsWith(k)||k.startsWith(pm))s+=60;else if(pm.includes(k))s+=40;
    const hay=[p.mpn,p.mfr,p.title,p.desc,p.cat,p.val,p.pkg].join(' ').toLowerCase();words.forEach(w=>{if(hay.includes(w))s+=10;});return s;};
  return parts.map(p=>({p,s:score(p)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||ORDER[a.p.src]-ORDER[b.p.src]).map(x=>x.p);}
/* ---------- pin-function matching ---------- */
const ROLES=[['VIN',/^(VIN|VI|IN|VCC_?IN|VDD_?IN|VBAT|VS|SUPPLY|V\+|PVIN|AVIN|VBUS)$/i],['VOUT',/^(VOUT|VO|OUT|OUTPUT|VCC_?OUT|SW|LX|PH)$/i],['GND',/^(GND|VSS|AGND|PGND|DGND|EP|PAD|EPAD|THERMAL|TAB|0V)$/i],['VCC',/^(VCC|VDD|AVDD|DVDD|VDDA|VDDIO|VREF|V3V3|3V3|5V|\+?\d+V\d*)$/i],
  ['EN',/^(EN|ENABLE|CE|SHDN|SHUTDOWN|ON\/?OFF|STBY|STANDBY|INH|PD|NSHDN|_?SHDN)$/i],['FB',/^(FB|ADJ|VSET|SENSE|FEEDBACK|VFB)$/i],['NC',/^(NC|N\.?C\.?|DNC|RESERVED|-)$/i],['PG',/^(PG|PGOOD|POK|POWER_?GOOD|RESET|NRST|RST)$/i],
  ['SDA',/^(SDA|SDI|DATA|DAT)$/i],['SCL',/^(SCL|SCK|CLK|CLOCK)$/i],['TX',/^(TX|TXD|DOUT|D\+|DP)$/i],['RX',/^(RX|RXD|DIN|D-|DM)$/i],['CS',/^(CS|NCS|SS|NSS|CSN)$/i],['MOSI',/^(MOSI|SDO|SI)$/i],['MISO',/^(MISO|SO)$/i],
  ['CANH',/^(CANH|CAN_?H|H)$/i],['CANL',/^(CANL|CAN_?L|L)$/i],['TXD',/^(TXD|D)$/i],['RXD',/^(RXD|R)$/i],['BYP',/^(BYP|BYPASS|NR|CBYP|SS|CSS)$/i],['BST',/^(BST|BOOT|BOOTSTRAP)$/i],['COMP',/^(COMP|ITH|CC)$/i],
  ['A',/^(A|ANODE|\+)$/i],['K',/^(K|C|CATHODE|-)$/i],['G',/^(G|GATE|B|BASE)$/i],['D',/^(D|DRAIN|C|COLLECTOR)$/i],['S',/^(S|SOURCE|E|EMITTER)$/i]];
function role(name){const n=S(name).replace(/^[~#!\/]/,'').replace(/\s+/g,'').toUpperCase();if(!n)return'';for(const[r,re]of ROLES)if(re.test(n))return r;const m=n.match(/^([A-Z]+)\d*$/);return m?m[1]:n;}
/* known pinouts for common parts whose records carry no pin names (built-in examples, API results) */
const PINOUTS=[[/^(AMS|LM|TLV|LD|NCP|AZ)1117|^LM317|^LD1117/i,'SOT-223',[['1','GND'],['2','VOUT'],['3','VIN'],['4','VOUT']]],
  [/^(AP2112|AP7361|MIC5219|TLV713|TLV733|TLV755|RT9193|XC6206.*5|ME6211|LP2985|AP2127)/i,'SOT-23-5',[['1','VIN'],['2','GND'],['3','EN'],['4','NC'],['5','VOUT']]],
  [/^(MCP1700|MCP1702|HT7333|HT7350|XC6206|ME6206)/i,'SOT-23',[['1','GND'],['2','VOUT'],['3','VIN']]],
  [/^(AO3400|AO3401|AO3402|SI2301|SI2302|2N7002|BSS138|IRLML|DMG|DMN|NTR)/i,'SOT-23',[['1','G'],['2','S'],['3','D']]],
  [/^(SS1[0-9]|SS2[0-9]|SS3[0-9]|B5819|1N58|MBR|SK[0-9]|US1|S1[A-M]$|RS1)/i,'SMA',[['1','K'],['2','A']]],
  [/^(TLE9251|TJA1051|TJA1042|MCP2551|MCP2562|SN65HVD23|TCAN33)/i,'SOIC-8',[['1','TXD'],['2','GND'],['3','VCC'],['4','RXD'],['5','VIO'],['6','CANL'],['7','CANH'],['8','STB']]]];
function pinoutFor(mpn,val,fp){const k=S(mpn)||S(val);for(const[re,pkg,pins]of PINOUTS){if(re.test(k)&&(!fp||!pkg||norm(fp).startsWith(norm(pkg))||norm(pkg).startsWith(norm(fp))))return pins.map(p=>({num:p[0],name:p[1]}));}return null;}
/* old pins [{num,name,net}] → new pins [{num,name}] : a proposal per old pin */
function mapPins(oldPins,newPins,mode){const used=new Set();const out=[];const np=newPins.map(p=>({num:S(p.num),name:S(p.name),role:role(p.name)}));
  const take=(p,to,how,conf)=>{if(to)used.add(to.num);out.push({from:p.num,name:p.name||'',net:p.net||null,to:to?to.num:null,toName:to?to.name:'',how,conf});};
  const byName=n=>np.find(q=>!used.has(q.num)&&q.name&&norm(q.name)===norm(n));
  const byRole=n=>{const r=role(n);if(!r||r==='NC')return null;return np.find(q=>!used.has(q.num)&&q.role===r);};
  const byNum=n=>np.find(q=>!used.has(q.num)&&q.num===S(n));
  // pass 1: exact names, pass 2: roles, pass 3: same number (only when the user asked for number mapping or the names are unknown)
  oldPins=oldPins.map(p=>p.name||!p.net?p:Object.assign({},p,{name:role(p.net)==='GND'?'GND':'',_fromNet:true}));
  const rest=[];oldPins.forEach(p=>{const t=p.name&&byName(p.name);if(t)take(p,t,'name',1);else rest.push(p);});
  const rest2=[];rest.forEach(p=>{const t=p.name&&byRole(p.name);if(t)take(p,t,'role',0.8);else rest2.push(p);});
  rest2.forEach(p=>{const t=(mode==='number'||!p.name||!newPins.some(q=>q.name))?byNum(p.num):null;
    if(t)take(p,t,'number',p.net?0.5:0.3);else take(p,null,'none',0);});
  // a second pin on a net that another pin already carries (e.g. the tab of an LDO) needs no target of its own
  out.forEach(m=>{if(!m.to&&m.net&&out.some(o=>o!==m&&o.to&&o.net===m.net)){m.how='merged';m.conf=1;}});
  const extra=np.filter(q=>!used.has(q.num)).map(q=>({num:q.num,name:q.name,role:q.role}));
  const open=out.filter(m=>!m.to&&m.net&&m.how!=='merged'&&role(m.name)!=='NC');
  return{map:out,extra,open,conf:out.length?Math.min(...out.filter(m=>m.net).map(m=>m.conf).concat([1])):1};}
/* ---------- the plan a replacement produces (for the card and the change request) ---------- */
function plan(oldc,part,pm,opt){opt=opt||{};const oldPins=(oldc.pads||[]).map(p=>({num:S(p.n),name:p.fn||'',net:p.net||null}));const newPins=part.pins&&part.pins.length?part.pins:oldPins.map(p=>({num:p.num,name:p.name}));
  const m=pm||mapPins(oldPins,newPins,opt.mode);const warn=[];
  if(!part.pins||!part.pins.length)warn.push('새 부품의 핀 이름을 몰라 핀 번호가 같다고 보고 옮깁니다.');
  if(newPins.length!==oldPins.length)warn.push(`핀 수가 다릅니다 (${oldPins.length} → ${newPins.length}).`);
  m.open.forEach(o=>warn.push(`${oldc.ref}.${o.from}${o.name?' ('+o.name+')':''}의 넷 ${o.net}이(가) 갈 핀이 없습니다.`));
  m.extra.filter(e=>e.role!=='NC'&&!(m.add||[]).some(x=>x.num===e.num)).forEach(e=>warn.push(`새 부품 핀 ${e.num}${e.name?' ('+e.name+')':''}은(는) 연결되지 않습니다.${e.role==='EN'?' EN은 보통 VIN에 묶습니다.':e.role==='GND'?' 접지 핀입니다.':''}`));
  (m.add||[]).forEach(x=>{if(x.net)warn.push(`새 부품 핀 ${x.num}${x.name?' ('+x.name+')':''} → ${x.net} (추가 연결)`);});
  const fpSame=!!part.fp&&part.fp===oldc.fp||!!part.pkg&&norm(part.pkg)===norm(oldc.fp);
  if(!fpSame)warn.push(`풋프린트가 바뀝니다 (${oldc.fp||'?'} → ${part.fp||part.pkg||'?'}) — 재배치·재배선이 필요합니다.`);
  if(part.src==='ai')warn.push('사양·핀·단가는 Claude 추정입니다. 데이터시트로 확인하세요.');
  return{map:m,warn,fpSame,price:{from:opt.oldPrice!=null?opt.oldPrice:null,to:part.price!=null?part.price:null}};}
/* ---------- Claude: estimate a part record ---------- */
function aiPrompt(q,ctx){ctx=ctx||{};return`You are an electronics component librarian. Produce a part record for the component below as JSON only.
Requested part: ${q}
${ctx.oldPart?`It will replace: ${ctx.oldPart} (pins: ${ctx.oldPins||'?'}) in a ${ctx.role||'circuit'} — keep the same function class unless the request says otherwise.`:''}
${ctx.hint?`Context: ${ctx.hint}`:''}
${ctx.web?`You have a web search tool: search for the manufacturer datasheet of this exact part number first and read the pinout table from it; set "pdf" to the datasheet URL you found and "conf" to 0.9+ only when the pins come from the datasheet. After searching, reply with the JSON object only (no citations, no prose).`:''}
Rules: use the manufacturer's pin numbering and pin names from the datasheet; list EVERY pin including NC and the exposed pad (name it EP); "pkg" is the package (e.g. SOT-23-5, SOIC-8, QFN-16 3x3, TQFP-64); "price" is a rough unit price in USD at ~1k pcs; "specs" are the 5-10 most important ratings as [name, value] pairs in Korean names with units; also give "grade" (AEC-Q100 Grade 0/1/2/3, AEC-Q200, AEC-Q101, industrial, commercial), "temp" as "-40~125", "asil" (e.g. "ASIL B ready / SafeAssure", or "") and "fit" (supplier FIT at 55 °C if published, else null); set "conf" 0..1 for how sure you are the part exists with this pinout; if the part number is ambiguous pick the most common variant and say so in "note" (Korean). Never invent a part that does not exist — if unknown, return {"error":"..."} in Korean.
JSON shape: {"mpn":"","mfr":"","title":"one line","cat":"LDO|DC-DC|MCU|MOSFET|diode|connector|passive|driver|transceiver|sensor|other","pkg":"","pins":[{"num":"1","name":"VIN"}],"specs":[["입력 전압","2.5–6 V"]],"price":0.12,"pdf":"https://...","page":"https://...","grade":"AEC-Q100 Grade 1","temp":"-40~125","asil":"","fit":null,"note":"","conf":0.9}`;}
function fromAi(o,q){if(!o||typeof o!=='object')return{error:'응답을 읽지 못했습니다.'};if(o.error)return{error:String(o.error)};
  const mpn=S(o.mpn)||S(q);if(!mpn)return{error:'부품 번호가 없습니다.'};
  return{mpn,mfr:S(o.mfr),title:S(o.title),cat:S(o.cat),pkg:S(o.pkg),fp:'',val:S(o.val)||'',pins:Array.isArray(o.pins)?o.pins.map((p,i)=>({num:S(p.num)||String(i+1),name:S(p.name)})).filter(p=>p.num):[],
    specs:Array.isArray(o.specs)?o.specs.filter(s=>Array.isArray(s)&&s.length>=2).map(s=>[S(s[0]),S(s[1])]):[],price:typeof o.price==='number'&&o.price>=0?o.price:(parseFloat(o.price)||null),
    pdf:S(o.pdf),page:S(o.page),desc:S(o.title),src:'ai',status:'',conf:typeof o.conf==='number'?Math.max(0,Math.min(1,o.conf)):0.5,note:S(o.note),at:Date.now(),
    grade:gradeOf(o.grade||''),temp:tempOf(o.temp||''),asil:S(o.asil),fitv:typeof o.fit==='number'?o.fit:(parseFloat(o.fit)||null)};}
/* ---------- distributor APIs (browser fetch; keys stay in the browser) ---------- */
const PROVIDERS={
  mouser:{name:'Mouser Search API',keyHelp:'mouser.com → My Account → API Keys (Search API)',cors:false,
    req:(key,q)=>({url:`https://api.mouser.com/api/v1/search/partnumber?apiKey=${encodeURIComponent(key)}`,init:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({SearchByPartRequest:{mousePartNumber:q,partSearchOptions:'None'}})}}),
    parse:j=>{const L=j&&j.SearchResults&&j.SearchResults.Parts||[];return L.map(p=>({mpn:S(p.ManufacturerPartNumber),mfr:S(p.Manufacturer),title:S(p.Description),cat:S(p.Category),pkg:'',fp:'',val:'',pins:[],specs:(p.ProductAttributes||[]).slice(0,10).map(a=>[S(a.AttributeName),S(a.AttributeValue)]),
      price:(()=>{const pb=(p.PriceBreaks||[]).slice().sort((a,b)=>b.Quantity-a.Quantity)[0];return pb?parseFloat(String(pb.Price).replace(/[^0-9.]/g,'')):null;})(),pdf:S(p.DataSheetUrl),page:S(p.ProductDetailUrl),desc:S(p.Description),src:'api',status:'',conf:1,note:`Mouser ${S(p.MouserPartNumber)} · 재고 ${S(p.Availability)}`,at:Date.now(),
      grade:gradeOf((p.ProductAttributes||[]).filter(a=>/qualif|automotive|aec/i.test(a.AttributeName||'')).map(a=>a.AttributeValue).join(' ')||p.ManufacturerPartNumber),temp:tempOf((p.ProductAttributes||[]).filter(a=>/temperature/i.test(a.AttributeName||'')).map(a=>a.AttributeValue).join(' ')),asil:'',fitv:null}));}},
  nexar:{name:'Nexar (Octopart) API',keyHelp:'nexar.com → Applications → Supply token (Bearer)',cors:true,
    req:(key,q)=>({url:'https://api.nexar.com/graphql',init:{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({query:`query($q:String!){supSearchMpn(q:$q,limit:5){results{part{mpn manufacturer{name} shortDescription category{name} bestDatasheet{url} specs{attribute{name} displayValue} medianPrice1000{price currency}}}}}`,variables:{q}})}}),
    parse:j=>{const R=j&&j.data&&j.data.supSearchMpn&&j.data.supSearchMpn.results||[];return R.map(r=>{const p=r.part||{};const pk=(p.specs||[]).find(s=>/case|package/i.test(s.attribute&&s.attribute.name||''));
      return{mpn:S(p.mpn),mfr:S(p.manufacturer&&p.manufacturer.name),title:S(p.shortDescription),cat:S(p.category&&p.category.name),pkg:pk?S(pk.displayValue):'',fp:'',val:'',pins:[],specs:(p.specs||[]).slice(0,10).map(s=>[S(s.attribute&&s.attribute.name),S(s.displayValue)]),
        price:p.medianPrice1000&&p.medianPrice1000.price!=null?+p.medianPrice1000.price:null,pdf:S(p.bestDatasheet&&p.bestDatasheet.url),page:'',desc:S(p.shortDescription),src:'api',status:'',conf:1,note:'Octopart/Nexar',at:Date.now(),
        grade:gradeOf((p.specs||[]).filter(s=>/qualif|automotive|aec/i.test(s.attribute&&s.attribute.name||'')).map(s=>s.displayValue).join(' ')||p.mpn),temp:tempOf((p.specs||[]).filter(s=>/temperature/i.test(s.attribute&&s.attribute.name||'')).map(s=>s.displayValue).join(' ')),asil:'',fitv:null};});}},
  custom:{name:'사내 부품 서버 (JSON)',keyHelp:'GET {url}?q=<MPN> 가 [{mpn,mfr,title,cat,pkg,pins:[{num,name}],specs:[[k,v]],price,pdf,page}] JSON을 돌려주는 주소',cors:true,
    req:(key,q,url)=>({url:String(url||'').replace(/\{q\}/,encodeURIComponent(q))+(/\{q\}/.test(url||'')?'':(url&&url.includes('?')?'&':'?')+'q='+encodeURIComponent(q)),init:{headers:key?{Authorization:'Bearer '+key}:{}}}),
    parse:j=>{const L=Array.isArray(j)?j:j&&(j.parts||j.results||j.items)||[];return L.map(p=>Object.assign(fromAi(p,p.mpn),{src:'api',conf:1,note:S(p.note)||'사내 부품 서버'}));}}};
/* HTML for a one-page datasheet summary of a record (used by the datasheet tab for AI/API/user parts) */
function pageHTML(p,esc){esc=esc||(s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));const srcName=({user:'승인 부품 목록',ds:'데이터시트 PDF',builtin:'내장 DB',kicad:'KiCad 심볼 라이브러리',ai:'Claude 추정',api:'부품 API'}[p.src]||p.src)+(p.src==='kicad'&&p.kicad?` (${p.lib?p.lib+':':''}${p.kicad}${p.match&&p.match!=='exact'?' · '+(p.match==='family'?'계열 일치 — 패키지 확인':'접두 일치'):''})`:'')+(p.pinSrc&&p.pinSrc!==p.src?` · 핀: ${p.pinSrc==='kicad'?'KiCad '+(p.pinFrom||''):p.pinSrc}${p.pinMatch==='family'?' (계열 일치 — 패키지 확인)':''}`:'');
  return`<h1>${esc(p.mpn)}</h1><p class="meta">${esc(p.mfr||'제조사 미상')}${p.cat?' · '+esc(p.cat):''}${p.pkg?' · '+esc(p.pkg):''}${p.title?' · '+esc(p.title):''}${p.price!=null?` · 참고 단가 약 $${(+p.price).toFixed(p.price<1?3:2)}`:''}</p>
<p class="meta">출처: ${esc(srcName)}${p.conf!=null&&p.src==='ai'?` (확신도 ${Math.round(p.conf*100)}%)`:''}${p.pdf?` · <a href="${esc(p.pdf)}" target="_blank" rel="noopener">데이터시트</a>`:''}${p.page?` · <a href="${esc(p.page)}" target="_blank" rel="noopener">제품 페이지</a>`:''} · <a href="https://octopart.com/search?q=${encodeURIComponent(p.mpn)}" target="_blank" rel="noopener">부품 검색 (Octopart)</a></p>
${p.src==='ai'?'<p class="todo">이 페이지는 Claude가 추정한 사양입니다. 실제 데이터시트와 대조한 뒤 승인 부품 목록에 넣으세요.</p>':''}${p.note?`<p class="meta">${esc(p.note)}</p>`:''}
${p.specs&&p.specs.length?`<h2>핵심 사양</h2><dl>${p.specs.map(s=>`<dt>${esc(s[0])}</dt><dd>${esc(s[1])}</dd>`).join('')}</dl>`:''}
${p.pins&&p.pins.length?`<h2>핀</h2><table><thead><tr><th>핀</th><th>이름</th><th>역할</th></tr></thead><tbody>${p.pins.map(x=>`<tr><td>${esc(x.num)}</td><td>${esc(x.name)}</td><td>${esc(role(x.name))}</td></tr>`).join('')}</tbody></table>`:''}`;}
/* ---------- automotive-qualified alternatives for the library's commercial parts ----------
   dropIn: same package and pinout (the replacement keeps nets as they are). FIT: supplier-published or typical estimates (55 °C). */
const AUTO_PARTS=[
  {mpn:'TPS3823-33QDBVRQ1',mfr:'Texas Instruments',title:'TPS3823-Q1 — 전원 감시 + 워치독, SOT-23-5',cat:'감시',pkg:'SOT-23-5',grade:'Q100-1',temp:[-40,125],asil:'',fitv:2,price:0.95,pdf:'https://www.ti.com/lit/ds/symlink/tps3823-q1.pdf',page:'https://www.ti.com/product/TPS3823-Q1',pins:[{num:'1',name:'RESET'},{num:'2',name:'VDD'},{num:'3',name:'GND'},{num:'4',name:'MR'},{num:'5',name:'WDI'}]},
  {mpn:'TLV1117LV33QDCYRQ1',mfr:'Texas Instruments',title:'TLV1117LV-Q1 — 1 A LDO 3.3 V, SOT-223 (AMS1117 핀 호환)',cat:'LDO',pkg:'SOT-223',grade:'Q100-1',temp:[-40,125],asil:'',fitv:3,price:0.62,pdf:'https://www.ti.com/lit/ds/symlink/tlv1117lv-q1.pdf',page:'https://www.ti.com/product/TLV1117LV-Q1',pins:[{num:'1',name:'GND'},{num:'2',name:'VOUT'},{num:'3',name:'VIN'},{num:'4',name:'VOUT'}]},
  {mpn:'TLV1117LV50QDCYRQ1',mfr:'Texas Instruments',title:'TLV1117LV-Q1 — 1 A LDO 5.0 V, SOT-223',cat:'LDO',pkg:'SOT-223',grade:'Q100-1',temp:[-40,125],asil:'',fitv:3,price:0.62,pdf:'https://www.ti.com/lit/ds/symlink/tlv1117lv-q1.pdf',page:'https://www.ti.com/product/TLV1117LV-Q1',pins:[{num:'1',name:'GND'},{num:'2',name:'VOUT'},{num:'3',name:'VIN'},{num:'4',name:'VOUT'}]},
  {mpn:'NVTR4502NT1G',mfr:'onsemi',title:'NVTR4502N — 30 V N-ch MOSFET, SOT-23 (AEC-Q101)',cat:'MOSFET',pkg:'SOT-23',grade:'Q101',temp:[-55,150],fitv:2,price:0.21,pdf:'https://www.onsemi.com/pdf/datasheet/ntr4502n-d.pdf',page:'https://www.onsemi.com/products/discrete-power-modules/mosfets/nvtr4502n',pins:[{num:'1',name:'G'},{num:'2',name:'S'},{num:'3',name:'D'}]},
  {mpn:'DMP2035UQ-7',mfr:'Diodes Incorporated',title:'DMP2035UQ — 20 V P-ch MOSFET, SOT-23 (AEC-Q101)',cat:'MOSFET',pkg:'SOT-23',grade:'Q101',temp:[-55,150],fitv:2,price:0.24,pdf:'https://www.diodes.com/assets/Datasheets/DMP2035UQ.pdf',page:'https://www.diodes.com/part/view/DMP2035UQ',pins:[{num:'1',name:'G'},{num:'2',name:'S'},{num:'3',name:'D'}]},
  {mpn:'NRVB140SFT1G',mfr:'onsemi',title:'NRVB140SF — 40 V 1 A 쇼트키, SMA/SOD-123FL (AEC-Q101)',cat:'다이오드',pkg:'SMA',grade:'Q101',temp:[-55,150],fitv:1,price:0.18,pdf:'https://www.onsemi.com/pdf/datasheet/nrvb140sf-d.pdf',page:'https://www.onsemi.com/products/discrete-power-modules/schottky-diodes-schottky-rectifiers/nrvb140sf',pins:[{num:'1',name:'K'},{num:'2',name:'A'}]},
  {mpn:'SMAJ15A-Q',mfr:'Littelfuse',title:'SMAJ15A-Q — 400 W TVS 15 V, SMA (AEC-Q101)',cat:'TVS',pkg:'SMA',grade:'Q101',temp:[-55,150],fitv:1,price:0.14,pdf:'https://www.littelfuse.com/media?resourcetype=datasheets&itemid=15a39e18-3d84-4a5e-9f46-7d5f1a2e8f1e&filename=littelfuse_tvs_diode_smaj_datasheet.pdf',page:'https://www.littelfuse.com/products/tvs-diodes/surface-mount/smaj',pins:[{num:'1',name:'K'},{num:'2',name:'A'}]},
  {mpn:'GCM188R71H104KA57D',mfr:'Murata',title:'GCM — 100 nF 50 V X7R 0603 (AEC-Q200)',cat:'커패시터',pkg:'0603',val:'100nF',grade:'Q200',temp:[-55,125],fitv:0.3,price:0.02,page:'https://www.murata.com/products/productdetail?partno=GCM188R71H104KA57%23'},
  {mpn:'GCM21BR71A106KE22L',mfr:'Murata',title:'GCM — 10 µF 10 V X7R 0805 (AEC-Q200)',cat:'커패시터',pkg:'0805',val:'10µF',grade:'Q200',temp:[-55,125],fitv:0.5,price:0.08,page:'https://www.murata.com/products/productdetail?partno=GCM21BR71A106KE22%23'},
  {mpn:'TPS54331QDRQ1',mfr:'Texas Instruments',title:'TPS54331-Q1 — 3 A 28 V 벅 컨버터, SOIC-8 (TPS54331 핀 호환)',cat:'DC-DC',pkg:'SOIC-8',grade:'Q100-1',temp:[-40,125],fitv:6,price:1.45,pdf:'https://www.ti.com/lit/ds/symlink/tps54331-q1.pdf',page:'https://www.ti.com/product/TPS54331-Q1',pins:[{num:'1',name:'BOOT'},{num:'2',name:'VIN'},{num:'3',name:'EN'},{num:'4',name:'SS'},{num:'5',name:'VSENSE'},{num:'6',name:'COMP'},{num:'7',name:'GND'},{num:'8',name:'PH'}]},
  {mpn:'GCM32ER71E226KE15L',mfr:'Murata',title:'GCM — 22 µF 25 V X7R 1210 (AEC-Q200)',cat:'커패시터',pkg:'1210',val:'22µF',grade:'Q200',temp:[-55,125],fitv:0.5,price:0.25,page:'https://www.murata.com/products/productdetail?partno=GCM32ER71E226KE15%23'},
  {mpn:'GCM188R71C474KA55D',mfr:'Murata',title:'GCM — 470 nF 16 V X7R 0603 (AEC-Q200)',cat:'커패시터',pkg:'0603',val:'470nF',grade:'Q200',temp:[-55,125],fitv:0.3,price:0.03,page:'https://www.murata.com/products/productdetail?partno=GCM188R71C474KA55%23'},
  {mpn:'TLE9251VSJ',mfr:'Infineon',title:'TLE9251V — CAN FD 트랜시버 (AEC-Q100)',cat:'트랜시버',pkg:'SOIC-8',grade:'Q100-1',temp:[-40,150],fitv:5,price:1.15,page:'https://www.infineon.com/cms/en/product/transceivers/automotive-transceiver/automotive-can-transceivers/tle9251v/'}];
/* commercial MPN → automotive drop-in (same package & pinout) */
const AUTO_ALT={'TPS3823-33':'TPS3823-33QDBVRQ1','TPS3823DBVR':'TPS3823-33QDBVRQ1','AMS1117-3.3':'TLV1117LV33QDCYRQ1','AMS1117-5.0':'TLV1117LV50QDCYRQ1','AO3400A':'NVTR4502NT1G','AO3401A':'DMP2035UQ-7','SS14':'NRVB140SFT1G','SMAJ15A':'SMAJ15A-Q','CL10B104KB8NNNC':'GCM188R71H104KA57D','CL21A106KAYNNNE':'GCM21BR71A106KE22L','TPS54331DR':'TPS54331QDRQ1','GRM32ER61E226KE15':'GCM32ER71E226KE15L','GRM188R71C474KA88D':'GCM188R71C474KA55D'};
/* not drop-in: a different family that would need the replace flow */
const AUTO_HINT={'STM32F042K6U6':'STM32F042에는 차량용(-Q) 변형이 없습니다 — S32K118(NXP, ASIL B) 또는 STM32 Automotive(SPC58)·AURIX TC3xx로 교체(핀 대응 필요)','DRV8313PWPR':'DRV8313은 상용 — DRV8313-Q1(동일 패키지 HTSSOP-28, 핀 호환) 검토','W25Q32JVSSIQ':'W25Q32JV 상용 — W25Q32JVSSIQ-Q(AEC-Q100 Grade 1 변형, 핀 호환) 검토'};
function autoAlt(mpn){const k=norm(mpn);const hit=Object.keys(AUTO_ALT).find(x=>norm(x)===k||k.startsWith(norm(x)));if(hit)return{mpn:AUTO_ALT[hit],dropIn:true,rec:AUTO_PARTS.find(p=>p.mpn===AUTO_ALT[hit])||null};const h=Object.keys(AUTO_HINT).find(x=>norm(x)===k||k.startsWith(norm(x)));if(h)return{mpn:null,dropIn:false,hint:AUTO_HINT[h]};return null;}
/* required grade per ASIL: A/B → AEC-Q100 Grade 1 (ICs) / Q101 / Q200, C/D → the same plus a safety-ready MCU/SBC note */
function requiredGrade(level){const l=String(level||'QM').toUpperCase();if(l==='QM')return null;return{ic:'Q100-1',discrete:'Q101',passive:'Q200',tempMin:-40,tempMax:125,label:l==='A'||l==='B'?'AEC-Q100 Grade 1 / Q101 / Q200':'AEC-Q100 Grade 1 / Q101 / Q200 + ASIL-ready MCU·SBC'};}
function gradeOk(rec,kind,level){const req=requiredGrade(level);if(!req)return true;const g=rec&&rec.grade||'';if(kind==='passive')return g==='Q200'||/^Q100/.test(g);if(kind==='discrete')return g==='Q101'||/^Q100/.test(g)||g==='Q200';const m=g.match(/^Q100-(\d)/);return!!m&&+m[1]<=1;}
return{fromKpins,parseTable,parseCsv,parsePins,parseSpecs,toAoa,toCsv,fromBuiltin,merge,find,search,role,mapPins,plan,aiPrompt,fromAi,PROVIDERS,pageHTML,norm,CSV_HEAD,pinoutFor,PINOUTS,gradeOf,tempOf,GRADE_LABEL,gradeAuto,AUTO_PARTS,AUTO_ALT,autoAlt,gradeOk,requiredGrade};
})();
if(typeof module!=='undefined')module.exports=PARTLIB;
