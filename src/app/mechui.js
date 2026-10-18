/* ---------- 기구 CAD workspace: protective housing (HOUSING engine) designed from a Text-to-CAD console (TEXT2CAD) ----------
   Left: design conditions and the engineering read-out. Centre: the 3D view (the board viewport is moved here) and the console.
   Right: feature tree, dimensions, per-part heat paths, material comparison, CAD export. */
function mechCfg(){if(!BD.housing)BD.housing={inp:{P:'auto',ip:'IP54',vib:2,ta:ENV.Ta||25,tmax:85,tj:125,mat:'auto',tim:'auto'},show:false,open:false,R:null,key:''};
  const H=BD.housing,I=H.inp;if(I.tj==null)I.tj=125;if(!I.tim)I.tim='auto';if(!H.cad)H.cad=TEXT2CAD.blank();if(!H.undo)H.undo=[];if(!H.redo)H.redo=[];return H;}
function mechPower(){try{const cfg=thConfig();const P={};let any=false;Object.entries(cfg.P||{}).forEach(([k,v])=>{if(+v>0){P[k]=+v;any=true;}});return any?P:null;}catch(e){return null;}}
function mechRun(force){const H=mechCfg();const i=H.inp;const key=JSON.stringify(i)+JSON.stringify(H.cad)+'|'+BD.comps.length+'|'+BD.W+'x'+BD.H;
  if(!force&&H.R&&H.key===key)return H.R;H.R=HOUSING.analyze(BD,{P:i.P==='auto'?null:+i.P,ip:i.ip,vib:+i.vib,ta:+i.ta,tmax:+i.tmax,tj:+i.tj,mat:i.mat,tim:i.tim,power:mechPower(),cad:H.cad});H.key=key;return H.R;}
