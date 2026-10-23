import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { KICADLIB, KPINS, PARTLIB, NEWPROJ } = load();
const LIB5 = `EESchema-LIBRARY Version 2.4
DEF TJA1051T U 0 40 Y Y 1 F N
F0 "U" -400 350 50 H V L CNN
F1 "TJA1051T" 50 350 50 H V L CNN
F2 "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" 0 -500 50 H I C CIN
F3 "" 0 0 50 H I C CNN
ALIAS TJA1051T-3
DRAW
X TXD 1 -500 200 100 R 50 50 1 1 I
X GND 2 0 -400 100 U 50 50 1 1 W
X VCC 3 0 400 100 D 50 50 1 1 W
X RXD 4 -500 100 100 R 50 50 1 1 O
X n.c. 5 -500 -100 100 R 50 50 1 1 N N
X CANL 6 500 -100 100 L 50 50 1 1 B
X CANH 7 500 100 100 L 50 50 1 1 B
X S 8 -500 -200 100 R 50 50 1 1 I
ENDDRAW
ENDDEF
#End Library`;
const DCM = `EESchema-DOCLIB  Version 2.0\n$CMP TJA1051T\nD High-Speed CAN Transceiver, 1Mbps, 5V supply, SOIC-8\nF http://www.nxp.com/docs/en/data-sheet/TJA1051.pdf\n$ENDCMP\n#End Doc Library`;
const SYM = `(kicad_symbol_lib (version 20220914) (generator kicad_symbol_editor)
  (symbol "TCAN1044V" (in_bom yes) (on_board yes)
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "https://www.ti.com/lit/ds/symlink/tcan1044v.pdf" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Description" "CAN FD transceiver, 3.3/5 V IO" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "TCAN1044V_1_1"
      (pin input line (at -10.16 2.54 0) (length 2.54) (name "TXD" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin power_in line (at 0 -7.62 90) (length 2.54) (name "GND" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      (pin power_in line (at 0 7.62 270) (length 2.54) (name "VCC" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.27 1.27)))))
      (pin output line (at -10.16 0 0) (length 2.54) (name "RXD" (effects (font (size 1.27 1.27)))) (number "4" (effects (font (size 1.27 1.27)))))
      (pin power_in line (at -10.16 -2.54 0) (length 2.54) (name "VIO" (effects (font (size 1.27 1.27)))) (number "5" (effects (font (size 1.27 1.27)))))
      (pin bidirectional line (at 10.16 -2.54 180) (length 2.54) (name "CANL" (effects (font (size 1.27 1.27)))) (number "6" (effects (font (size 1.27 1.27)))))
      (pin bidirectional line (at 10.16 2.54 180) (length 2.54) (name "CANH" (effects (font (size 1.27 1.27)))) (number "7" (effects (font (size 1.27 1.27)))))
      (pin input line (at -10.16 -5.08 0) (length 2.54) (name "STB" (effects (font (size 1.27 1.27)))) (number "8" (effects (font (size 1.27 1.27)))))))
  (symbol "TCAN1044AV" (extends "TCAN1044V")
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))))`;
test('KiCad 5 .lib + .dcm: pins, types, alias, footprint, description, datasheet', () => {
  const r = KICADLIB.parseFiles([{ name: 'Interface_CAN_LIN.lib', text: LIB5 }, { name: 'Interface_CAN_LIN.dcm', text: DCM }]);
  assert.equal(r.parts.length, 2); const a = r.parts.find(p => p.mpn === 'TJA1051T'), b = r.parts.find(p => p.mpn === 'TJA1051T-3');
  assert.equal(a.pins.length, 8); assert.deepEqual(a.pins[0], { num: '1', name: 'TXD', type: 'in' }); assert.equal(a.pins[1].type, 'power_in'); assert.equal(a.pins[5].type, 'bidir');
  assert.equal(a.pkg, 'SOIC-8'); assert.ok(/TJA1051\.pdf/.test(a.pdf)); assert.ok(/CAN Transceiver/.test(a.title)); assert.equal(b.pins.length, 8); assert.equal(a.src, 'kicad');
});
test('KiCad 6–8 .kicad_sym: nested unit symbols and extends', () => {
  const r = KICADLIB.parseSym(SYM, 'Interface_CAN_LIN');
  assert.equal(r.length, 2); const v = r.find(p => p.mpn === 'TCAN1044V'), av = r.find(p => p.mpn === 'TCAN1044AV');
  assert.equal(v.pins.length, 8); assert.equal(v.pins[7].name, 'STB'); assert.equal(v.pkg, 'SOIC-8'); assert.ok(/tcan1044v/.test(v.pdf));
  assert.equal(av.pins.length, 8, 'extends inherits the base pins');
});
test('pick(): exact / prefix / family with package checks (no wrong-package pinouts)', () => {
  const P = KICADLIB.parseFiles([{ name: 'X.lib', text: LIB5 }]).parts.concat(KICADLIB.parseSym(SYM, 'Y'));
  const m = KICADLIB.pick(P, ['TJA1051T/3', 'TCAN1044AVDRQ1', 'TCAN1044AVDRBRQ1X', 'LMR33630AQRNXRQ1']);
  assert.equal(m['TJA1051T/3'].match, 'exact'); assert.ok(m['TCAN1044AVDRQ1']); assert.ok(!m['LMR33630AQRNXRQ1']);
});
test('bundled KPINS: real pins merged into the library lookup (a built-in part without pins gets them)', () => {
  assert.ok(Object.keys(KPINS).length >= 20);
  const r = NEWPROJ.partLookup('TJA1051T/3'); assert.ok(r && r.pins && r.pins.length === 8, 'TJA1051T/3 should have KiCad pins');
  assert.ok(r.pins.some(p => /CANH/i.test(p.name)));
  const recs = PARTLIB.fromKpins(KPINS); assert.ok(recs.every(x => x.src === 'kicad' && x.pins.length));
});
