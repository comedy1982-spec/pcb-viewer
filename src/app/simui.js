/* ---------- simulation UI (shares viewer scope) ---------- */
const BLUE=['#104281','#184f95','#256abf','#3987e5','#6da7ec','#9ec5f4','#cde2fb'];
const ORANGE=['#4a1c0b','#7a2d10','#ab4017','#d95926','#eb6834','#f39a6f','#f9c8ad'];
// board temperature: a thermal-camera ramp (cool blue → hot red / white) — an orange ramp reads as bare copper in the 3D view
const HEAT=['#1a2a6c','#2257c4','#1fa2c8','#2fbf71','#c9d53a','#f6a623','#e2451c','#a50f15'];
const STATUS={good:'#0ca30c',warn:'#fab219',crit:'#d03b3b'};
function ramp(arr,t){t=Math.max(0,Math.min(1,isFinite(t)?t:0));const f=t*(arr.length-1),i=Math.min(arr.length-2,Math.floor(f)),k=f-i;
  const a=parseInt(arr[i].slice(1),16),b=parseInt(arr[i+1].slice(1),16);const m=(s)=>Math.round(((a>>s)&255)*(1-k)+((b>>s)&255)*k);return`rgb(${m(16)},${m(8)},${m(0)})`;}
function rampRGB(arr,t){const s=ramp(arr,t).match(/\d+/g).map(Number);return s;}
const ENV={cu:35,er:4.3,h:1.53,Ta:25,hconv:10};
const SR={tab:'ir',ir:null,si:null,th:null,sp:null,emc:null,irView:'v',cfg:null,stale:{}};
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
  envSync();if(SR.emc)SR.stale.emc=true;if(SR.ir)SR.stale.ir=true;if(SR.th)SR.stale.th=true;if(SR.si)runSI();renderSim();refresh(false);}));

function simReset(){
  const nl=BD.copperLayers||2;ENV.h=nl>2?Math.max(0.08,(BD.t-nl*ENV.cu*1e-3)/(nl-1)):Math.max(0.1,BD.t-2*ENV.cu*1e-3);SR.ir=SR.si=SR.th=SR.thp=SR.sp=SR.emc=null;SR.fw=null;SR.stale={};SR.cfg={ir:null,th:null,sp:null,emc:null,si:{z:50,zd:90}};
  if(S.panel==='sim')renderSim();else simCellsDirty();updateLegend();
}
function setPanel(p){
  S.panel=p;$$('.pmode button').forEach(b=>b.setAttribute('aria-selected',b.dataset.panel===p?'true':'false'));
  $('#infoPane').hidden=p!=='info';$('#simPane').hidden=p!=='sim';if(typeof dockOnPanel==='function')dockOnPanel(p);
  if(p==='sim'){envSync();renderSim();}else renderPane();
  updateLegend();setTimeout(()=>{if(S.view==='3d')resize3D();else{measure();paint2D();}refresh(false);},0);
}
$$('.pmode button').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel)));
$$('.stabs button').forEach(b=>b.addEventListener('click',()=>{SR.tab=b.dataset.stab;if(SR.tab==='si'&&!SR.si)runSI();renderSim();updateLegend();refresh(false);}));
// which result is drawn over the board: the main sim panel's tab, unless a window cell sets OV_FORCE while it paints (null = none)
let OV_FORCE;
const ovKey=()=>{const t=OV_FORCE!==undefined?OV_FORCE:(S.panel==='sim'?SR.tab:null);return t&&SR[t]&&!SR[t].error?t:null;};
// window cells showing simulation panels re-render on the next paint
function simCellsDirty(){if(typeof POPS!=='undefined')POPS.forEach(C=>{if(C.hv&&isS(C.kind)){C.simDirty=true;C.draw();}});}

/* ---------- overlays ---------- */
function drawOverlay(ctx,side){
  const k=ovKey();if(!k)return;
  if(k==='th'){const R=SR.th;const im=R.imgs?R.imgs[side]:R.img;ctx.save();ctx.globalAlpha=0.92;ctx.imageSmoothingEnabled=true;ctx.translate(0,R.ny*R.cell);ctx.scale(R.cell,-R.cell);ctx.drawImage(im,0,0);ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=Math.max(0.08,BD.W/700);BD.comps.forEach(c=>{if(c.side!==side||c.kind==='none'||!(c.body.w>0))return;const b=c.body;ctx.save();ctx.translate(b.cx,b.cy);ctx.rotate(b.ang*D2R);ctx.strokeRect(-b.w/2,-b.h/2,b.w,b.h);ctx.restore();});return;}
  outlinePath(ctx);ctx.fillStyle='rgba(6,10,12,.62)';ctx.fill('evenodd');ctx.lineCap='round';ctx.lineJoin='round';
  if(k==='emc'){emcDraw(ctx,side);return;}
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
  if(k==='th'){const R=SR.th;const i=Math.floor(x/R.cell),j=Math.floor(y/R.cell);if(i<0||j<0||i>=R.nx||j>=R.ny)return'';const T=R.T[j*R.nx+i],Tb=R.Tb?R.Tb[j*R.nx+i]:NaN;const c=h&&h.c&&R.hot&&R.hot.find(o=>o.ref===h.c.ref&&o.Tj!=null);return isFinite(T)?`<div>${S.view==='B'?'하단':'상단'} <b>${(S.view==='B'&&isFinite(Tb)?Tb:T).toFixed(1)} °C</b>${isFinite(Tb)?` · ${S.view==='B'?'상단':'하단'} ${(S.view==='B'?T:Tb).toFixed(1)} °C`:''}</div>${c?`<div>${esc(c.ref)} Tj <b>${c.Tj.toFixed(1)} °C</b> · 마진 ${c.margin.toFixed(1)} °C</div>`:''}`:'';}
  if(!h)return'';
  if(k==='emc'){const R=SR.emc;const n=h.net;if(!n)return'';const o=[];if(R.ps.switchNets.includes(n))o.push(`스위칭 노드 · dV/dt ${(R.ps.dvdt/1e9).toFixed(2)} V/ns`);
    R.xt.filter(x=>x.vict===n||x.aggr===n).slice(0,2).forEach(x=>o.push(`${esc(x.aggr)} → ${esc(x.vict)} <b>${(x.V*1e3).toFixed(1)} mV</b>`));const l=R.loops.find(x=>x.net===n);if(l)o.push(`리턴 루프 ${l.area.toFixed(0)} mm²`);
    const d=h.c&&R.dc.find(x=>x.ref===h.c.ref);if(d)o.push(`${esc(d.ref)} SRF <b>${fHz(d.srf)}</b> · L ${d.L.toFixed(1)} nH`);return o.map(x=>`<div>${x}</div>`).join('');}
  if(k==='ir'){const R=SR.ir;if(h.net!==R.net)return'';
    if(h.type==='track'){let best=null,bd=1e9;R.segs.forEach(s=>{if(s.L!==h.side)return;const d=PCB.segDist(x,y,s.a,s.b);if(d<bd){bd=d;best=s;}});if(best)return`<div>${f((best.va+best.vb)/2,'V',3)} · ${f(best.I,'A')} · ΔT ${best.dT.toFixed(1)} °C</div>`;}
    if(h.type==='pad'){const p=R.pads.find(q=>q.pad===h.p);if(p)return`<div>${f(p.v,'V',4)} (강하 ${f(R.Vs-p.v,'V')})</div>`;}return'';}
  if(k==='si'&&h.type==='track'){const m=SIM.microstrip(h.t.w,SR.si.h,SR.si.t*1e-3,SR.si.er);return`<div>Z₀ ${m.z0.toFixed(0)} Ω · ${m.ps.toFixed(2)} ps/mm</div>`;}
  if(k==='sp'&&h.net&&SR.sp.nets[h.net]!=null)return`<div>${f(SR.sp.nets[h.net],'V',3)}</div>`;
  return'';
}
/* 3D: colour of a part by its temperature (junction if known, else the hottest board cell under it) on the board map's scale */
function thSpanMax(R){return Math.max(R.tmax,...(R.hot||[]).map(o=>o.Tj!=null?o.Tj:-Infinity).filter(isFinite));}
function thPartT(o){return o?(o.Tj!=null?o.Tj:o.Tbmax!=null&&isFinite(o.Tbmax)?o.Tbmax:o.Tb):NaN;}
function updateLegend(){const el=$('#legend'),html=legendHTML(ovKey());el.hidden=!html;if(html)el.innerHTML=html;}
function legendHTML(k){
  if(!k)return'';let html='';const el={set innerHTML(v){html=v;}};
  const bar=arr=>`<div class="bar" style="background:linear-gradient(90deg,${arr.slice(1).join(',')})"></div>`;
  if(k==='ir'){const R=SR.ir,v=SR.irView;const md=Math.max(0,R.Vs-R.vmin,...R.pads.map(p=>R.Vs-p.v).filter(isFinite));
    const [t,arr,hi]=v==='v'?['전압 강하 · '+R.net,BLUE,SIM.fmtSI(md,'V')]:v==='i'?['트랙 전류 · '+R.net,BLUE,SIM.fmtSI(R.maxI,'A')]:['온도 상승 (IPC-2221) · '+R.net,ORANGE,Math.max(R.maxDT,1).toFixed(1)+' °C'];
    el.innerHTML=`<span class="lt">${esc(t)}</span>${bar(arr)}<div class="lr"><span>0</span><span>${hi}</span></div>`;}
  else if(k==='th'){const R=SR.th;el.innerHTML=`<span class="lt">보드 온도 · ${S.view==='B'?'하단':'상단'} 동박층${S.view==='3d'?' · 부품은 접합/본체 온도':''}</span>${bar(HEAT)}<div class="lr"><span>${(R.lo!=null?R.lo:R.tmin).toFixed(1)} °C</span><span>${(R.hi!=null?R.hi:thSpanMax(R)).toFixed(1)} °C</span></div>`;}
  else if(k==='si'){el.innerHTML=`<span class="lt">특성 임피던스 · 목표 ${SR.cfg.si.z} Ω</span><div class="chips"><span><i style="background:${STATUS.good}"></i>±10% 이내</span><span><i style="background:${STATUS.warn}"></i>±25% 이내</span><span><i style="background:${STATUS.crit}"></i>벗어남</span></div>`;}
  else if(k==='emc'){el.innerHTML=`<span class="lt">EMC 결합 경로${SR.cfg.emc&&SR.cfg.emc.focus!=null&&SR.emc.checks[SR.cfg.emc.focus]?' · '+esc(SR.emc.checks[SR.cfg.emc.focus].item):''}</span><div class="chips"><span><i style="background:#eb6834"></i>스위칭 노드</span><span><i style="background:#d03b3b"></i>커뮤테이션 루프</span><span><i style="background:#3987e5"></i>크로스토크 피해선</span><span><i style="background:#a77bf3"></i>게이트</span><span><i style="background:#fab219"></i>ESL 큰 캡</span><span>✕ 기준면 슬롯</span></div>`;}
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

/* ---------- thermal: 2-layer board solver + junction network (θJB / θJC + TIM + housing), per the PCB thermal workflow ----------
   1 stack-up (copper per layer, FR-4 k, thermal vias) → 2 heat sources (P, θ, Tj,max) → 3 boundary (Ta, h, ε, Joule heating)
   → 4 mesh & solve → 5 Tj / hotspot margin, with measured correlation Tj = Ttop + ΨJT·P */
const PKG_TH={'QFN-32':{thJB:12,thJC:20,psiJT:0.5,tjmax:125},'TQFP-144':{thJB:10,thJC:8,psiJT:0.3,tjmax:150},'HTSSOP-28':{thJB:6,thJC:16,psiJT:0.2,tjmax:150},'HTSSOP-20':{thJB:8,thJC:18,psiJT:0.3,tjmax:150},
  'SOT-223':{thJB:15,thJC:15,psiJT:3,tjmax:125},'SOIC-8':{thJB:50,thJC:55,psiJT:5,tjmax:125},'SOT-23':{thJB:60,thJC:90,psiJT:5,tjmax:150},'SMA':{thJB:30,thJC:30,psiJT:5,tjmax:150},'LED-0603':{thJB:150,thJC:200,psiJT:20,tjmax:110}};
const TH_TA=[[25,'상온'],[65,'산업·밀폐 장비'],[85,'차량 실내'],[105,'엔진룸 (경)'],[125,'엔진룸·파워트레인']];
const TH_EPS=[[0.9,'솔더마스크 (0.85–0.90)'],[0.95,'흑색 코팅'],[0.1,'무처리 금속 (0.05–0.15)']];
const TH_MAT=[['ADC12',96,'알루미늄 다이캐스팅 ADC12 (92–105)'],['A6063',180,'알루미늄 압출 A6061/A6063 (160–200)'],['AZ91D',73,'마그네슘 AZ91D (72–75)'],['PCABS',0.2,'PC/ABS 플라스틱 (0.18–0.25)']];
const TH_TIM=[[3,'갭 패드 3.0 (1.5–6.0)'],[1.5,'저가 갭 패드 1.5'],[5,'써멀 그리스 5.0 (3.0–8.5)'],[10,'카본·세라믹·PCM 10 (8–15+)']];
const TH_PRESET={tc364:{U1:0.9,U3:0.6,U2:0.84,U6:0.43,U4:0.08,U5:0.05},bldc:{U3:0.35,U2:0.18,U1:0.05},mcu:{U2:0.03,U1:0.05,Q1:0.02,D1:0.05,R5:0.01}};
const thIsJ=c=>/^(ic|diode|led)$/.test(c.kind);
function thDefaults(c){const db=typeof PARTS!=='undefined'?PARTS.find(c.mpn)||PARTS.find(c.val):null;const pk=PKG_TH[c.fp]||{thJB:20,thJC:25,psiJT:1,tjmax:125};const t=db&&db.therm||{};
  const o={thJB:t.thJB!=null?t.thJB:pk.thJB,thJC:t.thJC!=null?t.thJC:pk.thJC,psiJT:t.psiJT!=null?t.psiJT:pk.psiJT,tjmax:t.tjmax!=null?t.tjmax:pk.tjmax,top:false};
  o.src=t.thJB!=null?'DS':t.tjmax!=null?'DS·추정':'추정';o.note=t.src||`${c.fp||'패키지'} 일반값 (추정)`;return o;}
function thConfig(){
  if(SR.cfg.th)return SR.cfg.th;const P={},J={};
  let fromCkt=0;BD.comps.forEach(c=>{if(c.kind==='none')return;P[c.ref]=0;if(thIsJ(c))J[c.ref]=thDefaults(c);if(c.P>0){P[c.ref]=+c.P;fromCkt++;}});
  if(BD.source==='예제'&&!BD.demo)Object.assign(P,{U2:0.45,U1:0.12,U3:0.03,D1:0.008,R2:0.006});
  if(BD.demo==='bldc')P.M1=0;Object.assign(P,TH_PRESET[BD.demo]||{});
  const cuO=BD.oz?Math.round(35*BD.oz):ENV.cu;SR.cfg.th={P,J,fromCkt,res:160,Ta:ENV.Ta,conv:'nat_v',v:0,eps:0.9,cuT:cuO,cuB:cuO,cuIn:35,inner:true,prof:{text:PROF_PRESETS(+(BD&&BD.lossI0)||20,+(BD&&BD.lossIpk)||0,+(BD&&BD.lossTpk)||2)[0][2],res:100},plating:25,kz:0.3,kxy:0.3,tim:{k:3,blt:1.0},house:{mat:'ADC12',area:200,wall:2},I:{},irJ:false,meas:{},sel:null,layer:'T',open:{stack:false,src:true,tim:false,bc:true}};
  return SR.cfg.th;
}
function coverageGrid(res,plating){
  const cell=Math.max(BD.W,BD.H)/res,nx=Math.ceil(BD.W/cell),ny=Math.ceil(BD.H/cell),n=nx*ny;
  const cv=document.createElement('canvas');cv.width=nx;cv.height=ny;const c=cv.getContext('2d',{willReadFrequently:true});
  const read=()=>c.getImageData(0,0,nx,ny).data;const setT=()=>{c.setTransform(1/cell,0,0,-1/cell,0,ny);};
  c.clearRect(0,0,nx,ny);setT();outlinePath(c);c.fillStyle='#fff';c.fill('evenodd');let d=read();
  const mask=new Uint8Array(n);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){mask[j*nx+i]=d[((ny-1-j)*nx+i)*4+3]>110?1:0;}
  const covT=new Float32Array(n),covB=new Float32Array(n);
  ['T','B'].forEach(L=>{const cov=L==='T'?covT:covB;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,nx,ny);setT();c.lineCap='round';c.lineJoin='round';
    drawPrims(c,BD.layers[L+'.cu'],p=>p.t==='text'||p.clear?null:'#fff',{clear:'#fff'});c.fillStyle='#fff';BD.vias.forEach(v=>circ(c,v.x,v.y,v.d/2));
    d=read();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)cov[j*nx+i]=d[((ny-1-j)*nx+i)*4+3]/255;});
  // inner copper layers: planes = the inset board area minus antipads of other-net vias / plated holes; inner signal layers = their tracks
  const inner=[];const st=PCB.stackOf(BD);st.slice(1,-1).forEach((L,idx)=>{const prims=BD.layers[L.k+'.cu']||[];c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,nx,ny);setT();
    const pl=prims.find(q=>q.t==='pour'&&q.plane);
    if(pl){c.globalCompositeOperation='source-over';c.fillStyle='#fff';c.beginPath();rr(c,pl.inset,pl.inset,BD.W-2*pl.inset,BD.H-2*pl.inset,pl.r||0);c.fill();c.globalCompositeOperation='destination-out';
      BD.vias.forEach(v=>{if(v.net!==pl.net)circ(c,v.x,v.y,v.d/2+(pl.clr||0.3));});BD.drills.forEach(h=>{if(h.plated&&h.net!==pl.net)circ(c,h.x,h.y,h.d/2+0.2+(pl.clr||0.3));});c.globalCompositeOperation='source-over';}
    c.lineCap='round';c.lineJoin='round';drawPrims(c,prims.filter(q=>q.t==='seg'||q.t==='path'||q.t==='poly'),q=>q.clear?null:'#fff');
    d=read();const cov=new Float32Array(n);let s=0,cnt=0;for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i;cov[k]=d[((ny-1-j)*nx+i)*4+3]/255;if(mask[k]){s+=cov[k];cnt++;}}
    inner.push({k:L.k,role:L.role,net:L.net||pl&&pl.net||null,pos:(idx+1)/(st.length-1),cov,mean:cnt?s/cnt:0});});
  // thermal vias: every via and plated hole adds a copper barrel between the layers
  const viaG=new Float64Array(n);let nv=0;const put=(x,y,dr)=>{const i=Math.floor(x/cell),j=Math.floor(y/cell);if(i<0||j<0||i>=nx||j>=ny)return;viaG[j*nx+i]+=SIM.viaG(dr,plating,BD.t);nv++;};
  BD.vias.forEach(v=>put(v.x,v.y,v.drill||0.3));BD.drills.forEach(h=>{if(h.plated)put(h.x,h.y,h.d);});
  return{nx,ny,cell,a:cell*1e-3,mask,covT,covB,cov:covT,viaG,nv,inner};
}
function compCells(c,g){
  const b=c.body,out=[];const a=-b.ang*D2R,ca=Math.cos(a),sa=Math.sin(a);
  if(b.w>0&&b.h>0){const r=Math.hypot(b.w,b.h)/2;const i0=Math.max(0,Math.floor((b.cx-r)/g.cell)),i1=Math.min(g.nx-1,Math.floor((b.cx+r)/g.cell)),j0=Math.max(0,Math.floor((b.cy-r)/g.cell)),j1=Math.min(g.ny-1,Math.floor((b.cy+r)/g.cell));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=(i+0.5)*g.cell-b.cx,y=(j+0.5)*g.cell-b.cy,lx=x*ca-y*sa,ly=x*sa+y*ca;if(Math.abs(lx)<=b.w/2&&Math.abs(ly)<=b.h/2&&g.mask[j*g.nx+i])out.push(j*g.nx+i);}}
  if(!out.length){const i=Math.min(g.nx-1,Math.max(0,Math.floor(b.cx/g.cell))),j=Math.min(g.ny-1,Math.max(0,Math.floor(b.cy/g.cell)));out.push(j*g.nx+i);}
  return out;
}
function inBody(c,x,y){const b=c.body;const a=-b.ang*D2R,dx=x-b.cx,dy=y-b.cy;const lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);return Math.abs(lx)<=b.w/2&&Math.abs(ly)<=b.h/2;}
// Joule heating of high-current copper: I²R per segment with the copper temperature coefficient
function jouleMap(cfg,g,Tt,Tb){
  const Pt=new Float64Array(g.nx*g.ny),Pb=new Float64Array(g.nx*g.ny);let tot=0;const segs=[];
  if(cfg.irJ&&SR.ir&&SR.ir.segs)SR.ir.segs.forEach(s=>{if(s.I>0)segs.push({a:s.a,b:s.b,w:s.w,L:s.L,I:s.I});});
  Object.entries(cfg.I).forEach(([net,I])=>{if(!(I>0)||!BD.nets[net])return;BD.nets[net].tracks.forEach(t=>{const L=BD.layers['B.cu'].includes(t)?'B':'T';const q=t.pts||[t.a,t.b];for(let i=1;i<q.length;i++)segs.push({a:q[i-1],b:q[i],w:t.w,L,I});});});
  segs.forEach(s=>{const len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);if(len<1e-6)return;const n=Math.max(1,Math.ceil(len/g.cell));const cu=(s.L==='B'?cfg.cuB:cfg.cuT)*1e-6;
    for(let k=0;k<n;k++){const x=s.a[0]+(s.b[0]-s.a[0])*(k+0.5)/n,y=s.a[1]+(s.b[1]-s.a[1])*(k+0.5)/n;const i=Math.floor(x/g.cell),j=Math.floor(y/g.cell);if(i<0||j<0||i>=g.nx||j>=g.ny)continue;const id=j*g.nx+i;
      const T=(s.L==='B'?Tb:Tt)?.[id];const rho=SIM.RHO20*(1+SIM.ALPHA*((isFinite(T)?T:cfg.Ta)-20));const p=s.I*s.I*rho*(len/n*1e-3)/(s.w*1e-3*cu);(s.L==='B'?Pb:Pt)[id]+=p;tot+=p;}});
  return{Pt,Pb,tot,n:segs.length};
}
function housingR(cfg,A,h){const m=TH_MAT.find(x=>x[0]===cfg.house.mat)||TH_MAT[0];const Ah=Math.max(1e-4,cfg.house.area*1e-4);const hh=(h?h.hT:9)+SIM.hRad(cfg.eps,cfg.Ta,cfg.Ta+20);
  return cfg.house.wall*1e-3/(m[1]*A)+1/(hh*Ah);}
