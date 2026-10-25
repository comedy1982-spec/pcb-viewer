/* ---------- 멀티보드 시스템: a project made of several boards joined through connectors ----------
   MB holds the live project: boards (each with its board object and its own step-1/HSIS state), links, and the current board.
   The viewer still works on one board at a time (BD); switching saves and restores per-board state. */
var MB={name:'',boards:[],links:[],cur:null,adding:null,seq:0,sel:null,mode:'number',form:{}};
const mbId=()=>'B'+(++MB.seq);
function mbBoards(){const m={};MB.boards.forEach(b=>{m[b.id]=b.B;});return m;}
function mbCur(){return MB.boards.find(b=>b.B===BD)||null;}
function mbProject(){return{name:MB.name||(MB.boards[0]&&MB.boards[0].B.name)||'시스템',boards:MB.boards.map(b=>({id:b.id,name:b.B.name,role:b.role||''})),links:MB.links};}
// per-board state the rest of the app keeps in globals
function mbSaveState(b){if(!b)return;b.st={np:{name:($('#npName')||{}).value||'',req:($('#npReq')||{}).value||'',plan:NP.plan,arch:NP.arch,answers:NP.answers,vkey:NP.vkey,picked:NP.picked,chooser:NP.chooser,variants:NP.variants,hist:NP.hist,planManual:NP.planManual},hsis:{H:HS.H,arxml:HS.arxml,arxmlFile:HS.arxmlFile,mcu:HS.mcu,sample:HS.sample},sys:{src:SYS.src},mode:typeof APP!=='undefined'?APP.mode:null};}
function mbLoadState(b){const s=b.st;if(!s){NP.plan=null;NP.arch=null;NP.answers={};NP.vkey=null;NP.picked=null;NP.chooser=false;NP.variants=null;NP.hist=[];const n=$('#npName'),q=$('#npReq');if(n)n.value='';if(q)q.value='';return;}
  Object.assign(NP,{plan:s.np.plan,arch:s.np.arch,answers:s.np.answers||{},vkey:s.np.vkey,picked:s.np.picked,chooser:!!s.np.chooser,variants:s.np.variants,hist:s.np.hist||[],planManual:!!s.np.planManual});const n=$('#npName'),q=$('#npReq');if(n)n.value=s.np.name||'';if(q)q.value=s.np.req||'';
  HS.H=s.hsis.H;HS.arxml=s.hsis.arxml;HS.arxmlFile=s.hsis.arxmlFile||'';HS.mcu=s.hsis.mcu;HS.sample=s.hsis.sample;HS.res=null;SYS.src=s.sys&&s.sys.src||null;}
// called from setBoard: a board opened normally replaces the project; one opened while "adding" joins it
function mbOnBoard(B){if(!B)return;const known=MB.boards.find(b=>b.B===B);if(known){MB.cur=known.id;mbPaint();return;}
  if(MB.adding&&MB.boards.length){const prev=MB.boards.find(b=>b.id===MB.cur);if(prev&&prev.B!==B){/* state of the previous board was saved when the add started */}
    const b={id:mbId(),B,role:MB.adding.role||'',st:null};MB.boards.push(b);MB.cur=b.id;MB.adding=null;mbPaint();toast(`보드 ${b.id} 추가: ${B.name}. 머리의 보드 선택에서 오가고, [시스템 연결]에서 커넥터를 잇습니다.`);return;}
  MB.boards=[{id:'B1',B,role:'',st:null}];MB.seq=1;MB.links=[];MB.cur='B1';MB.name='';MB.adding=null;mbPaint();}
function mbSwitch(id){const to=MB.boards.find(b=>b.id===id);if(!to||to.B===BD)return;const from=mbCur();if(from)mbSaveState(from);
  MB.cur=id;const keepWs=HS.ws;setBoard(to.B);mbLoadState(to);
  if(typeof APP!=='undefined'){const m=to.st&&to.st.mode||(to.B.blank||to.B.source==='신규 설계'?'steps':'viewer');if(APP.mode!==m)setMode(m);}
  try{if(typeof npRender==='function')npRender();if(typeof sysRender==='function')sysRender();if(typeof stepPaint==='function')stepPaint();refresh(true);}catch(e){console.warn(e);}
  if(keepWs==='mb')setWorkspace('mb');mbPaint();}
function mbRemove(id){const b=MB.boards.find(x=>x.id===id);if(!b||MB.boards.length<2)return;if(!confirm(`${id} ${b.B.name}을(를) 시스템에서 뺄까요? (보드 자체는 다시 열 수 있습니다)`))return;
  MB.links=MB.links.filter(l=>l.a.board!==id&&l.b.board!==id);MB.boards=MB.boards.filter(x=>x!==b);if(MB.cur===id)mbSwitch(MB.boards[0].id);else mbPaint();mbRender();}
