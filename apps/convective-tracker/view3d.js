// Cloud-top tomography: 3D view of the convective cell tracker output. Author: Yosik Norman.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const HYPARQUET = 'https://cdn.jsdelivr.net/npm/hyparquet@1.31.5/src/index.js';
const $ = id => document.getElementById(id);

// ---------- data: prefer data/ (meta.json + tb.zarr + cells.parquet), fall back to tracker.json ----------
const num = v => typeof v === 'bigint' ? Number(v) : v;
function groupTracks(rows) {               // rows: {t,id,lon,lat,area,tmin}
  const m = new Map();
  for (const r of rows) { if (!m.has(r.id)) m.set(r.id, []); m.get(r.id).push(r) }
  const out = [];                          // cut a track where the centroid jumps > 0.12 deg in one step (merge/split, not motion)
  for (const [id, pts] of m) { pts.sort((a, b) => a.t - b.t); let seg = [pts[0]], k = 0;
    for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i];
      if (!b || b.t - a.t > 1 || Math.hypot(b.lon - a.lon, b.lat - a.lat) > .12) { out.push({ id: k ? `${id}.${k + 1}` : String(id), pts: seg }); k++; seg = [] }
      if (b) seg.push(b) } }
  return out.sort((a, b) => a.pts[0].t - b.pts[0].t || a.id - b.id);
}
async function inflate(buf, fmt) { return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer()) }
async function fromStore(J) {
  const M = J.meta || J, N = M.nx * M.ny;
  const z = await (await fetch('data/tb.zarr/.zarray')).json();
  if (z.dtype !== '|u1' || (z.order && z.order !== 'C')) throw new Error('unsupported zarr dtype/order ' + z.dtype);
  if (z.chunks[1] < M.ny || z.chunks[2] < M.nx) throw new Error('zarr chunks must cover the full frame');
  const k = z.chunks[0], sep = z.dimension_separator || '.', cid = z.compressor && z.compressor.id;
  const fmt = !cid ? null : cid === 'zlib' ? 'deflate' : cid === 'gzip' ? 'gzip' : null;
  if (cid && !fmt) throw new Error('unsupported zarr compressor ' + cid);
  const nc = Math.ceil(M.nt / k), tb = new Uint8Array(M.nt * N);
  await Promise.all([...Array(nc).keys()].map(async c => {
    const r = await fetch(`data/tb.zarr/${[c, 0, 0].join(sep)}`);
    if (!r.ok) { tb.fill(z.fill_value ?? 0, c * k * N, Math.min(M.nt, (c + 1) * k) * N); return }
    let b = new Uint8Array(await r.arrayBuffer()); if (fmt) b = await inflate(b, fmt);
    tb.set(b.subarray(0, (Math.min(M.nt, (c + 1) * k) - c * k) * N), c * k * N);
  }));
  const { parquetReadObjects } = await import(HYPARQUET);
  const file = await (await fetch('data/cells.parquet')).arrayBuffer();
  let rows = (await parquetReadObjects({ file })).map(r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, num(b)])));
  const runs = Array.isArray(J.runs) ? J.runs : J.runs && J.runs.run_id ? [].concat(J.runs.run_id).map(run_id => ({ run_id })) : [];
  const run = M.run_id || (runs.length ? runs[runs.length - 1].run_id : rows.reduce((a, r) => r.run_id > a ? r.run_id : a, ''));
  if (rows.length && 'run_id' in rows[0]) { const f = rows.filter(r => r.run_id === run); if (f.length) rows = f }
  return { M, tb, coast: J.coast || [], places: J.places || [], src: 'data/',
    tracks: groupTracks(rows.map(r => ({ t: r.t, id: r.id, lon: r.lon, lat: r.lat, area: r.area_km2 ?? r.area, tmin: r.tmin_k ?? r.tmin }))) };
}
function fromJson(D) {
  const tb = Uint8Array.from(atob(D.tb_b64), c => c.charCodeAt(0)), rows = [];
  for (const [id, pts] of Object.entries(D.tracks)) for (const [t, lon, lat, area, tmin] of pts) rows.push({ t, id: +id, lon, lat, area, tmin });
  return { M: D.meta, tb, coast: D.coast || [], places: D.places || [], tracks: groupTracks(rows), src: 'tracker.json' };
}
async function loadData() {
  try {
    const r = await fetch('data/meta.json'); if (!r.ok) throw null;
    return await fromStore(await r.json());
  } catch (e) { if (e) console.warn('data/ not usable, falling back to tracker.json:', e.message || e) }
  return fromJson(await (await fetch('tracker.json')).json());
}

