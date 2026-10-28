/* ---------- next UI: status strip (cockpit), overview canvas (pipeline), change-request impact (review studio),
   revision ledger lanes, exploded housing + part strip. All read the data the app already has; nothing here owns state
   except the overview/explode view settings. ---------- */
var NX={key:'',m:null,ovKey:'',ovOn:false,ovRaf:0};
/* ---- design metrics, cached on the revision fingerprint ---- */
function nxBomTotal(B){const P=typeof PARTS!=='undefined'?PARTS:null;if(!P||!B)return null;let t=0,n=0;B.comps.forEach(c=>{if(/^TP\d/i.test(c.ref))return;const info=P.find(c.mpn)||P.find(c.val);const pr=P.price(c.mpn,info&&info.cat);if(pr!=null){t+=pr;n++;}});return{total:+t.toFixed(2),priced:n};}
function revSigSafe(){try{return typeof revSig==='function'?revSig():'';}catch(e){return '';}}
function nxMetrics(){if(!BD)return null;const key=(typeof revSig==='function'?revSig():'')+'|'+(PE&&PE.drc?PE.drc.length:-1)+'|'+(typeof SR!=='undefined'&&SR.th?1:0)+'|'+(HS.res?HS.ver:0);if(key===NX.key&&NX.m)return NX.m;
  const m={blank:!!BD.blank,pcb:!BD.blank&&!BD.pcbPending};
  const bom=nxBomTotal(BD);m.bom=bom?bom.total:null;m.bomN=bom?bom.priced:0;m.parts=BD.comps.length;
  try{const last=typeof REV!=='undefined'&&REV.list.slice().reverse().find(r=>r.kind==='tag'||r.label);if(last&&last.stats&&last.stats.bom!=null)m.bomRef={label:revLabel(last),v:last.stats.bom};}catch(e){}
  if(m.pcb){try{if(PE&&PE.fresh&&PE.fresh.B===BD){PE.rats=PE.fresh.rats;PE.drc=PE.fresh.drc;PE.fresh=null;PE.drcKey=key;}
    if(PE&&PE.drc&&PE.drcAt===revSigSafe()){PE.drcKey=key;}  // the edit-mode recheck (peRecalc) just ran on this very board state
    if(PE&&(!PE.drc||!PE.drcKey||PE.drcKey!==key)){PCBEDIT.prepare(BD);PE.drc=PCBEDIT.drc(BD);PE.rats=PCBEDIT.ratsnest(BD);PE.drcKey=key;}m.drc=PE.drc.length;m.open=PE.rats?PE.rats.length:null;}catch(e){m.drc=null;}}
  try{const sheets=BD.schSheets||(typeof schData==='function'&&schData()&&schData().sheets);const g=GUIDE.evaluate(BD,{scope:m.pcb?'all':'sch',sheets,drc:m.pcb&&PE&&PE.drc&&PE.drcKey===key?PE.drc:null});m.gPct=g.pct;m.gCrit=g.crit;m.gFail=g.rules.filter(r=>r.status==='fail').length;m.gVerdict=g.verdict;}catch(e){}
  if(HS.H){try{if(!HS.res)hsisRun();const st=Object.values(HS.res.status||{});m.hsis={ok:st.filter(x=>x==='ok').length,n:st.length,err:st.filter(x=>x==='err').length};}catch(e){}}
  if(typeof SR!=='undefined'&&SR.th&&SR.th.parts){const hot=SR.th.parts.slice().sort((a,b)=>b.Tj-a.Tj)[0];if(hot)m.tj={ref:hot.ref,v:hot.Tj,src:'sim'};}
  if(m.pcb&&typeof mechRun==='function'&&BD.housing){try{const R=mechRun();m.house={mass:R.d.mass,ok:R.d.feasible,ip:R.d.ip,mat:R.d.m.short,warn:R.warn.length};if(!m.tj){const hot=R.d.th.parts.slice().sort((a,b)=>b.Tj-a.Tj)[0];if(hot)m.tj={ref:hot.ref,v:hot.Tj,src:'housing',lim:R.inp.tj};}}catch(e){}}
  if(typeof mbMetrics==='function')m.mb=mbMetrics();
  if(typeof SAFETY!=='undefined'){const A=typeof NP!=='undefined'?NP.arch:null;const lv=A&&A.safety&&A.safety.level||(BD.safety&&BD.safety.level)||'QM';if(lv!=='QM'){try{const R=SAFETY.circuitChecks(BD,{level:lv,arch:A});const F=SAFETY.fmeda(BD,{level:lv,arch:A});const P=SAFETY.parts(BD,{level:lv,arch:A,lib:typeof plAll==='function'?plAll():undefined});m.safety={level:lv,err:R.checks.filter(c=>c.sev==='err').length,warn:R.checks.filter(c=>c.sev==='warn').length,spfm:F.spfm,ok:F.verdict.every(v=>v.ok),parts:P.bad.length};}catch(e){console.warn(e);}}}
  const A=typeof sysArch==='function'?sysArch():NP.arch;if(A)m.blocks={n:A.blocks.length,links:(A.links||[]).length,fromBoard:!NP.arch};m.answers=NP.answers?Object.keys(NP.answers).length:0;
  NX.key=key;NX.m=m;return m;}
