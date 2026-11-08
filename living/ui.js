'use strict';
/* ui.js: people & dialogue, traffic, overlays, render loop, input, cards, panels, planner, intro, start-up. */

// tiny DOM builder (all text goes in through textContent)
function elt(tag, o, ...kids) {
  const e = document.createElement(tag);
  if (o) for (const k of Object.keys(o)) {
    if (k === 'class') e.className = o[k];
    else if (k === 'style') e.style.cssText = o[k];
    else if (k.startsWith('on')) e[k] = o[k];
    else e.setAttribute(k, o[k]);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

/* ================= effects, speech, journal ================= */
const fx = [];
function heart(p, ch) { for (let i = 0; i < 3; i++) fx.push({ x: p.x + (Math.random() - 0.5) * 14, y: p.y, z: 26, vz: 22 + Math.random() * 16, life: 1.4, ch: ch || '💛' }); }
function say(p, text, dur) { p.say = text; p.sayT = dur || 5; }

const logsEl = $('logs');
let lastLogAt = 0;
// tpl comes from strings.js and may contain <b>..</b>; values are inserted as plain text
function addLog(tpl, vars, cls, force) {
  const now = performance.now();
  if (!force && now - lastLogAt < 900) return;
  lastLogAt = now;
  const d = elt('div', cls ? { class: cls } : null);
  tpl.split(/(<b>.*?<\/b>)/).forEach((seg) => {
    const m = seg.match(/^<b>(.*)<\/b>$/);
    if (m) d.append(elt('b', null, fill(m[1], vars || {}))); else if (seg) d.append(fill(seg, vars || {}));
  });
  logsEl.prepend(d);
  while (logsEl.children.length > 40) logsEl.lastChild.remove();
}

function decree() {
  const r = Math.random(); let text;
  if (r < 0.45) text = fill(pick(tx('declFood')), { s: nameOf(pick(buildings.filter((x) => x.p.type === 'food')).p) });
  else if (r < 0.75) text = fill(pick(tx('declSight')), { s: nameOf(pick(buildings.filter((x) => x.p.type === 'sight')).p) });
  else text = pick(tx('declGen'));
  say(master, text, 7);
  $('decreeTx').textContent = text; delete $('decreeTx').dataset.first;
  addLog(tx('logDecree'), { t: text }, 'own', true);
}

function arrive(p) {
  if (p.target === 'place') {
    const b = buildings[p.to]; p.wait = 4 + Math.random() * 6;
    const isFood = b.p.type === 'food';
    say(p, fill(pick(tx(isFood ? 'eatFood' : 'seeSight')), { s: nameOf(b.p) }), 4);
    heart(p, isFood ? '💛' : '✨');
    p.eatEmoji = b.p.emoji; p.eatT = p.wait * 0.8;
    if (p.owner || Math.random() < 0.4) addLog(tx(isFood ? 'logEat' : 'logSee'), { n: personName(p), s: nameOf(b.p), e: b.p.emoji });
  } else p.wait = 2 + Math.random() * 3;
}
function nextTarget(p) {
  if (p.owner && Math.random() >= 0.7) {
    const [nx, ny] = NODES[Math.floor(Math.random() * GRID_NODES)]; p.target = 'spot'; p.to = undefined; p.path = findPath(p.x, p.y, nx, ny);
  } else {
    let n; do { n = pickPlace(); } while (n === p.to);
    goPlace(p, n);
  }
}
function updatePeople(dt, tm) {
  for (const p of people) {
    if (p.sayT > 0) p.sayT -= dt;
    if (p.eatT > 0) p.eatT -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (p.replyAt && tm > p.replyAt) { say(p, p.replyTxt, 4); p.replyAt = 0; }
    if (p.wait > 0) { p.wait -= dt; p.moving = false; if (p.wait <= 0) nextTarget(p); continue; }
    if (!p.path.length) { nextTarget(p); continue; }
    const [tx_, ty_] = p.path[0];
    const dx = tx_ - p.x; const dy = ty_ - p.y; const d = Math.hypot(dx, dy); const step = p.v * dt;
    if (d <= step) { p.x = tx_; p.y = ty_; p.path.shift(); p.moving = false; if (!p.path.length) arrive(p); }
    else {
      p.x += (dx / d) * step; p.y += (dy / d) * step;
      if (Math.abs(dx) > 0.2) p.face = dx > 0 ? 1 : -1;
      p.ph += dt * 9 * (p.v / 40); p.moving = true;
    }
  }
  master.decT -= dt;
  if (master.decT <= 0) { decree(); master.decT = 20 + Math.random() * 14; }
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.z += f.vz * dt; if (f.life <= 0) fx.splice(i, 1); }
}
function chatter(tm) {
  for (let i = 0; i < people.length; i++) {
    const a = people[i]; if (a.cool > 0 || a.sayT > 0) continue;
    for (let j = i + 1; j < people.length; j++) {
      const b = people[j]; if (b.cool > 0 || b.sayT > 0) continue;
      if (Math.hypot(a.x - b.x, (a.y - b.y) * 1.4) < 24 && Math.random() < 0.4) {
        const place = nameOf(pick(buildings).p);
        say(a, fill(pick(tx('greet')), { n: personName(b), s: place }), 4.5);
        b.replyAt = tm + 1.6; b.replyTxt = fill(pick(tx('reply')), { s: place });
        a.cool = b.cool = 14; a.wait = Math.max(a.wait, 3.5); b.wait = Math.max(b.wait, 3.5); a.moving = b.moving = false;
        addLog(tx('logChat'), { n: personName(a), m: personName(b) });
        break;
      }
    }
  }
}

/* ================= traffic (cars keep to the left) ================= */
function updateCars(dt) {
  for (const c of cars) {
    const a = NODES[c.from]; const b = NODES[c.to]; if (!a || !b) continue;
    let len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    c.t += (c.v * dt) / len;
    while (c.t >= 1) {
      c.t -= 1; const prev = c.from; c.from = c.to;
      const all = ADJ[c.from].filter((e) => e[0] < GRID_NODES); const opts = all.filter((e) => e[0] !== prev);
      const pool = opts.length ? opts : all; c.to = pool.length ? pool[Math.floor(Math.random() * pool.length)][0] : prev;
    }
    const A = NODES[c.from]; const B = NODES[c.to]; len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const dx = (B[0] - A[0]) / len; const dy = (B[1] - A[1]) / len;
    c.x = A[0] + (B[0] - A[0]) * c.t + dy * 4.5; c.y = A[1] + (B[1] - A[1]) * c.t - dx * 4.5; c.ang = Math.atan2(dy, dx);
  }
}
function ell2(x, y, rx, ry, c) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = c; g.fill(); }
function drawCar(c) {
  if (cam.z < 0.28) return;
  const X = sx(c.x); const Y = sy(c.y); if (!onScreen(X, Y, 40)) return;
  g.save(); g.strokeStyle = INK; g.lineWidth = Math.max(1, 1.5 * cam.z);
  ell2(X, Y + cam.z, 9 * cam.z, 3.6 * cam.z, 'rgba(0,0,0,.2)');
  obox(c.x, c.y, c.ang, 15, 7.5, 1, 5.5, shade(c.c, 0.12), c.c);
  const co = Math.cos(c.ang); const si = Math.sin(c.ang);
  obox(c.x - co, c.y - si, c.ang, 8, 6.5, 5.5, 9.5, '#e1ecf3', shade(c.c, -0.08), { win: '#7fb7d6' });
  if (c.taxi) obox(c.x - co, c.y - si, c.ang, 3, 3, 9.5, 11.5, '#fff8cc', '#fff8cc');
  if (env.n > 0.2) litList.push([X, Y - 3 * cam.z, 15 * cam.z, '255,225,150']);
  g.restore();
}

