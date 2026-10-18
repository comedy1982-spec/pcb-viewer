import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, MULTIBOARD: MB, SAMPLE_TC364, SAMPLE_MCU } = load();
const mk = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));

test('connectors are found and pins map by number or by net; checks flag mixed rails and unmapped pins', () => {
  const A = mk(SAMPLE_TC364), B = mk(SAMPLE_MCU);
  const boards = { ecu: A, motor: B };
  const ca = MB.connectors(A), cb = MB.connectors(B);
  assert.ok(ca.length >= 1 && cb.length >= 1, 'both boards have connectors');
  const project = { name: 'sys', boards: [{ id: 'ecu', name: A.name, role: '제어' }, { id: 'motor', name: B.name, role: '구동' }], links: [] };
  const l = MB.addLink(project, { board: 'ecu', ref: ca[0].ref }, { board: 'motor', ref: cb[0].ref }, { kind: 'cable', label: '하네스' });
  assert.equal(l.id, 'L1');
  const [r] = MB.resolve(project, boards);
  assert.ok(r.A && r.B && r.pins.length > 0, 'pins paired by number');
  assert.ok(r.rows.every(x => x.pa && x.pb));
  const ck = MB.check(project, boards);
  assert.ok(Array.isArray(ck));
  // manual map that joins GND to a rail must be an error
  const gA = ca[0].pins.find(p => /GND/i.test(p.net || '')), rB = cb[0].pins.find(p => /^\+?\d|V/i.test(p.net || '') && !/GND/i.test(p.net || ''));
  if (gA && rB) { l.auto = 'manual'; l.pins = [[gA.n, rB.n]]; const c2 = MB.check(project, boards); assert.ok(c2.some(x => x.code === 'GND_MIX'), c2.map(x => x.code).join()); }
  // system nets join across the link; aggregated BOM counts both boards
  l.auto = 'net'; const sn = MB.systemNets(project, boards); assert.ok(Array.isArray(sn));
  const bom = MB.systemBom(project, boards); assert.equal(bom.reduce((a, r) => a + r.qty, 0), A.comps.length + B.comps.length);
  const svg = MB.svg(project, boards); assert.match(svg, /^<svg /); assert.ok(svg.includes(A.name) && svg.includes(B.name) && svg.includes('L1') || svg.includes('하네스'));
  assert.ok(!/NaN|undefined/.test(svg));
  const aoa = MB.linksAoa(project, boards); assert.equal(aoa[0].length, 12); assert.ok(aoa.length > 1);
  assert.match(MB.text(project, boards), /보드 2개/);
});
