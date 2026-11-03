import { LEVELS, DIFFICULTY, buildGoal, scramble, solved } from './levels.js';
import { Flow, lorToCap, balanceStep } from './packing.js';
import { SphereRenderer, arcDistance } from './render.js';
import { sortedDegrees, degreeHistogram } from './tri.js';

const PALETTE = {
  3: '#b18cff', 4: '#5b9dff', 5: '#3fd6b8', 6: '#ece5d2', 7: '#ffbe3d',
  8: '#ff8a3d', 9: '#ff5a4f', 10: '#e8336f', 11: '#b42a8c',
};
const colorOf = d => PALETTE[Math.min(11, Math.max(3, d))];
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const FLOW_SECONDS = 1.15;

const $ = id => document.getElementById(id);
const ui = {
  level: $('level'), difficulty: $('difficulty'), newBtn: $('newBtn'), helpBtn: $('helpBtn'),
  undo: $('undoBtn'), hint: $('hintBtn'), reset: $('resetBtn'), view: $('viewBtn'),
  status: $('status'), moves: $('moves'), par: $('par'), overload: $('overload'),
  goalText: $('goalText'), chips: $('degChips'), degBody: document.querySelector('#degTable tbody'),
  loading: $('loading'), loadingText: $('loadingText'), bar: $('progressBar'),
  win: $('win'), toast: $('toast'), winText: $('winText'), help: $('help'),
};

let main, preview;
try {
  main = new SphereRenderer($('sphere'));
  preview = new SphereRenderer($('preview'));
} catch (e) {
  $('nogl').classList.remove('hidden');
  throw e;
}
preview.zoom = 0.96;
preview.lineScale = 0.5;
preview.markerPx = 4;
// Keep the sphere clear of the header, footer and goal panel.
main.layout = () => {
  const w = main.canvas.clientWidth, h = main.canvas.clientHeight;
  if (w > 720) {
    const panel = 252, top = 64, bottom = 64;
    return { cx: -panel / 2, cy: (top - bottom) / 2, size: Math.min(w - panel - 32, h - top - bottom) };
  }
  const top = document.getElementById('bar').offsetHeight, bottom = h - document.getElementById('panel').offsetTop;
  return { cx: 0, cy: (top - bottom) / 2, size: Math.min(w - 16, h - top - bottom - 8) };
};
main.zoom = 1;

const game = {
  level: null, diff: 'medium', seed: 0,
  goal: null, start: null,
  tri: null, P: null, history: [],
  anim: null, hover: null, hintEdge: null, busy: false, won: false,
};

// ------------------------------------------------------------------ setup

for (const L of LEVELS) {
  const o = document.createElement('option');
  o.value = L.id; o.textContent = L.name; ui.level.appendChild(o);
}

function readParams() {
  const q = new URLSearchParams(location.search);
  const lv = LEVELS.find(l => l.id === q.get('level')) || LEVELS.find(l => l.id === 'ico32');
  const d = DIFFICULTY[q.get('d')] ? q.get('d') : 'medium';
  const s = parseInt(q.get('seed'), 10);
  return { lv, d, seed: Number.isFinite(s) ? s : randomSeed() };
}
function randomSeed() { return Math.floor(Math.random() * 1e6); }
function writeParams() {
  const q = new URLSearchParams({ level: game.level.id, d: game.diff, seed: String(game.seed) });
  history.replaceState(null, '', '?' + q.toString());
}

function showLoading(text) {
  ui.loadingText.textContent = text; ui.bar.style.width = '0%';
  ui.loading.classList.remove('hidden');
}
const progress = x => { ui.bar.style.width = `${Math.round(100 * x)}%`; };

