import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const plan = (L, drv) => { const { PRODUCTS, HWARCH } = L;const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  const P = HWARCH.toPlan(PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', fet: fq.options[0].label }, 'Dadu').arch).plan;
  P.blocks.find(b => b.type === 'gdrv3').params.driver = drv;return P; };

test('power sequencing / cranking: rail hold-up voltages, IC states while cranking, supervisor window, pin map', () => {
  const L = load();const { NEWPROJ } = L;const P = plan(L, 'DRV8334');const r = NEWPROJ.build(P);const S = r.pwrseq;assert.ok(S);
  const rail = (n) => S.rails.find(x => x.rail === n);
  // LM317 9 V hall supply needs ~2 V headroom: out of regulation inside the normal 9–16 V range
  assert.ok(rail('+9V').vbMin > 10.5 && rail('+9V').atLow < 8);assert.ok(S.findings.some(f => f.code === 'rail_low' && f.net === '+9V'));
  // +3V3 via buck 5 V → AMS1117 (1.3 V dropout): held down to ~5.5 V, lost at a 4.5 V crank
  assert.ok(rail('+3V3').vbMin > 5 && rail('+3V3').vbMin < 6);assert.ok(rail('+3V3').atCrank < 2.97);
  // P-FET reverse protection drop from the datasheet record
  assert.match(S.rev, /19 mΩ @ −4\.5 V/);
  const drv = S.cons.find(x => /DRV8334/.test(x.mpn));assert.equal(drv.crank, '로직 · SPI만 (게이트 구동 정지)');assert.equal(drv.vbStart != null, true);
  // TPS3823-33 VIT− min 2.86 V (record) under the TC364 3.3 V minimum 2.97 V
  assert.ok(S.findings.some(f => f.code === 'sup_window' && /2\.86/.test(f.msg)));
  // the supervisor block's pin numbers disagree with the TPS3823 datasheet / KiCad (pin 2 = GND, pin 5 = VDD)
  assert.ok(S.findings.some(f => f.code === 'pinmap' && /TPS3823/.test(f.msg) && /2번 회로 VDD \/ DS GND/.test(f.msg)));
  // reset-safe driver inputs: missing without the generator's pulls, fixed with them
  assert.ok(S.findings.some(f => f.code === 'seq_unsafe'));
  P.ifaceFix = true;assert.ok(!NEWPROJ.build(P).pwrseq.findings.some(f => f.code === 'seq_unsafe'));
  // a milder cranking requirement keeps the logic alive
  P.vcrank = 7;const S7 = NEWPROJ.build(P).pwrseq;assert.equal(S7.cons.find(x => x.what === 'MCU').crank, '동작');
});

test('guideline rule sch_pwrseq reads the sequencing result kept on a generated board', () => {
  const L = load();const { NEWPROJ, GUIDE, SCH } = L;const P = plan(L, 'A4911');P.ifaceFix = true;
  const B = NEWPROJ.toBoard(P, { place: false }).B;assert.ok(B.pwrseq);
  const g = GUIDE.evaluate(B, { scope: 'sch', sheets: SCH.build(B, null).sheets }).rules.find(x => x.key === 'sch_pwrseq');
  assert.equal(g.status, 'fail');assert.match(g.ev, /핀 배치/);
});
