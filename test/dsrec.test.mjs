import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './load.mjs';
const { DSREC, DSDB, DSKEY, PARTRANK } = load();
const dir = join(dirname(fileURLToPath(import.meta.url)), '../datasheets/records');
const recs = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(readFileSync(join(dir, f), 'utf8'))]);

// datasheets/records/*.json is the single source: every record validates, the bundle is current, pages render from records
test('datasheet records: all validate, file names match, bundle up to date', () => {
  assert.ok(recs.length >= 250);
  for (const [f, r] of recs) {
    const v = DSREC.validate(r);
    assert.deepEqual([...v.errors], [], `${f}: ${v.errors.join('; ')}`);
    assert.equal(DSREC.slug(r.mpn) + '.json', f);
    assert.ok(DSDB.items[r.mpn], `${r.mpn} in src/parts/dsdb.js — run node scripts/dsdb.mjs`);
    assert.equal(JSON.stringify(DSDB.items[r.mpn].rec), JSON.stringify(r), `${r.mpn}: dsdb.js is stale — run node scripts/dsdb.mjs`);
  }
  const page = readFileSync(join(dir, '../db/LTC4359.html'), 'utf8');
  const r = recs.find(([, x]) => x.mpn === 'LTC4359')[1];
  assert.ok(page.includes(DSREC.render(r)), 'datasheets/db pages are rendered from the records');
  assert.ok(/독립 재확인/.test(DSREC.render(r)) && r.status === 'verified');
});

test('datasheet records: every ranked candidate takes its spec from a record (key)', () => {
  for (const [blk, arr] of Object.entries(PARTRANK.C)) for (const c of arr) {
    if (!DSKEY[c.mpn]) continue;
    assert.equal(JSON.stringify(c.spec), JSON.stringify(DSKEY[c.mpn].spec), `${blk}/${c.mpn}`);
  }
  assert.ok(Object.keys(DSKEY).length >= 120);
  const withSpec = Object.values(PARTRANK.C).flat().filter(c => c.spec);
  assert.ok(withSpec.every(c => DSKEY[c.mpn]), 'no spec left in partrank.js itself');
  assert.equal(DSKEY['L9908'].spec.pkg, 'TQFP-48');
});

test('datasheet records: validator catches bad data', () => {
  const base = { mpn: 'X1', status: 'done', src: ['https://x'], sections: [] };
  const sec = (h, head, rows) => ({ h, blocks: [{ table: { head, rows } }] });
  assert.ok(DSREC.validate({ ...base, status: 'final' }).errors.length);
  assert.ok(DSREC.validate({ ...base, status: 'verified' }).errors.some(e => /verify/.test(e)));
  assert.ok(DSREC.validate({ ...base, sections: [sec('절대 최대 정격', ['항목', '최소', '최대', '단위'], [['VS', '40', '30', 'V']])] }).errors.some(e => /최소/.test(e)));
  assert.ok(DSREC.validate({ ...base, sections: [sec('핀 배치', ['핀', '이름', '기능'], [['1', 'A', ''], ['1', 'B', '']])] }).errors.some(e => /중복/.test(e)));
  assert.ok(DSREC.validate({ ...base, sections: [{ h: '핵심 사양', blocks: [{ dl: [['패키지', '8-pin SOICN']]}] }], key: { spec: { pkg: 'SOIC-8' } } }).warnings.length === 0);
  assert.ok(DSREC.validate({ ...base, sections: [{ h: '핵심 사양', blocks: [{ dl: [['패키지', 'TQFP48']]}] }], key: { spec: { pkg: 'TQFP-64' } } }).warnings.some(w => /pkg/.test(w)));
});
