'use strict';
/* transit.js: the Yamanote viaduct and trains, Shinkansen termini, the subway X-ray, planes, boats and the Rainbow Bridge. */

const wrap = (v, L) => ((v % L) + L) % L;
const outsideWorld = (x, y) => x < WD.x0 + 4 || x > WD.x1 - 4 || y < WD.y0 + 4 || y > WD.y1 - 4;
let onTrainEvent = null;
const setTrainEvents = (fn) => { onTrainEvent = fn; };
const emptyBB = () => [1e9, 1e9, -1e9, -1e9];

/* ---------- elevated deck pieces (shared by both rail systems) ---------- */
const DECK_YAMA = { z: 24, hw: 15, top: '#d6d3dd', side: '#a9a5b5', pillar: '#bdb9c6', tracks: [-7, 7] };
const DECK_SHIN = { z: 38, hw: 17, top: '#e4e1ea', side: '#b8b4c4', pillar: '#c9c5d3', tracks: [-8, 8] };
function buildDeck(path, D, step, maxS, pillarEvery) {
  const out = []; let n = 0;
  for (let s = 0; s < maxS - 1; s += step, n++) {
    const s2 = s + step + 0.6; const m = pathAt(path, s + step / 2, 0);
    if (outsideWorld(m.x, m.y)) continue;
    const pt = (ss, o) => { const q = pathAt(path, ss, o); return [q.x, q.y]; };
    out.push({
      mx: m.x, my: m.y, aL: pt(s, D.hw), aR: pt(s, -D.hw), bL: pt(s2, D.hw), bR: pt(s2, -D.hw),
      tr: D.tracks.map((o) => [pt(s, o), pt(s2, o)]), pillar: n % pillarEvery === 0,
    });
  }
  return out;
}
function drawDeck(pc, D) {
  const k = cam.z; const z = D.z; const X = sx(pc.mx); const Y = sy(pc.my, z);
  if (!onScreen(X, Y, 90 * k + 30)) return;
  const th = 7;
  g.lineJoin = 'round'; g.lineWidth = Math.max(1.1, 1.8 * k); g.strokeStyle = INK;
  if (pc.pillar) {
    const x0 = X - 5 * k; const y1 = sy(pc.my, z - th); const y0 = sy(pc.my, 0);
    g.fillStyle = D.pillar; g.fillRect(x0, y1, 10 * k, y0 - y1); g.fillStyle = shade(D.pillar, -0.2); g.fillRect(X, y1, 5 * k, y0 - y1);
    g.strokeRect(x0, y1, 10 * k, y0 - y1);
  }
  g.fillStyle = D.side;
  for (const [p, q] of [[pc.aL, pc.bL], [pc.aR, pc.bR]]) {
    g.beginPath(); g.moveTo(sx(p[0]), sy(p[1], z)); g.lineTo(sx(q[0]), sy(q[1], z)); g.lineTo(sx(q[0]), sy(q[1], z - th)); g.lineTo(sx(p[0]), sy(p[1], z - th)); g.closePath(); g.fill();
  }
  g.beginPath(); g.moveTo(sx(pc.aL[0]), sy(pc.aL[1], z)); g.lineTo(sx(pc.bL[0]), sy(pc.bL[1], z)); g.lineTo(sx(pc.bR[0]), sy(pc.bR[1], z)); g.lineTo(sx(pc.aR[0]), sy(pc.aR[1], z)); g.closePath();
  g.fillStyle = D.top; g.fill();
  g.beginPath();
  for (const [p, q] of [[pc.aL, pc.bL], [pc.aR, pc.bR]]) { g.moveTo(sx(p[0]), sy(p[1], z)); g.lineTo(sx(q[0]), sy(q[1], z)); g.moveTo(sx(p[0]), sy(p[1], z - th)); g.lineTo(sx(q[0]), sy(q[1], z - th)); }
  g.stroke();
  g.strokeStyle = '#8f8b9c'; g.lineWidth = Math.max(1, 1.5 * k); g.beginPath();
  for (const [p, q] of pc.tr) { g.moveTo(sx(p[0]), sy(p[1], z + 0.6)); g.lineTo(sx(q[0]), sy(q[1], z + 0.6)); }
  g.stroke();
  g.strokeStyle = 'rgba(120,115,135,.55)'; g.beginPath();
  g.moveTo(sx(pc.tr[0][0][0]), sy(pc.tr[0][0][1], z + 0.4)); g.lineTo(sx(pc.tr[1][0][0]), sy(pc.tr[1][0][1], z + 0.4)); g.stroke();
}

// how near a point is to the Yamanote loop (used to order the bullet-train deck over it)
const yamaHash = new Map();
for (let s = 0; s < YAMA_PATH.L; s += 20) { const q = pathAt(YAMA_PATH, s); const key = Math.floor(q.x / 60) + ',' + Math.floor(q.y / 60); (yamaHash.get(key) || yamaHash.set(key, []).get(key)).push([q.x, q.y]); }
function yamaDist(x, y) {
  let d = Infinity; const cx = Math.floor(x / 60); const cy = Math.floor(y / 60);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = yamaHash.get((cx + i) + ',' + (cy + j)); if (a) for (const q of a) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y)); }
  return d;
}
const shinBias = (x, y) => (yamaDist(x, y) < 70 ? 70 : 0);

