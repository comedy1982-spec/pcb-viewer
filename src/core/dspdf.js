/* ---------- datasheet PDF → pin table (DSPDF) ----------
   Pure text parser: takes the text of a datasheet (pdf.js text items with x/y per page, or plain text) and finds the
   pin table — "Pin Configuration / Pin Description / Terminal Functions / 핀 설명" sections whose rows start with a pin
   number (1, 2 … or A1, B3 for BGA) followed by a pin name (VIN, nRESET, GPIO_1, VCC/VIN …). Multi-package tables
   ("1 2 VIN …" = SOIC / TSSOP columns) give one candidate per column; the caller picks by package or pin count.
   The result is a part record ({mpn, pkg, pins:[{num,name}], conf, notes, candidates}) for the part library. */
const DSPDF=(()=>{
const S=v=>v==null?'':String(v).trim();
const HEAD_RE=/pin\s*(configuration|description|function|assignment|definition|out|list|table)|terminal\s*functions?|pinout|pin\s*names?|핀\s*(설명|배치|기능|구성)|ピン|signal\s*description/i;
const STOP_RE=/absolute\s*maximum|electrical\s*characteristics|recommended\s*operating|typical\s*(application|characteristics)|package\s*(outline|dimension)|ordering\s*information|mechanical\s*data|functional\s*block|detailed\s*description|specifications?$/i;
const NAME_RE=/^[A-Za-z~#!\/][A-Za-z0-9_\/\-\.#~+]{0,19}$/;
const NUM_RE=/^(\d{1,3}|[A-Z]{1,2}\d{1,2})$/;
const WORDS=/^(pin|pins|no|number|name|type|description|function|functions|i\/o|io|in|out|input|output|power|ground|supply|and|or|the|of|to|for|with|a|an|is|are|this|that|see|note|notes|n\.c\.|table|figure|page|rev|type|symbol|terminal|signal|package|soic|tssop|qfn|dfn|sot|bga|lqfp|tqfp|qfp|wson|msop|vqfn|htssop|ssop|pdip|dip|pwp|rgt|rsa|dgk|dbv|ddc|pw|d|n|ja|ta|tj|pcb|max|min|typ|unit|v|a|ma|ua|mhz|khz|hz|ms|us|ns|ohm|w|mw|c|k|µa|°c|–|-)$/i;
const PKG_RE=/\b(\d{1,3})-(pin|lead|pins|leads|ball|balls|terminal)s?\b|\b(SOIC|TSSOP|HTSSOP|SSOP|QFN|VQFN|WQFN|DFN|WSON|SON|LQFP|TQFP|QFP|BGA|FBGA|LFBGA|TFBGA|MSOP|SOT-?23|SOT-?223|TO-?220|TO-?252|TO-?263|PDIP|DIP|PQFN|HSOP|PowerPAD|PW|RGT|RSA|DGK|DBV|DDC|QFP)[\s\-(]*(\d{1,3})?\)?/i;
/* text items → lines per page: items with |Δy| ≤ tol are one line, sorted by x */
function linesOf(page,tol){tol=tol||2.5;if(typeof page==='string')return page.split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  const it=(page||[]).filter(t=>S(t.str)).map(t=>({s:S(t.str),x:+t.x||0,y:+t.y||0})).sort((a,b)=>b.y-a.y||a.x-b.x);const out=[];let cur=null;
  for(const t of it){if(cur&&Math.abs(cur.y-t.y)<=tol){cur.it.push(t);}else{cur={y:t.y,it:[t]};out.push(cur);}}
  return out.map(l=>l.it.sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);}
/* one row: leading pin numbers (one per package column) then a pin name, or name then numbers */
function row(line){const tk=line.split(/\s+/);let i=0;const nums=[];
  while(i<tk.length&&NUM_RE.test(tk[i])&&nums.length<6){nums.push(tk[i].toUpperCase());i++;}
  if(nums.length){const nm=tk[i];if(nm&&NAME_RE.test(nm)&&!WORDS.test(nm)&&/[A-Za-z]/.test(nm)){const extra=[];let j=i+1;while(j<tk.length&&NAME_RE.test(tk[j])&&!WORDS.test(tk[j])&&/^[A-Z0-9_\/~#]+$/.test(tk[j])&&extra.length<2){extra.push(tk[j]);j++;}
      return{nums,name:nm.replace(/[,;]$/,''),alt:extra,desc:tk.slice(j).join(' ')};}
    return null;}
  // name first: VIN 1 2 Input voltage
  const nm=tk[0];if(nm&&NAME_RE.test(nm)&&!WORDS.test(nm)&&/[A-Za-z]/.test(nm)){let j=1;while(j<tk.length&&NUM_RE.test(tk[j])&&nums.length<6){nums.push(tk[j].toUpperCase());j++;}if(nums.length&&/^\d+$/.test(nums[0]))return{nums,name:nm,alt:[],desc:tk.slice(j).join(' '),nameFirst:true};}
  return null;}
/* find pin-table blocks: a run of rows (≥4) after a heading, until a stop heading or a long gap */
function tables(pages){const out=[];let inSec=false;let cur=null;const push=()=>{if(cur&&cur.rows.length>=4)out.push(cur);cur=null;};
  pages.forEach((pg,pi)=>{const L=linesOf(pg);let gap=0;const prev=[];for(const line of L){
    if(STOP_RE.test(line)&&!HEAD_RE.test(line)){push();inSec=false;continue;}
    if(HEAD_RE.test(line)){inSec=true;if(cur&&cur.rows.length<4)cur=null;if(!cur)cur={page:pi+1,head:line,rows:[],heads:[]};gap=0;continue;}
    const r=row(line);if(r){if(!cur)cur={page:pi+1,head:inSec?'':'(표 머리 없음)',rows:[],heads:[]};if(!cur.rows.length)cur.heads=prev.slice(-3);cur.rows.push(r);gap=0;}else{prev.push(line);if(prev.length>3)prev.shift();gap++;if(cur&&gap>12)push();}}
    if(cur&&cur.rows.length>=4&&!inSec)push();});
  push();return out;}
/* a table → candidates (one per number column), deduplicated, ordered by pin number */
const PKG_TOK=/\b(SOIC|TSSOP|HTSSOP|SSOP|QFN|VQFN|WQFN|DFN|WSON|SON|LQFP|TQFP|QFP|BGA|FBGA|MSOP|SOT-?23|SOT-?223|TO-?220|TO-?252|TO-?263|PDIP|DIP|PQFN|HSOP|PW|RGT|RSA|DGK|DBV|DDC|D|N|PWP|RHB|RTE|RGE)\b/gi;
function candidates(t){const nc=Math.max(...t.rows.map(r=>r.nums.length));const out=[];const colPkgs=nc>1?((t.heads||[]).concat([t.head]).join(' ').match(PKG_TOK)||[]).map(x=>x.toUpperCase()):[];
  for(let c=0;c<nc;c++){const m=new Map();for(const r of t.rows){const n=r.nums[c];if(!n||n==='0')continue;if(!m.has(n))m.set(n,{num:n,name:r.name,alt:r.alt,desc:r.desc});}
    const pins=[...m.values()].sort((a,b)=>cmpNum(a.num,b.num));if(pins.length>=4)out.push({col:c,pins,page:t.page,head:t.head,pkg:colPkgs[c]||''});}
  return out;}
function cmpNum(a,b){const na=/^\d+$/.test(a),nb=/^\d+$/.test(b);if(na&&nb)return a-b;if(na!==nb)return na?-1:1;return a.localeCompare(b,undefined,{numeric:true});}
/* package names / pin counts on the first pages */
function packages(pages){const found=[];pages.slice(0,4).forEach(pg=>{for(const line of linesOf(pg)){const m=line.match(PKG_RE);if(m){const n=+(m[1]||m[4])||null;const nm=(m[3]||'').toUpperCase();found.push({pkg:nm,n,line:line.slice(0,80)});}}});return found;}
function title(pages,mpn){const L=linesOf(pages[0]||'').slice(0,25);const k=S(mpn).toUpperCase().replace(/[\s\-_]/g,'');
  const hit=L.find(l=>l.toUpperCase().replace(/[\s\-_]/g,'').includes(k.slice(0,Math.min(8,k.length))));const desc=L.find(l=>l.length>12&&l.length<90&&!/^\s*(www|http|rev|copyright|©|\d)/i.test(l)&&/[a-z]/.test(l)&&!/datasheet|data sheet/i.test(l)&&l!==hit);
  return{line:hit||'',desc:desc||''};}
/* quality: contiguity of numbers, known rail names, no duplicates */
function score(c){const nums=c.pins.map(p=>p.num).filter(n=>/^\d+$/.test(n)).map(Number);let contig=0;if(nums.length){const mx=Math.max(...nums);contig=Math.min(1,nums.length/mx);}
  const rails=c.pins.filter(p=>/^(V(CC|DD|IN|S|BAT|REF|OUT|DDA|SSA)|GND|VSS|AGND|PGND|EP|PAD|NC)/i.test(p.name)).length;const named=c.pins.filter(p=>/[A-Za-z]/.test(p.name)).length/c.pins.length;
  return Math.round(100*(0.45*contig+0.35*named+0.2*Math.min(1,rails/3)));}
/* main entry */
function parse(pages,opt){opt=opt||{};pages=Array.isArray(pages)?pages:[pages];const T=tables(pages);const all=T.flatMap(candidates).map(c=>Object.assign(c,{score:score(c)}));
  const want=opt.pkg?S(opt.pkg).toUpperCase():'';const pk=packages(pages);const notes=[];
  let best=all.slice().sort((a,b)=>b.score-a.score||b.pins.length-a.pins.length)[0]||null;
  if(opt.npins){const m=all.filter(c=>c.pins.length===+opt.npins).sort((a,b)=>b.score-a.score)[0];if(m)best=m;else notes.push(`핀 수 ${opt.npins}인 표가 없어 가장 그럴듯한 표를 썼습니다`);}
  if(want){const m=all.filter(c=>c.pkg&&(want.startsWith(c.pkg.replace(/-/g,''))||c.pkg.replace(/-/g,'').startsWith(want.replace(/-/g,'').slice(0,4)))).sort((a,b)=>b.score-a.score)[0];if(m)best=m;}
  if(want&&!(best&&best.pkg)&&pk.length){const hit=pk.find(p=>p.pkg&&want.startsWith(p.pkg.replace(/-/g,'')));if(hit&&hit.n){const m=all.filter(c=>c.pins.length===hit.n).sort((a,b)=>b.score-a.score)[0];if(m)best=m;}}
  const ti=title(pages,opt.mpn);const pkg=best?best.pkg||(pk.find(p=>p.n===best.pins.length)||{}).pkg||(pk[0]||{}).pkg||'':'';
  const pins=best?best.pins.map(p=>({num:p.num,name:cleanName(p.name),desc:p.desc||''})):[];
  const conf=best?Math.min(0.95,best.score/100*(T.length?1:0.8)):0;
  if(!best)notes.push('핀 표를 찾지 못했습니다 — 스캔 PDF(이미지)이거나 표가 그림입니다');
  if(all.length>1)notes.push(`핀 표 후보 ${all.length}개 (${all.map(c=>c.pins.length+'핀').join(' · ')}) — 패키지에 맞는 것을 고르세요`);
  return{mpn:S(opt.mpn)||'',title:ti.desc||ti.line||'',pkg,npins:pins.length,pins,conf,notes,candidates:all.map(c=>({page:c.page,head:c.head,pkg:c.pkg,n:c.pins.length,score:c.score,pins:c.pins.map(p=>({num:p.num,name:cleanName(p.name),desc:p.desc||''}))})),packages:pk,tables:T.length};}
function cleanName(n){return S(n).replace(/[,;:]+$/,'').replace(/^\/(?=[A-Z])/,'n').replace(/^#/,'n').replace(/^~/,'n');}
/* text of the pin-table pages only — what we hand to Claude when the rules are unsure */
function sectionText(pages,maxChars){maxChars=maxChars||9000;const T=tables(pages);const pg=[...new Set(T.map(t=>t.page))];const txt=(pg.length?pg:[1,2,3]).map(p=>`--- page ${p} ---\n`+linesOf(pages[p-1]||'').join('\n')).join('\n');return txt.slice(0,maxChars);}
function aiPrompt(mpn,text,hint){return`You are an electronics component librarian. Below is text extracted from the datasheet PDF of ${mpn||'a part'}${hint?' ('+hint+')':''}. Find the pin table and answer with JSON only:
{"mpn":"…","title":"one-line description","pkg":"package name","pins":[{"num":"1","name":"VIN","desc":"short function"},…],"conf":0.0-1.0,"note":"which table/page you used; say if several packages exist"}
Rules: one entry per pin number of ONE package (the ${hint||'most common'} one); keep the datasheet's pin names (VIN, nRESET, GPIO1 — write active-low as nNAME); numbers as strings (BGA like "A1"); include the exposed pad as "EP" when the table lists it; conf below 0.5 if the table is unclear.\n\n${text}`;}
function fromAi(o,mpn){if(!o||typeof o!=='object'||!Array.isArray(o.pins))return null;const pins=o.pins.map(p=>({num:S(p.num),name:cleanName(p.name),desc:S(p.desc)})).filter(p=>p.num&&p.name);if(pins.length<2)return null;
  return{mpn:S(o.mpn)||S(mpn),title:S(o.title),pkg:S(o.pkg),npins:pins.length,pins,conf:Math.max(0,Math.min(1,+o.conf||0.6)),notes:[S(o.note)].filter(Boolean),candidates:[],ai:true};}
/* record for PARTLIB (src 'ds' = from a datasheet file) */
function record(r,file){return{mpn:r.mpn,mfr:r.mfr||'',title:r.title||'',cat:'',pkg:r.pkg||'',fp:r.fp||'',val:r.mpn,pins:r.pins.map(p=>({num:p.num,name:p.name})),specs:[],price:null,pdf:'',url:'',status:'approved',note:`데이터시트 PDF 추출${file?' ('+file+')':''}${r.ai?' · Claude 판독':''} · 확신도 ${Math.round(r.conf*100)}%`,src:'ds',conf:r.conf};}
function text(r){if(!r.pins.length)return`${r.mpn||'?'}: 핀 표 없음 — ${r.notes.join(' · ')}`;
  return`${r.mpn||'?'}${r.title?' — '+r.title:''}${r.pkg?' · '+r.pkg:''} · ${r.npins}핀 (확신도 ${Math.round(r.conf*100)}%)\n`+r.pins.map(p=>`${p.num} ${p.name}${p.desc?' — '+p.desc.slice(0,40):''}`).join(' · ')+(r.notes.length?'\n'+r.notes.join('\n'):'');}
return{parse,tables,candidates,linesOf,row,packages,sectionText,aiPrompt,fromAi,record,text,cleanName};
})();
if(typeof module!=='undefined')module.exports=DSPDF;
