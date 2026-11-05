import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, SCH, SCHEDIT, PADSSCH, SAMPLE_MCU, SAMPLE_TC364, SAMPLE } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));

// schematic → PADS Logic ASCII → parse back: same parts, same pin-to-net connectivity as the board
test('PADS Logic export → import keeps every part and net (multi-sheet, multi-gate)', () => {
  for (const spec of [SAMPLE_MCU, SAMPLE_TC364, SAMPLE]) {
    const B = board(spec), d = SCH.build(B, null);
    const r = PADSSCH.toLogic(d.sheets, { name: B.name, board: B });
    assert.match(r.text, /^\*PADS-LOGIC-V9\.0\* /);
    assert.match(r.text, /\*END\*\s+OF ASCII OUTPUT FILE\r\n$/);
    assert.ok(!/[^\x00-\x7f]/.test(r.text), 'plain ASCII (PADS code page)');
    for (const sec of ['*SCH*', '*FIELDS*', '*SHT*', '*CAEDECAL*', '*PARTTYPE*', '*PART*', '*OFFPAGE REFS*', '*TIEDOTS*', '*CONNECTION*', '*NETNAMES*']) assert.ok(r.text.includes(sec), sec);
    const back = PADSSCH.parseLogic(r.text, 'x.txt');
    assert.equal(back.length, d.sheets.length);
    assert.equal(back.reduce((a, s) => a + s.symbols.length, 0), d.sheets.reduce((a, s) => a + s.symbols.length, 0));
    const ch = SCHEDIT.annotate(back, B).changes.filter(c => c.kind !== 'value');
    assert.equal(JSON.stringify(ch.map(c => c.kind + ' ' + c.ref)), '[]', B.name);
  }
  // a part drawn in several units becomes one PADS part type with gates U?-A, U?-B …
  const B = board(SAMPLE_TC364), r = PADSSCH.toLogic(SCH.build(B, null).sheets, { board: B });
  assert.ok(/^\S+-A\s/m.test(r.text) && /^\S+-B\s/m.test(r.text) && /^GATE 1 \d+ 0$/m.test(r.text));
});

test('PADS netlist (.asc) lists every part and connected net', () => {
  const B = board(SAMPLE_MCU), d = SCH.build(B, null), n = PADSSCH.toNetlist(d.sheets, { board: B });
  assert.match(n.text, /^\*PADS-PCB\*\r\n\*PART\*\r\n/);
  assert.match(n.text, /\*NET\*\r\n\*SIGNAL\* /);
  assert.equal(n.stats.parts, new Set(B.comps.map(c => c.ref)).size);
  const gnd = n.text.split('\r\n').findIndex(l => l === '*SIGNAL* GND');
  assert.ok(gnd > 0 && /\.\S+/.test(n.text.split('\r\n')[gnd + 1]));
});