/* thermal analysis: the set-up and the colour maps run here, the network solve (SIM.thermalSolve2, ≈ 1–10 s) runs in the
   background worker when one is available (runTHAsync) so panning and the console keep working; runTH() is the same, inline */
function thPrep(){
  const cfg=thConfig();const g=coverageGrid(cfg.res,cfg.plating);const n=g.nx*g.ny;const h=SIM.hConv(cfg.conv,cfg.v);
  const cells={};BD.comps.forEach(c=>{cells[c.ref]=compCells(c,g);});
  // package lead frame / exposed pad spreads heat over the footprint (≈ 0.2 mm copper slug)
  g.pkgT=new Float64Array(n);g.pkgB=new Float64Array(n);BD.comps.forEach(c=>{if(!thIsJ(c))return;const arr=c.side==='B'?g.pkgB:g.pkgT;cells[c.ref].forEach(k=>{arr[k]=390*0.2e-3;});});
  g.inT=new Float64Array(n);g.inB=new Float64Array(n);const inUsed=[];
  if(cfg.inner!==false&&g.inner.length){g.inner.forEach(L=>{const arr=L.pos<=0.5?g.inT:g.inB;const G=390*cfg.cuIn*1e-6;for(let k=0;k<n;k++)arr[k]+=G*L.cov[k];inUsed.push({k:L.k,role:L.role,net:L.net,mean:L.mean,side:L.pos<=0.5?'T':'B'});});}
  const comps=BD.comps.filter(c=>(+cfg.P[c.ref]||0)>0);let ptot=comps.reduce((a,c)=>a+(+cfg.P[c.ref]),0);
  if(!(ptot>0)&&!Object.values(cfg.I).some(v=>v>0)&&!cfg.irJ){SR.th={error:'소비전력이 0입니다. 부품별 전력을 넣어 주세요.'};return;}
  const env={t:BD.t,cuT:cfg.cuT,cuB:cfg.cuB,kxy:cfg.kxy,kz:cfg.kz,hT:h.hT,hB:h.hB,eps:cfg.eps,Ta:cfg.Ta};
  // components with a top path (TIM + housing) become junction nodes of the network: P splits between board and housing
  const topC=comps.filter(c=>cfg.J[c.ref]&&cfg.J[c.ref].top);const extra=topC.map(c=>{const J=cfg.J[c.ref];const A=Math.max(1e-6,c.body.w*c.body.h*1e-6);
    return{ref:c.ref,cells:cells[c.ref],layer:c.side==='B'?'B':'T',gB:1/J.thJB,gA:1/(J.thJC+cfg.tim.blt*1e-3/(cfg.tim.k*A)+housingR(cfg,A,h)),P:+cfg.P[c.ref]};});
  return{cfg,g,n,h,cells,inUsed,comps,ptot,env,topC,extra};}
function thLoad(X,r){const{cfg,g,n,comps,topC,cells}=X;const Pt=new Float64Array(n),Pb=new Float64Array(n);
  comps.forEach(c=>{if(topC.includes(c))return;const w=+cfg.P[c.ref];const cs=cells[c.ref];const arr=c.side==='B'?Pb:Pt;cs.forEach(k=>{arr[k]+=w/cs.length;});});
  const jl=jouleMap(cfg,g,r&&r.T,r&&r.Tb);for(let k=0;k<n;k++){Pt[k]+=jl.Pt[k];Pb[k]+=jl.Pb[k];}return{Pt,Pb,jl};}
function thFinish(X,r,jl){const{cfg,g,n,h,cells,inUsed,comps,ptot,env,topC,extra}=X;
  const share={};comps.forEach(c=>{share[c.ref]=1;});extra.forEach((e,q)=>{share[e.ref]=e.P>0?Math.max(0,Math.min(1,1-e.gA*(r.Tj[q]-cfg.Ta)/e.P)):1;});
  const res=BD.comps.filter(c=>c.kind!=='none').map(c=>{const P=+cfg.P[c.ref]||0,cs=cells[c.ref];const Ton=c.side==='B'?r.Tb:r.T,Toff=c.side==='B'?r.T:r.Tb;
    const Tb=avgT(Ton,cs),Tbmax=Math.max(...cs.map(k=>Ton[k]).filter(isFinite)),Tback=avgT(Toff,cs);const J=cfg.J[c.ref];const o={ref:c.ref,val:c.val,P,Tb,Tbmax,Tback,side:c.side};
    if(J){const Pb=P*(share[c.ref]??1),Ptop=P-Pb;o.Pb=Pb;o.Ptop=Ptop;const q=extra.findIndex(e=>e.ref===c.ref);o.Tj=q>=0?r.Tj[q]:Tb+Pb*J.thJB;o.tjmax=J.tjmax;o.margin=J.tjmax-o.Tj;o.J=J;
      o.dPkg=o.Tj-Tb;o.dVert=Tb-Tback;o.dSpread=Tback-cfg.Ta;o.Ttop=o.Tj-P*J.psiJT;
      let N=0;const dr=[];BD.vias.forEach(v=>{if(inBody(c,v.x,v.y)){N++;dr.push(v.drill||0.3);}});BD.drills.forEach(d=>{if(d.plated&&inBody(c,d.x,d.y)){N++;dr.push(d.d);}});
      const A=Math.max(1e-6,c.body.w*c.body.h*1e-6),gFr=cfg.kz*A/(BD.t*1e-3),g1=SIM.viaG(dr.length?dr.reduce((a,b)=>a+b,0)/dr.length:0.3,cfg.plating,BD.t);
      o.vias={N,gFr,g1,Rvia:N?1/(N*g1):Infinity,Rvert:1/(gFr+N*g1)};
      const R0=Pb>0?Math.max(1e-3,o.dVert/Pb):1/gFr,G0=Math.max(gFr*0.25,1/R0-N*g1);o.vias.Rvert=R0;
      o.curve=[0,2,4,6,9,12,16,20,25,30,36].map(k=>({N:k,Tj:cfg.Ta+o.dSpread+o.dPkg+Pb/(G0+k*g1)}));}
    return o;}).sort((a,b)=>(b.Tj??b.Tbmax)-(a.Tj??a.Tbmax));
  // colour scale: from the coolest board cell (not the ambient — the board rarely gets near it, and the map would be one colour) to the
  // hottest of board and junctions, so 2D, 3D board and 3D parts read on one legend
  const fin=a=>{let m=Infinity;for(const v of a)if(isFinite(v)&&v<m)m=v;return m;};const lo=Math.min(fin(r.T),fin(r.Tb));const hiJ=Math.max(r.tmax,...res.map(o=>o.Tj!=null?o.Tj:-Infinity).filter(isFinite));
  const mk=(T)=>{const img=document.createElement('canvas');img.width=g.nx;img.height=g.ny;const ic=img.getContext('2d');const id=ic.createImageData(g.nx,g.ny);const span=Math.max(1e-6,hiJ-lo);
    for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){const k=j*g.nx+i,v=T[k];const o=((g.ny-1-j)*g.nx+i)*4;if(!isFinite(v)){id.data[o+3]=0;continue;}const t=(v-lo)/span;const c=rampRGB(HEAT,t);id.data[o]=c[0];id.data[o+1]=c[1];id.data[o+2]=c[2];id.data[o+3]=Math.round(255*(0.62+0.33*Math.min(1,t*1.3)));}
    ic.putImageData(id,0,0);return img;};
  const js=res.filter(x=>x.Tj!=null);const worst=js.slice().sort((a,b)=>a.margin-b.margin)[0];
  SR.th=Object.assign(r,{imgs:{T:mk(r.T),B:mk(r.Tb)},img:null,nx:g.nx,ny:g.ny,cell:g.cell,tot:ptot+jl.tot,joule:jl.tot,hot:res,worst,h,Ta:cfg.Ta,nv:g.nv,inner:inUsed,cells:g.nx*g.ny,tmin:Math.min(cfg.Ta,r.tmin),lo,hi:hiJ});
  SR.th.img=SR.th.imgs.T;SR.stale.th=false;if(!cfg.sel||!res.find(x=>x.ref===cfg.sel))cfg.sel=(worst||res[0]||{}).ref||null;
}
function runTH(){const X=thPrep();if(!X)return;let r=null,jl=null;for(let it=0;it<2;it++){const L=thLoad(X,r);jl=L.jl;r=SIM.thermalSolve2(X.g,X.env,L.Pt,L.Pb,X.extra);if(!jl.n)break;}thFinish(X,r,jl);}
async function runTHAsync(){const X=thPrep();if(!X)return;let r=null,jl=null;
  for(let it=0;it<2;it++){const L=thLoad(X,r);jl=L.jl;r=await thSolveBg(X.g,X.env,L.Pt,L.Pb,X.extra);if(!jl.n)break;}thFinish(X,r,jl);}