const MECH_BAR=(lab,val,max,unit,kind)=>{const pct=Math.max(0,Math.min(100,val/max*100));return`<div class="mbar"><div class="mbar-h"><span>${lab}</span><b class="mono">${unit==='%'?Math.round(val)+'%':`${Math.round(val)} / ${max}`}</b></div><div class="mbar-t"><i class="mb-${kind}" style="width:${pct}%"></i></div></div>`;};
const mechCard=(k,t,sub)=>`<div class="mcard"><span class="mck">${k}</span><b>${t}</b><span class="ms">${sub}</span></div>`;
/* ---- left: conditions and read-out ---- */
function cadLeftHTML(){
  const H=mechCfg(),i=H.inp,R=mechRun(),d=R.d,g=d.geo,ipIdx=Math.max(0,HOUSING.IPS.indexOf(d.ip));
  const autoP=i.P==='auto';const peds=d.th.peds,seal=R.N.cuts.filter(c=>c.sealed),maxTj=Math.max(0,...d.th.parts.map(p=>p.Tj));const good=v=>v>=60?'ok':v>=30?'warn':'err';
  return`<div class="sim mech">
  <p class="h">설계 조건</p>
  <div class="mctl">
    <label class="mrow"><span>PCB 총 발열량</span><b class="mono">${R.inp.P} W${autoP?' · 자동':''}</b>
      <input type="range" min="0" max="60" step="0.5" value="${R.inp.P}" data-mh="P" aria-label="발열량 W"></label>
    <label class="chkl msub"><input type="checkbox" data-mh="Pauto" ${autoP?'checked':''}> 보드에서 자동 (${mechPower()?'열 해석 전력 합':'부품 역할 추정'} ${HOUSING.boardNeeds(BD,{power:mechPower()}).Ptot.toFixed(2)} W)</label>
    <label class="mrow"><span>방진·방수 (IP)</span><b class="mono">${d.ip} (${['개방','덮개','방진·생활방수','분진·분사수','침수방수','고온 고압 세척'][ipIdx]})</b>
      <input type="range" min="0" max="${HOUSING.IPS.length-1}" step="1" value="${ipIdx}" data-mh="ip" aria-label="IP 등급"></label>
    <label class="mrow"><span>진동 가혹도</span><b class="mono">${R.inp.vib} Grms</b>
      <input type="range" min="0" max="20" step="0.5" value="${R.inp.vib}" data-mh="vib" aria-label="진동 Grms"></label>
    <div class="mgrid"><label class="fld"><span>주위 온도 °C</span><input type="number" step="1" data-mh="ta" value="${i.ta}"></label><label class="fld"><span>PCB 한계 °C</span><input type="number" step="1" data-mh="tmax" value="${i.tmax}"></label><label class="fld"><span>부품 Tj 한계 °C</span><input type="number" step="5" data-mh="tj" value="${i.tj}"></label>
      <label class="fld"><span>재질</span><select data-mh="mat"><option value="auto"${i.mat==='auto'?' selected':''}>자동 (최저 원가)</option>${Object.entries(HOUSING.MATS).map(([k,v])=>`<option value="${k}"${i.mat===k?' selected':''}>${esc(v.short)}</option>`).join('')}</select></label>
      <label class="fld"><span>방열 패드 (TIM)</span><select data-mh="tim"><option value="auto"${i.tim==='auto'?' selected':''}>자동</option>${Object.entries(HOUSING.TIMS).map(([k,v])=>`<option value="${k}"${i.tim===k?' selected':''}>${esc(v.short)}</option>`).join('')}<option value="none"${i.tim==='none'?' selected':''}>사용 안 함</option></select></label></div>
  </div>
  <div class="mnote"><b>설계 조건 요약</b><ul>${R.conds.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div>
  ${mechCard('하우징 재질',esc(d.m.label),`벽 ${g.t} mm${g.t!==g.tAuto?' (지정)':''}${g.rim>g.t?` · 실링 플랜지 ${g.rim} mm`:''} · 모서리 R${g.r} · ${esc(d.m.proc_label)}`)}
  ${mechCard('열관리',d.m.metal?(peds.length?`TIM + 페데스탈 ${peds.length}곳`:'하우징 벽 열전도'):'수지 벽 전도 + 내부 대류',`${peds.length?`베이스(서멀 비아) ${peds.filter(p=>p.kind==='bottom').length} · 커버 ${peds.filter(p=>p.kind==='top').length} · `:''}${d.fins?`방열 핀 ${d.fins.n}개${d.fins.user?' (지정)':''} · `:''}표면 ${d.th.Ts.toFixed(0)} °C · PCB ${d.th.Tboard.toFixed(0)} °C · 최고 Tj ${maxTj.toFixed(0)} °C`)}
  ${peds.length?mechCard('방열 패드 (TIM)',esc([...new Set(peds.map(p=>HOUSING.TIMS[p.tim].label))].join(' · ')),`BLT ${[...new Set(peds.map(p=>p.blt))].join(' / ')} mm · 면적 ${peds.reduce((a,p)=>a+p.area,0).toFixed(0)} mm² · 서멀 비아 ${peds.reduce((a,p)=>a+p.vias,0)}개 · 전기 절연형`):''}
  ${seal.map(c=>mechCard('커넥터 관통부',`${esc(c.ref)} ${esc(c.mpn)} ↔ ${esc(c.mate)}`,`창 ${(c.b-c.a).toFixed(1)} × ${(c.z1-c.z0).toFixed(1)} mm · 플랜지 실링 ${c.land.toFixed(1)} mm · 돌출 ${(c.shroudLen-g.rim).toFixed(1)} mm · 분할면 창 아래`)).join('')}
  ${mechCard('기밀·실링',esc(d.seal.label),esc(d.seal.gasket+(d.seal.breather?' · 벤트 필터 필수':'')))}
  ${mechCard('체결·보강',`커버 ${d.screwM} × ${d.ns} · PCB 보스 ${d.sup.length}`,`간격 ≤ ${d.pitch} mm${d.added.length?` · 중앙 지지 ${d.added.length}`:''}${R.inp.vib>=4?' · 대각 리브':''}`)}
  <div class="mbars"><b>트레이드오프</b>
    ${MECH_BAR('제조 원가 지수',R.idx.cost,100,'','cost')}${MECH_BAR('중량 지수',R.idx.mass,100,'','mass')}
    ${MECH_BAR('방열 여유도',R.idx.thermal,100,'%',good(R.idx.thermal))}${MECH_BAR('내진동 안전율',R.idx.vib,100,'%',good(R.idx.vib))}</div>
  ${R.warn.length?`<ul class="chk">${R.warn.map(w=>`<li>${pill('warn')}<div><span>${esc(w)}</span></div></li>`).join('')}</ul>`:''}
  <p class="lead" style="margin-top:8px">초기 설계용 추정입니다: 자연대류·복사, 벽 전도, 부품별 방열 경로(서멀 비아·TIM·페데스탈), 커넥터 플랜지 실링, Steinberg PCB 진동. 양산 전 열·구조 해석과 IP 시험으로 확인하세요.</p>
</div>`;}
/* ---- right: feature tree, dimensions, heat paths, comparison, export ---- */
function cadRightHTML(){
  const H=mechCfg(),R=mechRun(),d=R.d,g=d.geo,C=H.cad,peds=d.th.peds;const ov=Object.entries(C.over||{});
  const auto=[['본체',`${esc(d.m.short)} · 외형 ${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm`],['분할',`베이스 / 커버 · z ${g.zSplit.toFixed(1)} mm${g.splitWin?' (커넥터 창 아래)':''}`],
    ['PCB 보스',`${d.sup.length}개 · 스탠드오프 ${g.stand} mm`],['커버 나사',`${d.screwM} × ${d.ns}`],['실링',esc(d.seal.gasket)],
    ...R.N.cuts.map(c=>[`창 ${c.ref}`,`${HOUSING.SIDE_KO[c.side]} ${(c.b-c.a).toFixed(1)} × ${(c.z1-c.z0).toFixed(1)}${c.sealed?' · 플랜지 실링':''}`]),
    ...(d.seal.breather?[['벤트','뒤 벽 M12 ePTFE (자동)']]:[]),...(peds.length?[['페데스탈',peds.map(p=>`${p.ref}(${p.kind==='bottom'?'베이스':'커버'})`).join(' ')]]:[]),...(d.fins&&!d.fins.user?[['방열 핀',`${d.fins.n}개 · ${d.fins.h.toFixed(0)} mm (자동)`]]:[])];
  return`<p class="h">형상 트리</p>
  <ul class="ftree">${auto.map(([k,v])=>`<li class="fa"><span class="fk">${k}</span><span>${v}</span></li>`).join('')}
    ${C.feats.map(f=>`<li class="fu"><span class="fk mono">${esc(f.id)}</span><span>${esc(HOUSING.featLabel(Object.assign({},f,{id:''})))}</span><button class="pill vbtn" data-fdel="${esc(f.id)}" title="${esc(f.id)} 삭제" aria-label="${esc(f.id)} 삭제">×</button></li>`).join('')}
    ${ov.map(([k,v])=>`<li class="fo"><span class="fk">지정</span><span>${esc(TEXT2CAD.OVER[k]||k)} ${v}</span><button class="pill vbtn" data-oclr="${esc(k)}" title="자동으로" aria-label="${esc(TEXT2CAD.OVER[k]||k)} 자동으로">×</button></li>`).join('')}</ul>
  ${C.feats.length||ov.length?'':'<p class="lead" style="margin:4px 0 0">아래 Text-to-CAD 콘솔에 문장이나 명령으로 형상을 더하세요. 예: 오른쪽 벽에 M16 케이블 글랜드 2개, 장착 탭 4개 M5</p>'}
  <div class="acts" style="flex-wrap:wrap;margin-top:10px"><button class="btn sm" id="cadOpen">${H.open?'커버 닫기':'커버 열기'}</button><button class="btn primary sm" id="cadExp">CAD 내보내기</button><button class="btn sm" id="cadUndo"${H.undo.length?'':' disabled'}>실행 취소</button></div>
  <details class="thsec" open><summary><b>치수 · 해석</b><span>${d.mass.toFixed(0)} g</span></summary>
    <table class="stbl"><tbody>
      <tr><td>외형</td><td class="mono">${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm</td></tr>
      <tr><td>내부</td><td class="mono">${g.Li.toFixed(1)} × ${g.Wi.toFixed(1)} × ${g.Hi.toFixed(1)} mm</td></tr>
      <tr><td>벽 · 플랜지 · R</td><td class="mono">${g.t} · ${g.rim} · ${g.r} mm</td></tr>
      <tr><td>온도 (주위 ${R.inp.ta} °C)</td><td class="mono">표면 ${d.th.Ts.toFixed(1)} · PCB ${d.th.Tboard.toFixed(1)} °C · TIM ${d.th.Ptim.toFixed(1)} W</td></tr>
      <tr><td>PCB 진동</td><td class="mono">f₁ ${d.vib.fn.toFixed(0)} Hz · SF ${d.vib.sf.toFixed(2)}</td></tr>
    </tbody></table></details>
  ${d.th.parts.length?`<details class="thsec"><summary><b>부품별 방열 경로</b><span>Tj 한계 ${R.inp.tj} °C</span></summary>
    <table class="stbl"><thead><tr><th>부품</th><th class="r">W</th><th>경로 · TIM</th><th class="r">Tj</th></tr></thead><tbody>${d.th.parts.map(p=>{const q=peds.find(x=>x.ref===p.ref);const over=p.Tj>R.inp.tj;
      return`<tr><td>${esc(p.ref)}</td><td class="r mono">${p.P.toFixed(2)}</td><td>${q?`${q.kind==='bottom'?`비아 ${q.vias} → 베이스`:'윗면 → 커버'} · ${esc(HOUSING.TIMS[q.tim].short)} ${q.blt} mm`:'보드로만'}</td><td class="r mono"><span class="sv ${over?'err':p.Tj>R.inp.tj-10?'warn':'ok'}">${p.Tj.toFixed(0)}</span></td></tr>`;}).join('')}</tbody></table></details>`:''}
  <details class="thsec"><summary><b>재질 비교</b><span>${R.all.filter(x=>x.feasible).length}/${R.all.length} 적합</span></summary>
    <table class="stbl"><thead><tr><th>재질</th><th class="r">PCB °C</th><th class="r">g</th><th class="r">원가</th><th>판정</th></tr></thead><tbody>${R.all.map(x=>`<tr class="${x===d?'on':''}"><td>${esc(x.m.short)}</td><td class="r mono">${x.th.Tboard.toFixed(0)}</td><td class="r mono">${x.mass.toFixed(0)}</td><td class="r mono">${x.costIdx}</td><td>${x.feasible?'<span class="sv ok"><i aria-hidden="true">✓</i>적합</span>':`<span class="sv warn" title="${esc(x.why.join(' · '))}"><i aria-hidden="true">!</i>${esc(x.why[0]||'')}</span>`}</td></tr>`).join('')}</tbody></table></details>`;}
