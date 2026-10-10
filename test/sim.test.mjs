import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, SIM, SAMPLE } = load();
const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE))));
const env = { cu: 35, Ta: 25, h: 1.53, er: 4.3, t: 1.6, hconv: 10 };

test('value parsing', () => {
  assert.equal(SIM.parseVal('4.7kΩ'), 4700);
  assert.equal(SIM.parseVal('4K7'), 4700);
  assert.ok(Math.abs(SIM.parseVal('10µF') - 1e-5) < 1e-18);
  assert.ok(Math.abs(SIM.parseVal('100nF') - 1e-7) < 1e-18);
  assert.equal(SIM.parseVal('2R2'), 2.2);
  assert.equal(SIM.nominalV('+3V3'), 3.3);
});

test('IR drop on +3V3 reaches every load with a small drop', () => {
  const pads = B.nets['+3V3'].pads;
  const src = pads.find(p => p.ref === 'U2' && p.n === '2');
  const loads = pads.filter(p => p.ref === 'U1' || p.ref === 'U3').map(p => ({ pad: p, I: 0.05 }));
  const r = SIM.irSolve(B, '+3V3', env, src, 3.3, loads);
  assert.equal(r.unconnected.length, 0);
  assert.ok(r.vmin < 3.3 && r.vmin > 3.25, `vmin ${r.vmin}`);
});

test('microstrip impedance is in the expected range', () => {
  const m = SIM.microstrip(2.94, 1.53, 0.035, 4.3);
  assert.ok(Math.abs(m.z0 - 50) < 3, `z0 ${m.z0}`);
});

test('circuit: LDO output and LED forward voltage', () => {
  const ck = SIM.extractCircuit(B);
  assert.ok(ck.els.some(e => e.type === 'REG' && e.vset === 3.3));
  ck.srcs.push({ id: 'V2', type: 'V', n: ['LED', ck.gnd], v: 3.3, wave: 'dc' });
  const dc = SIM.dcop(Object.assign({}, ck, { tDC: 1 }));
  assert.ok(!dc.error, dc.error);
  assert.ok(Math.abs(dc.nets['+3V3'] - 3.3) < 1e-6);
  assert.ok(dc.nets.LED_A > 1.7 && dc.nets.LED_A < 2.1, `LED_A ${dc.nets.LED_A}`);
});

test('thermal: a point source heats above ambient', () => {
  const nx = 60, ny = 40, n = nx * ny, P = new Float64Array(n); P[20 * nx + 30] = 0.5;
  const r = SIM.thermalSolve({ nx, ny, a: 1e-3, mask: new Uint8Array(n).fill(1), cov: new Float32Array(n).fill(0.5) }, { t: 1.6, cu: 35, hconv: 10, Ta: 25 }, P);
  assert.ok(r.tmax > 30 && r.tmin >= 25 - 1e-6);
});

