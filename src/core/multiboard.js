/* Multi-board systems: several boards joined through connector pairs (cable harness or board-to-board).
   Pure data over the viewer's board objects — the app keeps the live project in MB (src/app/mbui.js).
   project = {boards:[{id,name,role}], links:[{id,a:{board,ref},b:{board,ref},kind:'cable'|'b2b',label,pins:[[pinA,pinB]…],auto:'number'|'net'|'manual'}]}
   Boards are passed in as a map id → board object (BD-like, finalized). */
const MULTIBOARD=(function(){
"use strict";
const isConn=c=>/^(J|P|CN|X|CON|USB)\d/i.test(c.ref||'')||/^(usb|hdr|conn)$/.test(c.kind||'');
const RAIL=/^(\+?\d+(\.\d+)?V\d*|V(CC|DD|BUS|IN|BAT|SYS|EXT|REF)|\+[0-9.]+V|[0-9.]+V\d*|3V3|5V|12V|VBAT)$/i;
const GND=/^(GND|AGND|DGND|PGND|VSS|EARTH|0V|CHASSIS)$/i;
const nrm=n=>String(n||'').replace(/^\//,'').replace(/^NET-?/i,'').toUpperCase();
const seq=p=>'L'+(((p.links||[]).reduce((m,l)=>Math.max(m,+String(l.id||'L0').slice(1)||0),0))+1);
function connectors(B){return(B&&B.comps||[]).filter(isConn).map(c=>({ref:c.ref,val:c.val||'',mpn:c.mpn||'',fp:c.fp||'',side:c.side,pins:c.pads.filter(p=>p.n!=null).map(p=>({n:String(p.n),net:p.net||null,fn:p.fn||''}))}));}
function connOf(boards,bref){const B=boards[bref.board];if(!B)return null;const c=B.byRef&&B.byRef[bref.ref]||B.comps.find(x=>x.ref===bref.ref);if(!c)return null;return{board:bref.board,c,pins:c.pads.filter(p=>p.n!=null).map(p=>({n:String(p.n),net:p.net||null,fn:p.fn||''}))};}
// pin pairs between two connectors: by pin number (1↔1), by net name, or keep the manual list
function mapPins(A,B,mode,keep){if(!A||!B)return[];const out=[];
  if(mode==='net'){B.pins.forEach(pb=>{if(!pb.net)return;const pa=A.pins.find(x=>x.net&&nrm(x.net)===nrm(pb.net)&&!out.some(o=>o[0]===x.n));if(pa)out.push([pa.n,pb.n]);});
    A.pins.forEach(pa=>{if(out.some(o=>o[0]===pa.n))return;const pb=B.pins.find(x=>x.n===pa.n&&!out.some(o=>o[1]===x.n));if(pb)out.push([pa.n,pb.n]);});return out.sort((x,y)=>(+x[0]||0)-(+y[0]||0));}
  if(mode==='manual'&&keep)return keep.filter(([a,b])=>A.pins.some(p=>p.n===a)&&B.pins.some(p=>p.n===b));
  A.pins.forEach(pa=>{const pb=B.pins.find(x=>x.n===pa.n);if(pb)out.push([pa.n,pb.n]);});return out;}
function addLink(project,a,b,o){o=o||{};const l={id:seq(project),a:{board:a.board,ref:a.ref},b:{board:b.board,ref:b.ref},kind:o.kind||'cable',label:o.label||'',auto:o.auto||'number',pins:o.pins||[]};project.links=project.links||[];project.links.push(l);return l;}
function resolve(project,boards){return(project.links||[]).map(l=>{const A=connOf(boards,l.a),B=connOf(boards,l.b);const pins=l.auto==='manual'?mapPins(A,B,'manual',l.pins):mapPins(A,B,l.auto||'number');if(l.auto!=='manual')l.pins=pins;
    return{l,A,B,pins,rows:pins.map(([pa,pb])=>{const x=A&&A.pins.find(p=>p.n===pa),y=B&&B.pins.find(p=>p.n===pb);return{pa,pb,na:x&&x.net||'',nb:y&&y.net||'',fa:x&&x.fn||'',fb:y&&y.fn||''};})};});}
/* ---- checks across the links ---- */
function check(project,boards){const out=[];const add=(sev,code,link,msg)=>out.push({sev,code,link:link&&link.id,msg});
  const R=resolve(project,boards);
  R.forEach(({l,A,B,rows})=>{const nm=`${l.a.board}.${l.a.ref} ↔ ${l.b.board}.${l.b.ref}`;
    if(!A||!B){add('err','MISSING',l,`${nm}: 커넥터를 찾지 못했습니다 (보드 또는 참조 번호 확인).`);return;}
    if(A.pins.length!==B.pins.length)add('warn','PINCOUNT',l,`${nm}: 핀 수가 다릅니다 (${A.pins.length} ↔ ${B.pins.length}).`);
    if(!rows.length)add('err','NOPINS',l,`${nm}: 짝지어진 핀이 없습니다. 매핑 방식(번호/넷/직접)을 확인하세요.`);
    const unA=A.pins.filter(p=>p.net&&!rows.some(r=>r.pa===p.n)),unB=B.pins.filter(p=>p.net&&!rows.some(r=>r.pb===p.n));
    if(unA.length)add('warn','UNMAPPED',l,`${nm}: ${l.a.board}.${l.a.ref} 핀 ${unA.map(p=>p.n+'('+p.net+')').slice(0,6).join(', ')}${unA.length>6?' …':''}이(가) 연결되지 않습니다.`);
    if(unB.length)add('warn','UNMAPPED',l,`${nm}: ${l.b.board}.${l.b.ref} 핀 ${unB.map(p=>p.n+'('+p.net+')').slice(0,6).join(', ')}${unB.length>6?' …':''}이(가) 연결되지 않습니다.`);
    rows.forEach(r=>{if(!r.na&&!r.nb)return;if(!r.na||!r.nb){add('info','OPEN',l,`${nm} 핀 ${r.pa}↔${r.pb}: 한쪽만 넷이 있습니다 (${r.na||'—'} ↔ ${r.nb||'—'}).`);return;}
      const a=nrm(r.na),b=nrm(r.nb);if(a===b)return;const ga=GND.test(a),gb=GND.test(b),ra=RAIL.test(a),rb=RAIL.test(b);
      if(ga!==gb)add('err','GND_MIX',l,`${nm} 핀 ${r.pa}↔${r.pb}: 접지와 신호/전원이 만납니다 (${r.na} ↔ ${r.nb}).`);
      else if(ra&&rb&&a!==b)add('err','RAIL',l,`${nm} 핀 ${r.pa}↔${r.pb}: 다른 전원 레일이 만납니다 (${r.na} ↔ ${r.nb}).`);
      else if(ra!==rb)add('warn','RAIL_SIG',l,`${nm} 핀 ${r.pa}↔${r.pb}: 전원과 신호가 만납니다 (${r.na} ↔ ${r.nb}).`);
      else add('info','NAME',l,`${nm} 핀 ${r.pa}↔${r.pb}: 넷 이름이 다릅니다 (${r.na} ↔ ${r.nb}) — 같은 신호면 이름을 맞추세요.`);});
    // differential pairs should stay paired across the link
    const dp=rows.filter(r=>/(_P|_N|\+|-|H|L)$/i.test(r.na)&&/(CAN|USB|LVDS|ETH|RX|TX|D)/i.test(r.na));if(dp.length===1)add('info','DIFF',l,`${nm}: 차동 신호 ${dp[0].na}의 짝이 같은 커넥터에 없습니다.`);});
  // connectors with nets but no link on any board
  Object.entries(boards).forEach(([id,B])=>{connectors(B).forEach(c=>{if(!c.pins.some(p=>p.net))return;const used=(project.links||[]).some(l=>(l.a.board===id&&l.a.ref===c.ref)||(l.b.board===id&&l.b.ref===c.ref));if(!used)add('info','UNLINKED',null,`${id}.${c.ref} (${c.val||c.fp}): 연결이 정해지지 않은 커넥터입니다 (외부 케이블이면 무시).`);});});
  return out;}
/* ---- system-level nets: union-find over (board, net) through link pins ---- */
function systemNets(project,boards){const par={};const find=k=>{while(par[k]!==undefined&&par[k]!==k)k=par[k];return k;};const uni=(a,b)=>{const x=find(a),y=find(b);if(x!==y)par[x]=y;};
  Object.entries(boards).forEach(([id,B])=>{(B.netOrder||Object.keys(B.nets||{})).forEach(n=>{const k=id+':'+n;par[k]=k;});});
  resolve(project,boards).forEach(({l,rows})=>rows.forEach(r=>{if(r.na&&r.nb)uni(l.a.board+':'+r.na,l.b.board+':'+r.nb);}));
  const groups={};Object.keys(par).forEach(k=>{const r=find(k);(groups[r]=groups[r]||[]).push(k);});
  return Object.values(groups).filter(g=>g.length>1).map(g=>{const names=g.map(k=>k.split(':')[1]);const name=names.find(n=>GND.test(nrm(n)))||names.find(n=>RAIL.test(nrm(n)))||names.sort()[0];return{name,members:g.map(k=>{const i=k.indexOf(':');return{board:k.slice(0,i),net:k.slice(i+1)};}),boards:[...new Set(g.map(k=>k.split(':')[0]))].length};}).sort((a,b)=>b.boards-a.boards||a.name.localeCompare(b.name));}
/* ---- aggregated BOM over boards ---- */
function systemBom(project,boards){const m=new Map();Object.entries(boards).forEach(([id,B])=>{(B.comps||[]).forEach(c=>{const k=[c.val,c.fp,c.mpn||''].join('|');const it=m.get(k)||{val:c.val,fp:c.fp,mpn:c.mpn||'',desc:c.desc||'',qty:0,by:{}};it.qty++;(it.by[id]=it.by[id]||[]).push(c.ref);m.set(k,it);});});
  return[...m.values()].sort((a,b)=>b.qty-a.qty||String(a.val).localeCompare(String(b.val)));}
/* ---- interconnect diagram SVG: boards as boxes, connectors on their edge, links as cables with pin counts ---- */
function svg(project,boards,opts){opts=opts||{};const ids=(project.boards||[]).map(b=>b.id).filter(id=>boards[id]);if(!ids.length)return'';
  const xe=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const f=v=>(Math.round(v*10)/10).toString();
  const R=resolve(project,boards);const checks=check(project,boards);const bad=new Set(checks.filter(c=>c.sev==='err').map(c=>c.link));
  const W=opts.width||Math.max(760,ids.length*300+60),bw=240,gap=(W-60-ids.length*bw)/Math.max(1,ids.length-1);
  const pos={};ids.forEach((id,i)=>{pos[id]={x:30+i*(bw+(ids.length>1?gap:0)),y:60};});
  const cons={};ids.forEach(id=>{cons[id]=connectors(boards[id]);});
  const rowH=20;const bh=id=>70+Math.max(1,cons[id].length)*rowH+14;const H=Math.max(...ids.map(bh))+180;
  const o=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}" font-family="IBM Plex Sans KR, system-ui, sans-serif" style="background:#fff">`,`<rect width="${f(W)}" height="${f(H)}" fill="#fff"/>`];
  o.push(`<text x="30" y="34" font-size="15" font-weight="700" fill="#1d2126">${xe(opts.title||project.name||'시스템')} · 보드 ${ids.length}개 · 연결 ${(project.links||[]).length}개</text>`);
  const pinPos={};
  ids.forEach(id=>{const B=boards[id],p=pos[id],meta=(project.boards||[]).find(b=>b.id===id)||{};const h=bh(id);
    o.push(`<rect x="${f(p.x)}" y="${f(p.y)}" width="${bw}" height="${f(h)}" rx="12" fill="#f6f3ec" stroke="#1d2126" stroke-width="1.4"/>`);
    o.push(`<rect x="${f(p.x+14)}" y="${f(p.y+14)}" width="${bw-28}" height="30" rx="5" fill="#1e5b3e"/>`);
    o.push(`<text x="${f(p.x+bw/2)}" y="${f(p.y+34)}" font-size="12.5" font-weight="700" fill="#fff" text-anchor="middle">${xe(B.name||id)}</text>`);
    o.push(`<text x="${f(p.x+bw/2)}" y="${f(p.y+58)}" font-size="10.5" fill="#5a6872" text-anchor="middle">${xe(meta.role||'')}${meta.role?' · ':''}${f(B.W)} × ${f(B.H)} mm · ${B.copperLayers||2}층 · 부품 ${B.comps.length}</text>`);
    cons[id].forEach((c,i)=>{const y=p.y+70+i*rowH;const linked=(project.links||[]).some(l=>(l.a.board===id&&l.a.ref===c.ref)||(l.b.board===id&&l.b.ref===c.ref));
      o.push(`<rect x="${f(p.x+14)}" y="${f(y)}" width="${bw-28}" height="${rowH-4}" rx="4" fill="${linked?'#fff':'#eceae4'}" stroke="${linked?'#b5541c':'#c9c5ba'}"/>`);
      o.push(`<text x="${f(p.x+20)}" y="${f(y+12)}" font-size="10.5" font-family="JetBrains Mono, monospace" fill="#1d2126">${xe(c.ref)}</text><text x="${f(p.x+bw-20)}" y="${f(y+12)}" font-size="10" fill="#5a6872" text-anchor="end">${xe((c.mpn||c.val||c.fp).slice(0,18))} · ${c.pins.length}핀</text>`);
      pinPos[id+'.'+c.ref]={l:[p.x+14,y+rowH/2-2],r:[p.x+bw-14,y+rowH/2-2]};});});
  R.forEach(({l,A,B,rows},k)=>{const a=pinPos[l.a.board+'.'+l.a.ref],b=pinPos[l.b.board+'.'+l.b.ref];if(!a||!b)return;const ia=ids.indexOf(l.a.board),ib=ids.indexOf(l.b.board);
    const p1=ia<=ib?a.r:a.l,p2=ia<=ib?b.l:b.r;const same=ia===ib;const col=bad.has(l.id)?'#c0392b':l.kind==='b2b'?'#2f6fb5':'#b5541c';
    const mx=(p1[0]+p2[0])/2;const d=same?`M${f(p1[0])} ${f(p1[1])} C${f(p1[0]+70)} ${f(p1[1])} ${f(p2[0]+70)} ${f(p2[1])} ${f(p2[0])} ${f(p2[1])}`:`M${f(p1[0])} ${f(p1[1])} C${f(mx)} ${f(p1[1])} ${f(mx)} ${f(p2[1])} ${f(p2[0])} ${f(p2[1])}`;
    o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${l.kind==='b2b'?3:2.2}"${l.kind==='b2b'?'':' stroke-dasharray="7 4"'}/>`);
    const ly=(p1[1]+p2[1])/2-8;o.push(`<rect x="${f(mx-46)}" y="${f(ly-10)}" width="92" height="20" rx="10" fill="#fff" stroke="${col}"/><text x="${f(mx)}" y="${f(ly+4)}" font-size="10" text-anchor="middle" fill="#1d2126">${xe(l.label||l.id)} · ${rows.length}핀${l.kind==='b2b'?' · B2B':''}</text>`);});
  const errs=checks.filter(c=>c.sev==='err').length,warns=checks.filter(c=>c.sev==='warn').length;
  o.push(`<text x="30" y="${f(H-24)}" font-size="11" fill="#5a6872">실선 = 보드 간 직결(B2B) · 점선 = 케이블/하네스 · 빨강 = 오류 있는 연결 · 점검: 오류 ${errs} · 경고 ${warns}</text>`);
  o.push('</svg>');return o.join('\n');}
function linksAoa(project,boards){const rows=[['연결','종류','라벨','A 보드','A 커넥터','A 핀','A 넷','B 보드','B 커넥터','B 핀','B 넷','상태']];const ck=check(project,boards);
  resolve(project,boards).forEach(({l,rows:R})=>{if(!R.length)rows.push([l.id,l.kind,l.label,l.a.board,l.a.ref,'','',l.b.board,l.b.ref,'','','핀 없음']);
    R.forEach(r=>{const st=ck.find(c=>c.link===l.id&&c.msg.includes(`핀 ${r.pa}↔${r.pb}`));rows.push([l.id,l.kind,l.label,l.a.board,l.a.ref,r.pa,r.na,l.b.board,l.b.ref,r.pb,r.nb,st?st.sev+': '+st.code:'OK']);});});return rows;}
function text(project,boards){const ck=check(project,boards);const sn=systemNets(project,boards);const L=[`시스템 ${project.name||''}: 보드 ${(project.boards||[]).length}개 · 연결 ${(project.links||[]).length}개 · 시스템 넷 ${sn.length}개`];
  (project.boards||[]).forEach(b=>{const B=boards[b.id];if(!B)return;L.push(`  ${b.id} ${B.name}${b.role?' ('+b.role+')':''}: ${B.comps.length}부품 · ${(B.netOrder||[]).length}넷 · 커넥터 ${connectors(B).map(c=>c.ref).join(', ')||'없음'}`);});
  resolve(project,boards).forEach(({l,rows})=>L.push(`  ${l.id} ${l.kind} ${l.label||''}: ${l.a.board}.${l.a.ref} ↔ ${l.b.board}.${l.b.ref} · ${rows.length}핀 (${l.auto})`));
  if(ck.length){L.push('점검:');ck.forEach(c=>L.push(`  ${c.sev==='err'?'!!':c.sev==='warn'?'!':'·'} ${c.msg}`));}return L.join('\n');}
return{isConn,connectors,connOf,mapPins,addLink,resolve,check,systemNets,systemBom,svg,linksAoa,text,nrm};
})();
if(typeof module!=='undefined')module.exports=MULTIBOARD;