// add flows: a file, an example or a fresh design joins the project
function mbAdd(kind,arg){const cur=mbCur();if(cur)mbSaveState(cur);MB.adding={role:''};
  if(kind==='file'){openImport();toast('파일을 고르면 지금 시스템에 보드로 추가됩니다.');return;}
  if(kind==='example'){loadExample(arg||'mcu');if(typeof APP!=='undefined'&&APP.mode==='home')setMode('viewer');return;}
  if(kind==='new'){newProject();return;}}
/* ---- header switcher ---- */
function mbPaint(){const sel=$('#mbSel');if(!sel)return;const multi=MB.boards.length>1;sel.hidden=!BD||(typeof APP!=='undefined'&&APP.mode==='home');
  sel.innerHTML=MB.boards.map(b=>`<option value="${b.id}"${b.B===BD?' selected':''}>${esc(b.id)} · ${esc(b.B.name)}${b.role?' ('+esc(b.role)+')':''}</option>`).join('')+`<optgroup label="보드 추가"><option value="+file">파일에서…</option><option value="+new">신규 설계…</option><option value="+ex:mcu">예제: MCU DC 모터</option><option value="+ex:bldc">예제: MCU BLDC</option><option value="+ex:tc364">예제: AURIX TC364</option><option value="+ex:sense">예제: SENSE-32</option><option value="+ex:dadu8">예제: Dadu 8층 (배선 완료)</option><option value="+ex:dadu8b">예제: Dadu 8층 양면 85 × 55</option><option value="+ex:dadu8c">예제: Dadu A4911 · 8층 양면 90 × 60</option></optgroup><optgroup label="시스템"><option value="+links">시스템 연결 (커넥터 짝짓기)…</option></optgroup>`;
  sel.classList.toggle('multi',multi);const t=$('#ws-mb');if(t)t.hidden=!multi&&!MB.links.length;if(typeof nxStripPaint==='function')nxStripPaint();}
{const sel=$('#mbSel');if(sel)sel.addEventListener('change',()=>{const v=sel.value;if(v==='+file')mbAdd('file');else if(v==='+new')mbAdd('new');else if(v.startsWith('+ex:'))mbAdd('example',v.slice(4));else if(v==='+links')setWorkspace('mb');else mbSwitch(v);setTimeout(mbPaint,0);});}
/* ---- 시스템 연결 workspace ---- */
function mbRender(){if(typeof nxStripPaint==='function')try{nxStripPaint();}catch(e){}const host=$('#mbWs');if(!host||host.hidden)return;const boards=mbBoards();const P=mbProject();const M=MULTIBOARD;
  const res=M.resolve(P,boards);const ck=M.check(P,boards);const sn=M.systemNets(P,boards);const bom=M.systemBom(P,boards);
  const opt=(arr,v,f)=>arr.map(x=>`<option value="${esc(f?f(x):x)}"${(f?f(x):x)===v?' selected':''}>${esc(f?f(x):x)}</option>`).join('');
  const F=MB.form;const connList=id=>id&&boards[id]?M.connectors(boards[id]):[];
  const sevIc={err:'!!',warn:'!',info:'·'};
  host.innerHTML=`<div class="mb-wrap">
    <aside class="panel mb-left">
      <p class="h">시스템</p>
      <label class="mb-f"><span>이름</span><input id="mbName" type="text" value="${esc(MB.name)}" placeholder="예: 인버터 ECU 시스템"></label>
      <p class="h" style="margin-top:12px">보드 ${MB.boards.length}개</p>
      <ul class="mb-boards">${MB.boards.map(b=>`<li class="${b.B===BD?'cur':''}"><div class="mb-bh"><b class="mono">${esc(b.id)}</b><span>${esc(b.B.name)}</span></div><div class="mb-bs">${b.B.W.toFixed(0)} × ${b.B.H.toFixed(0)} mm · ${b.B.copperLayers||2}층 · 부품 ${b.B.comps.length} · 커넥터 ${M.connectors(b.B).length}${b.B.pcbPending?' · PCB 전':''}</div>
        <div class="mb-ba"><input type="text" value="${esc(b.role||'')}" placeholder="역할 (제어·구동·전원·표시…)" data-role="${esc(b.id)}" aria-label="${esc(b.id)} 역할"><button type="button" class="pill vbtn" data-open="${esc(b.id)}">열기</button>${MB.boards.length>1?`<button type="button" class="pill vbtn" data-del="${esc(b.id)}" aria-label="${esc(b.id)} 제거">×</button>`:''}</div></li>`).join('')}</ul>
      <div class="acts" style="flex-wrap:wrap;margin-top:8px"><button type="button" class="btn sm" data-add="file">파일 추가</button><button type="button" class="btn sm" data-add="new">신규 설계 추가</button><select id="mbAddEx" class="btn sm" aria-label="예제 추가"><option value="">예제 추가…</option><option value="mcu">MCU DC 모터</option><option value="bldc">MCU BLDC 3상</option><option value="tc364">AURIX TC364</option><option value="sense">SENSE-32</option><option value="dadu8">Dadu 8층 (배선 완료)</option><option value="dadu8b">Dadu 8층 양면 85 × 55</option><option value="dadu8c">Dadu A4911 · 8층 양면 90 × 60</option></select></div>
      <p class="h" style="margin-top:14px">시스템 BOM <span class="cls">${bom.reduce((a,r)=>a+r.qty,0)}개 · ${bom.length}종</span></p>
      <div class="mb-bom">${bom.slice(0,12).map(r=>`<div><b>${r.qty}</b><span>${esc(r.mpn||r.val)}</span><small>${esc(Object.entries(r.by).map(([k,v])=>k+':'+v.length).join(' '))}</small></div>`).join('')}${bom.length>12?`<p class="lead">… 외 ${bom.length-12}종 (내보내기 → Excel)</p>`:''}</div>
    </aside>
    <div class="mb-mid"><div class="mb-dia">${M.svg(P,boards,{title:P.name})||'<p class="lead">보드를 추가하면 연결도가 그려집니다.</p>'}</div>
      <div class="mb-nets"><p class="h">시스템 넷 (보드를 건너는 넷) <span class="cls">${sn.length}</span></p>${sn.length?`<div class="mb-netl">${sn.slice(0,40).map(n=>`<span class="pill" title="${esc(n.members.map(m=>m.board+':'+m.net).join(' · '))}">${esc(n.name)} <small>${n.boards}보드</small></span>`).join('')}</div>`:'<p class="lead">연결을 만들면 커넥터 핀으로 이어진 넷이 여기 나옵니다.</p>'}</div></div>
    <aside class="panel mb-right">
      <p class="h">연결 추가</p>
      <form id="mbLink" class="mb-form">
        <div class="mb-row"><label>A 보드<select name="ab">${opt(MB.boards.map(b=>b.id),F.ab||MB.boards[0]&&MB.boards[0].id)}</select></label><label>커넥터<select name="ac">${opt(connList(F.ab||MB.boards[0]&&MB.boards[0].id).map(c=>c.ref),F.ac)}</select></label></div>
        <div class="mb-row"><label>B 보드<select name="bb">${opt(MB.boards.map(b=>b.id),F.bb||(MB.boards[1]||MB.boards[0]||{}).id)}</select></label><label>커넥터<select name="bc">${opt(connList(F.bb||(MB.boards[1]||MB.boards[0]||{}).id).map(c=>c.ref),F.bc)}</select></label></div>
        <div class="mb-row"><label>종류<select name="kind"><option value="cable">케이블 · 하네스</option><option value="b2b"${F.kind==='b2b'?' selected':''}>보드 간 직결 (B2B)</option></select></label><label>핀 매핑<select name="auto"><option value="number">핀 번호 (1↔1)</option><option value="net"${F.auto==='net'?' selected':''}>넷 이름이 같은 핀</option><option value="manual"${F.auto==='manual'?' selected':''}>직접</option></select></label></div>
        <div class="mb-row"><label>라벨<input name="label" type="text" placeholder="예: 모터 하네스 W1" value="${esc(F.label||'')}"></label><button type="submit" class="btn primary sm">연결 만들기</button></div>
      </form>
      <p class="h" style="margin-top:12px">연결 ${MB.links.length}개</p>
      <div class="mb-links">${res.map(({l,A,B,rows})=>{const bad=ck.filter(c=>c.link===l.id);const e=bad.filter(c=>c.sev==='err').length,w=bad.filter(c=>c.sev==='warn').length;
        return`<details class="mb-link${MB.sel===l.id?' sel':''}" data-link="${esc(l.id)}"${MB.sel===l.id?' open':''}><summary><b class="mono">${esc(l.id)}</b> ${esc(l.label||'')} <span class="cls">${esc(l.a.board)}.${esc(l.a.ref)} ↔ ${esc(l.b.board)}.${esc(l.b.ref)} · ${rows.length}핀 · ${l.kind==='b2b'?'B2B':'케이블'}</span>${e?`<span class="sv err">${e}</span>`:''}${w?`<span class="sv warn">${w}</span>`:''}</summary>
          <div class="mb-la"><label>매핑 <select data-auto="${esc(l.id)}"><option value="number"${l.auto==='number'?' selected':''}>핀 번호</option><option value="net"${l.auto==='net'?' selected':''}>넷 이름</option><option value="manual"${l.auto==='manual'?' selected':''}>직접</option></select></label><button type="button" class="pill vbtn" data-ldel="${esc(l.id)}">연결 삭제</button></div>
          ${A&&B?`<table class="stbl mb-pins"><thead><tr><th>${esc(l.a.ref)} 핀</th><th>넷</th><th></th><th>${esc(l.b.ref)} 핀</th><th>넷</th></tr></thead><tbody>${A.pins.map(pa=>{const r=rows.find(x=>x.pa===pa.n);const pb=r?B.pins.find(x=>x.n===r.pb):null;const c=r&&bad.find(x=>x.msg.includes(`핀 ${r.pa}↔${r.pb}`));
            return`<tr class="${c?c.sev:r?'ok':'none'}"><td class="mono">${esc(pa.n)}</td><td>${esc(pa.net||'')}</td><td>${r?'↔':''}</td><td>${l.auto==='manual'?`<select data-pin="${esc(l.id)}" data-pa="${esc(pa.n)}"><option value="">—</option>${B.pins.map(x=>`<option value="${esc(x.n)}"${r&&r.pb===x.n?' selected':''}>${esc(x.n)}</option>`).join('')}</select>`:`<span class="mono">${r?esc(r.pb):'—'}</span>`}</td><td>${pb?esc(pb.net||''):''}</td></tr>`;}).join('')}</tbody></table>`:'<p class="errline">커넥터를 찾지 못했습니다.</p>'}
          ${bad.length?`<ul class="mb-ck">${bad.map(c=>`<li class="${c.sev}">${sevIc[c.sev]} ${esc(c.msg)}</li>`).join('')}</ul>`:''}</details>`;}).join('')||'<p class="lead">아직 연결이 없습니다. 위에서 두 보드의 커넥터를 골라 만드세요.</p>'}</div>
      <p class="h" style="margin-top:12px">점검 <span class="cls">오류 ${ck.filter(c=>c.sev==='err').length} · 경고 ${ck.filter(c=>c.sev==='warn').length}</span></p>
      <ul class="mb-ck">${ck.filter(c=>!c.link).map(c=>`<li class="${c.sev}">${sevIc[c.sev]} ${esc(c.msg)}</li>`).join('')||'<li class="info">· 연결 밖 문제 없음</li>'}</ul>
      <div class="acts" style="margin-top:10px;flex-wrap:wrap"><button type="button" class="btn sm" data-mbx="svg">연결도 SVG</button><button type="button" class="btn sm" data-mbx="png">PNG</button><button type="button" class="btn sm" data-mbx="xlsx">연결·BOM Excel</button></div>
    </aside></div>`;
  mbBind(host);}
