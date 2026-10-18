/* ---------- 데이터시트 탭: the HTML datasheet DB (datasheets/db/*.html → DSDB) for the parts of the current circuit ----------
   Left: parts of the circuit (BOM order, with reference price) and a search over the whole DB; right: the part's page. */
var DS={q:'',sel:null,view:'list'};
const dsDB=()=>typeof DSDB!=='undefined'?DSDB:{built:'',items:{}};
const dsStrip=html=>String(html||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/\son[a-z]+="[^"]*"/gi,'').replace(/javascript:/gi,'');
function dsFind(mpn){if(!mpn)return null;const I=dsDB().items;const k=String(mpn).trim();if(I[k])return Object.assign({mpn:k},I[k]);const base=k.replace(/\s*\(.*\)$/,'');if(I[base])return Object.assign({mpn:base},I[base]);
  const hit=Object.keys(I).find(x=>x.replace(/\s*\(.*\)$/,'')===base);return hit?Object.assign({mpn:hit},I[hit]):null;}
// parts of the current circuit grouped by part number
function dsParts(){if(!BD||BD.blank)return[];const m=new Map();BD.comps.forEach(c=>{const key=(c.mpn||'').trim()||('~'+c.val+'|'+c.fp);const it=m.get(key)||{mpn:(c.mpn||'').trim(),val:c.val,fp:c.fp,refs:[],desc:c.desc||''};it.refs.push(c.ref);m.set(key,it);});
  const P=typeof PARTS!=='undefined'?PARTS:null;const out=[...m.values()].map(it=>{it.ds=dsFind(it.mpn);it.info=P&&(P.find(it.mpn)||P.find(it.val));it.price=P?P.price(it.mpn,it.info&&it.info.cat):null;it.sub=it.price!=null?it.price*it.refs.length:null;return it;});
  out.sort((a,b)=>(b.sub||0)-(a.sub||0)||a.refs[0].localeCompare(b.refs[0],undefined,{numeric:true}));return out;}
function dsRender(){
  const host=$('#dsPane');if(!host)return;const D=dsDB();const parts=dsParts();const q=DS.q.toLowerCase();
  const total=parts.reduce((a,p)=>a+(p.sub||0),0),unknown=parts.filter(p=>p.sub==null).length;
  if(DS.sel){const it=dsFind(DS.sel);const P=typeof PARTS!=='undefined'?PARTS:null;const info=P&&P.find(DS.sel);
    host.innerHTML=`<div class="ds-h"><button type="button" class="btn sm" data-dsback>← 목록</button><b class="mono">${esc(DS.sel)}</b>${it&&it.status==='stub'?'<span class="ds-stub">초안</span>':''}<span class="cop-sp"></span>${it?`<a class="btn sm" href="${esc(it.file)}" target="_blank" rel="noopener">원본 파일</a>`:''}</div>
      <div class="ds-page">${it?dsStrip(it.html):`<p class="lead">이 부품(${esc(DS.sel)})의 데이터시트 페이지가 아직 없습니다. <code>datasheets/db/${esc(DS.sel.replace(/[^A-Za-z0-9.+-]+/g,'_'))}.html</code>을 만들고 <code>npm run dsdb</code>로 묶으세요.</p>${info?`<dl class="kv">${info.specs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p>${P.links(info,DS.sel).map(([t,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join(' · ')}</p>`:''}`}</div>`;
    host.querySelector('[data-dsback]').addEventListener('click',()=>{DS.sel=null;dsRender();});return;}
  const row=p=>{const name=p.mpn||p.val;return`<button type="button" class="ds-row${p.ds?'':' none'}" data-ds="${esc(p.mpn||'')}" ${p.mpn?'':'disabled'}><span class="ds-refs mono">${esc(p.refs.slice(0,4).join(', '))}${p.refs.length>4?` +${p.refs.length-4}`:''}</span><span class="ds-name"><b>${esc(name)}</b><small>${esc(p.info?p.info.title:p.desc||p.fp||'')}</small></span><span class="ds-price mono">${p.price!=null?`$${p.price}${p.refs.length>1?` ×${p.refs.length}`:''}`:'—'}</span><span class="ds-st">${p.ds?(p.ds.status==='stub'?'초안':'DB'):'없음'}</span></button>`;};
  const all=Object.entries(D.items).map(([mpn,v])=>({mpn,v})).filter(x=>!q||(x.mpn+' '+x.v.title+' '+x.v.mfr+' '+x.v.cat).toLowerCase().includes(q)).slice(0,60);
  host.innerHTML=`<div class="ds-h"><b>데이터시트 DB</b><span class="cls">${Object.keys(D.items).length}페이지 · ${esc(D.built)}</span><span class="cop-sp"></span><input class="search" id="dsQ" type="search" placeholder="부품 번호·제조사·분류 검색" value="${esc(DS.q)}"></div>
    ${q?`<div class="ds-list">${all.map(x=>`<button type="button" class="ds-row" data-ds="${esc(x.mpn)}"><span class="ds-name"><b>${esc(x.mpn)}</b><small>${esc(x.v.mfr)} · ${esc(x.v.cat)} · ${esc(x.v.title.replace(/^[^·]*·\s*/,''))}</small></span><span class="ds-price mono">${x.v.price!=null?'$'+x.v.price:'—'}</span><span class="ds-st">${x.v.status==='stub'?'초안':'DB'}</span></button>`).join('')||'<p class="lead">검색 결과가 없습니다.</p>'}</div>`
    :parts.length?`<div class="ds-sum">이 회로의 부품 ${parts.length}종 · BOM 참고가 약 <b>$${total.toFixed(2)}</b>${unknown?` (단가 미정 ${unknown}종)`:''}${BD.variantLabel?` · 회로 안: ${esc(BD.variantLabel)}`:''}</div><div class="ds-list">${parts.map(row).join('')}</div>
      <p class="lead">참고 단가는 데이터시트 페이지의 <code>data-price</code>(약 1k 수량, 추정)입니다. 행을 누르면 정리된 데이터시트가 열립니다. 페이지 추가·수정은 <code>datasheets/db/</code>에서 합니다.</p>`
    :'<p class="lead" style="padding:12px">회로가 아직 없습니다. 2단계에서 회로 안을 고르면 부품 목록과 데이터시트가 여기 나옵니다. 위 검색으로 DB 전체를 볼 수 있습니다.</p>'}`;
  const inp=host.querySelector('#dsQ');inp.addEventListener('input',()=>{DS.q=inp.value;const pos=inp.selectionStart;dsRender();const n=$('#dsQ');if(n){n.focus();n.setSelectionRange(pos,pos);}});
  host.querySelectorAll('[data-ds]').forEach(b=>b.addEventListener('click',()=>{DS.sel=b.dataset.ds;dsRender();}));}
