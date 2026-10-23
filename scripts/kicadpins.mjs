// Build the bundled pin table (src/parts/kicadpins.js) from KiCad symbol libraries.
// usage: node scripts/kicadpins.mjs <dir> [dir …]  (.lib/.dcm or .kicad_sym; earlier dirs win — put the newest KiCad first)
// Picks the MPNs the app names (PARTRANK candidates, product-profile candidates, built-in PARTS, DSDB items) and stores
// only those symbols' pins, so the app stays small. KiCad libraries: CC-BY-SA 4.0 with the KiCad library exception.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = process.argv.slice(2), dir = dirs[0]; if (!dir) { console.error('usage: node scripts/kicadpins.mjs <kicad-symbols dir>'); process.exit(1); }
const ctx = vm.createContext({ console });
for (const f of ['src/core/pcb-core.js','src/parts/parts.js','src/core/newproj.js','src/core/hwarch.js','src/core/products.js','src/core/partrank.js','src/core/kicadlib.js','src/core/partlib.js'])
  vm.runInContext(readFileSync(join(root, f), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx, { filename: f });
const g = n => vm.runInContext(n, ctx);
const KL = g('KICADLIB'), PR = g('PARTRANK'), PARTS = g('PARTS'), PRODUCTS = g('PRODUCTS');
const mpns = new Set();
Object.values(PR.C).forEach(L => L.forEach(p => mpns.add(p.mpn)));
for (const k of ['eps', 'bms', 'bcm', 'inv']) { try { const p = PRODUCTS.detect({ eps: 'EPS', bms: 'BMS 배터리 관리', bcm: 'BCM 바디', inv: '인버터 트랙션' }[k]); if (p) p.blocks.forEach(b => (b.parts || []).forEach(x => mpns.add(x.mpn))); } catch (e) {} }
Object.keys(PARTS.P || {}).forEach(m => mpns.add(m));
try { g('PARTLIB').AUTO_PARTS.forEach(p => mpns.add(p.mpn)); } catch (e) {}
try { const s = readFileSync(join(root, 'src/parts/dsdb.js'), 'utf8'); const d = JSON.parse(s.match(/const DSDB=(\{.*\});/s)[1]); Object.keys(d.items).forEach(m => mpns.add(m.replace(/\s*\(.*\)$/, ''))); } catch (e) {}
const files = dirs.flatMap(d => readdirSync(d).filter(f => /\.(lib|dcm|kicad_sym)$/i.test(f)).map(f => ({ name: f, text: readFileSync(join(d, f), 'utf8') })));
const P = KL.parseFiles(files);
const hit = KL.pick(P.parts, [...mpns]);
const keep = {}; Object.entries(hit).forEach(([m, r]) => { keep[m] = { k: r.kicad, l: r.lib, m: r.match, fp: r.fp, pkg: r.pkg, pdf: r.pdf, t: r.title, p: r.pins.map(x => [x.num, x.name, x.type]) }; });
// hand-entered pin tables from datasheets for parts the KiCad libraries lack (KiCad matches win)
try { const X = JSON.parse(readFileSync(join(root, 'datasheets/pins.json'), 'utf8')); Object.entries(X).forEach(([m, r]) => { if (m[0] === '_' || keep[m]) return; keep[m] = { k: m, l: 'datasheet', m: 'exact', fp: r.fp || '', pkg: r.pkg || '', pdf: r.pdf || '', t: r.t || '', p: r.p }; }); } catch (e) { console.error('pins.json:', e.message); }
const out = `/* Pin tables of the parts the app names, extracted from the KiCad symbol libraries by scripts/kicadpins.mjs
   (${files.length} files, ${P.parts.length} symbols scanned · ${Object.keys(keep).length} of ${mpns.size} part numbers matched).
   KiCad libraries: CC-BY-SA 4.0 with the KiCad library exception. Record: {k: KiCad symbol, l: library, m: exact|prefix, fp, pkg, pdf, t: description, p: [[num,name,type]]} */
const KPINS=${JSON.stringify(keep)};
if(typeof module!=='undefined')module.exports=KPINS;
`;
writeFileSync(join(root, 'src/parts/kicadpins.js'), out);
console.log(`symbols ${P.parts.length} · names ${mpns.size} · matched ${Object.keys(keep).length} (${Object.values(keep).filter(x => x.m === 'exact').length} exact) · ${(out.length / 1024).toFixed(1)} KB`);
console.log(Object.entries(keep).map(([m, r]) => `${m}${r.m === 'prefix' ? '~' + r.k : ''}(${r.p.length})`).join(' '));
