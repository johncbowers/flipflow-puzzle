// Planning hints: search the flip graph for a sequence of flips that reaches
// the goal's degree pattern.
//
// Distance to the goal: W1 = sum_k |F(k) - G(k)|, where F and G count the
// vertices of degree <= k now and in the goal. It is the L1 distance between
// the sorted degree sequences. A flip moves four degrees by one each, so it
// changes W1 by at most 4 and ceil(W1 / 4) flips is a lower bound.
//
// Beam search: keep the `width` best distinct states at each depth, ranked
// by W1 with random tie-breaks so plateaus get explored.

import { rng } from './levels.js';

const MAXD = 64;

function histogram(degs) {
  const h = new Int32Array(MAXD);
  for (const d of degs) h[Math.min(d, MAXD - 1)]++;
  return h;
}

function w1(h, g) {
  let F = 0, G = 0, s = 0;
  for (let k = 0; k < MAXD; k++) { F += h[k]; G += g[k]; s += Math.abs(F - G); }
  return s;
}

export function goalDistance(tri, goalDegrees) {
  return w1(histogram(tri.degrees()), histogram(goalDegrees));
}

export function stateKey(tri) {
  return tri.edges().map(([a, b]) => a * tri.nV + b).sort((x, y) => x - y).join(',');
}

const tick = () => new Promise(r => setTimeout(r, 0));

// Returns a list of edges [a, b] to flip in order, or null if none was found
// within the budget. `canFlip(a, b)` excludes locked edges.
export async function plan(tri, goalDegrees, { canFlip = () => true, width, maxDepth = 120, timeMs = 2500, seed = 1 } = {}) {
  const R = rng(seed);
  const g = histogram(goalDegrees);
  width = width || (tri.nV <= 40 ? 300 : tri.nV <= 60 ? 160 : 80);
  const start = { tri, h: histogram(tri.degrees()), parent: null, edge: null };
  if (w1(start.h, g) === 0) return [];
  const seen = new Set([stateKey(tri)]);
  const t0 = performance.now();
  let beam = [start];
  const h2 = new Int32Array(MAXD);
  for (let depth = 0; depth < maxDepth && beam.length; depth++) {
    const kids = [];
    for (let si = 0; si < beam.length; si++) {
      const s = beam[si], t = s.tri;
      for (const [a, b] of t.edges()) {
        if (!canFlip(a, b)) continue;
        const f = t.flipInfo(a, b);
        if (!f.ok) continue;
        h2.set(s.h);
        h2[t.degree(a)]--; h2[t.degree(a) - 1]++;
        h2[t.degree(b)]--; h2[t.degree(b) - 1]++;
        h2[t.degree(f.c)]--; h2[t.degree(f.c) + 1]++;
        h2[t.degree(f.d)]--; h2[t.degree(f.d) + 1]++;
        kids.push({ score: w1(h2, g) + 0.9 * R(), si, a, b });
      }
    }
    kids.sort((x, y) => x.score - y.score);
    const next = [];
    for (const k of kids) {
      if (next.length >= width) break;
      const s = beam[k.si], t = s.tri.clone();
      t.flip(k.a, k.b);
      const key = stateKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      const node = { tri: t, h: histogram(t.degrees()), parent: s, edge: [k.a, k.b] };
      if (Math.floor(k.score) === 0) {
        const path = [];
        for (let n = node; n.parent; n = n.parent) path.push(n.edge);
        return path.reverse();
      }
      next.push(node);
    }
    beam = next;
    if (performance.now() - t0 > timeMs) return null;
    await tick();
  }
  return null;
}
