// WebGL2 renderer: ray-casts the unit sphere per pixel and colors it by the
// cap containing each point, with the geodesic triangulation drawn on top.

const VS = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uOff;             // sphere center offset from canvas center, device px
uniform float uZoom;
uniform mat3 uRot;            // packing coords -> view coords
uniform highp sampler2D uCirc; // row 0: center.xyz, radius; row 1: rgb, highlight; row 2: marker
uniform highp sampler2D uEdge; // (i, j, style, 0)
uniform int uNV;
uniform int uNE;
uniform vec4 uGhost;          // c, d of the prospective new edge (or -1), style
uniform float uLine;          // line width in pixels
uniform float uSize;          // diameter of the sphere at zoom 1, device px
uniform float uMinR;          // marked circles smaller than this get a ring, device px
out vec4 outColor;

vec3 cen(int i) { return texelFetch(uCirc, ivec2(i, 0), 0).xyz; }

float arcDist(vec3 u, vec3 a, vec3 b, out float t) {
  vec3 m = cross(a, b);
  float lm = length(m);
  t = 0.0;
  if (lm < 1e-7) return 10.0;
  m /= lm;
  if (dot(cross(a, u), m) < 0.0 || dot(cross(u, b), m) < 0.0) return 10.0;
  vec3 up = normalize(u - dot(u, m) * m);
  t = atan(dot(cross(a, up), m), dot(a, up));
  return abs(asin(clamp(dot(u, m), -1.0, 1.0)));
}

