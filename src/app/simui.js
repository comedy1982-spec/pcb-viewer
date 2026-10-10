/* ---------- simulation UI (shares viewer scope) ---------- */
const BLUE=['#104281','#184f95','#256abf','#3987e5','#6da7ec','#9ec5f4','#cde2fb'];
const ORANGE=['#4a1c0b','#7a2d10','#ab4017','#d95926','#eb6834','#f39a6f','#f9c8ad'];
const STATUS={good:'#0ca30c',warn:'#fab219',crit:'#d03b3b'};
function ramp(arr,t){t=Math.max(0,Math.min(1,isFinite(t)?t:0));const f=t*(arr.length-1),i=Math.min(arr.length-2,Math.floor(f)),k=f-i;
  const a=parseInt(arr[i].slice(1),16),b=parseInt(arr[i+1].slice(1),16);const m=(s)=>Math.round(((a>>s)&255)*(1-k)+((b>>s)&255)*k);return`rgb(${m(16)},${m(8)},${m(0)})`;}
function rampRGB(arr,t){const s=ramp(arr,t).match(/\d+/g).map(Number);return s;}
const ENV={cu:35,er:4.3,h:1.53,Ta:25,hconv:10};
const SR={tab:'ir',ir:null,si:null,th:null,sp:null,irView:'v',cfg:null,stale:{}};
S.panel='info';
const num=(v,d)=>{const x=parseFloat(v);return isFinite(x)?x:d;};
const padKey=p=>(p.ref||'?')+'.'+(p.n!=null?p.n:'');
const padLabel=p=>padKey(p)+(p.fn?' · '+p.fn:'');

function envSync(){
  $('#env-cu').value=String(ENV.cu);$('#env-h').value=ENV.h.toFixed(2);$('#env-er').value=ENV.er;$('#env-ta').value=ENV.Ta;$('#env-hc').value=String(ENV.hconv);
  $('#envSum').textContent=`${ENV.cu} µm · h ${ENV.h.toFixed(2)} mm · εr ${ENV.er} · ${ENV.Ta}°C`;
}
['env-cu','env-h','env-er','env-ta','env-hc'].forEach(id=>$('#'+id).addEventListener('change',()=>{
  ENV.cu=num($('#env-cu').value,35);ENV.h=Math.max(0.05,num($('#env-h').value,1.5));ENV.er=Math.max(1,num($('#env-er').value,4.3));ENV.Ta=num($('#env-ta').value,25);ENV.hconv=num($('#env-hc').value,10);
  envSync();if(SR.ir)SR.stale.ir=true;if(SR.th)SR.stale.th=true;if(SR.si)runSI();renderSim();refresh(false);}));

function simReset(){
  ENV.h=Math.max(0.1,BD.t-2*ENV.cu*1e-3);SR.ir=SR.si=SR.th=SR.sp=null;SR.fw=null;SR.stale={};SR.cfg={ir:null,th:null,sp:null,si:{z:50,zd:90}};
  if(S.panel==='sim')renderSim();else simCellsDirty();updateLegend();
}
function setPanel(p){
  S.panel=p;document.querySelectorAll('.pmode button').forEach(b=>b.setAttribute('aria-selected',b.dataset.panel===p?'true':'false'));
  $('#infoPane').hidden=p!=='info';$('#simPane').hidden=p!=='sim';$('.main').classList.toggle('simwide',p==='sim');
  if(p==='sim'){envSync();renderSim();}else renderPane();
  updateLegend();setTimeout(()=>{if(S.view==='3d')resize3D();else{measure();paint2D();}refresh(false);},0);
}
document.querySelectorAll('.pmode button').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel)));
document.querySelectorAll('.stabs button').forEach(b=>b.addEventListener('click',()=>{SR.tab=b.dataset.stab;if(SR.tab==='si'&&!SR.si)runSI();renderSim();updateLegend();refresh(false);}));
// which result is drawn over the board: the main sim panel's tab, unless a window cell sets OV_FORCE while it paints (null = none)
let OV_FORCE;
const ovKey=()=>{const t=OV_FORCE!==undefined?OV_FORCE:(S.panel==='sim'?SR.tab:null);return t&&SR[t]&&!SR[t].error?t:null;};
// window cells showing simulation panels re-render on the next paint
function simCellsDirty(){if(typeof POPS!=='undefined')POPS.forEach(C=>{if(C.hv&&isS(C.kind)){C.simDirty=true;C.draw();}});}

