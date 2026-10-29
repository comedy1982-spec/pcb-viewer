// Datasheet HTML database: datasheets/db/<slug>.html (one page per part, written from the real datasheet)
//   node scripts/dsdb.mjs          → bundles every page into src/parts/dsdb.js (embedded in dist/index.html) and datasheets/db/index.json
//   node scripts/dsdb.mjs --init   → also writes a stub page for every part in src/parts/parts.js that has no page yet
// Page format (see datasheets/db/README.md): an <article data-mpn data-mfr data-cat data-price> with <h1>, a "핵심 사양" <dl>,
// and sections such as 절대 최대 정격 · 권장 동작 조건 · 핀 배치 · 응용 회로 · 패키지 · 설계 메모. Everything inside <article> is shown in the app.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = join(root, 'datasheets/db');
mkdirSync(dbDir, { recursive: true });
const PARTS = (() => { const ctx = vm.createContext({ console }); vm.runInContext(readFileSync(join(root, 'src/parts/parts.js'), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx); return vm.runInContext('PARTS', ctx); })();
const init = process.argv.includes('--init');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (mpn) => String(mpn).replace(/\s*\(.*\)$/, '').replace(/[^A-Za-z0-9.+-]+/g, '_');

function stub(mpn, p) {
  const price = PARTS.price(mpn, p.cat);
  const specs = (p.specs || []).map(([k, v]) => `      <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n');
  const links = PARTS.links(p, mpn).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(' · ');
  const th = p.therm ? `      <dt>열 저항</dt><dd>${['thJB', 'thJC', 'psiJT'].filter((k) => p.therm[k] != null).map((k) => `${k === 'thJB' ? 'θJB' : k === 'thJC' ? 'θJC' : 'ΨJT'} ${p.therm[k]} °C/W`).join(' · ')}${p.therm.tjmax ? ` · Tj,max ${p.therm.tjmax} °C` : ''}</dd>\n` : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(mpn)} · ${esc(p.title)}</title>
<style>
body{font-family:"IBM Plex Sans KR",system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;line-height:1.55;color:#1b1f23}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #d8dde2;padding-bottom:4px}
.meta{color:#5a6872;font-size:13px}dl{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;margin:8px 0}dt{color:#5a6872}dd{margin:0}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d8dde2;padding:4px 8px;text-align:left}
.todo{background:#fff6dd;border:1px dashed #d9a62b;border-radius:8px;padding:8px 12px;font-size:13px}
</style>
</head>
<body>
<article data-mpn="${esc(mpn)}" data-mfr="${esc(p.mfr)}" data-cat="${esc(p.cat || '')}" data-price="${price != null ? price : ''}" data-status="stub">
  <h1>${esc(mpn)}</h1>
  <p class="meta">${esc(p.mfr)} · ${esc(p.cat || '')} · ${esc(p.title)}${price != null ? ` · 참고 단가 약 $${price} (추정)` : ''}</p>
  <p class="meta">원본: ${links || '(링크 없음)'}</p>
  <p class="todo">이 페이지는 부품 DB의 요약으로 만든 초안입니다. 실제 데이터시트를 보고 아래 항목을 채우고, 다 채우면 data-status를 "done"으로 바꾸세요.</p>

  <h2>핵심 사양</h2>
  <dl>
${specs || '      <dt>-</dt><dd>데이터시트에서 옮겨 적기</dd>'}
${th}  </dl>

  <h2>절대 최대 정격</h2>
  <table><thead><tr><th>항목</th><th>최소</th><th>최대</th><th>단위</th><th>비고</th></tr></thead>
    <tbody><tr><td>[전원 전압]</td><td></td><td></td><td>V</td><td></td></tr></tbody></table>

  <h2>권장 동작 조건</h2>
  <table><thead><tr><th>항목</th><th>최소</th><th>일반</th><th>최대</th><th>단위</th></tr></thead>
    <tbody><tr><td>[동작 전압]</td><td></td><td></td><td></td><td>V</td></tr><tr><td>[동작 온도]</td><td>-40</td><td></td><td>85</td><td>°C</td></tr></tbody></table>

  <h2>핀 배치</h2>
  <table><thead><tr><th>핀</th><th>이름</th><th>기능</th></tr></thead>
    <tbody><tr><td>1</td><td></td><td></td></tr></tbody></table>

  <h2>응용 회로 · 주변 부품</h2>
  <ul><li>[디커플링·바이패스 커패시터 값과 위치]</li><li>[외부 저항·인덕터 선정식]</li></ul>

  <h2>패키지 · 열</h2>
  <p>[패키지 치수, 노출 패드 연결, θJA/θJC]</p>

  <h2>설계 메모</h2>
  <ul><li>[이 부품을 고를 때·배치할 때 주의할 점]</li><li>[대체 부품]</li></ul>
</article>
</body>
</html>
`;
}

if (init) {
  let n = 0;
  Object.entries(PARTS.P).forEach(([mpn, p]) => {
    const f = join(dbDir, slug(mpn) + '.html');
    if (existsSync(f)) return;
    writeFileSync(f, stub(mpn, p));
    n++;
  });
  console.log(`stub pages written: ${n}`);
}

// bundle
const items = {};
readdirSync(dbDir).filter((f) => f.endsWith('.html')).sort().forEach((f) => {
  const html = readFileSync(join(dbDir, f), 'utf8');
  const m = html.match(/<article\b([^>]*)>([\s\S]*?)<\/article>/i);
  if (!m) { console.warn(`skip ${f}: no <article>`); return; }
  const attr = (k) => { const r = m[1].match(new RegExp(`data-${k}="([^"]*)"`)); return r ? r[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : ''; };
  const mpn = attr('mpn') || f.replace(/\.html$/, '');
  const h1 = (m[2].match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || mpn;
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || h1;
  const price = attr('price');
  items[mpn] = { file: 'datasheets/db/' + f, mfr: attr('mfr'), cat: attr('cat'), price: price === '' ? null : +price, status: attr('status') || 'done', alias: attr('alias') || undefined, src: attr('src') || undefined, title: title.replace(/<[^>]+>/g, '').trim(), html: m[2].trim() };
});
const built = new Date().toISOString().slice(0, 10);
writeFileSync(join(dbDir, 'index.json'), JSON.stringify({ built, items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { file: v.file, mfr: v.mfr, cat: v.cat, price: v.price, status: v.status, alias: v.alias, title: v.title }])) }, null, 2));
const js = `/* generated by scripts/dsdb.mjs from datasheets/db/*.html — do not edit; edit the HTML pages and rebuild */
const DSDB=${JSON.stringify({ built, items })};
if(typeof module!=='undefined')module.exports=DSDB;
`;
mkdirSync(join(root, 'src/parts'), { recursive: true });
writeFileSync(join(root, 'src/parts/dsdb.js'), js);
console.log(`dsdb: ${Object.keys(items).length} pages → src/parts/dsdb.js (${(js.length / 1024).toFixed(0)} KB), datasheets/db/index.json`);
