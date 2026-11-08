'use strict';
/* draw.js: canvas, camera, drawing helpers, landmarks, scenery and the ground layer. */

const cv = $('cv'); const g = cv.getContext('2d');
let W = 0; let H = 0; let DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
const cam = { x: 0, y: 0, z: 0.6, tx: 0, ty: 0, tz: 0.6, tilt: 0.58, ttilt: 0.58 };
let bird = false;
const sx = (x) => (x - cam.x) * cam.z + W / 2;
const sy = (y, z) => (y - cam.y) * cam.z * cam.tilt + H / 2 - (z || 0) * cam.z;
const WD = GEO.WORLD;

function rectZoom(x0, y0, x1, y1) {
  const padX = isMobile() ? 16 : 70; const padY = isMobile() ? 190 : 150;
  return clamp(Math.min((W - padX * 2) / (x1 - x0), (H - padY * 2) / ((y1 - y0) * cam.ttilt)), 0.1, 1.3);
}
function fitRect(x0, y0, x1, y1) { cam.tz = rectZoom(x0, y0, x1, y1); cam.tx = (x0 + x1) / 2; cam.ty = (y0 + y1) / 2; }
function fitAll() { fitRect(WD.x0, WD.y0, WD.x1, WD.y1 + 40); }
function fitCity() { fitRect(-980, -760, 960, 900); }
function fitStart() {
  if (isMobile()) { cam.tz = clamp(Math.min(W / 1000, H / 900), 0.24, 0.6); cam.tx = 90; cam.ty = 40; } else fitCity();
}
function zoomAt(px, py, f) {
  const wx = (px - W / 2) / cam.z + cam.x; const wy = (py - H / 2) / (cam.z * cam.tilt) + cam.y;
  const nz = clamp(cam.z * f, 0.1, 3);
  cam.z = cam.tz = nz;
  cam.x = cam.tx = wx - (px - W / 2) / nz; cam.y = cam.ty = wy - (py - H / 2) / (nz * cam.tilt);
}

