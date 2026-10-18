/* ---------- export: SVG / PNG of any view, Excel of any table, and a whole-design HTML report (print → PDF) ----------
   SvgCtx records the same 2D-canvas calls the viewer paints with (drawSide, paintSchV) and writes them out as SVG, so the vector
   export is exactly what the screen shows. Everything lands in a file through offerFile (File System Access or a download). */

/* ---- a CanvasRenderingContext2D look-alike that records to SVG ---- */
function SvgCtx(w,h){
  this.w=w;this.h=h;this.out=[];this.defs=[];this.stack=[];this.path=[];this.cur=null;this.nclip=0;this.canvas={width:w,height:h};
  this.st={m:[1,0,0,1,0,0],alpha:1,fill:'#000',stroke:'#000',lw:1,cap:'butt',join:'miter',dash:null,font:'10px sans-serif',align:'start',base:'alphabetic',groups:0};
  const P=(k,key)=>Object.defineProperty(this,k,{get:()=>this.st[key],set:v=>{this.st[key]=v;}});
  P('fillStyle','fill');P('strokeStyle','stroke');P('lineWidth','lw');P('lineCap','cap');P('lineJoin','join');P('globalAlpha','alpha');P('font','font');P('textAlign','align');P('textBaseline','base');
  ['shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY','imageSmoothingEnabled','miterLimit','globalCompositeOperation'].forEach(k=>{this[k]=0;});
}
SvgCtx.prototype={
  _n(v){return(Math.round(v*100)/100).toString();},
  _pt(x,y){const m=this.st.m;return[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];},
  _scale(){const m=this.st.m;return Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))||1;},
  _mul(a){const m=this.st.m;this.st.m=[m[0]*a[0]+m[2]*a[1],m[1]*a[0]+m[3]*a[1],m[0]*a[2]+m[2]*a[3],m[1]*a[2]+m[3]*a[3],m[0]*a[4]+m[2]*a[5]+m[4],m[1]*a[4]+m[3]*a[5]+m[5]];},
  setTransform(a,b,c,d,e,f){this.st.m=typeof a==='object'?[a.a,a.b,a.c,a.d,a.e,a.f]:[a,b,c,d,e,f];},
  resetTransform(){this.st.m=[1,0,0,1,0,0];},
  getTransform(){const m=this.st.m;return{a:m[0],b:m[1],c:m[2],d:m[3],e:m[4],f:m[5]};},
  transform(a,b,c,d,e,f){this._mul([a,b,c,d,e,f]);},
  translate(x,y){this._mul([1,0,0,1,x,y]);},
  scale(x,y){this._mul([x,0,0,y,0,0]);},
  rotate(r){const c=Math.cos(r),s=Math.sin(r);this._mul([c,s,-s,c,0,0]);},
  save(){this.stack.push(Object.assign({},this.st,{m:this.st.m.slice(),groups:0}));},
  restore(){const g=this.st.groups;for(let i=0;i<g;i++)this.out.push('</g>');const s=this.stack.pop();if(s)this.st=s;},
  beginPath(){this.path=[];this.cur=null;},
  closePath(){if(this.path.length)this.path.push('Z');},
  moveTo(x,y){const p=this._pt(x,y);this.path.push('M'+this._n(p[0])+' '+this._n(p[1]));this.cur=[x,y];},
  lineTo(x,y){const p=this._pt(x,y);this.path.push((this.path.length?'L':'M')+this._n(p[0])+' '+this._n(p[1]));this.cur=[x,y];},
  rect(x,y,w,h){this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();this.cur=[x,y];},
  arc(x,y,r,a0,a1,ccw){if(!(r>=0))return;let d=a1-a0;if(ccw){if(d>0)d-=Math.PI*2*Math.ceil(d/(Math.PI*2));if(d===0&&a1!==a0)d=-Math.PI*2;}else{if(d<0)d+=Math.PI*2*Math.ceil(-d/(Math.PI*2));}
    if(Math.abs(d)>Math.PI*2)d=Math.sign(d)*Math.PI*2;const n=Math.max(4,Math.ceil(Math.abs(d)/(Math.PI/12)*Math.max(1,Math.min(3,r*this._scale()/8))));
    for(let i=0;i<=n;i++){const a=a0+d*i/n;const px=x+r*Math.cos(a),py=y+r*Math.sin(a);if(i===0&&this.cur==null)this.moveTo(px,py);else this.lineTo(px,py);}},
  arcTo(x1,y1,x2,y2,r){const p0=this.cur||[x1,y1];if(!this.cur)this.moveTo(x1,y1);
    const v1=[p0[0]-x1,p0[1]-y1],v2=[x2-x1,y2-y1];const l1=Math.hypot(v1[0],v1[1]),l2=Math.hypot(v2[0],v2[1]);if(!l1||!l2||r<=0){this.lineTo(x1,y1);return;}
    const u1=[v1[0]/l1,v1[1]/l1],u2=[v2[0]/l2,v2[1]/l2];const cosT=Math.max(-1,Math.min(1,u1[0]*u2[0]+u1[1]*u2[1]));const th=Math.acos(cosT);if(th<1e-6||Math.abs(th-Math.PI)<1e-6){this.lineTo(x1,y1);return;}
    const t=r/Math.tan(th/2);const t1=[x1+u1[0]*t,y1+u1[1]*t],t2=[x1+u2[0]*t,y1+u2[1]*t];const bis=[u1[0]+u2[0],u1[1]+u2[1]],bl=Math.hypot(bis[0],bis[1]);const c=[x1+bis[0]/bl*r/Math.sin(th/2),y1+bis[1]/bl*r/Math.sin(th/2)];
    const a0=Math.atan2(t1[1]-c[1],t1[0]-c[0]),a1=Math.atan2(t2[1]-c[1],t2[0]-c[0]);const cross=u1[0]*u2[1]-u1[1]*u2[0];this.lineTo(t1[0],t1[1]);this.arc(c[0],c[1],r,a0,a1,cross>0);this.cur=t2;},
  ellipse(x,y,rx,ry,rot,a0,a1,ccw){const n=24;let d=a1-a0;if(ccw&&d>0)d-=Math.PI*2;if(!ccw&&d<0)d+=Math.PI*2;for(let i=0;i<=n;i++){const a=a0+d*i/n;const ex=rx*Math.cos(a),ey=ry*Math.sin(a);const px=x+ex*Math.cos(rot)-ey*Math.sin(rot),py=y+ex*Math.sin(rot)+ey*Math.cos(rot);if(i===0&&this.cur==null)this.moveTo(px,py);else this.lineTo(px,py);}},
  quadraticCurveTo(cx,cy,x,y){const p0=this.cur||[cx,cy];for(let i=1;i<=8;i++){const t=i/8,a=1-t;this.lineTo(a*a*p0[0]+2*a*t*cx+t*t*x,a*a*p0[1]+2*a*t*cy+t*t*y);}},
  bezierCurveTo(c1x,c1y,c2x,c2y,x,y){const p0=this.cur||[c1x,c1y];for(let i=1;i<=10;i++){const t=i/10,a=1-t;this.lineTo(a*a*a*p0[0]+3*a*a*t*c1x+3*a*t*t*c2x+t*t*t*x,a*a*a*p0[1]+3*a*a*t*c1y+3*a*t*t*c2y+t*t*t*y);}},
  _d(){return this.path.join(' ');},
  _col(c){return typeof c==='string'?c:'#000';},
  _alpha(){return this.st.alpha<1?` opacity="${this._n(this.st.alpha)}"`:'';},
  fill(rule){if(!this.path.length)return;this.out.push(`<path d="${this._d()}" fill="${this._col(this.st.fill)}"${rule==='evenodd'?' fill-rule="evenodd"':''}${this._alpha()}/>`);},
  stroke(){if(!this.path.length)return;const s=this._scale();const dash=this.st.dash&&this.st.dash.length?` stroke-dasharray="${this.st.dash.map(v=>this._n(v*s)).join(' ')}"`:'';
    this.out.push(`<path d="${this._d()}" fill="none" stroke="${this._col(this.st.stroke)}" stroke-width="${this._n(Math.max(0.1,this.st.lw*s))}" stroke-linecap="${this.st.cap}" stroke-linejoin="${this.st.join}"${dash}${this._alpha()}/>`);},
  clip(rule){if(!this.path.length)return;const id='c'+(++this.nclip);this.defs.push(`<clipPath id="${id}"><path d="${this._d()}"${rule==='evenodd'?' clip-rule="evenodd"':''}/></clipPath>`);this.out.push(`<g clip-path="url(#${id})">`);this.st.groups++;},
  fillRect(x,y,w,h){const p=this.path,c=this.cur;this.path=[];this.cur=null;this.rect(x,y,w,h);this.fill();this.path=p;this.cur=c;},
  strokeRect(x,y,w,h){const p=this.path,c=this.cur;this.path=[];this.cur=null;this.rect(x,y,w,h);this.stroke();this.path=p;this.cur=c;},
  clearRect(){},
  _font(){const f=this.st.font||'';const sz=(f.match(/(\d+(?:\.\d+)?)px/)||[])[1]||10;const wt=/\b(bold|[5-9]00)\b/.test(f)?(f.match(/\b([5-9]00)\b/)||[])[1]||700:400;const fam=(f.split(/\d+px\s*/)[1]||'sans-serif').replace(/"/g,"'");return{sz:+sz,wt,fam};},
  fillText(s,x,y){if(s==null||s==='')return;const{sz,wt,fam}=this._font();const m=this.st.m;const anchor=this.st.align==='center'?'middle':this.st.align==='right'||this.st.align==='end'?'end':'start';
    const base=this.st.base==='middle'?'central':this.st.base==='top'||this.st.base==='hanging'?'hanging':this.st.base==='bottom'||this.st.base==='ideographic'?'text-after-edge':'alphabetic';
    const t=String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    this.out.push(`<text transform="matrix(${m.map(v=>this._n(v)).join(' ')})" x="${this._n(x)}" y="${this._n(y)}" font-size="${sz}" font-weight="${wt}" font-family="${fam}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${this._col(this.st.fill)}"${this._alpha()}>${t}</text>`);},
  strokeText(){},
  measureText(s){const{sz}=this._font();return{width:String(s||'').length*sz*0.6};},
  setLineDash(a){this.st.dash=a&&a.length?a.slice():null;},
  getLineDash(){return this.st.dash?this.st.dash.slice():[];},
  drawImage(){},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};},createPattern(){return null;},
  isPointInPath(){return false;},
  svg(opts){opts=opts||{};while(this.stack.length)this.restore();for(let i=0;i<this.st.groups;i++)this.out.push('</g>');this.st.groups=0;
    const bg=opts.bg?`<rect width="${this.w}" height="${this.h}" fill="${opts.bg}"/>`:'';
    return`<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"${opts.title?` aria-label="${opts.title.replace(/"/g,'&quot;')}"`:''}>${this.defs.length?'<defs>'+this.defs.join('')+'</defs>':''}${bg}${this.out.join('\n')}</svg>`;}
};
/* ---- renderers: what each view looks like as SVG / PNG ---- */
const EXP={ppm:20,maxPx:4096};
function expName(){return(BD&&BD.name||'board').replace(/[^\w\-가-힣]+/g,'_').replace(/^_+|_+$/g,'')||'board';}
function expBoardSize(){const m=6;const s=Math.min(EXP.ppm,EXP.maxPx/(BD.W+2*m),EXP.maxPx/(BD.H+2*m));return{m,s,w:Math.ceil((BD.W+2*m)*s),h:Math.ceil((BD.H+2*m)*s)};}
// paints one copper view (side T/B, or inner layer `cu` seen from the top) into any 2D context, in device pixels
function expPaintBoard(ctx,side,cu,o){const{m,s}=expBoardSize();const mir=side==='B';
  ctx.setTransform(s*(mir?-1:1),0,0,-s,m*s+(mir?BD.W*s:0),m*s+BD.H*s);
  if(typeof ctx.fillRect==='function'&&o&&o.shadow){ctx.save();ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=10;ctx.shadowOffsetY=4;outlinePath(ctx);ctx.fillStyle='#000';ctx.fill('evenodd');ctx.restore();}
  const keep=OV_FORCE;OV_FORCE=o&&o.ov!==undefined?o.ov:null;try{drawSide(ctx,side,{cu:cu||null,hover:null});}finally{OV_FORCE=keep;}}
