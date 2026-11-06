// Circle packings on the sphere in Lorentzian coordinates.
//
// A cap on the unit sphere with center n and angular radius r is the unit
// spacelike vector p = (n, cos r) / sin r in R^{3,1}, with
// <x, y> = x0 y0 + x1 y1 + x2 y2 - x3 y3.  For two caps,
// <p, q> = -1 when they are externally tangent, < -1 when disjoint and
// in (-1, 1) when they overlap.  A tangency packing of a triangulation T is
// a choice of p_v with <p_v, p_v> = 1 and <p_u, p_v> = -1 for every edge uv.
// Counting: 4V unknowns, V + E = 4V - 6 equations, and the 6-dimensional
// Lorentz group acts, so packings are rigid up to Moebius transformations.

import { Triangulation } from './tri.js';

export function lor(P, i, Q, j) {
  i *= 4; j *= 4;
  return P[i] * Q[j] + P[i + 1] * Q[j + 1] + P[i + 2] * Q[j + 2] - P[i + 3] * Q[j + 3];
}

export function capToLor(n, r) {
  const s = Math.sin(r);
  return [n[0] / s, n[1] / s, n[2] / s, Math.cos(r) / s];
}

export function lorToCap(P, i) {
  const x = P[4 * i], y = P[4 * i + 1], z = P[4 * i + 2], t = P[4 * i + 3];
  const m = Math.hypot(x, y, z);
  return { n: [x / m, y / m, z / m], r: Math.atan2(1, t) };
}

// ---------------------------------------------------------------- base solids

function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function normalize(v) { const m = Math.hypot(...v); return v.map(x => x / m); }

// Convex hull of a few points on the sphere, by brute force.
export function hullFaces(pts) {
  const n = pts.length, faces = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], c = pts[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let pos = 0, neg = 0;
    for (let l = 0; l < n; l++) {
      if (l === i || l === j || l === k) continue;
      const w = pts[l];
      const s = nrm[0] * (w[0] - a[0]) + nrm[1] * (w[1] - a[1]) + nrm[2] * (w[2] - a[2]);
      if (s > 1e-9) pos++; else if (s < -1e-9) neg++;
    }
    if (pos === 0) faces.push(det3(a, b, c) > 0 ? [i, j, k] : [i, k, j]);
    else if (neg === 0) faces.push(det3(a, b, c) > 0 ? [i, j, k] : [i, k, j]);
  }
  return faces;
}

export function baseSolid(kind) {
  let pts;
  if (kind === 'tet') {
    pts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  } else if (kind === 'oct') {
    pts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  } else {
    const g = (1 + Math.sqrt(5)) / 2;
    pts = [];
    for (const s of [-1, 1]) for (const t of [-1, 1]) pts.push([0, s, t * g], [s, t * g, 0], [t * g, 0, s]);
  }
  pts = pts.map(normalize);
  const tri = new Triangulation(pts.length, hullFaces(pts));
  const [a, b] = tri.edges()[0];
  const ang = Math.acos(pts[a][0] * pts[b][0] + pts[a][1] * pts[b][1] + pts[a][2] * pts[b][2]);
  const P = new Float64Array(4 * pts.length);
  pts.forEach((n, i) => P.set(capToLor(n, ang / 2), 4 * i));
  return { tri, P };
}

// -------------------------------------------------------- Apollonian insertion

function solve3(A, b) {
  // Cramer's rule for a 3x3 system.
  const D = det3(A[0], A[1], A[2]);
  const col = (k) => A.map((row, r) => row.map((x, c) => (c === k ? b[r] : x)));
  return [0, 1, 2].map(k => { const M = col(k); return det3(M[0], M[1], M[2]) / D; });
}

