/* Second built-in example: a low-side MOSFET DC motor driver with power and run LEDs (viewer JSON format) */
const SAMPLE_MOTOR=(function(){
  const T=[],V=[];
  const tr=(layer,net,width,...points)=>T.push({layer:layer==='T'?'top':'bottom',net,width,points});
  const via=(net,...pts)=>pts.forEach(p=>V.push({x:p[0],y:p[1],net,size:0.8,drill:0.4}));
  // 5 V input rail
  tr('T','VIN',1.0,'J1.1',[36,31.27],'M1.1');
  tr('T','VIN',0.8,[14.5,31.27],'C1.1');
  tr('T','VIN',0.5,[15.2,31.27],'C2.1');
  tr('T','VIN',0.8,'D1.2',[30,31.27]);
  tr('T','VIN',0.4,[10,31.27],[10,40],'R3.1');
  tr('T','VIN',0.5,[36,31.27],[39.5,31.27]);tr('B','VIN',0.5,[39.5,31.27],[39.5,8]);tr('T','VIN',0.4,[39.5,8],'R4.1');via('VIN',[39.5,31.27],[39.5,8]);
  // motor low side
  tr('T','MOT_N',1.0,'Q1.3',[26,21.5],'D1.1');
  tr('T','MOT_N',1.0,'D1.1',[33,21.5],'M1.2');
  tr('T','MOT_N',0.4,'D3.2',[48.5,8],[48.5,5.5],[33,5.5],[33,21.5]);
  // gate drive
  tr('T','PWM',0.4,'J2.1','R1.1');
  tr('T','GATE',0.4,'R1.2',[21,15.27],[23.2,13],'Q1.1');
  tr('T','GATE',0.4,'R2.2',[21,15.27]);
  // LEDs
  tr('T','PWR_A',0.3,'R3.2','D2.1');
  tr('T','RUN_A',0.3,'R4.2','D3.1');
  // ground: short stubs to vias into the bottom pour
  const G=[['C1.2',[19.5,36]],['C2.2',[18.5,26]],['R2.1',[21,6.5]],['Q1.2',[28.5,11]],['D2.2',[19,40]]];
  G.forEach(([a,b])=>{tr('T','GND',0.5,a,b);via('GND',b);});
  return{
    _source:'예제',_demo:'motor',
    board:{name:'MOTOR-DRV v1.0',width:70,height:45,thickness:1.6,corner:2,holes:[[3.5,3.5,3.2],[66.5,3.5,3.2],[3.5,41.5,3.2],[66.5,41.5,3.2]]},
    components:[
      {ref:'J1',value:'5V 입력',footprint:'HDR-1x2',side:'top',x:6,y:30,rotation:0,mpn:'PH-2.54-1x2',description:'모터 전원 입력 · 2.54 mm',pins:{1:'VIN',2:'GND'},pinNames:{1:'5V',2:'GND'}},
      {ref:'J2',value:'PWM 입력',footprint:'HDR-1x2',side:'top',x:6,y:14,rotation:0,mpn:'PH-2.54-1x2',description:'구동 신호 입력 (3.3 V 로직 PWM)',pins:{1:'PWM',2:'GND'},pinNames:{1:'PWM',2:'GND'}},
      {ref:'C1',value:'100µF',footprint:'1206',side:'top',x:16,y:36,rotation:0,mpn:'GRM31CR60J107ME39',description:'모터 전원 벌크 커패시터',pins:{1:'VIN',2:'GND'}},
      {ref:'C2',value:'100nF',footprint:'0603',side:'top',x:16,y:26,rotation:0,mpn:'CL10B104KB8NNNC',description:'고주파 디커플링',pins:{1:'VIN',2:'GND'}},
      {ref:'R1',value:'100Ω',footprint:'0603',side:'top',x:14,y:15.27,rotation:0,mpn:'RC0603FR-07100RL',description:'게이트 직렬 저항',pins:{1:'PWM',2:'GATE'}},
      {ref:'R2',value:'10kΩ',footprint:'0603',side:'top',x:21,y:9,rotation:90,mpn:'RC0603FR-0710KL',description:'게이트 풀다운 (입력 개방 시 OFF)',pins:{1:'GND',2:'GATE'},label:[23,9]},
      {ref:'Q1',value:'AO3400A',footprint:'SOT-23',side:'top',x:26,y:14,rotation:0,mpn:'AO3400A',description:'N채널 MOSFET 30 V 5.7 A · 로우사이드 스위치',pins:{1:'GATE',2:'GND',3:'MOT_N'},pinNames:{1:'G',2:'S',3:'D'},model:{type:'nmos',vth:1.2,kp:8,lambda:0.01}},
      {ref:'D1',value:'SS14',footprint:'SMA',side:'top',x:30,y:24,rotation:90,mpn:'SS14',description:'플라이백 쇼트키 다이오드 (모터 역기전력 흡수)',pins:{1:'MOT_N',2:'VIN'},pinNames:{1:'A',2:'K'},label:[33,26]},
      {ref:'M1',value:'DC 모터 130',footprint:'MOTOR-130',side:'top',x:50,y:24,rotation:0,mpn:'RF-130 + 기어 1:48',description:'브러시 DC 모터 · 5 V · 기어비 1:48 출력 팬',pins:{1:'VIN',2:'MOT_N'},pinNames:{1:'+',2:'-'},label:[50,13.5],
        model:{R:2.5,L:5e-4,ke:0.004,kt:0.004,J:6e-7,b:2e-7,tf:1e-4,tl:0,gear:48}},
      {ref:'R3',value:'1kΩ',footprint:'0603',side:'top',x:12,y:40,rotation:0,mpn:'RC0603FR-071KL',description:'전원 LED 전류 제한',pins:{1:'VIN',2:'PWR_A'}},
      {ref:'D2',value:'LED 빨강',footprint:'LED-0603',side:'top',x:16.5,y:40,rotation:0,mpn:'19-217/R6C',description:'전원 표시 LED · 630 nm',pins:{1:'PWR_A',2:'GND'},pinNames:{1:'A',2:'K'}},
      {ref:'R4',value:'680Ω',footprint:'0603',side:'top',x:42,y:8,rotation:0,mpn:'RC0603FR-07680RL',description:'구동 LED 전류 제한',pins:{1:'VIN',2:'RUN_A'}},
      {ref:'D3',value:'LED 녹색',footprint:'LED-0603',side:'top',x:46,y:8,rotation:0,mpn:'19-217/GHC',description:'모터 구동 표시 LED (MOSFET이 켜지면 점등)',pins:{1:'RUN_A',2:'MOT_N'},pinNames:{1:'A',2:'K'}},
    ],
    tracks:T,vias:V,
    pours:[{layer:'bottom',net:'GND',clearance:0.4,inset:0.5}],
    texts:[
      {side:'top',text:'MOTOR-DRV',x:16,y:5,size:1.2},{side:'top',text:'v1.0',x:22.4,y:5,size:0.8,align:'left'},
      {side:'top',text:'5V',x:2.6,y:34,size:0.8},{side:'top',text:'PWM',x:3.2,y:18,size:0.8},
      {side:'top',text:'PWR',x:16.5,y:42.4,size:0.6},{side:'top',text:'RUN',x:46,y:10.4,size:0.6},
      {side:'bottom',text:'MOTOR-DRV · LOW-SIDE NMOS',x:35,y:6,size:0.9},
    ]
  };
})();
