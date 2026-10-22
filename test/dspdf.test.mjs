import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { DSPDF, PARTLIB } = load();

const P1 = `TCAN1043-Q1\nAutomotive Fault-Protected CAN FD Transceiver\n1 Features\nAEC-Q100 qualified\nSOIC (14) 8.65 mm x 3.91 mm`;
const P2 = `5 Pin Configuration and Functions\nPin Functions\nPIN\nNAME NO. TYPE DESCRIPTION\nTXD 1 I CAN transmit data input\nGND 2 GND Ground\nVCC 3 Supply 5-V supply\nRXD 4 O CAN receive data output\nVIO 5 Supply I/O supply\nEN 6 I Enable input\nINH 7 O Inhibit output\nSTB 8 I Standby input\nWAKE 9 I Wake input\nVSUP 10 Supply Battery supply\nnFAULT 11 O Fault output\nCANL 12 I/O Low level CAN bus line\nCANH 13 I/O High level CAN bus line\nNC 14 — No connect\n6 Specifications\n6.1 Absolute Maximum Ratings\nVCC Supply voltage -0.3 7 V`;

test('datasheet text → pin table: name-first rows, package and title, stop at the specifications', () => {
  const R = DSPDF.parse([P1, P2], { mpn: 'TCAN1043DRQ1' });
  assert.equal(R.npins, 14); assert.equal(R.pkg, 'SOIC'); assert.ok(R.conf >= 0.9);
  assert.equal(R.pins[0].name, 'TXD'); assert.equal(R.pins[10].name, 'nFAULT'); assert.equal(R.pins[13].name, 'NC');
  assert.match(R.title, /CAN FD Transceiver/);
  assert.ok(!R.pins.some(p => /Supply|voltage/i.test(p.name)), 'spec rows are not pins');
  const rec = DSPDF.record(R, 'tcan.pdf');
  assert.equal(rec.src, 'ds'); assert.equal(rec.pins.length, 14); assert.match(rec.note, /데이터시트/);
  assert.equal(PARTLIB.merge([[rec], [{ mpn: 'TCAN1043DRQ1', src: 'ai', pins: [] }]])[0].src, 'ds', 'datasheet beats the AI estimate');
});

test('multi-package tables give one candidate per column and the package picks the column; pdf.js items are grouped into lines', () => {
  const T = `Pin Configuration\nPIN NO.\nSOIC TSSOP NAME I/O DESCRIPTION\n1 2 VIN I Input voltage\n2 3 EN I Enable\n3 4 GND — Ground\n4 5 NC — Not connected\n5 6 FB I Feedback\n6 7 VOUT O Output\n7 8 PG O Power good\n8 1 SW O Switch node`;
  const A = DSPDF.parse([T], { mpn: 'X1' }); assert.equal(A.candidates.length, 2); assert.equal(A.pins.find(p => p.name === 'VIN').num, '1');
  const B = DSPDF.parse([T], { mpn: 'X1', pkg: 'TSSOP' }); assert.equal(B.pkg, 'TSSOP'); assert.equal(B.pins.find(p => p.name === 'VIN').num, '2'); assert.equal(B.pins.find(p => p.num === '1').name, 'SW');
  // pdf.js style items: same y → one line, sorted by x
  const items = [{ str: 'Pin Description', x: 50, y: 700 }, { str: '1', x: 50, y: 680 }, { str: 'VDD', x: 90, y: 680 }, { str: 'Supply', x: 150, y: 680 }, { str: '2', x: 50, y: 660 }, { str: 'GND', x: 90, y: 660 }, { str: '3', x: 50, y: 640 }, { str: 'SDA', x: 90, y: 640 }, { str: '4', x: 50, y: 620 }, { str: 'SCL', x: 90, y: 620 }];
  assert.deepEqual(DSPDF.linesOf(items).slice(0, 2), ['Pin Description', '1 VDD Supply']);
  const C = DSPDF.parse([items], { mpn: 'I2C' }); assert.equal(C.npins, 4); assert.equal(C.pins[2].name, 'SDA');
  const N = DSPDF.parse(['nothing here'], { mpn: 'Z' }); assert.equal(N.npins, 0); assert.ok(N.notes[0].includes('찾지 못'));
  const ai = DSPDF.fromAi({ mpn: 'Z', pins: [{ num: '1', name: '/RESET' }, { num: 'A1', name: 'VDD' }], conf: 0.8 }, 'Z');
  assert.equal(ai.pins[0].name, 'nRESET'); assert.match(DSPDF.aiPrompt('Z', 'txt', 'QFN'), /JSON only/);
});
