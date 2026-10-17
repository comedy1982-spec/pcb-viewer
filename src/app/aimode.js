/* ---------- execution mode shared by the layout and schematic consoles ----------
   'det' (deterministic): commands and buttons run the built-in algorithms; sentences are read by simple rules.
   'ai': sentences, buttons and "guide check" go to Claude, which drives the same commands as a tool.
   Every Claude call reports the model tier that answered and an estimate of the tokens it read and wrote. */
var AIM={mode:'det',tier:'default',calls:0,inTok:0,outTok:0,last:null};
try{const v=JSON.parse(localStorage.getItem('pcbv.aimode')||'null');if(v){if(v.mode==='ai'||v.mode==='det')AIM.mode=v.mode;if(/^(quick|default|complex)$/.test(v.tier))AIM.tier=v.tier;}}catch(e){}
const AIM_TIERS=[['quick','빠름','Haiku급'],['default','기본','Sonnet급'],['complex','고급','Opus급']];
const aimTierLabel=t=>{const x=AIM_TIERS.find(q=>q[0]===t);return x?`${x[1]} (${x[2]})`:String(t||'?');};
function aimSave(){try{localStorage.setItem('pcbv.aimode',JSON.stringify({mode:AIM.mode,tier:AIM.tier}));}catch(e){}}
// rough token count: the page is not told the real numbers, so this is an estimate from the text sent and received
function aimTok(s){s=String(s||'');let a=0,k=0,o=0;for(const ch of s){const c=ch.codePointAt(0);if(c<128)a++;else if((c>=0xAC00&&c<=0xD7A3)||(c>=0x3040&&c<=0x9FFF))k++;else o++;}return Math.round(a/3.8+k*1.1+o*0.6);}
const AIM_OVERHEAD=450; // platform framing + tool schema per round (estimate)
const aimFmt=n=>n>=10000?(n/1000).toFixed(1)+'k':n.toLocaleString();
// header controls for a console: mode switch, model tier, running usage
function aimControls(){return`<span class="aim" role="group" aria-label="실행 방식"><button type="button" class="aim-b" data-aim="det" title="내장 알고리즘으로 계산 (Claude 사용 안 함)">결정론</button><button type="button" class="aim-b" data-aim="ai" title="Claude가 명령을 골라 실행 (보는 사람의 Claude 사용량)">AI</button></span>
  <select class="aim-t" aria-label="AI 모델 등급" title="AI 모드에서 쓸 모델 등급">${AIM_TIERS.map(([k,l,m])=>`<option value="${k}">${l} · ${m}</option>`).join('')}</select>
  <span class="aim-u" title="이 페이지는 실제 토큰·크레딧 값을 받지 못해 보낸·받은 글자 수로 추정합니다. 사용량은 보는 사람의 Claude 플랜 한도에서 차감됩니다."></span>`;}
function aimBind(root){root.querySelectorAll('[data-aim]').forEach(b=>b.addEventListener('click',()=>{AIM.mode=b.dataset.aim;aimSave();aimPaint();if(AIM.mode==='ai')cliAiProbe().then(aimPaint);}));
  const t=root.querySelector('.aim-t');if(t)t.addEventListener('change',()=>{AIM.tier=t.value;aimSave();aimPaint();});aimPaint();}
function aimPaint(){document.querySelectorAll('.aim-b').forEach(b=>{b.classList.toggle('on',b.dataset.aim===AIM.mode);b.setAttribute('aria-pressed',b.dataset.aim===AIM.mode?'true':'false');});
  document.querySelectorAll('.aim-t').forEach(t=>{t.value=AIM.tier;t.hidden=AIM.mode!=='ai';});
  document.querySelectorAll('.aim-u').forEach(u=>{u.textContent=AIM.calls?`AI ${AIM.calls}회 · 토큰(추정) 입력 ~${aimFmt(AIM.inTok)} / 출력 ~${aimFmt(AIM.outTok)}`:(AIM.mode==='ai'?(CLI.sample===null?'AI 사용 불가 · 규칙으로 해석':CLI.sample?'AI 대기':'AI 확인 중…'):'');});
  document.querySelectorAll('.cli-in input').forEach(i=>{i.dataset.mode=AIM.mode;});}
