import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

test('routing diagnosis and the rule supervisor: an open net is described by its ends, the nets around them and on its corridor; the plan rips those and routes the failed net first, then tries other remedies', () => {
  const L = load();const { BOARDSNAP, PRODUCTS, HWARCH, NEWPROJ, ROUTEDIAG, AUTOROUTE, PCBEDIT, PCB } = L;const S = L.SNAP_DADU8C, m = S.meta;
  const prof = PRODUCTS.detect(m.profile);const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');ans.fet = fq.options[0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;(m.params || []).forEach(t => { const q = t.match(/^([\w]+)\.([\w]+)=(.*)$/);if (q) plan.blocks.filter(b => b.type === q[1]).forEach(b => { b.params = Object.assign({}, b.params, { [q[2]]: q[3] }); }); });
  plan.ifaceFix = true;plan.rstFix = m.rstFix === true;plan.curModel = m.curModel === 2 ? 2 : 1;plan.connGap = m.connGap === true;plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };
  const { B } = NEWPROJ.toBoard(plan, { place: false });BOARDSNAP.apply(B, S);
  const D0 = ROUTEDIAG.diagnose(B);assert.equal(D0.rats, 0);assert.equal(D0.ok, true);assert.equal(D0.score, 0);assert.equal(ROUTEDIAG.plan(D0, B, {}).length, 0);
  // open one gate signal: take its auto copper off
  const net = 'PH_W_HO';const kill = [];PCB.cuKeys(B).forEach(k => B.layers[k + '.cu'].forEach(p => { if (p.auto && !p.fan && p.net === net) kill.push(p); }));B.vias.forEach(v => { if (v.auto && v.net === net) kill.push(v); });
  assert.ok(kill.length > 0);AUTOROUTE.unroute(B, kill);PCBEDIT.rebuildNets(B);
  const D = ROUTEDIAG.diagnose(B);assert.ok(D.rats >= 1);assert.equal(D.ok, false);assert.equal(D.score, D.rats * 1000);
  const o = D.open.find(x => x.net === net);assert.ok(o);assert.ok(o.a.ref && o.b.ref);assert.ok([o.a, o.b].some(e => /^U/.test(e.ref) && e.pitch <= 0.65), 'one end is the gate driver pin');
  assert.ok(o.blockers.length > 0);assert.ok(o.blockers.every(b => b.net !== net));assert.ok(!o.blockers.some(b => /^GND$/.test(b.net) && b.rip), 'ground is never offered for rip-up');
  // the two-pin part at the other end carries its 180° turn figure (mm saved by nearest same-net pads)
  const fl = [o.a, o.b].map(e => e.flip).find(Boolean);assert.ok(fl && /^R\d+$/.test(fl.ref) && typeof fl.gain === 'number' && fl.nets.includes(net));
  const T = ROUTEDIAG.text(D);assert.match(T, /\[PH_W_HO\]/);assert.match(T, /통로를 막는 넷/);
  // the plan: rip around the failed net and route it first; asked again for the same nets it moves on to other remedies and finally runs out
  const hist = {};const p1 = ROUTEDIAG.plan(D, B, hist);assert.equal(p1.length, 1);assert.equal(p1[0].kind, 'ripall');assert.match(p1[0].cmd, /^route --nets \S*PH_W_HO\S* --rip \S+ --first \S*PH_W_HO/);assert.ok(!/--rip \S*(GND|\+12V)/.test(p1[0].cmd));
  const kinds = [];for (let i = 0; i < 6; i++) ROUTEDIAG.plan(D, B, hist).forEach(x => kinds.push(x.kind));
  assert.ok(kinds.includes('deep'));assert.ok(!kinds.includes('ripall'));assert.equal(ROUTEDIAG.plan(D, B, hist).length, 0);
  // the supervisor prompt carries the diagnosis and what was tried
  const P = ROUTEDIAG.prompt(D, [{ cmd: p1[0].cmd, res: '나빠져 되돌림' }], 2, 4);assert.match(P, /이미 시도: route --nets/);assert.match(P, /감독 2\/4회차/);
});