/* one network solve in the background worker (the routing worker: core scripts + sim.js are already compiled there); inline when unavailable */
function thSolveBg(g,env,Pt,Pb,extra){if(typeof Worker==='undefined'||typeof jobWorkerGet!=='function'||(typeof CLI!=='undefined'&&CLI.jobWorker===false))return Promise.resolve(SIM.thermalSolve2(g,env,Pt,Pb,extra));
  return new Promise(res=>{let w;try{w=jobWorkerGet();}catch(e){return res(SIM.thermalSolve2(g,env,Pt,Pb,extra));}const id=++CLI.seq;const prev=w.onmessage;
    const done=r=>{w.removeEventListener('message',on);res(r);};const on=e=>{const m=e.data;if(!m||m.id!==id)return;if(m.ok&&m.r)done(m.r);else done(SIM.thermalSolve2(g,env,Pt,Pb,extra));};
    w.addEventListener('message',on);try{w.postMessage({id,cmd:'thermal',g,env,Pt,Pb,extra});}catch(e){done(SIM.thermalSolve2(g,env,Pt,Pb,extra));}void prev;});}
const avgT=(T,cs)=>{let s=0,n=0;cs.forEach(k=>{if(isFinite(T[k])){s+=T[k];n++;}});return n?s/n:NaN;};
const thSt=m=>m==null?['info','—']:m<0?['err','초과']:m<15?['warn','주의']:['ok','정상'];
const thPill=st=>`<span class="sv ${st[0]}"><i aria-hidden="true">${st[0]==='err'?'✕':st[0]==='warn'?'!':'✓'}</i>${st[1]}</span>`;
function thCurveSVG(o){
  const c=o.curve;const xs=c.map(p=>p.N),ys=c.map(p=>p.Tj);const y0=Math.min(...ys,o.tjmax-20),y1=Math.max(...ys,o.tjmax+2);const W=300,H=110,L=34,B=18;
  const X=n=>L+(n-xs[0])/(xs[xs.length-1]-xs[0])*(W-L-6),Y=t=>H-B-(t-y0)/(y1-y0)*(H-B-8);
  const path=c.map((p,i)=>`${i?'L':'M'}${X(p.N).toFixed(1)},${Y(p.Tj).toFixed(1)}`).join('');const cur=o.vias.N;const tc=c.find(p=>p.N>=cur)||c[c.length-1];
  return`<svg class="thcurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="써멀 비아 개수에 따른 정션 온도"><line x1="${L}" y1="${Y(o.tjmax)}" x2="${W-6}" y2="${Y(o.tjmax)}" class="lim"/><text x="${W-8}" y="${Y(o.tjmax)-3}" text-anchor="end" class="lbl">Tj,max ${o.tjmax}</text>
    <path d="${path}" class="ln"/>${c.map(p=>`<circle cx="${X(p.N)}" cy="${Y(p.Tj)}" r="1.8" class="pt"/>`).join('')}<circle cx="${X(Math.min(cur,36))}" cy="${Y(o.Tj)}" r="4" class="cur"/>
    <text x="${L-4}" y="${Y(y1)+4}" text-anchor="end" class="ax">${y1.toFixed(0)}</text><text x="${L-4}" y="${H-B}" text-anchor="end" class="ax">${y0.toFixed(0)}</text>
    ${[0,9,16,25,36].map(n=>`<text x="${X(n)}" y="${H-4}" text-anchor="middle" class="ax">${n}</text>`).join('')}</svg>`;
}
/* ---------- current profile → transient thermal ----------
   A scenario is a table of time points (s) · phase current (A) · PWM duty (%), linearly interpolated (two rows at nearly the
   same time make a step). Losses the circuit generator worked out at the motor blocks' phase current I0 are scaled per part:
   phase-current parts (bridge FETs · shunts) × (I/I0)², battery-side parts (reverse-polarity FET) × (I·D/I0)², the rest stay
   constant (MCU · regulators · gate driver). FETs keep 0.02 W (switching / gate) fixed. Board = thermalTransient; each junction
   follows its board spot through a first-order package lag τ = θJB · C_pkg. */
const thLK=c=>c.lk||(/역전압|reverse/i.test(c.desc||'')?'batt':((/^Q\d/.test(c.ref)&&/MOSFET|상|레그|브리지/.test(c.desc||''))||(/^R\d/.test(c.ref)&&/션트/.test(c.desc||'')&&/상|레그|모터/.test(c.desc||'')))?'phase':'const');
const thI0=()=>+(BD&&BD.lossI0)||20;const thPk=()=>[thI0(),+(BD&&BD.lossIpk)||thI0(),+(BD&&BD.lossTpk)||2];
/* scenarios from the board's continuous current I (losses were worked out at it) and its peak Ipk / duration tp (start · stall) */
const PROF_PRESETS=(I,Ipk,tp)=>{Ipk=+Ipk||I;tp=+tp||2;const pk=Ipk>I;const P=pk?Ipk:I,h=pk?I:+(I*0.5).toFixed(1),q=pk?I:+(I*0.7).toFixed(1),hd=pk?100:60,T=+(0.5+tp).toFixed(2);return[
  ['start',`기동 피크 ${P} A ${tp} s → 상시 ${h} A 10분 → 정지`,`0, 0, 0\n0.5, ${P}, 100\n${T}, ${P}, 100\n${+(T+0.5).toFixed(2)}, ${h}, ${hd}\n600, ${h}, ${hd}\n600.5, 0, 0\n900, 0, 0`],
  ['rated',`상시 ${h} A 연속 10분`,`0, ${h}, ${hd}\n600, ${h}, ${hd}`],
  ['peak',`피크 ${P} A 연속 10분 (최악 — 피크가 끝나지 않을 때)`,`0, ${P}, 100\n600, ${P}, 100`],
  ['stall',`상시 1분 → 구속 피크 ${P} A ${tp} s → 차단`,`0, ${h}, ${hd}\n60, ${h}, ${hd}\n60.2, ${P}, 100\n${+(60.2+tp).toFixed(2)}, ${P}, 100\n${+(60.4+tp).toFixed(2)}, 0, 0\n240, 0, 0`],
  ['repeat',`상시 운전 중 피크 ${P} A ${tp} s를 30 s마다 10회`,Array.from({length:10},(_,k)=>`${k*30}, ${h}, ${hd}\n${k*30+25}, ${h}, ${hd}\n${k*30+25.1}, ${P}, 100\n${+(k*30+25.1+tp).toFixed(2)}, ${P}, 100\n${+(k*30+25.2+tp).toFixed(2)}, ${h}, ${hd}`).join('\n')+`\n300, ${h}, ${hd}`],
  ['cycle',`펌프 반복: 30 s ON (${q} A · 듀티 80 %) / 30 s OFF × 5`,Array.from({length:5},(_,k)=>`${k*60}, ${q}, 80\n${k*60+30}, ${q}, 80\n${k*60+30.2}, 0, 0\n${k*60+59.8}, 0, 0`).join('\n')]];};
function profParse(txt){const rows=[];String(txt||'').split(/\n|;/).forEach(l=>{const v=l.split(/[,\t ]+/).map(x=>x.trim()).filter(Boolean).map(Number);if(v.length<2||v.some(x=>!isFinite(x)))return;rows.push([v[0],Math.max(0,v[1]),v.length>2?Math.max(0,Math.min(100,v[2])):100]);});
  rows.sort((a,b)=>a[0]-b[0]);if(!rows.length)throw new Error('프로파일이 비었습니다 — 줄마다 "시간 s, 상전류 A, 듀티 %"');if(rows[0][0]>0)rows.unshift([0,rows[0][1],rows[0][2]]);
  if(rows[rows.length-1][0]<=0)throw new Error('마지막 시간이 0보다 커야 합니다');return rows;}
function profAt(R,t){if(t<=R[0][0])return[R[0][1],R[0][2]];for(let i=1;i<R.length;i++)if(t<=R[i][0]){const a=R[i-1],b=R[i],u=b[0]>a[0]?(t-a[0])/(b[0]-a[0]):1;return[a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];}const z=R[R.length-1];return[z[1],z[2]];}
function profTimes(R){const T=R[R.length-1][0],dmax=Math.max(0.25,T/260);const out=[];for(let i=1;i<R.length;i++){const a=R[i-1][0],b=R[i][0];if(b<=a)continue;let t=a,dt=Math.min(0.02,(b-a)/2);while(t<b-1e-9){t=Math.min(b,t+dt);out.push(+t.toFixed(4));dt=Math.min(dmax,dt*1.3);}}
  return out.length>1500?out.filter((_,i)=>i%Math.ceil(out.length/1500)===0||i===out.length-1):out;}
const pkgHt=fp=>/TO-?252|DPAK/i.test(fp||'')?2.3:/TO-?263|D2PAK/i.test(fp||'')?4.5:/TDSON|SON|QFN|DFN/i.test(fp||'')?1:/QFP/i.test(fp||'')?1.4:/SOIC|SOP/i.test(fp||'')?1.6:/2512|2010|1206/i.test(fp||'')?0.6:1.2;
function runTHprof(){
  const cfg=thConfig();const pc=cfg.prof;const R=profParse(pc.text);const I0=thI0();const t0=Date.now();
  const g=coverageGrid(pc.res||100,cfg.plating);const n=g.nx*g.ny;const h=SIM.hConv(cfg.conv,cfg.v);
  const cells={};BD.comps.forEach(c=>{cells[c.ref]=compCells(c,g);});
  g.pkgT=new Float64Array(n);g.pkgB=new Float64Array(n);BD.comps.forEach(c=>{if(!thIsJ(c))return;const arr=c.side==='B'?g.pkgB:g.pkgT;cells[c.ref].forEach(k=>{arr[k]=390*0.2e-3;});});
  g.inT=new Float64Array(n);g.inB=new Float64Array(n);if(cfg.inner!==false)g.inner.forEach(L=>{const arr=L.pos<=0.5?g.inT:g.inB;const G=390*cfg.cuIn*1e-6;for(let k=0;k<n;k++)arr[k]+=G*L.cov[k];});
  const env={t:BD.t,cuT:cfg.cuT,cuB:cfg.cuB,kxy:cfg.kxy,kz:cfg.kz,hT:h.hT,hB:h.hB,eps:cfg.eps,Ta:cfg.Ta};
  const fPh=t=>{const[I]=profAt(R,t);return(I/I0)**2;},fBa=t=>{const[I,D]=profAt(R,t);return(I*D/100/I0)**2;};const fOf={const:()=>1,phase:fPh,batt:fBa};
  // split each part's table power into the fixed share and the current-scaled share
  const parts=BD.comps.filter(c=>c.kind!=='none'&&(+cfg.P[c.ref]||0)>0).map(c=>{const P0=+cfg.P[c.ref];const lk=thLK(c);const fix=lk==='const'?P0:/^Q/.test(c.ref)?Math.min(P0,0.02):0;
    const A=Math.max(1e-6,(c.body.w||1)*(c.body.h||1)*1e-6);return{c,P0,lk,fix,sc:P0-fix,Cp:Math.max(0.02,A*pkgHt(c.fp)*1e-3*2.0e6),P:t=>fix+(P0-fix)*fOf[lk](t)};});
  const topC=parts.filter(o=>cfg.J[o.c.ref]&&cfg.J[o.c.ref].top);
  const maps={const:[new Float64Array(n),new Float64Array(n)],phase:[new Float64Array(n),new Float64Array(n)],batt:[new Float64Array(n),new Float64Array(n)]};
  parts.forEach(o=>{if(topC.includes(o))return;const cs=cells[o.c.ref];const L=o.c.side==='B'?1:0;cs.forEach(k=>{maps.const[L][k]+=o.fix/cs.length;maps[o.lk==='const'?'const':o.lk][L][k]+=(o.lk==='const'?0:o.sc)/cs.length;});});
  const src=[['const',()=>1],['phase',fPh],['batt',fBa]].map(([k,f])=>({Pt:maps[k][0],Pb:maps[k][1],f}));
  const extra=topC.map(o=>{const J=cfg.J[o.c.ref];const A=Math.max(1e-6,o.c.body.w*o.c.body.h*1e-6);return{ref:o.c.ref,cells:cells[o.c.ref],layer:o.c.side==='B'?'B':'T',gB:1/J.thJB,gA:1/(J.thJC+cfg.tim.blt*1e-3/(cfg.tim.k*A)+housingR(cfg,A,h)),C:o.Cp,P0:1,f:o.P};});
  const watch=parts.filter(o=>cfg.J[o.c.ref]).map(o=>({o,J:cfg.J[o.c.ref],q:extra.findIndex(e=>e.ref===o.c.ref),d:0,ser:[]}));
  const times=profTimes(R);const out={t:[0],max:[cfg.Ta],I:[R[0][1]],D:[R[0][2]],P:[parts.reduce((a,o)=>a+o.P(0),0)]};watch.forEach(w=>w.ser.push(cfg.Ta));let tp=0;
  SIM.thermalTransient(g,env,src,{times,extra,T0:cfg.Ta,probe:(t,A)=>{const dt=t-tp;tp=t;
    watch.forEach(w=>{const c=w.o.c,cs=cells[c.ref];let Tj;if(w.q>=0)Tj=A.j(w.q);else{let s=0,k2=0;cs.forEach(k=>{const v=c.side==='B'?A.bot(k):A.top(k);if(isFinite(v)){s+=v;k2++;}});const Tb=k2?s/k2:cfg.Ta;
      const tau=Math.max(0.01,w.J.thJB*w.o.Cp);const tgt=w.o.P(t)*w.J.thJB;w.d+=(tgt-w.d)*(1-Math.exp(-dt/tau));Tj=Tb+w.d;}w.ser.push(Tj);});
    const[I,D]=profAt(R,t);out.t.push(t);out.max.push(A.max);out.I.push(I);out.D.push(D);out.P.push(parts.reduce((a,o)=>a+o.P(t),0));}});
  const peaks=watch.map(w=>{let pk=-1e9,ip=0;w.ser.forEach((v,i)=>{if(v>pk){pk=v;ip=i;}});let over=0;for(let i=1;i<w.ser.length;i++)if(w.ser[i]>w.J.tjmax)over+=out.t[i]-out.t[i-1];
    return{ref:w.o.c.ref,val:w.o.c.val,lk:w.o.lk,P0:w.o.P0,peak:pk,tpk:out.t[ip],end:w.ser[w.ser.length-1],tjmax:w.J.tjmax,margin:w.J.tjmax-pk,over,ser:w.ser};}).sort((a,b)=>a.margin-b.margin);
  let bm=-1e9,ib=0;out.max.forEach((v,i)=>{if(v>bm){bm=v;ib=i;}});
  const E=out.t.reduce((a,t,i)=>i?a+(out.P[i]+out.P[i-1])/2*(t-out.t[i-1]):0,0);
  SR.thp={rows:R,I0,out,peaks,boardMax:bm,tBoard:out.t[ib],ms:Date.now()-t0,steps:times.length,cells:g.nx*g.ny,energy:E,T:R[R.length-1][0],nPh:parts.filter(o=>o.lk==='phase').length,nBa:parts.filter(o=>o.lk==='batt').length,nCo:parts.filter(o=>o.lk==='const').length};}
