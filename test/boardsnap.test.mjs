import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, BOARDSNAP, SNAP_DADU8, PCBEDIT, PCB } = load();
function fresh(m) {
  const prof = PRODUCTS.detect(m.profile);
  const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[m.fet || 0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };
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
