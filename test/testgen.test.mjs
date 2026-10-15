import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HSIS, PINREC, TESTGEN, HSIS_SAMPLES, SAMPLE_TC364, SAMPLE_MCU } = load();
const setup = (spec, key) => {
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec)))); const S = HSIS_SAMPLES[key];
  const H = HSIS.fromRows([S.hsis.header].concat(S.hsis.rows), S.hsis.meta); HSIS.check(B, H, null, 'U1'); return { B, H };
};

test('SWE.6 and SYS.4 cases are generated separately with unique IDs and traceability', () => {
  const { B, H } = setup(SAMPLE_TC364, 'tc364');
  PINREC.apply(B, H, PINREC.recommend(B, H, 'U1', { mode: 'keep' }));
  const G = TESTGEN.generate(B, H, 'U1');
  assert.ok(G.swqt.length > 40 && G.sysit.length > 40);
  assert.ok(G.swqt.every((c) => c.level === 'SWE.6' && c.id.startsWith('SWQT-')));
  assert.ok(G.sysit.every((c) => c.level === 'SYS.4' && c.id.startsWith('SYSIT-') && /^S[1-4]$/.test(c.stage)));
  const ids = G.swqt.concat(G.sysit).map((c) => c.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(G.swqt.concat(G.sysit).every((c) => c.steps.length && c.hsis));
  // every signal row with a SW role has a configuration case (SWE.6) and a signal-path case (SYS.4)
  const sw = H.items.filter((i) => PINREC.roleOf(i, null));
  sw.forEach((i) => {
    assert.ok(G.swqt.some((c) => c.hsis === i.id && c.kind === '설정·초기 상태'), i.id);
    assert.ok(G.sysit.some((c) => c.hsis === i.id && c.kind === '신호 경로'), i.id);
  });
  // SYS.4 integration order: power/clock/reset first, function chains last
  assert.equal(G.sysit[0].stage, 'S1'); assert.equal(G.sysit[G.sysit.length - 1].stage, 'S4');
  assert.ok(G.sysit.some((c) => c.kind === '기능 체인' && /U3/.test(c.title)));
  // ASIL B signals get SW error handling and HW fault injection
  const inw = H.items.find((i) => i.signal === 'IN_W');
  assert.ok(G.swqt.some((c) => c.hsis === inw.id && c.kind === '오류 처리'));
  assert.ok(G.sysit.some((c) => c.hsis === inw.id && c.kind === '결함 주입'));
  // register expectation from the pin DB (TC3xx IOCR) after the pin is assigned
  const cfg = G.swqt.find((c) => c.hsis === inw.id && c.kind === '설정·초기 상태');
  assert.match(cfg.steps[0].expected, /IOCR\d+\.PC\d+ = 0x11 \(ALT1 GTM_TOUT/);
  // checklists are complete for this example
  G.check.swqt.concat(G.check.sysit).forEach((r) => assert.equal(r.ok, r.total, r.title));
});

test('ADC expected raw values follow the HSIS scaling formula; STM32 config uses AF numbers', () => {
  const { B, H } = setup(SAMPLE_TC364, 'tc364');
  const G = TESTGEN.generate(B, H, 'U1');
  const adc = G.swqt.find((c) => c.signal === 'VBAT_MON' && c.kind === '아날로그 변환');
  // VBAT = ADC × 3.3 / 4095 × 5.545, 16.30 V → 3648
  assert.ok(adc.steps.some((s) => /16\.30 V/.test(s.action) && /원시값 3648/.test(s.expected)));
  const m = setup(SAMPLE_MCU, 'mcu'); const G2 = TESTGEN.generate(m.B, m.H, 'U1');
  const pwm = G2.swqt.find((c) => c.signal === 'MOTOR_PWM' && c.kind === '설정·초기 상태');
  assert.match(pwm.steps[0].expected, /MODER8 = 10b \(AF\), AFRH8 = AF2 \(TIM1_CH1\)/);
  const rows = TESTGEN.rows(G2.sysit, G2.stages); assert.equal(rows[0].length, TESTGEN.COLS.length);
});
