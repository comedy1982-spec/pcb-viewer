import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const plan = (L, drv) => { const { PRODUCTS, HWARCH } = L;const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  const P = HWARCH.toPlan(PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', fet: fq.options[0].label }, 'Dadu').arch).plan;
  P.blocks.find(b => b.type === 'gdrv3').params.driver = drv;return P; };

test('capacitor part numbers decode to size, dielectric, rating and capacitance', () => {
  const { CAPCHECK } = load();const d = (m) => CAPCHECK.decode(m);
  assert.deepEqual([d('CL10B104KB8NNNC').size, d('CL10B104KB8NNNC').diel, d('CL10B104KB8NNNC').vr], ['0603', 'X7R', 50]);
  assert.ok(Math.abs(d('CL10B104KB8NNNC').c - 100e-9) < 1e-12);
  assert.deepEqual([d('GRM32ER61E226KE15').size, d('GRM32ER61E226KE15').diel, d('GRM32ER61E226KE15').vr], ['1210', 'X5R', 25]);
  assert.deepEqual([d('GCM188R71C474KA55D').size, d('GCM188R71C474KA55D').diel, d('GCM188R71C474KA55D').vr], ['0603', 'X7R', 16]);
  assert.deepEqual([d('CGA6P3X7S1H106K250AB').size, d('CGA6P3X7S1H106K250AB').diel, d('CGA6P3X7S1H106K250AB').vr], ['1210', 'X7S', 50]);
  assert.deepEqual([d('EEE-FK1E471P').diel, d('EEE-FK1E471P').vr], ['ALU', 25]);assert.ok(Math.abs(d('EEE-FK1E471P').c - 470e-6) < 1e-9);
  assert.equal(d('CL10C470JB8NNNC').diel, 'C0G');assert.equal(d('XYZ123'), null);
  // DC bias: class II loses capacitance with voltage (more for a dense part), class I does not
  const dense = d('GRM32ER61E226KE15'), thin = d('CL10B104KB8NNNC');
  assert.ok(CAPCHECK.dcBias(dense, 16) < CAPCHECK.dcBias(dense, 5));assert.ok(CAPCHECK.dcBias(dense, 16) < CAPCHECK.dcBias(thin, 16));
  assert.equal(CAPCHECK.dcBias(d('CL10C470JB8NNNC'), 16), 1);
});

test('capacitor check: battery-side derating, gate-drive node voltage, part number vs footprint; the generator swaps in passing parts', () => {
  const L = load();const { NEWPROJ } = L;const P = plan(L, 'DRV8334');
  const r0 = NEWPROJ.build(P);const C0 = r0.caps;assert.ok(C0 && C0.rows.length > 40);
  const has = (C, ref, code) => C.findings.some(f => f.ref === ref && f.code === code);
  const ref = (r, desc, net) => r.parts.find(c => /^C/.test(c.ref) && (c.desc || '').includes(desc) && Object.values(c.pins).includes(net)).ref;
  // 22 µF 25 V on the battery rail: 16 V is 64 % of the rating; DRV8334 GVDD 10 µF 25 V at the 18 V limit; CPVDD 0805 part on a 1206 footprint
  const buckIn = ref(r0, '벅 입력 커패시터', '+12V'), gvdd = ref(r0, 'CGVDD', 'PH_GVDD'), cpvdd = ref(r0, 'CPVDD', '+12V');
  assert.ok(has(C0, buckIn, 'derate'));assert.ok(has(C0, gvdd, 'derate'));assert.ok(has(C0, cpvdd, 'pkg'));
  assert.equal(C0.rows.find(x => x.ref === gvdd).vop, 18);
  // jump start 24 V against the 25 V input electrolytic: no margin
  assert.ok(C0.findings.some(f => f.code === 'margin' && /EEE-FK1E471P/.test(f.msg)));
  P.ifaceFix = true;const r1 = NEWPROJ.build(P);const C1 = r1.caps;
  assert.equal(C1.err, 0);assert.ok(!C1.findings.some(f => /over|derate|margin|pkg|value/.test(f.code)), C1.findings.map(f => f.msg).join('\n'));
  // the 22 µF became two 10 µF 50 V in parallel on the same nets
  const tw = r1.parts.filter(c => c.mpn === 'CGA6P3X7S1H106K250AB' && (c.desc || '').includes('벅 입력'));
  assert.equal(tw.length, 2);tw.forEach(c => assert.deepEqual(Object.values(c.pins).sort(), ['+12V', 'GND']));
  assert.ok(C1.fixed.length >= 10);
  // a saved board replays without the swaps
  delete P.ifaceFix;assert.equal(NEWPROJ.build(P).parts.length, r0.parts.length);
});

test('guideline rule sch_cap scores the capacitor check on a board', () => {
  const L = load();const { NEWPROJ, GUIDE, SCH } = L;const ev = (B) => GUIDE.evaluate(B, { scope: 'sch', sheets: SCH.build(B, null).sheets }).rules.find(x => x.key === 'sch_cap');const P = plan(L, 'A4911');
  const B0 = NEWPROJ.toBoard(P, { place: false }).B;const g0 = ev(B0);
  assert.ok(g0 && (g0.status === 'partial' || g0.status === 'fail'), JSON.stringify(g0));
  P.ifaceFix = true;const B1 = NEWPROJ.toBoard(P, { place: false }).B;const g1 = ev(B1);
  assert.ok(g1.score > g0.score, `${g0.score} → ${g1.score}`);
});
