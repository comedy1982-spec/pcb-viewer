/* Pin-assignment recommender: matches each HSIS signal to an MCU pin whose datasheet function (ALT/AF) fits what the signal
   needs, and whose pad is close to the counterpart IC pin on the board. Signals of one bus (SPI, UART, CAN, I2C) get pins of the
   same peripheral instance; PWM/capture groups prefer one timer. Needs MCU_PINS (src/parts/mcu-pins.js). */
const PINREC=(function(){
"use strict";
const MP=typeof MCU_PINS!=='undefined'?MCU_PINS:(typeof require!=='undefined'?require('../parts/mcu-pins.js'):null);
const FIXED_CATS=/전원|접지|클럭|리셋|부트/;
const up=s=>String(s||'').toUpperCase();
const parsePins=s=>String(s||'').split(/[,;\s]+/).filter(Boolean).map(t=>t.replace(/^(pin|p)(?=\d)/i,''));

/* what an HSIS row needs */
function roleOf(it,peerRole){
  const f=up(it.func)+' '+up(it.periph),sig=up(it.signal),dir=up(it.dir),all=f+' '+sig;
  const out=/출력|OUT/.test(dir)&&!/입력|^IN/.test(dir),inp=/입력|^IN/.test(dir);
  if(FIXED_CATS.test(it.cat||it._cat||''))return null;
  if(/USB/.test(all)&&/D[MP]|DP|DM/.test(sig))return /DM|D-|N$/.test(sig)?'usb_dm':'usb_dp';
  if(/ADC|EVADC|\bAN\d|아날로그/.test(f)||/아날로그/.test(it.cat||''))return'adc';
  if(/SPI|QSPI/.test(f)){if(/SCK|SCLK|CLK/.test(all))return'spi_sck';if(/MOSI|MTSR|SDO/.test(all))return'spi_mosi';if(/MISO|MRST|SDI/.test(all))return'spi_miso';if(/NSS|CS|SLSO/.test(all))return'spi_cs';}
  if(/CAN/.test(f)){if(/TX/.test(all))return'can_tx';if(/RX/.test(all))return'can_rx';}
  if(/UART|USART|ASCLIN|LIN/.test(f)){if(/TX/.test(all))return'uart_tx';if(/RX/.test(all))return'uart_rx';}
  if(/I2C|IIC/.test(f)){if(/SCL/.test(all))return'i2c_scl';if(/SDA/.test(all))return'i2c_sda';}
  if(/PWM|TOUT|\bTOM|ATOM|TIM\d*_CH\d/.test(f)&&!inp)return'pwm';
  if(/캡처|CAPTURE|ICU|GTM_TIM|TIM\d*_CH\d/.test(f))return'cap';
  if(/인터럽트|IRQ|EXTI|ERU|E_REQ/.test(f))return'irq_in';
  if(!it.func&&peerRole)return peerRole;
  if(out)return'gpio_out';if(inp)return'gpio_in';
  return peerRole||'gpio_out';
}
// counterpart pin: first "REF.PIN" in the HW column that is not the MCU, else a non-MCU pad on the signal's net
function peerOf(B,it,mcuRef){
  const hw=[...String(it.hw||'').matchAll(/\b([A-Z]{1,3}\d+)\.([A-Za-z0-9]+)/g)];
  for(const m of hw){if(m[1]===mcuRef)continue;const c=B.byRef[m[1]];const p=c&&c.pads.find(q=>String(q.n)===m[2]);if(p)return{c,p};}
  const net=netFor(B,it);if(net&&B.nets[net]){const p=B.nets[net].pads.find(q=>q.ref!==mcuRef);if(p)return{c:B.byRef[p.ref],p};}
  return null;
}
function netFor(B,it){if(!it.net)return null;if(B.nets[it.net])return it.net;const k=up(it.net).replace(/[\s/]/g,'');return Object.keys(B.nets).find(n=>up(n).replace(/[\s/]/g,'')===k)||null;}

/* Hungarian algorithm (rows ≤ cols), returns col index per row */
function hungarian(a){
  const n=a.length,m=n?a[0].length:0;if(!n)return[];
  const INF=1e18,u=new Float64Array(n+1),v=new Float64Array(m+1),p=new Int32Array(m+1),way=new Int32Array(m+1);
  for(let i=1;i<=n;i++){p[0]=i;let j0=0;const minv=new Float64Array(m+1).fill(INF),used=new Uint8Array(m+1);
    do{used[j0]=1;const i0=p[j0];let d=INF,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){const cur=a[i0-1][j-1]-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<d){d=minv[j];j1=j;}}
      for(let j=0;j<=m;j++){if(used[j]){u[p[j]]+=d;v[j]-=d;}else minv[j]-=d;}j0=j1;}while(p[j0]!==0);
    do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);}
  const res=new Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j])res[p[j]-1]=j-1;return res;
}
const BIG=1e6;

