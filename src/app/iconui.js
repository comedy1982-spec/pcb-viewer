/* ---------- icons: one stroke set (16-grid, 1.6 px) keyed by what the control does; applied to static and dynamically
   rendered buttons/tabs by selector so every button carries the symbol of its function ---------- */
const ICON_PATHS={
  home:'M2.5 8 8 3l5.5 5M4 7v6h8V7',
  grid:'M1.5 2.5h5v4h-5zM9.5 2.5h5v4h-5zM1.5 9.5h5v4h-5zM9.5 9.5h5v4h-5z',
  // stages
  sys:'M2 3h4v3.5H2zM10 3h4v3.5h-4zM6 9.5h4V13H6zM4 6.5V8h8V6.5M8 8v1.5',
  sch:'M1.5 5.5h2l1-2 2 4 2-4 2 4 1-2h2M8 7.5v2.5M5 10h6M6.3 12h3.4M7.4 14h1.2',
  pcb:'M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM5.3 10.7 7 9h2.5l1.7-1.7M5.3 10.7a1.2 1.2 0 1 0-.01 0M11.2 7.3a1.2 1.2 0 1 0-.01 0',
  cad:'M2 7l6 2.5L14 7v4L8 13.5 2 11zM8 9.5v4M3.5 4 8 2.2 12.5 4 8 5.8z',
  hsis:'M2.5 4h3v8h-3zM1 6h1.5M1 10h1.5M5.5 6h2M5.5 10h2M9 5h5M9 8h5M9 11h5',
  // files
  upload:'M8 2.5v7.5M5 7.2 8 10.2l3-3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10',
  download:'M8 2.5v8M4.8 7.4 8 10.6l3.2-3.2M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10',
  export:'M8 10V2.5M5 5.5 8 2.5l3 3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10',
  history:'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.3 2.6v2.6h2.6M8 5v3.2l2.1 1.3',
  image:'M2.5 3.5h11v9h-11zM2.5 10.5 6 7l3 3 2-2 2.5 2.5M10.5 6h.01',
  table:'M2.5 3h11v10h-11zM2.5 6.5h11M2.5 9.5h11M6.5 3v10',
  doc:'M4 2h5l3 3v9H4zM9 2v3h3M6 12V9.5M8 12V7.5M10 12v-3',
  zip:'M3 2.5h10v11H3zM6.5 2.5v2M6.5 6.5v2M6.5 10.5v2',
  // views
  cube:'M8 2 14 5v6l-6 3-6-3V5zM8 8l6-3M8 8 2 5M8 8v6',
  top:'M2 11l6 3 6-3M2 8l6 3 6-3M2 5l6-3 6 3-6 3z',
  bottom:'M2 5l6-3 6 3M2 8l6-3 6 3M2 11l6 3 6-3-6-3z',
  layers:'M2 5l6-3 6 3-6 3zM2 11l6 3 6-3|M2 8l6-3 6 3-6 3z',
  split:'M1.5 3h13v10h-13zM8 3v10M3 8h1l1-1.5 1 3 1-1.5M10 6.5h2.5v3H10z',
  window:'M2 2.5h4.5V7H2zM2 9h4.5v4.5H2zM9.5 9H14v4.5H9.5zM9.5 2.5H14v4.5M9.5 7 14 2.5',
  chat:'M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5zM8 4.3l.7 1.6 1.6.7-1.6.7L8 8.9l-.7-1.6-1.6-.7 1.6-.7z',
  // dock
  ai:'M8 2l1.4 3.6L13 7l-3.6 1.4L8 12l-1.4-3.6L3 7l3.6-1.4zM12.5 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
  info:'M8 14.5A6.5 6.5 0 1 1 8 1.5a6.5 6.5 0 0 1 0 13zM8 7v4M8 5h.01',
  sim:'M1.5 12.5h13M2 8h2.5l1.5-4 2 8 2-6 1 2h3',
  // info tabs
  cursor:'M4 2l9 6-4 1-2 4z',
  list:'M3 4h1M6 4h7M3 8h1M6 8h7M3 12h1M6 12h7',
  net:'M3 3h3v3H3zM10 10h3v3h-3zM10 3h3v3h-3zM3 10h3v3H3zM6 4.5h4M6 11.5h4M4.5 6v4M11.5 6v4',
  data:'M2.5 3h11v10h-11zM2.5 6.5h11M6 6.5V13',
  // sim tabs
  volt:'M9 1.5 4 9h4l-1 5.5L12 7H8z',
  wave:'M1.5 8c2-6 4-6 6 0s4 6 6 0M14.5 8h0',
  thermo:'M5.5 9.3V3a1.5 1.5 0 0 1 3 0v6.3a2.5 2.5 0 1 1-3 0zM7 6v5M11 3c.8.8.8 1.7 0 2.5s-.8 1.7 0 2.5M13.5 3c.8.8.8 1.7 0 2.5s-.8 1.7 0 2.5',
  emc:'M8 10.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM5.5 12a4 4 0 0 1 0-5M10.5 12a4 4 0 0 0 0-5M3.5 14a7 7 0 0 1 0-9M12.5 14a7 7 0 0 0 0-9',
  circuit:'M2 8h2.5M11.5 8H14M4.5 5.5h7v5h-7zM8 2v3.5M8 10.5V14',
  // hsis tabs
  chip:'M4.5 4.5h7v7h-7zM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14',
  link:'M6.5 9.5l3-3M5 11a2.5 2.5 0 0 1 0-3.5l1.5-1.5M11 5a2.5 2.5 0 0 1 0 3.5L9.5 10',
  check:'M3 8.5l3 3 7-7',
  wand:'M3 13l7-7M10 3l.6 1.4L12 5l-1.4.6L10 7l-.6-1.4L8 5l1.4-.6zM13 9l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z',
  gear:'M8 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  clipboard:'M5 3h6v2H5zM4 4H3.5v10h9V4H12M6 8.5h4M6 11h4',
  // actions
  fit:'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  zoom:'M7 11.5A4.5 4.5 0 1 1 7 2.5a4.5 4.5 0 0 1 0 9zM10.5 10.5 14 14M7 5v4M5 7h4',
  edit:'M11 2.5l2.5 2.5L6 12.5H3.5V10zM9.5 4l2.5 2.5',
  extract:'M8 2.5v7M5.2 6.8 8 9.6l2.8-2.8M2.5 11v2.5h11V11',
  plus:'M8 3v10M3 8h10',
  next:'M3 8h9M8.5 4.5 12 8l-3.5 3.5',
  undo:'M5 4.5H2.5V2M2.7 4.5A5.5 5.5 0 1 1 2.5 8',
  save:'M3 2.5h8l2.5 2.5v8.5H3zM5 2.5V6h5V2.5M5 13.5V9.5h6v4',
  lid:'M2 10h12v3H2zM2 7l2-4.5h8L14 7zM8 2.5V7',
  drawing:'M2.5 2.5h11v11h-11zM2.5 10h11M5 2.5v7.5M8 6h3',
  dollar:'M2.5 2.5h5l6 6-5 5-6-6zM5 5h.01M7 8l2 2M8.5 6.5l2 2',
  ruler:'M2.5 2.5h3.5v5H2.5zM10 2.5h3.5v5H10zM6 10.5h4M6 9.5v2M10 9.5v2M8 7.5v2',
  badge:'M2.5 4l1 1 2-2M6.5 4h7M2.5 8l1 1 2-2M6.5 8h7M3.5 12h.01M6.5 12h7',
  box:'M2 6 7.5 3.5 13 6v5.5L7.5 14 2 11.5zM7.5 8.5 13 6M7.5 8.5 2 6M7.5 8.5V14M13 1.2c.8 1.1 1.4 1.8 1.4 2.4a1.4 1.4 0 0 1-2.8 0c0-.6.6-1.3 1.4-2.4z',
  play:'M5 3l8 5-8 5z',
  stop:'M4 4h8v8H4z',
  compare:'M2.5 2.5h7v7h-7zM7.5 6.5h2M11 6.5h2.5v2M13.5 10v2M13.5 13.5h-2M10 13.5H7.5v-2M7.5 10V9',
  close:'M4 4l8 8M12 4l-8 8',
  newdoc:'M4 2h5l3 3v9H4zM9 2v3h3M8 7v4M6 9h4',
  folder:'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zM4.5 10.5 7 8l2 2 2.5-2.5',
  card:'M2 3.5h12v9H2zM4.5 6.5h1.5M5.25 5.75v1.5M8 6.5h4M4.5 9.5h1.5M8 9.5h4',
  chipok:'M3 3h7v7H3zM5 1.5V3M8 1.5V3M1.5 5H3M1.5 8H3M5 10v1.5M8 10v1.5M10 5h1.5M9 12.5l1.5 1.5L14 10.5'};
