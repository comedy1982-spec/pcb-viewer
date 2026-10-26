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
test('thermal inputs: generated parts carry their dissipation onto the board (FET · regulator incl. buck · shunt · IC), half-bridge package ≈ one FET of the leg', () => {
  const { PRODUCTS, HWARCH, NEWPROJ } = load();
  const R = PRODUCTS.apply(PRODUCTS.detect('Dadu'), { cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  const plan = HWARCH.toPlan(R.arch).plan;
  const { B } = NEWPROJ.toBoard(plan, { place: false });
  const P = ref => (B.comps.find(c => c.ref === ref) || {}).P || 0;
  const buck = B.comps.find(c => c.val === 'TPS54331');
  assert.ok(P(buck.ref) > 0, 'buck loss is computed (it was dropped before)');
  assert.ok(B.comps.find(c => /TC364/.test(c.val)).P > 0);
  const hb = B.comps.filter(c => c.fp === 'TDSON-8-2FET');
  if (hb.length) hb.forEach(c => assert.ok(c.P < 2, `${c.ref} ${c.P} W`));
  assert.ok(B.comps.filter(c => c.P > 0).length >= 10);
});
test('thermal solver: inner copper sheets spread heat (lower peak than the outer layers alone)', () => {
  const { SIM } = load();
  const nx = 40, ny = 30, n = nx * ny, a = 2e-3;const mask = new Uint8Array(n).fill(1);const cov = new Float32Array(n).fill(0.3);
  const g = { nx, ny, a, mask, covT: cov, covB: cov, viaG: new Float64Array(n) };
  const env = { t: 1.6, cuT: 70, cuB: 70, kxy: 0.3, kz: 0.3, hT: 9, hB: 9, eps: 0.9, Ta: 25 };
  const Pt = new Float64Array(n);Pt[15 * nx + 20] = 3;const Pb = new Float64Array(n);
  const r0 = SIM.thermalSolve2(g, env, Pt, Pb, []);
  const inner = new Float64Array(n).fill(390 * 35e-6 * 0.9 * 2);
  const r1 = SIM.thermalSolve2(Object.assign({}, g, { inT: inner, inB: inner }), env, Pt, Pb, []);
  assert.ok(r1.tmax < r0.tmax - 5, `${r0.tmax.toFixed(1)} → ${r1.tmax.toFixed(1)}`);
});
test('transient thermal: settles to the steady solution, follows a step, and parts carry their load kind for current profiles', () => {
  const { SIM, PRODUCTS, HWARCH, NEWPROJ } = load();
  const nx = 45, ny = 30, n = nx * ny, a = 2e-3;const mask = new Uint8Array(n).fill(1);const cov = new Float32Array(n).fill(0.5);
  const g = { nx, ny, a, mask, covT: cov, covB: cov, viaG: new Float64Array(n) };
  const env = { t: 1.6, cuT: 70, cuB: 70, kxy: 0.3, kz: 0.3, hT: 9, hB: 9, eps: 0.9, Ta: 25 };
  const Pt = new Float64Array(n);Pt[15 * nx + 22] = 2;
  const st = SIM.thermalSolve2(g, env, Pt, new Float64Array(n), []);
  const times = [];let t = 0, dt = 0.05;while (t < 4000) { t += dt;times.push(t);dt = Math.min(dt * 1.2, 25); }
  let last = 0, at10 = null;SIM.thermalTransient(g, env, [{ Pt, f: () => 1 }], { times, probe: (tt, A) => { last = A.max;if (at10 == null && tt >= 10) at10 = A.max; } });
  assert.ok(Math.abs(last - st.tmax) < 0.2, `${last} vs ${st.tmax}`);
  assert.ok(at10 > 25 && at10 < st.tmax, 'still heating after 10 s');
  let off = 0;SIM.thermalTransient(g, env, [{ Pt, f: tt => tt < 1 ? 1 : 0 }], { times: [0.5, 1, 30, 600], probe: (tt, A) => { off = A.max; } });
  assert.ok(off < 26, 'cools back to ambient once the heat stops');
  const R = PRODUCTS.apply(PRODUCTS.detect('Dadu'), { cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  const { B } = NEWPROJ.toBoard(HWARCH.toPlan(R.arch).plan, { place: false });
  assert.equal(B.lossI0, 20);
  assert.ok(B.comps.some(c => c.lk === 'batt' && /SQD50P04/.test(c.val)), 'reverse FET scales with battery current');
  assert.ok(B.comps.filter(c => c.lk === 'phase').length >= 6, 'bridge FETs and shunts scale with phase current');
});
test('continuous + peak current: requirement words, block params, parts by peak, losses by continuous, widths for the peak', () => {
  const { NEWPROJ, CURRENT, PRODUCTS, HWARCH } = load();
  assert.deepEqual(NEWPROJ.motorCurrents('BLDC 상시 10 A · 피크 40 A 2초'), { i: 10, ipk: 40, tpk: 2 });
  assert.deepEqual(NEWPROJ.motorCurrents('continuous 10 A, peak 40 A for 500 ms'), { i: 10, ipk: 40, tpk: 0.5 });
  // IPC alone at 10 A is 2.36 mm (2 oz · 20 °C); a 40 A · 2 s peak needs more, a 30 s one far more, 40 A continuous the most
  const w2 = CURRENT.needWidth(10, { I: 40, t: 2 }, { oz: 2, dT: 20, dTpk: 40 }), w30 = CURRENT.needWidth(10, { I: 40, t: 30 }, { oz: 2, dT: 20, dTpk: 40 });
  assert.equal(w2.by, 'peak');assert.ok(w2.w > CURRENT.ipcWidth(10, { oz: 2, dT: 20 }) && w2.w < w30.w && w30.w < CURRENT.ipcWidth(40, { oz: 2, dT: 20 }));
  assert.ok(w2.rise + w2.riseP <= 40.01);
  // a via carries little for long: continuous by the IPC chart, a seconds-long peak hardly adds (end-cooled barrel)
  const v = CURRENT.viaRise(0.3, 1.5, { I: 6, t: 2 });assert.ok(v.rise < 20 && v.riseP < 5);
  const prof = PRODUCTS.detect('Dadu');
  const R = PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', pk: '40 A', tpk: '2초 이내 (기동 · 짧은 구속 후 SW 차단)' }, 'Dadu');
  const g = R.arch.blocks.find(b => b.id === 'gate').impl.find(i => i.type === 'gdrv3');
  assert.equal(g.params.i, 10);assert.equal(+g.params.ipk, 40);assert.equal(+g.params.tpk, 2);
  const plan = HWARCH.toPlan(R.arch).plan;const r = NEWPROJ.build(plan);
  const sh = r.parts.find(c => /U상 전류 션트/.test(c.desc));assert.equal(sh.val, '1mΩ', 'shunt range covers the 40 A peak');assert.ok(sh.P <= 0.11, 'shunt loss at 10 A');
  assert.ok(r.parts.find(c => c.val === 'SQD50P04-09L').P < 1.0, 'reverse FET loss at 10 A');
  assert.ok(r.parts.some(c => /TERM-3-7\.62/.test(c.fp)), 'terminals sized for the peak');
  const { B } = NEWPROJ.toBoard(plan, { place: false });
  assert.equal(B.netCurrent.PH_U, 10);assert.deepEqual(B.netPeak.PH_U, { I: 40, t: 2 });assert.equal(B.lossIpk, 40);
  const W = CURRENT.widths(B, { oz: B.oz, dT: B.dT });assert.equal(W.PH_U.by, 'peak');assert.ok(W.PH_U.ipc > 4 && W.PH_U.ipc < 6.14);
});