function cadBind(){
  const H=mechCfg(),i=H.inp;let t=0;const L=$('#cadLeft'),Rr=$('#cadRight');
  const apply=()=>{H.R=null;clearTimeout(t);t=setTimeout(()=>cadRefresh(),60);};
  const snap=()=>{H.undo.push(JSON.stringify({inp:H.inp,cad:H.cad}));if(H.undo.length>80)H.undo.shift();H.redo=[];};
  L.querySelectorAll('[data-mh]').forEach(el=>{const k=el.dataset.mh;const ev=el.type==='range'?'input':'change';let snapped=false;el.addEventListener(ev,()=>{if(!snapped||ev==='change'){snap();snapped=true;}
    if(k==='P'){i.P=+el.value;}else if(k==='Pauto'){i.P=el.checked?'auto':mechRun().inp.P;}else if(k==='ip'){i.ip=HOUSING.IPS[+el.value];}else if(k==='vib'){i.vib=+el.value;}
    else if(k==='ta'||k==='tmax'||k==='tj'){const v=parseFloat(el.value);if(isFinite(v))i[k]=v;}else if(k==='mat')i.mat=el.value;else if(k==='tim')i.tim=el.value;apply();});
    el.addEventListener('change',()=>{snapped=false;});});
  Rr.querySelectorAll('[data-fdel]').forEach(b=>b.addEventListener('click',()=>cadExec('del '+b.dataset.fdel)));
  Rr.querySelectorAll('[data-oclr]').forEach(b=>b.addEventListener('click',()=>cadExec(`set ${b.dataset.oclr} auto`)));
  Rr.querySelector('#cadOpen')?.addEventListener('click',()=>cadExec(H.open?'close':'open'));
  Rr.querySelector('#cadExp')?.addEventListener('click',()=>cadExec('export zip'));
  Rr.querySelector('#cadUndo')?.addEventListener('click',()=>cadExec('undo'));
}
function cadRender(){if(!BD||!$('#cadLeft'))return;const keep=[$('#cadLeft').scrollTop,$('#cadRight').scrollTop];
  const open=[...$('#cadRight').querySelectorAll('details')].map(x=>x.open);
  $('#cadLeft').innerHTML=cadLeftHTML();$('#cadRight').innerHTML=cadRightHTML();
  [...$('#cadRight').querySelectorAll('details')].forEach((x,k)=>{if(open[k]!=null)x.open=open[k];});
  $('#cadLeft').scrollTop=keep[0];$('#cadRight').scrollTop=keep[1];cadBind();}
function cadRefresh(){if(HS.ws!=='cad')return;cadRender();mech3D();}
/* ---- workspace switch: the board viewport moves into the CAD centre column ---- */
const CADVP={home:null};
function cadEnter(){if(!BD)return;const H=mechCfg();
  if(!CADVP.home){CADVP.home=document.createComment('vp-home');vp.parentNode.insertBefore(CADVP.home,vp);}
  $('#cadVpSlot').appendChild(vp);if(S.sch!=='off')S.sch='off';setView('3d');
  H.show=true;cadConsole();cadRender();
  setTimeout(()=>{resize3D();mech3D();const R=mechRun(),g=R.d.geo;if(G3){const a=G3.cam.aspect||1.5,tt=Math.tan(G3.cam.fov*D2R/2);camTo(-1.95,0.95,Math.max(g.Wo*1.6/(2*tt),(g.Lo+90)*1.15/(2*tt*a)),true);}},0);}
