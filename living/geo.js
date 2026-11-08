// Geography and transit data for the living Tokyo map. Pure data + small helpers (no DOM), so it can
// also be loaded in Node for layout checks. Positions are real lat/lng pushed through one projection:
// north is up, the centre is gently magnified, and everything far from the centre is compressed.
// Coastline, rivers and rail routes are simplified and stylised on purpose: this is a cartoon.
(() => {
  'use strict';
  const KLAT = 111.2; const KLNG = 90.4; const LAT0 = 35.678; const LNG0 = 139.752; const SC = 165;
  const MAG = 0.5; const SIG = 380;
  const CORE = { x0: -1000, x1: 1050, y0: -1000, y1: 1050 };
  const GAP = 90; const COMP = 0.4;
  const WORLD = { x0: -1950, y0: -1250, x1: 1750, y1: 1700 };
  const squeeze = (v, a, b) => (v < a ? a - GAP + (v - a) * COMP : v > b ? b + GAP + (v - b) * COMP : v);
  function P(lat, lng) {
    let x = (lng - LNG0) * KLNG * SC; let y = -(lat - LAT0) * KLAT * SC;
    const f = 1 + MAG * Math.exp(-(((x * x + y * y) ** 0.5 / SIG) ** 2)); x *= f; y *= f;
    return [Math.round(squeeze(x, CORE.x0, CORE.x1)), Math.round(squeeze(y, CORE.y0, CORE.y1))];
  }
  const map = (arr) => arr.map((q) => P(q[0], q[1]));
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /* ---------- water ---------- */
  // north shore of Tokyo Bay, west to east
  const shore = map([[35.622, 139.738], [35.630, 139.748], [35.640, 139.755], [35.646, 139.7615], [35.653, 139.764], [35.659, 139.767],
    [35.6615, 139.7725], [35.658, 139.779], [35.650, 139.783], [35.644, 139.793], [35.641, 139.808], [35.637, 139.828], [35.634, 139.848],
    [35.632, 139.866], [35.636, 139.885], [35.645, 139.905]]);
  const A = shore[0]; const Z = shore[shore.length - 1];
  const sea = [
    [A[0] - 30, A[1] - 10], ...shore, [Z[0] + 400, Z[1] - 20], [WORLD.x1 + 80, Z[1] - 20], [WORLD.x1 + 80, WORLD.y1 + 80], [-300, WORLD.y1 + 80],
    [-310, WORLD.y1], [-420, 1560], [-330, 1400], [-170, 1290], [-190, 1160],
  ];
  // the Sumida river (north -> south), meets the bay near Tsukiji
  const river = map([[35.800, 139.803], [35.760, 139.806], [35.735, 139.806], [35.722, 139.803], [35.705, 139.8012], [35.693, 139.797],
    [35.680, 139.792], [35.668, 139.785], [35.657, 139.7815]]).concat([[470, 470], [480, 545]]);
  const RIVER_W = 56;
  // Odaiba (island) and Disney (reclaimed land), Haneda airport on the west shore
  const od = P(35.6275, 139.7765); void P(35.634, 139.883);
  const odaiba = { x: od[0], y: od[1] + 10, rx: 170, ry: 78 };
  const disney = { x: 1500, y: 905, rx: 190, ry: 92 };
  const haneda = { x: -190, y: 1195, w: 290, h: 74 };

  /* ---------- the palace, parks ---------- */
  const pal = P(35.6852, 139.7545);
  const palace = { x: pal[0], y: pal[1], rx: 128, ry: 98 };
  const parkAt = (id, lat, lng, rx, ry) => { const q = P(lat, lng); return { id, x: q[0], y: q[1], rx, ry }; };
  const parks = [
    parkAt('meiji', 35.6770, 139.6990, 150, 105), parkAt('ueno', 35.7148, 139.7715, 105, 85), parkAt('gyoen', 35.6850, 139.7100, 95, 70),
    parkAt('hama', 35.6595, 139.7630, 70, 50), parkAt('shiba', 35.6575, 139.7490, 70, 52),
  ];

  /* ---------- Yamanote loop (elevated), clockwise from Tokyo ---------- */
  const YAMA = [
    ['Tokyo', '东京', 35.6812, 139.7671], ['Yurakucho', '有乐町', 35.6750, 139.7628], ['Shimbashi', '新桥', 35.6666, 139.7587],
    ['Hamamatsucho', '滨松町', 35.6554, 139.7571], ['Tamachi', '田町', 35.6456, 139.7476], ['Shinagawa', '品川', 35.6285, 139.7388],
    ['Osaki', '大崎', 35.6197, 139.7286], ['Gotanda', '五反田', 35.6258, 139.7238], ['Meguro', '目黑', 35.6339, 139.7158],
    ['Ebisu', '惠比寿', 35.6467, 139.7101], ['Shibuya', '涩谷', 35.6580, 139.7016], ['Harajuku', '原宿', 35.6702, 139.7027],
    ['Yoyogi', '代代木', 35.6833, 139.7020], ['Shinjuku', '新宿', 35.6896, 139.7006], ['Shin-Okubo', '新大久保', 35.7012, 139.7000],
    ['Takadanobaba', '高田马场', 35.7127, 139.7038], ['Mejiro', '目白', 35.7213, 139.7066], ['Ikebukuro', '池袋', 35.7295, 139.7109],
    ['Otsuka', '大冢', 35.7314, 139.7285], ['Sugamo', '巢鸭', 35.7336, 139.7393], ['Komagome', '驹込', 35.7366, 139.7468],
    ['Tabata', '田端', 35.7381, 139.7609], ['Nippori', '日暮里', 35.7281, 139.7709], ['Uguisudani', '莺谷', 35.7206, 139.7780],
    ['Ueno', '上野', 35.7141, 139.7774], ['Okachimachi', '御徒町', 35.7077, 139.7748], ['Akihabara', '秋叶原', 35.6984, 139.7731],
    ['Kanda', '神田', 35.6918, 139.7708],
  ].map(([en, zh, lat, lng]) => { const q = P(lat, lng); return { en, zh, x: q[0], y: q[1] }; });

  /* ---------- subway lines ---------- */
  const L = (id, en, zh, color, stops) => ({ id, en, zh, color, stops: stops.map(([n, z, lat, lng]) => { const q = P(lat, lng); return { en: n, zh: z, x: q[0], y: q[1] }; }) });
  const SUBWAY = [
    L('G', 'Ginza Line', '银座线', '#ff9500', [
      ['Asakusa', '浅草', 35.7107, 139.7977], ['Ueno', '上野', 35.7110, 139.7770], ['Kanda', '神田', 35.6918, 139.7708], ['Nihombashi', '日本桥', 35.6820, 139.7745],
      ['Ginza', '银座', 35.6717, 139.7640], ['Shimbashi', '新桥', 35.6666, 139.7587], ['Toranomon', '虎之门', 35.6700, 139.7497],
      ['Akasaka-mitsuke', '赤坂见附', 35.6772, 139.7367], ['Aoyama-itchome', '青山一丁目', 35.6728, 139.7241], ['Omotesando', '表参道', 35.6653, 139.7126],
      ['Shibuya', '涩谷', 35.6591, 139.7036]]),
    L('M', 'Marunouchi Line', '丸之内线', '#f62e36', [
      ['Ikebukuro', '池袋', 35.7295, 139.7109], ['Korakuen', '后乐园', 35.7078, 139.7519], ['Ochanomizu', '御茶之水', 35.6993, 139.7654],
      ['Otemachi', '大手町', 35.6869, 139.7637], ['Tokyo', '东京', 35.6812, 139.7671], ['Ginza', '银座', 35.6717, 139.7640],
      ['Kasumigaseki', '霞关', 35.6728, 139.7506], ['Akasaka-mitsuke', '赤坂见附', 35.6772, 139.7367], ['Yotsuya', '四谷', 35.6862, 139.7300],
      ['Shinjuku-sanchome', '新宿三丁目', 35.6906, 139.7061], ['Shinjuku', '新宿', 35.6909, 139.6996]]),
    L('H', 'Hibiya Line', '日比谷线', '#a8a8a0', [
      ['Ueno', '上野', 35.7110, 139.7770], ['Akihabara', '秋叶原', 35.6984, 139.7746], ['Kodemmacho', '小传马町', 35.6872, 139.7782],
      ['Tsukiji', '筑地', 35.6666, 139.7702], ['Ginza', '银座', 35.6717, 139.7640], ['Hibiya', '日比谷', 35.6746, 139.7600],
      ['Kasumigaseki', '霞关', 35.6728, 139.7506], ['Roppongi', '六本木', 35.6628, 139.7314]]),
    L('Z', 'Hanzomon Line', '半藏门线', '#8f76d6', [
      ['Shibuya', '涩谷', 35.6591, 139.7036], ['Omotesando', '表参道', 35.6653, 139.7126], ['Aoyama-itchome', '青山一丁目', 35.6728, 139.7241],
      ['Nagatacho', '永田町', 35.6797, 139.7403], ['Kudanshita', '九段下', 35.6945, 139.7513], ['Otemachi', '大手町', 35.6869, 139.7637],
      ['Mitsukoshimae', '三越前', 35.6853, 139.7737], ['Suitengumae', '水天宫前', 35.6821, 139.7845], ['Kinshicho', '锦系町', 35.6968, 139.8140],
      ['Oshiage', '押上', 35.7102, 139.8128]]),
    L('A', 'Asakusa Line', '浅草线', '#e85298', [
      ['Asakusa', '浅草', 35.7112, 139.7966], ['Kuramae', '藏前', 35.7013, 139.7913], ['Higashi-nihombashi', '东日本桥', 35.6916, 139.7840],
      ['Ningyocho', '人形町', 35.6862, 139.7827], ['Higashi-ginza', '东银座', 35.6699, 139.7673], ['Shimbashi', '新桥', 35.6666, 139.7587],
      ['Daimon', '大门', 35.6551, 139.7556], ['Sengakuji', '泉岳寺', 35.6385, 139.7381]]),
    L('T', 'Tozai Line', '东西线', '#009bbf', [
      ['Nakano', '中野', 35.7056, 139.6659], ['Takadanobaba', '高田马场', 35.7122, 139.7035], ['Iidabashi', '饭田桥', 35.7020, 139.7453],
      ['Kudanshita', '九段下', 35.6945, 139.7513], ['Otemachi', '大手町', 35.6869, 139.7637], ['Nihombashi', '日本桥', 35.6820, 139.7745],
      ['Kayabacho', '茅场町', 35.6797, 139.7803], ['Monzen-nakacho', '门前仲町', 35.6720, 139.7963], ['Toyocho', '东阳町', 35.6697, 139.8174]]),
  ];

  // downtown clusters: tall office towers are built around these
  const hubs = [['tokyo', 35.6830, 139.7640, 230], ['shinjuku', 35.6896, 139.6940, 170], ['shibuya', 35.6595, 139.7005, 130], ['roppongi', 35.6604, 139.7292, 130],
    ['ikebukuro', 35.7295, 139.7109, 120], ['shiodome', 35.6620, 139.7600, 110]].map(([id, lat, lng, r]) => { const q = P(lat, lng); return { id, x: q[0], y: q[1], r }; });

  window.TK_GEO = { P, inPoly, WORLD, CORE, shore, sea, river, RIVER_W, odaiba, disney, haneda, palace, parks, YAMA, SUBWAY, hubs, SC };
})();
