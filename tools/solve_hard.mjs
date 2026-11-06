// Hard mode: how often the planner reaches the exact goal structure.
import { LEVELS, SCRAMBLE, buildGoal, scramble } from '../js/levels.js';
import { plan } from '../js/solver.js';
import { isoKey, isIsomorphic } from '../js/iso.js';
for (const L of LEVELS) {
  const g = await buildGoal(L), k = isoKey(g.tri);
  const out = [];
  for (const [dn, seed] of [['short', 1], ['medium', 2], ['long', 3]]) {
    const s = await scramble(g, SCRAMBLE[dn], seed);
    const t0 = performance.now();
    const p = await plan(s.tri, g.degrees, { goalTri: g.tri, seed, timeMs: 8000 });
    let ok = '';
    if (p) { const t = s.tri.clone(); for (const [a, b] of p) t.flip(a, b); ok = isIsomorphic(t, k) ? '' : ' WRONG'; }
    out.push(`${dn} ${p ? p.length : 'FAIL'}/${s.scrambleFlips}${ok} ${(performance.now() - t0).toFixed(0)}ms`);
  }
  console.log(L.id.padEnd(6), out.join('  |  '));
}