void main() {
  float sc = 0.5 * uSize * uZoom;
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes - uOff) / sc;
  float rr = dot(q, q);
  float px = 1.0 / sc;
  float cover = 1.0 - smoothstep(1.0 - 1.5 * px, 1.0, sqrt(rr));
  if (cover <= 0.0) { outColor = vec4(0.0); return; }
  vec3 P = vec3(q, sqrt(max(0.0, 1.0 - rr)));
  vec3 u = transpose(uRot) * P;
  float pa = max(length(fwidth(u)), 1e-5);   // angle per pixel

  float best = 1e9; int bi = -1;
  float minAng = uMinR * pa, mk = 1e9; int mi = -1;
  for (int i = 0; i < uNV; i++) {
    vec4 c = texelFetch(uCirc, ivec2(i, 0), 0);
    float ang = acos(clamp(dot(u, c.xyz), -1.0, 1.0));
    float d = ang - c.w;
    if (d < best) { best = d; bi = i; }
    if (c.w < minAng && ang < 2.0 * minAng && texelFetch(uCirc, ivec2(i, 2), 0).x > 0.5) {
      float md = abs(ang - minAng);
      if (md < mk) { mk = md; mi = i; }
    }
  }
  float rad = bi >= 0 ? texelFetch(uCirc, ivec2(bi, 0), 0).w : 1.0;
  vec3 gap = vec3(0.10, 0.11, 0.15);
  vec3 col = gap;
  if (bi >= 0) {
    vec4 cc = texelFetch(uCirc, ivec2(bi, 1), 0);
    float inside = 1.0 - smoothstep(-0.5 * pa, 0.5 * pa, best);
    vec3 fill = cc.rgb;
    if (cc.a > 0.5) fill = mix(fill, vec3(1.0), 0.35 * (cc.a - 0.5) * 2.0);
    // soft inner shading toward the rim
    float rim = smoothstep(-6.0 * pa, 0.0, best);
    fill *= 1.0 - 0.18 * rim;
    col = mix(gap, fill, inside);
    float rw = min(0.6 * uLine * pa, 0.12 * rad);
    float ring = 1.0 - smoothstep(rw, rw + pa, abs(best));
    col = mix(col, vec3(0.05, 0.05, 0.08), 0.85 * ring);
    if (cc.a > 0.5) {
      float glow = 1.0 - smoothstep(1.2 * uLine * pa, (1.2 * uLine + 1.5) * pa, abs(best));
      col = mix(col, vec3(1.0, 0.92, 0.4), glow * (cc.a - 0.5) * 2.0);
    }
  }

  // edges
  float ed = 10.0, hd = 10.0; float hstyle = 0.0; float t;
  for (int e = 0; e < uNE; e++) {
    vec4 E = texelFetch(uEdge, ivec2(e, 0), 0);
    float d = arcDist(u, cen(int(E.x + 0.5)), cen(int(E.y + 0.5)), t);
    if (E.z > 0.5) { if (d < hd) { hd = d; hstyle = E.z; } }
    else ed = min(ed, d);
  }
  float lw = min(0.5 * uLine * pa, 0.08 * rad);
  col = mix(col, vec3(0.06, 0.06, 0.09), 0.75 * (1.0 - smoothstep(lw, lw + pa, ed)));
  if (hd < 9.0) {
    vec3 hc = hstyle < 1.5 ? vec3(1.0, 0.85, 0.2) : vec3(1.0, 0.3, 0.3);
    float hw = 1.6 * uLine * pa;
    col = mix(col, vec3(0.0), 0.8 * (1.0 - smoothstep(hw + pa, hw + 2.5 * pa, hd)));
    col = mix(col, hc, 1.0 - smoothstep(hw, hw + pa, hd));
  }
  if (uGhost.x >= 0.0) {
    float d = arcDist(u, cen(int(uGhost.x + 0.5)), cen(int(uGhost.y + 0.5)), t);
    float dash = step(0.5, fract(t / (14.0 * pa)));
    float gw = 1.1 * uLine * pa;
    col = mix(col, vec3(0.55, 0.95, 1.0), dash * (1.0 - smoothstep(gw, gw + pa, d)));
  }

  // marker rings for tiny circles
  if (mi >= 0) {
    vec3 mc = texelFetch(uCirc, ivec2(mi, 1), 0).rgb;
    float mw = 0.9 * uLine * pa;
    col = mix(col, vec3(0.03, 0.03, 0.05), 0.9 * (1.0 - smoothstep(mw + 0.8 * pa, mw + 1.8 * pa, mk)));
    col = mix(col, mc, 1.0 - smoothstep(mw, mw + pa, mk));
  }

  // lighting
  vec3 L = normalize(vec3(-0.45, 0.6, 1.0));
  float diff = 0.62 + 0.38 * max(dot(P, L), 0.0);
  float spec = pow(max(dot(reflect(-L, P), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  col = col * diff + 0.18 * spec;
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.35, P.z);
  outColor = vec4(col * cover, cover);
}`;

export class SphereRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uRes', 'uZoom', 'uRot', 'uCirc', 'uEdge', 'uNV', 'uNE', 'uGhost', 'uLine', 'uOff', 'uSize', 'uMinR']) this.u[n] = gl.getUniformLocation(prog, n);
    this.circTex = this.makeTex(); this.edgeTex = this.makeTex();
    this.zoom = 0.92;
    this.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // row-major
    this.ghost = [-1, -1, 0, 0];
    this.lineScale = 1;
    this.markerPx = 6;        // CSS px radius of the marker ring
    this.layout = () => ({ cx: 0, cy: 0, size: Math.min(this.canvas.clientWidth, this.canvas.clientHeight) });
  }

  makeTex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // circles: Float32Array of 8 per circle (nx, ny, nz, r, R, G, B, highlight);
  // marked[i] true draws a ring around circle i when it is too small to see
  setCircles(data, n, marked) {
    const gl = this.gl, buf = new Float32Array(12 * n);
    for (let i = 0; i < n; i++) {
      buf.set(data.subarray(8 * i, 8 * i + 4), 4 * i);
      buf.set(data.subarray(8 * i + 4, 8 * i + 8), 4 * (n + i));
      buf[4 * (2 * n + i)] = marked && marked[i] ? 1 : 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.circTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 3, 0, gl.RGBA, gl.FLOAT, buf);
    this.nV = n;
  }

  // edges: array of [i, j, style]  (style 0 normal, 1 hover ok, 2 hover blocked)
  setEdges(edges) {
    const gl = this.gl, n = Math.max(1, edges.length), buf = new Float32Array(4 * n);
    edges.forEach(([i, j, s], k) => buf.set([i, j, s || 0, 0], 4 * k));
    gl.bindTexture(gl.TEXTURE_2D, this.edgeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 1, 0, gl.RGBA, gl.FLOAT, buf);
    this.nE = edges.length;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }

  draw() {
    this.resize();
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    const L = this.layout();
    gl.uniform2f(u.uOff, L.cx * this.dpr, -L.cy * this.dpr);
    gl.uniform1f(u.uSize, L.size * this.dpr);
    gl.uniform1f(u.uZoom, this.zoom);
    gl.uniformMatrix3fv(u.uRot, true, this.rot);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.circTex); gl.uniform1i(u.uCirc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.edgeTex); gl.uniform1i(u.uEdge, 1);
    gl.uniform1i(u.uNV, this.nV || 0);
    gl.uniform1i(u.uNE, this.nE || 0);
    gl.uniform4fv(u.uGhost, this.ghost);
    gl.uniform1f(u.uLine, 1.4 * this.lineScale * this.dpr * Math.min(1.6, Math.max(0.7, this.zoom)));
    gl.uniform1f(u.uMinR, this.markerPx * this.dpr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Screen point (CSS px relative to canvas) -> point on the sphere in packing coords, or null.
  pick(x, y) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, L = this.layout();
    const sc = 0.5 * L.size * this.zoom;
    const qx = (x - 0.5 * w - L.cx) / sc, qy = (0.5 * h + L.cy - y) / sc;
    const rr = qx * qx + qy * qy;
    if (rr >= 1) return null;
    const P = [qx, qy, Math.sqrt(1 - rr)], R = this.rot;
    // u = R^T P
    return {
      u: [R[0] * P[0] + R[3] * P[1] + R[6] * P[2], R[1] * P[0] + R[4] * P[1] + R[7] * P[2], R[2] * P[0] + R[5] * P[1] + R[8] * P[2]],
      z: P[2], pxAngle: 1 / sc,
    };
  }

  // Arcball (Shoemake): a screen point maps to the visible sphere itself, or
  // to its rim when outside it, in view coords.
  arcballVector(x, y) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, L = this.layout();
    const sc = 0.5 * L.size * this.zoom;
    const qx = (x - 0.5 * w - L.cx) / sc, qy = (0.5 * h + L.cy - y) / sc;
    const rr = qx * qx + qy * qy;
    if (rr <= 1) return [qx, qy, Math.sqrt(1 - rr)];
    const r = Math.sqrt(rr);
    return [qx / r, qy / r, 0];
  }

  // Rotate so the sphere point under (x0, y0) moves to (x1, y1). Dragging
  // inside the sphere keeps the grabbed point under the cursor; dragging
  // outside it spins about the view axis.
  arcball(x0, y0, x1, y1) {
    const a = this.arcballVector(x0, y0), b = this.arcballVector(x1, y1);
    const ax = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const s = Math.hypot(...ax);
    if (s < 1e-12) return null;
    const axis = ax.map(v => v / s), angle = Math.atan2(s, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    this.rotateAbout(axis, angle);
    return { axis, angle };
  }

  // R <- Rot(axis, ang) * R, axis a unit vector in view coords
  rotateAbout([x, y, z], ang) {
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const M = [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    const R = this.rot, out = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      out[3 * i + j] = M[3 * i] * R[j] + M[3 * i + 1] * R[3 + j] + M[3 * i + 2] * R[6 + j];
    }
    this.rot = orthonormalize(out);
  }
}

function orthonormalize(R) {
  const a = [R[0], R[1], R[2]], b = [R[3], R[4], R[5]];
  const na = Math.hypot(...a); a.forEach((x, i) => a[i] = x / na);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  b.forEach((x, i) => b[i] = x - d * a[i]);
  const nb = Math.hypot(...b); b.forEach((x, i) => b[i] = x / nb);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [...a, ...b, ...c];
}

// Same geometry as the shader's arcDist, for picking.
export function arcDistance(u, a, b) {
  const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dt = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  let m = cr(a, b); const lm = Math.hypot(...m);
  if (lm < 1e-9) return Infinity;
  m = m.map(x => x / lm);
  if (dt(cr(a, u), m) < 0 || dt(cr(u, b), m) < 0) return Infinity;
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, dt(u, m)))));
}
