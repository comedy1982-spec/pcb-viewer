import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist/index.html');

// every inline script of the built page must compile: a name declared twice in one bundled script
// (e.g. two files concatenated into viewer.js both defining dsHTML) stops the whole app from starting
test('dist/index.html: every inline script compiles (no duplicate declarations)', { skip: !existsSync(dist) && 'run npm run build first' }, () => {
  const html = readFileSync(dist, 'utf8');
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/json|text\/plain|x-[^"]*|text\/x-[^"]*)")[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) { n++; try { new vm.Script(m[1], { filename: `script#${n}` }); } catch (e) { assert.fail(`script #${n}: ${e.message}`); } }
  assert.ok(n > 20, `${n} scripts`);
});
