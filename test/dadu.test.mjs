import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, PARTRANK } = load();
test('Dadu profile: 12 V BLDC, 9 V hall supply, PMIC, gate driver + 6 MOSFET, CAN-FD, TC364, PCB NTC — passes the readiness check', () => {
  const prof = PRODUCTS.detect('Dadu ECU 설계');
  assert.equal(prof.key, 'dadu');
  const R = PRODUCTS.apply(prof, { cur: '~40 A (펌프 · 블로어)' }, 'Dadu');
  assert.deepEqual(HWARCH.check(R.arch), []);
  const T = HWARCH.toPlan(R.arch);
  assert.deepEqual(T.unmapped, []);
  const types = T.plan.blocks.map(b => b.type);
  for (const t of ['pwr_in', 'mcu', 'can', 'gdrv3', 'ntc', 'supervisor']) assert.ok(types.includes(t), t);
  assert.ok(T.plan.blocks.some(b => b.type === 'ldo' && +b.params.vout === 9), '9 V rail');
  assert.equal(T.plan.blocks.find(b => b.type === 'mcu').params.part, 'TC364DP-64F300F');
  const B = NEWPROJ.build(T.plan);
  const lm = B.parts.find(p => p.val === 'LM317'); assert.ok(lm && lm.pins[2] === '+9V' && lm.pins[3] === '+12V');
  const r2 = B.parts.find(p => p.pins && p.pins[1] === lm.pins[1] && p.pins[2] === 'GND'); assert.equal(r2.val, '1.5kΩ');  // 1.25·(1+1500/240) = 9.06 V
  const J = B.parts.find(p => p.val === '홀'); assert.equal(J.pins[1], '+9V'); assert.ok(/_IN$/.test(J.pins[2]), 'hall input goes through the series resistor');
  assert.equal(B.parts.filter(p => p.val === 'BAT54S').length, 3);
  assert.ok(B.parts.some(p => /NTC/.test(p.val)));
  const hp = PARTRANK.rank(R.arch.blocks.find(b => b.id === 'hallps'), { req: R.req, vin: 12, asil: 'QM', auto: true, prof, pref: { price: 1, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null });
  assert.equal(hp.rows[0].mpn, 'TPS7B86-Q1');
  assert.ok(hp.rows.filter(r => r.spec.vout === 3.3).every(r => !r.ok), 'fixed 3.3 V LDOs flagged for the 9 V rail');
});
test('Dadu: 2-FET packages (Infineon half-bridge / dual) — pinout from the datasheets, 3 packages for the 6-bridge, clean placement', () => {
  const { PCBEDIT } = load();
  const prof = PRODUCTS.detect('Dadu');
  const opt = k => prof.questions.find(q => q.key === 'fet').options.find(o => o.label.startsWith(k)).label;
  // IAUC60N04S6N050H: 1 G_HS · 2,3 phase · 4 G_LS · 5,6 ground · 7,8 battery · pads 9 battery / 10 phase
  let R = PRODUCTS.apply(prof, { fet: opt('하프브리지'), cur: '~40 A (펌프 · 블로어)' }, 'Dadu');
  let B = NEWPROJ.build(HWARCH.toPlan(R.arch).plan);
  let Q = B.parts.filter(p => p.val === 'IAUC60N04S6N050H');
  assert.equal(Q.length, 3);
  const u = Q.find(q => q.pins[2] === 'PH_U');
  assert.deepEqual(u.pins, { 1: 'PH_U_HG', 2: 'PH_U', 3: 'PH_U', 4: 'PH_U_LG', 5: 'PH_U_SNS', 6: 'PH_U_SNS', 7: '+12V', 8: '+12V', 9: '+12V', 10: 'PH_U' });
  // IPG20N04S4L-07 dual: FET1 (S1=1, G1=2, D1=7,8,9) high side · FET2 (S2=3, G2=4, D2=5,6,10) low side
  R = PRODUCTS.apply(prof, { fet: opt('듀얼'), cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  const T = HWARCH.toPlan(R.arch);
  B = NEWPROJ.build(T.plan);
  Q = B.parts.filter(p => p.val === 'IPG20N04S4L-07');
  assert.equal(Q.length, 3);
  const v = Q.find(q => q.pins[1] === 'PH_V');
  assert.deepEqual(v.pins, { 1: 'PH_V', 2: 'PH_V_HG', 3: 'PH_V_SNS', 4: 'PH_V_LG', 5: 'PH_V', 6: 'PH_V', 7: '+12V', 8: '+12V', 9: '+12V', 10: 'PH_V' });
  const { B: C } = NEWPROJ.toBoard(T.plan, { seed: 1 });
  assert.equal(PCBEDIT.drc(C).filter(d => d.code === 'courtyard' || d.code === 'edge').length, 0);
});