/* ================= overlays: pills, bubbles, labels, route ================= */
function pill(text, x, y, o) {
  o = o || {}; const size = o.size || 13;
  g.font = `600 ${size}px ${FONT}`; const w = g.measureText(text).width + 18; const h = size + 11;
  rr(x - w / 2, y - h, w, h, h / 2); g.fillStyle = o.bg || 'rgba(255,253,246,.96)'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - h / 2 + 1);
}
function pillRect(text, x, y, size) { g.font = `600 ${size}px ${FONT}`; const w = g.measureText(text).width + 18; const h = size + 11; return [x - w / 2, y - h, w, h]; }
function wrapText(text, maxW) {
  const lines = []; let line = ''; const cjk = /[　-鿿]/.test(text); const toks = cjk ? [...text] : text.split(' ');
  for (const t of toks) {
    const test = line ? (cjk ? line + t : line + ' ' + t) : t;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = t; } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function drawBubble(p) {
  if (p.sayT <= 0 || !p.say || p.sx === undefined || !onScreen(p.sx, p.sy, 80)) return;
  const k = p.sk; const size = clamp(12 * Math.max(cam.z, 0.7), 11, 15);
  g.font = `500 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = wrapText(p.say, 150); const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 16; const lh = size + 3; const h = lines.length * lh + 10;
  const x = clamp(p.sx, w / 2 + 4, W - w / 2 - 4); const yb = p.sy - 40 * k - 4; const a = Math.min(1, p.sayT * 1.5);
  g.save(); g.globalAlpha = a;
  rr(x - w / 2, yb - h, w, h, 10); g.fillStyle = p.owner ? '#fff3c4' : '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.moveTo(p.sx - 5, yb - 1); g.lineTo(p.sx, yb + 6); g.lineTo(p.sx + 5, yb - 1); g.fillStyle = p.owner ? '#fff3c4' : '#ffffff'; g.fill();
  g.beginPath(); g.moveTo(p.sx - 5, yb); g.lineTo(p.sx, yb + 6); g.lineTo(p.sx + 5, yb); g.stroke();
  g.fillStyle = INK; lines.forEach((l, i) => g.fillText(l, x, yb - h + 5 + lh * (i + 0.5)));
  g.restore();
}

let labelsOn = true; let followP = null; let followT = null; let planRoute = []; let planPath = [];
const LABEL_AT = (() => {
  const at = {};
  ORDER.forEach((k) => {
    const mem = buildings.filter((b) => b.dist === k);
    at[k] = [mem.reduce((a, b) => a + b.x, 0) / mem.length, Math.min(...mem.map((b) => b.y)) - (k === 'trip' ? 150 : 100)];
  });
  at.core = [at.core[0] + 20, at.core[1] - 30];
  return at;
})();
// road-sign style pills toward the day trips, placed on the way out of town
const TRIP_SIGNS = ['fuji', 'kamakura', 'disney'].map((id) => {
  const b = bById.get(id); const d = Math.hypot(b.x, b.y) || 1; const r = Math.min(1, 900 / d);
  return { id, x: b.x * r, y: b.y * r };
});
const SHIN_LABEL = (() => { const q = pathAt(SHN.tokaido.path, 0, 0); return [q.x, q.y - 70]; })();
const YAMA_LABEL = (() => { const q = pathAt(YAMA_PATH, YAMA_PATH.L * 0.6, 0); return [q.x, q.y - 40]; })();

function drawLabels() {
  const taken = [];
  const free = (r) => !taken.some((t) => r[0] < t[0] + t[2] && r[0] + r[2] > t[0] && r[1] < t[1] + t[3] && r[1] + r[3] > t[1]);
  if (labelsOn && cam.z < 1.5) {
    ORDER.forEach((key) => {
      const d = DIST[key]; const [wx, wy] = LABEL_AT[key]; const size = clamp(15 * Math.sqrt(cam.z), 12, 18); const text = `${tx('districts')[key]} · ${d.count}`;
      const X = clamp(sx(wx), 90, W - 90); const Y = Math.max(sy(wy), isMobile() ? 150 : 175);
      if (sx(wx) < -140 || sx(wx) > W + 140 || sy(wy) < -140 || sy(wy) > H + 140) return;
      pill(text, X, Y, { size, bg: mix(d.c, '#ffffff', 0.72) }); taken.push(pillRect(text, X, Y, size));
    });
    if (cam.z > 0.14 && cam.z < 0.9) {
      for (const s of TRIP_SIGNS) {
        const X = sx(s.x); const Y = sy(s.y); if (!onScreen(X, Y, 140)) continue;
        const text = tx('signs')[s.id]; const r = pillRect(text, X, Y, 12); if (free(r)) { pill(text, X, Y, { size: 12, bg: '#ffe9f1' }); taken.push(r); }
      }
    }
    if (cam.z > 0.2 && cam.z < 0.75) {
      for (const [text, pos, bg] of [[tx('shinLabel'), SHIN_LABEL, '#e3f6ea'], [tx('yamaLabel'), YAMA_LABEL, '#e3f6ea']]) {
        const X = sx(pos[0]); const Y = sy(pos[1], 30); if (!onScreen(X, Y, 120)) continue;
        const r = pillRect(text, X, Y, 12); if (free(r)) { pill(text, X, Y, { size: 12, bg }); taken.push(r); }
      }
    }
  }
  if (labelsOn && window.TELE && cam.z > 0.2 && cam.z < 1.6) {
    const X = sx(PORTAL.x); const Y = sy(PORTAL.y, 92 + 14 / cam.z); const text = '🌀 ' + window.TELE.portalLabel();
    if (onScreen(X, Y, 80)) { const r = pillRect(text, X, Y, 12); if (free(r)) { pill(text, X, Y, { size: 12, bg: '#e9e3ff' }); taken.push(r); } }
  }
  const list = [...buildings].sort((a, b) => (selId === b.id) - (selId === a.id) || (hoverB === b) - (hoverB === a) || (b.p.type === 'sight') - (a.p.type === 'sight') || a.y - b.y);
  for (const b of list) {
    const forced = hoverB === b || selId === b.id;
    const show = forced || (labelsOn && (b.p.type === 'sight' ? cam.z >= 0.34 : cam.z >= 0.9));
    if (!show || !b.hit) continue;
    const x = b.hit.x + b.hit.w / 2; const y = b.hit.y - (b.p.type === 'sight' ? 14 * cam.z : 0); const r = pillRect(nameOf(b.p), x, y, 13);
    if (!forced && !free(r)) continue;
    pill(nameOf(b.p), x, y, { size: 13, bg: selId === b.id ? '#ffe680' : undefined }); taken.push(r);
  }
  if (master.sx !== undefined && labelsOn && cam.z >= 0.4) pill('🧑‍✈️ ' + tx('masterName'), master.sx, master.sy - 52 * master.sk, { size: 12, bg: '#ffe680' });
  if (followP && followP.sx !== undefined) {
    const t = (performance.now() / 300) % TAU; g.save(); g.fillStyle = '#e8503a'; g.strokeStyle = INK; g.lineWidth = 2; const y = followP.sy - 50 * followP.sk + Math.sin(t) * 3;
    g.beginPath(); g.moveTo(followP.sx - 7, y - 10); g.lineTo(followP.sx + 7, y - 10); g.lineTo(followP.sx, y); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
function drawPlanRoute() {
  if (planRoute.length < 1) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  if (planPath.length > 1) {
    g.beginPath(); planPath.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1]))));
    g.strokeStyle = INK; g.lineWidth = 7; g.setLineDash([]); g.globalAlpha = 0.9; g.stroke();
    g.strokeStyle = '#ffc93c'; g.lineWidth = 4; g.setLineDash([10, 8]); g.lineDashOffset = -time * 20; g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1;
  planRoute.forEach((id, i) => {
    const b = bById.get(id); const X = sx(b.x); const Y = sy(b.y + 16);
    g.beginPath(); g.arc(X, Y, 13, 0, TAU); g.fillStyle = '#e8503a'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 14px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), X, Y + 1);
  });
  g.restore();
}

/* ================= render + frame ================= */
statics.sort((a, b) => a.y - b.y);
function render() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  litList.length = 0;
  drawGround(); drawTransitGround();

  const dyn = [];
  people.forEach((p) => dyn.push({ y: p.y + 1, f: () => drawPerson(p) }));
  cars.forEach((c) => dyn.push({ y: c.y, f: () => drawCar(c) }));
  transitDyn(dyn);
  dyn.sort((a, b) => a.y - b.y);
  let di = 0;
  for (let si = 0; si < statics.length; si++) {
    while (di < dyn.length && dyn[di].y <= statics[si].y) dyn[di++].f();
    statics[si].f();
  }
  while (di < dyn.length) dyn[di++].f();

  fx.forEach((f) => { const X = sx(f.x); const Y = sy(f.y, f.z); g.globalAlpha = clamp(f.life, 0, 1); emoji(f.ch, X, Y, 14 * Math.max(cam.z, 0.7)); g.globalAlpha = 1; });
  drawClouds();

  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${env.m.map(Math.round).join(',')})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  if (env.n > 0.05) {
    for (const L of litList) {
      if (L[0] < -L[2] || L[0] > W + L[2] || L[1] < -L[2] || L[1] > H + L[2]) continue;
      const grd = g.createRadialGradient(L[0], L[1], 0, L[0], L[1], L[2]);
      grd.addColorStop(0, `rgba(${L[3]},${0.55 * env.n})`); grd.addColorStop(1, `rgba(${L[3]},0)`);
      g.fillStyle = grd; g.fillRect(L[0] - L[2], L[1] - L[2], L[2] * 2, L[2] * 2);
    }
  }
  g.globalCompositeOperation = 'source-over';

  drawSubway();
  drawPlanRoute();
  drawLabels();
  people.forEach(drawBubble);
}

let last = performance.now(); let uiClock = 0; let chatT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; lastDt = dt;
  if (!paused) {
    time += dt; updatePeople(dt, time); updateCars(dt); updateTransit(dt);
    chatT += dt; if (chatT > 0.7) { chatT = 0; chatter(time); }
  } else subAmt = subOn ? 1 : 0;
  updateEnv(dt);
  if (followP) { cam.tx = followP.x; cam.ty = followP.y - 8; }
  else if (followT) { if (trainOnMap(followT)) { const q = trainPos(followT); cam.tx = q.x; cam.ty = q.y - 8; } else stopFollow(); }
  const e = reduceMotion ? 1 : 1 - Math.exp(-dt * 6);
  cam.x += (cam.tx - cam.x) * e; cam.y += (cam.ty - cam.y) * e; cam.z += (cam.tz - cam.z) * e; cam.tilt += (cam.ttilt - cam.tilt) * e;
  uiClock += dt; if (uiClock > 0.5) { uiClock = 0; refreshFollow(); updateTrainCard(); }
  render();
}

/* ================= input ================= */
const ptrs = new Map(); let moved = 0; let pinch = 0;
function pinchDist() { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) moved = 0;
  if (ptrs.size === 2) pinch = pinchDist();
});
cv.addEventListener('pointermove', (e) => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) { if (e.pointerType === 'mouse') hover(e.clientX, e.clientY); return; }
  const dx = e.clientX - prev.x; const dy = e.clientY - prev.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
      cv.classList.add('drag'); if (followP || followT) stopFollow();
      cam.x -= dx / cam.z; cam.y -= dy / (cam.z * cam.tilt); cam.tx = cam.x; cam.ty = cam.y;
    }
  } else if (ptrs.size === 2) {
    const d = pinchDist(); const a = [...ptrs.values()];
    if (pinch) zoomAt((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, d / pinch);
    pinch = d; moved = 99;
  }
});
function endPtr(e) {
  const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); cv.classList.remove('drag'); pinch = 0;
  if (had && e.type === 'pointerup' && moved < 7 && ptrs.size === 0) clickAt(e.clientX, e.clientY);
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => { e.preventDefault(); if (followP || followT) stopFollow(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
cv.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, 1.6));

function hitBuilding(x, y) {
  let best = null;
  for (const b of buildings) { const h = b.hit; if (h && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && (!best || b.y > best.y)) best = b; }
  return best;
}
function hitPerson(x, y) {
  let best = null; let bd = 1e9;
  for (const p of people) {
    if (p.sx === undefined) continue; const d = Math.hypot(x - p.sx, y - (p.sy - 14 * p.sk));
    if (d < 16 * p.sk + 6 && d < bd) { best = p; bd = d; }
  }
  return best;
}
const hitPortal = (x, y) => !!window.TELE && window.TELE.hit(x, y, sx(PORTAL.x), sy(PORTAL.y), cam.z);
function hover(x, y) {
  if (hitPortal(x, y)) { hoverB = null; cv.style.cursor = 'pointer'; return; }
  const p = hitPerson(x, y); const t = p ? null : trainAt(x, y); const b = p || t ? null : hitBuilding(x, y);
  hoverB = b; cv.style.cursor = p || t || b ? 'pointer' : '';
}
function clickAt(x, y) {
  if (hitPortal(x, y)) { window.TELE.open(); return; }
  const p = hitPerson(x, y); if (p) { startFollow(p); return; }
  const t = trainAt(x, y); if (t) { selectTrain(t); return; }
  const b = hitBuilding(x, y); if (b) { selectBuilding(b); return; }
  closeCard();
}

/* ================= selection / cards ================= */
const favs = new Set((() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } })());
const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) { /* ignore */ } };
const planSel = new Set();
const card = $('card');
let selTrain = null;

function selectBuilding(b, opts) {
  selTrain = null; selId = b.id; if (!(opts && opts.noFly)) flyTo(b.x, b.y - 24, 1.3);
  if (isMobile()) { closePanel('drawer'); closePanel('plan'); }
  renderCard(); highlightList();
}
function selectTrain(t) {
  selId = null; selTrain = t; highlightList(); renderTrainCard();
  if (isMobile()) { closePanel('drawer'); closePanel('plan'); }
}
function closeCard() { selId = null; selTrain = null; card.classList.remove('show'); highlightList(); }
const langAttr = () => (lang === 'zh' ? 'zh-CN' : 'en');
function renderCard() {
  if (selTrain) { renderTrainCard(); return; }
  const b = selId && bById.get(selId); if (!b) { card.classList.remove('show'); return; }
  const p = b.p; const d = DIST[b.dist]; const fav = favs.has(p.id); const inRoute = planSel.has(p.id);
  card.replaceChildren(
    elt('button', { class: 'x', type: 'button', 'aria-label': tx('close'), onclick: closeCard }, '×'),
    elt('div', { class: 'sign', style: `background:${d.c}` }, p.emoji),
    elt('div', { class: 'body' },
      elt('h2', { lang: langAttr() }, nameOf(p)),
      elt('div', { class: 'sub', lang: lang === 'zh' ? 'en' : 'ja' }, subOf(p)),
      elt('div', { class: 'tags' },
        elt('span', { class: 'tag', style: `background:${mix(d.c, '#ffffff', 0.55)}` }, tx('districts')[b.dist]),
        elt('span', { class: 'tag' }, typeLabel(p) + (p.far ? ' · ' + tx('dayTrip') : ''))),
      elt('p', null, placeText(p, 'blurb')),
      elt('div', { class: 'tip' }, '💡 ' + placeText(p, 'tip')),
      elt('div', { class: 'acts' },
        elt('button', { class: 'btn', type: 'button', onclick: () => { if (favs.has(p.id)) favs.delete(p.id); else favs.add(p.id); saveFavs(); renderCard(); buildList(); } }, tx(fav ? 'saved' : 'save')),
        elt('button', { class: 'btn', type: 'button', onclick: () => { if (planSel.has(p.id)) planSel.delete(p.id); else planSel.add(p.id); renderCard(); buildPlanList(); } }, tx(inRoute ? 'inRoute' : 'addRoute')),
        elt('a', { class: 'btn', href: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`, target: '_blank', rel: 'noopener' }, tx('osm')))));
  card.classList.add('show');
}
function renderTrainCard() {
  const t = selTrain; if (!t) return;
  const I = trainInfo(t); const T = tx('trains')[I.key];
  card.replaceChildren(
    elt('button', { class: 'x', type: 'button', 'aria-label': tx('close'), onclick: closeCard }, '×'),
    elt('div', { class: 'sign', style: `background:${I.color}` }, tx('trainSign')[I.key]),
    elt('div', { class: 'body' },
      elt('h2', { lang: langAttr() }, I.name),
      elt('div', { class: 'sub', lang: 'ja' }, T.sub),
      elt('div', { class: 'tags' }, elt('span', { class: 'tag', 'data-f': 'dir', style: `background:${mix(I.color, '#ffffff', 0.6)}` }, I.dirTxt), elt('span', { class: 'tag', 'data-f': 'next' }, tx('ridingNext') + ': ' + I.next)),
      elt('p', null, T.blurb),
      elt('div', { class: 'tip' }, '💡 ' + T.tip),
      elt('div', { class: 'acts' }, elt('button', { class: 'btn pri', type: 'button', onclick: () => startRide(t) }, tx('ride')))));
  card.classList.add('show');
}
function updateTrainCard() {
  if (!selTrain || !card.classList.contains('show')) return;
  const I = trainInfo(selTrain); const a = card.querySelector('[data-f=dir]'); const b = card.querySelector('[data-f=next]');
  if (a && a.textContent !== I.dirTxt) a.textContent = I.dirTxt;
  if (b) { const s = tx('ridingNext') + ': ' + I.next; if (b.textContent !== s) b.textContent = s; }
}

