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

test('orchestration: every open net has an owning agent, the planner serves agents in priority order, and the verifier refuses a change that makes a higher-priority item worse', () => {
  const L = load();const { BOARDSNAP, PRODUCTS, HWARCH, NEWPROJ, ROUTEDIAG, AUTOROUTE, PCBEDIT, PCB } = L;const S = L.SNAP_DADU8C, m = S.meta;
  const prof = PRODUCTS.detect(m.profile);const ans = { cur: m.cur };const fq = prof.questions.find(q => q.key === 'fet');ans.fet = fq.options[0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, m.profile).arch).plan;(m.params || []).forEach(t => { const q = t.match(/^([\w]+)\.([\w]+)=(.*)$/);if (q) plan.blocks.filter(b => b.type === q[1]).forEach(b => { b.params = Object.assign({}, b.params, { [q[2]]: q[3] }); }); });
  plan.ifaceFix = true;plan.rstFix = m.rstFix === true;plan.curModel = m.curModel === 2 ? 2 : 1;plan.connGap = m.connGap === true;plan.shrink = m.shrink;plan.strategy = m.strategy;plan.board = { w: m.W, h: m.H };
  const { B } = NEWPROJ.toBoard(plan, { place: false });BOARDSNAP.apply(B, S);
  const own = ROUTEDIAG.ownerFn(B);
  assert.deepEqual(['+12V', 'GND', 'PH_U', 'PH_W_HO', 'PH_U_VB', 'PH_ISNS_U_AMP'].map(own), ['power', 'power', 'power', 'gate', 'gate', 'sense']);
  const mcuNet = B.comps.find(c => /TC3\d\d/.test(c.val)).pads.map(p => p.net).find(n => n && !['power', 'gate', 'sense'].includes(own(n)));assert.equal(own(mcuNet), 'mcu');
  const D0 = ROUTEDIAG.diagnose(B);assert.deepEqual([...D0.vec], [0, 0, 0, 0, 0, D0.badVia.length]);assert.equal(ROUTEDIAG.agentPlan(D0, B, {}).length, 0);
  // open a gate net and an MCU signal
  const cut = net => { const kill = [];PCB.cuKeys(B).forEach(k => B.layers[k + '.cu'].forEach(p => { if (p.auto && !p.fan && p.net === net) kill.push(p); }));B.vias.forEach(v => { if (v.auto && v.net === net) kill.push(v); });assert.ok(kill.length > 0, net);AUTOROUTE.unroute(B, kill); };
  cut('PH_W_HO');cut(mcuNet);PCBEDIT.rebuildNets(B);const D = ROUTEDIAG.diagnose(B, { max: 16 });
  assert.equal(D.openNets.PH_W_HO, 'gate');assert.equal(D.openNets[mcuNet], 'mcu');assert.ok(D.byOwner.gate >= 1 && D.byOwner.mcu >= 1);assert.equal(D.vec[0], 0);assert.equal(D.vec[3], D.byOwner.gate);
  D.open.forEach(o => assert.equal(o.owner, own(o.net)));assert.match(ROUTEDIAG.agentText(D), /게이트 · EMC: 미연결 \d+건 — PH_W_HO\(/);
  // the gate agent goes first, with one action on its own nets only; when its remedies are used up the MCU agent follows
  const hist = {};const seq = [];for (let i = 0; i < 12; i++) { const a = ROUTEDIAG.agentPlan(D, B, hist);if (!a.length) break;assert.equal(a.length, 1);seq.push(a[0]); }
  assert.equal(seq[0].agent, 'gate');assert.ok(seq.some(a => a.agent === 'mcu'));assert.ok(seq.findIndex(a => a.agent === 'mcu') > seq.map(a => a.agent).lastIndexOf('gate'), 'gate remedies come before the MCU agent');
  seq.filter(a => a.agent === 'gate').forEach(a => { assert.ok(!a.cmd.includes(mcuNet) || /--rip/.test(a.cmd));assert.match(a.why, /^\[게이트 · EMC\]/); });
  seq.forEach(a => { const rip = (a.cmd.match(/--rip (\S+)/) || [])[1];if (rip) rip.split(',').forEach(n => assert.notEqual(own(n), 'power', 'a power net is never ripped: ' + n)); });
  assert.ok(seq.some(a => a.kind === 'swap' && a.agent === 'mcu'), 'the MCU agent tries a pin swap');assert.equal(new Set(seq.map(a => a.cmd)).size, seq.length, 'no remedy twice');
  // speed rules: a remedy is not repeated on a net it already failed on; the deep search is rationed and runs with --refill;
  // a move leaves the routing to ONE partial route; an agent that fails three times in a row yields to the next
  { const h = {};const a1 = ROUTEDIAG.agentPlan(D, B, h, { patience: 1 })[0];assert.equal(a1.agent, 'gate');ROUTEDIAG.agentFeedback(h, a1, false);
    const nx = ROUTEDIAG.agentPlan(D, B, h, { patience: 1 });assert.ok(nx.length && nx[0].agent === 'mcu', 'the gate agent yields after its failure budget');
    const h2 = {};const all = [];for (let i = 0; i < 20; i++) { const a = ROUTEDIAG.agentPlan(D, B, h2, { patience: 99 });if (!a.length) break;all.push(a[0]); }
    const deep = all.filter(a => a.kind === 'deep');assert.equal(deep.length, 1, 'one deep search per run');assert.match(deep[0].cmd, /--refill --exp 1200000$/);
    all.filter(a => a.kind === 'move').forEach(a => { assert.match(a.cmd, /--no-route$/);assert.match(a.then, /^route --nets \S+ --refill --first \S+$/); });
    const rips = all.filter(a => a.kind === 'rip' && a.agent === 'gate');assert.equal(rips.length, 1, 'rip once per net while nothing changed');
    // after an accepted change the cheap rip may run again on what is still open
    const h3 = {};let a = ROUTEDIAG.agentPlan(D, B, h3, { patience: 99 })[0];while (a && a.kind !== 'rip') a = ROUTEDIAG.agentPlan(D, B, h3, { patience: 99 })[0];ROUTEDIAG.agentFeedback(h3, a, true);
    const again = [];for (let i = 0; i < 6; i++) { const q = ROUTEDIAG.agentPlan(D, B, h3, { patience: 99 });if (!q.length) break;again.push(q[0].kind); }assert.ok(again.includes('rip'), again.join()); }
  // stage 2: Claude prescribes for the agent whose turn it is; the validator enforces the hard rules in code
  { assert.equal(ROUTEDIAG.agentNext(D, {}), 'gate');assert.equal(ROUTEDIAG.agentNext(D, { _yield: { gate: 3 } }), 'mcu');assert.equal(ROUTEDIAG.agentNext(D0, {}), null);
    const tried = [{ agent: 'gate', cmd: 'route --nets PH_W_HO --rip X --first PH_W_HO', res: '되돌림 — 변화 없음' }, { agent: 'mcu', cmd: 'pinswap --nets Z --apply --route', better: true, res: '채택 — 신호 미연결 2 → 1' }];
    const pr = ROUTEDIAG.agentPrompt(D, B, 'gate', tried, { cmd: 'route --nets PH_W_HO --refill --exp 1200000' });
    assert.match(pr, /게이트 · EMC 에이전트/);assert.match(pr, /PH_W_HO/);assert.ok(!pr.includes(mcuNet + ':') && !new RegExp('^\\s*[-·]?\\s*' + mcuNet + '\\b', 'm').test(pr.split('담당 미연결')[1].split('이미 시도')[0]), 'only the agent\'s own open nets are described');
    assert.match(pr, /이미 시도 \(이 담당\): route --nets PH_W_HO --rip X --first PH_W_HO ⇒ 되돌림/);assert.match(pr, /다른 담당이 방금 바꾼 것: pinswap --nets Z/);assert.match(pr, /규칙 엔진의 다음 제안\(참고\): route --nets PH_W_HO --refill/);assert.match(pr, /\{"cmd":/);
    const chk = (k, ans, seen) => ROUTEDIAG.agentCheck(B, D, k, ans, seen);const sig = B.comps.find(c => /TC3\d\d/.test(c.val)).pads.map(p => p.net).filter(n => n && own(n) === 'mcu' && n !== mcuNet)[0];
    // a rip list with power and unknown nets: they are dropped, --first is forced, the exploration budget is capped
    const r1 = chk('gate', { cmd: `route --nets PH_W_HO,${mcuNet} --rip GND,PH_W,+12V,${sig},NOPE,PH_V_HO --exp 99999999`, why: '게이트 저항 주변을 뜯음' });
    assert.equal(r1.cmd, `route --nets PH_W_HO --rip ${sig},PH_V_HO --first PH_W_HO --exp 2400000`);assert.equal(r1.agent, 'gate');assert.equal(r1.ai, true);assert.match(r1.why, /^\[게이트 · EMC · Claude\] 게이트 저항 주변을 뜯음 \(뜯지 못하는 넷 제외: GND, PH_W, \+12V\)/);
    // the MCU agent may not lift a gate net; with nothing left to lift the route becomes a --refill search
    assert.equal(chk('mcu', { cmd: `route --nets ${mcuNet} --rip PH_V_HO,GND` }).cmd, `route --nets ${mcuNet} --refill --first ${mcuNet}`);
    assert.match(chk('mcu', { cmd: 'route --nets PH_W_HO --rip ' + sig }).err, /담당 미연결 넷이 없음/);assert.match(chk('gate', { cmd: 'route --rip ' + sig }).err, /담당/);
    for (const bad of ['unroute', 'reset --seed 3', 'board size 200 200', 'fix', 'route']) assert.ok(chk('gate', { cmd: bad }).err, bad);
    assert.ok(chk('gate', null).err);assert.ok(chk('gate', { cmd: '' }).err);assert.equal(JSON.stringify(chk('gate', { pass: true, why: '남은 처방 없음' })), JSON.stringify({ pass: true, why: '남은 처방 없음' }));
    // parts: small ones only, moved at most 3 mm, never re-routed by the move itself; one partial route follows
    const two = B.comps.find(c => /^R/.test(c.ref) && c.pads.length === 2 && c.pads.some(p => own(p.net) !== 'power'));const cx = (two.bb[0] + two.bb[2]) / 2, cy = (two.bb[1] + two.bb[3]) / 2;
    const mv = chk('gate', { cmd: `move ${two.ref} ${(cx + 1).toFixed(2)} ${cy.toFixed(2)}` });assert.match(mv.cmd, new RegExp(`^move ${two.ref} [\\d.]+ [\\d.]+ --no-route$`));assert.match(mv.then, /^route --nets \S+ --refill --first PH_W_HO$/);assert.ok(!/GND|\+12V/.test(mv.then));
    assert.match(chk('gate', { cmd: `move ${two.ref} ${(cx + 9).toFixed(2)} ${cy.toFixed(2)}` }).err, /3 mm/);assert.match(chk('gate', { cmd: `rotate ${B.comps.find(c => /TC3\d\d/.test(c.val)).ref} 180` }).err, /작은 부품/);
    assert.equal(chk('gate', { cmd: `rotate ${two.ref} 90` }).cmd, `rotate ${two.ref} 180 --no-route`);assert.equal(chk('mcu', { cmd: `pinswap --nets ${mcuNet}` }).cmd, `pinswap --nets ${mcuNet} --apply --route`);
    // a repeat is refused
    assert.match(chk('gate', { cmd: `route --nets PH_W_HO --rip ${sig}` }, new Set([`route --nets PH_W_HO --rip ${sig} --first PH_W_HO`])).err, /이미 시도/); }
  // verifier
  const V = (b, a, bo, ao) => ROUTEDIAG.verdict({ vec: b, openNets: bo || {} }, { vec: a, openNets: ao || {} });
  assert.deepEqual([V([0, 0, 0, 1, 5, 1], [0, 0, 0, 1, 4, 2]).ok, V([0, 0, 0, 1, 5, 1], [0, 0, 0, 1, 4, 2]).better], [true, true]);       // a signal closed, one more hot via: accepted
  assert.equal(V([0, 0, 0, 1, 5, 1], [0, 0, 0, 2, 2, 1]).ok, false);                                                                    // three signals closed for one gate net: refused
  assert.equal(V([0, 0, 0, 0, 6, 0], [0, 0, 1, 0, 0, 0]).ok, false);                                                                    // all signals closed but a power net under width: refused
  assert.equal(V([1, 0, 0, 0, 6, 0], [1, 0, 0, 0, 3, 0], { PH_U: 'power' }, { PH_V: 'power' }).ok, false);                              // a connected power net came open
  assert.match(V([1, 0, 0, 0, 6, 0], [1, 0, 0, 0, 3, 0], { PH_U: 'power' }, { PH_V: 'power' }).why, /PH_V/);
  assert.deepEqual([V([0, 0, 0, 0, 2, 0], [0, 0, 0, 0, 2, 0]).ok, V([0, 0, 0, 0, 2, 0], [0, 0, 0, 0, 2, 0]).better], [true, false]);
  // the old scalar score would have taken the gate-for-signals trade
  assert.ok(ROUTEDIAG.score({ rats: 4, drc: 0, badPower: [], badVia: [0] }) < ROUTEDIAG.score({ rats: 6, drc: 0, badPower: [], badVia: [0] }));
});
