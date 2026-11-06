// How often and how fast the hint planner finds a solution from fresh puzzles.
import { LEVELS, SCRAMBLE, buildGoal, scramble } from '../js/levels.js';
import { plan } from '../js/solver.js';
for (const L of LEVELS) {
  const g = await buildGoal(L);
  for (const dn of ['short', 'medium', 'long']) {
    const out = [];
    for (const seed of [1, 2, 3]) {
      const s = await scramble(g, SCRAMBLE[dn], seed);
      const t0 = performance.now();
      const p = await plan(s.tri, g.degrees, { timeMs: 20000 });
      out.push(`${p ? p.length : 'FAIL'}/${s.scrambleFlips} ${(performance.now() - t0).toFixed(0)}ms`);
    }
    console.log(L.id, dn, out.join('  '));
  }
}
