import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HOUSING, SAMPLE, SAMPLE_TC364 } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));

test('a hot, sealed, shaken board gets a metal housing with TIM, O-ring + vent and dense screws', () => {
  const R = HOUSING.analyze(board(SAMPLE_TC364), { P: 18, ip: 'IP67', vib: 6 });
  const d = R.d;
  assert.ok(d.m.metal, d.mat);
  assert.ok(d.feasible);
  assert.ok(d.th.peds.length > 0 && d.th.Ptim > 5, 'heat leaves through TIM pedestals');
  assert.ok(d.seal.breather && /O-링/.test(d.seal.gasket));
  assert.equal(d.screwM, 'M4'); assert.ok(d.pitch <= 50);
  const per = 2 * (d.geo.Lo + d.geo.Wo); assert.ok(per / d.ns <= 50 + 1e-6, 'screw pitch respects IP67');
  assert.equal(d.sup.length, 4); // the board's four mounting holes
  for (const k of ['pcabs', 'pa66gf']) assert.ok(!R.all.find(x => x.mat === k).ok.thermal, k + ' too hot at 18 W');
  assert.ok(!R.all.find(x => x.mat === 'spcc').ok.ip, 'sheet metal does not reach IP67');
  assert.ok(R.idx.thermal >= 25 && R.idx.vib === 100);
  assert.match(R.conds[0], /18 W > 12 W/);
});

test('a small low-power board stays in plastic; connectors at the edge get openings', () => {
  const R = HOUSING.analyze(board(SAMPLE), { ip: 'IP54', vib: 2 });
  assert.equal(R.d.mat, 'pcabs');
  assert.deepEqual([...R.N.cuts.map(c => c.ref + c.side)].sort(), ['J1W', 'J2E']);
  assert.ok(R.d.th.Tboard < 60);
  assert.ok(R.d.geo.Hi > R.N.htTop + R.N.t, 'room for the tallest part');
});

test('vibration adds centre supports until the PCB safety factor reaches 2', () => {
  const B = board(SAMPLE_TC364);
  const calm = HOUSING.analyze(B, { P: 3, vib: 0.5 }), rough = HOUSING.analyze(B, { P: 3, vib: 20, mat: 'adc12' });
  assert.ok(rough.d.vib.sf < calm.d.vib.sf);
  assert.ok(rough.d.vib.sf >= 2 || rough.d.added.length === 3);
  assert.ok(rough.d.geo.t > calm.d.geo.t, 'walls thicken with vibration');
  const v = HOUSING.pcbVibration(rough.N, rough.d.sup.slice(0, 4), 10), v2 = HOUSING.pcbVibration(rough.N, rough.d.sup.slice(0, 4).concat([{ x: 60, y: 46 }]), 10);
  assert.ok(v2.fn > v.fn, 'a centre support raises the first mode');
});

test('IP codes parse and the OpenSCAD model is well formed', () => {
  assert.equal(HOUSING.ipKey('67'), 'IP67'); assert.equal(HOUSING.ipKey('ip69k'), 'IP69K'); assert.equal(HOUSING.ipKey(66), 'IP65');
  const R = HOUSING.analyze(board(SAMPLE_TC364), { P: 18, ip: 67, vib: 6 });
  const s = HOUSING.scad(R, 'x');
  assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  assert.equal((s.match(/\(/g) || []).length, (s.match(/\)/g) || []).length);
  assert.ok(!/\/\/[^\n]*\btranslate\(/.test(s.split('\n').slice(2, -1).join('\n')), 'no code hidden behind a line comment');
  assert.match(s, /module base\(\)/); assert.match(s, /module lid\(\)/); assert.match(s, /cylinder\(d=12/); // breather
});
