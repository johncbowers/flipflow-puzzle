// Goal triangulations and their packings, and scrambled puzzles.
//
// Each goal is a frame polyhedron with its faces filled by a patch of 6s.
// Two constructions:
// - sqrt(3)-subdivision of the tetrahedron, octahedron or icosahedron
//   (insert a vertex in every face, then flip every old edge). The defects
//   sit at face centers of a 3-valent frame (the cube, the dodecahedron...).
//   Packings: the base solids pack exactly, an inserted vertex gets the
//   circle in its face's interstice, and the old edges flip by flip-and-flow.
// - Loop (edge-split) subdivision of a deltahedron or bipyramid. The defects
//   are the frame's own vertices, so their degrees are the frame's valences:
//   4s, 5s, mixes, even 7s. Packings: small disjoint circles at the
//   subdivided points, then every edge flows to tangency (Continuation).
// Old vertices keep their degree and new ones have degree 6 in both cases.

import { Triangulation, sortedDegrees, degreeHistogram } from './tri.js';
import { baseSolid, insertInFace, Flow, Continuation, separatedCaps, hullFaces, balanceFully, lor } from './packing.js';

export const LEVELS = [
  { id: 'oct14', group: 3, name: 'Cube frame · 14', kind: 'oct', sqrt3: 1, frame: 'a cube (every frame vertex 3-valent)' },
  { id: 'tet20', group: 3, name: 'Tetrahedral · 20', kind: 'tet', sqrt3: 2, frame: 'a 3-valent frame with tetrahedral symmetry' },
  { id: 'ico32', group: 3, name: 'Buckyball · 32', kind: 'ico', sqrt3: 1, frame: 'a dodecahedron (every frame vertex 3-valent)' },
  { id: 'oct38', group: 3, name: 'Octahedral · 38', kind: 'oct', sqrt3: 2, frame: 'a 3-valent frame with octahedral symmetry' },
  { id: 'tet56', group: 3, name: 'Tetrahedral · 56', kind: 'tet', sqrt3: 3, frame: 'a 3-valent frame with tetrahedral symmetry' },
  { id: 'ico92', group: 3, name: 'Icosahedral · 92', kind: 'ico', sqrt3: 2, frame: 'a 3-valent frame with icosahedral symmetry' },
  { id: 'oct18', group: 'hi', name: 'Octahedron · 18', kind: 'oct', loop: 1, frame: 'an octahedron: six 4-valent frame vertices' },
  { id: 'bip5', group: 'hi', name: 'Pentagonal bipyramid · 22', kind: 'bipy5', loop: 1, frame: 'a pentagonal bipyramid: two 5-valent poles, five 4-valent equator vertices' },
  { id: 'bip6', group: 'hi', name: 'Hexagonal bipyramid · 26', kind: 'bipy6', loop: 1, frame: 'a hexagonal bipyramid: six 4-valent equator vertices and two 6-valent poles you cannot see by color' },
  { id: 'bip7', group: 'hi', name: 'Heptagonal bipyramid · 30', kind: 'bipy7', loop: 1, frame: 'a heptagonal bipyramid: two 7-valent poles, seven 4-valent equator vertices' },
  { id: 'tap', group: 'hi', name: 'Triaugmented prism · 30', kind: 'triaug', loop: 1, frame: 'a triaugmented triangular prism: six 5-valent and three 4-valent frame vertices' },
  { id: 'gsb', group: 'hi', name: 'Gyroelongated bipyramid · 34', kind: 'gyro', loop: 1, frame: 'a gyroelongated square bipyramid: eight 5-valent and two 4-valent frame vertices' },
  { id: 'ico42', group: 'hi', name: 'Icosahedron · 42', kind: 'ico', loop: 1, frame: 'an icosahedron: twelve 5-valent frame vertices' },
];

export const SCRAMBLE = {
  short: { flipsPerV: 0.3, maxDeg: 8 },
  medium: { flipsPerV: 0.55, maxDeg: 9 },
  long: { flipsPerV: 0.9, maxDeg: 10 },
};

// "twelve 5s, thirty 6s"
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const words = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
export function blurb(degrees) {
  const h = degreeHistogram(degrees);
  return [...h.keys()].sort((a, b) => (a === 6) - (b === 6) || a - b).map(d => `${words(h.get(d))} ${d}s`).join(', ');
}

const ring = (k, z, r = 1, ph = 0) =>
  Array.from({ length: k }, (_, i) => [r * Math.cos(ph + 2 * Math.PI * i / k), r * Math.sin(ph + 2 * Math.PI * i / k), z]);

// Frame vertices for Loop goals (in convex position; the hull gives the faces).
function framePoints(kind) {
  const g = (1 + Math.sqrt(5)) / 2;
  switch (kind) {
    case 'oct': return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'ico': {
      const p = [];
      for (const s of [-1, 1]) for (const t of [-1, 1]) p.push([0, s, t * g], [s, t * g, 0], [t * g, 0, s]);
      return p;
    }
    case 'bipy5': return [...ring(5, 0), [0, 0, 1], [0, 0, -1]];
    case 'bipy6': return [...ring(6, 0), [0, 0, 1], [0, 0, -1]];
    case 'bipy7': return [...ring(7, 0), [0, 0, 1], [0, 0, -1]];
    case 'triaug': return [...ring(3, 0.8), ...ring(3, -0.8), ...ring(3, 0, 1.3, Math.PI / 3)];
    case 'gyro': return [...ring(4, 0.5), ...ring(4, -0.5, 1, Math.PI / 4), [0, 0, 1.3], [0, 0, -1.3]];
  }
  throw new Error('unknown frame ' + kind);
}

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

const unit = v => { const m = Math.hypot(...v); return v.map(x => x / m); };

async function loopGoal(kind, onProgress) {
  const pts = framePoints(kind);
  const base = new Triangulation(pts.length, hullFaces(pts));
  const { tri, ends } = base.loop();
  const n = pts.map(unit);
  const centers = [...n, ...ends.map(([a, b]) => unit(n[a].map((x, i) => x + n[b][i])))];
  const P = separatedCaps(tri, centers);
  const C = new Continuation(tri, P, tri.edges());
  const N = 30;
  for (let i = 1; i <= N; i++) {
    if (!C.advance(P, i / N)) throw new Error('packing the goal failed');
    if (onProgress) { onProgress(i / N); await tick(); }
  }
  return { tri, P };
}

export async function buildGoal(level, onProgress) {
  if (goalCache.has(level.id)) return goalCache.get(level.id);
  let tri, P;
  if (level.loop) {
    ({ tri, P } = await loopGoal(level.kind, onProgress));
  } else {
    ({ tri, P } = baseSolid(level.kind));
    for (let s = 0; s < level.sqrt3; s++) {
      ({ tri, P } = await sqrt3(tri, P, onProgress && (x => onProgress((s + x) / level.sqrt3))));
    }
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
