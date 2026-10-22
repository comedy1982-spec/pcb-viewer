/* ---------- datasheet PDF → pin table → part library (DSPDF + pdf.js loaded on demand) ----------
   When the library has no pins for a part number, the user drops the datasheet PDF (or a .txt of its text): the pin table
   is read by rules (DSPDF.parse), the candidate tables are offered when there are several packages, and in AI mode Claude
   reads the pin-table pages when the rules are unsure. The record is saved as src 'ds' (datasheet) in the approved list,
   so `impl <ID> part <MPN>` / `add part <MPN>` / `replace` use the real pins from then on. */
var DSP={lib:null,last:null,busy:false};
const PDFJS_SRC='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function dsPdfLib(){if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);if(DSP.lib)return DSP.lib;
  DSP.lib=new Promise((res,rej)=>{const s=document.createElement('script');s.src=PDFJS_SRC;s.onload=()=>{try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;}catch(e){}res(window.pdfjsLib);};s.onerror=()=>{DSP.lib=null;rej(new Error('pdf.js를 불러오지 못했습니다 (네트워크). PDF 대신 텍스트(.txt)로 올려 주세요.'));};document.head.appendChild(s);});return DSP.lib;}
/* file → pages: pdf.js text items {str,x,y} per page (≤ 60 pages), or the lines of a text file */
async function dsPdfPages(file,maxPages){const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext!=='pdf'){const t=await file.text();return t.split(/\f|\n-{3,}\s*page\s*\d+\s*-{3,}\n/i).filter(Boolean);}
  const lib=await dsPdfLib();const buf=await file.arrayBuffer();const doc=await lib.getDocument({data:buf,disableFontFace:true,isEvalSupported:false}).promise;const n=Math.min(doc.numPages,maxPages||60);const pages=[];
  for(let p=1;p<=n;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();pages.push(tc.items.filter(it=>it.str&&it.transform).map(it=>({str:it.str,x:it.transform[4],y:it.transform[5]})));}
  return pages;}
function dsPickPdf(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='.pdf,.txt';i.onchange=()=>res(i.files[0]||null);i.oncancel=()=>res(null);i.click();});}
/* the conversational flow; returns the saved library record or null */
async function dsPdfFlow(mpn,src,opt){opt=opt||{};src=src||'np';const say=(k,t)=>{const e={k,t};copPaint(src,e);return e;};const ask=q=>{COP.askSrc=src;return copAsk(q);};
  if(typeof DSPDF==='undefined')throw new Error('DSPDF 없음');if(DSP.busy)throw new Error('데이터시트를 읽는 중입니다.');DSP.busy=true;
  try{
    const file=opt.file||await dsPickPdf();if(!file){say('out','데이터시트 파일을 고르지 않았습니다.');return null;}
    const e=say('ai',`${file.name} 읽는 중… (${/\.pdf$/i.test(file.name)?'pdf.js 텍스트 추출':'텍스트'})`);
    let pages;try{pages=await dsPdfPages(file);}finally{copDrop(e);}
    const chars=pages.reduce((a,p)=>a+(typeof p==='string'?p.length:p.reduce((b,t)=>b+t.str.length,0)),0);
    if(chars<200)say('out',`텍스트가 거의 없습니다 (${chars}자) — 스캔된 PDF면 핀 표를 읽을 수 없습니다. AI 모드에서는 Claude가 시도합니다.`);
    let R=DSPDF.parse(pages,{mpn,pkg:opt.pkg,npins:opt.npins});
    // several candidate tables → let the user pick (by page / package / pin count)
    if(R.candidates.length>1&&!opt.npins&&!opt.pkg){const C=R.candidates.slice(0,6);const opts=C.map((c,i)=>`${i+1}. ${c.n}핀${c.pkg?' · '+c.pkg:''} · p.${c.page} (${c.score}%) — ${c.pins.slice(0,5).map(p=>p.num+' '+p.name).join(', ')}…`);
      const a=await ask({q:`${mpn||file.name}: 핀 표 후보가 ${R.candidates.length}개입니다. 어느 것이 이 패키지인가요?`,why:'패키지가 여럿이면 표마다 핀 번호가 다릅니다. 보드에 쓸 패키지의 표를 고르세요.',opts:opts.concat(['Claude에게 판독 맡기기'])});
      if(a&&!/Claude/.test(a)){const i=opts.indexOf(a);if(i>=0){const c=C[i];R=Object.assign({},R,{pkg:c.pkg||R.pkg,npins:c.n,pins:c.pins,conf:Math.min(0.95,c.score/100),notes:R.notes.filter(n=>!/후보/.test(n))});}}
      else if(/Claude/.test(a))R.conf=0;}
    // rules unsure → Claude reads the pin-table pages (AI mode)
    if((!R.pins.length||R.conf<0.6)&&AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){const e2=say('ai','규칙으로는 확실하지 않아 Claude가 핀 표 페이지를 읽는 중…');
        try{const j=await CLI.sample.json(DSPDF.aiPrompt(mpn,DSPDF.sectionText(pages),opt.pkg||R.pkg),{cache:false,modelTier:AIM.tier});const ai=DSPDF.fromAi(j,mpn);if(ai&&(ai.pins.length>R.pins.length||ai.conf>R.conf))R=ai;}
        catch(e3){say('err','Claude 판독 실패: '+(e3.message||e3));}finally{copDrop(e2);}}}
    if(!R.pins.length){say('err',DSPDF.text(R)+'\n→ 표가 그림이면 핀을 직접 적어 주세요: add part '+(mpn||'<MPN>')+' --pins 1=VIN,2=GND,…');return null;}
    say('ok',DSPDF.text(R));
    const b=opt.auto?'저장':await ask({q:`${R.mpn||mpn} ${R.npins}핀 — 이 핀 배열을 라이브러리에 저장할까요?`,why:'저장하면 impl … part / add part / replace가 이 핀을 씁니다 (승인 목록 · 출처 "데이터시트").',opts:['저장','저장하지 않음']});
    if(b!=='저장')return null;
    R.mpn=R.mpn||mpn;const rec=DSPDF.record(R,file.name);plRemember(rec);await plSave();DSP.last=rec;if(typeof plRender==='function')plRender();
    say('ok',`${rec.mpn} 저장 — ${rec.pins.length}핀 (출처: 데이터시트 ${file.name})`);return rec;}
  finally{DSP.busy=false;}}
/* `datasheet <MPN> [--pkg SOIC] [--pins 14]` on any console: extract and save, then rebind the blocks / parts that use the MPN */
async function dsPdfCmd(a,src){const mpn=String(a._[0]||'').trim();if(!mpn)throw new Error('datasheet <MPN> [--pkg SOIC] [--pins 14] — 데이터시트 PDF(.pdf/.txt)를 올려 핀 표를 라이브러리에 저장');
  const rec=await dsPdfFlow(mpn,src,{pkg:a.pkg&&a.pkg!==true?String(a.pkg):'',npins:a.pins&&a.pins!==true?+a.pins:0});if(!rec)return'저장하지 않았습니다.';
  const out=[`${rec.mpn}: ${rec.pins.length}핀 저장`];
  if(typeof NP!=='undefined'&&NP.arch){const bs=NP.arch.blocks.filter(b=>b.part&&PARTLIB.norm(b.part.mpn)===PARTLIB.norm(rec.mpn));for(const b of bs){try{out.push(await npRun(`impl ${b.id} part ${rec.mpn}`));}catch(e){out.push(`${b.id}: ${e.message||e}`);}}}
  return out.join('\n');}
