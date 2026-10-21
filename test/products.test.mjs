import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { PRODUCTS, HWARCH, SAFETY } = load();

test('products: detect built-in templates and build the standard architecture', () => {
  assert.equal(PRODUCTS.detect('EPS 전동 파워 스티어링 ECU').key, 'eps');
  assert.equal(PRODUCTS.detect('BMS 마스터 보드').key, 'bms');
  assert.equal(PRODUCTS.detect('바디 컨트롤 모듈').key, 'bcm');
  assert.equal(PRODUCTS.detect('트랙션 인버터').key, 'inv');
  assert.equal(PRODUCTS.detect('12V CAN 센서 노드'), null);
  for (const k of Object.keys(PRODUCTS.T)) {
    const p = PRODUCTS.detect(PRODUCTS.T[k].name); assert.ok(p && typeof p.questions[0].re.test === 'function', k + ' regex kept');
    const r = PRODUCTS.apply(p, {}, k, HWARCH);
    assert.ok(r.arch.blocks.length >= 8 && r.arch.links.length >= 10, k + ' blocks/links');
    assert.ok(r.arch.blocks.some(b => b.group === 'ctrl') && r.arch.blocks.some(b => b.group === 'power'));
    assert.equal(r.log.filter(l => /링크 생략/.test(l)).length, 0, k + ' all links resolve');
    const t = HWARCH.toPlan(r.arch); assert.ok(t.plan.blocks.some(b => b.type === 'mcu'), k + ' plan has mcu');
  }
});

test('products: answers apply effects (feats, add+links, impl, dup, asil, free text)', () => {
  const p = PRODUCTS.detect('EPS');
  const r = PRODUCTS.apply(p, { type: '듀얼 피니언 / 랙 타입 · ~120 A', angle: '홀 센서 ×3 (저가)', redund: '2채널 리던던트 EPS (각 ASIL B(D))', comm2: '사설 CAN (센서·리던던트 채널), 기타 LIN 하나' }, 'EPS', HWARCH);
  const B = id => r.arch.blocks.find(b => b.id === id);
  assert.ok(B('inv').feats.some(f => /120 A/.test(f)));
  assert.equal(B('gate').impl.find(i => i.type === 'bldc').params.hall, 1);
  assert.ok(B('mcu2') && B('gate2') && B('inv2') && B('sbc2'), 'dup blocks');
  assert.ok(r.arch.links.some(l => l.a === 'mcu2' && l.b === 'gate2'), 'dup links');
  assert.ok(B('canx2') && r.arch.links.some(l => l.a === 'canx2' && l.b === 'mcu'), 'added block + link');
  assert.ok(B('canx').feats.some(f => /요구: 기타 LIN/.test(f)), 'free text recorded on the block');
  assert.match(r.req, /랙 타입 120 A/); assert.match(r.req, /사설 CAN/); assert.match(r.req, /ASIL D/);
  const b = PRODUCTS.apply(PRODUCTS.detect('BMS'), { asil: 'ASIL D' }, 'B', HWARCH);
  assert.equal(b.asil, 'D'); assert.equal(SAFETY.parseLevel(b.req), 'D'); assert.ok(!/ASIL C/.test(b.req));
  assert.ok(b.arch.blocks.find(x => x.id === 'ctr').feats.some(f => /이중화/.test(f)));
  const c = PRODUCTS.apply(PRODUCTS.detect('BCM'), { lin: 'LIN 없음' }, 'C', HWARCH);
  assert.ok(!c.arch.blocks.some(x => x.id === 'lin') && !c.arch.links.some(l => l.a === 'lin' || l.b === 'lin'), 'remove effect');
});

test('products: Claude profile is validated into the same shape', () => {
  const j = { product: 'OBC', name: 'OBC', defaults: ['12 V'], req: '12 V 차량 배터리, CAN-FD', blocks: [{ id: 'PIN!', group: 'power', label: 'In', impl: [{ type: 'pwr_in', params: { vin: 12 } }, { type: 'nope' }] }, { id: 'mcu', group: 'ctrl', label: 'MCU' }, { id: 'mcu', group: 'ctrl', label: 'dup' }, { label: 'no id' }],
    links: [['pin', 'mcu', 'V', 'power'], { from: 'mcu', to: 'pin', label: 'x' }], questions: [{ key: 'k', block: 'mcu', q: 'Q?', options: ['A', { label: 'B', effect: { asil: 'B' } }] }, { q: '' }] };
  const p = PRODUCTS.fromAi(j);
  assert.equal(p.blocks.length, 2); assert.equal(p.blocks[0].id, 'pin'); assert.equal(p.blocks[0].impl.length, 1);
  assert.equal(p.links.length, 2); assert.equal(p.questions.length, 1); assert.equal(p.questions[0].options[1].effect.asil, 'B');
  assert.equal(PRODUCTS.fromAi({ product: null }), null);
  assert.match(PRODUCTS.aiPrompt('EPS 설계'), /"questions"/);
  const r = PRODUCTS.apply(p, { k: 'B' }, 'OBC', HWARCH); assert.equal(r.asil, 'B'); assert.equal(r.arch.blocks.length, 2);
});

test('products: part candidates per block from several makers', () => {
  const p = PRODUCTS.detect('EPS');
  const g = PRODUCTS.candidates(p, 'gate');
  assert.ok(g.length >= 3 && new Set(g.map(x => x.mfr)).size >= 3, 'several makers');
  assert.ok(g.every(x => x.mpn && x.note));
  assert.equal(PRODUCTS.candidates(p, 'ign').length, 0);
  for (const k of Object.keys(PRODUCTS.T)) { const q = PRODUCTS.detect(PRODUCTS.T[k].name); const n = q.blocks.filter(b => PRODUCTS.candidates(q, b.id).length).length; assert.ok(n >= 6, k + ' blocks with candidates: ' + n); }
  assert.match(PRODUCTS.summary(p), /후보: TLE9180D-31QK \(Infineon\)/);
  const ai = PRODUCTS.fromAi({ product: 'X', blocks: [{ id: 'a', group: 'io', label: 'A', parts: [{ mpn: 'P1', mfr: 'M', note: 'n' }, 'P2', ['P3', 'M3', 'x']] }, { id: 'b', group: 'ctrl', label: 'B' }, { id: 'c', group: 'power', label: 'C' }, { id: 'd', group: 'comm', label: 'D' }] });
  assert.deepEqual(PRODUCTS.candidates(ai, 'a').map(x => x.mpn), ['P1', 'P2', 'P3']);
  assert.match(PRODUCTS.aiPrompt('x'), /DIFFERENT makers/);
});
