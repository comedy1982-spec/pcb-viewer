import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HSIS, EMC, HSIS_SAMPLES, SAMPLE_TC364, SAMPLE_BLDC, SAMPLE_MCU } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
const hsis = (key) => { const S = HSIS_SAMPLES[key]; return HSIS.fromRows([S.hsis.header].concat(S.hsis.rows), S.hsis.meta); };
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('trapezoid spectrum: flat, −20 dB/dec, −40 dB/dec', () => {
  const A = 12, f0 = 20e3, D = 0.5, tr = 50e-9;
  const f1 = 1 / (Math.PI * D / f0), f2 = 1 / (Math.PI * tr);
  close(EMC.trap(A, f0, D, tr, f1 / 10), 2 * A * D, 1e-9);
  const db = (x) => 20 * Math.log10(x);
  close(db(EMC.trap(A, f0, D, tr, f1 * 10)) - db(EMC.trap(A, f0, D, tr, f1 * 100)), 20, 0.01);
  close(db(EMC.trap(A, f0, D, tr, f2 * 2)) - db(EMC.trap(A, f0, D, tr, f2 * 20)), 40, 0.01);
});

test('via inductance and image-method coupling', () => {
  close(EMC.Lvia(1.6, 0.3), 0.2 * 1.6 * (Math.log(4 * 1.6 / 0.3) + 1), 1e-12); // ≈1.30 nH
  const near = EMC.coupling(0.2, 0.2, 0.25, 4.3), far = EMC.coupling(2, 0.2, 0.25, 4.3);
  assert.ok(near.Cm > far.Cm && near.Lm > far.Lm);
  close(near.Lm, 2e-7 * Math.log(Math.sqrt(0.04 + 0.16) / 0.2), 1e-15); // µ0/2π·ln(√(s²+4h²)/s)
});

test('TC364: DRV8313 commutation loop, phase nodes and missing HF bypass', () => {
  const B = board(SAMPLE_TC364), H = hsis('tc364'); HSIS.check(B, H, null, 'U1');
  const R = EMC.analyze(B, { H });
  assert.deepEqual([...R.ps.drivers], ['U3']);
  assert.deepEqual([...R.ps.switchNets].sort(), ['PH_U', 'PH_V', 'PH_W']);
  assert.equal(R.cfg.fsw, 20000);               // from the HSIS PWM timing
  assert.equal(R.ps.loops[0].cap, 'C12');       // nearest +12V/GND cap
  assert.ok(R.ps.Lbest > 5 && R.ps.Lbest < 30);
  assert.equal(R.ps.Vabs, 65);                  // DRV8313 abs max from the parts DB
  close(R.ps.dV, R.ps.Lbest * 1e-9 * 2 / 50e-9, 1e-9);
  close(R.ps.fring, 1 / (2 * Math.PI * Math.sqrt(R.ps.Lbest * 1e-9 * 300e-12)), 1);
  const ck = (it) => R.checks.find((c) => c.item === it);
  assert.equal(ck('+12V 고주파 바이패스').sev, 'warn');
  assert.ok(R.hs.C > 0 && R.hs.Icm > 0);
  // C_p = ε0·εr·A/d scales inversely with the TIM thickness
  const R2 = EMC.analyze(B, { H, cfg: { timT: 0.5 } });
  assert.ok(R2.hs.C > R.hs.C);
  // slower edges lower the high-frequency spectrum
  const slow = EMC.analyze(B, { H, cfg: { tr: 200, tf: 200 } });
  const at = (S, f) => S.spec.find((p) => p.f >= f);
  assert.ok(at(slow, 100e6).V < at(R, 100e6).V - 10);
  // shielding the harness cuts the common-mode field by the given attenuation
  const sh = EMC.analyze(B, { H, cfg: { shield: true, shieldDb: 20 } });
  close(at(R, 50e6).Ecm - at(sh, 50e6).Ecm, 20, 1e-6);
});

test('BLDC: PWM-to-fault crosstalk and plane slots are found', () => {
  const B = board(SAMPLE_BLDC), H = hsis('bldc'); HSIS.check(B, H, null, 'U1');
  const R = EMC.analyze(B, { H });
  assert.equal(R.cfg.fsw, 2000);
  assert.ok(R.xt.length >= 1 && R.xt.every((x) => x.V > 0 && x.Cm > 0));
  assert.ok(R.slots.length > 0);
});

test('MCU board: discrete FET gate loop and shared shunt source inductance', () => {
  const B = board(SAMPLE_MCU);
  const R = EMC.analyze(B, {});
  const g = R.ps.gates.find((x) => x.ref === 'Q1');
  assert.ok(g && g.Lg > 0 && g.Lcsi > 0);
  assert.equal(R.spec, null);
  assert.ok(R.checks.some((c) => /Q1/.test(c.item)));
});