/* ================= follow / ride ================= */
const followEl = $('follow');
function setFollowButtons(person, isMaster) {
  $('bFollow').classList.toggle('on', person); $('bFollow').setAttribute('aria-pressed', String(person));
  $('bMaster').classList.toggle('on', isMaster); $('bMaster').setAttribute('aria-pressed', String(isMaster));
}
function flyTo(x, y, z) { cam.tx = x; cam.ty = y; if (z) cam.tz = Math.max(cam.tz, z); followP = null; followT = null; setFollowButtons(false, false); refreshFollow(); }
function startFollow(p) {
  followT = null; followP = p; cam.tz = Math.max(cam.tz, 1.3); setFollowButtons(!p.owner, !!p.owner); refreshFollow();
}
function startRide(t) {
  followP = null; followT = t; cam.tz = Math.max(cam.tz, 1.1); setFollowButtons(false, false); refreshFollow();
}
function stopFollow() { followP = null; followT = null; setFollowButtons(false, false); refreshFollow(); }
function nextFollow() { startFollow(pick(people.filter((p) => !p.owner && p !== followP))); }
function refreshFollow() {
  followEl.replaceChildren();
  if (followP) {
    const to = targetName(followP);
    followEl.append(elt('span', null, `🧍 ${tx('followingPre')} `, elt('b', null, personName(followP)), to ? ` · ${tx('followingTo')} ${to}` : ''));
    if (!followP.owner) followEl.append(elt('button', { type: 'button', onclick: nextFollow }, tx('followingNext')));
    followEl.append(elt('button', { type: 'button', onclick: stopFollow }, tx('followingStop')));
  } else if (followT) {
    const I = trainInfo(followT);
    followEl.append(elt('span', null, `${tx('trainSign')[I.key]} ${tx('ridingPre')} `, elt('b', null, I.name), ` · ${tx('ridingNext')}: ${I.next}`),
      elt('button', { type: 'button', onclick: stopFollow }, tx('ridingStop')));
  } else { followEl.classList.remove('show'); return; }
  followEl.classList.add('show');
}