async function newPuzzle(level, diff, seed) {
  if (game.busy) return;
  game.busy = true;
  game.anim = null; game.hover = null; game.hintEdge = null;
  game.level = level; game.diff = diff; game.seed = seed;
  ui.level.value = level.id; ui.difficulty.value = diff;
  writeParams();
  showLoading(`Building the ${level.name} goal…`);
  await new Promise(r => setTimeout(r, 30));
  game.goal = await buildGoal(level, progress);
  ui.loadingText.textContent = 'Scrambling by flip-and-flow…';
  progress(0);
  const s = await scramble(game.goal, DIFFICULTY[diff], seed, progress);
  game.start = { tri: s.tri.clone(), P: s.P.slice(), flips: s.scrambleFlips, path: s.path };
  ui.loading.classList.add('hidden');
  ui.win.classList.add('hidden');
  game.busy = false;
  setupPreview();
  restart();
}

function restart() {
  game.tri = game.start.tri.clone();
  game.P = game.start.P.slice();
  game.history = [];
  game.anim = null; game.hover = null; game.hintEdge = null; game.won = false;
  ui.par.textContent = game.start.flips;
  ui.goalText.textContent = `Make the degrees match: ${game.level.blurb}.`;
  setStatus('Click an edge to flip it.');
  refreshEdges();
  updatePanel();
}

function setupPreview() {
  const g = game.goal, data = new Float32Array(8 * g.tri.nV), degs = g.tri.degrees();
  for (let v = 0; v < g.tri.nV; v++) {
    const { n, r } = lorToCap(g.P, v);
    data.set([...n, r, ...hexRGB(colorOf(degs[v])), 0], 8 * v);
  }
  preview.setCircles(data, g.tri.nV, degs.map(d => d !== 6));
  preview.setEdges(g.tri.edges());
}

// --------------------------------------------------------------- display

function setStatus(t) { ui.status.textContent = t; }

function excess(tri) { return tri.degrees().reduce((s, d) => s + Math.max(0, d - 6), 0); }

function updatePanel() {
  const now = degreeHistogram(game.tri.degrees()), goal = degreeHistogram(game.goal.degrees);
  const ds = [...new Set([...now.keys(), ...goal.keys()])].sort((a, b) => a - b);
  ui.degBody.innerHTML = '';
  ui.chips.innerHTML = ds.map(d => {
    const n = now.get(d) || 0, g = goal.get(d) || 0;
    return `<span class="chip ${n === g ? 'ok' : 'bad'}"><span class="swatch" style="background:${colorOf(d)}"></span> ${d}: <b>${n}</b>/${g || '–'}</span>`;
  }).join('');
  for (const d of ds) {
    const n = now.get(d) || 0, g = goal.get(d) || 0;
    const tr = document.createElement('tr');
    tr.className = n === g ? 'ok' : 'bad';
    tr.innerHTML = `<td><span class="swatch" style="background:${colorOf(d)}"></span></td><td>${d}</td><td class="now">${n}</td><td>${g || '–'}</td>`;
    ui.degBody.appendChild(tr);
  }
  ui.moves.textContent = game.history.length;
  ui.overload.textContent = excess(game.tri);
  ui.undo.disabled = !game.history.length;
}

function refreshEdges() {
  dirty = true;
  const R = game.anim && game.anim.rewind;
  const flowing = game.anim && !R;
  const t = flowing ? game.anim.flow.tri1 : game.tri;
  const skip = flowing ? [game.anim.info.c, game.anim.info.d] : null;
  const h = R ? { ...game.anim.info, ok: false } : !game.anim && (game.hover || game.hintEdge);
  const edges = [];
  for (const [a, b] of t.edges()) {
    if (skip && ((a === skip[0] && b === skip[1]) || (a === skip[1] && b === skip[0]))) continue;
    let style = 0;
    if (h && ((a === h.a && b === h.b) || (a === h.b && b === h.a))) style = h.ok ? 1 : 2;
    edges.push([a, b, style]);
  }
  main.setEdges(edges);
  if (flowing) main.ghost = [game.anim.info.c, game.anim.info.d, 0, 0];
  else if (h && h.ok) main.ghost = [h.c, h.d, 0, 0];
  else main.ghost = [-1, -1, 0, 0];
}