function profChart(P){const W=620,H=250,ml=44,mr=62,mt=12,mb=26,Hs=70;const T=P.T||1;const top=P.peaks.slice(0,5);const COL=['#d9534f','#e8a33d','#3d7fd9','#2e9e5b','#8a4fd0'];
  const ys=[P.boardMax,...top.map(x=>Math.max(x.peak,x.tjmax))];let y1=Math.max(...ys,P.out.max[0]+5),y0=Math.min(P.out.max[0],...top.map(x=>x.ser[0]));y1=Math.ceil((y1+5)/10)*10;y0=Math.floor(y0/10)*10;
  const X=t=>ml+(W-ml-mr)*t/T,Y=v=>mt+(H-mt-mb)*(1-(v-y0)/(y1-y0||1));const pts=(arr)=>arr.map((v,i)=>`${X(P.out.t[i]).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const tick=n=>{const st=[1,2,5,10,20,30,60,120,300,600,1200,1800,3600].find(s=>T/s<=n)||3600;const a=[];for(let t=0;t<=T+1e-9;t+=st)a.push(t);return a;};
  const gy=[];for(let v=y0;v<=y1;v+=(y1-y0)>80?20:10)gy.push(v);const tk=tick(8);
  const w=top[0];const Imax=Math.max(1,...P.out.I);const XI=X,YI=v=>H+8+(Hs-16)*(1-v/Imax),YD=v=>H+8+(Hs-16)*(1-v/100);
  return`<svg viewBox="0 0 ${W} ${H+Hs}" style="width:100%;height:auto;color:var(--fg,#1d2126)" role="img" aria-label="전류 프로파일에 따른 온도 변화">
  ${gy.map(v=>`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".1"/><text x="${ml-6}" y="${Y(v)+3}" font-size="10" text-anchor="end" fill="currentColor" fill-opacity=".6">${v}</text>`).join('')}
  ${tk.map(t=>`<text x="${X(t)}" y="${H-mb+14}" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity=".6">${t>=60&&t%60===0?t/60+' min':t+' s'}</text>`).join('')}
  ${w?`<line x1="${ml}" x2="${W-mr}" y1="${Y(w.tjmax)}" y2="${Y(w.tjmax)}" stroke="${COL[0]}" stroke-dasharray="5 4" stroke-opacity=".7"/><text x="${W-mr+3}" y="${Y(w.tjmax)+3}" font-size="9.5" fill="${COL[0]}">Tjmax ${w.tjmax}</text>`:''}
  <polyline points="${pts(P.out.max)}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-dasharray="3 3" stroke-width="1.4"/>
  ${top.map((x,i)=>`<polyline points="${pts(x.ser)}" fill="none" stroke="${COL[i]}" stroke-width="1.8"/>`).join('')}
  <text x="${ml}" y="${mt-2}" font-size="10" fill="currentColor" fill-opacity=".6">°C</text>
  <line x1="${ml}" x2="${W-mr}" y1="${H+Hs-8}" y2="${H+Hs-8}" stroke="currentColor" stroke-opacity=".2"/>
  <polyline points="${P.out.I.map((v,i)=>`${XI(P.out.t[i]).toFixed(1)},${YI(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#3d7fd9" stroke-width="1.5"/>
  <polyline points="${P.out.D.map((v,i)=>`${XI(P.out.t[i]).toFixed(1)},${YD(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#2e9e5b" stroke-width="1.2" stroke-dasharray="4 3"/>
  <text x="${ml-6}" y="${H+14}" font-size="9.5" text-anchor="end" fill="#3d7fd9">${Imax.toFixed(0)} A</text><text x="${W-mr+3}" y="${H+14}" font-size="9.5" fill="#2e9e5b">100 %</text>
  </svg><div class="lead" style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;margin:2px 0 0">${top.map((x,i)=>`<span><i style="display:inline-block;width:12px;height:3px;background:${COL[i]};vertical-align:middle;margin-right:4px"></i>${esc(x.ref)} ${esc((x.val||'').slice(0,12))}</span>`).join('')}<span><i style="display:inline-block;width:12px;border-top:2px dashed currentColor;opacity:.6;vertical-align:middle;margin-right:4px"></i>보드 최고</span><span style="color:#3d7fd9">— 상전류</span><span style="color:#2e9e5b">‐‐ 듀티</span></div>`;}
function thProfHTML(cfg){const pc=cfg.prof;const I0=thI0();const P=SR.thp;const pr=PROF_PRESETS(...thPk());
  let res='';if(P&&P.error)res=`<p class="errline">${esc(P.error)}</p>`;
  else if(P){const w=P.peaks[0];const st=w?thSt(w.margin):['info','—'];
    res=`<div class="res">${SR.stale.thp?'<p class="lead" style="color:#b5541c">입력이 바뀌었습니다 — [프로파일 해석]을 다시 누르세요.</p>':''}
    <div class="kpis"><div class="kpi"><b>${w?w.peak.toFixed(1)+' °C':'—'}</b><span>최고 Tj${w?` · ${esc(w.ref)} @ ${w.tpk.toFixed(1)} s`:''}</span></div><div class="kpi"><b class="${st[0]==='err'?'c-err':''}">${w?(w.margin>=0?'+':'')+w.margin.toFixed(1)+' °C':'—'}</b><span>최소 마진${w&&w.over>0?` · Tjmax 초과 ${w.over.toFixed(1)} s`:''}</span></div>
      <div class="kpi"><b>${P.boardMax.toFixed(1)} °C</b><span>보드 최고 @ ${P.tBoard.toFixed(0)} s</span></div><div class="kpi"><b>${(P.energy/1000).toFixed(2)} kJ</b><span>발열 에너지 · 평균 ${(P.energy/P.T).toFixed(1)} W</span></div></div>
    ${profChart(P)}
    <table class="stbl thres"><thead><tr><th>부품</th><th>손실 기준</th><th class="r">최고 Tj</th><th class="r">시점</th><th class="r">끝</th><th class="r">마진</th><th>판정</th></tr></thead><tbody>${P.peaks.slice(0,10).map(x=>{const s=thSt(x.margin);return`<tr><td class="mono">${esc(x.ref)}<div class="cls">${esc((x.val||'').slice(0,14))}</div></td><td class="cls">${x.lk==='phase'?'상전류²':x.lk==='batt'?'배터리 전류²':'고정'} · ${x.P0} W</td><td class="r mono">${x.peak.toFixed(1)}</td><td class="r mono">${x.tpk.toFixed(1)} s</td><td class="r mono">${x.end.toFixed(1)}</td><td class="r mono">${(x.margin>=0?'+':'')+x.margin.toFixed(1)}</td><td><span class="st ${s[0]==='err'?'crit':s[0]==='warn'?'warn':'good'}"><i></i>${s[1]}${x.over>0?` (${x.over.toFixed(1)} s)`:''}</span></td></tr>`;}).join('')}</tbody></table>
    <p class="lead">과도 해석 ${P.steps} 단계 · ${P.cells} 셀 · ${(P.ms/1000).toFixed(1)} s. 손실 기준 전류 I0 = ${P.I0} A — 상전류 부품 ${P.nPh}개 ×(I/I0)², 배터리 쪽 ${P.nBa}개 ×(I·D/I0)², 나머지 ${P.nCo}개 고정. 정션은 보드 온도 + θJB·P를 패키지 시정수(θJB × 패키지 열용량)로 따라갑니다. 냉간 시작(Ta)에서 출발.</p></div>`;}
  return`<details class="thsec" data-sec="prof" ${cfg.open.prof?'open':''}><summary><b>⑤ 전류 프로파일 (시나리오 과도 해석)</b><span>${P&&!P.error?`최고 Tj ${P.peaks[0]?P.peaks[0].peak.toFixed(0)+' °C':'—'} · ${P.T} s`:`손실 기준 ${I0} A${(+(BD&&BD.lossIpk)||0)>I0?` · 피크 ${BD.lossIpk} A ${BD.lossTpk} s`:''}`}</span></summary>
    <p class="lead">시간에 따른 상전류 · PWM 듀티를 넣으면 부품 손실을 시간마다 다시 계산해 보드 · 정션 온도 변화를 풉니다. 줄마다 <code>시간 s, 상전류 A, 듀티 %</code> — 사이는 직선 보간, 같은 시간 근처 두 줄이면 계단. 위 ①–④ 설정(적층 · 부품 P · θJB · TIM · 환경)을 그대로 씁니다.</p>
    <div class="thgrid"><label class="fld"><span>시나리오 예</span><select id="prof-pre"><option value="">— 고르기 —</option>${pr.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label class="fld"><span>계산 격자</span><select id="prof-res"><option value="70"${pc.res==70?' selected':''}>빠르게 (70칸)</option><option value="100"${pc.res==100?' selected':''}>보통 (100칸)</option><option value="140"${pc.res==140?' selected':''}>정밀 (140칸)</option></select></label></div>
    <label class="fld"><span>프로파일 (시간 s, 상전류 A, 듀티 %)</span><textarea id="prof-txt" rows="7" spellcheck="false" style="font-family:var(--f-mono,monospace);font-size:12px">${esc(pc.text)}</textarea></label>
    <div class="acts"><button class="btn primary" id="prof-run">프로파일 해석</button><button class="btn sm ghost" id="prof-csv" title="결과 시계열을 CSV로">CSV 저장</button></div>${res}</details>`;}
function thDetail(o,cfg){
  if(!o||o.Tj==null)return o?`<p class="lead">${esc(o.ref)}는 정션 모델이 없는 부품입니다. 보드 온도 ${o.Tbmax.toFixed(1)} °C.</p>`:'';
  const st=thSt(o.margin);const tot=Math.max(1e-6,o.Tj-cfg.Ta);const seg=(v,cls,lab)=>v>0.05?`<span class="${cls}" style="flex:${v}" title="${lab} +${v.toFixed(1)} °C">${v/tot>0.12?`${lab} +${v.toFixed(1)}`:''}</span>`:'';
  const m=cfg.meas[o.ref];const Tjm=m!=null&&m!==''?(+m)+o.P*o.J.psiJT:null;
  return`<div class="thd"><div class="acts" style="justify-content:space-between"><b>${esc(o.ref)} ${esc((o.val||'').slice(0,16))}</b>${thPill(st)}</div>
    <div class="kv2"><span>Tj</span><b>${o.Tj.toFixed(1)} °C</b><span>마진</span><b>${o.margin>=0?'+':''}${o.margin.toFixed(1)} °C</b><span>보드 아래</span><b>${o.Tb.toFixed(1)} °C</b><span>케이스 상단(추정)</span><b>${o.Ttop.toFixed(1)} °C</b></div>
    <div class="sub">온도 상승 누적 (Ta ${cfg.Ta} °C → Tj)</div>
    <div class="thstack">${seg(o.dSpread,'s1','확산·대류')}${seg(o.dVert,'s2','수직(FR-4·비아)')}${seg(o.dPkg,'s3','패키지')}</div>
    <div class="thlg"><span><i class="s1"></i>확산·대류 +${o.dSpread.toFixed(1)}</span><span><i class="s2"></i>수직 +${o.dVert.toFixed(1)}</span><span><i class="s3"></i>패키지 θJB +${o.dPkg.toFixed(1)}</span></div>
    <div class="sub">써멀 비아 (부품 아래 ${o.vias.N}개 · R<sub>via</sub> ${isFinite(o.vias.Rvia)?o.vias.Rvia.toFixed(1):'∞'} °C/W · 수직 합성 ${o.vias.Rvert.toFixed(1)} °C/W)</div>
    ${thCurveSVG(o)}<p class="lead" style="margin:0">비아를 늘릴수록 수직 저항은 줄지만, 일정 개수 뒤에는 수평 확산·대류 저항이 병목이 되어 감소 폭이 완만해집니다 (집중 상수 근사).</p>
    <div class="sub">실측 보정 (Correlation)</div>
    <label class="fld"><span>측정한 상단 온도 T<sub>top</sub> (IR 카메라·열전대, °C)</span><input type="number" step="0.1" id="th-meas" value="${m!=null?esc(String(m)):''}" placeholder="${o.Ttop.toFixed(1)}"></label>
    ${Tjm!=null?`<p class="lead" style="margin:0">Tj = T<sub>top</sub> + Ψ<sub>JT</sub>·P = ${(+m).toFixed(1)} + ${o.J.psiJT}×${o.P.toFixed(2)} = <b>${Tjm.toFixed(1)} °C</b> · 해석 대비 ${(o.Tj-Tjm>=0?'+':'')}${(o.Tj-Tjm).toFixed(1)} °C (${((o.Tj-Tjm)/Math.max(1,Tjm-cfg.Ta)*100).toFixed(0)} % of ΔT)</p>`:'<p class="lead" style="margin:0">IR 측정 시 표면 방사율 ε 보정이 필요합니다.</p>'}
    <p class="lead" style="margin:0">열저항 출처: ${esc(o.J.note)}${o.Ptop>0.001?` · 상부 방열로 ${SIM.fmtSI(o.Ptop,'W')}이 하우징으로 빠짐`:''}</p></div>`;
}
function thHTML(){
  const cfg=thConfig(),R=SR.th;const comps=BD.comps.filter(c=>c.kind!=='none');const h=SIM.hConv(cfg.conv,cfg.v);
  const ptot=comps.reduce((a,c)=>a+(+cfg.P[c.ref]||0),0),nsrc=comps.filter(c=>(+cfg.P[c.ref]||0)>0).length;
  const oz=v=>v>=100?'3 oz':v>=60?'2 oz':v>=30?'1 oz':'0.5 oz';
  const steps=[['1','적층',`${BD.copperLayers||2}층${(BD.copperLayers||2)>2?(cfg.inner!==false?` (내층 ${(BD.copperLayers||2)-2}장 ${oz(cfg.cuIn)} 포함)`:' (내층 제외 — 외층 2장만)'):''} · ${oz(cfg.cuT)}/${oz(cfg.cuB)} · ${BD.t} mm`,true],['2','발열원',`${nsrc}개 · ${SIM.fmtSI(ptot,'W')}`,nsrc>0],['3','경계 조건',`Ta ${cfg.Ta} °C · h ${h.hT.toFixed(0)} · ε ${cfg.eps}`,true],
    ['4','메싱·솔빙',R&&!R.error?`${R.cells} 셀 · ${R.iters} 반복`:`${cfg.res} 칸 격자`,!!(R&&!R.error)],['5','Tj·핫스팟',R&&R.worst?`최소 마진 ${R.worst.margin.toFixed(1)} °C`:'계산 후 판정',!!(R&&R.worst)]];
  const srcRows=comps.filter(c=>thIsJ(c)||(+cfg.P[c.ref]||0)>0||/^(Q|M)\d/.test(c.ref)).map(c=>{const J=cfg.J[c.ref];const k=esc(c.ref).replace(/[^\w]/g,'_');
    return`<tr><td class="mono">${esc(c.ref)}<div class="cls">${esc((c.val||'').slice(0,14))}</div></td><td class="r"><input type="number" min="0" step="0.01" data-pw="${esc(c.ref)}" value="${cfg.P[c.ref]||0}" aria-label="${esc(c.ref)} 소비전력 W" id="pw-${k}"></td>
      ${J?`<td class="r"><input type="number" min="0.1" step="0.1" data-jb="${esc(c.ref)}" value="${J.thJB}" aria-label="${esc(c.ref)} θJB"></td><td class="r"><input type="number" step="5" data-tjm="${esc(c.ref)}" value="${J.tjmax}" aria-label="${esc(c.ref)} Tj max"></td><td><span class="src ${J.src==='DS'?'ds':''}" title="${esc(J.note)}">${esc(J.src)}</span></td><td><input type="checkbox" data-top="${esc(c.ref)}" ${J.top?'checked':''} aria-label="${esc(c.ref)} 상부 방열"></td>`:'<td colspan="4" class="cls">보드 온도만</td>'}</tr>`;}).join('');
  const pw=BD.netOrder.filter(n=>BD.netClass(n)!=='접지'&&BD.nets[n].tracks.length&&(BD.netClass(n)==='전원'||/PH_|MOTOR|VM|BAT/i.test(n))).slice(0,10);
  let res='';
  if(R&&R.error)res=`<p class="errline">${esc(R.error)}</p>`;
  else if(R){const w=R.worst,st=w?thSt(w.margin):['info','—'];const qs=R.qConv+R.qRad;const sel=R.hot.find(x=>x.ref===cfg.sel);
    res=`<div class="res"><div class="acts" style="justify-content:space-between"><h4>결과</h4><div class="vt" role="group" aria-label="열 지도 층"><button data-thl="T" aria-pressed="${cfg.layer==='T'}">TOP</button><button data-thl="B" aria-pressed="${cfg.layer==='B'}">BOTTOM</button></div></div>${SR.stale.th?'<p class="stale">조건이 바뀌었습니다. 다시 계산하세요.</p>':''}
    <div class="kpis"><div class="kpi"><b>${w?w.Tj.toFixed(1)+' °C':'—'}</b><span>최고 정션 온도${w?' · '+esc(w.ref):''}</span></div><div class="kpi"><b class="${st[0]==='err'?'c-err':st[0]==='warn'?'c-warn':''}">${w?(w.margin>=0?'+':'')+w.margin.toFixed(1)+' °C':'—'}</b><span>최소 마진 (Tj,max − Tj) · ${st[1]}</span></div>
      <div class="kpi"><b>${R.tmax.toFixed(1)} °C</b><span>보드 최고 (+${(R.tmax-R.Ta).toFixed(1)} °C)</span></div><div class="kpi"><b>${qs>0?Math.round(R.qRad/qs*100):0} %</b><span>복사 방열 비율 · 대류 ${qs>0?Math.round(R.qConv/qs*100):0} %</span></div></div>
    <table class="stbl thres"><thead><tr><th>부품</th><th class="r">P</th><th class="r">Tj</th><th class="r">마진</th><th>판정</th></tr></thead><tbody>${R.hot.filter(x=>x.Tj!=null||x.P>0).slice(0,12).map(x=>{const s=thSt(x.margin);return`<tr class="click${cfg.sel===x.ref?' on':''}" data-thref="${esc(x.ref)}"><td class="mono">${esc(x.ref)} <span class="cls">${esc((x.val||'').slice(0,10))}</span></td><td class="r mono">${SIM.fmtSI(x.P,'W')}</td><td class="r mono">${x.Tj!=null?x.Tj.toFixed(1):x.Tbmax.toFixed(1)+'*'}</td><td class="r mono">${x.margin!=null?(x.margin>=0?'+':'')+x.margin.toFixed(1):'—'}</td><td>${x.margin!=null?thPill(s):''}</td></tr>`;}).join('')}</tbody></table>
    <p class="lead" style="margin:0">* 정션 모델이 없는 부품은 보드 최고 온도. 판정: 마진 15 °C 이상 정상 · 0–15 °C 주의 · 음수 초과.${R.joule>0?` 줄 히팅 ${SIM.fmtSI(R.joule,'W')} 포함.`:''}</p>
    ${thDetail(sel,cfg)}
    <p class="lead">모델: 상·하 동박층(면방향 k<sub>Cu</sub>·두께·피복률 + FR-4 k<sub>xy</sub>)을 FR-4 k<sub>z</sub>와 써멀 비아(도금 ${cfg.plating} µm, 보드 비아 ${R.nv}개)로 연결한 2층 판${R.inner&&R.inner.length?`(내층 ${R.inner.length}장 — ${R.inner.map(L=>`${PCB.cuName(L.k)} ${L.net||(L.role==='sig'?'신호':'')} ${Math.round(L.mean*100)}%→${L.side==='T'?'상':'하'}`).join(' · ')} — 은 가까운 외층의 면방향 전도에 더함)`:''}에 양면 대류(h)·선형화 복사(ε, h<sub>rad</sub> ${R.hRad.toFixed(1)} W/m²K)를 경계로 정상 상태를 풉니다. 부품은 2-저항 모델(θ<sub>JB</sub>, 상부 방열 시 θ<sub>JC</sub>+TIM+하우징). 초기 설계 탐색용 근사이며 양산 검증은 3D CFD/FEA와 실측 보정을 병행해야 합니다 (JEDEC JESD51 · IPC-2152 · IPC-2221).</p></div>`;}
  const sec=(k,title,sum,body)=>`<details class="thsec" data-sec="${k}" ${cfg.open[k]?'open':''}><summary><b>${title}</b><span>${sum}</span></summary>${body}</details>`;
  return`<div class="sim"><ol class="thsteps">${steps.map(([n,t,d,ok])=>`<li class="${ok?'ok':''}"><b>${n}</b><span>${t}</span><small>${esc(d)}</small></li>`).join('')}</ol>
  ${sec('stack','① PCB 구조·재질',`${oz(cfg.cuT)}/${oz(cfg.cuB)} · 도금 ${cfg.plating} µm`,`<div class="thgrid">
    <label class="fld"><span>상단 동박</span><select data-thk="cuT">${[[18,'0.5 oz · 17.5 µm'],[35,'1 oz · 35 µm'],[70,'2 oz · 70 µm'],[105,'3 oz · 105 µm']].map(([v,l])=>`<option value="${v}"${cfg.cuT==v?' selected':''}>${l}</option>`).join('')}</select></label>
    <label class="fld"><span>하단 동박</span><select data-thk="cuB">${[[18,'0.5 oz · 17.5 µm'],[35,'1 oz · 35 µm'],[70,'2 oz · 70 µm'],[105,'3 oz · 105 µm']].map(([v,l])=>`<option value="${v}"${cfg.cuB==v?' selected':''}>${l}</option>`).join('')}</select></label>
    ${(BD.copperLayers||2)>2?`<label class="fld"><span>내층 동박 (${(BD.copperLayers||2)-2}장)</span><select data-thk="cuIn">${[[18,'0.5 oz · 17.5 µm'],[35,'1 oz · 35 µm'],[70,'2 oz · 70 µm']].map(([v,l])=>`<option value="${v}"${cfg.cuIn==v?' selected':''}>${l}</option>`).join('')}</select></label>
    <label class="fld" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="th-inner" ${cfg.inner!==false?'checked':''}><span>내층(GND · 전원 평면 · 내층 신호) 열 확산 포함</span></label>`:''}
    <label class="fld"><span>비아 도금 (µm)</span><input type="number" min="10" max="50" step="1" data-thk="plating" value="${cfg.plating}"></label>
    <label class="fld"><span>FR-4 k<sub>z</sub> (W/m·K)</span><input type="number" min="0.2" max="1" step="0.05" data-thk="kz" value="${cfg.kz}"></label></div>
    <p class="lead">보드 두께 ${BD.t} mm (보드 데이터). 구리 390 W/m·K 대비 FR-4는 약 0.3 W/m·K로 1,300배 낮아, 수직 방향 열은 써멀 비아가 좌우합니다.</p>`)}
  ${sec('src','② 부품 발열·열저항',`${nsrc}개 · ${SIM.fmtSI(ptot,'W')}${cfg.fromCkt?` · 회로 손실 ${cfg.fromCkt}개 자동`:''}`,`<div class="acts">${BD.comps.some(c=>c.P>0)?'<button class="btn sm" id="th-ckt" title="회로 생성기가 계산한 손실 — FET 전도 손실(정격 상전류 기준) · 레귤레이터 손실 · 션트 I²R · IC 전형값">회로 손실로 채우기</button>':''}${SR.sp&&SR.sp.parts?'<button class="btn sm" id="th-imp">회로 결과의 전력 가져오기</button>':''}<button class="btn sm" id="th-ic">IC마다 0.1 W</button><button class="btn sm ghost" id="th-zero">모두 0</button></div>
    <div class="scroll"><table class="stbl thsrc"><thead><tr><th>부품</th><th class="r">P (W)</th><th class="r">θ<sub>JB</sub></th><th class="r">T<sub>j,max</sub></th><th>출처</th><th title="TIM + 하우징 상부 방열">상부</th></tr></thead><tbody>${srcRows}</tbody></table></div>
    <p class="lead">θ<sub>JB</sub>(°C/W)·T<sub>j,max</sub>(°C)는 데이터시트 값(DS)이 있으면 그 값을, 없으면 패키지 일반값(추정)을 넣었습니다. 출처에 마우스를 올리면 근거가 보입니다.</p>
`)}
  ${sec('tim','③ 방열 부자재·기구물 (TIM·하우징)',Object.values(cfg.J).some(j=>j.top)?`${Object.values(cfg.J).filter(j=>j.top).length}개 부품 상부 방열`:'사용 안 함',`<p class="lead">② 표의 "상부"를 체크한 부품은 θ<sub>JC</sub> → TIM(k, 압축 두께 BLT) → 하우징 벽 → 하우징 표면 대류·복사의 두 번째 경로로도 열을 내보냅니다.</p>
    <div class="thgrid"><label class="fld"><span>TIM 열전도율 (W/m·K)</span><select data-tim="k">${TH_TIM.map(([v,l])=>`<option value="${v}"${cfg.tim.k==v?' selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld"><span>압축 두께 BLT (mm)</span><input type="number" min="0.02" step="0.05" data-tim="blt" value="${cfg.tim.blt}"></label>
      <label class="fld"><span>하우징 재질</span><select data-house="mat">${TH_MAT.map(([v,k,l])=>`<option value="${v}"${cfg.house.mat===v?' selected':''}>${l} W/m·K</option>`).join('')}</select></label>
      <label class="fld"><span>하우징 벽 두께 (mm)</span><input type="number" min="0.5" step="0.5" data-house="wall" value="${cfg.house.wall}"></label>
      <label class="fld"><span>하우징 표면적 (cm²)</span><input type="number" min="10" step="10" data-house="area" value="${cfg.house.area}"></label></div>
    <p class="lead">미세 공기층(k ≈ 0.026 W/m·K)을 메우는 TIM은 실제 조립 후 압축 두께가 핵심입니다. 플라스틱 하우징은 단열재에 가까워 상부 방열 효과가 거의 없습니다.</p>`)}
  ${sec('bc','④ 환경·경계 조건',`Ta ${cfg.Ta} °C · ${cfg.conv==='forced'?'강제 대류 '+cfg.v+' m/s':'자연 대류'} · ε ${cfg.eps}${Object.values(cfg.I).some(v=>v>0)||cfg.irJ?' · 줄 히팅':''}`,`<div class="thgrid">
    <label class="fld"><span>주변 온도 T<sub>a</sub></span><select data-thk="taPre">${TH_TA.map(([v,l])=>`<option value="${v}"${cfg.Ta==v?' selected':''}>${v} °C · ${l}</option>`).join('')}${TH_TA.some(([v])=>v==cfg.Ta)?'':`<option value="${cfg.Ta}" selected>${cfg.Ta} °C · 직접 입력</option>`}</select></label>
    <label class="fld"><span>직접 입력 (°C)</span><input type="number" step="1" data-thk="Ta" value="${cfg.Ta}"></label>
    <label class="fld"><span>대류</span><select data-thk="conv"><option value="nat_v"${cfg.conv==='nat_v'?' selected':''}>자연 대류 · 수직 장착</option><option value="nat_h"${cfg.conv==='nat_h'?' selected':''}>자연 대류 · 수평 장착</option><option value="forced"${cfg.conv==='forced'?' selected':''}>강제 대류 (팬)</option></select></label>
    <label class="fld"><span>풍속 (m/s)</span><input type="number" min="0" max="10" step="0.5" data-thk="v" value="${cfg.v}" ${cfg.conv==='forced'?'':'disabled'}></label>
    <label class="fld"><span>방사율 ε</span><select data-thk="eps">${TH_EPS.map(([v,l])=>`<option value="${v}"${cfg.eps==v?' selected':''}>${l}</option>`).join('')}</select></label>
    <div class="fld"><span>대류 계수 h</span><b class="mono">상 ${h.hT.toFixed(0)} · 하 ${h.hB.toFixed(0)} W/m²K</b></div></div>
    <p class="lead">자연 대류는 장착 방향(수평·수직)에 따라 h가 달라지고, 팬이 없으면 방열의 상당 부분이 복사로 빠집니다. 강제 대류 h ≈ 7 + 15·√v (평판 근사).</p>
    <div class="sub">대전류 패턴 줄 히팅 (I²R)</div>`+`<p class="lead">넷 전류를 넣으면 트랙 저항 ρ(T)=1.72×10⁻⁸·(1+0.00393·(T−20)) Ω·m로 I²R 발열을 계산해 넣습니다 (트랙 전체에 같은 전류 가정).</p>
    <div class="thgrid">${pw.map(n=>`<label class="fld"><span class="mono">${esc(n)}</span><input type="number" min="0" step="0.1" data-cur="${esc(n)}" value="${cfg.I[n]||''}" placeholder="A"></label>`).join('')||'<p class="lead">트랙이 있는 전원·모터 넷이 없습니다.</p>'}</div>
    ${SR.ir&&SR.ir.segs?`<label class="chkl"><input type="checkbox" id="th-irj" ${cfg.irJ?'checked':''}> 전압 강하 해석(${esc(SR.ir.net)})의 트랙별 전류 사용</label>`:''}`)}
  <div class="row2"><label class="fld"><span>계산 격자</span><select id="th-res"><option value="120"${cfg.res==120?' selected':''}>빠르게 (120칸)</option><option value="160"${cfg.res==160?' selected':''}>보통 (160칸)</option><option value="260"${cfg.res==260?' selected':''}>정밀 (260칸)</option></select></label><div class="fld"><span>&nbsp;</span><button class="btn primary" id="th-run">열 해석 실행</button></div></div>${res}${thProfHTML(cfg)}</div>`;
}
function thBind(b){
  const cfg=SR.cfg.th;const stale=()=>{if(SR.th&&!SR.th.error)SR.stale.th=true;};
  b.querySelectorAll('details.thsec').forEach(d=>d.addEventListener('toggle',()=>{cfg.open[d.dataset.sec]=d.open;}));
  b.querySelectorAll('[data-pw]').forEach(i=>i.addEventListener('change',()=>{cfg.P[i.dataset.pw]=Math.max(0,num(i.value,0));stale();}));
  b.querySelectorAll('[data-jb]').forEach(i=>i.addEventListener('change',()=>{const J=cfg.J[i.dataset.jb];J.thJB=Math.max(0.1,num(i.value,J.thJB));J.src='입력';J.note='사용자 입력';stale();}));
  b.querySelectorAll('[data-tjm]').forEach(i=>i.addEventListener('change',()=>{const J=cfg.J[i.dataset.tjm];J.tjmax=num(i.value,J.tjmax);stale();}));
  b.querySelectorAll('[data-top]').forEach(i=>i.addEventListener('change',()=>{cfg.J[i.dataset.top].top=i.checked;stale();renderSim();}));
  b.querySelectorAll('[data-thk]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.thk;if(k==='taPre'||k==='Ta')cfg.Ta=num(i.value,cfg.Ta);else if(k==='conv')cfg.conv=i.value;else cfg[k]=num(i.value,cfg[k]);stale();renderSim();}));
  b.querySelectorAll('[data-tim]').forEach(i=>i.addEventListener('change',()=>{cfg.tim[i.dataset.tim]=Math.max(0.01,num(i.value,cfg.tim[i.dataset.tim]));stale();}));
  b.querySelectorAll('[data-house]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.house;cfg.house[k]=k==='mat'?i.value:Math.max(0.1,num(i.value,cfg.house[k]));stale();}));
  b.querySelectorAll('[data-cur]').forEach(i=>i.addEventListener('change',()=>{const v=num(i.value,0);if(v>0)cfg.I[i.dataset.cur]=v;else delete cfg.I[i.dataset.cur];stale();}));
  b.querySelector('#th-irj')?.addEventListener('change',e=>{cfg.irJ=e.target.checked;stale();});
  b.querySelector('#th-res')?.addEventListener('change',e=>{cfg.res=+e.target.value;});
  b.querySelector('#prof-pre')?.addEventListener('change',e=>{const k=e.target.value;const p=PROF_PRESETS(...thPk()).find(x=>x[0]===k);if(!p)return;cfg.prof.text=p[2];if(SR.thp)SR.stale.thp=true;renderSim();});
  b.querySelector('#prof-txt')?.addEventListener('change',e=>{cfg.prof.text=e.target.value;if(SR.thp)SR.stale.thp=true;});
  b.querySelector('#prof-res')?.addEventListener('change',e=>{cfg.prof.res=+e.target.value;});
  b.querySelector('#prof-run')?.addEventListener('click',()=>{const btn=b.querySelector('#prof-run');cfg.prof.text=b.querySelector('#prof-txt').value;btn.disabled=true;btn.textContent='계산 중…';cfg.open.prof=true;
    setTimeout(()=>{try{runTHprof();SR.stale.thp=false;}catch(e){console.error(e);SR.thp={error:'프로파일 해석 오류: '+e.message};}renderSim();},20);});
  b.querySelector('#prof-csv')?.addEventListener('click',async()=>{const P=SR.thp;if(!P||P.error)return toast('먼저 [프로파일 해석]을 실행하세요.');const top=P.peaks.slice(0,12);
    const L=[['t_s','I_A','duty_pct','P_W','board_max_C',...top.map(x=>x.ref+'_Tj_C')].join(',')];P.out.t.forEach((t,i)=>L.push([t,P.out.I[i].toFixed(2),P.out.D[i].toFixed(1),P.out.P[i].toFixed(3),P.out.max[i].toFixed(2),...top.map(x=>x.ser[i].toFixed(2))].join(',')));
    const fn=await offerFile(String(BD.name||'board').replace(/[^\w\-]+/g,'_')+'_thermal_profile.csv',new TextEncoder().encode(L.join('\n')),'text/csv');if(fn)toast('프로파일 결과를 CSV로 내려받았습니다.');});
  b.querySelector('#th-ckt')?.addEventListener('click',()=>{Object.keys(cfg.P).forEach(k=>cfg.P[k]=0);BD.comps.forEach(c=>{if(c.P>0&&cfg.P[c.ref]!=null)cfg.P[c.ref]=+c.P;});stale();renderSim();});
  b.querySelector('#th-inner')?.addEventListener('change',e=>{cfg.inner=e.target.checked;stale();renderSim();});
  b.querySelector('#th-ic')?.addEventListener('click',()=>{BD.comps.forEach(c=>{if(c.kind==='ic')cfg.P[c.ref]=0.1;});renderSim();});
  b.querySelector('#th-zero')?.addEventListener('click',()=>{Object.keys(cfg.P).forEach(k=>cfg.P[k]=0);renderSim();});
  b.querySelector('#th-imp')?.addEventListener('click',()=>{importPower();renderSim();});
  b.querySelector('#th-run')?.addEventListener('click',()=>{const btn=b.querySelector('#th-run');btn.disabled=true;btn.textContent='계산 중…';setTimeout(async()=>{try{await runTHAsync();}catch(e){console.error(e);SR.th={error:'계산 중 오류: '+e.message};}renderSim();updateLegend();refresh(false);},20);});
  b.querySelectorAll('[data-thref]').forEach(r=>r.addEventListener('click',()=>{cfg.sel=r.dataset.thref;S.selRef=r.dataset.thref;S.hlNet=null;renderSim();refresh(false);}));
  b.querySelectorAll('[data-thl]').forEach(x=>x.addEventListener('click',()=>{cfg.layer=x.dataset.thl;if(SR.th&&SR.th.imgs)SR.th.img=SR.th.imgs[cfg.layer];renderSim();if(S.view==='3d'||S.view!==cfg.layer)setView(cfg.layer);refresh(false);}));
  b.querySelector('#th-meas')?.addEventListener('change',e=>{const v=e.target.value;if(v==='')delete cfg.meas[cfg.sel];else cfg.meas[cfg.sel]=num(v,null);renderSim();});
}
function importPower(){const cfg=thConfig();if(!SR.sp||!SR.sp.parts)return;Object.keys(cfg.P).forEach(k=>cfg.P[k]=0);SR.sp.parts.forEach(p=>{if(p.ref&&cfg.P[p.ref]!=null&&p.P>0)cfg.P[p.ref]=+(cfg.P[p.ref]+p.P).toFixed(4);});}

/* ---------- EMC / EMI ---------- */
const EMC_SEV={ok:'ok',warn:'warn',err:'err',info:'info'};
function emcConfig(){
  if(SR.cfg.emc)return SR.cfg.emc;
  SR.cfg.emc={p:Object.assign({},EMC.DEF),open:{ps:true,spec:true,xt:false,dc:false,sys:false},focus:null,limit:'',trx:4};return SR.cfg.emc;
}
function runEMC(){
  const c=emcConfig();const p=Object.assign({},c.p);['Vbus','fsw','Vabs'].forEach(k=>{if(!(p[k]>0))p[k]=null;});
  const H=typeof HS!=='undefined'&&HS.H&&BD&&HS.res?HS.H:null;
  SR.emc=EMC.analyze(BD,{cfg:p,env:{t:BD.t,er:ENV.er,cu:ENV.cu},H});SR.emc._H=H;SR.emc._B=BD;SR.stale.emc=false;
  if(!c.p.fsw)c.auto={fsw:SR.emc.cfg.fsw};if(!c.p.Vbus&&SR.emc.ps.Vbus)c.auto=Object.assign(c.auto||{},{Vbus:SR.emc.ps.Vbus});
}
const emcPill=s=>pill(EMC_SEV[s]||'info');
const fHz=f=>f>=1e9?(f/1e9).toFixed(2)+' GHz':f>=1e6?(f/1e6).toFixed(f>=1e8?0:1)+' MHz':(f/1e3).toFixed(0)+' kHz';
function emcSpecSVG(R,c){
  const S0=R.spec;if(!S0)return'<p class="lead">파워 스테이지(VM·OUT 핀을 가진 드라이버)가 없어 스위칭 스펙트럼을 만들 수 없습니다.</p>';
  const cfg=R.cfg;const slow=EMC.spectra(R,Object.assign({},cfg,{tr:cfg.tr*c.trx,tf:cfg.tf*c.trx}),R.freqs);
  const W=340,H=170,L=34,Bm=20,T=8,Rm=8;const f0=Math.log10(150e3),f1=Math.log10(1e9);
  const ser=[['V','스위칭 노드 V(f) · tr '+cfg.tr+' ns','s1',S0],['V','tr ×'+c.trx+' ('+(cfg.tr*c.trx)+' ns)','s6',slow],['Vlisn','전도 CE · LISN 25 Ω (CM)','s2',S0],['Ecm','방사 RE · 하네스 CM','s4',S0],['Edm','방사 RE · 루프 DM','s3',S0]];
  const all=ser.flatMap(s=>s[3].map(p=>p[s[0]])).filter(isFinite);const lim=parseFloat(c.limit);
  let y1=Math.ceil((Math.max(...all,isFinite(lim)?lim:-1e9)+5)/20)*20,y0=Math.max(y1-160,Math.floor(Math.min(...all)/20)*20);
  const X=f=>L+(Math.log10(f)-f0)/(f1-f0)*(W-L-Rm),Y=v=>T+(y1-Math.max(y0,Math.min(y1,v)))/(y1-y0)*(H-T-Bm);
  const path=(arr,k)=>arr.map((p,i)=>`${i?'L':'M'}${X(p.f).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  const band=`<rect x="${X(30e6)}" y="${T}" width="${X(200e6)-X(30e6)}" height="${H-T-Bm}" class="band"/><text x="${(X(30e6)+X(200e6))/2}" y="${T+10}" text-anchor="middle" class="bl">L_loop 링잉 대역</text>`;
  const ps=R.ps;const fr=ps.fring&&ps.fring>150e3&&ps.fring<1e9?`<line x1="${X(ps.fring)}" x2="${X(ps.fring)}" y1="${T}" y2="${H-Bm}" class="fr"/><text x="${X(ps.fring)+3}" y="${H-Bm-4}" class="frl">f_ring ${fHz(ps.fring)}</text>`:'';
  const tau=0.5/cfg.fsw,c1=1/(Math.PI*tau),c2=1/(Math.PI*cfg.tr*1e-9);
  const corner=[c1,c2].filter(f=>f>150e3&&f<1e9).map((f,i)=>`<line x1="${X(f)}" x2="${X(f)}" y1="${H-Bm}" y2="${H-Bm+4}" class="tk"/><text x="${X(f)+3}" y="${H-Bm-14}" class="cn">${f===c2?'f₂':'f₁'} ${fHz(f)}</text>`).join('');
  const grid=[0,1,2,3,4,5,6,7].map(k=>y0+k*20).filter(v=>v<=y1).map(v=>`<line x1="${L}" x2="${W-Rm}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L-3}" y="${Y(v)+3}" text-anchor="end" class="ax">${v}</text>`).join('');
  const xt=[150e3,1e6,10e6,100e6,1e9].map(f=>`<text x="${X(f)}" y="${H-3}" text-anchor="middle" class="ax">${fHz(f).replace(' ','')}</text>`).join('');
  const limL=isFinite(lim)?`<line x1="${L}" x2="${W-Rm}" y1="${Y(lim)}" y2="${Y(lim)}" class="lim"/><text x="${W-Rm-2}" y="${Y(lim)-3}" text-anchor="end" class="ll">사용자 한도 ${lim}</text>`:'';
  return`<svg class="emcspec" viewBox="0 0 ${W} ${H}" role="img" aria-label="스위칭 스펙트럼과 방출 추정">${band}${grid}${xt}${corner}${fr}${limL}
    ${ser.map(s=>`<path d="${path(s[3],s[0])}" class="sp" style="stroke:var(--${s[2]})${s[3]===slow?';stroke-dasharray:4 3':''}"/>`).join('')}</svg>
    <div class="thlg emclg">${ser.map(s=>`<span><i style="background:var(--${s[2]})"></i>${esc(s[1])}</span>`).join('')}</div>
    <p class="lead" style="margin:0">세로축 dBµV (전압·LISN) / dBµV/m (전계, 거리 ${cfg.dist} m). 사다리꼴 포락선: 평탄 2·V·D → f₁=1/πτ 부터 −20 dB/dec → f₂=1/πt<sub>r</sub> 부터 −40 dB/dec. t<sub>r</sub>를 늘리면 f₂가 내려가 고주파 성분이 줄어듭니다.</p>`;
}
function emcHTML(){
  const c=emcConfig();const curH=typeof HS!=='undefined'&&HS.H&&HS.res?HS.H:null;if(!SR.emc||SR.stale.emc||SR.emc._H!==curH||SR.emc._B!==BD)runEMC();const R=SR.emc,ps=R.ps,p=c.p,a=c.auto||{};
  const by=area=>R.checks.filter(x=>x.area.startsWith(area));
  const worst=arr=>arr.some(x=>x.sev==='err')?'err':arr.some(x=>x.sev==='warn')?'warn':arr.length&&arr.every(x=>x.sev==='info')?'info':'ok';
  const kL=R.checks.find(x=>x.item==='L_loop'),kC=R.checks.find(x=>x.item==='C_p,heatsink');
  const kK=R.checks.filter(x=>/L_gate|ESL\/SRF|고주파 바이패스/.test(x.item));
  const kpi=(t,ck)=>{if(!ck)return`<div class="kpi emck info"><span class="kt">${t}</span><b>—</b><span>해당 없음</span></div>`;const m=String(ck.val).match(/^(.*?)\s*\((.*)\)$/);const v=m?m[1]:ck.val,sub=[ck.sub,m&&m[2]].filter(Boolean).join(' · ');
    return`<div class="kpi emck ${ck.sev}"><span class="kt">${t}</span><b>${esc(v)}</b><span>${esc(sub)}</span></div>`;};
  const rank={err:3,warn:2,info:1,ok:0};const kw=kK.slice().sort((x,y)=>rank[y.sev]-rank[x.sev])[0];const kk=kw&&{sev:kw.sev,val:kw.sev==='ok'?'정상':kw.val,sub:kw.item};
  const nCnt=s=>R.checks.filter(x=>x.sev===s).length;
  const chk=R.checks.map((x,i)=>`<li class="click${c.focus===i?' on':''}" data-emcf="${i}" tabindex="0"><div class="eh">${emcPill(x.sev)}<b>${esc(x.item)}</b><span class="mono">${esc(x.val)}</span></div><div class="em">${esc(x.msg)}</div>${x.fix?`<div class="fix">대책: ${esc(x.fix)}</div>`:''}</li>`);
  const inp=(k,lab,unit,step,ph)=>`<label class="fld"><span>${lab}${unit?` (${unit})`:''}</span><input type="number" step="${step}" data-emc="${k}" value="${p[k]!=null?p[k]:''}" ${ph!=null?`placeholder="${ph}"`:''}></label>`;
  const sec=(k,title,sum,body)=>`<details class="thsec" data-esec="${k}" ${c.open[k]?'open':''}><summary><b>${title}</b><span>${sum}</span></summary>${body}</details>`;
  const loops=ps.loops.map(l=>`<tr><td class="mono">${esc(l.cap)} <span class="cls">${esc(l.val)} ${l.pkg||''}</span></td><td class="r mono">${l.lf.toFixed(1)}</td><td class="r mono">${l.Lfwd.toFixed(1)}</td><td class="r mono">${l.Lvia.toFixed(1)}</td><td class="r mono">${l.esl.toFixed(1)}</td><td class="r mono"><b>${l.L.toFixed(1)}</b></td></tr>`).join('');
  const gates=ps.gates.map(g=>`<tr><td class="mono">${esc(g.ref)} <span class="cls">${esc(g.val||'')}</span></td><td class="r mono">${g.len.toFixed(1)}</td><td class="r mono">${g.Lg.toFixed(1)}</td><td class="r mono">${g.Lcsi.toFixed(1)}</td><td class="r mono">${g.bounce.toFixed(2)} V</td><td class="r mono">${fHz(g.fg)}</td></tr>`).join('');
  const xt=R.xt.slice(0,12).map(x=>`<tr><td class="mono">${esc(x.aggr)}<div class="cls">${esc(x.akind)}</div></td><td class="mono">${esc(x.vict)}<div class="cls">${esc(x.vkind)}</div></td><td class="r mono">${x.len.toFixed(1)} / ${x.d.toFixed(2)}</td><td class="r mono">${(x.Cm*1e15).toFixed(0)} fF · ${(x.Lm*1e9).toFixed(2)} nH</td><td class="r mono"><b>${x.V*1e3<10?(x.V*1e3).toFixed(2):(x.V*1e3).toFixed(0)} mV</b></td><td>${emcPill(x.ratio<0.5?'ok':x.ratio<1?'warn':'err')}</td></tr>`).join('');
  const dc=R.dc.map(d=>`<tr><td class="mono">${esc(d.ref)} <span class="cls">${esc(d.val)} ${d.pkg||''}</span></td><td class="mono cls">${esc(d.net)}</td><td class="r mono">${d.esl.toFixed(1)} + ${d.Lm.toFixed(1)}</td><td class="r mono">${d.vias}</td><td class="r mono"><b>${fHz(d.srf)}</b></td><td class="r mono">${d.Z100.toFixed(2)} Ω</td></tr>`).join('');
  const ex=s=>s?'추정':'';
  return`<div class="sim emc">
  <p class="lead">레이아웃에서 기생 성분을 뽑아 모터 제어기 EMC 핵심 파라미터(L<sub>loop</sub>, Q<sub>rr</sub>·t<sub>rr</sub>, t<sub>r</sub>/t<sub>f</sub>, L<sub>gate</sub>·L<sub>CSI</sub>, C<sub>m</sub>·L<sub>m</sub>, ESL·SRF, C<sub>p,heatsink</sub>, 리턴 루프 면적, 하네스)를 추정하고 판정합니다. 클릭한 항목은 보드 위에 표시됩니다.</p>
  <div class="kpis kp3">${kpi('L<sub>loop</sub> 최소화',kL)}${kpi('C<sub>p,heatsink</sub> 관리',kC&&Object.assign({},kC,{val:kC.val.replace(' → ',' (')+')'}))}${kpi('켈빈 소스 · 고주파 ESL',kk)}</div>
  <div class="emcsum"><span>${pill('err')} ${nCnt('err')}</span><span>${pill('warn')} ${nCnt('warn')}</span><span>${pill('ok')} ${nCnt('ok')}</span><span class="cls">스위칭 ${fHz(R.cfg.fsw)}${a.fsw&&!p.fsw?' (HSIS/기본)':''} · V<sub>bus</sub> ${ps.Vbus||'—'} V · dV/dt ${ps.dvdt?(ps.dvdt/1e9).toFixed(2)+' V/ns':'—'} · dI/dt ${ps.didt?(ps.didt/1e6).toFixed(0)+' A/µs':'—'}</span></div>
  ${['1. 파워 스테이지','2. ','3. ','4. '].map((a,j)=>{const ids=R.checks.map((x,i)=>x.area.startsWith(a)?i:-1).filter(i=>i>=0);if(!ids.length)return'';return`<div class="sub">${['① 파워 스테이지','② 게이트 구동 · 크로스토크','③ 수동 소자 기생','④ 시스템 결합 · 접지 · 하네스'][j]}</div><ul class="emcchk">${ids.map(i=>chk[i]).join('')}</ul>`;}).join('')}
  ${sec('ps','① 파워 스테이지 · 게이트 루프',ps.drivers.length?`${ps.drivers.join(', ')} · L ${isFinite(ps.Lbest)?ps.Lbest.toFixed(1)+' nH':'—'} · 스파이크 ${ps.Vpk?ps.Vpk.toFixed(1)+' V':'—'}`:ps.fets.length?`FET ${ps.fets.join(', ')}`:'없음',`
    <div class="thgrid">${inp('Vbus','V<sub>bus</sub>','V',1,a.Vbus||'VM 넷')}${inp('fsw','스위칭 주파수','Hz',1000,a.fsw||'HSIS')}${inp('Ipk','상 전류 피크','A',0.1)}${inp('tr','t<sub>r</sub> (dV/dt)','ns',5)}${inp('tf','t<sub>f</sub> (dI/dt)','ns',5)}${inp('Coss','C<sub>oss</sub>','pF',10)}${inp('Qrr','바디 다이오드 Q<sub>rr</sub>','nC',1)}${inp('trr','t<sub>rr</sub>','ns',1)}${inp('Vabs','절대 최대 전압','V',1,ps.Vabs||'')}${inp('Ciss','C<sub>iss</sub> (개별 FET)','pF',10)}</div>
    <p class="lead">t<sub>r</sub>·t<sub>f</sub>·C<sub>oss</sub>·Q<sub>rr</sub>·t<sub>rr</sub>는 게이트 저항 R<sub>g</sub>와 밀러 용량 C<sub>gd</sub>로 정해지는 값이라 데이터시트·실측 값을 넣어야 정확합니다 (기본값은 소형 드라이버 추정치). 절대 최대 전압은 부품 DB(${ps.drivers.map(esc).join(', ')||'—'})에서 가져왔습니다.</p>
    ${ps.drivers.length?`${ps.loops.length?`<div class="sub">커뮤테이션 루프 (DC-Link 캡 → ${esc(ps.vmNet)} → 하프브리지 → PGND)</div><div class="scroll"><table class="stbl"><thead><tr><th>캡</th><th class="r">거리 mm</th><th class="r">배선 nH</th><th class="r">비아 nH</th><th class="r">ESL nH</th><th class="r">L<sub>loop</sub></th></tr></thead><tbody>${loops}</tbody></table></div>`:''}
    <div class="kv2"><span>ΔV = L·dI/dt</span><b>${ps.dV.toFixed(1)} V</b><span>역회복 I<sub>rr</sub> ≈ 2Q<sub>rr</sub>/t<sub>rr</sub></span><b>${ps.Irr.toFixed(2)} A → ${ps.dVrr.toFixed(1)} V</b><span>피크 전압</span><b>${ps.Vpk.toFixed(1)} V / ${ps.Vabs} V</b><span>링잉 f = 1/2π√(L·C<sub>oss</sub>)</span><b>${fHz(ps.fring)}</b></div>
    <p class="lead" style="margin:0">L은 배선(기준면 위 마이크로스트립 Z₀·지연), 비아 0.2·h·(ln(4h/d)+1) nH, 캡 ESL, 패키지 1 nH의 합입니다. 드라이버 내부(IC 패키지 안)의 루프는 포함하지 않습니다.</p>`:''}
    ${gates?`<div class="sub">게이트 루프 · 공통 소스 인덕턴스 (개별 FET)</div><div class="scroll"><table class="stbl"><thead><tr><th>FET</th><th class="r">게이트 경로 mm</th><th class="r">L<sub>gate</sub> nH</th><th class="r">L<sub>CSI</sub> nH</th><th class="r">바운스 L·dI/dt</th><th class="r">게이트 공진</th></tr></thead><tbody>${gates}</tbody></table></div><p class="lead" style="margin:0">L<sub>CSI</sub>는 파워 전류와 게이트 리턴이 공유하는 소스 경로입니다. 션트를 공유하면 di/dt가 게이트 전압을 흔들어 링잉·오동작을 일으키므로 켈빈 소스로 분리합니다.</p>`:ps.drivers.length?'<p class="lead" style="margin:0">게이트 드라이브가 드라이버 IC 안에 통합되어 있어 L<sub>gate</sub>·L<sub>CSI</sub>는 IC 패키지에 포함됩니다.</p>':''}`)}
  ${sec('spec','② 스위칭 스펙트럼 · 방출 추정',R.spec?`f₂ ${fHz(1/(Math.PI*R.cfg.tr*1e-9))}`:'파워 스테이지 없음',`<div class="row2"><label class="fld"><span>비교 t<sub>r</sub> 배수</span><select id="emc-trx">${[2,4,10].map(v=>`<option value="${v}"${c.trx==v?' selected':''}>×${v}</option>`).join('')}</select></label><label class="fld"><span>사용자 한도선 (dBµV/m, 선택)</span><input type="number" step="1" id="emc-lim" value="${esc(String(c.limit))}" placeholder="예: 시험 계획의 한도"></label></div>${emcSpecSVG(R,c)}`)}
  ${sec('xt','③ 크로스토크 (C<sub>m</sub>, L<sub>m</sub>)',R.xt.length?`${R.xt.length}쌍 · 최대 ${(R.xt[0].V*1e3).toFixed(1)} mV`:'평행 구간 없음',`${xt?`<div class="scroll"><table class="stbl"><thead><tr><th>가해 (dV/dt)</th><th>피해</th><th class="r">평행 mm / 간격 mm</th><th class="r">C<sub>m</sub> · L<sub>m</sub></th><th class="r">유기 노이즈</th><th></th></tr></thead><tbody>${xt}</tbody></table></div>`:'<p class="lead">스위칭 노드·PWM 선과 같은 층에서 5 mm 이내로 나란한 민감 신호가 없습니다.</p>'}
    <p class="lead" style="margin:0">가해: 상 출력(dV/dt = V<sub>bus</sub>/t<sub>r</sub>) · PWM 제어선(${R.cfg.Vdig} V/${R.cfg.trDig} ns). 피해: HSIS 분류 또는 넷 이름으로 아날로그(ADC, 허용 4 LSB) · 통신(0.2 V) · 디지털 입력(VIL 30 %). 기준면 위 두 선의 영상법 C<sub>m</sub>, L<sub>m</sub>으로 V = C<sub>m</sub>·dV/dt·Z<sub>v</sub> + L<sub>m</sub>·dI/dt (Z<sub>v</sub>: 아날로그 ${R.cfg.Zana} Ω · 디지털 ${R.cfg.Zdig} Ω · 통신 ${R.cfg.Zcom} Ω).</p>`)}
  ${sec('dc','④ 디커플링 ESL · SRF',`${R.dc.length}개${R.filt.length?' · 필터 '+R.filt.map(f=>f.ref).join(','):''}`,`<div class="scroll"><table class="stbl"><thead><tr><th>캡</th><th>넷</th><th class="r">ESL + 실장 nH</th><th class="r">GND 비아</th><th class="r">f<sub>SRF</sub></th><th class="r">|Z| @100 MHz</th></tr></thead><tbody>${dc}</tbody></table></div>
    <p class="lead" style="margin:0">f<sub>SRF</sub> = 1/2π√(L·C). 그 위에서는 커패시터가 인덕터로 동작해 고주파 전도 노이즈(CE)를 통과시킵니다. ESL은 패키지 크기 일반값(0402 0.4 · 0603 0.6 · 0805 0.8 · 1210 1.1 nH), 실장은 GND 비아까지 인출선 + 비아로 계산합니다. 공통 모드 초크·필터의 기생 병렬 C<sub>p</sub>는 부품 SRF 데이터로 확인해야 합니다.</p>`)}
  ${sec('sys','⑤ 방열판 결합 · 리턴 경로 · 하네스',R.hs?`C<sub>p</sub> ${(R.hs.C*1e12).toFixed(1)} pF · 슬롯 ${R.slots.length}`:`슬롯 ${R.slots.length}`,`<div class="thgrid">
    <label class="fld"><span>방열판 위치</span><select data-emcs="hsPos"><option value="below"${p.hsPos==='below'?' selected':''}>보드 아래 (BOTTOM 면 + TIM)</option><option value="above"${p.hsPos==='above'?' selected':''}>보드 위 (TOP 면 + TIM)</option></select></label>
    ${inp('timT','TIM 두께','mm',0.1)}${inp('timEr','TIM εr','',0.5)}${inp('harness','하네스 길이','m',0.1)}
    <label class="fld"><span>실드</span><select data-emcs="shield"><option value="0"${!p.shield?' selected':''}>비실드</option><option value="1"${p.shield?' selected':''}>실드 (360° 접지)</option></select></label>${inp('shieldDb','실드 감쇠','dB',1)}${inp('dist','측정 거리','m',0.5)}</div>
    ${R.hs?`<div class="kv2"><span>스위칭 노드 동박</span><b>TOP ${R.hs.aT.toFixed(0)} · BOTTOM ${R.hs.aB.toFixed(0)} mm²</b><span>C<sub>p,heatsink</sub> = ε₀ε<sub>r</sub>A/d</span><b>${(R.hs.C*1e12).toFixed(2)} pF</b><span>I<sub>cm</sub> = C<sub>p</sub>·dV/dt</span><b>${(R.hs.Icm*1e3).toFixed(2)} mA (피크)</b><span>보드 GND면 결합</span><b>${(R.hs.Cgnd*1e12).toFixed(1)} pF</b></div>`:''}
    <div class="sub">신호 리턴 루프 (상위 5)</div><div class="scroll"><table class="stbl"><thead><tr><th>넷</th><th class="r">길이 mm</th><th class="r">루프 mm²</th><th>기준면</th></tr></thead><tbody>${R.loops.slice(0,5).map(l=>`<tr><td class="mono">${esc(l.net)}</td><td class="r mono">${l.len.toFixed(1)}</td><td class="r mono">${l.area.toFixed(0)}</td><td>${l.plane?'있음':'없음'}</td></tr>`).join('')}</tbody></table></div>
    <p class="lead" style="margin:0">방사 전계는 차동 모드 E ≈ 1.316×10⁻¹⁴·f²·A·I/r, 공통 모드 E ≈ 1.257×10⁻⁶·f·L·I<sub>cm</sub>/r (Ott). 하네스 길이는 λ/2에서 제한합니다. 슬롯 교차 ${R.slots.length}곳은 보드 위에 ✕로 표시됩니다.</p>`)}
  <p class="lead">모든 값은 레이아웃 기하 + 일반 패키지 값에 기반한 1차 추정(Pre-compliance)입니다. 규격(CISPR 25 등) 한도선은 넣지 않았습니다. 시험 계획의 한도를 ② 사용자 한도선에 입력해 비교하고, 최종 판정은 3D 전자기 해석과 챔버 시험으로 확인하세요.</p></div>`;
}
function emcBind(b){
  const c=emcConfig();const upd=()=>{runEMC();renderSim();updateLegend();refresh(false);};
  b.querySelectorAll('details.thsec').forEach(d=>d.addEventListener('toggle',()=>{c.open[d.dataset.esec]=d.open;}));
  b.querySelectorAll('[data-emc]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.emc;const v=parseFloat(i.value);if(i.value===''&&['Vbus','fsw','Vabs'].includes(k))c.p[k]=null;else if(isFinite(v)&&v>=0)c.p[k]=v;upd();}));
  b.querySelectorAll('[data-emcs]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.emcs;c.p[k]=k==='shield'?i.value==='1':i.value;upd();}));
  b.querySelector('#emc-trx')?.addEventListener('change',e=>{c.trx=+e.target.value;renderSim();});
  b.querySelector('#emc-lim')?.addEventListener('change',e=>{c.limit=e.target.value;renderSim();});
  b.querySelectorAll('[data-emcf]').forEach(r=>{const go=()=>{const i=+r.dataset.emcf;c.focus=c.focus===i?null:i;renderSim();updateLegend();refresh(false);};r.addEventListener('click',go);r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
}
// which overlay layers the focused check asks for
function emcFocus(){const c=SR.cfg&&SR.cfg.emc;if(!c||c.focus==null||!SR.emc)return null;const x=SR.emc.checks[c.focus];if(!x)return null;
  const it=x.item;return /L_loop|스파이크|링잉|바이패스/.test(it)?'loop':/C_p/.test(it)?'sw':/→|크로스토크|dV\/dt/.test(it)||x.area.includes('크로스토크')?'xt':/리턴/.test(it)?'slot':/루프 면적/.test(it)?'big':/L_gate/.test(it)?'gate':/ESL/.test(it)?'dc':null;}
function emcDraw(ctx,side){
  const R=SR.emc,f=emcFocus(),ps=R.ps,lw=Math.max(0.12,BD.W/500);const dim=k=>f&&f!==k?0.25:1;
  const net=(n,col,a)=>{ctx.globalAlpha=a;drawPrims(ctx,BD.layers[side+'.cu'],p=>p.net===n&&p.t!=='text'&&!p.clear?(p.t==='pour'||p.t==='poly'?col+'88':col):null,{clear:'rgba(6,10,12,1)'});BD.comps.forEach(cc=>cc.pads.forEach(pd=>{if(pd.net===n&&padOn(pd,side)){ctx.fillStyle=col;padPath(ctx,pd,0);}}));ctx.globalAlpha=1;};
  ps.switchNets.forEach(n=>net(n,'#eb6834',dim('sw')));
  ps.gates.forEach(g=>{net(g.gateNet,'#a77bf3',dim('gate'));});
  if(f==='big'&&R.loops[0])net(R.loops[0].net,'#fab219',1);
  R.xt.slice(0,8).forEach((x,i)=>{const a=dim('xt');net(x.vict,x.ratio>=1?'#d03b3b':'#3987e5',a*(i<3?1:0.6));ctx.globalAlpha=a;ctx.strokeStyle='#fff';ctx.lineWidth=lw*0.8;ctx.setLineDash([lw*2,lw*2]);x.marks.forEach(m=>{ctx.beginPath();ctx.moveTo(m[0][0],m[0][1]);ctx.lineTo(m[1][0],m[1][1]);ctx.stroke();});ctx.setLineDash([]);ctx.globalAlpha=1;});
  {const l=ps.loops[0];const lc=l&&BD.byRef[l.cap];if(l&&(!lc||lc.side===side)){ctx.globalAlpha=dim('loop');ctx.strokeStyle='#d03b3b';ctx.fillStyle='rgba(208,59,59,.18)';ctx.lineWidth=lw*1.4;ctx.setLineDash([lw*3,lw*2]);ctx.beginPath();l.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}}
  if(f==='dc'||!f)R.dc.forEach(d=>{const cc=BD.byRef[d.ref];if(!cc||cc.side!==side)return;const bad=!d.vias||d.L>3;if(d.C>1e-6&&!bad)return;ctx.strokeStyle=bad?'#fab219':'#0ca30c';ctx.lineWidth=lw;ctx.beginPath();ctx.arc(cc.body.cx,cc.body.cy,Math.max(cc.body.w,cc.body.h)*0.7+0.3,0,TAU);ctx.stroke();});
  ctx.globalAlpha=dim('slot');ctx.strokeStyle='#ff5a5a';ctx.lineWidth=lw*1.3;const r=Math.max(0.6,BD.W/160);R.slots.forEach(s=>{if(s.layer!==side)return;ctx.beginPath();ctx.moveTo(s.at[0]-r,s.at[1]-r);ctx.lineTo(s.at[0]+r,s.at[1]+r);ctx.moveTo(s.at[0]+r,s.at[1]-r);ctx.lineTo(s.at[0]-r,s.at[1]+r);ctx.stroke();});ctx.globalAlpha=1;
}

/* ---------- circuit ---------- */
const TYPE_LABEL={R:'저항',C:'커패시터',L:'인덕터',D:'다이오드',SW:'스위치',LOAD:'IC 부하',REG:'레귤레이터',V:'전압 소스',NMOS:'N-MOSFET · Vth',MOTOR:'DC 모터 · 부하 토크',BLDC:'BLDC 모터 · 부하 토크',BRIDGE3:'3상 드라이버 · RDS(on)',HALL:'홀 센서'};
function spConfig(){
  if(SR.cfg.sp)return SR.cfg.sp;const ck=SIM.extractCircuit(BD);
  let tstop=12,steps=1200;
  if(BD.demo==='bldc'){
    ck.srcs.forEach(s=>{if(s.n[0]==='+12V'){s.wave='dc';s.v=12;s.label='J1 12 V 입력 전원';}});
    ck.els.forEach(e=>{if(e.type==='LOAD'&&e.ref==='U1')e.I=0.02;});
    tstop=200;steps=6400;
  }
  else if(BD.demo==='mcu'){
    // MCU board: 5 V applied at t = 0; the firmware drives PA8 (PWM) and PB3 (LED) during the run
    ck.srcs.forEach(s=>{if(s.n[0]==='VIN'){s.wave='dc';s.label='J1 5 V 입력 전원';}});
    ck.els.forEach(e=>{if(e.type==='LOAD'&&e.ref==='U1')e.I=0.015;});
    tstop=800;steps=10000;
  }
  else if(BD.source==='예제'){ck.els.forEach(e=>{if(e.type==='LOAD')e.I=e.ref==='U1'?0.02:0.008;});if(BD.nets.LED)ck.srcs.push({id:'V2',type:'V',n:['LED',ck.gnd],v:3.3,wave:'pulse',t0:3e-3,per:4e-3,duty:0.5,tr:1e-3,label:'U1 GPIO (PB3) 출력 · 예시'});}
  const probes=[...new Set(ck.srcs.map(s=>s.n[0]).concat(ck.els.filter(e=>e.type==='REG').map(e=>e.n[1])).concat(BD.nets.LED_A?['LED_A']:[]).concat(ck.els.filter(e=>e.type==='MOTOR').map(e=>e.n[1]).concat(ck.els.filter(e=>e.type==='BLDC').map(e=>e.n[0]))).concat(BD.nets.ISNS_ADC?['ISNS_ADC']:[]))].slice(0,4);
  SR.cfg.sp={ck,tstop,steps,probes,tran:null,hidden:{}};return SR.cfg.sp;
}
const valStr=e=>e.type==='BRIDGE3'?SIM.fmtSI(e.ron,'Ω').replace(' ',''):(e.type==='MOTOR'||e.type==='BLDC')?(e.tl*1000).toFixed(2):e.type==='NMOS'?String(e.vth):e.type==='R'?SIM.fmtSI(e.val,'Ω').replace(' ',''):e.type==='C'?SIM.fmtSI(e.val,'F').replace(' ',''):e.type==='L'?SIM.fmtSI(e.val,'H').replace(' ',''):e.type==='LOAD'?(e.I*1000).toFixed(1):e.type==='REG'?e.vset:'';
// transient run; when the board has an MCU with firmware, its loop() is co-simulated and drives the MCU pins
function spRunTransient(){
  const cfg=spConfig(),ck=cfg.ck,mcu=fwMcu();let ctl=null,c=ck,autoSteps=0;
  if(mcu){ctl=FW.controller(fwCode(mcu),{pins:fwPins(mcu),gnd:ck.gnd,vdd:3.3,ref:mcu.ref});
    if(ctl.error){SR.fw={error:ctl.error,line:ctl.line,logs:ctl.logs};return{error:ctl.error};}
    const fmax=Math.max(0,...ctl.srcs.filter(s=>s.pwm).map(s=>s.freq));const need=Math.ceil(cfg.tstop*1e-3*fmax*16);
    if(fmax*16*cfg.tstop*1e-3>40000)SR.fwWarn=`PWM ${fmax} Hz는 계산 단계(최대 40,000)로 충분히 풀 수 없어 파형이 거칠어집니다. 해석 시간을 줄이거나 주파수를 낮추세요.`;else SR.fwWarn=null;
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
    <p class="lead" style="margin:0">출력 핀(${(()=>{const u=FW.pinUsage(fwCode(mcu),fwMcuDesc(mcu)),pn=fwPins(mcu);return u.out.map(o=>esc(o.pin)+'→'+esc(pn[o.pin]||'?')+(o.pwm?' PWM':'')).join(', ')||'펌웨어가 정함';})()})은 실행할 때 펌웨어의 <code>loop(ms)</code>가 1 ms마다 정합니다. ADC 핀은 회로의 전압을 읽습니다.</p></div>`:'';
  const srcs=fwSrc+ck.srcs.map((s,i)=>`<div class="srccard"><div class="hd"><span>${esc(s.id)} · ${esc(s.label||'전압 소스')}</span><button class="x" data-srcdel="${i}" aria-label="${esc(s.id)} 삭제">✕</button></div>
    <div class="row3"><label class="fld"><span>+ 넷</span><select data-src="${i}" data-k="n0" id="src${i}-n">${netOpts(s.n[0])}</select></label><label class="fld"><span>파형</span><select data-src="${i}" data-k="wave" id="src${i}-w"><option value="dc"${s.wave==='dc'?' selected':''}>직류</option><option value="step"${s.wave==='step'?' selected':''}>계단</option><option value="pulse"${s.wave==='pulse'?' selected':''}>펄스</option></select></label><label class="fld"><span>전압 V</span><input type="number" step="0.1" data-src="${i}" data-k="v" value="${s.v}" id="src${i}-v"></label></div>
    ${s.wave==='step'?`<div class="row3"><label class="fld"><span>시작 ms</span><input type="number" step="0.1" min="0" data-src="${i}" data-k="t0" value="${+(s.t0*1e3).toFixed(3)}" id="src${i}-t0"></label><label class="fld"><span>상승 ms</span><input type="number" step="0.1" min="0.001" data-src="${i}" data-k="tr" value="${+(s.tr*1e3).toFixed(3)}" id="src${i}-tr"></label></div>`:''}
    ${s.wave==='pulse'?`<div class="row3"><label class="fld"><span>시작 ms</span><input type="number" step="0.1" min="0" data-src="${i}" data-k="t0" value="${+(s.t0*1e3).toFixed(3)}" id="src${i}-t0"></label><label class="fld"><span>주기 ms</span><input type="number" step="0.1" min="0.01" data-src="${i}" data-k="per" value="${+(s.per*1e3).toFixed(3)}" id="src${i}-per"></label><label class="fld"><span>듀티 %</span><input type="number" step="5" min="1" max="99" data-src="${i}" data-k="duty" value="${Math.round(s.duty*100)}" id="src${i}-d"></label></div>`:''}</div>`).join('');
  const els=ck.els.map((e,i)=>{const unit=e.type==='LOAD'?'mA':e.type==='REG'?'V':(e.type==='MOTOR'||e.type==='BLDC')?'mN·m':e.type==='NMOS'?'V':'';
    const valCell=e.type==='SW'?`<select data-el="${i}" data-k="closed" aria-label="${esc(e.ref)} 상태" id="el${i}-sw"><option value="0"${!e.closed?' selected':''}>열림</option><option value="1"${e.closed?' selected':''}>닫힘</option></select>`:e.type==='D'?(e.led?'LED':'Si'):e.type==='HALL'?'회전각 연동':`<input type="text" data-el="${i}" data-k="val" value="${esc(valStr(e))}" aria-label="${esc(e.ref)} 값" id="el${i}-v" style="width:72px">${unit?' '+unit:''}`;
    return`<tr><td><input type="checkbox" data-el="${i}" data-k="on"${e.on?' checked':''} aria-label="${esc(e.ref)} 사용" id="el${i}-on"></td><td class="mono">${esc(e.ref)}</td><td style="white-space:nowrap">${TYPE_LABEL[e.type]}${e.guess?' <span class="cls">값 추정</span>':''}</td><td class="mono" style="font-size:11px;white-space:nowrap">${e.n.map(esc).join(' → ')}</td><td class="r">${valCell}</td></tr>`;}).join('');
  let res='';const R=SR.sp;
  if(R&&R.error)res=`<p class="errline">${esc(R.error)}</p>`;
  else if(R){
    const nets=Object.entries(R.nets).sort((a,b)=>b[1]-a[1]);
    const parts=R.parts.filter(p=>p.type!=='C'&&p.type!=='L'&&Math.abs(p.P)>1e-6).sort((a,b)=>Math.abs(b.P)-Math.abs(a.P));
    const mots=R.parts.filter(p=>(p.type==='MOTOR'||p.type==='BLDC')),leds=R.parts.filter(p=>p.type==='D'&&BD.byRef[p.id]&&BD.byRef[p.id].kind==='led');
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
    else{const v=SIM.parseVal(el.value);if(e.type==='MOTOR'||e.type==='BLDC'){const x=parseFloat(el.value);if(x>=0)e.tl=x/1000;}else if(e.type==='BRIDGE3'){if(v>0)e.ron=v;}else if(e.type==='NMOS'){const x=parseFloat(el.value);if(x>0)e.vth=x;}else if(e.type==='LOAD'){const x=parseFloat(el.value);if(x>=0)e.I=x/1000;}else if(e.type==='REG'){const x=parseFloat(el.value);if(x>0)e.vset=x;}else if(v>0){e.val=v;e.guess=false;}el.value=valStr(e);}}));
  b.querySelector('#sp-t')?.addEventListener('change',e=>{cfg.tstop=Math.max(0.01,num(e.target.value,cfg.tstop));});
  b.querySelector('#sp-n')?.addEventListener('change',e=>{cfg.steps=Math.round(Math.min(20000,Math.max(100,num(e.target.value,cfg.steps))));});
  b.querySelector('#sp-dc')?.addEventListener('click',()=>{const r=SIM.dcop(Object.assign({},ck,{tDC:cfg.tstop*1e-3}));SR.sp=r.error?{error:r.error}:Object.assign(r,{label:`DC 동작점 (t = ${cfg.tstop} ms 소스 값)`});playReset();renderSim();updateLegend();refresh(false);});
  b.querySelector('#sp-run')?.addEventListener('click',()=>fwRunAll(b.querySelector('#sp-run')));
  b.querySelector('#sp-fw')?.addEventListener('click',()=>fwOpen());
  b.querySelectorAll('[data-probe]').forEach(x=>x.addEventListener('click',()=>{const p=x.dataset.probe;cfg.hidden[p]=!cfg.hidden[p];renderSim();}));
  b.querySelectorAll('[data-spnet]').forEach(r=>r.addEventListener('click',()=>{const n=r.dataset.spnet;if(!cfg.probes.includes(n)){cfg.probes.push(n);if(cfg.probes.length>8)cfg.probes.shift();}S.hlNet=n;refresh(false);renderSim();}));
  b.querySelectorAll('#sp-play,#sp-play2').forEach(x=>x.addEventListener('click',()=>{playReset();if(S.view!=='3d'||S.sch==='full'){setView('3d');}toast(SR.sp&&SR.sp.fromTran?'3D 보기에서 과도 해석을 재생합니다. 아래 재생 막대로 멈추거나 시간을 옮길 수 있습니다.':'3D 보기에서 DC 동작점의 LED 밝기와 모터 회전을 보여줍니다.');}));
  b.querySelector('#sp-th')?.addEventListener('click',()=>{importPower();SR.tab='th';renderSim();updateLegend();refresh(false);toast('회로 해석의 소비전력을 열 해석 표에 넣었습니다. "열 해석 실행"을 누르세요.');});
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
  $$('.stabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.stab===SR.tab?'true':'false'));
  const b=$('#simBody');const sc=b.scrollTop;
  try{
    if(SR.tab==='ir'){b.innerHTML=irHTML();irBind(b);}
    else if(SR.tab==='si'){if(!SR.si)runSI();b.innerHTML=siHTML();siBind(b);}
    else if(SR.tab==='th'){b.innerHTML=thHTML();thBind(b);}
    else if(SR.tab==='emc'){b.innerHTML=emcHTML();emcBind(b);}
    else{b.innerHTML=spHTML();spBind(b);}
  }catch(e){console.error(e);b.innerHTML=`<p class="errline">시뮬레이션 화면을 그리지 못했습니다: ${esc(e.message)}</p>`;}
}