/* ================= panels ================= */
const PANELS = { drawer: ['drawer', 'bList'], plan: ['plan', 'bPlan'], log: ['log', 'bLog'] };
function setBtn(id, on) { const b = $(id); b.setAttribute('aria-pressed', String(on)); if (id === 'bList') b.setAttribute('aria-expanded', String(on)); if (id !== 'bList') b.classList.toggle('on', on); }
function openPanel(name) {
  const [el, btn] = PANELS[name];
  if (isMobile()) Object.keys(PANELS).forEach((n) => { if (n !== name) closePanel(n); });
  if (isMobile() && (name === 'drawer' || name === 'plan')) closeCard();
  $(el).classList.add('show'); setBtn(btn, true);
}
function closePanel(name) { const [el, btn] = PANELS[name]; $(el).classList.remove('show'); setBtn(btn, false); }
const isOpen = (name) => $(PANELS[name][0]).classList.contains('show');
const togglePanel = (name) => (isOpen(name) ? closePanel(name) : openPanel(name));

/* ---------- list drawer ---------- */
let catFilter = 'all'; let query = '';
function buildChips() {
  const wrap = $('cats'); wrap.replaceChildren();
  const mkChip = (key, label, color) => {
    wrap.append(elt('button', { type: 'button', class: 'chip' + (catFilter === key ? ' on' : ''), 'aria-pressed': String(catFilter === key), onclick: () => { catFilter = key; buildChips(); buildList(); } },
      color ? elt('i', { style: `background:${color}` }) : null, label));
  };
  mkChip('all', tx('chipAll')); mkChip('fav', tx('chipFav'));
  ORDER.forEach((k) => mkChip(k, tx('districts')[k], DIST[k].c));
}
function buildList() {
  const q = query.trim().toLowerCase(); const out = $('list'); out.replaceChildren(); let any = false;
  ORDER.forEach((k) => {
    if (catFilter !== 'all' && catFilter !== 'fav' && catFilter !== k) return;
    const rows = buildings.filter((b) => b.dist === k && (catFilter !== 'fav' || favs.has(b.id)) &&
      (!q || [b.p.name, b.p.zh, placeText(b.p, 'blurb'), placeText(b.p, 'tip')].join(' ').toLowerCase().includes(q)));
    if (!rows.length) return; any = true;
    out.append(elt('h4', null, tx('districts')[k]));
    rows.forEach((b) => {
      out.append(elt('button', { type: 'button', class: 'it' + (selId === b.id ? ' sel' : ''), 'data-id': b.id, onclick: () => selectBuilding(b) },
        elt('span', { class: 'em', style: `background:${mix(DIST[k].c, '#ffffff', 0.6)}` }, b.p.emoji),
        elt('span', { class: 'tx' }, elt('span', { lang: langAttr() }, nameOf(b.p)), elt('small', null, subOf(b.p))),
        favs.has(b.id) ? elt('span', { class: 'star' }, '⭐') : null));
    });
  });
  if (!any) out.append(elt('div', { class: 'empty' }, tx('noMatches')));
}
function highlightList() { document.querySelectorAll('#list .it').forEach((el) => el.classList.toggle('sel', el.dataset.id === selId)); }
$('q').addEventListener('input', (e) => { query = e.target.value; buildList(); });