function circleData() {
  const n = game.tri.nV, data = new Float32Array(8 * n);
  const degs = game.tri.degrees();
  const A = game.anim;
  const h = !A && (game.hover || game.hintEdge);
  for (let v = 0; v < n; v++) {
    const { n: c, r } = lorToCap(game.P, v);
    let rgb = hexRGB(colorOf(degs[v]));
    let hl = 0;
    if (A) {
      const d1 = A.flow.tri1.degree(v);
      if (d1 !== degs[v]) {
        const k = A.s, to = hexRGB(colorOf(d1));
        rgb = rgb.map((x, i) => x + (to[i] - x) * k);
      }
      if (v === A.info.c || v === A.info.d) hl = 0.8;
      if (v === A.info.a || v === A.info.b) hl = 0.6;
    } else if (h) {
      if (v === h.a || v === h.b) hl = h.ok ? 1 : 0.55;
      if (h.ok && (v === h.c || v === h.d)) hl = 0.75;
    }
    data.set([c[0], c[1], c[2], r, rgb[0], rgb[1], rgb[2], hl], 8 * v);
  }
  return data;
}

// --------------------------------------------------------------- flipping

function startFlip(a, b, isUndo = false) {
  if (game.anim || game.busy) return;
  const info = game.tri.flipInfo(a, b);
  if (!info.ok) { setStatus(`Can't flip that edge: ${info.reason}.`); return; }
  const flow = new Flow(game.tri, game.P, [[a, b]]);
  game.anim = { flow, info, t: 0, s: 0, isUndo, frames: [[0, game.P.slice()]] };
  game.hover = null; game.hintEdge = null;
  refreshEdges();
}

const REWIND_SECONDS = 0.5;

function stepAnim(dt) {
  const A = game.anim;
  if (A.rewind) return stepRewind(dt);
  A.t += dt;
  const x = Math.min(1, A.t / FLOW_SECONDS);
  const s = x * x * (3 - 2 * x);
  if (!A.flow.advance(game.P, s)) {
    // Play the flow backward to where it started, and say why.
    A.rewind = { t: 0 };
    refreshEdges();
    const msg = 'This flip could not be completed: the circles around a vertex of degree ' +
      `${Math.max(game.tri.degree(A.info.c), game.tri.degree(A.info.d)) + 1} get too small for the solver's precision. The flip was undone.`;
    setStatus(msg);
    showToast(msg);
    return;
  }
  A.s = s;
  A.frames.push([s, game.P.slice()]);
  if (x >= 1) finishFlip();
}

function stepRewind(dt) {
  const A = game.anim, F = A.frames;
  A.rewind.t += dt;
  const x = Math.min(1, A.rewind.t / REWIND_SECONDS);
  const [s, P] = F[Math.round((1 - x) * (F.length - 1))];
  game.P.set(P);
  A.s = s;
  if (x >= 1) { game.anim = null; refreshEdges(); }
}

let toastTimer = null;
function showToast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 5000);
}

function finishFlip() {
  const A = game.anim;
  game.tri = A.flow.tri1;
  if (A.isUndo) game.history.pop();
  else game.history.push({ c: A.info.c, d: A.info.d });
  game.anim = null;
  refreshEdges();
  updatePanel();
  if (!game.won && solved(game.tri, game.goal.degrees)) {
    game.won = true;
    const n = game.history.length;
    ui.winText.textContent = `You reached ${game.level.blurb} in ${n} flip${n === 1 ? '' : 's'} (the scramble used ${game.start.flips}).`;
    setTimeout(() => ui.win.classList.remove('hidden'), 450);
    setStatus('Solved!');
  } else {
    setStatus(A.isUndo ? 'Undone.' : `Flipped. Excess is now ${excess(game.tri)}.`);
  }
}

function undo() {
  const last = game.history[game.history.length - 1];
  if (!last || game.anim) return;
  startFlip(last.c, last.d, true);
}