/* ---- status strip under the header ---- */
function nxStripPaint(){const el=$('#strip');if(!el)return;const mode=typeof APP!=='undefined'?APP.mode:'viewer';if(!BD||mode==='home'){el.hidden=true;return;}el.hidden=false;
  const m=nxMetrics();if(!m)return;const st=typeof stepCur==='function'?stepCur():0;const f=(v,d)=>v==null?'—':(+v).toFixed(d==null?0:d);
  const tile=(k,label,val,sub,tone,title)=>`<button type="button" class="st-t${tone?' '+tone:''}" data-st="${k}" title="${esc(title||'')}"><span class="st-l">${esc(label)}</span><span class="st-v mono">${val}</span><span class="st-s">${sub||''}</span></button>`;
  const T=[];
  if(st===1||m.blank){T.push(tile('sys','시스템 블록',m.blocks?m.blocks.n:'—',m.blocks?`연결 ${m.blocks.links}${m.blocks.fromBoard?' · 보드에서 추출':''}`:'요구사항부터','', '1단계'));if(m.answers||m.blank)T.push(tile('ans','AI 확인 정보',m.answers,'필수 정보 질문·답','', '요구사항 보강'));}
  if(!m.blank){
    const dB=m.bomRef&&m.bom!=null?m.bom-m.bomRef.v:null;
    T.push(tile('bom','BOM 참고가',m.bom!=null?'$'+f(m.bom,2):'—',dB!=null&&Math.abs(dB)>=0.005?`${m.bomRef.label} 대비 ${dB>0?'+':'−'}$${f(Math.abs(dB),2)}`:`부품 ${m.parts} · 단가 ${m.bomN}종`,dB>0.5?'warn':'','참고 단가 합 (추정) · 데이터시트 탭'));
    T.push(tile('guide','가이드라인',m.gPct!=null?f(m.gPct)+'%':'—',m.gPct!=null?`${m.gVerdict.split(' ')[0]} · 미준수 ${m.gFail}`:'',m.gCrit?'err':m.gPct!=null&&m.gPct<75?'warn':'ok','회로·PCB 설계 가이드라인 점검'));
    if(m.pcb){T.push(tile('drc','DRC',m.drc==null?'—':m.drc,m.open!=null?`미배선 ${m.open} · ${BD.copperLayers||2}층`:`${BD.copperLayers||2}층`,m.drc>0?'err':m.drc===0?'ok':'','배치·배선 규칙 검사 (누르면 목록)'));}
    else T.push(tile('pcb','PCB','3단계','배치·배선 전','', 'PCB 설계 시작'));
    T.push(tile('hsis','HSIS',m.hsis?`${m.hsis.ok}/${m.hsis.n}`:'—',m.hsis?(m.hsis.err?`오류 ${m.hsis.err}`:'모두 정상'):'HSIS 없음',m.hsis&&m.hsis.err?'err':m.hsis?'ok':'','HW/SW 인터페이스 사양 검사'));
    T.push(tile('tj','최고 Tj',m.tj?f(m.tj.v)+' °C':'—',m.tj?`${m.tj.ref} · ${m.tj.src==='sim'?'열 해석':'하우징 추정'}`:'시뮬레이션 전',m.tj&&m.tj.lim&&m.tj.v>m.tj.lim?'err':m.tj&&m.tj.v>100?'warn':'','열 분포 시뮬레이션'));
    if(m.safety)T.push(tile('safety','기능 안전',`ASIL ${m.safety.level}`,`${m.safety.err?'오류 '+m.safety.err+' · ':''}${m.safety.warn?'경고 '+m.safety.warn+' · ':''}${m.safety.parts?'등급 미달 '+m.safety.parts+' · ':''}SPFM ${m.safety.spfm.toFixed(0)}%`,m.safety.err?'err':m.safety.warn||!m.safety.ok?'warn':'ok','기능 안전 점검 · FMEDA'));
    if(m.mb)T.push(tile('mb','시스템 연결',`${m.mb.boards}보드 · ${m.mb.links}연결`,m.mb.err?`오류 ${m.mb.err} · 경고 ${m.mb.warn}`:m.mb.warn?`경고 ${m.mb.warn}`:'문제 없음',m.mb.err?'err':m.mb.warn?'warn':'ok','보드 간 커넥터 연결 점검'));
    T.push(tile('house','하우징',m.house?f(m.house.mass)+' g':'—',m.house?`${m.house.mat} · ${m.house.ip}${m.house.ok?' · 조건 만족':' · 조건 미달'}`:(m.pcb?'4단계':'PCB 뒤'),m.house?(m.house.ok?'ok':'warn'):'','기구 CAD'));}
  const html=T.join('');if(el.dataset.h!==html){el.dataset.h=html;el.innerHTML=`<div class="st-row">${html}</div>`;}}
{const el=$('#strip');if(el)el.addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(!b)return;const k=b.dataset.st;
  if(k==='sys'||k==='ans')setStep(1);else if(k==='pcb')setStep(3);else if(k==='bom'){if(typeof dockTab==='function')dockTab('ds');}
  else if(k==='guide'){if(typeof copSubmit==='function'){setStep(BD.pcbPending?2:3);copSubmit('guide check');}}
  else if(k==='drc'){setStep(3);if(typeof peDrcList==='function'){if(!PE.on&&typeof peBegin==='function')peBegin();peDrcList();}}
  else if(k==='hsis')setWorkspace('hsis');else if(k==='tj'){setStep(3);if(typeof dockTab==='function')dockTab('sim');if(typeof SR!=='undefined'){SR.tab='th';if(typeof renderSim==='function')renderSim();}}
  else if(k==='house')setStep(4);else if(k==='mb')setWorkspace('mb');else if(k==='safety'){setStep(2);setTimeout(()=>copSubmit('safety check',{src:'sch'}),300);}});}
