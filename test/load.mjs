// Loads the browser scripts (which define globals) into a sandbox for testing.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function load() {
  const ctx = vm.createContext({ console });
  for (const f of ['src/core/pcb-core.js', 'src/sim/sim.js', 'src/app/sample.js'])
    vm.runInContext(readFileSync(join(root, f), 'utf8').replace(/if\(typeof module[^;]+;/, ''), ctx, { filename: f });
  return { PCB: vm.runInContext('PCB', ctx), SIM: vm.runInContext('SIM', ctx), SAMPLE: vm.runInContext('SAMPLE_SPEC', ctx) };
}
