# Flip & Flow

A circle packing puzzle on the sphere. You see a triangulation of the sphere realized as a tangency circle packing, with circles colored by degree. Click an edge to flip it, and the packing flows continuously to the packing of the flipped triangulation. Reach the goal: in Easy mode the goal's degree counts (for example twelve 5s and twenty 6s), in Hard mode the goal's exact triangulation up to rotation and reflection.

Based on Ken Stephenson's flip puzzle in CirclePack. The motion is flip-and-flow (Connelly and Gortler, *Packing disks by flipping and flowing*, DCG 2021; Bowers, *A proof of the Koebe–Andre'ev–Thurston theorem via flow from tangency packings*, arXiv:2007.02403).

No build step and no dependencies: plain HTML, CSS and ES modules, with WebGL2 for drawing.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Put it on GitHub Pages

```bash
gh repo create flipflow-puzzle --public --source . --push
gh api repos/{owner}/flipflow-puzzle/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

Or in the repository on GitHub: Settings → Pages → Deploy from a branch → `main`, `/ (root)`. The site appears at `https://<user>.github.io/flipflow-puzzle/`.

Puzzles are reproducible from the URL: `?level=ico32&s=medium&m=hard&seed=12345` (`s` is the scramble length: short, medium or long; `m` is the mode: easy or hard).

## How it works

- **Circles as Lorentz vectors** (`js/packing.js`). A cap with center `n` and angular radius `r` is `p = (n, cos r)/sin r` in R^{3,1}. Tangency is `<p, q> = -1`, so a packing of a triangulation with V vertices is 4V unknowns satisfying V + E = 4V − 6 equations, rigid up to the 6-dimensional Möbius group.
- **Flip and flow.** To flip edge ab (quadrilateral a, c, b, d), drop the tangency ab and constrain the new pair to `<p_c, p_d> = -cosh((1 − s) δ₀)`, where δ₀ is their current separation. Moving s from 0 to 1 pulls c and d together while every other edge stays tangent and a, b drift apart. Each frame takes Gauss–Newton steps with minimum-norm updates in a metric that weights each circle by its visual size, so circles move as little as possible. A secant predictor and an envelope Cholesky factorization (reverse Cuthill–McKee order) keep a frame under a millisecond at 92 circles. The flow checks that non-adjacent circles never overlap.
- **Balancing.** Every frame applies a small Lorentz boost toward the minimizer of Σ log(1 + ⟨p_i, x⟩²) over viewpoints x in hyperbolic space (equivalently, maximize Σ log sin r_i). This convex normalization keeps circles from shrinking away, and drifts smoothly instead of jumping.
- **Goals** (`js/levels.js`). Each goal is a frame polyhedron with its faces filled by 6s, built in one of two ways:
  - **√3-subdivision** of the tetrahedron, octahedron or icosahedron: insert a circle in each interstice (an exact Apollonian insertion), then flip all old edges at once by flip-and-flow. The defects (four 3s, six 4s or twelve 5s) sit at the face centers of a 3-valent frame such as the cube or dodecahedron.
  - **Loop (edge-split) subdivision** of the octahedron, icosahedron, pentagonal, hexagonal and heptagonal bipyramids, the triaugmented triangular prism and the gyroelongated square bipyramid. The defects are the frame's own vertices, so their degrees are its valences: 4s, 5s, mixes, even 7s. These pack by flowing small disjoint circles at the subdivided points until every edge is tangent.
- **Puzzles.** A puzzle is a seeded random walk of flips away from the goal, biased toward higher degree variance and capped at a maximum degree, and every scramble flip is flowed too. So each start packing is reached from the goal by flip-and-flow, and the scramble length bounds the optimal solution.
- **Hard mode** (`js/iso.js`). Triangulations of the sphere have a unique embedding up to reflection, so isomorphism is easy (Weinberg 1966): a breadth-first code from a fixed directed edge of the goal is compared with codes from every directed edge and both orientations of the current triangulation, O(E²).
- **Hints** (`js/solver.js`). Beam search on the flip graph ranked by the L1 distance between sorted degree sequences; in Hard mode it also compares the pattern of graph distances between defects with the goal's and stops only on an isomorphic triangulation. Following hints walks one plan; if the search runs out of time the hint retraces the scramble.
- **Rendering** (`js/render.js`). A fragment shader ray-casts the unit sphere and colors each pixel by the cap containing it, then draws the geodesic edges between centers.

`node tools/check.mjs` builds every goal and several scrambles and prints the packing residuals.