/* ---------- platforms ---------- */
function platformSide(p, len, wid, z0, z1, cz, canopyCol, sign) {
  obox(p.x, p.y, p.a, len, wid, z0, z1, '#e2dfe9', '#b3afc0');
  const c = Math.cos(p.a); const s = Math.sin(p.a);
  for (const u of [-0.42, 0, 0.42]) obox(p.x + c * len * u, p.y + s * len * u, p.a, 3, 3, z1, cz, '#9d99a8', '#85818f');
  obox(p.x, p.y, p.a, len * 0.92, wid, cz, cz + 2.2, canopyCol, shade(canopyCol, -0.2));
  if (sign) {
    const X = sx(p.x); const Y = sy(p.y, cz + 20); if (cam.z < 0.42) return;
    const fz = clamp(cam.z, 0.6, 1.2);
    g.font = `600 ${Math.round(11 * fz)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(sign.txt).width + 34 * cam.z;
    rr(X - w / 2, Y - 10 * cam.z, w, 20 * cam.z, 9 * cam.z); g.fillStyle = '#fffdf6'; g.fill(); g.lineWidth = Math.max(1, 2 * cam.z); g.stroke();
    g.fillStyle = sign.col; g.beginPath(); g.arc(X - w / 2 + 11 * cam.z, Y, 7.5 * cam.z, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(8.5 * fz)}px ${FONT}`; g.fillText(sign.no, X - w / 2 + 11 * cam.z, Y + 0.5);
    g.fillStyle = INK; g.font = `600 ${Math.round(11 * fz)}px ${FONT}`; g.fillText(sign.txt, X + 9 * cam.z, Y + 0.5);
  }
}

/* ---------- Yamanote ---------- */
const YA = { cars: 5, carL: 20, vmax: 95, acc: 40, off: 7 };
const YL = YA.cars * YA.carL;
for (const pc of buildDeck(YAMA_PATH, DECK_YAMA, 24, YAMA_PATH.L, 3)) statics.push({ y: pc.my, f: () => drawDeck(pc, DECK_YAMA) });
YAMA_ST.forEach((st) => {
  const m = pathAt(YAMA_PATH, st.s, 0); const sign = { txt: st.en, col: '#6cbf3c', no: String(st.no).padStart(2, '0') };
  const sides = [pathAt(YAMA_PATH, st.s, DECK_YAMA.hw + 6), pathAt(YAMA_PATH, st.s, -(DECK_YAMA.hw + 6))].sort((a, b) => a.y - b.y);
  statics.push({ y: sides[0].y, f: () => { if (onScreen(sx(m.x), sy(m.y, 30), 160 * cam.z + 40)) platformSide(sides[0], 104, 12, 17, 25.4, 58, '#e7efe6', null); } });
  statics.push({ y: sides[1].y + 4, f: () => {
    if (!onScreen(sx(m.x), sy(m.y, 30), 160 * cam.z + 40)) return;
    sign.txt = lang === 'zh' ? st.zh : st.en;
    platformSide(sides[1], 104, 12, 17, 25.4, 58, '#e7efe6', sign);
  } });
});
const yamaTrains = [];
const stopTarget = (t, st) => st.s + t.dir * YL / 2;
const distToStop = (t, st) => (t.dir > 0 ? wrap(stopTarget(t, st) - t.s, YAMA_PATH.L) : wrap(t.s - stopTarget(t, st), YAMA_PATH.L));
for (const dir of [1, -1]) for (let k = 0; k < 4; k++) {
  const t = { kind: 'yama', id: 'y' + dir + k, dir, s: ((k + (dir > 0 ? 0.1 : 0.6)) * YAMA_PATH.L) / 4, v: 40, dwell: 0, idx: 0, bb: emptyBB() };
  let best = Infinity; YAMA_ST.forEach((st, i) => { const d = distToStop(t, st); if (d < best) { best = d; t.idx = i; } });
  yamaTrains.push(t);
}
function updYama(t, dt) {
  const L = YAMA_PATH.L; const n = YAMA_ST.length;
  if (t.dwell > 0) { t.dwell -= dt; t.v = 0; if (t.dwell <= 0) t.idx = (t.idx + t.dir + n) % n; return; }
  const st = YAMA_ST[t.idx]; const d = distToStop(t, st);
  if (d > L - 60) { t.s = wrap(stopTarget(t, st), L); t.v = 0; t.dwell = 3 + Math.random() * 1.5; return; }
  let vT = Math.min(YA.vmax, Math.sqrt(2 * YA.acc * d) + 4);
  for (const o of yamaTrains) {
    if (o === t || o.dir !== t.dir) continue;
    const dh = t.dir > 0 ? wrap(o.s - t.s, L) : wrap(t.s - o.s, L); const gap = dh - YL;
    if (gap < 34) vT = Math.min(vT, Math.max(0, gap - 8) * 1.6);
  }
  t.v += clamp(vT - t.v, -YA.acc * 2 * dt, YA.acc * dt);
  const step = t.v * dt;
  if (step >= d) { t.s = wrap(stopTarget(t, st), L); t.v = 0; t.dwell = 3 + Math.random() * 1.5; return; }
  t.s = wrap(t.s + t.dir * step, L);
}
function drawYamaCar(t, p) {
  const lit = env.n > 0.2;
  obox(p.x, p.y, p.a, YA.carL - 1.5, 11, 25, 37, '#eceee8', '#f4f5ef', { win: lit ? '#ffe39a' : '#6f93b4', band: '#6cbf3c', bb: t.bb });
  if (lit) litList.push([sx(p.x), sy(p.y, 31), 15 * cam.z, '255,225,150']);
}

