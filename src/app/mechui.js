/* ---------- protective housing (HOUSING engine): simulation tab, 3D model, CAD export, console command ---------- */
function mechCfg(){if(!BD.housing)BD.housing={inp:{P:'auto',ip:'IP54',vib:2,ta:ENV.Ta||25,tmax:85,tj:125,mat:'auto',tim:'auto'},show:false,open:false,R:null,key:''};const I=BD.housing.inp;if(I.tj==null)I.tj=125;if(!I.tim)I.tim='auto';return BD.housing;}
function mechPower(){try{const cfg=thConfig();const P={};let any=false;Object.entries(cfg.P||{}).forEach(([k,v])=>{if(+v>0){P[k]=+v;any=true;}});return any?P:null;}catch(e){return null;}}
function mechRun(force){const H=mechCfg();const i=H.inp;const key=JSON.stringify(i)+'|'+BD.comps.length+'|'+BD.W+'x'+BD.H;
  if(!force&&H.R&&H.key===key)return H.R;H.R=HOUSING.analyze(BD,{P:i.P==='auto'?null:+i.P,ip:i.ip,vib:+i.vib,ta:+i.ta,tmax:+i.tmax,tj:+i.tj,mat:i.mat,tim:i.tim,power:mechPower()});H.key=key;return H.R;}
