import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { SAFETY, HWARCH, NEWPROJ, PCB } = load();

test('safety: levels, parsing and recommended mechanisms per level', () => {
  assert.equal(SAFETY.parseLevel('차량용 12V, ASIL B 요구'), 'B'); assert.equal(SAFETY.parseLevel('SIL 3'), 'D'); assert.equal(SAFETY.parseLevel('실내 QM'), 'QM'); assert.equal(SAFETY.parseLevel('아무것도'), null);
  const A = HWARCH.blank('t'); HWARCH.addBlock(A, 'ctrl', 'Main MCU'); HWARCH.addBlock(A, 'power', 'LDO 3.3 V'); HWARCH.addBlock(A, 'io', 'Gate Driver', { feats: ['3상 브리지 구동'] });
  A.safety.level = 'B';
  const M = SAFETY.mechanisms(A);
  assert.ok(M.some(m => m.id === 'wdt_ext') && !M.some(m => m.id === 'sbc'));
  assert.ok(M.every(m => !m.present));
  const added = SAFETY.apply(A, HWARCH, 'all');
  assert.ok(added.length >= 3);
  assert.ok(A.blocks.some(b => b.id === 'sm_uv' && b.impl[0].type === 'supervisor'));
  assert.ok(A.links.some(l => l.kind === 'safe'));
  const M2 = SAFETY.mechanisms(A); assert.ok(M2.filter(m => !m.sw).every(m => m.present));
  assert.equal(SAFETY.apply(A, HWARCH, 'all').length, 0);
  assert.ok(SAFETY.archText(A).includes('ASIL B'));
});

test('safety: FFI boundaries and per-block levels in the diagram', () => {
  const A = HWARCH.blank('t'); const m = HWARCH.addBlock(A, 'ctrl', 'MCU'); const d = HWARCH.addBlock(A, 'io', 'Debug UART', { asil: 'QM' }); A.safety.level = 'C'; HWARCH.link(A, m.id, d.id, 'UART');
  const F = SAFETY.boundaries(A); assert.equal(F.length, 1); assert.equal(F[0].from, 'C');
  const svg = HWARCH.svg(A); assert.ok(svg.includes('ASIL C') && svg.includes('FFI'));
  assert.ok(HWARCH.text(A).includes('[기능 안전]'));
});

test('safety: circuit checks and FMEDA on a generated board with supervisor + hs_switch', () => {
  const P = NEWPROJ.newPlan('t'); ['pwr_in', 'ldo', 'mcu', 'dcmotor'].forEach(t => NEWPROJ.addBlock(P, t, {}));
  const B0 = NEWPROJ.toBoard(P, { place: false }).B;
  const R0 = SAFETY.circuitChecks(B0, { level: 'B' });
  const by = id => R0.checks.find(c => c.id === id);
  assert.equal(by('supervisor').sev, 'err'); assert.equal(by('wdt').sev, 'err'); assert.equal(by('revpol').sev, 'ok'); assert.equal(by('tvs').sev, 'ok'); assert.equal(by('cutoff2').sev, 'na');
  NEWPROJ.addBlock(P, 'supervisor', {}); NEWPROJ.addBlock(P, 'hs_switch', {});
  const B1 = NEWPROJ.toBoard(P, { place: false }).B;
  const R1 = SAFETY.circuitChecks(B1, { level: 'C' });
  const by1 = id => R1.checks.find(c => c.id === id);
  assert.equal(by1('supervisor').sev, 'ok'); assert.equal(by1('wdt').sev, 'ok'); assert.equal(by1('cutoff2').sev, 'ok');
  const F0 = SAFETY.fmeda(B0, { level: 'B' }), F1 = SAFETY.fmeda(B1, { level: 'B' });
  assert.ok(F1.spfm > F0.spfm, `${F1.spfm} > ${F0.spfm}`); assert.ok(F1.residual < F0.residual);
  assert.ok(SAFETY.fmedaAoa(F1).length > 5); assert.ok(SAFETY.circuitText(B1, { level: 'B' }).includes('SPFM'));
});

test('safety: part qualification and the ASIL part policy in the circuit library', () => {
  assert.equal(SAFETY.partKind('R'), 'passive');
  const P = NEWPROJ.newPlan('t'); ['pwr_in', 'ldo', 'mcu', 'dcmotor', 'supervisor'].forEach(t => NEWPROJ.addBlock(P, t, {}));
  const B0 = NEWPROJ.toBoard(P, { place: false }).B;
  const Q0 = SAFETY.parts(B0, { level: 'B' });
  assert.ok(Q0.dropIn.some(r => r.ref === 'U1' && /TLV1117/.test(r.alt)), 'AMS1117 gets a drop-in');
  assert.ok(Q0.manual.some(r => /STM32/.test(r.mpn) && r.hint));
  P.asil = 'B';
  const B1 = NEWPROJ.toBoard(P, { place: false }).B;
  assert.ok(B1.comps.some(c => c.mpn === 'TLV1117LV33QDCYRQ1') && B1.comps.some(c => c.mpn === 'TPS3823-33QDBVRQ1'));
  const Q1 = SAFETY.parts(B1, { level: 'B' });
  assert.ok(Q1.bad.length < Q0.bad.length && Q1.dropIn.length === 0);
  const F = SAFETY.fmeda(B1, { level: 'B' }); assert.ok(F.rows.some(r => r.fitSrc === '공급사'));
  assert.ok(SAFETY.partsText(B1, { level: 'B' }).includes('등급 충족'));
});

test('part block: a library record becomes a part in the plan with power/ground and bus pins wired', () => {
  const P = NEWPROJ.newPlan('t'); ['pwr_in', 'ldo', 'mcu'].forEach(t => NEWPROJ.addBlock(P, t, {}));
  NEWPROJ.addBlock(P, 'part', { mpn: 'TLE9251VSJ' });
  const r = NEWPROJ.build(P);
  const u = r.parts.find(c => c.mpn === 'TLE9251VSJ'); assert.ok(u, 'part placed'); assert.equal(u.fp, 'SOIC-8');
  assert.equal(u.pins['2'], 'GND'); assert.ok(/^\+/.test(u.pins['3']));
  assert.ok(Object.values(u.pins).some(n => /TLE9251V\d*_TXD/.test(n)));
  const mcu = r.parts.find(c => /STM32/.test(c.val)); assert.ok(Object.values(mcu.pins).some(n => /TLE9251V\d*_/.test(n)), 'bus pins assigned on the MCU');
  const P2 = NEWPROJ.newPlan('t'); NEWPROJ.addBlock(P2, 'pwr_in', {}); NEWPROJ.addBlock(P2, 'part', { mpn: 'NOPE-123' });
  assert.ok(NEWPROJ.build(P2).warn.some(w => /NOPE-123/.test(w)));
});
