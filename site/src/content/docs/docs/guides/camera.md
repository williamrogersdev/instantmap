---
title: Camera, animation and events
description: Move the map from code, fit results, and react to what people do.
sidebar:
  order: 4
---

## Moving the map

```js
map.setCamera({ center: [2.3522, 48.8566], zoom: 12 });          // jump
await map.flyTo({ center: [-0.1276, 51.5072], zoom: 11 });       // animate (zooms out for long trips)
await map.fitBounds(map.markers, { padding: 64, maxZoom: 15 });  // show every marker
await map.fitBounds([-74.05, 40.68, -73.9, 40.82]);              // [west, south, east, north]
```

The animations follow `prefers-reduced-motion`: they jump instead.

## Reading the view

```js
map.camera;  // { center: [lng, lat], zoom }
map.bounds;  // [west, south, east, north]
map.project(-0.1276, 51.5072);  // [x, y] in CSS pixels, relative to the element
map.unproject(200, 120);        // [lng, lat]
```

## Events

```js
map.addEventListener("moveend", ({ detail }) => {
  history.replaceState(null, "", `?at=${detail.center.map((n) => n.toFixed(4)).join(",")}&z=${detail.zoom.toFixed(1)}`);
});
```

| Event | When |
| --- | --- |
| `move` | Every frame while the view changes. Keep the handler cheap. |
| `moveend` | The view has settled after a drag, fling, zoom or animation. Fetch data here. |
| `markerclick` / `clusterclick` | A tap or click on a marker or cluster. Both are cancelable. |
| `markerenter` / `markerleave` | The pointer crosses a marker. |
| `select` | The selection changed, from a click, `select()`, or the popup closing. |
| `interactive` | The live map has taken over from the image. |
| `idle` | Everything in view has loaded. Good for screenshots and tests. |

## Gestures

| Input | Result |
| --- | --- |
| Drag, then release with speed | Pans, then glides to a stop |
| Mouse wheel | Zooms smoothly around the pointer. In `cooperative` mode it needs ⌘/Ctrl until the visitor has clicked or dragged the map. |
| Trackpad pinch | Zooms around the pointer |
| Touch: two-finger pinch | Zooms and pans |
| Touch: one finger, vertical | Scrolls the page until the visitor taps the map. After that the map takes every gesture. |
| Double-click | Zooms in one level, animated |
| Arrow keys, `+`, `-` | Pan and zoom when the map has focus |

Set `scroll-zoom="always"` on full-screen maps, where the page has nothing to scroll.
