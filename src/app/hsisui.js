/* ---------- HSIS workspace (shares viewer scope) ---------- */
const HS={H:null,arxml:null,arxmlFile:'',mcu:null,res:null,tr:null,sel:null,selPin:null,tab:'table',q:'',sev:'all',cats:new Set(),ws:'board'};
const CAT_COLOR={'통신':'var(--s1)','디지털 출력':'var(--s2)','디지털 입력':'var(--s3)','아날로그':'var(--s4)','클럭':'var(--s5)','리셋·부트':'var(--s7)','전원':'var(--s6)','접지':'var(--muted)'};
const catColor=c=>CAT_COLOR[c]||'var(--s8)';
const SEV={err:['오류','✕'],warn:['경고','!'],ok:['정상','✓'],info:['참고','i']};
const pill=s=>`<span class="sv ${s}"><i aria-hidden="true">${SEV[s][1]}</i>${SEV[s][0]}</span>`;
const pct=v=>Math.round(v*100)+'%';

// each built-in board has its own example HSIS + ARXML; other boards fall back to the SENSE-32 one
const hsisSampleKey=()=>BD&&BD.source==='예제'&&HSIS_SAMPLES[BD.demo||'sense']?(BD.demo||'sense'):'board';
function hsisLoadSample(key){
  key=key||hsisSampleKey();HS.mcu=null;HS.sel=null;HS.selPin=null;
  // a board without its own HSIS document gets one drafted from its MCU pins, never another board's sample
  if(key==='board'){HS.sample='board:'+(BD&&BD.name);HS.H=HSIS.fromBoard(BD,null);HS.arxml=null;HS.arxmlFile='';hsisRun();return;}
  const S=HSIS_SAMPLES[key];HS.sample=key;
  HS.H=HSIS.fromRows([S.hsis.header].concat(S.hsis.rows),S.hsis.meta);
  HS.arxml=HSIS.parseARXML(S.arxml);HS.arxmlFile=S.file;hsisRun();
}
function hsisRun(){
  if(!HS.H||!BD)return;
  if(!HS.mcu||!BD.byRef[HS.mcu]){const mr=HS.H.meta.mcuRef&&BD.byRef[HS.H.meta.mcuRef];HS.mcu=(mr&&HSIS.isMcuLike(mr)?HS.H.meta.mcuRef:null)||HSIS.pickMcu(BD,HS.H.items);}
  HS.res=HSIS.check(BD,HS.H,HS.arxml,HS.mcu);HS.tr=HSIS.trace(HS.H);
  // firmware cross-check when the selected MCU carries firmware
  const fm=typeof fwMcu==='function'?fwMcu():null;HS.fw=null;
  if(fm&&fm.ref===HS.mcu){HS.fw=FW.pinUsage(fwCode(fm),fwMcuDesc(fm));HS.res=HSIS.checkFw(HS.H,HS.fw,HS.res);}
  HS.ver=(HS.ver||0)+1;if(HS.rec)HS.rec.res=null;
}
// board net for an HSIS item (exact name, else normalised match)
function hsisNetOf(it){if(!it||!it.net||!BD)return null;return BD.nets[it.net]?it.net:(Object.keys(BD.nets).find(n=>HSIS.netN(n)===HSIS.netN(it.net))||null);}
// select an HSIS item (or an undocumented MCU pin) everywhere: HSIS views, and the net on board/schematic views
function hsisSelect(id,pin){
  HS.sel=id||null;HS.selPin=id?null:(pin!=null?String(pin):null);
  let net=null;if(id)net=hsisNetOf(itemById(id));else if(HS.selPin){const m=BD.byRef[HS.mcu];const p=m&&m.pads.find(q=>String(q.n)===HS.selPin);net=p&&p.net||null;}
  if(net){S.hlNet=net;S.selRef=null;}
  renderHSIS();refresh(HS.ws==='board');
}
function hsisOnBoard(){const k=hsisSampleKey();if(!HS.H||(HS.sample&&HS.sample!==(k==='board'?'board:'+(BD&&BD.name):k)))hsisLoadSample();else{HS.mcu=null;hsisRun();}if(HS.ws==='hsis')renderHSIS();if(typeof SR!=='undefined'&&SR.tab==='emc'){if(S.panel==='sim')renderSim();else simCellsDirty();}}
// firmware edits change what the HSIS cross-check sees
function hsisOnFirmware(){if(!HS.H||!BD)return;hsisRun();if(HS.ws==='hsis')renderHSIS();else if(typeof POPS!=='undefined')POPS.forEach(C=>{if(C.hv)C.draw();});}
function setWorkspace(w){
  const prev=HS.ws;if(prev==='cad'&&w!=='cad')cadLeave();
  HS.ws=w;$$('[data-ws]').forEach(b=>b.setAttribute('aria-selected',b.dataset.ws===w?'true':'false'));
  $('.main').hidden=w!=='board';$('#hsisWs').hidden=w!=='hsis';$('#cadWs').hidden=w!=='cad';$('#sysWs').hidden=w!=='sys';const ov=$('#ovWs');if(ov)ov.hidden=w!=='ov';const mbw=$('#mbWs');if(mbw)mbw.hidden=w!=='mb';const ob=$('#ovBtn');if(ob)ob.setAttribute('aria-pressed',w==='ov'?'true':'false');$('#boardCtl').hidden=w!=='board';tip.hidden=true;
  if(typeof stepPaint==='function')setTimeout(stepPaint,0);
  if(w==='ov'){if(typeof nxOvRender==='function')setTimeout(()=>nxOvRender(true),0);return;}
  if(w==='mb'){if(typeof mbRender==='function')setTimeout(mbRender,0);return;}
  if(w==='cad'){cadEnter();return;}
  if(w==='sys'){sysEnter();return;}
  if(w==='hsis'){if(!HS.H)hsisLoadSample();renderHSIS();}
  else setTimeout(()=>{if(S.view==='3d')resize3D();else{measure();paint2D();}refresh(false);},0);
}
$$('[data-ws]').forEach(b=>b.addEventListener('click',()=>setWorkspace(b.dataset.ws)));

/* ---------- data helpers ---------- */
const itemById=id=>HS.H.items.find(i=>i.id===id);
const resFor=id=>HS.res.results.filter(r=>r.id===id);
function counts(){const c={err:0,warn:0,ok:0};Object.values(HS.res.status).forEach(s=>{c[s]++;});return c;}
function pinCoverage(){const mcu=BD.byRef[HS.mcu];if(!mcu)return null;const con=mcu.pads.filter(p=>p.net);if(!con.length)return null;const doc=new Set();HS.H.items.forEach(i=>i._pins&&i._pins.forEach(n=>doc.add(n)));return con.filter(p=>doc.has(String(p.n))).length/con.length;}
function filtered(){
  const q=HS.q.toLowerCase();
  return HS.H.items.filter(it=>{const st=HS.res.status[it.id];if(HS.sev!=='all'&&st!==HS.sev)return false;if(HS.cats.size&&!HS.cats.has(it._cat))return false;
    if(q&&!Object.values(it).join(' ').toLowerCase().includes(q))return false;return true;});
}

