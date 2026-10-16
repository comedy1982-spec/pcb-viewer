import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, SCH, SCHEDIT, SAMPLE_MCU, SAMPLE_TC364 } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
const padNets = (B) => { const m = {}; B.comps.forEach(c => c.pads.forEach(p => { m[c.ref + '.' + p.n] = p.net || null; })); return m; };

test('auto schematic → .kicad_sch → parse keeps the netlist', () => {
  for (const spec of [SAMPLE_MCU, SAMPLE_TC364]) {
    const B = board(spec), d = SCH.build(B, null);
    assert.equal(SCHEDIT.annotate(d.sheets, B).changes.length, 0);
    const files = SCHEDIT.toKicad(d.sheets, { name: B.name, board: B });
    assert.ok(files.every(f => /^\(kicad_sch \(version 20230121\)/.test(f.text)));
    // balanced parentheses in every file
    files.forEach(f => { let n = 0, str = false; for (let i = 0; i < f.text.length; i++) { const c = f.text[i]; if (c === '"' && f.text[i - 1] !== '\\') str = !str; else if (!str) n += c === '(' ? 1 : c === ')' ? -1 : 0; } assert.equal(n, 0, f.name); });
    const back = SCH.build(B, files);
    assert.equal(SCHEDIT.annotate(back.sheets, B).changes.length, 0, B.name);
    if (files.length > 1) assert.ok(/\(sheet \(at/.test(files[0].text));
  }
});

test('a net label renames the net on back-annotation', () => {
  const B = board(SAMPLE_MCU), d = SCH.build(B, null), sh = d.sheets[0];
  const w = sh.wires.find(x => x.g && x.g.net === 'LED_ST' && x.a[1] === x.b[1]);
  SCHEDIT.addLabel(sh, 'local', 'STATUS_LED', [SCHEDIT.snap((w.a[0] + w.b[0]) / 2), w.a[1]], 0);
  const res = SCHEDIT.annotate(d.sheets, B);
  assert.ok(res.changes.length >= 2 && res.changes.every(c => c.kind === 'net' && c.from === 'LED_ST' && c.to === 'STATUS_LED'));
  SCHEDIT.applyAnnotation(B, res); const { PINREC } = load(); PINREC.relink(B);
  assert.equal(B.nets.STATUS_LED.pads.length, 2);
  assert.ok(!B.nets.LED_ST || B.nets.LED_ST.pads.length === 0); // its copper keeps the old name until re-routed
});

test('deleting a wire splits the net; dragging a part keeps it', () => {
  const B = board(SAMPLE_MCU), d = SCH.build(B, null), sh = d.sheets[0];
  const r4 = sh.symbols.find(s => s.ref === 'R4');
  SCHEDIT.drag(sh, r4, 0, -5.08);
  assert.equal(SCHEDIT.annotate(d.sheets, B).changes.length, 0);
  assert.ok(sh.wires.every(w => w.a[0] === w.b[0] || w.a[1] === w.b[1]));
  SCH.connect(d.sheets, B);
  const gate = sh.wires.filter(w => w.g && w.g.net === 'GATE');
  gate.forEach(w => SCHEDIT.remove(sh, w));
  const res = SCHEDIT.annotate(d.sheets, B);
  const ch = res.changes.filter(c => c.from === 'GATE');
  assert.ok(ch.length >= 2 && ch.every(c => c.to === null));
  assert.ok(SCHEDIT.erc(d.sheets).some(e => e.code === 'unconnected'));
});

test('a new part wired into the schematic is added to the board', () => {
  const B = board(SAMPLE_MCU), d = SCH.build(B, null), sh = d.sheets[0];
  const ref = SCHEDIT.nextRef(d.sheets, 'C', B);
  assert.equal(ref, 'C6');
  const s = SCHEDIT.newPart('C', ref, [30, 30], false);
  sh.symbols.push(s);
  // wire its pins to a +3V3 and a GND power symbol
  SCHEDIT.addPower(sh, '+3V3', [s.pins[0].p[0] - 2.54, s.pins[0].p[1] - 5.08], 3, false);
  SCHEDIT.addWire(sh, s.pins[0].p, [s.pins[0].p[0] - 2.54, s.pins[0].p[1] - 5.08]);
  SCHEDIT.addPower(sh, 'GND', [s.pins[1].p[0] + 2.54, s.pins[1].p[1] + 5.08], 1, true);
  SCHEDIT.addWire(sh, s.pins[1].p, [s.pins[1].p[0] + 2.54, s.pins[1].p[1] + 5.08]);
  const res = SCHEDIT.annotate(d.sheets, B);
  const add = res.changes.find(c => c.kind === 'add');
  assert.equal(add.ref, 'C6'); assert.equal(add.fp, '0603');
  assert.deepEqual([...add.pins.map(p => p.net)].sort(), ['+3V3', 'GND']);
  assert.equal(res.changes.filter(c => c.kind === 'net').length, 0);
  // rotation keeps the symbol on the grid
  SCHEDIT.rotate(s); s.pins.forEach(p => p.p.forEach(v => assert.ok(Math.abs(v / 1.27 - Math.round(v / 1.27)) < 1e-6)));
});

test('cleanWires merges collinear pieces and places T junctions', () => {
  const sh = { symbols: [], wires: [], labels: [], junctions: [], nocon: [] };
  SCHEDIT.addWire(sh, [0, 0], [5.08, 0]); SCHEDIT.addWire(sh, [5.08, 0], [10.16, 0]);
  assert.equal(sh.wires.length, 1);
  SCHEDIT.addWire(sh, [5.08, 0], [5.08, 5.08]);
  assert.equal(sh.junctions.length, 1); assert.deepEqual([...sh.junctions[0]].map(v => +v.toFixed(2)), [5.08, 0]);
  SCHEDIT.addWire(sh, [0, 2.54], [10.16, 7.62]);
  assert.ok(sh.wires.every(w => w.a[0] === w.b[0] || w.a[1] === w.b[1]));
});

test('drag, rotate and mirror re-route wires without shorting other nets', () => {
  let n = 0;
  for (const ref of ['R4', 'R1', 'D2', 'Q1', 'C4']) for (let dx = -12.7; dx <= 12.7; dx += 5.08) for (let dy = -12.7; dy <= 12.7; dy += 5.08) {
    const B = board(SAMPLE_MCU), d = SCH.build(B, null), sh = d.sheets[0], s = sh.symbols.find(x => x.ref === ref);
    // skip offsets where the part itself lands on another wire or pin (that really connects, as in KiCad)
    const own = new Set(sh.wires.filter(w => s.pins.some(p => SCHEDIT.same(p.p, w.a) || SCHEDIT.same(p.p, w.b))));
    const bb = [s.bb[0] + dx - 3, s.bb[1] + dy - 3, s.bb[2] + dx + 3, s.bb[3] + dy + 3];
    const crowd = sh.wires.some(w => !own.has(w) && Math.max(w.a[0], w.b[0]) >= bb[0] && Math.min(w.a[0], w.b[0]) <= bb[2] && Math.max(w.a[1], w.b[1]) >= bb[1] && Math.min(w.a[1], w.b[1]) <= bb[3])
      || sh.symbols.some(o => o !== s && o.bb[0] < bb[2] && bb[0] < o.bb[2] && o.bb[1] < bb[3] && bb[1] < o.bb[3]);
    if (crowd) continue;
    SCHEDIT.drag(sh, s, dx, dy); SCHEDIT.rotateKeep(sh, s); SCHEDIT.mirrorKeep(sh, s, 'x');
    const res = SCHEDIT.annotate(d.sheets, B);
    assert.equal(res.changes.length, 0, `${ref} ${dx},${dy}: ${res.changes.map(c => c.ref + c.pin + c.from + '>' + c.to).join(' ')}`);
    n++;
  }
  assert.ok(n >= 10, String(n));
});
