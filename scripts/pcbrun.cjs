#!/usr/bin/env node
/* Headless design run: build a board from a product profile, run PCB console commands, report the result.
   One config per process — start several in the background to compare seeds / sizes in parallel.

   node scripts/pcbrun.cjs --profile Dadu --cur "~20 A (팬 · 소형 펌프)" --tag t1 --out /tmp/runs \
     --cmds "board layers 8; board size 85 55 --anchor center; reset --strategy compact --both --seed 1; route"

   Options: --fet N (index of the FET question option, default 0) · --shrink 2 · --w 100 --h 65 (generated size)
            --snap (also write <tag>.snap.json, a BOARDSNAP) · --kicad (write <tag>.kicad_pcb) · --shots (top/bottom PNG)
   Prints one JSON line: {tag, W, H, layers, bottom, rats, drc, power:[{net,width,need,ok}], ok, steps:[{cmd,s}], ratNets}
   ok = no unconnected pads, DRC 0 and every power net at its IPC width. Exit code 0 when ok, 1 otherwise. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const root = path.join(__dirname, '..');
const out = path.resolve(arg('out', path.join(root, '.runs')));fs.mkdirSync(out, { recursive: true });
const tag = arg('tag', 'run');
const cmds = String(arg('cmds', 'route')).split(';').map(s => s.trim()).filter(Boolean);
// test page: the built app with a few hooks into its closure
const html = path.join(out, '_test.html');
const dist = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
if (!fs.existsSync(html) || fs.statSync(html).mtimeMs < fs.statSync(path.join(root, 'dist/index.html')).mtimeMs)
  fs.writeFileSync(html, dist.replace('function setBoard(B){', 'window.__setBoard=setBoard;window.__cli=(l)=>cliExec(l);window.__BD=()=>BD;window.__CLI=()=>CLI;\nfunction setBoard(B){'));
(async () => {
  const b = await chromium.launch();const p = await b.newPage({ viewport: { width: 1500, height: 950 } });const errs = [];p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + html);await p.waitForTimeout(1000);await p.click('#homeOpen').catch(() => {});await p.waitForTimeout(600);
  await p.evaluate(o => {
    const prof = PRODUCTS.detect(o.profile);const ans = { cur: o.cur };const fq = prof.questions.find(q => q.key === 'fet');if (fq) ans.fet = fq.options[o.fet].label;
    const plan = HWARCH.toPlan(PRODUCTS.apply(prof, ans, o.profile).arch).plan;plan.shrink = o.shrink;plan.strategy = 'compact';plan.board = { w: o.w, h: o.h };plan.name = o.profile;
    const { B } = NEWPROJ.toBoard(plan, { place: false });B.source = '신규 설계';B.name = o.profile;B.pcbPending = true;window.__setBoard(B);window.__CLI().autoFix = false;
  }, { profile: arg('profile', 'Dadu'), cur: arg('cur', '~20 A (팬 · 소형 펌프)'), fet: +arg('fet', 0), shrink: +arg('shrink', 2), w: +arg('w', 100), h: +arg('h', 65) });
  const steps = [];for (const c of cmds) { const t = Date.now();await p.evaluate(c => window.__cli(c), c);steps.push({ cmd: c, s: +((Date.now() - t) / 1000).toFixed(1) }); }
  const r = await p.evaluate(() => {
    const B = window.__BD();const R = PCBEDIT.ratsnest(B);const pr = B.powerReport;const by = {};R.forEach(x => { by[x.net] = (by[x.net] || 0) + 1; });
    const power = pr ? pr.nets.map(n => ({ net: n.net, width: n.width, need: n.need, ok: n.width === '직결' || n.width >= n.need })) : [];
    const drc = PCBEDIT.drc(B);
    return { W: B.W, H: B.H, layers: PCB.cuKeys(B).length, bottom: B.comps.filter(c => c.side === 'B').length, rats: R.length, ratNets: by, drc: drc.length, drcMsgs: drc.slice(0, 5).map(d => d.msg), power, log: (window.__CLI().log || []).slice(-3).map(e => String(e.t).slice(0, 400)) };
  });
  r.tag = tag;r.steps = steps;r.ok = !r.rats && !r.drc && r.power.every(x => x.ok);r.errors = errs.slice(0, 3);
  if (arg('snap')) fs.writeFileSync(path.join(out, tag + '.snap.json'), await p.evaluate(m => JSON.stringify(BOARDSNAP.save(window.__BD(), m)), { name: arg('profile', 'Dadu'), profile: arg('profile', 'Dadu'), fet: +arg('fet', 0), cur: arg('cur', '~20 A (팬 · 소형 펌프)'), shrink: +arg('shrink', 2), strategy: 'compact', W: +arg('w', 100), H: +arg('h', 65) }));
  if (arg('kicad')) fs.writeFileSync(path.join(out, tag + '.kicad_pcb'), await p.evaluate(() => PCBEDIT.toKicadPcb(window.__BD(), { title: window.__BD().name })));
  if (arg('shots')) { await p.locator('#v-top').click().catch(() => {});await p.waitForTimeout(1000);await p.screenshot({ path: path.join(out, tag + '_top.png') });await p.locator('#v-bot').click().catch(() => {});await p.waitForTimeout(1000);await p.screenshot({ path: path.join(out, tag + '_bot.png') }); }
  console.log(JSON.stringify(r));await b.close();process.exit(r.ok ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ tag, ok: false, error: String(e && e.message || e) }));process.exit(2); });
