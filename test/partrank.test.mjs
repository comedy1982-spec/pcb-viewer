import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { HWARCH, PARTRANK, PRODUCTS } = load();
test('PARTRANK: every block of a rule-built diagram gets ranked candidates; unfit parts are flagged, not hidden', () => {
  const r = HWARCH.archFrom('12 V 차량 배터리, AURIX TC364, CAN-FD, DC 모터 10 A, 전류 온도 센싱, ASIL B');
  const ctx = { req: r.arch.req, vin: 12, asil: 'B', auto: true, pref: { price: 1, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null };
  const blocks = r.arch.blocks.filter(b => !b.ext && (b.impl || []).length);
  for (const b of blocks) { const R = PARTRANK.rank(b, ctx); assert.ok(R.rows.length >= 3, b.id + ' needs candidates'); assert.equal(R.rows[0].rank, 1); }
  const mcu = PARTRANK.rank(r.arch.blocks.find(b => b.id === 'mcu'), ctx);
  assert.ok(mcu.rows[0].asil, 'with ASIL B the first MCU candidate must support ASIL');
  const canx = PARTRANK.rank(r.arch.blocks.find(b => b.id === 'canx'), ctx);
  const classic = canx.rows.find(x => x.mpn === 'TJA1051T/3'); assert.ok(classic && !classic.ok && /FD/.test(classic.bad.join()));
  const drv = PARTRANK.rank(r.arch.blocks.find(b => b.id === 'drv'), ctx);
  assert.ok(drv.rows.every(x => x.spec), 'h-bridge candidates carry specs');
});
test('PARTRANK: price priority moves the cheap commercial part up; profile candidates come first', () => {
  const r = HWARCH.archFrom('5 V USB 입력, STM32, CAN, LED 2개');
  const reg = r.arch.blocks.find(b => b.id === 'reg');
  const base = PARTRANK.rank(reg, { req: r.arch.req, vin: 5, asil: 'QM', auto: false, pref: { price: 1, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null });
  const cheap = PARTRANK.rank(reg, { req: r.arch.req, vin: 5, asil: 'QM', auto: false, pref: { price: 2.5, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null });
  const pos = (R, m) => R.rows.findIndex(x => x.mpn === m);
  assert.ok(pos(cheap, 'AMS1117-3.3') <= pos(base, 'AMS1117-3.3'));
  const prof = PRODUCTS.detect('EPS 전동 조향 ECU'); const A = PRODUCTS.apply(prof, {}, 'EPS').arch;
  const sbc = PARTRANK.rank(A.blocks.find(b => b.id === 'sbc'), { req: A.req, vin: 12, asil: 'D', auto: true, pref: { price: 1, feat: 1, ext: 1 }, prof, lookup: () => null, priceOf: () => null });
  assert.equal(sbc.rows[0].src, 'profile'); assert.ok(/TLF35584|TPS65381|FS2600|L9396/.test(sbc.rows[0].mpn));
});
test('PARTRANK: Allegro A4911 carries datasheet pins and ranks with ASIL D gate drivers', () => {
  const { PARTLIB, KPINS } = load();
  const lib = PARTLIB.fromKpins(KPINS);
  const a = lib.find(p => p.mpn === 'A4911KJPTR-T-1');
  assert.ok(a && a.src === 'ds' && a.pins.length === 49 && a.pins[47].name === 'GHA');
  const r = HWARCH.archFrom('12 V 차량 배터리, AURIX TC364, BLDC 모터 3상 40 A, ASIL D');
  const b = r.arch.blocks.find(x => (x.impl || []).some(im => im.type === 'gdrv3'));
  if (!b) return;
  const R = PARTRANK.rank(b, { req: r.arch.req, vin: 12, asil: 'D', auto: true, pref: { price: 1, feat: 1, ext: 1 }, lookup: m => lib.find(p => p.mpn === m) || null, priceOf: () => null });
  const x = R.rows.find(y => y.mpn === 'A4911KJPTR-T-1');
  assert.ok(x && x.pinNote === '데이터시트' && /ASIL D/.test(x.why.join()));
  console.log(R.rows.slice(0, 6).map(y => y.rank + '.' + y.mpn + '(' + y.score + (y.pinNote ? ',' + y.pinNote : '') + ')').join(' '));
});
test('PARTRANK: MCU candidates span Infineon AURIX, NXP and TI; Ethernet requirement rules out MCUs without it', () => {
  const ms = new Set(PARTRANK.C.mcu.map(p => p.mfr));
  for (const m of ['Infineon', 'NXP', 'TI', 'ST']) assert.ok(ms.has(m), m);
  assert.ok(PARTRANK.C.mcu.filter(p => /^TC\d/.test(p.mpn)).length >= 6, 'TriCore family');
  const r = HWARCH.archFrom('12 V, 이더넷 게이트웨이, CAN-FD, ASIL B');
  const R = PARTRANK.rank(r.arch.blocks.find(b => b.id === 'mcu'), { req: r.arch.req, vin: 12, asil: 'B', auto: true, pref: { price: 1, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null });
  const k144 = R.rows.find(x => x.mpn === 'S32K144'); assert.ok(k144 && !k144.ok && /이더넷/.test(k144.bad.join()));
  assert.ok(R.rows[0].spec.feat.includes('eth'));
});
