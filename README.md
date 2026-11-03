# Flip & Flow

A circle packing puzzle on the sphere. You see a triangulation of the sphere realized as a tangency circle packing, with circles colored by degree. Click an edge to flip it, and the packing flows continuously to the packing of the flipped triangulation. Reach the goal degree pattern, for example twelve 5s and twenty 6s (a buckyball-type triangulation).

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

Puzzles are reproducible from the URL: `?level=ico32&d=medium&seed=12345`.

## How it works

- **Circles as Lorentz vectors** (`js/packing.js`). A cap with center `n` and angular radius `r` is `p = (n, cos r)/sin r` in R^{3,1}. Tangency is `<p, q> = -1`, so a packing of a triangulation with V vertices is 4V unknowns satisfying V + E = 4V − 6 equations, rigid up to the 6-dimensional Möbius group.
- **Flip and flow.** To flip edge ab (quadrilateral a, c, b, d), drop the tangency ab and constrain the new pair to `<p_c, p_d> = -cosh((1 − s) δ₀)`, where δ₀ is their current separation. Moving s from 0 to 1 pulls c and d together while every other edge stays tangent and a, b drift apart. Each frame takes Gauss–Newton steps with minimum-norm updates in a metric that weights each circle by its visual size, so circles move as little as possible. A secant predictor and an envelope Cholesky factorization (reverse Cuthill–McKee order) keep a frame under a millisecond at 92 circles. The flow checks that non-adjacent circles never overlap.
- **Balancing.** Every frame applies a small Lorentz boost toward the minimizer of Σ log(1 + ⟨p_i, x⟩²) over viewpoints x in hyperbolic space (equivalently, maximize Σ log sin r_i). This convex normalization keeps circles from shrinking away, and drifts smoothly instead of jumping.
- **Goals and puzzles** (`js/levels.js`). Goals come from the tetrahedron, octahedron and icosahedron by repeated √3-subdivision: insert a circle in each interstice (an exact Apollonian insertion), then flip all old edges at once by flip-and-flow. That gives the goals four 3s, six 4s or twelve 5s, and 6s everywhere else. A puzzle is a seeded random walk of flips away from the goal, biased toward higher degree variance and capped at a maximum degree, and every scramble flip is flowed too. So each start packing is reached from the goal by flip-and-flow, and the scramble length bounds the optimal solution.
- **Rendering** (`js/render.js`). A fragment shader ray-casts the unit sphere and colors each pixel by the cap containing it, then draws the geodesic edges between centers.

`node tools/check.mjs` builds every goal and several scrambles and prints the packing residuals.
