// Map tile provider settings (no API key required).
// English mode uses OpenStreetMap Japan's English-label style; Chinese mode uses the standard
// OpenStreetMap tiles (labelled in Japanese kanji). To use another provider, change `tileUrl`
// (and `tileAttribution` to match). Leave `tileUrl` empty to use plain OpenStreetMap everywhere.
window.TOKYO_CONFIG = {
  tileUrl: 'https://tile.openstreetmap.jp/styles/osm-bright-en/{z}/{x}/{y}.png',
  tileAttribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors ' +
    '· tiles © <a href="https://openstreetmap.jp/" target="_blank" rel="noopener">OpenStreetMap Japan</a>',
  tileOptions: { maxZoom: 18 },
};
