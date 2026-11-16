import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const arch = (L) => { const { PRODUCTS } = L;const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  return PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', fet: fq.options[0].label }, 'Dadu').arch; };
const on = (r, net) => r.parts.filter(c => Object.values(c.pins).includes(net));

test('parts picked in the system diagram become the circuit: TLF35584 PMIC, TPS7B86 9 V LDO, TJA1443 CAN transceiver', () => {
  const L = load();const { HWARCH, NEWPROJ } = L;const A = arch(L);const set = (id, mpn) => { A.blocks.find(b => b.id === id).part = { mpn }; };
  set('sbc', 'TLF35584QVVS2');set('hallps', 'TPS7B86-Q1');set('canx', 'TJA1443AT');set('inv', 'IAUC60N04S6N050H');
  // the diagram check has nothing left to say about these four parts
  assert.equal(HWARCH.check(A).filter(x => /TLF35584|TPS7B86|TJA1443|IAUC60/.test(x.msg)).length, 0, HWARCH.checkText(HWARCH.check(A)));
  const T = HWARCH.toPlan(A);assert.equal(T.plan.blocks.map(b => b.type).slice(0, 3).join(','), 'pwr_in,pmic,ldo');const r = NEWPROJ.build(T.plan);
  // the board builds with the 48-lead QFN (+ cooling tab) and the 14-lead SOIC
  const B = NEWPROJ.toBoard(JSON.parse(JSON.stringify(T.plan)), { place: false }).B;assert.equal(B.comps.find(c => /TLF35584/.test(c.val)).pads.length, 49);assert.equal(B.comps.find(c => /TJA1443/.test(c.val)).pads.length, 14);
  // PMIC: one IC replaces buck / LDOs / reset IC, makes +3V3 (µC) and +5V (communication), resets the MCU on PORST, SPI + watchdog on MCU pins
  const u = r.parts.find(c => c.mpn === 'TLF35584QVVS2');assert.ok(u);assert.ok(!r.parts.some(c => /TPS3823|AMS1117|TPS54331/.test(c.mpn || '')));
  assert.equal(u.pins['30'], '+3V3');assert.equal(u.pins['31'], '+5V');assert.equal(u.pins['17'], 'PORST');assert.equal(u.pins['45'], '+12V');assert.equal(u.pins['42'], 'PMIC_SW');assert.equal(u.pins['37'], u.pins['38']);
  ['1', '3', '22', '23', '25', '27', '40', '41', '47', '48', '49'].forEach(n => assert.equal(u.pins[n], 'GND', 'pin ' + n));assert.equal(u.pins['46'], undefined);assert.equal(u.pins['24'], undefined);
  assert.ok(on(r, 'PORST').some(c => /TC364/.test(c.val)));
  const l = r.parts.find(c => c.ref[0] === 'L' && c.pins['1'] === 'PMIC_SW');assert.equal(l.val, '4.7µH');assert.equal(l.pins['2'], u.pins['37']);
  assert.equal(on(r, 'VSTBY').filter(c => c.ref[0] === 'C').length, 2);
  ['PMIC_SCL', 'PMIC_SDI', 'PMIC_SDO', 'PMIC_SCS', 'PMIC_INT', 'PMIC_ERR', 'WDI'].forEach(n => assert.ok(r.pinmap[n], n + ' on an MCU pin'));
  // data sheet: synchronous step-down (no catch-diode warning), unused WAK / ENA to ground, VCI open, tracker and standby caps inside their ranges
  assert.ok(!r.warn.some(w => /환류 다이오드/.test(w)));assert.equal(u.pins['4'], 'GND');assert.equal(u.pins['3'], 'GND');assert.equal(u.pins['26'], undefined);assert.ok(!r.parts.some(c => Object.values(c.pins).includes('PMIC_WAK')));
  ['PMIC_QT1', 'PMIC_QT2'].forEach(n => assert.equal(on(r, n).filter(c => c.ref[0] === 'C' && c.val === '2.2µF').length, 1, n));
  // its rails hold down to the PMIC's 6 V minimum supply (plus the input path)
  const rail = r.pwrseq.rails.find(x => x.rail === '+3V3');assert.equal(rail.kind, 'PMIC');assert.ok(rail.vbMin >= 6 && rail.vbMin < 6.5);
  // 9 V hall supply: TPS7B86 adjustable with a 0.65 V feedback divider instead of the LM317
  const h = r.parts.find(c => /TPS7B86/.test(c.mpn || ''));assert.ok(h);assert.ok(!r.parts.some(c => /LM317/.test(c.mpn || '')));assert.equal(h.pins['1'], '+9V');assert.equal(h.pins['8'], '+12V');assert.equal(h.pins['7'], '+12V');
  const fb = h.pins['2'];const top = r.parts.find(c => c.ref[0] === 'R' && c.pins['1'] === '+9V' && c.pins['2'] === fb), bot = r.parts.find(c => c.ref[0] === 'R' && c.pins['1'] === fb && c.pins['2'] === 'GND');
  assert.equal(top.val, '127kΩ');assert.equal(bot.val, '10kΩ');assert.ok(Math.abs(0.65 * (1 + 127 / 10) - 9) < 0.15);
  assert.ok(r.pwrseq.rails.find(x => x.rail === '+9V').vbMin < 10);
  // CAN: 14-pin TJA1443AT — VBAT on the battery rail, EN / STB_N pulled down, WAKE tied off
  const c = r.parts.find(x => x.mpn === 'TJA1443AT');assert.ok(c);assert.equal(c.fp, 'SOIC-14');assert.equal([c.pins['1'], c.pins['4'], c.pins['12'], c.pins['13'], c.pins['3'], c.pins['5'], c.pins['10']].join(','), 'CAN_TX,CAN_RX,CANL,CANH,+5V,+3V3,+12V');
  assert.equal(c.pins['11'], undefined);assert.equal(c.pins['7'], undefined);
  ['CAN_EN', 'CAN_STB', 'CAN_WAKE'].forEach(n => assert.ok(on(r, n).some(x => x.ref[0] === 'R' && x.pins['2'] === 'GND'), n + ' pull-down'));
  assert.ok(r.pwrseq.cons.some(x => /TJA1443/.test(x.mpn) && x.net === '+5V' && x.min === 4.5));
});

test('the reset IC drives the MCU reset pin: PORST on AURIX for new plans, the recorded net on plans saved before the fix', () => {
  const L = load();const { HWARCH, NEWPROJ } = L;const P = HWARCH.toPlan(arch(L)).plan;assert.equal(P.rstFix, true);
  const r = NEWPROJ.build(P);const s = r.parts.find(c => /TPS3823/.test(c.mpn || ''));assert.equal(s.pins['1'], 'PORST');assert.ok(on(r, 'PORST').some(c => /TC364/.test(c.val)));
  P.rstFix = false;const r0 = NEWPROJ.build(P);assert.equal(r0.parts.find(c => /TPS3823/.test(c.mpn || '')).pins['1'], 'NRST');
});
