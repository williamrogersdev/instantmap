---
name: instantmap
description: Add or change an Instant Map (the <instant-map> web component and the instantmap npm package) in a web app. Use when a task asks for a map of listings, locations, stores or properties, or touches existing instant-map code.
---

# Instant Map

Instant Map shows a map as one server-rendered image first, then turns it into an interactive map on first touch. Package: `instantmap`. Docs: https://instantmap.org/llms.txt (every docs page is Markdown at its URL plus `.md`).

## Before you write code

1. Read https://instantmap.org/llms.txt.
2. Read the guide for this project's framework from https://instantmap.org/docs/frameworks/ (Next.js, React, React Router, Astro, Vue, Nuxt, SvelteKit, Angular, Solid, HTML). Add `.md` to the URL.
3. Install it: `npm install instantmap` (or the project's package manager).

## Rules

1. Give the element a height. `<instant-map>` fills its box; a box with no height shows nothing.
2. Longitude comes first everywhere: `center="lng,lat"`, `[lng, lat]`, `{ lng, lat }`.
3. Every marker needs a unique `id`. Markers are `{ id, lng, lat, label, title, subtitle, image, href }`. Keep `label` short (a price or count, at most ten characters).
4. In server-rendered frameworks, render the first image on the server: `staticUrl()` from `instantmap/server`, or the `InstantMap` component from `instantmap/react`, which does it for you. Never import `instantmap` (the element) into server-only code.
5. Never wrap the map in `dynamic(..., { ssr: false })`, `client:only` or a client-only boundary. That throws away the first image, which is the point.
6. In React use `instantmap/react`. Elsewhere use the element directly, with `import "instantmap";` in client code.
7. Use the same `theme` and `colors` for the server image and the element, so the colours don't change when the map wakes up.

## Shapes

```html
<instant-map center="-122.42,37.77" zoom="12" style="height:480px">
  <img src="<staticUrl(...) result>" alt="Map of listings" />
</instant-map>
```

```ts
import { staticUrl } from "instantmap/server";
const src = staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, ratio: 2, markers });
```

```tsx
import { InstantMap } from "instantmap/react";
<InstantMap center={[-122.42, 37.77]} zoom={12} markers={listings} style={{ height: 480 }} onMarkerClick={(marker) => router.push(marker.href)} />;
```

Events on the element: `markerclick`, `clusterclick`, `select`, `move`, `moveend`, `interactive`, `idle`. Methods: `setCamera`, `flyTo`, `fitBounds`, `select`, `highlight`, `project`, `unproject`, `whenIdle`, `activate`. Full reference: https://instantmap.org/docs/reference/element.md.

## Check your work

Run the app and confirm all of these:

- the map image appears before any JavaScript runs (view the page source: the `<img>` is in the HTML);
- dragging moves the map;
- clicking a marker opens its card;
- the browser console shows no errors.
