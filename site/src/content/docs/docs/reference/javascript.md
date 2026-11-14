---
title: JavaScript API
description: Exports of instantmap, instantmap-js/server, instantmap-js/card and instantmap-js/brand, including staticUrl, posterHtml, brandTheme, clusterAt, themes and types.
sidebar:
  order: 3
---

The package has these entry points:

| Import | Use it in | Contains |
| --- | --- | --- |
| `instantmap-js` | Browser code | Defines `<instant-map>`, plus `staticUrl`, `tileUrl`, `clusterAt`, themes, `brandTheme` and `brandThemeFromCss`. `posterHtml` is in `instantmap-js/server`. |
| `instantmap-js/server` | Servers, build scripts, edge functions, React Server Components | `staticUrl`, `tileUrl`, `posterHtml`, `clusterAt`, themes, colour helpers, `brandTheme` and `brandThemeFromCss`. Defines no element and never touches `window`. |
| `instantmap-js/react` | React 18 and 19, Next.js, Remix | The [`<InstantMap>` component](/docs/reference/react/). |
| `instantmap-js/card` | Code that builds its own card | `defaultCard`, `cardFromTemplate`, `safeUrl`, `escapeHtml`, `CARD_CSS`. |
| `instantmap-js/brand` | Anywhere | `brandTheme`, `brandThemeFromCss`, and the `BrandInput` and `BrandTheme` types. |
| `instantmap-js/instant-map.js` | A script tag | The ready-built loader that defines `<instant-map>`. It is what `https://instantmap.org/instant-map.js` serves. |

All of them ship ES modules with TypeScript types.

The element is split in two. `instant-map.js` is a small loader, about 7 KB gzipped, that holds the element and its first image. The engine (tiles, gestures, markers, cards), about 11 KB gzipped, is fetched on the first sign of intent, or as the `load` attribute says.

## `staticUrl(options)`

Returns the URL of a finished map image. This is the function that makes the first paint instant: render the URL into an `<img>` on the server, and the browser shows the map before any JavaScript arrives.

```ts
import { staticUrl } from "instantmap-js/server";

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
| `colors` | `Partial<Record<PaletteKey, string>>` | none | Token overrides. They are written to the address in alphabetical order. |
| `markers` | `{ lng, lat, label? }[]` | none | Any number. Clustered and cropped to the frame before they go in the URL. |
| `cluster` | `number \| false` | `44` | Same value you give the element. |
| `src` | `string` | `"https://instantmap.org"` | Your own server's origin. |
| `format` | `"jpg" \| "png"` | `"jpg"` | |

## `posterHtml(options)`

Returns a complete `<instant-map>` element as an HTML string, with its poster image inside, for templates that are not React: Express, Hono, Astro's `set:html`, PHP, emails, Markdown.

```ts
import { posterHtml } from "instantmap-js/server";

const html = posterHtml({ center: [-0.1276, 51.5072], zoom: 11, width: 1280, height: 720, markers });
```

It takes every `staticUrl` option, plus:
- `alt`
- `className`
- `load`

It writes `center`, `zoom`, `theme`, `colors`, `load` and `src` as attributes on the element, so the live map starts with the same look as the image.

The string sets `aspect-ratio` from `width` and `height`, so the map holds its space before it loads. `ratio` defaults to `2` here.

## `clusterAt(markers, zoom, distance?)`

The clustering function the element and the server both run. Use it when you need the same groups outside the map, for example a list that says "12 listings in this area".

```ts
import { clusterAt } from "instantmap-js";

for (const group of clusterAt(markers, Math.floor(map.camera.zoom))) {
  group.members; // Marker[]
}
```

Positions are in world pixels at that zoom. The result is the same whatever the viewport.

## `defineInstantMap(tagName?)`

`instantmap-js` calls this when imported. Call it yourself only to register the element under another tag name.

## `brandTheme(input)`

Builds a map theme from the colours of a style guide. Available from `instantmap-js`, `instantmap-js/server` and `instantmap-js/brand`.

```ts
import { brandTheme } from "instantmap-js/server";

