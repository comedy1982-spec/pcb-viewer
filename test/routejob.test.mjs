import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PCB, PCBEDIT, AUTOROUTE, ROUTEJOB, BOARDSNAP, SAMPLE_MCU } = load();
const ui = { set: () => {}, say: (k, t) => ({ k, t }), tick: () => Promise.resolve(), stopped: () => false };
const fresh = () => { const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_MCU)))); B.pcbPending = true; return B; };
const stat = B => ({ rats: PCBEDIT.ratsnest(B).length, drc: PCBEDIT.drc(B).length, auto: PCB.cuKeys(B).reduce((a, k) => a + B.layers[k + '.cu'].filter(p => p.auto).length, 0), vias: B.vias.length, W: B.W, H: B.H });
test('ROUTEJOB: the place and route pipelines run on a JSON copy of the board (as in the worker) and come back through a snapshot with the same result as running on the board itself', async () => {
  await AUTOROUTE.wasmInit();
  const a = { strategy: 'balanced', seed: 3, scratch: true, par: 0 };
  const B1 = fresh(); await ROUTEJOB.runJob(B1, 'place', a, ui); const t1 = await ROUTEJOB.runJob(B1, 'route', { par: 0 }, ui);
  const B2 = fresh(); const C = ROUTEJOB.boardFromJSON(ROUTEJOB.boardToJSON(B2));
  assert.equal(C.comps.length, B2.comps.length); assert.ok(C.comps[0].pads[0] === C.layers['T.cu'].find(p => p.t === 'pad' && p.ref === C.comps[0].ref), 'pad prims re-linked to the parts');
  await ROUTEJOB.runJob(C, 'place', a, ui); const t2 = await ROUTEJOB.runJob(C, 'route', { par: 0 }, ui);
  const snap = BOARDSNAP.save(C, {}); assert.ok(snap.pours.length >= 1, 'pours travel with the snapshot');
  const r = BOARDSNAP.apply(B2, snap); assert.equal(r.missing.length, 0);
  const s1 = stat(B1), s2 = stat(B2);
  assert.deepEqual(s2, s1);
  assert.equal(t2.split('\n')[0], t1.split('\n')[0]);
  assert.equal(B2.pcbPending, false);
});

test('shape boxes are exact (a thin fill strip no longer claims a square as wide as it is long) and the closed-form gap of two axis-aligned rectangles agrees with the general one', () => {
  const R = (x, y, hw, hh, ang) => ({ k: 'rect', x, y, hw, hh, ang: ang || 0, L: [0] });
  assert.deepEqual([...AUTOROUTE.bboxOf(R(10, 5, 20, 0.05), 0)], [-10, 4.95, 30, 5.05]);
  assert.deepEqual([...AUTOROUTE.bboxOf(R(10, 5, 20, 0.05), 0.2)].map(v => +v.toFixed(3)), [-10.2, 4.75, 30.2, 5.25]);
  const b = AUTOROUTE.bboxOf(R(0, 0, 2, 1, Math.PI / 2), 0);assert.ok(Math.abs(b[2] - 1) < 1e-9 && Math.abs(b[3] - 2) < 1e-9, 'a quarter turn swaps the extents');
  const d = AUTOROUTE.bboxOf(R(0, 0, 2, 1, Math.PI / 4), 0);assert.ok(Math.abs(d[2] - 3 / Math.SQRT2) < 1e-9 && d[2] < Math.hypot(2, 1));
  // the rotated box contains every corner
  let s = 7;const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) { const q = R(rnd() * 10, rnd() * 10, 0.1 + rnd() * 5, 0.05 + rnd() * 2, rnd() * 6.28);const bb = AUTOROUTE.bboxOf(q, 0);const c = Math.cos(q.ang), sn = Math.sin(q.ang);
    [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([u, v]) => { const x = q.x + u * q.hw * c - v * q.hh * sn, y = q.y + u * q.hw * sn + v * q.hh * c;assert.ok(x >= bb[0] - 1e-9 && x <= bb[2] + 1e-9 && y >= bb[1] - 1e-9 && y <= bb[3] + 1e-9); }); }
  // closed form (ang 0) against the separating-axis path (same rectangles turned by a full circle: ang ≠ 0 → general path)
  for (let i = 0; i < 300; i++) { const a = R(rnd() * 6, rnd() * 6, 0.05 + rnd() * 3, 0.05 + rnd() * 1), c = R(rnd() * 6, rnd() * 6, 0.05 + rnd() * 3, 0.05 + rnd() * 1);
    const fast = AUTOROUTE.shapeGap(a, c), gen = AUTOROUTE.shapeGap(Object.assign({}, a, { ang: 2 * Math.PI }), Object.assign({}, c, { ang: 2 * Math.PI }));
    assert.ok(Math.abs(fast - gen) < 1e-6, `gap ${fast} vs ${gen}`); }
  assert.equal(AUTOROUTE.shapeGap(R(0, 0, 1, 1), R(3, 0, 1, 1)), 1);assert.equal(AUTOROUTE.shapeGap(R(0, 0, 1, 1), R(1.5, 0, 1, 1)), -0.5);assert.ok(Math.abs(AUTOROUTE.shapeGap(R(0, 0, 1, 1), R(5, 6, 1, 1)) - 5) < 1e-9);
});
