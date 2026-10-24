import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PCB, PCBEDIT, AUTOROUTE, CURRENT } = load();
// two 3 × 3 mm pads of net P joined by a thin 0.3 mm track, a foreign pad N nearby: the fill widens P, keeps clearance to N
function board() {
  const B = PCB.finalize(PCB.fromSpec({ board: { name: 't', width: 30, height: 20, thickness: 1.6, corner: 0 }, components: [
    { ref: 'Q1', value: 'X', footprint: 'SOT-223', x: 6, y: 10, rotation: 0, pins: { 1: 'G', 2: 'P', 3: 'S', 4: 'P' } },
    { ref: 'J1', value: 'T', footprint: 'SOT-223', x: 24, y: 10, rotation: 0, pins: { 1: 'N', 2: 'P', 3: 'M', 4: 'P' } }] }));
  return B;
}
test('powerFill: copper grows around a high-current net, clearance kept, effective width rises above the thin track', () => {
  const B = board();
  const a = B.byRef.Q1.pads.find(p => p.n === '4'), b = B.byRef.J1.pads.find(p => p.n === '4');
  B.layers['T.cu'].push({ t: 'seg', a: [a.x, a.y], b: [b.x, b.y], w: 0.3, net: 'P', auto: true });
  PCBEDIT.rebuildNets(B);
  const before = AUTOROUTE.bottleneck(B, 'P', {});
  assert.ok(before.width != null && before.width <= 0.4, 'thin track ≈ 0.3 mm: ' + before.width);
  const f = AUTOROUTE.powerFill(B, { nets: ['P'], rect: [0, 0, 30, 20], clr: 0.25 });
  assert.ok(f.cells > 1000 && f.segs > 0);
  const after = AUTOROUTE.bottleneck(B, 'P', {});
  assert.ok(after.width > 5, 'filled copper is wide: ' + after.width);
  assert.equal(PCBEDIT.drc(B).length, 0, JSON.stringify(PCBEDIT.drc(B).slice(0, 3).map(d => d.msg)));
  // re-running replaces the old fill (no duplicates)
  const n1 = B.layers['T.cu'].filter(p => p.fill).length;
  AUTOROUTE.powerFill(B, { nets: ['P'], rect: [0, 0, 30, 20], clr: 0.25 });
  assert.equal(B.layers['T.cu'].filter(p => p.fill).length, n1);
});
test('current estimate: ground returns the motor current; recorded stage currents are a floor', () => {
  const B = board(); B.netCurrent = { P: 20, S: 20 };
  const W = CURRENT.widths(B, { oz: 2, dT: 20 });
  assert.equal(W.P.I, 20); assert.equal(W.S.cls, 'phase');
});
