/* ---------- local AI: Claude Messages API when the page is NOT inside claude.ai ----------
   On claude.ai the viewer injects window.claude (the sample capability) and bills the viewer's plan.
   Opened from a file or another server there is no window.claude, so this module builds a drop-in `sample`
   from the Anthropic Messages API: either straight from the browser (API key stored in this browser,
   `anthropic-dangerous-direct-browser-access` header) or through the bundled proxy (`npm run serve`), which keeps
   the key on the machine running it. Same call shape as the capability: sample(prompt,{tools,signal,modelTier,onText}),
   sample.json(prompt,opts), sample.limits() → {tools:true}. Errors carry {code,message} like the capability. */
var LAI={url:'',key:'',model:'',web:true,tiers:{quick:'claude-haiku-5-5',default:'claude-sonnet-5-5',complex:'claude-opus-5-5'},max:4096};
try{const v=JSON.parse(localStorage.getItem('pcbv.localai')||'null');if(v&&typeof v==='object'){if(typeof v.url==='string')LAI.url=v.url;if(typeof v.key==='string')LAI.key=v.key;if(typeof v.model==='string')LAI.model=v.model;if(typeof v.web==='boolean')LAI.web=v.web;if(v.tiers&&typeof v.tiers==='object')Object.assign(LAI.tiers,v.tiers);}}catch(e){}
function laiSave(){try{localStorage.setItem('pcbv.localai',JSON.stringify({url:LAI.url,key:LAI.key,model:LAI.model,web:LAI.web,tiers:LAI.tiers}));}catch(e){}}
function laiConfigured(){return !!(LAI.url||LAI.key);}
function laiEndpoint(){const u=(LAI.url||'https://api.anthropic.com').replace(/\/+$/,'');return /\/v1\/messages$/.test(u)?u:u+'/v1/messages';}
function laiModel(tier){return LAI.model||LAI.tiers[tier]||LAI.tiers.default;}
function laiErr(code,msg,text){const e=new Error(msg||code);e.code=code;if(text)e.text=text;return e;}
// one Messages API round; the proxy forwards the body and adds the key when the browser sent none
async function laiPost(body,signal){
  const h={'content-type':'application/json','anthropic-version':'2023-06-01'};
  if(LAI.key){h['x-api-key']=LAI.key;h['anthropic-dangerous-direct-browser-access']='true';}
  let r;try{r=await fetch(laiEndpoint(),{method:'POST',headers:h,body:JSON.stringify(body),signal});}
  catch(e){if(e&&e.name==='AbortError')throw laiErr('cancelled','중지됨');throw laiErr('network','연결 실패: '+(LAI.url?LAI.url+' (프록시가 떠 있는지 확인)':'api.anthropic.com (키 또는 네트워크 확인)'));}
  if(!r.ok){let m='';try{const j=await r.json();m=j&&j.error&&j.error.message||'';}catch(e){}
    if(r.status===401||r.status===403)throw laiErr('not_granted','API 키가 없거나 잘못되었습니다'+(m?': '+m:''));
    if(r.status===429)throw laiErr('rate_limited','API 사용량 한도'+(m?': '+m:''));
    if(r.status===404&&/model/i.test(m))throw laiErr('model','모델 이름을 확인하세요: '+m);
    throw laiErr('http_'+r.status,m||('HTTP '+r.status));}
  return r.json();
}
function laiBuild(opts){
  const f=async function(input,o){o=o||{};
    const msgs=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:String(m.content)}));
    const tools=(o.tools||[]).map(t=>({name:t.name,description:t.description||'',input_schema:t.inputSchema||{type:'object',properties:{}}}));
    const byName=Object.fromEntries((o.tools||[]).map(t=>[t.name,t]));
    const model=laiModel(o.modelTier||'default');let text='',truncated=false,rounds=0;
    while(true){
      if(++rounds>40)throw laiErr('limit','도구 호출 라운드 한도');
      const body={model,max_tokens:LAI.max,messages:msgs};const tl=tools.slice();if(o.web&&LAI.web!==false)tl.push({type:'web_search_20250305',name:'web_search',max_uses:o.webMax||5}); // server-side web search: datasheets, pinouts
      if(tl.length)body.tools=tl;
      const res=await laiPost(body,o.signal);
      const parts=res.content||[];const tx=parts.filter(p=>p.type==='text').map(p=>p.text).join('');if(tx){text=(text?text+'\n':'')+tx;if(o.onText)try{o.onText({text,delta:tx});}catch(e){}}
      if(res.stop_reason==='max_tokens')truncated=true;
      const uses=parts.filter(p=>p.type==='tool_use');
      if(!uses.length||res.stop_reason!=='tool_use')return{text,truncated,modelApplied:res.model||model,modelTierApplied:o.modelTier||'default'};
      msgs.push({role:'assistant',content:parts});
      const results=[];
      for(const u of uses){const t=byName[u.name];let out,isErr=false;
        try{if(!t)throw new Error('unknown tool '+u.name);out=await t.execute(u.input||{},{signal:o.signal});}catch(e){isErr=true;out=String(e&&e.message||e);}
        results.push({type:'tool_result',tool_use_id:u.id,content:typeof out==='string'?out:JSON.stringify(out),is_error:isErr});}
      msgs.push({role:'user',content:results});
    }
  };
  f.json=async function(input,o){const r=await f(input,Object.assign({},o,{tools:undefined}));const s=r.text.replace(/\s*\[\d+\]/g,'');
    const m=s.match(/```(?:json)?\s*([\s\S]*?)```/)||[null,s];const raw=(m[1]||s).trim();
    try{return JSON.parse(raw);}catch(e){const i=raw.search(/[\[{]/);const j=Math.max(raw.lastIndexOf('}'),raw.lastIndexOf(']'));if(i>=0&&j>i){try{return JSON.parse(raw.slice(i,j+1));}catch(e2){}}throw laiErr('json','JSON 응답이 아닙니다: '+raw.slice(0,120));}};
  f.limits=async()=>({tools:true,images:false});
  f.local=true;
  return f;
}
/* settings sheet: API key / proxy URL / model names; shown by the [Claude 허용] button when window.claude is absent */
function laiDialogHTML(){const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  return`<div class="sheet lai" role="dialog" aria-modal="true" aria-labelledby="laiT"><div class="sheet-h"><h2 id="laiT">로컬 AI 설정 (claude.ai 밖에서 열었을 때)</h2><button type="button" class="btn sm" data-close aria-label="닫기">닫기</button></div>
<div class="sheet-b">
<p class="note">이 페이지는 claude.ai 아티팩트가 아니라서 <code>window.claude</code>가 없습니다. 대신 Anthropic Messages API를 직접 부릅니다. 비용은 API 크레딧(console.anthropic.com)에서 빠지며, claude.ai 플랜과는 별개입니다.</p>
<label class="lai-f"><span>방식</span><select id="laiMode"><option value="direct"${LAI.url?'':' selected'}>브라우저에서 직접 (API 키를 이 브라우저에 저장)</option><option value="proxy"${LAI.url?' selected':''}>프록시 서버 경유 (키는 서버에만)</option></select></label>
<label class="lai-f" id="laiKeyRow"><span>API 키</span><input id="laiKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(LAI.key)}"></label>
<label class="lai-f" id="laiUrlRow"><span>프록시 주소</span><input id="laiUrl" type="text" placeholder="http://localhost:8787" value="${esc(LAI.url)}"></label>
<details class="lai-adv"><summary>모델 이름 (등급별)</summary>
<label class="lai-f"><span>빠름</span><input id="laiQ" value="${esc(LAI.tiers.quick)}"></label>
<label class="lai-f"><span>기본</span><input id="laiD" value="${esc(LAI.tiers.default)}"></label>
<label class="lai-f"><span>고급</span><input id="laiC" value="${esc(LAI.tiers.complex)}"></label>
<label class="lai-f"><span>고정 모델</span><input id="laiM" placeholder="비우면 등급별 이름 사용" value="${esc(LAI.model)}"></label>
<label class="lai-f"><span>웹 검색</span><span><input id="laiW" type="checkbox"${LAI.web!==false?' checked':''}> 부품 번호 조회 때 Claude가 데이터시트를 웹에서 찾아 핀 배열을 읽음 (API 웹 검색 과금)</span></label></details>
<p class="note">프록시: 소스의 <code>npm run serve</code> (<code>ANTHROPIC_API_KEY</code> 환경변수)로 띄우면 <code>http://localhost:8787</code>에서 이 페이지도 같이 열립니다. 직접 방식은 키가 브라우저 localStorage에 평문으로 남으니 공용 PC에서는 쓰지 마세요.</p>
<div class="lai-act"><span id="laiMsg" class="aim-u"></span><button type="button" class="btn" data-test>연결 확인</button><button type="button" class="btn primary" data-save>저장 후 사용</button><button type="button" class="btn sm" data-clear>지우기</button></div>
</div></div>`;}
function openLocalAi(){let m=$('#laiDlg');if(!m){m=document.createElement('div');m.className='modal';m.id='laiDlg';document.body.appendChild(m);laiBind(m);}m.innerHTML=laiDialogHTML();m.hidden=false;laiModeRows();const k=$('#laiKey');if(k)k.focus();}
function laiModeRows(){const d=$('#laiMode');if(!d)return;const px=d.value==='proxy';$('#laiUrlRow').hidden=!px;$('#laiKeyRow').querySelector('span').textContent=px?'API 키 (선택 · 서버에 없을 때만)':'API 키';}
function laiRead(){LAI.key=($('#laiKey').value||'').trim();LAI.url=$('#laiMode').value==='proxy'?($('#laiUrl').value||'').trim()||'http://localhost:8787':'';LAI.model=($('#laiM').value||'').trim();LAI.web=!!($('#laiW')&&$('#laiW').checked);
  LAI.tiers={quick:$('#laiQ').value.trim()||LAI.tiers.quick,default:$('#laiD').value.trim()||LAI.tiers.default,complex:$('#laiC').value.trim()||LAI.tiers.complex};}
function laiBind(m){
  m.addEventListener('change',e=>{if(e.target.id==='laiMode')laiModeRows();});
  m.addEventListener('click',async e=>{if(e.target===m||e.target.closest('[data-close]')){m.hidden=true;return;}const b=e.target.closest('button');if(!b)return;const msg=$('#laiMsg');
    if('clear' in b.dataset){LAI.key='';LAI.url='';LAI.model='';laiSave();CLI.sample=undefined;await cliAiProbe();aimPaint();m.innerHTML=laiDialogHTML();laiModeRows();return;}
    laiRead();
    if(!LAI.key&&!LAI.url){msg.textContent='API 키 또는 프록시 주소가 필요합니다.';return;}
    if('test' in b.dataset){msg.textContent='확인 중…';b.disabled=true;
      try{const f=laiBuild();const r=await f('Reply with the single word OK.',{modelTier:'quick'});msg.textContent='연결됨 · '+(r.modelApplied||'')+' · '+String(r.text).slice(0,20);}
      catch(err){msg.textContent='실패: '+(err.message||err.code);}b.disabled=false;return;}
    if('save' in b.dataset){laiSave();CLI.sample=undefined;await cliAiProbe();aimPaint();m.hidden=true;
      if(typeof copSay==='function')copSay(CLI.sample?'ok':'err',CLI.sample?`로컬 AI 사용: ${LAI.url?'프록시 '+LAI.url:'브라우저에서 직접'} · 모델 ${laiModel(AIM.tier)}. 이제 문장형 요청을 Claude가 해석합니다.`:'로컬 AI를 켜지 못했습니다.');}
  });
}
