'use strict';
/* world.js: data, layout, street graph and scenery for the living Tokyo map.
   The living/*.js files are classic scripts that share one global scope (top-level const/let are visible
   across files), loaded in this order: geo.js, world.js, draw.js, transit.js, ui.js. */

const PLACES = window.TOKYO_PLACES || [];
const BASE = window.TOKYO_I18N;
const TXT = window.TOKYO_LIVING_I18N;
const GEO = window.TK_GEO;
const LANGS = ['en', 'zh'];
const LANG_KEY = 'tokyo-lang';
const FAV_KEY = 'tokyo-fav';
const INTRO_KEY = 'tokyo-city-intro';
const INK = '#2d2a32';
const TAU = Math.PI * 2;
const FONT = "Fredoka, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth <= 820;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ================= language ================= */
function detectLang() {
  const u = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(u)) return u;
  try { const s = localStorage.getItem(LANG_KEY); if (LANGS.includes(s)) return s; } catch (e) { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let lang = detectLang();
const tx = (k) => { const v = TXT[lang][k]; return v === undefined ? TXT.en[k] : v; };
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] === undefined ? '' : o[k]));
const placeText = (p, f) => (lang === 'zh' && BASE.places.zh[p.id] && BASE.places.zh[p.id][f]) || p[f];
const nameOf = (p) => (lang === 'zh' ? p.zh : p.name);
const subOf = (p) => (lang === 'zh' ? p.name : p.zh);
const typeLabel = (p) => tx(p.type === 'food' ? 'food' : 'sight');