/* ---------- overlays ---------- */
function drawOverlay(ctx,side){
  const k=ovKey();if(!k)return;
  if(k==='th'){const R=SR.th;ctx.save();ctx.globalAlpha=0.92;ctx.imageSmoothingEnabled=true;ctx.translate(0,R.ny*R.cell);ctx.scale(R.cell,-R.cell);ctx.drawImage(R.img,0,0);ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=Math.max(0.08,BD.W/700);BD.comps.forEach(c=>{if(c.side!==side||c.kind==='none'||!(c.body.w>0))return;const b=c.body;ctx.save();ctx.translate(b.cx,b.cy);ctx.rotate(b.ang*D2R);ctx.strokeRect(-b.w/2,-b.h/2,b.w,b.h);ctx.restore();});return;}
  outlinePath(ctx);ctx.fillStyle='rgba(6,10,12,.62)';ctx.fill('evenodd');ctx.lineCap='round';ctx.lineJoin='round';
  if(k==='ir'){const R=SR.ir,v=SR.irView;const md=Math.max(1e-6,R.Vs-R.vmin,...R.pads.map(p=>R.Vs-p.v).filter(isFinite));
    const val=s=>v==='v'?(R.Vs-(s.va+s.vb)/2)/md:v==='i'?s.I/Math.max(R.maxI,1e-9):s.dT/Math.max(R.maxDT,1);
    const arr=v==='t'?ORANGE:BLUE;
    R.segs.forEach(s=>{if(s.L!==side)return;ctx.strokeStyle=ramp(arr,0.12+0.88*val(s));ctx.lineWidth=Math.max(s.w,0.12);ctx.beginPath();ctx.moveTo(s.a[0],s.a[1]);ctx.lineTo(s.b[0],s.b[1]);ctx.stroke();});
    R.pads.forEach(p=>{if(!padOn(p.pad,side))return;ctx.fillStyle=v==='v'&&isFinite(p.v)?ramp(BLUE,0.12+0.88*(R.Vs-p.v)/md):'#7c8a94';padPath(ctx,p.pad,0);});
    R.vias.forEach(q=>{ctx.fillStyle=v==='v'&&isFinite(q.v)?ramp(BLUE,0.12+0.88*(R.Vs-q.v)/md):'#7c8a94';circ(ctx,q.x,q.y,q.d/2);});
    if(padOn(R.src,side)){ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(0.12,BD.W/500);ctx.beginPath();ctx.arc(R.src.x,R.src.y,Math.max(R.src.w,R.src.h)*0.75+0.3,0,TAU);ctx.stroke();}
    return;}
  if(k==='si'){const R=SR.si,z=SR.cfg.si.z;
    R.nets.forEach(n=>{if(n.cls!=='신호')return;n.segs.forEach(s=>{if(s.L!==side)return;const m=SIM.microstrip(s.w,R.h,R.t*1e-3,R.er);const d=Math.abs(m.z0-z)/z;ctx.strokeStyle=d<=0.1?STATUS.good:d<=0.25?STATUS.warn:STATUS.crit;ctx.lineWidth=Math.max(s.w,0.12);ctx.beginPath();ctx.moveTo(s.a[0],s.a[1]);ctx.lineTo(s.b[0],s.b[1]);ctx.stroke();});});
    return;}
  if(k==='sp'){const R=SR.sp,vals=R.nets,vmax=Math.max(0.1,...Object.values(vals).map(Math.abs));const col=n=>vals[n]==null?null:ramp(BLUE,0.12+0.88*Math.abs(vals[n])/vmax);
    const L=BD.layers[side+'.cu'];
    drawPrims(ctx,L,p=>{if(p.t==='text'||p.clear||!p.net)return null;const c=col(p.net);if(!c)return null;return p.t==='poly'||p.t==='pour'?c.replace('rgb','rgba').replace(')',',.45)'):c;},{clear:'rgba(6,10,12,1)'});
    BD.vias.forEach(v=>{const c=v.net&&col(v.net);if(c){ctx.fillStyle=c;circ(ctx,v.x,v.y,v.d/2);}});}
}
function overlayTip(h,x,y){
  const k=ovKey();if(!k)return'';const f=SIM.fmtSI;
  if(k==='th'){const R=SR.th;const i=Math.floor(x/R.cell),j=Math.floor(y/R.cell);if(i<0||j<0||i>=R.nx||j>=R.ny)return'';const T=R.T[j*R.nx+i];return isFinite(T)?`<div>보드 온도 <b>${T.toFixed(1)} °C</b></div>`:'';}
  if(!h)return'';
  if(k==='ir'){const R=SR.ir;if(h.net!==R.net)return'';
    if(h.type==='track'){let best=null,bd=1e9;R.segs.forEach(s=>{if(s.L!==h.side)return;const d=PCB.segDist(x,y,s.a,s.b);if(d<bd){bd=d;best=s;}});if(best)return`<div>${f((best.va+best.vb)/2,'V',3)} · ${f(best.I,'A')} · ΔT ${best.dT.toFixed(1)} °C</div>`;}
    if(h.type==='pad'){const p=R.pads.find(q=>q.pad===h.p);if(p)return`<div>${f(p.v,'V',4)} (강하 ${f(R.Vs-p.v,'V')})</div>`;}return'';}
  if(k==='si'&&h.type==='track'){const m=SIM.microstrip(h.t.w,SR.si.h,SR.si.t*1e-3,SR.si.er);return`<div>Z₀ ${m.z0.toFixed(0)} Ω · ${m.ps.toFixed(2)} ps/mm</div>`;}
  if(k==='sp'&&h.net&&SR.sp.nets[h.net]!=null)return`<div>${f(SR.sp.nets[h.net],'V',3)}</div>`;
  return'';
}
function updateLegend(){const el=$('#legend'),html=legendHTML(ovKey());el.hidden=!html;if(html)el.innerHTML=html;}
function legendHTML(k){
  if(!k)return'';let html='';const el={set innerHTML(v){html=v;}};
  const bar=arr=>`<div class="bar" style="background:linear-gradient(90deg,${arr.slice(1).join(',')})"></div>`;
  if(k==='ir'){const R=SR.ir,v=SR.irView;const md=Math.max(0,R.Vs-R.vmin,...R.pads.map(p=>R.Vs-p.v).filter(isFinite));
    const [t,arr,hi]=v==='v'?['전압 강하 · '+R.net,BLUE,SIM.fmtSI(md,'V')]:v==='i'?['트랙 전류 · '+R.net,BLUE,SIM.fmtSI(R.maxI,'A')]:['온도 상승 (IPC-2221) · '+R.net,ORANGE,Math.max(R.maxDT,1).toFixed(1)+' °C'];
    el.innerHTML=`<span class="lt">${esc(t)}</span>${bar(arr)}<div class="lr"><span>0</span><span>${hi}</span></div>`;}
  else if(k==='th'){const R=SR.th;el.innerHTML=`<span class="lt">보드 온도</span>${bar(ORANGE)}<div class="lr"><span>${R.tmin.toFixed(1)} °C</span><span>${R.tmax.toFixed(1)} °C</span></div>`;}
  else if(k==='si'){el.innerHTML=`<span class="lt">특성 임피던스 · 목표 ${SR.cfg.si.z} Ω</span><div class="chips"><span><i style="background:${STATUS.good}"></i>±10% 이내</span><span><i style="background:${STATUS.warn}"></i>±25% 이내</span><span><i style="background:${STATUS.crit}"></i>벗어남</span></div>`;}
  else if(k==='sp'){const vmax=Math.max(0.1,...Object.values(SR.sp.nets).map(Math.abs));el.innerHTML=`<span class="lt">넷 전압 · ${esc(SR.sp.label)}</span>${bar(BLUE)}<div class="lr"><span>0 V</span><span>${vmax.toFixed(2)} V</span></div>`;}
  return html;
}

