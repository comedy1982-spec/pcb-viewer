import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { NEWPROJ } = load();

// pin 1 = cathode for every polarized 2-terminal diode (KiCad / datasheet convention), and the silkscreen
// cathode bar sits beside the cathode pad so the board can be assembled the right way round
test('diode polarity: generator pin 1 = K and a cathode bar next to the cathode pad', () => {
  const P = NEWPROJ.newPlan('t');
  ['pwr_in', 'buck', 'ldo', 'mcu', 'dcmotor', 'led'].forEach(t => NEWPROJ.addBlock(P, t, {}));
  const B = NEWPROJ.toBoard(P, { place: true }).B;
  const D = B.comps.filter(c => /^D\d/.test(c.ref) && c.pads.length === 2 && c.pn && !Object.values(c.pn).some(v => /^A[12]$/.test(v)));
  assert.ok(D.length >= 3, 'polarized diodes in the plan');
  for (const c of D) {
    assert.equal(c.pn['1'] || c.pn[1], 'K', `${c.ref} ${c.val}: pin 1 is the cathode`);
    const k = c.pads.find(p => p.n === '1');
    const bar = B.layers[c.side + '.silk'].find(p => p.own === c && p.pol === 'K');
    assert.ok(bar, `${c.ref}: cathode bar on the silkscreen`);
    const a = c.pads.find(p => p.n === '2'), mid = [(bar.a[0] + bar.b[0]) / 2, (bar.a[1] + bar.b[1]) / 2];
    const d = p => Math.hypot(p.x - mid[0], p.y - mid[1]);
    assert.ok(d(k) < d(a), `${c.ref}: bar is on the cathode side`);
  }
});
