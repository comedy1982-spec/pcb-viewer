import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HSIS, PINREC, TESTGEN, HSIS_SAMPLES, SAMPLE_TC364, SAMPLE_MCU } = load();
const setup = (spec, key) => {
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec)))); const S = HSIS_SAMPLES[key];
  const H = HSIS.fromRows([S.hsis.header].concat(S.hsis.rows), S.hsis.meta); HSIS.check(B, H, null, 'U1'); return { B, H };
};
const PHYS = /오실로스코프|멀티미터|파워 서플라이|전압 측정|파형|프로브|VIH|슬루/;

test('SWE.6 stays on the SW side, SYS.4 on physical measurement; IDs unique and traceable', () => {
  const { B, H } = setup(SAMPLE_TC364, 'tc364');
  PINREC.apply(B, H, PINREC.recommend(B, H, 'U1', { mode: 'keep' }));
  const G = TESTGEN.generate(B, H, 'U1');
  assert.ok(G.swqt.length > 40 && G.sysit.length > 40);
  assert.ok(G.swqt.every((c) => c.level === 'SWE.6' && c.id.startsWith('SWQT-') && /TRACE32/.test(c.tool)));
  assert.ok(G.swqt.every((c) => !PHYS.test(JSON.stringify([c.env, c.pre, c.steps, c.method]))), 'SWE.6 must not need physical instruments');
  assert.ok(G.sysit.every((c) => c.level === 'SYS.4' && /^S[1-4]$/.test(c.stage) && /오실로스코프/.test(c.tool)));
  const ids = G.swqt.concat(G.sysit).map((c) => c.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(G.swqt.concat(G.sysit).every((c) => c.steps.length && c.hsis && c.domain));
  const k = (L, sig) => G[L].filter((c) => c.signal === sig).map((c) => c.kind);
  // ADC: SYS.4 divider/RC path vs SWE.6 raw-value BVA, debounce, hysteresis
  assert.ok(k('sysit', 'VBAT_MON').includes('분압·RC 경로')); assert.ok(k('swqt', 'VBAT_MON').includes('ADC 수식·진단'));
  // PWM: SYS.4 waveform vs SWE.6 duty/clamping
  assert.ok(k('sysit', 'IN_W').includes('PWM 파형')); assert.ok(k('swqt', 'IN_W').includes('Duty 요청·Clamping'));
  // safety interrupt: SYS.4 FTTI physical delay vs SWE.6 safe-state machine/latch/DTC
  assert.ok(k('sysit', 'DRV_NFAULT').includes('FTTI 물리 지연')); assert.ok(k('swqt', 'DRV_NFAULT').includes('Safe State 전이'));
  // communication: physical layer vs error handling
  assert.ok(k('sysit', 'CAN_TX').includes('통신 물리 파형')); assert.ok(k('swqt', 'CAN_TX').includes('통신 오류 처리'));
  // board-level: watchdog/shutdown/resources (SWE.6) and power hold/WD reset/full-load run (SYS.4)
  ['워치독 피딩', 'Shutdown 시퀀스', '메모리 사용량', '스택', 'MPU 보호', 'CPU 부하'].forEach((x) => assert.ok(G.swqt.some((c) => c.kind === x), x));
  ['전원 유지', '워치독 리셋 파형', '풀로드 장기 시험'].forEach((x) => assert.ok(G.sysit.some((c) => c.kind === x), x));
  assert.equal(G.sysit[0].stage, 'S1'); assert.equal(G.sysit[G.sysit.length - 1].stage, 'S4');
  const cfg = G.swqt.find((c) => c.signal === 'IN_W' && c.kind === '설정·초기 상태');
  assert.match(cfg.steps[0].expected, /IOCR\d+\.PC\d+ = 0x11 \(ALT1 GTM_TOUT/);
  G.check.swqt.concat(G.check.sysit).forEach((r) => assert.equal(r.ok, r.total, r.title));
});

test('ADC boundary raw values come from the HSIS scaling formula; STM32 config uses AF numbers', () => {
  const { B, H } = setup(SAMPLE_TC364, 'tc364');
  const G = TESTGEN.generate(B, H, 'U1');
  const adc = G.swqt.find((c) => c.signal === 'VBAT_MON' && c.kind === 'ADC 수식·진단');
  // VBAT = ADC × 3.3 / 4095 × 5.545 → 16.30 V ≈ raw 3648
  assert.ok(adc.steps.some((s) => /3647 · 3648 · 3649/.test(s.action)));
  assert.ok(!adc.steps.some((s) => /-1/.test(s.action)));
  const m = setup(SAMPLE_MCU, 'mcu'); const G2 = TESTGEN.generate(m.B, m.H, 'U1');
  const pwm = G2.swqt.find((c) => c.signal === 'MOTOR_PWM' && c.kind === '설정·초기 상태');
  assert.match(pwm.steps[0].expected, /MODER8 = 10b \(AF\), AFRH8 = AF2 \(TIM1_CH1\)/);
  const rows = TESTGEN.rows(G2.sysit, G2.stages); assert.equal(rows[0].length, TESTGEN.COLS.length);
});