/* one Claude run: the model calls `run` with console commands until it answers */
async function aiAgent(o){
  // o: {prompt, toolName, toolDesc, example, run(cmd)→text, allowed(cmd)→error|'' , say(k,t)→entry, set(entry,t), drop(entry), setAbort(ctl), stopped()→bool, max}
  await cliAiProbe();if(!CLI.sample)return false;
  const ans=o.say('ai','Claude가 생각하는 중…');const ctl=new AbortController();o.setAbort(ctl);
  const U={tier:AIM.tier,applied:null,model:null,calls:0,rounds:1,inTok:0,outTok:0,t0:performance.now(),spent:true,note:''};
  let ctx=aimTok(o.prompt)+AIM_OVERHEAD;U.inTok=ctx;
  const runOne=async c=>{const err=o.allowed(c);if(err)throw new Error(err);o.say('cmd',c+'   (Claude)');
    try{const out=await o.run(c);if(out)o.say('ok',out);return String(out||'done').slice(0,3500);}catch(e){o.say('err',e.message||String(e));throw e;}};
  try{
    if(CLI.tools!==false){
      const tool={name:o.toolName,description:o.toolDesc,inputSchema:{type:'object',properties:{command:{type:'string',description:'One command line, e.g. '+o.example}},required:['command']},
        execute:async(inp,cx)=>{const c=String(inp&&inp.command||'').trim();if(!c)throw new Error('empty command');if(++U.calls>(o.max||10))throw new Error('command limit reached');if(cx&&cx.signal&&cx.signal.aborted)throw new Error('stopped');
          const callTok=aimTok(c)+40;U.outTok+=callTok;U.rounds++;let res;
          try{res=await runOne(c);}catch(e){ctx+=callTok+aimTok(e.message)+20;U.inTok+=ctx;throw e;}
          ctx+=callTok+aimTok(res)+20;U.inTok+=ctx;return res;}};
      const r=await CLI.sample(o.prompt,{tools:[tool],signal:ctl.signal,modelTier:AIM.tier,onText:({text})=>o.set(ans,text)});
      U.outTok+=aimTok(r.text);U.applied=r.modelTierApplied||null;U.model=r.modelApplied||null;if(r.truncated)U.note='답이 길이 한도에서 잘림';
      if(U.calls){o.drop(ans);o.say('ai',r.text||'(응답 없음)');}else o.set(ans,r.text||'(응답 없음)');
    }else{
      const p2=o.prompt+'\n\nReturn ONLY JSON: {"commands":["..."],"note":"Korean one-line plan"}';U.inTok=aimTok(p2)+AIM_OVERHEAD;
      const plan=await CLI.sample.json(p2,{signal:ctl.signal,cache:false,modelTier:AIM.tier});U.outTok+=aimTok(JSON.stringify(plan));
      const list=(plan&&Array.isArray(plan.commands)?plan.commands:[]).slice(0,o.max||8).map(String);o.set(ans,(plan&&plan.note?plan.note+'\n':'')+'실행: '+list.join(' → '));
      for(const c of list){try{await runOne(c);}catch(e){}if(o.stopped())break;}
    }
  }catch(e){
    if(e&&e.code==='cancelled'){o.set(ans,(e.text||'')+'\n(중지됨)');U.note='중지됨';}
    else if(e&&/^(not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed)$/.test(e.code||'')){CLI.sample=null;U.spent=false;o.set(ans,'Claude 사용이 허용되지 않았습니다. 결정론 모드로 실행하세요.');aimPaint();}
    else if(e&&e.code==='tools_unavailable'){CLI.tools=false;U.spent=false;o.set(ans,'이 화면에서는 Claude 도구 호출을 쓸 수 없어 계획만 받아 실행합니다. 다시 실행해 주세요.');}
    else if(e&&e.code==='rate_limited'){U.spent=!!e.text;o.set(ans,'Claude 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도하거나 결정론 모드로 실행하세요.');}
    else{o.set(ans,(e&&e.text?e.text+'\n':'')+'Claude 호출 실패: '+(e&&(e.message||e.code)||e));U.note='실패';}
  }
  if(U.spent){AIM.calls++;AIM.inTok+=U.inTok;AIM.outTok+=U.outTok;AIM.last=U;
    const sec=((performance.now()-U.t0)/1000).toFixed(1);
    o.say('use',`모델 ${aimTierLabel(U.applied||U.tier)}${U.model?' · '+U.model:''}${U.applied&&U.applied!==U.tier?` (요청 ${aimTierLabel(U.tier)} → 플랜에 맞춰 대체)`:''} · 라운드 ${U.rounds} · 명령 ${U.calls}개 · 토큰(추정) 입력 ~${aimFmt(U.inTok)} / 출력 ~${aimFmt(U.outTok)} · ${sec} s${U.note?' · '+U.note:''}\n누적 AI ${AIM.calls}회 · 입력 ~${aimFmt(AIM.inTok)} / 출력 ~${aimFmt(AIM.outTok)} 토큰(추정) · 크레딧은 보는 사람의 Claude 플랜 사용량에서 차감 (페이지에서 정확한 값은 알 수 없음)`);aimPaint();}
  return true;
}