/* ---------- Shinkansen ---------- */
const SHD = { cars: 8, carL: 26, cap: 12, vmax: 190, acc: 60, dwell: 9, off: 8 };
const SHL = SHD.cars * SHD.carL + SHD.cap * 2;
const SHIN_DEST = { tohoku: ['Sendai', '仙台'], tokaido: ['Shin-Osaka', '新大阪'] };
const shinEdge = {};
// the Tohoku line also calls at Omiya (Saitama): the platform centre sits at OM_S along the path
const OM_Y = -1520; let OM_S = 0;
{ const pa = SHN.tohoku.path; let bd = 1e9; for (let s = 0; s < pa.L; s += 2) { const q = pathAt(pa, s, 0); const d = Math.abs(q.y - OM_Y) + Math.abs(q.x) * 0.2; if (d < bd) { bd = d; OM_S = s; } } }
const OM_D = OM_S - SHL / 2;
for (const key of ['tohoku', 'tokaido']) {
  const pa = SHN[key].path; let e = pa.L;
  for (let s = 0; s < pa.L; s += 12) { const q = pathAt(pa, s); if (outsideWorld(q.x, q.y)) { e = s; break; } }
  shinEdge[key] = e;
  for (const pc of buildDeck(pa, DECK_SHIN, 24, e + 30, 2)) statics.push({ y: pc.my + shinBias(pc.mx, pc.my), f: () => drawDeck(pc, DECK_SHIN) });
  // platform on both sides of the terminus, plus the bumper
  const sides = [pathAt(pa, SHL / 2, DECK_SHIN.hw + 7), pathAt(pa, SHL / 2, -(DECK_SHIN.hw + 7))].sort((a, b) => a.y - b.y);
  const mid = pathAt(pa, SHL / 2, 0);
  statics.push({ y: sides[0].y - 40, f: () => { if (onScreen(sx(mid.x), sy(mid.y, 40), 260 * cam.z + 60)) platformSide(sides[0], SHL, 14, 30, 39.6, 74, '#e6eaf2', null); } });
  statics.push({ y: sides[1].y + 80, f: () => {
    if (!onScreen(sx(mid.x), sy(mid.y, 40), 260 * cam.z + 60)) return;
    platformSide(sides[1], SHL, 14, 30, 39.6, 74, '#e6eaf2', { txt: tx('shinLabel').replace(/^\S+\s/, ''), col: SHN[key].c, no: key === 'tohoku' ? 'E' : 'T' });
  } });
  if (key === 'tohoku') {
    const osides = [pathAt(pa, OM_S, DECK_SHIN.hw + 7), pathAt(pa, OM_S, -(DECK_SHIN.hw + 7))].sort((a, b) => a.y - b.y);
    const omid = pathAt(pa, OM_S, 0);
    statics.push({ y: osides[0].y - 40, f: () => { if (onScreen(sx(omid.x), sy(omid.y, 40), 260 * cam.z + 60)) platformSide(osides[0], SHL, 14, 30, 39.6, 74, '#e6eaf2', null); } });
    statics.push({ y: osides[1].y + 80, f: () => {
      if (!onScreen(sx(omid.x), sy(omid.y, 40), 260 * cam.z + 60)) return;
      platformSide(osides[1], SHL, 14, 30, 39.6, 74, '#e6eaf2', { txt: tx('omiyaPlat'), col: SHN[key].c, no: 'E' });
    } });
  }
  const b0 = pathAt(pa, 1, 0);
  statics.push({ y: b0.y + 10, f: () => { if (onScreen(sx(b0.x), sy(b0.y, 40), 80)) obox(b0.x, b0.y, b0.a, 8, 38, 38, 46, '#e8503a', '#c8402c'); } });
}
const shinTrains = [];
for (const line of ['tohoku', 'tokaido']) for (let k = 0; k < 2; k++) shinTrains.push({ kind: line, line, id: line + k, phase: 'wait', timer: k * 11 + (line === 'tohoku' ? 1 : 5), d: 0, v: 0, bb: emptyBB() });
const shinTrack = (t, dd) => {
  if (t.phase !== 'depart') return SHD.off;
  const u = clamp(dd / 260, 0, 1); return SHD.off - 2 * SHD.off * (u * u * (3 - 2 * u));
};
function updShin(t, dt) {
  const edge = shinEdge[t.line]; const tk = t.line === 'tohoku';
  if (t.hold > 0) { t.hold -= dt; t.v = 0; return; }
  if (t.phase === 'wait') {
    t.timer -= dt;
    const busy = shinTrains.some((o) => o !== t && o.line === t.line && (tk ? o.phase !== 'wait' : (o.phase === 'arrive' || o.phase === 'dwell')));
    if (t.timer <= 0 && !busy) { t.phase = 'arrive'; t.d = edge + 20; t.v = SHD.vmax; t.omA = false; t.omD = false; }
  } else if (t.phase === 'arrive') {
    const target = tk && !t.omA ? OM_D : 0;
    const vT = Math.min(SHD.vmax, Math.sqrt(2 * SHD.acc * Math.max(0, t.d - target)) + 6);
    t.v = Math.min(vT, t.v + SHD.acc * 1.5 * dt);
    t.d = Math.max(target, t.d - t.v * dt);
    if (t.d - target <= 0.3) {
      t.d = target; t.v = 0;
      if (target > 0) { t.omA = true; t.hold = 4 + Math.random() * 2; if (onTrainEvent) onTrainEvent(t, 'omiya'); }
      else { t.phase = 'dwell'; t.timer = SHD.dwell + Math.random() * 3; if (onTrainEvent) onTrainEvent(t, 'arrive'); }
    }
  } else if (t.phase === 'dwell') {
    t.timer -= dt;
    if (t.timer <= 0) { t.phase = 'depart'; t.v = 0; if (onTrainEvent) onTrainEvent(t, 'depart'); }
  } else {
    const stopAt = tk && !t.omD ? OM_D : Infinity;
    const vT = Math.min(SHD.vmax, Math.sqrt(2 * SHD.acc * Math.max(0, stopAt - t.d)) + 6);
    t.v = Math.min(vT, t.v + SHD.acc * dt);
    t.d = Math.min(stopAt, t.d + t.v * dt);
    if (stopAt - t.d <= 0.3) { t.d = stopAt; t.v = 0; t.omD = true; t.hold = 4 + Math.random() * 2; if (onTrainEvent) onTrainEvent(t, 'omiya'); return; }
    if (t.d > edge + SHL + 20) { t.phase = 'wait'; t.timer = 6 + Math.random() * 8; }
  }
}
// s = arc length of the part's centre on the path (measured from the terminus)
function drawShinPart(t, s, len, wid, isCap) {
  const p = pathAt(SHN[t.line].path, s, shinTrack(t, s));
  if (outsideWorld(p.x, p.y)) return;
  const tk = t.line === 'tohoku'; const lit = env.n > 0.2;
  if (isCap) obox(p.x, p.y, p.a, len, wid, 40, 48, tk ? '#3fae7a' : '#eef2f8', tk ? '#2f9e6a' : '#f5f7fa', { bb: t.bb });
  else {
    obox(p.x, p.y, p.a, len - 1.5, wid, 39, 51, tk ? '#3fae7a' : '#e6ecf4', tk ? '#2f9e6a' : '#f5f7fa', { win: lit ? '#ffe39a' : '#5f86b0', band: tk ? '#ffffff' : '#2f7fe0', bb: t.bb });
    if (lit) litList.push([sx(p.x), sy(p.y, 45), 17 * cam.z, '255,225,150']);
  }
}

