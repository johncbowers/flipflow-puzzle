import { LEVELS, SCRAMBLE, buildGoal, scramble, maxResidual, blurb, solved, rng } from '../js/levels.js';
import { Triangulation } from '../js/tri.js';
import { isoKey, isIsomorphic } from '../js/iso.js';
const R = rng(9);
const relabel = (t, mirror) => {
  const perm = [...Array(t.nV).keys()];
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  return new Triangulation(t.nV, t.faces.map(([a, b, c]) => mirror ? [perm[a], perm[c], perm[b]] : [perm[a], perm[b], perm[c]]));
};
const keys = {};
for (const L of LEVELS) {
  const t0 = performance.now();
  const g = await buildGoal(L);
  const ms = performance.now() - t0;
  const k = isoKey(g.tri); keys[L.id] = { k, tri: g.tri };
  const s = await scramble(g, SCRAMBLE.medium, 4);
  const t1 = performance.now();
  const self = isIsomorphic(relabel(g.tri, false), k), mir = isIsomorphic(relabel(g.tri, true), k), scr = isIsomorphic(s.tri, k);
  console.log(L.id.padEnd(6), String(g.tri.nV).padStart(3), 'res', maxResidual(g.tri, g.P).toExponential(1), `${ms.toFixed(0)}ms`, '|', blurb(g.degrees), '| iso relabel', self, 'mirror', mir, 'scrambled', scr, `(${(performance.now() - t1).toFixed(1)}ms)`, 'scramble', s.scrambleFlips);
}
// same degree pattern, different structure
console.log('oct18 vs hex-bipyramid 26?', keys.oct18.tri.nV, keys.bip6.tri.nV, '(different V, skip)');
// two random degree-equal but different triangulations: flip a goal edge and its "dual" to keep degrees