function icon(name,cls){let d=ICON_PATHS[name];if(!d)return'';let f='';const i=d.indexOf('|');if(i>=0){f=d.slice(i+1);d=d.slice(0,i);}
  return`<svg class="ic${cls?' '+cls:''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/>${f?`<path d="${f}" fill="currentColor" stroke="none" opacity=".85"/>`:''}</svg>`;}
/* brand mark: "Trace A" — the first letter drawn as copper traces with pads, stage colours (blue · amber · green · purple) */
const LOGO_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5 5.8 18.2M12 5l6.2 13.2" stroke="#5aa2ff"/><path d="M8.6 12.6h6.8" stroke="#f0b24a"/><circle cx="12" cy="4.6" r="2" fill="#5aa2ff" stroke="none"/><circle cx="5.5" cy="19" r="2.1" fill="#0f1116" stroke="#3ecf8e"/><circle cx="18.5" cy="19" r="2.1" fill="#0f1116" stroke="#b48cff"/></svg>`;
function logoApply(){const b=document.querySelector('#homeBtn');if(b&&!b.querySelector('svg'))b.innerHTML=LOGO_SVG;
  if(!document.querySelector('link[rel=icon]')){const l=document.createElement('link');l.rel='icon';l.type='image/svg+xml';l.href='data:image/svg+xml,'+encodeURIComponent(LOGO_SVG.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace('fill="#0f1116"','fill="#0f1116"'));document.head.appendChild(l);}}