/* main entry. opts.mode: 'keep' (keep valid existing pins) | 'all' (re-plan every signal) */
function recommend(B,H,mcuRef,opts){
  opts=opts||{};const mode=opts.mode||'keep';
  const mcu=B.byRef[mcuRef];if(!mcu)return{error:`보드에서 MCU ${mcuRef||''}를 찾지 못했습니다.`,recs:[]};
  const db=MP.find(mcu.mpn)||MP.find(mcu.val);
  if(!db)return{error:`${mcu.mpn||mcu.val}의 핀 기능 데이터가 없습니다. 지원: ${Object.keys(MP.DB).join(', ')}`,recs:[],mcu:mcuRef};
  const padOf=n=>mcu.pads.find(p=>String(p.n)===String(n));
  // signals to place
  const recs=[];
  H.items.forEach(it=>{
    const pins=parsePins(it.pins);if(FIXED_CATS.test(it.cat||it._cat||''))return;
    if(pins.length>1)return;
    const pr=peerOf(B,it,mcuRef);const pinfo=pr&&MP.peer(pr.c.mpn||pr.c.val);const pp=pinfo&&pinfo[pr.p.n];
    const role=roleOf(it,pp&&pp[1]);if(!role)return;
    recs.push({id:it.id,it,signal:it.signal,role,roleName:MP.ROLES[role]||role,peer:pr?{ref:pr.c.ref,pin:String(pr.p.n),name:pp?pp[0]:(pr.p.fn||''),note:pp&&pp[2]||'',mpn:pr.c.mpn||pr.c.val,x:pr.p.x,y:pr.p.y}:null,
      cur:pins[0]||null,group:null});
  });
  // groups
  recs.forEach(r=>{const bus=MP.BUS[r.role];if(!bus)return;const owner=r.peer?r.peer.ref:(up(r.it.periph)||up(r.it.swcfg)||'?');r.group=bus+':'+owner;});
  // pins taken by things we are not moving: board nets not covered by these signals, supply/reserved pins
  const myNets=new Set(recs.map(r=>netFor(B,r.it)).filter(Boolean));
  const taken=new Map();
  Object.entries(db.pins).forEach(([n,p])=>{if(p.supply)taken.set(n,p.name);else if(p.reserved)taken.set(n,p.reserved);});
  mcu.pads.forEach(p=>{if(p.net&&!myNets.has(p.net)&&!taken.has(String(p.n)))taken.set(String(p.n),'넷 '+p.net);});
  H.items.forEach(it=>{if(!recs.some(r=>r.it===it))parsePins(it.pins).forEach(n=>{if(!taken.has(n))taken.set(n,it.signal);});});
  // option tables
  // one timer channel / ADC channel / external-interrupt line can serve only one pin
  const resKey=o=>/^(pwm|cap|irq_in|adc)$/.test(o.role)&&o.ch!=null?`${o.inst}:${o.tim!=null?o.tim+'.':''}${o.ch}`:null;
  let usedRes=new Set();
  const optsFor=(n,role)=>MP.options(db,n).filter(o=>o.role===role&&!(resKey(o)&&usedRes.has(resKey(o))));
  const cost=(r,n,o)=>{const p=db.pins[n],pad=padOf(n);let c=0;
    if(r.peer&&pad)c+=Math.hypot(pad.x-r.peer.x,pad.y-r.peer.y);else if(pad)c+=Math.hypot(pad.x-mcu.x,pad.y-mcu.y)*0.2;
    // scarcity: using a pin that is one of few able to serve a role other pending signals still need costs extra
    const roles=new Set(MP.options(db,n).map(x=>x.role));roles.delete(r.role);
    roles.forEach(x=>{if(demand[x]&&!(demand[x]===1&&x===r.role))c+=Math.min(4,8/Math.max(1,supply[x]));});
    if(roles.has('adc')&&r.role!=='adc')c+=0.6;if(p.caution)c+=6;return c;};
  const validCur=r=>{if(!r.cur)return null;const p=db.pins[r.cur];if(!p)return{ok:false,why:`${mcu.ref}에 ${r.cur}번 핀이 없습니다.`};
    if(p.supply)return{ok:false,why:`${r.cur}번은 ${p.name} 전원 핀입니다.`};if(p.reserved)return{ok:false,why:`${r.cur}번은 ${p.reserved} 용도입니다.`};
    const o=optsFor(r.cur,r.role);if(!o.length)return{ok:false,why:`${r.cur}번(${p.name})에는 ${r.roleName} 기능이 없습니다${p.known===false?' (기능 표 미수록 포트)':''}.`};
    return{ok:true,o};};
  recs.forEach(r=>{r.curCheck=validCur(r);});
  const demand={},supply={};recs.forEach(r=>{if(!(mode==='keep'&&r.curCheck&&r.curCheck.ok))demand[r.role]=(demand[r.role]||0)+1;});
  Object.keys(db.pins).forEach(n=>{if(taken.has(n))return;new Set(MP.options(db,n).map(x=>x.role)).forEach(x=>{supply[x]=(supply[x]||0)+1;});});

  // fixed ones (keep mode)
  const fixed=new Map();
  if(mode==='keep')recs.forEach(r=>{if(r.curCheck&&r.curCheck.ok){r.fixed=true;fixed.set(r.cur,r);}});
  // a group with a fixed member pins the instance
  const groups={};recs.forEach(r=>{if(r.group)(groups[r.group]=groups[r.group]||[]).push(r);});
  let used=new Set([...taken.keys(),...fixed.keys()]);
  const pick=(r,n,o,why)=>{r.rec={pin:n,port:db.pins[n].port||db.pins[n].name,sel:o.sel,sig:o.sig,inst:o.inst,ch:o.ch,insel:o.insel,tim:o.tim,dist:distOf(r,n)};r.why=why;used.add(n);if(resKey(o))usedRes.add(resKey(o));};
  const distOf=(r,n)=>{const pad=padOf(n);return r.peer&&pad?Math.hypot(pad.x-r.peer.x,pad.y-r.peer.y):null;};
  recs.filter(r=>r.fixed).forEach(r=>{const o=(r.curCheck.o.find(x=>up(r.it.func).includes(up(x.sig)))||r.curCheck.o[0]);r.rec={pin:r.cur,port:db.pins[r.cur].port||db.pins[r.cur].name,sel:o.sel,sig:o.sig,inst:o.inst,ch:o.ch,insel:o.insel,tim:o.tim,dist:distOf(r,r.cur)};r.why='현재 배정이 데이터시트 기능과 맞아 유지합니다.';if(resKey(o))usedRes.add(resKey(o));});
  // candidate pins per role
  const cands=(role,inst)=>Object.keys(db.pins).filter(n=>!used.has(n)).map(n=>({n,o:optsFor(n,role).filter(o=>!inst||o.inst===inst)})).filter(x=>x.o.length);
  const assign=(members,inst)=>{ // Hungarian for members over pins offering their role (optionally in one instance)
    const pool=new Map();members.forEach(r=>cands(r.role,inst).forEach(x=>pool.set(x.n,true)));const cols=[...pool.keys()];if(cols.length<members.length)return null;
    const M=members.map(r=>cols.map(n=>{const o=optsFor(n,r.role).filter(o=>!inst||o.inst===inst);return o.length?cost(r,n,o[0]):BIG;}));
    const a=hungarian(M);let tot=0;for(let i=0;i<a.length;i++){if(a[i]<0||M[i][a[i]]>=BIG)return null;tot+=M[i][a[i]];}
    const map=members.map((r,i)=>{const n=cols[a[i]];return{r,n,o:optsFor(n,r.role).filter(o=>!inst||o.inst===inst)[0]};});
    const keys=map.map(m=>resKey(m.o)).filter(Boolean);if(new Set(keys).size===keys.length)return{tot,map};
    // shared timer/ADC channel between two chosen pins: assign one by one, most constrained first
    const lp=new Set(),lr=new Set(),out=[];let t2=0;
    const order=members.slice().sort((x,y)=>cands(x.role,inst).length-cands(y.role,inst).length);
    for(const r of order){let best=null;cands(r.role,inst).forEach(x=>{if(lp.has(x.n))return;x.o.forEach(o=>{const k=resKey(o);if(k&&lr.has(k))return;const c=cost(r,x.n,o);if(!best||c<best.c)best={c,n:x.n,o};});});
      if(!best)return null;lp.add(best.n);if(resKey(best.o))lr.add(resKey(best.o));t2+=best.c;out.push({r,n:best.n,o:best.o});}
    return{tot:t2,map:members.map(r=>out.find(m=>m.r===r))};};
  // 1) groups, most constrained first
  const strict=g=>/^(spi|uart|can|i2c|cap):/.test(g)||(db.family==='stm32'&&/^pwm:/.test(g));
  const gl=Object.entries(groups).map(([g,ms])=>({g,ms,todo:ms.filter(r=>!r.fixed)})).filter(x=>x.todo.length);
  const instOpts=x=>{const fixedInst=x.ms.filter(r=>r.fixed).map(r=>r.rec.inst);if(fixedInst.length)return[fixedInst[0]];
    const sets=x.todo.map(r=>new Set(Object.keys(db.pins).flatMap(n=>optsFor(n,r.role).map(o=>o.inst))));
    // SPI chip-select may fall back to a GPIO, so it does not restrict the instance
    const core=x.todo.map((r,i)=>r.role==='spi_cs'?null:sets[i]).filter(Boolean);if(!core.length)return[...sets[0]];
    return[...core[0]].filter(i=>core.every(s=>s.has(i)));};
  const solve=x=>{let best=null;
    if(strict(x.g)){for(const inst of instOpts(x)){
      const core=x.todo.filter(r=>r.role!=='spi_cs'),cs=x.todo.filter(r=>r.role==='spi_cs');
      const a=assign(core,inst);if(!a)continue;let tot=a.tot;const map=a.map.slice();
      // reserve core pins, then CS from the same instance or a GPIO
      a.map.forEach(m=>used.add(m.n));
      const csA=cs.length?(assign(cs,inst)||assign(cs.map(r=>Object.assign(Object.create(r),{role:'gpio_out'})),'DIO')):{tot:0,map:[]};
      a.map.forEach(m=>used.delete(m.n));
      if(!csA)continue;tot+=csA.tot+(csA.map.some(m=>m.o&&m.o.inst==='DIO')?2:0);
      csA.map.forEach((m,i)=>map.push({r:cs[i],n:m.n,o:m.o}));
      if(!best||tot<best.tot)best={tot,map,inst};}}
    if(!best&&/^(pwm|cap):/.test(x.g)){const a=assign(x.todo,null);if(a)best={tot:a.tot,map:a.map,inst:null};}
    return best;};
  const commit=(x,best)=>{
    if(!best){x.todo.forEach(r=>{r.why=`${x.g.split(':')[0].toUpperCase()} 묶음을 한 주변장치에 모두 놓을 수 있는 빈 핀이 없습니다.`;});return;}
    best.map.forEach(m=>pick(m.r,m.n,m.o,best.inst&&strict(x.g)?`${best.inst}로 ${x.g.split(':')[0].toUpperCase()} 신호를 한데 묶고, 상대 핀까지 거리가 가장 짧은 조합입니다.`:'상대 핀까지 거리가 가장 짧은 조합입니다.'));};
  // bus groups compete for the same multi-function pins: try every processing order (≤ 6 groups) and keep the cheapest
  const buses=gl.filter(x=>/^(spi|uart|can|i2c):/.test(x.g)),others=gl.filter(x=>!buses.includes(x)).sort((a,b)=>instOpts(a).length-instOpts(b).length);
  const perms=a=>a.length<=1?[a]:a.flatMap((x,i)=>perms(a.slice(0,i).concat(a.slice(i+1))).map(p=>[x].concat(p)));
  const orders=buses.length<=6?perms(buses):[buses.slice().sort((a,b)=>instOpts(a).length-instOpts(b).length)];
  let bestOrder=null;const base=used,baseR=usedRes;
  orders.forEach(ord=>{used=new Set(base);usedRes=new Set(baseR);let tot=0,miss=0;const sol=[];
    ord.forEach(x=>{const b=solve(x);sol.push(b);if(!b){miss++;return;}tot+=b.tot;b.map.forEach(m=>{used.add(m.n);if(resKey(m.o))usedRes.add(resKey(m.o));});});
    const score=miss*BIG+tot;if(!bestOrder||score<bestOrder.score)bestOrder={score,ord,sol};});
  used=base;usedRes=baseR;
  if(bestOrder)bestOrder.ord.forEach((x,i)=>commit(x,bestOrder.sol[i]));
  others.forEach(x=>commit(x,solve(x)));
  // 2) remaining single signals — one global matching
  const rest=recs.filter(r=>!r.fixed&&!r.rec&&!r.group);
  if(rest.length){const pool=new Set();rest.forEach(r=>cands(r.role,null).forEach(x=>pool.add(x.n)));const cols=[...pool];
    if(cols.length){const M=rest.map(r=>cols.map(n=>{const o=optsFor(n,r.role);return o.length?cost(r,n,o[0]):BIG;}));
      // pad with dummy columns so every row can be left unassigned when there are too few pins
      const W=Math.max(cols.length,rest.length);M.forEach(row=>{while(row.length<W)row.push(BIG);});
      const a=hungarian(M);rest.forEach((r,i)=>{const j=a[i];if(j>=0&&j<cols.length&&M[i][j]<BIG)pick(r,cols[j],optsFor(cols[j],r.role)[0],r.peer?`${r.peer.ref}.${r.peer.pin}${r.peer.name?' '+r.peer.name:''}에 가장 가까운 ${r.roleName} 가능 핀입니다.`:`${r.roleName}이 가능한 핀 중 다른 기능을 덜 빼앗는 핀입니다.`);});}}
  // status and alternatives
  recs.forEach(r=>{
    if(!r.rec){r.status='none';r.why=r.why||`${r.roleName} 기능이 있는 빈 핀이 없습니다.`;}
    else if(r.fixed)r.status='keep';else if(!r.cur)r.status='new';else if(r.cur===r.rec.pin)r.status='keep';else r.status='change';
    const inst=r.rec&&r.group&&strict(r.group)?r.rec.inst:null;
    r.alts=Object.keys(db.pins).filter(n=>n!==(r.rec&&r.rec.pin)&&(!used.has(n)||n===r.cur)&&!taken.has(n)).map(n=>({n,o:optsFor(n,r.role).filter(o=>!inst||o.inst===inst)})).filter(x=>x.o.length)
      .map(x=>({pin:x.n,port:db.pins[x.n].port,sig:x.o[0].sig,sel:x.o[0].sel,c:cost(r,x.n,x.o[0]),dist:distOf(r,x.n)})).sort((a,b)=>a.c-b.c).slice(0,3);
    const pad=r.rec&&padOf(r.rec.pin);r.line=pad&&r.peer?{a:[pad.x,pad.y],b:[r.peer.x,r.peer.y],side:pad.side==='B'?'B':'T'}:null;
  });
  const order={change:0,new:1,none:2,keep:3};recs.sort((a,b)=>order[a.status]-order[b.status]||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  const sum={change:0,new:0,none:0,keep:0};recs.forEach(r=>sum[r.status]++);
  return{mcu:mcuRef,db,mode,recs,sum,taken};
}

/* apply recommendations: HSIS rows get the new pin/port/function, the MCU pad joins the signal's net on the board */
function apply(B,H,res,ids){
  const mcu=B.byRef[res.mcu];const changed=[];
  res.recs.forEach(r=>{if(!r.rec||r.status==='none'||(ids&&!ids.includes(r.id)))return;
    const it=r.it,net=netFor(B,it)||it.net||(r.peer&&B.byRef[r.peer.ref].pads.find(p=>String(p.n)===r.peer.pin).net)||it.signal;
    const old=parsePins(it.pins)[0];
    if(old&&old!==r.rec.pin){const op=mcu.pads.find(p=>String(p.n)===old);if(op&&op.net===net)op.net=null;}
    const np=mcu.pads.find(p=>String(p.n)===r.rec.pin);if(np)np.net=net;
    if(r.peer){const pp=B.byRef[r.peer.ref].pads.find(p=>String(p.n)===r.peer.pin);if(pp&&!pp.net)pp.net=net;}
    if(!it.net)it.net=net;
    const changedPin=it.pins!==r.rec.pin;
    it.pins=r.rec.pin;it.port=r.rec.port;it.func=r.rec.sig;if(r.rec.inst&&r.rec.inst!=='DIO')it.periph=r.rec.inst;
    it._sel=r.rec.sel;it._insel=r.rec.insel;it._tim=r.rec.tim;it._ch=r.rec.ch;
    if(changedPin||r.status!=='keep')changed.push(r.id);});
  relink(B);return changed;
}
function relink(B){Object.values(B.nets).forEach(n=>{n.pads=[];});
  B.comps.forEach(c=>c.pads.forEach(p=>{if(!p.net)return;const n=B.nets[p.net]||(B.nets[p.net]={name:p.net,pads:[],tracks:[],vias:[],zones:0,len:{T:0,B:0}});n.pads.push(p);}));
  Object.keys(B.nets).forEach(k=>{const n=B.nets[k];if(!n.pads.length&&!n.tracks.length&&!n.vias.length&&!n.zones)delete B.nets[k];});
  if(B.netOrder)B.netOrder=Object.keys(B.nets).sort((a,b)=>{const r=x=>B.netClass(x)==='접지'?0:B.netClass(x)==='전원'?1:2;return r(a)-r(b)||a.localeCompare(b,undefined,{numeric:true});});
}
return{recommend,apply,roleOf,hungarian,relink};
})();
if(typeof module!=='undefined')module.exports=PINREC;
