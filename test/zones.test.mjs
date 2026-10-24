import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, NEWPROJ, AUTOPLACE, PCBEDIT } = load();
test('functional zones: motor floorplan (input · power · MCU · stage …), parts placed inside their zone, zones tile the board', () => {
  const prof = PRODUCTS.detect('Dadu');
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, {}, 'Dadu').arch).plan;
  const { B } = NEWPROJ.toBoard(plan, { seed: 3 });
  assert.equal(B.zones.template, 'motor');
  for (const g of ['input', 'power', 'mcu', 'stage', 'comm', 'sense']) assert.ok(B.zones.rects[g], g);
  const R = Object.values(B.zones.rects);
  const tot = R.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0);
  assert.ok(Math.abs(tot - B.W * B.H) < 1, 'zones cover the board exactly');
  // stage along the right edge, input on the left edge
  assert.ok(Math.abs(B.zones.rects.stage[2] - B.W) < 0.01 && B.zones.rects.input[0] === 0);
  const rep = AUTOPLACE.zoneReport(B);
  const parts = rep.reduce((s, x) => s + x.parts, 0), out = rep.reduce((s, x) => s + x.out.length, 0);
  assert.ok(out / parts < 0.06, `outside ${out}/${parts}`);
  // every MOSFET / gate driver sits in the stage zone
  const st = B.zones.rects.stage;
  B.comps.filter(c => /IR2104|IPD90N04|IAUC/.test(c.val)).forEach(c => { const x = (c.bb[0] + c.bb[2]) / 2; assert.ok(x >= st[0] - 1, c.ref); });
  assert.equal(PCBEDIT.drc(B).filter(d => d.code === 'courtyard' || d.code === 'edge').length, 0);
  // zones follow a resized board
  PCBEDIT.resizeBoard(B, B.W * 1.2, B.H, { anchor: 'bl' });
  AUTOPLACE.zonesFit(B);
  assert.ok(Math.abs(B.zones.rects.stage[2] - B.W) < 0.05);
});
test('functional zones: general floorplan without a power stage, and zones can be switched off', () => {
  const { plan } = NEWPROJ.planFrom('12V 입력 CAN 센서 노드, STM32, I2C 센서 확장, UART 디버그, LED 1개');
  const { B } = NEWPROJ.toBoard(plan, { seed: 1 });
  assert.equal(B.zones.template, 'general');
  assert.ok(!B.zones.rects.stage);
  plan.zones = false;
  const { B: B2 } = NEWPROJ.toBoard(plan, { seed: 1 });
  assert.equal(B2.zones, undefined);
});