// selector → icon; `swap` replaces an svg the markup already has
const ICON_MAP=[
  ['#ovBtn','grid',1],['#st-1','sys'],['#st-2','sch'],['#st-3','pcb'],['#st-4','cad'],['#ws-hsis','hsis'],['#ws-cad','cad'],['#ws-mb','link'],['#plBtn','chip'],['[data-mbx=svg]','export'],['[data-mbx=png]','image'],['[data-mbx=xlsx]','table'],['#ws-board','pcb'],
  ['#openImp','upload',1],['#expBtn','export',1],['#revBtn','history',1],
  ['#v-3d','cube'],['#v-layer','layers'],['[data-ly]','layers'],['#v-top','top'],['#v-bot','bottom'],['#v-sch','sch'],['#splitBtn','split',1],['#winBtn','window',1],['#dockTg','chat',1],['#dk-ai','chat'],
  ['#dk-info','info'],['#dk-sim','sim'],['#dk-ds','doc'],['#p-info','info'],['#p-sim','sim'],
  ['#t-sel','cursor'],['#t-bom','list'],['#t-net','net'],['#t-data','data'],
  ['#st-ir','volt'],['#st-si','wave'],['#st-th','thermo'],['#st-emc','emc'],['#st-sp','circuit'],
  ['#htab-table','table'],['#htab-pins','chip'],['#htab-trace','link'],['#htab-chk','check'],['#htab-rec','wand'],['#htab-mcal','gear'],['#htab-tc','clipboard'],
  ['#schFitBtn','fit'],['#schPop','export'],['#schEdit','edit'],['#schOpen','upload'],['#pbPlay','play'],
  ['#npPlan','sys'],['#npGen','next'],['#npAdd','plus'],['#arAdd','plus'],['#sysFromBoard','extract'],['#sysZoom','zoom'],['#sysSvgDl','download'],
  ['#cadOpen','lid'],['#cadExp','zip'],['#cadDwg','drawing'],['#cadBom','table'],['#cadUndo','undo'],['#cadSelClr','close'],['#cadSelMode','ai'],
  ['#impGo','pcb'],['#impClear','close'],['#fwRun','play'],['#fwCheck','check'],['#fw3d','cube'],['#fwReset','undo'],
  ['[data-cam="fit"]','fit'],['[data-cam="iso"]','cube'],['[data-cam="top"]','top'],['[data-cam="bot"]','bottom'],['[data-pe]','edit'],['[data-pop]','export'],['[data-exp="svg"]','image'],['[data-exp="png"]','image'],
  ['[data-rv="save"]','save'],['[data-rv="export"]','download'],['[data-rv="import"]','upload'],['[data-rv="xlsx"]','table'],['[data-rv="fit"]','fit'],['[data-lv="list"]','list'],['[data-lv="ledger"]','table'],
  ['[data-ov="rev"]','history'],['[data-ov="export"]','export'],['[data-ov="back"]','next'],
  ['[data-approve]','check'],['[data-cmp]','compare'],['.cr-h','card'],['[data-undo]','undo'],['[data-keep]','check'],
  ['[data-st="bom"]','dollar'],['[data-st="guide"]','badge'],['[data-st="drc"]','ruler'],['[data-st="hsis"]','chipok'],['[data-st="tj"]','thermo'],['[data-st="house"]','box'],['[data-st="sys"]','sys'],['[data-st="ans"]','ai'],['[data-st="pcb"]','pcb'],
  ['#homeNew .hc-ico','newdoc',1],['#homeOpen .hc-ico','folder',1],['#cadSelClr','close'],['#copStop','stop'],['#copSend','next']];
function iconApply(root){root=root||document;ICON_MAP.forEach(([sel,name,swap])=>{let els;try{els=root.querySelectorAll(sel);}catch(e){return;}els.forEach(el=>{if(el.querySelector(':scope>svg.ic'))return;const had=el.dataset.ic===name;el.dataset.ic=name;
    const old=el.querySelector(':scope>svg:not(.ic)');if(old&&swap&&!had){old.outerHTML=icon(name);return;}if(el.classList.contains('hc-ico')){el.innerHTML=icon(name,'big');return;}
    el.insertAdjacentHTML('afterbegin',icon(name));});});}
{let raf=0;const kick=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;iconApply();logoApply();});};iconApply();logoApply();
  new MutationObserver(ms=>{for(const m of ms){if(m.addedNodes&&m.addedNodes.length){kick();return;}}}).observe(document.body,{childList:true,subtree:true});}