/* ---------- design guidelines in the consoles (GUIDE engine) ---------- */
const GUIDE_ICON={pass:'✓',fail:'✕',partial:'△',manual:'?',na:'–'};
const GUIDE_WORD={pass:'준수',fail:'미준수',partial:'일부',manual:'수동 확인',na:'해당 없음'};
function guideText(r,mode){
  const L=[`가이드라인 점검 · ${r.scope==='sch'?'회로':r.scope==='all'?'PCB+회로':'PCB'} · 프리셋 ${r.presetLabel} · ${mode==='ai'?'AI 검토':'결정론'}`,
    `준수율 ${r.pct.toFixed(1)}% (가중치 반영) · 최우선 미해결(P0/P1) ${r.crit}건 · 준수 ${r.passed}/${r.applicable}${r.manual?` · 수동 확인 ${r.manual}`:''} · 판정: ${r.verdict}`];
  r.rules.forEach(x=>{const sc=x.status==='na'||x.status==='manual'?'-':`${(x.w*(x.score!=null?x.score:x.status==='pass'?1:0)).toFixed(1)}/${x.w}`;
    L.push(`#${x.rank} ${x.prio.split(' ')[0]} ${GUIDE_ICON[x.status]} ${GUIDE_WORD[x.status]} · ${x.title} [${x.key} · 중요도 ${x.w} · ${sc}]`);
    L.push(`    ${x.ev}${x.by?` · ${x.by==='ai'?'AI':'사용자'} 판정${x.note?': '+x.note:''}`:''}${x.fix&&x.status!=='pass'&&x.status!=='na'?`\n    → ${x.fix}`:''}`);});
  return L.join('\n');}
function guideRun(a,scope,ctx){
  const B=BD;const sub=(a._[0]||'check').toLowerCase();const sheets=()=>BD.schSheets||(typeof schData==='function'&&schData()?schData().sheets:null);
  if(sub==='rules')return GUIDE.RULES.filter(r=>scope==='all'||r.scope===scope||a.all).map(r=>{const w=GUIDE.state(B).w[r.key];return`${r.key.padEnd(15)} ${GUIDE.prio(w).label} · 중요도 ${w} · [${r.cat}] ${r.title}\n    ${r.desc}\n    참조: ${r.ref}`;}).join('\n');
  if(sub==='presets')return Object.entries(GUIDE.PRESETS).map(([k,v])=>`${k.padEnd(10)} ${v.label}${GUIDE.state(B).preset===k?'  ← 지금':''}`).join('\n');
  if(sub==='preset'){const k=GUIDE.setPreset(B,a._[1]);return`프리셋 ${k} (${GUIDE.PRESETS[k].label}) — 중요도를 바꿨습니다. guide check로 다시 점검하세요.`;}
  if(sub==='weight'){const w=GUIDE.setWeight(B,a._[1],a._[2]);return`${a._[1]} 중요도 ${w} (${GUIDE.prio(w).label})`;}
  if(sub==='set'){const st=String(a._[2]||'').toLowerCase();const o=GUIDE.set(B,a._[1],st,a.note?String(a.note):a._.slice(3).join(' '),ctx&&ctx.by||'user');return o?`${a._[1]} → ${GUIDE_WORD[o.status]}${o.note?' ('+o.note+')':''} · 판정자 ${o.by==='ai'?'AI':'사용자'}`:`${a._[1]} → 자동 판정으로 되돌림`;}
  if(sub==='show'){const r=GUIDE.evaluate(B,{scope:'all',sheets:sheets()}).rules.find(x=>x.key===a._[1]);if(!r)throw new Error('알 수 없는 규칙: '+a._[1]);
    return`${r.title} [${r.key}] · ${r.prio} · 중요도 ${r.w}\n${r.desc}\n참조: ${r.ref}\n상태: ${GUIDE_WORD[r.status]}${r.score!=null?` (점수 ${r.score.toFixed(2)})`:''}\n근거: ${r.ev}${r.fix?`\n조치: ${r.fix}`:''}${r.manualNote?`\n자동으로 못 보는 부분: ${r.manualNote}`:''}${r.by?`\n수동 판정: ${r.by==='ai'?'AI':'사용자'} → ${GUIDE_WORD[r.status]} (자동 판정 ${GUIDE_WORD[r.auto.status]})${r.note?' · '+r.note:''}`:''}`;}
  if(sub==='check'){if(a.preset)GUIDE.setPreset(B,a.preset);return GUIDE.evaluate(B,{scope:a.all?'all':scope,sheets:sheets()});}
  throw new Error('guide [check|rules|presets|preset <이름>|weight <규칙> <1-10>|set <규칙> pass|fail|na|auto [--note 메모]|show <규칙>]');
}
const GUIDE_HELP=['guide [check] [--preset motor|ecu|highspeed|default] [--all] [--ai|--det] · guide rules · guide presets · guide preset <이름> · guide weight <규칙> <1-10> · guide set <규칙> pass|fail|na|auto [--note 메모] · guide show <규칙>','설계 가이드라인 점검: 규칙별 P0–P3 우선순위·가중치·준수율·판정. 결정론은 보드·회로도에서 자동 판정, AI 모드는 결과를 Claude가 검토해 수동 확인 항목을 판단하고 개선 명령을 제안'];
const GUIDE_AI=`You are reviewing a PCB / schematic design-guideline check inside a viewer. The deterministic results are below. Your job:
1. For rules marked "수동 확인" (manual) or "일부" (partial), decide only when the evidence lines (or one extra inspection command) justify it, and record it with "guide set <key> pass|fail --note \\"짧은 근거\\""; otherwise leave them for the user.
2. Do not change the board or schematic unless the user explicitly asked for fixes.
3. Answer in Korean, short: the verdict, then the top 3 fixes in priority order, each with the exact console command(s) that would apply it. Never invent numbers.`;