/* ---------- subway ---------- */
const SUBLINES = GEO.SUBWAY.map((l) => ({ ...l, stops: l.stops.map((s) => ({ ...s })) }));
const SUBST = (() => {
  const m = new Map();
  for (const l of SUBLINES) for (const s of l.stops) {
    const e = m.get(s.en);
    if (!e) m.set(s.en, { en: s.en, zh: s.zh, x: s.x, y: s.y, lines: [l] });
    else { s.x = e.x; s.y = e.y; if (!e.lines.includes(l)) e.lines.push(l); }
  }
  return [...m.values()];
})();
SUBLINES.forEach((l) => { l.path = mkPath(l.stops.map((s) => [s.x, s.y]), false); });
const SHIRT_C = ['#2f3347', '#3b3f58', '#23262f', '#4a4f66', '#2c3a4f', '#3b3f58', '#2f3347', '#e8647a', '#ffffff'];
const HAIR_C = ['#1f1a1a', '#2b2b3a', '#3b2a20', '#5a3d2b', '#c98f4e'];
const metroTrains = [];
SUBLINES.forEach((l) => {
  for (let k = 0; k < 2; k++) {
    const idx = k ? l.stops.length - 2 : 1;
    metroTrains.push({ kind: 'metro', line: l, id: 'm' + l.id + k, dir: k ? -1 : 1, idx, s: l.path.cum[k ? idx + 1 : idx - 1], v: 0, dwell: 1 + k, bb: emptyBB(), riders: Array.from({ length: 9 }, () => ({ c: pick(SHIRT_C), h: pick(HAIR_C) })) });
  }
});
function updMetro(t, dt) {
  const l = t.line; const n = l.stops.length;
  if (t.dwell > 0) { t.dwell -= dt; t.v = 0; if (t.dwell <= 0) { if (t.idx + t.dir < 0 || t.idx + t.dir >= n) t.dir = -t.dir; t.idx += t.dir; } return; }
  const tgt = l.path.cum[t.idx]; const d = Math.abs(tgt - t.s); const sg = Math.sign(tgt - t.s) || t.dir;
  const vT = Math.min(80, Math.sqrt(2 * 50 * d) + 4);
  t.v += clamp(vT - t.v, -100 * dt, 50 * dt);
  if (t.v * dt >= d) { t.s = tgt; t.v = 0; t.dwell = 1.4 + Math.random(); return; }
  t.s += sg * t.v * dt;
}
let subOn = false; let subAmt = 0;
function setSubway(on) { subOn = !!on; $('subLegend').classList.toggle('on', subOn); }
function renderSubLegend() {
  const box2 = $('subLegend'); box2.textContent = '';
  const title = document.createElement('b'); title.textContent = tx('subwayTitle'); box2.appendChild(title);
  for (const l of SUBLINES) {
    const row = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = l.color;
    row.appendChild(dot); row.appendChild(document.createTextNode(l.id + ' ' + (lang === 'zh' ? l.zh : l.en))); box2.appendChild(row);
  }
}
function drawSubway() {
  if (subAmt < 0.01) return;
  const z = cam.z; const a = subAmt;
  g.save();
  g.fillStyle = `rgba(30,28,50,${0.58 * a})`; g.fillRect(0, 0, W, H);
  g.globalAlpha = a; g.lineCap = 'round'; g.lineJoin = 'round';
  const lw2 = Math.max(3, 7 * z);
  for (const l of SUBLINES) {
    g.beginPath(); l.path.P.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1]))));
    g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = lw2 + 3; g.stroke(); g.strokeStyle = l.color; g.lineWidth = lw2; g.stroke();
  }
  for (const s of SUBST) {
    const X = sx(s.x); const Y = sy(s.y); if (!onScreen(X, Y, 60)) continue;
    const r = Math.max(3.5, (s.lines.length > 1 ? 8 : 5.5) * z);
    g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fillStyle = '#fffdf6'; g.fill(); g.lineWidth = Math.max(1.5, 2.4 * z); g.strokeStyle = INK; g.stroke();
    if (s.lines.length > 1) { g.beginPath(); g.arc(X, Y, r * 0.5, 0, TAU); g.fillStyle = INK; g.fill(); }
    if (z > 0.5 || (z > 0.34 && s.lines.length > 1)) {
      const txt = lang === 'zh' ? s.zh : s.en; const fs = Math.round(clamp(11 * z + 4, 9, 14));
      g.font = `600 ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(30,28,50,.9)'; g.strokeText(txt, X, Y - r - fs * 0.8); g.fillStyle = '#fffdf6'; g.fillText(txt, X, Y - r - fs * 0.8);
    }
  }
  const carL = 15;
  for (const t of metroTrains) {
    t.bb = emptyBB();
    for (let j = 0; j < 3; j++) {
      const p = pathAt(t.line.path, t.s - t.dir * j * (carL + 1), 0); const X = sx(p.x); const Y = sy(p.y);
      if (!onScreen(X, Y, 40)) continue;
      const ang = Math.atan2(Math.sin(p.a) * cam.tilt, Math.cos(p.a)); const k = Math.max(z, 0.55);
      g.save(); g.translate(X, Y); g.rotate(ang); g.lineWidth = Math.max(1.2, 1.8 * k);
      rr(-carL / 2 * k, -5 * k, carL * k, 10 * k, 3 * k); g.fillStyle = t.line.color; g.fill(); g.strokeStyle = '#fffdf6'; g.stroke();
      g.restore();
      for (let r = 0; r < 3; r++) {
        const rd = t.riders[(j * 3 + r) % 9]; const hx = X + Math.cos(ang) * (r - 1) * 4.5 * k; const hy = Y + Math.sin(ang) * (r - 1) * 4.5 * k - 1.5 * k;
        g.beginPath(); g.arc(hx, hy, 2 * k, 0, TAU); g.fillStyle = '#ffdcb8'; g.fill(); g.beginPath(); g.arc(hx, hy - 0.4 * k, 2 * k, Math.PI, TAU); g.fillStyle = rd.h; g.fill();
      }
      t.bb[0] = Math.min(t.bb[0], X - 12 * k); t.bb[1] = Math.min(t.bb[1], Y - 8 * k); t.bb[2] = Math.max(t.bb[2], X + 12 * k); t.bb[3] = Math.max(t.bb[3], Y + 8 * k);
    }
  }
  g.restore();
}
// station entrances, visible when the X-ray is off
SUBST.forEach((s) => {
  statics.push({ y: s.y + 8, f: () => {
    if (cam.z < 0.4 || subAmt > 0.5) return;
    const X = sx(s.x); const Y = sy(s.y); if (!onScreen(X, Y, 40)) return;
    const k = Math.max(cam.z, 0.55); g.save(); g.translate(X, Y); g.scale(k, k); g.lineWidth = Math.max(1.2 / k, 1.6); g.strokeStyle = INK;
    ell(0, 1, 9, 3.5, 'rgba(0,0,0,.18)');
    box(-1.2, -16, 2.4, 16, '#8a8696', 1);
    const w = 7 + s.lines.length * 7; rr(-w / 2, -26, w, 11, 4); g.fillStyle = '#fffdf6'; g.fill(); g.stroke();
    s.lines.forEach((l, i) => { g.beginPath(); g.arc(-w / 2 + 7 + i * 7, -20.5, 3, 0, TAU); g.fillStyle = l.color; g.fill(); });
    g.restore();
  } });
});

/* ---------- planes ---------- */
const AP = GEO.haneda; const RWY = { x0: AP.x + 18, x1: AP.x + AP.w - 28, y: AP.y + 3 };
const planes = [
  { mode: 'takeoff', t: 0, T: 17, wait: 2, col: '#fffdf6', str: '#e8503a', x: 0, y: 0, z: 0, on: false },
  { mode: 'land', t: 0, T: 17, wait: 9, col: '#f1f5fb', str: '#2f7fe0', x: 0, y: 0, z: 0, on: false },
];
function updPlane(p, dt) {
  if (p.wait > 0) { p.wait -= dt; p.on = false; return; }
  p.on = true; p.t += dt; const u = Math.min(1, p.t / p.T); const far = RWY.x1 + 1000;
  const x = p.mode === 'takeoff' ? RWY.x0 + u ** 1.7 * (far - RWY.x0) : far - (1 - (1 - u) ** 1.7) * (far - RWY.x0);
  const over = Math.max(0, x - RWY.x1);
  p.x = x; p.z = over * 0.5; p.y = RWY.y - over * 0.05;
  if (u >= 1) { p.t = 0; p.mode = p.mode === 'takeoff' ? 'land' : 'takeoff'; p.wait = 5 + Math.random() * 6; p.on = false; }
}
function drawPlane(p) {
  const k = cam.z * 1.15; const X = sx(p.x); const Y = sy(p.y, p.z + 7);
  if (!onScreen(X, Y, 70)) return;
  ell(sx(p.x), sy(p.y), 24 * cam.z, 5 * cam.z, 'rgba(0,0,0,.2)');
  g.save(); g.translate(X, Y); g.scale(p.mode === 'takeoff' ? k : -k, k); g.lineWidth = Math.max(1.1 / k, 1.6); g.strokeStyle = INK; g.lineJoin = 'round';
  g.rotate(p.z > 0 ? -0.12 : 0);
  poly([[-4, 0], [10, -2], [-8, -14], [-14, -14]], '#d4d8e2');
  poly([[-20, -2], [-30, -17], [-24, -17], [-12, -2]], p.str);
  ell(0, 0, 26, 6.5, p.col, true);
  g.beginPath(); g.moveTo(20, -3); g.quadraticCurveTo(28, 0, 23, 4); g.lineTo(20, 4); g.closePath(); g.fillStyle = p.col; g.fill();
  g.fillStyle = '#6f93b4'; for (let i = -14; i < 14; i += 5) g.fillRect(i, -2.8, 2.6, 2.6);
  g.fillStyle = p.str; g.fillRect(-18, 1.4, 38, 1.8);
  poly([[-2, 2], [12, 3], [-6, 14], [-13, 14]], '#e1e5ee');
  ell(2, 5, 3.8, 2.4, '#8e93a4', true);
  g.restore();
}

/* ---------- boats ---------- */
const RIVERP = mkPath(GEO.river, false);
const BAYP = mkPath(chaikin([[620, 1090], [1000, 1190], [1280, 1430], [900, 1590], [520, 1450], [470, 1240]], true, 2), true);
const boats = [];
for (let i = 0; i < 3; i++) boats.push({ type: 'yakata', path: RIVERP, s: (i * RIVERP.L) / 3 + 40, v: 18 + i * 3, dir: i % 2 ? -1 : 1 });
['ship', 'ship', 'sail', 'sail', 'sail'].forEach((ty, i) => boats.push({ type: ty, path: BAYP, s: (i * BAYP.L) / 5, v: ty === 'ship' ? 20 : 14 + i * 2, dir: 1, c: ['#e8503a', '#5b9bd5', '#ffffff', '#ffd23c', '#ff9ebb'][i] }));
function updBoat(b, dt) {
  b.s += b.dir * b.v * dt;
  if (!b.path.closed) { if (b.s > b.path.L - 30) { b.s = b.path.L - 30; b.dir = -1; } if (b.s < 30) { b.s = 30; b.dir = 1; } }
}
function drawBoat(b) {
  const p = pathAt(b.path, b.s, 0); const X = sx(p.x); const Y = sy(p.y); if (!onScreen(X, Y, 90)) return;
  const k = Math.max(cam.z, 0.5); const facing = Math.cos(p.a) * b.dir >= 0 ? 1 : -1;
  g.save(); g.translate(X, Y + Math.sin(time * 2 + b.s) * 1.2 * k); g.scale(k * facing, k); g.lineWidth = Math.max(1.2 / k, 1.7); g.strokeStyle = INK; g.lineJoin = 'round';
  ell(0, 4, 24, 5, 'rgba(0,40,80,.18)');
  if (b.type === 'yakata') {
    poly([[-22, -2], [22, -2], [17, 6], [-17, 6]], '#8a5a32');
    box(-13, -14, 26, 12, '#fff1d6', 2); box(-9, -11, 6, 6, '#7fb7d6', 1); box(3, -11, 6, 6, '#7fb7d6', 1);
    poly([[-17, -14], [17, -14], [12, -20], [-12, -20]], '#c8553d');
    ell(0, -22, 2.2, 2.2, env.n > 0.2 ? '#ffd873' : '#e8503a', true);
    if (env.n > 0.2) lights.push([0, -22, 30, '255,200,110']);
  } else if (b.type === 'ship') {
    poly([[-34, -4], [34, -4], [26, 8], [-30, 8]], '#3a4a5e');
    box(-30, -9, 60, 5, '#e8503a', 1);
    ['#5b9bd5', '#ffd23c', '#7ccf6e', '#e8503a', '#5b9bd5'].forEach((c, i) => box(-28 + i * 11, -17, 10, 8, c, 1));
    box(14, -22, 14, 13, '#f6f1e4', 2); box(17, -19, 8, 4, '#6f93b4', 1);
    if (env.n > 0.2) lights.push([20, -16, 28, '255,220,150']);
  } else {
    poly([[-14, -2], [14, -2], [9, 6], [-9, 6]], '#f6f1e4');
    g.beginPath(); g.moveTo(0, -3); g.lineTo(0, -34); g.stroke();
    poly([[1, -33], [14, -6], [1, -6]], b.c); poly([[-1, -28], [-11, -6], [-1, -6]], '#fffdf6');
  }
  g.restore();
  flushLights(X, Y, k);
}

/* ---------- Rainbow Bridge, Haneda terminal ---------- */
const RBP = mkPath(RB, false);
function drawTransitGround() {
  const z = cam.z; g.lineJoin = 'round'; g.lineCap = 'butt';
  const stroke = (col, w) => { g.beginPath(); RBP.P.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1])))); g.strokeStyle = col; g.lineWidth = w * z; g.stroke(); };
  stroke(INK, 38); stroke('#e6e8ef', 33); stroke('#8b8896', 23);
  g.save(); g.setLineDash([12 * z, 12 * z]); stroke('rgba(255,255,255,.85)', 1.6); g.restore(); g.lineCap = 'round';
}
(() => {
  const TH = 86; const sOf = (f) => RBP.L * f;
  const legsAt = (f) => [pathAt(RBP, sOf(f), 13), pathAt(RBP, sOf(f), -13)];
  const t1 = legsAt(0.45); const t2 = legsAt(0.82); const a0 = legsAt(0.1); const a1 = legsAt(1);
  const cable = (p, pz, q, qz, sag) => {
    const x0 = sx(p.x); const y0 = sy(p.y, pz); const x1 = sx(q.x); const y1 = sy(q.y, qz); const w = Math.max(1.2, 2 * cam.z);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * cam.z, x1, y1);
    g.strokeStyle = INK; g.lineWidth = w + 2; g.stroke(); g.strokeStyle = '#fffdf6'; g.lineWidth = w; g.stroke();
  };
  const tower = (legs, cables) => {
    const mx = (legs[0].x + legs[1].x) / 2; const my = (legs[0].y + legs[1].y) / 2;
    return { y: my + 4, f: () => {
      const X = sx(mx); if (!onScreen(X, sy(my, 40), 360 * cam.z)) return;
      g.lineJoin = 'round'; g.lineCap = 'round'; const w = Math.max(1.4, 2.4 * cam.z);
      cables();
      for (const lg of legs) { g.beginPath(); g.moveTo(sx(lg.x), sy(lg.y, 6)); g.lineTo(sx(lg.x), sy(lg.y, TH)); g.strokeStyle = INK; g.lineWidth = w * 3 + 2; g.stroke(); g.strokeStyle = '#e8503a'; g.lineWidth = w * 3; g.stroke(); }
      for (const zz of [34, 62, TH - 6]) { g.beginPath(); g.moveTo(sx(legs[0].x), sy(legs[0].y, zz)); g.lineTo(sx(legs[1].x), sy(legs[1].y, zz)); g.strokeStyle = INK; g.lineWidth = w * 2 + 2; g.stroke(); g.strokeStyle = '#fffdf6'; g.lineWidth = w * 2; g.stroke(); }
      if (env.n > 0.2) litList.push([X, sy(my, 70), 80 * cam.z, '255,120,170']);
    } };
  };
  statics.push(tower(t1, () => { for (let i = 0; i < 2; i++) { cable(a0[i], 9, t1[i], TH, 26); cable(t1[i], TH, t2[i], TH, 34); } }));
  statics.push(tower(t2, () => { for (let i = 0; i < 2; i++) cable(a1[i], 9, t2[i], TH, 26); }));
})();
// Haneda terminal and control tower
statics.push({ y: AP.y - 26, f: () => {
  const X = sx(AP.x + 150); const Y = sy(AP.y - 24); if (!onScreen(X, Y, 160 * cam.z)) return;
  const k = cam.z; g.save(); g.translate(X, Y); g.scale(k, k); g.lineWidth = Math.max(1.2 / k, 1.8); g.strokeStyle = INK; g.lineJoin = 'round';
  ell(4, 2, 80, 9, SH);
  box(-72, -24, 144, 24, '#e9eef5'); poly([[72, 0], [82, -5], [82, -29], [72, -24]], shade('#e9eef5', -0.2));
  for (let x = -66; x < 64; x += 11) { g.fillStyle = env.n > 0.2 ? '#ffd873' : '#7fb7d6'; g.fillRect(x, -19, 8, 9); }
  g.beginPath(); g.moveTo(-76, -24); g.quadraticCurveTo(0, -42, 76, -24); g.lineTo(76, -27); g.quadraticCurveTo(0, -46, -76, -27); g.closePath(); g.fillStyle = '#c8553d'; g.fill(); g.stroke();
  box(-94, -52, 8, 52, '#d7dde6', 1); poly([[-100, -52], [-80, -52], [-76, -66], [-104, -66]], '#6f93b4');
  box(-104, -70, 28, 4, '#c8553d', 1);
  g.restore();
} });

/* ---------- per-frame update, dynamic draw list and hit tests ---------- */
function updateTransit(dt) {
  yamaTrains.forEach((t) => updYama(t, dt));
  shinTrains.forEach((t) => updShin(t, dt));
  metroTrains.forEach((t) => updMetro(t, dt));
  planes.forEach((p) => updPlane(p, dt));
  boats.forEach((b) => updBoat(b, dt));
  subAmt += ((subOn ? 1 : 0) - subAmt) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 6));
}
function transitDyn(out) {
  for (const t of yamaTrains) {
    t.bb = emptyBB(); const off = t.dir > 0 ? -YA.off : YA.off;
    for (let j = 0; j < YA.cars; j++) {
      const p = pathAt(YAMA_PATH, t.s - t.dir * (j + 0.5) * YA.carL, off);
      if (!onScreen(sx(p.x), sy(p.y, 30), 80)) continue;
      out.push({ y: p.y + 3, f: () => drawYamaCar(t, p) });
    }
  }
  for (const t of shinTrains) {
    t.bb = emptyBB(); if (t.phase === 'wait') continue;
    const path = SHN[t.line].path;
    const parts = [[t.d + SHD.cap / 2, SHD.cap, 9, true]];
    for (let j = 0; j < SHD.cars; j++) parts.push([t.d + SHD.cap + SHD.carL * (j + 0.5), SHD.carL, 12, false]);
    parts.push([t.d + SHD.cap + SHD.carL * SHD.cars + SHD.cap / 2, SHD.cap, 9, true]);
    for (const [s, len, wid, cap] of parts) {
      const q = pathAt(path, s, shinTrack(t, s));
      if (outsideWorld(q.x, q.y) || !onScreen(sx(q.x), sy(q.y, 40), 100)) continue;
      out.push({ y: q.y + 3 + shinBias(q.x, q.y), f: () => drawShinPart(t, s, len, wid, cap) });
    }
  }
  for (const p of planes) if (p.on) out.push({ y: p.z > 30 ? 1e5 : p.y + 20, f: () => drawPlane(p) });
  for (const b of boats) { const q = pathAt(b.path, b.s, 0); out.push({ y: q.y, f: () => drawBoat(b) }); }
}
function trainAt(px, py) {
  const list = subOn ? metroTrains : yamaTrains.concat(shinTrains);
  let best = null; let bd = Infinity;
  for (const t of list) {
    const b = t.bb; if (b[0] > b[2]) continue;
    if (px < b[0] - 6 || px > b[2] + 6 || py < b[1] - 6 || py > b[3] + 6) continue;
    const d = Math.hypot(px - (b[0] + b[2]) / 2, py - (b[1] + b[3]) / 2); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function trainPos(t) {
  if (t.kind === 'yama') return pathAt(YAMA_PATH, t.s - t.dir * YL / 2, t.dir > 0 ? -YA.off : YA.off);
  if (t.kind === 'metro') return pathAt(t.line.path, t.s, 0);
  return pathAt(SHN[t.line].path, t.d + SHL / 2, shinTrack(t, t.d + SHL / 2));
}
const trainOnMap = (t) => (t.kind === 'yama' || t.kind === 'metro' || t.phase !== 'wait');
function trainInfo(t) {
  const L2 = lang === 'zh' ? 1 : 0;
  if (t.kind === 'yama') {
    const st = YAMA_ST[t.idx]; return { key: 'yama', dirTxt: tx(t.dir > 0 ? 'outer' : 'inner'), next: L2 ? st.zh : st.en, name: tx('trains').yama.name, color: '#6cbf3c' };
  }
  if (t.kind === 'metro') {
    const st = t.line.stops[clamp(t.idx, 0, t.line.stops.length - 1)];
    return { key: 'metro', dirTxt: (L2 ? t.line.zh : t.line.en), next: L2 ? st.zh : st.en, name: (L2 ? t.line.zh : t.line.en), color: t.line.color };
  }
  const goesIn = t.phase === 'wait' || t.phase === 'arrive' || t.phase === 'dwell';
  const dest = SHIN_DEST[t.line]; const here = L2 ? '东京' : 'Tokyo'; const omiya = L2 ? '大宫' : 'Omiya';
  const callsOmiya = t.line === 'tohoku' && t.phase !== 'wait' && (goesIn ? !t.omA : !t.omD);
  return { key: t.line, dirTxt: tx('toward') + ' ' + (goesIn ? here : dest[L2]), next: callsOmiya ? omiya : goesIn ? here : dest[L2], name: tx('trains')[t.line].name, color: SHN[t.line].c };
}
