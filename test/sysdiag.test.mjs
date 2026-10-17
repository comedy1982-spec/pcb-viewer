import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, NEWPROJ, SYSDIAG, HSIS, SAMPLE_TC364, SAMPLE } = load();
const board = (spec) => PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(spec))));

test('a requirement becomes a system diagram: power chain, MCU signals, connectors leaving the board', () => {
  const { plan } = NEWPROJ.planFrom('12V 입력 TC364 AURIX BLDC 모터 제어기, CAN, 플래시, UART 디버그, LED 2개');
  const D = SYSDIAG.fromPlan(plan);
  const id = t => D.nodes.find(n => n.type === t).id;
  const E = (a, b) => D.edges.find(e => e.a === a && e.b === b);
  assert.equal(D.nodes.filter(n => n.col === 1).length, 3, 'input, buck, LDO');
  assert.equal(E(id('pwr_in'), id('buck')).label, '+12V');
  assert.equal(E(id('buck'), id('ldo')).label, '+5V');
  assert.equal(E(id('ldo'), id('mcu')).label, '+3V3');
  assert.match(E(id('mcu'), id('can')).label, /CAN/);
  assert.match(E(id('mcu'), id('bldc')).label, /PWM ×3/);
  assert.match(E(id('mcu'), id('flash')).label, /SPI/);
  assert.ok(E(id('vmon'), id('mcu')), 'ADC flows into the MCU');
  assert.ok(D.nodes.filter(n => n.ext && n.col === 4).length >= 3, 'CAN bus, motor, debug leave the board');
  assert.ok(D.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= D.W && n.y + n.h <= D.H));
  const s = SYSDIAG.svg(D, { sel: id('mcu') });
  assert.match(s, /^<svg [^>]*role="img"/); assert.ok(!/<script|<style|foreignObject/.test(s));
  assert.equal((s.match(/class="sd-n"/g) || []).length, D.nodes.length);
  assert.match(SYSDIAG.text(D), /DC 전원 입력 12 V → 벅 컨버터/);
});

test('the diagram of a finished board comes from part roles and shared nets', () => {
  const D = SYSDIAG.fromBoard(board(SAMPLE_TC364));
  const N = r => D.nodes.find(n => n.id === r);
  assert.equal(N('U1').type, 'mcu'); assert.equal(N('U2').col, 1); assert.equal(N('J1').col, 4);
  assert.ok(N('J1~p') && N('J1~p').col === 0, 'the ECU connector also shows as the power input');
  assert.ok(D.edges.some(e => e.a === 'J1~p' && e.b === 'U2' && e.label === '+12V'));
  assert.ok(D.edges.some(e => e.a === 'U1' && e.b === 'U4' && /CAN_TX\/RX/.test(e.label)));
  assert.equal(SYSDIAG.netsLabel(['IN_U', 'IN_V', 'IN_W', 'EN_U']), 'IN_U/V/W · EN_U');
});

test('HSIS pin map is anchored on the MCU, and boards without an HSIS get one drafted from the MCU pins', () => {
  const B = board(SAMPLE_TC364);
  // a document that lists low pin numbers only must still land on the MCU, not the 12-pin connector
  const H = HSIS.fromRows([['ID', '신호명', 'MCU 핀', '회로도 넷'], ['A', 'X', '1', 'HALL_A'], ['B', 'Y', '2', 'HALL_B'], ['C', 'Z', '7', 'PH_W']], { mcuRef: '' });
  assert.equal(HSIS.pickMcu(B, H.items), 'U1');
  assert.ok(!HSIS.isMcuLike(B.byRef.J1) && HSIS.isMcuLike(B.byRef.U1));
  const { B: NB } = NEWPROJ.toBoard(NEWPROJ.planFrom('12V 입력 STM32 CAN 노드, LED 1개').plan, { place: false });
  const G = HSIS.fromBoard(NB, 'U1');
  const mcu = NB.comps.find(c => /STM32/.test(c.val)).ref;
  assert.equal(G.meta.mcuRef, mcu, 'a non-MCU mcuRef is replaced by the real MCU');
  assert.ok(G.items.length >= 6);
  const can = G.items.find(i => i.net === 'CAN_TX');
  assert.ok(can && can.pins && can.cat === '통신' && /^U\d+\.\d+$/.test(can.hw));
  assert.ok(G.items.every(i => NB.byRef[mcu].pads.some(p => String(p.n) === String(i.pins).split(',')[0].trim())), 'every row is an MCU pin');
});
