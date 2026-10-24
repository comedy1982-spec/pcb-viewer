/* System diagram (step 1 of the design flow): blocks and the interfaces between them.
   fromPlan(plan) reads a NEWPROJ plan through NEWPROJ.build: which block makes which rail, which block uses it,
   which MCU signals each block needs (PWM, CAN, SPI…), and the connectors that leave the board.
   fromBoard(B) draws the same picture from a finished board (examples, imported KiCad) with part roles and shared nets.
   layout() puts the flow left to right — outside → power → control → functions → outside — and svg() draws it with
   labelled arrows (currentColor so it follows the page theme). */
const SYSDIAG=(function(){
"use strict";
const COLS=['외부 입력','전원','제어','기능','외부 연결'];
const ROLE_KO={pwm:'PWM',adc:'ADC',cap:'캡처',irq_in:'인터럽트',gpio_in:'GPIO 입력',gpio_out:'GPIO 출력',can_tx:'CAN TX',can_rx:'CAN RX',spi_sck:'SCK',spi_mosi:'MOSI',spi_miso:'MISO',spi_cs:'CS',uart_tx:'TX',uart_rx:'RX',i2c_scl:'SCL',i2c_sda:'SDA',usb_dm:'D−',usb_dp:'D+'};
const GROUP_KO={can:'CAN',spi:'SPI',uart:'UART',i2c:'I²C',pwm3:'PWM ×3',pwm6:'PWM ×6',spi2:'SPI (드라이버)',usb:'USB'};
const isPass=ref=>/^(R|C|L|FB|D|TP)\d/i.test(ref);
const isConnRef=ref=>/^(J|P|CN|X|CON|USB)\d/i.test(ref);
const isGnd=n=>/^(GND|AGND|PGND|DGND|VSS|0V)$/i.test(String(n||''));
const railV=n=>{const m=String(n||'').toUpperCase().match(/^\+?(\d+)V(\d*)$/);return m?+(m[1]+(m[2]?'.'+m[2]:'')):null;};
// short label for a list of nets: IN_U, IN_V, IN_W → IN_U/V/W
function netsLabel(list,max){list=[...new Set(list)].filter(Boolean);max=max||3;const g=new Map();
  list.forEach(n=>{const m=String(n).match(/^(.+[_\-])([A-Z0-9]{1,2})$/i);const k=m?m[1]:String(n);if(!g.has(k))g.set(k,[]);g.get(k).push(m?m[2]:null);});
  const parts=[...g].map(([k,v])=>v[0]==null?k:k+v.join('/'));return parts.length>max?parts.slice(0,max).join(' · ')+` +${parts.length-max}`:parts.join(' · ');}
function roleLabel(sigs){const g={},r={};sigs.forEach(s=>{if(s.group&&GROUP_KO[s.group])g[s.group]=1;else r[s.role]=(r[s.role]||0)+1;});
  return[...Object.keys(g).map(k=>GROUP_KO[k]),...Object.entries(r).map(([k,n])=>`${ROLE_KO[k]||k}${n>1?' ×'+n:''}`)].join(' · ');}
const dirOf=sigs=>{let o=0,i=0;sigs.forEach(s=>{if(/^(pwm|gpio_out|spi_sck|spi_mosi|spi_cs|uart_tx|can_tx)$/.test(s.role))o++;else if(/^(adc|cap|irq_in|gpio_in|spi_miso|uart_rx|can_rx)$/.test(s.role))i++;else{o++;i++;}});return o&&i?'both':o?'out':'in';};

/* ---- from a plan (new design) ---- */
function fromPlan(plan){
  const r=NEWPROJ.build(plan);const nodes=[],edges=[];const N=id=>nodes.find(n=>n.id===id);
  const mcuB=plan.blocks.find(b=>b.type==='mcu');
  plan.blocks.forEach(b=>{const L=NEWPROJ.LIB[b.type];const ps=r.parts.filter(p=>p.block===b.id);
    const main=ps.filter(p=>!isPass(p.ref)&&!isConnRef(p.ref)).map(p=>p.val);
    const prov=Object.entries(r.rails).filter(([,x])=>x.block===b.id).map(([k])=>k);
    const used=[...new Set(ps.flatMap(p=>Object.values(p.pins)).filter(n=>r.rails[n]&&!prov.includes(n)))];
    const col=b.type==='pwr_in'||b.type==='usb_in'||b.type==='buck'||b.type==='ldo'?1:b.type==='mcu'||b.type==='xtal'?2:3;
    const title=b.type==='mcu'?`MCU ${b.params.part?NEWPROJ.MCUS[NEWPROJ.mcuKey(b.params.part)]?NEWPROJ.MCUS[NEWPROJ.mcuKey(b.params.part)].val:b.params.part:''}`:b.type==='ldo'||b.type==='buck'?`${L.label} ${b.params.vout} V`:b.type==='pwr_in'?`${L.label} ${b.params.vin} V`:L.label;
    nodes.push({id:b.id,type:b.type,label:title,sub:[...new Set(main)].slice(0,3).join(' · '),col,prov,used,block:b});
    // connectors of the block leave the board
    ps.filter(p=>isConnRef(p.ref)).forEach(p=>{const pn=b.type==='pwr_in'?[`${b.params.vin} V DC`]:b.type==='usb_in'?['VBUS 5 V','D+/D−']:p.pinNames?Object.values(p.pinNames):Object.values(p.pins);const ext=b.type==='pwr_in'||b.type==='usb_in';
      const id='x_'+p.ref;nodes.push({id,type:'ext',label:p.desc?String(p.desc).split(/[—(·]/)[0].trim().slice(0,22):p.val,sub:`${p.ref} · ${p.val}`,col:ext?0:4,ext:true,part:p.ref});
      const pl=pn.filter(x=>!isGnd(x)&&!/^NC$/i.test(x));edges.push(ext?{a:id,b:b.id,kind:'ext',label:netsLabel(pl.length?pl:pn,3)}:{a:b.id,b:id,kind:'ext',label:netsLabel(pl,3)});});});
  // power: rail maker → users (other power blocks and the MCU get arrows; function blocks show the rails they use)
  Object.entries(r.rails).forEach(([rail,x])=>{if(!x.block)return;nodes.filter(n=>n.used&&n.used.includes(rail)&&n.id!==x.block).forEach(n=>{
    if(n.col<=2)edges.push({a:x.block,b:n.id,kind:'power',label:rail});});});
  // control signals between the MCU and each block
  if(mcuB){const by={};(r.sigs||[]).forEach(s=>{if(s.block&&s.block!==mcuB.id)(by[s.block]=by[s.block]||[]).push(s);});
    Object.entries(by).forEach(([bid,sigs])=>{const d=dirOf(sigs);edges.push({a:d==='in'?bid:mcuB.id,b:d==='in'?mcuB.id:bid,kind:'signal',both:d==='both',label:roleLabel(sigs)});});
    const xt=plan.blocks.find(b=>b.type==='xtal');if(xt)edges.push({a:xt.id,b:mcuB.id,kind:'signal',label:'클럭 '+(xt.params.freq||'')});}
  const D={src:'plan',name:plan.name,req:plan.req||'',nodes,edges,warn:r.warn,rails:r.rails,parts:r.parts.length,mcu:r.mcu,assigned:r.assigned};
  return layout(D);
}

/* ---- from a finished board ---- */
function fromBoard(B){
  const I=typeof AUTOPLACE!=='undefined'?AUTOPLACE.classify(B,{}):{list:B.comps.map(c=>({ref:c.ref,c,role:isConnRef(c.ref)?'conn':c.pads.length>=8?'ic':'passive'}))};
  const nodes=[],edges=[];const role=o=>o.mcu?'mcu':o.reg?'reg':o.driver?'driver':o.xtal?'xtal':o.conn?'conn':o.ic?'ic':null;
  const keep=I.list.filter(o=>role(o));const netsOf=c=>[...new Set(c.pads.map(p=>p.net).filter(n=>n&&!isGnd(n)))];
  const powerNet=n=>(B.netClass?B.netClass(n)==='전원':railV(n)!=null)&&!/MON|SENSE|_AN/i.test(n);
  const desc=c=>String(c.desc||'').split(/[—(·]/)[0].trim().slice(0,22);
  // regulator in / out from the rail voltages in the net names
  const regIO={};keep.filter(o=>role(o)==='reg').forEach(o=>{const rs=netsOf(o.c).filter(powerNet).map(n=>({n,v:railV(n)})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v);if(rs.length>=2)regIO[o.ref]={in:rs[0].n,out:rs[rs.length-1].n};});
  keep.forEach(o=>{const c=o.c,k=role(o);const nets=netsOf(c);const pw=nets.filter(powerNet);
    if(k==='conn'){const inPow=pw.length&&!nets.some(n=>!powerNet(n))||pw.some(n=>Object.values(regIO).some(x=>x.in===n))&&nets.length<=3;
      nodes.push({id:o.ref,type:'ext',label:desc(c)||c.val,sub:`${c.ref} · ${c.val}`,col:inPow?0:4,ext:true,part:c.ref,nets});return;}
    const col=k==='reg'?1:k==='mcu'||k==='xtal'?2:3;
    nodes.push({id:o.ref,type:k,label:k==='mcu'?`MCU ${c.val}`:k==='reg'?`${c.val}${regIO[o.ref]?` → ${regIO[o.ref].out}`:''}`:desc(c)||c.val,sub:`${c.ref} · ${c.val}`,col,nets,used:pw,prov:regIO[o.ref]?[regIO[o.ref].out]:[]});});
  // power: regulator (or input connector) → users
  const makers={};nodes.forEach(n=>{(n.prov||[]).forEach(r=>{makers[r]=n.id;});});
  nodes.filter(n=>n.col===0).forEach(n=>(n.nets||[]).filter(powerNet).forEach(r=>{if(!makers[r])makers[r]=n.id;}));
  // a connector that brings in a rail nobody makes is also the board's power input: show that side of it on the left
  nodes.filter(n=>n.ext&&n.col===4).forEach(n=>{const rs=(n.nets||[]).filter(r=>powerNet(r)&&!makers[r]&&Object.values(regIO).some(x=>x.in===r));if(!rs.length)return;
    const id=n.id+'~p';nodes.push({id,type:'ext',label:`${n.part} 전원 입력`,sub:`${n.sub}`,col:0,ext:true,part:n.part,nets:rs});rs.forEach(r=>{makers[r]=id;});});
  Object.entries(makers).forEach(([r,m])=>nodes.forEach(n=>{if(n.id===m||n.ext)return;if((n.nets||[]).includes(r)&&n.col<=2)edges.push({a:m,b:n.id,kind:'power',label:r});
    else if((n.nets||[]).includes(r)&&!n.used.includes(r))n.used.push(r);}));
  // signals: nets shared directly between two nodes
  const pairs={};Object.keys(B.nets).forEach(net=>{if(isGnd(net)||powerNet(net))return;const refs=[...new Set(B.nets[net].pads.map(p=>p.ref))].filter(r=>nodes.some(n=>n.id===r));
    for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++){const a=nodes.find(n=>n.id===refs[i]),b=nodes.find(n=>n.id===refs[j]);const[x,y]=a.col<=b.col?[a,b]:[b,a];const k=x.id+'>'+y.id;(pairs[k]=pairs[k]||{a:x.id,b:y.id,nets:[]}).nets.push(net);}});
  Object.values(pairs).forEach(p=>{const A=nodes.find(n=>n.id===p.a),Bn=nodes.find(n=>n.id===p.b);edges.push({a:p.a,b:p.b,kind:A.ext||Bn.ext?'ext':'signal',label:netsLabel(p.nets,3)});});
  return layout({src:'board',name:B.name,req:'',nodes,edges,warn:[],parts:B.comps.length});
}

/* ---- layout: five columns, each stacked and centred ---- */
const NW=176,NH=58,GX=140,GY=26,PAD=34;
function layout(D){
  const cols=[0,1,2,3,4].map(c=>D.nodes.filter(n=>n.col===c));
  // keep external nodes level with the block they belong to, and power blocks in voltage order
  cols[1].sort((a,b)=>(railV((b.prov||[])[0])||99)-(railV((a.prov||[])[0])||99));
  cols[2].sort((a,b)=>(a.type==='xtal'?-1:0)-(b.type==='xtal'?-1:0));
  const rank=id=>{for(const c of[1,2,3]){const i=cols[c].findIndex(n=>n.id===id);if(i>=0)return i;}return 99;};
  [0,4].forEach(c=>cols[c].sort((a,b)=>{const pa=D.edges.find(e=>e.a===a.id||e.b===a.id),pb=D.edges.find(e=>e.a===b.id||e.b===b.id);return rank(pa?(pa.a===a.id?pa.b:pa.a):'')-rank(pb?(pb.a===b.id?pb.b:pb.a):'');}));
  const used=[0,1,2,3,4].filter(c=>cols[c].length);const H=Math.max(...cols.map(c=>c.length))*(NH+GY)-GY;
  used.forEach((c,ci)=>{const h=cols[c].length*(NH+GY)-GY;cols[c].forEach((n,i)=>{n.x=PAD+ci*(NW+GX);n.y=PAD+28+(H-h)/2+i*(NH+GY);n.w=NW;n.h=NH;});});
  D.W=PAD*2+used.length*NW+(used.length-1)*GX;D.H=PAD*2+28+Math.max(H,NH)+30;D.cols=used;
  return D;}

/* ---- SVG ---- */
const xe=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const HUE={power:'#d9822b',signal:'#3d7fd9',ext:'currentColor'};
function svg(D,opts){opts=opts||{};const sel=opts.sel||null;const out=[];const N=id=>D.nodes.find(n=>n.id===id);
  out.push(`<svg class="sysd" viewBox="0 0 ${D.W} ${D.H}" role="img" aria-label="${xe(`${D.name||'시스템'} 시스템 다이어그램: 블록 ${D.nodes.length}개, 연결 ${D.edges.length}개`)}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans KR, system-ui, sans-serif">`);
  out.push(`<defs>${Object.entries(HUE).map(([k,c])=>`<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('')}</defs>`);
  // column headings
  D.cols.forEach((c,ci)=>{const x=PAD+ci*(NW+GX)+NW/2;out.push(`<text x="${x}" y="${PAD+8}" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.55" letter-spacing="0.04em">${COLS[c]}</text>`);});
  // edges: spread the ports along each side
  const ports={};const slot=(id,side)=>{const k=id+side;ports[k]=(ports[k]||0)+1;return ports[k];};const tot={};
  D.edges.forEach(e=>{const a=N(e.a),b=N(e.b);if(!a||!b)return;const sa=a.col<b.col?'R':a.col>b.col?'L':(a.y<b.y?'B':'T'),sb=a.col<b.col?'L':a.col>b.col?'R':(a.y<b.y?'T':'B');e._sa=sa;e._sb=sb;tot[e.a+sa]=(tot[e.a+sa]||0)+1;tot[e.b+sb]=(tot[e.b+sb]||0)+1;});
  const pt=(n,side,k,t)=>{const f=(k)/(t+1);return side==='R'?[n.x+n.w,n.y+n.h*f]:side==='L'?[n.x,n.y+n.h*f]:side==='B'?[n.x+n.w*f,n.y+n.h]:[n.x+n.w*f,n.y];};
  const labels=[];
  D.edges.forEach((e,i)=>{const a=N(e.a),b=N(e.b);if(!a||!b)return;const[x1,y1]=pt(a,e._sa,slot(e.a,e._sa),tot[e.a+e._sa]),[x2,y2]=pt(b,e._sb,slot(e.b,e._sb),tot[e.b+e._sb]);
    const on=sel&&(e.a===sel||e.b===sel),dim=sel&&!on;const c=HUE[e.kind]||'currentColor';
    let P;if(e._sa==='R'||e._sa==='L'){const dx=Math.max(30,Math.abs(x2-x1)*0.45)*(x2>x1?1:-1);P=[[x1,y1],[x1+dx,y1],[x2-dx,y2],[x2,y2]];}else{const dy=(y2-y1)*0.45;P=[[x1,y1],[x1,y1+dy],[x2,y2-dy],[x2,y2]];}
    const d=`M${P[0]} C${P[1]} ${P[2]} ${P[3]}`;
    // the label sits away from the crowded end (a fan-out from the MCU labels near each target)
    const ca=tot[e.a+e._sa]||1,cb=tot[e.b+e._sb]||1,t=ca>cb?0.72:cb>ca?0.28:0.5,u=1-t;const bz=k=>u*u*u*P[0][k]+3*u*u*t*P[1][k]+3*u*t*t*P[2][k]+t*t*t*P[3][k];
    out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${on?2.4:1.5}" ${e.kind==='power'?'stroke-dasharray="6 4"':''} opacity="${dim?0.18:e.kind==='ext'?0.7:0.95}" marker-end="url(#ar-${e.kind})"${e.both?` marker-start="url(#ar-${e.kind})"`:''} data-e="${i}"/>`);
    if(e.label)labels.push({x:bz(0),y:bz(1),t:e.label,c,dim,on});});
  // labels after the lines, nudged apart when they collide
  labels.sort((p,q)=>p.y-q.y);for(let i=1;i<labels.length;i++)for(let j=0;j<i;j++){const p=labels[i],q=labels[j];if(Math.abs(p.x-q.x)<90&&Math.abs(p.y-q.y)<15)p.y=q.y+15;}
  labels.forEach(l=>{const w=Math.min(170,l.t.length*6.6+10);out.push(`<g opacity="${l.dim?0.25:1}"><rect x="${l.x-w/2}" y="${l.y-8.5}" width="${w}" height="17" rx="4" fill="var(--surface,#fff)" stroke="${l.c}" stroke-opacity="0.35"/><text x="${l.x}" y="${l.y+4}" text-anchor="middle" font-size="11" fill="currentColor"${l.on?' font-weight="600"':''}>${xe(l.t.length>26?l.t.slice(0,25)+'…':l.t)}</text></g>`);});
  // nodes
  D.nodes.forEach(n=>{const on=sel===n.id,dim=sel&&!on&&!D.edges.some(e=>(e.a===sel&&e.b===n.id)||(e.b===sel&&e.a===n.id));
    const acc=n.type==='mcu'?'#3d7fd9':n.col===1?'#d9822b':n.ext?null:'currentColor';
    out.push(`<g class="sd-n" data-n="${xe(n.id)}" tabindex="0" role="button" aria-label="${xe(n.label)}" opacity="${dim?0.35:1}" style="cursor:pointer">`);
    out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.ext?18:8}" fill="var(--raised,#fff)" stroke="${on?'#3d7fd9':'currentColor'}" stroke-opacity="${on?1:0.35}" stroke-width="${on?2:1}"${n.ext?' stroke-dasharray="4 3"':''}/>`);
    if(acc)out.push(`<rect x="${n.x}" y="${n.y+8}" width="3.5" height="${n.h-16}" rx="1.5" fill="${acc}"/>`);
    out.push(`<text x="${n.x+12}" y="${n.y+22}" font-size="12.5" font-weight="600" fill="currentColor">${xe(n.label.length>22?n.label.slice(0,21)+'…':n.label)}</text>`);
    out.push(`<text x="${n.x+12}" y="${n.y+38}" font-size="10.5" fill="currentColor" opacity="0.62">${xe((n.sub||'').slice(0,28))}</text>`);
    const pw=(n.used||[]).filter(r=>!(n.prov||[]).includes(r));if(!n.ext&&n.col===3&&pw.length)out.push(`<text x="${n.x+12}" y="${n.y+51}" font-size="10" fill="${HUE.power}">전원 ${xe(pw.join(' · ').slice(0,26))}</text>`);
    else if((n.prov||[]).length)out.push(`<text x="${n.x+12}" y="${n.y+51}" font-size="10" fill="${HUE.power}">출력 ${xe(n.prov.join(' · '))}</text>`);
    out.push(`</g>`);});
  // legend (the encodings repeat)
  const ly=D.H-14;out.push(`<g font-size="10.5" fill="currentColor" opacity="0.75"><line x1="${PAD}" y1="${ly}" x2="${PAD+24}" y2="${ly}" stroke="${HUE.power}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${PAD+30}" y="${ly+3.5}">전원 레일</text>
    <line x1="${PAD+110}" y1="${ly}" x2="${PAD+134}" y2="${ly}" stroke="${HUE.signal}" stroke-width="1.5"/><text x="${PAD+140}" y="${ly+3.5}">MCU 신호</text>
    <line x1="${PAD+222}" y1="${ly}" x2="${PAD+246}" y2="${ly}" stroke="currentColor" stroke-width="1.5" opacity="0.7"/><text x="${PAD+252}" y="${ly+3.5}">보드 밖 연결 (커넥터)</text></g>`);
  out.push('</svg>');return out.join('');}
function text(D){const N=id=>D.nodes.find(n=>n.id===id);const L=[`시스템 다이어그램 · ${D.name||''} · 블록 ${D.nodes.filter(n=>!n.ext).length} · 외부 ${D.nodes.filter(n=>n.ext).length} · 연결 ${D.edges.length} (${D.src==='plan'?'설계 계획':'보드에서 추출'})`];
  D.cols.forEach(c=>{const ns=D.nodes.filter(n=>n.col===c);if(!ns.length)return;L.push(`[${COLS[c]}] `+ns.map(n=>`${n.id} ${n.label}${n.sub?` (${n.sub})`:''}`).join(' · '));});
  L.push('연결:');D.edges.forEach(e=>{const a=N(e.a),b=N(e.b);L.push(`  ${a?a.label:e.a} ${e.both?'↔':'→'} ${b?b.label:e.b} : ${e.label||''} [${{power:'전원',signal:'신호',ext:'외부'}[e.kind]}]`);});
  if(D.warn&&D.warn.length)L.push('경고: '+D.warn.join(' · '));return L.join('\n');}
return{fromPlan,fromBoard,layout,svg,text,COLS,netsLabel};
})();
if(typeof module!=='undefined')module.exports=SYSDIAG;
