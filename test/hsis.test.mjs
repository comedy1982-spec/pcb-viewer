import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, HSIS, SAMPLE, SAMPLE_HSIS, SAMPLE_ARXML } = load();
const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE))));
const H = HSIS.fromRows([SAMPLE_HSIS.header].concat(SAMPLE_HSIS.rows), SAMPLE_HSIS.meta);
const AX = HSIS.parseARXML(SAMPLE_ARXML);
const R = HSIS.check(B, H, AX, 'U1');
const has = (code, id) => R.results.some(r => r.code === code && r.id === id);

test('column mapping finds every sample column', () => {
  assert.equal(H.items.length, 16);
  assert.equal(H.unmapped.length, 0);
  assert.equal(HSIS.pickMcu(B, H.items), 'U1');
});

test('CSV with English headers and a title row', () => {
  const rows = HSIS.csvRows('HSIS export,,\nID,Signal,Pin,Net\nX-1,LED,15,LED\n');
  const h = HSIS.fromRows(rows);
  assert.equal(h.items[0].pins, '15'); assert.equal(h.items[0].net, 'LED');
});

test('ARXML PortPin parsing', () => {
  assert.equal(AX.length, 11);
  const sda = AX.find(a => a.name === 'PortPin_I2C1_SDA');
  assert.equal(sda.id, '20'); assert.equal(sda.mode, 'PORT_PIN_MODE_I2C');
});

test('schematic checks', () => {
  assert.ok(has('PIN_NC', 'HSIS-006'));        // BOOT0 not connected on the board
  assert.ok(has('NET_MISSING', 'HSIS-016'));   // VBUS_MON not in the layout yet
  assert.ok(has('HW_PART_MISSING', 'HSIS-016'));
  assert.ok(has('PIN_NET', 'HSIS-010'));
  assert.ok(has('PULL', 'HSIS-010'));          // R4 4.7k to +3V3
  assert.ok(has('PULL', 'HSIS-005'));          // R1 10k to +3V3
});

test('software configuration checks', () => {
  assert.ok(has('SW_PIN', 'HSIS-011') && R.results.find(r => r.code === 'SW_PIN' && r.id === 'HSIS-011').sev === 'err');
  assert.ok(has('SW_INIT', 'HSIS-009'));
  assert.ok(R.results.some(r => r.code === 'SW_UNDOC' && /UART_TX/.test(r.msg)));
});

test('traceability', () => {
  assert.ok(has('TRACE_TEST', 'HSIS-010'));
  assert.ok(has('TRACE_REQ', 'HSIS-014'));
  const t = HSIS.trace(H);
  assert.equal(t.noReq.length, 1);
  assert.equal(R.status['HSIS-007'], 'ok');
  assert.equal(R.status['HSIS-011'], 'err');
});

test('each built-in board has its own HSIS; firmware is cross-checked against it', () => {
  const L = load();
  const { PCB, HSIS, FW, HSIS_SAMPLES } = L;
  for (const [k, spec, expect] of [['mcu', L.SAMPLE_MCU, ['TRACE_TEST', 'SW_INIT']], ['bldc', L.SAMPLE_BLDC, ['TRACE_REQ', 'SW_DIR']]]) {
    const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));
    const S = HSIS_SAMPLES[k];
    const H = HSIS.fromRows([S.hsis.header].concat(S.hsis.rows), S.hsis.meta);
    let r = HSIS.check(B, H, HSIS.parseARXML(S.arxml), 'U1');
    const u1 = B.byRef.U1, pins = {};
    u1.pads.forEach(p => { if (p.fn && /^P[A-K]\d+$/.test(p.fn)) pins[p.fn] = p.net || null; });
    r = HSIS.checkFw(H, FW.pinUsage(u1.fw, { pins, gnd: 'GND', vdd: 3.3 }), r);
    const bad = r.results.filter(x => x.sev === 'err' || x.sev === 'warn').map(x => x.code).sort();
    assert.deepEqual(bad.join(','), expect.slice().sort().join(','), `${k}: ${bad}`);
    assert.ok(r.results.some(x => x.code === 'FW_DIR' && x.sev === 'ok'));
    // changing the PWM frequency in firmware is caught against the HSIS timing column
    const fw2 = FW.setParam(u1.fw, 'PWM_FREQ_HZ', 777);
    const r2 = HSIS.checkFw(H, FW.pinUsage(fw2, { pins, gnd: 'GND', vdd: 3.3 }), HSIS.check(B, H, null, 'U1'));
    assert.ok(r2.results.some(x => x.code === 'FW_FREQ' && x.sev === 'warn'));
  }
});
