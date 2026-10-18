import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { load } from './load.mjs';
const { NEWPROJ, PCBEDIT, AUTOPLACE, AUTOROUTE, PCB, GUIDE } = load();

const node = () => NEWPROJ.planFrom('12V 입력 CAN 센서 노드, STM32, I2C 센서 확장, UART 디버그, LED 1개').plan;

test('board layers: an 8-layer stack-up with inner GND / PWR planes and inner signal layers', () => {
  const { B } = NEWPROJ.toBoard(node(), { strategy: 'compact', seed: 2 });
  const r = PCBEDIT.setLayers(B, 8);
  assert.equal(B.copperLayers, 8);
  assert.deepEqual([...PCB.cuKeys(B)], ['T', 'In1', 'In2', 'In3', 'In4', 'In5', 'In6', 'B']);
  assert.deepEqual([...B.stack.map(x => x.role)], ['sig', 'gnd', 'sig', 'gnd', 'pwr', 'sig', 'gnd', 'sig']);
  assert.equal(r.gnd, 'GND');
  assert.ok(r.pwr && B.netClass(r.pwr) === '전원', 'a supply rail carries the power plane');
  assert.ok(B.layers['In1.cu'].some(p => p.t === 'pour' && p.net === 'GND' && p.plane));
  assert.ok(B.layers['In4.cu'].some(p => p.t === 'pour' && p.net === r.pwr));
  assert.match(PCBEDIT.stackText(B), /L5 In4\.Cu · 전원 플레인/);
  // GND and the power rail reach their planes through vias, so the router no longer has to join them
  AUTOPLACE.ensurePour(B); AUTOPLACE.fanout(B, {});
  const open = AUTOROUTE.openNets(B).map(o => o.net);
  assert.ok(!open.includes('GND') && !open.includes(r.pwr));
  // back to 2 layers removes the inner copper
  PCBEDIT.setLayers(B, 2);
  assert.deepEqual([...PCB.cuKeys(B)], ['T', 'B']);
  assert.equal(B.layers['In1.cu'], undefined);
  assert.throws(() => PCBEDIT.setLayers(B, 3));
});

test('the router uses inner signal layers, and the KiCad file declares and fills them', () => {
  const { B } = NEWPROJ.toBoard(node(), { strategy: 'compact', seed: 2 });
  PCBEDIT.setLayers(B, 4);
  AUTOPLACE.ensurePour(B); AUTOPLACE.fanout(B, { via: { d: 0.45, drill: 0.2 }, clear: 0.15 });
  // a 4-layer board has only F.Cu and B.Cu for signals (In1 = GND, In2 = PWR): planes must stay free of tracks
  const nets = AUTOROUTE.openNets(B).map(o => o.net);
  AUTOROUTE.route(B, nets, { via: { d: 0.45, drill: 0.2 }, clear: 0.15, attempts: 1, viaCost: 1.2 });
  assert.equal(B.layers['In1.cu'].filter(p => p.t === 'path' || p.t === 'seg').length, 0);
  assert.equal(B.layers['In2.cu'].filter(p => p.t === 'path' || p.t === 'seg').length, 0);
  // 6 layers: In2 and In3 are signal layers
  const { B: C } = NEWPROJ.toBoard(node(), { strategy: 'compact', seed: 2 });
  PCBEDIT.setLayers(C, 6);
  assert.deepEqual([...C.stack.map(x => x.role)], ['sig', 'gnd', 'sig', 'pwr', 'gnd', 'sig']);
  AUTOPLACE.ensurePour(C); AUTOPLACE.fanout(C, {});
  const n2 = AUTOROUTE.openNets(C).map(o => o.net);
  const it = AUTOROUTE.jobRR(C, n2, { via: { d: 0.45, drill: 0.2 }, clear: 0.15, reserve: 0.6, neck: 0.25, laneVia: 2, viaCost: 1.2, maxExp: 600000 });
  let q; do { q = it.next(); } while (!q.done);
  const r = q.value;
  PCBEDIT.rebuildNets(C);
  assert.ok(r.ok >= n2.length - 4, `routed ${r.ok}/${n2.length}`);
  const inner = C.layers['In2.cu'].concat(C.layers['In3.cu']).filter(p => p.t === 'path').length;
  assert.ok(inner > 0, 'some tracks run on the inner signal layers');
  assert.equal(PCBEDIT.drc(C).filter(d => d.code === 'short').length, 0);
  // net lengths count inner layers too
  assert.ok(Object.values(C.nets).some(n => (n.len.In2 || 0) + (n.len.In3 || 0) > 0));
  const k = PCBEDIT.toKicadPcb(C, {});
  let d = 0; for (const ch of k) { if (ch === '(') d++; else if (ch === ')') d--; }
  assert.equal(d, 0);
  assert.match(k, /\(1 "In1\.Cu" power\) \(2 "In2\.Cu" signal\)/);
  assert.match(k, /\(segment [^\n]*\(layer "In[23]\.Cu"\)/);
  assert.match(k, /\(zone \(net \d+\) \(net_name "GND"\) \(layer "In1\.Cu"\)/);
  // the guidelines see the inner reference plane
  const g = GUIDE.evaluate(C, { scope: 'pcb' });
  assert.equal(g.rules.find(x => x.key === 'rt_return_path').status, 'pass');
});

test('board minimize finds a smaller board the parts still fit on', () => {
  const { B } = NEWPROJ.toBoard(node(), { place: false });
  const A0 = B.W * B.H;
  AUTOPLACE.clearCopper(B);
  const r = AUTOPLACE.minimize(B, { strategy: 'compact', seed: 1 });
  assert.ok(r.ok);
  assert.ok(r.W * r.H < A0 * 0.6, `${r.W}×${r.H} vs ${A0}`);
  assert.equal(B.W, r.W);
  assert.deepEqual([...PCBEDIT.drc(B).filter(d => d.code === 'courtyard' || d.code === 'edge').map(d => d.msg)], []);
});

test('step 2 builds the circuit without placing it', () => {
  const p = node();
  const { B } = NEWPROJ.toBoard(p, { place: false });
  // nothing is poured or routed; the parts still sit in the generation grid
  assert.equal(B.layers['B.cu'].filter(x => x.t === 'pour').length, 0);
  assert.equal(B.vias.length, 0);
  assert.ok(B.comps.length > 10 && Object.keys(B.nets).length > 5);
});

test('AI conversation kind: questions are answered, instructions are executed', () => {
  const ctx = vm.createContext({ console, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(readFileSync(new URL('../src/app/aimode.js', import.meta.url), 'utf8'), ctx);
  const q = s => vm.runInContext(`aimIsQuestion(${JSON.stringify(s)})`, ctx);
  for (const s of ['8층이면 크기를 얼마나 줄일 수 있어?', '지금 미배선 넷이 왜 남았어', 'DRC 결과를 설명해줘', '열 분포를 분석해줘', '이 보드 몇 층이야?'])
    assert.equal(q(s), true, s);
  for (const s of ['보드를 8층기판으로 변경해줘 그리고 싸이즈를 최소화해줘', '열이 고르게 퍼지게 다시 배치해줘', 'route', 'U4 옆에 100nF 추가해줘'])
    assert.equal(q(s), false, s);
  assert.equal(vm.runInContext(`AIM.qa='auto';aimKind('왜 이렇게 됐어?')`, ctx), 'qa');
  assert.equal(vm.runInContext(`aimKind('왜 이렇게 됐어?','agent')`, ctx), 'agent');
  assert.equal(vm.runInContext(`AIM.qa='agent';aimKind('왜 이렇게 됐어?')`, ctx), 'agent');
});
