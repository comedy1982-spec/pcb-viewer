import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, PCBEDIT, AUTOPLACE, AUTOROUTE, SAMPLE, SAMPLE_MCU, SAMPLE_TC364 } = load();
const board = (spec) => { const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec)))); PCBEDIT.prepare(B); return B; };
const overlaps = (B) => PCBEDIT.drc(B).filter(d => d.code === 'courtyard' || d.code === 'edge');

test('resizeBoard rebuilds the outline, keeps corner holes at their corners and is reversible', () => {
  const B = board(SAMPLE_MCU), W0 = B.W, H0 = B.H, R0 = PCBEDIT.cornerRadius(B);
  const holes = B.drills.filter(d => !d.plated && !d.own).map(d => [d.x, d.y]);
  const u = B.byRef.U1, ux = u.x, uy = u.y;
  const r = PCBEDIT.resizeBoard(B, W0 + 20, H0 + 10, { anchor: 'center' });
  assert.equal(B.W, W0 + 20); assert.equal(B.H, H0 + 10); assert.ok(PCBEDIT.rectLike(B));
  assert.ok(Math.abs(PCBEDIT.cornerRadius(B) - R0) < 1e-6);
  assert.ok(Math.abs(u.x - (ux + 10)) < 1e-9 && Math.abs(u.y - (uy + 5)) < 1e-9);
  const after = B.drills.filter(d => !d.plated && !d.own);
  // every corner hole keeps its distance to the nearest corner
  after.forEach((d, i) => { const [x0, y0] = holes[i]; const cx0 = x0 < W0 / 2 ? x0 : W0 - x0, cx1 = d.x < B.W / 2 ? d.x : B.W - d.x; assert.ok(Math.abs(cx0 - cx1) < 1e-9); });
  assert.deepEqual([...r.outside], []);
  assert.deepEqual([...PCBEDIT.drc(B).map(d => d.msg)], []);
  PCBEDIT.resizeBoard(B, W0, H0, { anchor: 'center', corner: R0 });
  assert.ok(Math.abs(u.x - ux) < 1e-9 && Math.abs(u.y - uy) < 1e-9);
  // shrinking below the parts reports them
  const s = PCBEDIT.resizeBoard(B, 20, 15);
  assert.ok(s.outside.length > 0);
  assert.throws(() => PCBEDIT.resizeBoard(B, 2, 15));
});

test('classify finds decaps, the MCU, the driver and switching nets', () => {
  const B = board(SAMPLE_TC364), I = AUTOPLACE.classify(B, {});
  assert.equal(I.mcu, 'U1');
  assert.equal(I.byRef.U3.role, 'driver'); assert.ok(I.byRef.U3.noisy);
  assert.ok(I.byRef.C4.decap && !I.byRef.C4.bulk);
  assert.ok(I.byRef.C13.bulk && I.byRef.C13.hs);
  assert.ok(I.byRef.Y1.sens);
  assert.deepEqual([...I.switchNets].sort(), ['PH_U', 'PH_V', 'PH_W']);
  assert.equal(AUTOPLACE.strategy('열'), 'thermal'); assert.equal(AUTOPLACE.strategy('EMC'), 'noise'); assert.equal(AUTOPLACE.strategy('nope'), null);
});