/* ---- overview workspace: the four stages as connected frames (what made what), plus the AI bar ---- */
function nxOvShow(){if(!BD)return;setWorkspace('ov');}
function nxOvRender(force){const host=$('#ovWs');if(!host||host.hidden)return;const key=(typeof revSig==='function'?revSig():'')+'|'+(typeof REV!=='undefined'?REV.list.length:0);if(!force&&key===NX.ovKey)return;NX.ovKey=key;
  const m=nxMetrics()||{};const real=!!(BD&&!BD.blank);const blocks=NP.arch?NP.arch.blocks.length:0;
  let sys='',sch='',pcb='',mech='';
  try{sys=typeof sysSVG==='function'?sysSVG('hw'):'';}catch(e){}
  try{if(real){const d=schData();if(d&&d.sheets.length)sch=schSVG(0);}}catch(e){}
  try{if(m.pcb)pcb=boardSVG('T',null,{bg:'#f7f6f2'});}catch(e){}
  try{if(m.pcb&&BD.housing&&typeof mechRun==='function')mech=HOUSING.drawingSVG(mechRun(),BD.name,{scale:2});}catch(e){}
  const req=($('#npReq')||{}).value||'';const lastRev=typeof REV!=='undefined'&&REV.list.length?revLabel(REV.list[REV.list.length-1]):'';
  const fr=(n,title,sub,body,on,empty)=>`<section class="ov-f${on?' on':''}${body?'':' empty'}" data-ov-step="${n}" aria-label="${esc(title)}"><header><b>${n} · ${esc(title)}</b><span>${esc(sub||'')}</span></header><div class="ov-b">${body||`<p class="lead">${esc(empty||'아직 없습니다.')}</p>`}</div></section>`;
  const arrow=(label)=>`<div class="ov-a" aria-hidden="true"><svg width="100%" height="34" viewBox="0 0 120 34"><path d="M4 17h98" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="5 4" fill="none"/><path d="M100 11l12 6-12 6z" fill="var(--accent)"/></svg><span>${esc(label||'')}</span></div>`;
  const st=typeof stepCur==='function'?stepCur():0;
  host.innerHTML=`<div class="ov-wrap">
    <div class="ov-head"><div><p class="home-k">전체 보기</p><h2>${esc(BD.name)} <small>${esc(lastRev?lastRev+' · ':'')}${esc(BD.source||'')}</small></h2></div>
      <div class="ov-acts"><button type="button" class="btn sm" data-ov="rev">리비전 기록</button><button type="button" class="btn sm" data-ov="export">내보내기</button><button type="button" class="btn primary sm" data-ov="back">${st>0?`${st}단계로 돌아가기`:'보드 보기로'}</button></div></div>
    <div class="ov-grid">
      ${fr(1,'시스템 다이어그램',blocks?`블록 ${blocks} · 연결 ${(NP.arch.links||[]).length}${m.answers?' · AI 확인 '+m.answers:''}`:'요구사항 분석 전',sys?`<div class="ov-svg">${sys}</div>`:'' ,st===1,req?'요구사항은 있지만 다이어그램이 없습니다. [블록 다이어그램 만들기]':'1단계에서 요구사항을 적으면 AI가 블록 다이어그램을 그립니다.')}
      ${arrow(BD.variantLabel?`회로 생성 · ${BD.variantLabel}`:'회로 생성')}
      ${fr(2,'회로',real?`부품 ${BD.comps.length} · 넷 ${BD.netOrder.length}${m.bom!=null?' · BOM $'+m.bom.toFixed(2):''}${m.gPct!=null?' · 가이드라인 '+m.gPct.toFixed(0)+'%':''}`:'생성 전',sch?`<div class="ov-svg">${sch}</div>`:'',st===2,'다이어그램에서 회로 안(저가형·표준·확장형)을 골라 생성합니다.')}
      ${arrow(m.pcb?`배치·배선 · ${BD.copperLayers||2}층${BD.pcbPlan&&BD.pcbPlan.strategy?' · '+BD.pcbPlan.strategy:''}`:'배치·배선')}
      ${fr(3,'PCB',m.pcb?`${BD.W.toFixed(1)} × ${BD.H.toFixed(1)} mm · ${BD.copperLayers||2}층 · DRC ${m.drc==null?'—':m.drc}${m.open?' · 미배선 '+m.open:''}`:'배치 전',pcb?`<div class="ov-svg">${pcb}</div>`:'',st===3,'3단계 PCB 설계 시작 카드에서 층·크기·전략을 고르면 배치·배선합니다.')}
      ${arrow(m.house?`하우징 · ${m.house.mat} · ${m.house.ip}`:'하우징')}
      ${fr(4,'기구',m.house?`${m.house.mass.toFixed(0)} g · ${m.house.ok?'조건 만족':'조건 미달'}${m.house.warn?' · 경고 '+m.house.warn:''}`:'설계 전',mech?`<div class="ov-svg">${mech}</div>`:'',st===4,'PCB가 배치되면 4단계에서 보호 하우징을 설계합니다.')}
    </div>
    <form class="ov-cmd" id="ovCmd"><label for="ovIn">AI에게 · 지금 단계 콘솔로 보냅니다</label><div class="ov-in"><input id="ovIn" type="text" autocomplete="off" placeholder="예: CAN 종단을 스플릿으로 바꾸고 PCB·HSIS까지 반영해줘"><button type="submit" class="btn primary">실행</button></div></form>
  </div>`;}
{const host=$('#ovWs');if(host){host.addEventListener('click',e=>{const a=e.target.closest('[data-ov]');if(a){const k=a.dataset.ov;if(k==='rev'&&typeof openRevisions==='function')openRevisions();else if(k==='export'&&typeof openExport==='function')openExport();else if(k==='back'){const st=NX.ovFrom||(BD&&BD.blank?1:3);if(st)setStep(st);else setWorkspace('board');}return;}
    const f=e.target.closest('[data-ov-step]');if(f){const n=+f.dataset.ovStep;if(typeof APP!=='undefined'&&APP.mode==='viewer'&&n!==1&&n!==4){setWorkspace('board');if(n===2)setView('sch');return;}setStep(n);}});
  host.addEventListener('submit',e=>{if(e.target.id!=='ovCmd')return;e.preventDefault();const i=$('#ovIn');const v=i.value.trim();if(!v)return;i.value='';const st=NX.ovFrom||(BD&&BD.blank?1:3);if(st)setStep(st);else setWorkspace('board');if(typeof dockTab==='function')dockTab('ai');copSubmit(v);});}
  const b=$('#ovBtn');if(b)b.addEventListener('click',()=>{if(HS.ws==='ov'){const st=NX.ovFrom||3;if(BD&&BD.blank)setStep(1);else if(typeof APP!=='undefined'&&APP.mode==='viewer')setWorkspace('board');else setStep(st);return;}NX.ovFrom=typeof stepCur==='function'?stepCur():0;nxOvShow();});}
