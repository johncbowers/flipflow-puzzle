// Combinatorial triangulations of the sphere.
// Faces are oriented triples [a, b, c], counterclockwise seen from outside.

export class Triangulation {
  constructor(nV, faces) {
    this.nV = nV;
    this.faces = faces.map(f => f.slice());
    this.rebuild();
  }

  clone() { return new Triangulation(this.nV, this.faces); }

  rebuild() {
    const n = this.nV;
    this.edgeFace = new Map();          // directed edge a->b  ->  face index
    this.nbrs = Array.from({ length: n }, () => new Set());
    this.faces.forEach((f, fi) => {
      for (let k = 0; k < 3; k++) {
        const a = f[k], b = f[(k + 1) % 3];
        this.edgeFace.set(a * n + b, fi);
        this.nbrs[a].add(b);
      }
    });
  }

  degree(v) { return this.nbrs[v].size; }
  degrees() { return this.nbrs.map(s => s.size); }
  hasEdge(a, b) { return this.nbrs[a].has(b); }

  edges() {
    const out = [];
    for (let a = 0; a < this.nV; a++) for (const b of this.nbrs[a]) if (a < b) out.push([a, b]);
    return out;
  }

  third(fi, a, b) {
    const f = this.faces[fi];
    for (const v of f) if (v !== a && v !== b) return v;
    return -1;
  }

  // Describe flipping edge ab: faces (a,b,c) and (b,a,d) become (c,a,d) and (d,b,c).
  flipInfo(a, b) {
    const n = this.nV;
    const f1 = this.edgeFace.get(a * n + b), f2 = this.edgeFace.get(b * n + a);
    if (f1 === undefined || f2 === undefined) return { ok: false, reason: 'not an edge' };
    const c = this.third(f1, a, b), d = this.third(f2, a, b);
    const info = { a, b, c, d, f1, f2, ok: true, reason: '' };
    if (this.degree(a) <= 3 || this.degree(b) <= 3) {
      info.ok = false; info.reason = 'an endpoint has degree 3; flipping would leave degree 2';
    } else if (this.hasEdge(c, d)) {
      info.ok = false; info.reason = 'the new edge already exists (would make a double edge)';
    }
    return info;
  }

  flip(a, b) {
    const info = this.flipInfo(a, b);
    if (!info.ok) throw new Error('invalid flip: ' + info.reason);
    const { c, d, f1, f2 } = info;
    this.faces[f1] = [c, a, d];
    this.faces[f2] = [d, b, c];
    this.rebuild();
    return info;
  }

  // Insert a vertex in every face. Returns the new triangulation and, for each
  // new vertex, the face it was inserted into.
  kis() {
    let next = this.nV;
    const faces = [], parent = [];
    for (const [i, j, k] of this.faces) {
      const v = next++;
      parent.push([i, j, k]);
      faces.push([i, j, v], [j, k, v], [k, i, v]);
    }
    return { tri: new Triangulation(next, faces), parent };
  }

  // Loop (edge-split) subdivision: a vertex on every edge, each face cut into
  // four. Old vertices keep their degree; new ones have degree 6. Returns the
  // new triangulation and, for each new vertex, the edge it splits.
  loop() {
    const n = this.nV, mid = new Map(), ends = [];
    for (const [a, b] of this.edges()) { mid.set(a * n + b, n + ends.length); ends.push([a, b]); }
    const m = (a, b) => mid.get(Math.min(a, b) * n + Math.max(a, b));
    const faces = [];
    for (const [a, b, c] of this.faces) {
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    return { tri: new Triangulation(n + ends.length, faces), ends };
  }
}

export function sortedDegrees(tri) {
  return tri.degrees().sort((x, y) => x - y);
}

export function degreeHistogram(degs) {
  const h = new Map();
  for (const d of degs) h.set(d, (h.get(d) || 0) + 1);
  return h;
}
