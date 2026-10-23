import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PCB, AUTOPLACE, AUTOROUTE, PCBEDIT, SAMPLE_MCU, SAMPLE_BLDC } = load();
const O = { width: { signal: 0.2, power: 0.3 }, clear: 0.2, reserve: 0.6, neck: 0.25, maxExp: 300000, rounds: 4 };
function prep(spec, shrink) {
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
  AUTOPLACE.clearCopper(B); AUTOPLACE.place(B, { strategy: 'compact', scratch: true, seed: 3 });
  if (shrink) AUTOPLACE.minimize(B, { ks: [AUTOPLACE.MIN_KS[0]], max: false, strategy: 'compact', margin: 1, seed: 1 });
  if (AUTOPLACE.ensurePour) AUTOPLACE.ensurePour(B); AUTOPLACE.fanout(B, {});
  return B;
}
function seq(B) { const nets = AUTOROUTE.openNets(B).map(o => o.net); const it = AUTOROUTE.jobRR(B, nets, O); let q; do { q = it.next(); } while (!q.done); PCBEDIT.rebuildNets(B); return nets; }
test('PathFinder: a fully routed board is left alone (no false conflicts, one round)', () => {
  const B = prep(SAMPLE_MCU, false); const nets = seq(B);
  const before = PCB.cuKeys(B).reduce((a, L) => a + B.layers[L + '.cu'].filter(p => p.auto).length, 0);
  const it = AUTOROUTE.jobPF(B, nets, O); let q; do { q = it.next(); } while (!q.done); PCBEDIT.rebuildNets(B);
  assert.equal(q.value.rounds, 1); assert.equal(q.value.dropped, 0); assert.equal(q.value.fail.length, 0);
  assert.equal(PCB.cuKeys(B).reduce((a, L) => a + B.layers[L + '.cu'].filter(p => p.auto).length, 0), before);
  assert.deepEqual([...PCBEDIT.drc(B).map(d => d.msg)], []); assert.equal(PCBEDIT.ratsnest(B).length, 0);
});
test('PathFinder: routes what the sequential router left open on a cramped board, without DRC errors', () => {
  const B = prep(SAMPLE_BLDC, true); const nets = seq(B);
  const open0 = AUTOROUTE.openNets(B).length;
  const it = AUTOROUTE.jobPF(B, nets, O); let q, n = 0; do { q = it.next(); n++; } while (!q.done); PCBEDIT.rebuildNets(B);
  assert.ok(open0 >= 1, 'the cramped board should start with an open net (' + open0 + ')');
  assert.equal(q.value.fail.length, 0); assert.equal(PCBEDIT.ratsnest(B).length, 0);
  assert.deepEqual([...PCBEDIT.drc(B).map(d => d.msg)], []);
  assert.ok(q.value.rounds >= 1 && q.value.rounds <= 14);
});
test('groups(): islands that touch a pour of the net count as connected', () => {
  const B = prep(SAMPLE_MCU, false); seq(B);
  const S = AUTOROUTE.shapesOfBoard(B); const gnd = Object.keys(B.nets).find(n => /^GND$/i.test(n));
  assert.ok(gnd); const g = AUTOROUTE.groups(B, S, gnd); const c = AUTOROUTE.components(S, gnd);
  assert.ok(g.length <= c.length);
});
