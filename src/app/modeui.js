/* ---------- app modes: 첫 화면 (home) · 신규 설계 (steps: 1 시스템 → 2 회로 → 3 PCB → 4 기구) · 기존 프로젝트 (viewer) ----------
   The step mode shows only what the step needs: step 1 has the requirement and the HW block diagram (no PCB conditions, no
   정보/시뮬레이션), step 2 the circuit-variant choice, schematic and datasheet DB (no 3D/TOP/BOTTOM), step 3+ the full board tools.
   The viewer mode is the full board viewer for files and examples. */
var APP={mode:'home'};
function modeTabs(){if(!APP)return['ai'];if(APP.mode==='steps'){const st=stepCur();if(st===1)return['ai'];if(st===2)return['ai','ds'];}return['ai','info','sim','ds'];}
function modePaint(){
  if(!APP)return;const m=APP.mode,st=typeof stepCur==='function'?stepCur():0;
  const home=$('#home');if(home)home.hidden=m!=='home';
  const work=$('.work');if(work)work.hidden=m==='home';
  const hd=$('#hDock');if(hd)hd.hidden=m==='home';
  const steps=$('.steps');if(steps)steps.hidden=m!=='steps';
  const early=m==='steps'&&st>0&&st<3;
  const ws=$('.seg.ws');if(ws)ws.hidden=m==='home'||early;
  const bc=$('#boardCtl');if(bc)bc.hidden=m==='home'||early;
  const tg=$('#dockTg');if(tg)tg.hidden=m==='home';
  document.body.dataset.mode=m;document.body.dataset.step=m==='steps'?String(st):'';
  const hb=$('#homeBtn');if(hb)hb.setAttribute('aria-pressed',m==='home'?'true':'false');
  if(typeof dockPaint==='function')dockPaint();}
function setMode(m){APP.mode=m;modePaint();if(m!=='home'){measure.done=0;setTimeout(()=>{relayoutViews();if(typeof stepPaint==='function')stepPaint();},0);}}
// 신규 설계: an empty project board so the header, dock and steps start clean; the real board arrives from step 2
function newProject(){
  NP.plan=null;NP.arch=null;NP.hist=[];NP.answers={};NP.variants=null;NP.vkey=null;NP.chooser=false;NP.picked=null;NP.planManual=false;SYS.src=null;SYS.sel=null;
  $('#npName').value='';$('#npReq').value='';
  const B=PCB.finalize(PCB.fromSpec({board:{name:'새 프로젝트',width:40,height:30,thickness:1.6,corner:2},components:[]}));B.blank=true;B.pcbPending=true;B.source='신규 설계';B.pid='p-'+Date.now().toString(36);
  setBoard(B);APP.mode='steps';setStep(1);setTimeout(()=>{const i=$('#npReq');if(i)i.focus();},50);
  copSay('out','신규 설계를 시작합니다. 왼쪽에 프로젝트 이름과 요구사항(무엇을 만들지 · 입력 전원 · 통신 · 구동/센싱 · 안전 등급)을 적고 [블록 다이어그램 만들기]를 누르거나, 여기 바로 적어 보내세요. 빠진 정보는 제가 물어봅니다.');}
function openViewer(ex){
  if(ex){loadExample(ex);}
  APP.mode='viewer';setWorkspace('board');setMode('viewer');
  if(!ex&&(!BD||BD.blank||BD.source==='신규 설계'))openImport();}
$('#homeNew').addEventListener('click',newProject);
$('#homeOpen').addEventListener('click',()=>openViewer(null));
$('#home').addEventListener('click',e=>{const b=e.target.closest('[data-hex]');if(b)openViewer(b.dataset.hex);});
$('#homeBtn').addEventListener('click',()=>{if(APP.mode==='home'){if(BD&&!BD.blank)setMode(NP.plan&&NP.plan.blocks.length?'steps':'viewer');return;}setMode('home');});
// a file loaded from the import dialog while on the home screen opens the viewer
const _impGo=$('#impGo');if(_impGo)_impGo.addEventListener('click',()=>{if(APP.mode==='home')setTimeout(()=>{if(BD&&!BD.blank)setMode('viewer');},80);});