/* ================= colour helpers ================= */
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const colorMemo = new Map();
function shade(c, t) {
  const key = c + '|' + t;
  let v = colorMemo.get(key);
  if (!v) {
    const A = hex2rgb(c); const target = t < 0 ? 0 : 255; const a = Math.abs(t);
    v = `rgb(${A.map((x) => Math.round(x + (target - x) * a)).join(',')})`;
    colorMemo.set(key, v);
  }
  return v;
}
const mix = (a, b, t) => { const A = hex2rgb(a); const B = hex2rgb(b); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`; };

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ================= districts and landmarks ================= */
const DIST = {
  core: { c: '#e8503a', ids: ['tokyostation', 'imperial', 'ginza', 'tsukiji', 'tokyotower', 'ekiben', 'yakitori', 'sushi', 'gyudon', 'monja'] },
  west: { c: '#a46bd8', ids: ['shibuya', 'meiji', 'harajuku', 'shinjuku', 'roppongi', 'ramen', 'crepe', 'tamago', 'matcha', 'taiyaki', 'yakiniku'] },
  east: { c: '#f2a21a', ids: ['sensoji', 'skytree', 'ueno', 'akihabara', 'tempura', 'omurice'] },
  bay: { c: '#27a9df', ids: ['odaiba', 'disney'] },
  trip: { c: '#ff8fb3', ids: ['fuji', 'kamakura'] },
};
const ORDER = ['core', 'west', 'east', 'bay', 'trip'];
const distOf = {};
ORDER.forEach((k) => DIST[k].ids.forEach((id) => { distOf[id] = k; }));

// k = drawing style, w = footprint width, hh = height used for hit boxes / labels
const KIND = {
  tokyostation: { k: 'station', w: 112, hh: 74 }, imperial: { k: 'castle', w: 92, hh: 78 }, ginza: { k: 'clock', w: 76, hh: 96 },
  tsukiji: { k: 'market', w: 84, hh: 52 }, tokyotower: { k: 'tokyotower', w: 74, hh: 196 }, roppongi: { k: 'hills', w: 76, hh: 150 },
  shibuya: { k: 'crossing', w: 92, hh: 78 }, meiji: { k: 'shrine', w: 86, hh: 62 }, harajuku: { k: 'candy', w: 74, hh: 58 },
  shinjuku: { k: 'twin', w: 84, hh: 140 }, sensoji: { k: 'temple', w: 96, hh: 86 }, skytree: { k: 'skytree', w: 60, hh: 250 },
  ueno: { k: 'panda', w: 84, hh: 62 }, akihabara: { k: 'neon', w: 78, hh: 96 }, odaiba: { k: 'ferris', w: 108, hh: 120 },
  fuji: { k: 'fuji', w: 300, hh: 190 }, kamakura: { k: 'buddha', w: 76, hh: 84 }, disney: { k: 'dcastle', w: 104, hh: 126 },
};
const WALLS = ['#fff1d6', '#ffe9c9', '#fde2e4', '#e3f4ec', '#e6f1fb', '#fff6c9'];
const OVERRIDE = { tokyostation: [118, -58], fuji: [-1560, -640], kamakura: [-700, 1380], disney: [1500, 880], odaiba: [358, 930] };
const PINNED = new Set(['tokyostation', 'tokyotower', 'skytree', 'odaiba', 'disney', 'fuji', 'kamakura', 'imperial']);

/* ================= geometry helpers ================= */
const segDist = (px, py, s) => {
  const dx = s[2] - s[0]; const dy = s[3] - s[1]; const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - s[0]) * dx + (py - s[1]) * dy) / L2, 0, 1); return Math.hypot(px - (s[0] + dx * t), py - (s[1] + dy * t));
};
function polyDist(x, y, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, y, [pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]));
  return d;
}
const inSea = (x, y) => GEO.inPoly(x, y, GEO.sea);
const RW = GEO.RIVER_W / 2;
const inEll = (e, x, y, m) => ((x - e.x) / (e.rx + (m || 0))) ** 2 + ((y - e.y) / (e.ry + (m || 0))) ** 2 < 1;

/* ---------- smooth paths for rails ---------- */
function chaikin(pts, closed, it) {
  let p = pts.map((q) => [q[0], q[1]]);
  for (let n = 0; n < it; n++) {
    const out = []; const len = p.length;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < (closed ? len : len - 1); i++) {
      const a = p[i]; const b = p[(i + 1) % len];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[len - 1]);
    p = out;
  }
  return p;
}
function mkPath(pts, closed) {
  const P = closed ? [...pts, pts[0]] : pts; const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, cum, L: cum[cum.length - 1], closed };
}
// position, heading and left-normal offset at arc length s
function pathAt(path, s, off) {
  const { P, cum, L } = path;
  if (path.closed) s = ((s % L) + L) % L; else s = clamp(s, 0, L);
  let lo = 0; let hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = P[lo]; const b = P[hi]; const seg = cum[hi] - cum[lo] || 1; const t = (s - cum[lo]) / seg;
  const dx = (b[0] - a[0]) / seg; const dy = (b[1] - a[1]) / seg; const o = off || 0;
  return { x: a[0] + (b[0] - a[0]) * t - dy * o, y: a[1] + (b[1] - a[1]) * t + dx * o, a: Math.atan2(dy, dx), nx: -dy, ny: dx };
}
function pathNearest(path, x, y) {
  let best = 0; let bd = Infinity;
  for (let i = 0; i < path.P.length; i++) { const d = (path.P[i][0] - x) ** 2 + (path.P[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return path.cum[best];
}

/* ---------- the rail corridors ---------- */
// Yamanote loop (closed, clockwise = increasing s)
const YAMA_PATH = mkPath(chaikin(GEO.YAMA.map((s) => [s.x, s.y]), true, 2), true);
const YAMA_ST = GEO.YAMA.map((s, i) => ({ ...s, i, no: i === 0 ? 1 : 29 - i, s: pathNearest(YAMA_PATH, s.x, s.y) }));
// Shinkansen lines both END at Tokyo Station (their paths start at the buffer stops and run outward off the map)
const SHN = {
  tohoku: { c: '#2f9e6a', c2: '#ffffff', path: mkPath(chaikin([[225, -104], [225, -330], [232, -520], [176, -650], [150, -790], [124, -900], [160, -1020], [232, -1110], [310, -1210], [380, -1330]], false, 2), false) },
  tokaido: { c: '#2f7fe0', c2: '#ffffff', path: mkPath(chaikin([[225, -48], [190, 60], [118, 200], [40, 380], [-30, 560], [-110, 740], [-170, 900], [-250, 1040], [-390, 1160], [-570, 1290], [-800, 1440], [-1100, 1620], [-1250, 1800]], false, 2), false) },
};
const railPts = [];
[YAMA_PATH, SHN.tohoku.path, SHN.tokaido.path].forEach((pa) => { for (let s = 0; s < pa.L; s += 24) { const q = pathAt(pa, s); railPts.push([q.x, q.y]); } });
const railHash = new Map();
railPts.forEach((q) => { const k = Math.floor(q[0] / 48) + ',' + Math.floor(q[1] / 48); (railHash.get(k) || railHash.set(k, []).get(k)).push(q); });
function railDist(x, y) {
  let d = Infinity; const cx = Math.floor(x / 48); const cy = Math.floor(y / 48);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const a = railHash.get((cx + i) + ',' + (cy + j)); if (a) for (const q of a) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y)); }
  return d;
}

/* ================= places -> buildings ================= */
const buildings = []; const bById = new Map();
PLACES.forEach((p, idx) => {
  const kind = KIND[p.id] || { k: 'shop' };
  const [x, y] = OVERRIDE[p.id] || GEO.P(p.lat, p.lng);
  const b = { p, id: p.id, dist: distOf[p.id] || 'core', x, y, x0: x, y0: y, kind, idx, hit: null };
  if (kind.k === 'shop') { b.h = 24 + ((idx * 37) % 5) * 5; b.w = 50; b.hh = b.h + 22; } else { b.w = kind.w; b.hh = kind.hh; }
  b.wall = WALLS[idx % WALLS.length];
  buildings.push(b); bById.set(p.id, b);
});
const badSpot = (x, y) => inSea(x, y) || polyDist(x, y, GEO.river) < RW + 26 || railDist(x, y) < 40 || inEll(GEO.odaiba, x, y, -20);
for (let it = 0; it < 1500; it++) {
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i]; const b = buildings[j];
    const sxx = (a.w + b.w) / 2 + 26; const syy = Math.max(60, Math.min(90, (a.hh + b.hh) / 2.6));
    let dx = b.x - a.x; let dy = b.y - a.y; const m = Math.hypot(dx / sxx, dy / syy);
    if (m >= 1) continue;
    if (m < 1e-6) { dx = 1; dy = 0.3; }
    const L = Math.hypot(dx / sxx, dy / syy) || 1; const k = (1 - m) * 0.5;
    const mx = (dx / sxx / L) * sxx * k; const my = (dy / syy / L) * syy * k;
    const pa = PINNED.has(a.id); const pb = PINNED.has(b.id);
    if (!pa) { a.x -= pb ? mx * 2 : mx; a.y -= pb ? my * 2 : my; }
    if (!pb) { b.x += pa ? mx * 2 : mx; b.y += pa ? my * 2 : my; }
  }
  for (const a of buildings) {
    if (PINNED.has(a.id)) continue;
    a.x += (a.x0 - a.x) * 0.004; a.y += (a.y0 - a.y) * 0.004;
    if (it > 20 && badSpot(a.x, a.y)) { a.x = a.px ?? a.x0; a.y = a.py ?? a.y0; } else { a.px = a.x; a.py = a.y; }
  }
}
buildings.forEach((b) => { b.x = Math.round(b.x); b.y = Math.round(b.y); });
ORDER.forEach((k) => { DIST[k].count = buildings.filter((b) => b.dist === k).length; });
const doorOf = (b) => [b.x, b.y + 16];

/* ================= street graph ================= */
const NODES = []; const ADJ = []; const NIDX = new Map(); const SEGS = []; const BRIDGES = [];
function node(x, y) {
  x = Math.round(x); y = Math.round(y); const key = x + ',' + y; let i = NIDX.get(key);
  if (i === undefined) { i = NODES.length; NODES.push([x, y]); NIDX.set(key, i); ADJ.push([]); }
  return i;
}
function link(a, b) {
  if (a === b || ADJ[a].some((e) => e[0] === b)) return;
  const w = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]); ADJ[a].push([b, w]); ADJ[b].push([a, w]);
}
function addRoad(pts, w) {
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]; const [x, y] = pts[i]; const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 80));
    let last = node(px, py);
    for (let s = 1; s <= n; s++) { const id = node(px + ((x - px) * s) / n, py + ((y - py) * s) / n); link(last, id); last = id; }
    SEGS.push([px, py, x, y, w]);
  }
}
const LX = Array.from({ length: 14 }, (_, i) => -980 + 150 * i);
const LY = LX.slice();
const BRIDGE_ROWS = new Set([-530, -230, 70, 220]);
const nodeOK = (x, y) => !inSea(x, y) && polyDist(x, y, GEO.river) > RW + 14;
const roadW = (i) => (i % 3 === 1 ? 26 : 17);
function edgeOK(x0, y0, x1, y1) {
  let bridge = false;
  for (let t = 1; t < 8; t++) {
    const x = x0 + ((x1 - x0) * t) / 8; const y = y0 + ((y1 - y0) * t) / 8;
    if (inSea(x, y)) return 0;
    if (polyDist(x, y, GEO.river) < RW) { if (y0 === y1 && BRIDGE_ROWS.has(y0)) bridge = true; else return 0; }
  }
  return bridge ? 2 : 1;
}
LX.forEach((x, i) => LY.forEach((y, j) => {
  if (!nodeOK(x, y)) return;
  if (i + 1 < LX.length && nodeOK(LX[i + 1], y)) { const e = edgeOK(x, y, LX[i + 1], y); if (e) { addRoad([[x, y], [LX[i + 1], y]], roadW(j)); if (e === 2) BRIDGES.push({ x0: x, x1: LX[i + 1], y, w: roadW(j) }); } }
  if (j + 1 < LY.length && nodeOK(x, LY[j + 1])) { if (edgeOK(x, y, x, LY[j + 1])) addRoad([[x, y], [x, LY[j + 1]]], roadW(i)); }
}));
const GRID_NODES = NODES.length;
function nearestNode(x, y, max) {
  let bi = 0; let bd = Infinity; const n = max || NODES.length;
  for (let i = 0; i < n; i++) { const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
function joinGrid(x, y) { const [nx, ny] = NODES[nearestNode(x, y, GRID_NODES)]; addRoad([[nx, ny], [x, y]], 17); }
// day trips and the airport, connected to the grid with longer roads
addRoad([[-380, 970], [-380, 1195], [-150, 1195]], 20);
addRoad([[-530, 970], [-570, 1200], [-640, 1330], [-700, 1380]], 20);
addRoad([[-980, -230], [-1200, -300], [-1400, -500], [-1560, -640]], 20);
addRoad([[970, 670], [1173, 700], [1400, 790], [1500, 880]], 20);
// the Rainbow Bridge to Odaiba (the deck is drawn separately)
const RB = [[140, 596], [230, 760], [315, 880], [358, 930]];
joinGrid(RB[0][0], RB[0][1]); addRoad(RB, 20);

function access(x, y, id) { // short L-shaped lane from a free point onto the street
  const [nx, ny] = NODES[id]; const dx = nx - x; const dy = ny - y;
  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) return [[nx, ny]];
  return Math.abs(dy) <= Math.abs(dx) ? [[x, ny], [nx, ny]] : [[nx, y], [nx, ny]];
}
function dijkstra(s, t) {
  const n = NODES.length; const dist = new Float64Array(n).fill(Infinity); const prev = new Int32Array(n).fill(-1); const done = new Uint8Array(n);
  dist[s] = 0;
  for (;;) {
    let u = -1; let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    for (const [v, w] of ADJ[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const out = []; for (let c = t; c !== -1; c = prev[c]) { out.unshift(c); if (c === s) break; }
  return out[0] === s ? out : [s, t];
}
function findPath(ax, ay, bx, by) {
  const A = nearestNode(ax, ay); const B = nearestNode(bx, by);
  const pts = [[ax, ay], ...access(ax, ay, A)];
  dijkstra(A, B).slice(1).forEach((i) => pts.push(NODES[i]));
  pts.push(...access(bx, by, B).slice(0, -1).reverse(), [bx, by]);
  return pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
}
buildings.forEach((b) => { const [dx, dy] = doorOf(b); b.lane = [[dx, dy], ...access(dx, dy, nearestNode(dx, dy))]; });
// sanity check: every place must be reachable from Tokyo Station
const UNREACHABLE = (() => {
  const s = nearestNode(...doorOf(bById.get('tokyostation'))); const seen = new Uint8Array(NODES.length); const q = [s]; seen[s] = 1;
  while (q.length) { const u = q.pop(); for (const [v] of ADJ[u]) if (!seen[v]) { seen[v] = 1; q.push(v); } }
  return buildings.filter((b) => !seen[nearestNode(...doorOf(b))]).map((b) => b.id);
})();

/* ================= scenery ================= */
const nearBuilding = (x, y, m) => buildings.some((b) => Math.hypot((b.x - x) / (b.w / 2 + 22 + m), (b.y - y) / (46 + m)) < 1);
const nearRoad = (x, y, m) => SEGS.some((s) => segDist(x, y, s) < s[4] / 2 + m) || buildings.some((b) => b.lane.some((p, i) => i && segDist(x, y, [b.lane[i - 1][0], b.lane[i - 1][1], p[0], p[1]]) < 10 + m));
const inWaterAt = (x, y, m) => inSea(x, y) || polyDist(x, y, GEO.river) < RW + m || inEll(GEO.odaiba, x, y, m) || inEll(GEO.disney, x, y, m);
const inPark = (x, y, m) => inEll(GEO.palace, x, y, m) || GEO.parks.some((p) => inEll(p, x, y, m));

const ROOFS = ['#7d8a96', '#6e7b87', '#8a6f64', '#6f8190', '#9a6b5a', '#5f7a8a'];
const TOWER_WALLS = ['#cfe3f2', '#bcd4e8', '#e6edf3', '#d7dde6', '#c9d8c5', '#e8d9c3'];
const blocks = []; const lots = []; const trees = []; const houses = [];
const hubs = GEO.hubs;
const hubness = (x, y) => hubs.reduce((m, h) => Math.max(m, clamp(1 - Math.hypot(x - h.x, (y - h.y) * 1.2) / (h.r * 2.4), 0, 1)), 0);
for (let i = 0; i < LX.length - 1; i++) for (let j = 0; j < LY.length - 1; j++) {
  const hwx = (k) => roadW(k) / 2 + 3; const hwy = (k) => roadW(k) / 2 + 3;
  const blk = { x0: LX[i] + hwx(j * 0 + i), x1: LX[i + 1] - hwx(i + 1), y0: LY[j] + hwy(j), y1: LY[j + 1] - hwy(j + 1) };
  const pts = [[blk.x0, blk.y0], [blk.x1, blk.y0], [blk.x0, blk.y1], [blk.x1, blk.y1], [(blk.x0 + blk.x1) / 2, (blk.y0 + blk.y1) / 2]];
  if (pts.some(([x, y]) => inSea(x, y) || polyDist(x, y, GEO.river) < RW + 8)) continue;
  const cx = (blk.x0 + blk.x1) / 2; const cy = (blk.y0 + blk.y1) / 2;
  blk.kind = inPark(cx, cy, -30) ? 1 : 0; blocks.push(blk);
  if (blk.kind === 1) continue;
  const cols = Math.max(1, Math.floor((blk.x1 - blk.x0) / 44)); const rows = Math.max(1, Math.floor((blk.y1 - blk.y0) / 40));
  for (let cxi = 0; cxi < cols; cxi++) for (let cyi = 0; cyi < rows; cyi++) {
    if (rnd() < 0.1) continue;
    const x = blk.x0 + ((cxi + 0.5) * (blk.x1 - blk.x0)) / cols + (rnd() - 0.5) * 5; const y = blk.y0 + ((cyi + 0.8) * (blk.y1 - blk.y0)) / rows + (rnd() - 0.5) * 3;
    if (nearBuilding(x, y, 4) || nearBuilding(x, y - 36, 4) || railDist(x, y) < 40 || inPark(x, y, 8) || inEll(GEO.palace, x, y - 40, 4)) continue;
    const t = hubness(x, y); const big = t > 0.25;
    const h = big ? 36 + t * (90 + rnd() * 90) + rnd() * 20 : 20 + rnd() * 26 + t * 40;
    lots.push({ x, y, w: 26 + rnd() * 10, h: Math.round(h), tall: big, wall: big ? TOWER_WALLS[Math.floor(rnd() * TOWER_WALLS.length)] : WALLS[Math.floor(rnd() * WALLS.length)], roof: ROOFS[Math.floor(rnd() * ROOFS.length)], id: lots.length });
  }
}
// trees: parks, ring of the palace moat, scattered street trees and the countryside
GEO.parks.concat([{ ...GEO.palace, x: GEO.palace.x, y: GEO.palace.y + 12, rx: GEO.palace.rx - 24, ry: GEO.palace.ry - 24 }]).forEach((pk, n) => {
  const cnt = Math.round((pk.rx * pk.ry) / 520);
  for (let k = 0; k < cnt; k++) { const a = rnd() * TAU; const r = Math.sqrt(rnd()) * 0.86; trees.push({ x: pk.x + Math.cos(a) * pk.rx * r, y: pk.y + Math.sin(a) * pk.ry * r, s: 0.9 + rnd() * 0.6, c: n === 0 ? 0.1 + rnd() * 0.5 : rnd() }); }
});
for (let t = 0, tries = 0; t < 70 && tries < 800; tries++) {
  const x = -1000 + rnd() * 2050; const y = -1000 + rnd() * 2050;
  if (inWaterAt(x, y, 20) || nearBuilding(x, y, 16) || nearRoad(x, y, 14) || railDist(x, y) < 34 || lots.some((l) => Math.abs(l.x - x) < l.w && Math.abs(l.y - y + l.h / 2) < l.h / 2 + 10)) continue;
  trees.push({ x, y, s: 0.7 + rnd() * 0.5, c: rnd() }); t++;
}
const OUTSIDE = (x, y) => x < -1010 || x > 1060 || y < -1010 || y > 1060;
for (let t = 0, tries = 0; t < 240 && tries < 4000; tries++) {
  const x = GEO.WORLD.x0 + 30 + rnd() * (GEO.WORLD.x1 - GEO.WORLD.x0 - 60); const y = GEO.WORLD.y0 + 130 + rnd() * (GEO.WORLD.y1 - GEO.WORLD.y0 - 190);
  if (!OUTSIDE(x, y) || inWaterAt(x, y, 24) || nearBuilding(x, y, 18) || nearRoad(x, y, 22) || railDist(x, y) < 34) continue;
  trees.push({ x, y, s: 0.75 + rnd() * 0.55, c: rnd() }); t++;
}
// countryside houses (suburbs) away from the dense core
for (let t = 0, tries = 0; t < 120 && tries < 3000; tries++) {
  const x = GEO.WORLD.x0 + 60 + rnd() * (GEO.WORLD.x1 - GEO.WORLD.x0 - 120); const y = GEO.WORLD.y0 + 160 + rnd() * (GEO.WORLD.y1 - GEO.WORLD.y0 - 260);
  if (!OUTSIDE(x, y) || inWaterAt(x, y, 30) || nearBuilding(x, y, 40) || nearRoad(x, y, 24) || railDist(x, y) < 40 || trees.some((q) => Math.hypot(q.x - x, (q.y - y) * 1.4) < 26)) continue;
  houses.push({ x, y, w: 24 + rnd() * 10, h: 13 + rnd() * 8, wall: WALLS[Math.floor(rnd() * WALLS.length)], roof: ROOFS[Math.floor(rnd() * ROOFS.length)] }); t++;
}
trees.forEach((t) => { t.keep = !nearBuilding(t.x, t.y, -10); });
for (let i = trees.length - 1; i >= 0; i--) if (!trees[i].keep) trees.splice(i, 1);

const hills = []; // the Chichibu mountains along the north rim, with snowy peaks
for (let x = GEO.WORLD.x0; x < GEO.WORLD.x1; x += 120 + rnd() * 50) hills.push({ x, y: GEO.WORLD.y0 + 150 + rnd() * 22, w: 200 + rnd() * 90, hgt: 100 + rnd() * 80, lean: (rnd() - 0.5) * 0.3, c: rnd() < 0.5 ? '#a3b4c4' : '#97aebf', snow: true });
for (let y = -700; y < 1200; y += 220 + rnd() * 80) if (y < -150 || y > 700) hills.push({ x: GEO.WORLD.x0 + 40 + rnd() * 60, y, w: 150 + rnd() * 50, hgt: 60 + rnd() * 50, lean: (rnd() - 0.5) * 0.3, c: rnd() < 0.5 ? '#8fb56a' : '#a3c27a', snow: false });

const clouds = Array.from({ length: 10 }, () => ({ x: rnd() * 4000 - 2000, y: rnd() * 3000 - 1300, s: 0.6 + rnd() * 0.8, v: 6 + rnd() * 8 }));
const tufts = Array.from({ length: 420 }, () => ({ x: GEO.WORLD.x0 + rnd() * (GEO.WORLD.x1 - GEO.WORLD.x0), y: GEO.WORLD.y0 + rnd() * (GEO.WORLD.y1 - GEO.WORLD.y0), s: 0.7 + rnd() * 0.7 }))
  .filter((t) => !inWaterAt(t.x, t.y, 10) && !nearRoad(t.x, t.y, 6) && OUTSIDE(t.x, t.y));
const waves = Array.from({ length: 150 }, () => ({ x: GEO.WORLD.x0 + rnd() * (GEO.WORLD.x1 - GEO.WORLD.x0 + 80), y: -200 + rnd() * 2000, s: 0.7 + rnd() * 0.7 }))
  .filter((w) => inSea(w.x, w.y) && !inEll(GEO.odaiba, w.x, w.y, 30) && !inEll(GEO.disney, w.x, w.y, 30));

/* ================= people ================= */
const SHIRT = ['#ff8a5c', '#5b9bd5', '#ffd166', '#5cc8b0', '#ffffff', '#b48ad8', '#ff7aa2', '#7ccf6e'];
const HAIR = ['#1f1a1a', '#2b2b3a', '#3b2a20', '#5a3d2b', '#c98f4e'];
const people = [];
const pickPlace = () => { let k; do { k = Math.floor(Math.random() * buildings.length); } while (buildings[k].p.far && Math.random() < 0.7); return k; };
function goPlace(p, bi) {
  const b = buildings[bi]; p.to = bi; p.target = 'place';
  p.path = findPath(p.x, p.y, b.x + (Math.random() - 0.5) * 18, b.y + 16 + Math.random() * 6);
}
const personName = (p) => (p.owner ? tx('masterName') : tx('names')[p.nameIdx % 20] + (p.nameIdx >= 20 ? '²' : ''));
const targetName = (p) => (p.to !== undefined ? nameOf(buildings[p.to].p) : '');
const homeNodes = buildings.filter((b) => !b.p.far);
for (let i = 0; i < 38; i++) {
  const b = homeNodes[Math.floor(rnd() * homeNodes.length)];
  const p = {
    id: i, nameIdx: i, x: b.x + (rnd() - 0.5) * 20, y: b.y + 18,
    shirt: SHIRT[i % 8], hair: HAIR[i % 5], style: i % 4, v: 30 + rnd() * 18, k: 1,
    wait: rnd() * 6, ph: rnd() * 6, face: 1, say: '', sayT: 0, cool: rnd() * 6, path: [], moving: false, eatEmoji: '', eatT: 0, replyAt: 0, replyTxt: '',
  };
  goPlace(p, pickPlace());
  people.push(p);
}
const master = {
  id: 99, owner: true, nameIdx: 0, x: GEO.P(35.6812, 139.7671)[0] + 40, y: GEO.P(35.6812, 139.7671)[1] + 44, shirt: '#1d3a6e', hair: '#2b2b3a', style: 4, v: 34, k: 1.3,
  wait: 3, ph: 0, face: 1, say: '', sayT: 0, cool: 10, path: [], moving: false, eatEmoji: '', eatT: 0, decT: 12, replyAt: 0, replyTxt: '',
};
people.push(master);
// traffic: a few cars wander the streets
const cars = Array.from({ length: 34 }, (_, i) => {
  const a = Math.floor(rnd() * GRID_NODES); const nb = ADJ[a][0] ? ADJ[a][Math.floor(rnd() * ADJ[a].length)][0] : a;
  return { from: a, to: nb, t: rnd(), v: 52 + rnd() * 24, c: ['#ffd23c', '#ffffff', '#e8503a', '#2d2a32', '#5b9bd5', '#ffd23c'][i % 6], taxi: i % 6 === 0 || i % 6 === 5 };
});
