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
