import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PARTLIB, FPGEN, PCB, PARTS } = load();

test('partlib: csv import with Korean headers, pins and status', () => {
  const csv = 'MPN,제조사,설명,패키지,핀,단가,승인\nAP2112K-3.3,Diodes,LDO 600mA 3.3V,SOT-23-5,"1:VIN,2:GND,3:EN,4:NC,5:VOUT",$0.12,Y\nXYZ,,bad,,,,\n,,,,,,';
  const r = PARTLIB.parseTable(PARTLIB.parseCsv(csv));
  assert.equal(r.parts.length, 2);
  const p = r.parts[0];
  assert.equal(p.mpn, 'AP2112K-3.3'); assert.equal(p.mfr, 'Diodes'); assert.equal(p.pkg, 'SOT-23-5');
  assert.equal(p.pins.length, 5); assert.equal(p.pins[4].name, 'VOUT'); assert.equal(p.price, 0.12); assert.equal(p.status, 'approved');
  const back = PARTLIB.parseTable(PARTLIB.parseCsv(PARTLIB.toCsv(r.parts)));
  assert.equal(back.parts[0].pins.length, 5);
  assert.ok(PARTLIB.parseTable([['foo', 'bar']]).error);
});

test('partlib: merge order user > builtin > ai, find/search', () => {
  const b = PARTLIB.fromBuiltin(PARTS);
  assert.ok(b.find(p => p.mpn === 'AMS1117-3.3'));
  const user = [{ mpn: 'ams1117-3.3', mfr: 'AMS', src: 'user', pins: [] }];
  const ai = [{ mpn: 'AMS1117-3.3', mfr: 'guess', src: 'ai', pins: [] }];
  const all = PARTLIB.merge([ai, b, user]);
  assert.equal(PARTLIB.find(all, 'AMS1117-3.3').src, 'user');
  assert.equal(PARTLIB.search(all, 'ams1117')[0].mpn.toLowerCase(), 'ams1117-3.3');
  assert.ok(PARTLIB.search(all, 'low-dropout').length >= 1);
});

test('partlib: pin mapping by name, role and number; plan warnings', () => {
  const oldc = { ref: 'U3', fp: 'SOT-223', pads: [{ n: '1', fn: 'GND', net: 'GND' }, { n: '2', fn: 'VOUT', net: '+3V3' }, { n: '3', fn: 'VIN', net: '+5V' }, { n: '4', fn: 'VOUT', net: '+3V3' }] };
  const part = { mpn: 'AP2112K-3.3', pkg: 'SOT-23-5', src: 'ai', price: 0.12, pins: [{ num: '1', name: 'VIN' }, { num: '2', name: 'GND' }, { num: '3', name: 'EN' }, { num: '4', name: 'NC' }, { num: '5', name: 'VOUT' }] };
  const pl = PARTLIB.plan(oldc, part, null, { oldPrice: 0.09 });
  const m = Object.fromEntries(pl.map.map.map(x => [x.from, x.to]));
  assert.equal(m['3'], '1'); assert.equal(m['1'], '2'); assert.equal(m['2'], '5'); assert.equal(m['4'], null);
  assert.ok(pl.map.extra.some(e => e.name === 'EN'));
  assert.ok(pl.warn.some(w => /풋프린트/.test(w)) && pl.warn.some(w => /Claude 추정/.test(w)));
  assert.equal(PARTLIB.role('~SHDN'), 'EN'); assert.equal(PARTLIB.role('PGND'), 'GND'); assert.equal(PARTLIB.role('PA3'), 'PA');
  const r2 = PARTLIB.mapPins([{ num: '1', name: '', net: 'A' }, { num: '2', name: '', net: 'B' }], [{ num: '1', name: '' }, { num: '2', name: '' }]);
  assert.equal(r2.map[1].to, '2'); assert.equal(r2.map[1].how, 'number');
});

