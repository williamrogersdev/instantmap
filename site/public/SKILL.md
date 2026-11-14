---
name: instantmap
description: Add or change an Instant Map (the <instant-map> web component and the instantmap-js npm package) in a web app. Use when a task asks for a map of listings, locations, stores or properties, or touches existing instant-map code.
---

# Instant Map

Instant Map shows a map as one server-rendered image first, then turns it into an interactive map on first touch. Package: `instantmap-js`. Docs: https://instantmap.org/llms.txt (every docs page is Markdown at its URL plus `.md`).

## Before you write code

1. Read https://instantmap.org/llms.txt.
2. Read the guide for this project's framework from https://instantmap.org/docs/frameworks/ (Next.js, React, React Router, Astro, Vue, Nuxt, SvelteKit, Angular, Solid, HTML). Add `.md` to the URL.
3. Install it: `npm install instantmap-js` (or the project's package manager).

## Rules

1. Give the element a height. `<instant-map>` fills its box; a box with no height shows nothing.
2. Longitude comes first everywhere: `center="lng,lat"`, `[lng, lat]`, `{ lng, lat }`.
3. Every marker needs a unique `id`. Markers are `{ id, lng, lat, label, title, subtitle, image, badge, href }`. Keep `label` short (a price or count, at most ten characters). `label` is also shown as the price on the card.
4. In server-rendered frameworks, render the first image on the server: `staticUrl()` from `instantmap-js/server`, or the `InstantMap` component from `instantmap-js/react`, which does it for you. Never import `instantmap-js` (the element) into server-only code.
5. Never wrap the map in `dynamic(..., { ssr: false })`, `client:only` or a client-only boundary. That throws away the first image, which is the point.
6. In React use `instantmap-js/react`. Elsewhere use the element directly, with `import "instantmap-js";` in client code.
7. Use the same `theme` and `colors` for the server image and the element, so the colours don't change when the map wakes up.
8. For brand colours, call `brandTheme({ primary, background, foreground })` and spread the result (`{ theme, colors }`) into `staticUrl()`, `<InstantMap />` or `posterHtml()`. Do not pick colour tokens by hand unless asked. See https://instantmap.org/docs/guides/theming.md.
9. Use the built-in card before writing your own. Do not build popup HTML by hand for a plain listing card.
10. Serve card images about 560 px wide (the card is 264 px wide), in WebP or AVIF, with long cache headers.

## Size and loading

`instant-map.js` is a loader of about 7 KB gzipped. The engine (tiles, gestures, markers, cards), about 11 KB gzipped, is fetched on the first pointer enter, touch, focus or wheel, or per the `load` attribute (`intent`, `visible`, `eager`, `none`). Do not claim any other size.

## Cards

A selected marker opens a card. `map.popup` unset: the built-in card, or a `<template data-card>` child if there is one. A function: your own renderer. `null` (or `card="off"`): no card. In React, `renderPopup` is the function, and `renderPopup={null}` turns cards off. If a click should go straight to a page, set `popup = null` and navigate on `markerclick`.

Customise in this order and stop when it looks right:

1. Marker fields: `title`, `subtitle`, `label`, `image`, `badge`, `href`.
2. Options: attributes `card-layout="stacked|row"`, `card-action="Link text"` (empty or `off` hides the link), `card-target="_blank"`; or the `card` property or React `card` prop: `{ layout, action, target, closeLabel }`.
3. CSS custom properties on `instant-map` or an ancestor: `--im-card-width`, `--im-card-radius`, `--im-card-padding`, `--im-card-background`, `--im-card-color`, `--im-card-muted`, `--im-card-accent`, `--im-card-shadow`, `--im-card-font`, `--im-card-image-ratio`, `--im-card-placeholder`. Stable classes inside `.instant-map-card`: `.media`, `.badge`, `.body`, `.title`, `.subtitle`, `.foot`, `.price`, `.action`, `.close`, and `.row`.
4. A template:

```html
<instant-map ...>
  <template data-card>
    <article>
      <button type="button" data-close aria-label="Close">x</button>
      <h3>{{title}}</h3>
      <p>{{subtitle}} · {{data.beds}} beds</p>
      <a href="{{href}}" data-if="href">Open</a>
    </article>
  </template>
</instant-map>
```

Placeholders are filled as text, never markup. Links and images only allow http(s), mailto, tel and relative addresses. `data-if="field"` drops an element when the field is empty. `on*` attributes are removed.

`card-images="visible|hover|off"` (`cardImages` in React) sets when card images are fetched ahead of a click. Default `visible`.

`defaultCard`, `cardFromTemplate`, `safeUrl`, `escapeHtml` and `CARD_CSS` come from `instantmap-js/card`. The built-in card is `defaultCard(marker, options)`, and the resolved colours are `resolvePalette(map.theme, map.colors)`. The map element has no palette property and there is no default-popup export.

## Brand colours

```ts
import { brandTheme } from "instantmap-js/server"; // also from "instantmap-js" or "instantmap-js/brand"
const brand = brandTheme({ primary: "#e11d48", background: "#fff7ed", foreground: "#1c1917" });
staticUrl({ center, zoom, width, height, ...brand });
// <InstantMap {...brand} />   posterHtml({ ..., ...brand })   or map.theme = brand.theme; map.colors = brand.colors
```

Inputs: `primary` (required), `background`, `foreground`, `accent`, `water`, `park`, `mode` (`"light"` or `"dark"`), `tint` (0 to 1). Colours may be `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or bare `h s% l%` triplets (shadcn tokens). On the server, convert `oklch()` to one of those first.

In the browser, `brandThemeFromCss({ primary: "--primary", background: "--background", foreground: "--foreground" })` reads CSS variables (any colour syntax, including `oklch()`). It runs after CSS loads, so for a server-rendered first image pass the same token values to `brandTheme()` on the server.

## Entry points

`instantmap-js` (element, `staticUrl`, `clusterAt`, themes, `resolvePalette`, `brandTheme`), `instantmap-js/server` (no element, no `window`; adds `posterHtml`), `instantmap-js/react`, `instantmap-js/card`, `instantmap-js/brand`, `instantmap-js/instant-map.js` (script-tag build).
## Shapes

```html
<instant-map center="-122.42,37.77" zoom="12" style="height:480px">
  <img src="<staticUrl(...) result>" alt="Map of listings" />
</instant-map>
```

```ts
import { staticUrl } from "instantmap-js/server";
const src = staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, ratio: 2, markers });
```

```tsx
import { InstantMap } from "instantmap-js/react";
<InstantMap center={[-122.42, 37.77]} zoom={12} markers={listings} style={{ height: 480 }} onMarkerClick={(marker) => router.push(marker.href)} />;
```

Events on the element: `markerclick`, `markerenter`, `markerleave`, `clusterclick`, `select`, `move`, `moveend`, `interactive`, `idle`. Methods: `setCamera`, `flyTo`, `fitBounds`, `select`, `highlight`, `getMarker`, `project`, `unproject`, `whenIdle`, `activate`. Full reference: https://instantmap.org/docs/reference/element.md.

## Check your work

Run the app and confirm all of these:

- the map image appears before any JavaScript runs (view the page source: the `<img>` is in the HTML);
- dragging moves the map;
- clicking a marker opens its card (with its photo, if it has an `image`);
- the browser console shows no errors.

## Limits

Images are at most 1280 px on each side and 2000 markers (clusters count). Static images take zoom 0 to 18, tiles go to zoom 15, and the map zooms to 19. The map does not do 3D, rotation, pitch or drawing shapes. Map data is OpenStreetMap: keep the attribution the element shows, or add "© OpenStreetMap contributors" next to a standalone `/static` image. A production site should use its own server (https://instantmap.org/docs/guides/self-hosting.md); it needs the Cloudflare Workers Paid plan.
