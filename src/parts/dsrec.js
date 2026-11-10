/* ---------- datasheet records: one structured JSON record per part (datasheets/records/<slug>.json) ----------
   The record is the single source: the datasheet tab and the HTML pages in datasheets/db are rendered from it, and the
   generator's candidate figures (key.spec / key.grade) come from it.

   record = {
     mpn, family?, alias?: ['RC0402FR-07*L', …],          order codes that share this datasheet (globs, * = any)
     mfr, cat, price?: USD ~1k, title,
     status: 'stub' | 'done' | 'verified',                 verified = checked again against the source by an independent pass
     verify?: { date, by, checked, note },
     src?: [url, …],                                       documents actually read
     meta: [html, …],                                      header lines (manufacturer · category · links · document number)
     todo?: html,                                          what is still missing (stub pages)
     key?: { spec: { i, vin:[min,max], vout, v, pkg, adj, sync, … }, grade, ext:[…] }   machine figures the generator ranks with
     issues?: [{ p, fix, url }],                           known problems with this part number in the tool
     sections: [{ h, blocks: [ {dl:[[k,v],…]} | {table:{head:[…],rows:[[…],…]}} | {html} ] }]
   }
   Cell / value strings may hold inline HTML (links, sub/sup). */
const DSREC = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const text = (h) => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const STATUS = ['stub', 'done', 'verified'];

  function block(b) {
    if (b.dl) return '<dl>\n' + b.dl.map(([k, v]) => `  <dt>${k}</dt><dd>${v}</dd>`).join('\n') + '\n</dl>';
    if (b.table) {
      const t = b.table;
      return '<table>' + (t.head && t.head.length ? `<thead><tr>${t.head.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` : '') +
        `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return b.html || '';
  }
  /* inner HTML of the page's <article> */
  function render(r) {
    const out = [`<h1>${esc(r.mpn)}</h1>`];
    (r.meta || []).forEach((m) => out.push(`<p class="meta">${m}</p>`));
    if (r.status === 'verified' && r.verify) out.push(`<p class="meta ds-verified">독립 재확인 ${esc(r.verify.date || '')} · ${esc(r.verify.note || '')}</p>`);
    if (r.todo) out.push(`<p class="todo">${r.todo}</p>`);
    if (r.issues && r.issues.length) out.push('<div class="ds-issues"><b>알려진 문제</b><ul>' + r.issues.map((x) => `<li>${esc(x.p)}${x.fix ? ` — <i>${esc(x.fix)}</i>` : ''}${x.url ? ` <a href="${esc(x.url)}" target="_blank" rel="noopener">근거</a>` : ''}</li>`).join('') + '</ul></div>');
    if (r.key && r.key.spec) { const k = r.key.spec, f = [];
      if (k.i != null) f.push(`전류 ${k.i} A`); if (k.vin) f.push(`입력 ${k.vin[0]}–${k.vin[1]} V`); if (k.vout != null) f.push(`출력 ${k.vout} V`); else if (k.adj) f.push('출력 가변');
      if (k.v != null) f.push(`내압 ${k.v} V`); if (k.sync != null) f.push(k.sync ? '동기' : '비동기'); if (k.pkg) f.push(k.pkg); if (r.key.grade) f.push(r.key.grade);
      Object.keys(k).filter((x) => !/^(i|vin|vout|v|adj|sync|pkg)$/.test(x)).forEach((x) => f.push(`${x} ${JSON.stringify(k[x])}`));
      out.push(`<p class="meta ds-key">부품 선택 기준값${r.key.mpn && r.key.mpn !== r.mpn ? ` (${esc(r.key.mpn)})` : ''}: ${esc(f.join(' · '))}${r.key.ext ? ` · 외부 부품 ${esc(r.key.ext.join(', '))}` : ''}${r.key.basis ? ` — ${esc(r.key.basis)}` : ''}</p>`); }
    (r.sections || []).forEach((s) => { if (s.h) out.push(`<h2>${s.h}</h2>`); (s.blocks || []).forEach((b) => out.push(block(b))); });
    return out.join('\n');
  }
  const STYLE = 'body{font-family:"IBM Plex Sans KR",system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;line-height:1.55;color:#1b1f23}\n' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #d8dde2;padding-bottom:4px}\n' +
    '.meta{color:#5a6872;font-size:13px}dl{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;margin:8px 0}dt{color:#5a6872}dd{margin:0}\n' +
    'table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d8dde2;padding:4px 8px;text-align:left}\n' +
    '.todo{background:#fff6dd;border:1px dashed #d9a62b;border-radius:8px;padding:8px 12px;font-size:13px}\n' +
    '.ds-issues{background:#fdecea;border:1px solid #e8a39b;border-radius:8px;padding:6px 12px;font-size:13px;margin:8px 0}.ds-issues ul{margin:4px 0 2px 18px;padding:0}\n' +
    '.ds-verified{color:#2e7d32}';
  /* stand-alone page (datasheets/db/<slug>.html) */
  function page(r) {
    const a = [['mpn', r.mpn], ['mfr', r.mfr], ['cat', r.cat], ['price', r.price == null ? '' : r.price], ['status', r.status]];
    if (r.alias && r.alias.length) a.push(['alias', r.alias.join(' ')]);
    if (r.src && r.src.length) a.push(['src', r.src.join(' ')]);
    return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(r.mpn)} · ${esc(r.title || '')}</title>\n<style>\n${STYLE}\n</style>\n</head>\n<body>\n<!-- generated from datasheets/records/${slug(r.mpn)}.json by scripts/dsdb.mjs — edit the record, not this page -->\n` +
      `<article ${a.map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>\n${render(r)}\n</article>\n</body>\n</html>\n`;
  }
  const slug = (mpn) => String(mpn).replace(/\s*\(.*\)$/, '').replace(/[^A-Za-z0-9.+-]+/g, '_');

  /* ---- reading the figures back ---- */
  const section = (r, re) => (r.sections || []).find((s) => re.test(text(s.h)));
  const num = (s) => { const t = text(s).replace(/[−–—‒]/g, '-').replace(/,/g, '.').replace(/^±/, ''); const m = t.match(/^[<>≤≥~약 ]*(-?\d+(?:\.\d+)?)\s*([kMmµu])?(?![A-Za-z])/); return m ? +m[1] * ({ k: 1e3, M: 1e6, m: 1e-3, 'µ': 1e-6, u: 1e-6 }[m[2]] || 1) : null; };
  /* rows of a min/typ/max table as {p, min, typ, max, u, note} (absolute maximum ratings, recommended operating conditions) */
  function rangeRows(r, re) {
    const s = section(r, re); if (!s) return [];
    const out = [];
    s.blocks.filter((b) => b.table).forEach(({ table: t }) => {
      const H = (t.head || []).map(text);
      const col = (rx) => H.findIndex((h) => rx.test(h));
      const ip = Math.max(0, col(/항목|파라미터|parameter|기호|핀|signal/i)), imin = col(/최소|min/i), ityp = col(/일반|typ|정격/i), imax = col(/최대|max/i), iu = col(/단위|unit/i), inote = col(/비고|조건|note|cond/i);
      if (imin < 0 && imax < 0) return;
      t.rows.forEach((row) => out.push({ p: text(row[ip]), min: imin >= 0 ? num(row[imin]) : null, typ: ityp >= 0 ? num(row[ityp]) : null, max: imax >= 0 ? num(row[imax]) : null, u: iu >= 0 ? text(row[iu]) : '', note: inote >= 0 ? text(row[inote]) : '' }));
    });
    return out;
  }
  const absmax = (r) => rangeRows(r, /절대 최대/);
  const roc = (r) => rangeRows(r, /권장 동작/);
  /* pin tables: [{pins:[[num,name,func]]}] from the 핀 배치 section (first column = pin number) */
  function pinTables(r) {
    const s = section(r, /핀 배치|핀 · |단자/); if (!s) return [];
    return s.blocks.filter((b) => b.table && b.table.head && /핀|pin|번호|단자|ball/i.test(text(b.table.head[0]))).map(({ table: t }) => ({ head: t.head.map(text), pins: t.rows.map((x) => x.map(text)) }));
  }
  /* values with units mentioned in the key-spec list, for cross-checking key.spec */
  function quantities(r, unitRe) {
    const s = section(r, /핵심 사양/); if (!s) return [];
    const all = []; const mul = { m: 1e-3, 'µ': 1e-6, u: 1e-6, k: 1e3, M: 1e6, '': 1 };
    s.blocks.forEach((b) => (b.dl || []).forEach(([k, v]) => { const t = text(k + ' ' + v).replace(/[−–]/g, '-');
      for (const m of t.matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(m|µ|u|k|M)?(' + unitRe + ')\\b', 'g'))) all.push(+m[1] * (mul[m[2] || ''] || 1)); }));
    return all;
  }

  /* package names → one comparable key: "SOIC-8" = "SO-8" = "8-SOIC" = "SO8"; "LQFP-48" = "48-LQFP" = "LQFP48"; "SOT-23-8" = "SOT23-8" */
  const PKSYN = [[/^(SOIC|SOICN|SOP|SO|SOIC_N)$/, 'SO'], [/^(µMAX|UMAX|MSOP|µSOP)$/, 'MSOP'], [/^(TSOT|SOT)$/, 'SOT'], [/^(VSON|WSON|SON)$/, 'SON'], [/^(LQFP|HLQFP|HDQFP|TQFP|QFP|PQFP|SPQFP)$/, 'QFP'], [/^(BGA|NFBGA|MAPBGA|FBGA)$/, 'BGA']];
  const syn = (l) => { for (const [re, v] of PKSYN) if (re.test(l)) return v; return l; };
  function pkgKey(p) { const m = String(p).toUpperCase().replace(/^PG-/, '').match(/^([A-ZΜµ]+)[\s_-]*((?:\d+[\s_-]*)+)/); return m ? syn(m[1].replace('Μ', 'µ')) + m[2].replace(/\D+/g, '-').replace(/-$/, '') : ''; }
  function pkgKeys(t) { const out = new Set(); const T = String(t).toUpperCase().replace(/Μ/g, 'µ');
    for (const m of T.matchAll(/([A-Zµ]{2,})[\s_-]*((?:\d+(?:[\s_-]+(?=\d)|(?![\s_-]*\d)))+)/g)) out.add(syn(m[1].replace(/^PG/, '')) + m[2].replace(/\D+/g, '-'));
    for (const m of T.matchAll(/(\d+)[\s_-]*(?:PIN[\s_-]*|LEAD[\s_-]*|BALL[\s_-]*|핀[\s_-]*)?(?:S-)?([A-Zµ]{2,})(\d*)/g)) { out.add(syn(m[2]) + m[1]); if (m[3]) out.add(syn(m[2]) + m[3] + '-' + m[1]); }
    [...out].forEach((k) => { const m = k.match(/^([A-Zµ]+)(\d+)-(\d+)$/); if (m) out.add(m[1] + m[2]); }); return out; }

  /* ---- validation: {errors, warnings} (errors fail the build) ---- */
  function validate(r) {
    const E = [], W = [];
    if (!r.mpn) E.push('mpn 없음');
    if (!STATUS.includes(r.status)) E.push(`status "${r.status}" (stub · done · verified)`);
    if (r.status === 'verified' && !(r.verify && r.verify.date)) E.push('verified인데 verify.date 없음');
    if (r.price != null && !(typeof r.price === 'number' && r.price >= 0)) E.push('price는 0 이상의 숫자');
    if (r.status !== 'stub' && !(r.src && r.src.length)) W.push('완료 페이지인데 읽은 문서(src) 없음');
    if (!(r.sections || []).length) E.push('sections 없음');
    (r.sections || []).forEach((s) => (s.blocks || []).forEach((b) => { if (b.table) { const n = (b.table.head || []).length; b.table.rows.forEach((row, i) => { if (n && row.length !== n) W.push(`${text(s.h)}: 표 ${i + 1}행 칸 수 ${row.length} ≠ 머리글 ${n}`); }); } }));
    [['절대 최대 정격', absmax(r)], ['권장 동작 조건', roc(r)]].forEach(([h, rows]) => rows.forEach((x) => {
      if (/\s\/\s|VIH.*VIL|VOH.*VOL/.test(x.p)) return;   // two parameters in one row (VIH / VIL …)
      // negative rails and P-channel figures are often written by magnitude (−0.4 … −1): only a warning there
      const neg = (x.min != null && x.min < 0) || (x.max != null && x.max < 0);
      if (x.min != null && x.max != null && x.min > x.max) (neg ? W : E).push(`${h} "${x.p}": 최소 ${x.min} > 최대 ${x.max}`);
      if (x.typ != null && x.max != null && x.typ > x.max && !neg) W.push(`${h} "${x.p}": 일반 ${x.typ} > 최대 ${x.max}`);
    }));
    pinTables(r).forEach((t, i) => { const seen = new Map(); t.pins.forEach((p) => { const n = p[0]; if (!/^(?:[A-Z]{0,2}\d{1,3}[A-Z]?|EP|PAD|TAB)$/i.test(n)) return; /* a real pin / ball number, not a group row or a placeholder */ if (seen.has(n)) E.push(`핀 표 ${i + 1}: 핀 ${n} 중복 (${seen.get(n)} / ${p[1]})`); seen.set(n, p[1]); }); });
    const k = r.key && r.key.spec;
    if (k) {
      if (k.vin && !(Array.isArray(k.vin) && k.vin.length === 2 && k.vin[0] <= k.vin[1])) E.push('key.spec.vin은 [최소, 최대]');
      /* key.basis explains a figure that is a design choice rather than a datasheet number (e.g. load current through an external FET) */
      const vq = () => quantities(r, 'V').concat(absmax(r).map((x) => x.max).filter((x) => x != null));
      if (k.i != null && !r.key.basis) { const q = quantities(r, 'A'); if (q.length && !q.some((x) => Math.abs(x - k.i) / Math.max(1e-9, k.i) < 0.02)) W.push(`key.spec.i ${k.i} A가 핵심 사양의 전류값(${[...new Set(q)].slice(0, 6).join(', ')} A)에 없음`); }
      if (k.pkg && r.status !== 'stub' && !r.key.basis) { const pk = pkgKey(k.pkg);
        const page = (r.sections || []).filter((x) => /핵심|패키지|핀/.test(text(x.h))).map((x) => text(JSON.stringify(x.blocks))).join(' ');
        if (pk && !(() => { const ks = pkgKeys(page); return ks.has(pk) || [...ks].some((x) => x.startsWith(pk + '-')); })()) W.push(`key.spec.pkg "${k.pkg}"가 핵심 사양·패키지·핀 배치에 없음`); }
      if (k.v != null && !r.key.basis) { const q = vq(); if (q.length && !q.some((x) => Math.abs(x - k.v) < 0.5)) W.push(`key.spec.v ${k.v} V가 핵심 사양·절대 최대 정격의 전압값에 없음`); }
    }
    return { errors: E, warnings: W };
  }
  return { pkgKey, pkgKeys, render, page, slug, text, section, absmax, roc, pinTables, quantities, validate, STATUS };
})();
if (typeof module !== 'undefined') module.exports = DSREC;
