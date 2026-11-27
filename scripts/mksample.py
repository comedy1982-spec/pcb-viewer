#!/usr/bin/env python3
"""Turn a pcbrun snapshot of a plan-based board (pcbrun.cjs --plan … --snap) into an app example:
   mksample.py <snap.json> <plan.json> <ID> <name> "<comment>"  →  src/app/sample-<id>.js  (const SNAP_<ID> = {…, plan, meta})"""
import json, sys
snap, plan, ID, name, note = sys.argv[1:6]
S = json.load(open(snap)); P = json.load(open(plan)); m = S.get('meta') or {}
W, H = m.get('W'), m.get('H'); P['board'] = {'w': W, 'h': H}; P['name'] = name
S['meta'] = {'id': ID.lower(), 'name': name, 'W': W, 'H': H, 'strategy': P.get('strategy'), 'rstFix': P.get('rstFix') is True, 'curModel': P.get('curModel'), 'connGap': P.get('connGap') is True, 'cohesion': P.get('cohesion'), 'ifaceFix': P.get('ifaceFix') is True, 'pcb': P.get('pcb')}
S['plan'] = P
open('src/app/sample-%s.js' % ID.lower(), 'w').write('/* %s */\nconst SNAP_%s=%s;\n' % (note.replace('*/', '* /'), ID.upper(), json.dumps(S, ensure_ascii=False, separators=(',', ':'))))
print('src/app/sample-%s.js' % ID.lower(), W, H)
