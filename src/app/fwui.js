/* ---------- MCU firmware: parameters in the info card, code editor modal, co-simulated with the circuit ---------- */
const FWS={board:null,code:{},timer:0};
function fwMcu(){return BD?BD.comps.find(c=>c.fw)||null:null;}
function fwCode(c){c=c||fwMcu();if(!c)return'';return FWS.board===BD&&FWS.code[c.ref]!=null?FWS.code[c.ref]:c.fw;}
function fwSetCode(c,code){if(FWS.board!==BD){FWS.board=BD;FWS.code={};}FWS.code[c.ref]=code;}
// every port pin of the MCU (PA0…), connected or not, so firmware gets a clear message for unconnected pins
function fwPins(c){const pins={};c.pads.forEach(p=>{if(p.fn&&/^P[A-K]\d{1,2}$/.test(p.fn))pins[p.fn]=p.net||null;});return pins;}
function fwMcuDesc(c){const cs=SR.cfg&&SR.cfg.sp?SR.cfg.sp.ck:SIM.extractCircuit(BD);return{pins:fwPins(c),gnd:cs.gnd,vdd:3.3,ref:c.ref};}

// slider range for a parameter, from its name and default value
function fwRange(p){const v=Math.abs(p.value),n=p.name;
  if(/DUTY|PERCENT|PCT/.test(n))return[0,100,1];
  if(/FREQ|HZ/.test(n))return[50,Math.max(2000,v*2),10];
  const max=v<=0?100:Math.pow(10,Math.ceil(Math.log10(v*2.5)));const step=Number.isInteger(p.value)?(max>=1000?10:1):Math.pow(10,Math.floor(Math.log10(v||1))-1);return[0,max,step];}

/* ---- info-card section (shown when the MCU is selected) ---- */
function fwCardHTML(c){
  const ps=FW.params(fwCode(c)).filter(p=>!/OHM$/.test(p.name)).slice(0,8);
  const R=SR.fw,tr=SR.cfg&&SR.cfg.sp&&SR.cfg.sp.tran;let sum='';
  if(R&&R.error)sum=`<p class="fwsum" style="color:var(--err)">${esc(R.error)}</p>`;
  else if(R&&tr&&tr.anim&&!tr.error){const m=Object.values(tr.anim.mot)[0];const pw=(R.srcs||[]).find(s=>s.pwm),d=pw&&R.trace?R.trace.out[pw.id.slice(3)]:null;
    if(m)sum=`<p class="fwsum">마지막 실행: 출력축 ${(m.w[m.w.length-1]/(m.gear||1)*60/TAU).toFixed(0)} rpm${d?` · 최종 듀티 ${(d[d.length-1]*100).toFixed(0)} %`:''}${R.logs.length?` · 로그 ${R.logs.length}줄`:''}</p>`;}
  return`<div class="fwcard"><div class="sub">펌웨어 · 주요 파라미터</div>
    <div class="fwq">${ps.map(p=>`<label title="${esc(p.comment)}"><span>${esc(p.name)}</span><input type="number" step="any" data-fwp="${esc(p.name)}" value="${p.value}" aria-label="${esc(p.name)} ${esc(p.comment)}"></label>`).join('')}</div>
    <div class="acts"><button class="btn sm" data-fw="edit">코드 편집</button><button class="btn sm primary" data-fw="run">빌드 &amp; 시뮬레이션</button></div>${sum}</div>`;
}
$('#pane').addEventListener('click',e=>{const b=e.target.closest('[data-fw]');if(!b)return;if(b.dataset.fw==='edit')fwOpen();else fwRunAll(b);});
$('#pane').addEventListener('change',e=>{const i=e.target.closest('[data-fwp]');if(!i)return;const c=fwMcu();if(!c)return;const v=parseFloat(i.value);if(!isFinite(v))return;
  fwSetCode(c,FW.setParam(fwCode(c),i.dataset.fwp,v));if(!$('#fwModal').hidden)fwRender(true);toast(`${i.dataset.fwp} = ${v} · "빌드 & 시뮬레이션"을 누르면 반영됩니다.`);});