const brand = brandTheme({ primary: "#e11d48", background: "#fff7ed", foreground: "#1c1917" });
// { theme: "daylight", colors: { … } }

staticUrl({ center, zoom, width, height, ...brand });
```

| Input | Type | Notes |
| --- | --- | --- |
| `primary` | `string` | Required. Markers, clusters and highways. |
| `background` | `string` | The page colour. Land is a tint of it. |
| `foreground` | `string` | Text colour. Labels and outlines are mixed from it. |
| `accent` | `string` | The selected marker. Default: the foreground colour. |
| `water` | `string` | Default: a quiet blue leaning toward the brand colour. |
| `park` | `string` | Default: a quiet green. |
| `mode` | `"light" \| "dark"` | Default: decided from `background`. |
| `tint` | `number` | `0` to `1`. How strongly the brand colour tints land, water and roads. Default `0.5`. |

Colours can be `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or a bare `h s% l%` triplet. It throws a `TypeError` if `primary` cannot be read. It returns `{ theme, colors }`, where `theme` is `"daylight"` or `"midnight"` and `colors` holds only the values that differ from that theme. Label and marker text colours are adjusted to stay readable.

Use it in `staticUrl({ ...brand })`, `posterHtml({ ...brand })`, `<InstantMap {...brand} />`, or set `map.theme` and `map.colors`.

## `brandThemeFromCss(tokens, options?)`

Reads brand colours from CSS custom properties in the browser, so the map follows the same tokens as the rest of the page. Any CSS colour syntax works, including `oklch()`.

```ts
import { brandThemeFromCss } from "instantmap-js/brand";

const brand = brandThemeFromCss({ primary: "--primary", background: "--background", foreground: "--foreground" });
```

`tokens` maps `primary`, `background`, `foreground`, `accent`, `water` and `park` to custom property names. `options` is `{ element?, mode?, tint? }`: `element` is where the properties are read (default `document.documentElement`). It throws a `TypeError` if the `primary` property is missing or not a colour.

It runs after your CSS has loaded, so for a server-rendered first image pass the same token values to `brandTheme()` on the server.

## Themes

```ts
import { THEMES, PALETTE_KEYS, resolvePalette } from "instantmap-js";

resolvePalette("midnight", { accent: "#ff5a5f" }); // → full Palette
resolvePalette(map.theme, map.colors);             // the colours a map is using now
```

`resolvePalette(theme, colors?)` returns the full palette. The map element has no palette property. `instantmap-js/server` also exports `encodeColors`, `decodeColors`, `decodePaletteColors` and `paletteWords`.

## `instantmap-js/card`

The pieces of the built-in card, for code that draws its own popup.

```ts
import { defaultCard, cardFromTemplate, safeUrl, escapeHtml, CARD_CSS } from "instantmap-js/card";
```

| Export | What it does |
| --- | --- |
| `defaultCard(marker, options?)` | The built-in card as an element, or `null` when the marker has no `title`, `subtitle` or `image`. `options` is `CardOptions`. |
| `cardFromTemplate(template, marker)` | Fills a `<template data-card>` for one marker, as described in [Cards and popups](/docs/guides/popups/#4-a-template-in-your-html). |
| `safeUrl(value)` | Returns the address if it is `http`, `https`, `mailto`, `tel` or relative, and `""` otherwise. |
| `escapeHtml(value)` | Escapes `& < > " '`. |
| `CARD_CSS` | The built-in card's stylesheet, as a string. |

## Types

```ts
import type { Marker, Camera, Bounds, LngLat, Cluster, Theme, Palette, PaletteKey, CardOptions, CardImages, BrandInput, BrandTheme, InstantMapElement } from "instantmap-js";
```

`InstantMapElement<Data>` is generic over your marker `data` type:

```ts
const map = document.querySelector("instant-map") as InstantMapElement<{ sqft: number }>;
map.addEventListener("markerclick", (event) => {
  event.detail.marker.data?.sqft;
});
```

Importing `instantmap-js` registers `"instant-map"` in `HTMLElementTagNameMap`, so `document.querySelector("instant-map")` is typed for you.
