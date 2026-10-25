import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, BOARDSNAP, SNAP_DADU8, SNAP_DADU8B, SNAP_DADU8C, PCBEDIT, PCB } = load();
function fresh(m) {
  const prof = PRODUCTS.detect(m.profile);
  const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[m.fet || 0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;const g3 = plan.blocks.find(b => b.type === 'gdrv3');if (g3) g3.params = Object.assign({}, g3.params, { driver: m.driver || 'IR2104' });plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };
  return NEWPROJ.toBoard(plan, { place: false }).B;
}
test('Dadu 8-layer example: the stored layout restores onto the generated board — every part found, nothing open, DRC clean, 20 A widths met', () => {
  const B = fresh(SNAP_DADU8.meta);
  const r = BOARDSNAP.apply(B, SNAP_DADU8);
  assert.deepEqual(r.missing, []);
  assert.equal(PCB.cuKeys(B).length, 8);
  assert.equal(PCBEDIT.ratsnest(B).length, 0);
  assert.equal(PCBEDIT.drc(B).length, 0);
  for (const n of B.powerReport.nets) assert.ok(n.width === '직결' || n.width >= n.need, n.net + ' ' + n.width);
});
test('board snapshot round trip: save → apply gives the same pads, copper and vias', () => {
  const B = fresh(SNAP_DADU8.meta);BOARDSNAP.apply(B, SNAP_DADU8);
  const S2 = BOARDSNAP.save(B, SNAP_DADU8.meta);
  for (const k of ['place', 'seg', 'path', 'fill', 'via']) assert.equal(S2[k].length, SNAP_DADU8[k].length, k);
  const B2 = fresh(SNAP_DADU8.meta);BOARDSNAP.apply(B2, JSON.parse(JSON.stringify(S2)));
  let d = 0;B.comps.forEach(c => { const c2 = B2.comps.find(x => x.ref === c.ref);c.pads.forEach((p, i) => { d = Math.max(d, Math.hypot(p.x - c2.pads[i].x, p.y - c2.pads[i].y)); }); });
  assert.ok(d < 0.002, 'pad drift ' + d);
});
test('Dadu double-sided example: 85 × 55 mm, parts on the bottom, restores clean (no opens, DRC 0, 20 A widths met)', () => {
  const B = fresh(SNAP_DADU8B.meta);
  const r = BOARDSNAP.apply(B, SNAP_DADU8B);
  assert.deepEqual(r.missing, []);
  assert.equal(B.W, 85);assert.equal(B.H, 55);
  assert.ok(B.comps.filter(c => c.side === 'B').length >= 30);
  assert.equal(PCBEDIT.ratsnest(B).length, 0);
  assert.equal(PCBEDIT.drc(B).length, 0);
  for (const n of B.powerReport.nets) assert.ok(n.width === '직결' || n.width >= n.need, n.net + ' ' + n.width);
});
test('Dadu A4911 example: 90 × 60 mm 8 layers, restores with DRC 0, power widths met and only the one documented PWM connection open', () => {
  const B = fresh(SNAP_DADU8C.meta);const r = BOARDSNAP.apply(B, SNAP_DADU8C);
  assert.deepEqual(r.missing, []);assert.equal(B.W, 90);assert.equal(B.H, 60);
  assert.ok(B.comps.some(c => c.val === 'A4911'));assert.equal(PCBEDIT.drc(B).length, 0);
  assert.deepEqual(PCBEDIT.ratsnest(B).map(x => x.net), ['PH_INL_U']);
  for (const n of B.powerReport.nets) assert.ok(n.width === '직결' || n.width >= n.need, n.net + ' ' + n.width);
});
