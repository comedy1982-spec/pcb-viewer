import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HSIS, PINREC, MCAL, MCU_PINS, HSIS_SAMPLES, SAMPLE_TC364, SAMPLE_BLDC } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
const hsis = (key) => { const S = HSIS_SAMPLES[key]; return HSIS.fromRows([S.hsis.header].concat(S.hsis.rows), S.hsis.meta); };

test('pin-function DB follows the datasheets', () => {
  const tc = MCU_PINS.find('TC364DP-64F300F'), st = MCU_PINS.find('STM32F042K6U6');
  assert.equal(tc.pins[1].port, 'P02.0');
  assert.ok(tc.pins[1].f.some(([s, f]) => s === 'ALT5' && f === 'CAN00_TXD'));
  assert.ok(tc.pins[2].f.some(([s, f]) => s === 'IN' && f === 'CAN00_RXDA'));
  assert.ok(tc.pins[8].f.some(([s, f]) => s === 'ALT3' && f === 'QSPI3_SCLK'));
  assert.equal(tc.pins[51].name, 'AN0'); assert.ok(tc.pins[51].analogOnly);
  assert.ok(tc.pins[88].reserved && tc.pins[80].supply);
  assert.ok(st.pins[18].f.some(([s, f]) => s === 'AF2' && f === 'TIM1_CH1'));
  assert.ok(st.pins[15].f.some(([s, f]) => s === 'ANALOG' && f === 'ADC_IN9'));
  assert.ok(st.pins[23].reserved);
});

test('Hungarian matching finds the optimum', () => {
  const a = PINREC.hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]);
  assert.deepEqual([...a], [1, 0, 2]);
});

test('TC364: keep mode fills empty pins and fixes the analog-only PWM pin', () => {
  const B = board(SAMPLE_TC364), H = hsis('tc364'); HSIS.check(B, H, null, 'U1');
  const R = PINREC.recommend(B, H, 'U1', { mode: 'keep' });
  assert.equal(R.sum.none, 0);
  const by = (s) => R.recs.find((r) => r.signal === s);
  assert.equal(by('IN_W').status, 'change'); assert.match(by('IN_W').curCheck.why, /PWM/);
  assert.equal(by('CAN_TX').status, 'keep'); assert.equal(by('CAN_TX').rec.inst, 'CAN00');
  // one pin per signal, nothing on supply/debug pins
  const pins = R.recs.map((r) => r.rec.pin);
  assert.equal(new Set(pins).size, pins.length);
  pins.forEach((n) => { const p = R.db.pins[n]; assert.ok(!p.supply && !p.reserved, n); });
  // bus signals share one peripheral instance; hall inputs share one GTM TIM with distinct channels
  const inst = (re) => new Set(R.recs.filter((r) => re.test(r.signal)).map((r) => r.rec.inst));
  assert.equal(inst(/^FLASH_(SCLK|MOSI|MISO)$/).size, 1);
  assert.equal(inst(/^DBG_/).size, 1);
  const halls = R.recs.filter((r) => /^HALL/.test(r.signal));
  assert.equal(new Set(halls.map((r) => r.rec.inst)).size, 1);
  assert.equal(new Set(halls.map((r) => r.rec.ch)).size, 3);
  // every recommended function really belongs to the pin
  R.recs.forEach((r) => { if (r.rec.sig !== 'GPIO') assert.ok(R.db.pins[r.rec.pin].f.some(([, f]) => f === r.rec.sig), r.signal); });
  assert.equal(by('DRV_NFAULT').rec.sig.startsWith('SCU_E_REQ'), true);
});

test('TC364: re-plan mode keeps CAN TX/RX on one node', () => {
  const B = board(SAMPLE_TC364), H = hsis('tc364'); HSIS.check(B, H, null, 'U1');
  const R = PINREC.recommend(B, H, 'U1', { mode: 'all' });
  const tx = R.recs.find((r) => r.signal === 'CAN_TX'), rx = R.recs.find((r) => r.signal === 'CAN_RX');
  assert.equal(tx.rec.inst, rx.rec.inst);
  assert.ok(R.recs.every((r) => r.rec));
});

test('TC364: apply → board nets, clean HSIS check, MCAL round trip', () => {
  const B = board(SAMPLE_TC364), H = hsis('tc364'); HSIS.check(B, H, null, 'U1');
  const R = PINREC.recommend(B, H, 'U1', { mode: 'keep' });
  const changed = PINREC.apply(B, H, R);
  assert.equal(changed.length, 19);
  const inw = H.items.find((i) => i.signal === 'IN_W');
  const pad = B.byRef.U1.pads.find((p) => p.n === inw.pins);
  assert.equal(pad.net, 'IN_W'); assert.ok(B.nets.IN_W.pads.some((p) => p.ref === 'U3'));
  assert.equal(B.byRef.U1.pads.find((p) => p.n === '45').net, null);
  const G = MCAL.generate(B, H, 'U1');
  assert.equal(G.model.warn.length, 0);
  const names = G.files.map((f) => f.name);
  ['Port_Cfg.h', 'Port_PBcfg.c', 'Dio_Cfg.h', 'Pwm_PBcfg.c', 'Adc_Cfg.h', 'Icu_Cfg.h', 'Spi_Cfg.h', 'Can_Cfg.h'].forEach((n) => assert.ok(names.includes(n), n));
  assert.ok(!G.files.some((f) => f.kind === 'hal'));
  const ax = HSIS.parseARXML(G.files[0].text);
  assert.equal(ax.length, 21); // every port pin except the dedicated AN0
  const res = HSIS.check(B, H, ax, 'U1');
  assert.equal(res.results.filter((r) => r.sev === "err" || (/^SW/.test(r.code) && r.sev === "warn")).map((r) => r.code).join(), "");
  const w = G.model.pins.find((x) => x.sig === 'IN_W');
  assert.equal(MCAL.aurixPC(w), 0x11);
  const can = G.model.pins.find((x) => x.sig === 'CAN_TX');
  assert.equal(MCAL.aurixPC(can), 0x15);
  assert.match(G.files.find((f) => f.name === 'Can_Cfg.h').text, /RXSEL = A/);
  for (const m of ['Port', 'Dio', 'Pwm', 'Adc', 'Icu', 'Spi', 'Can']) assert.match(G.files[0].text, new RegExp(`<SHORT-NAME>${m}</SHORT-NAME>`));
});

test('STM32 BLDC: existing pins stay, HAL/LL use the datasheet AF numbers', () => {
  const B = board(SAMPLE_BLDC), H = hsis('bldc'); HSIS.check(B, H, null, 'U1');
  const R = PINREC.recommend(B, H, 'U1', { mode: 'keep' });
  assert.equal(R.sum.keep, R.recs.length);
  const G = MCAL.generate(B, H, 'U1');
  const hal = G.files.find((f) => f.name === 'mcal_hal_init.c').text;
  assert.match(hal, /GPIO_AF2_TIM1/); assert.match(hal, /TIM_CHANNEL_4/); assert.match(hal, /__HAL_TIM_MOE_ENABLE/);
  const pa = G.ports.find((p) => p.name === 'GPIOA');
  assert.equal((pa.moder >> 16) & 3, 2); // PA8 alternate function
  assert.equal(pa.afr[1] & 0xf, 2);      // PA8 AF2
  assert.equal((pa.moder >> 8) & 3, 1);  // PA4 output (LED)
});
