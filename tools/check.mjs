import { LEVELS, DIFFICULTY, buildGoal, scramble, maxResidual, solved } from '../js/levels.js';
for (const L of LEVELS) {
  let t0 = performance.now();
  const g = await buildGoal(L);
  console.log(L.id, 'V', g.tri.nV, 'res', maxResidual(g.tri, g.P).toExponential(1), 'ms', (performance.now()-t0).toFixed(0));
  for (const dn of ['easy','medium','hard']) for (const seed of [1,2]) {
    t0 = performance.now();
    const s = await scramble(g, DIFFICULTY[dn], seed);
    const h2 = {}; s.tri.degrees().forEach(d => h2[d]=(h2[d]||0)+1);
    console.log('  ', dn, seed, 'flips', s.scrambleFlips, JSON.stringify(h2), 'res', maxResidual(s.tri, s.P).toExponential(1), 'ms', (performance.now()-t0).toFixed(0));
  }
}
