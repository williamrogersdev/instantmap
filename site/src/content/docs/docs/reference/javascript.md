---
title: JavaScript API
description: Exports of instantmap and instantmap/server — staticUrl, posterHtml, clusterAt, themes and types.
sidebar:
  order: 3
---

The package has three entry points:

| Import | Use it in | Contains |
| --- | --- | --- |
| `instantmap` | Browser code | Defines `<instant-map>`, plus everything in `instantmap/server`. |
| `instantmap/server` | Servers, build scripts, edge functions, React Server Components | URL and HTML helpers. Defines no element and never touches `window`. |
| `instantmap/react` | React 18 and 19, Next.js, Remix | The [`<InstantMap>` component](/docs/reference/react/). |

All three ship ES modules with TypeScript types.

## `staticUrl(options)`

Returns the URL of a finished map image. This is the function that makes the first paint instant: render the URL into an `<img>` on the server, and the browser shows the map before any JavaScript arrives.

```ts
import { staticUrl } from "instantmap/server";

const url = staticUrl({
  center: [-97.7431, 30.2672],
  zoom: 12,
  width: 1200,
  height: 630,
  ratio: 2,
  theme: "daylight",
  markers: listings.map((listing) => ({ lng: listing.lng, lat: listing.lat, label: `$${listing.price}` })),
});
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `center` | `[lng, lat]` | required | |
| `zoom` | `number` | required | |
| `width`, `height` | `number` | required | CSS pixels, at most 1280 each. Use the element's own aspect ratio. |
| `ratio` | `1 \| 2` | `1` | Use `2` for crisp images on retina screens. |
| `theme` | `"daylight" \| "midnight" \| "paper" \| "mono"` | `"daylight"` | |
| `colors` | `Partial<Record<PaletteKey, string>>` | none | Token overrides. |
| `markers` | `{ lng, lat, label? }[]` | none | Any number. Clustered and cropped to the frame before they go in the URL. |
| `cluster` | `number \| false` | `44` | Same value you give the element. |
| `src` | `string` | `"https://instantmap.org"` | Your own server's origin. |
| `format` | `"jpg" \| "png"` | `"jpg"` | |

## `posterHtml(options)`

Returns a complete `<instant-map>` element as an HTML string, with its poster image inside, for templates that are not React: Express, Hono, Astro's `set:html`, PHP, emails, Markdown.

```ts
import { posterHtml } from "instantmap/server";

const html = posterHtml({ center: [-0.1276, 51.5072], zoom: 11, width: 1280, height: 720, markers });
```

It takes every `staticUrl` option, plus:
- `alt`
- `className`
- `load`

The string sets `aspect-ratio` from `width` and `height`, so the map holds its space before it loads. `ratio` defaults to `2` here.

## `clusterAt(markers, zoom, distance?)`

The clustering function the element and the server both run. Use it when you need the same groups outside the map, for example a list that says "12 listings in this area".

```ts
import { clusterAt } from "instantmap";

for (const group of clusterAt(markers, Math.floor(map.camera.zoom))) {
  group.members; // Marker[]
}
```

Positions are in world pixels at that zoom. The result is the same whatever the viewport.

## `defineInstantMap(tagName?)`

`instantmap` calls this when imported. Call it yourself only to register the element under another tag name.

## Themes

```ts
import { THEMES, PALETTE_KEYS, resolvePalette } from "instantmap";

resolvePalette("midnight", { accent: "#ff5a5f" }); // → full Palette
```

## Types

```ts
import type { Marker, Camera, Bounds, LngLat, Cluster, Theme, Palette, PaletteKey, InstantMapElement } from "instantmap";
```

`InstantMapElement<Data>` is generic over your marker `data` type:

```ts
const map = document.querySelector("instant-map") as InstantMapElement<{ sqft: number }>;
map.addEventListener("markerclick", (event) => {
  event.detail.marker.data?.sqft;
});
```

Importing `instantmap` registers `"instant-map"` in `HTMLElementTagNameMap`, so `document.querySelector("instant-map")` is typed for you.