const MECH_BAR=(lab,val,max,unit,kind)=>{const pct=Math.max(0,Math.min(100,val/max*100));return`<div class="mbar"><div class="mbar-h"><span>${lab}</span><b class="mono">${unit==='%'?Math.round(val)+'%':`${Math.round(val)} / ${max}`}</b></div><div class="mbar-t"><i class="mb-${kind}" style="width:${pct}%"></i></div></div>`;};
function mechHTML(){
  const H=mechCfg(),i=H.inp,R=mechRun(),d=R.d,g=d.geo,ipIdx=Math.max(0,HOUSING.IPS.indexOf(d.ip));
  const autoP=i.P==='auto';const peds=d.th.peds,seal=R.N.cuts.filter(c=>c.sealed),maxTj=Math.max(0,...d.th.parts.map(p=>p.Tj));const card=(k,t,sub)=>`<div class="mcard"><span class="mk">${k}</span><b>${t}</b><span class="ms">${sub}</span></div>`;
  const good=v=>v>=60?'ok':v>=30?'warn':'err';
  const rows=R.all.map(x=>`<tr class="${x===d?'on':''}"><td>${esc(x.m.short)}${x===d?' <span class="cls">선택</span>':''}</td><td class="r mono">${x.geo.t}</td><td class="r mono">${x.th.Tboard.toFixed(0)}</td><td class="r mono">${Math.round(x.th.margin*100)}%</td><td class="r mono">${x.mass.toFixed(0)}</td><td class="r mono">${x.costIdx}</td><td>${x.feasible?'<span class="sv ok"><i aria-hidden="true">✓</i>적합</span>':`<span class="sv warn" title="${esc(x.why.join(' · '))}"><i aria-hidden="true">!</i>${esc(x.why[0]||'')}</span>`}</td></tr>`).join('');
  return`<div class="sim mech">
  <p class="lead">보드 외형·장착 구멍·커넥터 위치·부품 높이와 발열·방수·진동 조건으로 PCB를 보호하는 하우징을 설계합니다. 재질 후보마다 열·실링·진동·무게·원가를 계산해 조건을 만족하는 가장 싼 안을 고릅니다.</p>
  <div class="mctl">
    <label class="mrow"><span>PCB 총 발열량 (Thermal Load)</span><b class="mono">${R.inp.P} W${autoP?' · 자동':''}</b>
      <input type="range" min="0" max="60" step="0.5" value="${R.inp.P}" data-mh="P" aria-label="발열량 W"></label>
    <label class="chkl msub"><input type="checkbox" data-mh="Pauto" ${autoP?'checked':''}> 보드에서 자동 (${mechPower()?'열 해석 전력 합':'부품 역할 추정'} ${HOUSING.boardNeeds(BD,{power:mechPower()}).Ptot.toFixed(2)} W)</label>
    <label class="mrow"><span>방진·방수 요구 등급 (IP Rating)</span><b class="mono">${d.ip} (${['개방','덮개','방진·생활방수','분진·분사수','침수방수','고온 고압 세척'][ipIdx]})</b>
      <input type="range" min="0" max="${HOUSING.IPS.length-1}" step="1" value="${ipIdx}" data-mh="ip" aria-label="IP 등급"></label>
    <label class="mrow"><span>진동 가혹도 (Vibration Severity)</span><b class="mono">${R.inp.vib} Grms</b>
      <input type="range" min="0" max="20" step="0.5" value="${R.inp.vib}" data-mh="vib" aria-label="진동 Grms"></label>
    <div class="mgrid"><label class="fld"><span>주위 온도 (°C)</span><input type="number" step="1" data-mh="ta" value="${i.ta}"></label><label class="fld"><span>PCB 한계 온도 (°C)</span><input type="number" step="1" data-mh="tmax" value="${i.tmax}"></label><label class="fld"><span>부품 Tj 한계 (°C)</span><input type="number" step="5" data-mh="tj" value="${i.tj}"></label>
      <label class="fld"><span>재질</span><select data-mh="mat"><option value="auto"${i.mat==='auto'?' selected':''}>자동 (조건 만족 · 최저 원가)</option>${Object.entries(HOUSING.MATS).map(([k,v])=>`<option value="${k}"${i.mat===k?' selected':''}>${esc(v.short)}</option>`).join('')}</select></label>
      <label class="fld"><span>방열 패드 (TIM)</span><select data-mh="tim"><option value="auto"${i.tim==='auto'?' selected':''}>자동 (Tj 한계 만족 · 최저 원가)</option>${Object.entries(HOUSING.TIMS).map(([k,v])=>`<option value="${k}"${i.tim===k?' selected':''}>${esc(v.short)} (${v.form})</option>`).join('')}<option value="none"${i.tim==='none'?' selected':''}>사용 안 함</option></select></label></div>
  </div>
  <div class="mnote"><b>주요 설계를 위한 변환 조건 및 요약</b><ul>${R.conds.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div>
  ${card('권장 하우징 재질',esc(d.m.label),`최소 권장 벽두께: ${g.t} mm${g.rim>g.t?` · 실링 플랜지 ${g.rim} mm`:''} · ${esc(d.m.proc_label)}`)}
  ${card('열관리 / 방열 방식',d.m.metal?(peds.length?`TIM + 하우징 페데스탈 ${peds.length}곳`:'하우징 벽 열전도'):'수지 벽 전도 + 내부 대류',`${peds.length?`베이스(서멀 비아) ${peds.filter(p=>p.kind==='bottom').length} · 커버 ${peds.filter(p=>p.kind==='top').length} · TIM 경로 ${d.th.Ptim.toFixed(1)} W · `:''}${d.fins?`방열 핀 ${d.fins.n}개 · `:''}${d.seal.slots?'통풍 슬롯 · ':''}자연대류 · 표면 ${d.th.Ts.toFixed(0)} °C · PCB ${d.th.Tboard.toFixed(0)} °C · 최고 Tj ${maxTj.toFixed(0)} °C`)}
  ${peds.length?card('방열 패드 (TIM) 선정',esc([...new Set(peds.map(p=>HOUSING.TIMS[p.tim].label))].join(' · ')),`BLT ${[...new Set(peds.map(p=>p.blt))].join(' / ')} mm · 패드 면적 합 ${peds.reduce((a,p)=>a+p.area,0).toFixed(0)} mm² · 서멀 비아 ${peds.reduce((a,p)=>a+p.vias,0)}개 (Ø0.3 충전·캡핑) · 전기 절연형`):''}
  ${seal.map(c=>card('커넥터 관통부 · 실링',`${esc(c.ref)} ${esc(c.mpn)} ↔ ${esc(c.mate)}`,`벽 창 ${(c.b-c.a).toFixed(1)} × ${(c.z1-c.z0).toFixed(1)} mm · 플랜지 내벽 실링 폭 ${c.land.toFixed(1)} mm (FIPG/실리콘 패킹) · 슈라우드 돌출 ${(c.shroudLen-g.rim).toFixed(1)} mm · 분할면 창 아래 · 플러그 착탈 공간 ${c.plug.keep} mm`)).join('')}
  ${card('기밀 및 실링 구조',esc(d.seal.label),esc(d.seal.gasket+(d.seal.breather?' · 벤트 필터(Breather Vent) 필수 적용':'')))}
  ${card('체결 / 기구 보강',`커버 ${d.screwM} Screw Boss ${d.ns}개 · PCB 보스 ${d.sup.length}개`,`간격 ≤ ${d.pitch} mm${d.added.length?` · 중앙 지지 ${d.added.length}개 추가`:''}${R.inp.vib>=4?' · 내부 대각 보강 리브 배치':''}`)}
  <div class="mbars"><b>엔지니어링 트레이드오프 분석</b>
    ${MECH_BAR('상대적 제조 원가 지수',R.idx.cost,100,'','cost')}${MECH_BAR('하우징 추정 중량 지수',R.idx.mass,100,'','mass')}
    ${MECH_BAR('방열 여유도 (Thermal Safety Margin)',R.idx.thermal,100,'%',good(R.idx.thermal))}${MECH_BAR('내진동 구조 안전율',R.idx.vib,100,'%',good(R.idx.vib))}</div>
  ${R.warn.length?`<ul class="chk">${R.warn.map(w=>`<li>${pill('warn')}<div><span>${esc(w)}</span></div></li>`).join('')}</ul>`:''}
  <details class="thsec" open><summary><b>치수 · 해석 결과</b><span>${g.Lo.toFixed(0)} × ${g.Wo.toFixed(0)} × ${g.Ho.toFixed(0)} mm · ${d.mass.toFixed(0)} g</span></summary>
    <table class="stbl"><tbody>
      <tr><td>외형 (L × W × H)</td><td class="mono">${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm</td></tr>
      <tr><td>내부 · 스탠드오프 · 위 여유</td><td class="mono">${g.Li.toFixed(1)} × ${g.Wi.toFixed(1)} × ${g.Hi.toFixed(1)} mm · ${g.stand} mm · ${g.top} mm</td></tr>
      <tr><td>온도 (주위 ${R.inp.ta} °C)</td><td class="mono">표면 ${d.th.Ts.toFixed(1)} · 내벽 ${d.th.Twin.toFixed(1)} · PCB ${d.th.Tboard.toFixed(1)} °C · TIM 경로 ${d.th.Ptim.toFixed(1)} W</td></tr>

      <tr><td>PCB 진동 (Steinberg)</td><td class="mono">f₁ ${d.vib.fn.toFixed(0)} Hz · 응답 ${d.vib.gout.toFixed(1)} Grms · 3σ ${d.vib.z3.toFixed(3)} / 허용 ${d.vib.zAllow.toFixed(3)} mm (${esc(d.vib.part)}) · SF ${d.vib.sf.toFixed(2)}</td></tr>
      <tr><td>커넥터 개구부</td><td class="mono">${R.N.cuts.length?R.N.cuts.map(c=>`${c.ref} (${{W:'왼쪽',E:'오른쪽',S:'아래',N:'위'}[c.side]})`).join(' · '):'없음'}</td></tr>
    </tbody></table></details>
  ${d.th.parts.length?`<details class="thsec" open><summary><b>부품별 방열 경로</b><span>Tj 한계 ${R.inp.tj} °C</span></summary>
    <table class="stbl"><thead><tr><th>부품</th><th class="r">W</th><th>경로</th><th>TIM · BLT</th><th class="r">비아</th><th class="r">K/W</th><th class="r">Tj °C</th></tr></thead><tbody>${d.th.parts.map(p=>{const q=peds.find(x=>x.ref===p.ref);const over=p.Tj>R.inp.tj;
      return`<tr><td>${esc(p.ref)}</td><td class="r mono">${p.P.toFixed(2)}</td><td>${q?(q.kind==='bottom'?'비아 → 베이스':'윗면 → 커버'):'보드로만'}</td><td>${q?`${esc(HOUSING.TIMS[q.tim].short)} · ${q.blt} mm${q.padT?` (${q.padT} t)`:''}`:'—'}</td><td class="r mono">${q&&q.vias?q.vias:'—'}</td><td class="r mono">${q?q.R.toFixed(1):'—'}</td><td class="r mono"><span class="sv ${over?'err':p.Tj>R.inp.tj-10?'warn':'ok'}">${p.Tj.toFixed(0)}</span></td></tr>`;}).join('')}</tbody></table></details>`:''}
  <details class="thsec"><summary><b>재질 후보 비교</b><span>같은 조건에서 ${R.all.filter(x=>x.feasible).length}/${R.all.length}개 적합</span></summary>
    <table class="stbl"><thead><tr><th>재질</th><th class="r">벽 mm</th><th class="r">PCB °C</th><th class="r">열 여유</th><th class="r">g</th><th class="r">원가</th><th>판정</th></tr></thead><tbody>${rows}</tbody></table></details>
  <div class="acts" style="flex-wrap:wrap"><button class="btn primary sm" id="mh3d">${H.show?'3D 하우징 숨기기':'3D로 하우징 보기'}</button>${H.show?`<button class="btn sm" id="mhOpen">${H.open?'커버 닫기':'커버 열기'}</button>`:''}
    <button class="btn sm" id="mhExp">CAD 내보내기 (SCAD·STL·보고서)</button><button class="btn sm" id="mhCli">${AIM.mode==='ai'?'AI로 트레이드오프 검토':'CLI로 비교'}</button></div>
  <p class="lead" style="margin-top:8px">계산은 초기 설계용 추정입니다: 외부 자연대류·복사(반복 해), 벽 전도, 보드→내벽 대류·복사·지지 보스 전도, 부품별 방열 경로(노출 패드 → 서멀 비아 → TIM → 베이스, 또는 윗면 → TIM → 커버; TIM·BLT는 Tj 한계를 맞추는 가장 싼 것), 커넥터 플랜지 실링, Steinberg PCB 진동(평탄 PSD 20–2000 Hz). 양산 전 열·구조 해석과 IP 시험으로 확인하세요.</p>
</div>`;
}
function mechBind(b){
  const H=mechCfg(),i=H.inp;let t=0;const apply=(paint)=>{H.R=null;if(paint!==false){clearTimeout(t);t=setTimeout(()=>{renderSim();if(H.show)mech3D();},60);}};
  b.querySelectorAll('[data-mh]').forEach(el=>{const k=el.dataset.mh;const ev=el.type==='range'?'input':'change';el.addEventListener(ev,()=>{
    if(k==='P'){i.P=+el.value;}else if(k==='Pauto'){i.P=el.checked?'auto':mechRun().inp.P;}else if(k==='ip'){i.ip=HOUSING.IPS[+el.value];}else if(k==='vib'){i.vib=+el.value;}
    else if(k==='ta'||k==='tmax'||k==='tj'){const v=parseFloat(el.value);if(isFinite(v))i[k]=v;}else if(k==='mat')i.mat=el.value;else if(k==='tim')i.tim=el.value;apply();});});
  b.querySelector('#mh3d')?.addEventListener('click',()=>{H.show=!H.show;if(H.show&&S.view!=='3d')setView('3d');mech3D();renderSim();});
  b.querySelector('#mhOpen')?.addEventListener('click',()=>{H.open=!H.open;mech3D();renderSim();});
  b.querySelector('#mhExp')?.addEventListener('click',mechExport);
  b.querySelector('#mhCli')?.addEventListener('click',()=>{if(!(S.view==='T'||S.view==='B'))setView('T');if(!PE.on)peBegin();cliToggle(true);cliExec(AIM.mode==='ai'?'housing --ai':'housing compare');});
}
/* ---- 3D: base + lid around the board (board frame: x,y on the board, z = 0 at the board mid-plane) ---- */
function mechGroup(R){
  const d=R.d,g=d.geo,T=R.N.t,THR=THREE;const grp=new THR.Group();grp.userData.housing=true;const base=new THR.Group(),lid=new THR.Group();grp.add(base);grp.add(lid);
  const col=d.m.metal?(d.mat==='spcc'?0x6f7780:0xb9c0c8):0x3b4046;
  const mat=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.55:0.05,roughness:d.m.metal?0.45:0.7,transparent:true,opacity:0.32,depthWrite:false,side:THR.DoubleSide});
  const solid=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.5:0.05,roughness:0.5});
  const timM=new THR.MeshStandardMaterial({color:0xe48ab0,roughness:0.8});
  const box=(x0,y0,z0,x1,y1,z1,m,par)=>{const me=new THR.Mesh(new THR.BoxGeometry(Math.max(0.01,x1-x0),Math.max(0.01,y1-y0),Math.max(0.01,z1-z0)),m);me.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);par.add(me);return me;};
  const cyl=(x,y,z0,z1,r,m,par)=>{const me=new THR.Mesh(new THR.CylinderGeometry(r,r,z1-z0,20),m);me.rotation.x=Math.PI/2;me.position.set(x,y,(z0+z1)/2);par.add(me);return me;};
  const X0=g.x0,Y0=g.y0,X1=g.x0+g.Lo,Y1=g.y0+g.Wo,Zb=g.zFloor-g.t,Zt=g.zLid+g.t,r=g.rim;
  // a wall as an extruded outline with connector / vent openings, between z0 and z1
  const wall=(side,z0,z1,par)=>{const horiz=side==='S'||side==='N';const len=horiz?g.Lo:g.Wo;const o0=horiz?X0:Y0;
    const sh=new THR.Shape();sh.moveTo(0,z0);sh.lineTo(len,z0);sh.lineTo(len,z1);sh.lineTo(0,z1);sh.lineTo(0,z0);
    R.N.cuts.filter(c=>c.side===({S:'S',N:'N',W:'W',E:'E'})[side]).forEach(c=>{const a=c.a-o0,b=c.b-o0,lo=Math.max(z0+0.2,c.z0),hi=Math.min(z1-0.2,c.z1);if(hi-lo<0.3||b-a<0.3)return;const h=new THR.Path();h.moveTo(a,lo);h.lineTo(a,hi);h.lineTo(b,hi);h.lineTo(b,lo);h.lineTo(a,lo);sh.holes.push(h);});
    if(side==='N'&&d.seal.breather){const zc=g.zSplit-4;if(zc-6>z0&&zc+6<z1){const h=new THR.Path();h.absarc(len/2,zc,6,0,Math.PI*2,true);sh.holes.push(h);}}
    const geo=new THR.ExtrudeGeometry(sh,{depth:r,bevelEnabled:false});
    // shape (along, z) extruded by the wall thickness → world: S/N walls run along x, W/E walls along y
    geo.applyMatrix4(horiz?new THR.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1):new THR.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
    const me=new THR.Mesh(geo,mat);
    if(side==='S')me.position.set(X0,Y0+r,0);else if(side==='N')me.position.set(X0,Y1,0);else if(side==='W')me.position.set(X0,Y0,0);else me.position.set(X1-r,Y0,0);
    par.add(me);return me;};
  // base: floor, walls up to the split line, PCB supports, lid screw bosses
  box(X0,Y0,Zb,X1,Y1,g.zFloor,mat,base);['S','N','W','E'].forEach(s=>wall(s,g.zFloor,g.zSplit,base));
  d.sup.forEach(s=>cyl(s.x,s.y,g.zFloor,-T/2,s.d>3.4?4.5:3.5,solid,base));
  d.screws.forEach(s=>cyl(s.x,s.y,g.zFloor,g.zSplit,d.screwM==='M4'?4.5:3.75,mat,base));
  if(R.inp.vib>=4){box(X0+r,(Y0+Y1)/2-1,g.zFloor,X1-r,(Y0+Y1)/2+1,g.zFloor+Math.min(3,g.stand-0.5),mat,base);}
  // gasket on the split line
  if(d.seal.gasket!=='없음'&&d.seal.gasket!=='없음 (정밀 맞춤)'){const m2=new THR.LineBasicMaterial({color:0xe2703a});const ins=r/2;const pts=[[X0+ins,Y0+ins],[X1-ins,Y0+ins],[X1-ins,Y1-ins],[X0+ins,Y1-ins],[X0+ins,Y0+ins]].map(p=>new THR.Vector3(p[0],p[1],g.zSplit+0.05));base.add(new THR.Line(new THR.BufferGeometry().setFromPoints(pts),m2));}
  // lid: walls from the split line, top plate, pedestals + TIM on the hot parts, fins
  ['S','N','W','E'].forEach(s=>wall(s,g.zSplit,g.zLid,lid));box(X0,Y0,g.zLid,X1,Y1,Zt,mat,lid);
  d.th.peds.forEach(p=>{const q=p.ped;if(p.kind==='top'){box(q.x,q.y,q.z0,q.x+q.w,q.y+q.h,g.zLid,solid,lid);box(q.x,q.y,q.tz,q.x+q.w,q.y+q.h,q.z0,timM,lid);}
    else{box(q.x,q.y,g.zFloor,q.x+q.w,q.y+q.h,q.z1,solid,base);box(q.x,q.y,q.z1,q.x+q.w,q.y+q.h,-T/2,timM,base);}});
  // sealed connectors: seal bead around the window on the inner wall face, and the mating harness plug in front of it
  R.N.cuts.filter(c=>c.sealed).forEach(c=>{const m2=new THR.LineBasicMaterial({color:0xe2703a});const o=0.9;const inner=c.side==='W'?X0+r-0.05:c.side==='E'?X1-r+0.05:c.side==='S'?Y0+r-0.05:Y1-r+0.05;
    const P=(u,z)=>c.side==='W'||c.side==='E'?new THR.Vector3(inner,u,z):new THR.Vector3(u,inner,z);
    lid.add(new THR.Line(new THR.BufferGeometry().setFromPoints([P(c.a-o,c.z0-o),P(c.b+o,c.z0-o),P(c.b+o,c.z1+o),P(c.a-o,c.z1+o),P(c.a-o,c.z0-o)]),m2));
    const pl=c.plug;if(!pl)return;const plugM=new THR.MeshStandardMaterial({color:0x2a2c30,roughness:0.7,transparent:true,opacity:0.55,depthWrite:false});const ac=(c.a+c.b)/2,zc=(c.z0+c.z1)/2,hz=c.side==='W'||c.side==='E';
    const[u0,u1]=c.side==='W'?[X0-0.5-pl.len,X0-0.5]:c.side==='E'?[X1+0.5,X1+0.5+pl.len]:c.side==='S'?[Y0-0.5-pl.len,Y0-0.5]:[Y1+0.5,Y1+0.5+pl.len];
    const mesh=hz?box(u0,ac-pl.w/2,zc-pl.h/2,u1,ac+pl.w/2,zc+pl.h/2,plugM,grp):box(ac-pl.w/2,u0,zc-pl.h/2,ac+pl.w/2,u1,zc+pl.h/2,plugM,grp);mesh.userData.plug=c.ref;});
  if(d.fins)for(let k=0;k<d.fins.n;k++){const x=X0+5+k*d.fins.pitch;box(x,Y0+4,Zt,x+d.fins.t,Y0+4+d.fins.len,Zt+d.fins.h,solid,lid);}
  lid.position.z=mechCfg().open?Math.max(25,g.Ho*0.9):0;grp.userData.base=base;grp.userData.lid=lid;return grp;
}
function mech3D(){if(!G3||!G3.root)return;const old=G3.root.children.find(o=>o.userData&&o.userData.housing);if(old){G3.root.remove(old);disposeTree(old);}
  const H=BD.housing;if(H&&H.show){try{G3.root.add(mechGroup(mechRun()));}catch(e){console.error(e);toast('하우징 3D를 만들지 못했습니다: '+e.message);}}G3.dirty=true;}
