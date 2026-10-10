import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB } = load();

test('sample board builds from viewer JSON', () => {
  const { SAMPLE } = load();
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE))));
  assert.equal(B.W, 60); assert.equal(B.H, 40);
  assert.equal(B.comps.length, 20);
  assert.ok(B.nets['+3V3'].pads.length > 5);
  assert.equal(B.byRef.U1.pads.find(p => p.n === '12').fn, 'OSC_IN');
});

test('minimal KiCad board', () => {
  const src = `(kicad_pcb (version 20240108) (general (thickness 1.6))
    (net 0 "") (net 1 "GND") (net 2 "VCC")
    (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (at 10 10 90)
      (property "Reference" "R1" (at 0 -1.4 90) (layer "F.SilkS") (effects (font (size 1 1))))
      (property "Value" "10k" (at 0 1.4 90) (layer "F.Fab"))
      (fp_line (start -0.8 -0.4) (end 0.8 -0.4) (layer "F.Fab") (width 0.1))
      (fp_line (start -0.8 0.4) (end 0.8 0.4) (layer "F.Fab") (width 0.1))
      (pad "1" smd roundrect (at -0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask") (roundrect_rratio 0.25) (net 1 "GND"))
      (pad "2" smd roundrect (at 0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask") (roundrect_rratio 0.25) (net 2 "VCC")))
    (segment (start 10 10.825) (end 10 15) (width 0.25) (layer "F.Cu") (net 2))
    (via (at 10 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2))
    (gr_rect (start 0 0) (end 30 20) (layer "Edge.Cuts") (stroke (width 0.1))))`;
  const B = PCB.build([{ name: 'a.kicad_pcb', role: 'kicad', text: src }]);
  assert.equal(B.W, 30); assert.equal(B.H, 20);
  const r1 = B.byRef.R1;
  assert.equal(r1.val, '10k'); assert.equal(r1.pads.length, 2);
  assert.ok(Math.abs(r1.pads.find(p => p.n === '2').y - 10.825) < 1e-6); // rotated 90° CCW, KiCad y-down → y-up
  assert.equal(B.nets.VCC.vias.length, 1);
  assert.ok(B.nets.VCC.len.T > 4);
});

test('Gerber X2 attributes, aperture macro and arc', () => {
  const g = `%TF.FileFunction,Copper,L1,Top*%\n%FSLAX46Y46*%\n%MOMM*%\n%AMRR*\n21,1,$1,$2,0,0,0*%\n%ADD10RR,1.2X0.8*%\n%ADD11C,0.25*%\n` +
    `%TO.P,R1,1*%\n%TO.N,GND*%\nD10*\nX10000000Y10000000D03*\n%TD*%\n%TO.N,/LED*%\nD11*\nG75*\nX11600000Y10000000D02*\nG03*\nX13600000Y12000000I0J2000000D01*\nM02*`;
  assert.equal(PCB.detectRole('b-F_Cu.gbr', g).role, 'tcu');
  const r = PCB.parseGerber(g);
  const pad = r.prims.find(p => p.t === 'pad');
  assert.equal(pad.net, 'GND'); assert.equal(pad.ref, 'R1'); assert.equal(pad.n, '1');
  assert.ok(Math.abs(pad.w - 1.2) < 1e-9 && Math.abs(pad.h - 0.8) < 1e-9);
  const arc = r.prims.find(p => p.t === 'path');
  assert.equal(arc.net, '/LED');
  const end = arc.pts[arc.pts.length - 1];
  assert.ok(Math.abs(end[0] - 13.6) < 1e-6 && Math.abs(end[1] - 12) < 1e-6);
});

test('Excellon with implicit decimals (inch, leading zeros suppressed)', () => {
  const h = PCB.parseExcellon('M48\nM72\nT01C0.0400\n%\nT01\nX7003Y2682\nM30\n', 'x.drd');
  assert.equal(h.length, 1);
  assert.ok(Math.abs(h[0].x - 0.7003 * 25.4) < 1e-6);
  assert.ok(Math.abs(h[0].d - 1.016) < 1e-6);
});

test('Pick-and-Place (KiCad .pos and CSV) and BOM', () => {
  const pos = '# Ref Val Package PosX PosY Rot Side\nR1 10k R_0603 10.8 -10.0 0.0 top\nU1 MCU QFN 30 -20 90 bottom\n';
  assert.equal(PCB.detectRole('board.pos', pos).role, 'pnp');
  const rows = PCB.parsePnP(pos);
  assert.equal(rows[1].side, 'B'); assert.equal(rows[1].rot, 90);
  const csv = 'Designator,Mid X,Mid Y,Layer,Rotation\nC1,1000mil,500mil,Bottom,90\n';
  assert.ok(Math.abs(PCB.parsePnP(csv)[0].x - 25.4) < 1e-9);
  const bom = PCB.parseBOM('Comment,Designator,LCSC\n10k,"R1,R5-R7",C25804\n');
  assert.equal(Object.keys(bom).join(','), 'R1,R5,R6,R7');
  assert.equal(bom.R6.mpn, 'C25804');
});
