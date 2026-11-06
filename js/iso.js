// Isomorphism of triangulations of the sphere (Weinberg 1966).
//
// A triangulation is 3-connected and planar, so its embedding is unique up to
// reflection. Starting from a directed edge u->v and a sense of rotation, a
// breadth-first walk that lists each vertex's neighbors in rotation order
// (starting from the edge it was reached by) numbers the vertices canonically.
// The list of those numbers determines the triangulation. Two triangulations
// are isomorphic exactly when the code of one, from some fixed start, equals
// the code of the other from some start and sense: O(E^2) in all.

// Next neighbor of x after y, turning in sense dir (+1 or -1).
function turn(tri, x, y, dir) {
  const n = tri.nV;
  return dir > 0 ? tri.third(tri.edgeFace.get(x * n + y), x, y) : tri.third(tri.edgeFace.get(y * n + x), x, y);
}

// Code from start u->v in sense dir. With `target`, stop at the first entry
// that differs and return null; otherwise return the whole code.
function code(tri, u, v, dir, target) {
  const num = new Int32Array(tri.nV).fill(-1);
  const order = [u], ref = [v];
  num[u] = 0;
  const out = target ? null : [];
  let k = 0;
  const put = x => {
    if (target) { if (target[k++] !== x) return false; } else out.push(x);
    return true;
  };
  for (let q = 0; q < order.length; q++) {
    const x = order[q], deg = tri.degree(x);
    let y = ref[q];
    for (let i = 0; i < deg; i++) {
      if (num[y] < 0) { num[y] = order.length; order.push(y); ref.push(x); }
      if (!put(num[y])) return null;
      y = turn(tri, x, y, dir);
    }
    if (!put(-1)) return null;
  }
  return target ? (k === target.length ? true : null) : out;
}

// Precompute what isIsomorphic needs about the goal.
export function isoKey(tri) {
  const [u, v] = tri.edges()[0];
  return { code: code(tri, u, v, 1), du: tri.degree(u), dv: tri.degree(v) };
}

export function isIsomorphic(tri, key) {
  if (tri.edges().length * 2 + tri.nV !== key.code.length) return false;
  for (let u = 0; u < tri.nV; u++) {
    if (tri.degree(u) !== key.du) continue;
    for (const v of tri.nbrs[u]) {
      if (tri.degree(v) !== key.dv) continue;
      if (code(tri, u, v, 1, key.code) || code(tri, u, v, -1, key.code)) return true;
    }
  }
  return false;
}
