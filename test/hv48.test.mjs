// 48 V dual 3-phase controller: AMT49100 ×2, NVTFS6H850N, APM81815 48 → 12 V, CAN transceiver on the 12 V rail
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
function plan(L) { const { NEWPROJ } = L;const P = NEWPROJ.newPlan('48V Dual BLAC');const add = (t, p) => NEWPROJ.addBlock(P, t, p || {});
  add('pwr_in', { vin: 48, tvs: 1 });add('hvbuck', { vin: '+48V', vout: 12 });add('pmic', { vin: '+12V' });add('mcu', { part: 'TC364DP-64F300F' });add('xtal', {});
  add('can', { pick: 'TCAN1043HDRQ1', vsup: '+12V' });add('gdrv3', { i: 20, driver: 'AMT49100', fet: 'NVTFS6H850N', hall: 0 });add('gdrv3', { i: 20, driver: 'AMT49100', fet: 'NVTFS6H850N', hall: 0 });
  P.ifaceFix = true;return P; }
test('48 V dual BLAC plan: parts wired from the datasheet pin tables, 100 V parts on the DC link', () => {
  const L = load();const r = L.NEWPROJ.build(plan(L));const by = v => r.parts.filter(c => c.val === v);const net = (c, nm) => Object.entries(c.pinNames).filter(([, n]) => n === nm).map(([k]) => c.pins[k]);
  assert.equal(r.rails['+48V'].v, 48);assert.equal(r.rails['+12V'].by, '벅 모듈');assert.equal(r.rails['+3V3'].by, 'PMIC');
  // gate drivers: bridge supply, built-in buck, shared SPI with separate strobes
  const d = by('AMT49100');assert.equal(d.length, 2);d.forEach((c, i) => { const k = i ? 'PH2' : 'PH';
    assert.deepEqual(net(c, 'VBB'), ['+48V']);assert.deepEqual(net(c, 'VBRG'), ['+48V']);assert.deepEqual(net(c, 'LX'), [k + '_LX']);assert.deepEqual(net(c, 'VREG'), [k + '_VREG']);
    assert.deepEqual(net(c, 'SCK'), ['DRV_SCK']);assert.deepEqual(net(c, 'SDO'), ['DRV_SDO']);assert.deepEqual(net(c, 'STRn'), [k + '_STRN']);assert.deepEqual(net(c, 'GHA'), [k + '_U_HO']);assert.deepEqual(net(c, 'SA'), [k + '_U']);
    assert.deepEqual(net(c, 'CS1P'), [k + '_U_SNSP']);assert.equal(c.pins['49'], 'GND');assert.equal(c.pins['7'], undefined); }); // SAL / SBL / SCL stay open
  assert.equal(by('100µH').length, 2);assert.equal(by('PMEG10010ELR').length, 2);assert.ok(r.parts.some(c => c.val === '10µF' && Object.values(c.pins).includes('PH_VREG')));
  assert.ok(r.parts.some(c => /부트스트랩/.test(c.desc) && /Qg 38 nC \/ 12 V/.test(c.desc)), 'bootstrap from 2 × 19 nC at 12 V');
  assert.ok(!r.warn.some(w => /^인터페이스 ✕/.test(w)), r.warn.filter(w => /✕/.test(w)).join(' | '));
  // FETs: two in parallel per switch from the loss one 3.3 × 3.3 package can shed; S 1–3, G 4, D 5–8 + flag
  const q = by('NVTFS6H850N');assert.equal(q.length, 24);const hs = q.find(c => /U상 하이사이드/.test(c.desc));assert.equal(hs.pins['5'], '+48V');assert.equal(hs.pins['9'], '+48V');assert.equal(hs.pins['1'], 'PH_U');assert.match(hs.pins['4'], /^PH_U_HG/);assert.ok(hs.P <= 1);
  assert.ok(!r.warn.some(w => /내압 여유 부족/.test(w)));
  // 48 → 12 V module: 12 V by VS1 = VS2 = VCC, EN on VIN, BIAS on the output
  const u = by('APM81815')[0];assert.equal(u.pins['5'], '+48V');assert.equal(u.pins['7'], '+48V');assert.equal(u.pins['10'], 'HVB_VCC');assert.equal(u.pins['11'], 'HVB_VCC');assert.equal(u.pins['19'], '+12V');assert.equal(u.pins['21'], undefined);assert.equal(by('6.8µH').length, 1);
  const u5 = L.NEWPROJ.build((() => { const P = plan(L);P.blocks.find(b => b.type === 'hvbuck').params.vout = 5;P.blocks.find(b => b.type === 'pmic').params.vin = '+5V';return P; })()).parts.find(c => c.val === 'APM81815');assert.equal(u5.pins['10'], 'GND');assert.equal(u5.pins['11'], 'HVB_VCC');
  // PMIC and transceiver fed from 12 V, never from the link; no 24 V bus diode on a 48 V system
  const can = by('TCAN1043HDRQ1')[0];assert.ok(can, 'picked transceiver used');assert.deepEqual(net(can, 'VSUP'), ['+12V']);assert.ok(!r.parts.some(c => c.val === 'PESD1CAN'));
  const pm = r.parts.find(c => /TLF35584/.test(c.val));assert.ok(Object.values(pm.pins).includes('+12V') && !Object.values(pm.pins).includes('+48V'));
  // every capacitor on the link is a 100 V part (Murata voltage code 2A) or an electrolytic to be specified
  const link = r.parts.filter(c => /^C\d/.test(c.ref) && Object.values(c.pins).includes('+48V') && Object.values(c.pins).includes('GND'));assert.ok(link.length >= 8);link.forEach(c => assert.match(c.mpn, /72A\d{3}/, `${c.ref} ${c.val} ${c.mpn}`));
  assert.ok(!r.parts.some(c => /P04/.test(c.val)), 'no 40 V reverse-polarity FET');assert.ok(r.warn.some(w => /역접속 보호 없음/.test(w)));
  assert.equal(r.curr['+48V'], 40);assert.equal(r.curr.PH2_W, 20);
});
test('conn = ecu-io: an input ECU connector and one output ECU connector per motor block', () => {
  const L = load();const P = plan(L);P.blocks.find(b => b.type === 'pwr_in').params.conn = 'ecu-io';const r = L.NEWPROJ.build(P);
  const J = r.parts.filter(c => /^J/.test(c.ref));assert.deepEqual(J.slice(0, 3).map(c => c.ref + ' ' + c.val + ' ' + c.fp).join(' | '), 'J1 ECU-IN MX150-2x6-RA | J2 ECU-OUT1 MX150-2x10-RA | J3 ECU-OUT2 MX150-2x10-RA');
  assert.ok(!J.some(c => /^TERM|단자/.test(c.fp) || c.val === 'CAN' || c.val === '모터 상'), 'terminal blocks and the CAN header are gone');
  const cnt = (c, net) => Object.values(c.pins).filter(n => n === net).length;const [ji, j1, j2] = J;
  assert.equal(cnt(ji, '+48V'), 4);assert.equal(cnt(ji, 'GND'), 4);assert.equal(cnt(ji, 'CANH'), 1);assert.equal(cnt(ji, 'CANL'), 1); // 40 A at 12 A a contact
  ['U', 'V', 'W'].forEach(h => { assert.equal(cnt(j1, 'PH_' + h), 2);assert.equal(cnt(j2, 'PH2_' + h), 2); });
  // a contact pair is one column (inner + outer row), and outputs are spare columns apart
  const col = (c, net) => [...new Set(Object.entries(c.pins).filter(([, n]) => n === net).map(([k]) => (+k - 1) % 10))];
  const cu = col(j1, 'PH_U'), cv = col(j1, 'PH_V'), cw = col(j1, 'PH_W');assert.deepEqual([cu.length, cv.length, cw.length], [1, 1, 1]);assert.equal(Math.abs(cu[0] - cv[0]), 4);assert.equal(Math.abs(cv[0] - cw[0]), 4); // discrete FETs: one phase cell is four columns (14 mm) wide
  assert.ok(r.warn.some(w => /^ECU 커넥터: 입력 MX150 12핀/.test(w)));
  // the single-connector option and the default are untouched
  P.blocks.find(b => b.type === 'pwr_in').params.conn = 'sep';assert.ok(L.NEWPROJ.build(P).parts.some(c => c.val === '모터 상'));
});