function mbBind(host){
  const F=host.querySelector('#mbLink');const sync=()=>{const d=new FormData(F);MB.form={ab:d.get('ab'),ac:d.get('ac'),bb:d.get('bb'),bc:d.get('bc'),kind:d.get('kind'),auto:d.get('auto'),label:d.get('label')};};
  F.querySelectorAll('select[name=ab],select[name=bb]').forEach(s=>s.addEventListener('change',()=>{sync();MB.form.ac=MB.form.bc=null;const d=new FormData(F);MB.form.ac=null;mbRender();}));
  F.addEventListener('submit',e=>{e.preventDefault();sync();const f=MB.form;if(!f.ac||!f.bc){toast('두 보드 모두 커넥터가 있어야 합니다.');return;}if(f.ab===f.bb&&f.ac===f.bc){toast('같은 커넥터끼리는 이을 수 없습니다.');return;}
    const l=MULTIBOARD.addLink(mbProject(),{board:f.ab,ref:f.ac},{board:f.bb,ref:f.bc},{kind:f.kind,label:f.label,auto:f.auto});MB.links=mbProject().links;MB.sel=l.id;MB.form.label='';mbRender();mbPaint();if(typeof revOnBoard==='function')revOnBoard('시스템 연결 추가 '+l.id);});
  host.querySelector('#mbName').addEventListener('change',e=>{MB.name=e.target.value.trim();mbRender();});
  host.querySelectorAll('[data-role]').forEach(i=>i.addEventListener('change',()=>{const b=MB.boards.find(x=>x.id===i.dataset.role);if(b)b.role=i.value.trim();mbRender();mbPaint();}));
  host.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
    if(d.open){mbSwitch(d.open);return;}if(d.del){mbRemove(d.del);return;}if(d.add){mbAdd(d.add);return;}
    if(d.ldel){MB.links=MB.links.filter(l=>l.id!==d.ldel);mbRender();mbPaint();return;}
    if(d.mbx){mbExport(d.mbx);return;}});
  host.querySelector('#mbAddEx').addEventListener('change',e=>{if(e.target.value)mbAdd('example',e.target.value);});
  host.querySelectorAll('[data-auto]').forEach(s=>s.addEventListener('change',()=>{const l=MB.links.find(x=>x.id===s.dataset.auto);if(!l)return;if(s.value==='manual'&&l.auto!=='manual'){const r=MULTIBOARD.resolve(mbProject(),mbBoards()).find(x=>x.l===l);l.pins=r?r.pins.slice():[];}l.auto=s.value;MB.sel=l.id;mbRender();}));
  host.querySelectorAll('[data-pin]').forEach(s=>s.addEventListener('change',()=>{const l=MB.links.find(x=>x.id===s.dataset.pin);if(!l)return;const pa=s.dataset.pa;l.pins=(l.pins||[]).filter(p=>p[0]!==pa&&p[1]!==s.value);if(s.value)l.pins.push([pa,s.value]);MB.sel=l.id;mbRender();}));
  host.querySelectorAll('details[data-link]').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)MB.sel=d.dataset.link;}));}
