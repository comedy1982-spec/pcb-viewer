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
  ${mechCard('하우징 재질',esc(d.m.label),`벽 ${g.t} mm${g.t!==g.tAuto?' (지정)':''}${g.rim>g.t?` · 실링 플랜지 ${g.rim} mm`:''} · 모서리 ${esc(HOUSING.edgeText(g))} · ${esc(d.m.proc_label)}`)}
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
  const els=cadElements(R),sel=new Set(CADSEL.keys);const GR=['본체','면','모서리','추가 형상','자동 요소'];
  return`<p class="h">형상 트리 <span class="cls">클릭 선택 · Shift/Ctrl 다중 선택</span></p>
  <ul class="ftree sel-tree">${GR.map(gn=>{const xs=els.filter(e=>e.group===gn);if(!xs.length)return'';return`<li class="fg">${gn}</li>`+xs.map(e=>{const fu=/^F\d/.test(e.key);
      return`<li class="fe${fu?' fu':''}${sel.has(e.key)?' sel':''}" data-el="${esc(e.key)}" tabindex="0" role="option" aria-selected="${sel.has(e.key)}"><span class="fk mono">${fu?esc(e.key):''}</span><span class="fl">${esc(e.label)}<small>${esc(e.desc)}</small></span>${fu?`<button class="pill vbtn" data-fdel="${esc(e.key)}" title="${esc(e.key)} 삭제" aria-label="${esc(e.key)} 삭제">×</button>`:'<span></span>'}</li>`;}).join('');}).join('')}
    ${ov.map(([k,v])=>`<li class="fo"><span class="fk">지정</span><span>${esc(TEXT2CAD.OVER[k]||k)} ${v}</span><button class="pill vbtn" data-oclr="${esc(k)}" title="자동으로" aria-label="${esc(TEXT2CAD.OVER[k]||k)} 자동으로">×</button></li>`).join('')}</ul>
  ${C.feats.length||ov.length?'':'<p class="lead" style="margin:4px 0 0">아래 Text-to-CAD 콘솔에 문장이나 명령으로 형상을 더하세요. 예: 오른쪽 벽에 M16 케이블 글랜드 2개, 장착 탭 4개 M5</p>'}
  <div class="acts" style="flex-wrap:wrap;margin-top:10px"><button class="btn sm" id="cadOpen">${H.open?'커버 닫기':'커버 열기'}</button><button class="btn primary sm" id="cadExp">CAD 내보내기</button><button class="btn sm" id="cadUndo"${H.undo.length?'':' disabled'}>실행 취소</button></div>
  <details class="thsec" open><summary><b>치수 · 해석</b><span>${d.mass.toFixed(0)} g</span></summary>
    <table class="stbl"><tbody>
      <tr><td>외형</td><td class="mono">${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm</td></tr>
      <tr><td>내부</td><td class="mono">${g.Li.toFixed(1)} × ${g.Wi.toFixed(1)} × ${g.Hi.toFixed(1)} mm</td></tr>
      <tr><td>벽 · 플랜지</td><td class="mono">${g.t} · ${g.rim} mm</td></tr>
      <tr><td>모서리</td><td class="mono">${esc(HOUSING.edgeText(g))}</td></tr>
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
  Rr.querySelectorAll('[data-fdel]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();cadSelDrop(b.dataset.fdel);cadExec('del '+b.dataset.fdel);}));
  Rr.querySelectorAll('[data-el]').forEach(li=>{const go=e=>{if(e.target.closest('button'))return;cadSelect(li.dataset.el,e.shiftKey||e.ctrlKey||e.metaKey);};li.addEventListener('click',go);li.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(e);}});});
  Rr.querySelectorAll('[data-oclr]').forEach(b=>b.addEventListener('click',()=>cadExec(`set ${b.dataset.oclr} auto`)));
  Rr.querySelector('#cadOpen')?.addEventListener('click',()=>cadExec(H.open?'close':'open'));
  Rr.querySelector('#cadExp')?.addEventListener('click',()=>cadExec('export zip'));
  Rr.querySelector('#cadUndo')?.addEventListener('click',()=>cadExec('undo'));
}
function cadRender(){if(!BD||!$('#cadLeft'))return;const keep=[$('#cadLeft').scrollTop,$('#cadRight').scrollTop];
  const open=[...$('#cadRight').querySelectorAll('details')].map(x=>x.open);
  $('#cadLeft').innerHTML=cadLeftHTML();$('#cadRight').innerHTML=cadRightHTML();
  [...$('#cadRight').querySelectorAll('details')].forEach((x,k)=>{if(open[k]!=null)x.open=open[k];});
  $('#cadLeft').scrollTop=keep[0];$('#cadRight').scrollTop=keep[1];cadBind();cadSelPaint();}
function cadRefresh(){if(HS.ws!=='cad')return;cadRender();mech3D();}
/* ---- workspace switch: the board viewport moves into the CAD centre column ---- */
const CADVP={home:null};
function cadEnter(){if(!BD)return;const H=mechCfg();
  if(!CADVP.home){CADVP.home=document.createComment('vp-home');vp.parentNode.insertBefore(CADVP.home,vp);}
  $('#cadVpSlot').appendChild(vp);if(S.sch!=='off')S.sch='off';setView('3d');
  H.show=true;cadConsole();cadRender();
  setTimeout(()=>{resize3D();mech3D();const R=mechRun(),g=R.d.geo;if(G3){const a=G3.cam.aspect||1.5,tt=Math.tan(G3.cam.fov*D2R/2);camTo(-1.95,0.95,Math.max(g.Wo*1.6/(2*tt),(g.Lo+90)*1.15/(2*tt*a)),true);}},0);}
function cadLeave(){setTimeout(()=>{if(typeof cadSelPaint==='function')cadSelPaint();},0);const H=BD&&BD.housing;if(H){H.show=false;mech3D();}if(CADVP.home&&vp.parentNode!==CADVP.home.parentNode)CADVP.home.parentNode.insertBefore(vp,CADVP.home);}
/* ---- 3D: base + cover around the board (board frame: x,y on the board, z = 0 at the board mid-plane) ---- */
function mechGroup(R){
  const d=R.d,g=d.geo,T=R.N.t,THR=THREE;const grp=new THR.Group();grp.userData.housing=true;const base=new THR.Group(),lid=new THR.Group();grp.add(base);grp.add(lid);
  const col=d.m.metal?(d.mat==='spcc'?0x6f7780:0xb9c0c8):0x3b4046;
  const mat=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.55:0.05,roughness:d.m.metal?0.45:0.7,transparent:true,opacity:0.32,depthWrite:false,side:THR.DoubleSide});
  const solid=new THR.MeshStandardMaterial({color:col,metalness:d.m.metal?0.5:0.05,roughness:0.5});
  const timM=new THR.MeshStandardMaterial({color:0xe48ab0,roughness:0.8});const darkM=new THR.MeshStandardMaterial({color:0x1d2126,roughness:0.6});
  const featM=new THR.MeshStandardMaterial({color:0x3d8bff,roughness:0.5,transparent:true,opacity:0.85});const holeM=new THR.MeshBasicMaterial({color:0x3d8bff,transparent:true,opacity:0.45,side:THR.DoubleSide,depthWrite:false});
  const box=(x0,y0,z0,x1,y1,z1,m,par)=>{const me=new THR.Mesh(new THR.BoxGeometry(Math.max(0.01,x1-x0),Math.max(0.01,y1-y0),Math.max(0.01,z1-z0)),m);me.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);par.add(me);return me;};
  const cyl=(x,y,z0,z1,r,m,par)=>{const me=new THR.Mesh(new THR.CylinderGeometry(r,r,z1-z0,24),m);me.rotation.x=Math.PI/2;me.position.set(x,y,(z0+z1)/2);par.add(me);return me;};
  const X0=g.x0,Y0=g.y0,X1=g.x0+g.Lo,Y1=g.y0+g.Wo,Zb=g.zFloor-g.t,Zt=g.zLid+g.t,r=g.rim,Tb=T;
  const holesOn=sd=>d.feats.filter(f=>(f.type==='hole'||f.type==='slot')&&f.side===sd);const TG=(me,k)=>{if(me)me.userData.el=k;return me;};
  // edge treatment: vertical corners (rv, fillet|chamfer), cover-top band (eT) and base-bottom band (eB)
  const rv=g.r||0,ch=g.vk==='chamfer',rT=g.eT?g.eT.r:0,rB=g.eB?g.eB.r:0;const SEG=8;
  // wall slabs stop where the corner pieces start (along the wall, from each end)
  const Rp=rv<=0?0:ch?Math.max(rv+0.414*r,r):Math.max(rv,r);
  // outline of the housing plan, shrunk inward by `inset` (corner R/C follow the offset), counter-clockwise, SEG+1 points per corner
  const planPts=inset=>{const P=[];const cs=[[X0,Y0,1,1,Math.PI],[X1,Y0,-1,1,1.5*Math.PI],[X1,Y1,-1,-1,0],[X0,Y1,1,-1,0.5*Math.PI]];
    cs.forEach(([cx,cy,sx,sy,a0])=>{const rr=ch?Math.max(0,rv-0.586*inset):Math.max(0,rv-inset),off=inset+rr,ox=cx+sx*off,oy=cy+sy*off;
      const s0=[ox+rr*Math.cos(a0),oy+rr*Math.sin(a0)],s1=[ox+rr*Math.cos(a0+Math.PI/2),oy+rr*Math.sin(a0+Math.PI/2)];
      for(let i=0;i<=SEG;i++){const k=i/SEG;if(ch)P.push([s0[0]+(s1[0]-s0[0])*k,s0[1]+(s1[1]-s0[1])*k]);else{const a=a0+k*Math.PI/2;P.push([ox+rr*Math.cos(a),oy+rr*Math.sin(a)]);}}});
    return P;};
  const planShape=inset=>{const P=planPts(inset);const sh=new THR.Shape();sh.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)sh.lineTo(P[i][0],P[i][1]);sh.closePath();return sh;};
  // outer skin of a filleted/chamfered band: rings of the shrunk outline, joined into quads
  const loft=(layers,par)=>{if(layers.length<2)return;const rings=layers.map(([z,s])=>planPts(s).map(p=>[p[0],p[1],z]));const n=rings[0].length,pos=[];
    for(let k=0;k+1<rings.length;k++)for(let i=0;i<n;i++){const j=(i+1)%n,a=rings[k][i],b=rings[k][j],c=rings[k+1][j],e=rings[k+1][i];pos.push(...a,...b,...c,...a,...c,...e);}
    const geo=new THR.BufferGeometry();geo.setAttribute('position',new THR.Float32BufferAttribute(pos,3));geo.computeVertexNormals();const me=new THR.Mesh(geo,mat);par.add(me);return me;};
  const bandB=rB>0?HOUSING.edgeLayers(rB,g.eB,null).filter(p=>p[0]<=rB+1e-6).map(([z,s])=>[Zb+z,s]):[];
  const bandT=rT>0?HOUSING.edgeLayers(rT,null,g.eT).filter(p=>p[0]>=-1e-6).map(([z,s])=>[Zt-rT+z,s]):[];
  // corner piece between z0 and z1: outer R/C, inner R/C (or square), meeting the trimmed wall slabs
  const corner=(z0,z1,par)=>{if(rv<=0||z1-z0<0.05)return;const q=ch?rv+0.414*r:0,ri=Math.max(0,rv-r);
    const loc=[[Rp,0]];if(ch)loc.push([rv,0],[0,rv]);else for(let i=0;i<=SEG;i++){const a=1.5*Math.PI-i/SEG*Math.PI/2;loc.push([rv+rv*Math.cos(a),rv+rv*Math.sin(a)]);}
    loc.push([0,Rp],[r,Rp]);if(ch){if(q>r)loc.push([r,q],[q,r]);else loc.push([r,r]);}else if(ri>0)for(let i=0;i<=SEG;i++){const a=Math.PI+i/SEG*Math.PI/2;loc.push([rv+ri*Math.cos(a),rv+ri*Math.sin(a)]);}else loc.push([r,r]);
    loc.push([Rp,r]);
    [[X0,Y0,1,1],[X1,Y0,-1,1],[X1,Y1,-1,-1],[X0,Y1,1,-1]].forEach(([cx,cy,sx,sy])=>{const sh=new THR.Shape();loc.forEach(([a,b],i)=>{const x=cx+sx*a,y=cy+sy*b;if(i)sh.lineTo(x,y);else sh.moveTo(x,y);});sh.closePath();
      const me=new THR.Mesh(new THR.ExtrudeGeometry(sh,{depth:z1-z0,bevelEnabled:false,curveSegments:8}),mat);me.position.z=z0;me.userData.el='edge:V';par.add(me);});};
  // a wall as an extruded outline with connector / vent / user openings, between z0 and z1
  const wall=(side,z0,z1,par)=>{const horiz=side==='S'||side==='N';const len=horiz?g.Lo:g.Wo;const o0=horiz?X0:Y0;
    if(z1-z0<0.05)return;const A=Rp,Bn=len-Rp;const sh=new THR.Shape();sh.moveTo(A,z0);sh.lineTo(Bn,z0);sh.lineTo(Bn,z1);sh.lineTo(A,z1);sh.lineTo(A,z0);
    const rectHole=(a,b,lo,hi)=>{lo=Math.max(z0+0.2,lo);hi=Math.min(z1-0.2,hi);a=Math.max(A+0.2,a);b=Math.min(Bn-0.2,b);if(hi-lo<0.3||b-a<0.3)return;const h=new THR.Path();h.moveTo(a,lo);h.lineTo(a,hi);h.lineTo(b,hi);h.lineTo(b,lo);h.lineTo(a,lo);sh.holes.push(h);};
    R.N.cuts.filter(c=>c.side===side).forEach(c=>rectHole(c.a-o0,c.b-o0,c.z0,c.z1));
    if(side==='N'&&d.seal.breather){const zc=g.zSplit-4;if(zc-6>z0&&zc+6<z1&&len/2-6>A){const h=new THR.Path();h.absarc(len/2,zc,6,0,Math.PI*2,true);sh.holes.push(h);}}
    holesOn(side).forEach(f=>{const u=f.a-o0;if(f.type==='slot'){if(f.z-f.h/2>z0+0.2&&f.z+f.h/2<z1-0.2)rectHole(u-f.w/2,u+f.w/2,f.z-f.h/2,f.z+f.h/2);return;}
      if(f.z-f.w/2>z0+0.2&&f.z+f.w/2<z1-0.2&&u-f.w/2>A+0.2&&u+f.w/2<Bn-0.2){const h=new THR.Path();h.absarc(u,f.z,f.w/2,0,Math.PI*2,true);sh.holes.push(h);}});
    const geo=new THR.ExtrudeGeometry(sh,{depth:r,bevelEnabled:false,curveSegments:24});
    // shape (along, z) extruded by the wall thickness → world: S/N walls run along x, W/E walls along y
    geo.applyMatrix4(horiz?new THR.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1):new THR.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
    const me=new THR.Mesh(geo,mat);
    if(side==='S')me.position.set(X0,Y0+r,0);else if(side==='N')me.position.set(X0,Y1,0);else if(side==='W')me.position.set(X0,Y0,0);else me.position.set(X1-r,Y0,0);
    par.add(me);return me;};
  // floor / cover plate with user holes
  const plate=(sd,z0,z1,par,inset)=>{const hs=holesOn(sd);
    const sh=planShape(inset||0);
    hs.forEach(f=>{const h=new THR.Path();if(f.type==='slot'){h.moveTo(f.x-f.w/2,f.y-f.h/2);h.lineTo(f.x-f.w/2,f.y+f.h/2);h.lineTo(f.x+f.w/2,f.y+f.h/2);h.lineTo(f.x+f.w/2,f.y-f.h/2);h.lineTo(f.x-f.w/2,f.y-f.h/2);}else h.absarc(f.x,f.y,f.w/2,0,Math.PI*2,true);sh.holes.push(h);});
    const me=new THR.Mesh(new THR.ExtrudeGeometry(sh,{depth:z1-z0,bevelEnabled:false,curveSegments:24}),mat);me.position.z=z0;par.add(me);return me;};
  // base: floor, walls up to the split line, PCB supports, lid screw bosses, base pedestals, tabs, ribs
  const zw0=rB>0?Math.min(g.zSplit,Zb+rB):g.zFloor,zw1=rT>0?Math.max(g.zSplit,Zt-rT):g.zLid;
  TG(plate('B',Zb,g.zFloor,base,rB),'floor');['S','N','W','E'].forEach(s=>TG(wall(s,zw0,g.zSplit,base),'wall:'+s));corner(zw0,g.zSplit,base);TG(loft(bandB,base),'edge:B');
  d.sup.forEach((s,i)=>TG(cyl(s.x,s.y,g.zFloor,-Tb/2,s.d>3.4?4.5:3.5,s.kind==='user'?featM:solid,base),'boss:'+i));
  d.screws.forEach((s,i)=>TG(cyl(s.x,s.y,g.zFloor,g.zSplit,d.screwM==='M4'?4.5:3.75,mat,base),'screw:'+i));
  if(R.inp.vib>=4){TG(box(X0+r,(Y0+Y1)/2-1,g.zFloor,X1-r,(Y0+Y1)/2+1,g.zFloor+Math.min(3,g.stand-0.5),mat,base),'rib:auto');}
  d.feats.forEach(f=>{
    if(f.type==='tabs')f.tabs.forEach(t=>{TG(box(t.cx-t.sx/2,t.cy-t.sy/2,f.z0,t.cx+t.sx/2,t.cy+t.sy/2,f.z0+f.tt,featM,base),f.id);TG(cyl(t.hx,t.hy,f.z0-0.02,f.z0+f.tt+0.02,f.hd/2,darkM,base),f.id);});
    else if(f.type==='rib'){TG(f.axis==='x'?box(X0+r,f.pos-f.tt/2,g.zFloor,X1-r,f.pos+f.tt/2,g.zFloor+f.h,featM,base):box(f.pos-f.tt/2,Y0+r,g.zFloor,f.pos+f.tt/2,Y1-r,g.zFloor+f.h,featM,base),f.id);}
    // user openings: a thin coloured lid over the opening, so a hole can be seen and picked
    else if(f.type==='hole'||f.type==='slot'){const H=f.type==='hole';const geo=H?new THR.CircleGeometry(f.w/2,28):new THR.PlaneGeometry(f.w,f.h);const me=new THR.Mesh(geo,holeM);me.userData.el=f.id;const o=0.06;
      if(f.side==='T'){me.position.set(f.x,f.y,Zt+o);}else if(f.side==='B'){me.position.set(f.x,f.y,Zb-o);me.rotation.x=Math.PI;}
      else if(f.side==='S'){me.position.set(f.a,Y0-o,f.z);me.rotation.x=Math.PI/2;}else if(f.side==='N'){me.position.set(f.a,Y1+o,f.z);me.rotation.x=-Math.PI/2;}
      else if(f.side==='W'){me.position.set(X0-o,f.a,f.z);me.rotation.y=-Math.PI/2;me.rotation.z=Math.PI/2;}else{me.position.set(X1+o,f.a,f.z);me.rotation.y=Math.PI/2;me.rotation.z=Math.PI/2;}
      (f.side==='T'||(f.side!=='B'&&f.z>g.zSplit)?lid:base).add(me);}});
  // gasket on the split line
  if(d.seal.gasket!=='없음'&&d.seal.gasket!=='없음 (정밀 맞춤)'){const m2=new THR.LineBasicMaterial({color:0xe2703a});const ins=r/2;const pts=[[X0+ins,Y0+ins],[X1-ins,Y0+ins],[X1-ins,Y1-ins],[X0+ins,Y1-ins],[X0+ins,Y0+ins]].map(p=>new THR.Vector3(p[0],p[1],g.zSplit+0.05));base.add(new THR.Line(new THR.BufferGeometry().setFromPoints(pts),m2));}
  // cover: walls from the split line, top plate, pedestals + TIM on the hot parts, fins, engraved label
  ['S','N','W','E'].forEach(s=>TG(wall(s,g.zSplit,zw1,lid),'wall:'+s));corner(g.zSplit,zw1,lid);TG(loft(bandT,lid),'edge:T');TG(plate('T',g.zLid,Zt,lid,rT),'top');
  d.th.peds.forEach(p=>{const q=p.ped,k='ped:'+p.ref;if(p.kind==='top'){TG(box(q.x,q.y,q.z0,q.x+q.w,q.y+q.h,g.zLid,solid,lid),k);TG(box(q.x,q.y,q.tz,q.x+q.w,q.y+q.h,q.z0,timM,lid),k);}
    else{TG(box(q.x,q.y,g.zFloor,q.x+q.w,q.y+q.h,q.z1,solid,base),k);TG(box(q.x,q.y,q.z1,q.x+q.w,q.y+q.h,-T/2,timM,base),k);}});
  const finK=(d.feats.find(f=>f.type==='fins'&&!f.off)||{}).id||'fins';
  if(d.fins)for(let k=0;k<d.fins.n;k++){const x=X0+5+k*d.fins.pitch;if(x+d.fins.t>X1-2)break;TG(box(x,Y0+4,Zt,x+d.fins.t,Y0+4+d.fins.len,Zt+d.fins.h,solid,lid),finK);}
  d.feats.filter(f=>f.type==='label').forEach(f=>{const c=document.createElement('canvas');const s=String(f.text||'');c.width=Math.max(64,s.length*40);c.height=64;const x=c.getContext('2d');
    x.fillStyle='#2a2f35';x.font='600 46px "JetBrains Mono", monospace';x.textAlign='center';x.textBaseline='middle';x.fillText(s,c.width/2,c.height/2);const tx=new THR.CanvasTexture(c);
    const w=f.size*Math.max(1,s.length)*0.68,h=w*c.height/c.width;const me=new THR.Mesh(new THR.PlaneGeometry(w,h),new THR.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false}));me.position.set(f.x,f.y,Zt+(d.fins?d.fins.h+0.06:0.06));me.userData.el=f.id;lid.add(me);});
  // sealed connectors: seal bead around the window on the inner wall face, and the mating harness plug in front of it
  R.N.cuts.filter(c=>c.sealed).forEach(c=>{const m2=new THR.LineBasicMaterial({color:0xe2703a});const o=0.9;const inner=c.side==='W'?X0+r-0.05:c.side==='E'?X1-r+0.05:c.side==='S'?Y0+r-0.05:Y1-r+0.05;
    const P=(u,z)=>c.side==='W'||c.side==='E'?new THR.Vector3(inner,u,z):new THR.Vector3(u,inner,z);
    lid.add(new THR.Line(new THR.BufferGeometry().setFromPoints([P(c.a-o,c.z0-o),P(c.b+o,c.z0-o),P(c.b+o,c.z1+o),P(c.a-o,c.z1+o),P(c.a-o,c.z0-o)]),m2));
    const pl=c.plug;if(!pl)return;const plugM=new THR.MeshStandardMaterial({color:0x2a2c30,roughness:0.7,transparent:true,opacity:0.55,depthWrite:false});const ac=(c.a+c.b)/2,zc=(c.z0+c.z1)/2,hz=c.side==='W'||c.side==='E';
    const[u0,u1]=c.side==='W'?[X0-0.5-pl.len,X0-0.5]:c.side==='E'?[X1+0.5,X1+0.5+pl.len]:c.side==='S'?[Y0-0.5-pl.len,Y0-0.5]:[Y1+0.5,Y1+0.5+pl.len];
    const mesh=hz?box(u0,ac-pl.w/2,zc-pl.h/2,u1,ac+pl.w/2,zc+pl.h/2,plugM,grp):box(ac-pl.w/2,u0,zc-pl.h/2,ac+pl.w/2,u1,zc+pl.h/2,plugM,grp);mesh.userData.plug=c.ref;mesh.userData.el='win:'+c.ref;});
  // selected elements: orange, more opaque
  if(CADSEL.keys.length){const on=new Set(CADSEL.keys);const hi=new THR.MeshStandardMaterial({color:0xff8a1f,emissive:0x7a3300,roughness:0.5,transparent:true,opacity:0.72,side:THR.DoubleSide,depthWrite:false});
    grp.traverse(o=>{if(o.isMesh&&o.userData.el&&(on.has(o.userData.el)||on.has('base')&&o.parent===base&&!/^(boss|screw|ped|F)/.test(o.userData.el)||on.has('lid')&&o.parent===lid&&!/^(ped|F)/.test(o.userData.el)))o.material=hi;});}
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
  ['모서리 라운드','fillet all 3','커버 윗면·바닥 둘레와 세로 모서리를 R3 둥근모따기 해줘'],
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
  line=cadResolveRel(line);
  const r=TEXT2CAD.exec(st,line,HOUSING);
  if(r.mutated){H.undo.push(before);if(H.undo.length>80)H.undo.shift();H.redo=[];H.inp=st.inp;H.cad=st.cad;H.R=null;const R=mechRun();cadRefresh();
    const edgeCmd=/^(fillet|chamfer|round|set\s+corner)\b/i.test(line.trim());
    const nw=R.warn.filter(w=>/^F\d+/.test(w)||edgeCmd&&/둘레|윗면 R|모서리/.test(w));
    return r.out+(edgeCmd?`\n적용된 모서리: ${HOUSING.edgeText(R.d.geo)}${HS.ws==='cad'?'':' (기구 CAD 작업 공간 3D에서 확인)'}`:'')+'\n'+cadBrief(R)+(nw.length?'\n'+nw.map(w=>'! '+w).join('\n'):'');}
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
    else if(CADSEL.keys.length){const keys=CADSEL.keys.slice();cadSay('out','선택한 요소에 적용: '+cadSelNames(keys));
      if(AIM.mode==='ai'){await cliAiProbe();if(CLI.sample){await cadAI(line,keys);cadBusy(false);return;}cadSay('out','Claude를 쓸 수 없어 규칙으로 해석합니다.');}
      const cmds=cadSelRules(line,keys);if(!cmds.length)cadSay('err','선택한 요소에 대한 요청을 명령으로 바꾸지 못했습니다. 예: "지름 10으로", "위로 3 mm", "R2 둥근모따기", "삭제" — 복잡한 요청은 AI 모드로 보내세요.');
      else{cadSay('out','해석: '+cmds.join(' → '));for(const c of cmds){cadSay('cmd',c);try{const o=await cadRunCmd(c);if(o)cadSay('ok',o);}catch(e){cadSay('err',e.message||String(e));}if(CADSEL&&/^del /.test(c))cadSelDrop(c.split(' ')[1]);if(CADC.stopReq)break;}}}
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
Edge treatment vocabulary: 둥근모따기 · 라운드 · 필렛 · R = fillet; 모따기 · 각모따기 · 챔퍼 · C = chamfer (a plain "모따기" with an R size is a fillet). Edges: top = cover top perimeter, bottom = base bottom perimeter, vertical = the four vertical corners (same value as set corner), all = all three; "모서리" without a place means all. Always use the fillet/chamfer commands for these (set corner only changes the vertical corners). The tool output line "적용된 모서리" is what was really applied (sizes are limited by the height to the split line) — report it.
To change an existing feature use edit <F id> (do not delete and re-add it). Selected elements come with their key: F ids are features, wall:W/E/S/N walls, top / floor plates, edge:T/B/V edges, boss:/screw:/ped:/win: automatic elements (change them through the conditions that drive them, e.g. set stand, set tim, boss <x> <y>).
Rules: use at most 8 commands; read the output after each one (it reports mass, temperatures, cost and warnings) and fix what you broke; never run export (the user does that). Finish with one "check" only if the user asked for a review. Then answer in Korean in 2-5 short sentences: what you changed (feature ids), the key numbers from the outputs, and remaining risks. Do not invent numbers.`;
async function cadAI(req,selKeys){
  if(!req.trim())return'요청을 적어 주세요. 예: ai 오른쪽 벽에 케이블 글랜드 두 개 넣고 장착 탭 달아줘';
  const R=mechRun(),H=mechCfg();const cmds=TEXT2CAD.HELP.filter(x=>!/^ai /.test(x[0])&&!/^export/.test(x[0])).map(x=>`- ${x[0]} : ${x[1]}`).join('\n');
  const state=`${HOUSING.text(R)}\n형상 목록: ${H.cad.feats.map(f=>HOUSING.featLabel(f)).join(' · ')||'없음'}\n지정값: ${JSON.stringify(H.cad.over)}\n모서리: ${HOUSING.edgeText(R.d.geo)}\n벽 길이: S/N ${R.d.geo.Lo.toFixed(1)} mm, W/E ${R.d.geo.Wo.toFixed(1)} mm · 분할면 z ${R.d.geo.zSplit.toFixed(1)} · 커버 안쪽 z ${R.d.geo.zLid.toFixed(1)} · 바닥 z ${R.d.geo.zFloor.toFixed(1)}`;
  const selTxt=selKeys&&selKeys.length?`\n\n사용자가 3D/형상 트리에서 선택한 요소 (요청은 이 요소들에 적용 — "이것", "선택한 것", "여기"는 이 요소들입니다. 다른 요소는 설계가 깨질 때만 고치고 그 이유를 말하세요):\n${cadElements(R).filter(e=>selKeys.includes(e.key)).map(e=>`- [${e.key}] ${e.label} — ${e.desc} — 쓸 명령: ${e.how}`).join('\n')}`:'';
  const ok=await aiAgent({ro:c=>['help','status','check','compare','list','feats'].includes((TEXT2CAD.tok(c)[0]||'').toLowerCase()),roList:'status, check, compare, feats',prompt:CAD_SYS.replace('${CMDS}',cmds)+`\n\n현재 설계:\n${state}${selTxt}\n\n사용자 요청: ${req}`,toolName:'run_cad',toolDesc:'Run one housing CAD console command (see the list) and return its text output.',example:'"gland E M16 --z 9" or "tabs 4 --screw M5"',
    run:c=>cadRunCmd(c,'ai'),allowed:c=>{const f=(TEXT2CAD.tok(c)[0]||'').toLowerCase();return!TEXT2CAD.CMDS.has(f)||f==='ai'||f==='export'||f==='clear'?'unknown or not allowed: '+f:'';},
    say:cadSay,set:cadSetE,drop:e=>{copDrop(e);CADC.log=CADC.log.filter(x=>x!==e);},
    setAbort:c=>{CADC.abort=c;},stopped:()=>CADC.stopReq,max:12});
  if(!ok){const list=selKeys&&selKeys.length?cadSelRules(req,selKeys):TEXT2CAD.parse(req);if(!list.length)return'Claude를 쓸 수 없고 문장도 해석하지 못했습니다. help를 보세요.';cadSay('out','Claude를 쓸 수 없어 규칙으로 해석: '+list.join(' → '));for(const c of list){cadSay('cmd',c);try{const o=await cadRunCmd(c);if(o)cadSay('ok',o);}catch(e){cadSay('err',e.message);}}}
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
/* ---- element selection: pick housing elements in 3D or the feature tree (Shift/Ctrl = several), then say what to do with them ----
   Keys: base · lid · wall:W|E|S|N · top · floor · edge:T|B|V · F<n> (user features) · boss:<i> · screw:<i> · ped:<ref> · win:<ref> · fins · rib:auto */
var CADSEL={keys:[]};
function cadElements(R){R=R||mechRun();const d=R.d,g=d.geo,SK=HOUSING.SIDE_KO,E=[];const add=(key,group,label,desc,how)=>E.push({key,group,label,desc,how});
  const f1=v=>(+v).toFixed(1);const et=e=>e?`${e.k==='chamfer'?'각모따기 C':'둥근모따기 R'}${e.r}`:'없음';
  add('base','본체','베이스',`${esc0(d.m.short)} · 바닥 ~ 분할면 z ${f1(g.zSplit)} · 실링 ${d.seal.gasket}`,'set wall · set stand · set split · set mat');
  add('lid','본체','커버',`분할면 ~ 윗면 · 위 여유 ${g.top} mm`,'set top · set split · set wall');
  ['W','E','S','N'].forEach(s=>add('wall:'+s,'면',SK[s],`길이 ${f1(s==='S'||s==='N'?g.Lo:g.Wo)} · 두께 ${g.rim} mm · z ${f1(g.zFloor-g.t)} ~ ${f1(g.zLid+g.t)} · 분할면 z ${f1(g.zSplit)}`,`hole ${s} --d <mm> [--u --z] · gland ${s} M16 · vent ${s} · slot ${s} --w --h`));
  add('top','면','커버 윗면',`${f1(g.Lo)} × ${f1(g.Wo)} mm (--u = x0부터, --v = y0부터)`,'hole T · slot T · label "<글자>" · fins <n>');
  add('floor','면','바닥',`${f1(g.Lo)} × ${f1(g.Wo)} mm`,'hole B · slot B · rib x|y · tabs 4 · boss <x> <y>');
  add('edge:T','모서리','커버 윗면 둘레',et(g.eT),'fillet top <R> · chamfer top <C> · fillet top off');
  add('edge:B','모서리','바닥 둘레',et(g.eB),'fillet bottom <R> · chamfer bottom <C>');
  add('edge:V','모서리','세로 모서리 4곳',g.r>0?`${g.vk==='chamfer'?'각모따기 C':'둥근모따기 R'}${g.r}`:'없음','fillet vertical <R> · chamfer vertical <C> · set corner <R>');
  d.feats.forEach(f=>{let ds='';const along=f.side==='S'||f.side==='N'?g.x0:g.y0;
    if(f.type==='hole'||f.type==='slot')ds=f.side==='T'||f.side==='B'?`${SK[f.side]} · (${f1(f.x)}, ${f1(f.y)})`:`${SK[f.side]} · u ${f1(f.a-along)} · z ${f1(f.z)}`;
    else if(f.type==='tabs')ds=`${f.screw||'M5'} · ${f.sides==='SN'?'앞뒤':'좌우'} · ${f.w||16}×${f.len||14} mm`;else if(f.type==='rib')ds=`${f.axis} 방향 · 위치 ${f1(f.pos)} · 높이 ${f1(f.h)}`;
    else if(f.type==='boss')ds=f.x==null?'보드 가운데':`(${f.x}, ${f.y}) · Ø${f.d||3.2}`;else if(f.type==='fins')ds=f.off?'핀 없음':`${f.n}개 · ${f.h||12} mm`;else if(f.type==='label')ds=`${f.size||6} mm`;
    add(f.id,'추가 형상',HOUSING.featLabel(Object.assign({},f,{id:''})).trim(),ds,`edit ${f.id} … · del ${f.id}`);});
  d.sup.forEach((s,i)=>add('boss:'+i,'자동 요소',`PCB 보스 ${i+1}`,`(${f1(s.x)}, ${f1(s.y)}) · ${s.kind==='hole'?'보드 장착 구멍':s.kind==='corner'?'모서리 가정':'추가 지지'}`,'자동 (보드 장착 구멍·진동 기준) · 더하기: boss <x> <y> · 높이: set stand <mm>'));
  d.screws.forEach((s,i)=>add('screw:'+i,'자동 요소',`커버 나사 ${i+1}`,`${d.screwM} · (${f1(s.x)}, ${f1(s.y)})`,'자동 (분할면 둘레 간격 ≤ 피치) · 바꾸려면 set ip/vib 조건'));
  d.th.peds.forEach(p=>add('ped:'+p.ref,'자동 요소',`${p.ref} 방열 페데스탈`,`${p.kind==='bottom'?'베이스':'커버'} · ${HOUSING.TIMS[p.tim].short} · BLT ${p.blt} mm`,'set tim auto|pad15|pad30|gel40|pad60|none'));
  R.N.cuts.forEach(c=>add('win:'+c.ref,'자동 요소',`${c.ref} 커넥터 창`,`${SK[c.side]} · ${f1(c.b-c.a)} × ${f1(c.z1-c.z0)} mm${c.sealed?' · 플랜지 실링':''}`,'자동 (커넥터 위치) · 다른 구멍은 이 창과 겹치지 않게'));
  if(d.fins&&!d.feats.some(f=>f.type==='fins'))add('fins','자동 요소','방열 핀 (자동)',`${d.fins.n}개 · ${d.fins.h.toFixed(0)} mm`,'fins <n> --h <mm> · fins off');
  if(R.inp.vib>=4)add('rib:auto','자동 요소','바닥 보강 리브 (진동)',`진동 ${R.inp.vib} Grms`,'set vib · rib x|y');
  return E;}
function esc0(s){return String(s==null?'':s);}
function cadSelNames(keys){const E=cadElements();return keys.map(k=>{const e=E.find(x=>x.key===k);return e?(/^F\d/.test(k)?k+' ':'')+e.label:k;}).join(', ');}
function cadSelect(key,add){const K=CADSEL.keys;const i=K.indexOf(key);if(add){if(i>=0)K.splice(i,1);else K.push(key);}else CADSEL.keys=i>=0&&K.length===1?[]:[key];cadSelChanged();}
function cadSelDrop(key){CADSEL.keys=CADSEL.keys.filter(k=>k!==key);}
function cadSelClear(){if(!CADSEL.keys.length)return;CADSEL.keys=[];cadSelChanged();}
function cadSelChanged(){const E=new Set(cadElements().map(e=>e.key));CADSEL.keys=CADSEL.keys.filter(k=>E.has(k));if(HS.ws==='cad'){cadRender();mech3D();}cadSelPaint();}
function cadSelPaint(){const bar=$('#cadSel');if(!bar)return;if(CADSEL.keys.length&&BD&&BD.housing){const ok=new Set(cadElements().map(e=>e.key));CADSEL.keys=CADSEL.keys.filter(k=>ok.has(k));}const K=CADSEL.keys;bar.hidden=!K.length||HS.ws!=='cad';if(bar.hidden)return;const E=cadElements();
  $('#cadSelChips').innerHTML=K.map(k=>{const e=E.find(x=>x.key===k);return`<span class="sel-chip" title="${esc(e?e.desc:'')}">${esc(/^F\d/.test(k)?k+' ':'')}${esc(e?e.label:k)}<button type="button" data-unsel="${esc(k)}" aria-label="${esc(e?e.label:k)} 선택 해제">×</button></span>`;}).join('');
  const one=K.length===1?K[0]:'';const ex=/^F\d/.test(one)?'지름 10으로 · 위로 3 mm · 오른쪽 벽으로 옮기기 · 삭제':/^wall:/.test(one)?'M16 글랜드 2개 · 지름 8 구멍 높이 10 · 벤트':/^edge:/.test(one)?'R3 둥근모따기 · C1 모따기 · 없애기':one==='top'?'"ECU" 각인 · 방열 핀 12개':one==='floor'?'장착 탭 4개 M5 · 리브':'어떻게 바꿀지 적으세요';
  $('#cadSelIn').placeholder=`선택한 ${K.length}개를 어떻게 할까요? 예: ${ex}`;$('#cadSelMode').textContent=AIM.mode==='ai'?'AI로 적용':'적용';}
{const bar=$('#cadSel');if(bar){bar.addEventListener('click',e=>{const u=e.target.closest('[data-unsel]');if(u){cadSelDrop(u.dataset.unsel);cadSelChanged();return;}if(e.target.closest('#cadSelClr'))cadSelClear();});
  const go=()=>{const i=$('#cadSelIn');const v=i.value.trim();if(!v||CADC.busy)return;i.value='';cadExec(v);};$('#cadSelMode').addEventListener('click',go);
  $('#cadSelIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();go();}else if(e.key==='Escape')cadSelClear();});}}
// rules for a sentence about the selected elements (deterministic mode, and the fallback when Claude is unavailable)
function cadSelRules(text,keys){const c=String(text||'').trim(),out=[];if(!c)return out;const R=mechRun();const N=x=>{const m=String(x).match(/-?\d+(?:\.\d+)?/);return m?+m[0]:null;};
  const del=/삭제|지워|지우|없애|제거|빼\b|빼줘|빼고|delete|remove/i.test(c);const F=keys.filter(k=>/^F\d/.test(k)),EG=keys.filter(k=>/^edge:/.test(k));
  const feats=R.d.feats;const SIDEW={W:'왼쪽 벽',E:'오른쪽 벽',S:'앞 벽',N:'뒤 벽',T:'커버 윗면',B:'바닥'};
  if(EG.length){const es=EG.map(k=>({T:'top',B:'bottom',V:'vertical'})[k.slice(5)]).join(',');const kind=/둥근|둥글|라운드|필렛|fillet|round|\bR\s*\d/i.test(c)?'fillet':/모따기|챔퍼|chamfer|\bC\s*\d/i.test(c)?'chamfer':'fillet';
    if(del||/off|날카|각지게/.test(c))out.push(`${kind} ${es} off`);else if(/둥근|둥글|라운드|라운딩|필렛|휠렛|모따기|챔퍼|fillet|chamfer|round|\b[RC]\s*=?\s*\d|반경|반지름/i.test(c)){const sz=(c.match(/\b[RC]\s*=?\s*(\d+(?:\.\d+)?)/i)||[])[1]||N(c);if(sz!=null)out.push(`${kind} ${es} ${sz}`);}}
  F.forEach(id=>{const f=feats.find(x=>x.id===id);if(!f)return;if(del){out.push('del '+id);return;}const fl=[];
    const d=(c.match(/(?:지름|직경|ø|Ø|φ|파이|구경)\s*(\d+(?:\.\d+)?)/i)||[])[1];const rect=c.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/);const gl=c.match(/\b(m|pg)\s*(\d+)\b/i);
    if(f.type==='hole'){if(gl&&f.kind==='gland')fl.push('--size '+gl[1].toUpperCase()+gl[2]);else if(d)fl.push('--d '+d);else if(/키워|크게|넓게/.test(c)&&!/위로|아래로|왼|오른|앞|뒤/.test(c))fl.push('--d '+(f.w+(N(c)||2)));else if(/줄여|작게|좁게/.test(c))fl.push('--d '+Math.max(1,f.w-(N(c)||2)));
      else if(/^\s*(\d+(?:\.\d+)?)\s*(mm)?\s*(으로|로)?\s*(해|바꿔|변경)?/.test(c)&&!/위로|아래로|높이|위치/.test(c))fl.push('--d '+N(c));}
    if(f.type==='slot'&&rect)fl.push(`--w ${rect[1]} --h ${rect[2]}`);
    if(f.type==='hole'||f.type==='slot'){const mv=n=>N(n.replace(/.*?(위|아래|왼|오른|앞|뒤)\S*\s*/,''))||N(n)||2;
      const z=(c.match(/높이\s*(?:z\s*)?(-?\d+(?:\.\d+)?)/)||[])[1],u=(c.match(/(?:위치|u)\s*(-?\d+(?:\.\d+)?)/i)||[])[1];if(z!=null)fl.push('--z '+z);if(u!=null)fl.push('--u '+u);
      if(/위로|위쪽으로|올려/.test(c))fl.push('--dz '+mv(c));else if(/아래로|아래쪽으로|내려/.test(c))fl.push('--dz -'+mv(c));
      const toSide=c.match(/(왼쪽|오른쪽|앞|뒤|윗면|커버|바닥)\s*(?:벽|면)?\s*(?:으로|로)\s*(?:옮|이동|바꿔)/);
      if(toSide){const sd=TEXT2CAD.side(toSide[1]);if(sd)fl.push('--side '+sd);}
      else if(/(오른쪽|뒤쪽|뒤로)\S*\s*(?:으로|로)?\s*\d/.test(c)||/오른쪽으로|뒤로/.test(c))fl.push('--du '+mv(c));else if(/(왼쪽|앞쪽|앞으로)/.test(c))fl.push('--du -'+mv(c));}
    if(f.type==='tabs'){const m=c.match(/\bm\s*(\d)\b/i);if(m)fl.push('--screw M'+m[1]);const n=(c.match(/(\d+)\s*개/)||[])[1];if(n)fl.push('--n '+n);if(/앞뒤/.test(c))fl.push('--sides SN');else if(/좌우/.test(c))fl.push('--sides WE');}
    if(f.type==='fins'){const n=(c.match(/(\d+)\s*개/)||[])[1],h=(c.match(/높이\s*(\d+(?:\.\d+)?)/)||[])[1];if(n)fl.push('--n '+n);if(h)fl.push('--h '+h);}
    if(f.type==='rib'){const h=(c.match(/높이\s*(\d+(?:\.\d+)?)/)||[])[1],p=(c.match(/위치\s*(-?\d+(?:\.\d+)?)/)||[])[1];if(h)fl.push('--h '+h);if(p)fl.push('--pos '+p);if(/세로|y\s*방향/.test(c))fl.push('--axis y');else if(/가로|x\s*방향/.test(c))fl.push('--axis x');}
    if(f.type==='label'){const q=(c.match(/["“'‘]([^"”'’]+)["”'’]/)||[])[1];if(q)fl.push(`--text "${q.replace(/"/g,'')}"`);const sz=(c.match(/(?:크기|글자\s*크기)\s*(\d+(?:\.\d+)?)/)||[])[1];if(sz)fl.push('--size '+sz);}
    if(f.type==='boss'){const xy=c.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);if(xy)fl.push(`--x ${xy[1]} --y ${xy[2]}`);if(d)fl.push('--d '+d);}
    if(fl.length)out.push(`edit ${id} ${fl.join(' ')}`);});
  // faces: read the sentence as if it named that face
  keys.filter(k=>/^(wall:|top$|floor$)/.test(k)).forEach(k=>{const sd=k==='top'?'T':k==='floor'?'B':k.slice(5);TEXT2CAD.parse(`${SIDEW[sd]}에 ${c}`).forEach(x=>out.push(x));});
  // automatic elements and the body: their conditions
  if(keys.some(k=>/^(base|lid|ped:|boss:|screw:|win:|fins|rib:auto)/.test(k))&&!out.length)TEXT2CAD.parse(c).forEach(x=>out.push(x));
  return[...new Set(out)];}
// "edit F2 --dz 3" → absolute --u/--z from the analysed geometry (auto positions have no stored value)
function cadResolveRel(line){const t=TEXT2CAD.tok(line);if((t[0]||'').toLowerCase()!=='edit'||!/--d[uz]\b/.test(line))return line;const id=String(t[1]||'').toUpperCase();const R=mechRun(),g=R.d.geo;const f=R.d.feats.find(x=>x.id===id);if(!f||f.a==null&&f.x==null)return line;
  const a=TEXT2CAD.args(t.slice(2));const flat=f.side==='T'||f.side==='B';const u0=flat?f.x-g.x0:f.a-(f.side==='S'||f.side==='N'?g.x0:g.y0),z0=flat?f.y-g.y0:f.z;
  const rest=t.slice(2).filter((x,i,arr)=>!/^--d[uz]$/.test(x)&&!/^--d[uz]$/.test(arr[i-1]||''));const r2=v=>Math.round(v*100)/100;
  if(a.du!=null&&a.du!==true)rest.push('--u',String(r2(u0+(+a.du))));if(a.dz!=null&&a.dz!==true)rest.push(flat?'--v':'--z',String(r2(z0+(+a.dz))));
  return['edit',id,...rest.map(x=>/\s/.test(x)?`"${x}"`:x)].join(' ');}
// 3D picking in the CAD workspace (called from the viewer's pointer handler)
function cadHousingHit(px,py){if(HS.ws!=='cad'||!G3||!G3.root||!BD||!BD.housing||!BD.housing.show)return null;const grp=G3.root.children.find(o=>o.userData&&o.userData.housing);if(!grp)return null;
  const r=cv3.getBoundingClientRect();const v=new THREE.Vector2((px/r.width)*2-1,-(py/r.height)*2+1),rc=new THREE.Raycaster();rc.setFromCamera(v,G3.cam);
  for(const h of rc.intersectObject(grp,true)){let o=h.object;while(o&&!o.userData.el)o=o.parent;if(o&&o.userData.el)return o.userData.el;}return null;}
function cadPick3D(px,py,e){if(HS.ws!=='cad'||!BD||!BD.housing||!BD.housing.show)return false;const k=cadHousingHit(px,py);const add=!!(e&&(e.shiftKey||e.ctrlKey||e.metaKey));
  if(k){cadSelect(k,add);return true;}if(!add&&CADSEL.keys.length){cadSelClear();return true;}return false;}
function cadHover3D(px,py){const k=cadHousingHit(px,py);if(!k)return null;const e=cadElements().find(x=>x.key===k);return e?`<b>${esc(/^F\d/.test(k)?k+' ':'')}${esc(e.label)}</b> <span class="net">${esc(e.desc)}</span><br><small>클릭 선택 · Shift/Ctrl 다중 선택</small>`:null;}
