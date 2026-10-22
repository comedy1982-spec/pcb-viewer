import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { SGARCH, PRODUCTS, HWARCH, SAFETY } = load();

test('safety goals tag the violation path, raise block ASIL and are verified by the deterministic rules', () => {
  const A = HWARCH.archFrom('12 V 차량 배터리, STM32G4, CAN, BLDC 모터 구동, 전류 센싱, ASIL D', 'T').arch;
  SGARCH.setGoals(A, [{ text: '의도하지 않은 모터 토크 방지', asil: 'D', ftti: 30, kind: 'actuation', state: '게이트 차단', path: ['mcu', 'drv'] }]);
  assert.equal(SGARCH.goals(A).length, 1); assert.equal(A.safety.level, 'D');
  assert.deepEqual(A.blocks.find(b => b.id === 'drv').sg, ['SG1']); assert.equal(A.blocks.find(b => b.id === 'drv').asil, 'D');
  assert.ok(A.links.find(l => l.a === 'mcu' && l.b === 'drv').sg.includes('SG1'), 'link on the path is tagged');
  const V = SGARCH.verify(A);
  assert.equal(V.ok, false);
  const rules = V.goals[0].issues.map(i => i.rule);
  assert.ok(rules.includes('react') && rules.includes('indep'), rules.join());
  // propose: three variants, scored; the recommended one passes verification after apply
  const P = SGARCH.propose(A, HWARCH);
  assert.equal(P.length, 3); assert.ok(P[0].score >= P[1].score && P[1].score >= P[2].score);
  assert.ok(P.every(p => p.cost > 0 && p.blocks > 0 && p.dc > 0));
  const added = SGARCH.applyVariant(A, HWARCH, P[0].key);
  assert.ok(added.length > 0); assert.equal(A.safety.variant, P[0].key);
  assert.equal(SGARCH.verify(A).ok, true, SGARCH.verifyText(A));
  assert.ok(A.links.some(l => l.kind === 'safe' && l.a !== 'mcu'), 'an independent shutdown link exists');
  assert.match(SAFETY.archText(A), /안전 목표 검증/);
});

test('each variant has its own structure: safety MCU for dual, duplicated chain for decomp, and the EPS defaults pass as-is', () => {
  const mk = () => { const A = HWARCH.archFrom('12 V, STM32G4, CAN, BLDC 모터, ASIL D', 'T').arch; SGARCH.setGoals(A, [{ text: 'x', asil: 'D', ftti: 30, kind: 'actuation', path: ['mcu', 'drv'] }]); return A; };
  const D = mk(); SGARCH.applyVariant(D, HWARCH, 'dual');
  assert.ok(D.blocks.some(b => b.id === 'smcu' && b.safety === 'lockstep')); assert.ok(D.links.some(l => l.a === 'smcu' && l.kind === 'safe'));
  const C = mk(); SGARCH.applyVariant(C, HWARCH, 'decomp');
  assert.ok(C.blocks.some(b => b.id === 'mcu2') && C.blocks.some(b => b.id === 'drv2'), 'duplicated chain');
  assert.ok(C.links.some(l => l.a === 'mcu' && l.b === 'mcu2' && l.kind === 'safe'));
  assert.equal(SGARCH.verify(C).ok, true);
  const prof = PRODUCTS.detect('EPS ECU'); const E = PRODUCTS.apply(prof, {}, 'EPS', HWARCH).arch;
  SGARCH.setGoals(E, SGARCH.defaults('eps'));
  assert.equal(SGARCH.goals(E).length, 3); assert.equal(SGARCH.verify(E).ok, true, 'the EPS template already carries SBC, phase-cut and a lockstep MCU');
  assert.ok(E.blocks.find(b => b.id === 'pcut').sg.includes('SG1'));
  for (const k of Object.keys(SGARCH.GOALS)) assert.ok(SGARCH.defaults(k).length >= 3, k);
  assert.match(SGARCH.aiRules(E), /sg verify/);
});
