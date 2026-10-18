import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { load } from './load.mjs';
const { PCB, HOUSING, TEXT2CAD, SAMPLE_TC364 } = load();
// SvgCtx alone, out of the viewer file
const svgSrc = readFileSync(new URL('../src/app/exportui.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(svgSrc.slice(0, svgSrc.indexOf('/* ---- renderers')), ctx);
const SvgCtx = vm.runInContext('SvgCtx', ctx);

test('SvgCtx records canvas drawing as well-formed SVG with transforms, clips and text', () => {
  const c = new SvgCtx(200, 100);
  c.setTransform(2, 0, 0, -2, 10, 90);
  c.save(); c.beginPath(); c.rect(0, 0, 50, 40); c.clip('evenodd');
  c.fillStyle = '#c7763d'; c.beginPath(); c.moveTo(0, 0); c.lineTo(50, 0); c.lineTo(50, 40); c.closePath(); c.fill('evenodd');
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.5; c.setLineDash([1, 1]); c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 10); c.stroke();
  c.beginPath(); c.arc(5, 5, 2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(0, 0); c.arcTo(10, 0, 10, 10, 3); c.lineTo(10, 10); c.stroke();
  c.save(); c.translate(5, 5); c.rotate(Math.PI / 2); c.scale(0.5, -0.5); c.font = '600 20px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('U1', 0, 0); c.restore();
  c.restore();
  const svg = c.svg({ bg: '#fff' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="100"/);
  assert.match(svg, /<clipPath id="c1"><path d="M10 90 L110 90 L110 10 L10 10 Z" clip-rule="evenodd"\/><\/clipPath>/, 'rect under the transform');
  assert.match(svg, /<g clip-path="url\(#c1\)">[\s\S]*<\/g>/);
  assert.match(svg, /stroke-width="1" stroke-linecap="butt"[^>]*stroke-dasharray="2 2"/, 'line width and dash scale with the transform');
  assert.match(svg, /<text transform="matrix\([-\d. ]+\)" x="0" y="0" font-size="20" font-weight="600" font-family="'JetBrains Mono', monospace" text-anchor="middle" dominant-baseline="central"[^>]*>U1<\/text>/);
  assert.equal((svg.match(/<g /g) || []).length, (svg.match(/<\/g>/g) || []).length);
  assert.equal(c.stack.length, 0);
});

test('housing drawing SVG shows the three views, dimensions and the features', () => {
  const B = PCB.finalize(PCB.fromSpec(JSON.parse(JSON.stringify(SAMPLE_TC364))));
  const st = { inp: { P: 'auto', ip: 'IP67', vib: 2, ta: 25, tmax: 85, tj: 125, mat: 'adc12', tim: 'auto' }, cad: null };
  ['gland E M16 --n 2', 'tabs 4 --screw M5', 'label "AURIX ECU"', 'hole T --d 8 --u 30 --v 20'].forEach(c => TEXT2CAD.exec(st, c, HOUSING));
  const R = HOUSING.analyze(B, Object.assign({}, st.inp, { P: null, cad: st.cad }));
  const svg = HOUSING.drawingSVG(R, 'AURIX-364');
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/);
  for (const t of ['평면도', '정면도', '우측면도', 'AURIX ECU', 'F1 Ø16.5', 'F2 Ø16.5', 'F5 Ø8', '분할면', `${R.d.geo.Lo.toFixed(1)}`, 'AURIX-364 하우징']) assert.ok(svg.includes(t), t);
  assert.equal((svg.match(/<svg/g) || []).length, 1); assert.equal((svg.match(/<\/svg>/g) || []).length, 1);
  assert.ok(svg.length < 60000);
});