/* ---- run: firmware + circuit transient together ---- */
function fwRunAll(btn){
  const label=btn&&btn.textContent;if(btn){btn.disabled=true;btn.textContent='계산 중…';}
  setTimeout(()=>{let r;try{r=spRunTransient();}catch(e){console.error(e);r={error:e.message};}
    if(btn){btn.disabled=false;btn.textContent=label;}
    renderSim();updateLegend();refresh(true);if(!$('#fwModal').hidden)fwRender(false);
    if(r&&r.error)toast('실행하지 못했습니다: '+r.error);
    else if(r&&r.autoSteps)toast(`PWM 주파수에 맞춰 계산 단계를 ${r.autoSteps}로 늘렸습니다.`);},30);
}

/* ---- editor modal ---- */
function fwOpen(){const c=fwMcu();if(!c)return;$('#fwModal').hidden=false;fwRender(true);setTimeout(()=>$('#fwCode').focus(),30);}
function fwClose(){$('#fwModal').hidden=true;}
function fwRender(full){
  const c=fwMcu();if(!c){fwClose();return;}
  $('#fwTitle').textContent=`${c.ref} · ${c.val} 펌웨어`;$('#fwFile').textContent=`${c.ref.toLowerCase()}_firmware.js`;
  if(full){const ta=$('#fwCode'),st=ta.scrollTop;ta.value=fwCode(c);ta.scrollTop=st;}
  fwGutter();fwParams();fwResult();
}
function fwGutter(){const ta=$('#fwCode'),n=ta.value.split('\n').length,err=SR.fw&&SR.fw.error?SR.fw.line:null;
  $('#fwGut').innerHTML=Array.from({length:n},(_,i)=>`<span${err===i+1?' class="err"':''}>${i+1}</span>`).join('');$('#fwGut').scrollTop=ta.scrollTop;}
function fwParams(){
  const ps=FW.params($('#fwCode').value);
  $('#fwParams').innerHTML=ps.length?ps.map(p=>{const[mn,mx,st]=fwRange(p);return`<div class="fwp"><span class="nm"><span class="n">${esc(p.name)}</span>${p.comment?`<span class="c" title="${esc(p.comment)}">${esc(p.comment)}</span>`:''}</span>
    <input type="range" min="${mn}" max="${mx}" step="${st}" value="${Math.min(mx,Math.max(mn,p.value))}" data-fwpr="${esc(p.name)}" aria-label="${esc(p.name)} 조절"><input type="number" step="any" data-fwpn="${esc(p.name)}" value="${p.value}" aria-label="${esc(p.name)}"></div>`;}).join('')
    :'<p class="fwsum">코드 위쪽에 <code>const 이름 = 숫자; // 설명</code> 형식으로 적은 상수가 여기 파라미터로 나타납니다.</p>';
}
function fwApplyParam(name,v){const c=fwMcu(),ta=$('#fwCode'),st=ta.scrollTop;const code=FW.setParam(ta.value,name,v);ta.value=code;ta.scrollTop=st;fwSetCode(c,code);
  $('#fwParams').querySelectorAll(`[data-fwpn="${name}"],[data-fwpr="${name}"]`).forEach(x=>{if(document.activeElement!==x)x.value=v;});$('#fwMsg').textContent='변경됨 · 빌드 & 시뮬레이션으로 확인하세요';}
