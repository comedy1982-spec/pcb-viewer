// Bundles src/ into a single self-contained HTML file: dist/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripExport = (s) => s.replace(/if\(typeof module!=='undefined'\)module\.exports=[^;]+;/, '');
const script = (code) => `<script>\n${code}\n</script>`;

const viewer = read('src/app/viewer.js').replace('/*SIMUI*/', () => read('src/app/simui.js') + '\n' + read('src/app/mechui.js') + '\n' + read('src/app/hsisui.js') + '\n' + read('src/app/schui.js') + '\n' + read('src/app/popui.js') + '\n' + read('src/app/fwui.js') + '\n' + read('src/app/pcbui.js') + '\n' + read('src/app/localai.js') + '\n' + read('src/app/aimode.js') + '\n' + read('src/app/pcbcli.js') + '\n' + read('src/app/schcli.js') + '\n' + read('src/app/newui.js') + '\n' + read('src/app/copilot.js') + '\n' + read('src/app/dsui.js') + '\n' + read('src/app/modeui.js') + '\n' + read('src/app/exportui.js') + '\n' + read('src/app/revui.js') + '\n' + read('src/app/nextui.js') + '\n' + read('src/app/iconui.js') + '\n' + read('src/app/mbui.js') + '\n' + read('src/app/partui.js'));

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AllinOneDesign</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap">
${read('src/styles/base.css')}
${read('src/styles/extra.css')}
${read('src/styles/copilot.css')}
${read('src/styles/mode.css')}
</head>
<body>
${read('src/app/body.html')}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
${script(stripExport(read('src/core/pcb-core.js')))}
${script(stripExport(read('src/parts/mcu-pins.js')))}
${script(stripExport(read('src/sch/sch.js')))}
${script(stripExport(read('src/sch/schedit.js')))}
${script(stripExport(read('src/sim/sim.js')))}
${script(stripExport(read('src/sim/emc.js')))}
${script(read('src/app/sample.js'))}
${script(read('src/app/sample-mcu.js'))}
${script(read('src/app/sample-tc364.js'))}
${script(stripExport(read('src/fw/fw.js')))}
${script(stripExport(read('src/parts/parts.js')))}
${script(stripExport(read('src/parts/dsdb.js')))}
${script(stripExport(read('src/hsis/hsis.js')))}
${script(stripExport(read('src/hsis/pinrec.js')))}
${script(stripExport(read('src/hsis/mcal.js')))}
${script(stripExport(read('src/route/autoroute.js')))}
${script(stripExport(read('src/core/pcbedit.js')))}
${script(stripExport(read('src/core/autoplace.js')))}
${script(stripExport(read('src/core/guide.js')))}
${script(stripExport(read('src/core/newproj.js')))}
${script(stripExport(read('src/core/housing.js')))}
${script(stripExport(read('src/core/text2cad.js')))}
${script(stripExport(read('src/core/sysdiag.js')))}
${script(stripExport(read('src/core/hwarch.js')))}
${script(stripExport(read('src/core/revlog.js')))}
${script(stripExport(read('src/core/multiboard.js')))}
${script(stripExport(read('src/core/partlib.js')))}
${script(stripExport(read('src/core/fpgen.js')))}
${script(stripExport(read('src/core/analyze.js')))}
${script(stripExport(read('src/core/safety.js')))}
${script(stripExport(read('src/hsis/testgen.js')))}
${script(stripExport(read('src/hsis/sample-hsis.js')))}
${script(viewer)}
</body>
</html>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