// records as PADS Logic V9 writes them: decal variant (field 15) picks the flipped drawing; -A / -B suffix = gate
const FIX = `*PADS-LOGIC-V9.0* DESIGN EXPORT FILE FROM PADS LOGIC V9.5
*SCH*        GENERAL PARAMETERS OF THE SCHEMATIC DESIGN

SHEET SIZE   A
UNITS        0

*SHT*   1 MAIN -1 $$$NONE
*CAEDECAL*  ITEMS

PS               34000 34000 100 10 100 10 4 1 0 0 0 1
TIMESTAMP 2026.01.01.00.00.00
"Default Font"
"Default Font"
60 10 0 1 100 10 "Default Font"
REF-DES
140 10 0 8 100 10 "Default Font"
PART-TYPE
-530 10 0 1 100 10 "Default Font"
*
-70 10 0 1 100 10 "Default Font"
*
OPEN   2   10  255
0     0
100   0

TWO              32000 32000 100 10 100 10 4 1 0 2 0 0
TIMESTAMP 2026.01.01.00.00.00
"Default Font"
"Default Font"
0 100 0 0 100 10 "Default Font"
REF-DES
0 -100 0 0 100 10 "Default Font"
PART-TYPE
0 -200 0 0 100 10 "Default Font"
*
0 -300 0 0 100 10 "Default Font"
*
CLOSED 5   10  255
100   -50
300   -50
300   50
100   50
100   -50
T0     0     0 0 30 20 0 1 140 0 0 8 PS
P0 0 0 1 0 0 0 1 128
T400   0     0 1 30 20 0 1 140 0 0 8 PS
P0 0 0 1 0 0 0 1 128

TWO-OP           32000 32000 100 10 100 10 4 1 0 2 0 0
TIMESTAMP 2026.01.01.00.00.00
"Default Font"
"Default Font"
0 100 0 0 100 10 "Default Font"
REF-DES
0 -100 0 0 100 10 "Default Font"
PART-TYPE
0 -200 0 0 100 10 "Default Font"
*
0 -300 0 0 100 10 "Default Font"
*
CLOSED 5   10  255
100   -50
300   -50
300   50
100   50
100   -50
T400   0     0 1 30 20 0 1 140 0 0 8 PS
P0 0 0 1 0 0 0 1 128
T0     0     0 0 30 20 0 1 140 0 0 8 PS
P0 0 0 1 0 0 0 1 128

*PARTTYPE*   ITEMS

RES1K RES  1   0   0     0
TIMESTAMP 2026.01.01.00.00.00
GATE 2 2 0
TWO
TWO-OP
1 0 U
2 0 U

DUAL ANA  2   0   0     0
TIMESTAMP 2026.01.01.00.00.00
GATE 1 2 0
TWO
1 0 L IN
2 0 S OUT
GATE 1 2 0
TWO
3 0 L IN
4 0 S OUT

*PART*       ITEMS

R1           RES1K            1000  5000    0 0 100 10 100 10 0 1 2 0 1 0
"Value" 1k
U1-A         DUAL             2000  5000    0 0 100 10 100 10 0 0 2 0 0 0
U1-B         DUAL             3000  5000    0 0 100 10 100 10 0 0 2 0 0 0

*OFFPAGE REFS*

@@@O0    GND $GND_SYMS 1400   4000   0 0 0

*TIEDOTS*

*CONNECTION*

*SIGNAL* NA 0 0
R1.2         U1-A.1       4 0
1000   5000
1000   6000
2000   6000
2000   5000

*SIGNAL* GND 0 0
R1.1         @@@O0        3 0
1400   5000
1400   4000
1400   4000

*END*     OF ASCII OUTPUT FILE
`;
test('PADS Logic import: decal variants, gates, power symbols, named signals', () => {
  const sh = PADSSCH.parseLogic(FIX, 'fix.txt');
  assert.equal(sh.length, 1);
  const S = sh[0].symbols, R1 = S.find(s => s.ref === 'R1');
  assert.equal(R1.val, '1k');
  // variant 1 = TWO-OP: pin 1 on the right (x = 1000 + 400 mil), pin 2 at the part origin
  const mil = v => Math.round(v * PADSSCH.MIL);
  assert.equal(mil(R1.pins.find(p => p.num === '1').p[0]), 1400);
  assert.equal(mil(R1.pins.find(p => p.num === '2').p[0]), 1000);
  const U = S.filter(s => s.ref === 'U1');
  assert.equal(U.length, 2);
  assert.equal(JSON.stringify(U.map(u => u.pins.map(p => p.num).join(',')).sort()), '["1,2","3,4"]');
  assert.ok(S.some(s => s.power && s.val === 'GND'));
  const c = SCH.connect(sh, null);
  const net = (ref, n) => c.groups.find(g => g.pins.some(p => p.ref === ref && p.num === n));
  assert.ok(net('R1', '2') === net('U1', '1'), 'R1.2 — U1-A.1');
  assert.ok(net('R1', '1') !== net('R1', '2'));
  assert.ok(net('R1', '1').names.has('GND'), 'R1.1 on GND through the power symbol');
  assert.ok(net('R1', '2').names.has('NA'), 'named signal keeps its name');
  // a schematic on its own makes a board with those parts and nets
  const B = PCB.finalize(SCH.boardFrom([{ name: 'fix.txt', text: FIX }]));
  assert.equal(B.comps.map(c => c.ref).sort().join(','), 'R1,U1');
  assert.equal(B.byRef.R1.pads.find(p => String(p.n) === '1').net, 'GND');
  assert.equal(PCB.detectRole('fix.txt', FIX).role, 'sch');
});
