import { LEVELS, SCRAMBLE, buildGoal, scramble, solved } from '../js/levels.js';
import { plan } from '../js/solver.js';
import { isoKey, isIsomorphic } from '../js/iso.js';
for (const id of ['ico32', 'oct38', 'bip6', 'bip7', 'tap', 'ico42']) {
  const g = await buildGoal(LEVELS.find(l => l.id === id)); const k = isoKey(g.tri);
  const res = [];
  for (const seed of [1, 2, 3, 4]) {
    const s = await scramble(g, SCRAMBLE.medium, seed);
    const steps = await plan(s.tri, g.degrees, { seed, timeMs: 20000 });
    const t = s.tri.clone(); for (const [a, b] of steps) t.flip(a, b);
    res.push(`${solved(t, g.degrees) ? 'deg✓' : 'deg✗'} ${isIsomorphic(t, k) ? 'SAME' : 'different'}`);
  }
  console.log(id, res.join(' | '));
}
// independent check: multiset of graph distances between non-6 vertices
function inv(t) {
  const out = [];
  const special = [...Array(t.nV).keys()].filter(v => t.degree(v) !== 6);
  for (const s of special) {
    const d = new Int32Array(t.nV).fill(-1); d[s] = 0; const q = [s];
    for (let h = 0; h < q.length; h++) for (const w of t.nbrs[q[h]]) if (d[w] < 0) { d[w] = d[q[h]] + 1; q.push(w); }
    for (const u of special) if (u > s) out.push(`${t.degree(s)}-${t.degree(u)}:${d[u]}`);
  }
  return out.sort().join(',');
}
let agree = 0, total = 0;
for (const id of ['ico32', 'oct38', 'bip6', 'bip7', 'tap', 'ico42']) {
  const g = await buildGoal(LEVELS.find(l => l.id === id)); const k = isoKey(g.tri), gi = inv(g.tri);
  for (const seed of [1, 2, 3, 4]) {
    const s = await scramble(g, SCRAMBLE.medium, seed);
    const steps = await plan(s.tri, g.degrees, { seed, timeMs: 20000 });
    const t = s.tri.clone(); for (const [a, b] of steps) t.flip(a, b);
    const iso = isIsomorphic(t, k), sameInv = inv(t) === gi;
    total++; if (iso ? sameInv : !sameInv) agree++;
    else console.log('CHECK', id, seed, 'iso', iso, 'invariant equal', sameInv);
  }
}
console.log(`invariant agrees with iso verdict in ${agree}/${total} cases`);