// The cap tangent to the three caps of face (i,j,k), inside that face's interstice.
export function insertInFace(P, i, j, k) {
  const rows = [i, j, k].map(v => [P[4 * v], P[4 * v + 1], P[4 * v + 2], -P[4 * v + 3]]);
  // null vector of the 3x4 matrix via 4D cross product
  const minor = (skip) => {
    const cols = [0, 1, 2, 3].filter(c => c !== skip);
    return det3(...rows.map(r => cols.map(c => r[c])));
  };
  const q = [minor(0), -minor(1), minor(2), -minor(3)];
  // min-norm particular solution: rows . p = -1
  const G = rows.map(r => rows.map(s => r[0] * s[0] + r[1] * s[1] + r[2] * s[2] + r[3] * s[3]));
  const y = solve3(G, [-1, -1, -1]);
  const p0 = [0, 1, 2, 3].map(c => y[0] * rows[0][c] + y[1] * rows[1][c] + y[2] * rows[2][c]);
  const L = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2] - u[3] * v[3];
  const A = L(q, q), B = 2 * L(p0, q), C = L(p0, p0) - 1;
  const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
  const ns = [i, j, k].map(v => normalize([P[4 * v], P[4 * v + 1], P[4 * v + 2]]));
  let best = null, bestScore = -Infinity;
  for (const t of [(-B + disc) / (2 * A), (-B - disc) / (2 * A)]) {
    const p = p0.map((x, c) => x + t * q[c]);
    const n = normalize(p.slice(0, 3));
    const score = Math.min(det3(ns[0], ns[1], n), det3(ns[1], ns[2], n), det3(ns[2], ns[0], n));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

// ------------------------------------------------------------ Newton solver

// A constraint system: rows k with <p_I[k], p_J[k]> = T[k]  (I[k] == J[k] means norm row).
export class Constraints {
  constructor(nV, pairs) {
    this.nV = nV;
    const m = nV + pairs.length;
    this.m = m;
    this.I = new Int32Array(m); this.J = new Int32Array(m); this.T = new Float64Array(m);
    for (let v = 0; v < nV; v++) { this.I[v] = v; this.J[v] = v; this.T[v] = 1; }
    pairs.forEach(([a, b, t], k) => { this.I[nV + k] = a; this.J[nV + k] = b; this.T[nV + k] = t; });
    // incidence: for each vertex, the rows touching it
    this.inc = Array.from({ length: nV }, () => []);
    for (let k = 0; k < m; k++) {
      this.inc[this.I[k]].push(k);
      if (this.J[k] !== this.I[k]) this.inc[this.J[k]].push(k);
    }
    this.envelope();
    this.F = new Float64Array(m);
    this.y = new Float64Array(m);
  }

  // Two rows interact in the normal matrix when they share a vertex. Order the
  // rows by reverse Cuthill-McKee and store the lower envelope, so that the
  // Cholesky factorization only touches the band.
  envelope() {
    const m = this.m, adj = Array.from({ length: m }, () => new Set());
    for (const rows of this.inc) for (const a of rows) for (const b of rows) if (a !== b) adj[a].add(b);
    const nb = adj.map(x => [...x].sort((u, v) => adj[u].size - adj[v].size));
    const order = [], seen = new Uint8Array(m);
    const bfs = (r) => {
      const q = [r]; seen[r] = 1; let last = r;
      for (let h = 0; h < q.length; h++) { last = q[h]; order.push(last); for (const x of nb[last]) if (!seen[x]) { seen[x] = 1; q.push(x); } }
      return last;
    };
    // start from a pseudo-peripheral row
    let start = 0;
    for (let k = 1; k < m; k++) if (adj[k].size < adj[start].size) start = k;
    const far = bfs(start); order.length = 0; seen.fill(0);
    for (const r of [far, ...Array.from({ length: m }, (_, i) => i)]) if (!seen[r]) bfs(r);
    order.reverse();
    const pos = new Int32Array(m);
    order.forEach((r, i) => { pos[r] = i; });
    const fc = new Int32Array(m), start2 = new Int32Array(m + 1);
    for (let i = 0; i < m; i++) {
      let f = i;
      for (const x of adj[order[i]]) if (pos[x] < f) f = pos[x];
      fc[i] = f;
      start2[i + 1] = start2[i] + (i - f + 1);
    }
    this.pos = pos; this.fc = fc; this.rs = start2;
    this.L = new Float64Array(start2[m]);
    this.bperm = new Float64Array(m); this.xperm = new Float64Array(m);
  }

  // index of (i, j), i >= j, in permuted coordinates
  at(i, j) { return this.rs[i] + j - this.fc[i]; }

  // Fills F with the raw residuals and returns the largest relative one,
  // |F_k| / (|p_i| |p_j|) in Euclidean norms. A tiny circle has |p| ~ 1/r, so
  // its rows carry roundoff ~ 1e-16 |p_i| |p_j|; an absolute tolerance would
  // be unreachable next to a high-degree vertex.
  residual(P, F = this.F) {
    const nV = this.nV;
    if (!this.norm || this.norm.length !== nV) this.norm = new Float64Array(nV);
    const N = this.norm;
    for (let v = 0; v < nV; v++) {
      const o = 4 * v;
      N[v] = Math.sqrt(P[o] ** 2 + P[o + 1] ** 2 + P[o + 2] ** 2 + P[o + 3] ** 2);
    }
    let mx = 0;
    for (let k = 0; k < this.m; k++) {
      const v = lor(P, this.I[k], P, this.J[k]) - this.T[k];
      F[k] = v;
      const rel = Math.abs(v) / (N[this.I[k]] * N[this.J[k]]);
      if (rel > mx) mx = rel;
    }
    return mx;
  }
}

// Row gradient of constraint k with respect to p_v (Euclidean), written into g.
function rowGrad(C, P, k, v, g) {
  const i = C.I[k], j = C.J[k];
  const o = 4 * (i === j ? i : (v === i ? j : i));
  const s = i === j ? 2 : 1;
  g[0] = s * P[o]; g[1] = s * P[o + 1]; g[2] = s * P[o + 2]; g[3] = -s * P[o + 3];
}

function envCholSolve(C, b, x) {
  const m = C.m, L = C.L, fc = C.fc, rs = C.rs;
  for (let i = 0; i < m; i++) {
    const fi = fc[i], ri = rs[i] - fi;
    for (let j = fi; j < i; j++) {
      const fj = fc[j], rj = rs[j] - fj;
      let t = L[ri + j];
      for (let k = Math.max(fi, fj); k < j; k++) t -= L[ri + k] * L[rj + k];
      L[ri + j] = t / L[rj + j];
    }
    let d = L[ri + i];
    for (let k = fi; k < i; k++) d -= L[ri + k] * L[ri + k];
    if (!(d > 0)) return false;
    L[ri + i] = Math.sqrt(d);
  }
  for (let i = 0; i < m; i++) {
    const fi = fc[i], ri = rs[i] - fi;
    let t = b[i];
    for (let k = fi; k < i; k++) t -= L[ri + k] * x[k];
    x[i] = t / L[ri + i];
  }
  for (let i = m - 1; i >= 0; i--) {
    const ri = rs[i] - fc[i];
    x[i] /= L[ri + i];
    const xi = x[i];
    for (let k = fc[i]; k < i; k++) x[k] -= L[ri + k] * xi;
  }
  return true;
}

// Gauss-Newton with minimum-norm steps. The norm weights each circle by
// 1/|p|^2, roughly the visual size of a change, so the step is the smallest
// visible motion that fixes the residual; it is orthogonal to Moebius motions.
export function newton(P, C, { maxIt = 10, tol = 1e-11 } = {}) {
  const nV = C.nV, m = C.m, F = C.F, y = C.y;
  const g1 = new Float64Array(4), g2 = new Float64Array(4);
  const w = new Float64Array(nV), dP = new Float64Array(4 * nV), Q = new Float64Array(4 * nV);
  const Ftrial = new Float64Array(m);
  let err = C.residual(P);
  for (let it = 0; it < maxIt && err > tol; it++) {
    for (let v = 0; v < nV; v++) {
      const o = 4 * v;
      w[v] = 1 / (P[o] ** 2 + P[o + 1] ** 2 + P[o + 2] ** 2 + P[o + 3] ** 2);
    }
    const L = C.L, pos = C.pos;
    L.fill(0);
    for (let v = 0; v < nV; v++) {
      const rows = C.inc[v];
      for (let a = 0; a < rows.length; a++) {
        rowGrad(C, P, rows[a], v, g1);
        const pa = pos[rows[a]];
        for (let b = 0; b <= a; b++) {
          rowGrad(C, P, rows[b], v, g2);
          const pb = pos[rows[b]];
          const val = w[v] * (g1[0] * g2[0] + g1[1] * g2[1] + g1[2] * g2[2] + g1[3] * g2[3]);
          L[pa >= pb ? C.at(pa, pb) : C.at(pb, pa)] += val;
        }
      }
    }
    // Jacobi scaling: rows touching tiny circles have diagonals ~1e4 times
    // larger than others, so scale to unit diagonal before factoring.
    const sc = C.scale || (C.scale = new Float64Array(m));
    for (let i = 0; i < m; i++) sc[i] = 1 / Math.sqrt(L[C.at(i, i)]);
    for (let i = 0; i < m; i++) {
      const ri = C.rs[i] - C.fc[i];
      for (let j = C.fc[i]; j <= i; j++) L[ri + j] *= sc[i] * sc[j];
      L[ri + i] += 1e-14;
    }
    for (let k = 0; k < m; k++) C.bperm[pos[k]] = F[k] * sc[pos[k]];
    if (!envCholSolve(C, C.bperm, C.xperm)) return { ok: false, err };
    for (let k = 0; k < m; k++) y[k] = C.xperm[pos[k]] * sc[pos[k]];
    dP.fill(0);
    for (let v = 0; v < nV; v++) {
      for (const k of C.inc[v]) {
        rowGrad(C, P, k, v, g1);
        const s = -w[v] * y[k];
        dP[4 * v] += s * g1[0]; dP[4 * v + 1] += s * g1[1]; dP[4 * v + 2] += s * g1[2]; dP[4 * v + 3] += s * g1[3];
      }
    }
    let alpha = 1, accepted = false;
    for (let ls = 0; ls < 12; ls++) {
      for (let i = 0; i < 4 * nV; i++) Q[i] = P[i] + alpha * dP[i];
      const e = C.residual(Q, Ftrial);
      if (e < err || e < tol) { P.set(Q); err = e; accepted = true; break; }
      alpha *= 0.5;
    }
    if (!accepted) return { ok: false, err };
    C.residual(P);
  }
  return { ok: err <= tol, err };
}

// ------------------------------------------------------------ flip and flow

// Flows the packing P of `tri` to a packing of the triangulation obtained by
// flipping every edge in `flipEdges` (which must touch pairwise disjoint faces).
// Constraints: tangency on every edge of the new triangulation, except that
// each new edge cd carries a target inversive distance -cosh((1 - s) * delta0),
// moving from the current separation (s = 0) to tangency (s = 1). The old
// edges ab are released and drift apart (Connelly-Gortler; Bowers).
// Continuation toward a tangency packing of `tri`: every edge of tri is
// tangent except the `moving` edges, each of which carries a target
// inversive distance -cosh((1 - s) * delta0), moving from its current
// separation (s = 0) to tangency (s = 1). Non-adjacent circles must stay
// disjoint throughout.
export class Continuation {
  constructor(tri, P, moving) {
    this.tri1 = tri;
    const n = tri.nV;
    const rowOf = new Map(moving.map(([c, d], i) => [Math.min(c, d) * n + Math.max(c, d), i]));
    const pairs = [];
    this.moveRows = new Array(moving.length);
    for (const [a, b] of tri.edges()) {
      const key = a * n + b;
      if (rowOf.has(key)) this.moveRows[rowOf.get(key)] = n + pairs.length;
      pairs.push([a, b, -1]);
    }
    this.C = new Constraints(n, pairs);
    this.delta0 = moving.map(([c, d]) => Math.acosh(Math.max(1, -lor(P, c, P, d))));
    this.s = 0;
    this.setS(0);
    this.nonAdj = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!tri.hasEdge(a, b)) this.nonAdj.push(a, b);
  }

  setS(s) {
    this.moveRows.forEach((row, i) => { this.C.T[row] = -Math.cosh((1 - s) * this.delta0[i]); });
  }

  isPacking(P) {
    const na = this.nonAdj;
    for (let k = 0; k < na.length; k += 2) if (lor(P, na[k], P, na[k + 1]) > -1 + 1e-9) return false;
    return true;
  }

  // Try to move from the current s to s1, bisecting on failure.
  advance(P, s1, maxDepth = 14, depth = 0) {
    if (s1 <= this.s) return true;
    const save = P.slice();
    if (this.prev && this.s > this.prevS) {
      // secant predictor along the flow
      const k = (s1 - this.s) / (this.s - this.prevS);
      if (k < 4) for (let i = 0; i < P.length; i++) P[i] += k * (P[i] - this.prev[i]);
    }
    this.setS(s1);
    const res = newton(P, this.C, { maxIt: 8 });
    if (res.ok && this.isPacking(P)) { this.prev = save; this.prevS = this.s; this.s = s1; return true; }
    P.set(save);
    this.setS(this.s);
    if (depth >= maxDepth) return false;
    const mid = 0.5 * (this.s + s1);
    return this.advance(P, mid, maxDepth, depth + 1) && this.advance(P, s1, maxDepth, depth + 1);
  }
}

