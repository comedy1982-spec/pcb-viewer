// Loads the browser scripts (which define globals) into a sandbox for testing.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function load() {
  const ctx = vm.createContext({ console });
  for (const f of ['src/core/pcb-core.js', 'src/sch/sch.js', 'src/sim/sim.js', 'src/app/sample.js', 'src/hsis/hsis.js', 'src/hsis/sample-hsis.js'])
    vm.runInContext(readFileSync(join(root, f), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx, { filename: f });
  const g = (n) => vm.runInContext(n, ctx);
  return { PCB: g('PCB'), SIM: g('SIM'), SAMPLE: g('SAMPLE_SPEC'), HSIS: g('HSIS'), SAMPLE_HSIS: g('SAMPLE_HSIS'), SAMPLE_ARXML: g('SAMPLE_ARXML'), SCH: g('SCH') };
}
