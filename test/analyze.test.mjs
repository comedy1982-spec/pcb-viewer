import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { ANALYZE, PCB, SAMPLE_MCU } = load();

function board(){ return PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_MCU)))); }

test('analyze: power tree finds the regulator rail and its decoupling', () => {
  const B = board(); const P = ANALYZE.powerTree(B);
  const r33 = P.rails.find(r => r.net === '+3V3');
  assert.ok(r33, '+3V3 rail'); assert.ok(/U2/.test(r33.from)); assert.ok(r33.ics.includes('U1')); assert.ok(r33.caps.length >= 1);
  assert.ok(ANALYZE.powerText(B).includes('[전원 트리]'));
});

test('analyze: decoupling audit and passive patterns', () => {
  const B = board(); const D = ANALYZE.decap(B);
  assert.ok(D.some(x => x.ref === 'U1' && x.net === '+3V3'));
  const P = ANALYZE.patterns(B);
  assert.ok(P.some(p => p.type === 'LED' && p.I > 0.001 && p.I < 0.03), 'LED current in a sane range');
  assert.ok(ANALYZE.patternText(B).length > 10);
});

test('analyze: AC sweep of an RC low-pass gives the right -3 dB point', () => {
  const B = PCB.finalize(PCB.fromSpec({ board: { width: 20, height: 20 }, components: [
    { ref: 'R1', value: '1kΩ', footprint: '0603', x: 5, y: 5, pins: { 1: 'IN', 2: 'OUT' } },
    { ref: 'C1', value: '100nF', footprint: '0603', x: 10, y: 5, pins: { 1: 'OUT', 2: 'GND' } },
    { ref: 'J1', value: 'hdr', footprint: 'HDR-1x2', x: 15, y: 5, pins: { 1: 'IN', 2: 'GND' } }] }));
  const r = ANALYZE.acSweep(B, 'IN', 'OUT', { fmin: 1, fmax: 1e7, points: 121 });
  assert.ok(!r.error, r.error);
  const fc = 1 / (2 * Math.PI * 1e3 * 1e-7);
  assert.ok(Math.abs(r.f3 / fc - 1) < 0.1, `f3 ${r.f3} vs ${fc}`);
  assert.ok(Math.abs(r.dcDb) < 0.1);
  assert.ok(ANALYZE.acText(B, 'IN', 'OUT').includes('-3 dB'));
  assert.ok(ANALYZE.acSweep(B, 'GND', 'OUT').error);
});

test('analyze: DC operating point text through SIM', () => {
  const t = ANALYZE.dcText(board());
  assert.ok(/\[DC 동작점\]/.test(t) && /\+3V3=/.test(t), t.slice(0, 120));
});
