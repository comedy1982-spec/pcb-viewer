import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { SIM } = load();
// 30 × 30 mm board, 1 W in the middle 3 × 3 cells on the top layer
function board(viaG) {
  const nx = 30, ny = 30, n = nx * ny, a = 1e-3; const mask = new Uint8Array(n).fill(1);
  const covT = new Float32Array(n).fill(0.3), covB = new Float32Array(n).fill(1); const vg = new Float64Array(n);
  const Pt = new Float64Array(n), Pb = new Float64Array(n);
  for (let j = 14; j < 17; j++) for (let i = 14; i < 17; i++) { Pt[j * nx + i] = 1 / 9; vg[j * nx + i] = viaG; }
  return { g: { nx, ny, a, mask, covT, covB, viaG: vg }, Pt, Pb };
}
const env = { t: 1.6, cuT: 35, cuB: 35, kxy: 0.3, kz: 0.3, hT: 7, hB: 7, eps: 0.9, Ta: 25 };

test('2-layer thermal solver conserves energy and splits convection/radiation', () => {
  const { g, Pt, Pb } = board(0);
  const r = SIM.thermalSolve2(g, env, Pt, Pb);
  assert.ok(Math.abs(r.qConv + r.qRad - 1) < 0.02, `heat out ${r.qConv + r.qRad}`);
  assert.ok(r.qRad / (r.qConv + r.qRad) > 0.2 && r.qRad / (r.qConv + r.qRad) < 0.6); // radiation matters in natural convection
  assert.ok(r.tmax > 25 && isFinite(r.tmax));
});

test('thermal vias lower the top-side hot spot; forced air lowers it further', () => {
  const g1 = SIM.viaG(0.3, 25, 1.6);
  const a = board(0), b = board(9 * g1);
  const ra = SIM.thermalSolve2(a.g, env, a.Pt, a.Pb), rb = SIM.thermalSolve2(b.g, env, b.Pt, b.Pb);
  const k = 15 * 30 + 15;
  assert.ok(rb.T[k] < ra.T[k] - 1, `vias: ${ra.T[k].toFixed(1)} → ${rb.T[k].toFixed(1)}`);
  assert.ok(rb.Tb[k] > ra.Tb[k], 'more heat reaches the bottom copper');
  const h = SIM.hConv('forced', 3); const rf = SIM.thermalSolve2(b.g, { ...env, ...h }, b.Pt, b.Pb);
  assert.ok(rf.T[k] < rb.T[k]);
  // one Ø0.3 mm via with 25 µm plating through 1.6 mm: ≈ 6–7 mW/K (≈ 150 °C/W)
  assert.ok(1 / g1 > 120 && 1 / g1 < 180, `R_via ${1 / g1}`);
});
