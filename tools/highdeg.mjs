// Push one vertex's degree up by flipping edges opposite it, flowing each flip.
import { LEVELS, buildGoal } from '../js/levels.js';
import { Flow, newton, lor, balanceFully, lorToCap } from '../js/packing.js';
const g = await buildGoal(LEVELS.find(l => l.id === (process.argv[2] || 'ico32')));
let tri = g.tri.clone(); const P = g.P.slice();
const hub = 0;
for (let step = 0; step < 40; step++) {
  // flip an edge in the link of hub: edge ab where hub is the third vertex of one face
  let cand = null;
  for (const [a, b] of tri.edges()) {
    if (a === hub || b === hub) continue;
    const f = tri.flipInfo(a, b);
    if (f.ok && (f.c === hub || f.d === hub)) { cand = f; break; }
  }
  if (!cand) { console.log('no candidate'); break; }
  const fl = new Flow(tri, P, [[cand.a, cand.b]]);
  const save = P.slice(); let ok = true, sFail = 0;
  for (let i = 1; i <= 60; i++) { const s = i / 60; if (!fl.advance(P, s)) { ok = false; sFail = s; break; } }
  if (!ok) {
    // diagnose at the stuck s
    const Q = P.slice(); fl.setS(sFail); const r = newton(Q, fl.C, { maxIt: 30 });
    let worst = -1e9, wp = null;
    for (let k = 0; k < fl.nonAdj.length; k += 2) { const v = lor(Q, fl.nonAdj[k], Q, fl.nonAdj[k + 1]); if (v > worst) { worst = v; wp = [fl.nonAdj[k], fl.nonAdj[k + 1]]; } }
    const rmin = Math.min(...Array.from({ length: tri.nV }, (_, v) => lorToCap(P, v).r));
    console.log(`STUCK making deg ${tri.degree(hub) + 1}: reached s=${fl.s.toFixed(4)}, tried ${sFail.toFixed(4)}; newton ok=${r.ok} err=${r.err.toExponential(1)}; worst nonadj ${worst.toFixed(8)} pair ${wp} (is ab? ${wp && ((wp[0]===cand.a&&wp[1]===cand.b)||(wp[1]===cand.a&&wp[0]===cand.b))}); min r=${(rmin*180/Math.PI).toExponential(2)} deg; quad degs`, [cand.a, cand.b, cand.c, cand.d].map(v => tri.degree(v)));
    break;
  }
  tri = fl.tri1; balanceFully(P);
  const rmin = Math.min(...Array.from({ length: tri.nV }, (_, v) => lorToCap(P, v).r));
  console.log('deg', tri.degree(hub), 'min r deg', (rmin * 180 / Math.PI).toExponential(2));
}