/* ---- change request: what one copilot run changed, as counts the card shows ---- */
function nxCrBefore(){try{return{json:JSON.stringify(REVLOG.snapshot(revLive())),bom:nxBomTotal(BD)};}catch(e){return null;}}
function nxCrImpact(before){if(!before||typeof REVLOG==='undefined')return null;try{const A=REVLOG.restore(JSON.parse(before.json),PCB);const B=revLive();const d=REVLOG.compare(A,B);const b2=nxBomTotal(BD);
    const c=d.counts;const out={summary:d.summary,total:d.total,circuit:c.bom+c.nets+c.pins,pcb:c.place+c.layers+c.board,hsis:c.hsis,house:c.housing,sys:c.arch+c.plan,bomD:before.bom&&b2?+(b2.total-before.bom.total).toFixed(2):null,bom:d.board.bom};return out;}catch(e){console.warn(e);return null;}}
function nxCrHTML(e){const I=e.cr;if(!I)return'';const chip=(l,v,on)=>`<span class="cr-c${on?' on':''}"><b>${esc(l)}</b>${esc(v)}</span>`;
  const bom=I.bomD==null||Math.abs(I.bomD)<0.005?'변경 없음':`${I.bomD>0?'+':'−'}$${Math.abs(I.bomD).toFixed(2)}`;
  const cmds=(e.cmds||[]);
  return`<div class="cr-i">${chip('시스템',I.sys?I.sys+' 변경':'—',I.sys)}${chip('회로',I.circuit?`${I.bom.added.length?'+'+I.bom.added.length+' ':''}${I.bom.removed.length?'−'+I.bom.removed.length+' ':''}${I.bom.changed.length?'값 '+I.bom.changed.length:''}`.trim()||I.circuit+' 변경':'—',I.circuit)}${chip('PCB',I.pcb?I.pcb+' 변경':'—',I.pcb)}${chip('HSIS',I.hsis?I.hsis+' 변경':'—',I.hsis)}${chip('기구',I.house?I.house+' 변경':'—',I.house)}${chip('BOM',bom,I.bomD!=null&&Math.abs(I.bomD)>=0.005)}</div>
    <div class="cr-s">${esc(I.summary)}</div>${cmds.length?`<details class="cr-d"><summary>실행한 명령 ${cmds.length}개</summary><pre>${esc(cmds.join('\n'))}</pre></details>`:''}`;}
