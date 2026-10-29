import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, PCBEDIT, SAMPLE, SAMPLE_MCU, SAMPLE_BLDC, SAMPLE_TC364, HOUSING } = load();
const board = (spec) => { const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec)))); PCBEDIT.prepare(B); return B; };
const sig = (B) => B.comps.map(c => c.ref + ':' + c.side + ':' + c.pads.map(p => [p.n, p.x.toFixed(3), p.y.toFixed(3), ((((p.ang || 0) % 360) + 360) % 360).toFixed(1), p.side].join('/')).join(',')).join(';').replace(/-0\.000/g, '0.000');

test('example boards pass DRC and fully routed ones have no ratsnest', () => {
  for (const spec of [SAMPLE, SAMPLE_MCU, SAMPLE_BLDC, SAMPLE_TC364]) {
    const B = board(spec);
    assert.deepEqual([...PCBEDIT.drc(B).map(d => d.msg)], [], B.name);
  }
  assert.equal(PCBEDIT.ratsnest(board(SAMPLE_MCU)).length, 0);
  assert.ok(PCBEDIT.ratsnest(board(SAMPLE_TC364)).length > 20); // MCU pins still unassigned / unrouted
});

test('move, rotate and flip carry pads, drills and silkscreen and are reversible', () => {
  const B = board(SAMPLE_MCU), s0 = sig(B), c = B.byRef.J1;
  const silk = B.layers['T.silk'].filter(p => p.own === c);
  const dr = B.drills.filter(d => d.own === c);
  assert.ok(silk.length > 0 && dr.length === 2);
  PCBEDIT.move(B, c, 3.5, -2);
  assert.ok(dr.every(d => d._pad && Math.abs(d.x - d._pad.x) < 1e-9 && Math.abs(d.y - d._pad.y) < 1e-9 && c.pads.includes(d._pad)));
  PCBEDIT.move(B, c, -3.5, 2); assert.equal(sig(B), s0);
  for (let i = 0; i < 4; i++) PCBEDIT.rotate(B, c, 90); assert.equal(sig(B), s0);
  const u = B.byRef.U1, nT = B.layers['T.cu'].length;
  PCBEDIT.flip(B, u);
  assert.equal(u.side, 'B'); assert.ok(u.pads.every(p => p.side === 'B'));
  assert.ok(B.layers['B.silk'].some(p => p.own === u) && !B.layers['T.silk'].some(p => p.own === u));
  PCBEDIT.flip(B, u); assert.equal(sig(B), s0); assert.equal(B.layers['T.cu'].length, nT);
  // grid snapping of the anchor
  const [dx, dy] = PCBEDIT.snapDelta(c, 0.37, 0.12, 0.5);
  assert.ok(Math.abs(((c.x + dx) / 0.5) - Math.round((c.x + dx) / 0.5)) < 1e-9 && Math.abs(((c.y + dy) / 0.5) - Math.round((c.y + dy) / 0.5)) < 1e-9);
});

test('moving a part shows a ratsnest and DRC; a track closes the ratsnest', () => {
  const B = board(SAMPLE_MCU), c = B.byRef.R4;
  PCBEDIT.move(B, c, 0, -6);
  const rn = PCBEDIT.ratsnest(B);
  assert.ok(rn.length >= 1 && rn.every(r => c.pads.some(p => p.net === r.net)));
  // route the first ratsnest line straight (posture keeps 0/45/90 degrees)
  const r = rn[0], path = PCBEDIT.posture(r.a, r.b, false);
  for (let i = 1; i < path.length; i++) { const dx = Math.abs(path[i][0] - path[i - 1][0]), dy = Math.abs(path[i][1] - path[i - 1][1]); assert.ok(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9); }
  const side = B.byRef.R4.side;
  const t = PCBEDIT.addTrack(B, side, r.net, 0.25, path); PCBEDIT.rebuildNets(B);
  assert.ok(B.nets[r.net].tracks.includes(t));
  assert.ok(PCBEDIT.ratsnest(B).length < rn.length);
  PCBEDIT.removePrim(B, t); PCBEDIT.rebuildNets(B);
  assert.equal(PCBEDIT.ratsnest(B).length, rn.length);
  // overlapping parts are reported
  PCBEDIT.move(B, B.byRef.R1, B.byRef.R4.x - B.byRef.R1.x, B.byRef.R4.y - B.byRef.R1.y);
  assert.ok(PCBEDIT.drc(B).some(d => d.code === 'courtyard' || d.code === 'short'));
});

