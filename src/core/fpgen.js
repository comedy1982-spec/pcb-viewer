/* Footprint generator for parts that are not in the built-in footprint library.
   Builds a land pattern from the package family and the pin count (IPC-7351 nominal-ish values, good enough for placement,
   routing and 3D; verify against the manufacturer's land pattern before fabrication). Registers the result in PCB.FP. */
const FPGEN=(function(){
"use strict";
const r3=v=>Math.round(v*1000)/1000;
/* package family from a free-form name: 'SOT-23-5', 'SOT23-6', 'TSOT-25', 'SOIC-14', 'TSSOP-20', 'QFN-24 4x4', 'DFN-8', 'DIP-8', 'TO-252', 'SOT-89', 'HDR-1x6' */
function family(pkg){const s=String(pkg||'').toUpperCase().replace(/\s+/g,'_');let m;
  if((m=s.match(/^(?:T?SOT|SC)-?(23|70|353|363|23-|)-?(\d)?/))&&/SOT|SC/.test(s)){const n=+(s.match(/-(\d)$/)||s.match(/(\d)$/)||[])[1]||3;if(/SOT-?89/.test(s))return{fam:'SOT-89',n:3};if(/SOT-?223/.test(s))return{fam:'SOT-223',n:4};return{fam:'SOT-23',n:n>=3&&n<=8?n:3};}
  if(/SOT-?89/.test(s))return{fam:'SOT-89',n:3};
  if(/SOT-?223/.test(s))return{fam:'SOT-223',n:4};
  if((m=s.match(/^(SOIC|SO|SOP|SSOP|TSSOP|MSOP|HTSSOP|VSSOP|QSOP)-?(\d+)/)))return{fam:/^(TSSOP|HTSSOP|MSOP|VSSOP|SSOP|QSOP)$/.test(m[1])?'TSSOP':'SOIC',n:+m[2],ep:/^H/.test(m[1])};
  if((m=s.match(/^(QFN|DFN|VQFN|WQFN|UQFN|TQFN|MLF|SON|WSON|VSON|DFN)-?(\d+)/)))return{fam:/^(DFN|SON|WSON|VSON)$/.test(m[1])?'DFN':'QFN',n:+m[2],ep:true,size:(s.match(/(?:^|[_-])(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/)||[]).slice(1,3).map(Number)};
  if((m=s.match(/^(TQFP|LQFP|QFP|MQFP)-?(\d+)/)))return{fam:'QFP',n:+m[2],size:(s.match(/(?:^|[_-])(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/)||[]).slice(1,3).map(Number)};
  if((m=s.match(/^(DIP|PDIP|DIL)-?(\d+)/)))return{fam:'DIP',n:+m[2]};
  if((m=s.match(/^(TO-?252|DPAK|TO-?263|D2PAK|TO-?220)/)))return{fam:/263|D2/.test(s)?'TO-263':/220/.test(s)?'TO-220':'TO-252',n:3};
  if((m=s.match(/^(HDR|HEADER|PIN|JST|CONN?)[-_]?(\d+)X(\d+)/)))return{fam:'HDR',rows:+m[2],n:+m[2]*+m[3],pitch:/JST|PH/.test(s)?2.0:2.54};
  if((m=s.match(/^(\d{4})$/))&&['0201','0402','0603','0805','1206','1210','2010','2512'].includes(m[1]))return{fam:'CHIP',code:m[1],n:2};
  if((m=s.match(/^(SMA|SMB|SMC|DO-?214)/)))return{fam:'SMA',n:2};
  return null;}
/* dual-row gull-wing (SOIC / TSSOP / SOT-23-N) */
function dual(n,pitch,rowGap,padL,padW,body,kind,ep){const half=n/2,pads=[];const y0=(half-1)/2*pitch;
  for(let i=0;i<half;i++)pads.push({n:''+(1+i),x:r3(-rowGap/2),y:r3(y0-i*pitch),w:padL,h:padW});
  for(let i=0;i<half;i++)pads.push({n:''+(half+1+i),x:r3(rowGap/2),y:r3(-y0+i*pitch),w:padL,h:padW});
  if(ep)pads.push({n:''+(n+1),x:0,y:0,w:r3(Math.max(1,body[0]*0.5)),h:r3(Math.max(1,body[1]*0.6))});
  return{kind,stand:0.05,body,pads,dot:[r3(-body[0]/2+0.5),r3(y0)],gen:true};}
/* quad (QFN / QFP), pin 1 at the top of the left row, counter-clockwise like the built-in QFN-32/TQFP-144 */
function quad(n,pitch,span,padL,padW,body,ep){const q=n/4,pads=[];const s0=(q-1)/2*pitch;
  for(let i=0;i<q;i++){pads.push({n:''+(1+i),x:r3(-span/2),y:r3(s0-i*pitch),w:padL,h:padW});pads.push({n:''+(q+1+i),x:r3(-s0+i*pitch),y:r3(-span/2),w:padW,h:padL});
    pads.push({n:''+(2*q+1+i),x:r3(span/2),y:r3(-s0+i*pitch),w:padL,h:padW});pads.push({n:''+(3*q+1+i),x:r3(s0-i*pitch),y:r3(span/2),w:padW,h:padL});}
  if(ep)pads.push({n:''+(n+1),x:0,y:0,w:r3(body[0]*0.55),h:r3(body[1]*0.55)});
  pads.sort((a,b)=>a.n-b.n);return{kind:'ic',stand:0.02,body,pads,dot:[r3(-body[0]/2+0.6),r3(body[1]/2-0.6)],gen:true};}
function make(pkg,nPins){const f=family(pkg);if(!f)return null;const n=nPins&&nPins>=2?nPins:f.n;
  switch(f.fam){
    case'CHIP':{const d={'0201':[0.6,0.3,0.25,0.3,0.4,0.4],'0402':[1.0,0.5,0.35,0.5,0.6,0.6],'0603':[1.6,0.8,0.45,0.8,0.8,0.9],'0805':[2.0,1.25,0.6,1.0,1.0,1.3],'1206':[3.2,1.6,0.6,1.5,1.2,1.8],'1210':[3.2,2.5,1.6,1.5,1.2,2.7],'2010':[5.0,2.5,0.6,2.3,1.4,2.8],'2512':[6.3,3.2,0.6,2.9,1.6,3.5]}[f.code];
      return{kind:'chip',body:[d[0],d[1],d[2]],pads:[{n:'1',x:-d[3],y:0,w:d[4],h:d[5]},{n:'2',x:d[3],y:0,w:d[4],h:d[5]}],gen:true};}
    case'SMA':return{kind:'diode',body:[4.3,2.6,2.1],pads:[{n:'1',x:-2.0,y:0,w:1.5,h:1.7},{n:'2',x:2.0,y:0,w:1.5,h:1.7}],gen:true};
    case'SOT-23':{if(n===3)return{kind:'ic',stand:0.05,body:[2.9,1.3,1.0],pads:[{n:'1',x:-0.95,y:-1.05,w:0.6,h:0.9},{n:'2',x:0.95,y:-1.05,w:0.6,h:0.9},{n:'3',x:0,y:1.05,w:0.6,h:0.9}],gen:true};
      const k=n%2?n+1:n;const pitch=k<=6?0.95:0.65;const o=dual(k,pitch,2.6,0.9,pitch<0.8?0.4:0.6,[2.9,1.6,1.1],'ic',false);
      // 5-pin (SOT-23-5 / TSOT-25): pins 1-3 on one side, 4-5 on the other (pin 4 opposite pin 3, pin 5 opposite pin 1)
      if(n===5){o.pads=o.pads.filter(p=>p.n!=='5').map(p=>({...p,n:p.n==='6'?'5':p.n}));}
      return o;}
    case'SOT-89':return{kind:'ic',stand:0.05,body:[4.5,2.5,1.5],pads:[{n:'1',x:-1.5,y:-2.0,w:1.0,h:1.4},{n:'2',x:0,y:-1.1,w:1.6,h:3.2},{n:'3',x:1.5,y:-2.0,w:1.0,h:1.4}],gen:true};
    case'SOT-223':return{kind:'ic',stand:0.1,body:[6.5,3.5,1.7],pads:[{n:'1',x:-2.3,y:-3.15,w:0.95,h:2},{n:'2',x:0,y:-3.15,w:0.95,h:2},{n:'3',x:2.3,y:-3.15,w:0.95,h:2},{n:'4',x:0,y:3.15,w:3.3,h:2}],gen:true};
    case'TO-252':return{kind:'ic',stand:0.02,body:[6.6,6.1,2.3],pads:[{n:'1',x:-2.28,y:-4.5,w:1.2,h:2.2},{n:'2',x:0,y:0.6,w:5.6,h:6.6},{n:'3',x:2.28,y:-4.5,w:1.2,h:2.2}],gen:true};
    case'TO-263':return{kind:'ic',stand:0.02,body:[10.2,9.2,4.5],pads:[{n:'1',x:-2.54,y:-7.0,w:1.6,h:3.0},{n:'2',x:0,y:1.0,w:10.0,h:9.0},{n:'3',x:2.54,y:-7.0,w:1.6,h:3.0}],gen:true};
    case'TO-220':return{kind:'ic',stand:0,body:[10.2,4.6,15],pads:[-2.54,0,2.54].map((x,i)=>({n:''+(i+1),x,y:0,w:1.9,h:1.9,round:true,drill:1.0})),gen:true};
    case'SOIC':{const k=n%2?n+1:n;const half=k/2;const L=half*1.27+0.5;const wide=k>16;return dual(k,1.27,wide?9.4:5.4,1.55,0.6,[wide?7.5:3.9,r3(L),1.5],'ic',f.ep);}
    case'TSSOP':{const k=n%2?n+1:n;const half=k/2;const pitch=k>=38?0.5:0.65;const L=r3(half*pitch+0.6);return dual(k,pitch,5.8,1.45,pitch<0.6?0.3:0.4,[4.4,L,1.1],'ic',f.ep);}
    case'DFN':{const k=n%2?n+1:n;const half=k/2;const pitch=k<=8?0.65:0.5;const w=f.size&&f.size[0]||(k<=6?2:3),h=f.size&&f.size[1]||(k<=6?2:3);return dual(k,pitch,r3(w-0.3),0.7,pitch<0.6?0.25:0.3,[w,h,0.8],'ic',true);}
    case'QFN':{let k=n%4?n+(4-n%4):n;const q=k/4;const size=f.size&&f.size[0]||(k<=16?3:k<=24?4:k<=32?5:k<=48?7:k<=64?9:10);const pitch=r3(Math.min(0.65,Math.max(0.4,(size-1.0)/q)));return quad(k,pitch,r3(size-0.1),0.8,r3(Math.min(0.3,pitch*0.55)),[size,size,0.9],true);}
    case'QFP':{let k=n%4?n+(4-n%4):n;const q=k/4;const size=f.size&&f.size[0]||(k<=32?7:k<=48?7:k<=64?10:k<=100?14:k<=144?20:28);const pitch=r3(Math.min(0.8,Math.max(0.4,(size-1.5)/q)));return quad(k,pitch,r3(size+1.5),1.5,r3(Math.min(0.3,pitch*0.55)),[size,size,1.2],false);}
    case'DIP':{const k=n%2?n+1:n;const half=k/2;const y0=(half-1)/2*2.54;const pads=[];for(let i=0;i<half;i++)pads.push({n:''+(1+i),x:-3.81,y:r3(y0-i*2.54),w:1.6,h:1.6,round:true,drill:0.8});for(let i=0;i<half;i++)pads.push({n:''+(half+1+i),x:3.81,y:r3(-y0+i*2.54),w:1.6,h:1.6,round:true,drill:0.8});
      return{kind:'ic',stand:0.5,body:[6.4,r3(half*2.54+0.5),3.3],pads,dot:[-2.5,r3(y0)],gen:true};}
    case'HDR':{const rows=f.rows||1,per=Math.ceil(n/rows),p=f.pitch||2.54;const y0=(per-1)/2*p;const pads=[];let k=1;for(let i=0;i<per;i++)for(let r=0;r<rows;r++)pads.push({n:''+(k++),x:r3((r-(rows-1)/2)*p),y:r3(y0-i*p),w:1.7,h:1.7,round:true,drill:1.0});
      return{kind:'hdr',body:[r3(rows*p),r3(per*p),2.5],pads,gen:true};}
  }
  return null;}
/* a canonical footprint name for the library key */
function name(pkg,n){const f=family(pkg);if(!f)return null;const k=n&&n>=2?n:f.n;
  switch(f.fam){case'CHIP':return f.code;case'SMA':return'SMA';case'SOT-23':return k===3?'SOT-23':'SOT-23-'+k;case'SOT-89':case'SOT-223':case'TO-252':case'TO-263':case'TO-220':return f.fam;
    case'HDR':return`HDR-${f.rows||1}x${Math.ceil(k/(f.rows||1))}`;default:return f.fam+'-'+k;}}
/* make sure PCB.FP has a footprint for this package; returns its name (or null when the package is unknown) */
function ensure(PCB,pkg,n){if(!PCB||!PCB.FP)return null;if(pkg&&PCB.FP[pkg])return pkg;const nm=name(pkg,n);if(!nm)return null;if(!PCB.FP[nm]){const fp=make(pkg,n);if(!fp)return null;lbb(fp);PCB.FP[nm]=fp;}return nm;}
function lbb(f){const[bw,bh]=f.body;let a=-bw/2,b=-bh/2,c=bw/2,d=bh/2;f.pads.forEach(p=>{a=Math.min(a,p.x-p.w/2);b=Math.min(b,p.y-p.h/2);c=Math.max(c,p.x+p.w/2);d=Math.max(d,p.y+p.h/2);});f.lbb=[a,b,c,d];return f;}
return{family,make,name,ensure,lbb};
})();
if(typeof module!=='undefined')module.exports=FPGEN;
