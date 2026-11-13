# Instant Map

A map for the web that is on the page before your JavaScript is.

Instant Map sends a finished image of your map first, markers and all, as a plain `<img>`. The moment someone reaches for it, a 13 KB custom element turns that image into a smooth, clickable map: drag, zoom, clusters, keyboard and a listing card. One web component works in every framework.

- **Site and docs:** [instantmap.org](https://instantmap.org)
- **Quick start:** [instantmap.org/docs/start/quick-start](https://instantmap.org/docs/start/quick-start/)
- **For AI agents:** [instantmap.org/llms.txt](https://instantmap.org/llms.txt). Every docs page is also Markdown at its address plus `.md`.

## Use it

```bash
npm install instantmap
```

```html
<script type="module" src="https://instantmap.org/instant-map.js"></script>

<instant-map center="-122.42,37.77" zoom="12" style="height:480px"></instant-map>

<script type="module">
  const map = document.querySelector("instant-map");
  map.markers = [{ id: 1, lng: -122.41, lat: 37.78, label: "$4,950", title: "Sunny 2-bed flat", href: "/listings/1" }];
</script>
```

With a server-rendered framework, render the first image on the server so it paints with the HTML:

```tsx
import { InstantMap } from "instantmap/react";

<InstantMap center={[-122.42, 37.77]} zoom={12} markers={listings} style={{ height: 480 }} />;
```

Guides with a working example app for each: [Next.js](https://instantmap.org/docs/frameworks/nextjs/), [React](https://instantmap.org/docs/frameworks/react/), [React Router](https://instantmap.org/docs/frameworks/react-router/), [Astro](https://instantmap.org/docs/frameworks/astro/), [Vue](https://instantmap.org/docs/frameworks/vue/), [Nuxt](https://instantmap.org/docs/frameworks/nuxt/), [SvelteKit](https://instantmap.org/docs/frameworks/sveltekit/), [Angular](https://instantmap.org/docs/frameworks/angular/), [Solid](https://instantmap.org/docs/frameworks/solid/) and [plain HTML](https://instantmap.org/docs/frameworks/html/). The apps are in [`examples/`](examples/).

## How it works

| Step | What loads | When |
| --- | --- | --- |
| **Image** | One JPEG from `/static`, with your markers drawn in | With the HTML. No JavaScript. |
| **Map** | `instant-map.js` (13 KB gzipped) and 512 px tiles from `/tiles` | On the first pointer, touch, focus or wheel. |

- `crates/render` is a Rust renderer. It decodes Mapbox Vector Tiles in the [Protomaps](https://protomaps.com) schema, draws them with [tiny-skia](https://github.com/linebender/tiny-skia), sets type from SDF glyphs, and encodes a JPEG or PNG.
- Labels are placed per tile, so the first image and the live tiles show the same picture. Markers are clustered the same way on the server and in the browser, so nothing jumps at the hand-off.
- `crates/wasm` compiles the renderer to WebAssembly for Cloudflare Workers. The browser never downloads it.
- `worker/` serves `/static`, `/tiles/{z}/{x}/{y}[@2x].jpg` and the site. Upstream tiles and rendered images are cached at the edge.
- `packages/instantmap` is the npm package: the element, the React component and `staticUrl()` for the server.
- `site/` is the landing page and the docs (Astro and Starlight).

## Develop

```bash
bun install
cargo test
./scripts/build-wasm.sh          # needs wasm-bindgen-cli 0.2.129
bun run build                    # wasm, package and site
cd worker && bunx wrangler dev   # site, /static and /tiles on localhost:8787
```

To run your own server, set `TILE_URL` in `worker/wrangler.jsonc` to a Protomaps-schema tile endpoint and deploy the Worker. Rendering uses more CPU than the Workers free plan allows per request, so it needs the paid plan. See [Self-hosting](https://instantmap.org/docs/guides/self-hosting/).

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Show this credit wherever the map appears; the element adds it for you. Type is Noto Sans (SIL Open Font License). The fixtures in `fixtures/` carry the same terms.

MIT licensed.