function cadLeave(){const H=BD&&BD.housing;if(H){H.show=false;mech3D();}if(CADVP.home&&vp.parentNode!==CADVP.home.parentNode)CADVP.home.parentNode.insertBefore(vp,CADVP.home);}
/* ---- 3D: base + cover around the board (board frame: x,y on the board, z = 0 at the board mid-plane) ---- */
function mechGroup(R){
  const d=R.d,g=d.geo,T=R.N.t,THR=THREE;const grp=new THR.Group();grp.userData.housing=true;const base=new THR.Group(),lid=new THR.Group();grp.add(base);grp.add(lid);
  const col=d.m.metal?(d.mat==='spcc'?0x6f7780:0xb9c0c8):0x3b4046;
  const mat=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.55:0.05,roughness:d.m.metal?0.45:0.7,transparent:true,opacity:0.32,depthWrite:false,side:THR.DoubleSide});
  const solid=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.5:0.05,roughness:0.5});
  const timM=new THR.MeshStandardMaterial({color:0xe48ab0,roughness:0.8});const darkM=new THR.MeshStandardMaterial({color:0x1d2126,roughness:0.6});
  const featM=new THR.MeshStandardMaterial({color:0x3d8bff,roughness:0.5,transparent:true,opacity:0.85});
  const box=(x0,y0,z0,x1,y1,z1,m,par)=>{const me=new THR.Mesh(new THR.BoxGeometry(Math.max(0.01,x1-x0),Math.max(0.01,y1-y0),Math.max(0.01,z1-z0)),m);me.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);par.add(me);return me;};
  const cyl=(x,y,z0,z1,r,m,par)=>{const me=new THR.Mesh(new THR.CylinderGeometry(r,r,z1-z0,24),m);me.rotation.x=Math.PI/2;me.position.set(x,y,(z0+z1)/2);par.add(me);return me;};
  const X0=g.x0,Y0=g.y0,X1=g.x0+g.Lo,Y1=g.y0+g.Wo,Zb=g.zFloor-g.t,Zt=g.zLid+g.t,r=g.rim;
  const holesOn=sd=>d.feats.filter(f=>(f.type==='hole'||f.type==='slot')&&f.side===sd);
  // a wall as an extruded outline with connector / vent / user openings, between z0 and z1
  const wall=(side,z0,z1,par)=>{const horiz=side==='S'||side==='N';const len=horiz?g.Lo:g.Wo;const o0=horiz?X0:Y0;
    const sh=new THR.Shape();sh.moveTo(0,z0);sh.lineTo(len,z0);sh.lineTo(len,z1);sh.lineTo(0,z1);sh.lineTo(0,z0);
    const rectHole=(a,b,lo,hi)=>{lo=Math.max(z0+0.2,lo);hi=Math.min(z1-0.2,hi);if(hi-lo<0.3||b-a<0.3)return;const h=new THR.Path();h.moveTo(a,lo);h.lineTo(a,hi);h.lineTo(b,hi);h.lineTo(b,lo);h.lineTo(a,lo);sh.holes.push(h);};
    R.N.cuts.filter(c=>c.side===side).forEach(c=>rectHole(c.a-o0,c.b-o0,c.z0,c.z1));
    if(side==='N'&&d.seal.breather){const zc=g.zSplit-4;if(zc-6>z0&&zc+6<z1){const h=new THR.Path();h.absarc(len/2,zc,6,0,Math.PI*2,true);sh.holes.push(h);}}
    holesOn(side).forEach(f=>{const u=f.a-o0;if(f.type==='slot'){if(f.z-f.h/2>z0+0.2&&f.z+f.h/2<z1-0.2)rectHole(u-f.w/2,u+f.w/2,f.z-f.h/2,f.z+f.h/2);return;}
      if(f.z-f.w/2>z0+0.2&&f.z+f.w/2<z1-0.2&&u-f.w/2>0.2&&u+f.w/2<len-0.2){const h=new THR.Path();h.absarc(u,f.z,f.w/2,0,Math.PI*2,true);sh.holes.push(h);}});
    const geo=new THR.ExtrudeGeometry(sh,{depth:r,bevelEnabled:false,curveSegments:24});
    // shape (along, z) extruded by the wall thickness → world: S/N walls run along x, W/E walls along y
    geo.applyMatrix4(horiz?new THR.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1):new THR.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
    const me=new THR.Mesh(geo,mat);
    if(side==='S')me.position.set(X0,Y0+r,0);else if(side==='N')me.position.set(X0,Y1,0);else if(side==='W')me.position.set(X0,Y0,0);else me.position.set(X1-r,Y0,0);
    par.add(me);return me;};
  // floor / cover plate with user holes
  const plate=(sd,z0,z1,par)=>{const hs=holesOn(sd);if(!hs.length)return box(X0,Y0,z0,X1,Y1,z1,mat,par);
    const sh=new THR.Shape();sh.moveTo(X0,Y0);sh.lineTo(X1,Y0);sh.lineTo(X1,Y1);sh.lineTo(X0,Y1);sh.lineTo(X0,Y0);
    hs.forEach(f=>{const h=new THR.Path();if(f.type==='slot'){h.moveTo(f.x-f.w/2,f.y-f.h/2);h.lineTo(f.x-f.w/2,f.y+f.h/2);h.lineTo(f.x+f.w/2,f.y+f.h/2);h.lineTo(f.x+f.w/2,f.y-f.h/2);h.lineTo(f.x-f.w/2,f.y-f.h/2);}else h.absarc(f.x,f.y,f.w/2,0,Math.PI*2,true);sh.holes.push(h);});
    const me=new THR.Mesh(new THR.ExtrudeGeometry(sh,{depth:z1-z0,bevelEnabled:false,curveSegments:24}),mat);me.position.z=z0;par.add(me);return me;};
  // base: floor, walls up to the split line, PCB supports, lid screw bosses, base pedestals, tabs, ribs
  plate('B',Zb,g.zFloor,base);['S','N','W','E'].forEach(s=>wall(s,g.zFloor,g.zSplit,base));
  d.sup.forEach(s=>cyl(s.x,s.y,g.zFloor,-T/2,s.d>3.4?4.5:3.5,s.kind==='user'?featM:solid,base));
  d.screws.forEach(s=>cyl(s.x,s.y,g.zFloor,g.zSplit,d.screwM==='M4'?4.5:3.75,mat,base));
  if(R.inp.vib>=4){box(X0+r,(Y0+Y1)/2-1,g.zFloor,X1-r,(Y0+Y1)/2+1,g.zFloor+Math.min(3,g.stand-0.5),mat,base);}
  d.feats.forEach(f=>{
    if(f.type==='tabs')f.tabs.forEach(t=>{box(t.cx-t.sx/2,t.cy-t.sy/2,f.z0,t.cx+t.sx/2,t.cy+t.sy/2,f.z0+f.tt,featM,base);cyl(t.hx,t.hy,f.z0-0.02,f.z0+f.tt+0.02,f.hd/2,darkM,base);});
    else if(f.type==='rib'){if(f.axis==='x')box(X0+r,f.pos-f.tt/2,g.zFloor,X1-r,f.pos+f.tt/2,g.zFloor+f.h,featM,base);else box(f.pos-f.tt/2,Y0+r,g.zFloor,f.pos+f.tt/2,Y1-r,g.zFloor+f.h,featM,base);}});
  // gasket on the split line
  if(d.seal.gasket!=='없음'&&d.seal.gasket!=='없음 (정밀 맞춤)'){const m2=new THR.LineBasicMaterial({color:0xe2703a});const ins=r/2;const pts=[[X0+ins,Y0+ins],[X1-ins,Y0+ins],[X1-ins,Y1-ins],[X0+ins,Y1-ins],[X0+ins,Y0+ins]].map(p=>new THR.Vector3(p[0],p[1],g.zSplit+0.05));base.add(new THR.Line(new THR.BufferGeometry().setFromPoints(pts),m2));}
  // cover: walls from the split line, top plate, pedestals + TIM on the hot parts, fins, engraved label
  ['S','N','W','E'].forEach(s=>wall(s,g.zSplit,g.zLid,lid));plate('T',g.zLid,Zt,lid);
  d.th.peds.forEach(p=>{const q=p.ped;if(p.kind==='top'){box(q.x,q.y,q.z0,q.x+q.w,q.y+q.h,g.zLid,solid,lid);box(q.x,q.y,q.tz,q.x+q.w,q.y+q.h,q.z0,timM,lid);}
    else{box(q.x,q.y,g.zFloor,q.x+q.w,q.y+q.h,q.z1,solid,base);box(q.x,q.y,q.z1,q.x+q.w,q.y+q.h,-T/2,timM,base);}});
  if(d.fins)for(let k=0;k<d.fins.n;k++){const x=X0+5+k*d.fins.pitch;if(x+d.fins.t>X1-2)break;box(x,Y0+4,Zt,x+d.fins.t,Y0+4+d.fins.len,Zt+d.fins.h,solid,lid);}
  d.feats.filter(f=>f.type==='label').forEach(f=>{const c=document.createElement('canvas');const s=String(f.text||'');c.width=Math.max(64,s.length*40);c.height=64;const x=c.getContext('2d');
    x.fillStyle='#2a2f35';x.font='600 46px "JetBrains Mono", monospace';x.textAlign='center';x.textBaseline='middle';x.fillText(s,c.width/2,c.height/2);const tx=new THR.CanvasTexture(c);
    const w=f.size*Math.max(1,s.length)*0.68,h=w*c.height/c.width;const me=new THR.Mesh(new THR.PlaneGeometry(w,h),new THR.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false}));me.position.set(f.x,f.y,Zt+(d.fins?d.fins.h+0.06:0.06));lid.add(me);});
  // sealed connectors: seal bead around the window on the inner wall face, and the mating harness plug in front of it
  R.N.cuts.filter(c=>c.sealed).forEach(c=>{const m2=new THR.LineBasicMaterial({color:0xe2703a});const o=0.9;const inner=c.side==='W'?X0+r-0.05:c.side==='E'?X1-r+0.05:c.side==='S'?Y0+r-0.05:Y1-r+0.05;
    const P=(u,z)=>c.side==='W'||c.side==='E'?new THR.Vector3(inner,u,z):new THR.Vector3(u,inner,z);
    lid.add(new THR.Line(new THR.BufferGeometry().setFromPoints([P(c.a-o,c.z0-o),P(c.b+o,c.z0-o),P(c.b+o,c.z1+o),P(c.a-o,c.z1+o),P(c.a-o,c.z0-o)]),m2));
    const pl=c.plug;if(!pl)return;const plugM=new THR.MeshStandardMaterial({color:0x2a2c30,roughness:0.7,transparent:true,opacity:0.55,depthWrite:false});const ac=(c.a+c.b)/2,zc=(c.z0+c.z1)/2,hz=c.side==='W'||c.side==='E';
    const[u0,u1]=c.side==='W'?[X0-0.5-pl.len,X0-0.5]:c.side==='E'?[X1+0.5,X1+0.5+pl.len]:c.side==='S'?[Y0-0.5-pl.len,Y0-0.5]:[Y1+0.5,Y1+0.5+pl.len];
    const mesh=hz?box(u0,ac-pl.w/2,zc-pl.h/2,u1,ac+pl.w/2,zc+pl.h/2,plugM,grp):box(ac-pl.w/2,u0,zc-pl.h/2,ac+pl.w/2,u1,zc+pl.h/2,plugM,grp);mesh.userData.plug=c.ref;});
  lid.position.z=mechCfg().open?Math.max(25,g.Ho*0.9):0;grp.userData.base=base;grp.userData.lid=lid;return grp;
}
function mech3D(){if(!G3||!G3.root)return;const old=G3.root.children.find(o=>o.userData&&o.userData.housing);if(old){G3.root.remove(old);disposeTree(old);}
  const H=BD.housing;if(H&&H.show){try{G3.root.add(mechGroup(mechRun()));}catch(e){console.error(e);toast('하우징 3D를 만들지 못했습니다: '+e.message);}}G3.dirty=true;}