/* ---------- render ---------- */
function renderHSIS(){
  if(!HS.H||!BD)return;
  const c=counts(),cov=pinCoverage(),m=HS.H.meta,mcuOpts=BD.comps.filter(x=>HSIS.mcuScore(x)>=0).sort((a,b)=>HSIS.mcuScore(b)-HSIS.mcuScore(a)).map(x=>`<option value="${esc(x.ref)}"${x.ref===HS.mcu?' selected':''}>${esc(x.ref)} · ${esc(x.val||x.mpn||'')}${HSIS.isMcuLike(x)?' (MCU)':''}</option>`).join('');
  const cats=HSIS.CAT_ORDER.concat([...new Set(HS.H.items.map(i=>i._cat))].filter(x=>!HSIS.CAT_ORDER.includes(x)));
  $('#hsLeft').innerHTML=`
    <div class="grp"><p class="h">문서</p>
      <div class="doc"><b>${esc(m.title||m.docId||'HSIS')}</b><span class="mono">${esc([m.docId,m.version&&'v'+m.version].filter(Boolean).join(' · '))}</span><span>${esc(m.file||'')}</span>${HS.arxml?`<span>SW 설정: ${esc(HS.arxmlFile)} · PortPin ${HS.arxml.length}개</span>`:'<span>SW 설정(ARXML) 없음</span>'}${HS.fw?`<span>펌웨어: ${esc(HS.mcu)} · 출력 ${HS.fw.out.length} · 입력 ${HS.fw.reads.length}핀 <button class="lnk" id="hs-fw">펌웨어 열기</button></span>`:''}</div>
      <label class="fld" style="margin-top:10px"><span>보드의 MCU 부품</span><select id="hs-mcu" class="fi">${mcuOpts}</select></label>
      <div class="acts" style="margin-top:10px"><button class="btn primary sm" id="hs-open">HSIS·ARXML 불러오기</button><button class="btn ghost sm" id="hs-sample">예제로 되돌리기</button></div>
      <input type="file" id="hs-file" multiple hidden accept=".xlsx,.xls,.csv,.tsv,.arxml,.xml">
    </div>
    <div class="grp"><p class="h">검사 요약</p>
      <div class="kpis"><div class="kpi"><b>${HS.H.items.length}</b><span>신호</span></div><div class="kpi"><b class="c-err">${c.err}</b><span>오류 있는 신호</span></div>
      <div class="kpi"><b class="c-warn">${c.warn}</b><span>경고만 있는 신호</span></div><div class="kpi"><b>${c.ok}</b><span>정상</span></div></div>
      <div class="meter"><span>요구사항 연결</span><b>${pct(HS.tr.reqCov)}</b><i style="--v:${HS.tr.reqCov}"></i></div>
      <div class="meter"><span>테스트 연결</span><b>${pct(HS.tr.testCov)}</b><i style="--v:${HS.tr.testCov}"></i></div>
      ${cov!=null?`<div class="meter"><span>연결된 MCU 핀 문서화</span><b>${pct(cov)}</b><i style="--v:${cov}"></i></div>`:''}
    </div>
    <div class="grp"><p class="h">필터</p>
      <input class="search" id="hs-q" type="search" placeholder="ID, 신호, 넷, 요구사항 검색" value="${esc(HS.q)}">
      <div class="vt" role="group" aria-label="상태 필터" style="margin-top:8px;width:100%">${[['all','전체'],['err','오류'],['warn','경고'],['ok','정상']].map(([k,l])=>`<button data-sev="${k}" aria-pressed="${HS.sev===k}" style="flex:1">${l}</button>`).join('')}</div>
      <div class="catchips" role="group" aria-label="분류 필터">${cats.filter(k=>HS.H.items.some(i=>i._cat===k)).map(k=>`<button data-cat="${esc(k)}" aria-pressed="${HS.cats.size?HS.cats.has(k):true}"><i style="background:${catColor(k)}"></i>${esc(k)}</button>`).join('')}</div>
    </div>`;
  const nErr=HS.res.results.filter(r=>r.sev==='err').length,nWarn=HS.res.results.filter(r=>r.sev==='warn').length;
  $$('[data-htab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.htab===HS.tab?'true':'false'));
  $('#htab-chk').innerHTML=`검사 결과 <span class="n">${nErr+nWarn}</span>`;
  const body=$('#hsBody');$('#hsisWs').classList.toggle('hswide',HS.tab==='rec'||HS.tab==='mcal'||HS.tab==='tc');
  if(HS.tab==='table')body.innerHTML=tableHTML();else if(HS.tab==='pins')body.innerHTML=pinmapHTML();else if(HS.tab==='trace')body.innerHTML=traceHTML();else if(HS.tab==='rec')body.innerHTML=recHTML();else if(HS.tab==='mcal')body.innerHTML=mcalHTML();else if(HS.tab==='tc')body.innerHTML=tcHTML();else body.innerHTML=checksHTML();
  renderDetail();bindHSIS();if(HS.tab==='rec')drawRecPrev();
  if(typeof POPS!=='undefined')POPS.forEach(C=>{if(C.hv)C.draw();});
}
function tableHTML(){
  const rows=filtered();
  if(!rows.length)return'<p class="empty">조건에 맞는 신호가 없습니다.</p>';
  return`<div class="tscroll"><table class="stbl hs"><thead><tr><th>상태</th><th>ID</th><th>신호</th><th>분류</th><th class="r">MCU 핀</th><th>포트 · 기능</th><th>방향</th><th>회로도 넷</th><th>SW 모듈</th><th>요구사항</th><th>테스트</th></tr></thead><tbody>
  ${rows.map(it=>`<tr class="click${HS.sel===it.id?' on':!HS.sel&&S.hlNet&&hsisNetOf(it)===S.hlNet?' hlrow':''}" data-item="${esc(it.id)}"><td>${pill(HS.res.status[it.id])}</td><td class="mono">${esc(it.id)}</td><td class="mono"><b>${esc(it.signal)}</b></td>
    <td><span class="cat"><i style="background:${catColor(it._cat)}"></i>${esc(it._cat)}</span></td><td class="r mono">${esc(it.pins)}</td><td class="mono">${esc([it.port,it.func].filter(Boolean).join(' · '))}</td><td>${esc(it.dir)}</td>
    <td class="mono">${esc(it.net)}</td><td>${esc(it.swmod)}</td><td class="mono">${it.req?esc(it.req):'<span class="miss">없음</span>'}</td><td class="mono">${it.test?esc(it.test):'<span class="miss">없음</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function pinmapHTML(){
  const c=BD.byRef[HS.mcu];if(!c)return'<p class="empty">MCU 부품을 고르면 핀 맵을 그립니다.</p>';
  const owner={};HS.H.items.forEach(it=>(it._pins||[]).forEach(n=>{if(!owner[n])owner[n]=it;}));const mdb=typeof MCU_PINS!=='undefined'?MCU_PINS.find(c.mpn)||MCU_PINS.find(c.val):null;
  const pinRes={};HS.res.results.forEach(r=>{if(r.pin&&(r.sev==='err'||r.sev==='warn')){if(r.sev==='err'||!pinRes[r.pin])pinRes[r.pin]=r.sev;}});
  const a=-c.rot*D2R,ca=Math.cos(a),sa=Math.sin(a),mir=c.side==='B'?-1:1;
  const loc=c.pads.map(p=>{const dx=p.x-c.x,dy=p.y-c.y;let lx=dx*ca-dy*sa,ly=dx*sa+dy*ca;lx*=mir;const ang=((p.ang||0)-c.rot)%180;return{p,lx,ly,ang};});
  let hx=0,hy=0;loc.forEach(o=>{hx=Math.max(hx,Math.abs(o.lx));hy=Math.max(hy,Math.abs(o.ly));});hx=hx||1;hy=hy||1;
  let pitch=1e9;loc.forEach((o,i)=>loc.forEach((q,j)=>{if(j>i){const d=Math.hypot(o.lx-q.lx,o.ly-q.ly);if(d>1e-3&&d<pitch)pitch=d;}}));if(pitch>5)pitch=1;
  const fs=Math.max(0.28,Math.min(1.2,pitch*0.72)),lab=fs*0.62*15+fs;
  const side=o=>{const sx=Math.abs(o.lx)/hx,sy=Math.abs(o.ly)/hy;if(Math.max(sx,sy)<0.8)return'C';return sx>=sy?(o.lx>0?'R':'L'):(o.ly>0?'T':'B');};
  const vb=[-hx-lab-1,-hy-lab-1,2*(hx+lab+1),2*(hy+lab+1)];
  const b=c.body;let body='';if(b&&b.w>0){const dx=b.cx-c.x,dy=b.cy-c.y;let bx=(dx*ca-dy*sa)*mir,by=dx*sa+dy*ca;const rot=Math.abs(((b.ang-c.rot)%180+180)%180-90)<45;const w=rot?b.h:b.w,h=rot?b.w:b.h;
    body=`<rect x="${bx-w/2}" y="${-by-h/2}" width="${w}" height="${h}" rx="${Math.min(w,h)*0.04}" class="pkg"/><circle cx="${bx-w/2+Math.min(w,h)*0.12}" cy="${-by-h/2+Math.min(w,h)*0.12}" r="${Math.min(w,h)*0.035}" class="pin1"/>`;}
  const pads=loc.map(o=>{const n=String(o.p.n),it=owner[n],st=pinRes[n];const s=side(o);
    const w=o.p.w||0.3,h=o.p.h||0.3,sw=Math.abs(o.ang%180)>45?[h,w]:[w,h];
    const fill=it?catColor(it._cat):'transparent';const cls=`pad${st?' '+st:''}${HS.selPin===n||it&&HS.sel===it.id?' on':''}${!it&&o.p.net?' undoc':''}`;
    const name=it?it.signal:(o.p.net?o.p.net:'');const label=`${n}${name?' '+name:''}`;
    let tx=o.lx,ty=-o.ly,anchor='start',rot='';const g=fs*0.5;
    if(s==='R'){tx=o.lx+sw[0]/2+g;anchor='start';}else if(s==='L'){tx=o.lx-sw[0]/2-g;anchor='end';}
    else if(s==='T'){ty=-o.ly-sw[1]/2-g;anchor='start';rot=`rotate(-90 ${tx} ${ty})`;}else if(s==='B'){ty=-o.ly+sw[1]/2+g;anchor='end';rot=`rotate(-90 ${tx} ${ty})`;}
    const t=s==='C'?`<text x="${tx}" y="${ty+fs*0.35}" text-anchor="middle" class="plab c" font-size="${fs}">${esc(label)}</text>`:`<text x="${tx}" y="${ty+fs*0.35}" text-anchor="${anchor}" ${rot?`transform="${rot}"`:''} class="plab${it?'':' m'}" font-size="${fs}">${esc(label.length>16?label.slice(0,15)+'…':label)}</text>`;
    const fx=mdb&&mdb.pins[n]&&mdb.pins[n].f?mdb.pins[n].f.filter(([a])=>a!=='IN'||true).slice(0,9).map(([a,b])=>`${a} ${b}`).join(', '):'';
    return`<g class="pg" data-pin="${esc(n)}" tabindex="0" role="button" aria-label="${esc(n)}번 핀 ${esc(name)}"><title>${esc(n)}번 핀${o.p.fn?' · '+esc(o.p.fn):''}${fx?'\n기능: '+esc(fx):''}${it?' · '+esc(it.id)+' '+esc(it.signal):''}${o.p.net?' · 넷 '+esc(o.p.net):' · 미연결'}</title><rect x="${o.lx-sw[0]/2}" y="${-o.ly-sw[1]/2}" width="${sw[0]}" height="${sw[1]}" style="fill:${fill}" class="${cls}"/>${t}</g>`;}).join('');
  const usedCats=HSIS.CAT_ORDER.filter(k=>HS.H.items.some(i=>i._cat===k));
  return`<div class="pinwrap"><div class="pinhead"><b>${esc(c.ref)}</b> <span class="mono">${esc(c.val||'')} · ${esc(c.fp||'')}</span> <span class="lead">${c.side==='B'?'하단 실장 · 위에서 본 방향으로 뒤집어 표시':'위에서 본 방향'}</span></div>
    <div class="pinlegend">${usedCats.map(k=>`<span><i style="background:${catColor(k)}"></i>${esc(k)}</span>`).join('')}<span><i class="lg-undoc"></i>연결됐지만 HSIS 없음</span><span><i class="lg-nc"></i>미연결</span><span><i class="lg-err"></i>오류</span><span><i class="lg-warn"></i>경고</span></div>
    <svg class="pinmap" viewBox="${vb.join(' ')}" role="img" aria-label="${esc(c.ref)} 핀 맵">${body}${pads}</svg></div>`;
}
function traceHTML(){
  const t=HS.tr;const chip=(id,cls)=>`<button class="tchip ${cls||''}" data-item="${esc(id)}">${esc(id)}</button>`;
  const rows=t.reqs.map(r=>`<tr><td class="mono"><b>${esc(r.id)}</b></td><td>${r.items.map(i=>chip(i.id,HS.res.status[i.id])).join(' ')}</td><td class="mono">${r.tests.length?r.tests.map(esc).join(', '):'<span class="miss">없음</span>'}</td><td>${pill(r.tests.length&&r.items.every(i=>i.test)?'ok':'warn')}</td></tr>`).join('');
  const noTest=HS.H.items.filter(i=>!i.test);
  return`<div class="sim" style="max-width:none">
    <div class="kpis kp3"><div class="kpi"><b>${t.reqs.length}</b><span>연결된 요구사항</span></div><div class="kpi"><b>${pct(t.reqCov)}</b><span>요구사항이 있는 HSIS 항목</span></div><div class="kpi"><b>${pct(t.testCov)}</b><span>테스트가 있는 HSIS 항목</span></div></div>
    <div class="tscroll"><table class="stbl"><thead><tr><th>요구사항</th><th>HSIS 항목</th><th>테스트</th><th>판정</th></tr></thead><tbody>${rows||'<tr><td colspan="4">요구사항 ID가 없습니다.</td></tr>'}</tbody></table></div>
    ${t.noReq.length?`<div><h4 class="h4">요구사항이 없는 항목</h4><div class="chips">${t.noReq.map(i=>chip(i.id,'warn')).join(' ')}</div></div>`:''}
    ${noTest.length?`<div><h4 class="h4">테스트가 없는 항목</h4><div class="chips">${noTest.map(i=>chip(i.id,'warn')).join(' ')}</div></div>`:''}
    <p class="lead">요구사항 → HSIS → 테스트의 양방향 추적성을 보여줍니다. 판정은 해당 요구사항에 묶인 모든 HSIS 항목에 테스트가 있으면 정상입니다.</p></div>`;
}
function checksHTML(){
  const R=HS.res.results;const g=s=>R.filter(r=>r.sev===s);
  const row=r=>`<li>${pill(r.sev)}<div>${r.id?`<button class="tchip" data-item="${esc(r.id)}">${esc(r.id)}</button> `:r.pin?`<button class="tchip" data-pinsel="${esc(r.pin)}">${esc(HS.mcu)}.${esc(r.pin)}</button> `:''}<span>${esc(r.msg)}</span><span class="code">${esc(r.code)}</span></div></li>`;
  return`<div class="sim" style="max-width:none"><div class="acts" style="justify-content:space-between"><span class="lead">회로도(${esc(BD.name)}), MCU 풋프린트, SW 설정(${HS.arxml?esc(HS.arxmlFile):'없음'})${HS.fw?`, ${esc(HS.mcu)} 펌웨어`:''}와 HSIS를 대조한 결과입니다.</span><button class="btn sm" id="hs-copy">결과 CSV 복사</button></div>
    <ul class="chk">${g('err').map(row).join('')}${g('warn').map(row).join('')}</ul>
    <details class="okbox"><summary>통과한 검사 ${g('ok').length}건 · 참고 ${g('info').length}건</summary><ul class="chk">${g('ok').concat(g('info')).map(row).join('')}</ul></details>
    <p class="lead">검사 항목: MCU 핀↔회로도 넷, 핀 이름, HW 연결 부품·핀, 외부 풀업·풀다운 저항값, 핀 중복, HSIS에 없는 연결 핀, SW Port 설정의 핀·방향·초기값, 요구사항·테스트 연결${HS.fw?', 펌웨어가 쓰는 핀·방향·ADC·PWM 주파수':''}.</p></div>`;
}
function renderDetail(box,inCell){box=box||$('#hsDetail');box.innerHTML=detailHTML(inCell);bindDetail(box,inCell);}
function detailHTML(inCell){
  const it=HS.sel&&itemById(HS.sel);const mcu=BD.byRef[HS.mcu];
  if(!it&&HS.selPin&&mcu){const p=mcu.pads.find(q=>String(q.n)===HS.selPin);
    return`<div class="card"><div class="card-h"><span class="ref">${esc(mcu.ref)}.${esc(HS.selPin)}</span>${pill(p&&p.net?'warn':'info')}</div><p class="desc">${p&&p.fn?esc(p.fn)+' · ':''}${p&&p.net?`회로도 넷 ${esc(p.net)}에 연결되어 있지만 HSIS 항목이 없습니다.`:'회로도에서 연결되지 않은 핀입니다.'}</p></div>${p&&p.net?miniBoard(p.net,inCell):''}`;}
  if(!it){return`<div class="empty"><p style="margin:0">신호 표나 핀 맵에서 항목을 고르면 HW에서 SW까지의 연결 경로와 검사 결과를 보여줍니다.</p><ul><li>엑셀(.xlsx)·CSV HSIS와 AUTOSAR Port ARXML을 불러올 수 있습니다.</li><li>머리글 이름으로 열을 자동으로 찾습니다 (ID, 신호명, MCU 핀, 회로도 넷 등).</li><li>회로도는 보드 뷰어에 열려 있는 보드를 씁니다.</li></ul></div>`;}
  const rs=resFor(it.id),st=HS.res.status[it.id];
  const net=hsisNetOf(it);
  const hwRefs=[...String(it.hw||'').matchAll(/\b([A-Z]{1,3}\d+)(?:\.([A-Za-z0-9]+))?/g)].map(m=>m[1]);
  const parts=net?BD.comps.filter(c=>c.ref!==HS.mcu&&c.pads.some(p=>p.net===net)):[];
  const partsTxt=parts.map(c=>{const o=c.pads.filter(p=>p.net&&p.net!==net).map(p=>p.net);return`<span class="mono">${esc(c.ref)}</span> ${esc(c.val||'')}${o.length?` → ${esc([...new Set(o)].join(', '))}`:''}`;});
  const mcuSt=rs.some(r=>r.sev==='err'&&/^PIN|^NET/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^PIN/.test(r.code))?'warn':'ok';
  const swSt=rs.some(r=>r.sev==='err'&&/^SW/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^SW/.test(r.code))?'warn':'ok';
  const hwSt=rs.some(r=>r.sev==='err'&&/^(HW|PULL|NET_MISSING)/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^(HW|PULL)/.test(r.code))?'warn':'ok';
  const trSt=it.req&&it.test?'ok':'warn';
  const fwRs=rs.filter(r=>/^FW_/.test(r.code)),fwSt=fwRs.some(r=>r.sev==='err')?'err':fwRs.some(r=>r.sev==='warn')?'warn':'ok';
  const fwUse=HS.fw?[...HS.fw.out.filter(o=>o.pin===String(it.port).toUpperCase()).map(o=>o.pwm?`PWM 출력 ${o.freq} Hz`:'GPIO 출력'),...HS.fw.reads.filter(r=>r.pin===String(it.port).toUpperCase()).map(r=>r.analog?'ADC 입력':'디지털 입력')]:[];
  const ap=HS.arxml&&HS.arxml.find(a=>[it.signal,it.func,it.swcfg&&it.swcfg.replace(/^.*_/,'')].filter(Boolean).map(HSIS.netN).includes(HSIS.netN(a.name.replace(/^PortPin_?/i,''))));
  const step=(t,s,body)=>`<li class="step ${s}"><div class="st-h"><b>${t}</b>${pill(s)}</div><div class="st-b">${body}</div></li>`;
  const fields=Object.keys(HSIS.LABEL).filter(k=>it[k]&&!['id','signal'].includes(k)).map(k=>`<dt>${HSIS.LABEL[k]}</dt><dd>${esc(it[k])}</dd>`).join('');
  return`<div class="card"><div class="card-h"><span class="ref">${esc(it.signal)}</span>${pill(st)}</div>
    <p class="desc" style="margin-bottom:8px"><span class="mono">${esc(it.id)}</span> · <span class="cat"><i style="background:${catColor(it._cat)}"></i>${esc(it._cat)}</span>${it.status?' · '+esc(it.status):''}${it.asil?' · ASIL '+esc(it.asil):''}</p>
    ${rs.filter(r=>r.sev==='err'||r.sev==='warn').length?`<ul class="chk sm">${rs.filter(r=>r.sev==='err'||r.sev==='warn').map(r=>`<li>${pill(r.sev)}<div><span>${esc(r.msg)}</span></div></li>`).join('')}</ul>`:''}
    <div class="sub">신호 경로</div>
    <ol class="path">
      ${step('HW 연결',hwSt,`${esc(it.hw||'—')}${partsTxt.length?`<div class="parts">넷의 부품: ${partsTxt.join(' · ')}</div>`:''}${it.pull?`<div>풀업/풀다운: ${esc(it.pull)}</div>`:''}`)}
      ${step('MCU 핀',mcuSt,`<span class="mono">${esc(HS.mcu||'?')}.${esc(it.pins||'—')}</span> · ${esc([it.port,it.func].filter(Boolean).join(' / '))}<div>회로도 넷: <span class="mono">${esc(net||it.net||'—')}</span>${it.net&&!net?' <span class="miss">보드에 없음</span>':''}</div>`)}
      ${step('SW',swSt,`${esc([it.swmod,it.swcfg].filter(Boolean).join(' · ')||'—')}${it.api?`<div class="mono">${esc(it.api)}()</div>`:''}${ap?`<div>ARXML: <span class="mono">${esc(ap.name)}</span> · ${esc(ap.id)}번 핀 · ${esc(ap.mode.replace('PORT_PIN_MODE_',''))}${ap.level?' · '+esc(ap.level.replace('PORT_PIN_LEVEL_','')):''}</div>`:HS.arxml?'<div class="lead">ARXML에 해당 PortPin 없음</div>':''}`)}
      ${HS.fw&&(fwRs.length||fwUse.length)?step('펌웨어',fwSt,`${fwUse.length?`<span class="mono">${esc(it.port)}</span> · ${esc(fwUse.join(', '))}`:'펌웨어에서 쓰지 않음'}${fwRs.filter(r=>r.sev!=='ok').map(r=>`<div>${esc(r.msg)}</div>`).join('')}<div><button class="lnk" data-fwopen>펌웨어 열기</button></div>`):''}
      ${step('추적',trSt,`요구사항 <span class="mono">${it.req?esc(it.req):'<span class="miss">없음</span>'}</span> → 테스트 <span class="mono">${it.test?esc(it.test):'<span class="miss">없음</span>'}</span>`)}
    </ol>
    <div class="sub">HSIS 내용</div><dl class="kv">${fields}</dl></div>${net?miniBoard(net,inCell):''}`;
}
function miniBoard(net,inCell){
  const onT=BD.layers['T.cu'].some(p=>p.net===net),side=onT?'T':'B';
  return`<div class="card mini"><div class="card-h"><b style="font-size:13px">보드에서 ${esc(net)} (${side==='T'?'TOP':'BOTTOM'})</b><span class="hgap">${inCell?`<button class="btn sm" data-hlnet="${esc(net)}" title="다른 칸의 보드·회로도에서 이 넷을 강조합니다">다른 칸에 강조</button>`:`<button class="btn sm" data-gosch="${esc(net)}">회로도</button><button class="btn sm" data-goboard="${esc(net)}" data-side="${side}">보드</button>`}</span></div><canvas class="hsmini" data-net="${esc(net)}" data-side="${side}" aria-label="보드에서 ${esc(net)} 위치"></canvas></div>`;
}
function drawMini(root){root=root||$('#hsDetail');const cv=root.querySelector('.hsmini');if(cv){const w=cv.clientWidth||340,k=w/BD.W,h=Math.round(BD.H*k),d=Math.min((cv.ownerDocument.defaultView||window).devicePixelRatio||1,2);cv.width=w*d;cv.height=h*d;cv.style.height=h+'px';
    const ctx=cv.getContext('2d'),side=cv.dataset.side,mir=side==='B';ctx.setTransform(d*k*(mir?-1:1),0,0,-d*k,mir?d*w:0,d*h);
    const save=[S.hlNet,S.selRef,S.panel];S.hlNet=cv.dataset.net;S.selRef=null;S.panel='info';try{drawSide(ctx,side,{texture:true});}finally{[S.hlNet,S.selRef,S.panel]=save;}}}
function bindDetail(root,inCell){
  root=root||$('#hsDetail');drawMini(root);
  root.querySelectorAll('[data-fwopen]').forEach(b=>b.addEventListener('click',()=>fwOpen()));
  root.querySelectorAll('[data-hlnet]').forEach(b=>b.addEventListener('click',()=>{S.hlNet=b.dataset.hlnet;S.selRef=null;refresh(HS.ws==='board');}));
  if(inCell)return;
  root.querySelectorAll('[data-gosch]').forEach(b=>b.addEventListener('click',()=>{const n=b.dataset.gosch;setWorkspace('board');S.hlNet=n;S.selRef=null;SV.fromMe=false;SV.lastKey='';setView('sch');refresh(true);}));
  root.querySelectorAll('[data-goboard]').forEach(b=>b.addEventListener('click',()=>{const n=b.dataset.goboard;setWorkspace('board');setView(b.dataset.side);S.hlNet=n;S.selRef=null;S.tab='sel';refresh(true);}));
}
function bindHSIS(){
  const L=$('#hsLeft');
  L.querySelector('#hs-mcu')?.addEventListener('change',e=>{HS.mcu=e.target.value;hsisRun();renderHSIS();});
  L.querySelector('#hs-fw')?.addEventListener('click',()=>fwOpen());
  L.querySelector('#hs-open')?.addEventListener('click',()=>L.querySelector('#hs-file').click());
  L.querySelector('#hs-file')?.addEventListener('change',e=>{hsisFiles([...e.target.files]);e.target.value='';});
  L.querySelector('#hs-sample')?.addEventListener('click',()=>{hsisLoadSample();renderHSIS();toast(`${BD.name}의 예제 HSIS와 ARXML로 되돌렸습니다.`);});
  const q=L.querySelector('#hs-q');q?.addEventListener('input',()=>{HS.q=q.value;const pos=q.selectionStart;renderHSIS();const n=$('#hs-q');n.focus();n.setSelectionRange(pos,pos);});
  L.querySelectorAll('[data-sev]').forEach(b=>b.addEventListener('click',()=>{HS.sev=b.dataset.sev;renderHSIS();}));
  L.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.cat;const all=[...L.querySelectorAll('[data-cat]')].map(x=>x.dataset.cat);
    if(!HS.cats.size){HS.cats=new Set([k]);}else if(HS.cats.has(k)){HS.cats.delete(k);}else HS.cats.add(k);if(HS.cats.size===all.length)HS.cats.clear();renderHSIS();}));
  bindHsBody($('#hsBody'));bindRec($('#hsBody'));bindMcal($('#hsBody'));bindTc($('#hsBody'));
}
function bindHsBody(B){
  B.querySelectorAll('[data-item]').forEach(r=>r.addEventListener('click',()=>hsisSelect(r.dataset.item)));
  B.querySelectorAll('[data-pinsel]').forEach(r=>r.addEventListener('click',()=>hsisSelect(null,r.dataset.pinsel)));
  B.querySelectorAll('.pg').forEach(g=>{const go=()=>{const n=g.dataset.pin;const it=HS.H.items.find(i=>(i._pins||[]).includes(n));if(it)hsisSelect(it.id);else hsisSelect(null,n);};
    g.addEventListener('click',go);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  B.querySelector('#hs-copy')?.addEventListener('click',()=>{const csv=['심각도,코드,항목,메시지'].concat(HS.res.results.map(r=>[SEV[r.sev][0],r.code,r.id||(r.pin?HS.mcu+'.'+r.pin:''),'"'+r.msg.replace(/"/g,'""')+'"'].join(','))).join('\n');
    const done=()=>toast('검사 결과를 CSV로 복사했습니다. 엑셀에 붙여넣으세요.');
    try{navigator.clipboard.writeText(csv).then(done,()=>fallbackCopy(csv,done));}catch(e){fallbackCopy(csv,done);}});
}
function fallbackCopy(text,done){const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}t.remove();if(ok)done();else toast('복사하지 못했습니다. 브라우저가 클립보드 접근을 막았습니다.');}
$$('[data-htab]').forEach(b=>b.addEventListener('click',()=>{HS.tab=b.dataset.htab;renderHSIS();}));

/* ---------- import ---------- */
async function hsisFiles(files){
  const msgs=[];
  for(const f of files){
    try{
      const ext=(f.name.split('.').pop()||'').toLowerCase();
      if(ext==='arxml'||ext==='xml'){HS.arxml=HSIS.parseARXML(await f.text());HS.arxmlFile=f.name;msgs.push(`${f.name}: PortPin ${HS.arxml.length}개`);continue;}
      let rows=null,meta={file:f.name};
      if(ext==='xlsx'||ext==='xls'||ext==='xlsm'){
        if(!window.XLSX)throw new Error('엑셀 라이브러리를 불러오지 못했습니다. CSV로 저장해서 넣어 주세요.');
        const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
        for(const sn of wb.SheetNames){const r=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:''});
          if(/정보|info|cover|표지/i.test(sn)){r.forEach(x=>{const k=String(x[0]||'');const v=String(x[1]||'');if(/문서\s*ID|doc/i.test(k))meta.docId=v;else if(/제목|title/i.test(k))meta.title=v;else if(/버전|version|rev/i.test(k))meta.version=v;else if(/MCU/i.test(k))meta.mcuRef=v;});continue;}
          if(!rows){try{HSIS.fromRows(r);rows=r;}catch(e){}}}
        if(!rows)throw new Error('엑셀에서 ID와 신호명 머리글이 있는 시트를 찾지 못했습니다.');
      }else rows=HSIS.csvRows(await f.text());
      HS.H=HSIS.fromRows(rows,meta);HS.mcu=null;HS.sel=null;HS.selPin=null;
      msgs.push(`${f.name}: 신호 ${HS.H.items.length}개${HS.H.unmapped.length?` (인식 못 한 열: ${HS.H.unmapped.slice(0,4).join(', ')}${HS.H.unmapped.length>4?' 외':''})`:''}`);
    }catch(err){console.error(err);msgs.push(`${f.name}: ${err.message||err}`);}
  }
  hsisRun();renderHSIS();if(msgs.length)toast(msgs.join(' · '));
}

/* ---------- pin recommendation (HSIS × MCU datasheet functions × counterpart IC pins) ---------- */
HS.rec={mode:'keep',res:null,checked:null,show:true,hi:null,undo:null,over:{}};
const REC_ST={change:['변경 추천','warn'],new:['새 배정','ok'],keep:['유지','info'],none:['배정 불가','err']};
function recEnsure(){
  if(!HS.H||!BD)return null;const R=HS.rec;
  if(!R.res){R.res=PINREC.recommend(BD,HS.H,HS.mcu,{mode:R.mode});R.over={};
    R.checked=new Set((R.res.recs||[]).filter(r=>r.status==='change'||r.status==='new').map(r=>r.id));}
  return R.res;
}
function recColor(st){const cs=getComputedStyle(document.documentElement);return st==='change'?(cs.getPropertyValue('--warning').trim()||'#e8a33a'):st==='new'?(cs.getPropertyValue('--accent').trim()||'#d9622b'):'rgba(255,255,255,.55)';}
// dashed MCU-pad → counterpart-pin lines, drawn on the board views (2D) and the preview in the 핀 추천 tab
function recDraw(ctx,side,o){
  const R=HS.rec;if(!R||!R.show||!BD||!HS.H)return;if(!R.res&&R.touched)recEnsure();if(!R.res||!R.res.recs||R.res.mcu!==HS.mcu||!BD.byRef[R.res.mcu])return;
  const w=Math.max(0.14,BD.W/(o&&o.preview?380:520));
  R.res.recs.forEach(r=>{if(!r.line||r.status==='none'||r.line.side!==side)return;if(r.status==='keep'){const pad=BD.byRef[R.res.mcu].pads.find(p=>String(p.n)===r.rec.pin);const nn=pad&&pad.net&&BD.nets[pad.net];if(!nn||nn.tracks.length)return;}
    const on=R.hi===r.id||HS.sel===r.id,col=recColor(r.status);
    ctx.save();ctx.globalAlpha=R.hi&&!on?0.35:1;ctx.strokeStyle=col;ctx.lineWidth=on?w*2.2:w;ctx.setLineDash(r.status==='keep'?[w*1.5,w*2.5]:[w*5,w*3]);
    ctx.beginPath();ctx.moveTo(r.line.a[0],r.line.a[1]);ctx.lineTo(r.line.b[0],r.line.b[1]);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(r.line.a[0],r.line.a[1],w*1.6,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(r.line.b[0],r.line.b[1],w*1.6,0,Math.PI*2);ctx.fill();ctx.restore();});
}
function drawRecPrev(){const cv=$('#recPrev');if(!cv||!BD)return;const w=cv.clientWidth||600,k=w/BD.W,h=Math.round(BD.H*k),d=Math.min(window.devicePixelRatio||1,2);
  cv.width=w*d;cv.height=h*d;cv.style.height=h+'px';const ctx=cv.getContext('2d');ctx.setTransform(d*k,0,0,-d*k,0,d*h);
  const save=[S.hlNet,S.selRef];S.hlNet=null;S.selRef=HS.mcu;try{drawSide(ctx,'T',{texture:true});recDraw(ctx,'T',{preview:true});}finally{[S.hlNet,S.selRef]=save;}}
function recHTML(){
  const R=HS.rec;R.touched=true;const res=recEnsure();
  if(!res)return'<p class="empty">HSIS를 먼저 불러오세요.</p>';
  if(res.error)return`<div class="sim" style="max-width:none"><p class="empty" style="text-align:left">${esc(res.error)}</p><p class="lead">핀 추천은 MCU 데이터시트의 핀 기능 표가 필요합니다. 지금은 Infineon TC364DP(TQFP-144)와 ST STM32F042K6U6(UFQFPN32)를 지원합니다. <button class="lnk" data-ex-tc>AURIX TC364 예제 열기</button></p></div>`;
  const db=res.db,sm=res.sum,mcu=BD.byRef[res.mcu];
  const rows=res.recs.map(r=>{const st=REC_ST[r.status];const pr=r.peer;const cur=r.cur?`<span class="mono">${esc(r.cur)}</span> ${esc((db.pins[r.cur]||{}).port||(db.pins[r.cur]||{}).name||'')}`:'<span class="miss">미배정</span>';
    const curBad=r.curCheck&&!r.curCheck.ok?`<div class="rwhy err">${esc(r.curCheck.why)}</div>`:'';
    const rec=r.rec?`<b class="mono">${esc(r.rec.pin)}</b> <b class="mono">${esc(r.rec.port)}</b><div class="rsig mono">${esc(r.rec.sel)} · ${esc(r.rec.sig)}${r.rec.insel!=null?` · 입력 ${esc(r.rec.insel)}`:''}</div>`:'—';
    const alts=(r.alts||[]).map(a=>`<button class="altc" data-alt="${esc(r.id)}" data-pin="${esc(a.pin)}" title="${esc(a.sig)}${a.dist!=null?' · '+a.dist.toFixed(1)+' mm':''}">${esc(a.pin)} ${esc(a.port||'')}</button>`).join('');
    const can=r.status==='change'||r.status==='new';
    return`<tr class="click${HS.sel===r.id?' on':''}" data-rec="${esc(r.id)}"><td>${can?`<input type="checkbox" data-chk="${esc(r.id)}" ${R.checked.has(r.id)?'checked':''} aria-label="${esc(r.signal)} 적용">`:''}</td>
      <td><b class="mono">${esc(r.signal)}</b><div class="rid">${esc(r.id)}</div><span class="sv ${st[1]}"><i aria-hidden="true">${r.status==='change'?'!':r.status==='new'?'+':r.status==='none'?'✕':'='}</i>${st[0]}</span></td>
      <td>${esc(r.roleName)}<div class="rid mono">${pr?`${esc(pr.ref)}.${esc(pr.pin)} ${esc(pr.name||'')}`:'상대 핀 없음'}</div>${pr&&pr.note?`<div class="rid">${esc(pr.note)}</div>`:''}</td>
      <td><div class="rcur">${cur}</div>${curBad}<div class="rto">${r.rec&&r.status!=='keep'?'→ ':''}${rec}${r.rec&&r.rec.dist!=null?`<span class="rid"> · ${r.rec.dist.toFixed(1)} mm</span>`:''}</div></td>
      <td><div class="alts">${alts||'<span class="rid">대안 없음</span>'}</div><div class="rwhy">${esc(r.why||'')}</div></td></tr>`;}).join('');
  return`<div class="sim recw" style="max-width:none">
    <div class="rechead"><div><b>${esc(mcu.ref)} · ${esc(db.mpn)}</b> <span class="mono">${esc(db.pkg)}</span><p class="lead" style="margin:2px 0 0">${esc(db.note)}</p></div>
      <div class="vt" role="group" aria-label="추천 범위"><button data-recmode="keep" aria-pressed="${R.mode==='keep'}">빈 핀·오류만</button><button data-recmode="all" aria-pressed="${R.mode==='all'}">전체 다시 배정</button></div></div>
    <div class="recsum"><span><b class="c-warn">${sm.change}</b> 변경 추천</span><span><b>${sm.new}</b> 새 배정</span><span><b>${sm.keep}</b> 유지</span><span><b class="${sm.none?'c-err':''}">${sm.none}</b> 배정 불가</span></div>
    <div class="recgrid"><div class="recprevw"><canvas id="recPrev" aria-label="추천 연결선 미리보기"></canvas>
      <div class="reclg"><span><i style="background:${recColor('new')}"></i>새 배정</span><span><i style="background:${recColor('change')}"></i>변경</span><span><i class="lgk"></i>유지</span><label><input type="checkbox" id="recShow" ${R.show?'checked':''}> 보드 보기에도 표시</label></div></div>
      <div class="recact"><button class="btn primary sm" id="recApply" ${R.checked.size?'':'disabled'}>선택한 ${R.checked.size}개 적용</button><button class="btn sm" id="recAll" ${sm.change+sm.new?'':'disabled'}>모두 선택</button>${R.undo?'<button class="btn ghost sm" id="recUndo">적용 취소</button>':''}<button class="btn sm" id="recBoard">보드에서 보기</button><button class="btn sm" id="recCsv">HSIS CSV 내려받기</button><button class="btn sm" id="recMcal">MCAL 설정으로 →</button>
        <p class="lead">적용하면 HSIS의 MCU 핀·포트·핀 기능이 바뀌고, 보드에서 해당 MCU 패드가 신호 넷에 연결됩니다(배선 전 연결선). 대안 핀을 누르면 추천을 바꿉니다.</p>
        ${arHTML()}</div></div>
    <div class="tscroll"><table class="stbl recs"><thead><tr><th></th><th>신호 · 판정</th><th>필요한 기능 · 상대 IC 핀</th><th>현재 → 추천 (MCU 핀 · 기능)</th><th>대안 · 근거</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="lead">추천 기준: ① HSIS 핀 기능·방향과 상대 IC 핀 기능에서 필요한 역할(PWM, 캡처, ADC, SPI, CAN, UART, I2C, 인터럽트, GPIO)을 정합니다. ② MCU 데이터시트의 ALT/AF 표에서 그 역할이 가능한 핀만 후보로 둡니다. ③ SPI·CAN·UART·I2C 신호는 같은 주변장치 인스턴스로, 홀 캡처는 같은 타이머로 묶습니다. ④ 보드에서 상대 핀까지 거리가 짧고, 다른 신호가 필요로 하는 드문 기능을 덜 빼앗는 조합을 헝가리안 매칭으로 고릅니다. 전원·디버그·EVR 핀은 제외하고, 부트 설정(HWCFG) 핀은 감점합니다.</p></div>`;
}
function recApply(ids){
  const R=HS.rec,res=R.res;if(!res||!ids.length)return;
  R.undo={items:HS.H.items.map(it=>Object.assign({},it)),pads:BD.comps.map(c=>c.pads.map(p=>p.net))};
  const ch=PINREC.apply(BD,HS.H,res,ids);
  hsisRun();R.res=null;if(typeof SV!=='undefined')SV.data=null;
  renderHSIS();refresh(false);toast(`${ch.length}개 신호를 적용했습니다. HSIS의 MCU 핀과 보드 연결이 바뀌었습니다.`);
}
function recUndo(){const R=HS.rec,u=R.undo;if(!u)return;HS.H.items.forEach((it,i)=>{Object.keys(it).forEach(k=>delete it[k]);Object.assign(it,u.items[i]);});
  BD.comps.forEach((c,i)=>c.pads.forEach((p,j)=>{p.net=u.pads[i][j];}));PINREC.relink(BD);if(typeof SV!=='undefined')SV.data=null;R.undo=null;hsisRun();R.res=null;renderHSIS();refresh(false);toast('적용을 취소했습니다.');}
function hsisCsv(){const H=HS.H,cols=Object.keys(HSIS.LABEL);const q=v=>{v=v==null?'':String(v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  return'﻿'+[cols.map(k=>HSIS.LABEL[k]).join(',')].concat(H.items.map(it=>cols.map(k=>q(it[k])).join(','))).join('\r\n');}
// downloads: the claude.ai artifact viewer offers files through its downloads capability (allowlisted extensions only);
// a plain browser/local copy uses a blob link
let DLNS;const dlNs=()=>{if(DLNS===undefined)DLNS=window.claude&&typeof window.claude.use==='function'?window.claude.use('downloads').catch(()=>null):Promise.resolve(null);return DLNS;};
const DL_OK=/\.(txt|json|md|csv|zip|html|svg|pdf|xlsx|docx)$/i;
async function offerFile(name,data,type){const ns=await dlNs();
  if(ns){const fn=DL_OK.test(name)?name:name+'.txt';try{await ns.save({filename:fn,data});return fn;}catch(e){if(e&&e.code==='declined')return null;toast('파일을 저장하지 못했습니다'+(e&&e.code?` (${e.code})`:'')+'. 복사 버튼을 쓰세요.');return null;}}
  return saveText(name,data,type)?name:null;}
function saveText(name,text,type){try{const b=new Blob([text],{type:type||'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);return true;}catch(e){toast('내려받지 못했습니다: '+(e.message||e));return false;}}
function bindRec(B){
  if(HS.tab!=='rec')return;const R=HS.rec;
  B.querySelector('[data-ex-tc]')?.addEventListener('click',()=>loadExample('tc364'));
  B.querySelectorAll('[data-recmode]').forEach(b=>b.addEventListener('click',()=>{R.mode=b.dataset.recmode;R.res=null;renderHSIS();}));
  B.querySelectorAll('[data-chk]').forEach(c=>{c.addEventListener('click',e=>e.stopPropagation());c.addEventListener('change',()=>{if(c.checked)R.checked.add(c.dataset.chk);else R.checked.delete(c.dataset.chk);const n=$('#recApply');if(n){n.textContent=`선택한 ${R.checked.size}개 적용`;n.disabled=!R.checked.size;}});});
  B.querySelectorAll('[data-rec]').forEach(tr=>{tr.addEventListener('click',e=>{if(e.target.closest('.altc,input'))return;R.hi=tr.dataset.rec;hsisSelect(tr.dataset.rec);});
    tr.addEventListener('mouseenter',()=>{R.hi=tr.dataset.rec;drawRecPrev();});tr.addEventListener('mouseleave',()=>{R.hi=null;drawRecPrev();});});
  B.querySelectorAll('.altc').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const r=R.res.recs.find(x=>x.id===b.dataset.alt);const n=b.dataset.pin;
    const db=R.res.db,o=MCU_PINS.options(db,n).filter(x=>x.role===r.role&&(!r.rec||!r.group||!/^(spi|uart|can|i2c|cap)/.test(r.group)||x.inst===r.rec.inst))[0]||MCU_PINS.options(db,n).find(x=>x.role===r.role);if(!o)return;
    const pad=BD.byRef[R.res.mcu].pads.find(p=>String(p.n)===n);const prev=r.rec;
    r.rec={pin:n,port:db.pins[n].port||db.pins[n].name,sel:o.sel,sig:o.sig,inst:o.inst,ch:o.ch,insel:o.insel,tim:o.tim,dist:pad&&r.peer?Math.hypot(pad.x-r.peer.x,pad.y-r.peer.y):null};
    if(prev){r.alts=[{pin:prev.pin,port:prev.port,sig:prev.sig,sel:prev.sel,dist:prev.dist}].concat(r.alts.filter(a=>a.pin!==n)).slice(0,3);}
    r.status=r.cur===n?'keep':r.cur?'change':'new';r.why='직접 고른 대안 핀입니다.';if(r.status!=='keep')R.checked.add(r.id);
    r.line=pad&&r.peer?{a:[pad.x,pad.y],b:[r.peer.x,r.peer.y],side:'T'}:null;
    const clash=R.res.recs.find(x=>x!==r&&x.rec&&x.rec.pin===n);if(clash)toast(`${n}번 핀은 ${clash.signal}에도 추천돼 있습니다. 둘 중 하나를 바꾸세요.`);
    renderHSIS();}));
  B.querySelector('#recShow')?.addEventListener('change',e=>{R.show=e.target.checked;refresh(false);});
  B.querySelector('#recAll')?.addEventListener('click',()=>{R.res.recs.forEach(r=>{if(r.status==='change'||r.status==='new')R.checked.add(r.id);});renderHSIS();});
  B.querySelector('#recApply')?.addEventListener('click',()=>recApply([...R.checked]));
  B.querySelector('#recUndo')?.addEventListener('click',recUndo);
  B.querySelector('#recBoard')?.addEventListener('click',()=>{R.show=true;setWorkspace('board');setView('T');S.selRef=HS.mcu;S.hlNet=null;refresh(true);});
  B.querySelector('#recCsv')?.addEventListener('click',async()=>{if(await offerFile(`${(HS.H.meta.docId||'HSIS')}_updated.csv`,hsisCsv(),'text/csv;charset=utf-8'))toast('현재 HSIS를 CSV로 내려받았습니다. 엑셀에서 열 수 있습니다.');});
  B.querySelector('#recMcal')?.addEventListener('click',()=>{HS.tab='mcal';renderHSIS();});
  bindAr(B);
}

/* ---------- MCAL export ---------- */
HS.mcal={file:0,kind:'all'};
function mcalHTML(){
  if(!HS.H||!BD)return'<p class="empty">HSIS를 먼저 불러오세요.</p>';
  const G=MCAL.generate(BD,HS.H,HS.mcu);HS.mcal.gen=G;
  if(G.error)return`<div class="sim" style="max-width:none"><p class="empty" style="text-align:left">${esc(G.error)}</p></div>`;
  const M=G.model,fam=M.fam;const files=G.files;if(HS.mcal.file>=files.length)HS.mcal.file=0;const f=files[HS.mcal.file];
  const kindL={arxml:'AUTOSAR ECUC',c:'MCAL C 설정',hal:'STM32 HAL/LL'};
  const list=['arxml','c','hal'].map(k=>{const fs=files.map((x,i)=>[x,i]).filter(([x])=>x.kind===k);
    return`<div class="mfg"><p class="h">${kindL[k]}</p>${fs.length?fs.map(([x,i])=>`<button class="mfile${i===HS.mcal.file?' on':''}" data-mfile="${i}"><span class="mono">${esc(x.name)}</span><span class="rid">${(x.text.length/1024).toFixed(1)} KB</span></button>`).join(''):`<p class="rid" style="margin:2px 0 0">${k==='hal'?'STM32 보드에서만 만듭니다 (TC364는 Infineon MCAL/iLLD 사용).':'없음'}</p>`}</div>`;}).join('');
  const prow=M.pins.map(x=>`<tr><td class="r mono">${x.n}</td><td class="mono">${esc(x.port)}</td><td class="mono"><b>${esc(x.sig)}</b></td><td class="mono">${esc(x.o.sel)}</td><td class="mono">${esc(x.o.sig)}${x.o.insel!=null?` <span class="rid">입력 ${esc(x.o.insel)}</span>`:''}</td><td>${x.dir==='OUT'?'출력':x.dir==='IO'?'양방향':'입력'}</td><td>${x.level?esc(x.level==='HIGH'?'High':'Low'):'—'}</td><td>${x.pull==='UP'?'풀업':x.pull==='DOWN'?'풀다운':'—'}${x.od?' · OD':''}</td>
    <td class="mono">${fam==='aurix'?(x.pi?'PC '+'0x'+MCAL.aurixPC(x).toString(16).toUpperCase().padStart(2,'0'):'전용 AN'):(x.r?`MODER ${x.r.mode} · AF${x.r.af}`:'')}</td><td>${esc(x.swmod)}</td></tr>`).join('');
  return`<div class="sim" style="max-width:none">
    <div class="rechead"><div><b>${esc(M.mcu)} · ${esc(M.mpn)}</b> <span class="lead">현재 HSIS의 핀 배정으로 만든 설정입니다. 핀 추천을 적용하면 바로 반영됩니다.</span></div>
      <div class="acts"><button class="btn primary sm" id="mcalZip">모두 내려받기 (.zip)</button><button class="btn sm" id="mcalUse">이 ARXML로 HSIS 검사</button></div></div>
    ${M.warn.length?`<ul class="chk">${M.warn.map(w=>`<li>${pill('warn')}<div><span>${esc(w)}</span></div></li>`).join('')}</ul>`:''}
    <div class="mcalw"><nav class="mfiles" aria-label="생성 파일">${list}</nav>
      <div class="mprev"><div class="mprevh"><b class="mono">${esc(f.name)}</b><span class="hgap"><button class="btn sm" id="mcalCopy">복사</button><button class="btn sm" id="mcalSave">내려받기</button></span></div><pre class="codepre" tabindex="0">${esc(f.text)}</pre></div></div>
    <h4 class="h4">포트 설정 요약 (${M.pins.length}핀)</h4>
    <div class="tscroll"><table class="stbl"><thead><tr><th class="r">핀</th><th>포트</th><th>신호</th><th>모드</th><th>기능</th><th>방향</th><th>초기값</th><th>풀</th><th>${fam==='aurix'?'IOCR.PCx':'레지스터'}</th><th>SW 모듈</th></tr></thead><tbody>${prow}</tbody></table></div>
    <p class="lead">ARXML은 Port·Dio·Pwm·Adc·Icu·Spi·Can 모듈의 ECUC 값(AUTOSAR 4.x 정의 경로)입니다. C 설정은 MCAL 관례를 따른 예시라 벤더 MCAL 구조체와 1:1로 같지 않습니다. ${fam==='aurix'?'TC3xx IOCR 값은 PCx 코드(입력 0x00–0x02, 푸시풀 0x10+ALTk, 오픈 드레인 0x18+ALTk)를 바이트 비트 7:3에 넣은 값입니다.':'STM32 레지스터 값과 HAL/LL 코드는 데이터시트 AF 표의 번호를 씁니다.'}</p></div>`;
}
function bindMcal(B){
  if(HS.tab!=='mcal')return;const G=HS.mcal.gen;if(!G||G.error)return;
  B.querySelectorAll('[data-mfile]').forEach(b=>b.addEventListener('click',()=>{HS.mcal.file=+b.dataset.mfile;renderHSIS();}));
  const f=G.files[HS.mcal.file];
  B.querySelector('#mcalCopy')?.addEventListener('click',()=>{const done=()=>toast(`${f.name}을(를) 복사했습니다.`);try{navigator.clipboard.writeText(f.text).then(done,()=>fallbackCopy(f.text,done));}catch(e){fallbackCopy(f.text,done);}});
  B.querySelector('#mcalSave')?.addEventListener('click',async()=>{const fn=await offerFile(f.name,f.text);if(fn)toast(`${fn}을(를) 내려받았습니다.`);});
  B.querySelector('#mcalZip')?.addEventListener('click',async()=>{
    if(!window.JSZip){toast('zip 라이브러리를 불러오지 못했습니다. 파일마다 복사하거나 내려받으세요.');return;}
    const z=new JSZip();G.files.forEach(x=>z.file((x.kind==='arxml'?'arxml/':x.kind==='hal'?'stm32/':'mcal/')+x.name,x.text));
    z.file('README.txt',`${BD.name} · ${G.model.mpn}\n생성: AllinOneDesign HSIS 핀 추천\n\narxml/  AUTOSAR ECUC 설정 (Port, Dio, Pwm, Adc, Icu, Spi, Can)\nmcal/   MCAL 관례 C 설정 예시\n${G.model.fam==='stm32'?'stm32/  STM32 HAL·LL 초기화 코드\n':''}\n주의: 벤더 MCAL 도구로 가져올 때 해당 벤더 파라미터 정의에 맞춰 확인하세요.\n${G.model.warn.length?'\n경고:\n'+G.model.warn.join('\n')+'\n':''}`);
    try{const b=await z.generateAsync({type:'blob'});if(await offerFile(`${(BD.name||'board').replace(/[^\w.-]+/g,'_')}_MCAL.zip`,b,'application/zip'))toast('MCAL 설정 파일을 zip으로 내려받았습니다.');}catch(e){toast('zip을 만들지 못했습니다: '+(e.message||e));}});
  B.querySelector('#mcalUse')?.addEventListener('click',()=>{const ax=G.files.find(x=>x.kind==='arxml');HS.arxml=HSIS.parseARXML(ax.text);HS.arxmlFile=ax.name+' (생성)';hsisRun();HS.tab='checks';renderHSIS();toast('생성한 ARXML로 HSIS를 다시 검사했습니다.');});
}

/* ---------- auto-routing (2-layer grid router, src/route/autoroute.js) ---------- */
HS.ar={power:false,running:false,last:null,prog:'',sig:0.2,pwr:0.3,clr:0.2};
function arNets(){
  if(!HS.H||!BD)return[];const A=HS.ar;
  const sig=new Set(HS.H.items.filter(i=>!/전원|접지/.test(i._cat||i.cat||'')).map(i=>hsisNetOf(i)).filter(Boolean));
  return AUTOROUTE.openNets(BD,n=>BD.netClass(n)==='전원'?A.power:sig.has(n)).map(o=>o.net);
}
function arHTML(){
  const A=HS.ar,open=arNets(),pending=HS.rec.res&&HS.rec.res.recs?HS.rec.res.recs.filter(r=>r.status==='change'||r.status==='new').length:0;
  const L=A.last;const auto=BD.vias.some(v=>v.auto)||['T','B'].some(s=>BD.layers[s+'.cu'].some(p=>p.auto));
  return`<div class="arbox"><div class="arh"><b>자동 배선</b><span class="rid">${BD.copperLayers||2}층 · 격자 0.1 mm · 비아 ${(BD.copperLayers||2)>2?"0.45/0.2":"0.6/0.3"} mm</span></div>
    <div class="arset"><label>신호 폭<input type="number" step="0.05" min="0.1" max="1" id="arSig" value="${A.sig}"> mm</label><label>전원 폭<input type="number" step="0.05" min="0.1" max="1.5" id="arPwr" value="${A.pwr}"> mm</label><label>간격<input type="number" step="0.05" min="0.1" max="1" id="arClr" value="${A.clr}"> mm</label>
      <label class="chkl"><input type="checkbox" id="arPower" ${A.power?'checked':''}> 전원 넷 포함 (GND·동박면 넷 제외)</label></div>
    <div class="acts"><button class="btn primary sm" id="arRun" ${A.running||!open.length?'disabled':''}>${A.running?'배선 중…':`자동 배선 (${open.length}개 넷)`}</button>${auto&&!A.running?'<button class="btn ghost sm" id="arClear">자동 배선 지우기</button><button class="btn sm" id="arView">보드에서 보기</button>':''}</div>
    <p class="lead" id="arProg">${A.running?esc(A.prog):pending?`아직 적용하지 않은 추천이 ${pending}개 있습니다. 먼저 적용하면 그 신호도 함께 배선합니다.`:open.length?'HSIS 신호 중 아직 동박으로 이어지지 않은 넷을 배선합니다. 짧은 넷부터 그리고, 실패한 넷은 순서를 바꿔 최대 3번 다시 시도합니다.':'배선할 열린 넷이 없습니다.'}</p>
    ${L&&!A.running?`<div class="arres"><span class="sv ${L.fail.length?'warn':'ok'}"><i aria-hidden="true">${L.fail.length?'!':'✓'}</i>${L.ok}/${L.results.length} 넷 완료</span><span>트랙 ${L.len.toFixed(0)} mm</span><span>비아 ${L.vias}</span><span>간격 위반 ${L.drc}건</span><span>${L.attempt}번째 시도 · ${(L.ms/1000).toFixed(1)} s</span></div>
      ${L.fail.length?`<ul class="chk">${L.fail.map(f=>`<li>${pill('warn')}<div><b class="mono">${esc(f.net)}</b><span>${esc(f.why)} — 다른 배선을 지우고 핀 추천을 바꾸거나 간격·폭을 줄여 다시 시도해 보세요.</span></div></li>`).join('')}</ul>`:''}`:''}
    <p class="lead">설계 규칙: 트랙 폭과 간격을 지키도록 격자에서 경로를 찾고, 다른 넷의 패드·트랙·비아·구멍·보드 가장자리(0.4 mm)를 피합니다. 결과는 검토용 초안입니다(차동 쌍·길이 맞춤·임피던스는 다루지 않음).</p></div>`;
}
function arAfter(){if(typeof SV!=='undefined')SV.data=null;stats();if(typeof updateTextures==='function'&&G3)updateTextures();refresh(false);renderHSIS();}
async function arRun(){
  const A=HS.ar;if(A.running)return;const nets=arNets();if(!nets.length)return;
  A.running=true;A.prog='배선 준비 중…';renderHSIS();await new Promise(r=>setTimeout(r,30));
  const t0=performance.now();const it=AUTOROUTE.job(BD,nets,{width:{signal:A.sig,power:A.pwr},clear:A.clr});let r,last=performance.now();
  try{
    for(;;){r=it.next();if(r.done)break;const p=r.value;A.prog=`자동 배선 중… ${p.att+1}번째 시도 · ${p.i+1}/${p.total} · ${p.net}`;
      if(performance.now()-last>60){const el=$('#arProg');if(el)el.textContent=A.prog;await new Promise(res=>setTimeout(res,0));last=performance.now();}}
    const res=r.value;res.ms=performance.now()-t0;res.drc=AUTOROUTE.drc(BD,{clear:A.clr}).length;A.last=res;A.added=res.added;
    toast(`자동 배선: ${res.ok}/${res.results.length} 넷 완료, 트랙 ${res.len.toFixed(0)} mm, 비아 ${res.vias}개${res.fail.length?` · 실패 ${res.fail.length}개`:''}.`);
  }catch(e){console.error(e);toast('자동 배선 중 오류: '+(e.message||e));}
  A.running=false;arAfter();
}
function bindAr(B){
  const A=HS.ar;
  const num=(id,k,min,max)=>B.querySelector(id)?.addEventListener('change',e=>{const v=parseFloat(e.target.value);if(isFinite(v))A[k]=Math.max(min,Math.min(max,v));e.target.value=A[k];});
  num('#arSig','sig',0.1,1);num('#arPwr','pwr',0.1,1.5);num('#arClr','clr',0.1,1);
  B.querySelector('#arPower')?.addEventListener('change',e=>{A.power=e.target.checked;renderHSIS();});
  B.querySelector('#arRun')?.addEventListener('click',arRun);
  B.querySelector('#arClear')?.addEventListener('click',()=>{AUTOROUTE.unroute(BD);A.last=null;arAfter();toast('자동 배선한 트랙과 비아를 지웠습니다.');});
  B.querySelector('#arView')?.addEventListener('click',()=>{setWorkspace('board');setView('T');S.selRef=null;S.hlNet=null;refresh(true);});
}

/* ---------- test cases: SWE.6 (SW qualification) and SYS.4 (system integration), generated from the HSIS ---------- */
HS.tc={level:'swqt',open:new Set(),q:'',kind:'all'};
const TC_INFO={swqt:{name:'SWE.6 SW 적격성 시험 (SWQT)',file:'SWE6_SWQT',desc:'SW 관점만 봅니다. TRACE32 디버거·HIL·XCP로 물리 오차를 배제하고 수식(ADC 원시값 경계), 디바운싱·히스테리시스, 상태 전이(Safe State·래치·DTC), Duty 요청·Clamping, 통신 오류 처리(Timeout·CRC·Alive Counter), 워치독 피딩·Shutdown, MCU 리소스(RAM/Flash·스택·MPU·CPU 부하)를 검증합니다. 오실로스코프·멀티미터 계측은 포함하지 않습니다.'},
  sysit:{name:'SYS.4 시스템 통합 시험 (SYSITS)',file:'SYS4_SYSITS',desc:'물리 장비(오실로스코프·멀티미터·파워 서플라이·버스 분석기)가 필요한 항목만 봅니다. S1 전원·클럭·리셋 → S2 통신 → S3 I/O → S4 기능 체인·안전·내구 순서로 통합하며 분압·RC 경로, PWM 주파수·슬루율·Dead-time·리셋 Glitch, FTTI 물리 지연, SPI 타이밍·CAN 전압 레벨·Sample Point, 전원 유지·워치독 리셋 파형, 풀로드 장기 러닝, 결함 주입을 실측합니다.'}};
function tcGen(){if(!HS.H||!BD)return null;if(HS.tc.ver!==HS.ver||HS.tc.bd!==BD||!HS.tc.G){HS.tc.G=TESTGEN.generate(BD,HS.H,HS.mcu);HS.tc.ver=HS.ver;HS.tc.bd=BD;}return HS.tc.G;}
function tcHTML(){
  const G=tcGen();if(!G)return'<p class="empty">HSIS를 먼저 불러오세요.</p>';const T=HS.tc,L=T.level,cases=G[L],info=TC_INFO[L];
  const kinds=[...new Set(cases.map(c=>c.domain))].sort();const q=T.q.toLowerCase();
  const list=cases.filter(c=>(T.kind==='all'||c.domain===T.kind)&&(!q||[c.id,c.title,c.signal,c.hsis,c.req,c.kind].join(' ').toLowerCase().includes(q)));
  const ck=G.check[L];
  const ckRows=ck.map(r=>{const st=!r.total?'info':r.ok===r.total?'ok':'warn';return`<li>${pill(st)}<div><b>${esc(r.title)} <span class="mono">${r.ok}/${r.total}</span></b><span class="rid">${esc(r.why)}</span>${r.miss.length?`<span>빠짐: ${r.miss.map(id=>`<button class="tchip" data-item="${esc(id)}">${esc(id)}</button>`).join(' ')}</span>`:''}</div></li>`;}).join('');
  const stages=L==='sysit'?`<div class="tcstages">${Object.entries(G.stages).map(([k,v])=>`<div><b>${esc(v)}</b><span>${cases.filter(c=>c.stage===k).length}건</span></div>`).join('<i aria-hidden="true">→</i>')}</div>`:'';
  const rows=list.map(c=>{const on=T.open.has(c.id);return`<tr class="click${on?' on':''}" data-tc="${esc(c.id)}"><td class="mono"><b>${esc(c.id)}</b></td>${L==='sysit'?`<td class="mono">${esc(c.stage)}</td>`:''}<td>${esc(c.domain||'')}<div class="rid">${esc(c.kind)}</div></td><td>${esc(c.title)}</td><td class="mono">${esc(c.hsis)}</td><td class="mono">${c.req?esc(c.req):'<span class="miss">없음</span>'}</td><td>${esc(c.asil)}</td><td>${esc(c.prio)}</td></tr>`+
    (on?`<tr class="tcdet"><td colspan="${L==='sysit'?8:7}"><div class="tcd"><dl class="kv"><dt>시험 기법</dt><dd>${esc(c.method)}</dd><dt>측정 수단</dt><dd>${esc(c.tool||'')}</dd><dt>시험 환경</dt><dd>${esc(c.env)}</dd>${c.note?`<dt>신호 경로</dt><dd class="mono">${esc(c.note)}</dd>`:''}<dt>사전 조건</dt><dd>${c.pre.map(esc).join('<br>')||'—'}</dd></dl>
      <table class="stbl tcsteps"><thead><tr><th>#</th><th>절차</th><th>기대 결과</th></tr></thead><tbody>${c.steps.map((st,i)=>`<tr><td class="r mono">${i+1}</td><td>${esc(st.action)}</td><td>${esc(st.expected)}</td></tr>`).join('')}</tbody></table>
      <p class="lead"><b>합격 기준</b> ${esc(c.pass||'')}</p></div></td></tr>`:'');}).join('');
  return`<div class="sim" style="max-width:none">
    <div class="rechead"><div class="vt" role="group" aria-label="시험 수준">${['swqt','sysit'].map(k=>`<button data-tclevel="${k}" aria-pressed="${L===k}">${esc(TC_INFO[k].name)} <span class="n">${G[k].length}</span></button>`).join('')}</div>
      <div class="acts"><button class="btn primary sm" id="tcXlsx">${L==='swqt'?'SWE.6':'SYS.4'} 테스트 케이스 내려받기 (.xlsx)</button><button class="btn sm" id="tcCsv">CSV</button></div></div>
    <div class="tcrule"><div class="${L==='sysit'?'on':''}"><b>SYS.4 (SYSITS)</b><span>${esc(G.rule.sys4)}</span></div><div class="${L==='swqt'?'on':''}"><b>SWE.6 (SWQT)</b><span>${esc(G.rule.swe6)}</span></div></div>
    <p class="lead" style="margin:0">${esc(info.desc)}</p>
    ${G.noReq.length?`<ul class="chk"><li>${pill('warn')}<div><span>요구사항 ID가 없는 HSIS 항목 ${G.noReq.length}개는 추적성이 끊깁니다:</span> ${G.noReq.map(id=>`<button class="tchip" data-item="${esc(id)}">${esc(id)}</button>`).join(' ')}</div></li></ul>`:''}
    <h4 class="h4">필수 검증 항목 (${L==='swqt'?'SWE.6':'SYS.4'})</h4><ul class="chk tcck">${ckRows}</ul>
    ${stages}
    <div class="tcfilter"><input class="search" id="tcQ" type="search" placeholder="ID, 신호, 요구사항 검색" value="${esc(T.q)}"><select id="tcKind" class="fi"><option value="all">모든 검증 도메인</option>${kinds.map(k=>`<option${T.kind===k?' selected':''}>${esc(k)}</option>`).join('')}</select><span class="rid">${list.length}건 표시 · 행을 누르면 절차가 펼쳐집니다</span></div>
    <div class="tscroll"><table class="stbl tcs"><thead><tr><th>테스트 ID</th>${L==='sysit'?'<th>단계</th>':''}<th>도메인 · 분류</th><th>제목</th><th>HSIS</th><th>요구사항</th><th>ASIL</th><th>우선순위</th></tr></thead><tbody>${rows||`<tr><td colspan="8">조건에 맞는 케이스가 없습니다.</td></tr>`}</tbody></table></div>
    <p class="lead">HSIS의 분류·방향·초기값·활성 레벨·풀업·타이밍·변환식·전기적 특성·SW 모듈·API·ASIL 열에서 규칙에 따라 만든 초안입니다. 디바운스 시간·히스테리시스·FTTI·워치독 윈도우 같은 값은 HSIS에 없으므로 SW/안전 요구사항 값으로 채우세요. 예상 레지스터 값은 MCU 핀 기능 DB(지원 MCU)에서 계산합니다.</p></div>`;
}
function tcBook(L){
  const G=tcGen(),T=TESTGEN,info=TC_INFO[L],cases=G[L];
  const sheets=[['테스트 케이스',[T.COLS].concat(T.rows(cases,G.stages))],
    ['필수 검증 항목',[['항목','근거','충족','대상','빠진 HSIS ID']].concat(G.check[L].map(r=>[r.title,r.why,r.ok,r.total,r.miss.join(', ')]))],
    ['추적성',[['HSIS ID','신호','요구사항 ID',L==='swqt'?'SWE.6 테스트 ID':'SYS.4 테스트 ID']].concat(G.trace.map(t=>[t.hsis,t.signal,t.req,t[L].join(', ')]))]];
  if(L==='sysit')sheets.push(['통합 전략',[['단계','설명','케이스 수','진입 조건']].concat(Object.entries(G.stages).map(([k,v],i)=>[k,v,cases.filter(c=>c.stage===k).length,i?`${Object.keys(G.stages)[i-1]} 통과`:'보드 조립·외관 검사 완료']))]);
  sheets.push(['문서 정보',[['항목','값'],['보드',BD.name],['HSIS',`${HS.H.meta.docId||''} v${HS.H.meta.version||''}`],['시험 수준',info.name],['MCU',HS.mcu],['생성','AllinOneDesign HSIS 테스트 케이스 생성 (초안)']]]);
  return sheets;
}
function bindTc(B){
  if(HS.tab!=='tc')return;const T=HS.tc;
  B.querySelectorAll('[data-tclevel]').forEach(b=>b.addEventListener('click',()=>{T.level=b.dataset.tclevel;T.kind='all';T.open.clear();renderHSIS();}));
  B.querySelectorAll('[data-tc]').forEach(r=>r.addEventListener('click',()=>{const id=r.dataset.tc;if(T.open.has(id))T.open.delete(id);else T.open.add(id);renderHSIS();}));
  const q=B.querySelector('#tcQ');q?.addEventListener('input',()=>{T.q=q.value;const pos=q.selectionStart;renderHSIS();const n=$('#tcQ');n.focus();n.setSelectionRange(pos,pos);});
  B.querySelector('#tcKind')?.addEventListener('change',e=>{T.kind=e.target.value;renderHSIS();});
  const base=()=>`${(HS.H.meta.docId||'HSIS').replace(/[^\w.-]+/g,'_')}_${TC_INFO[T.level].file}_TestCases`;
  B.querySelector('#tcXlsx')?.addEventListener('click',async()=>{const sh=tcBook(T.level);
    if(!window.XLSX){toast('엑셀 라이브러리를 불러오지 못해 CSV로 내려받습니다.');const csv='﻿'+sh[0][1].map(r=>r.map(v=>{v=String(v==null?'':v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\r\n');if(await offerFile(base()+'.csv',csv,'text/csv;charset=utf-8'))toast('CSV로 내려받았습니다.');return;}
    const wb=XLSX.utils.book_new();sh.forEach(([name,aoa])=>{const ws=XLSX.utils.aoa_to_sheet(aoa);if(name==='테스트 케이스')ws['!cols']=[14,8,16,18,16,40,14,16,16,8,8,24,26,30,30,50,50,30,24].map(w=>({wch:w}));else ws['!cols']=aoa[0].map((_,i)=>({wch:i===1?44:22}));XLSX.utils.book_append_sheet(wb,ws,name);});
    const buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});if(await offerFile(base()+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})))toast(`${TC_INFO[T.level].name} 테스트 케이스를 엑셀로 내려받았습니다.`);});
  B.querySelector('#tcCsv')?.addEventListener('click',async()=>{const sh=tcBook(T.level);const csv='﻿'+sh[0][1].map(r=>r.map(v=>{v=String(v==null?'':v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\r\n');if(await offerFile(base()+'.csv',csv,'text/csv;charset=utf-8'))toast('CSV로 내려받았습니다.');});
}
