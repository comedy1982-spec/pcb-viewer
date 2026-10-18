import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HOUSING, TEXT2CAD, SAMPLE_TC364 } = load();
const board = () => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_TC364))));
const fresh = () => ({ inp: { P: 'auto', ip: 'IP54', vib: 2, ta: 25, tmax: 85, tj: 125, mat: 'auto', tim: 'auto' }, cad: null });
const run = (st, text) => { const cmds = TEXT2CAD.parse(text); cmds.forEach(c => TEXT2CAD.exec(st, c, HOUSING)); return cmds; };
const analyze = (st) => HOUSING.analyze(board(), Object.assign({}, st.inp, { P: st.inp.P === 'auto' ? null : st.inp.P, cad: st.cad }));

test('Korean sentences become housing CAD commands', () => {
  const p = TEXT2CAD.parse;
  assert.deepEqual([...p('알루미늄 다이캐스팅으로 IP67, 진동 6G, 발열 18W')], ['set mat adc12', 'set ip IP67', 'set vib 6', 'set power 18']);
  assert.deepEqual([...p('벽 두께 3mm, 모서리 R5')], ['set wall 3', 'set corner 5']);
  assert.deepEqual([...p('오른쪽 벽에 M16 케이블 글랜드 2개')], ['gland E M16 --n 2']);
  assert.deepEqual([...p('뒤쪽에 벤트')], ['vent N']);
  assert.deepEqual([...p('장착 탭 4개 M5')], ['tabs 4 --screw M5']);
  assert.deepEqual([...p('커버에 방열 핀 14개 높이 15')], ['fins 14 --h 15']);
  assert.deepEqual([...p('커버에 "AURIX ECU" 각인')], ['label "AURIX ECU"']);
  assert.deepEqual([...p('앞면에 사각 구멍 20x8')], ['slot S --w 20 --h 8']);
  assert.deepEqual([...p('왼쪽 벽에 지름 8 구멍 높이 10')], ['hole W --d 8 --z 10']);
  assert.deepEqual([...p('갭 필러로 바꾸고 Tj 130')], ['set tj 130', 'set tim gel40']);
  assert.deepEqual([...p('SCAD로 내보내기')], ['export scad']);
  assert.deepEqual([...p('재질 비교해줘')], ['compare']);
});