/* ---- export: OpenSCAD (real CSG), STL of base and cover (tessellated preview solids), report, parameters ---- */
function mechSTL(obj,name){const out=[`solid ${name}`];obj.updateMatrixWorld(true);const inv=new THREE.Matrix4();const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];const n=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
  inv.copy(obj.matrixWorld).invert();obj.traverse(me=>{if(!me.isMesh||me.material&&me.material.isMeshBasicMaterial)return;const m=new THREE.Matrix4().multiplyMatrices(inv,me.matrixWorld);const geo=me.geometry.index?me.geometry.toNonIndexed():me.geometry;const p=geo.attributes.position;
    for(let i=0;i+2<p.count;i+=3){for(let k=0;k<3;k++)v[k].fromBufferAttribute(p,i+k).applyMatrix4(m);e1.subVectors(v[1],v[0]);e2.subVectors(v[2],v[0]);n.crossVectors(e1,e2).normalize();
      out.push(` facet normal ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}\n  outer loop\n${v.map(q=>`   vertex ${q.x.toFixed(4)} ${q.y.toFixed(4)} ${q.z.toFixed(4)}`).join('\n')}\n  endloop\n endfacet`);}});
  out.push(`endsolid ${name}`);return out.join('\n')+'\n';}
async function mechExport(kind){
  kind=kind||'zip';const R=mechRun();const H=mechCfg();const base=(BD.name||'board').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'board';
  if(kind==='scad'){const fn=await offerFile(base+'_housing.scad',new TextEncoder().encode(HOUSING.scad(R,BD.name)),'text/plain');if(fn)toast('OpenSCAD 모델을 내려받았습니다.');return fn;}
  const z=new JSZip();if(kind==='zip')z.file(base+'_housing.scad',HOUSING.scad(R,BD.name));
  try{const grp=mechGroup(R);grp.userData.lid.position.z=0;z.file(base+'_housing_base.stl',mechSTL(grp.userData.base,base+'_base'));z.file(base+'_housing_lid.stl',mechSTL(grp.userData.lid,base+'_lid'));disposeTree(grp);}catch(e){console.error(e);}
  if(kind==='zip'){
    z.file(base+'_housing_report.md',`# ${BD.name||base} 하우징 설계\n\n\`\`\`\n${HOUSING.text(R)}\n\n${HOUSING.compareText(R)}\n\`\`\`\n\n## Text-to-CAD 기록\n\n\`\`\`\n${CADC.log.filter(e=>e.k==='cmd').map(e=>e.t).join('\n')||'(없음)'}\n\`\`\`\n\n- 좌표: 보드 왼쪽 아래 = (0,0), 보드 두께 중간면 z = 0, 단위 mm\n- SCAD는 실제 CSG(차집합)로 만든 파라메트릭 모델입니다. STL은 화면용 형상을 삼각형으로 옮긴 참고용(부품이 겹친 솔리드)이라 3D 프린팅·금형에는 SCAD에서 다시 내보내세요.\n`);
    z.file(base+'_housing.json',JSON.stringify({input:R.inp,cad:H.cad,material:R.d.mat,geometry:R.d.geo,supports:R.d.sup,screws:R.d.screws,screw:R.d.screwM,seal:R.d.seal,fins:R.d.fins,features:R.d.feats,
      thermal_paths:R.d.th.peds.map(p=>({ref:p.ref,P:p.P,path:p.kind,tim:p.tim,tim_label:HOUSING.TIMS[p.tim].label,blt_mm:p.blt,pad_thickness_mm:p.padT,area_mm2:Math.round(p.area),thermal_vias:p.vias,R_KW:+p.R.toFixed(2),Tj:+p.Tj.toFixed(1),pedestal:p.ped})),junctions:R.d.th.parts,cutouts:R.N.cuts,thermal:{Ts:R.d.th.Ts,Tboard:R.d.th.Tboard},vibration:R.d.vib,mass_g:R.d.mass,indices:R.idx},null,2));}
  const data=await z.generateAsync({type:'uint8array'});const fn=await offerFile(base+(kind==='stl'?'_housing_stl.zip':'_housing.zip'),data,'application/zip');if(fn)toast(kind==='stl'?'베이스·커버 STL을 내려받았습니다.':'하우징 CAD(SCAD·STL)와 보고서를 zip으로 내려받았습니다.');return fn;
}
/* ---- Text-to-CAD console ---- */
var CADC={log:[],hist:[],hi:-1,busy:false,abort:null,stopReq:false,seq:0};
const CAD_CHIPS=[['IP67 다이캐스팅','set mat adc12','알루미늄 다이캐스팅, IP67, 진동 6 Grms 조건으로 맞추고 결과를 검토해줘'],
  ['케이블 글랜드','gland E M16','오른쪽 벽에 M16 케이블 글랜드를 하나 넣되 커넥터·나사와 겹치지 않게 해줘'],
  ['장착 탭 4개','tabs 4 --screw M5','차량 브래킷에 고정할 M5 장착 탭 4개를 달아줘'],
  ['방열 핀','fins 14 --h 15','커버에 방열 핀을 넣어 최고 Tj를 낮추고 무게 변화를 알려줘'],
  ['커버 각인','label "AURIX ECU"','커버 윗면에 제품명을 각인해줘'],
  ['재질 비교','compare','재질 후보를 비교하고 원가·무게·열 여유 기준으로 추천해줘'],
  ['점검','check','지금 설계에서 문제(겹침·실링·온도)를 찾아 고쳐줘'],
  ['내보내기','export zip','CAD를 zip으로 내보내줘']];
