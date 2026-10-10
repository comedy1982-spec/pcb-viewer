// Regenerates examples/: SENSE-32_Port.arxml and SENSE-32_HSIS.xlsx (the .xlsx step needs python3 + openpyxl).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(root, 'src/hsis/sample-hsis.js'), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx);
mkdirSync(join(root, 'examples'), { recursive: true });
writeFileSync(join(root, 'examples/SENSE-32_Port.arxml'), vm.runInContext('SAMPLE_ARXML', ctx));
const json = join(tmpdir(), 'sense32-hsis.json');
writeFileSync(json, vm.runInContext('JSON.stringify(SAMPLE_HSIS)', ctx));
execFileSync('python3', [join(root, 'scripts/make_example_xlsx.py'), json, join(root, 'examples/SENSE-32_HSIS.xlsx')], { stdio: 'inherit' });