test('.kicad_pcb export reloads with the same pads, nets, tracks and vias', () => {
  for (const spec of [SAMPLE_MCU, SAMPLE_TC364]) {
    const B = board(spec);
    PCBEDIT.rotate(B, B.byRef.U2, 90); PCBEDIT.flip(B, B.byRef.R5 || B.byRef.C1);
    const txt = PCBEDIT.toKicadPcb(B, { title: B.name });
    assert.match(txt, /^\(kicad_pcb \(version 20221018\)/);
    const R = PCB.finalize(PCB.parseKicad(txt));
    const all = []; B.comps.forEach(c => c.pads.forEach(p => all.push({ ref: c.ref, p })));
    let n = 0; R.comps.filter(c => !/^H\d+$/.test(c.ref)).forEach(c => c.pads.forEach(p => { n++;
      const m = all.find(o => o.ref === c.ref && String(o.p.n) === String(p.n) && Math.hypot(o.p.x - p.x, o.p.y - p.y) < 0.005);
      assert.ok(m, `${c.ref}.${p.n}`); assert.equal(p.net || null, m.p.net || null); }));
    assert.equal(n, all.length);
    const segs = X => ['T', 'B'].map(s => X.layers[s + '.cu'].filter(p => p.t === 'seg' || p.t === 'path').reduce((a, p) => a + (p.t === 'seg' ? 1 : p.pts.length - 1), 0));
    assert.deepEqual([...segs(R)], [...segs(B)]); assert.equal(R.vias.length, B.vias.length);
    assert.equal(R.comps.find(c => c.ref === (B.byRef.R5 ? 'R5' : 'C1')).side, 'B');
  }
});

test('board shapes and cutouts', () => {
  const bd = board(SAMPLE); PCBEDIT.resizeBoard(bd, 100, 60, {});
  for (const k of Object.keys(PCBEDIT.SHAPES)) {
    const r = PCBEDIT.setShape(bd, k, { w: 80, h: 50, d: 60, cw: 30, ch: 20, at: 'tr', r: 3, pts: [[0, 0], [40, 0], [40, 20], [20, 30], [0, 20]] });
    assert.ok(r.W >= 5 && r.H >= 5 && bd.outline[0].length >= 3 && Array.isArray(r.outside), k);
    assert.equal(bd.shape.kind, k);
  }
  PCBEDIT.setShape(bd, 'L', { w: 90, h: 60, cw: 35, ch: 25, at: 'tr' });
  assert.ok(!PCB.inBoard(80, 50, bd.outline) && PCB.inBoard(20, 20, bd.outline), 'L cut corner is off-board');
  const c = PCBEDIT.addCutout(bd, 'circle', { x: 20, y: 40, d: 8 }); assert.equal(c.n, 1);
  assert.ok(!PCB.inBoard(20, 40, bd.outline) && PCB.inBoard(30, 40, bd.outline), 'cutout is off-board');
  assert.throws(() => PCBEDIT.addCutout(bd, 'rect', { x: 88, y: 58, w: 20, h: 10 }), /보드 밖/);
  PCBEDIT.resizeBoard(bd, 180, 120, {}); assert.equal(bd.shape.kind, 'L'); assert.equal(bd.outline.length, 2); assert.ok(Math.abs(bd.shape.cw - 70) < 1e-6);
  assert.match(PCBEDIT.shapeText(bd), /L자형.*컷아웃 1개/);
  assert.equal(PCBEDIT.clearCutouts(bd), 1);
  PCBEDIT.setShape(bd, 'circle', { d: 70 }); PCBEDIT.resizeBoard(bd, 50, 50, {}); assert.ok(Math.abs(bd.W - 50) < 1e-6 && bd.shape.kind === 'circle');
  assert.throws(() => PCBEDIT.setShape(bd, 'star', {}), /모양/);
});

test('housing follows a shaped board outline', () => {
  const bd = board(SAMPLE);
  PCBEDIT.setShape(bd, 'circle', { d: 70 });
  const R = HOUSING.analyze(bd, { P: 'auto', ip: 'IP54', vib: 2, ta: 25, tmax: 85, tj: 125, mat: 'auto' });
  const g = R.d.geo; assert.equal(g.shape, 'circle'); assert.ok(g.ringO && g.ringI && g.ringO.length > 20);
  assert.ok(Math.abs(g.Lo - (70 + 2 * (g.gap + g.rim))) < 0.2, 'outer size = board + gap + rim');
  assert.ok(R.d.screws.every(s => PCB.inRing(s.x, s.y, g.ringO)), 'screw bosses inside the outer outline');
  assert.ok(R.d.sup.every(s => PCB.inRing(s.x, s.y, bd.outline[0])), 'supports inside the board');
  assert.match(HOUSING.text(R), /원형/); assert.match(HOUSING.scad(R, 't'), /outerPts/); assert.match(HOUSING.drawingSVG(R, 't'), /<path d="M[^"]{300,}/);
  const o = HOUSING.offsetRing([[0, 0], [10, 0], [10, 10], [0, 10]], 1); assert.equal(o.length, 4); assert.ok(o.every(p => p[0] === -1 || p[0] === 11));
  const h = HOUSING.ringHit(g.ringO, [35, 35], [1, 0]); assert.ok(h && Math.abs(h.nx - 1) < 0.05 && Math.abs(h.x - (35 + g.Lo / 2)) < 0.5);
});

