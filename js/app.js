(() => {
  'use strict';

  const PLACES = window.TOKYO_PLACES || [];
  const I18N = window.TOKYO_I18N;
  const LANGS = Object.keys(I18N.ui);
  const STORE_KEY = 'tokyo-lang';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktop = window.matchMedia('(min-width: 900px)');

  const listEl = document.getElementById('list');
  const mapWrap = document.querySelector('.map-wrap');
  const chips = [...document.querySelectorAll('.chip')];

  // Data is our own static file, but escape anyway so it's safe to edit freely.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Language ---------- */
  function detectLang() {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (e) { /* storage blocked: ignore */ }
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  let lang = detectLang();

  const t = (key) => I18N.ui[lang][key] ?? I18N.ui.en[key] ?? key;
  const placeText = (p, field) => (I18N.places[lang] && I18N.places[lang][p.id] && I18N.places[lang][p.id][field]) || p[field];
  // In Chinese mode the Chinese name leads and the English name is the subtitle.
  const nameOf = (p) => (lang === 'zh' ? p.zh : p.name);
  const subNameOf = (p) => (lang === 'zh' ? p.name : p.zh);
  const tagOf = (p) => t(p.type === 'food' ? 'tagFood' : 'tagSight');

  function applyStaticText() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('docTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('docDesc'));
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }

  /* ---------- Map ---------- */
  const map = L.map('map', { zoomControl: true, worldCopyJump: false, minZoom: 8, maxZoom: 18 }).setView([35.68, 139.75], 12);

  // Basemaps. English uses OpenStreetMap Japan (English labels, no key needed). Chinese uses
  // OpenStreetMap, which labels places in Japan in kanji that Chinese readers can follow.
  // Both are key-free; js/config.js can override the English tiles.
  const CFG = window.TOKYO_CONFIG || {};
  const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: OSM_ATTRIBUTION });
  const englishLayer = CFG.tileUrl
    ? L.tileLayer(CFG.tileUrl, { maxZoom: 18, ...CFG.tileOptions, attribution: CFG.tileAttribution || OSM_ATTRIBUTION })
    : osmLayer;
  let baseLayer = null;

  function applyBasemap() {
    const next = lang === 'zh' ? osmLayer : englishLayer;
    if (next === baseLayer) return;
    if (baseLayer) map.removeLayer(baseLayer);
    next.addTo(map);
    next.bringToBack();
    baseLayer = next;
  }

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 44,
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: (c) => L.divIcon({
      html: `<div class="cluster">${c.getChildCount()}</div>`,
      className: 'cluster-wrap',
      iconSize: [44, 44],
    }),
  }).addTo(map);

  const markers = new Map(); // id -> L.Marker
  const cards = new Map();   // id -> <button>
  let activeId = null;
  let filter = 'all';

  const mapsLink = (p) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;

  const markerTitle = (p) => `${nameOf(p)} (${tagOf(p)})`;
  const popupHTML = (p) =>
    `<div class="popup__title" lang="${lang}">${p.emoji} ${esc(nameOf(p))}</div>` +
    `<div class="popup__zh" lang="${lang === 'zh' ? 'en' : 'zh'}">${esc(subNameOf(p))}</div>` +
    `<a class="popup__link" href="${mapsLink(p)}" target="_blank" rel="noopener">${esc(t('openOsm'))}</a>`;

  function makeMarker(p) {
    // Sights are "?" blocks, food stops are warp pipes (see .pin styles in css/style.css).
    const icon = L.divIcon({
      html: `<div class="pin pin--${p.type}"><span class="pin__rim"></span><span class="pin__face" aria-hidden="true">${p.emoji}</span></div>`,
      className: 'pin-wrap',
      iconSize: [44, 48],
      iconAnchor: [22, 46],
      popupAnchor: [0, -46],
    });
    const m = L.marker([p.lat, p.lng], { icon, title: markerTitle(p), alt: nameOf(p), riseOnHover: true });
    m.bindPopup(popupHTML(p), { closeButton: true, autoPanPadding: [20, 20] });
    m.on('click', () => select(p.id, { from: 'map' }));
    m.on('popupclose', () => { if (activeId === p.id) clearActive(); });
    return m;
  }

  function makeCard(p) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.dataset.type = p.type;
    li.hidden = !(filter === 'all' || p.type === filter);
    li.innerHTML =
      `<button type="button" class="card card--${p.type}" aria-pressed="false">` +
        `<span class="card__top">` +
          `<span class="card__emoji" aria-hidden="true">${p.emoji}</span>` +
          `<span><span class="card__name" lang="${lang}">${esc(nameOf(p))}</span><br><span class="card__zh" lang="${lang === 'zh' ? 'en' : 'zh'}">${esc(subNameOf(p))}</span></span>` +
        `</span>` +
        `<span class="card__tag">${esc(tagOf(p))}${p.far ? esc(t('dayTrip')) : ''}</span>` +
        `<span class="card__blurb">${esc(placeText(p, 'blurb'))}</span>` +
        `<span class="card__tip">💡 ${esc(placeText(p, 'tip'))}</span>` +
      `</button>`;
    const btn = li.querySelector('button');
    btn.addEventListener('click', () => select(p.id, { from: 'list' }));
    cards.set(p.id, btn);
    return li;
  }

  PLACES.forEach((p) => markers.set(p.id, makeMarker(p)));

  function renderList() {
    cards.clear();
    listEl.replaceChildren(...PLACES.map(makeCard));
    if (activeId) setActiveClasses(activeId, true);
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* ignore */ }
    applyStaticText();
    applyBasemap();
    const keepScroll = { left: listEl.scrollLeft, top: listEl.scrollTop };
    renderList();
    listEl.scrollTo(keepScroll);
    PLACES.forEach((p) => {
      const m = markers.get(p.id);
      m.options.title = markerTitle(p);
      m.options.alt = nameOf(p);
      const el = m.getElement();
      if (el) { el.title = m.options.title; el.alt = m.options.alt; }
      m.setPopupContent(popupHTML(p));
    });
  }

  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  /* ---------- Selection ---------- */
  function setActiveClasses(id, on) {
    const card = cards.get(id);
    if (card) { card.classList.toggle('is-active', on); card.setAttribute('aria-pressed', String(on)); }
    const el = markers.get(id)?.getElement();
    if (el) el.classList.toggle('is-active', on);
  }

  function clearActive() {
    if (activeId) setActiveClasses(activeId, false);
    activeId = null;
  }

  function scrollCardIntoView(id) {
    const li = cards.get(id)?.parentElement;
    if (!li) return;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (isDesktop.matches) {
      listEl.scrollTo({ top: li.offsetTop - listEl.offsetTop - 4, behavior });
    } else {
      listEl.scrollTo({ left: li.offsetLeft - (listEl.clientWidth - li.clientWidth) / 2, behavior });
    }
  }

  function select(id, { from } = {}) {
    const marker = markers.get(id);
    if (!marker) return;
    if (activeId && activeId !== id) setActiveClasses(activeId, false);
    activeId = id;
    setActiveClasses(id, true);

    if (from === 'map') {
      scrollCardIntoView(id);
      return;
    }

    // From the list: make sure the map is visible, then reveal the marker (un-clustering if needed).
    if (!isDesktop.matches) mapWrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    const target = marker.getLatLng();
    map.setView(target, Math.max(map.getZoom(), 15), { animate: !reduceMotion });
    cluster.zoomToShowLayer(marker, () => {
      marker.openPopup();
      setActiveClasses(id, true); // marker element may have just been created
    });
  }

  /* ---------- Filtering & view ---------- */
  function visible(p) { return filter === 'all' || p.type === filter; }

  function fitView() {
    const pts = PLACES.filter((p) => visible(p) && !p.far).map((p) => [p.lat, p.lng]);
    if (!pts.length) return;
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 15, animate: !reduceMotion });
  }

  function applyFilter() {
    cluster.clearLayers();
    cluster.addLayers(PLACES.filter(visible).map((p) => markers.get(p.id)));
    listEl.querySelectorAll('li').forEach((li) => { li.hidden = !(filter === 'all' || li.dataset.type === filter); });
    if (activeId && !visible(PLACES.find((p) => p.id === activeId))) clearActive();
    listEl.scrollTo({ left: 0, top: 0 });
    fitView();
  }

  chips.forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    map.closePopup();
    applyFilter();
  }));

  document.getElementById('fit').addEventListener('click', () => { map.closePopup(); clearActive(); fitView(); });

  // Re-measure when the layout changes (rotation, desktop/mobile switch).
  window.addEventListener('resize', () => map.invalidateSize());

  // Initial render.
  applyStaticText();
  applyBasemap();
  renderList();
  cluster.addLayers(PLACES.map((p) => markers.get(p.id)));
  fitView();
})();
