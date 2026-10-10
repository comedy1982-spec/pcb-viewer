/* MCU firmware runtime for the circuit simulator: Arduino-style JavaScript, run in-loop with the transient (co-simulation). */
const FW=(function(){
"use strict";
const HEADER_LINES=3; // lines before the user code: new Function()'s own header (2) + the API line (1)
const API_NAMES=['pinMode','digitalWrite','digitalRead','pwmInit','pwmWrite','analogWrite','analogRead','analogReadVoltage','millis','log','HIGH','LOW','OUTPUT','INPUT','VDD'];

// "const NAME = 123; // comment" lines become editable parameters
const PARAM_RE=/^([ \t]*(?:const|let|var)[ \t]+)([A-Z][A-Z0-9_]*)([ \t]*=[ \t]*)(-?\d+(?:\.\d+)?)([ \t]*;?)([ \t]*\/\/[ \t]*(.*))?$/gm;
function params(code){const out=[];let m;PARAM_RE.lastIndex=0;while((m=PARAM_RE.exec(code))){const line=code.slice(0,m.index).split('\n').length;out.push({name:m[2],value:+m[4],comment:(m[7]||'').trim(),line});}return out;}
function setParam(code,name,value){PARAM_RE.lastIndex=0;return code.replace(PARAM_RE,(all,a,n,b,v,c,cm)=>n===name?a+n+b+String(value)+c+(cm||''):all);}

// guard loops so a mistaken while(true) cannot freeze the page
function instrument(code){return code.replace(/\b(while|for)\s*\(((?:[^()]|\([^()]*\))*)\)\s*\{/g,(m,k,c)=>`${k}(${c}){__guard();`).replace(/\bdo\s*\{/g,'do{__guard();');}
function lineOf(err){const s=String(err&&err.stack||'');const m=s.match(/<anonymous>:(\d+):(\d+)/);return m?Math.max(1,+m[1]-HEADER_LINES):null;}

function compile(code,pinNames){
  const pins={};(pinNames||[]).forEach(p=>{pins[p]=p;});
  const pinDecl=Object.keys(pins).map(p=>`const ${p}=${JSON.stringify(p)};`).join('');
  let factory;
  try{factory=new Function('__api',`"use strict";const {${API_NAMES.join(',')},__guard}=__api;${pinDecl}\n${instrument(code)}\n;return{setup:typeof setup==='function'?setup:null,loop:typeof loop==='function'?loop:null};`);}
  catch(e){const m=String(e.message);return{error:'문법 오류: '+m,line:lineOf(e)};}
  return{factory};
}

// Builds a controller: run setup() to learn which pins are driven, then tick loop(ms) every millisecond during the transient.
function controller(code,mcu){
  // mcu: {pins:{PA8:'NET',...}, gnd:'GND', vdd:3.3}
  const logs=[],trace={t:[],out:{},adc:{}};let ms=0,guard=0;const st={};
  const pinNet=p=>{if(!mcu.pins[p])throw new Error(`${p} 핀은 이 MCU에서 연결되어 있지 않습니다.`);return mcu.pins[p];};
  let read=()=>0;
  const api={
    HIGH:1,LOW:0,OUTPUT:'OUTPUT',INPUT:'INPUT',VDD:mcu.vdd,
    pinMode:(p,m)=>{pinNet(p);if(m==='OUTPUT'){st[p]=st[p]||{pwm:false,level:0,duty:0,freq:0};}},
    pwmInit:(p,f)=>{pinNet(p);f=+f;if(!(f>0))throw new Error('pwmInit 주파수는 0보다 커야 합니다.');st[p]={pwm:true,level:0,duty:0,freq:f};},
    pwmWrite:(p,d)=>{const s=st[p];if(!s||!s.pwm)throw new Error(`${p}: pwmInit을 먼저 호출하세요.`);d=+d;s.duty=Math.max(0,Math.min(100,isFinite(d)?d:0))/100;},
    analogWrite:(p,v)=>{const s=st[p];if(!s||!s.pwm)throw new Error(`${p}: pwmInit을 먼저 호출하세요.`);s.duty=Math.max(0,Math.min(255,+v||0))/255;},
    digitalWrite:(p,v)=>{const s=st[p];if(!s)throw new Error(`${p}: pinMode(${p}, OUTPUT)을 먼저 호출하세요.`);if(s.pwm)throw new Error(`${p}는 PWM 핀으로 설정되어 있습니다.`);s.level=v?1:0;},
    digitalRead:p=>read(pinNet(p))>mcu.vdd/2?1:0,
    analogRead:p=>Math.max(0,Math.min(4095,Math.round(read(pinNet(p))/mcu.vdd*4095))),
    analogReadVoltage:p=>Math.max(0,Math.min(mcu.vdd,read(pinNet(p)))),
    millis:()=>ms,
    log:(...a)=>{if(logs.length<300)logs.push({ms,text:a.map(x=>typeof x==='number'?(Number.isInteger(x)?String(x):x.toFixed(3)):String(x)).join(' ')});},
    __guard:()=>{if(++guard>2e6)throw new Error('반복문이 너무 오래 돕니다 (무한 루프?).');}
  };
  const c=compile(code,Object.keys(mcu.pins));if(c.error)return{error:c.error,line:c.line,logs};
  let inst;try{inst=c.factory(api);}catch(e){return{error:'실행 오류: '+e.message,line:lineOf(e),logs};}
  if(!inst.loop)return{error:'loop(ms) 함수가 없습니다.',logs};
  try{if(inst.setup)inst.setup();}catch(e){return{error:'setup() 오류: '+e.message,line:lineOf(e),logs};}
  const outs=Object.keys(st);if(!outs.length)return{error:'출력 핀이 없습니다. setup()에서 pinMode(핀, OUTPUT) 또는 pwmInit(핀, 주파수)을 호출하세요.',logs};
  const srcs=outs.map(p=>({id:'FW_'+p,type:'V',n:[mcu.pins[p],mcu.gnd],v:mcu.vdd,wave:'fw',pwm:st[p].pwm,freq:st[p].freq,duty:0,level:0,ph0:0,fw:true,label:`${mcu.ref||'MCU'} ${p} · ${st[p].pwm?'PWM':'GPIO'} (펌웨어)`}));
  outs.forEach(p=>{trace.out[p]=[];});
  const ctl={dt:1e-3,srcs,logs,trace,error:null,errLine:null,
    tick(t,readNet,set){
      ms=Math.round(t*1000);read=readNet;guard=0;
      try{inst.loop(ms);}catch(e){if(!ctl.error){ctl.error=`loop(${ms}) 오류: ${e.message}`;ctl.errLine=lineOf(e);}}
      trace.t.push(ms);
      outs.forEach(p=>{const s=st[p];set('FW_'+p,s.pwm?{duty:s.duty,freq:s.freq}:{level:s.level});trace.out[p].push(s.pwm?s.duty:s.level);});
    }};
  return ctl;
}
return{params,setParam,compile,controller,API_NAMES};
})();
if(typeof module!=='undefined')module.exports=FW;