test('setOutlineRing: drawn outline moves the origin and keeps parts in place', () => {
  const bd = board(SAMPLE); PCBEDIT.resizeBoard(bd, 100, 60, {});
  const c = bd.comps.find(x => x.kind !== 'none'); const px = c.x, py = c.y;
  const r = PCBEDIT.setOutlineRing(bd, [[10, 5], [90, 5], [90, 55], [50, 75], [10, 55]], { kind: 'poly' });
  assert.equal(r.dx, -10); assert.equal(r.dy, -5); assert.ok(Math.abs(bd.W - 80) < 1e-9 && Math.abs(bd.H - 70) < 1e-9);
  assert.ok(Math.abs(c.x - (px - 10)) < 1e-9 && Math.abs(c.y - (py - 5)) < 1e-9, 'parts shifted with the origin');
  assert.equal(bd.outline[0].length, 5); assert.equal(bd.shape.kind, 'poly');
  assert.throws(() => PCBEDIT.setOutlineRing(bd, [[0, 0], [2, 0], [2, 2]], {}), /보드 크기/);
});

test('resize with anchor center moves copies of tracks and vias, so an undo snapshot taken before still holds the old geometry', () => {
  const bd = board(SAMPLE);
  const segs0 = bd.layers['T.cu'].filter(p => p.t === 'seg'), vias0 = bd.vias.slice();
  assert.ok(segs0.length && vias0.length);
  const before = segs0.map(p => [p.a[0], p.a[1], p.b[0], p.b[1]].join()), vb = vias0.map(v => v.x + ',' + v.y);
  PCBEDIT.resizeBoard(bd, bd.W + 20, bd.H + 10, { anchor: 'center' });
  assert.deepEqual(segs0.map(p => [p.a[0], p.a[1], p.b[0], p.b[1]].join()), before, 'old track objects untouched');
  assert.deepEqual(vias0.map(v => v.x + ',' + v.y), vb, 'old via objects untouched');
  const moved = bd.layers['T.cu'].filter(p => p.t === 'seg');
  assert.ok(Math.abs(moved[0].a[0] - segs0[0].a[0] - 10) < 1e-9 && Math.abs(moved[0].a[1] - segs0[0].a[1] - 5) < 1e-9, 'board copper moved with the parts');
});