$('#fwParams').addEventListener('input',e=>{const r=e.target.closest('[data-fwpr]');if(r)fwApplyParam(r.dataset.fwpr,+r.value);});
$('#fwParams').addEventListener('change',e=>{const n=e.target.closest('[data-fwpn]');if(n){const v=parseFloat(n.value);if(isFinite(v))fwApplyParam(n.dataset.fwpn,v);}});
function miniChart(title,xs,ys,o){
  const W=320,H=64,ml=34,mr=6,mt=6,mb=14,pw=W-ml-mr,ph=H-mt-mb;if(!xs.length)return'';
  const xmax=xs[xs.length-1]||1,ymax=o.ymax!=null?o.ymax:Math.max(1e-9,...ys)*1.08,step=Math.max(1,Math.floor(xs.length/400));
  const sx=x=>ml+x/xmax*pw,sy=y=>mt+ph-Math.max(0,Math.min(1,y/ymax))*ph;let d='';
  for(let i=0;i<xs.length;i+=step){const x=sx(xs[i]).toFixed(1),y=sy(ys[i]).toFixed(1);if(o.stepped&&d){d+=`H${x}V${y}`;}else d+=(d?'L':'M')+x+' '+y;}
  return`<div class="fwchart"><div class="h"><span>${title}</span><b>${o.last||''}</b></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(title)}">
    <line x1="${ml}" x2="${W-mr}" y1="${mt+ph}" y2="${mt+ph}" stroke="var(--line)"/><line x1="${ml}" x2="${W-mr}" y1="${mt}" y2="${mt}" stroke="var(--line)" stroke-dasharray="2 3"/>
    <text x="${ml-4}" y="${mt+4}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="var(--f-mono)">${o.ylab||+ymax.toPrecision(2)}</text><text x="${ml-4}" y="${mt+ph}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="var(--f-mono)">0</text>
    <text x="${W-mr}" y="${H-2}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="var(--f-mono)">${xmax.toFixed(0)} ms</text>
    <path d="${d}" fill="none" stroke="${o.color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></div>`;
}
function fwResult(){
  const R=SR.fw,box=$('#fwResult');
  if(!R){box.innerHTML='<p class="fwsum">아직 실행하지 않았습니다. <b>빌드 &amp; 시뮬레이션</b>을 누르면 펌웨어의 <code>loop(ms)</code>가 1 ms마다 회로 해석과 함께 돌고, 결과가 여기와 3D 보기에 나타납니다.</p>';return;}
  let h='';
  if(R.error)h+=`<p class="fwerr">${esc(R.error)}${R.line?` <button class="btn sm" data-fwline="${R.line}">${R.line}번째 줄로</button>`:''}</p>`;
  else if(R.checkOnly)h+=`<p class="fwok">빌드 성공 · 출력 핀: ${esc(R.pins)}</p>`;
  const tr=SR.cfg&&SR.cfg.sp&&SR.cfg.sp.tran;
  if(R.trace&&tr&&!tr.error&&tr.anim){
    const T=R.trace,cols=['var(--s1)','var(--s2)','var(--s3)','var(--s4)'];let k=0;
    Object.keys(T.out).sort((a,b)=>{const pa=(R.srcs||[]).some(s=>s.id==='FW_'+a&&s.pwm),pb=(R.srcs||[]).some(s=>s.id==='FW_'+b&&s.pwm);return pb-pa;}).forEach(p=>{const src=(R.srcs||[]).find(s=>s.id==='FW_'+p);const pwm=src&&src.pwm;const ys=T.out[p].map(v=>pwm?v*100:v);
      h+=miniChart(`${p} ${pwm?'PWM 듀티':'출력'}`,T.t,ys,{ymax:pwm?100:1,ylab:pwm?'100%':'H',stepped:true,color:cols[k++%4],last:pwm?ys[ys.length-1].toFixed(1)+' %':(ys[ys.length-1]?'HIGH':'LOW')});});
    const A=tr.anim,ts=A.t.map(t=>t*1000);
    Object.keys(A.mot).forEach(r=>{const m=A.mot[r],rpm=m.w.map(w=>w/(m.gear||1)*60/TAU);h+=miniChart(`${r} 출력축 속도`,ts,rpm,{color:'var(--s5)',last:rpm[rpm.length-1].toFixed(0)+' rpm',ylab:Math.max(...rpm).toFixed(0)});
      // PWM chops the current every period: show a 2 ms moving average, the value the ADC filter also sees
      const ia=m.I.map(Math.abs),win=Math.max(1,Math.round(0.002/((A.t[1]-A.t[0])||1e-4))),avg=new Array(ia.length);let acc=0;
      for(let i=0;i<ia.length;i++){acc+=ia[i];if(i>=win)acc-=ia[i-win];avg[i]=acc/Math.min(i+1,win);}
      h+=miniChart(`${r} 모터 전류 (2 ms 평균)`,ts,avg,{color:'var(--s6)',last:SIM.fmtSI(avg[avg.length-1],'A'),ylab:SIM.fmtSI(Math.max(...avg),'A').replace(' ','')});});
  }
  if(R.logs&&R.logs.length)h+=`<div class="sub" style="margin-top:10px">로그</div><div class="fwlog">${R.logs.map(l=>`<div><span class="t">${l.ms} ms</span>${esc(l.text)}</div>`).join('')}</div>`;
  box.innerHTML=h;
}
$('#fwResult').addEventListener('click',e=>{const b=e.target.closest('[data-fwline]');if(!b)return;const n=+b.dataset.fwline,ta=$('#fwCode'),lines=ta.value.split('\n');let pos=0;for(let i=0;i<n-1;i++)pos+=lines[i].length+1;
  ta.focus();ta.setSelectionRange(pos,pos+(lines[n-1]||'').length);ta.scrollTop=Math.max(0,(n-6)*19);fwGutter();});
