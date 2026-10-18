import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, REVLOG, SAMPLE_TC364, PCBEDIT, HWARCH, HOUSING, TEXT2CAD } = load();
const board = () => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_TC364))));

test('snapshot → restore keeps the board graph: shared pads, owners, layers, nets', () => {
  const B = board();
  const st = { board: B, np: { name: 'x', req: '12V CAN', arch: HWARCH.archFrom('12V 차량 CAN 노드, STM32, LED 1개').arch, answers: {} }, hsis: { items: [{ id: 'HSIS-1', signal: 'CAN_TX', pins: ['1'] }] } };
  const S = JSON.parse(JSON.stringify(REVLOG.snapshot(st)));
  const R = REVLOG.restore(S, PCB);
  const C = R.board;
  assert.equal(C.comps.length, B.comps.length); assert.equal(C.vias.length, B.vias.length); assert.equal(C.W, B.W); assert.equal(C.netOrder.length, B.netOrder.length);
  // a through pad is one object in its component and in both copper lists
  const th = C.comps.flatMap(c => c.pads).find(p => p.side === 'both');
  assert.ok(th && C.layers['T.cu'].includes(th) && C.layers['B.cu'].includes(th));
  // plated drills point back at their component object
  const d = C.drills.find(x => x.own); assert.ok(d && C.comps.includes(d.own));
  assert.ok(C.byRef[B.comps[0].ref] && typeof C.netClass === 'function');
  assert.equal(R.np.arch.blocks.length, st.np.arch.blocks.length); assert.equal(R.hsis.items[0].signal, 'CAN_TX');
  // nothing changed → empty comparison
  const d0 = REVLOG.compare({ board: B, np: st.np, hsis: st.hsis }, R);
  assert.equal(d0.total, 0, d0.summary);
  // stats
  const s = REVLOG.stats(B, st); assert.equal(s.comps, B.comps.length); assert.ok(s.len > 0 && s.tracks > 0);
});

test('compare finds BOM, placement, net, layer, diagram, HSIS and housing changes', () => {
  const A = board(); const B = board();
  // BOM: change a value, remove one part, move one
  const r0 = B.comps.find(c => /^R/.test(c.ref)); r0.val = '4.7k';
  const gone = B.comps.find(c => /^C/.test(c.ref)); B.comps = B.comps.filter(c => c !== gone);
  const mv = B.comps.find(c => c !== r0 && /^U/.test(c.ref)); PCBEDIT.move(B, mv, 2, 0);
  // net: rename one pin's net
  const pad = B.comps.find(c => c.ref === r0.ref).pads[0]; const oldNet = pad.net; pad.net = 'NEW_NET';
  PCB.finalize(B);
  PCBEDIT.setLayers(B, 4);
  B.housing = { inp: { ip: 'IP67' }, cad: { over: { wall: 3 }, feats: [{ id: 'F1', type: 'hole', side: 'E', d: 8 }], edge: { T: { k: 'fillet', r: 2 } } } };
  const npA = { arch: HWARCH.archFrom('12V CAN 노드, STM32').arch, req: '12V CAN 노드' }, npB = { arch: HWARCH.archFrom('12V CAN 노드, STM32, LED 2개, SPI 플래시').arch, req: '12V CAN 노드 + LED' };
  const d = REVLOG.compare({ board: A, np: npA, hsis: { items: [{ id: 'H1', signal: 'A', pins: ['1'] }] } }, { board: B, np: npB, hsis: { items: [{ id: 'H1', signal: 'A', pins: ['2'] }, { id: 'H2', signal: 'B' }] } });
  assert.ok(d.board.bom.changed.some(x => x.ref === r0.ref && x.b.val === '4.7k'));
  assert.ok(d.board.bom.removed.some(x => x.ref === gone.ref));
  assert.ok(d.board.place.some(x => x.ref === mv.ref && Math.abs(x.dx - 2) < 1e-6));
  assert.ok(d.board.nets.added.some(x => x.net === 'NEW_NET'));
  assert.ok(d.board.pins.some(x => x.pin === `${r0.ref}.${pad.n}` && x.a === oldNet && x.b === 'NEW_NET'));
  assert.ok(d.board.board.some(x => x[0] === '동박 층' && x[1] === 2 && x[2] === 4));
  assert.ok(d.board.layers.some(x => x.layer === 'In1' && !x.a && x.b));
  assert.ok(d.arch.added.length > 0); assert.ok(d.plan.req);
  assert.equal(d.hsis.added.length, 1); assert.ok(d.hsis.changed.some(x => x.id === 'H1' && x.fields.includes('pins')));
  assert.equal(d.housing.feats.added.length, 1); assert.ok(d.housing.over.some(x => x[0] === 'wall')); assert.ok(d.housing.edge.some(x => x[0] === 'T'));
  assert.ok(d.total > 8); assert.match(d.summary, /부품/); assert.match(d.summary, /넷/);
});

test('encoder keeps cycles, Sets, Maps and a literal "$" key, and drops caches', () => {
  const a = { name: 'a', s: new Set([1, 2]), m: new Map([['k', 3]]), $: 'dollar' }; a.self = a; const shared = { v: 1 }; a.l = [shared, shared];
  const H = { inp: { ip: 'IP54' }, cad: {}, R: { big: 1 }, undo: ['x'], key: 'k' };
  a.housing = H;
  const r = REVLOG.dec(JSON.parse(JSON.stringify(REVLOG.enc(a))));
  assert.equal(r.self, r); assert.equal(r.l[0], r.l[1]); assert.ok(r.s.has(2)); assert.equal(r.m.get('k'), 3); assert.equal(r.$, 'dollar');
  assert.equal(r.housing.R, undefined); assert.equal(r.housing.undo, undefined); assert.deepEqual({ ...r.housing.inp }, { ip: 'IP54' });
});
