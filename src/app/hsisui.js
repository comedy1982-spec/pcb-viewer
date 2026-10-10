/* ---------- HSIS workspace (shares viewer scope) ---------- */
const HS={H:null,arxml:null,arxmlFile:'',mcu:null,res:null,tr:null,sel:null,selPin:null,tab:'table',q:'',sev:'all',cats:new Set(),ws:'board'};
const CAT_COLOR={'통신':'var(--s1)','디지털 출력':'var(--s2)','디지털 입력':'var(--s3)','아날로그':'var(--s4)','클럭':'var(--s5)','리셋·부트':'var(--s7)','전원':'var(--s6)','접지':'var(--muted)'};
const catColor=c=>CAT_COLOR[c]||'var(--s8)';
const SEV={err:['오류','✕'],warn:['경고','!'],ok:['정상','✓'],info:['참고','i']};
const pill=s=>`<span class="sv ${s}"><i aria-hidden="true">${SEV[s][1]}</i>${SEV[s][0]}</span>`;
const pct=v=>Math.round(v*100)+'%';

function hsisLoadSample(){
  HS.H=HSIS.fromRows([SAMPLE_HSIS.header].concat(SAMPLE_HSIS.rows),SAMPLE_HSIS.meta);
  HS.arxml=HSIS.parseARXML(SAMPLE_ARXML);HS.arxmlFile='SENSE-32_Port.arxml (예제)';HS.mcu=null;HS.sel=null;HS.selPin=null;hsisRun();
}
function hsisRun(){
  if(!HS.H||!BD)return;
  if(!HS.mcu||!BD.byRef[HS.mcu])HS.mcu=(HS.H.meta.mcuRef&&BD.byRef[HS.H.meta.mcuRef]?HS.H.meta.mcuRef:null)||HSIS.pickMcu(BD,HS.H.items);
  HS.res=HSIS.check(BD,HS.H,HS.arxml,HS.mcu);HS.tr=HSIS.trace(HS.H);
}
function hsisOnBoard(){if(!HS.H)hsisLoadSample();else{HS.mcu=null;hsisRun();}if(HS.ws==='hsis')renderHSIS();}
function setWorkspace(w){
  HS.ws=w;document.querySelectorAll('[data-ws]').forEach(b=>b.setAttribute('aria-selected',b.dataset.ws===w?'true':'false'));
  $('.main').hidden=w!=='board';$('#hsisWs').hidden=w!=='hsis';$('#boardCtl').hidden=w!=='board';tip.hidden=true;
  if(w==='hsis'){if(!HS.H)hsisLoadSample();renderHSIS();}
  else setTimeout(()=>{if(S.view==='3d')resize3D();else{measure();paint2D();}refresh(false);},0);
}
document.querySelectorAll('[data-ws]').forEach(b=>b.addEventListener('click',()=>setWorkspace(b.dataset.ws)));

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
  const c=counts(),cov=pinCoverage(),m=HS.H.meta,mcuOpts=BD.comps.filter(x=>x.pads.length>=8).map(x=>`<option${x.ref===HS.mcu?' selected':''}>${esc(x.ref)}</option>`).join('');
  const cats=HSIS.CAT_ORDER.concat([...new Set(HS.H.items.map(i=>i._cat))].filter(x=>!HSIS.CAT_ORDER.includes(x)));
  $('#hsLeft').innerHTML=`
    <div class="grp"><p class="h">문서</p>
      <div class="doc"><b>${esc(m.title||m.docId||'HSIS')}</b><span class="mono">${esc([m.docId,m.version&&'v'+m.version].filter(Boolean).join(' · '))}</span><span>${esc(m.file||'')}</span>${HS.arxml?`<span>SW 설정: ${esc(HS.arxmlFile)} · PortPin ${HS.arxml.length}개</span>`:'<span>SW 설정(ARXML) 없음</span>'}</div>
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
  document.querySelectorAll('[data-htab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.htab===HS.tab?'true':'false'));
  $('#htab-chk').innerHTML=`검사 결과 <span class="n">${nErr+nWarn}</span>`;
  const body=$('#hsBody');
  if(HS.tab==='table')body.innerHTML=tableHTML();else if(HS.tab==='pins')body.innerHTML=pinmapHTML();else if(HS.tab==='trace')body.innerHTML=traceHTML();else body.innerHTML=checksHTML();
  renderDetail();bindHSIS();
}
function tableHTML(){
  const rows=filtered();
  if(!rows.length)return'<p class="empty">조건에 맞는 신호가 없습니다.</p>';
  return`<div class="tscroll"><table class="stbl hs"><thead><tr><th>상태</th><th>ID</th><th>신호</th><th>분류</th><th class="r">MCU 핀</th><th>포트 · 기능</th><th>방향</th><th>회로도 넷</th><th>SW 모듈</th><th>요구사항</th><th>테스트</th></tr></thead><tbody>
  ${rows.map(it=>`<tr class="click${HS.sel===it.id?' on':''}" data-item="${esc(it.id)}"><td>${pill(HS.res.status[it.id])}</td><td class="mono">${esc(it.id)}</td><td class="mono"><b>${esc(it.signal)}</b></td>
    <td><span class="cat"><i style="background:${catColor(it._cat)}"></i>${esc(it._cat)}</span></td><td class="r mono">${esc(it.pins)}</td><td class="mono">${esc([it.port,it.func].filter(Boolean).join(' · '))}</td><td>${esc(it.dir)}</td>
    <td class="mono">${esc(it.net)}</td><td>${esc(it.swmod)}</td><td class="mono">${it.req?esc(it.req):'<span class="miss">없음</span>'}</td><td class="mono">${it.test?esc(it.test):'<span class="miss">없음</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function pinmapHTML(){
  const c=BD.byRef[HS.mcu];if(!c)return'<p class="empty">MCU 부품을 고르면 핀 맵을 그립니다.</p>';
  const owner={};HS.H.items.forEach(it=>(it._pins||[]).forEach(n=>{if(!owner[n])owner[n]=it;}));
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
    return`<g class="pg" data-pin="${esc(n)}" tabindex="0" role="button" aria-label="${esc(n)}번 핀 ${esc(name)}"><title>${esc(n)}번 핀${o.p.fn?' · '+esc(o.p.fn):''}${it?' · '+esc(it.id)+' '+esc(it.signal):''}${o.p.net?' · 넷 '+esc(o.p.net):' · 미연결'}</title><rect x="${o.lx-sw[0]/2}" y="${-o.ly-sw[1]/2}" width="${sw[0]}" height="${sw[1]}" style="fill:${fill}" class="${cls}"/>${t}</g>`;}).join('');
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
  return`<div class="sim" style="max-width:none"><div class="acts" style="justify-content:space-between"><span class="lead">회로도(${esc(BD.name)}), MCU 풋프린트, SW 설정(${HS.arxml?esc(HS.arxmlFile):'없음'})과 HSIS를 대조한 결과입니다.</span><button class="btn sm" id="hs-copy">결과 CSV 복사</button></div>
    <ul class="chk">${g('err').map(row).join('')}${g('warn').map(row).join('')}</ul>
    <details class="okbox"><summary>통과한 검사 ${g('ok').length}건 · 참고 ${g('info').length}건</summary><ul class="chk">${g('ok').concat(g('info')).map(row).join('')}</ul></details>
    <p class="lead">검사 항목: MCU 핀↔회로도 넷, 핀 이름, HW 연결 부품·핀, 외부 풀업·풀다운 저항값, 핀 중복, HSIS에 없는 연결 핀, SW Port 설정의 핀·방향·초기값, 요구사항·테스트 연결.</p></div>`;
}
function renderDetail(){
  const box=$('#hsDetail');const it=HS.sel&&itemById(HS.sel);const mcu=BD.byRef[HS.mcu];
  if(!it&&HS.selPin&&mcu){const p=mcu.pads.find(q=>String(q.n)===HS.selPin);
    box.innerHTML=`<div class="card"><div class="card-h"><span class="ref">${esc(mcu.ref)}.${esc(HS.selPin)}</span>${pill(p&&p.net?'warn':'info')}</div><p class="desc">${p&&p.fn?esc(p.fn)+' · ':''}${p&&p.net?`회로도 넷 ${esc(p.net)}에 연결되어 있지만 HSIS 항목이 없습니다.`:'회로도에서 연결되지 않은 핀입니다.'}</p></div>${p&&p.net?miniBoard(p.net):''}`;bindDetail();return;}
  if(!it){box.innerHTML=`<div class="empty"><p style="margin:0">신호 표나 핀 맵에서 항목을 고르면 HW에서 SW까지의 연결 경로와 검사 결과를 보여줍니다.</p><ul><li>엑셀(.xlsx)·CSV HSIS와 AUTOSAR Port ARXML을 불러올 수 있습니다.</li><li>머리글 이름으로 열을 자동으로 찾습니다 (ID, 신호명, MCU 핀, 회로도 넷 등).</li><li>회로도는 보드 뷰어에 열려 있는 보드를 씁니다.</li></ul></div>`;return;}
  const rs=resFor(it.id),st=HS.res.status[it.id];
  const net=it.net&&(BD.nets[it.net]?it.net:Object.keys(BD.nets).find(n=>HSIS.netN(n)===HSIS.netN(it.net)));
  const hwRefs=[...String(it.hw||'').matchAll(/\b([A-Z]{1,3}\d+)(?:\.([A-Za-z0-9]+))?/g)].map(m=>m[1]);
  const parts=net?BD.comps.filter(c=>c.ref!==HS.mcu&&c.pads.some(p=>p.net===net)):[];
  const partsTxt=parts.map(c=>{const o=c.pads.filter(p=>p.net&&p.net!==net).map(p=>p.net);return`<span class="mono">${esc(c.ref)}</span> ${esc(c.val||'')}${o.length?` → ${esc([...new Set(o)].join(', '))}`:''}`;});
  const mcuSt=rs.some(r=>r.sev==='err'&&/^PIN|^NET/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^PIN/.test(r.code))?'warn':'ok';
  const swSt=rs.some(r=>r.sev==='err'&&/^SW/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^SW/.test(r.code))?'warn':'ok';
  const hwSt=rs.some(r=>r.sev==='err'&&/^(HW|PULL|NET_MISSING)/.test(r.code))?'err':rs.some(r=>r.sev==='warn'&&/^(HW|PULL)/.test(r.code))?'warn':'ok';
  const trSt=it.req&&it.test?'ok':'warn';
  const ap=HS.arxml&&HS.arxml.find(a=>[it.signal,it.func,it.swcfg&&it.swcfg.replace(/^.*_/,'')].filter(Boolean).map(HSIS.netN).includes(HSIS.netN(a.name.replace(/^PortPin_?/i,''))));
  const step=(t,s,body)=>`<li class="step ${s}"><div class="st-h"><b>${t}</b>${pill(s)}</div><div class="st-b">${body}</div></li>`;
  const fields=Object.keys(HSIS.LABEL).filter(k=>it[k]&&!['id','signal'].includes(k)).map(k=>`<dt>${HSIS.LABEL[k]}</dt><dd>${esc(it[k])}</dd>`).join('');
  box.innerHTML=`<div class="card"><div class="card-h"><span class="ref">${esc(it.signal)}</span>${pill(st)}</div>
    <p class="desc" style="margin-bottom:8px"><span class="mono">${esc(it.id)}</span> · <span class="cat"><i style="background:${catColor(it._cat)}"></i>${esc(it._cat)}</span>${it.status?' · '+esc(it.status):''}${it.asil?' · ASIL '+esc(it.asil):''}</p>
    ${rs.filter(r=>r.sev==='err'||r.sev==='warn').length?`<ul class="chk sm">${rs.filter(r=>r.sev==='err'||r.sev==='warn').map(r=>`<li>${pill(r.sev)}<div><span>${esc(r.msg)}</span></div></li>`).join('')}</ul>`:''}
    <div class="sub">신호 경로</div>
    <ol class="path">
      ${step('HW 연결',hwSt,`${esc(it.hw||'—')}${partsTxt.length?`<div class="parts">넷의 부품: ${partsTxt.join(' · ')}</div>`:''}${it.pull?`<div>풀업/풀다운: ${esc(it.pull)}</div>`:''}`)}
      ${step('MCU 핀',mcuSt,`<span class="mono">${esc(HS.mcu||'?')}.${esc(it.pins||'—')}</span> · ${esc([it.port,it.func].filter(Boolean).join(' / '))}<div>회로도 넷: <span class="mono">${esc(net||it.net||'—')}</span>${it.net&&!net?' <span class="miss">보드에 없음</span>':''}</div>`)}
      ${step('SW',swSt,`${esc([it.swmod,it.swcfg].filter(Boolean).join(' · ')||'—')}${it.api?`<div class="mono">${esc(it.api)}()</div>`:''}${ap?`<div>ARXML: <span class="mono">${esc(ap.name)}</span> · ${esc(ap.id)}번 핀 · ${esc(ap.mode.replace('PORT_PIN_MODE_',''))}${ap.level?' · '+esc(ap.level.replace('PORT_PIN_LEVEL_','')):''}</div>`:HS.arxml?'<div class="lead">ARXML에 해당 PortPin 없음</div>':''}`)}
      ${step('추적',trSt,`요구사항 <span class="mono">${it.req?esc(it.req):'<span class="miss">없음</span>'}</span> → 테스트 <span class="mono">${it.test?esc(it.test):'<span class="miss">없음</span>'}</span>`)}
    </ol>
    <div class="sub">HSIS 내용</div><dl class="kv">${fields}</dl></div>${net?miniBoard(net):''}`;
  bindDetail();
}
function miniBoard(net){
  const onT=BD.layers['T.cu'].some(p=>p.net===net),side=onT?'T':'B';
  return`<div class="card mini"><div class="card-h"><b style="font-size:13px">보드에서 ${esc(net)} (${side==='T'?'TOP':'BOTTOM'})</b><button class="btn sm" data-goboard="${esc(net)}" data-side="${side}">보드 뷰어에서 보기</button></div><canvas id="hsMini" data-net="${esc(net)}" data-side="${side}" aria-label="보드에서 ${esc(net)} 위치"></canvas></div>`;
}
function bindDetail(){
  const cv=$('#hsMini');if(cv){const w=cv.clientWidth||340,k=w/BD.W,h=Math.round(BD.H*k),d=Math.min(window.devicePixelRatio||1,2);cv.width=w*d;cv.height=h*d;cv.style.height=h+'px';
    const ctx=cv.getContext('2d'),side=cv.dataset.side,mir=side==='B';ctx.setTransform(d*k*(mir?-1:1),0,0,-d*k,mir?d*w:0,d*h);
    const save=[S.hlNet,S.selRef,S.panel];S.hlNet=cv.dataset.net;S.selRef=null;S.panel='info';try{drawSide(ctx,side,{texture:true});}finally{[S.hlNet,S.selRef,S.panel]=save;}}
  document.querySelectorAll('[data-goboard]').forEach(b=>b.addEventListener('click',()=>{const n=b.dataset.goboard;setWorkspace('board');setView(b.dataset.side);S.hlNet=n;S.selRef=null;S.tab='sel';refresh(true);}));
}
function bindHSIS(){
  const L=$('#hsLeft');
  L.querySelector('#hs-mcu')?.addEventListener('change',e=>{HS.mcu=e.target.value;hsisRun();renderHSIS();});
  L.querySelector('#hs-open')?.addEventListener('click',()=>L.querySelector('#hs-file').click());
  L.querySelector('#hs-file')?.addEventListener('change',e=>{hsisFiles([...e.target.files]);e.target.value='';});
  L.querySelector('#hs-sample')?.addEventListener('click',()=>{hsisLoadSample();renderHSIS();toast('예제 HSIS와 ARXML로 되돌렸습니다.');});
  const q=L.querySelector('#hs-q');q?.addEventListener('input',()=>{HS.q=q.value;const pos=q.selectionStart;renderHSIS();const n=$('#hs-q');n.focus();n.setSelectionRange(pos,pos);});
  L.querySelectorAll('[data-sev]').forEach(b=>b.addEventListener('click',()=>{HS.sev=b.dataset.sev;renderHSIS();}));
  L.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.cat;const all=[...L.querySelectorAll('[data-cat]')].map(x=>x.dataset.cat);
    if(!HS.cats.size){HS.cats=new Set([k]);}else if(HS.cats.has(k)){HS.cats.delete(k);}else HS.cats.add(k);if(HS.cats.size===all.length)HS.cats.clear();renderHSIS();}));
  const B=$('#hsBody');
  B.querySelectorAll('[data-item]').forEach(r=>r.addEventListener('click',()=>{HS.sel=r.dataset.item;HS.selPin=null;renderHSIS();}));
  B.querySelectorAll('[data-pinsel]').forEach(r=>r.addEventListener('click',()=>{HS.selPin=r.dataset.pinsel;HS.sel=null;renderHSIS();}));
  B.querySelectorAll('.pg').forEach(g=>{const go=()=>{const n=g.dataset.pin;const it=HS.H.items.find(i=>(i._pins||[]).includes(n));if(it){HS.sel=it.id;HS.selPin=null;}else{HS.sel=null;HS.selPin=n;}renderHSIS();};
    g.addEventListener('click',go);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  B.querySelector('#hs-copy')?.addEventListener('click',()=>{const csv=['심각도,코드,항목,메시지'].concat(HS.res.results.map(r=>[SEV[r.sev][0],r.code,r.id||(r.pin?HS.mcu+'.'+r.pin:''),'"'+r.msg.replace(/"/g,'""')+'"'].join(','))).join('\n');
    const done=()=>toast('검사 결과를 CSV로 복사했습니다. 엑셀에 붙여넣으세요.');
    try{navigator.clipboard.writeText(csv).then(done,()=>fallbackCopy(csv,done));}catch(e){fallbackCopy(csv,done);}});
}
function fallbackCopy(text,done){const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}t.remove();if(ok)done();else toast('복사하지 못했습니다. 브라우저가 클립보드 접근을 막았습니다.');}
document.querySelectorAll('[data-htab]').forEach(b=>b.addEventListener('click',()=>{HS.tab=b.dataset.htab;renderHSIS();}));

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