// ---------- IR palette (same scale as the 2D tracker) and Tb -> height ----------
const S = [[300, [18, 28, 34]], [273, [92, 104, 110]], [250, [178, 188, 192]], [240, [222, 228, 231]], [235, [63, 149, 214]], [225, [95, 211, 230]], [218, [120, 214, 120]], [210, [246, 214, 72]], [203, [255, 140, 60]], [197, [255, 77, 122]], [190, [255, 240, 250]]];
function cm(k) { if (k >= S[0][0]) return S[0][1]; for (let i = 1; i < S.length; i++) if (k >= S[i][0]) { const a = S[i - 1], b = S[i], f = (a[0] - k) / (a[0] - b[0]); return [0, 1, 2].map(j => a[1][j] + (b[1][j] - a[1][j]) * f) } return S[S.length - 1][1] }
// Fixed tropical standard profile: T(z) = 300 K - 6.5 K/km * z up to the tropopause (16.9 km, 190 K).
// Colder pixels are read as overshooting tops: +1 km per 7 K, capped at 18.5 km.
const T0 = 300, LAPSE = 6.5, TTROP = 190, ZTROP = (T0 - TTROP) / LAPSE, OVER = 7, ZMAX = 18.5;
const hKm = k => k >= TTROP ? Math.max(0, (T0 - k) / LAPSE) : Math.min(ZMAX, ZTROP + (TTROP - k) / OVER);

const D = await loadData(), M = D.M, NX = M.nx, NY = M.ny, NT = M.nt, N = NX * NY;
if(M.sample_data===false){const b=document.querySelector(".badge");b.textContent="Concept demo · Himawari-9 · "+M.start_utc.slice(0,10);document.querySelectorAll("p").forEach(p=>{if(/^Sample data:|Sample data: a synthetic/.test(p.textContent))p.textContent=p.textContent.replace(/Sample data: a synthetic[^;.]*(;|.)|Sample data: a synthetic[^.]*./,"Real data: Himawari-9 band 13, "+M.start_utc+" UTC, read from JMA HSD (NOAA open data) in R.")})}
$('load').remove();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- geometry: 1 world unit = 10 km ----------
const latc = (M.lat0 + M.lat1) / 2, KX = 111.32 * Math.cos(latc * Math.PI / 180), KY = 110.57;
const W = (M.lon1 - M.lon0) * KX / 10, DP = (M.lat1 - M.lat0) * KY / 10, TZ = 22;
const px = lon => (lon - M.lon0) / (M.lon1 - M.lon0) * W - W / 2, pz = lat => (M.lat1 - lat) / (M.lat1 - M.lat0) * DP - DP / 2;
const ty = t => t / Math.max(1, NT - 1) * TZ;
let ex = 4, mode = 'top', tc = 0, playing = !reduce, sel = null, dirty = true, lastFr = -1;
const hy = k => hKm(k) * ex / 10;

const cv = $('gl'), stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, .5, 600);
cam.position.set(4, 34, 50);
const ctl = new OrbitControls(cam, cv);
ctl.target.set(0, 2, 0); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * .49; ctl.minDistance = 12; ctl.maxDistance = 150;
scene.add(new THREE.AmbientLight(0xffffff, .55));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-20, 40, 25); scene.add(sun);