function boardSVG(side,cu,o){const{w,h}=expBoardSize();const c=new SvgCtx(w,h);expPaintBoard(c,side,cu,o);return c.svg({bg:o&&o.bg||'#eceff2',title:`${BD.name} ${cu?PCB.cuName(cu):side==='T'?'TOP':'BOTTOM'}`});}
function boardCanvas(side,cu,o){const{w,h}=expBoardSize();const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.fillStyle=o&&o.bg||'#eceff2';c.fillRect(0,0,w,h);expPaintBoard(c,side,cu,Object.assign({shadow:true},o||{}));return cv;}
// schematic sheet
function expSchView(page,w,h){const d=schData(),sh=d.sheets[page||0];if(!sh)return null;const s=Math.min((w-40)/sh.w,(h-40)/sh.h);return{page:page||0,w,h,dpr:1,s,ox:(w-sh.w*s)/2,oy:(h-sh.h*s)/2,fitted:page||0,hover:null,userMoved:true,cv:{width:w,height:h}};}
function schSVG(page){const d=schData(),sh=d.sheets[page||0];if(!sh)return'';const s=Math.min(EXP.ppm*0.5,EXP.maxPx/(sh.w+40),EXP.maxPx/(sh.h+40));const w=Math.ceil(sh.w*s+40),h=Math.ceil(sh.h*s+40);
  const V=expSchView(page,w,h);const c=new SvgCtx(w,h);V.ctx=c;paintSchV(V);return c.svg({bg:'#e9ebee',title:`${BD.name} 회로도 ${(page||0)+1}`});}