function cadSay(k,t){const e={k,t,id:++CADC.seq};CADC.log.push(e);if(CADC.log.length>400)CADC.log.shift();copPaint('cad',e);return e;}
function cadSetE(e,t){e.t=t;copPaint('cad',e,true);}
function cadConsole(){if(!CADC.greeted){CADC.greeted=true;cadSay('out','4단계 하우징: 문장이나 명령으로 설계합니다 (예: 오른쪽 벽에 M16 글랜드 2개, 장착 탭 4개 M5). 결정론 모드는 문장을 규칙으로 명령으로 바꾸고, AI 모드는 Claude가 같은 명령을 골라 실행합니다. help로 명령 목록.');}return copEnsure();}
function cadBusy(b){CADC.busy=b;copBusyPaint();const r=$('#cadRun'),s=$('#cadStop'),i=$('#cadIn');if(r)r.disabled=b;if(s)s.hidden=!b;if(i)i.disabled=b;if(!b){CADC.stopReq=false;CADC.abort=null;setTimeout(()=>i&&HS.ws==='cad'&&i.focus(),10);}}
function cadBrief(R){const d=R.d,g=d.geo;return`→ ${d.m.short} · ${g.Lo.toFixed(0)}×${g.Wo.toFixed(0)}×${g.Ho.toFixed(0)} mm · ${d.mass.toFixed(0)} g · PCB ${d.th.Tboard.toFixed(0)} °C · 최고 Tj ${Math.max(0,...d.th.parts.map(p=>p.Tj)).toFixed(0)} °C · 원가 ${R.idx.cost} · ${d.feasible?'조건 만족':'조건 미달: '+d.why.join(', ')}${R.warn.length?` · 경고 ${R.warn.length}건`:''}`;}
// one console command; returns the text to print
async function cadRunCmd(line,by){
  const H=mechCfg();const before=JSON.stringify({inp:H.inp,cad:H.cad});const st=JSON.parse(before);
  const r=TEXT2CAD.exec(st,line,HOUSING);
  if(r.mutated){H.undo.push(before);if(H.undo.length>80)H.undo.shift();H.redo=[];H.inp=st.inp;H.cad=st.cad;H.R=null;const R=mechRun();cadRefresh();
    const nw=R.warn.filter(w=>/^F\d+/.test(w));return r.out+'\n'+cadBrief(R)+(nw.length?'\n'+nw.map(w=>'! '+w).join('\n'):'');}
  switch(r.action){
    case'report':return HOUSING.text(mechRun());
    case'compare':return HOUSING.compareText(mechRun());
    case'show':case'hide':if(HS.ws!=='cad')setWorkspace('cad');return'3D에 하우징을 표시합니다.';
    case'open':case'close':H.open=r.action==='open';if(HS.ws!=='cad')setWorkspace('cad');mech3D();cadRender();return H.open?'커버를 열었습니다.':'커버를 닫았습니다.';
    case'export':{if(by==='ai')return'내보내기는 사용자가 직접 실행합니다 (export '+r.kind+').';const fn=await mechExport(r.kind);return fn?`${fn} 내려받기`:'내려받기를 취소했습니다.';}
    case'undo':case'redo':{const from=r.action==='undo'?H.undo:H.redo,to=r.action==='undo'?H.redo:H.undo;if(!from.length)return r.action==='undo'?'되돌릴 것이 없습니다.':'다시 실행할 것이 없습니다.';
      to.push(JSON.stringify({inp:H.inp,cad:H.cad}));const s=JSON.parse(from.pop());H.inp=s.inp;H.cad=s.cad;H.R=null;const R=mechRun();cadRefresh();return(r.action==='undo'?'실행 취소':'다시 실행')+'\n'+cadBrief(R);}
    case'clear':{copClear('cad');CADC.log=[];return'';}
    case'ai':return await cadAI(r.text||'');
  }
  return r.out||'';}
