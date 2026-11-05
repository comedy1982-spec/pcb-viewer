/* PADS (Siemens PADS Logic / PADS Layout) schematic exchange.
   toLogic(sheets, meta)  → PADS Logic ASCII schematic (.txt, "*PADS-LOGIC-V9.0*"): symbols (CAEDECAL), part types,
                            placed parts, off-page / power symbols, tie dots and signals (wire segments between pins,
                            tie dots and off-page references). Opens in PADS Logic with File → Import.
   toNetlist(sheets, meta)→ PADS netlist (.asc, "*PADS-PCB*"): parts with PCB decal and signals, for PADS Layout.
   parseLogic(text, file) → sheets in the viewer's schematic model (same as SCH.parseKicadSch): symbols with absolute
                            graphics and pins, wires, junctions, labels (off-page references) and power symbols.
   Record layouts follow real PADS Logic V9.x exports. PADS units are mils with y up; the viewer works in mm with y
   down, so y = sheet height − Y. Needs SCH (connect, powerSym, finishBB) and SCHEDIT (snapshot, splitWires, netlist). */
const PADSSCH=(function(){
"use strict";
const MIL=1000/25.4;
const SIZES=[['A4',297,210],['A',279.4,215.9],['A3',420,297],['B',431.8,279.4],['A2',594,420],['C',558.8,431.8],['A1',841,594],['D',863.6,558.8],['A0',1189,841],['E',1117.6,863.6]];
const SIZE_MM=Object.fromEntries(SIZES.map(([n,w,h])=>[n,[w,h]]));
const ri=v=>Math.round(v);
// PADS reads plain ASCII (code page): names lose spaces and non-ASCII characters, free text drops non-ASCII
const asc=s=>String(s==null?'':s).replace(/[µμ]/g,'u').replace(/[ΩΩ]/g,'').replace(/±/g,'+/-').replace(/°/g,'deg').replace(/×/g,'x').replace(/[–—]/g,'-').replace(/[\r\n]+/g,' ').replace(/[^\x20-\x7e]+/g,' ').replace(/ {2,}/g,' ').trim();
const tok=(s,d)=>{const v=String(s==null?'':s).trim().replace(/\s+/g,'_').replace(/[^\x21-\x7e]+/g,'_').replace(/^_+$/,'');return v||d||'_';};
const pad=(s,n)=>{s=String(s);return s.length>=n?s+' ':s+' '.repeat(n-s.length);};
const FONT='"Default Font"';
const isGndName=n=>/^(A|D|P|C|S)?GND|^VSS|^0V$|^EARTH|^CHASSIS/i.test(String(n||''));
const stamp=()=>{const d=new Date(),z=v=>String(v).padStart(2,'0');return`${d.getFullYear()}.${z(d.getMonth()+1)}.${z(d.getDate())}.${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;};

/* ======================= export: PADS Logic ASCII ======================= */
function pageFor(sheets){
  const w=Math.max(...sheets.map(s=>s.w||297)),h=Math.max(...sheets.map(s=>s.h||210));
  const same=sheets.every(s=>s.paper&&s.paper===sheets[0].paper)&&SIZE_MM[sheets[0].paper];
  if(same&&SIZE_MM[sheets[0].paper][0]>=w-0.5&&SIZE_MM[sheets[0].paper][1]>=h-0.5)return{name:sheets[0].paper,w:SIZE_MM[sheets[0].paper][0],h:SIZE_MM[sheets[0].paper][1]};
  const f=SIZES.find(([,a,b])=>a>=w-0.5&&b>=h-0.5)||SIZES[SIZES.length-1];return{name:f[0],w:f[1],h:f[2]};
}
const PINTYPE={power_in:'P',power_out:'P',input:'L',output:'S',bidirectional:'B',tri_state:'B',open_collector:'S',open_emitter:'S'};
function category(ref){const p=String(ref).replace(/\d.*$/,'').toUpperCase();
  return p==='R'||p==='RN'?'RES':p==='C'?'CAP':p==='L'||p==='FB'?'IND':p==='D'||p==='LED'||p==='ZD'?'DIO':p==='Q'||p==='T'?'TRX':/^(J|P|CN|X|CON)$/.test(p)?'CON':p==='Y'?'XTL':'UND';}
// pin direction (connection point p → body end e) as the T-line angle / side pair PADS uses
function pinDir(p,e){const dx=e[0]-p[0],dy=-(e[1]-p[1]);if(Math.abs(dx)<1e-6&&Math.abs(dy)<1e-6)return{ang:0,side:0};
  if(Math.abs(dx)>=Math.abs(dy))return dx>0?{ang:0,side:0}:{ang:0,side:1};return dy>0?{ang:90,side:0}:{ang:90,side:2};}

function pinDecal(len){const n='PVPIN'+len;return{name:n,text:[`${pad(n,16)} 34000 34000 100 10 100 10 4 ${len?1:0} 0 0 0 1`,'TIMESTAMP '+stamp(),FONT,FONT,
  `${Math.min(60,len)} 10 0 1 100 10 ${FONT}`,'REF-DES',`${len+40} 10 0 8 100 10 ${FONT}`,'PART-TYPE',`-530 10 0 1 100 10 ${FONT}`,'*',`-70 10 0 1 100 10 ${FONT}`,'*',
  ...(len?['OPEN   2   10  255','0     0',`${len}   0`]:[])].join('\r\n')};}
const FIXED_DECALS=()=>[
  ['PVREFOUT  33500 33180 100 10 100 10 4 1 0 1 24 0','-360 0 0 1 100 10','-360 -20 0 3 100 10',['OPEN   7   5   255','0     0','100   0','150   50','300   50','300   -50','150   -50','100   0']],
  ['PVREFIN   33500 33180 100 10 100 10 4 1 0 1 24 0','-360 0 0 1 100 10','-360 -20 0 3 100 10',['OPEN   7   5   255','0     0','-100  0','-150  -50','-300  -50','-300  50','-150  50','-100  0']],
  ['PVPWR     33500 33180 100 10 100 10 4 2 0 1 26 0','0 250 0 4 100 10','0 200 0 0 100 10',['OPEN   2   5   255','0     0','0     150','OPEN   2   5   255','-100  150','100   150']],
  ['PVGND     33500 33180 100 10 100 10 4 4 0 1 26 0','100 -50 0 0 100 10','0 200 0 0 100 10',['OPEN   2   5   255','0     0','0     -100','OPEN   2   5   255','-100  -100','100   -100','OPEN   2   5   255','-60   -160','60    -160','OPEN   2   5   255','-20   -220','20    -220']],
].map(([h,a,b,g])=>[h,'TIMESTAMP '+stamp(),FONT,FONT,`${a} ${FONT}`,'REF-DES',`${b} ${FONT}`,'PART-TYPE',`0 100 0 0 100 10 ${FONT}`,'*',`0 0 0 0 100 10 ${FONT}`,'*',...g,'T0     0     0 0 0 0 0 0 0 0 0 8 ','P0 0 0 0 0 0 0 0 128'].join('\r\n'));

// a placed symbol unit → decal geometry in mils relative to the part origin (y up)
function decalGeom(s){
  const ox=Math.round(s.x*MIL/50)*50/MIL,oy=Math.round(s.y*MIL/50)*50/MIL;
  const L=q=>[ri((q[0]-ox)*MIL),ri(-(q[1]-oy)*MIL)];
  const pieces=[];
  s.g.forEach(g=>{const w=Math.max(5,ri((g.w||0.254)*MIL));
    if(g.t==='poly'&&g.pts&&g.pts.length>1){const pts=g.pts.map(L);const closed=pts.length>2&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1];
      pieces.push({k:closed?(g.fill==='outline'?'COPCLS':'CLOSED'):'OPEN',w,pts});}
    else if(g.t==='circle'&&g.c){const c=L(g.c),r=Math.max(1,ri(g.r*MIL));pieces.push({k:'CIRCLE',w,pts:[[c[0]-r,c[1]],[c[0]+r,c[1]]]});}});
  const pins=s.pins.map(p=>{const a=L(p.p),b=L(p.e);const len=ri(Math.hypot(b[0]-a[0],b[1]-a[1]));return Object.assign({x:a[0],y:a[1],len,num:String(p.num),name:p.name&&p.name!=='~'?p.name:'',type:p.type,hideName:!p.nameShow},pinDir(p.p,p.e));});
  const tref=s.texts.find(t=>t.role==='Reference'),tval=s.texts.find(t=>t.role==='Value');
  return{ox,oy,pieces,pins,ref:tref?L(tref.p):[0,ri(150)],val:tval?L(tval.p):[0,-ri(150)]};
}
function decalKey(g){return JSON.stringify([g.pieces,g.pins.map(p=>[p.x,p.y,p.len,p.ang,p.side,p.hideName]),g.ref,g.val]);}
function decalRecord(name,g){
  const o=[`${pad(name,16)} 32000 32000 100 10 100 10 4 ${g.pieces.length} 0 ${g.pins.length} 0 0`,'TIMESTAMP '+stamp(),FONT,FONT,
    `${g.ref[0]} ${g.ref[1]} 0 0 100 10 ${FONT}`,'REF-DES',`${g.val[0]} ${g.val[1]} 0 0 100 10 ${FONT}`,'PART-TYPE',`${g.val[0]} ${g.val[1]-120} 0 0 100 10 ${FONT}`,'*',`${g.val[0]} ${g.val[1]-240} 0 0 100 10 ${FONT}`,'*'];
  g.pieces.forEach(pc=>{o.push(`${pad(pc.k,6)} ${pad(pc.pts.length,3)} ${pad(pc.w,3)} 255`);pc.pts.forEach(q=>o.push(`${pad(q[0],5)} ${q[1]}`));});
  g.pins.forEach(p=>{const nx=p.side===1?-ri(p.len/2):ri(p.len/2),lx=p.side===1?-(p.len+40):p.len+40;
    o.push(`T${pad(p.x,5)} ${pad(p.y,5)} ${p.ang} ${p.side} ${p.ang?20:nx} ${p.ang?(p.side===2?-ri(p.len/2):ri(p.len/2)):20} ${p.ang} 1 ${p.ang?0:lx} ${p.ang?(p.side===2?-(p.len+40):p.len+40):0} ${p.ang} 8 PVPIN${p.len}`);
    o.push(`P0 0 0 1 0 0 0 1 ${p.hideName?128:0}`);});
  return o.join('\r\n');
}

/* split a sheet's wires into PADS segments: polylines between nodes (pins, off-page refs, tie dots) */
function segments(sh,si,ctx){
  const K=p=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000);
  const at=new Map();const nodeAt=(p,id,net)=>{const k=K(p);if(!at.has(k))at.set(k,{p,ids:[],net:null});const n=at.get(k);if(id)n.ids.push(id);if(net&&!n.net)n.net=net;return n;};
  const adj=new Map();const add=(k,w)=>{if(!adj.has(k))adj.set(k,[]);adj.get(k).push(w);};
  sh.wires.forEach(w=>{if(Math.abs(w.a[0]-w.b[0])<1e-6&&Math.abs(w.a[1]-w.b[1])<1e-6)return;add(K(w.a),w);add(K(w.b),w);nodeAt(w.a);nodeAt(w.b);});
  ctx.pinIds[si].forEach(x=>nodeAt(x.p,x.id,x.net));
  ctx.offIds[si].forEach(x=>nodeAt(x.p,x.id,x.net));
  const jk=new Set(sh.junctions.map(K));
  const isNode=(k)=>{const n=at.get(k);const deg=(adj.get(k)||[]).length;return n.ids.length>0||deg!==2||jk.has(k);};
  // tie dots where several wires meet, at junction marks and at free wire ends
  at.forEach((n,k)=>{const deg=(adj.get(k)||[]).length;if(!n.ids.length&&(deg>=3||jk.has(k)||deg===1)){const id='@@@D'+ctx.dot++;n.ids.push(id);ctx.dots[si].push({id,p:n.p});}});
  const segs=[];const used=new Set();
  const netOf=w=>w.g?ctx.netName(w.g):null;
  at.forEach((n,k)=>{if(!isNode(k))return;(adj.get(k)||[]).forEach(w0=>{if(used.has(w0))return;
    const pts=[n.p];let w=w0,cur=k,net=netOf(w0);
    for(let guard=0;guard<100000;guard++){used.add(w);const nk=K(w.a)===cur?K(w.b):K(w.a);const np=K(w.a)===cur?w.b:w.a;pts.push(np);cur=nk;
      if(isNode(cur))break;const nx=(adj.get(cur)||[]).find(x=>!used.has(x));if(!nx)break;w=nx;}
    const m=at.get(cur);if(!m.ids.length){const id='@@@D'+ctx.dot++;m.ids.push(id);ctx.dots[si].push({id,p:m.p});}
    segs.push({a:n.ids[0],b:m.ids[0],pts,net:net||n.net||m.net});});});
  // loops of plain corners (no node on them): break at one point with a tie dot
  sh.wires.forEach(w=>{if(used.has(w)||!adj.has(K(w.a)))return;const k=K(w.a),n=at.get(k);const id='@@@D'+ctx.dot++;n.ids.push(id);ctx.dots[si].push({id,p:n.p});
    const pts=[n.p];let cw=w,cur=k;for(let g=0;g<100000;g++){used.add(cw);const nk=K(cw.a)===cur?K(cw.b):K(cw.a);pts.push(K(cw.a)===cur?cw.b:cw.a);cur=nk;if(cur===k)break;const nx=(adj.get(cur)||[]).find(x=>!used.has(x));if(!nx)break;cw=nx;}
    segs.push({a:id,b:id,pts,net:netOf(w)});});
  // several ids on one point (pin + power symbol, label on a pin, pin on pin): tie them with zero-length segments
  at.forEach(n=>{for(let i=1;i<n.ids.length;i++)segs.push({a:n.ids[0],b:n.ids[i],pts:[n.p,n.p],net:n.net});});
  return segs;
}

function toLogic(sheets,meta){
  meta=meta||{};
  const S=SCHEDIT.restore(SCHEDIT.snapshot(sheets));S.forEach(SCHEDIT.splitWires);
  const conn=SCH.connect(S,meta.board||null);
  const page=pageFor(S);const H=page.h;const X=x=>ri(x*MIL),Y=y=>ri((H-y)*MIL);
  // net names: label / power names, else the board net, else a PADS anonymous name
  let anon=1;const gname=new Map();
  const netName=g=>{if(gname.has(g))return gname.get(g);const nm=[...g.names].sort((a,b)=>a.length-b.length||a.localeCompare(b))[0]||(g.net&&!/^Net-\(|^unconnected-/i.test(g.net)?g.net:null);
    const v=nm?tok(nm):'$$$'+(anon++);gname.set(g,v);return v;};
  // parts: one PADS part per symbol unit; units of one reference become gates A, B, …
  const byRef=new Map();S.forEach((sh,si)=>sh.symbols.forEach(s=>{if(s.power)return;const r=tok(s.ref,'U?');if(!byRef.has(r))byRef.set(r,[]);byRef.get(r).push({s,si});}));
  const decals=new Map(),dnames=new Set();let dn=0;
  const decalOf=(s,ref)=>{const g=decalGeom(s);const k=decalKey(g);if(!decals.has(k)){let n=('PV_'+tok(ref).replace(/[^A-Za-z0-9_+-]/g,'')).slice(0,36);while(dnames.has(n))n=n.replace(/_\d+$/,'')+'_'+(++dn);dnames.add(n);decals.set(k,{name:n,g});}return{name:decals.get(k).name,g};};
  const ptypes=new Map(),ptnames=new Set();const parts=[];const pinLens=new Set();
  byRef.forEach((list,ref)=>{const s0=list[0].s;const multi=list.length>1;
    const gates=list.map(({s})=>decalOf(s,ref));gates.forEach(g=>g.g.pins.forEach(p=>pinLens.add(p.len)));
    const pins=gates.map(g=>g.g.pins.map(p=>[p.num,PINTYPE[p.type]||(isGndName(p.name)&&/power/.test(p.type||'')?'G':'U'),p.name]));
    const key=JSON.stringify([gates.map(g=>g.name),pins,s0.val,s0.fp,s0.mpn]);
    if(!ptypes.has(key)){let base=tok(s0.mpn||[s0.val,String(s0.fp||'').split(':').pop()].filter(Boolean).join('_')||ref).replace(/[^\w+\-./=#]/g,'_').slice(0,36);let n=base,k=2;while(ptnames.has(n))n=base.slice(0,33)+'_'+(k++);ptnames.add(n);
      ptypes.set(key,{name:n,cat:category(ref),gates:gates.map((g,i)=>({decal:g.name,pins:pins[i]}))});}
    const pt=ptypes.get(key);
    list.forEach(({s,si},i)=>{const g=gates[i];parts.push({si,refd:multi?`${ref}-${String.fromCharCode(65+i)}`:ref,ref,pt:pt.name,g:g.g,s,gate:i});});});
  // node ids for pins and off-page / power references
  const ctx={dot:0,dots:S.map(()=>[]),pinIds:S.map(()=>[]),offIds:S.map(()=>[]),netName,offs:S.map(()=>[])};
  parts.forEach(pp=>pp.s.pins.forEach(p=>ctx.pinIds[pp.si].push({p:p.p,id:`${pp.refd}.${tok(p.num)}`,net:p.g?netName(p.g):null})));
  let off=0;
  S.forEach((sh,si)=>{
    sh.symbols.forEach(s=>{if(!s.power||!s.pins.length)return;const p=s.pins[0].p;const net=s.pins[0].g?netName(s.pins[0].g):tok(s.val);const gnd=isGndName(s.val);
      const b=s._body||s.bb;const cx=(b[0]+b[2])/2-p[0],cy=-((b[1]+b[3])/2-p[1]);const d=Math.abs(cx)>Math.abs(cy)?(cx>0?'r':'l'):(cy>0?'u':'d');
      const rot=gnd?{d:0,r:1,u:2,l:3}[d]:{u:0,l:1,d:2,r:3}[d];const id='@@@O'+(off++);ctx.offIds[si].push({p,id,net});ctx.offs[si].push({id,net,lib:gnd?'$GND_SYMS':'$PWR_SYMS',x:X(p[0]),y:Y(p[1]),rot,v:0,kind:gnd?'gnd':'pwr'});});
    sh.labels.forEach(l=>{const net=l.g?netName(l.g):tok(l.s);const id='@@@O'+(off++);const r=(((l.rot||0)%360)+360)%360;
      ctx.offIds[si].push({p:l.p,id,net});ctx.offs[si].push({id,net,lib:'$OSR_SYMS',x:X(l.p[0]),y:Y(l.p[1]),rot:Math.round(r/90)%4,v:0,kind:'osr'});});});
  const segs=S.map((sh,si)=>segments(sh,si,ctx));
  // signals by net (all segments of one net across the sheet)
  const fmtSeg=sg=>[`${pad(sg.a,12)} ${pad(sg.b,12)} ${sg.pts.length} 0`,...sg.pts.map(q=>`${pad(X(q[0]),6)} ${Y(q[1])}`)].join('\r\n');

  const o=[];const L=(...x)=>o.push(...x);
  L('*PADS-LOGIC-V9.0* DESIGN EXPORT FILE FROM PADS LOGIC V9.5','*SCH*        GENERAL PARAMETERS OF THE SCHEMATIC DESIGN','',
    'CUR SHEET    0              Current Active Sheet','USERGRID     50     10      Design and Label/Text grid settings','LINEWIDTH    10             Width items will be created with',
    'CONNWIDTH    10             Width used to plot connections','BUSWIDTH     25             Width used to plot buses','BUSANGLE     25             Angle used when plotting buses',
    'NNVISPWRGND  4              Pwr/Gnd netname visibility default flag','PCBFLAGS     1027           PCB Netlist and ECO options','PINNAMESIZE  100    10      Height and LineWidth used by pin names',
    'TEXTSIZE     100    10      Height and LineWidth text will be created width','JOBTIME      0              Amount of time spent on this LOGIC design','DOTGRID      1000           Space in thous/inch between graphic dots',
    'BACKUPTIME   5              Number of minutes between database backups','TIEDOTSIZE   40             Diameter of tiedot point','REFNAMESIZE  100    10      Height and LineWidth used by part ref. names',
    'PARTNAMESIZE 100    10      Height and LineWidth used by part type names','PINNOSIZE    80     10      Height and LineWidth used by pin numbers','NETNAMESIZE  100    10      Height and LineWidth used by net names',
    'REAL WIDTH   20             Widths greater then this are displayed real size',`SHEET SIZE   ${page.name}`,'UNITS        0              Rules units type',`JOBNAME      ${tok(meta.name||'schematic')}`,
    'FONT MODE   System',`DEFAULT FONT ${FONT}`,'','*FIELDS*    USER FIELDS','',`"Title" ${asc(meta.title||meta.name||'')}`,`"Revision" ${asc(S[0]&&S[0].rev||'')}`,`"Drawn Date" ${meta.date||''}`,'"Drawn By" AllInOneDesign','');
  S.forEach((sh,si)=>{
    L(`*SHT*   ${si+1} ${tok(String(sh.name||'').replace(/^\d+\.\s*/,'')||'Sheet'+(si+1))} -1 $$$NONE`,'*CAE*        GENERAL PARAMETERS FOR THE SHEET"','',
      'SCALE        1.000          Scale of window expansion',`WINDOWCENTER ${ri(page.w*MIL/2)} ${ri(page.h*MIL/2)}  Point defining the center of the window`,'BITCS0       0              system status bits','BITCS1       0              system status bits','BITCS2       0              system status bits','',
      '*TEXT*       FREE TEXT','');
    (sh.texts||[]).forEach(t=>{if(!asc(t.s))return;String(t.s).split(/\r?\n/).map(asc).filter(Boolean).forEach((line,k)=>{L(`${X(t.p[0])} ${Y(t.p[1])-k*ri((t.fx&&t.fx.size||1.27)*MIL*1.4)} ${Math.round((t.rot||0)/90)%4} 0 ${ri((t.fx&&t.fx.size||1.27)*MIL)} 10 0 ${FONT}`,line);});});
    L('','*LINES*      LINES ITEMS','');
    L('*CAEDECAL*  ITEMS','');
    if(si===0){[...pinLens].sort((a,b)=>a-b).forEach(n=>L(pinDecal(n).text,''));FIXED_DECALS().forEach(d=>L(d,''));decals.forEach(d=>L(decalRecord(d.name,d.g),''));}
    L('*PARTTYPE*   ITEMS','');
    if(si===0){L('$OSR_SYMS UND  0   0   2     0','TIMESTAMP '+stamp(),'OFF 2','PVREFOUT S','PVREFIN L','','$GND_SYMS UND  0   0   2     0','TIMESTAMP '+stamp(),'GND 1','PVGND G GND','',
        '$PWR_SYMS UND  0   0   2     0','TIMESTAMP '+stamp(),'PWR 1','PVPWR P +5V','');
      ptypes.forEach(pt=>{L(`${pt.name} ${pt.cat}  ${pt.gates.length}   0   0     0`,'TIMESTAMP '+stamp());
        pt.gates.forEach(g=>{L(`GATE 1 ${g.pins.length} 0`,g.decal);g.pins.forEach(([n,t,nm])=>L(`${tok(n)} 0 ${t}${nm?' '+tok(nm):''}`));});L('');});}
    L('*PART*       ITEMS','');
    parts.filter(pp=>pp.si===si).forEach(pp=>{const s=pp.s,g=pp.g;const vals=[['Value',asc(s.val)],['PCB DECAL',tok(String(s.fp||'').split(':').pop(),'')],['Part Number',asc(s.mpn)],['Description',asc(s.desc)]].filter(([,v])=>v&&v!=='_');
      L(`${pad(pp.refd,12)} ${pad(pp.pt,16)} ${pad(X(g.ox),5)} ${pad(Y(g.oy),5)} 0 0 100 10 100 10 4 ${vals.length} ${g.pins.length} 0 0 0`,FONT,FONT,
        `${g.ref[0]} ${g.ref[1]} 0 0 100 10 0 ${FONT}`,'REF-DES',`${g.val[0]} ${g.val[1]} 0 0 100 10 8 ${FONT}`,'PART-TYPE',`${g.val[0]} ${g.val[1]} 0 0 100 10 0 ${FONT}`,'Value',`${g.val[0]} ${g.val[1]-120} 0 0 100 10 8 ${FONT}`,'*',
        ...vals.map(([k,v])=>`"${k}" ${v}`),...g.pins.map((p,i)=>`${i} 80 10 0 1`),'');});
    L('*BUSSES*','','*OFFPAGE REFS*','');
    ctx.offs[si].forEach(f=>L(`${pad(f.id,8)} ${f.net} ${f.lib} ${pad(f.x,6)} ${pad(f.y,6)} ${f.rot} ${f.v} 0`));
    L('','*TIEDOTS*','');ctx.dots[si].forEach(d=>L(`${pad(d.id,8)} ${pad(X(d.p[0]),6)} ${Y(d.p[1])}`));
    L('','*CONNECTION*','');
    const bynet=new Map();segs[si].forEach(sg=>{const n=sg.net||'$$$'+(anon++);if(!bynet.has(n))bynet.set(n,[]);bynet.get(n).push(sg);});
    bynet.forEach((list,n)=>{L(`*SIGNAL* ${n} ${/^\$\$\$/.test(n)?64:0} 0`);list.forEach(sg=>L(fmtSeg(sg)));L('');});
    L('*NETNAMES*','');
    ctx.offs[si].forEach(f=>L(f.kind==='osr'?`${pad(f.net,12)} ${pad(f.id,12)} 360    -50    0 0 0      0      0 3 -1 10 100 ${FONT}`:f.kind==='pwr'?`${pad(f.net,12)} ${pad(f.id,12)} 0      250    0 4 0      0      0 0 -1 10 100 ${FONT}`:`${pad(f.net,12)} ${pad(f.id,12)} 0      -300   0 6 0      0      0 0 -1 10 100 ${FONT}`));
    L('');});
  L('*END*     OF ASCII OUTPUT FILE','');
  const stats={sheets:S.length,parts:parts.length,refs:byRef.size,partTypes:ptypes.size,decals:decals.size,signals:new Set(segs.flat().map(s=>s.net)).size,offpage:ctx.offs.flat().length,tiedots:ctx.dots.flat().length};
  return{text:o.join('\r\n'),stats,page:page.name};
}

/* ======================= export: PADS netlist (PADS Layout) ======================= */
function toNetlist(sheets,meta){
  meta=meta||{};const B=meta.board||null;
  const nl=SCHEDIT.netlist(sheets,B);const parts=new Map();
  sheets.forEach(sh=>sh.symbols.forEach(s=>{if(s.power)return;const r=tok(s.ref);if(!parts.has(r)){const c=B&&B.byRef[s.ref];parts.set(r,tok(String(s.fp||(c&&c.fp)||'').split(':').pop(),'unknown'));}}));
  const nets=new Map();nl.pinNet.forEach((n,k)=>{const i=k.lastIndexOf('.');const ref=k.slice(0,i),pin=k.slice(i+1);if(!n)return;if(!nets.has(n))nets.set(n,[]);nets.get(n).push(`${tok(ref)}.${tok(pin)}`);});
  const o=['*PADS-PCB*','*PART*'];[...parts.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).forEach(r=>o.push(`${pad(r,12)} ${parts.get(r)}`));
  o.push('','*NET*');let nn=0;
  [...nets.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).forEach(([n,ps])=>{if(ps.length<2)return;nn++;o.push(`*SIGNAL* ${tok(n).replace(/[()]/g,'_')}`);for(let i=0;i<ps.length;i+=8)o.push(ps.slice(i,i+8).join(' '));});
  o.push('','*END*','');
  return{text:o.join('\r\n'),stats:{parts:parts.size,nets:nn}};
}

/* ======================= import: PADS Logic ASCII ======================= */
function isLogic(text){return /^\s*\*PADS-(POWER)?LOGIC/i.test(String(text||'').slice(0,200));}
const SECT=/^\*([A-Z][A-Z ]*[A-Z])\*/;
function parseLogic(text,file){
  const lines=String(text).replace(/\r/g,'').split('\n');
  if(!isLogic(lines[0]))throw new Error('PADS Logic ASCII(.txt) 형식이 아닙니다. PADS Logic에서 File → Export → ASCII로 저장한 파일을 넣어 주세요.');
  const num=v=>{const x=parseFloat(v);return isNaN(x)?0:x;};
  const st={page:'B',units:0,decals:{},ptypes:{},sheets:[]};let sht=null;
  const newSheet=(n,name)=>{sht={n,name,parts:[],offs:[],dots:[],sigs:[],texts:[],lines:[]};st.sheets.push(sht);};
  const ensure=()=>{if(!sht)newSheet(1,'Sheet1');return sht;};
  let i=1;const N=lines.length;
  const sect=l=>{const m=SECT.exec(l);return m&&!/^\*REMARK\*/.test(l)?m[1]:null;};
  while(i<N){const l=lines[i];const s=sect(l);if(!s){i++;continue;}i++;
    if(s==='SCH'){while(i<N&&!sect(lines[i])){const t=lines[i].trim();let m;if((m=t.match(/^SHEET SIZE\s+(\S+)/)))st.page=m[1];else if((m=t.match(/^UNITS\s+(\d)/)))st.units=+m[1];i++;}}
    else if(s==='CAM'||s==='MISC'){let depth=0,seen=false;while(i<N){const t=lines[i];if(!seen&&sect(t)&&!/^\*REMARK/.test(t))break;for(const c of t){if(c==='{'){depth++;seen=true;}else if(c==='}')depth--;}i++;if(seen&&depth<=0)break;}}
    else if(s==='SHT'){const m=l.replace(/^\*SHT\*/,'').trim().split(/\s+/);newSheet(+m[0]||st.sheets.length+1,m[1]&&m[1]!=='$$$NONE'?m[1]:'Sheet'+(+m[0]||st.sheets.length+1));}
    else if(s==='TEXT'){const S=ensure();while(i<N&&!sect(lines[i])){const t=lines[i].trim();const m=t.match(/^(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);if(m&&i+1<N){S.texts.push({x:+m[1],y:+m[2],rot:+m[3],h:+m[5],s:lines[i+1]});i+=2;}else i++;}}
    else if(s==='LINES'){const S=ensure();while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);
        if(t.length>=6&&t[1]==='LINES'){const ox=num(t[2]),oy=num(t[3]),np=+t[5]||0;i++;for(let k=0;k<np&&i<N;k++){while(i<N&&!lines[i].trim())i++;const h=lines[i].trim().split(/\s+/);const n=+h[1]||0;i++;const pts=[];for(let q=0;q<n&&i<N;q++,i++){const v=lines[i].trim().split(/\s+/);pts.push([ox+num(v[0]),oy+num(v[1])]);}if(h[0]==='CIRCLE'&&pts.length===2){const c=[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2],r=Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1])/2;const P=[];for(let a=0;a<=24;a++)P.push([c[0]+r*Math.cos(a*Math.PI/12),c[1]+r*Math.sin(a*Math.PI/12)]);S.lines.push(P);}else if(pts.length>1)S.lines.push(pts);}}
        else i++;}}
    else if(s==='CAEDECAL'){while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(t.length===13&&/^-?\d+$/.test(t[1])&&/^-?\d+$/.test(t[12])){i=readDecal(lines,i,t,st.decals);}else i++;}}
    else if(s==='PARTTYPE'){while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(t.length>=5&&/^\d+$/.test(t[2])&&!/^TIMESTAMP/.test(t[0])){i=readPartType(lines,i,t,st.ptypes);}else i++;}}
    else if(s==='PART'){const S=ensure();while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(t.length>=6&&/^[A-Za-z#$]/.test(t[0])&&/^-?\d+$/.test(t[2])){i=readPart(lines,i,t,S.parts);}else i++;}}
    else if(s==='OFFPAGE REFS'){const S=ensure();while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(/^@@@O/.test(t[0]))S.offs.push({id:t[0],net:t[1],lib:t[2],x:num(t[3]),y:num(t[4]),rot:+t[5]||0,v:+t[6]||0});i++;}}
    else if(s==='TIEDOTS'){const S=ensure();while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(/^@@@D/.test(t[0]))S.dots.push({id:t[0],x:num(t[1]),y:num(t[2])});i++;}}
    else if(s==='CONNECTION'){const S=ensure();while(i<N){const l2=lines[i];const s2=sect(l2);if(s2&&s2!=='SIGNAL')break;
        if(s2==='SIGNAL'){const h=l2.replace(/^\*SIGNAL\*/,'').trim().split(/\s+/);const sig={name:h[0],anon:/^\$\$\$/.test(h[0]),segs:[]};S.sigs.push(sig);i++;
          if(h[2]==='1'&&i<N&&/FUNCTION/.test(lines[i]))i++;
          while(i<N&&!sect(lines[i])){const t=lines[i].trim().split(/\s+/);if(t.length>=3&&/^\d+$/.test(t[2])&&!/^-?\d+$/.test(t[0])){const n=+t[2];i++;const pts=[];for(let k=0;k<n&&i<N;k++,i++){const v=lines[i].trim().split(/\s+/);pts.push([num(v[0]),num(v[1])]);}sig.segs.push({a:t[0],b:t[1],pts});}else i++;}}
        else i++;}}
    else if(s==='END')break;
  }
  return build(st,file);
}
function readDecal(lines,i,t,out){
  const d={name:t[0],nattr:+t[7]||0,npc:+t[8]||0,npin:+t[10]||0,pinDecal:+t[12]===1,attrs:[],pcs:[],pins:[]};i++;
  if(i<lines.length&&/^TIMESTAMP/.test(lines[i]))i++;
  for(let k=0;k<2;k++)if(i<lines.length&&/^"/.test(lines[i]))i++;
  for(let a=0;a<d.nattr&&i+1<lines.length;a++){const v=lines[i].trim().split(/\s+/);d.attrs.push({x:+v[0]||0,y:+v[1]||0,name:lines[i+1].trim()});i+=2;}
  for(let p=0;p<d.npc&&i<lines.length;p++){while(i<lines.length&&!lines[i].trim())i++;const h=lines[i].trim().split(/\s+/);const n=+h[1]||0;i++;const pts=[];
    for(let q=0;q<n&&i<lines.length;q++,i++){const v=lines[i].trim().split(/\s+/);pts.push([parseFloat(v[0])||0,parseFloat(v[1])||0]);}d.pcs.push({k:h[0],w:+h[2]||10,pts});}
  // embedded texts until the first pin T-line (or the blank line that ends the entry)
  while(i<lines.length&&lines[i].trim()&&!/^T-?\d/.test(lines[i])&&!SECT.test(lines[i]))i+=2;
  for(let p=0;p<d.npin&&i<lines.length;p++){while(i<lines.length&&!lines[i].trim())i++;const l=lines[i];if(!/^T/.test(l))break;const v=l.slice(1).trim().split(/\s+/);
    d.pins.push({x:+v[0]||0,y:+v[1]||0,ang:+v[2]||0,side:+v[3]||0,decal:v[12]||''});i++;
    if(i<lines.length&&/^P/.test(lines[i])){const f=lines[i].slice(1).trim().split(/\s+/);d.pins[d.pins.length-1].hideName=!!((+f[8]||0)&128);i++;}}
  out[d.name]=d;return i;
}
function readPartType(lines,i,t,out){
  const pt={name:t[0],cat:t[1],gates:[],special:null,variants:[]};i++;
  if(i<lines.length&&/^TIMESTAMP/.test(lines[i]))i++;
  const special=/^\$(GND|PWR|OSR)_SYMS$/.test(pt.name);
  if(special&&i<lines.length&&!/^G:/.test(lines[i])){const h=lines[i].trim().split(/\s+/);const n=+h[1]||0;i++;for(let k=0;k<n&&i<lines.length;k++,i++){const v=lines[i].trim().split(/\s+/);pt.variants.push({decal:v[0],type:v[1],net:v[2]||''});}out[pt.name]=pt;return i;}
  while(i<lines.length&&lines[i].trim()&&!SECT.test(lines[i])){const v=lines[i].trim().split(/\s+/);
    if(v[0]==='GATE'){const nd=+v[1]||0,np=+v[2]||0;i++;const g={decals:[],pins:[]};for(let k=0;k<nd&&i<lines.length&&lines[i].trim();k++,i++)g.decals.push(lines[i].trim());
      for(let k=0;k<np&&i<lines.length&&lines[i].trim();k++,i++){const q=lines[i].trim().split(/\s+/);g.pins.push({num:q[0],type:(q[2]||'U')[0],name:q[3]||''});}pt.gates.push(g);}
    else if(/^G:/.test(v[0])){const g={decals:v[0].slice(2).split(':').filter(Boolean),pins:[]};const np=+v[2]||0;i++;
      while(g.pins.length<np&&i<lines.length&&lines[i].trim()&&!/^(G:|SIGPIN)/.test(lines[i])){lines[i].trim().split(/\s+/).forEach(tk=>{if(g.pins.length>=np)return;const f=tk.split('.');g.pins.push({num:f[0],type:(f[2]||'U')[0],name:f[3]||''});});i++;}
      if(special)pt.variants.push({decal:g.decals[0],type:g.pins[0]&&g.pins[0].type,net:''});pt.gates.push(g);}
    else if(v[0]==='CONN'){const nd=+v[1]||0,np=+v[2]||0;i++;const g={decals:[],pins:[]};for(let k=0;k<nd&&i<lines.length&&lines[i].trim();k++,i++)g.decals.push(lines[i].trim().split(/\s+/)[0]);
      for(let k=0;k<np&&i<lines.length&&lines[i].trim();k++,i++){const q=lines[i].trim().split(/\s+/);g.pins.push({num:q[0],type:(q[2]||'U')[0],name:''});}pt.gates.push(g);pt.conn=true;}
    else i++;}
  out[pt.name]=pt;return i;
}
function readPart(lines,i,t,out){
  // field 15 picks the decal variant of the gate (H / H-OP / V …); the gate itself comes from the -A / -B reference suffix
  const p={refd:t[0],pt:t[1],x:+t[2]||0,y:+t[3]||0,rot:+t[4]||0,mir:+t[5]||0,variant:+t[14]||0,gate:0,attrs:[],vals:{}};const nattr=+t[10]||0,nval=+t[11]||0;i++;
  if(nattr||nval){for(let k=0;k<2;k++)if(i<lines.length&&/^"[^"]*"\s*$/.test(lines[i].trim()))i++;
    for(let a=0;a<nattr&&i+1<lines.length;a++){const v=lines[i].trim().split(/\s+/);p.attrs.push({x:+v[0]||0,y:+v[1]||0,vis:+v[6]||0,name:lines[i+1].trim()});i+=2;}
    for(let d=0;d<nval&&i<lines.length;d++){if(/^\d/.test(lines[i]))i++;const m=(lines[i]||'').match(/^"([^"]*)"\s*(.*)$/);if(m)p.vals[m[1]]=m[2].trim();i++;}}
  while(i<lines.length&&lines[i].trim()&&!SECT.test(lines[i])&&/^\d/.test(lines[i].trim()))i++;
  const g=p.refd.match(/^(.*?)[-.]([A-Z])$/);if(g){p.ref=g[1];p.gate=g[2].charCodeAt(0)-65;}else p.ref=p.refd;
  out.push(p);return i;
}
function build(st,file){
  const mmPage=SIZE_MM[st.page]||SIZE_MM.B;const H=mmPage[1];
  const mx=v=>v/MIL,my=v=>H-v/MIL;
  const pinLen=name=>{const d=st.decals[name];if(!d)return /SHORT/.test(name)?100:/LONG/.test(name)?300:200;let m=0;d.pcs.forEach(pc=>pc.pts.forEach(q=>{m=Math.max(m,Math.abs(q[0]));}));return m;};
  const TYPE={L:'input',S:'output',B:'bidirectional',P:'power_in',G:'power_in',O:'open_collector',T:'tri_state'};
  const sheets=st.sheets.map((S,si)=>{
    const sh={file:file||'',name:S.name,title:'',rev:'',date:'',company:'',w:mmPage[0],h:mmPage[1],paper:SIZE_MM[st.page]?st.page:'B',symbols:[],wires:[],buses:[],junctions:[],nocon:[],labels:[],texts:[],lines:[],sheets:[],auto:false,pads:true};
    const pinAt=new Map();
    S.parts.forEach(p=>{const pt=st.ptypes[p.pt];if(pt&&pt.gates.length<=1&&p.ref!==p.refd){p.ref=p.refd;p.gate=0;}/* a dash in a plain reference, not a gate */
      const gate=pt&&pt.gates[p.gate]||pt&&pt.gates[0];const dn=gate&&(gate.decals[p.variant]||gate.decals[0])||p.pt;const d=st.decals[dn];if(!d)return;
      const c=[1,0,-1,0][p.rot&3],s=[0,1,0,-1][p.rot&3];
      const T=(lx,ly)=>{if(p.mir&1)lx=-lx;if(p.mir&2)ly=-ly;const X=p.x+lx*c-ly*s,Y=p.y+lx*s+ly*c;return[mx(X),my(Y)];};
      const sym={ref:p.ref,val:p.vals.Value||p.vals.VALUE||p.pt,fp:p.vals['PCB DECAL']||'',mpn:p.vals['Part Number']||p.vals['COMPANY P/N']||'',desc:p.vals.Description||'',lib:'pads:'+dn,power:false,x:mx(p.x),y:my(p.y),rot:(p.rot&3)*90,mir:'',g:[],pins:[],texts:[]};
      d.pcs.forEach(pc=>{const w=Math.max(0.15,pc.w/MIL);
        if(pc.k==='CIRCLE'&&pc.pts.length===2){const a=T(...pc.pts[0]),b=T(...pc.pts[1]);sym.g.push({t:'circle',c:[(a[0]+b[0])/2,(a[1]+b[1])/2],r:Math.hypot(b[0]-a[0],b[1]-a[1])/2,fill:'none',w});}
        else if(pc.pts.length>1)sym.g.push({t:'poly',pts:pc.pts.map(q=>T(q[0],q[1])),fill:pc.k==='COPCLS'?'outline':'none',w});});
      d.pins.forEach((pn,k)=>{const gp=gate&&gate.pins[k]||{num:String(k+1),type:'U',name:''};const len=pn.decal?pinLen(pn.decal):0;
        const vert=/VRT/.test(pn.decal);let dx=0,dy=0;const a=((pn.ang%360)+360)%360;
        if(vert){dy=pn.side===2?1:-1;}else if(a>=45&&a<135)dy=pn.side>=2?-1:1;else if(a>=225&&a<315)dy=pn.side>=2?1:-1;else if(a>=135&&a<225)dx=pn.side&1?1:-1;else dx=pn.side&1?-1:1;
        const P=T(pn.x,pn.y),E=T(pn.x+dx*len,pn.y+dy*len);
        const pin={num:gp.num,name:gp.name||'',type:TYPE[gp.type]||'passive',p:P,e:E,nameShow:!!gp.name&&!pn.hideName,numShow:true,nameOff:0.508};sym.pins.push(pin);
        pinAt.set(p.refd+'.'+gp.num,pin);});
      const at=nm=>p.attrs.find(a=>a.name===nm);const ar=at('REF-DES')||d.attrs.find(a=>a.name==='REF-DES'),av=at('Value')||at('VALUE')||d.attrs.find(a=>/^VALUE$/i.test(a.name))||at('PART-TYPE')||d.attrs.find(a=>a.name==='PART-TYPE');
      if(ar&&!(ar.vis&8))sym.texts.push({s:p.ref+(pt&&pt.gates.length>1?String.fromCharCode(65+p.gate):''),p:T(ar.x,ar.y),rot:0,fx:{size:1.27,h:'left',v:'middle'},role:'Reference'});
      if(av)sym.texts.push({s:sym.val,p:T(av.x,av.y),rot:0,fx:{size:1.27,h:'left',v:'middle'},role:'Value'});
      if(pt&&pt.gates.length>1){sym._unit=p.gate+1;}
      SCH.finishBB(sym,0.3);sh.symbols.push(sym);});
    const offAt=new Map(),dotAt=new Map();
    S.dots.forEach(d=>{const q=[mx(d.x),my(d.y)];dotAt.set(d.id,q);sh.junctions.push(q);});
    S.offs.forEach(o=>{const q=[mx(o.x),my(o.y)];offAt.set(o.id,q);const lib=o.lib;
      if(lib==='$PWR_SYMS'||lib==='$GND_SYMS'){const gnd=lib==='$GND_SYMS';const d=gnd?[1,0,3,2][o.rot&3]:[3,2,1,0][o.rot&3];sh.symbols.push(SCH.powerSym(o.net,q,d,gnd));}
      else sh.labels.push({kind:'global',s:o.net,p:q,rot:((o.rot&3)*90+180)%360,shape:'bidirectional',fx:{size:1.27,h:'left',v:'middle'}});});
    const end=id=>pinAt.has(id)?pinAt.get(id).p:offAt.has(id)?offAt.get(id):dotAt.has(id)?dotAt.get(id):null;
    S.sigs.forEach(sig=>{let named=sig.anon||S.offs.some(o=>o.net===sig.name);
      sig.segs.forEach(sg=>{const pts=sg.pts.map(q=>[mx(q[0]),my(q[1])]);if(!pts.length)return;
        const a=end(sg.a),b=end(sg.b);if(a&&Math.hypot(a[0]-pts[0][0],a[1]-pts[0][1])>1e-3)pts.unshift(a);if(b&&Math.hypot(b[0]-pts[pts.length-1][0],b[1]-pts[pts.length-1][1])>1e-3)pts.push(b);
        for(let k=1;k<pts.length;k++)if(Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1])>1e-4)sh.wires.push({a:pts[k-1],b:pts[k]});
        // a named signal with no off-page reference keeps its name as a local label at its first wire point
        if(!named&&pts.length){sh.labels.push({kind:'local',s:sig.name,p:pts[0],rot:0,fx:{size:1.27,h:'left',v:'bottom'}});named=true;}});});
    S.texts.forEach(t=>sh.texts.push({s:t.s,p:[mx(t.x),my(t.y)],rot:(t.rot&3)*90,fx:{size:Math.max(0.8,t.h/MIL),h:'left',v:'bottom'}}));
    S.lines.forEach(L=>sh.lines.push(L.map(q=>[mx(q[0]),my(q[1])])));
    return sh;});
  return sheets.filter((sh,i)=>sh.symbols.length||sh.wires.length||sh.labels.length||i===0);
}

return{toLogic,toNetlist,parseLogic,isLogic,MIL};
})();
if(typeof module!=='undefined')module.exports=PADSSCH;