function schCanvas(page){const d=schData(),sh=d.sheets[page||0];if(!sh)return null;const s=Math.min(EXP.ppm*0.5,EXP.maxPx/(sh.w+40),EXP.maxPx/(sh.h+40));const w=Math.ceil(sh.w*s+40),h=Math.ceil(sh.h*s+40);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const V=expSchView(page,w,h);V.ctx=cv.getContext('2d');V.cv=cv;V.ctx.fillStyle='#e9ebee';V.ctx.fillRect(0,0,w,h);paintSchV(V);return cv;}
// system diagram (HW blocks or part composition) — already SVG
function sysSVG(kind){try{if(kind==='parts'){const D=typeof sysDiagram==='function'?sysDiagram():null;return D?SYSDIAG.svg(D):'';}const A=typeof sysArch==='function'?sysArch():null;if(A)return HWARCH.svg(A);const D=typeof sysDiagram==='function'?sysDiagram():null;return D?SYSDIAG.svg(D):'';}catch(e){console.error(e);return'';}}
const svgStandalone=svg=>svg?svg.replace(/^<svg /,'<svg xmlns="http://www.w3.org/2000/svg" style="color:#1d2126;background:#fff;--surface:#fff;--raised:#fff;--line:#d8dde2;--muted:#5a6872;--fg:#1d2126;--accent:#b5541c;--accent-soft:#f3e3d6" ').replace(/xmlns="http:\/\/www.w3.org\/2000\/svg"(.*?)xmlns="http:\/\/www.w3.org\/2000\/svg"/,'xmlns="http://www.w3.org/2000/svg"$1'):'';
function svgToPng(svg,scale){return new Promise((res,rej)=>{if(!svg)return res(null);const m=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)||svg.match(/width="([\d.]+)"[^>]*height="([\d.]+)"/);const w=m?+m[1]:1200,h=m?+m[2]:800;const k=Math.min(scale||2,EXP.maxPx/w,EXP.maxPx/h);
  const img=new Image();const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));img.onload=()=>{const cv=document.createElement('canvas');cv.width=Math.ceil(w*k);cv.height=Math.ceil(h*k);const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);c.drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);res(cv);};img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('SVG를 그리지 못했습니다'));};img.src=url;});}
// 3D: render the shared scene with a camera into a canvas and read it back right away
function threePNG(renderer,cam,cv,scene){try{renderer.render(scene||G3.scene,cam);return cv.toDataURL('image/png');}catch(e){console.error(e);return null;}}
function board3DPNG(o){if(!G3||!init3D())return null;if(G3.board!==BD){rebuild3D();sync3D();}const orb=Object.assign({},G3.orb,{t:G3.orb.t.clone()});const H=BD.housing;const had=H&&H.show;
  if(o&&o.housing&&H){H.show=true;mech3D();}else if(o&&o.housing===false&&H&&H.show){H.show=false;mech3D();}
  if(o&&o.iso){G3.anim=null;G3.orb.th=-1.95;G3.orb.ph=0.95;G3.orb.r=fitR()*1.05;G3.orb.t.set(0,0,0);placeCam();}
  const w=cv3.width,h=cv3.height;const big=o&&o.size&&(w<o.size);if(big){G3.renderer.setSize(o.size,Math.round(o.size*h/Math.max(1,w)),false);G3.cam.aspect=o.size/Math.round(o.size*h/Math.max(1,w));G3.cam.updateProjectionMatrix();}
  const url=threePNG(G3.renderer,G3.cam,cv3);
  if(big){resize3D();}if(o&&o.iso){Object.assign(G3.orb,orb);G3.orb.t.copy(orb.t);placeCam();}
  if(H&&H.show!==!!had){H.show=!!had;mech3D();}G3.dirty=true;return url;}
