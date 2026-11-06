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
import { isoKey, isIsomorphic } from './iso.js';

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

// Structure: for each pair of defect degrees, the sorted graph distances
// between defects of those degrees. Comparing these with the goal's guides
// the search toward the goal's arrangement, not just its degree counts.
function profile(t) {
  const special = [];
  for (let v = 0; v < t.nV; v++) if (t.degree(v) !== 6) special.push(v);
  const groups = new Map(), d = new Int32Array(t.nV);
  for (const s of special) {
    d.fill(-1); d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) for (const w of t.nbrs[q[h]]) if (d[w] < 0) { d[w] = d[q[h]] + 1; q.push(w); }
    for (const u of special) {
      if (u <= s) continue;
      const k = Math.min(t.degree(s), t.degree(u)) * 100 + Math.max(t.degree(s), t.degree(u));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d[u]);
    }
  }
  for (const a of groups.values()) a.sort((x, y) => x - y);
  return groups;
}

function profileDistance(p, goal) {
  let s = 0;
  for (const [k, g] of goal) {
    const a = p.get(k) || [];
    const m = Math.min(a.length, g.length);
    for (let i = 0; i < m; i++) s += Math.abs(a[i] - g[i]);
    s += 3 * Math.abs(a.length - g.length);
  }
  for (const [k, a] of p) if (!goal.has(k)) s += 3 * a.length;
  return s;
}

// Returns a list of edges [a, b] to flip in order, or null if none was found
// within the budget. `canFlip(a, b)` excludes locked edges. With `goalTri`,
// the target is that exact triangulation up to isomorphism (Hard mode), and
// states are also ranked by how far their defect arrangement is from it.
export async function plan(tri, goalDegrees, { canFlip = () => true, width, maxDepth = 120, timeMs = 2500, seed = 1, goalTri = null } = {}) {
  const key = goalTri && isoKey(goalTri), goalProfile = goalTri && profile(goalTri);
  const done = (t, w) => w === 0 && (!key || isIsomorphic(t, key));
  const R = rng(seed);
  const g = histogram(goalDegrees);
  width = width || (tri.nV <= 40 ? 300 : tri.nV <= 60 ? 160 : 80);
  const start = { tri, h: histogram(tri.degrees()), parent: null, edge: null };
  if (done(tri, w1(start.h, g))) return [];
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
    // Degree counts alone: keep the best `width`. Hard mode: shortlist three
    // times as many, then rank by degree distance plus structure distance.
    const take = goalTri ? 3 * width : width;
    let next = [];
    for (const k of kids) {
      if (next.length >= take) break;
      const s = beam[k.si], t = s.tri.clone();
      t.flip(k.a, k.b);
      const sk = stateKey(t);
      if (seen.has(sk)) continue;
      seen.add(sk);
      const node = { tri: t, h: histogram(t.degrees()), parent: s, edge: [k.a, k.b], w: Math.floor(k.score) };
      if (done(t, node.w)) {
        const path = [];
        for (let n = node; n.parent; n = n.parent) path.push(n.edge);
        return path.reverse();
      }
      if (goalTri) node.rank = 2 * node.w + profileDistance(profile(t), goalProfile) + R();
      next.push(node);
    }
    if (goalTri) next = next.sort((x, y) => x.rank - y.rank).slice(0, width);
    beam = next;
    if (performance.now() - t0 > timeMs) return null;
    await tick();
  }
  return null;
}
