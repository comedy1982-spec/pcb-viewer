import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { NEWPROJ, HWARCH, CURRENT, PRODUCTS } = load();
const plan = (t, p) => { const P = NEWPROJ.newPlan('T'); NEWPROJ.addBlock(P, 'pwr_in', { vin: 12 }); NEWPROJ.addBlock(P, 'ldo', { vout: 5 }); NEWPROJ.addBlock(P, 'ldo', { vout: 3.3, vin: '+5V' }); NEWPROJ.addBlock(P, 'mcu', {}); NEWPROJ.addBlock(P, t, p); return P; };

test('hbridge: two half-bridge gate drivers, four external N-MOSFETs, bootstrap, shunt + amp, high-current input and nets', () => {
  const P = plan('hbridge', { i: 10 }); const r = NEWPROJ.build(P);
  const n = re => r.parts.filter(c => re.test(c.val)).length;
  assert.equal(n(/^IR2104S$/), 2); assert.equal(n(/^IPD90N04S4/), 4); assert.equal(n(/^ES1D$/), 2); assert.equal(n(/^INA181/), 1);
  const q = r.parts.filter(c => /^IPD/.test(c.val)); assert.ok(q.every(c => c.fp === 'TO-252' && c.P > 0));
  const hi = q.filter(c => c.pins[2] === '+12V'); assert.equal(hi.length, 2, 'two high-side drains on VM');
  assert.deepEqual(new Set(hi.map(c => c.pins[3])), new Set(['HB_A', 'HB_B']));
  assert.ok(r.parts.some(c => /SQD50P04/.test(c.val)), 'P-FET reverse protection instead of SS14 at 10 A');
  assert.ok(!r.parts.some(c => c.val === 'SS14'));
  assert.ok(['HB_INA', 'HB_INB', 'HB_EN', 'HB_ISNS'].every(x => r.assigned.some(a => a.net === x)), r.assigned.map(a => a.net).join());
  assert.equal(r.warn.length, 0, r.warn.join());
  const { B } = NEWPROJ.toBoard(P, { place: false }); assert.equal(B.netCurrent.HB_A, 10);
  const W = CURRENT.widths(B); assert.ok(W.HB_A.I === 10 && W['+12V'].I >= 10);
});

test('gdrv3 parallels FETs by current; mapping picks hbridge/gdrv3 from the words and upgrades an AI block left on dcmotor', () => {
  const r = NEWPROJ.build(plan('gdrv3', { i: 60, hall: 1 }));
  assert.equal(r.parts.filter(c => /^IR2104S$/.test(c.val)).length, 3);
  assert.equal(r.parts.filter(c => /^IPD90N04S4/.test(c.val)).length, 12, '6 positions × 2 in parallel at 60 A');
  assert.equal(r.parts.filter(c => /^INA181/.test(c.val)).length, 3);
  assert.ok(r.assigned.filter(a => /^PH_IN_/.test(a.net)).length === 3);
  const k = HWARCH.motorKind; assert.equal(k('dc 모터 10 a h-bridge', false).type, 'hbridge'); assert.equal(k('dc 팬 모터 0.5 a', false).type, 'dcmotor');
  assert.equal(k('bldc 30 a', true).type, 'gdrv3'); assert.equal(k('bldc 2 a', true).type, 'bldc');
  const A = HWARCH.blank('X'); A.req = '구동할 DC 모터: 10 A 이하, 단일 H-bridge (4 N-MOSFET)';
  HWARCH.addBlock(A, 'io', 'H-Bridge / Gate Driver IC', { id: 'hb', feats: ['MOSFET Control'], impl: [{ type: 'dcmotor', params: { shunt: 1 } }] });
  const t = HWARCH.toPlan(A); assert.equal(t.plan.blocks[0].type, 'hbridge'); assert.match(t.log.join(), /H-브리지/);
  const E = PRODUCTS.apply(PRODUCTS.detect('EPS'), {}, 'EPS', HWARCH).arch; const te = HWARCH.toPlan(E);
  assert.ok(te.plan.blocks.some(b => b.type === 'gdrv3')); assert.ok(!te.unmapped.includes('3-Phase MOSFET Inverter'), 'inverter realised by the gate block');
  const H = HWARCH.blank('HV'); H.req = '800 V SiC 트랙션 인버터'; HWARCH.addBlock(H, 'io', 'Isolated Gate Drivers', { impl: [{ type: 'bldc', params: {} }] });
  assert.equal(HWARCH.toPlan(H).plan.blocks[0].type, 'bldc', 'no low-voltage stage for HV');
});
