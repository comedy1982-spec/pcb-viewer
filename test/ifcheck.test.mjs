import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const plan = (L, drv) => { const { PRODUCTS, HWARCH } = L;const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  const P = HWARCH.toPlan(PRODUCTS.apply(prof, { cur: '~10 A (소형 팬 · 펌프)', fet: fq.options[0].label }, 'Dadu').arch).plan;
  P.blocks.find(b => b.type === 'gdrv3').params.driver = drv;return P; };

test('interfaces between blocks: open-drain pull-ups and reset-safe pulls are found, and added when the generator fixes them', () => {
  const L = load();const { NEWPROJ, IFCHECK } = L;
  const P = plan(L, 'DRV8334');const r0 = NEWPROJ.build(P);
  const codes = r0.iface.findings.map(f => f.code + ':' + f.net);
  assert.ok(codes.includes('od_pullup:PH_SDO'), 'DRV8334 SDO is open drain (datasheet ROC)');
  assert.ok(codes.includes('default_float:PH_INH_U') && codes.includes('default_float:CAN_STB'));
  assert.equal(r0.iface.findings.find(f => f.net === 'PH_INH_U').pull.to, 'GND');
  P.ifaceFix = true;const r1 = NEWPROJ.build(P);
  assert.equal(r1.iface.findings.length, 0, JSON.stringify(r1.iface.findings.map(f => f.net)));
  const pu = r1.parts.find(c => /인터페이스 풀업/.test(c.desc) && Object.values(c.pins).includes('PH_SDO'));assert.ok(pu && Object.values(pu.pins).includes('+3V3'));
  const B = NEWPROJ.toBoard(Object.assign(plan(L, 'DRV8334'), { ifaceFix: true }), { place: false }).B;assert.equal(IFCHECK.run(B).findings.length, 0);
});

test('a 5 V push-pull output into a 3.3 V input is a level error', () => {
  const { IFCHECK } = load();
  const B = { comps: [
    { ref: 'U1', val: 'X5', pads: [{ n: '1', net: '+5V' }, { n: '2', net: 'GND' }, { n: '3', net: 'SIG' }] },
    { ref: 'U2', val: 'X3', pads: [{ n: '1', net: '+3V3' }, { n: '2', net: 'GND' }, { n: '3', net: 'SIG' }] }] };
  const lk = m => m === 'X5' ? { pins: [{ num: 1, name: 'VCC', type: 'power_in' }, { num: 2, name: 'GND', type: 'power_in' }, { num: 3, name: 'OUT', type: 'out' }] }
    : m === 'X3' ? { pins: [{ num: 1, name: 'VDD', type: 'power_in' }, { num: 2, name: 'GND', type: 'power_in' }, { num: 3, name: 'IN', type: 'in' }] } : null;
  const R = IFCHECK.run(B, { lookup: lk });assert.equal(R.findings[0].code, 'level_over');assert.equal(R.err, 1);
});

test('external connector signals get a 24 V-class ESD diode, and short-to-battery injection into the MCU is checked', () => {
  const L = load();const { NEWPROJ, IFCHECK } = L;
  const P = plan(L, 'A4911');P.blocks.find(b => b.type === 'pwr_in').params.conn = 'ecu';NEWPROJ.addBlock(P, 'spare', {});
  const r0 = NEWPROJ.build(P);const miss = r0.iface.prot.findings.filter(f => f.code === 'esd_missing').map(f => f.net);
  assert.ok(miss.includes('PH_HALL_A_IN') && miss.includes('SPARE_PWM_OUT') && !miss.includes('CANH'), miss.join(','));
  assert.ok(!r0.iface.prot.findings.some(f => f.code === 'stb_inject'), 'hall inputs have a clamp, spare PWM has 2.7 kΩ');
  P.ifaceFix = true;const r1 = NEWPROJ.build(P);
  assert.equal(r1.iface.prot.findings.filter(f => f.code === 'esd_missing').length, 0);
  assert.ok(r1.parts.some(c => c.val === 'PESD1CAN' && Object.values(c.pins).includes('PH_HALL_A_IN')));
  // a connector line straight into an MCU pin is an injection error
  const pins = Object.assign({}, r1.parts.find(c => /^J/.test(c.ref) && c.val === 'ECU').pins);
  const B = { parts: [{ ref: 'U9', val: 'TC364DP', desc: 'AURIX', pins: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, i === 0 ? 'XSIG' : null])) }, { ref: 'J9', val: 'EXT', desc: '외부', pins: { 1: 'XSIG', 2: 'GND' } }] };
  const R = IFCHECK.connProt(B, {});assert.ok(R.findings.some(f => f.code === 'stb_inject' && f.sev === 'err'));assert.ok(pins);
});
