// Bundles src/ into a single self-contained HTML file: dist/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripExport = (s) => s.replace(/if\(typeof module!=='undefined'\)module\.exports=[^;]+;/, '');
const script = (code) => `<script>\n${code}\n</script>`;

const viewer = read('src/app/viewer.js').replace('/*SIMUI*/', () => read('src/app/simui.js') + '\n' + read('src/app/hsisui.js') + '\n' + read('src/app/schui.js') + '\n' + read('src/app/popui.js') + '\n' + read('src/app/fwui.js'));

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SENSE-32 PCB 뷰어</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap">
${read('src/styles/base.css')}
${read('src/styles/extra.css')}
</head>
<body>
${read('src/app/body.html')}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
${script(stripExport(read('src/core/pcb-core.js')))}
${script(stripExport(read('src/parts/mcu-pins.js')))}
${script(stripExport(read('src/sch/sch.js')))}
${script(stripExport(read('src/sim/sim.js')))}
${script(read('src/app/sample.js'))}
${script(read('src/app/sample-mcu.js'))}
${script(read('src/app/sample-tc364.js'))}
${script(stripExport(read('src/fw/fw.js')))}
${script(stripExport(read('src/parts/parts.js')))}
${script(stripExport(read('src/hsis/hsis.js')))}
${script(stripExport(read('src/hsis/pinrec.js')))}
${script(stripExport(read('src/hsis/mcal.js')))}
${script(stripExport(read('src/route/autoroute.js')))}
${script(stripExport(read('src/hsis/sample-hsis.js')))}
${script(viewer)}
</body>
</html>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