test('reset from the netlist places every part legally and routes the board', () => {
  const B = board(SAMPLE_MCU);
  AUTOPLACE.clearCopper(B);
  assert.equal(B.vias.length, 0);
  assert.ok(['T', 'B'].every(s => !B.layers[s + '.cu'].some(p => p.t === 'seg' || p.t === 'path')));
  const r = AUTOPLACE.place(B, { strategy: 'balanced', scratch: true, seed: 3 });
  assert.equal(r.moved, B.comps.filter(c => c.kind !== 'none' && c.pads.length).length);
  assert.deepEqual([...r.fails], []);
  assert.deepEqual([...overlaps(B).map(d => d.msg)], []);
  const f = AUTOPLACE.fanout(B, {});
  assert.ok(f.vias > 0 && f.fail.length === 0);
  const nets = AUTOROUTE.openNets(B).map(o => o.net);
  const it = AUTOROUTE.jobRR(B, nets, { width: { signal: 0.2, power: 0.3 }, clear: 0.2, reserve: 0.6, neck: 0.25, maxExp: 300000 });
  let q; do { q = it.next(); } while (!q.done);
  PCBEDIT.rebuildNets(B);
  assert.equal(q.value.ok, nets.length);
  assert.deepEqual([...PCBEDIT.drc(B).map(d => d.msg)], []);
  assert.equal(PCBEDIT.ratsnest(B).length, 0);
  // the result still writes a KiCad board
  assert.ok(/\(kicad_pcb/.test(PCBEDIT.toKicadPcb(B, {})));
});

test('strategies move the placement the way they promise', () => {
  const run = (st) => { const B = board(SAMPLE_TC364); AUTOPLACE.clearCopper(B); AUTOPLACE.place(B, { strategy: st, scratch: true, seed: 5 }); return { B, m: AUTOPLACE.metrics(B, {}) }; };
  const th = run('thermal'), cp = run('compact'), nz = run('noise');
  assert.ok(th.m.heatSpread > cp.m.heatSpread, `thermal spread ${th.m.heatSpread} vs compact ${cp.m.heatSpread}`);
  assert.ok(th.m.hotPairs[0].d > cp.m.hotPairs[0].d);
  assert.ok(cp.m.hpwl < th.m.hpwl);
  assert.ok(nz.m.decapAvg < 4, `noise decap ${nz.m.decapAvg}`);
  const nsMin = (m) => Math.min(...m.noiseSens.filter(x => x.b === 'U1').map(x => x.d));
  assert.ok(nsMin(nz.m) > nsMin(cp.m), `noise sep ${nsMin(nz.m)} vs compact ${nsMin(cp.m)}`);
  for (const r of [th, cp, nz]) assert.deepEqual([...overlaps(r.B).map(d => d.msg)], []);
});

test('fixed parts stay put and --only moves just the named parts', () => {
  const B = board(SAMPLE);
  const u = B.byRef.U1, x = u.x, y = u.y, rot = u.rot;
  AUTOPLACE.clearCopper(B);
  AUTOPLACE.place(B, { scratch: true, fixed: ['U1'], seed: 2 });
  assert.equal(u.x, x); assert.equal(u.y, y); assert.equal(u.rot, rot);
  const others = B.comps.filter(c => c.ref !== 'C3').map(c => [c.ref, c.x, c.y]);
  AUTOPLACE.place(B, { only: ['C3'], seed: 2 });
  assert.deepEqual(B.comps.filter(c => c.ref !== 'C3').map(c => [c.ref, c.x, c.y]), others);
});
test('parallel routing pieces: pack/unpack round trip, a strip-confined route stays inside its strip, prepareFast equals prepare', () => {
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_MCU))));
  PCBEDIT.prepare(B); AUTOPLACE.ensurePour(B);
  AUTOPLACE.place(B, { strategy: 'balanced', scratch: true, seed: 3 }); AUTOPLACE.fanout(B, {});
  const nets = AUTOROUTE.openNets(B).map(o => o.net);
  const W = AUTOROUTE.unpack(AUTOROUTE.pack(B));
  assert.equal(W.comps.length, B.comps.length); assert.equal(W.vias.length, B.vias.length);
  assert.deepEqual(AUTOROUTE.openNets(W).map(o => o.net).sort(), nets.slice().sort());
  // the static grid plus the auto copper equals a full prepare
  const o = { width: { signal: 0.2, power: 0.3 }, clear: 0.2, reserve: 0.6, neck: 0.25, maxExp: 300000 };
  const it = AUTOROUTE.jobRR(B, nets.slice(0, 3), o); let q; do { q = it.next(); } while (!q.done);
  const P1 = AUTOROUTE.prepare(B, o), P2 = AUTOROUTE.prepareFast(B, o, {});
  for (let l = 0; l < P1.G.NL; l++) { assert.ok(P1.G.occT[l].every((v, i) => v === P2.G.occT[l][i]), 'occT layer ' + l); assert.ok(P1.G.occV[l].every((v, i) => v === P2.G.occV[l][i]), 'occV layer ' + l); }
  // a route confined to a strip never leaves it
  const rect = [0, 0, B.W / 2 + 4, B.H]; const inside = nets.slice(3).filter(n => B.nets[n].pads.every(p => p.x < rect[2] - 1.5));
  if (inside.length) { const it2 = AUTOROUTE.jobRR(B, inside, Object.assign({}, o, { region: rect })); do { q = it2.next(); } while (!q.done);
    PCB.cuKeys(B).forEach(k => B.layers[k + '.cu'].forEach(p => { if (p.auto && inside.includes(p.net) && p.pts) p.pts.forEach(pt => assert.ok(pt[0] <= rect[2] + 0.01, 'inside the strip')); })); }
});
test('WebAssembly kernels: the A* and paint in kernel.c route the same board to the same result as the JS versions', async () => {
  const mod = await AUTOROUTE.wasmInit();
  assert.ok(mod, 'kernel compiles (' + (AUTOROUTE.WASM.err || '') + ')');
  const run = (wasm) => {
    const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_MCU))));
    PCBEDIT.prepare(B); AUTOPLACE.ensurePour(B); AUTOPLACE.place(B, { strategy: 'balanced', scratch: true, seed: 3 }); AUTOPLACE.fanout(B, {});
    const nets = AUTOROUTE.openNets(B).map(o => o.net);
    const o = { width: { signal: 0.2, power: 0.3 }, clear: 0.2, reserve: 0.6, neck: 0.25, maxExp: 300000, wasm };
    const t = Date.now(); const it = AUTOROUTE.jobRR(B, nets, o); let q; do { q = it.next(); } while (!q.done); PCBEDIT.rebuildNets(B);
    return { ok: q.value.ok, len: +q.value.len.toFixed(1), vias: q.value.vias, rats: PCBEDIT.ratsnest(B).length, drc: PCBEDIT.drc(B).length, w: !!AUTOROUTE.prepare(B, o).G.w, ms: Date.now() - t };
  };
  const js = run(false), wa = run(true);
  assert.equal(js.w, false); assert.equal(wa.w, true, 'wasm grid in use');
  assert.equal(wa.ok, js.ok); assert.equal(wa.rats, js.rats); assert.equal(wa.drc, js.drc);
  assert.ok(Math.abs(wa.len - js.len) < Math.max(2, js.len * 0.02), 'track length ' + js.len + ' vs ' + wa.len);
  assert.ok(Math.abs(wa.vias - js.vias) <= Math.max(2, js.vias * 0.05), 'vias ' + js.vias + ' vs ' + wa.vias);
});
