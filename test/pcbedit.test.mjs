import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, PCBEDIT, SAMPLE, SAMPLE_MCU, SAMPLE_BLDC, SAMPLE_TC364 } = load();
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