/* ---------- drawing helpers ---------- */
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function box(x, y, w, h, c, r) { rr(x, y, w, h, r || 0); g.fillStyle = c; g.fill(); g.stroke(); }
function poly(pts, c) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = c; g.fill(); g.stroke(); }
function ell(x, y, rx, ry, c, stroke) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = c; g.fill(); if (stroke) g.stroke(); }
function emoji(ch, x, y, size) { g.font = `${size}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText(ch, x, y); }
function onScreen(x, y, m) { return x > -m && x < W + m && y > -m && y < H + m; }
const strokeW = () => Math.max(1.2, 2.2 * cam.z);
function rectPath(x0, y0, x1, y1, lift) {
  g.moveTo(sx(x0), sy(y0, lift)); g.lineTo(sx(x1), sy(y0, lift)); g.lineTo(sx(x1), sy(y1, lift)); g.lineTo(sx(x0), sy(y1, lift)); g.closePath();
}
function ellPath(x, y, rx, ry) { g.moveTo(sx(x) + rx * cam.z, sy(y)); g.ellipse(sx(x), sy(y), rx * cam.z, ry * cam.z * cam.tilt, 0, 0, TAU); }
function polyPath(pts) { pts.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1])))); }

// an oriented 3D box in world coordinates, drawn in screen space. Used for train cars.
// o = { win, band, bb } : window colour, stripe colour, and a [x0,y0,x1,y1] box to grow for hit-testing
function obox(cx, cy, ang, len, wid, z0, z1, cTop, cSide, o) {
  o = o || {}; const c = Math.cos(ang); const s = Math.sin(ang); const hl = len / 2; const hw = wid / 2;
  const loc = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]];
  const P = loc.map(([a, b]) => [cx + a * c - b * s, cy + a * s + b * c]);
  const nrm = [[1, 0], [0, -1], [-1, 0], [0, 1]];
  g.lineJoin = 'round';
  for (let i = 0; i < 4; i++) {
    const wn = nrm[i][0] * s + nrm[i][1] * c; // world y of the outward normal
    if (wn < 0.02) continue;
    const A = P[i]; const B = P[(i + 1) % 4]; const long = i % 2 === 1;
    const col = shade(cSide, long ? -0.06 : -0.26);
    g.beginPath(); g.moveTo(sx(A[0]), sy(A[1], z0)); g.lineTo(sx(B[0]), sy(B[1], z0)); g.lineTo(sx(B[0]), sy(B[1], z1)); g.lineTo(sx(A[0]), sy(A[1], z1)); g.closePath();
    g.fillStyle = col; g.fill(); g.stroke();
    if (long) {
      const q = (t0, t1, f0, f1, color) => {
        const ax = A[0] + (B[0] - A[0]) * t0; const ay = A[1] + (B[1] - A[1]) * t0; const bx = A[0] + (B[0] - A[0]) * t1; const by = A[1] + (B[1] - A[1]) * t1;
        const za = z0 + (z1 - z0) * f0; const zb = z0 + (z1 - z0) * f1;
        g.beginPath(); g.moveTo(sx(ax), sy(ay, za)); g.lineTo(sx(bx), sy(by, za)); g.lineTo(sx(bx), sy(by, zb)); g.lineTo(sx(ax), sy(ay, zb)); g.closePath(); g.fillStyle = color; g.fill();
      };
      if (o.band) q(0.02, 0.98, 0.1, 0.3, o.band);
      if (o.win) { const n = Math.max(2, Math.round(len / 7)); for (let k = 0; k < n; k++) q(0.07 + (0.86 * k) / n, 0.07 + (0.86 * (k + 0.7)) / n, 0.45, 0.82, o.win); }
    }
  }
  g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1], z1)) : g.moveTo(sx(p[0]), sy(p[1], z1)))); g.closePath(); g.fillStyle = cTop; g.fill(); g.stroke();
  if (o.bb) for (const p of P) for (const z of [z0, z1]) {
    const X = sx(p[0]); const Y = sy(p[1], z);
    o.bb[0] = Math.min(o.bb[0], X); o.bb[1] = Math.min(o.bb[1], Y); o.bb[2] = Math.max(o.bb[2], X); o.bb[3] = Math.max(o.bb[3], Y);
  }
}

/* ---------- environment (time of day) ---------- */
const TOD = [{ m: [255, 212, 186], n: 0.15 }, { m: [255, 255, 255], n: 0 }, { m: [255, 168, 124], n: 0.35 }, { m: [92, 110, 190], n: 1 }];
const env = { m: [255, 255, 255], n: 0 };
let todIdx = 1; let autoTod = false; let autoClock = 0;
function updateEnv(dt) {
  const T = TOD[todIdx]; const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.5);
  for (let i = 0; i < 3; i++) env.m[i] += (T.m[i] - env.m[i]) * k;
  env.n += (T.n - env.n) * k;
  if (autoTod && !reduceMotion) { autoClock += dt; if (autoClock > 12) { autoClock = 0; todIdx = (todIdx + 1) % 4; if (window.syncTodButtons) window.syncTodButtons(); } }
}

/* ---------- shared state ---------- */
let time = 0; let selId = null; let hoverB = null; let paused = false; let lastDt = 0.016;
let lw = 2;
const lights = []; const litList = [];
function flushLights(X, Y, k) {
  for (const L of lights) litList.push([X + L[0] * k, Y + L[1] * k, L[2] * k, L[3]]);
  lights.length = 0;
}

/* ---------- landmarks ---------- */
function roofShape(y, wBot, wTop, h, color) {
  const hb = wBot / 2; const ht = wTop / 2;
  poly([[-hb, y], [hb, y], [ht, y - h], [-ht, y - h]], color);
  g.beginPath(); g.moveTo(-hb, y); g.quadraticCurveTo(-hb - 3, y - 2, -hb - 6, y - 7); g.quadraticCurveTo(-hb + 3, y - 4, -hb + 6, y - 3); g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(hb, y); g.quadraticCurveTo(hb + 3, y - 2, hb + 6, y - 7); g.quadraticCurveTo(hb - 3, y - 4, hb - 6, y - 3); g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
}
const win = (n) => (n > 0.2 ? '#ffd873' : '#cfe6f2');
function grid(x0, y0, w, h, cw, ch, n, seedv) {
  for (let y = y0; y + ch <= y0 + h; y += ch + 3) for (let x = x0; x + cw <= x0 + w; x += cw + 3) {
    const lit = n > 0.2 && ((x * 7 + y * 13 + (seedv || 0)) & 3) !== 0;
    g.fillStyle = lit ? '#ffd873' : '#cfe6f2'; g.fillRect(x, y, cw, ch);
  }
}
const SH = 'rgba(0,0,0,.18)';
const DRAW = {
  shop(b, n) {
    const w = 36; const h = b.h; const d = 10; const dc = DIST[b.dist];
    const roof = shade(dc.c, -0.22); const roofSide = shade(dc.c, -0.36);
    ell(5, 2, 28, 7, SH);
    box(-w / 2, -h, w, h, b.wall);
    poly([[w / 2, 0], [w / 2 + d, -5], [w / 2 + d, -h - 5], [w / 2, -h]], shade(b.wall, -0.2));
    poly([[w / 2 + 5, -h + 1], [w / 2 + d + 5, -h - 4], [w / 2 + d - 5, -h - 19], [w / 2 - 5, -h - 14]], roofSide);
    poly([[-w / 2 - 5, -h + 1], [w / 2 + 5, -h + 1], [w / 2 - 5, -h - 14], [-w / 2 + 5, -h - 14]], roof);
    const sw = w / 6;
    for (let i = 0; i < 6; i++) box(-w / 2 + i * sw, -h + 1, sw, 8, i % 2 ? '#ffffff' : dc.c);
    box(-12, -h / 2 - 7, 24, 20, n > 0.2 ? '#ffe9a8' : '#ffffff', 5);
    emoji(b.p.emoji, 0, -h / 2 + 3, 15);
    if (n > 0.2) lights.push([0, -h / 2 + 3, 30, '255,200,110']);
  },
  station(b, n) {
    const brick = '#b8553f';
    ell(4, 3, 68, 10, SH);
    box(-56, -30, 112, 30, brick);
    poly([[56, 0], [66, -6], [66, -36], [56, -30]], shade(brick, -0.22));
    g.save(); g.fillStyle = '#f4ecdc'; g.fillRect(-56, -12, 112, 3); g.fillRect(-56, -22, 112, 3); g.restore();
    for (let x = -22; x <= 14; x += 12) { box(x, -29, 7, 6, win(n), 1); box(x, -17, 7, 6, win(n), 1); }
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(-8, -10); g.quadraticCurveTo(0, -20, 8, -10); g.lineTo(8, 0); g.closePath(); g.fillStyle = '#4a3b30'; g.fill(); g.stroke();
    for (const px of [-44, 44]) {
      box(px - 14, -46, 28, 46, brick);
      for (let y = -40; y < -6; y += 11) box(px - 4, y, 8, 7, win(n), 1);
      g.beginPath(); g.ellipse(px, -46, 17, 14, 0, Math.PI, TAU); g.closePath(); g.fillStyle = '#6f9a8e'; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(px, -60); g.lineTo(px, -68); g.stroke();
      g.beginPath(); g.arc(px, -69, 2.5, 0, TAU); g.fillStyle = '#ffc93c'; g.fill(); g.stroke();
    }
    if (n > 0.2) { lights.push([-44, -26, 40, '255,190,90']); lights.push([44, -26, 40, '255,190,90']); }
  },
  castle(b, n) {
    ell(4, 2, 50, 9, SH);
    poly([[-42, 0], [42, 0], [32, -26], [-32, -26]], '#c9c4b6');
    g.save(); g.strokeStyle = 'rgba(90,80,60,.35)'; g.lineWidth = 1; g.beginPath(); for (let y = -8; y > -26; y -= 9) { g.moveTo(-40 + (-y) * 0.4, y); g.lineTo(40 - (-y) * 0.4, y); } g.stroke(); g.restore();
    box(-24, -46, 48, 20, '#f6f1e4'); for (const x of [-14, 0, 14]) box(x - 3, -42, 6, 8, win(n), 1);
    roofShape(-46, 62, 40, 11, '#5f8a86');
    box(-15, -66, 30, 14, '#f6f1e4'); box(-3, -63, 6, 7, win(n), 1);
    roofShape(-66, 44, 22, 11, '#5f8a86');
    g.beginPath(); g.moveTo(0, -77); g.lineTo(0, -84); g.stroke();
    ell(0, -86, 3, 3, '#ffc93c', true);
    if (n > 0.2) lights.push([0, -40, 44, '255,200,120']);
  },
  clock(b, n) {
    ell(4, 2, 44, 8, SH);
    box(-30, -46, 60, 46, '#efe3cf');
    poly([[30, 0], [39, -5], [39, -51], [30, -46]], shade('#efe3cf', -0.2));
    for (let x = -22; x <= 14; x += 14) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x, -22); g.arc(x + 4, -22, 4, Math.PI, 0); g.lineTo(x + 8, -4); g.closePath(); g.fillStyle = win(n); g.fill(); g.stroke(); }
    for (let i = 0; i < 5; i++) box(-30 + i * 12, -40, 12, 6, i % 2 ? '#ffffff' : '#c8553d');
    box(-13, -78, 26, 32, '#e6d5b8');
    ell(0, -63, 9.5, 9.5, '#fffdf6', true);
    const a = time * 0.4;
    g.beginPath(); g.moveTo(0, -63); g.lineTo(Math.sin(a) * 6, -63 - Math.cos(a) * 6); g.moveTo(0, -63); g.lineTo(Math.sin(a / 12) * 4, -63 - Math.cos(a / 12) * 4); g.stroke();
    g.beginPath(); g.ellipse(0, -78, 15, 11, 0, Math.PI, TAU); g.closePath(); g.fillStyle = '#6f9a8e'; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -89); g.lineTo(0, -96); g.stroke();
    if (n > 0.2) lights.push([0, -60, 44, '255,220,140']);
  },
  market(b, n) {
    ell(4, 2, 50, 8, SH);
    box(-42, -26, 84, 26, '#e9eef2');
    poly([[42, 0], [51, -5], [51, -31], [42, -26]], shade('#e9eef2', -0.2));
    for (let i = 0; i < 10; i++) box(-42 + i * 8.4, -28, 8.4, 11, i % 2 ? '#ffffff' : '#3c8fd0');
    for (let i = 0; i < 4; i++) box(-34 + i * 20, -10, 14, 8, '#f6c98a', 1.5);
    box(-14, -44, 28, 15, '#fff6c9', 4); emoji('🐟', 0, -37, 13);
    ell(34, -3, 6, 3, '#ff9a8a', true);
    if (n > 0.2) lights.push([0, -20, 46, '255,230,180']);
  },
  tokyotower(b, n) {
    ell(4, 3, 40, 8, SH);
    const Ht = 192; const xw = (t) => 31 * (1 - t) ** 1.5 + 3;
    const N = 12;
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const t0 = i / N; const t1 = (i + 1) / N; const y0 = -t0 * Ht * 0.84; const y1 = -t1 * Ht * 0.84; const a = xw(t0); const c = xw(t1);
      g.lineWidth = lw * 1.3; g.strokeStyle = INK; g.beginPath(); g.moveTo(-a, y0); g.lineTo(c, y1); g.moveTo(a, y0); g.lineTo(-c, y1); g.stroke();
      g.lineWidth = lw * 3.4; g.strokeStyle = INK;
      g.beginPath(); g.moveTo(-a, y0); g.lineTo(-c, y1); g.moveTo(a, y0); g.lineTo(c, y1); g.stroke();
      g.lineWidth = lw * 1.9; g.strokeStyle = i % 2 ? '#fffdf6' : '#e8503a';
      g.beginPath(); g.moveTo(-a, y0); g.lineTo(-c, y1); g.moveTo(a, y0); g.lineTo(c, y1); g.stroke();
    }
    g.restore();
    box(-16, -108, 32, 8, '#e8503a', 2); box(-14, -100, 28, 4, '#fffdf6', 1);
    box(-9, -147, 18, 7, '#e8503a', 2);
    const yTop = -Ht * 0.84;
    g.beginPath(); g.moveTo(0, yTop); g.lineTo(0, -Ht); g.lineWidth = lw * 2.6; g.stroke();
    g.lineWidth = lw * 1.6; g.strokeStyle = '#fffdf6'; g.stroke(); g.strokeStyle = INK; g.lineWidth = lw;
    ell(0, -Ht - 2, 2.6, 2.6, Math.sin(time * 4) > 0 ? '#ff4d4d' : '#ffb3b3', true);
    if (n > 0.2) { lights.push([0, -104, 70, '255,150,60']); lights.push([0, -150, 50, '255,160,70']); lights.push([0, -60, 60, '255,140,50']); }
  },
  hills(b, n) {
    ell(4, 2, 44, 8, SH);
    box(-36, -22, 72, 22, '#cfd8e0');
    box(-20, -132, 40, 112, '#8fb8d8');
    poly([[20, -22], [28, -27], [28, -137], [20, -132]], shade('#8fb8d8', -0.22));
    g.save(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath();
    for (let y = -30; y > -128; y -= 8) { g.moveTo(-20, y); g.lineTo(20, y); }
    for (let x = -12; x < 20; x += 8) { g.moveTo(x, -22); g.lineTo(x, -132); }
    g.stroke(); g.restore();
    box(-23, -140, 46, 8, '#cfd8e0', 2);
    g.beginPath(); g.moveTo(0, -140); g.lineTo(0, -152); g.stroke();
    // the giant spider sculpture
    g.save(); g.lineWidth = lw * 1.6;
    for (let i = 0; i < 8; i++) { const sx2 = i < 4 ? -1 : 1; const k2 = (i % 4) - 1.5; g.beginPath(); g.moveTo(40, -18); g.quadraticCurveTo(40 + sx2 * (14 + Math.abs(k2) * 3), -34 - k2 * 2, 40 + sx2 * (18 + k2 * 5), 2); g.stroke(); }
    g.restore();
    ell(40, -18, 7, 5.5, '#2d2a32', true);
    if (n > 0.2) { grid(-18, -126, 36, 98, 5, 5, n, 3); lights.push([0, -80, 70, '255,225,150']); }
  },
  crossing(b, n) {
    ell(0, -2, 52, 15, '#6e6a78', true);
    g.save(); g.fillStyle = '#fffdf6';
    for (let i = -4; i <= 4; i++) { g.fillRect(i * 9 - 2, -14, 4, 24 * 0.5 - 1); g.fillRect(i * 9 - 2, 2, 4, 9); }
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-46 + 0, i * 4 - 2); g.lineTo(46, i * 4 + 2); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.7)'; g.stroke(); }
    g.restore();
    box(-62, -66, 26, 62, '#d7dde6'); box(-59, -60, 20, 14, '#ff4fa3'); box(-59, -43, 20, 12, '#2de2e6'); box(-59, -29, 20, 10, '#ffd23c');
    box(36, -76, 28, 72, '#c9d3de'); box(39, -70, 22, 16, '#7c5cff'); box(39, -51, 22, 14, '#ff7a4f');
    emoji('🐕', 0, -10, 11);
    if (n > 0.2) { lights.push([-49, -45, 46, '255,80,170']); lights.push([50, -58, 46, '124,92,255']); lights.push([-49, -25, 36, '45,226,230']); }
  },
  shrine(b, n) {
    ell(4, 2, 46, 8, SH);
    box(-15, -26, 30, 22, '#f3e3c2'); box(-4, -20, 8, 16, '#7a4e32', 1);
    roofShape(-26, 44, 24, 13, '#5f8f7a');
    box(-30, -50, 7, 50, '#c8553d'); box(23, -50, 7, 50, '#c8553d');
    box(-26, -42, 52, 6, '#c8553d');
    poly([[-38, -50], [38, -50], [32, -58], [-32, -58]], '#2d2a32');
    box(-3, -50, 6, 8, '#2d2a32');
    if (n > 0.2) lights.push([0, -24, 34, '255,190,90']);
  },
  candy(b, n) {
    ell(4, 2, 42, 8, SH);
    box(-32, -42, 10, 42, '#ff9ebb'); box(22, -42, 10, 42, '#ff9ebb');
    box(-38, -56, 76, 16, '#ffffff', 4);
    ['#ff6b6b', '#ffb02e', '#ffe14d', '#7ccf6e', '#5b9bd5', '#b48ad8'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-35 + i * 12, -38, 12, 5); });
    emoji('🎀', -18, -48, 12); emoji('🍦', 18, -48, 13);
    ell(0, -4, 20, 5, 'rgba(255,255,255,.6)');
    emoji('🍓', 0, -10, 12);
    if (n > 0.2) lights.push([0, -48, 44, '255,170,210']);
  },
  twin(b, n) {
    ell(4, 3, 50, 9, SH);
    box(-36, -86, 72, 86, '#9aabbf');
    poly([[36, 0], [45, -5], [45, -91], [36, -86]], shade('#9aabbf', -0.22));
    box(-36, -140, 30, 54, '#8d9fb6'); box(6, -140, 30, 54, '#8d9fb6');
    poly([[6, -140], [36, -140], [45, -145], [15, -145]], '#aebdd0');
    poly([[36, -86], [45, -91], [45, -145], [36, -140]], shade('#8d9fb6', -0.25));
    box(-30, -150, 18, 10, '#aebdd0', 2); box(12, -150, 18, 10, '#aebdd0', 2);
    grid(-33, -138, 24, 50, 4, 4, n, 5); grid(9, -138, 24, 50, 4, 4, n, 9); grid(-33, -82, 66, 78, 4, 4, n, 1);
    if (n > 0.2) { lights.push([0, -100, 80, '255,225,150']); lights.push([-20, -140, 40, '255,200,120']); }
  },
  temple(b, n) {
    ell(4, 2, 54, 9, SH);
    box(-40, -38, 10, 38, '#c8553d'); box(30, -38, 10, 38, '#c8553d');
    box(-44, -50, 88, 12, '#c8553d');
    box(-34, -38, 4, 6, '#d6c9a6'); box(30, -38, 4, 6, '#d6c9a6');
    roofShape(-50, 100, 66, 18, '#59606a');
    g.save(); g.lineWidth = lw; ell(0, -22, 12, 16, '#e8503a', true);
    for (let y = -34; y <= -10; y += 6) { g.beginPath(); g.moveTo(-11, y); g.quadraticCurveTo(0, y + 2, 11, y); g.stroke(); }
    g.restore();
    box(-5, -8, 10, 4, '#2d2a32', 1);
    g.font = `700 8px ${FONT}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('雷門', 0, -23);
    if (n > 0.2) lights.push([0, -22, 50, '255,120,70']);
  },
  skytree(b, n) {
    ell(4, 3, 34, 7, SH);
    box(-28, -14, 56, 14, '#cdd5df', 2);
    poly([[-14, -10], [14, -10], [4, -80], [-4, -80]], '#cfd9e8');
    poly([[4, -80], [14, -10], [8, -10], [2, -80]], shade('#cfd9e8', -0.2));
    poly([[-4, -80], [4, -80], [3, -170], [-3, -170]], '#dfe8f2');
    box(-15, -182, 30, 13, '#e6eef7', 5); box(-9, -207, 18, 8, '#e6eef7', 3);
    g.beginPath(); g.moveTo(0, -207); g.lineTo(0, -252); g.lineWidth = lw * 2; g.stroke(); g.lineWidth = lw * 1.1; g.strokeStyle = '#fffdf6'; g.stroke(); g.strokeStyle = INK; g.lineWidth = lw;
    ell(0, -254, 2.4, 2.4, Math.sin(time * 3) > 0 ? '#ff4d4d' : '#ffb3b3', true);
    if (n > 0.2) { lights.push([0, -175, 70, '110,200,255']); lights.push([0, -110, 55, '110,200,255']); lights.push([0, -40, 55, '110,200,255']); }
  },
  panda(b, n) {
    ell(4, 2, 44, 8, SH);
    ell(0, -40, 15, 13, '#ffffff', true);
    ell(-11, -52, 5, 5, '#2d2a32', true); ell(11, -52, 5, 5, '#2d2a32', true);
    ell(0, -16, 20, 17, '#ffffff', true);
    ell(-8, -42, 4.2, 5.2, '#2d2a32'); ell(8, -42, 4.2, 5.2, '#2d2a32');
    ell(-8, -42, 1.4, 1.4, '#ffffff'); ell(8, -42, 1.4, 1.4, '#ffffff');
    ell(0, -36, 3, 2.2, '#2d2a32');
    ell(-19, -18, 6, 11, '#2d2a32', true); ell(19, -18, 6, 11, '#2d2a32', true);
    ell(-9, -3, 8, 5, '#2d2a32', true); ell(9, -3, 8, 5, '#2d2a32', true);
    for (let i = 0; i < 3; i++) { box(34 + i * 4, -38 + i * 2, 3, 38 - i * 2, '#6cc070', 1); }
    if (n > 0.2) lights.push([0, -30, 36, '255,230,190']);
  },
  neon(b, n) {
    ell(4, 2, 46, 8, SH);
    box(-38, -64, 34, 64, '#5d5a78'); box(-35, -60, 28, 20, '#ff4fa3'); emoji('🎮', -21, -50, 14);
    box(-4, -92, 34, 92, '#3f3d5c'); box(-1, -88, 10, 60, '#2de2e6'); box(12, -88, 15, 40, '#ffd23c');
    box(30, -40, 10, 40, '#6a5cc8'); box(-30, -30, 20, 18, '#fff6c9', 2);
    grid(-34, -36, 26, 30, 4, 4, n, 2);
    emoji('🕹️', 20, -62, 11);
    if (n > 0.1) { lights.push([-21, -50, 52, '255,80,170']); lights.push([4, -60, 60, '45,226,230']); lights.push([20, -62, 46, '255,210,60']); }
  },
  ferris(b, n) {
    ell(6, 3, 52, 9, SH);
    g.save(); g.lineWidth = lw * 1.8;
    g.beginPath(); g.moveTo(-26, 0); g.lineTo(0, -72); g.lineTo(26, 0); g.stroke(); g.restore();
    const cx = 0; const cy = -76; const R = 48; const rot = time * 0.25;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.lineWidth = lw * 1.4; g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.55, 0, TAU); g.stroke();
    g.beginPath(); for (let i = 0; i < 12; i++) { const a = rot + (i * TAU) / 12; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } g.lineWidth = lw * 0.8; g.stroke(); g.lineWidth = lw;
    const GC = ['#ff6b6b', '#ffb02e', '#7ccf6e', '#5b9bd5', '#b48ad8', '#ff9ebb'];
    for (let i = 0; i < 12; i++) { const a = rot + (i * TAU) / 12; box(cx + Math.cos(a) * R - 4, cy + Math.sin(a) * R - 2, 8, 8, GC[i % 6], 2); }
    ell(cx, cy, 5, 5, '#ffc93c', true);
    box(-30, -8, 60, 8, '#fffdf6', 2); emoji('🌉', 0, -4, 8);
    if (n > 0.2) { lights.push([0, -76, 80, '255,120,200']); lights.push([0, -76, 46, '120,200,255']); }
  },
  fuji(b, n) {
    g.beginPath(); g.moveTo(-150, 0); g.bezierCurveTo(-96, -26, -52, -150, -18, -188); g.lineTo(18, -188); g.bezierCurveTo(52, -150, 96, -26, 150, 0); g.closePath();
    g.fillStyle = '#6f93c0'; g.fill();
    g.beginPath(); g.moveTo(18, -188); g.bezierCurveTo(52, -150, 96, -26, 150, 0); g.lineTo(34, 0); g.bezierCurveTo(30, -60, 24, -120, 18, -188); g.closePath(); g.fillStyle = '#5a7eab'; g.fill();
    g.beginPath(); g.moveTo(-18, -188); g.lineTo(18, -188); g.lineTo(54, -126); g.lineTo(42, -112); g.lineTo(32, -128); g.lineTo(18, -108); g.lineTo(6, -126); g.lineTo(-8, -104); g.lineTo(-20, -126); g.lineTo(-34, -110); g.lineTo(-48, -128); g.closePath();
    g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.moveTo(-150, 0); g.bezierCurveTo(-96, -26, -52, -150, -18, -188); g.lineTo(18, -188); g.bezierCurveTo(52, -150, 96, -26, 150, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-70, -62, 38, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(80, -40, 30, 6, 0, 0, TAU); g.fill();
    if (n > 0.3) lights.push([0, -170, 70, '200,220,255']);
  },
  buddha(b, n) {
    ell(4, 2, 42, 7, SH);
    box(-30, -9, 60, 9, '#cfc7b6', 2);
    ell(0, -11, 28, 7, '#a6c8a4', true);
    const bz = '#7fa38d';
    g.beginPath(); g.moveTo(-26, -10); g.bezierCurveTo(-30, -34, -18, -42, -10, -48); g.lineTo(10, -48); g.bezierCurveTo(18, -42, 30, -34, 26, -10); g.closePath(); g.fillStyle = bz; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(10, -48); g.bezierCurveTo(18, -42, 30, -34, 26, -10); g.lineTo(14, -10); g.bezierCurveTo(18, -30, 14, -40, 10, -48); g.closePath(); g.fillStyle = shade(bz, -0.2); g.fill();
    ell(0, -22, 11, 5, shade(bz, 0.15), true);
    ell(0, -58, 10, 11, bz, true);
    for (let i = -2; i <= 2; i++) ell(i * 3.6, -68 + Math.abs(i) * 1.2, 2.3, 2.3, '#4f6f5d');
    g.beginPath(); g.moveTo(-5, -58); g.quadraticCurveTo(-3, -60, -1, -58); g.moveTo(1, -58); g.quadraticCurveTo(3, -60, 5, -58); g.stroke();
    g.beginPath(); g.moveTo(-3, -53); g.quadraticCurveTo(0, -51, 3, -53); g.stroke();
    if (n > 0.3) lights.push([0, -40, 40, '255,220,160']);
  },
  omiya(b, n) {
    ell(4, 3, 72, 10, SH);
    const wall = '#f3f0ea';
    box(-60, -34, 120, 34, wall);
    poly([[60, 0], [70, -6], [70, -40], [60, -34]], shade(wall, -0.2));
    g.save(); g.fillStyle = '#2f9e6a'; g.fillRect(-60, -9, 120, 4); g.restore();
    for (let x = -52; x <= 32; x += 17) box(x, -30, 14, 17, n > 0.2 ? '#ffe9a8' : '#bfe3f5', 1.5);
    g.beginPath(); g.moveTo(-64, -34); g.quadraticCurveTo(0, -66, 64, -34); g.lineTo(64, -29); g.quadraticCurveTo(0, -59, -64, -29); g.closePath(); g.fillStyle = '#3fae7a'; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(64, -34); g.lineTo(74, -39); g.quadraticCurveTo(10, -72, -54, -41); g.stroke();
    box(-10, -16, 20, 16, '#4a3b30', 3);
    box(-27, -56, 54, 15, '#fffdf6', 4);
    g.save(); g.fillStyle = INK; g.font = '700 11px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('大宮 OMIYA', 0, -48); g.restore();
    if (n > 0.2) lights.push([0, -22, 70, '255,215,140']);
  },
  museum(b, n) {
    ell(4, 3, 70, 10, SH);
    const wall = '#f1e5cf';
    box(-54, -34, 108, 34, wall);
    poly([[54, 0], [64, -6], [64, -40], [54, -34]], shade(wall, -0.2));
    g.beginPath(); g.moveTo(-58, -34); g.quadraticCurveTo(-29, -76, 0, -34); g.quadraticCurveTo(29, -76, 58, -34); g.closePath(); g.fillStyle = '#d9544a'; g.fill(); g.stroke();
    for (const x of [-40, -12, 16, 38]) box(x - 5, -28, 10, 12, win(n), 1.5);
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-9, -12); g.quadraticCurveTo(0, -22, 9, -12); g.lineTo(9, 0); g.closePath(); g.fillStyle = '#4a3b30'; g.fill(); g.stroke();
    // a steam locomotive on a short track out front
    g.save(); g.lineWidth = 2; g.strokeStyle = '#6b6672'; g.beginPath(); g.moveTo(-52, 16); g.lineTo(52, 16); g.stroke(); g.restore();
    const lc = '#2d2a32';
    box(-34, 2, 48, 12, lc, 4); box(8, -6, 22, 20, '#3a3640', 3); box(5, -9, 28, 4, '#d9544a', 1);
    box(-28, -6, 7, 10, lc, 1); g.beginPath(); g.moveTo(-31, -6); g.lineTo(-18, -6); g.stroke();
    ell(-24, 2, 4, 4, '#5b5662', true);
    for (const x of [-26, -10, 8, 24]) { ell(x, 15, 4.2, 4.2, '#d9544a', true); }
    const ph = (time * 0.8) % 1;
    for (let i = 0; i < 3; i++) { const q = (ph + i / 3) % 1; g.globalAlpha = 0.85 * (1 - q); ell(-25 + q * 10, -12 - q * 26, 4 + q * 5, 4 + q * 4, '#ffffff', true); }
    g.globalAlpha = 1;
    if (n > 0.2) lights.push([0, -20, 70, '255,210,140']);
  },
  bonsai(b, n) {
    ell(4, 3, 50, 8, SH);
    box(-44, -7, 88, 7, '#cdbb9a', 2);
    box(-44, -2, 88, 2, '#b3a07e', 0.5);
    for (const [x, s] of [[-28, 0.9], [0, 1.15], [28, 0.95]]) {
      box(x - 9 * s, -16 * s - 5, 18 * s, 9 * s, '#b9714b', 2);
      g.save(); g.lineWidth = 3.4; g.strokeStyle = '#6b4a30'; g.beginPath(); g.moveTo(x, -16 * s - 5); g.quadraticCurveTo(x - 6 * s, -26 * s - 5, x + 3 * s, -34 * s - 5); g.stroke(); g.restore();
      ell(x - 1 * s, -38 * s - 5, 14 * s, 8.5 * s, '#4fa34d', true); ell(x - 9 * s, -32 * s - 5, 8 * s, 5.5 * s, '#5fb85b', true); ell(x + 10 * s, -34 * s - 5, 8 * s, 5.5 * s, '#5fb85b', true);
    }
    box(-6, -62, 12, 8, '#fffdf6', 2);
    if (n > 0.3) lights.push([0, -20, 50, '255,230,170']);
  },
  belltower(b, n) {
    ell(4, 2, 34, 6, SH);
    box(-16, -9, 32, 9, '#cfc7b6', 1.5);
    box(-12, -48, 24, 40, '#8a5a34', 1);
    for (const y of [-40, -28, -16]) box(-4, y, 8, 7, win(n), 1);
    poly([[-20, -48], [20, -48], [12, -60], [-12, -60]], '#4a5560');
    box(-9, -82, 18, 22, '#a06a3d', 1);
    g.beginPath(); g.arc(0, -70, 5, Math.PI, 0); g.lineTo(5, -64); g.lineTo(-5, -64); g.closePath(); g.fillStyle = '#e0b440'; g.fill(); g.stroke();
    poly([[-15, -82], [15, -82], [0, -100]], '#4a5560');
    g.beginPath(); g.moveTo(0, -100); g.lineTo(0, -108); g.stroke(); ell(0, -109, 2.2, 2.2, '#ffc93c', true);
    if (n > 0.3) lights.push([0, -64, 40, '255,220,150']);
  },
  dcastle(b, n) {
    ell(4, 2, 56, 9, SH);
    box(-52, -26, 104, 26, '#ffe9f1');
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-9, -12); g.quadraticCurveTo(0, -24, 9, -12); g.lineTo(9, 0); g.closePath(); g.fillStyle = '#7a4e6a'; g.fill(); g.stroke();
    const tower = (x, w, h, roofH, c) => { box(x - w / 2, -26 - h, w, h, '#ffd9e6'); poly([[x - w / 2 - 3, -26 - h], [x + w / 2 + 3, -26 - h], [x, -26 - h - roofH]], c); };
    tower(-38, 20, 36, 34, '#4aa3e0'); tower(38, 20, 36, 34, '#4aa3e0'); tower(-18, 14, 54, 30, '#5bb4ee'); tower(18, 14, 54, 30, '#5bb4ee');
    tower(0, 24, 78, 44, '#2f8ad0');
    g.beginPath(); g.moveTo(0, -148); g.lineTo(0, -160); g.stroke(); poly([[0, -160], [11, -156], [0, -152]], '#e8503a');
    for (const [x, y] of [[0, -62], [-18, -48], [18, -48], [-38, -44], [38, -44]]) box(x - 2.5, y, 5, 8, win(n), 2);
    ell(0, -126, 3, 3, '#ffc93c', true);
    if (n > 0.2) { lights.push([0, -90, 90, '255,170,230']); lights.push([0, -60, 70, '120,190,255']); }
  },
};
function drawBuilding(b) {
  const X = sx(b.x); const Y = sy(b.y + 6);
  if (!onScreen(X, Y, 170 * cam.z)) { b.hit = null; return; }
  const k = cam.z; lw = Math.max(1.3 / k, 2);
  g.save(); g.translate(X, Y); g.scale(k, k);
  g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK;
  (DRAW[b.kind.k] || DRAW.shop)(b, env.n);
  if (b.p.type === 'sight') {
    const by = -b.hh - 12 + Math.sin(time * 2 + b.idx) * 1.5;
    g.beginPath(); g.arc(0, by, 11, 0, TAU); g.fillStyle = '#fffdf6'; g.fill(); g.stroke(); emoji(b.p.emoji, 0, by + 1, 13);
  }
  if (selId === b.id) { g.globalAlpha = 0.9; g.strokeStyle = '#ffc93c'; g.lineWidth = 4; g.beginPath(); g.ellipse(4, 3, b.w * 0.62, 11 + Math.sin(time * 5) * 1.2, 0, 0, TAU); g.stroke(); }
  g.restore();
  b.hit = { x: X - (b.w / 2) * k, y: Y - b.hh * k - 8 * k, w: b.w * k, h: (b.hh + 14) * k };
  flushLights(X, Y, k);
}

