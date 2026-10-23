/* Text-to-CAD for the protective housing.
   A small command language edits the housing model (conditions, overrides, features), and a rule-based reader turns
   Korean / English sentences into those commands. The AI mode of the console sends the same commands through Claude.
   State: {inp:{P,ip,vib,ta,tmax,tj,mat,tim,concept}, cad:{over:{wall,corner,stand,top,gap,split}, feats:[…], seq}} — pure data,
   so every command is undoable by snapshot and testable without the page. */
const TEXT2CAD=(function(){
"use strict";
const SIDES={W:'W',E:'E',S:'S',N:'N',T:'T',B:'B',LEFT:'W',RIGHT:'E',FRONT:'S',BACK:'N',REAR:'N',TOP:'T',COVER:'T',LID:'T',BOTTOM:'B',FLOOR:'B',BASE:'B'};
const SIDE_RE=[[/왼쪽|좌측|왼편|좌면|\bleft\b|\bwest\b/i,'W'],[/오른쪽|우측|오른편|우면|\bright\b|\beast\b/i,'E'],[/앞|전면|정면|\bfront\b|\bsouth\b/i,'S'],[/뒤|후면|뒷면|배면|\bback\b|\brear\b|\bnorth\b/i,'N'],
  [/윗면|상면|커버|뚜껑|위쪽\s*면|\btop\b|\bcover\b|\blid\b/i,'T'],[/바닥|하면|밑면|아래\s*면|\bbottom\b|\bfloor\b/i,'B']];
const GLAND={M12:12.5,M16:16.5,M20:20.5,M25:25.5,M32:32.5,PG7:12.7,PG9:15.4,PG11:18.8,PG13:20.6};
const OVER={wall:'벽 두께',corner:'모서리 R',stand:'보드 아래 스탠드오프',top:'보드 위 여유',gap:'보드–벽 간격',split:'분할면 높이 z'};
const HELP=[
  ['status · check','현재 설계 전체 보고 (재질·방열·실링·체결·진동·형상·경고)'],
  ['compare','재질 6종 비교'],
  ['set power|ip|vib|ta|tmax|tj|mat|tim <값|auto>','설계 조건: 발열 W · IP · 진동 Grms · 주위/PCB/Tj 온도 · 재질 · 방열 패드'],
  ['set concept A|B|C|D|auto','하우징 시안: A 다이캐스팅 알루미늄 · B PC/ABS 사출 스냅핏 · C 압출 프로파일+엔드 플레이트 · D 하이브리드(알루미늄 베이스+플라스틱 커버) · auto 조건에 맞춰 선택'],
  ['set wall|corner|stand|top|gap|split <mm|auto>','형상 직접 지정: 벽 두께 · 세로 모서리 R · 아래 스탠드오프 · 위 여유 · 보드–벽 간격 · 분할면 z'],
  ['fillet <top|bottom|vertical|all> <R mm|off> · chamfer <top|bottom|vertical|all> <C mm|off>','외곽 모서리 처리: fillet = 둥근모따기(R), chamfer = 각모따기(C). top = 커버 윗면 둘레, bottom = 바닥 둘레, vertical = 세로 모서리 4곳, all = 셋 다'],
  ['hole <면> --d <mm> [--u <mm>] [--z <mm>] [--n 2 --pitch 20] [--label 이름]','원형 구멍. 면: left right front back top bottom (W E S N T B). u = 벽 시작에서의 거리, z = 높이(보드 중간면 0)'],
  ['gland <면> [M16|M20|PG9…] [--u --z --n]','케이블 글랜드 구멍 (IP 유지)'],
  ['vent <면> [--d 12.5]','ePTFE 벤트 구멍'],
  ['slot <면> --w <mm> --h <mm> [--u --z] [--label 이름]','사각 구멍'],
  ['tabs <2|4|off> [--screw M5] [--w 16] [--len 14] [--sides WE|SN]','하우징 장착 탭 (바닥면, 나사 구멍)'],
  ['boss <x> <y> [--d 3.2] · boss center','PCB 지지 보스 추가 (보드 좌표)'],
  ['rib x|y [위치] [--h 3]','바닥 보강 리브'],
  ['fins <개수> [--h 15] [--pitch 8] · fins off · fins auto','커버 방열 핀'],
  ['label "<글자>" [--size 6] [--u --v]','커버 윗면 각인'],
  ['edit <F번호> [--d --w --h --u --z --side --label | --screw --len --n --sides | --x --y | --pos --axis | --size --text --pitch]','이미 있는 형상의 치수·위치 수정 (구멍 지름, 사각 구멍 크기, 위치 u/z, 면, 탭 나사, 보스 좌표, 리브 위치, 핀 수·높이, 각인 글자). 상대 이동은 --du/--dz (mm)'],
  ['list · del <F번호|all> · reset','형상 목록 · 삭제 · 전부 초기화'],
  ['undo · redo','실행 취소 · 다시 실행'],
  ['show · open · close','3D에서 하우징 보기 · 커버 열기 · 닫기'],
  ['export [zip|scad|stl|step]','CAD 내보내기 (zip: SCAD+STEP+STL+보고서 · step: 베이스·커버 STEP 솔리드)'],
  ['ai <문장>','Claude가 위 명령으로 설계 (AI 모드). 결정론 모드에서는 문장을 규칙으로 명령으로 바꿉니다']];
const CMDS=new Set(['edit','fillet','chamfer','round','help','status','check','compare','set','hole','gland','vent','slot','tabs','boss','rib','fins','label','list','feats','del','delete','reset','undo','redo','show','hide','open','close','export','ai','clear']);
function tok(s){const out=[];const re=/"([^"]*)"|“([^”]*)”|'([^']*)'|(\S+)/g;let m;while((m=re.exec(s)))out.push(m[1]!=null?m[1]:m[2]!=null?m[2]:m[3]!=null?m[3]:m[4]);return out;}
function args(t){const a={_:[]};for(let i=0;i<t.length;i++){const x=t[i];if(/^--/.test(x)){const[k,v]=x.slice(2).split('=');if(v!=null)a[k]=v;else if(t[i+1]!=null&&!/^--/.test(t[i+1]))a[k]=t[++i];else a[k]=true;}else a._.push(x);}return a;}
const side=v=>{const k=String(v||'').toUpperCase();if(SIDES[k])return SIDES[k];for(const[re,s]of SIDE_RE)if(re.test(String(v||'')))return s;return null;};
const num=(v,nm)=>{const n=parseFloat(v);if(!isFinite(n))throw new Error(`${nm||'값'}: 숫자가 필요합니다 (${v==null?'없음':v})`);return n;};
const optNum=v=>v==null||v===true||v===''?null:num(v);
function blank(){return{over:{},feats:[],seq:0,edge:{}};}
function norm(st){if(!st.cad)st.cad=blank();if(!st.cad.over)st.cad.over={};if(!st.cad.feats)st.cad.feats=[];if(!st.cad.edge)st.cad.edge={};if(!st.cad.seq)st.cad.seq=st.cad.feats.reduce((m,f)=>Math.max(m,+String(f.id||'F0').slice(1)||0),0);return st;}
function add(st,f){st.cad.seq++;f.id='F'+st.cad.seq;st.cad.feats.push(f);return f;}
const SK={W:'왼쪽 벽',E:'오른쪽 벽',S:'앞 벽',N:'뒤 벽',T:'커버 윗면',B:'바닥'};
const EDGE_KO={T:'커버 윗면 둘레',B:'바닥 둘레',V:'세로 모서리 4곳'};
// which outer edges a word names: top/bottom/vertical/all (several allowed, comma or + separated)
function edgeSet(v){const s=String(v||'').toLowerCase();if(!s||/^(all|전체|전부|모두|모든|외곽|outer|every)$/.test(s))return['T','B','V'];const out=[];
  s.split(/[,+/]/).forEach(w=>{if(/^(top|t|윗면|상면|커버|위|upper|lid|cover)$/.test(w))out.push('T');else if(/^(bottom|b|바닥|하면|밑면|아래|lower|base|floor)$/.test(w))out.push('B');else if(/^(vertical|v|세로|수직|corner|corners|코너|side|sides)$/.test(w))out.push('V');else if(/^(all|전체|전부|모두|외곽)$/.test(w))out.push('T','B','V');});
  return out.length?[...new Set(out)]:null;}
// current edge treatment as text, e.g. "세로 R3 · 윗면 R2 · 바닥 C1"
function edgeText(C){const E=(C&&C.edge)||{},O=(C&&C.over)||{};const v=O.corner!=null?+O.corner:3;
  return[`세로 ${v>0?(E.V==='chamfer'?'C':'R')+v:'없음'}`,...['T','B'].map(k=>E[k]&&E[k].r>0?`${k==='T'?'윗면':'바닥'} ${E[k].k==='chamfer'?'C':'R'}${E[k].r}`:null).filter(Boolean)].join(' · ');}
/* one command. H = HOUSING (materials, TIMs, IP keys). Returns {out, action?, mutated} */
function exec(st,line,H){norm(st);const t=tok(line);const cmd=(t[0]||'').toLowerCase();const a=args(t.slice(1));const I=st.inp,C=st.cad;const ok=(out,extra)=>Object.assign({out,mutated:true},extra||{});
  switch(cmd){
    case'help':return{out:HELP.map(([c,d])=>`${c}\n    ${d}`).join('\n')};
    case'status':case'check':return{out:'',action:'report'};
    case'compare':return{out:'',action:'compare'};
    case'list':case'feats':return{out:C.feats.length?C.feats.map(f=>'  '+(H&&H.featLabel?H.featLabel(f):f.id+' '+f.type)).join('\n')+`\n  모서리: ${edgeText(C)}`+(Object.keys(C.over).length?`\n  지정값: ${Object.entries(C.over).map(([k,v])=>`${OVER[k]||k} ${v}`).join(' · ')}`:''):'추가한 형상이 없습니다. (자동 설계만 적용)'};
    case'show':case'hide':case'open':case'close':return{out:'',action:cmd};
    case'export':{const k=String(a._[0]||'zip').toLowerCase();if(!/^(zip|scad|stl|step)$/.test(k))throw new Error('export zip|scad|stl|step');return{out:'',action:'export',kind:k};}
    case'undo':case'redo':case'clear':return{out:'',action:cmd};
    case'reset':st.cad=blank();return ok('형상 지정값과 추가 형상을 모두 지웠습니다 (설계 조건은 유지).');
    case'del':case'delete':{const id=String(a._[0]||'').toUpperCase();if(id==='ALL'){const n=C.feats.length;C.feats=[];return ok(`형상 ${n}개를 지웠습니다.`);}
      const i=C.feats.findIndex(f=>f.id===id);if(i<0)throw new Error(`형상 ${id||'?'}가 없습니다 — list로 번호를 보세요.`);const f=C.feats.splice(i,1)[0];return ok(`${f.id} 삭제`);}
    case'set':{const k=String(a._[0]||'').toLowerCase(),v=a._.slice(1).join(' ');if(!k||v==='')throw new Error('set <키> <값> — help 참고');
      const auto=/^(auto|자동)$/i.test(v);
      if(/^(power|p|발열)$/.test(k)){I.P=auto?'auto':num(v,'발열');return ok(`발열 ${auto?'자동':I.P+' W'}`);}
      if(k==='ip'){const ip=H.ipKey(v);if(!ip)throw new Error('IP: '+H.IPS.join(' · '));I.ip=ip;return ok(`보호 등급 ${ip}`);}
      if(/^(vib|진동)$/.test(k)){I.vib=num(v,'진동');return ok(`진동 ${I.vib} Grms`);}
      if(/^(ta|tmax|tj)$/.test(k)){I[k]=num(v,k);return ok(`${{ta:'주위 온도',tmax:'PCB 한계 온도',tj:'부품 Tj 한계'}[k]} ${I[k]} °C`);}
      if(/^(mat|material|재질)$/.test(k)){const m=auto?'auto':matKey(v,H);if(!m)throw new Error('재질: auto · '+Object.keys(H.MATS).join(' · '));I.mat=m;return ok(`재질 ${m==='auto'?'자동 (조건 만족 · 최저 원가)':H.MATS[m].label}`);}
      if(/^(tim|pad|방열패드)$/.test(k)){const m=auto?'auto':/^(none|off|없음)$/i.test(v)?'none':H.TIMS[v]?v:null;if(!m)throw new Error('TIM: auto · none · '+Object.keys(H.TIMS).join(' · '));I.tim=m;return ok(`방열 패드 ${m==='auto'?'자동':m==='none'?'사용 안 함':H.TIMS[m].label}`);}
      if(k==='corner'&&!auto&&C.edge.V==='chamfer'&&/^r/i.test(v))delete C.edge.V;
      if(OVER[k]){if(auto)delete C.over[k];else C.over[k]=num(k==='corner'?v.replace(/^[rc]\s*/i,''):v,OVER[k]);return ok(`${OVER[k]} ${auto?'자동':C.over[k]+(k==='split'?'':' mm')}`);}
      if(/^(concept|시안|컨셉)$/.test(k)){const c=auto?'auto':String(v).trim().toUpperCase().replace(/^시안\s*/,'');if(c!=='auto'&&!(H.CONCEPTS&&H.CONCEPTS[c]))throw new Error('시안: auto · '+Object.keys(H.CONCEPTS||{}).map(x=>x+' '+H.CONCEPTS[x].short).join(' · '));I.concept=c;return ok(`시안 ${c==='auto'?'자동 (재질·조건에 맞춰 선택)':c+' · '+H.CONCEPTS[c].label}`);}
      throw new Error(`모르는 키: ${k} — power ip vib ta tmax tj mat tim concept wall corner stand top gap split`);}
    case'hole':case'gland':case'vent':{const sd=side(a._[0])||(cmd==='vent'?'N':'E');let d,label,kind;
      if(cmd==='gland'){const sz=String(a._.find(x=>/^(m|pg)\d+$/i.test(x))||a.size||'M16').toUpperCase();d=GLAND[sz]||num(sz.replace(/\D/g,''))+0.5;label=`케이블 글랜드 ${sz}`;kind='gland';}
      else if(cmd==='vent'){d=optNum(a.d)||12.5;label='ePTFE 벤트';kind='vent';}
      else{d=num(a.d!=null?a.d:a._[1],'지름(--d)');label=a.label&&a.label!==true?String(a.label):'구멍';kind=a.kind&&a.kind!==true?String(a.kind):(/글랜드|gland/i.test(label)?'gland':/벤트|vent/i.test(label)?'vent':'hole');}
      if(!(d>0&&d<200))throw new Error('지름이 이상합니다: '+d);
      const n=Math.max(1,Math.min(12,Math.round(optNum(a.n)||1))),pitch=optNum(a.pitch)||Math.max(d+6,d*1.8);const u0=optNum(a.u),z=optNum(a.z!=null?a.z:a.v);const made=[];
      for(let i=0;i<n;i++){const off=(i-(n-1)/2)*pitch;made.push(add(st,{type:'hole',side:sd,d:+d.toFixed(2),u:u0!=null?u0+i*pitch:null,du:u0==null&&n>1?off:null,v:z,label,kind}));}
      return ok(`${made.map(f=>f.id).join(', ')}: ${SK[sd]}에 ${label} Ø${d}${n>1?` × ${n} (피치 ${pitch} mm)`:''}`);}
    case'slot':{const sd=side(a._[0])||'E';const w=num(a.w!=null?a.w:a._[1],'폭(--w)'),h=num(a.h!=null?a.h:a._[2],'높이(--h)');
      const f=add(st,{type:'slot',side:sd,w,h,u:optNum(a.u),v:optNum(a.z!=null?a.z:a.v),label:a.label&&a.label!==true?String(a.label):'사각 구멍',kind:a.kind&&a.kind!==true?String(a.kind):'hole'});return ok(`${f.id}: ${SK[sd]}에 ${f.label} ${w} × ${h} mm`);}
    case'tabs':{const v=String(a._[0]||'4').toLowerCase();C.feats=C.feats.filter(f=>f.type!=='tabs');if(/^(off|none|없음|0)$/.test(v))return ok('장착 탭 제거');
      const n=num(v,'개수')>=3?4:2;const sc=String(a.screw||'M5').toUpperCase();if(!H.SCREW_D[sc])throw new Error('나사: '+Object.keys(H.SCREW_D).join(' · '));
      const f=add(st,{type:'tabs',n,screw:sc,w:optNum(a.w)||16,len:optNum(a.len)||14,t:optNum(a.t),sides:/^sn$/i.test(a.sides||'')?'SN':'WE'});return ok(`${f.id}: 장착 탭 ${n}개 (${sc}, ${f.sides==='WE'?'좌우':'앞뒤'})`);}
    case'boss':{let x,y;if(/^(center|centre|가운데|중앙)$/i.test(a._[0]||'')){x=null;y=null;}else{x=num(a._[0],'x');y=num(a._[1],'y');}
      const f=add(st,{type:'boss',x,y,d:optNum(a.d)||3.2,center:x==null});return ok(`${f.id}: PCB 지지 보스 ${x==null?'(보드 가운데)':`(${x}, ${y})`}`);}
    case'rib':{const ax=/^y$/i.test(a._[0]||'')?'y':'x';const f=add(st,{type:'rib',axis:ax,pos:optNum(a._[1]),h:optNum(a.h)||3,t:optNum(a.t)||2});return ok(`${f.id}: 바닥 리브 (${ax} 방향${f.pos!=null?`, 위치 ${f.pos}`:', 가운데'})`);}
    case'fins':{const v=String(a._[0]||'').toLowerCase();C.feats=C.feats.filter(f=>f.type!=='fins');if(/^(auto|자동)$/.test(v))return ok('방열 핀: 자동 (열 여유 부족할 때만)');
      if(/^(off|none|없음|0)$/.test(v)){const f=add(st,{type:'fins',off:true});return ok(`${f.id}: 방열 핀 없음`);}
      const f=add(st,{type:'fins',n:Math.round(num(v,'개수')),h:optNum(a.h)||12,pitch:optNum(a.pitch)});return ok(`${f.id}: 커버 방열 핀 ${f.n}개 · 높이 ${f.h} mm`);}
    case'label':{const txt=a._.join(' ').trim();if(!txt)throw new Error('label "글자"');C.feats=C.feats.filter(f=>f.type!=='label');
      const f=add(st,{type:'label',text:txt.slice(0,40),size:optNum(a.size)||6,u:optNum(a.u),v:optNum(a.v)});return ok(`${f.id}: 커버 윗면에 "${f.text}" 각인 (${f.size} mm)`);}
    case'fillet':case'round':case'chamfer':{const kind=cmd==='chamfer'?'chamfer':'fillet';let w=a._[0],v=a._[1];
      if(w!=null&&/^[rc]?\d/i.test(w)&&v==null){v=w;w='all';}
      const es=edgeSet(w==null?'all':w);if(!es)throw new Error(`${cmd} <top|bottom|vertical|all> <mm|off> — 모르는 모서리: ${w}`);
      if(v==null||v===true)throw new Error(`${cmd} ${w} <mm|off> — 크기가 필요합니다`);
      const off=/^(off|none|없음|0)$/i.test(v);const r=off?0:num(String(v).replace(/^[rc]/i,''),kind==='chamfer'?'C':'R');if(!off&&!(r>0&&r<60))throw new Error('크기가 이상합니다: '+v);
      es.forEach(e=>{if(e==='V'){if(off){C.over.corner=0;delete C.edge.V;}else{C.over.corner=r;if(kind==='chamfer')C.edge.V='chamfer';else delete C.edge.V;}}
        else if(off)delete C.edge[e];else C.edge[e]={k:kind,r};});
      return ok(`${es.map(e=>EDGE_KO[e]).join(', ')}: ${off?'모서리 처리 없음':`${kind==='chamfer'?'각모따기 C':'둥근모따기 R'}${r} mm`} → 모서리 ${edgeText(C)}`);}
    case'edit':{const id=String(a._[0]||'').toUpperCase();const f=C.feats.find(x=>x.id===id);if(!f)throw new Error(`형상 ${id||'?'}가 없습니다 — list로 번호를 보세요.`);
      const ch=[];const setN=(k,key,nm,lo,hi)=>{if(a[k]==null||a[k]===true)return;const v=num(a[k],nm||k);if(lo!=null&&!(v>=lo&&v<=hi))throw new Error(`${nm||k} 범위 밖: ${v}`);f[key||k]=v;ch.push(`${nm||k} ${v}`);};
      const rel=(k,key,nm)=>{if(a[k]==null||a[k]===true)return;const v=num(a[k],nm);f[key]=(f[key]!=null?+f[key]:0)+v;ch.push(`${nm} ${v>0?'+':''}${v}`);};
      if(f.type==='hole'||f.type==='slot'){if(a.side!=null){const sd=side(a.side);if(!sd)throw new Error('면: left right front back top bottom');f.side=sd;ch.push(SK[sd]);}
        if(f.type==='hole'){setN('d','d','지름',0.5,200);if(a.d!=null&&f.kind==='gland'&&/글랜드 (M|PG)\d+/.test(f.label||'')){const gk=Object.keys(GLAND).find(k=>Math.abs(GLAND[k]-f.d)<0.01);f.label='케이블 글랜드'+(gk?' '+gk:'');}if(a.size!=null&&f.kind==='gland'){const sz=String(a.size).toUpperCase();if(!GLAND[sz])throw new Error('글랜드: '+Object.keys(GLAND).join(' · '));f.d=GLAND[sz];f.label='케이블 글랜드 '+sz;ch.push(sz);}}
        else{setN('w','w','폭',0.5,300);setN('h','h','높이',0.5,300);}
        if(a.u!=null){setN('u','u','u');f.du=null;}if(a.z!=null||a.v!=null){f.v=num(a.z!=null?a.z:a.v,'z');ch.push(`z ${f.v}`);}
        if(a.du!=null){if(f.u!=null)rel('du','u','u');else rel('du','du','u');}if(a.dz!=null){if(f.v==null)throw new Error(`${id}: 높이가 자동이라 --dz 대신 --z <mm>로 지정하세요.`);rel('dz','v','z');}
        if(a.label&&a.label!==true){f.label=String(a.label);ch.push(`이름 ${f.label}`);}}
      else if(f.type==='tabs'){if(a.screw!=null){const sc=String(a.screw).toUpperCase();if(H&&H.SCREW_D&&!H.SCREW_D[sc])throw new Error('나사: '+Object.keys(H.SCREW_D).join(' · '));f.screw=sc;ch.push(sc);}
        setN('w','w','폭',4,80);setN('len','len','길이',4,80);setN('t','t','두께',1,20);if(a.n!=null){f.n=num(a.n,'개수')>=3?4:2;ch.push(`${f.n}개`);}if(a.sides!=null){f.sides=/^sn$/i.test(a.sides)?'SN':'WE';ch.push(f.sides==='WE'?'좌우':'앞뒤');}}
      else if(f.type==='boss'){if(a.x!=null||a.y!=null){f.x=num(a.x!=null?a.x:f.x,'x');f.y=num(a.y!=null?a.y:f.y,'y');f.center=false;ch.push(`(${f.x}, ${f.y})`);}setN('d','d','지름',1,20);}
      else if(f.type==='rib'){if(a.axis!=null){f.axis=/^y$/i.test(a.axis)?'y':'x';ch.push(`${f.axis} 방향`);}setN('pos','pos','위치');setN('h','h','높이',0.5,40);setN('t','t','두께',0.5,10);}
      else if(f.type==='fins'){if(a.n!=null){f.n=Math.round(num(a.n,'개수'));f.off=false;ch.push(`${f.n}개`);}setN('h','h','높이',1,80);setN('pitch','pitch','피치',2,40);}
      else if(f.type==='label'){if(a.text&&a.text!==true){f.text=String(a.text).slice(0,40);ch.push(`"${f.text}"`);}setN('size','size','크기',1,40);setN('u','u','u');setN('v','v','v');}
      if(!ch.length)throw new Error(`edit ${id}: 바꿀 값이 없습니다 — 예: edit ${id} --d 10 --z 6`);
      return ok(`${id} 수정: ${ch.join(' · ')}`);}
    case'ai':return{out:'',action:'ai',text:t.slice(1).join(' ')};
    default:throw new Error(`알 수 없는 명령: ${cmd} — help`);
  }
}
function matKey(v,H){const s=String(v).toLowerCase().replace(/\s/g,'');if(H.MATS[s])return s;
  if(/마그네슘|az91|magnes/.test(s))return'az91d';if(/압출|6063|extru/.test(s))return'a6063';if(/다이캐스|adc12|diecast|알루미늄|aluminum|aluminium|alu/.test(s))return'adc12';
  if(/판금|spcc|철판|steel|sheet/.test(s))return'spcc';if(/pa66|나일론|nylon|유리섬유|gf/.test(s))return'pa66gf';if(/pc\/?abs|플라스틱|수지|사출|plastic|abs/.test(s))return'pcabs';return null;}
/* ---- sentences → commands (deterministic reading) ---- */
const N1=s=>{const m=String(s).match(/-?\d+(?:\.\d+)?/);return m?m[0]:null;};
function parse(text){
  const out=[];const parts=String(text||'').split(/\s*(?:[,，;\n]|\.\s|그리고|하고\s|이고\s|및\s|\band\b)\s*/i).filter(x=>x&&x.trim());
  let lastSide=null;
  for(const raw of parts){const c=raw.trim(),L=c.toLowerCase();const sd=(()=>{for(const[re,s]of SIDE_RE)if(re.test(c))return s;return null;})();if(sd)lastSide=sd;
    const cnt=(c.match(/(\d+)\s*(?:개|곳|ea|x\b)/i)||[])[1];const q=(c.match(/["“'‘]([^"”'’]+)["”'’]/)||[])[1];
    const pushed=out.length;
    if(/내보내|export|다운로드|저장/.test(L)){out.push('export '+(/scad/.test(L)?'scad':/stl/.test(L)?'stl':/step|스텝|solidcraft|fusion|solidworks|freecad/.test(L)?'step':'zip'));continue;}
    if(/초기화|리셋|reset|처음부터/.test(L)){out.push('reset');continue;}
    if(/(커버|뚜껑|cover|lid).*(열어|열기|열고|open)|^open/.test(L)){out.push('open');continue;}
    if(/(커버|뚜껑|cover|lid).*(닫|close)|^close/.test(L)){out.push('close');continue;}
    // conditions
    const cc=c.match(/시안\s*([a-dA-D])\b/)||c.match(/\b(?:concept)\s*([a-dA-D])\b/i);if(cc)out.push('set concept '+cc[1].toUpperCase());else if(/하이브리드|hybrid|(알루미늄|금속).*(플라스틱|수지).*(커버|뚜껑)|반.*플라스틱.*반.*알루미늄/i.test(c))out.push('set concept D');else if(/스냅\s*핏|snap|사출\s*(박스|케이스)/i.test(c))out.push('set concept B');else if(/압출\s*(프로파일|케이스|하우징)|엔드\s*플레이트|end\s*plate|extru/i.test(c))out.push('set concept C');else if(/다이\s*캐스(팅)?\s*(하우징|케이스|박스|ecu)|die\s*cast/i.test(c))out.push('set concept A');else if(/시안.*자동|concept.*auto/i.test(c))out.push('set concept auto');
    const mk=matKey(c,{MATS:{}});if(/재질|소재|material|마그네슘|다이캐스|압출|판금|spcc|pa66|나일론|pc\/?abs|플라스틱|수지|알루미늄|aluminum|adc12|az91|6063/i.test(c)&&!/글랜드|구멍/.test(c)){if(/자동|auto/.test(L)&&/재질|material/.test(L))out.push('set mat auto');else if(mk)out.push('set mat '+mk);}
    const ip=c.match(/ip\s*-?\s*(\d{2}k?)/i);if(ip)out.push('set ip IP'+ip[1].toUpperCase());else if(/고압\s*세척/.test(c))out.push('set ip IP69K');else if(/침수|완전\s*방수|방수/.test(c))out.push('set ip IP67');else if(/방진|생활\s*방수|비말/.test(c))out.push('set ip IP54');
    const pw=c.match(/(?:발열|소비\s*전력|열\s*부하|열부하|손실|power)\D{0,8}?(\d+(?:\.\d+)?)\s*w/i)||(/발열|power/i.test(c)?null:c.match(/(\d+(?:\.\d+)?)\s*w(?![a-z\/·])/i));if(pw&&!/w\s*\/\s*m/i.test(c))out.push('set power '+pw[1]);
    const vb=c.match(/진동\D{0,8}?(\d+(?:\.\d+)?)/)||c.match(/(\d+(?:\.\d+)?)\s*g\s*rms/i)||c.match(/vib\D{0,4}(\d+(?:\.\d+)?)/i);if(vb)out.push('set vib '+vb[1]);
    const ta=c.match(/(?:주위|주변|외기|ambient)\s*(?:온도)?\D{0,6}?(-?\d+(?:\.\d+)?)/i);if(ta)out.push('set ta '+ta[1]);
    const tm=c.match(/(?:pcb|기판)\s*(?:한계|최고|최대)?\s*온도\D{0,6}?(\d+(?:\.\d+)?)/i);if(tm)out.push('set tmax '+tm[1]);
    const tj=c.match(/tj\D{0,6}?(\d+(?:\.\d+)?)/i)||c.match(/접합\s*온도\D{0,6}?(\d+(?:\.\d+)?)/);if(tj)out.push('set tj '+tj[1]);
    if(/방열\s*패드|tim|갭\s*패드|갭\s*필러|gap\s*(pad|filler)/i.test(c)){if(/없|빼|제거|off|사용\s*안/.test(L))out.push('set tim none');else if(/필러|filler|디스펜/.test(L))out.push('set tim gel40');else if(/\b6(\.0)?\s*w|6\s*와트|고성능/.test(L))out.push('set tim pad60');else if(/\b3(\.0)?\s*w|3\s*와트/.test(L))out.push('set tim pad30');else if(/1\.5\s*w/.test(L))out.push('set tim pad15');else if(/자동|auto/.test(L))out.push('set tim auto');}
    // geometry overrides
    const wl=c.match(/(?:벽\s*두께|벽두께|두께|wall)\D{0,6}?(\d+(?:\.\d+)?)/i);if(wl&&!/pcb|기판/i.test(c))out.push('set wall '+wl[1]);else if(/벽\s*두께.*자동/.test(c))out.push('set wall auto');
    if(/모따기|필렛|휠렛|챔퍼|fillet|chamfer|라운드|라운딩|둥글|rounding|\bround/i.test(c)){
      const kind=/둥근|둥글|라운드|라운딩|필렛|휠렛|fillet|round/i.test(c)||(/\bR\s*\d/.test(c)&&!/\bC\s*\d/.test(c))?'fillet':'chamfer';
      const es=[];if(/윗면|상면|커버|뚜껑|위쪽|상단|윗\s*모서리|\btop\b/i.test(c))es.push('top');if(/바닥|하면|밑면|아래|하단|\bbottom\b/i.test(c))es.push('bottom');if(/세로|수직|코너|\bvertical\b|\bcorners?\b|네\s*모서리|4\s*(?:개\s*)?모서리|옆\s*모서리/i.test(c))es.push('vertical');
      const e=es.length?es.join(','):'all';
      if(/없|제거|빼|off|날카|각지게/.test(L))out.push(`${kind} ${e} off`);
      else{const sz=(c.match(/\b[RC]\s*=?\s*(\d+(?:\.\d+)?)/i)||c.match(/(?:반경|반지름|크기|사이즈)\s*(\d+(?:\.\d+)?)/)||c.replace(/(?:네|4)\s*(?:개\s*)?모서리/g,'').match(/(\d+(?:\.\d+)?)\s*(?:mm|밀리)?/)||[])[1];
        out.push(`${kind} ${e} ${sz||(kind==='chamfer'?'1':'2')}`);}}
    else{const cr=c.match(/(?:모서리|코너|corner)\D{0,6}?(\d+(?:\.\d+)?)/i);if(cr)out.push('set corner '+cr[1]);}
    const tp=c.match(/(?:위\s*여유|상부\s*여유|커버\s*높이|커버\s*여유|top\s*clearance)\D{0,6}?(\d+(?:\.\d+)?)/i);if(tp)out.push('set top '+tp[1]);
    const so=c.match(/(?:스탠드\s*오프|standoff|아래\s*여유|하부\s*여유)\D{0,6}?(\d+(?:\.\d+)?)/i);if(so)out.push('set stand '+so[1]);
    const gp=c.match(/(?:보드\s*와?\s*벽\s*(?:사이)?\s*간격|벽\s*간격|gap)\D{0,6}?(\d+(?:\.\d+)?)/i);if(gp)out.push('set gap '+gp[1]);
    const sp=c.match(/(?:분할면|파팅\s*라인|parting)\D{0,6}?(-?\d+(?:\.\d+)?)/i);if(sp)out.push('set split '+sp[1]);
    // features
    const S=sd||lastSide;const zq=(c.match(/높이\s*(?:z\s*)?(-?\d+(?:\.\d+)?)/)||[])[1];const uq=(c.match(/(?:위치|u|거리)\s*(\d+(?:\.\d+)?)\s*mm/i)||[])[1];const pos=(zq!=null&&!/핀/.test(c)?` --z ${zq}`:'')+(uq!=null?` --u ${uq}`:'')+(cnt&&+cnt>1?` --n ${cnt}`:'');
    if(/글랜드|gland|케이블\s*(입구|인입|구멍)/i.test(c)){const g=c.match(/\b(m|pg)\s*(\d+)/i);out.push(`gland ${S||'E'}${g?' '+g[1].toUpperCase()+g[2]:''}${pos}`);}
    else if(/벤트|vent|통기|숨구멍/i.test(c)&&!/벤트\s*필터\s*필수/.test(c)){const d=(c.match(/(?:ø|Ø|φ|파이|지름|직경)\s*(\d+(?:\.\d+)?)/i)||[])[1];out.push(`vent ${S||'N'}${d?' --d '+d:''}${pos}`);}
    else if(/구멍|홀\b|hole|타공|관통/i.test(c)&&!/장착\s*구멍/.test(c)){
      const rect=c.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/);
      if(rect&&/사각|직사각|슬롯|slot|창|사각형/.test(c))out.push(`slot ${S||'E'} --w ${rect[1]} --h ${rect[2]}${pos}`);
      else{const d=(c.match(/(?:ø|Ø|φ|파이|지름|직경|d\s*=?)\s*(\d+(?:\.\d+)?)/i)||[])[1]||((c.match(/\bm\s*(\d+)/i)||[])[1]?String(({3:3.4,4:4.5,5:5.5,6:6.6,8:9})[(c.match(/\bm\s*(\d+)/i)||[])[1]]||+(c.match(/\bm\s*(\d+)/i))[1]+0.5):null)||(c.match(/(\d+(?:\.\d+)?)\s*mm/)||[])[1];
        out.push(`hole ${S||'E'} --d ${d||'6'}${pos}${q?` --label "${q}"`:''}`);}}
    else if(/(사각|직사각|슬롯|slot|개구부|창)/i.test(c)&&/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/.test(c)){const r=c.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/);out.push(`slot ${S||'E'} --w ${r[1]} --h ${r[2]}${pos}`);}
    if(/장착\s*탭|마운팅|마운트|브래킷|브라켓|플랜지\s*탭|고정\s*탭|귀|mount|bracket|\btabs?\b/i.test(c)){if(/없|제거|빼|off/.test(L))out.push('tabs off');else{const m=c.match(/\bm\s*(\d)\b/i);out.push(`tabs ${cnt&&+cnt<4?2:4}${m?' --screw M'+m[1]:''}${/앞뒤|앞\s*뒤|sn/i.test(c)?' --sides SN':''}`);}}
    if(/방열\s*핀|냉각\s*핀|heat\s*sink\s*fin|\bfins?\b|히트\s*싱크/i.test(c)){if(/없|제거|빼|off/.test(L))out.push('fins off');else if(/자동|auto/.test(L))out.push('fins auto');else{const n=cnt||'12';const h=(c.match(/높이\s*(\d+(?:\.\d+)?)/)||[])[1];out.push(`fins ${n}${h?' --h '+h:''}`);}}
    if(/리브|rib\b|보강대/i.test(c)){out.push(`rib ${/세로|y\s*방향|y축/.test(c)?'y':'x'}`);}
    if(/보스|boss|지지점|받침/i.test(c)&&!/스크루|나사\s*보스/.test(c)){const xy=c.match(/\(?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)?/);out.push(xy?`boss ${xy[1]} ${xy[2]}`:'boss center');}
    if(/각인|로고|문구|글자|텍스트|engrave|label/i.test(c)){const txt=q||(c.replace(/.*(?:각인|로고|문구|글자|텍스트|engrave|label)\s*/i,'').replace(/(을|를|으로|로)?\s*(넣어|새겨|추가|해)\S*/g,'').trim());if(txt)out.push(`label "${txt.replace(/"/g,'')}"`);}
    if(out.length===pushed){if(/비교|compare/.test(L))out.push('compare');else if(/점검|검토|체크|확인|check|분석|보고|report|상태|status/.test(L))out.push('check');else if(/목록|list/.test(L))out.push('list');else if(/보여|보기|show/.test(L))out.push('show');}
  }
  return out;
}
return{HELP,CMDS,SIDES,GLAND,OVER,EDGE_KO,tok,args,side,exec,parse,blank,norm,matKey,edgeSet,edgeText};
})();
if(typeof module!=='undefined')module.exports=TEXT2CAD;