/* ---------- route planner ---------- */
const DUR = { tokyotower: 60, skytree: 90, sensoji: 60, shibuya: 30, meiji: 60, disney: 480, fuji: 360, kamakura: 240, odaiba: 120, ueno: 120, imperial: 60, akihabara: 60, shinjuku: 45, harajuku: 45, ginza: 60, tsukiji: 60, tokyostation: 30, roppongi: 60 };
const MODES = { walk: [4.5, 0], bike: [12, 3], metro: [20, 12], taxi: [24, 6] };
const PACES = { fast: 0.7, normal: 1, slow: 1.4 };
const STARTS = { tokyo: { lat: 35.6812, lng: 139.7671 }, shinjuku: { lat: 35.6896, lng: 139.7006 }, haneda: { lat: 35.5494, lng: 139.7798 } };
const MORNING = new Set(['tamago', 'ekiben']); const DINNER = new Set(['yakitori', 'yakiniku']);
const NIGHT_SPOTS = new Set(['shibuya', 'roppongi', 'tokyotower', 'skytree', 'odaiba', 'shinjuku', 'akihabara']);
const hav = (a, b) => {
  const R = 6371; const r = Math.PI / 180; const dLat = (b.lat - a.lat) * r; const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h));
};
const fmt = (m) => { m = Math.round(m); const hh = Math.floor(m / 60) % 24; return String(hh).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

function fillSelect(el, entries, cur) { el.replaceChildren(...entries.map(([v, l]) => elt('option', { value: v }, l))); if (cur) el.value = cur; }
function buildPlanSelects() {
  const f = $('pFrom').value; const m = $('pMode').value; const pc = $('pPace').value;
  fillSelect($('pFrom'), [['tokyo', tx('fromTokyo')], ['shinjuku', tx('fromShinjuku')], ['haneda', tx('fromHaneda')], ['first', tx('fromFirst')]], f || 'tokyo');
  fillSelect($('pMode'), Object.entries(tx('modes')), m || 'metro');
  fillSelect($('pPace'), Object.entries(tx('paces')), pc || 'normal');
  $('pNote').textContent = tx('planNote');
}
function buildPlanList() {
  const out = $('pList'); out.replaceChildren();
  ORDER.forEach((k) => {
    const rows = buildings.filter((b) => b.dist === k); if (!rows.length) return;
    out.append(elt('h4', null, elt('i', { style: `background:${DIST[k].c}` }), tx('districts')[k]));
    rows.forEach((b) => {
      const cb = elt('input', { type: 'checkbox' }); cb.checked = planSel.has(b.id);
      cb.onchange = () => { if (cb.checked) planSel.add(b.id); else planSel.delete(b.id); updatePlanCount(); if (selId === b.id) renderCard(); };
      out.append(elt('label', { class: 'pi' }, cb, elt('span', null, b.p.emoji), elt('span', null, nameOf(b.p))));
    });
  });
  updatePlanCount();
}
function updatePlanCount() { $('pCount').textContent = fill(tx('selected'), { n: planSel.size }); }

function orderStops(ids, startKey) {
  const ps = ids.map((id) => bById.get(id).p);
  const nn = (list, from) => {
    const left = [...list]; const out = []; let cur = from || (left.length ? left.shift() : null); if (cur && !from) out.push(cur);
    while (left.length) { let bi = 0; let bd = 1e9; left.forEach((p, i) => { const d = hav(cur, p); if (d < bd) { bd = d; bi = i; } }); cur = left.splice(bi, 1)[0]; out.push(cur); }
    return out;
  };
  const start = STARTS[startKey] || null;
  const trips = ps.filter((p) => p.far); const city = ps.filter((p) => !p.far);
  const morning = city.filter((p) => MORNING.has(p.id)); const dinner = city.filter((p) => DINNER.has(p.id));
  const mid = city.filter((p) => !MORNING.has(p.id) && !DINNER.has(p.id));
  const tripOrder = nn(trips, start); const lastPos = tripOrder.length ? tripOrder[tripOrder.length - 1] : start;
  const morningOrder = nn(morning, lastPos); const afterMorning = morningOrder.length ? morningOrder[morningOrder.length - 1] : lastPos;
  const midOrder = nn(mid, afterMorning); const afterMid = midOrder.length ? midOrder[midOrder.length - 1] : afterMorning;
  return [...tripOrder, ...morningOrder, ...midOrder, ...nn(dinner, afterMid)];
}
function planRouteNow() {
  const out = $('pOut'); out.replaceChildren();
  if (planSel.size < 2) { out.append(elt('div', { class: 'muted' }, tx('needTwo'))); planRoute = []; planPath = []; return; }
  const from = $('pFrom').value; const mode = $('pMode').value; const pace = PACES[$('pPace').value] || 1;
  const [hh, mm] = ($('pTime').value || '09:30').split(':').map(Number); let t = hh * 60 + mm;
  const stops = orderStops([...planSel], from); planRoute = stops.map((p) => p.id);
  const MIN = lang === 'zh' ? '分钟' : 'min';
  let prev = STARTS[from] || null; let totalKm = 0; let anyLate = false; const ul = elt('ul', { class: 'tl' });
  stops.forEach((p, i) => {
    if (prev) {
      const km = hav(prev, p) * 1.3; let md = mode; if ((md === 'walk' || md === 'bike') && km > 6) md = 'taxi';
      if (km > 25) md = 'metro'; // far out of town: an express train
      const [sp, oh] = km > 25 ? [70, 20] : MODES[md]; const mins = (km / sp) * 60 + oh; totalKm += km; t += mins;
      ul.append(elt('li', { class: 'leg' }, `${tx('leg' + md[0].toUpperCase() + md.slice(1))} ${Math.max(1, Math.round(mins))} ${MIN} · ${km.toFixed(1)} km`));
    }
    if (DINNER.has(p.id) && t < 17.5 * 60) t = 17.5 * 60;
    const stay = Math.round((p.type === 'food' ? 30 : (DUR[p.id] || 45)) * pace);
    const late = t > 20.5 * 60 && p.type === 'sight' && !NIGHT_SPOTS.has(p.id); anyLate = anyLate || late;
    ul.append(elt('li', { class: 'stop' }, elt('span', { class: 'no' }, String(i + 1)),
      elt('div', null, elt('div', { class: 'tm' }, `${fmt(t)}–${fmt(t + stay)} `, elt('small', null, `${tx('stay')} ${stay} ${MIN}`)),
        elt('div', { class: 'nm' + (late ? ' late' : '') }, `${p.emoji} ${nameOf(p)}`))));
    t += stay; prev = p;
  });
  out.append(elt('div', { class: 'sum' }, fill(tx('summary'), { n: stops.length, km: totalKm.toFixed(1), t: fmt(t) })));
  if (stops.some((p) => p.far)) out.append(elt('div', { class: 'warn' }, tx('tripBlock')));
  if (anyLate) out.append(elt('div', { class: 'warn' }, tx('late')));
  out.append(ul);
  const bs = stops.map((p) => bById.get(p.id));
  const minX = Math.min(...bs.map((b) => b.x)); const maxX = Math.max(...bs.map((b) => b.x)); const minY = Math.min(...bs.map((b) => b.y)); const maxY = Math.max(...bs.map((b) => b.y));
  stopFollow(); planPath = [];
  for (let i = 1; i < bs.length; i++) { const a = doorOf(bs[i - 1]); const c = doorOf(bs[i]); findPath(a[0], a[1], c[0], c[1]).forEach((p, k) => { if (planPath.length && !k) return; planPath.push(p); }); }
  cam.tx = (minX + maxX) / 2; cam.ty = (minY + maxY) / 2 - 10;
  const availW = isMobile() ? W : W - 460; cam.tz = clamp(Math.min(availW / (maxX - minX + 340), (H * (isMobile() ? 0.4 : 0.75)) / ((maxY - minY + 220) * cam.ttilt)), 0.1, 1.3);
  if (!isMobile()) cam.tx -= (W - availW) / 2 / cam.tz;
}
$('pGo').onclick = planRouteNow;
$('pClear').onclick = () => { planSel.clear(); planRoute = []; planPath = []; $('pOut').replaceChildren(); buildPlanList(); if (selId) renderCard(); };
$('pFav').onclick = () => { favs.forEach((id) => planSel.add(id)); buildPlanList(); if (selId) renderCard(); };
$('pclose').onclick = () => closePanel('plan');

/* ================= toolbar ================= */
const todEl = $('tod');
const TOD_ICONS = ['🌅', '☀️', '🌇', '🌙', '🔄'];
function buildTod() {
  todEl.replaceChildren();
  TOD_ICONS.forEach((ic, i) => {
    todEl.append(elt('button', { type: 'button', class: 'tb', 'data-t': String(i), title: tx('tod')[i], 'aria-label': tx('tod')[i],
      onclick: () => { if (i === 4) { autoTod = !autoTod; autoClock = 0; } else { autoTod = false; todIdx = i; } syncTodButtons(); } }, elt('span', { class: 'i' }, ic)));
  });
  syncTodButtons();
}
function syncTodButtons() {
  [...todEl.children].forEach((b, i) => { const on = i === 4 ? autoTod : i === todIdx; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
function syncPause() { $('pauseIcon').textContent = paused ? '▶️' : '⏸'; $('pauseTx').textContent = tx('tools')[paused ? 'play' : 'pause']; }
$('bLabel').onclick = () => { labelsOn = !labelsOn; setBtn('bLabel', labelsOn); };
$('bSubway').onclick = () => { setSubway(!subOn); setBtn('bSubway', subOn); };
$('bMaster').onclick = () => { if (followP === master) stopFollow(); else startFollow(master); };
$('bFollow').onclick = () => { if (followP && !followP.owner) stopFollow(); else nextFollow(); };
$('bPause').onclick = () => { paused = !paused; setBtn('bPause', paused); syncPause(); };
$('bBird').onclick = () => { bird = !bird; setBtn('bBird', bird); cam.ttilt = bird ? 0.95 : 0.58; stopFollow(); fitAll(); };
$('bPlan').onclick = () => togglePanel('plan');
$('bLog').onclick = () => togglePanel('log');
$('bList').onclick = () => togglePanel('drawer');
$('bAll').onclick = () => { stopFollow(); closeCard(); if (Math.abs(cam.tz - rectZoom(WD.x0, WD.y0, WD.x1, WD.y1 + 40)) < 0.03) fitCity(); else fitAll(); };
$('bHelp').onclick = () => openIntro(0);
document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
addEventListener('resize', resize);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('intro').classList.contains('show')) closeIntro(); else { closeCard(); Object.keys(PANELS).forEach(closePanel); } } });

