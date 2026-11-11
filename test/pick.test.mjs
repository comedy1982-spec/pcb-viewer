import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { NEWPROJ, HWARCH, PCB, FPGEN, SCH, SCHEDIT } = load();

const plan = (type, pick, extra = {}) => {
  const P = NEWPROJ.newPlan('t');
  NEWPROJ.addBlock(P, 'pwr_in', type === 'pwr_in' ? { pick } : {}); NEWPROJ.addBlock(P, 'buck', { vout: 5 });
  NEWPROJ.addBlock(P, 'ldo', type === 'ldo' ? { vout: 3.3, pick } : { vout: 3.3 }); NEWPROJ.addBlock(P, 'mcu', {});
  if (!/^(pwr_in|ldo)$/.test(type)) NEWPROJ.addBlock(P, type, Object.assign({ pick }, extra));
  return P;
};

// a part picked in the system design is the part the circuit uses, wired by its datasheet pin names
test('picked parts: CAN · NTC · LDO · ideal diode · smart high-side switch go into the circuit', () => {
  const cases = [
    ['can', 'TCAN1043GDRQ1', { CAN_TX: 'TXD', CAN_RX: 'RXD', CANH: 'CANH', CANL: 'CANL', '+5V': 'VCC', '+3V3': 'VIO', CAN_STB: 'nSTB', CAN_EN: 'EN' }],
    ['can', 'MCP2542FD', { CAN_TX: 'TXD', CAN_RX: 'RXD', CANH: 'CANH', CANL: 'CANL', CAN_STB: 'STBY' }],
    ['ntc', 'NCU18XH103F60RB', null],
    ['ntc', 'TMP235-Q1', { '+3V3': 'VDD', GND: 'GND' }],
    ['ldo', 'TPS7B86-Q1', { '+3V3': 'OUT', GND: 'GND' }],
    ['pwr_in', 'LM74700-Q1', { VIN_GATE: 'GATE', IDC_VCAP: 'VCAP', GND: 'GND' }],
    ['pwr_in', 'IPD90P04P4L-04', { VIN_PG: 'G', VIN_RAW: 'D' }],
    ['hs_switch', 'BTS7008-2EPA', { SAFE_EN_IN: 'IN0', HS_IS: 'IS', HS_GND: 'GND' }],
  ];
  for (const [type, pick, expect] of cases) {
    const P = plan(type, pick);
    const { B } = NEWPROJ.toBoard(P, { place: true });
    const c = B.comps.find(x => String(x.mpn || '').toUpperCase().startsWith(pick.toUpperCase().slice(0, 8)));
    assert.ok(c, `${type}: ${pick} on the board`);
    assert.ok(c.pads.length >= 2 && c.pads.every(p => p.net || true), `${pick}: footprint ${c.fp}`);
    if (expect) for (const [net, name] of Object.entries(expect)) {
      const pad = c.pads.find(p => p.net === net && c.pn && String(c.pn[p.n] || '').toUpperCase().replace(/\s/g, '').startsWith(name.toUpperCase()));
      assert.ok(pad, `${pick}: ${name} on ${net} (pads ${c.pads.map(p => p.n + '=' + p.net + '/' + (c.pn && c.pn[p.n])).join(' ')})`);
    }
    // the generated schematic agrees with the board
    const d = SCH.build(B, null);
    assert.equal(SCHEDIT.annotate(d.sheets, B).changes.length, 0, `${pick}: schematic ↔ board`);
  }
  // the ideal-diode N-FET is in series: source on the connector side, drain on the rail
  const B = NEWPROJ.toBoard(plan('pwr_in', 'LM74700-Q1'), {}).B;
  const q = B.comps.find(c => c.mpn === 'IPD50N06S4L-12');
  assert.ok(q && q.pads.find(p => p.n === '3').net === 'VIN_RAW' && q.pads.find(p => p.n === '1').net === 'VIN_GATE');
  assert.ok(!B.comps.some(c => /SQD50P04|SS14/.test(c.mpn || '')), 'default reverse protection replaced');
});

