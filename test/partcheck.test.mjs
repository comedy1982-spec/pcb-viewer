import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';
const { HWARCH, NEWPROJ } = load();

// parts picked in the system design whose pins are not confirmed by a datasheet are reported before the circuit is built
test('check: picked parts — Claude-estimated pins, recorded-only picks, library parts, missing datasheet page', () => {
  const A = HWARCH.archFrom('12 V 입력 · TC364 MCU · CAN-FD · NTC 온도 센서', 'T').arch;
  const blk = re => A.blocks.find(b => re.test(b.label + ' ' + (b.impl || []).map(i => i.type).join(' ')));
  const can = blk(/Transceiver/), ntc = blk(/Temp/), mcu = blk(/Main MCU/);
  assert.ok(can && ntc && mcu, A.blocks.map(b => b.label).join(', '));
  const lookup = NEWPROJ.partLookup;
  try {
    // 1) a pick the circuit does not use: recorded only (the CAN block keeps its library transceiver)
    can.part = { mpn: 'TJA1443AT' };
    let I = HWARCH.check(A);
    assert.ok(I.some(x => x.code === 'pinsNone' && x.mpn === 'TJA1443AT' && /기록만/.test(x.msg) && /datasheet TJA1443AT/.test(x.fix)));
    // 2) the library block already uses the picked part: no warning (the MCU block is the picked MCU)
    const mcuMpn = NEWPROJ.build(HWARCH.toPlan(A).plan).parts.find(c => c.ref.startsWith('U') && /TC3/i.test(c.mpn || c.val));
    if (mcuMpn) { mcu.part = { mpn: mcuMpn.mpn || mcuMpn.val }; I = HWARCH.check(A); assert.ok(!I.some(x => x.sev === 'warn' && x.mpn === mcu.part.mpn), 'library part is not "recorded only"'); }
    // 3) the block is wired to the part with pins Claude estimated: warn, fix = datasheet
    can.part = { mpn: 'XYZ1043' }; can.impl = [{ type: 'part', params: { mpn: 'XYZ1043' } }];
    NEWPROJ.partLookup = m => /XYZ1043/.test(m) ? { mpn: 'XYZ1043', src: 'ai', pins: [{ num: '1', name: 'TXD' }] } : lookup(m);
    I = HWARCH.check(A);
    assert.ok(I.some(x => x.code === 'pinsAi' && x.mpn === 'XYZ1043' && /Claude가 추정/.test(x.msg)));
    // 4) pins from a datasheet PDF but no summary page: information only (does not stop the circuit step)
    NEWPROJ.partLookup = m => /XYZ1043/.test(m) ? { mpn: 'XYZ1043', src: 'ds', pins: [{ num: '1', name: 'TXD' }] } : lookup(m);
    I = HWARCH.check(A);
    const ds = I.find(x => x.mpn === 'XYZ1043');
    assert.ok(ds && ds.sev === 'info' && ds.code === 'dsNone');
    assert.match(HWARCH.checkText(I), /참고 \d+/);
  } finally { NEWPROJ.partLookup = lookup; }
});
