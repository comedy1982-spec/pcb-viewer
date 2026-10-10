import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, SCH, SAMPLE } = load();
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

test('auto schematic labels every connected pin with its board net', () => {
  const d = SCH.build(B, null);
  assert.equal(d.auto, true);
  const sh = d.sheets[0];
  const u1 = sh.symbols.find(s => s.ref === 'U1');
  assert.ok(u1);
  for (const p of u1.pins) {
    const pad = B.byRef.U1.pads.find(q => String(q.n) === p.num);
    if (pad.net) assert.equal(p.g.net, pad.net, `U1.${p.num}`);
  }
  assert.ok(sh.w >= 150 && sh.h > 0);
});
