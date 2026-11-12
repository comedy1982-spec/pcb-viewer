/* Guideline score panel — opened from the "가이드라인" tile in the status strip. Shows how the score is built: every rule with its
   status, score, weight, the points it adds / loses, evidence, suggested fix and reference; filters by status / scope / category,
   sorts by points lost, and lets the engineer mark a rule pass / fail / not applicable (GUIDE.set) or change the preset. */
const GD={filter:'lost',scope:'all',cat:'',open:new Set(),last:null};
const GD_ST={pass:['통과','ok'],partial:['부분','warn'],fail:['실패','err'],manual:['수동 확인','man'],na:['해당 없음','na']};
function gdSheets(){try{return BD.schSheets||(typeof schData==='function'&&schData()&&schData().sheets)||null;}catch(e){return null;}}
function gdEval(){const pcb=!!(BD&&BD.comps&&BD.comps.some(c=>c.x!=null)&&!BD.pcbPending);
  const scope=GD.scope==='all'?(pcb?'all':'sch'):GD.scope;const g=GUIDE.evaluate(BD,{scope,sheets:gdSheets()});GD.last=g;return g;}
function gdOpen(){let m=$('#gdModal');if(!m){m=document.createElement('div');m.className='modal';m.id='gdModal';m.hidden=true;
    m.innerHTML=`<div class="sheet gdsheet" role="dialog" aria-modal="true" aria-labelledby="gdTitle"><div class="sheet-h"><h2 id="gdTitle">가이드라인 점수 세부</h2><button class="x" data-gdclose aria-label="닫기">✕</button></div><div class="gd-body" id="gdBody"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{if(e.target.id==='gdModal'||e.target.closest('[data-gdclose]')){gdClose();return;}
      const f=e.target.closest('[data-gdf]');if(f){GD.filter=f.dataset.gdf;gdPaint();return;}
      const sc=e.target.closest('[data-gdscope]');if(sc){GD.scope=sc.dataset.gdscope;gdPaint();return;}
      const ov=e.target.closest('[data-gdset]');if(ov){const [k,s]=ov.dataset.gdset.split('|');try{GUIDE.set(BD,k,s,'','user');}catch(err){toast(String(err.message||err));}gdAfterChange();return;}
      const con=e.target.closest('[data-gdcon]');if(con){gdClose();if(typeof copSubmit==='function'){setStep(BD.pcbPending?2:3);copSubmit('guide check');}return;}
      const row=e.target.closest('[data-gdrow]');if(row&&!e.target.closest('button,select,a')){const k=row.dataset.gdrow;GD.open.has(k)?GD.open.delete(k):GD.open.add(k);gdPaint();}});
    m.addEventListener('change',e=>{if(e.target.id==='gdPreset'){try{GUIDE.setPreset(BD,e.target.value);}catch(err){toast(String(err.message||err));}gdAfterChange();}
      else if(e.target.id==='gdCat'){GD.cat=e.target.value;gdPaint();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#gdModal').hidden)gdClose();});}
  m.hidden=false;gdPaint();}
function gdClose(){const m=$('#gdModal');if(m)m.hidden=true;}
function gdAfterChange(){try{if(typeof NX!=='undefined')NX.key=null;if(typeof nxStripPaint==='function')nxStripPaint();if(typeof markDirty==='function')markDirty();}catch(e){}gdPaint();}
function gdPaint(){const body=$('#gdBody');if(!body)return;let g;try{g=gdEval();}catch(e){body.innerHTML=`<p class="gd-err">점검을 실행하지 못했습니다: ${esc(String(e.message||e))}</p>`;return;}
  const scored=g.rules.filter(r=>r.status!=='na'&&r.status!=='manual');const tw=scored.reduce((s,r)=>s+r.w,0);
  const sc=r=>r.score!=null?r.score:r.status==='pass'?1:0;
  const rows=g.rules.map(r=>{const counted=r.status!=='na'&&r.status!=='manual';const s=counted?sc(r):null;
    return Object.assign({},r,{s,counted,gain:counted&&tw?r.w*s/tw*100:0,lost:counted&&tw?r.w*(1-s)/tw*100:0,crit:r.w>=8&&(r.status==='fail'||(r.status==='partial'&&s<0.5)||r.status==='manual'),pr:GUIDE.prio(r.w)});});
  const cats=[...new Set(rows.map(r=>r.cat))];if(GD.cat&&!cats.includes(GD.cat))GD.cat='';
  const cnt=k=>rows.filter(r=>r.status===k).length;const lostN=rows.filter(r=>r.lost>0.005).length;
  let list=rows.filter(r=>!GD.cat||r.cat===GD.cat);
  if(GD.filter==='lost')list=list.filter(r=>r.lost>0.005||r.status==='manual'||r.crit);else if(GD.filter!=='all')list=list.filter(r=>r.status===GD.filter);
  list.sort((a,b)=>GD.filter==='all'?(a.scope===b.scope?0:a.scope==='sch'?-1:1)||a.pr.tier-b.pr.tier||b.lost-a.lost:(b.crit-a.crit)||(b.lost-a.lost)||(a.pr.tier-b.pr.tier));
  const lostTot=rows.reduce((s,r)=>s+r.lost,0);
  const tone=g.crit?'err':g.pct>=90?'ok':g.pct>=75?'warn':'err';
  const st=GUIDE.state(BD);const presetSel=`<select id="gdPreset" aria-label="프리셋">${Object.entries(GUIDE.PRESETS).map(([k,v])=>`<option value="${k}"${st.preset===k?' selected':''}>${esc(v.label)}</option>`).join('')}</select>`;
  const chip=(k,l,n)=>`<button type="button" class="gd-chip${GD.filter===k?' on':''}" data-gdf="${k}">${l}${n!=null?` <b>${n}</b>`:''}</button>`;
  const scopeChip=(k,l)=>`<button type="button" class="gd-chip${GD.scope===k?' on':''}" data-gdscope="${k}">${l}</button>`;
  const bar=r=>r.counted?`<span class="gd-bar" title="점수 ${(r.s*100).toFixed(0)}%"><i style="width:${(r.s*100).toFixed(0)}%"></i></span>`:'<span class="gd-bar off"></span>';
  const item=r=>{const [lab,cls]=GD_ST[r.status]||[r.status,''];const open=GD.open.has(r.key);
    return`<li class="gd-row ${cls}${r.crit?' crit':''}${open?' open':''}" data-gdrow="${esc(r.key)}">
      <div class="gd-main"><span class="gd-st ${cls}">${lab}</span><span class="gd-t">${esc(r.title)}${r.crit?'<span class="gd-tag">핵심 미준수</span>':''}${r.by?`<span class="gd-tag m">수동 ${GD_ST[r.status]?GD_ST[r.status][0]:''}</span>`:''}</span>
        <span class="gd-m mono" title="${esc(r.pr.label)}">${esc(r.pr.label.split(' ')[0])} · ×${r.w}</span>${bar(r)}<span class="gd-n mono">${r.counted?(r.lost>0.005?'−'+r.lost.toFixed(1):'+'+r.gain.toFixed(1)):'—'}</span></div>
      ${open?`<div class="gd-det">
        <div class="gd-kv"><span>항목</span><span class="mono">${esc(r.key)} · ${esc(r.cat)} · ${r.scope==='pcb'?'PCB':'회로'}</span></div>
        <div class="gd-kv"><span>기준</span><span>${esc(r.desc||'')}</span></div>
        <div class="gd-kv"><span>판정 근거</span><span>${esc(r.ev||'—')}</span></div>
        ${r.counted?`<div class="gd-kv"><span>점수 반영</span><span class="mono">규칙 점수 ${(r.s*100).toFixed(0)}% × 중요도 ${r.w} ÷ 전체 중요도 ${tw} → ${r.gain.toFixed(1)}점 획득${r.lost>0.005?` · ${r.lost.toFixed(1)}점 감점`:''}</span></div>`:`<div class="gd-kv"><span>점수 반영</span><span>${r.status==='na'?'해당 없음 — 점수 계산에서 빠짐':'수동 확인 — 점수 계산에서 빠지고, 중요도 8 이상이면 핵심 미준수로 셈'}</span></div>`}
        ${r.fix?`<div class="gd-kv"><span>개선</span><span>${esc(r.fix)}</span></div>`:''}
        ${r.manualNote?`<div class="gd-kv"><span>사람이 확인</span><span>${esc(r.manualNote)}</span></div>`:''}
        ${r.ref?`<div class="gd-kv"><span>근거 문서</span><span>${esc(r.ref)}</span></div>`:''}
        ${r.note?`<div class="gd-kv"><span>메모</span><span>${esc(r.note)}</span></div>`:''}
        <div class="gd-acts"><span>판정 직접 지정:</span><button type="button" class="btn sm" data-gdset="${esc(r.key)}|pass">통과</button><button type="button" class="btn sm" data-gdset="${esc(r.key)}|fail">실패</button><button type="button" class="btn sm" data-gdset="${esc(r.key)}|na">해당 없음</button>${r.by?`<button type="button" class="btn sm ghost" data-gdset="${esc(r.key)}|auto">자동 판정으로</button>`:''}</div>
      </div>`:''}</li>`;};
  body.innerHTML=`<div class="gd-sum">
      <div class="gd-score ${tone}"><span class="mono">${g.pct.toFixed(0)}</span><small>점</small></div>
      <div class="gd-sumt"><b>${esc(g.verdict)}</b><div>통과 ${cnt('pass')} · 부분 ${cnt('partial')} · 실패 ${cnt('fail')} · 수동 확인 ${cnt('manual')} · 해당 없음 ${cnt('na')} — 핵심 미준수 ${g.crit}개</div>
        <div class="gd-formula">점수 = Σ(중요도 × 규칙 점수) ÷ Σ 중요도 × 100 · 통과 1 · 실패 0 · 부분 0–1 · 해당 없음 · 수동 확인은 제외 · 우수 = 핵심 미준수 0 & 90점 이상, 보통 = 핵심 미준수 ≤ 1 & 75점 이상</div></div>
      <div class="gd-ps"><label>프리셋 ${presetSel}</label><button type="button" class="btn sm ghost" data-gdcon title="콘솔에서 guide check (Claude 검토 포함)">콘솔에서 점검</button></div></div>
    <div class="gd-flt">${chip('lost','감점 · 확인 필요',lostN+cnt('manual'))}${chip('fail','실패',cnt('fail'))}${chip('partial','부분',cnt('partial'))}${chip('manual','수동 확인',cnt('manual'))}${chip('pass','통과',cnt('pass'))}${chip('na','해당 없음',cnt('na'))}${chip('all','전체',rows.length)}
      <span class="gd-sp"></span>${scopeChip('all','회로+PCB')}${scopeChip('sch','회로')}${scopeChip('pcb','PCB')}
      <select id="gdCat" aria-label="분류"><option value="">분류 전체</option>${cats.map(c=>`<option${GD.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="gd-hd"><span>판정</span><span>규칙 (누르면 근거 · 개선)</span><span>우선 · 중요도</span><span>규칙 점수</span><span>점수 영향</span></div>
    ${list.length?`<ul class="gd-list">${list.map(item).join('')}</ul>`:`<p class="gd-empty">${GD.filter==='lost'?'감점된 규칙이 없습니다.':'해당하는 규칙이 없습니다.'}</p>`}
    <p class="gd-foot">감점 합계 ${lostTot.toFixed(1)}점 — 위에서부터 고치면 점수가 가장 많이 오릅니다. 판정을 직접 지정하면 그 값이 점수에 들어가고, 보드와 함께 저장됩니다.</p>`;}
