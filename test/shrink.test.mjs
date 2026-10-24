import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { NEWPROJ, PCBEDIT, PCB } = load();
test('package shrink: verified swaps only, voltage / power / thermal limits respected, smaller board, clean placement', () => {
  const { plan } = NEWPROJ.planFrom('12V 입력 CAN 센서 노드, STM32, I2C 센서 확장, UART 디버그, LED 1개');
  const r0 = NEWPROJ.build(plan);
  assert.equal(r0.shrink, null);
  plan.shrink = 2;
  const r = NEWPROJ.build(plan);
  assert.ok(r.area < r0.area * 0.9, 'part area shrinks');
  assert.ok(r.W * r.H < r0.W * r0.H);
  // 5 V → 3.3 V LDO: SOT-223 → TLV75533 SOT-23-5 with the KiCad 10 pinout (1 IN · 2 GND · 3 EN · 5 OUT), EN tied to IN
  const u = r.parts.find(p => p.mpn === 'TLV75533PDBVR');
  assert.ok(u); assert.equal(u.pins[1], '+5V'); assert.equal(u.pins[3], '+5V'); assert.equal(u.pins[2], 'GND'); assert.equal(u.pins[5], '+3V3'); assert.equal(u.pins[4], undefined);
  // battery-side capacitors keep a ≥ 50 V part: a 16 V 0402 100 nF never lands on the 12 V input
  for (const c of r.parts.filter(p => /^C/.test(p.ref) && p.fp === '0402')) assert.ok(!Object.values(c.pins).some(n => /VIN|\+12V/.test(n)) || !/CL05B104KO5/.test(c.mpn), c.ref);
  assert.ok(r.shrink.kept.some(k => /정격 16 V < 필요 50 V/.test(k.why)));
  // resistors 0603 → 0402 keep the Yageo series
  assert.ok(r.parts.some(p => /^RC0402FR-07/.test(p.mpn)));
  // the text report lists swaps and what stayed
  const t = NEWPROJ.shrinkText(r); assert.ok(/교체/.test(t) && /유지/.test(t));
  const { B } = NEWPROJ.toBoard(plan, { seed: 1 });
  assert.ok(B.comps.every(c => PCB.FP[c.fp]), 'every footprint exists');
  assert.equal(PCBEDIT.drc(B).filter(d => d.code === 'courtyard' || d.code === 'edge').length, 0);
  // level 1 keeps 0603
  plan.shrink = 1; const r1 = NEWPROJ.build(plan);
  assert.ok(!r1.parts.some(p => p.fp === '0402'));
});
test('package shrink: motor bridge → half-bridge package when the current fits, DPAK kept above 60 A', () => {
  const { plan } = NEWPROJ.planFrom('12V 차량 배터리, BLDC 모터 3상 20 A, CAN, STM32');
  plan.shrink = 1;
  let r = NEWPROJ.build(plan);
  assert.ok(r.parts.filter(p => p.val === 'IAUC60N04S6N050H').length >= 3);
  plan.blocks.filter(b => b.type === 'gdrv3').forEach(b => { b.params.i = 100; });
  r = NEWPROJ.build(plan);
  assert.ok(!r.parts.some(p => p.val === 'IAUC60N04S6N050H'));
  assert.ok(r.shrink.kept.some(k => /60 A/.test(k.why)));
});
test('package shrink: 12 V → 3.3 V at low load → TPS7B8133-Q1 WSON-6 (EP = GND) with a 6-pin + pad footprint', () => {
  const { plan } = NEWPROJ.planFrom('12V 입력, STM32, LED 1개, 버튼 1개');
  plan.shrink = 1;
  const r = NEWPROJ.build(plan);
  const u = r.parts.find(p => p.mpn === 'TPS7B8133QDRVRQ1');
  assert.ok(u);
  assert.deepEqual(u.pins, { 1: '+12V', 2: '+12V', 3: 'GND', 4: 'GND', 6: '+3V3', 7: 'GND' });
  assert.deepEqual(PCB.FP[u.fp].pads.map(p => p.n), ['1', '2', '3', '4', '5', '6', '7']);
});