test('MCU example: firmware drives the MOSFET by PWM, the motor spins up, LEDs follow, current limit reads the ADC', () => {
  const { SAMPLE_MCU, FW } = load();
  const M = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_MCU))));
  const ck = SIM.extractCircuit(M);
  assert.ok(ck.els.some(e => e.type === 'NMOS' && e.id === 'Q1'));
  assert.ok(ck.els.some(e => e.type === 'MOTOR' && e.id === 'M1' && e.gear === 58));
  assert.ok(ck.els.some(e => e.type === 'REG' && e.id === 'U2'));
  ck.srcs.forEach(s => { s.wave = 'dc'; });
  const u1 = M.byRef.U1;
  const pins = {}; u1.pads.forEach(p => { if (p.fn && /^P[A-K]\d+$/.test(p.fn)) pins[p.fn] = p.net || null; });
  const ctl = FW.controller(u1.fw, { pins, gnd: ck.gnd, vdd: 3.3, ref: 'U1' });
  assert.ok(!ctl.error, ctl.error);
  assert.equal(ctl.srcs.map(s => s.id).sort().join(','), 'FW_PA4,FW_PA8');
  const tr = SIM.transient(Object.assign({}, ck, { srcs: ck.srcs.concat(ctl.srcs) }), 0.6, 7500, ['ISNS_ADC'], ctl);
  assert.ok(!tr.error && !ctl.error, tr.error || ctl.error);
  const m = tr.anim.mot.M1, n = m.w.length - 1, rpm = i => m.w[i] / 58 * 60 / (2 * Math.PI);
  assert.ok(rpm(Math.round(n * 0.05 / 0.6)) < 1, 'motor still before START_DELAY_MS');
  assert.ok(rpm(n) > 150 && rpm(n) < 600, `rpm ${rpm(n)}`);
  assert.ok(tr.anim.led.D2[n] > 1e-3, 'power LED');
  assert.ok(tr.anim.led.D3[n] > 1e-3 && tr.anim.led.D3[1] < 1e-5, 'status LED off at boot, on when running');
  assert.ok(ctl.logs.some(l => /전류 제한/.test(l.text)), 'current limit engaged via ADC');
  assert.ok(ctl.trace.out.PA8[599] > 0.59, 'target duty reached');
  // parameters are editable in code
  const code2 = FW.setParam(u1.fw, 'TARGET_DUTY', 40);
  assert.equal(FW.params(code2).find(p => p.name === 'TARGET_DUTY').value, 40);
  // runtime errors point at the right line
  const bad = FW.controller(u1.fw.replace('pwmWrite(PA8, duty);', 'pwmWrite(PA8, duty); oops();'), { pins, gnd: 'GND', vdd: 3.3 });
  SIM.transient(Object.assign({}, ck, { srcs: ck.srcs.concat(bad.srcs) }), 0.002, 20, [], bad);
  assert.match(bad.error, /oops/);
  assert.equal(u1.fw.split('\n')[bad.errLine - 1].includes('pwmWrite(PA8, duty)'), true);
  assert.match(FW.controller('function setup(){pinMode(PA5,OUTPUT)}\nfunction loop(){}', { pins, gnd: 'GND', vdd: 3.3 }).error, /PA5/);
});

test('BLDC example: hall-sensor six-step firmware spins the 3-phase motor through the bridge driver', () => {
  const { SAMPLE_BLDC, FW } = load();
  const M = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_BLDC))));
  const ck = SIM.extractCircuit(M);
  assert.ok(ck.els.some(e => e.type === 'BLDC' && e.id === 'M1'));
  assert.equal(ck.els.filter(e => e.type === 'HALL').length, 3);
  assert.ok(ck.els.some(e => e.type === 'BRIDGE3' && e.id === 'U3'));
  ck.srcs.forEach(s => { s.wave = 'dc'; s.v = 12; });
  const u1 = M.byRef.U1, pins = {};
  u1.pads.forEach(p => { if (p.fn && /^P[A-K]\d+$/.test(p.fn)) pins[p.fn] = p.net || null; });
  const ctl = FW.controller(u1.fw, { pins, gnd: ck.gnd, vdd: 3.3, ref: 'U1' });
  assert.ok(!ctl.error, ctl.error);
  assert.ok(Math.abs(ctl.dt - 50e-6) < 1e-9, 'LOOP_PERIOD_US sets the firmware tick');
  const tr = SIM.transient(Object.assign({}, ck, { srcs: ck.srcs.concat(ctl.srcs) }), 0.3, 4800, [], ctl);
  assert.ok(!tr.error && !ctl.error, tr.error || ctl.error);
  const w = tr.anim.mot.M1.w, n = w.length - 1, rpm = i => w[i] * 60 / (2 * Math.PI);
  assert.ok(rpm(n) > 1500 && rpm(n) < 3200, `rpm ${rpm(n)}`);
  assert.ok(rpm(Math.round(n / 3)) < rpm(n), 'accelerating');
  assert.ok(ctl.logs.some(l => /홀 속도 \d{3,}/.test(l.text)), 'firmware measures speed from halls');
  // reversing DIRECTION spins the other way
  const rev = FW.controller(FW.setParam(u1.fw, 'DIRECTION', -1), { pins, gnd: ck.gnd, vdd: 3.3 });
  const tr2 = SIM.transient(Object.assign({}, ck, { srcs: ck.srcs.concat(rev.srcs) }), 0.12, 1920, [], rev);
  assert.ok(tr2.anim.mot.M1.w[1920] < -10, `reverse w ${tr2.anim.mot.M1.w[1920]}`);
});
