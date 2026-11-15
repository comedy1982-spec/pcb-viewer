import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
test('thresholds carry their parts, the requirement boundary and a tolerance verdict (datasheet supervisor figures)', () => {
  const L = load();const { NEWPROJ, PRODUCTS, HWARCH, DIAGTHR } = L;
  const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  const R = PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', fet: fq.options[0].label }, 'Dadu');
  const parts = NEWPROJ.build(HWARCH.toPlan(R.arch).plan).parts;
  const T = DIAGTHR.compute(parts, { I: 10, Ipk: 30, tpk: 2, assume: { vop: [9, 16], vopSrc: '요구사항' } });
  const uv = T.rows.find(r => r.mech === 'sbc_uv');
  assert.ok(uv.refs.some(r => parts.find(c => c.ref === r && /TPS3823/.test(c.val))));
  assert.equal(uv.tone, 'err');assert.ok(uv.lo.m < 0, 'VIT− min 2.84 V is below the MCU minimum 2.97 V');
  const vb = T.rows.find(r => r.mech === 'vbat_rng');assert.equal(vb.refs.length, 2);assert.match(vb.basis, /9–16 V \(요구사항\)/);
  assert.ok(vb.ratings.length && vb.ratings.some(x => x.v != null));
  assert.ok(T.rows.every(r => ['ok', 'warn', 'err', 'na'].includes(r.tone)));
});
