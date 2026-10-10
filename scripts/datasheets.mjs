// Writes datasheets/README.md + manifest.json from src/parts/parts.js.
// With --download, saves every linked PDF to datasheets/pdf/ (run on a machine with internet access).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(root, 'src/parts/parts.js'), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx);
const PARTS = vm.runInContext('PARTS', ctx);
const used = {};
// which example boards use which part
for (const [file, name] of [['src/app/sample.js', 'SENSE-32'], ['src/app/sample-mcu.js', 'MOTION-32 (DC·BLDC)']]) {
  const src = readFileSync(join(root, file), 'utf8');
  for (const m of src.matchAll(/'([A-Z0-9][A-Z0-9/\-. ()]{3,})'/g)) { const i = PARTS.find(m[1]); if (i) (used[i.mpn] ||= new Set()).add(name); }
}
const list = Object.keys(PARTS.P).map(k => ({ mpn: k, ...PARTS.P[k], boards: [...(used[k] || [])] }));
for (const k of Object.keys(used)) if (!PARTS.P[k]) { const i = PARTS.find(k); list.push({ ...i, boards: [...used[k]] }); }
mkdirSync(join(root, 'datasheets'), { recursive: true });
writeFileSync(join(root, 'datasheets/manifest.json'), JSON.stringify(list.map(p => ({ mpn: p.mpn, manufacturer: p.mfr, title: p.title, category: p.cat, pdf: p.pdf || null, page: p.page || null, file: p.file || null, boards: p.boards, specs: Object.fromEntries(p.specs || []) })), null, 2) + '\n');
const md = ['# 데이터시트', '',
  '예제 보드(SENSE-32, MOTION-32 DEV, MOTION-32 BLDC)에 쓰인 부품의 제조사 데이터시트 링크와 주요 사양입니다. 뷰어에서는 부품을 클릭하면 같은 내용이 정보 패널에 나옵니다.', '',
  'PDF 파일 자체는 저작권과 용량 때문에 저장소에 넣지 않았습니다. 인터넷이 되는 컴퓨터에서 아래 명령을 실행하면 `datasheets/pdf/`에 내려받고, 저장소의 `dist/index.html`을 파일로 열었을 때 부품 정보의 **저장된 사본** 버튼이 그 파일을 엽니다.', '',
  '```', 'node scripts/datasheets.mjs --download', '```', '',
  '| 부품 번호 | 제조사 | 분류 | 설명 | 데이터시트 | 사용 보드 |', '|---|---|---|---|---|---|',
  ...list.map(p => `| ${p.mpn} | ${p.mfr} | ${p.cat} | ${p.title} | ${p.pdf ? `[PDF](${p.pdf})` : ''}${p.pdf && p.page ? ' · ' : ''}${p.page ? `[페이지](${p.page})` : ''}${!p.pdf && !p.page ? `[검색](${PARTS.search(p.mpn)})` : ''} | ${p.boards.join(', ')} |`), '',
  '## 주요 사양', '',
  ...list.filter(p => p.specs && p.specs.length > 2).flatMap(p => [`### ${p.mpn} — ${p.mfr}`, '', ...p.specs.map(([k, v]) => `- **${k}**: ${v}`), ...(p.note ? ['', `> ${p.note}`] : []), '']),
];
writeFileSync(join(root, 'datasheets/README.md'), md.join('\n'));
console.log(`datasheets/README.md, manifest.json — ${list.length} parts`);
if (process.argv.includes('--download')) {
  mkdirSync(join(root, 'datasheets/pdf'), { recursive: true });
  for (const p of list.filter(p => p.pdf && p.file)) {
    const out = join(root, 'datasheets/pdf', p.file);
    if (existsSync(out)) { console.log('skip', p.file); continue; }
    try {
      const r = await fetch(p.pdf, { headers: { 'user-agent': 'Mozilla/5.0 (datasheet fetch)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      writeFileSync(out, Buffer.from(await r.arrayBuffer())); console.log('saved', p.file);
    } catch (e) { console.log('failed', p.mpn, e.message, '→', p.pdf); }
  }
}