/* ---------- IR drop ---------- */
function irConfig(){
  if(SR.cfg.ir)return SR.cfg.ir;
  const pw=BD.netOrder.filter(n=>BD.netClass(n)==='전원'&&BD.nets[n].pads.length>=2);
  const net=pw.sort((a,b)=>BD.nets[b].pads.length-BD.nets[a].pads.length)[0]||BD.netOrder.find(n=>BD.nets[n].pads.length>=2)||null;
  SR.cfg.ir={net,src:null,V:3.3,total:300,loads:{}};if(net)irPickNet(net);return SR.cfg.ir;
}
function irPads(net){return net?(BD.nets[net].pads||[]):[];}
function irPickNet(net){
  const c=SR.cfg.ir;c.net=net;c.V=SIM.nominalV(net);const pads=irPads(net);
  const segs=BD.nets[net].tracks;const touched=p=>segs.some(t=>{const e=t.t==='seg'?[t.a,t.b]:[t.pts[0],t.pts[t.pts.length-1]];return e.some(q=>Math.abs(q[0]-p.x)<=Math.max(p.w,p.h)/2&&Math.abs(q[1]-p.y)<=Math.max(p.w,p.h)/2);})||BD.layers['T.cu'].concat(BD.layers['B.cu']).some(z=>z.t==='poly'&&z.net===net);
  const src=pads.find(p=>/OUT/i.test(p.fn||'')&&touched(p))||pads.find(p=>/OUT/i.test(p.fn||''))||pads.find(p=>p.ref&&/^(U|VR|PS)\d/.test(p.ref)&&BD.byRef[p.ref]&&/1117|LDO|REG|78/i.test(BD.byRef[p.ref].val))||pads.find(p=>p.ref&&/^(J|P|CN|USB)\d/i.test(p.ref))||pads[0];
  c.src=src?padKey(src):null;irDistribute();
}
function irDistribute(){
  const c=SR.cfg.ir;const pads=irPads(c.net).filter(p=>padKey(p)!==c.src);const srcRef=(c.src||'').split('.')[0];
  let tgt=pads.filter(p=>p.ref&&/^(U|IC)\d/.test(p.ref)&&p.ref!==srcRef);if(!tgt.length)tgt=pads;
  c.loads={};pads.forEach(p=>{c.loads[padKey(p)]=0;});tgt.forEach(p=>{c.loads[padKey(p)]=+(c.total/tgt.length).toFixed(2);});
}
function runIR(){
  const c=SR.cfg.ir;const pads=irPads(c.net);const src=pads.find(p=>padKey(p)===c.src);
  if(!src){SR.ir={error:'공급 핀을 고르세요.'};return;}
  const loads=pads.filter(p=>padKey(p)!==c.src&&c.loads[padKey(p)]>0).map(p=>({pad:p,I:c.loads[padKey(p)]/1000}));
  try{SR.ir=SIM.irSolve(BD,c.net,ENV,src,c.V,loads);}catch(e){console.error(e);SR.ir={error:'계산 중 오류: '+e.message};}
  SR.stale.ir=false;
}
function irHTML(){
  const c=irConfig();const f=SIM.fmtSI;
  if(!c.net)return'<p class="lead">전원 경로를 계산할 넷이 없습니다.</p>';
  const nets=BD.netOrder.filter(n=>BD.nets[n].pads.length>=2);
  const pads=irPads(c.net);
  const rows=pads.filter(p=>padKey(p)!==c.src).map(p=>{const k=padKey(p);return`<tr><td class="mono">${esc(k)}</td><td>${esc(p.fn||'')}</td><td class="r"><input type="number" min="0" step="1" data-load="${esc(k)}" value="${c.loads[k]||0}" aria-label="${esc(k)} 부하 전류 mA" id="ld-${esc(k).replace(/[^\w]/g,'_')}"></td></tr>`;}).join('');
  let res='';const R=SR.ir;
  if(R&&R.error)res=`<p class="errline">${esc(R.error)}</p>`;
  else if(R){
    const top=R.segs.slice().sort((a,b)=>b.I-a.I).slice(0,5);
    res=`<div class="res"><div class="acts" style="justify-content:space-between"><h4>결과 · ${esc(R.net)}</h4><div class="vt" role="group" aria-label="표시 값">${[['v','전압 강하'],['i','전류'],['t','온도 상승']].map(([k,l])=>`<button data-irv="${k}" aria-pressed="${SR.irView===k}">${l}</button>`).join('')}</div></div>
    ${SR.stale.ir?'<p class="stale">기판 조건이 바뀌었습니다. 다시 계산하세요.</p>':''}
    <div class="kpis"><div class="kpi"><b>${f(R.vmin,'V',3)}</b><span>부하 핀 최저 전압${R.worst?' · '+esc(padKey(R.worst.pad)):''}</span></div>
    <div class="kpi"><b>${f(R.Vs-R.vmin,'V')}</b><span>최대 전압 강하 (${((R.Vs-R.vmin)/R.Vs*100).toFixed(2)}%)</span></div>
    <div class="kpi"><b>${f(R.loss,'W')}</b><span>배선 손실 전력</span></div>
    <div class="kpi"><b>${R.maxDT.toFixed(1)} °C</b><span>최대 트랙 온도 상승${R.over?` · 10°C 넘는 구간 ${R.over}개`:''}</span></div></div>
    ${R.unconnected.length?`<p class="stale">공급 핀과 연결되지 않은 부하: ${R.unconnected.map(l=>esc(padKey(l.pad))).join(', ')}</p>`:''}
    ${top.length?`<table class="stbl"><thead><tr><th>전류가 큰 트랙</th><th class="r">폭</th><th class="r">전류</th><th class="r">ΔT</th></tr></thead><tbody>${top.map(s=>`<tr><td>${s.L==='T'?'상단':'하단'} (${s.a[0].toFixed(1)}, ${s.a[1].toFixed(1)})</td><td class="r mono">${s.w.toFixed(2)}</td><td class="r mono">${f(s.I,'A')}</td><td class="r mono">${s.dT.toFixed(1)}</td></tr>`).join('')}</tbody></table>`:''}
    <p class="lead">트랙 저항은 ρ·길이/(폭·두께), 비아는 도금 25 µm 기준입니다. 동박면(존)은 단순화해 근사했고, 온도 상승은 IPC-2221 외층 공식입니다.</p></div>`;
  }
  return`<div class="sim"><p class="lead">공급 핀에서 각 부하 핀까지 동박을 따라 흐르는 직류 전류를 풀어 전압 강하와 트랙 발열을 계산합니다.</p>
  <div class="row2"><label class="fld"><span>넷</span><select id="ir-net">${nets.map(n=>`<option${n===c.net?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
  <label class="fld"><span>공급 핀</span><select id="ir-src">${pads.map(p=>`<option value="${esc(padKey(p))}"${padKey(p)===c.src?' selected':''}>${esc(padLabel(p))}</option>`).join('')}</select></label></div>
  <div class="row2"><label class="fld"><span>공급 전압 (V)</span><input type="number" step="0.1" id="ir-v" value="${c.V}"></label>
  <label class="fld"><span>총 부하 전류 (mA)</span><input type="number" step="10" min="0" id="ir-total" value="${c.total}"></label></div>
  <div class="acts"><button class="btn sm" id="ir-dist">IC 핀에 나눠 넣기</button><span class="lead">부하 ${Object.values(c.loads).filter(v=>v>0).length}개 · 합계 ${Object.values(c.loads).reduce((a,b)=>a+(+b||0),0).toFixed(0)} mA</span></div>
  <div class="scroll"><table class="stbl"><thead><tr><th>부하 핀</th><th>기능</th><th class="r">mA</th></tr></thead><tbody>${rows||'<tr><td colspan="3">다른 핀이 없습니다.</td></tr>'}</tbody></table></div>
  <div class="acts"><button class="btn primary" id="ir-run">전압 강하 계산</button></div>${res}</div>`;
}
function irBind(b){
  const c=SR.cfg.ir;
  b.querySelector('#ir-net')?.addEventListener('change',e=>{irPickNet(e.target.value);SR.ir=null;renderSim();refresh(false);});
  b.querySelector('#ir-src')?.addEventListener('change',e=>{c.src=e.target.value;irDistribute();renderSim();});
  b.querySelector('#ir-v')?.addEventListener('change',e=>{c.V=num(e.target.value,c.V);});
  b.querySelector('#ir-total')?.addEventListener('change',e=>{c.total=Math.max(0,num(e.target.value,c.total));});
  b.querySelector('#ir-dist')?.addEventListener('click',()=>{c.total=Math.max(0,num(b.querySelector('#ir-total').value,c.total));irDistribute();renderSim();});
  b.querySelectorAll('[data-load]').forEach(i=>i.addEventListener('change',()=>{c.loads[i.dataset.load]=Math.max(0,num(i.value,0));}));
  b.querySelector('#ir-run')?.addEventListener('click',()=>{runIR();S.hlNet=null;renderSim();updateLegend();refresh(false);});
  b.querySelectorAll('[data-irv]').forEach(x=>x.addEventListener('click',()=>{SR.irView=x.dataset.irv;renderSim();updateLegend();refresh(false);}));
}

/* ---------- SI ---------- */
function runSI(){SR.si=SIM.siAnalyze(BD,ENV);}
function zStatus(z,t){const d=Math.abs(z-t)/t;return d<=0.1?['good','적합']:d<=0.25?['warn','주의']:['crit','벗어남'];}
function siHTML(){
  const R=SR.si,cfg=SR.cfg.si,f=SIM.fmtSI;if(!R)return'';
  const sig=R.nets.filter(n=>n.cls==='신호');
  const pairs=R.pairs.map(p=>{const[sk,sl]=p.zdiff!=null?zStatus(p.zdiff,cfg.zd):['na','간격 정보 없음'];return`<tr><td class="mono">${esc(p.base)}</td><td class="r mono">${p.P.len.toFixed(1)} / ${p.N.len.toFixed(1)}</td><td class="r mono">${p.mis.toFixed(2)}</td><td class="r mono">${p.skew.toFixed(1)}</td><td class="r mono">${p.zdiff!=null?p.zdiff.toFixed(0):'—'}</td><td><span class="st ${sk}"><i></i>${sl}</span></td></tr>`;}).join('');
  const rows=sig.slice(0,80).map(n=>{
    const zs=Math.abs(n.zmax-n.zmin)<0.5?n.zmin.toFixed(0):`${n.zmin.toFixed(0)}–${n.zmax.toFixed(0)}`;
    const worst=Math.max(Math.abs(n.zmin-cfg.z),Math.abs(n.zmax-cfg.z))/cfg.z;const st=worst<=0.1?['good','적합']:worst<=0.25?['warn','주의']:['crit','벗어남'];
    return`<tr class="click${S.hlNet===n.net?' on':''}" data-sinet="${esc(n.net)}"><td class="mono">${esc(n.net)}</td><td class="r mono">${n.len.toFixed(1)}</td><td class="r mono">${n.delay.toFixed(0)}</td><td class="r mono">${zs}</td><td class="r mono">${n.vias}</td><td><span class="st ${st[0]}"><i></i>${st[1]}</span></td></tr>`;}).join('');
  const two=BD.copperLayers<=2;
  return`<div class="sim"><p class="lead">트랙 폭과 기판 조건으로 마이크로스트립 특성 임피던스, 전파 지연, 차동쌍 길이 차이를 계산합니다.</p>
  <div class="row2"><label class="fld"><span>목표 임피던스 (Ω)</span><input type="number" id="si-z" value="${cfg.z}" step="1"></label><label class="fld"><span>차동 목표 (Ω)</span><input type="number" id="si-zd" value="${cfg.zd}" step="1"></label></div>
  ${two?`<p class="stale">2층 보드는 기준면(반대면 GND)까지 ${R.h.toFixed(2)} mm로 멀어서 임피던스가 높게 나옵니다. 4층 이상이면 "기판 조건"에서 기준면까지 거리를 내층 유전체 두께로 바꾸세요.</p>`:''}
  <div class="res"><h4>기준 폭 0.25 mm 트랙</h4><div class="kpis"><div class="kpi"><b>${R.ref.z0.toFixed(1)} Ω</b><span>특성 임피던스</span></div><div class="kpi"><b>${R.ref.ps.toFixed(2)} ps/mm</b><span>전파 지연 (εeff ${R.ref.eeff.toFixed(2)})</span></div></div>
  <div class="acts"><span class="lead">목표 ${cfg.z} Ω에 맞는 폭:</span><b class="mono">${widthFor(cfg.z,R)}</b></div></div>
  ${R.pairs.length?`<div><h4 style="margin:0 0 6px;font-size:13px">차동쌍</h4><div class="scroll"><table class="stbl"><thead><tr><th>쌍</th><th class="r">길이 P/N mm</th><th class="r">차이 mm</th><th class="r">스큐 ps</th><th class="r">Zdiff Ω</th><th>판정</th></tr></thead><tbody>${pairs}</tbody></table></div></div>`:''}
  <div><h4 style="margin:0 0 6px;font-size:13px">신호 넷 ${sig.length}개 (긴 순서)</h4><div class="scroll" style="max-height:320px"><table class="stbl"><thead><tr><th>넷</th><th class="r">길이 mm</th><th class="r">지연 ps</th><th class="r">Z₀ Ω</th><th class="r">비아</th><th>판정</th></tr></thead><tbody>${rows||'<tr><td colspan="6">트랙이 있는 신호 넷이 없습니다.</td></tr>'}</tbody></table></div></div>
  <p class="lead">임피던스 관리는 USB·클럭 같은 고속 신호에만 필요하고, I²C나 GPIO 같은 느린 신호는 벗어나도 문제없습니다. Hammerstad 마이크로스트립 근사식 기준이며, 솔더마스크 영향과 주변 동박면 결합은 넣지 않았습니다. 행을 누르면 보드에서 넷을 강조합니다.</p></div>`;
}
function widthFor(z,R){let lo=0.02,hi=10;const zf=w=>SIM.microstrip(w,R.h,R.t*1e-3,R.er).z0;if(zf(hi)>z)return'10 mm 초과';for(let i=0;i<50;i++){const m=(lo+hi)/2;if(zf(m)>z)lo=m;else hi=m;}return((lo+hi)/2).toFixed(2)+' mm';}
function siBind(b){
  b.querySelector('#si-z')?.addEventListener('change',e=>{SR.cfg.si.z=Math.max(1,num(e.target.value,50));renderSim();updateLegend();refresh(false);});
  b.querySelector('#si-zd')?.addEventListener('change',e=>{SR.cfg.si.zd=Math.max(1,num(e.target.value,90));renderSim();});
  b.querySelectorAll('[data-sinet]').forEach(r=>r.addEventListener('click',()=>{const n=r.dataset.sinet;S.hlNet=S.hlNet===n?null:n;S.selRef=null;renderSim();refresh(false);}));
}

/* ---------- thermal ---------- */
function thConfig(){
  if(SR.cfg.th)return SR.cfg.th;const P={};
  BD.comps.forEach(c=>{if(c.kind!=='none')P[c.ref]=0;});
  if(BD.source==='예제'&&!BD.demo)Object.assign(P,{U2:0.45,U1:0.12,U3:0.03,D1:0.008,R2:0.006});
  if(BD.demo==='mcu')Object.assign(P,{M1:0.9,U2:0.03,U1:0.05,Q1:0.02,D1:0.05,R5:0.01});
  SR.cfg.th={P,res:160};return SR.cfg.th;
}
function coverageGrid(res){
  const cell=Math.max(BD.W,BD.H)/res,nx=Math.ceil(BD.W/cell),ny=Math.ceil(BD.H/cell),n=nx*ny;
  const cv=document.createElement('canvas');cv.width=nx;cv.height=ny;const c=cv.getContext('2d',{willReadFrequently:true});
  const read=()=>c.getImageData(0,0,nx,ny).data;const setT=()=>{c.setTransform(1/cell,0,0,-1/cell,0,ny);};
  c.clearRect(0,0,nx,ny);setT();outlinePath(c);c.fillStyle='#fff';c.fill('evenodd');let d=read();
  const mask=new Uint8Array(n);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){mask[j*nx+i]=d[((ny-1-j)*nx+i)*4+3]>110?1:0;}
  const cov=new Float32Array(n);
  ['T','B'].forEach(L=>{c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,nx,ny);setT();c.lineCap='round';c.lineJoin='round';
    drawPrims(c,BD.layers[L+'.cu'],p=>p.t==='text'||p.clear?null:'#fff',{clear:'#fff'});c.fillStyle='#fff';BD.vias.forEach(v=>circ(c,v.x,v.y,v.d/2));
    d=read();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)cov[j*nx+i]+=d[((ny-1-j)*nx+i)*4+3]/255;});
  return{nx,ny,cell,a:cell*1e-3,mask,cov};
}
function compCells(c,g){
  const b=c.body,out=[];const a=-b.ang*D2R,ca=Math.cos(a),sa=Math.sin(a);
  if(b.w>0&&b.h>0){const r=Math.hypot(b.w,b.h)/2;const i0=Math.max(0,Math.floor((b.cx-r)/g.cell)),i1=Math.min(g.nx-1,Math.floor((b.cx+r)/g.cell)),j0=Math.max(0,Math.floor((b.cy-r)/g.cell)),j1=Math.min(g.ny-1,Math.floor((b.cy+r)/g.cell));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=(i+0.5)*g.cell-b.cx,y=(j+0.5)*g.cell-b.cy,lx=x*ca-y*sa,ly=x*sa+y*ca;if(Math.abs(lx)<=b.w/2&&Math.abs(ly)<=b.h/2&&g.mask[j*g.nx+i])out.push(j*g.nx+i);}}
  if(!out.length){const i=Math.min(g.nx-1,Math.max(0,Math.floor(b.cx/g.cell))),j=Math.min(g.ny-1,Math.max(0,Math.floor(b.cy/g.cell)));out.push(j*g.nx+i);}
  return out;
}
function runTH(){
  const cfg=thConfig();const g=coverageGrid(cfg.res);const P=new Float64Array(g.nx*g.ny);let tot=0;
  const cells={};BD.comps.forEach(c=>{const w=+cfg.P[c.ref]||0;cells[c.ref]=compCells(c,g);if(w>0){tot+=w;const cs=cells[c.ref];cs.forEach(k=>{P[k]+=w/cs.length;});}});
  if(!(tot>0)){SR.th={error:'소비전력이 0입니다. 부품별 전력을 넣어 주세요.'};return;}
  const r=SIM.thermalSolve(g,{t:BD.t,cu:ENV.cu,hconv:ENV.hconv,Ta:ENV.Ta},P);
  const img=document.createElement('canvas');img.width=g.nx;img.height=g.ny;const ic=img.getContext('2d');const id=ic.createImageData(g.nx,g.ny);
  const span=Math.max(1e-6,r.tmax-ENV.Ta);
  for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){const k=j*g.nx+i,T=r.T[k];const o=((g.ny-1-j)*g.nx+i)*4;if(!isFinite(T)){id.data[o+3]=0;continue;}const t=(T-ENV.Ta)/span;const c=rampRGB(ORANGE,t);id.data[o]=c[0];id.data[o+1]=c[1];id.data[o+2]=c[2];id.data[o+3]=Math.round(255*(0.18+0.8*Math.min(1,t*1.3)));}
  ic.putImageData(id,0,0);
  const hot=BD.comps.filter(c=>c.kind!=='none').map(c=>({ref:c.ref,val:c.val,P:+cfg.P[c.ref]||0,T:Math.max(...cells[c.ref].map(k=>r.T[k]).filter(isFinite))})).filter(x=>isFinite(x.T)).sort((a,b)=>b.T-a.T);
  SR.th=Object.assign(r,{img,nx:g.nx,ny:g.ny,cell:g.cell,tot,hot,tmin:Math.min(ENV.Ta,r.tmin)});SR.stale.th=false;
}
function thHTML(){
  const cfg=thConfig(),R=SR.th;
  const comps=BD.comps.filter(c=>c.kind!=='none');
  const rows=comps.map(c=>`<tr><td class="mono">${esc(c.ref)}</td><td>${esc((c.val||'').slice(0,18))}</td><td class="r"><input type="number" min="0" step="0.01" data-pw="${esc(c.ref)}" value="${cfg.P[c.ref]||0}" aria-label="${esc(c.ref)} 소비전력 W" id="pw-${esc(c.ref).replace(/[^\w]/g,'_')}"></td></tr>`).join('');
  let res='';
  if(R&&R.error)res=`<p class="errline">${esc(R.error)}</p>`;
  else if(R)res=`<div class="res"><h4>결과</h4>${SR.stale.th?'<p class="stale">기판 조건이 바뀌었습니다. 다시 계산하세요.</p>':''}
    <div class="kpis"><div class="kpi"><b>${R.tmax.toFixed(1)} °C</b><span>보드 최고 온도</span></div><div class="kpi"><b>+${(R.tmax-ENV.Ta).toFixed(1)} °C</b><span>주변 대비 상승 · 총 ${SIM.fmtSI(R.tot,'W')}</span></div></div>
    <table class="stbl"><thead><tr><th>뜨거운 부품</th><th class="r">전력</th><th class="r">보드 온도</th></tr></thead><tbody>${R.hot.slice(0,6).map(h=>`<tr class="click" data-thref="${esc(h.ref)}"><td class="mono">${esc(h.ref)} <span class="cls">${esc((h.val||'').slice(0,14))}</span></td><td class="r mono">${SIM.fmtSI(h.P,'W')}</td><td class="r mono">${h.T.toFixed(1)} °C</td></tr>`).join('')}</tbody></table>
    <p class="lead">보드를 얇은 판으로 보고 FR-4와 동박의 면방향 열전도, 양면 공기 냉각만으로 정상 상태를 풀었습니다. 부품 내부(접합) 온도는 여기에 부품의 열저항×전력을 더해야 합니다.</p></div>`;
  return`<div class="sim"><p class="lead">부품별 소비전력을 넣으면 보드 위 온도 분포를 근사 계산해 열 지도로 보여줍니다. 동박이 많은 곳일수록 열이 잘 퍼집니다.</p>
  <div class="acts">${SR.sp&&SR.sp.parts?'<button class="btn sm" id="th-imp">회로 결과의 전력 가져오기</button>':''}<button class="btn sm" id="th-ic">IC마다 0.1 W</button><button class="btn sm ghost" id="th-zero">모두 0</button></div>
  <div class="scroll"><table class="stbl"><thead><tr><th>부품</th><th>값</th><th class="r">W</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="row2"><label class="fld"><span>계산 격자</span><select id="th-res"><option value="120"${cfg.res==120?' selected':''}>빠르게 (120칸)</option><option value="160"${cfg.res==160?' selected':''}>보통 (160칸)</option><option value="260"${cfg.res==260?' selected':''}>정밀 (260칸)</option></select></label><div class="fld"><span>&nbsp;</span><button class="btn primary" id="th-run">열 분포 계산</button></div></div>${res}</div>`;
}
function thBind(b){
  const cfg=SR.cfg.th;
  b.querySelectorAll('[data-pw]').forEach(i=>i.addEventListener('change',()=>{cfg.P[i.dataset.pw]=Math.max(0,num(i.value,0));}));
  b.querySelector('#th-res')?.addEventListener('change',e=>{cfg.res=+e.target.value;});
  b.querySelector('#th-ic')?.addEventListener('click',()=>{BD.comps.forEach(c=>{if(c.kind==='ic')cfg.P[c.ref]=0.1;});renderSim();});
  b.querySelector('#th-zero')?.addEventListener('click',()=>{Object.keys(cfg.P).forEach(k=>cfg.P[k]=0);renderSim();});
  b.querySelector('#th-imp')?.addEventListener('click',()=>{importPower();renderSim();});
  b.querySelector('#th-run')?.addEventListener('click',()=>{const btn=b.querySelector('#th-run');btn.disabled=true;btn.textContent='계산 중…';setTimeout(()=>{try{runTH();}catch(e){console.error(e);SR.th={error:'계산 중 오류: '+e.message};}renderSim();updateLegend();refresh(false);},20);});
  b.querySelectorAll('[data-thref]').forEach(r=>r.addEventListener('click',()=>{S.selRef=r.dataset.thref;S.hlNet=null;refresh(false);}));
}
function importPower(){const cfg=thConfig();if(!SR.sp||!SR.sp.parts)return;Object.keys(cfg.P).forEach(k=>cfg.P[k]=0);SR.sp.parts.forEach(p=>{if(p.ref&&cfg.P[p.ref]!=null&&p.P>0)cfg.P[p.ref]=+(cfg.P[p.ref]+p.P).toFixed(4);});}

/* ---------- circuit ---------- */
const TYPE_LABEL={R:'저항',C:'커패시터',L:'인덕터',D:'다이오드',SW:'스위치',LOAD:'IC 부하',REG:'레귤레이터',V:'전압 소스',NMOS:'N-MOSFET · Vth',MOTOR:'DC 모터 · 부하 토크'};
function spConfig(){
  if(SR.cfg.sp)return SR.cfg.sp;const ck=SIM.extractCircuit(BD);
  let tstop=12,steps=1200;
  if(BD.demo==='mcu'){
    // MCU board: 5 V applied at t = 0; the firmware drives PA8 (PWM) and PB3 (LED) during the run
    ck.srcs.forEach(s=>{if(s.n[0]==='VIN'){s.wave='dc';s.label='J1 5 V 입력 전원';}});
    ck.els.forEach(e=>{if(e.type==='LOAD'&&e.ref==='U1')e.I=0.015;});
    tstop=800;steps=10000;
  }
  else if(BD.source==='예제'){ck.els.forEach(e=>{if(e.type==='LOAD')e.I=e.ref==='U1'?0.02:0.008;});if(BD.nets.LED)ck.srcs.push({id:'V2',type:'V',n:['LED',ck.gnd],v:3.3,wave:'pulse',t0:3e-3,per:4e-3,duty:0.5,tr:1e-3,label:'U1 GPIO (PB3) 출력 · 예시'});}
  const probes=[...new Set(ck.srcs.map(s=>s.n[0]).concat(ck.els.filter(e=>e.type==='REG').map(e=>e.n[1])).concat(BD.nets.LED_A?['LED_A']:[]).concat(ck.els.filter(e=>e.type==='MOTOR').map(e=>e.n[1])).concat(BD.nets.ISNS_ADC?['ISNS_ADC']:[]))].slice(0,4);
  SR.cfg.sp={ck,tstop,steps,probes,tran:null,hidden:{}};return SR.cfg.sp;
}
const valStr=e=>e.type==='MOTOR'?(e.tl*1000).toFixed(2):e.type==='NMOS'?String(e.vth):e.type==='R'?SIM.fmtSI(e.val,'Ω').replace(' ',''):e.type==='C'?SIM.fmtSI(e.val,'F').replace(' ',''):e.type==='L'?SIM.fmtSI(e.val,'H').replace(' ',''):e.type==='LOAD'?(e.I*1000).toFixed(1):e.type==='REG'?e.vset:'';
// transient run; when the board has an MCU with firmware, its loop() is co-simulated and drives the MCU pins
function spRunTransient(){
  const cfg=spConfig(),ck=cfg.ck,mcu=fwMcu();let ctl=null,c=ck,autoSteps=0;
  if(mcu){ctl=FW.controller(fwCode(mcu),{pins:fwPins(mcu),gnd:ck.gnd,vdd:3.3,ref:mcu.ref});
    if(ctl.error){SR.fw={error:ctl.error,line:ctl.line,logs:ctl.logs};return{error:ctl.error};}
    const fmax=Math.max(0,...ctl.srcs.filter(s=>s.pwm).map(s=>s.freq));const need=Math.ceil(cfg.tstop*1e-3*fmax*16);
    if(need>cfg.steps){cfg.steps=Math.min(40000,need);autoSteps=cfg.steps;}
    c=Object.assign({},ck,{srcs:ck.srcs.concat(ctl.srcs)});}
  cfg.probes=[...new Set(cfg.probes.concat(c.srcs.map(s=>s.n[0])))].slice(0,8);
  const r=SIM.transient(c,cfg.tstop*1e-3,cfg.steps,cfg.probes,ctl);cfg.tran=r;
  if(mcu)SR.fw={error:ctl.error||(r.error?'회로 해석: '+r.error:null),line:ctl.errLine,logs:ctl.logs,trace:ctl.trace,srcs:ctl.srcs};
  if(!r.error){SR.sp=Object.assign({},r.final,{label:`과도 해석 끝 (t = ${cfg.tstop} ms)`+(mcu?` · ${mcu.ref} 펌웨어 포함`:''),fromTran:true});playReset();}
  return{error:r.error||(ctl&&ctl.error),autoSteps};
}
function spHTML(){
  const cfg=spConfig(),ck=cfg.ck,f=SIM.fmtSI;
  const netOpts=sel=>BD.netOrder.map(n=>`<option${n===sel?' selected':''}>${esc(n)}</option>`).join('');
  const mcu=fwMcu();const fwSrc=mcu?`<div class="srccard fwsrc"><div class="hd"><span>${esc(mcu.ref)} · ${esc(mcu.val)} 펌웨어</span><button class="btn sm" id="sp-fw">펌웨어 편집</button></div>
    <p class="lead" style="margin:0">출력 핀(${Object.entries(fwPins(mcu)).filter(([p,n])=>n&&/PWM|LED|_ST|GATE/.test(n)).map(([p,n])=>esc(p)+'→'+esc(n)).join(', ')||'펌웨어가 정함'})은 실행할 때 펌웨어의 <code>loop(ms)</code>가 1 ms마다 정합니다. ADC 핀은 회로의 전압을 읽습니다.</p></div>`:'';
  const srcs=fwSrc+ck.srcs.map((s,i)=>`<div class="srccard"><div class="hd"><span>${esc(s.id)} · ${esc(s.label||'전압 소스')}</span><button class="x" data-srcdel="${i}" aria-label="${esc(s.id)} 삭제">✕</button></div>
    <div class="row3"><label class="fld"><span>+ 넷</span><select data-src="${i}" data-k="n0" id="src${i}-n">${netOpts(s.n[0])}</select></label><label class="fld"><span>파형</span><select data-src="${i}" data-k="wave" id="src${i}-w"><option value="dc"${s.wave==='dc'?' selected':''}>직류</option><option value="step"${s.wave==='step'?' selected':''}>계단</option><option value="pulse"${s.wave==='pulse'?' selected':''}>펄스</option></select></label><label class="fld"><span>전압 V</span><input type="number" step="0.1" data-src="${i}" data-k="v" value="${s.v}" id="src${i}-v"></label></div>
    ${s.wave==='step'?`<div class="row3"><label class="fld"><span>시작 ms</span><input type="number" step="0.1" min="0" data-src="${i}" data-k="t0" value="${+(s.t0*1e3).toFixed(3)}" id="src${i}-t0"></label><label class="fld"><span>상승 ms</span><input type="number" step="0.1" min="0.001" data-src="${i}" data-k="tr" value="${+(s.tr*1e3).toFixed(3)}" id="src${i}-tr"></label></div>`:''}
    ${s.wave==='pulse'?`<div class="row3"><label class="fld"><span>시작 ms</span><input type="number" step="0.1" min="0" data-src="${i}" data-k="t0" value="${+(s.t0*1e3).toFixed(3)}" id="src${i}-t0"></label><label class="fld"><span>주기 ms</span><input type="number" step="0.1" min="0.01" data-src="${i}" data-k="per" value="${+(s.per*1e3).toFixed(3)}" id="src${i}-per"></label><label class="fld"><span>듀티 %</span><input type="number" step="5" min="1" max="99" data-src="${i}" data-k="duty" value="${Math.round(s.duty*100)}" id="src${i}-d"></label></div>`:''}</div>`).join('');
  const els=ck.els.map((e,i)=>{const unit=e.type==='LOAD'?'mA':e.type==='REG'?'V':e.type==='MOTOR'?'mN·m':e.type==='NMOS'?'V':'';
    const valCell=e.type==='SW'?`<select data-el="${i}" data-k="closed" aria-label="${esc(e.ref)} 상태" id="el${i}-sw"><option value="0"${!e.closed?' selected':''}>열림</option><option value="1"${e.closed?' selected':''}>닫힘</option></select>`:e.type==='D'?(e.led?'LED':'Si'):`<input type="text" data-el="${i}" data-k="val" value="${esc(valStr(e))}" aria-label="${esc(e.ref)} 값" id="el${i}-v" style="width:72px">${unit?' '+unit:''}`;
    return`<tr><td><input type="checkbox" data-el="${i}" data-k="on"${e.on?' checked':''} aria-label="${esc(e.ref)} 사용" id="el${i}-on"></td><td class="mono">${esc(e.ref)}</td><td style="white-space:nowrap">${TYPE_LABEL[e.type]}${e.guess?' <span class="cls">값 추정</span>':''}</td><td class="mono" style="font-size:11px;white-space:nowrap">${e.n.map(esc).join(' → ')}</td><td class="r">${valCell}</td></tr>`;}).join('');
  let res='';const R=SR.sp;
  if(R&&R.error)res=`<p class="errline">${esc(R.error)}</p>`;
  else if(R){
    const nets=Object.entries(R.nets).sort((a,b)=>b[1]-a[1]);
    const parts=R.parts.filter(p=>p.type!=='C'&&p.type!=='L'&&Math.abs(p.P)>1e-6).sort((a,b)=>Math.abs(b.P)-Math.abs(a.P));
    const mots=R.parts.filter(p=>p.type==='MOTOR'),leds=R.parts.filter(p=>p.type==='D'&&BD.byRef[p.id]&&BD.byRef[p.id].kind==='led');
    res=`<div class="res"><div class="acts" style="justify-content:space-between"><h4>${esc(R.label)}</h4><span class="hgap"><button class="btn sm" id="sp-play">3D에서 보기</button><button class="btn sm" id="sp-th">전력을 열 해석으로 보내기</button></span></div>
    ${mots.length||leds.length?`<div class="kpis">${mots.map(p=>`<div class="kpi"><b>${p.rpm.toFixed(0)} rpm</b><span>${esc(p.id)} 출력축${p.gear>1?` (기어 1:${p.gear})`:''} · ${f(Math.abs(p.I),'A')}</span></div>`).join('')}${leds.map(p=>`<div class="kpi"><b>${f(Math.max(0,p.I),'A')}</b><span>${esc(p.id)} ${esc(BD.byRef[p.id].val||'LED')} 전류</span></div>`).join('')}</div>`:''}
    <div class="scroll" style="max-height:200px"><table class="stbl"><thead><tr><th>넷</th><th class="r">전압</th></tr></thead><tbody>${nets.map(([n,v])=>`<tr class="click" data-spnet="${esc(n)}"><td class="mono">${esc(n)}</td><td class="r mono">${f(v,'V',3)}</td></tr>`).join('')}</tbody></table></div>
    <table class="stbl"><thead><tr><th>소자</th><th class="r">전류</th><th class="r">전력</th></tr></thead><tbody>${parts.slice(0,10).map(p=>`<tr><td class="mono">${esc(p.id)} <span class="cls">${TYPE_LABEL[p.type]||''}</span></td><td class="r mono">${f(Math.abs(p.I),'A')}</td><td class="r mono">${p.type==='V'?'공급 ':''}${f(Math.abs(p.P),'W')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const tr=cfg.tran;let chart='';
  if(tr&&tr.error)chart=`<p class="errline">${esc(tr.error)}</p>`;
  else if(tr)chart=`<div class="res"><div class="acts" style="justify-content:space-between"><h4>과도 응답 · 0–${cfg.tstop} ms</h4>${tr.anim&&(Object.keys(tr.anim.led).length||Object.keys(tr.anim.mot).length)?'<button class="btn sm primary" id="sp-play2">▶ 3D에서 재생</button>':''}</div><div class="chipset" role="group" aria-label="표시할 넷">${cfg.probes.map((p,i)=>`<button data-probe="${esc(p)}" aria-pressed="${!cfg.hidden[p]}"><i style="background:var(--s${i%8+1})"></i>${esc(p)}</button>`).join('')}</div><div class="chart" id="spChart"></div></div>`;
  return`<div class="sim"><p class="lead">보드의 넷리스트와 부품 값으로 회로를 만들어 DC 동작점과 시간에 따른 전압 변화를 계산합니다. IC는 정전류 부하나 레귤레이터 모델로 바꿔 넣었습니다.</p>
  <div><h4 style="margin:0 0 6px;font-size:13px">소스</h4><div style="display:flex;flex-direction:column;gap:8px">${srcs||'<p class="lead">소스가 없습니다.</p>'}</div><div class="acts" style="margin-top:8px"><button class="btn sm" id="sp-add">+ 전압 소스</button><label class="fld" style="flex-direction:row;align-items:center;gap:6px;margin-left:auto"><span>접지 넷</span><select id="sp-gnd" style="width:auto">${netOpts(ck.gnd)}</select></label></div></div>
  <div><h4 style="margin:0 0 6px;font-size:13px">소자 ${ck.els.filter(e=>e.on).length}/${ck.els.length}</h4><div class="scroll"><table class="stbl"><thead><tr><th></th><th>참조</th><th>종류</th><th>연결</th><th class="r">값</th></tr></thead><tbody>${els||'<tr><td colspan="5">모델로 바꿀 수 있는 부품이 없습니다.</td></tr>'}</tbody></table></div>
  ${ck.skipped.length?`<p class="lead" style="margin-top:6px">제외: ${ck.skipped.map(s=>esc(s[0])+' ('+esc(s[1])+')').join(', ')}</p>`:''}</div>
  <div class="row3"><label class="fld"><span>해석 시간 ms</span><input type="number" min="0.01" step="1" id="sp-t" value="${cfg.tstop}"></label><label class="fld"><span>계산 단계</span><input type="number" min="100" max="20000" step="100" id="sp-n" value="${cfg.steps}"></label><div class="fld"><span>&nbsp;</span><button class="btn sm" id="sp-dc">DC 동작점</button></div></div>
  <div class="acts"><button class="btn primary" id="sp-run">과도 해석 실행</button></div>${chart}${res}
  <p class="lead">R·C·L·다이오드·스위치·N채널 MOSFET·전압 소스는 MNA(수정 절점 해석) 방식으로 풉니다. DC 모터는 권선 저항·인덕턴스·역기전력과 회전자 관성·마찰·기어비를 묶은 전기-기계 모델로, 회전 속도를 시간에 따라 적분합니다. 크리스털, BJT, 디지털 동작은 모델링하지 않습니다.</p></div>`;
}
function spBind(b){
  const cfg=SR.cfg.sp,ck=cfg.ck;
  b.querySelectorAll('[data-src]').forEach(el=>el.addEventListener('change',()=>{const s=ck.srcs[+el.dataset.src],k=el.dataset.k,v=el.value;
    if(k==='n0')s.n=[v,ck.gnd];else if(k==='wave'){s.wave=v;renderSim();return;}else if(k==='v')s.v=num(v,s.v);else if(k==='duty')s.duty=Math.min(0.99,Math.max(0.01,num(v,50)/100));else s[k]=Math.max(k==='t0'?0:1e-6,num(v,s[k]*1e3)/1e3);}));
  b.querySelectorAll('[data-srcdel]').forEach(x=>x.addEventListener('click',()=>{ck.srcs.splice(+x.dataset.srcdel,1);renderSim();}));
  b.querySelector('#sp-add')?.addEventListener('click',()=>{const n=BD.netOrder.find(x=>x!==ck.gnd)||ck.gnd;ck.srcs.push({id:'V'+(ck.srcs.length+1+Math.floor(Math.random()*0)),type:'V',n:[n,ck.gnd],v:3.3,wave:'dc',t0:0,tr:1e-3,per:2e-3,duty:0.5,label:'전압 소스'});ck.srcs.forEach((s,i)=>{s.id='V'+(i+1);});renderSim();});
  b.querySelector('#sp-gnd')?.addEventListener('change',e=>{ck.gnd=e.target.value;ck.srcs.forEach(s=>{s.n[1]=ck.gnd;});});
  b.querySelectorAll('[data-el]').forEach(el=>el.addEventListener('change',()=>{const e=ck.els[+el.dataset.el],k=el.dataset.k;
    if(k==='on')e.on=el.checked;else if(k==='closed')e.closed=el.value==='1';
    else{const v=SIM.parseVal(el.value);if(e.type==='MOTOR'){const x=parseFloat(el.value);if(x>=0)e.tl=x/1000;}else if(e.type==='NMOS'){const x=parseFloat(el.value);if(x>0)e.vth=x;}else if(e.type==='LOAD'){const x=parseFloat(el.value);if(x>=0)e.I=x/1000;}else if(e.type==='REG'){const x=parseFloat(el.value);if(x>0)e.vset=x;}else if(v>0){e.val=v;e.guess=false;}el.value=valStr(e);}}));
  b.querySelector('#sp-t')?.addEventListener('change',e=>{cfg.tstop=Math.max(0.01,num(e.target.value,cfg.tstop));});
  b.querySelector('#sp-n')?.addEventListener('change',e=>{cfg.steps=Math.round(Math.min(20000,Math.max(100,num(e.target.value,cfg.steps))));});
  b.querySelector('#sp-dc')?.addEventListener('click',()=>{const r=SIM.dcop(Object.assign({},ck,{tDC:cfg.tstop*1e-3}));SR.sp=r.error?{error:r.error}:Object.assign(r,{label:`DC 동작점 (t = ${cfg.tstop} ms 소스 값)`});playReset();renderSim();updateLegend();refresh(false);});
  b.querySelector('#sp-run')?.addEventListener('click',()=>fwRunAll(b.querySelector('#sp-run')));
  b.querySelector('#sp-fw')?.addEventListener('click',()=>fwOpen());
  b.querySelectorAll('[data-probe]').forEach(x=>x.addEventListener('click',()=>{const p=x.dataset.probe;cfg.hidden[p]=!cfg.hidden[p];renderSim();}));
  b.querySelectorAll('[data-spnet]').forEach(r=>r.addEventListener('click',()=>{const n=r.dataset.spnet;if(!cfg.probes.includes(n)){cfg.probes.push(n);if(cfg.probes.length>8)cfg.probes.shift();}S.hlNet=n;refresh(false);renderSim();}));
  b.querySelectorAll('#sp-play,#sp-play2').forEach(x=>x.addEventListener('click',()=>{playReset();if(S.view!=='3d'||S.sch==='full'){setView('3d');}toast(SR.sp&&SR.sp.fromTran?'3D 보기에서 과도 해석을 재생합니다. 아래 재생 막대로 멈추거나 시간을 옮길 수 있습니다.':'3D 보기에서 DC 동작점의 LED 밝기와 모터 회전을 보여줍니다.');}));
  b.querySelector('#sp-th')?.addEventListener('click',()=>{importPower();SR.tab='th';renderSim();updateLegend();refresh(false);toast('회로 해석의 소비전력을 열 해석 표에 넣었습니다. "열 분포 계산"을 누르세요.');});
  const ch=b.querySelector('#spChart');if(ch&&cfg.tran&&!cfg.tran.error)drawChart(ch,cfg);
}
function nice(lo,hi,n){const span=hi-lo||1;const step0=span/n;const p=Math.pow(10,Math.floor(Math.log10(step0)));const s=[1,2,2.5,5,10].map(k=>k*p).find(k=>k>=step0);const a=Math.floor(lo/s)*s,b=Math.ceil(hi/s)*s;const t=[];for(let v=a;v<=b+s*1e-6;v+=s)t.push(+v.toFixed(10));return{t,a,b};}
function drawChart(host,cfg){
  const tr=cfg.tran,series=cfg.probes.map((p,i)=>({p,i,d:tr.data[p]})).filter(s=>s.d&&!cfg.hidden[s.p]);
  const W=360,H=210,ml=40,mr=58,mt=10,mb=28,pw=W-ml-mr,ph=H-mt-mb;
  const tms=tr.time.map(t=>t*1e3);let lo=0,hi=0;series.forEach(s=>s.d.forEach(v=>{if(v<lo)lo=v;if(v>hi)hi=v;}));if(lo>-0.05)lo=0;if(hi-lo<0.1)hi=lo+1;
  const Y=nice(lo,hi,4),X=nice(0,cfg.tstop,5);
  const sx=t=>ml+t/X.b*pw,sy=v=>mt+ph-(v-Y.a)/(Y.b-Y.a)*ph;
  const step=Math.max(1,Math.floor(tms.length/600));
  const path=d=>{let s='';for(let k=0;k<tms.length;k+=step)s+=(s?'L':'M')+sx(tms[k]).toFixed(1)+' '+sy(d[k]).toFixed(1);const k=tms.length-1;s+='L'+sx(tms[k]).toFixed(1)+' '+sy(d[k]).toFixed(1);return s;};
  const ends=series.map(s=>({s,y:sy(s.d[s.d.length-1])})).sort((a,b)=>a.y-b.y);for(let k=1;k<ends.length;k++)if(ends[k].y-ends[k-1].y<12)ends[k].y=ends[k-1].y+12;
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="과도 응답 전압 그래프">
    ${Y.t.map(v=>`<line x1="${ml}" x2="${ml+pw}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--grid-c)" stroke-width="1"/><text x="${ml-6}" y="${sy(v)+3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--f-mono)">${+v.toFixed(2)}</text>`).join('')}
    <line x1="${ml}" x2="${ml+pw}" y1="${sy(Math.max(Y.a,0))}" y2="${sy(Math.max(Y.a,0))}" stroke="var(--axis-c)" stroke-width="1"/>
    ${X.t.filter(v=>v<=X.b).map(v=>`<text x="${sx(v)}" y="${H-12}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--f-mono)">${+v.toFixed(3)}</text>`).join('')}
    <text x="${ml+pw}" y="${H-1}" text-anchor="end" font-size="10" fill="var(--muted)">ms</text><text x="4" y="${mt+4}" font-size="10" fill="var(--muted)">V</text>
    ${series.map(s=>`<path d="${path(s.d)}" fill="none" stroke="var(--s${s.i%8+1})" stroke-width="2" stroke-linejoin="round"/>`).join('')}
    ${series.length<=4?ends.map(e=>`<circle cx="${ml+pw+6}" cy="${e.y}" r="3" fill="var(--s${e.s.i%8+1})"/><text x="${ml+pw+12}" y="${e.y+3.5}" font-size="10" fill="var(--fg)" font-family="var(--f-mono)">${esc(e.s.p.length>7?e.s.p.slice(0,7)+'…':e.s.p)}</text>`).join(''):''}
    <line id="xh" y1="${mt}" y2="${mt+ph}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
    <rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent" id="hz"/></svg><div class="ctip" hidden></div>`;
  const svg=host.querySelector('svg'),tip=host.querySelector('.ctip'),xh=host.querySelector('#xh');
  const move=e=>{const r=svg.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*W;const t=Math.max(0,Math.min(cfg.tstop,(x-ml)/pw*X.b));let k=Math.round(t/cfg.tstop*(tms.length-1));k=Math.max(0,Math.min(tms.length-1,k));
    xh.setAttribute('x1',sx(tms[k]));xh.setAttribute('x2',sx(tms[k]));xh.setAttribute('visibility','visible');
    tip.innerHTML=`<div style="color:var(--muted)">${tms[k].toFixed(3)} ms</div>`+series.map(s=>`<div><i style="background:var(--s${s.i%8+1})"></i>${esc(s.p)} <b>${s.d[k].toFixed(3)} V</b></div>`).join('');
    tip.hidden=false;const px=sx(tms[k])/W*r.width;tip.style.left=Math.min(r.width-tip.offsetWidth-4,Math.max(0,px+10))+'px';tip.style.top='6px';};
  svg.addEventListener('pointermove',move);svg.addEventListener('pointerleave',()=>{tip.hidden=true;xh.setAttribute('visibility','hidden');});
}

function renderSim(){
  simCellsDirty();
  if(S.panel!=='sim'||!BD)return;
  document.querySelectorAll('.stabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.stab===SR.tab?'true':'false'));
  const b=$('#simBody');const sc=b.scrollTop;
  try{
    if(SR.tab==='ir'){b.innerHTML=irHTML();irBind(b);}
    else if(SR.tab==='si'){if(!SR.si)runSI();b.innerHTML=siHTML();siBind(b);}
    else if(SR.tab==='th'){b.innerHTML=thHTML();thBind(b);}
    else{b.innerHTML=spHTML();spBind(b);}
  }catch(e){console.error(e);b.innerHTML=`<p class="errline">시뮬레이션 화면을 그리지 못했습니다: ${esc(e.message)}</p>`;}
}