/* ---------- city fabric ---------- */
function drawLot(l) {
  const X = sx(l.x); const Y = sy(l.y); const k = cam.z;
  if (X < -60 || X > W + 60 || Y < -l.h * k - 30 || Y > H + 30) return;
  const w = l.w; const h = l.h; const d = 9;
  if (k < 0.3) {
    g.fillStyle = l.wall; g.fillRect(X - (w / 2) * k, Y - h * k, w * k, h * k);
    g.fillStyle = shade(l.wall, -0.22); g.fillRect(X + (w / 2) * k, Y - h * k - 4 * k, d * k, h * k);
    g.fillStyle = l.roof; g.fillRect(X - (w / 2) * k, Y - h * k - 3 * k, w * k + d * k, 3 * k);
    return;
  }
  g.save(); g.translate(X, Y); g.scale(k, k); g.lineWidth = Math.max(1.1 / k, 1.5); g.lineJoin = 'round'; g.strokeStyle = INK;
  const n = env.n;
  box(-w / 2, -h, w, h, l.wall, 1);
  poly([[w / 2, 0], [w / 2 + d, -5], [w / 2 + d, -h - 5], [w / 2, -h]], shade(l.wall, -0.22));
  poly([[-w / 2, -h], [w / 2, -h], [w / 2 + d, -h - 5], [-w / 2 + d, -h - 5]], l.tall ? shade(l.wall, 0.12) : l.roof);
  if (k > 0.42) {
    const ww = 4; const wh = 4;
    for (let y = -h + 7; y < -9; y += wh + 5) for (let x = -w / 2 + 4; x < w / 2 - 5; x += ww + 3.5) {
      const lit = n > 0.25 && (((x * 5 + y * 3 + l.id * 7) | 0) & 3) !== 0;
      g.fillStyle = lit ? '#ffd873' : l.tall ? '#8fb4d0' : '#c8dce8'; g.fillRect(x, y, ww, wh);
    }
    box(-3, -9, 6, 9, '#6b5a4c', 1);
  }
  if (l.tall && n > 0.3 && k > 0.35 && l.id % 4 === 0) lights.push([0, -h / 2, 36, '255,220,140']);
  g.restore(); flushLights(X, Y, k);
}
function drawHouse(h) {
  const X = sx(h.x); const Y = sy(h.y); const k = cam.z; if (!onScreen(X, Y, 40 * k)) return;
  g.save(); g.translate(X, Y); g.scale(k, k); g.lineWidth = Math.max(1.1 / k, 1.6); g.lineJoin = 'round'; g.strokeStyle = INK;
  const w = h.w; const hh = h.h;
  box(-w / 2, -hh, w, hh, h.wall, 1.5);
  poly([[-w / 2 - 4, -hh + 1], [w / 2 + 4, -hh + 1], [w / 2 - 3, -hh - 9], [-w / 2 + 3, -hh - 9]], h.roof);
  box(-2.5, -7, 5, 7, '#7a4e32', 1);
  g.restore();
}
function drawTree(t) {
  const X = sx(t.x); const Y = sy(t.y); if (!onScreen(X, Y, 50)) return;
  const k = cam.z * t.s; g.save(); g.translate(X, Y); g.scale(k, k);
  g.lineWidth = Math.max(1.2 / k, 1.8); g.strokeStyle = INK; g.lineJoin = 'round';
  ell(2, 1, 11, 4, 'rgba(0,0,0,.16)');
  box(-2.2, -11, 4.4, 11, '#8a5a32');
  const col = t.c < 0.55 ? '#6cc070' : t.c < 0.78 ? '#4fae6b' : t.c < 0.92 ? '#ffb3c7' : '#ff9a3c';
  ell(0, -20, 11, 10, col, true); ell(-5, -17, 6, 5.5, shade(col, 0.25));
  g.restore();
}
function drawHill(h) {
  const X = sx(h.x); const Y = sy(h.y); const w = h.w * cam.z; const hh = h.hgt * cam.z; if (X + w < 0 || X - w > W || Y - hh > H || Y + 14 < 0) return;
  g.lineWidth = Math.max(1.4, 2.4 * cam.z); g.lineJoin = 'round'; g.strokeStyle = INK;
  const px = X + h.lean * w; const py = Y - hh;
  g.beginPath(); g.moveTo(X - w / 2, Y); g.quadraticCurveTo(X - w * 0.2, Y - hh * 0.6, px, py); g.quadraticCurveTo(X + w * 0.2, Y - hh * 0.55, X + w / 2, Y); g.closePath(); g.fillStyle = h.c; g.fill();
  g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(X + w * 0.2, Y - hh * 0.55, X + w / 2, Y); g.lineTo(X + w * 0.02, Y); g.quadraticCurveTo(px + w * 0.02, Y - hh * 0.5, px, py); g.closePath(); g.fillStyle = shade(h.c, -0.14); g.fill();
  if (h.snow) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + w * 0.11, py + hh * 0.22); g.lineTo(px + w * 0.04, py + hh * 0.18); g.lineTo(px - w * 0.02, py + hh * 0.27); g.lineTo(px - w * 0.07, py + hh * 0.2); g.lineTo(px - w * 0.12, py + hh * 0.26); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); }
  g.beginPath(); g.moveTo(X - w / 2, Y); g.quadraticCurveTo(X - w * 0.2, Y - hh * 0.6, px, py); g.quadraticCurveTo(X + w * 0.2, Y - hh * 0.55, X + w / 2, Y); g.stroke();
}

