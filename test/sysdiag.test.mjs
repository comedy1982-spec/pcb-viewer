import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PCB, NEWPROJ, SYSDIAG, HSIS, HWARCH, SAMPLE_TC364, SAMPLE } = load();
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

test('HW architecture block diagram: functional blocks without parts, bands, labelled interfaces', () => {
  const { arch: A } = HWARCH.archFrom('eLSD ECU: 12V 배터리 입력, AURIX MCU, CAN-FD 통신, DC 모터 H-bridge 구동, 전류·온도 센싱, XCP 캘리브레이션, 워치독, ASIL B', 'eLSD ECU');
  const B = id => A.blocks.find(b => b.id === id);
  assert.deepEqual([...['pin', 'reg', 'wdg', 'canbus', 'canx', 'mcu', 'drv', 'sense', 'dbg', 'conn'].map(id => !!B(id))], Array(10).fill(true));
  assert.equal(B('pin').group, 'power'); assert.equal(B('canx').group, 'comm'); assert.equal(B('mcu').group, 'ctrl'); assert.equal(B('drv').group, 'io'); assert.equal(B('conn').group, 'ext');
  assert.ok(B('mcu').feats.some(f => /ASIL B/.test(f)) && B('dbg').feats.includes('XCP over CAN'));
  // no part numbers anywhere in the drawing
  const s = HWARCH.svg(A);
  assert.ok(!/TLE9251|TC364DP|AMS1117|TPS54|DRV8|AO3400|W25Q/.test(s + JSON.stringify(A.blocks.map(b => [b.label, b.feats]))));
  const L = (a, b) => A.links.find(l => l.a === a && l.b === b);
  assert.equal(L('pin', 'reg').kind, 'power'); assert.equal(L('canbus', 'canx').kind, 'bus'); assert.match(L('sense', 'mcu').label, /ADC/); assert.match(L('drv', 'conn').label, /High-Current/);
  assert.match(s, /⇢ VCC_DRV 12 V/, 'a rail skipping a band becomes an input tag');
  assert.ok(!/<script|<style|foreignObject/.test(s) && /role="img"/.test(s));
  // editing
  const r = HWARCH.addBlock(A, 'io', 'Relay Driver', { feats: ['주 릴레이'] }); HWARCH.link(A, 'mcu', r.id, 'GPIO');
  assert.equal(A.links.find(l => l.b === r.id).kind, 'signal');
  assert.throws(() => HWARCH.addBlock(A, 'nowhere', 'X'), /그룹/);
  // step 2: the architecture turns into circuit blocks; blocks without an implementation are reported
  const t = HWARCH.toPlan(A);
  assert.deepEqual([...new Set(t.plan.blocks.map(b => b.type))].sort(), ['buck', 'can', 'hbridge', 'ldo', 'mcu', 'pwr_in', 'supervisor', 'uart', 'vmon', 'xtal']);
  assert.ok(!t.unmapped.includes('Watchdog / Reset') && t.unmapped.includes('Relay Driver'));
  assert.equal(NEWPROJ.build(t.plan).mcu, 'TC364DP-64F300F');
});

test('a finished board gives an architecture with the part numbers taken out', () => {
  const A = HWARCH.fromDiagram(SYSDIAG.fromBoard(board(SAMPLE_TC364)));
  assert.ok(A.blocks.some(b => b.label === 'Main MCU' && b.group === 'ctrl'));
  assert.ok(A.blocks.some(b => b.group === 'comm' && /CAN Transceiver/.test(b.label)));
  assert.ok(A.blocks.some(b => b.group === 'io' && /Motor Driver/.test(b.label)));
  assert.equal(A.blocks.filter(b => b.group === 'power')[0].ext, true, 'power input first');
  assert.ok(!/TLE9251|TC364|AMS1117|DRV8313|W25Q/.test(JSON.stringify(A.blocks.map(b => b.label))));
});
