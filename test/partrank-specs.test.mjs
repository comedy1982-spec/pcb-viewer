import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PARTRANK, NEWPROJ } = load();
const find = (L, m) => L.find(p => p.mpn === m);

// candidate figures corrected against the datasheets (datasheets/db): they decide which parts the generator offers
test('part ranking: datasheet-checked LDO / buck figures and the external parts a switcher needs', () => {
  const C = PARTRANK.C;
  const t81 = find(C.ldo, 'TPS7B8133QDRVRQ1'); assert.equal(t81.spec.i, 0.15, 'TPS7B81-Q1 is a 150 mA LDO');
  const tlf = find(C.ldo, 'TLF4277-2LD'); assert.ok(tlf && tlf.spec.adj && tlf.spec.i === 0.3, 'TLF4277-2 is a 300 mA adjustable LDO');
  assert.ok(!find(C.buck, 'TLF4277-2LD'), 'TLF4277-2 is not a buck');
  const t54 = find(C.buck, 'TPS54331QDRQ1'); assert.equal(t54.spec.sync, 0); assert.ok(/비동기/.test(t54.note) && t54.ext.includes('캐치 쇼트키'));
  assert.equal(JSON.stringify(PARTRANK.extOf('SBC · VCC1 5 V 500 mA 벅(외부 인덕터) + VCC2 100 mA LDO')), JSON.stringify(['인덕터']));
  assert.equal(JSON.stringify(PARTRANK.extOf('150 mA LDO 3.3 V · 40 V 입력')), JSON.stringify([]));
  // a 200 mA 3.3 V rail no longer accepts the 150 mA TPS7B81
  const ldo = { id: 'L', label: 'LDO', impl: [{ type: 'ldo', params: { vout: 3.3, i: 0.2 } }] };
  const r = PARTRANK.rank(ldo, { vin: 12 }).rows.find(x => x.mpn === 'TPS7B8133QDRVRQ1');
  assert.ok(r && !r.ok && r.bad.some(b => /전류 0.15 A/.test(b)));
  // buck: the pin-compatible -Q1 swaps straight into the library block; other bucks show what they need around them
  const buck = { id: 'B', label: '벅', impl: [{ type: 'buck', params: { vout: 5, i: 1 } }] };
  const R = PARTRANK.rank(buck, { vin: 12 }).rows;
  assert.ok(find(R, 'TPS54331QDRQ1').why.some(w => /핀 호환/.test(w)));
  assert.ok(find(R, 'LMR33630AQRNXRQ1').why.some(w => /외부 인덕터/.test(w)));
  const P = NEWPROJ.newPlan('t'); ['pwr_in', 'buck'].forEach(t => NEWPROJ.addBlock(P, t, {}));
  P.blocks.find(b => b.type === 'buck').params.part = 'TPS54331QDRQ1';
  const parts = NEWPROJ.build(P).parts;
  assert.ok(parts.some(c => c.mpn === 'TPS54331QDRQ1') && parts.some(c => c.mpn === 'MBRA340T3G'), 'buck keeps its catch diode');
});

test('part candidates: orderable codes instead of family names, nonexistent numbers replaced', () => {
  const all = Object.values(PARTRANK.C).flat().map(p => p.mpn);
  for (const bad of ['DRV8353RS-Q1', 'TCAN1043-Q1', 'GD3000', 'A4964', 'TPS1H100-Q1', 'MSPM0G3507-Q1']) assert.ok(!all.includes(bad), `${bad} is not an orderable code`);
  const drv = Object.values(PARTRANK.C).flat().find(p => p.mpn === 'DRV8343SPHPRQ1');
  assert.ok(drv && drv.family === 'DRV8353RS-Q1' && drv.spec.pkg === 'HTQFP-48' && drv.spec.v === 60);
  assert.ok(Object.values(PARTRANK.C).flat().some(p => p.mpn === 'MC33GD3000EPR2' && p.spec.pkg === 'QFN-56'));
});