/* ---------- people ---------- */
function drawPerson(p) {
  const X = sx(p.x); const Y = sy(p.y); if (!onScreen(X, Y, 60)) return;
  const k = Math.max(cam.z, 0.5) * p.k; g.save(); g.translate(X, Y); g.scale(k, k);
  g.lineWidth = Math.max(1.1 / k, 1.6); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  const sw = p.moving ? Math.sin(p.ph) * 4 : 0; const bob = p.moving ? -Math.abs(Math.sin(p.ph)) * 1.6 : Math.sin(time * 2 + p.id) * 0.4;
  ell(0, 0, 8, 3, 'rgba(0,0,0,.2)');
  const f = p.face; const uni = p.outfit === 'uniform'; const kim = p.outfit === 'kimono'; const hak = p.outfit === 'hakama'; const suit = p.outfit === 'suit';
  const SK = '#ffdcb8';
  const sc = SUITS[p.col % SUITS.length];
  const top = uni ? '#1d3a6e' : suit ? sc : kim ? KIMONO[p.col % KIMONO.length] : '#2d3a5a';
  if (kim || hak) {
    // traditional dress: white tabi socks on wooden geta, long skirt hides the legs
    box(-5 + sw, -2.6, 4.6, 2.6, '#f4efe6', 1); box(0.4 - sw, -2.6, 4.6, 2.6, '#f4efe6', 1);
    g.save(); g.fillStyle = '#8a5a34'; g.fillRect(-4 + sw, 0, 1.4, 1.6); g.fillRect(-1.4 + sw, 0, 1.4, 1.6); g.fillRect(1.4 - sw, 0, 1.4, 1.6); g.fillRect(3.6 - sw, 0, 1.4, 1.6); g.restore();
  } else {
    g.save(); g.lineWidth = 3.6; g.strokeStyle = uni ? '#14284d' : shade(sc, -0.25);
    g.beginPath(); g.moveTo(-2.6, -9 + bob); g.lineTo(-2.6 + sw, -0.5); g.moveTo(2.6, -9 + bob); g.lineTo(2.6 - sw, -0.5); g.stroke(); g.restore();
    if (suit) { ell(-2.6 + sw, 0.2, 3, 1.6, '#1c1a22'); ell(2.6 - sw, 0.2, 3, 1.6, '#1c1a22'); }
  }
  let armC = shade(top.length === 7 ? top : '#888888', -0.3);
  if (kim) {
    const obi = OBI[p.col % OBI.length]; const hem = sw * 0.35;
    poly([[-5.5, -21 + bob], [5.5, -21 + bob], [7 + hem, -2], [-7 + hem, -2]], top);
    g.save(); g.fillStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0;
    [[-3, -8], [2.5, -5], [-1, -3.5], [3.5, -11]].forEach((d) => { g.beginPath(); g.arc(d[0], d[1] + bob * 0.3, 1.1, 0, TAU); g.fill(); }); g.restore();
    poly([[-2.4, -21 + bob], [2.4, -21 + bob], [0, -14 + bob]], '#fffaf0');
    box(-6.2, -15 + bob, 12.4, 5, obi, 1); box(f > 0 ? -10 : 5.5, -16 + bob, 4.6, 7, shade(obi, -0.1), 1.5);
  } else if (hak) {
    poly([[-5.5, -12 + bob], [5.5, -12 + bob], [8 + sw * 0.3, -2], [-8 + sw * 0.3, -2]], HAKAMA[p.col % HAKAMA.length]);
    g.save(); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-1.8, -11.5 + bob); g.lineTo(-2.6 + sw * 0.1, -2.5); g.moveTo(1.8, -11.5 + bob); g.lineTo(2.6 + sw * 0.1, -2.5); g.stroke(); g.restore();
    box(-6, -21 + bob, 12, 10, top, 3.5);
    poly([[-2.4, -21 + bob], [2.4, -21 + bob], [0, -14 + bob]], '#fffaf0');
    box(-5.8, -13.2 + bob, 11.6, 2.2, '#e8e2d2', 0.8);
    g.save(); g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(-3.2, -18 + bob, 0.9, 0, TAU); g.arc(3.2, -18 + bob, 0.9, 0, TAU); g.fill(); g.restore();
  } else {
    box(-6, -21 + bob, 12, 13, top, 4.5);
    // white shirt, collar, neat tie and jacket lapels
    poly([[-2.6, -21 + bob], [2.6, -21 + bob], [0, -12 + bob]], '#ffffff');
    const tc = TIES[(p.col * 5 + 2) % TIES.length];
    if (uni) { g.save(); g.fillStyle = '#ffc93c'; g.fillRect(-5.5, -11 + bob, 11, 2); g.beginPath(); g.arc(-2, -17 + bob, 1.1, 0, TAU); g.arc(2, -17 + bob, 1.1, 0, TAU); g.fill(); g.restore(); }
    else {
      poly([[-0.9, -20 + bob], [0.9, -20 + bob], [0.7, -18.2 + bob], [-0.7, -18.2 + bob]], tc);
      poly([[-0.8, -18.2 + bob], [0.8, -18.2 + bob], [1.5, -12 + bob], [0, -10.5 + bob], [-1.5, -12 + bob]], tc);
      g.save(); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-2.6, -21 + bob); g.lineTo(-3.6, -13 + bob); g.moveTo(2.6, -21 + bob); g.lineTo(3.6, -13 + bob); g.stroke(); g.restore();
    }
  }
  // arms: sleeves of the jacket, haori or the wide kimono sleeve
  g.save(); g.lineWidth = 3; g.strokeStyle = armC;
  g.beginPath(); g.moveTo(-6, -18 + bob); g.lineTo(-8, -12 + bob - sw * 0.3); g.moveTo(6, -18 + bob); g.lineTo(8, -12 + bob + sw * 0.3); g.stroke(); g.restore();
  if (kim) {
    poly([[-5.8, -20 + bob], [-10.5, -18 + bob], [-11 + sw * 0.1, -8 + bob - sw * 0.2], [-6.2, -11 + bob]], shade(top, 0.05));
    poly([[5.8, -20 + bob], [10.5, -18 + bob], [11 + sw * 0.1, -8 + bob + sw * 0.2], [6.2, -11 + bob]], shade(top, 0.05));
  } else {
    ell(-8, -11 + bob - sw * 0.3, 2.2, 2.2, uni ? '#ffffff' : SK); ell(8, -11 + bob + sw * 0.3, 2.2, 2.2, uni ? '#ffffff' : SK);
  }
  if (suit && p.col % 2 === 0) box(f * 8 - 4, -8 + bob + sw * 0.3, 8, 6, '#6b4a30', 1.5);
  const hy = -28 + bob;
  ell(0, hy, 7.6, 7.6, SK, true);
  g.beginPath(); g.arc(0, hy, 7.8, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fillStyle = p.hair; g.fill(); g.stroke();
  if (p.style === 1 && !kim) ell(-f * 8, hy - 3, 3.4, 5, p.hair, true);
  if (kim) { ell(0, hy - 9, 3.8, 3.2, p.hair, true); ell(f * 3, hy - 9.5, 1.7, 1.7, '#ff7aa2', true); }
  if (uni) { box(-9, hy - 12, 18, 6, '#1d3a6e', 2); box(-9, hy - 8, 18, 2.5, '#ffc93c', 0.5); box(f > 0 ? 0 : -11, hy - 6.5, 11, 2.5, '#14284d', 1); }
  g.fillStyle = INK; g.beginPath(); g.arc(f * 2.2 - 2.4, hy + 0.5, 1.2, 0, TAU); g.arc(f * 2.2 + 2.4, hy + 0.5, 1.2, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,120,120,.45)'; g.beginPath(); g.arc(f * 2.2 - 4.6, hy + 3, 1.7, 0, TAU); g.arc(f * 2.2 + 4.6, hy + 3, 1.7, 0, TAU); g.fill();
  if (p.eatT > 0 && p.eatEmoji) emoji(p.eatEmoji, f * 10, -15 + bob + Math.sin(time * 6) * 1.5, 11);
  g.restore();
  p.sx = X; p.sy = Y; p.sk = k;
}

