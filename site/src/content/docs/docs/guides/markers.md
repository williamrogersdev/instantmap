---
title: Markers and clusters
description: Feed the map your data, keep it in sync, and control clustering.
sidebar:
  order: 1
---

## The shape

The map takes plain objects. Map your records to them once:

```ts
map.markers = stores.map((store) => ({
  id: store.id,            // unique, string or number
  lng: store.longitude,    // longitude first, always
  lat: store.latitude,
  label: store.openNow ? "Open" : undefined, // a short pill label, or nothing for a dot
  title: store.name,
  subtitle: store.address,
  href: `/stores/${store.slug}`,
  data: store,             // the original record, typed through Marker<Store>
}));
```

| Field | Drawn as |
| --- | --- |
| `label` set | A pill with the text, for example `$420`, `4.8★`, `Open` or `12 min`. Ten characters at most. |
| no `label` | A dot in the theme's `accent` colour. |
| several markers close together | A cluster bubble showing the count. Clicking it zooms in. |

## Updating

Assign a new array. The map re-clusters (fast enough for tens of thousands of markers) and redraws on the next frame:

```js
map.markers = map.markers.filter((marker) => marker.data.price < maxPrice);
```

Changing the array keeps the camera, the open popup (if its marker is still there) and the selection.

## Clustering

```html
<instant-map cluster="60"></instant-map>  <!-- merge more aggressively -->
<instant-map cluster="off"></instant-map> <!-- never merge -->
```

Clusters are computed in world space at each whole zoom level. Panning never regroups them, and the first image the server renders has exactly the groups the live map draws. Pills and bubbles that would touch merge too, so markers never overlap.

Handle a cluster click yourself:

```js
map.addEventListener("clusterclick", (event) => {
  event.preventDefault();
  openSidebar(event.detail.cluster.markers);
});
```

## How many markers?

| Count | Notes |
| --- | --- |
| Up to 10,000 | Smooth on a mid-range phone. |
| 10,000–100,000 | Works. Clustering runs once per whole zoom level, so the first zoom-in pauses briefly. |
| More than 100,000 | Filter on the server first, by the visible bounds (`moveend` + `map.bounds`). |

The first image is unaffected by the count, because `staticUrl()` sends only the visible groups.
