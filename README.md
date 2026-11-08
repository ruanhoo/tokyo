# Hello Tokyo!

A cartoon, mobile-friendly, bilingual (English / 中文) travel site for Tokyo.

- **Classic map** (`index.html`): a Leaflet map of sights and food, with filters, cards and tips.
- **Living city** (`living/index.html`): a hand-drawn canvas model of Tokyo with little people, cars, boats and planes.

## Highlights of the living city

- **Tokyo Tower**, Tokyo Station, Shibuya, Shinjuku, Asakusa, Ueno, Ginza, Akihabara, Odaiba and the Rainbow Bridge.
- **Yamanote Line**: a closed loop on an elevated deck, with trains stopping at stations.
- **Shinkansen**: Tokaido and Tohoku bullet trains arriving at, dwelling in and leaving Tokyo Station. Click a train to see its card, or ride along.
- **Subway X-ray**: six colour-coded lines drawn under the streets, with a legend.
- **Haneda Airport** with planes, plus boats on the river and bay.
- Day, dusk and night lighting, and a pause button.
- **Route planner**: pick places or use your favourites, choose a start, travel mode and pace, and get a timed itinerary. It sends far-away places (such as Mt. Fuji) first, as day trips by express train.
- City journal, follow-a-person mode, a Stationmaster who makes announcements, favourites kept in `localStorage`, and a teleport portal to other cities.

## Run it locally

It is a static site with no build step. Serve the folder with any static server:

```sh
python3 -m http.server 8077
```

Then open <http://localhost:8077/> for the classic map or <http://localhost:8077/living/> for the living city.

Debug URL parameters for the living city include `tod=0..4`, `cam=x,y,zoom`, `view=world`, `panel=log|plan|drawer`, `subway=1`, `nointro`, `lang=zh`, and `portal=open`.

## Notes

- The geography and transit network are **illustrative**. Streets, lines and distances are simplified for the cartoon and are not for navigation.
- Map tiles are key-free: OpenStreetMap Japan (English labels) and standard OpenStreetMap (Chinese-region labels). No API keys are needed or stored.
- Leaflet and markercluster are vendored in `vendor/`.
- Fonts come from Google Fonts.

## Layout

```
index.html, css/, js/   classic map (data.js holds all places)
living/                 canvas city: geo, world, draw, transit, ui, teleport, strings
vendor/                 Leaflet + markercluster
```