function drawClouds() {
  for (const c of clouds) {
    if (!paused) { c.x += c.v * lastDt; if (c.x > 2400) c.x = -2300; }
    const X = sx(c.x); const Y = sy(c.y, 130); const k = cam.z * c.s; if (!onScreen(X, Y, 120 * k)) continue;
    const SY = sy(c.y);
    g.fillStyle = 'rgba(0,50,80,.1)'; g.beginPath(); g.ellipse(X, SY + 20 * k, 50 * k, 12 * k, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath();
    g.arc(X - 28 * k, Y, 18 * k, 0, TAU); g.arc(X, Y - 10 * k, 24 * k, 0, TAU); g.arc(X + 28 * k, Y, 19 * k, 0, TAU); g.rect(X - 28 * k, Y, 56 * k, 18 * k);
    g.fill();
  }
}

/* ---------- ground layer ---------- */
const ROAD_GROUPS = (() => { const m = new Map(); for (const s of SEGS) { if (!m.has(s[4])) m.set(s[4], []); m.get(s[4]).push(s); } return m; })();
const SEA_X0 = -310;
function drawGround() {
  const z = cam.z; g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = '#bfe6f7'; g.fillRect(0, 0, W, H);
  // the floating slab
  const depth = 50; const fx0 = sx(WD.x0); const fx1 = sx(WD.x1); const fy0 = sy(WD.y1); const fy1 = sy(WD.y1, -depth);
  g.lineWidth = 3 * Math.max(z, 0.6); g.strokeStyle = INK;
  g.fillStyle = '#b98f63'; g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0); g.fillStyle = '#a57d52'; g.fillRect(fx0, fy0 + (fy1 - fy0) * 0.55, fx1 - fx0, (fy1 - fy0) * 0.45);
  const sx0 = sx(SEA_X0); g.fillStyle = '#3d98ba'; g.fillRect(sx0, fy0, fx1 - sx0, fy1 - fy0); g.fillStyle = '#2f86a8'; g.fillRect(sx0, fy0 + (fy1 - fy0) * 0.55, fx1 - sx0, (fy1 - fy0) * 0.45);
  g.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  g.beginPath(); rectPath(WD.x0, WD.y0, WD.x1, WD.y1, 0); g.fillStyle = '#a5db86'; g.fill(); g.stroke();
  g.save(); g.beginPath(); rectPath(WD.x0, WD.y0, WD.x1, WD.y1, 0); g.clip();
  // grass tufts
  g.strokeStyle = '#7fbf63'; g.lineWidth = Math.max(1, 1.6 * z); g.beginPath();
  for (const t of tufts) {
    const X = sx(t.x); const Y = sy(t.y); if (!onScreen(X, Y, 20)) continue; const s = 5 * z * t.s;
    g.moveTo(X - s, Y); g.lineTo(X - s * 0.6, Y - s * 1.2); g.moveTo(X, Y); g.lineTo(X, Y - s * 1.5); g.moveTo(X + s, Y); g.lineTo(X + s * 0.6, Y - s * 1.2);
  }
  g.stroke();
  // parks and the palace with its moat
  g.lineWidth = Math.max(1.2, 2 * z); g.strokeStyle = INK;
  for (const pk of GEO.parks) { g.beginPath(); ellPath(pk.x, pk.y, pk.rx, pk.ry); g.fillStyle = '#8fd47f'; g.fill(); g.setLineDash([10 * z, 7 * z]); g.strokeStyle = '#4f9a58'; g.stroke(); g.setLineDash([]); }
  const pl = GEO.palace;
  g.beginPath(); ellPath(pl.x, pl.y, pl.rx + 16, pl.ry + 14); g.fillStyle = '#58b9d6'; g.fill(); g.strokeStyle = INK; g.stroke();
  g.beginPath(); ellPath(pl.x, pl.y, pl.rx, pl.ry); g.fillStyle = '#c8e3a6'; g.fill(); g.stroke();
  g.beginPath(); ellPath(pl.x, pl.y, pl.rx - 18, pl.ry - 14); g.fillStyle = '#e4e0cc'; g.fill(); g.stroke();
  // river
  g.lineCap = 'butt'; g.beginPath(); GEO.river.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1]))));
  g.strokeStyle = INK; g.lineWidth = (GEO.RIVER_W + 7) * z; g.stroke(); g.strokeStyle = '#58b9d6'; g.lineWidth = GEO.RIVER_W * z; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = Math.max(1, 2 * z); g.setLineDash([14 * z, 30 * z]); g.lineDashOffset = -time * 12 * z; g.stroke(); g.setLineDash([]); g.lineCap = 'round';
  // the bay
  g.beginPath(); GEO.sea.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1])))); g.closePath();
  g.strokeStyle = '#f1e2b8'; g.lineWidth = 26 * z; g.stroke();
  g.fillStyle = '#58b9d6'; g.fill(); g.strokeStyle = INK; g.lineWidth = Math.max(1.2, 2.2 * z); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = Math.max(1, 2 * z); g.beginPath();
  for (const w of waves) {
    const X = sx(w.x + Math.sin(time * 0.5 + w.y) * 6); const Y = sy(w.y); if (!onScreen(X, Y, 20)) continue;
    g.moveTo(X - 8 * z * w.s, Y); g.quadraticCurveTo(X, Y - 4 * z * w.s, X + 8 * z * w.s, Y);
  }
  g.stroke();
  // islands: Odaiba, Disney
  for (const isl of [GEO.odaiba, GEO.disney]) {
    g.beginPath(); ellPath(isl.x, isl.y, isl.rx + 12, isl.ry + 10); g.fillStyle = '#f1e2b8'; g.fill(); g.strokeStyle = INK; g.stroke();
    g.beginPath(); ellPath(isl.x, isl.y, isl.rx, isl.ry); g.fillStyle = '#a5db86'; g.fill(); g.stroke();
  }
  g.beginPath(); ellPath(GEO.disney.x, GEO.disney.y + 4, GEO.disney.rx - 40, GEO.disney.ry - 24); g.fillStyle = '#ffd6e6'; g.fill(); g.setLineDash([10 * z, 7 * z]); g.strokeStyle = '#d77aa0'; g.stroke(); g.setLineDash([]);
  // Haneda airport
  const A = GEO.haneda;
  g.beginPath(); rectPath(A.x - 24, A.y - A.h / 2 - 12, A.x + A.w, A.y + A.h / 2 + 12, 0); g.fillStyle = '#f1e2b8'; g.fill(); g.strokeStyle = INK; g.stroke();
  g.beginPath(); rectPath(A.x - 12, A.y - A.h / 2, A.x + A.w - 12, A.y + A.h / 2, 0); g.fillStyle = '#9a98a6'; g.fill(); g.stroke();
  g.beginPath(); rectPath(A.x + 10, A.y - 6, A.x + A.w - 20, A.y + 12, 0); g.fillStyle = '#55525e'; g.fill(); g.stroke();
  g.strokeStyle = '#fffdf6'; g.lineWidth = Math.max(1, 2 * z); g.setLineDash([12 * z, 10 * z]); g.beginPath(); g.moveTo(sx(A.x + 16), sy(A.y + 3)); g.lineTo(sx(A.x + A.w - 26), sy(A.y + 3)); g.stroke(); g.setLineDash([]);
  g.restore();
  // blocks
  const BC = ['#eae2cf', '#dfe0e6', '#e6ddc4'];
  for (const b of blocks) {
    const X0 = sx(b.x0); const X1 = sx(b.x1); const Y0 = sy(b.y0); const Y1 = sy(b.y1); if (X1 < -4 || X0 > W + 4 || Y1 < -4 || Y0 > H + 4) continue;
    rr(X0, Y0, X1 - X0, Y1 - Y0, 5 * z); g.fillStyle = b.kind === 1 ? '#9ad98a' : BC[Math.abs((b.x0 * 7 + b.y0 * 3) | 0) % 3]; g.fill();
  }
  // roads
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const [w, segs] of ROAD_GROUPS) {
      g.beginPath(); for (const s of segs) { g.moveTo(sx(s[0]), sy(s[1])); g.lineTo(sx(s[2]), sy(s[3])); }
      g.strokeStyle = pass ? '#7b7886' : INK; g.lineWidth = (pass ? w : w + 4.5) * z; g.stroke();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, 1.8 * z); g.setLineDash([14 * z, 14 * z]); g.beginPath();
  for (const s of SEGS) if (s[4] >= 26) { g.moveTo(sx(s[0]), sy(s[1])); g.lineTo(sx(s[2]), sy(s[3])); }
  g.stroke(); g.setLineDash([]);
  // bridges over the Sumida
  for (const br of BRIDGES) {
    const x0 = br.x0; const x1 = br.x1; const hw = br.w / 2 + 3;
    g.beginPath(); rectPath(x0 + 20, br.y - hw, x1 - 20, br.y + hw, 0); g.fillStyle = '#b9bcc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = Math.max(1.2, 2.2 * z); g.stroke();
    g.beginPath(); g.moveTo(sx(x0 + 20), sy(br.y)); g.lineTo(sx(x1 - 20), sy(br.y)); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1, 1.8 * z); g.setLineDash([10 * z, 10 * z]); g.stroke(); g.setLineDash([]);
  }
  // lanes from every door to the street
  g.strokeStyle = '#d9d3c4'; g.lineWidth = 9 * z; g.lineCap = 'butt'; g.beginPath();
  for (const b of buildings) b.lane.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1]))));
  g.stroke(); g.lineCap = 'round';
  // plazas under the outer landmarks
  g.lineWidth = Math.max(1.2, 2 * z); g.setLineDash([10 * z, 7 * z]);
  for (const b of buildings) {
    if (b.dist !== 'trip' && b.dist !== 'saitama' && b.id !== 'disney' && b.id !== 'odaiba') continue; const c = DIST[b.dist].c;
    g.beginPath(); ellPath(b.x, b.y + 8, b.id === 'fuji' ? 190 : 70, b.id === 'fuji' ? 46 : 28); g.fillStyle = mix(c, '#ffffff', 0.65); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; g.strokeStyle = shade(c, -0.25); g.stroke();
  }
  g.setLineDash([]);
}

