// Goal triangulations and their packings, and scrambled puzzles.
//
// Goals come from the tetrahedron, octahedron and icosahedron by repeated
// sqrt(3)-subdivision (insert a vertex in every face, then flip every old
// edge). Old vertices keep their degree and new ones have degree 6, so the
// goals have four 3s, six 4s or twelve 5s and the rest 6s. The packings are
// built the same way: the base solids pack exactly, an inserted vertex gets
// the circle in its face's interstice, and the old edges are flipped by
// flip-and-flow.

import { Triangulation, sortedDegrees } from './tri.js';
import { baseSolid, insertInFace, Flow, balanceFully, lor } from './packing.js';

export const LEVELS = [
  { id: 'oct14', name: 'Octahedral 14', kind: 'oct', subdiv: 1, blurb: 'six 4s, eight 6s' },
  { id: 'tet20', name: 'Tetrahedral 20', kind: 'tet', subdiv: 2, blurb: 'four 3s, sixteen 6s' },
  { id: 'ico32', name: 'Buckyball 32', kind: 'ico', subdiv: 1, blurb: 'twelve 5s, twenty 6s' },
  { id: 'oct38', name: 'Octahedral 38', kind: 'oct', subdiv: 2, blurb: 'six 4s, thirty-two 6s' },
  { id: 'tet56', name: 'Tetrahedral 56', kind: 'tet', subdiv: 3, blurb: 'four 3s, fifty-two 6s' },
  { id: 'ico92', name: 'Icosahedral 92', kind: 'ico', subdiv: 2, blurb: 'twelve 5s, eighty 6s' },
];

export const DIFFICULTY = {
  easy: { flipsPerV: 0.3, maxDeg: 8 },
  medium: { flipsPerV: 0.55, maxDeg: 9 },
  hard: { flipsPerV: 0.9, maxDeg: 10 },
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));

async function runFlow(tri, P, edges, onProgress, maxDepth = 14) {
  const flow = new Flow(tri, P, edges);
  const N = onProgress ? 24 : 6;
  for (let i = 1; i <= N; i++) {
    if (!flow.advance(P, i / N, maxDepth)) throw new Error('flow failed');
    if (onProgress) { onProgress(i / N); await tick(); }
  }
  flowLog.push(...flow.flips.map(f => [f.c, f.d]));
  return flow.tri1;
}

let flowLog = [];

async function sqrt3(tri, P, onProgress) {
  const { tri: kt, parent } = tri.kis();
  const Q = new Float64Array(4 * kt.nV);
  Q.set(P);
  parent.forEach(([i, j, k], idx) => Q.set(insertInFace(Q, i, j, k), 4 * (tri.nV + idx)));
  const t2 = await runFlow(kt, Q, tri.edges(), onProgress);
  return { tri: t2, P: Q };
}

const goalCache = new Map();

export async function buildGoal(level, onProgress) {
  if (goalCache.has(level.id)) return goalCache.get(level.id);
  let { tri, P } = baseSolid(level.kind);
  for (let s = 0; s < level.subdiv; s++) {
    ({ tri, P } = await sqrt3(tri, P, onProgress && (x => onProgress((s + x) / level.subdiv))));
  }
  balanceFully(P);
  const goal = { tri, P, degrees: sortedDegrees(tri) };
  goalCache.set(level.id, goal);
  return goal;
}

function energy(tri) { return tri.degrees().reduce((s, d) => s + (d - 6) ** 2, 0); }

export function solved(tri, goalDegrees) {
  const d = sortedDegrees(tri);
  return d.every((x, i) => x === goalDegrees[i]);
}

// Random walk away from the goal, in rounds of flips on vertex-disjoint quads,
// biased toward raising the degree energy and capped at maxDeg so the start
// has no wildly high degree. Every flip is flowed, so the start packing is
// reached from the goal packing by flip-and-flow.
export async function scramble(goal, diff, seed, onProgress) {
  const R = rng(seed);
  let tri = goal.tri.clone();
  const P = goal.P.slice();
  const total = Math.max(3, Math.round(diff.flipsPerV * tri.nV));
  const perRound = Math.max(1, Math.round(tri.nV / 14));
  let done = 0, guard = 0;
  flowLog = [];
  while ((done < total || solved(tri, goal.degrees)) && guard++ < 400) {
    const edges = tri.edges();
    for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
    const used = new Set(), chosen = [];
    const t = tri.clone();
    for (const [a, b] of edges) {
      if (chosen.length >= Math.max(1, Math.min(perRound, total - done))) break;
      const f = t.flipInfo(a, b);
      if (!f.ok || [a, b, f.c, f.d].some(v => used.has(v))) continue;
      if (t.degree(f.c) + 1 > diff.maxDeg || t.degree(f.d) + 1 > diff.maxDeg) continue;
      const e0 = energy(t);
      const t2 = t.clone(); t2.flip(a, b);
      if (energy(t2) <= e0 && R() > 0.25) continue;
      t.flip(a, b);
      [a, b, f.c, f.d].forEach(v => used.add(v));
      chosen.push([a, b]);
    }
    if (!chosen.length) continue;
    const save = P.slice();
    try {
      tri = await runFlow(tri, P, chosen, null, chosen.length > 1 ? 5 : 14);
    } catch (e) {
      P.set(save);   // rare: fall back to one flip at a time
      for (const [a, b] of chosen) {
        if (!tri.flipInfo(a, b).ok) continue;
        const s2 = P.slice();
        try { tri = await runFlow(tri, P, [[a, b]]); } catch (e2) { P.set(s2); }
      }
    }
    done += chosen.length;
    balanceFully(P);
    if (onProgress) { onProgress(Math.min(1, done / total)); await tick(); }
  }
  // flipping these new edges in reverse order undoes the scramble
  return { tri, P, scrambleFlips: done, path: flowLog.slice() };
}

export function maxResidual(tri, P) {
  let mx = 0;
  for (let v = 0; v < tri.nV; v++) mx = Math.max(mx, Math.abs(lor(P, v, P, v) - 1));
  for (const [a, b] of tri.edges()) mx = Math.max(mx, Math.abs(lor(P, a, P, b) + 1));
  return mx;
}
