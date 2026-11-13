# Instant Map

A map that arrives as one image and becomes interactive when you touch it.

Most pages that show a map load a 200–800 KB library, fetch a style, fonts and dozens of tiles, then draw on the GPU before the visitor sees anything. Instant Map turns that around: the first view is a single cached JPEG rendered at the edge, with your markers already in it. A 4.5 KB custom element takes over with raster tiles only when someone pans or zooms.

| Tier | What loads | When |
| --- | --- | --- |
| **Still** | One `<img>` from `/static` | Always. 0 KB of JavaScript. |
| **Glide** | `instant-map.js` (4.5 KB gzipped) and 512 px tiles from `/tiles` | On the first pointer, touch, focus or wheel. |
| **Vector** | Not built yet | For apps that need rotation or live restyling. |

## How it works

- `crates/render` is a Rust renderer. It decodes Mapbox Vector Tiles in the [Protomaps](https://protomaps.com) schema, draws them with [tiny-skia](https://github.com/linebender/tiny-skia), sets type from SDF glyphs, and encodes a progressive JPEG (or PNG). A 1280×800 frame with labels renders in 20–80 ms natively.
- Labels are placed per tile, so a static image is pixel-for-pixel the same picture as the tile mosaic at the same integer zoom. The static image and the interactive map never disagree.
- Markers in static images are clustered into count bubbles and block labels, so a city name steps aside instead of hiding under a listing.
- `crates/wasm` compiles the renderer to WebAssembly (SIMD, 490 KB) for Cloudflare Workers. The browser never downloads it.
- `worker/` serves `/static`, `/tiles/{z}/{x}/{y}[@2x].jpg`, the client and a demo page. Upstream vector tiles and rendered images both sit in Cloudflare's cache.

## Use it

```html
<instant-map center="-96.95,32.85" zoom="9" markers="-96.8,32.78,$42;-97.33,32.75">
  <img src="https://your-worker/static?center=-96.95,32.85&zoom=9&size=1280x560&markers=-96.8,32.78,$42;-97.33,32.75" alt="Map">
</instant-map>
<script type="module" src="https://your-worker/instant-map.js"></script>
```

`/static` takes `center=lng,lat`, `zoom` (0–18), `size=WxH` (up to 1280), `r` (1 or 2), `markers=lng,lat[,label];…` (up to 2,000), `cluster` (pixels, 0 to turn off) and `format=png`.

The element exposes `camera`, `setCamera({ center, zoom })`, `project(lng, lat)` and `onMove(listener)`, and fires a `move` event.

## Develop

```bash
cargo test
cargo run --release --example render -- regional out.png   # national | regional | metro | city
./scripts/build-wasm.sh                                       # needs wasm-bindgen-cli 0.2.129
cd worker && bun install && bunx wrangler dev
```

Set `TILE_URL` in `worker/wrangler.jsonc` to your own Protomaps-schema tile endpoint before deploying. Rendering takes more CPU than the Workers free plan allows per request, so deploy on the paid plan.

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Show this credit wherever the map appears; the client adds it for you. Type is Noto Sans (SIL Open Font License). The fixtures in `fixtures/` carry the same terms.

MIT licensed.