// Greedy hint: the valid flip that best matches the goal's sorted degrees.
function hint() {
  if (game.anim) return;
  const goal = game.goal.degrees;
  const score = t => {
    const d = sortedDegrees(t);
    return d.reduce((s, x, i) => s + Math.abs(x - goal[i]), 0) * 100 + d.reduce((s, x) => s + (x - 6) ** 2, 0);
  };
  const base = score(game.tri);
  let best = null, bestScore = Infinity;
  for (const [a, b] of game.tri.edges()) {
    const f = game.tri.flipInfo(a, b);
    if (!f.ok) continue;
    const t = game.tri.clone(); t.flip(a, b);
    const sc = score(t) + Math.random() * 0.5;
    if (sc < bestScore) { bestScore = sc; best = f; }
  }
  if (!best) return;
  game.hintEdge = best; game.hover = null;
  refreshEdges();
  setStatus(bestScore < base ? 'Hint: try the highlighted edge.' : 'Hint: no single flip helps right now; the highlighted one does least harm.');
}

// --------------------------------------------------------------- input

const canvas = $('sphere');
let pointer = null;
const pinch = new Map();

function edgeAt(x, y) {
  const hit = main.pick(x, y);
  if (!hit) return null;
  const tol = 12 * hit.pxAngle / Math.max(hit.z, 0.3);
  let best = null, bd = tol;
  const caps = [];
  for (let v = 0; v < game.tri.nV; v++) caps.push(lorToCap(game.P, v).n);
  for (const [a, b] of game.tri.edges()) {
    const d = arcDistance(hit.u, caps[a], caps[b]);
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return best ? game.tri.flipInfo(best[0], best[1]) : null;
}

function setHover(info) {
  const same = (p, q) => p && q && p.a === q.a && p.b === q.b;
  if (same(info, game.hover) || (!info && !game.hover)) return;
  game.hover = info;
  if (info) game.hintEdge = null;
  canvas.classList.toggle('over-edge', !!info);
  refreshEdges();
  if (info && !info.ok) setStatus(`Can't flip: ${info.reason}.`);
  else if (info) setStatus(`Flip: degrees ${game.tri.degree(info.a)},${game.tri.degree(info.b)} lose one; ${game.tri.degree(info.c)},${game.tri.degree(info.d)} gain one.`);
}

// Spin-down after a flick: angular velocity vector in view coords (rad/s).
let spin = null;
const SPIN_DECAY = 0.9;   // seconds for the spin to fall by a factor e

canvas.addEventListener('pointerdown', e => {
  spin = null;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  pinch.set(e.pointerId, [e.clientX, e.clientY]);
  pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, type: e.pointerType };
});

canvas.addEventListener('pointermove', e => {
  if (pinch.has(e.pointerId) && pinch.size === 2) {
    const [p, q] = [...pinch.values()];
    const d0 = Math.hypot(p[0] - q[0], p[1] - q[1]);
    pinch.set(e.pointerId, [e.clientX, e.clientY]);
    const [p2, q2] = [...pinch.values()];
    const d1 = Math.hypot(p2[0] - q2[0], p2[1] - q2[1]);
    if (d0 > 0) main.zoom = Math.min(3.5, Math.max(0.5, main.zoom * d1 / d0));
    if (pointer) { pointer.moved = true; pointer.vel = null; }
    return;
  }
  if (pinch.has(e.pointerId)) pinch.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointer && pointer.id === e.pointerId) {
    if (!pointer.moved && Math.hypot(e.clientX - pointer.x0, e.clientY - pointer.y0) > 5) {
      pointer.moved = true; canvas.classList.add('dragging');
    }
    if (pointer.moved) {
      const r = canvas.getBoundingClientRect();
      const st = main.arcball(pointer.x - r.left, pointer.y - r.top, e.clientX - r.left, e.clientY - r.top);
      const dt = (e.timeStamp - (pointer.t ?? e.timeStamp)) / 1000;
      if (st && dt > 0) {
        const w = st.axis.map(a => a * st.angle / dt), old = pointer.vel;
        pointer.vel = old ? w.map((x, i) => 0.6 * x + 0.4 * old[i]) : w;
      }
      pointer.t = e.timeStamp;
      pointer.x = e.clientX; pointer.y = e.clientY;
    }
    return;
  }
  if (e.pointerType === 'mouse' && !game.anim && !game.busy) {
    const r = canvas.getBoundingClientRect();
    setHover(edgeAt(e.clientX - r.left, e.clientY - r.top));
  }
});