// Flows the packing P of `tri` to a packing of the triangulation obtained by
// flipping every edge in `flipEdges` (which must touch pairwise disjoint faces).
// The new edges cd move to tangency while the old edges ab are released and
// drift apart (Connelly-Gortler; Bowers).
export class Flow extends Continuation {
  constructor(tri, P, flipEdges) {
    const t = tri.clone();
    const flips = flipEdges.map(([a, b]) => t.flip(a, b));
    super(t, P, flips.map(f => [f.c, f.d]));
    this.tri0 = tri;
    this.flips = flips;
  }
}

// Caps at the given centers, small enough that neighbors are disjoint:
// a starting point for flowing every edge to tangency.
export function separatedCaps(tri, centers) {
  const P = new Float64Array(4 * tri.nV);
  const n = centers.map(normalize);
  for (let v = 0; v < tri.nV; v++) {
    let m = Math.PI;
    for (const w of tri.nbrs[v]) m = Math.min(m, Math.acos(Math.max(-1, Math.min(1, n[v][0] * n[w][0] + n[v][1] * n[w][1] + n[v][2] * n[w][2]))));
    P.set(capToLor(n[v], 0.4 * m), 4 * v);
  }
  return P;
}

// ---------------------------------------------------------------- balancing

// Moebius normalization. For a viewpoint x in hyperbolic space, the cap p has
// angular radius r with cot r = -<p, x>. We move toward the x minimizing
// sum log(1 + <p_i, x>^2) = -2 sum log sin r_i (a convex function on H^3),
// which keeps circles from becoming tiny. Returns the size of the step taken.
function phi(P, nV, u, beta) {
  const sh = Math.sinh(beta), ch = Math.cosh(beta);
  let s = 0;
  for (let i = 0; i < nV; i++) {
    const o = 4 * i;
    const ip = sh * (P[o] * u[0] + P[o + 1] * u[1] + P[o + 2] * u[2]) - P[o + 3] * ch;
    s += Math.log1p(ip * ip);
  }
  return s;
}