// base plane, graticule, coast
// terrain + bathymetry (data/dem.bin, int16 m, ETOPO1 via dem.R): land relief x6, sea flat and shaded by depth
const TEX = 6, dem = await fetch('data/dem.bin').then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Int16Array(b)).catch(() => null);
const bg = new THREE.PlaneGeometry(W, DP, NX - 1, NY - 1), bc = [];
const ramp = (z, st) => { let i = 1; while (i < st.length - 1 && z > st[i][0]) i++; const [z0, a] = st[i - 1], [z1, b] = st[i], f = Math.min(1, Math.max(0, (z - z0) / (z1 - z0))); return a.map((v, k) => (v + (b[k] - v) * f) / 255) };
const LAND = [[0, [122, 150, 96]], [300, [146, 160, 104]], [900, [160, 140, 98]], [1800, [132, 112, 90]], [2600, [170, 162, 152]]];
const SEA = [[-6000, [38, 84, 128]], [-1000, [62, 118, 160]], [-200, [104, 158, 192]], [0, [150, 196, 216]]];
for (let i = 0; i < NX * NY; i++) { const z = dem ? dem[i] : 0; bg.attributes.position.setZ(i, z > 0 ? z / 1000 * TEX / 10 : -.03); bc.push(...ramp(z, z > 0 ? LAND : SEA)) }
bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); bg.computeVertexNormals();
const base = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true }));
base.rotation.x = -Math.PI / 2; scene.add(base);
const segs = (lines, y, color, opacity) => {
  const v = []; for (const l of lines) for (let i = 1; i < l.length; i++) if (![l[i - 1], l[i]].some(([x, y]) => x < M.lon0 || x > M.lon1 || y < M.lat0 || y > M.lat1)) v.push(px(l[i - 1][0]), y, pz(l[i - 1][1]), px(l[i][0]), y, pz(l[i][1]));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
};
const grat = [];
for (let lo = Math.ceil(M.lon0); lo <= M.lon1; lo++) grat.push([[lo, M.lat0], [lo, M.lat1]]);
for (let la = Math.ceil(M.lat0); la <= M.lat1; la++) grat.push([[M.lon0, la], [M.lon1, la]]);
grat.push([[M.lon0, M.lat0], [M.lon1, M.lat0], [M.lon1, M.lat1], [M.lon0, M.lat1], [M.lon0, M.lat0]]);
scene.add(segs(grat, -.02, 0xc3ced3, 1));
scene.add(segs(D.coast, 0, 0x5d7682, .9));
const sliceCoast = segs(D.coast, 0, 0x9fb6bf, .55); sliceCoast.visible = false; scene.add(sliceCoast);

// towns
const labels = $('labels'), lbls = [];
const addLabel = (txt, pos, cls) => { const el = document.createElement('div'); el.className = 'lb ' + (cls || ''); el.textContent = txt; labels.appendChild(el); const o = { el, pos, show: true, off: cls === 'ax' ? 'translate(4px,-50%)' : cls === 'l' ? 'translate(calc(-100% - 6px),-50%)' : 'translate(-50%,-130%)' }; lbls.push(o); return o };
const dotG = new THREE.CylinderGeometry(.18, .18, .12, 12), dotM = new THREE.MeshBasicMaterial({ color: 0x33444d });
for (const [name, lon, lat, left] of D.places) { const m = new THREE.Mesh(dotG, dotM); m.position.set(px(lon), .06, pz(lat)); scene.add(m); addLabel(name, m.position, left ? 'l' : '') }

