import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HOUSING, AUTOPLACE, SAMPLE, SAMPLE_TC364 } = load();
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

test('AURIX ECU connector (JAE MX23A12NF1) passes through a sealed window in the cover', () => {
  const B = board(SAMPLE_TC364), J = B.byRef.J1;
  assert.equal(J.fp, 'MX23A-12-RA'); assert.equal(J.pads.filter(p => /^\d+$/.test(p.n)).length, 12);
  assert.deepEqual([...['PH_U', 'PH_V', 'PH_W', 'CANH', 'CANL', '+12V', 'HALL_A'].map(n => J.pads.some(p => p.net === n))], Array(7).fill(true));
  const R = HOUSING.analyze(B, { P: 18, ip: 'IP67', vib: 6 }), c = R.N.cuts.find(k => k.ref === 'J1'), g = R.d.geo;
  assert.ok(c.sealed); assert.equal(c.side, 'W'); assert.equal(c.mate, 'MX23A12SF1');
  assert.ok(Math.abs(c.b - c.a - 27.1) < 0.01 && Math.abs(c.z1 - c.z0 - 13.1) < 0.01, 'window = shroud + 0.3 mm');
  assert.ok(Math.abs(g.gaps.W - 1.0) < 1e-6 && g.gaps.E === 1.5, 'the left wall sits on the flange plane');
  assert.ok(Math.abs(g.x0 + g.rim - c.plane) < 1e-6);
  assert.ok(g.zSplit <= c.z0 - 1.8 + 1e-9, 'split line below the window');
  assert.ok(c.shroudLen - g.rim >= 2 && c.land >= 1.5);
  assert.ok(!R.warn.some(w => /J1/.test(w)), R.warn.join('\n'));
  assert.match(HOUSING.scad(R, 'x'), /J1 MX23A12NF1 창/);
});

test('heat goes down through thermal vias where a part has an exposed pad, TIM chosen for the junction limit', () => {
  const B = board(SAMPLE_TC364);
  const R = HOUSING.analyze(B, { P: 18, ip: 'IP67', vib: 6 }), th = R.d.th;
  const u3 = th.peds.find(p => p.ref === 'U3');
  assert.equal(u3.kind, 'bottom'); assert.ok(u3.vias >= 20 && u3.ped.z1 < -0.8 && u3.ped.z0 === R.d.geo.zFloor);
  assert.ok(th.peds.every(p => p.blt >= 0.25 && HOUSING.TIMS[p.tim]) && th.parts.some(p => p.ref === 'U1'));
  // parts that stay cool through the board alone get no pedestal (U4 transceiver)
  assert.ok(!th.peds.some(p => p.ref === 'U4') && th.parts.find(p => p.ref === 'U4').path === null);
  assert.ok(th.parts.every(p => p.Tj <= 125), th.parts.map(p => p.ref + ' ' + p.Tj.toFixed(0)).join());
  // the LDO tabs are not ground: the TIM must insulate
  assert.ok(R.warn.some(w => /U2: 방열 패드 넷이 \+5V/.test(w)));
  // a better TIM runs cooler; no TIM runs hotter; plastic has no path at all
  const tj = (o) => HOUSING.analyze(board(SAMPLE_TC364), Object.assign({ P: 18, ip: 'IP67', vib: 6, mat: 'adc12' }, o)).d.th.parts.find(p => p.ref === 'U2').Tj;
  assert.ok(tj({ tim: 'pad60' }) < tj({ tim: 'pad15' }) && tj({ tim: 'pad15' }) < tj({ tim: 'none' }));
  const pl = HOUSING.analyze(B, { P: 18, ip: 'IP67', vib: 6, mat: 'pcabs' }).d;
  assert.equal(pl.th.peds.length, 0); assert.ok(pl.th.hotJ.length > 0 && /Tj > 125/.test(pl.why.join()));
  assert.match(HOUSING.scad(R, 'x'), /module base_pedestals\(\)\{translate/);
});

test('auto placement keeps the sealed header reaching over the board edge', () => {
  const B = board(SAMPLE_TC364); AUTOPLACE.clearCopper(B); AUTOPLACE.place(B, { strategy: 'balanced', scratch: true, seed: 5 });
  const J = B.byRef.J1, b = J.bb;
  const over = Math.max(-b[0], -b[1], b[2] - B.W, b[3] - B.H);
  assert.ok(over > 9 && over < 12, 'shroud stays outside the board: ' + over.toFixed(2));
  const c = HOUSING.boardNeeds(B).cuts.find(k => k.ref === 'J1');
  assert.ok(c.sealed && c.gap > 0.5 && c.gap < 1.5, JSON.stringify(c)); // flange just beyond the edge (0.25 mm placement grid)
});
