// current model 2: profile RMS, per-switch share of a 3-phase bridge, ambient budget, IPC-2152 as a selectable standard
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
function board(L, model, params, pcb) {
  const { HWARCH, NEWPROJ, PRODUCTS } = L;const prof = PRODUCTS.detect('Dadu');const ans = { cur: '~20 A (팬 · 소형 펌프)' };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[0].label;
  const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, 'Dadu').arch).plan;assert.equal(plan.curModel, 2);plan.curModel = model;plan.board = { w: 100, h: 65 };if (pcb) plan.pcb = pcb;
  Object.assign(plan.blocks.find(b => b.type === 'gdrv3').params, params || {});return NEWPROJ.toBoard(plan, { place: false }).B;
}
test('IPC-2152 fit reproduces the published worked example and is stricter than IPC-2221 outer without a plane', () => {
  const { CURRENT: C } = load();
  near(C.area2152(1, 40) * 645.16, 3361, 15); // µm², 1 A · ΔT 40 °C
  const m = C.mods2152(1, { oz: 1, tb: 1.6, plane: 1.6 });near(m.t, 0.903, 0.002);near(m.board, 1.092, 0.002);near(m.plane, 0.602, 0.002);
  const o = { oz: 2, dT: 20, tb: 1.6 };assert.ok(C.ipc2152Width(20, o) > 2 * C.ipcWidth(20, o));
  const w = C.ipc2152Width(20, Object.assign({ plane: 0.23 }, o));assert.ok(w > C.ipcWidth(20, o) && w < 1.3 * C.ipcWidth(20, o), String(w));
  near(C.ipc2152Rise(w, 20, Object.assign({ plane: 0.23 }, o)), 20, 0.5); // rise is the inverse of width
  assert.ok(C.mods2152(60, { oz: 2 }).t >= 0.7); // the copper-weight polynomial is not followed where it diverges
  assert.equal(C.wFor(20, o), C.ipcWidth(20, o));assert.equal(C.wFor(20, Object.assign({ std: '2152', plane: 0.23 }, o)), w);
});
test('profile: RMS over the cycle, single events only as peaks; ambient sets the allowed rises', () => {
  const { CURRENT: C } = load();
  const p = C.profile(20, '40@2/30, 60@0.1');near(p.rms, Math.sqrt(400 * (1 - 2 / 30) + 1600 * 2 / 30), 0.01);assert.equal(p.peaks.length, 2);assert.equal(p.peaks[0].I, 60);
  assert.equal(C.profile(20, '', { I: 40, t: 2 }).rms, 20);near(C.profile(20, '', { I: 40, t: 2, T: 30 }).rms, 21.91, 0.01);assert.equal(C.profile(20, '10@5/10').rms, 20);
  const b = C.budget(85);assert.equal(b.dT, 20);assert.equal(b.dTpk, 40);assert.equal(C.budget(95).dT, 10);assert.ok(C.budget(103).tight);
  // a long lower peak can decide the width even when the highest one is short
  const o = { oz: 1, dT: 20, dTpk: 40, tb: 1.6 };const a = C.needWidth(5, { I: 30, t: 0.01 }, o), c = C.needWidth(5, { I: 30, t: 0.01, more: [{ I: 20, t: 5 }] }, o);assert.ok(c.w > a.w, `${c.w} > ${a.w}`);
});
test('3-phase bridge: leg-return nets and switch terminals carry I/√2, phases and the DC link the full value; old plans are unchanged', () => {
  const L = load();const B1 = board(L, 1, { ipk: 40, tpk: 2 }), B2 = board(L, 2, { ipk: 40, tpk: 2 });
  assert.equal(B1.netCurrent.PH_U, 20);assert.equal(B1.netCurrent.PH_U_SNS, 20);assert.ok(!B1.comps.some(c => c.It > 0));assert.equal(B1.curModel, undefined);
  assert.equal(B2.curModel, 2);assert.equal(B2.netCurrent.PH_U, 20);assert.equal(B2.netCurrent['+12V'], 20);near(B2.netCurrent.PH_U_SNS, 14.14, 0.01);assert.equal(B2.netPeak.PH_U_SNS.I, 40);
  const q = B2.comps.filter(c => /^Q/.test(c.ref) && c.It > 0);assert.equal(q.length, 3);q.forEach(c => { near(c.It, 14.14, 0.01);assert.equal(c.Itpk, 40);assert.match(c.Itx, /^PH_[UVW]$/); });
  const W1 = L.CURRENT.widths(B1, { oz: B1.oz, dT: B1.dT, cap: 99 }), W2 = L.CURRENT.widths(B2, { oz: B2.oz, dT: B2.dT, cap: 99 });
  assert.equal(W2.PH_U.ipc, W1.PH_U.ipc);assert.ok(W2.PH_U_SNS.ipc < 0.85 * W1.PH_U_SNS.ipc, `${W2.PH_U_SNS.ipc} / ${W1.PH_U_SNS.ipc}`);assert.equal(W2.PH_U_SNS.by, 'peak'); // 14.1 A alone would need 3.8 mm; the 40 A · 2 s peak sets 4.9 mm
  // a repeating peak raises every copper current to the RMS; the ambient and the standard reach the board
  const B3 = board(L, 2, { ipk: 40, tpk: 2, tper: 30 }, { tamb: 95, std: '2152' });near(B3.netCurrent.PH_U, 21.91, 0.01);near(B3.netCurrent.PH_U_SNS, 15.49, 0.01);near(B3.netCurrent.VIN_RAW, 21.91, 0.01);
  assert.equal(B3.dT, 10);assert.equal(B3.dTpk, 30);assert.equal(B3.tamb, 95);assert.equal(B3.ipcStd, '2152');assert.equal(L.CURRENT.widths(B3, { oz: B3.oz, dT: B3.dT }).PH_U.std, '2152');
  const B4 = board(L, 2, { ipk: 60, tpk: 0.1, prof: '40@2/30' });assert.equal(B4.netPeak.PH_U.I, 60);assert.equal(B4.netPeak.PH_U.more[0].I, 40);
  // via check: a switch terminal is rated at its own share
  const Bv = board(L, 2, {});const hs = Bv.comps.find(c => /^Q/.test(c.ref) && c.It > 0 && c.pads.some(p => p.net === '+12V'));const pd = hs.pads.find(p => p.net === '+12V');Bv.vias = [{ x: pd.x, y: pd.y, net: '+12V', drill: 0.3, d: 0.6 }];
  const v2 = L.CURRENT.viaCheck(Bv, { nets: ['+12V'], I: { '+12V': 20 } }).find(x => x.ref === hs.ref);near(v2.I, 14.14, 0.01);
  // …but the phase pad of a half-bridge package carries the whole phase current
  const pp = hs.pads.find(p => p.net === hs.Itx);Bv.vias.push({ x: pp.x, y: pp.y, net: hs.Itx, drill: 0.3, d: 0.6 });assert.equal(L.CURRENT.viaCheck(Bv, { nets: [hs.Itx], I: { [hs.Itx]: 20 } }).find(x => x.ref === hs.ref).I, 20);hs.It = 0;assert.equal(L.CURRENT.viaCheck(Bv, { nets: ['+12V'], I: { '+12V': 20 } }).find(x => x.ref === hs.ref).I, 20);
});
test('capacity methods other than a wider pattern: inner layers, mask opening + solder, busbar', () => {
  const L = load();const C = L.CURRENT;
  // equivalent outer width of 1 mm on each layer
  assert.equal(C.layerWeight({ oz: 2 }, 0, 8), 1);near(C.layerWeight({ oz: 2 }, 3, 8), 0.5 * Math.pow(0.5, 1 / 0.725), 0.001); // inner 1 oz under 2 oz outer, IPC-2221 inner chart
  near(C.layerWeight({ oz: 2, ozIn: 2 }, 3, 8), 0.384, 0.001);assert.equal(C.layerWeight({ oz: 2, ozIn: 2, ipcStd: '2152' }, 3, 8), 1);assert.equal(C.layerWeight({ oz: 1, ozIn: 2 }, 3, 8), C.layerWeight({ oz: 1 }, 3, 8)); // never above the outer weight
  near(C.layerWeight({ oz: 2, maskOpen: true }, 0, 8), 1.188, 0.001);near(C.layerWeight({ oz: 1, maskOpen: true }, 7, 8), 1.376, 0.001);assert.equal(C.layerWeight({ oz: 2, maskOpen: true }, 3, 8), C.layerWeight({ oz: 2 }, 3, 8));
  assert.deepEqual(JSON.stringify(C.parseBusbar('5x1')), '{"w":5,"t":1}');assert.equal(JSON.stringify(C.parseBusbar('1.5×8')), '{"w":8,"t":1.5}');assert.equal(C.parseBusbar('off'), null);assert.equal(C.parseBusbar('wide'), null);
  near(C.busbarWidth({ oz: 2, busbar: { w: 5, t: 1 } }), 71.43, 0.01);assert.equal(C.busbarWidth({ oz: 2 }), 0);
  assert.equal(C.methods({ oz: 2 }).length, 0);assert.equal(C.methods({ oz: 2, copperLayers: 8, innerPower: true, maskOpen: true, busbar: { w: 5, t: 1 } }).length, 3);
  // design-time choice reaches the board, a snapshot and the KiCad file
  const B = board(L, 2, {}, { layers: 8, inner: 'on', ozin: 1, mask: true, busbar: '5x1' });assert.equal(B.innerPower, true);assert.equal(B.ozIn, 1);assert.equal(B.maskOpen, true);assert.equal(B.busbar.w, 5);
  const B0 = board(L, 2, {});assert.ok(!B0.innerPower && !B0.maskOpen && !B0.busbar);
  const S = L.BOARDSNAP.save(B, {});assert.equal(S.cap.inner, 1);assert.equal(S.cap.mask, 1);assert.equal(S.cap.busbar.t, 1);
  const S0 = L.BOARDSNAP.save(B0, {});assert.equal(S0.cap, undefined);
  const k0 = L.PCB.cuKeys(B)[0];B.layers[k0 + '.cu'].push({ t: 'poly', rings: [[[10, 10], [14, 10], [14, 12], [10, 12]]], rect: [10, 10, 14, 12], net: 'PH_U', fill: true });
  const kc = L.PCBEDIT.toKicadPcb(B);assert.match(kc, /\(gr_rect [^\n]*\(fill solid\) \(layer "F\.Mask"\)/);
  B.maskOpen = false;assert.doesNotMatch(L.PCBEDIT.toKicadPcb(B), /\(fill solid\) \(layer "F\.Mask"\)/);
});