test('partlib: ai record parsing and provider request shapes', () => {
  const p = PARTLIB.fromAi({ mpn: 'AP2112K-3.3', mfr: 'Diodes', pkg: 'SOT-23-5', pins: [{ num: 1, name: 'VIN' }], specs: [['입력', '2.5–6 V']], price: '0.1', conf: 1.4 }, 'x');
  assert.equal(p.src, 'ai'); assert.equal(p.pins[0].num, '1'); assert.equal(p.price, 0.1); assert.equal(p.conf, 1);
  assert.ok(PARTLIB.fromAi({ error: '없음' }).error);
  const m = PARTLIB.PROVIDERS.mouser.req('KEY', 'AP2112');
  assert.ok(m.url.includes('apiKey=KEY') && m.init.method === 'POST');
  const parsed = PARTLIB.PROVIDERS.mouser.parse({ SearchResults: { Parts: [{ ManufacturerPartNumber: 'AP2112K-3.3TRG1', Manufacturer: 'Diodes', Description: 'LDO', PriceBreaks: [{ Quantity: 1, Price: '$0.30' }, { Quantity: 1000, Price: '$0.12' }] }] } });
  assert.equal(parsed[0].price, 0.12); assert.equal(parsed[0].src, 'api');
  const c = PARTLIB.PROVIDERS.custom.req('', 'AP2112', 'https://parts.example.com/find?x=1');
  assert.ok(c.url.endsWith('&q=AP2112'));
  assert.ok(PARTLIB.pageHTML(p).includes('Claude 추정'));
});

test('fpgen: package families and generated land patterns', () => {
  assert.equal(FPGEN.name('SOT-23-5'), 'SOT-23-5'); assert.equal(FPGEN.name('TSOT-25', 5), 'SOT-23-5'); assert.equal(FPGEN.name('SOIC-14'), 'SOIC-14');
  assert.equal(FPGEN.name('QFN-16 3x3'), 'QFN-16'); assert.equal(FPGEN.name('0603'), '0603'); assert.equal(FPGEN.name('weird'), null);
  const s5 = FPGEN.make('SOT-23-5'); assert.equal(s5.pads.length, 5); assert.equal(s5.pads.map(p => p.n).join(), '1,2,3,4,5');
  const p1 = s5.pads.find(p => p.n === '1'), p5 = s5.pads.find(p => p.n === '5'); assert.ok(p1.x < 0 && p5.x > 0 && Math.abs(p1.y - p5.y) < 1e-6);
  const q = FPGEN.make('QFN-16 3x3'); assert.equal(q.pads.length, 17); assert.equal(q.body[0], 3);
  const t = FPGEN.make('TSSOP-20'); assert.equal(t.pads.length, 20);
  const d = FPGEN.make('DIP-8'); assert.ok(d.pads.every(p => p.drill));
  const nm = FPGEN.ensure(PCB, 'SOT-23-5', 5); assert.equal(nm, 'SOT-23-5'); assert.ok(PCB.FP['SOT-23-5']);
  assert.equal(FPGEN.ensure(PCB, 'SOT-223', 4), 'SOT-223');
  const B = PCB.finalize(PCB.fromSpec({ board: { width: 20, height: 20 }, components: [{ ref: 'U9', value: 'x', footprint: 'SOT-23-5', x: 10, y: 10, pins: { 1: 'VIN', 5: 'VOUT' } }] }));
  assert.equal(B.comps[0].pads.length, 5); assert.equal(B.comps[0].pads.find(p => p.n === '5').net, 'VOUT');
});

test('partlib: nameless old pins use known pinouts / net roles', () => {
  const pins = PARTLIB.pinoutFor('AMS1117-3.3', '', 'SOT-223');
  assert.equal(pins[2].name, 'VIN');
  const r = PARTLIB.mapPins([{ num: '1', name: '', net: 'GND' }, { num: '2', name: '', net: '+3V3' }], [{ num: '1', name: 'VIN' }, { num: '2', name: 'GND' }, { num: '5', name: 'VOUT' }]);
  assert.equal(r.map[0].to, '2'); assert.equal(r.map[0].how, 'name');
});
