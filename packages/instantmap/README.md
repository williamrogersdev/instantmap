# instantmap-js

A map for the web that is on the page before your JavaScript is. It arrives as one image with your markers drawn in, then turns into a fast, clickable map on first touch. About 7 KB gzipped before anyone touches the map and about 11 KB more on first touch, no dependencies, any framework.

```bash
npm install instantmap-js
```

## Any page

Import the package once in your bundled JavaScript (`import "instantmap-js";`), or load the hosted build without a bundler:

```html
<script type="module" src="https://instantmap.org/instant-map.js"></script>

<instant-map center="-122.42,37.77" zoom="12" style="height:480px"></instant-map>

<script type="module">
  const map = document.querySelector("instant-map");
  map.markers = await fetch("/api/listings").then((response) => response.json());
  map.addEventListener("markerclick", (event) => (location.href = event.detail.marker.href));
</script>
```

Markers are `{ id, lng, lat, label, title, subtitle, image, badge, href }`. A marker with a `label` shows as a price pill; one without shows as a dot. Clicking a marker opens a card built from `title`, `subtitle`, `image`, `badge`, `label` and `href`.

## React and Next.js

```tsx
import { InstantMap } from "instantmap-js/react";

export function ListingsMap({ listings }) {
  return <InstantMap center={[-122.42, 37.77]} zoom={12} markers={listings} style={{ height: 480 }} />;
}
```

The component renders the first image on the server, so the map paints with the HTML.

## Server-rendered first image anywhere

```ts
import { staticUrl } from "instantmap-js/server";

const src = staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, markers });
// Put <img src={src}> inside <instant-map>.
```

## Cards

The built-in card needs no code. Change it in four steps, using only what you need:

- Marker fields: `title`, `subtitle`, `label` (shown as the price), `image`, `badge`, `href`.
- Options: `card-layout="stacked|row"`, `card-action="Link text"` (empty or `off` hides it), `card-target="_blank"`, or `map.card = { layout, action, target, closeLabel }`. In React, the `card` prop.
- CSS variables on `instant-map`: `--im-card-width`, `--im-card-radius`, `--im-card-padding`, `--im-card-background`, `--im-card-color`, `--im-card-muted`, `--im-card-accent`, `--im-card-shadow`, `--im-card-font`, `--im-card-image-ratio`, `--im-card-placeholder`.
- A `<template data-card>` child with `{{title}}` and `{{data.beds}}` placeholders, or `map.popup = (marker) => element`. `map.popup = null` or `card="off"` turns cards off.

Card images are fetched ahead of the click for up to 8 markers nearest the centre (`card-images="visible|hover|off"`, `cardImages` in React). Serve them about 560 px wide, in WebP or AVIF, with long cache headers.

## Brand colours

```ts
import { brandTheme } from "instantmap-js/server";

const brand = brandTheme({ primary: "#e11d48", background: "#fff7ed", foreground: "#1c1917" });

staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, ...brand });
// <InstantMap {...brand} />, posterHtml({ ...brand }), or map.theme = brand.theme; map.colors = brand.colors
```

`brandTheme` accepts `#rgb`, `#rrggbb`, `rgb()`, `hsl()` and bare `h s% l%` triplets. In the browser, `brandThemeFromCss({ primary: "--primary", background: "--background", foreground: "--foreground" })` reads CSS variables, including `oklch()` values.

## Entry points

| Import | Contains |
| --- | --- |
| `instantmap-js` | The `<instant-map>` element, `staticUrl`, `clusterAt`, themes, `resolvePalette`, `brandTheme` |
| `instantmap-js/server` | `staticUrl`, `posterHtml`, themes, `brandTheme`. No element, no `window`. |
| `instantmap-js/react` | The `<InstantMap>` component |
| `instantmap-js/card` | `defaultCard`, `cardFromTemplate`, `safeUrl`, `escapeHtml`, `CARD_CSS` |
| `instantmap-js/brand` | `brandTheme`, `brandThemeFromCss` |
| `instantmap-js/instant-map.js` | The ready-built script-tag loader |

## Develop

From the repository root:

```bash
bun install
cargo test
./scripts/build-wasm.sh
bun run build
(cd packages/instantmap && bun test)
(cd worker && bun test)
(cd worker && bunx wrangler dev)
```

## Docs

- Quick start, API reference and framework guides: [instantmap.org/docs](https://instantmap.org/docs/start/quick-start/)
- For AI agents: [instantmap.org/llms.txt](https://instantmap.org/llms.txt)

Map data © OpenStreetMap contributors. MIT licensed.
