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

test('current: IPC-2221 widths and net current estimate', () => {
  const { CURRENT, NEWPROJ } = load();
  assert.ok(Math.abs(CURRENT.ipcWidth(1) - 0.3) < 0.05 && Math.abs(CURRENT.ipcWidth(5) - 2.77) < 0.1);
  assert.ok(CURRENT.ipcWidth(2, { inner: true }) > CURRENT.ipcWidth(2) && CURRENT.ipcWidth(2, { oz: 2 }) < CURRENT.ipcWidth(2));
  assert.ok(CURRENT.ipcRise(0.3, 3) > 50 && CURRENT.ipcRise(2, 1) < 5);
  assert.equal(CURRENT.railV('+3V3'), 3.3); assert.equal(CURRENT.railV('VCC_5V'), 5); assert.ok(!CURRENT.isRail('USB_DM') && CURRENT.isRail('VBUS') && CURRENT.isPhase('PH_U'));
  const P = NEWPROJ.planFrom('12V 차량 배터리, STM32, CAN, BLDC 모터 구동(홀) 6A, LED 2개'); const { B } = NEWPROJ.toBoard(P.plan || P, { place: false });
  const W = CURRENT.widths(B);
  assert.ok(W.PH_U.I >= 6 && W.PH_U.cls === 'phase' && W.PH_U.pour, 'phase current from the requirement');
  assert.ok(W['+12V'].I > 3 && W['+3V3'].I > 0.1 && W['+3V3'].I < 1, 'rails');
  B.netWidth = { '+12V': 1.5 }; B.netCurrent = { '+3V3': 2 };
  const W2 = CURRENT.widths(B); assert.equal(W2['+12V'].w, 1.5); assert.ok(W2['+12V'].manual); assert.equal(W2['+3V3'].I, 2); assert.ok(W2['+3V3'].ipc > 0.7);
  assert.match(CURRENT.text(B), /PH_U.*모터상.*6\.00 A/);
});