/* ---- files ---- */
async function expSave(name,data,type,msg){const fn=await offerFile(name,data,type);if(fn&&msg!==false)toast(msg||`${fn} 내려받기`);return fn;}
function canvasBlob(cv){return new Promise(r=>cv.toBlob(b=>r(b),'image/png'));}
async function expSaveCanvas(name,cv){const b=await canvasBlob(cv);if(!b)return null;return expSave(name,new Uint8Array(await b.arrayBuffer()),'image/png');}
function dataUrlBytes(u){const b=atob(u.split(',')[1]);const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
// the view the main window shows right now (or a pop-out cell), as SVG or PNG
async function exportCurrentView(fmt){if(!BD)return;const base=expName();
  if(S.sch==='full'){return exportSch(fmt,SV.page);}
  if(S.view==='3d'){if(fmt==='svg'){toast('3D 보기는 PNG로만 저장됩니다. 2D(TOP·BOTTOM·층)는 SVG로 저장할 수 있습니다.');}const url=board3DPNG({size:1600});if(!url)return toast('3D를 그리지 못했습니다.');return expSave(base+'_3D.png',dataUrlBytes(url),'image/png');}
  return exportLayer(fmt,S.view,S.cu);}
async function exportLayer(fmt,side,cu){const base=expName();const tag=cu?PCB.cuName(cu).replace('.','_'):side==='T'?'TOP':'BOTTOM';
  if(fmt==='svg')return expSave(`${base}_${tag}.svg`,boardSVG(side,cu),'image/svg+xml');return expSaveCanvas(`${base}_${tag}.png`,boardCanvas(side,cu));}
async function exportSch(fmt,page){const base=expName();if(fmt==='svg')return expSave(`${base}_sch${(page||0)+1}.svg`,schSVG(page),'image/svg+xml');const cv=schCanvas(page);if(cv)return expSaveCanvas(`${base}_sch${(page||0)+1}.png`,cv);}
async function exportSys(fmt,kind){const svg=svgStandalone(sysSVG(kind));if(!svg)return toast('시스템 다이어그램이 없습니다. 1단계에서 요구사항을 분석하거나 보드에서 추출하세요.');const base=expName();
  if(fmt==='svg')return expSave(`${base}_${kind==='parts'?'parts':'hw'}_diagram.svg`,svg,'image/svg+xml');const cv=await svgToPng(svg,2);if(cv)return expSaveCanvas(`${base}_${kind==='parts'?'parts':'hw'}_diagram.png`,cv);}
async function exportAllLayers(){if(!BD)return;if(typeof JSZip==='undefined')return toast('zip 라이브러리를 불러오지 못했습니다.');const z=new JSZip();const base=expName();
  PCB.stackOf(BD).forEach(x=>{const side=x.k==='B'?'B':'T',cu=x.k==='T'||x.k==='B'?null:x.k;z.file(`${base}_${PCB.cuName(x.k).replace('.','_')}.svg`,boardSVG(side,cu));});
  try{schData().sheets.forEach((s,i)=>z.file(`${base}_sch${i+1}.svg`,schSVG(i)));}catch(e){}
  const data=await z.generateAsync({type:'uint8array'});return expSave(base+'_layers_svg.zip',data,'application/zip','동박 층·회로도 SVG를 zip으로 내려받았습니다.');}
const expRevLabel=()=>{try{if(typeof REV!=='undefined'&&REV.list.length){const r=REV.list[REV.list.length-1];return`r${r.n}${r.label?' '+r.label:''}`;}}catch(e){}return'';};
async function exportMechParts(fmt){if(!BD||BD.blank||BD.pcbPending)return toast('하우징은 PCB가 배치된 뒤(3단계 이후) 만들 수 있습니다.');mechCfg();const R=mechRun(),base=expName(),rev=expRevLabel();
  if(fmt==='bom')return exportXlsx([{name:'기구 BOM',aoa:HOUSING.mechBomAoa(R)}],base+'_housing_bom.xlsx','기구 BOM을 엑셀로 내려받았습니다.');
  if(fmt==='base'||fmt==='lid'){const svg=HOUSING.partSVG(R,BD.name,fmt,{rev});return expSave(`${base}_${fmt==='base'?'HSG-01_base':'HSG-02_cover'}.svg`,svg,'image/svg+xml');}
  if(typeof JSZip==='undefined')return toast('zip 라이브러리를 불러오지 못했습니다.');const z=new JSZip();
  z.file(base+'_housing_assembly.svg',HOUSING.drawingSVG(R,BD.name));z.file(base+'_HSG-01_base.svg',HOUSING.partSVG(R,BD.name,'base',{rev}));z.file(base+'_HSG-02_cover.svg',HOUSING.partSVG(R,BD.name,'lid',{rev}));
  for(const [nm,svg] of [['assembly',HOUSING.drawingSVG(R,BD.name)],['HSG-01_base',HOUSING.partSVG(R,BD.name,'base',{rev})],['HSG-02_cover',HOUSING.partSVG(R,BD.name,'lid',{rev})]]){try{const cv=await svgToPng(svg,2);if(cv){const bl=await canvasBlob(cv);z.file(`${base}_housing_${nm}.png`,new Uint8Array(await bl.arrayBuffer()));}}catch(e){}}
  z.file(base+'_housing_bom.csv','\ufeff'+HOUSING.mechBomAoa(R).map(r=>r.map(v=>{v=String(v==null?'':v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\r\n'));
  z.file(base+'_housing.scad',HOUSING.scad(R,BD.name));
  const data=await z.generateAsync({type:'uint8array'});return expSave(base+'_housing_drawings.zip',data,'application/zip','기구 도면(조립도·부품도 SVG/PNG)·BOM·SCAD를 zip으로 내려받았습니다.');}
async function exportHousing(fmt){if(!BD||typeof mechRun!=='function')return;if(BD.blank||BD.pcbPending)return toast('하우징은 PCB가 배치된 뒤(3단계 이후) 만들 수 있습니다.');mechCfg();const base=expName();
  if(fmt==='drawing'){const R=mechRun();return expSave(base+'_housing_drawing.svg',HOUSING.drawingSVG(R,BD.name),'image/svg+xml','기구 도면(SVG)을 내려받았습니다.');}
  if(fmt==='drawing-png'){const R=mechRun();const cv=await svgToPng(HOUSING.drawingSVG(R,BD.name),2);if(cv)return expSaveCanvas(base+'_housing_drawing.png',cv);return;}
  const url=board3DPNG({housing:true,size:1600,iso:HS.ws!=='cad'});if(!url)return toast('3D를 그리지 못했습니다.');return expSave(base+'_housing_3D.png',dataUrlBytes(url),'image/png');}
/* ---- Excel ---- */
function xlsxTablesFrom(html){const d=document.createElement('div');d.innerHTML=html;return[...d.querySelectorAll('table')];}
function xlsxSheetName(n,used){let s=String(n||'Sheet').replace(/[\\/?*[\]:]/g,' ').trim().slice(0,28)||'Sheet';let k=s,i=2;while(used.has(k))k=s+' '+(i++);used.add(k);return k;}
function tableAoa(tbl){const rows=[];tbl.querySelectorAll('tr').forEach(tr=>{if(tr.closest('table')!==tbl)return;const r=[];tr.querySelectorAll('th,td').forEach(c=>{if(c.closest('tr')!==tr)return;let t=c.innerText!=null?c.innerText:c.textContent;t=String(t).replace(/\s+/g,' ').trim();const n=t!==''&&/^-?\d+(\.\d+)?$/.test(t)?+t:t;r.push(n);for(let k=1;k<(+c.colSpan||1);k++)r.push('');});rows.push(r);});return rows;}
// items: [{name, table?: HTMLTableElement, html?: string (tables inside), aoa?: rows}]
async function exportXlsx(items,fname,msg){const sheets=[];items.forEach(it=>{if(it.aoa){sheets.push([it.name,it.aoa]);return;}const tbls=it.table?[it.table]:it.html?xlsxTablesFrom(it.html):[];tbls.forEach((t,i)=>{const rows=tableAoa(t);if(rows.length)sheets.push([tbls.length>1?`${it.name} ${i+1}`:it.name,rows]);});});
  if(!sheets.length)return toast('내보낼 표가 없습니다.');
  if(!window.XLSX){const csv='﻿'+sheets[0][1].map(r=>r.map(v=>{v=String(v==null?'':v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\r\n');toast('엑셀 라이브러리를 불러오지 못해 첫 표를 CSV로 내려받습니다.');return expSave(fname.replace(/\.xlsx$/,'')+'.csv',csv,'text/csv;charset=utf-8');}
  const wb=XLSX.utils.book_new(),used=new Set();sheets.forEach(([name,aoa])=>{const ws=XLSX.utils.aoa_to_sheet(aoa);const cols=[];aoa.forEach(r=>r.forEach((v,i)=>{cols[i]=Math.max(cols[i]||6,Math.min(60,String(v==null?'':v).length*1.1+2));}));ws['!cols']=cols.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,xlsxSheetName(name,used));});
  const buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});return expSave(fname,new Uint8Array(buf),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',msg||`${fname} 내려받기 (시트 ${sheets.length}개)`);}
// every HSIS view as sheets
// pin map and check results as rows (their views are a drawing and a list, not tables)
function expPinmapAoa(){const c=BD.byRef[HS.mcu];if(!c)return null;const owner={};HS.H.items.forEach(it=>(it._pins||[]).forEach(n=>{if(!owner[n])owner[n]=it;}));const mdb=typeof MCU_PINS!=='undefined'?(MCU_PINS.find(c.mpn)||MCU_PINS.find(c.val)):null;
  const res={};HS.res.results.forEach(r=>{if(r.pin)(res[r.pin]=res[r.pin]||[]).push(`${r.sev}: ${r.msg}`);});
  const rows=[['핀','핀 이름','넷','HSIS ID','신호','분류','방향','점검']];c.pads.slice().sort((a,b)=>String(a.n).localeCompare(String(b.n),undefined,{numeric:true})).forEach(p=>{const it=owner[p.n];const nm=mdb&&mdb.pins&&mdb.pins[p.n]?mdb.pins[p.n].name||'':p.fn||'';
    rows.push([p.n,nm,p.net||'',it?it.id||'':'',it?it.signal||it.name||'':'',it?it.cat||'':'',it?it.dir||'':'',(res[p.n]||[]).join(' · ')]);});return rows;}
function expChecksAoa(){const rows=[['심각도','ID / 핀','메시지','코드']];(HS.res.results||[]).forEach(r=>rows.push([r.sev,r.id||(r.pin?`${HS.mcu}.${r.pin}`:''),r.msg,r.code||'']));return rows;}
function hsisSheets(all){if(!HS.H){try{hsisLoadSample();}catch(e){}}if(!HS.H)return[];if(!HS.res)hsisRun();const out=[];const add=(name,fn)=>{try{out.push({name,html:fn()});}catch(e){console.warn(name,e);}};
  add('신호 표',tableHTML);if(all!==false){try{const pm=expPinmapAoa();if(pm)out.push({name:'MCU 핀 맵',aoa:pm});}catch(e){console.warn(e);}add('추적성',traceHTML);try{out.push({name:'검사 결과',aoa:expChecksAoa()});}catch(e){console.warn(e);}add('핀 추천',recHTML);add('MCAL 설정',mcalHTML);add('테스트 케이스',tcHTML);}
  return out;}
function expBomAoa(){const m=new Map();BD.comps.forEach(c=>{const k=[c.val,c.fp,c.mpn||''].join('|');const it=m.get(k)||{refs:[],val:c.val,fp:c.fp,mpn:c.mpn||'',desc:c.desc||'',side:new Set()};it.refs.push(c.ref);it.side.add(c.side);m.set(k,it);});
  const P=typeof PARTS!=='undefined'?PARTS:null;const rows=[['#','수량','참조','값','풋프린트','부품 번호','설명','면','참고 단가(USD, 추정)','소계']];let i=0,tot=0;
  [...m.values()].sort((a,b)=>a.refs[0].localeCompare(b.refs[0],undefined,{numeric:true})).forEach(it=>{const info=P&&(P.find(it.mpn)||P.find(it.val));const pr=P?P.price(it.mpn,info&&info.cat):null;const sub=pr!=null?+(pr*it.refs.length).toFixed(3):'';if(pr!=null)tot+=pr*it.refs.length;
    rows.push([++i,it.refs.length,it.refs.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join(', '),it.val,it.fp,it.mpn,it.desc||(info?info.title:''),[...it.side].join('/'),pr!=null?pr:'',sub]);});
  rows.push(['','','','','','','','','합계',+tot.toFixed(2)]);return rows;}
function expNetAoa(){const rows=[['넷','분류','패드 수','연결 (부품.핀)','길이 mm']];BD.netOrder.forEach(n=>{const N=BD.nets[n];const len=Object.values(N.len||{}).reduce((a,v)=>a+(v||0),0);rows.push([n,BD.netClass(n),N.pads.length,N.pads.map(p=>`${p.ref||'?'}.${p.n!=null?p.n:''}`).join(' '),+len.toFixed(1)]);});return rows;}
function expPartsAoa(){const rows=[['참조','값','풋프린트','부품 번호','면','X mm','Y mm','회전','핀 수','종류']];BD.comps.slice().sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true})).forEach(c=>rows.push([c.ref,c.val,c.fp,c.mpn||'',c.side,+c.x.toFixed(3),+c.y.toFixed(3),c.rot||0,c.pads.length,c.kind||'']));return rows;}
function expStackAoa(){const st=PCB.stackOf(BD);const rows=[['층','이름','역할','넷','프리미티브 수']];st.forEach((x,i)=>rows.push([i+1,PCB.cuName(x.k),x.role==='gnd'?'GND 플레인':x.role==='pwr'?'전원 플레인':'신호',x.net||'',(BD.layers[x.k+'.cu']||[]).length]));return rows;}
async function exportDesignXlsx(){if(!BD)return;const items=[{name:'보드 요약',aoa:expSummaryAoa()},{name:'BOM',aoa:expBomAoa()},{name:'부품 배치',aoa:expPartsAoa()},{name:'넷리스트',aoa:expNetAoa()},{name:'층 구성',aoa:expStackAoa()}];
  if(HS.H)items.push(...hsisSheets(true));if(!BD.blank&&!BD.pcbPending&&typeof mechRun==='function'){mechCfg();try{items.push({name:'기구 BOM',aoa:HOUSING.mechBomAoa(mechRun())});}catch(e){}try{items.push({name:'하우징 형상',aoa:expHousingAoa()});}catch(e){}}
  if(typeof REV!=='undefined'&&REV.list.length)items.push({name:'리비전 기록',aoa:revAoa()});if(typeof mbMetrics==='function'&&mbMetrics())items.push(...mbSheets());
  return exportXlsx(items,expName()+'_design.xlsx','설계 데이터를 엑셀로 내려받았습니다.');}
function expSummaryAoa(){const rows=[['항목','값']];rows.push(['프로젝트',BD.name],['출처',BD.source],['크기',`${BD.W.toFixed(1)} × ${BD.H.toFixed(1)} mm`],['두께',`${BD.t} mm`],['동박 층',BD.copperLayers||2],['부품',BD.comps.length],['넷',BD.netOrder.length],['비아',BD.vias.length],['드릴',BD.drills.length],['회로 안',BD.variantLabel||''],['내보낸 날짜',new Date().toISOString().slice(0,10)]);
  if(typeof NP!=='undefined'&&$('#npReq')&&$('#npReq').value)rows.push(['요구사항',$('#npReq').value]);BD.warnings.forEach(w=>rows.push(['경고',w]));BD.notes.forEach(n=>rows.push(['참고',n]));return rows;}
function expHousingAoa(){const R=mechRun(),d=R.d,g=d.geo;const rows=[['항목','값']];rows.push(['재질',d.m.label],['IP',d.ip],['외형',`${g.Lo.toFixed(1)} × ${g.Wo.toFixed(1)} × ${g.Ho.toFixed(1)} mm`],['벽 두께',g.t],['모서리',HOUSING.edgeText(g)],['무게 g',+d.mass.toFixed(0)],['원가 지수',R.idx.cost],['PCB 온도',+d.th.Tboard.toFixed(1)],['진동 SF',+d.vib.sf.toFixed(2)]);
  rows.push([],['형상','설명']);d.feats.forEach(f=>rows.push([f.id,HOUSING.featLabel(Object.assign({},f,{id:''})).trim()]));rows.push([],['경고']);R.warn.forEach(w=>rows.push([w]));return rows;}
/* ---- the whole design as one HTML document (sections chosen in the dialog); the document prints to PDF ---- */
const REPORT_SECTIONS=[['overview','개요 · 요구사항'],['sys','시스템 다이어그램'],['circuit','회로 · BOM · 회로도'],['pcb','PCB 층별 보기 · 층 구성'],['3d','3D 보기'],['sim','시뮬레이션 결과'],['hsis','HSIS (신호 표 · 핀 맵 · 검사)'],['housing','기구 (보고 · BOM · 조립도 · 부품도 · 3D)'],['rev','리비전 기록'],['system','시스템 보드 연결'],['log','설계 도우미 기록']];
const rh=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function aoaTable(aoa,cls){if(!aoa||!aoa.length)return'';const [h,...b]=aoa;return`<table class="${cls||''}"><thead><tr>${h.map(c=>`<th>${rh(c)}</th>`).join('')}</tr></thead><tbody>${b.map(r=>`<tr>${r.map(c=>`<td>${rh(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
async function buildReport(sel){const on=k=>!sel||sel.has(k);const P=[];const base=BD.name||'board';const date=new Date().toLocaleString('ko-KR');
  const fig=(svgOrUrl,cap,isUrl)=>`<figure>${isUrl?`<img src="${svgOrUrl}" alt="${rh(cap)}">`:svgOrUrl}<figcaption>${rh(cap)}</figcaption></figure>`;
  const sec=(id,title,body)=>P.push(`<section id="${id}"><h2>${rh(title)}</h2>${body}</section>`);
  if(on('overview')){const req=$('#npReq')&&$('#npReq').value||'';const ans=typeof NP!=='undefined'&&NP.answers?Object.values(NP.answers).map(a=>`${a.label}: ${a.v}`):[];
    sec('overview','개요',`${aoaTable(expSummaryAoa().filter(r=>r[0]!=='요구사항'),'kv')}${req?`<h3>요구사항</h3><pre>${rh(req)}</pre>`:''}${ans.length?`<h3>AI 분석 보강</h3><ul>${ans.map(a=>`<li>${rh(a)}</li>`).join('')}</ul>`:''}`);}
  if(on('sys')){const hw=sysSVG('hw'),pt=sysSVG('parts');if(hw||pt)sec('sys','시스템 다이어그램',(hw?fig(hw,'HW 블록 다이어그램'):'')+(pt?fig(pt,'부품 구성도'):''));}
  if(on('circuit')){let b='';try{if(typeof NP!=='undefined'&&NP.plan&&typeof NEWPROJ!=='undefined'&&NEWPROJ.summary)b+=`<pre>${rh(NEWPROJ.summary(NP.plan))}</pre>`;}catch(e){}
    if(BD.variantLabel)b+=`<p>회로 안: <b>${rh(BD.variantLabel)}</b></p>`;b+=`<h3>BOM</h3>${aoaTable(expBomAoa(),'wide')}`;
    try{const d=schData();d.sheets.forEach((s,i)=>{b+=fig(schSVG(i),`회로도 ${i+1}/${d.sheets.length}${s.name?' · '+s.name:''}`);});}catch(e){console.warn(e);}
    sec('circuit','회로',b);}
  if(on('pcb')){let b=aoaTable(expStackAoa());if(!BD.blank&&!BD.pcbPending){PCB.stackOf(BD).forEach(x=>{const side=x.k==='B'?'B':'T',cu=x.k==='T'||x.k==='B'?null:x.k;b+=fig(boardSVG(side,cu),`${PCB.cuName(x.k)} (${x.k==='T'?'TOP':x.k==='B'?'BOTTOM · 아래에서 본 면':'내층 · 위에서 본 면'})`);});}
    else b+='<p>PCB는 아직 배치되지 않았습니다 (3단계).</p>';if(PE&&PE.drc&&PE.drc.length)b+=`<h3>DRC</h3><ul>${PE.drc.slice(0,200).map(x=>`<li>${rh(x.msg||x)}</li>`).join('')}</ul>`;
    b+=`<h3>부품 배치</h3>${aoaTable(expPartsAoa(),'wide')}<h3>넷리스트</h3>${aoaTable(expNetAoa(),'wide')}`;sec('pcb','PCB',b);}
  if(on('3d')&&!BD.blank&&!BD.pcbPending){const u=board3DPNG({iso:true,size:1200,housing:false});if(u)sec('3d','3D 보기',fig(u,'3D 등각 보기',true));}
  if(on('sim')){let b='';const tabs=[['ir','전압 강하',typeof irHTML==='function'&&irHTML],['si','신호 무결성',typeof siHTML==='function'&&siHTML],['th','열 분포',typeof thHTML==='function'&&thHTML],['emc','EMC/EMI',typeof emcHTML==='function'&&emcHTML]];
    tabs.forEach(([k,t,fn])=>{if(typeof SR==='undefined'||!SR[k]||SR[k].error||!fn)return;try{b+=`<h3>${t}</h3><div class="simhtml">${fn()}</div>`;}catch(e){}});
    sec('sim','시뮬레이션',b||'<p>실행한 시뮬레이션이 없습니다. 시뮬레이션 탭에서 실행한 뒤 다시 내보내면 결과가 들어갑니다.</p>');}
  if(on('hsis')){const sh=hsisSheets(true);if(sh.length){let b='';sh.forEach(it=>{if(it.aoa){b+=`<h3>${rh(it.name)}</h3>`+aoaTable(it.aoa,'wide');return;}const tbls=xlsxTablesFrom(it.html);if(!tbls.length)return;b+=`<h3>${rh(it.name)}</h3>`+tbls.map(t=>aoaTable(tableAoa(t),'wide')).join('');});sec('hsis','HSIS',b);}}
  if(on('housing')&&!BD.blank&&!BD.pcbPending&&typeof mechRun==='function'){mechCfg();try{const R=mechRun();const rev=expRevLabel();let b=`<pre>${rh(HOUSING.text(R))}</pre><h3>기구 BOM</h3>${aoaTable(HOUSING.mechBomAoa(R),'wide')}<p class="meta">참고 단가는 초기 견적용 추정치입니다 (USD). 품번 HSG-01/02는 아래 부품도와 같습니다.</p>`;b+=`<h3>조립도</h3>`+fig(HOUSING.drawingSVG(R,BD.name),'조립도 — 평면 · 정면 · 우측면');b+=`<h3>부품도</h3>`+fig(HOUSING.partSVG(R,BD.name,'base',{rev}),'HSG-01 베이스 부품도')+fig(HOUSING.partSVG(R,BD.name,'lid',{rev}),'HSG-02 커버 부품도');b+=`<h3>재질 비교</h3><pre>${rh(HOUSING.compareText(R))}</pre>`;const u=board3DPNG({iso:true,size:1200,housing:true});if(u)b+=fig(u,'하우징 3D',true);sec('housing','기구 설계',b);}catch(e){console.warn(e);}}
  if(on('system')&&typeof mbReportHTML==='function'){const h=mbReportHTML();if(h)sec('system','시스템 보드 연결',h);}
  if(on('rev')&&typeof REV!=='undefined'&&REV.list.length)sec('rev','리비전 기록',aoaTable(revAoa(),'wide'));
  if(on('log')){const L=(typeof COP!=='undefined'&&COP.log||[]).filter(e=>e.k==='cmd'||e.k==='user'||e.k==='ai');if(L.length)sec('log','설계 도우미 기록',`<ol class="log">${L.slice(-400).map(e=>`<li class="${e.k}"><span>${e.src||''}</span> ${rh(e.t)}</li>`).join('')}</ol>`);}
  const toc=P.map(p=>{const m=p.match(/id="([^"]+)"><h2>([^<]+)/);return m?`<a href="#${m[1]}">${m[2]}</a>`:'';}).join('');
  const css=`body{font-family:"IBM Plex Sans KR",system-ui,-apple-system,sans-serif;color:#1d2126;margin:0;background:#f4f5f7}main{max-width:1180px;margin:0 auto;padding:28px 32px 60px;background:#fff}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:34px 0 10px;padding-bottom:6px;border-bottom:2px solid #1d2126}h3{font-size:15px;margin:20px 0 8px}
.meta{color:#5a6872;font-size:13px;margin:0 0 12px}.toc{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin:10px 0 0}.toc a{color:#b5541c}
table{border-collapse:collapse;font-size:12.5px;margin:6px 0 10px;max-width:100%}td,th{border:1px solid #d8dde2;padding:4px 7px;text-align:left;vertical-align:top;word-break:keep-all;overflow-wrap:anywhere}th{background:#f1f3f5}table.kv td:first-child{color:#5a6872;width:140px}
table.wide{display:block;overflow:auto;max-height:70vh}@media print{table.wide{display:table;max-height:none;overflow:visible}}
figure{margin:10px 0 18px}figure svg,figure img{max-width:100%;height:auto;border:1px solid #d8dde2;border-radius:6px;background:#fff}figcaption{font-size:12.5px;color:#5a6872;margin-top:4px}
pre{white-space:pre-wrap;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;background:#f7f8fa;border:1px solid #e3e6ea;border-radius:6px;padding:10px;line-height:1.5}
.simhtml button,.simhtml input,.simhtml select,.simhtml .acts{display:none!important}.simhtml{font-size:13px}.simhtml table{width:100%}
ol.log{font-size:12.5px;font-family:"JetBrains Mono",ui-monospace,monospace;padding-left:22px}ol.log li.user{color:#b5541c}ol.log li span{color:#5a6872;margin-right:6px}
.tools{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #e3e6ea;display:flex;gap:8px;align-items:center;font-size:13px;z-index:2}.tools button{font:inherit;padding:6px 12px;border:1px solid #b5541c;background:#b5541c;color:#fff;border-radius:7px;cursor:pointer}
@page{size:A4;margin:14mm}@media print{.tools{display:none}body{background:#fff}main{padding:0;max-width:none}section{break-inside:auto}h2{break-after:avoid}figure{break-inside:avoid}}`;
  return`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${rh(base)} 설계 보고서</title><style>${css}</style></head><body><main>
<div class="tools"><button onclick="window.print()">PDF로 저장 (인쇄)</button><span>브라우저 인쇄 대화상자에서 대상을 "PDF로 저장"으로 고르세요.</span></div>
<h1>${rh(base)} 설계 보고서</h1><p class="meta">AllinOneDesign · ${rh(date)} · ${rh(BD.source)} · ${BD.W.toFixed(1)} × ${BD.H.toFixed(1)} mm · ${BD.copperLayers||2}층 · 부품 ${BD.comps.length} · 넷 ${BD.netOrder.length}</p><nav class="toc">${toc}</nav>
${P.join('\n')}</main></body></html>`;}
async function exportReport(sel,mode){if(!BD)return;toast('보고서를 만드는 중…');let html;try{html=await buildReport(sel);}catch(e){console.error(e);return toast('보고서를 만들지 못했습니다: '+e.message);}
  if(mode==='print'){let w=null;try{w=window.open('','_blank');}catch(e){}if(!w){toast('새 창이 막혀 HTML 파일로 내려받습니다.');return expSave(expName()+'_report.html',html,'text/html;charset=utf-8');}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.focus();w.print();}catch(e){}},600);return;}
  return expSave(expName()+'_report.html',html,'text/html;charset=utf-8','설계 보고서(HTML)를 내려받았습니다. 열어서 [PDF로 저장]을 누르면 PDF가 됩니다.');}
/* ---- dialog ---- */
function expDialogHTML(){const st=BD?PCB.stackOf(BD):[];const multi=st.length>2;const schN=(()=>{try{return schData().sheets.length;}catch(e){return 0;}})();
  const grp=(t,b)=>`<div class="exp-g"><p class="h">${t}</p><div class="exp-b">${b}</div></div>`;const btn=(a,l,t)=>`<button type="button" class="btn sm" data-x="${a}"${t?` title="${rh(t)}"`:''}>${l}</button>`;
  return`<div class="sheet exp" role="dialog" aria-modal="true" aria-labelledby="expT"><div class="sheet-h"><h2 id="expT">내보내기</h2><button class="x" data-close aria-label="닫기">✕</button></div><div class="sheet-b">
  ${grp('그림 (SVG · PNG)',`${btn('view:svg','지금 보기 SVG')}${btn('view:png','지금 보기 PNG')}${['T','B'].map(k=>btn(`layer:${k}:svg`,`${k==='T'?'TOP':'BOTTOM'} SVG`)).join('')}${multi?st.filter(x=>x.k!=='T'&&x.k!=='B').map(x=>btn(`layer:${x.k}:svg`,`${PCB.cuName(x.k)} SVG`)).join(''):''}${btn('layers:zip','모든 층 + 회로도 SVG (zip)')}
    ${schN?Array.from({length:schN},(_,i)=>btn(`sch:${i}:svg`,`회로도 ${i+1} SVG`)+btn(`sch:${i}:png`,`회로도 ${i+1} PNG`)).join(''):''}${btn('sys:hw:svg','HW 블록 다이어그램 SVG')}${btn('sys:hw:png','HW 블록 PNG')}${btn('sys:parts:svg','부품 구성도 SVG')}${btn('3d:png','3D PNG')}${btn('housing:drawing','기구 조립도 SVG')}${btn('housing:drawing-png','기구 조립도 PNG')}${btn('mech:base','HSG-01 베이스 부품도 SVG')}${btn('mech:lid','HSG-02 커버 부품도 SVG')}${btn('mech:zip','기구 도면 묶음 (zip: 조립도·부품도·BOM·SCAD)')}${btn('housing:3d','기구 3D PNG')}${typeof mbMetrics==='function'&&mbMetrics()?btn('mb:svg','보드 연결도 SVG')+btn('mb:png','보드 연결도 PNG'):''}`)}
  ${grp('표 (Excel)',`${btn('xlsx:hsis','HSIS 전체 (신호 표·핀 맵·추적성·검사·핀 추천·MCAL·테스트)')}${btn('xlsx:hsis1','HSIS 신호 표만')}${btn('xlsx:bom','BOM')}${btn('xlsx:parts','부품 배치')}${btn('xlsx:nets','넷리스트')}${btn('mech:bom','기구 BOM')}${typeof mbMetrics==='function'&&mbMetrics()?btn('mb:xlsx','시스템 연결·BOM'):''}${btn('xlsx:design','설계 데이터 전체 (요약·BOM·배치·넷·층·HSIS·하우징)')}`)}
  ${grp('설계 보고서 (HTML → PDF)',`<div class="exp-secs">${REPORT_SECTIONS.map(([k,l])=>`<label><input type="checkbox" data-sec="${k}" checked> ${l}</label>`).join('')}</div><div class="acts">${btn('report:html','HTML 파일로 저장')}${btn('report:print','바로 인쇄 → PDF')}</div><p class="lead">보고서 HTML은 그림(SVG·PNG)과 표를 모두 안에 품은 파일 하나입니다. 열어서 [PDF로 저장]을 누르거나 브라우저 인쇄에서 PDF로 저장하세요.</p>`)}
  </div></div>`;}
function openExport(){if(!BD){toast('먼저 보드를 열거나 신규 설계를 시작하세요.');return;}let m=$('#expDlg');if(!m){m=document.createElement('div');m.className='modal';m.id='expDlg';document.body.appendChild(m);
    m.addEventListener('click',async e=>{if(e.target===m||e.target.closest('[data-close]')){m.hidden=true;return;}const b=e.target.closest('[data-x]');if(!b)return;const sel=new Set([...m.querySelectorAll('[data-sec]:checked')].map(i=>i.dataset.sec));
      b.disabled=true;try{await runExport(b.dataset.x,sel);}catch(err){console.error(err);toast('내보내기 실패: '+(err&&err.message||err));}b.disabled=false;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)m.hidden=true;});}
  m.innerHTML=expDialogHTML();m.hidden=false;setTimeout(()=>{const f=m.querySelector('[data-x]');if(f)f.focus();},30);}
async function runExport(x,sel){const[a,b,c]=x.split(':');
  switch(a){case'view':return exportCurrentView(b);case'layer':return exportLayer(c,b==='B'?'B':'T',b==='T'||b==='B'?null:b);case'layers':return exportAllLayers();case'sch':return exportSch(c,+b);case'sys':return exportSys(c,b);
    case'3d':{const u=board3DPNG({iso:S.view!=='3d',size:1600,housing:false});return u?expSave(expName()+'_3D.png',dataUrlBytes(u),'image/png'):toast('3D를 그리지 못했습니다.');}
    case'housing':return exportHousing(b);
    case'mech':return exportMechParts(b);
    case'mb':return mbExport(b);
    case'xlsx':{const n=expName();if(b==='hsis')return exportXlsx(hsisSheets(true),n+'_hsis.xlsx');if(b==='hsis1')return exportXlsx(hsisSheets(false),n+'_hsis_signals.xlsx');if(b==='bom')return exportXlsx([{name:'BOM',aoa:expBomAoa()}],n+'_bom.xlsx');if(b==='parts')return exportXlsx([{name:'부품 배치',aoa:expPartsAoa()}],n+'_parts.xlsx');if(b==='nets')return exportXlsx([{name:'넷리스트',aoa:expNetAoa()}],n+'_nets.xlsx');return exportDesignXlsx();}
    case'report':return exportReport(sel,b==='print'?'print':'html');}}
{const hb=$('#expBtn');if(hb)hb.addEventListener('click',openExport);}
// Excel button on the HSIS tab bar and the dock's 정보 pane tables
{const tabs=document.querySelector('#hsisWs .tabs');if(tabs){const b=document.createElement('button');b.type='button';b.className='btn sm hs-xlsx';b.textContent='Excel';b.title='이 탭의 표를 엑셀로 (전체 HSIS는 내보내기 창에서)';b.addEventListener('click',()=>{const tbls=[...document.querySelectorAll('#hsBody table')];const name=(document.querySelector('[data-htab][aria-selected="true"]')||{}).textContent||'HSIS';exportXlsx(tbls.map((t,i)=>({name:name.replace(/\d+$/,'').trim()+(tbls.length>1?' '+(i+1):''),table:t})),expName()+'_hsis_'+name.replace(/\s+/g,'').replace(/\d+$/,'')+'.xlsx');});tabs.appendChild(b);}}
