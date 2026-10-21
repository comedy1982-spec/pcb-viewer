import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, GUIDE, SCH, AUTOPLACE, AUTOROUTE, PCBEDIT, SAMPLE_MCU, SAMPLE_TC364 } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));

test('guideline check scores weighted rules with P0–P3 priority and a verdict', () => {
  const B = board(SAMPLE_TC364);
  const r = GUIDE.evaluate(B, { scope: 'pcb' });
  assert.equal(r.rules.length, 17);
  assert.ok(r.rules.every((x, i) => i === 0 || r.rules[i - 1].w >= x.w), 'sorted by weight');
  assert.equal(r.rules.find(x => x.key === 'ds_kelvin').status, 'na');
  assert.equal(r.rules.find(x => x.key === 'pl_esd_tvs').status, 'fail'); // CAN / Hall connector signals have no TVS
  assert.equal(r.rules.find(x => x.key === 'rt_diff_pair').status, 'pass'); // CANH/CANL matched
  assert.ok(r.pct > 0 && r.pct < 100);
  assert.equal(GUIDE.prio(9).label, 'P0 (최우선)'); assert.equal(GUIDE.prio(8).tier, 1); assert.equal(GUIDE.prio(6).tier, 2); assert.equal(GUIDE.prio(5).tier, 3);
});

test('circuit rules read the schematic netlist', () => {
  const B = board(SAMPLE_TC364); const sheets = SCH.build(B, null).sheets;
  const r = GUIDE.evaluate(B, { scope: 'sch', sheets });
  const by = Object.fromEntries(r.rules.map(x => [x.key, x]));
  assert.equal(by.sch_xtal.status, 'fail'); // Y1 has no load caps in the example
  assert.equal(by.sch_reset.status, 'pass'); // PORST pull-up R8
  assert.equal(by.sch_erc.status, 'pass');
  assert.equal(by.sch_bulk.status, 'pass');
  assert.match(by.sch_decap.fix, /add C 100nF --pins/);
});

test('presets, weights and manual decisions change the score', () => {
  const B = board(SAMPLE_MCU);
  const r0 = GUIDE.evaluate(B, { scope: 'pcb' });
  assert.equal(r0.rules.find(x => x.key === 'ds_kelvin').status, 'manual'); // R5 0.1 Ω two-terminal shunt
  GUIDE.set(B, 'ds_kelvin', 'pass', 'sense traces from pad inner edges', 'ai');
  const r1 = GUIDE.evaluate(B, { scope: 'pcb' });
  const k = r1.rules.find(x => x.key === 'ds_kelvin');
  assert.equal(k.status, 'pass'); assert.equal(k.by, 'ai'); assert.equal(k.auto.status, 'manual');
  assert.ok(r1.pct > r0.pct);
  GUIDE.set(B, 'ds_kelvin', 'auto'); assert.equal(GUIDE.evaluate(B, { scope: 'pcb' }).rules.find(x => x.key === 'ds_kelvin').status, 'manual');
  assert.equal(GUIDE.setPreset(B, '모터'), 'motor'); assert.equal(GUIDE.state(B).w.pw_via_amp, 10);
  assert.equal(GUIDE.setWeight(B, 'rt_45deg', 42), 10);
  assert.throws(() => GUIDE.set(B, 'nope', 'pass'));
});

test('noise placement + routing improves the decoupling rule over the example layout', () => {
  const B = board(SAMPLE_MCU); PCBEDIT.prepare(B);
  const before = GUIDE.evaluate(B, { scope: 'pcb' }).rules.find(x => x.key === 'pl_decoupling').score;
  AUTOPLACE.clearCopper(B); AUTOPLACE.place(B, { strategy: 'noise', scratch: true, seed: 3 });
  const after = GUIDE.evaluate(B, { scope: 'pcb' }).rules.find(x => x.key === 'pl_decoupling').score;
  assert.ok(after > before, `${after} > ${before}`);
});
