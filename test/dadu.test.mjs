import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, PARTRANK } = load();
test('Dadu profile: 12 V BLDC, 9 V hall supply, PMIC, gate driver + 6 MOSFET, CAN-FD, TC364, PCB NTC — passes the readiness check', () => {
  const prof = PRODUCTS.detect('Dadu ECU 설계');
  assert.equal(prof.key, 'dadu');
  const R = PRODUCTS.apply(prof, { cur: '~40 A (펌프 · 블로어)' }, 'Dadu');
  assert.deepEqual(HWARCH.check(R.arch), []);
  const T = HWARCH.toPlan(R.arch);
  assert.deepEqual(T.unmapped, []);
  const types = T.plan.blocks.map(b => b.type);
  for (const t of ['pwr_in', 'mcu', 'can', 'gdrv3', 'ntc', 'supervisor']) assert.ok(types.includes(t), t);
  assert.ok(T.plan.blocks.some(b => b.type === 'ldo' && +b.params.vout === 9), '9 V rail');
  assert.equal(T.plan.blocks.find(b => b.type === 'mcu').params.part, 'TC364DP-64F300F');
  const B = NEWPROJ.build(T.plan);
  const lm = B.parts.find(p => p.val === 'LM317'); assert.ok(lm && lm.pins[2] === '+9V' && lm.pins[3] === '+12V');
  const r2 = B.parts.find(p => p.pins && p.pins[1] === lm.pins[1] && p.pins[2] === 'GND'); assert.equal(r2.val, '1.5kΩ');  // 1.25·(1+1500/240) = 9.06 V
  const J = B.parts.find(p => p.val === '홀'); assert.equal(J.pins[1], '+9V'); assert.ok(/_IN$/.test(J.pins[2]), 'hall input goes through the series resistor');
  assert.equal(B.parts.filter(p => p.val === 'BAT54S').length, 3);
  assert.ok(B.parts.some(p => /NTC/.test(p.val)));
  const hp = PARTRANK.rank(R.arch.blocks.find(b => b.id === 'hallps'), { req: R.req, vin: 12, asil: 'QM', auto: true, prof, pref: { price: 1, feat: 1, ext: 1 }, lookup: () => null, priceOf: () => null });
  assert.equal(hp.rows[0].mpn, 'TPS7B86-Q1');
  assert.ok(hp.rows.filter(r => r.spec.vout === 3.3).every(r => !r.ok), 'fixed 3.3 V LDOs flagged for the 9 V rail');
});
test('Dadu: 2-FET packages (Infineon half-bridge / dual) — pinout from the datasheets, 3 packages for the 6-bridge, clean placement', () => {
  const { PCBEDIT } = load();
  const prof = PRODUCTS.detect('Dadu');
  const opt = k => prof.questions.find(q => q.key === 'fet').options.find(o => o.label.startsWith(k)).label;
  // IAUC60N04S6N050H: 1 G_HS · 2,3 phase · 4 G_LS · 5,6 ground · 7,8 battery · pads 9 battery / 10 phase
  let R = PRODUCTS.apply(prof, { fet: opt('하프브리지'), cur: '~40 A (펌프 · 블로어)' }, 'Dadu');
  let B = NEWPROJ.build(HWARCH.toPlan(R.arch).plan);
  let Q = B.parts.filter(p => p.val === 'IAUC60N04S6N050H');
  assert.equal(Q.length, 3);
  const u = Q.find(q => q.pins[2] === 'PH_U');
  assert.deepEqual(u.pins, { 1: 'PH_U_HG', 2: 'PH_U', 3: 'PH_U', 4: 'PH_U_LG', 5: 'PH_U_SNS', 6: 'PH_U_SNS', 7: '+12V', 8: '+12V', 9: '+12V', 10: 'PH_U' });
  // IPG20N04S4L-07 dual: FET1 (S1=1, G1=2, D1=7,8,9) high side · FET2 (S2=3, G2=4, D2=5,6,10) low side
  R = PRODUCTS.apply(prof, { fet: opt('듀얼'), cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  const T = HWARCH.toPlan(R.arch);
  B = NEWPROJ.build(T.plan);
  Q = B.parts.filter(p => p.val === 'IPG20N04S4L-07');
  assert.equal(Q.length, 3);
  const v = Q.find(q => q.pins[1] === 'PH_V');
  assert.deepEqual(v.pins, { 1: 'PH_V', 2: 'PH_V_HG', 3: 'PH_V_SNS', 4: 'PH_V_LG', 5: 'PH_V', 6: 'PH_V', 7: '+12V', 8: '+12V', 9: '+12V', 10: 'PH_V' });
  const { B: C } = NEWPROJ.toBoard(T.plan, { seed: 1 });
  assert.equal(PCBEDIT.drc(C).filter(d => d.code === 'courtyard' || d.code === 'edge').length, 0);
});
test('Dadu with an Allegro A4911 driver: one LQFP-48-EP chip drives the 6 FETs — pins wired by name, internal amps replace INA181, SPI · 6 PWM · 3 ADC on the MCU; A4918 without a pin table falls back to IR2104', () => {
  const mk = drv => { const prof = PRODUCTS.detect('Dadu');const fq = prof.questions.find(q => q.key === 'fet');
    const plan = HWARCH.toPlan(PRODUCTS.apply(prof, { fet: fq.options[0].label, cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu').arch).plan;
    plan.blocks.find(b => b.type === 'gdrv3').params.driver = drv;return NEWPROJ.build(plan); };
  const r = mk('A4911');const U = r.parts.filter(p => p.val === 'A4911');
  assert.equal(U.length, 1);assert.equal(r.parts.filter(p => p.val === 'IR2104S').length, 0);assert.equal(r.parts.filter(p => /INA181/.test(p.val)).length, 0);
  const a = U[0];const by = n => Object.entries(a.pins).filter(([k]) => a.pinNames[k] === n).map(([, v]) => v);
  assert.deepEqual(by('GHA'), ['PH_U_HO']);assert.deepEqual(by('GLB'), ['PH_V_LO']);assert.deepEqual(by('SC'), ['PH_W']);assert.deepEqual(by('CA'), ['PH_U_VB']);
  assert.deepEqual(by('LSSA'), ['PH_U_LSS']);assert.deepEqual(by('CS1P'), ['PH_U_SNSP']);assert.deepEqual(by('CS1M'), ['PH_U_SNSM']);assert.deepEqual(by('VBB'), ['+12V']);assert.deepEqual(by('PAD'), ['GND']);
  assert.match(a.fp, /^QFP-48-EP/);
  for (const n of ['PH_INH_U', 'PH_INL_W', 'PH_SCK', 'PH_SDI', 'PH_SDO', 'PH_ISNS_V', 'PH_DIAG']) assert.ok(r.pinmap[n], n + ' on an MCU pin');
  assert.ok(r.parts.some(p => p.val === '470nF' && /차지펌프/.test(p.desc)));assert.ok(r.parts.some(p => p.val === '22µF' && /VREG/.test(p.desc)));
  // datasheet: CBOOT = 20 × QGATE / VBOOT — IAUC60N04S6N050H Qg 17 nC, VREG 8 V, ×1.5 → 68 nF; OOS read by the ADC
  assert.equal(r.parts.filter(p => /^부트스트랩 C[ABC]–S/.test(p.desc) && p.val === '68nF').length, 3);assert.ok(r.pinmap['PH_ISNS_OOS']);
  const r2 = mk('A4918');assert.equal(r2.parts.filter(p => p.val === 'IR2104S').length, 3);assert.ok((r2.warn || []).some(w => /A4918: 핀 표가 없어 IR2104/.test(w)));
});
test('input options: IGN (KL15) sense, UVLO on the buck EN (TPS54331 formula), load-dump TVS — from params or requirement text', () => {
  const prof = PRODUCTS.detect('Dadu');
  const R = PRODUCTS.apply(prof, { cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  let plan = HWARCH.toPlan(R.arch).plan;
  let B = NEWPROJ.build(plan);
  assert.ok(B.parts.some(c => c.val === '100kΩ' && c.pins[2] === 'BUCK_EN'), 'default: EN pull-up');
  assert.ok(!B.parts.some(c => c.pins[1] === 'IGN_IN'), 'default: no IGN');
  plan.req = '12 V 차량용, IGN(KL15) 입력, 저전압 차단 6 V, 로드덤프 보호';
  B = NEWPROJ.build(plan);
  assert.equal(plan.blocks.find(b => b.type === 'pwr_in').params.ign, 0, 'the plan itself is not changed');
  const r1 = B.parts.find(c => c.pins[1] === '+12V' && c.pins[2] === 'BUCK_EN'), r2 = B.parts.find(c => c.pins[1] === 'BUCK_EN' && c.pins[2] === 'GND');
  assert.equal(r1.val, '332kΩ'); assert.equal(r2.val, '68.1kΩ');  // TI example: 7 V start / 6 V stop
  assert.ok(B.parts.some(c => c.val === 'SMBJ26CA' && c.fp === 'SMB' && c.pins[2] === 'VIN_RAW'), 'bidirectional load-dump TVS ahead of reverse protection');
  assert.ok(B.parts.some(c => c.val === 'BAT54S' && c.pins[3] === 'IGN_DET'));
  assert.ok(B.assigned.some(a => a.net === 'IGN_DET'), 'IGN_DET gets an MCU pin');
  const pi = plan.blocks.find(b => b.type === 'pwr_in'); pi.params = Object.assign({}, pi.params, { uvlo: 3 }); plan.req = '';
  B = NEWPROJ.build(plan);
  assert.ok(B.warn.some(w => /3\.5 V 초과/.test(w)), 'stop voltage below the EN limit is refused');
});
test('safety mechanisms per block and safety goal (Dadu defaults): roles, A4911 / lockstep mechanisms, timing vs FTTI, gaps', () => {
  const { SGARCH, SAFEMECH } = load();
  const R = PRODUCTS.apply(PRODUCTS.detect('Dadu'), { cur: '~20 A (팬 · 소형 펌프)' }, 'Dadu');
  const A = R.arch; SGARCH.setGoals(A, SGARCH.defaults('dadu'));
  const M = SAFEMECH.map(A, NEWPROJ.build(HWARCH.toPlan(A).plan).parts);
  const role = id => M.blocks.find(b => b.id === id).role;
  assert.deepEqual(['hall', 'isense', 'ptemp', 'gate', 'inv', 'mcu', 'sbc', 'hallps', 'canx', 'pin'].map(role), ['pos', 'cur', 'temp', 'gate', 'inv', 'mcu', 'sbc', 'sps', 'comm', 'pin']);
  assert.equal(M.K.driver, 'A4911'); assert.ok(M.K.lockstep);
  const sg1 = M.sgs.find(g => g.id === 'SG1');
  const ids = id => sg1.blocks.find(b => b.id === id).mechs.map(m => m.id);
  assert.ok(ids('hall').includes('hall_code') && ids('hall').includes('hall_speed'), 'hall range + plausibility');
  assert.ok(ids('isense').includes('cur_sum') && ids('isense').includes('cur_vds'), 'current redundancy comparisons');
  assert.ok(ids('gate').includes('drv_spi') && ids('gate').includes('drv_en'));
  assert.ok(ids('mcu').includes('mcu_lock') && ids('mcu').includes('sw_pfm'));
  assert.ok(sg1.total != null && sg1.total <= sg1.ftti, 'detection + reaction within FTTI');
  assert.ok(sg1.issues.some(i => /Hall Sensor Supply/.test(i)), '9 V hall supply is not monitored yet');
  assert.ok(M.sgs.find(g => g.id === 'SG2').ok);
  assert.ok(/SG1/.test(SAFEMECH.text(M)) && /<table>/.test(SAFEMECH.html(M, { mode: 'block' })));
  assert.equal(SAFEMECH.aoaSg(M)[0][0], 'SG');
});
test('Dadu A4911 10 A / 40 A example snapshot restores: DRC 0, nothing left unconnected, peak-rated copper', () => {
  const L = load();const { BOARDSNAP, PCBEDIT } = L;const S = L.SNAP_DADU8D;const m = S.meta;
  const prof = PRODUCTS.detect(m.profile);const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[m.fet || 0].label;
  const R = PRODUCTS.apply(prof, ans, m.profile);const plan = HWARCH.toPlan(R.arch).plan;const g3 = plan.blocks.find(b => b.type === 'gdrv3');
  g3.params = Object.assign({}, g3.params, { driver: m.driver }, m.gdrv3);plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };plan.name = m.name;
  const { B } = NEWPROJ.toBoard(plan, { place: false });const r = BOARDSNAP.apply(B, S);
  assert.equal(r.missing.length, 0);assert.equal(PCBEDIT.drc(B).length, 0);assert.equal(PCBEDIT.ratsnest(B).length, 0);
  assert.ok(B.powerReport.nets.filter(n => n.width !== '직결').every(n => n.width >= n.need));assert.equal(B.powerReport.nets[0].need, 4.44);
  assert.ok((B.powerReport.viaChk || []).every(v => v.ok));
});
test('diagnostic thresholds from part tolerances (Dadu A4911 10 A / 40 A): EVA bands, recommended thresholds, findings', () => {
  const { DIAGTHR } = load();
  const R = PRODUCTS.apply(PRODUCTS.detect('Dadu'), { cur: '~10 A (소형 팬 · 펌프)' }, 'Dadu');const plan = HWARCH.toPlan(R.arch).plan;
  plan.blocks.filter(b => b.type === 'gdrv3').forEach(b => Object.assign(b.params, { driver: 'A4911', ipk: 40, tpk: 2 }));
  const pin = plan.blocks.find(b => b.type === 'pwr_in');pin.params.ign = 1;pin.params.uvlo = 'auto';
  const parts = NEWPROJ.build(plan).parts;const T = DIAGTHR.compute(parts, { I: 10, Ipk: 40, tpk: 2, ftti: 100 });
  const by = id => T.rows.find(r => r.mech === id);
  ['vbat_rng', 'ntc_derate', 'ntc_range', 'cur_range', 'cur_sum', 'cur_ocp', 'cur_vds', 'sbc_uv', 'sbc_wdt', 'pin_uvlo', 'pin_ign', 'drv_uv'].forEach(id => assert.ok(by(id), id));
  // worst-case corners: a ratio of two 1 % resistors spans about ±2 %
  const e = DIAGTHR.eva([{ nom: 100, lo: 99, hi: 101 }, { nom: 22, lo: 21.78, hi: 22.22 }], ([a, b]) => b / (a + b));assert.ok(e.hi / e.nom - 1 > 0.015 && e.hi / e.nom - 1 < 0.02 && e.rssHi < e.hi);
  assert.match(by('cur_ocp').thr, /OCT = 3/);                       // 1.2 V / (1 mΩ · 20) = 60 A nominal, minimum above the 40 A peak
  assert.match(by('cur_range').thr, /SW 과전류 4[4-6]\./);
  assert.ok(!by('sbc_wdt').ok, '1.1–2.3 s watchdog cannot act inside a 100 ms FTTI');
  assert.ok(!by('vbat_rng').ok && /16kΩ/.test(by('vbat_rng').advice), 'OV detection reaches the ADC full scale → smaller bottom resistor');
  assert.ok(!by('pin_ign').ok && /24kΩ/.test(by('pin_ign').advice), 'IGN on not guaranteed at 9 V → smaller top resistor');
  assert.ok(by('pin_uvlo').ok && /재시작 6\.4–7\.66 V/.test(by('pin_uvlo').detect));
  assert.equal(DIAGTHR.aoa(T)[0][0], '메커니즘');
});
test('ELD only (Dadu based): 12 V BAT/IGN/GND 3-pin input, A4911 on two legs as an H-bridge for a 7 A / 20 A solenoid, ELD 2-pin output, NTC only', () => {
  const { SGARCH, SAFEMECH, DIAGTHR } = load();
  const prof = PRODUCTS.detect('eld only라는 제품, dadu기반');
  assert.equal(prof.key, 'eld');
  const R = PRODUCTS.apply(prof, {}, 'ELD');
  assert.deepEqual(HWARCH.check(R.arch), []);
  const T = HWARCH.toPlan(R.arch);assert.deepEqual(T.unmapped, []);
  const types = T.plan.blocks.map(b => b.type);
  assert.ok(!types.includes('gdrv3') && types.includes('hbridge') && types.includes('ntc') && types.includes('can'));
  assert.ok(!R.arch.blocks.some(b => /hall/i.test(b.id)), 'no hall / sensor supply');
  const hb = T.plan.blocks.find(b => b.type === 'hbridge').params;assert.equal(+hb.i, 7);assert.equal(+hb.ipk, 20);assert.equal(hb.driver, 'A4911');
  const B = NEWPROJ.build(T.plan);
  const J = B.parts.filter(p => /^J/.test(p.ref));
  const jin = J.find(p => p.val === 'BAT/IGN/GND');assert.deepEqual(jin.pins, { 1: 'VIN_RAW', 2: 'IGN_IN', 3: 'GND' });
  assert.ok(!J.some(p => p.val === 'IGN'), 'IGN is on the 3-pin connector, no separate header');
  const jo = J.find(p => p.val === 'ELD');assert.equal(Object.keys(jo.pins).length, 2);assert.equal(jo.pinNames[1], 'ELD+');
  const u = B.parts.find(p => p.val === 'A4911');const pin = nm => u.pins[Object.keys(u.pinNames).find(k => u.pinNames[k] === nm)];
  assert.equal(pin('SA'), 'HB_A');assert.equal(pin('SB'), 'HB_B');assert.equal(pin('SC'), 'GND');assert.equal(pin('HC'), 'GND');assert.ok(!pin('GHC'), 'unused gate output open');
  assert.equal(B.parts.filter(p => /^Q/.test(p.ref) && p.lk !== 'batt').length, 4);
  assert.equal(B.parts.filter(p => /션트/.test(p.desc || '') && /mΩ/.test(p.val)).length, 2);
  assert.ok(!B.parts.some(p => /IR2104|INA181/.test(p.val)));
  const A = R.arch;SGARCH.setGoals(A, SGARCH.defaults('eld'));const M = SAFEMECH.map(A, B.parts);
  assert.equal(M.K.driver, 'A4911');assert.ok(!M.sgs.some(g => g.blocks.some(b => b.mechs.some(m => m.id === 'cur_sum'))));assert.ok(M.sgs.every(g => g.ok));
  const D = DIAGTHR.compute(B.parts, { I: 7, Ipk: 20, tpk: 2, ftti: 100 });const ids = D.rows.map(r => r.mech);
  ['cur_range', 'cur_ocp', 'cur_vds', 'ntc_derate', 'pin_ign'].forEach(id => assert.ok(ids.includes(id), id));assert.ok(!ids.includes('cur_sum'), 'no 3-phase sum on an H-bridge');
});
test('ELD only A4911 H-bridge example snapshot restores: DRC 0, nothing unconnected, copper and vias rated for 7 A / 20 A', () => {
  const L = load();const { BOARDSNAP, PCBEDIT } = L;const S = L.SNAP_ELD6;const m = S.meta;
  const prof = PRODUCTS.detect(m.profile);assert.equal(prof.key, 'eld');const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[m.fet || 0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };plan.name = m.name;
  const { B } = NEWPROJ.toBoard(plan, { place: false });const r = BOARDSNAP.apply(B, S);
  assert.equal(r.missing.length, 0);assert.equal(PCBEDIT.drc(B).length, 0);assert.equal(PCBEDIT.ratsnest(B).length, 0);
  assert.ok(B.powerReport.nets.filter(n => n.width !== '직결').every(n => n.width >= n.need));
  assert.ok((B.powerReport.viaChk || []).every(v => v.ok));
});