/* ================= intro tour ================= */
let introStep = 0;
function openIntro(i) { introStep = i; renderIntro(); $('intro').classList.add('show'); $('inext').focus(); }
function closeIntro() { $('intro').classList.remove('show'); try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* ignore */ } }
function renderIntro() {
  const steps = tx('intro'); const s = steps[introStep];
  $('ist').textContent = s[0]; $('iti').textContent = s[1]; $('itx').textContent = s[2];
  $('idt').replaceChildren(...steps.map((_, i) => elt('i', i === introStep ? { class: 'on' } : null)));
  $('iskip').textContent = tx('introSkip'); $('inext').textContent = introStep === steps.length - 1 ? tx('introDone') : tx('introNext');
}
$('inext').onclick = () => { if (introStep >= tx('intro').length - 1) closeIntro(); else { introStep++; renderIntro(); } };
$('iskip').onclick = closeIntro;

/* ================= language / static text ================= */
function applyStatic() {
  document.documentElement.lang = langAttr();
  document.title = tx('docTitle');
  const meta = document.querySelector('meta[name="description"]'); if (meta) meta.setAttribute('content', tx('docDesc'));
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tx(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', tx(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', tx(el.dataset.i18nPh)); });
  document.querySelectorAll('[data-tool]').forEach((el) => { el.textContent = tx('tools')[el.dataset.tool]; });
  document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('bHelp').setAttribute('aria-label', tx('help'));
  if (!$('decreeTx').textContent || $('decreeTx').dataset.first) { $('decreeTx').textContent = tx('decreeFirst'); $('decreeTx').dataset.first = '1'; }
  syncPause(); renderSubLegend();
  if (window.TELE) window.TELE.refresh();
}
function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next; try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
  people.forEach((p) => { p.sayT = 0; p.replyAt = 0; });
  applyStatic(); buildTod(); buildChips(); buildList(); buildPlanSelects(); buildPlanList(); renderCard(); refreshFollow();
  if ($('intro').classList.contains('show')) renderIntro();
  if (planRoute.length) planRouteNow();
}