async function cadExec(line){
  if(!BD)return;cadConsole();cadSay('cmd',line);cadBusy(true);
  try{
    const first=(TEXT2CAD.tok(line)[0]||'').toLowerCase();
    if(TEXT2CAD.CMDS.has(first)){const out=await cadRunCmd(line);if(out)cadSay('ok',out);}
    else{if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){await cadAI(line);cadBusy(false);return;}cadSay('out','Claude를 쓸 수 없어 규칙으로 해석합니다.');}
      if(await aimDetQuestion(line,cadSay,()=>cadRunCmd('status'))){cadBusy(false);return;}
      const cmds=TEXT2CAD.parse(line);if(!cmds.length)cadSay('err','문장을 명령으로 바꾸지 못했습니다. 예: "오른쪽 벽에 지름 8 구멍", "장착 탭 4개 M5" · help로 명령 목록을 보세요.');
      else{cadSay('out','해석: '+cmds.join(' → '));for(const c of cmds){cadSay('cmd',c);try{const o=await cadRunCmd(c);if(o)cadSay('ok',o);}catch(e){cadSay('err',e.message||String(e));}if(CADC.stopReq)break;}}}
  }catch(e){console.error(e);cadSay('err',e&&e.message?e.message:String(e));}
  cadBusy(false);}
