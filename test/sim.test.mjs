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