async function nxCrApprove(e){if(!e||e.state!=='open')return;e.state='kept';if(typeof revRecord==='function'){const n=(COP.crSeq=(COP.crSeq||0)+1);const r=await revRecord({tag:true,label:`CR-${n}`,note:(e.cr&&e.cr.summary||'').slice(0,300),cause:(e.cmds||[]).slice(0,5).join(' · ')||'변경 요청 승인'});e.rev=r?revLabel(r):'';toast(r?`승인 · ${revLabel(r)}로 기록했습니다.`:'승인했습니다.');}copPaint(e.src,e,true);}
function nxCrCompare(){if(typeof openRevisions!=='function')return;const L=typeof REV!=='undefined'?REV.list:[];REV.a=L.length?L[L.length-1].id:null;REV.b='cur';REV.tab='pcb';openRevisions();}
/* ---- revision ledger: lanes (domains) × revisions ---- */
function nxLedgerHTML(){const L=typeof REV!=='undefined'?REV.list:[];if(!L.length)return'<p class="lead">기록이 없습니다.</p>';const rows=L.slice(-14);
  const lanes=[['sys','시스템·계획',r=>r.counts?r.counts.arch+r.counts.plan:0],['circuit','회로',r=>r.counts?r.counts.bom+r.counts.nets+r.counts.pins:0],['pcb','PCB',r=>r.counts?r.counts.board+r.counts.place+r.counts.layers:0],['house','기구',r=>r.counts?r.counts.housing:0],['hsis','HSIS',r=>r.counts?r.counts.hsis:0]];
  const head=rows.map(r=>`<th class="${r.kind==='tag'||r.label?'tag':''}${REV.a===r.id?' a':''}${REV.b===r.id?' b':''}" data-col="${esc(r.id)}" title="${esc(r.summary||'')}"><button type="button" data-lcol="${esc(r.id)}"><b>r${r.n}</b>${r.label?`<span class="rv-tag">${esc(r.label)}</span>`:''}<small>${revTime(r.time)}</small></button></th>`).join('')+`<th class="cur${REV.b==='cur'?' b':''}${REV.a==='cur'?' a':''}"><button type="button" data-lcol="cur"><b>현재</b><small>${REV.sig&&revSig()!==REV.sig?'변경 있음':'같음'}</small></button></th>`;
  const body=lanes.map(([k,l,f])=>`<tr><th>${esc(l)}</th>${rows.map(r=>{const n=f(r);return`<td class="${n?'has':''}${REV.a===r.id?' a':''}${REV.b===r.id?' b':''}">${n?`<span class="lc">${n}</span>`:''}</td>`;}).join('')}<td class="cur"></td></tr>`).join('');
  const stats=`<tr class="lg-st"><th>부품 · 넷 · 층</th>${rows.map(r=>`<td class="${REV.a===r.id?'a':''}${REV.b===r.id?' b':''}"><small>${r.stats?`${r.stats.comps}·${r.stats.nets}·${r.stats.layers}`:''}</small></td>`).join('')}<td class="cur"><small>${BD?`${BD.comps.length}·${BD.netOrder.length}·${BD.copperLayers||2}`:''}</small></td></tr>`;
  const cause=`<tr class="why"><th>원인</th>${rows.map(r=>`<td class="${REV.a===r.id?'a':''}${REV.b===r.id?' b':''}"><small title="${esc(r.cause||'')}">${esc((r.cause||'').slice(0,28))}</small></td>`).join('')}<td class="cur"></td></tr>`;
  return`<div class="ledger-wrap"><table class="lgt"><thead><tr><th>${L.length>14?`최근 14 / ${L.length}`:'영역 \\ 리비전'}</th>${head}</tr></thead><tbody>${body}${stats}${cause}</tbody></table></div><p class="lead rv-help">열을 누르면 B, Shift+클릭은 A. 숫자는 직전 리비전 대비 바뀐 항목 수입니다.</p>`;}