function endPointer(e) {
  pinch.delete(e.pointerId);
  if (!pointer || pointer.id !== e.pointerId) return;
  canvas.classList.remove('dragging');
  const p = pointer; pointer = null;
  if (p.moved && p.vel && e.timeStamp - p.t < 80) {
    const w = Math.hypot(...p.vel);
    if (w > 0.3) spin = p.vel.map(x => x * Math.min(1, 12 / w));
  }
  if (p.moved || game.anim || game.busy || e.type === 'pointercancel') return;
  const r = canvas.getBoundingClientRect();
  const info = edgeAt(e.clientX - r.left, e.clientY - r.top);
  if (!info) { setHover(null); return; }
  if (p.type !== 'mouse') {
    // touch: first tap selects, second tap on the same edge flips
    const h = game.hover;
    if (!(h && h.a === info.a && h.b === info.b)) { setHover(info); return; }
  }
  if (info.ok) startFlip(info.a, info.b);
  else setStatus(`Can't flip that edge: ${info.reason}.`);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pointer) setHover(null); });

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  main.zoom = Math.min(3.5, Math.max(0.5, main.zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 'u' || e.key === 'U' || ((e.metaKey || e.ctrlKey) && e.key === 'z')) { e.preventDefault(); undo(); }
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'v' || e.key === 'V') resetView();
  else if (e.key === 'Escape') { ui.help.classList.add('hidden'); ui.win.classList.add('hidden'); }
});

function resetView() { spin = null; main.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1]; main.zoom = 1; }

ui.newBtn.onclick = () => newPuzzle(LEVELS.find(l => l.id === ui.level.value), ui.difficulty.value, randomSeed());
ui.level.onchange = ui.newBtn.onclick;
ui.difficulty.onchange = ui.newBtn.onclick;
ui.undo.onclick = undo;
ui.hint.onclick = hint;
ui.reset.onclick = () => { if (!game.anim && !game.busy) restart(); };
ui.view.onclick = resetView;
ui.helpBtn.onclick = () => ui.help.classList.remove('hidden');
$('helpClose').onclick = () => ui.help.classList.add('hidden');
$('winClose').onclick = () => ui.win.classList.add('hidden');
$('winNew').onclick = ui.newBtn.onclick;

// --------------------------------------------------------------- loop

let last = performance.now(), previewAngle = 0, dirty = true, lastViewKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (spin && !pointer) {
    const w = Math.hypot(...spin);
    main.rotateAbout(spin.map(x => x / w), w * dt);
    const k = Math.exp(-dt / SPIN_DECAY);
    spin = w * k < 0.05 ? null : spin.map(x => x * k);
  }
  if (game.P && !game.busy) {
    const animating = !!game.anim;
    if (animating) stepAnim(dt);
    const moved = balanceStep(game.P, animating ? 0.01 : 0.02, 0.15) > 1e-7;
    const viewKey = main.rot.join() + main.zoom + main.canvas.clientWidth + 'x' + main.canvas.clientHeight;
    if (animating || moved || dirty || viewKey !== lastViewKey) {
      main.setCircles(circleData(), game.tri.nV, game.tri.degrees().map(d => d !== 6));
      main.draw();
      dirty = false; lastViewKey = viewKey;
    }
  }
  if (game.goal && !game.busy) {
    previewAngle += dt * 0.35;
    const c = Math.cos(previewAngle), s = Math.sin(previewAngle), tc = Math.cos(0.35), ts = Math.sin(0.35);
    preview.rot = [c, 0, s, ts * s, tc, -ts * c, -tc * s, ts, tc * c];
    preview.draw();
  }
  requestAnimationFrame(frame);
}

const first = readParams();
if (!localStorageGet('ff-seen-help')) { ui.help.classList.remove('hidden'); localStorageSet('ff-seen-help', '1'); }
newPuzzle(first.lv, first.d, first.seed).then(() => requestAnimationFrame(frame));

// for debugging from the console
window.flipflow = { game, main, startFlip, undo, hint };

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
