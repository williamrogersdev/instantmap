# instantmap

A map for the web that is on the page before your JavaScript is. It arrives as one image with your markers drawn in, then turns into a fast, clickable map on first touch. 13 KB gzipped, no dependencies, any framework.

```bash
npm install instantmap
```

## Any page

Import the package once in your bundled JavaScript (`import "instantmap";`), or load the hosted build without a bundler:

```html
<script type="module" src="https://instantmap.org/instant-map.js"></script>

<instant-map center="-122.42,37.77" zoom="12" style="height:480px"></instant-map>

<script type="module">
  const map = document.querySelector("instant-map");
  map.markers = await fetch("/api/listings").then((response) => response.json());
  map.addEventListener("markerclick", (event) => (location.href = event.detail.marker.href));
</script>
```

Markers are `{ id, lng, lat, label, title, subtitle, href }`. A marker with a `label` shows as a price pill; one without shows as a dot.

## React and Next.js

```tsx
import { InstantMap } from "instantmap/react";

export function ListingsMap({ listings }) {
  return <InstantMap center={[-122.42, 37.77]} zoom={12} markers={listings} style={{ height: 480 }} />;
}
```

The component renders the first image on the server, so the map paints with the HTML.

## Server-rendered first image anywhere

```ts
import { staticUrl } from "instantmap/server";

const src = staticUrl({ center: [-122.42, 37.77], zoom: 12, width: 960, height: 480, markers });
// Put <img src={src}> inside <instant-map>.
```

## Docs

- Quick start, API reference and framework guides: [instantmap.org/docs](https://instantmap.org/docs/start/quick-start/)
- For AI agents: [instantmap.org/llms.txt](https://instantmap.org/llms.txt)

Map data © OpenStreetMap contributors. MIT licensed.