test('picked parts: no confirmed pins or unknown pin roles → library part and a warning', () => {
  for (const [type, pick, re] of [['can', 'TJA1443AT', /TJA1443AT: 데이터시트로 확인된 핀 표가 없어/], ['hs_switch', 'TPS1HB16AQPWPRQ1', /ILIM/], ['ldo', 'LM317DCYR', /ADJ/]]) {
    const r = NEWPROJ.build(plan(type, pick));
    assert.ok(r.warn.some(w => re.test(w)), `${pick}: ${r.warn.join(' | ')}`);
    assert.ok(!r.parts.some(c => (c.mpn || '').startsWith(pick)), `${pick} not used`);
  }
});

test('system design: a block pick reaches its circuit block and the check stops calling it "recorded only"', () => {
  const A = HWARCH.archFrom('12 V 입력 · TC364 MCU · CAN-FD · NTC 온도 센서', 'T').arch;
  const can = A.blocks.find(b => /Transceiver/.test(b.label)), ntc = A.blocks.find(b => /Temp/.test(b.label));
  assert.ok(can && ntc, A.blocks.map(b => b.label + ':' + (b.impl || []).map(i => i.type)).join(', '));
  can.part = { mpn: 'TCAN1043GDRQ1' }; ntc.part = { mpn: 'NCU18XH103F60RB' };
  const parts = NEWPROJ.build(HWARCH.toPlan(A).plan).parts.map(c => c.mpn);
  assert.ok(parts.includes('TCAN1043GDRQ1') && parts.includes('NCU18XH103F60RB'));
  const I = HWARCH.check(A).filter(x => x.code === 'pinsNone');
  assert.equal(I.length, 0, I.map(x => x.msg).join(' | '));
});

test('footprints: exposed pad after the leads (HSOIC-8, HTSSOP-16, TSDSO-14, VSON-8)', () => {
  for (const [pkg, n, pads] of [['HSOIC-8', 9, 9], ['HTSSOP-16', 17, 17], ['PG-TSDSO-14', 15, 15], ['VSON-8', 9, 9], ['SOIC-8', 8, 8], ['SOT-23-6', 6, 6]]) {
    const fp = FPGEN.ensure(PCB, pkg, n); assert.ok(fp, pkg);
    assert.equal(PCB.FP[fp].pads.length, pads, `${pkg} → ${fp}`);
  }
});

test('DRV8334-Q1 as the 3-phase gate driver: every pin wired by name, datasheet external components', () => {
  const { PRODUCTS, HWARCH, NEWPROJ } = load();
  const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, { cur: '~20 A (팬 · 소형 펌프)', fet: fq.options[0].label }, 'Dadu').arch).plan;
  plan.blocks.find(b => b.type === 'gdrv3').params.driver = 'DRV8334';
  const B = NEWPROJ.toBoard(plan, { place: false }).B;const u = B.comps.find(c => c.val === 'DRV8334-Q1');
  assert.ok(u && u.pads.length === 49 && u.pads.every(p => p.net));
  const net = n => u.pads.find(p => p.n === n).net;
  assert.equal(net('31'), '+12V');assert.equal(net('35'), '+12V');assert.equal(net('38'), 'PH_U_HO');assert.equal(net('37'), 'PH_U');assert.equal(net('36'), 'PH_U_VB');assert.equal(net('40'), 'PH_U_LSS');
  assert.ok(!B.comps.some(c => /IR2104/.test(c.val)));
  const cap = (a, b) => B.comps.some(c => c.pads.length === 2 && [a, b].every(n => c.pads.some(p => p.net === n)) && /µF/.test(c.val));
  assert.ok(cap('PH_CPH', 'PH_CPL') && cap('PH_CPTH', 'PH_CPTL') && cap('PH_VCP', '+12V') && cap('PH_GVDD', 'GND') && cap('PH_U_VB', 'PH_U'));
});