/* ---- export: OpenSCAD (real CSG), STL of base and lid (tessellated preview solids), report, parameters ---- */
function mechSTL(obj,name){const out=[`solid ${name}`];obj.updateMatrixWorld(true);const inv=new THREE.Matrix4();const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];const n=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
  inv.copy(obj.matrixWorld).invert();obj.traverse(me=>{if(!me.isMesh)return;const m=new THREE.Matrix4().multiplyMatrices(inv,me.matrixWorld);const geo=me.geometry.index?me.geometry.toNonIndexed():me.geometry;const p=geo.attributes.position;
    for(let i=0;i+2<p.count;i+=3){for(let k=0;k<3;k++)v[k].fromBufferAttribute(p,i+k).applyMatrix4(m);e1.subVectors(v[1],v[0]);e2.subVectors(v[2],v[0]);n.crossVectors(e1,e2).normalize();
      out.push(` facet normal ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}\n  outer loop\n${v.map(q=>`   vertex ${q.x.toFixed(4)} ${q.y.toFixed(4)} ${q.z.toFixed(4)}`).join('\n')}\n  endloop\n endfacet`);}});
  out.push(`endsolid ${name}`);return out.join('\n')+'\n';}
async function mechExport(){
  const R=mechRun();const base=(BD.name||'board').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'board';
  const z=new JSZip();z.file(base+'_housing.scad',HOUSING.scad(R,BD.name));
  try{const grp=mechGroup(R);grp.userData.lid.position.z=0;z.file(base+'_housing_base.stl',mechSTL(grp.userData.base,base+'_base'));z.file(base+'_housing_lid.stl',mechSTL(grp.userData.lid,base+'_lid'));disposeTree(grp);}catch(e){console.error(e);}
  z.file(base+'_housing_report.md',`# ${BD.name||base} 하우징 설계\n\n\`\`\`\n${HOUSING.text(R)}\n\n${HOUSING.compareText(R)}\n\`\`\`\n\n- 좌표: 보드 왼쪽 아래 = (0,0), 보드 두께 중간면 z = 0, 단위 mm\n- SCAD는 실제 CSG(차집합)로 만든 파라메트릭 모델입니다. STL은 화면용 형상을 삼각형으로 옮긴 참고용(부품이 겹친 솔리드)이라 3D 프린팅·금형에는 SCAD에서 다시 내보내세요.\n`);
  z.file(base+'_housing.json',JSON.stringify({input:R.inp,material:R.d.mat,geometry:R.d.geo,supports:R.d.sup,screws:R.d.screws,screw:R.d.screwM,seal:R.d.seal,fins:R.d.fins,thermal_paths:R.d.th.peds.map(p=>({ref:p.ref,P:p.P,path:p.kind,tim:p.tim,tim_label:HOUSING.TIMS[p.tim].label,blt_mm:p.blt,pad_thickness_mm:p.padT,area_mm2:Math.round(p.area),thermal_vias:p.vias,R_KW:+p.R.toFixed(2),Tj:+p.Tj.toFixed(1),pedestal:p.ped})),junctions:R.d.th.parts,cutouts:R.N.cuts,thermal:{Ts:R.d.th.Ts,Tboard:R.d.th.Tboard},vibration:R.d.vib,mass_g:R.d.mass,indices:R.idx},null,2));
  const data=await z.generateAsync({type:'uint8array'});const fn=await offerFile(base+'_housing.zip',data,'application/zip');if(fn)toast('하우징 CAD(SCAD·STL)와 보고서를 zip으로 내려받았습니다.');return fn;
}
/* ---- console: housing [check|compare|show|hide|open|close|export] [--p W --ip 67 --vib 6 --ta 40 --tmax 85 --mat adc12] ---- */
const MECH_HELP=['housing [--p 18 --ip 67 --vib 6 --ta 40 --tmax 85 --tj 125 --mat auto|pcabs|pa66gf|spcc|a6063|adc12|az91d --tim auto|pad15|pad30|gel40|pad60|none] · housing compare · housing show|hide|open|close · housing export','PCB 보호 하우징 설계: 재질·벽두께·방열(부품별 TIM·서멀 비아·페데스탈·핀)·방수 커넥터 관통부·실링(IP)·체결 보스·진동 안전율·원가/중량 지수. AI 모드면 Claude가 조건을 바꿔 가며 트레이드오프를 검토'];
async function mechCmd(a){
  const H=mechCfg(),i=H.inp;const sub=(a._[0]||'check').toLowerCase();
  if(a.p!=null)i.P=a.p==='auto'?'auto':+a.p;if(a.ip!=null){const k=HOUSING.ipKey(a.ip);if(!k)throw new Error('IP: '+HOUSING.IPS.join(' · '));i.ip=k;}
  if(a.vib!=null)i.vib=+a.vib;if(a.ta!=null)i.ta=+a.ta;if(a.tmax!=null)i.tmax=+a.tmax;if(a.tj!=null)i.tj=+a.tj;if(a.tim!=null){if(a.tim!=='auto'&&a.tim!=='none'&&!HOUSING.TIMS[a.tim])throw new Error('TIM: auto · none · '+Object.keys(HOUSING.TIMS).join(' · '));i.tim=a.tim;}if(a.mat!=null){if(a.mat!=='auto'&&!HOUSING.MATS[a.mat])throw new Error('재질: auto · '+Object.keys(HOUSING.MATS).join(' · '));i.mat=a.mat;}
  H.R=null;const R=mechRun(true);if(S.panel==='sim'&&SR.tab==='mech')renderSim();
  if(sub==='show'||sub==='hide'){H.show=sub==='show';if(H.show&&S.view!=='3d')setView('3d');mech3D();return H.show?'3D 보기에 하우징을 표시했습니다.':'하우징을 숨겼습니다.';}
  if(sub==='open'||sub==='close'){H.open=sub==='open';H.show=true;if(S.view!=='3d')setView('3d');mech3D();return H.open?'커버를 열었습니다.':'커버를 닫았습니다.';}
  if(sub==='export'){const fn=await mechExport();return fn?`${fn} 내려받기`:'내려받기를 취소했습니다.';}
  if(H.show)mech3D();
  if(sub==='compare')return HOUSING.compareText(R);
  return HOUSING.text(R);
}
const MECH_AI=`You are a mechanical engineer sizing a protective housing for this PCB inside a viewer. The deterministic analysis is below. Use the run_cli tool with "housing" commands (flags --p --ip --vib --ta --tmax --tj --mat --tim) to test alternatives the user cares about (e.g. a cheaper material at a lower IP, fins vs. heavier metal, a better TIM vs. more thermal vias, junction temperatures of the hot parts, the sealed connector window). Leave the housing set to the option you recommend as your last housing command. Answer in Korean, short: recommended design and why, 2-3 trade-offs with the numbers from the outputs (cost index, mass, thermal margin, vibration safety), and the remaining risks. Never invent numbers.`;
