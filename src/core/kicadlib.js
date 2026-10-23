/* KiCad symbol libraries → part records with real pin data.
   - KiCad 5 legacy: .lib (DEF … X name num … ENDDEF, ALIAS lines) + optional .dcm ($CMP name / D description / F datasheet)
   - KiCad 6–8: .kicad_sym (S-expression; (symbol "NAME" (property …) (symbol "NAME_1_1" (pin type style … (name "X") (number "N")))),
     (extends "BASE") inherits the base symbol's pins)
   Record: {mpn, title, fp, pkg, pins:[{num,name,type}], pdf, src:'kicad', lib, conf}
   Pin types are normalised to: in out bidir tri passive power_in power_out oc oe nc unspec. */
const KICADLIB=(function(){
"use strict";
const T5={I:'in',O:'out',B:'bidir',T:'tri',P:'passive',U:'unspec',W:'power_in',w:'power_out',C:'oc',E:'oe',N:'nc'};
const T8={input:'in',output:'out',bidirectional:'bidir',tri_state:'tri',passive:'passive',unspecified:'unspec',power_in:'power_in',power_out:'power_out',open_collector:'oc',open_emitter:'oe',no_connect:'nc',free:'unspec'};
const pkgOf=fp=>{const s=String(fp||'').split(':').pop();const m=s.match(/^(SOIC|SOP|SSOP|TSSOP|HTSSOP|MSOP|VSSOP|QFN|VQFN|WQFN|DFN|WSON|SON|HVSON|LQFP|TQFP|QFP|BGA|SOT|TO|DIP|PDIP|SC|SOD|PowerPAK|HSOP|DSO|TSOT)[-_]?(\d+[A-Z]?)?/i);return m?(m[1].toUpperCase()+(m[2]?'-'+m[2]:'')):s.split('_')[0]||'';};
const dedupe=pins=>{const m=new Map();pins.forEach(p=>{const k=String(p.num);if(!m.has(k))m.set(k,p);});return[...m.values()].sort((a,b)=>{const x=+a.num,y=+b.num;return isNaN(x)||isNaN(y)?String(a.num).localeCompare(String(b.num)):x-y;});};
/* ---- KiCad 5 ---- */
function parseDcm(text){const out={};let cur=null;String(text||'').split(/\r?\n/).forEach(l=>{if(l.startsWith('$CMP ')){cur=l.slice(5).trim();out[cur]={};}else if(l.startsWith('$ENDCMP'))cur=null;else if(cur){if(l.startsWith('D '))out[cur].d=l.slice(2).trim();else if(l.startsWith('F '))out[cur].f=l.slice(2).trim();else if(l.startsWith('K '))out[cur].k=l.slice(2).trim();}});return out;}
function parseLib(text,dcm,libName){const D=typeof dcm==='string'?parseDcm(dcm):(dcm||{});const out=[];let cur=null;
  String(text||'').split(/\r?\n/).forEach(l=>{
    if(l.startsWith('DEF ')){const t=l.split(/\s+/);cur={name:t[1].replace(/^~/,''),alias:[],fp:'',pdf:'',pins:[]};return;}
    if(!cur)return;
    if(l.startsWith('ALIAS ')){cur.alias.push(...l.slice(6).trim().split(/\s+/));return;}
    if(l.startsWith('$FPLIST')){cur.inFp=true;return;}if(l.startsWith('$ENDFPLIST')){cur.inFp=false;return;}if(cur.inFp){cur.fpf=(cur.fpf?cur.fpf+' ':'')+l.trim();return;}
    if(/^F2 /.test(l)){const m=l.match(/^F2 "([^"]*)"/);if(m)cur.fp=m[1];return;}
    if(/^F3 /.test(l)){const m=l.match(/^F3 "([^"]*)"/);if(m&&m[1])cur.pdf=m[1];return;}
    if(l.startsWith('X ')){const t=l.split(/\s+/);// X name num x y len dir sizenum sizename unit convert type [shape]
      if(t.length>=12)cur.pins.push({num:t[2],name:t[1]==='~'?'':t[1],type:T5[t[11]]||'unspec'});return;}
    if(l.startsWith('ENDDEF')){const pins=dedupe(cur.pins);[cur.name].concat(cur.alias).forEach(n=>{const d=D[n]||D[cur.name]||{};
        if(pins.length)out.push({mpn:n,title:d.d||'',fp:cur.fp,fpf:cur.fpf||'',pkg:pkgOf(cur.fp),pins,pdf:d.f||cur.pdf||'',src:'kicad',lib:libName||'',conf:0.95});});cur=null;}});
  return out;}
/* ---- KiCad 6–8 (.kicad_sym) ---- */
function sexpr(text){const s=String(text||'');let i=0;const n=s.length;
  const read=()=>{while(i<n&&/\s/.test(s[i]))i++;if(i>=n)return null;const c=s[i];
    if(c==='('){i++;const L=[];for(;;){while(i<n&&/\s/.test(s[i]))i++;if(i>=n)break;if(s[i]===')'){i++;break;}L.push(read());}return L;}
    if(c==='"'){i++;let o='';while(i<n&&s[i]!=='"'){if(s[i]==='\\'&&i+1<n){o+=s[i+1];i+=2;}else o+=s[i++];}i++;return{str:o};}
    let j=i;while(j<n&&!/[\s()]/.test(s[j]))j++;const a=s.slice(i,j);i=j;return a;};
  return read();}
const val=x=>x&&typeof x==='object'&&!Array.isArray(x)?x.str:x;
function parseSym(text,libName){const root=sexpr(text);if(!Array.isArray(root)||root[0]!=='kicad_symbol_lib')throw new Error('kicad_sym 형식이 아닙니다');
  const syms={};
  root.filter(x=>Array.isArray(x)&&x[0]==='symbol').forEach(sym=>{const name=val(sym[1]);const r={name,props:{},pins:[],ext:null};
    const walk=node=>{node.forEach(ch=>{if(!Array.isArray(ch))return;
      if(ch[0]==='property')r.props[val(ch[1])]=val(ch[2]);
      else if(ch[0]==='extends')r.ext=val(ch[1]);
      else if(ch[0]==='symbol')walk(ch);
      else if(ch[0]==='pin'){const nm=ch.find(z=>Array.isArray(z)&&z[0]==='name'),nu=ch.find(z=>Array.isArray(z)&&z[0]==='number');
        if(nu)r.pins.push({num:String(val(nu[1])),name:nm?String(val(nm[1])).replace(/^~$/,''):'',type:T8[ch[1]]||'unspec'});}});};
    walk(sym.slice(2));syms[name]=r;});
  const out=[];Object.values(syms).forEach(r=>{let pins=r.pins,props=Object.assign({},r.props);let base=r.ext&&syms[r.ext];let guard=0;
    while(!pins.length&&base&&guard++<8){pins=base.pins;props=Object.assign({},base.props,props);base=base.ext&&syms[base.ext];}
    pins=dedupe(pins);if(!pins.length)return;const fp=props.Footprint||'';
    out.push({mpn:r.name,title:props.Description||props.ki_description||'',fp,fpf:props.ki_fp_filters||'',pkg:pkgOf(fp),pins,pdf:props.Datasheet&&props.Datasheet!=='~'?props.Datasheet:'',src:'kicad',lib:libName||'',conf:0.95});});
  return out;}
/* one call for a set of files: {name, text}; .dcm files are paired with the .lib of the same base name */
function parseFiles(files){const dcm={};files.filter(f=>/\.dcm$/i.test(f.name)).forEach(f=>{dcm[f.name.replace(/\.dcm$/i,'').toLowerCase()]=parseDcm(f.text);});
  const out=[],msgs=[];files.forEach(f=>{const base=f.name.replace(/\.[^.]+$/,'');let r=null;
    try{if(/\.kicad_sym$/i.test(f.name))r=parseSym(f.text,base);else if(/\.lib$/i.test(f.name))r=parseLib(f.text,dcm[base.toLowerCase()]||{},base);}catch(e){msgs.push(`${f.name}: ${e.message||e}`);return;}
    if(r){out.push(...r);msgs.push(`${f.name}: 심볼 ${r.length}개`);}});
  return{parts:out,msg:msgs.join(' · ')};}
/* records for a list of MPNs out of parsed libraries: exact (normalised) name first, then the longest KiCad name that is a
   prefix of the MPN (TJA1051T-3 ↔ TJA1051T/3, INA181A1 ↔ INA181A1QDBVRQ1), at least 5 characters */
const norm=s=>String(s||'').toUpperCase().replace(/[\s_\-\/.,()]/g,'');
/* family: same leading letters + first digit run (MCP2562 · TLV1117 · INA240 · STM32F042K6), the variant chosen by the
   package the MPN suffix names (DCY → SOT-223, DBV → SOT-23, D/DR → SOIC, PW → TSSOP, RGE/RGT → QFN, U → QFN …) and a
   voltage code (33 → 3.3 V); flagged as 'family' (check the package) */
const PKG_HINT=[[/R[GT][EWTY]|RHB|RHA|DRV|DSG|DGN/,/QFN|SON|DFN/i],[/DCY|DCQ/,/SOT-?223/i],[/DBV|DCK|DBZ|SOT23/,/SOT-?23(?!-?[4-9]\d\d)/i],[/QDRQ1$|D[R]?$|QDR(?![VBLY])|\/SN$|-?SN$|SO$/,/SOIC|SO-8|SOP-8/i],[/PWR?$|PW/,/TSSOP/i],[/DGK|DGS/,/MSOP|VSSOP/i],[/U6|UX|U$|-?MF$/,/QFN|DFN/i],[/T6|TX|LQFP|-?P$/,/LQFP|DIP|TQFP/i]];
const stem=k=>{const m=k.match(/^[A-Z]+\d+[A-Z]?\d*/);return m?m[0]:k.slice(0,6);};
// family stem from the raw part number, so a separator ends it (TPS3823-33… → TPS3823, not TPS382333)
const stemRaw=m=>{const r=String(m).toUpperCase().replace(/^[^A-Z0-9]+/,'');const x=r.match(/^[A-Z]+\d+[A-Z]?\d*/);return x?norm(x[0]):stem(norm(r));};
const pkgText=q=>(q.fp||q.pkg||'')+' '+String(q.fpf||'').replace(/[?*]/g,'-');
function pick(parts,mpns){const byN=new Map();parts.forEach(p=>{const k=norm(p.mpn);if(!byN.has(k))byN.set(k,p);});const keys=[...byN.keys()].sort((a,b)=>b.length-a.length);const out={};
  const wild=parts.filter(q=>/[0-9A-Z]x[0-9A-Z]/.test(q.mpn)).map(q=>{const n=String(q.mpn).split(/x/).map(norm).join('.');return[new RegExp('^'+n),q,n.length];}).filter(x=>x[2]>=8).sort((a,b)=>b[2]-a[2]);
  mpns.forEach(m=>{const k=norm(m);let p=byN.get(k);let how='exact';if(!p){const raw0=String(m).toUpperCase();const h0=PKG_HINT.find(([re])=>re.test(raw0));const hit=keys.find(x=>{if(x.length<5||!k.startsWith(x))return false;const q=byN.get(x);const f=pkgText(q).trim();return!(h0&&f&&!h0[1].test(f));});if(hit){p=byN.get(hit);how='prefix';}}
    // KiCad names that spell a free option letter as a lowercase x (ACS724xLCTR-20AB · MCP2542FDxMF): x matches any one
    // character, the rest must be the part number's own prefix (ACS724LLCTR-20AB-T)
    if(!p){const w=wild.find(([re])=>re.test(k));if(w){p=w[1];how='prefix';}}
    if(!p){const raw=String(m).toUpperCase();const hint=PKG_HINT.find(([re])=>re.test(raw));const vm=raw.match(/(\d{2})(?=[A-Z]*Q?\d*$|[A-Z]{2,})/);
      for(const st of[...new Set([stemRaw(m),stem(k),stemRaw(m).replace(/[A-Z]$/,''),stem(k).replace(/[A-Z]$/,'')])]){if(st.length<5||!/\d/.test(st))continue;const fam=keys.filter(x=>x.startsWith(st));if(!fam.length)continue;
        const sig=x=>byN.get(x).pins.map(q=>q.num+':'+q.name.toUpperCase()).join('|');
        // voltage / option code right after the family stem (TLV1117LV33… → 33, TPS3823-33… → 33); an ADJ variant only when none
        const vc=(k.slice(st.length).match(/\d{2}/)||[])[0];
        const sc=x=>{let j=0;while(j<x.length&&j<k.length&&x[j]===k[j])j++;const rest=x.slice(st.length);return j+(vc&&rest.includes(vc)?8:0)-(vc&&/ADJ/.test(rest)?6:0);};
        let pool=hint?fam.filter(x=>hint[1].test(pkgText(byN.get(x)))):[];
        // no package clue: every variant must share one pinout AND the KiCad name's own suffix (package code, x = any) must
        // appear in the part number (LMR33630ADDA ≠ LMR33630AQRNXRQ1; MCP2562-E-SN ≈ MCP2562FD-E/SN; MCP2542FDxMF ≈ MCP2542FD)
        if(!pool.length&&!hint){const s0=sig(fam[0]);if(fam.every(x=>sig(x)===s0)){const suf=x=>{let j=0;while(j<x.length&&j<k.length&&x[j]===k[j])j++;return[x.slice(j),k.slice(j)];};
          pool=fam.filter(x=>{const[a,b]=suf(x);if(!b)return true;if(!a)return true;try{return new RegExp(a.replace(/X/g,'.')).test(b);}catch(e){return false;}});}}
        if(pool.length){p=byN.get(pool.sort((a,b)=>sc(b)-sc(a))[0]);how='family';break;}}}
    if(p)out[m]=Object.assign({},p,{mpn:m,kicad:p.mpn,match:how,conf:how==='exact'?0.95:how==='prefix'?0.8:0.6});});
  return out;}
return{parseLib,parseDcm,parseSym,parseFiles,pick,pkgOf,sexpr};
})();
if(typeof module!=='undefined')module.exports=KICADLIB;