test('commands edit the model; features land in the geometry, the SCAD and the warnings', () => {
  const st = fresh();
  run(st, '알루미늄 다이캐스팅으로 IP67, 진동 6G, 발열 18W');
  run(st, '벽 두께 3mm, 모서리 R5, 오른쪽 벽에 M16 케이블 글랜드 2개, 장착 탭 4개 M5, 커버에 "AURIX ECU" 각인, 바닥 리브 추가');
  assert.deepEqual([...st.cad.feats.map(f => f.id + ':' + f.type)], ['F1:hole', 'F2:hole', 'F3:tabs', 'F4:label', 'F5:rib']);
  const R = analyze(st), d = R.d, g = d.geo;
  assert.equal(d.mat, 'adc12'); assert.equal(g.t, 3); assert.equal(g.r, 5);
  const gl = d.feats.filter(f => f.type === 'hole');
  assert.ok(gl.every(f => f.side === 'E' && f.w === 16.5 && f.kind === 'gland'));
  assert.ok(Math.abs(gl[1].a - gl[0].a - 29.7) < 1e-6, 'two glands spaced along the wall');
  assert.equal(d.feats.find(f => f.type === 'tabs').tabs.length, 4);
  assert.ok(!R.warn.some(w => /^F[12] /.test(w)), R.warn.join('\n'));
  const s = HOUSING.scad(R, 'x');
  assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  assert.match(s, /rotate\(\[0,90,0\]\) cylinder\(d=16\.5/); assert.match(s, /module tabs\(\)\{translate/); assert.match(s, /text\("AURIX ECU"/); assert.match(s, /r=5;/);
  // an open hole breaks IP67, and a hole on the connector window is flagged
  TEXT2CAD.exec(st, 'hole W --d 10 --u 66 --z 9', HOUSING);
  const w = analyze(st).warn.filter(x => /^F6 /.test(x)).join('\n');
  assert.match(w, /J1 커넥터 창과 겹칩니다/); assert.match(w, /IP67을 지키려면/);
  // a hole across the split line
  TEXT2CAD.exec(st, 'hole S --d 6 --z 1.6', HOUSING);
  assert.ok(analyze(st).warn.some(x => /^F7 .*분할면/.test(x)));
  // delete, overrides back to auto, reset
  TEXT2CAD.exec(st, 'del F6', HOUSING); assert.ok(!st.cad.feats.some(f => f.id === 'F6'));
  TEXT2CAD.exec(st, 'set wall auto', HOUSING); assert.equal(analyze(st).d.geo.t, analyze(st).d.geo.tAuto);
  TEXT2CAD.exec(st, 'reset', HOUSING); assert.equal(st.cad.feats.length, 0);
});

test('fins and bosses from the console change the analysis', () => {
  const st = fresh(); run(st, '알루미늄 다이캐스팅, 발열 18W, IP67');
  const t0 = analyze(st).d.th.Tboard;
  TEXT2CAD.exec(st, 'fins 16 --h 20', HOUSING); const R = analyze(st);
  assert.ok(R.d.fins.user && R.d.fins.n === 16 && R.d.th.Tboard < t0);
  TEXT2CAD.exec(st, 'boss center', HOUSING); assert.ok(analyze(st).d.sup.some(s => s.kind === 'user'));
  assert.throws(() => TEXT2CAD.exec(st, 'set mat unobtanium', HOUSING), /재질/);
  assert.throws(() => TEXT2CAD.exec(st, 'del F99', HOUSING), /F99/);
  assert.equal(TEXT2CAD.exec(st, 'export stl', HOUSING).action, 'export');
});

test('edge treatments: 둥근모따기 (fillet) and 모따기 (chamfer) on the cover top, base bottom and vertical corners', () => {
  const p = TEXT2CAD.parse;
  assert.deepEqual([...p('윗면 모서리 R3 둥근모따기')], ['fillet top 3']);
  assert.deepEqual([...p('둥근모따기 R2 해줘')], ['fillet all 2']);
  assert.deepEqual([...p('바닥은 C1 모따기')], ['chamfer bottom 1']);
  assert.deepEqual([...p('네 모서리 라운드 5')], ['fillet vertical 5']);
  assert.deepEqual([...p('윗면 모서리 둥근모따기 제거')], ['fillet top off']);
  assert.deepEqual([...p('모서리 R5')], ['set corner 5'], 'plain corner R keeps meaning the vertical corners');
  const st = fresh();
  ['fillet top 4', 'chamfer bottom 1.5', 'set corner 8'].forEach(c => TEXT2CAD.exec(st, c, HOUSING));
  let R = analyze(st), g = R.d.geo;
  assert.equal(g.r, 8); assert.equal(g.vk, 'fillet');
  assert.deepEqual([g.eT.k, g.eT.r, g.eB.k, g.eB.r], ['fillet', 4, 'chamfer', 1.5]);
  assert.equal(HOUSING.edgeText(g), '세로 R8 · 윗면 R4 · 바닥 C1.5');
  const s = HOUSING.scad(R, 'x');
  assert.match(s, /module rsolid/); assert.match(s, /\/\/ 모서리: 세로 R8 · 윗면 R4 · 바닥 C1\.5/);
  assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  assert.equal((s.match(/\[/g) || []).length, (s.match(/\]/g) || []).length);
  // a fillet taller than the cover above the split line is limited, and says so
  TEXT2CAD.exec(st, 'fillet top 40', HOUSING); R = analyze(st); g = R.d.geo;
  assert.ok(g.eT.r < 40 && g.eT.r <= g.zLid + g.t - g.zSplit - 1 + 1e-9);
  assert.ok(R.warn.some(w => /커버 윗면 둘레 R40 → R/.test(w)), R.warn.join('\n'));
  // vertical chamfer, then everything off
  TEXT2CAD.exec(st, 'chamfer vertical 2', HOUSING); assert.equal(analyze(st).d.geo.vk, 'chamfer');
  TEXT2CAD.exec(st, 'fillet all off', HOUSING); g = analyze(st).d.geo;
  assert.equal(g.r, 0); assert.equal(g.eT, null); assert.equal(g.eB, null);
  assert.throws(() => TEXT2CAD.exec(st, 'fillet sideways 2', HOUSING), /모르는 모서리/);
});

test('edge layers run from the bottom band to the top band', () => {
  const L = HOUSING.edgeLayers(20, { k: 'chamfer', r: 2 }, { k: 'fillet', r: 3 }, 4);
  assert.deepEqual([...L[0]], [0, 2]); assert.deepEqual([...L[1]], [2, 0]);
  assert.ok(Math.abs(L[L.length - 1][0] - 20) < 1e-9 && Math.abs(L[L.length - 1][1] - 3) < 1e-9);
  for (let i = 1; i < L.length; i++) assert.ok(L[i][0] >= L[i - 1][0]);
});