async function mbExport(kind){const P=mbProject(),boards=mbBoards(),M=MULTIBOARD;const base=expName()+'_system';
  if(kind==='svg')return expSave(base+'_interconnect.svg',M.svg(P,boards,{title:P.name}),'image/svg+xml');
  if(kind==='png'){const cv=await svgToPng(M.svg(P,boards,{title:P.name}),2);if(cv)return expSaveCanvas(base+'_interconnect.png',cv);return;}
  return exportXlsx(mbSheets(),base+'.xlsx','시스템 연결·BOM을 엑셀로 내려받았습니다.');}
function mbSheets(){const P=mbProject(),boards=mbBoards(),M=MULTIBOARD;const bom=M.systemBom(P,boards);
  return[{name:'시스템 연결',aoa:M.linksAoa(P,boards)},{name:'시스템 BOM',aoa:[['수량','값','풋프린트','부품 번호','설명',...P.boards.map(b=>b.id+' '+b.name)],...bom.map(r=>[r.qty,r.val,r.fp,r.mpn,r.desc,...P.boards.map(b=>(r.by[b.id]||[]).join(', '))])]},
    {name:'시스템 넷',aoa:[['시스템 넷','보드 수','구성'],...M.systemNets(P,boards).map(n=>[n.name,n.boards,n.members.map(m=>m.board+':'+m.net).join(' · ')])]},{name:'시스템 점검',aoa:[['심각도','코드','연결','메시지'],...M.check(P,boards).map(c=>[c.sev,c.code,c.link||'',c.msg])]}];}
