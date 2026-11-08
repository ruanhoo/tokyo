// Teleport between the living city maps. Self-contained: it injects its own button, picker and
// transition, and draws the in-world portal. Each city page calls TELE.init({ here, getLang }).
(() => {
  'use strict';
  const CITIES = [
    { id: 'xian', emoji: '🏯', url: 'https://ruanhoo.github.io/xian/city/', color: '#e8503a',
      en: "Xi'an", zh: '西安', tagEn: 'Walled city · Terracotta Army · hand-pulled noodles', tagZh: '古城墙 · 兵马俑 · 面食小吃' },
    { id: 'vancouver', emoji: '🍁', url: 'https://ruanhoo.github.io/vancouver/living/', color: '#3a8fc7',
      en: 'Vancouver', zh: '温哥华', tagEn: 'Mountains + sea · Sea-to-Sky · Rocky Mountaineer', tagZh: '山与海 · 海天公路 · 落基山登山者号' },
    { id: 'maldives', emoji: '🏝️', url: 'https://ruanhoo.github.io/maldives/island/', color: '#2ec4a6',
      en: 'Maldives', zh: '马尔代夫', tagEn: 'Atolls · overwater villas · manta rays & whale sharks', tagZh: '环礁 · 水上屋 · 蝠鲼与鲸鲨' },
    { id: 'tokyo', emoji: '🗼', url: 'https://ruanhoo.github.io/tokyo/living/', color: '#e8503a',
      en: 'Tokyo', zh: '东京', tagEn: 'Tokyo Tower · subway · Shinkansen bullet trains', tagZh: '东京塔 · 地铁 · 新干线' },
  ];
  const T = {
    en: { btn: 'Teleport', title: '🌀 Teleport', sub: 'Pick a city. Hold on to your hat!', here: 'You are here', go: 'Teleport ➜', close: 'Close', welcome: 'Welcome to {to}! Teleported in from {from}.', portal: 'Teleport' },
    zh: { btn: '传送', title: '🌀 传送门', sub: '选一座城市，抓紧帽子！', here: '你在这里', go: '传送 ➜', close: '关闭', welcome: '欢迎来到{to}！你刚从{from}传送过来。', portal: '传送门' },
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { here: '', getLang: () => 'en', modal: null, fx: null, btn: null };
  const lang = () => (state.getLang() === 'zh' ? 'zh' : 'en');
  const t = (k) => T[lang()][k];
  const city = (id) => CITIES.find((c) => c.id === id);
  const name = (c) => (lang() === 'zh' ? c.zh : c.en);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
#teleFx{position:fixed;inset:0;z-index:99;pointer-events:none;background:conic-gradient(from 0deg,#7b5cff,#2fd3ff,#ff9ebb,#ffc93c,#7b5cff);clip-path:circle(0% at 50% 50%);opacity:0}
#teleFx.in{pointer-events:auto;opacity:1;animation:teleIn .75s cubic-bezier(.5,0,.8,.4) forwards}
#teleFx.out{opacity:1;clip-path:circle(150% at 50% 50%);animation:teleOut .9s ease-in forwards}
#teleFx::after{content:"";position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.95),rgba(255,255,255,0) 55%);animation:teleSpin 1.2s linear infinite}
@keyframes teleIn{from{clip-path:circle(0% at 50% 50%);filter:hue-rotate(0)}to{clip-path:circle(150% at 50% 50%);filter:hue-rotate(160deg)}}
@keyframes teleOut{from{clip-path:circle(150% at 50% 50%);filter:hue-rotate(160deg)}to{clip-path:circle(0% at 50% 50%);filter:hue-rotate(0)}}
@keyframes teleSpin{to{transform:rotate(1turn)}}
#tele{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:rgba(45,42,50,.45);padding:16px}
#tele.show{display:flex}
#tele .box{width:min(520px,100%);max-height:100%;overflow:auto;background:var(--paper,#fffdf6);border:3px solid #2d2a32;border-radius:24px;box-shadow:5px 5px 0 #2d2a32;padding:16px 16px 18px;font-family:var(--font,system-ui,sans-serif);color:#2d2a32}
#tele h2{margin:0 0 2px;font-size:22px}
#tele .s{margin:0 0 12px;color:#7a7280;font-size:14px}
#tele .x{float:right;border:3px solid #2d2a32;background:#fff;border-radius:50%;width:34px;height:34px;font:700 18px/1 var(--font,system-ui);cursor:pointer;box-shadow:2px 2px 0 #2d2a32}
#tele .c{display:flex;gap:12px;align-items:center;width:100%;text-align:left;margin:0 0 10px;padding:10px 12px;border:3px solid #2d2a32;border-radius:18px;background:#fff;box-shadow:3px 3px 0 #2d2a32;font:inherit;color:inherit;cursor:pointer}
#tele .c:not([disabled]):hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 #2d2a32}
#tele .c[disabled]{opacity:.65;cursor:default}
#tele .e{flex:none;width:56px;height:56px;border:3px solid #2d2a32;border-radius:16px;display:grid;place-items:center;font-size:30px}
#tele .n{font-weight:700;font-size:18px}
#tele .g{font-size:13px;color:#7a7280}
#tele .b{margin-left:auto;flex:none;font-weight:700;font-size:13px;padding:6px 10px;border:3px solid #2d2a32;border-radius:999px;background:#ffc93c}
#teleToast{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:95;background:#fff6c9;border:3px solid #2d2a32;border-radius:999px;box-shadow:3px 3px 0 #2d2a32;padding:8px 16px;font:600 14px var(--font,system-ui);color:#2d2a32;max-width:92vw;text-align:center;transition:opacity .5s}
@media (prefers-reduced-motion:reduce){#teleFx.in,#teleFx.out,#teleFx::after{animation:none}}`;

  function ensureDom() {
    if (state.fx) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    state.fx = document.createElement('div'); state.fx.id = 'teleFx'; state.fx.setAttribute('aria-hidden', 'true'); document.body.appendChild(state.fx);
    state.modal = document.createElement('div'); state.modal.id = 'tele'; state.modal.setAttribute('role', 'dialog'); state.modal.setAttribute('aria-modal', 'true');
    state.modal.addEventListener('click', (e) => { if (e.target === state.modal || e.target.closest('.x')) close(); const c = e.target.closest('.c'); if (c && !c.disabled) go(c.dataset.id); });
    document.body.appendChild(state.modal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.modal.classList.contains('show')) close(); });
  }
  function render() {
    state.modal.setAttribute('aria-label', t('title'));
    state.modal.innerHTML = `<div class="box"><button class="x" type="button" aria-label="${esc(t('close'))}">×</button><h2>${esc(t('title'))}</h2><p class="s">${esc(t('sub'))}</p>` +
      CITIES.map((c) => {
        const here = c.id === state.here;
        return `<button class="c" type="button" data-id="${c.id}"${here ? ' disabled' : ''}><span class="e" style="background:${c.color}33">${c.emoji}</span><span><div class="n">${esc(name(c))}</div><div class="g">${esc(lang() === 'zh' ? c.tagZh : c.tagEn)}</div></span><span class="b">${esc(here ? t('here') : t('go'))}</span></button>`;
      }).join('') + '</div>';
  }
  function open() { ensureDom(); render(); state.modal.classList.add('show'); const f = state.modal.querySelector('.c:not([disabled])'); if (f) f.focus(); }
  function close() { if (state.modal) state.modal.classList.remove('show'); }
  function go(id) {
    const c = city(id); if (!c || c.id === state.here) return;
    close(); ensureDom();
    const target = `${c.url}?from=${encodeURIComponent(state.here)}&lang=${lang()}`;
    if (reduce) { location.href = target; return; }
    state.fx.className = 'in';
    setTimeout(() => { location.href = target; }, 780);
  }
  function label() { if (state.btn) { const s = state.btn.querySelector('span:last-child'); if (s) s.textContent = t('btn'); } }
  function addButton() {
    const bar = document.getElementById('tools'); if (!bar || document.getElementById('bTele')) return;
    const b = document.createElement('button'); b.className = 'tb'; b.id = 'bTele'; b.type = 'button';
    b.innerHTML = '<span class="i">🌀</span><span></span>'; b.addEventListener('click', open); bar.appendChild(b); state.btn = b; label();
  }
  function arrival() {
    const q = new URLSearchParams(location.search); const from = city(q.get('from'));
    if (!from || from.id === state.here) return;
    ensureDom();
    if (!reduce) { state.fx.className = 'out'; setTimeout(() => { state.fx.className = ''; }, 950); }
    const to = city(state.here); const toast = document.createElement('div'); toast.id = 'teleToast'; toast.setAttribute('role', 'status');
    toast.textContent = t('welcome').replace('{to}', to ? name(to) : '').replace('{from}', name(from));
    document.body.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; }, 4200); setTimeout(() => toast.remove(), 4800);
    try { q.delete('from'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) { /* ignore */ }
  }
  function init(opts) { state.here = opts.here; state.getLang = opts.getLang || state.getLang; ensureDom(); addButton(); arrival(); }
  function refresh() { label(); if (state.modal && state.modal.classList.contains('show')) render(); }

  // the in-world portal: a stone ring with a swirling middle. (X, Y) is its base on screen, k the zoom.
  function draw(g, X, Y, k, time, night) {
    const R = 30; const cy = -R - 8;
    g.save(); g.translate(X, Y); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#2d2a32'; g.lineWidth = Math.max(1.3 / k, 2.6);
    g.fillStyle = 'rgba(45,42,50,.22)'; g.beginPath(); g.ellipse(0, 3, R * 0.95, 8, 0, 0, 6.2832); g.fill();
    // plinth
    g.fillStyle = '#b8b2a6'; g.beginPath(); g.moveTo(-24, 2); g.lineTo(-20, -6); g.lineTo(20, -6); g.lineTo(24, 2); g.closePath(); g.fill(); g.stroke();
    // swirl disc
    g.save(); g.beginPath(); g.ellipse(0, cy, R - 4, R + 2, 0, 0, 6.2832); g.clip();
    const grd = g.createRadialGradient(0, cy, 2, 0, cy, R + 4); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, '#9be3ff'); grd.addColorStop(0.75, '#8f7be0'); grd.addColorStop(1, '#5a3fc0');
    g.fillStyle = grd; g.fillRect(-R - 4, cy - R - 6, R * 2 + 8, R * 2 + 12);
    g.lineWidth = Math.max(1 / k, 2.2); g.strokeStyle = 'rgba(255,255,255,.9)';
    for (let a = 0; a < 3; a++) {
      g.beginPath();
      for (let i = 0; i <= 26; i++) { const f = i / 26; const ang = time * 2.2 + a * 2.0944 + f * 5.2; const r = f * (R - 2); const x = Math.cos(ang) * r; const y = cy + Math.sin(ang) * r * 1.08; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.restore();
    // stone ring
    g.strokeStyle = '#2d2a32'; g.lineWidth = Math.max(1.3 / k, 2.6) * 2.4; g.beginPath(); g.ellipse(0, cy, R, R + 6, 0, 0, 6.2832); g.stroke();
    g.strokeStyle = '#d8d2c6'; g.lineWidth = Math.max(1.3 / k, 2.6) * 1.1; g.beginPath(); g.ellipse(0, cy, R, R + 6, 0, 0, 6.2832); g.stroke();
    // sparkles
    g.fillStyle = night > 0.3 ? '#fff6a8' : '#ffffff'; g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { const a = time * 1.3 + i * 1.57; const r = R + 10 + Math.sin(time * 3 + i) * 4; const x = Math.cos(a) * r; const y = cy + Math.sin(a) * (r + 4) * 0.9; g.beginPath(); g.arc(x, y, 2.2, 0, 6.2832); g.fill(); g.stroke(); }
    g.restore();
  }
  // screen-space hit test for a click at (px, py) given the portal base at (X, Y)
  const hit = (px, py, X, Y, k) => Math.hypot(px - X, (py - (Y - 38 * k)) * 0.85) < 44 * k + 8;
  window.TELE = { init, open, close, go, refresh, draw, hit, CITIES, portalLabel: () => t('portal') };
})();