export function applyBoost(P, u, beta) {
  const sh = Math.sinh(beta), ch = Math.cosh(beta), nV = P.length / 4;
  for (let i = 0; i < nV; i++) {
    const o = 4 * i;
    const yp = P[o] * u[0] + P[o + 1] * u[1] + P[o + 2] * u[2], t = P[o + 3];
    const ypNew = ch * yp - sh * t, tNew = ch * t - sh * yp, dy = ypNew - yp;
    P[o] += dy * u[0]; P[o + 1] += dy * u[1]; P[o + 2] += dy * u[2]; P[o + 3] = tNew;
  }
}

export function balanceStep(P, maxStep = 0.03, frac = 1) {
  const nV = P.length / 4, h = 1e-3;
  const f0 = phi(P, nV, [1, 0, 0], 0);
  const w = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const e = [0, 0, 0]; e[k] = 1;
    const fp = phi(P, nV, e, h), fm = phi(P, nV, e, -h);
    const g = (fp - fm) / (2 * h), H = (fp - 2 * f0 + fm) / (h * h);
    w[k] = -g / Math.max(H, 1e-6);
  }
  let beta = Math.hypot(...w) * frac;
  if (beta < 1e-12) return 0;
  const u = w.map(x => x / Math.hypot(...w));
  beta = Math.min(beta, maxStep);
  applyBoost(P, u, beta);
  return beta;
}

export function balanceFully(P) {
  for (let i = 0; i < 500; i++) if (balanceStep(P, 0.3, 0.8) < 1e-9) break;
}
