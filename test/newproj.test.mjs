import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { NEWPROJ, PCBEDIT, SCH, SCHEDIT, GUIDE } = load();

test('requirement text becomes a block plan with the right power tree', () => {
  const { plan, log } = NEWPROJ.planFrom('12V 입력 BLDC 모터 컨트롤러, STM32, CAN 통신, 상태 LED 2개, 버튼 1개');
  const types = plan.blocks.map(b => b.type);
  for (const t of ['pwr_in', 'ldo', 'mcu', 'xtal', 'can', 'bldc', 'led', 'button']) assert.ok(types.includes(t), t);
  assert.equal(plan.blocks.find(b => b.type === 'pwr_in').params.vin, 12);
  assert.equal(plan.blocks.find(b => b.type === 'led').params.n, 2);
  assert.equal(plan.strategy, 'thermal');
  assert.ok(log.length >= 3);
  const r = NEWPROJ.build(plan);
  assert.deepEqual(Object.keys(r.rails).sort(), ['+12V', '+3V3', '+5V']);
  assert.deepEqual([...r.warn.filter(w => /레일을 만드는 블록이 없음|핀이 남지 않음/.test(w))], []);
});

test('MCU signals land on pins that can do the job, grouped by peripheral', () => {
  const { plan } = NEWPROJ.planFrom('12V BLDC 모터, CAN, 플래시');
  const r = NEWPROJ.build(plan);
  const a = r.pinmap;
  assert.equal(a.CAN_TX.inst, a.CAN_RX.inst);
  assert.equal(a.FLASH_SCK.inst, a.FLASH_MOSI.inst); assert.equal(a.FLASH_MOSI.inst, a.FLASH_MISO.inst);
  assert.ok(/^TIM/.test(a.IN_U.inst) && a.IN_U.inst === a.IN_V.inst && a.IN_V.inst === a.IN_W.inst, 'three PWM on one timer');
  assert.equal(a.VMON.role, 'adc');
  const pins = Object.values(a).map(x => x.pin); assert.equal(new Set(pins).size, pins.length, 'no pin used twice');
  assert.ok(!pins.includes('23') && !pins.includes('24'), 'SWD pins stay free');
});

test('high LDO loss switches the first stage to a buck converter; AURIX gets a crystal', () => {
  const { plan, log } = NEWPROJ.planFrom('24V 입력 TC364 AURIX CAN 노드, UART 디버그');
  assert.ok(plan.blocks.some(b => b.type === 'buck' && +b.params.vout === 5));
  assert.ok(plan.blocks.some(b => b.type === 'xtal'));
  assert.ok(log.some(l => /벅 컨버터/.test(l)));
  const r = NEWPROJ.build(plan);
  assert.equal(r.mcu, 'TC364DP-64F300F');
  assert.ok(/^CAN/.test(r.pinmap.CAN_TX.inst) && r.pinmap.CAN_TX.inst === r.pinmap.CAN_RX.inst);
  assert.deepEqual([...r.warn], []);
});

test('plan editing and the generated board / schematic are consistent', () => {
  const p = NEWPROJ.newPlan('test');
  NEWPROJ.addBlock(p, 'usb_in', {}); NEWPROJ.addBlock(p, 'ldo', { vout: 3.3 }); NEWPROJ.addBlock(p, 'mcu', {}); NEWPROJ.addBlock(p, 'led', { n: 3, color: '빨강' });
  assert.throws(() => NEWPROJ.addBlock(p, 'mcu', {}));
  assert.throws(() => NEWPROJ.addBlock(p, 'led', { bogus: 1 }));
  NEWPROJ.setParam(p, p.blocks[3].id, 'n', 2);
  const { B, r } = NEWPROJ.toBoard(p, { strategy: 'compact', seed: 2 });
  assert.equal(B.comps.filter(c => /^D/.test(c.ref) && c.kind === 'led').length, 2);
  assert.deepEqual([...PCBEDIT.drc(B).filter(d => d.code === 'courtyard').map(d => d.msg)], []);
  assert.ok(B.nets.USB_DM && B.nets.USB_DP);
  const sheets = SCH.build(B, null).sheets;
  assert.deepEqual([...SCHEDIT.erc(sheets).map(e => e.msg)], []);
  const g = GUIDE.evaluate(B, { scope: 'sch', sheets });
  assert.equal(g.rules.find(x => x.key === 'sch_reset').status, 'pass');
  assert.equal(r.spec._source, '신규 설계');
});