/* ---------- the statics list: sorted by y and merged with moving things each frame ---------- */
const statics = [];
// teleport portal, in a quiet park
const PORTAL = (() => {
  const cands = GEO.parks.filter((p) => ['hama', 'shiba', 'gyoen'].includes(p.id)).map((p) => [p.x, p.y + 6]);
  cands.push([-480, 150], [150, 560]);
  let best = cands[0]; let bd = -1;
  for (const [x, y] of cands) {
    if (inWaterAt(x, y, 10)) continue;
    const d = Math.min(...buildings.map((b) => Math.hypot(b.x - x, (b.y - y) * 1.3)), railDist(x, y) * 1.2);
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return { x: best[0], y: best[1] };
})();
for (let i = trees.length - 1; i >= 0; i--) if (Math.hypot(trees[i].x - PORTAL.x, (trees[i].y - PORTAL.y) * 1.3) < 50) trees.splice(i, 1);
for (let i = lots.length - 1; i >= 0; i--) if (Math.hypot(lots[i].x - PORTAL.x, (lots[i].y - PORTAL.y) * 1.3) < 60) lots.splice(i, 1);
if (window.TELE) statics.push({ y: PORTAL.y, f: () => window.TELE.draw(g, sx(PORTAL.x), sy(PORTAL.y), cam.z, time, env.n) });
buildings.forEach((b) => statics.push({ y: b.y + 6, f: () => drawBuilding(b) }));
lots.forEach((l) => statics.push({ y: l.y, f: () => drawLot(l) }));
trees.forEach((t) => statics.push({ y: t.y, f: () => drawTree(t) }));
houses.forEach((h) => statics.push({ y: h.y, f: () => drawHouse(h) }));
hills.forEach((h) => statics.push({ y: h.y, f: () => drawHill(h) }));
