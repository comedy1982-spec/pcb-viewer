import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, BOARDSNAP, SNAP_DADU8, SNAP_DADU8B, SNAP_DADU8C, PCBEDIT, PCB } = load();
function fresh(m) {
  const prof = PRODUCTS.detect(m.profile);
  const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[m.fet || 0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;plan.rstFix = m.rstFix === true;plan.curModel = m.curModel === 2 ? 2 : 1;plan.connGap = m.connGap === true;if (m.pwrIn) { const pi = plan.blocks.find(b => b.type === 'pwr_in'); if (pi) pi.params = Object.assign({}, pi.params, m.pwrIn); }const g3 = plan.blocks.find(b => b.type === 'gdrv3');if (g3) g3.params = Object.assign({}, g3.params, { driver: m.driver || 'IR2104' });plan.ifaceFix = m.ifaceFix === true;plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };
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
test('Dadu A4911 example: 90 × 60 mm 8 layers, restores with DRC 0, power widths met and nothing left open (supervised route, v1.110.0)', () => {
  const B = fresh(SNAP_DADU8C.meta);const r = BOARDSNAP.apply(B, SNAP_DADU8C);
  assert.deepEqual(r.missing, []);assert.equal(B.W, 90);assert.equal(B.H, 60);
  assert.ok(B.comps.some(c => c.val === 'A4911'));assert.equal(PCBEDIT.drc(B).length, 0);
  assert.deepEqual(PCBEDIT.ratsnest(B).map(x => x.net), []);
  for (const n of B.powerReport.nets) assert.ok(n.width === '직결' || n.width >= n.need, n.net + ' ' + n.width);
});

test('20 A supply input picks the D2PAK-7 reverse FET (five source leads); an older snapshot can pin the DPAK', () => {
  const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');const ans = { cur: '~20 A (팬 · 소형 펌프)' };if (fq) ans.fet = fq.options[0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, 'Dadu').arch).plan;
  const q = NEWPROJ.toBoard(plan, { place: false }).B.comps.find(c => /역전압 보호 P-MOSFET/.test(c.desc || ''));
  assert.equal(q.mpn, 'IPB180P04P4L-02');assert.equal(q.fp, 'TO-263-7');assert.equal(q.pads.filter(p => p.net === '+12V').length, 5);
  plan.blocks.find(b => b.type === 'pwr_in').params.revq = 'dpak';
  const q2 = NEWPROJ.toBoard(plan, { place: false }).B.comps.find(c => /역전압 보호 P-MOSFET/.test(c.desc || ''));assert.equal(q2.fp, 'TO-252');
});

test('every saved example carries the reset fix: the reset IC output and the MCU reset pin share one routed net', () => {
  const L = load();for (const k of ['SNAP_DADU8', 'SNAP_DADU8B', 'SNAP_DADU8C', 'SNAP_DADU8D', 'SNAP_DADU8E', 'SNAP_ELD6']) assert.equal(L[k].meta.rstFix, true, k);
  const B = fresh(L.SNAP_DADU8.meta);L.BOARDSNAP.apply(B, L.SNAP_DADU8);const pads = B.nets.PORST.pads.map(p => B.comps.find(c => c.pads.includes(p)).val);
  assert.ok(pads.some(v => /TPS3823/.test(v)) && pads.some(v => /TC364/.test(v)), pads.join(' '));assert.equal(L.PCBEDIT.ratsnest(B, ['PORST']).length, 0);
});

test('pad-rim vias: the shunt ground returns of the Dadu 8-layer example carry their current (every power terminal rated), DRC clean', () => {
  const L = load();const S = L.SNAP_DADU8;const B = fresh(S.meta);L.BOARDSNAP.apply(B, S);const bad = (B.powerReport.viaChk || []).filter(v => !v.ok);
  assert.equal(bad.length, 0, bad.map(v => v.net + ' ' + v.ref).join(', '));assert.ok(B.powerReport.viaRim > 0);assert.equal(L.PCBEDIT.drc(B).length, 0);
});