const CAD_SYS=`You are a mechanical design engineer doing text-to-CAD for the protective housing (enclosure) of a PCB inside a viewer. The user writes in Korean.
You change the CAD model only by calling the run_cad tool with one command at a time. Commands (exactly this syntax):
\${CMDS}
Coordinates: walls W (left, x min) E (right) S (front, y min) N (back), T = cover top, B = floor. For wall holes --u is the distance along the wall from its start corner and --z the height in board coordinates (board mid-plane = 0; the split line and connector windows are listed in the state). Keep holes clear of connector windows, the split line (±1.5 mm), wall corners and screw bosses; under IP54+ every opening needs a gland, vent or plug (use gland/vent commands).
Rules: use at most 8 commands; read the output after each one (it reports mass, temperatures, cost and warnings) and fix what you broke; never run export (the user does that). Finish with one "check" only if the user asked for a review. Then answer in Korean in 2-5 short sentences: what you changed (feature ids), the key numbers from the outputs, and remaining risks. Do not invent numbers.`;
async function cadAI(req){
  if(!req.trim())return'요청을 적어 주세요. 예: ai 오른쪽 벽에 케이블 글랜드 두 개 넣고 장착 탭 달아줘';
  const R=mechRun(),H=mechCfg();const cmds=TEXT2CAD.HELP.filter(x=>!/^ai /.test(x[0])&&!/^export/.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const state=`${HOUSING.text(R)}\n형상 목록: ${H.cad.feats.map(f=>HOUSING.featLabel(f)).join(' · ')||'없음'}\n지정값: ${JSON.stringify(H.cad.over)}\n벽 길이: S/N ${R.d.geo.Lo.toFixed(1)} mm, W/E ${R.d.geo.Wo.toFixed(1)} mm · 분할면 z ${R.d.geo.zSplit.toFixed(1)} · 커버 안쪽 z ${R.d.geo.zLid.toFixed(1)} · 바닥 z ${R.d.geo.zFloor.toFixed(1)}`;
  const ok=await aiAgent({ro:c=>['help','status','check','compare','list','feats'].includes((TEXT2CAD.tok(c)[0]||'').toLowerCase()),roList:'status, check, compare, feats',prompt:CAD_SYS.replace('${CMDS}',cmds)+`\n\n현재 설계:\n${state}\n\n사용자 요청: ${req}`,toolName:'run_cad',toolDesc:'Run one housing CAD console command (see the list) and return its text output.',example:'"gland E M16 --z 9" or "tabs 4 --screw M5"',
    run:c=>cadRunCmd(c,'ai'),allowed:c=>{const f=(TEXT2CAD.tok(c)[0]||'').toLowerCase();return!TEXT2CAD.CMDS.has(f)||f==='ai'||f==='export'||f==='clear'?'unknown or not allowed: '+f:'';},
    say:cadSay,set:cadSetE,drop:e=>{copDrop(e);CADC.log=CADC.log.filter(x=>x!==e);},
    setAbort:c=>{CADC.abort=c;},stopped:()=>CADC.stopReq,max:12});
  if(!ok){const list=TEXT2CAD.parse(req);if(!list.length)return'Claude를 쓸 수 없고 문장도 해석하지 못했습니다. help를 보세요.';cadSay('out','Claude를 쓸 수 없어 규칙으로 해석: '+list.join(' → '));for(const c of list){cadSay('cmd',c);try{const o=await cadRunCmd(c);if(o)cadSay('ok',o);}catch(e){cadSay('err',e.message);}}}
  return'';}
/* ---- PCB console: housing [check|compare|show|open|close|export] [--p W --ip 67 --vib 6 --ta 40 --tmax 85 --tj 125 --mat adc12 --tim auto] ---- */
const MECH_HELP=['housing [--p 18 --ip 67 --vib 6 --ta 40 --tmax 85 --tj 125 --mat auto|pcabs|pa66gf|spcc|a6063|adc12|az91d --tim auto|pad15|pad30|gel40|pad60|none] · housing compare · housing show|open|close · housing export','PCB 보호 하우징 계산. 형상 설계(구멍·글랜드·탭·핀·각인)는 상단 "기구 CAD" 작업 공간의 Text-to-CAD 콘솔에서'];
async function mechCmd(a){
  const H=mechCfg(),i=H.inp;const sub=(a._[0]||'check').toLowerCase();const before=JSON.stringify({inp:H.inp,cad:H.cad});let ch=false;
  if(a.p!=null){i.P=a.p==='auto'?'auto':+a.p;ch=true;}if(a.ip!=null){const k=HOUSING.ipKey(a.ip);if(!k)throw new Error('IP: '+HOUSING.IPS.join(' · '));i.ip=k;ch=true;}
  if(a.vib!=null){i.vib=+a.vib;ch=true;}if(a.ta!=null){i.ta=+a.ta;ch=true;}if(a.tmax!=null){i.tmax=+a.tmax;ch=true;}if(a.tj!=null){i.tj=+a.tj;ch=true;}
  if(a.tim!=null){if(a.tim!=='auto'&&a.tim!=='none'&&!HOUSING.TIMS[a.tim])throw new Error('TIM: auto · none · '+Object.keys(HOUSING.TIMS).join(' · '));i.tim=a.tim;ch=true;}
  if(a.mat!=null){if(a.mat!=='auto'&&!HOUSING.MATS[a.mat])throw new Error('재질: auto · '+Object.keys(HOUSING.MATS).join(' · '));i.mat=a.mat;ch=true;}
  if(ch){H.undo.push(before);H.redo=[];}
  H.R=null;const R=mechRun(true);if(HS.ws==='cad')cadRefresh();
  if(sub==='show'||sub==='hide'||sub==='open'||sub==='close'){if(sub==='open'||sub==='close')H.open=sub==='open';if(sub!=='hide')setWorkspace('cad');else if(HS.ws==='cad')setWorkspace('board');return sub==='hide'?'보드 뷰어로 돌아왔습니다.':'기구 CAD 작업 공간에서 하우징을 표시합니다.';}
  if(sub==='export'){const fn=await mechExport('zip');return fn?`${fn} 내려받기`:'내려받기를 취소했습니다.';}
  if(sub==='compare')return HOUSING.compareText(R);
  return HOUSING.text(R)+'\n(형상 편집: 상단 "기구 CAD" → Text-to-CAD)';
}
const MECH_AI=`You are a mechanical engineer sizing a protective housing for this PCB inside a viewer. The deterministic analysis is below. Use the run_cli tool with "housing" commands (flags --p --ip --vib --ta --tmax --tj --mat --tim) to test alternatives the user cares about (e.g. a cheaper material at a lower IP, fins vs. heavier metal, a better TIM vs. more thermal vias, junction temperatures of the hot parts, the sealed connector window). Leave the housing set to the option you recommend as your last housing command. Answer in Korean, short: recommended design and why, 2-3 trade-offs with the numbers from the outputs (cost index, mass, thermal margin, vibration safety), and the remaining risks. Never invent numbers.`;
