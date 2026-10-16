import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, SCH, SAMPLE, SAMPLE_MCU, SAMPLE_BLDC, SAMPLE_TC364, HSIS, HSIS_SAMPLES, PINREC } = load();
const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE))));

const SCH_TXT = `(kicad_sch (version 20231120) (generator "eeschema") (paper "A4")
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide) (pin_names (offset 0))
      (property "Reference" "R" (at 2.032 0 90))
      (symbol "R_0_1" (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254)) (fill (type none))))
      (symbol "R_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27) (name "~") (number "1"))
        (pin passive line (at 0 -3.81 90) (length 1.27) (name "~") (number "2"))))
    (symbol "power:GND" (power) (property "Reference" "#PWR" (at 0 0 0))
      (symbol "GND_1_1" (pin power_in line (at 0 0 270) (length 0) hide (name "GND") (number "1")))))
  (symbol (lib_id "Device:R") (at 100 50 90) (unit 1)
    (property "Reference" "R2" (at 100 47 90)) (property "Value" "330" (at 100 50 90)))
  (wire (pts (xy 90 50) (xy 96.19 50)))
  (wire (pts (xy 103.81 50) (xy 110 50)))
  (label "LED" (at 90 50 180))
  (symbol (lib_id "power:GND") (at 110 50 0) (unit 1) (property "Reference" "#PWR01" (at 110 50 0)) (property "Value" "GND" (at 110 52 0))))`;

test('KiCad schematic: rotated symbol pins land on wire ends', () => {
  const sh = SCH.parseKicadSch(SCH_TXT, 'mini.kicad_sch');
  const r2 = sh.symbols.find(s => s.ref === 'R2');
  const ends = r2.pins.map(p => p.p.map(v => +v.toFixed(2)).join(','));
  assert.equal(ends.sort().join(' '), '103.81,50 96.19,50');
  assert.equal(sh.w, 297);
});

test('KiCad schematic: connectivity maps to board nets through pins and labels', () => {
  const d = SCH.build(B, [{ name: 'mini.kicad_sch', text: SCH_TXT }]);
  const sh = d.sheets[0];
  const r2 = sh.symbols.find(s => s.ref === 'R2');
  const p1 = r2.pins.find(p => p.num === '1'), p2 = r2.pins.find(p => p.num === '2');
  const nets = [p1.g.net, p2.g.net].sort();
  // board: R2.1 = LED, R2.2 = LED_A; the GND power symbol and LED label are on the wires
  assert.equal(nets.join(','), 'LED,LED_A');
  assert.ok([...sh.labels[0].g.names].includes('LED'));
});

test('auto schematic keeps every pin on its board net', () => {
  const d = SCH.build(B, null);
  assert.equal(d.auto, true);
  const syms = d.sheets.flatMap(sh => sh.symbols);
  const u1 = syms.find(s => s.ref === 'U1');
  assert.ok(u1);
  for (const sh of d.sheets) for (const sy of sh.symbols) { if (sy.power) continue;
    for (const p of sy.pins) { const pad = B.byRef[sy.ref].pads.find(q => String(q.n) === p.num); if (pad.net) assert.equal(p.g.net, pad.net, `${sy.ref}.${p.num}`); } }
  assert.ok(d.sheets.every(sh => sh.w >= 148 && sh.h > 0));
});

const boardOf = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
const mixedGroups = (d, B) => d.groups.filter(g => new Set(g.pins.map(p => { const pad = B.byRef[p.ref] && B.byRef[p.ref].pads.find(q => String(q.n) === String(p.num)); return pad && pad.net; }).filter(Boolean)).size > 1);

test('auto schematic draws wires between parts, not only labels', () => {
  for (const spec of [SAMPLE_MCU, SAMPLE_BLDC]) {
    const B2 = boardOf(spec), d = SCH.build(B2, null);
    assert.equal(d.sheets.meta.fails, 0);
    assert.equal(mixedGroups(d, B2).length, 0);
    const sh = d.sheets[0];
    assert.ok(sh.wires.length > 30);
    // every multi-pin signal net on the page is joined by wires (one connectivity group, no local labels needed)
    const sig = Object.keys(B2.nets).filter(n => B2.netClass(n) === '신호' && B2.nets[n].pads.length >= 2);
    sig.forEach(n => { const gs = d.groups.filter(g => g.net === n && g.pins.length); assert.equal(gs.length, 1, n); });
    assert.equal(sh.labels.filter(l => l.kind === 'local' && B2.nets[l.s] && B2.nets[l.s].pads.length >= 2).length, 0);
    // wires are orthogonal and on the 1.27 mm grid
    sh.wires.forEach(w => { assert.ok(w.a[0] === w.b[0] || w.a[1] === w.b[1]); [w.a[0], w.a[1], w.b[0], w.b[1]].forEach(v => assert.ok(Math.abs(v / 1.27 - Math.round(v / 1.27)) < 1e-6)); });
  }
});

test('large boards split into function pages with off-page labels', () => {
  const B3 = boardOf(SAMPLE_TC364), H = HSIS.fromRows([HSIS_SAMPLES.tc364.hsis.header].concat(HSIS_SAMPLES.tc364.hsis.rows), HSIS_SAMPLES.tc364.hsis.meta);
  HSIS.check(B3, H, null, 'U1'); PINREC.apply(B3, H, PINREC.recommend(B3, H, 'U1', { mode: 'keep' }));
  const d = SCH.build(B3, null);
  assert.ok(d.sheets.length >= 3);
  assert.match(d.sheets[0].name, /전원/);
  assert.ok(d.sheets.some(s => /미사용 핀/.test(s.name)));
  assert.equal(mixedGroups(d, B3).length, 0);
  const gl = d.sheets.flatMap((s, i) => s.labels.filter(l => l.kind === 'global').map(l => ({ l, i })));
  assert.ok(gl.length >= 2);
  // the page numbers on an off-page label point at pages that really carry the net
  gl.forEach(({ l, i }) => l.xr.split(',').forEach(pg => { const sh = d.sheets[+pg - 1]; assert.ok(sh && +pg - 1 !== i); assert.ok(sh.labels.some(x => x.s === l.s) || sh.symbols.some(sy => sy.pins.some(p => p.g && p.g.net === l.s)), l.s); }));
  // the regulator chain is wired on the power page: J1 → U2 → U6
  const pw = d.sheets[0];
  assert.ok(['J1', 'U2', 'U6'].every(r => pw.symbols.some(s => s.ref === r)));
  assert.ok(pw.wires.length >= 5);
});