// ---------- cloud-top surface (GPU: Tb -> height and palette in the shader) ----------
const lutData = new Uint8Array(256 * 4); for (let v = 0; v < 256; v++) { const c = cm(v + 180); lutData.set([...c.map(Math.round), 255], v * 4) }
const lut = new THREE.DataTexture(lutData, 256, 1); lut.magFilter = lut.minFilter = THREE.LinearFilter; lut.colorSpace = THREE.SRGBColorSpace; lut.needsUpdate = true;
const sg = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), idx = [];
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x; pos[i * 3] = (x + .5) / NX * W - W / 2; pos[i * 3 + 2] = (y + .5) / NY * DP - DP / 2 }
for (let y = 0; y < NY - 1; y++) for (let x = 0; x < NX - 1; x++) { const a = y * NX + x; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1) }
const tb0 = new THREE.BufferAttribute(new Float32Array(N), 1), tb1 = new THREE.BufferAttribute(new Float32Array(N), 1);
sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('tb0', tb0); sg.setAttribute('tb1', tb1); sg.setIndex(idx);
const U = { lut: { value: lut }, f: { value: 0 }, ex: { value: ex }, uFlat: { value: 0 }, sliceY: { value: 0 }, T0: { value: T0 }, LAPSE: { value: LAPSE }, TTROP: { value: TTROP }, OVER: { value: OVER }, ZMAX: { value: ZMAX } };
const smat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, side: THREE.DoubleSide,
  vertexShader: `attribute float tb0; attribute float tb1; uniform float f, ex, uFlat, sliceY, T0, LAPSE, TTROP, OVER, ZMAX; varying float vT; varying vec3 vP;
    void main(){ vT = mix(tb0, tb1, f); float k = vT + 180.;
      float h = k >= TTROP ? max(0., (T0 - k) / LAPSE) : min(ZMAX, (T0 - TTROP) / LAPSE + (TTROP - k) / OVER);
      vec3 p = position; p.y = uFlat > .5 ? sliceY : h * ex / 10.; vP = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
  fragmentShader: `uniform sampler2D lut; uniform float uFlat; varying float vT; varying vec3 vP;
    void main(){ float k = vT + 180.; float a = smoothstep(262., 242., k);
      if (uFlat < .5) { if (a < .04) discard; } else a = .25 + .6 * a;
      vec3 c = texture2D(lut, vec2((vT + .5) / 256., .5)).rgb;
      vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); float l = uFlat > .5 ? 1. : .5 + .55 * abs(dot(n, normalize(vec3(-.4, 1., .5))));
      gl_FragColor = vec4(c * l, a); }`
});
const surf = new THREE.Mesh(sg, smat); surf.renderOrder = 2; scene.add(surf);
let fi = -1;
function setFrames(i0) {
  if (i0 === fi) return; fi = i0; const i1 = Math.min(NT - 1, i0 + 1), a = tb0.array, b = tb1.array;
  for (let i = 0; i < N; i++) { a[i] = D.tb[i0 * N + i]; b[i] = D.tb[i1 * N + i] }
  tb0.needsUpdate = tb1.needsUpdate = true;
}

// ---------- tracks: variable-radius tubes ----------
const SUB = 6, RAD = 10, up = new THREE.Vector3(0, 1, 0), alt = new THREE.Vector3(1, 0, 0);
const lerp = (a, b, f) => a + (b - a) * f;
function sampleAt(tr, t) {                 // interpolated cell state at fractional time t, or null
  const p = tr.pts, t0 = p[0].t, tl = p[p.length - 1].t; if (t < t0 - 1e-6 || t > tl + 1e-6) return null;
  const u = Math.min(p.length - 1, Math.max(0, t - t0)), i = Math.min(p.length - 2, Math.floor(u)), f = u - Math.max(0, i);
  if (p.length === 1) return p[0];
  const a = p[i], b = p[i + 1]; return { t, lon: lerp(a.lon, b.lon, f), lat: lerp(a.lat, b.lat, f), area: lerp(a.area, b.area, f), tmin: lerp(a.tmin, b.tmin, f) };
}
const where = (s, m) => new THREE.Vector3(px(s.lon), m === 'st' ? ty(s.t) : hy(s.tmin) + .45, pz(s.lat));
const radius = (s, m) => m === 'st' ? Math.max(.25, Math.sqrt(s.area / Math.PI) / 10 * .7) : .1 + Math.sqrt(s.area / Math.PI) / 10 * .1;
function tube(tr, m) {
  const p = tr.pts, n = (p.length - 1) * SUB + 1, ss = [];
  for (let s = 0; s < n; s++) ss.push(sampleAt(tr, p[0].t + s / SUB));
  const cs = new THREE.CatmullRomCurve3(ss.filter((_, s) => s % SUB === 0).map(s => where(s, m)));
  const P = ss.map((s, j) => p.length > 1 ? cs.getPoint(j / (n - 1)) : where(s, m));
  const v = [], c = [], ix = [], T = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  for (let j = 0; j < n; j++) {
    T.subVectors(P[Math.min(n - 1, j + 1)], P[Math.max(0, j - 1)]).normalize();
    A.crossVectors(T, Math.abs(T.y) > .9 ? alt : up).normalize(); B.crossVectors(T, A).normalize();
    const r = radius(ss[j], m), col = cm(ss[j].tmin).map(x => x / 255);
    for (let q = 0; q < RAD; q++) { const a = q / RAD * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      v.push(P[j].x + A.x * ca + B.x * sa, P[j].y + A.y * ca + B.y * sa, P[j].z + A.z * ca + B.z * sa); c.push(...col) }
  }
  for (let j = 0; j < n - 1; j++) for (let q = 0; q < RAD; q++) { const a = j * RAD + q, b = j * RAD + (q + 1) % RAD; ix.push(a, a + RAD, b, b, a + RAD, b + RAD) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(ix); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .9, side: THREE.DoubleSide, emissive: 0xff4d7a, emissiveIntensity: 0 });
  const mesh = new THREE.Mesh(g, mat); mesh.userData = { tr, n }; mesh.renderOrder = m === 'st' ? 3 : 1;
  const lg = new THREE.BufferGeometry().setFromPoints(P), line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff4d7a }));
  line.visible = false; mesh.add(line); return mesh;
}
for (const tr of D.tracks) {
  tr.peak = tr.pts.reduce((a, s) => s.tmin < a.tmin ? s : a); tr.amax = Math.max(...tr.pts.map(s => s.area));
  tr.lab = addLabel('#' + tr.id, new THREE.Vector3(), 'c'); tr.mark = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe6eef0 })); scene.add(tr.mark);
}
const groups = { top: new THREE.Group(), st: new THREE.Group() }; scene.add(groups.top, groups.st);
function buildTubes(m) { const g = groups[m]; for (const c of [...g.children]) { c.geometry.dispose(); c.children[0].geometry.dispose(); g.remove(c) } for (const tr of D.tracks) g.add(tube(tr, m)) }
buildTubes('top');

// time axis for space-time mode
const axis = new THREE.Group(); scene.add(axis);
{ const x = -W / 2 - .8, z = -DP / 2 - .8;
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, TZ, z)]); axis.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x93a9b3 })));
  const step = Math.max(1, Math.round(60 / M.step_min));
  for (let t = 0; t < NT; t += step) { const tk = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, ty(t), z), new THREE.Vector3(x + .6, ty(t), z)]); axis.add(new THREE.Line(tk, new THREE.LineBasicMaterial({ color: 0x93a9b3 })));
    }
}
// slice frame (space-time mode)
const sliceFrame = segs([[[M.lon0, M.lat0], [M.lon1, M.lat0], [M.lon1, M.lat1], [M.lon0, M.lat1], [M.lon0, M.lat0]]], 0, 0xff4d7a, .9); scene.add(sliceFrame);

// ---------- UI ----------
function clock(t) {
  const [d, hm] = M.start_utc.split(' '), b = new Date(d + 'T' + hm + ':00Z').getTime() + Math.round(t) * M.step_min * 6e4;
  const f = ms => new Date(ms).toISOString().slice(11, 16); return { utc: f(b), wib: f(b + 7 * 3.6e6) };
}
const pi = $('pi'), PLAY = '<path d="M4 2l10 6-10 6z" fill="currentColor"/>', PAUSE = '<rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/>';
const setPlay = p => { playing = p; pi.innerHTML = p ? PAUSE : PLAY; $('play').setAttribute('aria-label', p ? 'Pause' : 'Play') };
setPlay(playing);
$('play').onclick = () => { if (!playing && tc >= NT - 1) tc = 0; setPlay(!playing) };
const sl = $('t'); sl.max = NT - 1; sl.oninput = () => { setPlay(false); tc = +sl.value; dirty = true };
{ const tk = $('ticks'), n = Math.min(5, NT); for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.textContent = clock(Math.round(i / (n - 1) * (NT - 1))).utc; tk.appendChild(s) } }
{ const c = $('cbar'), x = c.getContext('2d'); for (let i = 0; i < c.width; i++) { const k = 300 - i / (c.width - 1) * 110, rgb = cm(k).map(Math.round); x.fillStyle = `rgb(${rgb})`; x.fillRect(i, 0, 1, c.height) } }
const segBtns = (sel_, fn) => document.querySelectorAll(sel_).forEach(b => b.addEventListener('click', () => { document.querySelectorAll(sel_).forEach(o => o.classList.toggle('on', o === b)); fn(b) }));
segBtns('[data-ex]', b => { ex = +b.dataset.ex; U.ex.value = ex; buildTubes('top'); legend(); dirty = true });
function legend() { $('legtxt').textContent = ex > 1 ? `vertical ×${ex}` : '' }
function setMode(m) {
  const sw = m !== mode; mode = m; U.uFlat.value = m === 'st' ? 1 : 0; smat.depthWrite = m !== 'st';
  groups.top.visible = m === 'top'; groups.st.visible = m === 'st'; axis.visible = sliceCoast.visible = sliceFrame.visible = m === 'st';
  for (const o of lbls) if (o.axis) o.show = m === 'st';
  const dy = (m === 'st' ? TZ * .45 : 2) - ctl.target.y; ctl.target.y += dy; cam.position.y += dy;
  if (sw) cam.position.sub(ctl.target).multiplyScalar((cam.aspect > 1 ? (m === 'st' ? 1.3 : 1 / 1.3) : (m === 'st' ? 1.05 : 1 / 1.05))).add(ctl.target);
  legend(); dirty = true;
}
setMode('top');

const fmtH = k => hKm(k).toFixed(1);
function sidePanel(fr) {
  const act = D.tracks.filter(tr => tr.pts.some(s => s.t === fr));
  $('ncell').textContent = act.length + ' active';
  const box = $('cells');
  if (!box.childElementCount) for (const tr of D.tracks) {
    const b = document.createElement('button'); b.className = 'cell'; tr.btn = b;
    const p = tr.pts, d = (p[p.length - 1].t - p[0].t) * M.step_min;
    b.innerHTML = `<span class="id">#${tr.id}</span><span class="nm">${clock(p[0].t).utc}-${clock(p[p.length - 1].t).utc} UTC<em>${d} min · max ${Math.round(tr.amax).toLocaleString('en')} km²</em></span><span class="h">${fmtH(tr.peak.tmin)} km</span>`;
    b.onclick = () => select(sel === tr ? null : tr); box.appendChild(b);
  }
  for (const tr of D.tracks) { tr.btn.classList.toggle('off', !act.includes(tr)); tr.btn.classList.toggle('on', tr === sel) }
  selPanel(fr);
}
function selPanel(fr) {
  $('selid').textContent = sel ? '#' + sel.id : '';
  if (!sel) { $('selbody').innerHTML = '<p class="empty">No cell selected</p>'; return }
  const p = sel.pts, now = p.find(s => s.t === fr), d = (p[p.length - 1].t - p[0].t) * M.step_min;
  $('selbody').innerHTML = `<dl class="stats">
    <div><dt>Cloud top now</dt><dd>${now ? fmtH(now.tmin) + ' <small>km</small>' : '<small>not active</small>'}</dd></div>
    <div><dt>Coldest now</dt><dd>${now ? Math.round(now.tmin) + ' <small>K</small>' : '-'}</dd></div>
    <div><dt>Peak top</dt><dd>${fmtH(sel.peak.tmin)} <small>km at ${clock(sel.peak.t).utc}</small></dd></div>
    <div><dt>Max area</dt><dd>${Math.round(sel.amax).toLocaleString('en')} <small>km²</small></dd></div>
    <div><dt>Lifetime</dt><dd>${d} <small>min</small></dd></div>
    <div><dt>Area now</dt><dd>${now ? Math.round(now.area).toLocaleString('en') + ' <small>km²</small>' : '-'}</dd></div></dl>
    <canvas id="prof" aria-label="Cloud-top height and area over time"></canvas>`;
  const c = $('prof'), r = devicePixelRatio || 1; c.width = c.clientWidth * r; c.height = c.clientHeight * r;
  const x = c.getContext('2d'), w = c.width, h = c.height, X = t => 4 * r + t / (NT - 1) * (w - 8 * r), pad = 12 * r;
  x.fillStyle = 'rgba(95,211,230,.22)'; x.beginPath(); x.moveTo(X(p[0].t), h - pad);
  for (const s of p) x.lineTo(X(s.t), h - pad - s.area / sel.amax * (h - pad - 18 * r) * .6); x.lineTo(X(p[p.length - 1].t), h - pad); x.fill();
  x.strokeStyle = '#ff4d7a'; x.lineWidth = 2 * r; x.beginPath(); p.forEach((s, i) => x[i ? 'lineTo' : 'moveTo'](X(s.t), h - pad - hKm(s.tmin) / ZMAX * (h - pad - 18 * r))); x.stroke();
  x.strokeStyle = '#e6eef0'; x.lineWidth = r; x.beginPath(); x.moveTo(X(tc), 0); x.lineTo(X(tc), h - pad); x.stroke();
  x.fillStyle = '#93a9b3'; x.font = `${10 * r}px JetBrains Mono, monospace`; x.textBaseline = 'bottom';
  x.fillText('top height', 4 * r, 11 * r); x.fillStyle = '#5fd3e6'; x.fillText('area', 4 * r + 80 * r, 11 * r);
  x.fillStyle = '#93a9b3'; x.fillText(clock(0).utc, 4 * r, h); x.textAlign = 'right'; x.fillText(clock(NT - 1).utc + ' UTC', w - 4 * r, h);
}
function select(tr) { sel = tr; lastFr = -1; dirty = true }

// picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY] });
cv.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; const r = cv.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects([...groups[mode].children, ...D.tracks.filter(t => t.mark.visible).map(t => t.mark)], false)[0];
  select(hit ? (hit.object.userData.tr || D.tracks.find(t => t.mark === hit.object)) : null);
});

// ---------- loop ----------
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.fov = Math.min(w < 600 ? 48 : 75, Math.max(38, 2 * Math.atan(Math.tan(19 * Math.PI / 180) * 1.5 / cam.aspect) * 180 / Math.PI)); (w > 960 ? cam.setViewOffset(w, h, 190, 0, w, h) : cam.clearViewOffset()); cam.updateProjectionMatrix(); dirty = true }
new ResizeObserver(resize).observe(stage);
let last = performance.now(); const v3 = new THREE.Vector3();
ctl.addEventListener('change', () => { dirty = true });
function update() {
  const i0 = Math.min(NT - 2, Math.floor(tc)); setFrames(Math.max(0, i0)); U.f.value = NT > 1 ? tc - Math.max(0, i0) : 0;
  U.sliceY.value = ty(tc); sliceCoast.position.y = sliceFrame.position.y = ty(tc) + .01;
  for (const m of ['top', 'st']) for (const ms of groups[m].children) {
    const { tr, n } = ms.userData, on = sel === tr, k = m === 'top' ? Math.max(0, Math.min(n - 1, Math.round((tc - tr.pts[0].t) * SUB))) : n - 1;
    ms.geometry.setDrawRange(0, k * RAD * 6); ms.visible = sel === tr && tc >= tr.pts[0].t;
    ms.material.opacity = sel ? (on ? 1 : .14) : m === 'st' ? .6 : .9; ms.material.emissiveIntensity = on ? .25 : 0; ms.material.depthWrite = !sel || on;
    ms.children[0].visible = on; if (m === 'top') ms.children[0].geometry.setDrawRange(0, k + 1);
  }
  for (const tr of D.tracks) {
    const s = sampleAt(tr, tc), on = sel === tr; tr.mark.visible = !!s && on; tr.lab.show = !!s && on;
    if (s) { const p = where(s, mode); tr.mark.position.copy(p); tr.mark.scale.setScalar(mode === 'st' ? .35 : radius(s, 'top') * 1.1); tr.mark.material.color.set(on ? 0xff4d7a : 0xe6eef0); tr.lab.pos.copy(p).y += mode === 'st' ? radius(s, 'st') * .4 + .6 : .7 }
    tr.lab.el.classList.toggle('on', on);
  }
  const fr = Math.round(tc), ck = clock(fr); $('utc').textContent = ck.utc + ' UTC'; $('wib').textContent = ck.wib; sl.value = tc;
  if (fr !== lastFr) { lastFr = fr; sidePanel(fr) } else if (sel && !playing) selPanel(fr);
}
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (playing) { tc += dt * 1.6; if (tc >= NT - 1) { tc = NT - 1; setPlay(false); setTimeout(() => { if (!playing && tc >= NT - 1) { tc = 0; setPlay(true) } }, 1500) } dirty = true }
  if (ctl.update()) dirty = true;
  if (dirty) {
    update(); renderer.render(scene, cam); const w = stage.clientWidth, h = stage.clientHeight;
    for (const o of lbls) { v3.copy(o.pos).project(cam); const vis = o.show && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
      o.el.style.display = vis ? '' : 'none'; if (vis) o.el.style.transform = `translate(${(v3.x + 1) / 2 * w}px,${(1 - v3.y) / 2 * h}px) ${o.off}` }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
document.querySelectorAll('.lb').forEach(e => { e.style.left = e.style.top = '0' });
requestAnimationFrame(frame);
window.__view3d = { src: D.src, tracks: D.tracks.length };