const fwTa=$('#fwCode');
fwTa.addEventListener('input',()=>{const c=fwMcu();if(!c)return;fwSetCode(c,fwTa.value);fwGutter();$('#fwMsg').textContent='변경됨';clearTimeout(FWS.timer);FWS.timer=setTimeout(()=>{fwParams();renderPane();},350);});
fwTa.addEventListener('scroll',()=>{$('#fwGut').scrollTop=fwTa.scrollTop;});
fwTa.addEventListener('keydown',e=>{
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();const s=fwTa.selectionStart,en=fwTa.selectionEnd;fwTa.setRangeText('  ',s,en,'end');fwTa.dispatchEvent(new Event('input'));}
  else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();fwRunAll($('#fwRun'));}
  else if(e.key==='Enter'){const s=fwTa.selectionStart,line=fwTa.value.slice(0,s).split('\n').pop(),ind=(line.match(/^\s*/)||[''])[0]+(/[{(]\s*$/.test(line)?'  ':'');if(ind){e.preventDefault();fwTa.setRangeText('\n'+ind,s,fwTa.selectionEnd,'end');fwTa.dispatchEvent(new Event('input'));}}
});
$('#fwRun').addEventListener('click',()=>fwRunAll($('#fwRun')));
$('#fwCheck').addEventListener('click',()=>{const c=fwMcu();const ctl=FW.controller(fwCode(c),fwMcuDesc(c));
  SR.fw=ctl.error?{error:ctl.error,line:ctl.line,logs:ctl.logs}:{checkOnly:true,logs:ctl.logs,pins:ctl.srcs.map(s=>`${s.id.slice(3)} (${s.pwm?'PWM '+s.freq+' Hz':'GPIO'})`).join(', ')};fwRender(false);
  $('#fwMsg').textContent=ctl.error?'빌드 실패':'빌드 성공';});
$('#fwReset').addEventListener('click',()=>{const c=fwMcu();if(!c)return;fwSetCode(c,c.fw);fwRender(true);renderPane();$('#fwMsg').textContent='기본 코드로 되돌렸습니다';});
$('#fw3d').addEventListener('click',()=>{fwClose();setWorkspace('board');if(S.view!=='3d'||S.sch==='full')setView('3d');playReset();});
$('#fwModal').addEventListener('click',e=>{if(e.target.id==='fwModal'||e.target.closest('[data-fwclose]'))fwClose();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#fwModal').hidden){e.stopPropagation();fwClose();}},true);