/* ---- exploded housing: lid lifts by the slider; the part strip selects BOM items in 3D ---- */
function nxExplodeZ(g){const H=mechCfg();const k=H.open?1:(H.explode||0)/100;return k*Math.max(25,g.Ho*0.9);}
function nxPartStrip(R){if(!R)return'';const bom=HOUSING.mechBom(R);const d=R.d;const map=r=>{if(r.pn==='HSG-01')return['base'];if(r.pn==='HSG-02')return['lid'];if(r.pn==='HSG-10')return['edge:T'];if(r.pn==='HSG-20')return d.screws.map((s,i)=>'screw:'+i);if(r.pn==='HSG-22')return d.sup.map((s,i)=>'boss:'+i);
    if(r.pn==='HSG-30'||r.pn==='HSG-31'){const ids=(r.note||'').match(/F\d+/g)||[];return ids;}if(r.pn==='HSG-40'){const m=r.name.match(/\(([^)]+)\)/);return m?['ped:'+m[1]]:[];}if(r.pn==='HSG-50'){const m=r.name.match(/\(([^)]+)\)/);return m?['win:'+m[1]]:[];}return[];};
  return`<div class="pstrip" role="list" aria-label="기구 부품">${bom.filter(r=>r.src!=='별도').map(r=>{const keys=map(r);const on=keys.length&&keys.every(k=>CADSEL.keys.includes(k));return`<button type="button" role="listitem" class="pchip${on?' on':''}${keys.length?'':' na'}" data-pkeys="${esc(keys.join(','))}" title="${esc(r.spec)}"><b>${esc(r.pn)}</b><span>${esc(r.name)}</span><small>${r.qty}${r.unit==='EA'?'':r.unit}${r.cost!=null?' · $'+r.cost:''}</small></button>`;}).join('')}</div>`;}
