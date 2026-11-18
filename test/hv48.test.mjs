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
test('block cohesion: each bridge channel keeps its driver and gate parts in its own rectangle above its FET cells', () => {
  const L = load();const { NEWPROJ, AUTOPLACE } = L;
  const mk = coh => { const P = plan(L);P.blocks.find(b => b.type === 'pwr_in').params.conn = 'ecu-io';P.board = { w: 160, h: 110 };P.pcb = { layers: 8 };P.strategy = 'compact';P.cohesion = coh;
    const { B } = NEWPROJ.toBoard(P, { place: false });B.copperLayers = 8;AUTOPLACE.place(B, { scratch: true, strategy: 'compact', seed: 1, effort: 0.5 });return B; };
  const ctr = c => [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2];
  // parts of one channel that sit nearer the other channel's centre, and the length of the gate-drive nets
  const stat = B => { const bo = B.zones.blockOf || Object.fromEntries(NEWPROJ.build(B.newPlan).parts.map(c => [c.ref, c.block]));const ch = [...new Set(Object.values(bo))].filter(b => /^gdrv3/.test(b));
    const cen = Object.fromEntries(ch.map(b => { const m = B.comps.filter(c => bo[c.ref] === b).map(ctr);return [b, [m.reduce((a, p) => a + p[0], 0) / m.length, m.reduce((a, p) => a + p[1], 0) / m.length]]; }));
    let mixed = 0;B.comps.forEach(c => { const b = bo[c.ref];if (!cen[b]) return;const p = ctr(c);const o = ch.find(x => x !== b);if (Math.hypot(p[0] - cen[o][0], p[1] - cen[o][1]) < Math.hypot(p[0] - cen[b][0], p[1] - cen[b][1])) mixed++; });
    const g = [];Object.keys(B.nets).filter(n => /_(HO|LO)$|_[HL]G_\d$/.test(n)).forEach(n => { const ps = [];B.comps.forEach(c => c.pads.forEach(p => { if (p.net === n) ps.push(p); }));if (ps.length > 1) g.push(Math.max(...ps.map(p => p.x)) - Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.y)) - Math.min(...ps.map(p => p.y))); });
    g.sort((a, b) => a - b);return { mixed, gate: g[g.length >> 1], n: g.length, bo }; };
  const B0 = mk(0), B1 = mk(1), B2 = mk(2);const s0 = stat(B0), s2 = stat(B2);
  assert.equal(B0.blockRects, null, 'plans without the flag place as before');assert.equal(B0.zones.groupOf[B0.comps.find(c => /TLF35584/.test(c.val)).ref], null);
  const R = B2.blockRects;assert.deepEqual(Object.keys(R).sort(), ['gdrv37', 'gdrv38']);assert.ok(R.gdrv37[2] <= R.gdrv38[0] + 2.5, 'the two channel rectangles sit side by side: ' + JSON.stringify(R));
  assert.equal(B2.zones.groupOf[B2.comps.find(c => /TLF35584/.test(c.val)).ref], 'power');
  // level 1 (new plans): the channel rectangles alone — the other blocks and their zones stay as they were
  assert.deepEqual(Object.keys(B1.blockRects).sort(), ['gdrv37', 'gdrv38']);assert.equal(B1.zones.groupOf[B1.comps.find(c => /TLF35584/.test(c.val)).ref], null);{ const s1 = stat(B1);assert.ok(s1.mixed < s0.mixed / 2, `level 1 mixed ${s0.mixed} → ${s1.mixed}`); }
  assert.equal(NEWPROJ.newPlan('x').cohesion, 1);
  // drivers inside their own channel
  B2.comps.filter(c => c.val === 'AMT49100').forEach(u => { const r = R[s2.bo[u.ref]], p = ctr(u);assert.ok(p[0] > r[0] - 8 && p[0] < r[2] + 8 && p[1] < r[3] + 8, `${u.ref} at ${p.map(v => v.toFixed(1))} outside ${r}`); });
  assert.equal(s2.n, 36);assert.ok(s2.mixed < s0.mixed / 2, `mixed parts ${s0.mixed} → ${s2.mixed}`);assert.ok(s2.gate < 0.8 * s0.gate, `gate net median ${s0.gate.toFixed(1)} → ${s2.gate.toFixed(1)} mm`);
});
test('48 V single-chip PMIC (A81481, assumed pin map): one part replaces the 48 → 12 V module and the 12 V PMIC', () => {
  const L = load();const { NEWPROJ } = L;const P = NEWPROJ.newPlan('48V A81481');const add = (t, p) => NEWPROJ.addBlock(P, t, p || {});
  add('pwr_in', { vin: 48, tvs: 1 });add('pmic48', { vin: '+48V' });add('mcu', { part: 'TC364DP-64F300F' });add('xtal', {});add('can', { pick: 'TCAN1043HDRQ1', vsup: '+12V' });
  add('gdrv3', { i: 20, driver: 'AMT49100', fet: 'NVTFS6H850N', hall: 0 });P.ifaceFix = true;
  const r = NEWPROJ.build(P);const by = v => r.parts.filter(c => c.val === v);const net = (c, nm) => Object.entries(c.pinNames).filter(([, n]) => n === nm).map(([k]) => c.pins[k]);
  assert.equal(by('APM81815').length, 0);assert.ok(!r.parts.some(c => /TLF35584/.test(c.val)));const u = by('A81481');assert.equal(u.length, 1);const c = u[0];
  ['+12V', '+3V3', '+5V', 'V5_AON', 'V5P1', 'V5P2'].forEach(n => assert.equal(r.rails[n].by, 'PMIC', n));assert.equal(r.rails['+12V'].v, 12.5);
  assert.deepEqual(net(c, 'VIN'), ['+48V', '+48V']);assert.deepEqual(net(c, 'VREG1'), ['+12V']);assert.deepEqual(net(c, 'VIN2'), ['+12V']);assert.deepEqual(net(c, 'VUC'), ['+3V3']);assert.deepEqual(net(c, 'NPOR'), ['PORST']);
  assert.deepEqual(net(c, 'VREG2'), net(c, 'VREGLDO'));assert.deepEqual(net(c, 'WDIN'), ['WDI']);assert.equal(c.pins['41'], 'GND');assert.equal(c.pins['38'], undefined);
  // both buck stages have an inductor, a bootstrap cap and output caps; the 48 V input caps are 100 V parts
  assert.equal(r.parts.filter(q => q.block === c.block && /^L/.test(q.ref)).length, 2);assert.equal(r.parts.filter(q => /A81481 벅 \d 부트스트랩/.test(q.desc)).length, 2);
  r.parts.filter(q => q.block === c.block && /^C/.test(q.ref) && Object.values(q.pins).includes('+48V')).forEach(q => assert.match(q.desc, /100 V/, q.ref));
  assert.deepEqual(net(by('TCAN1043HDRQ1')[0], 'VSUP'), ['+12V']);assert.deepEqual(net(by('TCAN1043HDRQ1')[0], 'VCC'), ['+5V']);
  assert.ok(r.warn.some(w => /A81481: 출시 전 부품/.test(w)), 'the assumption is stated');assert.ok(!r.warn.some(w => /^인터페이스 ✕|내압 여유 부족/.test(w)), r.warn.filter(w => /✕/.test(w)).join(' | '));
  const { B } = NEWPROJ.toBoard(P, { place: false });const f = B.comps.find(x => x.val === 'A81481');assert.equal(f.pads.length, 41);assert.ok(Math.abs((f.bb[2] - f.bb[0]) - 6.8) < 0.3, '6 × 6 mm body: ' + (f.bb[2] - f.bb[0]));
  assert.equal(B.zones.groupOf[f.ref], 'power');
});