/* ================= start ================= */
resize(); fitStart(); cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz * 0.8;
if (reduceMotion) { paused = true; setBtn('bPause', true); }
applyStatic(); buildTod(); buildChips(); buildList(); buildPlanSelects(); buildPlanList();
if (window.TELE) window.TELE.init({ here: 'tokyo', getLang: () => lang });
const qs = new URLSearchParams(location.search);
if (qs.get('portal')) {
  Object.assign(cam, { x: PORTAL.x, y: PORTAL.y - 20, z: 1.1, tx: PORTAL.x, ty: PORTAL.y - 20, tz: 1.1 });
  if (qs.get('portal') === 'open' && window.TELE) window.TELE.open();
}
addLog(tx('decreeFirst'), {}, 'own', true);
let introSeen = false; try { introSeen = !!localStorage.getItem(INTRO_KEY); } catch (e) { /* ignore */ }
if (!introSeen && !qs.has('nointro')) openIntro(0);
if (qs.get('tod') && TOD[+qs.get('tod')]) { todIdx = +qs.get('tod'); Object.assign(env, { m: [...TOD[todIdx].m], n: TOD[todIdx].n }); syncTodButtons(); }
updateCars(0);
// warm the world up so the crowd and the trains don't start in a clump
const warm = qs.has('warm') ? +qs.get('warm') || 0 : 25;
if (!paused) for (let i = 0; i < warm * 10; i++) { time += 0.1; updatePeople(0.1, time); updateCars(0.1); updateTransit(0.1); if (i % 7 === 0) chatter(time); }
setTrainEvents((t, ev) => {
  if (ev !== 'arrive' && ev !== 'depart') return;
  addLog(tx('logTrain'), { t: fill(tx(ev === 'arrive' ? 'trainArr' : 'trainDep'), { n: tx('trains')[t.line].name }) }, 'train');
});
if (qs.get('cam')) { const [cx, cy, cz] = qs.get('cam').split(',').map(Number); Object.assign(cam, { x: cx, y: cy, z: cz, tx: cx, ty: cy, tz: cz }); }
if (qs.get('view') === 'world') { fitAll(); cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
if (qs.get('subway') === '1') { setSubway(true); setBtn('bSubway', true); subAmt = 1; }
if (qs.get('panel') && PANELS[qs.get('panel')]) openPanel(qs.get('panel'));
if (qs.get('sel') && bById.has(qs.get('sel'))) selectBuilding(bById.get(qs.get('sel')));
if (qs.get('route')) { qs.get('route').split(',').forEach((id) => bById.has(id) && planSel.add(id)); buildPlanList(); openPanel('plan'); planRouteNow(); }
requestAnimationFrame(frame);

// small hook for debugging/tests
window.__city = { cam, buildings, people, cars, yamaTrains, shinTrains, metroTrains, UNREACHABLE, selectBuilding: (id) => selectBuilding(bById.get(id)), selectTrain, startRide, openPanel, setSubway };