function mbReportHTML(){if(MB.boards.length<2&&!MB.links.length)return'';const P=mbProject(),boards=mbBoards(),M=MULTIBOARD;const ck=M.check(P,boards);
  return`<p>${rh(M.text(P,boards)).replace(/\n/g,'<br>')}</p><figure>${M.svg(P,boards,{title:P.name})}<figcaption>보드 연결도</figcaption></figure><h3>연결 핀 표</h3>${aoaTable(M.linksAoa(P,boards),'wide')}<h3>시스템 넷</h3>${aoaTable([['시스템 넷','보드 수','구성'],...M.systemNets(P,boards).map(n=>[n.name,n.boards,n.members.map(m=>m.board+':'+m.net).join(' · ')])],'wide')}<h3>시스템 BOM</h3>${aoaTable(mbSheets()[1].aoa,'wide')}${ck.length?`<h3>점검</h3><ul>${ck.map(c=>`<li>${rh(c.sev)} · ${rh(c.msg)}</li>`).join('')}</ul>`:''}`;}
function mbMetrics(){if(MB.boards.length<2&&!MB.links.length)return null;const ck=MULTIBOARD.check(mbProject(),mbBoards());return{boards:MB.boards.length,links:MB.links.length,err:ck.filter(c=>c.sev==='err').length,warn:ck.filter(c=>c.sev==='warn').length};}
